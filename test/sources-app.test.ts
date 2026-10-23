// Issue #40, sources in the app: what a space learned from, newest first or by search, fifty at a
// time, and a source on its own: what was kept of it, who kept it, and the pages whose items rest
// on it. Sources stay evidence, never pages, and each keeps its own audience.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addSource, createPage, supersedeItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { as, db, member, share, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let email: string, notes: string, call: string, launch: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), logRequests: false });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  // Claude keeps Gunnar's email for Cara and builds the launch page from it, which Cara shares. Meeting notes stay a source on their own.
  let date: string;
  ({ email, notes, launch, date } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const email = (await addSource(s, { spaceId: acme, reference: 'Email from Gunnar, 2 October', excerpt: 'We go live on 14 November.', shared: true })).id;
    const notes = (await addSource(s, { spaceId: acme, reference: 'Meeting notes, 9 October', excerpt: 'Content is late. Design is signed off.', shared: true })).id;
    const launch = await createPage(s, { spaceId: acme, title: 'Website launch' });
    const date = (await writeItem(s, { pageId: launch, body: 'The launch is on 14 November.', sources: [email] })).id;
    return { email, notes, launch, date };
  }));
  await share(cara, date);
  // Ana heard otherwise on a call, which only she has, and keeps her own version of the date.
  call = await as(ana, async (s) => {
    const call = (await addSource(s, { spaceId: acme, reference: 'Call with Gunnar', excerpt: 'New launch date is 20 November, but don’t tell the team yet.' })).id;
    await supersedeItem(s, date, { body: 'The launch is on 20 November.', sources: [call, email] });
    return call;
  });
});

after(() => homing.close());

const list = async (who: Member, query = '') => {
  const { status, body } = await who.browser.json(`/api/spaces/${acme}/sources${query}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body as { sources: { id: string; reference: string; onlyYou: boolean; pages: number }[]; total: number; all: number };
};

test('a space’s sources are the ones each person has there, newest first, with the pages using them', async () => {
  const forAna = await list(ana);
  assert.deepEqual(forAna.sources.map((source) => [source.reference, source.onlyYou, source.pages]), [
    ['Call with Gunnar', true, 1],
    ['Meeting notes, 9 October', false, 0],
    ['Email from Gunnar, 2 October', false, 1],
  ]);
  assert.deepEqual([forAna.total, forAna.all], [3, 3]);
  // For Cara the email is still used on the launch page, and Ana's call isn't there at all.
  const forCara = await list(cara);
  assert.deepEqual(forCara.sources.map((source) => [source.reference, source.pages]), [
    ['Meeting notes, 9 October', 0],
    ['Email from Gunnar, 2 October', 1],
  ]);
  assert.equal(forCara.all, 2);
  assert.deepEqual((await list(cara, '?q=signed')).sources.map((source) => source.reference), ['Meeting notes, 9 October']);
  assert.deepEqual((await list(cara, '?q=tell')).sources, []);
});

test('a long list of sources comes fifty at a time', async () => {
  const space = await as(ana, (s) => createSpace(s, { name: 'Inbox', parentId: ana.personalSpaceId }));
  await as(ana, async (s) => {
    for (let n = 1; n <= 75; n++) await addSource(s, { spaceId: space, reference: `Email ${n}`, excerpt: `Message number ${n}` });
  });
  const first = (await ana.browser.json(`/api/spaces/${space}/sources`)).body;
  assert.deepEqual([first.sources.length, first.total, first.sources[0].reference], [50, 75, 'Email 75']);
  const second = (await ana.browser.json(`/api/spaces/${space}/sources?offset=50`)).body;
  assert.deepEqual([second.sources.length, second.sources.at(-1).reference], [25, 'Email 1']);
});

type SourceBody = {
  reference: string;
  excerpt: string;
  shared: boolean;
  by: { name: string | null; you: boolean } | null;
  agent: string | null;
  pages: { id: string; title: string; items: { text: string; shared: boolean }[] }[];
};

test('a source shows what was kept of it, who kept it, and what rests on it as each person sees it', async () => {
  const forCara = (await cara.browser.json(`/api/sources/${email}`)).body as SourceBody;
  assert.deepEqual([forCara.reference, forCara.excerpt, forCara.shared, forCara.agent], ['Email from Gunnar, 2 October', 'We go live on 14 November.', true, 'Claude']);
  assert.deepEqual(forCara.by, { name: 'Cara', you: true });
  assert.deepEqual(forCara.pages.map((page) => [page.title, page.items.map((item) => item.text)]), [['Website launch', ['The launch is on 14 November.']]]);

  // For Ana, her own version rests on the email now, and the date she replaced for herself doesn't.
  const forAna = (await ana.browser.json(`/api/sources/${email}`)).body as SourceBody;
  assert.deepEqual(forAna.by, { name: 'Cara', you: false });
  assert.deepEqual(forAna.pages.map((page) => page.items.map((item) => [item.text, item.shared])), [[['The launch is on 20 November.', false]]]);

  const unused = (await cara.browser.json(`/api/sources/${notes}`)).body as SourceBody;
  assert.deepEqual(unused.pages, []);
  // Ana's call is hers alone.
  assert.equal((await cara.browser.json(`/api/sources/${call}`)).status, 404);
  assert.equal((await ana.browser.json(`/api/sources/${call}`)).status, 200);
});

test('a page’s item links to its sources, each only for whoever has it', async () => {
  const page = (await ana.browser.json(`/api/pages/${launch}`)).body;
  assert.deepEqual(page.items[0].sources.map((source: { id: string }) => source.id).sort(), [call, email].sort());
  const forCara = (await cara.browser.json(`/api/pages/${launch}`)).body;
  assert.deepEqual(forCara.items[0].sources.map((source: { id: string }) => source.id), [email]);
});
