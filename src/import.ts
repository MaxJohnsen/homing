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
// Homing stops on the way, what it put in is taken out again, a step at a time.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import postgres from 'postgres';
import { ImportRefused, importLimits, sizeRefusals, tooLarge, type Hidden } from './bundle.ts';
import { withPrincipal, type Session, type Sql } from './db.ts';
import { placeSpace, SpaceRefused } from './spaces.ts';

export { ImportRefused, importLimits };

/** Where uploads and exports are kept on disk while they're used. */
export const workFolder = join(tmpdir(), 'homing');

/**
 * The most a worker reading an export may hold, and how long it may take over one file of it: to
 * import it, and to check an export Homing just made, with less of both, so what passes the check
 * imports here, and on a Homing a little slower.
 */
export const workerLimits = { import: { memory: 768, time: 60_000 }, check: { memory: 640, time: 40_000 } };
const tooSlow = 'That export took too long to read, so Homing stopped. Try again.';

/** How long an upload may take to arrive and wait its turn to be read, and how long one waits to be imported after its preview. */
export const uploadTime = 30 * 60_000;
const keptFor = 60 * 60_000;

/** How large an export is, as a zip, before Homing updates what it knows about its tables after importing it. */
const settleAfter = 8 * 1024 * 1024;

/** How many rows a step of taking out an import removes at most, each step a transaction of its own. */
const takeOutStep = 5000;

/** An export someone sent, on disk, with its fingerprint. */
export interface Upload {
  path: string;
  hash: string;
  size: number;
}

type Received = 'done' | 'too large' | 'too slow' | 'gone' | 'not kept';

/**
 * Receives an upload onto disk, in the folder given, with its fingerprint, or says why not: it's
 * larger than the limit, it didn't all arrive in time, the sender went away, or the disk couldn't
 * keep it. Nothing of it is kept then.
 */
export async function receive(req: IncomingMessage, folder = workFolder): Promise<Upload | Exclude<Received, 'done'>> {
  if (Number(req.headers['content-length'] ?? 0) > importLimits.upload) return 'too large';
  // Made if it isn't there yet. If it can't be, writing in it fails, and that's said below.
  await mkdir(folder, { recursive: true }).catch(() => {});
  const path = join(folder, `homing-import-${randomUUID()}.zip`);
  const file = createWriteStream(path);
  const closed = new Promise<void>((resolve) => file.once('close', () => resolve()));
  const hash = createHash('sha256');
  let size = 0;
  // A disk that fails, such as one that's full, stops the upload, whenever it does.
  let broken: Error | undefined;
  let stop: ((why: Received) => void) | undefined;
  file.on('error', (error) => {
    broken ??= error;
    stop?.('not kept');
  });
  const outcome = await new Promise<Received>((resolve) => {
    stop = (why) => {
      stop = undefined;
      clearTimeout(timer);
      req.off('data', data).off('end', end).off('error', gone);
      if (why !== 'done') req.pause();
      resolve(why);
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > importLimits.upload) return stop?.('too large');
      hash.update(chunk);
      // Waits for the disk, so the upload is never held in memory.
      if (!file.write(chunk)) {
        req.pause();
        file.once('drain', () => req.resume());
      }
    };
    const end = () => stop?.('done');
    const gone = () => stop?.('gone');
    const timer = setTimeout(() => stop?.('too slow'), uploadTime);
    req.on('data', data).once('end', end).once('error', gone);
  });
  if (outcome === 'done' && !broken) file.end();
  else file.destroy();
  await closed;
  if (outcome === 'done' && !broken) return { path, hash: hash.digest('hex'), size };
  if (broken) console.error('Keeping an upload on disk:', broken);
  await rm(path, { force: true }).catch(() => {});
  return broken ? 'not kept' : (outcome as Exclude<Received, 'done'>);
}

/** What someone previewed, kept until they import it, choose another, or after an hour. */
interface Pending extends Upload {
  inside: string[];
  until: number;
}

const pending = new Map<string, Pending>();

/** How far along someone's preview is, for the app to show: waiting its turn, or being read. */
export type PreviewProgress = { state: 'waiting' } | { state: 'reading'; done: number; total: number };

/** How far along someone's import is, under the name it was given, or how it ended. */
export type ImportProgress =
  | { state: 'importing'; name: string; done: number; total: number }
  | { state: 'done'; id: string }
  | { state: 'failed'; message: string };

/** Each person's preview and import, apart, so a preview in another tab never touches an import under way. */
const previewing = new Map<string, PreviewProgress>();
const importing = new Map<string, { progress: ImportProgress; at: number; read?: number }>();

/**
 * How long how an import ended is still said after it's first read, so another tab, or a request
 * sent again, hears it too, and how long at most, read or not.
 */
export const endKept = { afterRead: 2 * 60_000, atMost: 60 * 60_000 };

/** How far along the person's preview is, if they have one. */
export function previewProgressOf(person: string): PreviewProgress | undefined {
  return previewing.get(person);
}

/**
 * How far along the person's import is, if they have one. How it ended is said for a little while
 * after it's first read, and for at most an hour, so it doesn't show on every visit.
 */
export function importProgressOf(person: string): ImportProgress | undefined {
  const now = importing.get(person);
  if (!now || now.progress.state === 'importing') return now?.progress;
  now.read ??= Date.now();
  if (Date.now() - now.read <= endKept.afterRead && Date.now() - now.at <= endKept.atMost) return now.progress;
  importing.delete(person);
  return undefined;
}

function importProgress(person: string, progress: ImportProgress) {
  importing.set(person, { progress, at: Date.now() });
}

/**
 * Homing reads one export at a time on the whole instance, for a preview or an import, since
 * reading a big one takes a lot of memory. Whoever comes next waits their turn, first come first
 * served.
 */
let taken = false;
const turns: (() => void)[] = [];

/** The turn to read an export, now, or undefined when someone has it. Returns how to give it back. */
export function turnNow(): (() => void) | undefined {
  if (taken) return undefined;
  taken = true;
  return handBack();
}

/** How to give the turn back, once: to whoever waits next, or to nobody. */
function handBack(): () => void {
  let given = false;
  return () => {
    if (given) return;
    given = true;
    const next = turns.shift();
    if (next) next();
    else taken = false;
  };
}

/** Waits for the turn to read an export, saying the person waits, until it comes, the time is up, or they leave. */
function turnFor(person: string, until: number, left?: AbortSignal): Promise<(() => void) | undefined> {
  previewing.set(person, { state: 'waiting' });
  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      left?.removeEventListener('abort', leave);
    };
    const take = () => {
      stop();
      resolve(handBack());
    };
    const leave = () => {
      stop();
      const at = turns.indexOf(take);
      if (at >= 0) turns.splice(at, 1);
      resolve(undefined);
    };
    const timer = setTimeout(leave, Math.max(0, until - Date.now()));
    left?.addEventListener('abort', leave, { once: true });
    turns.push(take);
    if (left?.aborted) leave();
  });
}

type Message = { type: string } & Record<string, unknown>;

/** Runs the worker that reads an export, answering each message it sends, and gives up on one that goes quiet. */
function inWorker(task: object, answer: (message: Message, reply: () => void) => Promise<boolean>, limits = workerLimits.import): Promise<void> {
  return new Promise((resolve, reject) => {
    const reading = new Worker(new URL('./import-worker.ts', import.meta.url), {
      workerData: task,
      resourceLimits: { maxOldGenerationSizeMb: limits.memory },
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
    // Each file of the export is read in the time it has, or Homing stops.
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(new ImportRefused(tooSlow)), limits.time);
    };
    wait();
    reading.on('message', (message: Message) => {
      if (message.type === 'refused') return settle(new ImportRefused(message.message as string, undefined, message.hidden as Hidden | undefined));
      // Writing a part has as long again of its own, from when the worker hands it over.
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
    // Its last messages can arrive in the same turn as its exit, before what they started has settled, so a turn later.
    reading.once('exit', () => setImmediate(() => settle(new Error('The worker reading an export stopped without an answer.'))));
  });
}

/**
 * Reads an upload through and keeps it for the person to import, with what importing it would
 * bring, as the JSON the app gets. Nothing is created. A preview before it is forgotten. It waits
 * its turn, saying so, and when that doesn't come before the time given, or the person leaves,
 * says undefined, and the upload goes.
 */
export async function preview(person: string, upload: Upload, until = Date.now() + uploadTime, left?: AbortSignal): Promise<string | undefined> {
  forget(person);
  const giveBack = turnNow() ?? (await turnFor(person, until, left));
  if (!giveBack) {
    previewing.delete(person);
    await rm(upload.path, { force: true });
    return undefined;
  }
  previewing.set(person, { state: 'reading', done: 0, total: 1 });
  let json = '';
  try {
    await inWorker({ path: upload.path, hash: upload.hash }, async (message) => {
      if (message.type === 'progress') {
        previewing.set(person, { state: 'reading', done: message.done as number, total: message.total as number });
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
    giveBack();
    previewing.delete(person);
  }
}

let checking: Promise<unknown> = Promise.resolve();

/**
 * Reads an export Homing just made as an import would, with less memory and time than an import
 * has, so it's handed out only when it imports again. Says 'too large' when it holds more than an
 * import takes, 'too slow' when reading it took longer than the check allows, which says nothing
 * of its size, and throws for anything else that would keep it from importing. One at a time.
 */
export async function importsAgain(path: string): Promise<'too large' | 'too slow' | undefined> {
  const turn = checking.then(() => inWorker({ path, hash: '' }, async (message) => message.type === 'preview', workerLimits.check));
  checking = turn.catch(() => {});
  try {
    await turn;
    return undefined;
  } catch (error) {
    if (error instanceof ImportRefused && sizeRefusals.has(error.message)) return 'too large';
    if (error instanceof ImportRefused && error.message === tooSlow) return 'too slow';
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
  importProgress(person, { state: 'importing', name, done: 0, total: 1 });
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
          importProgress(person, { state: 'importing', name, done: message.done as number, total: message.total as number });
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
    importProgress(person, { state: 'done', id: space });
    // After a big one, what's read next is planned for how much is there now.
    if (upload.size > settleAfter) await sql`select import_settle()`.catch((failure) => console.error('Settling an import:', failure));
    return space;
  } catch (error) {
    // Taken out before the person hears it failed, so nothing of it is left when they look.
    if (made) await discard(sql, person, made).catch((failure) => console.error('Taking out an import that failed:', failure));
    importProgress(person, { state: 'failed', message: error instanceof ImportRefused || error instanceof SpaceRefused ? error.message : 'Something went wrong, and Homing didn’t import any of it. Try again.' });
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
 * Takes out what the person's import put in, as when it fails, a step at a time, each step a
 * transaction of its own, so however big it is, no step comes near the database's limit for a
 * statement.
 */
export async function discard(sql: Sql, person: string, made: string, step = takeOutStep): Promise<void> {
  for (;;) {
    const [{ done }] = await withPrincipal(sql, { person, direct: true }, (s) => s.tx<{ done: boolean }[]>`select import_discard(${made}::uuid, ${step}) as done`);
    if (done) return;
  }
}

/**
 * Takes out the imports that stopped on the way, as when Homing stopped during one, once nothing
 * has written to them for 10 minutes: one at a time, and each a step at a time, as `discard` does.
 * One that can't be taken out now is left for the next time, after the others. Returns how many
 * were.
 */
export async function discardStale(sql: Sql, step = takeOutStep): Promise<number> {
  let n = 0;
  for (const { id } of await sql<{ id: string }[]>`select imports_stale() as id`) {
    try {
      for (;;) {
        const [{ done }] = await sql<{ done: boolean }[]>`select import_discard_stale(${id}::uuid, ${step}) as done`;
        if (done) break;
      }
      n++;
    } catch (error) {
      console.error('Taking out an import that stopped on the way:', error);
    }
  }
  return n;
}

/**
 * Keeps imports tidy: takes out what imports put in that stopped without finishing, as when
 * Homing stopped on the way, once nothing has been written to them for a while, and removes
 * uploads and exports left on disk. It also forgets uses of connections older than 90 days. Now,
 * and every few minutes. Returns how to stop.
 */
export function keepTidy(sql: Sql): () => void {
  let sweeping = false;
  const sweep = async () => {
    // A sweep of a big import can take a while, and the next waits until it's done.
    if (sweeping) return;
    sweeping = true;
    // Uses of connections are kept for 90 days, whatever else happens here.
    try {
      await sql`select forget_old_uses()`;
    } catch (error) {
      console.error('Forgetting old uses of connections:', error);
    }
    try {
      await discardStale(sql);
      for (const [person, kept] of pending) if (kept.until <= Date.now()) forget(person);
      await mkdir(workFolder, { recursive: true });
      for (const name of await readdir(workFolder)) {
        const path = join(workFolder, name);
        const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: Date.now() }));
        if (Date.now() - mtimeMs > 2 * keptFor && ![...pending.values()].some((kept) => kept.path === path)) await rm(path, { force: true });
      }
    } catch (error) {
      console.error('Tidying up imports:', error);
    } finally {
      sweeping = false;
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
