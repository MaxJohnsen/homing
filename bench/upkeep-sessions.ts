// Benchmark 0, scenario 2: the same piece of work over five fresh sessions, kept three ways.
//
//   wiki    Ana's wiki of Markdown files, which the assistant reads, searches, writes whole or edits
//           in part, with each file's earlier versions kept, as a git repository would.
//   homing  Homing as it is, over MCP, as the assistant Ana connected: Claude or ChatGPT.
//   append  The same Homing, but remember can only add: no replaces or updates.
//
// Each starts from the same world: Ana's work at Acme from benchmarks 1 to 3, as Homing pages, or
// those pages as wiki files. Each runs with and without a session record at the end of a session.

import { converse, homingOver, type Homing, type Setup, type Stub, type Trace } from './agent.ts';
import { as, makeWorld, type Bench, type World } from './homing.ts';
import { redact, type FunctionTool, type Model } from './openrouter.ts';
import { recommended } from './variants.ts';
import { carried, outdated, readbackFacts, recordRequest, sessions, staleMentions, wikiSchema, workFacts, type Session } from './upkeep-work.ts';
import { listPages, overviewOf, readPage } from '../src/knowledge.ts';
import { listSpaces } from '../src/spaces.ts';
import { Assistant, assistants } from '../test/assistant.ts';

export type WorkApproach = 'wiki' | 'homing' | 'append';
export const workApproaches: WorkApproach[] = ['wiki', 'homing', 'append'];

/** A page or file of the work, as it is after a turn. */
export interface Doc {
  id: string;
  title: string;
  text: string;
  /** Item ids on a Homing page, for telling whether a session read it. */
  items: string[];
  /** A session record or a log, not the work itself. */
  record: boolean;
}

const isRecord = (title: string) => /session|\blog\b|handoff|hand-off|økt|journal|work ?log/i.test(title);

/** One way of keeping the work, with what a session needs and what it has made so far. */
interface Keeper {
  /** A session's setup for a model: its prompt and tools, and how calls reach the work. */
  open(model: Model, session: Session): Promise<{ setup: Setup; homing: Homing; close(): Promise<void> }>;
  /** The work as it is: what the sessions wrote, page by page. */
  docs(): Promise<Doc[]>;
  /** Whether a call writes to the work, and how many characters it sends. */
  written(call: Trace['calls'][number]): { write: boolean; chars: number; rewrite: boolean };
  /** Whether a call reads one of these docs in full. */
  reads(call: Trace['calls'][number], docs: Doc[]): boolean;
}

const system = (today: string) => `You are a helpful assistant. Today is ${today}.`;

// The wiki.

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false }, strict: false },
});
const str = (description: string) => ({ type: 'string', description });

class WikiWork implements Keeper {
  readonly files = new Map<string, string>();
  readonly seeded = new Map<string, string>();
  /** Earlier versions of each file, oldest first, with the session that replaced them. */
  readonly history = new Map<string, { session: string; content: string }[]>();
  /** Paths written in the current session, so a write to one that existed counts as a rewrite. */
  private session = '';

  /** The world's pages as files, with an index and a log, as Ana's wiki would have them. */
  async seed(bench: Bench, world: World) {
    await as(bench, { person: world.ana.id, direct: true }, async (s) => {
      const spaces = await listSpaces(s);
      const byId = new Map(spaces.map((space) => [space.id, space]));
      const folder = (spaceId: string): string => {
        const parts: string[] = [];
        for (let at = byId.get(spaceId); at; at = at.parentId ? byId.get(at.parentId) : undefined) parts.unshift(at.privateTo && !at.parentId ? 'personal' : slug(at.name));
        return parts.join('/');
      };
      for (const space of spaces) {
        const overview = await overviewOf(s, space.id);
        if (overview?.items.length) this.files.set(`${folder(space.id)}/overview.md`, `# ${space.name}\n\n${overview.items.map((item) => item.body).join('\n\n')}\n`);
        for (const listed of await listPages(s, space.id)) {
          const page = await readPage(s, listed.id);
          if (!page || page.type === 'guidance' || page.type === 'skill') continue;
          this.files.set(`${folder(space.id)}/${slug(page.title)}.md`, `# ${page.title}\n\n${page.type ? `Type: ${page.type}\n\n` : ''}${page.items.map((item) => `- ${item.body}`).join('\n')}\n`);
        }
      }
    });
    const paths = [...this.files.keys()].sort();
    this.files.set('index.md', `# Index\n\n${paths.map((path) => `- ${path}: ${this.files.get(path)!.split('\n')[0].replace(/^# /, '')}`).join('\n')}\n`);
    this.files.set('log.md', '# Log\n\n- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.\n');
    for (const [path, content] of this.files) this.seeded.set(path, content);
    return this;
  }

  private keep(path: string, content: string | undefined) {
    if (content === undefined) return;
    this.history.set(path, [...(this.history.get(path) ?? []), { session: this.session, content }]);
  }

  private stubs(): Stub[] {
    return [
      {
        tool: tool('wiki_list', 'Lists every file in the wiki, with its size and first line.', {}, []),
        answer: () =>
          [...this.files.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([path, content]) => `- ${path} (${content.length} characters): ${content.split('\n')[0]}`)
            .join('\n'),
      },
      {
        tool: tool('wiki_read', 'Reads a file, or one of its earlier versions.', { path: str('Such as index.md'), version: { type: 'integer', description: 'An earlier version, from wiki_history. Leave it out for the file as it is.' } }, ['path']),
        answer: ({ path, version }) => {
          const where = pathOf(path);
          if (!where) return `There is no file ${String(path)}.`;
          if (version !== undefined) {
            const earlier = this.history.get(where)?.[Number(version) - 1];
            return earlier ? earlier.content : `${where} has no version ${String(version)}.`;
          }
          return this.files.get(where) ?? `There is no file ${where}.`;
        },
      },
      {
        tool: tool('wiki_search', 'Finds the lines in the wiki with any of the words.', { query: str('Words to look for') }, ['query']),
        answer: ({ query }) => {
          const terms = String(query ?? '')
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((term) => term.length > 2);
          const lines: string[] = [];
          for (const [path, content] of [...this.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            for (const [index, line] of content.split('\n').entries()) if (terms.some((term) => line.toLowerCase().includes(term))) lines.push(`${path}:${index + 1}: ${line}`);
          }
          return lines.length ? lines.slice(0, 60).join('\n') + (lines.length > 60 ? `\n…and ${lines.length - 60} more lines.` : '') : 'No matches.';
        },
      },
      {
        tool: tool('wiki_write', 'Writes a whole file: a new one, or a new version of one that exists.', { path: str('Such as northwind/relaunch.md'), content: str('The whole file, in Markdown') }, ['path', 'content']),
        answer: ({ path, content }) => {
          const where = pathOf(path);
          if (!where) return 'A path is a relative file name ending in .md. Nothing was written.';
          if (typeof content !== 'string' || !content.trim()) return 'Give the content. Nothing was written.';
          const before = this.files.get(where);
          this.keep(where, before);
          this.files.set(where, content);
          return `${before === undefined ? 'Wrote' : 'Replaced'} ${where} (${content.length} characters).`;
        },
      },
      {
        tool: tool(
          'wiki_edit',
          'Replaces one exact piece of text in a file. The text must occur exactly once.',
          { path: str('The file'), old_text: str('The exact text to replace'), new_text: str('What it becomes') },
          ['path', 'old_text', 'new_text'],
        ),
        answer: ({ path, old_text: find, new_text: replace }) => {
          const where = pathOf(path);
          const content = where ? this.files.get(where) : undefined;
          if (!where || content === undefined) return `There is no file ${String(path)}. Nothing was changed.`;
          if (typeof find !== 'string' || !find || typeof replace !== 'string') return 'Give old_text and new_text. Nothing was changed.';
          const count = content.split(find).length - 1;
          if (count !== 1) return `old_text occurs ${count} times in ${where}, not once. Nothing was changed.`;
          this.keep(where, content);
          this.files.set(where, content.replace(find, () => replace));
          return `Edited ${where}.`;
        },
      },
      {
        tool: tool('wiki_history', "Lists a file's earlier versions.", { path: str('The file') }, ['path']),
        answer: ({ path }) => {
          const where = pathOf(path);
          const versions = where ? this.history.get(where) : undefined;
          if (!versions?.length) return `${String(path)} has no earlier versions.`;
          return versions.map((version, index) => `- version ${index + 1}: ${version.content.length} characters, replaced in ${version.session}`).join('\n');
        },
      },
      {
        tool: tool('wiki_delete', 'Removes a file. Its earlier versions are kept.', { path: str('The file') }, ['path']),
        answer: ({ path }) => {
          const where = pathOf(path);
          if (!where || !this.files.has(where)) return `There is no file ${String(path)}.`;
          this.keep(where, this.files.get(where));
          this.files.delete(where);
          return `Deleted ${where}.`;
        },
      },
    ];
  }

  async open(_model: Model, session: Session) {
    this.session = `session ${session.id.slice(1)}`;
    const setup: Setup = { system: `${system(session.today)}\n\n# The user's wiki\n\n${wikiSchema}`, tools: [], route: () => undefined, rewrite: (text) => text, stubs: this.stubs() };
    return { setup, homing: { call: async () => ({ text: '', failed: true }) }, close: async () => {} };
  }

  async docs() {
    return [...this.files.entries()]
      .filter(([path, content]) => this.seeded.get(path) !== content && path !== 'index.md')
      .map(([path, text]) => ({ id: path, title: path, text, items: [], record: isRecord(path) }));
  }

  written(call: Trace['calls'][number]) {
    const args = typeof call.args === 'object' ? call.args : {};
    if (call.name === 'wiki_write') return { write: true, chars: String(args.content ?? '').length, rewrite: /^Replaced/.test(call.answer) };
    if (call.name === 'wiki_edit') return { write: true, chars: String(args.new_text ?? '').length, rewrite: false };
    if (call.name === 'wiki_delete') return { write: true, chars: 0, rewrite: false };
    return { write: false, chars: 0, rewrite: false };
  }

  reads(call: Trace['calls'][number], docs: Doc[]) {
    const args = typeof call.args === 'object' ? call.args : {};
    return call.name === 'wiki_read' && docs.some((doc) => doc.id === pathOf(args.path) && !doc.record);
  }
}

function pathOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const path = value.trim().replace(/^\/+/, '');
  if (!/^[\p{L}\p{N}_\-./ ]+\.md$/u.test(path) || path.split('/').some((part) => part === '..' || part === '.' || !part)) return undefined;
  return path;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Homing, as it is or adding only.

class HomingWork implements Keeper {
  private readonly bench: Bench;
  readonly world: World;
  private readonly append: boolean;
  private readonly connected: Record<'claude' | 'chatgpt', Assistant>;

  private constructor(bench: Bench, world: World, append: boolean, connected: Record<'claude' | 'chatgpt', Assistant>) {
    this.bench = bench;
    this.world = world;
    this.append = append;
    this.connected = connected;
  }

  /** Ana's world, with both of her assistants connected. */
  static async make(bench: Bench, append: boolean) {
    const world = await makeWorld(bench, 'claude');
    const chatgpt = new Assistant(bench.homing.url, assistants.chatgpt);
    await chatgpt.connect(world.ana.browser);
    return new HomingWork(bench, world, append, { claude: world.assistant, chatgpt });
  }

  async open(model: Model, session: Session) {
    const connection = await this.connected[model.id.startsWith('anthropic/') ? 'claude' : 'chatgpt'].open();
    const { tools } = await connection.client.listTools();
    const instructions = connection.client.getInstructions() ?? '';
    const setup = recommended(this.append ? tools.map(addingOnly) : tools, instructions);
    setup.system = setup.system.replace('Tuesday, 20 October 2026', session.today);
    const real = homingOver(connection.client);
    const homing: Homing = this.append
      ? {
          call: async (name, args) =>
            name === 'remember' && (args.replaces !== undefined || args.updates !== undefined)
              ? { text: "Nothing was saved: here, remember only adds. Save what changed as a new item, and leave out replaces and updates.", failed: true }
              : real.call(name, args),
        }
      : real;
    return { setup, homing, close: () => connection.close() };
  }

  async docs() {
    return as(this.bench, { person: this.world.ana.id, direct: true }, async (s) => {
      const changed = await s.tx<{ pageId: string }[]>`
        select distinct page_id from content where kind in ('text', 'title') and (created_at > ${this.world.madeAt} or updated_at > ${this.world.madeAt})
      `;
      const docs: Doc[] = [];
      for (const { pageId } of changed) {
        const page = await readPage(s, pageId);
        if (!page || page.type === 'guidance' || page.type === 'skill' || page.type === 'overview') continue;
        docs.push({ id: page.id, title: page.title, text: `# ${page.title}\n\n${page.items.map((item) => item.body).join('\n\n')}`, items: page.items.map((item) => item.id), record: isRecord(page.title) });
      }
      return docs;
    });
  }

  written(call: Trace['calls'][number]) {
    const args = typeof call.args === 'object' ? call.args : {};
    if (call.tool !== 'remember' || args.task !== undefined || call.failed) return { write: false, chars: 0, rewrite: false };
    return { write: true, chars: String(args.text ?? '').length, rewrite: args.updates !== undefined || args.replaces !== undefined };
  }

  reads(call: Trace['calls'][number], docs: Doc[]) {
    const args = typeof call.args === 'object' ? call.args : {};
    if (call.tool !== 'read' || typeof args.ref !== 'string') return false;
    const id = args.ref.replace(/^(page|item):/i, '');
    return docs.some((doc) => !doc.record && (doc.id === id || doc.items.includes(id)));
  }
}

/** remember without replaces and updates, for Homing that only adds. */
function addingOnly(tool: { name: string; description?: string; inputSchema: unknown }) {
  if (tool.name !== 'remember') return tool as never;
  const schema = structuredClone(tool.inputSchema) as { properties: Record<string, unknown> };
  delete schema.properties.replaces;
  delete schema.properties.updates;
  const description = (tool.description ?? '')
    .replace(/replaces and updates are for what assistants wrote:[^.]*\. /, '')
    .concat(' Items are only added here: what changed is saved as a new item.');
  return { ...tool, description, inputSchema: schema } as never;
}

// Running the sessions.

export interface TurnResult {
  turn: number;
  /** Characters the assistant sent to be written, and how many writes and whole rewrites. */
  chars: number;
  writes: number;
  rewrites: number;
  /** Lines of the work that changed, of how many before. */
  changed: number;
  lines: number;
}

export interface SessionResult {
  scenario: 'work';
  key: string;
  phase: string;
  run: number;
  approach: WorkApproach;
  record: boolean;
  session: string;
  model: string;
  at: string;
  error?: string;
  turns?: TurnResult[];
  /** Whether it read the work in full before its first write, in sessions after the first. */
  readFirst?: boolean;
  /** Whether it read a session record or log. */
  readRecord?: boolean;
  docs?: { title: string; chars: number; record: boolean }[];
  facts?: Record<string, boolean>;
  stale?: Record<string, string[]>;
  carried?: Record<string, boolean>;
  /** What Ana said between them and the assistant only, found in the work outside records. */
  remarkInWork?: boolean;
  answer?: string;
  answerFacts?: Record<string, boolean>;
  answerStale?: Record<string, string[]>;
  calls?: { name: string; args: unknown; failed: boolean; answer: string; turn: number }[];
  texts?: { turn: number; text: string }[];
  modelCalls?: number;
  nudged?: boolean;
  outOfTurns?: boolean;
  usage?: Trace['usage'];
  modelMs?: number;
  totalMs?: number;
}

export interface WorkArm {
  approach: WorkApproach;
  record: boolean;
  run: number;
}

export const armKey = (arm: WorkArm) => `${arm.approach}|${arm.record ? 'record' : 'none'}|${arm.run}`;

const lineCounts = (docs: Doc[]) => {
  const counts = new Map<string, number>();
  for (const doc of docs) for (const line of doc.text.split('\n').map((l) => l.trim()).filter(Boolean)) counts.set(`${doc.id}\u0000${line}`, (counts.get(`${doc.id}\u0000${line}`) ?? 0) + 1);
  return counts;
};

/** Lines added or removed between two snapshots, and how many lines there were before. */
function changedLines(before: Doc[], after: Doc[]) {
  const a = lineCounts(before);
  const b = lineCounts(after);
  let changed = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) changed += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  return { changed, lines: [...a.values()].reduce((sum, count) => sum + count, 0) };
}

const has = (text: string, all: RegExp[][]) => all.every((fact) => fact.some((pattern) => pattern.test(text)));

/**
 * Runs an arm's five sessions in order, each with the model whose turn it is, and checks the work
 * after each. Calls onSession with each session's result as it finishes.
 */
export async function runArm(
  bench: Bench,
  arm: WorkArm,
  phase: string,
  modelFor: (session: number) => Model,
  onSession: (result: SessionResult) => void,
  options: { sessions?: number } = {},
) {
  const keeper: Keeper = arm.approach === 'wiki' ? await new WikiWork().seed(bench, await makeWorld(bench, 'claude')) : await HomingWork.make(bench, arm.approach === 'append');
  const count = options.sessions ?? sessions.length;
  for (const [index, session] of sessions.slice(0, count).entries()) {
    const model = modelFor(index);
    const key = `work|${armKey(arm)}|${session.id}`;
    const base = { scenario: 'work' as const, key, phase, run: arm.run, approach: arm.approach, record: arm.record, session: session.id, model: model.id, at: new Date().toISOString() };
    try {
      const atStart = await keeper.docs();
      const { setup, homing, close } = await keeper.open(model, session);
      const turns = [...session.turns.map((turn) => turn.say), ...(arm.record && session.record ? [recordRequest] : [])];
      const changes = [...session.turns.map((turn) => turn.changes), ...(arm.record && session.record ? [true] : [])];
      const snapshots: Doc[][] = [atStart];
      let trace: Trace;
      try {
        trace = await converse({
          model,
          setup,
          homing,
          turns,
          label: key,
          maxTurns: 20,
          maxTokens: 8192,
          nudge: { text: 'Yes, please go ahead.', needed: (t, turn) => changes[turn] && !t.calls.some((call) => call.turn === turn && keeper.written(call).write) },
          afterTurn: async () => {
            snapshots.push(await keeper.docs());
          },
        });
      } finally {
        await close();
      }
      const after = snapshots.at(-1)!;
      const work = after.map((doc) => doc.text).join('\n\n');
      const notRecords = after.filter((doc) => !doc.record).map((doc) => doc.text).join('\n\n');
      const said = trace.texts.map((text) => text.text).join('\n\n');
      const firstWrite = trace.calls.findIndex((call) => keeper.written(call).write);
      const priorWork = atStart.filter((doc) => !doc.record);
      const turnResults: TurnResult[] = turns.map((_, turn) => {
        const calls = trace.calls.filter((call) => call.turn === turn).map((call) => keeper.written(call));
        return {
          turn,
          chars: calls.reduce((sum, call) => sum + call.chars, 0),
          writes: calls.filter((call) => call.write).length,
          rewrites: calls.filter((call) => call.rewrite).length,
          ...changedLines(snapshots[turn], snapshots[turn + 1]),
        };
      });
      const writtenIn = (turn?: number) =>
        trace.calls
          .filter((call) => (turn === undefined || call.turn === turn) && keeper.written(call).write && typeof call.args === 'object')
          .map((call) => JSON.stringify(call.args))
          .join('\n');
      const number = index + 1;
      onSession({
        ...base,
        turns: turnResults,
        readFirst: index === 0 || !priorWork.length ? undefined : trace.calls.slice(0, firstWrite < 0 ? undefined : firstWrite).some((call) => keeper.reads(call, priorWork)),
        readRecord: trace.calls.some((call) => keeper.reads(call, atStart.filter((doc) => doc.record).map((doc) => ({ ...doc, record: false })))),
        docs: after.map((doc) => ({ title: doc.title, chars: doc.text.length, record: doc.record })),
        facts: Object.fromEntries(workFacts.filter((fact) => fact.from <= number).map((fact) => [fact.id, has(work, fact.all)])),
        stale: Object.fromEntries(outdated.filter((value) => value.from <= number).map((value) => [value.id, staleMentions(work, value)])),
        carried: Object.fromEntries(
          carried.filter((carry) => carry.checked === number).map((carry) => [carry.id, carry.firstTurn ? carry.pattern.test(writtenIn(0)) : carry.pattern.test(`${writtenIn()}\n${said}`)]),
        ),
        remarkInWork: /friend|venn/i.test(notRecords),
        ...(session.id === 's5' && {
          answer: redact(trace.texts.filter((text) => text.turn === 0).map((text) => text.text).join('\n\n')),
          answerFacts: Object.fromEntries(readbackFacts.map((fact) => [fact.id, has(trace.texts.filter((text) => text.turn === 0).map((text) => text.text).join('\n'), fact.all)])),
          answerStale: Object.fromEntries(
            outdated.map((value) => [value.id, staleMentions(trace.texts.filter((text) => text.turn === 0).map((text) => text.text).join('\n'), value)]),
          ),
        }),
        calls: trace.calls.map((call) => ({ name: call.name, args: call.args, failed: call.failed, answer: call.answer.slice(0, 400), turn: call.turn })),
        texts: trace.texts.map((text) => ({ turn: text.turn, text: redact(text.text).slice(0, 4000) })),
        modelCalls: trace.modelCalls,
        nudged: trace.nudged,
        outOfTurns: trace.outOfTurns,
        usage: trace.usage,
        modelMs: Math.round(trace.modelMs),
        totalMs: Math.round(trace.totalMs),
      });
    } catch (error) {
      onSession({ ...base, error: redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error)) });
      throw error;
    }
  }
  return keeper.docs();
}
