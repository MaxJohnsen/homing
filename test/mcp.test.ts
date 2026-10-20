// End to end through MCP. Issue #2: an agent saves knowledge to a client
// space with remember, a new session finds it with context and search, and
// another person can't see it. Issue #3: a client's rules reach a project
// below it in context, in order, and only people change them, and skills
// come with them.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addRule } from '../src/guidance.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { saveSkill } from '../src/skills.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { authDatabaseUrl } from '../src/db.ts';
import { Assistant, testAssistants } from './assistant.ts';
import { as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
});

after(() => homing.close());

/** Someone's assistant, connected over OAuth after they allowed it. */
async function connected(who: Member) {
  const assistant = new Assistant(homing.url);
  await assistant.connect(who.browser);
  return assistant;
}

/** A new agent session for a person, like opening a new conversation. */
const session = (assistant: Assistant) => assistant.open();

/** Ana and Cara work for Acme, and Ben for Beta. Each has an assistant connected. */
async function clients() {
  const ana = await member(homing.url, 'Ana');
  const cara = await member(homing.url, 'Cara');
  const ben = await member(homing.url, 'Ben');
  const acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  await as(ben, (s) => createSpace(s, { name: 'Beta' }));
  return { ana, acme, acmeRef: `space:${acme}`, assistants: { ana: await connected(ana), cara: await connected(cara), ben: await connected(ben) } };
}

const refIn = (text: string, kind: string) => new RegExp(`${kind}:[0-9a-f-]{36}`).exec(text)?.[0];

test('an agent saves knowledge, and a new session finds it again', async () => {
  const { acmeRef, assistants } = await clients();

  const first = await session(assistants.ana);
  const start = await first.call('context', { request: 'Gunnar says the Acme launch moves to 1 March' });
  assert.match(start.text, /^Picked Acme, because the request names it/);
  const saved = await first.call('remember', {
    space: acmeRef,
    page: 'Launch',
    type: 'project',
    text: 'Acme launches on 1 March',
    sources: [{ reference: 'Email from Gunnar, 3 October', excerpt: 'We are moving the launch to 1 March.' }],
  });
  const page = refIn(saved.text, 'page');
  await first.close();

  const second = await session(assistants.ana);
  const context = await second.call('context', { request: 'When does Acme launch?', space: acmeRef });
  assert.ok(context.text.includes(page!));
  assert.match(context.text, /Acme launches on 1 March/);
  assert.match((await second.call('search', { query: 'launch date' })).text, /Acme launches on 1 March/);
  assert.match((await second.call('read', { ref: page })).text, /Email from Gunnar, 3 October: "We are moving the launch to 1 March."/);

  // Remembering more about the launch lands on the same page, whatever the case of its title.
  const more = await second.call('remember', { space: acmeRef, page: 'launch', text: 'The launch event is in Oslo' });
  assert.equal(refIn(more.text, 'page'), page);
  await second.close();
});

test('nobody else can see it: not a colleague in the same space, nor another client', async () => {
  const { acmeRef, assistants } = await clients();
  const anas = await session(assistants.ana);
  const saved = await anas.call('remember', { space: acmeRef, page: 'Launch', text: 'Acme launches on 1 March' });
  const page = refIn(saved.text, 'page');
  await anas.close();

  const caras = await session(assistants.cara);
  assert.doesNotMatch((await caras.call('context', { request: 'launch', space: acmeRef })).text, /1 March/);
  assert.equal((await caras.call('search', { query: 'launch' })).text, 'No matches.');
  assert.equal((await caras.call('read', { ref: page })).failed, true);
  await caras.close();

  const bens = await session(assistants.ben);
  assert.doesNotMatch((await bens.call('context', { request: 'Acme launch' })).text, /Acme/);
  assert.equal((await bens.call('search', { query: 'Acme launch' })).text, 'No matches.');
  assert.equal((await bens.call('remember', { space: acmeRef, page: 'Launch', text: 'Beta was here' })).failed, true);
  await bens.close();
});

test('small things without a subject go on the space’s notes, and evidence can wait for a page', async () => {
  const { acmeRef, assistants } = await clients();
  const anas = await session(assistants.ana);

  const note = await anas.call('remember', { space: acmeRef, text: 'Ola will own the data migration' });
  assert.match(note.text, /the new page "Notes"/);
  const email = await anas.call('remember', {
    space: acmeRef,
    sources: [{ reference: 'Email from Gunnar', excerpt: 'Our auditors visit in November.' }],
  });
  assert.match(email.text, /Kept as evidence/);

  const found = (await anas.call('search', { query: 'migration auditors' })).text;
  assert.match(found, /Ola will own the data migration/);
  assert.match(found, /Our auditors visit in November/);
  await anas.close();
});

test('replacing shared knowledge updates only your own view, and keeps the earlier version', async () => {
  const { ana, acme, acmeRef, assistants } = await clients();
  const launch = await as({ ...ana, agent: 'Claude Code' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Launch', shared: true });
    return writeItem(s, { pageId: page, body: 'Acme launches on 1 March', shared: true });
  });

  const anas = await session(assistants.ana);
  const replaced = await anas.call('remember', { space: acmeRef, text: 'Acme launches on 1 April', replaces: `item:${launch.id}` });
  assert.match(replaced.text, /others in the space still see the earlier version/);
  const context = (await anas.call('context', { request: 'launch', space: acmeRef })).text;
  assert.match(context, /Acme launches on 1 April/);
  assert.doesNotMatch(context, /1 March/);
  // The shared item is still what everyone else sees, which reading it says.
  assert.match((await anas.call('read', { ref: `item:${launch.id}` })).text, /the user's private update item:\S+ replaces it for them\. Others in the space still see this\./);
  await anas.close();

  const caras = await session(assistants.cara);
  assert.match((await caras.call('context', { request: 'launch', space: acmeRef })).text, /Acme launches on 1 March/);
  await caras.close();
});

test('remember never rewrites shared knowledge', async () => {
  const { ana, acme, acmeRef, assistants } = await clients();
  const launch = await as({ ...ana, agent: 'Claude Code' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Launch', shared: true });
    return writeItem(s, { pageId: page, body: 'Acme launches on 1 March', shared: true });
  });

  const anas = await session(assistants.ana);
  const attempt = await anas.call('remember', { space: acmeRef, text: 'Acme launches in April', updates: `item:${launch.id}` });
  assert.equal(attempt.failed, true);
  assert.match(attempt.text, /can't rewrite shared knowledge/);
  await anas.close();
});

test('a client’s rules reach a closed project below it, from least to most specific', async () => {
  const ana = await member(homing.url, 'Ana');
  const gunnar = await member(homing.url, 'Gunnar');
  const { acme, workshop } = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    const workshop = await createSpace(s, { name: 'Workshop', parentId: acme, closed: true });
    await addMember(s, workshop, gunnar.id);
    await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Never send prices by email', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Write reports in English', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Log hours every Friday', shared: true, onlyHere: true });
    await addRule(s, { spaceId: workshop, kind: 'preference', body: 'Write reports in Norwegian', shared: true });
    return { acme, workshop };
  });

  // Gunnar, from the client, is only in the workshop and can't open Acme.
  const gunnars = await session(await connected(gunnar));
  const context = (await gunnars.call('context', { request: 'Write the workshop report', space: `space:${workshop}` })).text;
  const rules = context
    .split('\n## ')
    .find((block) => block.startsWith('Rules\n'))
    ?.split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/ \(item:[^)]+\)$/, ''));
  assert.deepEqual(rules, [
    '- Requirement, from a space above: Never send prices by email',
    '- Preference, from a space above: Write reports in English',
    '- Preference, from Workshop: Write reports in Norwegian',
  ]);
  assert.match(context, /No preference wins over a requirement/);
  assert.doesNotMatch(context, /Acme/);

  // His agent can't add a rule.
  const attempt = await gunnars.call('remember', {
    space: `space:${workshop}`,
    page: 'Rules',
    type: 'guidance',
    text: 'Write reports in French',
  });
  assert.equal(attempt.failed, true);
  assert.match(attempt.text, /Only people change guidance/);

  // Nor replace one he receives, even naming the space it comes from.
  const english = refIn(context.split('\n').find((line) => line.includes('in English'))!, 'item');
  const change = await gunnars.call('remember', { space: `space:${acme}`, replaces: english, text: 'Write reports in French' });
  assert.equal(change.failed, true);
  assert.match(change.text, /Only people change guidance/);
  await gunnars.close();
});

test('a client’s skills reach a project below it, and read back whole', async () => {
  const ana = await member(homing.url, 'Ana');
  const gunnar = await member(homing.url, 'Gunnar');
  const skillMd = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\nSteps\n`;
  const workshop = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    const workshop = await createSpace(s, { name: 'Workshop', parentId: acme, closed: true });
    await addMember(s, workshop, gunnar.id);
    const files = (name: string, description: string) => [
      { path: 'SKILL.md', body: skillMd(name, description) },
      { path: 'references/tone.md', body: 'Plain and short.' },
    ];
    await saveSkill(s, { spaceId: acme, files: files('status-report', 'Writes the status report'), shared: true });
    await saveSkill(s, { spaceId: acme, files: files('invoice', 'Prepares an invoice'), shared: true });
    await saveSkill(s, { spaceId: workshop, files: files('status-report', 'Writes the workshop report'), shared: true });
    return workshop;
  });

  const gunnars = await session(await connected(gunnar));
  const context = (await gunnars.call('context', { request: 'Write the workshop report', space: `space:${workshop}` })).text;
  const skills = context
    .split('\n## ')
    .find((block) => block.startsWith('Skills\n'))
    ?.split('\n')
    .filter((line) => line.startsWith('- '));
  assert.deepEqual(skills?.map((line) => line.replace(/ \(page:[^)]+\)$/, '')), [
    '- invoice: Prepares an invoice',
    '- status-report: Writes the workshop report',
  ]);

  const skill = (await gunnars.call('read', { ref: refIn(skills![1], 'page') })).text;
  assert.ok(skill.includes(skillMd('status-report', 'Writes the workshop report')));
  const tone = /- references\/tone\.md \((item:[^)]+)\)/.exec(skill)?.[1];
  assert.match((await gunnars.call('read', { ref: tone })).text, /^Plain and short\./);

  // His agent can't write on it.
  const page = refIn(skills![1], 'page');
  const attempt = await gunnars.call('remember', { space: `space:${workshop}`, page, text: 'Always add a summary' });
  assert.equal(attempt.failed, true);
  assert.match(attempt.text, /Only people change guidance/);
  await gunnars.close();
});
