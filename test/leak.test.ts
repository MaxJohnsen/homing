// The leak test, for guarantee 2: nothing crosses between clients.
//
// Ana works for Acme and Ben for Beta. Each has a page of knowledge on their
// client's shared side, a private note on it that cites an email and has an
// earlier version, notes in their personal space, a shared and a private
// rule for their client, a skill, a rule their assistant proposed and
// they haven't decided yet, and their work mailbox connected in their client's
// space, only for them. Each tries to read and
// change the other's, in three ways: through Homing, through Homing with
// row-level security off, and straight against the database with Homing's
// filters bypassed. So each layer is shown to refuse on its own. Then two
// people signed in to the app try the same through its endpoints, and a
// colleague in the same space looks for what's private to someone else,
// including what someone did with a page while it was theirs alone.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { accessToken, ConnectionUnusable, connectionsOf, placesIn, removePlace, revokeConnection } from '../src/connections.ts';
import { AccessDenied, authDatabaseUrl, type Session } from '../src/db.ts';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { exportSpace, manifestOf } from '../src/export.ts';
import { workFolder } from '../src/import.ts';
import { addInclude, addRule, editRule, IncludeRefused, includesIn, removeRule, rulesFor } from '../src/guidance.ts';
import {
  addSource,
  archivePage,
  createPage,
  gather,
  listPages,
  pagesIn,
  publishItem,
  readItem,
  readPage,
  search,
  sourcesIn,
  sourceView,
  spaceOfPage,
  supersedeItem,
  updateItem,
  writeItem,
  writeOverview,
  type Item,
  type Source,
} from '../src/knowledge.ts';
import { decide, openProposals, proposalData, proposeInclude, proposePageArchive, proposeRule, readProposal, searchProposals, Undecidable, type PlanStep, type Proposal } from '../src/proposals.ts';
import { saveSkill, skillsFor, skillsMatching } from '../src/skills.ts';
import { addTask, readTask, searchTasks } from '../src/tasks.ts';
import { startServer, type Homing } from '../src/server.ts';
import { makeCollaborative } from '../src/share-space.ts';
import { addMember, createSpace, listSpaces, peopleNames } from '../src/spaces.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { admin, as, authDb, db, importAgain, importInto, member, person, refused, type Member, type Person } from './helpers.ts';
import { inTestDatabase } from './reset.ts';
import { vault } from '../src/vault.ts';

interface Client {
  name: string;
  person: Person;
  space: string;
  pages: string[];
  items: Item[];
  rules: Item[];
  skill: { pageId: string; name: string };
  source: Source;
  proposal: Proposal;
  /** The space's task and one only the person has. */
  tasks: string[];
  /** Their work mailbox, connected in the client's space only for them. */
  connection: { id: string; place: string; address: string };
}

let acme: Client;
let beta: Client;

before(async () => {
  acme = await client('Acme', 'Ana', {
    shared: 'Acme launches on 1 March',
    draft: 'Ana thinks the launch is on track',
    private: 'Ana thinks the launch will slip',
    email: 'Gunnar says the launch date is not final',
    personal: 'Ana has a dentist appointment on Friday',
    rule: 'Never send Acme prices by email',
    privateRule: 'Ana writes Acme reports in Norwegian',
    skill: 'acme-status-report',
    proposed: 'Write Acme reports in Norwegian',
  });
  beta = await client('Beta', 'Ben', {
    shared: 'Beta’s budget is approved',
    draft: 'Ben expects the budget to hold',
    private: 'Ben expects budget cuts in May',
    email: 'Finance wants to revisit the budget',
    personal: 'Ben picks up the kids on Thursdays',
    rule: 'Copy Beta’s CFO on every invoice',
    privateRule: 'Ben keeps Beta updates short',
    skill: 'beta-budget-review',
    proposed: 'Send Beta invoices in euros',
  });
});

// Both directions, so neither client is special.
const attempts = () => [
  { intruder: beta, target: acme },
  { intruder: acme, target: beta },
];

for (const [layer, sql] of [
  ['through Homing', db],
  ['through Homing, with row-level security off', admin],
] as const) {
  describe(layer, () => {
    test('nobody sees another client’s spaces, pages or items', async () => {
      for (const { intruder, target } of attempts()) {
        await as(intruder.person, async (s) => {
          const spaces = await listSpaces(s);
          assert.ok(!spaces.some((space) => space.id === target.space));
          for (const space of [target.space, target.person.personalSpaceId]) {
            assert.equal((await listPages(s, space)).length, 0);
            assert.deepEqual(await pagesIn(s, space, { query: 'launch' }), { pages: [], total: 0, all: 0, types: [], archived: 0 });
            assert.deepEqual(await sourcesIn(s, space), { sources: [], total: 0, all: 0 });
          }
          assert.equal(await sourceView(s, target.source.id), undefined);
          for (const page of target.pages) {
            assert.equal(await readPage(s, page), undefined);
            assert.equal(await spaceOfPage(s, page), undefined);
          }
          for (const item of target.items) assert.equal(await readItem(s, item.id), undefined);
          for (const task of target.tasks) assert.equal(await readTask(s, task), undefined);
          assert.equal((await peopleNames(s, [target.person.id])).size, 0);
        }, sql);
      }
    });

    test('nobody finds another client’s knowledge in search', async () => {
      for (const { intruder, target } of attempts()) {
        const own = [intruder.space, intruder.person.personalSpaceId];
        for (const text of [...bodies(target.items), target.source.excerpt]) {
          const hits = await as(intruder.person, (s) => search(s, text), sql);
          assert.deepEqual(hits.filter((hit) => !own.includes(hit.spaceId)), []);
        }
        // Nor their tasks, or the proposals waiting for them: only the intruder's own, which share some words.
        for (const text of [`${target.name}: book the venue`, `${target.name}: call the lawyer`]) {
          const tasks = await as(intruder.person, (s) => searchTasks(s, text), sql);
          assert.deepEqual(tasks.map((task) => task.id).sort(), [...intruder.tasks].sort(), text);
        }
        const waiting = await as(intruder.person, (s) => searchProposals(s, target.proposal.change.text!), sql);
        assert.deepEqual(waiting.map((proposal) => proposal.id), [intruder.proposal.id]);
      }
    });

    test('nobody writes to another client’s space', async () => {
      for (const { intruder, target } of attempts()) {
        const me = intruder.person;
        const [page] = target.pages;
        for (const shared of [true, false]) {
          await assert.rejects(as(me, (s) => writeItem(s, { pageId: page, body: 'Hello', shared }), sql), AccessDenied);
          await assert.rejects(as(me, (s) => createPage(s, { spaceId: target.space, title: 'Hello', shared }), sql), AccessDenied);
          await assert.rejects(as(me, (s) => addSource(s, { spaceId: target.space, excerpt: 'Hello', shared }), sql), AccessDenied);
        }
        // Not even by citing the other client's source in their own notes.
        await assert.rejects(
          as(me, (s) => writeItem(s, { pageId: intruder.pages[0], body: 'Hello', sources: [target.source.id] }), sql),
          AccessDenied,
        );
        // Nor by carrying the other client's sources over to their own notes, or theirs to the other client's.
        const notes = intruder.items.find((item) => item.privateTo === me.id)!.id;
        for (const item of target.items) {
          await as(me, (s) => s.tx`select carry_citations(${item.id}::uuid, ${notes}::uuid), carry_citations(${notes}::uuid, ${item.id}::uuid)`, sql);
        }
        const carried = await admin`
          select from citations ci join content c on c.id = ci.content_id join sources src on src.id = ci.source_id
          where ci.content_id in ${admin([notes, ...target.items.map((item) => item.id)])} and src.space_id <> c.space_id
        `;
        assert.equal(carried.length, 0);
      }
    });

    test('nobody changes another client’s items', async () => {
      for (const { intruder, target } of attempts()) {
        for (const item of target.items) {
          assert.equal(await as(intruder.person, (s) => updateItem(s, item.id, { body: 'Changed' }), sql), undefined);
          assert.equal(await as(intruder.person, (s) => supersedeItem(s, item.id, { body: 'Changed' }), sql), undefined);
          // Nor share it, even as a person editing directly.
          await assert.rejects(as({ ...intruder.person, direct: true }, (s) => s.tx`select publish_item(${item.id}::uuid, ${item.body})`, sql), refused);
        }
      }
      await assertUntouched();
    });

    test('nobody gives themselves access to another client, or renames its spaces', async () => {
      for (const { intruder, target } of attempts()) {
        const me = intruder.person;
        await assert.rejects(as(me, (s) => addMember(s, target.space, me.id), sql), refused);
        await assert.rejects(as(me, (s) => createSpace(s, { name: 'Way in', parentId: target.space }), sql), refused);
        await assert.rejects(as(me, (s) => s.tx`select rename_space(${target.space}::uuid, 'Way in')`, sql), refused);
        // Nor move the other client's space, or anyone's personal space, as their own.
        await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`select make_collaborative(${target.space}::uuid, null, false)`, sql), refused);
        await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`select make_collaborative(${target.person.personalSpaceId}::uuid, null, false)`, sql), refused);
        await assert.rejects(as(me, (s) => s.tx`select rename_space(${target.person.personalSpaceId}::uuid, 'Way in')`, sql), refused);
        // Nor archive it.
        await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`select archive_space(${target.space}::uuid, true)`, sql), refused);
      }
      assert.equal((await admin`select name from spaces where name = 'Way in'`).length, 0);
    });

    test('nobody finds, uses or removes another client’s connections', async () => {
      for (const { intruder, target } of attempts()) {
        const me = intruder.person;
        await as(me, async (s) => {
          assert.deepEqual(await placesIn(s, target.space), []);
          assert.deepEqual((await placesIn(s, intruder.space)).map((place) => place.id), [intruder.connection.place]);
          assert.deepEqual((await connectionsOf(s)).map((connection) => connection.address), [intruder.connection.address]);
        }, sql);
        await as({ ...me, direct: true }, async (s) => {
          assert.equal(await removePlace(s, target.connection.place), false);
          assert.equal(await revokeConnection(s, target.connection.id), false);
        }, sql);
        await assert.rejects(
          accessToken({ sql, vault: vault('a-secret-that-is-long-enough-to-seal-with') }, me.id, target.connection.id),
          (error) => error instanceof ConnectionUnusable && error.reason === 'gone',
        );
      }
      await assertUntouched();
    });

    test('nobody sees or follows another client’s guidance', async () => {
      for (const { intruder, target } of attempts()) {
        await as(intruder.person, async (s) => {
          assert.deepEqual(bodies(await rulesFor(s, target.space)), []);
          assert.deepEqual(bodies(await rulesFor(s, intruder.space)), bodies(intruder.rules));
          assert.equal((await skillsFor(s, target.space)).length, 0);
          assert.deepEqual((await skillsFor(s, intruder.space)).map((skill) => skill.pageId), [intruder.skill.pageId]);
          assert.equal(await readPage(s, target.skill.pageId), undefined);
          const found = await search(s, target.skill.name.replaceAll('-', ' '));
          assert.ok(found.every((hit) => hit.spaceId === intruder.space || hit.spaceId === intruder.person.personalSpaceId));
          const fitting = await skillsMatching(s, `${target.skill.name.replaceAll('-', ' ')} ${target.name}`, 20);
          assert.ok(fitting.every((skill) => skill.spaceId === intruder.space || skill.spaceId === intruder.person.personalSpaceId));
          assert.equal(await readProposal(s, target.proposal.id), undefined);
          assert.equal((await openProposals(s, target.space)).length, 0);
          for (const rule of target.rules) {
            assert.equal(await readItem(s, rule.id), undefined);
            const hits = await search(s, rule.body);
            assert.ok(hits.every((hit) => hit.spaceId === intruder.space || hit.spaceId === intruder.person.personalSpaceId));
          }
        }, sql);
      }
    });

    test('nobody changes another client’s guidance', async () => {
      for (const { intruder, target } of attempts()) {
        const me = { ...intruder.person, direct: true as const };
        const rule = { spaceId: target.space, kind: 'requirement', body: 'Hello' } as const;
        for (const shared of [true, false]) {
          await assert.rejects(as(me, (s) => addRule(s, { ...rule, shared }), sql), AccessDenied);
        }
        for (const { id } of target.rules) {
          assert.equal(await as(me, (s) => editRule(s, id, 'Changed'), sql), undefined);
          assert.equal(await as(me, (s) => removeRule(s, id), sql), false);
          // Nor through a proposal of their own, from their assistant.
          const assistant = { ...intruder.person, agent: 'Claude' };
          await assert.rejects(as(assistant, (s) => proposeRule(s, { action: 'remove rule', spaceId: target.space, ruleId: id }), sql), AccessDenied);
        }
        await assert.rejects(
          as({ ...intruder.person, agent: 'Claude' }, (s) => proposeRule(s, { action: 'add rule', spaceId: target.space, kind: 'requirement', text: 'Hello' }), sql),
          AccessDenied,
        );
        // And they can't decide the other client's proposal.
        assert.equal(await as(me, (s) => decide(s, target.proposal.id, { approve: true }), sql), undefined);
        const skill = [{ path: 'SKILL.md', body: '---\nname: hello\ndescription: Hello\n---\n' }];
        await assert.rejects(as(me, (s) => saveSkill(s, { spaceId: target.space, files: skill, shared: true }), sql), AccessDenied);
        // Nor include the other client's rules or skill in their own space, directly or through their assistant.
        for (const included of [{ space: target.space }, { skill: target.skill.pageId }]) {
          for (const shared of [true, false]) {
            await assert.rejects(as(me, (s) => addInclude(s, { spaceId: intruder.space, included, shared }), sql), IncludeRefused);
            await assert.rejects(
              as({ ...intruder.person, agent: 'Claude' }, (s) => proposeInclude(s, { action: 'add include', spaceId: intruder.space, included, shared }), sql),
              IncludeRefused,
            );
          }
        }
      }
      await assertUntouched();
    });
  });
}

describe('straight against the database', () => {
  test('each person reads only their own client’s rows', async () => {
    for (const { name, person, space, items, rules: ownRules, skill, source, proposal, connection } of [acme, beta]) {
      await as(person, async (s) => {
        const texts = await s.tx`select body from content where kind = 'text' order by created_at`;
        const rules = await s.tx`select body from content where kind in ('requirement', 'preference') order by created_at`;
        const titles = await s.tx`select body from content where kind = 'title' order by created_at`;
        const sources = await s.tx`select excerpt from sources`;
        const history = await s.tx`select body from revisions`;
        const citations = await s.tx`select source_id from citations`;
        const pages = await s.tx`select id from pages`;
        const spaces = await s.tx`select name from spaces order by created_at`;
        const people = await s.tx`select name from people`;
        const members = await s.tx`select distinct person_id from memberships`;
        const access = await s.tx`select distinct person_id from space_access`;
        const proposals = await s.tx`select change ->> 'text' as text from proposals`;
        const tasks = await s.tx`select title from tasks order by created_at`;
        const connections = await s.tx`select address from connections`;
        const places = await s.tx`select space_id from places`;

        assert.deepEqual(texts.map((row) => row.body), bodies(items));
        assert.deepEqual(rules.map((row) => row.body), bodies(ownRules));
        assert.deepEqual(titles.map((row) => row.body), [`${name} plans`, 'Notes', skill.name]);
        assert.deepEqual(sources.map((row) => row.excerpt), [source.excerpt]);
        assert.equal(history.length, 1);
        assert.deepEqual(citations.map((row) => row.sourceId), [source.id]);
        assert.equal(pages.length, 4);
        assert.deepEqual(spaces.map((row) => row.name), ['Personal', name]);
        assert.deepEqual(people.map((row) => row.name), [person.name]);
        assert.deepEqual(members.map((row) => row.personId), [person.id]);
        assert.deepEqual(access.map((row) => row.personId), [person.id]);
        assert.deepEqual(proposals.map((row) => row.text), [proposal.change.text]);
        assert.deepEqual(tasks.map((row) => row.title), [`${name}: book the venue`, `${name}: call the lawyer`]);
        assert.deepEqual(connections.map((row) => row.address), [connection.address]);
        assert.deepEqual(places.map((row) => row.spaceId), [space]);
      });
      // Nobody reads credentials at all, not even their own: only the functions that use them do.
      await assert.rejects(as(person, (s) => s.tx`select * from credentials`), refused);
    }
  });

  test('nobody writes to another client’s space', async () => {
    for (const { intruder, target } of attempts()) {
      const me = intruder.person;
      const [page] = target.pages;
      const insert = (privateTo: string | null) =>
        as(me, (s) => s.tx`
          insert into content (space_id, page_id, private_to, body)
          values (${target.space}, ${page}, ${privateTo}, 'Hello')
        `);
      await assert.rejects(insert(null), refused); // the shared side
      await assert.rejects(insert(me.id), refused); // a private side of their own
      await assert.rejects(insert(target.person.id), refused); // the other person's private side

      await assert.rejects(as(me, (s) => s.tx`
        insert into sources (space_id, private_to, excerpt) values (${target.space}, ${me.id}, 'Hello')
      `), refused);
      await assert.rejects(as(me, (s) => s.tx`
        insert into pages (space_id) values (${target.space})
      `), refused);
      await assert.rejects(as(me, (s) => s.tx`
        insert into citations (content_id, source_id) values (${intruder.items[1].id}, ${target.source.id})
      `), refused);

      // Nor a place there, on another's connection or their own, nor a connection or credentials of the other's.
      for (const connection of [target.connection.id, intruder.connection.id]) {
        await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`
          insert into places (connection_id, space_id, private_to, kind, resource) values (${connection}, ${target.space}, ${me.id}, 'mailbox', 'x')
        `), refused);
      }
      await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`select * from connect_mailbox(${target.space}::uuid, 'microsoft', 't', 'a', 'x@x.test', null, '{Mail.Read}')`), refused);
      await assert.rejects(as(me, (s) => s.tx`update connections set person_id = ${me.id} where id = ${target.connection.id}`), refused);
      await assert.rejects(as(me, (s) => s.tx`update places set private_to = ${me.id} where id = ${target.connection.place}`), refused);
      await assert.rejects(as(me, (s) => s.tx`insert into credentials (connection_id, refresh_token) values (${target.connection.id}, '\\x00')`), refused);
      await assert.rejects(as(me, (s) => s.tx`select keep_credentials(${target.connection.id}::uuid, '\\x00', null, null)`), refused);
      await assert.rejects(as(me, (s) => s.tx`select connection_needs_attention(${target.connection.id}::uuid)`), refused);
      assert.equal((await as(me, (s) => s.tx`select * from credentials_of(${target.connection.id}::uuid)`)).length, 0);

      // Nor a proposal there, for anyone.
      for (const privateTo of [me.id, target.person.id]) {
        await assert.rejects(as({ ...me, agent: 'Claude' }, (s) => s.tx`
          insert into proposals (space_id, private_to, action, change)
          values (${target.space}, ${privateTo}, 'add rule', ${s.tx.json({ kind: 'requirement', text: 'Hello', shared: true })})
        `), refused);
      }

      // Nor a task there, on any side, nor one given to the other person.
      for (const privateTo of [null, me.id, target.person.id]) {
        await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`
          insert into tasks (space_id, private_to, title) values (${target.space}, ${privateTo}, 'Hello')
        `), refused);
      }
      await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`
        insert into tasks (space_id, title, assignee) values (${intruder.space}, 'Hello', ${target.person.id})
      `), { code: '23514' });

      // Nor a proposal to share the other client's task, in either space.
      for (const space of [target.space, intruder.space]) {
        await assert.rejects(as({ ...me, agent: 'Claude' }, (s) => s.tx`
          insert into proposals (space_id, private_to, action, task_id, change)
          values (${space}, ${me.id}, 'share task', ${target.tasks[1]}, '{}')
        `), refused);
      }

      // Nor a proposal to archive the other client's page, in either space.
      for (const space of [target.space, intruder.space]) {
        await assert.rejects(as({ ...me, agent: 'Claude' }, (s) => s.tx`
          insert into proposals (space_id, private_to, action, page_id, change)
          values (${space}, ${me.id}, 'archive page', ${page}, '{}')
        `), refused);
      }

      // Nor include the other client's rules or skill in their own space, for anyone, nor propose it.
      for (const [column, id] of [['space_included', target.space], ['skill_included', target.skill.pageId]] as const) {
        for (const privateTo of [null, me.id]) {
          await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`
            insert into includes (space_id, private_to, ${s.tx(column)}) values (${intruder.space}, ${privateTo}, ${id})
          `), refused);
        }
        // A proposal of their own to include it never gets to say what it would include.
        await assert.rejects(as({ ...me, agent: 'Claude' }, async (s) => {
          const [proposal] = await s.tx`
            insert into proposals (space_id, private_to, action, change)
            values (${intruder.space}, ${me.id}, 'add include', ${s.tx.json({ shared: false })})
            returning id
          `;
          await s.tx`insert into proposal_includes (proposal_id, ${s.tx(column)}) values (${proposal.id}, ${id})`;
        }), refused);
      }

      // Nor anything through an import, which writes only into spaces it makes: not a page, source or
      // task in the other client's space, nor an item, gathering or archive on one of their pages, nor
      // a citation, an earlier version or a share of what's theirs, whichever space the rows claim.
      const now = new Date().toISOString();
      const imported = (lists: (own: { space: string; page: string }) => Record<string, unknown[]>) => {
        const own = { space: crypto.randomUUID(), page: crypto.randomUUID() };
        return {
          from: { instance: 'https://elsewhere.test', exportedBy: 'Mallory', exportedAt: now, space: crypto.randomUUID() },
          spaces: [{ id: own.space, name: 'Imported', parent: null, closed: false, archivedAt: null, imported: {} }],
          pages: [{ id: own.page, space: own.space, type: null, createdAt: now, archivedAt: null, imported: {} }],
          items: [] as unknown[], citations: [] as unknown[], sources: [] as unknown[], revisions: [] as unknown[], gathered: [] as unknown[], pageArchives: [] as unknown[], tasks: [] as unknown[],
          ...lists(own),
        };
      };
      const item = (fields: Record<string, unknown>) => ({ id: crypto.randomUUID(), kind: 'text', path: null, body: 'Hello', private: false, supersedes: null, reachesDown: false, publishedFrom: null, publishedAt: null, createdAt: now, writtenAt: now, imported: {}, ...fields });
      const [theirs] = target.items;
      // Refused, or pointing to what isn't there as far as the keys go.
      const kept = (error: { code?: string }) => ['42501', '23503'].includes(error.code ?? '');
      // One that stays in its own spaces goes in, and is undone here.
      await assert.rejects(as({ ...me, direct: true }, async (s) => {
        const own = imported((space) => ({ items: [item({ page: space.page, space: space.space, kind: 'title' })] }));
        await importInto(s, own as never);
        throw new Error('undone');
      }), /undone/);
      for (const bundle of [
        imported(() => ({ pages: [{ id: crypto.randomUUID(), space: target.space, type: null, createdAt: now, archivedAt: null, imported: {} }] })),
        imported((own) => ({ items: [item({ page, space: own.space })] })),
        imported(() => ({ items: [item({ page, space: target.space })] })),
        imported((own) => ({ items: [item({ page, space: own.space, private: true })] })),
        imported((own) => ({ items: [item({ page: own.page, space: own.space, supersedes: theirs.id })] })),
        imported((own) => ({ items: [item({ page: own.page, space: own.space, publishedFrom: theirs.id })] })),
        imported(() => ({ sources: [{ id: crypto.randomUUID(), space: target.space, private: false, reference: null, excerpt: 'Hello', createdAt: now, imported: {} }] })),
        imported(() => ({ tasks: [{ id: crypto.randomUUID(), space: target.space, private: false, title: 'Hello', description: null, due: null, doneAt: null, createdAt: now, updatedAt: now, imported: {} }] })),
        imported(() => ({ citations: [{ item: intruder.items[1].id, source: target.source.id }] })),
        imported((own) => ({ revisions: [{ item: theirs.id, space: own.space, private: false, body: 'Hello', writtenAt: now, replacedAt: now, imported: {} }] })),
        imported(() => ({ revisions: [{ item: theirs.id, space: target.space, private: false, body: 'Hello', writtenAt: now, replacedAt: now, imported: {} }] })),
        imported((own) => ({ gathered: [{ collection: own.page, page, space: own.space, private: false, createdAt: now, imported: {} }] })),
        imported(() => ({ gathered: [{ collection: page, page: theirs.pageId, space: target.space, private: false, createdAt: now, imported: {} }] })),
        imported(() => ({ pageArchives: [{ page, archived: true, at: now, imported: {} }] })),
        // Nor an include in their space, nor of their guidance, nor of anything the import didn't bring.
        imported((own) => ({ includes: [{ space: target.space, private: true, rules: own.space, skill: null, addedAt: now, imported: {} }] })),
        imported((own) => ({ includes: [{ space: own.space, private: true, rules: target.space, skill: null, addedAt: now, imported: {} }] })),
        imported((own) => ({ includes: [{ space: own.space, private: true, rules: null, skill: target.skill.pageId, addedAt: now, imported: {} }] })),
        imported((own) => ({ includes: [{ space: own.space, private: true, rules: intruder.space, skill: null, addedAt: now, imported: {} }] })),
        imported((own) => ({ includes: [{ space: own.space, private: true, rules: null, skill: intruder.skill.pageId, addedAt: now, imported: {} }] })),
      ]) {
        await assert.rejects(as({ ...me, direct: true }, (s) => importInto(s, bundle as never)), kept);
      }
      // Nor write into the other client's import under way, finish it or take it out.
      const theirs_ = await as({ ...target.person, direct: true }, async (s) => (await s.tx<{ id: string }[]>`select import_begin(${s.tx.json({
        from: { instance: 'https://elsewhere.test', exportedBy: 'Them', exportedAt: now, space: crypto.randomUUID() },
        spaces: [{ id: crypto.randomUUID(), name: 'Theirs, coming', parent: null, closed: false, archivedAt: null, imported: {} }],
      })}) as id`)[0].id);
      for (const call of [
        (s: Session) => s.tx`select import_load(${theirs_}::uuid, ${s.tx.json({ pages: [] })})`,
        (s: Session) => s.tx`select import_finish(${theirs_}::uuid, ${s.tx.json({ includes: [] })})`,
        (s: Session) => s.tx`select import_discard(${theirs_}::uuid, 5000)`,
      ]) {
        await assert.rejects(as({ ...me, direct: true }, call), refused);
      }
      // Nor see that it's under way, though they do, nor take it out as if it had stopped.
      const under = (who: Person) => as(who, async (s) => (await s.tx<{ n: number }[]>`select count(*)::int as n from importing`)[0].n);
      assert.equal(await under(me), 0);
      assert.equal(await under(target.person), 1);
      assert.equal((await as({ ...me, direct: true }, (s) => s.tx<{ done: boolean }[]>`select import_discard_stale(${theirs_}::uuid, 5000) as done`))[0].done, true);
      assert.equal(await under(target.person), 1);
      while (!(await as({ ...target.person, direct: true }, (s) => s.tx<{ done: boolean }[]>`select import_discard(${theirs_}::uuid, 5000) as done`))[0].done);
      // Nor on pages of theirs that anyone may write on, as far as the page goes: a page with
      // nothing on it yet, their overview, and two pages with titles, for a collection.
      const [empty, overview, first, second] = await admin<{ id: string }[]>`
        insert into pages (space_id, type) values (${target.space}, null), (${target.space}, 'overview'), (${target.space}, null), (${target.space}, null) returning id
      `;
      await admin`
        insert into content (page_id, space_id, kind, body, written_by)
        values (${first.id}, ${target.space}, 'title', 'First', ${target.person.id}), (${second.id}, ${target.space}, 'title', 'Second', ${target.person.id})
      `;
      for (const bundle of [
        imported(() => ({ items: [item({ page: empty.id, space: target.space })] })),
        imported(() => ({ items: [item({ page: overview.id, space: target.space })] })),
        imported(() => ({ gathered: [{ collection: first.id, page: second.id, space: target.space, private: true, createdAt: now, imported: {} }] })),
      ]) {
        await assert.rejects(as({ ...me, direct: true }, (s) => importInto(s, bundle as never)), refused);
      }
      await admin`delete from content where page_id in ${admin([first.id, second.id])}`;
      await admin`delete from pages where id in ${admin([empty.id, overview.id, first.id, second.id])}`;

      // Nor a rule on the other client's guidance page, editing directly.
      await assert.rejects(as(me, (s) => s.tx`select guidance_page(${target.space})`), refused);
      const [rule] = target.rules;
      await assert.rejects(as({ ...me, direct: true }, (s) => s.tx`
        insert into content (space_id, page_id, kind, body, reaches_down)
        values (${target.space}, ${rule.pageId}, 'requirement', 'Hello', true)
      `), refused);
    }
  });

  test('nobody changes or deletes another client’s items', async () => {
    for (const { intruder, target } of attempts()) {
      const ids = [...target.items, ...target.rules].map((item) => item.id);
      const changed = await as(intruder.person, (s) => s.tx`
        update content set body = 'Changed' where id in ${s.tx(ids)} returning id
      `);
      assert.equal(changed.length, 0);
      await assert.rejects(as(intruder.person, (s) => s.tx`delete from content where id in ${s.tx(ids)}`), refused);

      const decided = await as({ ...intruder.person, direct: true }, (s) => s.tx`
        update proposals set state = 'approved' where id = ${target.proposal.id} returning id
      `);
      assert.equal(decided.length, 0);
      await assert.rejects(as(intruder.person, (s) => s.tx`delete from proposals where id = ${target.proposal.id}`), refused);

      const ticked = await as({ ...intruder.person, direct: true }, (s) => s.tx`
        update tasks set title = 'Changed', done_at = now() where id in ${s.tx(target.tasks)} returning id
      `);
      assert.equal(ticked.length, 0);
      await assert.rejects(as(intruder.person, (s) => s.tx`delete from tasks where id in ${s.tx(target.tasks)}`), refused);
      for (const task of target.tasks) {
        await assert.rejects(as({ ...intruder.person, direct: true }, (s) => s.tx`select share_task(${task}::uuid)`), refused);
      }
    }
    await assertUntouched();
  });

  test('a plan naming another client’s item, task, rule or person shows none of it, and approving it changes nothing', async () => {
    for (const { intruder, target } of attempts()) {
      const steps: PlanStep[] = [
        { action: 'publish', item: target.items[1].id },
        { action: 'share task', task: target.tasks[1] },
        { action: 'change rule', rule: target.rules[0].id, text: 'Hello' },
        { action: 'change members', person: target.person.id, personName: 'Someone', member: 'add' },
      ];
      const theirs = new RegExp([...bodies(target.items), ...bodies(target.rules), `\\b${target.person.name}\\b`, target.name].join('|'));
      await assert.rejects(
        as({ ...intruder.person, direct: true }, async (s) => {
          // Made straight against the database, in their own space, so nothing checked what it names.
          const [{ id }] = await s.tx<{ id: string }[]>`
            insert into proposals (space_id, private_to, action, change) values (${intruder.space}, ${intruder.person.id}, 'plan', ${s.tx.json({ steps })}) returning id
          `;
          const view = (await readProposal(s, id))!;
          assert.deepEqual(view.plan!.steps.map((step) => [step.item, step.task, step.rule?.now, step.member?.found, step.problem !== null]), [
            [null, null, undefined, undefined, true],
            [null, null, undefined, undefined, true],
            [null, null, null, undefined, true],
            [null, null, undefined, false, true],
          ]);
          const titles = (await s.tx<{ title: string }[]>`select title from tasks where id = ${target.tasks[1]}::uuid`).map((row) => row.title);
          assert.deepEqual(titles, []);
          assert.doesNotMatch(JSON.stringify(proposalData(view)), theirs);
          await decide(s, id, { approve: true, shown: view.plan!.shown });
        }),
        Undecidable,
      );
    }
    await assertUntouched();
  });

  test('nobody gives themselves access to another client', async () => {
    for (const { intruder, target } of attempts()) {
      const me = intruder.person;
      await assert.rejects(as(me, (s) => s.tx`
        insert into memberships (space_id, person_id, role) values (${target.space}, ${me.id}, 'admin')
      `), refused);
      await assert.rejects(as(me, (s) => s.tx`
        insert into space_access (space_id, person_id, admin) values (${target.space}, ${me.id}, true)
      `), refused);
      await assert.rejects(as(me, (s) => s.tx`
        update spaces set parent_id = ${intruder.space} where id = ${target.space}
      `), refused);
    }
  });

  test('nobody can put their own table in place of Homing’s', async () => {
    await assert.rejects(
      as(acme.person, (s) => s.tx`create temp table space_access (person_id uuid, space_id uuid, admin boolean)`),
      refused,
    );
  });

  test('sign-in and Homing can’t read each other’s tables', async () => {
    const [role] = await authDb`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });

    for (const { schema, name } of await admin`select schemaname as schema, tablename as name from pg_tables where schemaname in ('public', 'auth')`) {
      const sql = schema === 'public' ? authDb : db;
      await assert.rejects(sql.unsafe(`select * from ${schema}."${name}" limit 1`), refused, `${schema}.${name}`);
    }
    // Nor can sign-in use Homing's functions that change people, spaces or access.
    const usable = await admin`
      select proname from pg_proc
      where pronamespace = 'public'::regnamespace and prosecdef and prorettype <> 'trigger'::regtype
        and has_function_privilege('homing_auth', oid, 'execute')
    `;
    assert.deepEqual(usable.map((row) => row.proname), []);
  });

  test('Homing’s role is restricted, and every table it can read is protected', async () => {
    const [role] = await db`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });

    const unprotected = await db`
      select relname from pg_class
      where relkind = 'r'
        and relnamespace = 'public'::regnamespace
        and has_any_column_privilege(current_user, oid, 'select')
        and not relrowsecurity
    `;
    assert.deepEqual(unprotected.map((row) => row.relname), []);
  });
});

async function client(
  name: string,
  personName: string,
  notes: {
    shared: string;
    draft: string;
    private: string;
    email: string;
    personal: string;
    rule: string;
    privateRule: string;
    skill: string;
    proposed: string;
  },
): Promise<Client> {
  const p = await person(personName);
  const client = await as({ ...p, direct: true }, async (s) => {
    const space = await createSpace(s, { name });
    const page = await createPage(s, { spaceId: space, title: `${name} plans`, shared: true });
    const source = await addSource(s, { spaceId: space, reference: 'An email', excerpt: notes.email });
    const shared = await writeItem(s, { pageId: page, body: notes.shared, shared: true });
    const draft = await writeItem(s, { pageId: page, body: notes.draft, sources: [source.id] });
    const changed = await updateItem(s, draft.id, { body: notes.private });
    const personalPage = await createPage(s, { spaceId: p.personalSpaceId, title: 'Notes' });
    const personal = await writeItem(s, { pageId: personalPage, body: notes.personal });
    const rules = [
      await addRule(s, { spaceId: space, kind: 'requirement', body: notes.rule, shared: true }),
      await addRule(s, { spaceId: space, kind: 'preference', body: notes.privateRule }),
    ];
    const skillMd = `---\nname: ${notes.skill}\ndescription: How ${name} wants it done\n---\n\nSteps for ${notes.skill.replaceAll('-', ' ')}\n`;
    const skill = await saveSkill(s, { spaceId: space, files: [{ path: 'SKILL.md', body: skillMd }], shared: true });
    const tasks = [
      await addTask(s, { spaceId: space, title: `${name}: book the venue`, shared: true, assignee: p.id }),
      await addTask(s, { spaceId: space, title: `${name}: call the lawyer` }),
    ];
    return {
      name,
      person: p,
      space,
      pages: [page, personalPage],
      items: [shared, changed!, personal],
      rules,
      skill: { pageId: skill.pageId, name: skill.name },
      source,
      tasks: tasks.map((task) => task.id),
    };
  });
  const proposal = await as({ person: p.id, agent: 'Claude' }, (s) =>
    proposeRule(s, { action: 'add rule', spaceId: client.space, kind: 'preference', text: notes.proposed, shared: true }),
  );
  const connection = await mailbox(p, client.space, `${personName.toLowerCase()}@${name.toLowerCase()}.test`);
  return { ...client, proposal, connection };
}

/** Someone's work mailbox, connected in a space only for them, as signing in to Microsoft leaves it. */
async function mailbox(who: { id: string }, space: string, address: string) {
  return as({ person: who.id, direct: true }, async (s) => {
    const [{ connectionId, placeId }] = await s.tx<{ connectionId: string; placeId: string }[]>`
      select * from connect_mailbox(${space}::uuid, 'microsoft', ${crypto.randomUUID()}, ${crypto.randomUUID()}, ${address}, null, ${s.tx.array(['User.Read', 'Mail.Read'])}::text[])
    `;
    await s.tx`select keep_credentials(${connectionId}::uuid, ${Buffer.from(`sealed refresh token of ${address}`)}, null, null)`;
    return { id: connectionId, place: placeId, address };
  });
}

describe('through the app’s endpoints', () => {
  let homing: Homing;
  let ana: SignedIn;
  let ben: SignedIn;

  // Signed in to the app this time, so each has an account of their own.
  const signedIn = async (name: string, rule: string) => {
    const who = await member(homing.url, name);
    const space = await as(who, (s) => createSpace(s, { name: `${name}’s client` }));
    const proposal = await as({ person: who.id, agent: 'Claude' }, (s) =>
      proposeRule(s, { action: 'add rule', spaceId: space, kind: 'preference', text: rule, shared: true }),
    );
    const { rule: ruleId, skill } = await as({ person: who.id, direct: true }, async (s) => ({
      rule: (await addRule(s, { spaceId: space, kind: 'requirement', body: `${name} never shares prices`, shared: true })).id,
      skill: (await saveSkill(s, { spaceId: space, files: [{ path: 'SKILL.md', body: `---\nname: ${name.toLowerCase()}-report\ndescription: ${name}’s weekly report\n---\n` }], shared: true })).pageId,
    }));
    // A shared page with a private item on it, and a page only they see.
    const pages = await as(who, async (s) => {
      const shared = await createPage(s, { spaceId: space, title: `${name}’s launch`, shared: true });
      const sharedSource = (await addSource(s, { spaceId: space, reference: `${name}’s plan`, excerpt: `${name} plans the launch for March`, shared: true })).id;
      const privateSource = (await addSource(s, { spaceId: space, reference: `${name}’s diary`, excerpt: `${name} fears the launch will slip` })).id;
      const sharedItem = (await writeItem(s, { pageId: shared, body: `${name} launches in March`, sources: [sharedSource], shared: true })).id;
      const privateItem = (await writeItem(s, { pageId: shared, body: `${name} worries the launch slips`, sources: [privateSource, sharedSource] })).id;
      const own = await createPage(s, { spaceId: space, title: `${name}’s salary talks` });
      await writeItem(s, { pageId: own, body: `${name} asks for a raise in December` });
      // A collection gathering the shared page for everyone, and the salary talks only for its owner.
      const collection = await createPage(s, { spaceId: space, title: `${name}’s 2027`, shared: true });
      await gather(s, { collectionId: collection, pageId: shared, shared: true });
      await gather(s, { collectionId: collection, pageId: own });
      // The space's overview, shared, and the owner's own version of it.
      await writeOverview(s, { spaceId: space, text: `${name}’s client is planning 2027`, shared: true });
      await writeOverview(s, { spaceId: space, text: `${name} keeps a secret overview` });
      return { shared, own, sharedItem, privateItem, sharedSource, privateSource, collection };
    });
    // Their work mailbox, connected in their client's space only for them.
    const connection = await mailbox(who, space, `${name.toLowerCase()}.mailbox@${name.toLowerCase()}-client.test`);
    return { name, who, browser: who.browser, space, personalSpaceId: who.personalSpaceId, proposal, rule: ruleId, skill, pages, connection };
  };
  type SignedIn = Awaited<ReturnType<typeof signedIn>>;

  before(async () => {
    homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl) });
    ana = await signedIn('Ana', 'Write Acme reports in Norwegian');
    ben = await signedIn('Ben', 'Send Beta invoices in euros');
  });

  after(() => homing.close());

  test('nobody sees or changes another client’s spaces, proposals or guidance', async () => {
    for (const [intruder, target] of [[ben, ana], [ana, ben]]) {
      const { browser } = intruder;
      const seen: unknown[] = [];
      const get = async (path: string) => {
        const response = await browser.json(path);
        seen.push(response.body);
        return response;
      };

      const spaces = (await get('/api/spaces')).body.spaces as { id: string }[];
      assert.deepEqual(spaces.map((space) => space.id).sort(), [intruder.space, intruder.personalSpaceId].sort());
      for (const space of [target.space, target.personalSpaceId]) assert.equal((await get(`/api/spaces/${space}`)).status, 404);
      const waiting = (await get('/api/waiting')).body.waiting as { id: string }[];
      assert.deepEqual(waiting.map((item) => item.id), [intruder.proposal.id]);
      assert.equal((await get(`/api/proposals/${target.proposal.id}`)).status, 404);
      const decided = await browser.json(`/api/proposals/${target.proposal.id}/decide`, { approve: true });
      assert.equal(decided.status, 404);
      seen.push(decided.body);
      for (const space of [target.space, target.personalSpaceId]) {
        assert.equal((await get(`/api/spaces/${space}/rules`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/skills`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/pages`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/pages?q=launch`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/sources?q=launch`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/export`)).status, 404);
        assert.equal((await get(`/api/spaces/${space}/connections`)).status, 404);
      }
      // Their connected accounts are their own, and only theirs.
      assert.deepEqual(((await get('/api/connections')).body.connections as { id: string }[]).map((connection) => connection.id), [intruder.connection.id]);
      for (const page of [target.pages.shared, target.pages.own]) assert.equal((await get(`/api/pages/${page}`)).status, 404);
      for (const source of [target.pages.sharedSource, target.pages.privateSource]) assert.equal((await get(`/api/sources/${source}`)).status, 404);
      // Nor the other client's overview.
      assert.equal((await get(`/api/spaces/${target.space}/overview`)).status, 404);
      assert.equal((await get(`/api/spaces/${target.space}/tasks`)).status, 404);
      const overwritten = await browser.json(`/api/spaces/${target.space}/overview`, { text: 'Hello', shared: true });
      assert.equal(overwritten.status, 404);
      seen.push(overwritten.body);
      // What changed shows only the intruder's own.
      const recent = (await get('/api/changes')).body.changes as { space: { id: string | null } }[];
      assert.ok(recent.every((change) => change.space.id === intruder.space || change.space.id === intruder.personalSpaceId));
      // Searching for anything of the other client's finds nothing.
      for (const query of ['launch', 'salary', 'raise', 'diary', 'plan', target.name, `${target.name.toLowerCase()}-report`, 'prices']) {
        const found = (await get(`/api/search?q=${encodeURIComponent(query)}`)).body;
        const spaces = [found.pages, found.sources, found.rules, found.skills, found.tasks].flat().map((hit: { space: { id: string | null } }) => hit.space.id);
        assert.ok(spaces.every((id) => id === intruder.space || id === intruder.personalSpaceId), query);
        assert.ok(found.spaces.every((space: { id: string }) => space.id === intruder.space || space.id === intruder.personalSpaceId), query);
      }
      // Nor what the other client's collection gathers, even asked about from their own space.
      assert.equal((await get(`/api/spaces/${target.space}/pages?in=${target.pages.collection}`)).status, 404);
      assert.deepEqual((await get(`/api/spaces/${intruder.space}/pages?in=${target.pages.collection}`)).body.pages, []);
      const gatherings = await as(intruder.who, (s) => s.tx`select collection_id from gathered`);
      assert.ok(gatherings.every((row) => row.collectionId === intruder.pages.collection));
      await assert.rejects(
        as(intruder.who, (s) => s.tx`insert into gathered (collection_id, page_id, space_id) values (${target.pages.collection}, ${target.pages.own}, ${target.space})`),
        refused,
      );
      assert.equal((await get(`/api/skills/${target.skill}`)).status, 404);
      // Neither looks after Homing, so neither sees who else uses it.
      assert.equal((await get('/api/admin')).status, 403);
      // Nor can they change the other client's guidance or knowledge through the app.
      for (const [path, body] of [
        [`/api/spaces/${target.space}/rules`, { kind: 'requirement', text: 'Hello', shared: true }],
        [`/api/spaces/${target.space}/rules`, { kind: 'requirement', text: 'Hello' }],
        [`/api/rules/${target.rule}`, { text: 'Changed' }],
        [`/api/rules/${target.rule}/remove`, {}],
        [`/api/spaces/${target.space}/pages`, { title: 'Hello', shared: true }],
        [`/api/spaces/${target.personalSpaceId}/pages`, { title: 'Hello' }],
        [`/api/pages/${target.pages.shared}/items`, { text: 'Hello', shared: true }],
        [`/api/pages/${target.pages.own}/items`, { text: 'Hello' }],
        [`/api/items/${target.pages.sharedItem}`, { text: 'Changed', shared: true }],
        [`/api/items/${target.pages.sharedItem}`, { text: 'Changed', shared: false }],
        [`/api/items/${target.pages.privateItem}`, { text: 'Changed' }],
        [`/api/pages/${target.pages.collection}/gather`, { pageId: target.pages.own }],
        [`/api/pages/${target.pages.collection}/gather/remove`, { pageId: target.pages.shared, shared: true }],
        [`/api/pages/${intruder.pages.collection}/gather`, { pageId: target.pages.shared }],
        [`/api/spaces`, { name: 'Hello', who: 'with others', in: target.space }],
        [`/api/spaces`, { name: 'Hello', who: 'just me', in: target.personalSpaceId }],
        [`/api/spaces/${target.space}`, { name: 'Hello' }],
        [`/api/spaces/${target.space}/members`, { email: 'nobody@example.test' }],
        [`/api/spaces/${target.space}/tasks`, { title: 'Hello', shared: true }],
        [`/api/spaces/${target.space}/tasks`, { title: 'Hello' }],
        [`/api/spaces/${target.space}/members/${target.who.id}`, { change: 'remove' }],
        [`/api/spaces/${target.personalSpaceId}`, { name: 'Hello' }],
        [`/api/spaces/${target.space}/archive`, { archived: true }],
        [`/api/pages/${target.pages.shared}/archive`, { archived: true }],
        [`/api/pages/${target.pages.own}/archive`, { archived: true }],
        [`/api/spaces/${target.personalSpaceId}/archive`, { archived: true }],
        [`/api/places/${target.connection.place}/remove`, {}],
        [`/api/connections/${target.connection.id}/revoke`, {}],
        [`/api/spaces/${target.space}/connections/microsoft`, {}],
      ] as const) {
        const changed = await browser.json(path, body);
        assert.ok([403, 404].includes(changed.status), path);
        seen.push(changed.body);
      }
      // The other client's spaces keep their names, stay open, and nothing was created in them.
      assert.equal((await admin`select name from spaces where name = 'Hello' or parent_id = ${target.space}`).length, 0);
      assert.equal((await admin`select id from spaces where archived_at is not null and id in (${target.space}, ${target.personalSpaceId})`).length, 0);
      assert.equal((await admin`select id from pages where archived_at is not null and id in (${target.pages.shared}, ${target.pages.own})`).length, 0);

      // Nothing they got back names the other client, what it asked for, its guidance or its mailbox.
      assert.doesNotMatch(JSON.stringify(seen), new RegExp(`${target.name}|${target.proposal.change.text}|${target.name.toLowerCase()}-report|${target.connection.address}|${target.connection.id}`));
    }
    const proposals = await admin`select state from proposals where id in ${admin([ana.proposal.id, ben.proposal.id])}`;
    assert.deepEqual(proposals.map((row) => row.state), ['open', 'open']);
    const connections = await admin`
      select c.revoked_at, p.removed_at from connections c join places p on p.connection_id = c.id
      where c.id in ${admin([ana.connection.id, ben.connection.id])}
    `;
    assert.deepEqual(connections.map((row) => [row.revokedAt, row.removedAt]), [[null, null], [null, null]]);
    const kept = await admin`
      select body from content
      where id in ${admin([ana.rule, ben.rule])} and not exists (select from content r where r.supersedes = content.id)
      order by body
    `;
    assert.deepEqual(kept.map((row) => row.body), ['Ana never shares prices', 'Ben never shares prices']);
    const spaces = [ana.space, ana.personalSpaceId, ben.space, ben.personalSpaceId];
    const written = await admin`select count(*)::int as count from content where body in ('Hello', 'Changed') and space_id in ${admin(spaces)}`;
    assert.equal(written[0].count, 0);
    const gathered = await admin`select collection_id, page_id, private_to is null as shared from gathered where space_id in ${admin(spaces)} order by created_at`;
    assert.deepEqual(gathered.map((row) => [row.collectionId, row.pageId, row.shared]), [
      [ana.pages.collection, ana.pages.shared, true],
      [ana.pages.collection, ana.pages.own, false],
      [ben.pages.collection, ben.pages.shared, true],
      [ben.pages.collection, ben.pages.own, false],
    ]);
  });

  test('a colleague in the same space finds nothing private to someone else', async () => {
    // Cara works with Ana on her client, so she sees its shared side, and only that.
    const cara = await member(homing.url, 'Cara');
    await as(ana.who, (s) => addMember(s, ana.space, cara.id));
    const seen: unknown[] = [];
    const get = async (path: string) => {
      const response = await cara.browser.json(path);
      assert.equal(response.status, path.includes(ana.pages.own) ? 404 : 200, path);
      seen.push(response.body);
      return response.body;
    };
    for (const query of ['', '?q=salary', '?q=raise', '?q=worries', '?q=launch', '?sort=name', '?sort=match&q=Ana']) {
      const found = await get(`/api/spaces/${ana.space}/pages${query}`);
      assert.ok(!found.pages.some((page: { id: string }) => page.id === ana.pages.own), query);
      // Two shared pages: the launch, and the collection gathering it.
      assert.ok(found.all <= 2 && found.total <= 2, query);
    }
    await get(`/api/pages/${ana.pages.own}`);
    // Ana's diary isn't among the sources, in the list, the count or a search, nor on its own.
    for (const query of ['', '?q=fears', '?q=diary', '?q=launch']) {
      const found = await get(`/api/spaces/${ana.space}/sources${query}`);
      assert.deepEqual(found.sources.map((source: { id: string }) => source.id).filter((id: string) => id !== ana.pages.sharedSource), [], query);
      assert.equal(found.all, 1, query);
    }
    assert.equal((await cara.browser.json(`/api/sources/${ana.pages.privateSource}`)).status, 404);
    // The plan they share shows only the item Cara sees resting on it.
    const plan = await get(`/api/sources/${ana.pages.sharedSource}`);
    assert.deepEqual(plan.pages.map((page: { items: { text: string }[] }) => page.items.map((item) => item.text)), [['Ana launches in March']]);
    const listed = await get(`/api/spaces/${ana.space}/sources`);
    assert.equal(listed.sources[0].pages, 1);
    // Ana's collection gathers only the shared page for Cara, in its list, its count and on the page.
    const gathered = await get(`/api/spaces/${ana.space}/pages?in=${ana.pages.collection}`);
    assert.deepEqual(gathered.pages.map((page: { id: string }) => page.id), [ana.pages.shared]);
    assert.equal(gathered.total, 1);
    const collections = await get(`/api/spaces/${ana.space}/pages?collections=1`);
    assert.deepEqual(collections.pages.map((page: { gathers: number }) => page.gathers), [1]);
    assert.equal((await get(`/api/pages/${ana.pages.collection}`)).gathers, 1);
    // What changed shows Cara Ana's shared launch, and nothing she keeps to herself.
    await get('/api/changes');
    // Ana's mailbox, connected in the space they share, isn't there for Cara: not listed, not counted, not hers to remove.
    assert.deepEqual((await get(`/api/spaces/${ana.space}/connections`)).places, []);
    assert.deepEqual((await get('/api/connections')).connections, []);
    for (const path of [`/api/places/${ana.connection.place}/remove`, `/api/connections/${ana.connection.id}/revoke`]) {
      const answer = await cara.browser.json(path, {});
      assert.equal(answer.status, 404, path);
      seen.push(answer.body);
    }
    for (const query of [ana.connection.address, 'mailbox', 'Microsoft']) await get(`/api/search?q=${encodeURIComponent(query)}`);
    assert.doesNotMatch(JSON.stringify(seen), new RegExp(`${ana.connection.address}|${ana.connection.id}|${ana.connection.place}`));
    // The overview Cara sees is the shared one, and Ana's own stays hers.
    assert.deepEqual((await get(`/api/spaces/${ana.space}/overview`)).overview.map((item: { text: string }) => item.text), ['Ana’s client is planning 2027']);
    // Search finds Ana's shared launch for Cara, and nothing she keeps to herself.
    for (const query of ['launch', 'salary', 'raise', 'worries', 'fears', 'diary']) await get(`/api/search?q=${query}`);
    const shared = await get(`/api/pages/${ana.pages.shared}`);
    assert.deepEqual(shared.items.map((item: { text: string }) => item.text), ['Ana launches in March']);
    // Even when the page last changed comes only from what Cara can see.
    const [{ latest }] = await admin`select max(updated_at) as latest from content where page_id = ${ana.pages.shared} and private_to is null`;
    assert.equal(new Date(shared.updatedAt).getTime(), latest.getTime());
    assert.doesNotMatch(JSON.stringify(seen), /salary|raise|worries|fears|diary|secret/);
    // Her export of the space holds what she sees, and nothing Ana keeps to herself.
    const exported = await cara.browser.fetch(`/api/spaces/${ana.space}/export`);
    assert.equal(exported.status, 200);
    const files = Object.entries(unzipSync(new Uint8Array(await exported.arrayBuffer()))).map(([path, bytes]) => `${path}\n${strFromU8(bytes)}`).join('\n');
    assert.match(files, /Ana launches in March/);
    assert.doesNotMatch(files, /salary|raise|worries|fears|diary|secret/);
    for (const id of [ana.pages.own, ana.pages.privateItem, ana.pages.privateSource]) assert.ok(!files.includes(id), id);
    // Nor can she write on what's only Ana's.
    for (const [path, body] of [
      [`/api/pages/${ana.pages.own}/items`, { text: 'Hello' }],
      [`/api/items/${ana.pages.privateItem}`, { text: 'Changed' }],
    ] as const) {
      const answer = await cara.browser.json(path, body);
      assert.equal(answer.status, 404, path);
      assert.doesNotMatch(JSON.stringify(answer.body), /salary|raise|worries|fears|diary/);
    }
  });
});

describe('through an include', () => {
  let homing: Homing;
  let ana: Member, ben: Member, cara: Member;
  let acme: string, lounge: string, rule: string, office: string;
  // What Ben must never learn: Acme's rules and skill, and that the lounge includes them.
  const secret = /Acme|acme-invoice|prices|Norwegian/;

  before(async () => {
    homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
    [ana, ben, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Ben'), await member(homing.url, 'Cara')];
    // Ana's client Acme, which Ben can't open, and a lounge they share, whose guidance includes
    // Acme's rules, first for Ana and then for everyone, and Acme's skill.
    ({ acme, lounge, rule } = await as({ person: ana.id, direct: true }, async (s) => {
      const acme = await createSpace(s, { name: 'Acme' });
      const rule = await addRule(s, { spaceId: acme, kind: 'requirement', body: 'Never send Acme prices by email', shared: true });
      await addRule(s, { spaceId: acme, kind: 'preference', body: 'Ana writes Acme reports in Norwegian' });
      const skill = await saveSkill(s, { spaceId: acme, files: [{ path: 'SKILL.md', body: '---\nname: acme-invoice\ndescription: How Acme wants invoices\n---\n' }], shared: true });
      const lounge = await createSpace(s, { name: 'Lounge' });
      await addMember(s, lounge, ben.id);
      await addRule(s, { spaceId: lounge, kind: 'preference', body: 'Keep lounge notes short', shared: true });
      await addInclude(s, { spaceId: lounge, included: { space: acme } });
      await addInclude(s, { spaceId: lounge, included: { space: acme }, shared: true });
      await addInclude(s, { spaceId: lounge, included: { skill: skill.pageId }, shared: true });
      return { acme, lounge, rule: rule.id };
    }));
    // An office Ana shares with Cara, whose guidance includes, only for Ana, a studio they can both open.
    office = await as({ person: ana.id, direct: true }, async (s) => {
      const studio = await createSpace(s, { name: 'Studio' });
      await addMember(s, studio, cara.id);
      const office = await createSpace(s, { name: 'Office' });
      await addMember(s, office, cara.id);
      await addInclude(s, { spaceId: office, included: { space: studio } });
      return office;
    });
  });

  after(() => homing.close());

  test('someone who can’t open the included space gets nothing through it, through Homing', async () => {
    for (const sql of [db, admin]) {
      await as(ben, async (s) => {
        assert.deepEqual(bodies(await rulesFor(s, lounge)), ['Keep lounge notes short']);
        assert.deepEqual(await skillsFor(s, lounge), []);
        assert.deepEqual(await includesIn(s, lounge), []);
        for (const text of ['prices', 'Norwegian', 'invoice', 'acme']) {
          assert.equal((await search(s, text)).length, 0, text);
          assert.equal((await search(s, text, { spaceId: lounge })).length, 0, text);
        }
        assert.equal(await readItem(s, rule), undefined);
      }, sql);
      // Ana, who can open Acme, gets it there.
      assert.deepEqual(bodies(await as(ana, (s) => rulesFor(s, lounge), sql)), ['Never send Acme prices by email', 'Ana writes Acme reports in Norwegian', 'Keep lounge notes short']);
    }
  });

  test('nor through his assistant or the app', async () => {
    const claude = new Assistant(homing.url, assistants.claude);
    await claude.connect(ben.browser);
    const chat = await claude.open();
    const [{ guidance }] = await admin`select id as guidance from pages where space_id = ${lounge} and type = 'guidance'`;
    const answers = [
      await chat.call('context', { request: 'Send the invoice', space: `space:${lounge}` }),
      await chat.call('search', { query: 'prices invoice Norwegian' }),
      await chat.call('search', { query: 'prices invoice Norwegian', space: `space:${lounge}` }),
      await chat.call('read', { ref: `page:${guidance}` }),
      await chat.call('read', { ref: `item:${rule}` }),
      await chat.call('act', { action: 'guidance.propose', input: { space: `space:${lounge}`, change: 'include', include: `space:${acme}` } }),
      await chat.call('act', { action: 'guidance.propose', input: { space: `space:${lounge}`, change: 'stop including', include: `space:${acme}` } }),
    ];
    assert.match(answers[0].text, /Keep lounge notes short/);
    assert.deepEqual(answers.slice(4).map((answer) => answer.failed), [true, true, true]);
    for (const answer of answers) assert.doesNotMatch(answer.text, secret);

    const seen = [];
    for (const path of [`/api/spaces/${lounge}/rules`, `/api/spaces/${lounge}/skills`, `/api/spaces/${lounge}/includable`, '/api/waiting', '/api/search?q=prices', '/api/search?q=invoice']) {
      const { status, body } = await ben.browser.json(path);
      assert.equal(status, 200, path);
      seen.push(body);
    }
    assert.deepEqual(seen[0].includes, []);
    assert.doesNotMatch(JSON.stringify(seen), secret);
    const [include] = await admin`select id from includes where space_id = ${lounge} and private_to is null and space_included = ${acme}`;
    assert.equal((await ben.browser.json(`/api/includes/${include.id}/remove`, { space: lounge })).status, 404);
    assert.equal((await ben.browser.json(`/api/spaces/${lounge}/includes`, { space: acme })).status, 404);
  });

  test('nor through an export, nor anything of someone else’s own include', async () => {
    const holds = async (who: Member, space: string, sql: typeof db) => {
      const manifest = (await as(who, (s) => manifestOf(s, space, homing.url), sql))!;
      await mkdir(workFolder, { recursive: true });
      const exported = await as(who, (s) => exportSpace(s, space, homing.url, workFolder), sql);
      assert.ok(exported && typeof exported === 'object');
      const zip = await readFile(exported.path);
      await rm(exported.path);
      return { manifest, text: Object.values(unzipSync(zip)).map((file) => strFromU8(file)).join('\n') };
    };
    // Ana's own in the office she shares with Cara: an item, a source, a task, and what she wrote
    // before she shared something, which stays hers.
    await as({ person: ana.id, direct: true }, async (s) => {
      const page = await createPage(s, { spaceId: office, title: 'Office plan', shared: true });
      await writeItem(s, { pageId: page, body: 'Ana’s own office note' });
      await addSource(s, { spaceId: office, excerpt: 'Ana’s own office source', reference: 'Ana’s own reference' });
      await addTask(s, { spaceId: office, title: 'Ana’s own office task' });
      const draft = await writeItem(s, { pageId: page, body: 'Ana’s own first draft' });
      await updateItem(s, draft.id, { body: 'The office opens in May.' });
      await publishItem(s, draft.id, 'The office opens in May.');
    });
    for (const sql of [db, admin]) {
      // Ben's export of the lounge holds nothing of Acme, nor that the lounge includes it.
      const lounged = await holds(ben, lounge, sql);
      assert.deepEqual(lounged.manifest.includes, []);
      assert.doesNotMatch(lounged.text, secret);
      // Cara can open the studio, but Ana's own include of it in the office isn't hers to export, nor a sign of it.
      const officed = await holds(cara, office, sql);
      assert.deepEqual(officed.manifest.includes, []);
      assert.doesNotMatch(officed.text, /Studio/);
      // Nor is anything else of Ana's own there, with the database's own checks or without them.
      assert.match(officed.text, /The office opens in May/);
      assert.doesNotMatch(officed.text, /Ana’s own/);
      // Ana's own export has it, as hers.
      assert.deepEqual((await holds(ana, office, sql)).manifest.includes.map((include) => [include.visibility, include.elsewhere?.space]), [['private', 'Studio']]);
    }
  });

  test('nor straight against the database', async () => {
    await as(ben, async (s) => {
      assert.equal((await s.tx`select * from includes`).length, 0);
      assert.deepEqual((await s.tx`select body from content where kind <> 'removed'`).map((row) => row.body), ['Keep lounge notes short']);
      // Asking whether he could open Acme says only no.
      assert.deepEqual([...(await s.tx`select include_open(${acme}::uuid, null) as open`)], [{ open: false }]);
    });
    // He can't remove or delete what he can't see, even editing directly.
    assert.equal((await as({ person: ben.id, direct: true }, (s) => s.tx`update includes set removed_at = now() where space_id = ${lounge} returning id`)).length, 0);
    await assert.rejects(as(ben, (s) => s.tx`delete from includes where space_id = ${lounge}`), refused);
    assert.equal((await admin`select count(*)::int as count from includes where space_id = ${lounge} and removed_at is null`)[0].count, 2);
  });
});

describe('through a page archived while it was someone’s own', () => {
  let homing: Homing;
  let ana: Member, cara: Member, ben: Member;
  let beta: string, diary: string;
  // Cara's notes in Acme, which she archived while only she had them, and Ana's old supplier in her
  // kitchen, which her assistant archived while only she could open it. Each shared it later. And
  // Ana's logo ideas, which she archived on her own, exported, imported, and then shared with Cara.
  type Archived = { space: string; page: string; archived: Date; shared: Date };
  let notes: Archived, supplier: Archived, logo: Archived;
  const times = async (space: string, page: string): Promise<Archived> => {
    const [{ archivedAt }] = await admin`select archived_at from pages where id = ${page}`;
    const [{ shared }] = await admin`select min(published_at) as shared from content where page_id = ${page} and private_to is null`;
    return { space, page, archived: archivedAt, shared };
  };
  // Exports a space and imports it again, as the app does, as a new space.
  const restore = async (who: Member, space: string, name: string): Promise<string> => {
    const bytes = new Uint8Array(await (await who.browser.fetch(`/api/spaces/${space}/export`)).arrayBuffer());
    return importAgain(who, bytes, name);
  };

  before(async () => {
    homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), ...testAssistants });
    [ana, cara, ben] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara'), await member(homing.url, 'Ben')];
    beta = await as({ ...ben, direct: true }, (s) => createSpace(s, { name: 'Beta' }));
    const acme = await as({ ...ana, direct: true }, async (s) => {
      const acme = await createSpace(s, { name: 'Acme' });
      await addMember(s, acme, cara.id);
      return acme;
    });
    const mine = await as({ ...cara, direct: true }, async (s) => {
      const page = await createPage(s, { spaceId: acme, title: 'Reorg notes' });
      const item = await writeItem(s, { pageId: page, body: 'The reorg moves Ops to Bergen' });
      await writeItem(s, { pageId: page, body: 'Cara would rather stay in Oslo' });
      await archivePage(s, page, true);
      // And a diary she keeps to herself.
      const diary = await createPage(s, { spaceId: acme, title: 'Diary' });
      await writeItem(s, { pageId: diary, body: 'Tired of the reorg' });
      await archivePage(s, diary, true);
      return { page, item, diary };
    });
    diary = mine.diary;
    const kitchen = await as({ ...ana, direct: true }, (s) => createSpace(s, { name: 'Kitchen', parentId: ana.personalSpaceId }));
    const old = await as({ person: ana.id, agent: 'Claude' }, async (s) => {
      const page = await createPage(s, { spaceId: kitchen, title: 'Old supplier' });
      const item = await writeItem(s, { pageId: page, body: 'We stopped buying from Fjordfisk' });
      await archivePage(s, page, true);
      return { page, item };
    });
    const studio = await as({ ...ana, direct: true }, async (s) => {
      const studio = await createSpace(s, { name: 'Studio' });
      const page = await createPage(s, { spaceId: studio, title: 'Logo ideas' });
      await writeItem(s, { pageId: page, body: 'A heron, in green' });
      await archivePage(s, page, true);
      return studio;
    });
    const restored = await restore(ana, studio, 'Restored');
    const [{ logoPage, logoItem }] = await admin`select page_id as logo_page, id as logo_item from content where space_id = ${restored} and kind = 'text'`;
    // Later, Cara shares one of her notes, Ana shares her kitchen and what she restored with Cara,
    // and then what's on those pages.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await as({ ...cara, direct: true }, (s) => publishItem(s, mine.item.id, 'The reorg moves Ops to Bergen'));
    await as({ ...ana, direct: true }, async (s) => {
      await makeCollaborative(s, kitchen, { rules: 'keep' });
      await addMember(s, kitchen, cara.id);
      await publishItem(s, old.item.id, 'We stopped buying from Fjordfisk');
      await addMember(s, restored, cara.id);
      await publishItem(s, logoItem, 'A heron, in green');
    });
    [notes, supplier, logo] = [await times(acme, mine.page), await times(kitchen, old.page), await times(restored, logoPage)];
  });

  after(() => homing.close());

  test('the other sees it archived since she could see it, by nobody, and the one who archived it sees her own, through Homing', async () => {
    const reopening = await as({ person: ana.id, agent: 'Claude' }, (s) => proposePageArchive(s, { pageId: notes.page, reopen: true, asked: true }));
    for (const sql of [db, admin]) {
      for (const [reader, page] of [[ana, notes], [cara, supplier], [cara, logo]] as const) {
        assert.deepEqual((await as(reader, (s) => readPage(s, page.page), sql))!.archived, { at: page.shared, by: null, since: true });
        // Her export says the same.
        const exported = (await as(reader, (s) => manifestOf(s, page.space, homing.url), sql))!;
        assert.deepEqual(exported.pages.find((candidate) => candidate.id === page.page)!.archived, { at: page.shared.toISOString(), by: null });
        assert.deepEqual(exported.pageArchives, []);
      }
      assert.deepEqual((await as(cara, (s) => readPage(s, notes.page), sql))!.archived, { at: notes.archived, by: cara.id, since: false });
      assert.deepEqual((await as(ana, (s) => readPage(s, supplier.page), sql))!.archived, { at: supplier.archived, by: ana.id, since: false });
      // Nor does a proposal to reopen it say when.
      assert.equal((await as(ana, (s) => readProposal(s, reopening.id), sql))!.page!.shown, 'Reorg notes\n');
    }
  });

  test('nor through the app or her assistant', async () => {
    const page = async (who: Member, id: string) => (await who.browser.json(`/api/pages/${id}`)).body.archived;
    assert.deepEqual(await page(ana, notes.page), { at: notes.shared.toISOString(), by: null, since: true });
    assert.deepEqual(await page(cara, supplier.page), { at: supplier.shared.toISOString(), by: null, since: true });
    assert.deepEqual(await page(cara, notes.page), { at: notes.archived.toISOString(), by: { name: 'Cara', you: true }, since: false });
    assert.deepEqual(await page(ana, supplier.page), { at: supplier.archived.toISOString(), by: { name: 'Ana', you: true }, since: false });

    const [anas, caras] = await Promise.all([ana, cara].map(async (who) => {
      const assistant = new Assistant(homing.url, assistants.claude);
      await assistant.connect(who.browser);
      return assistant.open();
    }));
    const read = async (chat: typeof anas, id: string) => (await chat.call('read', { ref: `page:${id}` })).text;
    assert.match(await read(anas, notes.page), /^Archived since .+: no longer active/m);
    assert.match(await read(caras, supplier.page), /^Archived since .+: no longer active/m);
    assert.match(await read(caras, notes.page), /^Archived on .+: no longer active/m);
    assert.match(await read(anas, supplier.page), /^Archived on .+: no longer active/m);
  });

  test('nobody who can’t see the page learns anything of its archiving, nor of a page that isn’t there', async () => {
    const nowhere = crypto.randomUUID();
    // Another client, another space's routine, a colleague with Cara's diary, and anyone with no page at all.
    for (const [principal, pages] of [
      [{ person: ben.id }, [notes.page, supplier.page, logo.page, diary]],
      [{ person: ben.id, agent: 'Claude' }, [notes.page, diary]],
      [{ space: beta }, [notes.page, supplier.page, logo.page, diary]],
      [{ person: ana.id }, [diary, nowhere]],
      [{ person: ana.id, agent: 'Claude' }, [diary]],
    ] as const) {
      for (const page of pages) {
        await as(principal, async (s) => {
          assert.deepEqual([...(await s.tx`select * from page_archived(${page}::uuid)`)], [], page);
          assert.deepEqual([...(await s.tx`select * from page_first_seen(${page}::uuid)`)], [{ seen: null }], page);
          assert.deepEqual([...(await s.tx`select at from page_archives where page_id = ${page}::uuid`)], [], page);
          assert.deepEqual([...(await s.tx`select archived from pages where id = ${page}::uuid`)], [], page);
        });
      }
    }
  });

  test('nor straight against the database, with or without an assistant', async () => {
    for (const [reader, page, other] of [[ana, notes, cara], [cara, supplier, ana]] as const) {
      for (const principal of [{ person: reader.id }, { person: reader.id, agent: 'Claude' }]) {
        await as(principal, async (s) => {
          assert.deepEqual([...(await s.tx`select person_id, agent, at from page_archives where page_id = ${page.page}::uuid`)], []);
          assert.deepEqual([...(await s.tx`select archived from pages where id = ${page.page}::uuid`)], [{ archived: true }]);
          assert.deepEqual([...(await s.tx`select * from page_archived(${page.page}::uuid)`)], [{ at: page.shared, archivedBy: null, importedBy: null, since: true }]);
        });
        for (const column of ['archived_at', 'archived_by', 'imported_archived_by', 'created_at', '*']) {
          await assert.rejects(as(principal, (s) => s.tx`select ${s.tx.unsafe(column)} from pages where id = ${page.page}::uuid`), refused, column);
        }
      }
      // The one who archived it still sees her own, through her assistant too.
      for (const principal of [{ person: other.id }, { person: other.id, agent: 'Claude' }]) {
        const own = await as(principal, (s) => s.tx`select archived, person_id, agent from page_archives where page_id = ${page.page}::uuid`);
        assert.deepEqual(own.map((row) => [row.archived, row.personId, row.agent]), [[true, other.id, page === supplier ? 'Claude' : null]]);
      }
    }

    // Nor who archived the logo ideas before they were imported, which the export said was Ana.
    for (const principal of [{ person: cara.id }, { person: cara.id, agent: 'Claude' }]) {
      await as(principal, async (s) => {
        assert.deepEqual([...(await s.tx`select imported -> 'archivedBy' as by from pages where id = ${logo.page}::uuid`)], [{ by: null }]);
        assert.deepEqual([...(await s.tx`select * from page_archived(${logo.page}::uuid)`)], [{ at: logo.shared, archivedBy: null, importedBy: null, since: true }]);
      });
    }
    assert.equal((await admin`select imported_archived_by ->> 'name' as name from pages where id = ${logo.page}`)[0].name, 'Ana');

    // From when Ana could see Cara's notes, what happens to them is hers to see too.
    await as({ ...ana, direct: true }, (s) => archivePage(s, notes.page, false));
    const seen = async (who: Member) =>
      (await as(who, (s) => s.tx`select archived, person_id from page_archives where page_id = ${notes.page}::uuid order by at`)).map((row) => [row.archived, row.personId]);
    assert.deepEqual(await seen(ana), [[false, ana.id]]);
    assert.deepEqual(await seen(cara), [[true, cara.id], [false, ana.id]]);
  });
});

/** Every item and rule still says what its owner wrote, and nothing was removed. */
async function assertUntouched() {
  for (const { items, rules } of [acme, beta]) {
    const ids = [...items, ...rules].map((item) => item.id);
    const stored = await admin`
      select body from content
      where id in ${admin(ids)}
        and not exists (select from content removal where removal.supersedes = content.id)
      order by created_at
    `;
    assert.deepEqual(stored.map((row) => row.body), bodies([...items, ...rules]));
  }
  const proposals = await admin`select state from proposals where id in ${admin([acme.proposal.id, beta.proposal.id])}`;
  assert.deepEqual(proposals.map((row) => row.state), ['open', 'open']);
  const connections = await admin`
    select c.address, c.status, c.revoked_at, p.removed_at, encode(k.refresh_token, 'escape') as sealed
    from connections c join places p on p.connection_id = c.id join credentials k on k.connection_id = c.id
    where c.id in ${admin([acme.connection.id, beta.connection.id])} order by c.connected_at
  `;
  assert.deepEqual(connections.map((row) => [row.address, row.status, row.revokedAt, row.removedAt, row.sealed]), [
    ['ana@acme.test', 'connected', null, null, 'sealed refresh token of ana@acme.test'],
    ['ben@beta.test', 'connected', null, null, 'sealed refresh token of ben@beta.test'],
  ]);
  const tasks = await admin`select title, done_at, private_to is null as shared from tasks where id in ${admin([...acme.tasks, ...beta.tasks])} order by created_at`;
  assert.deepEqual(tasks.map((row) => [row.title, row.doneAt, row.shared]), [
    ['Acme: book the venue', null, true],
    ['Acme: call the lawyer', null, false],
    ['Beta: book the venue', null, true],
    ['Beta: call the lawyer', null, false],
  ]);
}

function bodies(items: readonly { body: string }[]) {
  return items.map((item) => item.body);
}
