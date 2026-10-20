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
  /** When anything the viewer sees on it last changed. */
  updatedAt: Date;
  /** The current items, each with its sources and the earlier item it replaced, if any. */
  items: (Item & { sources: Citation[]; replaced: Replaced | null })[];
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
  /** A private item that replaced a shared one, which others still see. */
  updatesShared: boolean;
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
  const items = await s.tx<Page['items']>`
    with recursive chain (id, first) as (
      select c.id, c.id from content c
      where c.page_id = ${pageId}::uuid and c.supersedes is null and ${visibleContent(s, 'c')}
      union all
      select c.id, chain.first from content c join chain on c.supersedes = chain.id
      where c.page_id = ${pageId}::uuid and ${visibleContent(s, 'c')}
    )
    select ${itemColumns(s, 'content')}, ${citationsOf(s)} as sources, (
      -- Whoever can see a replacement can see what it replaced.
      select json_build_object('id', r.id, 'body', r.body, 'shared', r.private_to is null)
      from content r
      where r.id = content.supersedes
    ) as replaced
    from content
    left join chain on chain.id = content.id
    left join content first on first.id = chain.first
    where content.page_id = ${pageId}::uuid and content.kind <> 'removed' and ${visibleContent(s, 'content')} and ${current(s, 'content')}
    order by coalesce(first.created_at, content.created_at), content.created_at
  `;
  if (items.length === 0) return undefined;
  const [{ type }] = await s.tx`select type from pages where id = ${pageId}::uuid`;
  // Your own title for a page comes before the shared one.
  const titles = items.filter((item) => item.kind === 'title').sort((a, b) => Number(!a.privateTo) - Number(!b.privateTo));
  return {
    id: pageId,
    spaceId: items[0].spaceId,
    type,
    title: titles[0]?.body ?? 'Untitled',
    updatedAt: new Date(Math.max(...items.map((item) => item.updatedAt.getTime()))),
    items: items.filter((item) => item.kind !== 'title'),
  };
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
    where c.space_id = ${spaceId}::uuid and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')}
    group by c.page_id, p.type
    order by updated_at desc
  `;
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
  options: { query?: string; type?: string; order?: PageOrder; offset?: number; limit?: number } = {},
): Promise<{ pages: PageSummary[]; total: number; all: number; types: { type: string; count: number }[] }> {
  const terms = termsOf(options.query ?? '');
  const limit = options.limit ?? 50;
  const order = options.order === 'match' && !terms ? 'recent' : (options.order ?? (terms ? 'match' : 'recent'));
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
      and ${knowledge(s, 'p')} and ${visible(s, 'c')} and ${current(s, 'c')}
    group by c.page_id
  `;
  const typed = options.type === undefined ? s.tx`true` : s.tx`p.type = ${options.type}`;
  const sorted = { recent: s.tx`h.updated_at desc`, name: s.tx`lower(h.title), h.updated_at desc`, match: s.tx`h.rank desc, h.updated_at desc` }[order];
  const list = (offset: number) => s.tx<(PageSummary & { total: number })[]>`
    select h.id, p.type, h.title, h.excerpt, h.updated_at, h.only_you, count(*) over ()::int as total
    from (${here}) h
    join pages p on p.id = h.id
    where h.hit and ${typed}
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
    group by p.type
    order by count(*) desc, p.type
  `;
  return {
    pages: rows.map(({ total: _, ...page }) => page),
    total: rows[0]?.total ?? 0,
    all: types.reduce((sum, { count }) => sum + count, 0),
    types: types.filter((entry): entry is { type: string; count: number } => entry.type !== null),
  };
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
  const words = query.match(/[\p{L}\p{N}]+/gu);
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
  options: { spaceId?: string; limit?: number; current?: boolean; knowledge?: boolean } = {},
): Promise<Hit[]> {
  const terms = termsOf(query);
  if (!terms) return [];
  const within = (table: string) =>
    options.spaceId
      ? s.tx`and ${s.tx(table)}.space_id in (select space_subtree(${options.spaceId}::uuid))`
      : s.tx``;

  // A match in a skill's current files finds the skill, once.
  return s.tx<Hit[]>`
    select kind, id, space_id, page_id, page_type, title, text, private, superseded, updates_shared from (
    select distinct on (kind, id) * from (
      select case when c.kind in ('title', 'file') then 'page' else 'item' end as kind,
             case when c.kind in ('title', 'file') then c.page_id else c.id end as id,
             c.space_id, c.page_id, p.type as page_type, ${titleOf(s, s.tx`c.page_id`)} as title,
             case c.kind when 'file' then ${titleOf(s, s.tx`c.page_id`)} else c.body end as text,
             c.private_to is not null as private, not ${current(s, 'c')} as superseded,
             c.private_to is not null and exists (
               select from content r where r.id = c.supersedes and r.private_to is null and ${visible(s, 'r')}
             ) as updates_shared,
             ts_rank(c.search, to_tsquery('simple', ${terms}), 1) as rank
      from content c
      join pages p on p.id = c.page_id
      where c.search @@ to_tsquery('simple', ${terms}) and ${visibleContent(s, 'c')} ${within('c')}
        and ${options.knowledge ? knowledge(s, 'p') : s.tx`true`}
        and (c.kind <> 'file' or ${current(s, 'c')})
      union all
      select 'source', src.id, src.space_id, null, null, src.reference, src.excerpt, src.private_to is not null, false, false,
             ts_rank(src.search, to_tsquery('simple', ${terms}), 1)
      from sources src
      where src.search @@ to_tsquery('simple', ${terms}) and ${visible(s, 'src')} ${within('src')}
    ) hits
    where not (${options.current ?? false} and superseded)
    order by kind, id, superseded, rank desc
    ) best
    order by superseded, rank desc
    limit ${options.limit ?? 20}
  `;
}

export function itemColumns(s: Session, table?: string) {
  if (!table) return s.tx`id, page_id, space_id, kind, path, private_to, body, written_by, agent, supersedes, reaches_down, created_at, updated_at`;
  const t = s.tx(table);
  return s.tx`${t}.id, ${t}.page_id, ${t}.space_id, ${t}.kind, ${t}.path, ${t}.private_to, ${t}.body, ${t}.written_by, ${t}.agent, ${t}.supersedes, ${t}.reaches_down, ${t}.created_at, ${t}.updated_at`;
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

/** Items that nothing the viewer can see has replaced or removed. */
export function current(s: Session, table: string) {
  return s.tx`not exists (
    select from content replacement
    where replacement.supersedes = ${s.tx(table)}.id and ${visibleContent(s, 'replacement')}
  )`;
}

/** Knowledge pages, not guidance or skills. */
export function knowledge(s: Session, table: string) {
  return s.tx`coalesce(${s.tx(table)}.type, '') not in ('guidance', 'skill')`;
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

function citationsOf(s: Session) {
  return s.tx`coalesce((
    select json_agg(json_build_object('id', src.id, 'reference', src.reference, 'excerpt', src.excerpt)
                    order by src.created_at)
    from citations ci
    join sources src on src.id = ci.source_id
    where ci.content_id = content.id and ${visible(s, 'src')}
  ), '[]')`;
}
