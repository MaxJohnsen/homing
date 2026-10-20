// The spending guard, with made-up prices, made-up keys and a stand-in for OpenRouter, so nothing
// here costs anything or reads the real key. It runs with the tests.

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { Ledger, OverBudget, pricesOf, worstCase, type ListedModel } from './budget.ts';
import { keyUsage, Model, ModelFailed, redact, type KeySource } from './openrouter.ts';

const ledgerPath = () => join(mkdtempSync(join(tmpdir(), 'homing-bench-')), 'spend.json');

/** Ledgers opened in a test, closed after it so their locks don't outlive it. */
const open: Ledger[] = [];
function ledger(path = ledgerPath(), options: { cap?: number; runLimit?: number } = {}) {
  const made = new Ledger(path, options);
  open.push(made);
  return made;
}

/** A model as the list would show it, at made-up prices per token. */
const fake = (prompt: unknown, completion: unknown, more: Record<string, unknown> = {}): ListedModel => ({
  id: 'test/fake-model',
  pricing: { prompt: String(prompt), completion: String(completion), ...more },
});

const fakeKey: KeySource = () => 'sk-or-v1-test-0000000000000000';

/** A model that calls the stand-in for OpenRouter with a made-up key, and retries without waiting. */
const model = (listed: ListedModel, on: Ledger, key = fakeKey) => new Model(listed, on, { key, backoffMs: 0 });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const made of open.splice(0)) made.close();
});

/** Stands in for OpenRouter, counting the requests that reach it. */
function stubOpenRouter(answer: (init: RequestInit) => Response | Promise<Response>) {
  const seen = { requests: 0 };
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    seen.requests++;
    return answer(init);
  }) as typeof fetch;
  return seen;
}

const answered = (cost: number) => Response.json({ choices: [{ message: { content: 'On 1 March.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5, cost } });

const ask = { messages: [{ role: 'user' as const, content: 'When does Acme launch?' }], tools: [], maxTokens: 1000, label: 'test' };

test('the worst case uses the dearest price that can apply, cache writes and long prompts included', () => {
  const prices = pricesOf(
    fake(0.000002, 0.00001, { input_cache_write: '0.0000025', overrides: [{ min_prompt_tokens: 272000, prompt: '0.000004', completion: '0.000015' }] }),
  );
  assert.equal(prices.input, 0.0000025);
  assert.equal(worstCase(prices, 1000, 1000), 1000 * 0.0000025 + 1000 * 0.00001);
  assert.equal(worstCase(prices, 300_000, 1000), 300_000 * 0.000004 + 1000 * 0.000015);
});

test("a model whose cost can't be bounded is refused: a router's -1, a missing price, or a negative one", () => {
  const on = ledger();
  assert.throws(() => model(fake(-1, -1), on), OverBudget);
  assert.throws(() => model({ id: 'test/no-output-price', pricing: { prompt: '0.000001' } }, on), OverBudget);
  assert.throws(() => model(fake(0.000001, 0.000001, { input_cache_write: '-0.5' }), on), OverBudget);
  assert.throws(() => model(fake('free', 0.000001), on), OverBudget);
});

test('a call that could pass the cap is refused before it reaches OpenRouter', async () => {
  const on = ledger();
  // A dollar a token: a thousand tokens out could cost far more than the cap.
  const openRouter = stubOpenRouter(() => answered(0));
  await assert.rejects(model(fake(1, 1), on).complete(ask), OverBudget);
  assert.equal(openRouter.requests, 0);
  assert.equal(on.spent, 0);
});

test('calls stop once what is spent, plus the next worst case, would pass the cap', async () => {
  const on = ledger();
  // Each call can cost up to about $21 at these prices, and is charged $15.
  const fifteen = model(fake(0.0001, 0.021), on);
  const openRouter = stubOpenRouter(() => answered(15));
  await fifteen.complete(ask);
  await fifteen.complete(ask);
  assert.equal(on.spent, 30);
  // $30 spent and up to $21 more would pass $50.
  await assert.rejects(fifteen.complete(ask), /Stopped at the cap/);
  assert.equal(openRouter.requests, 2);
});

test('calls under way count against the cap and the run’s limit at their worst case', () => {
  const capped = ledger();
  capped.reserve('test/fake-model', 20);
  capped.reserve('test/fake-model', 20);
  assert.throws(() => capped.reserve('test/fake-model', 15), /Stopped at the cap/);

  const limited = ledger(ledgerPath(), { runLimit: 10 });
  limited.reserve('test/fake-model', 4);
  limited.reserve('test/fake-model', 4);
  assert.throws(() => limited.reserve('test/fake-model', 3), /this run's limit/);
});

test('the total survives a restart, and a call a crash interrupted counts at its worst case', () => {
  const path = ledgerPath();
  const first = ledger(path);
  first.settle(first.reserve('test/fake-model', 2), { cost: 1.25 });
  first.reserve('test/fake-model', 3);
  // The process ends here, with the second call under way.
  first.close();

  const second = ledger(path);
  assert.equal(second.spent, 4.25);
  assert.throws(() => second.reserve('test/fake-model', 46), OverBudget);
  second.reserve('test/fake-model', 45);
});

test('only one run at a time may spend from a ledger', () => {
  const path = ledgerPath();
  const first = ledger(path);
  assert.throws(() => new Ledger(path), /Only one may run at a time/);
  first.close();
  ledger(path);
});

test('a call whose cost is unknown counts at its worst case, and a refused request at nothing', () => {
  const on = ledger();
  on.settle(on.reserve('test/fake-model', 0.5), 'unknown');
  on.settle(on.reserve('test/fake-model', 0.5), 'error');
  assert.equal(on.spent, 0.5);
});

// Output at a thousandth of a dollar a token and free input: each try of a 1,000-token call can cost exactly $1.
const dollarACall = fake(0, 0.001);

test('a request that fails on the way counts at its worst case, every time it is tried', async () => {
  const on = ledger();
  const openRouter = stubOpenRouter(() => Promise.reject(new TypeError('fetch failed')));
  await assert.rejects(model(dollarACall, on).complete(ask), ModelFailed);
  assert.equal(openRouter.requests, 4);
  assert.equal(on.spent, 4);
});

test('an answer without a cost or a usable reply counts at its worst case, unless OpenRouter refused the request', async () => {
  const replies = [
    Response.json({ choices: [] }),
    Response.json({ error: { message: 'Provider returned error' } }),
    new Response('Bad gateway', { status: 502 }),
    Response.json({ error: { message: 'Overloaded' } }, { status: 503 }),
  ];
  const on = ledger();
  stubOpenRouter(() => replies.shift()!);
  await assert.rejects(model(dollarACall, on).complete(ask), ModelFailed);
  assert.equal(on.spent, 4);

  const refused = ledger();
  stubOpenRouter(() => Response.json({ error: { message: 'Rate limited' } }, { status: 429 }));
  await assert.rejects(model(dollarACall, refused).complete(ask), ModelFailed);
  assert.equal(refused.spent, 0);
});

test("a run's own limit stops it below the cap", () => {
  const on = ledger(ledgerPath(), { runLimit: 3 });
  on.settle(on.reserve('test/fake-model', 1), { cost: 2.5 });
  assert.throws(() => on.reserve('test/fake-model', 1), /this run's limit/);
});

test('the cap can be lowered but never raised, and a limit that is not a number refuses', () => {
  assert.equal(ledger(ledgerPath(), { cap: 500 }).cap, 50);
  assert.equal(ledger(ledgerPath(), { cap: 10 }).cap, 10);
  assert.throws(() => new Ledger(ledgerPath(), { runLimit: Number('three') }), OverBudget);
  assert.throws(() => new Ledger(ledgerPath(), { runLimit: -1 }), OverBudget);
  assert.throws(() => new Ledger(ledgerPath(), { cap: Number.POSITIVE_INFINITY }), OverBudget);
});

test("calls stop when the key's own usage has grown past the cap since the first run", () => {
  const path = ledgerPath();
  const first = ledger(path);
  first.checkKey(100);
  first.close();
  const later = ledger(path);
  assert.equal(later.checkKey(140), 40);
  assert.throws(() => later.checkKey(150.01), OverBudget);
});

test("what's spent is the ledger's total or the key's usage since the first run, whichever is more", () => {
  const on = ledger();
  on.checkKey(100);
  on.checkKey(140);
  // The ledger has spent nothing, but the key has used $40.
  assert.throws(() => on.reserve('test/fake-model', 15), /Stopped at the cap/);
  on.reserve('test/fake-model', 9);
});

test("when the key's usage can't be read, nothing more is called", async () => {
  for (const answer of [
    () => Promise.reject(new TypeError('fetch failed')),
    () => new Response('Bad gateway', { status: 502 }),
    () => new Response('not json'),
    () => Response.json({ data: { usage: null } }),
  ]) {
    stubOpenRouter(answer);
    await assert.rejects(keyUsage(fakeKey), OverBudget);
  }
});

test('a failed request never puts the key in the error, even when OpenRouter echoes it', async () => {
  for (const key of [fakeKey, () => 'plain-test-key-1234']) {
    const on = ledger();
    stubOpenRouter((init) => {
      const authorization = new Headers(init.headers).get('authorization');
      return Response.json({ error: { message: `Not allowed: ${authorization}` } }, { status: 401 });
    });
    const failure = await model(fake(0.000001, 0.000001), on, key)
      .complete(ask)
      .then(
        () => undefined,
        (error: Error) => error,
      );
    assert.ok(failure instanceof ModelFailed);
    // Checked without printing: a failing assertion would show the message.
    assert.ok(!failure.message.includes(key()), 'the error holds the key');
    assert.ok(failure.message.includes('Bearer [key]'), 'the key was not replaced');
  }
  assert.equal(redact('Bearer sk-or-v1-abc_123'), 'Bearer [key]');
});
