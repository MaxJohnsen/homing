// Issue #40, writing in the app: people start pages, add to them and correct them directly, and
// what they write says who will see it. New writing is only theirs unless they share it. A shared
// item is corrected for everyone or replaced by their own version, and what it said before is
// kept. Their assistant reads the correction next as written by them, and never rewrites it.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, share, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, northwind: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return { acme, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));
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

const post = async (who: Member, path: string, body: unknown) => who.browser.json(path, body);
const page = async (who: Member, id: string) => {
  const { status, body } = await who.browser.json(`/api/pages/${id}`);
  return { status, body: body as { shared: boolean; space: { people: number }; items: { id: string; text: string; shared: boolean; by: { name: string | null; you: boolean } | null; agent: string | null; replaced: { text: string; shared: boolean } | null; earlier: { text: string }[] }[] } };
};

test('a new page is only yours unless you share it', async () => {
  const mine = await post(ana, `/api/spaces/${acme}/pages`, { title: 'Pricing thoughts', type: 'Topic' });
  assert.equal(mine.status, 200);
  const shared = await post(ana, `/api/spaces/${acme}/pages`, { title: 'Website launch', type: 'project', shared: true });
  assert.equal(shared.status, 200);

  const forAna = (await ana.browser.json(`/api/spaces/${acme}/pages?sort=name`)).body;
  assert.deepEqual(forAna.pages.map((p: { title: string; type: string; onlyYou: boolean }) => [p.title, p.type, p.onlyYou]), [
    ['Pricing thoughts', 'topic', true],
    ['Website launch', 'project', false],
  ]);
  assert.deepEqual((await ana.browser.json(`/api/spaces/${acme}/pages`)).body.pages.length, 2);
  assert.deepEqual((await cara.browser.json(`/api/spaces/${acme}/pages`)).body.pages.map((p: { title: string }) => p.title), ['Website launch']);
  assert.equal((await page(cara, mine.body.id)).status, 404);
  // The page says how many people see what's shared there: Ana and Cara.
  assert.equal((await page(ana, shared.body.id)).body.space.people, 2);

  // Everything on a page only you see is yours too, so sharing an item there is refused.
  assert.equal((await post(ana, `/api/pages/${mine.body.id}/items`, { text: 'Start at 1,450', shared: true })).status, 403);
  assert.equal((await post(ana, `/api/pages/${mine.body.id}/items`, { text: 'Start at 1,450' })).status, 200);
  // A personal space has no shared side.
  assert.equal((await post(ana, `/api/spaces/${ana.personalSpaceId}/pages`, { title: 'Holiday', shared: true })).status, 403);
});

test('what you write says what it needs, and goes only where you can write', async () => {
  for (const [body, field] of [[{ title: '' }, 'title'], [{ title: 'x'.repeat(201) }, 'title'], [{ title: 'Rules', type: 'guidance' }, 'type'], [{ title: 'Report', type: 'Skill' }, 'type']] as const) {
    const answer = await post(ana, `/api/spaces/${acme}/pages`, body);
    assert.deepEqual([answer.status, answer.body.field], [400, field]);
  }
  const launch = await as(ana, (s) => createPage(s, { spaceId: acme, title: 'Launch', shared: true }));
  assert.equal((await post(ana, `/api/pages/${launch}/items`, { text: ' ' })).status, 400);
  assert.equal((await post(ana, `/api/pages/${launch}/items`, { text: 'x'.repeat(20_001) })).status, 400);
  // Cara can't start a page in Northwind, which she can't open, nor write on one there.
  const plan = await as(ana, (s) => createPage(s, { spaceId: northwind, title: 'Plan', shared: true }));
  assert.equal((await post(cara, `/api/spaces/${northwind}/pages`, { title: 'Hello', shared: true })).status, 404);
  assert.equal((await post(cara, `/api/pages/${plan}/items`, { text: 'Hello', shared: true })).status, 404);
  const [{ count }] = await admin`select count(*)::int from content where space_id = ${northwind} and body = 'Hello'`;
  assert.equal(count, 0);
});

test('a shared item is corrected for everyone, and the assistant reads it next as yours', async () => {
  const launch = await as(cara, (s) => createPage(s, { spaceId: acme, title: 'Website relaunch', shared: true }));
  // Cara's assistant wrote the date, and she shared it.
  const date = await as({ person: cara.id, agent: 'Claude' }, (s) => writeItem(s, { pageId: launch, body: 'The launch is on 14 November.' }));
  await share(cara, date.id);
  assert.equal((await post(ana, `/api/items/${date.id}`, { text: 'The launch is on 20 November.', shared: true })).status, 200);

  // Cara sees Ana's correction where the date was, with what it said before.
  const forCara = (await page(cara, launch)).body.items;
  assert.deepEqual(forCara.map((item) => [item.text, item.shared, item.by?.name, item.agent]), [['The launch is on 20 November.', true, 'Ana', null]]);
  assert.deepEqual(forCara[0].earlier.map((entry) => entry.text), ['The launch is on 14 November.']);

  // Ana's assistant reads it next as written by Ana, and can't rewrite it for everyone, only make
  // her own update of it, as she asks.
  const chat = await claudeForAna();
  const read = await chat.call('read', { ref: `item:${date.id}` });
  assert.match(read.text, /The launch is on 20 November\./);
  assert.match(read.text, /Written by Ana on/);
  const replaced = await chat.call('remember', { space: `space:${acme}`, text: 'The launch is on 1 December.', replaces: `item:${date.id}` });
  assert.match(replaced.text, /on your private side\. For you it replaces item:\S+, and others in the space still see the earlier version\./);
  assert.deepEqual((await page(ana, launch)).body.items.map((item) => [item.text, item.shared, item.by?.name, item.agent]), [['The launch is on 1 December.', false, 'Ana', null]]);
  assert.equal((await page(cara, launch)).body.items[0].text, 'The launch is on 20 November.');
});

test('your own version of a shared item is only yours, and others still see theirs', async () => {
  const budget = await as(cara, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Budget', shared: true });
    return { page, item: (await writeItem(s, { pageId: page, body: 'The budget is 400,000 NOK.', shared: true })).id };
  });
  assert.equal((await post(ana, `/api/items/${budget.item}`, { text: 'The budget is cut to 300,000 NOK.', shared: false })).status, 200);

  const forAna = (await page(ana, budget.page)).body.items;
  assert.deepEqual(forAna.map((item) => [item.text, item.shared, item.replaced?.text]), [['The budget is cut to 300,000 NOK.', false, 'The budget is 400,000 NOK.']]);
  assert.deepEqual((await page(cara, budget.page)).body.items.map((item) => item.text), ['The budget is 400,000 NOK.']);

  // Correcting her own version again changes it where it is, still only for her.
  const mine = forAna[0].id;
  assert.equal((await post(ana, `/api/items/${mine}`, { text: 'The budget is cut to 320,000 NOK.', shared: true })).status, 200);
  const again = (await page(ana, budget.page)).body.items;
  assert.deepEqual(again.map((item) => [item.text, item.shared]), [['The budget is cut to 320,000 NOK.', false]]);
  assert.deepEqual((await page(cara, budget.page)).body.items.map((item) => item.text), ['The budget is 400,000 NOK.']);

  // Nobody else can correct what's only Ana's, or the shared item once she replaced it for herself.
  assert.equal((await post(cara, `/api/items/${mine}`, { text: 'Hello' })).status, 404);
  assert.equal((await post(ana, `/api/items/${budget.item}`, { text: 'Hello', shared: true })).status, 409);
});

test('rules and skills aren’t corrected as knowledge', async () => {
  const rule = (await post(ana, `/api/spaces/${acme}/rules`, { kind: 'preference', text: 'Ana writes short notes' })).body.id;
  assert.equal((await post(ana, `/api/items/${rule}`, { text: 'Changed' })).status, 404);
  const [guidance] = await admin`select page_id from content where id = ${rule}`;
  assert.equal((await post(ana, `/api/pages/${guidance.pageId}/items`, { text: 'Hello' })).status, 404);
});

test('a private update of a private update still says what others see, in the app and to the assistant', async () => {
  // Written by Cara's assistant and shared by Cara, so Ana's may replace it for her.
  const roadmap = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Roadmap' });
    return { page, item: (await writeItem(s, { pageId: page, body: 'Version 2 ships in March.' })).id };
  });
  await share(cara, roadmap.item);
  const chat = await claudeForAna();
  const first = await chat.call('remember', { space: `space:${acme}`, text: 'Version 2 ships in April.', replaces: `item:${roadmap.item}` });
  const mine = /Saved as item:([0-9a-f-]{36})/.exec(first.text)![1];
  const again = await chat.call('remember', { space: `space:${acme}`, text: 'Version 2 ships in May.', replaces: `item:${mine}` });
  assert.match(again.text, /others in the space still see the shared version, item:/);

  const forAna = (await page(ana, roadmap.page)).body.items;
  assert.deepEqual(forAna.map((item) => [item.text, item.replaced]), [['Version 2 ships in May.', { text: 'Version 2 ships in March.', shared: true, until: (forAna[0].replaced as { until?: string }).until }]]);
  const found = await chat.call('search', { query: 'ships May', space: `space:${acme}` });
  assert.match(found.text, /Version 2 ships in May\..*A private update: others still see the earlier version\./);
  assert.deepEqual((await page(cara, roadmap.page)).body.items.map((item) => item.text), ['Version 2 ships in March.']);
});

test('context lists the pages changed most recently, and points to search for the rest', async () => {
  const archive = await as(ana, (s) => createSpace(s, { name: 'Archive', parentId: ana.personalSpaceId }));
  await as(ana, async (s) => {
    for (let n = 1; n <= 60; n++) await createPage(s, { spaceId: archive, title: `Meeting ${n}` });
  });
  const text = (await (await claudeForAna()).call('context', { request: 'Plan the week', space: `space:${archive}` })).text;
  assert.match(text, /The 50 most recently changed of 60\. Use `search` to find the others\./);
  assert.match(text, /Meeting 60/);
  assert.doesNotMatch(text, /Meeting 1,/);
});

test('nobody writes on a page whose content they can’t see, even straight against the database', async () => {
  const secret = await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Ana’s secret plans' });
    await writeItem(s, { pageId: page, body: 'Ana plans to leave in spring.' });
    return page;
  });
  for (const kind of ['title', 'text']) {
    await assert.rejects(as(cara, (s) => s.tx`insert into content (page_id, space_id, kind, body) values (${secret}, ${acme}, ${kind}, 'Hello')`), refused);
  }
  assert.equal((await cara.browser.json(`/api/spaces/${acme}/pages?q=secret`)).body.total, 0);
});
