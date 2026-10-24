// An earlier version of a long document shows the passage that changed, not the same opening as
// every other version (design.md, a page's items).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromChange } from '../web/src/lib/versions.ts';

const opening = 'Nordic market analysis. Service booking online is growing fastest in Norway, and two competitors offer it. ';

test('a version that changed near its start shows from the start', () => {
  assert.equal(fromChange('Launch in Norway first.', 'Launch in Sweden first.'), 'Launch in Norway first.');
});

test('a version that changed further in starts at a word a little before the change', () => {
  const shown = fromChange(`${opening}Neither integrates with dealer systems.`, `${opening}Neither integrates with dealer systems, and one closes.`);
  assert.equal(shown, '…it. Neither integrates with dealer systems.');
});

test('a change inside a long address starts just before it, never from the beginning', () => {
  const address = `${opening}See https://intranet.example.com/projects/relaunch/research/market/nordic/2026/final-draft-v3.pdf for more.`;
  const shown = fromChange(address, address.replace('final-draft-v3', 'final-draft-v4'));
  assert.ok(shown.startsWith('…') && shown.indexOf('final-draft-v3') <= 41, shown);
});
