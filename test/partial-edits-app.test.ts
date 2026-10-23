// Issue #114, changing part of an item (spec §3, "Substantial work stays whole", and §10). An
// assistant changes one passage of a long document without resending the rest, as an update or a
// replacement whose new text is the old text with that passage changed. So it's allowed exactly
// where those are, recorded in the item's history, a private update when the item is shared, and
// never a change to what a person wrote. Edits are made to the text as it is when they're made.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, supersedeItem, updateItem, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, db, member, until, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let anas: Awaited<ReturnType<Assistant['open']>>, caras: Awaited<ReturnType<Assistant['open']>>;

type PageItem = { id: string; text: string; shared: boolean; replaced: { text: string; shared: boolean } | null; earlier: { text: string }[] };

const pageAs = async (who: Member, page: string) => (await who.browser.json(`/api/pages/${page}`)).body as { items: PageItem[] };
const refIn = (text: string, kind: string) => new RegExp(`${kind}:([0-9a-f-]{36})`).exec(text)![1];

/** A steering group outline of about 4,000 characters, the size benchmark 0's assistants kept. */
const outline = `# Website relaunch: steering group outline

For the steering group on 12 November. Eight slides, about 20 minutes, with time for the two decisions at the end.

## Slide 1: Where we are
- The new site is built, and its content is being moved.
- Go-live moved from 1 March to 15 March 2027.
- Budget for year 1: 2.0 million NOK, cut from 2.5.

Notes: open with the date, since that's what the group asked about last time. Keep it to a minute.

## Slide 2: Why it moved
- The old CMS exports everything at once only in January.
- Its API moves at most 500 pages an hour, and we declined the Enterprise plan that lifts the limit.
- Moving two weeks costs less than a year of that plan.

Notes: Gunnar will ask why we didn't buy the plan. The answer is the price: 380,000 NOK a year for something we need for six weeks.

## Slide 3: What's done
- Design system and page templates, approved by marketing on 2 October.
- Search, with results ranked by section and the most visited pages first.
- The cookie banner, approved by legal on 14 September.

Notes: show the new front page here, from the test site, not a screenshot. Then search for "opening hours", which the old site never found, and let the group try it on their phones.

## Slide 4: Content
- 1,800 of 4,200 pages moved, about 300 a week.
- Owner: Cara
- Redirects for the 300 most visited old addresses are written, and tested in staging.

Notes: the pace is fine for 15 March if it holds through Christmas. Say so plainly.

## Slide 5: Budget
- Spent so far: 1.1 million NOK.
- Left for year 1: 0.9 million NOK, of which 0.2 is held back for surprises.
- Hosting: 18,000 NOK a month from go-live.

Notes: the cut from 2.5 million came out of the second phase, not this one. Nothing on this slide changes because of it. Ask finance to bring the forecast, in case the group wants it.

## Slide 6: Team
- Owner: Cara
- Content: Jonas joins Cara from December, for the last 2,400 pages.
- Development: Composa, two developers until go-live, one for a month after.

Notes: thank Composa's team by name. They took the API limit in their stride.

## Slide 7: Decisions we need
- Approve the new go-live date, 15 March 2027.
- Approve hosting from February, a month early, for the load test at twice the expected traffic.

Notes: both need a yes in the meeting. The hosting contract has to be signed by 1 December.

## Slide 8: Risks
- The old CMS exports everything at once only in January: if the export fails, the next chance is a year later.
- Composa has one reference customer of our size so far.

Notes: for the export, we have a fallback through the API at 500 pages an hour, which would take about two weeks of nights.

## After the meeting
- Send the slides and the decisions to the group the same day.
- Update the plan with the dates the group sets.
- Book the load test with Composa once hosting is approved.
- Tell the content team about the new date before it's announced anywhere else.

## Questions we expect
- Can we go live on 1 March with only part of the content? No: the old and new sites can't share search, and half of each would confuse readers for weeks.
- Does the cut to 2.0 million touch the relaunch? No, it came out of the second phase: the member area and the newsletter tool.
- What if Composa's developers are needed elsewhere? Their contract names both developers until go-live, and a month after at half time.
- Who decides if the export fails? The steering group, at an extra meeting within a week. The fallback is ready either way.

## Background, not for the slides
- The relaunch started in April, after the survey where 62% of readers said they couldn't find what they were looking for.
- The first plan had go-live in January, before anyone knew about the export. It moved to 1 March in August, and now to 15 March.
- Marketing wants the launch before Easter, so 15 March leaves three weeks of margin. Any later, and we should talk to them first.
- Legal approved the cookie banner and the privacy page together. A change to either needs both approved again.`;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
  const open = async (who: Member) => {
    const assistant = new Assistant(homing.url, assistants.claude);
    await assistant.connect(who.browser);
    return assistant.open();
  };
  [anas, caras] = [await open(ana), await open(cara)];
});

after(() => homing.close());

/** Ana's Claude keeps the outline on a page of its own, and gives its item and page. */
async function keepOutline(title: string) {
  const saved = await anas.call('remember', { space: `space:${acme}`, page: title, type: 'document', text: outline });
  assert.ok(!saved.failed, saved.text);
  return { item: refIn(saved.text, 'item'), page: refIn(saved.text, 'page') };
}

/** An item's text and earlier versions, as the app shows them to Ana. */
async function itemAsAna(page: string, item: string) {
  const found = (await pageAs(ana, page)).items.find((entry) => entry.id === item)!;
  return { text: found.text, earlier: found.earlier.map((entry) => entry.text) };
}

test('an assistant changes one slide of a long outline without resending the rest, and its history shows the change', async () => {
  assert.ok(outline.length > 4_000);
  const { item, page } = await keepOutline('Steering group outline');

  // Reading the page shows the outline as written, headings, lists and line breaks, so a passage can be copied exactly.
  const read = (await anas.call('read', { ref: `page:${page}` })).text;
  assert.ok(read.includes(`- item:${item}, private, written by Ana through Claude:\n\`\`\`markdown\n${outline}\n\`\`\``), read);

  // A new session adds a risk to slide 8 only, sending that passage and nothing else.
  const edit = {
    updates: `item:${item}`,
    edits: [{ old: '- Composa has one reference customer of our size so far.', new: '- Composa has one reference customer of our size so far.\n- Jonas is new to the old CMS, and starts in December.' }],
  };
  assert.ok(JSON.stringify(edit).length < 300);
  const changed = await anas.call('remember', edit);
  assert.equal(changed.text, `Updated item:${item}. What it said before is kept in its history. It's in Acme (space:${acme}), where that item is.`);

  const expected = outline.replace('of our size so far.', 'of our size so far.\n- Jonas is new to the old CMS, and starts in December.');
  assert.deepEqual(await itemAsAna(page, item), { text: expected, earlier: [outline] });
  const history = (await anas.call('read', { ref: `item:${item}` })).text;
  assert.ok(history.startsWith(`${expected}\n\n`));
  assert.match(history, /## Earlier versions\n- "# Website relaunch: steering group outline For the steering group/);
});

test('several edits are made in order, all of them or none', async () => {
  const { item, page } = await keepOutline('Outline, second draft');

  // Each edit is made to the text the edits before it left: the second changes what the first wrote.
  const changed = await anas.call('remember', {
    updates: `item:${item}`,
    edits: [
      { old: '## Slide 7: Decisions we need', new: '## Slide 7: Two decisions' },
      { old: 'Slide 7: Two decisions', new: 'Slide 7: Two decisions today' },
      { old: 'Budget for year 1: 2.0 million NOK, cut from 2.5.', new: 'Budget for year 1: 2.0 million NOK.' },
    ],
  });
  assert.ok(!changed.failed, changed.text);
  const now = outline.replace('## Slide 7: Decisions we need', '## Slide 7: Two decisions today').replace('2.0 million NOK, cut from 2.5.', '2.0 million NOK.');
  assert.deepEqual(await itemAsAna(page, item), { text: now, earlier: [outline] });

  // One edit that can't be made leaves everything as it was, the others and the sources given with them too.
  const refused = await anas.call('remember', {
    updates: `item:${item}`,
    edits: [
      { old: 'Spent so far: 1.1 million NOK.', new: 'Spent so far: 1.2 million NOK.' },
      { old: '## Slide 9: Next steps', new: '## Slide 9: What happens next' },
    ],
    sources: [{ reference: 'Finance report, November', excerpt: 'Spent on the relaunch: 1.2 MNOK.' }],
  });
  assert.ok(refused.failed);
  assert.equal(refused.text, `The text to replace in edit 2 isn't in item:${item} once the edits before it are made. It may have changed since you read it: read it again, and copy the text exactly, line breaks included. Nothing was changed.`);
  assert.deepEqual(await itemAsAna(page, item), { text: now, earlier: [outline] });
  const [{ count }] = await admin`select count(*)::int from sources where excerpt = 'Spent on the relaunch: 1.2 MNOK.'`;
  assert.equal(count, 0);
});

test('a passage that isn’t there, or is there twice, is refused, saying how to fix it', async () => {
  const { item, page } = await keepOutline('Outline, third draft');
  const edit = (edits: { old: string; new: string }[], more = {}) => anas.call('remember', { updates: `item:${item}`, edits, ...more });

  const missing = await edit([{ old: '- Budget for year 1: 2.5 million NOK.', new: '- Budget for year 1: 2.0 million NOK.' }]);
  assert.deepEqual([missing.failed, missing.text], [true, `The text to replace isn't in item:${item}. It may have changed since you read it: read it again, and copy the text exactly, line breaks included. Nothing was changed.`]);
  const twice = await edit([{ old: '- Owner: Cara', new: '- Owner: Jonas' }]);
  assert.deepEqual([twice.failed, twice.text], [true, `The text to replace is in item:${item} more than once. Include more of the text around it, so it's there once. Nothing was changed.`]);
  const empty = await edit([{ old: '', new: 'Hello' }]);
  assert.match(empty.text, /^The text to replace is empty\./);
  const nothingLeft = await edit([{ old: outline, new: ' ' }]);
  assert.equal(nothingLeft.text, `These edits would leave item:${item} empty. Nothing was changed.`);
  const tooLong = await edit([{ old: '## After the meeting', new: 'x'.repeat(17_000) }]);
  assert.equal(tooLong.text, `These edits would make item:${item} longer than 20,000 characters. Nothing was changed: split it over more items.`);
  assert.equal((await edit([{ old: 'Owner', new: 'Lead' }], { text: 'Hello' })).text, 'Give either text or edits, not both.');
  const unnamed = await anas.call('remember', { space: `space:${acme}`, edits: [{ old: 'Owner', new: 'Lead' }] });
  assert.equal(unnamed.text, 'Edits change an item: name it with updates or replaces, such as item:….');
  assert.deepEqual(await itemAsAna(page, item), { text: outline, earlier: [] });

  // With the heading above it, the passage is there once.
  const unique = await edit([{ old: '## Slide 6: Team\n- Owner: Cara', new: '## Slide 6: Team\n- Owner: Jonas' }]);
  assert.ok(!unique.failed, unique.text);
  assert.equal((await itemAsAna(page, item)).text, outline.replace('## Slide 6: Team\n- Owner: Cara', '## Slide 6: Team\n- Owner: Jonas'));

  // The same letters typed another way are the same text, such as é typed as an e and an accent.
  const lunch = refIn((await anas.call('remember', { space: `space:${acme}`, page: 'Workshop', text: 'Lunch is at Café Sjøen.' })).text, 'item');
  const typed = await anas.call('remember', { updates: `item:${lunch}`, edits: [{ old: 'Café Sjøen', new: 'Kafé Fjord' }] });
  assert.ok(!typed.failed, typed.text);
  assert.equal((await anas.call('read', { ref: `item:${lunch}` })).text.split('\n')[0], 'Lunch is at Kafé Fjord.');
});

test('a partial edit is allowed only where an assistant may change the whole item', async () => {
  const space = `space:${acme}`;
  // Ana writes the agenda herself, in the app: it stays hers, and her assistant can't edit it, as an update or a replacement.
  const agendaPage = await as(ana, (s) => createPage(s, { spaceId: acme, title: 'Workshop agenda' }));
  const agendaText = '# Workshop\n\n1. Goals\n2. Budget\n3. Next steps';
  const { id: agenda } = (await ana.browser.json(`/api/pages/${agendaPage}/items`, { text: agendaText })).body;
  for (const how of ['updates', 'replaces']) {
    const attempt = await anas.call('remember', { [how]: `item:${agenda}`, edits: [{ old: '2. Budget', new: '2. Budget, with the cut' }] });
    assert.deepEqual([attempt.failed, attempt.text], [true, 'Agents never change what people wrote. Save what you found as a new item on the same page, and point out the difference to the user.'], how);
  }
  assert.deepEqual((await pageAs(ana, agendaPage)).items.map((entry) => [entry.text, entry.earlier.length]), [[agendaText, 0]]);

  // Cara's own notes are hers alone: Ana's assistant can't see them, let alone edit them.
  const kept = await caras.call('remember', { space, page: 'Salary talk', text: '# Salary talk\n\nAsk for 8%.\nMention the Beta project.' });
  const carasNote = refIn(kept.text, 'item');
  for (const how of ['updates', 'replaces']) {
    const attempt = await anas.call('remember', { [how]: `item:${carasNote}`, edits: [{ old: 'Ask for 8%.', new: 'Ask for 3%.' }] });
    assert.deepEqual([attempt.failed, attempt.text], [true, 'There is no item with that reference that you can see.'], how);
  }
  assert.equal((await pageAs(cara, refIn(kept.text, 'page'))).items[0].text, '# Salary talk\n\nAsk for 8%.\nMention the Beta project.');

  // What everyone in Acme sees, which Cara's Claude wrote: Ana's assistant can't rewrite it for everyone...
  const { plan, shared } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const plan = await createPage(s, { spaceId: acme, title: 'Launch plan', shared: true });
    return { plan, shared: (await writeItem(s, { pageId: plan, body: '# Launch plan\n\n- Go-live: 1 March\n- Owner: Cara', shared: true })).id };
  });
  const rewrite = await anas.call('remember', { updates: `item:${shared}`, edits: [{ old: 'Go-live: 1 March', new: 'Go-live: 15 March' }] });
  assert.deepEqual([rewrite.failed, rewrite.text], [true, "remember can't rewrite shared knowledge. Use replaces to update it in your own view."]);
  assert.deepEqual((await pageAs(cara, plan)).items.map((entry) => [entry.id, entry.text, entry.earlier.length]), [[shared, '# Launch plan\n\n- Go-live: 1 March\n- Owner: Cara', 0]]);

  // ...only update it in her own view, as a private update that says the others still see the earlier version.
  const update = await anas.call('remember', { replaces: `item:${shared}`, edits: [{ old: 'Go-live: 1 March', new: 'Go-live: 15 March' }] });
  assert.match(update.text, new RegExp(`^Saved as item:\\S+ on your private side\\. For you it replaces item:${shared}, and others in the space still see the earlier version\\.`));
  const mine = refIn(update.text, 'item');
  assert.deepEqual((await pageAs(ana, plan)).items.map((entry) => [entry.id, entry.text, entry.shared, entry.replaced?.text, entry.replaced?.shared]), [
    [mine, '# Launch plan\n\n- Go-live: 15 March\n- Owner: Cara', false, '# Launch plan\n\n- Go-live: 1 March\n- Owner: Cara', true],
  ]);
  // Editing her update again changes it where it is, still only for her.
  const again = await anas.call('remember', { updates: `item:${mine}`, edits: [{ old: 'Owner: Cara', new: 'Owner: Cara, with Jonas' }] });
  assert.equal(again.text, `Updated item:${mine}. What it said before is kept in its history. It's in Acme (space:${acme}), where that item is.`);
  assert.deepEqual((await pageAs(cara, plan)).items.map((entry) => [entry.id, entry.text]), [[shared, '# Launch plan\n\n- Go-live: 1 March\n- Owner: Cara']]);
  assert.doesNotMatch((await caras.call('read', { ref: `page:${plan}` })).text, /15 March|Jonas/);
});

/**
 * Runs change in a transaction held open until the assistant's call waits for it, as Ana's other
 * assistant changing the same item at the same moment. Returns the call's answer.
 */
async function meanwhile(change: (s: Parameters<Parameters<typeof as>[1]>[0]) => Promise<unknown>, call: () => Promise<{ text: string; failed: boolean }>) {
  let changed!: () => void, release!: () => void;
  const isChanged = new Promise<void>((resolve) => (changed = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const changing = as({ person: ana.id, agent: 'ChatGPT' }, async (s) => {
    await change(s);
    changed();
    await released;
  });
  await isChanged;
  const answer = call();
  try {
    await until(async () => (await admin`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%from content%for update%'`)[0].n > 0);
  } finally {
    release();
  }
  await changing;
  return answer;
}

test('a change made meanwhile is built on or refused, never undone', async () => {
  const { item, page } = await keepOutline('Outline, fourth draft');

  // ChatGPT rewrites slide 3 while Claude's edit of slide 5 waits: Claude's is made to ChatGPT's text, and both stand.
  const slide3 = outline.replace('- Search, with results ranked by section', '- Search, with results ranked by section and by date');
  const both = await meanwhile(
    (s) => updateItem(s, item, { body: slide3 }),
    () => anas.call('remember', { updates: `item:${item}`, edits: [{ old: 'Spent so far: 1.1 million NOK.', new: 'Spent so far: 1.2 million NOK.' }] }),
  );
  assert.ok(!both.failed, both.text);
  const now = slide3.replace('Spent so far: 1.1 million NOK.', 'Spent so far: 1.2 million NOK.');
  assert.deepEqual(await itemAsAna(page, item), { text: now, earlier: [outline, slide3] });

  // ChatGPT rewrites the very passage Claude edits: Claude's edit is refused, and ChatGPT's text stands.
  const rewritten = now.replace('- Hosting: 18,000 NOK a month from go-live.', '- Hosting: 21,000 NOK a month from February.');
  const refused = await meanwhile(
    (s) => updateItem(s, item, { body: rewritten }),
    () => anas.call('remember', { updates: `item:${item}`, edits: [{ old: '- Hosting: 18,000 NOK a month from go-live.', new: '- Hosting: 18,000 NOK a month.' }] }),
  );
  assert.deepEqual([refused.failed, refused.text], [true, `The text to replace isn't in item:${item}. It may have changed since you read it: read it again, and copy the text exactly, line breaks included. Nothing was changed.`]);
  assert.equal((await itemAsAna(page, item)).text, rewritten);

  // ChatGPT replaces something shared for Ana while Claude edits it too: Claude's waits, and is pointed to ChatGPT's.
  const { plan, shared } = await as({ person: cara.id, agent: 'Claude' }, async (s) => {
    const plan = await createPage(s, { spaceId: acme, title: 'Rollout plan', shared: true });
    return { plan, shared: (await writeItem(s, { pageId: plan, body: '# Rollout\n\n- Pilot: Bergen office\n- Then: everyone', shared: true })).id };
  });
  let chatgpts = '';
  const pointed = await meanwhile(
    async (s) => (chatgpts = (await supersedeItem(s, shared, { body: '# Rollout\n\n- Pilot: Oslo office\n- Then: everyone' }))!.id),
    () => anas.call('remember', { replaces: `item:${shared}`, edits: [{ old: 'Then: everyone', new: 'Then: everyone, by 1 May' }] }),
  );
  assert.deepEqual([pointed.failed, pointed.text], [true, `That item is no longer current. It was replaced by item:${chatgpts}.`]);
  assert.deepEqual((await pageAs(ana, plan)).items.map((entry) => [entry.id, entry.text]), [[chatgpts, '# Rollout\n\n- Pilot: Oslo office\n- Then: everyone']]);
});

test('reading a page shows each item’s Markdown as written', async () => {
  const page = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Deploying' });
    await writeItem(s, { pageId: page, body: 'Deploys go out on Tuesdays.' });
    await writeItem(s, { pageId: page, body: '## Steps\n\n1. Tag the release.\n2. Run it:\n\n```sh\nnpm run deploy\n```\n\nThen check the log.' });
    return page;
  });
  const read = (await anas.call('read', { ref: `page:${page}` })).text;
  // One line stays one line; longer Markdown comes between fences nothing in it can close.
  assert.match(read, /\n- Deploys go out on Tuesdays\. \(item:\S+, private, written by Ana through Claude\)\n/);
  assert.match(read, /\n- item:\S+, private, written by Ana through Claude:\n````markdown\n## Steps\n\n1\. Tag the release\.\n2\. Run it:\n\n```sh\nnpm run deploy\n```\n\nThen check the log\.\n````/);
});
