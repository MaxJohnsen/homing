// Issue #39, looking after Homing: whoever does sees who uses this Homing and
// whether it sends email, and invites people. Nobody else sees any of it, and
// looking after Homing opens nobody's spaces.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { createSpace } from '../src/spaces.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ida: Member, ana: Member;

before(async () => {
  const mailer = Object.assign(async () => undefined, { from: 'Homing <homing@acme.test>' });
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), mailer });
  ida = await member(homing.url, 'Ida');
  ana = await member(homing.url, 'Ana');
  await admin`update people set instance_admin = true where id = ${ida.id}`;
});

after(() => homing.close());

test('whoever looks after Homing sees who uses it, and whether it sends email', async () => {
  const { status, body } = await ida.browser.json('/api/admin');
  assert.equal(status, 200);
  assert.equal(body.host, homing.url.host);
  assert.deepEqual(body.email, { sends: true, from: 'Homing <homing@acme.test>' });
  const people = body.people as { name: string; email: string; you: boolean }[];
  for (const who of [ida, ana]) {
    assert.ok(people.some((person) => person.name === who.name && person.email === who.email && person.you === (who === ida)), who.name);
  }
});

test('nobody else sees it', async () => {
  const { status, body } = await ana.browser.json('/api/admin');
  assert.equal(status, 403);
  assert.doesNotMatch(JSON.stringify(body), /@/);
});

test('looking after Homing opens nobody’s spaces', async () => {
  const space = await as(ana, (s) => createSpace(s, { name: 'Ana’s client' }));
  const spaces = (await ida.browser.json('/api/spaces')).body.spaces as { id: string }[];
  assert.deepEqual(spaces.map((candidate) => candidate.id), [ida.personalSpaceId]);
  assert.equal((await ida.browser.json(`/api/spaces/${space}`)).status, 404);
});
