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
  assert.match(unknown.body.message, /No one uses Homing with that email yet/);

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
  assert.deepEqual((await shown(ana, proposed.proposal!)).member, { change: 'add', name: 'Cara', email: null, found: true });
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
  assert.ok(!(await act({ space: `space:${acme}`, person: 'cara berg', change: 'add' })).failed);
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
  assert.deepEqual((await shown(ana, known.proposal!)).member, { change: 'add', name: 'Ben', email: ben.email, found: true });
  assert.deepEqual((await shown(ana, unknown.proposal!)).member, { change: 'add', name: null, email: 'nobody@example.test', found: false });
  const nobody = await decide(ana, unknown.proposal!);
  assert.equal(nobody.status, 400);
  assert.match(nobody.body.message, /No one uses Homing with that email yet/);
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
