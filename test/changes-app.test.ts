// Issue #40, what changed: Home leads with what's new in everything the person can see, newest
// first: knowledge added, updated or corrected, by whom, and where. Never rules, never what's no
// longer true, and never anything private to someone else.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { createPage, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, northwind: string;

type ChangeBody = { title: string; text: string; kind: string; newPage: boolean; by: { name: string | null; you: boolean } | null; agent: string | null; onlyYou: boolean; space: { name: string | null; archived: boolean } };

const changes = async (who: Member, query = '') => {
  const { status, body } = await who.browser.json(`/api/changes${query}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body as { changes: ChangeBody[]; more: boolean; archived: boolean };
};

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), logRequests: false });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return { acme, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));
});

after(() => homing.close());

test('what changed leads with the newest, says what kind of change and who made it', async () => {
  // Claude starts a launch page for Cara, Cara corrects the budget, and Ana keeps a newer date to herself.
  const { date, budget, launch } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const launch = await createPage(s, { spaceId: acme, title: 'Website launch', shared: true });
    const date = await writeItem(s, { pageId: launch, body: 'The launch is on **14 November**.', shared: true });
    const budget = await writeItem(s, { pageId: launch, body: 'The budget is 400,000 NOK.', shared: true });
    return { date: date.id, budget: budget.id, launch };
  });
  await as({ person: cara.id }, (s) => updateItem(s, budget, { body: 'The budget is 450,000 NOK.' }));
  await as({ person: ana.id, agent: 'Claude' }, (s) => supersedeItem(s, date, { body: 'The launch moved to 20 November.' }));
  await as({ person: ana.id, direct: true }, (s) => addRule(s, { spaceId: acme, kind: 'preference', body: 'Write launch notes in English', shared: true }));

  const forAna = (await changes(ana)).changes;
  assert.deepEqual(forAna.map((change) => [change.text, change.kind, change.newPage, change.onlyYou]), [
    ['The launch moved to 20 November.', 'updated', false, true],
    ['The budget is 450,000 NOK.', 'corrected', false, false],
  ]);
  assert.deepEqual([forAna[0].by, forAna[0].agent, forAna[0].space.name], [{ name: 'Ana', you: true }, 'Claude', 'Acme']);
  assert.deepEqual([forAna[1].by, forAna[1].agent, forAna[1].title], [{ name: 'Cara', you: false }, null, 'Website launch']);

  // Cara sees the date as everyone does, as the first thing on a new page, and nothing of Ana's.
  const forCara = (await changes(cara)).changes;
  assert.deepEqual(forCara.map((change) => [change.text, change.kind, change.newPage]), [
    ['The budget is 450,000 NOK.', 'corrected', false],
    ['The launch is on **14 November**.', 'added', true],
  ]);
  assert.equal(launch.length > 0, true);
});

test('what changed comes fifty at a time, or as few as asked for, and says when there’s more', async () => {
  const notes = await as(ana, (s) => createSpace(s, { name: 'Notes', parentId: ana.personalSpaceId }));
  await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: notes, title: 'Daily notes' });
    for (let n = 1; n <= 60; n++) await writeItem(s, { pageId: page, body: `Note ${n}` });
  });
  const first = await changes(ana);
  assert.deepEqual([first.changes.length, first.more, first.changes[0].text], [50, true, 'Note 60']);
  const few = await changes(ana, '?limit=5');
  assert.deepEqual([few.changes.length, few.more], [5, true]);
  const rest = await changes(ana, '?offset=50');
  assert.ok(rest.changes.length > 10);
  assert.equal(rest.changes[0].text, 'Note 10');
});

test('nobody sees changes in a space they can’t open', async () => {
  await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: northwind, title: 'Northwind pricing', shared: true });
    await writeItem(s, { pageId: page, body: 'Northwind pays 1,450 a day.', shared: true });
  });
  assert.ok((await changes(ana, '?limit=5')).changes.some((change) => change.text === 'Northwind pays 1,450 a day.'));
  assert.doesNotMatch(JSON.stringify(await changes(cara)), /Northwind|1,450/);
});

test('what changed leaves out archived spaces, as each person sees them, until they ask for them', async () => {
  const dave = await member(homing.url, 'Dave');
  // Cara has the campaign and its ads through Acme. Dave has only the booth, closed inside it.
  const { campaign, ads } = await as({ ...ana, direct: true }, async (s) => {
    const campaign = await createSpace(s, { name: 'Summer campaign', parentId: acme });
    const ads = await createSpace(s, { name: 'Ads', parentId: campaign });
    const booth = await createSpace(s, { name: 'Fair booth', parentId: campaign, closed: true });
    await addMember(s, booth, dave.id);
    for (const [spaceId, title, body] of [[campaign, 'Wrap-up', 'The final invoice was paid on 12 October.'], [ads, 'Ad results', 'The ads reached 40,000 people.'], [booth, 'Booth', 'The booth is booked for the fair.']]) {
      await writeItem(s, { pageId: await createPage(s, { spaceId, title, shared: true }), body, shared: true });
    }
    return { campaign, ads };
  });
  const texts = async (who: Member, query = '') => (await changes(who, query)).changes.map((change) => change.text);
  assert.ok((await texts(cara)).includes('The final invoice was paid on 12 October.'));
  assert.equal((await changes(cara)).archived, false, 'nothing is left out yet');
  assert.equal((await ana.browser.json(`/api/spaces/${campaign}/archive`, { archived: true })).status, 200);

  // Out of everyday attention: gone from what changed, the spaces in it too, with a way to them.
  for (const who of [ana, cara]) {
    const everyday = await changes(who);
    assert.doesNotMatch(JSON.stringify(everyday.changes), /final invoice|40,000|booth/);
    assert.equal(everyday.archived, true);
  }
  // Asked for, they're back, and each says its space is archived.
  const included = (await changes(cara, '?archived=1')).changes;
  assert.deepEqual(
    included.filter((change) => change.space.archived).map((change) => [change.text, change.space.name]),
    [['The ads reached 40,000 people.', 'Ads'], ['The final invoice was paid on 12 October.', 'Summer campaign']],
  );
  assert.ok(included.some((change) => !change.space.archived), 'and everything else with them');
  assert.ok((await texts(ana, '?archived=1')).includes('The booth is booked for the fair.'));
  // The archived space itself still shows what changed there.
  assert.deepEqual(((await cara.browser.json(`/api/spaces/${ads}/overview`)).body.active as { title: string }[]).map((page) => page.title), ['Ad results']);

  // Dave can't open the campaign, so for him the booth isn't archived, and its changes stay.
  const forDave = await changes(dave);
  assert.deepEqual(forDave.changes.map((change) => [change.text, change.space.archived]), [['The booth is booked for the fair.', false]]);
  assert.equal(forDave.archived, false);
  assert.doesNotMatch(JSON.stringify(forDave), /Summer campaign/);

  assert.equal((await ana.browser.json(`/api/spaces/${campaign}/archive`, { archived: false })).status, 200);
  assert.ok((await texts(cara)).includes('The ads reached 40,000 people.'));
});
