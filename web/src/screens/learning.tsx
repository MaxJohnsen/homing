import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { MapLines, RouteList } from '@/components/proposal';
import { capitalize, count, dateOf, focusRing } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { EstimateData, LearningData, PlaceData, SenderData } from '@/lib/connections';
import { usd, type ModelStatement } from '@/lib/model';
import { Link } from '@/lib/router';
import { Pager, pageSize } from '@/screens/pages';

/** What you do about learning from something of yours. Each resolves to a message to show, or nothing when it worked. */
export interface LearningActions {
  /** Works out what learning back to a day may cost. Nothing is learned yet. */
  estimate: (placeId: string, since: string) => Promise<string | undefined>;
  /** Starts what was estimated, with its limit in dollars: that far back, with the estimate that was shown, and nothing else. */
  start: (placeId: string, limit: string, since: string, estimated: string) => Promise<string | undefined>;
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
  /** Tries again what was set aside for something that may pass, such as the provider failing on it. */
  tryAgain: (placeId: string, reason: string) => Promise<string | undefined>;
  /** Has Homing look at who writes there, back to a day, which a map is worked out from. It needs no model. */
  summarize: (placeId: string, since: string) => Promise<string | undefined>;
  /** Has Homing's own model suggest a map, which then waits for you to approve. Resolves to what went wrong, or to something to tell you about what it suggested. */
  suggestMap: (placeId: string) => Promise<{ problem?: string; note?: string }>;
  /** Everyone who sent what was set aside for a reason, most first, fifty at a time, or those whose address holds the search. A message when it couldn't be read. */
  senders: (placeId: string, reason: string, search: string, from: number) => Promise<{ senders: SenderData[]; total: number } | string>;
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
export function Learning({ place, here, model, ceiling, actions }: {
  place: PlaceData;
  /** The space it's connected in, as it's said in a sentence, where everything goes without a map. */
  here: string;
  model: ModelStatement | null | undefined;
  ceiling?: number;
  actions?: LearningActions;
}) {
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
  // A run that was only looked at, for who writes there, has nothing estimated yet.
  if (!run || (run.state === 'estimating' && (open === 'scope' || !run.estimate))) {
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
            onSave={(limit) => act(() => actions.start(place.id, limit, run.since, run.estimate!.at))}
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
            <SetAside
              run={run}
              busy={busy}
              onKeep={(sender) => act(() => actions.leaveOut(place.id, run.leftOut.senders, run.leftOut.folders, [...run.leftOut.kept, sender]), 'set aside')}
              onRetry={(reason) => act(() => actions.tryAgain(place.id, reason), 'set aside')}
              load={(reason, search, from) => actions.senders(place.id, reason, search, from)}
              onClose={() => setOpen(undefined)}
            />
          </Panel>
        )}
      </>
    );
  }

  return (
    <>
      {place.summarizes && <WhereItGoes place={place} here={here} words={words} model={model} actions={actions} />}
      <section aria-label={`Learning from ${place.connection.address}`} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
        <h3 className="text-base font-semibold">{run && run.state !== 'estimating' ? `Learning from this ${words.place}` : `Learn from this ${words.place}`}</h3>
        {body}
        {problem && <FieldError>{problem}</FieldError>}
      </section>
    </>
  );
}

/**
 * Where the mail in something of yours goes: its map, line by line as a proposal shows one, and
 * the senders no route names. Without a map, where everything goes and how to get one. A map is
 * worked out from who writes there, which Homing looks at here without a model, and it changes
 * only through a proposal you approve: from your assistant, or from Homing's own model where one
 * is set up. While one is being suggested, or waits for you, it says so.
 */
function WhereItGoes({ place, here, words, model, actions }: { place: PlaceData; here: string; words: Words; model: ModelStatement | null | undefined; actions?: LearningActions }) {
  const run = place.learning;
  const [busy, setBusy] = useState<'looking' | 'suggesting'>();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [note, setNote] = useState<string>();
  const look = async (since: string) => {
    if (!actions) return;
    setBusy('looking');
    const answer = await actions.summarize(place.id, since);
    setBusy(undefined);
    setProblem(answer);
    if (!answer) setAsking(false);
  };
  const suggest = async () => {
    if (!actions) return;
    setBusy('suggesting');
    setNote(undefined);
    const answer = await actions.suggestMap(place.id);
    setBusy(undefined);
    setProblem(answer.problem);
    setNote(answer.note);
  };
  const mapped = run?.mapped;
  const unplaced = run?.notPlaced ?? { senders: [], more: 0 };
  const looked = run?.summary && run.summarized ? { ...run.summary, at: run.summarized } : undefined;
  const looking = run?.summarizing === true;
  const suggesting = busy === 'suggesting' || run?.suggesting === true;
  const waiting = run?.waiting ?? undefined;
  // Who can propose a map: your assistant always, and Homing's own model where one is set up, once Homing has looked at who writes.
  const suggests = Boolean(model) && looked !== undefined && !looking;
  const propose = (what: string) => `ask your assistant to propose ${what}${suggests ? ', or have Homing suggest one' : ''}`;
  const back = (since: string) => (since.startsWith('1990') ? 'as far back as it goes' : `back to ${dateOf(since)}`);

  return (
    <section aria-label={`Where the mail in ${place.connection.address} goes`} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
      <h3 className="text-base font-semibold">Where its mail goes</h3>
      {mapped ? (
        <RouteList map={{ ...mapped, words }} />
      ) : (
        <p className="text-base">
          There’s no map yet, so everything goes to {here}
          {waiting || suggesting || looking ? '.' : looked ? `: ${propose('one')}.` : `: to get one, first have Homing look at who writes here.`}
        </p>
      )}
      {unplaced.senders.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold">Not placed</span>
          <MapLines rows={unplaced.senders.map((one) => ({ key: one.sender, line: one.sender, holds: count(one.items, words.item, words.items) }))} />
          {unplaced.more > 0 && <p className="text-sm text-muted-foreground">And {count(unplaced.more, 'more sender', 'more senders')}.</p>}
        </div>
      )}
      {waiting ? (
        <div className="flex flex-col gap-1">
          <p className="text-base">A map waits for you to approve. Nothing changes until you do.</p>
          <Link href={`/proposals/${waiting}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>Review the map</Link>
        </div>
      ) : suggesting ? (
        <p role="status" className="text-base">Homing’s model is working out a map. It waits for you here once it’s made, and nothing changes until you approve it.</p>
      ) : mapped ? (
        <p className="text-sm text-muted-foreground">
          {unplaced.senders.length > 0
            ? `No route names them, so their mail goes where everything else does. To place them, ${propose('a change to the map')}.`
            : `The map changes only when you approve a new one: ${propose('a change')}.`}
        </p>
      ) : null}
      {looking ? (
        <p role="status" className="text-sm text-muted-foreground">
          Homing is looking at who writes here{looked ? ' again' : ''}, {back(run!.since)}. It uses no model and reads no {words.item}’s text, and a large {words.place} takes a few minutes.
        </p>
      ) : run?.summaryFailed ? (
        <p className="text-sm text-destructive">Homing couldn’t look at who writes here: {place.connection.service} or Homing kept failing, so it gave up.</p>
      ) : looked ? (
        <p className="text-sm text-muted-foreground">
          Homing looked at who writes here on {dateOf(looked.at)}, {back(looked.since)}: {count(looked.emails, words.item, words.items)} from {count(looked.senders, 'sender', 'senders')}.
          {mapped && ' What each line holds goes by that.'}
        </p>
      ) : (
        !mapped && <p className="text-sm text-muted-foreground">It counts who writes, how much and when, without a model and without reading any {words.item}’s text.</p>
      )}
      {actions && !asking && !looking && !suggesting && (
        <div className="flex flex-wrap gap-2">
          {suggests && !waiting && <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={suggest}>Suggest a map</Button>}
          <Button variant="outline" size="sm" disabled={busy !== undefined} onClick={() => (run ? look(run.since) : setAsking(true))}>
            {looked || run?.summaryFailed ? 'Look again' : 'Look at who writes here'}
          </Button>
        </div>
      )}
      {actions && asking && (
        <Panel label="Look at who writes here">
          <ScopeForm label="How far back should it look?" action="Look at who writes here" busy={busy === 'looking'} onChoose={look} onCancel={() => setAsking(false)} />
        </Panel>
      )}
      {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
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
  const partly = run.followedPartly ? ` This ${words.place} has more folders than Homing follows, so what arrives in some of them isn’t learned from.` : '';
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
      return `Homing has learned from its history${run.extending ? '' : `, ${back}`}, and keeps learning from what arrives.${partly}${added}${waiting}`;
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

type Senders = (reason: string, search: string, from: number) => Promise<{ senders: SenderData[]; total: number } | string>;

/**
 * What was set aside, by why, with who sent it, a way to learn from a sender whose mail only looked
 * like a newsletter, and a way to try again what the provider or the service failed on.
 */
function SetAside({ run, busy, onKeep, onRetry, load, onClose }: {
  run: LearningData;
  busy: boolean;
  onKeep: (sender: string) => void;
  onRetry: (reason: string) => void;
  load: Senders;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">What Homing set aside without learning from it, and who it was from. If a sender’s mail only looks like a newsletter, Homing can learn from them all the same.</p>
      <ul className="flex flex-col gap-3">
        {run.setAside.map((aside) => <Reason key={aside.reason} aside={aside} busy={busy} onKeep={onKeep} onRetry={onRetry} load={load} />)}
      </ul>
      <div><Button variant="outline" size="sm" disabled={busy} onClick={onClose}>Close</Button></div>
    </div>
  );
}

/**
 * What was set aside for one reason: who sent the most of it, and on request everyone who did,
 * fifty at a time, with a field that finds a sender among them.
 */
function Reason({ aside, busy, onKeep, onRetry, load }: {
  aside: LearningData['setAside'][number];
  busy: boolean;
  onKeep: (sender: string) => void;
  onRetry: (reason: string) => void;
  load: Senders;
}) {
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(0);
  const [found, setFound] = useState<{ senders: SenderData[]; total: number; search: string }>();
  const [problem, setProblem] = useState<string>();
  const loading = useRef(load);
  loading.current = load;
  // Read again when what's set aside changes, such as after learning from a sender.
  useEffect(() => {
    if (!all) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const answer = await loading.current(aside.reason, search, from);
      if (stale) return;
      if (typeof answer === 'string') return setProblem(answer);
      setProblem(undefined);
      setFound({ ...answer, search });
    }, search === found?.search ? 0 : 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [all, search, from, aside.reason, aside.items]);
  const keeps = aside.reason === 'newsletter' || aside.reason === 'automated';
  const senders = all && found ? found.senders : aside.senders;
  const more = aside.more ?? 0;
  return (
    <li className="flex flex-col gap-2">
      <span className="text-base font-semibold">{capitalize(aside.words)}</span>
      {aside.retry && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="min-w-0 text-muted-foreground">Homing tries these again by itself, once, a day after it set them aside.</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onRetry(aside.reason)}>Try again</Button>
        </div>
      )}
      {all && (
        <Input
          type="search"
          aria-label={`Find a sender among the ${aside.words}`}
          placeholder="Find a sender"
          className="h-11 text-base md:text-base sm:max-w-xs"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setFrom(0);
          }}
        />
      )}
      {all && found && found.total > 0 && <Pager total={found.total} from={from} onChange={setFrom} noun={['sender', 'senders']} />}
      {all && found && found.total === 0 && <p className="text-sm text-muted-foreground">No sender here has “{found.search.trim()}” in their address.</p>}
      {senders.length > 0 && (
        <ul className="flex flex-col gap-1">
          {senders.map((one) => (
            <li key={one.sender} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">{one.sender}, {thousands(one.items)}</span>
              {keeps && <Button variant="outline" size="sm" disabled={busy} onClick={() => onKeep(one.sender)}>Learn from this sender</Button>}
            </li>
          ))}
        </ul>
      )}
      {all && found && found.total > pageSize && <Pager total={found.total} from={from} onChange={setFrom} noun={['sender', 'senders']} />}
      {!all && more > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="min-w-0 text-muted-foreground">And {count(more, 'more sender', 'more senders')}.</span>
          <Button variant="outline" size="sm" onClick={() => setAll(true)}>Show all senders</Button>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}
