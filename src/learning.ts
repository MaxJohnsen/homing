// Learning from a connected place (spec §8, §11), as its owner sees and directs it. A person
// starts a run for a place of theirs, such as their mailbox, with how far back it learns, in the
// app or by approving what their assistant proposes. Before that, Homing estimates what it may
// cost, from how many items the system counts there and a small sample, and suggests its limit.
// The run then learns through the place's history and carries on with what arrives (learner.ts).
// Homing's own model does the reading where it has one, and the person's assistant can, which is
// how a run works where Homing has none: it starts all the same, and its reading costs nothing here.
// Only its owner sees a run, its progress and what it spent, and only they raise its limit, or
// have it learn from more than it would: taking something off what's left out, or keeping a sender.

import postgres from 'postgres';
import { ConnectionUnusable, kindOf, Unanswered, using, type Broker } from './connections.ts';
import type { Change, Envelope, Follow, Scope } from './connectors.ts';
import { personOf, withPrincipal, type Principal, type Session } from './db.ts';
import type { Interpretation } from './interpret.ts';
import type { LearnerOptions } from './learner.ts';
import { callCost, monthlyLimit, type Model } from './model.ts';
import { ownPlace, quoted, wordsOf, type Place } from './places.ts';
import { accessibleSpaces } from './spaces.ts';

/** What learning needs from the server: connections, Homing's model if it has one, and how a batch is read, by that model or by a person's assistant. */
export interface Learning {
  broker: Broker;
  model?: Model;
  interpretation: Interpretation;
  /** How learning paces itself, when not as usual, for Homing's worker and for an assistant's reading alike. Tests set it faster. */
  pace?: LearnerOptions;
}

export type RunState = 'estimating' | 'learning history' | 'following' | 'paused' | 'needs attention' | 'done';
export type RunReason = 'person' | 'limit' | 'monthly limit' | 'model processing off' | 'sign in again' | 'not set up' | 'removed';

/** What a run's owner left out, senders by address or domain and folders by name, and the senders they keep whatever their mail says about itself. */
export interface LeftOut {
  senders: string[];
  folders: string[];
  kept: string[];
}

/**
 * A route of a run's map: who, someone a thread is with, by address or domain, and where their mail
 * belongs: a space, by its id, or leave out, or wait.
 */
export interface Route {
  who: string;
  to: string;
}

/**
 * A run's map as it works: its routes, with each sender its owner left out as a route to leave
 * out, and where everything else goes, which is the place's own space when it's null.
 */
export interface LearningMap {
  routes: Route[];
  rest: string | null;
}

/** What learning from a scope may cost, as Homing estimated it before the pass. It's rough. */
export type Estimate = {
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
  /** Made where Homing has no model of its own: the person's assistant reads, so it holds no cost and no limit. */
  unpriced?: true;
};

/** A learning run, as its owner sees it. */
export interface Run {
  id: string;
  place: string;
  space: string;
  connection: string;
  state: RunState;
  /** Why it's paused, needs its owner or is done. */
  reason: RunReason | null;
  /** What it waits for while it keeps trying by itself: the model's provider, the system it reads, or an error of Homing's own. */
  waitingFor: 'provider' | 'system' | 'error' | null;
  /** Whether older material, such as a range added to its scope, waits at its limit while it follows what arrives. */
  waitingAtLimit: boolean;
  /** How far back it learns. */
  since: Date;
  /** How far through the place's history it is: when the latest item it passed arrived. */
  learnedUpTo: Date | null;
  /** When it first caught up with what's there. */
  caughtUpAt: Date | null;
  /** Whether the place holds more than Homing follows, such as a mailbox with more folders than it reads, so what arrives in the rest isn't learned from. */
  followedPartly: boolean;
  /** A scope extended further back that it's walking now: from when, up to when. */
  extending: { since: Date; until: Date } | null;
  /** In USD, for what it learns from history. */
  limit: number;
  estimate: Estimate | null;
  /** The estimate for a range further back its owner asked about, which isn't learned from until they say so. */
  proposed: Estimate | null;
  leftOut: LeftOut;
  /** Where its mail belongs. The senders left out are its routes to leave out. */
  map: LearningMap;
  /** Whether a summary of the place is being made, when the one it has was made, and whether Homing gave up making one. */
  summarizing: boolean;
  summarized: string | null;
  summaryFailed: boolean;
  startedAt: Date | null;
  /** How many threads of the page it stands at wait for someone to read them, as whoever looked last counted. */
  unread: number;
}

/** How far a run has come. */
export interface Progress {
  /** In USD: what its history cost, with the worst case of its calls under way, which its limit holds; and what following cost, which the monthly limit holds. */
  spent: number;
  followed: number;
  /** How many threads it learned from, and how many items they held. */
  threads: number;
  learned: number;
  /**
   * What it set aside, by why, most first, each with who sent the most of it, how many senders
   * there are beside those, and whether it's something that may pass, which can be tried again.
   */
  setAside: { reason: string; items: number; senders: Sender[]; more: number; retry: boolean }[];
  /** How many items set aside before it now learns from after all, since their owner said so, or tries again. */
  again: number;
}

/** Who sent items a run set aside, and how many. */
export interface Sender {
  sender: string;
  items: number;
}

/**
 * What an item is set aside for that may pass: the model's provider refused it or failed on it,
 * the model's answer couldn't be used, or the system couldn't give it. Those are tried again, once
 * by Homing itself, a day later, and whenever the person or their assistant asks.
 */
export const retryable = ['provider refused', 'provider failed', 'no usable answer', 'unreadable'];

/** Learning can't do what was asked, and says why, for the person or their assistant. */
export class LearningRefused extends Error {
  override name = 'LearningRefused';
}

/** What's said when an estimate that holds no cost is to be started or extended where Homing now has a model, which would cost. */
const pricedSince = 'Homing has a model of its own since this was estimated, so the reading would cost something now. Estimate it again.';

interface RunRow {
  id: string;
  place: string;
  space: string;
  connection: string;
  state: RunState;
  reason: RunReason | null;
  waitingFor: Run['waitingFor'];
  waitingAtLimit: boolean;
  since: Date;
  learnedUpTo: Date | null;
  caughtUpAt: Date | null;
  followedPartly: boolean;
  extensionSince: Date | null;
  extensionUntil: Date | null;
  extensionEstimate: Estimate | null;
  spendingLimit: string;
  estimate: Estimate | null;
  routes: Route[];
  rest: string | null;
  excludedSenders: string[];
  excludedFolders: string[];
  keptSenders: string[];
  summarizing: boolean;
  summarized: string | null;
  summaryFailed: boolean;
  startedAt: Date | null;
  unread: number;
}

/**
 * A map as it works, from the routes a run keeps and the senders it leaves out, who stay a list of
 * their own: each of them a route to leave out, and so is every other route for anyone that list
 * covers, since what is left out is never read, whatever else names it. The run keeps such a route
 * as it was, so it works again once its sender is off the list.
 */
export const mapOf = (routes: Route[], leftOut: string[], rest: string | null): LearningMap => {
  const out = [...new Set([...leftOut, ...routes.filter((route) => route.to === 'leave out').map((route) => route.who)])];
  const others = routes.filter((route) => !out.includes(route.who)).map((route) => (leftOutBy(out, route.who) ? { who: route.who, to: 'leave out' } : route));
  return { routes: [...others, ...out.map((who) => ({ who, to: 'leave out' }))], rest };
};

/** The entry among those left out that covers a route's sender: that address, or the whole of the domain it names. */
export const leftOutBy = (leftOut: string[], who: string) => leftOut.find((entry) => sentBy(entry, who.includes('@') ? who : `someone@${who}`));

/**
 * Whether a text names a sender, for a route or for what's left out: a plain address or a domain,
 * in lower case, of ASCII only, so it names who it looks like it names and nothing in it stands
 * for anything else. The database holds the same (route_names).
 */
export const namesSender = (who: string) => who.length <= 320 && /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(who);

/** A sender as someone wrote it, the way it's kept: in lower case, without the @ a domain may be written with. */
export const senderNamed = (who: string) => who.trim().toLowerCase().replace(/^@/, '');

/** Whether a map says anything beyond who is left out: a run without one behaves as it did before maps. */
export const hasMap = (map: LearningMap) => map.rest !== null || map.routes.some((route) => route.to !== 'leave out');

function runOf(row: RunRow): Run {
  const { extensionSince, extensionUntil, extensionEstimate, spendingLimit, routes, rest, excludedSenders, excludedFolders, keptSenders, ...run } = row;
  return {
    ...run,
    extending: extensionSince && extensionUntil ? { since: extensionSince, until: extensionUntil } : null,
    limit: Number(spendingLimit),
    proposed: extensionEstimate,
    leftOut: { senders: excludedSenders, folders: excludedFolders, kept: keptSenders },
    map: mapOf(routes, excludedSenders, rest),
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
    select r.id, r.place_id as place, r.space_id as space, r.connection_id as connection, r.state, r.reason, r.waiting_for, r.waiting_at_limit,
           r.since, r.learned_up_to, r.caught_up_at, r.followed_partly, r.extension_since, r.extension_until, r.extension_estimate, r.spending_limit, r.estimate,
           r.routes, r.rest, r.excluded_senders, r.excluded_folders, r.kept_senders, r.started_at, r.unread,
           r.summarizing is not null and not r.summarizing ? 'failed' as summarizing, r.summary ->> 'at' as summarized, coalesce(r.summarizing ? 'failed', false) as summary_failed
    from learning_runs r
    where r.place_id in ${s.tx(places)} and r.private_to = ${person}::uuid
  `;
  return new Map(rows.map((row) => [row.place, runOf(row)]));
}

/** How many senders each reason names at first, and how many more each further look gives. The rest are counted. */
const sendersShown = 8;
const sendersAtOnce = 50;

/** How far the person's run has come: what it learned from, what it set aside, why and from whom, and what it spent. */
export async function progressOf(s: Session, run: Run): Promise<Progress> {
  const [learned] = await s.tx<{ items: number; threads: number }[]>`
    select count(*)::integer as items, count(distinct coalesce(thread, item))::integer as threads
    from learned_items where run_id = ${run.id}::uuid and outcome = 'learned'
  `;
  const aside = await s.tx<{ reason: string; sender: string | null; items: number; again: number }[]>`
    select reason, sender, count(*) filter (where not again)::integer as items, count(*) filter (where again)::integer as again
    from learned_items where run_id = ${run.id}::uuid and outcome = 'set aside'
    group by reason, sender
    order by 3 desc, 2
  `;
  const [cost] = await s.tx<{ spent: string; followed: string }[]>`
    select coalesce(sum(coalesce(cost, reserved)) filter (where run_history), 0) as spent,
           coalesce(sum(coalesce(cost, reserved)) filter (where not run_history), 0) as followed
    from model_calls where run_id = ${run.id}::uuid
  `;
  const reasons = [...new Set(aside.filter((row) => row.items > 0).map((row) => row.reason))];
  const setAside = reasons
    .map((reason) => {
      const rows = aside.filter((row) => row.reason === reason && row.items > 0);
      const senders = rows.flatMap((row) => (row.sender ? [{ sender: row.sender, items: row.items }] : []));
      return {
        reason,
        items: rows.reduce((sum, row) => sum + row.items, 0),
        senders: senders.slice(0, sendersShown),
        more: Math.max(0, senders.length - sendersShown),
        retry: retryable.includes(reason),
      };
    })
    .sort((a, b) => b.items - a.items);
  return {
    spent: Number(cost.spent),
    followed: Number(cost.followed),
    threads: learned.threads,
    learned: learned.items,
    setAside,
    again: aside.reduce((sum, row) => sum + row.again, 0),
  };
}

/**
 * Everyone who sent what the person's run set aside for one reason, most first, so many at a time
 * from a place in that order, or only those whose address holds what's searched for. With how many
 * there are in all, so the rest can be counted.
 */
export async function setAsideSenders(s: Session, run: Run, reason: string, options: { search?: string; from?: number } = {}): Promise<{ senders: Sender[]; total: number }> {
  const search = (options.search ?? '').trim().toLowerCase();
  const from = Math.max(0, Math.floor(options.from ?? 0));
  const rows = await s.tx<(Sender & { total: number })[]>`
    select sender, count(*)::integer as items, (count(*) over ())::integer as total
    from learned_items
    where run_id = ${run.id}::uuid and outcome = 'set aside' and not again and reason = ${reason} and sender is not null
      and (${search} = '' or position(${search} in sender) > 0)
    group by sender
    order by 2 desc, 1
    offset ${from} limit ${sendersAtOnce}
  `;
  // Past the last of them, there's still a count to give.
  const [{ total }] = rows.length
    ? rows
    : await s.tx<{ total: number }[]>`
        select count(distinct sender)::integer as total from learned_items
        where run_id = ${run.id}::uuid and outcome = 'set aside' and not again and reason = ${reason} and sender is not null
          and (${search} = '' or position(${search} in sender) > 0)
      `;
  return { senders: rows.map(({ sender, items }) => ({ sender, items })), total };
}

/** Who sent an item, by address in lower case, as far as it's known. */
export const senderOf = (change: Change) => change.item.envelope.author?.address?.trim().toLowerCase() || undefined;

/**
 * Why an item needs no model, whoever its thread is with: by the system's own signs, as its
 * connector reads them, such as a newsletter's headers, unless its owner keeps the sender; or
 * because its owner left out its folder, and then which entry of theirs it was. Undefined when it
 * goes on to where its thread belongs.
 */
export function setAside(change: Change, leftOut: LeftOut): { reason: string; because?: string } | undefined {
  const address = senderOf(change);
  // What an email says about itself, its owner can overrule for a sender. Where it lies, or that it can't be read, nobody can.
  const overruled = (change.setAside === 'newsletter' || change.setAside === 'automated') && address !== undefined && leftOut.kept.some((entry) => sentBy(entry, address));
  if (change.setAside && !overruled) return { reason: change.setAside };
  const inFolder = folderLeftOut(change.folder, leftOut);
  if (inFolder) return { reason: 'excluded folder', because: inFolder };
  return undefined;
}

/** The entry of its owner's that leaves out a folder, by its name, if one does. */
export function folderLeftOut(folder: string | null, leftOut: Pick<LeftOut, 'folders'>): string | undefined {
  const named = folder?.trim().toLowerCase();
  return named ? leftOut.folders.find((name) => name.trim().toLowerCase() === named) : undefined;
}

/**
 * Whether an address is the one an entry names, or at the domain it names or one under it. Both as
 * they are kept, in lower case, and compared letter by letter: nothing in an entry stands for
 * anything else. An entry may begin with one @, as @northwind.test. The database says the same
 * (sender_matches), and one table of cases is run through both.
 */
export function sentBy(entry: string, address: string): boolean {
  const named = entry.replace(/^@/, '');
  if (named.includes('@')) return address === named;
  return named !== '' && (address.endsWith(`@${named}`) || address.endsWith(`.${named}`));
}

/**
 * The route that names an address. Whoever is left out is left out, whatever else names them: a
 * route that leaves them out, by their address or their domain, comes before any other. Among the
 * rest it is the most exact one: the address itself before its domain, and a domain before one
 * above it.
 */
export function routeFor(routes: Route[], address: string): Route | undefined {
  const exact = (route: Route) => route.who.replace(/^@/, '').length;
  const out = (route: Route) => Number(route.to === 'leave out');
  return routes.filter((route) => sentBy(route.who, address)).sort((a, b) => out(b) - out(a) || exact(b) - exact(a))[0];
}

/**
 * Who an item is with: whoever wrote it, or, for one its owner wrote, whoever they wrote it to, as
 * far as that's known. By address, in lower case. Its owner's own address never counts.
 */
export function partiesOf(envelope: Envelope, own: string): string[] {
  const me = own.trim().toLowerCase();
  const address = (party: { address: string | null } | null) => party?.address?.trim().toLowerCase() || undefined;
  const author = address(envelope.author);
  const those = author === me ? (envelope.audience === 'unknown' ? [] : envelope.audience.people.map(address)) : [author];
  return [...new Set(those.filter((one): one is string => one !== undefined && one !== me))];
}

/**
 * Where a thread belongs by its owner's map: the one rule, which reading, the estimate, what's not
 * placed and looking again all go by. A thread is routed by who it is with, among these items and
 * what they're read with, and each of them by the route that names them (routeFor): left out
 * first, then the most exact. If any of them is left out, the whole thread is, since a reply quotes
 * what it answers. Otherwise
 * the oldest item that is with someone a route names decides. With none, the thread goes where
 * everything else goes, and says no route named it. The space is null for the place's own. It also
 * says everyone the thread is with, which a run keeps with what it sets aside by this.
 */
export function routeOf(changes: Change[], map: LearningMap, own: string): { to: string | null; entry: string | null; parties: string[] } {
  // Each item once, as it was read where it was: an item among what another is read with comes without whom it was sent to.
  const written = new Map<string, Envelope>();
  for (const envelope of changes.flatMap((change) => change.item.related)) written.set(envelope.id, envelope);
  for (const change of changes) written.set(change.item.envelope.id, change.item.envelope);
  const each = [...written.values()].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)).map((envelope) => partiesOf(envelope, own));
  const parties = [...new Set(each.flat())].slice(0, partiesKept);
  const named = each.flatMap((those) => those.flatMap((address) => routeFor(map.routes, address) ?? []).slice(0, 1));
  const route = each.flat().map((address) => routeFor(map.routes, address)).find((one) => one?.to === 'leave out') ?? named[0];
  return route ? { to: route.to, entry: route.who, parties } : { to: map.rest, entry: null, parties };
}

/** How many of those a thread is with a run keeps with what it sets aside. */
const partiesKept = 200;

/** How many emails a sender no route names has before they're listed as not placed, and how many are listed. */
const addsUp = 3;
const notPlacedShown = 20;

/**
 * The senders no route of the person's run names whose mail adds up, most first, with how many
 * there are beside those: what the run met that the map says nothing about, in threads that went
 * where everything else goes. Their own address isn't one. A run without a map has none.
 */
export async function notPlaced(s: Session, run: Run, own: string): Promise<{ senders: Sender[]; more: number }> {
  if (!hasMap(run.map)) return { senders: [], more: 0 };
  const rows = await s.tx<Sender[]>`
    select sender, count(*)::integer as items from learned_items
    where run_id = ${run.id}::uuid and because is null and (interpretation is not null or reason in ('waiting', 'excluded sender'))
      and sender is not null and sender <> ${own.trim().toLowerCase()}
    group by sender having count(*) >= ${addsUp}
    order by 2 desc, 1
    limit 500
  `;
  const open = rows.filter((row) => !run.map.routes.some((route) => sentBy(route.who, row.sender)));
  return { senders: open.slice(0, notPlacedShown), more: Math.max(0, open.length - notPlacedShown) };
}

/**
 * Asks for a summary of one of the person's places back to a day, for them or their assistant.
 * Homing's worker makes it (learner.ts), without a model. A place that has no run yet gets one,
 * which waits to be started; a started run is summarized over its own scope.
 */
export async function summarizeLearning(l: Learning, principal: Principal, placeId: string, since?: Date): Promise<Run> {
  const found = await ownRun(l, principal, placeId);
  if (!found) throw new LearningRefused(nothingThere);
  const connector = l.broker.connectors.get(found.place.connector);
  const words = wordsOf(connector, found.place.kind);
  if (!kindOf(connector, found.place.kind)?.follow?.summary) throw new LearningRefused(`Homing can’t summarize a ${words.place} of that kind.`);
  const started = found.run && found.run.state !== 'estimating';
  if (!started && !since) throw new LearningRefused('Say how far back to look, such as 2024-11-15.');
  if (!started) checked(since!);
  return refusing(() =>
    withPrincipal(l.broker.sql, principal, async (s) => {
      const already = started ? undefined : await elsewhere(s, found.place, words);
      if (already) throw new LearningRefused(already);
      await s.tx`select summarize_learning(${placeId}::uuid, ${started ? found.run!.since : since!})`;
      return (await runsFor(s, [placeId])).get(placeId)!;
    }),
  );
}

/**
 * Changes thread by thread, in the order each thread first comes, oldest first within each, as a
 * model reads them together: at most so many at once, so a long thread comes in several batches.
 */
export function batchesOf(changes: Change[], most: number): { thread: string | null; changes: Change[] }[] {
  const threads = new Map<string, Change[]>();
  const time = (change: Change) => change.item.envelope.at?.getTime() ?? 0;
  for (const change of [...changes].sort((a, b) => time(a) - time(b))) {
    const key = change.thread ?? `item ${change.item.envelope.id}`;
    threads.set(key, [...(threads.get(key) ?? []), change]);
  }
  return [...threads.values()].flatMap((held) => {
    const batches: { thread: string | null; changes: Change[] }[] = [];
    for (let at = 0; at < held.length; at += Math.max(1, most)) batches.push({ thread: held[0].thread, changes: held.slice(at, at + Math.max(1, most)) });
    return batches;
  });
}

/** How long estimating may take, and how much of the scope's latest part it samples beside its start. */
const estimateTimeLimit = 60_000;
const latestSampled = 30 * 24 * 60 * 60 * 1000;

/**
 * Estimates what learning from a scope of the person's place may cost: how many items the system
 * counts there, and, from a sample of its first items and its latest, how many of them need no
 * model or are left out or wait by the run's map, how many threads the rest make, and what reading those costs at the model's prices. A
 * handful of requests to the system, no scan, and no model call. It's rough: the rest of the scope
 * may differ from the sample. The limit it suggests is at most what whoever looks after Homing
 * lets a run spend. Where Homing has no model, the person's assistant reads, and the estimate
 * holds the counts with no cost and no limit.
 */
export async function estimate(l: Learning, principal: Principal, place: Place, scope: Scope, { leftOut, map }: Pick<Run, 'leftOut' | 'map'>, ceiling: number): Promise<Estimate> {
  const model = l.model;
  const connector = l.broker.connectors.get(place.connector);
  const follow = kindOf(connector, place.kind)?.follow;
  const words = wordsOf(connector, place.kind);
  if (!connector || !follow) throw new LearningRefused(`Homing can’t learn from that ${words.place}.`);
  const { items, sample } = await asOwner(l.broker, principal, place, AbortSignal.timeout(estimateTimeLimit), async (access) => {
    const items = await follow.count(access, scope);
    // Without what each is read with, such as its thread, which would take a request for each.
    const first = items ? (await follow.changes(access, null, scope, { related: false })).changes : [];
    const end = scope.until?.getTime() ?? Date.now();
    const late = { since: new Date(end - latestSampled), ...(scope.until && { until: scope.until }) };
    // The latest part too, when the scope is long enough for it to differ from its start.
    const latest = items > first.length && late.since.getTime() > scope.since.getTime() ? (await follow.changes(access, null, late, { related: false })).changes : [];
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
    // What the map leaves out or has wait isn't read, so it costs nothing.
    const read = batchesOf(kept, Number.MAX_SAFE_INTEGER).flatMap((thread) => (['leave out', 'wait'].includes(routeOf(thread.changes, map, place.address).to ?? '') ? [] : thread.changes));
    aside += kept.length - read.length;
    for (const batch of batchesOf(read, l.interpretation.most)) {
      threads++;
      for (const call of model ? l.interpretation.calls({ space: place.space, words, thread: batch.thread, items: batch.changes.map((change) => change.item), earlier: null, earlierUpTo: null }) : []) {
        const cost = callCost(model!, call);
        if (!cost) throw new LearningRefused('Homing doesn’t know what its model costs, so there’s no estimate. Whoever looks after Homing can set its prices.');
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
    limit: model ? Math.min(suggestedLimit(high), ceiling) : 0,
    sampled,
    at: new Date().toISOString(),
    ...(!model && { unpriced: true as const }),
  };
}

/** Dollars rounded up to the cent, so an estimate never reads as free when it isn't. */
export const cents = (value: number) => Math.ceil(value * 100 - 1e-9) / 100;

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

/** The person's place and its run, and the most a run may spend here. Undefined for anyone else's place, or none. */
async function ownRun(l: Learning, principal: Principal, placeId: string) {
  return withPrincipal(l.broker.sql, principal, async (s) => {
    const place = await ownPlace(s, placeId);
    return place && { place, run: (await runsFor(s, [placeId])).get(placeId), ceiling: (await monthlyLimit(s)).runCeiling };
  });
}

/** Where else Homing already learns from what this place reaches, such as the same mailbox in another space, as a sentence. */
async function elsewhere(s: Session, place: Place, words: { place: string }): Promise<string | undefined> {
  const [other] = await s.tx<{ name: string | null; personal: boolean | null }[]>`
    select sp.name, sp.private_to is not null and sp.parent_id is null as personal
    from learning_runs r join places o on o.id = r.place_id
    left join spaces sp on sp.id = r.space_id and sp.id in (${accessibleSpaces(s)})
    where r.private_to = ${personOf(s.principal)!}::uuid and r.state not in ('estimating', 'done') and o.id <> ${place.place}::uuid
      and o.connection_id = ${place.connection}::uuid and o.kind = ${place.kind} and o.resource = ${place.resource}
    limit 1
  `;
  if (!other) return undefined;
  const where = other.personal ? 'your personal space' : (other.name ?? 'another space');
  return `Homing already learns from that ${words.place}, in ${where}, and learns from each ${words.place} in one space only. What it learns there can be shared from there.`;
}

/**
 * Estimates learning from one of the person's places back to a day, and keeps the estimate with
 * the place's run, which waits to be started. Nothing is learned yet. For the person, or their
 * assistant.
 */
export async function estimateLearning(l: Learning, principal: Principal, placeId: string, since: Date): Promise<Run> {
  const found = await ownRun(l, principal, placeId);
  // Anyone else's place gets this answer whatever else holds, so it says nothing about the place.
  if (!found) throw new LearningRefused(nothingThere);
  checked(since);
  if (found.run && found.run.state !== 'estimating') throw new LearningRefused('Learning there has already started. To learn further back, extend it.');
  const words = wordsOf(l.broker.connectors.get(found.place.connector), found.place.kind);
  const already = await withPrincipal(l.broker.sql, principal, (s) => elsewhere(s, found.place, words));
  if (already) throw new LearningRefused(already);
  let made: Estimate;
  try {
    made = await estimate(l, principal, found.place, { since }, found.run ?? { leftOut: { senders: [], folders: [], kept: [] }, map: { routes: [], rest: null } }, found.ceiling);
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
 * Starts the person's estimated run as they were shown it: that far back, with that estimate, and
 * the limit they chose, or the one the estimate suggested. A run estimated again since isn't what
 * they saw, and doesn't start. Only the person does, in Homing itself, directly or by approving
 * what their assistant proposed. The database checks all of it, and that the limit is within what
 * a run may spend here. An estimate made where Homing had no model holds no cost, so it starts
 * nothing once Homing has one.
 */
export async function startLearning(l: Learning, s: Session, shown: Pick<Run, 'id' | 'place' | 'since' | 'estimate'>, limit?: number): Promise<void> {
  if (!shown.estimate) throw new LearningRefused('Learning is estimated before it starts.');
  if (shown.estimate.unpriced && l.model) throw new LearningRefused(pricedSince);
  const cap = limit ?? shown.estimate.limit;
  const place = await ownPlace(s, shown.place);
  const already = place && (await elsewhere(s, place, wordsOf(l.broker.connectors.get(place.connector), place.kind)));
  if (already) throw new LearningRefused(already);
  await refusing(() => s.tx`select start_learning(${shown.id}::uuid, ${cap}::numeric, ${shown.since}, ${shown.estimate!.at}::timestamptz)`);
}

/** A run taken for the person's assistant to read: its claim, and what was handed out under the claim the assistant held. Or why not, and until when. */
export interface Taken {
  claim: string | null;
  handed: string[] | null;
  refused: 'not reading' | 'held' | 'waits' | null;
  until: Date | null;
}

/**
 * Takes the person's run for their assistant to read, under a claim of its own each time: when
 * nobody holds the run, or the assistant names the claim it holds. One reads at a time, so it's
 * refused while Homing's own worker or another conversation holds it, while the run hands out
 * nothing, as when it's paused, or while it waits for the system it reads.
 */
export async function takeLearning(s: Session, run: Run, held: string | undefined, leaseSeconds: number): Promise<Taken> {
  const [taken] = await refusing(() => s.tx<Taken[]>`select * from take_learning_run(${run.id}::uuid, ${held ?? null}::uuid, ${leaseSeconds}::integer)`);
  return taken;
}

/** Whether the person's run has a page to look at now. */
export async function learningDue(s: Session, run: Run): Promise<boolean> {
  const [due] = await s.tx`select from learning_runs r where r.id = ${run.id}::uuid and r.next_at <= now()`;
  return due !== undefined;
}

/** Pauses the person's run. It keeps where it is. Whether it changed anything. */
export async function pauseLearning(s: Session, run: Run): Promise<boolean> {
  const [{ paused }] = await refusing(() => s.tx<{ paused: boolean }[]>`select pause_learning(${run.id}::uuid) as paused`);
  return paused;
}

/** Resumes the person's run where it stopped. One paused at its limit resumes only when the person sets its limit. The state it's in now. */
export async function resumeLearning(s: Session, run: Run): Promise<RunState> {
  const [{ state }] = await refusing(() => s.tx<{ state: RunState }[]>`select resume_learning(${run.id}::uuid) as state`);
  return state;
}

/**
 * Estimates what extending the person's started run further back would add, and keeps the
 * estimate with the run for them to see. Nothing else changes until they extend it to that very
 * day. Undefined when the run already reaches that far back.
 */
export async function estimateExtension(l: Learning, principal: Principal, placeId: string, since: Date): Promise<Estimate | undefined> {
  const found = await ownRun(l, principal, placeId);
  if (!found?.run) throw new LearningRefused(found ? 'Learning there hasn’t started yet.' : nothingThere);
  checked(since);
  const { run, place } = found;
  if (run.state === 'estimating') throw new LearningRefused('Learning there hasn’t started yet. Estimate it again from the day you want instead.');
  if (since.getTime() >= run.since.getTime()) return undefined;
  let added: Estimate;
  try {
    added = await estimate(l, principal, place, { since, until: run.since }, run, found.ceiling);
  } catch (error) {
    throw unreachable(l, place, error) ?? error;
  }
  await refusing(() => withPrincipal(l.broker.sql, principal, (s) => s.tx`select estimate_extension(${run.id}::uuid, ${since}, ${s.tx.json(added as never)})`));
  return added;
}

/** Lets go of the estimate kept for learning further back, when the person doesn't want it. */
export async function forgetExtension(s: Session, run: Run): Promise<void> {
  await refusing(() => s.tx`select estimate_extension(${run.id}::uuid, null, null)`);
}

/**
 * Extends the person's started run further back, once that range was estimated, so it also learns
 * from what that adds, and only from that. The run's limit stays as it is.
 */
export async function extendLearning(l: Learning, s: Session, run: Run, since: Date): Promise<void> {
  if (run.proposed?.unpriced && l.model) throw new LearningRefused(pricedSince);
  await refusing(() => s.tx`select extend_learning(${run.id}::uuid, ${since})`);
}

/** Sets what the person's run may spend on history, which resumes it when it was paused at its limit and this leaves room. Only the person, in Homing itself. */
export async function setLearningLimit(s: Session, run: Run, limit: number): Promise<void> {
  await refusing(() => s.tx`select set_learning_limit(${run.id}::uuid, ${limit}::numeric)`);
}

/**
 * Sets what the person's run leaves out without a model, and the senders it keeps. Their assistant
 * only adds to what's left out. A sender to leave out is a plain address or a domain, as a route's
 * is, and one already on the list stays as it's written there. The run's routes stay: one for a
 * sender left out does nothing until they're taken off the list. What was set aside for something
 * no longer left out, or from a sender now kept, is learned from after all.
 */
export async function setLeftOut(s: Session, run: Run, leftOut: LeftOut): Promise<void> {
  const had = (who: string) => run.leftOut.senders.includes(who);
  const senders = leftOut.senders.map((who) => (had(who) ? who : senderNamed(who)));
  const odd = senders.find((who) => !had(who) && !namesSender(who));
  if (odd !== undefined) throw new LearningRefused(`${quoted(odd, 80)} isn’t a sender’s address or a domain in plain letters, such as news@shop.test or shop.test. Nothing was changed.`);
  await refusing(() => s.tx`
    select set_learning_exclusions(${run.id}::uuid, ${s.tx.array(senders)}::text[], ${s.tx.array(leftOut.folders)}::text[], ${s.tx.array(leftOut.kept)}::text[])
  `);
}

/**
 * Has the person's run try again what it set aside for something that may pass, such as the
 * provider failing on it: all of it, or what was set aside for one such reason. For the person or
 * their assistant, since it stays within the run and its limit. How many items it tries again.
 */
export async function retryLearning(s: Session, run: Run, reason?: string): Promise<number> {
  const [{ tried }] = await refusing(() => s.tx<{ tried: number }[]>`select retry_learning(${run.id}::uuid, ${reason ?? null}) as tried`);
  return tried;
}

/** A set-aside reason in words, for how many items: "240 newsletters", "12 in threads with senders you left out". */
export function setAsideWords(reason: string, items: number, words: { item: string; items: string }, who: 'you' | 'the user' = 'you'): string {
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
      return `${count} in threads with senders ${who} left out`;
    case 'excluded folder':
      return `${count} in folders ${who} left out`;
    case 'waiting':
      return `${count} waiting, as ${who === 'you' ? 'your' : 'the user’s'} map says, or until model processing is on where they belong`;
    case 'unreadable':
      return `${count} the service couldn’t give`;
    case 'gone':
      return `${count} no longer there`;
    case 'nothing to keep':
      return `${count} with nothing to keep`;
    case 'no usable answer':
      return `${count} that got no usable answer`;
    case 'provider refused':
      return `${count} the model’s provider wouldn’t take`;
    case 'provider failed':
      return `${count} the model’s provider kept failing on`;
    default:
      return `${count} ${one ? words.item : words.items} set aside`;
  }
}
