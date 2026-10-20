// Exports are zips (spec §3). A big space is tens of thousands of files, more than plain zip can
// count, and an unzip tool still finds every one of them.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { zip } from '../src/zip.ts';

test('a zip keeps every file as it was, with names in any language', async () => {
  const files: [string, string][] = [['homing.json', '{}\n'], ['knowledge/kjøkken/ærlig-talt.md', '# Ærlig talt\n\nÅ si det som det er.\n'], ['knowledge/empty.md', '']];
  const unpacked = unzipSync(await zip(files));
  assert.deepEqual(Object.entries(unpacked).map(([path, bytes]) => [path, strFromU8(bytes)]), files);
});

test('a zip with more files than plain zip can count still holds them all', async () => {
  const files = Array.from({ length: 70_000 }, (_, n): [string, string] => [`knowledge/sources/${n}.md`, `Source ${n}`]);
  const unpacked = unzipSync(await zip(files));
  assert.equal(Object.keys(unpacked).length, 70_000);
  assert.equal(strFromU8(unpacked['knowledge/sources/69999.md']), 'Source 69999');
});
