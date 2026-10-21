// Reads an export in a worker of its own (import.ts), with limited memory, a file of it at a time,
// so an export made to be heavy only ever stops this worker, and Homing keeps answering everyone
// else meanwhile. To import, it hands over each part and waits until it's written.

import { parentPort, workerData } from 'node:worker_threads';
import { ImportRefused, inspect, load } from './bundle.ts';

const port = parentPort!;
const task = workerData as { path: string; hash: string } | { path: string; key: string; name: string; inside: string[] };

/** Hands a part over, and waits until it's written. */
const hand = (message: object) =>
  new Promise<void>((resolve, reject) => {
    port.once('message', (answer: { ok: boolean }) => (answer.ok ? resolve() : reject(new Error('Stopped.'))));
    port.postMessage(message);
  });

try {
  if ('hash' in task) {
    const { preview, inside } = await inspect(task.path, task.hash, (done, total) => port.postMessage({ type: 'progress', done, total }));
    port.postMessage({ type: 'preview', preview, inside });
  } else {
    await load(task.path, task, {
      begin: (payload) => hand({ type: 'begin', payload }),
      batch: (payload, done, total) => hand({ type: 'batch', payload, done, total }),
      finish: (payload) => hand({ type: 'finish', payload }),
    });
    port.postMessage({ type: 'done' });
  }
} catch (error) {
  if (!(error instanceof ImportRefused)) throw error;
  port.postMessage({ type: 'refused', message: error.message });
}
