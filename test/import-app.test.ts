// Issue #6, importing a space and the round trip (spec §3, guarantee 10). An export comes back as a
// new space only the person importing has, after they've seen what it brings, rules word for word.
// Exported again, it says the same: knowledge, who sees it, how it hangs together, its sources and
// history, rules, skills and tasks, with new ids. Who wrote what comes along by name, credited to
// nobody here, and what a person wrote stays theirs to change. An export is untrusted: one that's
// damaged, changed or too big is refused, with nothing created.

import assert from 'node:assert/strict';
import { request } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { after, before, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { authDatabaseUrl } from '../src/db.ts';
import { mentions } from '../src/bundle.ts';
import { bundleFiles, bundleManifest, rewriteReferences, type Manifest } from '../src/export.ts';
import { addInclude, addRule, removeRule } from '../src/guidance.ts';
import { addSource, archivePage, createPage, gather, publishItem, supersedeItem, updateItem, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace } from '../src/spaces.ts';
import { addTask, changeTask } from '../src/tasks.ts';
import { zip } from '../src/zip.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { admin, as, db, importInto, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member, otherCara: Member;
let acme: string, notes: string, website: string, brand: string;

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
    website = await createSpace(s, { name: 'Website', parentId: acme });
    const booking = await createPage(s, { spaceId: website, title: 'Booking flow', shared: true });
    await writeItem(s, { pageId: booking, body: 'Jon builds the booking flow.', shared: true });
    legal = await createSpace(s, { name: 'Legal', parentId: acme, closed: true });
    await addRule(s, { spaceId: legal, kind: 'requirement', body: 'Contracts go through Ola.', shared: true });
    await archiveSpace(s, await createSpace(s, { name: 'Old site', parentId: acme }), true);
    // Guidance one space includes from another: a sibling's rules, a skill, and Ana's own.
    brand = await createSpace(s, { name: 'Brand', parentId: acme });
    await addRule(s, { spaceId: brand, kind: 'preference', body: 'Use the green logo.', shared: true });
    const checklist = await saveSkill(s, {
      spaceId: website, shared: true,
      files: [{ path: 'SKILL.md', body: '---\nname: launch-checklist\ndescription: Checks that a launch is ready.\n---\n\nGo through the list.\n' }],
    });
    await addInclude(s, { spaceId: website, included: { space: legal }, shared: true });
    await addInclude(s, { spaceId: legal, included: { skill: checklist.pageId }, shared: true });
    await addInclude(s, { spaceId: legal, included: { space: website } });
    // Hers waits once Cara includes the same for everyone.
    await addInclude(s, { spaceId: website, included: { space: brand } });
    // And the rules of a space outside Acme.
    const standards = await createSpace(s, { name: 'Standards' });
    await addRule(s, { spaceId: standards, kind: 'requirement', body: 'Name files by date.', shared: true });
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true });
    return acme;
  });
  // A space whose creator isn't known, as when they've left.
  await admin`update spaces set created_by = null, agent = null where id = ${legal}`;
  await as({ person: ana.id, agent: 'Claude' }, (s) => writeItem(s, { pageId: gunnar, body: 'Gunnar asked for the budget by Friday.' }));
  await as({ ...cara, direct: true }, async (s) => {
    await addInclude(s, { spaceId: website, included: { space: brand }, shared: true });
    // Her own include, and one for everyone of rules only she can open: neither is Ana's to export, nor a sign of them.
    const hers = await createSpace(s, { name: 'Cara’s standards' });
    await addRule(s, { spaceId: hers, kind: 'requirement', body: 'Cara checks the numbers.', shared: true });
    await addInclude(s, { spaceId: website, included: { space: hers }, shared: true });
    await addInclude(s, { spaceId: acme, included: { space: hers } });
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
  const files = unzipSync(bytes);
  return { bytes, files, manifest: bundleManifest((path) => strFromU8(files[path])) };
}

/** Sends a zip to be previewed. */
async function upload(who: Member, bytes: Buffer) {
  const response = await who.browser.fetch('/api/import/preview', { method: 'POST', body: new Uint8Array(bytes), headers: { 'content-type': 'application/zip' } });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

/** Starts importing what was previewed with that fingerprint under a name. */
async function start(who: Member, name: string, hash: string) {
  const response = await who.browser.fetch(`/api/import?${new URLSearchParams({ name, hash })}`, { method: 'POST' });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

/** How the person's import ended, once it has, as the app sees it. */
async function ended(who: Member): Promise<Record<string, any>> {
  for (;;) {
    const { body } = await who.browser.json('/api/import');
    if (body.state === 'done' || body.state === 'failed') return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Previews a zip, then imports it under a name, as the app does, and returns the new space. */
async function imported(who: Member, bytes: Buffer, name: string): Promise<string> {
  const preview = await upload(who, bytes);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const started = await start(who, name, preview.body.hash);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const end = await ended(who);
  assert.equal(end.state, 'done', end.message);
  return end.id;
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
    [['Acme', 0, false, false], ['Brand', 1, false, false], ['Legal', 1, true, false], ['Old site', 1, false, true], ['Website', 1, false, false]],
  );
  assert.deepEqual(preview.body.spaces[0], { name: 'Acme', depth: 0, closed: false, archived: false, pages: 5, sources: 2, tasks: 3 });
  // Rules word for word, saying by name what they refer to in the export, and as written what they refer to outside it,
  // a space at a time, and spaces made at the same moment in any order.
  const bySpace = <T extends { space: string }>(rules: T[]) => [...rules].sort((a, b) => a.space.localeCompare(b.space));
  assert.deepEqual(bySpace(preview.body.rules), bySpace([
    { space: 'Acme', kind: 'requirement', text: 'Write dates as YYYY-MM-DD.', onlyHere: false, private: false },
    { space: 'Acme', kind: 'preference', text: 'Keep status notes under 200 words.', onlyHere: true, private: false },
    { space: 'Acme', kind: 'preference', text: 'Draft in Norwegian first.', onlyHere: false, private: true },
    { space: 'Acme', kind: 'requirement', text: 'Check Gunnar (page “Gunnar Holm”) before writing about the budget.', onlyHere: false, private: false },
    { space: 'Acme', kind: 'preference', text: `Keep my own notes on page:${notes}.`, onlyHere: false, private: true },
    { space: 'Legal', kind: 'requirement', text: 'Contracts go through Ola.', onlyHere: false, private: false },
    { space: 'Brand', kind: 'preference', text: 'Use the green logo.', onlyHere: false, private: false },
  ]));
  assert.deepEqual(preview.body.skills, [{ space: 'Acme', name: 'status-report', private: false }, { space: 'Website', name: 'launch-checklist', private: false }]);
  // What spaces include from each other comes along; the rules of Standards, outside the file, can't.
  assert.deepEqual(preview.body.includes, [
    { space: 'Website', kind: 'rules', from: 'Legal', skill: null, private: false, waiting: false, inFile: true },
    { space: 'Legal', kind: 'skill', from: 'Website', skill: 'launch-checklist', private: false, waiting: false, inFile: true },
    { space: 'Legal', kind: 'rules', from: 'Website', skill: null, private: true, waiting: false, inFile: true },
    { space: 'Website', kind: 'rules', from: 'Brand', skill: null, private: true, waiting: true, inFile: true },
    { space: 'Acme', kind: 'rules', from: 'Standards', skill: null, private: false, waiting: false, inFile: false },
    { space: 'Website', kind: 'rules', from: 'Brand', skill: null, private: false, waiting: false, inFile: true },
  ]);
  // The readable part says so beside the rules.
  const files = unzipSync(before.bytes);
  assert.match(strFromU8(files['guidance/website/AGENTS.md']), /^- The rules of \[Legal\]\(\.\.\/legal\/AGENTS\.md\)\.$/m);
  assert.match(strFromU8(files['guidance/legal/AGENTS.md']), /^- The skill \[launch-checklist\]\(\.\.\/website\/skills\/launch-checklist\/SKILL\.md\), from Website\.$/m);
  assert.match(strFromU8(files['guidance/AGENTS.md']), /^- The rules of Standards, which isn’t in this export\.$/m);
  const spaces = await spacesOf(ana);

  // A space called the same as one she has is refused; another name is a new space at the top.
  const taken = await start(ana, 'Acme', preview.body.hash);
  assert.equal(taken.status, 400);
  assert.equal(taken.body.field, 'name');
  assert.equal(await spacesOf(ana), spaces);
  const copy = await imported(ana, before.bytes, 'Acme, from the old Homing');
  const [root] = await admin`select name, parent_id, private_to, closed from spaces where id = ${copy}`;
  assert.deepEqual({ ...root }, { name: 'Acme, from the old Homing', parentId: null, privateTo: null, closed: false });
  // Only Ana has it and the spaces in it, the closed one too.
  const members = await admin`select distinct person_id from space_access where space_id in (select space_subtree(${copy}))`;
  assert.deepEqual(members.map((row) => row.personId), [ana.id]);
  assert.equal(await spacesOf(ana), spaces + 5);
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

  // Includes come back as guidance, credited to nobody here: those for everyone, and Ana's own.
  const includes = await admin`select private_to, added_by, imported -> 'author' ->> 'name' as by from includes where space_id in (select space_subtree(${copy})) order by added_at`;
  assert.deepEqual(includes.map((row) => [row.privateTo, row.addedBy, row.by]), [[null, null, 'Ana'], [null, null, 'Ana'], [ana.id, null, 'Ana'], [ana.id, null, 'Ana'], [null, null, 'Cara']]);
  // Cara, made an admin of it, can't open Legal: she sees only that Website includes something for everyone, and who added it there.
  const [{ id: websiteHere }] = await admin`select id from spaces where parent_id = ${copy} and name = 'Website'`;
  await as({ ...ana, direct: true }, (s) => addMember(s, copy, cara.id, 'admin'));
  const hidden = (await cara.browser.json(`/api/spaces/${websiteHere}/rules`)).body.includes.filter((include: { spaceId: string | null }) => include.spaceId === null);
  assert.deepEqual(hidden.map((include: { addedBy: string }) => include.addedBy), ['Ana (imported)']);

  // Exported again, it means the same, with new ids.
  const after = await exported(ana, copy);
  assert.ok(before.manifest.includes.some((include) => include.elsewhere?.space === 'Standards'));
  assert.ok(after.manifest.includes.every((include) => include.elsewhere === null));
  sameMeaning(after.manifest, before.manifest);
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
  sameMeaning((await exported(ana, again)).manifest, before.manifest);
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
  // A task a person wrote stays theirs too: Ana's assistant can mark it done, but not reword it.
  const [{ task: venue }] = await admin`select id as task from tasks where space_id = ${copy} and title = 'Book a bigger venue'`;
  const forAna = new Assistant(homing.url, assistants.claude);
  await forAna.connect(ana.browser);
  const anas = await forAna.open();
  assert.match((await anas.call('remember', { space: `space:${copy}`, task: { ref: `task:${venue}`, title: 'Book the town hall' } })).text, /A person wrote this task before it was imported/);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`update tasks set title = 'Rewritten' where id = ${venue}`), refused);
  assert.match((await anas.call('remember', { space: `space:${copy}`, task: { ref: `task:${venue}`, done: true } })).text, /^Done: Book a bigger venue/);
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
    return zip([...bundleFiles(copy), ...files]);
  };
  const refusals: [string, Buffer | Promise<Buffer>, RegExp][] = [
    ['not a zip', Buffer.from('Just some text, not a zip.'), /isn’t a zip/],
    ['no homing.json', zip([['knowledge/index.md', '# Acme\n']]), /no homing\.json/],
    ['a newer format', bundle((m) => Object.assign(m, { version: 3 })), /newer Homing, in version 3/],
    ['an earlier format', zip([['homing.json', JSON.stringify({ ...manifest, version: 1 })]]), /earlier Homing, in version 1 of the format, which this Homing no longer imports/],
    ['another format', bundle((m) => Object.assign(m, { format: 'something-else' })), /isn’t an export from Homing/],
    ['a path out of its skill', bundle((m) => { m.items.find((item) => item.path === 'references/tone.md')!.path = '../../../etc/passwd'; }), /outside its skill/],
    ['a replacement of nothing', bundle((m) => { m.items.find((item) => item.supersedes)!.supersedes = crypto.randomUUID(); }), /replaces something that isn’t on its page/],
    ['a page in a space outside it', bundle((m) => { m.pages[0].space = cara.personalSpaceId; }), /isn’t in the export/],
    ['a circle of replacements', bundle((m) => { const later = m.items.find((item) => item.supersedes)!; m.items.find((item) => item.id === later.supersedes)!.supersedes = later.id; }), /isn’t on its page before it/],
    ['a removal that reaches elsewhere than its rule', bundle((m) => { const removal = m.items.find((item) => item.kind === 'removed')!; removal.reachesDown = !removal.reachesDown; }), /reaches further or less far/],
    ['a wrong type', bundle((m) => Object.assign(m.items[0], { body: 42 })), /changed or damaged/],
    ['a name nobody can see', bundle((m) => { m.spaces[1].name = 'Web\u202esite'; }), /name Homing doesn’t take/],
    ['too much unpacked', zip([['homing.json', ' '.repeat(33 * 1024 * 1024)]]), /larger than Homing imports at once/],
    ['too much unpacked, though it says otherwise', zip([['homing.json', ' '.repeat(33 * 1024 * 1024)]]).then(understated), /larger than Homing imports at once/],
    ['a damaged zip', damaged(), /damaged/],
  ];
  for (const [what, zipped, message] of refusals) {
    const answer = await upload(ana, await zipped);
    assert.equal(answer.status, 400, what);
    assert.match(answer.body.message, message, what);
  }
  // Too big to upload at all, said before any of it arrives.
  const huge = await new Promise<number>((resolve, reject) => {
    const sent = request(new URL('/api/import/preview', homing.url), {
      method: 'POST',
      headers: { origin: homing.url.origin, cookie: ana.browser.cookieHeader(), 'content-type': 'application/zip', 'content-length': String(3 * 1024 * 1024 * 1024) },
    }, (response) => {
      resolve(response.statusCode!);
      sent.destroy();
    });
    sent.on('error', reject);
    sent.flushHeaders();
  });
  assert.equal(huge, 413);
  // Nothing was created by any of them.
  assert.equal(await spacesOf(ana), spaces);
  assert.equal((await admin`select count(*)::int as n from imports`)[0].n, imports);
  // Nobody signed out imports anything.
  const stranger = new Browser(homing.url);
  assert.equal((await stranger.fetch('/api/import?name=Acme', { method: 'POST' })).status, 401);
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

test('an export is held to what Homing keeps, and to rules that hide nothing', async () => {
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
    ['a page type too long', (m) => { m.pages.find((page) => page.type === 'person')!.type = 'x'.repeat(41); }, /pages\.type is longer than Homing keeps/],
    ['a skill name Homing doesn’t take', (m) => { item(m, 'status-report').body = 'Status Report'; }, /name Homing doesn’t take/],
    ['a skill named otherwise in its SKILL.md', (m) => { item(m, 'status-report').body = 'weekly-report'; }, /named differently in its SKILL\.md/],
    ['a skill’s file too large', (m) => { file(m, 'references/tone.md').body = 'x'.repeat(512 * 1024 + 1); }, /longer than Homing keeps/],
    ['an include of the rules of the space above', (m) => { const include = m.includes.find((entry) => entry.rules && entry.visibility === 'shared')!; include.rules = m.spaces.find((space) => space.id === include.space)!.parent; }, /applies there already/],
    ['an include for everyone of rules only the exporter has', (m) => {
      const include = m.includes.find((entry) => entry.rules && entry.visibility === 'private' && !entry.waiting)!;
      include.visibility = 'shared';
      m.spaces.find((space) => space.id === include.rules)!.private = true;
    }, /only the exporter has/],
    ['an include for everyone of a skill only the exporter has', (m) => { for (const title of m.items.filter((entry) => entry.body === 'launch-checklist')) title.visibility = 'private'; }, /only the exporter has/],
    ['an include for everyone that waits', (m) => { m.includes.find((entry) => entry.visibility === 'shared' && entry.rules)!.waiting = true; }, /can’t wait/],
    ['an include of one’s own that waits when nothing is included for everyone', (m) => { m.includes.find((entry) => entry.visibility === 'private' && !entry.waiting)!.waiting = true; }, /waits when it doesn’t/],
    ['an include of one’s own that doesn’t wait though the same is included for everyone', (m) => { m.includes.find((entry) => entry.waiting)!.waiting = false; }, /or the other way round/],
    ['an include of its own space’s rules', (m) => { const include = m.includes.find((entry) => entry.rules)!; include.rules = include.space; }, /applies there already/],
    ['an include of rules not in the export', (m) => { m.includes.find((entry) => entry.rules)!.rules = crypto.randomUUID(); }, /rules that aren’t in the export/],
    ['an include there twice', (m) => { m.includes.push({ ...m.includes.find((entry) => entry.rules)!, id: crypto.randomUUID() }); }, /is there twice/],
    ['an include of two things', (m) => { m.includes.find((entry) => entry.rules)!.skill = m.includes.find((entry) => entry.skill)!.skill; }, /doesn’t include one thing/],
    ['a source cited twice', (m) => { const cites = m.items.find((entry) => entry.sources.length)!; cites.sources = [cites.sources[0], cites.sources[0]]; }, /cites a source twice/],
    ['two files at one place', (m) => { m.items.push({ ...file(m, 'references/tone.md'), id: crypto.randomUUID() }); }, /two files at one place/],
    ['two spaces with one name', (m) => { m.spaces.find((space) => space.name === 'Legal')!.name = 'website'; }, /both called/],
    ['a rule turned around', (m) => { item(m, 'Write dates as YYYY-MM-DD.').body = 'Write dates as \u202eDD-MM-YYYY.'; }, /hide what it says/],
    ['a skill’s file with hidden words', (m) => { file(m, 'SKILL.md').body += '\u{E0049}\u{E0047}\u{E004E}'; }, /hide what it says/],
  ];
  for (const [what, change, message] of refusals) {
    const answer = await upload(ana, await bundle(change));
    assert.equal(answer.status, 400, what);
    assert.match(answer.body.message, message, what);
  }
});

test('names that came in an export are shown plainly, without what hides or turns them around', async () => {
  const { manifest } = await exported(ana, acme);
  const m = structuredClone(manifest);
  const party = m.items.find((entry) => entry.body === 'The launch party is at Bislett.')!;
  const leads = m.items.find((entry) => entry.body === 'Gunnar leads the steering group.')!;
  const asked = m.items.find((entry) => entry.body === 'Gunnar asked for the budget by Friday.')!;
  // Names as people may give them when they sign up, and some no one would.
  m.people.find((person) => person.key === party.author.person)!.name = 'Mohammad\u200cReza\nKarimi';
  m.people.find((person) => person.key === leads.author.person)!.name = 'Ana 🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
  m.exportedBy.name = 'A\u200bna \u202eBerg';
  asked.author.agent = 'Cl\u202eaude\u2066';
  const bytes = await exportOf(m);
  const preview = await upload(ana, bytes);
  assert.equal(preview.body.from.exportedBy, 'Ana Berg');
  const copy = await imported(ana, bytes, 'Acme, names');
  const author = async (body: string) => (await admin`select imported -> 'author' as author from content where space_id = ${copy} and body = ${body}`)[0].author;
  // The joiner Persian needs stays, a line break is a space, and the tags in a flag go.
  assert.equal((await author('The launch party is at Bislett.')).name, 'Mohammad\u200cReza Karimi');
  assert.equal((await author('Gunnar leads the steering group.')).name, 'Ana 🏴');
  assert.equal((await author('Gunnar asked for the budget by Friday.')).agent, 'Claude');
  assert.equal((await admin`select exported_by from imports where space_id = ${copy}`)[0].exportedBy, 'Ana Berg');
});

test('an export that would show too much is refused, and Homing keeps answering meanwhile', async () => {
  const { manifest } = await exported(ana, acme);
  const m = structuredClone(manifest);
  // Thousands of rules that are nothing but references to a page with a long title.
  const rule = m.items.find((entry) => entry.body === 'Write dates as YYYY-MM-DD.')!;
  const gunnar = m.items.find((entry) => entry.kind === 'title' && entry.body === 'Gunnar Holm')!;
  gunnar.body = 'Gunnar Holm '.repeat(16).trim();
  const body = `page:${gunnar.page} `.repeat(95).trim();
  for (let n = 0; n < 5_000; n++) m.items.push({ ...rule, id: crypto.randomUUID(), body });
  const bytes = await exportOf(m);
  assert.ok(bytes.length < 1024 * 1024);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const answer = await upload(ana, bytes);
  delay.disable();
  assert.equal(answer.status, 400);
  assert.match(answer.body.message, /more rules than Homing can show you/);
  assert.ok(delay.max < 100e6, `${Math.round(delay.max / 1e6)} ms`);
  // However else it would grow, what's shown stays under 5 MB.
  const wide = structuredClone(manifest);
  for (let n = 0; n < 60_000; n++) wide.spaces.push({ ...wide.spaces[1], id: crypto.randomUUID(), parent: wide.space, name: `Space ${n}`, archived: null, creator: null, imported: undefined });
  const shown = await upload(ana, await exportOf(wide));
  assert.equal(shown.status, 400);
  assert.match(shown.body.message, /more than Homing can show you/);
});

test('references are found in time in step with the text, whatever it holds', async () => {
  let start = performance.now();
  rewriteReferences('['.repeat(200_000), () => undefined);
  assert.ok(performance.now() - start < 100, `${Math.round(performance.now() - start)} ms`);
  // And in rules, as the preview names what they refer to.
  start = performance.now();
  mentions('['.repeat(200_000));
  assert.ok(performance.now() - start < 100, `${Math.round(performance.now() - start)} ms`);
});

test('an export still on its way holds up nobody else’s', async () => {
  const { bytes } = await exported(ana, acme);
  // Cara starts sending one, and her connection stalls.
  const stalled = request(new URL('/api/import/preview', homing.url), {
    method: 'POST',
    headers: { origin: homing.url.origin, cookie: cara.browser.cookieHeader(), 'content-type': 'application/zip', 'content-length': String(1024 * 1024) },
  });
  stalled.on('error', () => {});
  stalled.write(Buffer.alloc(1024));
  await new Promise((resolve) => setTimeout(resolve, 200));
  // Ana's is read meanwhile, and Cara sends one at a time.
  assert.equal((await upload(ana, bytes)).status, 200);
  assert.equal((await upload(cara, bytes)).status, 429);
  stalled.destroy();
});

test('an earlier version of something private stays private, whatever the export says', async () => {
  const { manifest } = await exported(ana, acme);
  const m = structuredClone(manifest);
  const calls = m.items.find((entry) => entry.body === 'Prefers calls before nine.')!;
  m.revisions.push({ item: calls.id, visibility: 'shared', body: 'Prefers calls before ten.', author: calls.author, writtenAt: calls.createdAt, replacedAt: calls.writtenAt });
  const copy = await imported(ana, await exportOf(m), 'Acme, earlier');
  const [earlier] = await admin`select private_to from revisions where space_id in (select space_subtree(${copy})) and body = 'Prefers calls before ten.'`;
  assert.equal(earlier.privateTo, ana.id);
});

test('an import is of exactly the export that was looked at', async () => {
  const { bytes, manifest } = await exported(ana, acme);
  const preview = await upload(ana, bytes);
  // Another one looked at since, which takes its place.
  const changed = structuredClone(manifest);
  changed.items.find((entry) => entry.body === 'Write dates as YYYY-MM-DD.')!.body = 'Always write dates as DD.MM.YYYY.';
  assert.equal((await upload(ana, await exportOf(changed))).status, 200);
  const spaces = await spacesOf(ana);
  for (const hash of [preview.body.hash, '']) {
    const answer = await start(ana, 'Acme, changed', hash);
    assert.equal(answer.status, 400);
    assert.match(answer.body.message, /isn’t the export you looked at/);
  }
  assert.equal(await spacesOf(ana), spaces);
});

test('an export made to be heavy is refused, and Homing keeps answering meanwhile', async () => {
  // A small zip that unpacks to ten million empty objects.
  const heavy = await zip([['homing.json', `{"pad":[${'{},'.repeat(10_000_000)}{}]}`]]);
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
  return zip(bundleFiles(manifest));
}

/** What Ana's imports put in the store, counted, for checking that one that didn't finish left nothing, whatever other tests do meanwhile. */
async function stored() {
  const [row] = await admin`
    with mine as (select id from imports where imported_by = ${ana.id}),
         spaces as (select s.id from spaces s where s.imported ->> 'import' in (select id::text from mine))
    select (select count(*)::int from spaces) as spaces, (select count(*)::int from mine) as imports,
           (select count(*)::int from pages where space_id in (select id from spaces)) as pages,
           (select count(*)::int from content where space_id in (select id from spaces)) as content,
           (select count(*)::int from sources where space_id in (select id from spaces)) as sources,
           (select count(*)::int from memberships where space_id in (select id from spaces)) as memberships,
           (select count(*)::int from space_access where space_id in (select id from spaces)) as access,
           (select count(*)::int from importing where import_id in (select id from mine)) as importing
  `;
  return { ...row };
}

test('an import that fails late leaves nothing behind, and nothing of it ever shows', async () => {
  const { manifest } = await exported(ana, acme);
  const m = structuredClone(manifest);
  // Twelve thousand more items, read in several batches, the last of which cites a source the export doesn't hold.
  const page = m.items.find((entry) => entry.kind === 'title' && entry.body === 'Launch plan')!.page;
  const model = m.items.find((entry) => entry.page === page && entry.kind === 'text' && entry.visibility === 'shared')!;
  for (let n = 0; n < 12_000; n++) m.items.push({ ...model, id: crypto.randomUUID(), body: `Launch note ${n}.`, supersedes: null, publishedFrom: null, published: null, sources: [], imported: undefined });
  m.items.at(-1)!.sources = [crypto.randomUUID()];
  const before = await stored();
  const preview = await upload(ana, await exportOf(m));
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal((await start(ana, 'Acme, late', preview.body.hash)).status, 202);
  const end = await ended(ana);
  assert.equal(end.state, 'failed');
  assert.match(end.message, /doesn’t hold together/);
  assert.deepEqual(await stored(), before);
});

test('an import that stops on the way is never seen, and is taken out', async () => {
  const now = new Date().toISOString();
  const [top, below, page, item] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const before = await stored();
  // Started and partly written, each part on its own, as Homing does, and then Homing stops.
  const made = await as({ ...ana, direct: true }, async (s) => (await s.tx<{ id: string }[]>`select import_begin(${s.tx.json({
    from: { instance: 'https://elsewhere.test', exportedBy: 'Ana', exportedAt: now, space: crypto.randomUUID() },
    spaces: [{ id: top, name: 'Halfway', parent: null, closed: false, archivedAt: null, imported: {} }, { id: below, name: 'Below', parent: top, closed: false, archivedAt: null, imported: {} }],
  })}) as id`)[0].id);
  await as({ ...ana, direct: true }, (s) => s.tx`select import_load(${made}::uuid, ${s.tx.json({
    pages: [{ id: page, space: top, type: null, createdAt: now, archivedAt: null, imported: {} }],
    items: [
      { id: item, page, space: top, kind: 'title', path: null, body: 'Halfway notes', private: false, supersedes: null, reachesDown: false, publishedFrom: null, publishedAt: null, createdAt: now, writtenAt: now, imported: {} },
      { id: crypto.randomUUID(), page, space: top, kind: 'text', path: null, body: 'Trykkeriet halfway', private: false, supersedes: null, reachesDown: false, publishedFrom: null, publishedAt: null, createdAt: now, writtenAt: now, imported: {} },
    ],
  })})`);
  // Nobody sees any of it: not the person importing, in their lists, counts or search, nor anyone else.
  const listed = (await ana.browser.json('/api/spaces')).body.spaces as { id: string }[];
  assert.ok(!listed.some((space) => space.id === top || space.id === below));
  assert.equal((await ana.browser.json(`/api/spaces/${top}`)).status, 404);
  assert.ok(((await ana.browser.json('/api/search?q=Trykkeriet')).body.pages as { title: string }[]).every((hit) => hit.title !== 'Halfway notes'));
  for (const who of [ana, cara]) {
    const seen = await as(who, (s) => s.tx`
      select (select count(*) from spaces where id in (${top}, ${below}))::int + (select count(*) from content where space_id = ${top})::int
           + (select count(*) from pages where space_id = ${top})::int + (select count(*) from imports where id = ${made})::int as n
    `);
    assert.equal(seen[0].n, 0, who.name);
  }
  // Nor can anything be added to it the usual way.
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`insert into content (page_id, space_id, kind, body) values (${page}, ${top}, 'text', 'Sneaked in')`), refused);
  // Taken out when Homing starts again, once nothing has written to it for a while.
  await admin`update imports set touched_at = now() - interval '1 hour' where id = ${made}`;
  assert.ok((await admin`select imports_discard_stale(interval '10 minutes') as n`)[0].n >= 1);
  assert.deepEqual(await stored(), before);
});

test('a big space comes back whole, a part at a time', async () => {
  // Thousands of pages and tens of thousands of items, sources and earlier versions, in spaces under one, written straight in.
  const parts = await as({ ...ana, direct: true }, async (s) => {
    const top = await createSpace(s, { name: 'Northwind' });
    return [top, await createSpace(s, { name: 'Website', parentId: top }), await createSpace(s, { name: 'Contracts', parentId: top, closed: true })];
  });
  const big = parts[0];
  await admin.begin(async (s) => {
    await s`select set_config('homing.person_id', ${ana.id}, true), set_config('homing.direct', 'true', true)`;
    for (const [at, space] of parts.entries()) {
      await s`
        with made as (
          insert into pages (space_id, type) select ${space}::uuid, case when n % 7 = 0 then 'person' end from generate_series(1, 300) n returning id
        ), named as (
          insert into content (page_id, space_id, kind, body) select id, ${space}::uuid, 'title', 'Page ' || ${at} || '-' || row_number() over () from made returning page_id
        )
        insert into content (page_id, space_id, kind, body, private_to)
        select page_id, ${space}::uuid, 'text', 'Northwind note ' || n || ' on ' || page_id || ': ' || repeat('Gunnar checks the budget. ', 10),
               case when n % 9 = 0 then ${ana.id}::uuid end
        from named, generate_series(1, 30) n
      `;
      await s`insert into sources (space_id, excerpt, reference) select ${space}::uuid, 'Email ' || n || ': ' || repeat('Jon takes over in November. ', 8), 'Email ' || n from generate_series(1, 2000) n`;
      await s`
        insert into citations (content_id, source_id)
        select c.id, src.id from (select id, row_number() over (order by created_at, id) as n from content where space_id = ${space}::uuid and kind = 'text' and private_to is null) c
        join (select id, row_number() over (order by created_at, id) as n from sources where space_id = ${space}::uuid) src on src.n = c.n % 2000 + 1
        where c.n % 3 = 0
      `;
      await s`update content set body = body || ' Checked.' where space_id = ${space}::uuid and kind = 'text' and private_to is null and id in (select id from content where space_id = ${space}::uuid and kind = 'text' order by id limit 1000)`;
      await s`insert into tasks (space_id, title, private_to) select ${space}::uuid, 'Follow up ' || n, case when n % 4 = 0 then ${ana.id}::uuid end from generate_series(1, 200) n`;
    }
  });
  const before = await exported(ana, big);
  // Its long lists come in several files each.
  assert.ok(Object.keys(before.files).filter((path) => path.startsWith('homing/items-')).length >= 2);
  const copy = await imported(ana, before.bytes, 'Northwind, again');
  const after = await exported(ana, copy);
  assert.equal(after.manifest.items.length, before.manifest.items.length);
  sameMeaning(after.manifest, before.manifest);
});

test('the store writes an import only into spaces it makes, and only for a person, directly', async () => {
  const payload = (space: string) => ({
    from: { instance: 'https://elsewhere.test', exportedBy: 'Mallory', exportedAt: new Date().toISOString(), space: crypto.randomUUID() },
    spaces: [{ id: crypto.randomUUID(), name: 'Trojan', parent: null, closed: false, archivedAt: null, imported: {} }],
    pages: [{ id: crypto.randomUUID(), space, type: null, createdAt: new Date().toISOString(), archivedAt: null, imported: {} }],
    items: [], citations: [], sources: [], revisions: [], gathered: [], pageArchives: [], tasks: [],
  });
  // A page in Acme, a space that existed before, through an import: refused, and nothing made.
  await assert.rejects(as({ ...ben, direct: true }, (s) => importInto(s, payload(acme))), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => importInto(s, payload(acme))), refused);
  // An assistant, or anyone not editing directly, doesn't import.
  const own = payload('');
  own.pages = [];
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => importInto(s, own)), refused);
  assert.equal((await admin`select count(*)::int as n from spaces where name = 'Trojan'`)[0].n, 0);

  // An earlier version is of something the import brought, in its space, and private whenever its item is.
  const now = new Date().toISOString();
  const [top, below, page, item] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const history = (revision: { space: string; private: boolean; kind?: string }) => ({
    from: { instance: 'https://elsewhere.test', exportedBy: 'Mallory', exportedAt: now, space: crypto.randomUUID() },
    spaces: [{ id: top, name: 'Earlier', parent: null, closed: false, archivedAt: null, imported: {} }, { id: below, name: 'Below', parent: top, closed: false, archivedAt: null, imported: {} }],
    pages: [{ id: page, space: top, type: null, createdAt: now, archivedAt: null, imported: {} }],
    items: [{ id: item, page, space: top, kind: 'title', path: null, body: 'Mine', private: true, supersedes: null, reachesDown: false, publishedFrom: null, publishedAt: null, createdAt: now, writtenAt: now, imported: {} }],
    revisions: [{ item, kind: 'title', body: 'Before', writtenAt: now, replacedAt: now, imported: {}, ...revision }],
    citations: [], sources: [], gathered: [], pageArchives: [], tasks: [],
  });
  await assert.rejects(as({ ...ana, direct: true }, async (s) => {
    await importInto(s, history({ space: top, private: true }));
    throw new Error('undone');
  }), /undone/);
  // Of something else than it says, refused; claiming to be shared, kept private with its item.
  await assert.rejects(as({ ...ana, direct: true }, (s) => importInto(s, history({ space: top, private: true, kind: 'text' }))), refused);
  const kept = await as({ ...ana, direct: true }, async (s) => {
    const made = await importInto(s, history({ space: below, private: false }));
    return (await s.tx`select private_to, space_id from revisions where space_id in (select space_subtree(${made}))`)[0];
  });
  assert.deepEqual([kept.privateTo, kept.spaceId === below], [ana.id, false]);
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
    // What spaces include from each other in the export: one from outside it can't come back.
    includes: m.includes.filter((include) => include.elsewhere === null).map((include) => ({
      space: path(include.space), visibility: include.visibility, waiting: include.waiting, rules: include.rules && path(include.rules),
      skill: include.skill && pages.get(include.skill), author: by(include.author), addedAt: include.addedAt,
    })),
    tasks: m.tasks.map((task) => ({
      ...task, id: undefined, space: path(task.space), imported: undefined, author: by(task.author), assignee: someone(task.assignee), done: task.done && { at: task.done.at, by: someone(task.done.by) },
    })),
  };
}

/**
 * Whether two exports mean the same: each list holds the same things, whatever order those made in
 * the same millisecond come in, since an export lists those by id. Says where they first differ.
 */
function sameMeaning(actual: Manifest, expected: Manifest) {
  const sorted = (m: Manifest) => Object.entries(meaning(m)).map(([list, entries]) => [list, entries.map((entry) => JSON.stringify(entry)).sort()] as const);
  const [left, right] = [sorted(actual), sorted(expected)];
  for (const [at, [list, entries]] of left.entries()) {
    const other = right[at][1];
    const differs = entries.findIndex((entry, n) => entry !== other[n]);
    assert.ok(differs < 0 && entries.length === other.length, `${list} differ: ${entries[differs]?.slice(0, 500)} where ${other[differs]?.slice(0, 500)} (${entries.length} and ${other.length})`);
  }
}
