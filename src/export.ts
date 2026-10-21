// Exporting a space (spec §3, guarantee 10): everything the person can see in it, and in the
// spaces below it they can open, as one zip. homing.json holds all of it, for importing it again.
// knowledge/ is the same knowledge as readable Markdown in the Open Knowledge Format, and guidance/
// holds the rules and skills as AGENTS.md files and SKILL.md folders. Everything is read in the
// person's own session, so row-level security keeps anyone else's private side out underneath.

import { posix } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { stringify } from 'yaml';
import { personOf, type Session } from './db.ts';
import { includeSeen } from './guidance.ts';
import { current, importedAuthor, itemColumns, visible, type Imported, type ImportedAuthor, type ImportedPerson, type Item } from './knowledge.ts';
import { frontmatter } from './skills.ts';
import { accessibleSpaces, listSpaces, peopleNames, type Space } from './spaces.ts';
import type { Task } from './tasks.ts';
import { zip } from './zip.ts';

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
  version: 1;
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
 * A space as the person sees it, with the spaces below it they can open, as a zip, or undefined
 * when they can't open it. Read in one snapshot, so it holds together.
 */
export async function exportSpace(s: Session, spaceId: string, instance: URL, now = new Date()): Promise<{ filename: string; zip: Buffer } | undefined> {
  const found = await collect(s, spaceId, instance, now);
  if (!found) return undefined;
  const { manifest, layout } = found;
  const files = Object.entries({ 'homing.json': await jsonOf(manifest), ...(await readable(manifest, layout)) });
  return { filename: `${slug(manifest.spaces[0].name, 'space')}-${manifest.exportedAt.slice(0, 10)}.zip`, zip: await zip(files, now) };
}

/** Everything the person can see in the space and the spaces below it they can open. */
export async function manifestOf(s: Session, spaceId: string, instance: URL, now = new Date()): Promise<Manifest | undefined> {
  return (await collect(s, spaceId, instance, now))?.manifest;
}

async function collect(s: Session, spaceId: string, instance: URL, now: Date): Promise<{ manifest: Manifest; layout: Layout } | undefined> {
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

  const spaceRows = await s.tx<{ id: string; archivedBy: string | null; createdAt: Date; createdBy: string | null; agent: string | null; imported: SpaceImported | null }[]>`
    select id, archived_by, created_at, created_by, agent, imported from spaces where id in ${s.tx(ids)}
  `;
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
  const pages = await s.tx<{ id: string; spaceId: string; type: string | null; createdAt: Date; seen: Date; archivedAt: Date | null; archivedBy: string | null; archivedSince: boolean | null; imported: (Imported & { archivedBy?: ImportedPerson }) | null }[]>`
    select p.id, p.space_id, p.type, a.at as archived_at, a.archived_by, a.since as archived_since, p.imported, first.created_at, f.seen
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
  const found = await s.tx<Item[]>`
    select ${itemColumns(s, 'c')} from content c
    where c.space_id in ${s.tx(ids)} and ${visible(s, 'c')}
    order by c.created_at, c.id
  `;
  // The sources an item rests on that the person sees: in the export, or kept somewhere else.
  const citations = await s.tx<{ contentId: string; sourceId: string; here: boolean }[]>`
    select ci.content_id, ci.source_id, src.space_id in ${s.tx(ids)} as here from citations ci
    join content c on c.id = ci.content_id
    join sources src on src.id = ci.source_id
    where c.space_id in ${s.tx(ids)} and ${visible(s, 'c')} and ${visible(s, 'src')}
    order by src.created_at, src.id
  `;
  const revisions = await s.tx<{ contentId: string; privateTo: string | null; body: string; writtenBy: string | null; agent: string | null; writtenAt: Date; replacedAt: Date; imported: Imported | null }[]>`
    select r.content_id, r.private_to, r.body, r.written_by, r.agent, r.written_at, r.replaced_at, r.imported from revisions r
    where r.space_id in ${s.tx(ids)} and ${visible(s, 'r')}
    order by r.replaced_at
  `;
  const sources = await s.tx<{ id: string; spaceId: string; privateTo: string | null; reference: string | null; excerpt: string; writtenBy: string | null; agent: string | null; createdAt: Date; imported: Imported | null }[]>`
    select src.id, src.space_id, src.private_to, src.reference, src.excerpt, src.written_by, src.agent, src.created_at, src.imported from sources src
    where src.space_id in ${s.tx(ids)} and ${visible(s, 'src')}
    order by src.created_at, src.id
  `;
  const archives = await s.tx<{ pageId: string; archived: boolean; personId: string | null; agent: string | null; at: Date; imported: Imported | null }[]>`
    select a.page_id, a.archived, a.person_id, a.agent, a.at, a.imported from page_archives a
    join pages p on p.id = a.page_id
    where p.space_id in ${s.tx(ids)}
    order by a.at
  `;
  const gathered = await s.tx<{ collectionId: string; pageId: string; privateTo: string | null; addedBy: string | null; agent: string | null; createdAt: Date; imported: Imported | null }[]>`
    select g.collection_id, g.page_id, g.private_to, g.added_by, g.agent, g.created_at, g.imported from gathered g
    where g.space_id in ${s.tx(ids)} and ${visible(s, 'g')}
    order by g.created_at
  `;
  const tasks = await s.tx<Task[]>`
    select t.id, t.space_id, t.private_to, t.title, t.description, to_char(t.due, 'YYYY-MM-DD') as due, t.assignee, t.done_at, t.done_by,
           t.written_by, t.agent, t.created_at, t.updated_at, t.imported
    from tasks t
    where t.space_id in ${s.tx(ids)} and ${visible(s, 't')}
    order by t.created_at, t.id
  `;

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

  // Who imported what came in an import, when, and from where, where the person can see it.
  const importIds = [...new Set([...spaceRows, ...pages, ...found, ...revisions, ...sources, ...archives, ...gathered, ...tasks, ...includes].map((row) => row.imported?.import).filter((id) => id !== undefined))];
  const imports = new Map((importIds.length === 0 ? [] : await s.tx<{ id: string; importedBy: string | null; importedAt: Date; instance: string }[]>`
    select id, imported_by, imported_at, instance from imports where id in ${s.tx(importIds)}
  `).map((row) => [row.id, row]));

  // Everyone named gets a key of their own, and a name only if the person shares a space with them, the way Homing shows them.
  // Someone named in an import is told apart by the import and their key in it, never matched with anyone here.
  const importedNames = new Map<string, string | null>();
  const elsewhere = (imported: Imported | null | undefined, person: ImportedPerson | null | undefined): string | null => {
    if (!imported || !person?.person) return null;
    const token = `import ${imported.import} ${person.person}`;
    importedNames.set(token, person.name);
    return token;
  };
  const named = [
    me,
    ...[...imports.values()].map((row) => row.importedBy),
    ...spaceRows.flatMap((row) => [row.createdBy, row.archivedBy]),
    ...spaceArchives.map((archive) => archive.personId),
    ...pages.map((page) => page.archivedBy),
    ...found.flatMap((item) => [item.writtenBy, item.publishedBy]),
    ...revisions.map((revision) => revision.writtenBy),
    ...sources.map((source) => source.writtenBy),
    ...archives.map((archive) => archive.personId),
    ...gathered.map((gathering) => gathering.addedBy),
    ...tasks.flatMap((task) => [task.writtenBy, task.assignee, task.doneBy]),
    ...includes.map((include) => include.addedBy),
  ].filter((id) => id !== null);
  const names = await peopleNames(s, named);
  // Those named in imports, among the rest in the order they come.
  for (const row of [...spaceRows, ...spaceArchives, ...pages, ...found, ...revisions, ...sources, ...archives, ...gathered, ...tasks, ...includes] as { imported?: (Imported & SpaceImported & { archivedBy?: ImportedPerson; assignee?: ImportedPerson; doneBy?: ImportedPerson }) | null }[]) {
    const imported = row.imported;
    for (const person of [imported?.author, imported?.publishedBy, imported?.archivedBy, imported?.assignee, imported?.doneBy, imported?.creator]) {
      const token = elsewhere(imported, person);
      if (token) named.push(token);
    }
  }
  for (const [token, name] of importedNames) names.set(token, name ?? '');
  const keys = new Map<string, string>();
  for (const id of named) if (!keys.has(id)) keys.set(id, `person-${keys.size + 1}`);
  const key = (id: string | null) => (id ? keys.get(id)! : null);
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

  // A removal of something the person can't see would remove nothing.
  const seen = new Set(found.map((item) => item.id));
  const items = found.filter((item) => item.kind !== 'removed' || (item.supersedes && seen.has(item.supersedes)));
  const itemIds = new Set(items.map((item) => item.id));
  const pageIds = new Set(pages.map((page) => page.id));
  const exported = new Set(ids);
  const firstSeen = new Map(pages.map((page) => [page.id, page.seen]));
  // References in text to anything left out lose their id, so nothing outside the bundle shows through.
  // Rules and skills' files stay word for word, as guidance comes out as it went in.
  const known = new Set([...ids, ...pageIds, ...itemIds, ...sources.map((source) => source.id), ...tasks.map((task) => task.id)]);
  const clean = (text: string) => scrub(text, known);
  const verbatim = (kind: Item['kind']) => kind === 'file' || kind === 'requirement' || kind === 'preference';
  const kindOf = new Map(items.map((item) => [item.id, item.kind]));
  const cited = groupBy(citations, (citation) => citation.contentId);
  const spaceOf = new Map(spaceRows.map((row) => [row.id, row]));

  const manifest: Manifest = {
    format: 'homing-export',
    version: 1,
    instance: instance.origin,
    exportedAt: time(now),
    exportedBy: { person: key(me)!, name: names.get(me) ?? '' },
    space: root.id,
    people: [...keys].map(([id, person]) => ({ key: person, name: names.get(id) || null })),
    spaces: tree.map((space) => {
      const row = spaceOf.get(space.id)!;
      return {
        id: space.id,
        name: space.name,
        parent: space === root ? null : space.parentId,
        closed: space.closed,
        private: space.privateTo !== null,
        creator: row.imported?.creator ? author(null, null, { import: row.imported.import, author: row.imported.creator }) : row.createdBy || row.agent ? author(row.createdBy, row.agent) : null,
        archived: space.archivedAt ? { at: time(space.archivedAt), by: key(row.archivedBy) ?? key(elsewhere(row.imported, row.imported?.archivedBy)) } : null,
        createdAt: time(row.createdAt),
        folder: '',
        ...from(row.imported),
      };
    }),
    spaceArchives: spaceArchives.map((archive) => ({ space: archive.spaceId, archived: archive.archived, author: author(archive.personId, archive.agent), at: time(archive.at) })),
    pages: await inSteps(pages, (page) => ({
      id: page.id,
      space: page.spaceId,
      type: page.type,
      createdAt: time(page.createdAt),
      // Archived before the person could see it, by anyone: archived since then, by nobody they know of.
      archived: !page.archivedAt ? null : page.archivedSince || page.archivedAt < page.seen ? { at: time(page.seen), by: null } : { at: time(page.archivedAt), by: key(page.archivedBy) ?? key(elsewhere(page.imported, page.imported?.archivedBy)) },
      file: null,
      ...from(page.imported),
    })),
    items: await inSteps(items, (item) => ({
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
    })),
    revisions: await inSteps(revisions.filter((revision) => itemIds.has(revision.contentId)), (revision) => ({
        item: revision.contentId,
        visibility: side(revision.privateTo),
        body: verbatim(kindOf.get(revision.contentId)!) ? revision.body : clean(revision.body),
        author: author(revision.writtenBy, revision.agent, revision.imported),
        writtenAt: time(revision.writtenAt),
        replacedAt: time(revision.replacedAt),
        ...from(revision.imported),
      })),
    sources: await inSteps(sources, (source) => ({
      id: source.id,
      space: source.spaceId,
      visibility: side(source.privateTo),
      reference: source.reference && clean(source.reference),
      excerpt: clean(source.excerpt),
      author: author(source.writtenBy, source.agent, source.imported),
      createdAt: time(source.createdAt),
      ...from(source.imported),
    })),
    links: [],
    gathered: await inSteps(gathered.filter((gathering) => pageIds.has(gathering.collectionId) && pageIds.has(gathering.pageId)), (gathering) => ({
        collection: gathering.collectionId,
        page: gathering.pageId,
        visibility: side(gathering.privateTo),
        author: author(gathering.addedBy, gathering.agent, gathering.imported),
        createdAt: time(gathering.createdAt),
      })),
    // Only since the person could see the page, so nothing from before shows through.
    pageArchives: archives
      .filter((archive) => pageIds.has(archive.pageId) && archive.at >= firstSeen.get(archive.pageId)!)
      .map((archive) => ({ page: archive.pageId, archived: archive.archived, author: author(archive.personId, archive.agent, archive.imported), at: time(archive.at) })),
    tasks: await inSteps(tasks, (task) => ({
      id: task.id,
      space: task.spaceId,
      visibility: side(task.privateTo),
      title: clean(task.title),
      description: task.description && clean(task.description),
      due: task.due,
      assignee: key(task.assignee) ?? key(elsewhere(task.imported, task.imported?.assignee)),
      done: task.doneAt ? { at: time(task.doneAt), by: key(task.doneBy) ?? key(elsewhere(task.imported, task.imported?.doneBy)) } : null,
      author: author(task.writtenBy, task.agent, task.imported),
      createdAt: time(task.createdAt),
      updatedAt: time(task.updatedAt),
      ...from(task.imported),
    })),
    includes: includes.map((include) => {
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
    }),
  };

  for (const item of manifest.items) {
    if (item.kind !== 'text') continue;
    const targets = new Set([...item.body.matchAll(pageRefs)].map((match) => match[1].toLowerCase()).filter((id) => pageIds.has(id) && id !== item.page));
    for (const to of targets) manifest.links.push({ item: item.id, from: item.page, to });
  }
  const layout = layoutOf(manifest);
  for (const space of manifest.spaces) space.folder = layout.folders.get(space.id)!;
  for (const page of manifest.pages) page.file = layout.files.get(page.id) ?? null;
  return { manifest, layout };
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
function layoutOf(m: Manifest): Layout {
  const folders = new Map<string, string>();
  const files = new Map<string, string>();
  const knowledge = new Map<string, string>();
  const skills = new Map<string, string>();
  const current = currentItems(m);
  const titles = titlesOf(current);
  const has = (page: string, kinds: Data['kind'][]) => (current.get(page) ?? []).some((item) => kinds.includes(item.kind));
  for (const space of m.spaces) {
    const parent = space.parent === null ? undefined : folders.get(space.parent);
    if (parent === undefined) {
      folders.set(space.id, '');
      continue;
    }
    const siblings = new Set(m.spaces.filter((other) => other.parent === space.parent && folders.has(other.id)).map((other) => folders.get(other.id)!.split('/').at(-1)!));
    folders.set(space.id, join(parent, unique(slug(space.name, 'space'), space.id, siblings, ['sources', 'skills', 'private-skills'])));
  }
  const taken = new Map<string, Set<string>>();
  for (const page of m.pages) {
    const folder = folders.get(page.space)!;
    if (page.type === 'guidance') {
      if (has(page.id, ['requirement', 'preference'])) files.set(page.id, `guidance/${join(folder, 'AGENTS.md')}`);
    } else if (page.type === 'overview') {
      if (has(page.id, ['text'])) knowledge.set(page.id, join(folder, 'overview.md'));
    } else if (page.type === 'skill') {
      const title = current.get(page.id)?.find((item) => item.kind === 'title');
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
function currentItems(m: Manifest): Map<string, Data[]> {
  const replaced = new Set(m.items.map((item) => item.supersedes).filter((id) => id !== null));
  const byPage = new Map<string, Data[]>();
  for (const item of m.items) {
    if (replaced.has(item.id) || item.kind === 'removed') continue;
    const items = byPage.get(item.page);
    if (items) items.push(item);
    else byPage.set(item.page, [item]);
  }
  return byPage;
}

/** Each page's title as the exporter sees it: their own if they named it, otherwise the shared one. */
function titlesOf(current: Map<string, Data[]>): Map<string, string> {
  const titles = new Map<string, string>();
  for (const [page, items] of current) {
    const title = items.filter((item) => item.kind === 'title').sort((a, b) => Number(a.visibility === 'shared') - Number(b.visibility === 'shared'))[0];
    if (title) titles.set(page, oneLine(title.body, 200));
  }
  return titles;
}

/** Each of many things made into another, a few thousand at a time, pausing between them for other requests. */
async function inSteps<T, U>(things: T[], fn: (thing: T) => U): Promise<U[]> {
  const made: U[] = [];
  for (let at = 0; at < things.length; at++) {
    if (at % 2000 === 1999) await setImmediate();
    made.push(fn(things[at]));
  }
  return made;
}

/** The manifest as compact JSON, written a list at a time, pausing within long lists for other requests. */
async function jsonOf(manifest: Manifest): Promise<string> {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(manifest)) {
    parts.push(`${JSON.stringify(key)}:${Array.isArray(value) ? `[${(await inSteps(value, (entry) => JSON.stringify(entry))).join(',')}]` : JSON.stringify(value)}`);
  }
  return `{${parts.join(',')}}\n`;
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

/** The knowledge and guidance as files, by their place in the zip. It pauses now and then for other requests. */
async function readable(m: Manifest, layout: Layout): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const current = currentItems(m);
  const titles = titlesOf(current);
  const people = new Map(m.people.map((person) => [person.key, person.name]));
  const nameOf = (key: string | null) => (key ? (people.get(key) ?? null) : null);
  const exporter = oneLine(m.exportedBy.name || 'whoever exported it', 200);
  const privately = `private to ${exporter}`;
  const Privately = `Private to ${exporter}`;
  const byId = new Map(m.items.map((item) => [item.id, item]));
  const sources = new Map(m.sources.map((source) => [source.id, source]));
  const itemsOn = groupBy(m.items, (item) => item.page);
  const replacements = groupBy(m.items.filter((item) => item.supersedes), (item) => item.supersedes!);
  const revisionsOn = groupBy(m.revisions, (revision) => byId.get(revision.item)!.page);
  const archivesOf = groupBy(m.pageArchives, (archive) => archive.page);
  const gatheredIn = groupBy(m.gathered, (gathering) => gathering.collection);
  const pagesIn = groupBy(m.pages, (page) => page.space);
  const tasksIn = groupBy(m.tasks, (task) => task.space);
  const sourcesIn = groupBy(m.sources, (source) => source.space);
  const childrenOf = groupBy(m.spaces.filter((space) => space.parent), (space) => space.parent!);
  const includesIn = groupBy(m.includes, (include) => include.space);
  const spaceName = new Map(m.spaces.map((space) => [space.id, space.name]));
  const usedOn = new Map<string, Set<string>>();
  let written = 0;
  const breathe = async () => {
    if (++written % 200 === 0) await setImmediate();
  };

  for (const page of m.pages) {
    if (page.type === 'overview') titles.set(page.id, `Overview of ${oneLine(spaceName.get(page.space)!, 200)}`);
  }
  const title = (page: string) => titles.get(page) ?? 'Untitled';
  const link = (page: string) => `[${title(page).replace(/[[\]]/g, '')}](/${layout.knowledge.get(page)})`;
  const onlyYou = (page: string) => (itemsOn.get(page) ?? []).every((item) => item.visibility === 'private');
  const sourcePath = (source: string) => `/${join(layout.folders.get(sources.get(source)!.space)!, `sources/${source}.md`)}`;
  const actor = (author: Author) =>
    author.by === 'agent' && author.agent ? `${slug(author.agent, 'assistant')}/homing` : author.by === 'routine' ? 'process:homing' : `human:${oneLine(nameOf(author.person) ?? 'unknown', 200)}`;
  // Links between pages point to their files; links to anything else stay as they are.
  const linked = (text: string) =>
    text.replace(new RegExp(`\\]\\(page:(${uuid})\\)`, 'gi'), (whole, id: string) => {
      const path = layout.knowledge.get(id.toLowerCase());
      return path ? `](/${path})` : whole;
    });
  // Your own original of something you shared as a copy shows as the copy, with your sources, as in Homing.
  const copied = new Set(m.items.filter((item) => item.visibility === 'shared' && item.publishedFrom).map((item) => item.publishedFrom!));
  const sourcesOf = (item: Data) => [...new Set([...item.sources, ...(item.publishedFrom ? (byId.get(item.publishedFrom)?.sources ?? []) : [])])].filter((id) => sources.has(id));
  /** An item, with the sources it cites as footnotes keyed by their ids, and what it rests on outside the export. */
  const withSources = (item: Data) => {
    const body = linked(item.body).trimEnd();
    const notes = sourcesOf(item).map((id) => `[^${id}]`).join('');
    // On its last line, unless that ends a code block or a table.
    const cited = !notes ? body : /^\s*(```|~~~|\|)/.test(body.split('\n').at(-1) ?? '') ? `${body}\n\n${notes}` : `${body}${notes}`;
    return item.sourcesElsewhere ? `${cited}\n\n_Also rests on ${count(item.sourcesElsewhere, 'source')} not in this export._` : cited;
  };
  /** Where an item stands among the others: a replacement where the first it replaced stood. */
  const firstOf = (item: Data): Data => (item.supersedes && byId.has(item.supersedes) ? firstOf(byId.get(item.supersedes)!) : item);

  for (const space of m.spaces) {
    const folder = layout.folders.get(space.id)!;
    const here = (path: string) => `knowledge/${join(folder, path)}`;
    const local = (path: string) => (folder ? path.slice(folder.length + 1) : path);
    const named = oneLine(space.name, 200);
    const spacePages = pagesIn.get(space.id) ?? [];
    const log: Event[] = [];

    for (const page of spacePages) {
      const path = layout.knowledge.get(page.id);
      if (!path) continue;
      await breathe();
      const overview = page.type === 'overview';
      const whole = onlyYou(page.id);
      const items = (itemsOn.get(page.id) ?? []).filter((item) => item.kind === 'text');
      const live = new Set((current.get(page.id) ?? []).filter((item) => item.kind === 'text'));
      const shown = [...live]
        .filter((item) => !copied.has(item.id))
        .sort((a, b) => firstOf(a).createdAt.localeCompare(firstOf(b).createdAt) || a.createdAt.localeCompare(b.createdAt));
      const earlier = items.filter((item) => !live.has(item) && !copied.has(item.id));
      const cited = [...new Set([...shown, ...earlier].flatMap(sourcesOf))];
      for (const id of cited) usedOn.set(id, (usedOn.get(id) ?? new Set()).add(page.id));
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
      for (const id of cited) lines.push(`[^${id}]: ${oneLine(labelOf(sources.get(id)!), 120)}`);
      files[`knowledge/${path}`] = concept(
        {
          type: overview ? 'Overview' : oneLine(page.type ?? 'Page', 200) || 'Page',
          title: name,
          homing: { id: page.id, ...(whole && { private: true }) },
          ...(page.archived && { status: 'deprecated' }),
          ...(latest && { generated: { by: actor(latest.author), at: latest.writtenAt } }),
          ...(cited.length && { sources: cited.map((id) => ({ id, resource: sourcePath(id), title: oneLine(labelOf(sources.get(id)!), 120) })) }),
        },
        lines,
      );

      // What happened to it, for the log.
      if (!overview) log.push({ at: page.createdAt, word: 'Creation', verb: 'Started', page: page.id, private: whole });
      for (const item of items) {
        log.push({ at: item.createdAt, word: 'Update', verb: item.supersedes ? 'Updated' : 'Added', counted: 'item', page: page.id, private: item.visibility === 'private' });
      }
      for (const revision of revisionsOn.get(page.id) ?? []) {
        if (byId.get(revision.item)!.kind !== 'text') continue;
        log.push({ at: revision.replacedAt, word: 'Correction', verb: 'Corrected', counted: 'item', page: page.id, private: revision.visibility === 'private' });
      }
      for (const archive of archivesOf.get(page.id) ?? []) {
        log.push({ at: archive.at, word: archive.archived ? 'Archive' : 'Reopening', verb: archive.archived ? 'Archived' : 'Reopened', page: page.id, private: false });
      }
    }

    const tasks = tasksIn.get(space.id) ?? [];
    if (tasks.length) {
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
      files[here('tasks.md')] = concept(
        { type: 'Tasks', title: `Tasks in ${named}`, homing: { space: space.id }, generated: { by: actor(latest.author), at: latest.updatedAt } },
        [`# Tasks in ${named}`, '', ...(open.length ? ['## Open', '', ...open.flatMap(line), ''] : []), ...(done.length ? ['## Done', '', ...done.flatMap(line), ''] : [])],
      );
      for (const task of tasks) {
        log.push({ at: task.createdAt, word: 'Task', verb: 'Added', counted: 'task', private: task.visibility === 'private' });
        if (task.done) log.push({ at: task.done.at, word: 'Task', verb: 'Finished', counted: 'task', private: task.visibility === 'private' });
      }
    }

    const kept = sourcesIn.get(space.id) ?? [];
    for (const source of kept) {
      await breathe();
      const label = oneLine(labelOf(source), 120);
      const uses = [...(usedOn.get(source.id) ?? [])];
      files[here(`sources/${source.id}.md`)] = concept(
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
      );
      log.push({ at: source.createdAt, word: 'Source', verb: 'Kept', counted: 'source', private: source.visibility === 'private' });
    }
    if (kept.length) {
      files[here('sources/index.md')] = index([[
        `Sources in ${named}`,
        kept.map((source) => entry(oneLine(labelOf(source), 120), `${source.id}.md`, [`kept on ${day(source.createdAt)}`, source.visibility === 'private' && privately].filter(Boolean).join(', '))),
      ]]);
    }

    // What's in the space, its pages, and the spaces in it.
    const overview = spacePages.find((page) => page.type === 'overview' && layout.knowledge.has(page.id));
    const pages = spacePages.filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).sort((a, b) => title(a.id).localeCompare(title(b.id)));
    const children = childrenOf.get(space.id) ?? [];
    files[here('index.md')] = index(
      [
        [named, [
          ...(overview ? [entry('Overview', 'overview.md', `where ${named} stands`)] : []),
          ...(tasks.length ? [entry('Tasks', 'tasks.md', `${tasks.filter((task) => !task.done).length} open, ${tasks.filter((task) => task.done).length} done`)] : []),
          ...(kept.length ? [entry('Sources', 'sources/', count(kept.length, 'source'))] : []),
        ]],
        [`Pages in ${named}`, pages.map((page) => entry(
          title(page.id),
          local(layout.knowledge.get(page.id)!),
          [oneLine(page.type ?? 'page', 200), page.archived && 'archived', onlyYou(page.id) && privately].filter(Boolean).join(', '),
        ))],
        [`Spaces in ${named}`, children.map((child) => entry(
          oneLine(child.name, 200),
          `${local(layout.folders.get(child.id)!)}/`,
          [count((pagesIn.get(child.id) ?? []).filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).length, 'page'), child.archived && 'archived', child.private && privately].filter(Boolean).join(', '),
        ))],
      ],
      space.parent === null,
    );
    if (log.length) files[here('log.md')] = logOf(`What changed in ${named}`, log, link, privately);

    // Guidance goes alongside the knowledge, never in it: AGENTS.md and SKILL.md aren't OKF concepts.
    const guidancePage = spacePages.find((page) => page.type === 'guidance');
    const rules = (guidancePage ? (current.get(guidancePage.id) ?? []) : []).filter((item) => item.kind === 'requirement' || item.kind === 'preference');
    const skills = spacePages.filter((page) => layout.skills.has(page.id));
    for (const skill of skills) {
      for (const file of current.get(skill.id) ?? []) {
        // A file's place in its folder, never outside it, on any system.
        if (file.kind === 'file' && file.path && safePath(file.path)) files[`guidance/${layout.skills.get(skill.id)}/${file.path}`] = file.body;
      }
    }
    const included = includesIn.get(space.id) ?? [];
    if (rules.length || skills.length || included.length) {
      const rule = (item: Data) => {
        const marks = [item.onlyHere && 'Only here.', item.visibility === 'private' && `${Privately}.`].filter(Boolean).join(' ');
        const text = item.body.trim().split('\n').map((line, at) => (at === 0 || !line ? line : `  ${line}`)).join('\n');
        return `- ${text}${marks ? ` (${marks})` : ''}`;
      };
      const ordered = (kind: string) =>
        rules.filter((item) => item.kind === kind).sort((a, b) => Number(a.visibility === 'private') - Number(b.visibility === 'private') || a.createdAt.localeCompare(b.createdAt));
      const skill = (page: Manifest['pages'][number]) => {
        const parts = current.get(page.id) ?? [];
        const name = parts.find((item) => item.kind === 'title')!;
        const description = frontmatter(parts.find((item) => item.path === 'SKILL.md')?.body ?? '').description;
        return `- [${oneLine(name.body, 200).replace(/[[\]]/g, '')}](${local(layout.skills.get(page.id)!)}/SKILL.md)${description ? `: ${oneLine(description, 300)}` : ''}${name.visibility === 'private' ? ` (${Privately}.)` : ''}`;
      };
      // What it includes, linked from here where it's in the export.
      const from = (path: string) => posix.relative(posix.dirname(`guidance/${join(folder, 'AGENTS.md')}`), path);
      const rulesOf = (id: string) => {
        const name = oneLine(spaceName.get(id)!, 200);
        const file = layout.files.get(m.pages.find((page) => page.space === id && page.type === 'guidance')?.id ?? '');
        return file ? `[${name.replace(/[[\]]/g, '')}](${from(file)})` : name;
      };
      const include = (x: Manifest['includes'][number]) => {
        const marks = [x.visibility === 'private' && `${Privately}.`, x.waiting && 'Waiting while it’s included for everyone.'].filter(Boolean).join(' ');
        const skillPage = x.skill && m.pages.find((page) => page.id === x.skill);
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
      files[`guidance/${join(folder, 'AGENTS.md')}`] = [
        `# Rules for ${named}`,
        '',
        `Kept in Homing. Requirements always apply. A rule applies in ${named} and the spaces in it, unless it's marked only here.` +
          (space.parent === null ? '' : ' The rules one folder up apply here too, except those marked only here.'),
        '',
        ...(requirements.length ? ['## Requirements', '', ...requirements.map(rule), ''] : []),
        ...(preferences.length ? ['## Preferences', '', ...preferences.map(rule), ''] : []),
        ...(skills.length ? ['## Skills', '', ...skills.map(skill), ''] : []),
        ...(included.length ? ['## Also included', '', `Guidance kept elsewhere that applies in ${named} too, as if it were set here:`, '', ...included.map(include), ''] : []),
      ].join('\n');
    }
  }
  return files;
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

/** An OKF log, newest day first, with what happened each day. */
function logOf(heading: string, events: Event[], link: (page: string) => string, privately: string): string {
  const days = new Map<string, Map<string, { event: Event; n: number }>>();
  for (const event of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    const entries = days.get(day(event.at)) ?? new Map<string, { event: Event; n: number }>();
    days.set(day(event.at), entries);
    const key = JSON.stringify([event.word, event.verb, event.page, event.counted, event.private]);
    const known = entries.get(key);
    if (known) known.n++;
    else entries.set(key, { event, n: 1 });
  }
  const lines = [`# ${heading}`, ''];
  for (const [date, entries] of days) {
    lines.push(`## ${date}`, '');
    for (const { event, n } of entries.values()) {
      const what = event.counted
        ? `${count(n, event.counted)}${event.page ? ` ${event.verb === 'Added' ? 'to' : 'on'} ${link(event.page)}` : ''}`
        : link(event.page!);
      lines.push(`* **${event.word}**: ${event.verb} ${what}${event.private ? `, ${privately}` : ''}.`);
    }
    lines.push('');
  }
  return lines.join('\n');
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
function labelOf(source: Manifest['sources'][number]): string {
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
