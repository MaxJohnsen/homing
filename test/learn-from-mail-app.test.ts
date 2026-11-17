// Issue #151: what an assistant that learns from a mailbox needs of Homing (spec §2, §3, §10).
// Ana connected her work mailbox in Minus 1, only for her. Cara is her colleague in Minus 1 and
// Acme, and Ben works for Beta. Homing gives the assistant of someone with a mailbox its own skill
// for learning from one, unless they have a skill of that name; what an assistant took from an
// email says so wherever it's shown, however often it's rewritten and by whichever assistant; a
// search keeps to what is known when asked; and a page wholly Ana's own moves to the space it
// belongs in, seen by nobody else before or after. Microsoft is a stand-in.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace } from '../src/spaces.ts';
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
const homingsOwn = /- learn-from-a-mailbox: Read a connected mailbox from its oldest mail to its newest[^\n]*\((page:[0-9a-f-]{36}), built into Homing\)/;

test('a new person’s assistant finds Homing’s skill for learning from a mailbox in context, and reads it whole', async () => {
  const { cara, minus1, claude } = await world();
  const here = (await claude.call('context', { request: 'Learn from my mailbox', space: `space:${minus1}` })).text;
  const [, reference] = homingsOwn.exec(here.slice(here.indexOf('\n## Skills\n'))) ?? [];
  assert.ok(reference, here);
  // Without a space too, among the skills that fit the request.
  const anywhere = (await claude.call('context', { request: 'Learn from my mailbox' })).text;
  assert.match(anywhere.slice(anywhere.indexOf('\n## Skills that fit\n')), homingsOwn);
  assert.equal(homingsOwn.exec(anywhere)?.[1], reference);

  // Read whole, exactly as Homing has it.
  const read = await claude.call('read', { ref: reference });
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

test('a skill of the person’s own with that name replaces Homing’s, in a space and in their personal space', async () => {
  const { ana, minus1, acme, claude } = await world();
  const skills = async (space?: string) => {
    const text = (await claude.call('context', { request: 'Learn from my mailbox', ...(space && { space: `space:${space}` }) })).text;
    return text.split('\n').filter((line) => line.startsWith('- learn-from-a-mailbox:'));
  };
  const acmes = await as({ person: ana.id, direct: true }, (s) => saveSkill(s, { spaceId: acme, files: [skillMd('How Acme learns from a mailbox')], shared: true }));
  assert.deepEqual(await skills(acme), [`- learn-from-a-mailbox: How Acme learns from a mailbox (page:${acmes.pageId})`]);
  assert.match((await skills(minus1)).join('\n'), homingsOwn);

  const anas = await as({ person: ana.id, direct: true }, (s) => saveSkill(s, { spaceId: ana.personalSpaceId, files: [skillMd('How Ana learns from her mailbox')] }));
  assert.deepEqual(await skills(minus1), [`- learn-from-a-mailbox: How Ana learns from her mailbox (page:${anas.pageId})`]);
  // Acme's is more specific than her personal space's.
  assert.deepEqual(await skills(acme), [`- learn-from-a-mailbox: How Acme learns from a mailbox (page:${acmes.pageId})`]);
  // Without a space, the ones she can see, and never Homing's.
  const anywhere = await skills();
  assert.ok(anywhere.length > 0 && anywhere.every((line) => !homingsOwn.test(line)), anywhere.join('\n'));
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

test('what an assistant took from an email says so in context, read, search and the app, however it is rewritten and by whom', async () => {
  const { ana, minus1, email, claude } = await world();
  const chatgpt = await assistantOf(ana, assistants.chatgpt);
  const pure = "learned from an email Homing read, so it's what the assistant took from it, not what the user wrote";
  const partly = 'learned partly from an email Homing read: that part is what the assistant took from it, not what the user wrote';
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
  const check = async (writer: string, label: string) => {
    const lines = await seen(claude, item, page, minus1, 'Northwind budget');
    assert.ok(lines.page.endsWith(`written by Ana through ${writer}, ${label})`), lines.page);
    assert.ok(lines.item.includes(`Written by Ana through ${writer} on `) && lines.item.includes(`. ${label[0].toUpperCase()}${label.slice(1)}.`), lines.item);
    assert.ok(lines.search.endsWith(`private, ${label})`), lines.search);
    assert.ok(lines.context.endsWith(`private, ${label})`), lines.context);
  };
  await check('Claude', pure);

  // ChatGPT replaces it, and Claude replaces that, each without a source of its own.
  item = await saved(await chatgpt.call('remember', { replaces: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million.' }));
  await check('ChatGPT', pure);
  item = await saved(await claude.call('remember', { replaces: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved.' }));
  await check('Claude', pure);
  // ChatGPT corrects it where it is.
  const updated = await chatgpt.call('remember', { updates: `item:${item}`, text: 'The Northwind budget for 2027 is NOK 2 million, as the board approved on Monday.' });
  assert.ok(!updated.failed, updated.text);
  await check('ChatGPT', pure);

  // With what Ana said besides, it's partly from the email, and says both.
  item = await saved(await claude.call('remember', {
    replaces: `item:${item}`,
    text: 'The Northwind budget for 2027 is NOK 2 million, approved on Monday, and Ana expects no cuts.',
    sources: [{ reference: 'Ana, in this conversation', excerpt: 'I don’t expect any cuts this year.' }],
  }));
  await check('Claude', partly);
  const sources = (await claude.call('read', { ref: `item:${item}` })).text.split('\n').filter((line) => line.startsWith('- Source: '));
  assert.equal(sources.length, 2);
  assert.ok(sources.some((line) => line.startsWith(`- Source: ${email}, an email Homing read in the user's mailbox: `)));
  assert.ok(sources.some((line) => line.startsWith('- Source: Ana, in this conversation: ')));

  // Every version still rests on the email, so its history stays true.
  const versions = await admin<{ cites: boolean }[]>`
    with recursive line (id) as (select ${item}::uuid union all select c.supersedes from content c join line on c.id = line.id where c.supersedes is not null)
    select exists (select from citations ci join sources src on src.id = ci.source_id where ci.content_id = line.id and src.read_through is not null) as cites from line
  `;
  assert.deepEqual(versions.map((row) => row.cites), [true, true, true, true]);

  // In the app, the item's sources say Homing read the email, which the page says in words.
  const shown = await ana.browser.json(`/api/pages/${page}`);
  const [onPage] = shown.body.items;
  assert.equal(onPage.id, item);
  assert.equal(onPage.agent, 'Claude');
  assert.deepEqual(onPage.sources.map((source: { readThrough: string | null; readFrom: string | null }) => [Boolean(source.readThrough), source.readFrom]).sort(), [[false, null], [true, 'mailbox']]);
  await Promise.all([claude.close(), chatgpt.close()]);
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
  assert.match(read, /Gunnar Lie is Northwind’s CFO, and approves its budget each year\. \(item:[^)]*, learned partly from an email Homing read/);
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
  // One waiting for her decision.
  const waiting = await pageOf(await claude.call('remember', { space: `space:${minus1}`, page: 'Budget', text: 'The budget is NOK 2 million.' }));
  const [{ id: proposed }] = await admin<{ id: string }[]>`select id from content where page_id = ${waiting} and kind = 'text'`;
  const proposal = await claude.call('act', { action: 'knowledge.publish', input: { item: `item:${proposed}` } });
  assert.match(proposal.text, /proposal:([0-9a-f-]{36})/);
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
    [waiting, acme, new RegExp(`^Something on it waits for the user's decision \\(${/proposal:[0-9a-f-]{36}/.exec(proposal.text)![0]}\\)\\. It can move once that's decided or withdrawn\\. Nothing moved\\.$`)],
  ];
  for (const [page, to, why] of refusals) {
    const answer = await move(page, to);
    assert.ok(answer.failed, answer.text);
    assert.match(answer.text, why);
  }
  assert.deepEqual((await admin`select distinct space_id from content where page_id in ${admin([own, published, waiting, guidance, skill, overview])}`).map((row) => row.spaceId), [minus1]);
  assert.deepEqual([...(await admin`select from page_moves where page_id in ${admin([own, published, waiting])}`)], []);

  // Nor does anyone move someone else's page, which they can't see.
  const bens = await assistantOf(ben);
  assert.match((await bens.call('act', { action: 'page.move', input: { page: `page:${own}`, to: `space:${beta}` } })).text, /^There is no page with that reference that you can see\.$/);
  await assert.rejects(as({ person: ben.id, agent: 'Claude' }, (s) => s.tx`select move_page(${own}::uuid, ${beta}::uuid)`), { code: '42501' });
  await Promise.all([claude.close(), bens.close()]);
});
