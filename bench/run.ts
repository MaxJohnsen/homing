// Runs benchmarks 1 to 3 against a local Homing, with paid model calls through OpenRouter.
//
//   npm run bench -- show                      what the models see, without calling any
//   npm run bench -- smoke --max-spend 0.5     one conversation per benchmark, to check the harness
//   npm run bench -- pilot --max-spend 3       a handful of conversations per benchmark and model
//   npm run bench -- run --max-spend 45        the full set, resuming where it stopped
//   npm run bench -- report                    tables from the results
//
// Every call passes the spending guard in budget.ts, and the total, across runs, is in
// bench/.spend.json. CI never runs this.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { converse, homingOver, type Trace } from './agent.ts';
import { answerOf, benchmarks, factsIn, Look, readTools, writesOf, type Benchmark, type Task } from './benchmarks.ts';
import { hardCap, Ledger, OverBudget, usd } from './budget.ts';
import { makeWorld, startHoming, type AssistantKind, type Bench } from './homing.ts';
import { keyUsage, listedModels, Model, redact } from './openrouter.ts';
import { report } from './report.ts';

const here = new URL('./', import.meta.url);
const ledgerFile = new URL('.spend.json', here).pathname;
export const resultsFile = (phase: string) => new URL(`results/${phase}.jsonl`, here).pathname;

/** Claude Sonnet 5.5 and GPT-6.1 Sol: each maker's current everyday model, at the same price. */
const defaultModels = ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol'];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'max-spend': { type: 'string' },
    runs: { type: 'string', default: '3' },
    only: { type: 'string' },
    models: { type: 'string', default: defaultModels.join(',') },
    concurrency: { type: 'string', default: '4' },
  },
});
const command = positionals[0];

// The MCP client warns on every connection about a callback check the benchmarks don't need.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (!String(args[0]).startsWith('[mcp-sdk]')) warn(...args);
};

/** One conversation's result, as a line of the results file. */
export interface Result {
  key: string;
  phase: string;
  benchmark: string;
  variant: string;
  model: string;
  task: string;
  kind: Task['kind'];
  run: number;
  at: string;
  error?: string;
  pass?: boolean;
  /** Passed without the user having to say "go ahead". */
  passFirst?: boolean;
  failures?: string[];
  facts?: { found: number; of: number };
  homingCalled?: boolean;
  contextFirst?: boolean;
  homingCalls?: number;
  writes?: { name: string; failed: boolean }[];
  /** Benchmark 2: the first write was the expected one, all expected writes were made, and each first attempt was accepted. */
  choice?: boolean;
  complete?: boolean;
  firstTry?: boolean;
  calls?: { name: string; tool?: string; args: unknown; failed: boolean; answer: string }[];
  answer?: string;
  modelCalls?: number;
  nudged?: boolean;
  outOfTurns?: boolean;
  finishReasons?: string[];
  providers?: string[];
  usage?: Trace['usage'];
  modelMs?: number;
  homingMs?: number;
  totalMs?: number;
}

interface Job {
  benchmark: Benchmark;
  variant: string;
  task: Task;
  model: Model;
  run: number;
  phase: string;
}

/** A conversation's key in the results, such as b1|instruction|openai/gpt-6.1-sol|remind|2. */
const keyOf = (job: Job) => [job.benchmark.id, job.variant, job.model.id, job.task.id, job.run].join('|');

export function readResults(phase: string): Result[] {
  const file = resultsFile(phase);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Result);
}

/** The model's app as Homing sees it connect. */
const assistantFor = (model: Model): AssistantKind => (model.id.startsWith('anthropic/') ? 'claude' : 'chatgpt');

async function runJob(bench: Bench, job: Job): Promise<Result> {
  const base = { key: keyOf(job), phase: job.phase, benchmark: job.benchmark.id, variant: job.variant, model: job.model.id, task: job.task.id, kind: job.task.kind, run: job.run };
  const world = await makeWorld(bench, assistantFor(job.model));
  const session = await world.assistant.open();
  try {
    const { tools } = await session.client.listTools();
    const instructions = session.client.getInstructions() ?? '';
    const setup = job.benchmark.setup(job.variant, tools, instructions);
    const writes = (trace: Trace) => writesOf(trace).length > 0;
    const trace = await converse({
      model: job.model,
      setup,
      homing: homingOver(session.client),
      prompt: job.task.prompt,
      label: base.key,
      // Asking first is fair for a change. A user who asked for it says yes once.
      nudge: job.task.kind === 'write' || job.task.kind === 'governed' ? { text: 'Yes, please go ahead.', needed: (trace) => !writes(trace) } : undefined,
    });
    const answer = answerOf(trace);
    const facts = job.task.facts ? factsIn(job.task, answer) : undefined;
    const homingCalls = trace.calls.filter((call) => call.tool);
    const failures = [
      ...(job.task.check ? await job.task.check(new Look(bench, world, trace)) : []),
      ...(facts && !facts.enough ? [`the answer has ${facts.found} of ${facts.of} facts`] : []),
      ...(job.task.kind === 'read' && !homingCalls.some((call) => readTools.has(call.tool!)) ? ['Homing was never asked'] : []),
      ...(job.task.kind === 'control' && homingCalls.length ? ['Homing was asked about something it has nothing to do with'] : []),
      ...(trace.outOfTurns ? ['ran out of turns'] : []),
    ];
    const made = writesOf(trace);
    const expected = job.task.expect;
    let position = 0;
    for (const write of made) if (expected && write.name === expected[position]) position++;
    return {
      ...base,
      at: new Date().toISOString(),
      pass: failures.length === 0,
      passFirst: failures.length === 0 && !trace.nudged,
      failures,
      facts: facts && { found: facts.found, of: facts.of },
      homingCalled: homingCalls.length > 0,
      contextFirst: homingCalls[0]?.tool === 'context',
      homingCalls: homingCalls.length,
      writes: made,
      ...(expected && {
        choice: made[0]?.name === expected[0],
        complete: position === expected.length,
        firstTry: expected.every((name) => made.find((write) => write.name === name)?.failed === false),
      }),
      calls: trace.calls.map((call) => ({ name: call.name, tool: call.tool, args: call.args, failed: call.failed, answer: call.answer.slice(0, 300) })),
      answer: redact(answer).slice(0, 2500),
      modelCalls: trace.modelCalls,
      nudged: trace.nudged,
      outOfTurns: trace.outOfTurns,
      finishReasons: trace.finishReasons,
      providers: [...new Set(trace.providers)],
      usage: trace.usage,
      modelMs: Math.round(trace.modelMs),
      homingMs: Math.round(trace.homingMs),
      totalMs: Math.round(trace.totalMs),
    };
  } finally {
    await session.close();
  }
}

/** The pilot: a few tasks from each benchmark, once per variant and model. A smoke test checks the harness with one each. */
const pickedTasks: Record<string, Record<string, string[]>> = {
  pilot: { b1: ['golive', 'call-prep', 'remind', 'bullet-rule', 'percent'], b2: ['rule-shared', 'share-task', 'note'], b3: ['relaunch-status', 'fjord-terms'] },
  smoke: { b1: ['remind'], b2: ['share-task'], b3: ['fjord-terms'] },
};

async function main() {
  if (command === 'report') {
    process.stdout.write(report(readResults(positionals[1] ?? 'full')));
    return;
  }
  if (command !== 'show' && command !== 'smoke' && command !== 'pilot' && command !== 'run') {
    console.error('Say what to do: npm run bench -- show, smoke, pilot, run or report');
    process.exit(1);
  }
  const bench = await startHoming();
  try {
    if (command === 'show') return await show(bench);
    const phase = command === 'run' ? 'full' : command;
    const ledger = new Ledger(ledgerFile, { runLimit: values['max-spend'] ? Number(values['max-spend']) : undefined });
    const listed = await listedModels();
    const models = values.models!.split(',').map((id) => {
      const model = listed.find((candidate) => candidate.id === id);
      if (!model) throw new Error(`OpenRouter doesn't list ${id}.`);
      return new Model(model, ledger);
    });
    const since = ledger.checkKey(await keyUsage());
    console.log(`Spent so far: ${usd(ledger.spent)} of ${usd(hardCap)} by the ledger, ${usd(since)} by the key's usage. This run may spend ${usd(ledger.runLimit)}.`);

    const only = values.only?.split(',');
    const done = new Set(
      readResults(phase)
        .filter((result) => !result.error)
        .map((result) => result.key),
    );
    const failedBefore = new Map<string, number>();
    for (const result of readResults(phase).filter((result) => result.error)) failedBefore.set(result.key, (failedBefore.get(result.key) ?? 0) + 1);
    const picked = pickedTasks[phase];
    const runs = picked ? 1 : Number(values.runs);
    const jobs: Job[] = [];
    // Run by run, so that stopping early still leaves every task, variant and model covered.
    for (let run = 1; run <= runs; run++) {
      for (const benchmark of benchmarks.filter((b) => !only || only.includes(b.id))) {
        for (const task of benchmark.tasks.filter((t) => !picked || picked[benchmark.id].includes(t.id))) {
          for (const variant of benchmark.variants) {
            for (const model of models) {
              const job = { benchmark, variant, task, model, run, phase };
              if (!done.has(keyOf(job)) && (failedBefore.get(keyOf(job)) ?? 0) < 2) jobs.push(job);
            }
          }
        }
      }
    }
    console.log(`${jobs.length} conversations to run, ${done.size} already done.`);

    let stopped: string | undefined;
    let finished = 0;
    const queue = [...jobs];
    const worker = async () => {
      while (!stopped && queue.length) {
        const job = queue.shift()!;
        try {
          const result = await runJob(bench, job);
          appendFileSync(resultsFile(phase), `${JSON.stringify(result)}\n`);
          finished++;
          console.log(
            `${finished}/${jobs.length} ${result.key} ${result.pass ? 'pass' : `FAIL ${result.failures?.join('; ')}`} ${usd(result.usage?.cost ?? 0)} ${Math.round((result.totalMs ?? 0) / 1000)}s, total ${usd(ledger.spent)}`,
          );
        } catch (error) {
          if (error instanceof OverBudget) {
            stopped = error.message;
            return;
          }
          const message = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
          appendFileSync(resultsFile(phase), `${JSON.stringify({ key: keyOf(job), phase, benchmark: job.benchmark.id, variant: job.variant, model: job.model.id, task: job.task.id, kind: job.task.kind, run: job.run, at: new Date().toISOString(), error: message })}\n`);
          console.log(`${keyOf(job)} ERROR ${message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
    const after = ledger.checkKey(await keyUsage());
    if (stopped) console.log(`\n${stopped}`);
    console.log(`\nSpent: ${usd(ledger.spentThisRun)} in this run. In total ${usd(ledger.spent)} by the ledger, and ${usd(after)} by the key's usage since the first run.`);
  } finally {
    await bench.close();
  }
}

/** Prints what a model sees in each variant, from one world, without calling any model. */
async function show(bench: Bench) {
  const world = await makeWorld(bench, 'claude');
  const session = await world.assistant.open();
  const { tools } = await session.client.listTools();
  const instructions = session.client.getInstructions() ?? '';
  for (const benchmark of benchmarks) {
    for (const variant of benchmark.variants) {
      const setup = benchmark.setup(variant, tools, instructions);
      const size = JSON.stringify(setup.tools).length;
      console.log(`\n# ${benchmark.id} ${variant}: ${setup.tools.length} tools (${size} characters), system prompt ${setup.system.length} characters`);
      console.log(setup.tools.map((tool) => `- ${tool.function.name}: ${tool.function.description.slice(0, 140)}`).join('\n'));
      if (benchmark.id === 'b3') {
        const homing = homingOver(session.client);
        const request = { request: 'Give me the full status of the Northwind website relaunch', space: `space:${world.spaces.relaunch}` };
        const text = await setup.after!({ tool: 'context', args: request }, (await homing.call('context', request)).text, homing);
        console.log(`\ncontext returns ${text.length} characters:\n${text}`);
      }
    }
  }
  console.log(`\n# System prompt with the dedicated tools\n${benchmarks[1].setup('dedicated', tools, instructions).system}`);
  await session.close();
}

await main();
