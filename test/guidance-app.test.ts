// Issue #39, guidance in the app: a space's rules, split by where each comes
// from, and its skills. People change their own rules directly, and admins
// their space's shared ones, with the same checks as any direct edit, and
// the person's assistant gets the change in its next context. A member can't
// change a shared rule, and nobody changes a rule they can't open.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, eli: Member;
let acme: string, northwind: string, website: string;
let acmeRule: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara, eli] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Eli')];
  // Ana runs Acme, where Cara works. Northwind is a closed client space only Ana is in. The website
  // is open to everyone in Acme, and Eli is in it without being in Acme.
  ({ acme, northwind, website } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const northwind = await createSpace(s, { name: 'Northwind', parentId: acme, closed: true });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    await addMember(s, website, eli.id);
    return { acme, northwind, website };
  }));
  acmeRule = await as({ ...ana, direct: true }, async (s) => {
    const rule = await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Never send prices by email', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Ana writes Acme notes in Norwegian' });
    await addRule(s, { spaceId: ana.personalSpaceId, kind: 'preference', body: 'Ana likes short answers' });
    await addRule(s, { spaceId: northwind, kind: 'preference', body: 'Write Northwind reports in English', shared: true });
    return rule.id;
  });
});

after(() => homing.close());

const rules = async (who: Member, space: string) => {
  const { status, body } = await who.browser.json(`/api/spaces/${space}/rules`);
  assert.equal(status, 200);
  return (body.rules as { text: string; spaceName: string | null; shared: boolean; personal: boolean }[]).map(
    (rule) => `${rule.text} (${rule.shared ? 'shared' : 'yours'}, ${rule.personal ? 'personal' : (rule.spaceName ?? 'unnamed')})`,
  );
};

test('a space’s rules say where each comes from, in the order the assistant gets them', async () => {
  assert.deepEqual(await rules(ana, northwind), [
    'Ana likes short answers (yours, personal)',
    'Never send prices by email (shared, Acme)',
    'Ana writes Acme notes in Norwegian (yours, Acme)',
    'Write Northwind reports in English (shared, Northwind)',
  ]);
  // Cara gets Acme's shared rule on the website, and none of Ana's own.
  assert.deepEqual(await rules(cara, website), ['Never send prices by email (shared, Acme)']);
  // Eli gets it too, but can't open Acme, so it stays unnamed, and so does its id.
  assert.deepEqual(await rules(eli, website), ['Never send prices by email (shared, unnamed)']);
  assert.deepEqual(((await eli.browser.json(`/api/spaces/${website}/rules`)).body.rules as { spaceId: string | null }[]).map((rule) => rule.spaceId), [null]);
  // And nobody gets the rules of a space they can't open.
  assert.equal((await cara.browser.json(`/api/spaces/${northwind}/rules`)).status, 404);
});

test('a person changes their own rules directly, and their assistant gets the change next', async () => {
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(cara.browser);
  const chat = await claude.open();

  const added = await cara.browser.json(`/api/spaces/${acme}/rules`, { kind: 'preference', text: 'Cara writes in English', onlyHere: true });
  assert.equal(added.status, 200);
  assert.match((await chat.call('context', { request: 'Write a note', space: `space:${acme}` })).text, /Cara writes in English/);

  assert.equal((await cara.browser.json(`/api/rules/${added.body.id}`, { text: 'Cara writes in British English' })).status, 200);
  const changed = (await chat.call('context', { request: 'Write a note', space: `space:${acme}` })).text;
  assert.match(changed, /Cara writes in British English/);
  assert.doesNotMatch(changed, /Cara writes in English/);
  // It was marked only here, so it doesn't reach the website.
  assert.doesNotMatch((await chat.call('context', { request: 'Write a note', space: `space:${website}` })).text, /British English/);

  // A direct edit by Cara herself, kept in the history like any other.
  const [revision] = await admin`select body, written_by, agent from revisions where content_id = ${added.body.id}::uuid`;
  assert.deepEqual({ ...revision }, { body: 'Cara writes in English', writtenBy: cara.id, agent: null });

  assert.equal((await cara.browser.json(`/api/rules/${added.body.id}/remove`, {})).status, 200);
  assert.doesNotMatch((await chat.call('context', { request: 'Write a note', space: `space:${acme}` })).text, /British English/);
});

test('only a space’s admins change its shared rules', async () => {
  const shared = { kind: 'requirement', text: 'Copy Cara on everything', shared: true };
  assert.equal((await cara.browser.json(`/api/spaces/${acme}/rules`, shared)).status, 403);
  assert.equal((await cara.browser.json(`/api/rules/${acmeRule}`, { text: 'Send prices by email' })).status, 403);
  assert.equal((await cara.browser.json(`/api/rules/${acmeRule}/remove`, {})).status, 403);
  assert.ok((await rules(ana, acme)).includes('Never send prices by email (shared, Acme)'));

  const added = await ana.browser.json(`/api/spaces/${acme}/rules`, { kind: 'preference', text: 'Date files first', shared: true });
  assert.equal(added.status, 200);
  assert.ok((await rules(cara, acme)).includes('Date files first (shared, Acme)'));
  assert.equal((await ana.browser.json(`/api/rules/${added.body.id}/remove`, {})).status, 200);
});

test('nobody changes a rule from a space they can’t open, even one that reaches them', async () => {
  // Eli gets Acme's rule on the website, but changing it happens in Acme.
  assert.equal((await eli.browser.json(`/api/rules/${acmeRule}`, { text: 'Changed' })).status, 404);
  assert.equal((await eli.browser.json(`/api/rules/${acmeRule}/remove`, {})).status, 404);
  assert.equal((await eli.browser.json(`/api/spaces/${acme}/rules`, { kind: 'preference', text: 'Hello' })).status, 404);
  // A space in someone's personal tree has no shared side.
  assert.equal((await ana.browser.json(`/api/spaces/${ana.personalSpaceId}/rules`, { kind: 'preference', text: 'Hello', shared: true })).status, 403);
});

test('skills say where they come from, which one is used, and what it replaces', async () => {
  const skill = (name: string, description: string) => [{ path: 'SKILL.md', body: `---\nname: ${name}\ndescription: ${description}\n---\nWrite it in three points.` }, { path: 'template.md', body: '# Status' }];
  const { acmeSkill, northwindSkill } = await as({ ...ana, direct: true }, async (s) => ({
    acmeSkill: (await saveSkill(s, { spaceId: acme, files: skill('status-report', 'Weekly status for Acme'), shared: true })).pageId,
    northwindSkill: (await saveSkill(s, { spaceId: northwind, files: skill('status-report', 'Weekly status for Northwind'), shared: true })).pageId,
  }));

  const here = (await ana.browser.json(`/api/spaces/${northwind}/skills`)).body.skills;
  assert.deepEqual(here.map(({ id, spaceName, used, others }: Record<string, any>) => ({ id, spaceName, used, others: others.map((other: { id: string }) => other.id) })), [
    { id: northwindSkill, spaceName: 'Northwind', used: true, others: [acmeSkill] },
    { id: acmeSkill, spaceName: 'Acme', used: false, others: [northwindSkill] },
  ]);

  const page = (await ana.browser.json(`/api/skills/${northwindSkill}`)).body;
  assert.equal(page.description, 'Weekly status for Northwind');
  assert.equal(page.instructions, 'Write it in three points.');
  assert.deepEqual(page.files, [{ path: 'template.md', body: '# Status' }]);
  assert.deepEqual(page.replaces, [{ id: acmeSkill, spaceName: 'Acme' }]);

  // Eli gets Acme's skill on the website, without learning which space it comes from.
  const forEli = (await eli.browser.json(`/api/skills/${acmeSkill}`)).body;
  assert.deepEqual([forEli.name, forEli.spaceId, forEli.spaceName], ['status-report', null, null]);
  // But not Northwind's, which doesn't reach him.
  assert.equal((await eli.browser.json(`/api/skills/${northwindSkill}`)).status, 404);
  assert.equal((await cara.browser.json(`/api/skills/${northwindSkill}`)).status, 404);
});
