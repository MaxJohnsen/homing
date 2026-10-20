// Paid model calls through OpenRouter, each one past the spending guard first. The key is read
// from a file at runtime and only ever goes in the Authorization header: never in a log, an
// error, a URL or a result.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { inputTokensOf, OverBudget, pricesOf, worstCase, type Ledger, type ListedModel, type Prices } from './budget.ts';

const api = 'https://openrouter.ai/api/v1';
const keyFile = join(homedir(), '.config/homing/.openrouter');

let key: string | undefined;

/** The key, read once. A file that doesn't hold one is refused without saying what it holds. */
function openRouterKey(): string {
  if (key) return key;
  const value = readFileSync(keyFile, 'utf8').trim();
  if (!/^sk-or-[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${keyFile} doesn't hold an OpenRouter key.`);
  key = value;
  return key;
}

/** Text with the key, or anything shaped like one, taken out. Everything the harness writes or throws passes through it. */
export function redact(text: string): string {
  const hidden = key ? text.split(key).join('[key]') : text;
  return hidden.replace(/sk-or-[A-Za-z0-9_-]+/g, '[key]');
}

/** OpenRouter's public model list, which needs no key. */
export async function listedModels(): Promise<ListedModel[]> {
  const response = await fetch(`${api}/models`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenRouter's model list answered ${response.status}.`);
  return ((await response.json()) as { data: ListedModel[] }).data;
}

/** The key's usage so far, in USD, as OpenRouter reports it. */
export async function keyUsage(): Promise<number> {
  const response = await fetch(`${api}/key`, { headers: { authorization: `Bearer ${openRouterKey()}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new OverBudget(`OpenRouter answered ${response.status} when asked for the key's usage, so no more calls are made.`);
  return Number(((await response.json()) as { data?: { usage?: unknown } }).data?.usage);
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
  private calls = 0;
  /** Every this many calls, across models, the key's own usage is checked as well. */
  static keyCheckEvery = 50;
  static callsSinceKeyCheck = 0;

  constructor(listed: ListedModel, ledger: Ledger) {
    this.id = listed.id;
    this.prices = pricesOf(listed);
    this.ledger = ledger;
  }

  /**
   * One chat completion. It is reserved at its worst case first, retried a few times when
   * OpenRouter or the provider fails, and settled at what it cost.
   */
  async complete(request: { messages: Message[]; tools: FunctionTool[]; maxTokens: number; label: string }): Promise<Completion> {
    if (++Model.callsSinceKeyCheck >= Model.keyCheckEvery) {
      Model.callsSinceKeyCheck = 0;
      this.ledger.checkKey(await keyUsage());
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
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 2_000 * 2 ** attempt));
      const reservation = this.ledger.reserve(this.id, worstCase(this.prices, inputTokensOf(body), request.maxTokens));
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${api}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${openRouterKey()}`, 'content-type': 'application/json', 'x-title': 'Homing benchmarks' },
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
        this.ledger.settle(reservation, response.ok ? 'unknown' : 'error', request.label);
        lastFailure = `OpenRouter answered ${response.status} with something other than JSON.`;
        continue;
      }
      const cost = Number(json?.usage?.cost);
      if (!response.ok || json.error || !json.choices?.length) {
        this.ledger.settle(reservation, Number.isFinite(cost) ? { cost } : 'error', request.label);
        lastFailure = redact(`OpenRouter answered ${response.status}: ${JSON.stringify(json?.error ?? json).slice(0, 400)}`);
        // A request that can never succeed isn't retried.
        if (response.status === 400 || response.status === 401 || response.status === 402 || response.status === 403) break;
        continue;
      }
      this.ledger.settle(reservation, Number.isFinite(cost) ? { cost } : 'unknown', request.label);
      this.calls++;
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
          cost: Number.isFinite(cost) ? cost : reservation.worst,
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
