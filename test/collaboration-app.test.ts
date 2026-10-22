// Issue #87, two people use Homing together. Ana looks after Homing and invites her colleague Cara.
// Each has their own account and their own assistant, and they work in one space: the same page
// looks different to each, with the shared items and only their own private ones; sharing goes
// through the assistant's card and a member's request that an admin approves; and neither finds the
// other's private knowledge, in the app or through their assistant, nor any sign that it exists. The
// steps follow #87's script in order, each through the paths a person and an assistant use.

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { authDatabaseUrl } from '../src/db.ts';
import type { Email } from '../src/email.ts';
import { bundleManifest } from '../src/export.ts';
import { startServer, type Homing } from '../src/server.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { admin, db, member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
/** The emails Homing sent: Cara's invite, and the request to the admins and its outcome. */
const outbox: Email[] = [];

/** Someone signed in to their own browser, with their own assistant in a conversation. */
interface Person {
  name: string;
  id: string;
  email: string;
  browser: Browser;
  /** Calls one of the assistant's tools, as the model does. */
  call(tool: string, args: Record<string, unknown>): Promise<{ text: string; failed: boolean }>;
  /** Calls a tool the way the approval card does, when the person presses its buttons. */
  card(tool: string, args: Record<string, unknown>): Promise<{ text: string; failed: boolean; proposal?: Record<string, any> }>;
}

let ana: Person, cara: Person;
/** Northwind launch, the space they share, and the pages in it that Ana started. */
let launch: string, gunnar: string, vendor: string;
const caraEmail = `cara-${randomBytes(4).toString('hex')}@acme.test`;

// What each keeps to herself about Gunnar, with words nobody else wrote.
const anasSecret = 'Gunnar hinted the budget may be cut after the Fjordkraft merger.';
const carasSecret = 'Gunnar is interviewing at Tidewater, so he may leave by summer.';
let anasItem: string, carasItem: string;

const refOf = (kind: string, text: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];
const app = async (who: Person, path: string, body?: unknown) => {
  const response = await who.browser.json(path, body);
  assert.ok(response.status < 300, `${who.name} ${path}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
};
type PageItem = { id: string; text: string; shared: boolean; by: { name: string } | null; agent: string | null; sharedBy: { name: string } | null; writtenAt: string };
type PageView = { title: string; updatedAt: string; archived: { by: { name: string } | null } | null; items: PageItem[] };
const pageAs = async (who: Person, page: string) => (await app(who, `/api/pages/${page}`)) as PageView;

/** Connects the person's own assistant over OAuth, the way they allow it in Homing. */
async function withAssistant(who: Omit<Person, 'call' | 'card'>): Promise<Person> {
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(who.browser);
  const { call, client } = await assistant.open();
  const card = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
    return { failed: Boolean(result.isError), text, proposal: (result.structuredContent as { proposal?: Record<string, any> } | undefined)?.proposal };
  };
  return { ...who, call, card };
}

/**
 * Everything someone and their assistant see of Gunnar's page, the space and the other's words:
 * the page, the space's pages and overview, what changed on Home, and what search, read and
 * context answer. None of it may move when the other keeps something to herself, not even a time.
 */
async function everything(who: Person) {
  const words = 'Fjordkraft Tidewater merger interviewing';
  const tool = async (name: string, args: Record<string, unknown>) => (await who.call(name, args)).text;
  return {
    page: await app(who, `/api/pages/${gunnar}`),
    pages: await app(who, `/api/spaces/${launch}/pages`),
    found: await app(who, `/api/spaces/${launch}/pages?q=${encodeURIComponent(words)}`),
    overview: await app(who, `/api/spaces/${launch}/overview`),
    changes: await app(who, '/api/changes'),
    search: await app(who, `/api/search?q=${encodeURIComponent(words)}`),
    read: await tool('read', { ref: `page:${gunnar}` }),
    context: await tool('context', { space: `space:${launch}`, request: `What do we know about Gunnar? ${words}` }),
    searched: await tool('search', { query: words }),
  };
}

before(async () => {
  const mailer = async (email: Email) => void outbox.push(email);
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), mailer, cardClients: [assistants.claude.client_id], ...testAssistants });
  // Ana set up this Homing, so she looks after it.
  const joined = await member(homing.url, 'Ana');
  await admin`update people set instance_admin = true where id = ${joined.id}`;
  ana = await withAssistant(joined);

  // Northwind launch, a space of Ana's for the launch with a client, with a rule and what she knows.
  launch = (await app(ana, '/api/spaces', { name: 'Northwind launch', who: 'with others' })).id;
  await app(ana, `/api/spaces/${launch}/rules`, { kind: 'requirement', text: 'Send Northwind prices only through their procurement portal.', shared: true });
  const page = async (title: string, type: string | undefined, text: string) => {
    const id = (await app(ana, `/api/spaces/${launch}/pages`, { title, type, shared: true })).id as string;
    await app(ana, `/api/pages/${id}/items`, { text, shared: true });
    return id;
  };
  gunnar = await page('Gunnar Holm', 'person', 'Gunnar Holm leads the launch at Northwind.');
  await page('Launch plan', 'project', 'The launch is on 14 November.');
  vendor = await page('Old print vendor', undefined, 'Trykkeriet AS printed the 2025 brochures.');
});

after(() => homing.close());

test('1. Ana invites Cara, who joins with a passkey and connects her assistant', async () => {
  const invited = await app(ana, '/api/invites', { email: caraEmail });
  assert.deepEqual([invited.emailed, invited.link], [true, undefined], 'the link goes only to Cara');
  const link = new URL(/https?:\/\/\S+/.exec(outbox.findLast((email) => email.to === caraEmail)!.text)![0]);
  const token = link.hash.slice(1);

  const browser = new Browser(homing.url);
  assert.deepEqual((await browser.json('/api/invite', { token })).body, { instanceAdmin: false, email: caraEmail, invitedBy: 'Ana' });
  const joined = await browser.join(token, { name: 'Cara', email: caraEmail });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal(joined.body.user.emailVerified, true, 'joining from the invite proves the email is hers');

  cara = await withAssistant({ name: 'Cara', id: joined.body.user.id, email: caraEmail, browser });
  const me = await app(cara, '/api/me');
  assert.deepEqual([me.name, me.instanceAdmin, me.assistants.map((assistant: { name: string }) => assistant.name)], ['Cara', false, ['Claude']]);
  // She starts with her personal space only, and Ana's space is closed to her and her assistant.
  assert.deepEqual((await app(cara, '/api/spaces')).spaces.map((space: { personal: boolean }) => space.personal), [true]);
  assert.equal((await cara.browser.json(`/api/spaces/${launch}`)).status, 404);
  assert.doesNotMatch((await cara.call('context', { request: 'When is the Northwind launch?' })).text, /Northwind launch|Gunnar/);
});

test('2. Ana’s assistant proposes adding Cara to the space, Ana approves on the card, and Cara and her assistant get its rules and knowledge', async () => {
  // They share no space yet, so the assistant names Cara by her email.
  const proposed = await ana.call('act', { action: 'members.change', input: { space: `space:${launch}`, person: caraEmail, change: 'add', why: 'Cara runs the launch with me.' } });
  assert.match(proposed.text, /^Waiting for the user's approval \(proposal:.+\)\. Nothing has changed yet\./);
  const id = refOf('proposal', proposed.text);
  assert.equal((await cara.browser.json(`/api/spaces/${launch}`)).status, 404, 'nothing changes before Ana decides');

  // The card shows Ana who it is, and she approves there.
  const shown = (await ana.card('approval', { proposal: id })).proposal!;
  assert.deepEqual([shown.action, shown.member.name, shown.member.email, shown.member.found], ['members', 'Cara', caraEmail, true]);
  assert.equal((await ana.card('decide', { proposal: id, approve: true })).proposal?.state, 'approved');
  assert.match((await ana.call('read', { ref: `proposal:${id}` })).text, /The user approved it on .+, and it applies now\./);

  // Cara sees the space, as a member, with Ana in it.
  const space = await app(cara, `/api/spaces/${launch}`);
  assert.deepEqual([space.name, space.admin, space.members.map((person: { name: string }) => person.name).sort()], ['Northwind launch', false, ['Ana', 'Cara']]);
  // And her assistant gets its rules and knowledge, picking the space from the request.
  const context = (await cara.call('context', { request: 'When is the Northwind launch?' })).text;
  assert.match(context, /^Picked Northwind launch, because the request names it\./);
  assert.match(context, /## Rules\n.+\n- Requirement, from Northwind launch: Send Northwind prices only through their procurement portal\./);
  assert.match(context, /## Pages\n(- .+\n)*- Gunnar Holm \(person\)/);
  assert.match(context, /## Relevant to the request\n[\s\S]*The launch is on 14 November\./);
});

test('3. Both keep something private about Gunnar and share something, and the same page shows each the shared items and only their own', async () => {
  // Ana's assistant keeps what Gunnar hinted, on his page, and a page of her own about it, for Ana
  // alone: Cara sees no trace of either, not a title, a count or a newer time.
  const carasView = await everything(cara);
  const kept = await ana.call('remember', { space: `space:${launch}`, page: 'Gunnar Holm', text: anasSecret });
  assert.match(kept.text, new RegExp(`^Saved on your private side as item:.+, on the page "Gunnar Holm" \\(page:${gunnar}\\)\\.`));
  anasItem = refOf('item', kept.text);
  const risk = await ana.call('remember', { space: `space:${launch}`, page: 'Fjordkraft merger', type: 'risk', text: 'If the merger goes through, Northwind may pause the launch.' });
  assert.match(risk.text, /on the new page "Fjordkraft merger"/);
  assert.deepEqual(await everything(cara), carasView, 'nothing Cara sees moved');

  // Ana adds something for everyone in the app.
  await app(ana, `/api/pages/${gunnar}/items`, { text: 'Gunnar signs off the launch plan.', shared: true });

  // Cara's assistant keeps her own on the same page, which Ana sees no trace of either.
  const anasView = await everything(ana);
  const hers = await cara.call('remember', { space: `space:${launch}`, page: 'Gunnar Holm', text: carasSecret });
  assert.match(hers.text, new RegExp(`on the page "Gunnar Holm" \\(page:${gunnar}\\)`), 'the same page, not one of her own');
  carasItem = refOf('item', hers.text);
  assert.deepEqual(await everything(ana), anasView);

  // And shares something through the card in her conversation: exactly what she was shown.
  const demo = refOf('item', (await cara.call('remember', { space: `space:${launch}`, page: 'Gunnar Holm', text: 'Gunnar wants the demo on 3 December.' })).text);
  const asked = await cara.call('act', { action: 'knowledge.publish', input: { item: `item:${demo}`, why: 'Ana plans the demo too.' } });
  assert.match(asked.text, /Nothing is shared yet/);
  const publication = (await cara.card('approval', { proposal: refOf('proposal', asked.text) })).proposal!.publication;
  assert.deepEqual([publication.text, publication.page, publication.audience.people], ['Gunnar wants the demo on 3 December.', 'Gunnar Holm', 2]);
  assert.equal((await cara.card('decide', { proposal: refOf('proposal', asked.text), approve: true, shown: publication.text })).proposal?.state, 'approved');

  // The same page, as each sees it in the app: what's shared, by whom, and only her own, marked as hers.
  const shared = [
    ['Gunnar Holm leads the launch at Northwind.', true, 'Ana', null],
    ['Gunnar signs off the launch plan.', true, 'Ana', null],
    ['Gunnar wants the demo on 3 December.', true, 'Cara', 'Claude'],
  ];
  const seen = async (who: Person) => (await pageAs(who, gunnar)).items.map((item) => [item.text, item.shared, item.by?.name, item.agent]);
  assert.deepEqual((await seen(ana)).sort(), [...shared, [anasSecret, false, 'Ana', 'Claude']].sort());
  assert.deepEqual((await seen(cara)).sort(), [...shared, [carasSecret, false, 'Cara', 'Claude']].sort());
  assert.equal((await pageAs(ana, gunnar)).items.find((item) => item.text === 'Gunnar wants the demo on 3 December.')?.sharedBy?.name, 'Cara');

  // And through each assistant: read, context and search give the same, own items marked private.
  for (const [who, own, other] of [[ana, anasSecret, carasSecret], [cara, carasSecret, anasSecret]] as const) {
    const read = (await who.call('read', { ref: `page:${gunnar}` })).text;
    const line = (text: unknown) => read.split('\n').find((candidate) => candidate.startsWith(`- ${text} (item:`));
    for (const [text] of shared) assert.match(line(text) ?? '', /, shared, written by /, `${text}, for ${who.name}`);
    assert.equal(line(own), `- ${own} (item:${who === ana ? anasItem : carasItem}, private, written by ${who.name} through Claude)`);
    const context = (await who.call('context', { space: `space:${launch}`, request: 'What do we know about Gunnar?' })).text;
    const search = (await who.call('search', { query: 'Gunnar' })).text;
    for (const answer of [read, context, search]) {
      assert.ok(answer.includes(own), `${who.name} finds her own`);
      assert.ok(!answer.includes(other), `${who.name} never finds the other's`);
    }
  }
});

test('4. Cara’s assistant proposes a shared rule, which she sends to the admins, Ana approves it, and it applies to both; then Ana shares a task, and Cara ticks it off', async () => {
  const rule = 'Show Northwind every design before the demo.';
  const asked = await cara.call('act', { action: 'guidance.propose', input: { space: `space:${launch}`, change: 'add', kind: 'requirement', text: rule, shared: true, why: 'Gunnar asked to see designs first.' } });
  assert.match(asked.text, /Only the space's admins change its shared rules, so this is a request to them/);
  const id = refOf('proposal', asked.text);

  // Cara sends it on the card. Until then Ana doesn't see it, and then she is emailed a link to it.
  assert.equal((await ana.browser.json(`/api/proposals/${id}`)).status, 404);
  outbox.length = 0;
  const sent = await cara.card('decide', { proposal: id, approve: true });
  assert.deepEqual([sent.proposal?.state, sent.proposal?.request.admins], ['requested', ['Ana']]);
  assert.deepEqual(outbox.map((email) => [email.to, email.subject]), [[(await app(ana, '/api/me')).email, 'Cara asks to add a rule to Northwind launch']]);
  assert.ok(outbox[0].text.includes(new URL(`/proposals/${id}`, homing.url).toString()));

  // It waits on Ana's Home, saying who asked, and she approves it on its page, as the space's admin.
  const waiting = (await app(ana, '/api/waiting')).waiting as { id: string; request: { by: string } }[];
  assert.deepEqual(waiting.map((item) => [item.id, item.request.by]), [[id, 'Cara']]);
  const shown = (await app(ana, `/api/proposals/${id}`)).proposal;
  assert.deepEqual([shown.text, shown.request.by, shown.request.why], [rule, 'Cara', 'Gunnar asked to see designs first.']);
  assert.equal((await app(ana, `/api/proposals/${id}/decide`, { approve: true })).proposal.state, 'approved');
  assert.deepEqual(outbox.slice(1).map((email) => [email.to, email.subject]), [[caraEmail, 'Ana approved your request for Northwind launch']]);

  // It applies to both, in the app and through each assistant.
  for (const who of [ana, cara]) {
    const rules = (await app(who, `/api/spaces/${launch}/rules`)).rules as { text: string; shared: boolean }[];
    assert.ok(rules.some((candidate) => candidate.text === rule && candidate.shared), who.name);
    assert.match((await who.call('context', { space: `space:${launch}`, request: 'Prepare the demo' })).text, new RegExp(`- Requirement, from Northwind launch: ${rule}`));
  }
  assert.match((await cara.call('read', { ref: `proposal:${id}` })).text, /An admin of the space approved it/);

  // Ana's assistant keeps a task, and proposes sharing it. Ana shares it on the card, and gives it to Cara.
  const task = refOf('task', (await ana.call('remember', { space: `space:${launch}`, task: { title: 'Send Gunnar the demo agenda', due: '2026-11-28' } })).text);
  assert.ok(!(await app(cara, `/api/spaces/${launch}/tasks`)).open.length, 'Ana’s own until she shares it');
  const share = refOf('proposal', (await ana.call('act', { action: 'task.share', input: { task: `task:${task}`, why: 'Cara sends it.' } })).text);
  const shownTask = (await ana.card('approval', { proposal: share })).proposal!.task;
  assert.equal((await ana.card('decide', { proposal: share, approve: true, shown: shownTask.shown })).proposal?.state, 'approved');
  await app(ana, `/api/tasks/${task}`, { assignee: cara.id });

  // Cara sees it, for her, in the app and through her assistant, and ticks it off in the app.
  const open = (await app(cara, `/api/spaces/${launch}/tasks`)).open as { id: string; shared: boolean; assignee: { you: boolean } }[];
  assert.deepEqual(open.map((item) => [item.id, item.shared, item.assignee.you]), [[task, true, true]]);
  assert.match((await cara.call('context', { space: `space:${launch}`, request: 'What should I do next?' })).text, new RegExp(`## Open tasks\\n.+\\n- Send Gunnar the demo agenda \\(task:${task}, due 2026-11-28, for Cara, shared\\)`));
  await app(cara, `/api/tasks/${task}`, { done: true });

  // Ana sees Cara did it, and her assistant knows it's done.
  const done = (await app(ana, `/api/spaces/${launch}/tasks`)).done as { id: string; done: { by: { name: string } } }[];
  assert.deepEqual(done.map((item) => [item.id, item.done.by.name]), [[task, 'Cara']]);
  assert.match((await ana.call('read', { ref: `task:${task}` })).text, /^# Done: Send Gunnar the demo agenda/);
});

test('5. Each looks for the other’s private items by words only in them, in the app and through the assistant, and finds nothing, nor any sign of them', async () => {
  for (const [who, words, theirs] of [[ana, 'Tidewater interviewing', carasItem], [cara, 'Fjordkraft merger', anasItem]] as const) {
    // In the app: search, and the space's pages.
    assert.deepEqual(await app(who, `/api/search?q=${encodeURIComponent(words)}`), { spaces: [], pages: [], rules: [], skills: [], sources: [], tasks: [] });
    const pages = await app(who, `/api/spaces/${launch}/pages?q=${encodeURIComponent(words)}`);
    assert.deepEqual([pages.pages, pages.total], [[], 0]);

    // Through the assistant: search, and context asked about it.
    assert.equal((await who.call('search', { query: words })).text, 'No matches.');
    const context = (await who.call('context', { space: `space:${launch}`, request: `Is Gunnar ${words}?` })).text;
    assert.doesNotMatch(context, new RegExp(words.replaceAll(' ', '|')));
    assert.ok(!context.includes(theirs));

    // Even with the other's reference, guessed: the same answer as for something that doesn't exist.
    const nothing = randomUUID();
    const guessed = await who.call('read', { ref: `item:${theirs}` });
    assert.deepEqual(guessed, { text: 'There is no item with that reference that you can see.', failed: true });
    assert.deepEqual(guessed, await who.call('read', { ref: `item:${nothing}` }));
    assert.deepEqual(
      await who.call('remember', { replaces: `item:${theirs}`, text: 'Gunnar stays.' }),
      await who.call('remember', { replaces: `item:${nothing}`, text: 'Gunnar stays.' }),
    );
    for (const path of [`/api/items/${theirs}/publication`, `/api/sources/${theirs}`]) {
      assert.deepEqual(await who.browser.json(path), await who.browser.json(path.replace(theirs, nothing)), path);
    }
    assert.deepEqual(await who.browser.json(`/api/items/${theirs}`, { text: 'Gunnar stays.' }), await who.browser.json(`/api/items/${nothing}`, { text: 'Gunnar stays.' }));
    // The page doesn't count it, nor show it, nor change its time for it.
    const page = await pageAs(who, gunnar);
    assert.equal(page.items.length, 4);
    assert.equal(page.updatedAt, page.items.map((item) => item.writtenAt).sort().at(-1));
  }
});

test('a plan adds Cara to a second space and shares what’s known there, and Ana approves it once', async () => {
  // The workshop space is Ana's alone at first, so her assistant creates it at once and keeps what
  // belongs there on her side, sharing one thing and keeping another to herself.
  const workshop = refOf('space', (await ana.call('act', { action: 'space.create', input: { name: 'Northwind workshop', who: 'with others' } })).text);
  const remember = async (text: string) => refOf('item', (await ana.call('remember', { space: `space:${workshop}`, page: 'Workshop', text })).text);
  const venue = await remember('The workshop is in Bergen on 20 November.');
  const doubt = await remember('Ana doubts Gunnar will stay for the whole day.');

  const proposed = await ana.call('act', {
    action: 'plan.propose',
    input: {
      space: `space:${workshop}`,
      changes: [
        { action: 'knowledge.publish', input: { item: `item:${venue}` } },
        { action: 'members.change', input: { person: 'Cara', change: 'add' } },
      ],
      why: 'Cara comes to the workshop.',
    },
  });
  assert.match(proposed.text, /one decision for all 2 changes\. Nothing has changed yet\./);
  const id = refOf('proposal', proposed.text);
  assert.equal((await cara.browser.json(`/api/spaces/${workshop}`)).status, 404);

  // Ana opens it from Home and approves the whole plan at once, as she was shown it.
  const shown = (await app(ana, `/api/proposals/${id}`)).proposal;
  assert.deepEqual([shown.plan.audience.adding, shown.plan.sees.pages], [['Cara'], 1]);
  assert.equal((await app(ana, `/api/proposals/${id}/decide`, { approve: true, shown: shown.plan.shown })).proposal.state, 'approved');

  // Cara sees the space and what was shared, and not what Ana kept to herself.
  const page = (await app(cara, `/api/spaces/${workshop}/pages`)).pages[0];
  assert.deepEqual((await pageAs(cara, page.id)).items.map((item) => [item.text, item.shared]), [['The workshop is in Bergen on 20 November.', true]]);
  const context = (await cara.call('context', { space: `space:${workshop}`, request: 'Where is the workshop?' })).text;
  assert.match(context, /Bergen on 20 November/);
  assert.ok(!context.includes('doubts') && !context.includes(doubt));
  assert.equal((await cara.call('search', { query: 'doubts whole day' })).text, 'No matches.');
});

test('Cara’s export of the space holds Ana’s shared items and her own, and none of Ana’s', async () => {
  // Her assistant gives her the link, and she downloads it, signed in.
  const answer = (await cara.call('act', { action: 'space.export', input: { space: `space:${launch}` } })).text;
  const link = new URL(/https?:\/\/\S+\/export/.exec(answer)![0]);
  const response = await cara.browser.fetch(link.pathname);
  assert.equal(response.status, 200);
  const files = Object.fromEntries(Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer()))).map(([path, bytes]) => [path, strFromU8(bytes)]));
  const all = Object.values(files).join('\n');
  const manifest = bundleManifest((path) => files[path]);

  for (const text of ['Gunnar Holm leads the launch at Northwind.', 'Gunnar signs off the launch plan.', 'Show Northwind every design before the demo.', carasSecret]) {
    assert.ok(all.includes(text), text);
  }
  assert.match(all, new RegExp(`_Private to Cara\\._\\n\\n${carasSecret}`));
  // What's private in it is hers alone, and nothing of Ana's own is in it, not even its reference.
  assert.deepEqual(manifest.items.filter((item) => item.visibility === 'private').map((item) => item.body), [carasSecret]);
  for (const text of [anasSecret, 'Fjordkraft', anasItem]) assert.ok(!all.includes(text), text);
});

test('Cara’s assistant archives a page when she approves it on the card, and Ana sees it archived', async () => {
  const asked = await cara.call('act', { action: 'page.archive', input: { page: `page:${vendor}`, asked: true } });
  assert.match(asked.text, /^Waiting for the user's approval \(proposal:.+\), since others can open Northwind launch\./);
  const id = refOf('proposal', asked.text);
  const shown = (await cara.card('approval', { proposal: id })).proposal!;
  assert.equal((await cara.card('decide', { proposal: id, approve: true, shown: shown.page.shown })).proposal?.state, 'approved');

  // For Ana it's out of the space's pages, archived by Cara, and her assistant leaves it out.
  const pages = await app(ana, `/api/spaces/${launch}/pages`);
  assert.ok(!pages.pages.some((page: { title: string }) => page.title === 'Old print vendor'));
  assert.equal(pages.archived, 1);
  assert.equal((await pageAs(ana, vendor)).archived?.by?.name, 'Cara');
  assert.match((await ana.call('context', { space: `space:${launch}`, request: 'Who prints for us?' })).text, /1 archived page is left out/);
  assert.match((await ana.call('search', { query: 'Trykkeriet' })).text, /On an archived page/);
});
