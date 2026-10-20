// The spending guard, with made-up prices and a stand-in for OpenRouter, so nothing here costs
// anything. Run it with `node --test bench/budget.test.ts`. CI doesn't, since the benchmarks
// aren't part of Homing.

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { Ledger, OverBudget, pricesOf, worstCase, type ListedModel } from './budget.ts';
import { Model, ModelFailed, redact } from './openrouter.ts';

const ledgerPath = () => join(mkdtempSync(join(tmpdir(), 'homing-bench-')), 'spend.json');

/** A model as the list would show it, at made-up prices per token. */
const fake = (prompt: number, completion: number, more: Record<string, unknown> = {}): ListedModel => ({
  id: 'test/fake-model',
  pricing: { prompt: String(prompt), completion: String(completion), ...more },
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stands in for OpenRouter, counting the requests that reach it. */
function stubOpenRouter(answer: (init: RequestInit) => Response) {
  const seen = { requests: 0 };
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    seen.requests++;
    return answer(init);
  }) as typeof fetch;
  return seen;
}

const ask = { messages: [{ role: 'user' as const, content: 'When does Acme launch?' }], tools: [], maxTokens: 1000, label: 'test' };

test('the worst case uses the dearest price that can apply, cache writes and long prompts included', () => {
  const prices = pricesOf(
    fake(0.000002, 0.00001, { input_cache_write: '0.0000025', overrides: [{ min_prompt_tokens: 272000, prompt: '0.000004', completion: '0.000015' }] }),
  );
  assert.equal(prices.input, 0.0000025);
  assert.equal(worstCase(prices, 1000, 1000), 1000 * 0.0000025 + 1000 * 0.00001);
  assert.equal(worstCase(prices, 300_000, 1000), 300_000 * 0.000004 + 1000 * 0.000015);
});

test('a call that could pass the cap is refused before it reaches OpenRouter', async () => {
  const ledger = new Ledger(ledgerPath());
  // A dollar a token: a thousand tokens out could cost far more than the cap.
  const model = new Model(fake(1, 1), ledger);
  const openRouter = stubOpenRouter(() => Response.json({}));
  await assert.rejects(model.complete(ask), OverBudget);
  assert.equal(openRouter.requests, 0);
  assert.equal(ledger.spent, 0);
});

test('calls stop once what is spent, plus the next worst case, would pass the cap', async () => {
  const ledger = new Ledger(ledgerPath());
  // Each call can cost up to about $21 at these prices, and is charged $15.
  const model = new Model(fake(0.0001, 0.021), ledger);
  const openRouter = stubOpenRouter(() =>
    Response.json({ choices: [{ message: { content: 'On 1 March.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5, cost: 15 } }),
  );
  await model.complete(ask);
  await model.complete(ask);
  assert.equal(ledger.spent, 30);
  // $30 spent and up to $21 more would pass $50.
  await assert.rejects(model.complete(ask), /Stopped at the cap/);
  assert.equal(openRouter.requests, 2);
});

test('the total survives a restart, and a call a crash interrupted counts at its worst case', () => {
  const path = ledgerPath();
  const first = new Ledger(path);
  first.settle(first.reserve('test/fake-model', 2), { cost: 1.25 });
  first.reserve('test/fake-model', 3);
  // The process dies here, with the second call under way.

  const second = new Ledger(path);
  assert.equal(second.spent, 4.25);
  assert.throws(() => second.reserve('test/fake-model', 46), OverBudget);
  second.reserve('test/fake-model', 45);
});

test('a call whose cost is unknown counts at its worst case, and a refused request at nothing', () => {
  const ledger = new Ledger(ledgerPath());
  ledger.settle(ledger.reserve('test/fake-model', 0.5), 'unknown');
  ledger.settle(ledger.reserve('test/fake-model', 0.5), 'error');
  assert.equal(ledger.spent, 0.5);
});

test("a run's own limit stops it below the cap", () => {
  const ledger = new Ledger(ledgerPath(), { runLimit: 3 });
  ledger.settle(ledger.reserve('test/fake-model', 1), { cost: 2.5 });
  assert.throws(() => ledger.reserve('test/fake-model', 1), /this run's limit/);
});

test('the cap can be lowered but never raised', () => {
  assert.equal(new Ledger(ledgerPath(), { cap: 500 }).cap, 50);
  assert.equal(new Ledger(ledgerPath(), { cap: 10 }).cap, 10);
});

test("calls stop when the key's own usage has grown past the cap since the first run", () => {
  const path = ledgerPath();
  new Ledger(path).checkKey(100);
  const later = new Ledger(path);
  assert.equal(later.checkKey(140), 40);
  assert.throws(() => later.checkKey(150.01), OverBudget);
});

test("a failed request never puts the key in the error, even when OpenRouter echoes it", async () => {
  const ledger = new Ledger(ledgerPath());
  const model = new Model(fake(0.000001, 0.000001), ledger);
  stubOpenRouter((init) => {
    const authorization = new Headers(init.headers).get('authorization');
    return Response.json({ error: { message: `Not allowed: ${authorization}` } }, { status: 401 });
  });
  const failure = await model.complete(ask).then(
    () => undefined,
    (error: Error) => error,
  );
  assert.ok(failure instanceof ModelFailed);
  // Checked without printing: a failing assertion would show the message.
  assert.ok(!/sk-or-/.test(failure.message), 'the error holds the key');
  assert.ok(failure.message.includes('[key]'), 'the key was not replaced');
  assert.equal(redact('Bearer sk-or-v1-abc_123'), 'Bearer [key]');
});
