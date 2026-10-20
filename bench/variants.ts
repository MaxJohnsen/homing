// The ways the benchmarks present Homing to a model. Every variant uses Homing's real tools and
// words from tools/list and its MCP instructions; the harness only leaves out, splits or adds to
// them, so nothing in Homing changes between variants.

import type { Tool } from '@modelcontextprotocol/client';
import type { Homing, Setup } from './agent.ts';
import type { FunctionTool } from './openrouter.ts';

/** What every conversation's system prompt starts with, like a chat app's own. */
export const baseSystem = 'You are a helpful assistant. Today is Tuesday, 20 October 2026.';

/**
 * Homing's MCP tools as functions a model can call. They aren't strict: MCP's schemas have
 * optional fields, which strict function calling can't leave out, and GPT models call functions
 * strictly unless told otherwise, filling every optional field with something.
 */
function functionTool(tool: Tool): FunctionTool {
  const { $schema: _, ...parameters } = tool.inputSchema as Record<string, unknown>;
  return { type: 'function', function: { name: tool.name, description: tool.description ?? '', parameters, strict: false } };
}

const named = (tools: Tool[]) => new Set(tools.map((tool) => tool.name));
const same = (text: string) => text;

/** The system prompt with the server's instructions, the way clients that show them add them. */
function instructed(instructions: string) {
  return `${baseSystem}\n\n# Instructions from the Homing connector\n\n${instructions}`;
}

/** Benchmark 1, MCP only: the tools and their descriptions, and nothing else about Homing. */
export function mcpOnly(tools: Tool[]): Setup {
  const names = named(tools);
  return { system: baseSystem, tools: tools.map(functionTool), route: (name, args) => (names.has(name) ? { tool: name, args } : undefined), rewrite: same };
}

/** Homing as it is: its tools, with its one recommended instruction as the system prompt. */
export function recommended(tools: Tool[], instructions: string): Setup {
  return { ...mcpOnly(tools), system: instructed(instructions) };
}

/**
 * Benchmark 2's dedicated tools: each of act's actions is a function of its own, with act's
 * description of it and that action's own input, and the harness turns a call back into act.
 * Homing's words that point to `act` point to the matching function instead.
 */
export function dedicated(tools: Tool[], instructions: string): Setup {
  const act = tools.find((tool) => tool.name === 'act')!;
  const schema = act.inputSchema as unknown as { properties: { action: { enum: string[] }; input: { anyOf: Record<string, unknown>[] } } };
  const actions = schema.properties.action.enum;
  const description = act.description ?? '';
  const underscored = (action: string) => action.replace('.', '_');

  // act describes its actions one after another, each starting a sentence with its name.
  const starts = actions
    .map((action) => {
      const found = new RegExp(`(^|\\. )${action.replace('.', '\\.')}\\b`).exec(description);
      if (!found) throw new Error(`act's description doesn't describe ${action}`);
      return { action, at: found.index + found[1].length };
    })
    .sort((a, b) => a.at - b.at);
  const rewrite = (text: string) => {
    let result = text;
    for (const [from, to] of [
      ['Reopen it with `act` and space.archive', 'Reopen it with `space_archive`'],
      ['Then create it with `act`', 'Then create it with `space_create`'],
      ['make them an admin or remove them, propose it with `act`', 'make them an admin or remove them, propose it with `members_change`'],
      ['shared with everyone in its space, propose it with `act`', 'shared with everyone in its space, propose it with `knowledge_publish`'],
      ['suggest a space with `act`', 'suggest a space with `space_suggest`'],
      ['remove a rule, propose it with `act`', 'remove a rule, propose it with `guidance_propose`'],
      ['propose a change with `act`', 'propose a change with `guidance_propose`'],
    ]) {
      result = result.split(from).join(to);
    }
    result = result.replaceAll('`act`', 'the action tools');
    for (const action of actions) result = result.replace(new RegExp(`\\b${action.replace('.', '\\.')}\\b`, 'g'), underscored(action));
    return result;
  };

  const actionTools: FunctionTool[] = starts.map(({ action, at }, index) => {
    const input = schema.properties.input.anyOf.find((option) => option.description === `For ${action}`);
    if (!input) throw new Error(`act has no input for ${action}`);
    const { description: _, ...parameters } = input;
    const words = description.slice(at, starts[index + 1]?.at ?? description.length).trim();
    return { type: 'function', function: { name: underscored(action), description: rewrite(words), parameters, strict: false } };
  });
  const others = tools.filter((tool) => tool.name !== 'act').map(functionTool);
  for (const tool of others) tool.function.description = rewrite(tool.function.description);
  const names = named(tools);
  return {
    system: rewrite(instructed(instructions)),
    tools: [...others, ...actionTools],
    route(name, args) {
      const action = actions.find((candidate) => underscored(candidate) === name);
      if (action) return { tool: 'act', args: { action, input: args } };
      return names.has(name) && name !== 'act' ? { tool: name, args } : undefined;
    },
    rewrite,
  };
}

export type ContextSize = 'core' | 'relevant' | 'full';

/** How many pages the full variant adds, from the top of what's relevant. */
const fullPages = 5;

/**
 * Benchmark 3: what `context` returns, made smaller or larger by the harness. Core leaves out
 * what's relevant to the request. Relevant is Homing as it is: core, plus the knowledge that
 * matches the request, one line an item. Full adds the pages that knowledge is on, in full, as
 * `read` gives them.
 */
export function contextSized(tools: Tool[], instructions: string, size: ContextSize): Setup {
  return {
    ...recommended(tools, instructions),
    async after(call, text, homing) {
      if (call.tool !== 'context') return text;
      const at = text.indexOf('\n## Relevant to the request');
      // Only a list of spaces to choose from: nothing to size.
      if (at < 0 || size === 'relevant') return text;
      if (size === 'core') return text.slice(0, at);
      return `${text}\n\n## The pages these are on, in full\n\n${(await pagesOf(homing, text.slice(at))).join('\n\n')}`;
    },
  };
}

/** The pages the relevant knowledge is on, in the order it was found, read in full. */
async function pagesOf(homing: Homing, relevant: string): Promise<string[]> {
  const pages: string[] = [];
  for (const [, kind, id] of relevant.matchAll(/\((page|item):([0-9a-f-]{36})/g)) {
    const page = kind === 'page' ? `page:${id}` : /on (page:[0-9a-f-]{36})/.exec((await homing.call('read', { ref: `item:${id}` })).text)?.[1];
    if (page && !pages.includes(page)) pages.push(page);
    if (pages.length >= fullPages) break;
  }
  const read: string[] = [];
  for (const page of pages) {
    const answer = await homing.call('read', { ref: page });
    if (!answer.failed) read.push(answer.text);
  }
  return read;
}
