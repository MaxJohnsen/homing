// Zip files, written and read with Node's own zlib. A big space exports as tens of thousands of
// files, more than plain zip can count, so past 65,535 files the zip ends with ZIP64's records,
// which every common unzip tool reads. Compressing is native, and never holds up other requests for
// long: a big file is compressed off the main thread, and small ones a few hundred at a time.
// Reading takes out one file, from a zip anyone could have made, within set limits.

import { promisify } from 'node:util';
import { crc32, deflateRaw, deflateRawSync, inflateRawSync } from 'node:zlib';

const deflate = promisify(deflateRaw);

/** The files, by their paths, as one zip. A zip over 4 GB isn't made. */
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
    // A copy of its own, since zlib hands back a slice of a larger buffer, which would all stay in memory.
    const packed = data.length > 1024 * 1024 ? await deflate(data) : Buffer.from(deflateRawSync(data));
    const crc = crc32(data);
    if (offset + 30 + name.length + packed.length > 0xffffffff) throw new Error('That’s too much for one zip.');

    // Version 2.0, names in UTF-8, deflated.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);

    // Made on Unix, as a file anyone can read.
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 45, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0o100644 * 0x10000, 38);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    offset += 30 + name.length + packed.length;
  }

  const size = directory.reduce((sum, part) => sum + part.length, 0);
  const ends: Buffer[] = [];
  if (count > 0xffff) {
    // ZIP64's end record and its locator, which say how many files there are.
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
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, ...ends, end]);
}

/** A zip Homing won't read, and why. */
export class ZipRefused extends Error {
  reason: 'not a zip' | 'too many files' | 'missing' | 'too large' | 'damaged';

  constructor(reason: ZipRefused['reason']) {
    super(`zip: ${reason}`);
    this.reason = reason;
  }
}

/**
 * One file from a zip, by its name, as long as the zip lists at most so many files and the file
 * is at most so large once unpacked. Nothing else in the zip is unpacked.
 */
export function fileIn(zip: Buffer, name: string, limits: { files: number; size: number }): Buffer {
  const { method, crc, packed, size, start } = entryIn(zip, name, limits);
  const data = zip.subarray(start, start + packed);
  let file: Buffer;
  if (method === 0) file = data;
  else if (method === 8) {
    try {
      // However large it says it is, it's never unpacked past the limit.
      file = inflateRawSync(data, { maxOutputLength: limits.size });
    } catch (error) {
      throw new ZipRefused(error instanceof RangeError ? 'too large' : 'damaged');
    }
  } else throw new ZipRefused('damaged');
  if (file.length !== size || crc32(file) !== crc) throw new ZipRefused('damaged');
  return file;
}

/** Where a file is in a zip, as its records say. Anything they say that points outside the zip is damage. */
function entryIn(zip: Buffer, name: string, limits: { files: number; size: number }) {
  try {
    // The end record is in the last 64 KB or so, after any comment.
    let end = -1;
    for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
      if (zip.readUInt32LE(at) === 0x06054b50) {
        end = at;
        break;
      }
    }
    if (end < 0) throw new ZipRefused('not a zip');
    let count = zip.readUInt16LE(end + 10);
    let offset = zip.readUInt32LE(end + 16);
    if ((count === 0xffff || offset === 0xffffffff) && end >= 20 && zip.readUInt32LE(end - 20) === 0x07064b50) {
      const end64 = Number(zip.readBigUInt64LE(end - 12));
      if (zip.readUInt32LE(end64) !== 0x06064b50) throw new ZipRefused('damaged');
      count = Number(zip.readBigUInt64LE(end64 + 32));
      offset = Number(zip.readBigUInt64LE(end64 + 48));
    }
    if (count > limits.files) throw new ZipRefused('too many files');

    let found: { method: number; crc: number; packed: number; size: number; local: number } | undefined;
    for (let n = 0, at = offset; n < count; n++) {
      if (zip.readUInt32LE(at) !== 0x02014b50) throw new ZipRefused('damaged');
      const nameLength = zip.readUInt16LE(at + 28);
      if (at + 46 + nameLength > zip.length) throw new ZipRefused('damaged');
      if (zip.subarray(at + 46, at + 46 + nameLength).toString() === name) {
        if (found) throw new ZipRefused('damaged');
        found = { method: zip.readUInt16LE(at + 10), crc: zip.readUInt32LE(at + 16), packed: zip.readUInt32LE(at + 20), size: zip.readUInt32LE(at + 24), local: zip.readUInt32LE(at + 42) };
      }
      at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    }
    if (!found) throw new ZipRefused('missing');
    if (found.size > limits.size) throw new ZipRefused('too large');
    if (zip.readUInt32LE(found.local) !== 0x04034b50) throw new ZipRefused('damaged');
    const start = found.local + 30 + zip.readUInt16LE(found.local + 26) + zip.readUInt16LE(found.local + 28);
    if (start + found.packed > zip.length) throw new ZipRefused('damaged');
    return { ...found, start };
  } catch (error) {
    if (error instanceof ZipRefused) throw error;
    // Reading past the end, wherever the records pointed.
    throw new ZipRefused('damaged');
  }
}
