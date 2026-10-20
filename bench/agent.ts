// The agent loop: a model gets Homing's tools as functions, calls them, and the harness forwards
// each call to Homing over MCP, as the person's connected assistant, until the model answers or
// runs out of turns.

import type { Client } from '@modelcontextprotocol/client';
import { redact, type FunctionTool, type Message, type Model } from './openrouter.ts';

/** How one variant presents Homing to the model. */
export interface Setup {
  system: string;
  tools: FunctionTool[];
  /** The Homing tool and arguments a function call stands for, or nothing when there's no such function. */
  route(name: string, args: Record<string, unknown>): { tool: string; args: Record<string, unknown> } | undefined;
  /** Homing's words as this variant shows them to the model. */
  rewrite(text: string): string;
  /** Changes what a tool returned before the model sees it, such as context's size in benchmark 3. */
  after?(call: { tool: string; args: Record<string, unknown> }, text: string, homing: Homing): Promise<string>;
}

/** Calls Homing's tools as the person's assistant. */
export interface Homing {
  call(tool: string, args: Record<string, unknown>): Promise<{ text: string; failed: boolean }>;
}

export function homingOver(client: Client): Homing {
  return {
    async call(tool, args) {
      try {
        const result = await client.callTool({ name: tool, arguments: args });
        const text = (result.content as { type: string; text?: string }[]).map((block) => (block.type === 'text' ? block.text : '')).join('\n');
        return { text, failed: Boolean(result.isError) };
      } catch (error) {
        // Arguments the tool's schema refuses come back as a protocol error.
        return { text: error instanceof Error ? error.message : String(error), failed: true };
      }
    },
  };
}

export interface Call {
  /** The function the model called. */
  name: string;
  /** The Homing tool it stands for, if any. */
  tool?: string;
  args: Record<string, unknown> | string;
  failed: boolean;
  /** What Homing answered, shortened. */
  answer: string;
  ms: number;
}

export interface Trace {
  calls: Call[];
  /** Every text the model wrote, in order. */
  texts: string[];
  modelCalls: number;
  nudged: boolean;
  /** The conversation hit the turn limit before the model answered. */
  outOfTurns: boolean;
  finishReasons: string[];
  providers: string[];
  usage: { prompt: number; completion: number; cached: number; cacheWrite: number; reasoning: number; cost: number };
  modelMs: number;
  homingMs: number;
  totalMs: number;
}

export interface Conversation {
  model: Model;
  setup: Setup;
  homing: Homing;
  prompt: string;
  /** A reply the user sends once if the model stops before doing what was asked, such as when it asks for permission. */
  nudge?: { text: string; needed(trace: Trace): boolean };
  label: string;
  maxTurns?: number;
  maxTokens?: number;
}

/** Runs one conversation to its end, and says everything that happened in it. */
export async function converse(conversation: Conversation): Promise<Trace> {
  const { model, setup, homing } = conversation;
  const started = performance.now();
  const trace: Trace = {
    calls: [],
    texts: [],
    modelCalls: 0,
    nudged: false,
    outOfTurns: false,
    finishReasons: [],
    providers: [],
    usage: { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, reasoning: 0, cost: 0 },
    modelMs: 0,
    homingMs: 0,
    totalMs: 0,
  };
  const messages: Message[] = [
    { role: 'system', content: setup.system },
    { role: 'user', content: conversation.prompt },
  ];
  const anthropic = model.id.startsWith('anthropic/');

  for (let turn = 0; ; turn++) {
    if (turn >= (conversation.maxTurns ?? 10)) {
      trace.outOfTurns = true;
      break;
    }
    const completion = await model.complete({
      messages: anthropic ? cached(messages) : messages,
      tools: setup.tools,
      maxTokens: conversation.maxTokens ?? 4096,
      label: conversation.label,
    });
    trace.modelCalls++;
    trace.modelMs += completion.ms;
    trace.finishReasons.push(completion.finishReason);
    if (completion.provider) trace.providers.push(completion.provider);
    trace.usage.prompt += completion.usage.promptTokens;
    trace.usage.completion += completion.usage.completionTokens;
    trace.usage.cached += completion.usage.cachedTokens;
    trace.usage.cacheWrite += completion.usage.cacheWriteTokens;
    trace.usage.reasoning += completion.usage.reasoningTokens;
    trace.usage.cost += completion.usage.cost;
    messages.push(completion.message);
    if (completion.message.content?.trim()) trace.texts.push(completion.message.content);

    const calls = completion.message.tool_calls ?? [];
    for (const call of calls) {
      const answered = await forward(setup, homing, call.function.name, call.function.arguments);
      trace.calls.push(answered.call);
      trace.homingMs += answered.call.ms;
      messages.push({ role: 'tool', tool_call_id: call.id, content: answered.text });
    }
    if (calls.length) continue;
    if (conversation.nudge && !trace.nudged && conversation.nudge.needed(trace)) {
      trace.nudged = true;
      messages.push({ role: 'user', content: conversation.nudge.text });
      continue;
    }
    break;
  }
  trace.totalMs = performance.now() - started;
  return trace;
}

/** One function call, forwarded to Homing as the tool it stands for. */
async function forward(setup: Setup, homing: Homing, name: string, rawArgs: string): Promise<{ call: Call; text: string }> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('not an object');
  } catch {
    const text = 'The arguments were not valid JSON, so nothing was done.';
    return { call: { name, args: rawArgs, failed: true, answer: text, ms: 0 }, text };
  }
  const routed = setup.route(name, args);
  if (!routed) {
    const text = `There is no tool called ${name}.`;
    return { call: { name, args, failed: true, answer: text, ms: 0 }, text };
  }
  const started = performance.now();
  const result = await homing.call(routed.tool, routed.args);
  let text = result.text;
  if (setup.after) text = await setup.after(routed, text, homing);
  const ms = performance.now() - started;
  text = setup.rewrite(text);
  return { call: { name, tool: routed.tool, args: routed.args, failed: result.failed, answer: redact(text).slice(0, 1500), ms }, text };
}

/**
 * Marks the system prompt and the newest message for Anthropic's prompt cache, as Claude's own
 * apps do, so each turn rereads what came before at the cached price. Other providers cache on
 * their own.
 */
function cached(messages: Message[]): Message[] {
  return messages.map((message, index) => {
    const mark = message.role === 'system' || index === messages.length - 1;
    if (!mark || message.role === 'assistant' || typeof message.content !== 'string') return message;
    return { ...message, content: [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }] } as Message;
  });
}
