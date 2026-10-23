// Benchmark 0, scenario 2: the work after each session, rebuilt from the calls the results keep, so
// its checks can be computed again without calling a model. For the wiki, every write, edit and
// delete is applied to the seed in order. For Homing, every item saved, updated or replaced, whole
// or by edits, as Homing's answers name them. Items already on the world's pages aren't in the rebuilt work; nothing
// the checks look for is on them.

import { readFileSync } from 'node:fs';
import { applyEdits, type Edit } from '../src/knowledge.ts';
import { kroner } from './upkeep-mail.ts';
import { outdated, staleMentions, workFacts } from './upkeep-work.ts';

export interface Rebuilt {
  id: string;
  title: string;
  text: string;
  record: boolean;
  /** Its items, for a Homing page, or the whole file. */
  parts: string[];
  /** The ids of its items, for a Homing page. */
  items: string[];
}

interface Call {
  name: string;
  args: unknown;
  failed: boolean;
  answer: string;
}

export const isRecord = (title: string) => /session|\blog\b|handoff|hand-off|økt|journal|work ?log/i.test(title);

function pathOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const path = value.trim().replace(/^\/+/, '');
  if (!/^[\p{L}\p{N}_\-./ ]+\.md$/u.test(path) || path.split('/').some((part) => part === '..' || part === '.' || !part)) return undefined;
  return path;
}

const seedFile = new URL('results/upkeep-stores/wiki-seed.json', import.meta.url).pathname;

/** The work after each session of an arm, from its sessions' calls in order. */
export function rebuild(approach: string, sessions: { calls?: Call[] }[]): Rebuilt[][] {
  return approach === 'wiki' ? rebuildWiki(sessions) : rebuildHoming(sessions);
}

function rebuildWiki(sessions: { calls?: Call[] }[]): Rebuilt[][] {
  const seed = new Map(Object.entries(JSON.parse(readFileSync(seedFile, 'utf8')) as Record<string, string>));
  const files = new Map(seed);
  return sessions.map((session) => {
    for (const call of session.calls ?? []) {
      const args = (typeof call.args === 'object' && call.args ? call.args : {}) as Record<string, unknown>;
      const path = pathOf(args.path);
      if (!path) continue;
      if (call.name === 'wiki_write' && /^(Wrote|Replaced)/.test(call.answer)) files.set(path, String(args.content));
      if (call.name === 'wiki_edit' && /^Edited/.test(call.answer)) files.set(path, files.get(path)!.replace(String(args.old_text), () => String(args.new_text)));
      if (call.name === 'wiki_delete' && /^Deleted/.test(call.answer)) files.delete(path);
    }
    return [...files.entries()].filter(([path, text]) => seed.get(path) !== text && path !== 'index.md').map(([path, text]) => ({ id: path, title: path, text, record: isRecord(path), parts: [text], items: [] }));
  });
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const added = new RegExp(`as item:(${uuid}), on (?:the new page|the page|the archived page) "(.*)" \\(page:(${uuid})\\)`);
const updated = new RegExp(`^Updated item:(${uuid})`);
const replaced = new RegExp(`^Saved as item:(${uuid})(?: on your private side)?\\..*?item:(${uuid})`);

function rebuildHoming(sessions: { calls?: Call[] }[]): Rebuilt[][] {
  const pages = new Map<string, { title: string; items: string[] }>();
  const bodies = new Map<string, string>();
  let overview: string | undefined;
  return sessions.map((session) => {
    for (const call of session.calls ?? []) {
      if (call.name !== 'remember' || call.failed) continue;
      const args = (typeof call.args === 'object' && call.args ? call.args : {}) as Record<string, unknown>;
      if (args.task !== undefined) continue;
      // Edits are made to the text of the item they name, as Homing makes them. Homing keeps the text trimmed.
      const named = new RegExp(`^item:(${uuid})$`, 'i').exec(String(args.updates ?? args.replaces ?? '').trim())?.[1].toLowerCase();
      const made = Array.isArray(args.edits) && named && bodies.has(named) ? applyEdits(bodies.get(named)!, args.edits as Edit[]) : undefined;
      const text = typeof args.text === 'string' ? args.text.trim() : made && 'text' in made ? made.text.trim() : undefined;
      if (text === undefined) continue;
      if (args.overview) {
        overview = text;
        continue;
      }
      const isNew = added.exec(call.answer);
      const isUpdate = updated.exec(call.answer);
      const isReplace = replaced.exec(call.answer);
      if (isNew) {
        const [, item, title, page] = isNew;
        const known = pages.get(page) ?? { title, items: [] };
        if (!bodies.has(item)) known.items.push(item);
        bodies.set(item, text);
        pages.set(page, known);
      } else if (isUpdate) {
        bodies.set(isUpdate[1], text);
      } else if (isReplace) {
        const [, item, old] = isReplace;
        const page = [...pages.values()].find((candidate) => candidate.items.includes(old));
        if (page) page.items[page.items.indexOf(old)] = item;
        bodies.set(item, text);
      }
    }
    const docs = [...pages.entries()].map(([id, page]) => {
      const parts = page.items.map((item) => bodies.get(item)!);
      return { id, title: page.title, text: `# ${page.title}\n\n${parts.join('\n\n')}`, record: isRecord(page.title), parts, items: [...page.items] };
    });
    return overview === undefined ? docs : [...docs, { id: 'overview', title: 'Overview', text: overview, record: false, parts: [overview], items: [] }];
  });
}

const has = (text: string, all: RegExp[][]) => all.every((fact) => fact.some((pattern) => pattern.test(text)));

/** How many slides a text lays out, as "Slide 3", "## 3." or a numbered line: whichever it uses most. */
const slides = (text: string) =>
  Math.max(
    (text.match(/\bslide\s*\d+/gi) ?? []).length,
    (text.match(/^#{1,4}\s*(slide\s*)?\d+[.):—\s-]/gim) ?? []).length,
    (text.match(/^\s*\d{1,2}[.)]\s+\S/gm) ?? []).length,
  );

/**
 * The checks of the work after session n (from 1), from the rebuilt work. Two were added after run
 * 1, to see where an edit of part of the work landed: whether the third-party dependency is in the
 * outline itself, the item or file holding most of its slides, and whether the note on a nightly
 * import is on the page or in the file with Composa's integration estimate. And Ana's remark "not
 * for the brief" counts only where it is in the brief: a page or file with most of its facts.
 */
export function checkWork(docs: Rebuilt[], n: number) {
  const work = docs.map((doc) => doc.text).join('\n\n');
  const notRecords = docs.filter((doc) => !doc.record).map((doc) => doc.text).join('\n\n');
  // The outline: the part with the most slides, on a page or in a file named as an outline or a presentation if there is one.
  const named = docs.filter((doc) => !doc.record && /outline|presentation|slides|lysbilde/i.test(doc.title));
  const outline = (named.length ? named : docs.filter((doc) => !doc.record))
    .flatMap((doc) => doc.parts)
    .sort((a, b) => slides(b) - slides(a))[0];
  // The brief is any page or file, not a record, holding most of session 1's facts.
  const briefFacts = workFacts.filter((fact) => ['parts', 'live-by', 'dynamics', 'time-to-market'].includes(fact.id));
  const briefs = docs.filter((doc) => !doc.record && briefFacts.filter((fact) => has(doc.text, fact.all)).length >= 3);
  const nightly = docs.find((doc) => !doc.record && /night|nattlig|daily|once a day/i.test(doc.text) && kroner(200).some((pattern) => pattern.test(doc.text)));
  return {
    facts: Object.fromEntries(workFacts.filter((fact) => fact.from <= n).map((fact) => [fact.id, has(work, fact.all)])),
    stale: Object.fromEntries(outdated.filter((value) => value.from <= n).map((value) => [value.id, staleMentions(notRecords, value)])),
    remarkInBrief: briefs.some((doc) => /friend|venn/i.test(doc.text)),
    ...(n >= 4 && { inOutline: outline !== undefined && slides(outline) >= 5 && /third.?party|tredjepart/i.test(outline) }),
    ...(n >= 5 && { withComposa: nightly !== undefined && /composa/i.test(nightly.text) && kroner(800).some((pattern) => pattern.test(nightly.text)) }),
    structure: docs
      .filter((doc) => !doc.record)
      .map((doc) => ({ title: doc.title, chars: doc.text.length, parts: doc.parts.length, largest: Math.max(0, ...doc.parts.map((part) => part.length)) })),
  };
}

interface StoredCall extends Call {
  turn?: number;
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
const writes = (call: StoredCall) =>
  ['wiki_write', 'wiki_edit', 'wiki_delete'].includes(call.name) || (call.name === 'remember' && !call.failed && typeof call.args === 'object' && (call.args as Record<string, unknown>).task === undefined);

/**
 * How a session met the work before its first write: whether it opened a page, an item or a file of
 * it with read, and whether a search or context answer showed one of its items or files. Answers are
 * kept to their first 400 characters, so an item counts as shown when its first 40 characters, or a
 * file's path, are in that part: a lower bound.
 */
export function metWork(calls: StoredCall[], before: Rebuilt[]) {
  const work = before.filter((doc) => !doc.record);
  const ids = new Set(work.flatMap((doc) => [doc.id, ...doc.items]));
  const starts = work.flatMap((doc) => doc.parts).map((part) => flat(part).slice(0, 40)).filter((start) => start.length >= 20);
  const first = calls.findIndex(writes);
  const prior = calls.slice(0, first < 0 ? undefined : first);
  const args = (call: StoredCall) => (typeof call.args === 'object' && call.args ? call.args : {}) as Record<string, unknown>;
  const opened = prior.some(
    (call) => (call.name === 'read' && ids.has(String(args(call).ref ?? '').replace(/^(page|item):/i, ''))) || (call.name === 'wiki_read' && ids.has(String(args(call).path ?? ''))),
  );
  const shown = prior.some(
    (call) =>
      ['search', 'context', 'wiki_search'].includes(call.name) &&
      (work.some((doc) => call.name === 'wiki_search' && call.answer.includes(`${doc.id}:`)) || starts.some((start) => flat(call.answer).includes(start))),
  );
  return { opened, shown };
}

/** Each work arm's rebuilt work, compared with the work saved after each session: how many pages or files match. */
export function compareSaved(
  rows: { key: string; session: string; attempt: string; approach: string; calls?: StoredCall[] }[],
  saved: (arm: string, session: string, last: boolean) => string | undefined,
) {
  const arms = new Map<string, typeof rows>();
  for (const row of rows) {
    const arm = `${row.key.split('|').slice(1, 4).join('|')}#${row.attempt}`;
    arms.set(arm, [...(arms.get(arm) ?? []), row]);
  }
  let same = 0;
  let compared = 0;
  const differ: string[] = [];
  for (const [key, sessions] of arms) {
    if (sessions.length < 5) continue;
    sessions.sort((a, b) => a.session.localeCompare(b.session));
    const states = rebuild(sessions[0].approach, sessions);
    for (const [index, session] of sessions.entries()) {
      const text = saved(key.split('#')[0], session.session, index === 4);
      if (text === undefined) continue;
      const blocks = new Map(
        text
          .split(/^===== /m)
          .filter(Boolean)
          .map((block) => {
            const [head, ...rest] = block.split('\n');
            return [head.replace(/ =====$/, '').replace(/ \(record\)$/, ''), rest.join('\n').trim()] as const;
          }),
      );
      for (const doc of states[index]) {
        compared++;
        const want = blocks.get(doc.title);
        // A Homing page saved with items from before the sessions ends with the items they wrote.
        if (want !== undefined && (want === doc.text.trim() || want.endsWith(doc.text.replace(/^# .*\n\n/, '').trim()))) same++;
        else differ.push(`${key.split('#')[0]} ${session.session} ${doc.title}`);
      }
    }
  }
  return { same, compared, differ };
}
