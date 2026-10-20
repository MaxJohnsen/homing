// Tables from the results: per benchmark, variant and model, with the spread across runs.

import type { Result } from './run.ts';

const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '–');
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const shortModel = (id: string) => id.split('/')[1];

/** A rate over all runs, and the lowest and highest of the runs on their own: "83% (80–85)". */
function rate(results: Result[], test: (result: Result) => boolean | undefined): string {
  const counted = results.filter((result) => test(result) !== undefined);
  if (!counted.length) return '–';
  const runs = [...new Set(counted.map((result) => result.run))].sort();
  const all = percent(counted.filter((result) => test(result)).length, counted.length);
  if (runs.length < 2) return all;
  const byRun = runs.map((run) => {
    const inRun = counted.filter((result) => result.run === run);
    return Math.round((100 * inRun.filter((result) => test(result)).length) / inRun.length);
  });
  return `${all} (${Math.min(...byRun)}–${Math.max(...byRun)})`;
}

/** Tokens, how much input was cached, latency and cost, per conversation and in all. */
function costs(results: Result[]) {
  const tokensIn = mean(results.map((result) => result.usage?.prompt ?? 0));
  const tokensOut = mean(results.map((result) => result.usage?.completion ?? 0));
  const cached = results.reduce((sum, result) => sum + (result.usage?.cached ?? 0), 0);
  const prompt = results.reduce((sum, result) => sum + (result.usage?.prompt ?? 0), 0);
  const seconds = results.map((result) => (result.totalMs ?? 0) / 1000).sort((a, b) => a - b);
  return {
    tokens: `${Math.round(tokensIn).toLocaleString('en-US')} / ${Math.round(tokensOut).toLocaleString('en-US')}`,
    cached: percent(cached, prompt),
    latency: `${mean(seconds).toFixed(1)} s (${(seconds[Math.floor(seconds.length / 2)] ?? 0).toFixed(1)})`,
    cost: `$${mean(results.map((result) => result.usage?.cost ?? 0)).toFixed(4)}`,
    total: results.reduce((sum, result) => sum + (result.usage?.cost ?? 0), 0),
  };
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

/** The order variants are described in. */
const variantOrder = ['mcp-only', 'instruction', 'act', 'dedicated', 'core', 'relevant', 'full'];

/** Groups by variant and model, variants in the order they're described, then models by name. */
function groups(results: Result[]) {
  const keys = [...new Set(results.map((result) => `${result.variant}|${result.model}`))].sort((a, b) => {
    const [va, ma] = a.split('|');
    const [vb, mb] = b.split('|');
    return variantOrder.indexOf(va) - variantOrder.indexOf(vb) || ma.localeCompare(mb);
  });
  return keys.map((key) => {
    const [variant, model] = key.split('|');
    return { variant, model, results: results.filter((result) => result.variant === variant && result.model === model) };
  });
}

function perTask(results: Result[]): string {
  const tasks = [...new Set(results.map((result) => result.task))];
  const columns = groups(results);
  return table(
    ['Task', ...columns.map((column) => `${column.variant}, ${shortModel(column.model)}`)],
    tasks.map((task) => [
      task,
      ...columns.map((column) => {
        const these = column.results.filter((result) => result.task === task);
        return `${these.filter((result) => result.pass).length}/${these.length}`;
      }),
    ]),
  );
}

/** Why a conversation didn't do its task, in a few kinds. */
function reasonOf(result: Result): string {
  const failures = result.failures ?? [];
  if (result.outOfTurns) return failures.length === 1 ? 'did it, but ran out of turns before answering' : 'ran out of turns';
  if (result.kind === 'control') return 'asked Homing anyway';
  if (failures.includes('Homing was never asked')) return 'never asked Homing';
  const asked = /\?\s*$/.test(result.answer ?? '');
  if (result.kind === 'read') return asked ? 'asked the user back' : 'answer missed facts';
  if (!result.writes?.length) return asked ? 'asked the user back' : 'made no change';
  if (result.writes.every((write) => write.failed)) return 'Homing refused every try';
  return 'made the wrong change';
}

function reasons(results: Result[]): string {
  const failed = results.filter((result) => !result.pass);
  const kinds = [...new Set(failed.map(reasonOf))].sort();
  if (!kinds.length) return '';
  const columns = groups(results);
  return `\nWhy the others weren't done:\n\n${table(
    ['Reason', ...columns.map((column) => `${column.variant}, ${shortModel(column.model)}`)],
    kinds.map((kind) => [kind, ...columns.map((column) => String(column.results.filter((result) => !result.pass && reasonOf(result) === kind).length))]),
  )}\n`;
}

export function report(all: Result[]): string {
  const valid = all.filter((result) => !result.error);
  const errors = all.filter((result) => result.error);
  const out: string[] = [];
  const total = valid.reduce((sum, result) => sum + (result.usage?.cost ?? 0), 0);
  out.push(`${valid.length} conversations, $${total.toFixed(2)} in model calls by OpenRouter's own figures. ${errors.length} conversations failed for reasons outside the model's answer and are left out.\n`);
  out.push('Rates are over all runs, with the lowest and highest single run in brackets. Tokens are input / output per conversation; latency is the mean, with the median in brackets.\n');

  const b1 = valid.filter((result) => result.benchmark === 'b1');
  if (b1.length) {
    const work = (results: Result[]) => results.filter((result) => result.kind !== 'control');
    out.push('## Benchmark 1: MCP reliability\n');
    out.push(
      table(
        ['Variant', 'Model', 'Asked Homing', 'context first', 'Task done', 'Without "go ahead"', 'Reads', 'Saves', 'Governed', 'Homing on controls'],
        groups(b1).map(({ variant, model, results }) => [
          variant,
          shortModel(model),
          rate(work(results), (r) => r.homingCalled),
          rate(work(results), (r) => r.contextFirst),
          rate(work(results), (r) => r.pass),
          rate(work(results), (r) => r.passFirst),
          rate(results.filter((r) => r.kind === 'read'), (r) => r.pass),
          rate(results.filter((r) => r.kind === 'write'), (r) => r.pass),
          rate(results.filter((r) => r.kind === 'governed'), (r) => r.pass),
          `${results.filter((r) => r.kind === 'control' && r.homingCalled).length}/${results.filter((r) => r.kind === 'control').length}`,
        ]),
      ),
    );
    out.push('');
    out.push(
      table(
        ['Variant', 'Model', 'Homing calls', 'Model calls', 'Tokens in / out', 'Cached input', 'Latency', 'Cost each', 'Cost'],
        groups(b1).map(({ variant, model, results }) => {
          const c = costs(results);
          return [variant, shortModel(model), mean(results.map((r) => r.homingCalls ?? 0)).toFixed(1), mean(results.map((r) => r.modelCalls ?? 0)).toFixed(1), c.tokens, c.cached, c.latency, c.cost, `$${c.total.toFixed(2)}`];
        }),
      ),
    );
    out.push(`\nPer task, conversations that did it:\n\n${perTask(b1)}\n${reasons(b1)}`);
  }

  const b2 = valid.filter((result) => result.benchmark === 'b2');
  if (b2.length) {
    out.push('## Benchmark 2: Tool design\n');
    out.push(
      table(
        ['Variant', 'Model', 'Made a change', 'Right tool first', 'Accepted first time', 'All writes made', 'Task done', 'Without "go ahead"', 'Homing calls', 'Tokens in / out', 'Latency', 'Cost each', 'Cost'],
        groups(b2).map(({ variant, model, results }) => {
          const c = costs(results);
          // Whether the tool was right, and accepted, is counted where the model made a change at all.
          const wrote = (r: Result) => Boolean(r.writes?.length);
          return [
            variant,
            shortModel(model),
            rate(results, wrote),
            rate(results, (r) => (wrote(r) ? r.choice : undefined)),
            rate(results, (r) => (wrote(r) ? r.firstTry : undefined)),
            rate(results, (r) => r.complete),
            rate(results, (r) => r.pass),
            rate(results, (r) => r.passFirst),
            mean(results.map((r) => r.homingCalls ?? 0)).toFixed(1),
            c.tokens,
            c.latency,
            c.cost,
            `$${c.total.toFixed(2)}`,
          ];
        }),
      ),
    );
    out.push(`\nPer task, conversations that did it:\n\n${perTask(b2)}\n${reasons(b2)}`);
  }

  const b3 = valid.filter((result) => result.benchmark === 'b3');
  if (b3.length) {
    out.push('## Benchmark 3: Context size\n');
    out.push(
      table(
        ['Variant', 'Model', 'Facts found', 'Complete answers', 'Homing calls', 'Model calls', 'Tokens in / out', 'Cached input', 'Latency', 'Cost each', 'Cost'],
        groups(b3).map(({ variant, model, results }) => {
          const c = costs(results);
          const found = results.reduce((sum, r) => sum + (r.facts?.found ?? 0), 0);
          const of = results.reduce((sum, r) => sum + (r.facts?.of ?? 0), 0);
          return [
            variant,
            shortModel(model),
            percent(found, of),
            rate(results, (r) => r.pass),
            mean(results.map((r) => r.homingCalls ?? 0)).toFixed(1),
            mean(results.map((r) => r.modelCalls ?? 0)).toFixed(1),
            c.tokens,
            c.cached,
            c.latency,
            c.cost,
            `$${c.total.toFixed(2)}`,
          ];
        }),
      ),
    );
    out.push(`\nPer task, complete answers:\n\n${perTask(b3)}\n${reasons(b3)}`);
  }
  return `${out.join('\n')}\n`;
}
