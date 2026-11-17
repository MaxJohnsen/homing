// The worker that learns from connected places (spec §8, §11), in Homing's own process. It picks
// a run that needs work and claims it for a while, so one worker works on a run at a time, across
// restarts and deploys. Then, as the run's owner, it fetches one page of the place's changes,
// outside any transaction, skips what the run already processed, sets aside what needs no model,
// and hands each thread to the interpretation step, whose model calls the run's own limit holds.
// A thread it meets for the first time at an item that doesn't carry what came before it, it reads
// with the last few items from before it.
// What a thread taught is written on the owner's private side in the same transaction that marks
// its items processed, so a crash repeats only what wasn't marked. Only then does the run's
// checkpoint move on. It sends nothing more once its owner pauses the run, waits and tries again
// by itself when the system or the model's provider fails, moves on past a thread or an item
// neither will take once it's clear that the fault is with that one, and never acts in the place
// it reads.

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { routineAgent } from './assistants.ts';
import { ConnectionUnusable, kindOf, messageOf, Unanswered } from './connections.ts';
import type { Access, Change, Changes } from './connectors.ts';
import { AccessDenied, withPrincipal, type Principal, type Session, type Sql } from './db.ts';
import { Unusable, type Ask, type Learned } from './interpret.ts';
import { addSource, createPage, insertItem, updateItem, visible } from './knowledge.ts';
import { asOwner, batchesOf, folderLeftOut, leftOutBy, leftOutIn, routeOf, senderOf, setAside, type Learning, type Route, type Run } from './learning.ts';
import { count, summaryOf, type Summarizing, type Summary } from './map.ts';
import { callModel, ModelFailed, ModelRefused } from './model.ts';
import { ownPlace, sourceOf, wordsOf, type Place } from './places.ts';
import { accessibleSpaces } from './spaces.ts';

/** How the worker paces itself. Tests set it faster. */
export interface LearnerOptions {
  /** How often it looks for runs that need work, in milliseconds. */
  tickMs?: number;
  /** How often a followed place is looked at again, in seconds. */
  pollSeconds?: number;
  /** How long a claim lasts unless the worker keeps it, in seconds, so a run whose worker stopped is taken over. */
  leaseSeconds?: number;
  /** How long a run waits after a first failure, in seconds, doubling each time up to an hour. */
  backoffSeconds?: number;
  /** How long a thread the provider failed on waits before its second try, and before its third, in seconds. */
  retrySeconds?: [number, number];
  /** How many runs it works on at once. */
  atOnce?: number;
}

const defaults = { tickMs: 5_000, pollSeconds: 5 * 60, leaseSeconds: 5 * 60, backoffSeconds: 30, retrySeconds: [60 * 60, 2 * 60 * 60] as [number, number], atOnce: 2 };
/** How long fetching one page of a place's changes may take, and what its threads are read with from before it. */
const pageTimeLimit = 90_000;
/** How long a run waits when calls under way leave no room, or the person can't open its space for now. */
const busyWait = 60;
/** How many items a page holds unless a page failed, and what it falls back to then: fewer, then one at a time. */
const pageSizes = [50, 10, 1];
/**
 * How many items from before it a thread is read with, where it's met at an item that doesn't carry
 * them: the newest, and never more than one call takes, so they're read whole or not at all.
 */
const earlierRead = 10;
/** How long one claim works on a summary of a place before it keeps how far it came and hands the run back. */
const summaryTime = 20_000;
/** How many items set aside before are learned from again at once. */
const againAtOnce = 20;
/** How often the provider may fail on one thread, hours apart, while it answers otherwise, before the thread is set aside. */
const triesForThread = 3;
/** How long a failure is kept for a thread that's neither answered nor set aside meanwhile, such as one that's gone from its place. */
const failureKept = 24 * 60 * 60 * 1000;
/**
 * How many threads in a row the provider refuses or fails on, with none answered between, before
 * that says something about the provider and nothing about the threads, but for the first of them,
 * which is counted against alone. And how many more a page then asks about before it stops asking.
 */
const several = 3;

/** How a routine of learning acts for the person: as an agent, named as Homing's own, never their assistant. */
const routineFor = (person: string): Principal => ({ person, agent: routineAgent, routine: 'learning' });

/**
 * Starts the worker. It looks for runs now and every few seconds, and works on a few at once, a
 * page at a time. Returns how to stop it: nothing new is started, a page being fetched is given
 * up, a thread being learned from is finished, and each run's claim is handed back, so another
 * worker carries on at once.
 */
export function startLearner(sql: Sql, l: Learning, options: LearnerOptions = {}): { stop(): Promise<void> } {
  const pace = { ...defaults, ...options };
  // Which of Homing's processes this is. Each claim it gets is one of its own.
  const worker = randomUUID();
  const stopping = new AbortController();
  const working = new Set<Promise<void>>();
  let looking: Promise<void> | undefined;
  const look = () => {
    if (looking || stopping.signal.aborted) return;
    looking = claimDue().finally(() => (looking = undefined));
  };
  const claimDue = async () => {
    try {
      while (!stopping.signal.aborted && working.size < pace.atOnce) {
        const claimed = await claim(sql, worker, pace.leaseSeconds);
        if (!claimed) break;
        const work: Promise<void> = learnPage(sql, l, claimed, pace, stopping.signal)
          .catch((error: unknown) => console.error('learning: a run stopped on the way:', error))
          .finally(() => {
            working.delete(work);
            // The run's next page, or another run, without waiting for the next look.
            look();
          });
        working.add(work);
      }
    } catch (error) {
      console.error('learning: looking for runs that need work failed:', error);
    }
  };
  const timer = setInterval(look, pace.tickMs);
  timer.unref();
  look();
  return {
    stop: async () => {
      stopping.abort();
      clearInterval(timer);
      // A run claimed this very moment is handed back too, before anything is asked of its place.
      await looking;
      while (working.size) await Promise.allSettled([...working]);
    },
  };
}

/** A run a worker claimed, the person it's learned for, and the claim: one of its own each time, which everything written under it names. */
export interface Claimed {
  run: string;
  person: string;
  claim: string;
}

/** Claims a run that needs work for this worker, if there is one. Homing's own, without anyone's principal. */
export async function claim(sql: Sql, worker: string, leaseSeconds = defaults.leaseSeconds): Promise<Claimed | undefined> {
  const [claimed] = await sql<Claimed[]>`select run, person, claim from claim_learning_run(${worker}::uuid, ${leaseSeconds}::integer)`;
  return claimed;
}

/**
 * A thread the provider failed on, on a walk: how often, when last, and whether as the first of
 * several in a row. Kept by the thread, or by its id for an item on its own, so the thread is
 * known as failing however its page is served or read in calls the next time. It leaves the run in
 * the database only (learning_failures): when a call of its thread is answered or set aside, with
 * the marks, or when it's a day old.
 */
type Failure = [walk: Walk, thread: string, count: number, at: number, row?: true];
/** How often a thread was counted against, when last, and whether as the first of several in a row. */
type Tries = { count: number; at: number; row?: true };

interface Claim extends Run {
  /** The person it learns for, on whose private side it writes. */
  owner: string;
  checkpoint: string | null;
  extensionCheckpoint: string | null;
  attempts: number;
  /** The threads the provider failed on, on each walk. */
  failures: Failure[];
  /** How many threads in a row the provider refused, since a model last answered for one. */
  refused: number;
  /** How many items it asks for at once, after a page that failed. */
  pageSize: number | null;
  polledAt: Date | null;
  /** Whether its place held more than the connector follows, when it last looked. */
  followedPartly: boolean;
}

type Trouble = 'provider' | 'system' | 'error' | 'throttled' | 'limited' | 'sign in again' | 'not set up' | 'monthly limit' | 'model processing off';
type Walk = 'main' | 'extension' | 'again';
type Mark = ReturnType<typeof markOf>;

/** The claim no longer holds: the run was claimed again, its scope changed, or its owner can't open its space. */
const lost = (error: unknown) => error instanceof postgres.PostgresError && error.code === '42501';

/**
 * Works on a claimed run for one page, as its owner, and hands the claim back: with the checkpoint
 * moved on once every item of the page is marked, or as it was when something on the way has to
 * wait. The page is of its main walk, of a range added to its scope, or of items its owner asked
 * it to learn from after all. Whatever goes wrong on the way, the claim is handed back and the run
 * waits before it tries again.
 */
export async function learnPage(sql: Sql, l: Learning, claimed: Claimed, options: LearnerOptions = {}, signal: AbortSignal = new AbortController().signal): Promise<void> {
  const pace = { ...defaults, ...options };
  const principal = routineFor(claimed.person);
  const { claim } = claimed;
  const found = await withPrincipal(sql, principal, async (s) => {
    const [row] = await s.tx<
      {
        id: string; place: string; space: string; connection: string; state: Run['state']; reason: Run['reason']; waitingFor: Run['waitingFor']; waitingAtLimit: boolean;
        since: Date; learnedUpTo: Date | null; caughtUpAt: Date | null; extensionSince: Date | null; extensionUntil: Date | null; spendingLimit: string;
        routes: Route[]; rest: string | null; summarizing: Summarizing | null; excludedFolders: string[]; keptSenders: string[]; startedAt: Date | null;
        checkpoint: string | null; extensionCheckpoint: string | null; attempts: number; failures: Failure[] | null; refused: number; pageSize: number | null; polledAt: Date | null;
        followedPartly: boolean;
      }[]
    >`
      select r.id, r.place_id as place, r.space_id as space, r.connection_id as connection, r.state, r.reason, r.waiting_for, r.waiting_at_limit,
             r.since, r.learned_up_to, r.caught_up_at, r.extension_since, r.extension_until, r.spending_limit,
             r.routes, r.rest, r.summarizing, r.excluded_folders, r.kept_senders, r.started_at,
             r.checkpoint, r.extension_checkpoint, r.attempts, r.failures, r.refused, r.page_size, r.polled_at, r.followed_partly
      from learning_runs r
      where r.id = ${claimed.run}::uuid and r.claim = ${claim}::uuid
    `;
    if (!row) return undefined;
    const again = await s.tx<{ item: string }[]>`select item from learned_items where run_id = ${row.id}::uuid and again order by at nulls first, item limit ${againAtOnce}`;
    return { row, place: await ownPlace(s, row.place), again: again.map((mark) => mark.item) };
  });
  if (!found) return;
  const { row, place, again } = found;
  const { extensionSince, extensionUntil, spendingLimit, routes, rest: elsewhere, summarizing, excludedFolders, keptSenders, ...rest } = row;
  const run: Claim = {
    ...rest,
    map: { routes, rest: elsewhere },
    summarizing: summarizing !== null,
    summarized: null,
    owner: claimed.person,
    extending: extensionSince && extensionUntil ? { since: extensionSince, until: extensionUntil } : null,
    limit: Number(spendingLimit),
    estimate: null,
    proposed: null,
    leftOut: { senders: leftOutBy(routes), folders: excludedFolders, kept: keptSenders },
    // Kept as a list, since a thread's id is no name for the database's client to reword.
    failures: row.failures ?? [],
  };
  /** Hands the claim back with the checkpoint as it was, to carry on after a wait, with what this try counted against threads for the run to keep. */
  const later = async (waitSeconds: number, trouble: Trouble | null = null, keep: { counted?: Failure[]; pageSize?: number } = {}) => {
    try {
      await withPrincipal(sql, principal, (s) => s.tx`
        select learning_later(${run.id}::uuid, ${claim}::uuid, ${Math.round(waitSeconds)}::integer, ${trouble}, ${keep.counted ? s.tx.json(keep.counted as never) : null}::jsonb, ${keep.pageSize ?? null}::integer)
      `);
    } catch (error) {
      if (!lost(error)) throw error;
    }
  };
  /** Waits longer each time, up to an hour, or as long as it was asked to if that's longer, and keeps trying. */
  const backoff = (trouble: 'provider' | 'system' | 'error', keep: Parameters<typeof later>[2] = {}, atLeast = 0) =>
    later(Math.max(Math.min(pace.backoffSeconds * 2 ** run.attempts, 3600), atLeast), trouble, keep);

  try {
    // Removed meanwhile, or its account revoked: the next look ends the run. And Homing stopping asks nothing more.
    if (!place || signal.aborted) return await later(0);
    const connector = l.broker.connectors.get(place.connector);
    const follow = kindOf(connector, place.kind)?.follow;
    if (!connector || !follow) return await later(0, 'not set up');

    // Which walk: through history, a range added to its scope and what its owner asked for again come
    // first. Once it follows, they take turns with what arrives, which is looked at when it's time,
    // and they wait while the run's limit leaves them no room.
    const waits = run.caughtUpAt !== null && run.waitingAtLimit;
    const backlog: Walk | null = waits ? null : again.length ? 'again' : run.extending ? 'extension' : null;
    const due = run.polledAt === null || run.polledAt.getTime() + pace.pollSeconds * 1000 <= Date.now();
    const walk: Walk = run.caughtUpAt === null ? (backlog ?? 'main') : backlog && !due ? backlog : 'main';
    const scope = walk === 'extension' ? run.extending! : { since: run.since };
    const size = run.pageSize ?? pageSizes[0];

    // What the place gives, outside any transaction, as its owner, within a time limit.
    const fetched = <T>(read: (access: Access) => Promise<T>) => asOwner(l.broker, principal, place, AbortSignal.any([signal, AbortSignal.timeout(pageTimeLimit)]), read);
    const unfetched = async (error: unknown) => {
      if (signal.aborted) return await later(0);
      if (error instanceof ConnectionUnusable) return await (error.reason === 'gone' ? later(0) : later(0, error.reason === 'needs attention' ? 'sign in again' : 'not set up'));
      // Asked to wait, it waits that long, and that's no failure.
      const wait = connector.retryAfter?.(error);
      if (wait !== undefined) return await later(wait, 'throttled');
      const meaning = connector.refused(error);
      if (!(error instanceof Unanswered) && meaning !== 'try later') {
        console.error(meaning ? `learning: ${connector.vendor} refused following a ${wordsOf(connector, place.kind).place} (${messageOf(error)})` : error);
      }
      // A page the system couldn't serve, or not in time, is asked for again in smaller parts: fewer
      // at once, then one at a time, where an item it can't give is set aside.
      return await backoff('system', { pageSize: pageSizes.find((smaller) => smaller < size) ?? 1 });
    };
    // A summary of the place was asked for: who writes there, counted from the connector's listing, a
    // few pages at a time, with how far it came kept between them. No model, and nothing of any
    // item's text. It comes before the run's walks, and a run that isn't started has nothing else.
    if (summarizing) {
      const keep = (working: Summarizing | null, summary: Summary | null) =>
        withPrincipal(sql, principal, (s) => s.tx`
          select learning_summarized(${run.id}::uuid, ${claim}::uuid, ${working ? s.tx.json(working as never) : null}::jsonb, ${summary ? s.tx.json(summary as never) : null}::jsonb)
        `);
      const list = follow.summary;
      // A place that can't be listed has no summary: the request is let go of.
      if (!list) return void (await keep(null, null));
      let working = summarizing;
      const until = Date.now() + summaryTime;
      try {
        do {
          const listed = await fetched((access) => list(access, working.next ?? null, { since: new Date(working.since) }));
          working = { ...count(working, listed.listed, place.address), next: listed.next };
        } while (working.next && Date.now() < until && !signal.aborted);
      } catch (error) {
        if (error instanceof ConnectionUnusable) return void (await keep(null, null));
        return await unfetched(error);
      }
      return void (await keep(working.next ? working : null, working.next ? null : summaryOf(working)));
    }

    let page: Changes;
    try {
      page = await fetched(async (access) =>
        walk === 'again'
          ? { changes: await follow.items(access, again), next: '', caughtUp: false }
          : follow.changes(access, walk === 'extension' ? run.extensionCheckpoint : run.checkpoint, scope, { size }),
      );
    } catch (error) {
      return await unfetched(error);
    }

    // What the run hasn't processed, or has in another version, or was asked to learn from after all.
    // The last of an item listed twice counts, and nothing from before the run's scope does.
    const changes = [...new Map(page.changes.map((change) => [change.item.envelope.id, change])).values()].filter(
      ({ item }) => walk === 'again' || item.envelope.at === null || item.envelope.at.getTime() >= run.since.getTime(),
    );
    type Marked = { version: string; again: boolean; outcome: string; reason: string | null; interpretation: string | null; folder: string | null };
    const marked = changes.length
      ? new Map(
          (
            await withPrincipal(sql, principal, (s) => s.tx<({ item: string } & Marked)[]>`
              select item, version, again, outcome, reason, interpretation, folder from learned_items where run_id = ${run.id}::uuid and item in ${s.tx(changes.map((change) => change.item.envelope.id))}
            `)
          ).map((mark) => [mark.item, mark]),
        )
      : new Map<string, Marked>();
    // What was set aside without a model is looked at again once it's somewhere else, as when it's
    // taken out of junk: where it is was part of why.
    const moved = (mark: Marked, change: Change) => mark.outcome === 'set aside' && mark.interpretation === null && mark.folder !== change.folder;
    const fresh = changes.filter((change) => {
      const mark = marked.get(change.item.envelope.id);
      return walk === 'again' || !mark || mark.again || mark.version !== change.version || moved(mark, change);
    });

    // What needs no model is set aside at once, and counted: by its own signs, by where it is, by who
    // sent it, and whole threads that hold mail from a sender its owner left out.
    const aside: Mark[] = [];
    let kept: Change[] = [];
    const sort = (given: Change[]) => {
      for (const change of given) {
        const why = setAside(change, run.leftOut);
        if (why) aside.push(markOf(change, 'set aside', why.reason, why.because));
        else kept.push(change);
      }
    };
    sort(fresh);
    for (const thread of batchesOf(kept, Number.MAX_SAFE_INTEGER)) {
      const entry = leftOutIn(thread.changes, run.leftOut);
      if (!entry) continue;
      aside.push(...thread.changes.map((change) => markOf(change, 'set aside', 'excluded sender', entry)));
      kept = kept.filter((change) => !thread.changes.includes(change));
    }

    // Where each thread that's left belongs, by its owner's map: a space they can open, which gets
    // its note, or the place's own without a map. One that's to wait, or whose space they can't open
    // now, is set aside as waiting, and what everything else is left out by is left out: neither is
    // read, and neither costs anything.
    const named = [...new Set([...run.map.routes.map((route) => route.to), run.map.rest ?? 'wait'])].filter((to) => to !== 'leave out' && to !== 'wait');
    const reachable = new Set(
      named.length ? (await withPrincipal(sql, principal, (s) => s.tx<{ id: string }[]>`select id from spaces where id in ${s.tx(named)} and archived_at is null and id in (${accessibleSpaces(s)})`)).map((space) => space.id) : [],
    );
    const routed = new Map<string, Routed>();
    for (const thread of batchesOf(kept, Number.MAX_SAFE_INTEGER)) {
      const { to, entry } = routeOf(thread.changes, run.map, place.address);
      if (to === null || reachable.has(to)) {
        routed.set(thread.thread ?? thread.changes[0].item.envelope.id, { space: to ?? place.space, entry });
        continue;
      }
      aside.push(...thread.changes.map((change) => markOf(change, 'set aside', to === 'leave out' ? 'excluded sender' : 'waiting', entry, null, entry === null)));
      kept = kept.filter((change) => !thread.changes.includes(change));
    }

    // A thread the run meets for the first time, at an item that doesn't carry what came before it:
    // the last few from before it are fetched and read first, all in the thread's first call, and
    // marked like the rest, so going further back later finds them read. What's set aside of such a
    // thread is marked only once the page's calls are done: until its first call is, the thread has
    // no mark, and a page that stopped before that does all of this again. Nothing is fetched for
    // what's learned from again: it was set aside, so its thread has marks, and the odd one without loses nothing.
    const met = follow.earlier && walk !== 'again' ? await firstMet(sql, principal, run, kept, new Set(changes.map((change) => change.item.envelope.id)), Math.min(earlierRead, l.interpretation.most)) : [];
    if (met.length) {
      const earlier: Change[] = [];
      try {
        await fetched(async (access) => {
          for (const { change, ids } of met) earlier.push(...(await follow.earlier!(access, change, ids, { from: page.next, size })));
        });
      } catch (error) {
        return await unfetched(error);
      }
      if (signal.aborted) return await later(0);
      sort(earlier);
    }
    const withEarlier = new Set(met.map(({ change }) => change.thread));
    const [held, now] = [aside.filter((mark) => withEarlier.has(mark.thread)), aside.filter((mark) => !withEarlier.has(mark.thread))];
    // What was asked for again and isn't there any more has nothing left to learn from.
    if (walk === 'again') {
      for (const item of again.filter((id) => !changes.some((change) => change.item.envelope.id === id))) {
        now.push({ item, version: 'gone', thread: null, outcome: 'set aside', reason: 'gone', sender: null, at: null, because: null, interpretation: null, folder: null, unplaced: false });
      }
    }
    if (now.length) await withPrincipal(sql, principal, (s) => mark(s, run, claim, now, null));

    const read = `${l.interpretation.name} ${l.interpretation.version}`;
    // How many of this page's calls a model answered, in this try, and how many threads in a row the
    // provider refused or failed on since it last answered one. However many it set aside in a row
    // before, a page still asks about a few.
    let answered = 0;
    let inARow = Math.min(run.refused, several);
    const call: Ask = (asked) => callModel({ sql, model: l.model }, claimed.person, { ...asked, run: run.id, walk, claim });
    const ask: Ask = async (asked) => {
      const answer = await call(asked);
      answered++;
      inARow = 0;
      return answer;
    };
    /** Whether the provider answers otherwise: a call of this page was answered, or else one that carries nothing is, asked once. */
    let pinged: Promise<boolean> | undefined;
    const answersOtherwise = async () => answered > 0 || (await (pinged ??= answers(call, place.space)));
    const words = wordsOf(connector, place.kind);
    const batches = batchesOf(kept, l.interpretation.most);
    type Batch = (typeof batches)[number];
    const keyOf = (batch: Batch) => batch.thread ?? batch.changes[0].item.envelope.id;
    const onPage = new Set(batches.map(keyOf));
    // The threads the provider failed on before, on this walk, on this page or another, and when
    // each is tried next. What this try counts is kept here too, and handed back for the run to keep.
    const failing = new Map(run.failures.filter(([of, , , at]) => of === walk && at > Date.now() - failureKept).map(([, key, count, at, row]): [string, Tries] => [key, { count, at, ...(row && { row }) }]));
    const counts = new Map<string, Tries>();
    const countAgainst = (key: string, tries: Tries) => {
      failing.set(key, tries);
      counts.set(key, tries);
    };
    const next = ({ count, at }: Tries) => at + pace.retrySeconds[Math.min(count, pace.retrySeconds.length) - 1] * 1000;
    const countedNow = (): Failure[] => [...counts].map(([key, { count, at, row }]): Failure => (row ? [walk, key, count, at, true] : [walk, key, count, at]));
    // The calls of this page that are done with: answered, or set aside. A later call of a thread is
    // never made before its earlier one is, so a thread is read in order, and the page is done once
    // all are. The marks of such a call end what the run counted against its thread, which this
    // follows, so what comes next of the thread starts its own count.
    const settled = new Set<Batch>();
    const settle = (batch: Batch) => {
      failing.delete(keyOf(batch));
      counts.delete(keyOf(batch));
      settled.add(batch);
    };
    const to = (batch: Batch) => routed.get(keyOf(batch)) ?? { space: place.space, entry: null };
    const asideFor = async (batch: Batch, reason: string, by: string | null = read) => {
      const { entry } = to(batch);
      await withPrincipal(sql, principal, (s) => mark(s, run, claim, batch.changes.map((change) => markOf(change, 'set aside', reason, entry, by, entry === null)), null));
      settle(batch);
    };
    // Those it failed on in this try: followed by a call it answered, which shows the fault was with
    // them, or since the last one it answered, which doesn't yet.
    const counted: Batch[] = [];
    let streak: Batch[] = [];
    // The provider refused or failed on several in a row, or wouldn't say whether it answers: the page isn't done, and the run waits for it.
    let trouble = false;
    /**
     * A thread refused or failed on as one of several in a row. That's the provider's trouble, and
     * the run waits. But the run would wait for good behind threads the provider really won't take,
     * so the first of them is counted against, alone, like a thread that fails by itself: on tries
     * hours apart, each only while the provider answers otherwise. After the last, the call is set
     * aside, and the next thread is the first.
     */
    const inRow = async (batch: Batch, reason: 'provider refused' | 'provider failed'): Promise<void> => {
      const key = keyOf(batch);
      const first = [...failing].find(([thread, tries]) => tries.row && onPage.has(thread))?.[0];
      const earlier = failing.get(key);
      if ((first === undefined || first === key) && !(earlier && next(earlier) > Date.now()) && (await answersOtherwise())) {
        const tries = (earlier?.count ?? 0) + 1;
        if (tries >= triesForThread) return await asideFor(batch, reason);
        countAgainst(key, { count: tries, at: Date.now(), row: true });
      }
      trouble = true;
    };
    for (const [at, batch] of batches.entries()) {
      if (signal.aborted) return await later(0);
      const key = keyOf(batch);
      // What follows a call of its thread that isn't done with waits for it.
      if (batches.slice(0, at).some((sooner) => keyOf(sooner) === key && !settled.has(sooner))) continue;
      // Failed on before, a thread is tried again hours later, so its tries never all fall within one
      // passing fault. The first of several in a row is asked with the rest, and only counted hours
      // apart, until it fails while the provider answers for others.
      const before = failing.get(key);
      if (before && !before.row && next(before) > Date.now()) continue;
      // Nothing was answered for so many in a row that asking on says nothing more.
      if (inARow >= 2 * several) {
        trouble = true;
        break;
      }
      const where = to(batch);
      const earlier = await withPrincipal(sql, principal, (s) => earlierNote(s, run, batch.thread, where.space));
      let learned: Learned;
      try {
        learned = await l.interpretation.learn(
          { space: where.space, from: place.space, words, thread: batch.thread, items: batch.changes.map((change) => change.item), earlier: earlier?.text ?? null, earlierUpTo: earlier?.upTo ?? null },
          ask,
        );
      } catch (error) {
        if (error instanceof ModelRefused) {
          // The run was claimed again since this page began, as after its scope changed: this page sends and writes nothing more.
          if (error.reason === 'claim lost') return;
          // Model processing is off where it lands: the one place Homing calls a model refused it before
          // anything was sent. The run waits, with nothing set aside, and carries on once it's turned on.
          // Off only where this thread belongs: the thread waits, set aside without a model, and the
          // others carry on. It's learned from once it's turned on there, or its route leads elsewhere.
          if (error.reason === 'model processing off' && where.space !== place.space && !error.spaces.includes(place.space)) {
            await asideFor(batch, 'waiting', null);
            continue;
          }
          if (error.reason === 'model processing off') return await later(0, 'model processing off', { counted: countedNow() });
          // At its own limit the database paused the run, or made its older material wait, and its owner pausing it stops it here too.
          if (error.reason === 'run limit' || error.reason === 'run paused') return await later(0, null, { counted: countedNow() });
          if (error.reason === 'monthly limit' || error.reason === 'paused') return await later(0, 'monthly limit', { counted: countedNow() });
          if (error.reason === 'busy' || error.reason === 'no access') return await later(busyWait, null, { counted: countedNow() });
          console.error(`learning: a run can’t call Homing’s model (${error.reason})`);
          return await backoff('error', { counted: countedNow() });
        }
        // The model answered, and its answer can't be used: asking again would give the same. It's set aside, saying so, and the run moves on.
        if (error instanceof Unusable || (error instanceof ModelFailed && error.unusable)) {
          await asideFor(batch, 'no usable answer');
          continue;
        }
        if (!(error instanceof ModelFailed)) throw error;
        // Asked too often, or asked to wait: that's about every request, so it never counts against a
        // thread. Asked too often, the run waits as long as the provider said, and that's no failure,
        // when the call cost nothing. One that may have cost, as when the provider's answer couldn't
        // be read, and a provider that fails and says when to come back, are failures: the run waits
        // that long or as long as after any failure, whichever is longer, so a short wait is never
        // asked again at once, call after call.
        if (error.limited || error.retryAfter !== undefined) {
          return await (error.limited && error.retryAfter !== undefined && error.cost === 0
            ? later(error.retryAfter, 'limited', { counted: countedNow() })
            : backoff('provider', { counted: countedNow() }, error.retryAfter));
        }
        inARow++;
        if (error.refused) {
          // The provider refused the request as it was. That's about this thread only when the provider
          // answers otherwise, and when it isn't one of several in a row, which is how a refusal of
          // everything looks, such as for a model it no longer has.
          if (inARow < several && (await answersOtherwise())) await asideFor(batch, 'provider refused');
          else await inRow(batch, 'provider refused');
          continue;
        }
        // The provider failed on this one: the rest of the page is tried all the same, but for what follows of its thread, so one thread never holds up the others.
        streak.push(batch);
        continue;
      }
      // Answered: what failed before it on this page failed while the provider answers otherwise.
      counted.push(...streak);
      streak = [];
      await withPrincipal(sql, principal, (s) => write(s, l, run, claim, place, where, batch.changes, learned, read));
      settle(batch);
    }

    // What it failed on last counts against those threads only when there were few and the provider
    // answers otherwise. Several in a row, or a provider that answers nothing, is the provider's
    // trouble: only the first of them is counted against, and the run waits.
    if (streak.length) {
      if (inARow < several && (await answersOtherwise())) counted.push(...streak);
      else {
        await inRow(streak[0], 'provider failed');
        if (streak.length > 1) trouble = true;
      }
    }
    for (const batch of counted) {
      const key = keyOf(batch);
      const earlier = failing.get(key);
      // Asked before its next try was due, as the first of several in a row is: not another try. It
      // failed alone now, so it's no longer asked with the rest: it waits for its next try like any other.
      if (earlier && next(earlier) > Date.now()) {
        countAgainst(key, { count: earlier.count, at: earlier.at });
        continue;
      }
      const tries = (earlier?.count ?? 0) + 1;
      // Failed on three times, hours apart, while the provider answers otherwise, a call is one it won't read: it's set aside, saying so.
      if (tries >= triesForThread) await asideFor(batch, 'provider failed');
      else countAgainst(key, { count: tries, at: Date.now() });
    }
    if (trouble) return await backoff('provider', { counted: countedNow() });
    if (settled.size < batches.length) {
      // Until the first failing thread is tried again, and no longer than until what arrives is
      // looked at next. It waits for the provider, and that wait is no failure of the run's. What
      // only waited behind a call that was set aside in this try is asked about at once.
      const waiting = batches.filter((batch) => !settled.has(batch)).map((batch) => failing.get(keyOf(batch)));
      const wait = waiting.every((tries) => tries !== undefined) ? Math.max(0, Math.min(...waiting.map(next)) - Date.now()) / 1000 : 0;
      return await later(run.caughtUpAt === null ? wait : Math.min(wait, pace.pollSeconds), 'limited', { counted: countedNow() });
    }

    if (held.length) await withPrincipal(sql, principal, (s) => mark(s, run, claim, held, null));
    // Never silently: the person is told on the run, and whoever looks after Homing here, once.
    if (walk === 'main' && page.partly && !run.followedPartly) {
      console.warn(`learning: a ${words.place} holds more than Homing follows, so what arrives in the rest of it isn’t learned from`);
    }
    const reached = walk === 'main' ? changes.reduce<Date | null>((latest, { item }) => (item.envelope.at && (!latest || item.envelope.at > latest) ? item.envelope.at : latest), null) : null;
    await withPrincipal(sql, principal, (s) => s.tx`
      select learning_walked(${run.id}::uuid, ${claim}::uuid, ${walk}, ${walk === 'again' ? null : scope.since}, ${walk === 'again' ? null : page.next}, ${page.caughtUp}, ${reached}, ${Math.round(pace.pollSeconds)}::integer, ${page.partly === true})
    `);
  } catch (error) {
    if (lost(error)) return;
    // Whatever it was, the claim goes back, and the run waits before it tries again, so it never repeats what it paid for in a tight loop.
    console.error('learning: a page failed on the way:', error);
    await backoff('error');
  }
}

/**
 * The threads among these items that the run has no mark for, and whose oldest item here doesn't
 * carry what came before it, by what its change names as earlier: that item, with the ids of the
 * newest of those, so many at most, but for those the page gave itself and those in a folder left out.
 */
async function firstMet(sql: Sql, principal: Principal, run: Claim, kept: Change[], given: Set<string>, most: number): Promise<{ change: Change; ids: string[] }[]> {
  const found = batchesOf(kept, Number.MAX_SAFE_INTEGER).flatMap(({ thread, changes: [change] }) => {
    if (thread === null) return [];
    const ids = (change.earlier ?? []).filter((other) => !given.has(other.id) && !folderLeftOut(other.folder, run.leftOut)).slice(0, most).map((other) => other.id);
    return ids.length ? [{ change, ids }] : [];
  });
  if (found.length === 0) return [];
  const marked = await withPrincipal(sql, principal, (s) => s.tx<{ thread: string }[]>`
    select distinct thread from learned_items where run_id = ${run.id}::uuid and thread in ${s.tx(found.map(({ change }) => change.thread!))}
  `);
  return found.filter(({ change }) => !marked.some((one) => one.thread === change.thread));
}

/** Whether the model's provider answers at all, by a call that carries nothing of anyone's. */
async function answers(call: Ask, space: string): Promise<boolean> {
  try {
    await call({ purpose: 'sort', spaces: [space], maxTokens: 1, messages: [{ role: 'user', content: 'Answer with the word yes.' }] });
    return true;
  } catch {
    return false;
  }
}

/** A processed item as the run marks it: who sent it and when, where it was, why it was set aside and for which entry of its owner's, and which interpretation read it. */
function markOf(change: Change, outcome: 'learned' | 'set aside', reason: string | null, because: string | null = null, interpretation: string | null = null, unplaced = false) {
  return { item: change.item.envelope.id, version: change.version, thread: change.thread, outcome, reason, sender: senderOf(change) ?? null, at: change.item.envelope.at, because, interpretation, folder: change.folder, unplaced };
}

/** Where a thread belongs: the space its note goes in, and the route's entry that says so, or null when no route named anyone in it. */
interface Routed {
  space: string;
  entry: string | null;
}

function mark(s: Session, run: Run, claim: string, marks: Mark[], note: string | null) {
  return s.tx`select learning_marked(${run.id}::uuid, ${claim}::uuid, ${s.tx.json(marks as never)}, ${note}::uuid)`;
}

/**
 * What a thread taught, written on the owner's private side in the space its route names, the
 * place's own without one, citing each of its items as a source Homing read, kept where the place
 * is, and its items marked processed with the route they followed, all in this one transaction.
 * A thread learning wrote about before gets that note rewritten, while it's still learning's own;
 * what its owner or their assistant changed since stays as it is, which the database sees to, and
 * the note goes beside it.
 */
async function write(s: Session, l: Learning, run: Claim, claim: string, place: Place, where: Routed, changes: Change[], learned: Learned, read: string): Promise<void> {
  const marked = (outcome: 'learned' | 'set aside', reason: string | null) => changes.map((change) => markOf(change, outcome, reason, where.entry, read, where.entry === null));
  if ('nothing' in learned) {
    await mark(s, run, claim, marked('set aside', learned.nothing), null);
    return;
  }
  const sources: string[] = [];
  for (const { item } of changes) {
    const kept = sourceOf(l.broker.connectors, place, item);
    sources.push((await addSource(s, { spaceId: kept.spaceId, reference: kept.reference, excerpt: kept.excerpt, readThrough: kept.connection, audience: kept.audience })).id);
  }
  const earlier = await earlierNote(s, run, changes[0].thread, where.space);
  let note: string | undefined;
  if (earlier) {
    try {
      note = (await updateItem(s, earlier.id, { body: learned.text, sources }))?.id;
    } catch (error) {
      if (!(error instanceof AccessDenied)) throw error;
    }
  }
  if (!note) {
    const [page] = await s.tx<{ id: string }[]>`
      select c.page_id as id from content c
      where c.space_id = ${where.space}::uuid and c.kind = 'title' and lower(c.body) = lower(${learned.page}) and ${visible(s, 'c')}
      order by c.created_at limit 1
    `;
    // An item of its own, even when another thread's note says the same: each is kept up to date apart.
    const pageId = page?.id ?? (await createPage(s, { spaceId: where.space, title: learned.page }));
    note = (await insertItem(s, { pageId, spaceId: where.space, privateTo: run.owner, kind: 'text', body: learned.text, sources })).id;
  }
  await mark(s, run, claim, marked('learned', null), note);
}

/**
 * The note learning wrote from a thread before, in the space the thread belongs in now, while it's
 * still current, private to the owner, as learning wrote it and not shared since, with when the
 * latest item it rests on is from. A thread whose route changed gets a note of its own where it
 * belongs now, and what was written before stays where it is.
 */
async function earlierNote(s: Session, run: Run, thread: string | null, space: string): Promise<{ id: string; text: string; upTo: Date | null } | undefined> {
  if (thread === null) return undefined;
  const [note] = await s.tx<{ id: string; text: string; upTo: Date | null }[]>`
    select c.id, c.body as text, (select max(l.at) from learned_items l where l.run_id = i.run_id and l.note = c.id and l.outcome = 'learned') as up_to
    from learned_items i join content c on c.id = i.note
    where i.run_id = ${run.id}::uuid and i.thread = ${thread} and c.space_id = ${space}::uuid and c.kind = 'text' and c.agent = ${routineAgent}
      and c.private_to = i.private_to and c.published_by is null
      and not exists (select from content newer where newer.supersedes = c.id)
      and not exists (select from content copy where copy.published_from = c.id)
    order by i.processed_at desc
    limit 1
  `;
  return note;
}
