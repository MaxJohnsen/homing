// The worker that learns from connected places (spec §8, §11), in Homing's own process. It picks
// a run that needs work and claims it for a while, so one worker works on a run at a time, across
// restarts and deploys. Then, as the run's owner, it fetches one page of the place's changes,
// outside any transaction, skips what the run already processed, sets aside what needs no model,
// and hands each thread to the interpretation step, whose model calls the run's own limit holds.
// What a thread taught is written on the owner's private side in the same transaction that marks
// its items processed, so a crash repeats only what wasn't marked. Only then does the run's
// checkpoint move on. It stops at once when its owner pauses the run, waits and tries again when
// the system or the model's provider fails, and never acts in the place it reads.

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { routineAgent } from './assistants.ts';
import { ConnectionUnusable, kindOf, messageOf, Unanswered } from './connections.ts';
import type { Change, Changes } from './connectors.ts';
import { AccessDenied, withPrincipal, type Principal, type Session, type Sql } from './db.ts';
import { Unusable, type Ask, type Learned } from './interpret.ts';
import { addSource, createPage, insertItem, updateItem, visible } from './knowledge.ts';
import { asOwner, batchesOf, setAside, type Learning, type Run } from './learning.ts';
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
}

/**
 * Works on a claimed run for one page of its place's changes, as its owner, and hands the claim
 * back: with the checkpoint moved on once every item of the page is marked, or as it was when
 * something on the way has to wait.
 */
export async function learnPage(sql: Sql, l: Learning, worker: string, claimed: Claimed, options: LearnerOptions = {}, signal: AbortSignal = new AbortController().signal): Promise<void> {
  const pace = { ...defaults, ...options };
  const principal = routineFor(claimed.person);
  const found = await withPrincipal(sql, principal, async (s) => {
    const [row] = await s.tx<(Omit<Claim, 'limit' | 'leftOut' | 'extending' | 'owner'> & { extensionSince: Date | null; extensionUntil: Date | null; spendingLimit: string; excludedSenders: string[]; excludedFolders: string[] })[]>`
      select r.id, r.place_id as place, r.space_id as space, r.connection_id as connection, r.state, r.reason, r.since, r.learned_up_to, r.caught_up_at,
             r.extension_since, r.extension_until, r.spending_limit, r.estimate, r.excluded_senders, r.excluded_folders, r.started_at,
             r.checkpoint, r.extension_checkpoint, r.attempts
      from learning_runs r
      where r.id = ${claimed.run}::uuid and r.claimed_by = ${worker}::uuid
    `;
    return row && { row, place: await ownPlace(s, row.place) };
  });
  if (!found) return;
  const { row, place } = found;
  const run: Claim = {
    ...row,
    owner: claimed.person,
    extending: row.extensionSince && row.extensionUntil ? { since: row.extensionSince, until: row.extensionUntil } : null,
    limit: Number(row.spendingLimit),
    leftOut: { senders: row.excludedSenders, folders: row.excludedFolders },
  };
  /** Hands the claim back with the checkpoint as it was, to carry on after a wait. */
  const later = async (waitSeconds: number, trouble: 'failing' | 'sign in again' | 'not set up' | 'monthly limit' | null = null) => {
    try {
      await withPrincipal(sql, principal, (s) => s.tx`select learning_later(${run.id}::uuid, ${worker}::uuid, ${Math.round(waitSeconds)}::integer, ${trouble})`);
    } catch (error) {
      // Another worker took the run over meanwhile, or its owner can't open its space any more.
      if (!(error instanceof postgres.PostgresError && error.code === '42501')) throw error;
    }
  };
  const failing = () => later(Math.min(pace.backoffSeconds * 2 ** run.attempts, 3600), 'failing');
  // Removed meanwhile, or its account revoked: the next look ends the run. And Homing stopping asks nothing more.
  if (!place || signal.aborted) return later(0);
  const connector = l.broker.connectors.get(place.connector);
  const follow = kindOf(connector, place.kind)?.follow;
  if (!connector || !follow) return later(0, 'not set up');

  // One page, outside any transaction: an extension's range first, then on from where the run stands.
  const walk = run.extending ? 'extension' : 'main';
  const scope = run.extending ?? { since: run.since };
  let page: Changes;
  try {
    page = await asOwner(l.broker, principal, place, AbortSignal.any([signal, AbortSignal.timeout(pageTimeLimit)]), (access) =>
      follow.changes(access, walk === 'extension' ? run.extensionCheckpoint : run.checkpoint, scope),
    );
  } catch (error) {
    if (signal.aborted) return later(0);
    if (error instanceof ConnectionUnusable) return error.reason === 'gone' ? later(0) : later(0, error.reason === 'needs attention' ? 'sign in again' : 'not set up');
    const meaning = connector.refused(error);
    if (!(error instanceof Unanswered) && meaning !== 'try later') {
      console.error(meaning ? `learning: ${connector.vendor} refused following a ${wordsOf(connector, place.kind).place} (${messageOf(error)})` : error);
    }
    return failing();
  }

  // What the run hasn't processed, or has in another version. The last of an item listed twice counts.
  const changes = [...new Map(page.changes.map((change) => [change.item.envelope.id, change])).values()];
  const marked = changes.length
    ? new Map(
        (
          await withPrincipal(sql, principal, (s) => s.tx<{ item: string; version: string }[]>`
            select item, version from learned_items where run_id = ${run.id}::uuid and item in ${s.tx(changes.map((change) => change.item.envelope.id))}
          `)
        ).map((mark) => [mark.item, mark.version]),
      )
    : new Map<string, string>();
  const fresh = changes.filter((change) => marked.get(change.item.envelope.id) !== change.version);

  // What needs no model is set aside at once, and counted.
  const aside = fresh.flatMap((change) => {
    const reason = setAside(change, run.leftOut);
    return reason ? [{ change, reason }] : [];
  });
  if (aside.length) {
    await withPrincipal(sql, principal, (s) => mark(s, run, worker, aside.map(({ change, reason }) => markOf(change, 'set aside', reason)), null));
  }

  const ask: Ask = (call) => callModel({ sql, model: l.model }, claimed.person, { ...call, run: run.id });
  const words = wordsOf(connector, place.kind);
  for (const batch of batchesOf(fresh.filter((change) => !aside.some((one) => one.change === change)))) {
    if (signal.aborted) return later(0);
    // Its owner may have paused it a moment ago.
    const now = await withPrincipal(sql, principal, async (s) => {
      const [row] = await s.tx<{ state: Run['state'] }[]>`select state from learning_runs where id = ${run.id}::uuid and claimed_by = ${worker}::uuid`;
      return row && { state: row.state, earlier: await earlierNote(s, run, batch.thread) };
    });
    if (!now) return;
    if (!['learning history', 'following'].includes(now.state)) return later(0);
    const off = (reason: string) => withPrincipal(sql, principal, (s) => mark(s, run, worker, batch.changes.map((change) => markOf(change, 'set aside', reason)), null));
    let learned: Learned;
    try {
      learned = await l.interpretation.learn({ space: place.space, words, thread: batch.thread, items: batch.changes.map((change) => change.item), earlier: now.earlier?.text ?? null }, ask);
    } catch (error) {
      if (error instanceof ModelRefused) {
        // Model processing is off where it lands: the one place Homing calls a model refused it before
        // anything was sent, so the thread is set aside as not processed, saying so.
        if (error.reason === 'model processing off') {
          await off('model processing off');
          continue;
        }
        // At its own limit the database paused the run, and its owner pausing it stops it here too.
        if (error.reason === 'run limit' || error.reason === 'run paused') return later(0);
        if (error.reason === 'monthly limit' || error.reason === 'paused') return later(0, 'monthly limit');
        if (error.reason === 'busy' || error.reason === 'no access') return later(busyWait);
        console.error(`learning: a run can’t call Homing’s model (${error.reason})`);
        return failing();
      }
      // Asking again would likely give the same, so it's set aside, and the run moves on.
      if (error instanceof Unusable || (error instanceof ModelFailed && error.unusable)) {
        await off('no usable answer');
        continue;
      }
      if (!(error instanceof ModelFailed)) console.error('learning: a step failed:', error);
      return failing();
    }
    await withPrincipal(sql, principal, (s) => write(s, l, run, worker, place, batch.changes, learned));
  }

  const reached = walk === 'main' ? changes.reduce<Date | null>((latest, { item }) => (item.envelope.at && (!latest || item.envelope.at > latest) ? item.envelope.at : latest), null) : null;
  try {
    await withPrincipal(sql, principal, (s) => s.tx`
      select learning_walked(${run.id}::uuid, ${worker}::uuid, ${walk}, ${page.next}, ${page.caughtUp}, ${reached}, ${Math.round(pace.pollSeconds)}::integer)
    `);
  } catch (error) {
    if (!(error instanceof postgres.PostgresError && error.code === '42501')) throw error;
  }
}

/** A processed item as the run marks it. */
function markOf(change: Change, outcome: 'learned' | 'set aside', reason: string | null) {
  return { item: change.item.envelope.id, version: change.version, thread: change.thread, outcome, reason };
}

function mark(s: Session, run: Run, worker: string, marks: ReturnType<typeof markOf>[], note: string | null) {
  return s.tx`select learning_marked(${run.id}::uuid, ${worker}::uuid, ${s.tx.json(marks as never)}, ${note}::uuid)`;
}

/**
 * What a thread taught, written on the owner's private side in the place's space, citing each of
 * its items as a source Homing read, and its items marked processed, all in this one transaction.
 * A thread learning wrote about before gets that note rewritten, while it's still learning's own;
 * what its owner or their assistant changed since stays as it is, and the note goes beside it.
 */
async function write(s: Session, l: Learning, run: Claim, worker: string, place: Place, changes: Change[], learned: Learned): Promise<void> {
  if ('nothing' in learned) {
    await mark(s, run, worker, changes.map((change) => markOf(change, 'set aside', learned.nothing)), null);
    return;
  }
  const sources: string[] = [];
  for (const { item } of changes) {
    const kept = sourceOf(l.broker.connectors, place, item);
    sources.push((await addSource(s, { spaceId: kept.spaceId, reference: kept.reference, excerpt: kept.excerpt, readThrough: kept.connection, audience: kept.audience })).id);
  }
  const earlier = await earlierNote(s, run, changes[0].thread);
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
      where c.space_id = ${place.space}::uuid and c.kind = 'title' and lower(c.body) = lower(${learned.page}) and ${visible(s, 'c')}
      order by c.created_at limit 1
    `;
    // An item of its own, even when another thread's note says the same: each is kept up to date apart.
    const pageId = page?.id ?? (await createPage(s, { spaceId: place.space, title: learned.page }));
    note = (await insertItem(s, { pageId, spaceId: place.space, privateTo: run.owner, kind: 'text', body: learned.text, sources })).id;
  }
  await mark(s, run, worker, changes.map((change) => markOf(change, 'learned', null)), note);
}

/** The note learning wrote from a thread before, while it's still current, private to the owner and as learning wrote it. */
async function earlierNote(s: Session, run: Run, thread: string | null): Promise<{ id: string; text: string } | undefined> {
  if (thread === null) return undefined;
  const [note] = await s.tx<{ id: string; text: string }[]>`
    select c.id, c.body as text
    from learned_items i join content c on c.id = i.note
    where i.run_id = ${run.id}::uuid and i.thread = ${thread} and c.kind = 'text' and c.agent = ${routineAgent}
      and c.private_to = i.private_to and not exists (select from content newer where newer.supersedes = c.id)
    order by i.processed_at desc
    limit 1
  `;
  return note;
}
