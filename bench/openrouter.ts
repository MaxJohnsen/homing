// Paid model calls through OpenRouter, each one past the spending guard first. The key is read
// from a file at runtime and only ever goes in the Authorization header: never in a log, an
// error, a URL or a result.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { inputTokensOf, OverBudget, pricesOf, worstCase, type Ledger, type ListedModel, type Prices } from './budget.ts';

const api = 'https://openrouter.ai/api/v1';
const keyFile = join(homedir(), '.config/homing/.openrouter');

/** Where a key comes from. The benchmarks use the file; tests give a made-up one. */
export type KeySource = () => string;

/** Every key used so far, which redact takes out of any text. */
const keys = new Set<string>();

/** The key in ~/.config/homing/.openrouter. A file that doesn't hold one is refused without saying what it holds. */
export const fileKey: KeySource = () => {
  const value = readFileSync(keyFile, 'utf8').trim();
  if (!/^sk-or-[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${keyFile} doesn't hold an OpenRouter key.`);
  return value;
};

/** The key from its source, remembered so that redact can take it out. */
function keyFrom(source: KeySource): string {
  const key = source();
  if (key.length < 8) throw new Error('That is too short to be an OpenRouter key.');
  keys.add(key);
  return key;
}

/** Text with every key used, and anything shaped like an OpenRouter key, taken out. Everything the harness writes or throws passes through it. */
export function redact(text: string): string {
  let hidden = text;
  for (const key of keys) hidden = hidden.split(key).join('[key]');
  return hidden.replace(/sk-or-[A-Za-z0-9_-]+/g, '[key]');
}

/** OpenRouter's public model list, which needs no key. */
export async function listedModels(): Promise<ListedModel[]> {
  const response = await fetch(`${api}/models`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenRouter's model list answered ${response.status}.`);
  return ((await response.json()) as { data: ListedModel[] }).data;
}

/** The key's usage so far, in USD, as OpenRouter reports it. When it can't be read, nothing more is called. */
export async function keyUsage(key: KeySource): Promise<number> {
  const stop = (why: string) => new OverBudget(`Couldn't read the key's usage from OpenRouter (${why}), so no more calls are made.`);
  let response: Response;
  try {
    response = await fetch(`${api}/key`, { headers: { authorization: `Bearer ${keyFrom(key)}` }, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw stop(redact(error instanceof Error ? error.name : 'no answer'));
  }
  if (!response.ok) throw stop(`it answered ${response.status}`);
  let usage: unknown;
  try {
    usage = ((await response.json()) as { data?: { usage?: unknown } }).data?.usage;
  } catch {
    throw stop('its answer was not JSON');
  }
  if (typeof usage !== 'number' || !Number.isFinite(usage)) throw stop('its answer had no usage');
  return usage;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type Message =
  | { role: 'system'; content: string | ContentPart[] }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning_details?: unknown }
  | { role: 'tool'; tool_call_id: string; content: string | ContentPart[] };

export interface ContentPart {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface FunctionTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  /** USD, as OpenRouter charged it. */
  cost: number;
}

export interface Completion {
  message: Extract<Message, { role: 'assistant' }>;
  finishReason: string;
  usage: Usage;
  provider?: string;
  /** How long the call took, in milliseconds. */
  ms: number;
}

/** A model the benchmarks call, with its prices and the guard every call passes. */
export class Model {
  readonly id: string;
  readonly prices: Prices;
  private readonly ledger: Ledger;
  private readonly key: KeySource;
  /** How long to wait before the first retry, doubling after. */
  private readonly backoffMs: number;
  /** Every this many calls, across models, the key's own usage is checked as well. */
  static keyCheckEvery = 50;
  static callsSinceKeyCheck = 0;

  constructor(listed: ListedModel, ledger: Ledger, options: { key: KeySource; backoffMs?: number }) {
    this.id = listed.id;
    this.prices = pricesOf(listed);
    this.ledger = ledger;
    this.key = options.key;
    this.backoffMs = options.backoffMs ?? 4_000;
  }

  /**
   * One chat completion. It is reserved at its worst case first, retried a few times when
   * OpenRouter or the provider fails, and settled at what it cost. When the cost isn't known it
   * counts at its worst case, unless OpenRouter refused the request before any model ran.
   */
  async complete(request: { messages: Message[]; tools: FunctionTool[]; maxTokens: number; label: string }): Promise<Completion> {
    if (++Model.callsSinceKeyCheck >= Model.keyCheckEvery) {
      Model.callsSinceKeyCheck = 0;
      this.ledger.checkKey(await keyUsage(this.key));
    }
    const body = {
      model: this.id,
      messages: request.messages,
      tools: request.tools,
      tool_choice: 'auto',
      max_tokens: request.maxTokens,
      usage: { include: true },
      // The model's own maker serves it when it can, for comparable latency.
      provider: { order: [this.id.split('/')[0]], allow_fallbacks: true },
    };
    let lastFailure = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, this.backoffMs * 2 ** (attempt - 1)));
      const reservation = this.ledger.reserve(this.id, worstCase(this.prices, inputTokensOf(body), request.maxTokens));
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${api}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${keyFrom(this.key)}`, 'content-type': 'application/json', 'x-title': 'Homing benchmarks' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(240_000),
        });
      } catch (error) {
        // The request may have reached the model, so it counts at its worst case.
        this.ledger.settle(reservation, 'unknown', request.label);
        lastFailure = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        continue;
      }
      let json: any;
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
      const reported = json?.usage?.cost;
      const cost = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 ? reported : undefined;
      const usable = response.ok && json && !json.error && Array.isArray(json.choices) && json.choices.length > 0;
      if (!usable) {
        // Only OpenRouter's own answer to a bad request comes before any model ran. Anything else may have been charged.
        const refused = response.status >= 400 && response.status < 500 && json !== undefined;
        this.ledger.settle(reservation, cost !== undefined ? { cost } : refused ? 'error' : 'unknown', request.label);
        lastFailure = redact(
          json === undefined ? `OpenRouter answered ${response.status} with something other than JSON.` : `OpenRouter answered ${response.status}: ${JSON.stringify(json?.error ?? json).slice(0, 400)}`,
        );
        // A request that can never succeed isn't retried.
        if ([400, 401, 402, 403].includes(response.status)) break;
        continue;
      }
      this.ledger.settle(reservation, cost !== undefined ? { cost } : 'unknown', request.label);
      const usage = json.usage ?? {};
      const choice = json.choices[0];
      return {
        message: {
          role: 'assistant',
          content: choice.message?.content ?? null,
          ...(choice.message?.tool_calls?.length && { tool_calls: choice.message.tool_calls }),
          ...(choice.message?.reasoning_details && { reasoning_details: choice.message.reasoning_details }),
        },
        finishReason: choice.finish_reason ?? choice.native_finish_reason ?? 'unknown',
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens ?? 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
          cost: cost ?? reservation.worst,
        },
        provider: json.provider,
        ms: performance.now() - started,
      };
    }
    throw new ModelFailed(`${this.id} failed: ${lastFailure}`);
  }
}

/** A model call that failed after its retries. The conversation it was in is recorded as failed. */
export class ModelFailed extends Error {
  override name = 'ModelFailed';
}

/** OpenRouter's public list of embedding models, which needs no key. */
export async function listedEmbeddingModels(): Promise<ListedModel[]> {
  const response = await fetch(`${api}/embeddings/models`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenRouter's list of embedding models answered ${response.status}.`);
  return ((await response.json()) as { data: ListedModel[] }).data;
}

/** An embedding model, for benchmark 4. Like a chat model, every call is reserved at its worst case first and settled at what it cost. */
export class Embedder {
  readonly id: string;
  readonly prices: Prices;
  private readonly ledger: Ledger;
  private readonly key: KeySource;

  constructor(listed: ListedModel, ledger: Ledger, options: { key: KeySource }) {
    this.id = listed.id;
    this.prices = pricesOf(listed);
    this.ledger = ledger;
    this.key = options.key;
  }

  /** Vectors for the texts, in their order. */
  async embed(inputs: string[], label: string): Promise<{ vectors: number[][]; tokens: number; cost: number }> {
    const body = { model: this.id, input: inputs, provider: { allow_fallbacks: true } };
    let lastFailure = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 4_000 * 2 ** (attempt - 1)));
      const reservation = this.ledger.reserve(this.id, worstCase(this.prices, inputTokensOf(body), 0));
      let response: Response;
      try {
        response = await fetch(`${api}/embeddings`, {
          method: 'POST',
          headers: { authorization: `Bearer ${keyFrom(this.key)}`, 'content-type': 'application/json', 'x-title': 'Homing benchmarks' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (error) {
        this.ledger.settle(reservation, 'unknown', label);
        lastFailure = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        continue;
      }
      let json: any;
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
      const reported = json?.usage?.cost;
      const cost = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 ? reported : undefined;
      const data = json?.data as { embedding: number[]; index: number }[] | undefined;
      if (!response.ok || !Array.isArray(data) || data.length !== inputs.length) {
        const refused = response.status >= 400 && response.status < 500 && json !== undefined;
        this.ledger.settle(reservation, cost !== undefined ? { cost } : refused ? 'error' : 'unknown', label);
        lastFailure = redact(`OpenRouter answered ${response.status}: ${JSON.stringify(json?.error ?? json ?? '').slice(0, 400)}`);
        if ([400, 401, 402, 403].includes(response.status)) break;
        continue;
      }
      // Without a reported cost it counts at its worst case, which for embeddings is still a fraction of a cent.
      const charged = this.ledger.settle(reservation, cost !== undefined ? { cost } : 'unknown', label);
      const vectors = [...data].sort((a, b) => a.index - b.index).map((row) => row.embedding);
      return { vectors, tokens: json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? 0, cost: charged };
    }
    throw new ModelFailed(`${this.id} failed: ${lastFailure}`);
  }
}
