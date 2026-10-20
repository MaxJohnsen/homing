// A local Homing for the benchmarks, in a database of its own, and the world each conversation
// starts from: Ana's working life, made through Homing's own operations the way people and their
// assistants would make it. Every conversation gets a new world with new people, so what one
// conversation saves never shows up in another.

import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { adminUrl, authDatabaseUrl, connect, databaseUrl, withPrincipal, type Principal, type Session, type Sql } from '../src/db.ts';
import { addRule } from '../src/guidance.ts';
import { createPage, writeItem, writeOverview } from '../src/knowledge.ts';
import { migrate } from '../src/migrate.ts';
import { proposeRule } from '../src/proposals.ts';
import { startServer, type Homing } from '../src/server.ts';
import { saveSkill } from '../src/skills.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { addTask } from '../src/tasks.ts';
import { Assistant, assistants, testAssistants } from '../test/assistant.ts';
import { Browser } from '../test/browser.ts';
import { inTestDatabase } from '../test/reset.ts';

/** The benchmarks' own database. It is dropped and made again at the start of every run. */
export const database = process.env.HOMING_BENCH_DB ?? 'homing_bench';
if (!/^homing_bench[a-z0-9_]*$/.test(database)) throw new Error(`HOMING_BENCH_DB must be a database of the benchmarks' own, such as homing_bench: ${database}`);

export interface Bench {
  homing: Homing;
  sql: Sql;
  admin: Sql;
  close(): Promise<void>;
}

/** Makes the database again, applies the migrations and serves Homing on a free local port. */
export async function startHoming(): Promise<Bench> {
  const server = postgres(adminUrl, { onnotice: () => {} });
  await server.unsafe(`drop database if exists ${database} with (force)`);
  await server.unsafe(`create database ${database}`);
  await server.end();
  await migrate(inTestDatabase(adminUrl, database), inTestDatabase(databaseUrl, database), inTestDatabase(authDatabaseUrl, database));
  const sql = connect(inTestDatabase(databaseUrl, database));
  const admin = connect(inTestDatabase(adminUrl, database));
  const homing = await startServer(sql, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl, database), ...testAssistants });
  return {
    homing,
    sql,
    admin,
    close: async () => {
      await homing.close();
      await Promise.all([sql.end(), admin.end()]);
    },
  };
}

/** Someone joining through an invite with a passkey, signed in to their own browser. */
async function join(bench: Bench, name: string) {
  const token = randomBytes(32).toString('base64url');
  const email = `${name.split(' ')[0].toLowerCase()}-${randomBytes(4).toString('hex')}@example.test`;
  await bench.admin`
    insert into invites (hash, expires_at, email)
    values (${createHash('sha256').update(token).digest()}, now() + interval '1 hour', ${email})
  `;
  const browser = new Browser(bench.homing.url);
  const joined = await browser.join(token, { name, email });
  if (joined.status !== 200) throw new Error(`${name} couldn't join: ${JSON.stringify(joined.body)}`);
  const id = joined.body.user.id as string;
  const [{ personalSpaceId }] = await bench.admin`select id as personal_space_id from spaces where private_to = ${id} and parent_id is null`;
  return { id, name, person: id, personalSpaceId: personalSpaceId as string, browser };
}

/** Which assistant Ana connects: the one Homing would see the model's app as. */
export type AssistantKind = keyof typeof assistants;

/** What a conversation starts from, and the references the checks need. */
export interface World {
  ana: { id: string; personalSpaceId: string };
  cara: { id: string };
  spaces: { acme: string; northwind: string; relaunch: string; fjord: string; kitchen: string; running: string; personal: string };
  items: { budgetHint: string; golive: string; shortAnswers: string; reportRule: string; gunnarMorning: string };
  pages: { oldCms: string; relaunch: string };
  tasks: { timeline: string; renewal: string };
  proposals: { fridays: string };
  /** When the world was made: anything newer was made in the conversation. */
  madeAt: Date;
  assistant: Assistant;
}

const as = <T>(bench: Bench, principal: Principal, fn: (s: Session) => Promise<T>) => withPrincipal(bench.sql, principal, fn);

/** A page with its items, on the shared side or the writer's own. Returns the page and its items' ids. */
async function page(s: Session, spaceId: string, title: string, type: string | undefined, items: string[], shared = true) {
  const pageId = await createPage(s, { spaceId, title, type, shared });
  const ids: string[] = [];
  for (const body of items) ids.push((await writeItem(s, { pageId, body, shared })).id);
  return { pageId, ids };
}

/**
 * Ana Berg works at Acme, a consultancy, with her colleague Cara Lund. Acme's client Northwind is
 * relaunching its website, and Fjord Bank is a client only Ana works for. Ana also keeps a kitchen
 * renovation and her running in her personal space. Acme and its clients have rules, a skill, and
 * pages written by both of them; Ana's assistant has saved some things only she sees, kept two
 * tasks for her and proposed a rule she hasn't decided yet.
 */
export async function makeWorld(bench: Bench, kind: AssistantKind): Promise<World> {
  const ana = await join(bench, 'Ana Berg');
  const cara = await join(bench, 'Cara Lund');
  const anaDirect: Principal = { person: ana.id, direct: true };
  const anasAssistant: Principal = { person: ana.id, agent: assistants[kind].client_name };
  const caraDirect: Principal = { person: cara.id, direct: true };

  const spaces = await as(bench, anaDirect, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    const northwind = await createSpace(s, { name: 'Northwind', parentId: acme });
    const relaunch = await createSpace(s, { name: 'Website relaunch', parentId: northwind });
    const fjord = await createSpace(s, { name: 'Fjord Bank', parentId: acme, closed: true });
    const kitchen = await createSpace(s, { name: 'Kitchen renovation', parentId: ana.personalSpaceId });
    const running = await createSpace(s, { name: 'Running', parentId: ana.personalSpaceId });
    return { acme, northwind, relaunch, fjord, kitchen, running, personal: ana.personalSpaceId };
  });

  // Rules and a skill, which only people write.
  const rules = await as(bench, anaDirect, async (s) => {
    const shortAnswers = await addRule(s, { spaceId: spaces.personal, kind: 'preference', body: 'Keep answers short, with the most important point first.' });
    await addRule(s, { spaceId: spaces.acme, kind: 'requirement', body: 'Never name one client in documents written for another client.', shared: true });
    const reportRule = await addRule(s, {
      spaceId: spaces.acme,
      kind: 'preference',
      body: 'Write status reports in English, with the date first in the title, such as "2026-10-20 Status".',
      shared: true,
    });
    await addRule(s, { spaceId: spaces.northwind, kind: 'requirement', body: 'Send Northwind prices only through their procurement portal, never by email.', shared: true });
    await saveSkill(s, {
      spaceId: spaces.acme,
      shared: true,
      files: [
        {
          path: 'SKILL.md',
          body:
            '---\nname: status-report\ndescription: The status report Acme sends a client every other Friday.\n---\n' +
            'Write it from what happened since the last report.\n\n1. Where the work stands, in two sentences.\n2. What was done, in at most three points.\n' +
            '3. What is next, with dates.\n4. Risks, each with who owns it.\n\nEnd with the date of the next report.',
        },
      ],
    });
    return { shortAnswers: shortAnswers.id, reportRule: reportRule.id };
  });

  // What Ana and Cara wrote for everyone in Acme and its clients.
  const shared = await as(bench, anaDirect, async (s) => {
    await writeOverview(s, {
      spaceId: spaces.northwind,
      text: "Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.",
      shared: true,
    });
    const relaunch = await page(s, spaces.relaunch, 'Website relaunch', 'project', [
      'The relaunch goes live on 1 March 2027.',
      'The budget is 450,000 NOK, approved by Gunnar Holm on 2 October.',
      'Cara owns the content migration.',
      'Per Hansen at Northwind owns hosting and DNS.',
      "Risk: the CMS vendor's API allows only 10 requests a second, which slows the content migration. Lars at the vendor is looking into it.",
      'Risk: the cookie consent banner needs approval from Mona Lie in Northwind legal before launch.',
      'The design was approved at the design review on 23 September.',
      'Status on 15 October: 60% of the content is migrated.',
    ]);
    await page(s, spaces.relaunch, 'Gunnar Holm', 'person', [
      "Gunnar Holm is Northwind's head of marketing and the sponsor of the website relaunch.",
      'Gunnar prefers email over calls, and short summaries over long reports.',
      'Gunnar joined Northwind in 2023 from Fjordline.',
    ]);
    await page(s, spaces.relaunch, 'Decision: hosting on Azure', 'decision', [
      'Northwind chose Azure to host the new website, at the steering group meeting on 14 October.',
      "The reason: Northwind's IT team already runs Azure, and it keeps the data in Norway.",
      'AWS was the alternative. It was about 15% cheaper, but would have needed a new contract.',
    ]);
    await page(s, spaces.relaunch, 'Steering group meeting, 14 October', 'meeting', [
      'Present: Gunnar Holm, Per Hansen, Ana Berg and Cara Lund.',
      'Decided to host the new website on Azure.',
      'Decided to keep the go-live date of 1 March 2027.',
      'The next steering group meeting is on 11 November.',
    ]);
    await page(s, spaces.fjord, 'Fjord Bank contract', 'contract', [
      "Fjord Bank's contract renews on 1 January 2027.",
      "Either side can end it with three months' notice.",
      'The price is 1.2 million NOK a year.',
      "Kari Lie, Fjord Bank's CFO, signs anything above 100,000 NOK.",
    ]);
    await page(s, spaces.fjord, 'Kari Lie', 'person', ["Kari Lie is Fjord Bank's CFO.", 'Kari wants a written summary after every meeting.']);
    await page(s, spaces.acme, 'Time sheets', undefined, ['Time sheets are due every Friday at 15:00.', 'Hours go on the client project, never on internal work.']);
    await page(s, spaces.acme, 'Office', undefined, ['The office is at Storgata 12 in Oslo.', 'The meeting room Fjellet seats eight.']);
    return { golive: relaunch.ids[0], relaunchPage: relaunch.pageId };
  });

  // More of what a few months on a project leaves behind, so the space is as busy as a real one.
  await as(bench, caraDirect, async (s) => {
    const pages: [string, string | undefined, string[]][] = [
      ['Per Hansen', 'person', ["Per Hansen is Northwind's IT lead.", 'Per wants changes to DNS announced a week ahead.']],
      ['Mona Lie', 'person', ["Mona Lie is Northwind's lawyer.", 'Mona reviews everything about cookies and personal data.']],
      ['Lise Berg', 'person', ["Lise Berg runs procurement at Northwind.", 'Lise needs purchase orders before any invoice.']],
      ['Lars Moe', 'person', ['Lars Moe is the account manager at the CMS vendor.']],
      ['Kickoff, 2 September', 'meeting', ['Kickoff with Gunnar, Per and Lise.', 'Agreed to meet every other Tuesday.']],
      ['Design review, 23 September', 'meeting', ['Gunnar approved the new design.', 'The product pages get larger images.']],
      ['Content workshop, 7 October', 'meeting', ['Agreed which old pages to drop: about 40% of them.', 'Northwind writes the new texts for the product pages.']],
      ['Analytics', undefined, ['The new site uses Matomo instead of Google Analytics.', 'Northwind wants the same monthly report as today.']],
      ['Accessibility', undefined, ['The site must meet WCAG 2.1 AA, which Norwegian law requires.', 'An outside audit is planned for February.']],
      ['Search engine optimization', undefined, ['Old addresses get redirects to the new pages.', 'The redirect list is in the shared drive.']],
      ['Image library', undefined, ['Northwind buys photos from a stock library, with a licence until 2028.']],
      ['Translations', undefined, ['The site launches in Norwegian and English.', 'Swedish comes later in 2027.']],
      ['Content migration', undefined, ['About 1,200 pages move from the old CMS.', 'Product pages move first, news last.']],
      ['Hosting', undefined, ['Staging runs on Azure from 1 November.']],
      ['Newsletter', undefined, ['The newsletter signup moves to the new site at launch.']],
      ['Launch checklist', undefined, ['Redirects, analytics, cookie banner, DNS change, and a last content check.']],
    ];
    for (const [title, type, items] of pages) await page(s, spaces.relaunch, title, type, items);
  });

  // What Ana's assistant saved, kept and proposed for her alone.
  const own = await as(bench, anasAssistant, async (s) => {
    const budgetHint = await writeItem(s, { pageId: shared.relaunchPage, body: 'Gunnar hinted that the budget may grow by 100,000 NOK if the pilot goes well.' });
    const gunnarPage = (await s.tx<{ pageId: string }[]>`
      select page_id from content where kind = 'title' and body = 'Gunnar Holm' and space_id = ${spaces.relaunch}::uuid
    `)[0].pageId;
    const gunnarMorning = await writeItem(s, { pageId: gunnarPage, body: 'Gunnar is easiest to reach before 9 in the morning.' });
    const oldCms = await page(s, spaces.relaunch, 'Old CMS notes', undefined, ['The old CMS is Episerver 7. Its licence ends in December 2026.'], false);
    await page(s, spaces.kitchen, 'Erik Dahl', 'person', ['Erik Dahl is the carpenter for the kitchen.', 'Erik starts on 3 November.', 'His quote is 85,000 NOK.'], false);
    await page(s, spaces.running, 'Oslo Marathon 2027', undefined, ['The race is on 18 September 2027.', 'The goal is under 3 hours 45 minutes.'], false);
    const timeline = await addTask(s, { spaceId: spaces.relaunch, title: 'Send Gunnar the revised timeline', due: '2026-10-22' });
    const renewal = await addTask(s, { spaceId: spaces.fjord, title: 'Prepare the renewal proposal for Fjord Bank', due: '2026-11-15' });
    const fridays = await proposeRule(s, { action: 'add rule', spaceId: spaces.acme, kind: 'preference', text: 'Send status reports to clients on Fridays.' });
    return { budgetHint: budgetHint.id, gunnarMorning: gunnarMorning.id, oldCms: oldCms.pageId, timeline: timeline.id, renewal: renewal.id, fridays: fridays.id };
  });

  await as(bench, caraDirect, (s) =>
    addTask(s, { spaceId: spaces.northwind, title: 'Book a room for the steering group meeting on 11 November', shared: true }),
  );

  const assistant = new Assistant(bench.homing.url, assistants[kind]);
  await assistant.connect(ana.browser);
  const [{ now }] = await bench.admin`select clock_timestamp() as now`;
  return {
    ana: { id: ana.id, personalSpaceId: ana.personalSpaceId },
    cara: { id: cara.id },
    spaces,
    items: { budgetHint: own.budgetHint, golive: shared.golive, shortAnswers: rules.shortAnswers, reportRule: rules.reportRule, gunnarMorning: own.gunnarMorning },
    pages: { oldCms: own.oldCms, relaunch: shared.relaunchPage },
    tasks: { timeline: own.timeline, renewal: own.renewal },
    proposals: { fridays: own.fridays },
    madeAt: now as Date,
    assistant,
  };
}
