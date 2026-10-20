// Issue #6, archiving a space (spec §1). An admin archives a space when its work is done: it and
// the spaces in it leave the assistant's everyday context, and stay searchable. Nothing is
// deleted, and reopening brings it back. Only people archive, and only a space's admins.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, changeMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, website: string, globex: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

const spacesAs = async (who: Member) => (await who.browser.json('/api/spaces')).body.spaces as { id: string; name: string; archived: boolean }[];
const archive = (who: Member, space: string, archived = true) => who.browser.json(`/api/spaces/${space}/archive`, { archived });

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  [acme, website, globex] = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    const globex = await createSpace(s, { name: 'Globex' });
    await addMember(s, acme, cara.id);
    const page = await createPage(s, { spaceId: website, title: 'Launch', shared: true });
    await writeItem(s, { pageId: page, body: 'The Acme website went live on 1 March.', shared: true });
    return [acme, website, globex];
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('an admin archives a space, and it and the spaces in it leave everyday context but stay searchable', async () => {
  assert.equal((await archive(cara, acme)).status, 403, 'only its admins archive it');
  assert.equal((await archive(ana, acme)).status, 200);

  // Everyone who can open it sees it's archived, and the spaces in it with it.
  for (const who of [ana, cara]) {
    const spaces = await spacesAs(who);
    assert.deepEqual(spaces.filter((space) => space.archived).map((space) => space.name).sort(), ['Acme', 'Website']);
  }
  const seen = (await cara.browser.json(`/api/spaces/${website}`)).body;
  assert.deepEqual(seen.archive.with, { id: acme, name: 'Acme' });
  assert.equal((await ana.browser.json(`/api/spaces/${acme}`)).body.archive.you, true);

  // The assistant's map of spaces leaves them out, and says so.
  const map = (await claude.call('context', { request: 'What should I do today?' })).text;
  assert.match(map, /Globex/);
  assert.doesNotMatch(map, /- Acme|- Website/);
  assert.match(map, /2 archived spaces are left out/);
  // Asked about by name, it's still there, and says it's archived.
  assert.match((await claude.call('context', { request: 'How did the Acme launch go?' })).text, /# Acme[\s\S]*It's archived: finished work/);
  assert.match((await claude.call('context', { request: 'Launch', space: `space:${website}` })).text, /It's archived with Acme/);
  // Search still finds what's in it.
  assert.match((await claude.call('search', { query: 'website went live' })).text, /went live on 1 March.+in Website, archived/);

  // Nothing new goes in an archived space, and a space archived with Acme reopens with it.
  assert.equal((await ana.browser.json('/api/spaces', { name: 'Ads', who: 'with others', in: acme })).status, 400);
  const reopenWebsite = await archive(ana, website, false);
  assert.equal(reopenWebsite.status, 400);
  assert.match(reopenWebsite.body.message, /archived with Acme/);

  assert.equal((await archive(ana, acme, false)).status, 200);
  assert.deepEqual((await spacesAs(cara)).filter((space) => space.archived), []);
  assert.match((await claude.call('context', { request: 'What should I do today?' })).text, /- Acme[\s\S]*- Website/);
});

test('only people archive, and a personal space stays open', async () => {
  assert.equal((await archive(ana, ana.personalSpaceId)).status, 403);
  // An assistant only for a space nobody else can open; Cara has Acme.
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select archive_space(${acme}::uuid, true)`), refused);
  await assert.rejects(as(ana, (s) => s.tx`select archive_space(${globex}::uuid, true)`), refused, 'not without acting directly');
  // Archiving straight against the table isn't possible either.
  const changed = await as({ ...ana, direct: true }, (s) => s.tx`update spaces set archived_at = now() where id = ${globex}::uuid returning id`).catch((error) => error);
  assert.ok(changed instanceof Error || changed.length === 0);
});

test('archiving shows only through spaces you can open, and nothing new goes in an archived space', async () => {
  const dave = await member(homing.url, 'Dave');
  const [northwind, kitchen, old] = await as({ ...ana, direct: true }, async (s) => {
    const northwind = await createSpace(s, { name: 'Northwind', parentId: globex, closed: true });
    await addMember(s, northwind, dave.id);
    const kitchen = await createSpace(s, { name: 'Kitchen', parentId: ana.personalSpaceId });
    const old = await createSpace(s, { name: 'Old notes', parentId: ana.personalSpaceId });
    return [northwind, kitchen, old];
  });
  assert.equal((await archive(ana, globex)).status, 200);

  // Ana sees Northwind archived with Globex. Dave can't open Globex, so for him nothing changed,
  // and nothing says there's a space above it.
  assert.equal((await ana.browser.json(`/api/spaces/${northwind}`)).body.archive.with.name, 'Globex');
  const forDave = (await dave.browser.json(`/api/spaces/${northwind}`)).body;
  assert.equal(forDave.archive, null);
  assert.equal((await spacesAs(dave)).find((space) => space.id === northwind)?.archived, false);
  assert.doesNotMatch(JSON.stringify(forDave), /Globex|archived/i);

  // Nothing is shared into an archived space, and an archived space isn't shared until it's reopened.
  const conversion = (await ana.browser.json(`/api/spaces/${kitchen}/conversion`)).body;
  assert.ok(!conversion.places.some((place: { id: string }) => place.id === globex));
  assert.equal((await ana.browser.json(`/api/spaces/${kitchen}/conversion`, { in: globex, closed: false, rules: 'drop' })).status, 400);
  assert.equal((await archive(ana, old)).status, 200);
  const sharing = await ana.browser.json(`/api/spaces/${old}/conversion`, { in: null, closed: false, rules: 'drop' });
  assert.equal(sharing.status, 400);
  assert.match(sharing.body.message, /archived/);
  assert.equal((await archive(ana, globex, false)).status, 200);
});

test('an assistant suggests archiving a finished space, rarely, and the user archives it by approving', async () => {
  const [done, spring, autumn] = await as({ ...ana, direct: true }, async (s) => {
    // Cara has it too, so even asked for, archiving it waits for Ana.
    const done = await createSpace(s, { name: 'Summer campaign' });
    await addMember(s, done, cara.id);
    await createSpace(s, { name: 'Ads', parentId: done });
    return [done, await createSpace(s, { name: 'Spring fair' }), await createSpace(s, { name: 'Autumn fair' })];
  });
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'space.archive', input });
  const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
  const shownOf = async (id: string) => (await ana.browser.json(`/api/proposals/${id}`)).body.proposal;
  const decide = async (id: string, approve: boolean) => ana.browser.json(`/api/proposals/${id}/decide`, { approve, shown: String((await shownOf(id)).archive.spaces) });
  const waiting = async () => ((await ana.browser.json('/api/waiting')).body.waiting as { id: string }[]).map((item) => item.id);

  // Two at once: only one of the assistant's own suggestions waits.
  const both = await Promise.all([act({ space: `space:${spring}` }), act({ space: `space:${autumn}` })]);
  assert.equal(both.filter((answer) => !answer.failed).length, 1, both.map((answer) => answer.text).join(' | '));
  const first = proposalOf(both.find((answer) => !answer.failed)!.text);
  const turnedDown = (await shownOf(first)).space as string;
  const other = turnedDown === 'Spring fair' ? autumn : spring;
  assert.equal((await decide(first, false)).status, 200);

  const suggested = await act({ space: `space:${done}`, why: 'The campaign ended in August.' });
  assert.match(suggested.text, /Waiting for the user's approval .+ Nothing is archived yet/);
  const proposal = proposalOf(suggested.text);
  const shown = await shownOf(proposal);
  assert.deepEqual([shown.action, shown.archive.spaces, shown.archive.asked, shown.archive.why], ['archive', 1, false, 'The campaign ended in August.']);
  assert.ok(!(await spacesAs(ana)).find((space) => space.id === done)?.archived, 'nothing changes before Ana decides');
  // What was shown is what's archived: a space added meanwhile means looking again.
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, shown: '0' })).status, 409);
  assert.equal((await decide(proposal, true)).status, 200);
  assert.ok((await spacesAs(ana)).find((space) => space.id === done)?.archived);
  assert.match((await claude.call('read', { ref: `proposal:${proposal}` })).text, /The user archived it on .+ out of everyday context now/);

  // Reopened, it counts as kept open, like one turned down: not suggested again unless the user asks.
  assert.equal((await archive(ana, done, false)).status, 200);
  assert.match((await claude.call('read', { ref: `proposal:${proposal}` })).text, /reopened since/);
  assert.match((await act({ space: `space:${done}` })).text, /kept Summer campaign open .+ Don't suggest it again/);
  const again = await act({ space: `space:${turnedDown === 'Spring fair' ? spring : autumn}` });
  assert.ok(again.failed && new RegExp(`kept ${turnedDown} open`).test(again.text), 'turned down, it isn’t suggested again');

  // Asked for, a few may wait, and the card says it's what the user asked for.
  const asked = proposalOf((await act({ space: `space:${done}`, asked: true })).text);
  assert.equal((await shownOf(asked)).archive.asked, true);
  // Archived another way meanwhile, it leaves what's waiting, and blocks nothing.
  assert.equal((await archive(ana, done)).status, 200);
  assert.ok(!(await waiting()).includes(asked));
  assert.match((await claude.call('read', { ref: `proposal:${asked}` })).text, /archived already, so there is nothing to decide/);
  assert.ok(!(await act({ space: `space:${other}` })).failed);

  // Only for a space the user looks after, never their personal space, and not one archived already.
  const theirs = await as({ ...cara, direct: true }, async (s) => {
    const theirs = await createSpace(s, { name: 'Cara’s club' });
    await addMember(s, theirs, ana.id);
    return theirs;
  });
  assert.match((await act({ space: `space:${theirs}`, asked: true })).text, /Only Cara’s club’s admins archive it/);
  assert.match((await act({ space: `space:${ana.personalSpaceId}` })).text, /personal space stays open/);
  assert.match((await act({ space: `space:${done}`, asked: true })).text, /archived already/);
});

test('a space only the user has is archived and reopened as soon as they ask, and one others have waits', async () => {
  const reading = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Reading list', parentId: ana.personalSpaceId }));
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'space.archive', input });

  assert.match((await act({ space: `space:${reading}`, asked: true })).text, /^Archived Reading list .+out of everyday context/);
  assert.ok((await spacesAs(ana)).find((space) => space.id === reading)?.archived);
  assert.match((await act({ space: `space:${reading}`, reopen: true })).text, /^Reopened Reading list/);
  assert.ok(!(await spacesAs(ana)).find((space) => space.id === reading)?.archived);
  const recorded = await as(ana, (s) => s.tx<{ archived: boolean; agent: string }[]>`select archived, agent from space_archives where space_id = ${reading}::uuid order by at`);
  assert.deepEqual(recorded.map((row) => [row.archived, row.agent]), [[true, 'Claude'], [false, 'Claude']]);

  // Cara has Acme, so even asked for, it waits for Ana, and only she reopens it.
  const waiting = await act({ space: `space:${acme}`, asked: true });
  assert.match(waiting.text, /Waiting for the user's approval/);
  const proposal = /proposal:([0-9a-f-]{36})/.exec(waiting.text)![1];
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: false })).status, 200);
  assert.match((await act({ space: `space:${acme}`, reopen: true })).text, /Others can open Acme, so the user reopens it in Homing/);
});

test('each person sees archiving only through the spaces they can open', async () => {
  const [erik, dave2] = [await member(homing.url, 'Erik'), await member(homing.url, 'Dave')];
  const [client, portal, board] = await as({ ...ana, direct: true }, async (s) => {
    const client = await createSpace(s, { name: 'Client' });
    await addMember(s, client, cara.id);
    const portal = await createSpace(s, { name: 'Portal', parentId: client });
    await addMember(s, portal, erik.id);
    const board = await createSpace(s, { name: 'Board', parentId: client, closed: true });
    await addMember(s, board, dave2.id);
    await changeMember(s, board, dave2.id, 'make admin');
    return [client, portal, board];
  });
  const ours = new Set([client, portal, board]);
  const archivedFor = async (who: Member) => (await spacesAs(who)).filter((space) => ours.has(space.id) && space.archived).map((space) => space.name).sort();

  assert.equal((await archive(ana, client)).status, 200);
  // Ana and Cara can open Client, so what's in it is archived with it for them; Board only for
  // Ana, who's in it. Erik is in Portal and Dave in Board, without Client: for them nothing changed.
  assert.deepEqual(await archivedFor(ana), ['Board', 'Client', 'Portal']);
  assert.deepEqual(await archivedFor(cara), ['Client', 'Portal']);
  assert.deepEqual(await archivedFor(erik), []);
  assert.deepEqual(await archivedFor(dave2), []);
  for (const [who, space] of [[erik, portal], [dave2, board]] as const) {
    const seen = (await who.browser.json(`/api/spaces/${space}`)).body;
    assert.equal(seen.archive, null);
    assert.doesNotMatch(JSON.stringify(seen), /Client/);
  }

  // Board's own admin archives it on his own; Ana sees it archived itself, and it stays archived
  // when Client reopens. Reopening Board while Client is archived leaves it archived with Client.
  assert.equal((await archive(dave2, board)).status, 200);
  assert.equal((await ana.browser.json(`/api/spaces/${board}`)).body.archive.with, null);
  assert.equal((await archive(ana, client, false)).status, 200);
  assert.deepEqual(await archivedFor(ana), ['Board']);
  assert.equal((await archive(ana, client)).status, 200);
  assert.equal((await archive(dave2, board, false)).status, 200);
  assert.deepEqual((await ana.browser.json(`/api/spaces/${board}`)).body.archive.with, { id: client, name: 'Client' });
  assert.deepEqual(await archivedFor(dave2), []);
  // Only Client's admins reopen what's archived with it.
  assert.equal((await archive(cara, client, false)).status, 403);
  assert.equal((await archive(ana, client, false)).status, 200);
});

test('an assistant archives only what nobody else can open, at most 20 an hour, even all at once', async () => {
  const solo = await member(homing.url, 'Solo');
  const asAssistant = (space: string, archived = true) => as({ person: solo.id, agent: 'Claude' }, (s) => s.tx`select archive_space(${space}::uuid, ${archived})`);
  const [shelf, mine, closedChild, openChild, shared] = await as({ ...solo, direct: true }, async (s) => {
    const shelf = await createSpace(s, { name: 'Shelf', parentId: solo.personalSpaceId });
    // A shared space only Solo is in yet, and in one shared with Cara, a closed child only Solo is
    // in, and an open one that Cara has through it.
    const mine = await createSpace(s, { name: 'Mine' });
    const shared = await createSpace(s, { name: 'Shared' });
    await addMember(s, shared, cara.id);
    const closedChild = await createSpace(s, { name: 'Closed child', parentId: shared, closed: true });
    const openChild = await createSpace(s, { name: 'Open child', parentId: shared });
    return [shelf, mine, closedChild, openChild, shared];
  });
  await asAssistant(mine);
  await asAssistant(closedChild);
  await assert.rejects(asAssistant(openChild), refused);
  await assert.rejects(asAssistant(shared), refused);

  // Already archived or already open, it says so instead of changing anything.
  const notebook = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Notebook', parentId: ana.personalSpaceId }));
  const open = await claude.call('act', { action: 'space.archive', input: { space: `space:${notebook}`, reopen: true } });
  assert.ok(open.failed && /Notebook is open already/.test(open.text), open.text);
  await claude.call('act', { action: 'space.archive', input: { space: `space:${notebook}`, asked: true } });
  assert.match((await claude.call('act', { action: 'space.archive', input: { space: `space:${notebook}`, asked: true } })).text, /archived already/);

  // Eighteen more make twenty this hour; of three more at once, none get through.
  const more = await as({ ...solo, direct: true }, (s) => Promise.all(Array.from({ length: 22 }, (_, i) => createSpace(s, { name: `Shelf ${i}`, parentId: shelf }))));
  for (const space of more.slice(0, 18)) await asAssistant(space);
  await assert.rejects(asAssistant(more[18]), refused, 'a twenty-first is refused');
  const burst = await Promise.allSettled(more.slice(19).map((space) => asAssistant(space)));
  assert.equal(burst.filter((result) => result.status === 'fulfilled').length, 0);
  // Still, the person archives directly as much as they like.
  assert.equal((await archive(solo, more[18])).status, 200);
});
