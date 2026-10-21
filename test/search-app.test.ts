// Issue #40, search on every screen: the same results assistants get, grouped as pages, tasks,
// sources, rules, skills and spaces, each saying where it is, and only what the person can see.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { addSource, createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { addTask } from '../src/tasks.ts';
import { as, db, member, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member, eli: Member;
let acme: string, website: string, northwind: string;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), logRequests: false });
  [ana, cara, eli] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Eli')];
  ({ acme, website, northwind } = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const website = await createSpace(s, { name: 'Launch website', parentId: acme });
    await addMember(s, website, eli.id);
    return { acme, website, northwind: await createSpace(s, { name: 'Northwind', parentId: acme, closed: true }) };
  }));
  await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: website, title: 'Launch plan', type: 'project', shared: true });
    const email = await addSource(s, { spaceId: website, reference: 'Email from Gunnar', excerpt: 'The launch moves to November.', shared: true });
    await writeItem(s, { pageId: page, body: 'The launch is on 14 November.', sources: [email.id], shared: true });
    await writeItem(s, { pageId: page, body: 'Ana fears the launch slips again.' });
    const secret = await createPage(s, { spaceId: northwind, title: 'Northwind launch budget', shared: true });
    await writeItem(s, { pageId: secret, body: 'The launch budget is 400,000 NOK.', shared: true });
  });
  await as({ person: ana.id, direct: true }, async (s) => {
    await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Never send launch prices by email', shared: true });
    await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: '---\nname: launch-checklist\ndescription: What to check before a launch\n---\n' }], shared: true });
    await addTask(s, { spaceId: website, title: 'Book the launch venue', due: '2026-11-03', shared: true });
    await addTask(s, { spaceId: website, title: 'Ask Gunnar about the launch bonus' });
    await addTask(s, { spaceId: northwind, title: 'Send the launch budget to Northwind', shared: true });
  });
});

after(() => homing.close());

const find = async (who: Member, query: string) => {
  const { status, body } = await who.browser.json(`/api/search?q=${encodeURIComponent(query)}`);
  assert.equal(status, 200, JSON.stringify(body));
  return body;
};

test('search finds pages, sources, rules, skills and spaces, and says where each is', async () => {
  const found = await find(ana, 'launch');
  assert.deepEqual(found.pages.map((page: { title: string; space: { name: string; within: string } }) => [page.title, page.space.name, page.space.within]).sort(), [
    ['Launch plan', 'Launch website', 'Acme'],
    ['Northwind launch budget', 'Northwind', 'Acme'],
  ]);
  assert.deepEqual(found.sources.map((source: { reference: string }) => source.reference), ['Email from Gunnar']);
  assert.deepEqual(found.rules.map((rule: { text: string; kind: string; space: { name: string } }) => [rule.text, rule.kind, rule.space.name]), [['Never send launch prices by email', 'requirement', 'Acme']]);
  assert.deepEqual(found.skills.map((skill: { name: string }) => skill.name), ['launch-checklist']);
  assert.deepEqual(found.spaces.map((space: { name: string; within: string }) => [space.name, space.within]), [['Launch website', 'Acme']]);
  // One row per page, however many items on it match.
  assert.equal(found.pages.filter((page: { title: string }) => page.title === 'Launch plan').length, 1);
});

test('search finds tasks, as assistants do, and only the ones each person can see', async () => {
  const forAna = (await find(ana, 'launch')).tasks as { title: string; due: string | null; done: boolean; onlyYou: boolean; space: { name: string } }[];
  assert.deepEqual(forAna.map((task) => [task.title, task.due, task.done, task.onlyYou, task.space.name]).sort(), [
    ['Ask Gunnar about the launch bonus', null, false, true, 'Launch website'],
    ['Book the launch venue', '2026-11-03', false, false, 'Launch website'],
    ['Send the launch budget to Northwind', null, false, false, 'Northwind'],
  ]);
  // Cara can't open Northwind, and Ana's own task is Ana's.
  assert.deepEqual((await find(cara, 'launch')).tasks.map((task: { title: string }) => task.title), ['Book the launch venue']);
});

test('search shows each person only what they can see', async () => {
  // Cara can't open Northwind and doesn't see Ana's own item.
  const forCara = await find(cara, 'launch');
  assert.deepEqual(forCara.pages.map((page: { title: string }) => page.title), ['Launch plan']);
  assert.deepEqual((await find(cara, 'fears')).pages, []);
  assert.deepEqual((await find(ana, 'fears')).pages.map((page: { title: string; onlyYou: boolean }) => [page.title, page.onlyYou]), [['Launch plan', true]]);
  // Eli is in the website only: Acme's rule reaches him, from a space he can't open, which stays unnamed.
  const forEli = await find(eli, 'prices');
  assert.deepEqual(forEli.rules.map((rule: { space: unknown }) => rule.space), [{ id: null, name: null, within: null }]);
  assert.deepEqual((await find(eli, 'Acme')).spaces, []);
  assert.doesNotMatch(JSON.stringify(await find(cara, 'Northwind budget')), /Northwind|400,000/);
});

test('an empty search finds nothing, and a long one is cut short', async () => {
  assert.deepEqual(await find(ana, ''), { spaces: [], pages: [], rules: [], skills: [], sources: [], tasks: [] });
  // Only the first 200 characters count, so the launch is still found.
  assert.equal((await find(ana, `launch ${'x'.repeat(500)}`)).pages.length, 2);
});
