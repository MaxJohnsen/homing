// Reads an export in a worker of its own (import.ts), with limited memory, so an export made to be
// heavy only ever stops this worker, and Homing keeps answering everyone else meanwhile.

import { parentPort, workerData } from 'node:worker_threads';
import { ImportRefused, payloadOf, previewJson, readExport } from './bundle.ts';

const task = workerData as { zip: Uint8Array; name?: string; hash?: string };

try {
  const { manifest, hash } = readExport(task.zip);
  if (task.name === undefined) parentPort!.postMessage({ value: previewJson(manifest, hash) });
  // The import is of exactly what the person saw.
  else if (task.hash !== hash) parentPort!.postMessage({ refused: 'That isn’t the export you looked at. Choose it again to see what it brings.' });
  else parentPort!.postMessage({ value: payloadOf(manifest, task.name) });
} catch (error) {
  if (!(error instanceof ImportRefused)) throw error;
  parentPort!.postMessage({ refused: error.message });
}
