// #32's follow-up, your own update of something shared (spec §3 and §5). For you it stands in the
// shared item's place, saying the others still see the earlier version, which you can look at,
// until you share it the usual way. It rests only on saying which item it replaces, never on being
// newer, and the others see no trace of it, in the app or through their assistant.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addSource, createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let anas: Awaited<ReturnType<Assistant['open']>>, caras: Awaited<ReturnType<Assistant['open']>>;

type PageItem = { id: string; text: string; shared: boolean; sharedBy: { you: boolean } | null; sources: { reference: string }[]; replaced: { text: string; shared: boolean } | null };

const pageAs = async (who: Member, page: string) => (await who.browser.json(`/api/pages/${page}`)).body as { items: PageItem[] };
const refIn = (text: string, kind: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];
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

  // Gunnar moves the launch. Ana's Claude updates what it saved, which is now her update of what she shared.
  const updated = await anas.call('remember', {
    space, updates: `item:${original}`, text: 'The launch is on 21 November.',
    sources: [{ reference: 'Email from Gunnar, 16 October', excerpt: 'We need another week. New date: 21 November.' }],
  });
  assert.match(updated.text, /The user shared item:\S+ as item:\S+, so for you this replaces that, and others in the space still see the shared version\./);
  const update = refIn(updated.text, 'item');

  // Ana sees only her update, still resting on both emails, and what the others still see is there to look at.
  assert.deepEqual((await pageAs(ana, page)).items.map((item) => [item.id, item.text, item.shared, item.replaced?.text, item.replaced?.shared, item.sources.map((source) => source.reference)]), [
    [update, 'The launch is on 21 November.', false, 'The launch is on 14 November.', true, ['Email from Gunnar, 2 October', 'Email from Gunnar, 16 October']],
  ]);
  // Her assistant agrees: the update is what's current for her, and the others still see the earlier one.
  const context = (await anas.call('context', { request: 'When is the launch?', space })).text;
  assert.match(context, /The launch is on 21 November\..*A private update: others still see the earlier version\./);
  assert.doesNotMatch(context, /14 November/);
  assert.match((await anas.call('read', { ref: `page:${page}` })).text, /The launch is on 21 November\. \(item:\S+, private\)\n {2}- A private update\. Others in the space still see: "The launch is on 14 November\."/);
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

test('an original changed before this, after it was shared, becomes its owner’s update of what was shared', async () => {
  const pageAndItems = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Venue' });
    const email = await addSource(s, { spaceId: acme, reference: 'Email from the venue', excerpt: 'Doors open at 18, the bar at 19.' });
    const doors = (await writeItem(s, { pageId: page, body: 'Doors open at 18.', sources: [email.id] })).id;
    const bar = (await writeItem(s, { pageId: page, body: 'The bar opens at 19.', sources: [email.id] })).id;
    return { page, doors, bar };
  });
  const { page, doors, bar } = pageAndItems;
  for (const [item, text] of [[doors, 'Doors open at 18.'], [bar, 'The bar opens at 19.']]) {
    await as({ person: ana.id, direct: true }, (s) => s.tx`select publish_item(${item}::uuid, ${text})`);
  }
  // As Homing used to allow: one original rewritten after it was shared, and the other replaced by a private item.
  await as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`update content set body = 'Doors open at 17.' where id = ${doors}::uuid`, admin);
  await as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`insert into content (space_id, page_id, kind, body, private_to, supersedes) values (${acme}::uuid, ${page}::uuid, 'text', 'The bar opens at 20.', ${ana.id}::uuid, ${bar}::uuid)`, admin);

  const migration = (await readdir('migrations')).find((file) => file.endsWith('_private_updates.sql'))!;
  await admin.unsafe(await readFile(`migrations/${migration}`, 'utf8'));

  assert.deepEqual((await pageAs(ana, page)).items.map((item) => [item.text, item.shared, item.replaced?.text, item.replaced?.shared]), [
    ['Doors open at 17.', false, 'Doors open at 18.', true],
    ['The bar opens at 20.', false, 'The bar opens at 19.', true],
  ]);
  assert.deepEqual((await pageAs(ana, page)).items[0].sources.map((source) => source.reference), ['Email from the venue']);
  assert.deepEqual((await pageAs(cara, page)).items.map((item) => item.text), ['Doors open at 18.', 'The bar opens at 19.']);
});
