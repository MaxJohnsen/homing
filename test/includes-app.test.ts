// Issue #17, done when: a space includes another space's guidance, and someone
// who can access both gets the included rules in context, while someone who
// can't access the other space doesn't. An assistant proposes an include and
// the person approves exactly what it brings in, on the card or the decision
// page; a member's include for everyone becomes a request to the admins.
// context, search, read and the app's Rules all show where included rules
// come from.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addInclude, addRule, editRule, rulesFor } from '../src/guidance.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    ...testAssistants,
    cardClients: [assistants.claude.client_id],
  });
});

after(() => homing.close());

/**
 * Ana runs Acme with Jon, another admin, and Cara and Dan, members. Ana and Cara also keep the
 * company's Standards; Jon and Dan aren't in it.
 */
async function company() {
  const [ana, jon, cara, dan] = [await member(homing.url, 'Ana'), await member(homing.url, 'Jon'), await member(homing.url, 'Cara'), await member(homing.url, 'Dan')];
  const { acme, standards } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, jon.id, 'admin');
    await addMember(s, acme, cara.id);
    await addMember(s, acme, dan.id);
    const standards = await createSpace(s, { name: 'Standards' });
    await addMember(s, standards, cara.id);
    return { acme, standards };
  });
  const rule = await as({ person: ana.id, direct: true }, async (s) => {
    const rule = await addRule(s, { spaceId: standards, kind: 'requirement', body: 'Never send prices by email', shared: true });
    await addRule(s, { spaceId: standards, kind: 'preference', body: 'Log hours every Friday', shared: true, onlyHere: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Write Acme reports in English', shared: true });
    return rule;
  });
  return { ana, jon, cara, dan, acme, standards, rule };
}

async function chat(who: Member, document = assistants.claude) {
  const claude = new Assistant(homing.url, document);
  await claude.connect(who.browser);
  return claude.open();
}

type Chat = Awaited<ReturnType<typeof chat>>;

async function propose(claude: Chat, input: Record<string, unknown>) {
  const asked = await claude.client.callTool({ name: 'act', arguments: { action: 'guidance.propose', input } });
  const text = asked.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  assert.equal(Boolean(asked.isError), false, text);
  return { id: /proposal:([0-9a-f-]{36})/.exec(text)![1], text };
}

async function throughTheCard(claude: Chat, name: string, args: Record<string, unknown>) {
  const result = await claude.client.callTool({ name, arguments: args });
  return { failed: Boolean(result.isError), proposal: (result.structuredContent as { proposal?: Record<string, any> } | undefined)?.proposal };
}

const page = (who: Member, id: string) => who.browser.json(`/api/proposals/${id}`);
const decide = (who: Member, id: string, decision: Record<string, unknown>) => who.browser.json(`/api/proposals/${id}/decide`, decision);
const rules = async (who: Member, space: string) => (await as(who, (s) => rulesFor(s, space))).map((rule) => rule.body);

test('a space includes another space’s guidance, and only those who can open it get the rules in context', async () => {
  const { ana, cara, dan, acme, standards } = await company();
  await as({ person: ana.id, direct: true }, (s) => addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }));

  // Cara can open both: her assistant gets Standards' rules in Acme, saying where they come from.
  const claude = await chat(cara);
  const forCara = (await claude.call('context', { request: 'Send the invoice', space: `space:${acme}` })).text;
  assert.match(forCara, new RegExp(`- Requirement, from Standards \\(space:${standards}\\), included in Acme: Never send prices by email`));
  assert.match(forCara, /included in Acme: Never send prices by email[^]*Preference, from Acme: Write Acme reports in English/);
  assert.doesNotMatch(forCara, /Log hours every Friday/);

  // Dan can't open Standards, so his assistant gets nothing from it, by any way it asks.
  const dans = await chat(dan);
  const forDan = (await dans.call('context', { request: 'Send the invoice', space: `space:${acme}` })).text;
  assert.match(forDan, /Write Acme reports in English/);
  assert.doesNotMatch(forDan, /Standards|prices/);
  for (const query of [{ query: 'prices' }, { query: 'prices', space: `space:${acme}` }]) {
    assert.equal((await dans.call('search', query)).text, 'No matches.');
  }
  const [{ guidance }] = await admin`select id as guidance from pages where space_id = ${acme} and type = 'guidance'`;
  const read = (await dans.call('read', { ref: `page:${guidance}` })).text;
  assert.doesNotMatch(read, /Standards|Included|prices/);

  // Searching in Acme finds the included rule for Cara, said to be included here, and reading
  // Acme's guidance lists the include.
  assert.match((await claude.call('search', { query: 'prices', space: `space:${acme}` })).text, /Rule: Never send prices by email \(item:.+, in Standards, included here\)/);
  assert.match((await claude.call('read', { ref: `page:${guidance}` })).text, new RegExp(`## Included[^]*- Rules from Standards \\(space:${standards}\\), shared`));
});

test('an assistant proposes an include, and it applies once the person approves exactly what it brings', async () => {
  const { ana, cara, acme, standards, rule } = await company();
  const claude = await chat(ana);
  const { id, text } = await propose(claude, { space: `space:${acme}`, change: 'include', include: `space:${standards}`, shared: true, why: 'Acme follows our standards' });
  assert.match(text, /in a card here/);
  assert.deepEqual(await rules(ana, acme), ['Write Acme reports in English']);
  assert.match((await claude.call('context', { request: 'Invoice', space: `space:${acme}` })).text, new RegExp(`Include the rules of space:${standards} \\(shared\\)`));

  // The card shows what it would bring in, as it is now, and never the rule only for Standards.
  const shown = (await throughTheCard(claude, 'approval', { proposal: id })).proposal!;
  assert.equal(shown.action, 'include');
  assert.deepEqual([shown.include.space.name, shown.include.rules], ['Standards', [{ kind: 'requirement', text: 'Never send prices by email', yours: false }]]);

  // Standards changes before Ana decides: approving what she saw shows it again instead.
  await as({ person: ana.id, direct: true }, (s) => editRule(s, rule.id, 'Never send prices by email or chat'));
  const stale = await throughTheCard(claude, 'decide', { proposal: id, approve: true, shown: shown.include.shown });
  assert.equal(stale.failed, true);
  assert.deepEqual(stale.proposal?.include.rules.map((one: { text: string }) => one.text), ['Never send prices by email or chat']);
  assert.deepEqual(await rules(ana, acme), ['Write Acme reports in English']);

  const approved = await throughTheCard(claude, 'decide', { proposal: id, approve: true, shown: stale.proposal!.include.shown });
  assert.equal(approved.proposal?.state, 'approved');
  assert.deepEqual(await rules(ana, acme), ['Never send prices by email or chat', 'Write Acme reports in English']);
  assert.deepEqual(await rules(cara, acme), ['Never send prices by email or chat', 'Write Acme reports in English']);
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /approved it on .+, and it applies now/);

  // Removing it is proposed and approved the same way, on the decision page this time.
  const removal = await propose(claude, { space: `space:${acme}`, change: 'stop including', include: `space:${standards}` });
  const removing = (await page(ana, removal.id)).body.proposal;
  assert.equal(removing.action, 'exclude');
  assert.equal((await decide(ana, removal.id, { approve: true, shown: removing.include.shown })).status, 200);
  assert.deepEqual(await rules(ana, acme), ['Write Acme reports in English']);
  // An assistant can't approve it, and nobody approves it twice.
  assert.equal((await decide(ana, removal.id, { approve: true, shown: removing.include.shown })).status, 409);
});

test('a skill is included the same way, and an assistant can’t include what the person can’t open', async () => {
  const { ana, dan, acme, standards } = await company();
  const skill = await as({ person: ana.id, direct: true }, (s) =>
    saveSkill(s, { spaceId: standards, files: [{ path: 'SKILL.md', body: '---\nname: invoice\ndescription: How we send invoices\n---\n\nSteps.\n' }], shared: true }),
  );
  const claude = await chat(ana);
  const { id } = await propose(claude, { space: `space:${acme}`, change: 'include', include: `page:${skill.pageId}`, shared: true });
  const shown = (await page(ana, id)).body.proposal;
  assert.deepEqual(shown.include.skill, { pageId: skill.pageId, name: 'invoice', description: 'How we send invoices', from: 'Standards' });
  assert.equal((await decide(ana, id, { approve: true, shown: shown.include.shown })).status, 200);
  assert.match((await claude.call('context', { request: 'Invoice', space: `space:${acme}` })).text, /- invoice: How we send invoices \(page:.+, from Standards, included in Acme\)/);

  // Dan's assistant can't include Standards, or its skill, which he can't open, nor learn whether they exist.
  const dans = await chat(dan);
  for (const include of [`space:${standards}`, `page:${skill.pageId}`]) {
    const asked = await dans.call('act', { action: 'guidance.propose', input: { space: `space:${acme}`, change: 'include', include } });
    assert.equal(asked.failed, true);
    assert.match(asked.text, /There is no (space|skill) with that reference that you can see/);
  }
  assert.equal((await admin`select count(*)::int as count from proposals where private_to = ${dan.id}`)[0].count, 0);
});

test('a member’s include for everyone becomes a request, which an admin who can open it decides', async () => {
  const { ana, jon, cara, acme, standards } = await company();
  const claude = await chat(cara);
  const { id, text } = await propose(claude, { space: `space:${acme}`, change: 'include', include: `space:${standards}`, shared: true, why: 'Clients get the same rules' });
  assert.match(text, /this is a request to them/);
  assert.equal((await decide(cara, id, { approve: true })).body.proposal.state, 'requested');

  // Ana can open Standards: she sees what it brings, and who asks.
  const forAna = (await page(ana, id)).body.proposal;
  assert.deepEqual([forAna.request.by, forAna.include.space.name, forAna.include.rules.length], ['Cara', 'Standards', 1]);
  const waiting = (await ana.browser.json('/api/waiting')).body.waiting.find((item: { id: string }) => item.id === id);
  assert.deepEqual([waiting.action, waiting.included, waiting.text], ['include', 'rules', 'Standards']);

  // Jon can't: the request names nothing he can't open, and he can only decline it.
  const forJon = (await page(jon, id)).body.proposal;
  assert.deepEqual([forJon.include.open, forJon.include.space, forJon.include.rules], [false, null, []]);
  assert.doesNotMatch(JSON.stringify(forJon), /Standards|prices/);
  assert.equal((await jon.browser.json('/api/waiting')).body.waiting.find((item: { id: string }) => item.id === id).text, null);
  assert.equal((await decide(jon, id, { approve: true, shown: '' })).status, 403);
  // Nor through his assistant, nor straight against the database: not even what it points to by its id.
  const jons = await chat(jon);
  const told = [(await jons.call('context', { request: 'What waits for me?', space: `space:${acme}` })).text, (await jons.call('read', { ref: `proposal:${id}` })).text];
  assert.match(told[0], /Ask the admins to include rules from a space you can’t open \(shared\)/);
  for (const answer of told) assert.doesNotMatch(answer, new RegExp(`${standards}|Standards|prices`));
  const rows = await as(jon, async (s) => [...(await s.tx`select * from proposals where id = ${id}`), ...(await s.tx`select * from proposal_includes`)]);
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(standards));

  assert.equal((await decide(ana, id, { approve: true, shown: forAna.include.shown })).status, 200);
  assert.deepEqual(await rules(cara, acme), ['Never send prices by email', 'Write Acme reports in English']);
  assert.deepEqual(await rules(jon, acme), ['Write Acme reports in English']);
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /An admin of the space approved it/);
});

test('the Rules screen shows what’s included and where from, and those allowed include and stop including', async () => {
  const { ana, cara, dan, acme, standards } = await company();
  const list = async (who: Member) => (await who.browser.json(`/api/spaces/${acme}/rules`)).body;

  // What Ana could include: Standards and the spaces she can open, never Acme itself.
  const includable = (await ana.browser.json(`/api/spaces/${acme}/includable`)).body;
  assert.deepEqual(includable.spaces.map((space: { label: string }) => space.label), ['Standards']);

  // A member includes for herself only, and an admin for everyone.
  assert.equal((await cara.browser.json(`/api/spaces/${acme}/includes`, { space: standards, shared: true })).status, 403);
  const own = await cara.browser.json(`/api/spaces/${acme}/includes`, { space: standards });
  assert.equal(own.status, 200);
  assert.deepEqual((await list(cara)).includes, [{ id: own.body.id, spaceId: standards, spaceName: 'Standards', shared: false }]);
  assert.deepEqual((await list(ana)).includes, []);
  const shared = await ana.browser.json(`/api/spaces/${acme}/includes`, { space: standards, shared: true });
  assert.equal(shared.status, 200);
  assert.equal((await ana.browser.json(`/api/spaces/${acme}/includes`, { space: standards, shared: true })).status, 400);

  // Each included rule says where it's set and that it's included here, for everyone.
  const [included] = (await list(ana)).rules;
  assert.deepEqual([included.text, included.spaceName, included.includedIn], ['Never send prices by email', 'Standards', { id: shared.body.id, spaceId: acme, spaceName: 'Acme', shared: true }]);
  // Dan, who can't open Standards, sees nothing of it.
  const forDan = await list(dan);
  assert.deepEqual([forDan.rules.map((rule: { text: string }) => rule.text), forDan.includes], [['Write Acme reports in English'], []]);
  assert.doesNotMatch(JSON.stringify(forDan), /Standards|prices/);
  assert.equal((await dan.browser.json(`/api/includes/${shared.body.id}/remove`, {})).status, 404);

  // Cara can't stop including it for everyone, and Ana can.
  assert.equal((await cara.browser.json(`/api/includes/${shared.body.id}/remove`, {})).status, 403);
  assert.equal((await ana.browser.json(`/api/includes/${shared.body.id}/remove`, {})).status, 200);
  assert.deepEqual((await list(ana)).rules.map((rule: { text: string }) => rule.text), ['Write Acme reports in English']);
  assert.equal((await cara.browser.json(`/api/includes/${own.body.id}/remove`, {})).status, 200);
});

test('stopping an include names the include itself, whatever the proposal says', async () => {
  const { ana, acme, standards } = await company();
  const brand = await as(ana, (s) => createSpace(s, { name: 'Brand' }));
  const [kept, stopped] = await as({ person: ana.id, direct: true }, async (s) => [
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }),
    await addInclude(s, { spaceId: acme, included: { space: brand }, shared: true }),
  ]);
  // A proposal made straight against the database, saying it stops including Standards while it names Brand's include.
  const [{ id }] = await as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`
    insert into proposals (space_id, private_to, action, include_id, change)
    values (${acme}, ${ana.id}, 'remove include', ${stopped.id}, ${s.tx.json({ included: { space: standards }, shared: false })})
    returning id
  `);
  const shown = (await page(ana, id)).body.proposal;
  assert.deepEqual([shown.include.space.id, shown.shared], [brand, true]);
  assert.equal((await decide(ana, id, { approve: true, shown: shown.include.shown })).status, 200);
  const left = await admin`select id from includes where space_id = ${acme} and removed_at is null`;
  assert.deepEqual(left.map((row) => row.id), [kept.id]);
});

test('an admin sees what the space includes for everyone that they can’t open, and stops it', async () => {
  const { ana, jon, cara, dan, acme, standards } = await company();
  const skill = await as({ person: ana.id, direct: true }, (s) =>
    saveSkill(s, { spaceId: standards, files: [{ path: 'SKILL.md', body: '---\nname: invoice\ndescription: How we send invoices\n---\n' }], shared: true }),
  );
  const [rulesInclude, skillInclude] = await as({ person: ana.id, direct: true }, async (s) => [
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }),
    await addInclude(s, { spaceId: acme, included: { skill: skill.pageId }, shared: true }),
  ]);
  const lists = async (who: Member) => ({
    rules: (await who.browser.json(`/api/spaces/${acme}/rules`)).body,
    skills: (await who.browser.json(`/api/spaces/${acme}/skills`)).body,
  });

  // Jon, an admin who can't open Standards, sees that each is there and who added it, and nothing more.
  const forJon = await lists(jon);
  assert.deepEqual(forJon.rules.includes.map(({ id, spaceId, spaceName, shared, addedBy }: Record<string, unknown>) => ({ id, spaceId, spaceName, shared, addedBy })), [
    { id: rulesInclude.id, spaceId: null, spaceName: null, shared: true, addedBy: 'Ana' },
  ]);
  assert.deepEqual(forJon.skills.hidden.map((include: { id: string }) => include.id), [skillInclude.id]);
  assert.doesNotMatch(JSON.stringify(forJon), new RegExp(`${standards}|Standards|prices|invoice`));
  // Dan, a member, sees nothing of either, and can't stop them.
  const forDan = await lists(dan);
  assert.deepEqual([forDan.rules.includes, forDan.skills.hidden], [[], []]);
  assert.equal((await dan.browser.json(`/api/includes/${skillInclude.id}/remove`, {})).status, 404);

  // Cara, who can open it, asks to stop including Standards, and Jon approves it without seeing it.
  const { id } = await propose(await chat(cara), { space: `space:${acme}`, change: 'stop including', include: `space:${standards}` });
  assert.equal((await decide(cara, id, { approve: true })).body.proposal.state, 'requested');
  const shown = (await page(jon, id)).body.proposal;
  assert.deepEqual([shown.include.open, shown.include.current, shown.include.space], [false, true, null]);
  assert.doesNotMatch(JSON.stringify(shown), new RegExp(`${standards}|Standards`));
  assert.equal((await decide(jon, id, { approve: true, shown: shown.include.shown })).status, 200);
  assert.deepEqual(await rules(cara, acme), ['Write Acme reports in English']);

  // And stops the skill himself.
  assert.equal((await jon.browser.json(`/api/includes/${skillInclude.id}/remove`, {})).status, 200);
  assert.deepEqual((await lists(jon)).skills.hidden, []);
  assert.deepEqual((await admin`select removed_by from includes where id = ${skillInclude.id}`).map((row) => row.removedBy), [jon.id]);
});
