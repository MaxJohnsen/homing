// What removing learning (#149) does to a Homing that learned from a mailbox: its database ends as
// 0044 left it, as a new one does, with nothing of learning in it. What learning wrote stays: its
// notes, and the model calls it made, without their run. Proposals about learning go with it, and
// every other proposal stays as it was.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { connect, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { createPerson, createSpace } from '../src/spaces.ts';
import { freshDatabase } from './reset.ts';

let plain: Awaited<ReturnType<typeof freshDatabase>>;
let learned: Awaited<ReturnType<typeof freshDatabase>>;
let fresh: Awaited<ReturnType<typeof freshDatabase>>;
let admin: ReturnType<typeof connect>;
let ana: string, acme: string, note: string;
const kept: string[] = [];

/** As a person, through the admin role, so rows go in as the schema before the removal has them. */
const as = <T>(principal: Principal, fn: (s: Session) => Promise<T>) => withPrincipal(admin, principal, fn);

before(async () => {
  const files = (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort();
  const learning = files.find((file) => file.endsWith('_learning.sql'))!;
  const removal = files.find((file) => file.endsWith('_remove_learning.sql'))!;
  const through = files[files.indexOf(removal) + 1];

  plain = await freshDatabase('before_learning', { before: learning });
  fresh = await freshDatabase('without_learning', { before: through });
  learned = await freshDatabase('learned', { before: removal });
  admin = connect(learned.admin);

  // Ana's mailbox in Acme, which Homing learned from: a note it wrote, the emails it processed, a
  // map, and the model calls it made, one never sent and one for the map.
  ana = (await createPerson(admin, 'Ana')).id;
  acme = await as({ person: ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));
  const [{ id: connection }] = await admin`
    insert into connections (person_id, provider, tenant, account, address, name, scopes)
    values (${ana}, 'microsoft', 'tenant', 'account', 'ana@acme.test', 'Ana Berg', '{Mail.Read}') returning id
  `;
  const [{ id: place }] = await admin`
    insert into places (connection_id, space_id, private_to, kind, resource) values (${connection}, ${acme}, ${ana}, 'mailbox', 'account') returning id
  `;
  note = await as({ person: ana, agent: 'Homing' }, async (s) => {
    const page = randomUUID();
    await s.tx`insert into pages (id, space_id) values (${page}::uuid, ${acme}::uuid)`;
    const [{ id }] = await s.tx`
      insert into content (space_id, page_id, private_to, kind, body) values (${acme}::uuid, ${page}::uuid, ${ana}::uuid, 'text', 'Northwind’s budget for 2027 is NOK 2 million.') returning id
    `;
    return id as string;
  });
  const [{ id: run }] = await admin`
    insert into learning_runs (place_id, connection_id, space_id, private_to, since, state, spending_limit, estimate, started_at, caught_up_at,
                               excluded_senders, routes, summary)
    values (${place}, ${connection}, ${acme}, ${ana}, now() - interval '2 years', 'following', 5, '{"at": "2026-11-01T00:00:00Z"}', now(), now(),
            '{news.test}', ${admin.json([{ who: 'northwind.test', to: acme }])}, '{"senders": []}')
    returning id
  `;
  await admin`
    insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note, sender, at, interpretation, folder, parties)
    values (${run}, ${acme}, ${ana}, 'email 1', 'version 1', 'thread 1', 'learned', null, ${note}, 'gunnar@northwind.test', now(), 'sort 1', 'Inbox', null),
           (${run}, ${acme}, ${ana}, 'email 2', 'version 1', 'thread 2', 'set aside', 'waiting', null, 'lise@fjord.test', now(), null, 'Inbox', '{lise@fjord.test}')
  `;
  await admin`
    insert into model_calls (person_id, purpose, model, spaces, state, reserved, cost, cost_from, run_id, run_history, settled_at)
    values (${ana}, 'sort', 'cheap', ${[acme]}, 'done', 0.01, 0.004, 'provider', ${run}, true, now()),
           (${ana}, 'sort', 'cheap', ${[acme]}, 'failed', 0.01, 0, 'not sent', ${run}, true, now()),
           (${ana}, 'map', 'capable', ${[acme]}, 'done', 0.05, 0.02, 'prices', null, false, now())
  `;
  await admin`update model_spending set run_ceiling = 40`;

  // Her assistant proposed starting and extending learning, and a map in a plan, some still
  // waiting and some decided, beside proposals that have nothing to do with learning.
  const change = { place, since: '2024-11-01T00:00:00Z', estimate: { at: '2026-11-01T00:00:00Z' } };
  const map = { steps: [{ action: 'add space', name: 'Northwind', in: acme }, { action: 'learning map', place, routes: [{ who: 'northwind.test', to: 'step 1' }], rest: null }] };
  const plan = { steps: [{ action: 'add rule', kind: 'preference', text: 'Write in Norwegian.', shared: false, onlyHere: false }, { action: 'add rule', kind: 'requirement', text: 'Cite the email.', shared: false, onlyHere: false }] };
  await as({ person: ana, agent: 'Claude' }, async (s) => {
    for (const [action, given, state] of [
      ['start learning', change, 'open'],
      ['start learning', change, 'approved'],
      ['extend learning', change, 'open'],
      ['extend learning', change, 'withdrawn'],
      ['plan', map, 'open'],
      ['plan', map, 'rejected'],
    ] as const) {
      await s.tx`insert into proposals (space_id, private_to, action, change, state) values (${acme}, ${ana}, ${action}, ${s.tx.json(given)}, ${state})`;
    }
    for (const [action, given, state] of [
      ['plan', plan, 'open'],
      ['add space', { name: 'Northwind', who: 'just me', in: null, closed: false }, 'approved'],
    ] as const) {
      const [{ id }] = await s.tx`insert into proposals (space_id, private_to, action, change, state) values (${acme}, ${ana}, ${action}, ${s.tx.json(given)}, ${state}) returning id`;
      kept.push(id);
    }
  });

  await migrate(learned.admin, learned.app, learned.auth, { before: through });
});

after(() => admin.end());

/** Everything a database's schema holds, each thing on a line of its own, so two compare as lists. */
async function schemaOf(url: string): Promise<Record<string, string[]>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const lines = async (query: string) => (await sql.unsafe(query)).map((row) => JSON.stringify(Object.values(row))).sort();
  const ours = `(select oid from pg_namespace where nspname in ('public', 'auth'))`;
  try {
    return {
      schemas: await lines(`select nspname, array(select unnest(nspacl)::text order by 1) from pg_namespace where oid in ${ours}`),
      relations: await lines(`
        select relname, relkind, relrowsecurity, relforcerowsecurity, array(select unnest(relacl)::text order by 1)
        from pg_class where relnamespace in ${ours} and relkind not in ('i', 'I', 't', 'c')
      `),
      columns: await lines(`
        select c.relname, a.attname, rank() over (partition by c.oid order by a.attnum), format_type(a.atttypid, a.atttypmod), a.attnotnull,
               pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated, array(select unnest(a.attacl)::text order by 1)
        from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where c.relnamespace in ${ours} and c.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
      `),
      constraints: await lines(`select conrelid::regclass::text, conname, pg_get_constraintdef(oid), convalidated from pg_constraint where connamespace in ${ours}`),
      indexes: await lines(`select tablename, indexdef from pg_indexes where schemaname in ('public', 'auth')`),
      functions: await lines(`
        select oid::regprocedure::text, pg_get_functiondef(oid), array(select unnest(proacl)::text order by 1)
        from pg_proc where pronamespace in ${ours} and prokind in ('f', 'p')
      `),
      triggers: await lines(`select pg_get_triggerdef(t.oid), t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace in ${ours} and not t.tgisinternal`),
      policies: await lines(`select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname in ('public', 'auth')`),
      types: await lines(`select typname, typtype from pg_type where typnamespace in ${ours}`),
      extensions: await lines(`select extname, extversion from pg_extension`),
    };
  } finally {
    await sql.end();
  }
}

test('a Homing that learned ends with the database 0044 left, as a new one does', async () => {
  const before = await schemaOf(plain.admin);
  assert.ok(before.functions.length > 50 && before.policies.length > 20 && before.relations.some((line) => line.includes('homing_app=')), 'the comparison sees the schema, grants too');
  assert.deepEqual(await schemaOf(learned.admin), before);
  assert.deepEqual(await schemaOf(fresh.admin), before);
});

test('what learning wrote stays: its note, and its model calls, at what they cost', async () => {
  const [stored] = await admin`select body, agent, private_to from content where id = ${note}`;
  assert.deepEqual(stored, { body: 'Northwind’s budget for 2027 is NOK 2 million.', agent: 'Homing', privateTo: ana });
  const calls = await admin`select purpose, model, state, cost::float, cost_from from model_calls where person_id = ${ana} order by model, cost_from`;
  assert.deepEqual([...calls], [
    { purpose: 'sort', model: 'capable', state: 'done', cost: 0.02, costFrom: 'prices' },
    { purpose: 'sort', model: 'cheap', state: 'done', cost: 0.004, costFrom: 'provider' },
    { purpose: 'sort', model: 'cheap', state: 'failed', cost: 0, costFrom: 'refused' },
  ]);
});

test('proposals about learning go with it, waiting or decided, and every other stays as it was', async () => {
  const left = await admin`select id, action, state from proposals where private_to = ${ana} order by action`;
  assert.deepEqual([...left], [
    { id: kept[1], action: 'add space', state: 'approved' },
    { id: kept[0], action: 'plan', state: 'open' },
  ]);
});
