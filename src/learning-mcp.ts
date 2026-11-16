// Learning, as a person's assistant sees and directs it (spec §6, §8, §10). Homing does the
// learning. The assistant never starts it, or takes it further back: it proposes that, with the
// estimate, and the person approves exactly what they're shown. It pauses a run, resumes one that
// was paused, and adds to what it leaves out, and says how far a run has come. Only the run's
// owner's assistant gets anything: for anyone else, the reference names nothing. What has a run
// spend or send more stays the person's, in Homing itself: raising its limit, taking something
// off what's left out, keeping a sender.

import * as z from 'zod';
import type { AgentPrincipal } from './assistants.ts';
import { kindOf } from './connections.ts';
import type { Connectors, Words } from './connectors.ts';
import { withPrincipal, type Session, type Sql } from './db.ts';
import {
  estimateExtension,
  estimateLearning,
  LearningRefused,
  noModel,
  pauseLearning,
  progressOf,
  resumeLearning,
  runsFor,
  setAsideWords,
  setLeftOut,
  type Estimate,
  type Learning,
  type Run,
} from './learning.ts';
import { modelStatement, monthlyLimit, usd } from './model.ts';
import { proposeLearning, type LearningChange } from './proposals.ts';
import { oneLine, ownPlace, placeName, wordsOf, type Place } from './places.ts';

export const learningActions = ['learning.start', 'learning.pause', 'learning.resume', 'learning.extend', 'learning.leave_out'] as const;
export type LearningAction = (typeof learningActions)[number];

const from = () => z.string().trim().min(1).max(100).describe('What Homing learns from, as `context` gives it, such as learning:…');
const since = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('How far back to learn, as YYYY-MM-DD');
const leftOut = () => z.array(z.string().trim().min(1).max(320)).max(200).optional();

export const learningInputs = {
  'learning.start': z
    .strictObject({
      from: from(),
      since: since(),
      limit: z.number().min(0).max(1_000_000).optional().describe("The run's limit in dollars, if the user named one. By default the one Homing suggests from its estimate"),
    })
    .describe('For learning.start'),
  'learning.pause': z.strictObject({ from: from() }).describe('For learning.pause and learning.resume'),
  'learning.resume': z.strictObject({ from: from() }),
  'learning.extend': z.strictObject({ from: from(), since: since() }).describe('For learning.extend'),
  'learning.leave_out': z
    .strictObject({
      from: from(),
      senders: leftOut().describe('Senders to leave out, by address or domain, such as news@shop.test or shop.test. A thread with mail from one is left out whole'),
      folders: leftOut().describe('Folders to leave out, by name'),
    })
    .describe('For learning.leave_out'),
};

/** What an assistant needs around learning: Homing's own pages, to send the user to. */
export interface LearningLinks {
  connections(space: string): string;
  proposal(id: string): string;
  connectors: Connectors;
}

/** A tool's answer: text for the model, and, for a proposal, what the approval card needs. */
type Answer = string | { text: string; structuredContent: Record<string, unknown> };

/** The reference to Homing's learning from one of the user's places. */
export const learningRef = (place: string) => `learning:${place}`;

/** The place a learning reference names, or undefined when the value isn't one. */
export function learningPlace(value: string): string | undefined {
  return /^learning:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value.trim())?.[1]?.toLowerCase();
}

const missing = 'There is no learning with that reference that you can see.';
const day = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const counted = (count: number, one: string, several: string) => `${count.toLocaleString('en-US')} ${count === 1 ? one : several}`;

/** The user's place a reference names, with its run, if it has one. The same refusal for anyone else's as for none. */
async function named(s: Session, value: string): Promise<{ place: Place; run: Run | undefined }> {
  const id = learningPlace(value);
  const place = id && (await ownPlace(s, id));
  if (!place) throw new LearningRefused(id ? missing : `"${oneLine(value)}" isn't a reference to learning. They look like learning:…, as \`context\` gives them.`);
  return { place, run: (await runsFor(s, [place.place])).get(place.place) };
}

/** Where a run stands, in a few words that fit after "Homing learns from …:". */
function standing(run: Run, vendor: string, service: string): string {
  const back = `back to ${day(run.since)}`;
  const waiting =
    run.waitingFor === 'provider'
      ? ', waiting for the model’s provider, which isn’t answering, and trying again by itself'
      : run.waitingFor === 'system'
        ? `, waiting for ${vendor}, which isn’t answering, and trying again by itself`
        : run.waitingFor === 'error'
          ? ', failing on something of Homing’s own, and trying again by itself'
          : '';
  switch (run.state) {
    case 'estimating':
      return `estimated ${back}, not started`;
    case 'learning history':
      return (
        (run.extending
          ? `learning history from ${day(run.extending.since)} to ${day(run.extending.until)}, which was added to it`
          : `learning history ${back}${run.learnedUpTo ? `, so far up to ${day(run.learnedUpTo)}` : ''}`) + waiting
      );
    case 'following':
      return (
        (run.extending
          ? `following what arrives, and learning history from ${day(run.extending.since)} to ${day(run.extending.until)}, which was added to it` +
            (run.waitingAtLimit ? ` and waits at its limit of ${usd(run.limit)} until the user raises it in Homing` : '')
          : `history learned ${back}, now following what arrives`) + waiting
      );
    case 'paused':
      return run.reason === 'limit'
        ? `paused at its limit of ${usd(run.limit)}, which only the user raises, in Homing`
        : run.reason === 'monthly limit'
          ? 'paused at this Homing’s monthly limit, until whoever looks after Homing sets it again or the month ends'
          : run.reason === 'model processing off'
            ? 'waiting, since model processing is off in its space, and carries on once an admin there turns it on'
            : 'paused';
    case 'needs attention':
      return run.reason === 'sign in again' ? `waiting for the user to sign in to ${vendor} again in Homing` : `stopped, since this Homing isn’t set up to reach ${service} any more`;
    case 'done':
      return 'ended, since it isn’t connected there any more';
  }
}

/**
 * What context says about learning from the user's places that can be learned from: one short
 * line for each, with its reference, or nothing when Homing has no model and nothing is learned.
 */
export function learningLines(l: Learning, places: Place[], runs: Map<string, Run>): string[] {
  return places.flatMap((place) => {
    const connector = l.broker.connectors.get(place.connector);
    if (!connector || !kindOf(connector, place.kind)?.follow) return [];
    const run = runs.get(place.place);
    if (!run) return l.model ? [`Homing can learn from ${placeName(place)} when the user asks (${learningRef(place.place)}).`] : [];
    if (run.state === 'done') return [];
    return [`Homing learns from ${placeName(place)}: ${standing(run, connector.vendor, connector.name)} (${learningRef(place.place)}).`];
  });
}

/** An estimate in sentences, with the provider and model that would read it, saying plainly that it's rough. */
function estimateText(l: Learning, estimate: Estimate, words: Words, vendor: string): string {
  const range = estimate.until ? `from ${day(estimate.since)} to ${day(estimate.until)}` : `back to ${day(estimate.since)}`;
  if (estimate.items === 0) return `${vendor} counts no ${words.items} ${range}, so there is nothing there to learn from.`;
  const thread = words.related ?? 'thread';
  const model = modelStatement(l.model);
  return (
    `${vendor} counts ${counted(estimate.items, words.item, words.items)} ${range}. About ${estimate.setAside.toLocaleString('en-US')} of them need no model and are set aside, ` +
    `and the rest make about ${counted(estimate.threads, thread, `${thread}s`)} for the model to read. ` +
    `Estimated model cost: ${usd(estimate.low)}–${usd(estimate.high)}${model ? `, with ${model.cheaper} at ${model.provider}` : ''}. ` +
    `The estimate is rough: it goes by that count and a sample of ${counted(estimate.sampled, words.item, words.items)}, and the rest may differ.`
  );
}

/** A run and how far it has come, for its owner's assistant. */
export async function readLearning(s: Session, l: Learning, links: LearningLinks, value: string): Promise<string> {
  const { place, run } = await named(s, value);
  const connector = l.broker.connectors.get(place.connector);
  const words = wordsOf(connector, place.kind);
  const [vendor, service] = [connector?.vendor ?? place.connector, connector?.name ?? place.connector];
  const title = `# Learning from the user's ${words.place} ${placeName(place)}`;
  const where = `${learningRef(place.place)}. Only the user sees it, at ${links.connections(place.space)}.`;
  const how =
    '`act` with learning.start, this reference and since, the day to go back to, estimates the cost and proposes it to the user: nothing starts until they approve it. ' +
    'learning.extend proposes learning further back the same way. learning.pause and learning.resume stop it and carry on, and learning.leave_out adds senders or folders to leave out. ' +
    'Only the user, in Homing, raises its limit, takes something off what’s left out, or keeps a sender whose mail was set aside.';
  if (!kindOf(connector, place.kind)?.follow) return [title, where, `Homing can't learn from a ${words.place} of this kind.`].join('\n');
  if (!run) return [title, where, l.model ? `Homing hasn’t learned from it. ${how}` : `Homing hasn’t learned from it. ${noModel}`].join('\n');
  const progress = await progressOf(s, run);
  const thread = words.related ?? 'thread';
  const quoted = (values: string[]) => values.map((value) => JSON.stringify(oneLine(value))).join(', ');
  return [
    title,
    where,
    '',
    `It is ${standing(run, vendor, service)}.`,
    ...(run.state !== 'estimating'
      ? [
          progress.learned
            ? `Learned from ${counted(progress.threads, thread, `${thread}s`)}, ${counted(progress.learned, words.item, words.items)} in all: what each taught is on the user's private side, with the ${words.items} as its sources.`
            : `Nothing learned from yet.`,
          ...(progress.setAside.length
            ? [
                'Set aside without learning from them:',
                ...progress.setAside.map(
                  (aside) =>
                    `- ${setAsideWords(aside.reason, aside.items, words, 'the user')}` +
                    (aside.senders.length ? `, from ${aside.senders.map((one) => `${JSON.stringify(oneLine(one.sender))} (${one.items.toLocaleString('en-US')})`).join(', ')}` : ''),
                ),
              ]
            : []),
          ...(progress.again ? [`${counted(progress.again, words.item, words.items)} set aside before will be learned from after all, as the user asked.`] : []),
          `Spent ${usd(progress.spent)} of its limit of ${usd(run.limit)} on history${progress.followed ? `, and ${usd(progress.followed)} on what arrived since, which counts against this Homing's monthly limit` : ''}. Only the user raises its limit, in Homing.`,
        ]
      : []),
    ...(run.estimate ? [`${run.state === 'estimating' ? 'The estimate' : 'Its last estimate'}: ${estimateText(l, run.estimate, words, vendor)}`] : []),
    ...(run.state === 'estimating' ? ['Nothing has started: the user starts it in Homing, or by approving what you propose with learning.start.'] : []),
    ...(run.proposed ? [`Asked about, and not learned from until the user says so: ${estimateText(l, run.proposed, words, vendor)}`] : []),
    ...(run.leftOut.senders.length ? [`Leaves out threads with mail from ${quoted(run.leftOut.senders)}.`] : []),
    ...(run.leftOut.folders.length ? [`Leaves out the folders ${quoted(run.leftOut.folders)}.`] : []),
    ...(run.leftOut.kept.length ? [`Learns from ${quoted(run.leftOut.kept)} whatever their mail says about itself, as the user chose.`] : []),
    ...(l.model ? [] : [`Homing has no model set up now, so it waits.`]),
    '',
    how,
  ].join('\n');
}

/**
 * Proposes starting or extending learning from one of the user's places, pauses or resumes it, or
 * adds to what it leaves out, as their assistant. Estimating reaches the place itself, so nothing
 * here runs inside a transaction that waits on it.
 */
export async function actOnLearning(
  sql: Sql,
  l: Learning,
  principal: AgentPrincipal,
  links: LearningLinks,
  action: LearningAction,
  input: z.infer<(typeof learningInputs)[LearningAction]>,
  card: boolean,
): Promise<Answer> {
  const { place, run } = await withPrincipal(sql, principal, (s) => named(s, input.from));
  const connector = l.broker.connectors.get(place.connector);
  const words = wordsOf(connector, place.kind);
  const vendor = connector?.vendor ?? place.connector;
  const what = `the user's ${words.place} ${placeName(place)}`;
  const inHoming = links.connections(place.space);
  const again = async (work: (s: Session, run: Run) => Promise<string>) =>
    withPrincipal(sql, principal, async (s) => {
      const now = (await runsFor(s, [place.place])).get(place.place);
      if (!now) throw new LearningRefused(`Homing hasn't learned from ${what} yet. Propose it with learning.start.`);
      return work(s, now);
    });
  /** Proposes it to the user, with exactly what they'll be shown, and says where they decide. */
  const propose = async (kind: 'start learning' | 'extend learning', estimate: Estimate, sinceDay: Date, limit: number | undefined, first: string): Promise<Answer> => {
    const model = modelStatement(l.model);
    if (!model) throw new LearningRefused(noModel);
    const change: LearningChange = {
      place: place.place,
      address: place.name ?? place.address,
      service: connector?.name ?? place.connector,
      words: { place: words.place, item: words.item, items: words.items, thread: words.related ?? 'thread' },
      since: sinceDay.toISOString(),
      ...(limit !== undefined && { limit }),
      estimate,
      provider: model.provider,
      model: model.cheaper,
    };
    const proposal = await withPrincipal(sql, principal, (s) => proposeLearning(s, { action: kind, spaceId: place.space, change }));
    const where = card
      ? `Homing shows them the estimate in a card here, to approve or not. If they can't see the card, give them this link instead: ${links.proposal(proposal.id)}`
      : `Give them this link to see the estimate and decide: ${links.proposal(proposal.id)}`;
    const text =
      `Waiting for the user's approval (proposal:${proposal.id}). ${first} ${estimateText(l, estimate, words, vendor)} ${where}\n\n` +
      'Only they can decide, so never say it has started until `read` shows it is approved.';
    return card ? { text, structuredContent: { proposal: proposal.id, link: links.proposal(proposal.id), note: text } } : text;
  };

  switch (action) {
    case 'learning.start': {
      const { since, limit } = input as z.infer<(typeof learningInputs)['learning.start']>;
      if (run && run.state !== 'estimating') {
        throw new LearningRefused(`Homing already learns from ${what}: it is ${standing(run, vendor, connector?.name ?? place.connector)}. To learn further back, propose it with learning.extend. Nothing changed.`);
      }
      const ceiling = await withPrincipal(sql, principal, async (s) => (await monthlyLimit(s)).runCeiling);
      if (limit !== undefined && limit > ceiling) throw new LearningRefused(`A learning run may spend at most ${usd(ceiling)} here, which whoever looks after Homing sets. Nothing was proposed.`);
      const estimated = await estimateLearning(l, principal, place.place, new Date(since));
      const holds = limit ?? estimated.estimate!.limit;
      return propose('start learning', estimated.estimate!, estimated.since, holds, `Nothing has started. Homing would learn from ${what} back to ${since}, with a limit of ${usd(holds)} for its history, where it pauses.`);
    }
    case 'learning.pause':
      return again(async (s, now) => ((await pauseLearning(s, now)) ? `Paused. Homing keeps where it is in ${what}, and learning.resume carries on from there.` : `Learning from ${what} isn't running, so nothing changed.`));
    case 'learning.resume':
      return again(async (s, now) => {
        if (!['paused', 'needs attention'].includes(now.state)) return `Learning from ${what} isn't paused, so nothing changed.`;
        if (now.state === 'paused' && now.reason === 'limit') {
          throw new LearningRefused(`It is paused at its limit of ${usd(now.limit)}. Only the user raises it, in Homing, which resumes it: ${inHoming}`);
        }
        // What waits for something else carries on by itself once that holds: only what was paused is resumed.
        if (now.reason !== 'person') throw new LearningRefused(`It is ${standing(now, vendor, connector?.name ?? place.connector)}, and carries on by itself then. Nothing changed.`);
        await resumeLearning(l, s, now);
        return `Resumed. Homing carries on learning from ${what} where it stopped.`;
      });
    case 'learning.extend': {
      const { since } = input as z.infer<(typeof learningInputs)['learning.extend']>;
      if (!run || run.state === 'estimating') throw new LearningRefused(`Homing hasn't started learning from ${what}. Propose it with learning.start and the day it should go back to.`);
      const added = await estimateExtension(l, principal, place.place, new Date(since));
      if (!added) return `Homing already learns from ${what} back to ${day(run.since)}, so nothing changed.`;
      const left = usd(await withPrincipal(sql, principal, async (s) => Math.max(0, run.limit - (await progressOf(s, run)).spent)));
      return propose(
        'extend learning',
        added,
        new Date(since),
        undefined,
        `Nothing has changed. Homing would also learn from ${what} back to ${since}, and only from what that adds. Its limit stays ${usd(run.limit)}, with ${left} left, where what's added waits.`,
      );
    }
    case 'learning.leave_out': {
      const { senders = [], folders = [] } = input as z.infer<(typeof learningInputs)['learning.leave_out']>;
      if (!senders.length && !folders.length) throw new LearningRefused('Give the senders or folders to leave out.');
      return again(async (s, now) => {
        const added = (have: string[], given: string[], lower: boolean) => {
          const same = (a: string, b: string) => (lower ? a.toLowerCase() === b.toLowerCase() : a === b);
          return [...have, ...given.filter((one) => !have.some((entry) => same(entry, one)))];
        };
        await setLeftOut(s, now, { senders: added(now.leftOut.senders, senders, true), folders: added(now.leftOut.folders, folders, false), kept: now.leftOut.kept });
        return (
          `Left out, for what Homing reads in ${what} from here on${senders.length ? `: a thread with mail from one of those senders is left out whole, replies to it included` : ''}. ` +
          `What it already learned stays. Only the user takes something off what's left out, in Homing: ${inHoming}`
        );
      });
    }
  }
}
