// Importing a big space takes a while, and the import screen follows it (spec §3, design.md): it
// shows how far it's got while you look, opens the new space when it's done if you're still there,
// and says why if it failed, or that it stopped when Homing knows of it no more. A file larger than
// Homing imports is refused before any of it is sent.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followImport, stopped, unsendable, type ImportProgress } from '../web/src/lib/imports.ts';

/** Homing's answers, one after another, then the last again, and how many times it was asked. */
function answers(...said: (ImportProgress | Error)[]) {
  const asked = { times: 0 };
  const progress = async () => {
    const answer = said[Math.min(asked.times++, said.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { asked, progress };
}

test('an import is followed until it’s done, showing how far it’s got', async () => {
  const { progress } = answers({ state: 'importing', done: 1, total: 4 }, { state: 'importing', done: 3, total: 4 }, { state: 'done', id: 'acme' });
  const shown: number[] = [];
  assert.deepEqual(await followImport(progress, () => true, (fraction) => shown.push(fraction), 0), { done: 'acme' });
  assert.deepEqual(shown, [0.25, 0.75]);
});

test('once the person leaves the screen, it isn’t followed, nor opened', async () => {
  let looking = true;
  const { asked, progress } = answers({ state: 'importing', done: 1, total: 4 }, { state: 'done', id: 'acme' });
  const followed = followImport(progress, () => looking, () => {}, 0);
  looking = false;
  assert.deepEqual(await followed, { left: true });
  assert.ok(asked.times <= 1, `asked ${asked.times} times`);
});

test('an import Homing knows of no more stopped, and nothing of it was kept', async () => {
  const { asked, progress } = answers({ state: 'importing', done: 1, total: 4 }, { state: 'none' });
  assert.deepEqual(await followImport(progress, () => asked.times < 100, () => {}, 0), { failed: stopped });
});

test('one that failed says why, and a moment without Homing doesn’t end it', async () => {
  const { asked, progress } = answers(new Error('Homing can’t be reached.'), { state: 'importing', done: 1, total: 2 }, { state: 'failed', message: 'That export doesn’t hold together.' });
  assert.deepEqual(await followImport(progress, () => asked.times < 100, () => {}, 0), { failed: 'That export doesn’t hold together.' });
});

test('a file larger than Homing imports is refused before any of it is sent', () => {
  assert.equal(unsendable({ size: 2 * 1024 ** 3 }), undefined);
  assert.match(unsendable({ size: 2 * 1024 ** 3 + 1 })!, /larger than Homing imports, 2 GB/);
});
