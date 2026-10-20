// Issue #6, Homing's own tasks (spec §7). An assistant keeps the user's private tasks with
// `remember`, marks them done there, and sees the open ones in `context`. In the app, people add
// tasks for themselves or the space, tick them off, and share their own. Only people write on the
// shared side, and a task goes only to someone who can open its space.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member;
let acme: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

type TaskRow = { id: string; title: string; due: string | null; shared: boolean; assignee: { name: string } | null; done: { by: { name: string } | null } | null; agent: string | null };
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
  assert.ok((await tasksAs(cara)).open.some((task) => task.title === 'Prepare the steering group'));
  // Shared now, it's the space's: the assistant leaves it to people.
  assert.match((await remember({ ref: `task:${id}`, done: true })).text, /people change shared tasks in Homing/);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`insert into tasks (space_id, title) values (${acme}::uuid, 'Hello')`), refused);
  // Nothing to share from a personal space.
  const mine = await ana.browser.json(`/api/spaces/${ana.personalSpaceId}/tasks`, { title: 'Water the plants' });
  assert.equal((await ana.browser.json(`/api/tasks/${mine.body.id}/share`, {})).status, 404);
});
