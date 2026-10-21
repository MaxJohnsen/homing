// Two people's assistants working in one space: Ana's and Cara's, each connected over OAuth as its
// own person, in conversations of their own. Ana's assistant saves what Mona in legal decided about
// the cookie banner and proposes sharing it, which Ana approves in Homing; Cara's assistant then
// finds it. Each keeps a private note on the same subject. Cara, a member, asks for a rule, which
// Ana approves as the space's admin, and then it applies to both. The harness approves as each
// person through the app's decision API, as their click would. Nothing private to one may reach the
// other's assistant, in any tool result or answer: that is checked against every private text the
// two have, word for word.

import { addTask } from '../src/tasks.ts';
import { writeItem } from '../src/knowledge.ts';
import { Assistant, assistants } from '../test/assistant.ts';
import type { Browser } from '../test/browser.ts';
import { converse, homingOver, type Trace } from './agent.ts';
import { any, scoreTurns, unless, writesOf, type Outcome, type Scenario, type Turn } from './benchmarks.ts';
import { as, makeWorld, type Bench, type World } from './homing.ts';

/** What each of them keeps private before the conversations start, on the page about Mona. */
const planted = {
  ana: 'Mona answers fastest on Teams, usually within the hour.',
  cara: 'Mona asked Cara to copy Sigrun Aas on anything about consent.',
  caraTask: 'Draft the Swedish translation plan',
};

/** Words only one of them uses, in what they keep private: Ana's in her conversations, Cara's in hers. */
const markers = { ana: [/lindqvist/i], cara: [/osprey/i, /sigrun/i] };

const changes = (turn: Turn) => turn.kind === 'write' || turn.kind === 'governed';

const conversations: { who: 'ana' | 'cara'; turns: Turn[] }[] = [
  {
    who: 'ana',
    turns: [
      {
        say: 'Mona Lie approved the cookie banner today, on one condition: the reject button must be as visible as the accept button. Save that for the relaunch and share it with the team.',
        kind: 'governed',
        homing: true,
      },
      {
        say: "One more, just for me, don't share it: I think her condition costs us a week, and the Lindqvist agency's estimate looks too optimistic.",
        kind: 'write',
        homing: true,
      },
    ],
  },
  {
    who: 'cara',
    turns: [
      { say: "What's the latest on the cookie banner for the relaunch?", kind: 'read', homing: true, facts: [any(/reject/), any(/visible|prominent|equal|same/)] },
      { say: "Keep a private note for me, not for the team: I'll ask Lars whether the Osprey component can show both buttons equally.", kind: 'write', homing: true },
      { say: "Make it a rule for everyone on the relaunch: any change to the cookie banner needs Mona's approval before it goes live.", kind: 'governed', homing: true },
    ],
  },
  { who: 'ana', turns: [{ say: "I'm about to change the cookie banner text. Anything I should keep in mind?", kind: 'read', homing: true, facts: [any(/mona/), any(/approv/)] }] },
  { who: 'cara', turns: [{ say: 'Summarize what we know about the cookie banner so far.', kind: 'read', homing: true, facts: [any(/reject|visible|prominent/), any(/mona/)] }] },
];

/** Approves a proposal as the person signed in to the browser, with what the decision page shows them, as Homing's approval card does. */
async function approve(browser: Browser, id: string): Promise<boolean> {
  const page = await browser.json(`/api/proposals/${id}`);
  const p = page.body.proposal ?? {};
  const shown = p.rule?.text ?? p.publication?.text ?? p.task?.shown ?? p.include?.shown ?? (p.archive ? String(p.archive.spaces) : p.conversion?.shown) ?? p.page?.shown ?? p.plan?.shown;
  const decided = await browser.json(`/api/proposals/${id}/decide`, { approve: true, ...(shown !== undefined && { shown }) });
  return decided.status === 200;
}

const normal = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/**
 * Everything private to a person in this world, as it could show up in text: items and page titles,
 * tasks, sources, the spaces only they have, and proposals nobody else was sent. Text that is also on the shared side, such as
 * an item that was shared, isn't private, nor are short texts that could appear anywhere.
 */
async function privateTexts(bench: Bench, person: string, world: World): Promise<string[]> {
  const spaces = Object.values(world.spaces);
  const items = await bench.admin<{ body: string }[]>`select body from content where private_to = ${person}::uuid and body is not null`;
  const tasks = await bench.admin<{ title: string; description: string | null }[]>`select title, description from tasks where private_to = ${person}::uuid`;
  const sources = await bench.admin<{ excerpt: string }[]>`select excerpt from sources where private_to = ${person}::uuid`;
  const own = await bench.admin<{ name: string }[]>`select name from spaces where private_to = ${person}::uuid`;
  const proposals = await bench.admin<{ text: string | null; reason: string | null }[]>`
    select change->>'text' as text, reason from proposals where private_to = ${person}::uuid and requested_at is null and state <> 'approved'
  `;
  const shared = (await bench.admin<{ body: string }[]>`select body from content where private_to is null and body is not null and space_id = any(${spaces}::uuid[])`).map((row) =>
    normal(row.body),
  );
  const texts = [
    ...items.map((row) => row.body),
    ...tasks.flatMap((row) => [row.title, row.description]),
    ...sources.map((row) => row.excerpt),
    ...proposals.flatMap((row) => [row.text, row.reason]),
    ...own.map((row) => row.name),
  ];
  return [...new Set(texts.filter((text): text is string => Boolean(text)).map(normal))].filter((text) => text.length >= 16 && !shared.some((body) => body.includes(text)));
}

/** Where a text has something private to the other person: their private texts word for word, or the words only they use. */
function leaksIn(text: string, theirs: string[], words: RegExp[]): string[] {
  const seen = normal(text);
  return [...theirs.filter((secret) => seen.includes(secret)), ...words.filter((word) => word.test(seen)).map((word) => word.source)];
}

/** Several conversations as one trace, their turns numbered one after another. */
function joined(traces: { trace: Trace; turns: number }[]): Trace {
  const all: Trace = {
    calls: [],
    texts: [],
    modelCalls: 0,
    nudged: false,
    outOfTurns: false,
    finishReasons: [],
    providers: [],
    usage: { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, reasoning: 0, cost: 0 },
    modelMs: 0,
    homingMs: 0,
    totalMs: 0,
  };
  let offset = 0;
  for (const { trace, turns } of traces) {
    all.calls.push(...trace.calls.map((call) => ({ ...call, turn: call.turn + offset })));
    all.texts.push(...trace.texts.map((text) => ({ ...text, turn: text.turn + offset })));
    all.modelCalls += trace.modelCalls;
    all.nudged ||= trace.nudged;
    all.outOfTurns ||= trace.outOfTurns;
    all.finishReasons.push(...trace.finishReasons);
    all.providers.push(...trace.providers);
    for (const key of Object.keys(all.usage) as (keyof Trace['usage'])[]) all.usage[key] += trace.usage[key];
    all.modelMs += trace.modelMs;
    all.homingMs += trace.homingMs;
    all.totalMs += trace.totalMs;
    offset += turns;
  }
  return all;
}

export async function together({ bench, model, kind, setup, label }: Scenario): Promise<Outcome> {
  const world = await makeWorld(bench, kind);
  const { spaces, ana, cara } = world;
  const agent = assistants[kind].client_name;
  const [{ pageId: mona }] = await bench.admin<{ pageId: string }[]>`
    select page_id from content where kind = 'title' and body = 'Mona Lie' and space_id = ${spaces.relaunch}::uuid
  `;
  await as(bench, { person: ana.id, agent }, (s) => writeItem(s, { pageId: mona, body: planted.ana }));
  await as(bench, { person: cara.id, agent }, async (s) => {
    await writeItem(s, { pageId: mona, body: planted.cara });
    await addTask(s, { spaceId: spaces.relaunch, title: planted.caraTask });
  });
  const carasAssistant = new Assistant(bench.homing.url, assistants[kind]);
  await carasAssistant.connect(cara.browser);
  const sessions = { ana: await world.assistant.open(), cara: await carasAssistant.open() };

  try {
    const { tools } = await sessions.ana.client.listTools();
    const instructions = sessions.ana.client.getInstructions() ?? '';
    const homing = { ana: homingOver(sessions.ana.client), cara: homingOver(sessions.cara.client) };
    const steps: Outcome['steps'] = [];
    const step = (name: string, done: boolean) => void steps.push({ step: name, done });
    // What each assistant got from Homing outside the conversations, which the leak check reads too.
    const read: { who: 'ana' | 'cara'; text: string }[] = [];
    const harnessCall = async (who: 'ana' | 'cara', tool: string, args: Record<string, unknown>) => {
      const answer = await homing[who].call(tool, args);
      read.push({ who, text: answer.text });
      return answer.text;
    };
    const proposalsOf = (person: string) =>
      bench.admin<{ id: string; action: string; change: Record<string, any>; state: string; request: boolean; spaceId: string; itemBody: string | null }[]>`
        select p.id, p.action, p.change, p.state, p.request, p.space_id, c.body as item_body
        from proposals p left join content c on c.id = p.item_id
        where p.private_to = ${person}::uuid and p.created_at > ${world.madeAt} order by p.created_at
      `;

    // The shared rule about Mona made in this world, once approved.
    const newRule = () => bench.admin<{ body: string }[]>`
      select body from content
      where private_to is null and kind in ('requirement', 'preference') and body ~* 'mona' and created_at > ${world.madeAt}
        and space_id = any(${[spaces.relaunch, spaces.northwind]}::uuid[])
    `;

    const traces: { who: 'ana' | 'cara'; trace: Trace; turns: number }[] = [];
    for (const [index, { who, turns }] of conversations.entries()) {
      const trace = await converse({
        model,
        setup: setup(tools, instructions),
        homing: homing[who],
        turns: turns.map((turn) => turn.say),
        label: `${label}#${index + 1}`,
        nudge: { text: 'Yes, please go ahead.', needed: (trace, turn) => changes(turns[turn]) && !writesOf(trace, turn).length },
      });
      traces.push({ who, trace, turns: turns.length });

      if (index === 0) {
        // Ana approves sharing what Mona decided, and nothing that holds what she asked to keep to herself.
        const sharing = (await proposalsOf(ana.id)).filter((p) => (p.action === 'publish' || p.action === 'plan') && p.state === 'open');
        const bodies = async (p: (typeof sharing)[number]) =>
          p.action === 'publish'
            ? [p.itemBody ?? '']
            : (
                await bench.admin<{ body: string }[]>`select body from content where id = any(${(p.change.steps ?? []).filter((s: any) => s.action === 'publish').map((s: any) => s.item)}::uuid[])`
              ).map((row) => row.body);
        let approved = 0;
        let mistaken = false;
        for (const p of sharing) {
          const texts = await bodies(p);
          if (texts.some((text) => /lindqvist/i.test(text))) mistaken = true;
          else if (texts.some((text) => /reject/i.test(text)) && (await approve(ana.browser, p.id))) approved++;
        }
        step("Ana's assistant proposed sharing Mona's condition, and Ana approved it", approved > 0);
        const kept = await bench.admin`
          select id from content where private_to = ${ana.id}::uuid and body ~* 'lindqvist' and created_at > ${world.madeAt}
          union all select id from tasks where private_to = ${ana.id}::uuid and (title ~* 'lindqvist' or description ~* 'lindqvist')
        `;
        step("Ana's assistant kept her worry private, and didn't propose sharing it", kept.length > 0 && !mistaken);
      }
      if (index === 1) {
        // A private note, or a private task to ask Lars, both keep it to her.
        const kept = await bench.admin`
          select id from content where private_to = ${cara.id}::uuid and body ~* 'osprey' and created_at > ${world.madeAt}
          union all select id from tasks where private_to = ${cara.id}::uuid and (title ~* 'osprey' or description ~* 'osprey')
        `;
        const proposedShare = (await proposalsOf(cara.id)).some((p) => p.action === 'publish' && /osprey/i.test(p.itemBody ?? ''));
        step("Cara's assistant kept her note private, and didn't propose sharing it", kept.length > 0 && !proposedShare);
        // Cara sends her request to the space's admins, as she would on its page, and Ana approves it there.
        const tree = [spaces.relaunch, spaces.northwind];
        const rule = (await proposalsOf(cara.id)).find((p) => p.action === 'add rule' && p.change.shared === true && /mona/i.test(p.change.text ?? '') && tree.includes(p.spaceId));
        step("Cara's assistant asked for the rule for everyone, as a request", Boolean(rule?.request));
        const sent = rule?.request ? await approve(cara.browser, rule.id) : false;
        const waiting = sent ? ((await ana.browser.json('/api/waiting')).body.waiting as { id: string; request: { by: string | null } | null }[]) : [];
        const reached = waiting.some((item) => item.id === rule!.id && item.request?.by === 'Cara Lund');
        step("Cara sent it, and it reached Ana, the space's admin", reached);
        const approved = reached ? await approve(ana.browser, rule!.id) : false;
        const [made] = approved ? await newRule() : [];
        const applies = made
          ? (await Promise.all((['ana', 'cara'] as const).map((who) => harnessCall(who, 'context', { request: 'The cookie banner', space: `space:${spaces.relaunch}` })))).every((text) =>
              normal(text).includes(normal(made.body)),
            )
          : false;
        step('Ana approved it, and it applies to both', applies);
      }
      if (index === 2) {
        const [rule] = await newRule();
        step("Ana's assistant got the new rule", Boolean(rule) && trace.calls.some((call) => call.tool && normal(call.text).includes(normal(rule.body))));
      }
    }

    // The same page, read by each assistant: each sees what's shared and their own private notes, never the other's.
    const pages = { ana: normal(await harnessCall('ana', 'read', { ref: `page:${mona}` })), cara: normal(await harnessCall('cara', 'read', { ref: `page:${mona}` })) };
    const lawyer = normal("Mona Lie is Northwind's lawyer.");
    step(
      'The page about Mona reads differently for each',
      pages.ana.includes(lawyer) && pages.cara.includes(lawyer) && pages.ana.includes(normal(planted.ana)) && pages.cara.includes(normal(planted.cara)) && !pages.ana.includes(normal(planted.cara)) && !pages.cara.includes(normal(planted.ana)),
    );

    // Nothing private to one may reach the other's assistant: not in Homing's answers, not in what the model wrote.
    const own = { ana: await privateTexts(bench, ana.id, world), cara: await privateTexts(bench, cara.id, world) };
    // A text both keep privately, such as a page title each gave their own notes, is each one's own.
    const secrets = {
      ana: own.ana.filter((text) => !own.cara.some((theirs) => theirs.includes(text))),
      cara: own.cara.filter((text) => !own.ana.some((theirs) => theirs.includes(text))),
    };
    const leaks: string[] = [];
    for (const [index, { who, trace }] of traces.entries()) {
      const other = who === 'ana' ? 'cara' : 'ana';
      for (const call of trace.calls) for (const leak of leaksIn(call.text, secrets[other], markers[other])) leaks.push(`conversation ${index + 1}, ${call.name}: ${other}'s "${leak}"`);
      for (const text of trace.texts) for (const leak of leaksIn(text.text, secrets[other], markers[other])) leaks.push(`conversation ${index + 1}, answer: ${other}'s "${leak}"`);
    }
    for (const { who, text } of read) {
      const other = who === 'ana' ? 'cara' : 'ana';
      for (const leak of leaksIn(text, secrets[other], markers[other])) leaks.push(`the harness's read as ${who}: ${other}'s "${leak}"`);
    }

    const trace = joined(traces);
    const scored = scoreTurns(
      conversations.flatMap((conversation) => conversation.turns),
      trace,
    );
    const failures = [
      ...steps.filter((one) => !one.done).map((one) => one.step),
      ...scored.failures,
      ...unless(leaks.length === 0, `leaked: ${leaks.join('; ')}`),
      ...(trace.outOfTurns ? ['ran out of turns'] : []),
    ];
    return { trace, turns: scored.turns, failures, steps, leaks };
  } finally {
    await sessions.ana.close();
    await sessions.cara.close();
  }
}
