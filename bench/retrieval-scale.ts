// Benchmark 4, part 3: whether BM25 over what the user can see is affordable on a big Homing.
// Times Homing's search and context's ranking against the BM25 prototype, as Ana, under
// row-level security, on the big sample (npm run sample -- big) and on a synthetic space of
// 176,000 items of about 4 KB, the size #108 measured exports with.
//
//   npm run bench:retrieval -- synthetic             builds homing_bench4_scale, in about 13 minutes
//   npm run bench:retrieval -- scale homing_bench4_scale --repeat 1 --timeout 30000
//   HOMING_SAMPLE_DB=homing_sample_bench4 npm run sample -- big, then:
//   npm run bench:retrieval -- scale homing_sample_bench4

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { adminUrl, authDatabaseUrl, connect, databaseUrl, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { search, tellingWords } from '../src/knowledge.ts';
import { migrate } from '../src/migrate.ts';
import { searchProposals } from '../src/proposals.ts';
import { skillsMatching } from '../src/skills.ts';
import { addMember, createPerson, createSpace, listSpaces } from '../src/spaces.ts';
import { searchTasks } from '../src/tasks.ts';
import { inTestDatabase } from '../test/reset.ts';
import { rankedSearch, termsOf, userStats, type Filters } from './retrieval-search.ts';

const synthetic = 'homing_bench4_scale';

// Words for the synthetic space, most common first. A document's words are drawn so that a word's
// share falls with its rank, as in real text: "the" and "og" are in nearly every document, a
// client's name in some, an invoice number in a handful.
const common = (
  'the of and to a in is that for it on with as was be this are by at from or have an not but which they you we will can all there their has been ' +
  'og i er det som på en til av med for at ikke de å har vi et seg den om men så kan skal eller fra var når hva hvem hvordan hvor ' +
  'what when who how why does do did should would could about after before into than then also more some any just only new next last'
).split(' ');
const domain = (
  'project status meeting notes client team plan update week month review decision risk owner deadline date budget cost price invoice contract ' +
  'agreement renewal migration content page pages site website launch relaunch release version test testing design approval approved scope ' +
  'delivery hosting cloud azure server data report reports dashboard analytics search product products customer customers order orders ' +
  'prosjekt status møte notater kunde team plan oppdatering uke måned beslutning risiko eier frist dato budsjett kostnad pris faktura kontrakt ' +
  'avtale fornyelse migrering innhold side nettside lansering versjon test design godkjenning leveranse drift sky rapport kunder bestilling ' +
  'steering group workshop sprint backlog ticket bug error issue fix deploy staging production cookie consent banner legal procurement portal ' +
  'styringsgruppe verksted feil sak rettelse produksjon juridisk innkjøp portal sikkerhet tilgang brukere opplæring support kontoret'
).split(' ');
const names = (
  'Northwind Fjord Bank Gunnar Holm Per Hansen Mona Lie Kari Lise Berg Cara Lund Ana Lars Moe Erik Dahl Oslo Bergen Trondheim Stavanger Episerver Matomo ' +
  'Snowflake BigQuery Tripletex Harvest Mercell Citrix WireGuard Redis WCAG Osprey Polar Freight Havbris Beta Lindqvist Fjordline'
).split(' ');

/** Made-up words for the long tail: every real archive has thousands of words used a few times. */
function tail(count: number): string[] {
  const syllables = ['ka', 'lo', 'ri', 'ven', 'sta', 'mor', 'e', 'li', 'tu', 'gan', 'fe', 'dro', 'ny', 'sko', 'ber', 'al', 'in', 'ost', 'pa', 'run'];
  const words: string[] = [];
  for (let n = 0; words.length < count; n++) {
    let word = '';
    for (let rest = n + 7919; rest > 0 || word.length < 4; rest = Math.floor(rest / syllables.length)) word += syllables[rest % syllables.length];
    words.push(word);
  }
  return words;
}

/** Builds one big space: 16,000 pages of 11 items of about 4 KB, 32,000 sources, one item a page Cara's own. */
export async function buildSynthetic() {
  const server = postgres(adminUrl, { onnotice: () => {} });
  await server.unsafe(`drop database if exists ${synthetic} with (force)`);
  await server.unsafe(`create database ${synthetic}`);
  await server.end();
  await migrate(inTestDatabase(adminUrl, synthetic), inTestDatabase(databaseUrl, synthetic), inTestDatabase(authDatabaseUrl, synthetic));
  const admin = connect(inTestDatabase(adminUrl, synthetic));
  const sql = connect(inTestDatabase(databaseUrl, synthetic));
  try {
    const ana = await createPerson(admin, 'Ana Berg');
    const cara = await createPerson(admin, 'Cara Lund');
    const spaceId = await withPrincipal(sql, { person: ana.id, direct: true }, async (s) => {
      const id = await createSpace(s, { name: 'Northwind archive' });
      await addMember(s, id, cara.id);
      return id;
    });
    const vocabulary = [...common, ...domain, ...names, ...tail(30_000)];
    console.log(`${vocabulary.length} words`);
    const started = performance.now();
    await admin`drop index content_search`;
    await admin`drop index sources_search`;
    // One page at a time would take hours; a batch of 500 pages, with their titles and 5,500 items,
    // is a few statements, written as Ana, and as Cara for her own items, as row-level security checks.
    const pick = (outer: string, count: number) =>
      `(select string_agg(v[floor(exp(random() * ln(${vocabulary.length})))::int + (${outer} * 0) + (k * 0)], ' ') from generate_series(1, ${count}) as w (k))`;
    for (let batch = 0; batch < 32; batch++) {
      const pageIds = Array.from({ length: 500 }, () => randomUUID());
      await withPrincipal(sql, { person: ana.id, direct: true }, async (s) => {
        await s.tx`insert into pages (id, space_id) select unnest(${pageIds}::uuid[]), ${spaceId}::uuid`;
        await s.tx.unsafe(
          `insert into content (page_id, space_id, kind, body)
           select p.id, $2::uuid, 'title', ${pick('p.n', 5)} from unnest($3::uuid[]) with ordinality as p (id, n), (select $1::text[] as v) vocabulary`,
          [vocabulary, spaceId, pageIds],
        );
        await s.tx.unsafe(
          `insert into content (page_id, space_id, kind, body)
           select p.id, $2::uuid, 'text', ${pick('i', 640)} from unnest($3::uuid[]) as p (id), generate_series(1, 10) i, (select $1::text[] as v) vocabulary`,
          [vocabulary, spaceId, pageIds],
        );
        await s.tx.unsafe(
          `insert into sources (space_id, reference, excerpt)
           select $2::uuid, 'Email', ${pick('n', 40)} from generate_series(1, 1000) n, (select $1::text[] as v) vocabulary`,
          [vocabulary, spaceId],
        );
      });
      await withPrincipal(sql, { person: cara.id, direct: true }, async (s) => {
        await s.tx.unsafe(
          `insert into content (page_id, space_id, private_to, kind, body)
           select p.id, $2::uuid, $4::uuid, 'text', ${pick('p.n', 640)} from unnest($3::uuid[]) with ordinality as p (id, n), (select $1::text[] as v) vocabulary`,
          [vocabulary, spaceId, pageIds, cara.id],
        );
      });
      process.stdout.write(`\r${(batch + 1) * 500} pages, ${Math.round((performance.now() - started) / 1000)} s`);
    }
    // A few needles, as a real archive has: an invoice number and an error code in a handful of items.
    await withPrincipal(sql, { person: ana.id, direct: true }, (s) =>
      s.tx.unsafe(
        `insert into content (page_id, space_id, kind, body)
         select p.id, $2::uuid, 'text', ${pick('p.n', 600)} || ' faktura 2026-0417 E42'
         from (select id, row_number() over () as n from pages where space_id = $2::uuid order by random() limit 12) p, (select $1::text[] as v) vocabulary`,
        [vocabulary, spaceId],
      ),
    );
    console.log('\nIndexing');
    await admin`set maintenance_work_mem = '1GB'`;
    await admin`create index content_search on content using gin (search)`;
    await admin`create index sources_search on sources using gin (search)`;
    await admin`analyze`;
    const [{ items, size }] = await admin`select count(*) as items, pg_size_pretty(sum(octet_length(body))) as size from content where kind = 'text'`;
    console.log(`${items} items, ${size} of text, in ${Math.round((performance.now() - started) / 1000)} s`);
  } finally {
    await Promise.all([admin.end(), sql.end()]);
  }
}

/** What an assistant asks: whole requests, as context gets them, and the keywords assistants write for search. */
const asked = [
  { text: "What's the budget for the website relaunch?", kind: 'request' },
  { text: 'When does the Fjord Bank contract renew?', kind: 'request' },
  { text: 'Who is Gunnar Holm?', kind: 'request' },
  { text: 'Når fornyes kontrakten med Fjord Bank?', kind: 'request' },
  { text: 'Who owns the content migration, and when is the deadline?', kind: 'request' },
  { text: 'What did we decide about hosting at the last steering group meeting?', kind: 'request' },
  { text: 'faktura 2026-0417', kind: 'keywords' },
  { text: 'E42', kind: 'keywords' },
  { text: 'budget relaunch', kind: 'keywords' },
  { text: 'Gunnar timeline launch blockers decisions steering October', kind: 'keywords' },
  { text: 'migration status', kind: 'keywords' },
  { text: 'contract renewal', kind: 'keywords' },
];

interface Timing {
  approach: string;
  query: string;
  ms: number;
  rows: number;
}

/** Times each approach for each query as Ana, three times after a warm-up, and prints medians and p95. */
export async function measureScale(database: string, options: { repeat: number; timeoutMs: number; only?: string[] }) {
  const { repeat, timeoutMs } = options;
  const admin = connect(inTestDatabase(adminUrl, database));
  const sql = connect(inTestDatabase(databaseUrl, database));
  try {
    const [ana] = await admin<{ id: string }[]>`select id from people where name = 'Ana Berg'`;
    const principal: Principal = { person: ana.id, agent: 'Claude' };
    const [counts] = await admin<{ items: number; sources: number; pages: number }[]>`
      select (select count(*) from content) as items, (select count(*) from sources) as sources, (select count(*) from pages) as pages
    `;
    const visible = await withPrincipal(sql, principal, (s) => s.tx<{ items: number; sources: number }[]>`
      select (select count(*) from content) as items, (select count(*) from sources) as sources
    `);
    const spaces = await withPrincipal(sql, principal, (s) => listSpaces(s));
    const [{ biggest }] = await admin<{ biggest: string }[]>`select space_id as biggest from content group by space_id order by count(*) desc limit 1`;
    console.log(`${database}: ${counts.items} items, ${counts.pages} pages, ${counts.sources} sources; Ana sees ${visible[0].items} items and ${visible[0].sources} sources in ${spaces.length} spaces.`);

    const contextFilters: Filters = { limit: 50, current: true, knowledge: true, active: true };
    const all: { id: string; label: string; asAdmin?: boolean; run(s: Session, text: string): Promise<number> }[] = [
      {
        id: 'search',
        label: '`search` (a)',
        run: async (s, text) => (await search(s, text)).length + (await searchTasks(s, text)).length + (await searchProposals(s, text)).length,
      },
      {
        // The same queries, with search's own access filters, but without row-level security, which
        // keeps PostgreSQL from using the full-text index: its match operator isn't marked leakproof.
        id: 'search-index',
        label: '`search` (a), if the index could be used',
        asAdmin: true,
        run: async (s, text) => (await search(s, text)).length + (await searchTasks(s, text)).length + (await searchProposals(s, text)).length,
      },
      {
        id: 'context',
        label: "context's ranking (a)",
        run: async (s, text) => {
          const telling = await tellingWords(s, text);
          if (!telling) return 0;
          return (await search(s, telling, contextFilters)).length + (await searchTasks(s, telling, { limit: 20 })).length + (await skillsMatching(s, telling, 20)).length;
        },
      },
      {
        id: 'context-space',
        label: 'context in its space (a)',
        run: async (s, text) => (await search(s, text, { spaceId: biggest, limit: 10, current: true, knowledge: true })).length,
      },
      {
        id: 'bm25-stats',
        label: 'BM25, its statistics alone (b)',
        run: async (s, text) => (await userStats(s, termsOf(text))).frequencies.length,
      },
      {
        id: 'bm25',
        label: 'BM25 (b)',
        run: async (s, text) => {
          const terms = termsOf(text);
          return (await rankedSearch(s, terms, { by: 'bm25', stats: await userStats(s, terms) })).length + (await searchTasks(s, text)).length + (await searchProposals(s, text)).length;
        },
      },
      {
        id: 'bm25-pruned',
        label: 'BM25, common words not candidates (b)',
        run: async (s, text) => {
          const terms = termsOf(text);
          return (await rankedSearch(s, terms, { by: 'bm25', stats: await userStats(s, terms) }, { prune: 0.5 })).length + (await searchTasks(s, text)).length + (await searchProposals(s, text)).length;
        },
      },
      {
        id: 'bm25-telling',
        label: "BM25, context's telling words (b)",
        run: async (s, text) => {
          const telling = await tellingWords(s, text);
          if (!telling) return 0;
          const terms = termsOf(telling);
          return (await rankedSearch(s, terms, { by: 'bm25', stats: await userStats(s, terms) }, contextFilters)).length;
        },
      },
    ];

    const approaches = all.filter((approach) => !options.only || options.only.includes(approach.id));
    if (approaches.some((approach) => approach.asAdmin)) {
      // Without row-level security, search's own filters must still give exactly what Ana gets with it.
      let same = 0;
      for (const query of asked) {
        const ids = async (connection: typeof sql) => (await withPrincipal(connection, principal, (s) => search(s, query.text))).map((hit) => hit.id).join();
        if ((await ids(sql)) === (await ids(admin))) same++;
      }
      console.log(`Without row-level security, search returns the same as with it for ${same} of ${asked.length} queries.`);
    }
    const timings: Timing[] = [];
    for (const approach of approaches) {
      for (const query of asked) {
        // A query that runs past the limit counts as taking forever.
        const once = () =>
          withPrincipal(approach.asAdmin ? admin : sql, principal, async (s) => {
            await s.tx`select set_config('statement_timeout', ${String(timeoutMs)}, true)`;
            const started = performance.now();
            try {
              const rows = await approach.run(s, query.text);
              return { ms: performance.now() - started, rows };
            } catch (error) {
              if ((error as { code?: string }).code === '57014') return { ms: Infinity, rows: 0 };
              throw error;
            }
          }).catch((error) => {
            if ((error as { code?: string }).code === '57014') return { ms: Infinity, rows: 0 };
            throw error;
          });
        // Once to warm up, unless there's time for only one run.
        if (repeat > 0) await once();
        const runs = [];
        for (let n = 0; n < Math.max(repeat, 1); n++) runs.push(await once());
        timings.push({ approach: approach.id, query: query.text, ms: median(runs.map((run) => run.ms)), rows: runs[0].rows });
      }
      const mine = timings.filter((timing) => timing.approach === approach.id);
      console.log(`${approach.label}: median ${shown(median(mine.map((t) => t.ms)))}, p95 ${shown(percentile(mine.map((t) => t.ms), 95))}`);
    }

    console.log(`\n| Approach | ${asked.map((query) => `"${query.text}"`).join(' | ')} | Median | p95 |`);
    console.log(`|---|${asked.map(() => '---').join('|')}|---|---|`);
    for (const approach of approaches) {
      const mine = timings.filter((timing) => timing.approach === approach.id);
      console.log(`| ${approach.label} | ${mine.map((t) => shown(t.ms)).join(' | ')} | ${shown(median(mine.map((t) => t.ms)))} | ${shown(percentile(mine.map((t) => t.ms), 95))} |`);
    }
    console.log('\n| Approach | Requests, median | Requests, slowest | Keywords, median | Keywords, slowest |');
    console.log('|---|---|---|---|---|');
    for (const approach of approaches) {
      const of = (kind: string) => timings.filter((timing) => timing.approach === approach.id && asked.find((query) => query.text === timing.query)!.kind === kind).map((t) => t.ms);
      console.log(`| ${approach.label} | ${shown(median(of('request')))} | ${shown(Math.max(...of('request')))} | ${shown(median(of('keywords')))} | ${shown(Math.max(...of('keywords')))} |`);
    }
  } finally {
    await Promise.all([admin.end(), sql.end()]);
  }
}

/** Milliseconds, or that it ran past the limit. */
const shown = (ms: number) => (Number.isFinite(ms) ? `${Math.round(ms)}` : 'over the limit');

const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const percentile = (numbers: number[], p: number) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
