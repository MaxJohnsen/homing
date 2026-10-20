// Issue #6, archiving a space (spec §1). An admin archives a space when its work is done: it and
// the spaces in it leave the assistant's everyday context, and stay searchable. Nothing is
// deleted, and reopening brings it back. Only people archive, and only a space's admins.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, website: string, globex: string;
let claude: Awaited<ReturnType<Assistant['open']>>;

const spacesAs = async (who: Member) => (await who.browser.json('/api/spaces')).body.spaces as { id: string; name: string; archived: boolean }[];
const archive = (who: Member, space: string, archived = true) => who.browser.json(`/api/spaces/${space}/archive`, { archived });

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  [acme, website, globex] = await as({ ...ana, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    const website = await createSpace(s, { name: 'Website', parentId: acme });
    const globex = await createSpace(s, { name: 'Globex' });
    await addMember(s, acme, cara.id);
    const page = await createPage(s, { spaceId: website, title: 'Launch', shared: true });
    await writeItem(s, { pageId: page, body: 'The Acme website went live on 1 March.', shared: true });
    return [acme, website, globex];
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  claude = await assistant.open();
});

after(() => homing.close());

test('an admin archives a space, and it and the spaces in it leave everyday context but stay searchable', async () => {
  assert.equal((await archive(cara, acme)).status, 403, 'only its admins archive it');
  assert.equal((await archive(ana, acme)).status, 200);

  // Everyone who can open it sees it's archived, and the spaces in it with it.
  for (const who of [ana, cara]) {
    const spaces = await spacesAs(who);
    assert.deepEqual(spaces.filter((space) => space.archived).map((space) => space.name).sort(), ['Acme', 'Website']);
  }
  const seen = (await cara.browser.json(`/api/spaces/${website}`)).body;
  assert.deepEqual(seen.archive.with, { id: acme, name: 'Acme' });
  assert.equal((await ana.browser.json(`/api/spaces/${acme}`)).body.archive.you, true);

  // The assistant's map of spaces leaves them out, and says so.
  const map = (await claude.call('context', { request: 'What should I do today?' })).text;
  assert.match(map, /Globex/);
  assert.doesNotMatch(map, /- Acme|- Website/);
  assert.match(map, /2 archived spaces are left out/);
  // Asked about by name, it's still there, and says it's archived.
  assert.match((await claude.call('context', { request: 'How did the Acme launch go?' })).text, /# Acme[\s\S]*It's archived: finished work/);
  assert.match((await claude.call('context', { request: 'Launch', space: `space:${website}` })).text, /It's archived with Acme/);
  // Search still finds what's in it.
  assert.match((await claude.call('search', { query: 'website went live' })).text, /went live on 1 March.+in Website, archived/);

  // Nothing new goes in an archived space, and a space archived with Acme reopens with it.
  assert.equal((await ana.browser.json('/api/spaces', { name: 'Ads', who: 'with others', in: acme })).status, 400);
  const reopenWebsite = await archive(ana, website, false);
  assert.equal(reopenWebsite.status, 400);
  assert.match(reopenWebsite.body.message, /archived with Acme/);

  assert.equal((await archive(ana, acme, false)).status, 200);
  assert.deepEqual((await spacesAs(cara)).filter((space) => space.archived), []);
  assert.match((await claude.call('context', { request: 'What should I do today?' })).text, /- Acme[\s\S]*- Website/);
});

test('only people archive, and a personal space stays open', async () => {
  assert.equal((await archive(ana, ana.personalSpaceId)).status, 403);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select archive_space(${globex}::uuid, true)`), refused);
  await assert.rejects(as(ana, (s) => s.tx`select archive_space(${globex}::uuid, true)`), refused, 'not without acting directly');
  // Archiving straight against the table isn't possible either.
  const changed = await as({ ...ana, direct: true }, (s) => s.tx`update spaces set archived_at = now() where id = ${globex}::uuid returning id`).catch((error) => error);
  assert.ok(changed instanceof Error || changed.length === 0);
});
