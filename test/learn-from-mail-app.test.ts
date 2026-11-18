// Issue #151: what an assistant that learns from a mailbox needs of Homing (spec §2, §3, §10).
// Ana connected her work mailbox in Minus 1, only for her. Cara is her colleague in Minus 1 and
// Acme, and Ben works for Beta. Homing gives the assistant of someone with a mailbox its own skill
// for learning from one, unless they have a skill of that name; what rests on an email Homing read
// says so to everyone who sees it, however often it's rewritten, corrected or shared, and by whom;
// a search keeps to what is known when asked; and a page wholly Ana's own moves to the space it
// belongs in, seen by nobody else before or after, while what she was shown for sharing in the
// space it left is shared nowhere. Microsoft is a stand-in.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { setModelProcessing } from '../src/model.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, changeMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, share, type Member } from './helpers.ts';
import { MicrosoftStandIn, type Account } from './microsoft.ts';
import { inTestDatabase } from './reset.ts';

let microsoft: MicrosoftStandIn;
let homing: Homing;
let n = 0;

before(async () => {
  microsoft = await new MicrosoftStandIn().start();
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), microsoft: microsoft.settings(), ...testAssistants });
});

after(async () => {
  await homing.close();
  await microsoft.close();
});

type Session = Awaited<ReturnType<Assistant['open']>>;

/** Someone connects their work mailbox in a space, all the way through Microsoft's page. Returns the place's id. */
async function connect(who: Member, space: string): Promise<{ account: Account; place: string }> {
  const account: Account = { tenant: '7d2b1c9e-0000-4000-8000-0000000ac3e0', oid: crypto.randomUUID(), address: `${who.name.toLowerCase()}.${++n}@minus1.test`, name: `${who.name} Berg` };
  const started = await who.browser.json(`/api/spaces/${space}/connections/microsoft`, {});
  const callback = new URL(microsoft.signIn(started.body.url as string, account));
  await who.browser.fetch(callback.pathname + callback.search);
  const [{ place }] = await admin<{ place: string }[]>`
    select p.id as place from places p join connections c on c.id = p.connection_id where c.person_id = ${who.id} and c.account = ${account.oid}
  `;
  return { account, place };
}

/** Someone's assistant in a new conversation, Claude unless said, connected after they allowed it. */
async function assistantOf(who: Member, document = assistants.claude): Promise<Session> {
  const assistant = new Assistant(homing.url, document);
  await assistant.connect(who.browser);
  return assistant.open();
}

/** Ana with her mailbox in Minus 1, which she shares with Cara, as she does Acme; Ben in Beta; and Gunnar's email. */
async function world() {
  const [ana, cara, ben] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben')];
  const { minus1, acme } = await as({ person: ana.id, direct: true }, async (s) => {
    const minus1 = await createSpace(s, { name: 'Minus 1' });
    const acme = await createSpace(s, { name: 'Acme' });
    for (const space of [minus1, acme]) await addMember(s, space, cara.id);
    return { minus1, acme };
  });
  const beta = await as({ person: ben.id, direct: true }, (s) => createSpace(s, { name: 'Beta' }));
  const { account, place } = await connect(ana, minus1);
  const gunnar = microsoft.deliver(account, {
    from: { name: 'Gunnar Lie', address: 'gunnar@northwind.test' },
    to: [{ name: account.name, address: account.address }],
    subject: 'Northwind budget',
    html: '<p>Hi Ana,</p><p>The Northwind budget for 2027 is NOK 2 million, approved by the board on Monday.</p><p>Gunnar Lie, CFO</p>',
    at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    conversation: `AAQk${crypto.randomUUID()}=`,
  });
  return { ana, cara, ben, minus1, acme, beta, email: `microsoft:${place}:${gunnar}`, claude: await assistantOf(ana) };
}

const skillMd = (description: string) => ({ path: 'SKILL.md', body: `---\nname: learn-from-a-mailbox\ndescription: ${description}\n---\n\nRead it your way.\n` });
const itemOf = (answer: { text: string; failed: boolean }) => {
  assert.ok(!answer.failed, answer.text);
  return /item:([0-9a-f-]{36})/.exec(answer.text)![1];
};
/** The skill the mailbox's line in context points to, by its reference. */
const learnFrom = (context: string) => /^The user's mailbox [^\n]* is connected to Homing: [^\n]* To learn from it, follow the skill learn-from-a-mailbox \((page:[0-9a-f-]{36})\)\.$/m.exec(context)?.[1];

test('a person with a mailbox finds Homing’s skill for learning from it on the mailbox’s line in context, and reads it whole; nobody else, and nothing else, gets it', async () => {
  const { cara, minus1, claude } = await world();
  const here = (await claude.call('context', { request: 'What is the status?', space: `space:${minus1}` })).text;
  const reference = learnFrom(here);
  assert.ok(reference, here);
  // Without a space, on the same line, whatever the request; never listed among skills on its own account.
  for (const request of ['Learn from my mailbox', 'Read the contract', 'Learn Norwegian']) {
    const anywhere = (await claude.call('context', { request })).text;
    assert.equal(learnFrom(anywhere), reference, anywhere);
    assert.equal(anywhere.split(reference!).length, 2, anywhere);
    assert.doesNotMatch(anywhere, /^- learn-from-a-mailbox/m);
  }
  // A request about something else gets its ordinary answer.
  assert.match((await claude.call('context', { request: 'Read the contract' })).text, /^You are Ana\. Nothing in Homing matches this request\./);
  assert.doesNotMatch(here, /^- learn-from-a-mailbox/m);

  // Read whole, exactly as Homing has it.
  const read = await claude.call('read', { ref: reference! });
  assert.ok(!read.failed, read.text);
  const file = await readFile(new URL('../skills/learn-from-a-mailbox/SKILL.md', import.meta.url), 'utf8');
  assert.equal(read.text, `# learn-from-a-mailbox\nA skill built into Homing (${reference}). A skill of the user's own with its name replaces it. Its SKILL.md:\n\n${file}`);
  assert.match(file, /^---\nname: learn-from-a-mailbox\n/);
  assert.doesNotMatch(file, /^> Draft/m);

  // Someone without a mailbox isn't given it.
  const carasClaude = await assistantOf(cara);
  assert.doesNotMatch((await carasClaude.call('context', { request: 'Learn from my mailbox', space: `space:${minus1}` })).text, /learn-from-a-mailbox/);
  assert.doesNotMatch((await carasClaude.call('context', { request: 'Learn from my mailbox' })).text, /learn-from-a-mailbox/);
  await Promise.all([claude.close(), carasClaude.close()]);
});

test('a skill of the person’s own with that name is what the mailbox’s line points to, listed as any skill is', async () => {
  const { ana, minus1, claude } = await world();
  const context = async (space?: string) => (await claude.call('context', { request: 'Learn from my mailbox', ...(space && { space: `space:${space}` }) })).text;
  const homings = learnFrom(await context(minus1));

  const anas = await as({ person: ana.id, direct: true }, (s) => saveSkill(s, { spaceId: ana.personalSpaceId, files: [skillMd('How Ana learns from her mailbox')] }));
  for (const space of [minus1, undefined]) assert.equal(learnFrom(await context(space)), `page:${anas.pageId}`);
  assert.match(await context(minus1), new RegExp(`^- learn-from-a-mailbox: How Ana learns from her mailbox \\(page:${anas.pageId}\\)$`, 'm'));

  // Minus 1's own is more specific than her personal space's.
  const minus1s = await as({ person: ana.id, direct: true }, (s) => saveSkill(s, { spaceId: minus1, files: [skillMd('How Minus 1 learns from a mailbox')], shared: true }));
  assert.equal(learnFrom(await context(minus1)), `page:${minus1s.pageId}`);
  assert.equal(learnFrom(await context()), `page:${minus1s.pageId}`);
  assert.notEqual(homings, `page:${minus1s.pageId}`);
  await claude.close();
});

/** The lines an assistant reads about one item: on its page, by itself, in search and in context. */
async function seen(claude: Session, item: string, page: string, space: string, query: string) {
  const line = (text: string) => text.split('\n').find((one) => one.includes(`item:${item}`)) ?? '';
  return {
    page: line((await claude.call('read', { ref: `page:${page}` })).text),
    item: (await claude.call('read', { ref: `item:${item}` })).text,
    search: line((await claude.call('search', { query, known: true })).text),
    context: line((await claude.call('context', { request: query, space: `space:${space}` })).text),
  };
}

test('what rests on an email Homing read says so to everyone who sees it, however it is rewritten, corrected or shared, and by whom', async () => {
  const { ana, cara, minus1, email, claude } = await world();
  const chatgpt = await assistantOf(ana, assistants.chatgpt);
  const label = "rests on an email Homing read: what was taken from it, not the email's own words";
  const saved = async (answer: { text: string; failed: boolean }) => {
    assert.ok(!answer.failed, answer.text);
    return /as item:([0-9a-f-]{36})/.exec(answer.text)![1];
  };

  // Claude keeps the budget from Gunnar's email.
  let item = await saved(await claude.call('remember', {
    space: `space:${minus1}`,
    page: 'Northwind budget',
    text: 'The Northwind budget for 2027 is NOK 2 million, approved by the board.',
    sources: [{ reference: email, excerpt: 'The Northwind budget for 2027 is NOK 2 million, approved by the board on Monday.' }],
  }));
  const [{ page }] = await admin<{ page: string }[]>`select page_id as page from content where id = ${item}`;
  const check = async (writer: string) => {
    const lines = await seen(claude, item, page, minus1, 'Northwind budget');
    assert.ok(lines.page.endsWith(`written by ${writer}, ${label})`), lines.page);
    assert.ok(lines.item.includes(`Written by ${writer} on `) && lines.item.includes(`. ${label[0].toUpperCase()}${label.slice(1)}.`), lines.item);
    assert.ok(lines.search.endsWith(`, ${label})`), lines.search);
    assert.ok(lines.context.endsWith(`, ${label})`), lines.context);
  };
  await check('Ana through Claude');

  // ChatGPT replaces it, and Claude replaces that, each without a source of its own.
  item = await saved(await chatgpt.call('remember', { replaces: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million.' }));
  await check('Ana through ChatGPT');
  item = await saved(await claude.call('remember', { replaces: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved.' }));
  await check('Ana through Claude');
  // ChatGPT corrects it where it is.
  const updated = await chatgpt.call('remember', { updates: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved on Monday.' });
  assert.ok(!updated.failed, updated.text);
  await check('Ana through ChatGPT');

  // With what Ana said besides, it still rests on the email, and says it the same way.
  item = await saved(await claude.call('remember', {
    replaces: `item:${item}`,
    text: 'The Northwind budget for 2027 is NOK 2 million, approved on Monday, and Ana expects no cuts.',
    sources: [{ reference: 'Ana, in this conversation', excerpt: 'I don’t expect any cuts this year.' }],
  }));
  await check('Ana through Claude');
  const sources = (await claude.call('read', { ref: `item:${item}` })).text.split('\n').filter((line) => line.startsWith('- Source: '));
  assert.equal(sources.length, 2);
  assert.ok(sources.some((line) => line.startsWith(`- Source: ${email}, an email Homing read in the user's mailbox: `)));
  assert.ok(sources.some((line) => line.startsWith('- Source: Ana, in this conversation: ')));

  // Ana corrects it herself in the app: it's hers now, and still rests on the email.
  const text = 'The Northwind budget for 2027 is NOK 3 million: I checked with Gunnar.';
  assert.equal((await ana.browser.json(`/api/items/${item}`, { text })).status, 200);
  await check('Ana');

  // Every version still rests on the email, so its history stays true.
  const versions = await admin<{ cites: boolean }[]>`
    with recursive line (id) as (select ${item}::uuid union all select c.supersedes from content c join line on c.id = line.id where c.supersedes is not null)
    select exists (select from citations ci join sources src on src.id = ci.source_id where ci.content_id = line.id and src.read_through is not null) as cites from line
  `;
  assert.deepEqual(versions.map((row) => row.cites), [true, true, true, true]);

  // In the app, the item and what changed on Home say what Homing read it in.
  const shown = await ana.browser.json(`/api/pages/${page}`);
  assert.deepEqual(shown.body.items.map((one: { id: string; readFrom: string | null }) => [one.id, one.readFrom]), [[item, 'mailbox']]);
  const changed = (await ana.browser.json('/api/changes')).body.changes.filter((change: { pageId: string }) => change.pageId === page);
  assert.deepEqual(changed.map((change: { readFrom: string | null }) => change.readFrom), ['mailbox']);

  // Shared with Minus 1, Cara sees it rests on an email Homing read, and nothing of the email.
  const sheet = await ana.browser.json(`/api/items/${item}/publication`);
  assert.equal((await ana.browser.json(`/api/items/${item}/publish`, { shown: sheet.body.text, space: minus1 })).status, 200);
  const carasClaude = await assistantOf(cara);
  const theirs = (await carasClaude.call('read', { ref: `page:${page}` })).text;
  assert.ok(theirs.split('\n').some((line) => line.startsWith(`- ${text} (item:`) && line.endsWith(`, shared, written by Ana, ${label})`)), theirs);
  assert.doesNotMatch(theirs, /Source:|microsoft:|Gunnar Lie <|board on Monday/);
  assert.ok((await carasClaude.call('search', { query: 'Northwind budget', known: true })).text.includes(`, written by Ana, ${label})`));
  const hers = await cara.browser.json(`/api/pages/${page}`);
  assert.deepEqual(hers.body.items.map((one: { readFrom: string | null; sources: unknown[] }) => [one.readFrom, one.sources.length]), [['mailbox', 0]]);
  const herChanges = (await cara.browser.json('/api/changes')).body.changes.filter((change: { pageId: string }) => change.pageId === page);
  assert.deepEqual(herChanges.map((change: { readFrom: string | null }) => change.readFrom), ['mailbox']);
  // What doesn't rest on anything Homing read says nothing of the kind.
  const plain = itemOf(await claude.call('remember', { space: `space:${minus1}`, page: 'Northwind budget', text: 'Ana meets Gunnar in March.' }));
  assert.doesNotMatch((await claude.call('read', { ref: `item:${plain}` })).text, /Homing read/);
  await Promise.all([claude.close(), chatgpt.close(), carasClaude.close()]);
});

test('what Ana shared from an email still rests on it once her assistant rewrites the copy and she shares that, for her, her assistant and Cara', async () => {
  const { ana, cara, minus1, email, claude } = await world();
  const carasClaude = await assistantOf(cara);
  const label = "rests on an email Homing read: what was taken from it, not the email's own words";
  const first = itemOf(await claude.call('remember', {
    space: `space:${minus1}`,
    page: 'Northwind budget',
    text: 'The Northwind budget for 2027 is NOK 2 million.',
    sources: [{ reference: email, excerpt: 'The Northwind budget for 2027 is NOK 2 million, approved by the board on Monday.' }],
  }));
  const [{ page }] = await admin<{ page: string }[]>`select page_id as page from content where id = ${first}`;
  const shared = async (item: string) => {
    const sheet = (await ana.browser.json(`/api/items/${item}/publication`)).body;
    const done = await ana.browser.json(`/api/items/${item}/publish`, { shown: sheet.text, space: minus1 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    return { sheet, id: done.body.id as string };
  };
  // What a person and their assistant are told about an item, through MCP and the app.
  const told = async (who: Member, assistant: Session, item: string) => {
    const lines = await seen(assistant, item, page, minus1, 'Northwind budget');
    for (const line of [lines.page, lines.search, lines.context]) assert.ok(line.includes(`, ${label})`), `${who.name}: ${line}`);
    assert.ok(lines.item.includes(`. ${label[0].toUpperCase()}${label.slice(1)}.`), `${who.name}: ${lines.item}`);
    const shown = (await who.browser.json(`/api/pages/${page}`)).body.items.filter((one: { id: string }) => one.id === item);
    assert.deepEqual(shown.map((one: { readFrom: string | null }) => one.readFrom), ['mailbox'], who.name);
  };

  // Shared, it's a copy citing nothing, since the email is only Ana's.
  const copy = (await shared(first)).id;
  assert.notEqual(copy, first);
  // Her assistant replaces the copy: the new version cites nothing either, and rests on the email all the same.
  const mine = itemOf(await claude.call('remember', { replaces: `item:${copy}`, text: 'The Northwind budget for 2027 is NOK 2 million, as approved.' }));
  assert.deepEqual([...(await admin`select source_id from citations where content_id = ${mine}`)], []);
  await told(ana, claude, mine);
  // She shares it: nothing on it is hidden, so it goes over as it is, and as she's told, everyone sees what it rests on.
  const again = await shared(mine);
  assert.deepEqual([again.id, again.sheet.copy, again.sheet.hidden.length, again.sheet.readFrom], [mine, false, 0, 'mailbox']);
  for (const [who, assistant] of [[ana, claude], [cara, carasClaude]] as const) await told(who, assistant, mine);

  // Replaced again and corrected where it stands, then shared, it still does.
  const latest = itemOf(await claude.call('remember', { replaces: `item:${mine}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved.' }));
  assert.ok(!(await claude.call('remember', { updates: `item:${latest}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved on Monday.' })).failed);
  await told(ana, claude, latest);
  assert.equal((await shared(latest)).id, latest);
  for (const [who, assistant] of [[ana, claude], [cara, carasClaude]] as const) await told(who, assistant, latest);
  // Cara gets nothing of the email.
  assert.doesNotMatch((await carasClaude.call('read', { ref: `page:${page}` })).text, /Source:|microsoft:|Gunnar Lie <|board on Monday\./);
  await Promise.all([claude.close(), carasClaude.close()]);
});

test('what an item rests on is followed 100 versions back, only for someone who sees it, and for a page’s items at once', async () => {
  const { ana, cara, minus1, email, claude } = await world();
  const first = itemOf(await claude.call('remember', {
    space: `space:${minus1}`,
    page: 'Long history',
    text: 'Version 0.',
    sources: [{ reference: email, excerpt: 'The Northwind budget for 2027 is NOK 2 million, approved by the board on Monday.' }],
  }));
  const [{ page, source }] = await admin<{ page: string; source: string }[]>`
    select c.page_id as page, ci.source_id as source from content c join citations ci on ci.content_id = c.id where c.id = ${first}
  `;
  const readFrom = (who: Member, items: string[]) =>
    as({ person: who.id }, async (s) => [...(await s.tx<{ item: string; kind: string }[]>`select item, kind from read_from(${s.tx.array(items)}::uuid[])`)]);
  // Written straight to the database, no later version cites the email itself: only its line does.
  const versions = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const ids = [first];
    for (let v = 1; v <= 101; v++) {
      const [{ id }] = await s.tx<{ id: string }[]>`
        insert into content (page_id, space_id, private_to, kind, body, supersedes) values (${page}, ${minus1}, ${ana.id}, 'text', ${`Version ${v}.`}, ${ids.at(-1)!}) returning id
      `;
      ids.push(id);
    }
    return ids;
  });
  assert.deepEqual(await readFrom(ana, [versions[100], versions[101]]), [{ item: versions[100], kind: 'mailbox' }]);
  // Someone who can't see an item learns nothing of it, or of its line.
  assert.deepEqual(await readFrom(cara, versions), []);

  // A page of 300 items, each the fifth version of one citing the email, is asked about at once, and quickly.
  const start = itemOf(await claude.call('remember', { space: `space:${minus1}`, page: 'Many facts', text: 'Facts follow.' }));
  const [{ page: crowded }] = await admin<{ page: string }[]>`select page_id as page from content where id = ${start}`;
  const current = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    await s.tx`insert into content (page_id, space_id, private_to, kind, body) select ${crowded}, ${minus1}, ${ana.id}, 'text', 'Fact ' || i from generate_series(1, 300) i`;
    await s.tx`insert into citations (content_id, source_id) select id, ${source} from content where page_id = ${crowded} and body like 'Fact %'`;
    for (let v = 1; v < 5; v++) {
      await s.tx`
        insert into content (page_id, space_id, private_to, kind, body, supersedes)
        select page_id, space_id, private_to, 'text', body || '.', id from content c
        where c.page_id = ${crowded} and c.body like 'Fact %' and not exists (select from content r where r.supersedes = c.id)
      `;
    }
    return (await s.tx<{ id: string }[]>`
      select id from content c where c.page_id = ${crowded} and c.body like 'Fact %' and not exists (select from content r where r.supersedes = c.id)
    `).map((row) => row.id);
  });
  assert.equal(current.length, 300);
  let fastest = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    assert.equal((await readFrom(ana, current)).length, 300);
    fastest = Math.min(fastest, performance.now() - start);
  }
  // Asked once for each item, as it was before, this took about 75 ms.
  assert.ok(fastest < 50, `${Math.round(fastest)} ms`);
  await claude.close();
});

test('a knowledge-only search for a sender finds what is known about them and no email, and the ordinary search is as it was', async () => {
  const { minus1, email, claude } = await world();
  const kept = await claude.call('remember', {
    space: `space:${minus1}`,
    page: 'Gunnar Lie',
    type: 'person',
    text: 'Gunnar Lie is Northwind’s CFO.',
    sources: [{ reference: email, excerpt: 'Gunnar Lie, CFO' }],
  });
  assert.ok(!kept.failed, kept.text);
  const searches = microsoft.asked.searches;

  const known = (await claude.call('search', { query: 'Gunnar Lie', known: true })).text;
  assert.equal(microsoft.asked.searches, searches);
  assert.match(known, /^- Page "Gunnar Lie" \(page:/m);
  assert.match(known, /^- Gunnar Lie: Gunnar Lie is Northwind’s CFO\. \(item:/m);
  assert.doesNotMatch(known, /Source:|## Email|microsoft:/);

  const everything = (await claude.call('search', { query: 'Gunnar Lie' })).text;
  assert.equal(microsoft.asked.searches, searches + 1);
  assert.match(everything, /^- Source: microsoft:[^\n]*, an email Homing read in the user's mailbox: /m);
  assert.match(everything, /^## Email in the user's mailbox /m);
  // What is known comes up the same in both.
  for (const line of known.split('\n')) assert.ok(everything.includes(line), line);
  await claude.close();
});

test('Ana’s page moves to the space it belongs in, with its items, sources, citations and history, out of its collections, and nobody else sees it', async () => {
  const { ana, cara, ben, minus1, acme, email, claude } = await world();
  // While reading her mail, Claude kept what it learned about Gunnar in Minus 1, corrected it, and gathered the page.
  const first = await claude.call('remember', { space: `space:${minus1}`, page: 'Gunnar Lie', text: 'Gunnar Lie is Northwind’s CFO.', sources: [{ reference: email, excerpt: 'Gunnar Lie, CFO' }] });
  const item = /as item:([0-9a-f-]{36})/.exec(first.text)![1];
  const [{ page }] = await admin<{ page: string }[]>`select page_id as page from content where id = ${item}`;
  const replaced = await claude.call('remember', { replaces: `item:${item}`, text: 'Gunnar Lie is Northwind’s CFO, and approves its budget.', sources: [{ reference: 'Ana, on the phone', excerpt: 'Gunnar signs off on the budget' }] });
  const current = /as item:([0-9a-f-]{36})/.exec(replaced.text)![1];
  assert.ok(!(await claude.call('remember', { updates: `item:${current}`, text: 'Gunnar Lie is Northwind’s CFO, and approves its budget each year.' })).failed);
  assert.ok(!(await claude.call('remember', { space: `space:${minus1}`, page: 'People', text: 'Who is who at Northwind.' })).failed);
  const [{ people }] = await admin<{ people: string }[]>`select page_id as people from content where kind = 'title' and body = 'People' and space_id = ${minus1}`;
  assert.ok(!(await claude.call('remember', { page: `page:${page}`, gatherInto: `page:${people}` })).failed);
  const before = await admin`select source_id from citations where content_id in (select id from content where page_id = ${page}) order by source_id`;

  const moved = await claude.call('act', { action: 'page.move', input: { page: `page:${page}`, to: `space:${acme}` } });
  assert.ok(!moved.failed, moved.text);
  assert.equal(
    moved.text,
    `Moved "Gunnar Lie" (page:${page}) from Minus 1 (space:${minus1}) to Acme (space:${acme}), with everything on it and its history, still citing its sources where they're kept. ` +
      `It's still only the user's. It's no longer in the collection "People" (page:${people}), since a collection gathers pages of its own space.`,
  );

  // In Acme now, with its knowledge, its sources where they were, and its history.
  const read = (await claude.call('read', { ref: `page:${page}` })).text;
  assert.match(read, new RegExp(`^# Gunnar Lie\nA page in Acme \\(page:${page}\\)\nMoved here from Minus 1 \\(space:${minus1}\\) by Claude on \\d{4}-\\d{2}-\\d{2}\\.\n`));
  const label = "written by Ana through Claude, rests on an email Homing read: what was taken from it, not the email's own words)";
  assert.ok(read.includes(`- Gunnar Lie is Northwind’s CFO, and approves its budget each year. (item:${current}, private, ${label}`), read);
  assert.ok(read.includes(`- Source: ${email}, an email Homing read in the user's mailbox: "From: Gunnar Lie <gunnar@northwind.test>`), read);
  assert.doesNotMatch(read, /^In "People"/m);
  const history = (await claude.call('read', { ref: `item:${current}` })).text;
  assert.match(history, new RegExp(`It replaced item:${item}\\.`));
  assert.match(history, /## Earlier versions\n- "Gunnar Lie is Northwind’s CFO, and approves its budget\.", by Ana through Claude, until /);
  assert.deepEqual([...(await admin`select source_id from citations where content_id in (select id from content where page_id = ${page}) order by source_id`)], [...before]);
  assert.deepEqual((await admin`select distinct space_id from sources where id in ${admin(before.map((row) => row.sourceId))}`).map((row) => row.spaceId), [minus1]);
  assert.deepEqual((await admin`select distinct space_id from content where page_id = ${page} union select space_id from revisions where content_id in (select id from content where page_id = ${page})`).map((row) => row.spaceId), [acme]);
  assert.match((await claude.call('context', { request: 'Gunnar', space: `space:${acme}` })).text, new RegExp(`- Gunnar Lie, page:${page}`));
  assert.doesNotMatch((await claude.call('context', { request: 'Gunnar', space: `space:${minus1}` })).text, new RegExp(`page:${page}`));
  const shown = await ana.browser.json(`/api/pages/${page}`);
  assert.equal(shown.body.space.id, acme);
  assert.deepEqual({ ...shown.body.moved, at: undefined }, { from: { id: minus1, name: 'Minus 1', personal: false }, agent: 'Claude', at: undefined });
  // What changed lately shows what was learned, once, not the move: nothing on the page changed.
  const changes = await ana.browser.json('/api/changes');
  assert.equal(changes.body.changes.filter((change: { pageId: string }) => change.pageId === page).length, 1);

  // Nobody else sees anything of it, through their assistant, the app or the database.
  for (const someone of [cara, ben]) {
    const theirs = await assistantOf(someone);
    for (const where of [{}, { space: `space:${acme}` }, { space: `space:${minus1}` }]) {
      const found = await theirs.call('search', { query: 'Gunnar', ...where });
      assert.doesNotMatch(found.text, /Gunnar|Northwind/);
    }
    assert.match((await theirs.call('read', { ref: `page:${page}` })).text, /^There is no page with that reference that you can see\.$/);
    assert.equal((await someone.browser.json(`/api/pages/${page}`)).status, 404);
    assert.ok(!(await someone.browser.json('/api/changes')).body.changes.some((change: { pageId: string }) => change.pageId === page));
    await as({ person: someone.id }, async (s) => {
      assert.deepEqual([...(await s.tx`select * from page_moves`)], []);
      assert.deepEqual([...(await s.tx`select id from content where page_id = ${page}`)], []);
      assert.deepEqual([...(await s.tx`select id from pages where id = ${page}`)], []);
    });
    await theirs.close();
  }
  // Ana, and her assistant for her, see the record of it.
  assert.equal((await as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select moved_from from page_moves where page_id = ${page}`)).length, 1);

  // Once Ana leaves Minus 1, where the email is kept, the page still says what it rests on.
  await as({ person: ana.id, direct: true }, async (s) => {
    await addMember(s, minus1, cara.id, 'admin');
    await changeMember(s, minus1, ana.id, 'remove');
  });
  const after = (await claude.call('read', { ref: `page:${page}` })).text;
  assert.ok(after.includes(`(item:${current}, private, ${label}`), after);
  assert.match(after, /^Moved here from a space the user can no longer open by Claude on /m);
  assert.doesNotMatch(after, /Source: microsoft:/);
  await claude.close();
});

test('moving a page is refused, each time saying why, and nothing moves', async () => {
  const { ana, ben, minus1, acme, beta, claude } = await world();
  const pageOf = async (answer: { text: string; failed: boolean }) => {
    assert.ok(!answer.failed, answer.text);
    const [{ page }] = await admin<{ page: string }[]>`select page_id as page from content where id = ${/item:([0-9a-f-]{36})/.exec(answer.text)![1]}`;
    return page;
  };
  const own = await pageOf(await claude.call('remember', { space: `space:${minus1}`, page: 'Northwind', text: 'Northwind is a client.' }));
  // A page she shared something on.
  const published = await pageOf(await claude.call('remember', { space: `space:${minus1}`, page: 'Offices', text: 'The office moves in May.' }));
  const [{ id: toShare }] = await admin<{ id: string }[]>`select id from content where page_id = ${published} and kind = 'text'`;
  await share(ana, toShare);
  // One in a space with model processing off.
  const payroll = await as({ person: ana.id, direct: true }, async (s) => {
    const payroll = await createSpace(s, { name: 'Payroll' });
    await setModelProcessing(s, payroll, false);
    return payroll;
  });
  const salaries = await pageOf(await claude.call('remember', { space: `space:${payroll}`, page: 'Salaries', text: 'Cara earns NOK 900,000.' }));
  // Guidance, a skill and the overview.
  const { guidance, skill } = await as({ person: ana.id, direct: true }, async (s) => {
    const rule = await addRule(s, { spaceId: minus1, kind: 'preference', body: 'Write in Norwegian' });
    const skill = await saveSkill(s, { spaceId: minus1, files: [{ path: 'SKILL.md', body: '---\nname: status-report\ndescription: A weekly status report\n---\n\nSteps.\n' }] });
    return { guidance: rule.pageId, skill: skill.pageId };
  });
  assert.ok(!(await claude.call('remember', { space: `space:${minus1}`, overview: true, text: 'Minus 1 is Ana’s company.' })).failed);
  const [{ overview }] = await admin<{ overview: string }[]>`select id as overview from pages where space_id = ${minus1} and type = 'overview'`;
  // Acme has a page with that title already, and an archived space.
  const there = await pageOf(await claude.call('remember', { space: `space:${acme}`, page: 'northwind', text: 'Northwind buys from Acme.' }));
  const old = await as({ person: ana.id, direct: true }, async (s) => {
    const old = await createSpace(s, { name: 'Old project' });
    await archiveSpace(s, old, true);
    return old;
  });

  const move = (page: string, to: string) => claude.call('act', { action: 'page.move', input: { page: `page:${page}`, to: `space:${to}` } });
  const refusals: [string, string, RegExp][] = [
    [published, acme, /^Something on that page is shared, so it stays where it is\. Only a page that's wholly the user's own moves\. Nothing moved\.$/],
    [guidance, acme, /^Rules, skills and a space's overview stay with their space\. Nothing moved\.$/],
    [skill, acme, /^Rules, skills and a space's overview stay with their space\. Nothing moved\.$/],
    [overview, acme, /^Rules, skills and a space's overview stay with their space\. Nothing moved\.$/],
    [own, acme, new RegExp(`^Acme \\(space:${acme}\\) already has a page called "northwind" \\(page:${there}\\)\\. Nothing moved: write what this page says on that one instead, or ask the user\\.$`)],
    [own, old, new RegExp(`^Old project \\(space:${old}\\) is archived\\. Nothing moved: ask the user whether to reopen it first\\.$`)],
    // Ben's space, and one being imported into, are spaces she can't open.
    [own, beta, /^There's no space there that you can open\. Nothing moved\.$/],
    [own, minus1, /^It's in that space already\. Nothing moved\.$/],
    [salaries, acme, /^Model processing is off where it is and on in that space, so it stays where it is\. Nothing moved\.$/],
  ];
  for (const [page, to, why] of refusals) {
    const answer = await move(page, to);
    assert.ok(answer.failed, answer.text);
    assert.match(answer.text, why);
  }
  assert.deepEqual((await admin`select distinct space_id from content where page_id in ${admin([own, published, guidance, skill, overview])}`).map((row) => row.spaceId), [minus1]);
  assert.deepEqual((await admin`select distinct space_id from content where page_id = ${salaries}`).map((row) => row.spaceId), [payroll]);
  assert.deepEqual([...(await admin`select from page_moves where page_id in ${admin([own, published, salaries])}`)], []);

  // Nor does anyone move someone else's page, which they can't see, and only her assistant moves hers.
  const bens = await assistantOf(ben);
  assert.match((await bens.call('act', { action: 'page.move', input: { page: `page:${own}`, to: `space:${beta}` } })).text, /^There is no page with that reference that you can see\.$/);
  await assert.rejects(as({ person: ben.id, agent: 'Claude' }, (s) => s.tx`select move_page(${own}::uuid, ${beta}::uuid)`), { code: '42501' });
  await assert.rejects(as({ person: ana.id, direct: true }, (s) => s.tx`select move_page(${own}::uuid, ${acme}::uuid)`), { code: '42501' });
  await Promise.all([claude.close(), bens.close()]);
});

test('what Ana was shown for sharing with Minus 1 is shared nowhere once its page moved, in the app, a proposal or a plan, and she and Claude are told where it went', async () => {
  const { ana, cara, minus1, acme, claude } = await world();
  const kept = async (page: string, text: string) => itemOf(await claude.call('remember', { space: `space:${minus1}`, page, text }));
  const pageOfItem = async (item: string) => (await admin<{ page: string }[]>`select page_id as page from content where id = ${item}`)[0].page;
  const moved = async (item: string) => assert.ok(!(await claude.call('act', { action: 'page.move', input: { page: `page:${await pageOfItem(item)}`, to: `space:${acme}` } })).failed);
  const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
  const proposal = async (id: string) => (await ana.browser.json(`/api/proposals/${id}`)).body.proposal;

  // In the app, she opens sharing it with Minus 1, and Claude moves the page to Acme before she confirms.
  const salaries = await kept('Salaries', 'Minus 1 pays Cara NOK 900,000.');
  const sheet = await ana.browser.json(`/api/items/${salaries}/publication`);
  await moved(salaries);
  const confirmed = await ana.browser.json(`/api/items/${salaries}/publish`, { shown: sheet.body.text, space: minus1 });
  assert.deepEqual([confirmed.status, confirmed.body.message], [409, "It's in Acme now."]);

  // Claude proposed sharing it: moving the page ends that, saying where it went, to Ana and to Claude.
  const rates = await kept('Rates', 'Minus 1 bills NOK 1,800 an hour.');
  const publish = { action: 'knowledge.publish', input: { item: `item:${rates}` } };
  const asked = proposalOf((await claude.call('act', publish)).text);
  const shown = (await proposal(asked)).publication.text;
  const minus1Context = async () => (await claude.call('context', { request: 'Rates', space: `space:${minus1}` })).text;
  assert.match(await minus1Context(), new RegExp(`## Waiting for approval\n[^#]*\\(proposal:${asked}, `));
  await moved(rates);
  const ended = await proposal(asked);
  assert.deepEqual([ended.state, ended.withdrawnBy, ended.movedTo], ['withdrawn', 'Claude', 'Acme']);
  const decided = await ana.browser.json(`/api/proposals/${asked}/decide`, { approve: true, shown });
  assert.deepEqual([decided.status, decided.body.message], [409, 'It was withdrawn, so there’s nothing to decide.']);
  const how = `Withdrawn on \\d{4}-\\d{2}-\\d{2}, when Claude moved its page to Acme \\(space:${acme}\\), so nothing was shared\\. If the user still wants it shared, propose it where it is now\\.`;
  assert.match((await claude.call('read', { ref: `proposal:${asked}` })).text, new RegExp(`^proposal:${asked} in Minus 1\\. ${how}$`, 'm'));
  const context = await minus1Context();
  assert.doesNotMatch(context, /## Waiting for approval/);
  assert.match(context, new RegExp(`^- Share item:${rates} with everyone in the space \\(proposal:${asked}\\): ${how}$`, 'm'));
  // So Claude can propose sharing it where it is now, at once.
  const again = await claude.call('act', publish);
  assert.ok(!again.failed, again.text);
  assert.equal((await proposal(proposalOf(again.text))).space, 'Acme');

  // A plan with something to share on each of two pages: it can only be declined, and says why.
  const launch = await kept('Launch', 'Launch is in May.');
  const price = await kept('Price', 'The price is NOK 10.');
  const share = (item: string) => ({ action: 'knowledge.publish', input: { item: `item:${item}` } });
  const plan = proposalOf((await claude.call('act', { action: 'plan.propose', input: { space: `space:${minus1}`, changes: [share(launch), share(price)] } })).text);
  const planShown = (await proposal(plan)).plan.shown;
  await moved(launch);
  assert.deepEqual((await proposal(plan)).plan.steps.map((step: { problem: string | null }) => step.problem), ['It’s in Acme now.', null]);
  const approved = await ana.browser.json(`/api/proposals/${plan}/decide`, { approve: true, shown: planShown });
  assert.deepEqual([approved.status, approved.body.message], [409, 'Nothing changed, because what’s on “Launch” can’t be shared. It’s in Acme now.']);

  // Nothing on any of those pages is shared, in either space, and Cara, who has both, finds none of it.
  const pages = await Promise.all([salaries, rates, launch, price].map(pageOfItem));
  assert.deepEqual((await admin`select distinct private_to from content where page_id in ${admin(pages)}`).map((row) => row.privateTo), [ana.id]);
  const carasClaude = await assistantOf(cara);
  for (const query of ['Cara NOK', 'bills hour', 'Launch May', 'price NOK']) assert.doesNotMatch((await carasClaude.call('search', { query })).text, /item:|page:/, query);
  await Promise.all([claude.close(), carasClaude.close()]);
});
