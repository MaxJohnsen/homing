// Issue #31, suggested spaces (spec §1): an assistant suggests a space that is its own idea, and the
// person changes and creates it, or declines it, in Homing or on the card. Suggestions are rare: one
// waits at a time, and a space the person declined, or let expire, isn't suggested again by name.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

type Suggestion = { name: string; who: string; in: string | null; closed: boolean; why: string | null; places: { id: string; label: string; mine: boolean }[]; created: { id: string; name: string } | null };

const act = async (action: string, input: Record<string, unknown>) => {
  const result = await claude.client.callTool({ name: 'act', arguments: { action, input } });
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
  return { failed: Boolean(result.isError), text, proposal: /proposal:([0-9a-f-]{36})/.exec(text)?.[1] };
};
const suggest = (name: string, extra: Record<string, unknown> = {}) =>
  act('space.suggest', { name, who: 'just me', why: 'You’ve been planning this across several conversations.', ...extra });
const proposal = async (who: Member, id: string) => {
  const { status, body } = await who.browser.json(`/api/proposals/${id}`);
  return { status, proposal: body.proposal as { action: string; state: string; suggestion: Suggestion } };
};
const decide = (who: Member, id: string, body: Record<string, unknown>) => who.browser.json(`/api/proposals/${id}/decide`, body);

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    cardClients: [assistants.claude.client_id],
  });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('an assistant suggests a space, and the person changes it and creates it', async () => {
  const suggested = await suggest('Home renovation');
  assert.ok(!suggested.failed, suggested.text);
  assert.match(suggested.text, /Nothing has been created yet/);

  // It waits on Home like any proposal, and nobody else sees it.
  const waiting = (await ana.browser.json('/api/waiting')).body.waiting as { id: string; action: string; text: string }[];
  assert.deepEqual(waiting.map((item) => [item.action, item.text]), [['space', 'Home renovation']]);
  assert.equal((await proposal(cara, suggested.proposal!)).status, 404);

  const { proposal: shown } = await proposal(ana, suggested.proposal!);
  assert.deepEqual([shown.action, shown.suggestion.name, shown.suggestion.who, shown.suggestion.why], ['space', 'Home renovation', 'just me', 'You’ve been planning this across several conversations.']);
  // Where it could go instead: anywhere in Ana's personal tree, and the shared spaces she looks after.
  assert.deepEqual(shown.suggestion.places.map((place) => [place.label, place.mine]), [['Your personal space', true], ['Acme', false]]);

  // Ana shares it in Acme instead, under another name.
  const created = await decide(ana, suggested.proposal!, { approve: true, space: { name: 'Acme office move', who: 'with others', in: acme, closed: false } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.deepEqual([created.body.proposal.state, created.body.proposal.suggestion.created.name], ['approved', 'Acme office move']);
  const space = created.body.proposal.suggestion.created.id as string;
  assert.equal((await cara.browser.json(`/api/spaces/${space}`)).body.name, 'Acme office move');
  // Ana created it herself, so it's hers, not the assistant's doing.
  const [row] = await admin`select parent_id, created_by, agent from spaces where id = ${space}`;
  assert.deepEqual([row.parentId, row.createdBy, row.agent], [acme, ana.id, null]);

  // The assistant learns what it became.
  const read = await claude.call('read', { ref: `proposal:${suggested.proposal}` });
  assert.match(read.text, new RegExp(`The user created it on .+ \\(space:${space}\\)`));
});

test('one suggestion waits at a time, and a declined one isn’t made again', async () => {
  const first = await suggest('Garden');
  assert.ok(!first.failed, first.text);
  const second = await suggest('Boat');
  assert.ok(second.failed);
  assert.match(second.text, /A suggested space, Garden, is already waiting for the user\./);

  assert.equal((await decide(ana, first.proposal!, { approve: false })).status, 200);
  const { proposal: declined } = await proposal(ana, first.proposal!);
  assert.equal(declined.state, 'rejected');
  assert.equal(await spaceNamed('Garden'), undefined);
  const again = await suggest('garden');
  assert.ok(again.failed);
  assert.match(again.text, /The user didn’t create a space called garden when it was suggested on/);

  // Nor one the person let expire.
  const ignored = await suggest('Boat');
  await admin`update proposals set expires_at = now() - interval '1 minute' where id = ${ignored.proposal!}`;
  assert.match((await suggest('Boat')).text, /didn’t create a space called Boat/);
  // A space the person asks for is still created.
  assert.ok(!(await act('space.create', { name: 'Garden', who: 'just me' })).failed);
});

test('a suggestion fits where it would go, and creating it is checked again when decided', async () => {
  const taken = await suggest('Garden');
  assert.ok(taken.failed);
  assert.match(taken.text, /There’s already a space called Garden in your personal space\. Use it \(space:.+\) instead\./);
  assert.ok((await act('space.suggest', { name: 'Shared garden', who: 'with others', in: `space:${ana.personalSpaceId}`, why: 'For the neighbours.' })).failed);
  assert.ok((await act('space.suggest', { name: 'Garden club', who: 'just me' })).failed, 'it needs a reason the user reads');

  const club = await suggest('Garden club', { why: 'You keep planning the club’s season.' });
  const clash = await decide(ana, club.proposal!, { approve: true, space: { name: 'garden', who: 'just me', in: null, closed: false } });
  assert.deepEqual([clash.status, clash.body.field], [400, 'name']);
  assert.equal((await proposal(ana, club.proposal!)).proposal.state, 'open');
  // As suggested, it's created where it was suggested.
  const created = await decide(ana, club.proposal!, { approve: true });
  assert.equal(created.body.proposal.suggestion.created.name, 'Garden club');
  assert.equal((await spaceNamed('Garden club'))?.parentId, ana.personalSpaceId);
});

test('on the card, the person creates the suggested space as they set it, and the assistant never can', async () => {
  const suggested = await suggest('Cabin');
  const card = await claude.client.callTool({
    name: 'decide',
    arguments: { proposal: suggested.proposal, approve: true, space: { name: 'Mountain cabin', who: 'just me', in: null, closed: false } },
  });
  assert.ok(!card.isError, JSON.stringify(card.content));
  const shown = (card.structuredContent as { proposal: { state: string; suggestion: Suggestion } }).proposal;
  assert.deepEqual([shown.state, shown.suggestion.created?.name], ['approved', 'Mountain cabin']);
  const [decision] = await admin`select decided_in, space_created from proposals where id = ${suggested.proposal!}`;
  assert.equal(decision.decidedIn, 'Claude');

  // Only a decision sets the space a suggestion created.
  const later = await suggest('Sauna');
  await assert.rejects(
    as({ person: ana.id, direct: true }, (s) => s.tx`update proposals set space_created = ${decision.spaceCreated} where id = ${later.proposal!}`),
  );
});

async function spaceNamed(name: string) {
  return ((await ana.browser.json('/api/spaces')).body.spaces as { name: string; parentId: string | null }[]).find((space) => space.name === name);
}
