// Issue #6, exporting a space (spec §3, guarantee 10). Any member downloads a space from its
// Settings: everything they can see in it and in the spaces below it they can open, with their own
// private side marked, and never anyone else's. The zip holds homing.json for importing it again,
// the knowledge as readable Markdown in the Open Knowledge Format, and the rules and skills beside it.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { parse } from 'yaml';
import { authDatabaseUrl } from '../src/db.ts';
import type { Author, Manifest } from '../src/export.ts';
import { addRule, removeRule } from '../src/guidance.ts';
import { addSource, archivePage, createPage, gather, publishItem, supersedeItem, updateItem, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace, removeMember } from '../src/spaces.ts';
import { addTask, changeTask } from '../src/tasks.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, until, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member, otherCara: Member, dan: Member;
let acme: string, boardId: string, website: string, inBoard: string;
/** A rule and a skill's file that mention things nobody exports, and come out word for word. */
const houseStyle = `Follow item:${randomUUID()} for the house style.`;
const oddSkill = `---\nname: odd\ndescription: Checks odd files.\n---\n\nSee page:${randomUUID()} first.\n`;
/** Everything of Cara's own in Acme, and everything in a closed space Ana isn't in: text, titles and ids. */
const carasOwn: string[] = [];
const board: string[] = [];
/** Ana's own, which Cara never gets. */
const anasOwn: string[] = [];

const skillMd = '---\nname: status-report\ndescription: Writes the weekly status report for the steering group.\n---\n\n# Status report\n\nStart with what changed. Follow [the tone guide](references/tone.md).\n';

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, ben, otherCara, dan] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben'), await member(homing.url, 'Cara'), await member(homing.url, 'Dan')];

  // Ana's side of Acme: knowledge with a source and its history, a collection, links, an archived
  // page, the overview, rules, a skill with a file, tasks, and Website, a space in Acme.
  let gunnar = '', plan = '', launch = '';
  acme = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id, 'admin');
    await addMember(s, acme, otherCara.id);
    await addMember(s, acme, dan.id);
    const email = await addSource(s, { spaceId: acme, excerpt: 'Gunnar: Jon takes over the steering group in November.', reference: 'Email from Gunnar, 3 October', shared: true });
    gunnar = await createPage(s, { spaceId: acme, title: 'Gunnar Holm', type: 'person', shared: true });
    const leads = await writeItem(s, { pageId: gunnar, body: 'Gunnar leads the steering group.', shared: true });
    await supersedeItem(s, leads.id, { body: 'Jon takes over the steering group from Gunnar in November.', sources: [email.id], shared: true });
    const role = await writeItem(s, { pageId: gunnar, body: 'Project manager at Northwind.', shared: true });
    await updateItem(s, role.id, { body: 'Project manager at Northwind since 2024.' });
    const move = await supersedeItem(s, role.id, { body: 'Project manager at Northwind, moving to Oslo in 2027.' });
    const diary = await addSource(s, { spaceId: acme, excerpt: 'Gunnar prefers calls before nine.', reference: 'Ana’s call diary' });
    const calls = await writeItem(s, { pageId: gunnar, body: 'Prefers calls before nine.', sources: [diary.id] });
    const contracts = await writeItem(s, { pageId: gunnar, body: 'Gunnar signs contracts over 1 MNOK.', sources: [diary.id] });
    await publishItem(s, contracts.id, contracts.body);
    plan = await createPage(s, { spaceId: acme, title: 'Launch plan', type: 'project', shared: true });
    await writeItem(s, { pageId: plan, body: `[Gunnar](page:${gunnar}) signs off the launch.`, shared: true });
    launch = await createPage(s, { spaceId: acme, title: 'Launch 2027', shared: true });
    await gather(s, { collectionId: launch, pageId: plan, shared: true });
    await gather(s, { collectionId: launch, pageId: gunnar, shared: true });
    const vendor = await createPage(s, { spaceId: acme, title: 'Old print vendor', shared: true });
    await writeItem(s, { pageId: vendor, body: 'Trykkeriet AS printed the brochures until 2025.', shared: true });
    await archivePage(s, vendor, true);
    const worries = await createPage(s, { spaceId: acme, title: 'My launch worries' });
    const venue = await writeItem(s, { pageId: worries, body: 'The venue may be too small.' });
    await writeOverview(s, { spaceId: acme, text: 'The launch is in November.', shared: true });
    await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Write dates as YYYY-MM-DD.', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Keep status notes under 200 words.', shared: true, onlyHere: true });
    const norwegian = await addRule(s, { spaceId: acme, kind: 'preference', body: 'Draft in Norwegian first.' });
    await addRule(s, { spaceId: acme, kind: 'preference', body: houseStyle, shared: true });
    await removeRule(s, (await addRule(s, { spaceId: acme, kind: 'preference', body: 'Use the old logo.', shared: true })).id);
    await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: skillMd }, { path: 'references/tone.md', body: 'Plain, short sentences.\n' }], shared: true });
    // A skill whose files would land outside its folder on some systems.
    await saveSkill(s, { spaceId: acme, shared: true, files: [{ path: 'SKILL.md', body: oddSkill }, { path: 'refs\\..\\..\\evil.md', body: 'Out!' }, { path: 'C:/evil.md', body: 'Out!' }, { path: 'refs/./evil.md', body: 'Out!' }] });
    // Knowledge that also rests on a source Ana keeps in her personal space, which stays there.
    const notebook = await addSource(s, { spaceId: ana.personalSpaceId, excerpt: 'My own reckoning: the budget is 2 MNOK.', reference: 'Ana’s notebook' });
    await writeItem(s, { pageId: gunnar, body: 'The budget is 2 MNOK.', sources: [notebook.id, email.id], shared: true });
    const groceries = await createPage(s, { spaceId: ana.personalSpaceId, title: 'Groceries' });
    await writeItem(s, { pageId: groceries, body: 'Oat milk and coffee.' });
    // A title written on several lines is kept as one.
    await createPage(s, { spaceId: acme, title: 'Plan\n## 2099-01-01\n---\nmore', shared: true });
    await createPage(s, { spaceId: acme, title: 'Old notes', shared: true });
    await addTask(s, { spaceId: acme, title: 'Send the brief to Gunnar', due: '2026-11-02', assignee: cara.id, shared: true });
    const venueTask = await addTask(s, { spaceId: acme, title: 'Book a bigger venue' });
    const banners = await addTask(s, { spaceId: acme, title: 'Order the banners', shared: true });
    await changeTask(s, banners.id, { done: true });
    website = await createSpace(s, { name: 'Website', parentId: acme });
    const booking = await createPage(s, { spaceId: website, title: 'Booking flow', shared: true });
    await writeItem(s, { pageId: booking, body: 'Jon builds the booking flow.', shared: true });
    await archiveSpace(s, website, true);
    await archiveSpace(s, website, false);
    anasOwn.push('Prefers calls before nine.', 'Ana’s call diary', 'My launch worries', 'The venue may be too small.', 'Draft in Norwegian first.', 'Book a bigger venue', 'moving to Oslo',
      calls.id, contracts.id, diary.id, worries, venue.id, norwegian.id, venueTask.id, move!.id);
    return acme;
  });
  await as({ person: ana.id, agent: 'Claude' }, (s) => writeItem(s, { pageId: gunnar, body: 'Gunnar asked for the budget by Friday.' }));
  anasOwn.push('Gunnar asked for the budget by Friday.', 'Oat milk and coffee.', 'My own reckoning');
  // Another Cara, Dan, who has since left Acme, and Acme's own routine write too.
  await as({ ...otherCara, direct: true }, (s) => writeItem(s, { pageId: plan, body: 'The printer is booked.', shared: true }));
  await as({ ...dan, direct: true }, async (s) => {
    await writeItem(s, { pageId: plan, body: 'Dan drew the logo.', shared: true });
    await removeMember(s, acme, dan.id);
  });
  await as({ space: acme }, (s) => writeItem(s, { pageId: plan, body: 'The weekly digest went out.', shared: true }));
  // A title from before titles were kept on one line.
  await admin`update content set body = ${'Agenda\n## 2099-01-01\n---\ntype: Fake'} where kind = 'title' and body = 'Old notes'`;

  // Cara's own side of Acme, and Board, a closed space in it that Ana isn't in. Two of Cara's shared
  // items point at her own page and at Board's, which are hers and Board's to keep.
  await as({ ...cara, direct: true }, async (s) => {
    const salary = await createPage(s, { spaceId: acme, title: 'Cara’s salary talk' });
    const raise = await writeItem(s, { pageId: salary, body: 'Ask for a raise in December.' });
    const notebook = await addSource(s, { spaceId: acme, excerpt: 'Gunnar may leave Northwind next spring.', reference: 'Cara’s notebook' });
    const tired = await writeItem(s, { pageId: gunnar, body: 'Gunnar seemed tired on the call.', sources: [notebook.id] });
    const practice = await addTask(s, { spaceId: acme, title: 'Practice the salary talk' });
    const spelling = await addRule(s, { spaceId: acme, kind: 'preference', body: 'Use British spelling in Cara’s drafts.' });
    const skill = await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: '---\nname: salary-prep\ndescription: Gets Cara ready for the salary talk.\n---\n\nList three wins.\n' }] });
    await gather(s, { collectionId: launch, pageId: salary });
    const slips = await writeOverview(s, { spaceId: acme, text: 'Cara thinks the launch slips to spring.' });
    await writeItem(s, { pageId: plan, body: `Read [my notes](page:${salary}) before the launch.`, shared: true });
    carasOwn.push('Cara’s salary talk', 'Ask for a raise in December.', 'Gunnar may leave Northwind', 'Cara’s notebook', 'Gunnar seemed tired on the call.', 'Practice the salary talk',
      'Use British spelling', 'salary-prep', 'Gets Cara ready', 'launch slips to spring',
      salary, raise.id, notebook.id, tired.id, practice.id, spelling.id, skill.pageId, slips.id);

    const closed = await createSpace(s, { name: 'Board', parentId: acme, closed: true });
    boardId = closed;
    const merger = await createPage(s, { spaceId: closed, title: 'Merger talks', shared: true });
    const offer = await writeItem(s, { pageId: merger, body: 'Northwind wants to buy Acme.', shared: true });
    const minutes = await addSource(s, { spaceId: closed, excerpt: 'Minutes: the offer values Acme at 40 MNOK.', reference: 'Board minutes, 1 October', shared: true });
    const valuation = await addTask(s, { spaceId: closed, title: 'Value the company', shared: true });
    const quiet = await addRule(s, { spaceId: closed, kind: 'requirement', body: 'Keep the offer within the board.', shared: true });
    await writeItem(s, { pageId: plan, body: `The [board’s view](page:${merger}) decides the date.`, shared: true });
    // Minutes, a space in Board that Ana is in, though she can't open Board.
    inBoard = await createSpace(s, { name: 'Minutes', parentId: closed });
    await addMember(s, inBoard, ana.id);
    const agenda = await createPage(s, { spaceId: inBoard, title: 'Next meeting', shared: true });
    await writeItem(s, { pageId: agenda, body: 'The board meets on Thursday.', shared: true });
    board.push('Board', 'Merger talks', 'Northwind wants to buy Acme', '40 MNOK', 'Board minutes', 'Value the company', 'Keep the offer within the board',
      closed, merger, offer.id, minutes.id, valuation.id, quiet.id);

    // Two of Cara's shared items rest on sources Ana can't see: her own, and Board's.
    await writeItem(s, { pageId: plan, body: 'The caterer is booked.', sources: [notebook.id], shared: true });
    await writeItem(s, { pageId: plan, body: 'The board signed off the budget.', sources: [minutes.id], shared: true });
  });

  // Two pages Cara kept to herself in January, one archived and reopened, one archived still, before
  // she shared from them in October.
  const cara_ = { ...cara, direct: true as const };
  const [venues, old] = await as(cara_, async (s) => {
    const venues = await createPage(s, { spaceId: acme, title: 'Venue ideas' });
    const old = await createPage(s, { spaceId: acme, title: 'Old venues' });
    return [
      { page: venues, item: await writeItem(s, { pageId: venues, body: 'Bislett has a hall for 300.' }) },
      { page: old, item: await writeItem(s, { pageId: old, body: 'The old hall closed in 2024.' }) },
    ];
  });
  await as(cara_, (s) => archivePage(s, venues.page, true));
  await as(cara_, (s) => archivePage(s, venues.page, false));
  await as(cara_, (s) => archivePage(s, old.page, true));
  const pages = [venues.page, old.page];
  assert.equal((await admin`update content set created_at = '2026-01-05T09:00:00Z', updated_at = '2026-01-05T09:00:00Z' where page_id in ${admin(pages)}`).count, 4);
  assert.equal((await admin`update pages set created_at = '2026-01-05T09:00:00Z', archived_at = case when archived_at is null then null else '2026-01-10T09:00:00Z'::timestamptz end where id in ${admin(pages)}`).count, 2);
  assert.equal((await admin`update page_archives set at = case when archived then '2026-01-10T09:00:00Z'::timestamptz else '2026-01-12T09:00:00Z'::timestamptz end where page_id in ${admin(pages)}`).count, 3);
  await as(cara_, (s) => publishItem(s, venues.item.id, venues.item.body));
  await as(cara_, (s) => publishItem(s, old.item.id, old.item.body));
});

after(() => homing.close());

/** Ana's assistant, connected once. */
let claude: Awaited<ReturnType<Assistant['open']>> | undefined;
async function anasClaude() {
  if (!claude) {
    const assistant = new Assistant(homing.url, assistants.claude);
    await assistant.connect(ana.browser);
    claude = await assistant.open();
  }
  return claude;
}

/** Downloads a space's export as the person, and unpacks it. */
async function download(who: Member, spaceId: string) {
  const response = await who.browser.fetch(`/api/spaces/${spaceId}/export`);
  const zip = new Uint8Array(await response.arrayBuffer());
  const files = response.status === 200 ? new Map(Object.entries(unzipSync(zip)).map(([path, bytes]) => [path, strFromU8(bytes)])) : new Map<string, string>();
  return { response, zip, files, manifest: (files.has('homing.json') ? JSON.parse(files.get('homing.json')!) : undefined) as Manifest };
}

test('a member downloads everything they see in a space, readable and ready to import', async () => {
  const { response, files, manifest } = await download(ana, acme);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition')!, /^attachment; filename="acme-\d{4}-\d{2}-\d{2}\.zip"$/);

  // The manifest says what it is, where it came from, and who exported it, by name.
  assert.equal(manifest.format, 'homing-export');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.instance, homing.url.origin);
  assert.equal(manifest.exportedBy.name, 'Ana');
  assert.deepEqual(manifest.spaces.map((space) => [space.name, space.parent && 'in Acme', space.folder]), [['Acme', null, ''], ['Website', 'in Acme', 'website']]);
  // Who created each space, and when Ana archived and reopened one.
  assert.deepEqual(manifest.spaces[0].creator, { by: 'person', person: manifest.exportedBy.person, agent: null });
  assert.deepEqual(manifest.spaceArchives.map((archive) => [archive.space, archive.archived, archive.author.person]), [[website, true, manifest.exportedBy.person], [website, false, manifest.exportedBy.person]]);

  // Exactly what Ana can see in Acme and Website: everything shared there, and her own.
  const visibleToAna = async (table: string) =>
    (await admin.unsafe(`select id from ${table} where space_id in (select space_subtree($1)) and space_id not in (select space_subtree($2)) and (private_to is null or private_to = $3) order by id`, [acme, boardId, ana.id])).map((row) => row.id);
  const ids = (things: { id: string }[]) => things.map((thing) => thing.id).sort();
  assert.deepEqual(ids(manifest.items), await visibleToAna('content'));
  assert.deepEqual(ids(manifest.sources), await visibleToAna('sources'));
  assert.deepEqual(ids(manifest.tasks), await visibleToAna('tasks'));

  // Each item keeps its kind, side, author, sources and history.
  const item = (body: string) => manifest.items.find((candidate) => candidate.body === body)!;
  const ana_ = manifest.exportedBy.person;
  assert.equal(item('Prefers calls before nine.').visibility, 'private');
  assert.deepEqual(item('Gunnar asked for the budget by Friday.').author, { by: 'agent', person: ana_, agent: 'Claude' });
  assert.deepEqual(item('Gunnar leads the steering group.').author, { by: 'person', person: ana_, agent: null });
  assert.equal(item('Jon takes over the steering group from Gunnar in November.').supersedes, item('Gunnar leads the steering group.').id);
  assert.deepEqual(item('Jon takes over the steering group from Gunnar in November.').sources, [manifest.sources.find((source) => source.reference === 'Email from Gunnar, 3 October')!.id]);
  assert.deepEqual(manifest.revisions.filter((revision) => revision.item === item('Project manager at Northwind since 2024.').id).map((revision) => revision.body), ['Project manager at Northwind.']);
  const copy = manifest.items.find((candidate) => candidate.body === 'Gunnar signs contracts over 1 MNOK.' && candidate.visibility === 'shared')!;
  assert.equal(copy.publishedFrom, manifest.items.find((candidate) => candidate.body === copy.body && candidate.visibility === 'private')!.id);
  assert.equal(copy.published?.by, ana_);

  // Rules, a skill's files, links, a collection, an archived page and tasks.
  assert.deepEqual(manifest.items.filter((rule) => rule.kind === 'requirement' || rule.kind === 'preference').map((rule) => [rule.body, rule.kind, rule.onlyHere, rule.visibility]), [
    ['Write dates as YYYY-MM-DD.', 'requirement', false, 'shared'],
    ['Keep status notes under 200 words.', 'preference', true, 'shared'],
    ['Draft in Norwegian first.', 'preference', false, 'private'],
    [houseStyle, 'preference', false, 'shared'],
    ['Use the old logo.', 'preference', false, 'shared'],
  ]);
  // A removal reaches as far as what it removed, so spaces below see the rule is gone.
  const removal = manifest.items.find((candidate) => candidate.kind === 'removed')!;
  assert.deepEqual([removal.supersedes, removal.reachesDown], [item('Use the old logo.').id, true]);
  assert.deepEqual(manifest.items.filter((file) => file.kind === 'file').map((file) => file.path).slice(0, 2), ['SKILL.md', 'references/tone.md']);
  const page = (title: string) => manifest.items.find((candidate) => candidate.kind === 'title' && candidate.body === title)!.page;
  assert.deepEqual(manifest.links.map((link) => [link.from, link.to]), [[page('Launch plan'), page('Gunnar Holm')]]);
  assert.deepEqual(manifest.gathered.map((gathering) => [gathering.collection, gathering.page, gathering.visibility]), [
    [page('Launch 2027'), page('Launch plan'), 'shared'],
    [page('Launch 2027'), page('Gunnar Holm'), 'shared'],
  ]);
  assert.equal(manifest.pages.find((candidate) => candidate.id === page('Old print vendor'))!.archived?.by, ana_);
  assert.deepEqual(manifest.pageArchives.map((archive) => [archive.page, archive.archived]), [[page('Old print vendor'), true]]);
  assert.deepEqual(manifest.pages.find((candidate) => candidate.id === page('Gunnar Holm'))!.type, 'person');
  const nameOf = (key: string | null) => manifest.people.find((person) => person.key === key)?.name ?? null;
  assert.deepEqual(manifest.tasks.map((task) => [task.title, task.visibility, task.due, nameOf(task.assignee), Boolean(task.done)]), [
    ['Send the brief to Gunnar', 'shared', '2026-11-02', 'Cara', false],
    ['Book a bigger venue', 'private', null, null, false],
    ['Order the banners', 'shared', null, null, true],
  ]);

  // The knowledge reads as Markdown, one file per page, with sources as footnotes and Ana's own marked.
  const gunnar = files.get('knowledge/gunnar-holm.md')!;
  const email = manifest.sources.find((source) => source.reference === 'Email from Gunnar, 3 October')!.id;
  const front = parse(gunnar.split('---\n')[1]);
  assert.equal(front.type, 'person');
  assert.equal(front.homing.id, page('Gunnar Holm'));
  assert.deepEqual(front.sources.find((source: { id: string }) => source.id === email), { id: email, resource: `/sources/${email}.md`, title: 'Email from Gunnar, 3 October' });
  assert.match(gunnar, new RegExp(`Jon takes over the steering group from Gunnar in November\\.\\[\\^${email}\\]`));
  assert.match(gunnar, /_Private to Ana\._\n\nPrefers calls before nine\./);
  assert.match(gunnar, /## Earlier[\s\S]*_Replaced on \d{4}-\d{2}-\d{2}\._\n\nGunnar leads the steering group\./);
  assert.match(gunnar, /_Private to Ana\. Everyone else still sees the earlier version\._\n\nProject manager at Northwind, moving to Oslo in 2027\./);
  assert.match(gunnar, /_Replaced on \d{4}-\d{2}-\d{2}, for Ana only\. Everyone else still sees it\._\n\nProject manager at Northwind since 2024\./);
  assert.match(files.get(`knowledge/sources/${email}.md`)!, /^---\ntype: Source\n[\s\S]*> Gunnar: Jon takes over the steering group in November\.[\s\S]*Used on \[Gunnar Holm\]\(\/gunnar-holm\.md\)/);
  assert.match(files.get('knowledge/launch-plan.md')!, /\[Gunnar\]\(\/gunnar-holm\.md\) signs off the launch\./);
  assert.match(files.get('knowledge/launch-2027.md')!, /## In this collection\n\n- \[Launch plan\]\(\/launch-plan\.md\)\n- \[Gunnar Holm\]\(\/gunnar-holm\.md\)/);
  assert.match(files.get('knowledge/old-print-vendor.md')!, /status: deprecated[\s\S]*_Archived on \d{4}-\d{2}-\d{2} by Ana: no longer active\._/);
  assert.match(files.get('knowledge/my-launch-worries.md')!, /_Private to Ana: nobody else sees this page\._/);
  assert.match(files.get('knowledge/overview.md')!, /The launch is in November\./);
  assert.match(files.get('knowledge/tasks.md')!, /- \[ \] Send the brief to Gunnar \(due 2026-11-02, for Cara\)[\s\S]*- \[ \] Book a bigger venue \(private to Ana\)[\s\S]*## Done\n\n- \[x\] Order the banners \(done on/);
  assert.match(files.get('knowledge/website/booking-flow.md')!, /Jon builds the booking flow\./);
  assert.match(files.get('knowledge/index.md')!, /^---\nokf_version: "0\.2"\n---\n[\s\S]*\* \[Gunnar Holm\]\(gunnar-holm\.md\) - person[\s\S]*\* \[Website\]\(website\/\) - 1 page/);

  // Rules and skills sit beside the knowledge, as AGENTS.md and SKILL.md folders, the way they went in.
  const agents = files.get('guidance/AGENTS.md')!;
  assert.match(agents, /## Requirements\n\n- Write dates as YYYY-MM-DD\.\n/);
  assert.match(agents, /## Preferences\n\n- Keep status notes under 200 words\. \(Only here\.\)\n/);
  assert.match(agents, /- Draft in Norwegian first\. \(Private to Ana\.\)\n/);
  assert.match(agents, /- \[status-report\]\(skills\/status-report\/SKILL\.md\): Writes the weekly status report for the steering group\./);
  assert.equal(files.get('guidance/skills/status-report/SKILL.md'), skillMd);
  assert.equal(files.get('guidance/skills/status-report/references/tone.md'), 'Plain, short sentences.\n');
});

test('the knowledge part of an export conforms to the Open Knowledge Format', async () => {
  for (const who of [ana, cara]) {
    const { files } = await download(who, acme);
    assert.deepEqual(okfProblems(files), [], `${who.name}’s export`);
    assert.ok([...files.keys()].some((path) => path.startsWith('knowledge/sources/')));
    // A title on several lines, from before they were kept on one, doesn't make a day or end anything early.
    assert.ok(![...files.values()].some((text) => text.includes('\n## 2099-01-01')), who.name);
  }
  const [{ body }] = await admin`select body from content where kind = 'title' and body like 'Plan%'`;
  assert.equal(body, 'Plan ## 2099-01-01 --- more');
});

test('an export never holds anyone else’s private side, or a closed space the exporter isn’t in', async () => {
  const { zip, files, manifest } = await download(ana, acme);
  // Every file, byte for byte, and every name in the zip.
  for (const secret of [...carasOwn, ...board]) {
    for (const [path, text] of files) {
      assert.ok(!path.includes(secret) && !text.includes(secret), `${path} holds “${secret}”`);
    }
  }
  assert.ok(!manifest.spaces.some((space) => space.name === 'Board'));
  // Cara's shared items keep their words, without pointing at what's hers or Board's.
  assert.ok(manifest.items.some((item) => item.body === 'Read my notes before the launch.'));
  assert.ok(manifest.items.some((item) => item.body === 'The board’s view decides the date.'));
  assert.ok(zip.length > 0);

  // Cara's pages carry the dates of what she wrote on them, which she shared, but not what she did
  // with them while they were hers alone: archiving, reopening, or who archived the one still archived.
  const page = (title: string) => manifest.pages.find((candidate) => candidate.id === manifest.items.find((item) => item.body === title)!.page)!;
  const [venues, old] = [page('Venue ideas'), page('Old venues')];
  assert.equal(venues.createdAt, '2026-01-05T09:00:00.000Z');
  assert.ok(!manifest.pageArchives.some((archive) => archive.page === venues.id || archive.page === old.id));
  assert.equal(old.archived?.by, null);
  assert.ok(old.archived!.at > '2026-10-01', old.archived!.at);
  for (const [path, text] of files) {
    for (const day of ['2026-01-10', '2026-01-12']) assert.ok(!text.includes(day), `${path} tells of ${day}`);
  }
  assert.doesNotMatch(files.get('knowledge/old-venues.md')!, /Archived on 2026-01|by Cara/);
});

test('each member’s export is their own view of the space', async () => {
  const { files, manifest } = await download(cara, acme);
  assert.equal(manifest.exportedBy.name, 'Cara');
  assert.deepEqual(manifest.spaces.map((space) => space.name), ['Acme', 'Website', 'Board', 'Minutes']);
  assert.match(files.get('knowledge/gunnar-holm.md')!, /_Private to Cara\._\n\nGunnar seemed tired on the call\./);
  assert.match(files.get('knowledge/board/merger-talks.md')!, /Northwind wants to buy Acme\./);
  // Ana's shared copy comes without the private item it was shared from.
  const copy = manifest.items.find((item) => item.body === 'Gunnar signs contracts over 1 MNOK.')!;
  assert.equal(copy.visibility, 'shared');
  assert.equal(copy.publishedFrom, null);
  for (const secret of anasOwn) {
    for (const [path, text] of files) assert.ok(!text.includes(secret), `${path} holds “${secret}”`);
  }
});

test('who did what is told apart, by person, agent or routine, without accounts', async () => {
  const { files, manifest } = await download(ana, acme);
  const author = (body: string): Author => manifest.items.find((item) => item.body === body)!.author;
  const nameOf = (key: string | null) => manifest.people.find((person) => person.key === key)?.name;
  // Two people called Cara stay two people.
  const [first, second] = [author('Read my notes before the launch.'), author('The printer is booked.')];
  assert.deepEqual([nameOf(first.person), nameOf(second.person)], ['Cara', 'Cara']);
  assert.notEqual(first.person, second.person);
  // Dan has left, so he's unnamed, but still a person, and not Acme's routine.
  const left = author('Dan drew the logo.');
  assert.deepEqual([left.by, nameOf(left.person)], ['person', null]);
  assert.deepEqual(author('The weekly digest went out.'), { by: 'routine', person: null, agent: null });
  // People are keys and names, never accounts or emails.
  for (const person of manifest.people) assert.match(person.key, /^person-\d+$/);
  for (const who of [ana, cara, otherCara, dan]) {
    for (const [path, text] of files) assert.ok(!text.includes(who.id) && !text.includes(who.email), `${path} names ${who.name}’s account`);
  }
});

test('what an item rests on outside the export is noted, never brought along', async () => {
  const { files, manifest } = await download(ana, acme);
  const budget = manifest.items.find((item) => item.body === 'The budget is 2 MNOK.')!;
  assert.equal(budget.sourcesElsewhere, 1);
  assert.deepEqual(budget.sources.map((id) => manifest.sources.find((source) => source.id === id)!.reference), ['Email from Gunnar, 3 October']);
  assert.match(files.get('knowledge/gunnar-holm.md')!, /The budget is 2 MNOK\.\[\^[0-9a-f-]+\]\n\n_Also rests on 1 source not in this export\._/);
  for (const [path, text] of files) assert.ok(!text.includes('My own reckoning') && !text.includes('Ana’s notebook'), path);
  // What rests on sources Ana can't see at all, Cara's own or Board's, isn't counted, even as a number.
  for (const body of ['The caterer is booked.', 'The board signed off the budget.']) {
    const item = manifest.items.find((candidate) => candidate.body === body)!;
    assert.deepEqual([item.sources, item.sourcesElsewhere], [[], 0], body);
  }
  assert.doesNotMatch(files.get('knowledge/launch-plan.md')!, /Also rests on/);
});

test('a skill’s files stay in its folder, and guidance comes out word for word', async () => {
  const { files, manifest } = await download(ana, acme);
  // Every file in the zip is where it says, on any system.
  for (const path of files.keys()) assert.doesNotMatch(path, /\\|:|(^|\/)\.{1,2}(\/|$)/, path);
  assert.deepEqual([...files.keys()].filter((path) => path.startsWith('guidance/skills/odd/')), ['guidance/skills/odd/SKILL.md']);
  // Homing still holds them all, and the bundle says so.
  assert.deepEqual(manifest.items.filter((item) => item.kind === 'file' && item.body === 'Out!').map((item) => item.path).sort(), ['C:/evil.md', 'refs/./evil.md', 'refs\\..\\..\\evil.md']);
  // A rule and a skill keep their words, references and all.
  assert.equal(files.get('guidance/skills/odd/SKILL.md'), oddSkill);
  assert.ok(manifest.items.some((item) => item.body === houseStyle));
  assert.ok(files.get('guidance/AGENTS.md')!.includes(houseStyle));
});

test('a space below another, one below a closed space, and the personal space export only what they hold', async () => {
  // Website alone: nothing of Acme above it.
  const below = await download(ana, website);
  assert.deepEqual(below.manifest.spaces.map((space) => [space.name, space.parent]), [['Website', null]]);
  for (const [path, text] of below.files) assert.ok(!text.includes(acme) && !text.includes('Gunnar'), path);
  // Minutes, in Board, which Ana can't open: nothing of Board, and Acme's export doesn't reach Minutes.
  const inClosed = await download(ana, inBoard);
  assert.deepEqual(inClosed.manifest.spaces.map((space) => [space.name, space.parent]), [['Minutes', null]]);
  assert.ok(inClosed.manifest.items.some((item) => item.body === 'The board meets on Thursday.'));
  for (const [path, text] of inClosed.files) for (const secret of [boardId, 'Merger talks', 'Northwind wants to buy Acme', acme]) assert.ok(!text.includes(secret), `${path} holds ${secret}`);
  for (const [path, text] of (await download(ana, acme)).files) assert.ok(!text.includes('Next meeting') && !text.includes(inBoard), path);
  // The personal space: everything private, and nothing from Acme.
  const own = await download(ana, ana.personalSpaceId);
  assert.equal(own.manifest.spaces[0].private, true);
  assert.deepEqual(own.manifest.items.filter((item) => item.kind === 'text').map((item) => [item.body, item.visibility]), [['Oat milk and coffee.', 'private']]);
  assert.deepEqual(own.manifest.sources.map((source) => source.reference), ['Ana’s notebook']);
  for (const [path, text] of own.files) assert.ok(!text.includes(acme) && !text.includes('Gunnar leads'), path);
});

test('a person makes one export at a time, until it has been sent', async () => {
  // A space too big to send at once: what doesn't compress, megabytes of it.
  const scans = await as({ ...ana, direct: true }, async (s) => {
    const scans = await createSpace(s, { name: 'Scans' });
    for (let n = 0; n < 8; n++) await addSource(s, { spaceId: scans, excerpt: randomBytes(400_000).toString('base64'), reference: `Scan ${n}`, shared: true });
    return scans;
  });
  const first = await ana.browser.fetch(`/api/spaces/${scans}/export`);
  assert.equal(first.status, 200);
  // Made, but not yet taken: the next one waits.
  const second = await ana.browser.fetch(`/api/spaces/${scans}/export`);
  assert.equal(second.status, 429);
  assert.match((await second.json()).message, /another export right now/);
  await first.arrayBuffer();
  await until(async () => {
    const again = await ana.browser.fetch(`/api/spaces/${acme}/export`);
    await again.arrayBuffer();
    return again.status === 200;
  });
});

test('a title written with extra spaces or on several lines names the same page', async () => {
  const claude = await anasClaude();
  await claude.call('remember', { space: `space:${acme}`, page: 'Jon  Dahl', text: 'Jon builds the booking flow.' });
  await claude.call('remember', { space: `space:${acme}`, page: 'jon\n dahl', text: 'Jon works from Bergen.' });
  const pages = await admin`select distinct page_id, body from content where space_id = ${acme} and kind = 'title' and lower(body) like 'jon%dahl'`;
  assert.deepEqual(pages.map((row) => row.body), ['Jon Dahl']);
});

test('only someone who can open a space exports it, and an assistant gives them the link', async () => {
  assert.equal((await download(ben, acme)).response.status, 404);
  assert.equal((await download(ana, boardId)).response.status, 404, 'a closed space Ana isn’t in');
  const claude = await anasClaude();
  const answer = (await claude.call('act', { action: 'space.export', input: { space: `space:${acme}` } })).text;
  assert.ok(answer.includes(`/spaces/${acme}/settings`) && answer.includes(`/api/spaces/${acme}/export`), answer);
  assert.match((await claude.call('act', { action: 'space.export', input: { space: `space:${boardId}` } })).text, /no space with that reference/);
  await ben.browser.signOut();
  assert.equal((await download(ben, acme)).response.status, 401);
});

/**
 * What keeps the knowledge part of a bundle from conforming to OKF v0.2 (§11): every concept has
 * frontmatter with a type, an index has none except okf_version at the top, and a log lists days
 * newest first. Also what Homing promises on top: actors as OKF names them, footnotes keyed by the
 * sources a concept lists, and links and sources that lead somewhere in the bundle.
 */
function okfProblems(files: Map<string, string>): string[] {
  const problems: string[] = [];
  const bundle = new Map([...files].filter(([path]) => path.startsWith('knowledge/')).map(([path, text]) => [path.slice('knowledge/'.length), text]));
  const exists = (target: string) => bundle.has(target.replace(/^\//, '')) || [...bundle.keys()].some((path) => path.startsWith(target.replace(/^\//, '')) && target.endsWith('/'));
  for (const [path, text] of bundle) {
    if (!path.endsWith('.md')) continue;
    const name = path.split('/').at(-1);
    // As OKF's reference parser reads it: the first line after the opening one that is --- ends the frontmatter.
    const lines = text.split('\n');
    const close = lines[0] === '---' ? lines.findIndex((line, at) => at > 0 && line.trim() === '---') : -1;
    const head = close > 0 ? [lines.slice(0, close + 1).join('\n'), lines.slice(1, close).join('\n')] : null;
    const body = head ? lines.slice(close + 1).join('\n') : text;
    if (name === 'index.md') {
      if (head && (path !== 'index.md' || JSON.stringify(parse(head[1])) !== JSON.stringify({ okf_version: '0.2' }))) problems.push(`${path}: frontmatter in an index`);
      if (path === 'index.md' && !head) problems.push('index.md: no okf_version');
      for (const line of body.split('\n')) {
        if (line && !/^#{1,6} \S/.test(line) && !/^\* \[[^\]]+\]\([^)\s]+\)( - .+)?$/.test(line)) problems.push(`${path}: not an index entry: ${line}`);
      }
    } else if (name === 'log.md') {
      if (head) problems.push(`${path}: frontmatter in a log`);
      const days = [...body.matchAll(/^## (.*)$/gm)].map((match) => match[1]);
      if (!days.length || days.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) problems.push(`${path}: days aren't YYYY-MM-DD`);
      if (days.some((date, at) => at > 0 && date >= days[at - 1])) problems.push(`${path}: days aren't newest first`);
      for (const line of body.split('\n')) {
        if (line && !/^# \S/.test(line) && !/^## /.test(line) && !/^\* \S/.test(line)) problems.push(`${path}: not a log entry: ${line}`);
      }
    } else {
      let front: Record<string, any> | undefined;
      try {
        front = head ? parse(head[1]) : undefined;
      } catch {
        problems.push(`${path}: frontmatter isn't YAML`);
      }
      if (!front || typeof front !== 'object') problems.push(`${path}: no frontmatter`);
      else {
        if (typeof front.type !== 'string' || !front.type.trim()) problems.push(`${path}: no type`);
        if (front.generated && !/^(human:.+|process:homing|[a-z0-9-]+\/homing)$/.test(front.generated.by)) problems.push(`${path}: generated.by isn't an actor`);
        if (typeof front.title === 'string' && front.title.includes('\n')) problems.push(`${path}: title on several lines`);
        const listed = new Set((front.sources ?? []).map((source: { id: string }) => source.id));
        for (const source of front.sources ?? []) if (!exists(source.resource)) problems.push(`${path}: source ${source.resource} isn't in the bundle`);
        for (const [, label] of body.matchAll(/\[\^([^\]]+)\](?!:)/g)) if (!listed.has(label)) problems.push(`${path}: footnote ${label} isn't one of its sources`);
      }
    }
    for (const [, target] of body.matchAll(/\]\((\/[^)\s]*)\)/g)) if (!exists(target)) problems.push(`${path}: ${target} isn't in the bundle`);
  }
  return problems;
}
