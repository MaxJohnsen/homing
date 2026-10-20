// Issue #6, importing a space and the round trip (spec §3, guarantee 10). An export comes back as a
// new space only the person importing has, after they've seen what it brings, rules word for word.
// Exported again, it says the same: knowledge, who sees it, how it hangs together, its sources and
// history, rules, skills and tasks, with new ids. Who wrote what comes along by name, credited to
// nobody here, and what a person wrote stays theirs to change. An export is untrusted: one that's
// damaged, changed or too big is refused, with nothing created.

import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { after, before, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { authDatabaseUrl } from '../src/db.ts';
import { rewriteReferences, type Manifest } from '../src/export.ts';
import { addRule, removeRule } from '../src/guidance.ts';
import { ImportRefused, importSpace, readForImport } from '../src/import.ts';
import { addSource, archivePage, createPage, gather, publishItem, supersedeItem, updateItem, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace } from '../src/spaces.ts';
import { addTask, changeTask } from '../src/tasks.ts';
import { zip } from '../src/zip.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member, otherCara: Member;
let acme: string, notes: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, ben, otherCara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben'), await member(homing.url, 'Cara')];
  let gunnar = '', plan = '', legal = '';
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
    // Shared after she'd changed it on her own: what it said before stays only hers.
    const draft = await writeItem(s, { pageId: plan, body: 'The launch budget is 1 MNOK.' });
    await updateItem(s, draft.id, { body: 'The launch budget is 1.5 MNOK.' });
    await publishItem(s, draft.id, 'The launch budget is 1.5 MNOK.');
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
    // Rules that refer to a page, in the export and outside it.
    await addRule(s, { spaceId: acme, kind: 'requirement', body: `Check [Gunnar](page:${gunnar}) before writing about the budget.`, shared: true });
    notes = await createPage(s, { spaceId: ana.personalSpaceId, title: 'My own notes' });
    await addRule(s, { spaceId: acme, kind: 'preference', body: `Keep my own notes on page:${notes}.` });
    // A skill whose file refers to a page, and which no longer has another file.
    const skillMd = { path: 'SKILL.md', body: '---\nname: status-report\ndescription: Writes the weekly status report.\n---\n\nStart with what changed.\n' };
    const tone = { path: 'references/tone.md', body: `Plain, short sentences, as [Gunnar](page:${gunnar}) likes them.\n` };
    await saveSkill(s, { spaceId: acme, shared: true, files: [skillMd, tone, { path: 'references/old.md', body: 'The old template.\n' }] });
    await saveSkill(s, { spaceId: acme, shared: true, files: [skillMd, tone] });
    await addTask(s, { spaceId: acme, title: 'Send the brief to Gunnar', description: 'With the budget.', due: '2026-11-02', assignee: cara.id, shared: true });
    await addTask(s, { spaceId: acme, title: 'Book a bigger venue' });
    const banners = await addTask(s, { spaceId: acme, title: 'Order the banners', shared: true });
    await changeTask(s, banners.id, { done: true });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    const booking = await createPage(s, { spaceId: website, title: 'Booking flow', shared: true });
    await writeItem(s, { pageId: booking, body: 'Jon builds the booking flow.', shared: true });
    legal = await createSpace(s, { name: 'Legal', parentId: acme, closed: true });
    await addRule(s, { spaceId: legal, kind: 'requirement', body: 'Contracts go through Ola.', shared: true });
    await archiveSpace(s, await createSpace(s, { name: 'Old site', parentId: acme }), true);
    return acme;
  });
  // A space whose creator isn't known, as when they've left.
  await admin`update spaces set created_by = null, agent = null where id = ${legal}`;
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

/** Sends a zip to be previewed, or imported under a name, as what was previewed with that fingerprint. */
async function upload(who: Member, bytes: Buffer, name?: string, hash = '') {
  const path = name === undefined ? '/api/import/preview' : `/api/import?${new URLSearchParams({ name, hash })}`;
  const response = await who.browser.fetch(path, { method: 'POST', body: new Uint8Array(bytes), headers: { 'content-type': 'application/zip' } });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

/** Previews a zip, then imports it under a name, as the app does, and returns the new space. */
async function imported(who: Member, bytes: Buffer, name: string): Promise<string> {
  const preview = await upload(who, bytes);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const answer = await upload(who, bytes, name, preview.body.hash);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.id;
}

const spacesOf = async (who: Member) => (await admin`select count(*)::int as n from space_access where person_id = ${who.id}`)[0].n as number;

test('an export comes back as a new space only you have, and exported again it says the same', async () => {
  const before = await exported(ana, acme);

  // First what it would bring, rules word for word, with nothing created yet.
  const preview = await upload(ana, before.bytes);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.name, 'Acme');
  assert.deepEqual(preview.body.from, { instance: homing.url.origin, exportedBy: 'Ana', exportedAt: before.manifest.exportedAt });
  // The spaces in Acme were made at the same moment, so any may come first.
  assert.deepEqual(
    preview.body.spaces.map((space: { name: string; depth: number; closed: boolean; archived: boolean }) => [space.name, space.depth, space.closed, space.archived]).sort(),
    [['Acme', 0, false, false], ['Legal', 1, true, false], ['Old site', 1, false, true], ['Website', 1, false, false]],
  );
  assert.deepEqual(preview.body.spaces[0], { name: 'Acme', depth: 0, closed: false, archived: false, pages: 5, sources: 2, tasks: 3 });
  // Rules word for word, saying by name what they refer to in the export, and as written what they refer to outside it.
  assert.deepEqual(preview.body.rules, [
    { space: 'Acme', kind: 'requirement', text: 'Write dates as YYYY-MM-DD.', onlyHere: false, private: false },
    { space: 'Acme', kind: 'preference', text: 'Keep status notes under 200 words.', onlyHere: true, private: false },
    { space: 'Acme', kind: 'preference', text: 'Draft in Norwegian first.', onlyHere: false, private: true },
    { space: 'Acme', kind: 'requirement', text: 'Check Gunnar (page “Gunnar Holm”) before writing about the budget.', onlyHere: false, private: false },
    { space: 'Acme', kind: 'preference', text: `Keep my own notes on page:${notes}.`, onlyHere: false, private: true },
    { space: 'Legal', kind: 'requirement', text: 'Contracts go through Ola.', onlyHere: false, private: false },
  ]);
  assert.deepEqual(preview.body.skills, [{ space: 'Acme', name: 'status-report', private: false }]);
  const spaces = await spacesOf(ana);

  // A space called the same as one she has is refused; another name is a new space at the top.
  const taken = await upload(ana, before.bytes, 'Acme', preview.body.hash);
  assert.equal(taken.status, 400);
  assert.equal(taken.body.field, 'name');
  assert.equal(await spacesOf(ana), spaces);
  const copy = await imported(ana, before.bytes, 'Acme, from the old Homing');
  const [root] = await admin`select name, parent_id, private_to, closed from spaces where id = ${copy}`;
  assert.deepEqual({ ...root }, { name: 'Acme, from the old Homing', parentId: null, privateTo: null, closed: false });
  // Only Ana has it and the spaces in it, the closed one too.
  const members = await admin`select distinct person_id from space_access where space_id in (select space_subtree(${copy}))`;
  assert.deepEqual(members.map((row) => row.personId), [ana.id]);
  assert.equal(await spacesOf(ana), spaces + 4);
  // Nobody here made them: who did comes along by name, if the export says.
  assert.equal((await admin`select count(*)::int as n from spaces where id in (select space_subtree(${copy})) and (created_by is not null or agent is not null)`)[0].n, 0);
  // References in rules and skills' files follow what they point to in the export; others stay as written.
  const [{ page: gunnarHere }] = await admin`select page_id as page from content where space_id = ${copy} and kind = 'title' and body = 'Gunnar Holm'`;
  const followed = await admin`select body from content where space_id = ${copy} and kind in ('requirement', 'preference', 'file') and body like '%page:%' order by body`;
  assert.deepEqual(followed.map((row) => row.body), [
    `Check [Gunnar](page:${gunnarHere}) before writing about the budget.`,
    `Keep my own notes on page:${notes}.`,
    `Plain, short sentences, as [Gunnar](page:${gunnarHere}) likes them.\n`,
  ]);
  // What a shared item said before it was shared stays only hers.
  const [draft] = await admin`select private_to from revisions where space_id in (select space_subtree(${copy})) and body = 'The launch budget is 1 MNOK.'`;
  assert.equal(draft.privateTo, ana.id);

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
  const again = await imported(ana, after.bytes, 'Acme, once more');
  assert.deepEqual(meaning((await exported(ana, again)).manifest), meaning(before.manifest));
});

test('who wrote imported knowledge comes along by name, credited to nobody here', async () => {
  const { bytes } = await exported(ana, acme);
  const copy = await imported(ana, bytes, 'Acme, authors');
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

test('sharing an imported item keeps who wrote it, as the one person they were', async () => {
  const { bytes } = await exported(ana, acme);
  const copy = await imported(ana, bytes, 'Acme, shared on');
  const [{ item, page }] = await admin`select id as item, page_id as page from content where space_id = ${copy} and body = 'Prefers calls before nine.'`;
  // It rests on Ana's call diary, which only she sees, so the people in the space get a copy of it.
  await as({ ...ana, direct: true }, (s) => publishItem(s, item, 'Prefers calls before nine.'));
  const [shared] = await admin`select id, written_by, imported from content where published_from = ${item}`;
  assert.equal(shared.writtenBy, null);
  // The app says who wrote it, imported, and an assistant can't rewrite it.
  await as({ ...ana, direct: true }, (s) => addMember(s, copy, cara.id));
  const seen = (await cara.browser.json(`/api/pages/${page}`)).body;
  assert.deepEqual(seen.items.find((entry: { id: string }) => entry.id === shared.id).by, { name: 'Ana', you: false, imported: true });
  await assert.rejects(as({ person: cara.id, agent: 'Claude' }, (s) => s.tx`update content set body = 'Rewritten' where id = ${shared.id}`), refused);
  // Exported again, the copy and what it was shared from are by the same Ana, and the copy says it came in the import.
  const again = (await exported(ana, copy)).manifest;
  const original = again.items.find((entry) => entry.body === 'Prefers calls before nine.' && entry.visibility === 'private')!;
  const copied = again.items.find((entry) => entry.publishedFrom === original.id)!;
  assert.equal(copied.author.person, original.author.person);
  assert.equal(copied.imported?.from, homing.url.origin);
});

test('nobody else sees anything of an import', async () => {
  const { bytes } = await exported(ana, acme);
  const copy = await imported(ana, bytes, 'Acme, private');
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
    ['a name nobody can see', bundle((m) => { m.spaces[1].name = 'Web\u202esite'; }), /name Homing doesn’t take/],
    ['too much unpacked', zip([['homing.json', ' '.repeat(65 * 1024 * 1024)]]), /larger than Homing imports at once/],
    ['too much unpacked, though it says otherwise', zip([['homing.json', ' '.repeat(65 * 1024 * 1024)]]).then(understated), /larger than Homing imports at once/],
    ['a damaged zip', damaged(), /damaged/],
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

/** 36 bytes: an end record saying its one file is listed just before it, where the list starts and stops. */
function damaged(): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46, 12);
  end.writeUInt32LE(10, 16);
  return Buffer.concat([Buffer.alloc(10), Buffer.from('PK\x01\x02'), end]);
}

test('an export is held to what Homing keeps, and to rules and names that hide nothing', async () => {
  const { manifest } = await exported(ana, acme);
  const bundle = (change: (m: Manifest) => void) => {
    const copy = structuredClone(manifest);
    change(copy);
    return exportOf(copy);
  };
  const item = (m: Manifest, body: string) => m.items.find((entry) => entry.body === body)!;
  const file = (m: Manifest, path: string) => m.items.find((entry) => entry.path === path)!;
  // A page type Homing hasn't seen is just a type, whatever it's called.
  for (const type of ['constructor', 'toString', '__proto__']) {
    const answer = await upload(ana, await bundle((m) => { m.pages.find((page) => page.type === 'person')!.type = type; }));
    assert.equal(answer.status, 200, type);
  }
  const refusals: [string, (m: Manifest) => void, RegExp][] = [
    ['knowledge too long', (m) => { item(m, 'Prefers calls before nine.').body = 'x'.repeat(20_001); }, /longer than Homing keeps/],
    ['a rule too long', (m) => { item(m, 'Write dates as YYYY-MM-DD.').body = 'x'.repeat(4_001); }, /longer than Homing keeps/],
    ['an overview too long', (m) => { item(m, 'The launch is in November.').body = 'x'.repeat(2_001); }, /longer than Homing keeps/],
    ['a title too long', (m) => { item(m, 'Launch plan').body = 'x'.repeat(201); }, /longer than Homing keeps/],
    ['a page type too long', (m) => { m.pages.find((page) => page.type === 'person')!.type = 'x'.repeat(41); }, /changed or damaged/],
    ['a skill name Homing doesn’t take', (m) => { item(m, 'status-report').body = 'Status Report'; }, /name Homing doesn’t take/],
    ['a skill named otherwise in its SKILL.md', (m) => { item(m, 'status-report').body = 'weekly-report'; }, /named differently in its SKILL\.md/],
    ['a skill’s file too large', (m) => { file(m, 'references/tone.md').body = 'x'.repeat(512 * 1024 + 1); }, /changed or damaged/],
    ['two files at one place', (m) => { m.items.push({ ...file(m, 'references/tone.md'), id: crypto.randomUUID() }); }, /two files at one place/],
    ['two spaces with one name', (m) => { m.spaces.find((space) => space.name === 'Legal')!.name = 'website'; }, /both called/],
    ['a person’s name over two lines', (m) => { m.people[0].name = 'Ana\nBen'; }, /characters nobody sees/],
    ['an agent’s name turned around', (m) => { item(m, 'Gunnar asked for the budget by Friday.').author.agent = 'Cl‮aude'; }, /characters nobody sees/],
    ['the exporter’s name with a space nobody sees', (m) => { m.exportedBy.name = 'A​na'; }, /characters nobody sees/],
    ['a rule turned around', (m) => { item(m, 'Write dates as YYYY-MM-DD.').body = 'Write dates as ‮DD-MM-YYYY.'; }, /hide what it says/],
    ['a skill’s file with hidden words', (m) => { file(m, 'SKILL.md').body += '\u{E0049}\u{E0047}\u{E004E}'; }, /hide what it says/],
  ];
  for (const [what, change, message] of refusals) {
    const answer = await upload(ana, await bundle(change));
    assert.equal(answer.status, 400, what);
    assert.match(answer.body.message, message, what);
  }
});

test('an import is of exactly the export that was looked at', async () => {
  const { bytes, manifest } = await exported(ana, acme);
  const preview = await upload(ana, bytes);
  const changed = structuredClone(manifest);
  changed.items.find((entry) => entry.body === 'Write dates as YYYY-MM-DD.')!.body = 'Always write dates as DD.MM.YYYY.';
  const spaces = await spacesOf(ana);
  for (const hash of [preview.body.hash, '']) {
    const answer = await upload(ana, await exportOf(changed), 'Acme, changed', hash);
    assert.equal(answer.status, 400);
    assert.match(answer.body.message, /isn’t the export you looked at/);
  }
  assert.equal(await spacesOf(ana), spaces);
});

test('an export made to be heavy is refused, and Homing keeps answering meanwhile', async () => {
  // A small zip that unpacks to twenty million empty objects.
  const heavy = await zip([['homing.json', `{"pad":[${'{},'.repeat(20_000_000)}{}]}`]]);
  assert.ok(heavy.length < 1024 * 1024);
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  // Read one at a time: another at the same moment waits its turn.
  const answers = await Promise.all([upload(ana, heavy), upload(cara, heavy)]);
  delay.disable();
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [400, 429]);
  assert.match(answers.find((answer) => answer.status === 400)!.body.message, /larger than Homing imports at once/);
  // Homing's own work never waited more than a moment at a time.
  assert.ok(delay.max < 1e9, `${Math.round(delay.max / 1e6)} ms`);
  assert.equal((await ana.browser.json('/api/spaces')).status, 200);
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

test('an import that takes too long is refused, with nothing created', async () => {
  const { bytes } = await exported(ana, acme);
  const { hash } = (await upload(ana, bytes)).body;
  const payload = await readForImport(bytes, 'Acme, slowly', hash);
  const spaces = await spacesOf(ana);
  await assert.rejects(
    as({ ...ana, direct: true }, async (s) => {
      await s.tx`set local statement_timeout = 1`;
      return importSpace(s, 'Acme, slowly', payload);
    }),
    (error: Error) => error instanceof ImportRefused && /took too long/.test(error.message),
  );
  assert.equal(await spacesOf(ana), spaces);
});

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
    spaces: m.spaces.map((space) => ({
      path: path(space.id), closed: space.closed, private: space.private, creator: by(space.creator), createdAt: space.createdAt,
      archived: space.archived && { at: space.archived.at, by: someone(space.archived.by) },
    })),
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
