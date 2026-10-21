// Importing a space (spec §3, guarantee 10), whatever its size. An export comes back as a new
// space of its own, with the spaces that came with it below it, and only the person importing has
// them until they add people the usual way. What the export shared goes on the new space's shared
// side, and what was private becomes theirs. Everything gets a new id, and references between
// things follow. Nobody here is credited with any of it: who wrote it comes along as imported
// provenance, by name.
//
// The zip arrives as a file on disk, never in memory, and is read in a worker of its own with
// limited memory, a file of the export at a time (bundle.ts). It's read through once to show the
// person what it would bring, rules word for word, and the import is then of exactly that file.
// Importing creates the spaces first, hidden, in a moment, then fills them a batch at a time
// without holding up anyone else, and shows them only once everything is in. If anything fails, or
// Homing stops on the way, what it put in is taken out again.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import postgres from 'postgres';
import { ImportRefused, importLimits, sizeRefusals, tooLarge } from './bundle.ts';
import { withPrincipal, type Session, type Sql } from './db.ts';
import { placeSpace } from './spaces.ts';

export { ImportRefused, importLimits };

/** Where uploads and exports are kept on disk while they're used. */
export const workFolder = join(tmpdir(), 'homing');

/**
 * The most a worker reading an export may hold, and how long it may take over one file of it. An
 * export Homing makes is checked with less, so it always imports.
 */
const worker = { memory: 768, check: 640, time: 60_000 };
const tooSlow = 'That export took too long to read, so Homing stopped. Try again.';

/** How long an upload may take to arrive, and how long one waits to be imported after its preview. */
const uploadTime = 30 * 60_000;
const keptFor = 60 * 60_000;

/** How large an export is, as a zip, before Homing updates what it knows about its tables after importing it. */
const settleAfter = 8 * 1024 * 1024;

/** An export someone sent, on disk, with its fingerprint. */
export interface Upload {
  path: string;
  hash: string;
  size: number;
}

/**
 * Receives an upload onto disk, with its fingerprint, or says why not: it's larger than the
 * limit, it didn't all arrive in time, or the sender went away. Nothing of it is kept then.
 */
export async function receive(req: IncomingMessage): Promise<Upload | 'too large' | 'too slow' | 'gone'> {
  if (Number(req.headers['content-length'] ?? 0) > importLimits.upload) return 'too large';
  await mkdir(workFolder, { recursive: true });
  const path = join(workFolder, `homing-import-${randomUUID()}.zip`);
  const file = createWriteStream(path);
  const hash = createHash('sha256');
  let size = 0;
  const outcome = await new Promise<'done' | 'too large' | 'too slow' | 'gone'>((resolve) => {
    const stop = (why: 'done' | 'too large' | 'too slow' | 'gone') => {
      clearTimeout(timer);
      req.off('data', data).off('end', end).off('error', gone);
      if (why !== 'done') req.pause();
      resolve(why);
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > importLimits.upload) return stop('too large');
      hash.update(chunk);
      // Waits for the disk, so the upload is never held in memory.
      if (!file.write(chunk)) {
        req.pause();
        file.once('drain', () => req.resume());
      }
    };
    const end = () => stop('done');
    const gone = () => stop('gone');
    const timer = setTimeout(() => stop('too slow'), uploadTime);
    req.on('data', data).once('end', end).once('error', gone);
  });
  await new Promise((resolve) => file.end(resolve));
  if (outcome !== 'done') {
    await rm(path, { force: true });
    return outcome;
  }
  return { path, hash: hash.digest('hex'), size };
}

/** What someone previewed, kept until they import it, choose another, or after an hour. */
interface Pending extends Upload {
  inside: string[];
  until: number;
}

const pending = new Map<string, Pending>();

/** How far along someone's preview or import is, for the app to show. */
export type Progress =
  | { state: 'reading' | 'importing'; done: number; total: number }
  | { state: 'done'; id: string }
  | { state: 'failed'; message: string };

const progress = new Map<string, Progress>();

/** How far along the person's preview or import is, if they have one. */
export function progressOf(person: string): Progress | undefined {
  return progress.get(person);
}

type Message = { type: string } & Record<string, unknown>;

/** Runs the worker that reads an export, answering each message it sends, and gives up on one that goes quiet. */
function inWorker(task: object, answer: (message: Message, reply: () => void) => Promise<boolean>, memory = worker.memory): Promise<void> {
  return new Promise((resolve, reject) => {
    const reading = new Worker(new URL('./import-worker.ts', import.meta.url), {
      workerData: task,
      resourceLimits: { maxOldGenerationSizeMb: memory },
      // It needs nothing from Homing's settings.
      env: {},
    });
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void reading.terminate();
      if (error) reject(error);
      else resolve();
    };
    // Each file of the export is read within a minute, or Homing stops.
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(new ImportRefused(tooSlow)), worker.time);
    };
    wait();
    reading.on('message', (message: Message) => {
      if (message.type === 'refused') return settle(new ImportRefused(message.message as string));
      // Writing a part has a minute of its own, from when the worker hands it over.
      clearTimeout(timer);
      answer(message, () => {
        wait();
        reading.postMessage({ ok: true });
      }).then((finished) => {
        if (finished) settle();
        else if (message.type === 'progress') wait();
      }, (error: Error) => settle(error));
    });
    reading.once('error', (error: Error & { code?: string }) => settle(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? new ImportRefused(tooLarge) : error));
    reading.once('exit', () => settle(new Error('The worker reading an export stopped without an answer.')));
  });
}

/**
 * Reads an upload through and keeps it for the person to import, with what importing it would
 * bring, as the JSON the app gets. Nothing is created. A preview before it is forgotten.
 */
export async function preview(person: string, upload: Upload): Promise<string> {
  forget(person);
  progress.set(person, { state: 'reading', done: 0, total: 1 });
  let json = '';
  try {
    await inWorker({ path: upload.path, hash: upload.hash }, async (message) => {
      if (message.type === 'progress') {
        progress.set(person, { state: 'reading', done: message.done as number, total: message.total as number });
        return false;
      }
      json = message.preview as string;
      pending.set(person, { ...upload, inside: message.inside as string[], until: Date.now() + keptFor });
      return true;
    });
    return json;
  } catch (error) {
    await rm(upload.path, { force: true });
    throw error;
  } finally {
    progress.delete(person);
  }
}

let checking: Promise<unknown> = Promise.resolve();

/**
 * Reads an export Homing just made as an import would, with a little less memory than an import
 * has, so it's handed out only when it imports again. Says 'too large' when it holds more than an
 * import takes, and throws for anything else that would keep it from importing. One at a time.
 */
export async function importsAgain(path: string): Promise<'too large' | undefined> {
  const turn = checking.then(() => inWorker({ path, hash: '' }, async (message) => message.type === 'preview', worker.check));
  checking = turn.catch(() => {});
  try {
    await turn;
    return undefined;
  } catch (error) {
    if (error instanceof ImportRefused && (sizeRefusals.has(error.message) || error.message === tooSlow)) return 'too large';
    throw error;
  }
}

/** Forgets what the person previewed, and its file. */
function forget(person: string) {
  const kept = pending.get(person);
  if (!kept) return;
  pending.delete(person);
  void rm(kept.path, { force: true });
}

/** Whether the person still has what they previewed with this fingerprint, to import. */
export function previewed(person: string, hash: string): boolean {
  const kept = pending.get(person);
  return kept !== undefined && kept.hash === hash && kept.until > Date.now();
}

/**
 * Imports what the person previewed as a new space with the name given, and returns it once it
 * shows. Everything goes in, or none of it shows and what went in is taken out again.
 */
export async function importSpace(sql: Sql, person: string, hash: string, name: string): Promise<string> {
  const upload = pending.get(person);
  if (!upload || upload.hash !== hash) throw new ImportRefused('That isn’t the export you looked at. Choose it again to see what it brings.');
  pending.delete(person);
  progress.set(person, { state: 'importing', done: 0, total: 1 });
  const as = <T>(fn: (s: Session) => Promise<T>) => withPrincipal(sql, { person, direct: true }, fn);
  let made: string | undefined;
  let space = '';
  try {
    await inWorker({ path: upload.path, key: randomBytes(32).toString('hex'), name, inside: upload.inside }, async (message, reply) => {
      switch (message.type) {
        case 'begin':
          // The spaces, made in a moment while creating spaces waits, and hidden until everything is in.
          made = await as(async (s) => {
            await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
            await placeSpace(s, { name, who: 'with others' });
            return (await written(s, () => s.tx<{ id: string }[]>`select import_begin(${message.payload as string}::text::jsonb) as id`))[0].id;
          });
          break;
        case 'batch':
          await as((s) => written(s, () => s.tx`select import_load(${made!}::uuid, ${message.payload as string}::text::jsonb)`));
          progress.set(person, { state: 'importing', done: message.done as number, total: message.total as number });
          break;
        case 'finish':
          // Shown, as long as nobody took the name meanwhile.
          space = await as(async (s) => {
            await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
            await placeSpace(s, { name, who: 'with others' });
            return (await written(s, () => s.tx<{ id: string }[]>`select import_finish(${made!}::uuid, ${message.payload as string}::text::jsonb) as id`))[0].id;
          });
          made = undefined;
          break;
        case 'done':
          return true;
      }
      reply();
      return false;
    });
    progress.set(person, { state: 'done', id: space });
    // After a big one, what's read next is planned for how much is there now.
    if (upload.size > settleAfter) await sql`select import_settle()`.catch((failure) => console.error('Settling an import:', failure));
    return space;
  } catch (error) {
    // Taken out before the person hears it failed, so nothing of it is left when they look.
    if (made) await as((s) => s.tx`select import_discard(${made!}::uuid)`).catch((failure) => console.error('Taking out an import that failed:', failure));
    progress.set(person, { state: 'failed', message: error instanceof ImportRefused || (error instanceof Error && error.name === 'SpaceRefused') ? error.message : 'Something went wrong, and Homing didn’t import any of it. Try again.' });
    throw error;
  } finally {
    await rm(upload.path, { force: true });
  }
}

/** Runs a write, turning what the store refuses into a refusal in words. */
async function written<T>(s: Session, query: () => Promise<T>): Promise<T> {
  try {
    // In a savepoint, so a refusal comes back as one.
    return (await s.tx.savepoint(() => query())) as T;
  } catch (error) {
    if (!(error instanceof postgres.PostgresError)) throw error;
    if (/^(23|22|42501|P0001)/.test(error.code)) throw new ImportRefused('That export doesn’t hold together, so Homing didn’t import any of it.');
    if (error.code === '57014') throw new ImportRefused('That export took too long to import, so Homing stopped and created nothing. Try again in a quiet moment.');
    if (error.code === '54000') throw new ImportRefused('Something in that export is larger than Homing can search, so Homing didn’t import any of it.');
    throw error;
  }
}

/**
 * Keeps imports tidy: takes out what imports put in that stopped without finishing, as when
 * Homing stopped on the way, once nothing has been written to them for a while, and removes
 * uploads and exports left on disk. Now, and every few minutes. Returns how to stop.
 */
export function keepTidy(sql: Sql): () => void {
  const sweep = async () => {
    try {
      await sql`select imports_discard_stale(interval '10 minutes')`;
      for (const [person, kept] of pending) if (kept.until <= Date.now()) forget(person);
      await mkdir(workFolder, { recursive: true });
      for (const name of await readdir(workFolder)) {
        const path = join(workFolder, name);
        const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: Date.now() }));
        if (Date.now() - mtimeMs > 2 * keptFor && ![...pending.values()].some((kept) => kept.path === path)) await rm(path, { force: true });
      }
    } catch (error) {
      console.error('Tidying up imports:', error);
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
