// Issue #32, making a space in your personal tree collaborative (spec §1). The space and everything
// under it leave the personal tree, as a space of its own or in a shared space you're an admin of.
// It exposes nothing by itself: everything in it stays yours. The rules it had from your personal
// tree stop applying, and you keep them there for yourself, add them for everyone, or let them go.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { addSource, createPage, gather, writeItem, writeOverview } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string, home: string, kitchen: string, tiles: string, page: string;
let chat: Awaited<ReturnType<Assistant['open']>>;

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
  const claude = new Assistant(homing.url, assistants.claude);
  await claude.connect(ana.browser);
  chat = await claude.open();
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

test('an assistant proposes sharing a space, and the user decides where it goes on the card', async () => {
  const [shed, porch] = await as({ person: ana.id, direct: true }, async (s) => [
    await createSpace(s, { name: 'Shed', parentId: home }),
    await createSpace(s, { name: 'Porch', parentId: ana.personalSpaceId }),
  ]);
  const answer = await chat.call('act', { action: 'space.share', input: { space: `space:${shed}`, why: 'Cara builds it with me.' } });
  assert.match(answer.text, /Waiting for the user's approval .+ Nothing is shared yet/);
  const proposal = /proposal:([0-9a-f-]{36})/.exec(answer.text)![1];
  assert.match((await chat.call('act', { action: 'space.share', input: { space: `space:${shed}` } })).text, /already waits for the user/);

  // The card shows what Settings shows: where it can go, and the rules from Home that stop applying.
  const shown = (await ana.browser.json(`/api/proposals/${proposal}`)).body.proposal;
  assert.equal(shown.action, 'convert');
  assert.deepEqual(shown.conversion.rulesLeaving.map((rule: { text: string }) => rule.text), ['Keep renovation notes in Norwegian.']);
  assert.ok(shown.conversion.places.some((place: { name: string }) => place.name === 'Acme'));
  assert.equal(shown.conversion.why, 'Cara builds it with me.');
  assert.equal((await cara.browser.json(`/api/proposals/${proposal}`)).status, 404);
  assert.equal((await spaceAs(ana, shed)).private, true, 'nothing changes before Ana decides');

  // Approving needs her choices, and checks them as Settings does.
  const decide = (share?: Record<string, unknown>) => ana.browser.json(`/api/proposals/${proposal}/decide`, { approve: true, ...(share && { share }) });
  assert.notEqual((await decide()).status, 200);
  assert.notEqual((await decide({ in: ana.personalSpaceId, closed: false, rules: 'keep' })).status, 200, 'only into a shared space she looks after');
  assert.equal((await decide({ in: acme, closed: true, rules: 'share' })).status, 200);
  const moved = await spaceAs(ana, shed);
  assert.deepEqual([moved.private, moved.parentId, moved.closed], [false, acme, true]);
  assert.match((await chat.call('read', { ref: `proposal:${proposal}` })).text, /The user shared it on .+ add people with members\.change/);

  // Kept in the personal space, nothing changes; shared another way meanwhile, there's nothing to decide.
  const kept = /proposal:([0-9a-f-]{36})/.exec((await chat.call('act', { action: 'space.share', input: { space: `space:${porch}` } })).text)![1];
  assert.equal((await ana.browser.json(`/api/proposals/${kept}/decide`, { approve: false })).status, 200);
  assert.equal((await spaceAs(ana, porch)).private, true);
  const again = /proposal:([0-9a-f-]{36})/.exec((await chat.call('act', { action: 'space.share', input: { space: `space:${porch}` } })).text)![1];
  assert.equal((await convert(ana, porch, { in: null, closed: false, rules: 'drop' })).status, 200);
  assert.ok(!((await ana.browser.json('/api/waiting')).body.waiting as { id: string }[]).some((item) => item.id === again));
  assert.match((await chat.call('read', { ref: `proposal:${again}` })).text, /shared already, so there is nothing to decide/);
});

test('shared closed, with its rules for everyone: only people added have it, and nothing of Ana\'s private side is theirs', async () => {
  const { projects, garden, notes } = await as({ person: ana.id, direct: true }, async (s) => {
    const projects = await createSpace(s, { name: 'Projects', parentId: ana.personalSpaceId });
    await addRule(s, { spaceId: projects, kind: 'requirement', body: 'Write dates as YYYY-MM-DD.' });
    const garden = await createSpace(s, { name: 'Garden', parentId: projects });
    await addRule(s, { spaceId: garden, kind: 'preference', body: 'Plant natives first.' });
    await writeOverview(s, { spaceId: garden, text: 'Planning the spring planting.' });
    const notes = await createPage(s, { spaceId: garden, title: 'Notes' });
    const plants = await createPage(s, { spaceId: garden, title: 'Plants' });
    await writeItem(s, { pageId: plants, body: 'Lavender by the wall.' });
    await gather(s, { collectionId: notes, pageId: plants });
    const beds = await createSpace(s, { name: 'Beds', parentId: garden });
    const bedPage = await createPage(s, { spaceId: beds, title: 'Raised beds' });
    await writeItem(s, { pageId: bedPage, body: 'Three beds of 2 by 1 metres.' });
    return { projects, garden, notes };
  });
  const shared = await convert(ana, garden, { in: acme, closed: true, rules: 'share' });
  assert.equal(shared.status, 200, JSON.stringify(shared.body));
  // Closed: Cara, in Acme, doesn't have it.
  assert.equal((await cara.browser.json(`/api/spaces/${garden}`)).status, 404);
  await as({ person: ana.id, direct: true }, (s) => addMember(s, garden, cara.id));
  // Added, Cara sees the rule Ana chose to share, and nothing else of hers.
  const rules = ((await cara.browser.json(`/api/spaces/${garden}/rules`)).body.rules as { text: string; shared: boolean }[]).map((rule) => [rule.text, rule.shared]);
  assert.ok(rules.some(([text, shared]) => text === 'Write dates as YYYY-MM-DD.' && shared === true));
  assert.ok(!rules.some(([text]) => text === 'Plant natives first.'), 'her own rules in the space stay hers');
  assert.deepEqual((await cara.browser.json(`/api/spaces/${garden}/overview`)).body.overview, []);
  assert.deepEqual((await cara.browser.json(`/api/spaces/${garden}/pages`)).body.pages, []);
  assert.equal((await cara.browser.json(`/api/pages/${notes}`)).status, 404);
  const bedsId = ((await cara.browser.json('/api/spaces')).body.spaces as { id: string; name: string }[]).find((space) => space.name === 'Beds')?.id;
  assert.ok(bedsId, 'the spaces under it come along');
  assert.deepEqual((await cara.browser.json(`/api/spaces/${bedsId}/pages`)).body.pages, []);
  // Where it came from is Ana's alone, in the database too.
  assert.equal((await as(cara, (s) => s.tx`select moved_from from space_moves where space_id = ${garden}::uuid`)).length, 0);
  assert.ok(projects);
});

test('a space can\'t take a name that\'s taken where it goes, nor go where the database won\'t let it', async () => {
  const { kitchen2, shed } = await as({ person: ana.id, direct: true }, async (s) => ({
    kitchen2: await createSpace(s, { name: 'Kitchen', parentId: ana.personalSpaceId }),
    shed: await createSpace(s, { name: 'Bike shed', parentId: ana.personalSpaceId }),
  }));
  const taken = await convert(ana, kitchen2, { in: acme, rules: 'drop' });
  assert.deepEqual([taken.status, taken.body.field], [400, 'name']);
  assert.match(taken.body.message, /already a space called Kitchen in Acme/);
  // Straight against the database: never into a space Ana isn't an admin of, nor anyone's private space.
  const team = await as({ person: cara.id, direct: true }, async (s) => {
    const team = await createSpace(s, { name: 'Cara’s club' });
    await addMember(s, team, ana.id);
    return team;
  });
  for (const into of [team, cara.personalSpaceId, ana.personalSpaceId]) {
    await assert.rejects(as({ person: ana.id, direct: true }, (s) => s.tx`select make_collaborative(${shed}::uuid, ${into}::uuid, false)`), refused, into);
  }
});

test('the assistant proposes sharing only a space in the personal space', async () => {
  assert.match((await chat.call('act', { action: 'space.share', input: { space: `space:${ana.personalSpaceId}` } })).text, /personal space itself stays the user’s own/);
  assert.match((await chat.call('act', { action: 'space.share', input: { space: `space:${acme}` } })).text, /shared already/);
});
