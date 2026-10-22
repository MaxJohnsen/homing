// Benchmark 0: small items or a wiki, for learning from sources and for work over many sessions.
//
//   HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- pilot --max-spend 2.5   a few weeks and sessions, with the projected cost
//   HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- run --max-spend 20      everything not yet done, three runs
//   npm run bench:upkeep -- judge --max-spend 1                                   grades what code can't check
//   npm run bench:upkeep -- report                                                the tables in results.md
//
// Every paid call passes the spending guard in budget.ts and its ledger. The mail, the sessions, the
// questions and what counts as right are in upkeep-mail.ts and upkeep-work.ts.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Trace } from './agent.ts';
import { hardCap, Ledger, ledgerPath, OverBudget, usd } from './budget.ts';
import { startHoming, type Bench } from './homing.ts';
import { fileKey, keyUsage, listedModels, Model, redact } from './openrouter.ts';
import { report } from './upkeep-report.ts';
import { approaches, storeFor, type Approach, type Store } from './upkeep-learn.ts';
import { batches, checkpointDay, idsOf, questions, truthIn, type Question } from './upkeep-mail.ts';
import { armKey, runArm, workApproaches, type SessionResult, type WorkApproach, type WorkArm } from './upkeep-sessions.ts';
import { candidates, staleQuestion, type Changed, type Claim } from './upkeep-stale.ts';
import { rebuild } from './upkeep-replay.ts';
import { outdated, readbackRubric, sessionModel, staleMentions } from './upkeep-work.ts';

const here = new URL('./', import.meta.url);
export const resultsFile = (name: string) => new URL(`results/${name}.jsonl`, here).pathname;
const storesDir = (phase: string) => new URL(`results/upkeep-stores/${phase}/`, here).pathname;

export const models = {
  sonnet: 'anthropic/claude-sonnet-5.5',
  haiku: 'anthropic/claude-haiku-5.5',
  gpt: 'openai/gpt-6.1-sol',
  /** A third maker's model, separate from every model under test, grades what code can't check. */
  judge: 'google/gemini-4-argon',
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'max-spend': { type: 'string' },
    runs: { type: 'string', default: '3' },
    scenarios: { type: 'string', default: 'mail,work' },
    keepers: { type: 'string', default: 'sonnet,haiku' },
    approaches: { type: 'string' },
    'work-approaches': { type: 'string' },
    phase: { type: 'string' },
    concurrency: { type: 'string', default: '12' },
    weeks: { type: 'string' },
    sessions: { type: 'string' },
  },
});
const command = positionals[0];

// The MCP client warns on every connection about a callback check the benchmarks don't need.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (!String(args[0]).startsWith('[mcp-sdk]')) warn(...args);
};

export function readLines<T>(name: string): T[] {
  const file = resultsFile(name);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const append = (name: string, line: unknown) => appendFileSync(resultsFile(name), `${JSON.stringify(line)}\n`);

// Scenario 1.

/** How a question was answered in a week, and what the store held for it. */
export interface Answered {
  id: string;
  kind: Question['kind'];
  answer: string;
  /** For facts: right, an outdated fact presented as current, or wrong or missing. */
  verdict?: 'right' | 'stale' | 'wrong';
  /** For facts: whether a page of the store still has the current answer. */
  present?: boolean;
  /** For facts: whether a claim with the answer cites an email that supports it. */
  traced?: boolean;
  /** Whether the answer changed since an earlier week. */
  truthFrom: number;
}

export interface WeekResult {
  scenario: 'mail';
  key: string;
  phase: string;
  attempt: string;
  run: number;
  keeper: string;
  approach: Approach;
  week: number;
  at: string;
  error?: string;
  learn?: { calls: number; modelCalls: number; ops: Record<string, number>; failed: number; usage: Trace['usage']; ms: number };
  answers?: Answered[];
  answerUsage?: { prompt: number; completion: number; cost: number; ms: number };
  store?: { pages: number; units: number; cited: number; chars: number };
  ops?: { applied: Record<string, number>; refused: Record<string, number> };
}

const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^(\w+) /, '$1, ');

/** Everything the store holds and the week's questions, answered in one call by the same model for every store. */
async function answerFrom(answerer: Model, rendered: string, asked: Question[], week: number, label: string) {
  const system = `You answer questions about Ana Berg's work and life from her knowledge base alone. Today is ${weekday(checkpointDay(week))}.`;
  const user =
    `Her knowledge base:\n\n${rendered}\n\n---\n\nQuestions:\n${asked.map((question) => `- ${question.id}: ${question.ask}`).join('\n')}\n\n` +
    'Answer each from the knowledge base alone, as of today. When something has changed, give what is true now, unless the question asks what used to be true. ' +
    'If the knowledge base doesn\'t say, answer "unknown". Answer in English.\n' +
    '- A question about a fact: a short answer, a few words with the date, amount or name.\n' +
    '- A question to answer yes, no or undecided: start with that word.\n' +
    "- A question about reasons or what's open: up to 80 words.\n\n" +
    'Reply with JSON only, in this shape: {"answers": [{"id": "golive", "answer": "..."}]}';
  // Asked again once when the reply isn't JSON, as happened once in run 1, and paid for both times.
  const usage = { prompt: 0, completion: 0, cost: 0, ms: 0 };
  let reply = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await answerer.complete({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], tools: [], maxTokens: 8000, label });
    usage.prompt += completion.usage.promptTokens;
    usage.completion += completion.usage.completionTokens;
    usage.cost += completion.usage.cost;
    usage.ms += Math.round(completion.ms);
    reply = completion.message.content ?? '';
    const parsed = jsonIn(reply) as { answers?: { id: string; answer: string }[] } | undefined;
    if (parsed?.answers) return { answers: new Map(parsed.answers.map((answer) => [answer.id, String(answer.answer ?? '')])), usage };
  }
  throw new Error(`The answers weren't JSON: ${redact(reply.slice(0, 300))}`);
}

/** The first JSON object in a model's text, fenced or not. */
export function jsonIn(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const matches = (text: string, facts: RegExp[][]) => facts.every((fact) => fact.some((pattern) => pattern.test(text)));

/** A week's questions, answered from the store and checked by code. */
async function checkpoint(store: Store, answerer: Model, week: number, label: string) {
  const asked = questions.filter((question) => truthIn(question, week));
  const rendered = await store.render();
  const { answers, usage } = await answerFrom(answerer, rendered, asked, week, label);
  const pages = await store.pages();
  const units = await store.units();
  const answered: Answered[] = asked.map((question) => {
    const truth = truthIn(question, week)!;
    const answer = answers.get(question.id) ?? '';
    const factual = question.kind === 'fact' || question.kind === 'yesno' || question.kind === 'past';
    const verdict = !factual ? undefined : matches(answer, truth.expect) ? 'right' : truth.stale?.some((fact) => fact.some((pattern) => pattern.test(answer))) ? 'stale' : 'wrong';
    const checkable = (question.kind === 'fact' || question.kind === 'past') && truth.expect.length > 0;
    const present = checkable ? pages.some((page) => matches(page.text, truth.expect)) : undefined;
    const holding = checkable ? units.filter((unit) => truth.expect[0].some((pattern) => pattern.test(unit.text))) : [];
    const supporting = new Set(idsOf(truth.sources));
    const traced = checkable && holding.length ? holding.some((unit) => unit.cites.some((id) => supporting.has(id))) : undefined;
    return { id: question.id, kind: question.kind, answer, verdict, present, traced, truthFrom: truth.from };
  });
  return { answered, usage, rendered, store: { pages: pages.length, units: units.length, cited: units.filter((unit) => unit.cites.length).length, chars: rendered.length } };
}

interface MailArm {
  run: number;
  keeper: Model;
  approach: Approach;
}

const mailKey = (arm: MailArm) => `mail|${arm.approach}|${arm.keeper.id}|${arm.run}`;

async function runMailArm(bench: Bench, arm: MailArm, answerer: Model, phase: string, weeks: number) {
  const key = mailKey(arm);
  const attempt = new Date().toISOString();
  const store = await storeFor(bench, arm.approach);
  const dir = storesDir(phase);
  mkdirSync(dir, { recursive: true });
  for (let week = 1; week <= weeks; week++) {
    const base = { scenario: 'mail' as const, key, phase, attempt, run: arm.run, keeper: arm.keeper.id, approach: arm.approach, week, at: new Date().toISOString() };
    const learned = { calls: 0, modelCalls: 0, ops: {} as Record<string, number>, failed: 0, usage: { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, reasoning: 0, cost: 0 }, ms: 0 };
    for (const batch of batches.filter((candidate) => candidate.week === week)) {
      const trace = await store.learn(arm.keeper, batch, `${key}|${batch.day}`);
      learned.modelCalls += trace.modelCalls;
      learned.ms += Math.round(trace.totalMs);
      for (const [name, value] of Object.entries(trace.usage)) learned.usage[name as keyof Trace['usage']] += value;
      for (const call of trace.calls) {
        learned.calls++;
        learned.ops[call.name] = (learned.ops[call.name] ?? 0) + 1;
        if (call.failed || /^Not done|Nothing was|There is no|not once/.test(call.answer)) learned.failed++;
      }
    }
    const checked = await checkpoint(store, answerer, week, `${key}|answer|w${week}`);
    writeFileSync(`${dir}${key.replaceAll('|', '_').replaceAll('/', '-')}_w${week}.md`, checked.rendered);
    const ops = 'applied' in store ? { applied: Object.fromEntries((store as never as { applied: Map<string, number> }).applied), refused: Object.fromEntries((store as never as { refused: Map<string, number> }).refused) } : undefined;
    const line: WeekResult = { ...base, learn: learned, answers: checked.answered, answerUsage: checked.usage, store: checked.store, ...(ops && { ops }) };
    append(`upkeep-mail-${phase}`, line);
    const right = checked.answered.filter((answer) => answer.verdict === 'right').length;
    const factual = checked.answered.filter((answer) => answer.verdict).length;
    console.log(`${key} week ${week}: ${right}/${factual} right, ${checked.store.units} units, learn ${usd(learned.usage.cost)}, answer ${usd(checked.usage.cost)}`);
  }
}

// Scenario 2.

async function runWorkArm(bench: Bench, arm: WorkArm, ledgerModels: Map<string, Model>, phase: string, count: number) {
  const attempt = new Date().toISOString();
  const pair: [string, string] = [models.sonnet, models.gpt];
  const docs = await runArm(
    bench,
    arm,
    phase,
    (session) => ledgerModels.get(sessionModel(arm.run, session, pair))!,
    (result: SessionResult) => {
      append(`upkeep-work-${phase}`, { ...result, attempt });
      if (!result.error) {
        const facts = Object.values(result.facts ?? {});
        console.log(
          `${result.key} ${result.model.split('/')[1]}: ${facts.filter(Boolean).length}/${facts.length} facts, ${result.docs?.length} docs, ${usd(result.usage?.cost ?? 0)} ${Math.round((result.totalMs ?? 0) / 1000)}s`,
        );
      }
    },
    {
      sessions: count,
      save: (session, docs) => {
        mkdirSync(storesDir(phase), { recursive: true });
        writeFileSync(`${storesDir(phase)}work_${armKey(arm).replaceAll('|', '_')}_${session}.md`, docs.map((doc) => `===== ${doc.title}${doc.record ? ' (record)' : ''} =====\n${doc.text}\n`).join('\n'));
      },
    },
  );
  const dir = storesDir(phase);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}work_${armKey(arm).replaceAll('|', '_')}.md`, docs.map((doc) => `===== ${doc.title}${doc.record ? ' (record)' : ''} =====\n${doc.text}\n`).join('\n'));
}

// The judge.

interface Grade {
  key: string;
  elements: Record<string, boolean>;
  at: string;
}

/** Grades every answer about reasons and what's open, and session 5's answers, that isn't graded yet, against rubrics written in advance. */
async function judgeAll(judge: Model, phases: string[]) {
  const graded = new Set(readLines<Grade>('upkeep-judge').map((grade) => grade.key));
  const jobs: { group: string; items: { key: string; question: string; answer: string; rubric: { id: string; text: string; negative?: boolean }[] }[] }[] = [];
  for (const phase of phases) {
    for (const week of readLines<WeekResult>(`upkeep-mail-${phase}`).filter((line) => line.answers)) {
      const items = week.answers!.filter((answer) => answer.kind === 'why' || answer.kind === 'open').map((answer) => {
        const question = questions.find((candidate) => candidate.id === answer.id)!;
        return { key: `${phase}|${week.key}|${week.attempt}|w${week.week}|${answer.id}`, question: question.ask, answer: answer.answer, rubric: truthIn(question, week.week)!.rubric ?? [] };
      });
      const open = items.filter((item) => !graded.has(item.key));
      if (open.length) jobs.push({ group: `${phase}|${week.key}|w${week.week}`, items: open });
    }
    const s5 = readLines<SessionResult & { attempt: string }>(`upkeep-work-${phase}`).filter((line) => line.session === 's5' && line.answer !== undefined);
    const items = s5
      .map((line) => ({ key: `${phase}|${line.key}|${line.attempt}`, question: 'What do we recommend and why, which options did we reject and why, which criteria did we compare them on, what has changed since the first comparison, and what is still open?', answer: line.answer!, rubric: readbackRubric }))
      .filter((item) => !graded.has(item.key));
    for (let index = 0; index < items.length; index += 4) jobs.push({ group: `${phase}|work|${index}`, items: items.slice(index, index + 4) });
  }
  console.log(`${jobs.length} calls to grade ${jobs.reduce((sum, job) => sum + job.items.length, 0)} answers.`);
  const queue = [...jobs];
  let stopped: string | undefined;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (!stopped && queue.length) {
        const job = queue.shift()!;
        try {
          for (const grade of await grade1(judge, job.items, job.group)) append('upkeep-judge', grade);
        } catch (error) {
          if (error instanceof OverBudget) stopped = error.message;
          else console.log(`${job.group} ERROR ${redact(error instanceof Error ? error.message : String(error))}`);
        }
      }
    }),
  );
  if (stopped) console.log(stopped);
}

async function grade1(judge: Model, items: { key: string; question: string; answer: string; rubric: { id: string; text: string; negative?: boolean }[] }[], label: string): Promise<Grade[]> {
  const system = 'You grade answers against rubrics written before the answers existed. Judge only what each answer says, not how it is written.';
  const user =
    "For each answer below, decide for each rubric element whether the answer states it. An element counts when the answer says it, in any words or language; it doesn't count when it's missing, only hinted at, or contradicted. " +
    'Elements marked MUST NOT are things a good answer must not say: mark them true when the answer does say it.\n\n' +
    items
      .map(
        (item, index) =>
          `### a${index + 1}\nQuestion: ${item.question}\nAnswer: ${item.answer || '(no answer)'}\nRubric:\n${item.rubric.map((element) => `- ${element.id}${element.negative ? ' (MUST NOT)' : ''}: ${element.text}`).join('\n')}`,
      )
      .join('\n\n') +
    '\n\nReply with JSON only, in this shape: {"grades": [{"id": "a1", "elements": {"<element id>": true}}]}';
  const completion = await judge.complete({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], tools: [], maxTokens: 6000, label: `judge|${label}` });
  const parsed = jsonIn(completion.message.content ?? '') as { grades?: { id: string; elements: Record<string, boolean> }[] } | undefined;
  if (!parsed?.grades) throw new Error(`The grades weren't JSON: ${(completion.message.content ?? '').slice(0, 200)}`);
  return items.flatMap((item, index) => {
    const grade = parsed.grades!.find((candidate) => candidate.id === `a${index + 1}`);
    if (!grade) return [];
    const elements = Object.fromEntries(item.rubric.map((element) => [element.id, grade.elements[element.id] === true]));
    return [{ key: item.key, elements, at: new Date().toISOString() }];
  });
}

/** A claim's key for the stale judge: the fact as it changed, and the claim's page and text. */
export const claimKey = (fact: Changed, claim: Claim) => `${fact.id}|${fact.from}|${createHash('sha1').update(`${claim.page}\n${claim.text}`).digest('hex').slice(0, 16)}`;

/** The weeks' kept stores of a phase, with their arm, approach and week. */
export function keptStores(phase: string): { file: string; approach: string; week: number }[] {
  const dir = storesDir(phase);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^mail_.*_w\d\.md$/.test(file))
    .map((file) => ({ file: `${dir}${file}`, approach: file.split('_')[1], week: Number(/_w(\d)\.md$/.exec(file)![1]) }));
}

/** Asks the judge about every candidate claim not judged yet: whether it presents a changed fact's earlier value as current. */
async function judgeStale(judge: Model, phases: string[]) {
  const graded = new Set(readLines<{ key: string }>('upkeep-stale-judge').map((grade) => grade.key));
  const open = new Map<string, { fact: Changed; claim: Claim }>();
  for (const phase of phases) {
    for (const kept of keptStores(phase)) {
      for (const { fact, claims } of candidates(readFileSync(kept.file, 'utf8'), kept.approach, kept.week)) {
        for (const claim of claims) {
          const key = claimKey(fact, claim);
          if (!graded.has(key)) open.set(key, { fact, claim });
        }
      }
    }
  }
  // The work after session 5: each mention of an outdated value outside the records.
  for (const phase of phases) {
    for (const docs of finalWork(phase)) {
      for (const value of outdated) {
        for (const doc of docs.filter((candidate) => !candidate.record)) {
          for (const mention of staleMentions(doc.text, value)) {
            const fact = { id: `work-${value.id}`, text: value.fact, from: 5 } as Changed;
            const claim = { page: doc.title, text: mention };
            const key = claimKey(fact, claim);
            if (!graded.has(key)) open.set(key, { fact, claim });
          }
        }
      }
    }
  }
  const items = [...open.entries()];
  console.log(`${items.length} candidate claims to judge.`);
  for (let index = 0; index < items.length; index += 20) {
    const batch = items.slice(index, index + 20);
    const user =
      `${staleQuestion}\n\n` +
      batch.map(([, { fact, claim }], at) => `### c${at + 1}\nFact: ${fact.text}\nPage: ${claim.page}\nClaim: ${claim.text}`).join('\n\n') +
      '\n\nReply with JSON only, in this shape: {"grades": [{"id": "c1", "current": true}]}';
    const completion = await judge.complete({ messages: [{ role: 'user', content: user }], tools: [], maxTokens: 4000, label: `judge|stale|${index}` });
    const parsed = jsonIn(completion.message.content ?? '') as { grades?: { id: string; current: boolean }[] } | undefined;
    for (const [at, [key]] of batch.entries()) {
      const grade = parsed?.grades?.find((candidate) => candidate.id === `c${at + 1}`);
      if (grade) append('upkeep-stale-judge', { key, stale: grade.current === true, at: new Date().toISOString() });
    }
  }
}

/** Each work arm's latest complete attempt, rebuilt after session 5. */
export function finalWork(phase: string) {
  const rows = readLines<SessionResult & { attempt: string }>(`upkeep-work-${phase}`).filter((row) => !row.error);
  const attempts = new Map<string, (SessionResult & { attempt: string })[]>();
  for (const row of rows) {
    const key = `${row.key.split('|').slice(1, 4).join('|')}#${row.attempt}`;
    attempts.set(key, [...(attempts.get(key) ?? []), row]);
  }
  return [...attempts.values()]
    .filter((sessions) => sessions.some((session) => session.session === 's5'))
    .map((sessions) => rebuild(sessions[0].approach, sessions.sort((a, b) => a.session.localeCompare(b.session))).at(-1)!);
}

// The command.

async function main() {
  if (command === 'report') {
    process.stdout.write(report(positionals.slice(1).length ? positionals.slice(1) : ['full']));
    return;
  }
  if (!['pilot', 'run', 'judge'].includes(command ?? '')) {
    console.error('Say what to do: npm run bench:upkeep -- pilot, run, judge or report');
    process.exit(1);
  }
  const ledger = new Ledger(ledgerPath, { runLimit: values['max-spend'] === undefined ? undefined : Number(values['max-spend']) });
  try {
    const listed = await listedModels();
    const model = (id: string) => {
      const found = listed.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`OpenRouter doesn't list ${id}.`);
      return new Model(found, ledger, { key: fileKey });
    };
    const since = ledger.checkKey(await keyUsage(fileKey));
    console.log(`Spent so far: ${usd(ledger.spent)} of ${usd(hardCap)} by the ledger, ${usd(since)} by the key's usage. This run may spend ${usd(ledger.runLimit)}.`);
    if (command === 'judge') {
      await judgeAll(model(models.judge), (values.phase ?? 'pilot,full').split(','));
      await judgeStale(model(models.judge), (values.phase ?? 'full').split(',').filter((phase) => phase !== 'pilot'));
    } else {
      await benchmark(command!, model);
    }
    const after = ledger.checkKey(await keyUsage(fileKey));
    console.log(`\nSpent: ${usd(ledger.spentThisRun)} in this run. In total ${usd(ledger.spent)} by the ledger, and ${usd(after)} by the key's usage since the first run.`);
  } finally {
    ledger.close();
  }
}

async function benchmark(command: string, model: (id: string) => Model) {
  const phase = values.phase ?? (command === 'run' ? 'full' : command);
  if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('--phase takes a name of lowercase letters, digits and dashes.');
  const pilot = command === 'pilot';
  const runs = pilot ? 1 : Number(values.runs);
  const weeks = Number(values.weeks ?? (pilot ? 2 : 8));
  const sessionCount = Number(values.sessions ?? (pilot ? 2 : 5));
  const scenarios = values.scenarios!.split(',');
  const keepers = values.keepers!.split(',').map((name) => model(models[name as keyof typeof models] ?? name));
  const answerer = model(models.sonnet);
  const pool = new Map([models.sonnet, models.gpt].map((id) => [id, model(id)]));

  const bench = await startHoming({ port: 4480 });
  try {
    const doneMail = new Set(
      readLines<WeekResult>(`upkeep-mail-${phase}`)
        .filter((line) => !line.error && line.week === weeks)
        .map((line) => line.key),
    );
    const doneWork = new Set(
      readLines<SessionResult>(`upkeep-work-${phase}`)
        .filter((line) => !line.error && line.session === `s${sessionCount}`)
        .map((line) => line.key.split('|').slice(1, 4).join('|')),
    );
    const jobs: { name: string; run(): Promise<void> }[] = [];
    // Run by run, so that stopping early still leaves every approach and model covered.
    for (let run = 1; run <= runs; run++) {
      if (scenarios.includes('mail')) {
        for (const keeper of keepers) {
          for (const approach of approaches.filter((a) => !values.approaches || values.approaches.split(',').includes(a))) {
            const arm = { run, keeper, approach };
            if (doneMail.has(mailKey(arm))) continue;
            jobs.push({ name: mailKey(arm), run: () => runMailArm(bench, arm, answerer, phase, weeks) });
          }
        }
      }
      if (scenarios.includes('work')) {
        for (const approach of workApproaches.filter((a) => { const only = values['work-approaches'] ?? values.approaches; return !only || only.split(',').includes(a); })) {
          for (const record of pilot ? [true] : [true, false]) {
            const arm: WorkArm = { approach: approach as WorkApproach, record, run };
            if (doneWork.has(armKey(arm))) continue;
            jobs.push({ name: `work|${armKey(arm)}`, run: () => runWorkArm(bench, arm, pool, phase, sessionCount) });
          }
        }
      }
    }
    console.log(`${jobs.length} arms to run.`);
    let stopped: string | undefined;
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: Number(values.concurrency) }, async () => {
        while (!stopped && queue.length) {
          const job = queue.shift()!;
          try {
            await job.run();
          } catch (error) {
            if (error instanceof OverBudget) {
              stopped = error.message;
              return;
            }
            const message = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
            if (job.name.startsWith('mail')) append(`upkeep-mail-${phase}`, { scenario: 'mail', key: job.name, phase, error: message, at: new Date().toISOString() });
            console.log(`${job.name} ERROR ${message}`);
          }
        }
      }),
    );
    if (stopped) console.log(`\n${stopped}`);
  } finally {
    await bench.close();
  }
}

await main();
