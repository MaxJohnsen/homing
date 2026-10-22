// Zip files, written and read with Node's own zlib. A big space exports as many thousands of files,
// more than plain zip can count, and past 4 GB, so the zip ends with ZIP64's records when it needs
// them, which every common unzip tool reads. Compressing is native, and never holds up other
// requests for long: a big file is compressed off the main thread, and small ones a few hundred at
// a time. A zip is written to a file as it's made, never held whole in memory, and read from one
// the same way: only the files asked for, each within set limits, from a zip anyone could have made.

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { open, rm, type FileHandle } from 'node:fs/promises';
import { promisify } from 'node:util';
import { crc32, deflateRaw, deflateRawSync, inflateRawSync } from 'node:zlib';

const deflate = promisify(deflateRaw);

/** A zip being written to a file, one file at a time, with its list of files kept on disk beside it until the end. */
export class ZipWriter {
  readonly path: string;
  private readonly file: FileHandle;
  private readonly list: FileHandle;
  private readonly time: number;
  private readonly date: number;
  private offset = 0;
  private count = 0;
  private listed = 0;

  private constructor(path: string, file: FileHandle, list: FileHandle, time: number, date: number) {
    this.path = path;
    this.file = file;
    this.list = list;
    this.time = time;
    this.date = date;
  }

  /** A new zip at the path, for files dated at that moment. */
  static async create(path: string, at = new Date()): Promise<ZipWriter> {
    const file = await open(path, 'w');
    const list = await open(`${path}.list`, 'w+');
    const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
    const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
    return new ZipWriter(path, file, list, time, date);
  }

  /** How much is written so far. */
  get size(): number {
    return this.offset + this.listed;
  }

  /** Adds a file, compressed. */
  async add(path: string, content: string | Buffer): Promise<void> {
    if (++this.count % 500 === 0) await new Promise((resolve) => setImmediate(resolve));
    const name = Buffer.from(path);
    const data = typeof content === 'string' ? Buffer.from(content) : content;
    // A copy of its own, since zlib hands back a slice of a larger buffer, which would all stay in memory.
    const packed = data.length > 1024 * 1024 ? await deflate(data) : Buffer.from(deflateRawSync(data));
    const crc = crc32(data);
    await this.file.write(Buffer.concat([localHeader(name, crc, packed.length, data.length, this.time, this.date), name, packed]));
    const entry = directoryEntry(name, crc, packed.length, data.length, this.offset, this.time, this.date);
    await this.list.write(entry);
    this.listed += entry.length;
    this.offset += 30 + name.length + packed.length;
  }

  /** Finishes the zip, with its list of files and its end records, and says how large it is. */
  async end(): Promise<number> {
    // The list of files, copied from beside the zip, a few megabytes at a time.
    const block = Buffer.alloc(4 * 1024 * 1024);
    for (let at = 0; at < this.listed; ) {
      const { bytesRead } = await this.list.read(block, 0, Math.min(block.length, this.listed - at), at);
      if (bytesRead === 0) break;
      await this.file.write(block.subarray(0, bytesRead));
      at += bytesRead;
    }
    const ends = endRecords(this.count, this.listed, this.offset);
    await this.file.write(ends);
    await this.close();
    return this.offset + this.listed + ends.length;
  }

  /** Stops, and leaves nothing behind. */
  async abort(): Promise<void> {
    await this.close().catch(() => {});
    await rm(this.path, { force: true });
  }

  private async close() {
    await this.file.close();
    await this.list.close();
    await rm(`${this.path}.list`, { force: true });
  }
}

/** The files, by their paths, as one zip in memory, for small ones. */
export async function zip(files: Iterable<[string, string]>, at = new Date()): Promise<Buffer> {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
  const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for (const [path, text] of files) {
    if (++count % 500 === 0) await new Promise((resolve) => setImmediate(resolve));
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const packed = data.length > 1024 * 1024 ? await deflate(data) : Buffer.from(deflateRawSync(data));
    const crc = crc32(data);
    parts.push(localHeader(name, crc, packed.length, data.length, time, date), name, packed);
    directory.push(directoryEntry(name, crc, packed.length, data.length, offset, time, date));
    offset += 30 + name.length + packed.length;
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0);
  return Buffer.concat([...parts, ...directory, endRecords(count, size, offset)]);
}

/** A file's own header: version 2.0, its name in UTF-8, deflated. */
function localHeader(name: Buffer, crc: number, packed: number, size: number, time: number, date: number): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(name.length, 26);
  return local;
}

/** A file's entry in the list at the end, made on Unix, as a file anyone can read. Past 4 GB, where it starts is in ZIP64's extra field. */
function directoryEntry(name: Buffer, crc: number, packed: number, size: number, offset: number, time: number, date: number): Buffer {
  const far = offset >= 0xffffffff;
  const entry = Buffer.alloc(46 + name.length + (far ? 12 : 0));
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE((3 << 8) | 45, 4);
  entry.writeUInt16LE(far ? 45 : 20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(time, 12);
  entry.writeUInt16LE(date, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed, 20);
  entry.writeUInt32LE(size, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt16LE(far ? 12 : 0, 30);
  entry.writeUInt32LE(0o100644 * 0x10000, 38);
  entry.writeUInt32LE(far ? 0xffffffff : offset, 42);
  name.copy(entry, 46);
  if (far) {
    entry.writeUInt16LE(0x0001, 46 + name.length);
    entry.writeUInt16LE(8, 48 + name.length);
    entry.writeBigUInt64LE(BigInt(offset), 50 + name.length);
  }
  return entry;
}

/** The end of a zip, with ZIP64's end record and its locator first when there are too many files, or too much, for plain zip. */
function endRecords(count: number, size: number, offset: number): Buffer {
  const ends: Buffer[] = [];
  if (count > 0xffff || size >= 0xffffffff || offset >= 0xffffffff) {
    const end64 = Buffer.alloc(56);
    end64.writeUInt32LE(0x06064b50, 0);
    end64.writeBigUInt64LE(44n, 4);
    end64.writeUInt16LE(45, 12);
    end64.writeUInt16LE(45, 14);
    end64.writeBigUInt64LE(BigInt(count), 24);
    end64.writeBigUInt64LE(BigInt(count), 32);
    end64.writeBigUInt64LE(BigInt(size), 40);
    end64.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + size), 8);
    locator.writeUInt32LE(1, 16);
    ends.push(end64, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(count, 0xffff), 8);
  end.writeUInt16LE(Math.min(count, 0xffff), 10);
  end.writeUInt32LE(Math.min(size, 0xffffffff), 12);
  end.writeUInt32LE(Math.min(offset, 0xffffffff), 16);
  ends.push(end);
  return Buffer.concat(ends);
}

/** A zip Homing won't read, and why. */
export class ZipRefused extends Error {
  reason: 'not a zip' | 'too many files' | 'missing' | 'too large' | 'damaged';

  constructor(reason: ZipRefused['reason']) {
    super(`zip: ${reason}`);
    this.reason = reason;
  }
}

/** Where a zip's bytes come from: a file, or memory. */
interface Bytes {
  size: number;
  read(at: number, length: number): Buffer;
  close(): void;
}

/** A file in a zip, as its entry in the list says. */
export interface ZipEntry {
  method: number;
  crc: number;
  packed: number;
  size: number;
  local: number;
}

/**
 * A zip anyone could have made, read from a file or from memory: its list, kept only for the files
 * wanted, and then each of those, within limits. Anything its records say that points outside it,
 * or doesn't add up, is damage.
 */
export class ZipReader {
  private readonly bytes: Bytes;
  /** The wanted files, by name. */
  readonly entries: Map<string, ZipEntry>;

  private constructor(bytes: Bytes, entries: Map<string, ZipEntry>) {
    this.bytes = bytes;
    this.entries = entries;
  }

  /** How large the zip is. */
  get size(): number {
    return this.bytes.size;
  }

  /** A zip in a file, keeping the entries of the files wanted, as long as it lists at most so many files. */
  static file(path: string, want: (name: string) => boolean, limits: { files: number }): ZipReader {
    const fd = openSync(path, 'r');
    try {
      const bytes: Bytes = {
        size: fstatSync(fd).size,
        read(at, length) {
          if (at < 0 || length < 0 || at + length > this.size) throw new ZipRefused('damaged');
          const buffer = Buffer.alloc(length);
          for (let done = 0; done < length; ) {
            const n = readSync(fd, buffer, done, length - done, at + done);
            if (n === 0) throw new ZipRefused('damaged');
            done += n;
          }
          return buffer;
        },
        close: () => closeSync(fd),
      };
      return new ZipReader(bytes, listOf(bytes, want, limits));
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }

  /** A zip in memory. */
  static memory(zip: Buffer, want: (name: string) => boolean, limits: { files: number }): ZipReader {
    const bytes: Bytes = {
      size: zip.length,
      read(at, length) {
        if (at < 0 || length < 0 || at + length > zip.length) throw new ZipRefused('damaged');
        return zip.subarray(at, at + length);
      },
      close() {},
    };
    return new ZipReader(bytes, listOf(bytes, want, limits));
  }

  /** One of the wanted files, unpacked, as long as it's at most so large. */
  read(name: string, limit: number): Buffer {
    const found = this.entries.get(name);
    if (!found) throw new ZipRefused('missing');
    if (found.size > limit) throw new ZipRefused('too large');
    // What it takes up in the zip is bounded too, before any of it is read: stored, it's what it
    // holds, and deflated, never much more than the most it may hold.
    if (found.method === 0 ? found.packed !== found.size : found.method !== 8) throw new ZipRefused('damaged');
    if (found.packed > limit + Math.floor(limit / 1000) + 1024) throw new ZipRefused('too large');
    try {
      const local = this.bytes.read(found.local, 30);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new ZipRefused('damaged');
      const start = found.local + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const data = this.bytes.read(start, found.packed);
      let file: Buffer;
      if (found.method === 0) file = data;
      else {
        try {
          // However large it says it is, it's never unpacked past the limit.
          file = inflateRawSync(data, { maxOutputLength: Math.max(limit, 1) });
        } catch (error) {
          throw new ZipRefused(error instanceof RangeError ? 'too large' : 'damaged');
        }
      }
      if (file.length !== found.size || crc32(file) !== found.crc) throw new ZipRefused('damaged');
      return file;
    } catch (error) {
      if (error instanceof ZipRefused) throw error;
      throw new ZipRefused('damaged');
    }
  }

  close(): void {
    this.bytes.close();
  }
}

/** The zip's list of files, read a few megabytes at a time, keeping the entries of those wanted. */
function listOf(bytes: Bytes, want: (name: string) => boolean, limits: { files: number }): Map<string, ZipEntry> {
  try {
    if (bytes.size < 22) throw new ZipRefused('not a zip');
    // The end record is in the last 64 KB or so, after any comment.
    const tail = Math.min(bytes.size, 22 + 0xffff + 20);
    const last = bytes.read(bytes.size - tail, tail);
    let end = -1;
    for (let at = last.length - 22; at >= 0; at--) {
      if (last.readUInt32LE(at) === 0x06054b50) {
        end = at;
        break;
      }
    }
    if (end < 0) throw new ZipRefused('not a zip');
    let count = last.readUInt16LE(end + 10);
    let size = last.readUInt32LE(end + 12);
    let offset = last.readUInt32LE(end + 16);
    if ((count === 0xffff || size === 0xffffffff || offset === 0xffffffff) && end >= 20 && last.readUInt32LE(end - 20) === 0x07064b50) {
      const end64 = bytes.read(Number(last.readBigUInt64LE(end - 12)), 56);
      if (end64.readUInt32LE(0) !== 0x06064b50) throw new ZipRefused('damaged');
      count = Number(end64.readBigUInt64LE(32));
      size = Number(end64.readBigUInt64LE(40));
      offset = Number(end64.readBigUInt64LE(48));
    }
    if (count > limits.files) throw new ZipRefused('too many files');
    if (offset + size > bytes.size) throw new ZipRefused('damaged');

    const entries = new Map<string, ZipEntry>();
    let carry: Buffer = Buffer.alloc(0);
    let read = 0;
    // Enough of the list in hand for the next entry, with its name and extra field.
    const need = (length: number) => {
      while (carry.length < length) {
        if (read >= size) throw new ZipRefused('damaged');
        const more = bytes.read(offset + read, Math.min(4 * 1024 * 1024, size - read));
        read += more.length;
        carry = carry.length ? Buffer.concat([carry, more]) : more;
      }
    };
    for (let n = 0; n < count; n++) {
      need(46);
      if (carry.readUInt32LE(0) !== 0x02014b50) throw new ZipRefused('damaged');
      const nameLength = carry.readUInt16LE(28);
      const extraLength = carry.readUInt16LE(30);
      const length = 46 + nameLength + extraLength + carry.readUInt16LE(32);
      need(length);
      const name = carry.subarray(46, 46 + nameLength).toString();
      if (want(name)) {
        if (entries.has(name)) throw new ZipRefused('damaged');
        const entry = { method: carry.readUInt16LE(10), crc: carry.readUInt32LE(16), packed: carry.readUInt32LE(20), size: carry.readUInt32LE(24), local: carry.readUInt32LE(42) };
        // Past 4 GB, the sizes and where it starts are in ZIP64's extra field, in that order.
        if (entry.size === 0xffffffff || entry.packed === 0xffffffff || entry.local === 0xffffffff) {
          const extra = carry.subarray(46 + nameLength, 46 + nameLength + extraLength);
          let found = false;
          for (let at = 0; at + 4 <= extra.length; at += 4 + extra.readUInt16LE(at + 2)) {
            if (extra.readUInt16LE(at) !== 0x0001) continue;
            let field = at + 4;
            const next = () => {
              if (field + 8 > at + 4 + extra.readUInt16LE(at + 2)) throw new ZipRefused('damaged');
              const value = Number(extra.readBigUInt64LE(field));
              field += 8;
              return value;
            };
            if (entry.size === 0xffffffff) entry.size = next();
            if (entry.packed === 0xffffffff) entry.packed = next();
            if (entry.local === 0xffffffff) entry.local = next();
            found = true;
          }
          if (!found) throw new ZipRefused('damaged');
        }
        entries.set(name, entry);
      }
      carry = carry.subarray(length);
    }
    return entries;
  } catch (error) {
    if (error instanceof ZipRefused) throw error;
    // Reading past the end, wherever the records pointed.
    throw new ZipRefused('damaged');
  }
}

/**
 * One file from a zip in memory, by its name, as long as the zip lists at most so many files and
 * the file is at most so large once unpacked. Nothing else in the zip is unpacked.
 */
export function fileIn(zip: Buffer, name: string, limits: { files: number; size: number }): Buffer {
  return ZipReader.memory(zip, (candidate) => candidate === name, limits).read(name, limits.size);
}
