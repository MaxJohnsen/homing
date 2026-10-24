// Issue #120, your assistant edits your private text when you ask (spec §3). In a conversation, a
// person's assistant changes what they wrote on their own private side, whole or in part. It stays
// theirs: the item keeps them as its author, its history records which assistant made the change,
// and the earlier version stays, for the person to restore in the app or through their assistant.
// Homing can't tell whether they asked, and allows it only because the change is private, recorded
// and can be undone. Everything else a person wrote stays as it is: what's shared, someone else's,
// or imported, and replacing it as no longer true. A routine never changes any of it.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AccessDenied, authDatabaseUrl } from '../src/db.ts';
import { addSource, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, share, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let anas: Awaited<ReturnType<Assistant['open']>>;

type Version = { text: string; by: { name: string | null; you: boolean } | null; agent: string | null; editAgent?: string | null };
type PageItem = Version & { id: string; shared: boolean; earlier: Version[] };

const refIn = (text: string, kind: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];
const today = () => new Date().toISOString().slice(0, 10);

/** A page someone starts in the app, only theirs unless shared. */
async function newPage(who: Member, title: string, shared = false): Promise<string> {
  const { status, body } = await who.browser.json(`/api/spaces/${acme}/pages`, { title, shared });
  assert.equal(status, 200);
  return body.id;
}

/** What someone writes themselves, in the app. */
async function write(who: Member, page: string, text: string, shared = false): Promise<string> {
  const { status, body } = await who.browser.json(`/api/pages/${page}/items`, { text, shared });
  assert.equal(status, 200);
  return body.id;
}

/** An item as the app shows it to someone, with its earlier versions, oldest first. */
async function itemAs(who: Member, page: string, item: string): Promise<PageItem | undefined> {
  const { body } = await who.browser.json(`/api/pages/${page}`);
  return (body.items as PageItem[] | undefined)?.find((entry) => entry.id === item);
}

/** Who wrote a version, and through which assistant, as the app says it. */
const whoWrote = (version: Version) => [version.by?.name ?? null, version.agent, version.editAgent ?? null];

/** The earlier versions `read` gives of an item, oldest first, exactly as written. */
function earlierIn(read: string): string[] {
  const history = read.split('\n## Earlier versions\n')[1] ?? '';
  return [...history.matchAll(/^- (?:By .+:\n(`{3,})markdown\n([\s\S]*?)\n\1$|(".*"), by .+)$/gm)].map((match) => match[2] ?? JSON.parse(match[3]));
}

const report = `# Nordic market analysis

## Demand
Demand for service booking grew 18% in 2026, most of it in Norway.

## Competitors
Two competitors offer online booking. Neither integrates with dealer systems.

## Recommendation
Launch in Norway first, then Sweden in the autumn.`;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(ana.browser);
  anas = await claude.open();
});

after(() => homing.close());

test('Ana’s assistant changes a paragraph she wrote, as she asks, and it stays hers, with the change in its history', async () => {
  // Ana writes the analysis herself, in the app, on her own side of Acme.
  const page = await newPage(ana, 'Market analysis');
  const item = await write(ana, page, report);
  const read = (await anas.call('read', { ref: `page:${page}` })).text;
  assert.match(read, /What the user wrote themselves stays theirs: change it only when they ask you to, with updates where it is private, and with replaces where it is shared, which makes it their own update until they share it\. What it said before is kept\./);
  assert.ok(read.includes(`- item:${item}, private, written by Ana:\n`), read);

  // In a conversation she asks her assistant to update the competitors, and it changes that paragraph only.
  const edited = report.replace('Neither integrates with dealer systems.', 'Neither integrates with dealer systems, and one of them closes in March.');
  const changed = await anas.call('remember', { updates: `item:${item}`, edits: [{ old: 'Neither integrates with dealer systems.', new: 'Neither integrates with dealer systems, and one of them closes in March.' }] });
  assert.equal(changed.text, `Updated item:${item}. The user wrote it, so it stays theirs, and what it said before is kept in its history, where they can restore it. It's in Acme (space:${acme}), where that item is.`);

  // It's still Ana's, and its history says her assistant changed it, with what it said before.
  const history = (await anas.call('read', { ref: `item:${item}` })).text;
  assert.ok(history.startsWith(`${edited}\n\n`));
  assert.match(history, new RegExp(`Written by Ana, changed by Claude for them on ${today()}\\.`));
  assert.match(history, new RegExp(`## Earlier versions\\n- By Ana, until ${today()}:\\n\`\`\`markdown\\n# Nordic market analysis`));
  assert.deepEqual(earlierIn(history), [report]);
  const shown = (await itemAs(ana, page, item))!;
  assert.deepEqual([shown.text, ...whoWrote(shown)], [edited, 'Ana', null, 'Claude']);
  assert.deepEqual(shown.earlier.map((version) => [version.text, ...whoWrote(version)]), [[report, 'Ana', null, null]]);
  assert.match((await anas.call('read', { ref: `page:${page}` })).text, new RegExp(`- item:${item}, private, written by Ana, changed by Claude for them:\\n`));
  // So do search and context, where they find it.
  const found = new RegExp(`\\(item:${item}, in Acme, private, written by Ana, changed by Claude for them\\)`);
  assert.match((await anas.call('search', { query: 'competitors closes in March' })).text, found);
  assert.match((await anas.call('context', { request: 'Which competitors close in March?', space: `space:${acme}` })).text, found);
  // The store keeps her as its author, and records the assistant on the new version.
  const [row] = await admin`select written_by, agent, edit_agent from content where id = ${item}`;
  assert.deepEqual({ ...row }, { writtenBy: ana.id, agent: null, editAgent: 'Claude' });

  // A whole new text works the same way, and it's still hers.
  const rewritten = report.replace('then Sweden in the autumn', 'then Sweden and Denmark in 2028');
  const whole = await anas.call('remember', { updates: `item:${item}`, text: rewritten });
  assert.ok(!whole.failed, whole.text);
  const again = (await itemAs(ana, page, item))!;
  assert.deepEqual([again.text, ...whoWrote(again)], [rewritten, 'Ana', null, 'Claude']);
  assert.deepEqual(again.earlier.map((version) => [version.text, ...whoWrote(version)]), [[report, 'Ana', null, null], [edited, 'Ana', null, 'Claude']]);

  // Nobody else sees any of it.
  assert.equal((await cara.browser.json(`/api/pages/${page}`)).status, 404);
  assert.equal((await admin`select count(*)::int as n from content where page_id = ${page} and private_to is null`)[0].n, 0);
});

test('Ana restores what she wrote, in the app or through her assistant, and each restore is a change in the history', async () => {
  const page = await newPage(ana, 'Pricing for the renewal');
  const item = await write(ana, page, 'Start at 1,450 a day, and settle at 1,350 at the lowest.');
  await anas.call('remember', { updates: `item:${item}`, edits: [{ old: '1,350', new: '1,300' }] });

  // In the app, Restore puts the version before back, as her own correction.
  assert.equal((await ana.browser.json(`/api/items/${item}`, { text: 'Start at 1,450 a day, and settle at 1,350 at the lowest.', shared: false })).status, 200);
  const restored = (await itemAs(ana, page, item))!;
  assert.deepEqual([restored.text, ...whoWrote(restored)], ['Start at 1,450 a day, and settle at 1,350 at the lowest.', 'Ana', null, null]);
  assert.deepEqual(restored.earlier.map((version) => [version.text, ...whoWrote(version)]), [
    ['Start at 1,450 a day, and settle at 1,350 at the lowest.', 'Ana', null, null],
    ['Start at 1,450 a day, and settle at 1,300 at the lowest.', 'Ana', null, 'Claude'],
  ]);

  // Through her assistant, it undoes its own change by updating the item with the earlier version, exactly as `read` gives it.
  const plan = await newPage(ana, 'Steering group plan');
  const outline = '# Steering group\n\n1. Where we are\n2. Budget\n\n   Keep this to five minutes.\n3. Decisions';
  const planItem = await write(ana, plan, outline);
  await anas.call('remember', { updates: `item:${planItem}`, edits: [{ old: '2. Budget\n\n   Keep this to five minutes.\n', new: '' }] });
  assert.equal((await itemAs(ana, plan, planItem))!.text, '# Steering group\n\n1. Where we are\n3. Decisions');
  const [before] = earlierIn((await anas.call('read', { ref: `item:${planItem}` })).text);
  assert.equal(before, outline);
  const undone = await anas.call('remember', { updates: `item:${planItem}`, text: before });
  assert.ok(!undone.failed, undone.text);
  const back = (await itemAs(ana, plan, planItem))!;
  assert.deepEqual([back.text, ...whoWrote(back)], [outline, 'Ana', null, 'Claude']);
  assert.deepEqual(back.earlier.map((version) => [version.text, ...whoWrote(version)]), [
    [outline, 'Ana', null, null],
    ['# Steering group\n\n1. Where we are\n3. Decisions', 'Ana', null, 'Claude'],
  ]);
});

test('what Ana wrote and shared, her assistant changes only as her own update, which the others see once she shares it', async () => {
  const plan = await newPage(ana, 'Rollout plan', true);
  const golive = await write(ana, plan, 'Go-live is on 15 March.\n\nThe content team signs off a week before.', true);

  // Not where everyone sees it.
  const rewrite = await anas.call('remember', { updates: `item:${golive}`, text: 'Go-live is on 22 March.' });
  assert.deepEqual([rewrite.failed, rewrite.text], [true, "remember can't rewrite shared knowledge. Use replaces to update it in your own view."]);

  // As her own update, which stays hers, with her assistant on it.
  const update = await anas.call('remember', { replaces: `item:${golive}`, edits: [{ old: '15 March', new: '22 March' }] });
  assert.match(update.text, new RegExp(`^Saved as item:\\S+ on your private side\\. For you it replaces item:${golive}, and others in the space still see the earlier version\\.`));
  const mine = refIn(update.text, 'item');
  const forAna = (await itemAs(ana, plan, mine))!;
  assert.deepEqual([forAna.text, forAna.shared, ...whoWrote(forAna)], ['Go-live is on 22 March.\n\nThe content team signs off a week before.', false, 'Ana', null, 'Claude']);
  assert.equal((await itemAs(cara, plan, golive))!.text, 'Go-live is on 15 March.\n\nThe content team signs off a week before.');
  assert.equal(await itemAs(cara, plan, mine), undefined);

  // Once Ana shares it, everyone sees it as hers, changed by her assistant.
  assert.equal((await ana.browser.json(`/api/items/${mine}/publish`, { shown: forAna.text })).status, 200);
  const forCara = (await cara.browser.json(`/api/pages/${plan}`)).body.items as PageItem[];
  assert.deepEqual(forCara.map((item) => [item.text, ...whoWrote(item)]), [['Go-live is on 22 March.\n\nThe content team signs off a week before.', 'Ana', null, 'Claude']]);
});

test('a shared copy keeps the assistant, and nobody else sees what it said before', async () => {
  const caraClaude = new Assistant(homing.url, assistants.claude);
  await caraClaude.connect(cara.browser);
  const caras = await caraClaude.open();
  const page = await newPage(ana, 'Supplier notes', true);
  // One rests on Ana's own source, so it's shared as a copy; the other moves to the shared side as it is.
  const quoted = await as({ ...ana, direct: true }, async (s) => {
    const call = await addSource(s, { spaceId: acme, excerpt: 'Composa can start on 1 December.', reference: 'Ana’s call notes' });
    return (await writeItem(s, { pageId: page, body: 'Composa starts in December.', sources: [call.id] })).id;
  });
  const plain = await write(ana, page, 'Composa has two developers on it.');
  for (const [item, text] of [[quoted, 'Composa starts on 1 December.'], [plain, 'Composa has two developers on it until go-live.']]) {
    assert.ok(!(await anas.call('remember', { updates: `item:${item}`, text })).failed);
  }
  const copy = await share(ana, quoted);
  assert.notEqual(copy, quoted);
  assert.equal(await share(ana, plain), plain);

  for (const item of [copy, plain]) {
    const shown = (await itemAs(cara, page, item))!;
    assert.deepEqual([...whoWrote(shown), shown.earlier.length], ['Ana', null, 'Claude', 0]);
    const read = (await caras.call('read', { ref: `item:${item}` })).text;
    assert.match(read, new RegExp(`Written by Ana, changed by Claude for them on ${today()}\\.`));
    assert.doesNotMatch(read, /Earlier versions|Composa starts in December|two developers on it\./);
  }
  await caras.close();
});

test('what someone else wrote stays theirs, and Ana replaces what she wrote on her own side herself', async () => {
  const space = `space:${acme}`;
  const nothingChanged = 'Save what you found as a new item on the same page, and point out the difference to the user.';
  const plan = await newPage(ana, 'Launch plan', true);

  // What Cara wrote: her own side Ana's assistant can't even see, and what she shared it can't change, even as Ana's own update.
  const caras = await newPage(cara, 'Salary talk');
  const salary = await write(cara, caras, 'Ask for 8%.');
  for (const how of ['updates', 'replaces']) {
    const attempt = await anas.call('remember', { [how]: `item:${salary}`, text: 'Ask for 3%.' });
    assert.deepEqual([attempt.failed, attempt.text], [true, 'There is no item with that reference that you can see.'], how);
  }
  const owner = await write(cara, plan, 'Cara owns the launch.', true);
  for (const how of ['updates', 'replaces']) {
    const takeover = await anas.call('remember', { [how]: `item:${owner}`, text: 'Ana owns the launch.' });
    assert.deepEqual([takeover.failed, takeover.text], [true, `A person wrote that, and it's shared, so agents never change it. ${nothingChanged}`], how);
  }

  // What Ana wrote on her own side, her assistant changes where it is, never replaces as no longer true.
  const notes = await newPage(ana, 'Workshop notes');
  const venue = await write(ana, notes, 'The workshop is at Bislett.');
  const moved = await anas.call('remember', { space, replaces: `item:${venue}`, text: 'The workshop is at Aker Brygge.' });
  assert.deepEqual([moved.failed, moved.text], [true, 'The user wrote that themselves, so only they replace it. If they asked you to change it, use updates instead: it stays theirs, and what it said before is kept.']);

  // None of them changed, for Ana or Cara.
  assert.deepEqual((await itemAs(ana, plan, owner))!.text, 'Cara owns the launch.');
  assert.deepEqual((await itemAs(cara, plan, owner))!.text, 'Cara owns the launch.');
  assert.deepEqual((await itemAs(cara, caras, salary))!.text, 'Ask for 8%.');
  assert.deepEqual([(await itemAs(ana, notes, venue))!.text, (await itemAs(ana, notes, venue))!.earlier.length], ['The workshop is at Bislett.', 0]);
  assert.equal((await admin`select count(*)::int as n from content where supersedes in (${owner}, ${venue})`)[0].n, 0);
});

test('straight against the database, an assistant changes only its person’s own text, and keeps it theirs', async () => {
  const claude = { person: ana.id, agent: 'Claude' };
  const page = await newPage(ana, 'Budget thoughts');
  const own = await write(ana, page, 'The budget is 400,000 NOK.');
  const shared = await newPage(ana, 'Budget', true);
  const sharedText = await write(ana, shared, 'The budget is 2 million NOK.', true);
  const carasShared = await write(cara, shared, 'Finance wants the forecast by Friday.', true);
  const carasOwn = await write(cara, await newPage(cara, 'Cara’s notes'), 'Gunnar may leave in spring.');

  // Ana's own text: changed where it is, and still hers, with the assistant on the new version and her text in the history.
  const [kept] = await as(claude, (s) => s.tx`update content set body = 'The budget is 380,000 NOK.' where id = ${own} returning written_by, agent, edit_agent`);
  assert.deepEqual({ ...kept }, { writtenBy: ana.id, agent: null, editAgent: 'Claude' });
  // Changing it herself makes the next version hers alone again, and the history keeps whose each one was.
  await as({ ...ana, direct: true }, (s) => s.tx`update content set body = 'The budget is 400,000 NOK.' where id = ${own}`);
  assert.deepEqual(
    (await admin`select body, written_by, agent, edit_agent from revisions where content_id = ${own} order by replaced_at`).map((row) => ({ ...row })),
    [
      { body: 'The budget is 400,000 NOK.', writtenBy: ana.id, agent: null, editAgent: null },
      { body: 'The budget is 380,000 NOK.', writtenBy: ana.id, agent: null, editAgent: 'Claude' },
    ],
  );
  assert.deepEqual({ ...(await admin`select written_by, agent, edit_agent from content where id = ${own}`)[0] }, { writtenBy: ana.id, agent: null, editAgent: null });
  // Nobody writes the assistant's name on it themselves.
  await assert.rejects(as(claude, (s) => s.tx`update content set edit_agent = 'Someone else' where id = ${own}`), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`insert into content (space_id, page_id, private_to, body, edit_agent) values (${acme}, ${page}, ${ana.id}, 'Hello', 'Claude')`), refused);

  // What Ana shared: never changed where everyone sees it, only replaced by her own update, which stays hers.
  await assert.rejects(as(claude, (s) => s.tx`update content set body = 'The budget is 3 million NOK.' where id = ${sharedText}`), refused);
  const [update] = await as(claude, (s) => s.tx`
    insert into content (space_id, page_id, private_to, body, supersedes) values (${acme}, ${shared}, ${ana.id}, 'The budget is 3 million NOK.', ${sharedText})
    returning written_by, agent, edit_agent
  `);
  assert.deepEqual({ ...update }, { writtenBy: ana.id, agent: null, editAgent: 'Claude' });

  // Never her private text replaced, though, nor her page's title changed, nor anything anyone else wrote.
  await assert.rejects(as(claude, (s) => s.tx`insert into content (space_id, page_id, private_to, body, supersedes) values (${acme}, ${page}, ${ana.id}, 'The budget is 300,000 NOK.', ${own})`), refused);
  await assert.rejects(as(claude, (s) => s.tx`update content set body = 'Budget, again' where page_id = ${page} and kind = 'title'`), refused);
  await assert.rejects(as(claude, (s) => s.tx`update content set body = 'Finance wants it by Monday.' where id = ${carasShared}`), refused);
  await assert.rejects(as(claude, (s) => s.tx`insert into content (space_id, page_id, private_to, body, supersedes) values (${acme}, ${shared}, ${ana.id}, 'Finance wants it by Monday.', ${carasShared})`), refused);
  assert.equal((await as(claude, (s) => s.tx`update content set body = 'Gunnar stays.' where id = ${carasOwn} returning id`)).length, 0);
  assert.equal((await admin`select body from content where id = ${carasOwn}`)[0].body, 'Gunnar may leave in spring.');

  // A space's routine never changes what a person wrote, with an agent or without, though it keeps its own writing up to date.
  for (const routine of [{ space: acme }, { space: acme, agent: 'Upkeep' }]) {
    await assert.rejects(as(routine, (s) => s.tx`update content set body = 'The budget is 3 million NOK.' where id = ${sharedText}`), refused);
    await assert.rejects(as(routine, (s) => s.tx`insert into content (space_id, page_id, body, supersedes) values (${acme}, ${shared}, 'The budget is 3 million NOK.', ${sharedText})`), refused);
    await assert.rejects(as(routine, (s) => updateItem(s, sharedText, { body: 'The budget is 3 million NOK.' })), AccessDenied);
    await assert.rejects(as(routine, (s) => supersedeItem(s, sharedText, { body: 'The budget is 3 million NOK.' })), AccessDenied);
  }
  const digest = await as({ space: acme }, (s) => writeItem(s, { pageId: shared, body: 'The weekly digest went out.', shared: true }));
  assert.equal((await as({ space: acme }, (s) => updateItem(s, digest.id, { body: 'The weekly digest went out on Friday.' })))?.body, 'The weekly digest went out on Friday.');
  assert.equal((await admin`select body from content where id = ${sharedText}`)[0].body, 'The budget is 2 million NOK.');
});
