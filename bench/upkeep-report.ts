// Benchmark 0's tables, from the results files: one line per week of mail and per session of work,
// and the judge's grades.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { SessionResult } from './upkeep-sessions.ts';
import type { Answered, WeekResult } from './upkeep.ts';
import { questions, truthIn } from './upkeep-mail.ts';
import { checkWork, rebuild } from './upkeep-replay.ts';
import { candidates } from './upkeep-stale.ts';
import { outdated, readbackFacts, readbackRubric, staleMentions, workFacts } from './upkeep-work.ts';

const here = new URL('./', import.meta.url);

function lines<T>(name: string): T[] {
  const file = new URL(`results/${name}.jsonl`, here).pathname;
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '–');
const usd = (value: number) => `$${value.toFixed(2)}`;
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const one = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '–');
const table = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

const approachName = { wiki: 'Wiki', items: 'Items with upkeep', append: 'Items, added only', homing: 'Homing pages', '': '' } as Record<string, string>;
const modelName = (id: string) => ({ 'anthropic/claude-sonnet-5.5': 'Claude Sonnet 5.5', 'anthropic/claude-haiku-5.5': 'Claude Haiku 5.5', 'openai/gpt-6.1-sol': 'GPT-6.1 Sol' })[id] ?? id;

interface Grade {
  key: string;
  elements: Record<string, boolean>;
}

/** The latest complete attempt of each arm: a stopped arm's earlier weeks aren't mixed with a rerun's. */
function latest<T extends { key: string; attempt: string }>(rows: T[], complete: (rows: T[]) => boolean): T[] {
  const byArm = new Map<string, Map<string, T[]>>();
  for (const row of rows) {
    const attempts = byArm.get(row.key) ?? new Map<string, T[]>();
    attempts.set(row.attempt, [...(attempts.get(row.attempt) ?? []), row]);
    byArm.set(row.key, attempts);
  }
  return [...byArm.values()].flatMap((attempts) => [...attempts.values()].filter(complete).at(-1) ?? []);
}

// Scenario 1.

interface MailArm {
  key: string;
  keeper: string;
  approach: string;
  run: number;
  weeks: WeekResult[];
}

function mailArms(phase: string, weeks: number): MailArm[] {
  const rows = lines<WeekResult>(`upkeep-mail-${phase}`).filter((line) => !line.error && line.answers);
  const kept = latest(rows, (attempt) => attempt.some((row) => row.week === weeks));
  const arms = new Map<string, MailArm>();
  for (const row of kept) {
    const arm = arms.get(row.key) ?? { key: row.key, keeper: row.keeper, approach: row.approach, run: row.run, weeks: [] };
    arm.weeks.push(row);
    arms.set(row.key, arm);
  }
  for (const arm of arms.values()) arm.weeks.sort((a, b) => a.week - b.week);
  return [...arms.values()];
}

/** Answers that were right in a week, then not in a later week with the same answer: what upkeep or rewrites lost. */
function drift(arm: MailArm, right: (answer: Answered) => boolean | undefined) {
  let events = 0;
  let chances = 0;
  for (const question of questions) {
    let wasRight: number | undefined;
    for (const week of arm.weeks) {
      const answer = week.answers!.find((candidate) => candidate.id === question.id);
      if (!answer) continue;
      if (wasRight !== undefined && answer.truthFrom !== wasRight) wasRight = undefined;
      const ok = right(answer);
      if (ok === undefined) continue;
      if (wasRight !== undefined) {
        chances++;
        if (!ok) events++;
      }
      if (ok && wasRight === undefined) wasRight = answer.truthFrom;
    }
  }
  return { events, chances };
}

function judged(grades: Map<string, Record<string, boolean>>, phase: string, arm: MailArm) {
  let found = 0;
  let of = 0;
  let outdated = 0;
  let outdatedOf = 0;
  let missing = 0;
  for (const week of arm.weeks) {
    for (const answer of week.answers!.filter((candidate) => candidate.kind === 'why' || candidate.kind === 'open')) {
      const grade = grades.get(`${phase}|${week.key}|${week.attempt}|w${week.week}|${answer.id}`);
      const rubric = truthIn(questions.find((question) => question.id === answer.id)!, week.week)!.rubric ?? [];
      if (!grade) {
        missing++;
        continue;
      }
      for (const element of rubric) {
        if (element.negative) {
          outdatedOf++;
          if (grade[element.id]) outdated++;
        } else {
          of++;
          if (grade[element.id]) found++;
        }
      }
    }
  }
  return { found, of, outdated, outdatedOf, missing };
}

const claimKey = (fact: { id: string; from: number }, claim: { page: string; text: string }) =>
  `${fact.id}|${fact.from}|${createHash('sha1').update(`${claim.page}\n${claim.text}`).digest('hex').slice(0, 16)}`;

/** For an arm's week, the changed facts its store presents in their earlier value as current, as the judge decided, and how many changed facts there were. */
function storeStale(phase: string, arm: MailArm, week: number, judged: Map<string, boolean>) {
  const file = new URL(`results/upkeep-stores/${phase}/${arm.key.replaceAll('|', '_').replaceAll('/', '-')}_w${week}.md`, here).pathname;
  if (!existsSync(file)) return undefined;
  const found = candidates(readFileSync(file, 'utf8'), arm.approach, week);
  let unjudged = 0;
  const stale = found.filter(({ fact, claims }) =>
    claims.some((claim) => {
      const verdict = judged.get(claimKey(fact, claim));
      if (verdict === undefined) unjudged++;
      return verdict === true;
    }),
  );
  return { stale: stale.map(({ fact }) => fact.id), of: found.length, unjudged };
}

function mailSection(phase: string, grades: Map<string, Record<string, boolean>>): string[] {
  const staleJudged = new Map(lines<{ key: string; stale: boolean }>('upkeep-stale-judge').map((grade) => [grade.key, grade.stale]));
  const arms = mailArms(phase, 8);
  if (!arms.length) return [];
  const out: string[] = [];
  const keepers = [...new Set(arms.map((arm) => arm.keeper))];
  const runs = new Set(arms.map((arm) => arm.run));
  out.push(`### Learning from email\n`);
  out.push(`${arms.length} arms, ${runs.size} runs. Each cell is over every week of every run unless it says week 8.\n`);
  const head = [
    'Kept by',
    'Approach',
    'Right',
    'Right, week 8',
    'Stale answers',
    'Past',
    'Reasons and open questions found',
    'Settled shown as open',
    'Answers lost',
    'Facts lost from the store',
    'Changed facts the store shows in their old value',
    'Claims citing a source',
    'Facts traced to their email',
    'Items or lines, week 8',
  ];
  const rows: string[][] = [];
  for (const keeper of keepers) {
    for (const approach of ['wiki', 'items', 'append']) {
      const group = arms.filter((arm) => arm.keeper === keeper && arm.approach === approach);
      if (!group.length) continue;
      const answers = group.flatMap((arm) => arm.weeks.flatMap((week) => week.answers!));
      const current = answers.filter((answer) => answer.kind === 'fact' || answer.kind === 'yesno');
      const last = group.flatMap((arm) => arm.weeks.filter((week) => week.week === 8).flatMap((week) => week.answers!)).filter((answer) => answer.kind === 'fact' || answer.kind === 'yesno');
      const changed = current.filter((answer) => answer.truthFrom > (questions.find((question) => question.id === answer.id)!.truths[0].from));
      const past = answers.filter((answer) => answer.kind === 'past');
      const lost = group.map((arm) => drift(arm, (answer) => (answer.kind === 'fact' || answer.kind === 'yesno' || answer.kind === 'past' ? answer.verdict === 'right' : undefined)));
      const gone = group.map((arm) => drift(arm, (answer) => answer.present));
      const understanding = group.map((arm) => judged(grades, phase, arm));
      const week8 = group.map((arm) => arm.weeks.find((week) => week.week === 8)!.store!);
      const traced = answers.filter((answer) => answer.traced !== undefined);
      const stale = group.flatMap((arm) => arm.weeks.map((week) => storeStale(phase, arm, week.week, staleJudged))).filter(Boolean) as { stale: string[]; of: number; unjudged: number }[];
      rows.push([
        modelName(keeper),
        approachName[approach],
        pct(current.filter((answer) => answer.verdict === 'right').length, current.length),
        pct(last.filter((answer) => answer.verdict === 'right').length, last.length),
        pct(changed.filter((answer) => answer.verdict === 'stale').length, changed.length),
        pct(past.filter((answer) => answer.verdict === 'right').length, past.length),
        `${pct(understanding.reduce((sum, u) => sum + u.found, 0), understanding.reduce((sum, u) => sum + u.of, 0))}${understanding.some((u) => u.missing) ? '*' : ''}`,
        pct(understanding.reduce((sum, u) => sum + u.outdated, 0), understanding.reduce((sum, u) => sum + u.outdatedOf, 0)),
        pct(lost.reduce((sum, d) => sum + d.events, 0), lost.reduce((sum, d) => sum + d.chances, 0)),
        pct(gone.reduce((sum, d) => sum + d.events, 0), gone.reduce((sum, d) => sum + d.chances, 0)),
        `${pct(stale.reduce((sum, week) => sum + week.stale.length, 0), stale.reduce((sum, week) => sum + week.of, 0))}${stale.some((week) => week.unjudged) ? '*' : ''}`,
        pct(week8.reduce((sum, s) => sum + s.cited, 0), week8.reduce((sum, s) => sum + s.units, 0)),
        pct(traced.filter((answer) => answer.traced).length, traced.length),
        `${Math.round(mean(week8.map((s) => s.units)))} on ${Math.round(mean(week8.map((s) => s.pages)))} pages`,
      ]);
    }
  }
  out.push(table(head, rows));
  out.push('');

  // Week by week, for each keeper.
  for (const keeper of keepers) {
    out.push(`\n#### Week by week, kept by ${modelName(keeper)}\n`);
    out.push('Right answers to current facts, and in brackets how many answers to facts that had changed gave the earlier value, per run.\n');
    const weekRows: string[][] = [];
    for (const approach of ['wiki', 'items', 'append']) {
      const group = arms.filter((arm) => arm.keeper === keeper && arm.approach === approach);
      if (!group.length) continue;
      weekRows.push([
        approachName[approach],
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((week) => {
          const answers = group.flatMap((arm) => arm.weeks.filter((w) => w.week === week).flatMap((w) => w.answers!)).filter((answer) => answer.kind === 'fact' || answer.kind === 'yesno');
          const stale = answers.filter((answer) => answer.verdict === 'stale').length / group.length;
          return `${pct(answers.filter((answer) => answer.verdict === 'right').length, answers.length)}${stale ? ` (${one(stale)})` : ''}`;
        }),
      ]);
    }
    out.push(table(['Approach', ...[1, 2, 3, 4, 5, 6, 7, 8].map((week) => `Week ${week}`)], weekRows));
  }

  // Cost.
  out.push('\n#### Cost and time of learning\n');
  const costRows: string[][] = [];
  for (const keeper of keepers) {
    for (const approach of ['wiki', 'items', 'append']) {
      const group = arms.filter((arm) => arm.keeper === keeper && arm.approach === approach);
      if (!group.length) continue;
      const learn = group.map((arm) => arm.weeks.reduce((sum, week) => sum + week.learn!.usage.cost, 0));
      const answer = group.map((arm) => arm.weeks.reduce((sum, week) => sum + week.answerUsage!.cost, 0));
      const prompt = group.map((arm) => arm.weeks.reduce((sum, week) => sum + week.learn!.usage.prompt, 0));
      const completion = group.map((arm) => arm.weeks.reduce((sum, week) => sum + week.learn!.usage.completion, 0));
      const seconds = group.flatMap((arm) => arm.weeks.map((week) => week.learn!.ms / 2000));
      const chars = group.map((arm) => arm.weeks.find((week) => week.week === 8)!.store!.chars);
      costRows.push([
        modelName(keeper),
        approachName[approach],
        usd(mean(learn)),
        `${Math.round(mean(prompt) / 1000)}k`,
        `${Math.round(mean(completion) / 1000)}k`,
        one(mean(seconds)),
        `${Math.round(mean(chars) / 1000)}k`,
        usd(mean(answer)),
      ]);
    }
  }
  out.push(
    table(['Kept by', 'Approach', 'Learning, 8 weeks', 'Tokens in', 'Tokens out', 'Seconds a batch', 'Characters, week 8', 'Answering, 8 weeks'], costRows),
  );
  return out;
}

// Scenario 2.

interface WorkRow extends SessionResult {
  attempt: string;
}

/** What the rebuilt work adds to a session's result. */
interface Checked {
  remarkInBrief: boolean;
  judgedStale?: string[];
  inOutline?: boolean;
  withComposa?: boolean;
  structure: { title: string; chars: number; parts: number; largest: number }[];
}

function workSection(phase: string, grades: Map<string, Record<string, boolean>>): string[] {
  const rows = lines<WorkRow>(`upkeep-work-${phase}`).filter((line) => !line.error);
  const armOf = (row: WorkRow) => row.key.split('|').slice(1, 4).join('|');
  const keyed = rows.map((row) => ({ ...row, key: armOf(row) }));
  const kept = latest(keyed, (attempt) => attempt.some((row) => row.session === 's5'));
  if (!kept.length) return [];
  const arms = new Map<string, WorkRow[]>();
  for (const row of kept) arms.set(row.key, [...(arms.get(row.key) ?? []), row].sort((a, b) => a.session.localeCompare(b.session)));
  // The work's facts and outdated values, computed again from the work rebuilt after each session.
  // After session 5, the judge decides which mentions of an outdated value present it as current.
  const staleJudged = new Map(lines<{ key: string; stale: boolean }>('upkeep-stale-judge').map((grade) => [grade.key, grade.stale]));
  for (const sessions of arms.values()) {
    const states = rebuild(sessions[0].approach, sessions);
    for (const [index, session] of sessions.entries()) Object.assign(session, checkWork(states[index], index + 1));
    const last = states.at(-1)!;
    const judgedValues = outdated.filter((value) =>
      last.filter((doc) => !doc.record).some((doc) => staleMentions(doc.text, value).some((mention) => staleJudged.get(claimKey({ id: `work-${value.id}`, from: 5 }, { page: doc.title, text: mention })) === true)),
    );
    Object.assign(sessions.at(-1)!, { judgedStale: judgedValues.map((value) => value.id) });
  }
  const out: string[] = ['\n### Work over five sessions\n'];
  out.push(`${arms.size} arms. Each cell is the mean over runs, or a count over runs where it says "of".\n`);
  const head = [
    'Approach',
    'Session record',
    'Facts in the work after session 5',
    'Facts lost on the way',
    'Outdated values still shown as current after session 5',
    'Read the work in full before changing it',
    'Did what was said only in conversation',
    'Remark kept out of the brief',
    'Risks-slide change in the outline itself',
    'Characters sent for it',
    'Composa note with Composa’s analysis',
    'Readback: facts',
    'Readback: judged',
    'Readback: settled shown as open',
  ];
  const tableRows: string[][] = [];
  const structureRows: string[][] = [];
  for (const approach of ['wiki', 'homing', 'append']) {
    for (const record of [true, false]) {
      const group = [...arms.entries()].filter(([key]) => key.startsWith(`${approach}|${record ? 'record' : 'none'}|`)).map(([, sessions]) => sessions);
      if (!group.length) continue;
      const last = group.map((sessions) => sessions.find((session) => session.session === 's5')! as WorkRow & Checked);
      const s4 = group.map((sessions) => sessions.find((session) => session.session === 's4')! as WorkRow & Checked);
      const factsAfter = last.map((session) => Object.values(session.facts ?? {}).filter(Boolean).length);
      const lost = group.map((sessions) => {
        let events = 0;
        for (const fact of workFacts) {
          let seen = false;
          for (const session of sessions) {
            const has = session.facts?.[fact.id];
            if (has) seen = true;
            else if (seen && has === false) {
              events++;
              break;
            }
          }
        }
        return events;
      });
      const stale = last.map((session) => (session as WorkRow & Checked).judgedStale?.length ?? 0);
      const readFirst = group.flatMap((sessions) => sessions.filter((session) => session.readFirst !== undefined).map((session) => session.readFirst));
      const carriedAll = group.flatMap((sessions) => sessions.flatMap((session) => Object.values(session.carried ?? {})));
      const remark = group.flatMap((sessions) => sessions.map((session) => !(session as WorkRow & Checked).remarkInBrief));
      const risks = group.map((sessions) => sessions.find((session) => session.session === 's4')!.turns![2]);
      const answerFacts = last.map((session) => Object.values(session.answerFacts ?? {}).filter(Boolean).length);
      const grade = last.map((session) => grades.get(`${phase}|work|${session.key}|s5|${session.attempt}`));
      const positives = readbackRubric.filter((element) => !element.negative);
      const negatives = readbackRubric.filter((element) => element.negative);
      tableRows.push([
        approachName[approach],
        record ? 'yes' : 'no',
        `${one(mean(factsAfter))} of ${workFacts.length}`,
        one(mean(lost)),
        `${one(mean(stale))} of 3`,
        `${readFirst.filter(Boolean).length} of ${readFirst.length}`,
        `${carriedAll.filter(Boolean).length} of ${carriedAll.length}`,
        `${remark.filter(Boolean).length} of ${remark.length}`,
        `${s4.filter((session) => session.inOutline).length} of ${s4.length}`,
        Math.round(mean(risks.map((turn) => turn?.chars ?? 0))).toLocaleString('en-US'),
        `${last.filter((session) => session.withComposa).length} of ${last.length}`,
        `${one(mean(answerFacts))} of ${readbackFacts.length}`,
        grade.every(Boolean) ? `${one(mean(grade.map((g) => positives.filter((element) => g![element.id]).length)))} of ${positives.length}` : '–',
        grade.every(Boolean) ? `${one(mean(grade.map((g) => negatives.filter((element) => g![element.id]).length)))} of ${negatives.length}` : '–',
      ]);
      const structure = last.map((session) => session.structure);
      structureRows.push([
        approachName[approach],
        record ? 'yes' : 'no',
        one(mean(structure.map((docs) => docs.length))),
        one(mean(structure.map((docs) => Math.max(...docs.map((doc) => doc.parts))))),
        Math.round(mean(structure.map((docs) => docs.reduce((sum, doc) => sum + doc.chars, 0)))).toLocaleString('en-US'),
        Math.round(mean(structure.map((docs) => Math.max(...docs.map((doc) => doc.largest))))).toLocaleString('en-US'),
      ]);
    }
  }
  out.push(table(head, tableRows));
  out.push('\n#### How the work was kept, after session 5\n');
  out.push(table(['Approach', 'Record', 'Pages or files, records left out', 'Most items on one page', 'Characters', 'Largest item or file, characters'], structureRows));

  // By the model that ran the session.
  out.push('\n#### By the model that ran the session\n');
  const byModel: string[][] = [];
  for (const approach of ['wiki', 'homing', 'append']) {
    for (const model of ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol']) {
      const sessions = kept.filter((row) => row.approach === approach && row.model === model);
      if (!sessions.length) continue;
      const later = sessions.filter((session) => session.readFirst !== undefined);
      const writes = sessions.flatMap((session) => session.turns!);
      byModel.push([
        approachName[approach],
        modelName(model),
        String(sessions.length),
        `${later.filter((session) => session.readFirst).length} of ${later.length}`,
        one(mean(sessions.map((session) => session.turns!.reduce((sum, turn) => sum + turn.writes, 0)))),
        Math.round(mean(sessions.map((session) => session.turns!.reduce((sum, turn) => sum + turn.chars, 0)))).toLocaleString('en-US'),
        `${writes.reduce((sum, turn) => sum + turn.rewrites, 0)}`,
        one(mean(sessions.map((session) => session.modelCalls ?? 0))),
        usd(mean(sessions.map((session) => session.usage?.cost ?? 0))),
        one(mean(sessions.map((session) => (session.totalMs ?? 0) / 60_000))),
      ]);
    }
  }
  out.push(table(['Approach', 'Model', 'Sessions', 'Read the work first', 'Writes a session', 'Characters written a session', 'Whole rewrites, all sessions', 'Model calls a session', 'Cost a session', 'Minutes a session'], byModel));

  // Session by session.
  out.push('\n#### Facts in the work after each session\n');
  const bySession: string[][] = [];
  for (const approach of ['wiki', 'homing', 'append']) {
    for (const record of [true, false]) {
      const group = [...arms.entries()].filter(([key]) => key.startsWith(`${approach}|${record ? 'record' : 'none'}|`)).map(([, sessions]) => sessions);
      if (!group.length) continue;
      bySession.push([
        approachName[approach],
        record ? 'yes' : 'no',
        ...['s1', 's2', 's3', 's4', 's5'].map((id, index) => {
          const due = workFacts.filter((fact) => fact.from <= index + 1).length;
          const found = group.map((sessions) => Object.values(sessions.find((session) => session.session === id)?.facts ?? {}).filter(Boolean).length);
          return `${one(mean(found))} of ${due}`;
        }),
      ]);
    }
  }
  out.push(table(['Approach', 'Record', 'Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5'], bySession));
  return out;
}

export function report(phases: string[]): string {
  const grades = new Map(lines<Grade>('upkeep-judge').map((grade) => [grade.key, grade.elements]));
  const out: string[] = [];
  for (const phase of phases) {
    out.push(`## ${phase}\n`);
    out.push(...mailSection(phase, grades));
    out.push(...workSection(phase, grades));
  }
  return `${out.join('\n')}\n`;
}
