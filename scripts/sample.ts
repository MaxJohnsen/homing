// A sample Homing to try the app against: an empty one, as for someone who has just joined, or a
// big one, as for someone years in, with about 100 spaces, 10,000 pages, 100,000 sources and 30
// changes waiting. It recreates the database homing_sample, fills it the way people and their
// assistants would, through the same checks, and serves Homing at http://localhost:4200.
//
//   npm run build:web
//   npm run sample -- big      (or empty)
//
// Then sign in as ana@sample.test with the sample password below. It's for this local sample only.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { adminUrl, authDatabaseUrl, connect, databaseUrl, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { migrate } from '../src/migrate.ts';
import { proposeRule } from '../src/proposals.ts';
import { startServer } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';

const samplePassword = 'sample-homing-only';
const size = process.argv[2];
if (size !== 'big' && size !== 'empty') {
  console.error('Say which sample: npm run sample -- big, or npm run sample -- empty');
  process.exit(1);
}

const database = 'homing_sample';
const at = (url: string) => Object.assign(new URL(url), { pathname: `/${database}` }).toString();
const urls = { admin: at(adminUrl), app: at(databaseUrl), auth: at(authDatabaseUrl) };
const port = 4200;
const url = new URL(`http://localhost:${port}`);

// A fresh database of its own, so the sample never touches anyone's Homing.
const server = postgres(adminUrl, { onnotice: () => {} });
await server.unsafe(`drop database if exists ${database} with (force)`);
await server.unsafe(`create database ${database}`);
await server.end();
await migrate(urls.admin, urls.app, urls.auth);

const sql = connect(urls.app);
const admin = connect(urls.admin);
await startServer(sql, { port, host: '127.0.0.1', url, authDatabase: urls.auth, rateLimit: false, logRequests: false });

// The same random sample every time.
let seed = 42;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

/** Someone joining through an invite with a password, the way the join page does it. */
async function join(name: string): Promise<{ id: string; person: string; name: string; personalSpaceId: string }> {
  const token = randomBytes(32).toString('base64url');
  await admin`insert into invites (hash, expires_at) values (${createHash('sha256').update(token).digest()}, now() + interval '1 hour')`;
  const email = `${name.split(' ')[0].toLowerCase()}@sample.test`;
  const post = (path: string, body: unknown) =>
    fetch(new URL(path, url), { method: 'POST', headers: { origin: url.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const { ticket } = await (await post('/api/join', { token, name, email })).json();
  const joined = await post('/api/join/password', { ticket, password: samplePassword });
  if (!joined.ok) throw new Error(`${name} couldn't join: ${await joined.text()}`);
  const [person] = await admin`
    select p.id, s.id as personal_space_id from people p join spaces s on s.private_to = p.id and s.parent_id is null
    where p.name = ${name}
  `;
  return { id: person.id, person: person.id, name, personalSpaceId: person.personalSpaceId };
}

const as = <T>(principal: Principal, fn: (s: Session) => Promise<T>) => withPrincipal(sql, principal, fn);

const ana = await join('Ana Berg');
// The first person looks after Homing, as whoever sets it up does.
await admin`update people set instance_admin = true where id = ${ana.id}`;

if (size === 'big') await big();

console.log(`\n${size === 'big' ? 'A big' : 'An empty'} sample Homing runs at ${url.origin}`);
console.log(`Sign in as ana@sample.test with the password ${samplePassword}. Stop it with Ctrl-C.\n`);

async function big() {
  const firstNames = ['Cara', 'Jon', 'Eli', 'Mia', 'Ola', 'Sara', 'Lars', 'Ida', 'Tor', 'Nora', 'Emil', 'Ingrid', 'Henrik', 'Maja', 'Sindre', 'Thea', 'Jonas', 'Live', 'Aksel', 'Frida', 'Magnus', 'Hedda', 'Even', 'Sofie', 'Martin', 'Vilde', 'Kasper', 'Tiril', 'Gunnar'];
  const lastNames = ['Lund', 'Dahl', 'Sand', 'Holm', 'Strand', 'Berge', 'Moen', 'Lie', 'Bakke', 'Haug', 'Vik', 'Aas'];
  const colleagues: Awaited<ReturnType<typeof join>>[] = [];
  for (const first of firstNames) colleagues.push(await join(`${first} ${pick(lastNames)}`));
  console.log(`${colleagues.length + 1} people joined`);

  const clients = ['Northwind', 'Fjord Bank', 'Nordlys Energi', 'Havbris', 'Polar Freight', 'Granitt Bygg', 'Skog & Co', 'Bølge Media', 'Elv Health', 'Furu Retail', 'Isbre Insurance', 'Lynx Logistics', 'Mjøsa Foods', 'Nesna Shipping', 'Oslo Opera', 'Pine Analytics', 'Ravn Security', 'Solberg Hotels', 'Tinde Outdoor', 'Utsikt Travel', 'Vann Utilities', 'Westfjord Fisheries', 'Yr Weather', 'Zenit Telecom', 'Aurora Pharma', 'Birk Schools', 'Corvus Air', 'Dovre Rail', 'Eik Furniture', 'Fonn Water', 'Gran Paper', 'Hav Aquaculture', 'Ild Foods', 'Jotun Paints', 'Kyst Bank', 'Lomen Hydro', 'Myra Farms', 'Norne Mining', 'Odda Steel'];
  const projects = ['Website', 'Data platform', 'Brand refresh', 'Support'];

  // Ana's own spaces, and her family's.
  const kitchen = await as(ana, (s) => createSpace(s, { name: 'Kitchen renovation', parentId: ana.personalSpaceId }));
  const running = await as(ana, (s) => createSpace(s, { name: 'Running', parentId: ana.personalSpaceId }));
  const family = await as(ana, (s) => createSpace(s, { name: 'Berg family' }));
  await as(ana, (s) => addMember(s, family, colleagues[4].id, 'admin'));

  // Acme, where everyone works, with its clients and their projects. A third of the clients are closed.
  const acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    for (const colleague of colleagues.slice(0, 26)) await addMember(s, acme, colleague.id, colleague === colleagues[1] ? 'admin' : 'member');
    return acme;
  });
  const spaces: { id: string; name: string; writers: typeof colleagues }[] = [
    { id: ana.personalSpaceId, name: 'Personal', writers: [] },
    { id: kitchen, name: 'Kitchen renovation', writers: [] },
    { id: running, name: 'Running', writers: [] },
    { id: family, name: 'Berg family', writers: [colleagues[4]] },
    { id: acme, name: 'Acme', writers: colleagues.slice(0, 26) },
  ];
  for (const [index, name] of clients.entries()) {
    const closed = index % 3 === 0;
    const team = closed ? colleagues.slice(index % 20, (index % 20) + between(1, 4)) : colleagues.slice(0, 26);
    const client = await as(ana, async (s) => {
      const id = await createSpace(s, { name, parentId: acme, closed });
      if (closed) for (const colleague of team) await addMember(s, id, colleague.id);
      return id;
    });
    spaces.push({ id: client, name, writers: team });
    for (const project of projects.slice(0, index % 4)) {
      const id = await as(ana, (s) => createSpace(s, { name: project, parentId: client }));
      spaces.push({ id, name: `${name} ${project.toLowerCase()}`, writers: team });
    }
  }
  console.log(`${spaces.length} spaces`);

  // Rules: Acme's, each client's own, and Ana's.
  await as({ person: ana.id, direct: true }, async (s) => {
    for (const body of ['Never name other clients in documents for a client.', 'Write status reports in English unless the client asks otherwise.', 'Put the date first in file names, like 2026-10-19 Status.'])
      await addRule(s, { spaceId: acme, kind: body.startsWith('Never') ? 'requirement' : 'preference', body, shared: true });
    for (const body of ['Keep answers short, with the most important point first.', 'Use metric units.', 'Ask before booking anything that costs money.'])
      await addRule(s, { spaceId: ana.personalSpaceId, kind: body.startsWith('Ask') ? 'requirement' : 'preference', body });
    for (const client of spaces.slice(5)) {
      for (let rule = 0; rule < between(0, 3); rule++) {
        const body = pick([`Send ${client.name} prices only through their procurement portal.`, `Write ${client.name}’s status reports in Norwegian.`, `Copy the project lead on everything to ${client.name}.`, `Call before sending ${client.name} anything big.`]);
        await addRule(s, { spaceId: client.id, kind: body.startsWith('Send') ? 'requirement' : 'preference', body, shared: random() < 0.8, onlyHere: random() < 0.2 });
      }
    }
    const skill = (name: string, description: string) => [{ path: 'SKILL.md', body: `---\nname: ${name}\ndescription: ${description}\n---\nWrite it from what happened since the last one.\n\n1. What was done, in at most three points.\n2. What is next, with dates.\n3. Risks, each with who owns it.` }];
    for (const [name, description] of [['status-report', 'The weekly status report Acme sends every client.'], ['estimate', 'Estimates work in days, with a range and what it depends on.'], ['meeting-notes', 'Notes from a client meeting, with decisions and next steps.'], ['proposal', 'A proposal for new work, in Acme’s template.']])
      await saveSkill(s, { spaceId: acme, files: skill(name, description), shared: true });
    for (const client of spaces.slice(5, 8)) await saveSkill(s, { spaceId: client.id, files: skill('status-report', `The weekly status report for ${client.name}, in their template.`), shared: true });
  });

  // Thirty changes Ana's assistant proposed, waiting for her.
  for (let index = 0; index < 30; index++) {
    const space = spaces[5 + ((index * 7) % (spaces.length - 5))];
    await as({ person: ana.id, agent: pick(['Claude', 'Claude', 'ChatGPT']) }, (s) =>
      proposeRule(s, { action: 'add rule', spaceId: space.id, kind: pick(['preference', 'requirement'] as const), text: pick([`Send ${space.name} invoices in euros.`, `Name ${space.name}’s files in Norwegian.`, `Always copy the account manager at ${space.name}.`, `Keep ${space.name} updates under one page.`]), shared: true }),
    );
  }
  await admin`
    update proposals set created_at = now() - (row_number * interval '3 hours'), expires_at = now() - (row_number * interval '3 hours') + interval '7 days'
    from (select id, row_number() over (order by created_at) from proposals) numbered where numbered.id = proposals.id
  `;

  // Knowledge: 10,000 pages and 100,000 sources, most in the clients, and 1,240 pages in Northwind.
  const weights = spaces.map((space, index) => (index === 5 ? 0 : index < 5 ? [60, 25, 15, 40, 400][index] : between(20, 160)));
  const rest = 10_000 - 1_240 - weights.slice(0, 5).reduce((sum, weight) => sum + weight, 0);
  const clientWeights = weights.slice(6).reduce((sum, weight) => sum + weight, 0);
  const counts = weights.map((weight, index) => (index === 5 ? 1_240 : index < 5 ? weight : Math.round((weight / clientWeights) * rest)));
  let pages = 0;
  let sources = 0;
  for (const [index, space] of spaces.entries()) {
    const personalTree = index < 3;
    const others = space.writers.slice(0, 2);
    for (const writer of [ana, ...others]) {
      const share = writer === ana ? (others.length ? 0.6 : 1) : 0.4 / others.length;
      const made = await knowledge(writer, space, Math.round(counts[index] * share), personalTree);
      pages += made.pages;
      sources += made.sources;
    }
    process.stdout.write(`\r${pages} pages, ${sources} sources`);
  }
  // Spread over three years, as if written over time. Only knowledge, never guidance.
  await admin`
    update content set created_at = now() - random() * interval '3 years'
    where kind in ('title', 'text') and page_id in (select id from pages where type is distinct from 'guidance' and type is distinct from 'skill')
  `;
  await admin`
    update content set updated_at = created_at
    where kind in ('title', 'text') and page_id in (select id from pages where type is distinct from 'guidance' and type is distinct from 'skill')
  `;
  await admin`update sources set created_at = now() - random() * interval '3 years'`;
  console.log();
}

/** Pages with a few items each, and sources behind them, written by one person in one go. */
async function knowledge(writer: { id: string; name: string }, space: { id: string; name: string }, count: number, personalTree: boolean) {
  if (count <= 0) return { pages: 0, sources: 0 };
  const people = ['Gunnar Holm', 'Kari Nordmann', 'Per Hansen', 'Lise Berg', 'Odd Strand', 'Mona Lie', 'Jens Moe', 'Hilde Vik'];
  const topics = ['launch', 'budget', 'migration', 'contract', 'onboarding', 'pricing', 'security review', 'roadmap', 'hiring', 'reporting', 'renewal', 'workshop'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'September', 'October', 'November'];
  const ids: string[] = [];
  const titles: string[] = [];
  const types: (string | null)[] = [];
  const itemPages: string[] = [];
  const bodies: string[] = [];
  for (let page = 0; page < count; page++) {
    const kind = pick(['person', 'meeting', 'decision', 'topic', 'topic', 'project'] as const);
    const topic = pick(topics);
    const id = randomUUID();
    ids.push(id);
    types.push(kind === 'topic' ? null : kind);
    titles.push(
      kind === 'person' ? `${pick(people)} (${space.name})`
        : kind === 'meeting' ? `${capital(topic)} meeting, ${between(1, 28)} ${pick(months)}`
          : kind === 'decision' ? `Decision: ${topic} moves to ${pick(months)}`
            : kind === 'project' ? `${space.name} ${topic} project`
              : `${capital(topic)} ${between(2024, 2026)}`,
    );
    for (let item = 0; item < between(1, 4); item++) {
      itemPages.push(id);
      bodies.push(pick([
        `${pick(people)} owns the ${topic} on ${space.name}'s side.`,
        `The ${topic} is planned for ${between(1, 28)} ${pick(months)}.`,
        `${space.name} wants the ${topic} done before the summer.`,
        `The ${topic} budget is ${between(2, 90) * 10_000} NOK.`,
        `Decided: the ${topic} goes ahead without the optional parts.`,
        `Risk: the ${topic} depends on ${pick(people)} being back from leave.`,
      ]));
    }
  }
  const references = Array.from({ length: count * 10 }, () => pick(['Email', 'Meeting notes', 'Teams chat', 'Document', 'Call']));
  const excerpts = references.map((reference) => `${reference} from ${pick(people)}: ${pick([`the ${pick(topics)} is on track`, `we need a decision on the ${pick(topics)}`, `the ${pick(topics)} slips a week`, `budget for the ${pick(topics)} is approved`])}.`);
  // In a shared space, one page in ten is the writer's own, and so is everything on it.
  const ownPages = new Set(ids.filter(() => personalTree || random() < 0.1));
  const sides = ids.map((id) => (ownPages.has(id) ? writer.id : null));
  const itemSides = itemPages.map((id) => (ownPages.has(id) ? writer.id : null));
  const side = personalTree ? writer.id : null;

  const made = await as({ person: writer.id, agent: 'Claude' }, async (s) => {
    await s.tx`insert into pages (id, space_id, type) select unnest(${ids}::uuid[]), ${space.id}::uuid, unnest(${types}::text[])`;
    await s.tx`insert into content (page_id, space_id, private_to, kind, body) select unnest(${ids}::uuid[]), ${space.id}::uuid, unnest(${sides}::uuid[]), 'title', unnest(${titles}::text[])`;
    const items = await s.tx<{ id: string; pageId: string; privateTo: string | null }[]>`
      insert into content (page_id, space_id, private_to, kind, body)
      select unnest(${itemPages}::uuid[]), ${space.id}::uuid, unnest(${itemSides}::uuid[]), 'text', unnest(${bodies}::text[]) returning id, page_id, private_to
    `;
    // Now and then the writer knows something newer than the space does, and keeps it to themselves for now.
    const updated = personalTree ? [] : items.filter((item) => item.privateTo === null && random() < 0.05);
    if (updated.length) {
      await s.tx`
        insert into content (page_id, space_id, private_to, kind, body, supersedes)
        select unnest(${updated.map((item) => item.pageId)}::uuid[]), ${space.id}::uuid, ${writer.id}::uuid, 'text',
               unnest(${updated.map(() => `Update: ${pick(['it moved two weeks', 'it’s on hold until the budget is settled', 'it’s cancelled', `${pick(people)} takes it over`])}.`)}::text[]),
               unnest(${updated.map((item) => item.id)}::uuid[])
      `;
    }
    const added = await s.tx<{ id: string }[]>`
      insert into sources (space_id, private_to, reference, excerpt)
      select ${space.id}::uuid, ${side}::uuid, unnest(${references}::text[]), unnest(${excerpts}::text[]) returning id
    `;
    // Most items rest on a source or two. The other sources haven't become knowledge yet.
    const cited = items.flatMap((item, index) => (index % 4 === 3 ? [] : [[item.id, added[index * 2].id], [item.id, added[index * 2 + 1].id]]));
    await s.tx`insert into citations (content_id, source_id) select unnest(${cited.map((pair) => pair[0])}::uuid[]), unnest(${cited.map((pair) => pair[1])}::uuid[])`;
    return { pages: ids.length, sources: added.length };
  });
  return made;
}

function capital(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

