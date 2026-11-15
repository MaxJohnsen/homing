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
  /** Learns further back too, from only what that adds. */
  extend: (placeId: string, since: string) => Promise<string | undefined>;
  /** Sets its limit in dollars, which resumes it when it was paused there. */
  setLimit: (placeId: string, limit: string) => Promise<string | undefined>;
  leaveOut: (placeId: string, senders: string[], folders: string[]) => Promise<string | undefined>;
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

/**
 * Learning from something of yours in a space, such as your mailbox: starting it with how far back
 * it goes, after what that may cost, then how far it is, what it set aside, what it spent against
 * its limit, and pausing, resuming, extending it and leaving things out. Only you see any of it.
 */
export function Learning({ place, model, actions }: { place: PlaceData; model: ModelStatement | null | undefined; actions?: LearningActions }) {
  const words = place.words ?? { place: 'place', item: 'item', items: 'items', thread: 'thread' };
  const run = place.learning;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [open, setOpen] = useState<'scope' | 'extend' | 'limit' | 'leave out'>();
  const act = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    const answer = await action();
    setBusy(false);
    setProblem(answer);
    if (!answer) setOpen(undefined);
    return answer;
  };
  if (!place.learns || run?.state === 'done') return null;

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
        {actions && run.estimate && (
          <LimitForm
            label="Limit for this run, in dollars"
            value={run.estimate.limit}
            action="Start learning"
            primary
            busy={busy}
            hint="Homing pauses the run before a call could take it past the limit. You can raise it later, and it carries on from where it paused."
            onSave={(limit) => act(() => actions.start(place.id, limit))}
            aside={<Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => setOpen('scope')}>Change how far back</Button>}
          />
        )}
      </>
    );
  } else {
    const active = run.state === 'learning history' || run.state === 'following';
    const atLimit = run.state === 'paused' && run.reason === 'limit';
    const canResume = (run.state === 'paused' && run.reason === 'person') || (run.state === 'needs attention' && run.reason === 'failing');
    body = (
      <>
        <p className="text-base">{standing(run, words, place.connection.service)}</p>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            {run.learned
              ? `Learned from ${count(run.threads, words.thread, `${words.thread}s`)}, ${count(run.learned, words.item, words.items)} in all.`
              : `Nothing learned from yet.`}
            {run.setAside.length > 0 && ` Set aside: ${run.setAside.map((aside) => aside.words).join(', ')}.`}
          </p>
          <p>
            Its history has cost {usd(run.spent)} of its {usd(run.limit)} limit.
            {run.followed > 0 && ` What arrived since has cost ${usd(run.followed)}, which counts against Homing’s monthly limit.`}
          </p>
          {!model && <p>Homing has no model set up now, so it waits.</p>}
        </div>
        {actions && !open && (
          <div className="flex flex-wrap gap-2">
            {active && <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => actions.pause(place.id))}>Pause</Button>}
            {canResume && <Button size="sm" disabled={busy} onClick={() => act(() => actions.resume(place.id))}>Resume</Button>}
            {atLimit && <Button size="sm" disabled={busy} onClick={() => setOpen('limit')}>Raise the limit</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('extend')}>Learn further back</Button>
            {!atLimit && <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('limit')}>Change the limit</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen('leave out')}>Leave something out</Button>
          </div>
        )}
        {actions && open === 'extend' && (
          <Panel label="Learn further back">
            <p className="text-sm">
              Homing learns from what that adds, and from nothing twice. Its limit stays {usd(run.limit)}, where it pauses.
              {run.estimate?.until && ` The range you added last: ${estimateSentence(run.estimate, words, place.connection.service)}`}
            </p>
            <ScopeForm label="How far back?" action="Learn further back" busy={busy} from={run.since} further onChoose={(since) => act(() => actions.extend(place.id, since))} onCancel={() => setOpen(undefined)} />
          </Panel>
        )}
        {actions && open === 'limit' && (
          <Panel label="Change the limit">
            <LimitForm
              label="Limit for its history, in dollars"
              value={run.limit}
              action={atLimit ? 'Raise and resume' : 'Change the limit'}
              primary={atLimit}
              busy={busy}
              hint={atLimit ? 'It carries on from where it paused, and nothing is learned from twice.' : 'Homing pauses the run before a call could take it past the limit.'}
              onSave={(limit) => act(() => actions.setLimit(place.id, limit))}
              onCancel={() => setOpen(undefined)}
            />
          </Panel>
        )}
        {actions && open === 'leave out' && (
          <Panel label="Leave something out">
            <LeaveOut run={run} words={words} busy={busy} onSave={(senders, folders) => act(() => actions.leaveOut(place.id, senders, folders))} onCancel={() => setOpen(undefined)} />
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

/** Where a run stands, as a sentence. */
function standing(run: LearningData, words: { place: string }, service: string): string {
  const back = `back to ${dateOf(run.since)}`;
  const upTo = run.learnedUpTo ? ` It’s up to ${dateOf(run.learnedUpTo)}.` : '';
  switch (run.state) {
    case 'learning history':
      return run.extending
        ? `Homing is learning from what you added, ${dateOf(run.extending.since)} to ${dateOf(run.extending.until)}.`
        : `Homing is learning from its history, ${back}.${run.learnedUpTo ? ` So far it’s up to ${dateOf(run.learnedUpTo)}.` : ''}`;
    case 'following':
      return `Homing has learned from its history, ${back}, and keeps learning from what arrives.`;
    case 'paused':
      if (run.reason === 'limit') return `Paused at its limit of ${usd(run.limit)}.${upTo} Raise the limit to carry on from there.`;
      if (run.reason === 'monthly limit') return 'Paused, because Homing’s monthly limit for learning is reached. It carries on when whoever looks after Homing raises it, or next month.';
      return `Paused.${upTo} It carries on from there when you resume it.`;
    case 'needs attention':
      if (run.reason === 'sign in again') return `Waiting for you to sign in again. It carries on by itself once you have.`;
      if (run.reason === 'not set up') return `Stopped, because this Homing isn’t set up to reach ${service} any more.`;
      return `Stopped after failing several times in a row. Resume it to try again from where it was.`;
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant={primary ? 'default' : 'outline'} size="lg" className="h-11 text-base sm:px-5" disabled={busy || !limit.trim()}>{action}</Button>
        {aside}
        {onCancel && <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

/** Senders and folders to leave out, one on each line. */
function LeaveOut({ run, words, busy, onSave, onCancel }: {
  run: LearningData;
  words: { items: string };
  busy: boolean;
  onSave: (senders: string[], folders: string[]) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [senders, setSenders] = useState(run.leftOut.senders.join('\n'));
  const [folders, setFolders] = useState(run.leftOut.folders.join('\n'));
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSave(lines(senders), lines(folders));
      }}
    >
      <p className="text-sm">
        {capitalize(words.items)} from these senders, or in these folders, are set aside without being sent to a model. It applies to what Homing reads from here on, and what it already learned stays.
      </p>
      <Field>
        <FieldLabel htmlFor={`${id}-senders`}>Senders, one on each line</FieldLabel>
        <Textarea id={`${id}-senders`} value={senders} onChange={(event) => setSenders(event.target.value)} disabled={busy} placeholder="An address, or a domain such as shop.example" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-folders`}>Folders, one on each line</FieldLabel>
        <Textarea id={`${id}-folders`} value={folders} onChange={(event) => setFolders(event.target.value)} disabled={busy} placeholder="A folder’s name, such as Receipts" />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy}>Save</Button>
        <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
