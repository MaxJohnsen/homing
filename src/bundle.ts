// Reading an export for import (spec §3): what's in its homing.json, checked whole, what it would
// bring, and what Homing writes for it. An export is untrusted, so this runs in a worker of its own
// with limited memory (import.ts), and nothing here touches the database.

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rewriteReferences, safePath, type Manifest } from './export.ts';
import { oneLineTitle } from './knowledge.ts';
import { frontmatter } from './skills.ts';
import { cleanName, sameName } from './spaces.ts';
import { fileIn, ZipRefused } from './zip.ts';

/**
 * The most Homing takes in one import: the zip, its homing.json unpacked, the files the zip lists,
 * and the objects in homing.json, so even a small zip can't make Homing build millions of them.
 * 32 MB of homing.json is about 60,000 items, read in half a second, and written in about 4
 * seconds on a laptop, while creating spaces waits (architecture.md, "Export and import"). What the
 * preview shows has limits of its own: the rules' text, and the whole preview.
 */
export const importLimits = { upload: 100 * 1024 * 1024, manifest: 32 * 1024 * 1024, files: 250_000, objects: 2_000_000, rules: 1_000_000, preview: 5 * 1024 * 1024 };

/** The most Homing keeps of each kind of text, as its own screens and tools take them. */
const longest = { knowledge: 20_000, overview: 2_000, title: 200, rule: 4_000, file: 512 * 1024, type: 40, name: 200, task: 200, description: 20_000, excerpt: 20_000 };

/** An export Homing won't import, with the reason in words for the person. */
export class ImportRefused extends Error {
  /** The form field it's about, if any. */
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const time = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const name = text(longest.name).nullable();
const key = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const author = z.strictObject({ by: z.enum(['person', 'agent', 'routine']), person: key.nullable(), agent: name });
const side = z.enum(['shared', 'private']);
// Where something was imported from before, which an export of an import says. A new import records its own.
const imported = z.strictObject({ id: id.optional(), from: text(2000).optional(), by: key.nullable().optional(), at: time.optional() }).optional();

const manifestSchema = z.strictObject({
  format: z.literal('homing-export'),
  version: z.literal(1),
  instance: text(2000),
  exportedAt: time,
  exportedBy: z.strictObject({ person: key, name: text(longest.name) }),
  space: id,
  people: z.array(z.strictObject({ key, name })),
  spaces: z.array(z.strictObject({
    id, name: text(200), parent: id.nullable(), closed: z.boolean(), private: z.boolean(), creator: author.nullable(),
    archived: z.strictObject({ at: time, by: key.nullable() }).nullable(), createdAt: time, folder: text(10_000), imported,
  })).min(1),
  spaceArchives: z.array(z.strictObject({ space: id, archived: z.boolean(), author, at: time })),
  pages: z.array(z.strictObject({
    id, space: id, type: text(longest.type).nullable(), createdAt: time,
    archived: z.strictObject({ at: time, by: key.nullable() }).nullable(), file: text(10_000).nullable(), imported,
  })),
  items: z.array(z.strictObject({
    id, page: id, space: id, kind: z.enum(['title', 'text', 'requirement', 'preference', 'file', 'removed']),
    path: text(1000).nullable(), body: text(longest.file), visibility: side, author, createdAt: time, writtenAt: time,
    supersedes: id.nullable(), onlyHere: z.boolean().optional(), reachesDown: z.boolean().optional(), publishedFrom: id.nullable(),
    published: z.strictObject({ by: key.nullable(), at: time }).nullable(), sources: z.array(id), sourcesElsewhere: z.number().int().min(0).max(1_000_000), imported,
  })),
  revisions: z.array(z.strictObject({
    item: id, visibility: side, body: text(longest.file), author, writtenAt: time, replacedAt: time, imported,
  })),
  sources: z.array(z.strictObject({
    id, space: id, visibility: side, reference: text(longest.excerpt).nullable(), excerpt: text(longest.excerpt), author, createdAt: time, imported,
  })),
  links: z.array(z.strictObject({ item: id, from: id, to: id })),
  gathered: z.array(z.strictObject({ collection: id, page: id, visibility: side, author, createdAt: time })),
  pageArchives: z.array(z.strictObject({ page: id, archived: z.boolean(), author, at: time })),
  tasks: z.array(z.strictObject({
    id, space: id, visibility: side, title: text(longest.task), description: text(longest.description).nullable(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), assignee: key.nullable(),
    done: z.strictObject({ at: time, by: key.nullable() }).nullable(), author, createdAt: time, updatedAt: time, imported,
  })),
  // Exports from before includes were exported have none.
  includes: z.array(z.strictObject({
    id, space: id, visibility: side, waiting: z.boolean(), rules: id.nullable(), skill: id.nullable(),
    elsewhere: z.strictObject({ space: text(longest.name), skill: text(longest.name).nullable() }).nullable(), author, addedAt: time, imported,
  })).optional(),
});

/** A zip's homing.json, read and checked, with a fingerprint of it, or a refusal saying what's wrong. */
export function readExport(zip: Uint8Array): { manifest: Manifest; hash: string } {
  let json: Buffer;
  try {
    json = fileIn(Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength), 'homing.json', { files: importLimits.files, size: importLimits.manifest });
  } catch (error) {
    if (!(error instanceof ZipRefused)) throw error;
    throw new ImportRefused({
      'not a zip': 'That isn’t a zip file. Choose the zip Homing gave you when you exported a space.',
      missing: 'That zip isn’t an export from Homing: it has no homing.json.',
      'too many files': `That export has more files than Homing imports at once, ${importLimits.files.toLocaleString('en')}.`,
      'too large': tooLarge,
      damaged: 'That zip is damaged, so Homing can’t read it.',
    }[error.reason]);
  }
  // Counted before anything is built from it: every object and list starts with a bracket.
  let objects = 0;
  for (const byte of json) if (byte === 0x7b || byte === 0x5b) objects++;
  if (objects > importLimits.objects) throw new ImportRefused(tooLarge);
  let value: unknown;
  try {
    value = JSON.parse(json.toString('utf8'));
  } catch {
    throw new ImportRefused('That export’s homing.json isn’t readable, so Homing can’t import it.');
  }
  const head = value as { format?: unknown; version?: unknown };
  if (head?.format !== 'homing-export') throw new ImportRefused('That zip isn’t an export from Homing.');
  if (head.version !== 1) {
    throw new ImportRefused(typeof head.version === 'number' && head.version > 1
      ? `That export is from a newer Homing, in version ${head.version} of the format. Update this Homing to import it.`
      : 'That export is in a format this Homing doesn’t know.');
  }
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join('.').slice(0, 100);
    if (issue.code === 'too_big') throw new ImportRefused(`That export holds more than Homing keeps, so Homing won’t import it: ${where} is longer than Homing keeps.`);
    // Said briefly, however much is wrong, such as every key that doesn't belong.
    throw new ImportRefused(`That export was changed or damaged, so Homing won’t import it: ${where} ${issue.message.toLowerCase().slice(0, 200)}.`);
  }
  const manifest = parsed.data as Manifest;
  manifest.includes ??= [];
  const problem = problemIn(manifest);
  if (problem) throw new ImportRefused(`That export doesn’t hold together, so Homing won’t import it: ${problem}.`);
  return { manifest, hash: createHash('sha256').update(json).digest('hex') };
}

export const tooLarge = `That export is larger than Homing imports at once, ${importLimits.manifest / 1024 / 1024} MB of knowledge.`;

/**
 * A name as Homing shows one that came in an export: on one line, without control characters, or
 * format characters that hide or turn text around, such as direction overrides, tag characters
 * and zero-width spaces. The joiners, direction marks and soft hyphens languages need stay, as in
 * rules. A name with nothing left is no name.
 */
export function plainName(name: string): string {
  return name.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, (mark) => (kept.test(mark) ? mark : '')).trim();
}

/** The format characters languages need: soft hyphens, the Arabic letter mark, the joiners and the direction marks. */
const kept = /[\u00ad\u061c\u200c-\u200f]/;

/**
 * Whether a rule or a skill's file has characters that hide or reorder what it says, such as
 * direction overrides, tag characters and zero-width spaces, or control characters. Line breaks
 * and tabs stay, a file may start with a byte order mark, and the joiners, direction marks and
 * soft hyphens languages need stay too.
 */
function hiddenIn(text: string, kind: string): boolean {
  const controls = kind === 'file' ? /[\p{Cc}--[\t\n\r\f]]/v : /[\p{Cc}--[\t\n\r]]/v;
  return controls.test(text) || /\p{Cf}/u.test((kind === 'file' ? text.replace(/^\ufeff/, '') : text).replace(new RegExp(kept, 'g'), ''));
}

/** What doesn't hold together in an export, if anything: what points nowhere, or where it can't. */
function problemIn(m: Manifest): string | undefined {
  // Everyone named is one of the export's people, and an author is a person, an agent, or a routine.
  const people = new Set<string>();
  for (const person of m.people) {
    if (people.has(person.key)) return `${person.key} appears twice`;
    people.add(person.key);
  }
  if (!people.has(m.exportedBy.person)) return 'whoever exported it isn’t among its people';
  const authors = [
    ...m.spaces.map((space) => space.creator), ...m.spaceArchives.map((archive) => archive.author), ...m.items.map((item) => item.author),
    ...m.revisions.map((revision) => revision.author), ...m.sources.map((source) => source.author), ...m.gathered.map((gathering) => gathering.author),
    ...m.pageArchives.map((archive) => archive.author), ...m.tasks.map((task) => task.author), ...m.includes.map((include) => include.author),
  ];
  for (const author of authors) {
    const fits = !author || (author.by === 'person' ? author.person !== null && author.agent === null : author.by === 'agent' ? author.agent !== null : author.person === null && author.agent === null);
    if (!fits) return 'an author is neither a person, an agent nor a routine';
    if (author?.person && !people.has(author.person)) return `${author.person} isn’t among its people`;
  }
  const keys = [
    ...m.spaces.map((space) => space.archived?.by), ...m.pages.map((page) => page.archived?.by), ...m.items.map((item) => item.published?.by),
    ...m.tasks.flatMap((task) => [task.assignee, task.done?.by]),
  ];
  for (const person of keys) if (person && !people.has(person)) return `${person} isn’t among its people`;
  const seen = new Set<string>();
  for (const thing of [...m.spaces, ...m.pages, ...m.items, ...m.sources, ...m.tasks, ...m.includes]) {
    if (seen.has(thing.id)) return `${thing.id} appears twice`;
    seen.add(thing.id);
  }
  const spaces = new Map<string, Manifest['spaces'][number]>();
  const named = new Map<string, string[]>();
  for (const [at, space] of m.spaces.entries()) {
    if (at === 0 ? space.id !== m.space || space.parent !== null : space.parent === null || !spaces.has(space.parent)) return `space ${space.id} isn’t under the exported space`;
    try {
      const name = cleanName(space.name);
      named.get(space.parent ?? '')?.push(name) ?? named.set(space.parent ?? '', [name]);
    } catch {
      return `space ${space.id} has a name Homing doesn’t take`;
    }
    spaces.set(space.id, space);
  }
  // Spaces in one place have different names, as Homing keeps them: side by side in order, the same name is next to itself.
  for (const siblings of named.values()) {
    const sorted = siblings.sort(byName);
    const twice = sorted.find((name, at) => at > 0 && sameName(sorted[at - 1], name));
    if (twice) return `two spaces in one place are both called ${twice}`;
  }
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const once = new Set<string>();
  for (const page of m.pages) {
    if (!spaces.has(page.space)) return `page ${page.id} is in a space that isn’t in the export`;
    if (page.type === 'guidance' || page.type === 'overview') {
      if (once.has(`${page.space} ${page.type}`)) return `space ${page.space} has two ${page.type} pages`;
      once.add(`${page.space} ${page.type}`);
    } else if (page.type !== null && page.type !== 'skill' && ['guidance', 'skill', 'overview'].includes(oneLineTitle(page.type).toLowerCase())) {
      return `page ${page.id} has a type Homing keeps for itself`;
    }
    if (page.archived && notKnowledge(page.type)) return `page ${page.id} can’t be archived`;
  }
  // What each kind of page holds, and how long each kind of text may be.
  const kinds = new Map([['guidance', ['requirement', 'preference', 'removed']], ['skill', ['title', 'file', 'removed']], ['overview', ['text']]]);
  const tooLong = (item: { kind: string; body: string }, page: Manifest['pages'][number]) =>
    item.kind === 'file' ? Buffer.byteLength(item.body) > longest.file
      : item.body.length > (item.kind === 'title' ? longest.title : item.kind === 'requirement' || item.kind === 'preference' ? longest.rule : page.type === 'overview' ? longest.overview : longest.knowledge);
  const sources = new Map(m.sources.map((source) => [source.id, source]));
  for (const source of m.sources) if (!spaces.has(source.space)) return `source ${source.id} is in a space that isn’t in the export`;
  const items = new Map(m.items.map((item) => [item.id, item]));
  const reaches = (item: Manifest['items'][number]) => reachesDown(item, pages, items);
  for (const item of m.items) {
    const page = pages.get(item.page);
    if (!page || page.space !== item.space) return `item ${item.id} is on a page that isn’t in the export`;
    if (!(kinds.get(page.type ?? '') ?? ['title', 'text']).includes(item.kind)) return `item ${item.id} doesn’t belong on its page`;
    if (tooLong(item, page)) return `item ${item.id} is longer than Homing keeps`;
    if (item.kind === 'removed' && item.body !== '') return `item ${item.id} removes something, and says something too`;
    // Rules and skills are what assistants follow, so nothing in them may be hidden.
    if ((item.kind === 'requirement' || item.kind === 'preference' || item.kind === 'file') && hiddenIn(item.body, item.kind)) return `item ${item.id} has characters that hide what it says`;
    if ((item.kind === 'file') !== (item.path !== null)) return `item ${item.id} has a path only a skill’s file has`;
    if (item.path !== null && !safePath(item.path)) return `item ${item.id} has a path outside its skill`;
    if (item.sources.length && item.kind !== 'text') return `item ${item.id} cites sources, which only knowledge does`;
    if (item.sources.some((source) => !sources.has(source))) return `item ${item.id} cites a source that isn’t in the export`;
    if (new Set(item.sources).size !== item.sources.length) return `item ${item.id} cites a source twice`;
    // What an item replaced, or was shared from, is on its page.
    const replaced = item.supersedes === null ? undefined : items.get(item.supersedes);
    if ((item.supersedes !== null || item.kind === 'removed') && !(item.kind === 'text' || item.kind === 'removed')) return `item ${item.id} can’t replace anything`;
    if (item.supersedes !== null && (!replaced || replaced.page !== item.page || replaced === item)) return `item ${item.id} replaces something that isn’t on its page`;
    if (item.kind === 'removed' && (!replaced || replaced.visibility !== item.visibility)) return `item ${item.id} removes something it can’t`;
    // A removal reaches as far as what it removes, so the spaces below see it's gone.
    if (item.kind === 'removed' && item.reachesDown !== undefined && item.reachesDown !== reaches(replaced!)) return `item ${item.id} reaches further or less far than what it removes`;
    if (item.kind === 'text' && replaced && (replaced.kind !== 'text' || (item.visibility === 'shared' && replaced.visibility === 'private'))) return `item ${item.id} replaces something it can’t`;
    if (item.publishedFrom !== null) {
      const original = items.get(item.publishedFrom);
      if (!original || original.page !== item.page || original.visibility !== 'private' || item.visibility !== 'shared' || item.kind !== 'text') return `item ${item.id} was shared from something that isn’t on its page`;
    }
  }
  // And nothing replaces itself, however far round.
  if (inWritingOrder(m.items) === undefined) return 'some items replace each other in a circle';
  // A skill is named as its SKILL.md says, in lowercase words, and holds one file at each place.
  const replacedIds = new Set(m.items.map((item) => item.supersedes).filter((target) => target !== null));
  const onPage = new Map<string, Manifest['items']>();
  for (const item of m.items) if (!replacedIds.has(item.id) && item.kind !== 'removed') onPage.get(item.page)?.push(item) ?? onPage.set(item.page, [item]);
  for (const page of m.pages.filter((candidate) => candidate.type === 'skill')) {
    const live = onPage.get(page.id) ?? [];
    const paths = live.filter((item) => item.kind === 'file').map((item) => `${item.visibility} ${item.path}`);
    if (new Set(paths).size !== paths.length) return `skill ${page.id} has two files at one place`;
    for (const title of live.filter((item) => item.kind === 'title')) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(title.body) || title.body.length > 64) return `skill ${page.id} has a name Homing doesn’t take`;
      const skillMd = live.find((item) => item.path === 'SKILL.md' && item.visibility === title.visibility);
      if (skillMd && frontmatter(skillMd.body).name !== title.body) return `skill ${title.body} is named differently in its SKILL.md`;
    }
  }
  for (const revision of m.revisions) {
    const item = items.get(revision.item);
    if (!item) return 'an earlier version belongs to an item that isn’t in the export';
    if (tooLong({ kind: item.kind, body: revision.body }, pages.get(item.page)!)) return `an earlier version of item ${item.id} is longer than Homing keeps`;
    if ((item.kind === 'requirement' || item.kind === 'preference' || item.kind === 'file') && hiddenIn(revision.body, item.kind)) return `an earlier version of item ${item.id} has characters that hide what it says`;
  }
  const sharedTitle = new Set(m.items.filter((item) => item.kind === 'title' && item.visibility === 'shared').map((item) => item.page));
  const ownTitle = new Set(m.items.filter((item) => item.kind === 'title').map((item) => item.page));
  const gatherings = new Set<string>();
  for (const gathering of m.gathered) {
    const collection = pages.get(gathering.collection);
    const page = pages.get(gathering.page);
    const titled = gathering.visibility === 'shared' ? sharedTitle : ownTitle;
    if (!collection || !page || collection === page || collection.space !== page.space || notKnowledge(collection.type) || notKnowledge(page.type)
      || !titled.has(collection.id) || !titled.has(page.id)) return `a collection gathers a page it can’t`;
    const key = `${gathering.collection} ${gathering.page} ${gathering.visibility}`;
    if (gatherings.has(key)) return `a collection gathers a page twice`;
    gatherings.add(key);
  }
  for (const archive of m.pageArchives) if (!pages.has(archive.page) || notKnowledge(pages.get(archive.page)!.type)) return `a page that can’t be archived was`;
  for (const task of m.tasks) {
    if (!spaces.has(task.space)) return `task ${task.id} is in a space that isn’t in the export`;
    if (!task.title.trim()) return `task ${task.id} has no title`;
    if (task.due && Number.isNaN(Date.parse(`${task.due}T00:00:00Z`))) return `task ${task.id} is due on a day that doesn’t exist`;
  }
  return problemInIncludes(m, spaces, pages, onPage);
}

/**
 * What doesn't hold together in what the spaces' guidance includes: each brings in one space's
 * rules or one skill, in the export or named outside it, never its own space's or one above it,
 * which apply there already, once on each side, and for everyone only what's shared.
 */
function problemInIncludes(m: Manifest, spaces: Map<string, Manifest['spaces'][number]>, pages: Map<string, Manifest['pages'][number]>, onPage: Map<string, Manifest['items']>): string | undefined {
  // Each space's place in the tree, so whether one is above another is one comparison.
  const enter = new Map<string, number>();
  const leave = new Map<string, number>();
  const below = new Map<string, string[]>();
  for (const space of m.spaces.slice(1)) below.get(space.parent!)?.push(space.id) ?? below.set(space.parent!, [space.id]);
  let clock = 0;
  const stack: [string, boolean][] = [[m.space, false]];
  while (stack.length) {
    const [space, done] = stack.pop()!;
    if (done) {
      leave.set(space, clock++);
      continue;
    }
    enter.set(space, clock++);
    stack.push([space, true], ...(below.get(space) ?? []).map((child): [string, boolean] => [child, false]));
  }
  const appliesIn = (from: string, space: string) => enter.get(from)! <= enter.get(space)! && leave.get(space)! <= leave.get(from)!;
  const there = new Set<string>();
  for (const include of m.includes) {
    if (!spaces.has(include.space)) return `include ${include.id} is in a space that isn’t in the export`;
    if ([include.rules, include.skill, include.elsewhere].filter((target) => target !== null).length !== 1) return `include ${include.id} doesn’t include one thing`;
    if (include.waiting && include.visibility !== 'private') return `include ${include.id} for everyone can’t wait`;
    if (include.elsewhere !== null) continue;
    let from: string;
    if (include.rules !== null) {
      const space = spaces.get(include.rules);
      if (!space) return `include ${include.id} includes rules that aren’t in the export`;
      if (include.visibility === 'shared' && space.private) return `include ${include.id} includes for everyone rules that only the exporter has`;
      from = space.id;
    } else {
      const page = pages.get(include.skill!);
      const titles = (onPage.get(include.skill!) ?? []).filter((item) => item.kind === 'title');
      if (!page || page.type !== 'skill' || !titles.length) return `include ${include.id} includes a skill that isn’t in the export`;
      if (include.visibility === 'shared' && !titles.some((title) => title.visibility === 'shared')) return `include ${include.id} includes for everyone a skill that only the exporter has`;
      from = page.space;
    }
    if (appliesIn(from, include.space)) return `include ${include.id} includes guidance that applies there already`;
    const key = `${include.space} ${include.visibility} ${include.rules ?? include.skill}`;
    if (there.has(key)) return `include ${include.id} is there twice`;
    there.add(key);
  }
  return undefined;
}

/**
 * Times as an export gives them, to the millisecond, with microseconds added where several fall in
 * the same millisecond, so they keep their order and still read the same.
 */
function inOrder(times: string[]): string[] {
  const seen = new Map<string, number>();
  return times.map((at) => {
    const n = seen.get(at) ?? 0;
    seen.set(at, n + 1);
    return n === 0 || !/\.\d{3}Z$/.test(at) ? at : at.replace(/Z$/, `${String(Math.min(n, 999)).padStart(3, '0')}Z`);
  });
}

/**
 * The items in an order they can be written in, what one replaced or was shared from before it,
 * and otherwise as the export lists them. Undefined when some replace each other in a circle.
 */
function inWritingOrder(items: Manifest['items']): Manifest['items'] | undefined {
  const byId = new Map(items.map((item) => [item.id, item]));
  const done = new Set<string>();
  const doing = new Set<string>();
  const order: Manifest['items'] = [];
  for (const first of items) {
    // Depth first, without recursion, so a long chain of updates can't run out of stack.
    const stack: [Manifest['items'][number], boolean][] = [[first, false]];
    while (stack.length) {
      const [item, ready] = stack.pop()!;
      if (done.has(item.id)) continue;
      if (ready) {
        doing.delete(item.id);
        done.add(item.id);
        order.push(item);
        continue;
      }
      if (doing.has(item.id)) return undefined;
      doing.add(item.id);
      stack.push([item, true]);
      for (const before of [item.publishedFrom, item.supersedes]) {
        const target = before === null ? undefined : byId.get(before);
        if (target && !done.has(target.id)) {
          if (doing.has(target.id)) return undefined;
          stack.push([target, false]);
        }
      }
    }
  }
  return order;
}

/**
 * Whether an item reaches the spaces below its own: a rule unless it's only here, a skill always,
 * knowledge never, and a removal as far as what it removes.
 */
function reachesDown(item: Manifest['items'][number], pages: Map<string, Manifest['pages'][number]>, items: Map<string, Manifest['items'][number]>, depth = 0): boolean {
  if (item.kind === 'removed') {
    const removed = items.get(item.supersedes ?? '');
    return removed && depth < 100 ? reachesDown(removed, pages, items, depth + 1) : item.reachesDown === true;
  }
  const type = pages.get(item.page)?.type;
  return type === 'skill' || (type === 'guidance' && item.onlyHere !== true);
}

/** Names in an order where the same name, as Homing compares names, comes together. */
const byName = new Intl.Collator('en', { sensitivity: 'accent' }).compare;

function notKnowledge(type: string | null): boolean {
  return type === 'guidance' || type === 'skill' || type === 'overview';
}

/** What an import would bring, for the person to check before anything is created. */
export interface ImportPreview {
  /** The exported space's name, which the new one takes unless the person changes it. */
  name: string;
  /** What the export says about where it came from, which nothing can confirm. */
  from: { instance: string; exportedBy: string; exportedAt: string };
  /** The spaces, the exported one first and each below the one it's in, with what's in them now. */
  spaces: { name: string; depth: number; closed: boolean; archived: boolean; pages: number; sources: number; tasks: number }[];
  /** How much of the knowledge, rules, skills and tasks the export shared, and how much was private to whoever exported it. */
  shared: number;
  private: number;
  /** Every rule there is now, word for word, with what it refers to in the export by name, and every skill by name. */
  rules: { space: string; kind: 'requirement' | 'preference'; text: string; onlyHere: boolean; private: boolean }[];
  skills: { space: string; name: string; private: boolean }[];
  /**
   * What each space's guidance includes from another space, its rules or a skill, as the export
   * says: those in the file come along, and those from outside it can't.
   */
  includes: { space: string; kind: 'rules' | 'skill'; from: string; skill: string | null; private: boolean; waiting: boolean; inFile: boolean }[];
  /** A fingerprint of what was read, so the import is of exactly this. */
  hash: string;
}

/** What importing the export would bring. Nothing is created. */
export function previewOf(m: Manifest, hash: string): ImportPreview {
  const replaced = new Set(m.items.map((item) => item.supersedes).filter((id) => id !== null));
  const current = m.items.filter((item) => !replaced.has(item.id) && item.kind !== 'removed');
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const spaceName = new Map(m.spaces.map((space) => [space.id, space.name]));
  const depth = new Map<string, number>();
  for (const space of m.spaces) depth.set(space.id, space.parent === null ? 0 : depth.get(space.parent)! + 1);
  // What a reference points to in the export, by name, so a rule says what it refers to.
  const titles = new Map(m.items.filter((item) => item.kind === 'title').map((item) => [item.page, item.body]));
  const items = new Map(m.items.map((item) => [item.id, item]));
  const sources = new Map(m.sources.map((source) => [source.id, source]));
  const tasks = new Map(m.tasks.map((task) => [task.id, task.title]));
  // Each name at most a line's worth, however often a rule refers to it.
  const short = (text: string) => oneLineTitle(text).slice(0, 80);
  const named = (id: string) => titles.get(id) ?? spaceName.get(id) ?? (items.has(id) ? items.get(id)!.body : undefined)
    ?? (sources.has(id) ? sources.get(id)!.reference ?? sources.get(id)!.excerpt : undefined) ?? tasks.get(id);
  const labelOf = (id: string) => {
    const name = named(id);
    return name === undefined ? undefined : short(name);
  };
  const labelled = (body: string) => body.replace(references, (whole, words: string | undefined, linkedKind: string | undefined, linked: string | undefined, kind: string | undefined, bare: string | undefined) => {
    const label = labelOf((linked ?? bare)!.toLowerCase());
    if (label === undefined) return whole;
    return linked ? `${words} (${linkedKind!.toLowerCase()} “${label}”)` : `${kind!.toLowerCase()} “${label}”`;
  });
  // Listed under the space they're in, as a tree.
  const below = new Map<string, Manifest['spaces']>();
  for (const space of m.spaces.slice(1)) below.get(space.parent!)?.push(space) ?? below.set(space.parent!, [space]);
  const tree: Manifest['spaces'] = [];
  const stack = [m.spaces[0]];
  while (stack.length) {
    const space = stack.pop()!;
    tree.push(space);
    stack.push(...(below.get(space.id) ?? []).toReversed());
  }
  const tally = (ids: string[]) => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  };
  const pageCounts = tally([...new Set(current.filter((item) => item.kind === 'title' && !notKnowledge(pages.get(item.page)!.type)).map((item) => item.page))].map((page) => pages.get(page)!.space));
  const sourceCounts = tally(m.sources.map((source) => source.space));
  const taskCounts = tally(m.tasks.map((task) => task.space));
  const counted = current.filter((item) => item.kind === 'text' || item.kind === 'requirement' || item.kind === 'preference' || (item.kind === 'title' && pages.get(item.page)?.type === 'skill'));
  return {
    name: m.spaces[0].name,
    from: { instance: m.instance.slice(0, 200), exportedBy: plainName(m.exportedBy.name), exportedAt: m.exportedAt },
    spaces: tree.map((space) => ({
      name: space.name,
      depth: depth.get(space.id)!,
      closed: space.closed,
      archived: space.archived !== null,
      pages: pageCounts.get(space.id) ?? 0,
      sources: sourceCounts.get(space.id) ?? 0,
      tasks: taskCounts.get(space.id) ?? 0,
    })),
    shared: counted.filter((item) => item.visibility === 'shared').length + m.tasks.filter((task) => task.visibility === 'shared').length,
    private: counted.filter((item) => item.visibility === 'private').length + m.tasks.filter((task) => task.visibility === 'private').length,
    rules: rulesOf(current.filter((item) => item.kind === 'requirement' || item.kind === 'preference'), (item) => ({
      space: spaceName.get(item.space)!, kind: item.kind as 'requirement' | 'preference', text: labelled(item.body), onlyHere: item.onlyHere === true, private: item.visibility === 'private',
    })),
    skills: current
      .filter((item) => item.kind === 'title' && pages.get(item.page)?.type === 'skill')
      .map((item) => ({ space: spaceName.get(item.space)!, name: item.body, private: item.visibility === 'private' })),
    includes: m.includes.map((include) => {
      const skill = include.skill === null ? undefined : pages.get(include.skill);
      const from = include.rules !== null ? spaceName.get(include.rules)! : skill ? spaceName.get(skill.space)! : plainName(include.elsewhere!.space);
      const name = skill ? titles.get(skill.id)! : include.elsewhere?.skill ? plainName(include.elsewhere.skill) : null;
      return {
        space: spaceName.get(include.space)!, kind: name === null ? 'rules' as const : 'skill' as const, from: short(from), skill: name === null ? null : short(name),
        private: include.visibility === 'private', waiting: include.waiting, inFile: include.elsewhere === null,
      };
    }),
    hash,
  };
}

/** Every rule, as long as all of them can be read before importing. */
function rulesOf<T extends { text: string }>(items: Manifest['items'], rule: (item: Manifest['items'][number]) => T): T[] {
  const rules: T[] = [];
  let length = 0;
  for (const item of items) {
    rules.push(rule(item));
    length += rules.at(-1)!.text.length;
    if (length > importLimits.rules) throw new ImportRefused('That export has more rules than Homing can show you to read first, so Homing won’t import it.');
  }
  return rules;
}

/**
 * What importing the export would bring, as the JSON the app gets, at most so large, so however
 * an export is made, what's shown of it stays small.
 */
export function previewJson(m: Manifest, hash: string): string {
  const json = JSON.stringify(previewOf(m, hash));
  if (Buffer.byteLength(json) > importLimits.preview) throw new ImportRefused('That export holds more than Homing can show you before importing it, so Homing won’t import it. Export less of it at a time.');
  return json;
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** A reference in text, as a Markdown link or on its own, as an export writes them. */
const references = new RegExp(`\\[([^\\[\\]\\n]*)\\]\\((page|item|source|space|task):(${uuid})\\)|\\b(page|item|source|space|task):(${uuid})`, 'gi');

/**
 * What Homing writes for an import, as JSON for import_bundle, with the new space's name: a new id
 * for everything, references in text pointed to them, and who did what as imported provenance.
 */
export function payloadOf(m: Manifest, name: string): string {
  // A new id for everything, and every reference to it follows, in text too. In rules and skills'
  // files, a reference to something the export doesn't hold stays as it was written.
  const fresh = new Map<string, string>();
  for (const thing of [...m.spaces, ...m.pages, ...m.items, ...m.sources, ...m.tasks]) fresh.set(thing.id, randomUUID());
  const to = (old: string) => fresh.get(old)!;
  const maybe = (old: string | null) => (old === null ? null : to(old));
  const words = (body: string) => rewriteReferences(body, (old) => fresh.get(old));
  const verbatim = (kind: string, body: string) => (kind === 'file' || kind === 'requirement' || kind === 'preference' ? rewriteReferences(body, (old) => fresh.get(old) ?? old) : words(body));
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const items = new Map(m.items.map((item) => [item.id, item]));
  // Things written in the same millisecond keep the order the export lists them in.
  const [spaceTimes, pageTimes, itemTimes, sourceTimes, taskTimes, gatheredTimes, revisionTimes, archiveTimes] = [
    m.spaces.map((space) => space.createdAt), m.pages.map((page) => page.createdAt), m.items.map((item) => item.createdAt), m.sources.map((source) => source.createdAt),
    m.tasks.map((task) => task.createdAt), m.gathered.map((gathering) => gathering.createdAt), m.revisions.map((revision) => revision.replacedAt),
    m.pageArchives.map((archive) => archive.at),
  ].map(inOrder);
  // Who did what there, as imported provenance: their key in the export and their name, never anyone here.
  const names = new Map(m.people.map((person) => [person.key, person.name === null ? null : plainName(person.name) || null]));
  const person = (key: string | null) => (key === null ? undefined : { person: key, name: names.get(key) ?? null });
  const by = (author: Manifest['items'][number]['author']) => ({
    by: author.by, person: author.person, name: author.person === null ? null : (names.get(author.person) ?? null), agent: author.agent === null ? null : plainName(author.agent) || 'Assistant',
  });
  const place = new Map(m.items.map((item, at) => [item.id, at]));
  // Each list is written out in turn, so besides the export itself only one is ever held whole.
  const lists: [string, () => unknown][] = [
    ['from', () => ({ instance: m.instance, exportedBy: plainName(m.exportedBy.name), exportedAt: m.exportedAt, space: m.space })],
    ['spaces', () => m.spaces.map((space, at) => ({
      id: to(space.id), name: at === 0 ? name : cleanName(space.name), parent: maybe(space.parent), closed: space.closed,
      createdAt: spaceTimes[at], archivedAt: space.archived?.at ?? null,
      imported: { id: space.id, ...(space.creator && { creator: by(space.creator) }), ...(space.archived?.by && { archivedBy: person(space.archived.by) }) },
    }))],
    ['pages', () => m.pages.map((page, at) => ({
      id: to(page.id), space: to(page.space), type: page.type === null ? null : oneLineTitle(page.type) || null, createdAt: pageTimes[at], archivedAt: page.archived?.at ?? null,
      imported: { id: page.id, ...(page.archived?.by && { archivedBy: person(page.archived.by) }) },
    }))],
    ['items', () => inWritingOrder(m.items)!.map((item) => ({
      id: to(item.id), page: to(item.page), space: to(item.space), kind: item.kind, path: item.path,
      body: item.kind === 'title' ? oneLineTitle(item.body) || 'Untitled' : verbatim(item.kind, item.body),
      private: item.visibility === 'private', supersedes: maybe(item.supersedes), reachesDown: reachesDown(item, pages, items), publishedFrom: maybe(item.publishedFrom),
      publishedAt: item.published?.at ?? null, createdAt: itemTimes[place.get(item.id)!], writtenAt: item.writtenAt,
      imported: {
        id: item.id, author: by(item.author), ...(item.published?.by && { publishedBy: person(item.published.by) }),
        ...(item.sourcesElsewhere > 0 && { sourcesElsewhere: item.sourcesElsewhere }),
      },
    }))],
    ['citations', () => m.items.flatMap((item) => item.sources.map((source) => ({ item: to(item.id), source: to(source) })))],
    ['sources', () => m.sources.map((source, at) => ({
      id: to(source.id), space: to(source.space), private: source.visibility === 'private', reference: source.reference && words(source.reference),
      excerpt: words(source.excerpt), createdAt: sourceTimes[at], imported: { id: source.id, author: by(source.author) },
    }))],
    ['revisions', () => m.revisions.map((revision, at) => ({
      // Private whenever its item is, as well as when it was private there.
      item: to(revision.item), space: to(items.get(revision.item)!.space), private: revision.visibility === 'private' || items.get(revision.item)!.visibility === 'private',
      body: verbatim(items.get(revision.item)!.kind, revision.body),
      writtenAt: revision.writtenAt, replacedAt: revisionTimes[at], imported: { author: by(revision.author) },
    }))],
    ['gathered', () => m.gathered.map((gathering, at) => ({
      collection: to(gathering.collection), page: to(gathering.page), space: to(pages.get(gathering.page)!.space), private: gathering.visibility === 'private',
      createdAt: gatheredTimes[at], imported: { author: by(gathering.author) },
    }))],
    ['pageArchives', () => m.pageArchives.map((archive, at) => ({ page: to(archive.page), archived: archive.archived, at: archiveTimes[at], imported: { author: by(archive.author) } }))],
    ['tasks', () => m.tasks.map((task, at) => ({
      id: to(task.id), space: to(task.space), private: task.visibility === 'private', title: words(task.title).replace(/\s+/g, ' ').trim(),
      description: task.description && words(task.description), due: task.due, doneAt: task.done?.at ?? null, createdAt: taskTimes[at], updatedAt: task.updatedAt,
      imported: {
        id: task.id, author: by(task.author),
        ...(task.assignee && { assignee: person(task.assignee) }), ...(task.done?.by && { doneBy: person(task.done.by) }),
      },
    }))],
    // Only what's in the export comes back: an include of something outside it can't.
    ['includes', () => m.includes.filter((include) => include.elsewhere === null).map((include) => ({
      space: to(include.space), private: include.visibility === 'private', rules: maybe(include.rules), skill: maybe(include.skill), addedAt: include.addedAt,
      imported: { id: include.id, author: by(include.author) },
    }))],
  ];
  return `{${lists.map(([key, list]) => `"${key}":${JSON.stringify(list())}`).join(',')}}`;
}
