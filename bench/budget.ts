// The spending guard for paid model calls. Every call reserves an estimate of its worst case first
// and is refused if that could take the total past the cap. What each call actually cost is
// written to a ledger outside every checkout as soon as it is known, so a crash, a rerun or a
// second checkout never resets the count, and only one run at a time may spend.

import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The most the benchmarks may ever spend, in USD, across every run, pilot and retry. */
export const hardCap = 50;

/** The ledger's home: next to the key, outside every checkout of the repository. */
export const ledgerPath = join(homedir(), '.config/homing/bench-spend.json');

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

/** A call, or a run, the guard refused, because it could take spending past a limit or the spending can't be known. */
export class OverBudget extends Error {
  override name = 'OverBudget';
}

/**
 * The dearest prices a call to the model can be charged, cache writes included. A model whose
 * input or output price is missing, or any of whose prices isn't a number of zero or more, such as
 * OpenRouter's routers, which list -1, is refused: its cost couldn't be bounded.
 */
export function pricesOf(model: ListedModel): Prices {
  const refuse = () => new OverBudget(`${model.id} has no usable prices on OpenRouter's list, so it isn't called.`);
  const price = (entry: Record<string, unknown>, name: string, required = false) => {
    if (entry[name] === undefined || entry[name] === null || entry[name] === '') {
      if (required) throw refuse();
      return 0;
    }
    const value = Number(entry[name]);
    if (!(Number.isFinite(value) && value >= 0)) throw refuse();
    return value;
  };
  const input = (entry: Record<string, unknown>, required = false) =>
    Math.max(price(entry, 'prompt', required), price(entry, 'input_cache_write'), price(entry, 'input_cache_write_1h'));
  const output = (entry: Record<string, unknown>, required = false) => Math.max(price(entry, 'completion', required), price(entry, 'internal_reasoning'));
  const base = { input: input(model.pricing, true), output: output(model.pricing, true) };
  return {
    ...base,
    request: price(model.pricing, 'request'),
    above: (model.pricing.overrides ?? []).map((override) => ({
      tokens: price(override, 'min_prompt_tokens'),
      input: Math.max(input(override), base.input),
      output: Math.max(output(override), base.output),
    })),
  };
}

/** What a call can cost at most for the given input: all of it at the input price, and every token it may write at the output price. */
export function worstCase(prices: Prices, inputTokens: number, maxTokens: number): number {
  const tier = (prices.above ?? []).filter((above) => inputTokens >= above.tokens).at(-1);
  const input = Math.max(prices.input, tier?.input ?? 0);
  const output = Math.max(prices.output, tier?.output ?? 0);
  return inputTokens * input + maxTokens * output + prices.request;
}

/**
 * Input tokens for a request, estimated high on purpose at about two characters a token, where
 * English and JSON run nearer three or four. It is an estimate, not a guarantee: the key's own
 * usage, which the ledger also goes by, is the check behind it.
 */
export function inputTokensOf(body: unknown): number {
  return Math.ceil(JSON.stringify(body).length / 2);
}

interface Entry {
  at: string;
  model: string;
  /** What OpenRouter said it cost, or the worst case when that is unknown. */
  cost: number;
  /** Known from OpenRouter, a request it refused before any model ran, or unknown and counted at its worst case. */
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

/** A limit in USD as given, refused unless it is a number of zero or more. */
function limit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!(Number.isFinite(value) && value >= 0)) throw new OverBudget(`${name} must be a number of dollars, zero or more.`);
  return value;
}

/**
 * The running total, kept in a file, and the one run allowed to spend while it is open. It
 * refuses a call when what's spent, by the ledger or by the key's own usage, whichever is more,
 * plus every call under way at its worst case, plus this call's worst case would pass the cap, or
 * this run's own limit.
 */
export class Ledger {
  readonly path: string;
  readonly cap: number;
  /** The most this run may spend, below the cap, such as for a pilot. */
  readonly runLimit: number;
  private file!: LedgerFile;
  private readonly lock: string;
  /** What this ledger wrote in the lock: its process and its own token. */
  private readonly holder = `${process.pid} ${randomUUID()}`;
  private runSpent = 0;
  private next = 0;

  constructor(path: string, options: { cap?: number; runLimit?: number } = {}) {
    this.path = path;
    this.cap = Math.min(limit(options.cap, hardCap, 'The cap'), hardCap);
    this.runLimit = Math.min(limit(options.runLimit, this.cap, "The run's limit"), this.cap);
    this.lock = `${path}.lock`;
    takeLock(this.lock, this.holder);
    try {
      this.file = existsSync(path)
        ? (JSON.parse(readFileSync(path, 'utf8')) as LedgerFile)
        : { cap: this.cap, spent: 0, calls: 0, pending: {}, keyChecks: [], entries: [] };
      if (!Number.isFinite(this.file.spent)) throw new OverBudget(`${path} doesn't say what was spent, so nothing is called.`);
      // Calls a crashed run never settled count at their worst case: they may have been charged.
      for (const [id, call] of Object.entries(this.file.pending)) {
        this.file.spent += call.worst;
        this.file.entries.push({ at: call.at, model: call.model, cost: call.worst, how: 'unknown', label: `unsettled ${id}` });
      }
      this.file.pending = {};
      this.save();
    } catch (error) {
      this.close();
      throw error;
    }
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

  /** What the key has used since the benchmarks began, as last read. */
  get keySince(): number {
    const last = this.file.keyChecks.at(-1);
    return last && this.file.keyBaseline !== undefined ? last.usage - this.file.keyBaseline : 0;
  }

  private get underWay(): number {
    return Object.values(this.file.pending).reduce((sum, call) => sum + call.worst, 0);
  }

  /** Reserves a call's worst case, or refuses it. The reservation is on disk before the call goes out. */
  reserve(model: string, worst: number): Reservation {
    if (!(Number.isFinite(worst) && worst >= 0)) throw new OverBudget(`A call to ${model} has no known worst case, so it isn't made.`);
    const spent = Math.max(this.file.spent, this.keySince);
    const underWay = this.underWay;
    if (!(spent + underWay + worst <= this.cap)) {
      throw new OverBudget(
        `Stopped at the cap: ${usd(spent)} spent and ${usd(underWay)} under way, and a call to ${model} could cost up to ${usd(worst)}, past ${usd(this.cap)}.`,
      );
    }
    if (!(this.runSpent + underWay + worst <= this.runLimit)) {
      throw new OverBudget(`Stopped at this run's limit: ${usd(this.runSpent)} spent in this run, and a call to ${model} could cost up to ${usd(worst)}, past ${usd(this.runLimit)}.`);
    }
    const id = `${process.pid}-${++this.next}`;
    this.file.pending[id] = { at: new Date().toISOString(), model, worst };
    this.save();
    return { id, model, worst };
  }

  /** Records what a reserved call cost: OpenRouter's figure, nothing for a request refused before any model ran, or its worst case when unknown. */
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
    const since = this.keySince;
    if (!(since <= this.cap)) throw new OverBudget(`Stopped: the key has used ${usd(since)} since the benchmarks began, past ${usd(this.cap)}.`);
    return since;
  }

  /** Ends the run, so the next one may spend. */
  close() {
    try {
      if (readFileSync(this.lock, 'utf8') === this.holder) unlinkSync(this.lock);
    } catch {
      // Already gone.
    }
  }

  private save() {
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.file, null, 2)}\n`);
    renameSync(temporary, this.path);
  }
}

/**
 * Takes the lock that lets one run spend at a time, or refuses. A lock left by a process that is
 * no longer running, such as one that crashed, is taken over.
 */
function takeLock(lock: string, holder: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx');
      writeFileSync(fd, holder);
      closeSync(fd);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    // A lock without a process in it may be one being taken this moment, so it counts as held.
    const pid = Number(readFileSync(lock, 'utf8').split(' ')[0]);
    if (!(Number.isInteger(pid) && pid > 0) || running(pid)) {
      throw new OverBudget(`Another benchmark run${pid ? `, process ${pid},` : ''} holds ${lock}. Only one may run at a time.`);
    }
    unlinkSync(lock);
  }
  throw new OverBudget(`Couldn't take ${lock}, so nothing is called.`);
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Not permitted means it runs, as someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export const usd = (value: number) => `$${value.toFixed(4)}`;
