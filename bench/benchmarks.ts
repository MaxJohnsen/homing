// Benchmarks 1 to 3 (spec, Benchmarks): what is asked, of which variant, and how each conversation
// is judged. Checks are deterministic: which tools were called with which arguments, what ended
// up in Homing's database, and for answers, whether the expected facts are in them. No model
// judges another.

import type { Tool } from '@modelcontextprotocol/client';
import type { Setup, Trace } from './agent.ts';
import type { AssistantKind, Bench, World } from './homing.ts';
import type { Model } from './openrouter.ts';
import { contextSized, dedicated, mcpOnly, recommended, type ContextSize } from './variants.ts';

/** Alternatives for one fact: an answer has the fact when it matches any of them. */
export type Fact = RegExp[];

/** One thing the user says in a conversation, and what should come of it. */
export interface Turn {
  say: string;
  kind: Task['kind'];
  /**
   * Whether Homing should be used for it: true when it makes the answer or the action better,
   * false when it doesn't. Left out when either is fine, such as a follow-up the conversation may
   * already answer.
   */
  homing?: boolean;
  facts?: Fact[];
  need?: number;
  /** Another tool it belongs to, such as web_search. */
  tool?: string;
}

/** How a turn went: whether Homing and the tool it belongs to were used, and the facts in its answer. */
export interface TurnResult {
  homing?: boolean;
  used: boolean;
  tool?: string;
  usedTool?: boolean;
  facts?: { found: number; of: number };
}

/** A conversation the harness runs itself, such as two people's assistants working together. */
export interface Scenario {
  bench: Bench;
  model: Model;
  kind: AssistantKind;
  setup(tools: Tool[], instructions: string): Setup;
  label: string;
}

/** What came of a scenario: every conversation in it as one trace, and what wasn't done. */
export interface Outcome {
  trace: Trace;
  turns: TurnResult[];
  failures: string[];
  steps: { step: string; done: boolean }[];
  /** Where one person's assistant got something private to the other. There must be none. */
  leaks: string[];
}

export interface Task {
  id: string;
  prompt: string;
  /** What kind of request it is: answered from Homing, saving something, a governed change, or one Homing has nothing to do with. */
  kind: 'read' | 'write' | 'governed' | 'control';
  /** Facts a good answer has, and how many of them it needs (all by default). */
  facts?: Fact[];
  need?: number;
  /** For benchmark 2: the writes expected, in order, as `remember` or `act:` and the action. */
  expect?: string[];
  /** What must be true in Homing afterwards. Returns what isn't. */
  check?(look: Look): Promise<string[]>;
  /** Benchmark 1's harder conversations: what kind of conversation it is. */
  group?: string;
  /** What the user says, turn by turn, each labeled. The prompt is the first. */
  turns?: Turn[];
  /** Runs the conversations itself, instead of one conversation with the prompt. */
  run?(scenario: Scenario): Promise<Outcome>;
}

export interface Benchmark {
  id: 'b1' | 'b2' | 'b3' | 'b1-hard';
  name: string;
  variants: string[];
  tasks: Task[];
  setup(variant: string, tools: Tool[], instructions: string): Setup;
}

// Dates the way models write them: "1 March", "March 1st", "2027-03-01".
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function date(day: number, month: string): Fact {
  const m = months.indexOf(month) + 1;
  const iso = `-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const short = month.slice(0, 3);
  return [new RegExp(`\\b${day}(st|nd|rd|th)?\\.?\\s+(of\\s+)?${short}`), new RegExp(`${short}[a-z]*\\.?\\s+${day}(st|nd|rd|th)?\\b`), new RegExp(iso)];
}
export const any = (...patterns: RegExp[]): Fact => patterns;

// Facts several tasks look for, matched only where they're said, not where a word happens to appear.
export const perOwnsHosting = any(/hansen|\bper\b[^.\n]{0,60}\b(hosting|dns)\b|\b(hosting|dns)\b[^.\n]{0,60}\bper\b/);
export const prefersEmail = any(/(prefers?|rather have|likes)[^.\n]{0,30}\be-?mails?\b|e-?mails? (over|rather than|instead of|before) (a |phone )?calls?/);
export const itTeamRunsAzure = any(/\bit team|already (runs?|uses|using|on|has|in)\b/);

/** The world after a conversation, read with the admin role but only ever about this world's people and spaces. */
export class Look {
  readonly world: World;
  readonly trace: Trace;
  private readonly bench: Bench;

  constructor(bench: Bench, world: World, trace: Trace) {
    this.bench = bench;
    this.world = world;
    this.trace = trace;
  }

  /** Ana's current items saved in the conversation, in the given spaces. */
  async newItems(spaces: string[]) {
    return this.bench.admin<{ id: string; body: string; spaceId: string }[]>`
      select c.id, c.body, c.space_id from content c
      where c.private_to = ${this.world.ana.id}::uuid and c.kind = 'text' and c.created_at > ${this.world.madeAt}
        and c.space_id = any(${spaces}::uuid[])
        and not exists (select from content r where r.supersedes = c.id)
    `;
  }

  async newTasks(spaces: string[]) {
    return this.bench.admin<{ id: string; title: string; due: string | null; doneAt: Date | null }[]>`
      select id, title, to_char(due, 'YYYY-MM-DD') as due, done_at from tasks
      where private_to = ${this.world.ana.id}::uuid and created_at > ${this.world.madeAt} and space_id = any(${spaces}::uuid[])
    `;
  }

  async task(id: string) {
    const [task] = await this.bench.admin<{ doneAt: Date | null; title: string }[]>`select done_at, title from tasks where id = ${id}::uuid`;
    return task;
  }

  /** Proposals made for Ana in the conversation. */
  async newProposals() {
    return this.bench.admin<
      { id: string; action: string; spaceId: string; itemId: string | null; taskId: string | null; pageId: string | null; change: Record<string, any>; state: string; itemBody: string | null }[]
    >`
      select p.id, p.action, p.space_id, p.item_id, p.task_id, p.page_id, p.change, p.state, c.body as item_body
      from proposals p left join content c on c.id = p.item_id
      where p.private_to = ${this.world.ana.id}::uuid and p.created_at > ${this.world.madeAt}
    `;
  }

  async proposal(id: string) {
    const [proposal] = await this.bench.admin<{ state: string }[]>`select state from proposals where id = ${id}::uuid`;
    return proposal;
  }

  async space(id: string) {
    const [space] = await this.bench.admin<{ name: string; archivedAt: Date | null }[]>`select name, archived_at from spaces where id = ${id}::uuid`;
    return space;
  }

  /** Spaces made in the conversation, under the world's spaces. */
  async newSpaces() {
    const parents = Object.values(this.world.spaces);
    return this.bench.admin<{ id: string; name: string; parentId: string; privateTo: string | null }[]>`
      select id, name, parent_id, private_to from spaces
      where parent_id = any(${parents}::uuid[]) and created_at > ${this.world.madeAt}
    `;
  }

  async pageArchived(id: string) {
    const [page] = await this.bench.admin<{ archivedAt: Date | null }[]>`select archived_at from pages where id = ${id}::uuid`;
    return page?.archivedAt !== null;
  }
}

export const northwindTree = (w: World) => [w.spaces.northwind, w.spaces.relaunch];

/** "saved 15 March", or why not. */
export const unless = (ok: boolean, why: string) => (ok ? [] : [why]);

// What Homing should do, whichever way the model gets there.
const checks = {
  movedTo15March: async (look: Look) => {
    const items = await look.newItems(northwindTree(look.world));
    return unless(items.some((item) => date(15, 'march').some((pattern) => pattern.test(item.body.toLowerCase()))), 'no new item about 15 March in Northwind');
  },
  // A reminder works from the personal space too, so that counts.
  fridayTask: async (look: Look) => {
    const tasks = await look.newTasks([look.world.spaces.personal, look.world.spaces.acme, ...northwindTree(look.world)]);
    const task = tasks.find((candidate) => /gunnar/i.test(candidate.title));
    return [...unless(Boolean(task), 'no new task about Gunnar'), ...unless(task?.due === '2026-10-23', `due ${task?.due ?? 'never'}, not Friday 2026-10-23`)];
  },
  timelineDone: async (look: Look) => unless(Boolean((await look.task(look.world.tasks.timeline))?.doneAt), 'the timeline task is still open'),
  bulletRule: async (look: Look) => {
    const proposals = (await look.newProposals()).filter((p) => p.action === 'add rule');
    const rule = proposals.find((p) => /bullet/i.test(p.change.text ?? ''));
    return [
      ...unless(Boolean(rule), 'no proposed rule about bullet points'),
      ...unless(!rule || [look.world.spaces.northwind, look.world.spaces.relaunch].includes(rule.spaceId), 'the rule is proposed outside Northwind'),
    ];
  },
  publishHint: async (look: Look) =>
    unless((await look.newProposals()).some((p) => p.action === 'publish' && p.itemId === look.world.items.budgetHint), "no proposal to share Gunnar's hint"),
  caraToFjord: async (look: Look) =>
    unless(
      (await look.newProposals()).some((p) => p.action === 'change members' && p.spaceId === look.world.spaces.fjord && p.change.member === 'add' && p.change.person === look.world.cara.id),
      'no proposal to add Cara to Fjord Bank',
    ),
};

/** Benchmark 1: does the model use Homing when it should, with MCP alone and with the recommended instruction? */
export const b1: Benchmark = {
  id: 'b1',
  name: 'MCP reliability',
  variants: ['mcp-only', 'instruction'],
  setup: (variant, tools, instructions) => (variant === 'mcp-only' ? mcpOnly(tools) : recommended(tools, instructions)),
  tasks: [
    { id: 'golive', kind: 'read', prompt: 'When does the Northwind website relaunch go live?', facts: [date(1, 'march')] },
    { id: 'budget', kind: 'read', prompt: "What's the budget for the website relaunch?", facts: [any(/450/)] },
    { id: 'who-gunnar', kind: 'read', prompt: 'Who is Gunnar Holm again?', facts: [any(/marketing/)] },
    { id: 'why-azure', kind: 'read', prompt: "Why did we go with Azure for Northwind's hosting?", facts: [itTeamRunsAzure] },
    { id: 'fjord-renewal', kind: 'read', prompt: 'When does the Fjord Bank contract renew?', facts: [date(1, 'january')] },
    { id: 'carpenter', kind: 'read', prompt: 'When is the carpenter starting on my kitchen?', facts: [date(3, 'november')] },
    { id: 'my-tasks', kind: 'read', prompt: 'What tasks do I have for the website relaunch?', facts: [any(/timeline/)] },
    { id: 'report-format', kind: 'read', prompt: 'How should I write my status reports for clients?', facts: [any(/english/), any(/date (first|at the (start|beginning))|(starts?|begins?|leads?) with the date|\d{4}-\d{2}-\d{2}/)] },
    {
      id: 'call-prep',
      kind: 'read',
      prompt: 'Help me prepare for my call with Gunnar tomorrow.',
      facts: [date(1, 'march'), any(/450/), any(/\bapi\b|rate limit|10 requests|migrat/), any(/cookie|consent|mona/), prefersEmail],
      need: 2,
    },
    { id: 'migration-owner', kind: 'read', prompt: 'Who owns the content migration on the relaunch?', facts: [any(/cara/)] },
    { id: 'moved', kind: 'write', prompt: 'Gunnar just told me the relaunch moves to 15 March. Can you note that?', check: checks.movedTo15March },
    { id: 'remind', kind: 'write', prompt: 'Remind me to call Gunnar about the budget on Friday.', check: checks.fridayTask },
    { id: 'tick-off', kind: 'write', prompt: 'I sent Gunnar the revised timeline this morning, so you can tick that off.', check: checks.timelineDone },
    {
      id: 'new-contact',
      kind: 'write',
      prompt: 'FYI, Per Hansen is leaving Northwind at the end of November. Ola Nordmann takes over hosting and DNS.',
      check: async (look) => unless((await look.newItems(northwindTree(look.world))).some((item) => /ola/i.test(item.body)), 'nothing about Ola saved in Northwind'),
    },
    {
      id: 'invoices',
      kind: 'write',
      prompt: 'Kari Lie at Fjord Bank told me today that they want monthly invoices from January. Keep that in mind.',
      check: async (look) => unless((await look.newItems([look.world.spaces.fjord])).some((item) => /monthly/i.test(item.body)), 'nothing about monthly invoices saved in Fjord Bank'),
    },
    {
      id: 'quote',
      kind: 'write',
      prompt: "Erik the carpenter's quote went up to 92,000 NOK.",
      check: async (look) => unless((await look.newItems([look.world.spaces.kitchen])).some((item) => /92/.test(item.body)), 'the new quote is not saved in Kitchen renovation'),
    },
    { id: 'bullet-rule', kind: 'governed', prompt: 'From now on, I want my Northwind status reports as bullet points.', check: checks.bulletRule },
    { id: 'share-hint', kind: 'governed', prompt: "Share Gunnar's hint about the budget with the rest of the team.", check: checks.publishHint },
    { id: 'add-cara', kind: 'governed', prompt: 'Add Cara to the Fjord Bank space.', check: checks.caraToFjord },
    {
      id: 'spain',
      kind: 'governed',
      prompt: "Set up a space for planning my trip to Spain next spring. It's just for me.",
      check: async (look) => unless((await look.newSpaces()).some((space) => /spain/i.test(space.name) && space.privateTo === look.world.ana.id), 'no space for Spain in the personal space'),
    },
    { id: 'percent', kind: 'control', prompt: "What's 15% of 2,400?", facts: [any(/360/)] },
    { id: 'translate', kind: 'control', prompt: "How do I say 'see you next week' in Norwegian?", facts: [any(/vi ses|neste uke/)] },
  ],
};

/** Benchmark 2: does the model build act's payloads as well as it uses dedicated tools, and choose between remember and act? */
export const b2: Benchmark = {
  id: 'b2',
  name: 'Tool design',
  variants: ['act', 'dedicated'],
  setup: (variant, tools, instructions) => (variant === 'act' ? recommended(tools, instructions) : dedicated(tools, instructions)),
  tasks: [
    { id: 'rule-private', kind: 'governed', expect: ['act:guidance.propose'], prompt: 'From now on, always write my status reports for Northwind as bullet points.', check: checks.bulletRule },
    {
      id: 'rule-shared',
      kind: 'governed',
      expect: ['act:guidance.propose'],
      prompt: 'Make it a rule for everyone in Acme: never send prices to a client by email.',
      check: async (look) => {
        const rule = (await look.newProposals()).find((p) => p.action === 'add rule' && /price/i.test(p.change.text ?? ''));
        return [
          ...unless(Boolean(rule), 'no proposed rule about prices'),
          ...unless(rule?.spaceId === look.world.spaces.acme, 'not in Acme'),
          ...unless(rule?.change.shared === true, 'not shared with everyone'),
          ...unless(rule?.change.kind === 'requirement', 'not a requirement'),
        ];
      },
    },
    {
      id: 'rule-remove',
      kind: 'governed',
      expect: ['act:guidance.propose'],
      prompt: "Remove my rule about keeping answers short. I don't want it anymore.",
      check: async (look) =>
        unless((await look.newProposals()).some((p) => p.action === 'remove rule' && p.itemId === look.world.items.shortAnswers), 'no proposal to remove the rule about short answers'),
    },
    {
      id: 'rule-change',
      kind: 'governed',
      expect: ['act:guidance.propose'],
      prompt: "Change Acme's status report rule so the date goes last in the title instead of first.",
      check: async (look) => {
        const change = (await look.newProposals()).find((p) => p.action === 'change rule' && p.itemId === look.world.items.reportRule);
        return [...unless(Boolean(change), "no proposal to change Acme's status report rule"), ...unless(/\blast\b|at the end\b|end of the title/i.test(change?.change.text ?? ''), 'the new wording keeps the date first')];
      },
    },
    { id: 'publish', kind: 'governed', expect: ['act:knowledge.publish'], prompt: "Share Gunnar's hint about the budget with everyone on the Northwind team.", check: checks.publishHint },
    { id: 'add-member', kind: 'governed', expect: ['act:members.change'], prompt: 'Add Cara to the Fjord Bank space.', check: checks.caraToFjord },
    {
      id: 'make-admin',
      kind: 'governed',
      expect: ['act:members.change'],
      prompt: 'Make Cara an admin of Northwind.',
      check: async (look) =>
        unless(
          (await look.newProposals()).some((p) => p.action === 'change members' && p.spaceId === look.world.spaces.northwind && p.change.member === 'make admin' && p.change.person === look.world.cara.id),
          'no proposal to make Cara an admin of Northwind',
        ),
    },
    {
      id: 'create-space',
      kind: 'governed',
      expect: ['act:space.create'],
      prompt: 'Create a space for our new client Polar Freight under Acme, for the whole team.',
      check: async (look) => {
        const proposed = (await look.newProposals()).some((p) => p.action === 'add space' && /polar/i.test(p.change.name ?? '') && p.change.in === look.world.spaces.acme && p.change.who === 'with others');
        const made = (await look.newSpaces()).some((space) => /polar/i.test(space.name) && space.parentId === look.world.spaces.acme);
        return unless(proposed || made, 'no Polar Freight space in Acme, made or waiting');
      },
    },
    {
      id: 'archive-space',
      kind: 'governed',
      expect: ['act:space.archive'],
      prompt: 'The kitchen renovation is finished. Archive that space.',
      check: async (look) => unless(Boolean((await look.space(look.world.spaces.kitchen))?.archivedAt), 'Kitchen renovation is not archived'),
    },
    {
      id: 'share-task',
      kind: 'governed',
      expect: ['act:task.share'],
      prompt: 'Share my task about sending Gunnar the revised timeline with everyone in the website relaunch.',
      check: async (look) => unless((await look.newProposals()).some((p) => p.action === 'share task' && p.taskId === look.world.tasks.timeline), 'no proposal to share the timeline task'),
    },
    // The first wording, before the smoke run: it doesn't say which team, and search can't find tasks.
    // Not in the results of 20 October 2026; it runs from the next run on.
    {
      id: 'share-task-vague',
      kind: 'governed',
      expect: ['act:task.share'],
      prompt: 'Share my task about the revised timeline with the rest of the team.',
      check: async (look) => unless((await look.newProposals()).some((p) => p.action === 'share task' && p.taskId === look.world.tasks.timeline), 'no proposal to share the timeline task'),
    },
    {
      id: 'withdraw',
      kind: 'governed',
      expect: ['act:proposal.withdraw'],
      prompt: 'Withdraw the rule I proposed about sending status reports on Fridays.',
      check: async (look) => unless((await look.proposal(look.world.proposals.fridays))?.state === 'withdrawn', 'the Fridays proposal is not withdrawn'),
    },
    {
      id: 'archive-page',
      kind: 'governed',
      expect: ['act:page.archive'],
      prompt: 'Archive my old CMS notes page, that system is gone.',
      // Since #90, a page in a space others can open, even one only Ana sees, is archived once she approves.
      check: async (look) => {
        const proposed = (await look.newProposals()).some((p) => p.action === 'archive page' && p.pageId === look.world.pages.oldCms);
        return unless(proposed || (await look.pageArchived(look.world.pages.oldCms)), 'the old CMS notes are not archived, nor waiting to be');
      },
    },
    {
      id: 'rename',
      kind: 'governed',
      expect: ['act:space.rename'],
      prompt: 'Rename my Running space to Marathon 2027.',
      check: async (look) => unless((await look.space(look.world.spaces.running))?.name.toLowerCase() === 'marathon 2027', 'Running is not renamed to Marathon 2027'),
    },
    { id: 'remind', kind: 'write', expect: ['remember'], prompt: 'Remind me to follow up with Gunnar on Friday.', check: checks.fridayTask },
    {
      id: 'note',
      kind: 'write',
      expect: ['remember'],
      prompt: 'Note that the relaunch budget went up to 500,000 NOK.',
      check: async (look) => [
        ...unless((await look.newItems(northwindTree(look.world))).some((item) => /500/.test(item.body)), 'the new budget is not saved in Northwind'),
        ...unless(!(await look.newProposals()).some((p) => p.action === 'publish'), 'it was proposed for sharing, which nobody asked for'),
      ],
    },
    { id: 'done', kind: 'write', expect: ['remember'], prompt: 'Mark my task about the revised timeline as done.', check: checks.timelineDone },
    {
      id: 'tell-team',
      kind: 'governed',
      expect: ['remember', 'act:knowledge.publish'],
      prompt: 'Tell the whole Northwind team that the relaunch moved to 15 March.',
      check: async (look) =>
        unless(
          (await look.newProposals()).some((p) => p.action === 'publish' && date(15, 'march').some((pattern) => pattern.test((p.itemBody ?? '').toLowerCase()))),
          'no proposal to share that the relaunch moved to 15 March',
        ),
    },
  ],
};

/** Benchmark 3: how much context should `context` give? */
export const b3: Benchmark = {
  id: 'b3',
  name: 'Context size',
  variants: ['core', 'relevant', 'full'],
  setup: (variant, tools, instructions) => contextSized(tools, instructions, variant as ContextSize),
  tasks: [
    {
      id: 'relaunch-status',
      kind: 'read',
      prompt: 'Give me the full status of the Northwind website relaunch: go-live date, budget, who owns what, and the open risks.',
      facts: [date(1, 'march'), any(/450/), any(/cara/), perOwnsHosting, any(/\bapi\b|rate.?limit|10 requests/), any(/cookie|consent|mona/)],
    },
    {
      id: 'gunnar',
      kind: 'read',
      prompt: 'What do I know about Gunnar Holm?',
      facts: [any(/marketing/), any(/sponsor/), prefersEmail, any(/fjordline|2023/), any(/before 9|9 ?(am|a\.m\.)|9 in the morning|0?9[:.]00/)],
    },
    {
      id: 'azure',
      kind: 'read',
      prompt: 'Why did Northwind choose Azure for hosting, and what was the alternative?',
      facts: [itTeamRunsAzure, any(/norway/), any(/aws|amazon/), any(/15 ?%|15 percent|cheaper/)],
    },
    {
      id: 'steering',
      kind: 'read',
      prompt: 'What came out of the steering group meeting on 14 October, and when is the next one?',
      facts: [any(/azure/), date(1, 'march'), date(11, 'november')],
    },
    {
      id: 'fjord-terms',
      kind: 'read',
      prompt: 'Summarize the terms of the Fjord Bank contract.',
      facts: [date(1, 'january'), any(/three months|3 months/), any(/1[.,]2 ?(million|m\b|mnok)|1[ ,.]?200[ ,.]?000/), any(/kari/)],
    },
    {
      id: 'migration',
      kind: 'read',
      prompt: "How far along is the content migration, and what's slowing it down?",
      facts: [any(/60 ?%|60 percent/), any(/\bapi\b|rate.?limit|10 requests/), any(/lars/)],
    },
    {
      id: 'before-launch',
      kind: 'read',
      prompt: 'What still has to happen before the relaunch can go live?',
      facts: [any(/cookie|consent/), any(/mona|legal/), any(/migrat/)],
    },
    { id: 'kitchen', kind: 'read', prompt: 'When does Erik start on the kitchen, and what did he quote?', facts: [date(3, 'november'), any(/85/)] },
    { id: 'sign-off', kind: 'read', prompt: 'Who has to sign off on a 250,000 NOK change order at Fjord Bank?', facts: [any(/kari/)] },
    { id: 'who-to-ask', kind: 'read', prompt: 'Who at Northwind should I talk to about the cookie banner, and who about DNS?', facts: [any(/mona/), perOwnsHosting] },
  ],
};

export const benchmarks = [b1, b2, b3];

/** Everything the model wrote, or in one of the user's turns, the way the checks read it. */
export function answerOf(trace: Trace, turn?: number): string {
  return trace.texts
    .filter((text) => turn === undefined || text.turn === turn)
    .map((text) => text.text)
    .join('\n\n');
}

/** How many of a task's or a turn's facts the answer has, and whether that's enough. */
export function factsIn(task: { facts?: Fact[]; need?: number }, answer: string): { found: number; of: number; enough: boolean } {
  const text = answer.toLowerCase().replace(/[   ]/g, ' ');
  const facts = task.facts ?? [];
  const found = facts.filter((fact) => fact.some((pattern) => pattern.test(text))).length;
  return { found, of: facts.length, enough: found >= (task.need ?? facts.length) };
}

/** The writes a conversation made, or one of its turns, as `remember` or `act:` and the action, in order. */
export function writesOf(trace: Trace, turn?: number): { name: string; failed: boolean }[] {
  return trace.calls
    .filter((call) => (call.tool === 'remember' || call.tool === 'act') && (turn === undefined || call.turn === turn))
    .map((call) => ({
      name: call.tool === 'act' ? `act:${typeof call.args === 'object' ? String(call.args.action) : '?'}` : 'remember',
      failed: call.failed,
    }));
}

/** Read tools, which every Homing conversation should start with. */
export const readTools = new Set(['context', 'search', 'read']);

/** How each of a conversation's turns went, and the facts or tools a turn missed. */
export function scoreTurns(turns: Turn[], trace: Trace): { turns: TurnResult[]; failures: string[] } {
  const failures: string[] = [];
  const scored = turns.map((turn, index) => {
    const calls = trace.calls.filter((call) => call.turn === index);
    const facts = turn.facts ? factsIn(turn, answerOf(trace, index)) : undefined;
    const usedTool = turn.tool ? calls.some((call) => call.name === turn.tool) : undefined;
    if (facts && !facts.enough) failures.push(`turn ${index + 1}: the answer has ${facts.found} of ${facts.of} facts`);
    if (usedTool === false) failures.push(`turn ${index + 1}: ${turn.tool} wasn't used`);
    return { homing: turn.homing, used: calls.some((call) => call.tool), tool: turn.tool, usedTool, facts: facts && { found: facts.found, of: facts.of } };
  });
  return { turns: scored, failures };
}
