// Benchmark 0, scenario 2: one piece of work over five sessions. Ana is analyzing which commerce
// platform Northwind should choose for a spare parts shop, for the steering group in December.
// Each session starts fresh, as tomorrow's conversation would, and the model alternates between
// sessions. New findings arrive between sessions, and some of what's decided is only said in the
// conversation. Written before any approach ran, and not changed to suit a result.

import type { Fact } from './benchmarks.ts';
import { day, kroner, millions } from './upkeep-mail.ts';

export interface Finding {
  id: string;
  text: string;
}

export const findings: Finding[] = [
  {
    id: 'F1',
    text:
      "Kickoff notes, 28 October (Ana): Northwind wants to sell spare parts online to its dealers and workshops, about 4,000 parts, live by 1 September 2027. Customers have customer-specific prices. Microsoft Dynamics 365 is the ERP and holds prices and stock. The budget for the first year is 2.5 million NOK, licences and build included. Criteria agreed at the kickoff: time to market, cost over three years, fit with Dynamics 365, ease of use for marketing, and design flexibility.",
  },
  { id: 'F2', text: 'Interview with Gunnar Holm, 29 October: speed to market matters most to him. Marketing should manage the shop’s content in the same tool as the website. Workshops want to reorder in a few clicks.' },
  { id: 'F3', text: 'Interview with Ola Nordmann, integration architect, 29 October: every option must read prices and stock from Dynamics 365 in near real time. Northwind’s integration team is two people.' },
  { id: 'F4', text: 'Interview with Lise Berg, procurement, 30 October: procurement wants a fixed price for the build, and licences that can be ended yearly.' },
  { id: 'F5', text: 'Market note from Cara, 30 October: dealers mostly order by part number. 70% of orders come by email and phone today.' },
  {
    id: 'F6',
    text: 'Quote from Butikkskyen, 3 November: licence 600,000 NOK a year. Build by a partner: about 900,000 NOK. A standard connector for Dynamics 365 is included. Customer-specific prices need the B2B Pricing app, which is included in the licence.',
  },
  { id: 'F7', text: 'Quote from Composa, 4 November: licence 900,000 NOK a year. Build about 1.8 million NOK, frontend included. No standard connector for Dynamics 365: the integration goes through Composa’s API.' },
  { id: 'F8', text: 'Fram CMS, 4 November: the commerce module costs 300,000 NOK a year. Build about 1.2 million NOK. Marketing keeps working in Fram.' },
  {
    id: 'F9',
    text: 'Reference call with Agder Maskin, a Butikkskyen customer, 5 November: live in four months. Customer-specific prices worked through the B2B Pricing app, but needed workarounds above 2,000 price lists.',
  },
  { id: 'F10', text: 'Reference call with Vestlandsdeler, a Composa customer, 6 November: very flexible, launched after nine months, and the integration took longer than planned.' },
  { id: 'F11', text: 'Ola Nordmann, 11 November: Composa needs a custom integration with Dynamics 365. His estimate is 800,000 NOK and four months, before the shop work can start.' },
  { id: 'F12', text: 'Correction from Butikkskyen, 12 November: the 600,000 NOK licence was for two stores. For one store it is 450,000 NOK a year.' },
  { id: 'F13', text: 'Fram CMS, 12 November: support for the commerce module ends in December 2028. Fram recommends that customers move to a partner platform.' },
  { id: 'F14', text: 'Hanne Ruud, head of customer service, 17 November: customer service takes about 300 calls a week about order status and prices. They want customers to see order status themselves.' },
  { id: 'F15', text: 'Ola Nordmann, 18 November: Northwind has 3,100 customer-specific price lists.' },
  { id: 'F16', text: 'Butikkskyen, 19 November: since version 4, released in October, the B2B Pricing app handles up to 10,000 price lists. The workarounds Agder Maskin needed are no longer necessary.' },
  { id: 'F17', text: 'Lise Berg, 19 November: Butikkskyen’s partner Kodeverket offers the build at a fixed price of 1.1 million NOK. The offer is valid until 15 December.' },
  { id: 'F18', text: 'Gunnar Holm, 20 November: management has cut the first-year budget to 2.0 million NOK.' },
  { id: 'F19', text: 'Ola Nordmann, 27 November: a nightly import of prices and stock would cost about 200,000 NOK instead of 800,000, but prices in the shop could be up to a day old.' },
];

const given = (...ids: string[]) =>
  ids
    .map((id) => findings.find((finding) => finding.id === id)!)
    .map((finding) => `[${finding.id}] ${finding.text}`)
    .join('\n');

/** One thing the user says, and whether they expect a change from it, so a model that only asks gets "go ahead" once. */
export interface Turn {
  say: string;
  changes: boolean;
}

export interface Session {
  id: string;
  /** The day, as the system prompt gives it. */
  today: string;
  turns: Turn[];
  /** Whether the session ends with the user asking for a session record, in the arms that have one. */
  record: boolean;
}

/** What the user asks for at the end of a session, in the arms with a session record. */
export const recordRequest =
  "That's all for today. Before we stop, save a short record of this session for next time: what we worked on, what we decided and why, what's still open, and the next steps.";

export const sessions: Session[] = [
  {
    id: 's1',
    today: 'Monday, 2 November 2026',
    record: true,
    turns: [
      {
        changes: true,
        say:
          "I'm starting an analysis for Northwind: which commerce platform should they use for their new spare parts shop? Gunnar wants a recommendation for the steering group in December. We'll build it over the next few weeks, in several sessions.\n\n" +
          "First, set up a research brief we'll build on: the question, Northwind's goals and constraints, the criteria, the three options, what we know so far with its sources, and the open questions. Keep it where we'll find it next time.\n\n" +
          "The options:\n- A. Butikkskyen, a SaaS shop platform.\n- B. Composa, a headless commerce engine with its own frontend.\n- C. The commerce module of Fram CMS, which runs Northwind's new website.\n\n" +
          `What we have so far:\n${given('F1', 'F2', 'F3', 'F4', 'F5')}`,
      },
      {
        changes: false,
        say:
          "Thanks. One more thing, between us and not for the brief: Gunnar is skeptical of Composa because a friend's company struggled with it. Let's not let that color the analysis, but next time, remind me to ask Composa for a second reference customer.",
      },
    ],
  },
  {
    id: 's2',
    today: 'Monday, 9 November 2026',
    record: true,
    turns: [
      {
        changes: true,
        say: `Let's continue with the Northwind platform analysis. New findings came in:\n${given('F6', 'F7', 'F8', 'F9', 'F10')}\n\nPlease add a comparison of the three options against the criteria in the brief, with sources.`,
      },
      {
        changes: true,
        say:
          "Thanks. Two things from my call with Gunnar today. First, drop design flexibility as a criterion: he says it doesn't matter for Northwind. Second, for next time: before anything else, add a short section on what each option means for Northwind's customer service team. Gunnar asked for that. " +
          "And just so you know, I'm leaning towards Composa, but I'm worried about the integration. Ola will check it this week.",
      },
    ],
  },
  {
    id: 's3',
    today: 'Monday, 16 November 2026',
    record: true,
    turns: [
      { changes: true, say: `Let's continue where we left off. New findings:\n${given('F11', 'F12', 'F13')}` },
      { changes: true, say: "Now revisit option B in light of Ola's estimate, update the comparison with the other new findings, and draft the recommendation." },
      {
        changes: false,
        say:
          "Good. Gunnar agreed today that we drop Fram's commerce module, because support ends in 2028, so treat that as decided. And for next time: add a line to the recommendation on when Butikkskyen could go live, counting four months from a decision in December.",
      },
    ],
  },
  {
    id: 's4',
    today: 'Monday, 23 November 2026',
    record: true,
    turns: [
      { changes: true, say: `Let's continue where we left off. New findings:\n${given('F14', 'F15', 'F16', 'F17', 'F18')}` },
      { changes: true, say: 'Update the recommendation with these, and write the outline of the presentation for the steering group: 8 to 10 slides, each with a title and its main points.' },
      { changes: true, say: 'On the risks slide only, add that the B2B Pricing app is a third-party dependency. Leave the other slides as they are.' },
    ],
  },
  {
    id: 's5',
    today: 'Monday, 30 November 2026',
    record: false,
    turns: [
      {
        changes: false,
        say: "The steering group meets tomorrow. Before we change anything: what do we recommend and why, which options did we reject and why, which criteria did we compare them on, what has changed since the first comparison, and what's still open?",
      },
      {
        changes: true,
        say: `Gunnar asked one more thing: would Composa work if we dropped the custom integration and imported prices once a night instead? Add a short note on that to the comparison, under Composa:\n${given('F19')}`,
      },
    ],
  },
];

/** Which model runs each session, by run: they alternate, starting with Claude in odd runs and GPT in even ones. */
export function sessionModel(run: number, session: number, models: [claude: string, gpt: string]): string {
  return models[(session + run + 1) % 2];
}

/**
 * The wiki's own conventions, as a schema file would give them in Karpathy's pattern. The
 * assistant gets them in its system prompt, as Homing's assistants get Homing's instructions.
 */
export const wikiSchema = `Ana keeps her work and knowledge in a wiki of Markdown files, which you read and change with the wiki_ tools. It's hers and lasts across conversations: what you don't save there is gone when this conversation ends.

- One file per subject, in a folder per client or area, such as northwind/website-relaunch.md.
- index.md lists every file with a line about what it holds. log.md gets a dated line for each change you make.
- Cite where things come from with the ids the user gives, such as [F3], or with the source's name and date, and list the sources at the end of the file.
- Write and rewrite the files as you see fit, to keep them accurate, current and easy to continue. Read a file before you change it.`;

/** Something the work should hold after a session, or from then on. */
export interface WorkFact {
  id: string;
  text: string;
  /** Every fact must be somewhere in the work. */
  all: Fact[];
  /** The session after which it should be there, counting from 1. */
  from: number;
}

const words = (...patterns: RegExp[]): Fact => patterns;

export const workFacts: WorkFact[] = [
  { id: 'parts', text: 'About 4,000 parts', all: [words(/\b4[\s,.]?000\b/)], from: 1 },
  { id: 'live-by', text: 'Live by 1 September 2027', all: [day(1, 9)], from: 1 },
  { id: 'dynamics', text: 'Dynamics 365 holds prices and stock', all: [words(/dynamics/i)], from: 1 },
  { id: 'budget-first', text: 'A first-year budget, 2.5 million NOK at first', all: [words(/budget/i)], from: 1 },
  { id: 'customer-prices', text: 'Customer-specific prices', all: [words(/customer.?specific|kundespesifikk/i)], from: 1 },
  { id: 'time-to-market', text: 'Time to market as a criterion', all: [words(/time.to.market/i)], from: 1 },
  { id: 'options', text: 'The three options', all: [words(/butikkskyen/i), words(/composa/i), words(/fram/i)], from: 1 },
  { id: 'reorder', text: 'Workshops want to reorder in a few clicks', all: [words(/re-?order|gjenbestill/i)], from: 1 },
  { id: 'phone-orders', text: '70% of orders come by email and phone', all: [words(/\b70\s?(%|percent|prosent)/i)], from: 1 },
  { id: 'fixed-price-wish', text: 'Procurement wants a fixed price for the build', all: [words(/fixed.price|fastpris/i)], from: 1 },
  { id: 'a-build', text: "Butikkskyen's build, about 900,000 NOK", all: [kroner(900)], from: 2 },
  { id: 'b-build', text: "Composa's build, about 1.8 million NOK", all: [millions(1, 8)], from: 2 },
  { id: 'c-costs', text: "Fram's module, 300,000 NOK a year and about 1.2 million NOK to build", all: [kroner(300), millions(1, 2)], from: 2 },
  { id: 'connector', text: "Butikkskyen's standard Dynamics connector", all: [words(/connector|konnektor/i)], from: 2 },
  { id: 'ref-a', text: 'Agder Maskin: live in four months, workarounds above 2,000 price lists', all: [words(/agder/i), words(/\b2[\s,.]?000\b/)], from: 2 },
  { id: 'ref-b', text: 'Vestlandsdeler: nine months, integration took longer', all: [words(/vestlandsdeler/i), words(/nine months|9 months/i)], from: 2 },
  { id: 'b-integration', text: "Composa's custom integration, 800,000 NOK and four months", all: [kroner(800), words(/four months|4 months/i)], from: 3 },
  { id: 'a-licence', text: "Butikkskyen's licence for one store, 450,000 NOK", all: [kroner(450)], from: 3 },
  { id: 'c-support', text: "Support for Fram's module ends in December 2028", all: [words(/2028/)], from: 3 },
  { id: 'service-calls', text: '300 calls a week to customer service', all: [words(/\b300\b[^.\n]{0,40}(calls|week|samtal|anrop)|(calls|samtal|anrop)[^.\n]{0,40}\b300\b/i)], from: 4 },
  { id: 'price-lists', text: '3,100 price lists', all: [words(/\b3[\s,.]?100\b/)], from: 4 },
  { id: 'capacity', text: 'The app handles 10,000 price lists', all: [words(/\b10[\s,.]?000\b/)], from: 4 },
  { id: 'fixed-build', text: "Kodeverket's fixed price, 1.1 million NOK", all: [millions(1, 1), words(/kodeverket/i)], from: 4 },
  { id: 'budget-cut', text: 'The budget cut to 2.0 million NOK', all: [words(/\b2[.,]0\s*(million|mill|m\b|mnok)|\b2[\s,.]?000[\s,.]?000\b|\b2 million/i)], from: 4 },
  { id: 'valid-until', text: 'The fixed price is valid until 15 December', all: [day(15, 12)], from: 4 },
  { id: 'third-party', text: 'The B2B Pricing app is a third-party dependency', all: [words(/third.?party|tredjepart/i)], from: 4 },
  { id: 'nightly', text: 'A nightly import for Composa, about 200,000 NOK', all: [words(/night|nattlig|daily|once a day/i), kroner(200)], from: 5 },
];

/**
 * Something said only in the conversation that a later session should act on. Whether it does is
 * the clearest test of a session record.
 */
export interface Carry {
  id: string;
  text: string;
  /** Said in this session, counting from 1. */
  said: number;
  /** Checked in this session: in what it wrote, or in what the assistant said. */
  checked: number;
  pattern: RegExp;
  /** Only what's written in the session's first turn counts, as "before anything else". */
  firstTurn?: boolean;
}

export const carried: Carry[] = [
  { id: 'second-reference', text: 'Remind Ana to ask Composa for a second reference customer', said: 1, checked: 2, pattern: /(second|another|additional|one more|new|extra|further|2nd) (reference|customer reference)/i },
  { id: 'service-section', text: "Before anything else, add a section on what each option means for customer service", said: 2, checked: 3, pattern: /customer service|kundeservice|support team/i, firstTurn: true },
  { id: 'april', text: 'Add when Butikkskyen could go live: April 2027, four months from a decision in December', said: 3, checked: 4, pattern: /\bapril\b/i },
];

/** An outdated value in the work: stale when it appears without words around it that mark it as outdated. */
export interface Outdated {
  id: string;
  text: string;
  /** From this session on, the value is outdated. */
  from: number;
  pattern: RegExp;
  /** Words that, near the value, say it's outdated rather than current. */
  marked: RegExp;
}

export const outdated: Outdated[] = [
  {
    id: 'design-flexibility',
    text: 'Design flexibility as a criterion',
    from: 2,
    pattern: /design.flexibility|designfleksibilitet/gi,
    marked: /dropp|remov|no longer|not (a|used|relevant|included|part|considered|scored)|exclud|delet|struck|strike|doesn.t matter|does not matter|irrelevant|was (a|one|originally)|previous|original|initial|~~|fjernet/i,
  },
  {
    id: 'a-600',
    text: "Butikkskyen's licence as 600,000 NOK",
    from: 3,
    pattern: /\b600[\s,.\u00a0]?000\b|\b600\s?k\b|\b0[.,]60*(?!\d)\s*(million|mill|mnok|m\b)/gi,
    marked: /correct|two stores|2 stores|for two|\bwas\b|previous|earlier|original|initial|instead|replac|supersed|mistak|error|updat|\bold\b|~~|tidligere/i,
  },
  {
    id: 'budget-2-5',
    text: 'The budget as 2.5 million NOK',
    from: 4,
    pattern: /\b2[.,]5\s*(million|mill|m\b|mnok)|\b2[\s,.]?500[\s,.]?000\b/gi,
    marked: /\bcut|reduc|\bwas\b|previous|original|initial|earlier|down|lower|instead|replac|no longer|\bold\b|~~|tidligere|kuttet/i,
  },
];

/** Where an outdated value appears in a text without words near it that mark it as outdated. */
export function staleMentions(text: string, value: Outdated, window = 120): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(value.pattern)) {
    const around = text.slice(Math.max(0, match.index - window), match.index + match[0].length + window);
    if (!value.marked.test(around)) found.push(around.replace(/\s+/g, ' ').trim());
  }
  return found;
}

/** Facts the answer to session 5's first question should have, checked in its text. */
export const readbackFacts: { id: string; text: string; all: Fact[] }[] = [
  { id: 'recommends-a', text: 'Recommends Butikkskyen', all: [words(/butikkskyen/i)] },
  { id: 'licence-450', text: "Butikkskyen's licence of 450,000 NOK, or its first-year total of about 1.55 million", all: [[...kroner(450), ...millions(1, 5, 5)]] },
  { id: 'budget-2', text: 'The budget of 2.0 million NOK', all: [words(/\b2[.,]0\s*(million|mill|m\b|mnok)|\b2[\s,.]?000[\s,.]?000\b|\b2 million/i)] },
  { id: 'b-800', text: "Composa's integration of 800,000 NOK", all: [kroner(800)] },
  { id: 'c-2028', text: "Fram's support ending in 2028", all: [words(/2028/)] },
];

/** Session 5's first answer, judged against this rubric, written before any approach ran. */
export const readbackRubric: { id: string; text: string; negative?: boolean }[] = [
  { id: 'recommends-a', text: 'Recommends Butikkskyen (option A)' },
  { id: 'fits-budget', text: 'Butikkskyen fits the 2.0 million NOK budget: about 1.55 million in the first year (450,000 licence plus the 1.1 million fixed-price build)' },
  { id: 'connector', text: 'Butikkskyen has a standard Dynamics 365 connector, or is the fastest to launch (four months at the reference customer)' },
  { id: 'price-lists', text: "Butikkskyen's B2B Pricing app now handles 10,000 price lists, enough for Northwind's 3,100" },
  { id: 'reject-b', text: 'Composa was rejected: its custom Dynamics 365 integration (800,000 NOK, four months) makes it too expensive for the budget, or too slow' },
  { id: 'reject-c', text: "Fram's commerce module was rejected because its support ends in December 2028" },
  { id: 'gunnar-c', text: "Gunnar agreed to drop Fram's commerce module (decided with him, not only in the findings)" },
  { id: 'changed-licence', text: "Changed since the first comparison: Butikkskyen's licence was corrected from 600,000 (two stores) to 450,000 NOK" },
  { id: 'changed-budget', text: 'Changed since the first comparison: the budget was cut from 2.5 to 2.0 million NOK' },
  { id: 'changed-b', text: "Changed since the first comparison: Ola's estimate for Composa's integration (800,000 NOK, four months)" },
  { id: 'open-deadline', text: "Still open: Northwind must decide before Kodeverket's fixed price expires on 15 December" },
  { id: 'open-dependency', text: 'A remaining risk: the B2B Pricing app is a third-party dependency' },
  { id: 'not-lists-open', text: 'Presents the number of price lists, or whether the pricing app can handle them, as still unknown', negative: true },
  { id: 'not-flexibility', text: 'Lists design flexibility as one of the criteria the options are compared on', negative: true },
];
