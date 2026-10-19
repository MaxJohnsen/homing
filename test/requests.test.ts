// Issue #4, done when: a member requests a change to a shared rule, an admin
// approves it, and the member's assistant sees the outcome. The member sends
// the exact request first. Any admin of the space decides it, once, and only
// while they still are one. Approving, rejecting, not sending, expiring, a
// rule that changed before the decision, and a decider who is no longer an
// admin each leave the rules as they should. Only the member and the space's
// admins ever see a request, and no assistant decides one.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule, editRule, rulesFor } from '../src/guidance.ts';
import { decide as decideAs } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
});

after(() => homing.close());

/** Acme, where Ana and Jon are admins, and Cara and Dan members. Cara has Claude. */
async function acme() {
  const [ana, jon, cara, dan] = [await member(homing.url, 'Ana'), await member(homing.url, 'Jon'), await member(homing.url, 'Cara'), await member(homing.url, 'Dan')];
  const space = await as(ana, async (s) => {
    const space = await createSpace(s, { name: 'Acme' });
    await addMember(s, space, jon.id, 'admin');
    await addMember(s, space, cara.id);
    await addMember(s, space, dan.id);
    return space;
  });
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(cara.browser);
  return { ana, jon, cara, dan, space, ref: `space:${space}`, claude: await claude.open() };
}

/** Cara asks Claude for a change to Acme's shared rules, and gets the request's id. */
async function request(claude: Awaited<ReturnType<typeof acme>>['claude'], input: Record<string, unknown>) {
  const asked = await claude.call('act', { action: 'guidance.propose', input });
  assert.equal(asked.failed, false, asked.text);
  return /proposal:([0-9a-f-]{36})/.exec(asked.text)![1];
}

const page = (who: Member, id: string) => who.browser.json(`/api/proposals/${id}`);
const decide = (who: Member, id: string, decision: Record<string, unknown>) => who.browser.json(`/api/proposals/${id}/decide`, decision);
const rules = async (who: Member, space: string) => (await as(who, (s) => rulesFor(s, space))).map((rule) => rule.body);
const waiting = async (who: Member) =>
  ((await who.browser.json('/api/waiting')).body.waiting as { id: string; request: { by: string | null; sent: boolean } | null }[]);

test('a member sends a request, an admin approves it, and the member’s assistant sees the outcome', async () => {
  const { ana, jon, cara, space, ref, claude } = await acme();
  const id = await request(claude, { space: ref, change: 'add', kind: 'requirement', text: 'Copy the CFO on every invoice', shared: true, why: 'The CFO asked for it at Monday’s meeting' });

  // It waits for Cara to send it, and the admins don't see it yet.
  assert.deepEqual((await waiting(cara)).map(({ id: shown, request }) => [shown, request]), [[id, { by: null, sent: false }]]);
  assert.equal((await page(ana, id)).status, 404);
  assert.deepEqual(await waiting(ana), []);

  const sent = await decide(cara, id, { approve: true });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.proposal.state, 'requested');
  assert.deepEqual(sent.body.proposal.request.admins.sort(), ['Ana', 'Jon']);
  assert.deepEqual(await rules(cara, space), []);

  // Now it waits for every admin, saying who asked and why, and no longer for Cara.
  for (const admin of [ana, jon]) assert.deepEqual((await waiting(admin)).map((item) => [item.id, item.request]), [[id, { by: 'Cara', sent: true }]]);
  assert.deepEqual(await waiting(cara), []);
  const shown = (await page(jon, id)).body.proposal;
  assert.deepEqual([shown.request.by, shown.request.why, shown.state], ['Cara', 'The CFO asked for it at Monday’s meeting', 'requested']);

  // Cara can't approve her own request, and one admin's decision settles it.
  assert.equal((await decide(cara, id, { approve: true })).status, 409);
  const approved = await decide(jon, id, { approve: true });
  assert.equal(approved.body.proposal.state, 'approved');
  assert.deepEqual(await rules(cara, space), ['Copy the CFO on every invoice']);
  assert.equal((await decide(ana, id, { approve: false })).status, 409);
  assert.deepEqual(await waiting(ana), []);

  // Made by Jon, as a direct edit, recorded as his decision.
  const [decision] = await admin`select decided_by from proposals where id = ${id}`;
  assert.equal(decision.decidedBy, jon.id);
  const [rule] = await admin`select written_by, agent from content where body = 'Copy the CFO on every invoice' and space_id = ${space}`;
  assert.deepEqual({ ...rule }, { writtenBy: jon.id, agent: null });

  // Cara sees who decided, and her assistant sees the outcome.
  assert.equal((await page(cara, id)).body.proposal.decidedBy, 'Jon');
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /An admin of the space approved it/);
  const context = (await claude.call('context', { request: 'Write an invoice', space: ref })).text;
  assert.match(context, /The user's requests to the admins/);
  assert.match(context, /Copy the CFO on every invoice/);
});

test('rejecting, or not sending it, changes nothing', async () => {
  const { ana, cara, dan, space, ref, claude } = await acme();
  const rejected = await request(claude, { space: ref, change: 'add', kind: 'preference', text: 'Write in Norwegian', shared: true });
  await decide(cara, rejected, { approve: true });
  assert.equal((await decide(ana, rejected, { approve: false })).body.proposal.state, 'rejected');
  assert.match((await claude.call('read', { ref: `proposal:${rejected}` })).text, /An admin of the space rejected it/);

  const unsent = await request(claude, { space: ref, change: 'add', kind: 'preference', text: 'Write in Swedish', shared: true });
  assert.equal((await decide(cara, unsent, { approve: false })).body.proposal.state, 'rejected');
  // It was never sent, so the admins never see it.
  assert.equal((await page(ana, unsent)).status, 404);
  assert.match((await claude.call('read', { ref: `proposal:${unsent}` })).text, /The user didn't send it/);
  assert.deepEqual(await rules(dan, space), []);
});

test('a request nobody decides expires, and can’t be approved', async () => {
  const { ana, cara, space, ref, claude } = await acme();
  const id = await request(claude, { space: ref, change: 'add', kind: 'preference', text: 'Write in Danish', shared: true });
  await decide(cara, id, { approve: true });
  await admin`update proposals set expires_at = now() - interval '1 minute' where id = ${id}`;
  assert.equal((await page(ana, id)).body.proposal.state, 'expired');
  assert.equal((await decide(ana, id, { approve: true })).status, 410);
  assert.deepEqual(await rules(ana, space), []);
});

test('a rule that changed before the decision is shown again', async () => {
  const { ana, jon, cara, space, ref, claude } = await acme();
  const rule = await as({ person: ana.id, direct: true }, (s) => addRule(s, { spaceId: space, kind: 'preference', body: 'Write in English', shared: true }));
  const id = await request(claude, { space: ref, change: 'change', rule: `item:${rule.id}`, text: 'Write in British English' });
  await decide(cara, id, { approve: true });
  const shown = (await page(jon, id)).body.proposal.rule.text;
  await as({ person: ana.id, direct: true }, (s) => editRule(s, rule.id, 'Write in American English'));
  const late = await decide(jon, id, { approve: true, shown });
  assert.deepEqual([late.status, late.body.code], [409, 'CHANGED']);
  assert.deepEqual(await rules(cara, space), ['Write in American English']);
});

test('only someone who is an admin when deciding decides it', async () => {
  const { ana, jon, cara, dan, space, ref, claude } = await acme();
  const id = await request(claude, { space: ref, change: 'add', kind: 'requirement', text: 'Never quote by phone', shared: true });
  await decide(cara, id, { approve: true });
  // Dan is a member, not an admin, so he neither sees it nor decides it.
  assert.equal((await page(dan, id)).status, 404);
  assert.equal((await decide(dan, id, { approve: true })).status, 404);
  // Jon stops being an admin before he decides.
  await as(ana, (s) => addMember(s, space, jon.id, 'member'));
  assert.equal((await decide(jon, id, { approve: true })).status, 404);
  assert.deepEqual(await rules(dan, space), []);
  // Ana still is.
  assert.equal((await decide(ana, id, { approve: true })).body.proposal.state, 'approved');
});

test('no assistant sends or decides a request', async () => {
  const { ana, cara, space, ref, claude } = await acme();
  const id = await request(claude, { space: ref, change: 'add', kind: 'preference', text: 'Write in Finnish', shared: true });
  await assert.rejects(as({ person: cara.id, agent: 'Claude' }, (s) => decideAs(s, id, { approve: true })), refused);
  await decide(cara, id, { approve: true });
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => decideAs(s, id, { approve: true })), refused);
  assert.deepEqual(await rules(ana, space), []);
});
