/** Where a result is: a space by name and the space it's in, or unnamed when it's a space above that you can't open. */
export interface Where {
  id: string | null;
  name: string | null;
  within: string | null;
  private?: boolean;
}

/** Everything you can see that matches a search, the same results your assistant gets, by kind. */
export interface SearchData {
  spaces: (Where & { id: string; name: string })[];
  pages: { id: string; title: string; type: string | null; text: string | null; onlyYou: boolean; superseded: boolean; updatesShared: boolean; space: Where }[];
  rules: { id: string; text: string; kind: 'requirement' | 'preference'; onlyYou: boolean; space: Where }[];
  skills: { id: string; name: string; onlyYou: boolean; space: Where }[];
  sources: { id: string; reference: string | null; excerpt: string; onlyYou: boolean; space: Where }[];
}

export type SearchKind = 'all' | 'pages' | 'sources' | 'rules' | 'skills' | 'spaces';

/** "Website in Acme", "your personal space", or "a space above". */
export function placeName(where: Where): string {
  if (!where.name) return 'a space above';
  return where.within ? `${where.name} in ${where.within}` : where.name;
}
