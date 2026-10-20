// What moving to explicit private updates (#32's follow-up) does to what was there before it: an
// original shared as a copy now shows as the copy, so wherever its owner changed it after sharing,
// they keep their text as an item of their own. Where nobody else changed the copy, it's their
// update of the copy, in its place, as it would be now; otherwise it shows beside it. Nobody's
// text goes out of sight, nobody sees anything new of anyone else's, and the migration runs
// whatever it finds.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { connect, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { addSource, readItem, readPage } from '../src/knowledge.ts';
import { migrate } from '../src/migrate.ts';
import { addMember, createPerson, createSpace, removeMember } from '../src/spaces.ts';
import { freshDatabase } from './reset.ts';

let urls: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof connect>, admin: ReturnType<typeof connect>;
let ana: string, cara: string, ben: string;
let acme: string;
const pages: Record<string, string> = {};
const originals: Record<string, string> = {};
const copies: Record<string, string> = {};

const as = <T>(principal: Principal, fn: (s: Session) => Promise<T>) => withPrincipal(app, principal, fn);
const seen = async (person: string, page: string) =>
  ((await as({ person }, (s) => readPage(s, page)))?.items ?? []).map((item) => [item.body, item.privateTo === null ? 'shared' : 'own', item.replaced?.body ?? null]);

/**
 * Shares an item of the owner's that rests on their own email, so it's shared as a copy. Written
 * straight into the store, as the schema before the migration has it, since Homing's own code
 * reads what later migrations add.
 */
async function shareCopy(owner: string, shape: string, text: string) {
  pages[shape] = await as({ person: owner, direct: true }, async (s) => {
    const page = randomUUID();
    await s.tx`insert into pages (id, space_id) values (${page}::uuid, ${acme}::uuid)`;
    await s.tx`insert into content (space_id, page_id, kind, body) values (${acme}::uuid, ${page}::uuid, 'title', ${`Shape ${shape}`})`;
    return page;
  });
  originals[shape] = await as({ person: owner, agent: 'Claude' }, async (s) => {
    const email = await addSource(s, { spaceId: acme, reference: `Email about ${shape}`, excerpt: text });
    const [{ id }] = await s.tx<{ id: string }[]>`
      insert into content (space_id, page_id, kind, body, private_to) values (${acme}::uuid, ${pages[shape]}::uuid, 'text', ${text}, ${owner}::uuid) returning id
    `;
    await s.tx`insert into citations (content_id, source_id) values (${id}::uuid, ${email.id}::uuid)`;
    return id;
  });
  // As sharing was before it: publish_item from the migration before.
  copies[shape] = await as({ person: owner, direct: true }, async (s) => (await s.tx<{ id: string }[]>`select publish_item(${originals[shape]}::uuid, ${text}) as id`)[0].id);
}

before(async () => {
  const next = (await readdir('migrations')).find((file) => file.endsWith('_private_updates.sql'))!;
  urls = await freshDatabase('private_updates', { before: next });
  app = connect(urls.app);
  admin = connect(urls.admin);
  [ana, cara, ben] = [(await createPerson(admin, 'Ana')).id, (await createPerson(admin, 'Cara')).id, (await createPerson(admin, 'Ben')).id];
  acme = await as({ person: ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara);
    await addMember(s, acme, ben);
    return acme;
  });

  // As Homing allowed before: Ana's assistant rewrote what she had shared.
  await shareCopy(ana, 'A', 'The launch is on 14 November.');
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`update content set body = 'The launch is on 21 November.' where id = ${originals.A}::uuid`);

  // The same, and Ana also kept her own version of the copy, in its place.
  await shareCopy(ana, 'B', 'The budget is 400,000.');
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`update content set body = 'The budget is 420,000.' where id = ${originals.B}::uuid`);
  await as({ person: ana, direct: true }, (s) => s.tx`
    insert into content (space_id, page_id, kind, body, private_to, supersedes)
    values (${acme}::uuid, ${pages.B}::uuid, 'text', 'The budget is 450,000.', ${ana}::uuid, ${copies.B}::uuid)
  `);

  // Ana's assistant replaced what she had shared with a private item.
  await shareCopy(ana, 'D', 'The venue is Hotel Oslo.');
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`
    insert into content (space_id, page_id, kind, body, private_to, supersedes)
    values (${acme}::uuid, ${pages.D}::uuid, 'text', 'The venue is Hotel Bergen.', ${ana}::uuid, ${originals.D}::uuid)
  `);

  // Cara corrected the copy for everyone herself, and Ana's assistant rewrote Ana's original too.
  await shareCopy(ana, 'G', 'Doors open at 18.');
  await as({ person: cara, direct: true }, (s) => s.tx`update content set body = 'Doors open at 17.' where id = ${copies.G}::uuid`);
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`update content set body = 'Doors open at 19.' where id = ${originals.G}::uuid`);

  // Cara corrected the copy for everyone, and Ana's original stayed as it was.
  await shareCopy(ana, 'H', 'The bar opens at 19.');
  await as({ person: cara, direct: true }, (s) => s.tx`update content set body = 'The bar opens at 20.' where id = ${copies.H}::uuid`);

  // Ben rewrote what he had shared, and then left Acme.
  await shareCopy(ben, 'Ben', 'Ben is away in July.');
  await as({ person: ben, agent: 'Claude' }, (s) => s.tx`update content set body = 'Ben is away in August.' where id = ${originals.Ben}::uuid`);
  await as({ person: ana, direct: true }, (s) => removeMember(s, acme, ben));

  // Ana's assistant rewrote what she had shared, then replaced that with a private item.
  await shareCopy(ana, 'R', 'R one.');
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`update content set body = 'R two.' where id = ${originals.R}::uuid`);
  await as({ person: ana, agent: 'Claude' }, (s) => s.tx`
    insert into content (space_id, page_id, kind, body, private_to, supersedes)
    values (${acme}::uuid, ${pages.R}::uuid, 'text', 'R three.', ${ana}::uuid, ${originals.R}::uuid)
  `);

  // And one that still says what it was shared as.
  await shareCopy(ana, 'Same', 'The office closes at 17.');
});

after(async () => {
  await app.end();
  await admin.end();
});

test('nothing anyone saw goes out of sight, and earlier updates take the shape they’d have now', async () => {
  const before = new Set((await admin<{ id: string }[]>`select id from content`).map((row) => row.id));
  await migrate(urls.admin, urls.app, urls.auth);

  // Ana's changes where nobody else touched the copy are her updates of it, in its place, saying what the others see.
  assert.deepEqual(await seen(ana, pages.A), [['The launch is on 21 November.', 'own', 'The launch is on 14 November.']]);
  assert.deepEqual(await seen(ana, pages.D), [['The venue is Hotel Bergen.', 'own', 'The venue is Hotel Oslo.']]);
  assert.deepEqual(await seen(ana, pages.R), [['R three.', 'own', 'R one.']]);
  // Where the copy was replaced or corrected since, hers shows beside it, replacing nothing.
  assert.deepEqual(await seen(ana, pages.B), [['The budget is 420,000.', 'own', null], ['The budget is 450,000.', 'own', 'The budget is 400,000.']]);
  assert.deepEqual(await seen(ana, pages.G), [['Doors open at 19.', 'own', null], ['Doors open at 17.', 'shared', null]]);
  // Unchanged since she shared it, hers is what Cara corrected, and shows as the correction.
  assert.deepEqual(await seen(ana, pages.H), [['The bar opens at 20.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.Same), [['The office closes at 17.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.Ben), [['Ben is away in July.', 'shared', null]]);
  for (const page of [pages.A, pages.D, pages.R]) {
    const [update] = (await as({ person: ana }, (s) => readPage(s, page)))!.items;
    assert.equal(update.replaced?.shared, true, 'others still see the copy, which her update says');
  }

  // Cara sees the shared side as before, and Ben, who left, nothing.
  const forCara = Object.fromEntries(await Promise.all(Object.entries(pages).map(async ([shape, page]) => [shape, await seen(cara, page)])));
  assert.deepEqual(forCara, {
    A: [['The launch is on 14 November.', 'shared', null]],
    B: [['The budget is 400,000.', 'shared', null]],
    D: [['The venue is Hotel Oslo.', 'shared', null]],
    G: [['Doors open at 17.', 'shared', null]],
    H: [['The bar opens at 20.', 'shared', null]],
    Ben: [['Ben is away in July.', 'shared', null]],
    R: [['R one.', 'shared', null]],
    Same: [['The office closes at 17.', 'shared', null]],
  });
  assert.deepEqual(await seen(ben, pages.Ben), []);

  // The only new items are the kept versions, each its owner's as their assistant wrote it.
  const added = (await admin<{ id: string; pageId: string; privateTo: string; writtenBy: string; agent: string | null; supersedes: string | null }[]>`
    select id, page_id, private_to, written_by, agent, supersedes from content
  `).filter((row) => !before.has(row.id));
  assert.deepEqual(added.map((row) => [row.pageId, row.privateTo, row.writtenBy, row.agent, row.supersedes]).sort(), [
    [pages.A, ana, ana, 'Claude', copies.A],
    [pages.B, ana, ana, 'Claude', null],
    [pages.G, ana, ana, 'Claude', null],
    [pages.Ben, ben, ben, 'Claude', copies.Ben],
  ].sort());
  // With its sources and what it said before.
  const kept = await as({ person: ana }, (s) => readItem(s, added.find((row) => row.pageId === pages.A)!.id));
  assert.deepEqual([kept?.sources.map((source) => source.reference), kept?.history.map((entry) => entry.body)], [['Email about A'], ['The launch is on 14 November.']]);

  // Ben, back in Acme, finds his change where he left it.
  await as({ person: ana, direct: true }, (s) => addMember(s, acme, ben));
  assert.deepEqual(await seen(ben, pages.Ben), [['Ben is away in August.', 'own', 'Ben is away in July.']]);
  assert.deepEqual(await seen(cara, pages.Ben), [['Ben is away in July.', 'shared', null]]);
});
