// The leak test, for guarantee 2: nothing crosses between clients.
//
// Ana works for Acme and Ben for Beta. Each has a page of knowledge on their
// client's shared side, a private note on it that cites an email and has an
// earlier version, notes in their personal space, a shared and a private
// rule for their client, a skill, and a rule their assistant proposed and
// they haven't decided yet. Each tries to read and
// change the other's, in three ways: through Homing, through Homing with
// row-level security off, and straight against the database with Homing's
// filters bypassed. So each layer is shown to refuse on its own. Then two
// people signed in to the app try the same through its endpoints, and a
// colleague in the same space looks for what's private to someone else.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { AccessDenied, authDatabaseUrl } from '../src/db.ts';
import { addRule, editRule, removeRule, rulesFor } from '../src/guidance.ts';
import {
  addSource,
  createPage,
  listPages,
  pagesIn,
  readItem,
  readPage,
  search,
  sourcesIn,
  sourceView,
  supersedeItem,
  updateItem,
  writeItem,
  type Item,
  type Source,
} from '../src/knowledge.ts';
import { decide, openProposals, proposeRule, readProposal, type Proposal } from '../src/proposals.ts';
import { saveSkill, skillsFor } from '../src/skills.ts';
import { startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace, listSpaces, peopleNames } from '../src/spaces.ts';
import { admin, as, authDb, db, member, person, refused, type Person } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

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
            assert.deepEqual(await pagesIn(s, space, { query: 'launch' }), { pages: [], total: 0, all: 0, types: [] });
            assert.deepEqual(await sourcesIn(s, space), { sources: [], total: 0, all: 0 });
          }
          assert.equal(await sourceView(s, target.source.id), undefined);
          for (const page of target.pages) assert.equal(await readPage(s, page), undefined);
          for (const item of target.items) assert.equal(await readItem(s, item.id), undefined);
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
      }
    });

    test('nobody changes another client’s items', async () => {
      for (const { intruder, target } of attempts()) {
        for (const item of target.items) {
          assert.equal(await as(intruder.person, (s) => updateItem(s, item.id, { body: 'Changed' }), sql), undefined);
          assert.equal(await as(intruder.person, (s) => supersedeItem(s, item.id, { body: 'Changed' }), sql), undefined);
        }
      }
      await assertUntouched();
    });

    test('nobody gives themselves access to another client', async () => {
      for (const { intruder, target } of attempts()) {
        const me = intruder.person;
        await assert.rejects(as(me, (s) => addMember(s, target.space, me.id), sql), refused);
        await assert.rejects(as(me, (s) => createSpace(s, { name: 'Way in', parentId: target.space }), sql), refused);
      }
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
      }
      await assertUntouched();
    });
  });
}

describe('straight against the database', () => {
  test('each person reads only their own client’s rows', async () => {
    for (const { name, person, items, rules: ownRules, skill, source, proposal } of [acme, beta]) {
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
      });
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

      // Nor a proposal there, for anyone.
      for (const privateTo of [me.id, target.person.id]) {
        await assert.rejects(as({ ...me, agent: 'Claude' }, (s) => s.tx`
          insert into proposals (space_id, private_to, action, change)
          values (${target.space}, ${privateTo}, 'add rule', ${s.tx.json({ kind: 'requirement', text: 'Hello', shared: true })})
        `), refused);
      }

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
        and has_table_privilege(current_user, oid, 'select')
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
    return {
      name,
      person: p,
      space,
      pages: [page, personalPage],
      items: [shared, changed!, personal],
      rules,
      skill: { pageId: skill.pageId, name: skill.name },
      source,
    };
  });
  const proposal = await as({ person: p.id, agent: 'Claude' }, (s) =>
    proposeRule(s, { action: 'add rule', spaceId: client.space, kind: 'preference', text: notes.proposed, shared: true }),
  );
  return { ...client, proposal };
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
      return { shared, own, sharedItem, privateItem, sharedSource, privateSource };
    });
    return { name, who, browser: who.browser, space, personalSpaceId: who.personalSpaceId, proposal, rule: ruleId, skill, pages };
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
      }
      for (const page of [target.pages.shared, target.pages.own]) assert.equal((await get(`/api/pages/${page}`)).status, 404);
      for (const source of [target.pages.sharedSource, target.pages.privateSource]) assert.equal((await get(`/api/sources/${source}`)).status, 404);
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
      ] as const) {
        const changed = await browser.json(path, body);
        assert.equal(changed.status, 404, path);
        seen.push(changed.body);
      }

      // Nothing they got back names the other client, what it asked for, or its guidance.
      assert.doesNotMatch(JSON.stringify(seen), new RegExp(`${target.name}|${target.proposal.change.text}|${target.name.toLowerCase()}-report`));
    }
    const proposals = await admin`select state from proposals where id in ${admin([ana.proposal.id, ben.proposal.id])}`;
    assert.deepEqual(proposals.map((row) => row.state), ['open', 'open']);
    const kept = await admin`
      select body from content
      where id in ${admin([ana.rule, ben.rule])} and not exists (select from content r where r.supersedes = content.id)
      order by body
    `;
    assert.deepEqual(kept.map((row) => row.body), ['Ana never shares prices', 'Ben never shares prices']);
    const spaces = [ana.space, ana.personalSpaceId, ben.space, ben.personalSpaceId];
    const written = await admin`select count(*)::int as count from content where body in ('Hello', 'Changed') and space_id in ${admin(spaces)}`;
    assert.equal(written[0].count, 0);
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
      assert.ok(found.all <= 1 && found.total <= 1, query);
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
    const shared = await get(`/api/pages/${ana.pages.shared}`);
    assert.deepEqual(shared.items.map((item: { text: string }) => item.text), ['Ana launches in March']);
    // Even when the page last changed comes only from what Cara can see.
    const [{ latest }] = await admin`select max(updated_at) as latest from content where page_id = ${ana.pages.shared} and private_to is null`;
    assert.equal(new Date(shared.updatedAt).getTime(), latest.getTime());
    assert.doesNotMatch(JSON.stringify(seen), /salary|raise|worries|fears|diary/);
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
}

function bodies(items: readonly { body: string }[]) {
  return items.map((item) => item.body);
}
