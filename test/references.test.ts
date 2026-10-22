// What assistants stumbled on in benchmarks 1 to 3, through MCP. A reference to a page, an item, a
// rule or a task says which space it's in, so a write that names one needs no space, and a space
// whose context showed it is fine too. A space can be named by a page in it or by its name. Search
// finds tasks and the proposals waiting for the user. Pages say who wrote each item, since what a
// person wrote stays theirs. None of it tells anyone what's in a space they can't open.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace } from '../src/spaces.ts';
import { addTask } from '../src/tasks.ts';
import { Assistant, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
});

after(() => homing.close());

type Session = Awaited<ReturnType<Assistant['open']>>;

/** Someone's assistant in a new conversation, connected over OAuth after they allowed it. */
async function assistantOf(who: Member): Promise<Session> {
  const assistant = new Assistant(homing.url);
  await assistant.connect(who.browser);
  return assistant.open();
}

const refIn = (text: string, kind: string) => new RegExp(`${kind}:[0-9a-f-]{36}`).exec(text)?.[0];
const random = (kind: string) => `${kind}:${crypto.randomUUID()}`;

/**
 * Ana works with Cara on Northwind, whose website relaunch is a space in it, and alone on Fjord
 * Bank. Ben works for Beta. The relaunch has a page with what Ana's assistant saved about it.
 */
async function world() {
  const ana = await member(homing.url, 'Ana');
  const cara = await member(homing.url, 'Cara');
  const ben = await member(homing.url, 'Ben');
  const { northwind, relaunch, fjord } = await as({ ...ana, direct: true }, async (s) => {
    const northwind = await createSpace(s, { name: 'Northwind' });
    await addMember(s, northwind, cara.id);
    return { northwind, relaunch: await createSpace(s, { name: 'Website relaunch', parentId: northwind }), fjord: await createSpace(s, { name: 'Fjord Bank' }) };
  });
  const golive = await as({ ...ana, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: relaunch, title: 'Go-live' });
    return writeItem(s, { pageId: page, body: 'The relaunch goes live on 1 March 2027' });
  });
  const beta = await as({ ...ben, direct: true }, async (s) => {
    const space = await createSpace(s, { name: 'Beta' });
    const page = await createPage(s, { spaceId: space, title: 'Budget', shared: true });
    const item = await writeItem(s, { pageId: page, body: 'Beta’s budget is approved', shared: true });
    const rule = await addRule(s, { spaceId: space, kind: 'preference', body: 'Keep Beta updates short', shared: true });
    const task = await addTask(s, { spaceId: space, title: 'Call Beta’s lawyer' });
    return { space, page, item: item.id, rule: rule.id, task: task.id };
  });
  return { ana, cara, ben, northwind, relaunch, fjord, golive, beta, claude: await assistantOf(ana) };
}

test('the instructions say to propose a new rule, which the user approves, not to ask them to add it', async () => {
  const { claude } = await world();
  const instructions = claude.client.getInstructions() ?? '';
  assert.match(instructions, /when the user wants a new rule, propose it with `act` and guidance\.propose, and they approve the exact text/);
  assert.doesNotMatch(instructions, /ask them to add it/);
  await claude.close();
});

test('the instructions say when Homing helps, and to leave it out of requests that need nothing of the user’s', async () => {
  const { claude } = await world();
  const instructions = claude.client.getInstructions() ?? '';
  assert.match(instructions, /Use Homing for requests about the user's own work and life/);
  assert.match(instructions, /Leave it out of requests that need nothing of theirs/);
  assert.doesNotMatch(instructions, /At the start of a task, call `context`/);
  await claude.close();
});

test('a reference decides where remember saves, so the space can be left out, or be one above it', async () => {
  const { relaunch, northwind, golive, claude } = await world();

  // Replacing what the assistant saved, without a space: it goes where the item is, and says so.
  const moved = await claude.call('remember', { replaces: `item:${golive.id}`, text: 'The relaunch goes live on 15 March 2027' });
  assert.ok(!moved.failed, moved.text);
  assert.match(moved.text, new RegExp(`It's in Website relaunch \\(space:${relaunch}\\), where that item is\\.`));

  // Northwind's context shows what's in the spaces in it, so naming Northwind with that page is fine too.
  const goLivePage = `page:${golive.pageId}`;
  assert.match((await claude.call('context', { request: 'When does the relaunch go live?', space: `space:${northwind}` })).text, /15 March 2027/);
  const added = await claude.call('remember', { space: `space:${northwind}`, page: goLivePage, text: 'Gunnar signs off on go-live' });
  assert.ok(!added.failed, added.text);
  assert.match(added.text, new RegExp(`on the page "Go-live" \\(${goLivePage}\\)\\. It's in Website relaunch \\(space:${relaunch}\\), where that page is\\.`));
  const read = (await claude.call('read', { ref: goLivePage })).text;
  assert.match(read, /Gunnar signs off on go-live/);
  assert.match(read, /A page in Website relaunch/);

  // A collection decides too: a new page for Ola goes where the collection is.
  const gathered = await claude.call('remember', { space: `space:${northwind}`, page: 'Ola Nordmann', type: 'person', text: 'Ola takes over hosting and DNS', gatherInto: goLivePage });
  assert.ok(!gathered.failed, gathered.text);
  assert.match(gathered.text, new RegExp(`on the new page "Ola Nordmann" \\(page:[0-9a-f-]+\\)\\. It's in Website relaunch \\(space:${relaunch}\\), where that collection is\\. page:[0-9a-f-]+ is in the collection ${goLivePage} for you\\.`));

  // Given exactly, it says nothing more.
  const exact = await claude.call('remember', { space: `space:${relaunch}`, page: goLivePage, text: 'The launch party is on 16 March' });
  assert.doesNotMatch(exact.text, /It's in/);
  await claude.close();
});

test('a space that has nothing to do with the reference is refused, saying where the reference is', async () => {
  const { ana, relaunch, fjord, golive, claude } = await world();
  for (const space of [`space:${fjord}`, 'Personal', `space:${ana.personalSpaceId}`]) {
    const attempt = await claude.call('remember', { space, replaces: `item:${golive.id}`, text: 'The relaunch goes live on 15 March 2027' });
    assert.equal(attempt.failed, true, space);
    assert.equal(
      attempt.text,
      `That item is in Website relaunch (space:${relaunch}), not in the space given. Nothing changed: leave out the space, and the item decides where it goes.`,
    );
  }
  assert.doesNotMatch((await claude.call('search', { query: '15 March' })).text, /15 March/, 'nothing was saved');

  // Not even the sources it would have kept.
  const sourced = await claude.call('remember', { space: `space:${fjord}`, replaces: `item:${golive.id}`, text: 'Moved to April', sources: [{ excerpt: 'We move it to April.' }] });
  assert.equal(sourced.failed, true);
  assert.equal((await claude.call('search', { query: 'April' })).text, 'No matches.');
  await claude.close();
});

test('a task is marked done by its reference alone, wherever it is', async () => {
  const { relaunch, fjord, claude } = await world();
  const kept = await claude.call('remember', { space: `space:${relaunch}`, task: { title: 'Send Gunnar the revised timeline' } });
  const task = refIn(kept.text, 'task')!;

  const done = await claude.call('remember', { task: { ref: task, done: true } });
  assert.ok(!done.failed, done.text);
  assert.match(done.text, new RegExp(`^Done: Send Gunnar the revised timeline \\(${task}\\)\\. Only the user sees it\\. It's in Website relaunch \\(space:${relaunch}\\)\\.$`));
  // A new task still needs its space, and an unrelated one says where the task is.
  assert.match((await claude.call('remember', { task: { title: 'Call the bank' } })).text, /Say which space the task is for/);
  assert.match((await claude.call('remember', { space: `space:${fjord}`, task: { ref: task, done: false } })).text, /That task is in Website relaunch/);
  await claude.close();
});

test('a rule is changed where it is set, from any space whose context showed it', async () => {
  const { ana, northwind, relaunch, fjord, claude } = await world();
  const { personal, client } = await as({ ...ana, direct: true }, async (s) => ({
    personal: (await addRule(s, { spaceId: ana.personalSpaceId, kind: 'preference', body: 'Keep answers short' })).id,
    client: (await addRule(s, { spaceId: northwind, kind: 'preference', body: 'Write to Northwind in English', shared: true })).id,
  }));
  const propose = (input: Record<string, unknown>) => claude.call('act', { action: 'guidance.propose', input });

  // The relaunch's context shows both, from above it and from the personal space.
  const context = (await claude.call('context', { request: 'rules', space: `space:${relaunch}` })).text;
  assert.ok(context.includes(`item:${personal}`) && context.includes(`item:${client}`));

  const removal = await propose({ space: `space:${relaunch}`, change: 'remove', rule: `item:${personal}`, why: 'No longer wanted' });
  assert.ok(!removal.failed, removal.text);
  assert.match(removal.text, new RegExp(`^The rule is set in the user's personal space \\(space:${ana.personalSpaceId}\\), so that's where it changes\\. Waiting for the user's approval`));
  const change = await propose({ space: `space:${relaunch}`, change: 'change', rule: `item:${client}`, text: 'Write to Northwind in Norwegian' });
  assert.match(change.text, new RegExp(`^The rule is set in Northwind \\(space:${northwind}\\)`));
  const proposals = await admin<{ spaceId: string; itemId: string }[]>`select space_id, item_id from proposals where private_to = ${ana.id} order by created_at`;
  assert.deepEqual(proposals.map((p) => [p.spaceId, p.itemId]), [[ana.personalSpaceId, personal], [northwind, client]]);

  // Without a space, the rule decides. In a space it doesn't apply in, it's refused.
  assert.match((await propose({ change: 'remove', rule: `item:${client}` })).text, /The rule is set in Northwind/);
  const elsewhere = await propose({ space: `space:${fjord}`, change: 'remove', rule: `item:${client}` });
  assert.equal(elsewhere.failed, true);
  assert.match(elsewhere.text, new RegExp(`^That rule is in Northwind \\(space:${northwind}\\), not in the space given\\. Nothing changed`));
  // A new rule needs its space.
  assert.match((await propose({ change: 'add', kind: 'preference', text: 'Use metric units' })).text, /Say which space the new rule is for/);
  await claude.close();
});

test('an include names the space whose guidance it changes, and what it includes never decides that', async () => {
  const { ana, northwind, fjord, golive, claude } = await world();
  const propose = (input: Record<string, unknown>) => claude.call('act', { action: 'guidance.propose', input });
  const missing = await propose({ change: 'include', include: `space:${fjord}` });
  assert.equal(missing.failed, true);
  assert.match(missing.text, /^Say which space's guidance it's for/);
  const page = await propose({ space: `page:${golive.pageId}`, change: 'include', include: `space:${fjord}` });
  assert.equal(page.failed, true);
  assert.match(page.text, /^That's a page, not a space\. Give the space whose guidance it is/);
  assert.equal((await admin`select from proposals where private_to = ${ana.id}`).length, 0);

  const named = await propose({ space: 'Northwind', change: 'include', include: `space:${fjord}` });
  assert.ok(!named.failed, named.text);
  const proposals = await admin<{ spaceId: string; action: string }[]>`select space_id, action from proposals where private_to = ${ana.id}`;
  assert.deepEqual(proposals.map((p) => [p.spaceId, p.action]), [[northwind, 'add include']]);
  await claude.close();
});

test('a space is found by a page in it or by its exact name, and a name two spaces have asks which', async () => {
  const { ana, relaunch, golive, claude } = await world();
  const byName = await claude.call('context', { request: 'go-live', space: 'website relaunch' });
  assert.match(byName.text, /^# Website relaunch/);
  const byPage = await claude.call('context', { request: 'go-live', space: `page:${golive.pageId}` });
  assert.match(byPage.text, /^# Website relaunch/);
  const personal = await claude.call('remember', { space: 'Personal', text: 'Ana prefers mornings for calls' });
  assert.ok(!personal.failed, personal.text);
  assert.equal((await claude.call('search', { query: 'mornings', space: `space:${ana.personalSpaceId}` })).text.split('\n').length, 1);
  assert.match((await claude.call('act', { action: 'space.create', input: { name: 'Pilot', who: 'with others', in: 'Fjord Bank', closed: true } })).text, /^Created Pilot .+ In Fjord Bank\./);

  // Two of Ana's spaces called Pilot now: she's asked which.
  await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Pilot', parentId: relaunch }));
  const two = await claude.call('context', { request: 'pilot', space: 'Pilot' });
  assert.equal(two.failed, true);
  assert.match(two.text, /^Several spaces the user can open are called Pilot: Pilot in Fjord Bank \(space:[0-9a-f-]+\), Pilot in Website relaunch \(space:[0-9a-f-]+\)\. Ask the user which one they mean/);
  assert.match((await claude.call('context', { request: 'x', space: 'Nowhere' })).text, /"Nowhere" isn't the name of a space the user can open/);

  // A reference in one of them says which is meant.
  assert.match((await claude.call('remember', { space: 'Pilot', task: { title: 'Book the pilot venue' } })).text, /^Several spaces the user can open are called Pilot/);
  const pilot = refIn(two.text.split(', ')[1], 'space')!;
  const task = refIn((await claude.call('remember', { space: pilot, task: { title: 'Book the pilot venue' } })).text, 'task')!;
  const done = await claude.call('remember', { space: 'Pilot', task: { ref: task, done: true } });
  assert.ok(!done.failed, done.text);
  assert.match(done.text, /^Done: Book the pilot venue/);
  await claude.close();
});

test('an action on a space itself takes the space or its name, never a page in it', async () => {
  const { ana, fjord, claude } = await world();
  const tiles = await as({ ...ana, agent: 'Claude' }, (s) => createPage(s, { spaceId: fjord, title: 'Tiles' }));
  const act = (action: string, input: Record<string, unknown>) => claude.call('act', { action, input });

  const archive = await act('space.archive', { space: `page:${tiles}`, asked: true });
  assert.equal(archive.failed, true);
  assert.match(archive.text, /^That's a page, not a space\. To archive a page, use page\.archive\./);
  for (const [action, input] of [
    ['space.rename', { space: `page:${tiles}`, name: 'Tiles and more' }],
    ['space.share', { space: `page:${tiles}`, asked: true }],
    ['members.change', { space: `page:${tiles}`, person: 'Cara', change: 'add' }],
  ] as const) {
    const attempt = await act(action, input);
    assert.equal(attempt.failed, true, action);
    assert.match(attempt.text, /^That's a page, not a space\. Give the space's reference/, action);
  }
  const [space] = await admin<{ name: string; archivedAt: Date | null }[]>`select name, archived_at from spaces where id = ${fjord}`;
  assert.deepEqual([space.name, space.archivedAt], ['Fjord Bank', null]);
  assert.equal((await admin`select from proposals where private_to = ${ana.id}`).length, 0);

  // Its name is fine.
  assert.match((await act('space.rename', { space: 'Fjord Bank', name: 'Fjord' })).text, /^Renamed Fjord Bank to Fjord/);
  await claude.close();
});

test('a reference in a space Ana can’t open gets the same answer as one that doesn’t exist', async () => {
  const { relaunch, beta, claude } = await world();
  // Every way of naming something of Ben's, beside the same thing made up, with and without a space of Ana's.
  const pairs: [string, Record<string, unknown>, (ref: string) => Record<string, unknown>][] = [
    ['item', { text: 'Changed' }, (ref) => ({ replaces: ref })],
    ['item', { text: 'Changed' }, (ref) => ({ updates: ref })],
    ['page', { text: 'Hello' }, (ref) => ({ page: ref })],
    ['page', {}, (ref) => ({ page: 'Go-live', gatherInto: ref })],
    ['task', {}, (ref) => ({ task: { ref, done: true } })],
  ];
  const own = { item: beta.item, page: beta.page, task: beta.task } as Record<string, string>;
  for (const [kind, rest, named] of pairs) {
    for (const space of [{}, { space: `space:${relaunch}` }, { space: `space:${beta.space}` }]) {
      const theirs = await claude.call('remember', { ...space, ...rest, ...named(`${kind}:${own[kind]}`) });
      const madeUp = await claude.call('remember', { ...space, ...rest, ...named(random(kind)) });
      assert.equal(theirs.failed, true);
      assert.equal(theirs.text, madeUp.text, `${kind} ${JSON.stringify(space)}`);
      assert.doesNotMatch(theirs.text, /Beta/);
    }
  }
  for (const space of [{}, { space: `space:${relaunch}` }, { space: `space:${beta.space}` }]) {
    const propose = (rule: string) => claude.call('act', { action: 'guidance.propose', input: { ...space, change: 'remove', rule } });
    assert.equal((await propose(`item:${beta.rule}`)).text, (await propose(random('item'))).text);
  }
  // Nor as a space: by a page in it, or by its name.
  for (const tool of ['context', 'search'] as const) {
    const input = (space: string) => (tool === 'context' ? { request: 'budget', space } : { query: 'budget', space });
    assert.equal((await claude.call(tool, input(`page:${beta.page}`))).text, (await claude.call(tool, input(random('page')))).text);
    const named = (await claude.call(tool, input('Beta'))).text;
    assert.equal(named, (await claude.call(tool, input('Gamma'))).text.replace('Gamma', 'Beta'));
  }
  assert.equal((await claude.call('act', { action: 'space.rename', input: { space: 'Beta', name: 'Mine' } })).failed, true);
  const [{ name }] = await admin<{ name: string }[]>`select name from spaces where id = ${beta.space}`;
  assert.equal(name, 'Beta');
  await claude.close();
});

test('two spaces with one name are told apart without a space above that the user can’t open', async () => {
  const { ana, cara } = await world();
  // Cara is in a closed Pilot in Ana's Harbor, which Cara can't open, and has a Pilot of her own.
  await as({ ...ana, direct: true }, async (s) => {
    const harbor = await createSpace(s, { name: 'Harbor' });
    await addMember(s, await createSpace(s, { name: 'Pilot', parentId: harbor, closed: true }), cara.id);
  });
  await as({ ...cara, direct: true }, (s) => createSpace(s, { name: 'Pilot' }));
  const caras = await assistantOf(cara);
  const two = await caras.call('context', { request: 'pilot', space: 'Pilot' });
  assert.match(two.text, /^Several spaces the user can open are called Pilot: Pilot on its own \(space:[0-9a-f-]+\), Pilot on its own \(space:[0-9a-f-]+\)\./);
  assert.doesNotMatch(two.text, /Harbor|above/);
  await caras.close();
});

test('search finds the user’s tasks, with where each is and whether it’s done', async () => {
  const { ana, relaunch, northwind, claude } = await world();
  const task = refIn((await claude.call('remember', { space: `space:${relaunch}`, task: { title: 'Send Gunnar the revised timeline', due: '2026-11-02' } })).text, 'task')!;
  await as({ ...ana, direct: true }, (s) => addTask(s, { spaceId: northwind, title: 'Review the timeline with the team', shared: true }));

  const found = (await claude.call('search', { query: 'revised timeline' })).text;
  assert.match(found, new RegExp(`- Task: Send Gunnar the revised timeline \\(${task}, in Website relaunch, private, open, due 2026-11-02\\)`));
  assert.match(found, /- Task: Review the timeline with the team \(task:[0-9a-f-]+, in Northwind, shared, open\)/);
  // Within a space, only there and below it.
  assert.doesNotMatch((await claude.call('search', { query: 'timeline', space: `space:${relaunch}` })).text, /Review the timeline/);

  await claude.call('remember', { task: { ref: task, done: true } });
  const today = new Date().toISOString().slice(0, 10);
  assert.match((await claude.call('search', { query: 'revised timeline' })).text, new RegExp(`${task}, in Website relaunch, private, done on ${today}\\)`));
  // The best match comes first, done or not, before open tasks that share only "the".
  const tasks = (await claude.call('search', { query: 'Send Gunnar the revised timeline' })).text.split('\n').filter((line) => line.startsWith('- Task:'));
  assert.equal(tasks.length, 2);
  assert.match(tasks[0], new RegExp(task));
  await claude.close();
});

test('search finds a proposal waiting for the user, so the assistant can withdraw it', async () => {
  const { northwind, claude } = await world();
  const proposed = await claude.call('act', {
    action: 'guidance.propose',
    input: { space: `space:${northwind}`, change: 'add', kind: 'preference', text: 'Send status reports on Fridays' },
  });
  const proposal = refIn(proposed.text, 'proposal')!;

  const found = (await claude.call('search', { query: 'the rule I proposed about status reports on Fridays' })).text;
  assert.match(found, new RegExp(`- Waiting for the user: Add a preference \\(private\\): "Send status reports on Fridays" \\(${proposal}, in Northwind\\)`));
  assert.ok(!(await claude.call('act', { action: 'proposal.withdraw', input: { proposal } })).failed);
  assert.doesNotMatch((await claude.call('search', { query: 'status reports Fridays' })).text, /proposal:/, 'only what still waits');
  await claude.close();
});

test('search never finds someone else’s private task or proposal, even a colleague’s in the same space', async () => {
  const { cara, ben, northwind, beta, claude } = await world();
  const caras = await assistantOf(cara);
  await caras.call('remember', { space: `space:${northwind}`, task: { title: 'Ask for a raise before Christmas' } });
  await caras.call('act', { action: 'guidance.propose', input: { space: `space:${northwind}`, change: 'add', kind: 'preference', text: 'Never schedule a raise talk on Mondays' } });
  const task = (await admin<{ id: string }[]>`select id from tasks where private_to = ${cara.id}`)[0].id;
  assert.match((await caras.call('search', { query: 'raise' })).text, /Ask for a raise/);

  for (const query of ['raise Christmas', 'raise Mondays', 'Beta lawyer']) {
    assert.equal((await claude.call('search', { query })).text, 'No matches.', query);
  }
  // Nor by its reference: it's no task Ana can see.
  assert.equal(
    (await claude.call('remember', { task: { ref: `task:${task}`, done: true } })).text,
    (await claude.call('remember', { task: { ref: random('task'), done: true } })).text,
  );
  assert.equal((await claude.call('read', { ref: `task:${task}` })).failed, true);
  const bens = await assistantOf(ben);
  assert.equal((await bens.call('search', { query: 'raise' })).text, 'No matches.');
  assert.match((await bens.call('search', { query: 'lawyer' })).text, new RegExp(`task:${beta.task}`));
  await Promise.all([caras.close(), bens.close(), claude.close()]);
});

test('a page says who wrote each item, so an assistant can tell what a person wrote before replacing it', async () => {
  const { ana, relaunch, golive, claude } = await world();
  const typed = await as({ ...ana, direct: true }, (s) => writeItem(s, { pageId: golive.pageId, body: 'Per Hansen owns hosting and DNS' }));

  const page = (await claude.call('read', { ref: `page:${golive.pageId}` })).text;
  assert.match(page, /What a person wrote themselves stays theirs: save new evidence beside it, and point out the difference to the user\./);
  assert.match(page, new RegExp(`- Per Hansen owns hosting and DNS \\(item:${typed.id}, private, written by Ana\\)`));
  assert.match(page, new RegExp(`- The relaunch goes live on 1 March 2027 \\(item:${golive.id}, private, written by Ana through Claude\\)`));
  // Briefly where it's found too, only for what a person wrote.
  const found = (await claude.call('search', { query: 'hosting goes live' })).text;
  assert.match(found, new RegExp(`Per Hansen owns hosting and DNS \\(item:${typed.id}, in Website relaunch, private, written by Ana\\)`));
  assert.match(found, new RegExp(`1 March 2027 \\(item:${golive.id}, in Website relaunch, private\\)`));
  assert.match((await claude.call('context', { request: 'hosting', space: `space:${relaunch}` })).text, /Per Hansen owns hosting and DNS \(item:[0-9a-f-]+, in Website relaunch, private, written by Ana\)/);

  // remember says replaces is for what assistants wrote, and Homing holds to it.
  const remember = (await claude.client.listTools()).tools.find((tool) => tool.name === 'remember')!;
  assert.match(remember.description!, /replaces and updates are for what assistants wrote/);
  assert.match(remember.description!, /What a person wrote themselves stays theirs, and pages show who wrote each item\. Save the new evidence beside it instead/);
  const attempt = await claude.call('remember', { replaces: `item:${typed.id}`, text: 'Ola Nordmann owns hosting and DNS' });
  assert.equal(attempt.failed, true);
  assert.match(attempt.text, /Agents never change what people wrote/);
  await claude.close();
});

test('context without a space shows what matched, with its space, and the skills that fit', async () => {
  const { ana, ben, northwind, fjord, beta, claude } = await world();
  await as({ ...ana, direct: true }, async (s) => {
    const skill = '---\nname: status-report\ndescription: The status report a client gets every other Friday.\n---\nSay where the work stands, then what is next.';
    await saveSkill(s, { spaceId: northwind, shared: true, files: [{ path: 'SKILL.md', body: skill }] });
    const page = await createPage(s, { spaceId: fjord, title: 'Contract', shared: true });
    await writeItem(s, { pageId: page, body: 'Fjord Bank wants a status report every month', shared: true });
  });
  await as({ ...ben, direct: true }, (s) =>
    saveSkill(s, { spaceId: beta.space, shared: true, files: [{ path: 'SKILL.md', body: '---\nname: beta-report\ndescription: The status report Beta sends.\n---\nFor Beta.' }] }),
  );

  const text = (await claude.call('context', { request: 'What should a status report look like?' })).text;
  // It points to each space's own context for the rules, which a match alone doesn't give.
  assert.match(text, /^You are Ana\. Choose the space this is about, or ask the user, and call `context` again with it for the rules that apply there\./);
  assert.match(text, new RegExp(`## Spaces that fit\\n(- .*\\n)*- Northwind \\(space:${northwind}\\)`));
  assert.match(text, new RegExp(`## Spaces that fit\\n(- .*\\n)*- Fjord Bank \\(space:${fjord}\\)`));
  assert.match(text, /## Relevant to the request\n- Contract: Fjord Bank wants a status report every month \(item:[0-9a-f-]+, in Fjord Bank, written by Ana\)/);
  assert.match(text, /## Skills that fit\n.+\n- status-report: The status report a client gets every other Friday\. \(page:[0-9a-f-]+, in Northwind\)/);
  // Ben's skill and space never show, though they match too.
  assert.doesNotMatch(text, /Beta|beta-report/);
  // A skill's files hold many common words, so a match there alone doesn't make it fit.
  assert.doesNotMatch((await claude.call('context', { request: 'Where does the work stand?' })).text, /Skills that fit|status-report/);
  await claude.close();
});

test('context without a space says so when nothing of the user’s matches, and picks a space only on more than a word in common', async () => {
  const { relaunch, golive, claude } = await world();
  for (const request of ['Why is the sky blue?', "What's 15% of 2,400?"]) {
    const text = (await claude.call('context', { request })).text;
    assert.match(text, /^You are Ana\. Nothing in Homing matches this request\. If it isn't about the user's work, answer it without Homing\./);
    assert.doesNotMatch(text, /Spaces that fit|Relevant to the request/);
  }
  // Of "website" and "live", only "live" is in the relaunch's knowledge: too little to pick it. With "relaunch" as well, it's picked.
  const one = (await claude.call('context', { request: 'Is the website live?' })).text;
  assert.match(one, new RegExp(`## Spaces that fit\\n- Website relaunch \\(space:${relaunch}\\)\\n\\n## Relevant to the request\\n(- .*\\n)*- Go-live: The relaunch goes live on 1 March 2027 \\(item:${golive.id}, in Website relaunch, private\\)`));
  assert.match((await claude.call('context', { request: 'When does the relaunch go live?' })).text, /^Picked Website relaunch, because it is the only space with matching knowledge or skills\./);
  await claude.close();
});

test('proposing to share an item says who it would reach, so an assistant shares it where it is', async () => {
  const { ana, northwind, golive, claude } = await world();
  const act = (await claude.client.listTools()).tools.find((tool) => tool.name === 'act')!;
  assert.match(act.description!, /Everyone who can open its space sees it, which takes in the spaces above it up to the first closed one, so share an item where it is\./);

  const open = await claude.call('act', { action: 'knowledge.publish', input: { item: `item:${golive.id}` } });
  assert.match(
    open.text,
    /Once approved, everyone who can open Website relaunch sees it: 2 people now, including everyone in Northwind, since it isn't closed, and anyone who joins later\. Shared where it is, it already reaches them: there is no need to copy it to a space above\./,
  );

  // In a closed space, only the people added to it.
  const board = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Board', parentId: northwind, closed: true }));
  const note = await as({ ...ana, agent: 'Claude' }, async (s) => writeItem(s, { pageId: await createPage(s, { spaceId: board, title: 'Board' }), body: 'The board meets in May' }));
  const closed = await claude.call('act', { action: 'knowledge.publish', input: { item: `item:${note.id}` } });
  assert.match(closed.text, /Once approved, everyone who can open Board sees it: 1 person now, and anyone who joins later\. It is closed, so people in Northwind who weren't added to it don't see it\./);
  assert.doesNotMatch(closed.text, /copy it/);
  await claude.close();
});

test('who a share reaches counts only the people the user can see, and says when a space above they can’t open has more', async () => {
  const { ana, ben } = await world();
  // Ana's Holding has Client in it, and Project in that. Ben is in Client, so he can't open Holding.
  const { client, project } = await as({ ...ana, direct: true }, async (s) => {
    const holding = await createSpace(s, { name: 'Holding' });
    const client = await createSpace(s, { name: 'Client', parentId: holding });
    await addMember(s, client, ben.id);
    return { client, project: await createSpace(s, { name: 'Project', parentId: client }) };
  });
  const bens = await assistantOf(ben);
  const note = async (spaceId: string) => (await as({ ...ben, agent: 'Claude' }, async (s) => writeItem(s, { pageId: await createPage(s, { spaceId, title: 'Notes' }), body: 'Kickoff is on Monday' }))).id;

  const inProject = await bens.call('act', { action: 'knowledge.publish', input: { item: `item:${await note(project)}` } });
  assert.match(inProject.text, /everyone who can open Project sees it: 2 people now, including everyone in Client and people in a space above, since it isn't closed, and anyone who joins later\./);
  const inClient = await bens.call('act', { action: 'knowledge.publish', input: { item: `item:${await note(client)}` } });
  assert.match(inClient.text, /everyone who can open Client sees it: 2 people now, everyone who can open the space above it, and anyone who joins later\./);
  await bens.close();
});

test('context without a space leaves out what’s in an archived space, unless the request names it', async () => {
  const { ana, claude } = await world();
  const old = await as({ ...ana, direct: true }, async (s) => {
    const old = await createSpace(s, { name: 'Old client' });
    await writeItem(s, { pageId: await createPage(s, { spaceId: old, title: 'Budget', shared: true }), body: 'The zeppelin budget is 40,000 NOK', shared: true });
    await addTask(s, { spaceId: old, title: 'Pay the zeppelin invoice' });
    await saveSkill(s, { spaceId: old, shared: true, files: [{ path: 'SKILL.md', body: '---\nname: zeppelin-brief\ndescription: The zeppelin brief.\n---\nWrite it.' }] });
    await archiveSpace(s, old, true);
    return old;
  });
  const text = (await claude.call('context', { request: 'What about the zeppelin budget?' })).text;
  assert.match(text, /^You are Ana\. Nothing in Homing matches this request\./);
  assert.doesNotMatch(text, /zeppelin/i);
  assert.match((await claude.call('context', { request: 'What about the zeppelin budget in Old client?' })).text, new RegExp(`^Picked Old client, because the request names it\\.[\\s\\S]*\\(space:${old}\\)[\\s\\S]*40,000 NOK`));
  await claude.close();
});

test('context without a space never says nothing matches beside a skill that fits, even one from a space above the user can’t open', async () => {
  const { ana, ben } = await world();
  await as({ ...ana, direct: true }, async (s) => {
    const agency = await createSpace(s, { name: 'Agency' });
    await saveSkill(s, { spaceId: agency, shared: true, files: [{ path: 'SKILL.md', body: '---\nname: pitch-deck\ndescription: How we make a pitch deck.\n---\nTen slides.' }] });
    await addMember(s, await createSpace(s, { name: 'Campaign', parentId: agency }), ben.id);
  });
  const bens = await assistantOf(ben);
  const text = (await bens.call('context', { request: 'Make a pitch deck' })).text;
  assert.doesNotMatch(text, /Nothing in Homing matches/);
  assert.match(text, /## Skills that fit\n.+\n- pitch-deck: How we make a pitch deck\. \(page:[0-9a-f-]+, in a space above\)/);
  await bens.close();
});

test('the telling words of a request leave out common English and Norwegian words and short numbers, and keep longer ones', async () => {
  const { ana, fjord, claude } = await world();
  await as({ ...ana, direct: true }, async (s) => {
    const page = await createPage(s, { spaceId: fjord, title: 'Kontrakt', shared: true });
    await writeItem(s, { pageId: page, body: 'Kontrakten fornyes 1. januar 2027.', shared: true });
    await writeItem(s, { pageId: page, body: 'Det er Kari som signerer kontrakten.', shared: true });
    await writeItem(s, { pageId: page, body: 'Invoice 20231 was paid on 3 October.', shared: true });
  });
  // "Hva", "er" and "det" are common Norwegian words, which would match Kari's item.
  assert.match((await claude.call('context', { request: 'Hva er det beste været i Bergen?' })).text, /^You are Ana\. Nothing in Homing matches this request\./);
  assert.match((await claude.call('context', { request: 'Når fornyes kontrakten?' })).text, /^Picked Fjord Bank, because it is the only space with matching knowledge or skills\./);
  // Common words are left out before the request is cut at 32 words, so a long one still finds what it's about.
  const long = `Is it true that ${'it is the one that '.repeat(8)}kontrakten fornyes?`;
  assert.match((await claude.call('context', { request: long })).text, /^Picked Fjord Bank, because it is the only space with matching knowledge or skills\./);
  // An invoice number counts; numbers of up to three digits, such as 3 in "3 October", don't.
  assert.match((await claude.call('context', { request: 'What about 20231?' })).text, /Invoice 20231 was paid on 3 October/);
  assert.match((await claude.call('context', { request: 'What about 3 or 202?' })).text, /^You are Ana\. Nothing in Homing matches this request\./);
  await claude.close();
});
