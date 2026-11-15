// Learning from a connected place (spec §8, §11), as its owner sees and directs it. A person
// starts a run for a place of theirs, such as their mailbox, with how far back it learns, from the
// app or through their assistant. Before it starts, Homing estimates what it may cost, from how
// many items the system counts there and a small sample of them, and suggests the run's limit.
// The run then learns through the place's history and carries on with what arrives (learner.ts).
// Only its owner sees a run, its progress and what it spent, and only they raise its limit.

import postgres from 'postgres';
import { ConnectionUnusable, kindOf, Unanswered, using, type Broker } from './connections.ts';
import type { Change, Follow, Scope } from './connectors.ts';
import { personOf, withPrincipal, type Principal, type Session } from './db.ts';
import type { Interpretation } from './interpret.ts';
import { callCost, type Model } from './model.ts';
import { ownPlace, wordsOf, type Place } from './places.ts';

/** What learning needs from the server: connections, Homing's model if it has one, and how a batch is read. */
export interface Learning {
  broker: Broker;
  model?: Model;
  interpretation: Interpretation;
}

export type RunState = 'estimating' | 'learning history' | 'following' | 'paused' | 'needs attention' | 'done';
export type RunReason = 'person' | 'limit' | 'monthly limit' | 'sign in again' | 'not set up' | 'failing' | 'removed';

/** What learning from a scope may cost, as Homing estimated it before the pass. It's rough. */
export interface Estimate {
  /** The scope it's for: from when, and up to when for a scope extended further back. */
  since: string;
  until: string | null;
  /** How many items the system counts there. */
  items: number;
  /** About how many threads a model would read, and how many items need none, going by the sample. */
  threads: number;
  setAside: number;
  /** In USD: about what it costs, and at most, if the rest is like the sample. */
  low: number;
  high: number;
  /** In USD: the limit Homing suggests for the run. */
  limit: number;
  /** How many items the sample held. */
  sampled: number;
  at: string;
}

/** A learning run, as its owner sees it. */
export interface Run {
  id: string;
  place: string;
  space: string;
  connection: string;
  state: RunState;
  /** Why it's paused, needs attention or is done. */
  reason: RunReason | null;
  /** How far back it learns. */
  since: Date;
  /** How far through the place's history it is: when the latest item it passed arrived. */
  learnedUpTo: Date | null;
  /** When it first caught up with what's there. */
  caughtUpAt: Date | null;
  /** A scope extended further back that it's walking now: from when, up to when. */
  extending: { since: Date; until: Date } | null;
  /** In USD, for what it learns from history. */
  limit: number;
  estimate: Estimate | null;
  /** What its owner left out: senders by address or domain, and folders by name. */
  leftOut: { senders: string[]; folders: string[] };
  startedAt: Date | null;
}

/** How far a run has come. */
export interface Progress {
  /** In USD: what its history cost, with the worst case of its calls under way, which its limit holds; and what following cost, which the monthly limit holds. */
  spent: number;
  followed: number;
  /** How many threads it learned from, and how many items they held. */
  threads: number;
  learned: number;
  /** What it set aside, by why, most first. */
  setAside: { reason: string; items: number }[];
}

/** Learning can't do what was asked, and says why, for the person or their assistant. */
export class LearningRefused extends Error {
  override name = 'LearningRefused';
}

/** What's said when Homing has no model, wherever learning is asked for. */
export const noModel = 'Homing has no model set up, so it can’t learn from a connected source yet. Whoever looks after Homing can set one up.';

interface RunRow {
  id: string;
  place: string;
  space: string;
  connection: string;
  state: RunState;
  reason: RunReason | null;
  since: Date;
  learnedUpTo: Date | null;
  caughtUpAt: Date | null;
  extensionSince: Date | null;
  extensionUntil: Date | null;
  spendingLimit: string;
  estimate: Estimate | null;
  excludedSenders: string[];
  excludedFolders: string[];
  startedAt: Date | null;
}

function runOf(row: RunRow): Run {
  const { extensionSince, extensionUntil, spendingLimit, excludedSenders, excludedFolders, ...run } = row;
  return {
    ...run,
    extending: extensionSince && extensionUntil ? { since: extensionSince, until: extensionUntil } : null,
    limit: Number(spendingLimit),
    leftOut: { senders: excludedSenders, folders: excludedFolders },
  };
}

/**
 * The person's own runs for these places, by place. Never anyone else's: Homing asks only for the
 * person's, and row-level security shows them nothing more.
 */
export async function runsFor(s: Session, places: string[]): Promise<Map<string, Run>> {
  const person = personOf(s.principal);
  if (!person || places.length === 0) return new Map();
  const rows = await s.tx<RunRow[]>`
    select r.id, r.place_id as place, r.space_id as space, r.connection_id as connection, r.state, r.reason, r.since, r.learned_up_to, r.caught_up_at,
           r.extension_since, r.extension_until, r.spending_limit, r.estimate, r.excluded_senders, r.excluded_folders, r.started_at
    from learning_runs r
    where r.place_id in ${s.tx(places)} and r.private_to = ${person}::uuid
  `;
  return new Map(rows.map((row) => [row.place, runOf(row)]));
}

/** How far the person's run has come: what it learned from, what it set aside and why, and what it spent. */
export async function progressOf(s: Session, run: Run): Promise<Progress> {
  const marks = await s.tx<{ outcome: string; reason: string | null; items: number; threads: number }[]>`
    select outcome, reason, count(*)::integer as items, count(distinct coalesce(thread, item))::integer as threads
    from learned_items where run_id = ${run.id}::uuid
    group by outcome, reason
    order by 3 desc, 2
  `;
  const [cost] = await s.tx<{ spent: string; followed: string }[]>`
    select coalesce(sum(coalesce(cost, reserved)) filter (where run_history), 0) as spent,
           coalesce(sum(coalesce(cost, reserved)) filter (where not run_history), 0) as followed
    from model_calls where run_id = ${run.id}::uuid
  `;
  const learned = marks.find((mark) => mark.outcome === 'learned');
  return {
    spent: Number(cost.spent),
    followed: Number(cost.followed),
    threads: learned?.threads ?? 0,
    learned: learned?.items ?? 0,
    setAside: marks.filter((mark) => mark.outcome === 'set aside').map((mark) => ({ reason: mark.reason ?? 'set aside', items: mark.items })),
  };
}

/**
 * Why an item needs no model: by the system's own signs, as its connector reads them, such as a
 * newsletter's headers, or because its owner left out its sender or its folder. Undefined when a
 * model should read it.
 */
export function setAside(change: Change, leftOut: Run['leftOut']): string | undefined {
  if (change.setAside) return change.setAside;
  const folder = change.folder?.trim().toLowerCase();
  if (folder && leftOut.folders.some((name) => name.trim().toLowerCase() === folder)) return 'excluded folder';
  const address = change.item.envelope.author?.address?.trim().toLowerCase();
  if (address && leftOut.senders.some((entry) => sentBy(entry.trim().toLowerCase(), address))) return 'excluded sender';
  return undefined;
}

/** Whether an address is the one left out, or at the domain left out, written as northwind.test or @northwind.test. */
function sentBy(entry: string, address: string): boolean {
  if (entry.includes('@') && !entry.startsWith('@')) return address === entry;
  const domain = entry.replace(/^@/, '');
  return domain !== '' && (address.endsWith(`@${domain}`) || address.endsWith(`.${domain}`));
}

/** Changes thread by thread, in the order each thread first comes, as a model reads them together. */
export function batchesOf(changes: Change[]): { thread: string | null; changes: Change[] }[] {
  const threads = new Map<string, Change[]>();
  for (const change of changes) {
    const key = change.thread ?? `item ${change.item.envelope.id}`;
    threads.set(key, [...(threads.get(key) ?? []), change]);
  }
  return [...threads.values()].map((held) => ({ thread: held[0].thread, changes: held }));
}

/** How long estimating may take, and how much of the scope's latest part it samples beside its start. */
const estimateTimeLimit = 60_000;
const latestSampled = 30 * 24 * 60 * 60 * 1000;

/**
 * Estimates what learning from a scope of the person's place may cost: how many items the system
 * counts there, and, from a sample of its first items and its latest, how many of them need no
 * model, how many threads the rest make, and what reading those costs at the model's prices. No
 * scan, and no model call. It's rough: the rest of the scope may differ from the sample.
 */
export async function estimate(l: Learning, principal: Principal, place: Place, scope: Scope, leftOut: Run['leftOut']): Promise<Estimate> {
  if (!l.model) throw new LearningRefused(noModel);
  const model = l.model;
  const connector = l.broker.connectors.get(place.connector);
  const follow = kindOf(connector, place.kind)?.follow;
  const words = wordsOf(connector, place.kind);
  if (!connector || !follow) throw new LearningRefused(`Homing can’t learn from that ${words.place}.`);
  const { items, sample } = await asOwner(l.broker, principal, place, AbortSignal.timeout(estimateTimeLimit), async (access) => {
    const items = await follow.count(access, scope);
    const first = items ? (await follow.changes(access, null, scope)).changes : [];
    const end = scope.until?.getTime() ?? Date.now();
    const late = { since: new Date(end - latestSampled), ...(scope.until && { until: scope.until }) };
    // The latest part too, when the scope is long enough for it to differ from its start.
    const latest = items > first.length && late.since.getTime() > scope.since.getTime() ? (await follow.changes(access, null, late)).changes : [];
    return { items, sample: [first, latest] };
  });
  const seen = new Set<string>();
  let [sampled, aside, threads, most, about] = [0, 0, 0, 0, 0];
  for (const page of sample) {
    const fresh = page.filter((change) => !seen.has(change.item.envelope.id));
    for (const change of fresh) seen.add(change.item.envelope.id);
    sampled += fresh.length;
    const kept = fresh.filter((change) => !setAside(change, leftOut));
    aside += fresh.length - kept.length;
    for (const batch of batchesOf(kept)) {
      threads++;
      for (const call of l.interpretation.calls({ space: place.space, words, thread: batch.thread, items: batch.changes.map((change) => change.item), earlier: null })) {
        const cost = callCost(model, call);
        if (!cost) throw new LearningRefused(noModel);
        most += cost.most;
        about += cost.about;
      }
    }
  }
  const each = (total: number) => (sampled ? (total / sampled) * items : 0);
  const high = cents(each(most));
  return {
    since: scope.since.toISOString(),
    until: scope.until?.toISOString() ?? null,
    items,
    threads: Math.round(each(threads)),
    setAside: Math.round(each(aside)),
    low: Math.min(cents(each(about)), high),
    high,
    limit: suggestedLimit(high),
    sampled,
    at: new Date().toISOString(),
  };
}

/** Dollars rounded up to the cent, so an estimate never reads as free when it isn't. */
const cents = (value: number) => Math.ceil(value * 100 - 1e-9) / 100;

/** The limit Homing suggests for a run: a round amount with room above the most the estimate says, and at least a dollar. */
export function suggestedLimit(high: number): number {
  const wanted = Math.max(1, high * 1.25);
  for (let step = 1; step <= 1_000_000; step *= 10) {
    for (const round of [1, 2, 5]) if (round * step >= wanted) return Math.min(round * step, 1_000_000);
  }
  return 1_000_000;
}

/** Uses the place as its owner for learning, recording the use as following it. */
export function asOwner<T>(broker: Broker, principal: Principal, place: Place, signal: AbortSignal, fn: (access: Parameters<Follow['count']>[0]) => Promise<T>): Promise<T> {
  const connector = broker.connectors.get(place.connector);
  if (!connector?.ready) throw new ConnectionUnusable('not set up');
  if (place.status === 'needs attention') throw new ConnectionUnusable('needs attention');
  return using(broker, connector, personOf(principal)!, place, { place: place.place, space: place.space, operation: 'follow', agent: principal.agent }, signal, fn);
}

/** Why Homing couldn't reach the place for an estimate, for its owner. */
function unreachable(l: Learning, place: Place, error: unknown): LearningRefused | undefined {
  const connector = l.broker.connectors.get(place.connector);
  const vendor = connector?.vendor ?? place.connector;
  if (error instanceof ConnectionUnusable) {
    return new LearningRefused(
      error.reason === 'needs attention'
        ? `${vendor} stopped letting Homing in, so sign in again first, in the space’s Connections.`
        : error.reason === 'not set up'
          ? `This Homing isn’t set up to reach ${connector?.name ?? place.connector} any more.`
          : 'There’s nothing of yours connected there to learn from.',
    );
  }
  if (error instanceof Unanswered || connector?.refused(error) === 'try later') return new LearningRefused(`${vendor} didn’t answer, so there’s no estimate yet. Try again in a moment.`);
  if (connector?.refused(error)) return new LearningRefused(`${vendor} refused, so there’s no estimate. If it keeps happening, tell whoever looks after Homing.`);
  return undefined;
}

/** What the database says when it refuses something about learning on purpose, as a sentence. */
function refusal(error: unknown): LearningRefused | undefined {
  if (!(error instanceof postgres.PostgresError) || !['42501', '23514'].includes(error.code) || /row-level security|permission denied|violates check constraint/.test(error.message)) return undefined;
  return new LearningRefused(`${error.message[0].toUpperCase()}${error.message.slice(1)}.`);
}

async function refusing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw refusal(error) ?? error;
  }
}

/** How far back a run may learn: from a day in the past, since 1990. */
function checked(since: Date): Date {
  if (Number.isNaN(since.getTime()) || since.getTime() >= Date.now() || since.getTime() <= Date.parse('1990-01-01')) {
    throw new LearningRefused('Learning starts from a day in the past, such as 2024-11-15.');
  }
  return since;
}

/** The answer for a place that isn't the person's to learn from, whoever's it is, or whether it's there at all. */
export const nothingThere = 'There’s nothing of yours connected there to learn from.';

/**
 * Estimates learning from one of the person's places back to a day, and keeps the estimate with
 * the place's run, which waits to be started. Nothing is learned yet. For the person, or their
 * assistant.
 */
export async function estimateLearning(l: Learning, principal: Principal, placeId: string, since: Date): Promise<Run> {
  const found = await withPrincipal(l.broker.sql, principal, async (s) => {
    const place = await ownPlace(s, placeId);
    return place && { place, run: (await runsFor(s, [placeId])).get(placeId) };
  });
  // Anyone else's place gets this answer whatever else holds, so it says nothing about the place.
  if (!found) throw new LearningRefused(nothingThere);
  checked(since);
  if (found.run && found.run.state !== 'estimating') throw new LearningRefused('Learning there has already started. To learn further back, extend it.');
  let made: Estimate;
  try {
    made = await estimate(l, principal, found.place, { since }, found.run?.leftOut ?? { senders: [], folders: [] });
  } catch (error) {
    throw unreachable(l, found.place, error) ?? error;
  }
  return refusing(() =>
    withPrincipal(l.broker.sql, principal, async (s) => {
      await s.tx`select estimate_learning(${placeId}::uuid, ${since}, ${s.tx.json(made as never)})`;
      return (await runsFor(s, [placeId])).get(placeId)!;
    }),
  );
}

/**
 * Starts the person's run that was estimated, with its limit: the one given, or the one Homing
 * suggested. Their assistant starts it with at most the suggested one, since only the person
 * allows more, which the database checks.
 */
export async function startLearning(l: Learning, s: Session, run: Run, limit?: number): Promise<void> {
  if (!l.model) throw new LearningRefused(noModel);
  if (!run.estimate) throw new LearningRefused('Learning is estimated before it starts.');
  const cap = limit ?? run.estimate.limit;
  await refusing(() => s.tx`select start_learning(${run.id}::uuid, ${cap}::numeric)`);
}

/** Pauses the person's run. It keeps where it is. Whether it changed anything. */
export async function pauseLearning(s: Session, run: Run): Promise<boolean> {
  const [{ paused }] = await refusing(() => s.tx<{ paused: boolean }[]>`select pause_learning(${run.id}::uuid) as paused`);
  return paused;
}

/** Resumes the person's run where it stopped. One paused at its limit resumes only when the person sets its limit. The state it's in now. */
export async function resumeLearning(l: Learning, s: Session, run: Run): Promise<RunState> {
  if (!l.model) throw new LearningRefused(noModel);
  const [{ state }] = await refusing(() => s.tx<{ state: RunState }[]>`select resume_learning(${run.id}::uuid) as state`);
  return state;
}

/**
 * Extends the person's started run further back, so it also learns from the range that adds, and
 * only from that. Homing estimates that range first and keeps the estimate with the run. The run's
 * limit stays as it is. Returns the estimate for what it adds, or undefined when the run already
 * reaches that far back.
 */
export async function extendLearning(l: Learning, principal: Principal, placeId: string, since: Date): Promise<Estimate | undefined> {
  const found = await withPrincipal(l.broker.sql, principal, async (s) => {
    const place = await ownPlace(s, placeId);
    return place && { place, run: (await runsFor(s, [placeId])).get(placeId) };
  });
  if (!found?.run) throw new LearningRefused(found ? 'Learning there hasn’t started yet.' : nothingThere);
  checked(since);
  const { run, place } = found;
  if (run.state === 'estimating') throw new LearningRefused('Learning there hasn’t started yet. Estimate it again from the day you want instead.');
  if (since.getTime() >= run.since.getTime()) return undefined;
  let added: Estimate;
  try {
    added = await estimate(l, principal, place, { since, until: run.since }, run.leftOut);
  } catch (error) {
    throw unreachable(l, place, error) ?? error;
  }
  const [{ extended }] = await refusing(() =>
    withPrincipal(l.broker.sql, principal, (s) => s.tx<{ extended: boolean }[]>`select extend_learning(${run.id}::uuid, ${since}, ${s.tx.json(added as never)}) as extended`),
  );
  return extended ? added : undefined;
}

/** Sets what the person's run may spend on history, which resumes it when it was paused at its limit and this leaves room. Only the person, in Homing itself. */
export async function setLearningLimit(s: Session, run: Run, limit: number): Promise<void> {
  await refusing(() => s.tx`select set_learning_limit(${run.id}::uuid, ${limit}::numeric)`);
}

/** Sets what the person's run leaves out without a model: senders, by address or domain, and folders, by name. */
export async function setLeftOut(s: Session, run: Run, leftOut: Run['leftOut']): Promise<void> {
  await refusing(() => s.tx`select set_learning_exclusions(${run.id}::uuid, ${s.tx.array(leftOut.senders)}::text[], ${s.tx.array(leftOut.folders)}::text[])`);
}

/** A set-aside reason in words, for how many items: "240 newsletters", "1 from a sender you left out". */
export function setAsideWords(reason: string, items: number, words: { item: string; items: string }): string {
  const count = items.toLocaleString('en-US');
  const one = items === 1;
  switch (reason) {
    case 'newsletter':
      return `${count} ${one ? 'newsletter' : 'newsletters'}`;
    case 'automated':
      return `${count} sent automatically`;
    case 'junk':
      return `${count} in junk`;
    case 'draft':
      return `${count} ${one ? 'draft' : 'drafts'}`;
    case 'deleted':
      return `${count} deleted`;
    case 'excluded sender':
      return `${count} from senders you left out`;
    case 'excluded folder':
      return `${count} in folders you left out`;
    case 'model processing off':
      return `${count} not processed, because model processing is off in the space`;
    case 'nothing to keep':
      return `${count} with nothing to keep`;
    case 'no usable answer':
      return `${count} the model gave no usable answer for`;
    default:
      return `${count} ${one ? words.item : words.items} set aside`;
  }
}
