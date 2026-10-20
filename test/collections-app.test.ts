// Issue #40, collections (spec §3): any page can gather other pages in its space, which makes it
// a collection. Gathering is its own link, apart from mentions, and like an item it is shared or
// only yours. A page can be in several collections or none, a collection can be in another, and
// gathering never changes who can see a page. Assistants gather on the user's private side.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { createPage, gather, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, northwind: string;
let planning: string, launch: string, budget: string, salary: string, elsewhere: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return { acme, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));
  ({ planning, launch, budget, salary, elsewhere } = await as(ana, async (s) => {
    const page = (title: string, shared = true, spaceId = acme) => createPage(s, { spaceId, title, shared });
    const planning = await page('2027 planning');
    const launch = await page('Website launch');
    const budget = await page('Budget');
    const salary = await page('Salary talks', false);
    const elsewhere = await page('Northwind roadmap', true, northwind);
    // The budget page mentions the launch page, which doesn't put it in a collection.
    await writeItem(s, { pageId: budget, body: 'Most of it goes to the [launch](page:' + launch + ').', shared: true });
    return { planning, launch, budget, salary, elsewhere };
  }));
});

after(() => homing.close());

const post = (who: Member, path: string, body: unknown) => who.browser.json(path, body);
const page = async (who: Member, id: string) => (await who.browser.json(`/api/pages/${id}`)).body;
const titles = async (who: Member, query: string) =>
  ((await who.browser.json(`/api/spaces/${acme}/pages${query}`)).body.pages as { title: string; gathers: number; gatheredShared?: boolean }[]);

test('a page gathers others for everyone, or only for you, and lists only what each person sees', async () => {
  assert.equal((await post(ana, `/api/pages/${planning}/gather`, { pageId: launch, shared: true })).status, 200);
  assert.equal((await post(ana, `/api/pages/${planning}/gather`, { pageId: budget })).status, 200);
  assert.equal((await post(ana, `/api/pages/${planning}/gather`, { pageId: salary })).status, 200);
  // Gathering it again changes nothing.
  assert.equal((await post(ana, `/api/pages/${planning}/gather`, { pageId: launch, shared: true })).status, 200);

  assert.deepEqual((await titles(ana, `?in=${planning}&sort=name`)).map((p) => [p.title, p.gatheredShared]), [
    ['Budget', false],
    ['Salary talks', false],
    ['Website launch', true],
  ]);
  // Cara sees only what's shared in it, and so a collection of one page.
  assert.deepEqual((await titles(cara, `?in=${planning}&sort=name`)).map((p) => [p.title, p.gatheredShared]), [['Website launch', true]]);
  assert.deepEqual((await titles(cara, '?collections=1')).map((p) => [p.title, p.gathers]), [['2027 planning', 1]]);
  assert.deepEqual((await titles(ana, '?collections=1')).map((p) => [p.title, p.gathers]), [['2027 planning', 3]]);
  assert.equal((await page(cara, planning)).gathers, 1);
  assert.equal((await page(ana, planning)).gathers, 3);
  // Gathering didn't change who sees the salary page.
  assert.equal((await cara.browser.json(`/api/pages/${salary}`)).status, 404);
});

test('a page says which collections it’s in and which pages mention it, as each person sees them', async () => {
  const forAna = await page(ana, budget);
  assert.deepEqual(forAna.collections, [{ id: planning, title: '2027 planning', shared: false }]);
  assert.deepEqual((await page(cara, budget)).collections, []);
  // Being mentioned isn't being gathered.
  const launchPage = await page(cara, launch);
  assert.deepEqual(launchPage.mentionedOn, [{ id: budget, title: 'Budget' }]);
  assert.deepEqual(launchPage.collections, [{ id: planning, title: '2027 planning', shared: true }]);
  assert.equal(launchPage.gathers, 0);
});

test('a collection can be in another without making a hierarchy', async () => {
  const everything = await as(ana, (s) => createPage(s, { spaceId: acme, title: 'Everything for 2027', shared: true }));
  assert.equal((await post(ana, `/api/pages/${everything}/gather`, { pageId: planning, shared: true })).status, 200);
  // It lists only what it gathers itself, and nothing passes down through 2027 planning.
  assert.deepEqual((await titles(cara, `?in=${everything}`)).map((p) => [p.title, p.gathers]), [['2027 planning', 1]]);
  assert.equal((await page(cara, everything)).gathers, 1);
});

test('only what you could see and write is gathered, and a shared gathering joins shared pages', async () => {
  const refuse = async (who: Member, collection: string, body: { pageId: string; shared?: boolean }, status: number) => {
    const answer = await post(who, `/api/pages/${collection}/gather`, body);
    assert.equal(answer.status, status, JSON.stringify(answer.body));
  };
  // Ana's private page can't be put in a collection for everyone, and Cara can't gather it at all.
  await refuse(ana, planning, { pageId: salary, shared: true }, 403);
  await refuse(cara, planning, { pageId: salary }, 403);
  // Not across spaces, not a page into itself, not rules or skills, not in a space you can't open.
  await refuse(ana, planning, { pageId: elsewhere, shared: true }, 403);
  await refuse(ana, planning, { pageId: planning }, 403);
  const rule = await as({ person: ana.id, direct: true }, (s) => addRule(s, { spaceId: acme, kind: 'preference', body: 'Plan in quarters', shared: true }));
  const [guidance] = await admin`select page_id as id from content where id = ${rule.id}`;
  await refuse(ana, planning, { pageId: guidance.id }, 403);
  await refuse(cara, elsewhere, { pageId: launch }, 403);
  // The store refuses the same on its own.
  await assert.rejects(
    as(ana, (s) => s.tx`insert into gathered (collection_id, page_id, space_id, private_to) values (${planning}, ${salary}, ${acme}, null)`),
    refused,
  );
  const [{ count }] = await admin`
    select count(*)::int from gathered
    where (collection_id = ${planning} and page_id in (${salary}, ${elsewhere}, ${planning}, ${guidance.id}) and private_to is null)
       or (collection_id = ${elsewhere})
  `;
  assert.equal(count, 0);
});

test('taking a page out says on which side, and the page itself stays', async () => {
  // Cara can take the shared launch page out, but not Ana's own gathering of the budget.
  assert.equal((await post(cara, `/api/pages/${planning}/gather/remove`, { pageId: budget })).status, 404);
  assert.equal((await post(cara, `/api/pages/${planning}/gather/remove`, { pageId: launch, shared: true })).status, 200);
  assert.deepEqual(await titles(cara, `?in=${planning}`), []);
  assert.equal((await cara.browser.json(`/api/pages/${launch}`)).status, 200);
  assert.deepEqual((await titles(ana, `?in=${planning}&sort=name`)).map((p) => p.title), ['Budget', 'Salary talks']);
});

test('an assistant gathers on the user’s private side, and reads what a collection gathers', async () => {
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(cara.browser);
  const chat = await claude.open();
  const done = await chat.call('remember', { space: `space:${acme}`, page: 'Website launch', gatherInto: `page:${planning}` });
  assert.ok(!done.failed, done.text);
  assert.deepEqual((await titles(cara, `?in=${planning}`)).map((p) => [p.title, p.gatheredShared]), [['Website launch', false]]);
  // Only for Cara: Ana doesn't see Cara's gathering.
  assert.ok(!(await titles(ana, `?in=${planning}`)).some((p) => p.title === 'Website launch'));

  const read = await chat.call('read', { ref: `page:${planning}` });
  assert.match(read.text, /Pages in this collection \(1\)/);
  assert.match(read.text, /Website launch \(page:[0-9a-f-]+, private\)/);
  const launchRead = await chat.call('read', { ref: `page:${launch}` });
  assert.match(launchRead.text, /In "2027 planning" \(page:[0-9a-f-]+, private\)/);
  assert.match(launchRead.text, /Mentioned on "Budget"/);

  const out = await chat.call('remember', { space: `space:${acme}`, page: `page:${launch}`, removeFrom: `page:${planning}` });
  assert.ok(!out.failed, out.text);
  assert.deepEqual(await titles(cara, `?in=${planning}`), []);
  // A page that doesn't exist isn't made just to be gathered.
  const missing = await chat.call('remember', { space: `space:${acme}`, page: 'No such page', gatherInto: `page:${planning}` });
  assert.ok(missing.failed);
});

test('gathering works through Homing as well as the app', async () => {
  const notes = await as(cara, (s) => createPage(s, { spaceId: acme, title: 'Cara’s notes' }));
  assert.equal(await as(cara, (s) => gather(s, { collectionId: notes, pageId: launch })), true);
  assert.equal(await as(cara, (s) => gather(s, { collectionId: notes, pageId: launch })), false);
});
