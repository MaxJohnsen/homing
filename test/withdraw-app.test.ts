// Withdrawing a proposal, and the assistant knowing how one ended (spec §6). The person a proposal
// is for, or their assistant, withdraws it while it waits, including a request sent to the admins.
// Withdrawing never decides it. The assistant learns how proposals ended from Homing.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { proposeRule } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
const propose = (text: string) =>
  claude.call('act', { action: 'guidance.propose', input: { space: `space:${acme}`, change: 'add', kind: 'preference', text, shared: false } });
const stateOf = async (who: Member, proposal: string) => (await who.browser.json(`/api/proposals/${proposal}`)).body.proposal?.state;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('the assistant withdraws a proposal the user no longer wants, which decides nothing', async () => {
  const proposal = proposalOf((await propose('Write reports in Norwegian.')).text);
  const withdrawn = await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${proposal}` } });
  assert.match(withdrawn.text, /^Withdrawn: .+ It ended, and nothing changed\./);
  assert.equal(await stateOf(ana, proposal), 'withdrawn');
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true })).status, 409, 'withdrawn, it can no longer be approved');
  assert.match((await claude.call('read', { ref: `proposal:${proposal}` })).text, /Withdrawn on .+ nothing changed/);
  assert.match((await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${proposal}` } })).text, /decided already/);
});

test('the assistant learns how a proposal ended from Homing, not from what it said before', async () => {
  const proposal = proposalOf((await propose('Keep meeting notes short.')).text);
  assert.match((await claude.call('context', { request: 'notes', space: `space:${acme}` })).text, /## Waiting for approval[\s\S]*Keep meeting notes short/);
  assert.equal((await ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: false })).status, 200);
  const context = (await claude.call('context', { request: 'notes', space: `space:${acme}` })).text;
  assert.doesNotMatch(context.split('## Ended lately')[0], /Keep meeting notes short/);
  assert.match(context, new RegExp(`## Ended lately[\\s\\S]*Keep meeting notes short.+proposal:${proposal}\\): The user rejected it on`));
  assert.match((await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${proposal}` } })).text, /decided already/);
});

test('a member withdraws a request they sent to the admins, and only they can', async () => {
  const request = await as({ person: cara.id, agent: 'Claude' }, (s) =>
    proposeRule(s, { action: 'add rule', spaceId: acme, kind: 'requirement', text: 'Copy the CFO on every invoice.', shared: true }),
  );
  assert.equal((await cara.browser.json(`/api/proposals/${request.id}/decide`, { approve: true })).status, 200, 'Cara sends it');
  assert.equal(await stateOf(cara, request.id), 'requested');
  assert.equal((await ana.browser.json(`/api/proposals/${request.id}/withdraw`, {})).status, 404, 'not the admin');
  assert.equal((await cara.browser.json(`/api/proposals/${request.id}/withdraw`, {})).status, 200);
  assert.equal(await stateOf(cara, request.id), 'withdrawn');
  assert.equal((await ana.browser.json(`/api/proposals/${request.id}/decide`, { approve: true })).status, 409, 'nothing left for the admins to decide');
  const mine = (await cara.browser.json('/api/requests')).body.requests as { id: string; state: string }[];
  assert.equal(mine.find((sent) => sent.id === request.id)?.state, 'withdrawn');
});

test('straight against the database, withdrawing is the only change an assistant makes to a proposal', async () => {
  const open = await as({ person: ana.id, agent: 'Claude' }, (s) =>
    proposeRule(s, { action: 'add rule', spaceId: acme, kind: 'preference', text: 'Use metric units.', shared: false }),
  );
  const asAssistant = (state: string) => as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`update proposals set state = ${state} where id = ${open.id}::uuid`);
  await assert.rejects(asAssistant('approved'), refused);
  await assert.rejects(asAssistant('rejected'), refused);
  // Not anyone else's, either.
  const withdrawn = await as({ person: cara.id, agent: 'Claude' }, (s) => s.tx`update proposals set state = 'withdrawn' where id = ${open.id}::uuid returning id`);
  assert.equal(withdrawn.length, 0);
  await asAssistant('withdrawn');
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`update proposals set state = 'approved' where id = ${open.id}::uuid`), { code: '23514' });
});
