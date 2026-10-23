// Issue #115, identifiers in a search: search looks for a query's words by letters and digits, as it
// always has, and besides them for what a note keeps whole, such as the "-881" of "BETA-881" or
// "2.4.1", as written. So it finds everything it found before, and first the note that has the
// identifier written the same way. Context, and everything else, works as before. Nothing in a
// query is read as an operator.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, search, termsOf, writeItem } from '../src/knowledge.ts';
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

test('search puts the note with an identifier written the same way first', async () => {
  const ana = await member(homing.url, 'Ana');
  const acme = await as({ person: ana.id, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  // Beside each note are others with an identifier that starts the same or shares a part.
  await write(ana, acme, {
    Tickets: ['BETA-881: the export times out for big spaces.', 'BETA-882: the logo is blurry on phones.', 'BETA-8812: the logo is blurry.'],
    Changelog: ['Release 2.4.1 fixed the export.', 'Release 2.1.4 changed the logo.', 'Release 2.4.10 is out.'],
    Invoices: ['Faktura 2026-0417 fra Elkjøp er betalt.', 'Faktura 2026-0388 fra Elkjøp forfaller 1. november.'],
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
  // A version is one word in a note, so other versions with the same digits don't match it.
  assert.doesNotMatch((await claude.call('search', { query: '2.4.1' })).text, /2\.1\.4|2\.4\.10/);
  await claude.close();
});

/** Search's terms as they were before #115: by letters and digits, the first 32, longer ones by how they start. */
function termsBefore(query: string): string | undefined {
  const words = query.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 32);
  return words ? words.map((word) => (word.length >= 4 ? `${word}:*` : word)).join(' | ') : undefined;
}

test('search looks for everything it looked for before, and only adds what a note keeps whole', async () => {
  const ana = await person('Ana');
  const terms = (query: string) => as(ana, (s) => termsOf(s, query));

  // Nothing a note keeps whole, so the same terms as before.
  for (const query of [
    'What is the launch date?',
    'Hva er det beste været i Bergen?',
    'Ærlig café naïve',
    'e-post go-live',
    'Remind me to call mum at 10:30',
    "Ana's notes, don't (lose) them!",
    'see /_ and ~_ and .. or ./_',
    `${'word '.repeat(40)}end`,
  ]) {
    assert.equal(await terms(query), termsBefore(query), query);
  }
  // Something a note keeps whole: the same terms, and it besides them.
  for (const [query, whole] of [
    ['BETA-881', "'-881'"],
    ['What did release 2.4.1 fix?', "'2.4.1'"],
    ['faktura 2026-0417', "'-0417'"],
    ['skoleåret 2025-2026', "'-2026'"],
    ['Bursdag 23.10.2026', "'23.10.2026'"],
    ['Book a dentist appointment on 2026-10-23', "'-10' | '-23'"],
    ['+47 900 11 222', "'+47'"],
    ['It takes 1-2 weeks', "'-2'"],
    ['§ 14-9', "'-9'"],
    ['Middag kl. 10.30', "'10.30'"],
    ['Tannlege 10.30-11.00', "'10.30' | '-11.00'"],
    ['kr 1.500', "'1.500'"],
    ['0.5 l', "'0.5'"],
    ['Mail ana@acme.no', "'ana@acme.no'"],
    ['node.js', "'node.js'"],
    ['https://example.com/a/b.c?x=1&y=2', "'example.com'"],
    ['docs/plan.md', "'docs/plan.md'"],
  ]) {
    assert.equal(await terms(query), `${termsBefore(query)} | ${whole}`, query);
  }
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

test('nothing in a query is read as an operator', async () => {
  const ana = await person('Ana');
  const acme = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  await write(ana, acme, {
    Launch: ['Acme launches on 1 March', 'The launch budget is 400,000 NOK', 'BETA-881 is fixed', 'The brief is on example.com', 'The plan is at http://y.no/a_bc'],
  });
  const found = (query: string) => as(ana, async (s) => (await search(s, query)).map((hit) => hit.id).sort());

  // "&", "!" and the rest of a search query's syntax are left out like any other punctuation, so
  // "!budget" still finds the budget, as "budget" does.
  const words = await found('launch budget');
  assert.equal(words.length, 3);
  for (const query of ['launch & !budget', '!launch | budget', '(launch) <-> budget:*', "'launch' \"budget\"", "launch' budget", 'launch\\ budget', 'launch:A budget:*B']) {
    assert.deepEqual(await found(query), words, query);
  }
  assert.deepEqual(await found('!BETA-881:*'), await found('BETA-881'));
  // In a link's path, they're part of what's looked for as written: "a_b:*" doesn't find "a_bc".
  for (const [query, without] of [
    ['http://x.no/a_b:*', 'http://x.no/a_b'],
    ['http://x.no/a_b!', 'http://x.no/a_b'],
    ['http://x.no/a_b(', 'http://x.no/a_b'],
    ['http://x.no/_!', 'http://x.no/_'],
    ['http://x.no/_(', 'http://x.no/_'],
    ["see http://example.com/_'&!", 'see http://example.com/_'],
  ]) {
    assert.deepEqual(await found(query), await found(without), query);
  }
  const [brief] = await found('example.com');
  assert.ok((await found("https://example.com/it's?a=1&b=!2")).includes(brief));
  for (const query of ['&', '!', "':*|()", '\\', '<->', '\0']) assert.deepEqual(await found(query), [], query);
});

test('however long a query, its search stays small', async () => {
  const ana = await person('Ana');
  for (const query of [
    '/_ '.repeat(6666),
    '~_ /_ .. /._ /__ ./_ '.repeat(900),
    `https://example.com/${"a?b=c&'".repeat(2800)}`,
    `https://example.com/${'a&/a'.repeat(5000)}`,
    Array.from({ length: 3000 }, (_, n) => `v${n}.no -${n}`).join(' '),
  ]) {
    assert.ok(query.length > 15_000);
    const nodes = await as(ana, async (s) => {
      const terms = await termsOf(s, query);
      if (!terms) return 0;
      const [{ nodes }] = await s.tx<{ nodes: number }[]>`select numnode(to_tsquery('simple', ${terms})) as nodes`;
      return nodes;
    });
    // At most 32 words, and 32 that a note keeps whole.
    assert.ok(nodes <= 127, `${query.slice(0, 20)}…: ${nodes} nodes`);
  }
});

test('context gives the same answer as before for times, prices, decimals and dates', async () => {
  const ana = await member(homing.url, 'Ana');
  const { acme, home } = await as({ person: ana.id, direct: true }, async (s) => ({ acme: await createSpace(s, { name: 'Acme' }), home: await createSpace(s, { name: 'Hjemme' }) }));
  await write(ana, acme, {
    'Steering group': [
      'Steering group 2025-10-14: 23 people attended, 2 came late. The rollout takes a month.',
      'Phone the venue on +47 22 33 44 55 before 23.10.2025.',
      'Standup hver dag kl. 10:30',
      'Ukemøte 10.30-11.00',
    ],
  });
  await write(ana, home, { Handleliste: ['Gave til Kari, kr 1.500', 'Kjøp 0.5 l melk', 'Bursdag 23.10.2025 hos mamma'] });
  const claude = await assistantOf(ana);
  const context = async (request: string) => (await claude.call('context', { request })).text;
  const nothing = /^You are Ana\. Nothing in Homing matches this request\./;
  const listed = (space: string) => new RegExp(`^You are Ana\\. Choose the space[\\s\\S]*## Spaces that fit\\n- [^\\n]+ \\(space:${space}\\)\\n\\n`);
  const picked = (name: string, space: string) => new RegExp(`^Picked ${name}, because it is the only space with matching knowledge or skills\\.[\\s\\S]*\\(space:${space}\\)`);

  // As on main: some of these pick a space, by the words they share with a note, but no time,
  // price, decimal or date makes one pick a space it didn't.
  for (const [request, answer] of [
    ['Middag kl. 10.30', listed(acme)],
    ['Tannlege 10.30-11.00', nothing],
    ['kr 1.500', picked('Hjemme', home)],
    ['0.5 l', picked('Hjemme', home)],
    ['Bursdag 23.10', picked('Hjemme', home)],
    ['Book a dentist appointment on 2026-10-23', nothing],
    ['Remind me to call mum on 2026-10-23 at 10:30', nothing],
    ['+47 900 11 222', nothing],
    ['It takes 1-2 weeks to get a passport', listed(acme)],
  ] as const) {
    assert.match(await context(request), answer, request);
  }
  await claude.close();
});
