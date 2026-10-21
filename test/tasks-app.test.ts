// Issue #6, Homing's own tasks (spec §7). An assistant keeps the user's private tasks with
// `remember`, marks them done there, and sees the open ones in `context`. In the app, people add
// tasks for themselves or the space, tick them off, and share their own. Only people write on the
// shared side, and a task goes only to someone who can open its space.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, changeMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member;
let acme: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

type TaskRow = { id: string; title: string; due: string | null; shared: boolean; assignee: { name: string } | null; done: { by: { name: string } | null } | null; by: { name: string | null; you: boolean } | null; agent: string | null };
const tasksAs = async (who: Member) => (await who.browser.json(`/api/spaces/${acme}/tasks`)).body as { open: TaskRow[]; done: TaskRow[] };
const remember = (task: Record<string, unknown>) => claude.call('remember', { space: `space:${acme}`, task });

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, ben] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('an assistant keeps a private task, sees it in context, and marks it done', async () => {
  const kept = await remember({ title: 'Follow up with Gunnar about the budget', due: '2026-11-14' });
  assert.ok(!kept.failed, kept.text);
  const id = /task:([0-9a-f-]{36})/.exec(kept.text)![1];
  assert.match(kept.text, /Kept as a private task .+, due 2026-11-14\)\. Only the user sees it/);

  const context = (await claude.call('context', { request: 'What is next?', space: `space:${acme}` })).text;
  assert.match(context, new RegExp(`## Open tasks[\\s\\S]*- Follow up with Gunnar about the budget \\(task:${id}, due 2026-11-14, private\\)`));
  assert.deepEqual((await tasksAs(ana)).open.map((task) => [task.title, task.shared, task.agent]), [['Follow up with Gunnar about the budget', false, 'Claude']]);
  assert.deepEqual((await tasksAs(cara)).open, []);

  const done = await remember({ ref: `task:${id}`, done: true });
  assert.match(done.text, /^Done: Follow up with Gunnar/);
  assert.doesNotMatch((await claude.call('context', { request: 'What is next?', space: `space:${acme}` })).text, /Open tasks/);
  assert.match((await claude.call('read', { ref: `task:${id}` })).text, /^# Done: Follow up with Gunnar/);
  assert.ok((await remember({ due: 'next week' })).failed, 'a due date is a day');
});

test('in the app, people add tasks for the space, give them to someone in it, and tick them off', async () => {
  const added = await ana.browser.json(`/api/spaces/${acme}/tasks`, { title: 'Book the venue', due: '2026-11-03', assignee: cara.id, shared: true });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  const forCara = await tasksAs(cara);
  assert.deepEqual(forCara.open.map((task) => [task.title, task.due, task.shared, task.assignee?.name]), [['Book the venue', '2026-11-03', true, 'Cara']]);

  assert.equal((await cara.browser.json(`/api/tasks/${added.body.id}`, { done: true })).status, 200);
  assert.equal((await tasksAs(ana)).done.find((task) => task.title === 'Book the venue')?.done?.by?.name, 'Cara');

  // Only someone who can open the space gets a task there, and a due date is a real day.
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/tasks`, { title: 'Call Ben', assignee: ben.id, shared: true })).status, 400);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/tasks`, { title: 'Call', due: '2026-02-30' })).status, 400);
  assert.equal((await ben.browser.json(`/api/spaces/${acme}/tasks`)).status, 404);
});

test('a task of your own is shared only by you, and assistants never write the space’s', async () => {
  const kept = await remember({ title: 'Prepare the steering group' });
  const id = /task:([0-9a-f-]{36})/.exec(kept.text)![1];
  assert.equal((await cara.browser.json(`/api/tasks/${id}`, { done: true })).status, 404);
  assert.equal((await cara.browser.json(`/api/tasks/${id}/share`, {})).status, 404);
  assert.equal((await ana.browser.json(`/api/tasks/${id}/share`, {})).status, 200);
  // Cara sees whose assistant kept it, so it doesn't read like her own Claude.
  const shared = (await tasksAs(cara)).open.find((task) => task.title === 'Prepare the steering group');
  assert.deepEqual([shared?.agent, shared?.by], ['Claude', { name: 'Ana', you: false }]);
  // Shared now, it's the space's: the assistant leaves it to people.
  assert.match((await remember({ ref: `task:${id}`, done: true })).text, /people change shared tasks in Homing/);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`insert into tasks (space_id, title) values (${acme}::uuid, 'Hello')`), refused);
  // Nothing to share from a personal space.
  const mine = await ana.browser.json(`/api/spaces/${ana.personalSpaceId}/tasks`, { title: 'Water the plants' });
  assert.equal((await ana.browser.json(`/api/tasks/${mine.body.id}/share`, {})).status, 404);
});

test('a task stays changeable after the person it was for leaves, and done is when it was ticked off', async () => {
  const venue = await as({ ...ana, direct: true }, async (s) => {
    const venue = await createSpace(s, { name: 'Venue' });
    await addMember(s, venue, cara.id);
    return venue;
  });
  const given = await ana.browser.json(`/api/spaces/${venue}/tasks`, { title: 'Sign the venue contract', assignee: cara.id, shared: true });
  assert.equal(given.status, 200, JSON.stringify(given.body));
  await as({ ...ana, direct: true }, (s) => changeMember(s, venue, cara.id, 'remove'));
  assert.equal((await ana.browser.json(`/api/tasks/${given.body.id}`, { title: 'Sign the contract' })).status, 200);
  assert.equal((await ana.browser.json(`/api/tasks/${given.body.id}`, { done: true })).status, 200);
  assert.equal((await ana.browser.json(`/api/tasks/${given.body.id}`, { assignee: null })).status, 200);
  assert.equal((await ana.browser.json(`/api/tasks/${given.body.id}`, { assignee: cara.id })).status, 400, 'but it can’t be given to her again');

  // The store marks when it was done, whatever it's told.
  const [stored] = await as({ ...ana, direct: true }, (s) => s.tx<{ doneAt: Date; doneBy: string }[]>`
    update tasks set done_at = '2100-01-01' where id = ${given.body.id}::uuid returning done_at, done_by
  `);
  assert.ok(stored.doneAt.getFullYear() < 2100, 'done stays when it was done');
  assert.equal(stored.doneBy, ana.id);
  const [opened] = await as({ ...ana, direct: true }, (s) => s.tx<{ doneBy: string | null }[]>`
    update tasks set done_at = null where id = ${given.body.id}::uuid returning done_by
  `);
  assert.equal(opened.doneBy, null);

  // Only someone acting directly writes the space's tasks, not just someone without an assistant named.
  await assert.rejects(as(ana, (s) => s.tx`insert into tasks (space_id, title) values (${venue}::uuid, 'Hello')`), refused);
  await assert.rejects(as(ana, (s) => s.tx`update tasks set done_at = now() where id = ${given.body.id}::uuid`), refused);
  // And a description has a length.
  assert.equal((await ana.browser.json(`/api/spaces/${venue}/tasks`, { title: 'Long', description: 'x'.repeat(20001) })).status, 400);
  assert.equal((await ana.browser.json(`/api/spaces/${ana.personalSpaceId}/tasks`, { title: 'Hello', shared: true })).status, 403);
});

test('an assistant never rewrites a task the user wrote, and keeps a task and knowledge apart', async () => {
  const typed = await ana.browser.json(`/api/spaces/${acme}/tasks`, { title: 'Call the bank' });
  assert.match((await remember({ ref: `task:${typed.body.id}`, title: 'Call the bank about the loan' })).text, /The user wrote this task/);
  assert.match((await remember({ ref: `task:${typed.body.id}`, due: '2026-12-01' })).text, /^Open: Call the bank .+due 2026-12-01/);
  assert.match((await remember({ ref: `task:${typed.body.id}`, due: null })).text, /^Open: Call the bank \(task:[0-9a-f-]+\)\./);
  await assert.rejects(
    as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`update tasks set title = 'Something else' where id = ${typed.body.id}::uuid`),
    refused,
  );

  // A task the assistant kept becomes the user's once they rewrite it.
  const kept = /task:([0-9a-f-]{36})/.exec((await remember({ title: 'Draft the agenda' })).text)![1];
  assert.equal((await ana.browser.json(`/api/tasks/${kept}`, { title: 'Draft the agenda for Monday' })).status, 200);
  assert.equal((await tasksAs(ana)).open.find((task) => task.id === kept)?.agent, null);

  const both = await claude.call('remember', { space: `space:${acme}`, text: 'The bank closes at 15.', task: { title: 'Call before 15' } });
  assert.ok(both.failed && /A task goes alone/.test(both.text), both.text);
  assert.ok(!(await tasksAs(ana)).open.some((task) => task.title === 'Call before 15'), 'nothing was saved');
});

test('an assistant proposes sharing a task, and the person shares exactly what they were shown', async () => {
  const kept = await remember({ title: 'Book the caterer', due: '2026-11-20' });
  const id = /task:([0-9a-f-]{36})/.exec(kept.text)![1];
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'task.share', input });
  const proposed = await act({ task: `task:${id}`, why: 'Cara can pick it up.' });
  const proposal = /proposal:([0-9a-f-]{36})/.exec(proposed.text)![1];
  assert.match(proposed.text, /Waiting for the user's approval .+ The task stays theirs alone until then/);
  assert.match((await act({ task: `task:${id}` })).text, /already waits for the user/);
  assert.ok(!(await tasksAs(cara)).open.some((task) => task.title === 'Book the caterer'), 'nothing is shared before Ana decides');

  const shown = (await ana.browser.json(`/api/proposals/${proposal}`)).body.proposal;
  assert.equal(shown.action, 'task');
  assert.deepEqual([shown.task.title, shown.task.due, shown.task.why], ['Book the caterer', '2026-11-20', 'Cara can pick it up.']);
  // The assistant changes the task after Ana opened it: approving what she saw shares nothing.
  await remember({ ref: `task:${id}`, title: 'Book the caterer and the band' });
  const decide = (text: string) => ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, shown: text });
  assert.equal((await decide(shown.task.shown)).status, 409);
  const again = (await ana.browser.json(`/api/proposals/${proposal}`)).body.proposal;
  assert.equal((await decide(again.task.shown)).status, 200);
  assert.ok((await tasksAs(cara)).open.some((task) => task.title === 'Book the caterer and the band'));
  assert.match((await claude.call('read', { ref: `proposal:${proposal}` })).text, /The user shared it on .+\. Everyone in the space sees it now\./);

  // Only the user's own open tasks, and only where there's a shared side.
  assert.ok((await act({ task: `task:${id}` })).failed, 'it is shared already');
  const mine = await claude.call('remember', { space: `space:${ana.personalSpaceId}`, task: { title: 'Water the plants' } });
  assert.match((await act({ task: /task:[0-9a-f-]{36}/.exec(mine.text)![0] })).text, /personal space has no shared side/);
  // Straight against the database, a proposal names only the person's own task in its own space.
  const caras = await as(cara, (s) => s.tx<{ id: string }[]>`insert into tasks (space_id, private_to, title) values (${acme}::uuid, ${cara.id}::uuid, 'Cara’s own') returning id`);
  await assert.rejects(
    as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`insert into proposals (space_id, private_to, action, task_id, change) values (${acme}::uuid, ${ana.id}::uuid, 'share task', ${caras[0].id}::uuid, '{}')`),
    refused,
  );
});

test('a proposal to share a task ends when the task is shared or done another way, and only the user sees it', async () => {
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'task.share', input });
  const idOf = (text: string) => /task:([0-9a-f-]{36})/.exec(text)![1];
  const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
  const waiting = async () => ((await ana.browser.json('/api/waiting')).body.waiting as { id: string }[]).map((item) => item.id);

  // Ana shares it herself while the proposal waits: it leaves what's waiting, and can't be approved.
  const task = idOf((await remember({ title: 'Order the badges', due: '2026-11-10' })).text);
  const proposal = proposalOf((await act({ task: `task:${task}` })).text);
  const shown = (await ana.browser.json(`/api/proposals/${proposal}`)).body.proposal;
  assert.ok((await waiting()).includes(proposal));
  assert.equal((await cara.browser.json(`/api/proposals/${proposal}`)).status, 404);
  assert.equal((await cara.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, shown: shown.task.shown })).status, 404);
  assert.equal((await ana.browser.json(`/api/tasks/${task}/share`, {})).status, 200);
  assert.ok(!(await waiting()).includes(proposal));
  assert.match((await claude.call('read', { ref: `proposal:${proposal}` })).text, /shared with the space already, so there is nothing to decide/);
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, shown: shown.task.shown })).status, 409);
  assert.match((await act({ task: `task:${task}` })).text, /shared with the space already/);

  // A new due date after it was shown is a change too; a done task has nothing to share.
  const next = idOf((await remember({ title: 'Print the programme', due: '2026-11-12' })).text);
  const asked = proposalOf((await act({ task: `task:${next}`, why: 'Cara prints too.' })).text);
  const first = (await ana.browser.json(`/api/proposals/${asked}`)).body.proposal;
  await remember({ ref: `task:${next}`, due: '2026-11-13' });
  assert.equal((await ana.browser.json(`/api/proposals/${asked}/decide`, { approve: true, shown: first.task.shown })).status, 409);
  assert.equal((await ana.browser.json(`/api/proposals/${asked}/decide`, { approve: false })).status, 200);
  assert.match((await claude.call('read', { ref: `proposal:${asked}` })).text, /decided not to share it/);
  await remember({ ref: `task:${next}`, done: true });
  assert.match((await act({ task: `task:${next}` })).text, /That task is done/);

  // Nor from a space in the personal tree, and straight against the database, only an open task
  // of the person's own, in its own space, with a shared side, and never as a request.
  const side = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Side', parentId: ana.personalSpaceId }));
  const sideTask = idOf((await claude.call('remember', { space: `space:${side}`, task: { title: 'Sort the receipts' } })).text);
  assert.match((await act({ task: `task:${sideTask}` })).text, /personal space has no shared side/);
  const open = idOf((await remember({ title: 'Call the printer' })).text);
  const insert = (space: string, taskId: string, request = false) =>
    as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`
      insert into proposals (space_id, private_to, action, task_id, change, request)
      values (${space}::uuid, ${ana.id}::uuid, 'share task', ${taskId}::uuid, '{}', ${request})
    `);
  await assert.rejects(insert(side, sideTask), refused);
  await assert.rejects(insert(acme, next), refused, 'a done task');
  await assert.rejects(insert(ana.personalSpaceId, open), refused, 'another space');
  await assert.rejects(insert(acme, open, true), { code: '23514' });
});
