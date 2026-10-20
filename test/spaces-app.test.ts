// Issue #31, creating spaces (spec §1): from the web app and from an assistant, without approval.
// Who a space is for decides where it can go. Just for you, it's in your personal space, where nobody
// else can be added. With others, it's a space of its own, or in a shared space you look after,
// open to everyone there or closed. Admins rename a space; a personal space keeps its name.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;

type SpaceRow = { id: string; name: string; parentId: string | null; closed: boolean; private: boolean; admin: boolean };

const create = (who: Member, body: Record<string, unknown>) => who.browser.json('/api/spaces', body);
const rename = (who: Member, space: string, name: string) => who.browser.json(`/api/spaces/${space}`, { name });
const spacesOf = async (who: Member) => (await who.browser.json('/api/spaces')).body.spaces as SpaceRow[];
const created = async (who: Member, body: Record<string, unknown>) => {
  const { status, body: answer } = await create(who, body);
  assert.equal(status, 200, JSON.stringify(answer));
  return answer.id as string;
};

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    cardClients: [assistants.claude.client_id],
  });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
});

after(() => homing.close());

test('a space just for you goes in your personal space, and nobody else can open it', async () => {
  const home = await created(ana, { name: 'Home renovation', who: 'just me' });
  const kitchen = await created(ana, { name: '  Kitchen   plans ', who: 'just me', in: home });
  const mine = await spacesOf(ana);
  assert.deepEqual(
    [home, kitchen].map((id) => mine.find((space) => space.id === id)).map((space) => [space?.name, space?.parentId, space?.private, space?.admin]),
    [['Home renovation', ana.personalSpaceId, true, true], ['Kitchen plans', home, true, true]],
  );
  assert.equal((await cara.browser.json(`/api/spaces/${home}`)).status, 404);

  // Nobody else can ever be added there, so it can't be made with others.
  const shared = await create(ana, { name: 'Builders', who: 'with others', in: home });
  assert.deepEqual([shared.status, shared.body.field], [400, 'in']);
  assert.match(shared.body.message, /only ever yours/);
});

test('a space with others is one of its own, or goes in a shared space you look after, open or closed', async () => {
  const acme = await created(ana, { name: 'Acme', who: 'with others' });
  await as(ana, (s) => addMember(s, acme, cara.id));
  const website = await created(ana, { name: 'Website', who: 'with others', in: acme });
  const northwind = await created(ana, { name: 'Northwind', who: 'with others', in: acme, closed: true });

  const forAna = await spacesOf(ana);
  assert.deepEqual(forAna.find((space) => space.id === acme), { id: acme, name: 'Acme', parentId: null, closed: false, personal: false, private: false, admin: true });
  assert.equal(forAna.find((space) => space.id === northwind)?.closed, true);
  // Everyone in Acme has the open one; only the people added to the closed one have it.
  assert.equal((await cara.browser.json(`/api/spaces/${website}`)).status, 200);
  assert.equal((await cara.browser.json(`/api/spaces/${northwind}`)).status, 404);

  // Only admins create spaces in a space, and just for you means your personal space.
  const byMember = await create(cara, { name: 'Ideas', who: 'with others', in: acme });
  assert.deepEqual([byMember.status, byMember.body.message], [403, 'Only Acme’s admins create spaces in it.']);
  const justMe = await create(ana, { name: 'My notes', who: 'just me', in: acme });
  assert.deepEqual([justMe.status, justMe.body.field], [400, 'in']);
  // Nor in a space you can't open, which stays unnamed.
  const elsewhere = await create(cara, { name: 'Ideas', who: 'with others', in: northwind });
  assert.equal(elsewhere.status, 404);
  assert.doesNotMatch(JSON.stringify(elsewhere.body), /Northwind/);
});

test('a space needs a name, and one that isn’t taken where it goes', async () => {
  for (const name of ['', '   ', 'x'.repeat(101)]) {
    const refused = await create(ana, { name, who: 'just me' });
    assert.deepEqual([refused.status, refused.body.field], [400, 'name']);
  }
  assert.equal((await create(ana, { name: 'Acme', who: 'nobody' })).status, 400);
  const acme = (await spacesOf(ana)).find((space) => space.name === 'Acme')!.id;
  const taken = await create(ana, { name: 'website', who: 'with others', in: acme });
  assert.deepEqual([taken.status, taken.body.field, taken.body.message], [400, 'name', 'There’s already a space called Website in Acme.']);
  // The same name elsewhere is fine, such as each client's Website.
  await created(ana, { name: 'Website', who: 'with others' });
});

test('admins rename a space for everyone, and a personal space keeps its name', async () => {
  const spaces = await spacesOf(ana);
  const acme = spaces.find((space) => space.name === 'Acme')!.id;
  const website = spaces.find((space) => space.name === 'Website' && space.parentId === acme)!.id;
  const northwind = spaces.find((space) => space.name === 'Northwind')!.id;
  const renamed = await rename(ana, website, 'Acme website');
  assert.deepEqual([renamed.status, renamed.body.name], [200, 'Acme website']);
  assert.equal((await cara.browser.json(`/api/spaces/${website}`)).body.name, 'Acme website');

  const byMember = await rename(cara, acme, 'Ours');
  assert.deepEqual([byMember.status, byMember.body.message], [403, 'Only Acme’s admins rename it.']);
  assert.equal((await rename(ana, ana.personalSpaceId, 'Mine')).status, 403);
  assert.equal((await rename(ana, website, 'Northwind')).status, 400);
  assert.equal((await rename(cara, northwind, 'Hello')).status, 404);
  assert.equal((await spacesOf(ana)).find((space) => space.id === northwind)?.name, 'Northwind');
});

test('an assistant creates the space the user asks for, and Homing records that it did', async () => {
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(ana.browser);
  const chat = await claude.open();
  const act = async (action: string, input: Record<string, unknown>) => {
    const result = await chat.client.callTool({ name: 'act', arguments: { action, input } });
    return {
      failed: Boolean(result.isError),
      text: result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n'),
      done: (result.structuredContent as { done?: { heading: string; detail: string } } | undefined)?.done,
    };
  };

  const globex = await act('space.create', { name: 'Globex', who: 'with others' });
  assert.ok(!globex.failed, globex.text);
  const id = /space:([0-9a-f-]{36})/.exec(globex.text)![1];
  assert.match(globex.text, /^Created Globex \(space:.+\)\. A space of its own\. Only the user has it so far\./);
  // The card shows what was done, in the person's words.
  assert.deepEqual(globex.done, { heading: 'Created Globex', detail: 'A space of its own. Only you have it so far.', link: new URL(`/spaces/${id}`, homing.url).toString() });
  const [row] = await admin`select created_by, agent from spaces where id = ${id}`;
  assert.deepEqual([row.createdBy, row.agent], [ana.id, 'Claude']);

  const inside = await act('space.create', { name: 'Billing', who: 'with others', in: `space:${id}`, closed: true });
  assert.match(inside.text, /In Globex\. Only the people added to it have access, and Globex’s rules apply in it\./);
  const twice = await act('space.create', { name: 'globex', who: 'with others' });
  assert.ok(twice.failed);
  assert.match(twice.text, new RegExp(`There’s already a space called Globex on its own\\. Use it \\(space:${id}\\), or choose another name\\.`));
  const personal = await act('space.create', { name: 'Diary', who: 'with others', in: `space:${ana.personalSpaceId}` });
  assert.ok(personal.failed);

  const renamed = await act('space.rename', { space: `space:${id}`, name: 'Globex Corporation' });
  assert.equal(renamed.text, `Renamed Globex to Globex Corporation (space:${id}).`);
  assert.deepEqual(renamed.done, { heading: 'Renamed to Globex Corporation', detail: 'It was called Globex.' });
  const mixed = await act('space.create', { space: `space:${id}`, name: 'Hello' });
  assert.ok(mixed.failed);
  assert.match(mixed.text, /doesn't fit space\.create/);
  // The user's new space is where the assistant looks next.
  assert.match((await chat.call('context', { request: 'Plan the Globex kickoff' })).text, /Globex Corporation/);
});
