// Includes (spec §2, issue #17): a space's guidance includes another space's
// rules, or a single skill, by link. It brings them in only for people who
// can open where they're set, never grants access, applies before the
// space's own rules, and only people change it.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Principal } from '../src/db.ts';
import { addInclude, addRule, editRule, includesIn, IncludeRefused, removeInclude, rulesFor } from '../src/guidance.ts';
import { createPage } from '../src/knowledge.ts';
import { removeSkill, saveSkill, skillsFor, skillsHere } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { admin, as, db, person, refused, type Person } from './helpers.ts';

const direct = (someone: Person) => ({ ...someone, direct: true as const });

/**
 * Ana runs Acme, a client, with her colleague Cara. Ana also keeps the
 * company's Standards with Dan, which Cara isn't in. Gunnar, from the
 * client, is in a closed workshop below Acme.
 */
async function company() {
  const [ana, cara, dan, gunnar] = [await person('Ana'), await person('Cara'), await person('Dan'), await person('Gunnar')];
  const spaces = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const workshop = await createSpace(s, { name: 'Workshop', parentId: acme, closed: true });
    await addMember(s, workshop, gunnar.id);
    const standards = await createSpace(s, { name: 'Standards' });
    await addMember(s, standards, dan.id);
    return { acme, workshop, standards };
  });
  await as(direct(ana), async (s) => {
    await addRule(s, { spaceId: spaces.standards, kind: 'requirement', body: 'Never send prices by email', shared: true });
    await addRule(s, { spaceId: spaces.standards, kind: 'preference', body: 'Write dates as 1 March 2027', shared: true });
    await addRule(s, { spaceId: spaces.standards, kind: 'preference', body: 'Log hours every Friday', shared: true, onlyHere: true });
    await addRule(s, { spaceId: spaces.standards, kind: 'preference', body: 'Ana signs off with her first name' });
  });
  await as(direct(dan), (s) => addRule(s, { spaceId: spaces.standards, kind: 'preference', body: 'Dan signs off with initials' }));
  return { ana, cara, dan, gunnar, ...spaces };
}

async function rulesSeenBy(principal: Principal, spaceId: string, sql = db) {
  return (await as(principal, (s) => rulesFor(s, spaceId), sql)).map((rule) => rule.body);
}

test('a space includes another space’s rules, only for those who can open it', async () => {
  const { ana, cara, dan, gunnar, acme, workshop, standards } = await company();
  await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }));

  // Ana gets what Standards shares and her own rules there, never the ones only for Standards,
  // and never Dan's own.
  for (const sql of [db, admin]) {
    assert.deepEqual(await rulesSeenBy(ana, acme, sql), ['Never send prices by email', 'Write dates as 1 March 2027', 'Ana signs off with her first name']);
    // Cara can't open Standards, so she gets nothing from it, and doesn't see that it's included.
    assert.deepEqual(await rulesSeenBy(cara, acme, sql), []);
    assert.deepEqual(await as(cara, (s) => includesIn(s, acme), sql), []);
    // Nor does Gunnar below, who can't open it either.
    assert.deepEqual(await rulesSeenBy(gunnar, workshop, sql), []);
  }
  // Straight against the database, Cara and Gunnar can't see the include at all.
  for (const someone of [cara, gunnar]) assert.equal((await as(someone, (s) => s.tx`select from includes`)).length, 0);

  // Once Dan is in Acme, he gets it there too, with his own rule in Standards instead of Ana's.
  await as(ana, (s) => addMember(s, acme, dan.id));
  assert.deepEqual(await rulesSeenBy(dan, acme), ['Never send prices by email', 'Write dates as 1 March 2027', 'Dan signs off with initials']);

  // It's a link: a change in Standards shows up in Acme at once.
  const [dates] = (await as(ana, (s) => rulesFor(s, acme))).filter((rule) => rule.body.startsWith('Write dates'));
  await as(direct(ana), (s) => editRule(s, dates.id, 'Write dates as 2027-03-01'));
  assert.deepEqual(await rulesSeenBy(dan, acme), ['Never send prices by email', 'Write dates as 2027-03-01', 'Dan signs off with initials']);

  // Each included rule says where it's set and which include brings it.
  const [first] = await as(ana, (s) => rulesFor(s, acme));
  assert.deepEqual([first.spaceName, first.includedIn?.spaceName, first.includedIn?.shared], ['Standards', 'Acme', true]);

  // Gunnar, once he can open Standards, gets it in the workshop, where Acme's guidance reaches,
  // without learning Acme's name.
  await as(ana, (s) => addMember(s, standards, gunnar.id));
  const below = await as(gunnar, (s) => rulesFor(s, workshop));
  assert.deepEqual(below.map((rule) => [rule.spaceName, rule.includedIn?.spaceName ?? null, rule.body]), [
    ['Standards', null, 'Never send prices by email'],
    ['Standards', null, 'Write dates as 2027-03-01'],
  ]);
});

test('included rules come after the ones inherited and before the space’s own', async () => {
  const { ana, acme, standards } = await company();
  const website = await as(ana, (s) => createSpace(s, { name: 'Website', parentId: acme }));
  const group = await as(ana, (s) => createSpace(s, { name: 'Group' }));
  await as(direct(ana), async (s) => {
    await addRule(s, { spaceId: website, kind: 'preference', body: 'Website: link the style guide', shared: true });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Ana keeps Acme notes short' });
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Acme: write dates as 2027-03-01', shared: true });
    await addRule(s, { spaceId: group, kind: 'preference', body: 'Group: answer in English', shared: true });
    await addRule(s, { spaceId: ana.personalSpaceId, kind: 'preference', body: 'Keep answers short' });
    // Included out of order: the group for Ana alone, then Standards for everyone.
    await addInclude(s, { spaceId: acme, included: { space: group } });
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true });
  });

  const rules = await as(ana, (s) => rulesFor(s, website));
  assert.deepEqual(rules.map((rule) => [rule.includedIn ? `included in ${rule.includedIn.spaceName}` : rule.spaceName, rule.body]), [
    ['Personal', 'Keep answers short'],
    // At Acme's level: what's included for everyone, then what's only Ana's, then Acme's own.
    ['included in Acme', 'Never send prices by email'],
    ['included in Acme', 'Write dates as 1 March 2027'],
    ['included in Acme', 'Group: answer in English'],
    ['included in Acme', 'Ana signs off with her first name'],
    ['Acme', 'Acme: write dates as 2027-03-01'],
    ['Acme', 'Ana keeps Acme notes short'],
    ['Website', 'Website: link the style guide'],
  ]);
  // A requirement still applies, wherever it comes from.
  assert.equal(rules.find((rule) => rule.body === 'Never send prices by email')?.kind, 'requirement');
});

test('spaces that include each other each get the other’s rules once, and nothing loops', async () => {
  const { ana, acme, standards } = await company();
  await as(direct(ana), async (s) => {
    await addRule(s, { spaceId: acme, kind: 'preference', body: 'Acme: write dates as 2027-03-01', shared: true });
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true });
    await addInclude(s, { spaceId: standards, included: { space: acme }, shared: true });
  });

  // An include brings the rules set in that space, not what it includes, so a circle stops at one step.
  assert.deepEqual(await rulesSeenBy(ana, acme), [
    'Never send prices by email',
    'Write dates as 1 March 2027',
    'Ana signs off with her first name',
    'Acme: write dates as 2027-03-01',
  ]);
  assert.deepEqual(await rulesSeenBy(ana, standards), [
    'Acme: write dates as 2027-03-01',
    'Never send prices by email',
    'Write dates as 1 March 2027',
    'Log hours every Friday',
    'Ana signs off with her first name',
  ]);

  // A space below that also includes Standards gets each rule once, where it's most specific.
  const website = await as(ana, (s) => createSpace(s, { name: 'Website', parentId: acme }));
  await as(direct(ana), (s) => addInclude(s, { spaceId: website, included: { space: standards }, shared: true }));
  const rules = await as(ana, (s) => rulesFor(s, website));
  assert.deepEqual(rules.map((rule) => [rule.includedIn?.spaceName ?? rule.spaceName, rule.body]), [
    ['Acme', 'Acme: write dates as 2027-03-01'],
    ['Website', 'Never send prices by email'],
    ['Website', 'Write dates as 1 March 2027'],
    ['Website', 'Ana signs off with her first name'],
  ]);

  // Nothing includes its own guidance, or guidance that already applies there.
  for (const [spaceId, space] of [[acme, acme], [website, acme], [acme, ana.personalSpaceId], [website, standards]]) {
    await assert.rejects(as(direct(ana), (s) => addInclude(s, { spaceId, included: { space }, shared: spaceId !== space && space !== ana.personalSpaceId })), IncludeRefused);
  }
  // Straight against the database, a space can't include itself either.
  await assert.rejects(as(direct(ana), (s) => s.tx`insert into includes (space_id, space_included) values (${acme}, ${acme})`), { code: '23514' });
});

test('an include only for you brings rules only you get, and follows you from your personal space', async () => {
  const { ana, cara, acme, standards } = await company();
  const writing = await as(ana, (s) => createSpace(s, { name: 'Writing', parentId: ana.personalSpaceId }));
  await as(direct(ana), async (s) => {
    await addRule(s, { spaceId: writing, kind: 'preference', body: 'Ana writes in a dry tone' });
    await addInclude(s, { spaceId: acme, included: { space: writing } });
  });
  // A space only Ana has can't be included for everyone.
  await assert.rejects(as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: writing }, shared: true })), IncludeRefused);
  await assert.rejects(
    as(direct(ana), (s) => s.tx`insert into includes (space_id, space_included) values (${acme}, ${writing})`),
    { code: '23514' },
  );

  assert.deepEqual(await rulesSeenBy(ana, acme), ['Ana writes in a dry tone']);
  assert.deepEqual(await rulesSeenBy(cara, acme), []);
  // Cara can't see Ana's include, even if she could open what it points to.
  await as(ana, (s) => addMember(s, standards, cara.id));
  await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: standards } }));
  assert.deepEqual(await rulesSeenBy(cara, acme), []);
  assert.equal((await as(cara, (s) => s.tx`select from includes`)).length, 0);

  // Included in Ana's personal space, Standards' rules follow her everywhere, as the least specific.
  const beta = await as(ana, (s) => createSpace(s, { name: 'Beta' }));
  await as(direct(ana), (s) => addInclude(s, { spaceId: ana.personalSpaceId, included: { space: standards } }));
  const rules = await as(ana, (s) => rulesFor(s, beta));
  assert.deepEqual(rules.map((rule) => [rule.includedIn?.personal, rule.body]), [
    [true, 'Never send prices by email'],
    [true, 'Write dates as 1 March 2027'],
    [true, 'Ana signs off with her first name'],
  ]);
});

test('an included skill counts where it’s included, and one set there with its name wins', async () => {
  const { ana, cara, standards } = await company();
  // A group with a client in it, where Cara works too, but she can't open Standards.
  const { group, client, website } = await as(ana, async (s) => {
    const group = await createSpace(s, { name: 'Group' });
    await addMember(s, group, cara.id);
    const client = await createSpace(s, { name: 'Client', parentId: group });
    return { group, client, website: await createSpace(s, { name: 'Website', parentId: client }) };
  });
  const skill = (name: string, description: string) => [{ path: 'SKILL.md', body: `---\nname: ${name}\ndescription: ${description}\n---\n\nSteps.\n` }];
  const { report, groups } = await as(direct(ana), async (s) => {
    const groups = await saveSkill(s, { spaceId: group, files: skill('status-report', 'The group’s report'), shared: true });
    const report = await saveSkill(s, { spaceId: standards, files: skill('status-report', 'The standard report'), shared: true });
    const review = await saveSkill(s, { spaceId: standards, files: skill('code-review', 'How to review code'), shared: true });
    await addInclude(s, { spaceId: client, included: { skill: report.pageId }, shared: true });
    await addInclude(s, { spaceId: client, included: { skill: review.pageId }, shared: true });
    return { report, groups };
  });

  // In the client and below, the included report replaces the group's, and the review comes along.
  for (const space of [client, website]) {
    const skills = await as(ana, (s) => skillsFor(s, space));
    assert.deepEqual(skills.map((one) => [one.name, one.description, one.includedIn?.spaceName ?? null]), [
      ['code-review', 'How to review code', 'Client'],
      ['status-report', 'The standard report', 'Client'],
    ]);
  }
  // Cara can't open Standards: she keeps the group's report, and gets no review.
  assert.deepEqual((await as(cara, (s) => skillsFor(s, client))).map((one) => one.description), ['The group’s report']);

  // A report set in Website itself wins over the included one.
  await as(direct(ana), (s) => saveSkill(s, { spaceId: website, files: skill('status-report', 'Website’s own report'), shared: true }));
  const here = await as(ana, (s) => skillsHere(s, website));
  assert.deepEqual(here.map((one) => [one.description, one.used]), [
    ['How to review code', true],
    ['Website’s own report', true],
    ['The standard report', false],
    ['The group’s report', false],
  ]);
  assert.equal(here[1].others[0].pageId, report.pageId);

  // A skill from a space above already applies, so it isn't included again.
  await assert.rejects(as(direct(ana), (s) => addInclude(s, { spaceId: website, included: { skill: groups.pageId }, shared: true })), IncludeRefused);
});

test('only people change includes, and shared ones only the space’s admins', async () => {
  const { ana, cara, acme, standards } = await company();
  await as(ana, (s) => addMember(s, standards, cara.id));
  const include = { spaceId: acme, included: { space: standards }, shared: true };
  // Ana's assistant, even one marked as editing directly, and Ana when she isn't editing directly.
  for (const someone of [{ ...ana, agent: 'Claude Code' }, { ...direct(ana), agent: 'Claude Code' }, ana]) {
    await assert.rejects(as(someone, (s) => addInclude(s, include)), refused);
  }
  // Cara is a member of Acme: she includes Standards for herself, not for everyone.
  await assert.rejects(as(direct(cara), (s) => addInclude(s, include)), IncludeRefused);
  await assert.rejects(as(direct(cara), (s) => s.tx`insert into includes (space_id, space_included) values (${acme}, ${standards})`), refused);
  const own = await as(direct(cara), (s) => addInclude(s, { ...include, shared: false }));

  const shared = await as(direct(ana), (s) => addInclude(s, include));
  await assert.rejects(as(direct(cara), (s) => removeInclude(s, shared.id, acme)), refused);
  assert.equal(await as(direct(ana), (s) => removeInclude(s, own.id, acme)), false);
  await assert.rejects(as({ ...direct(ana), agent: 'Claude Code' }, (s) => removeInclude(s, shared.id, acme)), refused);

  // Removing it stops it everywhere, and keeps who removed it.
  assert.equal(await as(direct(ana), (s) => removeInclude(s, shared.id, acme)), true);
  assert.deepEqual(await rulesSeenBy(ana, acme), []);
  const [kept] = await admin`select removed_by, removed_at is not null as removed from includes where id = ${shared.id}`;
  assert.deepEqual(kept, { removedBy: ana.id, removed: true });
  // Once removed, it stays removed.
  await assert.rejects(as(direct(ana), (s) => s.tx`update includes set removed_at = null where id = ${shared.id}`), { code: '23514' });
});

test('an include for everyone and one only for you of the same thing don’t hide each other', async () => {
  const { ana, cara, acme, standards } = await company();
  await as(ana, (s) => addMember(s, standards, cara.id));
  const skill = await as(direct(ana), (s) =>
    saveSkill(s, { spaceId: standards, files: [{ path: 'SKILL.md', body: '---\nname: invoice\ndescription: How we send invoices\n---\n' }], shared: true }),
  );
  // Cara includes Standards and its skill for herself first, and Ana for herself.
  const caras = await as(direct(cara), async (s) => [
    await addInclude(s, { spaceId: acme, included: { space: standards } }),
    await addInclude(s, { spaceId: acme, included: { skill: skill.pageId } }),
  ]);
  const anas = await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: standards } }));

  // Included for everyone, Ana's own include of it goes, and Cara's waits while that one is there.
  const shared = await as(direct(ana), async (s) => [
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }),
    await addInclude(s, { spaceId: acme, included: { skill: skill.pageId }, shared: true }),
  ]);
  assert.deepEqual((await admin`select removed_by from includes where id = ${anas.id}`).map((row) => row.removedBy), [ana.id]);
  assert.deepEqual((await as(ana, (s) => includesIn(s, acme))).map((include) => include.id), shared.map((include) => include.id));
  assert.deepEqual(
    (await as(cara, (s) => includesIn(s, acme))).map((include) => [include.id, include.waiting]),
    [...shared.map((include) => [include.id, false]), ...caras.map((include) => [include.id, true])],
  );
  for (const someone of [ana, cara]) {
    const rules = await as(someone, (s) => rulesFor(s, acme));
    assert.deepEqual(rules.map((rule) => [rule.includedIn?.id, rule.body]).filter(([, body]) => !body?.includes('signs off')), [
      [shared[0].id, 'Never send prices by email'],
      [shared[0].id, 'Write dates as 1 March 2027'],
    ]);
    assert.deepEqual((await as(someone, (s) => skillsHere(s, acme))).map((one) => one.includedIn?.id), [shared[1].id]);
  }
  // Nobody includes it again only for themselves while it's there for everyone.
  await assert.rejects(as(direct(cara), (s) => addInclude(s, { spaceId: acme, included: { space: standards } })), IncludeRefused);

  // Once Ana stops including it for everyone, Cara's own applies again.
  for (const include of shared) assert.equal(await as(direct(ana), (s) => removeInclude(s, include.id, acme)), true);
  assert.deepEqual((await as(cara, (s) => includesIn(s, acme))).map((include) => include.id), caras.map((include) => include.id));
  assert.deepEqual((await as(cara, (s) => skillsHere(s, acme))).map((one) => [one.includedIn?.id, one.includedIn?.shared]), [[caras[1].id, false]]);
});

test('including what you can’t open is refused the same way, whatever it is', async () => {
  const { ana, acme, standards } = await company();
  const ben = await person('Ben');
  const beta = await as(ben, (s) => createSpace(s, { name: 'Beta' }));
  const writing = await as(ana, (s) => createSpace(s, { name: 'Writing', parentId: ana.personalSpaceId }));
  const { page, skill } = await as(direct(ana), async (s) => ({
    page: await createPage(s, { spaceId: acme, title: 'Pricing', shared: true }),
    skill: (await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: '---\nname: pricing\ndescription: How we price\n---\n' }], shared: true })).pageId,
  }));
  // A space, someone's personal space, one in their personal tree, a space that doesn't exist, a
  // page that isn't a skill, a skill, and a page that doesn't exist.
  const targets = [
    ['space_included', acme], ['space_included', standards], ['space_included', ana.personalSpaceId], ['space_included', writing], ['space_included', randomUUID()],
    ['skill_included', page], ['skill_included', skill], ['skill_included', randomUUID()],
  ] as const;
  const answers = new Set<string>();
  for (const [column, id] of targets) {
    for (const privateTo of [null, ben.id]) {
      const error = await as({ ...ben, direct: true }, (s) => s.tx`insert into includes (space_id, private_to, ${s.tx(column)}) values (${beta}, ${privateTo}, ${id})`).then(
        () => undefined,
        (failed: { code: string; message: string }) => failed,
      );
      assert.ok(error, `${column} ${id}`);
      answers.add(`${error.code} ${error.message}`);
    }
  }
  assert.deepEqual([...answers], ['42501 that can\'t be included']);
});

test('a space’s admins see only that it includes something they can’t open, and can stop it', async () => {
  const { ana, cara, acme, standards } = await company();
  const jon = await person('Jon');
  await as(ana, (s) => addMember(s, acme, jon.id, 'admin'));
  const include = await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }));

  // Jon, an admin who can't open Standards, learns that it's there, who added it and when, and nothing more.
  const seen = await as(jon, (s) => s.tx`select * from includes_not_open(${acme}::uuid)`);
  assert.deepEqual(seen.map((row) => Object.keys(row).sort()), [['addedAt', 'addedBy', 'id', 'importedAdder', 'kind']]);
  assert.deepEqual(seen.map((row) => [row.id, row.kind, row.addedBy, row.importedAdder]), [[include.id, 'rules', ana.id, null]]);
  assert.doesNotMatch(JSON.stringify([...seen]), new RegExp(standards));
  // Cara, a member, and Ana, who can open it, get nothing from it.
  for (const someone of [cara, ana]) assert.equal((await as(someone, (s) => s.tx`select from includes_not_open(${acme}::uuid)`)).length, 0);
  assert.equal(await as(direct(cara), (s) => removeInclude(s, include.id, acme)), false);
  // Only Jon himself, directly, stops it.
  await assert.rejects(as({ ...jon, agent: 'Claude' }, (s) => s.tx`select stop_including(${include.id}::uuid, ${acme}::uuid)`), refused);
  assert.equal(await as({ ...jon, direct: true }, (s) => removeInclude(s, include.id, acme)), true);
  assert.deepEqual(await rulesSeenBy(ana, acme), []);
  assert.deepEqual((await admin`select removed_by from includes where id = ${include.id}`).map((row) => row.removedBy), [jon.id]);
});

test('between two spaces included for everyone, the reader’s own rules come after both', async () => {
  const { ana, acme, standards } = await company();
  const brand = await as(ana, (s) => createSpace(s, { name: 'Brand' }));
  await as(direct(ana), async (s) => {
    await addRule(s, { spaceId: standards, kind: 'preference', body: 'Ana uses Oxford commas' });
    await addRule(s, { spaceId: brand, kind: 'preference', body: 'Never use Oxford commas', shared: true });
    await addInclude(s, { spaceId: acme, included: { space: standards }, shared: true });
    await addInclude(s, { spaceId: acme, included: { space: brand }, shared: true });
  });
  // Her own preference is more specific than both spaces' shared ones, so it comes last.
  assert.deepEqual(await rulesSeenBy(ana, acme), [
    'Never send prices by email',
    'Write dates as 1 March 2027',
    'Never use Oxford commas',
    'Ana signs off with her first name',
    'Ana uses Oxford commas',
  ]);
});

test('guidance that applies through a closed space above isn’t included again', async () => {
  const { ana, cara } = await company();
  // Cara is in a project under a closed client space under Group; she can open Group and the project, not the client.
  const { group, project } = await as(ana, async (s) => {
    const group = await createSpace(s, { name: 'Group' });
    await addMember(s, group, cara.id);
    const client = await createSpace(s, { name: 'Client', parentId: group, closed: true });
    const project = await createSpace(s, { name: 'Project', parentId: client });
    await addMember(s, project, cara.id);
    return { group, project };
  });
  await assert.rejects(as(direct(cara), (s) => addInclude(s, { spaceId: project, included: { space: group } })), IncludeRefused);
});

test('a removed skill’s include is left for an admin to stop, and nothing else of it shows', async () => {
  const { ana, cara, acme, standards } = await company();
  await as(ana, (s) => addMember(s, standards, cara.id));
  const skill = await as(direct(ana), (s) =>
    saveSkill(s, { spaceId: standards, files: [{ path: 'SKILL.md', body: '---\nname: invoice\ndescription: How we send invoices\n---\n' }], shared: true }),
  );
  const include = await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { skill: skill.pageId }, shared: true }));
  await as(direct(ana), (s) => removeSkill(s, skill.pageId));
  assert.deepEqual(await as(cara, (s) => includesIn(s, acme)), []);
  // Ana, an admin, sees that something is still included, and stops it.
  assert.deepEqual((await as(ana, (s) => s.tx`select id, kind from includes_not_open(${acme}::uuid)`)).map((row) => [row.id, row.kind]), [[include.id, 'skill']]);
  assert.equal(await as(direct(ana), (s) => removeInclude(s, include.id, acme)), true);
});

test('admins see nothing of someone’s own include, and an include is removed only from its own space', async () => {
  const { ana, cara, acme, standards } = await company();
  const jon = await person('Jon');
  await as(ana, async (s) => {
    await addMember(s, acme, jon.id, 'admin');
    await addMember(s, standards, cara.id);
  });
  const caras = await as(direct(cara), (s) => addInclude(s, { spaceId: acme, included: { space: standards } }));
  // Jon, an admin who can't open Standards, sees nothing of Cara's own include.
  assert.equal((await as(jon, (s) => s.tx`select from includes_not_open(${acme}::uuid)`)).length, 0);
  assert.deepEqual(await as(jon, (s) => includesIn(s, acme)), []);

  // A shared include in Acme can't be removed as if it were in another space Ana looks after.
  const beta = await as(ana, (s) => createSpace(s, { name: 'Beta' }));
  const shared = await as(direct(ana), (s) => addInclude(s, { spaceId: acme, included: { space: standards }, shared: true }));
  assert.equal(await as(direct(ana), (s) => removeInclude(s, shared.id, beta)), false);
  // Nor proposed for removal there, straight against the database.
  await assert.rejects(
    as({ ...ana, agent: 'Claude' }, (s) => s.tx`insert into proposals (space_id, private_to, action, include_id, change) values (${beta}, ${ana.id}, 'remove include', ${shared.id}, '{}')`),
    refused,
  );
  // Cara's own now waits, marked so for her, while Acme includes Standards for everyone.
  assert.deepEqual((await as(cara, (s) => includesIn(s, acme))).map((include) => [include.id, include.waiting]), [[shared.id, false], [caras.id, true]]);
});

test('a proposal to include something says only whether it’s for everyone, and rules or a skill', async () => {
  const { ana, acme, standards } = await company();
  const [proposal] = await as({ ...ana, agent: 'Claude' }, (s) => s.tx`
    insert into proposals (space_id, private_to, action, change)
    values (${acme}, ${ana.id}, 'add include', ${s.tx.json({ shared: true, included: { space: standards }, text: 'Hello' })})
    returning change
  `);
  assert.deepEqual(proposal.change, { shared: true, what: 'rules' });
});
