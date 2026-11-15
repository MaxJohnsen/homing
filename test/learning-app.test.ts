// Issue #132: learning from a connected source (spec §3, §7, §8, §11). Ana works for Acme with
// Cara, and connected her work mailbox there, only for her: a generated one, a few hundred
// conversations over two years. Her assistant starts Homing learning from it, after the
// estimate. The run learns through history in order, pauses at its limit, resumes once Ana raises
// it, survives a restart, switches to following, and picks up a new email, without processing
// anything twice. Ana sees how far it is in the app and through her assistant. Cara, in the same
// space, learns nothing: not that a run exists, what it learned, or what it cost. Microsoft and
// the model's provider are stand-ins. No real mailbox, and no real key.
//
// Learning's worker works on whatever run is due, and the monthly limit is the whole Homing's, so
// this runs in a database of its own.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { connect, withPrincipal, type Sql } from '../src/db.ts';
import type { Model } from '../src/model.ts';
import { startServer, type Homing, type ServerOptions } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { generateMailbox, type Generated } from './mailbox.ts';
import { MicrosoftStandIn, type Account } from './microsoft.ts';
import { ModelStandIn, type Reply } from './model-provider.ts';
import { freshDatabase } from './reset.ts';

interface Joined {
  name: string;
  id: string;
  personalSpaceId: string;
  browser: Browser;
}

let urls: Awaited<ReturnType<typeof freshDatabase>>;
let sql: Sql;
let owner: Sql;
let homing: Homing;
let port: number;
let provider: ModelStandIn;
let microsoft: MicrosoftStandIn;
let model: Model;
let n = 0;

/** A fast worker, so tests don't wait: it looks every few milliseconds, and looks again at a followed place within a second. */
const fast = { tickMs: 15, pollSeconds: 1, leaseSeconds: 30, backoffSeconds: 0 };

const start = (options: Partial<ServerOptions> = {}) =>
  startServer(sql, { port: port ?? 0, host: '127.0.0.1', authDatabase: urls.auth, model: model.settings, microsoft: microsoft.settings(), learner: fast, ...testAssistants, ...options });

before(async () => {
  urls = await freshDatabase('learning');
  sql = connect(urls.app);
  owner = connect(urls.admin);
  provider = await new ModelStandIn().start();
  provider.reply = noteReply;
  model = provider.model();
  microsoft = await new MicrosoftStandIn().start();
  homing = await start();
  port = (homing.server.address() as AddressInfo).port;
});

after(async () => {
  await homing.close();
  await Promise.all([provider.close(), microsoft.close(), sql.end(), owner.end()]);
});

/** What the model was sent about a thread, as the stand-in got it: the emails, by date and subject, and the note it had. */
interface Sent {
  emails: { From: string; Date: string; Subject: string; text: string; quotes?: string }[];
  thread?: unknown[];
  earlierNote?: string;
}
const sentIn = (body: any): Sent => JSON.parse(body.messages[1].content);
/** An email as the model is sent it, as "date, sender, subject", to the minute. */
const keyOf = (email: { at: Date; from: { name: string; address: string }; subject: string }) => `${email.at.toISOString().slice(0, 16).replace('T', ' ')} UTC, ${email.from.name} <${email.from.address}>, ${email.subject}`;
/** Every email the model was sent since a point, as "date, sender, subject". */
const sentSince = (from: number) => provider.asked.slice(from).flatMap((asked) => sentIn(asked.body).emails.map((email) => `${email.Date}, ${email.From}, ${email.Subject}`));

/** The stand-in model writes a note that says which email it read last, and whether it had a note already. */
function noteReply(body: any): Reply {
  const sent = sentIn(body);
  const note = `${sent.emails.at(-1)!.Subject}: noted from ${sent.emails.length} email${sent.emails.length === 1 ? '' : 's'}${sent.earlierNote ? ', again' : ''}.`;
  return { json: { choices: [{ message: { role: 'assistant', content: JSON.stringify({ keep: true, note }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0001 } } };
}

/** Someone who joined this Homing with an invite and a passkey, signed in to their own browser. */
async function join(name: string, at: Homing = homing): Promise<Joined> {
  const browser = new Browser(at.url);
  const token = randomBytes(32).toString('base64url');
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.test`;
  await owner`insert into invites (hash, expires_at, email) values (${createHash('sha256').update(token).digest()}, now() + interval '1 hour', ${email})`;
  const joined = await browser.join(token, { name, email });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const id = joined.body.user.id as string;
  const [{ personalSpaceId }] = await owner`select id as personal_space_id from spaces where private_to = ${id} and parent_id is null`;
  return { name, id, personalSpaceId, browser };
}

/** Someone connects a work account in a space, all the way through Microsoft's page. Returns the place it adds. */
async function connectMailbox(who: Joined, space: string, account: Account): Promise<string> {
  const started = await who.browser.json(`/api/spaces/${space}/connections/microsoft`, {});
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const callback = new URL(microsoft.signIn(started.body.url as string, account));
  const answer = await who.browser.fetch(callback.pathname + callback.search);
  assert.equal(answer.headers.get('location'), `/spaces/${space}/connections?connection=connected`);
  const [{ id }] = await owner<{ id: string }[]>`select p.id from places p join connections c on c.id = p.connection_id where c.person_id = ${who.id} and c.account = ${account.oid}`;
  return id;
}

async function assistantOf(who: Joined, at: Homing = homing) {
  const assistant = new Assistant(at.url);
  await assistant.connect(who.browser);
  return assistant;
}

const work = (who: string): Account => ({ tenant: '7d2b1c9e-0000-4000-8000-0000000ac3e0', oid: crypto.randomUUID(), address: `${who.toLowerCase()}.${++n}@acme.test`, name: `${who} Berg` });

/** Waits until the condition holds, looking every few milliseconds, for at most so many seconds. */
async function until<T>(condition: () => Promise<T | undefined | false>, seconds = 30): Promise<T> {
  const give = Date.now() + seconds * 1000;
  for (;;) {
    const held = await condition();
    if (held) return held;
    if (Date.now() > give) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

/** The run for a place, as the database keeps it. */
const runOf = async (place: string) => (await owner`select * from learning_runs where place_id = ${place}`)[0];
const marksOf = (place: string) => owner`select i.* from learned_items i join learning_runs r on r.id = i.run_id where r.place_id = ${place}`;

/** What learning should do with a generated email, going by what it is, never by the code under test. */
const kept = (email: Generated) => email.kind === 'work' || email.kind === 'receipt';

test('Ana’s assistant starts Homing learning from her mailbox: estimated, learned in order, paused at its limit, resumed, restarted, then following, with nothing twice', async () => {
  const [ana, cara] = [await join('Ana'), await join('Cara')];
  const acme = await withPrincipal(sql, { person: ana.id, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const account = work('Ana');
  const place = await connectMailbox(ana, acme, account);
  const now = new Date();
  const mailbox = generateMailbox({ name: account.name, address: account.address }, { seed: 132, until: now });
  for (const email of mailbox) microsoft.deliver(account, email);
  assert.ok(mailbox.length > 500 && new Set(mailbox.map((email) => email.conversation)).size >= 300, 'a few hundred conversations');
  const anasAssistant = await assistantOf(ana);
  let claude = await anasAssistant.open();
  const learning = `learning:${place}`;

  // Context says Homing can learn from it, with the reference to say so by.
  const context = (await claude.call('context', { request: 'Start learning from my work mailbox, two years back', space: `space:${acme}` })).text;
  assert.ok(context.includes(`Homing can learn from ${account.address} when the user asks (${learning}).`), context);

  // Asked to start, Homing estimates first, from Microsoft's count and a sample, and starts nothing.
  const since = new Date(now.getTime() - 731 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const asked = provider.asked.length;
  const estimated = await claude.call('act', { action: 'learning.start', input: { from: learning, since } });
  assert.ok(!estimated.failed, estimated.text);
  assert.match(estimated.text, /^Nothing has started\. Microsoft counts \d+ emails back to \d{4}-\d{2}-\d{2}\. About \d+ of them need no model and are set aside, and the rest make about \d+ threads for the model to read\. /);
  assert.match(estimated.text, /Estimated model cost: \$\d+\.\d\d–\$\d+\.\d\d, with test\/cheaper at 127\.0\.0\.1:\d+\. The estimate is rough: it goes by that count and a sample of \d+ emails, and the rest may differ\./);
  assert.match(estimated.text, /call learning\.start again with since: \S+ and limit: 1, the limit Homing suggests/);
  assert.equal(Number(/counts (\d+) emails/.exec(estimated.text)![1]), mailbox.length);
  assert.equal(provider.asked.length, asked, 'an estimate calls no model');
  assert.deepEqual([(await runOf(place)).state, (await marksOf(place)).length], ['estimating', 0]);
  // Roughly right, going by the sample: within a third of what the mailbox really holds.
  const about = Number(/set aside, and the rest make about (\d+) threads/.exec(estimated.text)![1]);
  const really = new Set(mailbox.filter(kept).map((email) => email.conversation)).size;
  assert.ok(about > really * 0.6 && about < really * 1.8, `about ${about} threads for ${really}`);

  // Her assistant may start it with the limit Homing suggested, or less, never more.
  const more = await claude.call('act', { action: 'learning.start', input: { from: learning, since, limit: 50 } });
  assert.ok(more.failed && /Only the person sets a higher limit, in Homing itself\./.test(more.text), more.text);
  const started = await claude.call('act', { action: 'learning.start', input: { from: learning, since, limit: 0.01 } });
  assert.ok(!started.failed, started.text);
  assert.match(started.text, new RegExp(`^Started\\. Homing learns from the user's mailbox ${account.address} back to ${since}, in the background, with a limit of \\$0\\.01`));

  // It learns through history, oldest first, until what it spent leaves no room for the next call: then it pauses.
  const paused = await until(async () => {
    const run = await runOf(place);
    return run.state === 'paused' && run;
  });
  assert.equal(paused.reason, 'limit');
  const spent = async () => Number((await owner`select coalesce(sum(coalesce(cost, reserved)), 0) as spent from model_calls where run_id = ${paused.id}`)[0].spent);
  assert.ok((await spent()) <= 0.01 && (await spent()) > 0.0095, `spent ${await spent()}`);
  const atPause = provider.asked.length;
  assert.ok(atPause - asked > 90 && atPause - asked <= 100, `${atPause - asked} calls`);
  // In order: what the model read came oldest first, and history has reached partway.
  const dates = provider.asked.slice(asked).map((one) => sentIn(one.body).emails[0].Date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(paused.learnedUpTo > new Date(since) && paused.learnedUpTo < now);

  // Ana's assistant says where it stands, and can't resume it past the limit, which only Ana raises.
  const read = (await claude.call('read', { ref: learning })).text;
  assert.match(read, new RegExp(`^# Learning from the user's mailbox ${account.address}\n${learning}\\. Only the user sees it, at ${homing.url}spaces/${acme}/connections\\.`));
  assert.match(read, /It is paused at its limit of \$0\.01, which only the user raises, in Homing\./);
  assert.match(read, /Learned from \d+ threads, \d+ emails in all/);
  assert.match(read, /Set aside without learning from them: .*\d+ newsletters/);
  assert.match(read, /Spent \$0\.0\d+ of its limit of \$0\.01 on history\./);
  const resumed = await claude.call('act', { action: 'learning.resume', input: { from: learning } });
  assert.ok(resumed.failed && /It is paused at its limit of \$0\.01\. Only the user raises it, in Homing, which resumes it/.test(resumed.text), resumed.text);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(provider.asked.length, atPause, 'paused, nothing more is sent');

  // In the app Ana sees the same, in the space's Connections, and raises the limit there, which resumes it.
  const shown = (await ana.browser.json(`/api/spaces/${acme}/connections`)).body.places[0];
  assert.equal(shown.learns, true);
  assert.deepEqual([shown.learning.state, shown.learning.reason, shown.learning.limit], ['paused', 'limit', 0.01]);
  assert.ok(shown.learning.spent > 0.0095 && shown.learning.threads > 30 && shown.learning.setAside.some((aside: { reason: string }) => aside.reason === 'newsletter'));
  assert.equal((await ana.browser.json(`/api/places/${place}/learning/limit`, { limit: 5 })).status, 200);
  await until(async () => provider.asked.length > atPause + 20);

  // Homing restarts in the middle of it. The run carries on where it was.
  await homing.close();
  const before = (await marksOf(place)).length;
  assert.ok((await runOf(place)).state === 'learning history' && before < mailbox.length);
  homing = await start();
  claude = await anasAssistant.open();

  // Having caught up, it follows what arrives.
  const following = await until(async () => {
    const run = await runOf(place);
    return run.state === 'following' && run;
  }, 60);
  assert.ok(following.caughtUpAt);
  // Every email was processed, each once: what a model should read was sent to it, what needs none never was.
  const marks = await marksOf(place);
  assert.equal(marks.length, mailbox.length);
  const sent = sentSince(asked);
  assert.equal(new Set(sent).size, sent.length, 'no email was sent twice');
  assert.equal(sent.length, mailbox.filter(kept).length);
  assert.deepEqual([...sent].sort(), mailbox.filter(kept).map(keyOf).sort());
  for (const email of mailbox.filter((email) => !kept(email))) assert.ok(!sent.includes(keyOf(email)), email.subject);
  const count = (reason: string) => marks.filter((mark) => mark.reason === reason).length;
  const of = (kind: Generated['kind']) => mailbox.filter((email) => email.kind === kind).length;
  assert.deepEqual(
    [count('newsletter'), count('automated'), count('junk'), count('draft'), marks.filter((mark) => mark.outcome === 'learned').length],
    [of('newsletter'), of('automated'), of('junk'), of('draft'), mailbox.filter(kept).length],
  );

  // What each thread taught is a note on Ana's private side in Acme, written by Homing, citing its emails as read by Homing.
  const notes = await owner`select c.id, c.body, c.private_to, c.space_id, c.agent, c.written_by from content c where c.id in (select note from learned_items where run_id = ${following.id})`;
  assert.equal(notes.length, really, 'one note for each thread');
  assert.ok(notes.every((note) => note.privateTo === ana.id && note.spaceId === acme && note.agent === 'Homing' && note.writtenBy === ana.id));
  const sources = await owner`select s.* from sources s where s.id in (select source_id from citations where content_id in ${owner(notes.map((note) => note.id))})`;
  assert.equal(sources.length, mailbox.filter(kept).length);
  assert.ok(sources.every((source) => source.privateTo === ana.id && source.spaceId === acme && source.readThrough && source.reference.startsWith(`microsoft:${place}:`)));
  // A thread that came again, as with a later correction, kept its one note, written again from the new email with the note it had, the earlier wording in its history.
  const perThread = await owner`select thread, count(distinct note)::integer as notes from learned_items where run_id = ${following.id} and outcome = 'learned' group by thread`;
  assert.ok(perThread.every((thread) => thread.notes === 1));
  const again = notes.filter((note) => note.body.endsWith(', again.'));
  assert.ok(again.length > 20, `${again.length} threads came again`);
  assert.ok(provider.asked.slice(asked).filter((one) => sentIn(one.body).earlierNote).length >= again.length);
  const [{ revisions }] = await owner`select count(distinct content_id)::integer as revisions from revisions where content_id in ${owner(again.map((note) => note.id))}`;
  assert.equal(revisions, again.length);

  // A new email arrives. Homing looks again within the second, learns from it, and from nothing else.
  const then = provider.asked.length;
  const gunnar = { name: 'Gunnar Lie', address: 'gunnar@northwind.test' };
  microsoft.deliver(account, { from: gunnar, to: [{ name: account.name, address: account.address }], subject: 'Northwind steering group', html: '<p>Hi Ana,</p><p>The Northwind steering group meets on 3 December at ten.</p><p>Gunnar</p>', at: new Date() });
  microsoft.deliver(account, { from: { name: 'The Weekly Digest', address: 'news@weekly-digest.test' }, subject: 'This week in consulting, issue 999', html: '<p>Read on.</p>', at: new Date(), headers: { 'List-Unsubscribe': '<https://weekly-digest.test/u>' } });
  await until(async () => (await marksOf(place)).length === mailbox.length + 2);
  assert.deepEqual(sentSince(then).map((one) => one.split(', ').at(-1)), ['Northwind steering group']);
  // It costs what following costs, against the monthly limit, not the run's.
  const [last] = await owner`select run_history, cost from model_calls where run_id = ${following.id} order by started_at desc limit 1`;
  assert.equal(last.runHistory, false);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(provider.asked.length, then + 1, 'looking again finds nothing new, and sends nothing');

  // Ana's assistant finds what Homing learned, and sees the run follow. So does Ana, in the app.
  const found = await claude.call('search', { query: 'steering group noted' });
  assert.match(found.text, /Northwind steering group: noted from 1 email\./);
  assert.match((await claude.call('context', { request: 'Northwind', space: `space:${acme}` })).text, new RegExp(`Homing learns from ${account.address}: history learned back to ${since}, now following what arrives \\(${learning}\\)\\.`));
  const followed = (await ana.browser.json(`/api/spaces/${acme}/connections`)).body.places[0].learning;
  assert.deepEqual([followed.state, followed.caughtUp, followed.learned], ['following', true, mailbox.filter(kept).length + 1]);
  assert.ok(followed.followed > 0 && followed.spent < 5);

  // Cara, in the same space, learns nothing: not in the app, not through her assistant, not by Ana's references.
  const caras = await (await assistantOf(cara)).open();
  const forCara = (await cara.browser.json(`/api/spaces/${acme}/connections`)).body;
  assert.deepEqual(forCara.places, []);
  const carasContext = (await caras.call('context', { request: 'Northwind steering group', space: `space:${acme}` })).text;
  assert.doesNotMatch(carasContext, /learn|mailbox|steering|noted/i);
  for (const query of ['steering group', 'noted', 'Northwind', account.address, 'learning']) {
    assert.doesNotMatch((await caras.call('search', { query, space: `space:${acme}` })).text, /noted|steering|Gunnar|learning:/i, query);
    const inApp = (await cara.browser.json(`/api/search?q=${encodeURIComponent(query)}`)).body;
    assert.deepEqual([inApp.pages, inApp.sources], [[], []], query);
  }
  // The same searches find it for Ana, so they'd show a leak.
  const anas = (await ana.browser.json('/api/search?q=steering%20group')).body;
  assert.ok(anas.pages.length > 0 && anas.sources.length > 0);
  const missing = await caras.call('read', { ref: `learning:${crypto.randomUUID()}` });
  const hers = await caras.call('read', { ref: learning });
  assert.ok(hers.failed && missing.failed);
  assert.equal(hers.text, missing.text);
  assert.equal(hers.text, 'There is no learning with that reference that you can see.');
  for (const [action, input] of [
    ['learning.pause', {}], ['learning.resume', {}], ['learning.start', { since }], ['learning.start', { since, limit: 1 }], ['learning.extend', { since: '2020-01-01' }], ['learning.leave_out', { senders: ['gunnar@northwind.test'] }],
  ] as const) {
    const answer = await caras.call('act', { action, input: { from: learning, ...input } });
    assert.ok(answer.failed, action);
    assert.equal(answer.text, hers.text, action);
  }
  for (const [path, body] of [['estimate', { since }], ['start', { limit: 1 }], ['pause', {}], ['resume', {}], ['extend', { since: '2020-01-01' }], ['limit', { limit: 100 }], ['left-out', { senders: ['x@y.test'], folders: [] }]] as const) {
    const [theirs, none] = [await cara.browser.json(`/api/places/${place}/learning/${path}`, body), await cara.browser.json(`/api/places/${crypto.randomUUID()}/learning/${path}`, body)];
    assert.deepEqual([theirs.status, theirs.body], [404, none.body], path);
  }
  // Her pages, sources and counts there hold nothing of it, nor does the space's overview or what changed, and what she spent says nothing.
  const [pages, kept2] = [(await cara.browser.json(`/api/spaces/${acme}/pages`)).body, (await cara.browser.json(`/api/spaces/${acme}/sources`)).body];
  assert.deepEqual([pages.pages, pages.total, kept2.sources, kept2.total], [[], 0, [], 0]);
  for (const path of [`/api/spaces/${acme}/overview`, '/api/changes', `/api/spaces/${acme}`, '/api/connections', '/api/waiting']) {
    assert.doesNotMatch(JSON.stringify((await cara.browser.json(path)).body), /noted|Emails in|learn|mailbox|acme\.test/i, path);
  }
  assert.deepEqual((await cara.browser.json('/api/model')).body.uses, []);
  // Ana's own show it, so they'd show a leak.
  assert.ok((await ana.browser.json(`/api/spaces/${acme}/pages`)).body.total > 10);
  assert.match(JSON.stringify((await ana.browser.json('/api/changes')).body), /noted/);
  assert.equal((await ana.browser.json('/api/model')).body.uses[0].calls, provider.asked.length - asked);
  // The run is untouched by all of it.
  assert.deepEqual([(await runOf(place)).state, (await runOf(place)).spendingLimit], ['following', '5.00']);
  await claude.close();
  await caras.close();
});

test('Ana leaves out a sender and a folder, and pauses, resumes and extends her run, in the app and through her assistant', async () => {
  const ana = await join('Ana');
  const acme = await withPrincipal(sql, { person: ana.id, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  const account = work('Ana');
  const place = await connectMailbox(ana, acme, account);
  const now = new Date();
  const mailbox = generateMailbox({ name: account.name, address: account.address }, { seed: 7, conversations: 200, days: 300, until: now });
  for (const email of mailbox) microsoft.deliver(account, email);
  const claude = await (await assistantOf(ana)).open();
  const learning = `learning:${place}`;
  const days = (count: number) => new Date(now.getTime() - count * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const shown = async () => (await ana.browser.json(`/api/spaces/${acme}/connections`)).body;
  const post = (path: string, body: unknown = {}) => ana.browser.json(`/api/places/${place}/learning/${path}`, body);
  const asked = provider.asked.length;

  // In the app, Ana sees that Homing can learn from it and which provider would read it, and asks what the last 100 days would cost.
  assert.deepEqual([(await shown()).places[0].learns, (await shown()).places[0].learning, (await shown()).model.cheaper], [true, null, 'test/cheaper']);
  assert.equal((await post('estimate', {})).status, 400);
  assert.equal((await post('estimate', { since: days(100) })).status, 200);
  const estimated = (await shown()).places[0].learning;
  assert.equal(estimated.state, 'estimating');
  assert.equal(estimated.estimate.items, mailbox.filter((email) => email.at >= new Date(days(100))).length);
  assert.ok(estimated.estimate.low <= estimated.estimate.high && estimated.estimate.limit === 1 && estimated.estimate.sampled > 0);

  // Before it starts, she leaves out her receipts folder, in the app, and Tor's forwards, through her assistant.
  assert.equal((await post('left-out', { senders: [], folders: ['Receipts'] })).status, 200);
  const left = await claude.call('act', { action: 'learning.leave_out', input: { from: learning, senders: ['Tor@acme.test'] } });
  assert.ok(!left.failed && left.text.startsWith('Left out'), left.text);
  assert.deepEqual((await shown()).places[0].learning.leftOut, { senders: ['tor@acme.test'], folders: ['Receipts'] });
  assert.equal((await post('start', { limit: 'lots' })).status, 400);
  assert.equal((await post('start', { limit: 2 })).status, 200);
  await until(async () => (await runOf(place)).state === 'following');

  // What she left out was set aside, counted, and never sent.
  const inScope = mailbox.filter((email) => email.at >= new Date(days(100)));
  const marks = await marksOf(place);
  const count = (reason: string) => marks.filter((mark) => mark.reason === reason).length;
  const [receipts, tors] = [inScope.filter((email) => email.kind === 'receipt'), inScope.filter((email) => email.from.address === 'tor@acme.test')];
  assert.ok(receipts.length > 0 && tors.length > 0);
  assert.deepEqual([count('excluded folder'), count('excluded sender')], [receipts.length, tors.length]);
  const sent = sentSince(asked);
  for (const email of [...receipts, ...tors]) assert.ok(!sent.includes(keyOf(email)), email.subject);
  assert.deepEqual([...sent].sort(), inScope.filter((email) => kept(email) && !receipts.includes(email) && !tors.includes(email)).map(keyOf).sort());
  assert.equal(marks.length, inScope.length);
  const progress = (await shown()).places[0].learning;
  assert.deepEqual(progress.setAside.filter((aside: { reason: string }) => aside.reason.startsWith('excluded')).map((aside: { words: string }) => aside.words).sort(), [
    `${receipts.length} in folders you left out`, `${tors.length} from senders you left out`,
  ].sort());
  const read = (await claude.call('read', { ref: learning })).text;
  assert.ok(read.includes(`${tors.length} from senders the user left out`) && read.includes('Leaves out mail from "tor@acme.test".') && read.includes('Leaves out the folders "Receipts".'), read);

  // Her assistant pauses it, and she resumes it in the app.
  const paused = await claude.call('act', { action: 'learning.pause', input: { from: learning } });
  assert.match(paused.text, /^Paused\. Homing keeps where it is/);
  assert.deepEqual([(await shown()).places[0].learning.state, (await shown()).places[0].learning.reason], ['paused', 'person']);
  assert.match((await claude.call('context', { request: 'mail', space: `space:${acme}` })).text, new RegExp(`Homing learns from ${account.address}: paused \\(${learning}\\)\\.`));
  assert.equal((await post('resume')).status, 200);
  assert.equal((await shown()).places[0].learning.state, 'following');
  assert.match((await claude.call('act', { action: 'learning.resume', input: { from: learning } })).text, /isn't paused, so nothing changed/);
  assert.equal((await post('pause')).status, 200);
  assert.match((await claude.call('act', { action: 'learning.resume', input: { from: learning } })).text, /^Resumed\./);

  // Her assistant extends it to the whole mailbox: only what that adds is learned from, under the same limit, which only she raises.
  const then = provider.asked.length;
  const extended = await claude.call('act', { action: 'learning.extend', input: { from: learning, since: days(301) } });
  assert.ok(!extended.failed, extended.text);
  assert.match(extended.text, new RegExp(`^Extended\\. Homing also learns from the user's mailbox ${account.address} back to ${days(301)}, and only from what that adds\\. Microsoft counts ${mailbox.length - inScope.length} emails from ${days(301)} to ${days(100)}\\.`));
  assert.match(extended.text, /Its limit stays \$2\.00, with \$1\.9\d+ left, and it pauses there\. Only the user raises it, in Homing/);
  await until(async () => (await runOf(place)).state === 'following' && (await marksOf(place)).length === mailbox.length);
  const added = sentSince(then);
  assert.equal(new Set([...sent, ...added]).size, sent.length + added.length, 'nothing was sent twice');
  const older = mailbox.filter((email) => email.at < new Date(days(100)));
  assert.equal(added.length, older.filter((email) => kept(email) && email.kind !== 'receipt' && email.from.address !== 'tor@acme.test').length);
  assert.match((await claude.call('act', { action: 'learning.extend', input: { from: learning, since: days(200) } })).text, /already learns from .* back to .*, so nothing changed/);
  assert.equal((await post('extend', { since: days(200) })).status, 409);

  // She takes Tor off the list again, through her assistant, and raises the limit in the app.
  await claude.call('act', { action: 'learning.leave_out', input: { from: learning, senders: ['tor@acme.test'], remove: true } });
  assert.deepEqual((await shown()).places[0].learning.leftOut, { senders: [], folders: ['Receipts'] });
  assert.equal((await post('limit', { limit: '$10' })).status, 200);
  assert.equal((await shown()).places[0].learning.limit, 10);
  // Started, it isn't estimated or started again.
  assert.equal((await post('estimate', { since: days(10) })).status, 409);
  assert.equal((await post('start', { limit: 1 })).status, 409);
  const twice = await claude.call('act', { action: 'learning.start', input: { from: learning, since: days(10) } });
  assert.ok(twice.failed && /Homing already learns from/.test(twice.text), twice.text);
  await claude.close();
});

test('without a model, starting to learn says plainly that Homing has none, and nothing runs', async () => {
  // This Homing has no model, and it's the only one running on the database.
  await homing.close();
  const bare = await start({ port: 0, model: null });
  try {
    const ana = await join('Ana', bare);
    const acme = await withPrincipal(sql, { person: ana.id, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
    const account = work('Ana');
    const place = await connectMailbox(ana, acme, account);
    microsoft.deliver(account, { from: { name: 'Gunnar Lie', address: 'gunnar@northwind.test' }, subject: 'Budget', html: '<p>The budget is approved.</p>', at: new Date(Date.now() - 86_400_000) });
    const claude = await (await assistantOf(ana, bare)).open();
    const [asked, graph] = [provider.asked.length, microsoft.asked.graph];
    const none = 'Homing has no model set up, so it can’t learn from a connected source yet. Whoever looks after Homing can set one up.';

    // Context offers nothing that can't work, and asking for it anyway says why not.
    assert.doesNotMatch((await claude.call('context', { request: 'Learn from my mailbox', space: `space:${acme}` })).text, /learn/i);
    for (const input of [{ since: '2025-01-01' }, { since: '2025-01-01', limit: 1 }]) {
      const answer = await claude.call('act', { action: 'learning.start', input: { from: `learning:${place}`, ...input } });
      assert.ok(answer.failed);
      assert.equal(answer.text, none);
    }
    assert.ok((await claude.call('read', { ref: `learning:${place}` })).text.endsWith(`Homing hasn’t learned from it. ${none}`));
    const inApp = await ana.browser.json(`/api/places/${place}/learning/estimate`, { since: '2025-01-01' });
    assert.deepEqual([inApp.status, inApp.body.message], [409, none]);
    const shown = (await ana.browser.json(`/api/spaces/${acme}/connections`)).body;
    assert.deepEqual([shown.model, shown.places[0].learns, shown.places[0].learning], [null, true, null]);

    // Nothing was estimated, started, fetched or sent, and no worker runs to pick anything up.
    assert.equal(await runOf(place), undefined);
    assert.deepEqual([provider.asked.length, microsoft.asked.graph], [asked, graph]);
    // Even a run that was started while Homing had a model stays where it is.
    await owner`
      insert into learning_runs (place_id, connection_id, space_id, private_to, since, state, spending_limit, estimate)
      select p.id, p.connection_id, p.space_id, p.private_to, now() - interval '30 days', 'learning history', 5, null from places p where p.id = ${place}
    `;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual([(await runOf(place)).checkpoint, (await marksOf(place)).length, provider.asked.length, microsoft.asked.graph], [null, 0, asked, graph]);
    assert.match((await claude.call('read', { ref: `learning:${place}` })).text, /Homing has no model set up now, so it waits\.$/);
    const resumed = await ana.browser.json(`/api/places/${place}/learning/resume`, {});
    assert.deepEqual([resumed.status, resumed.body.message], [409, none]);
    await owner`update learning_runs set state = 'done', reason = 'removed' where place_id = ${place}`;
    await claude.close();
  } finally {
    await bare.close();
    homing = await start();
  }
});
