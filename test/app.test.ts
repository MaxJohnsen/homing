// Issue #39, the app around every screen: the spaces in the sidebar, a space
// with who can open it, and what waits for the person on Home. Each person
// gets only what they can open, and a space above that they can't open is
// never named.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { decide, proposeRule } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Browser } from './browser.ts';
import { as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, eli: Member;
let acme: string, northwind: string, website: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl) });
  [ana, cara, eli] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Eli')];
  // Ana runs Acme, where Cara works. Northwind is a closed client space only Ana is in.
  // The website is open to everyone in Acme, and Eli, a freelancer, is in it but not in Acme.
  ({ acme, northwind, website } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const northwind = await createSpace(s, { name: 'Northwind', parentId: acme, closed: true });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    await addMember(s, website, eli.id);
    return { acme, northwind, website };
  }));
});

after(() => homing.close());

test('the sidebar lists the spaces each person can open, and no others', async () => {
  const names = async (who: Member) => {
    const { status, body } = await who.browser.json('/api/spaces');
    assert.equal(status, 200);
    return Object.fromEntries(body.spaces.map((space: Record<string, unknown>) => [space.name, space]));
  };

  const forAna = await names(ana);
  assert.deepEqual(Object.keys(forAna).sort(), ['Acme', 'Northwind', 'Personal', 'Website']);
  assert.equal(forAna.Personal.personal, true);
  assert.equal(forAna.Northwind.parentId, acme);
  assert.equal(forAna.Northwind.closed, true);
  assert.equal(forAna.Acme.admin, true);

  // Cara is in Acme, so she has the website, but not the closed client space.
  assert.deepEqual(Object.keys(await names(cara)).sort(), ['Acme', 'Personal', 'Website']);

  // Eli can't open Acme, so the website sits at the top for him.
  const forEli = await names(eli);
  assert.deepEqual(Object.keys(forEli).sort(), ['Personal', 'Website']);
  assert.equal(forEli.Website.parentId, null);
  assert.equal(forEli.Website.admin, false);
});

test('a space says where it sits and who can open it', async () => {
  const view = async (who: Member, space: string) => (await who.browser.json(`/api/spaces/${space}`)).body;
  const people = (space: Record<string, any>) =>
    (space.members as { name: string; admin: boolean; member: boolean; through: string | null }[]).map(({ name, admin, member, through }) =>
      `${name}${admin ? ' (admin)' : ''}${member ? '' : ` through ${through}`}`);

  const site = await view(ana, website);
  assert.deepEqual(site.path, [{ id: acme, name: 'Acme' }]);
  assert.deepEqual(people(site), ['Ana (admin)', 'Cara through Acme', 'Eli']);
  assert.equal(site.reachedFromAbove, false);
  // Ana made the website, so she's a member of it as well as of Acme.
  const anaHere = site.members.find((person: { name: string }) => person.name === 'Ana');
  assert.deepEqual([anaHere.member, anaHere.through, anaHere.you], [true, 'Acme', true]);

  // A closed space is shared only with its own members.
  assert.deepEqual(people(await view(ana, northwind)), ['Ana (admin)']);

  // Eli sees the website's own members. He learns that people above have access too,
  // but not which space that is or who they are.
  const forEli = await view(eli, website);
  assert.deepEqual(forEli.path, []);
  assert.equal(forEli.parentId, null);
  assert.equal(forEli.reachedFromAbove, true);
  assert.deepEqual(people(forEli), ['Ana (admin)', 'Eli']);
  assert.doesNotMatch(JSON.stringify(forEli), /Acme|Cara/);

  // Only the owner has a personal space, so it lists nobody.
  const personal = await view(ana, ana.personalSpaceId);
  assert.equal(personal.personal, true);
  assert.deepEqual(personal.members, []);
});

test('a space someone can’t open isn’t there for them', async () => {
  for (const [who, space] of [[cara, northwind], [eli, acme], [eli, northwind], [cara, ana.personalSpaceId]] as const) {
    const { status, body } = await who.browser.json(`/api/spaces/${space}`);
    assert.equal(status, 404);
    assert.doesNotMatch(JSON.stringify(body), /Acme|Northwind/);
  }
});

test('what waits for a person is theirs alone, until they decide it', async () => {
  const claude = { person: ana.id, agent: 'Claude' };
  const proposal = await as(claude, (s) =>
    proposeRule(s, { action: 'add rule', spaceId: acme, kind: 'requirement', text: 'Never send prices by email', shared: true }),
  );

  const { status, body } = await ana.browser.json('/api/waiting');
  assert.equal(status, 200);
  assert.deepEqual(body.waiting.map(({ id, assistant, space, spaceId, action, kind, text }: Record<string, unknown>) => ({ id, assistant, space, spaceId, action, kind, text })), [
    { id: proposal.id, assistant: 'Claude', space: 'Acme', spaceId: acme, action: 'add', kind: 'requirement', text: 'Never send prices by email' },
  ]);
  assert.deepEqual((await cara.browser.json('/api/waiting')).body.waiting, []);

  await as({ person: ana.id, direct: true }, (s) => decide(s, proposal.id, { approve: false }));
  assert.deepEqual((await ana.browser.json('/api/waiting')).body.waiting, []);
});

test('nothing without signing in', async () => {
  const stranger = new Browser(homing.url);
  for (const path of ['/api/spaces', `/api/spaces/${acme}`, '/api/waiting']) {
    assert.equal((await stranger.json(path)).status, 401);
  }
  const home = await stranger.fetch('/');
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/sign-in');
});
