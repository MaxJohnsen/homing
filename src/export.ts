// Exporting a space (spec §3, guarantee 10): everything the person can see in it, and in the
// spaces below it they can open, as one zip. homing.json holds all of it, for importing it again.
// knowledge/ is the same knowledge as readable Markdown in the Open Knowledge Format, and guidance/
// holds the rules and skills as AGENTS.md files and SKILL.md folders. Everything is read in the
// person's own session, so row-level security keeps anyone else's private side out underneath.

import { randomUUID } from 'node:crypto';
import { join as joinPath, posix } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { stringify } from 'yaml';
import { personOf, type Session } from './db.ts';
import { includeSeen } from './guidance.ts';
import { current, importedAuthor, itemColumns, visible, type Imported, type ImportedAuthor, type ImportedPerson, type Item } from './knowledge.ts';
import { frontmatter } from './skills.ts';
import { accessibleSpaces, listSpaces, peopleNames, type Space } from './spaces.ts';
import type { Task } from './tasks.ts';
import { ZipWriter } from './zip.ts';

/** What a space that came in an import keeps of where it came from: who created it there, and who archived it. */
type SpaceImported = Imported & { creator?: ImportedAuthor; archivedBy?: ImportedPerson };

/** Someone the export names, by a key that holds only within it: never an account's id or email. */
export interface Person {
  key: string;
  /** Null for someone the exporter doesn't share a space with any more. */
  name: string | null;
}

/** Who did something: a person, an agent for a person, or a space's own routine. */
export interface Author {
  by: 'person' | 'agent' | 'routine';
  /** The person's key in the export's people, if a person did it or an agent did it for one. */
  person: string | null;
  /** The agent, when one did it. */
  agent: string | null;
}

/** Shared with the space, or private to the person who exported it. */
export type Visibility = 'shared' | 'private';

/** For something that came in an import: its id in that export, the Homing it came from, and who imported it, by key, and when, where the exporter sees them. */
export interface ImportedFrom {
  id?: string;
  from?: string;
  by?: string | null;
  at?: string;
}

/** homing.json: everything an import needs, by the ids things have now. Times are ISO 8601. */
export interface Manifest {
  format: 'homing-export';
  version: 2;
  /** The Homing it came from. */
  instance: string;
  exportedAt: string;
  exportedBy: { person: string; name: string };
  /** The space that was exported. The others are below it. */
  space: string;
  people: Person[];
  spaces: {
    id: string;
    name: string;
    parent: string | null;
    /** Closed to the people in the space above it. */
    closed: boolean;
    /** In the exporter's personal tree, so only they have it. */
    private: boolean;
    /** Who created it, if Homing knows. */
    creator: Author | null;
    archived: { at: string; by: string | null } | null;
    createdAt: string;
    /** Its folder in knowledge/ and guidance/, empty for the exported space. */
    folder: string;
    imported?: ImportedFrom;
  }[];
  /** Every time the exporter archived or reopened one of the spaces. */
  spaceArchives: { space: string; archived: boolean; author: Author; at: string }[];
  pages: {
    id: string;
    space: string;
    /** A free-text type, or guidance, skill or overview. */
    type: string | null;
    /** When the first of its items the exporter sees was written. */
    createdAt: string;
    archived: { at: string; by: string | null } | null;
    /** Where it reads in the bundle. */
    file: string | null;
    imported?: ImportedFrom;
  }[];
  items: {
    id: string;
    page: string;
    space: string;
    kind: Item['kind'];
    /** A skill's file's place in its folder. */
    path: string | null;
    body: string;
    visibility: Visibility;
    /** Who wrote what it says now, and when. Earlier versions are in revisions. */
    author: Author;
    createdAt: string;
    writtenAt: string;
    supersedes: string | null;
    /** For a rule: it applies only in its own space. */
    onlyHere?: boolean;
    /** For a removal: whether it reaches the spaces below, as what it removed did. */
    reachesDown?: boolean;
    /** For a shared copy of the exporter's own private item: that item. */
    publishedFrom: string | null;
    published: { by: string | null; at: string } | null;
    /** The sources in the export it rests on. */
    sources: string[];
    /** How many sources it also rests on that the exporter sees, kept in spaces outside the export. */
    sourcesElsewhere: number;
    imported?: ImportedFrom;
  }[];
  revisions: { item: string; visibility: Visibility; body: string; author: Author; writtenAt: string; replacedAt: string; imported?: ImportedFrom }[];
  sources: { id: string; space: string; visibility: Visibility; reference: string | null; excerpt: string; author: Author; createdAt: string; imported?: ImportedFrom }[];
  /** Pages that mention other pages, as page:… in an item. */
  links: { item: string; from: string; to: string }[];
  /** Pages gathered into collections. */
  gathered: { collection: string; page: string; visibility: Visibility; author: Author; createdAt: string }[];
  /** Every time a page was archived or reopened, since the exporter could see it. */
  pageArchives: { page: string; archived: boolean; author: Author; at: string }[];
  tasks: {
    id: string;
    space: string;
    visibility: Visibility;
    title: string;
    description: string | null;
    due: string | null;
    /** Who it's for, by their key in people. */
    assignee: string | null;
    done: { at: string; by: string | null } | null;
    author: Author;
    createdAt: string;
    updatedAt: string;
    imported?: ImportedFrom;
  }[];
  /**
   * What each space's guidance includes by link, as the exporter sees it: for everyone, and their
   * own. What it brings in is a space's rules or a skill, by id when it's in the export, or by
   * name when it isn't, which can't come back in an import. Older exports have none.
   */
  includes: {
    id: string;
    /** The space whose guidance includes it. */
    space: string;
    visibility: Visibility;
    /** The exporter's own, waiting while the space includes the same for everyone. */
    waiting: boolean;
    /** The space in the export whose rules it brings in. */
    rules: string | null;
    /** The skill in the export it brings in, by its page. */
    skill: string | null;
    /** What it brings in from outside the export: a space's rules, or one of its skills, by name. */
    elsewhere: { space: string; skill: string | null } | null;
    /** Who added it, and when. */
    author: Author;
    addedAt: string;
    imported?: ImportedFrom;
  }[];
}

/**
 * The most Homing takes in one import: the zip, the files it lists, homing.json, each file of a
 * long list and all of them together unpacked, and the objects in one file, so even a small zip
 * can't make Homing build millions of them. What the preview shows has limits of its own: the
 * rules' text, and the whole preview. An export is held to all of them (exportSpace), and checked
 * by reading it as an import would, so whatever Homing exports, it imports again.
 */
export const importLimits = {
  upload: 2 * 1024 * 1024 * 1024,
  files: 30_000_000,
  header: 32 * 1024 * 1024,
  chunk: 24 * 1024 * 1024,
  unpacked: 8 * 1024 * 1024 * 1024,
  objects: 2_000_000,
  rules: 1_000_000,
  preview: 5 * 1024 * 1024,
};

/** The manifest's long lists, as homing.json names their files, in the order an import writes them. */
export const lists = ['pages', 'sources', 'items', 'revisions', 'gathered', 'pageArchives', 'tasks', 'links'] as const;
export type ListName = (typeof lists)[number];

/** homing.json itself: what the export is, and its short lists, with the files of its long ones. */
export type Header = Omit<Manifest, ListName> & { files: Record<ListName, string[]> };

/** How large each file of a long list grows before the next one starts. */
const chunkSize = 8 * 1024 * 1024;

/** Where an export goes as it's made: its readable files, and the manifest's long lists a line at a time. */
interface Sink {
  file(path: string, content: string): Promise<void>;
  line(list: ListName, entry: unknown): Promise<void>;
}

/** An export written to a file, to send and then remove. */
export interface Exported {
  filename: string;
  path: string;
  size: number;
}

/**
 * A space as the person sees it, with the spaces below it they can open, as a zip written in the
 * folder given, or 'too large' when it holds more than an import takes, or undefined when they
 * can't open it. Read in one snapshot, so it holds together, and written a space at a time. It
 * stops, with nothing left, as soon as `gone` says nobody waits for it any more.
 */
export async function exportSpace(
  s: Session,
  spaceId: string,
  instance: URL,
  folder: string,
  { now = new Date(), gone = () => false }: { now?: Date; gone?: () => boolean } = {},
): Promise<Exported | 'too large' | 'gone' | undefined> {
  const path = joinPath(folder, `homing-export-${randomUUID()}.zip`);
  const writer = await ZipWriter.create(path, now);
  try {
    const files = Object.fromEntries(lists.map((list) => [list, [] as string[]])) as Record<ListName, string[]>;
    // Each long list as JSON Lines, a few megabytes a file, so nothing reads it whole.
    const pending = new Map<ListName, { lines: string[]; size: number; objects: number }>();
    let unpacked = 0;
    // Stopped as soon as it holds more than an import takes, or nobody waits for it.
    const fits = () => {
      if (writer.size > importLimits.upload || unpacked > importLimits.unpacked) throw tooLarge;
      if (gone()) throw stopped;
    };
    const flush = async (list: ListName) => {
      const chunk = pending.get(list);
      if (!chunk?.lines.length) return;
      const name = `homing/${list}-${String(files[list].length + 1).padStart(5, '0')}.jsonl`;
      await writer.add(name, `${chunk.lines.join('\n')}\n`);
      files[list].push(name);
      unpacked += chunk.size;
      pending.set(list, { lines: [], size: 0, objects: 0 });
      fits();
    };
    const sink: Sink = {
      async file(name, content) {
        await writer.add(name, content);
        fits();
      },
      async line(list, entry) {
        const text = JSON.stringify(entry);
        const chunk = pending.get(list) ?? { lines: [], size: 0, objects: 0 };
        pending.set(list, chunk);
        chunk.lines.push(text);
        chunk.size += Buffer.byteLength(text) + 1;
        chunk.objects += objectsIn(text);
        // Well within what an import reads of one file, in bytes and in objects.
        if (chunk.size >= chunkSize || chunk.objects >= importLimits.objects / 2) await flush(list);
      },
    };
    const header = await exportTo(s, spaceId, instance, now, sink);
    if (header === undefined) {
      await writer.abort();
      return undefined;
    }
    for (const list of lists) await flush(list);
    const json = `${JSON.stringify({ ...header, files })}\n`;
    if (Buffer.byteLength(json) > importLimits.header || objectsIn(json) > importLimits.objects) throw tooLarge;
    await writer.add('homing.json', json);
    // As a whole, with homing.json and the zip's own records, no larger than an upload.
    const size = await writer.end();
    if (size > importLimits.upload) throw tooLarge;
    return { filename: `${slug(header.spaces[0].name, 'space')}-${header.exportedAt.slice(0, 10)}.zip`, path, size };
  } catch (error) {
    await writer.abort();
    if (error === tooLarge) return 'too large';
    if (error === stopped) return 'gone';
    throw error;
  }
}

/** Thrown to stop an export that holds more than an import takes, or that nobody waits for any more. */
const tooLarge = new Error('That export holds more than an import takes.');
const stopped = new Error('Nobody waits for that export any more.');

/** How many objects and lists a JSON text holds at most, as an import counts them: by their opening brackets. */
function objectsIn(text: string): number {
  let n = 0;
  for (let at = text.indexOf('{'); at !== -1; at = text.indexOf('{', at + 1)) n++;
  for (let at = text.indexOf('['); at !== -1; at = text.indexOf('[', at + 1)) n++;
  return n;
}

/** Everything the person can see in the space and the spaces below it they can open, as one manifest in memory, for small ones. */
export async function manifestOf(s: Session, spaceId: string, instance: URL, now = new Date()): Promise<Manifest | undefined> {
  const found = Object.fromEntries(lists.map((list) => [list, [] as unknown[]])) as Record<ListName, unknown[]>;
  const header = await exportTo(s, spaceId, instance, now, { file: async () => {}, line: async (list, entry) => void found[list].push(entry) });
  return header === undefined ? undefined : ({ ...header, ...found } as Manifest);
}

/** A whole manifest as the files of a bundle: homing.json, and its long lists as JSON Lines, a file each. */
export function bundleFiles(m: Manifest): [string, string][] {
  const files = Object.fromEntries(lists.map((list) => [list, m[list].length ? [`homing/${list}-00001.jsonl`] : []])) as Record<ListName, string[]>;
  const head = Object.fromEntries(Object.entries(m).filter(([key]) => !(lists as readonly string[]).includes(key)));
  return [
    ['homing.json', `${JSON.stringify({ ...head, files })}\n`],
    ...lists.filter((list) => m[list].length).map((list): [string, string] => [files[list][0], `${m[list].map((entry) => JSON.stringify(entry)).join('\n')}\n`]),
  ];
}

/** A bundle's whole manifest, from its files, for small ones. */
export function bundleManifest(read: (path: string) => string): Manifest {
  const header = JSON.parse(read('homing.json')) as Header;
  const manifest = { ...header } as Partial<Header> & Record<string, unknown>;
  delete manifest.files;
  for (const list of lists) {
    manifest[list] = (header.files[list] ?? []).flatMap((file) => read(file).split('\n').filter((line) => line).map((line) => JSON.parse(line)));
  }
  return manifest as unknown as Manifest;
}

/** How much text the person would export, in bytes, counted without reading it: at least what its long lists would hold. */
async function sizeOf(s: Session, ids: string[]): Promise<number> {
  const [{ size }] = await s.tx<{ size: string }[]>`
    select (select coalesce(sum(octet_length(c.body)), 0) from content c where c.space_id in ${s.tx(ids)} and ${visible(s, 'c')})
         + (select coalesce(sum(octet_length(r.body)), 0) from revisions r where r.space_id in ${s.tx(ids)} and ${visible(s, 'r')})
         + (select coalesce(sum(octet_length(src.excerpt) + coalesce(octet_length(src.reference), 0)), 0) from sources src where src.space_id in ${s.tx(ids)} and ${visible(s, 'src')})
         + (select coalesce(sum(octet_length(t.title) + coalesce(octet_length(t.description), 0)), 0) from tasks t where t.space_id in ${s.tx(ids)} and ${visible(s, 't')})
      as size
  `;
  return Number(size);
}

/**
 * Exports what the person can see, a space at a time: the manifest's long lists go to the sink a
 * line at a time, and each space's readable files as they're made, so only one space's rows are
 * held at once. Returns what homing.json says besides, once everything is written.
 */
async function exportTo(s: Session, spaceId: string, instance: URL, now: Date, sink: Sink): Promise<Omit<Manifest, ListName> | undefined> {
  const me = personOf(s.principal);
  if (!me) return undefined;
  // In the order they were made, and spaces made at the same moment by id, so an export lists them the same way every time.
  const made = new Map((await s.tx<{ id: string }[]>`select id from spaces where id in (${accessibleSpaces(s)}) order by created_at, id`).map((row, at) => [row.id, at]));
  const open = (await listSpaces(s)).sort((a, b) => made.get(a.id)! - made.get(b.id)!);
  const root = open.find((space) => space.id === spaceId);
  if (!root) return undefined;
  // Down only through spaces the person can open, so a closed space they aren't in leaves no trace, nor anything in it.
  const tree: Space[] = [root];
  for (let i = 0; i < tree.length; i++) tree.push(...open.filter((space) => space.parentId === tree[i].id));
  const ids = tree.map((space) => space.id);
  const exported = new Set(ids);
  // More than an import unpacks, before anything is written.
  if ((await sizeOf(s, ids)) > importLimits.unpacked) throw tooLarge;

  const spaceRows = new Map((await s.tx<{ id: string; archivedBy: string | null; createdAt: Date; createdBy: string | null; agent: string | null; imported: SpaceImported | null }[]>`
    select id, archived_by, created_at, created_by, agent, imported from spaces where id in ${s.tx(ids)}
  `).map((row) => [row.id, row]));
  const spaceArchives = await s.tx<{ spaceId: string; archived: boolean; personId: string | null; agent: string | null; at: Date }[]>`
    select a.space_id, a.archived, a.person_id, a.agent, a.at from space_archives a
    where a.space_id in ${s.tx(ids)} and a.person_id = ${me}::uuid
    order by a.at
  `;
  // A page starts with the first of its items the person sees, which carry their own dates. What
  // happened to the page itself before the person could see anything on it, such as when someone
  // had it to themselves and archived it, stays theirs: something shared from someone's own side
  // counts from when it was shared. The app shows a page's archiving by the same rule, from the
  // same functions.
  const pages = await s.tx<{ id: string; spaceId: string; type: string | null; createdAt: Date; seen: Date; archivedAt: Date | null; archivedBy: string | null; imported: (Imported & { archivedBy?: ImportedPerson }) | null }[]>`
    select p.id, p.space_id, p.type, a.at as archived_at, a.archived_by, first.created_at, f.seen,
           -- Who archived it before it was imported, with the rest of where it came from, only when the person sees who did.
           case when a.imported_by is null then p.imported else p.imported || jsonb_build_object('archivedBy', a.imported_by) end as imported
    from pages p
    join lateral (
      select min(c.created_at) as created_at from content c
      where c.page_id = p.id and ${visible(s, 'c')}
    ) first on first.created_at is not null
    cross join lateral page_first_seen(p.id) f
    -- Asked only for archived pages: kept apart, so it isn't asked for every page first.
    left join lateral (select * from page_archived(p.id) where p.archived offset 0) a on true
    where p.space_id in ${s.tx(ids)}
    order by first.created_at, p.id
  `;
  const pageIds = new Set(pages.map((page) => page.id));
  const firstSeen = new Map(pages.map((page) => [page.id, page.seen]));
  const pagesIn = groupBy(pages, (page) => page.spaceId);
  // Each page's title as the person sees it, and where there are rules or an overview, for where everything goes.
  const titleRows = await s.tx<{ pageId: string; body: string; privateTo: string | null }[]>`
    select c.page_id, c.body, c.private_to from content c
    where c.space_id in ${s.tx(ids)} and c.kind = 'title' and ${visible(s, 'c')} and ${current(s, 'c')}
    order by c.created_at, c.id
  `;
  const ruled = new Set((await s.tx<{ pageId: string }[]>`
    select distinct c.page_id from content c
    where c.space_id in ${s.tx(ids)} and c.kind in ('requirement', 'preference') and ${visible(s, 'c')} and ${current(s, 'c')}
  `).map((row) => row.pageId));
  const overviewed = new Set((await s.tx<{ pageId: string }[]>`
    select distinct c.page_id from content c join pages p on p.id = c.page_id and p.type = 'overview'
    where c.space_id in ${s.tx(ids)} and c.kind = 'text' and ${visible(s, 'c')} and ${current(s, 'c')}
  `).map((row) => row.pageId));
  const firstTitle = new Map<string, { body: string; visibility: Visibility }>();
  const titles = new Map<string, string>();
  for (const row of titleRows) {
    if (!firstTitle.has(row.pageId)) firstTitle.set(row.pageId, { body: row.body, visibility: row.privateTo ? 'private' : 'shared' });
    // Their own title if they named it, otherwise the shared one.
    if (!titles.has(row.pageId) || row.privateTo) titles.set(row.pageId, oneLine(row.body, 200));
  }
  const spacesSeen = tree.map((space) => ({ id: space.id, name: space.name, parent: space === root ? null : space.parentId }));
  const layout = layoutOf(spacesSeen, pages.map((page) => ({ id: page.id, space: page.spaceId, type: page.type })), titles, firstTitle, ruled, overviewed);
  const spaceName = new Map(tree.map((space) => [space.id, space.name]));
  for (const page of pages) if (page.type === 'overview') titles.set(page.id, `Overview of ${oneLine(spaceName.get(page.spaceId)!, 200)}`);

  // What each space's guidance includes, as the person sees it there: for everyone, and their own,
  // only while they can open what it points to, so one they can't leaves no trace. Theirs waits
  // while the space includes the same for everyone.
  const includes = await s.tx<{ id: string; spaceId: string; privateTo: string | null; spaceIncluded: string | null; skillIncluded: string | null; fromName: string; skillName: string | null; waiting: boolean; addedBy: string | null; addedAt: Date; imported: Imported | null }[]>`
    select i.id, i.space_id, i.private_to, i.space_included, i.skill_included, x.name as from_name, t.body as skill_name,
           i.private_to is not null and exists (
             select from includes o
             where o.space_id = i.space_id and o.private_to is null and o.removed_at is null
               and coalesce(o.space_included, o.skill_included) = coalesce(i.space_included, i.skill_included)
           ) as waiting,
           i.added_by, i.added_at, i.imported
    from includes i
    left join lateral (
      select t.body, t.space_id from content t
      where t.page_id = i.skill_included and t.kind = 'title' and ${visible(s, 't')} and ${current(s, 't')}
      order by t.private_to is null
      limit 1
    ) t on true
    join spaces x on x.id = coalesce(i.space_included, t.space_id) and x.id in (${accessibleSpaces(s)})
    where i.space_id in ${s.tx(ids)} and i.removed_at is null and ${includeSeen(s, 'i')}
    order by i.added_at, i.id
  `;

  // Everyone named gets a key of their own, in the order they come, and a name only if the person
  // shares a space with them, the way Homing shows them. Someone named in an import is told apart
  // by the import and their key in it, never matched with anyone here.
  const keys = new Map<string, string>();
  const whose = new Map<string, string>();
  const names = new Map<string, string>();
  const named = (id: string | null) => {
    if (id === null) return null;
    let found = keys.get(id);
    if (!found) {
      found = `person-${keys.size + 1}`;
      keys.set(id, found);
      whose.set(found, id);
    }
    return found;
  };
  const elsewhere = (imported: Imported | null | undefined, person: ImportedPerson | null | undefined): string | null => {
    if (!imported || !person?.person) return null;
    const token = `import ${imported.import} ${person.person}`;
    names.set(token, person.name ?? '');
    return token;
  };
  const key = (id: string | null) => named(id);
  // Names of the people about to be named, fetched a space at a time.
  const nameAll = async (ids: (string | null)[]) => {
    const unknown = [...new Set(ids.filter((id): id is string => id !== null && !names.has(id) && !id.startsWith('import ')))];
    if (!unknown.length) return;
    const found = await peopleNames(s, unknown);
    for (const id of unknown) names.set(id, found.get(id) ?? '');
  };
  // Who imported what came in an import, when, and from where, fetched as they come.
  const imports = new Map<string, { id: string; importedBy: string | null; importedAt: Date; instance: string }>();
  const importsOf = async (rows: { imported?: Imported | null }[]) => {
    const unknown = [...new Set(rows.map((row) => row.imported?.import).filter((id): id is string => id !== undefined && !imports.has(id)))];
    if (!unknown.length) return;
    for (const row of await s.tx<{ id: string; importedBy: string | null; importedAt: Date; instance: string }[]>`
      select id, imported_by, imported_at, instance from imports where id in ${s.tx(unknown)}
    `) imports.set(row.id, row);
    await nameAll([...imports.values()].map((row) => row.importedBy));
  };
  // What still says what it said when it was imported keeps who wrote it there.
  const author = (id: string | null, agent: string | null, imported: Imported | null = null): Author => {
    const before = importedAuthor(imported);
    if (before) return { by: before.by, person: key(elsewhere(imported, before)), agent: before.agent };
    return { by: agent ? 'agent' : id ? 'person' : 'routine', person: key(id), agent };
  };
  const from = (imported: Imported | null): { imported?: ImportedFrom } => {
    if (!imported) return {};
    const row = imports.get(imported.import);
    return { imported: { ...(imported.id && { id: imported.id }), ...(row && { from: row.instance, by: key(row.importedBy), at: time(row.importedAt) }) } };
  };
  const side = (privateTo: string | null): Visibility => (privateTo ? 'private' : 'shared');
  const time = (date: Date) => date.toISOString();
  const verbatim = (kind: Item['kind']) => kind === 'file' || kind === 'requirement' || kind === 'preference';

  key(me);
  await nameAll([me, ...spaceArchives.map((archive) => archive.personId), ...[...spaceRows.values()].flatMap((row) => [row.createdBy, row.archivedBy]), ...includes.map((include) => include.addedBy)]);
  await importsOf([...spaceRows.values(), ...pages, ...includes]);

  const spaces: Manifest['spaces'] = [];
  for (const space of tree) {
    const row = spaceRows.get(space.id)!;
    spaces.push({
      id: space.id,
      name: space.name,
      parent: space === root ? null : space.parentId,
      closed: space.closed,
      private: space.privateTo !== null,
      creator: row.imported?.creator ? author(null, null, { import: row.imported.import, author: row.imported.creator }) : row.createdBy || row.agent ? author(row.createdBy, row.agent) : null,
      archived: space.archivedAt ? { at: time(space.archivedAt), by: key(row.archivedBy) ?? key(elsewhere(row.imported, row.imported?.archivedBy)) } : null,
      createdAt: time(row.createdAt),
      folder: layout.folders.get(space.id)!,
      ...from(row.imported),
    });
  }
  const knowledgePages = new Map(tree.map((space) => [space.id, (pagesIn.get(space.id) ?? []).filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).length]));
  const context: Context = {
    layout, titles, spaces, knowledgePages,
    exporter: oneLine(names.get(me) || 'whoever exported it', 200),
    nameOf: (person) => (person ? names.get(whose.get(person) ?? '') || null : null),
    pageOrder: new Map(pages.map((page, at) => [page.id, at])),
    pageSpace: new Map(pages.map((page) => [page.id, page.spaceId])),
    guidanceFile: new Map(pages.filter((page) => page.type === 'guidance' && layout.files.has(page.id)).map((page) => [page.spaceId, layout.files.get(page.id)!])),
  };
  const includeEntries: Manifest['includes'] = includes.map((include) => {
    const inside = include.spaceIncluded ? exported.has(include.spaceIncluded) : pageIds.has(include.skillIncluded!);
    return {
      id: include.id,
      space: include.spaceId,
      visibility: side(include.privateTo),
      waiting: include.waiting,
      rules: inside ? include.spaceIncluded : null,
      skill: inside ? include.skillIncluded : null,
      elsewhere: inside ? null : { space: include.fromName, skill: include.skillName },
      author: author(include.addedBy, null, include.imported),
      addedAt: time(include.addedAt),
      ...from(include.imported),
    };
  });

  // What texts refer to that's in the export, so references to anything else lose their id.
  const cleaner = async (texts: (string | null)[]) => {
    const mentioned = new Set<string>();
    for (const text of texts) if (text) for (const match of text.matchAll(references)) mentioned.add((match[2] ?? match[3]).toLowerCase());
    const known = new Set([...mentioned].filter((id) => exported.has(id) || pageIds.has(id)));
    const unsure = [...mentioned].filter((id) => !known.has(id));
    if (unsure.length) {
      for (const row of await s.tx<{ id: string }[]>`
        select c.id from content c where c.id = any(${s.tx.array(unsure)}::uuid[]) and c.space_id in ${s.tx(ids)} and ${visible(s, 'c')}
        union all select src.id from sources src where src.id = any(${s.tx.array(unsure)}::uuid[]) and src.space_id in ${s.tx(ids)} and ${visible(s, 'src')}
        union all select t.id from tasks t where t.id = any(${s.tx.array(unsure)}::uuid[]) and t.space_id in ${s.tx(ids)} and ${visible(s, 't')}
      `) known.add(row.id);
    }
    return (text: string) => scrub(text, known);
  };

  // A space at a time, and in each its items and sources a few thousand at a time, each written as
  // it's read, so a big space never is in memory at once.
  for (const space of tree) {
    const here = space.id;
    const archives = await s.tx<{ pageId: string; archived: boolean; personId: string | null; agent: string | null; at: Date; imported: Imported | null }[]>`
      select a.page_id, a.archived, a.person_id, a.agent, a.at, a.imported from page_archives a
      join pages p on p.id = a.page_id
      where p.space_id = ${here}::uuid
      order by a.at
    `;
    const gathered = await s.tx<{ collectionId: string; pageId: string; privateTo: string | null; addedBy: string | null; agent: string | null; createdAt: Date; imported: Imported | null }[]>`
      select g.collection_id, g.page_id, g.private_to, g.added_by, g.agent, g.created_at, g.imported from gathered g
      where g.space_id = ${here}::uuid and ${visible(s, 'g')}
      order by g.created_at
    `;
    const tasks = await s.tx<Task[]>`
      select t.id, t.space_id, t.private_to, t.title, t.description, to_char(t.due, 'YYYY-MM-DD') as due, t.assignee, t.done_at, t.done_by,
             t.written_by, t.agent, t.created_at, t.updated_at, t.imported
      from tasks t
      where t.space_id = ${here}::uuid and ${visible(s, 't')}
      order by t.created_at, t.id
    `;
    await importsOf([...archives, ...gathered, ...tasks]);
    await nameAll([
      ...archives.map((archive) => archive.personId), ...gathered.map((gathering) => gathering.addedBy), ...tasks.flatMap((task) => [task.writtenBy, task.assignee, task.doneBy]),
      ...(pagesIn.get(here) ?? []).map((page) => page.archivedBy),
    ]);

    const spacePages: Manifest['pages'] = (pagesIn.get(here) ?? []).map((page) => ({
      id: page.id,
      space: page.spaceId,
      type: page.type,
      createdAt: time(page.createdAt),
      // Archived before the person could see it, even by them: archived since then, by nobody they know of.
      archived: !page.archivedAt ? null : page.archivedAt < page.seen ? { at: time(page.seen), by: null } : { at: time(page.archivedAt), by: key(page.archivedBy) ?? key(elsewhere(page.imported, page.imported?.archivedBy)) },
      file: layout.files.get(page.id) ?? null,
      ...from(page.imported),
    }));
    for (const entry of spacePages) await sink.line('pages', entry);
    // Only since the person could see the page, so nothing from before shows through.
    const pageArchives: Manifest['pageArchives'] = archives
      .filter((archive) => pageIds.has(archive.pageId) && archive.at >= firstSeen.get(archive.pageId)!)
      .map((archive) => ({ page: archive.pageId, archived: archive.archived, author: author(archive.personId, archive.agent, archive.imported), at: time(archive.at) }));
    const gatheredEntries: Manifest['gathered'] = gathered
      .filter((gathering) => pageIds.has(gathering.collectionId) && pageIds.has(gathering.pageId))
      .map((gathering) => ({
        collection: gathering.collectionId,
        page: gathering.pageId,
        visibility: side(gathering.privateTo),
        author: author(gathering.addedBy, gathering.agent, gathering.imported),
        createdAt: time(gathering.createdAt),
      }));
    const readable = readableSpace(spaces.find((entry) => entry.id === here)!, spacePages, pageArchives, gatheredEntries, context, sink);

    for (const batch of await pageBatches(s, here, spacePages)) {
      const pagesHere = s.tx(batch.map((page) => page.id));
      const found = await s.tx<Item[]>`
        select ${itemColumns(s, 'c')} from content c
        where c.space_id = ${here}::uuid and c.page_id in ${pagesHere} and ${visible(s, 'c')}
        order by c.created_at, c.id
      `;
      // The sources an item rests on that the person sees: in the export, or kept somewhere else.
      const citations = await s.tx<{ contentId: string; sourceId: string; here: boolean; spaceId: string; reference: string | null; excerpt: string }[]>`
        select ci.content_id, ci.source_id, src.space_id in ${s.tx(ids)} as here, src.space_id, src.reference, left(src.excerpt, 400) as excerpt
        from citations ci
        join content c on c.id = ci.content_id
        join sources src on src.id = ci.source_id
        where c.space_id = ${here}::uuid and c.page_id in ${pagesHere} and ${visible(s, 'c')} and ${visible(s, 'src')}
        order by src.created_at, src.id
      `;
      const revisions = await s.tx<{ contentId: string; privateTo: string | null; body: string; writtenBy: string | null; agent: string | null; writtenAt: Date; replacedAt: Date; imported: Imported | null }[]>`
        select r.content_id, r.private_to, r.body, r.written_by, r.agent, r.written_at, r.replaced_at, r.imported from revisions r
        join content c on c.id = r.content_id
        where r.space_id = ${here}::uuid and c.page_id in ${pagesHere} and ${visible(s, 'r')}
        order by r.replaced_at
      `;

      // A skill's file that would land outside its folder stays out, as an import refuses it, and a
      // removal of something left out, or the person can't see, would remove nothing.
      const placed = found.filter((item) => item.kind !== 'file' || (item.path !== null && safePath(item.path)));
      const seen = new Set(placed.map((item) => item.id));
      const items = placed.filter((item) => item.kind !== 'removed' || (item.supersedes && seen.has(item.supersedes)));
      const itemIds = new Set(items.map((item) => item.id));
      const kindOf = new Map(items.map((item) => [item.id, item.kind]));
      const kept = revisions.filter((revision) => itemIds.has(revision.contentId));
      // References in text to anything left out lose their id, so nothing outside the bundle shows through.
      // Rules and skills' files stay word for word, as guidance comes out as it went in.
      const clean = await cleaner([
        ...items.filter((item) => !verbatim(item.kind)).map((item) => item.body),
        ...kept.filter((revision) => !verbatim(kindOf.get(revision.contentId)!)).map((revision) => revision.body),
        ...citations.flatMap((citation) => [citation.reference, citation.excerpt]),
      ]);
      await importsOf([...items, ...kept]);
      await nameAll([...items.flatMap((item) => [item.writtenBy, item.publishedBy]), ...kept.map((revision) => revision.writtenBy)]);

      const cited = groupBy(citations, (citation) => citation.contentId);
      const itemsOn = groupBy(items, (item) => item.pageId);
      const entries: Data[] = [];
      // Each page's items in an order they can be written in again: what one replaced or was shared from before it.
      for (const page of batch) {
        for (const item of inWritingOrder(itemsOn.get(page.id) ?? [])) {
          const entry: Data = {
            id: item.id,
            page: item.pageId,
            space: item.spaceId,
            kind: item.kind,
            path: item.path,
            body: verbatim(item.kind) ? item.body : clean(item.body),
            visibility: side(item.privateTo),
            author: author(item.writtenBy, item.agent, item.imported),
            createdAt: time(item.createdAt),
            writtenAt: time(item.updatedAt),
            supersedes: item.supersedes && itemIds.has(item.supersedes) ? item.supersedes : null,
            ...(item.kind === 'requirement' || item.kind === 'preference' ? { onlyHere: !item.reachesDown } : {}),
            // A removal reaches as far as what it removes, so the spaces below see it's gone.
            ...(item.kind === 'removed' ? { reachesDown: item.reachesDown } : {}),
            publishedFrom: item.publishedFrom && itemIds.has(item.publishedFrom) ? item.publishedFrom : null,
            published: item.publishedAt ? { by: key(item.publishedBy) ?? key(elsewhere(item.imported, item.imported?.publishedBy)), at: time(item.publishedAt) } : null,
            sources: (cited.get(item.id) ?? []).filter((citation) => citation.here).map((citation) => citation.sourceId),
            sourcesElsewhere: (cited.get(item.id) ?? []).filter((citation) => !citation.here).length + (item.imported?.sourcesElsewhere ?? 0),
            ...from(item.imported),
          };
          entries.push(entry);
          await sink.line('items', entry);
          if (entry.kind === 'text') {
            const targets = new Set([...entry.body.matchAll(pageRefs)].map((match) => match[1].toLowerCase()).filter((id) => pageIds.has(id) && id !== entry.page));
            for (const to of targets) await sink.line('links', { item: entry.id, from: entry.page, to });
          }
        }
      }
      const revisionEntries: Manifest['revisions'] = kept.map((revision) => ({
        item: revision.contentId,
        visibility: side(revision.privateTo),
        body: verbatim(kindOf.get(revision.contentId)!) ? revision.body : clean(revision.body),
        author: author(revision.writtenBy, revision.agent, revision.imported),
        writtenAt: time(revision.writtenAt),
        replacedAt: time(revision.replacedAt),
        ...from(revision.imported),
      }));
      for (const entry of revisionEntries) await sink.line('revisions', entry);
      // The sources the items rest on in the export, with where they're kept and what they're called.
      const sourcesCited = new Map(citations.filter((citation) => citation.here).map((citation) => [
        citation.sourceId,
        { space: citation.spaceId, label: labelOf({ reference: citation.reference && clean(citation.reference), excerpt: clean(citation.excerpt) }) },
      ]));
      await readable.pages(batch, entries, revisionEntries, sourcesCited);
      await setImmediate();
    }

    for (const entry of gatheredEntries) await sink.line('gathered', entry);
    for (const entry of pageArchives) await sink.line('pageArchives', entry);
    const cleanTask = await cleaner(tasks.flatMap((task) => [task.title, task.description]));
    const taskEntries: Manifest['tasks'] = tasks.map((task) => ({
      id: task.id,
      space: task.spaceId,
      visibility: side(task.privateTo),
      title: cleanTask(task.title),
      description: task.description && cleanTask(task.description),
      due: task.due,
      assignee: key(task.assignee) ?? key(elsewhere(task.imported, task.imported?.assignee)),
      done: task.doneAt ? { at: time(task.doneAt), by: key(task.doneBy) ?? key(elsewhere(task.imported, task.imported?.doneBy)) } : null,
      author: author(task.writtenBy, task.agent, task.imported),
      createdAt: time(task.createdAt),
      updatedAt: time(task.updatedAt),
      ...from(task.imported),
    }));
    for (const entry of taskEntries) await sink.line('tasks', entry);
    await readable.tasks(taskEntries);

    // The space's sources, a thousand at a time, each with the pages anywhere in the export that use it.
    // Each next thousand starts after the last, to the microsecond, which a Date doesn't keep.
    let after: { at: string; id: string } | undefined;
    for (;;) {
      const sources = await s.tx<{ id: string; spaceId: string; privateTo: string | null; reference: string | null; excerpt: string; writtenBy: string | null; agent: string | null; createdAt: Date; at: string; imported: Imported | null }[]>`
        select src.id, src.space_id, src.private_to, src.reference, src.excerpt, src.written_by, src.agent, src.created_at, src.created_at::text as at, src.imported
        from sources src
        where src.space_id = ${here}::uuid and ${visible(s, 'src')}
          and ${after ? s.tx`(src.created_at, src.id) > (${after.at}::text::timestamptz, ${after.id}::uuid)` : s.tx`true`}
        order by src.created_at, src.id
        limit ${sourceBatch}
      `;
      if (!sources.length) break;
      after = { at: sources.at(-1)!.at, id: sources.at(-1)!.id };
      const uses = await s.tx<{ sourceId: string; pageId: string }[]>`
        select distinct ci.source_id, c.page_id from citations ci
        join content c on c.id = ci.content_id
        where ci.source_id in ${s.tx(sources.map((source) => source.id))} and c.space_id in ${s.tx(ids)} and ${visible(s, 'c')}
      `;
      const clean = await cleaner(sources.flatMap((source) => [source.reference, source.excerpt]));
      await importsOf(sources);
      await nameAll(sources.map((source) => source.writtenBy));
      const usedOn = groupBy(uses, (use) => use.sourceId);
      for (const source of sources) {
        const entry: Manifest['sources'][number] = {
          id: source.id,
          space: source.spaceId,
          visibility: side(source.privateTo),
          reference: source.reference && clean(source.reference),
          excerpt: clean(source.excerpt),
          author: author(source.writtenBy, source.agent, source.imported),
          createdAt: time(source.createdAt),
          ...from(source.imported),
        };
        await sink.line('sources', entry);
        await readable.source(entry, (usedOn.get(source.id) ?? []).map((use) => use.pageId));
      }
      await setImmediate();
    }
    await readable.end(includeEntries.filter((include) => include.space === here));
  }

  await nameAll([...keys.keys()]);
  return {
    format: 'homing-export',
    version: 2,
    instance: instance.origin,
    exportedAt: time(now),
    exportedBy: { person: key(me)!, name: names.get(me) ?? '' },
    space: root.id,
    people: [...keys].map(([id, person]) => ({ key: person, name: names.get(id) || null })),
    spaces,
    spaceArchives: spaceArchives.map((archive) => ({ space: archive.spaceId, archived: archive.archived, author: author(archive.personId, archive.agent), at: time(archive.at) })),
    includes: includeEntries,
  };
}

/** What a space's readable files need from the whole export. */
interface Context {
  layout: Layout;
  /** Every page's title, overviews named after their space. */
  titles: Map<string, string>;
  spaces: Manifest['spaces'];
  /** How many knowledge pages each space has, for the index above it. */
  knowledgePages: Map<string, number>;
  exporter: string;
  nameOf: (person: string | null) => string | null;
  /** Where each page is in the export's order, and which space it's in. */
  pageOrder: Map<string, number>;
  pageSpace: Map<string, string>;
  /** Each space's AGENTS.md, where it has one. */
  guidanceFile: Map<string, string>;
}

/**
 * The items in an order they can be written in, what one replaced or was shared from before it,
 * and otherwise as they were made. Something it replaced that isn't among them is left as it is.
 */
function inWritingOrder(items: Item[]): Item[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const done = new Set<string>();
  const order: Item[] = [];
  for (const first of items) {
    // Depth first, without recursion, so a long chain of updates can't run out of stack.
    const stack: [Item, boolean][] = [[first, false]];
    const doing = new Set<string>();
    while (stack.length) {
      const [item, ready] = stack.pop()!;
      if (done.has(item.id)) continue;
      if (ready) {
        done.add(item.id);
        order.push(item);
        continue;
      }
      if (doing.has(item.id)) continue;
      doing.add(item.id);
      stack.push([item, true]);
      for (const before of [item.publishedFrom, item.supersedes]) {
        const target = before === null ? undefined : byId.get(before);
        if (target && !done.has(target.id)) stack.push([target, false]);
      }
    }
  }
  return order;
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const kinds = 'page|item|source|space|task|proposal';
/** A reference to something in Homing, as a Markdown link or on its own, such as [Gunnar](page:…) or item:…. */
// The link's words hold no brackets, so finding references takes time in step with the text.
const references = new RegExp(`\\[([^\\[\\]\\n]*)\\]\\((?:${kinds}):(${uuid})\\)|\\b(?:${kinds}):(${uuid})`, 'gi');
const pageRefs = new RegExp(`\\bpage:(${uuid})`, 'gi');

/** The text with references to anything not in the bundle taken out: a link keeps its words. */
function scrub(text: string, known: Set<string>): string {
  return rewriteReferences(text, (id) => (known.has(id) ? id : undefined));
}

/**
 * The text with each reference to something in Homing, such as [Gunnar](page:…), pointed to what
 * `to` gives for its id. Where it gives nothing, the reference goes: a link keeps its words.
 */
export function rewriteReferences(text: string, to: (id: string) => string | undefined): string {
  return text.replace(references, (whole, words: string | undefined, linked: string | undefined, bare: string | undefined) => {
    const id = (linked ?? bare)!.toLowerCase();
    const next = to(id);
    if (next) return whole.slice(0, whole.length - id.length - (linked ? 1 : 0)) + next + (linked ? ')' : '');
    return linked ? words! : '(not in this export)';
  });
}

/** Where each space and page reads in the bundle. */
interface Layout {
  /** Each space's folder in knowledge/ and guidance/, empty for the exported space. */
  folders: Map<string, string>;
  /** Each page's file, from the top of the zip: a knowledge page's Markdown, a space's AGENTS.md, a skill's folder. */
  files: Map<string, string>;
  /** Each knowledge page's file within knowledge/, for links between them. */
  knowledge: Map<string, string>;
  /** Each current skill's folder within guidance/. */
  skills: Map<string, string>;
}

type Data = Manifest['items'][number];

/**
 * Where everything goes. Folders and files are named after spaces and titles, made unique among
 * their neighbors, and never take the names the bundle uses itself.
 */
function layoutOf(
  spaces: { id: string; name: string; parent: string | null }[],
  pages: { id: string; space: string; type: string | null }[],
  titles: Map<string, string>,
  firstTitle: Map<string, { body: string; visibility: Visibility }>,
  ruled: Set<string>,
  overviewed: Set<string>,
): Layout {
  const folders = new Map<string, string>();
  const files = new Map<string, string>();
  const knowledge = new Map<string, string>();
  const skills = new Map<string, string>();
  for (const space of spaces) {
    const parent = space.parent === null ? undefined : folders.get(space.parent);
    if (parent === undefined) {
      folders.set(space.id, '');
      continue;
    }
    const siblings = new Set(spaces.filter((other) => other.parent === space.parent && folders.has(other.id)).map((other) => folders.get(other.id)!.split('/').at(-1)!));
    folders.set(space.id, join(parent, unique(slug(space.name, 'space'), space.id, siblings, ['sources', 'skills', 'private-skills'])));
  }
  const taken = new Map<string, Set<string>>();
  for (const page of pages) {
    const folder = folders.get(page.space)!;
    if (page.type === 'guidance') {
      if (ruled.has(page.id)) files.set(page.id, `guidance/${join(folder, 'AGENTS.md')}`);
    } else if (page.type === 'overview') {
      if (overviewed.has(page.id)) knowledge.set(page.id, join(folder, 'overview.md'));
    } else if (page.type === 'skill') {
      const title = firstTitle.get(page.id);
      if (!title) continue;
      const group = join(folder, title.visibility === 'private' ? 'private-skills' : 'skills');
      const used = taken.get(`guidance/${group}`) ?? new Set();
      taken.set(`guidance/${group}`, used);
      const path = join(group, unique(slug(title.body, 'skill'), page.id, used, []));
      skills.set(page.id, path);
      files.set(page.id, `guidance/${path}/`);
    } else {
      const used = taken.get(folder) ?? new Set();
      taken.set(folder, used);
      knowledge.set(page.id, join(folder, `${unique(slug(titles.get(page.id) ?? '', 'page'), page.id, used, ['index', 'log', 'tasks', 'overview'])}.md`));
    }
  }
  for (const [id, path] of knowledge) files.set(id, `knowledge/${path}`);
  return { folders, files, knowledge, skills };
}

function join(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** The name, or with the start of the id when a neighbor has it, which it then takes. */
function unique(name: string, id: string, used: Set<string>, reserved: string[]): string {
  const free = (candidate: string) => !used.has(candidate) && !reserved.includes(candidate);
  const chosen = [name, `${name}-${id.slice(0, 8)}`, `${name}-${id}`].find(free) ?? id;
  used.add(chosen);
  return chosen;
}

/** A name for a file or folder: plain lowercase letters, digits and hyphens. */
function slug(text: string, fallback: string): string {
  const plain = text
    .replace(/['’]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return plain || fallback;
}

/** Each page's items that nothing in the bundle replaced or removed, by page. */
function currentItems(items: Data[]): Map<string, Data[]> {
  const replaced = new Set(items.map((item) => item.supersedes).filter((id) => id !== null));
  const byPage = new Map<string, Data[]>();
  for (const item of items) {
    if (replaced.has(item.id) || item.kind === 'removed') continue;
    const items = byPage.get(item.page);
    if (items) items.push(item);
    else byPage.set(item.page, [item]);
  }
  return byPage;
}

/** Groups things by a key, keeping their order. */
function groupBy<T>(things: T[], key: (thing: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const thing of things) {
    const group = groups.get(key(thing));
    if (group) group.push(thing);
    else groups.set(key(thing), [thing]);
  }
  return groups;
}

/** How many items and earlier versions, and how many bytes of them, an export reads at once, and how many sources. */
const batchRows = 5000;
const batchBytes = 16 * 1024 * 1024;
const sourceBatch = 1000;

/** A space's pages, in their order, in groups whose items and earlier versions come to a few thousand and a few megabytes. */
async function pageBatches<P extends { id: string }>(s: Session, space: string, pages: P[]): Promise<P[][]> {
  const weights = new Map((await s.tx<{ pageId: string; n: number; bytes: number }[]>`
    select page_id, count(*)::int as n, coalesce(sum(bytes), 0)::float8 as bytes from (
      select c.page_id, octet_length(c.body) as bytes from content c where c.space_id = ${space}::uuid and ${visible(s, 'c')}
      union all
      select c.page_id, octet_length(r.body) from revisions r join content c on c.id = r.content_id where r.space_id = ${space}::uuid and ${visible(s, 'r')}
    ) w
    group by page_id
  `).map((row) => [row.pageId, row]));
  const batches: P[][] = [];
  let batch: P[] = [];
  let n = 0;
  let bytes = 0;
  for (const page of pages) {
    const weight = weights.get(page.id) ?? { n: 0, bytes: 0 };
    if (batch.length && (n + weight.n > batchRows || bytes + weight.bytes > batchBytes)) {
      batches.push(batch);
      batch = [];
      n = 0;
      bytes = 0;
    }
    batch.push(page);
    n += weight.n;
    bytes += weight.bytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/**
 * A space's knowledge and guidance as readable files, written as its pages and sources are read:
 * each page and source a file of its own, then its tasks, and at the end its index, log and
 * AGENTS.md, from what was noted on the way. It pauses now and then for other requests.
 */
function readableSpace(space: Manifest['spaces'][number], spacePages: Manifest['pages'], pageArchives: Manifest['pageArchives'], gathered: Manifest['gathered'], ctx: Context, sink: Sink) {
  const { layout, titles, nameOf } = ctx;
  const exporter = ctx.exporter;
  const privately = `private to ${exporter}`;
  const Privately = `Private to ${exporter}`;
  const archivesOf = groupBy(pageArchives, (archive) => archive.page);
  const gatheredIn = groupBy(gathered, (gathering) => gathering.collection);
  const childrenOf = groupBy(ctx.spaces.filter((other) => other.parent), (other) => other.parent!);
  const spaceName = new Map(ctx.spaces.map((other) => [other.id, other.name]));
  const log = new Log();
  // What the index and AGENTS.md need, noted as the pages and sources are written.
  const onlyYours = new Set<string>();
  const guidance = new Map<string, Data[]>();
  const kept: { id: string; label: string; createdAt: string; private: boolean }[] = [];
  let tasksHere: Manifest['tasks'] = [];
  let written = 0;
  const breathe = async () => {
    if (++written % 200 === 0) await setImmediate();
  };

  const title = (page: string) => titles.get(page) ?? 'Untitled';
  const link = (page: string) => `[${title(page).replace(/[[\]]/g, '')}](/${layout.knowledge.get(page)})`;
  const actor = (author: Author) =>
    author.by === 'agent' && author.agent ? `${slug(author.agent, 'assistant')}/homing` : author.by === 'routine' ? 'process:homing' : `human:${oneLine(nameOf(author.person) ?? 'unknown', 200)}`;
  // Links between pages point to their files; links to anything else stay as they are.
  const linked = (text: string) =>
    text.replace(new RegExp(`\\]\\(page:(${uuid})\\)`, 'gi'), (whole, id: string) => {
      const path = layout.knowledge.get(id.toLowerCase());
      return path ? `](/${path})` : whole;
    });

  const folder = layout.folders.get(space.id)!;
  const here = (path: string) => `knowledge/${join(folder, path)}`;
  const local = (path: string) => (folder ? path.slice(folder.length + 1) : path);
  const named = oneLine(space.name, 200);

  return {
    /** Some of its pages, with all their items and earlier versions, and the sources in the export those cite. */
    async pages(pages: Manifest['pages'], items: Data[], revisions: Manifest['revisions'], cited: Map<string, { space: string; label: string }>) {
      const current = currentItems(items);
      const byId = new Map(items.map((item) => [item.id, item]));
      const itemsOn = groupBy(items, (item) => item.page);
      const replacements = groupBy(items.filter((item) => item.supersedes), (item) => item.supersedes!);
      const revisionsOn = groupBy(revisions, (revision) => byId.get(revision.item)!.page);
      const sourcePath = (source: string) => `/${join(layout.folders.get(cited.get(source)!.space)!, `sources/${source}.md`)}`;
      // Your own original of something you shared as a copy shows as the copy, with your sources, as in Homing.
      const copied = new Set(items.filter((item) => item.visibility === 'shared' && item.publishedFrom).map((item) => item.publishedFrom!));
      const sourcesOf = (item: Data) => [...new Set([...item.sources, ...(item.publishedFrom ? (byId.get(item.publishedFrom)?.sources ?? []) : [])])].filter((id) => cited.has(id));
      /** An item, with the sources it cites as footnotes keyed by their ids, and what it rests on outside the export. */
      const withSources = (item: Data) => {
        const body = linked(item.body).trimEnd();
        const notes = sourcesOf(item).map((id) => `[^${id}]`).join('');
        // On its last line, unless that ends a code block or a table.
        const withNotes = !notes ? body : /^\s*(```|~~~|\|)/.test(body.split('\n').at(-1) ?? '') ? `${body}\n\n${notes}` : `${body}${notes}`;
        return item.sourcesElsewhere ? `${withNotes}\n\n_Also rests on ${count(item.sourcesElsewhere, 'source')} not in this export._` : withNotes;
      };
      /** Where an item stands among the others: a replacement where the first it replaced stood. */
      const firstOf = (item: Data): Data => (item.supersedes && byId.has(item.supersedes) ? firstOf(byId.get(item.supersedes)!) : item);

      for (const page of pages) {
        const whole = (itemsOn.get(page.id) ?? []).every((item) => item.visibility === 'private');
        if (whole) onlyYours.add(page.id);
        if (page.type === 'guidance' || layout.skills.has(page.id)) guidance.set(page.id, current.get(page.id) ?? []);
        // A skill's files, each at its place in its folder, never outside it, on any system.
        if (layout.skills.has(page.id)) {
          for (const file of current.get(page.id) ?? []) {
            if (file.kind === 'file' && file.path && safePath(file.path)) await sink.file(`guidance/${layout.skills.get(page.id)}/${file.path}`, file.body);
          }
        }
        const path = layout.knowledge.get(page.id);
        if (!path) continue;
        await breathe();
        const overview = page.type === 'overview';
        const texts = (itemsOn.get(page.id) ?? []).filter((item) => item.kind === 'text');
        const live = new Set((current.get(page.id) ?? []).filter((item) => item.kind === 'text'));
        const shown = [...live]
          .filter((item) => !copied.has(item.id))
          .sort((a, b) => firstOf(a).createdAt.localeCompare(firstOf(b).createdAt) || a.createdAt.localeCompare(b.createdAt));
        const earlier = texts.filter((item) => !live.has(item) && !copied.has(item.id));
        const footnotes = [...new Set([...shown, ...earlier].flatMap(sourcesOf))];
        const latest = [...(current.get(page.id) ?? [])].sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))[0];
        const name = title(page.id);
        const archiver = page.archived && nameOf(page.archived.by);

        const lines = [
          `# ${name}`,
          '',
          ...(whole ? [`_${Privately}: nobody else sees this page._`, ''] : []),
          ...(page.archived ? [`_Archived on ${day(page.archived.at)}${archiver ? ` by ${oneLine(archiver, 200)}` : ''}: no longer active._`, ''] : []),
        ];
        for (const item of shown) {
          lines.push(`<!-- homing:item ${item.id} -->`);
          if (item.visibility === 'private' && !whole) {
            const updatesShared = item.supersedes !== null && byId.get(item.supersedes)?.visibility === 'shared';
            lines.push(`_${Privately}.${updatesShared ? ' Everyone else still sees the earlier version.' : ''}_`, '');
          }
          lines.push(withSources(item), '');
        }
        const gathers = (gatheredIn.get(page.id) ?? []).filter((gathering) => layout.knowledge.has(gathering.page));
        if (gathers.length) {
          lines.push('## In this collection', '');
          for (const gathering of gathers) lines.push(`- ${link(gathering.page)}${gathering.visibility === 'private' && !whole ? ` (${privately})` : ''}`);
          lines.push('');
        }
        if (earlier.length) {
          lines.push('## Earlier', '');
          for (const item of earlier) {
            const by = replacements.get(item.id) ?? [];
            const at = day(by.map((replacement) => replacement.createdAt).sort()[0] ?? item.writtenAt);
            const forYou = item.visibility === 'shared' && by.every((replacement) => replacement.visibility === 'private');
            lines.push(`<!-- homing:item ${item.id} -->`);
            lines.push(forYou ? `_Replaced on ${at}, for ${exporter} only. Everyone else still sees it._` : `_Replaced on ${at}${item.visibility === 'private' && !whole ? `, ${privately}` : ''}._`, '');
            lines.push(withSources(item), '');
          }
        }
        for (const id of footnotes) lines.push(`[^${id}]: ${oneLine(cited.get(id)!.label, 120)}`);
        await sink.file(`knowledge/${path}`, concept(
          {
            type: overview ? 'Overview' : oneLine(page.type ?? 'Page', 200) || 'Page',
            title: name,
            homing: { id: page.id, ...(whole && { private: true }) },
            ...(page.archived && { status: 'deprecated' }),
            ...(latest && { generated: { by: actor(latest.author), at: latest.writtenAt } }),
            ...(footnotes.length && { sources: footnotes.map((id) => ({ id, resource: sourcePath(id), title: oneLine(cited.get(id)!.label, 120) })) }),
          },
          lines,
        ));

        // What happened to it, for the log.
        if (!overview) log.add({ at: page.createdAt, word: 'Creation', verb: 'Started', page: page.id, private: whole });
        for (const item of texts) {
          log.add({ at: item.createdAt, word: 'Update', verb: item.supersedes ? 'Updated' : 'Added', counted: 'item', page: page.id, private: item.visibility === 'private' });
        }
        for (const revision of revisionsOn.get(page.id) ?? []) {
          if (byId.get(revision.item)!.kind !== 'text') continue;
          log.add({ at: revision.replacedAt, word: 'Correction', verb: 'Corrected', counted: 'item', page: page.id, private: revision.visibility === 'private' });
        }
        for (const archive of archivesOf.get(page.id) ?? []) {
          log.add({ at: archive.at, word: archive.archived ? 'Archive' : 'Reopening', verb: archive.archived ? 'Archived' : 'Reopened', page: page.id, private: false });
        }
      }
    },

    /** Its tasks, as one file. */
    async tasks(tasks: Manifest['tasks']) {
      tasksHere = tasks;
      if (!tasks.length) return;
      const line = (task: Manifest['tasks'][number]) => {
        const doneBy = task.done && nameOf(task.done.by);
        const facts = [
          task.due && `due ${task.due}`,
          task.assignee && `for ${oneLine(nameOf(task.assignee) ?? 'someone', 200)}`,
          task.done && `done on ${day(task.done.at)}${doneBy ? ` by ${oneLine(doneBy, 200)}` : ''}`,
          task.visibility === 'private' && privately,
        ].filter(Boolean);
        return [
          `- [${task.done ? 'x' : ' '}] ${oneLine(task.title, 200)}${facts.length ? ` (${facts.join(', ')})` : ''} <!-- homing:task ${task.id} -->`,
          ...(task.description ? ['', ...task.description.split('\n').map((text) => (text ? `  ${text}` : '')), ''] : []),
        ];
      };
      const open = tasks.filter((task) => !task.done);
      const done = tasks.filter((task) => task.done);
      const latest = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      await sink.file(here('tasks.md'), concept(
        { type: 'Tasks', title: `Tasks in ${named}`, homing: { space: space.id }, generated: { by: actor(latest.author), at: latest.updatedAt } },
        [`# Tasks in ${named}`, '', ...(open.length ? ['## Open', '', ...open.flatMap(line), ''] : []), ...(done.length ? ['## Done', '', ...done.flatMap(line), ''] : [])],
      ));
      for (const task of tasks) {
        log.add({ at: task.createdAt, word: 'Task', verb: 'Added', counted: 'task', private: task.visibility === 'private' });
        if (task.done) log.add({ at: task.done.at, word: 'Task', verb: 'Finished', counted: 'task', private: task.visibility === 'private' });
      }
    },

    /** One of its sources, with the pages anywhere in the export that use it. */
    async source(source: Manifest['sources'][number], usedOn: string[]) {
      await breathe();
      const label = oneLine(labelOf(source), 120);
      const uses = [...new Set(usedOn)].filter((page) => layout.knowledge.has(page)).sort((a, b) => (ctx.pageOrder.get(a) ?? 0) - (ctx.pageOrder.get(b) ?? 0));
      await sink.file(here(`sources/${source.id}.md`), concept(
        {
          type: 'Source',
          title: label,
          ...(source.reference && /^https?:\/\/\S+$/.test(source.reference) && { resource: source.reference }),
          homing: { id: source.id, ...(source.visibility === 'private' && { private: true }) },
          generated: { by: actor(source.author), at: source.createdAt },
        },
        [
          `# ${label}`,
          '',
          ...source.excerpt.split('\n').map((text) => (text ? `> ${text}` : '>')),
          '',
          ...(source.visibility === 'private' ? [`_${Privately}._`, ''] : []),
          ...(uses.length ? [`Used on ${uses.map(link).join(', ')}.`] : []),
        ],
      ));
      kept.push({ id: source.id, label, createdAt: source.createdAt, private: source.visibility === 'private' });
      log.add({ at: source.createdAt, word: 'Source', verb: 'Kept', counted: 'source', private: source.visibility === 'private' });
    },

    /** What's in the space, what changed in it, and its rules, once everything else is written. */
    async end(included: Manifest['includes']) {
      if (kept.length) {
        await sink.file(here('sources/index.md'), index([[
          `Sources in ${named}`,
          kept.map((source) => entry(source.label, `${source.id}.md`, [`kept on ${day(source.createdAt)}`, source.private && privately].filter(Boolean).join(', '))),
        ]]));
      }

      // What's in the space, its pages, and the spaces in it.
      const overview = spacePages.find((page) => page.type === 'overview' && layout.knowledge.has(page.id));
      const pages = spacePages.filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).sort((a, b) => title(a.id).localeCompare(title(b.id)));
      const children = childrenOf.get(space.id) ?? [];
      await sink.file(here('index.md'), index(
        [
          [named, [
            ...(overview ? [entry('Overview', 'overview.md', `where ${named} stands`)] : []),
            ...(tasksHere.length ? [entry('Tasks', 'tasks.md', `${tasksHere.filter((task) => !task.done).length} open, ${tasksHere.filter((task) => task.done).length} done`)] : []),
            ...(kept.length ? [entry('Sources', 'sources/', count(kept.length, 'source'))] : []),
          ]],
          [`Pages in ${named}`, pages.map((page) => entry(
            title(page.id),
            local(layout.knowledge.get(page.id)!),
            [oneLine(page.type ?? 'page', 200), page.archived && 'archived', onlyYours.has(page.id) && privately].filter(Boolean).join(', '),
          ))],
          [`Spaces in ${named}`, children.map((child) => entry(
            oneLine(child.name, 200),
            `${local(layout.folders.get(child.id)!)}/`,
            [count(ctx.knowledgePages.get(child.id) ?? 0, 'page'), child.archived && 'archived', child.private && privately].filter(Boolean).join(', '),
          ))],
        ],
        space.parent === null,
      ));
      if (!log.empty) await sink.file(here('log.md'), log.text(`What changed in ${named}`, link, privately));

      // Guidance goes alongside the knowledge, never in it: AGENTS.md and SKILL.md aren't OKF concepts.
      const guidancePage = spacePages.find((page) => page.type === 'guidance');
      const rules = (guidancePage ? (guidance.get(guidancePage.id) ?? []) : []).filter((item) => item.kind === 'requirement' || item.kind === 'preference');
      const skills = spacePages.filter((page) => layout.skills.has(page.id));
      if (!rules.length && !skills.length && !included.length) return;
      const rule = (item: Data) => {
        const marks = [item.onlyHere && 'Only here.', item.visibility === 'private' && `${Privately}.`].filter(Boolean).join(' ');
        const text = item.body.trim().split('\n').map((line, at) => (at === 0 || !line ? line : `  ${line}`)).join('\n');
        return `- ${text}${marks ? ` (${marks})` : ''}`;
      };
      const ordered = (kind: string) =>
        rules.filter((item) => item.kind === kind).sort((a, b) => Number(a.visibility === 'private') - Number(b.visibility === 'private') || a.createdAt.localeCompare(b.createdAt));
      const skill = (page: Manifest['pages'][number]) => {
        const parts = guidance.get(page.id) ?? [];
        const name = parts.find((item) => item.kind === 'title')!;
        const description = frontmatter(parts.find((item) => item.path === 'SKILL.md')?.body ?? '').description;
        return `- [${oneLine(name.body, 200).replace(/[[\]]/g, '')}](${local(layout.skills.get(page.id)!)}/SKILL.md)${description ? `: ${oneLine(description, 300)}` : ''}${name.visibility === 'private' ? ` (${Privately}.)` : ''}`;
      };
      // What it includes, linked from here where it's in the export.
      const from = (path: string) => posix.relative(posix.dirname(`guidance/${join(folder, 'AGENTS.md')}`), path);
      const rulesOf = (id: string) => {
        const name = oneLine(spaceName.get(id)!, 200);
        const file = ctx.guidanceFile.get(id);
        return file ? `[${name.replace(/[[\]]/g, '')}](${from(file)})` : name;
      };
      const include = (x: Manifest['includes'][number]) => {
        const marks = [x.visibility === 'private' && `${Privately}.`, x.waiting && 'Waiting while it’s included for everyone.'].filter(Boolean).join(' ');
        const skillPage = x.skill && ctx.pageSpace.has(x.skill) ? { id: x.skill, space: ctx.pageSpace.get(x.skill)! } : undefined;
        const what = x.rules
          ? `The rules of ${rulesOf(x.rules)}`
          : skillPage && layout.skills.has(skillPage.id)
            ? `The skill [${oneLine(titles.get(skillPage.id) ?? 'skill', 200).replace(/[[\]]/g, '')}](${from(`guidance/${layout.skills.get(skillPage.id)}/SKILL.md`)}), from ${oneLine(spaceName.get(skillPage.space)!, 200)}`
            : x.elsewhere?.skill
              ? `The skill ${oneLine(x.elsewhere.skill, 200)} from ${oneLine(x.elsewhere.space, 200)}, which isn’t in this export`
              : `The rules of ${oneLine(x.elsewhere?.space ?? 'a space', 200)}, which isn’t in this export`;
        return `- ${what}.${marks ? ` (${marks})` : ''}`;
      };
      const requirements = ordered('requirement');
      const preferences = ordered('preference');
      await sink.file(`guidance/${join(folder, 'AGENTS.md')}`, [
        `# Rules for ${named}`,
        '',
        `Kept in Homing. Requirements always apply. A rule applies in ${named} and the spaces in it, unless it's marked only here.` +
          (space.parent === null ? '' : ' The rules one folder up apply here too, except those marked only here.'),
        '',
        ...(requirements.length ? ['## Requirements', '', ...requirements.map(rule), ''] : []),
        ...(preferences.length ? ['## Preferences', '', ...preferences.map(rule), ''] : []),
        ...(skills.length ? ['## Skills', '', ...skills.map(skill), ''] : []),
        ...(included.length ? ['## Also included', '', `Guidance kept elsewhere that applies in ${named} too, as if it were set here:`, '', ...included.map(include), ''] : []),
      ].join('\n'));
    },
  };
}

/** Whether a skill's file stays in its folder on any system: plain names, without a drive, a backslash, control characters, or . and ... */
export function safePath(path: string): boolean {
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !/[\\:\p{Cc}]/u.test(part));
}

/** Something that happened, for a log. */
interface Event {
  at: string;
  /** The log's leading word, such as Update. */
  word: string;
  /** What was done, such as Added. */
  verb: string;
  /** The page it was done to, if any. */
  page?: string;
  /** Counted with others like it on the same day, when it's one of many. */
  counted?: 'item' | 'task' | 'source';
  private: boolean;
}

/**
 * What happened in a space, for its log, counted by day as it's told, so a big space keeps no list
 * of it all: on each day, each kind of thing once, with how many times, the latest first.
 */
class Log {
  private told = 0;
  private readonly days = new Map<string, Map<string, { event: Event; at: string; told: number; n: number }>>();

  add(event: Event): void {
    const date = day(event.at);
    const entries = this.days.get(date) ?? new Map<string, { event: Event; at: string; told: number; n: number }>();
    this.days.set(date, entries);
    const key = JSON.stringify([event.word, event.verb, event.page, event.counted, event.private]);
    const known = entries.get(key);
    if (!known) entries.set(key, { event, at: event.at, told: this.told, n: 1 });
    else {
      known.n++;
      // Placed by its latest time, and among things at the same time, by which was told first.
      if (event.at > known.at) {
        known.at = event.at;
        known.told = this.told;
      }
    }
    this.told++;
  }

  get empty(): boolean {
    return this.days.size === 0;
  }

  /** An OKF log, newest day first, with what happened each day. */
  text(heading: string, link: (page: string) => string, privately: string): string {
    const lines = [`# ${heading}`, ''];
    for (const date of [...this.days.keys()].sort().reverse()) {
      lines.push(`## ${date}`, '');
      const entries = [...this.days.get(date)!.values()].sort((a, b) => (a.at === b.at ? a.told - b.told : a.at < b.at ? 1 : -1));
      for (const { event, n } of entries) {
        const what = event.counted
          ? `${count(n, event.counted)}${event.page ? ` ${event.verb === 'Added' ? 'to' : 'on'} ${link(event.page)}` : ''}`
          : link(event.page!);
        lines.push(`* **${event.word}**: ${event.verb} ${what}${event.private ? `, ${privately}` : ''}.`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}

/** An OKF index: sections of entries, without frontmatter, except okf_version at the top of the bundle. */
function index(sections: [string, string[]][], top = false): string {
  const lines = top ? ['---', 'okf_version: "0.2"', '---', ''] : [];
  for (const [heading, entries] of sections) {
    if (entries.length) lines.push(`# ${heading}`, '', ...entries, '');
  }
  return lines.join('\n');
}

function entry(title: string, href: string, description: string): string {
  return `* [${oneLine(title, 200).replace(/[[\]]/g, '')}](${encodeURI(href)})${description ? ` - ${oneLine(description, 300)}` : ''}`;
}

/** An OKF concept: YAML frontmatter with its type, then Markdown. */
function concept(front: Record<string, unknown>, lines: string[]): string {
  return `---\n${stringify(front, { lineWidth: 0 })}---\n\n${lines.join('\n').trimEnd()}\n`;
}


/** What a source is called: its reference, or how its excerpt starts. */
function labelOf(source: { reference: string | null; excerpt: string }): string {
  return source.reference?.trim() || source.excerpt.trim() || 'Source';
}

function oneLine(text: string, length: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line;
}

function day(at: string): string {
  return at.slice(0, 10);
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
