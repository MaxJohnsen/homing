// Issue #32, making a space in your personal tree collaborative (spec §1). The space and everything
// under it leave the personal tree, as a space of its own or in a shared space you're an admin of.
// It exposes nothing by itself: everything in it stays yours. The rules it had from your personal
// tree stop applying, and you keep them there for yourself, add them for everyone, or let them go.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { addSource, createPage, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, home: string, kitchen: string, tiles: string, page: string;

const conversion = (who: Member, space: string) => who.browser.json(`/api/spaces/${space}/conversion`);
const convert = (who: Member, space: string, body: Record<string, unknown>) => who.browser.json(`/api/spaces/${space}/conversion`, body);
const spaceAs = async (who: Member, space: string) => (await who.browser.json(`/api/spaces/${space}`)).body as { status?: number; private: boolean; parentId: string | null; closed: boolean; movedFrom: { name: string } | null };

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  ({ acme, home, kitchen, tiles, page } = await as({ person: ana.id, direct: true }, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const home = await createSpace(s, { name: 'Home', parentId: ana.personalSpaceId });
    await addRule(s, { spaceId: home, kind: 'preference', body: 'Keep renovation notes in Norwegian.' });
    const kitchen = await createSpace(s, { name: 'Kitchen', parentId: home });
    const tiles = await createSpace(s, { name: 'Tiles', parentId: kitchen });
    const page = await createPage(s, { spaceId: kitchen, title: 'Budget' });
    const quote = await addSource(s, { spaceId: kitchen, reference: 'Quote from the carpenter', excerpt: 'Cabinets: 80,000.' });
    await writeItem(s, { pageId: page, body: 'The cabinets cost 80,000.', sources: [quote.id] });
    return { acme, home, kitchen, tiles, page };
  }));
});

after(() => homing.close());

test('sharing a space says where it can go, who would have it, and which rules stop applying', async () => {
  const { status, body } = await conversion(ana, kitchen);
  assert.equal(status, 200);
  assert.deepEqual(body.rulesLeaving, [{ kind: 'preference', text: 'Keep renovation notes in Norwegian.', from: 'Home' }]);
  assert.deepEqual(body.places.map((place: { name: string; people: number }) => [place.name, place.people]), [['Acme', 2]]);
  // Only for a space in your own personal tree, below the personal space itself.
  assert.equal((await conversion(cara, kitchen)).status, 404);
  assert.equal((await conversion(ana, ana.personalSpaceId)).status, 404);
  assert.equal((await conversion(ana, acme)).status, 404);
});

test('shared in Acme, the space and the spaces under it leave the personal tree, and nothing in them is exposed', async () => {
  const shared = await convert(ana, kitchen, { in: acme, closed: false, rules: 'keep' });
  assert.equal(shared.status, 200, JSON.stringify(shared.body));

  const forAna = await spaceAs(ana, kitchen);
  assert.deepEqual([forAna.private, forAna.parentId, forAna.closed, forAna.movedFrom?.name], [false, acme, false, 'Home']);
  assert.equal((await spaceAs(ana, tiles)).private, false);
  // Everyone in Acme can open it, and sees nothing of what was in it, nor where it came from.
  const forCara = await spaceAs(cara, kitchen);
  assert.deepEqual([forCara.private, forCara.movedFrom], [false, null]);
  assert.equal((await cara.browser.json(`/api/pages/${page}`)).status, 404);
  assert.deepEqual((await cara.browser.json(`/api/spaces/${kitchen}/pages`)).body.pages, []);
  assert.deepEqual((await cara.browser.json(`/api/spaces/${kitchen}/sources`)).body.sources, []);
  assert.equal((await ana.browser.json(`/api/pages/${page}`)).status, 200);

  // Ana's rule from Home stays with her there, and isn't Cara's.
  const rulesFor = async (who: Member) => ((await who.browser.json(`/api/spaces/${kitchen}/rules`)).body.rules as { text: string; shared: boolean }[]).map((rule) => [rule.text, rule.shared]);
  assert.deepEqual(await rulesFor(ana), [['Keep renovation notes in Norwegian.', false]]);
  assert.deepEqual(await rulesFor(cara), []);
  // Now shared, Ana can add people, and it can't be shared again from here.
  assert.equal((await conversion(ana, kitchen)).status, 404);
  assert.ok(home);
});

test('only you share a space of yours, only as a person, and only into a space you look after', async () => {
  const { garden, closet } = await as({ person: ana.id, direct: true }, async (s) => ({
    garden: await createSpace(s, { name: 'Garden', parentId: ana.personalSpaceId }),
    closet: await createSpace(s, { name: 'Closet', parentId: ana.personalSpaceId }),
  }));
  const team = await as({ person: cara.id, direct: true }, (s) => createSpace(s, { name: 'Cara’s team' }));
  assert.equal((await convert(ana, garden, { in: team, rules: 'drop' })).status, 400);
  assert.equal((await convert(cara, garden, { rules: 'drop' })).status, 404);
  await assert.rejects(as({ person: ana.id, agent: 'Claude' }, (s) => s.tx`select make_collaborative(${garden}::uuid, null, false)`), refused);

  // On its own, with rules for everyone: a space of its own, which only Ana has so far.
  assert.equal((await convert(ana, closet, { rules: 'share' })).status, 200);
  const forAna = await spaceAs(ana, closet);
  assert.deepEqual([forAna.private, forAna.parentId, forAna.movedFrom?.name], [false, null, 'your personal space']);
  assert.equal((await cara.browser.json(`/api/spaces/${closet}`)).status, 404);
});

test('an assistant gives the user the link, where they decide it', async () => {
  const garden = await as({ person: ana.id, direct: true }, (s) => createSpace(s, { name: 'Shed', parentId: ana.personalSpaceId }));
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(ana.browser);
  const chat = await claude.open();
  const answer = await chat.call('act', { action: 'space.share', input: { space: `space:${garden}` } });
  assert.ok(!answer.failed, answer.text);
  assert.match(answer.text, new RegExp(`Nothing has changed yet\\. Give them this link: ${homing.url}spaces/${garden}/settings`));
  assert.equal((await spaceAs(ana, garden)).private, true);
});
