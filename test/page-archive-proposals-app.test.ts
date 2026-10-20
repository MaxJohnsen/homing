// Issue #6, an assistant proposes archiving a page others see (spec §3): "Anyone who can write in
// the space archives a page directly, and an assistant proposes it for a person to approve." The
// person decides on the card in the conversation or on the decision page, and approving runs on the
// page as it was shown. The assistant's own suggestions are rare and rest on evidence that the page
// is no longer active. Reopening one works the same way.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl, type Session } from '../src/db.ts';
import { createPage, writeItem } from '../src/knowledge.ts';
import { proposePageArchive } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace, removeMember } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), cardClients: [assistants.claude.client_id], ...testAssistants });
});

after(() => homing.close());

/** Ana and her colleague Cara in Acme, and Claude in a conversation with Ana. */
async function acme() {
  const [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  const space = await as({ ...ana, direct: true }, async (s) => {
    const space = await createSpace(s, { name: 'Acme' });
    await addMember(s, space, cara.id);
    return space;
  });
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  const claude = await assistant.open();
  // A page everyone in Acme sees.
  const page = (title: string, body: string) =>
    as({ ...ana, direct: true }, async (s) => {
      const page = await createPage(s, { spaceId: space, title, shared: true });
      await writeItem(s, { pageId: page, body, shared: true });
      return page;
    });
  const act = (input: Record<string, unknown>) => claude.call('act', { action: 'page.archive', input });
  // What the card gets back from a tool it calls through the assistant.
  const card = async (name: string, args: Record<string, unknown>) => {
    const result = await claude.client.callTool({ name, arguments: args });
    const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
    return { failed: Boolean(result.isError), text, proposal: (result.structuredContent as { proposal?: Record<string, any> } | undefined)?.proposal };
  };
  return { ana, cara, space, claude, page, act, card };
}

const proposalOf = (text: string) => /proposal:([0-9a-f-]{36})/.exec(text)![1];
const titles = async (who: Member, space: string) => ((await who.browser.json(`/api/spaces/${space}/pages`)).body.pages as { title: string }[]).map((page) => page.title);
const archive = (who: Member, page: string, archived: boolean) => who.browser.json(`/api/pages/${page}/archive`, { archived });
const shownOf = async (who: Member, proposal: string) => (await who.browser.json(`/api/proposals/${proposal}`)).body.proposal;
const decide = (who: Member, proposal: string, shown: string, approve = true) => who.browser.json(`/api/proposals/${proposal}/decide`, { approve, shown });
const waiting = async (who: Member) => ((await who.browser.json('/api/waiting')).body.waiting as { id: string; action: string; text: string; asked: boolean }[]);

test('an assistant proposes archiving a page others see, and the user archives it on the card', async () => {
  const { ana, cara, space, claude, page, act, card } = await acme();
  const vendor = await page('Old print vendor', 'Trykkeriet AS printed the brochures until 2025.');

  const asked = await act({ page: `page:${vendor}`, asked: true });
  assert.match(asked.text, /^Waiting for the user's approval \(proposal:.+\), since others see that page\. Nothing is archived yet\./);
  const id = proposalOf(asked.text);
  assert.ok((await titles(cara, space)).includes('Old print vendor'), 'nothing changes before Ana decides');
  // It waits on Home and in the assistant's context, naming the page.
  assert.deepEqual((await waiting(ana)).map((item) => [item.id, item.action, item.text, item.asked]), [[id, 'archive page', 'Old print vendor', true]]);
  assert.match((await claude.call('context', { request: 'vendors', space: `space:${space}` })).text, new RegExp(`## Waiting for approval\\n.+\\n- Archive the page page:${vendor}`));

  // The card shows the page as Ana sees it now, and she archives it there, for everyone who sees it.
  const shown = (await card('approval', { proposal: id })).proposal!;
  assert.deepEqual([shown.action, shown.page.title, shown.page.archived, shown.page.asked], ['archive page', 'Old print vendor', false, true]);
  assert.equal((await card('decide', { proposal: id, approve: true, shown: shown.page.shown })).proposal?.state, 'approved');
  assert.ok(!(await titles(cara, space)).includes('Old print vendor'));
  // It's Ana's own decision, made on Claude's card, and the page records it as hers.
  const [decision] = await admin`select decided_by, decided_in from proposals where id = ${id}`;
  assert.deepEqual({ ...decision }, { decidedBy: ana.id, decidedIn: 'Claude' });
  const [recorded] = await admin`select person_id, agent from page_archives where page_id = ${vendor}`;
  assert.deepEqual({ ...recorded }, { personId: ana.id, agent: null });
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /The user archived it on .+ out of everyday context now/);

  // Reopening it waits for her the same way, here on the decision page.
  const reopen = proposalOf((await act({ page: `page:${vendor}`, reopen: true })).text);
  const again = await shownOf(ana, reopen);
  assert.deepEqual([again.action, again.page.archived, again.page.asked], ['reopen page', true, true]);
  assert.equal((await decide(ana, reopen, again.page.shown)).status, 200);
  assert.ok((await titles(cara, space)).includes('Old print vendor'));
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /reopened since/);
  assert.deepEqual(await waiting(ana), []);
});

test('approving runs on the page as it was shown, and refuses when that changed', async () => {
  const { ana, cara, claude, page, act, card } = await acme();
  const brochure = await page('Brochure 2025', 'The 2025 brochure has 24 pages.');

  // Archived and reopened by Cara meanwhile, the page is shown again before Ana archives it.
  const first = proposalOf((await act({ page: `page:${brochure}`, asked: true })).text);
  const seen = (await shownOf(ana, first)).page.shown;
  assert.equal((await archive(cara, brochure, true)).status, 200);
  assert.equal((await archive(cara, brochure, false)).status, 200);
  const stale = await decide(ana, first, seen);
  assert.equal(stale.status, 409);
  assert.match(stale.body.message, /The page changed after you opened this/);
  assert.equal((await decide(ana, first, (await shownOf(ana, first)).page.shown)).status, 200);

  // Reopened another way meanwhile, there's nothing left to decide, and it stops waiting.
  const reopen = proposalOf((await act({ page: `page:${brochure}`, reopen: true })).text);
  const shown = (await card('approval', { proposal: reopen })).proposal!;
  assert.equal((await archive(cara, brochure, false)).status, 200);
  const late = await card('decide', { proposal: reopen, approve: true, shown: shown.page.shown });
  assert.ok(late.failed);
  assert.match(late.text, /It was reopened after you opened this, so there’s nothing to decide/);
  assert.deepEqual([late.proposal?.state, late.proposal?.page.archived], ['open', false]);
  assert.deepEqual(await waiting(ana), []);
  assert.match((await claude.call('read', { ref: `proposal:${reopen}` })).text, /The page is open already, so there is nothing to decide/);

  // Someone who can no longer see the page can't approve archiving it.
  const caras = await as({ person: cara.id, agent: 'Claude' }, (s) => proposePageArchive(s, { pageId: brochure, asked: true }));
  const forCara = (await shownOf(cara, caras.id)).page.shown;
  await as({ ...ana, direct: true }, (s) => removeMember(s, caras.spaceId, cara.id));
  assert.equal((await decide(cara, caras.id, forCara)).status, 404);
  assert.ok((await titles(ana, caras.spaceId)).includes('Brochure 2025'));
});

test('an assistant’s own suggestion to archive a page others see is rare, and rests on evidence', async () => {
  const { ana, page, act, claude } = await acme();
  const [vendor, gunnar, launch, ads, fair, survey] = [
    await page('Old print vendor', 'Trykkeriet AS printed the brochures.'),
    await page('Gunnar Holm', 'Gunnar runs the steering group.'),
    await page('Launch 2025', 'The launch is in November.'),
    await page('Ads', 'The ads run on Facebook.'),
    await page('Fair', 'The booth is booked.'),
    await page('Survey', 'The survey closes in May.'),
  ];
  // Without a reason, it isn't suggested: age alone is not evidence.
  const bare = await act({ page: `page:${vendor}` });
  assert.ok(bare.failed);
  assert.match(bare.text, /Say why the page is no longer active.+Age is not evidence/);

  // Two at once: only one of the assistant's own suggestions waits.
  const both = await Promise.all([
    act({ page: `page:${vendor}`, why: 'Trykkeriet AS closed in 2026.' }),
    act({ page: `page:${gunnar}`, why: 'Gunnar left Acme in June.' }),
  ]);
  assert.equal(both.filter((answer) => !answer.failed).length, 1, both.map((answer) => answer.text).join(' | '));
  const own = proposalOf(both.find((answer) => !answer.failed)!.text);
  const suggested = await shownOf(ana, own);
  assert.equal(suggested.page.asked, false);
  assert.match(suggested.page.why, /closed in 2026|left Acme in June/);
  const other = suggested.page.title === 'Old print vendor' ? gunnar : vendor;
  assert.match((await act({ page: `page:${other}`, why: 'Still true.' })).text, /Archiving a page already waits for the user/);

  // Asked for, a few wait beside it, and no more.
  const asked = [];
  for (const one of [launch, ads, fair]) asked.push(proposalOf((await act({ page: `page:${one}`, asked: true })).text));
  assert.match((await act({ page: `page:${survey}`, asked: true })).text, /Three pages already wait/);

  // Kept open, it isn't suggested again unless the user asks.
  assert.equal((await decide(ana, own, suggested.page.shown, false)).status, 200);
  const keptPage = suggested.page.title === 'Old print vendor' ? vendor : gunnar;
  assert.match((await act({ page: `page:${keptPage}`, why: 'It really is done.' })).text, /The user kept .+ open after archiving it was suggested on .+ Don't suggest it again unless they ask/);
  assert.match((await claude.call('read', { ref: `proposal:${own}` })).text, /kept it open.+Don't suggest archiving it again/);

  // Withdrawn, it counts as turned down too.
  const next = proposalOf((await act({ page: `page:${other}`, why: 'The work there is finished.' })).text);
  assert.match((await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${next}` } })).text, /Don't suggest it again unless the user asks/);
  assert.match((await act({ page: `page:${other}`, why: 'Finished, really.' })).text, /The user kept .+ open/);
  // Asked for, it can still be proposed, once there's room.
  await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${asked[0]}` } });
  assert.match((await act({ page: `page:${keptPage}`, asked: true })).text, /^Waiting for the user's approval/);
});

test('straight against the database, an assistant only proposes, about a page the user sees, and never decides', async () => {
  const { ana, cara, space, page } = await acme();
  const vendor = await page('Old print vendor', 'Trykkeriet AS printed the brochures.');
  const [carasDraft, elsewhere] = [
    await as({ ...cara, direct: true }, async (s) => {
      const draft = await createPage(s, { spaceId: space, title: 'Cara’s draft' });
      await writeItem(s, { pageId: draft, body: 'A first idea for the logo.' });
      return draft;
    }),
    await as({ ...ana, direct: true }, async (s) => {
      const globex = await createSpace(s, { name: 'Globex' });
      const other = await createPage(s, { spaceId: globex, title: 'Globex notes', shared: true });
      await writeItem(s, { pageId: other, body: 'Globex pays on time.', shared: true });
      return other;
    }),
  ];
  const asAssistant = <T>(fn: (s: Session) => Promise<T>) => as({ person: ana.id, agent: 'Claude' }, fn);
  const propose = (pageId: string | null, extra: { request?: boolean } = {}) =>
    asAssistant((s) => s.tx`
      insert into proposals (space_id, private_to, action, page_id, change, request)
      values (${space}, ${ana.id}, 'archive page', ${pageId}, '{}', ${extra.request ?? false})
      returning id
    `);

  // Only about a page Ana sees, in the proposal's own space.
  await assert.rejects(propose(carasDraft), refused);
  await assert.rejects(propose(elsewhere), refused);
  // Never as a request to the admins, and never without its page.
  await assert.rejects(propose(vendor, { request: true }), { code: '23514' });
  await assert.rejects(propose(null), { code: '23514' });

  // Once proposed, the assistant can't approve it, nor archive the page itself.
  const [{ id }] = await propose(vendor);
  await assert.rejects(asAssistant((s) => s.tx`update proposals set state = 'approved' where id = ${id}`), refused);
  await assert.rejects(asAssistant((s) => s.tx`select archive_page(${vendor}::uuid, true)`), refused);
  assert.ok((await titles(cara, space)).includes('Old print vendor'));
});
