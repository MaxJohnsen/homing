// Benchmark 4, retrieval: how well Homing's search and context find what a consultant asks about,
// against BM25, semantic search, a hybrid and query interpretation, with row-level security on.
//
//   npm run bench:retrieval -- run                    every approach that needs no model
//   npm run bench:retrieval -- pilot --max-spend 0.2  embeddings and interpretation for a few queries
//   npm run bench:retrieval -- run --max-spend 3      everything, with paid calls where nothing is cached
//   npm run bench:retrieval -- run --approaches bm25  some approaches again, keeping the others' results
//   npm run bench:retrieval -- report                 the tables, from results/retrieval.jsonl
//   npm run bench:retrieval -- privacy                whether others' private items change your ranking
//   npm run bench:retrieval -- latency --max-spend 0.05   how long the paid calls take
//   npm run bench:retrieval -- synthetic              a database with one space of 176,000 items
//   npm run bench:retrieval -- scale <database>       latency there or in a sample, as Ana: --timeout, --repeat
//
// It builds the world in retrieval-set.ts through Homing's own operations, in the database
// HOMING_BENCH_DB names (homing_bench4 by default), served on HOMING_BENCH_PORT. Paid calls pass
// the spending guard in budget.ts. Embeddings are cached outside git, interpretations in results/.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { withPrincipal, type Principal, type Session } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { addSource, archivePage, createPage, queryTerms, search, supersedeItem, tellingWords, writeItem } from '../src/knowledge.ts';
import { searchProposals } from '../src/proposals.ts';
import { saveSkill, skillsMatching } from '../src/skills.ts';
import { addMember, archiveSpace, createSpace, listSpaces } from '../src/spaces.ts';
import { addTask, searchTasks } from '../src/tasks.ts';
import { assistants, Assistant } from '../test/assistant.ts';
import { hardCap, Ledger, ledgerPath, OverBudget, usd } from './budget.ts';
import { join, startHoming, type Bench } from './homing.ts';
import { Embedder, fileKey, keyUsage, listedEmbeddingModels, listedModels, Model, redact, type FunctionTool } from './openrouter.ts';
import {
  categories,
  filler,
  fillerDates,
  fillerNames,
  fillerTemplates,
  monthCount,
  othersOnly,
  pages,
  queries,
  rules,
  skills,
  sources,
  spaces,
  tasks,
  type Category,
  type Query,
  type SpaceKey,
  type Writer,
} from './retrieval-set.ts';
import { fuse, globalStats, parsedTermsOf, prepareEmbeddings, rankedSearch, semanticTasks, termsOf, userStats, type Filters, type Found, type Term } from './retrieval-search.ts';

const here = new URL('./', import.meta.url);
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'max-spend': { type: 'string' },
    repeat: { type: 'string', default: '3' },
    queries: { type: 'string' },
    approaches: { type: 'string' },
    timeout: { type: 'string', default: '60000' },
    results: { type: 'string', default: 'retrieval' },
  },
});
if (!/^[a-z0-9-]+$/.test(values.results!)) throw new Error('--results takes a name of lowercase letters, digits and dashes.');
const resultsPath = new URL(`results/${values.results}.jsonl`, here).pathname;
const interpretationsPath = new URL('results/retrieval-interpretations.json', here).pathname;
const embeddingsCache = new URL('results/retrieval-embeddings.cache.json', here).pathname;

/** Two small multilingual embedding models: an open one anyone could run themselves, and OpenAI's small one. */
const embeddingModels = ['baai/bge-m3', 'openai/text-embedding-3-small'];
/** Two cheap chat models that write the search words, one from each maker the other benchmarks use. */
const interpreters = ['anthropic/claude-haiku-5.5', 'openai/gpt-6-luna'];

// The MCP client warns on every connection about a callback check the benchmarks don't need.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (!String(args[0]).startsWith('[mcp-sdk]')) warn(...args);
};

if (!process.env.HOMING_BENCH_DB) process.env.HOMING_BENCH_DB = 'homing_bench4';
const port = Number(process.env.HOMING_BENCH_PORT ?? 4431);

// The world.

/** Every key the set names, with what it is in this world. */
interface Labeled {
  kind: 'page' | 'item' | 'source' | 'task';
  id: string;
  /** For an item, its page. */
  pageId?: string;
  /** For an item, whether something replaced it. */
  superseded?: boolean;
}

export interface World {
  bench: Bench;
  ana: Principal;
  spaceIds: Record<SpaceKey, string>;
  labeled: Map<string, Labeled>;
  /** What each id is, for scoring: the keys it answers to, and its page. */
  keysOf: Map<string, string[]>;
  pageOf: Map<string, string>;
  /** Ids Ana must never see: others' private items, pages, sources and tasks, and everything in Polar Freight. */
  forbidden: Set<string>;
  /** Ids that are no longer current or are archived: superseded items, archived pages and what's in archived spaces. */
  stale: Set<string>;
  assistant: Assistant;
}

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export async function buildWorld(bench: Bench): Promise<World> {
  const people = { ana: await join(bench, 'Ana Berg'), cara: await join(bench, 'Cara Lund'), ben: await join(bench, 'Ben Dahl') };
  const principal = (writer: Writer): Principal =>
    writer === 'assistant' ? { person: people.ana.id, agent: assistants.claude.client_name } : { person: people[writer].id, direct: true };
  const as = <T>(writer: Writer, fn: (s: Session) => Promise<T>) => withPrincipal(bench.sql, principal(writer), fn);

  const spaceIds = { personal: people.ana.personalSpaceId } as Record<SpaceKey, string>;
  for (const space of spaces) {
    spaceIds[space.key] = await as(space.by, (s) => createSpace(s, { name: space.name, parentId: space.parent && spaceIds[space.parent], closed: space.closed }));
    if (space.key === 'acme') await as('ana', (s) => addMember(s, spaceIds.acme, people.cara.id, 'admin'));
    if (space.key === 'beta') await as('ben', (s) => addMember(s, spaceIds.beta, people.ana.id));
  }

  const labeled = new Map<string, Labeled>();
  await as('ana', async (s) => {
    for (const rule of rules) await addRule(s, { spaceId: spaceIds[rule.space], kind: rule.kind, body: rule.body, shared: rule.shared });
    for (const skill of skills) {
      const page = await saveSkill(s, {
        spaceId: spaceIds[skill.space],
        shared: true,
        files: [{ path: 'SKILL.md', body: `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n${skill.body}` }],
      });
      labeled.set(skill.key, { kind: 'page', id: page.pageId });
    }
  });

  for (const page of pages) {
    const pageId = await as(page.by, (s) => createPage(s, { spaceId: spaceIds[page.space], title: page.title, type: page.type, shared: page.shared }));
    labeled.set(page.key, { kind: 'page', id: pageId });
    for (const item of page.items) {
      const spec = typeof item === 'string' ? { text: item } : item;
      const by = spec.by ?? page.by;
      const shared = spec.shared ?? page.shared;
      const written = await as(by, (s) => writeItem(s, { pageId, body: spec.text, shared }));
      if (spec.key) labeled.set(spec.key, { kind: 'item', id: written.id, pageId, superseded: Boolean(spec.replacedBy) });
      if (spec.replacedBy) {
        const now = await as(by, (s) => supersedeItem(s, written.id, { body: spec.replacedBy!, shared }));
        if (spec.key) labeled.set(`${spec.key}.now`, { kind: 'item', id: now!.id, pageId });
      }
    }
  }
  for (const source of sources) {
    const added = await as(source.by, (s) => addSource(s, { spaceId: spaceIds[source.space], reference: source.reference, excerpt: source.excerpt, shared: source.shared }));
    labeled.set(source.key, { kind: 'source', id: added.id });
  }
  for (const task of tasks) {
    const added = await as(task.by, (s) => addTask(s, { spaceId: spaceIds[task.space], title: task.title, due: task.due, shared: task.shared }));
    labeled.set(task.key, { kind: 'task', id: added.id });
  }
  await writeFiller(as, spaceIds);

  // Finished work: an archived client, and pages nobody needs day to day.
  await as('ana', async (s) => {
    for (const page of pages.filter((page) => page.archived)) await archivePage(s, labeled.get(page.key)!.id, true);
    for (const space of spaces.filter((space) => space.archived)) await archiveSpace(s, spaceIds[space.key], true);
  });

  const assistant = new Assistant(bench.homing.url, assistants.claude);
  await assistant.connect(people.ana.browser);
  const ana = principal('assistant');
  // The spaces Ana can't open, by the access rule: Cara's closed client space and the others' personal spaces.
  const closedToAna = [...spaces.filter((space) => space.closed && space.by !== 'ana').map((space) => spaceIds[space.key]), people.cara.personalSpaceId, people.ben.personalSpaceId];
  const labels = await labelsOf(bench, ana, labeled);
  await checkForbidden(bench, labels.forbidden, labeled, { ana: people.ana.id, closedToAna });
  return { bench, ana, spaceIds, labeled, ...labels, assistant };
}

/** Filler pages, items and sources, the same every time. */
async function writeFiller(as: <T>(writer: Writer, fn: (s: Session) => Promise<T>) => Promise<T>, spaceIds: Record<SpaceKey, string>) {
  const random = seeded(4);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  for (const batch of filler) {
    const templates = fillerTemplates[batch.language];
    const names = fillerNames[batch.language];
    const date = () => fillerDates(batch.language, 1 + Math.floor(random() * 28), Math.floor(random() * monthCount));
    await as(batch.by, async (s) => {
      for (let n = 0; n < batch.pages; n++) {
        const subject = pick(batch.subjects);
        const title = pick(templates.titles)(subject, date());
        const pageId = await createPage(s, { spaceId: spaceIds[batch.space], title, shared: batch.shared });
        const count = 1 + Math.floor(random() * 4);
        for (let item = 0; item < count; item++) await writeItem(s, { pageId, body: pick(templates.items)(subject, pick(names), date()), shared: batch.shared });
        if (random() < 0.6) {
          const source = pick(templates.sources)(pick(batch.subjects), pick(names));
          await addSource(s, { spaceId: spaceIds[batch.space], reference: `${source.reference}, ${date()}`, excerpt: source.excerpt, shared: batch.shared });
        }
      }
    });
  }
}

/** What each id answers to, what Ana mustn't see, and what's stale, from the database itself. */
async function labelsOf(bench: Bench, ana: Principal, labeled: Map<string, Labeled>) {
  const keysOf = new Map<string, string[]>();
  for (const [key, { id }] of labeled) keysOf.set(id, [...(keysOf.get(id) ?? []), key]);
  const pageOf = new Map<string, string>();
  for (const row of await bench.admin<{ id: string; pageId: string }[]>`select id, page_id from content`) pageOf.set(row.id, row.pageId);

  const everything = await bench.admin<{ id: string }[]>`
    select id from content union select page_id from content union select id from sources union select id from tasks union select id from spaces
  `;
  const seen = await withPrincipal(bench.sql, ana, (s) => s.tx<{ id: string }[]>`
    select id from content union select page_id from content union select id from sources union select id from tasks union select id from spaces
  `);
  const visibleIds = new Set(seen.map((row) => row.id));
  const forbidden = new Set(everything.map((row) => row.id).filter((id) => !visibleIds.has(id)));

  const staleRows = await bench.admin<{ id: string }[]>`
    select c.id from content c where exists (select from content r where r.supersedes = c.id and r.private_to is null)
    union select c.id from content c join pages p on p.id = c.page_id where p.archived
    union select p.id from pages p where p.archived
    union select c.id from content c join spaces sp on sp.id = c.space_id where (select a.archived_at from archived_since(sp.id) a limit 1) is not null
    union select c.page_id from content c join spaces sp on sp.id = c.space_id where (select a.archived_at from archived_since(sp.id) a limit 1) is not null
    union select src.id from sources src join spaces sp on sp.id = src.space_id where (select a.archived_at from archived_since(sp.id) a limit 1) is not null
    union select t.id from tasks t join spaces sp on sp.id = t.space_id where (select a.archived_at from archived_since(sp.id) a limit 1) is not null
  `;
  // Ana's own private replacement makes her original stale for her too.
  const ownReplaced = await withPrincipal(bench.sql, ana, (s) => s.tx<{ id: string }[]>`
    select c.id from content c where exists (select from content r where r.supersedes = c.id)
  `);
  const stale = new Set([...staleRows, ...ownReplaced].map((row) => row.id));
  return { keysOf, pageOf, forbidden, stale };
}

/**
 * Row-level security must hide from Ana exactly what the access rule, written out by hand for this
 * world, says she can't see: everything in the spaces she can't open, and everyone else's private
 * items, sources and tasks, with the pages nothing she sees is on. Every approach runs under row-level
 * security, so the leak check on its results can only catch what this agrees with.
 */
async function checkForbidden(bench: Bench, forbidden: Set<string>, labeled: Map<string, Labeled>, rule: { ana: string; closedToAna: string[] }) {
  const hidden = (table: string) => bench.admin`(${bench.admin(table)}.space_id = any(${rule.closedToAna}::uuid[]) or (${bench.admin(table)}.private_to is not null and ${bench.admin(table)}.private_to <> ${rule.ana}::uuid))`;
  const rows = await bench.admin<{ id: string }[]>`
    select c.id from content c where ${hidden('c')}
    union select c.page_id from content c where not exists (select from content v where v.page_id = c.page_id and not ${hidden('v')})
    union select src.id from sources src where ${hidden('src')}
    union select t.id from tasks t where ${hidden('t')}
    union select unnest(${rule.closedToAna}::uuid[])
  `;
  const expected = new Set(rows.map((row) => row.id));
  const missing = [...expected].filter((id) => !forbidden.has(id));
  const extra = [...forbidden].filter((id) => !expected.has(id));
  if (missing.length || extra.length) {
    throw new Error(`Row-level security and the access rule disagree: ${missing.length} ids Ana sees but mustn't, ${extra.length} she can't see but may.`);
  }
  // The set's own labels agree: what Cara and Ben keep to themselves, and Polar Freight, is hidden; nothing else is.
  const theirs = new Set([
    ...pages.filter((page) => page.space === 'polar' || (!page.shared && (page.by === 'cara' || page.by === 'ben'))).map((page) => page.key),
    ...pages.flatMap((page) => page.items.flatMap((item) => (typeof item !== 'string' && item.key && (page.space === 'polar' || (item.shared === false && (item.by === 'cara' || item.by === 'ben'))) ? [item.key] : []))),
    ...sources.filter((source) => source.space === 'polar' || (!source.shared && source.by !== 'ana' && source.by !== 'assistant')).map((source) => source.key),
    ...tasks.filter((task) => task.space === 'polar' || (!task.shared && task.by !== 'ana' && task.by !== 'assistant')).map((task) => task.key),
  ]);
  for (const [key, { id }] of labeled) {
    if (theirs.has(key) !== forbidden.has(id)) throw new Error(`${key} is ${forbidden.has(id) ? 'hidden from' : 'shown to'} Ana, against the set.`);
  }
  console.log(`Row-level security hides from Ana exactly the ${forbidden.size} ids the access rule says it should, ${theirs.size} of them labeled.`);
}

// Running a query.

/** A line of what an approach returned, in order. */
interface Line {
  kind: string;
  id: string;
  score?: number;
}

interface Outcome {
  lines: Line[];
  /** It said that nothing matches. */
  nothing: boolean;
  /** The text a model would read, for the leak check on words. */
  text?: string;
  /** For context: the space it picked, or the spaces it listed. */
  picked?: string;
  candidates?: string[];
  ms: number;
}

interface Ctx {
  world: World;
  mcp: Awaited<ReturnType<Assistant['open']>>;
  vectors: Map<string, number[]>;
  interpretations: Map<string, string>;
}

interface Approach {
  id: string;
  label: string;
  /** What it needs that costs money: embeddings, or a model's interpretation. */
  needs?: { embeddings?: string; interpreter?: string };
  /** Only its latency is reported: it returns what another approach does. */
  latencyOnly?: boolean;
  run(query: Query, ctx: Ctx): Promise<Outcome>;
}

const refPattern = /\b(space|page|item|source|proposal|task):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

/** The first reference on each line of a tool's answer. */
function linesOf(text: string): Line[] {
  return text
    .split('\n')
    .map((line) => refPattern.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ kind: match[1], id: match[2] }));
}

/** context's answer: the space it picked or listed, and what it shows as matching, in order. */
function contextOutcome(text: string, ms: number): Outcome {
  const sections = new Map<string, string>();
  let heading = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) heading = line.slice(3).trim();
    else sections.set(heading, `${sections.get(heading) ?? ''}${line}\n`);
  }
  const picked = /^Picked .*?\n/.test(text) ? /\(space:([0-9a-f-]{36})\)/.exec(text)?.[1] : undefined;
  const shown = ['Relevant to the request', 'Skills that fit', 'Skills', 'Open tasks'].flatMap((name) => linesOf(sections.get(name) ?? ''));
  return {
    lines: shown,
    nothing: /Nothing in Homing matches/.test(text),
    text,
    picked,
    candidates: linesOf(sections.get('Spaces that fit') ?? '').map((line) => line.id),
    ms,
  };
}

/** Times a function as Ana, in her own transaction under row-level security. */
async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - started };
}

const asAna = <T>(ctx: Ctx, fn: (s: Session) => Promise<T>) => withPrincipal(ctx.world.bench.sql, ctx.world.ana, fn);

/** Spaces the request names, whose archived contents context still considers. */
async function everyday(s: Session, request: string) {
  const all = await listSpaces(s);
  const named = (name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(request);
  const out = new Set(all.filter((space) => space.archived && !named(space.name)).map((space) => space.id));
  return <T extends { spaceId: string }>(found: T[]) => found.filter((one) => !out.has(one.spaceId));
}

const asLines = (found: { kind: string; id: string; score?: number }[]): Line[] => found.map(({ kind, id, score }) => ({ kind, id, score }));
const taskLines = (found: { id: string }[]): Line[] => found.map(({ id }) => ({ kind: 'task', id }));
const proposalLines = (found: { id: string }[]): Line[] => found.map(({ id }) => ({ kind: 'proposal', id }));
const skillLines = (found: { pageId: string }[]): Line[] => found.map(({ pageId }) => ({ kind: 'page', id: pageId }));

/** As search's tool answers: matching items and sources, then tasks, then proposals still waiting. */
async function searchShaped(s: Session, query: string, content: Found[]): Promise<Line[]> {
  return [...asLines(content), ...taskLines(await searchTasks(s, query)), ...proposalLines(await searchProposals(s, query))];
}

/** As context without a space ranks: knowledge for the words, outside archived spaces, then tasks, proposals and skills for the telling words. */
async function contextShaped(s: Session, request: string, telling: string, knowledge: Found[]): Promise<Outcome> {
  const keep = await everyday(s, request);
  const found = keep(knowledge.map((hit) => ({ ...hit, spaceId: hit.spaceId }))).slice(0, 20);
  const tasksFound = telling ? keep(await searchTasks(s, telling, { limit: 20 })) : [];
  const waiting = telling ? keep(await searchProposals(s, telling, { limit: 20 })) : [];
  const skillsFound = telling ? keep(await skillsMatching(s, telling, 20)).slice(0, 3) : [];
  const lines = [...asLines(found), ...taskLines(tasksFound), ...proposalLines(waiting), ...skillLines(skillsFound)];
  return { lines, nothing: lines.length === 0, ms: 0 };
}

const contextFilters: Filters = { limit: 50, current: true, knowledge: true, active: true };

async function bm25(s: Session, terms: Term[], filters?: Filters) {
  return rankedSearch(s, terms, { by: 'bm25', stats: await userStats(s, terms) }, filters);
}

const approaches: Approach[] = [
  {
    id: 'search',
    label: '(a) search, as on main, given the request',
    async run(query, ctx) {
      const { value, ms } = await timed(() => ctx.mcp.call('search', { query: query.text }));
      return { lines: linesOf(value.text), nothing: value.text.trim() === 'No matches.', text: value.text, ms };
    },
  },
  {
    id: 'context',
    label: '(a) context without a space, as on main',
    async run(query, ctx) {
      const { value, ms } = await timed(() => ctx.mcp.call('context', { request: query.text }));
      return contextOutcome(value.text, ms);
    },
  },
  {
    id: 'search-sql',
    label: "(a) search's queries alone, without MCP",
    latencyOnly: true,
    async run(query, ctx) {
      const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, query.text, (await search(s, query.text)).map((hit) => ({ ...hit, score: 0 }) as Found))));
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  {
    id: 'telling',
    label: '(a) the ranking context uses: telling words, ts_rank',
    async run(query, ctx) {
      const { value, ms } = await timed(() =>
        asAna(ctx, async (s) => {
          const telling = await tellingWords(s, query.text);
          const found = telling ? await search(s, telling, contextFilters) : [];
          return contextShaped(s, query.text, telling, found.map((hit) => ({ ...hit, score: 0 }) as Found));
        }),
      );
      return { ...value, ms };
    },
  },
  {
    id: 'tokens',
    label: "(a) search with the query split as PostgreSQL splits notes",
    async run(query, ctx) {
      const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, query.text, await rankedSearch(s, await parsedTermsOf(s, query.text), { by: 'ts_rank' }))));
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  {
    id: 'bm25',
    label: '(b) BM25 over what Ana can see, given the request',
    async run(query, ctx) {
      const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, query.text, await bm25(s, termsOf(query.text)))));
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  {
    id: 'bm25-pruned',
    label: "(b) BM25 over what Ana can see, given the request, words in over half her documents don't make candidates",
    async run(query, ctx) {
      const { value, ms } = await timed(() =>
        asAna(ctx, async (s) => {
          const terms = termsOf(query.text);
          return searchShaped(s, query.text, await rankedSearch(s, terms, { by: 'bm25', stats: await userStats(s, terms) }, { prune: 0.5 }));
        }),
      );
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  {
    id: 'bm25-telling',
    label: "(b) BM25 over what Ana can see, telling words, context's filters",
    async run(query, ctx) {
      const { value, ms } = await timed(() =>
        asAna(ctx, async (s) => {
          const telling = await tellingWords(s, query.text);
          return contextShaped(s, query.text, telling, telling ? await bm25(s, termsOf(telling), contextFilters) : []);
        }),
      );
      return { ...value, ms };
    },
  },
  {
    id: 'bm25-all-words',
    label: "(b) BM25 over what Ana can see, every word, context's filters",
    async run(query, ctx) {
      const { value, ms } = await timed(() =>
        asAna(ctx, async (s) => contextShaped(s, query.text, await tellingWords(s, query.text), await bm25(s, termsOf(query.text), contextFilters))),
      );
      return { ...value, ms };
    },
  },
  {
    id: 'bm25-tokens',
    label: '(b) BM25 over what Ana can see, the query split as notes are',
    async run(query, ctx) {
      const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, query.text, await bm25(s, await parsedTermsOf(s, query.text)))));
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  {
    id: 'bm25-global',
    label: '(c) BM25 with statistics over everyone, given the request',
    async run(query, ctx) {
      const terms = termsOf(query.text);
      const stats = await globalStats(ctx.world.bench.admin, terms);
      const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, query.text, await rankedSearch(s, terms, { by: 'bm25', stats }))));
      return { lines: value, nothing: value.length === 0, ms };
    },
  },
  ...embeddingModels.flatMap((model): Approach[] => {
    const name = model.split('/')[1];
    const semantic = async (query: Query, ctx: Ctx, s: Session) => {
      const vector = ctx.vectors.get(`${model}\n${query.text}`);
      if (!vector) throw new Error(`No embedding of "${query.text}" with ${model}.`);
      const content = await rankedSearch(s, [], { by: 'semantic', model, vector });
      const taskHits = await semanticTasks(s, model, vector);
      // One list, closest first, items that are no longer true last, as search orders them.
      return [...content, ...taskHits].sort((a, b) => Number(a.superseded) - Number(b.superseded) || b.score - a.score).slice(0, 20);
    };
    return [
      {
        id: `semantic-${name}`,
        label: `(d) semantic, ${model}`,
        needs: { embeddings: model },
        async run(query, ctx) {
          const { value, ms } = await timed(() => asAna(ctx, (s) => semantic(query, ctx, s)));
          return { lines: asLines(value), nothing: value.length === 0, ms };
        },
      },
      {
        id: `hybrid-search-${name}`,
        label: `(d) search and semantic (${name}), fused`,
        needs: { embeddings: model },
        async run(query, ctx) {
          const { value, ms } = await timed(() =>
            asAna(ctx, async (s) => {
              const words = await searchShaped(s, query.text, (await search(s, query.text)).map((hit) => ({ ...hit, score: 0 }) as Found));
              return fuse([words, asLines(await semantic(query, ctx, s))]);
            }),
          );
          return { lines: value, nothing: value.length === 0, ms };
        },
      },
      {
        id: `hybrid-bm25-${name}`,
        label: `(d) BM25 and semantic (${name}), fused`,
        needs: { embeddings: model },
        async run(query, ctx) {
          const { value, ms } = await timed(() =>
            asAna(ctx, async (s) => fuse([await searchShaped(s, query.text, await bm25(s, termsOf(query.text))), asLines(await semantic(query, ctx, s))])),
          );
          return { lines: value, nothing: value.length === 0, ms };
        },
      },
    ];
  }),
  ...interpreters.flatMap((model): Approach[] => {
    const name = model.split('/')[1];
    const words = (query: Query, ctx: Ctx) => {
      const terms = ctx.interpretations.get(`${model}\n${query.text}`);
      if (terms === undefined) throw new Error(`No interpretation of "${query.text}" by ${model}.`);
      return terms;
    };
    return [
      {
        id: `interpreted-${name}`,
        label: `(e) search, given the words ${name} wrote`,
        needs: { interpreter: model },
        async run(query, ctx) {
          const { value, ms } = await timed(() => ctx.mcp.call('search', { query: words(query, ctx) || query.text }));
          return { lines: linesOf(value.text), nothing: value.text.trim() === 'No matches.', text: value.text, ms };
        },
      },
      {
        id: `interpreted-bm25-${name}`,
        label: `(e) BM25 over what Ana can see, given the words ${name} wrote`,
        needs: { interpreter: model },
        async run(query, ctx) {
          const terms = words(query, ctx) || query.text;
          const { value, ms } = await timed(() => asAna(ctx, async (s) => searchShaped(s, terms, await bm25(s, termsOf(terms)))));
          return { lines: value, nothing: value.length === 0, ms };
        },
      },
    ];
  }),
];

// Scoring.

interface Scored {
  approach: string;
  query: string;
  category: Category;
  /** The first 20 lines: each line's keys, or "-" for something no query is about. */
  lines: string[];
  scores?: number[];
  nothing: boolean;
  found: number;
  of: number;
  recall5: number;
  recall10: number;
  recallAll: number;
  reciprocalRank: number;
  /** A should-match-nothing question answered with nothing, or with only what's allowed. */
  nothingRight?: boolean;
  /** Lines Ana must never see. */
  privacy: number;
  /** Stale lines in the first 10, for a question that isn't about the past, and whether one came before the answer. */
  stale: number;
  staleFirst: boolean;
  /** context: picked the space the answer is in, or one above it; listed it among the candidates; or neither. */
  space?: 'picked' | 'wrong' | 'listed' | 'not listed' | 'nothing';
  ms: number;
}

function score(world: World, query: Query, approach: Approach, outcome: Outcome): Scored {
  const lineKeys = outcome.lines.map((line) => {
    const page = line.kind === 'item' ? world.pageOf.get(line.id) : line.kind === 'page' ? line.id : undefined;
    return { line, keys: [...(world.keysOf.get(line.id) ?? []), ...(page && page !== line.id ? (world.keysOf.get(page) ?? []) : [])], page };
  });
  // An expected page counts for any line on it. An expected item counts for itself, or for its page's
  // title while the item is current, since reading the page then shows it.
  const matches = (expected: string, entry: (typeof lineKeys)[number]) => {
    const label = world.labeled.get(expected);
    if (!label) throw new Error(`The query ${query.id} expects ${expected}, which the world doesn't have.`);
    if (label.kind !== 'item') return entry.keys.includes(expected);
    if (entry.line.id === label.id) return true;
    return entry.line.kind === 'page' && entry.line.id === label.pageId && !label.superseded;
  };
  const firstAt = query.expect.map((expected) => lineKeys.findIndex((entry) => matches(expected, entry)));
  const within = (k: number) => {
    const hits = firstAt.filter((at) => at >= 0 && at < k).length;
    if (!query.expect.length) return 0;
    return query.any ? Math.min(hits, 1) : hits / query.expect.length;
  };
  const first = Math.min(...firstAt.filter((at) => at >= 0));
  const allowed = new Set(query.allowed ?? []);
  const onlyAllowed = lineKeys.every((entry) => entry.keys.some((key) => allowed.has(key)) || (entry.page && (world.keysOf.get(entry.page) ?? []).some((key) => allowed.has(key))));
  const leakedWords = outcome.text ? othersOnly.filter((word) => !query.text.toLowerCase().includes(word.toLowerCase()) && outcome.text!.toLowerCase().includes(word.toLowerCase())) : [];
  const privacy = outcome.lines.filter((line) => world.forbidden.has(line.id) || (line.kind === 'item' && world.forbidden.has(world.pageOf.get(line.id) ?? ''))).length + leakedWords.length;
  const isStale = (line: Line) => world.stale.has(line.id);
  const top10 = outcome.lines.slice(0, 10);
  const stale = query.category === 'past' ? 0 : top10.filter(isStale).length;
  const staleAt = top10.findIndex(isStale);
  let space: Scored['space'];
  if (approach.id === 'context' && query.space) {
    const target = world.spaceIds[query.space];
    const covers = (spaceId: string | undefined) => spaceId !== undefined && aboveOrSame(world, spaceId, target);
    space = outcome.nothing ? 'nothing' : outcome.picked ? (covers(outcome.picked) ? 'picked' : 'wrong') : outcome.candidates?.some(covers) ? 'listed' : 'not listed';
  }
  return {
    approach: approach.id,
    query: query.id,
    category: query.category,
    lines: lineKeys.slice(0, 20).map((entry) => (entry.keys.length ? entry.keys.join('|') : world.forbidden.has(entry.line.id) ? 'FORBIDDEN' : '-')),
    scores: outcome.lines.some((line) => line.score !== undefined) ? outcome.lines.slice(0, 20).map((line) => Math.round((line.score ?? 0) * 1e4) / 1e4) : undefined,
    nothing: outcome.nothing,
    found: firstAt.filter((at) => at >= 0).length,
    of: query.expect.length,
    recall5: within(5),
    recall10: within(10),
    recallAll: within(Infinity),
    reciprocalRank: Number.isFinite(first) ? 1 / (first + 1) : 0,
    nothingRight: query.expect.length ? undefined : outcome.nothing || (allowed.size > 0 && onlyAllowed),
    privacy,
    stale,
    staleFirst: query.category !== 'past' && query.expect.length > 0 && staleAt >= 0 && (!Number.isFinite(first) || staleAt < first),
    space,
    ms: outcome.ms,
  };
}

/** Whether a space is the given one or above it, so its context includes it. */
function aboveOrSame(world: World, spaceId: string, target: string): boolean {
  if (spaceId === target) return true;
  const parents: Record<string, string | undefined> = {};
  for (const space of spaces) parents[world.spaceIds[space.key]] = space.parent ? world.spaceIds[space.parent] : undefined;
  for (let at = parents[target], depth = 0; at && depth < 10; at = parents[at], depth++) if (at === spaceId) return true;
  return false;
}

// Paid parts: embeddings and interpretations, cached so nothing is paid for twice.

/** The text each document is embedded as: an item with its page's title, a source with its reference. */
async function documentsToEmbed(world: World): Promise<{ kind: string; id: string; text: string }[]> {
  const content = await world.bench.admin<{ id: string; kind: string; body: string; title: string | null }[]>`
    select c.id, c.kind, c.body,
           (select t.body from content t where t.page_id = c.page_id and t.kind = 'title' order by t.private_to is null desc limit 1) as title
    from content c
  `;
  const sourceRows = await world.bench.admin<{ id: string; reference: string | null; excerpt: string }[]>`select id, reference, excerpt from sources`;
  const taskRows = await world.bench.admin<{ id: string; title: string; description: string | null }[]>`select id, title, description from tasks`;
  return [
    ...content.map((row) => ({ kind: 'content', id: row.id, text: (row.kind === 'title' || row.kind === 'file' || !row.title ? row.body : `${row.title}: ${row.body}`).slice(0, 2000) })),
    ...sourceRows.map((row) => ({ kind: 'source', id: row.id, text: row.reference ? `${row.reference}: ${row.excerpt}` : row.excerpt })),
    ...taskRows.map((row) => ({ kind: 'task', id: row.id, text: row.description ? `${row.title}\n${row.description}` : row.title })),
  ];
}

type Cache = Record<string, number[]>;

function readCache(): Cache {
  return existsSync(embeddingsCache) ? (JSON.parse(readFileSync(embeddingsCache, 'utf8')) as Cache) : {};
}

const normalized = (vector: number[]) => {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => x / length);
};

/** Embeds what isn't cached yet, a hundred texts a call, and stores every document's vector in the bench database. */
async function embedAll(world: World, ledger: Ledger | undefined, texts: string[], only?: Set<string>) {
  const cache = readCache();
  const documents = await documentsToEmbed(world);
  const listed = ledger ? await listedEmbeddingModels() : [];
  let spent = 0;
  for (const model of embeddingModels) {
    const missing = [...new Set([...documents.map((doc) => doc.text), ...texts])].filter((text) => !cache[`${model}\n${text}`] && (!only || only.has(text)));
    if (missing.length) {
      if (!ledger) throw new Error(`${missing.length} texts have no ${model} embedding yet. Run with --max-spend to make them.`);
      const embedder = new Embedder(listed.find((one) => one.id === model) ?? fail(`OpenRouter doesn't list ${model}.`), ledger, { key: fileKey });
      for (let start = 0; start < missing.length; start += 100) {
        const batch = missing.slice(start, start + 100);
        const { vectors, cost } = await embedder.embed(batch, `b4|embed|${model}`);
        batch.forEach((text, n) => (cache[`${model}\n${text}`] = normalized(vectors[n]).map((x) => Math.round(x * 1e6) / 1e6)));
        spent += cost;
        writeFileSync(embeddingsCache, JSON.stringify(cache));
      }
      console.log(`${model}: ${missing.length} texts embedded, ${usd(spent)} so far`);
    }
    const rows = documents.filter((doc) => cache[`${model}\n${doc.text}`]).map((doc) => ({ kind: doc.kind, ref_id: doc.id, model, embedding: cache[`${model}\n${doc.text}`] }));
    await world.bench.admin`delete from bench_embeddings where model = ${model}`;
    for (let start = 0; start < rows.length; start += 500) {
      await world.bench.admin`insert into bench_embeddings ${world.bench.admin(rows.slice(start, start + 500), 'kind', 'ref_id', 'model', 'embedding')}`;
    }
  }
  return new Map(Object.entries(cache));
}

function fail(message: string): never {
  throw new Error(message);
}

const searchTool: FunctionTool = {
  type: 'function',
  function: {
    name: 'search',
    description: "Searches the user's notes, pages, sources and tasks in Homing for any of the words given. Longer words match by how they start.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'The words to search for' } }, required: ['query'] },
    strict: false,
  },
};

const interpreterPrompt =
  "You find things in the user's notes in Homing, which hold their work and life as a consultant, in English and Norwegian. " +
  'For the request below, call search once with the words a note that answers it would contain: names, numbers and identifiers exactly as written, ' +
  'and the key words in both English and Norwegian, with the usual synonyms. Leave out words that would match any note. ' +
  "If the request needs nothing from the user's notes, such as a general question, call search with nothing but the request's own key words. " +
  'Today is Thursday, 22 October 2026.';

/** The search words each interpreter writes for each query, asked once and kept in results/. */
async function interpretAll(ledger: Ledger | undefined, texts: string[]): Promise<Map<string, string>> {
  const kept: Record<string, string> = existsSync(interpretationsPath) ? JSON.parse(readFileSync(interpretationsPath, 'utf8')) : {};
  const missing = interpreters.flatMap((model) => texts.filter((text) => kept[`${model}\n${text}`] === undefined).map((text) => ({ model, text })));
  if (missing.length) {
    if (!ledger) throw new Error(`${missing.length} interpretations aren't made yet. Run with --max-spend to make them.`);
    const listed = await listedModels();
    const models = new Map(interpreters.map((id) => [id, new Model(listed.find((one) => one.id === id) ?? fail(`OpenRouter doesn't list ${id}.`), ledger, { key: fileKey })]));
    let done = 0;
    const queue = [...missing];
    const worker = async () => {
      while (queue.length) {
        const { model, text } = queue.shift()!;
        const completion = await models.get(model)!.complete({
          messages: [
            { role: 'system', content: interpreterPrompt },
            { role: 'user', content: text },
          ],
          tools: [searchTool],
          maxTokens: 1000,
          label: `b4|interpret|${model}`,
        });
        const call = completion.message.tool_calls?.find((one) => one.function.name === 'search');
        let words = '';
        try {
          words = call ? String(JSON.parse(call.function.arguments).query ?? '') : '';
        } catch {
          words = '';
        }
        kept[`${model}\n${text}`] = words || (completion.message.content ?? '').trim();
        writeFileSync(interpretationsPath, `${JSON.stringify(kept, null, 2)}\n`);
        done++;
        if (done % 20 === 0) console.log(`${done}/${missing.length} interpretations, ${usd(ledger.spentThisRun)} this run`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }
  return new Map(Object.entries(kept));
}

// Commands.

async function withWorld<T>(fn: (world: World) => Promise<T>): Promise<T> {
  const bench = await startHoming({ port });
  try {
    await prepareEmbeddings(bench.admin);
    const world = await buildWorld(bench);
    return await fn(world);
  } finally {
    await bench.close();
  }
}

/** Opens the ledger only when paid calls are allowed, and reports what's spent before and after. */
async function withLedger<T>(fn: (ledger: Ledger | undefined) => Promise<T>): Promise<T> {
  if (values['max-spend'] === undefined) return fn(undefined);
  const ledger = new Ledger(ledgerPath, { runLimit: Number(values['max-spend']) });
  try {
    const since = ledger.checkKey(await keyUsage(fileKey));
    console.log(`Spent so far: ${usd(ledger.spent)} of ${usd(hardCap)} by the ledger, ${usd(since)} by the key's usage. This run may spend ${usd(ledger.runLimit)}.`);
    const result = await fn(ledger);
    const after = ledger.checkKey(await keyUsage(fileKey));
    console.log(`Spent ${usd(ledger.spentThisRun)} in this run. In total ${usd(ledger.spent)} by the ledger, and ${usd(after)} by the key's usage since the first run.`);
    return result;
  } catch (error) {
    if (error instanceof OverBudget) console.log(error.message);
    throw error;
  } finally {
    ledger.close();
  }
}

async function run(pilot: boolean) {
  const picked = values.queries?.split(',');
  const chosen = queries.filter((query) => (!picked || picked.includes(query.id)) && (!pilot || pilotQueries.includes(query.id)));
  const repeat = Number(values.repeat);
  await withLedger((ledger) =>
    withWorld(async (world) => {
      const counts = await world.bench.admin`
        select (select count(*) from content) as items, (select count(distinct page_id) from content) as pages, (select count(*) from sources) as sources, (select count(*) from tasks) as tasks
      `;
      console.log(`World: ${JSON.stringify(counts[0])}, ${world.forbidden.size} ids Ana can't see.`);
      const texts = chosen.map((query) => query.text);
      if (pilot) {
        if (!ledger) throw new Error('The pilot makes paid calls: give it --max-spend.');
        // A hundred documents and the pilot's queries with each embedding model, and the pilot's queries interpreted by each model.
        const documents = await documentsToEmbed(world);
        const sample = new Set([...texts, ...documents.slice(0, 100).map((doc) => doc.text)]);
        const embedded = ledger.spentThisRun;
        await embedAll(world, ledger, texts, sample);
        const embedCost = ledger.spentThisRun - embedded;
        const interpreted = ledger.spentThisRun;
        await interpretAll(ledger, texts);
        const interpretCost = ledger.spentThisRun - interpreted;
        const allChars = new Set([...documents.map((doc) => doc.text), ...queries.map((query) => query.text)]);
        const size = (set: Set<string>) => [...set].reduce((sum, text) => sum + text.length, 0);
        const projected = embedCost * (size(allChars) / size(sample)) + (interpretCost / (texts.length * interpreters.length)) * queries.length * interpreters.length;
        console.log(`Pilot: embeddings ${usd(embedCost)} for ${sample.size} texts, interpretations ${usd(interpretCost)} for ${texts.length * interpreters.length} queries.`);
        console.log(`Projected for the full set: ${usd(projected)}, embeddings of ${allChars.size} texts with ${embeddingModels.length} models and ${queries.length * interpreters.length} interpretations.`);
        return;
      }
      const paid = ledger !== undefined || existsSync(embeddingsCache);
      const vectors = paid ? await embedAll(world, ledger, texts) : new Map<string, number[]>();
      const interpretations = ledger !== undefined || existsSync(interpretationsPath) ? await interpretAll(ledger, texts) : new Map<string, string>();
      const mcp = await world.assistant.open();
      const ctx: Ctx = { world, mcp, vectors, interpretations };
      await checkSameAsSearch(ctx, chosen);
      await checkLeakCheck(ctx);
      // Some approaches again, such as one added later, replace only their own results.
      const only = values.approaches?.split(',');
      const results: Scored[] = only && existsSync(resultsPath) ? readResults().filter((result) => !only.includes(result.approach)) : [];
      for (const approach of approaches.filter((one) => !only || only.includes(one.id))) {
        if (approach.needs?.embeddings && ![...vectors.keys()].some((key) => key.startsWith(`${approach.needs!.embeddings}\n`))) continue;
        if (approach.needs?.interpreter && ![...interpretations.keys()].some((key) => key.startsWith(`${approach.needs!.interpreter}\n`))) continue;
        for (const query of chosen) {
          // Once to warm up, then the median of the repeats.
          let outcome = await approach.run(query, ctx);
          const times: number[] = [];
          for (let n = 0; n < repeat; n++) {
            outcome = await approach.run(query, ctx);
            times.push(outcome.ms);
          }
          outcome.ms = median(times);
          results.push(score(world, query, approach, outcome));
        }
        console.log(`${approach.id}: done`);
      }
      await mcp.close();
      const order = approaches.map((approach) => approach.id);
      results.sort((a, b) => order.indexOf(a.approach) - order.indexOf(b.approach));
      writeFileSync(resultsPath, results.map((result) => JSON.stringify(result)).join('\n') + '\n');
      console.log(report(results));
    }),
  );
}

/**
 * How long the paid calls take that semantic search and interpretation add to a query: the
 * interpretation exactly as the run asks for it, and a query's embedding, for every twelfth query.
 */
async function latency() {
  const texts = queries.filter((_, n) => n % 12 === 0).map((query) => query.text);
  await withLedger(async (ledger) => {
    if (!ledger) throw new Error('This makes paid calls: give it --max-spend.');
    const listed = await listedModels();
    for (const id of interpreters) {
      const model = new Model(listed.find((one) => one.id === id) ?? fail(`OpenRouter doesn't list ${id}.`), ledger, { key: fileKey });
      const ms: number[] = [];
      for (const text of texts) {
        const completion = await model.complete({
          messages: [
            { role: 'system', content: interpreterPrompt },
            { role: 'user', content: text },
          ],
          tools: [searchTool],
          maxTokens: 1000,
          label: `b4|latency|${id}`,
        });
        ms.push(completion.ms);
      }
      console.log(`${id}, interpretation: median ${Math.round(median(ms))} ms, from ${Math.round(Math.min(...ms))} to ${Math.round(Math.max(...ms))} ms`);
    }
    const embedders = await listedEmbeddingModels();
    for (const id of embeddingModels) {
      const embedder = new Embedder(embedders.find((one) => one.id === id) ?? fail(`OpenRouter doesn't list ${id}.`), ledger, { key: fileKey });
      const ms: number[] = [];
      for (const text of texts) {
        const started = performance.now();
        await embedder.embed([text], `b4|latency|${id}`);
        ms.push(performance.now() - started);
      }
      console.log(`${id}, a query's embedding: median ${Math.round(median(ms))} ms, from ${Math.round(Math.min(...ms))} to ${Math.round(Math.max(...ms))} ms`);
    }
  });
}

function readResults(): Scored[] {
  return readFileSync(resultsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Scored);
}

/** The queries of the pilot: a few of each kind, to check the harness and project the cost. */
const pilotQueries = ['no-renew', 'en-golive', 'mx-carpenter', 'id-invoice', 'mm-deadline', 'vg-deadline', 'none-capital', 'pv-lindqvist', 'past-golive'];

/** The leak check must notice what isn't Ana's: search as Cara finds her own private items and Polar Freight's. */
async function checkLeakCheck(ctx: Ctx) {
  const [{ cara }] = await ctx.world.bench.admin<{ cara: string }[]>`select id as cara from people where name = 'Cara Lund'`;
  const query: Query = { id: 'leak-check', category: 'privacy', text: 'Lindqvist Osprey pallet salary', expect: [] };
  const found = await withPrincipal(ctx.world.bench.sql, { person: cara, direct: true }, (s) => search(s, query.text));
  const scored = score(ctx.world, query, approaches[0], { lines: found.map((hit) => ({ kind: hit.kind, id: hit.id })), nothing: false, text: found.map((hit) => hit.text).join('\n'), ms: 0 });
  if (scored.privacy === 0) throw new Error("The leak check didn't notice Cara's private items in her own search, so it can't be trusted.");
  console.log(`The leak check notices ${scored.privacy} lines and words in Cara's own search that Ana must never see.`);
}

/** The prototype's ts_rank, given the same words, must return what Homing's search returns. */
async function checkSameAsSearch(ctx: Ctx, chosen: Query[]) {
  let differ = 0;
  await asAna(ctx, async (s) => {
    for (const query of chosen) {
      const terms = await queryTerms(s, query.text);
      const ours = await rankedSearch(s, terms.map(({ word, prefix }) => ({ term: word, prefix })), { by: 'ts_rank' });
      const theirs = await search(s, query.text);
      if (ours.map((hit) => hit.id).join() !== theirs.map((hit) => hit.id).join()) differ++;
    }
  });
  if (differ) throw new Error(`The prototype's ts_rank differs from search for ${differ} of ${chosen.length} queries, so its other rankings can't be compared with search.`);
  console.log(`The prototype's ts_rank returns what search returns for all ${chosen.length} queries.`);
}

const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const percentile = (numbers: number[], p: number) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const pct = (value: number) => `${Math.round(value * 100)}%`;
const mean = (numbers: number[]) => (numbers.length ? numbers.reduce((sum, x) => sum + x, 0) / numbers.length : 0);

/** The tables: per approach overall, and recall at 10 per category. */
export function report(results: Scored[]): string {
  const ids = [...new Set(results.map((result) => result.approach))];
  const label = (id: string) => approaches.find((approach) => approach.id === id)?.label ?? id;
  const rows = ids.map((id) => {
    const mine = results.filter((result) => result.approach === id);
    const answerable = mine.filter((result) => result.of > 0);
    const none = mine.filter((result) => result.category === 'none');
    return {
      id,
      answerable,
      none,
      line: `| ${label(id)} | ${pct(mean(answerable.map((r) => r.recall5)))} | ${pct(mean(answerable.map((r) => r.recall10)))} | ${mean(answerable.map((r) => r.reciprocalRank)).toFixed(2)} | ${none.filter((r) => r.nothingRight).length} of ${none.length} | ${mine.filter((r) => r.privacy > 0).length} | ${mine.filter((r) => r.stale > 0).length}, ${mine.filter((r) => r.staleFirst).length} | ${Math.round(median(mine.map((r) => r.ms)))} | ${Math.round(percentile(mine.map((r) => r.ms), 95))} |`,
    };
  });
  const answerableCount = rows[0]?.answerable.length ?? 0;
  const out = [
    `### All queries (${answerableCount} with an answer, ${rows[0]?.none.length ?? 0} that should match nothing)`,
    '',
    '| Approach | Recall@5 | Recall@10 | MRR | Nothing, when nothing matches | Privacy failures | Stale in the top 10, before the answer | Median ms | p95 ms |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => row.line),
    '',
    '### Recall@10 by category',
    '',
    `| Approach | ${Object.entries(categories)
      .filter(([key]) => results.some((result) => result.category === key && result.of > 0))
      .map(([key, name]) => `${name} (${results.filter((r) => r.category === key && r.of > 0 && r.approach === ids[0]).length})`)
      .join(' | ')} |`,
    `|---|${Object.keys(categories)
      .filter((key) => results.some((result) => result.category === key && result.of > 0))
      .map(() => '---')
      .join('|')}|`,
    ...ids.map(
      (id) =>
        `| ${label(id)} | ${Object.keys(categories)
          .filter((key) => results.some((result) => result.category === key && result.of > 0))
          .map((key) => pct(mean(results.filter((r) => r.approach === id && r.category === key && r.of > 0).map((r) => r.recall10))))
          .join(' | ')} |`,
    ),
  ];
  const curves: [string, number[]][] = [
    ['bm25', [1, 2, 3, 4, 5, 6, 8]],
    ['bm25-all-words', [1, 2, 3, 4, 5, 6, 8]],
    ...ids.filter((id) => id.startsWith('semantic-')).map((id): [string, number[]] => [id, [0.3, 0.4, 0.45, 0.5, 0.55, 0.6]]),
  ];
  for (const [id, steps] of curves.filter(([id]) => ids.includes(id))) {
    const mine = results.filter((result) => result.approach === id);
    const top = (result: Scored) => Math.max(0, ...(result.scores ?? [0]));
    const none = mine.filter((result) => result.category === 'none');
    const answerable = mine.filter((result) => result.of > 0);
    out.push(
      '',
      `### ${label(id)}: saying nothing matches below a score`,
      '',
      `| Best score below | ${steps.join(' | ')} |`,
      `|---|${steps.map(() => '---').join('|')}|`,
      `| Should match nothing, and says so (of ${none.length}) | ${steps.map((step) => none.filter((r) => top(r) < step).length).join(' | ')} |`,
      `| Has an answer, but says nothing matches (of ${answerable.length}) | ${steps.map((step) => answerable.filter((r) => top(r) < step).length).join(' | ')} |`,
      `| ...of them, with the answer in the first 10 | ${steps.map((step) => answerable.filter((r) => top(r) < step && r.recall10 > 0).length).join(' | ')} |`,
    );
  }
  const context = results.filter((result) => result.approach === 'context' && result.space);
  if (context.length) {
    const count = (what: Scored['space']) => context.filter((result) => result.space === what).length;
    out.push(
      '',
      `### context without a space: the space (${context.length} queries with one)`,
      '',
      `Picked the right one ${count('picked')}, a wrong one ${count('wrong')}, listed it among others ${count('listed')}, didn't list it ${count('not listed')}, said nothing matches ${count('nothing')}.`,
    );
  }
  return out.join('\n');
}

async function main() {
  const command = positionals[0];
  if (command === 'run' || command === 'pilot') return run(command === 'pilot');
  if (command === 'report') return console.log(report(readResults()));
  if (command === 'privacy') return (await import('./retrieval-privacy.ts')).privacy(withWorld);
  if (command === 'latency') return latency();
  if (command === 'synthetic') return (await import('./retrieval-scale.ts')).buildSynthetic();
  if (command === 'scale') {
    return (await import('./retrieval-scale.ts')).measureScale(positionals[1] ?? fail('Say which database, such as homing_bench4_scale.'), {
      repeat: Number(values.repeat),
      timeoutMs: Number(values.timeout),
      only: values.approaches?.split(','),
    });
  }
  console.error('Say what to do: npm run bench:retrieval -- run, pilot, report, privacy, latency, synthetic or scale <database>');
  process.exit(1);
}

await main().catch((error) => {
  console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  process.exit(1);
});

