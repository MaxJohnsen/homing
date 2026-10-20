// Issue #32, sharing private knowledge with a space (spec §5). An assistant proposes it, and the
// person approves exactly what's shared, seeing what it rests on that the space can't see. What was
// written without anything hidden moves to the shared side. What rests on private sources, or
// another space's, is shared as a copy: others see it as shared by its owner, and nothing of the
// private original, its history or its sources.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addSource, createPage, search, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, beta: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

type Shown = { action: string; state: string; publication: { text: string; page: string; hidden: { space: string | null; reference: string | null }[]; copy: boolean; sharesTitle: boolean; sharedText: string | null; current: boolean; audience: { people: number } } };
type PageItem = { id: string; text: string; shared: boolean; agent: string | null; sharedBy: { name: string; you: boolean } | null; sources: { reference: string; shared: boolean }[]; earlier: unknown[] };

const publish = async (item: string, why?: string) => {
  const result = await claude.client.callTool({ name: 'act', arguments: { action: 'knowledge.publish', input: { item: `item:${item}`, ...(why && { why }) } } });
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
  return { failed: Boolean(result.isError), text, proposal: /proposal:([0-9a-f-]{36})/.exec(text)?.[1] };
};
const shown = async (id: string) => (await ana.browser.json(`/api/proposals/${id}`)).body.proposal as Shown;
/** Deciding as the page does: approving sends the text Ana was shown. */
const decide = async (id: string, approve = true, shownText?: string | null) => {
  const text = shownText === null ? undefined : (shownText ?? (await shown(id)).publication.text);
  return ana.browser.json(`/api/proposals/${id}/decide`, { approve, ...(text !== undefined && { shown: text }) });
};
const pageAs = async (who: Member, page: string) => (await who.browser.json(`/api/pages/${page}`)).body as { items: PageItem[]; title: string };

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    cardClients: [assistants.claude.client_id],
  });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, beta } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return { acme, beta: await createSpace(s, { name: 'Beta' }) };
  }));
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('what rests on a private email is shared as a copy: the others see it as Ana’s, and nothing of where it came from', async () => {
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Launch' });
    const email = await addSource(s, { spaceId: acme, reference: 'Email from Gunnar, Re: launch', excerpt: 'We move the launch to 14 November.' });
    const item = await writeItem(s, { pageId: page, body: 'The launch is on 14 November.', sources: [email.id] });
    return { page, item: item.id };
  });
  await as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, item, { body: 'The launch is on 14 November, in Oslo.' }));

  const proposed = await publish(item, 'Cara plans the launch too.');
  assert.ok(!proposed.failed, proposed.text);
  assert.match(proposed.text, /Nothing is shared yet/);
  const { publication } = await shown(proposed.proposal!);
  assert.deepEqual(
    [publication.text, publication.page, publication.hidden, publication.copy, publication.sharesTitle, publication.audience.people],
    ['The launch is on 14 November, in Oslo.', 'Launch', [{ space: null, reference: 'Email from Gunnar, Re: launch' }], true, true, 2],
  );
  // Asking twice doesn't make two.
  assert.match((await publish(item)).text, /already waits for the user/);
  assert.equal((await cara.browser.json(`/api/pages/${page}`)).status, 404, 'nothing is shared before Ana decides');

  // What Ana saw is what's shared: without it, or if it changed meanwhile, she's shown it again.
  assert.equal((await decide(proposed.proposal!, true, null)).status, 409);
  assert.equal((await decide(proposed.proposal!, true, 'Something else')).status, 409);
  assert.equal((await decide(proposed.proposal!, true, publication.text)).status, 200);

  const forCara = await pageAs(cara, page);
  assert.equal(forCara.title, 'Launch');
  // Claude still wrote it, for Ana, and Ana shared it.
  assert.deepEqual(forCara.items.map((entry) => [entry.text, entry.shared, entry.agent, entry.sharedBy?.name, entry.sources.length, entry.earlier.length]), [
    ['The launch is on 14 November, in Oslo.', true, 'Claude', 'Ana', 0, 0],
  ]);
  assert.equal((await cara.browser.json(`/api/items/${item}`)).status, 404);
  // Ana sees it once while her own and the shared one agree, with her own source, only hers.
  assert.deepEqual((await pageAs(ana, page)).items.map((entry) => [entry.shared, entry.sharedBy?.you, entry.sources.map((source) => [source.reference, source.shared])]), [
    [true, true, [['Email from Gunnar, Re: launch', false]]],
  ]);
  assert.equal((await as(ana, (s) => search(s, 'Oslo', { spaceId: acme }))).length, 1, 'search shows it once too');
  const latest = (await cara.browser.json('/api/changes?limit=1')).body.changes as { text: string }[];
  assert.equal(latest[0].text, 'The launch is on 14 November, in Oslo.');
  assert.match((await claude.call('read', { ref: `proposal:${proposed.proposal}` })).text, /The user shared it on .+\. Everyone in the space sees it now\./);
});

test('what was written without anything hidden simply moves to the shared side, its history still Ana’s', async () => {
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Office' });
    return { page, item: (await writeItem(s, { pageId: page, body: 'The office closes at 17.' })).id };
  });
  await as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, item, { body: 'The office closes at 16 on Fridays.' }));
  const proposed = await publish(item);
  assert.equal((await shown(proposed.proposal!)).publication.copy, false);
  assert.equal((await decide(proposed.proposal!)).status, 200);
  const [row] = await admin`select private_to, published_by from content where id = ${item}`;
  assert.deepEqual([row.privateTo, row.publishedBy], [null, ana.id]);
  const forCara = await pageAs(cara, page);
  assert.deepEqual(forCara.items.map((entry) => [entry.id, entry.text, entry.earlier.length]), [[item, 'The office closes at 16 on Fridays.', 0]]);
});

test('what rests on another space names it, and sharing again updates what everyone sees', async () => {
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Pricing', shared: true });
    const betaNote = await addSource(s, { spaceId: beta, reference: 'Beta’s price list', excerpt: 'Beta pays 1,200 a day.', shared: true });
    return { page, item: (await writeItem(s, { pageId: page, body: 'Our rate is about 1,200 a day.', sources: [betaNote.id] })).id };
  });
  const first = await publish(item);
  assert.deepEqual((await shown(first.proposal!)).publication.hidden, [{ space: 'Beta', reference: null }]);
  await decide(first.proposal!);
  assert.ok((await pageAs(cara, page)).items.some((entry) => entry.text === 'Our rate is about 1,200 a day.'));

  // Ana's own version moves on; she sees both until she shares it again.
  await as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, item, { body: 'Our rate is 1,250 a day.' }));
  assert.equal((await pageAs(ana, page)).items.length, 2);
  const again = await publish(item);
  assert.equal((await shown(again.proposal!)).publication.sharedText, 'Our rate is about 1,200 a day.');
  await decide(again.proposal!);
  assert.deepEqual((await pageAs(cara, page)).items.map((entry) => [entry.text, entry.earlier.length]), [['Our rate is 1,250 a day.', 1]]);
  assert.equal((await pageAs(ana, page)).items.length, 1);
});

test('only people share, only their own, and never from a personal space', async () => {
  const { personal, mine } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const personal = await createPage(s, { spaceId: ana.personalSpaceId, title: 'Diary' });
    const page = await createPage(s, { spaceId: acme, title: 'Draft' });
    return { personal: (await writeItem(s, { pageId: personal, body: 'Dear diary.' })).id, mine: (await writeItem(s, { pageId: page, body: 'A draft.' })).id };
  });
  assert.match((await publish(personal)).text, /Your personal space has no shared side/);
  // The assistant itself can't share, straight against the database either.
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select publish_item(${mine}::uuid, 'A draft.')`), refused);
  // Nor can Cara share Ana's private item, which she can't see.
  await assert.rejects(as({ person: cara.id, direct: true }, (s) => s.tx`select publish_item(${mine}::uuid, 'A draft.')`), refused);
  const caraAssistant = new Assistant(homing.url, assistants.claude);
  await caraAssistant.connect(cara.browser);
  const caras = await caraAssistant.open();
  assert.match((await caras.call('act', { action: 'knowledge.publish', input: { item: `item:${mine}` } })).text, /no item of yours/);
});

test('a chain of private updates is shared as one, replacing for everyone what it updates', async () => {
  const { page, shared, second } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Venue', shared: true });
    const shared = (await writeItem(s, { pageId: page, body: 'The venue is Hotel Oslo.', shared: true })).id;
    const first = (await supersedeItem(s, shared, { body: 'The venue is Hotel Bergen.' }))!.id;
    const second = (await supersedeItem(s, first, { body: 'The venue is Hotel Bergen, room 2.' }))!.id;
    return { page, shared, second };
  });
  const proposed = await publish(second);
  assert.equal((await shown(proposed.proposal!)).publication.copy, true);
  await decide(proposed.proposal!);
  // Cara sees the update in place of what it updated, and only that.
  assert.deepEqual((await pageAs(cara, page)).items.map((entry) => entry.text), ['The venue is Hotel Bergen, room 2.']);
  assert.equal((await pageAs(ana, page)).items.length, 1);
  assert.ok(shared);
});

test('in the app, Ana shares her own items straight from the page, after seeing what it would do', async () => {
  const { page, shared, update, email } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Budget', shared: true });
    const shared = (await writeItem(s, { pageId: page, body: 'The budget is 400,000.', shared: true })).id;
    const update = (await supersedeItem(s, shared, { body: 'The budget is 450,000.' }))!.id;
    const source = await addSource(s, { spaceId: acme, reference: 'Email from finance', excerpt: 'Approved: 30,000 more for travel.' });
    const email = (await writeItem(s, { pageId: page, body: 'Travel has 30,000 more.', sources: [source.id] })).id;
    return { page, shared, update, email };
  });
  // Her newer version says what the others still see.
  const before = (await ana.browser.json(`/api/pages/${page}`)).body.items as PageItem[];
  assert.ok(before.some((entry) => entry.id === update));

  const what = await ana.browser.json(`/api/items/${update}/publication`);
  assert.deepEqual([what.status, what.body.text, what.body.copy, what.body.sharesTitle], [200, 'The budget is 450,000.', false, false]);
  assert.equal((await cara.browser.json(`/api/items/${update}/publication`)).status, 404);
  assert.equal((await ana.browser.json(`/api/items/${update}/publish`, {})).status, 400);
  assert.equal((await ana.browser.json(`/api/items/${update}/publish`, { shown: 'Something else' })).status, 409);
  assert.equal((await ana.browser.json(`/api/items/${update}/publish`, { shown: 'The budget is 450,000.' })).status, 200);
  assert.deepEqual((await pageAs(cara, page)).items.map((entry) => entry.text), ['The budget is 450,000.']);
  assert.ok(shared);

  // Once shared, a newer version of her own says what everyone sees, until she shares that too.
  await ana.browser.json(`/api/items/${email}/publish`, { shown: 'Travel has 30,000 more.' });
  await as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, email, { body: 'Travel has 35,000 more.' }));
  const mine = ((await ana.browser.json(`/api/pages/${page}`)).body.items as (PageItem & { sharedAs: string | null })[]).find((entry) => entry.id === email);
  assert.equal(mine?.sharedAs, 'Travel has 30,000 more.');
  assert.equal((await ana.browser.json(`/api/items/${email}/publish`, { shown: 'Travel has 35,000 more.' })).status, 200);
  assert.ok((await pageAs(cara, page)).items.some((entry) => entry.text === 'Travel has 35,000 more.'));
  assert.equal((await ana.browser.json(`/api/items/${(await as(ana, (s) => createPage(s, { spaceId: ana.personalSpaceId, title: 'Mine' })))}/publication`)).status, 404);
});
