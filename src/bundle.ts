// Reading an export for import (spec §3), a part at a time. homing.json says what the export is,
// with its short lists, and names the files of its long ones, which hold a line each and are read
// one file at a time, so even a big export is never held whole. Everything is checked as it's
// read: what it says, its limits, and that it holds together as far as what came before shows,
// and the database checks the rest as it's written. An export is untrusted, so this runs in a
// worker of its own with limited memory (import.ts), and nothing here touches the database.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { importLimits, lists, rewriteReferences, safePath, type Header, type ListName } from './export.ts';
import { oneLineTitle } from './knowledge.ts';
import { frontmatter } from './skills.ts';
import { cleanName, sameName } from './spaces.ts';
import { ZipReader, ZipRefused } from './zip.ts';

export { importLimits };

/** The most Homing keeps of each kind of text, as its own screens and tools take them. */
const longest = { knowledge: 20_000, overview: 2_000, title: 200, rule: 4_000, file: 512 * 1024, type: 40, name: 200, task: 200, description: 20_000, excerpt: 20_000 };

/** An export Homing won't import, with the reason in words for the person. */
export class ImportRefused extends Error {
  /** The form field it's about, if any. */
  field?: string;
  /** A rule or a skill's file that keeps it from importing, which someone can write again. */
  hidden?: Hidden;

  constructor(message: string, field?: string, hidden?: Hidden) {
    super(message);
    this.field = field;
    this.hidden = hidden;
  }
}

/** A rule or a skill's file with a character nobody sees, as the person exporting it knows it. */
export interface Hidden {
  kind: 'rule' | 'file';
  /** Whether it's on its space's shared side, which only the space's admins change. */
  shared: boolean;
  /** Its space, by its id in Homing and its name. */
  space: { id: string; name: string };
  /** The rule's first words, or the file's path. */
  what: string;
  /** The skill a file is in. */
  skill?: string;
}

/**
 * What the person exporting is told about a rule or a skill's file that keeps their export from
 * importing, and what to do: write it again themselves, when they can change it, or ask an admin of
 * its space to.
 */
export function hiddenMessage(hidden: Hidden, theirs: boolean): string {
  const what = hidden.kind === 'file' ? `The file ${hidden.what} of the skill ${hidden.skill ?? 'without a name'} in ${hidden.space.name}` : `The rule “${hidden.what}” in ${hidden.space.name}`;
  const change = hidden.kind === 'file' ? 'save the skill again without it' : 'retype the rule';
  const todo = theirs ? `${change[0].toUpperCase()}${change.slice(1)}` : `Ask an admin of ${hidden.space.name} to ${change}`;
  return `${what} has a character nobody sees, such as one copied from a web page, so the export wouldn’t import again. ${todo}, then export again.`;
}

export const tooLarge = 'That export is larger than Homing imports at once. Exports from Homing never are.';
const unreadable = 'That export’s homing.json isn’t readable, so Homing can’t import it.';
const tooManyRules = 'That export has more rules than Homing can show you to read first, so Homing won’t import it.';
const tooMuchToShow = 'That export holds more than Homing can show you before importing it, so Homing won’t import it. Export less of it at a time.';
const tooManyFiles = `That export has more files than Homing imports at once, ${importLimits.files.toLocaleString('en')}.`;
/** Refusals of an export for how much it holds, rather than for what it says. */
export const sizeRefusals = new Set([tooLarge, tooManyRules, tooMuchToShow, tooManyFiles]);
const apart = (problem: string) => new ImportRefused(`That export doesn’t hold together, so Homing won’t import it: ${problem}.`);

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
// A time as an export gives it, which Homing keeps as text, such as when something was imported before.
const time = z.iso.datetime({ offset: true });
// A time Homing keeps as a moment, as the database takes it: written in the year 1 or later, from the
// start of the year 1 in UTC, and less than 16 hours from UTC.
const yearOne = Date.parse('0001-01-01T00:00:00Z');
const moment = time.refine((at) => !at.startsWith('0000') && !/[+-](1[6-9]|2\d)/.test(at.slice(19)) && Date.parse(at) >= yearOne, 'is a time that can’t be kept');
// A day on the calendar, from the year 1.
const day = z.iso.date().refine((at) => !at.startsWith('0000'), 'is before the year 1');
// Text as Homing can keep it: without the null character, or half of a pair that makes one character.
const text = (max: number) => z.string().max(max).refine((value) => value.isWellFormed() && !value.includes('\0'), 'has a character that can’t be kept');
const name = text(longest.name).nullable();
const key = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const authorSchema = z.strictObject({ by: z.enum(['person', 'agent', 'routine']), person: key.nullable(), agent: name });
type Author = z.infer<typeof authorSchema>;
const side = z.enum(['shared', 'private']);
// Where something was imported from before, which an export of an import says. A new import records its own.
const imported = z.strictObject({ id: id.optional(), from: text(2000).optional(), by: key.nullable().optional(), at: time.optional() }).optional();

const headerSchema = z.strictObject({
  format: z.literal('homing-export'),
  version: z.literal(2),
  instance: text(2000),
  exportedAt: moment,
  exportedBy: z.strictObject({ person: key, name: text(longest.name) }),
  space: id,
  people: z.array(z.strictObject({ key, name })),
  spaces: z.array(z.strictObject({
    id, name: text(200), parent: id.nullable(), closed: z.boolean(), private: z.boolean(), creator: authorSchema.nullable(),
    archived: z.strictObject({ at: moment, by: key.nullable() }).nullable(), createdAt: moment, folder: text(10_000), imported,
  })).min(1),
  spaceArchives: z.array(z.strictObject({ space: id, archived: z.boolean(), author: authorSchema, at: time })),
  includes: z.array(z.strictObject({
    id, space: id, visibility: side, waiting: z.boolean(), rules: id.nullable(), skill: id.nullable(),
    elsewhere: z.strictObject({ space: text(longest.name), skill: text(longest.name).nullable() }).nullable(), author: authorSchema, addedAt: moment, imported,
  })),
  files: z.strictObject(Object.fromEntries(lists.map((list) => [list, z.array(z.string().regex(new RegExp(`^homing/${list}-\\d{5}\\.jsonl$`))).max(10_000)])) as Record<ListName, z.ZodArray<z.ZodString>>),
});

const lineSchemas = {
  pages: z.strictObject({
    id, space: id, type: text(longest.type).nullable(), createdAt: moment,
    archived: z.strictObject({ at: moment, by: key.nullable() }).nullable(), file: text(10_000).nullable(), imported,
  }),
  sources: z.strictObject({
    id, space: id, visibility: side, reference: text(longest.excerpt).nullable(), excerpt: text(longest.excerpt), author: authorSchema, createdAt: moment, imported,
  }),
  items: z.strictObject({
    id, page: id, space: id, kind: z.enum(['title', 'text', 'requirement', 'preference', 'file', 'removed']),
    path: text(1000).nullable(), body: text(longest.file), visibility: side, author: authorSchema, createdAt: moment, writtenAt: moment,
    supersedes: id.nullable(), onlyHere: z.boolean().optional(), reachesDown: z.boolean().optional(), publishedFrom: id.nullable(),
    published: z.strictObject({ by: key.nullable(), at: moment }).nullable(), sources: z.array(id).max(10_000), sourcesElsewhere: z.number().int().min(0).max(1_000_000), imported,
  }),
  revisions: z.strictObject({
    item: id, visibility: side, body: text(longest.file), author: authorSchema, writtenAt: moment, replacedAt: moment, imported,
  }),
  gathered: z.strictObject({ collection: id, page: id, visibility: side, author: authorSchema, createdAt: moment }),
  pageArchives: z.strictObject({ page: id, archived: z.boolean(), author: authorSchema, at: moment }),
  tasks: z.strictObject({
    id, space: id, visibility: side, title: text(longest.task), description: text(longest.description).nullable(),
    due: day.nullable(), assignee: key.nullable(),
    done: z.strictObject({ at: moment, by: key.nullable() }).nullable(), author: authorSchema, createdAt: moment, updatedAt: moment, imported,
  }),
};

type Read = keyof typeof lineSchemas;
/** The long lists an import reads, in the order it writes them. Links follow from the text, so they're never read. */
const reads: Read[] = ['pages', 'sources', 'items', 'revisions', 'gathered', 'pageArchives', 'tasks'];
type Line<L extends Read> = z.infer<(typeof lineSchemas)[L]>;
type HeaderInclude = Header['includes'][number];

/** What zod found wrong, said briefly, however much is wrong. */
function refusalOf(issues: z.core.$ZodIssue[], where = ''): ImportRefused {
  const issue = issues[0];
  const path = [where, ...issue.path.map(String)].filter(Boolean).join('.').slice(0, 100);
  if (issue.code === 'too_big') return new ImportRefused(`That export holds more than Homing keeps, so Homing won’t import it: ${path} is longer than Homing keeps.`);
  return new ImportRefused(`That export was changed or damaged, so Homing won’t import it: ${path} ${issue.message.toLowerCase().slice(0, 200)}.`);
}

/** Why a zip can't be read, for the person. */
function zipRefusal(error: unknown): never {
  if (!(error instanceof ZipRefused)) throw error;
  throw new ImportRefused({
    'not a zip': 'That isn’t a zip file. Choose the zip Homing gave you when you exported a space.',
    missing: 'That zip isn’t an export from Homing: it has no homing.json.',
    'too many files': tooManyFiles,
    'too large': tooLarge,
    damaged: 'That zip is damaged, so Homing can’t read it.',
  }[error.reason]);
}

function parse(json: Buffer | string): unknown {
  try {
    return JSON.parse(typeof json === 'string' ? json : json.toString('utf8'));
  } catch {
    throw new ImportRefused(unreadable);
  }
}

/** An export in a zip file, opened: what homing.json says, and its long lists a file at a time. */
export class Bundle {
  readonly header: Header;
  /** How much there is to read, and how much has been, unpacked. */
  readonly total: number;
  done = 0;
  /** Told after each file of a long list is read, so whoever waits knows it's still going. */
  onFile: () => void = () => {};
  private readonly zip: ZipReader;

  private constructor(zip: ZipReader, header: Header, total: number) {
    this.zip = zip;
    this.header = header;
    this.total = total;
  }

  /** Opens the zip and reads homing.json, refusing what Homing doesn't import. */
  static open(path: string): Bundle {
    let zip: ZipReader;
    try {
      zip = ZipReader.file(path, (name) => name === 'homing.json' || name.startsWith('homing/'), { files: importLimits.files });
    } catch (error) {
      zipRefusal(error);
    }
    try {
      // As an upload is.
      if (zip.size > importLimits.upload) throw new ImportRefused(tooLarge);
      let raw: Buffer;
      try {
        raw = zip.read('homing.json', importLimits.header);
      } catch (error) {
        zipRefusal(error);
      }
      // Counted before anything is built from it: every object and list starts with a bracket.
      let objects = 0;
      for (const byte of raw) if (byte === 0x7b || byte === 0x5b) objects++;
      if (objects > importLimits.objects) throw new ImportRefused(tooLarge);
      const value = parse(raw);
      const head = value as { format?: unknown; version?: unknown };
      if (head?.format !== 'homing-export') throw new ImportRefused('That zip isn’t an export from Homing.');
      if (head.version !== 2) {
        throw new ImportRefused(typeof head.version !== 'number'
          ? 'That export is in a format this Homing doesn’t know.'
          : head.version > 2
            ? `That export is from a newer Homing, in version ${head.version} of the format. Update this Homing to import it.`
            : `That export is from an earlier Homing, in version ${head.version} of the format, which this Homing no longer imports. Export the space again to import it.`);
      }
      const parsed = headerSchema.safeParse(value);
      if (!parsed.success) throw refusalOf(parsed.error.issues);
      const header = parsed.data as Header;
      let total = 0;
      for (const list of reads) {
        for (const file of header.files[list]) {
          const entry = zip.entries.get(file);
          if (!entry) throw new ImportRefused('That export is missing some of its files, so Homing can’t import it.');
          if (entry.size > importLimits.chunk) throw new ImportRefused(tooLarge);
          total += entry.size;
        }
      }
      if (total > importLimits.unpacked) throw new ImportRefused(tooLarge);
      return new Bundle(zip, header, total);
    } catch (error) {
      zip.close();
      throw error;
    }
  }

  /** A long list's lines, as text, a file at a time, counting what's read unless it's read again. */
  *raw(list: ListName, again = false): Generator<string> {
    for (const file of this.header.files[list]) {
      let chunk: Buffer;
      try {
        chunk = this.zip.read(file, importLimits.chunk);
      } catch (error) {
        zipRefusal(error);
      }
      // Counted before anything is built from it: every object and list starts with a bracket.
      let objects = 0;
      for (const byte of chunk) if (byte === 0x7b || byte === 0x5b) objects++;
      if (objects > importLimits.objects) throw new ImportRefused(tooLarge);
      if (!again) this.done += chunk.length;
      for (const line of chunk.toString('utf8').split('\n')) if (line) yield line;
      this.onFile();
    }
  }

  /** A long list's entries, each checked for what it says and how long it is. */
  *lines<L extends Read>(list: L): Generator<Line<L>> {
    for (const line of this.raw(list)) {
      const parsed = lineSchemas[list].safeParse(parse(line));
      if (!parsed.success) throw refusalOf(parsed.error.issues, list);
      yield parsed.data as Line<L>;
    }
  }

  close(): void {
    this.zip.close();
  }
}

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
function hiddenIn(body: string, kind: string): boolean {
  const controls = kind === 'file' ? /[\p{Cc}--[\t\n\r\f]]/v : /[\p{Cc}--[\t\n\r]]/v;
  return controls.test(body) || /\p{Cf}/u.test((kind === 'file' ? body.replace(/^\ufeff/, '') : body).replace(new RegExp(kept, 'g'), ''));
}

/** A text's first few words, on one line, without what hides in it, to say which one it is. */
function firstWords(body: string): string {
  const words = plainName(body);
  if (words.length <= 60) return words;
  const cut = words.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`;
}

/** Names in an order where the same name, as Homing compares names, comes together. */
const byName = new Intl.Collator('en', { sensitivity: 'accent' }).compare;

const kinds = ['title', 'text', 'requirement', 'preference', 'file', 'removed'] as const;
type Kind = (typeof kinds)[number];
/** What a page is, as far as what it holds goes. */
const Sort = { knowledge: 0, guidance: 1, skill: 2, overview: 3 } as const;
const sortOf = (type: string | null) => (type === 'guidance' ? Sort.guidance : type === 'skill' ? Sort.skill : type === 'overview' ? Sort.overview : Sort.knowledge);
/** What each sort of page holds. */
const holds: Kind[][] = [['title', 'text'], ['requirement', 'preference', 'removed'], ['title', 'file', 'removed'], ['text']];

/** What's kept of each item for what comes after it, packed in a number: its kind, side, reach, whether it's been replaced, its space and its page. */
const packItem = (kind: number, isPrivate: boolean, reaches: boolean, space: number, page: number) => kind + (isPrivate ? 8 : 0) + (reaches ? 16 : 0) + space * 64 + page * 64 * 2 ** 20;
const itemKind = (packed: number) => kinds[packed % 8];
const itemPrivate = (packed: number) => Math.floor(packed / 8) % 2 === 1;
const itemReaches = (packed: number) => Math.floor(packed / 16) % 2 === 1;
const itemReplaced = (packed: number) => Math.floor(packed / 32) % 2 === 1;
const itemPage = (packed: number) => Math.floor(packed / (64 * 2 ** 20));

/** A rule or a skill's file with characters that hide what it says, until something replaces it. */
interface Hiding {
  kind: Kind;
  shared: boolean;
  space: number;
  page: string;
  /** Its first words, or the file's path, to say which it is. */
  what: string;
}

/** A skill page's parts as they come, to check once all of it has. */
interface SkillParts {
  page: string;
  titles: { id: string; body: string; private: boolean }[];
  files: { id: string; path: string; private: boolean; name?: string }[];
}

/** The rows Homing writes for a part of an export, as import_load takes them. */
export type Batch = Partial<Record<Read | 'citations', unknown[]>>;

/**
 * Reads an export through, checking each line against what came before, and keeping only what
 * later lines need: its spaces and people, its pages, and a little about each item. To import it,
 * it also turns each line into what Homing writes, with new ids.
 */
export class Reader {
  readonly bundle: Bundle;
  readonly header: Header;
  private readonly spaceIndex = new Map<string, number>();
  private readonly people = new Set<string>();
  private readonly pages = new Map<string, number>();
  private pageSpace = new Int32Array(1024);
  private pageSort = new Uint8Array(1024);
  /** Which sides each page has a title on: 1 for the exporter's own, 2 for the shared side. */
  private pageTitled = new Uint8Array(1024);
  private readonly titles = new Map<string, string>();
  private readonly items = new Map<string, number>();
  private readonly sourceIds = new Set<string>();
  private readonly taskIds = new Set<string>();
  private readonly gatherings = new Set<string>();
  private readonly skills = new Map<string, SkillParts>();
  private readonly once = new Set<string>();
  private readonly hiding = new Map<string, Hiding>();
  /** For the preview: what's in each space, what's counted on each side, the rules and what they refer to. */
  private readonly sources: number[];
  private readonly tasks: number[];
  private shared = 0;
  private private = 0;
  private readonly rules: { id: string; space: number; kind: 'requirement' | 'preference'; body: string; onlyHere: boolean; private: boolean }[] = [];
  private ruleText = 0;
  private readonly replacedRules = new Set<string>();
  /** References in rules and skills' files, and those of them that point to something in the export, with what they're called. */
  private readonly mentioned = new Set<string>();
  readonly inside = new Set<string>();
  private readonly labels = new Map<string, string>();
  /** For importing: how each id becomes a new one, and which references in guidance point inside the export. */
  private readonly to?: (old: string) => string;
  private readonly guidanceInside: Set<string>;
  private readonly last = new Map<string, { at: string; n: number }>();
  private readonly names: Map<string, string | null>;

  constructor(bundle: Bundle, importing?: { key: string; inside: Set<string> }) {
    this.bundle = bundle;
    this.header = bundle.header;
    if (importing) {
      // Each id becomes one of its own for this import, the same wherever it's referred to, without a list of them all.
      this.to = (old: string) => {
        const hash = createHash('sha256').update(importing.key).update(old).digest();
        hash[6] = (hash[6] & 0x0f) | 0x40;
        hash[8] = (hash[8] & 0x3f) | 0x80;
        const hex = hash.subarray(0, 16).toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      };
    }
    this.guidanceInside = importing?.inside ?? new Set();
    this.sources = this.header.spaces.map(() => 0);
    this.tasks = this.header.spaces.map(() => 0);
    this.names = new Map(this.header.people.map((person) => [person.key, person.name === null ? null : plainName(person.name) || null]));
    this.checkHeader();
  }

  /** What doesn't hold together in homing.json itself: its people, authors, and spaces. */
  private checkHeader() {
    const h = this.header;
    for (const person of h.people) {
      if (this.people.has(person.key)) throw apart(`${person.key} appears twice`);
      this.people.add(person.key);
    }
    if (!this.people.has(h.exportedBy.person)) throw apart('whoever exported it isn’t among its people');
    for (const author of [...h.spaces.map((space) => space.creator), ...h.spaceArchives.map((archive) => archive.author), ...h.includes.map((include) => include.author)]) this.author(author);
    for (const space of h.spaces) this.person(space.archived?.by ?? null);
    const named = new Map<string, string[]>();
    for (const [at, space] of h.spaces.entries()) {
      if (this.spaceIndex.has(space.id)) throw apart(`${space.id} appears twice`);
      if (at === 0 ? space.id !== h.space || space.parent !== null : space.parent === null || !this.spaceIndex.has(space.parent)) throw apart(`space ${space.id} isn’t under the exported space`);
      try {
        const clean = cleanName(space.name);
        named.get(space.parent ?? '')?.push(clean) ?? named.set(space.parent ?? '', [clean]);
      } catch {
        throw apart(`space ${space.id} has a name Homing doesn’t take`);
      }
      this.spaceIndex.set(space.id, at);
    }
    // Spaces in one place have different names, as Homing keeps them: side by side in order, the same name is next to itself.
    for (const siblings of named.values()) {
      const sorted = siblings.sort(byName);
      const twice = sorted.find((candidate, at) => at > 0 && sameName(sorted[at - 1], candidate));
      if (twice) throw apart(`two spaces in one place are both called ${twice}`);
    }
  }

  private person(key: string | null) {
    if (key !== null && !this.people.has(key)) throw apart(`${key} isn’t among its people`);
  }

  /** Who did something. A version of an item can be a person's own text, changed for them by their assistant. */
  private author(author: Author | null, version = false) {
    if (!author) return;
    const fits = author.by === 'person' ? author.person !== null && (version || author.agent === null) : author.by === 'agent' ? author.agent !== null : author.person === null && author.agent === null;
    if (!fits) throw apart('an author is neither a person, an agent nor a routine');
    this.person(author.person);
  }

  private space(of: string, id: string): number {
    const at = this.spaceIndex.get(of);
    if (at === undefined) throw apart(`${id} is in a space that isn’t in the export`);
    return at;
  }

  /**
   * Times as an export gives them, with microseconds added to those in the same millisecond as the
   * one before, so they keep their order. An export lists each page's items together, so one run
   * for all of them keeps each page's in order, without one for every page.
   */
  private inOrder(list: string, at: string): string {
    const last = this.last.get(list);
    if (last?.at !== at || !/\.\d{3}Z$/.test(at)) {
      this.last.set(list, { at, n: 0 });
      return at;
    }
    last.n++;
    return at.replace(/Z$/, `${String(Math.min(last.n, 999)).padStart(3, '0')}Z`);
  }

  /** Who did what there, as imported provenance: their key in the export and their name, never anyone here. */
  private by(author: Author) {
    return {
      by: author.by, person: author.person, name: author.person === null ? null : (this.names.get(author.person) ?? null),
      agent: author.agent === null ? null : plainName(author.agent) || 'Assistant',
    };
  }

  private personOf(key: string | null) {
    return key === null ? undefined : { person: key, name: this.names.get(key) ?? null };
  }

  private words(body: string) {
    return this.to ? rewriteReferences(body, (old) => this.to!(old)) : body;
  }

  /** In rules and skills' files, a reference to something the export doesn't hold stays as it was written. */
  private verbatim(kind: string, body: string) {
    if (kind !== 'file' && kind !== 'requirement' && kind !== 'preference') return this.words(body);
    return this.to ? rewriteReferences(body, (old) => (this.guidanceInside.has(old) ? this.to!(old) : old)) : body;
  }

  private mention(body: string) {
    for (const ref of mentions(body)) this.mentioned.add(ref);
  }

  private found(id: string, label: string) {
    this.inside.add(id);
    if (!this.labels.has(id)) this.labels.set(id, label);
  }

  /** What Homing writes first: the spaces, with the name given for the first, and where the export came from. */
  begin(name: string): string {
    const h = this.header;
    const to = this.to!;
    return JSON.stringify({
      from: { instance: h.instance, exportedBy: plainName(h.exportedBy.name), exportedAt: h.exportedAt, space: h.space },
      spaces: h.spaces.map((space, at) => ({
        id: to(space.id), name: at === 0 ? name : cleanName(space.name), parent: space.parent === null ? null : to(space.parent), closed: space.closed,
        createdAt: this.inOrder('spaces', space.createdAt), archivedAt: space.archived?.at ?? null,
        imported: { id: space.id, ...(space.creator && { creator: this.by(space.creator) }), ...(space.archived?.by && { archivedBy: this.personOf(space.archived.by) }) },
      })),
    });
  }

  /** Reads one long list through, handing what Homing writes for it to `batch` a few thousand rows at a time, when importing. */
  async readList(list: Read, batch?: (rows: Batch) => Promise<void>): Promise<void> {
    let rows: Batch = {};
    let size = 0;
    const add = (name: keyof Batch, row: unknown) => {
      if (!batch) return;
      (rows[name] ??= []).push(row);
      size++;
    };
    let file = this.bundle.done;
    for (const line of this.bundle.lines(list)) {
      // A batch is at most what a file holds, so each stays a few megabytes.
      if (batch && size && (this.bundle.done !== file || size >= 5000)) {
        await batch(rows);
        rows = {};
        size = 0;
      }
      file = this.bundle.done;
      this.take(list, line, add);
    }
    if (batch && size) await batch(rows);
  }

  private take(list: Read, line: unknown, add: (name: keyof Batch, row: unknown) => void) {
    const to = this.to;
    switch (list) {
      case 'pages':
        return this.page(line as Line<'pages'>, add);
      case 'items':
        return this.item(line as Line<'items'>, add);
      case 'sources': {
        const source = line as Line<'sources'>;
        if (this.sourceIds.has(source.id)) throw apart(`${source.id} appears twice`);
        this.sourceIds.add(source.id);
        this.sources[this.space(source.space, source.id)]++;
        this.author(source.author);
        if (this.mentioned.has(source.id)) this.found(source.id, oneLineTitle(source.reference ?? source.excerpt));
        if (to) {
          add('sources', {
            id: to(source.id), space: to(source.space), private: source.visibility === 'private', reference: source.reference && this.words(source.reference),
            excerpt: this.words(source.excerpt), createdAt: this.inOrder('sources', source.createdAt), imported: { id: source.id, author: this.by(source.author) },
          });
        }
        return;
      }
      case 'revisions': {
        const revision = line as Line<'revisions'>;
        const packed = this.items.get(revision.item);
        if (packed === undefined) throw apart('an earlier version belongs to an item that isn’t in the export');
        const kind = itemKind(packed);
        // What it said before is history, which nobody follows, so it may hold what a rule now can't.
        if (this.tooLong(kind, this.pageSort[itemPage(packed)], revision.body)) throw apart(`an earlier version of item ${revision.item} is longer than Homing keeps`);
        this.author(revision.author, true);
        if (to) {
          add('revisions', {
            // Private whenever its item is, as well as when it was private there.
            item: to(revision.item), kind, private: revision.visibility === 'private' || itemPrivate(packed),
            body: this.verbatim(kind, revision.body), writtenAt: revision.writtenAt, replacedAt: this.inOrder('revisions', revision.replacedAt), imported: { author: this.by(revision.author) },
          });
        }
        return;
      }
      case 'gathered': {
        const gathering = line as Line<'gathered'>;
        const collection = this.pages.get(gathering.collection);
        const page = this.pages.get(gathering.page);
        if (collection === undefined || page === undefined || collection === page || this.pageSpace[collection] !== this.pageSpace[page]
          || this.pageSort[collection] !== Sort.knowledge || this.pageSort[page] !== Sort.knowledge) throw apart('a collection gathers a page it can’t');
        // Both have a title on its side, which for everyone is the shared side.
        const titled = gathering.visibility === 'private' ? 3 : 2;
        if (!(this.pageTitled[collection] & titled) || !(this.pageTitled[page] & titled)) throw apart('a collection gathers a page without a title');
        const gathered = `${gathering.collection} ${gathering.page} ${gathering.visibility}`;
        if (this.gatherings.has(gathered)) throw apart(`a collection gathers ${gathering.page} twice`);
        this.gatherings.add(gathered);
        this.author(gathering.author);
        if (to) {
          add('gathered', {
            collection: to(gathering.collection), page: to(gathering.page), space: to(this.header.spaces[this.pageSpace[page]].id), private: gathering.visibility === 'private',
            createdAt: this.inOrder('gathered', gathering.createdAt), imported: { author: this.by(gathering.author) },
          });
        }
        return;
      }
      case 'pageArchives': {
        const archive = line as Line<'pageArchives'>;
        const page = this.pages.get(archive.page);
        if (page === undefined || this.pageSort[page] !== Sort.knowledge) throw apart('a page that can’t be archived was');
        this.author(archive.author);
        if (to) add('pageArchives', { page: to(archive.page), archived: archive.archived, at: this.inOrder('pageArchives', archive.at), imported: { author: this.by(archive.author) } });
        return;
      }
      case 'tasks': {
        const task = line as Line<'tasks'>;
        if (this.taskIds.has(task.id)) throw apart(`${task.id} appears twice`);
        this.taskIds.add(task.id);
        this.tasks[this.space(task.space, task.id)]++;
        if (!task.title.trim()) throw apart(`task ${task.id} has no title`);
        this.person(task.assignee);
        this.person(task.done?.by ?? null);
        this.author(task.author);
        if (this.mentioned.has(task.id)) this.found(task.id, task.title);
        if (to) {
          add('tasks', {
            id: to(task.id), space: to(task.space), private: task.visibility === 'private', title: this.words(task.title).replace(/\s+/g, ' ').trim(),
            description: task.description && this.words(task.description), due: task.due, doneAt: task.done?.at ?? null, createdAt: this.inOrder('tasks', task.createdAt), updatedAt: task.updatedAt,
            imported: { id: task.id, author: this.by(task.author), ...(task.assignee && { assignee: this.personOf(task.assignee) }), ...(task.done?.by && { doneBy: this.personOf(task.done.by) }) },
          });
        }
        return;
      }
    }
  }

  private page(page: Line<'pages'>, add: (name: keyof Batch, row: unknown) => void) {
    if (this.pages.has(page.id)) throw apart(`${page.id} appears twice`);
    const space = this.space(page.space, page.id);
    const sort = sortOf(page.type);
    if (sort === Sort.guidance || sort === Sort.overview) {
      if (this.once.has(`${page.space} ${page.type}`)) throw apart(`space ${page.space} has two ${page.type} pages`);
      this.once.add(`${page.space} ${page.type}`);
    } else if (page.type !== null && sort !== Sort.skill && ['guidance', 'skill', 'overview'].includes(oneLineTitle(page.type).toLowerCase())) {
      throw apart(`page ${page.id} has a type Homing keeps for itself`);
    }
    if (page.archived && sort !== Sort.knowledge) throw apart(`page ${page.id} can’t be archived`);
    this.person(page.archived?.by ?? null);
    const at = this.pages.size;
    if (at >= this.pageSpace.length) {
      const space2 = new Int32Array(at * 2);
      space2.set(this.pageSpace);
      this.pageSpace = space2;
      const sort2 = new Uint8Array(at * 2);
      sort2.set(this.pageSort);
      this.pageSort = sort2;
      const titled2 = new Uint8Array(at * 2);
      titled2.set(this.pageTitled);
      this.pageTitled = titled2;
    }
    this.pages.set(page.id, at);
    this.pageSpace[at] = space;
    this.pageSort[at] = sort;
    if (this.to) {
      const to = this.to;
      add('pages', {
        id: to(page.id), space: to(page.space), type: page.type === null ? null : oneLineTitle(page.type) || null, createdAt: this.inOrder('pages', page.createdAt),
        archivedAt: page.archived?.at ?? null, imported: { id: page.id, ...(page.archived?.by && { archivedBy: this.personOf(page.archived.by) }) },
      });
    }
  }

  private tooLong(kind: Kind, sort: number, body: string) {
    return kind === 'file' ? Buffer.byteLength(body) > longest.file
      : body.length > (kind === 'title' ? longest.title : kind === 'requirement' || kind === 'preference' ? longest.rule : sort === Sort.overview ? longest.overview : longest.knowledge);
  }

  private item(item: Line<'items'>, add: (name: keyof Batch, row: unknown) => void) {
    if (this.items.has(item.id)) throw apart(`${item.id} appears twice`);
    const pageAt = this.pages.get(item.page);
    const space = this.spaceIndex.get(item.space);
    if (pageAt === undefined || space === undefined || this.pageSpace[pageAt] !== space) throw apart(`item ${item.id} is on a page that isn’t in the export`);
    const sort = this.pageSort[pageAt];
    if (!holds[sort].includes(item.kind)) throw apart(`item ${item.id} doesn’t belong on its page`);
    if (this.tooLong(item.kind, sort, item.body)) throw apart(`item ${item.id} is longer than Homing keeps`);
    if (item.kind === 'removed' && item.body !== '') throw apart(`item ${item.id} removes something, and says something too`);
    if ((item.kind === 'file') !== (item.path !== null)) throw apart(`item ${item.id} has a path only a skill’s file has`);
    if (item.path !== null && !safePath(item.path)) throw apart(`item ${item.id} has a path outside its skill`);
    if (item.sources.length && item.kind !== 'text') throw apart(`item ${item.id} cites sources, which only knowledge does`);
    if (new Set(item.sources).size !== item.sources.length) throw apart(`item ${item.id} cites a source twice`);
    if (item.sources.some((source) => !this.sourceIds.has(source))) throw apart(`item ${item.id} cites a source that isn’t in the export`);
    // A page has one title on each side.
    const side = item.visibility === 'private' ? 1 : 2;
    if (item.kind === 'title' && this.pageTitled[pageAt] & side) throw apart(`page ${item.page} has two titles`);
    // Rules and skills are what assistants follow, so nothing in them may be hidden, unless something replaces it.
    if ((item.kind === 'requirement' || item.kind === 'preference' || item.kind === 'file') && hiddenIn(item.body, item.kind)) {
      this.hiding.set(item.id, { kind: item.kind, shared: item.visibility === 'shared', space, page: item.page, what: item.kind === 'file' ? item.path!.slice(0, 200) : firstWords(item.body) });
    }
    this.author(item.author, true);
    this.person(item.published?.by ?? null);
    // What an item replaced, or was shared from, is on its page, and comes before it.
    const replaced = item.supersedes === null ? undefined : this.items.get(item.supersedes);
    if ((item.supersedes !== null || item.kind === 'removed') && !(item.kind === 'text' || item.kind === 'removed')) throw apart(`item ${item.id} can’t replace anything`);
    if (item.supersedes !== null && (replaced === undefined || itemPage(replaced) !== pageAt)) throw apart(`item ${item.id} replaces something that isn’t on its page before it`);
    if (item.kind === 'removed' && (replaced === undefined || itemPrivate(replaced) !== (item.visibility === 'private'))) throw apart(`item ${item.id} removes something it can’t`);
    // A removal reaches as far as what it removes, so the spaces below see it's gone.
    if (item.kind === 'removed' && item.reachesDown !== itemReaches(replaced!)) throw apart(`item ${item.id} reaches further or less far than what it removes`);
    if (item.kind === 'text' && replaced !== undefined && (itemKind(replaced) !== 'text' || (item.visibility === 'shared' && itemPrivate(replaced)))) throw apart(`item ${item.id} replaces something it can’t`);
    if (item.publishedFrom !== null) {
      const original = this.items.get(item.publishedFrom);
      if (original === undefined || itemPage(original) !== pageAt || !itemPrivate(original) || item.visibility !== 'shared' || item.kind !== 'text') throw apart(`item ${item.id} was shared from something that isn’t on its page before it`);
    }
    const reaches = item.kind === 'removed' ? itemReaches(replaced!) : sort === Sort.skill || (sort === Sort.guidance && item.onlyHere !== true);
    this.items.set(item.id, packItem(kinds.indexOf(item.kind), item.visibility === 'private', reaches, space, pageAt));

    // What's there now, counted on its side, and what it replaced no longer.
    if (item.kind === 'text' || item.kind === 'requirement' || item.kind === 'preference' || (item.kind === 'title' && sort === Sort.skill)) {
      if (item.visibility === 'shared') this.shared++;
      else this.private++;
    }
    if (replaced !== undefined && !itemReplaced(replaced)) {
      const kind = itemKind(replaced);
      if (kind === 'text' || kind === 'requirement' || kind === 'preference') {
        if (itemPrivate(replaced)) this.private--;
        else this.shared--;
      }
      this.items.set(item.supersedes!, replaced + 32);
      if (kind === 'requirement' || kind === 'preference') this.replacedRules.add(item.supersedes!);
      this.hiding.delete(item.supersedes!);
    }
    if (item.kind === 'title') {
      this.pageTitled[pageAt] |= side;
      this.titles.set(item.page, oneLineTitle(item.body));
    }
    if (item.kind === 'requirement' || item.kind === 'preference') {
      // However many rules an export has, what's read of them stays within what the preview could show.
      this.ruleText += item.body.length;
      if (this.ruleText > importLimits.rules * 4) throw new ImportRefused(tooManyRules);
      if (!this.to) this.rules.push({ id: item.id, space, kind: item.kind, body: item.body, onlyHere: item.onlyHere === true, private: item.visibility === 'private' });
      this.mention(item.body);
    }
    if (sort === Sort.skill) {
      const parts = this.skills.get(item.page) ?? { page: item.page, titles: [], files: [] };
      this.skills.set(item.page, parts);
      if (item.kind === 'title') parts.titles.push({ id: item.id, body: item.body, private: item.visibility === 'private' });
      if (item.kind === 'file') {
        parts.files.push({ id: item.id, path: item.path!, private: item.visibility === 'private', ...(item.path === 'SKILL.md' && { name: frontmatter(item.body).name }) });
        this.mention(item.body);
      }
      if (item.kind === 'removed') {
        parts.titles = parts.titles.filter((title) => title.id !== item.supersedes);
        parts.files = parts.files.filter((file) => file.id !== item.supersedes);
      }
    }
    if (this.mentioned.has(item.id)) this.found(item.id, oneLineTitle(item.body));

    if (this.to) {
      const to = this.to;
      add('items', {
        id: to(item.id), page: to(item.page), space: to(item.space), kind: item.kind, path: item.path,
        body: item.kind === 'title' ? oneLineTitle(item.body) || 'Untitled' : this.verbatim(item.kind, item.body),
        private: item.visibility === 'private', supersedes: item.supersedes && to(item.supersedes), reachesDown: reaches, publishedFrom: item.publishedFrom && to(item.publishedFrom),
        publishedAt: item.published?.at ?? null, createdAt: this.inOrder('items', item.createdAt), writtenAt: item.writtenAt,
        imported: {
          id: item.id, author: this.by(item.author), ...(item.published?.by && { publishedBy: this.personOf(item.published.by) }),
          ...(item.sourcesElsewhere > 0 && { sourcesElsewhere: item.sourcesElsewhere }),
        },
      });
      for (const source of item.sources) add('citations', { item: to(item.id), source: to(source) });
    }
  }

  /** What can only be checked once everything is read: each skill, and what the spaces include. */
  finish(): void {
    const [hiding] = this.hiding;
    if (hiding) throw this.hidden(...hiding);
    // A skill is named as its SKILL.md says, in lowercase words, and holds one file at each place.
    for (const parts of this.skills.values()) {
      const paths = parts.files.map((file) => `${file.private} ${file.path}`);
      if (new Set(paths).size !== paths.length) throw apart(`skill ${parts.page} has two files at one place`);
      for (const title of parts.titles) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(title.body) || title.body.length > 64) throw apart(`skill ${parts.page} has a name Homing doesn’t take`);
        const skillMd = parts.files.find((file) => file.path === 'SKILL.md' && file.private === title.private);
        if (skillMd && skillMd.name !== title.body) throw apart(`skill ${title.body} is named differently in its SKILL.md`);
      }
    }
    this.checkIncludes();
  }

  /**
   * A rule or a skill's file that hides what it says. Homing keeps one when it's written, so when
   * Homing checks its own export, whoever exports it is told which it is, and what to do.
   */
  private hidden(id: string, hiding: Hiding): ImportRefused {
    const space = this.header.spaces[hiding.space];
    return new ImportRefused(`That export doesn’t hold together, so Homing won’t import it: item ${id} has characters that hide what it says.`, undefined, {
      kind: hiding.kind === 'file' ? 'file' : 'rule',
      shared: hiding.shared,
      space: { id: space.id, name: space.name },
      what: hiding.what,
      ...(hiding.kind === 'file' && { skill: this.titles.get(hiding.page) ?? undefined }),
    });
  }

  /**
   * What the spaces' guidance includes: each brings in one space's rules or one skill, in the
   * export or named outside it, never its own space's or one above it, which apply there already,
   * once on each side, and for everyone only what's shared. Someone's own waits exactly while the
   * space includes the same for everyone.
   */
  private checkIncludes() {
    const h = this.header;
    const above = (from: string, space: string) => {
      for (let at: string | null = space; at !== null; at = h.spaces[this.spaceIndex.get(at)!].parent) if (at === from) return true;
      return false;
    };
    const target = (include: HeaderInclude) => include.rules ?? include.skill ?? `elsewhere ${JSON.stringify(include.elsewhere)}`;
    const forEveryone = new Set(h.includes.filter((include) => include.visibility === 'shared').map((include) => `${include.space} ${target(include)}`));
    const there = new Set<string>();
    for (const include of h.includes) {
      if (!this.spaceIndex.has(include.space)) throw apart(`include ${include.id} is in a space that isn’t in the export`);
      if ([include.rules, include.skill, include.elsewhere].filter((x) => x !== null).length !== 1) throw apart(`include ${include.id} doesn’t include one thing`);
      if (include.waiting && include.visibility !== 'private') throw apart(`include ${include.id} for everyone can’t wait`);
      if (include.visibility === 'private' && include.waiting !== forEveryone.has(`${include.space} ${target(include)}`)) throw apart(`include ${include.id} says it waits when it doesn’t, or the other way round`);
      if (include.elsewhere !== null) continue;
      let from: string;
      if (include.rules !== null) {
        const at = this.spaceIndex.get(include.rules);
        if (at === undefined) throw apart(`include ${include.id} includes rules that aren’t in the export`);
        if (include.visibility === 'shared' && h.spaces[at].private) throw apart(`include ${include.id} includes for everyone rules that only the exporter has`);
        from = include.rules;
      } else {
        const at = this.pages.get(include.skill!);
        const titles = this.skills.get(include.skill!)?.titles ?? [];
        if (at === undefined || this.pageSort[at] !== Sort.skill || !titles.length) throw apart(`include ${include.id} includes a skill that isn’t in the export`);
        if (include.visibility === 'shared' && !titles.some((title) => !title.private)) throw apart(`include ${include.id} includes for everyone a skill that only the exporter has`);
        from = h.spaces[this.pageSpace[at]].id;
      }
      if (above(from, include.space)) throw apart(`include ${include.id} includes guidance that applies there already`);
      const key = `${include.space} ${include.visibility} ${include.rules ?? include.skill}`;
      if (there.has(key)) throw apart(`include ${include.id} is there twice`);
      there.add(key);
    }
  }

  /** What Homing writes last: the includes of what the export holds. One of something outside it can't come back. */
  ending(): string {
    const to = this.to!;
    return JSON.stringify({
      includes: this.header.includes.filter((include) => include.elsewhere === null).map((include) => ({
        space: to(include.space), private: include.visibility === 'private', rules: include.rules && to(include.rules), skill: include.skill && to(include.skill),
        addedAt: this.inOrder('includes', include.addedAt), imported: { id: include.id, author: this.by(include.author) },
      })),
    });
  }

  /** Finds what the rules and skills' files refer to that came before them, by reading again only the lines that hold their ids. */
  resolve(): void {
    for (const ref of this.mentioned) {
      const space = this.spaceIndex.get(ref);
      if (space !== undefined) this.found(ref, this.header.spaces[space].name);
      else if (this.titles.has(ref)) this.found(ref, this.titles.get(ref)!);
      else if (this.pages.has(ref)) this.found(ref, 'Untitled');
    }
    // What's left is a source, an item or a task that came before what refers to it, found by
    // reading again only the lists that hold one. A reference to anything else isn't in the export.
    const pending = new Set([...this.mentioned].filter((ref) => !this.labels.has(ref) && (this.sourceIds.has(ref) || this.items.has(ref) || this.taskIds.has(ref))));
    for (const [list, holds] of [['sources', this.sourceIds], ['items', this.items], ['tasks', this.taskIds]] as const) {
      if (![...pending].some((ref) => holds.has(ref))) continue;
      for (const line of this.bundle.raw(list, true)) {
        if (!pending.size) return;
        if (!idsIn(line).some((id) => pending.has(id))) continue;
        const entry = parse(line) as { id?: string; reference?: string | null; excerpt?: string; body?: string; title?: string };
        if (entry.id === undefined || !pending.has(entry.id)) continue;
        this.found(entry.id, oneLineTitle(entry.title ?? entry.reference ?? entry.excerpt ?? entry.body ?? ''));
        pending.delete(entry.id);
      }
    }
  }

  /** What importing the export would bring, for the person to check, as the JSON the app gets. */
  preview(hash: string): string {
    const h = this.header;
    const short = (value: string) => oneLineTitle(value).slice(0, 80);
    const labelled = (body: string) => body.replace(references, (whole, words: string | undefined, linkedKind: string | undefined, linked: string | undefined, kind: string | undefined, bare: string | undefined) => {
      const label = this.labels.get((linked ?? bare)!.toLowerCase());
      if (label === undefined) return whole;
      return linked ? `${words} (${linkedKind!.toLowerCase()} “${short(label)}”)` : `${kind!.toLowerCase()} “${short(label)}”`;
    });
    // Listed under the space they're in, as a tree.
    const below = new Map<string, number[]>();
    for (const [at, space] of h.spaces.entries()) if (at > 0) below.get(space.parent!)?.push(at) ?? below.set(space.parent!, [at]);
    const tree: number[] = [];
    const depth = new Map<number, number>([[0, 0]]);
    const stack = [0];
    while (stack.length) {
      const at = stack.pop()!;
      tree.push(at);
      for (const child of (below.get(h.spaces[at].id) ?? []).toReversed()) {
        depth.set(child, depth.get(at)! + 1);
        stack.push(child);
      }
    }
    const pageCounts = h.spaces.map(() => 0);
    for (const at of this.pages.values()) if (this.pageSort[at] === Sort.knowledge && this.pageTitled[at]) pageCounts[this.pageSpace[at]]++;
    const rules: ImportPreview['rules'] = [];
    let length = 0;
    for (const rule of this.rules) {
      if (this.replacedRules.has(rule.id)) continue;
      rules.push({ space: h.spaces[rule.space].name, kind: rule.kind, text: labelled(rule.body), onlyHere: rule.onlyHere, private: rule.private });
      length += rules.at(-1)!.text.length;
      if (length > importLimits.rules) throw new ImportRefused(tooManyRules);
    }
    const preview: ImportPreview = {
      name: h.spaces[0].name,
      from: { instance: h.instance.slice(0, 200), exportedBy: plainName(h.exportedBy.name), exportedAt: h.exportedAt },
      spaces: tree.map((at) => ({
        name: h.spaces[at].name, depth: depth.get(at)!, closed: h.spaces[at].closed, archived: h.spaces[at].archived !== null,
        pages: pageCounts[at], sources: this.sources[at], tasks: this.tasks[at],
      })),
      shared: this.shared,
      private: this.private,
      rules,
      skills: [...this.skills.values()].flatMap((parts) => parts.titles.map((title) => ({
        space: h.spaces[this.pageSpace[this.pages.get(parts.page)!]].name, name: title.body, private: title.private,
      }))),
      includes: h.includes.map((include) => {
        const skill = include.skill === null ? undefined : this.pages.get(include.skill);
        const from = include.rules !== null ? h.spaces[this.spaceIndex.get(include.rules)!].name : skill !== undefined ? h.spaces[this.pageSpace[skill]].name : plainName(include.elsewhere!.space);
        const skillName = skill !== undefined ? (this.titles.get(include.skill!) ?? 'skill') : include.elsewhere?.skill ? plainName(include.elsewhere.skill) : null;
        return {
          space: h.spaces[this.spaceIndex.get(include.space)!].name, kind: skillName === null ? 'rules' as const : 'skill' as const, from: short(from), skill: skillName === null ? null : short(skillName),
          private: include.visibility === 'private', waiting: include.waiting, inFile: include.elsewhere === null,
        };
      }),
      hash,
    };
    const json = JSON.stringify(preview);
    if (Buffer.byteLength(json) > importLimits.preview) throw new ImportRefused(tooMuchToShow);
    return json;
  }
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
  /** A fingerprint of the file, so the import is of exactly this. */
  hash: string;
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** A reference in text, as a Markdown link or on its own, as an export writes them. */
const references = new RegExp(`\\[([^\\[\\]\\n]*)\\]\\((page|item|source|space|task):(${uuid})\\)|\\b(page|item|source|space|task):(${uuid})`, 'gi');

/** The ids in a line of a long list, in time in step with the line. */
const ids = new RegExp(uuid, 'g');
function idsIn(line: string): string[] {
  return line.match(ids) ?? [];
}

/** What a text refers to in Homing, by id. Links' words hold no brackets, so it takes time in step with the text. */
export function mentions(body: string): string[] {
  return [...body.matchAll(references)].map((match) => (match[3] ?? match[5]).toLowerCase());
}

/**
 * Reads an export through, to show what it would bring, telling how far it's got once it's open
 * and after each file it reads, again too. Nothing is created.
 */
export async function inspect(path: string, hash: string, progress: (done: number, total: number) => void): Promise<{ preview: string; inside: string[] }> {
  const bundle = Bundle.open(path);
  try {
    const reader = new Reader(bundle);
    bundle.onFile = () => progress(bundle.done, bundle.total);
    bundle.onFile();
    for (const list of reads) await reader.readList(list, async () => {});
    reader.finish();
    reader.resolve();
    return { preview: reader.preview(hash), inside: [...reader.inside] };
  } finally {
    bundle.close();
  }
}

/**
 * Reads an export through to import it: first what Homing writes to start, then a batch for each
 * part of a long list, then what it writes last, each handed on and written before the next.
 */
export async function load(
  path: string,
  importing: { key: string; name: string; inside: string[] },
  write: { begin: (payload: string) => Promise<void>; batch: (payload: string, done: number, total: number) => Promise<void>; finish: (payload: string) => Promise<void> },
): Promise<void> {
  const bundle = Bundle.open(path);
  try {
    const reader = new Reader(bundle, { key: importing.key, inside: new Set(importing.inside) });
    await write.begin(reader.begin(cleanName(importing.name)));
    for (const list of reads) await reader.readList(list, (rows) => write.batch(JSON.stringify(rows), bundle.done, bundle.total));
    reader.finish();
    await write.finish(reader.ending());
  } finally {
    bundle.close();
  }
}
