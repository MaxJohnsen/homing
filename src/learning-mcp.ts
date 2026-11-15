// Learning, as a person's assistant sees and directs it (spec §8, §10). Homing does the
// learning; the assistant starts it for a place of the user's, such as their mailbox, when they
// ask, after telling them the estimate, and pauses, resumes and extends it and leaves things out.
// It says how far a run has come. Only the run's owner's assistant gets anything: for anyone
// else, the reference names nothing. Raising a run's limit stays the person's, in Homing itself.

import * as z from 'zod';
import type { AgentPrincipal } from './assistants.ts';
import { kindOf } from './connections.ts';
import type { Connectors, Words } from './connectors.ts';
import { withPrincipal, type Session, type Sql } from './db.ts';
import {
  estimateLearning,
  extendLearning,
  LearningRefused,
  noModel,
  pauseLearning,
  progressOf,
  resumeLearning,
  runsFor,
  setAsideWords,
  setLeftOut,
  startLearning,
  type Estimate,
  type Learning,
  type Run,
} from './learning.ts';
import { modelStatement, usd } from './model.ts';
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
      limit: z.number().min(0).max(1_000_000).optional().describe("The run's limit in dollars, as the estimate suggests. Leave it out to get the estimate, which starts nothing"),
    })
    .describe('For learning.start'),
  'learning.pause': z.strictObject({ from: from() }).describe('For learning.pause and learning.resume'),
  'learning.resume': z.strictObject({ from: from() }),
  'learning.extend': z.strictObject({ from: from(), since: since() }).describe('For learning.extend'),
  'learning.leave_out': z
    .strictObject({
      from: from(),
      senders: leftOut().describe('Senders to leave out, by address or domain, such as news@shop.test or shop.test'),
      folders: leftOut().describe('Folders to leave out, by name'),
      remove: z.boolean().optional().describe('True to learn from these again'),
    })
    .describe('For learning.leave_out'),
};

/** What an assistant needs around learning: Homing's own pages, to send the user to. */
export interface LearningLinks {
  connections(space: string): string;
  connectors: Connectors;
}

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
  switch (run.state) {
    case 'estimating':
      return `estimated ${back}, not started`;
    case 'learning history':
      return run.extending
        ? `learning history from ${day(run.extending.since)} to ${day(run.extending.until)}, which was added to it`
        : `learning history ${back}${run.learnedUpTo ? `, so far up to ${day(run.learnedUpTo)}` : ''}`;
    case 'following':
      return `history learned ${back}, now following what arrives`;
    case 'paused':
      return run.reason === 'limit'
        ? `paused at its limit of ${usd(run.limit)}, which only the user raises, in Homing`
        : run.reason === 'monthly limit'
          ? 'paused at this Homing’s monthly limit, until whoever looks after Homing sets it again or the month ends'
          : 'paused';
    case 'needs attention':
      return run.reason === 'sign in again'
        ? `waiting for the user to sign in to ${vendor} again in Homing`
        : run.reason === 'not set up'
          ? `stopped, since this Homing isn’t set up to reach ${service} any more`
          : 'stopped after failing several times in a row, until it’s resumed';
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
  if (!kindOf(connector, place.kind)?.follow) return [title, where, `Homing can't learn from a ${words.place} of this kind.`].join('\n');
  if (!run) {
    return [
      title,
      where,
      l.model
        ? 'Homing hasn’t learned from it. When the user asks, `act` with learning.start, this reference and how far back, gives a rough estimate of the cost, and starts nothing until it’s called again with a limit.'
        : `Homing hasn’t learned from it. ${noModel}`,
    ].join('\n');
  }
  const progress = await progressOf(s, run);
  const thread = words.related ?? 'thread';
  const whoLeft = (text: string) => text.replace(/\byou left out\b/, 'the user left out');
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
            ? [`Set aside without learning from them: ${progress.setAside.map((aside) => whoLeft(setAsideWords(aside.reason, aside.items, words))).join(', ')}.`]
            : []),
          `Spent ${usd(progress.spent)} of its limit of ${usd(run.limit)} on history${progress.followed ? `, and ${usd(progress.followed)} on what arrived since, which counts against this Homing's monthly limit` : ''}. Only the user raises its limit, in Homing.`,
        ]
      : []),
    ...(run.estimate ? [`${run.state === 'estimating' ? 'The estimate' : 'Its last estimate'}: ${estimateText(l, run.estimate, words, vendor)}`] : []),
    ...(run.state === 'estimating' && run.estimate
      ? [`Nothing has started. To start it, \`act\` with learning.start, since: ${day(run.since)} and limit: ${run.estimate.limit}, the limit Homing suggests.`]
      : []),
    ...(run.leftOut.senders.length ? [`Leaves out mail from ${run.leftOut.senders.map((sender) => JSON.stringify(oneLine(sender))).join(', ')}.`] : []),
    ...(run.leftOut.folders.length ? [`Leaves out the folders ${run.leftOut.folders.map((folder) => JSON.stringify(oneLine(folder))).join(', ')}.`] : []),
    ...(l.model ? [] : [`Homing has no model set up now, so it waits.`]),
  ].join('\n');
}

/**
 * Starts, pauses, resumes or extends learning from one of the user's places, or changes what it
 * leaves out, as their assistant. Estimating reaches the place itself, so nothing here runs inside
 * a transaction that waits on it.
 */
export async function actOnLearning(sql: Sql, l: Learning, principal: AgentPrincipal, links: LearningLinks, action: LearningAction, input: z.infer<(typeof learningInputs)[LearningAction]>): Promise<string> {
  const { place, run } = await withPrincipal(sql, principal, (s) => named(s, input.from));
  const connector = l.broker.connectors.get(place.connector);
  const words = wordsOf(connector, place.kind);
  const vendor = connector?.vendor ?? place.connector;
  const what = `the user's ${words.place} ${placeName(place)}`;
  const ref = learningRef(place.place);
  const inHoming = links.connections(place.space);
  const again = async (work: (s: Session, run: Run) => Promise<string>) =>
    withPrincipal(sql, principal, async (s) => {
      const now = (await runsFor(s, [place.place])).get(place.place);
      if (!now) throw new LearningRefused(`Homing hasn't learned from ${what} yet. Start it with learning.start.`);
      return work(s, now);
    });

  switch (action) {
    case 'learning.start': {
      const { since, limit } = input as z.infer<(typeof learningInputs)['learning.start']>;
      if (run && run.state !== 'estimating') {
        throw new LearningRefused(`Homing already learns from ${what}: it is ${standing(run, vendor, connector?.name ?? place.connector)}. To learn further back, use learning.extend. Nothing changed.`);
      }
      // Started only once the estimate for this very scope was given, which the limit shows.
      if (limit !== undefined && run?.estimate && day(run.since) === since) {
        await withPrincipal(sql, principal, (s) => startLearning(l, s, run, limit));
        return (
          `Started. Homing learns from ${what} back to ${since}, in the background, with a limit of ${usd(limit)} for its history, and pauses there. ` +
          `What it learns goes on the user's private side. \`read\` ${ref} says how far it is, and the user sees it at ${inHoming}.`
        );
      }
      const estimated = await estimateLearning(l, principal, place.place, new Date(since));
      const estimate = estimated.estimate!;
      return (
        `Nothing has started. ${estimateText(l, estimate, words, vendor)} ` +
        `Tell the user the estimate. When they want it started, call learning.start again with since: ${since} and limit: ${estimate.limit}, the limit Homing suggests, where it pauses. ` +
        `Only the user sets a higher limit, in Homing: ${inHoming}`
      );
    }
    case 'learning.pause':
      return again(async (s, now) => ((await pauseLearning(s, now)) ? `Paused. Homing keeps where it is in ${what}, and learning.resume carries on from there.` : `Learning from ${what} isn't running, so nothing changed.`));
    case 'learning.resume':
      return again(async (s, now) => {
        if (!['paused', 'needs attention'].includes(now.state)) return `Learning from ${what} isn't paused, so nothing changed.`;
        if (now.state === 'paused' && now.reason === 'limit') {
          throw new LearningRefused(`It is paused at its limit of ${usd(now.limit)}. Only the user raises it, in Homing, which resumes it: ${inHoming}`);
        }
        await resumeLearning(l, s, now);
        return `Resumed. Homing carries on learning from ${what} where it stopped.`;
      });
    case 'learning.extend': {
      const { since } = input as z.infer<(typeof learningInputs)['learning.extend']>;
      if (!run || run.state === 'estimating') throw new LearningRefused(`Homing hasn't started learning from ${what}. Start it with learning.start and the day it should go back to.`);
      const added = await extendLearning(l, principal, place.place, new Date(since));
      if (!added) return `Homing already learns from ${what} back to ${day(run.since)}, so nothing changed.`;
      const left = await withPrincipal(sql, principal, async (s) => Math.max(0, run.limit - (await progressOf(s, run)).spent));
      return (
        `Extended. Homing also learns from ${what} back to ${since}, and only from what that adds. ${estimateText(l, added, words, vendor)} ` +
        `Its limit stays ${usd(run.limit)}, with ${usd(left)} left, and it pauses there. Only the user raises it, in Homing: ${inHoming}`
      );
    }
    case 'learning.leave_out': {
      const { senders = [], folders = [], remove = false } = input as z.infer<(typeof learningInputs)['learning.leave_out']>;
      if (!senders.length && !folders.length) throw new LearningRefused('Give the senders or folders to leave out.');
      return again(async (s, now) => {
        const changed = (have: string[], given: string[], lower: boolean) => {
          const same = (a: string, b: string) => (lower ? a.toLowerCase() === b.toLowerCase() : a === b);
          return remove ? have.filter((entry) => !given.some((one) => same(entry, one))) : [...have, ...given.filter((one) => !have.some((entry) => same(entry, one)))];
        };
        await setLeftOut(s, now, { senders: changed(now.leftOut.senders, senders, true), folders: changed(now.leftOut.folders, folders, false) });
        return `${remove ? 'Homing learns from them again' : 'Left out'}, for what Homing reads in ${what} from here on. What it already learned stays.`;
      });
    }
  }
}
