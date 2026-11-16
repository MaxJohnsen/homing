import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { capitalize, count, dateOf, focusRing } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { EstimateData, LearningData, PlaceData } from '@/lib/connections';
import { usd, type ModelStatement } from '@/lib/model';

/** What you do about learning from something of yours. Each resolves to a message to show, or nothing when it worked. */
export interface LearningActions {
  /** Works out what learning back to a day may cost. Nothing is learned yet. */
  estimate: (placeId: string, since: string) => Promise<string | undefined>;
  /** Starts what was estimated, with its limit in dollars. */
  start: (placeId: string, limit: string) => Promise<string | undefined>;
  pause: (placeId: string) => Promise<string | undefined>;
  resume: (placeId: string) => Promise<string | undefined>;
  /** Works out what learning further back would add. Nothing changes yet. */
  estimateExtension: (placeId: string, since: string) => Promise<string | undefined>;
  /** Lets go of what was worked out, without learning further back. */
  forgetExtension: (placeId: string) => Promise<string | undefined>;
  /** Learns further back too, from only what that adds, once that was estimated. */
  extend: (placeId: string, since: string) => Promise<string | undefined>;
  /** Sets its limit in dollars, which resumes it when it was paused there. */
  setLimit: (placeId: string, limit: string) => Promise<string | undefined>;
  /** Sets the senders and folders it leaves out, and the senders it learns from whatever their mail says about itself. */
  leaveOut: (placeId: string, senders: string[], folders: string[], kept: string[]) => Promise<string | undefined>;
}

/** How far back learning can go, by how many months, with everything last. */
const scopes: { value: string; label: string; months: number | null }[] = [
  { value: '3', label: 'The last 3 months', months: 3 },
  { value: '12', label: 'The last year', months: 12 },
  { value: '24', label: 'The last 2 years', months: 24 },
  { value: '60', label: 'The last 5 years', months: 60 },
  { value: 'all', label: 'Everything in it', months: null },
];

/** The day a scope goes back to, as YYYY-MM-DD. */
function sinceOf(scope: (typeof scopes)[number], now = new Date()): string {
  if (scope.months === null) return '1990-01-02';
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - scope.months, now.getUTCDate()));
  return day.toISOString().slice(0, 10);
}

const thousands = (value: number) => value.toLocaleString('en-US');
const selectStyle = 'h-11 w-full rounded-4xl border border-input bg-card px-3.5 text-base disabled:opacity-50 sm:max-w-xs';
type Words = { place: string; item: string; items: string; thread: string };

/**
 * Learning from something of yours in a space, such as your mailbox: starting it with how far back
 * it goes, after what that may cost, then how far it is, what it set aside and from whom, what it
 * spent against its limit, and pausing, resuming, extending it and leaving things out. Only you
 * see any of it.
 */
export function Learning({ place, model, ceiling, actions }: { place: PlaceData; model: ModelStatement | null | undefined; ceiling?: number; actions?: LearningActions }) {
  const words: Words = place.words ?? { place: 'place', item: 'item', items: 'items', thread: 'thread' };
  const run = place.learning;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [open, setOpen] = useState<'scope' | 'extend' | 'limit' | 'leave out' | 'set aside'>();
  const act = async (action: () => Promise<string | undefined>, then?: typeof open) => {
    setBusy(true);
    const answer = await action();
    setBusy(false);
    setProblem(answer);
    if (!answer) setOpen(then);
    return answer;
  };
  if (!place.learns || run?.state === 'done') return null;
  const most = ceiling === undefined ? '' : ` A run may spend at most ${usd(ceiling)} here, which whoever looks after Homing sets.`;
  const leaveOut = run && actions && (
    <Panel label="Leave something out">
      <LeaveOut run={run} words={words} busy={busy} onSave={(senders, folders, kept) => act(() => actions.leaveOut(place.id, senders, folders, kept))} onCancel={() => setOpen(undefined)} />
    </Panel>
  );

  let body: ReactNode;
  if (!run || (run.state === 'estimating' && open === 'scope')) {
    body = !model ? (
      <p className="text-sm text-muted-foreground">Homing has no model set up, so it can’t learn from this {words.place} yet. Whoever looks after Homing can set one up.</p>
    ) : (
      <>
        <p className="text-sm text-muted-foreground">
          Homing reads through this {words.place} and keeps what it learns as notes only you see, each with the {words.items} it came from. It sends the {words.items} it learns
          from to {model.provider} ({model.cheaper}) to understand them, and sets aside newsletters and automated mail without sending them. You see what it may cost before
          anything starts.
        </p>
        {actions && <ScopeForm label="How far back should it learn?" action="See what it would cost" busy={busy} from={run?.since} onChoose={(since) => act(() => actions.estimate(place.id, since))} />}
      </>
    );
  } else if (run.state === 'estimating') {
    body = (
      <>
        {run.estimate && <EstimateText estimate={run.estimate} words={words} service={place.connection.service} model={model} />}
        {(run.leftOut.senders.length > 0 || run.leftOut.folders.length > 0) && (
          <p className="text-sm text-muted-foreground">It leaves out {leftOutWords(run)}.</p>
        )}
        {actions && run.estimate && open !== 'leave out' && (
          <LimitForm
            label="Limit for this run, in dollars"
            value={run.estimate.limit}
            action="Start learning"
            primary
            busy={busy}
            hint={`Homing pauses the run before a call could take it past the limit. You can raise it later, and it carries on from where it paused.${most}`}
            onSave={(limit) => act(() => actions.start(place.id, limit))}
            aside={
              <>
                <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => setOpen('scope')}>Change how far back</Button>
                <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => setOpen('leave out')}>Leave something out</Button>
              </>
            }
          />
        )}
        {open === 'leave out' && leaveOut}
      </>
    );
  } else {
    const active = run.state === 'learning history' || run.state === 'following';
    const atLimit = (run.state === 'paused' && run.reason === 'limit') || (active && run.waitingAtLimit === true);
    const canResume = run.state === 'paused' && run.reason === 'person';
    body = (
      <>
        <p className="text-base">{standing(run, words, place.connection.service)}</p>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            {run.learned
              ? `Learned from ${count(run.threads, words.thread, `${words.thread}s`)}, ${count(run.learned, words.item, words.items)} in all.`
              : `Nothing learned from yet.`}
            {run.setAside.length > 0 && ` Set aside: ${run.setAside.map((aside) => aside.words).join(', ')}.`}
            {(run.again ?? 0) > 0 && ` ${capitalize(count(run.again ?? 0, words.item, words.items))} set aside before will be learned from after all.`}
          </p>
          <p>
            Its history has cost {usd(run.spent)} of its {usd(run.limit)} limit.
            {run.followed > 0 && ` What arrived since has cost ${usd(run.followed)}, which counts against Homing’s monthly limit.`}
          </p>
          {!model && <p>Homing has no model set up now, so it waits.</p>}
        </div>
        {actions && !open && !run.proposed && (
          <div className="flex flex-wrap gap-2">
            {active && <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => actions.pause(place.id))}>Pause</Button>}
            {canResume && <Button size="sm" disabled={busy} onClick={() => act(() => actions.resume(place.id))}>Resume</Button>}
            {atLimit && <Button size="sm" disabled={busy} onClick={() => setOpen('limit')}>Raise the limit</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('extend')}>Learn further back</Button>
            {!atLimit && <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('limit')}>Change the limit</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('leave out')}>Leave something out</Button>
            {run.setAside.length > 0 && <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('set aside')}>What was set aside</Button>}
          </div>
        )}
        {actions && open === 'extend' && !run.proposed && (
          <Panel label="Learn further back">
            <p className="text-sm">Homing learns from what that adds, and from nothing twice. You see what it may cost first.</p>
            <ScopeForm label="How far back?" action="See what it would cost" busy={busy} from={run.since} further onChoose={(since) => act(() => actions.estimateExtension(place.id, since), 'extend')} onCancel={() => setOpen(undefined)} />
          </Panel>
        )}
        {actions && run.proposed && (
          <Panel label="Learn further back">
            <EstimateText estimate={run.proposed} words={words} service={place.connection.service} model={model} />
            <p className="text-sm text-muted-foreground">
              Its limit stays {usd(run.limit)}, with {usd(Math.max(0, run.limit - run.spent))} left. There, what you added waits until you raise the limit
              {run.caughtUp ? ', and Homing keeps learning from what arrives.' : '.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => act(() => actions.extend(place.id, run.proposed!.since.slice(0, 10)))}>Learn further back</Button>
              <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => act(() => actions.forgetExtension(place.id))}>Not now</Button>
            </div>
          </Panel>
        )}
        {actions && open === 'limit' && (
          <Panel label="Change the limit">
            <LimitForm
              label="Limit for its history, in dollars"
              value={run.limit}
              action={run.state === 'paused' && run.reason === 'limit' ? 'Raise and resume' : atLimit ? 'Raise the limit' : 'Change the limit'}
              primary={atLimit}
              busy={busy}
              hint={`${atLimit ? 'It carries on from where it stopped, and nothing is learned from twice.' : 'Homing pauses the run before a call could take it past the limit.'}${most}`}
              onSave={(limit) => act(() => actions.setLimit(place.id, limit))}
              onCancel={() => setOpen(undefined)}
            />
          </Panel>
        )}
        {open === 'leave out' && leaveOut}
        {actions && open === 'set aside' && (
          <Panel label="What was set aside">
            <SetAside run={run} busy={busy} onKeep={(sender) => act(() => actions.leaveOut(place.id, run.leftOut.senders, run.leftOut.folders, [...run.leftOut.kept, sender]), 'set aside')} onClose={() => setOpen(undefined)} />
          </Panel>
        )}
      </>
    );
  }

  return (
    <section aria-label={`Learning from ${place.connection.address}`} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
      <h3 className="text-base font-semibold">{run && run.state !== 'estimating' ? `Learning from this ${words.place}` : `Learn from this ${words.place}`}</h3>
      {body}
      {problem && <FieldError>{problem}</FieldError>}
    </section>
  );
}

/** "threads with mail from news@shop.example and the folder Receipts" */
function leftOutWords(run: LearningData): string {
  const parts = [
    run.leftOut.senders.length > 0 && `threads with mail from ${run.leftOut.senders.join(', ')}`,
    run.leftOut.folders.length > 0 && `${run.leftOut.folders.length === 1 ? 'the folder' : 'the folders'} ${run.leftOut.folders.join(', ')}`,
  ].filter(Boolean);
  return parts.join(' and ');
}

/** Where a run stands, as a sentence or two. */
function standing(run: LearningData, words: { place: string }, service: string): string {
  const back = run.since.startsWith('1990') ? 'as far back as it goes' : `back to ${dateOf(run.since)}`;
  const upTo = run.learnedUpTo ? ` It’s up to ${dateOf(run.learnedUpTo)}.` : '';
  const waiting =
    run.waitingFor === 'provider'
      ? ' Right now it’s waiting for the model’s provider, which isn’t answering. Homing keeps trying by itself.'
      : run.waitingFor === 'system'
        ? ` Right now it’s waiting for ${service}, which isn’t answering. Homing keeps trying by itself.`
        : run.waitingFor === 'error'
          ? ' Right now something in Homing keeps failing. It tries again by itself, and whoever looks after Homing can see why in its log.'
          : '';
  const added = run.extending
    ? run.waitingAtLimit
      ? ` What you added, ${dateOf(run.extending.since)} to ${dateOf(run.extending.until)}, waits at its limit of ${usd(run.limit)}. Raise the limit to learn from it.`
      : ` It’s also learning from what you added, ${dateOf(run.extending.since)} to ${dateOf(run.extending.until)}.`
    : '';
  switch (run.state) {
    case 'learning history':
      return (
        (run.extending
          ? `Homing is learning from what you added, ${dateOf(run.extending.since)} to ${dateOf(run.extending.until)}.`
          : `Homing is learning from its history, ${back}.${run.learnedUpTo ? ` So far it’s up to ${dateOf(run.learnedUpTo)}.` : ''}`) + waiting
      );
    case 'following':
      return `Homing has learned from its history${run.extending ? '' : `, ${back}`}, and keeps learning from what arrives.${added}${waiting}`;
    case 'paused':
      if (run.reason === 'limit') return `Paused at its limit of ${usd(run.limit)}.${upTo} Raise the limit to carry on from there.`;
      if (run.reason === 'monthly limit') return 'Paused, because Homing’s monthly limit for learning is reached. It carries on when whoever looks after Homing raises it, or next month.';
      if (run.reason === 'model processing off') return 'Waiting, because model processing is off in this space, so nothing is sent to a model. It carries on by itself once it’s turned on, in the space’s Settings.';
      return `Paused.${upTo} It carries on from there when you resume it.`;
    case 'needs attention':
      if (run.reason === 'sign in again') return `Waiting for you to sign in again. It carries on by itself once you have.`;
      return `Stopped, because this Homing isn’t set up to reach ${service} any more.`;
    default:
      return `Homing learned from this ${words.place}.`;
  }
}

/** "Microsoft 365 counts 4,812 emails since November 15, 2024. About 1,900 need no model…" */
function estimateSentence(estimate: EstimateData, words: { item: string; items: string; thread: string }, service: string): string {
  const range = estimate.until ? `from ${dateOf(estimate.since)} to ${dateOf(estimate.until)}` : estimate.since.startsWith('1990') ? 'in it' : `since ${dateOf(estimate.since)}`;
  if (estimate.items === 0) return `${service} counts no ${words.items} ${range}, so there’s nothing there to learn from yet.`;
  return (
    `${service} counts ${count(estimate.items, words.item, words.items)} ${range}. About ${thousands(estimate.setAside)} of them need no model and are set aside, ` +
    `and the rest make about ${count(estimate.threads, words.thread, `${words.thread}s`)} for the model to read.`
  );
}

/** An estimate in sentences, with the cost and that it's rough. */
function EstimateText({ estimate, words, service, model }: { estimate: EstimateData; words: { item: string; items: string; thread: string }; service: string; model: ModelStatement | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base">{estimateSentence(estimate, words, service)}</p>
      {estimate.items > 0 && (
        <>
          <p className="text-base font-semibold">
            Estimated model cost: {usd(estimate.low)} to {usd(estimate.high)}{model ? `, with ${model.cheaper} at ${model.provider}` : ''}.
          </p>
          <p className="text-sm text-muted-foreground">
            This is a rough estimate. It goes by that count and a sample of {count(estimate.sampled, words.item, words.items)}, and the rest may be longer or shorter.
          </p>
        </>
      )}
    </div>
  );
}

/** A group that opens in place, a step up from the block it's in. */
function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3 rounded-lg bg-card p-3">
      {children}
    </div>
  );
}

/** Choosing how far back, then one button. With further, only what goes further back than it does now. */
function ScopeForm({ label, action, busy, from, further, onChoose, onCancel }: {
  label: string;
  action: string;
  busy: boolean;
  /** How far back it goes now. */
  from?: string;
  further?: boolean;
  onChoose: (since: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const offered = further && from ? scopes.filter((scope) => sinceOf(scope) < from.slice(0, 10)) : scopes;
  const [chosen, setChosen] = useState(offered.find((scope) => scope.value === '12')?.value ?? offered[0]?.value);
  const scope = offered.find((one) => one.value === chosen);
  if (offered.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">It already learns from everything in it.</p>
        {onCancel && <div><Button variant="outline" size="sm" autoFocus onClick={onCancel}>Close</Button></div>}
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (scope) onChoose(sinceOf(scope));
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <select id={id} value={chosen} disabled={busy} onChange={(event) => setChosen(event.target.value)} className={cn(selectStyle, focusRing)}>
          {offered.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !scope}>{busy ? 'Counting…' : action}</Button>
        {onCancel && <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** A limit in dollars, and the button that saves it. */
function LimitForm({ label, value, action, primary, busy, hint, onSave, onCancel, aside }: {
  label: string;
  value: number;
  action: string;
  primary?: boolean;
  busy: boolean;
  hint: string;
  onSave: (limit: string) => void;
  onCancel?: () => void;
  aside?: ReactNode;
}) {
  const id = useId();
  const [limit, setLimit] = useState(String(value));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSave(limit.trim());
      }}
      noValidate
    >
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input id={id} inputMode="decimal" className="h-11 text-base md:text-base sm:max-w-40" value={limit} onChange={(event) => setLimit(event.target.value)} disabled={busy} aria-describedby={`${id}-hint`} />
      </Field>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="submit" variant={primary ? 'default' : 'outline'} size="lg" className="h-11 text-base sm:px-5" disabled={busy || !limit.trim()}>{action}</Button>
        {aside}
        {onCancel && <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** Senders and folders to leave out, and senders to learn from all the same, one on each line. */
function LeaveOut({ run, words, busy, onSave, onCancel }: {
  run: LearningData;
  words: { items: string; thread: string };
  busy: boolean;
  onSave: (senders: string[], folders: string[], kept: string[]) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [senders, setSenders] = useState(run.leftOut.senders.join('\n'));
  const [folders, setFolders] = useState(run.leftOut.folders.join('\n'));
  const [kept, setKept] = useState(run.leftOut.kept.join('\n'));
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSave(lines(senders), lines(folders), lines(kept));
      }}
    >
      <p className="text-sm">
        A {words.thread} with any mail from a sender you leave out is set aside whole, your own replies in it too, and nothing of it is sent to a model. So are {words.items} in
        a folder you leave out. Take one off the list, and what was set aside for it is learned from after all.
      </p>
      <Field>
        <FieldLabel htmlFor={`${id}-senders`}>Senders to leave out, one on each line</FieldLabel>
        <Textarea id={`${id}-senders`} value={senders} onChange={(event) => setSenders(event.target.value)} disabled={busy} placeholder="An address, or a domain such as shop.example" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-folders`}>Folders to leave out, one on each line</FieldLabel>
        <Textarea id={`${id}-folders`} value={folders} onChange={(event) => setFolders(event.target.value)} disabled={busy} placeholder="A folder’s name, such as Receipts" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-kept`}>Senders to learn from even when their mail looks like a newsletter</FieldLabel>
        <Textarea id={`${id}-kept`} value={kept} onChange={(event) => setKept(event.target.value)} disabled={busy} placeholder="An address, or a domain" />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy}>Save</Button>
        <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** What was set aside, by why, with who sent it, and a way to learn from a sender whose mail only looked like a newsletter. */
function SetAside({ run, busy, onKeep, onClose }: { run: LearningData; busy: boolean; onKeep: (sender: string) => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">What Homing set aside without sending it to a model, and who it was from. If a sender’s mail only looks like a newsletter, Homing can learn from them all the same.</p>
      <ul className="flex flex-col gap-3">
        {run.setAside.map((aside) => (
          <li key={aside.reason} className="flex flex-col gap-1">
            <span className="text-base font-semibold">{capitalize(aside.words)}</span>
            {aside.senders.length > 0 && (
              <ul className="flex flex-col gap-1">
                {aside.senders.map((one) => (
                  <li key={one.sender} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{one.sender}, {thousands(one.items)}</span>
                    {(aside.reason === 'newsletter' || aside.reason === 'automated') && (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => onKeep(one.sender)}>Learn from this sender</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div><Button variant="outline" size="sm" disabled={busy} onClick={onClose}>Close</Button></div>
    </div>
  );
}
