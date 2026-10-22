// Benchmark 4, part 4: whether what others keep private changes the ranking Ana sees. Cara writes
// private items full of the words Ana searches for, in her closed client space and on her private
// side of spaces Ana is in. Ana's results are compared before and after, scores included, for
// Homing's search (ts_rank), BM25 over what Ana can see, and BM25 over everyone.

import { withPrincipal, type Principal, type Session } from '../src/db.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import type { World } from './retrieval.ts';
import { queries } from './retrieval-set.ts';
import { globalStats, rankedSearch, termsOf, userStats, type Found } from './retrieval-search.ts';

type Ranker = 'ts_rank' | 'bm25 (Ana)' | 'bm25 (everyone)';
const rankers: Ranker[] = ['ts_rank', 'bm25 (Ana)', 'bm25 (everyone)'];

/** Ana's first ten results for a query, as ids with their scores, in an order ties can't change. */
async function top(world: World, text: string, ranker: Ranker): Promise<string[]> {
  const terms = termsOf(text);
  const stats = ranker === 'bm25 (everyone)' ? await globalStats(world.bench.admin, terms) : undefined;
  const found = await withPrincipal(world.bench.sql, world.ana, async (s) =>
    rankedSearch(s, terms, ranker === 'ts_rank' ? { by: 'ts_rank' } : { by: 'bm25', stats: stats ?? (await userStats(s, terms)) }, { limit: 50 }),
  );
  return canonical(found).slice(0, 10);
}

const canonical = (found: Found[]) =>
  [...found]
    .map((hit) => ({ ...hit, score: Math.round(hit.score * 1e6) / 1e6 }))
    .sort((a, b) => Number(a.superseded) - Number(b.superseded) || b.score - a.score || a.id.localeCompare(b.id))
    .map((hit) => `${hit.id}@${hit.score}`);

const ids = (entries: string[]) => entries.map((entry) => entry.split('@')[0]);

export async function privacy(withWorld: <T>(fn: (world: World) => Promise<T>) => Promise<T>) {
  await withWorld(async (world) => {
    const [{ cara }] = await world.bench.admin<{ cara: string }[]>`select id as cara from people where name = 'Cara Lund'`;
    const caraDirect: Principal = { person: cara, direct: true };
    const asked = queries.filter((query) => termsOf(query.text).length > 0);

    const before = new Map<string, string[]>();
    for (const ranker of rankers) for (const query of asked) before.set(`${ranker}\n${query.id}`, await top(world, query.text, ranker));

    // Cara's private notes, each with three of the words Ana's queries use: 120 in her closed
    // client space, and 80 on her private side of Northwind's relaunch, which Ana is in.
    const words = [...new Set(asked.flatMap((query) => termsOf(query.text).filter((term) => term.prefix).map((term) => term.term)))];
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const note = () => `Note on ${words[Math.floor(random() * words.length)]}, ${words[Math.floor(random() * words.length)]} and ${words[Math.floor(random() * words.length)]} for later.`;
    await withPrincipal(world.bench.sql, caraDirect, async (s: Session) => {
      const polar = await createPage(s, { spaceId: world.spaceIds.polar, title: 'Working notes', shared: true });
      for (let n = 0; n < 120; n++) await writeItem(s, { pageId: polar, body: note(), shared: true });
      const mine = await createPage(s, { spaceId: world.spaceIds.relaunch, title: 'My notes', shared: false });
      for (let n = 0; n < 80; n++) await writeItem(s, { pageId: mine, body: note(), shared: false });
    });

    console.log(`Cara wrote 200 private items with ${words.length} of the words Ana's ${asked.length} queries use.\n`);
    console.log('| Ranking | Queries whose top 10 changed in order | ...or in scores only | Unchanged |');
    console.log('|---|---|---|---|');
    for (const ranker of rankers) {
      let order = 0;
      let scores = 0;
      for (const query of asked) {
        const was = before.get(`${ranker}\n${query.id}`)!;
        const now = await top(world, query.text, ranker);
        if (ids(was).join() !== ids(now).join()) order++;
        else if (was.join() !== now.join()) scores++;
      }
      console.log(`| ${ranker} | ${order} | ${scores} | ${asked.length - order - scores} |`);
    }

    // A demonstration: two of Ana's notes, each matching one of two words. Cara writes about one of
    // them where Ana can't look, and with statistics over everyone, the order Ana sees flips.
    const demo = 'Bergen Fjordline';
    const show = async (ranker: Ranker) => Promise.all((await top(world, demo, ranker)).slice(0, 2).map((entry) => textOf(world, entry.split('@')[0])));
    const was = await Promise.all(rankers.map(show));
    // Cara writes about the word of the note that comes first, to push it down.
    const first = was[2][0]?.includes('Fjordline') ? 'Fjordline' : 'Bergen';
    await withPrincipal(world.bench.sql, caraDirect, async (s: Session) => {
      const page = await createPage(s, { spaceId: world.spaceIds.polar, title: 'Competitors', shared: true });
      for (let n = 0; n < 15; n++) await writeItem(s, { pageId: page, body: `${first} called about the tender, round ${n + 1}.`, shared: true });
    });
    const now = await Promise.all(rankers.map(show));
    console.log(`\nAna searches "${demo}". Cara then writes 15 items about ${first} in Polar Freight, which Ana can't open.\n`);
    console.log('| Ranking | Ana\'s first two before | Ana\'s first two after |');
    console.log('|---|---|---|');
    rankers.forEach((ranker, n) => console.log(`| ${ranker} | ${was[n].join('; ')} | ${now[n].join('; ')} |`));
  });
}

/** What a hit says: an item's text, or a page's title. */
async function textOf(world: World, id: string): Promise<string> {
  const [row] = await world.bench.admin<{ body: string }[]>`
    select body from content where id = ${id}::uuid union all select body from content where page_id = ${id}::uuid and kind = 'title' limit 1
  `;
  return row?.body ?? id;
}
