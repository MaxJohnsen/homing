// Benchmark 0, scenario 1: whether a store itself presents an outdated fact as current. Added after
// run 1, when every store's answers reached the ceiling: the answerer reads the whole store, and
// with each email's date beside each claim it settles what's current itself. An assistant that
// reads only part of a store, through search, doesn't. So this reads the stores kept every week,
// for every run alike. Code finds the candidates: current claims about a fact that has changed which
// hold its earlier value and not its current one, without words that mark it as earlier. The judge
// then decides, for each, whether it presents the earlier value as what is true now.

import type { Fact } from './benchmarks.ts';
import { day, kroner } from './upkeep-mail.ts';

/** A fact that changed, from the week it changed, and what a claim about it holds before and after. */
export interface Changed {
  id: string;
  /** What changed, for the judge. */
  text: string;
  from: number;
  /** Until this week, if a later change takes over. */
  until?: number;
  /** A claim is about it when it matches every one of these. */
  about: RegExp[];
  before: Fact;
  now: Fact;
}

const pct = (n: number) => new RegExp(`\\b${n}\\s?(%|percent|prosent)`, 'i');

export const changed: Changed[] = [
  { id: 'golive', text: "The go-live of Northwind's website relaunch: 1 March 2027 until 21 September, then 15 March 2027.", from: 5, about: [/go.?live|launch|lanser|goes live/i], before: day(1, 3), now: day(15, 3) },
  { id: 'budget', text: 'The budget of the Northwind relaunch: 450,000 NOK until 29 September, then 520,000 NOK.', from: 6, about: [/budget/i], before: kroner(450), now: kroner(520) },
  { id: 'migration-owner', text: 'Who owns the content migration: Cara Lund until 14 September, then Jonas Vik.', from: 4, about: [/migrat/i, /own|responsib|ansvar|in charge|handles|lead|takes over/i], before: [/\bcara\b/i], now: [/\bjonas\b/i] },
  { id: 'dns-owner', text: "Who owns hosting and DNS at Northwind: Per Hansen until 30 September, then Ola Nordmann.", from: 6, about: [/\bdns\b/i, /own|responsib|ansvar|in charge|contact|handles|takes over|overtar/i], before: [/\bper\b|hansen/i], now: [/\bola\b|nordmann/i] },
  { id: 'next-steering', text: 'The next Northwind steering group meeting: 14 September, then 12 October.', from: 4, until: 6, about: [/steering|styringsgruppe/i, /next|meeting|møte|meets/i], before: day(14, 9), now: day(12, 10) },
  { id: 'next-steering', text: 'The next Northwind steering group meeting: 14 September, then 12 October, then from 6 October 19 October.', from: 7, about: [/steering|styringsgruppe/i, /next|meeting|møte|meets/i], before: [...day(14, 9), ...day(12, 10)], now: day(19, 10) },
  { id: 'cookie', text: 'The cookie banner: awaiting Mona Lie\'s approval until 29 September, when she approved it.', from: 6, about: [/cookie/i], before: [/needs?\b|awaiting|pending|must approve|requires|on (one )?condition|will approve|review|not yet|before launch|før lansering/i], now: [/\bapproved\b|godkjent|approves the revised|approval (was )?given/i] },
  { id: 'fjord-invoicing', text: 'How Acme invoices Fjord Bank from January 2027: monthly, as Fjord Bank asked on 3 September, until 28 September, when it went back to quarterly.', from: 6, about: [/invoic|faktur/i], before: [/month|måned/i], now: [/quarter|kvartal/i] },
  { id: 'kitchen-start', text: 'When Erik starts on the kitchen: Monday 2 November until 3 October, then Monday 9 November.', from: 6, about: [/start|begin|begynn|oppstart/i], before: day(2, 11), now: day(9, 11) },
  { id: 'kitchen-price', text: "Erik's price for the kitchen: 85,000 NOK without the electrician until 17 September, then 92,000 NOK in total.", from: 4, about: [/price|quote|total|tilbud|pris|cost|kost/i], before: kroner(85), now: kroner(92) },
  { id: 'birthday', text: "The celebration of Ana's mother's 70th birthday: Saturday 10 October at Frognerseteren until 23 September, then Sunday 11 October at Ingrid's in Kongsberg.", from: 5, until: 6, about: [/birthday|70|bursdag|celebrat|feir|party|fest/i], before: [/frognerseter/i, ...day(10, 10)], now: [/kongsberg/i, ...day(11, 10)] },
  { id: 'prestudy-mobile', text: "Whether the mobile app is part of Fjord Bank's portal pre-study: undecided until 28 September, then left out.", from: 6, about: [/mobil/i, /app|pre-?study|forstudie|scope/i], before: [/\bopen\b|undecided|not (yet )?(decided|settled|clear)|unclear|uavklart|åpent|pending|still open/i], now: [/left out|excluded|outside|utenfor|not (be )?(part|included)|separate round|egen runde|out of scope|kept out|holdes utenfor/i] },
  { id: 'migration-status', text: "How much of Northwind's content is migrated: 25% on 25 September, then 40% on 2 October.", from: 6, until: 7, about: [/migrat/i, /\bmigrated\b|status|complete|done|ferdig|flyttet|at \d+\s?%/i], before: [pct(25)], now: [pct(40)] },
  { id: 'migration-status', text: "How much of Northwind's content is migrated: 25% on 25 September, 40% on 2 October, then 75% on 15 October.", from: 8, about: [/migrat/i, /\bmigrated\b|status|complete|done|ferdig|flyttet|at \d+\s?%/i], before: [pct(25), pct(40)], now: [pct(75)] },
  { id: 'dentist', text: "Ana's dentist appointment: Tuesday 20 October until 14 October, then Tuesday 27 October.", from: 8, about: [/dentist|tannlege/i], before: day(20, 10), now: day(27, 10) },
  {
    id: 'hosting-decided',
    text: "Hosting for the new Northwind site: Azure or AWS was open until the steering group decided on Azure on 14 September, a decision Gunnar kept on 2 October.",
    from: 4,
    about: [/hosting|azure|aws/i],
    before: [/undecided|not (yet )?decided|to be decided|choose between|must choose|decision (is )?(due|pending|open)|still open|pending decision|decision pending|no (final )?decision/i],
    now: [/\bchose\b|chosen|decided|decision:|will (be )?host|hosted on azure|stay(s)? with azure|valgt|approved azure/i],
  },
];

/** Words that mark a value as earlier rather than current. */
const earlier = /\bwas\b|previous|earlier|original|initially|first (set|planned|asked|quoted)|moved from|changed from|no longer|replaced|instead of|before (it|the)|until \d|reversed|tidligere|flyttet fra|endret fra|opprinnelig|history|historikk/i;

export interface Claim {
  page: string;
  text: string;
}

/** The current claims in a week's kept store: a wiki's lines, or each page's current items, without their citations. */
export function currentClaims(store: string, approach: string): Claim[] {
  const claims: Claim[] = [];
  let page = '';
  if (approach === 'wiki') {
    for (const line of store.split('\n')) {
      const header = /^=== (.+) ===$/.exec(line);
      if (header) {
        page = header[1];
        continue;
      }
      const trimmed = line.trim();
      if (page === 'index.md' || page === 'log.md' || !trimmed || /^#/.test(trimmed) || /^\[\^[^\]]+\]:/.test(trimmed)) continue;
      claims.push({ page, text: trimmed });
    }
    return claims;
  }
  let history = false;
  for (const line of store.split('\n')) {
    if (/^# /.test(line)) {
      history = false;
      page = line.slice(2);
    } else if (line === 'No longer true:') history = true;
    else if (!history && line.startsWith('- ')) claims.push({ page, text: line.slice(2).replace(/ \((m\d{3}, \d{4}-\d\d-\d\d(; )?)+\)/g, '') });
  }
  return claims;
}

const matches = (text: string, fact: Fact) => fact.some((pattern) => pattern.test(text));

/** For each changed fact in a week, the current claims that may present its earlier value as current, for the judge to decide. */
export function candidates(store: string, approach: string, week: number): { fact: Changed; claims: Claim[] }[] {
  const claims = currentClaims(store, approach);
  return changed
    .filter((fact) => fact.from <= week && (fact.until === undefined || week <= fact.until))
    .map((fact) => ({
      fact,
      claims: claims.filter(
        (claim) =>
          fact.about.every((pattern) => pattern.test(claim.text)) && matches(claim.text, fact.before) && !matches(claim.text, fact.now) && !earlier.test(claim.text) && !/\(uncertain:/.test(claim.text),
      ),
    }));
}

/** What the judge is asked, written after run 1. */
export const staleQuestion =
  'Each claim below is a current line of a knowledge store, on the page named. For each, decide whether it presents the earlier value of the fact as what is true now. ' +
  "A claim that says when it was true, or that it was later changed, doesn't; neither does one that isn't about that fact. Mark true only when someone reading the claim would take the earlier value as current.";
