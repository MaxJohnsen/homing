// Issue #31, changing who is in a space (spec §1, §6). Adding someone shares the space's knowledge and
// guidance with them, so an admin does it directly in the app, or approves what an assistant
// proposes. The assistant names people the user shares a space with by name, and anyone else by
// email, and gets the same answer whether or not an email has an account: that shows only where the
// person decides. A space always keeps an admin, and only people change who has access.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, ben: Member, dan: Member;
let acme: string, northwind: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

const act = async (input: Record<string, unknown>) => {
  const result = await claude.client.callTool({ name: 'act', arguments: { action: 'members.change', input } });
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
  return { failed: Boolean(result.isError), text, proposal: /proposal:([0-9a-f-]{36})/.exec(text)?.[1] };
};
const shown = async (who: Member, id: string) => (await who.browser.json(`/api/proposals/${id}`)).body.proposal as { action: string; member: { change: string; name: string | null; email: string | null; found: boolean | null } };
const decide = (who: Member, id: string, approve = true) => who.browser.json(`/api/proposals/${id}/decide`, { approve });
const canOpen = async (who: Member, space: string) => (await who.browser.json(`/api/spaces/${space}`)).status === 200;

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    cardClients: [assistants.claude.client_id],
  });
  [ana, cara, ben, dan] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben'), await member(homing.url, 'Dan')];
  ({ acme, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    const team = await createSpace(s, { name: 'Team' });
    await addMember(s, team, cara.id);
    await addMember(s, team, dan.id);
    return { acme, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('an admin adds someone by email, changes their role and removes them, in the app', async () => {
  const added = await ana.browser.json(`/api/spaces/${acme}/members`, { email: cara.email.toUpperCase() });
  assert.deepEqual([added.status, added.body.name], [200, 'Cara']);
  assert.ok(await canOpen(cara, acme));
  assert.equal(await canOpen(cara, northwind), false, 'a closed space keeps its own members');

  const unknown = await ana.browser.json(`/api/spaces/${acme}/members`, { email: 'nobody@example.test' });
  assert.deepEqual([unknown.status, unknown.body.field], [400, 'email']);
  assert.match(unknown.body.message, /No one uses Homing with .+ yet/);

  // A member doesn't learn whether an email has an account, nor change who's in it.
  const byMember = await cara.browser.json(`/api/spaces/${acme}/members`, { email: 'nobody@example.test' });
  assert.deepEqual([byMember.status, byMember.body.message], [403, 'Only Acme’s admins change who’s in it.']);
  assert.equal((await cara.browser.json(`/api/spaces/${acme}/members/${ana.id}`, { change: 'remove' })).status, 403);

  assert.equal((await ana.browser.json(`/api/spaces/${acme}/members/${cara.id}`, { change: 'make admin' })).status, 200);
  assert.equal((await cara.browser.json(`/api/spaces/${acme}`)).body.admin, true);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/members/${cara.id}`, { change: 'make member' })).status, 200);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/members/${cara.id}`, { change: 'remove' })).status, 200);
  assert.equal(await canOpen(cara, acme), false);
});

test('a space keeps an admin, and nobody is ever added to a personal space', async () => {
  const alone = await ana.browser.json(`/api/spaces/${acme}/members/${ana.id}`, { change: 'make member' });
  assert.deepEqual([alone.status, alone.body.message], [400, 'Acme needs an admin, so make someone else an admin first.']);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/members/${ana.id}`, { change: 'remove' })).status, 400);
  assert.equal((await ana.browser.json(`/api/spaces/${ana.personalSpaceId}/members`, { email: cara.email })).status, 403);
  // Straight against the database too, and never as an assistant.
  await assert.rejects(as(ana, (s) => s.tx`select remove_member(${acme}::uuid, ${ana.id}::uuid)`), /keeps at least one admin/);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => addMember(s, acme, cara.id)), refused);
});

test('an assistant proposes adding someone the user shares a space with, by name, and the user approves', async () => {
  const proposed = await act({ space: `space:${acme}`, person: 'cara', change: 'add', why: 'Cara runs the Acme launch.' });
  assert.ok(!proposed.failed, proposed.text);
  assert.match(proposed.text, /^Waiting for the user's approval \(proposal:.+\)\. Nothing has changed yet\./);
  assert.equal(await canOpen(cara, acme), false);
  assert.deepEqual((await shown(ana, proposed.proposal!)).member, { change: 'add', name: 'Cara', email: null, found: true, inSpace: false, through: null, why: 'Cara runs the Acme launch.' });
  // Only the user decides, never the assistant.
  assert.equal((await decide(cara, proposed.proposal!)).status, 404);
  assert.equal((await decide(ana, proposed.proposal!)).status, 200);
  assert.ok(await canOpen(cara, acme));

  // Removing names someone in the space, and the user approves that too.
  const remove = await act({ space: `space:${acme}`, person: 'Cara', change: 'remove' });
  assert.equal((await decide(ana, remove.proposal!)).status, 200);
  assert.equal(await canOpen(cara, acme), false);
  assert.match((await act({ space: `space:${acme}`, person: 'Cara', change: 'remove' })).text, /No one in Acme is called Cara\./);
});

test('a name that fits several asks which, and a name nobody known has asks for an email', async () => {
  await admin`update people set name = 'Cara Lund' where id = ${cara.id}`;
  await admin`update people set name = 'Cara Berg' where id = ${dan.id}`;
  const which = await act({ space: `space:${acme}`, person: 'Cara', change: 'add' });
  assert.ok(which.failed);
  assert.match(which.text, /Several people are called Cara: (Cara Lund, Cara Berg|Cara Berg, Cara Lund)\. Ask the user which one they mean\./);
  const berg = await act({ space: `space:${acme}`, person: 'cara berg', change: 'add' });
  assert.ok(!berg.failed);
  // Two of one name can't be told apart by name, so the assistant asks for an email.
  await admin`update people set name = 'Cara Lund' where id = ${dan.id}`;
  assert.match((await act({ space: `space:${acme}`, person: 'Cara Lund', change: 'add' })).text, /Ask the user for the email address of the one they mean/);
  // Someone the user no longer shares a space with can't be added from an old proposal.
  const team = (await ana.browser.json('/api/spaces')).body.spaces.find((space: { name: string }) => space.name === 'Team').id as string;
  await ana.browser.json(`/api/spaces/${team}/members/${dan.id}`, { change: 'remove' });
  assert.deepEqual([(await shown(ana, berg.proposal!)).member.found, (await shown(ana, berg.proposal!)).member.name], [false, 'Cara Berg']);
  const stale = await decide(ana, berg.proposal!);
  assert.equal(stale.status, 400);
  assert.match(stale.body.message, /You no longer share a space with Cara Berg/);
  assert.equal(await canOpen(dan, acme), false);
  // Ben uses Homing but shares no space with Ana, so his name means nothing to her assistant.
  const stranger = await act({ space: `space:${acme}`, person: 'Ben', change: 'add' });
  assert.match(stranger.text, /No one the user shares a space with is called Ben\. Ask the user for their email address, and use that\./);
});

test('by email, the assistant gets the same answer whether or not anyone uses Homing with it', async () => {
  const known = await act({ space: `space:${acme}`, person: ben.email, change: 'add' });
  const unknown = await act({ space: `space:${acme}`, person: 'nobody@example.test', change: 'add' });
  assert.equal(known.text.replaceAll(known.proposal!, '…'), unknown.text.replaceAll(unknown.proposal!, '…'));
  const read = async (id: string) => (await claude.call('read', { ref: `proposal:${id}` })).text.replaceAll(id, '…');
  assert.equal((await read(known.proposal!)).replace(ben.email, 'X'), (await read(unknown.proposal!)).replace('nobody@example.test', 'X'));

  // Where the user decides, signed in, it says.
  const { member: knownShown } = await shown(ana, known.proposal!);
  const { member: unknownShown } = await shown(ana, unknown.proposal!);
  assert.deepEqual([knownShown.name, knownShown.email, knownShown.found], ['Ben', ben.email, true]);
  assert.deepEqual([unknownShown.name, unknownShown.email, unknownShown.found], [null, 'nobody@example.test', false]);
  const nobody = await decide(ana, unknown.proposal!);
  assert.equal(nobody.status, 400);
  assert.match(nobody.body.message, /No one uses Homing with .+ yet/);
  assert.equal((await decide(ana, known.proposal!)).status, 200);
  assert.ok(await canOpen(ben, acme));
});

test('only an admin proposes a change of members, and never in a personal space', async () => {
  const mine = await act({ space: `space:${ana.personalSpaceId}`, person: 'Ben', change: 'add' });
  assert.match(mine.text, /only ever yours/);
  // Ben's assistant, as a member of Acme, can't propose changing who's in it.
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ben.browser);
  const bens = await assistant.open();
  const asMember = await bens.call('act', { action: 'members.change', input: { space: `space:${acme}`, person: 'Ana', change: 'remove' } });
  assert.ok(asMember.failed);
  assert.match(asMember.text, /Only Acme’s admins change who’s in it\./);
});

test('an email counts only once it is proven theirs, by joining from an invite sent to it', async () => {
  const mallory = await member(homing.url, 'Mallory', { verified: false });
  const tried = await ana.browser.json(`/api/spaces/${acme}/members`, { email: mallory.email });
  assert.deepEqual([tried.status, tried.body.field], [400, 'email']);
  const proposed = await act({ space: `space:${acme}`, person: mallory.email, change: 'add' });
  assert.equal((await shown(ana, proposed.proposal!)).member.found, false);
  assert.equal((await decide(ana, proposed.proposal!)).status, 400);
  assert.equal(await canOpen(mallory, acme), false);
});

test('anyone can leave a space, and a role changes only where it was given', async () => {
  // Ben is a member of Acme, not an admin.
  const notAdmin = await ana.browser.json(`/api/spaces/${acme}/members/${ben.id}`, { change: 'make member' });
  assert.deepEqual([notAdmin.status, notAdmin.body.message], [400, 'Ben isn’t an admin of Acme.']);
  // An admin of Acme is an admin of Website too, but only Acme makes them one.
  const website = await as(ana, (s) => createSpace(s, { name: 'Website', parentId: acme }));
  await as(ana, (s) => addMember(s, website, ana.id, 'admin'));
  await as(ana, (s) => addMember(s, acme, ben.id, 'admin'));
  const above = await ana.browser.json(`/api/spaces/${website}/members/${ben.id}`, { change: 'make member' });
  assert.equal(above.status, 400);
  await as(ana, (s) => addMember(s, acme, ben.id, 'member'));

  const left = await ben.browser.json(`/api/spaces/${acme}/members/${ben.id}`, { change: 'remove' });
  assert.equal(left.status, 200, JSON.stringify(left.body));
  assert.equal(await canOpen(ben, acme), false);
});
