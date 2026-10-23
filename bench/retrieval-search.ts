// Search as benchmark 4 tries it, kept out of src/: the same query as Homing's search, ranked by
// BM25 over only what the user can see, by BM25 over everything, by ts_rank as today, or by
// similarity of embeddings, and two rankings fused. Each runs as the user, under row-level
// security, and keeps search's own rules: what the viewer can see, pages found once, and items
// that are no longer true last.

import type { Session, Sql } from '../src/db.ts';
import { current, sharedAsCopy, visible, visibleContent } from '../src/knowledge.ts';

/** One query word: matched whole, or by how it starts. */
export interface Term {
  term: string;
  prefix: boolean;
}

/** What a search found, with the score it ranked by. */
export interface Found {
  kind: 'page' | 'item' | 'source' | 'task';
  id: string;
  spaceId: string;
  score: number;
  superseded: boolean;
  archived: boolean;
}

/** Search's filters: only current items, only knowledge (no rules or skills), only active pages. */
export interface Filters {
  current?: boolean;
  knowledge?: boolean;
  active?: boolean;
  limit?: number;
  /**
   * For BM25: words in more than this share of the documents still count in the score, but don't
   * make a document a candidate, so "the" doesn't make every document one. At a half, classic
   * BM25 gives such a word no weight at all.
   */
  prune?: number;
}

/** The words of a query by letters and digits, as Homing's search split them until #115, the longer ones by how they start. */
export function termsOf(query: string): Term[] {
  const words = query.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 32) ?? [];
  return [...new Set(words)].map((term) => ({ term, prefix: term.length >= 4 }));
}

/**
 * The words of a query the way PostgreSQL splits a document, so that "2026-0417", "NW-1432" and
 * "2.4.1" are looked for as the notes have them. Longer ones match by how they start.
 */
export async function parsedTermsOf(s: Session, query: string): Promise<Term[]> {
  const rows = await s.tx<{ lexeme: string }[]>`select lexeme from unnest(to_tsvector('simple', ${query.normalize('NFC')})) order by lexeme`;
  return rows.slice(0, 32).map(({ lexeme }) => ({ term: lexeme, prefix: [...lexeme].length >= 4 }));
}

/** A tsquery that matches any of the terms. */
export function anyOf(terms: Term[]): string {
  return terms.map(({ term, prefix }) => `'${term.replaceAll("'", "''").replaceAll('\\', '\\\\')}'${prefix ? ':*' : ''}`).join(' | ');
}

/** How many documents there are and how long they are on average, and in how many each term is. */
export interface Stats {
  documents: number;
  averageLength: number;
  frequencies: number[];
}

/**
 * BM25's statistics over what the user can see, counted as they search: the items they can see,
 * shared and their own, and the sources. A document's length is its size in bytes, which
 * PostgreSQL knows without reading the text.
 */
export async function userStats(s: Session, terms: Term[]): Promise<Stats> {
  const [{ documents, total }] = await s.tx<{ documents: number; total: number }[]>`
    select (select count(*) from content c where ${visibleContent(s, 'c')})::float8 + (select count(*) from sources src where ${visible(s, 'src')})::float8 as documents,
           (select coalesce(sum(octet_length(c.body)), 0) from content c where ${visibleContent(s, 'c')})::float8
             + (select coalesce(sum(octet_length(src.excerpt)), 0) from sources src where ${visible(s, 'src')})::float8 as total
  `;
  const frequencies = terms.length
    ? (
        await s.tx<{ df: number }[]>`
          select (select count(*) from content c where c.search @@ to_tsquery('simple', t.q) and ${visibleContent(s, 'c')})::float8
               + (select count(*) from sources src where src.search @@ to_tsquery('simple', t.q) and ${visible(s, 'src')})::float8 as df
          from unnest(${terms.map((term) => anyOf([term]))}::text[]) with ordinality as t (q, n)
          order by t.n
        `
      ).map((row) => row.df)
    : [];
  return { documents, averageLength: documents ? total / documents : 1, frequencies };
}

/** The same statistics over every row, whoever can see it: what a shared index would hold. */
export async function globalStats(admin: Sql, terms: Term[]): Promise<Stats> {
  const [{ documents, total }] = await admin<{ documents: number; total: number }[]>`
    select (select count(*) from content)::float8 + (select count(*) from sources)::float8 as documents,
           (select coalesce(sum(octet_length(body)), 0) from content)::float8 + (select coalesce(sum(octet_length(excerpt)), 0) from sources)::float8 as total
  `;
  const frequencies = terms.length
    ? (
        await admin<{ df: number }[]>`
          select (select count(*) from content c where c.search @@ to_tsquery('simple', t.q))::float8
               + (select count(*) from sources src where src.search @@ to_tsquery('simple', t.q))::float8 as df
          from unnest(${terms.map((term) => anyOf([term]))}::text[]) with ordinality as t (q, n)
          order by t.n
        `
      ).map((row) => row.df)
    : [];
  return { documents, averageLength: documents ? total / documents : 1, frequencies };
}

/** BM25's usual settings. */
const k1 = 1.2;
const b = 0.75;

/** How much a term weighs: rare across the documents, much; in nearly all of them, almost nothing. */
export function idf(documents: number, frequency: number): number {
  return Math.log(1 + (documents - frequency + 0.5) / (frequency + 0.5));
}

export type Ranking = { by: 'ts_rank' } | { by: 'bm25'; stats: Stats } | { by: 'semantic'; model: string; vector: number[] };

/**
 * Search's query over items and sources, as `search` in src/knowledge.ts runs it without a space,
 * ranked another way. With ts_rank and the same terms it returns what `search` returns.
 */
export async function rankedSearch(s: Session, terms: Term[], ranking: Ranking, filters: Filters = {}): Promise<Found[]> {
  if (ranking.by !== 'semantic' && terms.length === 0) return [];
  const prune = filters.prune;
  const candidates = ranking.by === 'bm25' && prune !== undefined ? terms.filter((_, n) => ranking.stats.frequencies[n] <= prune * ranking.stats.documents) : terms;
  if (ranking.by !== 'semantic' && candidates.length === 0) return [];
  const tsquery = anyOf(terms);
  const candidateQuery = anyOf(candidates);
  const matches = (column: string) => (ranking.by === 'semantic' ? s.tx`true` : s.tx`${s.tx(column)} @@ to_tsquery('simple', ${candidateQuery})`);
  const weights = ranking.by === 'bm25' ? terms.map((_, n) => idf(ranking.stats.documents, ranking.stats.frequencies[n])) : [];
  const score = (table: string, text: string) => {
    if (ranking.by === 'ts_rank') return s.tx`ts_rank(${s.tx(table)}.search, to_tsquery('simple', ${tsquery}), 1)`;
    if (ranking.by === 'semantic') return s.tx`bench_dot(e.embedding, ${ranking.vector}::float4[])`;
    // Each term's weight, times how often it's in the document, damped and scaled by the document's length.
    return s.tx`(
      select coalesce(sum(w.weight * tf.n * ${k1 + 1}::float8 / (tf.n + ${k1}::float8 * (1 - ${b}::float8 + ${b}::float8 * octet_length(${s.tx(table)}.${s.tx(text)})::float8 / ${ranking.stats.averageLength}::float8))), 0)
      from unnest(${terms.map((t) => t.term)}::text[], ${terms.map((t) => (t.prefix ? 1 : 0))}::int[], ${weights}::float8[]) as w (term, prefix, weight),
      lateral (
        select sum(coalesce(array_length(u.positions, 1), 1))::float8 as n from unnest(${s.tx(table)}.search) u
        where u.lexeme = w.term or (w.prefix = 1 and starts_with(u.lexeme, w.term))
      ) tf
      where tf.n > 0
    )`;
  };
  const embedded = (table: string, kind: string) =>
    ranking.by === 'semantic' ? s.tx`join bench_embeddings e on e.ref_id = ${s.tx(table)}.id and e.kind = ${kind} and e.model = ${ranking.model}` : s.tx``;

  const rows = await s.tx<Found[]>`
    select kind, id, space_id, superseded, archived, score from (
    select distinct on (kind, id) * from (
      select case when c.kind in ('title', 'file') then 'page' else 'item' end as kind,
             case when c.kind in ('title', 'file') then c.page_id else c.id end as id,
             c.space_id, (select p.type from pages p where p.id = c.page_id) as page_type,
             not ${current(s, 'c')} as superseded,
             coalesce((select p.archived from pages p where p.id = c.page_id), false) as archived,
             ${score('c', 'body')} as score, c.kind as item_kind, ${sharedAsCopy(s, 'c')} as shared_as_copy
      from content c ${embedded('c', 'content')}
      where ${matches('c.search')} and ${visibleContent(s, 'c')}
      union all
      select 'source', src.id, src.space_id, null, false, false, ${score('src', 'excerpt')}, null, false
      from sources src ${embedded('src', 'source')}
      where ${matches('src.search')} and ${visible(s, 'src')}
      offset 0
    ) hits
    where not (${filters.current ?? false} and superseded) and not (item_kind = 'file' and superseded) and not shared_as_copy
      and not (${filters.active ?? false} and archived)
      and not (${filters.knowledge ?? false} and coalesce(page_type, '') in ('guidance', 'skill'))
    order by kind, id, superseded, score desc
    ) best
    order by superseded, score desc
    limit ${filters.limit ?? 20}
  `;
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

/** Tasks the user can see, closest in meaning first. */
export async function semanticTasks(s: Session, model: string, vector: number[], limit = 20): Promise<Found[]> {
  const rows = await s.tx<Found[]>`
    select 'task' as kind, t.id, t.space_id, false as superseded, false as archived, bench_dot(e.embedding, ${vector}::float4[]) as score
    from tasks t join bench_embeddings e on e.ref_id = t.id and e.kind = 'task' and e.model = ${model}
    where ${visible(s, 't')}
    order by score desc
    limit ${limit}
  `;
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

/**
 * Reciprocal Rank Fusion: each list gives a document 1 / (60 + its rank), and the sums decide.
 * Ranks, not scores, so lists scored on different scales fuse fairly.
 */
export function fuse<T extends { kind: string; id: string }>(lists: T[][], limit = 20): (T & { score: number })[] {
  const fused = new Map<string, { hit: T; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = `${hit.kind}:${hit.id}`;
      const entry = fused.get(key) ?? { hit, score: 0 };
      entry.score += 1 / (60 + rank + 1);
      fused.set(key, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score }));
}

/** The bench database's own table of embeddings, and the dot product that compares them. Never in Homing's schema. */
export async function prepareEmbeddings(admin: Sql) {
  await admin`
    create table if not exists bench_embeddings (
      kind text not null, ref_id uuid not null, model text not null, embedding float4[] not null,
      primary key (model, kind, ref_id)
    )
  `;
  await admin`
    create or replace function bench_dot(a float4[], b float4[]) returns float8 language sql immutable parallel safe
    as $$ select sum(x::float8 * y::float8) from unnest(a, b) as t (x, y) $$
  `;
  await admin`grant select on bench_embeddings to homing_app`;
  await admin`grant execute on function bench_dot(float4[], float4[]) to homing_app`;
}
