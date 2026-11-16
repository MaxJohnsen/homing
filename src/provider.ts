// What a model provider is asked and answers (spec §11): the small interface every adapter, such
// as chat-completions.ts, implements. Only model.ts holds a provider and calls it, so every call
// passes its checks; nothing else in Homing reaches one.

/** One message of a chat. */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A JSON schema the answer must follow, with a short name for it. */
export interface Schema {
  name: string;
  schema: Record<string, unknown>;
}

/** What a provider is asked: one chat with one model, answered as text or as JSON for the schema. */
export interface ChatRequest {
  model: string;
  messages: Message[];
  schema?: Schema;
  /** The most it may write, which bounds what it costs. */
  maxTokens: number;
}

/** What a provider answered, with its tokens and cost when it says. */
export interface ProviderAnswer {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  /** In USD, when the provider says what it charged. */
  cost?: number;
}

/** A provider of models. It throws ProviderRefused or ProviderFailed, never with anything the provider sent in it. */
export interface Provider {
  chat(request: ChatRequest, signal: AbortSignal): Promise<ProviderAnswer>;
}

/** The provider refused the request before any model ran, such as for a key it doesn't know. Nothing was charged, unless it says so. */
export class ProviderRefused extends Error {
  override name = 'ProviderRefused';
  /** In USD, if the provider said it charged anything. */
  readonly cost?: number;
  /** The status it answered with. */
  readonly status?: number;
  /** How many seconds it asked to wait before asking again, when it said. */
  readonly retryAfter?: number;
  constructor(reason: string, cost?: number, status?: number, retryAfter?: number) {
    super(reason);
    this.cost = cost;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** The provider failed, or didn't answer in time, maybe after a model ran. It may have charged for it, unless the request never reached it. */
export class ProviderFailed extends Error {
  override name = 'ProviderFailed';
  /** In USD, if the provider said what it charged. */
  readonly cost?: number;
  /** The status it answered with, if it answered. */
  readonly status?: number;
  /** How many seconds it asked to wait before asking again, when it said. */
  readonly retryAfter?: number;
  /** No connection to the provider could be made, so the request never reached it and nothing was charged. */
  readonly unsent: boolean;
  constructor(reason: string, cost?: number, status?: number, retryAfter?: number, unsent = false) {
    super(reason);
    this.cost = cost;
    this.status = status;
    this.retryAfter = retryAfter;
    this.unsent = unsent;
  }
}
