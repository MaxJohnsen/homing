// Importing a space (spec §3, guarantee 10). An export comes back as a new space of its own, with
// the spaces that came with it below it, and only the person importing has them until they add
// people the usual way. What the export shared goes on the new space's shared side, and what was
// private becomes theirs. Everything gets a new id, and references between things follow. Nobody
// here is credited with any of it: who wrote it comes along as imported provenance, by name.
//
// An export is untrusted. Homing reads only its homing.json, in a worker of its own with limited
// memory and time, checks every part of it (bundle.ts), and shows the person what it would bring,
// rules word for word, before anything is created. The import is then of exactly that file.

import { Worker } from 'node:worker_threads';
import postgres from 'postgres';
import { ImportRefused, importLimits, tooLarge } from './bundle.ts';
import type { Session } from './db.ts';
import { placeSpace } from './spaces.ts';

export { ImportRefused, importLimits };

/** The most a worker reading an export may hold, and how long it may take. */
const worker = { memory: 768, time: 60_000 };

/** Reads an export in a worker of its own: what it would bring, or, under a name, what Homing writes for it. */
function inWorker<T>(task: { zip: Buffer; name?: string; hash?: string }): Promise<T> {
  return new Promise((resolve, reject) => {
    const reading = new Worker(new URL('./import-worker.ts', import.meta.url), {
      workerData: task,
      resourceLimits: { maxOldGenerationSizeMb: worker.memory },
      // It needs nothing from Homing's settings.
      env: {},
    });
    const timer = setTimeout(() => {
      void reading.terminate();
      reject(new ImportRefused('That export took too long to read, so Homing stopped. Try again, or export less of it at a time.'));
    }, worker.time);
    reading.once('message', (answer: { value: T } | { refused: string }) => {
      clearTimeout(timer);
      void reading.terminate();
      if ('refused' in answer) reject(new ImportRefused(answer.refused));
      else resolve(answer.value);
    });
    reading.once('error', (error: Error & { code?: string }) => {
      clearTimeout(timer);
      reject(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? new ImportRefused(tooLarge) : error);
    });
    reading.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('The worker reading an export stopped without an answer.'));
    });
  });
}

/** What importing the export would bring, with a fingerprint of it, as JSON for the app. Nothing is created. */
export function previewExport(zip: Buffer): Promise<string> {
  return inWorker({ zip });
}

/** What Homing writes to import the export as a new space with the name given, if it's the export previewed. */
export function readForImport(zip: Buffer, name: string, hash: string): Promise<string> {
  return inWorker({ zip, name, hash });
}

/**
 * Imports an export as a new space, at the top on its own, from what readForImport made for its
 * name, and returns it. Only a person does, directly, in one transaction: all of it or nothing.
 */
export async function importSpace(s: Session, name: string, payload: string): Promise<string> {
  try {
    // Held to the end, as creating any space is, so another can't take the name meanwhile.
    await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
    await placeSpace(s, { name, who: 'with others' });
    // In a savepoint, so a refusal comes back as one, with nothing created.
    const [{ id }] = await s.tx.savepoint((sp) => sp<{ id: string }[]>`select import_bundle(${payload}::text::jsonb) as id`);
    return id;
  } catch (error) {
    if (!(error instanceof postgres.PostgresError)) throw error;
    // The store refused something the checks let through.
    if (/^(23|22|42501|P0001)/.test(error.code)) throw new ImportRefused('That export doesn’t hold together, so Homing didn’t import any of it.');
    if (error.code === '57014') throw new ImportRefused('That export took too long to import, so Homing stopped and created nothing. Try again in a quiet moment, or export less of it at a time.');
    if (error.code === '54000') throw new ImportRefused('Something in that export is larger than Homing can search, so Homing didn’t import any of it.');
    throw error;
  }
}
