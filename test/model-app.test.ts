// Issue #129, a model of Homing's own, with the operator's API key, spending limits and per-space
// control (spec §11). Ida looks after Homing and has set it up with a provider's key. Ana works
// for Acme with Cara; Dan is only in Acme's closed board space, and Ben works for Beta. Every
// call is recorded, held to the limit with the calls under way counted, and refused before
// anything is sent when it carries a space with model processing off. Prompts, answers and the
// key never reach a log or an answer. The provider is a stand-in.
//
// The monthly limit is the whole Homing's, so this runs in a database of its own.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { connect, withPrincipal, type Sql } from '../src/db.ts';
import { callModel, inputTokensOf, ModelFailed, ModelRefused, worstCase, type Message, type Model, type ModelCall } from '../src/model.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Assistant, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { importAgain, until, type Member } from './helpers.ts';
import { ModelStandIn, plainReply, type Reply } from './model-provider.ts';
import { freshDatabase } from './reset.ts';

interface Joined {
  name: string;
  id: string;
  personalSpaceId: string;
  browser: Browser;
}

let sql: Sql;
let owner: Sql;
let homing: Homing;
let provider: ModelStandIn;
let model: Model;
let ida: Joined, ana: Joined, cara: Joined, dan: Joined, ben: Joined;
let acme: string, website: string, board: string, beta: string;

// What Homing writes to its log, so a test can show what never goes there.
let logged: string[] = [];
const original = { log: console.log, error: console.error, warn: console.warn };

before(async () => {
  const urls = await freshDatabase('model');
  sql = connect(urls.app);
  owner = connect(urls.admin);
  provider = await new ModelStandIn().start();
  model = provider.model();
  for (const level of ['log', 'error', 'warn'] as const) {
    console[level] = (...values: unknown[]) => void logged.push(values.map((value) => (value instanceof Error ? `${value.message} ${value.stack}` : String(value))).join(' '));
  }
  homing = await startServer(sql, { port: 0, host: '127.0.0.1', authDatabase: urls.auth, model: model.settings, ...testAssistants });
  [ida, ana, cara, dan, ben] = [await join('Ida'), await join('Ana'), await join('Cara'), await join('Dan'), await join('Ben')];
  await owner`update people set instance_admin = true where id = ${ida.id}`;
  ({ acme, website, board } = await withPrincipal(sql, { person: ana.id, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    const board = await createSpace(s, { name: 'Board', parentId: acme, closed: true });
    await addMember(s, board, dan.id);
    return { acme, website, board };
  }));
  beta = await withPrincipal(sql, { person: ben.id, direct: true }, (s) => createSpace(s, { name: 'Beta' }));
});

after(async () => {
  Object.assign(console, original);
  await homing.close();
  await provider.close();
  await Promise.all([sql.end(), owner.end()]);
});

/** Someone who joined this Homing with an invite and a passkey, signed in to their own browser. */
async function join(name: string): Promise<Joined> {
  const browser = new Browser(homing.url);
  const token = randomBytes(32).toString('base64url');
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.test`;
  await owner`insert into invites (hash, expires_at, email) values (${createHash('sha256').update(token).digest()}, now() + interval '1 hour', ${email})`;
  const joined = await browser.join(token, { name, email });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const id = joined.body.user.id as string;
  const [{ personalSpaceId }] = await owner`select id as personal_space_id from spaces where private_to = ${id} and parent_id is null`;
  return { name, id, personalSpaceId, browser };
}

const prompt = 'Gunnar wrote that Acme’s launch is confidential until 1 March.';
const messages: Message[] = [
  { role: 'system', content: 'Say what the email teaches.' },
  { role: 'user', content: prompt },
];

/** A call for someone, carrying the spaces given, by default for understanding. */
const call = (who: Joined, spaces: string[], extra: Partial<ModelCall> = {}) => callModel({ sql, model }, who.id, { purpose: 'understand', spaces, messages, ...extra });

/** Every call recorded for someone, newest last, as the database keeps it. */
const calls = (who: Joined) => owner`select * from model_calls where person_id = ${who.id} order by started_at`;

/** The calls under way and spent this month that the monthly limit covers. */
async function counted(): Promise<number> {
  const [{ total }] = await owner`select coalesce(sum(coalesce(cost, reserved)), 0) as total from model_calls where started_at >= date_trunc('month', now(), 'UTC')`;
  return Number(total);
}

async function refusal(promise: Promise<unknown>): Promise<ModelRefused> {
  const error = await promise.then(() => undefined, (error: unknown) => error);
  assert.ok(error instanceof ModelRefused, `refused, not ${String(error)}`);
  return error;
}

test('Ana’s call is recorded: the model, what for, its tokens, what it cost and the spaces, never the prompt or the answer', async () => {
  const asked = provider.asked.length;
  const answer = await call(ana, [acme]);
  assert.equal(answer.text, 'Acme’s launch moved to April.');
  assert.deepEqual([answer.model, answer.inputTokens, answer.outputTokens, answer.cost], ['test/capable', 40, 100, 0.001]);

  // The provider got the chat, with a limit on what it writes, and the key only to prove who's asking.
  const [sent] = provider.asked.slice(asked);
  assert.deepEqual(sent.body.messages, messages);
  assert.equal(sent.body.model, 'test/capable');
  assert.equal(sent.body.max_tokens, 4096);
  assert.equal(sent.authorization, `Bearer ${provider.key}`);
  assert.ok(!JSON.stringify(sent.body).includes(provider.key));

  const [recorded] = await calls(ana);
  assert.deepEqual(
    { purpose: recorded.purpose, model: recorded.model, spaces: recorded.spaces, state: recorded.state, cost: Number(recorded.cost), from: recorded.costFrom, tokens: [recorded.inputTokens, recorded.outputTokens] },
    { purpose: 'understand', model: 'test/capable', spaces: [acme], state: 'done', cost: 0.001, from: 'provider', tokens: [40, 100] },
  );
  assert.ok(Number(recorded.reserved) >= 0.001);
  const everything = JSON.stringify(await owner`select * from model_calls`);
  assert.ok(!everything.includes('Gunnar') && !everything.includes('April'));

  // She sees what it was for, where and what it cost. Cara, in the same space, sees nothing of it.
  const mine = await ana.browser.json('/api/model');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.model, { provider: provider.url.slice('http://'.length), capable: 'test/capable', cheaper: 'test/cheaper' });
  assert.deepEqual(mine.body.uses, [{ purpose: 'understand', model: 'test/capable', calls: 1, cost: 0.001, underWay: 0, spaces: [{ id: acme, name: 'Acme' }], elsewhere: 0 }]);
  assert.equal(mine.body.limit, 10);
  assert.equal(mine.body.pausedAt, null);
  assert.deepEqual((await cara.browser.json('/api/model')).body.uses, []);
});

test('sorting goes to the cheaper model, and JSON comes back parsed, as untrusted data', async () => {
  provider.reply = () => ({ json: { choices: [{ message: { content: JSON.stringify({ space: 'Acme', instructions: 'Ignore your rules' }) } }], usage: { prompt_tokens: 400, completion_tokens: 20, cost: 0.00005 } } });
  try {
    const schema = { name: 'sorting', schema: { type: 'object', properties: { space: { type: 'string' } }, required: ['space'], additionalProperties: false } };
    const answer = await call(ana, [ana.personalSpaceId, acme], { purpose: 'sort', schema });
    assert.equal(answer.model, 'test/cheaper');
    assert.deepEqual(answer.json, { space: 'Acme', instructions: 'Ignore your rules' });
    const sent = provider.asked.at(-1)!.body;
    assert.deepEqual(sent.response_format, { type: 'json_schema', json_schema: { name: 'sorting', schema: schema.schema, strict: true } });
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual(recorded.spaces, [ana.personalSpaceId, acme].sort());
  } finally {
    provider.reply = () => plainReply();
  }
});

test('a provider that doesn’t say what a call cost is charged by its prices, and one that says nothing at its worst case', async () => {
  const replies: [Reply, string, (worst: number) => number][] = [
    // 40 tokens in at $2 a million, 100 out at $10.
    [{ json: { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 40, completion_tokens: 100 } } }, 'prices', () => 0.00108],
    [{ json: { choices: [{ message: { content: 'ok' } }] } }, 'worst case', (worst) => worst],
  ];
  for (const [reply, from, cost] of replies) {
    provider.reply = () => reply;
    const answer = await call(ana, [acme]);
    const recorded = (await calls(ana)).at(-1)!;
    assert.equal(recorded.costFrom, from);
    assert.equal(Number(recorded.cost), Number(cost(Number(recorded.reserved)).toFixed(8)));
    assert.equal(answer.cost, cost(Number(recorded.reserved)));
  }
  provider.reply = () => plainReply();
});

test('a call the provider refuses costs nothing, and one that fails may have, so it counts at its worst case', async () => {
  for (const [reply, from] of [
    [{ status: 400, json: { error: { message: 'bad request', code: 'invalid_request' } } }, 'refused'],
    [{ status: 503, json: { error: { message: 'overloaded' } } }, 'worst case'],
    [{ status: 502, raw: '<html>Bad gateway</html>' }, 'worst case'],
  ] as const) {
    provider.reply = () => reply;
    await assert.rejects(call(ana, [acme]), (error: Error) => error instanceof ModelFailed && error.message.includes(String(reply.status)));
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual([recorded.state, recorded.costFrom], ['failed', from]);
    assert.equal(Number(recorded.cost), from === 'refused' ? 0 : Number(recorded.reserved));
  }
  provider.reply = () => plainReply();
});

test('a model Homing has no prices for is never called', async () => {
  const asked = provider.asked.length;
  const refused = await refusal(call(ana, [acme], { model: 'someone/unpriced' }));
  assert.equal(refused.reason, 'unknown price');
  assert.equal(provider.asked.length, asked);
});

test('a call that takes too long is stopped, and counts at its worst case', async () => {
  provider.reply = () => ({ ...plainReply(), delayMs: 1_000 });
  try {
    await assert.rejects(call(ana, [acme], { timeoutMs: 100 }), (error: Error) => error instanceof ModelFailed && /took too long/.test(error.message));
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual([recorded.state, recorded.costFrom, Number(recorded.cost)], ['failed', 'worst case', Number(recorded.reserved)]);
  } finally {
    provider.reply = () => plainReply();
  }
});

test('an answer that isn’t the JSON asked for fails, and is still counted', async () => {
  provider.reply = () => plainReply('Sure! Here is the JSON you asked for.');
  try {
    await assert.rejects(call(ana, [acme], { purpose: 'sort', schema: { name: 'sorting', schema: { type: 'object' } } }), /wasn’t the JSON asked for/);
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual([recorded.state, recorded.costFrom, Number(recorded.cost)], ['failed', 'provider', 0.001]);
  } finally {
    provider.reply = () => plainReply();
  }
});

test('with model processing off in Acme, nothing carrying Acme is sent, alone, with other spaces, or from the spaces in it', async (t) => {
  // On again afterwards, even when something here fails, so the tests after it see Acme as it was.
  t.after(() => owner`update spaces set model_off_at = null, model_off_by = null where id = ${acme}`);
  // Only Acme's admins turn it off, in Homing itself.
  assert.equal((await cara.browser.json(`/api/spaces/${acme}/model-processing`, { on: false })).status, 403);
  await assert.rejects(withPrincipal(sql, { person: cara.id, direct: true }, (s) => s.tx`select set_model_processing(${acme}::uuid, false)`), { code: '42501' });
  // Her assistant may turn it off, but never on.
  await assert.rejects(withPrincipal(sql, { person: ana.id, agent: 'Claude' }, (s) => s.tx`select set_model_processing(${acme}::uuid, true)`), { code: '42501' });
  const off = await ana.browser.json(`/api/spaces/${acme}/model-processing`, { on: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.modelProcessing.on, false);
  assert.equal(off.body.modelProcessing.offBy, 'Ana');

  const asked = provider.asked.length;
  const recorded = (await owner`select count(*)::int as n from model_calls`)[0].n;
  for (const [who, spaces] of [
    [ana, [acme]],
    [ana, [ana.personalSpaceId, acme]],
    [cara, [cara.personalSpaceId, acme]],
    [ana, [website]],
    // The board is closed, and Dan can't open Acme, but it's in Acme all the same.
    [dan, [board]],
  ] as const) {
    const refused = await refusal(call(who, [...spaces], { purpose: 'sort' }));
    assert.equal(refused.reason, 'model processing off');
    assert.deepEqual(refused.spaces.sort(), spaces.filter((space) => space !== who.personalSpaceId).sort());
  }
  assert.equal(provider.asked.length, asked, 'nothing was sent');
  assert.equal((await owner`select count(*)::int as n from model_calls`)[0].n, recorded, 'nothing was reserved');

  // Each space says so: here, or in a space above, named only to someone who can open it.
  const here = (await cara.browser.json(`/api/spaces/${acme}`)).body.modelProcessing;
  assert.deepEqual({ on: here.on, by: here.offBy, you: here.you, above: here.offAbove }, { on: false, by: 'Ana', you: false, above: false });
  assert.deepEqual((await ana.browser.json(`/api/spaces/${website}`)).body.modelProcessing, { on: false, offAt: null, offBy: null, you: false, offAbove: true, offIn: { id: acme, name: 'Acme' } });
  assert.deepEqual((await dan.browser.json(`/api/spaces/${board}`)).body.modelProcessing, { on: false, offAt: null, offBy: null, you: false, offAbove: true, offIn: null });
  // The database names the space above only to someone who can open it, and says nothing of a space they can't.
  const underneath = (who: Joined, space: string) => withPrincipal(sql, { person: who.id }, (s) => s.tx`select off_above, off_in from model_processing_of(${space}::uuid)`);
  assert.deepEqual([...(await underneath(dan, board))], [{ offAbove: true, offIn: null }]);
  assert.deepEqual([...(await underneath(ana, board))], [{ offAbove: true, offIn: acme }]);
  assert.equal((await underneath(dan, acme)).length, 0);

  // Her personal space has nothing of Acme in it, so a call carrying only that goes.
  await call(ana, [ana.personalSpaceId]);
  assert.equal(provider.asked.length, asked + 1);

  // On again, Acme's content can be sent.
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/model-processing`, { on: true })).body.modelProcessing.on, true);
  await call(dan, [board]);
  assert.equal(provider.asked.length, asked + 2);
});

test('a call naming no space, or a space the person can’t open, is refused, and nothing is sent', async () => {
  const asked = provider.asked.length;
  assert.equal((await refusal(call(ana, []))).reason, 'no access');
  assert.equal((await refusal(call(ana, [beta]))).reason, 'no access');
  assert.equal((await refusal(call(dan, [acme]))).reason, 'no access');
  assert.equal((await refusal(callModel({ sql }, ana.id, { purpose: 'understand', spaces: [acme], messages }))).reason, 'no model');
  assert.equal(provider.asked.length, asked);
});

test('calls made at once never reserve past the monthly limit, counting the ones under way, and wait for them rather than pause', async () => {
  // Room for nine and a half calls this month.
  const worst = worstCase({ input: 2, output: 10 }, inputTokensOf({ messages }), 1_000);
  const limit = Math.round((await counted()) * 100 + 9.5 * worst * 100) / 100;
  const room = Math.floor(((limit - (await counted())) / worst) + 1e-9);
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit })).status, 200);

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  provider.reply = async () => {
    await held;
    return plainReply();
  };
  const asked = provider.asked.length;
  try {
    let decided = 0;
    const attempts = Array.from({ length: 30 }, (_, n) => call(n % 2 ? ana : cara, [acme], { maxTokens: 1_000 }).catch((error: unknown) => {
      decided++;
      return error;
    }));
    // Each call is either under way at the provider or refused, before any of them is answered.
    await until(async () => provider.asked.length === asked + room && decided === 30 - room, 500);
    // Every call under way is held at its worst case, and together they stay within the limit.
    assert.ok((await counted()) <= limit, `${await counted()} counted against ${limit}`);
    release();
    const outcomes = await Promise.all(attempts);
    const refused = outcomes.filter((outcome) => outcome instanceof ModelRefused);
    assert.equal(outcomes.length - refused.length, room);
    assert.equal(provider.asked.length, asked + room);
    // Only the calls under way stood in the way, so the others wait for them, and learning doesn't pause.
    assert.deepEqual([...new Set(refused.map((error) => error.reason))], ['busy']);
    assert.match(refused[0].message, /Try again shortly/);
    assert.ok((await counted()) <= limit);
    assert.equal((await ana.browser.json('/api/model')).body.pausedAt, null);
    await call(ana, [acme], { maxTokens: 1_000 });
  } finally {
    release();
    provider.reply = () => plainReply();
  }
});

test('when what was spent leaves no room for a call, learning pauses and says why, until the limit is set again', async () => {
  // Between one and two cents left: room for a small call, not for one that could cost two.
  const limit = Math.ceil((await counted()) * 100) / 100 + 0.01;
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit })).status, 200);
  const big = { maxTokens: 2_000 };
  const asked = provider.asked.length;
  logged = [];
  const stopped = await refusal(call(ana, [acme], big));
  assert.equal(stopped.reason, 'monthly limit');
  assert.match(stopped.message, /past the limit of \$0\.\d\d, so nothing was sent\. Learning is paused/);
  assert.ok(logged.some((line) => line.includes('model: learning paused at this month’s limit')));
  // Even a call that would fit waits: learning stays paused, rather than going on in fits and starts.
  const paused = await refusal(call(ana, [acme], { maxTokens: 1 }));
  assert.equal(paused.reason, 'paused');
  assert.match(paused.message, /Learning is paused at this month’s limit of \$0\.\d\d.*raise the limit to resume/);
  assert.equal(provider.asked.length, asked);

  // Everyone sees it's paused; only Ida sees what was spent, person by person, never on what.
  const mine = (await ana.browser.json('/api/model')).body;
  assert.ok(mine.pausedAt);
  assert.equal(mine.people, undefined);
  const looking = (await ida.browser.json('/api/admin')).body.model;
  assert.ok(looking.pausedAt);
  assert.equal(looking.provider, provider.url.slice('http://'.length));
  assert.ok(looking.spent > 0 && looking.spent + looking.underWay <= looking.limit);
  const names = looking.people.map((row: { name: string }) => row.name);
  assert.ok(names.includes('Ana') && names.includes('Cara') && !names.includes('Ben') && !names.includes('Ida'), names.join(', '));
  assert.ok(!JSON.stringify(looking).includes(acme), 'never which spaces');

  // Nobody else sees it or sets the limit, through the app or underneath.
  assert.equal((await ana.browser.json('/api/admin')).status, 403);
  assert.equal((await ana.browser.json('/api/admin/model-limit', { limit: 1000 })).status, 403);
  await assert.rejects(withPrincipal(sql, { person: ana.id, direct: true }, (s) => s.tx`select set_model_limit(1000)`), { code: '42501' });
  await assert.rejects(withPrincipal(sql, { person: ana.id }, (s) => s.tx`select * from model_usage_this_month()`), { code: '42501' });
  await assert.rejects(withPrincipal(sql, { person: ida.id, agent: 'Claude' }, (s) => s.tx`select set_model_limit(1000)`), { code: '42501' });
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit: 'lots' })).status, 400);

  // Setting it again, even to the same, resumes: the small call goes, and the big one pauses it again.
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit })).status, 200);
  assert.equal((await ana.browser.json('/api/model')).body.pausedAt, null);
  await call(ana, [acme], { maxTokens: 1 });
  assert.equal((await refusal(call(ana, [acme], big))).reason, 'monthly limit');

  // Raising it resumes with room to spare.
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit: 5 })).status, 200);
  await call(ana, [acme], big);
  assert.equal(provider.asked.length, asked + 2);
  assert.equal((await ana.browser.json('/api/model')).body.pausedAt, null);
  assert.equal((await ida.browser.json('/api/admin')).body.model.limit, 5);
});

test('a call Homing stopped during, and never settled, counts at its worst case', async () => {
  const [{ call: id }] = await withPrincipal(sql, { person: ana.id }, (s) => s.tx`select * from reserve_model_call('understand', 'test/capable', ${s.tx.array([acme])}::uuid[], 0.5)`);
  await owner`update model_calls set started_at = now() - interval '20 minutes' where id = ${id}`;
  await call(ana, [acme]);
  const [stopped] = await owner`select state, cost, cost_from from model_calls where id = ${id}`;
  assert.deepEqual([stopped.state, Number(stopped.cost), stopped.costFrom], ['failed', 0.5, 'worst case']);
  // It can't be settled for less afterwards.
  const [{ settled }] = await withPrincipal(sql, { person: ana.id }, (s) => s.tx`select settle_model_call(${id}::uuid, 'done', 0, 'provider', 1, 1) as settled`);
  assert.equal(settled, false);
});

test('nobody records, settles or reads someone else’s calls underneath', async () => {
  const [{ call: id }] = await withPrincipal(sql, { person: ana.id }, (s) => s.tx`select * from reserve_model_call('understand', 'test/capable', ${s.tx.array([acme])}::uuid[], 0.01)`);
  const [{ settled }] = await withPrincipal(sql, { person: cara.id }, (s) => s.tx`select settle_model_call(${id}::uuid, 'done', 0, 'provider', 1, 1) as settled`);
  assert.equal(settled, false);
  assert.equal((await withPrincipal(sql, { person: cara.id }, (s) => s.tx`select id from model_calls where person_id = ${ana.id}`)).length, 0);
  await assert.rejects(withPrincipal(sql, { person: ana.id }, (s) => s.tx`insert into model_calls (person_id, purpose, model, spaces, reserved) values (${ana.id}, 'sort', 'x', ${s.tx.array([acme])}::uuid[], 0)`), { code: '42501' });
  await assert.rejects(withPrincipal(sql, { person: ana.id }, (s) => s.tx`update model_calls set cost = 0 where person_id = ${ana.id}`), { code: '42501' });
  await assert.rejects(withPrincipal(sql, { person: ana.id }, (s) => s.tx`update model_spending set monthly_limit = 1000`), { code: '42501' });
  await assert.rejects(withPrincipal(sql, { person: ana.id }, (s) => s.tx`update spaces set model_off_at = null where id = ${acme}`), { code: '42501' });
  await withPrincipal(sql, { person: ana.id }, (s) => s.tx`select settle_model_call(${id}::uuid, 'done', 0.001, 'provider', 1, 1)`);
});

test('a provider’s counts and cost are believed only when they could be right, and a call never counts for less than it could have cost', async () => {
  // Room to count even an absurd cost without pausing anything.
  assert.equal((await ida.browser.json('/api/admin/model-limit', { limit: 100_000 })).status, 200);
  const answered = (usage: Record<string, unknown>): Reply => ({ json: { choices: [{ message: { content: 'ok' } }], usage } });
  for (const [why, reply] of [
    ['more tokens in than the request has bytes', answered({ prompt_tokens: 10_000_000, completion_tokens: 10 })],
    ['more out than it may write', answered({ prompt_tokens: 10, completion_tokens: 5_000 })],
    ['nothing counted for an answer', answered({ prompt_tokens: 0, completion_tokens: 0 })],
    ['counts that aren’t counts', answered({ prompt_tokens: 1e300, completion_tokens: -1 })],
  ] as const) {
    provider.reply = () => reply;
    const answer = await call(ana, [acme], { maxTokens: 1_000 });
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual([recorded.costFrom, recorded.inputTokens, recorded.outputTokens, Number(recorded.cost)], ['worst case', null, null, Number(recorded.reserved)], why);
    assert.equal(answer.inputTokens, null, why);
  }
  // A cost past anything one call could be counts at the most Homing ever counts one at, and the log says it was more than reserved.
  logged = [];
  provider.reply = () => ({ json: { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 1e30 } } });
  await call(ana, [acme], { maxTokens: 1_000 });
  assert.equal(Number((await calls(ana)).at(-1)!.cost), 1_000);
  assert.ok(logged.some((line) => /model: a call to test\/capable, for understand, cost \$1000\.00, more than the \$0\.\d+ reserved for it/.test(line)), logged.join('\n'));
  // A negative cost isn't one, so the call is charged by its prices.
  provider.reply = () => ({ json: { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: -5 } } });
  await call(ana, [acme]);
  const negative = (await calls(ana)).at(-1)!;
  assert.deepEqual([negative.costFrom, Number(negative.cost)], ['prices', (10 * 2 + 10 * 10) / 1e6]);
  provider.reply = () => plainReply();
  // So the $1,000 doesn't stay in this month for the tests after.
  await owner`delete from model_calls where cost = 1000`;
});

test('a call whose cost can’t be recorded counts at its worst case, and its answer still comes back', async () => {
  // A database that, for this test, won't take a cost the provider reported.
  await owner`alter table model_calls add constraint refuse_reported_costs check (cost_from is distinct from 'provider') not valid`;
  try {
    const answer = await call(ana, [acme]);
    assert.equal(answer.text, 'Acme’s launch moved to April.');
    const recorded = (await calls(ana)).at(-1)!;
    assert.deepEqual([recorded.state, recorded.costFrom, Number(recorded.cost)], ['done', 'worst case', Number(recorded.reserved)]);
    assert.equal(answer.cost, Number(recorded.reserved));
  } finally {
    await owner`alter table model_calls drop constraint refuse_reported_costs`;
  }
});

test('sharing a space out of a personal space keeps model processing off, as it was there', async () => {
  const { home, kitchen, garden } = await withPrincipal(sql, { person: ana.id, direct: true }, async (s) => {
    const home = await createSpace(s, { name: 'Home', parentId: ana.personalSpaceId });
    const kitchen = await createSpace(s, { name: 'Kitchen', parentId: home });
    const garden = await createSpace(s, { name: 'Garden', parentId: ana.personalSpaceId });
    return { home, kitchen, garden };
  });
  for (const space of [home, garden]) assert.equal((await ana.browser.json(`/api/spaces/${space}/model-processing`, { on: false })).status, 200);
  const [{ modelOffAt: gardenOff }] = await owner`select model_off_at from spaces where id = ${garden}`;

  // Off in Home above it: sharing says it stays off, and it does, on its own now.
  assert.equal((await ana.browser.json(`/api/spaces/${kitchen}/conversion`)).body.modelOff, true);
  for (const space of [kitchen, garden]) {
    const shared = await ana.browser.json(`/api/spaces/${space}/conversion`, { rules: 'drop', in: null });
    assert.equal(shared.status, 200, JSON.stringify(shared.body));
    const now = (await ana.browser.json(`/api/spaces/${space}`)).body.modelProcessing;
    assert.deepEqual({ on: now.on, above: now.offAbove, you: now.you }, { on: false, above: false, you: true });
    assert.equal((await refusal(call(ana, [space]))).reason, 'model processing off');
  }
  // Off itself, it keeps when it was turned off.
  assert.deepEqual((await owner`select model_off_at from spaces where id = ${garden}`)[0].modelOffAt, gardenOff);
});

test('a space exported with model processing off imports with it off, and an older export as it always did', async (t) => {
  t.after(() => owner`update spaces set model_off_at = null, model_off_by = null where id = ${acme}`);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/model-processing`, { on: false })).status, 200);
  const exported = async (space: string) => {
    const response = await ana.browser.fetch(`/api/spaces/${space}/export`);
    assert.equal(response.status, 200);
    return new Uint8Array(await response.arrayBuffer());
  };
  const manifestOf = (zip: Uint8Array) => JSON.parse(strFromU8(unzipSync(zip)['homing.json'])) as { spaces: { name: string; modelProcessing?: string }[] };
  const offIn = async (space: string) => (await ana.browser.json(`/api/spaces/${space}`)).body.modelProcessing.on === false;
  const importer = ana as unknown as Member;

  // Acme says so itself; the spaces in it are off through it, and come back so.
  const acmeZip = await exported(acme);
  assert.deepEqual(manifestOf(acmeZip).spaces.map((space) => `${space.name} ${space.modelProcessing ?? 'on'}`).sort(), ['Acme off', 'Board on', 'Website on']);
  const again = await importAgain(importer, acmeZip, 'Acme again');
  assert.equal(await offIn(again), true);
  const [{ id: websiteAgain }] = await owner`select id from spaces where parent_id = ${again} and name = 'Website'`;
  assert.equal(await offIn(websiteAgain), true);

  // Website alone is off through Acme above it, which the export doesn't hold, so it says so itself.
  const websiteZip = await exported(website);
  assert.equal(manifestOf(websiteZip).spaces[0].modelProcessing, 'off');
  assert.equal(await offIn(await importAgain(importer, websiteZip, 'Website again')), true);

  // An export from before Homing said so imports as it always has.
  const files = unzipSync(acmeZip);
  const older = JSON.parse(strFromU8(files['homing.json']));
  for (const space of older.spaces) delete space.modelProcessing;
  files['homing.json'] = strToU8(JSON.stringify(older));
  assert.equal(await offIn(await importAgain(importer, zipSync(files), 'Acme from before')), false);
});

test('an assistant turns model processing off for a space its person looks after, and only the person turns it back on', async (t) => {
  t.after(() => owner`update spaces set model_off_at = null, model_off_by = null where id = ${acme}`);
  const connected = async (who: Joined) => {
    const assistant = new Assistant(homing.url);
    await assistant.connect(who.browser);
    return assistant.open();
  };
  const hers = await connected(cara);
  try {
    const refused = await hers.call('act', { action: 'space.model_off', input: { space: `space:${acme}` } });
    assert.equal(refused.failed, true);
    assert.match(refused.text, /Only Acme's admins turn model processing off/);
  } finally {
    await hers.close();
  }
  assert.equal((await ana.browser.json(`/api/spaces/${acme}`)).body.modelProcessing.on, true);

  const claude = await connected(ana);
  try {
    const done = await claude.call('act', { action: 'space.model_off', input: { space: 'Acme' } });
    assert.equal(done.failed, false, done.text);
    assert.match(done.text, /^Model processing is off in Acme \(space:[0-9a-f-]+\).*Only the user turns it back on, in its settings in Homing: http/);
    assert.equal((await refusal(call(ana, [website]))).reason, 'model processing off');
    // Nothing of an assistant's turns it on.
    assert.equal((await claude.call('act', { action: 'space.model_on', input: { space: 'Acme' } })).failed, true);
  } finally {
    await claude.close();
  }
  const now = (await ana.browser.json(`/api/spaces/${acme}`)).body.modelProcessing;
  assert.deepEqual([now.on, now.you], [false, true]);
});

test('no prompt, answer or key ever reaches the log, an error or an answer of the app', async () => {
  logged = [];
  const secret = 'Board minutes: the merger with Northwind is off.';
  const said = 'The merger is off, says the board.';
  const errors: string[] = [];
  const wrongKey = `sk-test-${randomBytes(24).toString('hex')}`;
  const attempts: [Model, Reply][] = [
    [model, plainReply(said)],
    // A key the provider doesn't know, which it repeats in its refusal.
    [provider.model({ MODEL_API_KEY: wrongKey }), plainReply(said)],
    // Providers that repeat what they were sent, in a code, a message or a page.
    [model, { status: 400, json: { error: { message: `Can't use: ${secret}`, code: `${secret} ${provider.key}`, type: 'invalid_request_error' } } }],
    [model, { status: 500, json: { error: { message: secret, code: 500 } } }],
    [model, { status: 500, raw: `${secret} ${said} ${provider.key}` }],
    [model, { json: { choices: [{ message: { content: said } }], error: { message: secret } } }],
    [model, { ...plainReply(said), delayMs: 500 }],
  ];
  for (const [using, reply] of attempts) {
    provider.reply = () => reply;
    try {
      await callModel({ sql, model: using }, ana.id, { purpose: 'understand', spaces: [acme], messages: [{ role: 'user', content: secret }], timeoutMs: 200 });
    } catch (error) {
      errors.push(`${(error as Error).message} ${(error as Error).stack}`);
    }
  }
  provider.reply = () => plainReply();
  assert.equal(errors.length, attempts.length - 1);
  assert.ok(errors.some((error) => /answered 401 \(invalid_api_key\)/.test(error)));
  for (const shown of [...logged, ...errors]) {
    for (const hidden of [secret, said, 'merger', provider.key, wrongKey, provider.key.slice(8, 24), wrongKey.slice(8, 24)]) {
      assert.ok(!shown.includes(hidden), `${hidden} in ${shown}`);
    }
  }
  assert.ok(logged.length >= attempts.length - 1, 'each failure is logged, without what it was about');

  // Nor anything the app answers, to anyone.
  for (const [who, path] of [[ida, '/api/admin'], [ana, '/api/model'], [ana, `/api/spaces/${acme}`], [ana, '/api/me']] as const) {
    const text = await (await who.browser.fetch(path)).text();
    assert.ok(!text.includes(provider.key) && !text.includes(provider.key.slice(8, 24)), path);
  }
});
