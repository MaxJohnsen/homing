// Guarantee 7: everything records where it came from, and nobody can forge
// that record. Cara, Ana's colleague at Acme, tries straight against the
// database to change who wrote what, when, and from which source.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addSource, createPage, readItem, writeItem } from '../src/knowledge.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { as, person, refused, share } from './helpers.ts';

/** Ana's shared pricing page, with a decision she wrote and a note her agent wrote, which she shared. */
async function acme() {
  const ana = await person('Ana');
  const cara = await person('Cara');
  const { space, page, decision } = await as(ana, async (s) => {
    const space = await createSpace(s, { name: 'Acme' });
    await addMember(s, space, cara.id);
    const page = await createPage(s, { spaceId: space, title: 'Pricing', shared: true });
    const decision = await writeItem(s, { pageId: page, body: 'We never discount more than 10%', shared: true });
    return { space, page, decision };
  });
  const note = await as({ ...ana, agent: 'Claude Code' }, (s) => writeItem(s, { pageId: page, body: 'Gunnar asked about volume discounts' }));
  await share(ana, note.id);
  return { ana, cara, space, page, decision, note };
}

test('nobody writes in someone else’s name, as another agent, or at another time', async () => {
  const { ana, cara, space, page } = await acme();
  for (const [column, value] of [
    ['written_by', ana.id],
    ['agent', 'Claude Code'],
    ['created_at', '2001-01-01'],
  ]) {
    await assert.rejects(
      as(cara, (s) => s.tx`
        insert into content (space_id, page_id, private_to, body, ${s.tx(column)})
        values (${space}, ${page}, ${cara.id}, 'Hello', ${value})
      `),
      refused,
    );
  }
  await assert.rejects(
    as(cara, (s) => s.tx`
      insert into sources (space_id, private_to, excerpt, written_by) values (${space}, ${cara.id}, 'Hello', ${ana.id})
    `),
    refused,
  );

  // What she writes is recorded as hers.
  const [row] = await as(cara, (s) => s.tx`
    insert into content (space_id, page_id, private_to, body) values (${space}, ${page}, ${cara.id}, 'Hello')
    returning written_by, agent
  `);
  assert.deepEqual({ ...row }, { writtenBy: cara.id, agent: null });
});

test('every change keeps what was there before, and records who made it', async () => {
  const { ana, cara, decision } = await acme();
  await as(cara, (s) => s.tx`update content set body = 'We never discount more than 15%' where id = ${decision.id}`);

  const item = await as(ana, (s) => readItem(s, decision.id));
  assert.equal(item?.writtenBy, cara.id);
  assert.deepEqual(
    item?.history.map((revision) => [revision.body, revision.writtenBy]),
    [['We never discount more than 10%', ana.id]],
  );

  for (const [column, value] of [
    ['written_by', ana.id],
    ['agent', 'Claude Code'],
    ['updated_at', '2001-01-01'],
  ]) {
    await assert.rejects(
      as(cara, (s) => s.tx`update content set ${s.tx(column)} = ${value} where id = ${decision.id}`),
      refused,
    );
  }
});

test('agents never change what people wrote, even straight against the database', async () => {
  const { cara, space, page, decision, note } = await acme();
  const claude = { ...cara, agent: 'Claude Code' };
  // What Ana wrote for everyone, and what Cara wrote on her own side, where her agent otherwise keeps things up to date.
  const own = await as(cara, (s) => writeItem(s, { pageId: page, body: 'Schools ask for 12%' }));

  for (const item of [decision, own]) {
    await assert.rejects(
      as(claude, (s) => s.tx`update content set body = 'We discount up to 20%' where id = ${item.id}`),
      refused,
    );
    await assert.rejects(
      as(claude, (s) => s.tx`
        insert into content (space_id, page_id, private_to, body, supersedes)
        values (${space}, ${page}, ${cara.id}, 'We discount up to 20%', ${item.id})
      `),
      refused,
    );
  }

  // What an agent wrote, an agent may replace.
  await as(claude, (s) => s.tx`
    insert into content (space_id, page_id, private_to, body, supersedes)
    values (${space}, ${page}, ${cara.id}, 'Gunnar wants 15% off at 100 seats', ${note.id})
  `);
});

test('a replacement stays on its page, on a side that can see what it replaces', async () => {
  const { cara, space, page, decision } = await acme();
  const ben = await person('Ben');
  const elsewhere = await as(ben, async (s) => {
    const beta = await createSpace(s, { name: 'Beta' });
    const page = await createPage(s, { spaceId: beta, title: 'Budget' });
    return writeItem(s, { pageId: page, body: 'Ben expects budget cuts in May' });
  });
  const { otherPage, draft } = await as(cara, async (s) => {
    const otherPage = await createPage(s, { spaceId: space, title: 'Launch' });
    const draft = await writeItem(s, { pageId: page, body: 'Maybe 12% for schools' });
    return { otherPage, draft };
  });
  const replace = (pageId: string, supersedes: string, privateTo: string | null) =>
    as(cara, (s) => s.tx`
      insert into content (space_id, page_id, private_to, body, supersedes)
      values (${space}, ${pageId}, ${privateTo}, 'Replacement', ${supersedes})
    `);

  // Another client's item, which she can't see.
  await assert.rejects(replace(page, elsewhere.id, cara.id), refused);
  // A shared replacement of her own private draft would reveal it.
  await assert.rejects(replace(page, draft.id, null), refused);
  // An item on another page.
  await assert.rejects(replace(otherPage, decision.id, cara.id), { code: '23503' });
  // The page's title, which isn't knowledge.
  const [title] = await as(cara, (s) => s.tx`select id from content where page_id = ${page} and kind = 'title'`);
  await assert.rejects(replace(page, title.id, cara.id), refused);
});

test('knowledge is replaced, never removed', async () => {
  const { cara, space, page, decision } = await acme();
  await assert.rejects(
    as(cara, (s) => s.tx`
      insert into content (space_id, page_id, kind, body, supersedes)
      values (${space}, ${page}, 'removed', '', ${decision.id})
    `),
    { code: '23514' },
  );
});

test('only the writer of an item adds sources to it', async () => {
  const { cara, space, decision } = await acme();
  const rumour = await as(cara, (s) => addSource(s, { spaceId: space, excerpt: 'Discounts are going away' }));

  await assert.rejects(
    as(cara, (s) => s.tx`insert into citations (content_id, source_id) values (${decision.id}, ${rumour.id})`),
    refused,
  );
});

test('a page has one title on each side', async () => {
  const { cara, space, page } = await acme();
  await assert.rejects(
    as(cara, (s) => s.tx`insert into content (space_id, page_id, kind, body) values (${space}, ${page}, 'title', 'Fired')`),
    { code: '23505' },
  );
});

test('knowledge can’t pose as guidance', async () => {
  const { ana, space } = await acme();
  for (const type of ['Guidance', 'Skill']) {
    await assert.rejects(as(ana, (s) => createPage(s, { spaceId: space, title: 'Rules', type })), { code: '23514' });
  }
});
