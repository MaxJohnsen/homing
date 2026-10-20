// #32's follow-up, your own update of something shared (spec §3 and §5). For you it stands in the
// shared item's place, saying the others still see the earlier version, which you can look at,
// until you share it the usual way. It rests only on saying which item it replaces, never on being
// newer, and the others see no trace of it, in the app or through their assistant.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addSource, createPage, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace, removeMember } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, until, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let anas: Awaited<ReturnType<Assistant['open']>>, caras: Awaited<ReturnType<Assistant['open']>>;

type PageItem = { id: string; text: string; shared: boolean; sharedBy: { you: boolean } | null; sources: { id: string; reference: string }[]; replaced: { text: string; shared: boolean } | null };

const pageAs = async (who: Member, page: string) => (await who.browser.json(`/api/pages/${page}`)).body as { items: PageItem[] };
const refIn = (text: string, kind: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];
/** The items resting on a source, as its own view lists them for the person. */
const usesOf = async (who: Member, source: string) =>
  ((await who.browser.json(`/api/sources/${source}`)).body.pages as { items: { id: string; text: string }[] }[]).flatMap((page) => page.items.map((item) => [item.id, item.text]));
/** Approves a proposal as the decision page does, sending the text Ana was shown. */
const approve = async (proposal: string) => {
  const shown = (await ana.browser.json(`/api/proposals/${proposal}`)).body.proposal.publication;
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, shown: shown.text })).status, 200);
  return shown as { text: string; sharedText: string | null; hidden: { reference: string | null }[] };
};

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const open = async (who: Member) => {
    const assistant = new Assistant(homing.url, assistants.claude);
    await assistant.connect(who.browser);
    return assistant.open();
  };
  [anas, caras] = [await open(ana), await open(cara)];
});

after(() => homing.close());

test('Ana’s update of what she shared stands in its place for her, and the others see no trace of it until she shares it', async () => {
  const space = `space:${acme}`;
  // Ana's Claude keeps the launch date from an email, and she shares it with Acme.
  const saved = await anas.call('remember', {
    space, page: 'Launch', text: 'The launch is on 14 November.',
    sources: [{ reference: 'Email from Gunnar, 2 October', excerpt: 'We go live on 14 November.' }],
  });
  const original = refIn(saved.text, 'item');
  await approve(refIn((await anas.call('act', { action: 'knowledge.publish', input: { item: `item:${original}` } })).text, 'proposal'));
  const page = refIn((await anas.call('read', { ref: `item:${original}` })).text, 'page');

  // What Cara and her assistant see now.
  const seenByCara = async () => ({
    page: await pageAs(cara, page),
    pages: (await cara.browser.json(`/api/spaces/${acme}/pages`)).body,
    changes: (await cara.browser.json('/api/changes')).body,
    context: (await caras.call('context', { request: 'When is the launch?', space })).text,
    read: (await caras.call('read', { ref: `page:${page}` })).text,
    search: (await caras.call('search', { query: 'launch' })).text,
  });
  const before = await seenByCara();
  assert.deepEqual(before.page.items.map((item) => [item.text, item.sharedBy?.you]), [['The launch is on 14 November.', false]]);
  const shared = before.page.items[0].id;
  // For Ana, what she shared stands for her original wherever she looks: reading it and its email say so.
  assert.match((await anas.call('read', { ref: `item:${original}` })).text, new RegExp(`The user shared it as item:${shared}, which stands for it from then on\\. Read and change that one\\.`));
  const email = (await pageAs(ana, page)).items[0].sources[0].id;
  assert.deepEqual(await usesOf(ana, email), [[shared, 'The launch is on 14 November.']]);

  // Gunnar moves the launch. Ana's Claude updates what it saved, which is now her update of what she shared.
  const updated = await anas.call('remember', {
    space, updates: `item:${original}`, text: 'The launch is on 21 November.',
    sources: [{ reference: 'Email from Gunnar, 16 October', excerpt: 'We need another week. New date: 21 November.' }],
  });
  assert.match(updated.text, /The user shared item:\S+ as item:\S+, so for you this replaces that, and others in the space still see the shared version\./);
  const update = refIn(updated.text, 'item');
  assert.match((await anas.call('read', { ref: `item:${original}` })).text, new RegExp(`and the user's private update item:${update} replaces that for them\\.`));
  assert.deepEqual(await usesOf(ana, email), [[update, 'The launch is on 21 November.']]);

  // Ana sees only her update, still resting on both emails, and what the others still see is there to look at.
  assert.deepEqual((await pageAs(ana, page)).items.map((item) => [item.id, item.text, item.shared, item.replaced?.text, item.replaced?.shared, item.sources.map((source) => source.reference)]), [
    [update, 'The launch is on 21 November.', false, 'The launch is on 14 November.', true, ['Email from Gunnar, 2 October', 'Email from Gunnar, 16 October']],
  ]);
  // The space's list of pages gives her update as the page's glimpse too.
  const listed = (await ana.browser.json(`/api/spaces/${acme}/pages`)).body.pages as { id: string; excerpt: string }[];
  assert.equal(listed.find((entry) => entry.id === page)?.excerpt, 'The launch is on 21 November.');
  // Her assistant agrees: the update is what's current for her, and the others still see the earlier one.
  const context = (await anas.call('context', { request: 'When is the launch?', space })).text;
  assert.match(context, /The launch is on 21 November\..*A private update: others still see the earlier version\./);
  assert.doesNotMatch(context, /14 November/);
  assert.match((await anas.call('read', { ref: `page:${page}` })).text, /The launch is on 21 November\. \(item:\S+, private, written by Ana through Claude\)\n {2}- A private update\. Others in the space still see: "The launch is on 14 November\."/);
  const found = (await anas.call('search', { query: 'launch' })).text;
  assert.match(found, /The launch is on 21 November\. .*A private update: others still see the earlier version\./);
  assert.match(found, /The launch is on 14 November\. .*What others still see\. The user's private update replaces it for them\./);
  assert.match((await anas.call('read', { ref: `item:${update}` })).text, new RegExp(`A private update: for the user it replaces item:${shared}, which others in the space still see\\.`));

  // Cara and her assistant see exactly what they saw before: no count, mark or date gives it away.
  assert.deepEqual(await seenByCara(), before);

  // Ana shares her update the usual way: her assistant proposes it, and she approves what everyone will see.
  const proposed = await anas.call('act', { action: 'knowledge.publish', input: { item: `item:${update}` } });
  const decided = await approve(refIn(proposed.text, 'proposal'));
  assert.deepEqual([decided.sharedText, decided.text, decided.hidden.map((source) => source.reference)], [
    'The launch is on 14 November.', 'The launch is on 21 November.', ['Email from Gunnar, 2 October', 'Email from Gunnar, 16 October'],
  ]);

  // Now both see the same, and Ana's note is gone.
  const forCara = (await pageAs(cara, page)).items;
  const forAna = (await pageAs(ana, page)).items;
  assert.deepEqual(forCara.map((item) => [item.text, item.sharedBy?.you, item.replaced?.text]), [['The launch is on 21 November.', false, 'The launch is on 14 November.']]);
  assert.deepEqual(forAna.map((item) => [item.id, item.text, item.shared]), [[forCara[0].id, 'The launch is on 21 November.', true]]);
  assert.match((await caras.call('context', { request: 'When is the launch?', space })).text, /The launch is on 21 November\./);
  assert.doesNotMatch((await anas.call('search', { query: 'launch' })).text, /private update/);
});

test('in the app, Ana corrects what she shared for herself only, and shares the update from the page', async () => {
  const page = await as({ person: ana.id, direct: true }, (s) => createPage(s, { spaceId: acme, title: 'Office', shared: true }));
  const { id: item } = (await ana.browser.json(`/api/pages/${page}/items`, { text: 'The office closes at 17.' })).body;
  assert.equal((await ana.browser.json(`/api/items/${item}/publish`, { shown: 'The office closes at 17.' })).status, 200);

  // Only for her: her version takes its place for her, and Cara's page doesn't change.
  const { id: update } = (await ana.browser.json(`/api/items/${item}`, { text: 'The office closes at 16 on Fridays.', shared: false })).body;
  assert.deepEqual((await pageAs(ana, page)).items.map((entry) => [entry.id, entry.replaced?.text, entry.replaced?.shared]), [[update, 'The office closes at 17.', true]]);
  assert.deepEqual((await pageAs(cara, page)).items.map((entry) => [entry.id, entry.text]), [[item, 'The office closes at 17.']]);

  // Share this update: what sharing would do, then sharing exactly that.
  const publication = (await ana.browser.json(`/api/items/${update}/publication`)).body;
  assert.deepEqual([publication.sharedText, publication.text, publication.copy], ['The office closes at 17.', 'The office closes at 16 on Fridays.', false]);
  assert.equal((await ana.browser.json(`/api/items/${update}/publish`, { shown: publication.text })).status, 200);
  for (const who of [ana, cara]) {
    assert.deepEqual((await pageAs(who, page)).items.map((entry) => [entry.id, entry.text, entry.shared]), [[update, 'The office closes at 16 on Fridays.', true]]);
  }
});

test('a newer private item doesn’t hide a shared one unless it says it replaces it', async () => {
  const { page, budget } = await as({ person: cara.id, direct: true }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Budget', shared: true });
    return { page, budget: (await writeItem(s, { pageId: page, body: 'The budget is 400,000 NOK.', shared: true })).id };
  });
  // Ana's Claude saves a newer figure on the same page, without saying it replaces Cara's.
  const saved = await anas.call('remember', { space: `space:${acme}`, page: `page:${page}`, text: 'The budget is 450,000 NOK after the travel increase.' });
  const newer = refIn(saved.text, 'item');

  assert.deepEqual((await pageAs(ana, page)).items.map((item) => [item.id, item.shared, item.replaced]), [[budget, true, null], [newer, false, null]]);
  const found = (await anas.call('search', { query: 'budget', space: `space:${acme}` })).text;
  assert.doesNotMatch(found, /private update|What others still see|No longer true/);
  assert.match((await anas.call('context', { request: 'What is the budget?', space: `space:${acme}` })).text, /400,000 NOK[\s\S]*450,000 NOK|450,000 NOK[\s\S]*400,000 NOK/);
  assert.deepEqual((await pageAs(cara, page)).items.map((item) => item.id), [budget]);
});

test('changing what she shared as she shares it never rewrites the original out of sight', async () => {
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Catering', shared: true });
    const email = await addSource(s, { spaceId: acme, reference: 'Email from the caterer', excerpt: 'Lunch for 40.' });
    return { page, item: (await writeItem(s, { pageId: page, body: 'Lunch is for 40 people.', sources: [email.id] })).id };
  });
  // Ana shares it while her assistant changes it: the change waits for the sharing, then updates what was shared.
  let published!: () => void, release!: () => void;
  const isShared = new Promise<void>((resolve) => (published = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const sharing = as({ person: ana.id, direct: true }, async (s) => {
    await s.tx`select publish_item(${item}::uuid, 'Lunch is for 40 people.')`;
    published();
    await released;
  });
  await isShared;
  const changing = as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, item, { body: 'Lunch is for 45 people.' }));
  try {
    await until(async () => (await admin`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%content%'`)[0].n > 0);
  } finally {
    release();
  }
  await sharing;
  const update = (await changing)!;

  const [original] = await admin`select body from content where id = ${item}`;
  assert.equal(original.body, 'Lunch is for 40 people.', 'the shared original is never rewritten');
  assert.deepEqual((await pageAs(ana, page)).items.map((entry) => [entry.id, entry.text, entry.replaced?.text]), [[update.id, 'Lunch is for 45 people.', 'Lunch is for 40 people.']]);
  assert.deepEqual((await pageAs(cara, page)).items.map((entry) => entry.text), ['Lunch is for 40 people.']);
});

test('an update still rests on a source Ana can no longer open, and sharing it says so', async () => {
  // Beta is Cara's space, where Ana kept its price list for everyone there.
  const beta = await as({ person: cara.id, direct: true }, async (s) => {
    const beta = await createSpace(s, { name: 'Beta' });
    await addMember(s, beta, ana.id);
    return beta;
  });
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const prices = await addSource(s, { spaceId: beta, reference: 'Beta’s price list', excerpt: 'Beta pays 1,200 a day.', shared: true });
    const page = await createPage(s, { spaceId: acme, title: 'Rates', shared: true });
    return { page, item: (await writeItem(s, { pageId: page, body: 'Our rate is about 1,200 a day.', sources: [prices.id] })).id };
  });
  await approve(refIn((await anas.call('act', { action: 'knowledge.publish', input: { item: `item:${item}` } })).text, 'proposal'));
  await as({ person: cara.id, direct: true }, (s) => removeMember(s, beta, ana.id));

  // Ana's assistant updates what she shared, without naming any sources.
  const updated = await anas.call('remember', { space: `space:${acme}`, updates: `item:${item}`, text: 'Our rate is 1,250 a day.' });
  assert.ok(!updated.failed, updated.text);
  const update = refIn(updated.text, 'item');
  assert.deepEqual((await pageAs(ana, page)).items.map((entry) => entry.id), [update]);
  // Sharing it is a copy that says it rests on a source she can no longer open.
  const publication = (await ana.browser.json(`/api/items/${update}/publication`)).body;
  assert.deepEqual([publication.copy, publication.hiddenUnseen, publication.sharedText], [true, 1, 'Our rate is about 1,200 a day.']);
});

test('asking to share an original again names what everyone sees now', async () => {
  const { page, item } = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Parking', shared: true });
    const note = await addSource(s, { spaceId: acme, reference: 'Note from the landlord', excerpt: 'Ten spaces.' });
    return { page, item: (await writeItem(s, { pageId: page, body: 'There are ten parking spaces.', sources: [note.id] })).id };
  });
  await approve(refIn((await anas.call('act', { action: 'knowledge.publish', input: { item: `item:${item}` } })).text, 'proposal'));
  const copy = (await pageAs(cara, page)).items[0].id;
  // Cara replaces it for everyone.
  const now = (await as({ person: cara.id, direct: true }, (s) => supersedeItem(s, copy, { body: 'There are twelve parking spaces.', shared: true })))!.id;

  const again = await anas.call('act', { action: 'knowledge.publish', input: { item: `item:${item}` } });
  assert.ok(again.failed);
  assert.match(again.text, new RegExp(`The user shared it already: everyone sees item:${now} now\\.`));
});

test('sources carry over only between one person’s own items on one page', async () => {
  const { page, other, mine, own, shared } = await as({ person: ana.id, direct: true }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Suppliers', shared: true });
    const other = await createPage(s, { spaceId: acme, title: 'Offices', shared: true });
    const note = await addSource(s, { spaceId: acme, reference: 'Ana’s call notes', excerpt: 'Supplier A is late.' });
    return {
      page, other,
      mine: (await writeItem(s, { pageId: page, body: 'Supplier A is late.', sources: [note.id] })).id,
      own: (await writeItem(s, { pageId: other, body: 'The office moves in May.' })).id,
      shared: (await writeItem(s, { pageId: page, body: 'We use two suppliers.', shared: true })).id,
    };
  });
  const theirs = await as({ person: cara.id, direct: true }, async (s) => {
    const note = await addSource(s, { spaceId: acme, reference: 'Cara’s own note', excerpt: 'Supplier B is cheaper.' });
    return (await writeItem(s, { pageId: page, body: 'Supplier B is cheaper.', sources: [note.id] })).id;
  });
  const carry = (from: string, to: string) => as({ person: ana.id }, (s) => s.tx`select carry_citations(${from}::uuid, ${to}::uuid)`);
  const cited = async (item: string) => (await admin`select count(*)::int as n from citations where content_id = ${item}`)[0].n as number;

  await carry(theirs, mine); // Cara's private sources onto Ana's item
  await carry(mine, theirs); // Ana's onto Cara's
  await carry(mine, shared); // Ana's onto what everyone sees
  await carry(mine, own); // Ana's onto her own item on another page
  assert.deepEqual([await cited(mine), await cited(theirs), await cited(shared), await cited(own)], [1, 1, 0, 0]);
  assert.ok(other);
});

test('when something shared replaces what Ana updated, her update no longer says the others still see it', async () => {
  const { page, item } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Deadline', shared: true });
    return { page, item: (await writeItem(s, { pageId: page, body: 'The report is due Friday.', shared: true })).id };
  });
  await anas.call('remember', { space: `space:${acme}`, replaces: `item:${item}`, text: 'The report is due Monday.' });
  await as({ person: cara.id, direct: true }, (s) => supersedeItem(s, item, { body: 'The report is due Tuesday.', shared: true }));

  const forAna = (await pageAs(ana, page)).items;
  assert.deepEqual(forAna.map((entry) => [entry.text, entry.shared, entry.replaced?.shared ?? null]), [
    ['The report is due Monday.', false, false],
    ['The report is due Tuesday.', true, false],
  ]);
  assert.doesNotMatch((await anas.call('read', { ref: `page:${page}` })).text, /Others in the space still see/);
});
