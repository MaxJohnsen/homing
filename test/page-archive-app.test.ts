// Issue #6, archiving a page (spec §3). Anyone who can see a page archives it directly, for
// everyone who sees it: it leaves everyday context and the space's list of pages, stays
// searchable, and is recorded. An assistant archives at once only a page nobody else has anything
// on; one others see is a person's to archive. Nothing is deleted.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member;
let acme: string, vendor: string, notes: string, carasDraft: string, overview: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

const titles = async (who: Member, query = '') =>
  ((await who.browser.json(`/api/spaces/${acme}/pages${query}`)).body as { pages: { title: string }[]; archived: number });
const archive = (who: Member, page: string, archived = true) => who.browser.json(`/api/pages/${page}/archive`, { archived });

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, ben] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben')];
  [acme, vendor, notes, overview] = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const vendor = await createPage(s, { spaceId: acme, title: 'Old print vendor', shared: true });
    await writeItem(s, { pageId: vendor, body: 'Trykkeriet AS printed the brochures until 2025.', shared: true });
    const gunnar = await createPage(s, { spaceId: acme, title: 'Gunnar', shared: true });
    await writeItem(s, { pageId: gunnar, body: 'Gunnar runs the steering group.', shared: true });
    const notes = await createPage(s, { spaceId: acme, title: 'My call notes' });
    await writeItem(s, { pageId: notes, body: 'Call Gunnar before the review.' });
    const overview = await writeOverview(s, { spaceId: acme, text: 'The launch is in November.', shared: true });
    return [acme, vendor, notes, overview.pageId];
  });
  carasDraft = await as({ ...cara, direct: true }, async (s) => {
    const draft = await createPage(s, { spaceId: acme, title: 'Cara’s draft' });
    await writeItem(s, { pageId: draft, body: 'A first idea for the logo.' });
    return draft;
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('anyone who sees a page archives it for everyone, and it stays searchable and recorded', async () => {
  assert.equal((await archive(ben, vendor)).status, 404, 'nobody outside Acme');
  assert.equal((await archive(cara, vendor)).status, 200, 'a member, not only an admin');

  // It leaves the list for everyone who sees it, and shows on request.
  for (const who of [ana, cara]) {
    const listed = await titles(who);
    assert.ok(!listed.pages.some((page) => page.title === 'Old print vendor'));
    assert.equal(listed.archived, 1);
    assert.deepEqual((await titles(who, '?archived=1')).pages.map((page) => page.title), ['Old print vendor']);
  }
  const page = (await ana.browser.json(`/api/pages/${vendor}`)).body;
  assert.equal(page.archived.by.name, 'Cara');

  // The assistant's context leaves it out and says so; search and read still find it.
  const context = (await claude.call('context', { request: 'Who prints for us?', space: `space:${acme}` })).text;
  assert.doesNotMatch(context.split('## Relevant')[0], /Old print vendor/);
  assert.match(context, /1 archived page is left out/);
  assert.match((await claude.call('search', { query: 'Trykkeriet' })).text, /On an archived page/);
  assert.match((await claude.call('read', { ref: `page:${vendor}` })).text, /Archived on .+ no longer active/);

  // Recorded, for everyone who sees the page; reopening brings it back.
  const recorded = await as(ana, (s) => s.tx<{ archived: boolean; personId: string }[]>`select archived, person_id from page_archives where page_id = ${vendor}::uuid`);
  assert.deepEqual(recorded.map((row) => [row.archived, row.personId]), [[true, cara.id]]);
  assert.equal((await archive(ana, vendor, false)).status, 200);
  assert.ok((await titles(cara)).pages.some((page) => page.title === 'Old print vendor'));

  // The overview, rules and skills aren't archived, and only knowledge pages are.
  assert.equal((await archive(ana, overview)).status, 400);
});

test('an assistant archives at once only a page nobody else has anything on', async () => {
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'page.archive', input });
  assert.match((await act({ page: `page:${notes}` })).text, /^Archived "My call notes"/);
  assert.equal((await titles(ana)).archived, 1);
  assert.match((await act({ page: `page:${notes}`, reopen: true })).text, /^Reopened "My call notes"/);

  // Cara sees the vendor page, so Ana archives it in Homing; Cara's own draft Ana can't see at all.
  assert.match((await act({ page: `page:${vendor}` })).text, /Others see that page, so the user archives it in Homing/);
  assert.match((await act({ page: `page:${carasDraft}` })).text, /no page with that reference/);

  // Straight against the database too, and never without acting directly or through an assistant.
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select archive_page(${vendor}::uuid, true)`), refused);
  await assert.rejects(as(ana, (s) => s.tx`select archive_page(${notes}::uuid, true)`), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`select archive_page(${carasDraft}::uuid, true)`), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`update pages set archived_at = now() where id = ${vendor}::uuid`), refused);
});
