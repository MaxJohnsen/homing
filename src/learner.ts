// The worker that learns from connected places (spec §8, §11), in Homing's own process. It picks
// a run that needs work and claims it for a while, so one worker works on a run at a time, across
// restarts and deploys. Then, as the run's owner, it fetches one page of the place's changes,
// outside any transaction, skips what the run already processed, sets aside what needs no model,
// and hands each thread to the interpretation step, whose model calls the run's own limit holds.
// What a thread taught is written on the owner's private side in the same transaction that marks
// its items processed, so a crash repeats only what wasn't marked. Only then does the run's
// checkpoint move on. It sends nothing more once its owner pauses the run, waits and tries again
// by itself when the system or the model's provider fails, moves on past a thread or an item
// neither will take, and never acts in the place it reads.

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { routineAgent } from './assistants.ts';
import { ConnectionUnusable, kindOf, messageOf, Unanswered } from './connections.ts';
import type { Change, Changes } from './connectors.ts';
import { AccessDenied, withPrincipal, type Principal, type Session, type Sql } from './db.ts';
import { Unusable, type Ask, type Learned } from './interpret.ts';
import { addSource, cite, createPage, insertItem, updateItem, visible } from './knowledge.ts';
import { asOwner, batchesOf, leftOutIn, senderOf, setAside, type Learning, type Run } from './learning.ts';
import { callModel, ModelFailed, ModelRefused } from './model.ts';
import { ownPlace, sourceOf, wordsOf, type Place } from './places.ts';

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
  /** How many runs it works on at once. */
  atOnce?: number;
}

const defaults = { tickMs: 5_000, pollSeconds: 5 * 60, leaseSeconds: 5 * 60, backoffSeconds: 30, atOnce: 2 };
/** How long fetching one page of a place's changes may take. */
const pageTimeLimit = 90_000;
/** How long a run waits when calls under way leave no room, or the person can't open its space for now. */
const busyWait = 60;
/** How many items a page holds unless a page failed, and what it falls back to then: fewer, then one at a time. */
const pageSizes = [50, 10, 1];
/** How many items set aside before are learned from again at once. */
const againAtOnce = 20;
/** How often the provider may fail on one thread, while it answers otherwise, before the thread is set aside. */
const triesForThread = 3;

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
        const work: Promise<void> = learnPage(sql, l, worker, claimed, pace, stopping.signal)
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

/** A run a worker claimed, and the person it's learned for. */
export interface Claimed {
  run: string;
  person: string;
}

/** Claims a run that needs work for this worker, if there is one. Homing's own, without anyone's principal. */
export async function claim(sql: Sql, worker: string, leaseSeconds = defaults.leaseSeconds): Promise<Claimed | undefined> {
  const [claimed] = await sql<Claimed[]>`select run, person from claim_learning_run(${worker}::uuid, ${leaseSeconds}::integer)`;
  return claimed;
}

interface Claim extends Run {
  /** The person it learns for, on whose private side it writes. */
  owner: string;
  checkpoint: string | null;
  extensionCheckpoint: string | null;
  attempts: number;
  /** How often the provider failed on each thread of the page it's on, by the thread's first item. */
  failures: Record<string, number>;
  /** How many items it asks for at once, after a page that failed. */
  pageSize: number | null;
  polledAt: Date | null;
}

type Trouble = 'provider' | 'system' | 'error' | 'throttled' | 'sign in again' | 'not set up' | 'monthly limit' | 'model processing off';
type Walk = 'main' | 'extension' | 'again';
type Mark = ReturnType<typeof markOf>;

/** The claim is no longer this worker's: another took the run over, its scope changed, or its owner can't open its space. */
const lost = (error: unknown) => error instanceof postgres.PostgresError && error.code === '42501';

/**
 * Works on a claimed run for one page, as its owner, and hands the claim back: with the checkpoint
 * moved on once every item of the page is marked, or as it was when something on the way has to
 * wait. The page is of its main walk, of a range added to its scope, or of items its owner asked
 * it to learn from after all. Whatever goes wrong on the way, the claim is handed back and the run
 * waits before it tries again.
 */
export async function learnPage(sql: Sql, l: Learning, worker: string, claimed: Claimed, options: LearnerOptions = {}, signal: AbortSignal = new AbortController().signal): Promise<void> {
  const pace = { ...defaults, ...options };
  const principal = routineFor(claimed.person);
  const found = await withPrincipal(sql, principal, async (s) => {
    const [row] = await s.tx<
      {
        id: string; place: string; space: string; connection: string; state: Run['state']; reason: Run['reason']; waitingFor: Run['waitingFor']; waitingAtLimit: boolean;
        since: Date; learnedUpTo: Date | null; caughtUpAt: Date | null; extensionSince: Date | null; extensionUntil: Date | null; spendingLimit: string;
        excludedSenders: string[]; excludedFolders: string[]; keptSenders: string[]; startedAt: Date | null;
        checkpoint: string | null; extensionCheckpoint: string | null; attempts: number; failures: [string, number][] | null; pageSize: number | null; polledAt: Date | null;
      }[]
    >`
      select r.id, r.place_id as place, r.space_id as space, r.connection_id as connection, r.state, r.reason, r.waiting_for, r.waiting_at_limit,
             r.since, r.learned_up_to, r.caught_up_at, r.extension_since, r.extension_until, r.spending_limit,
             r.excluded_senders, r.excluded_folders, r.kept_senders, r.started_at,
             r.checkpoint, r.extension_checkpoint, r.attempts, r.failures, r.page_size, r.polled_at
      from learning_runs r
      where r.id = ${claimed.run}::uuid and r.claimed_by = ${worker}::uuid
    `;
    if (!row) return undefined;
    const again = await s.tx<{ item: string }[]>`select item from learned_items where run_id = ${row.id}::uuid and again order by at nulls first, item limit ${againAtOnce}`;
    return { row, place: await ownPlace(s, row.place), again: again.map((mark) => mark.item) };
  });
  if (!found) return;
  const { row, place, again } = found;
  const { extensionSince, extensionUntil, spendingLimit, excludedSenders, excludedFolders, keptSenders, ...rest } = row;
  const run: Claim = {
    ...rest,
    owner: claimed.person,
    extending: extensionSince && extensionUntil ? { since: extensionSince, until: extensionUntil } : null,
    limit: Number(spendingLimit),
    estimate: null,
    proposed: null,
    leftOut: { senders: excludedSenders, folders: excludedFolders, kept: keptSenders },
    // Kept as pairs, since an item's id is no name for the database's client to reword.
    failures: Object.fromEntries(row.failures ?? []),
  };
  /** Hands the claim back with the checkpoint as it was, to carry on after a wait. */
  const later = async (waitSeconds: number, trouble: Trouble | null = null, keep: { failures?: Record<string, number>; pageSize?: number } = {}) => {
    try {
      await withPrincipal(sql, principal, (s) => s.tx`
        select learning_later(${run.id}::uuid, ${worker}::uuid, ${Math.round(waitSeconds)}::integer, ${trouble}, ${keep.failures ? s.tx.json(Object.entries(keep.failures)) : null}::jsonb, ${keep.pageSize ?? null}::integer)
      `);
    } catch (error) {
      if (!lost(error)) throw error;
    }
  };
  /** Waits longer each time, up to an hour, and keeps trying. */
  const backoff = (trouble: 'provider' | 'system' | 'error', keep: Parameters<typeof later>[2] = {}) => later(Math.min(pace.backoffSeconds * 2 ** run.attempts, 3600), trouble, keep);

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

    // One page, outside any transaction.
    let page: Changes;
    try {
      page = await asOwner(l.broker, principal, place, AbortSignal.any([signal, AbortSignal.timeout(pageTimeLimit)]), async (access) =>
        walk === 'again'
          ? { changes: await follow.items(access, again), next: '', caughtUp: false }
          : follow.changes(access, walk === 'extension' ? run.extensionCheckpoint : run.checkpoint, scope, { size }),
      );
    } catch (error) {
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
    }

    // What the run hasn't processed, or has in another version, or was asked to learn from after all.
    // The last of an item listed twice counts, and nothing from before the run's scope does.
    const changes = [...new Map(page.changes.map((change) => [change.item.envelope.id, change])).values()].filter(
      ({ item }) => walk === 'again' || item.envelope.at === null || item.envelope.at.getTime() >= run.since.getTime(),
    );
    const marked = changes.length
      ? new Map(
          (
            await withPrincipal(sql, principal, (s) => s.tx<{ item: string; version: string; again: boolean }[]>`
              select item, version, again from learned_items where run_id = ${run.id}::uuid and item in ${s.tx(changes.map((change) => change.item.envelope.id))}
            `)
          ).map((mark) => [mark.item, mark]),
        )
      : new Map<string, { version: string; again: boolean }>();
    const fresh = changes.filter((change) => {
      const mark = marked.get(change.item.envelope.id);
      return walk === 'again' || !mark || mark.again || mark.version !== change.version;
    });

    // What needs no model is set aside at once, and counted: by its own signs, by where it is, by who
    // sent it, and whole threads that hold mail from a sender its owner left out.
    const aside: Mark[] = [];
    let kept: Change[] = [];
    for (const change of fresh) {
      const why = setAside(change, run.leftOut);
      if (why) aside.push(markOf(change, 'set aside', why.reason, why.because));
      else kept.push(change);
    }
    for (const thread of batchesOf(kept, Number.MAX_SAFE_INTEGER)) {
      const entry = leftOutIn(thread.changes, run.leftOut);
      if (!entry) continue;
      aside.push(...thread.changes.map((change) => markOf(change, 'set aside', 'excluded sender', entry)));
      kept = kept.filter((change) => !thread.changes.includes(change));
    }
    // What was asked for again and isn't there any more has nothing left to learn from.
    if (walk === 'again') {
      for (const item of again.filter((id) => !changes.some((change) => change.item.envelope.id === id))) {
        aside.push({ item, version: 'gone', thread: null, outcome: 'set aside', reason: 'gone', sender: null, at: null, because: null, interpretation: null });
      }
    }
    if (aside.length) await withPrincipal(sql, principal, (s) => mark(s, run, worker, aside, null));

    const read = `${l.interpretation.name} ${l.interpretation.version}`;
    let answered = 0;
    const ask: Ask = async (call) => {
      const answer = await callModel({ sql, model: l.model }, claimed.person, { ...call, run: run.id, walk });
      answered++;
      return answer;
    };
    const words = wordsOf(connector, place.kind);
    const failed: { key: string; changes: Change[] }[] = [];
    for (const batch of batchesOf(kept, l.interpretation.most)) {
      if (signal.aborted) return await later(0);
      const off = (reason: string) => withPrincipal(sql, principal, (s) => mark(s, run, worker, batch.changes.map((change) => markOf(change, 'set aside', reason, null, read)), null));
      const earlier = await withPrincipal(sql, principal, (s) => earlierNote(s, run, batch.thread));
      let learned: Learned;
      try {
        learned = await l.interpretation.learn(
          { space: place.space, words, thread: batch.thread, items: batch.changes.map((change) => change.item), earlier: earlier?.text ?? null, earlierUpTo: earlier?.upTo ?? null },
          ask,
        );
      } catch (error) {
        if (error instanceof ModelRefused) {
          // Model processing is off where it lands: the one place Homing calls a model refused it before
          // anything was sent. The run waits, with nothing set aside, and carries on once it's turned on.
          if (error.reason === 'model processing off') return await later(0, 'model processing off');
          // At its own limit the database paused the run, or made its older material wait, and its owner pausing it stops it here too.
          if (error.reason === 'run limit' || error.reason === 'run paused') return await later(0);
          if (error.reason === 'monthly limit' || error.reason === 'paused') return await later(0, 'monthly limit');
          if (error.reason === 'busy' || error.reason === 'no access') return await later(busyWait);
          console.error(`learning: a run can’t call Homing’s model (${error.reason})`);
          return await backoff('error');
        }
        // Asking again would give the same: the model's answer can't be used, or the provider won't take
        // this very request. It's set aside, saying which, and the run moves on.
        if (error instanceof Unusable || (error instanceof ModelFailed && (error.unusable || error.refused))) {
          await off(error instanceof ModelFailed && error.refused ? 'provider refused' : 'no usable answer');
          continue;
        }
        if (!(error instanceof ModelFailed)) throw error;
        // The provider failed on this one: the rest of the page is tried all the same, so one thread never holds up the others.
        failed.push({ key: batch.changes[0].item.envelope.id, changes: batch.changes });
        continue;
      }
      await withPrincipal(sql, principal, (s) => write(s, l, run, worker, place, batch.changes, learned, read));
    }

    if (failed.length) {
      const failures = Object.fromEntries(failed.map(({ key }) => [key, (run.failures[key] ?? 0) + 1]));
      // Failed on several times while the provider answers otherwise, a thread is one it won't read:
      // it's set aside, saying so. With nothing else to go by, a call that carries nothing says whether it answers.
      const often = failed.filter(({ key }) => failures[key] >= triesForThread);
      if (often.length && (answered > 0 || (await answers(ask, place.space)))) {
        for (const { key, changes } of often) {
          await withPrincipal(sql, principal, (s) => mark(s, run, worker, changes.map((change) => markOf(change, 'set aside', 'provider failed', null, read)), null));
          delete failures[key];
        }
      }
      if (Object.keys(failures).length) return await backoff('provider', { failures });
    }

    const reached = walk === 'main' ? changes.reduce<Date | null>((latest, { item }) => (item.envelope.at && (!latest || item.envelope.at > latest) ? item.envelope.at : latest), null) : null;
    await withPrincipal(sql, principal, (s) => s.tx`
      select learning_walked(${run.id}::uuid, ${worker}::uuid, ${walk}, ${walk === 'again' ? null : scope.since}, ${walk === 'again' ? null : page.next}, ${page.caughtUp}, ${reached}, ${Math.round(pace.pollSeconds)}::integer)
    `);
  } catch (error) {
    if (lost(error)) return;
    // Whatever it was, the claim goes back, and the run waits before it tries again, so it never repeats what it paid for in a tight loop.
    console.error('learning: a page failed on the way:', error);
    await backoff('error');
  }
}

/** Whether the model's provider answers at all, by a call that carries nothing of anyone's. */
async function answers(ask: Ask, space: string): Promise<boolean> {
  try {
    await ask({ purpose: 'sort', spaces: [space], maxTokens: 1, messages: [{ role: 'user', content: 'Answer with the word yes.' }] });
    return true;
  } catch {
    return false;
  }
}

/** A processed item as the run marks it: who sent it and when, why it was set aside and for which entry of its owner's, and which interpretation read it. */
function markOf(change: Change, outcome: 'learned' | 'set aside', reason: string | null, because: string | null = null, interpretation: string | null = null) {
  return { item: change.item.envelope.id, version: change.version, thread: change.thread, outcome, reason, sender: senderOf(change) ?? null, at: change.item.envelope.at, because, interpretation };
}

function mark(s: Session, run: Run, worker: string, marks: Mark[], note: string | null) {
  return s.tx`select learning_marked(${run.id}::uuid, ${worker}::uuid, ${s.tx.json(marks as never)}, ${note}::uuid)`;
}

/**
 * What a thread taught, written on the owner's private side in the place's space, citing each of
 * its items as a source Homing read, and its items marked processed, all in this one transaction.
 * A thread learning wrote about before gets that note rewritten, while it's still learning's own;
 * what its owner or their assistant changed since stays as it is, which the database sees to, and
 * the note goes beside it. A note that stands as it is only gets the items as sources.
 */
async function write(s: Session, l: Learning, run: Claim, worker: string, place: Place, changes: Change[], learned: Learned, read: string): Promise<void> {
  if ('nothing' in learned) {
    await mark(s, run, worker, changes.map((change) => markOf(change, 'set aside', learned.nothing, null, read)), null);
    return;
  }
  const sources: string[] = [];
  for (const { item } of changes) {
    const kept = sourceOf(l.broker.connectors, place, item);
    sources.push((await addSource(s, { spaceId: kept.spaceId, reference: kept.reference, excerpt: kept.excerpt, readThrough: kept.connection, audience: kept.audience })).id);
  }
  const earlier = await earlierNote(s, run, changes[0].thread);
  let note: string | undefined;
  if ('stands' in learned) {
    if (earlier) await cite(s, earlier.id, sources);
    note = earlier?.id;
  } else {
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
        where c.space_id = ${place.space}::uuid and c.kind = 'title' and lower(c.body) = lower(${learned.page}) and ${visible(s, 'c')}
        order by c.created_at limit 1
      `;
      // An item of its own, even when another thread's note says the same: each is kept up to date apart.
      const pageId = page?.id ?? (await createPage(s, { spaceId: place.space, title: learned.page }));
      note = (await insertItem(s, { pageId, spaceId: place.space, privateTo: run.owner, kind: 'text', body: learned.text, sources })).id;
    }
  }
  await mark(s, run, worker, changes.map((change) => markOf(change, 'learned', null, null, read)), note ?? null);
}

/**
 * The note learning wrote from a thread before, while it's still current, private to the owner, as
 * learning wrote it and not shared since, with when the latest item it rests on is from.
 */
async function earlierNote(s: Session, run: Run, thread: string | null): Promise<{ id: string; text: string; upTo: Date | null } | undefined> {
  if (thread === null) return undefined;
  const [note] = await s.tx<{ id: string; text: string; upTo: Date | null }[]>`
    select c.id, c.body as text, (select max(l.at) from learned_items l where l.run_id = i.run_id and l.note = c.id and l.outcome = 'learned') as up_to
    from learned_items i join content c on c.id = i.note
    where i.run_id = ${run.id}::uuid and i.thread = ${thread} and c.kind = 'text' and c.agent = ${routineAgent}
      and c.private_to = i.private_to and c.published_by is null
      and not exists (select from content newer where newer.supersedes = c.id)
      and not exists (select from content copy where copy.published_from = c.id)
    order by i.processed_at desc
    limit 1
  `;
  return note;
}
