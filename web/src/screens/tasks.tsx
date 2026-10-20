import { useId, useState } from 'react';
import { cn } from 'cn';
import { AudienceChoice, everyoneIn, type Audience } from '@/components/audience';
import { OnlyYou } from '@/components/only-you';
import { dateOf, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SpaceData } from '@/lib/spaces';

/** A task as a space's Tasks shows it. */
export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  /** The day it's due, as YYYY-MM-DD. */
  due: string | null;
  shared: boolean;
  /** Who it's for. Someone you can't see has neither name nor id. */
  assignee: { id: string | null; name: string | null; you: boolean } | null;
  done: { at: string; by: { name: string | null; you: boolean } | null } | null;
  /** The assistant that kept it for someone, if one did. */
  agent: string | null;
}

export interface TasksData {
  open: TaskData[];
  /** Done in the last two weeks, most recent first. */
  done: TaskData[];
}

/** Changing tasks directly. Resolves to what went wrong, if anything. */
export interface TaskActions {
  add: (input: { title: string; due: string | null; shared: boolean }) => Promise<string | undefined>;
  done: (taskId: string, done: boolean) => Promise<string | undefined>;
  share: (taskId: string) => Promise<string | undefined>;
}

/**
 * What needs doing in a space (spec §7): the open tasks, soonest due first, each saying who it's
 * for and whether it's only yours, and what was done lately. Ticking one off is one click; your own
 * can be shared with everyone in the space.
 */
export function Tasks({ space, data, actions, now = new Date() }: { space: SpaceData; data: TasksData; actions?: TaskActions; now?: Date }) {
  const [adding, setAdding] = useState(false);
  const where = space.personal ? 'your personal space' : space.name;
  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Open"
        description={`What needs doing in ${where}.${space.private ? '' : ' Yours stay only yours until you share them.'} Your assistant keeps tasks for you too.`}
      >
        {actions && !adding && (
          <div>
            <Button variant="outline" onClick={() => setAdding(true)}>Add a task</Button>
          </div>
        )}
        {adding && actions && <AddTask space={space} add={actions.add} onDone={() => setAdding(false)} />}
        {data.open.length > 0 ? (
          <ul className="-mx-3 flex flex-col">
            {data.open.map((task) => <TaskRow key={task.id} task={task} space={space} actions={actions} now={now} />)}
          </ul>
        ) : (
          <p className="text-base text-muted-foreground">Nothing open. What you and your assistant keep to do shows up here.</p>
        )}
      </Section>
      {data.done.length > 0 && (
        <Section title="Done lately">
          <ul className="-mx-3 flex flex-col">
            {data.done.map((task) => <TaskRow key={task.id} task={task} space={space} actions={actions} now={now} />)}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** "Due 14 November", "Due today", "Was due 3 November". */
function dueOf(due: string, now: Date): { text: string; late: boolean } {
  const day = new Date(`${due}T12:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { text: 'Due today', late: false };
  if (days === 1) return { text: 'Due tomorrow', late: false };
  return days < 0 ? { text: `Was due ${dateOf(day.toISOString())}`, late: true } : { text: `Due ${dateOf(day.toISOString())}`, late: false };
}

function TaskRow({ task, space, actions, now }: { task: TaskData; space: SpaceData; actions?: TaskActions; now: Date }) {
  const id = useId();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    setProblem(await action());
    setBusy(false);
  };
  const due = task.due && !task.done ? dueOf(task.due, now) : undefined;
  const onlyYou = !task.shared && !space.private;
  const meta = [
    due?.text,
    task.assignee && task.shared ? `For ${task.assignee.you ? 'you' : (task.assignee.name ?? 'someone in the space')}` : undefined,
    task.done ? `Done ${dateOf(task.done.at)}${task.done.by && !task.done.by.you && task.done.by.name ? ` by ${task.done.by.name}` : ''}` : undefined,
    task.agent && !task.done ? `Kept by ${task.agent}` : undefined,
  ].filter(Boolean);

  return (
    <li className={cn('flex flex-col gap-2 rounded-xl px-3 py-3', onlyYou && 'bg-private/25')}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          className="mt-1"
          checked={Boolean(task.done)}
          disabled={!actions || busy}
          onCheckedChange={(checked) => actions && run(() => actions.done(task.id, checked === true))}
          aria-label={task.done ? `Open “${task.title}” again` : `Mark “${task.title}” done`}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={id} className={cn('text-base leading-snug font-semibold break-words', task.done && 'text-muted-foreground line-through')}>
            {task.title}
          </label>
          {task.description && !task.done && <p className="text-base whitespace-pre-line text-muted-foreground">{task.description}</p>}
          {(meta.length > 0 || onlyYou) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {onlyYou && <OnlyYou />}
              {meta.map((part, index) => (
                <span key={index} className={cn(index === 0 && due?.late && 'font-semibold text-foreground')}>{part}</span>
              ))}
            </p>
          )}
        </div>
        {actions && onlyYou && !task.done && !sharing && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setSharing(true)}>Share with {space.name}</Button>
        )}
      </div>
      {actions && onlyYou && !task.done && sharing && (
        // Said before sharing, since a shared task is the space's from then on.
        <div role="group" aria-label={`Share with ${space.name}`} className="ml-8 flex flex-col gap-3 rounded-xl bg-muted p-3">
          <p className="text-sm">Everyone in {space.name} will see it and can tick it off: {everyoneIn(space.members.length, space.reachedFromAbove).replace(/^./, (first) => first.toLowerCase())}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setSharing(false)} autoFocus>Keep it yours</Button>
            <Button disabled={busy} onClick={() => run(() => actions.share(task.id))}>Share</Button>
          </div>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}

/** A new task: what to do, when it's due if it is, and who sees it. */
function AddTask({ space, add, onDone }: { space: SpaceData; add: TaskActions['add']; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const shared = !space.private && audience === 'space';
  const save = async () => {
    setBusy(true);
    const answer = await add({ title: title.trim(), due: due || null, shared });
    setBusy(false);
    if (answer) setProblem(answer);
    else onDone();
  };

  return (
    <Section title="New task" tone="raised">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-task-title" className="text-base">What needs doing?</Label>
          <Input id="new-task-title" className="h-11 text-base md:text-base" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Such as Send Gunnar the budget" autoFocus disabled={busy} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-task-due" className="text-base">Due <span className="font-normal text-muted-foreground">(if it is)</span></Label>
          <Input id="new-task-due" type="date" className="h-11 text-base md:text-base sm:max-w-xs" value={due} onChange={(event) => setDue(event.target.value)} disabled={busy} />
        </div>
        {!space.private && <AudienceChoice space={space.name} people={space.members.length} above={space.reachedFromAbove} value={audience} onChange={setAudience} disabled={busy} surface="muted" />}
        {problem && <FieldError>{problem}</FieldError>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onDone}>Cancel</Button>
          <Button type="submit" size="lg" disabled={busy || !title.trim()}>{shared ? `Share with ${space.name}` : 'Save for you'}</Button>
        </div>
      </form>
    </Section>
  );
}
