// Benchmark 0's work, rebuilt from the calls a run keeps, has the edits an assistant made to part of
// an item, as Homing made them. It runs with the tests.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebuild } from './upkeep-replay.ts';

test('the rebuilt work has the edits made to part of an item', () => {
  const [item, replacement, page] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  const call = (args: Record<string, unknown>, answer: string) => ({ name: 'remember', args, failed: false, answer });
  const [after] = rebuild('homing', [
    {
      calls: [
        call({ page: 'Outline', text: '# Outline\n\n## Slide 8: Risks\n- The export runs only in January.' }, `Saved on your private side as item:${item}, on the new page "Outline" (page:${page}).`),
        call(
          { updates: `item:${item}`, edits: [{ old: '- The export runs only in January.', new: '- The export runs only in January.\n- Composa has one reference.' }] },
          `Updated item:${item}. What it said before is kept in its history.`,
        ),
        call({ replaces: `item:${item}`, edits: [{ old: 'Slide 8', new: 'Slide 9' }] }, `Saved as item:${replacement}. item:${item} is kept as what used to be true.`),
      ],
    },
  ]);
  assert.deepEqual(
    after.map((doc) => [doc.title, doc.items, doc.parts]),
    [['Outline', [replacement], ['# Outline\n\n## Slide 9: Risks\n- The export runs only in January.\n- Composa has one reference.']]],
  );
});
