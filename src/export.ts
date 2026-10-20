// Exporting a space (spec §3, guarantee 10): everything the person can see in it, and in the
// spaces below it they can open, as one zip. homing.json holds all of it, for importing it again.
// knowledge/ is the same knowledge as readable Markdown in the Open Knowledge Format, and guidance/
// holds the rules and skills as AGENTS.md files and SKILL.md folders. Everything is read in the
// person's own session, so row-level security keeps anyone else's private side out underneath.

import { stringify } from 'yaml';
import { personOf, type Session } from './db.ts';
import { itemColumns, visible, type Item } from './knowledge.ts';
import { frontmatter } from './skills.ts';
import { listSpaces, peopleNames, type Space } from './spaces.ts';
import { zip } from './zip.ts';

/** Who wrote something: a person by name, and the agent that wrote it for them, if one did. */
export interface Author {
  /** Null for someone the exporter doesn't share a space with any more, or a space's routine. */
  name: string | null;
  agent: string | null;
}

/** Shared with the space, or private to the person who exported it. */
export type Visibility = 'shared' | 'private';

/** homing.json: everything an import needs, by the ids things have now. Times are ISO 8601. */
export interface Manifest {
  format: 'homing-export';
  version: 1;
  /** The Homing it came from. */
  instance: string;
  exportedAt: string;
  exportedBy: { name: string };
  /** The space that was exported. The others are below it. */
  space: string;
  spaces: {
    id: string;
    name: string;
    parent: string | null;
    /** Closed to the people in the space above it. */
    closed: boolean;
    /** In the exporter's personal tree, so only they have it. */
    private: boolean;
    archived: { at: string; by: string | null } | null;
    createdAt: string;
    /** Its folder in knowledge/ and guidance/, empty for the exported space. */
    folder: string;
  }[];
  pages: {
    id: string;
    space: string;
    /** A free-text type, or guidance, skill or overview. */
    type: string | null;
    createdAt: string;
    archived: { at: string; by: string | null } | null;
    /** Where it reads in the bundle. */
    file: string | null;
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
    /** For a shared copy of the exporter's own private item: that item. */
    publishedFrom: string | null;
    published: { by: string | null; at: string } | null;
    sources: string[];
  }[];
  revisions: { item: string; visibility: Visibility; body: string; author: Author; writtenAt: string; replacedAt: string }[];
  sources: { id: string; space: string; visibility: Visibility; reference: string | null; excerpt: string; author: Author; createdAt: string }[];
  /** Pages that mention other pages, as page:… in an item. */
  links: { item: string; from: string; to: string }[];
  /** Pages gathered into collections. */
  gathered: { collection: string; page: string; visibility: Visibility; author: Author; createdAt: string }[];
  /** Every time a page was archived or reopened. */
  pageArchives: { page: string; archived: boolean; author: Author; at: string }[];
  tasks: {
    id: string;
    space: string;
    visibility: Visibility;
    title: string;
    description: string | null;
    due: string | null;
    assignee: { name: string | null } | null;
    done: { at: string; by: string | null } | null;
    author: Author;
    createdAt: string;
    updatedAt: string;
  }[];
}

/**
 * A space as the person sees it, with the spaces below it they can open, as a zip, or undefined
 * when they can't open it. Read in one snapshot, so it holds together.
 */
export async function exportSpace(s: Session, spaceId: string, instance: URL, now = new Date()): Promise<{ filename: string; zip: Buffer } | undefined> {
  const manifest = await manifestOf(s, spaceId, instance, now);
  if (!manifest) return undefined;
  const files = Object.entries({ 'homing.json': `${JSON.stringify(manifest, null, 2)}\n`, ...readable(manifest) });
  return { filename: `${slug(manifest.spaces[0].name, 'space')}-${manifest.exportedAt.slice(0, 10)}.zip`, zip: await zip(files, now) };
}

/** Everything the person can see in the space and the spaces below it they can open. */
export async function manifestOf(s: Session, spaceId: string, instance: URL, now = new Date()): Promise<Manifest | undefined> {
  const me = personOf(s.principal);
  if (!me) return undefined;
  const open = await listSpaces(s);
  const root = open.find((space) => space.id === spaceId);
  if (!root) return undefined;
  // Down only through spaces the person can open, so a closed space they aren't in leaves no trace, nor anything in it.
  const tree: Space[] = [root];
  for (let i = 0; i < tree.length; i++) tree.push(...open.filter((space) => space.parentId === tree[i].id));
  const ids = tree.map((space) => space.id);

  const spaceRows = await s.tx<{ id: string; archivedBy: string | null; createdAt: Date }[]>`
    select id, archived_by, created_at from spaces where id in ${s.tx(ids)}
  `;
  const pages = await s.tx<{ id: string; spaceId: string; type: string | null; createdAt: Date; archivedAt: Date | null; archivedBy: string | null }[]>`
    select p.id, p.space_id, p.type, p.created_at, p.archived_at, p.archived_by from pages p
    where p.space_id in ${s.tx(ids)} and exists (select from content c where c.page_id = p.id and ${visible(s, 'c')})
    order by p.created_at, p.id
  `;
  const found = await s.tx<Item[]>`
    select ${itemColumns(s, 'c')} from content c
    where c.space_id in ${s.tx(ids)} and ${visible(s, 'c')}
    order by c.created_at, c.id
  `;
  const citations = await s.tx<{ contentId: string; sourceId: string }[]>`
    select ci.content_id, ci.source_id from citations ci
    join content c on c.id = ci.content_id
    join sources src on src.id = ci.source_id
    where c.space_id in ${s.tx(ids)} and ${visible(s, 'c')} and src.space_id in ${s.tx(ids)} and ${visible(s, 'src')}
    order by src.created_at, src.id
  `;
  const revisions = await s.tx<{ contentId: string; privateTo: string | null; body: string; writtenBy: string | null; agent: string | null; writtenAt: Date; replacedAt: Date }[]>`
    select r.content_id, r.private_to, r.body, r.written_by, r.agent, r.written_at, r.replaced_at from revisions r
    where r.space_id in ${s.tx(ids)} and ${visible(s, 'r')}
    order by r.replaced_at
  `;
  const sources = await s.tx<{ id: string; spaceId: string; privateTo: string | null; reference: string | null; excerpt: string; writtenBy: string | null; agent: string | null; createdAt: Date }[]>`
    select src.id, src.space_id, src.private_to, src.reference, src.excerpt, src.written_by, src.agent, src.created_at from sources src
    where src.space_id in ${s.tx(ids)} and ${visible(s, 'src')}
    order by src.created_at, src.id
  `;
  const archives = await s.tx<{ pageId: string; archived: boolean; personId: string | null; agent: string | null; at: Date }[]>`
    select a.page_id, a.archived, a.person_id, a.agent, a.at from page_archives a
    join pages p on p.id = a.page_id
    where p.space_id in ${s.tx(ids)}
    order by a.at
  `;
  const gathered = await s.tx<{ collectionId: string; pageId: string; privateTo: string | null; addedBy: string | null; agent: string | null; createdAt: Date }[]>`
    select g.collection_id, g.page_id, g.private_to, g.added_by, g.agent, g.created_at from gathered g
    where g.space_id in ${s.tx(ids)} and ${visible(s, 'g')}
    order by g.created_at
  `;
  const tasks = await s.tx<{ id: string; spaceId: string; privateTo: string | null; title: string; description: string | null; due: string | null; assignee: string | null; doneAt: Date | null; doneBy: string | null; writtenBy: string | null; agent: string | null; createdAt: Date; updatedAt: Date }[]>`
    select t.id, t.space_id, t.private_to, t.title, t.description, to_char(t.due, 'YYYY-MM-DD') as due, t.assignee, t.done_at, t.done_by,
           t.written_by, t.agent, t.created_at, t.updated_at
    from tasks t
    where t.space_id in ${s.tx(ids)} and ${visible(s, 't')}
    order by t.created_at, t.id
  `;

  // Names only of people the person shares a space with, the way Homing shows them.
  const names = await peopleNames(s, [
    me,
    ...spaceRows.map((row) => row.archivedBy),
    ...pages.map((page) => page.archivedBy),
    ...found.flatMap((item) => [item.writtenBy, item.publishedBy]),
    ...revisions.map((revision) => revision.writtenBy),
    ...sources.map((source) => source.writtenBy),
    ...archives.map((archive) => archive.personId),
    ...gathered.map((gathering) => gathering.addedBy),
    ...tasks.flatMap((task) => [task.assignee, task.doneBy, task.writtenBy]),
  ]);
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const author = (id: string | null, agent: string | null): Author => ({ name: name(id), agent });
  const side = (privateTo: string | null): Visibility => (privateTo ? 'private' : 'shared');
  const time = (date: Date) => date.toISOString();

  // A removal of something the person can't see would remove nothing.
  const seen = new Set(found.map((item) => item.id));
  const items = found.filter((item) => item.kind !== 'removed' || (item.supersedes && seen.has(item.supersedes)));
  const itemIds = new Set(items.map((item) => item.id));
  const pageIds = new Set(pages.map((page) => page.id));
  // References in text to anything left out lose their id, so nothing outside the bundle shows through.
  const known = new Set([...ids, ...pageIds, ...itemIds, ...sources.map((source) => source.id), ...tasks.map((task) => task.id)]);
  const clean = (text: string) => scrub(text, known);
  const cited = groupBy(citations, (citation) => citation.contentId);
  const spaceOf = new Map(spaceRows.map((row) => [row.id, row]));

  const manifest: Manifest = {
    format: 'homing-export',
    version: 1,
    instance: instance.origin,
    exportedAt: time(now),
    exportedBy: { name: name(me) ?? '' },
    space: root.id,
    spaces: tree.map((space) => ({
      id: space.id,
      name: space.name,
      parent: space === root ? null : space.parentId,
      closed: space.closed,
      private: space.privateTo !== null,
      archived: space.archivedAt ? { at: time(space.archivedAt), by: name(spaceOf.get(space.id)?.archivedBy ?? null) } : null,
      createdAt: time(spaceOf.get(space.id)!.createdAt),
      folder: '',
    })),
    pages: pages.map((page) => ({
      id: page.id,
      space: page.spaceId,
      type: page.type,
      createdAt: time(page.createdAt),
      archived: page.archivedAt ? { at: time(page.archivedAt), by: name(page.archivedBy) } : null,
      file: null,
    })),
    items: items.map((item) => ({
      id: item.id,
      page: item.pageId,
      space: item.spaceId,
      kind: item.kind,
      path: item.path,
      body: clean(item.body),
      visibility: side(item.privateTo),
      author: author(item.writtenBy, item.agent),
      createdAt: time(item.createdAt),
      writtenAt: time(item.updatedAt),
      supersedes: item.supersedes && itemIds.has(item.supersedes) ? item.supersedes : null,
      ...(item.kind === 'requirement' || item.kind === 'preference' ? { onlyHere: !item.reachesDown } : {}),
      publishedFrom: item.publishedFrom && itemIds.has(item.publishedFrom) ? item.publishedFrom : null,
      published: item.publishedAt ? { by: name(item.publishedBy), at: time(item.publishedAt) } : null,
      sources: (cited.get(item.id) ?? []).map((citation) => citation.sourceId),
    })),
    revisions: revisions
      .filter((revision) => itemIds.has(revision.contentId))
      .map((revision) => ({
        item: revision.contentId,
        visibility: side(revision.privateTo),
        body: clean(revision.body),
        author: author(revision.writtenBy, revision.agent),
        writtenAt: time(revision.writtenAt),
        replacedAt: time(revision.replacedAt),
      })),
    sources: sources.map((source) => ({
      id: source.id,
      space: source.spaceId,
      visibility: side(source.privateTo),
      reference: source.reference && clean(source.reference),
      excerpt: clean(source.excerpt),
      author: author(source.writtenBy, source.agent),
      createdAt: time(source.createdAt),
    })),
    links: [],
    gathered: gathered
      .filter((gathering) => pageIds.has(gathering.collectionId) && pageIds.has(gathering.pageId))
      .map((gathering) => ({
        collection: gathering.collectionId,
        page: gathering.pageId,
        visibility: side(gathering.privateTo),
        author: author(gathering.addedBy, gathering.agent),
        createdAt: time(gathering.createdAt),
      })),
    pageArchives: archives
      .filter((archive) => pageIds.has(archive.pageId))
      .map((archive) => ({ page: archive.pageId, archived: archive.archived, author: author(archive.personId, archive.agent), at: time(archive.at) })),
    tasks: tasks.map((task) => ({
      id: task.id,
      space: task.spaceId,
      visibility: side(task.privateTo),
      title: clean(task.title),
      description: task.description && clean(task.description),
      due: task.due,
      assignee: task.assignee ? { name: name(task.assignee) } : null,
      done: task.doneAt ? { at: time(task.doneAt), by: name(task.doneBy) } : null,
      author: author(task.writtenBy, task.agent),
      createdAt: time(task.createdAt),
      updatedAt: time(task.updatedAt),
    })),
  };

  for (const item of manifest.items) {
    if (item.kind !== 'text') continue;
    const targets = new Set([...item.body.matchAll(pageRefs)].map((match) => match[1].toLowerCase()).filter((id) => pageIds.has(id) && id !== item.page));
    for (const to of targets) manifest.links.push({ item: item.id, from: item.page, to });
  }
  const layout = layoutOf(manifest);
  for (const space of manifest.spaces) space.folder = layout.folders.get(space.id)!;
  for (const page of manifest.pages) page.file = layout.files.get(page.id) ?? null;
  return manifest;
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const kinds = 'page|item|source|space|task|proposal';
/** A reference to something in Homing, as a Markdown link or on its own, such as [Gunnar](page:…) or item:…. */
const references = new RegExp(`\\[([^\\]\\n]*)\\]\\((?:${kinds}):(${uuid})\\)|\\b(?:${kinds}):(${uuid})`, 'gi');
const pageRefs = new RegExp(`\\bpage:(${uuid})`, 'gi');

/** The text with references to anything not in the bundle taken out: a link keeps its words. */
function scrub(text: string, known: Set<string>): string {
  return text.replace(references, (whole, words: string | undefined, linked: string | undefined, bare: string | undefined) => {
    if (known.has((linked ?? bare)!.toLowerCase())) return whole;
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
    if (title) titles.set(page, title.body);
  }
  return titles;
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

/** The knowledge and guidance as files, by their place in the zip. */
function readable(m: Manifest): Record<string, string> {
  const files: Record<string, string> = {};
  const layout = layoutOf(m);
  const current = currentItems(m);
  const titles = titlesOf(current);
  const me = m.exportedBy.name || 'whoever exported it';
  const privately = `private to ${me}`;
  const Privately = privately[0].toUpperCase() + privately.slice(1);
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
  const usedOn = new Map<string, Set<string>>();

  for (const page of m.pages) {
    if (page.type === 'overview') titles.set(page.id, `Overview of ${m.spaces.find((space) => space.id === page.space)!.name}`);
  }
  const title = (page: string) => titles.get(page) ?? 'Untitled';
  const link = (page: string) => `[${title(page)}](/${layout.knowledge.get(page)})`;
  const onlyYou = (page: string) => (itemsOn.get(page) ?? []).every((item) => item.visibility === 'private');
  const sourcePath = (source: string) => `/${join(layout.folders.get(sources.get(source)!.space)!, `sources/${source}.md`)}`;
  // Links between pages point to their files; links to anything else stay as they are.
  const linked = (text: string) =>
    text.replace(new RegExp(`\\]\\(page:(${uuid})\\)`, 'gi'), (whole, id: string) => {
      const path = layout.knowledge.get(id.toLowerCase());
      return path ? `](/${path})` : whole;
    });
  /** An item, with the sources it cites as footnotes keyed by their ids. */
  const withSources = (item: Data) => {
    const body = linked(item.body).trimEnd();
    const notes = item.sources.map((id) => `[^${id}]`).join('');
    if (!notes) return body;
    // On its last line, unless that ends a code block or a table.
    return /^\s*(```|~~~|\|)/.test(body.split('\n').at(-1) ?? '') ? `${body}\n\n${notes}` : `${body}${notes}`;
  };
  /** Where an item stands among the others: a replacement where the first it replaced stood. */
  const firstOf = (item: Data): Data => (item.supersedes && byId.has(item.supersedes) ? firstOf(byId.get(item.supersedes)!) : item);

  for (const space of m.spaces) {
    const folder = layout.folders.get(space.id)!;
    const here = (path: string) => `knowledge/${join(folder, path)}`;
    const local = (path: string) => (folder ? path.slice(folder.length + 1) : path);
    const spacePages = pagesIn.get(space.id) ?? [];
    const log: Event[] = [];

    for (const page of spacePages) {
      const path = layout.knowledge.get(page.id);
      if (!path) continue;
      const overview = page.type === 'overview';
      const whole = onlyYou(page.id);
      const items = (itemsOn.get(page.id) ?? []).filter((item) => item.kind === 'text');
      const live = new Set((current.get(page.id) ?? []).filter((item) => item.kind === 'text'));
      // Your own original shows as one with what you shared from it while they agree, as in Homing.
      const agreeing = new Set([...live].filter((copy) => copy.publishedFrom && byId.get(copy.publishedFrom)?.body === copy.body).map((copy) => copy.publishedFrom));
      const shown = [...live]
        .filter((item) => !agreeing.has(item.id))
        .sort((a, b) => firstOf(a).createdAt.localeCompare(firstOf(b).createdAt) || a.createdAt.localeCompare(b.createdAt));
      const earlier = items.filter((item) => !live.has(item));
      const cited = [...new Set([...shown, ...earlier].flatMap((item) => item.sources))];
      for (const id of cited) usedOn.set(id, (usedOn.get(id) ?? new Set()).add(page.id));
      const latest = [...(current.get(page.id) ?? [])].sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))[0];
      const name = title(page.id);

      const lines = [
        `# ${name}`,
        '',
        ...(whole ? [`_${Privately}: nobody else sees this page._`, ''] : []),
        ...(page.archived ? [`_Archived on ${day(page.archived.at)}${page.archived.by ? ` by ${page.archived.by}` : ''}: no longer active._`, ''] : []),
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
          lines.push(forYou ? `_Replaced on ${at}, for ${me} only. Everyone else still sees it._` : `_Replaced on ${at}${item.visibility === 'private' && !whole ? `, ${privately}` : ''}._`, '');
          lines.push(withSources(item), '');
        }
      }
      for (const id of cited) lines.push(`[^${id}]: ${oneLine(labelOf(sources.get(id)!), 120)}`);
      files[`knowledge/${path}`] = concept(
        {
          type: overview ? 'Overview' : (page.type ?? 'Page'),
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
        log.push(item.supersedes
          ? { at: item.createdAt, word: 'Update', verb: 'Updated', counted: 'item', page: page.id, private: item.visibility === 'private' }
          : { at: item.createdAt, word: 'Update', verb: 'Added', counted: 'item', page: page.id, private: item.visibility === 'private' });
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
        const facts = [
          task.due && `due ${task.due}`,
          task.assignee && `for ${task.assignee.name ?? 'someone'}`,
          task.done && `done on ${day(task.done.at)}${task.done.by ? ` by ${task.done.by}` : ''}`,
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
        { type: 'Tasks', title: `Tasks in ${space.name}`, homing: { space: space.id }, generated: { by: actor(latest.author), at: latest.updatedAt } },
        [`# Tasks in ${space.name}`, '', ...(open.length ? ['## Open', '', ...open.flatMap(line), ''] : []), ...(done.length ? ['## Done', '', ...done.flatMap(line), ''] : [])],
      );
      for (const task of tasks) {
        log.push({ at: task.createdAt, word: 'Task', verb: 'Added', counted: 'task', private: task.visibility === 'private' });
        if (task.done) log.push({ at: task.done.at, word: 'Task', verb: 'Finished', counted: 'task', private: task.visibility === 'private' });
      }
    }

    const kept = sourcesIn.get(space.id) ?? [];
    for (const source of kept) {
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
        `Sources in ${space.name}`,
        kept.map((source) => entry(oneLine(labelOf(source), 120), `${source.id}.md`, [`kept on ${day(source.createdAt)}`, source.visibility === 'private' && privately].filter(Boolean).join(', '))),
      ]]);
    }

    // What's in the space, its pages, and the spaces in it.
    const overview = spacePages.find((page) => page.type === 'overview' && layout.knowledge.has(page.id));
    const pages = spacePages.filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).sort((a, b) => title(a.id).localeCompare(title(b.id)));
    const children = childrenOf.get(space.id) ?? [];
    files[here('index.md')] = index(
      [
        [space.name, [
          ...(overview ? [entry('Overview', 'overview.md', `where ${space.name} stands`)] : []),
          ...(tasks.length ? [entry('Tasks', 'tasks.md', `${tasks.filter((task) => !task.done).length} open, ${tasks.filter((task) => task.done).length} done`)] : []),
          ...(kept.length ? [entry('Sources', 'sources/', count(kept.length, 'source'))] : []),
        ]],
        [`Pages in ${space.name}`, pages.map((page) => entry(
          title(page.id),
          local(layout.knowledge.get(page.id)!),
          [page.type ?? 'page', page.archived && 'archived', onlyYou(page.id) && privately].filter(Boolean).join(', '),
        ))],
        [`Spaces in ${space.name}`, children.map((child) => entry(
          child.name,
          `${local(layout.folders.get(child.id)!)}/`,
          [count((pagesIn.get(child.id) ?? []).filter((page) => page.type !== 'overview' && layout.knowledge.has(page.id)).length, 'page'), child.archived && 'archived', child.private && privately].filter(Boolean).join(', '),
        ))],
      ],
      space.parent === null,
    );
    if (log.length) files[here('log.md')] = logOf(`What changed in ${space.name}`, log, link, privately);

    // Guidance goes alongside the knowledge, never in it: AGENTS.md and SKILL.md aren't OKF concepts.
    const guidancePage = spacePages.find((page) => page.type === 'guidance');
    const rules = (guidancePage ? (current.get(guidancePage.id) ?? []) : []).filter((item) => item.kind === 'requirement' || item.kind === 'preference');
    const skills = spacePages.filter((page) => layout.skills.has(page.id));
    for (const skill of skills) {
      for (const file of current.get(skill.id) ?? []) {
        // A file's place in its folder, never outside it.
        if (file.kind === 'file' && file.path?.split('/').every((part) => part && part !== '.' && part !== '..')) {
          files[`guidance/${layout.skills.get(skill.id)}/${file.path}`] = file.body;
        }
      }
    }
    if (rules.length || skills.length) {
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
        return `- [${name.body}](${local(layout.skills.get(page.id)!)}/SKILL.md)${description ? `: ${oneLine(description, 300)}` : ''}${name.visibility === 'private' ? ` (${Privately}.)` : ''}`;
      };
      const requirements = ordered('requirement');
      const preferences = ordered('preference');
      files[`guidance/${join(folder, 'AGENTS.md')}`] = [
        `# Rules for ${space.name}`,
        '',
        `Kept in Homing. Requirements always apply. A rule applies in ${space.name} and the spaces in it, unless it's marked only here.` +
          (space.parent === null ? '' : ' The rules one folder up apply here too, except those marked only here.'),
        '',
        ...(requirements.length ? ['## Requirements', '', ...requirements.map(rule), ''] : []),
        ...(preferences.length ? ['## Preferences', '', ...preferences.map(rule), ''] : []),
        ...(skills.length ? ['## Skills', '', ...skills.map(skill), ''] : []),
      ].join('\n');
    }
  }
  return files;
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
  return `* [${title.replace(/[[\]]/g, '')}](${encodeURI(href)})${description ? ` - ${description}` : ''}`;
}

/** An OKF concept: YAML frontmatter with its type, then Markdown. */
function concept(front: Record<string, unknown>, lines: string[]): string {
  return `---\n${stringify(front, { lineWidth: 0 })}---\n\n${lines.join('\n').trimEnd()}\n`;
}

/** Who wrote something, as OKF names actors: human:<name> for people, and <assistant>/homing for agents. */
function actor(author: Author): string {
  if (author.agent) return `${slug(author.agent, 'assistant')}/homing`;
  return `human:${author.name ?? 'unknown'}`;
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
