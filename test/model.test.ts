// Setting up Homing's own model (#129, spec §11): pure logic, with the cases a self-hoster can get
// wrong. Without a model nothing changes. A setting Homing can't use stops it from starting,
// saying which and never what the key is, and a model whose price Homing doesn't know is never
// one it calls, since an unknown price would let it spend without a limit.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaultModels, modelFromEnvironment, worstCase } from '../src/model.ts';

const key = 'sk-or-v1-0123456789abcdef0123456789abcdef';

test('without a model set up, there is none, and nothing else changes', () => {
  assert.equal(modelFromEnvironment({}), undefined);
  assert.equal(modelFromEnvironment({ MODEL_API_KEY: '  ', MODEL_API_URL: '' }), undefined);
});

test('a key alone uses OpenRouter, with a capable model, a cheaper one, and their prices', () => {
  const model = modelFromEnvironment({ MODEL_API_KEY: key })!;
  assert.equal(model.url.toString(), 'https://openrouter.ai/api/v1');
  assert.equal(model.provider, 'OpenRouter');
  assert.deepEqual([model.capable, model.cheaper], [defaultModels.capable, defaultModels.cheaper]);
  assert.deepEqual(model.prices.get(model.capable), { input: 2, output: 10 });
  // The key isn't among the settings anyone gets: it stays in the model module.
  assert.ok(!Object.values(model).some((value) => String(value).includes(key)) && !JSON.stringify(model).includes(key));
  assert.ok(Object.isFrozen(model));

  const chosen = modelFromEnvironment({ MODEL_API_KEY: key, MODEL_DEFAULT: 'openai/gpt-6.1-sol' })!;
  assert.deepEqual([chosen.capable, chosen.cheaper], ['openai/gpt-6.1-sol', defaultModels.cheaper]);
});

test('another provider, or a model server of your own, names its models and their prices', () => {
  const openAi = modelFromEnvironment({
    MODEL_API_URL: 'https://api.openai.com/v1', MODEL_API_KEY: 'sk-proj-abcdefgh', MODEL_DEFAULT: 'gpt-6.1-sol', MODEL_CHEAPER: 'gpt-6-luna',
    MODEL_PRICES: 'gpt-6.1-sol=2/10,4/15@272000, gpt-6-luna=0.1/0.5',
  })!;
  assert.equal(openAi.provider, 'OpenAI');
  assert.deepEqual(openAi.prices.get('gpt-6-luna'), { input: 0.1, output: 0.5 });
  // Dearer from 272,000 tokens in, as OpenAI prices it.
  assert.deepEqual(openAi.prices.get('gpt-6.1-sol'), { input: 2, output: 10, above: { tokens: 272_000, input: 4, output: 15 } });
  // OpenRouter's ids mean nothing elsewhere, so their prices don't come along.
  assert.equal(openAi.prices.has(defaultModels.capable), false);

  for (const address of ['http://localhost:11434/v1', 'http://ollama:11434/v1', 'http://192.168.1.20:8080/v1', 'http://[::1]:11434/v1']) {
    const local = modelFromEnvironment({ MODEL_API_URL: address, MODEL_DEFAULT: 'llama3.3:70b', MODEL_PRICES: 'llama3.3:70b=0/0' })!;
    assert.deepEqual([local.capable, local.cheaper], ['llama3.3:70b', 'llama3.3:70b']);
    assert.equal(local.provider, new URL(address).host);
  }
});

test('a model setting Homing can’t use stops it from starting, saying which, without showing the key', () => {
  for (const [settings, message] of [
    [{ MODEL_DEFAULT: 'anthropic/claude-sonnet-5.5' }, /MODEL_API_KEY/],
    // A key for another provider never goes to OpenRouter by default.
    [{ MODEL_API_KEY: 'sk-proj-0123456789abcdef' }, /isn’t an OpenRouter key, so set MODEL_API_URL/],
    [{ MODEL_API_URL: 'not an address', MODEL_API_KEY: key }, /MODEL_API_URL isn’t an address/],
    [{ MODEL_API_URL: 'http://models.example.com/v1', MODEL_API_KEY: key, MODEL_DEFAULT: 'm', MODEL_PRICES: 'm=1/1' }, /must use https/],
    [{ MODEL_API_URL: `https://user:${key}@models.example.com/v1`, MODEL_DEFAULT: 'm', MODEL_PRICES: 'm=1/1' }, /without a name, password or query/],
    [{ MODEL_API_URL: 'ftp://models.example.com/v1', MODEL_DEFAULT: 'm', MODEL_PRICES: 'm=1/1' }, /Chat Completions API/],
    [{ MODEL_API_KEY: `${key} trailing words` }, /MODEL_API_KEY isn’t a key/],
    [{ MODEL_API_KEY: 'short' }, /MODEL_API_KEY isn’t a key/],
    [{ MODEL_API_URL: 'https://openrouter.ai/api/v1' }, /OpenRouter needs a key/],
    [{ MODEL_API_URL: 'https://models.example.com/v1', MODEL_API_KEY: key }, /Set MODEL_DEFAULT/],
    [{ MODEL_API_KEY: key, MODEL_DEFAULT: 'has spaces in it' }, /MODEL_DEFAULT isn’t a model’s id/],
    [{ MODEL_API_KEY: key, MODEL_PRICES: 'free' }, /MODEL_PRICES holds/],
    [{ MODEL_API_KEY: key, MODEL_PRICES: 'x=-1/2' }, /MODEL_PRICES holds/],
    // A tier needs a model before it, only one each, and a number of tokens.
    [{ MODEL_API_KEY: key, MODEL_PRICES: '4/15@272000' }, /MODEL_PRICES holds/],
    [{ MODEL_API_KEY: key, MODEL_PRICES: 'x=1/2,2/4@1000,3/6@2000' }, /MODEL_PRICES holds/],
    [{ MODEL_API_KEY: key, MODEL_PRICES: 'x=1/2,2/4@0' }, /MODEL_PRICES holds/],
  ] as const) {
    assert.throws(() => modelFromEnvironment(settings), (error: Error) => message.test(error.message) && !error.message.includes(key), message.source);
  }
});

test('a model whose price Homing doesn’t know is never one it calls, until it’s given one', () => {
  const settings = { MODEL_API_URL: 'https://models.example.com/v1', MODEL_API_KEY: key, MODEL_DEFAULT: 'big-model', MODEL_CHEAPER: 'small-model' };
  assert.throws(() => modelFromEnvironment(settings), /doesn’t know what big-model costs.*MODEL_PRICES/);
  assert.throws(() => modelFromEnvironment({ ...settings, MODEL_PRICES: 'big-model=3/15' }), /doesn’t know what small-model costs/);
  // On OpenRouter too, for a model it doesn't know.
  assert.throws(() => modelFromEnvironment({ MODEL_API_KEY: key, MODEL_DEFAULT: 'someone/new-model' }), /doesn’t know what someone\/new-model costs/);
  assert.ok(modelFromEnvironment({ ...settings, MODEL_PRICES: 'big-model=3/15,small-model=0.2/1' }));
});

test('a call’s worst case is all its input and all it may write, at the dearest prices that can apply', () => {
  const haiku = modelFromEnvironment({ MODEL_API_KEY: key })!.prices.get(defaultModels.cheaper)!;
  assert.equal(worstCase(haiku, 1_000, 1_000), (1_000 * 0.1 + 1_000 * 0.5) / 1e6);
  assert.equal(worstCase(haiku, 150_000, 1_000), (150_000 * 0.5 + 1_000 * 2.5) / 1e6);
});

test('only the model module reaches a provider or its key, so no call can skip its checks', () => {
  const sources = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sources(join(folder, entry.name)) : entry.name.endsWith('.ts') ? [join(folder, entry.name)] : []));
  const root = join(import.meta.dirname, '..');
  const named = (file: string) => file.slice(root.length + 1);
  // What each may import of the provider's: the model module both, the adapter the interface, and nothing else either.
  const allowed: Record<string, string[]> = { 'src/model.ts': ['chat-completions', 'provider'], 'src/chat-completions.ts': ['provider'], 'src/provider.ts': [] };
  for (const file of [...sources(join(root, 'src')), ...sources(join(root, 'scripts'))]) {
    const code = readFileSync(file, 'utf8');
    // Every module named, by a static or dynamic import, an export from, or require.
    const imported = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
    for (const module of imported) {
      const which = /(?:^|\/)(chat-completions|provider)(?:\.ts)?$/.exec(module)?.[1];
      if (which) assert.ok(allowed[named(file)]?.includes(which), `${named(file)} imports ${module}`);
    }
    if (named(file) === 'src/model.ts') continue;
    assert.doesNotMatch(code.replace(/export function chatCompletions\(/, ''), /\.chat\(|chatCompletions\(/, named(file));
    assert.doesNotMatch(code, /MODEL_API_KEY|settings\.key\b/, named(file));
  }
  assert.match(readFileSync(join(root, 'src', 'model.ts'), 'utf8'), /provider\.chat\(/);
});
