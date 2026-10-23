// Homing's own tasks (spec §7): a title, an optional description, open or done, an optional due
// date and assignee, in a space, on its shared side or someone's private side. Assistants keep the
// person's private tasks with `remember`; people also write and share them in the app.

import { personOf, type Session } from './db.ts';
import { checkSpace, sideOf, termsOf, visible, type Imported, type ImportedPerson } from './knowledge.ts';
import { spaceView } from './spaces.ts';

export interface Task {
  id: string;
  spaceId: string;
  /** The person whose private task it is, or null when it's the space's. */
  privateTo: string | null;
  title: string;
  description: string | null;
  /** The day it's due, as YYYY-MM-DD, if it has one. */
  due: string | null;
  assignee: string | null;
  doneAt: Date | null;
  doneBy: string | null;
  writtenBy: string | null;
  agent: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Where it came from, if it was imported, with who wrote it, had it and finished it there, by name. */
  imported: (Imported & { assignee?: ImportedPerson; doneBy?: ImportedPerson }) | null;
}

const columns = (s: Session) =>
  s.tx`id, space_id, private_to, title, description, to_char(due, 'YYYY-MM-DD') as due, assignee, done_at, done_by, written_by, agent, created_at, updated_at, imported`;

/** A day as YYYY-MM-DD that is a real date, or a refusal in words. */
export function dayOf(value: string): string {
  const day = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new TaskRefused('Give the due date as a day, such as 2026-11-14.');
  }
  return day;
}

/** A task Homing won't write as asked, with the reason in words, and the field it's about if one is. */
export class TaskRefused extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

/** A title on one line, within its length. */
function titleOf(value: string): string {
  const title = value.replace(/\s+/g, ' ').trim();
  if (!title) throw new TaskRefused('Say what the task is.', 'title');
  if (title.length > 200) throw new TaskRefused('Keep the task to 200 characters; more goes in its description.', 'title');
  return title;
}

function descriptionOf(value: string | null | undefined): string | null {
  const description = value?.trim() || null;
  if (description && description.length > 20000) throw new TaskRefused('Keep the description to 20,000 characters.', 'description');
  return description;
}

/**
 * Who a task can go to: on the space's shared side, someone the person sees among its members, and
 * on their private side, only themselves. Asking about anyone else says nothing about who has the space.
 */
async function checkAssignee(s: Session, spaceId: string, privateTo: string | null, assignee: string | null | undefined): Promise<void> {
  if (!assignee) return;
  const fits = privateTo ? assignee === privateTo : Boolean((await spaceView(s, spaceId))?.members.some((member) => member.id === assignee));
  if (!fits) throw new TaskRefused(privateTo ? 'A task only you see is only for you.' : 'They can’t open this space, so they can’t be given the task.', 'assignee');
}

/** Adds a task to a space: yours unless shared, which only a person does directly. */
export async function addTask(
  s: Session,
  input: { spaceId: string; title: string; description?: string; due?: string; assignee?: string; shared?: boolean },
): Promise<Task> {
  const title = titleOf(input.title);
  const description = descriptionOf(input.description);
  await checkSpace(s, input.spaceId, input.shared);
  const privateTo = sideOf(s, input.shared);
  await checkAssignee(s, input.spaceId, privateTo, input.assignee);
  const [task] = await s.tx<Task[]>`
    insert into tasks (space_id, private_to, title, description, due, assignee)
    values (${input.spaceId}::uuid, ${privateTo}::uuid, ${title}, ${description},
            ${input.due ? dayOf(input.due) : null}::date, ${input.assignee ?? null}::uuid)
    returning ${columns(s)}
  `;
  return task;
}

/** Changes a task the person can see and change: its words, due date or assignee, or whether it's done. */
export async function changeTask(
  s: Session,
  taskId: string,
  change: { title?: string; description?: string | null; due?: string | null; assignee?: string | null; done?: boolean },
): Promise<Task | undefined> {
  // Held until the change is done, so two people changing it at once don't undo each other.
  const [task] = await s.tx<Task[]>`select ${columns(s)} from tasks where id = ${taskId}::uuid for update`;
  if (!task) return undefined;
  const title = change.title === undefined ? task.title : titleOf(change.title);
  const description = change.description === undefined ? task.description : descriptionOf(change.description);
  const due = change.due === undefined ? task.due : change.due === null ? null : dayOf(change.due);
  if (change.assignee !== undefined && change.assignee !== task.assignee) await checkAssignee(s, task.spaceId, task.privateTo, change.assignee);
  // Only what changes is written; the store marks when a task is done, and who did it.
  const [changed] = await s.tx<Task[]>`
    update tasks set
      title = ${title},
      description = ${description},
      due = ${due}::date,
      assignee = ${change.assignee === undefined ? task.assignee : change.assignee}::uuid,
      done_at = ${change.done === undefined ? task.doneAt : change.done ? (task.doneAt ?? new Date()) : null}
    where id = ${taskId}::uuid
    returning ${columns(s)}
  `;
  return changed;
}

/** A task the person can see. */
export async function readTask(s: Session, taskId: string): Promise<Task | undefined> {
  const [task] = await s.tx<Task[]>`select ${columns(s)} from tasks where id = ${taskId}::uuid and ${visible(s, 'tasks')}`;
  return task;
}

/**
 * A space's tasks the person can see: the open ones, soonest due first and then the oldest, and
 * the ones done in the last two weeks, most recent first.
 */
export async function tasksIn(s: Session, spaceId: string): Promise<{ open: Task[]; done: Task[] }> {
  const tasks = await s.tx<Task[]>`
    select ${columns(s)} from tasks
    where space_id = ${spaceId}::uuid and (done_at is null or done_at > now() - interval '14 days')
    order by done_at desc nulls first, due nulls last, created_at
    limit 500
  `;
  return { open: tasks.filter((task) => !task.doneAt), done: tasks.filter((task) => task.doneAt) };
}

/**
 * The tasks the person can see whose title or description matches, best match first and open
 * before done: their own private ones, and the shared ones in spaces they can open. Optionally
 * within a space and the spaces below it.
 */
export async function searchTasks(s: Session, query: string, options: { spaceId?: string; limit?: number } = {}): Promise<Task[]> {
  const terms = await termsOf(s, query);
  if (!terms) return [];
  const within = options.spaceId ? s.tx`and space_id in (select space_subtree(${options.spaceId}::uuid))` : s.tx``;
  return s.tx<Task[]>`
    select ${columns(s)} from tasks
    where search @@ to_tsquery('simple', ${terms}) and ${visible(s, 'tasks')} ${within}
    order by ts_rank(search, to_tsquery('simple', ${terms}), 1) desc, done_at is not null, created_at desc
    limit ${options.limit ?? 10}
  `;
}

/** Shares one of your private tasks with everyone in its space. Only a person does, directly. */
export async function shareTask(s: Session, taskId: string): Promise<boolean> {
  try {
    await s.tx.savepoint((sp) => sp`select share_task(${taskId}::uuid)`);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "there's no task of yours to share there") return false;
    throw error;
  }
}

/** Whether the task is the person's own, so their assistant may change it. */
export function ownTask(s: Session, task: Task): boolean {
  return task.privateTo !== null && task.privateTo === personOf(s.principal);
}
