// Issue #40, pages in the app: a space's pages, found by search, type and order however many there
// are, and a page as each person sees it, with who sees it, what's only yours, who wrote each item,
// its sources and what it said before. The leak test checks a colleague finds nothing private.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { addSource, createPage, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, northwind: string;
let launch: string, gunnar: string, notes: string;
let launchDate: string, budget: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), logRequests: false });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return { acme, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));

  // Acme's launch page: a shared date from an email that Claude saved for Cara, and a budget Cara wrote and later corrected.
  ({ launch, launchDate, budget } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const launch = await createPage(s, { spaceId: acme, title: 'Website launch', type: 'project', shared: true });
    const email = await addSource(s, { spaceId: acme, reference: 'Email from Gunnar, 2 October', excerpt: 'We go live on 14 November.', shared: true });
    const launchDate = (await writeItem(s, { pageId: launch, body: 'The launch is on **14 November**.', sources: [email.id], shared: true })).id;
    return { launch, launchDate, budget: '' };
  }));
  budget = await as({ person: cara.id }, async (s) => {
    const item = await writeItem(s, { pageId: launch, body: 'The budget is 400,000 NOK.', shared: true });
    await updateItem(s, item.id, { body: 'The budget is 450,000 NOK.' });
    return item.id;
  });
  // Ana knows the date moved, and keeps it to herself for now. She also has a page nobody else sees.
  ({ gunnar, notes } = await as({ person: ana.id }, async (s) => {
    await supersedeItem(s, launchDate, { body: 'The launch moved to 20 November.' });
    await writeItem(s, { pageId: launch, body: 'Gunnar wants a call before anything about scope.' });
    const gunnar = await createPage(s, { spaceId: acme, title: 'Gunnar Holm', type: 'person', shared: true });
    await writeItem(s, { pageId: gunnar, body: 'Head of digital at Northwind.', shared: true });
    const notes = await createPage(s, { spaceId: acme, title: 'Salary talks with Cara' });
    await writeItem(s, { pageId: notes, body: 'Cara asks for a raise in December.' });
    return { gunnar, notes };
  }));
  // Rules and skills are guidance, not knowledge pages.
  await as({ person: ana.id, direct: true }, async (s) => {
    await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Never send prices by email', shared: true });
    await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: '---\nname: status-report\ndescription: The weekly report\n---\n' }], shared: true });
  });
});

after(() => homing.close());

const list = async (who: Member, space: string, query = '') => {
  const { status, body } = await who.browser.json(`/api/spaces/${space}/pages${query}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body as { pages: { id: string; title: string; type: string | null; excerpt: string | null; onlyYou: boolean; updatedAt: string }[]; total: number; all: number; types: { type: string; count: number }[] };
};

test('a space’s pages are the knowledge each person sees there, newest first', async () => {
  const forAna = await list(ana, acme);
  assert.deepEqual(forAna.pages.map((page) => [page.title, page.type, page.onlyYou]), [
    ['Salary talks with Cara', null, true],
    ['Gunnar Holm', 'person', false],
    ['Website launch', 'project', false],
  ]);
  assert.equal(forAna.total, 3);
  assert.equal(forAna.all, 3);
  assert.deepEqual(forAna.types, [{ type: 'person', count: 1 }, { type: 'project', count: 1 }]);
  // Each page shows its first item as Ana sees it: her own newer date.
  assert.equal(forAna.pages[2].excerpt, 'The launch moved to 20 November.');

  // Cara sees the shared pages only, as they are for everyone.
  const forCara = await list(cara, acme);
  assert.deepEqual(forCara.pages.map((page) => page.title), ['Gunnar Holm', 'Website launch']);
  assert.equal(forCara.all, 2);
  assert.equal(forCara.pages[1].excerpt, 'The launch is on **14 November**.');

  // Northwind has nothing yet, and someone outside it gets nothing at all.
  assert.deepEqual(await list(ana, northwind), { pages: [], total: 0, all: 0, types: [] });
  assert.equal((await cara.browser.json(`/api/spaces/${northwind}/pages`)).status, 404);
});

test('pages are found by what they say, by type, and in order', async () => {
  // Words match titles and items, by how they start.
  assert.deepEqual((await list(ana, acme, '?q=launc')).pages.map((page) => page.title), ['Website launch']);
  assert.deepEqual((await list(ana, acme, '?q=digital')).pages.map((page) => page.title), ['Gunnar Holm']);
  // What only Ana wrote finds the page for Ana, and nothing for Cara.
  assert.deepEqual((await list(ana, acme, '?q=scope')).pages.map((page) => page.title), ['Website launch']);
  assert.deepEqual((await list(cara, acme, '?q=scope')).pages, []);
  assert.deepEqual((await list(ana, acme, '?type=person')).pages.map((page) => page.title), ['Gunnar Holm']);
  assert.deepEqual((await list(ana, acme, '?sort=name')).pages.map((page) => page.title), ['Gunnar Holm', 'Salary talks with Cara', 'Website launch']);
  // Searching leaves the counts for filtering as they were.
  assert.equal((await list(ana, acme, '?q=digital')).all, 3);
});

test('a long list comes fifty at a time, and starts over when asked for past its end', async () => {
  const space = await as(ana, (s) => createSpace(s, { name: 'Archive', parentId: ana.personalSpaceId }));
  await as(ana, async (s) => {
    for (let n = 1; n <= 120; n++) await createPage(s, { spaceId: space, title: `Meeting ${String(n).padStart(3, '0')}`, type: 'meeting' });
  });
  const first = await list(ana, space, '?sort=name');
  assert.equal(first.pages.length, 50);
  assert.equal(first.total, 120);
  assert.equal(first.pages[0].title, 'Meeting 001');
  const third = await list(ana, space, '?sort=name&offset=100');
  assert.deepEqual([third.pages.length, third.pages[0].title], [20, 'Meeting 101']);
  assert.equal((await list(ana, space, '?sort=name&offset=500')).pages[0].title, 'Meeting 001');
  // One type only, so there's nothing to filter by beyond it.
  assert.deepEqual(first.types, [{ type: 'meeting', count: 120 }]);
});

type PageBody = {
  title: string;
  type: string | null;
  space: { id: string; name: string; personal: boolean; private: boolean };
  items: {
    text: string;
    shared: boolean;
    by: { name: string | null; you: boolean } | null;
    agent: string | null;
    sources: { reference: string | null; excerpt: string }[];
    replaced: { text: string; shared: boolean; until?: string } | null;
    earlier: { text: string; by: { name: string | null; you: boolean } | null }[];
  }[];
};

const open = async (who: Member, page: string) => {
  const { status, body } = await who.browser.json(`/api/pages/${page}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body as PageBody;
};

test('a page shows each person the shared items and their own, with who wrote them and from where', async () => {
  const forAna = await open(ana, launch);
  assert.equal(forAna.title, 'Website launch');
  assert.deepEqual(forAna.space, { id: acme, name: 'Acme', personal: false, private: false });
  // Ana's newer date stands where the shared one did, and says what the others still see.
  assert.deepEqual(forAna.items.map((item) => [item.text, item.shared]), [
    ['The launch moved to 20 November.', false],
    ['The budget is 450,000 NOK.', true],
    ['Gunnar wants a call before anything about scope.', false],
  ]);
  assert.deepEqual(forAna.items[0].replaced, { text: 'The launch is on **14 November**.', shared: true, until: forAna.items[0].replaced?.until });
  // Cara wrote the budget herself and corrected it; what it said before is kept.
  assert.deepEqual(forAna.items[1].by, { name: 'Cara', you: false });
  assert.equal(forAna.items[1].agent, null);
  assert.deepEqual(forAna.items[1].earlier.map((entry) => [entry.text, entry.by?.name]), [['The budget is 400,000 NOK.', 'Cara']]);

  const forCara = await open(cara, launch);
  assert.deepEqual(forCara.items.map((item) => item.text), ['The launch is on **14 November**.', 'The budget is 450,000 NOK.']);
  // Claude saved the date for Cara, from Gunnar's email.
  assert.deepEqual([forCara.items[0].by, forCara.items[0].agent], [{ name: 'Cara', you: true }, 'Claude']);
  assert.deepEqual(forCara.items[0].sources.map((source) => [source.reference, source.excerpt]), [['Email from Gunnar, 2 October', 'We go live on 14 November.']]);
  assert.equal(forCara.items[0].replaced, null);
});

test('rules, skills and pages someone can’t see don’t open as pages', async () => {
  const [guidance, skill] = await admin`select id from pages where space_id = ${acme} and type in ('guidance', 'skill') order by type`;
  for (const page of [guidance.id, skill.id]) assert.equal((await ana.browser.json(`/api/pages/${page}`)).status, 404);
  assert.equal((await cara.browser.json(`/api/pages/${notes}`)).status, 404);
  assert.equal((await cara.browser.json(`/api/pages/${gunnar}`)).status, 200);
});
