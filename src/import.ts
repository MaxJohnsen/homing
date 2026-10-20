// Importing a space (spec §3, guarantee 10). An export comes back as a new space of its own, with
// the spaces that came with it below it, and only the person importing has them until they add
// people the usual way. What the export shared goes on the new space's shared side, and what was
// private becomes theirs. Everything gets a new id, and references between things follow. Nobody
// here is credited with any of it: who wrote it comes along as imported provenance, by name.
//
// An export is untrusted. Homing reads only its homing.json, within set limits, checks every part of
// it, and shows the person what it would bring, rules word for word, before anything is created.

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import type { Session } from './db.ts';
import { rewriteReferences, safePath, type Manifest } from './export.ts';
import { cleanName, placeSpace } from './spaces.ts';
import { fileIn, ZipRefused } from './zip.ts';

/** The most Homing takes in one import: the zip, its homing.json unpacked, and files in the zip. */
export const importLimits = { upload: 100 * 1024 * 1024, manifest: 150 * 1024 * 1024, files: 250_000 };

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
const name = text(200).nullable();
const key = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const author = z.strictObject({ by: z.enum(['person', 'agent', 'routine']), person: key.nullable(), agent: name });
const side = z.enum(['shared', 'private']);
// Where something was imported from before, which an export of an import says. A new import records its own.
const imported = z.strictObject({ id: id.optional(), from: text(2000).optional(), by: key.nullable().optional(), at: time.optional() }).optional();
const longest = 1_000_000;

const manifestSchema = z.strictObject({
  format: z.literal('homing-export'),
  version: z.literal(1),
  instance: text(2000),
  exportedAt: time,
  exportedBy: z.strictObject({ person: key, name: text(200) }),
  space: id,
  people: z.array(z.strictObject({ key, name })),
  spaces: z.array(z.strictObject({
    id, name: text(200), parent: id.nullable(), closed: z.boolean(), private: z.boolean(), creator: author.nullable(),
    archived: z.strictObject({ at: time, by: key.nullable() }).nullable(), createdAt: time, folder: text(10_000), imported,
  })).min(1),
  spaceArchives: z.array(z.strictObject({ space: id, archived: z.boolean(), author, at: time })),
  pages: z.array(z.strictObject({
    id, space: id, type: text(200).nullable(), createdAt: time,
    archived: z.strictObject({ at: time, by: key.nullable() }).nullable(), file: text(10_000).nullable(), imported,
  })),
  items: z.array(z.strictObject({
    id, page: id, space: id, kind: z.enum(['title', 'text', 'requirement', 'preference', 'file', 'removed']),
    path: text(1000).nullable(), body: text(longest), visibility: side, author, createdAt: time, writtenAt: time,
    supersedes: id.nullable(), onlyHere: z.boolean().optional(), reachesDown: z.boolean().optional(), publishedFrom: id.nullable(),
    published: z.strictObject({ by: key.nullable(), at: time }).nullable(), sources: z.array(id), sourcesElsewhere: z.number().int().min(0).max(1_000_000), imported,
  })),
  revisions: z.array(z.strictObject({
    item: id, visibility: side, body: text(longest), author, writtenAt: time, replacedAt: time, imported,
  })),
  sources: z.array(z.strictObject({
    id, space: id, visibility: side, reference: text(10_000).nullable(), excerpt: text(longest), author, createdAt: time, imported,
  })),
  links: z.array(z.strictObject({ item: id, from: id, to: id })),
  gathered: z.array(z.strictObject({ collection: id, page: id, visibility: side, author, createdAt: time })),
  pageArchives: z.array(z.strictObject({ page: id, archived: z.boolean(), author, at: time })),
  tasks: z.array(z.strictObject({
    id, space: id, visibility: side, title: text(200), description: text(20_000).nullable(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), assignee: key.nullable(),
    done: z.strictObject({ at: time, by: key.nullable() }).nullable(), author, createdAt: time, updatedAt: time, imported,
  })),
});

/** A zip's homing.json, read and checked, or a refusal saying what's wrong with it. */
export function readExport(zip: Buffer): Manifest {
  let json: Buffer;
  try {
    json = fileIn(zip, 'homing.json', { files: importLimits.files, size: importLimits.manifest });
  } catch (error) {
    if (!(error instanceof ZipRefused)) throw error;
    throw new ImportRefused({
      'not a zip': 'That isn’t a zip file. Choose the zip Homing gave you when you exported a space.',
      missing: 'That zip isn’t an export from Homing: it has no homing.json.',
      'too many files': `That export has more files than Homing imports at once, ${importLimits.files.toLocaleString('en')}.`,
      'too large': `That export is larger than Homing imports at once, ${importLimits.manifest / 1024 / 1024} MB of knowledge.`,
      damaged: 'That zip is damaged, so Homing can’t read it.',
    }[error.reason]);
  }
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
    throw new ImportRefused(`That export was changed or damaged, so Homing won’t import it: ${issue.path.join('.')} ${issue.message.toLowerCase()}.`);
  }
  const manifest = parsed.data as Manifest;
  const problem = problemIn(manifest);
  if (problem) throw new ImportRefused(`That export doesn’t hold together, so Homing won’t import it: ${problem}.`);
  return manifest;
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
    ...m.pageArchives.map((archive) => archive.author), ...m.tasks.map((task) => task.author),
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
  for (const thing of [...m.spaces, ...m.pages, ...m.items, ...m.sources, ...m.tasks]) {
    if (seen.has(thing.id)) return `${thing.id} appears twice`;
    seen.add(thing.id);
  }
  const spaces = new Map<string, Manifest['spaces'][number]>();
  for (const [at, space] of m.spaces.entries()) {
    if (at === 0 ? space.id !== m.space || space.parent !== null : space.parent === null || !spaces.has(space.parent)) return `space ${space.id} isn’t under the exported space`;
    try {
      cleanName(space.name);
    } catch {
      return `space ${space.id} has a name Homing doesn’t take`;
    }
    spaces.set(space.id, space);
  }
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const once = new Set<string>();
  for (const page of m.pages) {
    if (!spaces.has(page.space)) return `page ${page.id} is in a space that isn’t in the export`;
    if (page.type === 'guidance' || page.type === 'overview') {
      if (once.has(`${page.space} ${page.type}`)) return `space ${page.space} has two ${page.type} pages`;
      once.add(`${page.space} ${page.type}`);
    } else if (page.type !== null && page.type !== 'skill' && ['guidance', 'skill', 'overview'].includes(page.type.toLowerCase())) {
      return `page ${page.id} has a type Homing keeps for itself`;
    }
    if (page.archived && notKnowledge(page.type)) return `page ${page.id} can’t be archived`;
  }
  const kinds: Record<string, string[]> = { guidance: ['requirement', 'preference', 'removed'], skill: ['title', 'file', 'removed'], overview: ['text'] };
  const sources = new Map(m.sources.map((source) => [source.id, source]));
  for (const source of m.sources) if (!spaces.has(source.space)) return `source ${source.id} is in a space that isn’t in the export`;
  const items = new Map(m.items.map((item) => [item.id, item]));
  const reaches = (item: Manifest['items'][number]) => reachesDown(item, pages, items);
  for (const item of m.items) {
    const page = pages.get(item.page);
    if (!page || page.space !== item.space) return `item ${item.id} is on a page that isn’t in the export`;
    if (!(kinds[page.type ?? ''] ?? ['title', 'text']).includes(item.kind)) return `item ${item.id} doesn’t belong on its page`;
    if ((item.kind === 'file') !== (item.path !== null)) return `item ${item.id} has a path only a skill’s file has`;
    if (item.path !== null && !safePath(item.path)) return `item ${item.id} has a path outside its skill`;
    if (item.sources.length && item.kind !== 'text') return `item ${item.id} cites sources, which only knowledge does`;
    if (item.sources.some((source) => !sources.has(source))) return `item ${item.id} cites a source that isn’t in the export`;
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
  for (const revision of m.revisions) if (!items.has(revision.item)) return `an earlier version belongs to an item that isn’t in the export`;
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

function notKnowledge(type: string | null): boolean {
  return type === 'guidance' || type === 'skill' || type === 'overview';
}

/** What an import would bring, for the person to check before anything is created. */
export interface ImportPreview {
  /** The exported space's name, which the new one takes unless the person changes it. */
  name: string;
  from: { instance: string; exportedBy: string; exportedAt: string };
  /** The spaces, the exported one first and each below the one it's in, with what's in them now. */
  spaces: { name: string; depth: number; closed: boolean; archived: boolean; pages: number; sources: number; tasks: number }[];
  /** How much of the knowledge, rules, skills and tasks the export shared, and how much was private to whoever exported it. */
  shared: number;
  private: number;
  /** Every rule there is now, word for word, and every skill by name. */
  rules: { space: string; kind: 'requirement' | 'preference'; text: string; onlyHere: boolean; private: boolean }[];
  skills: { space: string; name: string; private: boolean }[];
}

/** What importing the export would bring. Nothing is created. */
export function previewOf(m: Manifest): ImportPreview {
  const replaced = new Set(m.items.map((item) => item.supersedes).filter((id) => id !== null));
  const current = m.items.filter((item) => !replaced.has(item.id) && item.kind !== 'removed');
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const spaceName = new Map(m.spaces.map((space) => [space.id, space.name]));
  const depth = new Map<string, number>();
  for (const space of m.spaces) depth.set(space.id, space.parent === null ? 0 : depth.get(space.parent)! + 1);
  // Listed under the space they're in, as a tree.
  const tree: Manifest['spaces'] = [];
  const place = (parent: string | null) => {
    for (const space of m.spaces.filter((candidate) => candidate.parent === parent)) {
      tree.push(space);
      place(space.id);
    }
  };
  place(null);
  const counted = current.filter((item) => item.kind === 'text' || item.kind === 'requirement' || item.kind === 'preference' || (item.kind === 'title' && pages.get(item.page)?.type === 'skill'));
  return {
    name: m.spaces[0].name,
    from: { instance: m.instance, exportedBy: m.exportedBy.name, exportedAt: m.exportedAt },
    spaces: tree.map((space) => ({
      name: space.name,
      depth: depth.get(space.id)!,
      closed: space.closed,
      archived: space.archived !== null,
      pages: new Set(current.filter((item) => item.space === space.id && item.kind === 'title' && !notKnowledge(pages.get(item.page)!.type)).map((item) => item.page)).size,
      sources: m.sources.filter((source) => source.space === space.id).length,
      tasks: m.tasks.filter((task) => task.space === space.id).length,
    })),
    shared: counted.filter((item) => item.visibility === 'shared').length + m.tasks.filter((task) => task.visibility === 'shared').length,
    private: counted.filter((item) => item.visibility === 'private').length + m.tasks.filter((task) => task.visibility === 'private').length,
    rules: current
      .filter((item) => item.kind === 'requirement' || item.kind === 'preference')
      .map((item) => ({ space: spaceName.get(item.space)!, kind: item.kind as 'requirement' | 'preference', text: item.body, onlyHere: item.onlyHere === true, private: item.visibility === 'private' })),
    skills: current
      .filter((item) => item.kind === 'title' && pages.get(item.page)?.type === 'skill')
      .map((item) => ({ space: spaceName.get(item.space)!, name: item.body, private: item.visibility === 'private' })),
  };
}

/**
 * Imports the export as a new space with the name given, at the top on its own, and returns it.
 * Only a person does, directly, in one transaction: all of it or nothing.
 */
export async function importSpace(s: Session, m: Manifest, wanted: string): Promise<string> {
  const { name } = await placeSpace(s, { name: wanted, who: 'with others' });
  // A new id for everything, and every reference to it follows, in text too.
  const fresh = new Map<string, string>();
  for (const thing of [...m.spaces, ...m.pages, ...m.items, ...m.sources, ...m.tasks]) fresh.set(thing.id, randomUUID());
  const to = (old: string) => fresh.get(old)!;
  const maybe = (old: string | null) => (old === null ? null : to(old));
  const words = (body: string) => rewriteReferences(body, (old) => fresh.get(old));
  const pages = new Map(m.pages.map((page) => [page.id, page]));
  const items = new Map(m.items.map((item) => [item.id, item]));
  // Things written in the same millisecond keep the order the export lists them in.
  const [spaceTimes, pageTimes, itemTimes, sourceTimes, taskTimes, gatheredTimes, revisionTimes, archiveTimes] = [
    m.spaces.map((space) => space.createdAt), m.pages.map((page) => page.createdAt), m.items.map((item) => item.createdAt), m.sources.map((source) => source.createdAt),
    m.tasks.map((task) => task.createdAt), m.gathered.map((gathering) => gathering.createdAt), m.revisions.map((revision) => revision.replacedAt),
    m.pageArchives.map((archive) => archive.at),
  ].map(inOrder);
  // Who did what there, as imported provenance: their key in the export and their name, never anyone here.
  const names = new Map(m.people.map((person) => [person.key, person.name]));
  const person = (key: string | null) => (key === null ? undefined : { person: key, name: names.get(key) ?? null });
  const by = (author: Manifest['items'][number]['author']) => ({ by: author.by, person: author.person, name: author.person === null ? null : (names.get(author.person) ?? null), agent: author.agent });
  const place = new Map(m.items.map((item, at) => [item.id, at]));
  const bundle = {
    from: { instance: m.instance, exportedBy: m.exportedBy.name, exportedAt: m.exportedAt, space: m.space },
    spaces: m.spaces.map((space, at) => ({
      id: to(space.id), name: at === 0 ? name : cleanName(space.name), parent: maybe(space.parent), closed: space.closed,
      createdAt: spaceTimes[at], archivedAt: space.archived?.at ?? null,
      imported: { id: space.id, ...(space.creator && { creator: by(space.creator) }), ...(space.archived?.by && { archivedBy: person(space.archived.by) }) },
    })),
    pages: m.pages.map((page, at) => ({
      id: to(page.id), space: to(page.space), type: page.type, createdAt: pageTimes[at], archivedAt: page.archived?.at ?? null,
      imported: { id: page.id, ...(page.archived?.by && { archivedBy: person(page.archived.by) }) },
    })),
    items: inWritingOrder(m.items)!.map((item) => ({
      id: to(item.id), page: to(item.page), kind: item.kind, path: item.path,
      // Rules and skills' files come in word for word, as they went out.
      body: item.kind === 'file' || item.kind === 'requirement' || item.kind === 'preference' ? item.body : words(item.body),
      private: item.visibility === 'private', supersedes: maybe(item.supersedes), reachesDown: reachesDown(item, pages, items), publishedFrom: maybe(item.publishedFrom),
      publishedAt: item.published?.at ?? null, createdAt: itemTimes[place.get(item.id)!], writtenAt: item.writtenAt,
      imported: {
        id: item.id, author: by(item.author), ...(item.published?.by && { publishedBy: person(item.published.by) }),
        ...(item.sourcesElsewhere > 0 && { sourcesElsewhere: item.sourcesElsewhere }),
      },
    })),
    citations: m.items.flatMap((item) => item.sources.map((source) => ({ item: to(item.id), source: to(source) }))),
    sources: m.sources.map((source, at) => ({
      id: to(source.id), space: to(source.space), private: source.visibility === 'private', reference: source.reference && words(source.reference),
      excerpt: words(source.excerpt), createdAt: sourceTimes[at], imported: { id: source.id, author: by(source.author) },
    })),
    revisions: m.revisions.map((revision, at) => ({
      item: to(revision.item), private: revision.visibility === 'private',
      body: ['file', 'requirement', 'preference'].includes(items.get(revision.item)!.kind) ? revision.body : words(revision.body),
      writtenAt: revision.writtenAt, replacedAt: revisionTimes[at], imported: { author: by(revision.author) },
    })),
    gathered: m.gathered.map((gathering, at) => ({
      collection: to(gathering.collection), page: to(gathering.page), private: gathering.visibility === 'private', createdAt: gatheredTimes[at],
      imported: { author: by(gathering.author) },
    })),
    pageArchives: m.pageArchives.map((archive, at) => ({ page: to(archive.page), archived: archive.archived, at: archiveTimes[at], imported: { author: by(archive.author) } })),
    tasks: m.tasks.map((task, at) => ({
      id: to(task.id), space: to(task.space), private: task.visibility === 'private', title: words(task.title).replace(/\s+/g, ' ').trim(),
      description: task.description && words(task.description), due: task.due, doneAt: task.done?.at ?? null, createdAt: taskTimes[at], updatedAt: task.updatedAt,
      imported: {
        id: task.id, author: by(task.author),
        ...(task.assignee && { assignee: person(task.assignee) }), ...(task.done?.by && { doneBy: person(task.done.by) }),
      },
    })),
  };
  try {
    // In a savepoint, so a refusal comes back as one, with nothing created.
    const [{ id }] = await s.tx.savepoint((sp) => sp<{ id: string }[]>`select import_bundle(${sp.json(bundle as unknown as postgres.JSONValue)}) as id`);
    return id;
  } catch (error) {
    // The store refused something the checks above let through.
    if (error instanceof postgres.PostgresError && /^(23|22|42501|P0001)/.test(error.code)) {
      throw new ImportRefused('That export doesn’t hold together, so Homing didn’t import any of it.');
    }
    throw error;
  }
}
