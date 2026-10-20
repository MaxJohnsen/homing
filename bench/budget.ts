// The spending guard for paid model calls. Every call reserves its worst case first and is
// refused if that could take the total past the cap. What each call actually cost is written to a
// ledger outside git as soon as it is known, so a crash or a rerun never resets the count.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/** The most the benchmarks may ever spend, in USD, across every run, pilot and retry. */
export const hardCap = 50;

/** A model's prices in USD per token, the dearest that can apply to a call. */
export interface Prices {
  input: number;
  output: number;
  /** A fixed price per request, if the model has one. */
  request: number;
  /** Dearer prices from this many input tokens on. */
  above?: { tokens: number; input: number; output: number }[];
}

/** A model as OpenRouter's public list describes it. */
export interface ListedModel {
  id: string;
  pricing: Record<string, unknown> & { overrides?: Record<string, unknown>[] };
}

/** The dearest prices a call to the model can be charged, cache writes included. */
export function pricesOf(model: ListedModel): Prices {
  const price = (entry: Record<string, unknown>, ...names: string[]) => Math.max(0, ...names.map((name) => Number(entry[name] ?? 0)));
  const input = (entry: Record<string, unknown>) => price(entry, 'prompt', 'input_cache_write', 'input_cache_write_1h');
  return {
    input: input(model.pricing),
    output: price(model.pricing, 'completion', 'internal_reasoning'),
    request: price(model.pricing, 'request'),
    above: (model.pricing.overrides ?? []).map((override) => ({
      tokens: Number(override.min_prompt_tokens ?? 0),
      input: Math.max(input(override), input(model.pricing)),
      output: Math.max(price(override, 'completion'), price(model.pricing, 'completion')),
    })),
  };
}

/** What a call can cost at most: all its input at the input price, and every token it may write at the output price. */
export function worstCase(prices: Prices, inputTokens: number, maxTokens: number): number {
  const tier = (prices.above ?? []).filter((above) => inputTokens >= above.tokens).at(-1);
  const input = Math.max(prices.input, tier?.input ?? 0);
  const output = Math.max(prices.output, tier?.output ?? 0);
  return inputTokens * input + maxTokens * output + prices.request;
}

/**
 * Input tokens for a request, overestimated on purpose: about two characters a token, where
 * English and JSON run nearer three or four.
 */
export function inputTokensOf(body: unknown): number {
  return Math.ceil(JSON.stringify(body).length / 2);
}

/** A call the guard refused, because it could take spending past a limit. */
export class OverBudget extends Error {
  override name = 'OverBudget';
}

interface Entry {
  at: string;
  model: string;
  /** What OpenRouter said it cost, or the worst case when that is unknown. */
  cost: number;
  /** Known from OpenRouter, an error it doesn't charge for, or unknown and counted at its worst case. */
  how: 'charged' | 'error' | 'unknown';
  label?: string;
}

interface LedgerFile {
  cap: number;
  /** Everything spent so far, in USD. */
  spent: number;
  calls: number;
  /** Calls under way when the file was written, at their worst case, in case the process dies during them. */
  pending: Record<string, { at: string; model: string; worst: number }>;
  /** The key's own usage before the first benchmark call, from OpenRouter. */
  keyBaseline?: number;
  keyChecks: { at: string; usage: number }[];
  entries: Entry[];
}

export interface Reservation {
  id: string;
  model: string;
  worst: number;
}

/**
 * The running total, kept in a file. It refuses a call when what's spent, plus every call under
 * way at its worst case, plus this call's worst case would pass the cap, or this run's own limit.
 */
export class Ledger {
  readonly path: string;
  readonly cap: number;
  /** The most this run may spend, below the cap, such as for a pilot. */
  readonly runLimit: number;
  private file: LedgerFile;
  private runSpent = 0;
  private next = 0;

  constructor(path: string, options: { cap?: number; runLimit?: number } = {}) {
    this.path = path;
    this.cap = Math.min(options.cap ?? hardCap, hardCap);
    this.runLimit = Math.min(options.runLimit ?? this.cap, this.cap);
    this.file = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as LedgerFile)
      : { cap: this.cap, spent: 0, calls: 0, pending: {}, keyChecks: [], entries: [] };
    // Calls a crashed run never settled count at their worst case: they may have been charged.
    for (const [id, call] of Object.entries(this.file.pending)) {
      this.file.spent += call.worst;
      this.file.entries.push({ at: call.at, model: call.model, cost: call.worst, how: 'unknown', label: `unsettled ${id}` });
    }
    this.file.pending = {};
    this.save();
  }

  get spent(): number {
    return this.file.spent;
  }

  get calls(): number {
    return this.file.calls;
  }

  get spentThisRun(): number {
    return this.runSpent;
  }

  get keyBaseline(): number | undefined {
    return this.file.keyBaseline;
  }

  private get underWay(): number {
    return Object.values(this.file.pending).reduce((sum, call) => sum + call.worst, 0);
  }

  /** Reserves a call's worst case, or refuses it. The reservation is on disk before the call goes out. */
  reserve(model: string, worst: number): Reservation {
    if (!(worst >= 0) || !Number.isFinite(worst)) throw new OverBudget(`A call to ${model} has no known worst case, so it isn't made.`);
    const underWay = this.underWay;
    if (this.file.spent + underWay + worst > this.cap) {
      throw new OverBudget(
        `Stopped at the cap: ${usd(this.file.spent)} spent and ${usd(underWay)} under way, and a call to ${model} could cost up to ${usd(worst)}, past ${usd(this.cap)}.`,
      );
    }
    if (this.runSpent + underWay + worst > this.runLimit) {
      throw new OverBudget(`Stopped at this run's limit: ${usd(this.runSpent)} spent in this run, and a call to ${model} could cost up to ${usd(worst)}, past ${usd(this.runLimit)}.`);
    }
    const id = `${process.pid}-${++this.next}`;
    this.file.pending[id] = { at: new Date().toISOString(), model, worst };
    this.save();
    return { id, model, worst };
  }

  /** Records what a reserved call cost: OpenRouter's figure, nothing for a refused request, or its worst case when unknown. */
  settle(reservation: Reservation, outcome: { cost: number } | 'error' | 'unknown', label?: string) {
    if (!this.file.pending[reservation.id]) throw new Error(`The call ${reservation.id} isn't under way.`);
    delete this.file.pending[reservation.id];
    const known = typeof outcome === 'object' && Number.isFinite(outcome.cost) && outcome.cost >= 0;
    const cost = known ? outcome.cost : outcome === 'error' ? 0 : reservation.worst;
    const how: Entry['how'] = known ? 'charged' : outcome === 'error' ? 'error' : 'unknown';
    this.file.spent += cost;
    this.file.calls += 1;
    this.runSpent += cost;
    this.file.entries.push({ at: new Date().toISOString(), model: reservation.model, cost, how, label });
    this.save();
    return cost;
  }

  /**
   * Records the key's usage as OpenRouter reports it, and stops when it has grown past the cap
   * since the benchmarks began. The first reading is the baseline, kept for every later run.
   */
  checkKey(usage: number) {
    if (!Number.isFinite(usage)) throw new OverBudget("OpenRouter didn't report the key's usage, so no more calls are made.");
    this.file.keyBaseline ??= usage;
    this.file.keyChecks.push({ at: new Date().toISOString(), usage });
    this.save();
    const since = usage - this.file.keyBaseline;
    if (since > this.cap) throw new OverBudget(`Stopped: the key has used ${usd(since)} since the benchmarks began, past ${usd(this.cap)}.`);
    return since;
  }

  private save() {
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.file, null, 2)}\n`);
    renameSync(temporary, this.path);
  }
}

export const usd = (value: number) => `$${value.toFixed(4)}`;
