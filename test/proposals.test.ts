// Issue #4, done when: an assistant proposes a rule, and it applies only once
// the person approves it, in Homing or on the card in Claude. The assistant
// can't approve it, nor can anyone else. Rejecting, expiring, a rule that
// changed before the decision, and rights lost before it each leave the
// rules as they were.

import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule, editRule, rulesFor } from '../src/guidance.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, until, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    // Claude is checked to keep the model from pressing the card's buttons, and ChatGPT not yet.
    cardClients: [assistants.claude.client_id],
  });
});

after(() => homing.close());

/** Ana runs Acme, where Cara works with her. Each has Claude connected. */
async function acme() {
  const ana = await member(homing.url, 'Ana');
  const cara = await member(homing.url, 'Cara');
  const space = await as(ana, async (s) => {
    const space = await createSpace(s, { name: 'Acme' });
    await addMember(s, space, cara.id);
    return space;
  });
  return { ana, cara, space, ref: `space:${space}`, claude: { ana: await chat(ana), cara: await chat(cara) } };
}

/** A conversation with Claude, or another assistant, connected for the person. */
async function chat(who: Member, document = assistants.claude) {
  const claude = new Assistant(homing.url, document);
  await claude.connect(who.browser);
  return { ...(await claude.open()), token: claude.tokens!.access_token };
}

type Chat = Awaited<ReturnType<typeof chat>>;

/** Asks Claude to propose a rule change, and returns the proposal's id. */
async function propose(claude: Chat, input: Record<string, unknown>) {
  const asked = await claude.call('act', { action: 'guidance.propose', input });
  assert.equal(asked.failed, false, asked.text);
  const id = /proposal:([0-9a-f-]{36})/.exec(asked.text)![1];
  return { id, text: asked.text };
}

const page = (who: Member, id: string) => who.browser.json(`/api/proposals/${id}`);
const decide = (who: Member, id: string, decision: Record<string, unknown>) => who.browser.json(`/api/proposals/${id}/decide`, decision);
const rules = async (who: Member, space: string) => (await as(who, (s) => rulesFor(s, space))).map((rule) => rule.body);
const direct = (who: Member) => ({ person: who.id, direct: true as const });

test('a rule an assistant proposes applies only once the person approves it', async () => {
  const { ana, ref, space, claude } = await acme();

  const proposed = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Write status reports in Norwegian', shared: true });
  // Claude gets a link to give Ana, on Homing's own pages.
  assert.ok(proposed.text.includes(new URL(`/proposals/${proposed.id}`, homing.url).toString()), proposed.text);

  // Nothing changed yet. Claude sees it waiting.
  const waiting = (await claude.ana.call('context', { request: 'Write the status report', space: ref })).text;
  assert.doesNotMatch(waiting, /## Rules/);
  assert.match(waiting, /## Waiting for approval\n.+\n- Add a preference \(shared\): "Write status reports in Norwegian"/);
  assert.match((await claude.ana.call('read', { ref: `proposal:${proposed.id}` })).text, /Waiting for the user's approval/);

  // Ana sees exactly what Claude asked for, and where.
  const shown = await page(ana, proposed.id);
  assert.equal(shown.status, 200);
  const { assistant, space: where, action, kind, text, shared, onlyHere, state } = shown.body.proposal;
  assert.deepEqual(
    { assistant, where, action, kind, text, shared, onlyHere, state },
    { assistant: 'Claude', where: 'Acme', action: 'add', kind: 'preference', text: 'Write status reports in Norwegian', shared: true, onlyHere: false, state: 'open' },
  );

  const approved = await decide(ana, proposed.id, { approve: true });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.proposal.state, 'approved');

  // Now it applies, as a rule Ana added herself.
  const after = (await claude.ana.call('context', { request: 'Write the status report', space: ref })).text;
  assert.match(after, /## Rules\n.+\n- Preference, from Acme: Write status reports in Norwegian/);
  assert.doesNotMatch(after, /Waiting for approval/);
  assert.match((await claude.ana.call('read', { ref: `proposal:${proposed.id}` })).text, /The user approved it/);
  const [rule] = await admin`select written_by, agent from content where space_id = ${space} and body = 'Write status reports in Norwegian'`;
  assert.deepEqual(rule, { writtenBy: ana.id, agent: null });
});

test('an assistant can’t approve its own proposal', async () => {
  const { ana, ref, space, claude } = await acme();
  const { id } = await propose(claude.ana, { space: ref, change: 'add', kind: 'requirement', text: 'Never send prices by email', shared: true });

  // The model has no tool for it. Claude shows the card's tools only to the card.
  const visibility = (tool: { _meta?: Record<string, any> }): string[] => tool._meta?.ui?.visibility ?? ['model', 'app'];
  const forTheModel = (await claude.ana.client.listTools()).tools.filter((tool) => visibility(tool).includes('model'));
  assert.deepEqual(forTheModel.map((tool) => tool.name).sort(), ['act', 'context', 'read', 'remember', 'search']);

  // Its token doesn't count as Ana on Homing's pages.
  const withToken = await fetch(new URL(`/api/proposals/${id}/decide`, homing.url), {
    method: 'POST',
    headers: { origin: homing.url.origin, 'content-type': 'application/json', authorization: `Bearer ${claude.ana.token}` },
    body: JSON.stringify({ approve: true }),
  });
  assert.equal(withToken.status, 401);

  // And straight against the database, a session acting through an assistant
  // can't decide it, even claiming to edit directly, nor make one already approved.
  const throughClaude = { person: ana.id, agent: 'Claude' };
  for (const principal of [throughClaude, { ...throughClaude, direct: true as const }]) {
    await assert.rejects(as(principal, (s) => s.tx`update proposals set state = 'approved' where id = ${id}`), refused);
    await assert.rejects(as(principal, (s) => s.tx`update proposals set decided_in = 'Claude' where id = ${id}`), refused);
  }
  await assert.rejects(
    as(throughClaude, (s) => s.tx`
      insert into proposals (space_id, private_to, action, change, state)
      values (${space}, ${ana.id}, 'add rule', '{}', 'approved')
    `),
    refused,
  );

  assert.equal((await page(ana, id)).body.proposal.state, 'open');
  assert.deepEqual(await rules(ana, space), []);
});

test('rejecting changes nothing, and a proposal is decided only once', async () => {
  const { ana, ref, space, claude } = await acme();
  const rejected = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Use the old template' });

  assert.equal((await decide(ana, rejected.id, { approve: false })).body.proposal.state, 'rejected');
  assert.match((await claude.ana.call('read', { ref: `proposal:${rejected.id}` })).text, /The user rejected it/);
  const again = await decide(ana, rejected.id, { approve: true });
  assert.deepEqual([again.status, again.body.code], [409, 'DECIDED']);
  await assert.rejects(as(direct(ana), (s) => s.tx`update proposals set state = 'approved' where id = ${rejected.id}`), { code: '23514' });
  assert.deepEqual(await rules(ana, space), []);

  // Approving twice at once, say from two tabs, adds the rule once, and the second is told it was decided.
  const twice = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Use the new template' });
  const held = await admin.reserve();
  let answers;
  try {
    await held`begin`;
    await held`select from proposals where id = ${twice.id} for update`;
    const both = Promise.all([decide(ana, twice.id, { approve: true }), decide(ana, twice.id, { approve: true })]);
    await until(async () => (await admin`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock'`)[0].n >= 2);
    await held`commit`;
    answers = await both;
  } finally {
    held.release();
  }
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
  assert.deepEqual(await rules(ana, space), ['Use the new template']);
});

test('a proposal nobody decides expires, and can’t be approved', async () => {
  const { ana, ref, space, claude } = await acme();
  const { id } = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Write reports in Norwegian' });
  await admin`update proposals set expires_at = now() - interval '1 minute' where id = ${id}`;

  assert.equal((await page(ana, id)).body.proposal.state, 'expired');
  const late = await decide(ana, id, { approve: true });
  assert.deepEqual([late.status, late.body.code], [410, 'EXPIRED']);
  // The database refuses it on its own too.
  await assert.rejects(as(direct(ana), (s) => s.tx`update proposals set state = 'approved' where id = ${id}`), { code: '23514' });

  assert.deepEqual(await rules(ana, space), []);
  assert.doesNotMatch((await claude.ana.call('context', { request: 'reports', space: ref })).text, /Waiting for approval/);
  assert.match((await claude.ana.call('read', { ref: `proposal:${id}` })).text, /it expired and nothing changed/);
});

test('a change to a rule that changed in the meantime is shown again before it applies', async () => {
  const { ana, ref, space, claude } = await acme();
  const rule = await as(direct(ana), (s) => addRule(s, { spaceId: space, kind: 'preference', body: 'Write reports in English', shared: true }));
  const { id } = await propose(claude.ana, { space: ref, change: 'change', rule: `item:${rule.id}`, text: 'Write reports in Norwegian' });

  const opened = (await page(ana, id)).body.proposal;
  assert.deepEqual([opened.action, opened.rule.text, opened.text], ['change', 'Write reports in English', 'Write reports in Norwegian']);

  // Ana changes the rule herself while the page is open, then approves what the page showed.
  await as(direct(ana), (s) => editRule(s, rule.id, 'Write reports in English or Norwegian'));
  const stale = await decide(ana, id, { approve: true, shown: opened.rule.text });
  assert.deepEqual([stale.status, stale.body.code], [409, 'CHANGED']);
  assert.deepEqual(await rules(ana, space), ['Write reports in English or Norwegian']);

  // Shown again, with the rule as it is now, she approves it.
  const reopened = (await page(ana, id)).body.proposal;
  assert.equal(reopened.rule.text, 'Write reports in English or Norwegian');
  assert.equal((await decide(ana, id, { approve: true, shown: reopened.rule.text })).status, 200);
  assert.deepEqual(await rules(ana, space), ['Write reports in Norwegian']);

  // Removing works the same way, and a rule that's already gone can't be changed.
  const removal = await propose(claude.ana, { space: ref, change: 'remove', rule: `item:${rule.id}` });
  const change = await propose(claude.ana, { space: ref, change: 'change', rule: `item:${rule.id}`, text: 'Write reports in French' });
  assert.equal((await decide(ana, removal.id, { approve: true, shown: 'Write reports in Norwegian' })).status, 200);
  assert.deepEqual(await rules(ana, space), []);
  assert.equal((await page(ana, change.id)).body.proposal.rule.current, false);
  assert.equal((await decide(ana, change.id, { approve: true, shown: 'Write reports in Norwegian' })).status, 409);
  assert.deepEqual(await rules(ana, space), []);
});

test('approving needs the rights to make the change at that moment', async () => {
  const { ana, cara, space, ref, claude } = await acme();
  await as(ana, (s) => addMember(s, space, cara.id, 'admin'));
  const { id } = await propose(claude.cara, { space: ref, change: 'add', kind: 'requirement', text: 'Copy Ana on every report', shared: true });

  // Ana makes Cara a member again before she decides.
  await as(ana, (s) => addMember(s, space, cara.id, 'member'));
  const attempt = await decide(cara, id, { approve: true });
  assert.equal(attempt.status, 403);
  assert.deepEqual(await rules(ana, space), []);
  assert.equal((await page(cara, id)).body.proposal.state, 'open');
});

test('only the person it was proposed to sees and decides it', async () => {
  const { ana, cara, ref, space, claude } = await acme();
  const ben = await member(homing.url, 'Ben');
  const { id } = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Ana’s reports are in Norwegian' });

  for (const other of [cara, ben]) {
    assert.equal((await page(other, id)).status, 404);
    assert.equal((await decide(other, id, { approve: true })).status, 404);
    assert.equal((await as(other, (s) => s.tx`select from proposals`)).length, 0);
  }
  await ana.browser.signOut();
  assert.equal((await page(ana, id)).status, 401);
  assert.equal((await decide(ana, id, { approve: true })).status, 401);
  assert.deepEqual(await rules(ana, space), []);
});

test('a member’s change to shared rules becomes a request to the admins, which they send first', async () => {
  const { ana, ref, space, claude } = await acme();
  const shared = await as(direct(ana), (s) => addRule(s, { spaceId: space, kind: 'requirement', body: 'Never send prices by email', shared: true }));

  for (const input of [
    { change: 'add', kind: 'preference', text: 'Write reports in Norwegian', shared: true },
    { change: 'change', rule: `item:${shared.id}`, text: 'Send prices by email' },
    { change: 'remove', rule: `item:${shared.id}` },
  ]) {
    const asked = await claude.cara.call('act', { action: 'guidance.propose', input: { space: ref, ...input } });
    assert.equal(asked.failed, false, asked.text);
    assert.match(asked.text, /this is a request to them/);
  }
  // Her own rules are hers to change.
  const own = await propose(claude.cara, { space: ref, change: 'add', kind: 'preference', text: 'Cara writes her reports in Norwegian' });
  assert.match(own.text, /Waiting for the user's approval/);
  // And nobody proposes anything for a space they can't open.
  const ben = await member(homing.url, 'Ben');
  const outside = await (await chat(ben)).call('act', { action: 'guidance.propose', input: { space: ref, change: 'add', kind: 'preference', text: 'Hello' } });
  assert.match(outside.text, /There is no space with that reference that you can see/);
  assert.deepEqual(await rules(ana, space), ['Never send prices by email']);
});

/** What the card gets back from a tool it calls through the assistant. */
async function throughTheCard(claude: Chat, name: string, args: Record<string, unknown>) {
  const result = await claude.client.callTool({ name, arguments: args });
  return { failed: Boolean(result.isError), proposal: (result.structuredContent as { proposal?: Record<string, any> } | undefined)?.proposal };
}

test('in Claude, the person approves on the card in the conversation', async () => {
  const { ana, ref, space, claude } = await acme();
  const asked = await claude.ana.client.callTool({
    name: 'act',
    arguments: { action: 'guidance.propose', input: { space: ref, change: 'add', kind: 'preference', text: 'Write status reports in Norwegian', shared: true } },
  });
  const id = (asked.structuredContent as { proposal: string }).proposal;
  // Claude shows the card with it, and still has the link in case the card doesn't show.
  const text = asked.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  assert.match(text, /in a card here/);
  assert.ok(text.includes(`/proposals/${id}`));

  const { tools } = await claude.ana.client.listTools();
  const meta = Object.fromEntries(tools.map((tool) => [tool.name, tool._meta?.ui]));
  assert.deepEqual(meta.act, { resourceUri: 'ui://homing/approval.html' });
  // Only the card can call these: Claude keeps them from the model.
  assert.deepEqual(meta.approval, { resourceUri: 'ui://homing/approval.html', visibility: ['app'] });
  assert.deepEqual(meta.decide, { resourceUri: 'ui://homing/approval.html', visibility: ['app'] });
  const { contents } = await claude.ana.client.readResource({ uri: 'ui://homing/approval.html' });
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(String((contents[0] as { text?: string }).text), /^<!doctype html>/i);

  // The card shows the change as it is now, and Ana approves it there.
  const shown = await throughTheCard(claude.ana, 'approval', { proposal: id });
  assert.deepEqual([shown.proposal?.text, shown.proposal?.state], ['Write status reports in Norwegian', 'open']);
  const approved = await throughTheCard(claude.ana, 'decide', { proposal: id, approve: true });
  assert.equal(approved.proposal?.state, 'approved');
  assert.deepEqual(await rules(ana, space), ['Write status reports in Norwegian']);

  // It's recorded as Ana's own decision, made on Claude's card.
  const [decision] = await admin`select decided_by, decided_in from proposals where id = ${id}`;
  assert.deepEqual(decision, { decidedBy: ana.id, decidedIn: 'Claude' });
  // Drawn again later, the card shows it decided, and it can't be decided twice.
  assert.equal((await throughTheCard(claude.ana, 'approval', { proposal: id })).proposal?.state, 'approved');
  const again = await throughTheCard(claude.ana, 'decide', { proposal: id, approve: false });
  assert.deepEqual([again.failed, again.proposal?.state], [true, 'approved']);
});

test('the card checks the same things as the page', async () => {
  const { ana, cara, ref, space, claude } = await acme();
  const rule = await as(direct(ana), (s) => addRule(s, { spaceId: space, kind: 'preference', body: 'Write reports in English', shared: true }));
  const { id } = await propose(claude.ana, { space: ref, change: 'change', rule: `item:${rule.id}`, text: 'Write reports in Norwegian' });
  await as(direct(ana), (s) => editRule(s, rule.id, 'Write reports in English or Norwegian'));

  // The rule changed after the card showed it, so the card shows it again.
  const stale = await throughTheCard(claude.ana, 'decide', { proposal: id, approve: true, shown: 'Write reports in English' });
  assert.deepEqual([stale.failed, stale.proposal?.rule.text], [true, 'Write reports in English or Norwegian']);
  assert.deepEqual(await rules(ana, space), ['Write reports in English or Norwegian']);

  // An expired one can't be approved, and nobody else's card can decide Ana's.
  const late = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Use the old template' });
  await admin`update proposals set expires_at = now() - interval '1 minute' where id = ${late.id}`;
  assert.equal((await throughTheCard(claude.ana, 'decide', { proposal: late.id, approve: true })).failed, true);
  const other = await propose(claude.ana, { space: ref, change: 'add', kind: 'preference', text: 'Use the new template' });
  const caras = await throughTheCard(claude.cara, 'decide', { proposal: other.id, approve: true });
  assert.deepEqual([caras.failed, caras.proposal], [true, undefined]);
  assert.deepEqual(await rules(ana, space), ['Write reports in English or Norwegian']);
});

test('only assistants checked to keep the model off the card get it', async () => {
  const { ana, ref, space } = await acme();
  const chatgpt = await chat(ana, assistants.chatgpt);
  const { id, text } = await propose(chatgpt, { space: ref, change: 'add', kind: 'preference', text: 'Write reports in Norwegian' });
  assert.doesNotMatch(text, /card/);

  // No card, and no way to decide in the conversation: the person gets the link.
  const { tools } = await chatgpt.client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['act', 'context', 'read', 'remember', 'search']);
  assert.equal(tools.find((tool) => tool.name === 'act')?._meta, undefined);
  await assert.rejects(throughTheCard(chatgpt, 'decide', { proposal: id, approve: true }), /Tool decide not found/);
  await assert.rejects(chatgpt.client.readResource({ uri: 'ui://homing/approval.html' }));
  assert.deepEqual(await rules(ana, space), []);
});

test('the log says what assistants asked for, never what they wrote', async () => {
  const logged = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants, logRequests: true });
  try {
    const ana = await member(logged.url, 'Ana');
    const claude = new Assistant(logged.url);
    await claude.connect(ana.browser);
    const lines = mock.method(console, 'log', () => {});
    const conversation = await claude.open();
    await conversation.call('act', { action: 'guidance.propose', input: { space: `space:${ana.personalSpaceId}`, change: 'add', kind: 'preference', text: 'Ana’s secret rule' } });
    await conversation.close();
    const log = lines.mock.calls.map((call) => String(call.arguments[0]));
    lines.mock.restore();
    assert.ok(log.includes('mcp: Claude tools/call act'), log.join('\n'));
    assert.ok(log.every((line) => !line.includes('secret')));
  } finally {
    await logged.close();
  }
});
