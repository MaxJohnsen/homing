// A model of Homing's own, for learning in the background (spec §11). Whoever runs Homing brings
// a provider's API key in the server's settings, and Homing works as before without one.
//
// Every call goes through callModel, the one place Homing calls a model: the provider lives only
// in this module, so nothing else can reach it. Before anything is sent, the database checks that
// the person can open every space the call carries content from, that none of them has model
// processing off, and that the call's worst case fits the monthly limit, counting the calls still
// under way. Afterwards it records what the call cost. Prompts and answers never go into a log, an
// error or the database, and the key goes only to the provider. What a model writes is untrusted
// input, never instructions.

import { BlockList, isIP } from 'node:net';
import postgres from 'postgres';
import { chatCompletions } from './chat-completions.ts';
import { withPrincipal, type Session, type Sql } from './db.ts';
import { ProviderFailed, ProviderRefused, type ChatRequest, type Message, type Provider, type ProviderAnswer, type Schema } from './provider.ts';

export type { Message, Schema };

/** A model's prices in USD per million tokens, and dearer ones from so many input tokens on. */
export interface Prices {
  input: number;
  output: number;
  above?: { tokens: number; input: number; output: number };
}

/**
 * How this Homing reaches its model, from the server's settings. The provider's API key isn't
 * here: it stays in this module, with the settings it came with, and goes only to the provider.
 */
export interface ModelSettings {
  /** The provider's Chat Completions API, such as https://openrouter.ai/api/v1. */
  readonly url: URL;
  /** How people know the provider: OpenRouter, OpenAI, or the address of a server of your own. */
  readonly provider: string;
  /** The capable model, for understanding and upkeep, and the cheaper one for simple sorting. */
  readonly capable: string;
  readonly cheaper: string;
  /** What each model Homing may call costs. A model without prices is never called. */
  readonly prices: ReadonlyMap<string, Prices>;
}

/** The model this Homing calls, by its settings. The provider it speaks to, and its key, stay in this module. */
export interface Model {
  readonly settings: ModelSettings;
}

/** Each key, by the settings it was read with, and each model's provider and key. Only this module reaches them. */
const keyOf = new WeakMap<ModelSettings, string>();
const providerOf = new WeakMap<Model, { provider: Provider; key?: string }>();

/** The model for these settings, with the adapter that speaks to its provider, which only callModel uses. */
export function modelOf(settings: ModelSettings): Model {
  const key = keyOf.get(settings);
  const model: Model = Object.freeze({ settings });
  providerOf.set(model, { provider: chatCompletions({ url: new URL(settings.url), key }), key });
  return model;
}

const openRouter = 'https://openrouter.ai/api/v1';

/**
 * The models Homing knows on OpenRouter, with their names and the prices on its list in October
 * 2026. OpenRouter also says what each call cost, which is what's recorded; these bound the worst
 * case before a call. Other providers' prices are set in MODEL_PRICES.
 */
const known: Record<string, { name: string; prices: Prices }> = {
  'anthropic/claude-sonnet-5.5': { name: 'Claude Sonnet 5.5', prices: { input: 2, output: 10 } },
  'anthropic/claude-haiku-5.5': { name: 'Claude Haiku 5.5', prices: { input: 0.1, output: 0.5, above: { tokens: 100_000, input: 0.5, output: 2.5 } } },
  'anthropic/claude-opus-5.5': { name: 'Claude Opus 5.5', prices: { input: 4, output: 20 } },
  'openai/gpt-6.1-sol': { name: 'GPT-6.1 Sol', prices: { input: 2, output: 10, above: { tokens: 272_000, input: 4, output: 15 } } },
  'openai/gpt-6-luna': { name: 'GPT-6 Luna', prices: { input: 0.1, output: 0.5, above: { tokens: 272_000, input: 0.2, output: 0.75 } } },
};

/** Homing's models on OpenRouter, unless MODEL_DEFAULT and MODEL_CHEAPER say otherwise. */
export const defaultModels = { capable: 'anthropic/claude-sonnet-5.5', cheaper: 'anthropic/claude-haiku-5.5' };

/** Providers by the host of their API, by the names people know them by. */
const providers: Record<string, string> = { 'openrouter.ai': 'OpenRouter', 'api.openai.com': 'OpenAI' };

/** A model by the name people know it by, such as Claude Sonnet 5.5, or its id. */
export function modelName(id: string): string {
  return known[id]?.name ?? id;
}

const modelId = /^[\w.:/@+-]{1,200}$/;
const price = '([0-9]+(?:\\.[0-9]+)?)/([0-9]+(?:\\.[0-9]+)?)';
const pricesHelp = 'MODEL_PRICES holds each model’s prices in dollars per million tokens in and out, such as gpt-6.1-sol=2/10, then any dearer prices from so many input tokens on, such as 4/15@272000, all separated by commas. See docs/deployment.md.';

/**
 * This Homing's model, from MODEL_API_URL, MODEL_API_KEY, MODEL_DEFAULT, MODEL_CHEAPER and
 * MODEL_PRICES. Undefined when none is set up; a setting that can't be used stops Homing from
 * starting, saying which, and never what the key is.
 */
export function modelFromEnvironment(env: Record<string, string | undefined> = process.env): ModelSettings | undefined {
  const setting = (name: string) => env[name]?.trim() || undefined;
  const key = setting('MODEL_API_KEY');
  const address = setting('MODEL_API_URL');
  const capable = setting('MODEL_DEFAULT');
  const cheaper = setting('MODEL_CHEAPER');
  const priced = setting('MODEL_PRICES');
  if (!key && !address) {
    if (capable || cheaper || priced) {
      throw new Error('A model is set, so Homing needs MODEL_API_KEY, or MODEL_API_URL for a model server that takes no key. See docs/deployment.md.');
    }
    return undefined;
  }
  if (key !== undefined && !/^[\x21-\x7e]{8,1000}$/.test(key)) {
    throw new Error('MODEL_API_KEY isn’t a key Homing can send: it’s too short, or has spaces or characters a key doesn’t. See docs/deployment.md.');
  }
  // Without an address, a key goes to OpenRouter, so only one of OpenRouter's own goes there.
  if (!address && !key!.startsWith('sk-or-')) {
    throw new Error('MODEL_API_KEY isn’t an OpenRouter key, so set MODEL_API_URL to the API it’s for, such as https://api.openai.com/v1. See docs/deployment.md.');
  }

  let url: URL;
  try {
    url = new URL(address ?? openRouter);
  } catch {
    throw new Error('MODEL_API_URL isn’t an address, such as https://openrouter.ai/api/v1. See docs/deployment.md.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('MODEL_API_URL must be the address of a Chat Completions API, such as https://openrouter.ai/api/v1, without a name, password or query in it. See docs/deployment.md.');
  }
  if (url.protocol === 'http:' && !nearby(url.hostname)) {
    throw new Error('MODEL_API_URL must use https, unless the model server is on this machine or your own network. See docs/deployment.md.');
  }
  const onOpenRouter = url.hostname === 'openrouter.ai';
  if (onOpenRouter && !key) throw new Error('OpenRouter needs a key, so set MODEL_API_KEY. See docs/deployment.md.');
  if (!onOpenRouter && !capable) throw new Error('Set MODEL_DEFAULT to the model Homing should use there. Homing knows which to use only on OpenRouter. See docs/deployment.md.');
  const models = { capable: capable ?? defaultModels.capable, cheaper: cheaper ?? (onOpenRouter ? defaultModels.cheaper : capable!) };
  for (const [name, id] of [['MODEL_DEFAULT', models.capable], ['MODEL_CHEAPER', models.cheaper]] as const) {
    if (!modelId.test(id)) throw new Error(`${name} isn’t a model’s id, such as ${defaultModels.capable}. See docs/deployment.md.`);
  }

  const prices = new Map<string, Prices>(onOpenRouter ? Object.entries(known).map(([id, model]) => [id, model.prices]) : []);
  let last: string | undefined;
  for (const entry of (priced ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const model = new RegExp(`^([^=\\s]+)=${price}$`).exec(entry);
    const tier = new RegExp(`^${price}@([0-9]+)$`).exec(entry);
    if (model && modelId.test(model[1])) {
      last = model[1];
      prices.set(last, checked({ input: Number(model[2]), output: Number(model[3]) }));
    } else if (tier && last && !prices.get(last)!.above) {
      const base = prices.get(last)!;
      // A dearer tier is never cheaper than the prices below it.
      const above = { tokens: Number(tier[3]), input: Math.max(Number(tier[1]), base.input), output: Math.max(Number(tier[2]), base.output) };
      if (!(Number.isSafeInteger(above.tokens) && above.tokens > 0)) throw new Error(pricesHelp);
      prices.set(last, { ...base, above: checked(above) });
    } else {
      throw new Error(pricesHelp);
    }
  }
  for (const id of new Set([models.capable, models.cheaper])) {
    if (!prices.has(id)) {
      throw new Error(
        `Homing doesn’t know what ${id} costs, so it couldn’t keep to a spending limit. Set its prices in MODEL_PRICES, such as ${id}=2/10, or ${id}=0/0 for a model of your own that costs nothing. See docs/deployment.md.`,
      );
    }
  }
  const settings: ModelSettings = Object.freeze({ url, provider: providers[url.hostname] ?? url.host, ...models, prices });
  if (key) keyOf.set(settings, key);
  return settings;
}

/** Prices that are plausible: up to $10,000 per million tokens. */
function checked<T extends { input: number; output: number }>(prices: T): T {
  if (!(prices.input <= 10_000 && prices.output <= 10_000)) throw new Error(pricesHelp);
  return prices;
}

/** Addresses on this machine or a private network, where a model server may take plain http. */
const nearbyAddresses = new BlockList();
nearbyAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
nearbyAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
nearbyAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
nearbyAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
nearbyAddresses.addAddress('::1', 'ipv6');
nearbyAddresses.addSubnet('fc00::', 7, 'ipv6');

/** Whether a host is on this machine or a private network: localhost, a private address, or a name without dots, such as a Compose service. */
function nearby(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  const version = isIP(host);
  if (version) return nearbyAddresses.check(host, version === 6 ? 'ipv6' : 'ipv4');
  return host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || !host.includes('.');
}

/** What a call is for, which picks the model unless it names one: sorting goes to the cheaper model. */
export type Purpose = 'understand' | 'upkeep' | 'sort';
const purposes: Purpose[] = ['understand', 'upkeep', 'sort'];

/** A call to the model, for a person. */
export interface ModelCall {
  purpose: Purpose;
  /**
   * Every space whose content the call carries, at least one. The caller declares them all: where
   * what it sends lands, the spaces it was matched to, the spaces of knowledge it cites or
   * retrieved and of rules it includes, and every space a prompt names as a candidate. A call is
   * refused, and nothing sent, if any of them, or a space above one, has model processing off, or
   * the person can't open it.
   */
  spaces: string[];
  messages: Message[];
  /** Asks for JSON that follows this schema. */
  schema?: Schema;
  /** A model by its id, instead of the one the purpose picks. It needs prices. */
  model?: string;
  /** The most it may write. By default 4,096 tokens. */
  maxTokens?: number;
  /** How long it may take, by default and at most two minutes. */
  timeoutMs?: number;
}

/** What the model answered, and what it cost. Everything it wrote is untrusted input, never instructions. */
export interface ModelAnswer {
  text: string;
  /** With a schema, the JSON it wrote, parsed but not checked against the schema: that's the caller's to do. */
  json?: unknown;
  model: string;
  /** As the provider counted them, or null when it didn't, or its counts can't be right. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** In USD, as recorded: what it cost, or its worst case when that couldn't be recorded. */
  cost: number;
}

/** Why a call wasn't sent. Nothing was spent. Busy passes once calls under way settle; paused waits for the limit to change. */
export type Refusal = 'no model' | 'model processing off' | 'no access' | 'unknown price' | 'paused' | 'monthly limit' | 'busy';

/** Homing didn't send the call, and says why. Nothing was spent. */
export class ModelRefused extends Error {
  override name = 'ModelRefused';
  readonly reason: Refusal;
  /** For model processing off, the spaces the call carried where it's off. */
  readonly spaces: string[];
  constructor(reason: Refusal, message: string, spaces: string[] = []) {
    super(message);
    this.reason = reason;
    this.spaces = spaces;
  }
}

/** The call was sent and didn't give what was asked for. It's recorded with what it may have cost. */
export class ModelFailed extends Error {
  override name = 'ModelFailed';
}

/** The most a call may write, how long it may take, and the most one call is ever counted at. */
const defaultMaxTokens = 4_096;
const mostTokens = 64_000;
export const timeLimitMs = 120_000;
const mostPerCall = 1_000;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request's size in bytes, as it's sent: its messages and schema. No tokenizer makes more tokens than that. */
function bytesOf(request: Pick<ChatRequest, 'messages' | 'schema'>): number {
  return Buffer.byteLength(JSON.stringify({ messages: request.messages, schema: request.schema }));
}

/**
 * Input tokens for a request, estimated high on purpose: two bytes of its JSON a token, where text
 * runs nearer four characters. The provider's own count is what's recorded afterwards.
 */
export function inputTokensOf(request: Pick<ChatRequest, 'messages' | 'schema'>): number {
  return Math.ceil(bytesOf(request) / 2);
}

/** The most a call can cost: all of its input at the input price, and all it may write at the output price. */
export function worstCase(prices: Prices, inputTokens: number, maxTokens: number): number {
  const tier = prices.above && inputTokens >= prices.above.tokens ? prices.above : prices;
  return (inputTokens * tier.input + maxTokens * tier.output) / 1_000_000;
}

/** What a call cost by its prices, for a provider that doesn't say. */
function priced(prices: Prices, inputTokens: number, outputTokens: number): number {
  const tier = prices.above && inputTokens >= prices.above.tokens ? prices.above : prices;
  return (inputTokens * tier.input + outputTokens * tier.output) / 1_000_000;
}

/** Dollars, in cents when that's exact, such as a limit, and otherwise to a hundredth of a cent. */
export function usd(value: number): string {
  const cents = Math.round(value * 100) / 100;
  return Math.abs(value - cents) < 1e-9 ? `$${cents.toFixed(2)}` : `$${value.toFixed(4)}`;
}

/**
 * Calls the model for a person: the one place Homing does. The call is refused, and nothing sent,
 * unless the database reserves its worst case first. It's sent with a time limit, and settled at
 * what the provider says it cost, or what its tokens cost by its prices, or else its worst case,
 * unless the provider refused it before any model ran.
 */
export async function callModel(homing: { sql: Sql; model?: Model }, person: string, call: ModelCall): Promise<ModelAnswer> {
  const model = homing.model;
  const held = model && providerOf.get(model);
  if (!model || !held) throw new ModelRefused('no model', 'Homing has no model set up, so nothing was sent.');
  const { provider, key } = held;
  if (!purposes.includes(call.purpose)) throw new TypeError('A model call says what it’s for.');
  if (!Array.isArray(call.messages) || call.messages.length === 0 || !call.messages.every((message) => ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')) {
    throw new TypeError('A model call has messages.');
  }
  // In order, so the same spaces are recorded the same way, whatever order they came in.
  const spaces = [...new Set((Array.isArray(call.spaces) ? call.spaces : []).map((space) => String(space).toLowerCase()))].sort();
  if (spaces.length === 0 || !spaces.every((space) => uuid.test(space))) {
    throw new ModelRefused('no access', 'A model call names every space whose content it carries, so nothing was sent.');
  }
  const id = call.model ?? (call.purpose === 'sort' ? model.settings.cheaper : model.settings.capable);
  const prices = model.settings.prices.get(id);
  if (!prices) throw new ModelRefused('unknown price', `Homing doesn’t know what ${id} costs, so it wasn’t called.`);
  const maxTokens = call.maxTokens ?? defaultMaxTokens;
  if (!(Number.isInteger(maxTokens) && maxTokens >= 1 && maxTokens <= mostTokens)) throw new TypeError(`A model call writes 1 to ${mostTokens} tokens.`);
  const timeoutMs = Math.min(call.timeoutMs ?? timeLimitMs, timeLimitMs);
  const request: ChatRequest = { model: id, messages: call.messages, schema: call.schema, maxTokens };
  const worst = worstCase(prices, inputTokensOf(request), maxTokens);

  const reserved = await reserve(homing.sql, person, { purpose: call.purpose, model: id, spaces, worst });

  let answer: ProviderAnswer;
  try {
    answer = await provider.chat(request, AbortSignal.timeout(timeoutMs));
  } catch (error) {
    // Refused before any model ran costs nothing; anything else may have been charged, so it counts at its worst case.
    const said = error instanceof ProviderRefused || error instanceof ProviderFailed ? plausibleCost(error.cost) : undefined;
    const before = error instanceof ProviderRefused;
    await settle(homing.sql, person, reserved, worst, { outcome: 'failed', cost: said ?? (before ? 0 : worst), from: said !== undefined ? 'provider' : before ? 'refused' : 'worst case' });
    const reason = error instanceof ProviderRefused || error instanceof ProviderFailed ? hidden(error.message, key) : 'something went wrong on the way';
    console.error(`model: a call to ${id}, for ${call.purpose}, failed: ${reason}`);
    throw new ModelFailed(`The model call failed: ${reason}.`);
  }

  // A provider's counts are believed only when they could be right: no more tokens in than the
  // request has bytes, no more out than it may write, and something counted for an answer.
  const text = typeof answer.text === 'string' ? answer.text : '';
  let tokens = { input: count(answer.inputTokens), output: count(answer.outputTokens) };
  if (
    tokens.input === null || tokens.output === null || tokens.input > bytesOf(request) || tokens.output > maxTokens ||
    (text.length > 0 && tokens.input === 0 && tokens.output === 0)
  ) {
    tokens = { input: null, output: null };
  }
  const said = plausibleCost(answer.cost);
  const cost = said ?? (tokens.input !== null && tokens.output !== null ? Math.min(priced(prices, tokens.input, tokens.output), mostPerCall) : worst);
  const from = said !== undefined ? 'provider' : tokens.input !== null ? 'prices' : 'worst case';
  if (cost > worst + 1e-9) console.warn(`model: a call to ${id}, for ${call.purpose}, cost ${usd(cost)}, more than the ${usd(worst)} reserved for it, so its prices may be out of date`);
  let json: unknown;
  let parsed = true;
  if (call.schema) {
    try {
      json = JSON.parse(text);
    } catch {
      parsed = false;
    }
  }
  const recorded = await settle(homing.sql, person, reserved, worst, { outcome: parsed ? 'done' : 'failed', cost, from, tokens });
  if (!parsed) {
    console.error(`model: a call to ${id}, for ${call.purpose}, failed: its answer wasn’t JSON`);
    throw new ModelFailed('The model call failed: its answer wasn’t the JSON asked for.');
  }
  return { text, ...(call.schema && { json }), model: id, inputTokens: tokens.input, outputTokens: tokens.output, cost: recorded };
}

/** A count of tokens as the provider gave it, or null when it gave none. */
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A cost the provider reported, as a number of dollars, at most the most one call is ever counted at; or none. */
function plausibleCost(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, mostPerCall) : undefined;
}

/** A reason with the key taken out, in case a provider's code held it. */
function hidden(reason: string, key: string | undefined): string {
  return key ? reason.split(key).join('[key]') : reason;
}

/** Reserves the call's worst case for the person, or throws why it was refused. */
async function reserve(sql: Sql, person: string, call: { purpose: Purpose; model: string; spaces: string[]; worst: number }): Promise<string> {
  let row: { call: string | null; refused: string | null; spent: string; underWay: string; cap: string };
  try {
    [row] = await withPrincipal(sql, { person }, ({ tx }) => tx<(typeof row)[]>`
      select * from reserve_model_call(${call.purpose}, ${call.model}, ${tx.array(call.spaces)}::uuid[], ${call.worst}::numeric)
    `);
  } catch (error) {
    if (error instanceof postgres.PostgresError && error.code === '42501') {
      if (error.message === 'model processing is off') {
        throw new ModelRefused('model processing off', 'Model processing is off in a space this call carries, so nothing was sent.', (error.detail ?? '').split(',').filter(Boolean));
      }
      if (error.message === 'no access to a space the call carries') throw new ModelRefused('no access', 'The call carries a space the person can’t open, so nothing was sent.');
    }
    throw error;
  }
  if (row.call) return row.call;
  const [spent, underWay, cap] = [Number(row.spent), Number(row.underWay), Number(row.cap)];
  if (row.refused === 'paused') {
    throw new ModelRefused('paused', `Learning is paused at this month’s limit of ${usd(cap)}, so nothing was sent. Whoever looks after Homing can raise the limit to resume it.`);
  }
  if (row.refused === 'busy') {
    throw new ModelRefused('busy', `Calls under way could take this month past its limit of ${usd(cap)}, with ${usd(underWay)} under way, so nothing was sent. Try again shortly, once they’re done.`);
  }
  console.warn(`model: learning paused at this month’s limit of ${usd(cap)}`);
  throw new ModelRefused(
    'monthly limit',
    `This month has ${usd(spent)} spent, and this call could cost up to ${usd(call.worst)}, past the limit of ${usd(cap)}, so nothing was sent. Learning is paused until whoever looks after Homing raises the limit.`,
  );
}

/**
 * Records what a reserved call cost. If that can't be recorded, it's recorded at its worst case
 * instead, and if not even that, the call stays reserved at its worst case: either way it never
 * counts for less, and what the provider answered still reaches the caller. A call already
 * counted at its worst case, because it ran too long, stays so.
 */
async function settle(
  sql: Sql,
  person: string,
  call: string,
  worst: number,
  outcome: { outcome: 'done' | 'failed'; cost: number; from: string; tokens?: { input: number | null; output: number | null } },
): Promise<number> {
  const record = (cost: number, from: string, tokens: { input: number | null; output: number | null }) =>
    withPrincipal(sql, { person }, ({ tx }) => tx`
      select settle_model_call(${call}::uuid, ${outcome.outcome}, ${cost}::numeric, ${from}, ${tokens.input}::integer, ${tokens.output}::integer)
    `);
  try {
    await record(outcome.cost, outcome.from, outcome.tokens ?? { input: null, output: null });
    return outcome.cost;
  } catch {
    try {
      await record(worst, 'worst case', { input: null, output: null });
    } catch {
      console.error('model: a call couldn’t be settled, so it stays counted at its worst case');
    }
    return worst;
  }
}

/** The model this Homing uses, as people are told: the provider, and its models by name. */
export function modelStatement(model: Model | undefined): { provider: string; capable: string; cheaper: string } | null {
  return model ? { provider: model.settings.provider, capable: modelName(model.settings.capable), cheaper: modelName(model.settings.cheaper) } : null;
}

/** Model processing in a space the person can open, or undefined when they can't. */
export interface ModelProcessing {
  on: boolean;
  /** When it was turned off in this space itself, and by whom. */
  offAt: Date | null;
  offBy: string | null;
  /** Whether it's off in a space above, and which, when the person can open that one too. */
  offAbove: boolean;
  offIn: string | null;
}

export async function modelProcessingOf(s: Session, spaceId: string): Promise<ModelProcessing | undefined> {
  const [row] = await s.tx<Omit<ModelProcessing, 'on'>[]>`select * from model_processing_of(${spaceId}::uuid)`;
  return row && { on: row.offAt === null && !row.offAbove, ...row };
}

/** Turns model processing off in a space the person looks after, or back on. Whether it changed anything. */
export async function setModelProcessing(s: Session, spaceId: string, on: boolean): Promise<boolean> {
  const [{ changed }] = await s.tx<{ changed: boolean }[]>`select set_model_processing(${spaceId}::uuid, ${on}) as changed`;
  return changed;
}

/** This Homing's monthly limit, and since when work has been paused at it, if it is. */
export async function monthlyLimit(s: Session): Promise<{ limit: number; pausedAt: Date | null }> {
  const [row] = await s.tx<{ monthlyLimit: string; pausedAt: Date | null }[]>`
    select monthly_limit,
           case when paused_at >= date_trunc('month', now(), 'UTC') and (changed_at is null or paused_at > changed_at) then paused_at end as paused_at
    from model_spending
  `;
  return { limit: Number(row.monthlyLimit), pausedAt: row.pausedAt };
}

/** Sets this Homing's monthly limit, which resumes work paused at the old one. Only whoever looks after Homing does. */
export async function setMonthlyLimit(s: Session, limit: number): Promise<void> {
  await s.tx`select set_model_limit(${limit}::numeric)`;
}

/** What the model did for the person this month: by what for, which model and which spaces. */
export interface ModelUse {
  purpose: Purpose;
  model: string;
  spaces: string[];
  calls: number;
  /** In USD: what the calls cost, and the worst case of those still under way. */
  cost: number;
  underWay: number;
}

export async function modelUseThisMonth(s: Session): Promise<ModelUse[]> {
  const rows = await s.tx<{ purpose: Purpose; model: string; spaces: string[]; calls: number; cost: string; underWay: string }[]>`
    select c.purpose, c.model, c.spaces, count(*)::integer as calls, coalesce(sum(c.cost), 0) as cost,
           coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0) as under_way
    from model_calls c
    where c.person_id = current_person_id() and c.started_at >= date_trunc('month', now(), 'UTC')
    group by c.purpose, c.model, c.spaces
    order by 5 desc, 4 desc
  `;
  return rows.map((row) => ({ ...row, cost: Number(row.cost), underWay: Number(row.underWay) }));
}

/** What the model cost this month for one person, for whoever looks after Homing. */
export interface ModelUsage {
  personId: string | null;
  name: string | null;
  calls: number;
  /** In USD: what was spent, and the worst case of the calls under way. */
  cost: number;
  underWay: number;
}

export async function modelUsageOfEveryone(s: Session): Promise<ModelUsage[]> {
  const rows = await s.tx<Record<keyof ModelUsage, string | null>[]>`select * from model_usage_this_month()`;
  return rows.map((row) => ({ personId: row.personId, name: row.name, calls: Number(row.calls), cost: Number(row.cost), underWay: Number(row.underWay) }));
}
