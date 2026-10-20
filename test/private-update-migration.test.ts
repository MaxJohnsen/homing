// What moving to explicit private updates (#32's follow-up) does to what was there before it: an
// original shared as a copy now shows as the copy, so wherever its owner's text says something
// else, they keep it as an item of their own beside the copy. Nobody's text goes out of sight,
// nobody sees anything new of anyone else's, and the migration runs whatever it finds.

import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { connect, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { addSource, createPage, readItem, readPage, writeItem } from '../src/knowledge.ts';
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

/** Shares an item of the owner's that rests on their own email, so it's shared as a copy. */
async function shareCopy(owner: string, shape: string, text: string) {
  pages[shape] = await as({ person: owner, direct: true }, (s) => createPage(s, { spaceId: acme, title: `Shape ${shape}`, shared: true }));
  originals[shape] = await as({ person: owner, agent: 'Claude' }, async (s) => {
    const email = await addSource(s, { spaceId: acme, reference: `Email about ${shape}`, excerpt: text });
    return (await writeItem(s, { pageId: pages[shape], body: text, sources: [email.id] })).id;
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

  // And one that still says what it was shared as.
  await shareCopy(ana, 'Same', 'The office closes at 17.');
});

after(async () => {
  await app.end();
  await admin.end();
});

test('nothing anyone saw goes out of sight, and nothing of anyone else’s comes into view', async () => {
  const before = new Set((await admin<{ id: string }[]>`select id from content`).map((row) => row.id));
  await migrate(urls.admin, urls.app, urls.auth);

  // Where Ana's text says something else than what she shared, she keeps it beside the copy, where it stood.
  assert.deepEqual(await seen(ana, pages.A), [['The launch is on 21 November.', 'own', null], ['The launch is on 14 November.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.B), [['The budget is 420,000.', 'own', null], ['The budget is 450,000.', 'own', 'The budget is 400,000.']]);
  assert.deepEqual(await seen(ana, pages.D), [['The venue is Hotel Bergen.', 'own', 'The venue is Hotel Oslo.'], ['The venue is Hotel Oslo.', 'shared', null]]);
  // Cara's corrections stay as she wrote them, for everyone: nothing replaces them.
  assert.deepEqual(await seen(ana, pages.G), [['Doors open at 19.', 'own', null], ['Doors open at 17.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.H), [['The bar opens at 19.', 'own', null], ['The bar opens at 20.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.Same), [['The office closes at 17.', 'shared', null]]);
  assert.deepEqual(await seen(ana, pages.Ben), [['Ben is away in July.', 'shared', null]]);

  // Cara sees the shared side as before, and Ben, who left, nothing.
  const forCara = Object.fromEntries(await Promise.all(Object.entries(pages).map(async ([shape, page]) => [shape, await seen(cara, page)])));
  assert.deepEqual(forCara, {
    A: [['The launch is on 14 November.', 'shared', null]],
    B: [['The budget is 400,000.', 'shared', null]],
    D: [['The venue is Hotel Oslo.', 'shared', null]],
    G: [['Doors open at 17.', 'shared', null]],
    H: [['The bar opens at 20.', 'shared', null]],
    Ben: [['Ben is away in July.', 'shared', null]],
    Same: [['The office closes at 17.', 'shared', null]],
  });
  assert.deepEqual(await seen(ben, pages.Ben), []);

  // The only new items are Ana's four, each hers as her assistant wrote it, replacing nothing.
  const added = (await admin<{ id: string; pageId: string; privateTo: string; writtenBy: string; agent: string | null; supersedes: string | null }[]>`
    select id, page_id, private_to, written_by, agent, supersedes from content
  `).filter((row) => !before.has(row.id));
  assert.deepEqual(added.map((row) => [row.pageId, row.privateTo, row.writtenBy, row.agent, row.supersedes]).sort(), [pages.A, pages.B, pages.G, pages.H].map((page) => [page, ana, ana, 'Claude', null]).sort());
  // With its sources and what it said before.
  const kept = await as({ person: ana }, (s) => readItem(s, added.find((row) => row.pageId === pages.A)!.id));
  assert.deepEqual([kept?.sources.map((source) => source.reference), kept?.history.map((entry) => entry.body)], [['Email about A'], ['The launch is on 14 November.']]);
});
