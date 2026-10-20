// Issue #6, importing a space and the round trip (spec §3, guarantee 10). An export comes back as a
// new space only the person importing has, after they've seen what it brings, rules word for word.
// Exported again, it says the same: knowledge, who sees it, how it hangs together, its sources and
// history, rules, skills and tasks, with new ids. Who wrote what comes along by name, credited to
// nobody here, and what a person wrote stays theirs to change. An export is untrusted: one that's
// damaged, changed or too big is refused, with nothing created.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { authDatabaseUrl } from '../src/db.ts';
import { rewriteReferences, type Manifest } from '../src/export.ts';
import { addRule, removeRule } from '../src/guidance.ts';
import { addSource, archivePage, createPage, gather, publishItem, supersedeItem, updateItem, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { addTask, changeTask } from '../src/tasks.ts';
import { zip } from '../src/zip.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member, otherCara: Member;
let acme: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, ben, otherCara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben'), await member(homing.url, 'Cara')];
  let gunnar = '', plan = '';
  acme = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id, 'admin');
    await addMember(s, acme, otherCara.id);
    const email = await addSource(s, { spaceId: acme, excerpt: 'Gunnar: Jon takes over the steering group in November.', reference: 'Email from Gunnar, 3 October', shared: true });
    gunnar = await createPage(s, { spaceId: acme, title: 'Gunnar Holm', type: 'person', shared: true });
    const leads = await writeItem(s, { pageId: gunnar, body: 'Gunnar leads the steering group.', shared: true });
    await supersedeItem(s, leads.id, { body: 'Jon takes over the steering group from Gunnar in November.', sources: [email.id], shared: true });
    const role = await writeItem(s, { pageId: gunnar, body: 'Project manager at Northwind.', shared: true });
    await updateItem(s, role.id, { body: 'Project manager at Northwind since 2024.' });
    await supersedeItem(s, role.id, { body: 'Project manager at Northwind, moving to Oslo in 2027.' });
    const diary = await addSource(s, { spaceId: acme, excerpt: 'Gunnar prefers calls before nine.', reference: 'Ana’s call diary' });
    await writeItem(s, { pageId: gunnar, body: 'Prefers calls before nine.', sources: [diary.id] });
    const contracts = await writeItem(s, { pageId: gunnar, body: 'Gunnar signs contracts over 1 MNOK.', sources: [diary.id] });
    await publishItem(s, contracts.id, contracts.body);
    // Shared as a copy, then updated on her own side, so the update stands in the copy's place for her.
    await updateItem(s, contracts.id, { body: 'Gunnar signs contracts over 2 MNOK.' });
    // Something resting on a note Ana keeps in her personal space, which no export of Acme holds.
    const notebook = await addSource(s, { spaceId: ana.personalSpaceId, excerpt: 'My reckoning: 2 MNOK.', reference: 'Ana’s notebook' });
    await writeItem(s, { pageId: gunnar, body: 'The budget is 2 MNOK.', sources: [notebook.id] });
    plan = await createPage(s, { spaceId: acme, title: 'Launch plan', type: 'project', shared: true });
    await writeItem(s, { pageId: plan, body: `[Gunnar](page:${gunnar}) signs off the launch.`, shared: true });
    const launch = await createPage(s, { spaceId: acme, title: 'Launch 2027', shared: true });
    await gather(s, { collectionId: launch, pageId: plan, shared: true });
    const worries = await createPage(s, { spaceId: acme, title: 'My launch worries' });
    await writeItem(s, { pageId: worries, body: 'The venue may be too small.' });
    await gather(s, { collectionId: launch, pageId: worries });
    const vendor = await createPage(s, { spaceId: acme, title: 'Old print vendor', shared: true });
    await writeItem(s, { pageId: vendor, body: 'Trykkeriet AS printed the brochures until 2025.', shared: true });
    await archivePage(s, vendor, true);
    await writeOverview(s, { spaceId: acme, text: 'The launch is in November.', shared: true });
    await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Write dates as YYYY-MM-DD.', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Keep status notes under 200 words.', shared: true, onlyHere: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Draft in Norwegian first.' });
    await removeRule(s, (await addRule(s, { spaceId: acme, kind: 'preference', body: 'Use the old logo.', shared: true })).id);
    await saveSkill(s, {
      spaceId: acme, shared: true,
      files: [{ path: 'SKILL.md', body: '---\nname: status-report\ndescription: Writes the weekly status report.\n---\n\nStart with what changed.\n' }, { path: 'references/tone.md', body: 'Plain, short sentences.\n' }],
    });
    await addTask(s, { spaceId: acme, title: 'Send the brief to Gunnar', description: 'With the budget.', due: '2026-11-02', assignee: cara.id, shared: true });
    await addTask(s, { spaceId: acme, title: 'Book a bigger venue' });
    const banners = await addTask(s, { spaceId: acme, title: 'Order the banners', shared: true });
    await changeTask(s, banners.id, { done: true });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    const booking = await createPage(s, { spaceId: website, title: 'Booking flow', shared: true });
    await writeItem(s, { pageId: booking, body: 'Jon builds the booking flow.', shared: true });
    const legal = await createSpace(s, { name: 'Legal', parentId: acme, closed: true });
    await addRule(s, { spaceId: legal, kind: 'requirement', body: 'Contracts go through Ola.', shared: true });
    return acme;
  });
  await as({ person: ana.id, agent: 'Claude' }, (s) => writeItem(s, { pageId: gunnar, body: 'Gunnar asked for the budget by Friday.' }));
  await as({ ...cara, direct: true }, async (s) => {
    await writeItem(s, { pageId: plan, body: 'The launch party is at Bislett.', shared: true });
    await writeItem(s, { pageId: gunnar, body: 'Gunnar seemed tired on the call.' });
  });
  await as({ ...otherCara, direct: true }, (s) => writeItem(s, { pageId: plan, body: 'The printer is booked.', shared: true }));
  await as({ space: acme }, (s) => writeItem(s, { pageId: plan, body: 'The weekly digest went out.', shared: true }));
});

after(() => homing.close());

/** Downloads a space's export as the person. */
async function exported(who: Member, spaceId: string) {
  const response = await who.browser.fetch(`/api/spaces/${spaceId}/export`);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, manifest: JSON.parse(strFromU8(unzipSync(bytes)['homing.json'])) as Manifest };
}

/** Sends a zip to be previewed, or imported under a name. */
async function upload(who: Member, bytes: Buffer, name?: string) {
  const path = name === undefined ? '/api/import/preview' : `/api/import?name=${encodeURIComponent(name)}`;
  const response = await who.browser.fetch(path, { method: 'POST', body: new Uint8Array(bytes), headers: { 'content-type': 'application/zip' } });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

const spacesOf = async (who: Member) => (await admin`select count(*)::int as n from space_access where person_id = ${who.id}`)[0].n as number;

test('an export comes back as a new space only you have, and exported again it says the same', async () => {
  const before = await exported(ana, acme);

  // First what it would bring, rules word for word, with nothing created yet.
  const preview = await upload(ana, before.bytes);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.name, 'Acme');
  assert.deepEqual(preview.body.from, { instance: homing.url.origin, exportedBy: 'Ana', exportedAt: before.manifest.exportedAt });
  // Website and Legal were made at the same moment, so either may come first.
  assert.deepEqual(preview.body.spaces.map((space: { name: string; depth: number; closed: boolean }) => [space.name, space.depth, space.closed]).sort(), [['Acme', 0, false], ['Legal', 1, true], ['Website', 1, false]]);
  assert.deepEqual(preview.body.spaces[0], { name: 'Acme', depth: 0, closed: false, archived: false, pages: 5, sources: 2, tasks: 3 });
  assert.deepEqual(preview.body.rules, [
    { space: 'Acme', kind: 'requirement', text: 'Write dates as YYYY-MM-DD.', onlyHere: false, private: false },
    { space: 'Acme', kind: 'preference', text: 'Keep status notes under 200 words.', onlyHere: true, private: false },
    { space: 'Acme', kind: 'preference', text: 'Draft in Norwegian first.', onlyHere: false, private: true },
    { space: 'Legal', kind: 'requirement', text: 'Contracts go through Ola.', onlyHere: false, private: false },
  ]);
  assert.deepEqual(preview.body.skills, [{ space: 'Acme', name: 'status-report', private: false }]);
  const spaces = await spacesOf(ana);

  // A space called the same as one she has is refused; another name is a new space at the top.
  const taken = await upload(ana, before.bytes, 'Acme');
  assert.equal(taken.status, 400);
  assert.equal(taken.body.field, 'name');
  assert.equal(await spacesOf(ana), spaces);
  const imported = await upload(ana, before.bytes, 'Acme, from the old Homing');
  assert.equal(imported.status, 200);
  const copy = imported.body.id as string;
  const [root] = await admin`select name, parent_id, private_to, closed from spaces where id = ${copy}`;
  assert.deepEqual({ ...root }, { name: 'Acme, from the old Homing', parentId: null, privateTo: null, closed: false });
  // Only Ana has it and the spaces in it, the closed one too.
  const members = await admin`select distinct person_id from space_access where space_id in (select space_subtree(${copy}))`;
  assert.deepEqual(members.map((row) => row.personId), [ana.id]);
  assert.equal(await spacesOf(ana), spaces + 3);

  // Exported again, it means the same, with new ids.
  const after = await exported(ana, copy);
  assert.deepEqual(meaning(after.manifest), meaning(before.manifest));
  const ids = new Set([...before.manifest.spaces, ...before.manifest.pages, ...before.manifest.items, ...before.manifest.sources, ...before.manifest.tasks].map((thing) => thing.id));
  assert.ok([...after.manifest.spaces, ...after.manifest.pages, ...after.manifest.items, ...after.manifest.sources, ...after.manifest.tasks].every((thing) => !ids.has(thing.id)));
  // Each thing says where it came from: its id there, the Homing, and who imported it and when.
  const leads = after.manifest.items.find((item) => item.body === 'Gunnar leads the steering group.')!;
  assert.equal(leads.imported?.id, before.manifest.items.find((item) => item.body === leads.body)!.id);
  assert.equal(leads.imported?.from, homing.url.origin);
  assert.equal(after.manifest.people.find((person) => person.key === leads.imported?.by)?.name, 'Ana');
  assert.equal(leads.imported?.by, after.manifest.exportedBy.person);

  // And once more around: importing the second export brings the same again.
  const again = await upload(ana, after.bytes, 'Acme, once more');
  assert.equal(again.status, 200);
  assert.deepEqual(meaning((await exported(ana, again.body.id)).manifest), meaning(before.manifest));
});

test('who wrote imported knowledge comes along by name, credited to nobody here', async () => {
  const { bytes } = await exported(ana, acme);
  const copy = (await upload(ana, bytes, 'Acme, authors')).body.id as string;
  // Nothing in it is recorded as written by anyone here, Ana included.
  const local = await admin`
    select count(*)::int as n from content where space_id in (select space_subtree(${copy})) and (written_by is not null or agent is not null or not imported ? 'author')
  `;
  assert.equal(local[0].n, 0);

  // The app and assistants say who wrote it, and that it was imported.
  const [{ page }] = await admin`select page_id as page from content where space_id = ${copy} and kind = 'title' and body = 'Launch plan'`;
  // Ana adds Cara, the same Cara who wrote one of these in Acme. She isn't credited with it here either.
  await as({ ...ana, direct: true }, (s) => addMember(s, copy, cara.id));
  const seen = (await cara.browser.json(`/api/pages/${page}`)).body;
  const party = seen.items.find((item: { text: string }) => item.text === 'The launch party is at Bislett.');
  assert.deepEqual(party.by, { name: 'Cara', you: false, imported: true });
  const signs = seen.items.find((item: { text: string }) => item.text.endsWith('signs off the launch.'));
  assert.deepEqual(signs.by, { name: 'Ana', you: false, imported: true });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(cara.browser);
  const claude = await assistant.open();
  assert.match((await claude.call('read', { ref: `item:${party.id}` })).text, /Written by Cara \(imported\)/);

  // What a person wrote stays theirs: an assistant can't rewrite or replace it, here or in the store.
  const [{ item: written }] = await admin`select id as item from content where space_id = ${copy} and body = 'Jon takes over the steering group from Gunnar in November.'`;
  assert.match((await claude.call('remember', { space: `space:${copy}`, text: 'Jon took over in October.', replaces: `item:${written}` })).text, /never change what people wrote|isn’t yours|can’t/i);
  await assert.rejects(as({ person: cara.id, agent: 'Claude' }, (s) => s.tx`update content set body = 'Rewritten' where id = ${written}`), refused);
  await assert.rejects(
    as({ person: cara.id, agent: 'Claude' }, (s) => s.tx`insert into content (page_id, space_id, kind, body, supersedes, private_to) select page_id, space_id, 'text', 'Replaced', id, ${cara.id} from content where id = ${written}`),
    refused,
  );
  // What an assistant wrote, it can keep up to date, as Ana's can.
  const [{ item: budget }] = await admin`select id as item from content where space_id = ${copy} and body = 'Gunnar asked for the budget by Friday.'`;
  await as({ person: ana.id, agent: 'Claude' }, (s) => updateItem(s, budget, { body: 'Gunnar asked for the budget by Thursday.' }));
  // A person changing imported text is then its writer, and the imported version stays in its history.
  await as({ ...ana, direct: true }, (s) => updateItem(s, written, { body: 'Jon took over the steering group in October.' }));
  const [changed] = await admin`select written_by, imported from content where id = ${written}`;
  assert.equal(changed.writtenBy, ana.id);
  assert.ok(!('author' in changed.imported));
  const [history] = await admin`select body, written_by, imported from revisions where content_id = ${written}`;
  assert.deepEqual([history.body, history.writtenBy, history.imported.author.name, history.imported.author.by], ['Jon takes over the steering group from Gunnar in November.', null, 'Ana', 'person']);

  // What rested on a source the export didn't hold never counts as resting only on what everyone sees.
  const [{ item: budgetHere }] = await admin`select id as item from content where space_id = ${copy} and body = 'The budget is 2 MNOK.'`;
  const sharing = await ana.browser.json(`/api/items/${budgetHere}/publication`);
  assert.equal(sharing.status, 200);
  assert.deepEqual([sharing.body.hiddenElsewhere, sharing.body.hiddenUnseen, sharing.body.copy], [1, 0, true]);
  assert.equal(await as(ana, async (s) => (await s.tx`select hidden_sources(${budgetHere}) as n`)[0].n), 1);
  // Shared as a copy, then updated on her own side: the update still rests on what the import didn't bring.
  await as({ ...ana, direct: true }, (s) => publishItem(s, budgetHere, 'The budget is 2 MNOK.'));
  const update = await as({ ...ana, direct: true }, (s) => updateItem(s, budgetHere, { body: 'The budget is 3 MNOK.' }));
  assert.equal(await as(ana, async (s) => (await s.tx`select hidden_sources(${update!.id}) as n`)[0].n), 1);
});

test('nobody else sees anything of an import', async () => {
  const { bytes } = await exported(ana, acme);
  const copy = (await upload(ana, bytes, 'Acme, private')).body.id as string;
  const inside = await admin`select id from spaces where id in (select space_subtree(${copy}))`;
  for (const who of [cara, ben]) {
    const listed = (await who.browser.json('/api/spaces')).body.spaces as { id: string }[];
    assert.ok(!listed.some((space) => inside.some((row) => row.id === space.id)), who.name);
    assert.equal((await who.browser.json(`/api/spaces/${copy}`)).status, 404);
    assert.equal((await who.browser.fetch(`/api/spaces/${copy}/export`)).status, 404);
    const found = (await who.browser.json('/api/search?q=Trykkeriet')).body;
    assert.ok(found.pages.every((hit: { space: { id: string | null } }) => !inside.some((row) => row.id === hit.space.id)), who.name);
    // Straight against the database too.
    const rows = await as(who, (s) => s.tx`
      select (select count(*) from content where space_id in (select space_subtree(${copy})))::int
           + (select count(*) from sources where space_id in (select space_subtree(${copy})))::int
           + (select count(*) from tasks where space_id in (select space_subtree(${copy})))::int
           + (select count(*) from imports where space_id = ${copy})::int as n
    `);
    assert.equal(rows[0].n, 0, who.name);
  }
});

test('an export that’s damaged, changed or too big is refused, with nothing created', async () => {
  const { manifest } = await exported(ana, acme);
  const spaces = await spacesOf(ana);
  const [{ n: imports }] = await admin`select count(*)::int as n from imports`;
  const bundle = (change: (m: Manifest) => void, files: [string, string][] = []) => {
    const copy = structuredClone(manifest);
    change(copy);
    return zip([['homing.json', JSON.stringify(copy)], ...files]);
  };
  const refusals: [string, Buffer | Promise<Buffer>, RegExp][] = [
    ['not a zip', Buffer.from('Just some text, not a zip.'), /isn’t a zip/],
    ['no homing.json', zip([['knowledge/index.md', '# Acme\n']]), /no homing\.json/],
    ['a newer format', bundle((m) => Object.assign(m, { version: 2 })), /newer Homing, in version 2/],
    ['another format', bundle((m) => Object.assign(m, { format: 'something-else' })), /isn’t an export from Homing/],
    ['a path out of its skill', bundle((m) => { m.items.find((item) => item.path === 'references/tone.md')!.path = '../../../etc/passwd'; }), /outside its skill/],
    ['a replacement of nothing', bundle((m) => { m.items.find((item) => item.supersedes)!.supersedes = crypto.randomUUID(); }), /replaces something that isn’t on its page/],
    ['a page in a space outside it', bundle((m) => { m.pages[0].space = cara.personalSpaceId; }), /isn’t in the export/],
    ['a circle of replacements', bundle((m) => { const later = m.items.find((item) => item.supersedes)!; m.items.find((item) => item.id === later.supersedes)!.supersedes = later.id; }), /in a circle/],
    ['a removal that reaches elsewhere than its rule', bundle((m) => { const removal = m.items.find((item) => item.kind === 'removed')!; removal.reachesDown = !removal.reachesDown; }), /reaches further or less far/],
    ['a citation of nothing', bundle((m) => { m.items.find((item) => item.sources.length)!.sources = [crypto.randomUUID()]; }), /cites a source that isn’t in the export/],
    ['a wrong type', bundle((m) => Object.assign(m.items[0], { body: 42 })), /changed or damaged/],
    ['a name nobody can see', bundle((m) => { m.spaces[1].name = 'Web‮site'; }), /name Homing doesn’t take/],
    ['too much unpacked', zip([['homing.json', ' '.repeat(151 * 1024 * 1024)]]), /larger than Homing imports at once/],
    ['too much unpacked, though it says otherwise', zip([['homing.json', ' '.repeat(151 * 1024 * 1024)]]).then(understated), /larger than Homing imports at once/],
  ];
  for (const [what, zipped, message] of refusals) {
    const answer = await upload(ana, await zipped, 'Acme, refused');
    assert.equal(answer.status, 400, what);
    assert.match(answer.body.message, message, what);
  }
  // Too big to upload at all.
  const huge = await ana.browser.fetch('/api/import/preview', { method: 'POST', body: new Uint8Array(101 * 1024 * 1024), headers: { 'content-type': 'application/zip' } });
  assert.equal(huge.status, 413);
  // Nothing was created by any of them.
  assert.equal(await spacesOf(ana), spaces);
  assert.equal((await admin`select count(*)::int as n from imports`)[0].n, imports);
  // Nobody signed out imports anything.
  const stranger = new Browser(homing.url);
  assert.equal((await stranger.fetch('/api/import?name=Acme', { method: 'POST', body: new Uint8Array(await exportOf(manifest)) })).status, 401);
});

/** A zip whose list says its homing.json is tiny, however large it really is. */
function understated(bytes: Buffer): Buffer {
  const entry = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(10, entry + 24);
  return bytes;
}

function exportOf(manifest: Manifest): Promise<Buffer> {
  return zip([['homing.json', JSON.stringify(manifest)]]);
}

test('the store writes an import only into spaces it makes, and only for a person, directly', async () => {
  const payload = (space: string) => ({
    from: { instance: 'https://elsewhere.test', exportedBy: 'Mallory', exportedAt: new Date().toISOString(), space: crypto.randomUUID() },
    spaces: [{ id: crypto.randomUUID(), name: 'Trojan', parent: null, closed: false, archivedAt: null, imported: {} }],
    pages: [{ id: crypto.randomUUID(), space, type: null, createdAt: new Date().toISOString(), archivedAt: null, imported: {} }],
    items: [], citations: [], sources: [], revisions: [], gathered: [], pageArchives: [], tasks: [],
  });
  // A page in Acme, a space that existed before, through an import: refused, and nothing made.
  await assert.rejects(as({ ...ben, direct: true }, (s) => s.tx`select import_bundle(${s.tx.json(payload(acme))})`), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`select import_bundle(${s.tx.json(payload(acme))})`), refused);
  // An assistant, or anyone not editing directly, doesn't import.
  const own = payload('');
  own.pages = [];
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select import_bundle(${s.tx.json(own)})`), refused);
  assert.equal((await admin`select count(*)::int as n from spaces where name = 'Trojan'`)[0].n, 0);
});

/**
 * What an export says, without ids or what an import may change: the spaces and how they nest,
 * pages, knowledge in order with who sees it and who wrote it, how things hang together, sources and
 * citations, history, archive states, rules, skills and tasks. References in text point to what
 * they name.
 */
function meaning(m: Manifest) {
  const spaces = new Map(m.spaces.map((space) => [space.id, space]));
  const path = (id: string): string => {
    const space = spaces.get(id)!;
    return space.parent === null ? '' : `${path(space.parent)}/${space.name}`;
  };
  const items = new Map(m.items.map((item) => [item.id, item]));
  // People by name, and which of those with the same name they are, in the order they first come.
  const nameOf = new Map(m.people.map((person) => [person.key, person.name]));
  const ranks = new Map<string, string>();
  const someone = (key: string | null | undefined) => {
    if (!key) return null;
    if (!ranks.has(key)) ranks.set(key, `${nameOf.get(key)}#${[...ranks.values()].filter((label) => label.startsWith(`${nameOf.get(key)}#`)).length}`);
    return ranks.get(key)!;
  };
  const by = (author: Manifest['items'][number]['author'] | null) => author && { by: author.by, person: someone(author.person), agent: author.agent };
  const titles = new Map<string, string>();
  for (const item of m.items) if (item.kind === 'title' && !titles.has(item.page)) titles.set(item.page, item.body);
  const pages = new Map(m.pages.map((page) => [page.id, `${path(page.space)}|${page.type ?? ''}|${titles.get(page.id) ?? ''}`]));
  const sources = new Map(m.sources.map((source) => [source.id, `${path(source.space)}|${source.reference}|${source.excerpt}`]));
  const named = (id: string) => pages.get(id) ?? (items.has(id) ? `${pages.get(items.get(id)!.page)}#${items.get(id)!.body.slice(0, 40)}` : undefined) ?? sources.get(id) ?? (spaces.has(id) ? path(id) : undefined);
  const words = (text: string) => rewriteReferences(text, (id) => named(id));
  const item = (id: string | null) => (id === null ? null : `${pages.get(items.get(id)!.page)}#${words(items.get(id)!.body)}`);
  return {
    items: m.items.map((entry) => ({
      page: pages.get(entry.page), kind: entry.kind, path: entry.path, body: words(entry.body), visibility: entry.visibility, author: by(entry.author),
      createdAt: entry.createdAt, writtenAt: entry.writtenAt, onlyHere: entry.onlyHere, reachesDown: entry.reachesDown, supersedes: item(entry.supersedes), publishedFrom: item(entry.publishedFrom),
      published: entry.published && { by: someone(entry.published.by), at: entry.published.at }, sources: entry.sources.map((id) => sources.get(id)), sourcesElsewhere: entry.sourcesElsewhere,
    })),
    spaces: m.spaces.map((space) => ({ path: path(space.id), closed: space.closed, private: space.private, creator: by(space.creator), archived: space.archived && { at: space.archived.at, by: someone(space.archived.by) } })),
    pages: m.pages.map((page) => ({
      page: pages.get(page.id), createdAt: page.createdAt, archived: page.archived && { at: page.archived.at, by: someone(page.archived.by) },
      archives: m.pageArchives.filter((archive) => archive.page === page.id).map((archive) => [archive.archived, archive.at, by(archive.author)]),
    })),
    revisions: m.revisions.map((revision) => ({ item: item(revision.item), body: words(revision.body), visibility: revision.visibility, author: by(revision.author), writtenAt: revision.writtenAt, replacedAt: revision.replacedAt })),
    sources: m.sources.map((source) => ({ source: sources.get(source.id), visibility: source.visibility, author: by(source.author), createdAt: source.createdAt })),
    links: m.links.map((link) => ({ item: item(link.item), from: pages.get(link.from), to: pages.get(link.to) })),
    gathered: m.gathered.map((gathering) => ({ collection: pages.get(gathering.collection), page: pages.get(gathering.page), visibility: gathering.visibility, author: by(gathering.author), createdAt: gathering.createdAt })),
    tasks: m.tasks.map((task) => ({
      ...task, id: undefined, space: path(task.space), imported: undefined, author: by(task.author), assignee: someone(task.assignee), done: task.done && { at: task.done.at, by: someone(task.done.by) },
    })),
  };
}
