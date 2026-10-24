import type { PublicationData } from '@/lib/proposals';

/** A page in a space's list of pages, as the person sees it. */
export interface PageSummary {
  /** Archived, which a collection still lists. */
  archived?: boolean;
  id: string;
  type: string | null;
  title: string;
  /** Its first item, for a glimpse of what it says. */
  excerpt: string | null;
  updatedAt: string;
  /** Nobody else sees any of it. */
  onlyYou: boolean;
  /** How many pages it gathers, which makes it a collection. */
  gathers: number;
  /** In a collection's list: whether it's there for everyone, or only for you. */
  gatheredShared?: boolean;
}

export type PageOrder = 'recent' | 'name' | 'match';

/** A space's pages, fifty at a time, and how many there are in all and of each type. */
export interface PagesData {
  pages: PageSummary[];
  /** How many match what was asked. */
  total: number;
  /** How many there are without searching or filtering. */
  all: number;
  types: { type: string; count: number }[];
  /** How many archived pages there are, which show on request. */
  archived?: number;
}

/**
 * Who wrote something: you, someone by name, or someone the reader no longer shares a space with.
 * Imported, they wrote it before it came in an import, and are nobody here. Null when a space's own
 * routine did.
 */
export type Author = { name: string | null; you: boolean; imported?: boolean } | null;

/** An earlier version of an item: what it said, who wrote it, through which assistant, and until when. */
export interface Version {
  text: string;
  by: Author;
  agent: string | null;
  editAgent?: string | null;
  writtenAt: string;
  until: string;
}

export interface ItemData {
  id: string;
  /** Markdown. */
  text: string;
  shared: boolean;
  by: Author;
  /** The assistant that wrote it for that person, or null when they wrote it themselves. */
  agent: string | null;
  /** The assistant that made its latest change for the person who wrote it, which stays theirs. */
  editAgent?: string | null;
  writtenAt: string;
  /** Who shared it with the space from their own private side, and when, if someone did. */
  sharedBy?: Author;
  sharedAt?: string | null;
  /** Its sources as you see them. Your own aren't shared, such as those behind something you shared. */
  sources: { id: string; reference: string | null; excerpt: string; shared?: boolean }[];
  /** What it replaced. When it's your private update of something shared that the others still see, shared is true. */
  replaced: { text: string; shared: boolean; until: string } | null;
  /** What it said before it was last changed, oldest first, each with who wrote that version. */
  earlier: Version[];
}

/** A page as the person sees it: the shared items and their own, and no trace of anyone else's. */
export interface PageData {
  id: string;
  title: string;
  type: string | null;
  /** On the space's shared side, so everyone there sees its title. */
  shared: boolean;
  updatedAt: string;
  /** How many pages it gathers, which makes it a collection. */
  gathers: number;
  /** The collections it's in, each for everyone or only for you. */
  collections: { id: string; title: string; shared: boolean }[];
  /** The pages whose items link to it. */
  mentionedOn: { id: string; title: string }[];
  /** When it was archived and by whom, if it is. Archived by someone else before you could see the page, since then, by nobody named. */
  archived?: { at: string; by: Author; since: boolean } | null;
  /** Where it is, and how many people see what's shared there now. */
  space: { id: string; name: string; personal: boolean; private: boolean; people: number; above: boolean };
  items: ItemData[];
}

/** Writing on a page. Each answers with what went wrong, or nothing when it's saved. */
export interface PageActions {
  add: (text: string, shared: boolean) => Promise<string | undefined>;
  correct: (itemId: string, text: string, shared: boolean) => Promise<string | undefined>;
  /** Puts a page in this one, or takes it out, which makes this a collection. */
  gather: (pageId: string, shared: boolean) => Promise<string | undefined>;
  ungather: (pageId: string, shared: boolean) => Promise<string | undefined>;
  /** Puts this page in a collection, or takes it out. */
  join: (collectionId: string, shared: boolean) => Promise<string | undefined>;
  leave: (collectionId: string, shared: boolean) => Promise<string | undefined>;
  /** Finds pages in the page's space by what they say, or only collections. */
  find: (query: string, collections?: boolean) => Promise<PageSummary[]>;
  /** What sharing one of your items with the space would do, or null when there's nothing of yours to share, and sharing it, exactly as shown. */
  publication: (itemId: string) => Promise<PublicationData | null>;
  publish: (itemId: string, shown: string) => Promise<string | undefined>;
  /** Archives the page, or reopens it. */
  archive?: (archived: boolean) => Promise<string | undefined>;
}

/** Starting a page. Answers with the new page, or what went wrong. */
export type NewPage = (input: { title: string; type: string; shared: boolean }) => Promise<{ id: string } | { problem: string }>;

/** The text without its Markdown, for a one-line glimpse. */
export function plain(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Cara Lund", "You", or "Someone" when the reader no longer shares a space with them. */
export function nameOf(author: Author): string {
  if (!author) return 'Homing';
  if (author.imported) return `${author.name ?? 'Someone'} (imported)`;
  return author.you ? 'You' : (author.name ?? 'Someone');
}

/** Who something was for, or by, in the middle of a sentence: "you", "Cara Lund", "Cara Lund (imported)", or nobody named. */
export function nameIn(author: Author): string | null {
  if (author?.you) return 'you';
  return author?.name || author?.imported ? nameOf(author) : null;
}

/** The assistant that changed someone's own text for them: "your assistant Claude", "their assistant Claude". */
export function theirAssistant(author: Author, agent: string): string {
  return `${author?.you ? 'your' : 'their'} assistant ${agent}`;
}

/**
 * What a source is called: its reference, or, for an email Homing read in your mailbox, whose email
 * it is, since its reference is for assistants to open it again.
 */
export function sourceName(source: { reference: string | null; excerpt: string }, unnamed = 'A source without a name'): string {
  if (!source.reference?.startsWith('mail:')) return source.reference ?? unnamed;
  const from = /^From: (.+?)(?: <[^>]*>)?$/m.exec(source.excerpt)?.[1];
  return from && from !== 'unknown' ? `${from}’s email` : 'An email';
}

/** Whether a source Homing made from an email keeps words the email only quotes from an earlier one, which Homing says in its first lines. */
export function quotesEarlier(excerpt: string): boolean {
  return excerpt.split('\n\n', 1)[0].split('\n').includes('Quoted: as this email quotes an earlier one, which Homing didn’t read');
}

/** A source in a space's list of sources. */
export interface SourceSummary {
  id: string;
  reference: string | null;
  excerpt: string;
  createdAt: string;
  /** Only you have it. */
  onlyYou: boolean;
  /** How many pages you see it used on. */
  pages: number;
}

/** A space's sources, fifty at a time. */
export interface SourcesData {
  sources: SourceSummary[];
  /** How many match the search. */
  total: number;
  /** How many there are without searching. */
  all: number;
}

/** A source: what Homing kept of it, who kept it, and the pages whose items rest on it. */
export interface SourceData {
  id: string;
  reference: string | null;
  excerpt: string;
  shared: boolean;
  keptAt: string;
  by: Author;
  agent: string | null;
  /** The mailbox Homing read it in, when it read it itself. */
  readIn: string | null;
  space: { id: string; name: string; personal: boolean; private: boolean };
  pages: { id: string; title: string; items: { id: string; text: string; shared: boolean }[] }[];
}

/** A change to knowledge, for what changed lately. */
export interface ChangeData {
  itemId: string;
  pageId: string;
  /** The page's title. */
  title: string;
  /** Markdown. */
  text: string;
  /** Added, replacing what was true, or corrected where it stood. */
  kind: 'added' | 'updated' | 'corrected';
  /** The first thing on its page, which makes it a new page. */
  newPage: boolean;
  /** On the space's overview rather than a page. */
  overview?: boolean;
  by: Author;
  agent: string | null;
  /** The assistant that made the change for the person who wrote it, which stays theirs. */
  editAgent?: string | null;
  /** Who shared it from their own side, when that's what changed. */
  sharedBy?: Author;
  at: string;
  onlyYou: boolean;
  /** On a page that's archived. */
  pageArchived?: boolean;
  /** Where it changed, and whether that space is archived, as you see it. */
  space: { id: string | null; name: string | null; within: string | null; private?: boolean; archived?: boolean };
}

/** A space's overview: what people wrote about where it stands, and the map Homing keeps beside it. */
export interface OverviewData {
  /** The written overview as you see it: the shared one, your own, or both. */
  overview: { id: string; text: string; shared: boolean; by: Author; agent: string | null; editAgent?: string | null; writtenAt: string; replacesShared: string | null; earlier?: Version[] }[];
  /** The pages changed most recently, and how many there are in all. */
  active: PageSummary[];
  pages: number;
  collections: PageSummary[];
  decisions: PageSummary[];
  waiting: { id: string; action: 'add rule' | 'change rule' | 'remove rule' | 'add space' | 'change members' | 'publish' | 'share task' | 'archive space' | 'share space' | 'archive page' | 'reopen page' | 'add include' | 'remove include' | 'plan'; kind: string; text: string | null; asked?: boolean; member?: 'add' | 'make admin' | 'make member' | 'remove' | null; included?: 'rules' | 'skill' | null; changes?: number | null; assistant: string; request: { by: string | null; yours: boolean; sent: boolean } | null }[];
  spaces: { id: string; name: string; closed: boolean; archived?: boolean }[];
}

/** Writing a space's overview, for everyone or only you. Answers with what went wrong, or nothing. */
/** Writes the overview, or one of them in particular, such as one whose earlier version is restored. */
export type WriteOverview = (text: string, shared: boolean, item?: string) => Promise<string | undefined>;
