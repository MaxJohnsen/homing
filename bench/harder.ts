// Benchmark 1's harder conversations: does a model use Homing when it makes the answer or the
// action better, and leave it alone otherwise? Requests that could be about the user's work or not,
// conversations of several turns, questions Homing has nothing to do with, other tools beside
// Homing, and two people's assistants working in one space. Every turn is labeled, and every check
// is deterministic, as in the other benchmarks.

import { any, date, itTeamRunsAzure, northwindTree, perOwnsHosting, prefersEmail, unless, type Benchmark, type Look, type Task, type Turn } from './benchmarks.ts';
import { others } from './others.ts';
import { beside } from './variants.ts';
import { together } from './together.ts';

type Group = 'ambiguous' | 'unrelated' | 'multi-turn' | 'competing' | 'together';

/** A conversation of one or more turns. */
function conversation(id: string, group: Group, turns: Turn[], check?: Task['check']): Task {
  return { id, group, kind: turns[0].kind, prompt: turns[0].say, turns, check };
}

/** A conversation of one turn. */
const one = (id: string, group: Group, turn: Turn, check?: Task['check']) => conversation(id, group, [turn], check);

/** A question Homing has nothing to do with. */
const unrelated = (id: string, say: string, ...facts: RegExp[]) => one(id, 'unrelated', { say, kind: 'control', homing: false, facts: facts.map((fact) => any(fact)) });

/** Ana's new private items in Northwind and the spaces below it, with text that matches. */
const savedInNorthwind = (pattern: RegExp, why: string) => async (look: Look) =>
  unless((await look.newItems(northwindTree(look.world))).some((item) => pattern.test(item.body)), why);

/** Ana's open tasks made in the conversation, in her spaces, whose titles match. */
async function newOpenTasks(look: Look, pattern: RegExp) {
  const w = look.world;
  const tasks = await look.newTasks([w.spaces.personal, w.spaces.acme, w.spaces.fjord, ...northwindTree(w)]);
  return tasks.filter((task) => pattern.test(task.title) && !task.doneAt);
}

const tasks: Task[] = [
  // Requests that may or may not be about Ana's work. Labeled by whether what Homing knows makes the answer better.
  one('bank-signoff', 'ambiguous', { say: 'What was that thing with the bank again, about who signs off on bigger orders?', kind: 'read', homing: true, facts: [any(/kari/)] }),
  // Any of Ana's deadlines, or asking which one with her own candidates, which only Homing knows.
  one('deadline', 'ambiguous', {
    say: "When's the deadline again?",
    kind: 'read',
    homing: true,
    facts: [[...date(1, 'march'), ...date(22, 'october'), ...date(15, 'november'), /time ?sheets?/, /(relaunch|northwind)[^?]{0,80}fjord|fjord[^?]{0,80}(relaunch|northwind)/]],
  }),
  one('report-structure', 'ambiguous', {
    say: "What's a good structure for a status report?",
    kind: 'read',
    homing: true,
    facts: [any(/two sentences/), any(/(at most|up to|no more than|maximum of) (three|3)/), any(/date of the next report|next report('s)? date/), any(/english/), any(/date first|\d{4}-\d{2}-\d{2} status/)],
    need: 2,
  }),
  one('azure-or-aws', 'ambiguous', {
    say: 'Should we go with Azure or AWS?',
    kind: 'read',
    homing: true,
    facts: [itTeamRunsAzure, any(/already (decided|chose|chosen|went|picked)|14 october|steering group/)],
    need: 1,
  }),
  one('cookie-who', 'ambiguous', { say: 'Who do I talk to about the cookie thing?', kind: 'read', homing: true, facts: [any(/mona/)] }),
  one('kitchen-guy', 'ambiguous', { say: 'Did the guy doing my kitchen say when he starts?', kind: 'read', homing: true, facts: [date(3, 'november')] }),
  one('ttl', 'ambiguous', { say: 'What does a DNS TTL do, and what should it be before a migration?', kind: 'control', homing: false, facts: [any(/time.to.live|cach/)] }),
  one('pace', 'ambiguous', {
    say: 'What pace per kilometer do I need for a 3:45 marathon?',
    kind: 'control',
    homing: false,
    facts: [any(/5[:.]\s?(19|20)\b|5 min(ute)?s?,? (and )?(19|20) s/)],
  }),
  one('notice-period', 'ambiguous', { say: "What's a typical notice period in a consulting contract?", kind: 'control', homing: false, facts: [any(/month|days|weeks/)] }),
  one('headless', 'ambiguous', {
    say: "What's the difference between a headless CMS and a traditional one?",
    kind: 'control',
    homing: false,
    facts: [any(/\bapi\b|front.?end|decoupl|presentation/)],
  }),

  // Questions Homing has nothing to do with.
  unrelated('percent', "What's 15% of 2,400?", /360/),
  unrelated('translate', "How do I say 'see you next week' in Norwegian?", /vi ses|neste uke/),
  unrelated('capital', "What's the capital of Australia?", /canberra/),
  unrelated('berlin-wall', 'What year did the Berlin Wall fall?', /1989/),
  unrelated('palindrome', 'Write a Python function that checks whether a string is a palindrome.', /def /, /\[::-1\]|reversed/),
  unrelated('git-undo', 'How do I undo my last git commit but keep the changes?', /reset (--soft|--mixed|head)/),
  unrelated('friendlier', "Make this sound friendlier: 'Send me the report by Friday.'", /friday/, /report/),
  unrelated('fahrenheit', "What's 72 °F in Celsius?", /22([.,]2)?\s?°|22[.,]2|about 22/),
  unrelated('sky', 'Why is the sky blue?', /scatter/),
  unrelated('synonyms', "Give me three synonyms for 'important'.", /significant|crucial|essential|vital|critical/),
  unrelated('let-const', "In JavaScript, what's the difference between let and const?", /reassign/),
  unrelated('mortgage', 'Explain what a mortgage is in two sentences.', /loan/),
  unrelated('football', 'How many players does a football team have on the pitch?', /\b11\b|eleven/),
  unrelated('compound', 'If I put 10,000 in at 5% a year, compounded yearly, what do I have after three years?', /11[ ,.]?576/),

  // Conversations of several turns, with scripted replies: follow-ups, a change of mind, and references back.
  conversation(
    'migration-follow-up',
    'multi-turn',
    [
      { say: 'When does the Northwind relaunch go live?', kind: 'read', homing: true, facts: [date(1, 'march')] },
      { say: "And who's doing the content migration?", kind: 'read', facts: [any(/cara/)] },
      { say: 'OK. Remind me to check in with her about it on Thursday.', kind: 'write', homing: true },
    ],
    async (look) => {
      const found = await newOpenTasks(look, /cara|migration/i);
      return [...unless(found.length > 0, 'no task to check in with Cara'), ...unless(found.some((task) => task.due === '2026-10-22'), 'not due on Thursday 2026-10-22')];
    },
  ),
  conversation(
    'change-of-mind',
    'multi-turn',
    [
      { say: 'Remind me to call Gunnar about the budget on Friday.', kind: 'write', homing: true },
      { say: 'Actually, make that Monday instead.', kind: 'write', homing: true },
      { say: 'And does he prefer calls or email?', kind: 'read', facts: [prefersEmail] },
    ],
    async (look) => {
      const found = await newOpenTasks(look, /gunnar/i);
      return [
        ...unless(found.length > 0, 'no open task about Gunnar'),
        ...unless(found.every((task) => task.due === '2026-10-26'), `open tasks due ${found.map((task) => task.due ?? 'never').join(', ')}, not only Monday 2026-10-26`),
      ];
    },
  ),
  conversation(
    'budget-math',
    'multi-turn',
    [
      { say: "What's 15% of 450,000?", kind: 'control', homing: false, facts: [any(/67[ ,.]?500/)] },
      // Either way round: 67,500 is less, or the hint is more.
      { say: 'Is that more or less than what Gunnar hinted the budget might grow by?', kind: 'read', homing: true, facts: [any(/\bless\b|lower|smaller|below|short of|under|\bmore\b|above|higher|larger|exceed/), any(/100[ ,.]?000/)] },
      { say: 'OK. Note that I want to ask him for the full amount he hinted at.', kind: 'write', homing: true },
    ],
    // A note, or a task to ask him, both keep it.
    async (look) => {
      const noted = (await look.newItems(northwindTree(look.world))).some((item) => /100[ ,.]?000|full amount|\bhint/i.test(item.body));
      const kept = (await newOpenTasks(look, /gunnar|100[ ,.]?000|full amount/i)).length > 0;
      return unless(noted || kept, 'nothing saved in Northwind about asking for the full amount');
    },
  ),
  conversation('birthday', 'multi-turn', [
    { say: 'Help me write a short birthday message for my sister Ingrid.', kind: 'control', homing: false, facts: [any(/ingrid/)] },
    { say: 'Make it a bit funnier.', kind: 'control', homing: false, facts: [any(/birthday|ingrid|sister/)] },
    { say: 'Perfect. Now translate it into Norwegian.', kind: 'control', homing: false, facts: [any(/bursdag|gratulerer/)] },
  ]),
  conversation(
    'email-draft',
    'multi-turn',
    [
      {
        say: 'Draft a short email to Gunnar saying the relaunch might slip by two weeks.',
        kind: 'read',
        homing: true,
        facts: [any(/gunnar/), any(/two weeks|2 weeks/), [...date(1, 'march'), ...date(15, 'march')]],
        need: 2,
      },
      { say: 'Make it a bit more formal.', kind: 'control', homing: false, facts: [any(/gunnar/)] },
      { say: "Thanks, I've sent it. Keep a note that I told him today.", kind: 'write', homing: true },
    ],
    savedInNorthwind(/two weeks|slip|delay|15 march|postpone/i, 'nothing saved in Northwind about telling Gunnar'),
  ),
  conversation(
    'dns-handover',
    'multi-turn',
    [
      { say: 'Who at Northwind owns hosting and DNS?', kind: 'read', homing: true, facts: [perOwnsHosting] },
      { say: 'What does a DNS TTL do, by the way?', kind: 'control', homing: false, facts: [any(/time.to.live|cach/)] },
      { say: 'Got it. Per is leaving at the end of November, and Ola Nordmann takes over. Note that.', kind: 'write', homing: true },
    ],
    savedInNorthwind(/\bola\b/i, 'nothing about Ola saved in Northwind'),
  ),

  // Other tools beside Homing: some requests are theirs, some are Homing's, and some need both.
  one('calendar-tomorrow', 'competing', {
    say: "What's on my calendar tomorrow?",
    kind: 'control',
    homing: false,
    tool: 'calendar_list_events',
    facts: [any(/standup|09[:.]00|\b9(:00)? ?am\b/), any(/gunnar/)],
  }),
  one('gunnar-replied', 'competing', {
    say: 'Did Gunnar reply to my email about the timeline?',
    kind: 'control',
    homing: false,
    tool: 'email_search',
    facts: [any(/looks good|happy with|approv|fine|11 november|steering group/)],
  }),
  one('rain', 'competing', { say: 'Will it rain in Oslo tomorrow?', kind: 'control', homing: false, tool: 'web_search', facts: [any(/80 ?%|showers/)] }),
  one('wcag-ratio', 'competing', {
    say: 'Search the web for the contrast ratio WCAG 2.1 AA requires for normal text.',
    kind: 'control',
    homing: false,
    tool: 'web_search',
    facts: [any(/4[.,]5/)],
  }),
  one('azure-price', 'competing', { say: 'What does a basic Azure App Service plan cost per month?', kind: 'control', homing: false, tool: 'web_search', facts: [any(/\b13\b/)] }),
  one('oat-milk', 'competing', { say: 'Add oat milk to the shopping list in my notes.', kind: 'control', homing: false, tool: 'notes_save' }, async (look) =>
    unless(
      look.trace.calls.some((call) => call.name === 'notes_save' && typeof call.args === 'object' && /oat ?milk/i.test(String(call.args.text ?? ''))),
      'oat milk is not on the shopping list',
    ),
  ),
  one('meeting-prep', 'competing', {
    say: 'Help me prepare for my 13:00 meeting tomorrow.',
    kind: 'read',
    homing: true,
    tool: 'calendar_list_events',
    facts: [date(1, 'march'), any(/450/), any(/\bapi\b|rate limit|10 requests|migrat/), any(/cookie|consent|mona/), prefersEmail],
    need: 2,
  }),
  one(
    'budget-email',
    'competing',
    { say: 'Gunnar emailed me about the budget. What did he say? Keep anything important for the project.', kind: 'write', homing: true, tool: 'email_search', facts: [any(/550/)] },
    savedInNorthwind(/550/, 'the new budget is not saved in Northwind'),
  ),
  one('wcag-project', 'competing', { say: 'Does the relaunch have to meet WCAG, and when is the audit?', kind: 'read', homing: true, facts: [any(/2\.1|\baa\b/), any(/february/)] }),
  one('kari', 'competing', { say: 'Who is Kari Lie?', kind: 'read', homing: true, facts: [any(/cfo|chief financial/)] }),

  // Two people's assistants in one space, over several conversations.
  { id: 'together', group: 'together', kind: 'governed', prompt: 'Ana and Cara work on the cookie banner, each through their own assistant.', run: together },
];

export const b1Hard: Benchmark = {
  id: 'b1-hard',
  name: 'MCP reliability, harder conversations',
  variants: ['mcp-only', 'old-instruction', 'instruction'],
  setup: (variant, tools, instructions) => beside(others, variant as 'mcp-only' | 'old-instruction' | 'instruction', tools, instructions),
  tasks,
};
