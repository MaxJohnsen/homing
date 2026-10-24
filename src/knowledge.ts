import { randomUUID } from 'node:crypto';
import type { Audience } from './connectors.ts';
import { AccessDenied, personOf, type Session } from './db.ts';
import { accessibleSpaces, listSpaces, type Space } from './spaces.ts';

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
  /**
   * The assistant that made its latest change for the person who wrote it, who stays its author
   * (spec §3), or null when they made it themselves.
   */
  editAgent: string | null;
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
  /** Where it came from, if it was imported. */
  imported: Imported | null;
}

/** Someone named in an import: their key in the export it came in, and their name there. Nobody here. */
export interface ImportedPerson {
  person: string | null;
  name: string | null;
}

/** Who did something before it was imported: a person, an agent for a person, or a routine. */
export interface ImportedAuthor extends ImportedPerson {
  by: 'person' | 'agent' | 'routine';
  agent: string | null;
}

/**
 * Something that came in an import: the import, its id in the export, and, while it still says what
 * it said there, who wrote it. Nobody here is credited with it.
 */
export interface Imported {
  import: string;
  id?: string;
  author?: ImportedAuthor;
  /** Who shared it there, for a shared copy of someone's own item. */
  publishedBy?: ImportedPerson;
  /** How many sources it rested on there that the export didn't hold. */
  sourcesElsewhere?: number;
}

/** Who wrote it before it was imported, while it still says what they wrote. */
export function importedAuthor(imported: Imported | null | undefined): ImportedAuthor | null {
  return imported?.author ?? null;
}

/**
 * Whether a person wrote it, here or before it was imported, so agents never rewrite it, except
 * the person's own assistant on their private side (ownText).
 */
export function byPerson(written: { writtenBy: string | null; agent: string | null; imported: Imported | null }): boolean {
  return (written.writtenBy !== null && written.agent === null) || importedAuthor(written.imported)?.by === 'person';
}

/**
 * Whether it's text the person wrote themselves here, which their assistant may change for them,
 * and which stays theirs (spec §3): on their private side where it is, and on the shared side as
 * their own update of it. Homing can't tell whether they asked: it allows this only because the
 * change is private, recorded and can be undone. What someone wrote before it was imported is never
 * theirs, whatever the name.
 */
export function ownText(s: Session, item: Pick<Item, 'kind' | 'privateTo' | 'writtenBy' | 'agent' | 'imported'>, side: 'private' | 'shared' = 'private'): boolean {
  const me = personOf(s.principal);
  const there = side === 'private' ? item.privateTo === me : item.privateTo === null;
  return me !== undefined && there && item.kind === 'text' && item.writtenBy === me && item.agent === null && !importedAuthor(item.imported);
}

export interface Source {
  id: string;
  spaceId: string;
  privateTo: string | null;
  reference: string | null;
  excerpt: string;
  /** The connection Homing read it through, when it read it itself, such as an email in the person's mailbox. */
  readThrough: string | null;
}

export type Citation = Pick<Source, 'id' | 'reference' | 'excerpt' | 'readThrough'>;

export interface Page {
  id: string;
  spaceId: string;
  type: string | null;
  title: string;
  /** Whether it's on the space's shared side, with a title everyone there sees. */
  shared: boolean;
  /** When anything the viewer sees on it last changed. */
  updatedAt: Date;
  /**
   * When it was archived and by whom, if it is. Archived by someone else before the viewer could
   * first see the page, it's archived since then, by nobody named (spec §3).
   */
  archived: { at: Date; by: string | null; since: boolean } | null;
  /** The current items, each with its sources and the earlier item it replaced, if any. */
  items: (Item & { sources: Citation[]; replaced: Replaced | null })[];
}

/** What an item replaced. When your private update replaced a shared item, others still see that one. */
export interface Replaced {
  id: string;
  body: string;
  /** Whether it's shared and nothing shared has replaced it, so it's what everyone else sees. */
  shared: boolean;
}

export interface Revision {
  body: string;
  writtenBy: string | null;
  agent: string | null;
  /** The assistant that made this version for the person who wrote the item, if one did. */
  editAgent: string | null;
  writtenAt: Date;
  replacedAt: Date;
  imported: Imported | null;
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
  /** Your private update of a shared item, which others still see. */
  updatesShared: boolean;
  /** A shared item that only your own private update replaced, so others still see it. */
  replacedForYou: boolean;
  /** What the matching content is: a title, knowledge, a rule or a skill's file. Null for a source. */
  itemKind: string | null;
  /** Who wrote the matching content, and through which agent, as on an item. Null for a source. */
  writtenBy: string | null;
  agent: string | null;
  editAgent: string | null;
  imported: Imported | null;
  /** A source Homing read itself, such as an email in the person's mailbox. */
  readByHoming: boolean;
}

/**
 * Keeps where knowledge came from, without giving it a page yet. The same source is kept once.
 * One Homing read itself, such as an email, names the connection it read it through, and who could
 * see it there, where Homing knows.
 */
export async function addSource(
  s: Session,
  input: { spaceId: string; excerpt: string; reference?: string; shared?: boolean; readThrough?: string; audience?: Exclude<Audience, 'unknown'> | null },
): Promise<Source> {
  const privateTo = sideOf(s, input.shared);
  await checkSpace(s, input.spaceId, input.shared);
  const [existing] = await s.tx<Source[]>`
    select ${sourceColumns(s)} from sources
    where space_id = ${input.spaceId}::uuid and private_to is not distinct from ${privateTo}::uuid
      and excerpt = ${input.excerpt} and reference is not distinct from ${input.reference ?? null}
      and read_through is not distinct from ${input.readThrough ?? null}::uuid
  `;
  if (existing) return existing;
  const [source] = await s.tx<Source[]>`
    insert into sources (space_id, private_to, reference, excerpt, read_through, audience)
    values (
      ${input.spaceId}::uuid, ${privateTo}::uuid, ${input.reference ?? null}, ${input.excerpt}, ${input.readThrough ?? null}::uuid,
      ${input.audience ? s.tx.json(input.audience as never) : null}::jsonb
    )
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

/** A title or a type as a page keeps it: one line, with single spaces, however it was written. */
export function oneLineTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
  await s.tx`insert into pages (id, space_id, type) values (${id}::uuid, ${input.spaceId}::uuid, ${input.type === undefined ? null : oneLineTitle(input.type) || null})`;
  await insertItem(s, { pageId: id, spaceId: input.spaceId, privateTo, kind: 'title', body: oneLineTitle(input.title) || 'Untitled' });
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

/**
 * An item's new text: given whole, or made from the text it has when it changes, such as by
 * replacing one passage of a long document (spec §3).
 */
export type NewText = string | ((current: string) => string);

/** A change to part of an item: the exact text to replace, and what it becomes. */
export interface Edit {
  old: string;
  new: string;
}

/**
 * Makes edits to a text, in order, each to the one place its text is once the edits before it are
 * made. A passage is matched exactly, and only when it isn't there that way, in NFC, so the same
 * characters match however they were typed: only then is the text kept in NFC, so an exact edit
 * changes nothing outside its passages. Gives the new text, or which edit can't be made, and why.
 */
export function applyEdits(text: string, edits: Edit[]): { text: string } | { edit: number; problem: 'empty' | 'missing' | 'twice' } {
  let nfc = false;
  for (const [index, edit] of edits.entries()) {
    if (!edit.old) return { edit: index, problem: 'empty' };
    let old = edit.old;
    let at = text.indexOf(old);
    if (at === -1) {
      const normal = text.normalize('NFC');
      old = old.normalize('NFC');
      at = normal.indexOf(old);
      if (at === -1) return { edit: index, problem: 'missing' };
      text = normal;
      nfc = true;
    }
    if (text.includes(old, at + 1)) return { edit: index, problem: 'twice' };
    text = text.slice(0, at) + edit.new + text.slice(at + old.length);
  }
  return { text: nfc ? text.normalize('NFC') : text };
}

/** Text longer than its item keeps, such as an overview over 2,000 characters. */
export class TooLong extends Error {}

/**
 * Rewrites an item. What it said before stays in its history. Something of yours that you shared
 * as a copy is the copy from then on, so rewriting it is your own update of the copy, resting on
 * what yours did, which others don't see until you share it (spec §5). An assistant never rewrites
 * what everyone sees: its change to something shared is the person's own update of it, as
 * replacing it is.
 */
export async function updateItem(
  s: Session,
  itemId: string,
  input: { body: NewText; sources?: string[] },
): Promise<Item | undefined> {
  const original = await changeableItem(s, itemId, 'update');
  if (!original) return undefined;
  const me = personOf(s.principal);
  const shared = original.privateTo ? await sharedNowAs(s, itemId) : undefined;
  if (shared === itemId || (original.privateTo === null && s.principal.agent !== undefined && me)) {
    // Everyone sees it, so yours is an update of it. Something you shared by moving it, meanwhile
    // or before, still rests on what it did, and so does your update.
    const moved = shared === itemId || (original.publishedFrom === null && original.publishedBy === me);
    const kept = moved ? await s.tx<{ sourceId: string }[]>`select source_id from citations where content_id = ${itemId}::uuid` : [];
    return supersedeItem(s, itemId, { body: input.body, sources: [...new Set([...kept.map((row) => row.sourceId), ...(input.sources ?? [])])] });
  }
  if (shared) {
    const update = await supersedeItem(s, shared, input);
    // It rests on what yours did, sources you can no longer open included, so sharing it says so.
    if (update) await s.tx`select carry_citations(${itemId}::uuid, ${update.id}::uuid)`;
    return update;
  }
  const [item] = await s.tx<Item[]>`
    update content set body = ${await textFor(s, original, input.body)}
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
 * shared one replaces a shared item for everyone. Something of yours that
 * you shared as a copy is the copy from then on, so that's what it replaces.
 */
export async function supersedeItem(
  s: Session,
  itemId: string,
  input: { body: NewText; sources?: string[]; shared?: boolean },
): Promise<Item | undefined> {
  const original = await changeableItem(s, itemId, 'replace');
  if (!original) return undefined;
  const shared = original.privateTo ? await sharedNowAs(s, itemId) : undefined;
  const old = shared && shared !== itemId ? await changeableItem(s, shared, 'replace') : original;
  if (!old) return undefined;
  const privateTo = sideOf(s, input.shared);
  const body = await textFor(s, old, input.body);
  return insertItem(s, { sources: input.sources, body, pageId: old.pageId, spaceId: old.spaceId, privateTo, kind: 'text', supersedes: old.id });
}

/**
 * The text an item gets, as long as its page keeps. Made from its current text, it's made from
 * what the item says once nothing else can change or replace it until the transaction ends, so a
 * change made meanwhile is built on, or refused, and never silently undone.
 */
async function textFor(s: Session, item: Item, text: NewText): Promise<string> {
  let body = text;
  if (typeof body !== 'string') {
    const [now] = await s.tx<{ body: string }[]>`
      select body from content where id = ${item.id}::uuid and ${visible(s, 'content')} for update
    `;
    if (!now) throw new AccessDenied('There is no item with that reference that you can see.');
    const replacement = await replacementOf(s, item.id);
    if (replacement) throw new AccessDenied(`That item is no longer current. It was replaced by item:${replacement.id}.`);
    body = body(now.body);
  }
  // An overview stays a short summary, however it's written.
  const [page] = await s.tx<{ type: string | null }[]>`select type from pages where id = ${item.pageId}::uuid`;
  if (page?.type === 'overview' && body.length > overviewLength) throw new TooLong('Keep the overview under 2,000 characters. Details belong on pages.');
  return body;
}

/**
 * A page as the viewer sees it: the current shared items plus their own, with their sources. An
 * item that replaced another stands where the first of them stood, and so does your private
 * update of a shared item, which says what the others still see (spec §3).
 */
export async function readPage(s: Session, pageId: string): Promise<Page | undefined> {
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
    select ${itemColumns(s, 'content')}, ${citationsOf(s, true)} as sources, (
      -- Whoever can see a replacement can see what it replaced. For your own update to something
      -- shared, however many times you updated it since, that's the shared item nearest it, which
      -- the others still see unless something shared replaced it too.
      select json_build_object('id', r.id, 'body', r.body, 'shared', r.private_to is null and not exists (
               select from content x where x.supersedes = r.id and x.private_to is null and ${visible(s, 'x')}
             ))
      from content r
      where r.id = case when content.private_to is not null and chain.nearest_shared is not null
                        then chain.nearest_shared else content.supersedes end
    ) as replaced
    from content
    left join chain on chain.id = content.id
    left join content first on first.id = chain.first
    where content.page_id = ${pageId}::uuid and content.kind <> 'removed' and ${visibleContent(s, 'content')} and ${current(s, 'content')}
      and not ${sharedAsCopy(s, 'content')}
    order by coalesce(first.created_at, content.created_at), content.created_at
  `;
  if (items.length === 0) return undefined;
  const [{ type, archivedAt, archivedBy, archivedSince }] = await s.tx<{ type: string | null; archivedAt: Date | null; archivedBy: string | null; archivedSince: boolean | null }[]>`
    select p.type, a.at as archived_at, a.archived_by, a.since as archived_since
    from pages p left join page_archived(p.id) a on true
    where p.id = ${pageId}::uuid
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
    archived: archivedAt ? { at: archivedAt, by: archivedBy, since: archivedSince ?? false } : null,
    items: items.filter((item) => item.kind !== 'title'),
  };
}

/** The space a page is in, if the viewer sees it in a space they can open. */
export async function spaceOfPage(s: Session, pageId: string): Promise<string | undefined> {
  const [page] = await s.tx<{ spaceId: string }[]>`
    select space_id from content where page_id = ${pageId}::uuid and ${visible(s, 'content')} limit 1
  `;
  return page?.spaceId;
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
  /** How many sources it rested on that didn't come with the export it was imported from. */
  hiddenElsewhere: number;
  /** Whether it's shared as a copy citing only what everyone there sees, rather than moving. */
  copy: boolean;
  /** What everyone sees now that this replaces for them, when it's your update of something shared. */
  sharedText: string | null;
  /** Whether it's still your current item, and not shared already, so it can be shared. */
  current: boolean;
  /** If it was shared as a copy, what everyone sees of it now: the copy, or what replaced that since. */
  sharedAs: string | null;
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
  const copy = await copyOf(s, itemId);
  const sharedAs = copy ? await everyoneSees(s, copy) : null;
  const [facts] = await s.tx<{ hiddenCount: number; base: string | null; sharedText: string | null; current: boolean; sharedTitle: string | null; ownTitle: string | null }[]>`
    select hidden_sources(${itemId}::uuid) as hidden_count,
           shared_base(${itemId}::uuid) as base,
           -- What everyone sees now that sharing this replaces: the shared item it updates.
           (select body from content where id = shared_base(${itemId}::uuid)) as shared_text,
           not exists (select from content r where r.supersedes = ${itemId}::uuid and ${visible(s, 'r')}) as current,
           (select body from content where page_id = ${item.pageId}::uuid and kind = 'title' and private_to is null) as shared_title,
           (select body from content where page_id = ${item.pageId}::uuid and kind = 'title' and private_to = ${me}::uuid) as own_title
  `;
  // Moving is for what was written without anything hidden, as the first update of what's shared, if any.
  const moves = facts.hiddenCount === 0 && (item.supersedes === null || item.supersedes === facts.base);
  return {
    item,
    pageTitle: facts.sharedTitle ?? facts.ownTitle ?? 'Untitled',
    sharesTitle: facts.sharedTitle === null,
    hidden,
    hiddenUnseen: Math.max(0, facts.hiddenCount - hidden.length - (item.imported?.sourcesElsewhere ?? 0)),
    hiddenElsewhere: item.imported?.sourcesElsewhere ?? 0,
    copy: !moves,
    sharedText: facts.sharedText,
    // Shared already as a copy, it's the copy from then on, and an update of that is shared instead.
    current: facts.current && sharedAs === null,
    sharedAs,
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

/**
 * An item with its sources, its earlier versions, and what replaced it, if anything. Your private
 * update of something shared also says which shared item it updates, which the others still see,
 * and your original of something you shared as a copy says which copy stands for it.
 */
export async function readItem(s: Session, itemId: string) {
  const [item] = await s.tx<(Item & { sources: Citation[]; updates: string | null })[]>`
    select ${itemColumns(s)}, ${citationsOf(s)} as sources,
           case when private_to is not null and supersedes is not null then shared_base(id) end as updates
    from content
    where id = ${itemId}::uuid and ${visibleContent(s, 'content')}
  `;
  if (!item) return undefined;
  const history = await s.tx<Revision[]>`
    select body, written_by, agent, edit_agent, written_at, replaced_at, imported
    from revisions
    where content_id = ${itemId}::uuid and ${visible(s, 'revisions')}
    order by replaced_at
  `;
  // Your original of something you shared as a copy: the copy stands for it, and may have been replaced since.
  const copy = item.privateTo ? await copyOf(s, itemId) : undefined;
  const sharedAs = copy ? { id: copy, replacedBy: (await replacementOf(s, copy)) ?? null } : null;
  return { ...item, history, replacedBy: await replacementOf(s, itemId), sharedAs };
}

/** The knowledge pages in a space that the viewer can see, most recently changed first. */
export async function listPages(s: Session, spaceId: string, options: { withArchived?: boolean } = {}) {
  return s.tx<{ id: string; type: string | null; title: string | null; updatedAt: Date; archived: boolean }[]>`
    select c.page_id as id, p.type, ${titleOf(s, s.tx`c.page_id`)} as title, max(c.updated_at) as updated_at, p.archived
    from content c
    join pages p on p.id = c.page_id
    where c.space_id = ${spaceId}::uuid and ${knowledge(s, 'p')} and ${options.withArchived ? s.tx`true` : s.tx`not p.archived`}
      and ${visible(s, 'c')} and ${current(s, 'c')}
    group by c.page_id, p.type, p.archived
    order by p.archived, updated_at desc
  `;
}

/** How many archived pages in a space the viewer can see. */
export async function archivedPages(s: Session, spaceId: string): Promise<number> {
  const [{ count }] = await s.tx<{ count: number }[]>`
    select count(distinct c.page_id)::int as count
    from content c join pages p on p.id = c.page_id
    where c.space_id = ${spaceId}::uuid and ${knowledge(s, 'p')} and p.archived and ${visible(s, 'c')} and ${current(s, 'c')}
  `;
  return count;
}

/**
 * Archives a page the person can see, or reopens it (spec §3): for everyone who sees it, recorded,
 * and nothing deleted. Says whether that changed it, or whether it was archived, or open, already.
 * Undefined when there's no such page; reserved for one that isn't knowledge.
 */
export async function archivePage(s: Session, pageId: string, archived: boolean): Promise<'changed' | 'unchanged' | 'reserved' | undefined> {
  const page = await readPage(s, pageId);
  if (!page) return undefined;
  if (page.type === 'guidance' || page.type === 'skill' || page.type === 'overview') return 'reserved';
  const [{ changed }] = await s.tx<{ changed: boolean }[]>`select archive_page(${pageId}::uuid, ${archived}) as changed`;
  return changed ? 'changed' : 'unchanged';
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
  /** Archived, which a collection still lists. */
  archived: boolean;
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
    /** Also how many archived pages there are, for the way to them. */
    countArchived?: boolean;
  } = {},
): Promise<{ pages: PageSummary[]; total: number; all: number; types: { type: string; count: number }[]; archived: number }> {
  const terms = await termsOf(s, options.query ?? '');
  const limit = options.limit ?? 50;
  const order = options.order === 'match' && !terms ? 'recent' : (options.order ?? (terms ? 'match' : 'recent'));
  // Archived pages show only on request, except in a collection, which lists what it gathers.
  const shelved = options.in ? s.tx`true` : options.archived ? s.tx`p.archived` : s.tx`not p.archived`;
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
      -- Your original of something you shared shows as the copy. The space's copies are few, and
      -- found through their own index, rather than looked for behind every item.
      and not (c.private_to is not null and c.id in (
        select x.published_from from content x
        where x.published_from is not null and x.space_id = ${spaceId}::uuid and x.private_to is null and ${visible(s, 'x')}
      ))
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
    select h.id, p.type, h.title, h.excerpt, h.updated_at, h.only_you, p.archived, count(*) over ()::int as total
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
  const archived = options.countArchived && !options.in && !options.archived ? await archivedPages(s, spaceId) : 0;
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
 * assistant never replaces what a person wrote, so its version then sits beside it instead, and
 * keeps the user's own only when an assistant wrote it.
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
  // What the person wrote themselves, their assistant changes only when they ask, as an item.
  if (mine && s.principal.agent !== undefined && ownText(s, mine)) {
    throw new AccessDenied(
      `The user wrote their own overview of this space themselves (item:${mine.id}). Change it only when they ask you to, with updates on that item: it stays theirs, and what it said before is kept.`,
    );
  }
  if (mine) return (await updateItem(s, mine.id, { body: input.text }))!;
  const replaceable = shared && (s.principal.agent === undefined || !byPerson(shared));
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
  /** On a page that's archived. */
  pageArchived: boolean;
  writtenBy: string | null;
  agent: string | null;
  /** The assistant that made the change for the person who wrote it, who stays its author. */
  editAgent: string | null;
  imported: Imported | null;
  /** Who shared it from their own side, and when, if someone did. */
  publishedBy: string | null;
  publishedAt: Date | null;
  at: Date;
  onlyYou: boolean;
}

/**
 * What changed lately in everything the viewer can see, newest first: knowledge added, updated or
 * corrected, never rules, skills or what's no longer true. Archived spaces and pages are out of
 * everyday attention, so what changed in them shows only on request. Says whether there's more
 * after these, and whether archived spaces and pages that were left out have changes.
 */
export async function recentChanges(
  s: Session,
  options: {
    offset?: number;
    limit?: number;
    /** With archived spaces and pages too. */
    archived?: boolean;
    /** The spaces the viewer can open, when they're at hand already. */
    spaces?: Space[];
  } = {},
): Promise<{ changes: Change[]; more: boolean; archived: boolean }> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit ?? 50;
  // Archived as the viewer sees it: a space archived with one above it only when they can open that
  // one. A page's archiving is one state for everyone who sees it.
  const shelved = options.archived ? [] : (options.spaces ?? (await listSpaces(s))).filter((space) => space.archived).map((space) => space.id);
  const archivedPages = s.tx`(select p.id from pages p where p.archived)`;
  const active = options.archived
    ? s.tx``
    : s.tx`and c.page_id not in ${archivedPages} ${shelved.length ? s.tx`and c.space_id not in ${s.tx(shelved)}` : s.tx``}`;
  // The newest items first, then only those still current: checked per item, behind the fence,
  // since checking it for the whole store at once is slow. Replaced items are few, so a margin covers them.
  const rows = await s.tx<(Change & { total: number })[]>`
    select item_id, page_id, space_id, title, text, kind, new_page and not overview as new_page, written_by, agent, edit_agent, imported, published_by, published_at, at, only_you, overview,
           exists (select from pages p where p.id = recent.page_id and p.archived) as page_archived
    from (
      select c.id as item_id, c.page_id, c.space_id, ${titleOf(s, s.tx`c.page_id`)} as title, c.body as text,
             -- Corrected means it has an earlier version; its timestamps alone can differ by a moment when it's written.
             case when c.supersedes is not null then 'updated'
                  when exists (select from revisions r where r.content_id = c.id and ${visible(s, 'r')}) then 'corrected'
                  else 'added' end as kind,
             c.supersedes is null and not exists (
               select from content o where o.page_id = c.page_id and o.kind = 'text' and o.created_at < c.created_at and ${visible(s, 'o')}
             ) as new_page,
             -- Shared from someone's own side, it's new when it was shared.
             c.written_by, c.agent, c.edit_agent, c.imported, c.published_by, c.published_at, greatest(c.updated_at, coalesce(c.published_at, c.updated_at)) as at, c.private_to is not null as only_you,
             (select p.type from pages p where p.id = c.page_id) is not distinct from 'overview' as overview,
             ${current(s, 'c')} as is_current,
             ${sharedAsCopy(s, 'c')} as shared_as_copy
      from content c
      where c.kind = 'text' and ${visible(s, 'c')} ${active}
      order by greatest(c.updated_at, coalesce(c.published_at, c.updated_at)) desc
      limit ${offset + limit * 2 + 50}
      offset 0
    ) recent
    where is_current and not shared_as_copy
    order by at desc
    limit ${limit + 1} offset ${offset}
  `;
  // Only what the viewer sees there now counts, so the way to it shows only when there's something.
  const [{ archived }] = options.archived
    ? [{ archived: false }]
    : await s.tx<{ archived: boolean }[]>`
        select exists (
          select from content c
          where c.page_id in ${archivedPages} and c.kind = 'text' and ${visible(s, 'c')} and ${current(s, 'c')}
        ) ${shelved.length
          ? s.tx`or exists (select from content c where c.space_id in ${s.tx(shelved)} and c.kind = 'text' and ${visible(s, 'c')} and ${current(s, 'c')})`
          : s.tx``} as archived
      `;
  return { changes: rows.slice(0, limit), more: rows.length > limit, archived };
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
  const terms = await termsOf(s, options.query ?? '');
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
  // Which mailbox Homing read it in, for whoever's connection that is: only its owner.
  const [source] = await s.tx<(Source & { writtenBy: string | null; agent: string | null; createdAt: Date; imported: Imported | null; readIn: string | null })[]>`
    select ${sourceColumns(s)}, written_by, agent, created_at, imported, (select c.address from connections c where c.id = sources.read_through) as read_in
    from sources where id = ${sourceId}::uuid and ${visible(s, 'sources')}
  `;
  if (!source) return undefined;
  // Your original of something you shared as a copy shows as the copy, as it does on its page.
  const uses = await s.tx<{ pageId: string; title: string | null; itemId: string; body: string; privateTo: string | null }[]>`
    select page_id, ${titleOf(s, s.tx`page_id`)} as title, item_id, body, private_to from (
      select distinct c.page_id, c.id as item_id, c.body, c.private_to, c.created_at
      from citations ci
      join content cited on cited.id = ci.content_id
      join content c on c.id = coalesce((
        select copy.id from content copy
        where copy.published_from is not null and copy.published_from = cited.id and copy.private_to is null and ${visible(s, 'copy')}
        order by copy.published_at desc limit 1
      ), cited.id)
      join pages p on p.id = c.page_id
      where ci.source_id = ${sourceId}::uuid and ${knowledge(s, 'p')} and ${visible(s, 'cited')} and ${visible(s, 'c')} and ${current(s, 'c')}
    ) uses
    order by created_at
  `;
  return { ...source, uses };
}

/** Earlier versions of these items that the viewer can see, oldest first. */
export async function historyOf(s: Session, itemIds: string[]): Promise<(Revision & { itemId: string })[]> {
  if (itemIds.length === 0) return [];
  return s.tx<(Revision & { itemId: string })[]>`
    select content_id as item_id, body, written_by, agent, edit_agent, written_at, replaced_at, imported
    from revisions
    where content_id in ${s.tx(itemIds)} and ${visible(s, 'revisions')}
    order by replaced_at
  `;
}

/**
 * What a query holds that PostgreSQL keeps as one word in a note, though search splits it by
 * letters and digits: a number with a sign, such as the "-881" of "BETA-881", a version such as
 * "2.4.1", a decimal, an address, a host or a path. At most 32, each one a search keeps whole.
 */
async function writtenWhole(s: Session, query: string): Promise<string[]> {
  // Only a query with something besides letters, digits and spaces has one.
  if (!/[^\p{L}\p{M}\p{N}\s]/u.test(query)) return [];
  // The parser to_tsvector('simple', …) uses, without the kinds that are only letters and digits.
  // A text can't hold the null character.
  const rows = await s.tx<{ token: string }[]>`
    select p.token
    from ts_parse('default', ${query.replaceAll('\0', ' ')}) with ordinality as p (tokid, token, n)
    join ts_token_type('default') as t on t.tokid = p.tokid
    where t.alias not in ('blank', 'asciiword', 'word', 'numword', 'uint', 'hword_asciipart', 'hword_part', 'hword_numpart')
      and (select count(*) from unnest(to_tsvector('simple', p.token)) as v, unnest(v.positions)) = 1
    order by p.n
    limit 1000
  `;
  const seen = new Set<string>();
  return rows
    .map(({ token }) => token)
    .filter((token) => /[^\p{L}\p{M}\p{N}]/u.test(token) && /[\p{L}\p{N}]/u.test(token) && !seen.has(token.toLowerCase()) && seen.add(token.toLowerCase()))
    .slice(0, 32);
}

/**
 * The words search looks for in a query: its first 32 words by letters and digits, longer ones by
 * how they start, so "launch" finds "launches", and besides them what the query holds that a note
 * keeps whole, only as written. "BETA-881" is "BETA", "881" and "-881", so it finds what it always
 * found, and first the note that has it written the same way.
 */
export async function queryTerms(s: Session, query: string): Promise<{ word: string; prefix: boolean; whole: boolean }[]> {
  const text = query.normalize('NFC');
  // Letters with their accents and marks, as one word, and at most 32 words.
  const words = text.match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 32) ?? [];
  return [
    ...words.map((word) => ({ word, prefix: word.length >= 4, whole: false })),
    ...(await writtenWhole(s, text)).map((word) => ({ word, prefix: false, whole: true })),
  ];
}

/**
 * Search terms for full-text search. What a note keeps whole is quoted, so nothing in it, such as
 * "!" or ":*" in a link, is read as an operator; the other words are only letters and digits.
 */
export async function termsOf(s: Session, query: string): Promise<string | undefined> {
  const quoted = (word: string) => `'${word.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
  const terms = (await queryTerms(s, query)).map(({ word, prefix, whole }) => (whole ? quoted(word) : prefix ? `${word}:*` : word));
  return terms.length ? terms.join(' | ') : undefined;
}

/**
 * The words of a request that tell it apart, at most 32, without the common ones that match nearly
 * anything, such as "what" or "hva", and without numbers of one to three digits. Longer numbers,
 * such as an invoice number or a year, count. Common words are PostgreSQL's English and Norwegian
 * stopwords, so English words that are common in Norwegian, such as "men" or "bare", don't count
 * either. Empty when nothing is left.
 */
export async function tellingWords(s: Session, text: string): Promise<string> {
  const words = text.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 1000) ?? [];
  if (!words.length) return '';
  const [{ telling }] = await s.tx<{ telling: string | null }[]>`
    select string_agg(word, ' ' order by n) as telling from (
      select word, n from unnest(${words}::text[]) with ordinality as w (word, n)
      where word !~ '^[0-9]{1,3}$' and length(to_tsvector('english', word)) > 0 and length(to_tsvector('norwegian', word)) > 0
      order by n
      limit 32
    ) kept
  `;
  return telling ?? '';
}

/** How many of the words a text has, matched as search matches them: longer words by how they start. */
export function wordsIn(text: string, words: string): number {
  const have = text.toLowerCase().normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const wanted = [...new Set(words.toLowerCase().normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])];
  return wanted.filter((want) => have.some((word) => (want.length >= 4 ? word.startsWith(want) : word === want))).length;
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
  options: { spaceId?: string; limit?: number; current?: boolean; knowledge?: boolean; only?: 'content' | 'sources'; active?: boolean } = {},
): Promise<Hit[]> {
  const terms = await termsOf(s, query);
  if (!terms) return [];
  const within = (table: string) =>
    options.spaceId
      ? s.tx`and ${s.tx(table)}.space_id in (select space_subtree(${options.spaceId}::uuid))`
      : s.tx``;
  // Within a space, the rules and skills its guidance includes, and the spaces' below it, count as
  // there too. Knowledge alone leaves guidance out, so it doesn't look.
  const includedThere = (target: 'space_included' | 'skill_included') => s.tx`
    select i.${s.tx(target)} from includes i
    where i.space_id = any(array(select space_subtree(${options.spaceId ?? null}::uuid))) and i.removed_at is null
      and i.space_id in (${accessibleSpaces(s)}) and (i.private_to is null or i.private_to = ${personOf(s.principal) ?? null}::uuid)
      and include_open(i.space_included, i.skill_included)
  `;
  const contentWithin = options.spaceId && !options.knowledge
    ? s.tx`and (c.space_id in (select space_subtree(${options.spaceId}::uuid)) or (c.reaches_down and ${visible(s, 'c')} and (
        (c.kind in ('requirement', 'preference') and c.space_id in (${includedThere('space_included')}))
        or c.page_id in (${includedThere('skill_included')})
      )))`
    : within('c');

  // A match in a skill's current files finds the skill, once.
  return s.tx<Hit[]>`
    select kind, id, space_id, page_id, page_type, title, text, private, superseded, archived, updates_shared, replaced_for_you, item_kind, written_by, agent, edit_agent, imported, read_by_homing from (
    select distinct on (kind, id) * from (
      select case when c.kind in ('title', 'file') then 'page' else 'item' end as kind,
             case when c.kind in ('title', 'file') then c.page_id else c.id end as id,
             c.space_id, c.page_id, (select p.type from pages p where p.id = c.page_id) as page_type, ${titleOf(s, s.tx`c.page_id`)} as title,
             case c.kind when 'file' then ${titleOf(s, s.tx`c.page_id`)} else c.body end as text,
             c.private_to is not null as private, not ${current(s, 'c')} as superseded,
             coalesce((select p.archived from pages p where p.id = c.page_id), false) as archived,
             -- Your update of a shared item that the others still see, or such an item, which only your update replaced.
             case when c.private_to is not null and c.supersedes is not null then shared_base(c.id) is not null else false end as updates_shared,
             c.private_to is null and c.kind = 'text'
               and exists (select from content r where r.supersedes = c.id and r.private_to is not null and ${visible(s, 'r')})
               and not exists (select from content r where r.supersedes = c.id and r.private_to is null and ${visible(s, 'r')}) as replaced_for_you,
             ts_rank(c.search, to_tsquery('simple', ${terms}), 1) as rank, c.kind as item_kind,
             ${sharedAsCopy(s, 'c')} as shared_as_copy, c.written_by, c.agent, c.edit_agent, c.imported, false as read_by_homing
      -- Each match's page is looked up on its own: joining all pages would check access to every page first.
      from content c
      where c.search @@ to_tsquery('simple', ${terms}) and ${visibleContent(s, 'c')} ${contentWithin}
        and ${options.only !== 'sources'}
      union all
      select 'source', src.id, src.space_id, null, null, src.reference, src.excerpt, src.private_to is not null, false, false, false, false,
             ts_rank(src.search, to_tsquery('simple', ${terms}), 1), null, false, null, null, null, null, src.read_through is not null
      from sources src
      where src.search @@ to_tsquery('simple', ${terms}) and ${visible(s, 'src')} ${within('src')} and ${options.only !== 'content'}
      -- Keeps the filters below out of this query, where they'd be run over every item first.
      offset 0
    ) hits
    -- A skill's file that's no longer current doesn't find it. Only knowledge leaves out rules and skills.
    -- Your own original of something you shared as a copy shows as the copy.
    where not (${options.current ?? false} and superseded) and not (item_kind = 'file' and superseded) and not shared_as_copy
      and not (${options.active ?? false} and archived)
      and not (${options.knowledge ?? false} and coalesce(page_type, '') in ('guidance', 'skill'))
    order by kind, id, superseded, rank desc
    ) best
    order by superseded, rank desc
    limit ${options.limit ?? 20}
  `;
}

export function itemColumns(s: Session, table?: string) {
  if (!table) return s.tx`id, page_id, space_id, kind, path, private_to, body, written_by, agent, edit_agent, supersedes, reaches_down, published_from, published_by, published_at, created_at, updated_at, imported`;
  const t = s.tx(table);
  return s.tx`${t}.id, ${t}.page_id, ${t}.space_id, ${t}.kind, ${t}.path, ${t}.private_to, ${t}.body, ${t}.written_by, ${t}.agent, ${t}.edit_agent, ${t}.supersedes, ${t}.reaches_down, ${t}.published_from, ${t}.published_by, ${t}.published_at, ${t}.created_at, ${t}.updated_at, ${t}.imported`;
}

function sourceColumns(s: Session) {
  return s.tx`id, space_id, private_to, reference, excerpt, read_through`;
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

/**
 * The item, if the viewer can see it and may change it where it is, or replace it. An agent, or a
 * space's routine, never changes what a person wrote, except the person's own assistant changing
 * their own text (ownText): on their private side where it is, and on the shared side by replacing
 * it, as their own update of it.
 */
async function changeableItem(s: Session, itemId: string, how: 'update' | 'replace'): Promise<Item | undefined> {
  const [item] = await s.tx<Item[]>`
    select ${itemColumns(s)} from content where id = ${itemId}::uuid and ${visible(s, 'content')}
  `;
  if (!item) return undefined;
  const replacement = await replacementOf(s, itemId);
  if (replacement) {
    throw new AccessDenied(`That item is no longer current. It was replaced by item:${replacement.id}.`);
  }
  const notPerson = s.principal.agent !== undefined || personOf(s.principal) === undefined;
  // Shared, any change of theirs is their own update of it.
  const theirs = s.principal.agent !== undefined && (ownText(s, item, 'shared') || (how === 'update' && ownText(s, item)));
  if (notPerson && byPerson(item) && !theirs) throw new AccessDenied(personWrote(s, item));
  return item;
}

/** Why an agent can't change what a person wrote, and what it does instead. */
export function personWrote(s: Session, item: Item): string {
  // Replacing says it's no longer true, which only the person decides.
  if (ownText(s, item)) {
    return 'The user wrote that themselves, so only they replace it. If they asked you to change it, use updates instead: it stays theirs, and what it said before is kept.';
  }
  const instead = 'Save what you found as a new item on the same page, and point out the difference to the user.';
  if (importedAuthor(item.imported)) return `Someone wrote that before it was imported, so agents never change it. ${instead}`;
  if (item.privateTo === null) return `A person wrote that, and it's shared, so agents never change it. ${instead}`;
  return `Agents never change what people wrote. ${instead}`;
}

/**
 * The item that replaced this one, as far as the viewer can see: for everyone if anything did, or
 * only for the viewer, by their own update of something shared.
 */
async function replacementOf(s: Session, itemId: string): Promise<{ id: string; at: Date; shared: boolean } | undefined> {
  const [replacement] = await s.tx<{ id: string; at: Date; shared: boolean }[]>`
    select id, created_at as at, private_to is null as shared from content
    where supersedes = ${itemId}::uuid and ${visibleContent(s, 'content')}
    order by private_to is not null, created_at
    limit 1
  `;
  return replacement;
}

/**
 * What your private item is now if you shared it: itself once it moved to the shared side, or the
 * copy it was shared as. It's locked first until the transaction ends, so sharing it at the same
 * moment happens wholly before or after a change to it.
 */
async function sharedNowAs(s: Session, itemId: string): Promise<string | undefined> {
  const [item] = await s.tx<{ privateTo: string | null }[]>`
    select private_to from content where id = ${itemId}::uuid and ${visible(s, 'content')} for update
  `;
  if (item && item.privateTo === null) return itemId;
  return copyOf(s, itemId);
}

/**
 * What everyone sees now of a shared item: the item, or what replaced it for everyone since, as far
 * as the viewer can see.
 */
async function everyoneSees(s: Session, itemId: string): Promise<string> {
  const [latest] = await s.tx<{ id: string }[]>`
    with recursive line (id, depth) as (
      select ${itemId}::uuid, 0
      union all
      select r.id, line.depth + 1 from content r join line on r.supersedes = line.id
      where r.private_to is null and ${visible(s, 'r')} and line.depth < 100
    )
    select id from line order by depth desc limit 1
  `;
  return latest.id;
}

/** The shared copy your private item was shared as, if it was, which stands for it from then on (spec §5). */
async function copyOf(s: Session, itemId: string): Promise<string | undefined> {
  const [copy] = await s.tx<{ id: string }[]>`
    select id from content
    where published_from = ${itemId}::uuid and private_to is null and ${visible(s, 'content')}
    order by published_at desc
    limit 1
  `;
  return copy?.id;
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

/**
 * Your private original of something you shared as a copy, which shows as the copy from then on,
 * with your own sources (spec §5). A change to it is your update of the copy.
 */
export function sharedAsCopy(s: Session, table: string) {
  const t = s.tx(table);
  return s.tx`(${t}.private_to is not null and exists (
    -- Only copies, which the index on published_from keeps few to look through.
    select from content shared
    where shared.published_from is not null and shared.published_from = ${t}.id and shared.private_to is null and ${visible(s, 'shared')}
  ))`;
}

/**
 * Archives and reopenings of a page the viewer sees: from when they could first see the page, and
 * their own (spec §3). Row-level security applies the same rule.
 */
export function archivesSeen(s: Session, table: string) {
  const t = s.tx(table);
  return s.tx`(
    ${t}.at >= (select f.seen from page_first_seen(${t}.page_id) f)
    or (${t}.person_id = ${personOf(s.principal) ?? null}::uuid and (select f.seen from page_first_seen(${t}.page_id) f) is not null)
  )`;
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
    select json_agg(json_build_object('id', src.id, 'reference', src.reference, 'excerpt', src.excerpt, 'shared', src.private_to is null, 'readThrough', src.read_through)
                    order by src.created_at)
    from sources src
    where src.id in (
      select ci.source_id from citations ci
      where ci.content_id = content.id ${withOrigin ? s.tx`or ci.content_id = content.published_from` : s.tx``}
    ) and ${visible(s, 'src')}
  ), '[]')`;
}
