// Exports are zips (spec §3). A big space is tens of thousands of files, more than plain zip can
// count, and an unzip tool still finds every one of them.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { fileIn, zip, ZipRefused } from '../src/zip.ts';

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

test('a damaged zip is refused as damaged, wherever it breaks', async () => {
  const limits = { files: 10, size: 1024 * 1024 };
  const whole = await zip([['homing.json', '{"format":"homing-export"}'], ['knowledge/index.md', '# Acme\n']]);
  assert.equal(fileIn(whole, 'homing.json', limits).toString(), '{"format":"homing-export"}');
  const refusal = (bytes: Buffer) => {
    try {
      fileIn(bytes, 'homing.json', limits);
      return 'read';
    } catch (error) {
      assert.ok(error instanceof ZipRefused, String(error));
      return error.reason;
    }
  };
  // Cut short anywhere, or with any one byte changed, it's refused for a reason, never by surprise.
  for (let length = 0; length < whole.length; length++) refusal(whole.subarray(0, length));
  for (let at = 0; at < whole.length; at++) {
    const changed = Buffer.from(whole);
    changed[at] ^= 0xff;
    refusal(changed);
  }
  // 36 bytes: an end record saying its one file is listed just before it, where the list starts and stops.
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46, 12);
  end.writeUInt32LE(10, 16);
  assert.equal(refusal(Buffer.concat([Buffer.alloc(10), Buffer.from('PK\x01\x02'), end])), 'damaged');
  assert.equal(refusal(Buffer.from('Just some text.')), 'not a zip');
});
