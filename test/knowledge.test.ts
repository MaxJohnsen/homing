// Knowledge (spec §3): sources, pages and items, their history, and search.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSource,
  createPage,
  listPages,
  readItem,
  readPage,
  search,
  supersedeItem,
  updateItem,
  writeItem,
} from '../src/knowledge.ts';
import { AccessDenied, type Principal } from '../src/db.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { admin, as, db, person } from './helpers.ts';

/** Ana works for Acme. Cara is her colleague there. */
async function acme() {
  const ana = await person('Ana');
  const cara = await person('Cara');
  const space = await as(ana, async (s) => {
    const space = await createSpace(s, { name: 'Acme' });
    await addMember(s, space, cara.id);
    return space;
  });
  return { ana, cara, space, claude: { ...ana, agent: 'Claude Code' } };
}

test('an agent saves knowledge on your private side, with where it came from', async () => {
  const { ana, claude, space } = await acme();

  const page = await as(claude, async (s) => {
    const email = await addSource(s, {
      spaceId: space,
      reference: 'Email from Gunnar, 3 October',
      excerpt: 'We are moving the launch to 1 March.',
    });
    const page = await createPage(s, { spaceId: space, title: 'Launch', type: 'project' });
    await writeItem(s, { pageId: page, body: 'Acme launches on 1 March', sources: [email.id] });
    return readPage(s, page);
  });

  assert.equal(page?.title, 'Launch');
  assert.equal(page?.type, 'project');
  const [item] = page?.items ?? [];
  assert.equal(item.body, 'Acme launches on 1 March');
  assert.equal(item.privateTo, ana.id);
  assert.equal(item.writtenBy, ana.id);
  assert.equal(item.agent, 'Claude Code');
  assert.deepEqual(item.sources.map((source) => source.reference), ['Email from Gunnar, 3 October']);
});

test('a private page never shows up for anyone else', async () => {
  const { claude, cara, space } = await acme();
  const page = await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Gunnar', type: 'person' });
    await writeItem(s, { pageId: page, body: 'Gunnar is hard to reach before ten' });
    return page;
  });

  await as(cara, async (s) => {
    assert.equal(await readPage(s, page), undefined);
    assert.equal((await listPages(s, space)).length, 0);
    assert.equal((await search(s, 'Gunnar')).length, 0);
  });
});

test('a page’s title is shown only to those who can see it', async () => {
  const { ana, claude, cara, space } = await acme();
  const page = await as(claude, (s) => createPage(s, { spaceId: space, title: 'Gunnar, slow to answer' }));
  await as(ana, (s) => writeItem(s, { pageId: page, body: 'Gunnar is the project manager', shared: true }));

  // Cara sees the shared item, but not the title Ana gave the page privately.
  // Homing hides it on its own too, without row-level security.
  for (const sql of [db, admin]) {
    const seen = await as(cara, (s) => readPage(s, page), sql);
    assert.equal(seen?.title, 'Untitled');
    const [hit] = await as(cara, (s) => search(s, 'project manager'), sql);
    assert.equal(hit.title, null);
  }
});

test('updating an item keeps what it used to say', async () => {
  const { claude } = await acme();
  const { personalSpaceId } = claude;
  const item = await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: personalSpaceId, title: 'Plans' });
    const item = await writeItem(s, { pageId: page, body: 'Run the half marathon in May' });
    await updateItem(s, item.id, { body: 'Run the half marathon in June' });
    return readItem(s, item.id);
  });

  assert.equal(item?.body, 'Run the half marathon in June');
  assert.deepEqual(item?.history.map((revision) => revision.body), ['Run the half marathon in May']);
});

test('superseded knowledge leaves the page, but can still be found', async () => {
  const { claude, space } = await acme();
  const { page, launch, moved } = await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Launch' });
    const launch = await writeItem(s, { pageId: page, body: 'Acme launches on 1 February' });
    const moved = await supersedeItem(s, launch.id, { body: 'Acme launches on 1 March' });
    return { page, launch, moved };
  });

  await as(claude, async (s) => {
    assert.deepEqual((await readPage(s, page))?.items.map((item) => item.body), ['Acme launches on 1 March']);
    assert.equal((await readItem(s, launch.id))?.replacedBy?.id, moved?.id);

    const [old] = (await search(s, 'February')).filter((hit) => hit.kind === 'item');
    assert.equal(old.text, 'Acme launches on 1 February');
    assert.equal(old.superseded, true);
    assert.equal((await search(s, 'February', { current: true })).length, 0);
  });
});

test('a colleague can replace a shared item for everyone', async () => {
  const { ana, cara, space } = await acme();
  const { page, launch } = await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Launch', shared: true });
    const launch = await writeItem(s, { pageId: page, body: 'Acme launches on 1 March', shared: true });
    return { page, launch };
  });

  await as(cara, (s) => supersedeItem(s, launch.id, { body: 'Acme launches on 1 April', shared: true }));

  const seen = await as(ana, (s) => readPage(s, page));
  assert.deepEqual(seen?.items.map((item) => item.body), ['Acme launches on 1 April']);
});

test('replacing a shared item privately changes only your own view', async () => {
  const { ana, claude, cara, space } = await acme();
  const { page, launch } = await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Launch', shared: true });
    const launch = await writeItem(s, { pageId: page, body: 'Acme launches on 1 March', shared: true });
    return { page, launch };
  });

  await as(cara, (s) => supersedeItem(s, launch.id, { body: 'Cara expects the launch to move to April' }));

  const seenBy = async (principal: Principal, sql = db) =>
    (await as(principal, (s) => readPage(s, page), sql))?.items.map((item) => item.body);
  assert.deepEqual(await seenBy(cara), ['Cara expects the launch to move to April']);
  assert.deepEqual(await seenBy(claude), ['Acme launches on 1 March']);

  // Homing keeps Cara's view to herself on its own too, without row-level security.
  assert.deepEqual(await seenBy(claude, admin), ['Acme launches on 1 March']);

  // Cara can see that her colleagues still see the earlier version.
  const [update] = (await as(cara, (s) => readPage(s, page)))?.items ?? [];
  assert.deepEqual(update.replaced, { id: launch.id, body: 'Acme launches on 1 March', shared: true });
  const [hit] = await as(cara, (s) => search(s, 'April'));
  assert.equal(hit.updatesShared, true);
});

test('the same fact saved twice is kept once, with every source it came from', async () => {
  const { claude, space } = await acme();
  const page = await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Launch' });
    for (const [reference, excerpt] of [
      ['Email from Gunnar', 'We are moving the launch to 1 March.'],
      ['Meeting notes', 'Launch confirmed for 1 March.'],
      ['Email from Gunnar', 'We are moving the launch to 1 March.'],
    ]) {
      const source = await addSource(s, { spaceId: space, reference, excerpt });
      await writeItem(s, { pageId: page, body: 'Acme launches on 1 March', sources: [source.id] });
    }
    return readPage(s, page);
  });

  const [item, ...more] = page?.items ?? [];
  assert.equal(more.length, 0);
  assert.deepEqual(item.sources.map((source) => source.reference), ['Email from Gunnar', 'Meeting notes']);
});

test('agents never rewrite what people wrote', async () => {
  const { ana, claude, space } = await acme();
  const decision = await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Pricing' });
    return writeItem(s, { pageId: page, body: 'We never discount more than 10%' });
  });

  await assert.rejects(as(claude, (s) => updateItem(s, decision.id, { body: 'We discount up to 20%' })), AccessDenied);
  await assert.rejects(as(claude, (s) => supersedeItem(s, decision.id, { body: 'We discount up to 20%' })), AccessDenied);

  // Ana can still change it herself.
  const changed = await as(ana, (s) => updateItem(s, decision.id, { body: 'We never discount more than 15%' }));
  assert.equal(changed?.body, 'We never discount more than 15%');
});

test('knowledge without a page stays findable in its source', async () => {
  const { claude, space } = await acme();
  await as(claude, (s) =>
    addSource(s, { spaceId: space, reference: 'Meeting notes', excerpt: 'Ola will own the migration.' }),
  );

  const hits = await as(claude, (s) => search(s, 'who owns the migration'));
  assert.deepEqual(hits.map((hit) => [hit.kind, hit.text]), [['source', 'Ola will own the migration.']]);
});

test('search matches words by how they start', async () => {
  const { claude, space } = await acme();
  const { page, item } = await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Launch' });
    const item = await writeItem(s, { pageId: page, body: 'Acme launches on 1 March' });
    return { page, item };
  });

  const hits = await as(claude, (s) => search(s, 'launch'));
  assert.deepEqual(hits.map((hit) => [hit.kind, hit.id, hit.text]), [
    ['page', page, 'Launch'],
    ['item', item.id, 'Acme launches on 1 March'],
  ]);
});

test('short words match only whole words', async () => {
  const { claude, space } = await acme();
  await as(claude, async (s) => {
    const page = await createPage(s, { spaceId: space, title: 'Dates' });
    await writeItem(s, { pageId: page, body: 'Acme launches on 1 March' });
    await writeItem(s, { pageId: page, body: 'The board meets on 12 March' });
  });

  const hits = await as(claude, (s) => search(s, '1'));
  assert.deepEqual(hits.map((hit) => hit.text), ['Acme launches on 1 March']);
});

test('searching a space includes the spaces below it, and nothing beside it', async () => {
  const { ana, claude, space } = await acme();
  // People create spaces others see; the assistant writes in them.
  const [website, beta] = await as(ana, async (s) => [await createSpace(s, { name: 'Website', parentId: space }), await createSpace(s, { name: 'Beta' })]);
  await as(claude, async (s) => {
    for (const [spaceId, body] of [
      [website, 'The website launches with the new logo'],
      [beta, 'Beta launches in the autumn'],
    ]) {
      const page = await createPage(s, { spaceId, title: 'Notes' });
      await writeItem(s, { pageId: page, body });
    }
  });

  const hits = await as(claude, (s) => search(s, 'launches', { spaceId: space }));
  assert.deepEqual(hits.map((hit) => hit.text), ['The website launches with the new logo']);
});
