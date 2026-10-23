// Issue #115, how search splits a query into words: as PostgreSQL splits the notes it searches, so
// an identifier written in a request matches it written in a note. "BETA-881" is "BETA" and "-881"
// in a note, and "2.4.1" one word. Everything else is found as before: ordinary words, addresses,
// and what context picks a space by. Nothing in a query is read as an operator.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, search, tellingWords, termsOf, writeItem } from '../src/knowledge.ts';
import { startServer, type Homing } from '../src/server.ts';
import { createSpace } from '../src/spaces.ts';
import { Assistant, testAssistants } from './assistant.ts';
import { as, db, member, person, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;

before(async () => {
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
});

after(() => homing.close());

/** Ana's assistant in a new conversation, connected over OAuth after she allowed it. */
async function assistantOf(who: Member) {
  const assistant = new Assistant(homing.url);
  await assistant.connect(who.browser);
  return assistant.open();
}

/** Writes each page with its items, as Ana directly, shared in the space. */
async function write(who: { id: string }, spaceId: string, pages: Record<string, string[]>) {
  await as({ person: who.id, direct: true }, async (s) => {
    for (const [title, bodies] of Object.entries(pages)) {
      const page = await createPage(s, { spaceId, title, shared: true });
      for (const body of bodies) await writeItem(s, { pageId: page, body, shared: true });
    }
  });
}

test('search and context find identifiers as written', async () => {
  const ana = await member(homing.url, 'Ana');
  const acme = await as({ person: ana.id, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  // Each identifier has notes beside it that share part of it, which splitting it another way would
  // put first, and ones that start the same, which matching it by how it starts would put first.
  await write(ana, acme, {
    Tickets: ['BETA-881: the export times out for big spaces.', 'BETA-882: the logo is blurry on phones.', 'Beta has 881 users.', 'BETA-8812: the logo is blurry.'],
    Changelog: ['Release 2.4.1 fixed the export.', 'Release 2.1.4 changed the logo.', 'We need 2 to 4 people for 1 week.', 'Release 2.4.10 is out.'],
    Invoices: ['Faktura 2026-0417 fra Elkjøp er betalt.', 'Faktura 2026-0388 fra Elkjøp forfaller 1. november.', 'Kundenummer 0417, faktura 2026.'],
    Errors: ['Error E42 means the card reader is offline.', 'Error E4 means the printer is out of paper.'],
    Kontor: ['Møtet med Kari er i rom 101.', 'Rom 110 er stengt.'],
  });
  const claude = await assistantOf(ana);

  for (const [query, note] of [
    ['BETA-881', 'BETA-881: the export times out for big spaces.'],
    ['2.4.1', 'Release 2.4.1 fixed the export.'],
    ['release 2.4.1', 'Release 2.4.1 fixed the export.'],
    ['faktura 2026-0417', 'Faktura 2026-0417 fra Elkjøp er betalt.'],
    ['E42', 'Error E42 means the card reader is offline.'],
    ['rom 101', 'Møtet med Kari er i rom 101.'],
  ]) {
    const [first] = (await claude.call('search', { query })).text.split('\n');
    assert.ok(first.includes(`: ${note} (item:`), `"${query}" finds ${first} first`);
  }
  // A version is one word, written whole, so other versions with the same digits don't match.
  assert.doesNotMatch((await claude.call('search', { query: '2.4.1' })).text, /2\.1\.4|2 to 4|2\.4\.10/);

  // Context picks its words the same way: "2.4.1" was three short numbers, which tell nothing apart.
  const context = (await claude.call('context', { request: 'What about 2.4.1?' })).text;
  assert.match(context, /^Picked Acme, because it is the only space with matching knowledge or skills\./);
  assert.match(context, /Release 2\.4\.1 fixed the export\./);
  await claude.close();
});

test('ordinary words are found as before: longer ones by how they start, short ones whole, a hyphenated word by its parts', async () => {
  const ana = await person('Ana');
  const acme = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  await write(ana, acme, {
    Plans: ['Acme launches on 1 March', 'The board meets on 12 March', 'The go-live checklist goes out by e-post', 'Post the minutes on Monday'],
  });
  const found = (query: string) => as(ana, async (s) => (await search(s, query)).filter((hit) => hit.kind === 'item').map((hit) => hit.text).sort());

  assert.deepEqual(await found('launch'), ['Acme launches on 1 March']);
  assert.deepEqual(await found('1'), ['Acme launches on 1 March']);
  assert.deepEqual(await found('go-live'), ['The go-live checklist goes out by e-post']);
  assert.deepEqual(await found('e-post'), ['Post the minutes on Monday', 'The go-live checklist goes out by e-post']);
  // Only a query's first 32 words count.
  assert.deepEqual(await found(`${'x '.repeat(31)}board`), ['The board meets on 12 March']);
  assert.deepEqual(await found(`${'x '.repeat(32)}board`), []);
});

test('nothing in a query is read as an operator', async () => {
  const ana = await person('Ana');
  const acme = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  await write(ana, acme, { Launch: ['Acme launches on 1 March', 'The launch budget is 400,000 NOK', 'BETA-881 is fixed', 'The brief is on example.com'] });
  const found = (query: string) => as(ana, async (s) => (await search(s, query)).map((hit) => hit.id).sort());

  // "&", "!" and the rest of a search query's syntax are left out like any other punctuation, so
  // "!budget" still finds the budget, as "budget" does.
  const words = await found('launch budget');
  assert.equal(words.length, 3);
  for (const query of ['launch & !budget', '!launch | budget', '(launch) <-> budget:*', "'launch' \"budget\"", "launch' budget", 'launch\\ budget', 'launch:A budget:*B']) {
    assert.deepEqual(await found(query), words, query);
  }
  assert.deepEqual(await found('!BETA-881:*'), await found('BETA-881'));
  // A link's path with quotes and "&" in it is looked for by its letters and digits, as before, and the link is found.
  const [brief] = await found('example.com');
  assert.ok((await found("https://example.com/it's?a=1&b=!2")).includes(brief));
  for (const query of ['&', '!', "':*|()", '\\', '<->', '\0']) assert.deepEqual(await found(query), [], query);
});

test('a long link costs no more than other queries', async () => {
  const ana = await person('Ana');
  const link = `https://example.com/${"a?b=c&'".repeat(2800)}`;
  assert.ok(link.length > 19_000);
  // At most 32 words count, and an address as written beside them, however long the link.
  const nodes = await as(ana, async (s) => {
    const terms = await termsOf(s, link);
    assert.ok(terms);
    const [{ nodes }] = await s.tx<{ nodes: number }[]>`select numnode(to_tsquery('simple', ${terms})) as nodes`;
    return nodes;
  });
  assert.ok(nodes <= 127, `${nodes} nodes`);
});

test('an address, a path or a dotted name is found as written, and by its parts as before', async () => {
  const ana = await person('Ana');
  const acme = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  await write(ana, acme, {
    Notes: ['Mail ana@acme.no about the contract', 'Acme launches on 1 March', 'We moved the export to node.js', 'Node runs the export', 'The plan is in docs/plan.md'],
  });
  const found = (query: string) => as(ana, async (s) => (await search(s, query)).filter((hit) => hit.kind === 'item').map((hit) => hit.text).sort());

  assert.deepEqual(await found('ana@acme.no'), ['Acme launches on 1 March', 'Mail ana@acme.no about the contract']);
  assert.deepEqual(await found('node.js'), ['Node runs the export', 'We moved the export to node.js']);
  assert.deepEqual(await found('docs/plan.md'), ['The plan is in docs/plan.md']);
});

test('context picks no space from a date, a range or a phone number, as before, but does from an identifier', async () => {
  const ana = await member(homing.url, 'Ana');
  const { acme, tracker } = await as({ person: ana.id, direct: true }, async (s) => ({ acme: await createSpace(s, { name: 'Acme' }), tracker: await createSpace(s, { name: 'Tracker' }) }));
  await write(ana, acme, {
    'Steering group': [
      'Steering group 2025-10-14: 23 people attended, 2 came late. The rollout takes a month. Next time kl. 09.00, for 30 minutes.',
      'Phone the venue on +47 22 33 44 55 before 23.10.2025.',
    ],
  });
  await write(ana, tracker, { Tickets: ['BETA-881: the export times out for big spaces.'] });
  const claude = await assistantOf(ana);
  const context = async (request: string) => (await claude.call('context', { request })).text;

  // The 10 and 23 of a date, the 2 of "1-2" or the +47 of a phone number tell nothing apart, and a
  // time like 10.30 counts as one word, matched only where it's written whole.
  for (const request of [
    'Book a dentist appointment on 2026-10-23',
    "What's on 2026-10-23?",
    'Remind me to call mum on 2026-10-23 at 10:30',
    'Flight to Bergen 2027-10-23',
    '+47 900 11 222',
    'Bursdag 23.10',
  ]) {
    assert.match(await context(request), /^You are Ana\. Nothing in Homing matches this request\./, request);
  }
  for (const request of ['It takes 1-2 weeks to get a passport', 'Tannlege kl. 10.30']) {
    assert.match(await context(request), new RegExp(`^You are Ana\\. Choose the space[\\s\\S]*## Spaces that fit\\n- Acme \\(space:${acme}\\)\\n\\n`), request);
  }
  assert.match(await context('What about BETA-881?'), new RegExp(`^Picked Tracker, because it is the only space with matching knowledge or skills\\.[\\s\\S]*\\(space:${tracker}\\)`));
  await claude.close();

  // An address counts by its letters and digits, as before, and a short number only written straight onto a word.
  const telling = (text: string) => as(ana, (s) => tellingWords(s, text));
  assert.equal(await telling('Mail ana@acme.no about node.js'), 'Mail ana acme node js');
  assert.equal(await telling('NW-12 and COVID-19 on 2026-10-23, § 14-9, 1-2 weeks, +47 900 11 222'), 'NW -12 COVID -19 2026 weeks');
});
