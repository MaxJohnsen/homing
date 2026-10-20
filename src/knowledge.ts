import { randomUUID } from 'node:crypto';
import { AccessDenied, personOf, type Session } from './db.ts';
import { accessibleSpaces } from './spaces.ts';

export interface Item {
  id: string;
  pageId: string;
  spaceId: string;
  /** A page's title, knowledge, a rule on a guidance page, a skill's file, or the removal of a rule or file. */
  kind: 'title' | 'text' | 'requirement' | 'preference' | 'file' | 'removed';
  /** Where a skill's file goes in its folder, such as references/tone.md. */
  path: string | null;
  /** The person whose private side the item is on, or null when shared. */
  privateTo: string | null;
  body: string;
  /** The person who wrote it, or null when a space's routine did. */
  writtenBy: string | null;
  /** The agent that wrote it, or null when a person wrote it themselves. */
  agent: string | null;
  /** The item this one replaced, if any. */
  supersedes: string | null;
  /** Guidance that also applies in the spaces below its own. Knowledge never does. */
  reachesDown: boolean;
  /** For shared knowledge published from someone's private side: the private original, which only they see. */
  publishedFrom: string | null;
  /** Who shared it from their private side, and when. */
  publishedBy: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Source {
  id: string;
  spaceId: string;
  privateTo: string | null;
  reference: string | null;
  excerpt: string;
}

export type Citation = Pick<Source, 'id' | 'reference' | 'excerpt'>;

export interface Page {
  id: string;
  spaceId: string;
  type: string | null;
  title: string;
  /** Whether it's on the space's shared side, with a title everyone there sees. */
  shared: boolean;
  /** When anything the viewer sees on it last changed. */
  updatedAt: Date;
  /** When it was archived and by whom, if it is. */
  archived: { at: Date; by: string | null } | null;
  /**
   * The current items, each with its sources and the earlier item it replaced, if any. Your own
   * private items also say what everyone sees from your earlier share of them, if anything.
   */
  items: (Item & { sources: Citation[]; replaced: Replaced | null; sharedAs: string | null })[];
}

/** What an item replaced. When a private item replaced a shared one, others still see that one. */
export interface Replaced {
  id: string;
  body: string;
  shared: boolean;
}

export interface Revision {
  body: string;
  writtenBy: string | null;
  agent: string | null;
  writtenAt: Date;
  replacedAt: Date;
}

export interface Hit {
  kind: 'page' | 'item' | 'source';
  id: string;
  spaceId: string;
  pageId: string | null;
  /** The type of the page, such as guidance or project. */
  pageType: string | null;
  title: string | null;
  text: string;
  private: boolean;
  superseded: boolean;
  /** On an archived page. */
  archived: boolean;
  /** A private item that replaced a shared one, which others still see. */
  updatesShared: boolean;
  /** What the matching content is: a title, knowledge, a rule or a skill's file. Null for a source. */
  itemKind: string | null;
}

/** Keeps where knowledge came from, without giving it a page yet. The same source is kept once. */
export async function addSource(
  s: Session,
  input: { spaceId: string; excerpt: string; reference?: string; shared?: boolean },
): Promise<Source> {
  const privateTo = sideOf(s, input.shared);
  await checkSpace(s, input.spaceId, input.shared);
  const [existing] = await s.tx<Source[]>`
    select ${sourceColumns(s)} from sources
    where space_id = ${input.spaceId}::uuid and private_to is not distinct from ${privateTo}::uuid
      and excerpt = ${input.excerpt} and reference is not distinct from ${input.reference ?? null}
  `;
  if (existing) return existing;
  const [source] = await s.tx<Source[]>`
    insert into sources (space_id, private_to, reference, excerpt)
    values (${input.spaceId}::uuid, ${privateTo}::uuid, ${input.reference ?? null}, ${input.excerpt})
    returning ${sourceColumns(s)}
  `;
  return source;
}

export async function readSource(s: Session, sourceId: string): Promise<Source | undefined> {
  const [source] = await s.tx<Source[]>`
    select ${sourceColumns(s)} from sources where id = ${sourceId}::uuid and ${visible(s, 'sources')}
  `;
  return source;
}

/** Creates a page for one subject, with its title on the given side. */
export async function createPage(
  s: Session,
  input: { spaceId: string; title: string; type?: string; shared?: boolean },
): Promise<string> {
  const privateTo = sideOf(s, input.shared);
  await checkSpace(s, input.spaceId, input.shared);
  // A page is only visible through its items, so it can't be returned until its title exists.
  const id = randomUUID();
  await s.tx`insert into pages (id, space_id, type) values (${id}::uuid, ${input.spaceId}::uuid, ${input.type ?? null})`;
  await insertItem(s, { pageId: id, spaceId: input.spaceId, privateTo, kind: 'title', body: input.title });
  return id;
}

/**
 * Writes an item on a page. It is private unless shared is set. Writing what
 * you already wrote there adds the sources to your existing item instead.
 */
export async function writeItem(
  s: Session,
  input: { pageId: string; body: string; sources?: string[]; shared?: boolean },
): Promise<Item> {
  const privateTo = sideOf(s, input.shared);
  const [page] = await s.tx<{ spaceId: string }[]>`
    select space_id from content
    where page_id = ${input.pageId}::uuid and ${visible(s, 'content')}
    limit 1
  `;
  if (!page) throw new AccessDenied('There is no page with that reference that you can see.');
  await checkSpace(s, page.spaceId, input.shared);
  const [same] = await s.tx<Item[]>`
    select ${itemColumns(s)} from content
    where page_id = ${input.pageId}::uuid and kind = 'text' and body = ${input.body}
      and private_to is not distinct from ${privateTo}::uuid
      and written_by is not distinct from ${personOf(s.principal) ?? null}::uuid
      and ${current(s, 'content')}
  `;
  if (same) {
    await cite(s, same.id, input.sources);
    return same;
  }
  return insertItem(s, { ...input, spaceId: page.spaceId, privateTo, kind: 'text' });
}

/** Rewrites an item. What it said before stays in its history. */
export async function updateItem(
  s: Session,
  itemId: string,
  input: { body: string; sources?: string[] },
): Promise<Item | undefined> {
  if (!(await changeableItem(s, itemId))) return undefined;
  const [item] = await s.tx<Item[]>`
    update content set body = ${input.body}
    where id = ${itemId}::uuid and ${visible(s, 'content')}
    returning ${itemColumns(s)}
  `;
  if (!item) return undefined;
  await cite(s, item.id, input.sources);
  return item;
}

/**
 * Replaces an item that is no longer true. The old item stays as what used
 * to be true. A private replacement changes only the writer's own view; a
 * shared one replaces a shared item for everyone.
 */
export async function supersedeItem(
  s: Session,
  itemId: string,
  input: { body: string; sources?: string[]; shared?: boolean },
): Promise<Item | undefined> {
  const old = await changeableItem(s, itemId);
  if (!old) return undefined;
  const privateTo = sideOf(s, input.shared);
  return insertItem(s, { ...input, pageId: old.pageId, spaceId: old.spaceId, privateTo, kind: 'text', supersedes: old.id });
}

/**
 * A page as the viewer sees it: the current shared items plus their own, with their sources. An
 * item that replaced another stands where the first of them stood.
 */
export async function readPage(s: Session, pageId: string): Promise<Page | undefined> {
  // Checked once for the page, so a page without shared copies doesn't look for them item by item.
  const [{ copies }] = await s.tx<{ copies: boolean }[]>`
    select exists (select from content x where x.page_id = ${pageId}::uuid and x.published_from is not null) as copies
  `;
  const hasCopies = copies ? s.tx`true` : s.tx`false`;
  const items = await s.tx<Page['items']>`
    with recursive chain (id, first, shared, nearest_shared) as (
      select c.id, c.id, c.private_to is null, null::uuid from content c
      where c.page_id = ${pageId}::uuid and c.supersedes is null and ${visibleContent(s, 'c')}
      union all
      -- Each item carries the nearest shared item before it in its chain.
      select c.id, chain.first, c.private_to is null, case when chain.shared then chain.id else chain.nearest_shared end
      from content c join chain on c.supersedes = chain.id
      where c.page_id = ${pageId}::uuid and ${visibleContent(s, 'c')}
    )
    select ${itemColumns(s, 'content')}, ${citationsOf(s, true)} as sources,
           -- What everyone sees from your earlier share of it, looked for only on a page with shared copies.
           case when content.private_to is not null and content.kind = 'text' and ${hasCopies}
                then (select shared.body from content shared where shared.id = shared_copy(content.id)) end as shared_as, (
      -- Whoever can see a replacement can see what it replaced. For your own update to something
      -- shared, however many times you updated it since, that's the shared item nearest it.
      select json_build_object('id', r.id, 'body', r.body, 'shared', r.private_to is null)
      from content r
      where r.id = case when content.private_to is not null and chain.nearest_shared is not null
                        then chain.nearest_shared else content.supersedes end
    ) as replaced
    from content
    left join chain on chain.id = content.id
    left join content first on first.id = chain.first
    where content.page_id = ${pageId}::uuid and content.kind <> 'removed' and ${visibleContent(s, 'content')} and ${current(s, 'content')}
      and not ${agreesWithShared(s, 'content')}
    order by coalesce(first.created_at, content.created_at), content.created_at
  `;
  if (items.length === 0) return undefined;
  const [{ type, archivedAt, archivedBy }] = await s.tx<{ type: string | null; archivedAt: Date | null; archivedBy: string | null }[]>`
    select type, archived_at, archived_by from pages where id = ${pageId}::uuid
  `;
  // Your own title for a page comes before the shared one.
  const titles = items.filter((item) => item.kind === 'title').sort((a, b) => Number(!a.privateTo) - Number(!b.privateTo));
  return {
    id: pageId,
    spaceId: items[0].spaceId,
    type,
    title: titles[0]?.body ?? 'Untitled',
    shared: titles.some((title) => title.privateTo === null),
    updatedAt: new Date(Math.max(...items.map((item) => item.updatedAt.getTime()))),
    archived: archivedAt ? { at: archivedAt, by: archivedBy } : null,
    items: items.filter((item) => item.kind !== 'title'),
  };
}

/** What sharing one of your private items with its space would do, for you to decide. */
export interface Publication {
  item: Item;
  /** The page's title as the others will see it: its shared title, or yours, which is then shared too. */
  pageTitle: string;
  /** Whether the page has no shared title yet, so yours is shared with the item. */
  sharesTitle: boolean;
  /**
   * What it rests on that the space's members can't see: your own sources, or another space's,
   * by the space's name. Ones you can no longer open are counted, not named.
   */
  hidden: { reference: string | null; excerpt: string; space: string | null }[];
  hiddenUnseen: number;
  /** Whether it's shared as a copy citing only what everyone there sees, rather than moving. */
  copy: boolean;
  /** What everyone sees now from your earlier share, which this updates, if you shared it before. */
  sharedText: string | null;
  /** Whether it's still your current item, so it can be shared. */
  current: boolean;
}

/** What sharing the item would do, if it's one of your own private items. */
export async function publicationOf(s: Session, itemId: string): Promise<Publication | undefined> {
  const me = personOf(s.principal) ?? null;
  const [item] = await s.tx<Item[]>`
    select ${itemColumns(s)} from content
    where id = ${itemId}::uuid and private_to = ${me}::uuid and kind = 'text' and ${visible(s, 'content')}
      -- Rules, skills and the overview are shared another way.
      and coalesce((select p.type from pages p where p.id = content.page_id), '') not in ('guidance', 'skill', 'overview')
  `;
  if (!item) return undefined;
  const hidden = await s.tx<{ reference: string | null; excerpt: string; space: string | null }[]>`
    select src.reference, src.excerpt, case when src.private_to is null then sp.name end as space
    from citations ci
    join sources src on src.id = ci.source_id
    left join spaces sp on sp.id = src.space_id
    where ci.content_id = ${itemId}::uuid and ${visible(s, 'src')}
      and (src.private_to is not null or src.space_id <> ${item.spaceId}::uuid)
    order by src.created_at
  `;
  const [facts] = await s.tx<{ hiddenCount: number; base: string | null; sharedText: string | null; sharedBefore: boolean; current: boolean; sharedTitle: string | null; ownTitle: string | null }[]>`
    select hidden_sources(${itemId}::uuid) as hidden_count,
           shared_base(${itemId}::uuid) as base,
           -- What everyone sees now that sharing this replaces: an earlier share of it, or what it updates.
           coalesce((select body from content where id = shared_copy(${itemId}::uuid)),
                    (select body from content where id = shared_base(${itemId}::uuid))) as shared_text,
           shared_copy(${itemId}::uuid) is not null as shared_before,
           not exists (select from content r where r.supersedes = ${itemId}::uuid and ${visible(s, 'r')}) as current,
           (select body from content where page_id = ${item.pageId}::uuid and kind = 'title' and private_to is null) as shared_title,
           (select body from content where page_id = ${item.pageId}::uuid and kind = 'title' and private_to = ${me}::uuid) as own_title
  `;
  // Moving is for what was written without anything hidden, as the first update of what's shared, if any.
  const moves = facts.hiddenCount === 0 && !facts.sharedBefore && (item.supersedes === null || item.supersedes === facts.base);
  return {
    item,
    pageTitle: facts.sharedTitle ?? facts.ownTitle ?? 'Untitled',
    sharesTitle: facts.sharedTitle === null,
    hidden,
    hiddenUnseen: Math.max(0, facts.hiddenCount - hidden.length),
    copy: !moves,
    sharedText: facts.sharedText,
    current: facts.current,
  };
}

/**
 * Shares one of your private items with everyone in its space (spec §5), exactly the text you were
 * shown: directly, as a person, or by approving what your assistant proposed. Returns the shared
 * item, or undefined if it changed since it was shown.
 */
export async function publishItem(s: Session, itemId: string, shown: string): Promise<string | undefined> {
  try {
    // In a savepoint, so a refusal leaves the rest of the transaction usable.
    const [{ id }] = await s.tx.savepoint((sp) => sp<{ id: string }[]>`select publish_item(${itemId}::uuid, ${shown}) as id`);
    return id;
  } catch (error) {
    // Changed or replaced since it was shown: it's shown again as it is now.
    if (error instanceof Error && ['it changed since it was shown', 'that item has been replaced since'].includes(error.message)) return undefined;
    throw error;
  }
}

/** An item with its sources, its earlier versions, and what replaced it, if anything. */
export async function readItem(s: Session, itemId: string) {
  const [item] = await s.tx<(Item & { sources: Citation[] })[]>`
    select ${itemColumns(s)}, ${citationsOf(s)} as sources
    from content
    where id = ${itemId}::uuid and ${visibleContent(s, 'content')}
  `;
  if (!item) return undefined;
  const history = await s.tx<Revision[]>`
    select body, written_by, agent, written_at, replaced_at
    from revisions
    where content_id = ${itemId}::uuid and ${visible(s, 'revisions')}
    order by replaced_at
  `;
  return { ...item, history, replacedBy: await replacementOf(s, itemId) };
}

/** The knowledge pages in a space that the viewer can see, most recently changed first. */
export async function listPages(s: Session, spaceId: string) {
  return s.tx<{ id: string; type: string | null; title: string | null; updatedAt: Date }[]>`
    select c.page_id as id, p.type, ${titleOf(s, s.tx`c.page_id`)} as title, max(c.updated_at) as updated_at
    from content c
    join pages p on p.id = c.page_id
    where c.space_id = ${spaceId}::uuid and ${knowledge(s, 'p')} and p.archived_at is null and ${visible(s, 'c')} and ${current(s, 'c')}
    group by c.page_id, p.type
    order by updated_at desc
  `;
}

/** How many archived pages in a space the viewer can see. */
export async function archivedPages(s: Session, spaceId: string): Promise<number> {
  const [{ count }] = await s.tx<{ count: number }[]>`
    select count(distinct c.page_id)::int as count
    from content c join pages p on p.id = c.page_id
    where c.space_id = ${spaceId}::uuid and ${knowledge(s, 'p')} and p.archived_at is not null and ${visible(s, 'c')} and ${current(s, 'c')}
  `;
  return count;
}

/**
 * Archives a page the person can see, or reopens it (spec §3): for everyone who sees it, recorded,
 * and nothing deleted. Undefined when there's no such page; false for one that isn't knowledge.
 */
export async function archivePage(s: Session, pageId: string, archived: boolean): Promise<boolean | undefined> {
  const page = await readPage(s, pageId);
  if (!page) return undefined;
  if (page.type === 'guidance' || page.type === 'skill' || page.type === 'overview') return false;
  await s.tx`select archive_page(${pageId}::uuid, ${archived})`;
  return true;
}

/** A knowledge page in a list, as the viewer sees it. */
export interface PageSummary {
  id: string;
  type: string | null;
  title: string;
  /** Its first item, for a glimpse of what it says. */
  excerpt: string | null;
  updatedAt: Date;
  /** Nobody else sees any of it. */
  onlyYou: boolean;
  /** How many pages it gathers that the viewer can see, which makes it a collection. */
  gathers: number;
  /** Listing a collection's pages: whether it's in the collection for everyone, or only for the viewer. */
  gatheredShared?: boolean;
}

export type PageOrder = 'recent' | 'name' | 'match';

/**
 * The knowledge pages in a space, as the viewer sees them, fifty at a time: optionally only those
 * matching a search or of one type. Everything, counts and dates included, comes only from what
 * the viewer can see. Also says how many pages there are in all, and of each type for filtering;
 * pages without a type show only unfiltered.
 */
export async function pagesIn(
  s: Session,
  spaceId: string,
  options: {
    query?: string;
    type?: string;
    order?: PageOrder;
    offset?: number;
    limit?: number;
    /** Only collections. */
    collections?: boolean;
    /** Only the pages this collection gathers. */
    in?: string;
    /** Only archived pages, instead of only the others. A collection lists both. */
    archived?: boolean;
  } = {},
): Promise<{ pages: PageSummary[]; total: number; all: number; types: { type: string; count: number }[]; archived: number }> {
  const terms = termsOf(options.query ?? '');
  const limit = options.limit ?? 50;
  const order = options.order === 'match' && !terms ? 'recent' : (options.order ?? (terms ? 'match' : 'recent'));
  // Archived pages show only on request, except in a collection, which lists what it gathers.
  const shelved = options.in ? s.tx`true` : options.archived ? s.tx`p.archived_at is not null` : s.tx`p.archived_at is null`;
  // Each page's title, first item, last change and best match, from the items the viewer sees now.
  const here = s.tx`
    select c.page_id as id,
           coalesce((array_agg(c.body order by c.private_to is null) filter (where c.kind = 'title'))[1], 'Untitled') as title,
           -- A replacement stands where what it replaced stood.
           (array_agg(c.body order by coalesce((select r.created_at from content r where r.id = c.supersedes), c.created_at))
             filter (where c.kind = 'text'))[1] as excerpt,
           max(c.updated_at) as updated_at,
           bool_and(c.private_to is not null) as only_you,
           ${terms ? s.tx`bool_or(c.search @@ to_tsquery('simple', ${terms}))` : s.tx`true`} as hit,
           ${terms
             ? s.tx`max(ts_rank(c.search, to_tsquery('simple', ${terms}), 1)) + coalesce(max(ts_rank(c.search, to_tsquery('simple', ${terms}), 1)) filter (where c.kind = 'title'), 0)`
             : s.tx`0`} as rank
    from content c
    join pages p on p.id = c.page_id
    where c.space_id = ${spaceId}::uuid and c.kind in ('title', 'text')
      and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')} and ${shelved}
    group by c.page_id
  `;
  const typed = options.type === undefined ? s.tx`true` : s.tx`p.type = ${options.type}`;
  // Only collections, which gather a page the viewer can see, or only what one collection gathers.
  const kept = options.in
    ? s.tx`exists (select from gathered g where g.collection_id = ${options.in}::uuid and g.page_id = h.id and ${visible(s, 'g')})`
    : options.collections
      ? s.tx`exists (select from gathered g where g.collection_id = h.id and ${seenGathering(s, 'g')})`
      : s.tx`true`;
  const sorted = { recent: s.tx`h.updated_at desc`, name: s.tx`lower(h.title), h.updated_at desc`, match: s.tx`h.rank desc, h.updated_at desc` }[order];
  const list = (offset: number) => s.tx<(Omit<PageSummary, 'gathers'> & { total: number })[]>`
    select h.id, p.type, h.title, h.excerpt, h.updated_at, h.only_you, count(*) over ()::int as total
    from (${here}) h
    join pages p on p.id = h.id
    where h.hit and ${typed} and ${kept}
    order by ${sorted}, h.id
    limit ${limit} offset ${offset}
  `;
  let rows = await list(Math.max(0, options.offset ?? 0));
  // Past the end, such as after the list got shorter, it starts again from the top.
  if (rows.length === 0 && (options.offset ?? 0) > 0) rows = await list(0);
  const types = await s.tx<{ type: string | null; count: number }[]>`
    select p.type, count(*)::int as count
    from (${here}) h
    join pages p on p.id = h.id
    where ${kept}
    group by p.type
    order by count(*) desc, p.type
  `;
  const gathers = await gatheredCounts(s, rows.map((row) => row.id));
  const archived = options.in || options.archived ? 0 : await archivedPages(s, spaceId);
  const sides = options.in && rows.length > 0
    ? new Map((await s.tx<{ pageId: string; shared: boolean }[]>`
        select g.page_id, bool_or(g.private_to is null) as shared from gathered g
        where g.collection_id = ${options.in}::uuid and g.page_id in ${s.tx(rows.map((row) => row.id))} and ${visible(s, 'g')}
        group by g.page_id
      `).map((row) => [row.pageId, row.shared]))
    : undefined;
  return {
    pages: rows.map(({ total: _, ...page }) => ({ ...page, gathers: gathers.get(page.id) ?? 0, ...(sides && { gatheredShared: sides.get(page.id) ?? false }) })),
    total: rows[0]?.total ?? 0,
    all: types.reduce((sum, { count }) => sum + count, 0),
    types: types.filter((entry): entry is { type: string; count: number } => entry.type !== null),
    archived,
  };
}

/** A gathering the viewer can see, of a page whose title they can see. */
function seenGathering(s: Session, table: string) {
  const g = s.tx(table);
  return s.tx`${visible(s, table)} and exists (
    select from content t where t.page_id = ${g}.page_id and t.kind = 'title' and ${visible(s, 't')}
  )`;
}

/** How many pages each of these gathers, as far as the viewer can see. */
async function gatheredCounts(s: Session, pageIds: string[]): Promise<Map<string, number>> {
  if (pageIds.length === 0) return new Map();
  const rows = await s.tx<{ collectionId: string; count: number }[]>`
    select g.collection_id, count(distinct g.page_id)::int as count
    from gathered g
    where g.collection_id in ${s.tx(pageIds)} and ${seenGathering(s, 'g')}
    group by g.collection_id
  `;
  return new Map(rows.map((row) => [row.collectionId, row.count]));
}

/**
 * Puts a page in a collection, on the shared side or the writer's own. Both are knowledge pages
 * in the same space that the writer can see, and a shared gathering joins two shared pages. The
 * store checks the same. Gathering a page that's already there does nothing.
 */
export async function gather(s: Session, input: { collectionId: string; pageId: string; shared?: boolean }): Promise<boolean> {
  const privateTo = sideOf(s, input.shared);
  const pages = await s.tx<{ id: string; spaceId: string; type: string | null; shared: boolean }[]>`
    select p.id, p.space_id, p.type, bool_or(t.private_to is null) as shared
    from pages p
    join content t on t.page_id = p.id and t.kind = 'title' and ${visible(s, 't')}
    where p.id in (${input.collectionId}::uuid, ${input.pageId}::uuid)
    group by p.id
  `;
  if (pages.length < 2 || input.collectionId === input.pageId || pages.some((page) => ['guidance', 'skill'].includes(page.type ?? ''))) {
    throw new AccessDenied('There is no page with that reference that you can see.');
  }
  if (pages[0].spaceId !== pages[1].spaceId) throw new AccessDenied('A collection gathers pages from its own space.');
  await checkSpace(s, pages[0].spaceId, input.shared);
  if (input.shared && !pages.every((page) => page.shared)) {
    throw new AccessDenied('Only you see one of those pages, so only you can put it in a collection.');
  }
  const added = await s.tx`
    insert into gathered (collection_id, page_id, space_id, private_to)
    values (${input.collectionId}::uuid, ${input.pageId}::uuid, ${pages[0].spaceId}::uuid, ${privateTo}::uuid)
    on conflict do nothing
    returning collection_id
  `;
  return added.length > 0;
}

/** Takes a page out of a collection, on the side given. The page itself stays. Says whether it was there. */
export async function ungather(s: Session, input: { collectionId: string; pageId: string; shared?: boolean }): Promise<boolean> {
  const privateTo = input.shared ? null : (personOf(s.principal) ?? null);
  const removed = await s.tx`
    delete from gathered g
    where g.collection_id = ${input.collectionId}::uuid and g.page_id = ${input.pageId}::uuid
      and g.private_to is not distinct from ${privateTo}::uuid and ${visible(s, 'g')}
    returning g.page_id
  `;
  return removed.length > 0;
}

/** A page as it sits among others: the collections it's in, and the pages that mention it. */
export async function linksOf(s: Session, pageId: string) {
  const collections = await s.tx<{ id: string; title: string; shared: boolean }[]>`
    select g.collection_id as id, ${titleOf(s, s.tx`g.collection_id`)} as title, bool_or(g.private_to is null) as shared
    from gathered g
    where g.page_id = ${pageId}::uuid and ${visible(s, 'g')}
      and exists (select from content t where t.page_id = g.collection_id and t.kind = 'title' and ${visible(s, 't')})
    group by g.collection_id
    order by 2
  `;
  // Mentions are links in what the page's space says about it, as each viewer sees it.
  const mentionedOn = await s.tx<{ id: string; title: string }[]>`
    select distinct c.page_id as id, ${titleOf(s, s.tx`c.page_id`)} as title
    from content c
    join pages p on p.id = c.page_id
    where c.space_id = (select space_id from pages where id = ${pageId}::uuid) and c.page_id <> ${pageId}::uuid
      and c.kind = 'text' and c.body like ${`%page:${pageId}%`}
      and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')}
    order by 2
  `;
  return { collections, mentionedOn };
}

/** A space's written overview as the viewer sees it, or undefined when nobody they can see has written one. */
export async function overviewOf(s: Session, spaceId: string): Promise<Page | undefined> {
  const [page] = await s.tx<{ id: string }[]>`select id from pages where space_id = ${spaceId}::uuid and type = 'overview'`;
  return page ? readPage(s, page.id) : undefined;
}

/** The longest an overview may be: a short summary, not a page. */
export const overviewLength = 2_000;

/**
 * Writes a space's overview. Shared, it corrects the shared overview for everyone, or starts it.
 * Your own corrects yours, or explicitly replaces the shared one for you, or starts yours. An
 * assistant never replaces what a person wrote, so its version then sits beside it instead.
 */
export async function writeOverview(s: Session, input: { spaceId: string; text: string; shared?: boolean }): Promise<Item> {
  await checkSpace(s, input.spaceId, input.shared);
  const [{ page }] = await s.tx<{ page: string }[]>`select overview_page(${input.spaceId}::uuid) as page`;
  const items = (await readPage(s, page))?.items ?? [];
  const me = personOf(s.principal) ?? null;
  const shared = items.find((item) => item.privateTo === null);
  const mine = items.find((item) => item.privateTo !== null && item.privateTo === me);
  if (input.shared) {
    if (shared) return (await updateItem(s, shared.id, { body: input.text }))!;
    return insertItem(s, { pageId: page, spaceId: input.spaceId, privateTo: null, kind: 'text', body: input.text });
  }
  if (mine) return (await updateItem(s, mine.id, { body: input.text }))!;
  const replaceable = shared && (s.principal.agent === undefined || shared.agent !== null || shared.writtenBy === null);
  if (shared && replaceable) return (await supersedeItem(s, shared.id, { body: input.text }))!;
  return insertItem(s, { pageId: page, spaceId: input.spaceId, privateTo: sideOf(s), kind: 'text', body: input.text });
}

/** A change to knowledge, as the viewer sees it, for what changed lately. */
export interface Change {
  itemId: string;
  pageId: string;
  spaceId: string;
  /** The page's title, as the viewer sees it. */
  title: string;
  text: string;
  /** Added, replacing what was true, or corrected where it stood. */
  kind: 'added' | 'updated' | 'corrected';
  /** The first thing on its page, which makes it a new page. */
  newPage: boolean;
  /** On the space's overview rather than a page. */
  overview: boolean;
  writtenBy: string | null;
  agent: string | null;
  at: Date;
  onlyYou: boolean;
}

/**
 * What changed lately in everything the viewer can see, newest first: knowledge added, updated or
 * corrected, never rules, skills or what's no longer true. Says whether there's more after these.
 */
export async function recentChanges(s: Session, options: { offset?: number; limit?: number } = {}): Promise<{ changes: Change[]; more: boolean }> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit ?? 50;
  // The newest items first, then only those still current: checked per item, behind the fence,
  // since checking it for the whole store at once is slow. Replaced items are few, so a margin covers them.
  const rows = await s.tx<(Change & { total: number })[]>`
    select item_id, page_id, space_id, title, text, kind, new_page and not overview as new_page, written_by, agent, at, only_you, overview from (
      select c.id as item_id, c.page_id, c.space_id, ${titleOf(s, s.tx`c.page_id`)} as title, c.body as text,
             -- Corrected means it has an earlier version; its timestamps alone can differ by a moment when it's written.
             case when c.supersedes is not null then 'updated'
                  when exists (select from revisions r where r.content_id = c.id and ${visible(s, 'r')}) then 'corrected'
                  else 'added' end as kind,
             c.supersedes is null and not exists (
               select from content o where o.page_id = c.page_id and o.kind = 'text' and o.created_at < c.created_at and ${visible(s, 'o')}
             ) as new_page,
             -- Shared from someone's own side, it's new when it was shared.
             c.written_by, c.agent, greatest(c.updated_at, coalesce(c.published_at, c.updated_at)) as at, c.private_to is not null as only_you,
             (select p.type from pages p where p.id = c.page_id) is not distinct from 'overview' as overview,
             ${current(s, 'c')} as is_current,
             ${agreesWithShared(s, 'c')} as agrees_with_shared
      from content c
      where c.kind = 'text' and ${visible(s, 'c')}
      order by greatest(c.updated_at, coalesce(c.published_at, c.updated_at)) desc
      limit ${offset + limit * 2 + 50}
      offset 0
    ) recent
    where is_current and not agrees_with_shared
    order by at desc
    limit ${limit + 1} offset ${offset}
  `;
  return { changes: rows.slice(0, limit), more: rows.length > limit };
}

/** A source in a list, as the viewer sees it. */
export interface SourceSummary {
  id: string;
  reference: string | null;
  excerpt: string;
  createdAt: Date;
  /** Only the viewer has it. */
  onlyYou: boolean;
  /** How many pages the viewer sees it used on. */
  pages: number;
}

/**
 * The sources kept in a space that the viewer can see, newest first or best match, fifty at a
 * time, with how many pages use each. Also says how many there are in all.
 */
export async function sourcesIn(
  s: Session,
  spaceId: string,
  options: { query?: string; offset?: number; limit?: number } = {},
): Promise<{ sources: SourceSummary[]; total: number; all: number }> {
  const terms = termsOf(options.query ?? '');
  const limit = options.limit ?? 50;
  const matching = terms ? s.tx`and src.search @@ to_tsquery('simple', ${terms})` : s.tx``;
  const order = terms ? s.tx`ts_rank(src.search, to_tsquery('simple', ${terms}), 1) desc, src.created_at desc` : s.tx`src.created_at desc`;
  const list = (offset: number) => s.tx<(Omit<SourceSummary, 'pages'> & { total: number })[]>`
    select src.id, src.reference, src.excerpt, src.created_at, src.private_to is not null as only_you, count(*) over ()::int as total
    from sources src
    where src.space_id = ${spaceId}::uuid and ${visible(s, 'src')} ${matching}
    order by ${order}, src.id
    limit ${limit} offset ${offset}
  `;
  let rows = await list(Math.max(0, options.offset ?? 0));
  if (rows.length === 0 && (options.offset ?? 0) > 0) rows = await list(0);
  // Counted only for the ones shown, from the items the viewer sees now.
  const used = rows.length === 0 ? [] : await s.tx<{ sourceId: string; pages: number }[]>`
    select ci.source_id, count(distinct c.page_id)::int as pages
    from citations ci
    join content c on c.id = ci.content_id
    join pages p on p.id = c.page_id
    where ci.source_id in ${s.tx(rows.map((row) => row.id))} and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')}
    group by ci.source_id
  `;
  const [{ all }] = await s.tx<{ all: number }[]>`
    select count(*)::int as all from sources src where src.space_id = ${spaceId}::uuid and ${visible(s, 'src')}
  `;
  return {
    sources: rows.map(({ total: _, ...row }) => ({ ...row, pages: used.find((entry) => entry.sourceId === row.id)?.pages ?? 0 })),
    total: rows[0]?.total ?? 0,
    all,
  };
}

/**
 * A source as the viewer sees it: what was kept of it, who kept it, and the items that rest on
 * it, by page, only those the viewer can see and that are still current.
 */
export async function sourceView(s: Session, sourceId: string) {
  const [source] = await s.tx<(Source & { writtenBy: string | null; agent: string | null; createdAt: Date })[]>`
    select ${sourceColumns(s)}, written_by, agent, created_at from sources where id = ${sourceId}::uuid and ${visible(s, 'sources')}
  `;
  if (!source) return undefined;
  const uses = await s.tx<{ pageId: string; title: string | null; itemId: string; body: string; privateTo: string | null }[]>`
    select c.page_id, ${titleOf(s, s.tx`c.page_id`)} as title, c.id as item_id, c.body, c.private_to
    from citations ci
    join content c on c.id = ci.content_id
    join pages p on p.id = c.page_id
    where ci.source_id = ${sourceId}::uuid and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')}
    order by c.created_at
  `;
  return { ...source, uses };
}

/** Earlier versions of these items that the viewer can see, oldest first. */
export async function historyOf(s: Session, itemIds: string[]): Promise<(Revision & { itemId: string })[]> {
  if (itemIds.length === 0) return [];
  return s.tx<(Revision & { itemId: string })[]>`
    select content_id as item_id, body, written_by, agent, written_at, replaced_at
    from revisions
    where content_id in ${s.tx(itemIds)} and ${visible(s, 'revisions')}
    order by replaced_at
  `;
}

/** Search terms for full-text search: longer words match by how they start, so "launch" finds "launches". */
function termsOf(query: string): string | undefined {
  // Letters with their accents and marks, as one word, and at most 32 words.
  const words = query.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 32);
  return words ? words.map((word) => (word.length >= 4 ? `${word}:*` : word)).join(' | ') : undefined;
}

/**
 * Searches items and sources the viewer can see, optionally within a space
 * and the spaces below it, and optionally only knowledge, without guidance.
 * Longer words match by how they start, so "launch" finds "launches"; short
 * ones match only whole words. Shorter texts rank higher, and items that are
 * no longer true come last, or not at all when only current knowledge is
 * wanted.
 */
export async function search(
  s: Session,
  query: string,
  options: { spaceId?: string; limit?: number; current?: boolean; knowledge?: boolean; only?: 'content' | 'sources' } = {},
): Promise<Hit[]> {
  const terms = termsOf(query);
  if (!terms) return [];
  const within = (table: string) =>
    options.spaceId
      ? s.tx`and ${s.tx(table)}.space_id in (select space_subtree(${options.spaceId}::uuid))`
      : s.tx``;

  // A match in a skill's current files finds the skill, once.
  return s.tx<Hit[]>`
    select kind, id, space_id, page_id, page_type, title, text, private, superseded, archived, updates_shared, item_kind from (
    select distinct on (kind, id) * from (
      select case when c.kind in ('title', 'file') then 'page' else 'item' end as kind,
             case when c.kind in ('title', 'file') then c.page_id else c.id end as id,
             c.space_id, c.page_id, (select p.type from pages p where p.id = c.page_id) as page_type, ${titleOf(s, s.tx`c.page_id`)} as title,
             case c.kind when 'file' then ${titleOf(s, s.tx`c.page_id`)} else c.body end as text,
             c.private_to is not null as private, not ${current(s, 'c')} as superseded,
             coalesce((select p.archived_at is not null from pages p where p.id = c.page_id), false) as archived,
             c.private_to is not null and c.supersedes is not null and exists (
               select from content r where r.id = first_of(c.id) and r.private_to is null and ${visible(s, 'r')}
             ) as updates_shared,
             ts_rank(c.search, to_tsquery('simple', ${terms}), 1) as rank, c.kind as item_kind,
             ${agreesWithShared(s, 'c')} as agrees_with_shared
      -- Each match's page is looked up on its own: joining all pages would check access to every page first.
      from content c
      where c.search @@ to_tsquery('simple', ${terms}) and ${visibleContent(s, 'c')} ${within('c')}
        and ${options.only !== 'sources'}
      union all
      select 'source', src.id, src.space_id, null, null, src.reference, src.excerpt, src.private_to is not null, false, false, false,
             ts_rank(src.search, to_tsquery('simple', ${terms}), 1), null, false
      from sources src
      where src.search @@ to_tsquery('simple', ${terms}) and ${visible(s, 'src')} ${within('src')} and ${options.only !== 'content'}
      -- Keeps the filters below out of this query, where they'd be run over every item first.
      offset 0
    ) hits
    -- A skill's file that's no longer current doesn't find it. Only knowledge leaves out rules and skills.
    -- Your own original shows as one with what you shared from it while they agree.
    where not (${options.current ?? false} and superseded) and not (item_kind = 'file' and superseded) and not agrees_with_shared
      and not (${options.knowledge ?? false} and coalesce(page_type, '') in ('guidance', 'skill'))
    order by kind, id, superseded, rank desc
    ) best
    order by superseded, rank desc
    limit ${options.limit ?? 20}
  `;
}

export function itemColumns(s: Session, table?: string) {
  if (!table) return s.tx`id, page_id, space_id, kind, path, private_to, body, written_by, agent, supersedes, reaches_down, published_from, published_by, published_at, created_at, updated_at`;
  const t = s.tx(table);
  return s.tx`${t}.id, ${t}.page_id, ${t}.space_id, ${t}.kind, ${t}.path, ${t}.private_to, ${t}.body, ${t}.written_by, ${t}.agent, ${t}.supersedes, ${t}.reaches_down, ${t}.published_from, ${t}.published_by, ${t}.published_at, ${t}.created_at, ${t}.updated_at`;
}

function sourceColumns(s: Session) {
  return s.tx`id, space_id, private_to, reference, excerpt`;
}

export async function insertItem(
  s: Session,
  item: Pick<Item, 'pageId' | 'spaceId' | 'privateTo' | 'kind' | 'body'> & {
    supersedes?: string;
    sources?: string[];
    reachesDown?: boolean;
    path?: string | null;
  },
): Promise<Item> {
  const [inserted] = await s.tx<Item[]>`
    insert into content (page_id, space_id, private_to, kind, path, body, supersedes, reaches_down)
    values (${item.pageId}::uuid, ${item.spaceId}::uuid, ${item.privateTo}::uuid, ${item.kind}, ${item.path ?? null},
            ${item.body}, ${item.supersedes ?? null}::uuid, ${item.reachesDown ?? false})
    returning ${itemColumns(s)}
  `;
  await cite(s, inserted.id, item.sources);
  return inserted;
}

/** The item, if the viewer can see it and may change it. */
async function changeableItem(s: Session, itemId: string): Promise<Item | undefined> {
  const [item] = await s.tx<Item[]>`
    select ${itemColumns(s)} from content where id = ${itemId}::uuid and ${visible(s, 'content')}
  `;
  if (!item) return undefined;
  const replacement = await replacementOf(s, itemId);
  if (replacement) {
    throw new AccessDenied(`That item is no longer current. It was replaced by item:${replacement.id}.`);
  }
  if (s.principal.agent !== undefined && item.writtenBy && item.agent === null) {
    throw new AccessDenied(
      'Agents never change what people wrote. Save what you found as a new item on the same page, and point out the difference to the user.',
    );
  }
  return item;
}

/** The item that replaced this one, as far as the viewer can see. */
async function replacementOf(s: Session, itemId: string): Promise<{ id: string; at: Date } | undefined> {
  const [replacement] = await s.tx<{ id: string; at: Date }[]>`
    select id, created_at as at from content
    where supersedes = ${itemId}::uuid and ${visibleContent(s, 'content')}
    order by created_at
    limit 1
  `;
  return replacement;
}

async function cite(s: Session, itemId: string, sourceIds: string[] = []) {
  if (sourceIds.length === 0) return;
  const found = await s.tx`select id from sources where id in ${s.tx(sourceIds)} and ${visible(s, 'sources')}`;
  if (found.length !== new Set(sourceIds).size) {
    throw new AccessDenied('One of the sources has no reference that you can see.');
  }
  const rows = sourceIds.map((sourceId) => ({ content_id: itemId, source_id: sourceId }));
  await s.tx`insert into citations ${s.tx(rows)} on conflict do nothing`;
}

/** Which side a write goes to: shared, or the person's own private side. */
export function sideOf(s: Session, shared = false): string | null {
  if (shared) return null;
  const person = personOf(s.principal);
  if (!person) throw new AccessDenied('A space has no private side.');
  return person;
}

export async function checkSpace(s: Session, spaceId: string, shared = false) {
  const [space] = await s.tx<{ personal: boolean }[]>`
    select private_to is not null as personal
    from spaces
    where id = ${spaceId}::uuid and id in (${accessibleSpaces(s)})
  `;
  if (!space) throw new AccessDenied('There is no space with that reference that you can see.');
  if (space.personal && shared) throw new AccessDenied('Spaces in a personal tree have no shared side.');
}

/**
 * Rows the viewer can see: the shared side of spaces they can access, and
 * their own private side. Row-level security applies the same rule.
 */
export function visible(s: Session, table: string) {
  const t = s.tx(table);
  return s.tx`
    ${t}.space_id in (${accessibleSpaces(s)})
    and (${t}.private_to is null or ${t}.private_to = ${personOf(s.principal) ?? null}::uuid)
  `;
}

/**
 * Items the viewer can see: the visible ones, plus shared guidance that
 * reaches them from a space above, even one they can't open. Only for
 * reading; writes need the space itself.
 */
export function visibleContent(s: Session, table: string) {
  const t = s.tx(table);
  return s.tx`(
    ${visible(s, table)}
    or (${t}.reaches_down and ${t}.private_to is null and ${t}.space_id in (select guidance_reach()))
  )`;
}

/** Your private original, which shows as one with what you shared from it while they agree (spec §5). */
export function agreesWithShared(s: Session, table: string) {
  const t = s.tx(table);
  return s.tx`(${t}.private_to is not null and exists (
    select from content shared
    where shared.published_from = ${t}.id and shared.private_to is null and shared.body = ${t}.body
      and ${visible(s, 'shared')} and ${current(s, 'shared')}
  ))`;
}

/** Items that nothing the viewer can see has replaced or removed. */
export function current(s: Session, table: string) {
  return s.tx`not exists (
    select from content replacement
    where replacement.supersedes = ${s.tx(table)}.id and ${visibleContent(s, 'replacement')}
  )`;
}

/** Knowledge pages, not guidance, skills, or a space's overview, which shows on its own. */
export function knowledge(s: Session, table: string) {
  return s.tx`coalesce(${s.tx(table)}.type, '') not in ('guidance', 'skill', 'overview')`;
}

/** The page's title as the viewer sees it: their own if they named it, otherwise the shared one. */
function titleOf(s: Session, pageId: ReturnType<Session['tx']>) {
  return s.tx`(
    select t.body from content t
    where t.page_id = ${pageId} and t.kind = 'title' and ${visibleContent(s, 't')}
    order by t.private_to is null
    limit 1
  )`;
}

/**
 * The sources an item rests on, as the viewer can see them. With its origin, what you shared also
 * shows the sources of your own private original, which only you see (spec §5).
 */
function citationsOf(s: Session, withOrigin = false) {
  return s.tx`coalesce((
    select json_agg(json_build_object('id', src.id, 'reference', src.reference, 'excerpt', src.excerpt, 'shared', src.private_to is null)
                    order by src.created_at)
    from sources src
    where src.id in (
      select ci.source_id from citations ci
      where ci.content_id = content.id ${withOrigin ? s.tx`or ci.content_id = content.published_from` : s.tx``}
    ) and ${visible(s, 'src')}
  ), '[]')`;
}
