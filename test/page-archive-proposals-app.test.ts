// Issue #6, an assistant proposes archiving a page in a space others can open (spec §3): "Anyone
// who can write in the space archives a page directly, and an assistant proposes it for a person to
// approve." The person decides on the card in the conversation or on the decision page, and
// approving runs on the page as it was shown. The assistant's own suggestions are rare and rest on
// evidence that the page is no longer active. Reopening one works the same way.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl, type Session } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { createPage, updateItem, writeItem } from '../src/knowledge.ts';
import { proposePageArchive } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace, removeMember } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { addTask } from '../src/tasks.ts';
import { admin, as, db, member, refused, until, type Member } from './helpers.ts';
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
/** An answer with its references left out, to compare two that differ only in what they point to. */
const plain = (text: string) => text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '…');

test('an assistant proposes archiving a page in a space others can open, and the user archives it on the card', async () => {
  const { ana, cara, space, claude, page, act, card } = await acme();
  const vendor = await page('Old print vendor', 'Trykkeriet AS printed the brochures until 2025.');

  const asked = await act({ page: `page:${vendor}`, asked: true });
  assert.match(asked.text, /^Waiting for the user's approval \(proposal:.+\), since others can open Acme\. Nothing is archived yet\./);
  const id = proposalOf(asked.text);
  assert.ok((await titles(cara, space)).includes('Old print vendor'), 'nothing changes before Ana decides');
  // It waits on Home and in the assistant's context, naming the page.
  assert.deepEqual((await waiting(ana)).map((item) => [item.id, item.action, item.text, item.asked]), [[id, 'archive page', 'Old print vendor', true]]);
  assert.match((await claude.call('context', { request: 'vendors', space: `space:${space}` })).text, new RegExp(`## Waiting for approval\\n.+\\n- Archive the page page:${vendor}`));

  // The card shows the page as Ana sees it now, and she archives it there, for everyone who sees it.
  const shown = (await card('approval', { proposal: id })).proposal!;
  // Everyone in Acme sees what's shared on it, so the card can say so.
  assert.deepEqual([shown.action, shown.page.title, shown.page.archived, shown.page.shared, shown.page.asked], ['archive page', 'Old print vendor', false, true, true]);
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

  // Renamed after Ana opened it, the page is shown again before she archives it.
  const first = proposalOf((await act({ page: `page:${brochure}`, asked: true })).text);
  const seen = (await shownOf(ana, first)).page.shown;
  await as({ ...ana, direct: true }, async (s) => {
    const [title] = await s.tx<{ id: string }[]>`select id from content where page_id = ${brochure} and kind = 'title'`;
    await updateItem(s, title.id, { body: 'Brochure 2025, print' });
  });
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

  // A page Ana can no longer see has nothing to decide.
  const flyer = await page('Old flyer', 'The flyer was A5.');
  const gone = proposalOf((await act({ page: `page:${flyer}`, asked: true })).text);
  const flyerShown = (await shownOf(ana, gone)).page.shown;
  await admin`delete from content where page_id = ${flyer}`;
  const missing = await decide(ana, gone, flyerShown);
  assert.equal(missing.status, 409);
  assert.match(missing.body.message, /You can’t see this page anymore/);

  // Someone who can no longer open the space can't approve archiving one of its pages.
  const caras = await as({ person: cara.id, agent: 'Claude' }, (s) => proposePageArchive(s, { pageId: brochure, asked: true }));
  const forCara = (await shownOf(cara, caras.id)).page.shown;
  await as({ ...ana, direct: true }, (s) => removeMember(s, caras.spaceId, cara.id));
  assert.equal((await decide(cara, caras.id, forCara)).status, 404);
  assert.ok((await titles(ana, caras.spaceId)).includes('Brochure 2025, print'));
});

test('approving refuses when someone else archives the page at the same moment', async () => {
  const { ana, cara, page, act } = await acme();
  const flyer = await page('Flyer', 'The flyer is printed in A5.');
  const id = proposalOf((await act({ page: `page:${flyer}`, asked: true })).text);
  const shown = (await shownOf(ana, id)).page.shown;
  // Cara archives it directly, and her change is still on its way while Ana approves.
  let approving: ReturnType<typeof decide> | undefined;
  await as({ ...cara, direct: true }, async (s) => {
    await s.tx`select archive_page(${flyer}::uuid, true)`;
    approving = decide(ana, id, shown);
    await until(async () => {
      const [{ waits }] = await admin`
        select exists (select from pg_stat_activity where wait_event_type = 'Lock' and query like '%archive_page%' and pid <> pg_backend_pid()) as waits
      `;
      return waits;
    });
  });
  const answer = await approving!;
  assert.equal(answer.status, 409);
  assert.match(answer.body.message, /It was archived after you opened this, so there’s nothing to decide/);
  assert.equal((await shownOf(ana, id)).state, 'open');
  // Archived once, by Cara.
  assert.deepEqual((await admin`select person_id from page_archives where page_id = ${flyer}`).map((row) => row.personId), [cara.id]);
});

test('a proposal that something changed under never comes back', async () => {
  const { ana, cara, space, claude, page, act } = await acme();
  // A page archived and reopened another way while the proposal waited.
  const brochure = await page('Brochure', 'The brochure has 24 pages.');
  const id = proposalOf((await act({ page: `page:${brochure}`, asked: true })).text);
  const seen = (await shownOf(ana, id)).page.shown;
  assert.equal((await archive(cara, brochure, true)).status, 200);
  assert.deepEqual(await waiting(ana), []);
  assert.equal((await archive(cara, brochure, false)).status, 200);
  assert.deepEqual(await waiting(ana), [], 'reopened, it stays gone');
  assert.match((await claude.call('read', { ref: `proposal:${id}` })).text, /It no longer stands: the page was archived or reopened since it was proposed/);
  const decided = await decide(ana, id, seen);
  assert.equal(decided.status, 409);
  assert.match(decided.body.message, /archived and reopened since this was proposed/);
  // It no longer waits, so it doesn't keep the assistant from asking again.
  assert.match((await act({ page: `page:${brochure}`, asked: true })).text, /^Waiting for the user's approval/);

  // The same for a space.
  const campaign = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Campaign', parentId: space }));
  const archiving = proposalOf((await claude.call('act', { action: 'space.archive', input: { space: `space:${campaign}`, asked: true } })).text);
  const spaces = String((await shownOf(ana, archiving)).archive.spaces);
  assert.equal((await ana.browser.json(`/api/spaces/${campaign}/archive`, { archived: true })).status, 200);
  assert.equal((await ana.browser.json(`/api/spaces/${campaign}/archive`, { archived: false })).status, 200);
  assert.ok(!(await waiting(ana)).some((item) => item.id === archiving));
  assert.match((await claude.call('read', { ref: `proposal:${archiving}` })).text, /It no longer stands: the space was archived and reopened since it was proposed/);
  assert.equal((await ana.browser.json(`/api/proposals/${archiving}/decide`, { approve: true, shown: spaces })).status, 409);
});

test('whether an assistant archives at once never depends on what others have on a page', async () => {
  const { ana, cara, space, act, card } = await acme();
  // Two pages that look the same to Ana, with only her own notes; on the second, Cara has a note of her own.
  const [alone, withCara] = await as({ ...ana, direct: true }, async (s) => {
    const make = async (title: string) => {
      const page = await createPage(s, { spaceId: space, title });
      await writeItem(s, { pageId: page, body: 'Notes from the call.' });
      return page;
    };
    return [await make('Call with Gunnar'), await make('Call with Marte')];
  });
  // Cara wrote a note of her own there while it had something shared, which is gone since, as when its source is deleted.
  const agenda = await as({ ...ana, direct: true }, (s) => writeItem(s, { pageId: withCara, body: 'The agenda for the call.', shared: true }));
  await as({ ...cara, direct: true }, (s) => writeItem(s, { pageId: withCara, body: 'My own note.' }));
  await admin`delete from content where id = ${agenda.id}`;
  const answers = async (input: Record<string, unknown>) => [await act({ page: `page:${alone}`, ...input }), await act({ page: `page:${withCara}`, ...input })];

  // Claude's own idea, without a reason, is refused the same way for both.
  const [ownAlone, ownWithCara] = await answers({});
  assert.deepEqual([ownAlone.failed, plain(ownAlone.text)], [ownWithCara.failed, plain(ownWithCara.text)]);
  // Asked for, both wait for Ana, for the same reason, and show the same on the card.
  const [askedAlone, askedWithCara] = await answers({ asked: true });
  assert.equal(plain(askedAlone.text), plain(askedWithCara.text));
  assert.match(askedAlone.text, /since others can open Acme/);
  for (const answer of [askedAlone, askedWithCara]) {
    const shown = (await card('approval', { proposal: proposalOf(answer.text) })).proposal!;
    assert.deepEqual([shown.page.shared, shown.page.archived], [false, false]);
    assert.equal((await card('decide', { proposal: shown.id, approve: true, shown: shown.page.shown })).proposal?.state, 'approved');
  }
});

test('an assistant’s own suggestion to archive a page is rare, and rests on evidence', async () => {
  const { ana, cara, page, act, claude } = await acme();
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
  const [turnedDown, other] = suggested.page.title === 'Old print vendor' ? [vendor, gunnar] : [gunnar, vendor];
  assert.match((await act({ page: `page:${other}`, why: 'Still true.' })).text, /Archiving a page already waits for the user/);

  // Asked for, a few wait beside it, and no more.
  const asked = [];
  for (const one of [launch, ads, fair]) asked.push(proposalOf((await act({ page: `page:${one}`, asked: true })).text));
  assert.match((await act({ page: `page:${survey}`, asked: true })).text, /Three pages already wait/);

  // Turned down, it isn't suggested again unless the user asks.
  assert.equal((await decide(ana, own, suggested.page.shown, false)).status, 200);
  assert.match((await act({ page: `page:${turnedDown}`, why: 'It really is done.' })).text, /The user turned down archiving “.+” when it was suggested on .+ Don't suggest it again unless they ask/);
  assert.match((await claude.call('read', { ref: `proposal:${own}` })).text, /The user turned down archiving it, on .+ Don't suggest archiving it again unless they ask/);

  // Withdrawn by the assistant, the same.
  const next = proposalOf((await act({ page: `page:${other}`, why: 'The work there is finished.' })).text);
  assert.match((await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${next}` } })).text, /Don't suggest it again unless the user asks/);
  assert.match((await act({ page: `page:${other}`, why: 'Finished, really.' })).text, /The user turned down archiving/);

  // Archived as the user asked and reopened since, it isn't suggested again either.
  assert.equal((await decide(ana, asked[1], (await shownOf(ana, asked[1])).page.shown)).status, 200);
  assert.equal((await archive(cara, ads, false)).status, 200);
  assert.match((await act({ page: `page:${ads}`, why: 'The ads stopped.' })).text, /“Ads” was reopened after the user archived it on .+ Don't suggest archiving it again unless they ask/);

  // But a proposal the user asked for and then withdrew doesn't count against the page.
  await claude.call('act', { action: 'proposal.withdraw', input: { proposal: `proposal:${asked[0]}` } });
  assert.match((await act({ page: `page:${launch}`, why: 'The launch happened in November.' })).text, /^Waiting for the user's approval/);
  // And a page kept open can still be proposed when the user asks.
  assert.match((await act({ page: `page:${turnedDown}`, asked: true })).text, /^Waiting for the user's approval/);
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

  // Only about a knowledge page Ana sees, in the proposal's own space: never its rules.
  await assert.rejects(propose(carasDraft), refused);
  await assert.rejects(propose(elsewhere), refused);
  const rules = await as({ ...ana, direct: true }, async (s) => (await addRule(s, { spaceId: space, kind: 'preference', body: 'Write in English.', shared: true })).pageId);
  await assert.rejects(propose(rules), refused);
  // Never as a request to the admins, and never without its page.
  await assert.rejects(propose(vendor, { request: true }), { code: '23514' });
  await assert.rejects(propose(null), { code: '23514' });

  // Naming Cara in the row never tells whether she can see a page or has a task: it's refused the
  // same way either way.
  const dave = await member(homing.url, 'Dave');
  await as({ ...ana, direct: true }, (s) => addMember(s, space, dave.id));
  const davesDraft = await as({ ...dave, direct: true }, async (s) => {
    const draft = await createPage(s, { spaceId: space, title: 'Dave’s draft' });
    await writeItem(s, { pageId: draft, body: 'A second idea for the logo.' });
    return draft;
  });
  const [carasTask, davesTask] = [
    (await as({ ...cara, direct: true }, (s) => addTask(s, { spaceId: space, title: 'Call the printer' }))).id,
    (await as({ ...dave, direct: true }, (s) => addTask(s, { spaceId: space, title: 'Book the hall' }))).id,
  ];
  const forCara = (column: 'page_id' | 'task_id', id: string) =>
    asAssistant((s) => s.tx`
      insert into proposals (space_id, private_to, action, ${s.tx(column)}, change)
      values (${space}, ${cara.id}, ${column === 'page_id' ? 'archive page' : 'share task'}, ${id}, '{}')
    `).then(() => 'made', (error: Error) => error.message);
  assert.equal(await forCara('page_id', carasDraft), await forCara('page_id', davesDraft));
  assert.equal(await forCara('task_id', carasTask), await forCara('task_id', davesTask));

  // Once proposed, the assistant can't approve it, nor archive the page itself.
  const [{ id }] = await propose(vendor);
  await assert.rejects(asAssistant((s) => s.tx`update proposals set state = 'approved' where id = ${id}`), refused);
  await assert.rejects(asAssistant((s) => s.tx`select archive_page(${vendor}::uuid, true)`), refused);
  assert.ok((await titles(cara, space)).includes('Old print vendor'));
});
