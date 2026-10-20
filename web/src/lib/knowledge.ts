/** A page in a space's list of pages, as the person sees it. */
export interface PageSummary {
  id: string;
  type: string | null;
  title: string;
  /** Its first item, for a glimpse of what it says. */
  excerpt: string | null;
  updatedAt: string;
  /** Nobody else sees any of it. */
  onlyYou: boolean;
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
}

/** Who wrote something: you, someone by name, or someone the reader no longer shares a space with. Null when a space's own routine did. */
export type Author = { name: string | null; you: boolean } | null;

export interface ItemData {
  id: string;
  /** Markdown. */
  text: string;
  shared: boolean;
  by: Author;
  /** The assistant that wrote it for that person, or null when they wrote it themselves. */
  agent: string | null;
  writtenAt: string;
  sources: { id: string; reference: string | null; excerpt: string }[];
  /** What it replaced. When it's your private update to something shared, the others still see that. */
  replaced: { text: string; shared: boolean; until: string } | null;
  /** What it said before it was last changed, oldest first. */
  earlier: { text: string; by: Author; agent: string | null; writtenAt: string; until: string }[];
}

/** A page as the person sees it: the shared items and their own, and no trace of anyone else's. */
export interface PageData {
  id: string;
  title: string;
  type: string | null;
  updatedAt: string;
  space: { id: string; name: string; personal: boolean; private: boolean };
  items: ItemData[];
}

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
  return author.you ? 'You' : (author.name ?? 'Someone');
}
