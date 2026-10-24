// Issue #40, a space's overview (spec §3): an optional short summary of where the space stands,
// kept as ordinary knowledge, beside the map Homing keeps by itself. Anyone who may change the
// space's shared knowledge changes the shared summary. Someone's own takes its place for them only
// by explicitly replacing it. Assistants keep the user's own with remember.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, gather, writeItem } from '../src/knowledge.ts';
import { proposeRule } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;

type Overview = {
  overview: {
    id: string; text: string; shared: boolean; by: { name: string | null; you: boolean } | null; agent: string | null; editAgent?: string; replacesShared: string | null;
    earlier: { text: string; by: { name: string | null } | null; agent: string | null; editAgent?: string }[];
  }[];
  active: { title: string }[];
  pages: number;
  collections: { title: string }[];
  decisions: { title: string }[];
  waiting: { text: string }[];
  spaces: { name: string }[];
};

const overview = async (who: Member, space = acme) => {
  const { status, body } = await who.browser.json(`/api/spaces/${space}/overview`);
  assert.equal(status, 200, JSON.stringify(body));
  return body as Overview;
};
const write = (who: Member, text: string, shared = false, space = acme) => who.browser.json(`/api/spaces/${space}/overview`, { text, shared });

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    await createSpace(s, { name: 'Website', parentId: acme });
    return acme;
  });
});

after(() => homing.close());

// Ana's Claude, connected once for the whole file.
let anaChat: Awaited<ReturnType<Assistant['open']>> | undefined;
async function claudeForAna() {
  if (!anaChat) {
    const claude = new Assistant(homing.url, assistants.claude);
    await claude.connect(ana.browser);
    anaChat = await claude.open();
  }
  return anaChat;
}

test('without a written overview, a space shows the map Homing keeps by itself', async () => {
  await as(ana, async (s) => {
    const plan = await createPage(s, { spaceId: acme, title: '2027 planning', shared: true });
    const launch = await createPage(s, { spaceId: acme, title: 'Launch moves to November', type: 'decision', shared: true });
    await writeItem(s, { pageId: launch, body: 'Decided at the steering group.', shared: true });
    await gather(s, { collectionId: plan, pageId: launch, shared: true });
  });
  await as({ person: ana.id, agent: 'Claude' }, (s) => proposeRule(s, { action: 'add rule', spaceId: acme, kind: 'preference', text: 'Plan in quarters', shared: true }));

  const forAna = await overview(ana);
  assert.deepEqual(forAna.overview, []);
  assert.deepEqual(forAna.active.map((page) => page.title).sort(), ['2027 planning', 'Launch moves to November']);
  assert.equal(forAna.pages, 2);
  assert.deepEqual(forAna.collections.map((page) => page.title), ['2027 planning']);
  assert.deepEqual(forAna.decisions.map((page) => page.title), ['Launch moves to November']);
  assert.deepEqual(forAna.waiting.map((item) => item.text), ['Plan in quarters']);
  assert.deepEqual(forAna.spaces.map((space) => space.name), ['Website']);
  // What waits for Ana isn't Cara's.
  assert.deepEqual((await overview(cara)).waiting, []);
});

test('the shared overview is anyone’s to write, and your own replaces it for you only when you say so', async () => {
  assert.equal((await write(cara, 'Acme is preparing the 2027 plans.', true)).status, 200);
  assert.deepEqual((await overview(ana)).overview.map((item) => [item.text, item.shared]), [['Acme is preparing the 2027 plans.', true]]);

  // Ana keeps her own version, which explicitly replaces the shared one for her.
  assert.equal((await write(ana, 'Acme is preparing the 2027 plans; the budget is late.')).status, 200);
  const forAna = (await overview(ana)).overview;
  assert.deepEqual(forAna.map((item) => [item.text, item.shared, item.replacesShared]), [
    ['Acme is preparing the 2027 plans; the budget is late.', false, 'Acme is preparing the 2027 plans.'],
  ]);
  assert.deepEqual((await overview(cara)).overview.map((item) => item.text), ['Acme is preparing the 2027 plans.']);

  // Cara corrects the shared one for everyone; Ana's own still stands for her, and she changes it where it is.
  assert.equal((await write(cara, 'Acme is finishing the 2027 plans.', true)).status, 200);
  assert.deepEqual((await overview(cara)).overview.map((item) => item.text), ['Acme is finishing the 2027 plans.']);
  assert.equal((await write(ana, 'The budget is late again.')).status, 200);
  assert.deepEqual((await overview(ana)).overview.map((item) => [item.text, item.replacesShared]), [['The budget is late again.', 'Acme is finishing the 2027 plans.']]);
  // Shown nowhere as a page.
  const [{ pageId }] = await admin`select page_id from content where body = 'Acme is finishing the 2027 plans.'`;
  assert.equal((await ana.browser.json(`/api/pages/${pageId}`)).status, 404);
  assert.ok(!((await ana.browser.json(`/api/spaces/${acme}/pages`)).body.pages as { id: string }[]).some((page) => page.id === pageId));
});

test('an assistant keeps the user’s own overview, reads it in context, and never rewrites what a person wrote', async () => {
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(cara.browser);
  const chat = await claude.open();
  // The shared overview is Cara's own writing, so her assistant's version sits beside it.
  const saved = await chat.call('remember', { space: `space:${acme}`, text: 'Cara thinks the plans slip to January.', overview: true });
  assert.ok(!saved.failed, saved.text);
  const forCara = (await overview(cara)).overview;
  assert.deepEqual(forCara.map((item) => [item.text, item.shared, item.agent, item.replacesShared]).sort(), [
    ['Acme is finishing the 2027 plans.', true, null, null],
    ['Cara thinks the plans slip to January.', false, 'Claude', null],
  ].sort());
  assert.ok(!(await overview(ana)).overview.some((item) => item.text.includes('January')));

  const context = (await chat.call('context', { request: 'Plan the week', space: `space:${acme}` })).text;
  assert.match(context, /## Overview/);
  assert.match(context, /Acme is finishing the 2027 plans\./);
  assert.match(context, /Cara thinks the plans slip to January\./);

  // Later the assistant updates its own version where it is.
  const again = await chat.call('remember', { space: `space:${acme}`, text: 'Cara thinks the plans slip to February.', overview: true });
  assert.ok(!again.failed, again.text);
  assert.ok((await overview(cara)).overview.some((item) => item.text === 'Cara thinks the plans slip to February.'));
});

test('an assistant never rewrites the overview the user wrote unasked, and they restore it in the app', async () => {
  const fjord = await as(ana, (s) => createSpace(s, { name: 'Fjord' }));
  assert.equal((await write(ana, 'Fjord is waiting for the board.', false, fjord)).status, 200);
  const [{ id: hers }] = (await overview(ana, fjord)).overview;
  const chat = await claudeForAna();

  // Context tells the assistant it's hers, and keeping the overview current doesn't overwrite it.
  assert.match((await chat.call('context', { request: 'Plan the week', space: `space:${fjord}` })).text, /The user wrote their own themselves: change it only when they ask you to, with `remember` and updates on it\./);
  const unasked = await chat.call('remember', { space: `space:${fjord}`, overview: true, text: 'Fjord slips to January.' });
  assert.deepEqual([unasked.failed, unasked.text], [true, `The user wrote their own overview of this space themselves (item:${hers}). Change it only when they ask you to, with updates on that item: it stays theirs, and what it said before is kept.`]);
  assert.deepEqual((await overview(ana, fjord)).overview.map((item) => item.text), ['Fjord is waiting for the board.']);

  // When she asks, it changes it as an item, and it stays hers, so keeping the overview current still doesn't overwrite it.
  assert.ok(!(await chat.call('remember', { updates: `item:${hers}`, text: 'Fjord slips to January.' })).failed);
  const again = await chat.call('remember', { space: `space:${fjord}`, overview: true, text: 'Fjord slips to February.' });
  assert.deepEqual([again.failed, again.text], [true, unasked.text]);
  const changed = (await overview(ana, fjord)).overview[0];
  assert.deepEqual([changed.text, changed.by?.name, changed.agent, changed.editAgent], ['Fjord slips to January.', 'Ana', null, 'Claude']);
  assert.deepEqual(changed.earlier.map((version) => [version.text, version.by?.name, version.agent, version.editAgent]), [['Fjord is waiting for the board.', 'Ana', null, undefined]]);

  // Restore in the app saves the earlier version as her own change, and keeps the assistant's in the history.
  assert.equal((await write(ana, 'Fjord is waiting for the board.', false, fjord)).status, 200);
  const restored = (await overview(ana, fjord)).overview[0];
  assert.deepEqual([restored.id, restored.text, restored.agent, restored.editAgent], [hers, 'Fjord is waiting for the board.', null, undefined]);
  assert.deepEqual(restored.earlier.map((version) => [version.text, version.editAgent]), [['Fjord is waiting for the board.', undefined], ['Fjord slips to January.', 'Claude']]);
});

test('restoring the shared overview for yourself replaces it for you, and leaves your assistant’s own as it is', async () => {
  const sea = await as(ana, async (s) => {
    const sea = await createSpace(s, { name: 'Sea' });
    await addMember(s, sea, cara.id);
    return sea;
  });
  assert.equal((await write(ana, 'The ferry runs twice a day.', true, sea)).status, 200);
  assert.equal((await write(cara, 'The ferry runs once a day in winter.', true, sea)).status, 200);
  const chat = await claudeForAna();
  // Cara wrote the shared one now, so Ana's assistant's own sits beside it.
  assert.ok(!(await chat.call('remember', { space: `space:${sea}`, overview: true, text: 'Ana thinks the timetable changes in March.' })).failed);
  const before = (await overview(ana, sea)).overview;
  const shared = before.find((item) => item.shared)!;
  const claudes = before.find((item) => !item.shared)!;
  assert.deepEqual(shared.earlier.map((version) => version.text), ['The ferry runs twice a day.']);

  // Ana restores the shared one's earlier version for herself: her own overview replaces it for her, and only for her.
  assert.equal((await ana.browser.json(`/api/spaces/${sea}/overview`, { text: 'The ferry runs twice a day.', shared: false, item: shared.id })).status, 200);
  const after = (await overview(ana, sea)).overview;
  assert.deepEqual(after.map((item) => [item.text, item.shared, item.replacesShared]).sort(), [
    ['Ana thinks the timetable changes in March.', false, null],
    ['The ferry runs twice a day.', false, 'The ferry runs once a day in winter.'],
  ]);
  assert.equal(after.find((item) => item.id === claudes.id)?.earlier.length, 0);
  assert.deepEqual((await overview(cara, sea)).overview.map((item) => item.text), ['The ferry runs once a day in winter.']);
  // One that isn't this space's overview isn't written here.
  assert.equal((await ana.browser.json(`/api/spaces/${sea}/overview`, { text: 'Hello', item: crypto.randomUUID() })).status, 404);
});

test('the shared overview the user wrote, their assistant changes when asked as their own update of it', async () => {
  const bay = await as(ana, async (s) => {
    const bay = await createSpace(s, { name: 'Bay' });
    await addMember(s, bay, cara.id);
    return bay;
  });
  assert.equal((await write(ana, 'The marina opens in May.', true, bay)).status, 200);
  const [{ id: shared }] = (await overview(ana, bay)).overview;
  const chat = await claudeForAna();
  assert.match(
    (await chat.call('context', { request: 'Plan the week', space: `space:${bay}` })).text,
    /The shared one is the user's own writing: when they ask you to change it, use `remember` with replaces on it, which makes their own update of it, until they share it\./,
  );

  // The way the context names works, and only Ana sees it.
  const update = await chat.call('remember', { replaces: `item:${shared}`, text: 'The marina opens in June.' });
  assert.match(update.text, new RegExp(`For you it replaces item:${shared}, and others in the space still see the earlier version\\.`));
  const forAna = (await overview(ana, bay)).overview;
  assert.deepEqual(forAna.map((item) => [item.text, item.shared, item.by?.name, item.agent, item.editAgent, item.replacesShared]), [
    ['The marina opens in June.', false, 'Ana', null, 'Claude', 'The marina opens in May.'],
  ]);
  assert.deepEqual((await overview(cara, bay)).overview.map((item) => item.text), ['The marina opens in May.']);
});

test('an overview is short, and only people in the space write or read it', async () => {
  assert.equal((await write(ana, 'x'.repeat(2_001), true)).status, 400);
  assert.equal((await write(ana, ' ', true)).status, 400);
  const northwind = await as(ana, (s) => createSpace(s, { name: 'Northwind', parentId: acme, closed: true }));
  assert.equal((await write(ana, 'Northwind renews in spring.', true, northwind)).status, 200);
  assert.equal((await cara.browser.json(`/api/spaces/${northwind}/overview`)).status, 404);
  assert.equal((await write(cara, 'Hello', true, northwind)).status, 404);
  // A personal space has no shared overview.
  assert.equal((await write(ana, 'My week', true, ana.personalSpaceId)).status, 403);
  assert.equal((await write(ana, 'My week', false, ana.personalSpaceId)).status, 200);
});

test('a change to the overview shows in what changed, as the overview', async () => {
  const recent = (await ana.browser.json('/api/changes?limit=5')).body.changes as { title: string; overview: boolean; text: string }[];
  const latest = recent.find((change) => change.overview);
  assert.equal(latest?.title, 'Overview');
});
