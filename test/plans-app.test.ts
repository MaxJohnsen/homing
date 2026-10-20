// Related changes are one decision (spec §6). When one request needs several governed changes, such
// as sharing what's known in a space, adding someone to it and a rule, the assistant proposes them as
// one plan, which the person approves as it is or declines. Approving checks every change again and
// makes them all in one transaction: if one can no longer be made, nothing changes, and the person
// sees which one and why. A plan has one space, which it may create, and one person who decides it.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { proposePlan } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, changeMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), cardClients: [assistants.claude.client_id], ...testAssistants });
});

after(() => homing.close());

/**
 * Ana, who looks after Home with Cara, Jonas, who shares a space with Ana but not Home, and Claude
 * in a conversation with Ana.
 */
async function people() {
  const [ana, cara, jonas] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Jonas')];
  const [home, club] = await as({ ...ana, direct: true }, async (s) => {
    const home = await createSpace(s, { name: 'Home' });
    await addMember(s, home, cara.id, 'admin');
    const club = await createSpace(s, { name: 'Book club' });
    await addMember(s, club, jonas.id);
    return [home, club];
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  const claude = await assistant.open();
  const act = (action: string, input: Record<string, unknown>) => claude.call('act', { action, input });
  const plan = (input: Record<string, unknown>) => act('plan.propose', input);
  // What the card gets back from a tool it calls through the assistant.
  const card = async (name: string, args: Record<string, unknown>) => {
    const result = await claude.client.callTool({ name, arguments: args });
    const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
    return { failed: Boolean(result.isError), text, proposal: (result.structuredContent as { proposal?: Record<string, any> } | undefined)?.proposal };
  };
  return { ana, cara, jonas, home, club, claude, act, plan, card };
}

const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
const refOf = (kind: string, text: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];
const shownOf = async (who: Member, proposal: string) => (await who.browser.json(`/api/proposals/${proposal}`)).body.proposal;
const decide = (who: Member, proposal: string, shown: string, approve = true) => who.browser.json(`/api/proposals/${proposal}/decide`, { approve, shown });
const share = (item: string) => ({ action: 'knowledge.publish', input: { item: `item:${item}` } });

/** What someone sees in a space: its shared pages, its open tasks and its rules, or null when they can't open it. */
async function seenBy(who: Member, space: string) {
  const opened = await who.browser.json(`/api/spaces/${space}`);
  if (opened.status === 404) return null;
  const pages = (await who.browser.json(`/api/spaces/${space}/pages`)).body as { pages: { title: string }[]; total: number };
  const tasks = (await who.browser.json(`/api/spaces/${space}/tasks`)).body as { open: { title: string }[] };
  const rules = (await who.browser.json(`/api/spaces/${space}/rules`)).body as { rules: { text: string; shared: boolean }[] };
  return { name: opened.body.name as string, pages: pages.pages.map((page) => page.title).sort(), tasks: tasks.open.map((task) => task.title), rules: rules.rules.filter((rule) => rule.shared).map((rule) => rule.text) };
}

test('the kitchen story: a new space, what goes in it, Jonas and a rule, approved once, and Jonas sees what the card said', async () => {
  const { ana, jonas, claude, act, plan, card } = await people();

  // A space of its own is only Ana's at first, so the assistant creates it at once and keeps what
  // belongs there on her side, with the task, before proposing the rest.
  const created = await act('space.create', { name: 'Kitchen renovation', who: 'with others' });
  const kitchen = refOf('space', created.text);
  const remember = async (page: string, text: string, sources?: { reference: string; excerpt: string }[]) =>
    refOf('item', (await claude.call('remember', { space: `space:${kitchen}`, page, text, ...(sources && { sources }) })).text);
  const quote = await remember('Contractor quotes', 'Byggmester AS quoted NOK 180,000 for the whole kitchen.', [
    { reference: 'Email from Byggmester AS, 3 October', excerpt: 'Our price for the full kitchen is NOK 180,000.' },
  ]);
  const timeline = await remember('Timeline', 'Demolition starts 2 November, and the new kitchen is in by 20 December.');
  const task = refOf('task', (await claude.call('remember', { space: `space:${kitchen}`, task: { title: 'Order the tiles', due: '2026-11-10' } })).text);

  const proposed = await plan({
    space: `space:${kitchen}`,
    changes: [
      share(quote),
      share(timeline),
      { action: 'task.share', input: { task: `task:${task}` } },
      { action: 'members.change', input: { person: 'Jonas', change: 'add' } },
      { action: 'guidance.propose', input: { change: 'add', kind: 'requirement', text: 'Get every quote in writing.', shared: true } },
    ],
    why: 'Jonas is helping with the kitchen.',
  });
  assert.ok(!proposed.failed, proposed.text);
  assert.match(proposed.text, /^Waiting for the user's approval \(proposal:.+\): one decision for all 5 changes\. Nothing has changed yet\./);
  const id = proposalOf(proposed.text);

  // Nothing changes before Ana decides: Jonas can't open the space, and what's in it stays hers.
  assert.equal(await seenBy(jonas, kitchen), null);
  const [row] = await admin`select private_to from content where id = ${quote}`;
  assert.equal(row.privateTo, ana.id);
  assert.match((await claude.call('context', { request: 'kitchen', space: `space:${kitchen}` })).text, /## Waiting for approval\n.+\n- A plan of 5 changes, decided together: share item:.+; share item:.+; share task:.+; add Jonas; add a requirement \(shared\): "Get every quote in writing\."/);
  const waiting = (await ana.browser.json('/api/waiting')).body.waiting as { id: string; action: string; changes: number }[];
  assert.deepEqual(waiting.map((item) => [item.id, item.action, item.changes]), [[id, 'plan', 5]]);

  // The card shows the whole plan: each change, and what Jonas will see.
  const shown = (await card('approval', { proposal: id })).proposal!;
  assert.equal(shown.action, 'plan');
  assert.deepEqual(shown.plan.steps.map((step: any) => [step.action, step.problem]), [['publish', null], ['publish', null], ['task', null], ['members', null], ['add', null]]);
  assert.equal(shown.plan.steps[0].publication.text, 'Byggmester AS quoted NOK 180,000 for the whole kitchen.');
  assert.deepEqual(shown.plan.steps[0].publication.hidden, [{ space: null, reference: 'Email from Byggmester AS, 3 October' }], 'what it rests on stays Ana’s, and the card says so');
  assert.deepEqual([shown.plan.steps[3].member.name, shown.plan.steps[3].member.found], ['Jonas', true]);
  assert.deepEqual(shown.plan.audience, { people: 1, above: false, adding: ['Jonas'] });
  assert.deepEqual(shown.plan.sees, { pages: 2, archived: 0, tasks: 1, rules: 1, spaces: 0 });
  assert.equal(shown.plan.why, 'Jonas is helping with the kitchen.');

  // Ana approves it once, on the card, and every change is made.
  const decided = await card('decide', { proposal: id, approve: true, shown: shown.plan.shown });
  assert.ok(!decided.failed, decided.text);
  assert.equal(decided.proposal!.state, 'approved');
  const jonasSees = await seenBy(jonas, kitchen);
  assert.deepEqual(jonasSees, { name: 'Kitchen renovation', pages: ['Contractor quotes', 'Timeline'], tasks: ['Order the tiles'], rules: ['Get every quote in writing.'] });
  assert.deepEqual([jonasSees!.pages.length, jonasSees!.tasks.length, jonasSees!.rules.length], [shown.plan.sees.pages, shown.plan.sees.tasks, shown.plan.sees.rules], 'exactly what the card said');
  // Jonas sees what it says and that Ana shared it, never her email.
  const page = (await jonas.browser.json(`/api/spaces/${kitchen}/pages`)).body.pages.find((candidate: { title: string }) => candidate.title === 'Contractor quotes');
  assert.doesNotMatch(JSON.stringify((await jonas.browser.json(`/api/pages/${page.id}`)).body), /Our price for the full kitchen/);

  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /The user approved it on .+, and every change applies now\./);
  assert.match((await claude.call('context', { request: 'kitchen', space: `space:${kitchen}` })).text, new RegExp(`## Ended lately\\n.+\\n- A plan of 5 changes.+\\(proposal:${id}\\): The user approved it`));
  assert.equal((await decide(ana, id, shown.plan.shown)).status, 409, 'once');
});

test('a plan creates a space everyone in a shared space would see, with its rule and who’s in it', async () => {
  const { ana, cara, jonas, home, plan } = await people();
  const proposed = await plan({
    create: { name: 'Kitchen', who: 'with others', in: `space:${home}` },
    changes: [
      { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Pick quiet appliances.', shared: true } },
      { action: 'members.change', input: { person: 'Jonas', change: 'add' } },
    ],
  });
  assert.match(proposed.text, /one decision for all 3 changes/);
  const id = proposalOf(proposed.text);
  // It waits in Home, where the space would go, and nothing exists yet.
  assert.deepEqual((await ana.browser.json('/api/waiting')).body.waiting.map((item: any) => [item.id, item.spaceId, item.text, item.changes]), [[id, home, 'Kitchen', 2]]);
  const shown = await shownOf(ana, id);
  assert.deepEqual(shown.plan.create, { name: 'Kitchen', in: 'Home', people: 2, above: false, problem: null });
  assert.deepEqual(shown.plan.sees, { pages: 0, archived: 0, tasks: 0, rules: 1, spaces: 0 });

  const decided = await decide(ana, id, shown.plan.shown);
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  assert.equal(decided.body.proposal.state, 'approved');
  const kitchen = decided.body.proposal.plan.spaceId as string;
  assert.ok(kitchen, 'it names the space it created');
  assert.deepEqual(await seenBy(jonas, kitchen), { name: 'Kitchen', pages: [], tasks: [], rules: ['Pick quiet appliances.'] });
  assert.equal((await seenBy(cara, kitchen))?.name, 'Kitchen', 'everyone in Home has it');
  assert.equal((await seenBy(jonas, home)), null, 'Jonas only has Kitchen');
});

test('if a change can no longer be made when approving, nothing changes, and it says which and why', async () => {
  const { ana, cara, jonas, home, club, claude, plan } = await people();
  const created = await claude.call('act', { action: 'space.create', input: { name: 'Garden', who: 'with others' } });
  const garden = refOf('space', created.text);
  const item = refOf('item', (await claude.call('remember', { space: `space:${garden}`, page: 'Plants', text: 'The roses go along the south wall.' })).text);
  const rule = { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Water in the evening.', shared: true } };

  // The item is shared another way meanwhile.
  const first = proposalOf((await plan({ space: `space:${garden}`, changes: [share(item), rule] })).text);
  const shown = await shownOf(ana, first);
  assert.equal((await ana.browser.json(`/api/items/${item}/publish`, { shown: 'The roses go along the south wall.' })).status, 200);
  const refused1 = await decide(ana, first, shown.plan.shown);
  assert.equal(refused1.status, 409);
  assert.equal(refused1.body.message, 'Nothing changed, because what’s on “Plants” can’t be shared. It’s shared already.');
  assert.deepEqual((await seenBy(ana, garden))!.rules, [], 'the rule wasn’t added either');
  // Shown again, it says which change can't be made, and it can only be declined.
  const again = await shownOf(ana, first);
  assert.deepEqual(again.plan.steps.map((step: any) => step.problem), ['It’s shared already.', null]);
  assert.match((await claude.call('read', { ref: `proposal:${first}` })).text, /can't be approved as it is, because what’s on “Plants” can’t be shared\. It’s shared already\. If the user still wants the rest, withdraw it/);
  assert.equal((await decide(ana, first, again.plan.shown, false)).status, 200);

  // Jonas no longer shares a space with Ana, so he can't be added by name.
  const second = proposalOf((await plan({ space: `space:${garden}`, changes: [{ action: 'members.change', input: { person: 'Jonas', change: 'add' } }, rule] })).text);
  const before = await shownOf(ana, second);
  await as({ ...jonas, direct: true }, (s) => changeMember(s, club, jonas.id, 'remove'));
  const refused2 = await decide(ana, second, before.plan.shown);
  assert.equal(refused2.status, 409);
  assert.equal(refused2.body.message, 'Nothing changed, because Jonas can’t be added. You no longer share a space with Jonas, so they can’t be added this way. Ask for their email instead.');
  assert.deepEqual((await seenBy(ana, garden))!.rules, []);
  assert.equal((await decide(ana, second, before.plan.shown, false)).status, 200);

  // A change that can only be refused as it's made undoes the ones made before it: Garden has no
  // other admin, so Ana can't leave it, and the rule made first is undone with it.
  const leaving = proposalOf((await plan({ space: `space:${garden}`, changes: [rule, { action: 'members.change', input: { person: 'Ana', change: 'remove' } }] })).text);
  const shownLeaving = await shownOf(ana, leaving);
  assert.deepEqual(shownLeaving.plan.steps.map((step: any) => step.problem), [null, null]);
  const refusedLeaving = await decide(ana, leaving, shownLeaving.plan.shown);
  assert.equal(refusedLeaving.status, 409);
  assert.equal(refusedLeaving.body.message, 'Nothing changed, because Ana can’t be removed. Garden needs an admin, so make someone else an admin first.');
  assert.deepEqual((await seenBy(ana, garden))!.rules, [], 'the rule was undone');
  assert.equal((await decide(ana, leaving, shownLeaving.plan.shown, false)).status, 200);

  // The name is taken in Home meanwhile, by Cara.
  const third = proposalOf((await plan({ create: { name: 'Shed', who: 'with others', in: `space:${home}` }, changes: [rule] })).text);
  const shed = await shownOf(ana, third);
  const taken = await cara.browser.json('/api/spaces', { name: 'Shed', who: 'with others', in: home });
  assert.equal(taken.status, 200, JSON.stringify(taken.body));
  const refused3 = await decide(ana, third, shed.plan.shown);
  assert.equal(refused3.status, 409);
  assert.equal(refused3.body.message, 'Nothing changed, because Shed can’t be created in Home. There’s already a space called Shed in Home.');
  const [{ sheds }] = await admin`select count(*)::int as sheds from spaces where name = 'Shed' and parent_id = ${home}`;
  assert.equal(sheds, 1);

  // Something that changed after it was shown is shown again before anything is made.
  const tulips = refOf('item', (await claude.call('remember', { space: `space:${garden}`, page: 'Plants', text: 'Tulips in the front bed.' })).text);
  const fourth = proposalOf((await plan({ space: `space:${garden}`, changes: [share(tulips), rule] })).text);
  const stale = await shownOf(ana, fourth);
  assert.match((await claude.call('remember', { space: `space:${garden}`, text: 'Tulips and crocuses in the front bed.', updates: `item:${tulips}` })).text, /^Updated/);
  const refused4 = await decide(ana, fourth, stale.plan.shown);
  assert.equal(refused4.status, 409);
  assert.equal(refused4.body.message, 'Something in it changed after you opened this. Check it again before approving it.');
  const fresh = await shownOf(ana, fourth);
  assert.equal(fresh.plan.steps[0].publication.text, 'Tulips and crocuses in the front bed.');
  assert.equal((await decide(ana, fourth, fresh.plan.shown)).status, 200);
  assert.deepEqual((await seenBy(cara, garden)), null, 'Garden is still only Ana’s');
  assert.deepEqual((await seenBy(ana, garden))!.rules, ['Water in the evening.']);
});

test('only what the person decides alone goes in a plan, and routine work is never in one', async () => {
  const { ana, cara, home, club, claude, plan } = await people();
  const rule = (space?: string) => ({ action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Keep receipts.', shared: true, ...(space && { space: `space:${space}` }) } });

  // Cara isn't an admin of Ana's book club, so a shared rule there is a request to its admins, on its own.
  const caras = new Assistant(homing.url, assistants.claude);
  await caras.connect(cara.browser);
  const caraClaude = await caras.open();
  await as({ ...ana, direct: true }, (s) => addMember(s, club, cara.id));
  const request = await caraClaude.call('act', {
    action: 'plan.propose',
    input: { space: `space:${club}`, changes: [rule(), { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Read a chapter a week.' } }] },
  });
  assert.ok(request.failed);
  assert.match(request.text, /^Change 1: Only Book club’s admins change its shared rules, so that’s a request to them, which one of them decides on its own: propose it with guidance\.propose, not in a plan\./);
  // Nor someone added where she isn't an admin.
  assert.match((await caraClaude.call('act', { action: 'plan.propose', input: { space: `space:${club}`, changes: [{ action: 'members.change', input: { person: 'Ana', change: 'make admin' } }, rule()] } })).text, /Change 1 \(members\.change\): Only Book club’s admins change who’s in it\./);

  // One space: a change elsewhere goes on its own.
  assert.match((await plan({ space: `space:${home}`, changes: [rule(club), rule()] })).text, /Change 1 \(guidance\.propose\): A plan's changes are all in one space, Home/);
  // Several changes: one goes on its own.
  assert.match((await plan({ space: `space:${home}`, changes: [rule()] })).text, /A plan is for several changes/);
  // A space only Ana will have is created at once, never in a plan.
  assert.match((await plan({ create: { name: 'Garage', who: 'with others' }, changes: [rule()] })).text, /Only the user would have Garage once it's created, so it isn't part of a plan: create it at once with space\.create/);
  assert.match((await plan({ create: { name: 'Diary', who: 'just me' }, changes: [rule()] })).text, /isn't part of a plan/);
  // A space a plan creates has nothing in it to share yet.
  const item = refOf('item', (await claude.call('remember', { space: `space:${home}`, page: 'Notes', text: 'The kitchen tap drips.' })).text);
  assert.match((await plan({ create: { name: 'Kitchen', who: 'with others', in: `space:${home}` }, changes: [share(item)] })).text, /Nothing is in Kitchen until it’s created, so there’s nothing in it to share yet/);
  // Including guidance from elsewhere goes on its own.
  assert.match((await plan({ space: `space:${home}`, changes: [{ action: 'guidance.propose', input: { change: 'include', include: `space:${club}` } }, rule()] })).text, /isn’t part of a plan: propose it on its own/);
  // A why goes once, for the whole plan.
  assert.match((await plan({ space: `space:${home}`, changes: [{ ...rule(), input: { ...rule().input, why: 'Taxes.' } }, rule()] })).text, /unrecognized key: "why"/);
  assert.equal((await ana.browser.json('/api/waiting')).body.waiting.length, 0, 'nothing was proposed');
});

test('a plan is withdrawn like any proposal, and revising one means withdrawing it first', async () => {
  const { ana, home, claude, plan } = await people();
  const changes = [
    { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Shop on Saturdays.', shared: true } },
    { action: 'members.change', input: { person: 'Cara', change: 'make member' } },
  ];
  const id = proposalOf((await plan({ space: `space:${home}`, changes })).text);
  // Nothing can be added to it, and another plan for Home waits for it to go.
  assert.match((await plan({ space: `space:${home}`, changes: [...changes, { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Cook on Sundays.', shared: true } }] })).text, /A plan for Home already waits for the user \(proposal:.+\)\. Nothing can be added to it: to revise it, withdraw it/);
  const withdrawn = await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${id}` } });
  assert.match(withdrawn.text, /^Withdrawn: A plan of 2 changes.+Withdrawn by Claude on .+ nothing changed\./);
  assert.equal((await decide(ana, id, (await shownOf(ana, id)).plan.shown)).status, 409);
  assert.match((await claude.call('context', { request: 'shopping', space: `space:${home}` })).text, new RegExp(`## Ended lately\\n.+\\n- A plan of 2 changes.+\\(proposal:${id}\\): Withdrawn by Claude`));
  const revised = await plan({ space: `space:${home}`, changes: [changes[0], { action: 'guidance.propose', input: { change: 'add', kind: 'preference', text: 'Cook on Sundays.', shared: true } }] });
  assert.ok(!revised.failed, revised.text);
});

test('only the person a plan is for sees it or decides it, and an assistant can’t, even straight against the database', async () => {
  const { ana, cara, jonas, home, club, plan } = await people();
  const id = proposalOf((await plan({
    space: `space:${home}`,
    changes: [
      { action: 'guidance.propose', input: { change: 'add', kind: 'requirement', text: 'Lock the back door.', shared: true } },
      { action: 'members.change', input: { person: 'Jonas', change: 'add' } },
    ],
  })).text);
  // Cara, an admin of Home too, and Jonas, whom it's about, see nothing of it.
  for (const other of [cara, jonas]) {
    assert.equal((await other.browser.json(`/api/proposals/${id}`)).status, 404);
    assert.equal((await decide(other, id, '[]')).status, 404);
    assert.equal((await other.browser.json('/api/waiting')).body.waiting.length, 0);
  }
  const caras = new Assistant(homing.url, assistants.claude);
  await caras.connect(cara.browser);
  assert.doesNotMatch((await (await caras.open()).call('context', { request: 'doors', space: `space:${home}` })).text, /Lock the back door|A plan of/);

  // Ana's assistant can neither decide it nor change what it holds.
  const asClaude = { person: ana.id, agent: 'Claude' };
  await assert.rejects(as(asClaude, (s) => s.tx`update proposals set state = 'approved' where id = ${id}::uuid`), refused);
  await assert.rejects(as(asClaude, (s) => s.tx`update proposals set change = '{"steps": []}' where id = ${id}::uuid`), refused);
  await assert.rejects(as({ ...ana, direct: true }, (s) => s.tx`update proposals set change = '{"steps": []}' where id = ${id}::uuid`), refused, 'not even Ana, directly');
  // Nor make a plan that's a request to the admins, or holds anything but the changes a plan makes.
  await assert.rejects(as(asClaude, (s) => s.tx`insert into proposals (space_id, private_to, action, change, request) values (${home}::uuid, ${ana.id}::uuid, 'plan', '{"steps": []}', true)`), { code: '23514' });
  for (const steps of ['[{"action": "archive space"}]', '[{"item": "x"}]', '["publish"]', '{}']) {
    await assert.rejects(as(asClaude, (s) => s.tx`insert into proposals (space_id, private_to, action, change) values (${home}::uuid, ${ana.id}::uuid, 'plan', ${`{"steps": ${steps}}`}::jsonb)`), { code: '23514' }, steps);
  }
  await assert.rejects(as(asClaude, (s) => proposePlan(s, { spaceId: club, steps: [{ action: 'add rule', kind: 'preference', text: 'A', shared: true, onlyHere: false }, { action: 'add rule', kind: 'preference', text: 'A', shared: true, onlyHere: false }] })), /repeats an earlier change/);
  assert.equal((await shownOf(ana, id)).state, 'open');
});
