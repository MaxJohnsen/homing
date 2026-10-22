// Benchmark 4's test set: the working life of a consultant, Ana Berg, as Homing would hold it after a
// few months, and the questions she or her assistant asks about it, each labeled with what should
// come back. The queries and labels were written before any approach ran, and aren't tuned to a
// result. retrieval.ts builds the world through Homing's own operations and runs the queries.

/** Where things are. Ana sees all of them except Polar Freight, a closed space of Cara's. */
export type SpaceKey =
  | 'acme'
  | 'northwind'
  | 'relaunch'
  | 'data'
  | 'fjord'
  | 'polar'
  | 'havbris'
  | 'beta'
  | 'personal'
  | 'kitchen'
  | 'running'
  | 'home';

/**
 * Who writes: Ana herself, her assistant for her alone, Cara (her colleague at Acme) or Ben (who
 * works at Beta, a client where Ana is a member).
 */
export type Writer = 'ana' | 'assistant' | 'cara' | 'ben';

export interface SpaceSpec {
  key: SpaceKey;
  name: string;
  parent?: SpaceKey;
  by: Writer;
  closed?: boolean;
  /** Archived once everything is written: finished work. */
  archived?: boolean;
}

/** An item: its text, and a key when a query or a check names it. */
export type ItemSpec =
  | string
  | {
      key?: string;
      text: string;
      /** Someone else's item on this page, such as a private note on a shared page. */
      by?: Writer;
      shared?: boolean;
      /** The item that replaced it, which takes its key with ".now" after it. */
      replacedBy?: string;
    };

export interface PageSpec {
  key: string;
  space: SpaceKey;
  title: string;
  type?: string;
  by: Writer;
  shared: boolean;
  items: ItemSpec[];
  archived?: boolean;
}

export interface SourceSpec {
  key: string;
  space: SpaceKey;
  by: Writer;
  shared: boolean;
  reference: string;
  excerpt: string;
}

export interface TaskSpec {
  key: string;
  space: SpaceKey;
  by: Writer;
  shared: boolean;
  title: string;
  due?: string;
}

export interface SkillSpec {
  key: string;
  space: SpaceKey;
  name: string;
  description: string;
  body: string;
}

export const spaces: SpaceSpec[] = [
  { key: 'acme', name: 'Acme', by: 'ana' },
  { key: 'northwind', name: 'Northwind', parent: 'acme', by: 'ana' },
  { key: 'relaunch', name: 'Website relaunch', parent: 'northwind', by: 'ana' },
  { key: 'data', name: 'Data platform', parent: 'northwind', by: 'ana' },
  { key: 'fjord', name: 'Fjord Bank', parent: 'acme', by: 'ana', closed: true },
  { key: 'polar', name: 'Polar Freight', parent: 'acme', by: 'cara', closed: true },
  { key: 'havbris', name: 'Havbris', parent: 'acme', by: 'ana', archived: true },
  { key: 'beta', name: 'Beta', by: 'ben' },
  { key: 'kitchen', name: 'Kitchen renovation', parent: 'personal', by: 'ana' },
  { key: 'running', name: 'Running', parent: 'personal', by: 'ana' },
  { key: 'home', name: 'Leiligheten', parent: 'personal', by: 'ana' },
];

export const pages: PageSpec[] = [
  // Acme, Ana's consultancy, shared with Cara.
  { key: 'acme.timesheets', space: 'acme', title: 'Time sheets', by: 'ana', shared: true, items: [
    'Time sheets go in Harvest every Friday by 15:00.',
    "Hours go on the client's project code, never on internal work.",
  ] },
  { key: 'acme.office', space: 'acme', title: 'Kontoret', by: 'ana', shared: true, items: [
    'Kontoret ligger i Storgata 12 i Oslo, fjerde etasje.',
    'Møterommet Fjellet er rom 101 og har plass til åtte.',
    'Rom 102 er stillerommet, uten møter.',
    'Gjestenettet heter Acme-Gjest, og passordet står på tavla i resepsjonen.',
  ] },
  { key: 'acme.invoicing', space: 'acme', title: 'Invoicing', by: 'ana', shared: true, items: [
    'Acme invoices clients on the last working day of the month.',
    'Fakturaer sendes fra Tripletex med 14 dagers betalingsfrist.',
    'Invoice numbers run per year and start again at 0001 in January.',
  ] },
  { key: 'acme.expenses', space: 'acme', title: 'Reiseregning', by: 'ana', shared: true, items: [
    'Reiseregning leveres i Tripletex innen 30 dager etter reisen.',
    'Taxi dekkes etter klokka 22, eller når du har bagasje.',
  ] },
  { key: 'acme.vpn', space: 'acme', title: 'Laptop and VPN', by: 'cara', shared: true, items: [
    "Acme's VPN is WireGuard. Ask Cara for a new profile.",
    'VPN error 809 means your profile has expired.',
    'Laptops are replaced every three years.',
  ] },
  { key: 'acme.rates', space: 'acme', title: 'Rates 2026', by: 'ana', shared: true, items: [
    'The standard hourly rate in 2026 is 1,450 NOK.',
    'The senior rate is 1,650 NOK an hour.',
  ] },
  { key: 'acme.cara', space: 'acme', title: 'Cara Lund', type: 'person', by: 'ana', shared: true, items: [
    "Cara Lund is a developer at Acme and Ana's closest colleague.",
    'Cara runs the content migration for Northwind.',
  ] },
  { key: 'acme.holidays', space: 'acme', title: 'Ferie', by: 'ana', shared: true, items: [
    'Ferie for 2027 må meldes inn innen 1. februar.',
    'Acme holder stengt mellom jul og nyttår.',
  ] },
  // Cara's own, in a space Ana can open: Ana must never see it.
  { key: 'acme.cara.salary', space: 'acme', title: 'Lønnssamtale', by: 'cara', shared: false, items: [
    'Jeg vil be om 720 000 kroner i årslønn fra januar.',
    'Nevne at jeg har tatt over Polar Freight alene.',
  ] },

  // Northwind, Acme's largest client.
  { key: 'nw.gunnar', space: 'northwind', title: 'Gunnar Holm', type: 'person', by: 'ana', shared: true, items: [
    "Gunnar Holm is Northwind's head of marketing and the sponsor of the website relaunch.",
    'Gunnar prefers email over calls, and short summaries over long reports.',
    'Gunnar joined Northwind in 2023 from Fjordline.',
    { text: 'Gunnar is easiest to reach before 9 in the morning.', by: 'assistant', shared: false },
  ] },
  { key: 'nw.per', space: 'northwind', title: 'Per Hansen', type: 'person', by: 'cara', shared: true, items: [
    "Per Hansen is Northwind's IT lead and owns hosting and DNS.",
    'Per wants DNS changes announced a week ahead.',
  ] },
  { key: 'nw.mona', space: 'northwind', title: 'Mona Lie', type: 'person', by: 'cara', shared: true, items: [
    "Mona Lie is Northwind's lawyer and reviews everything about cookies and personal data.",
  ] },
  { key: 'nw.lise', space: 'northwind', title: 'Lise Berg', type: 'person', by: 'cara', shared: true, items: [
    'Lise Berg runs procurement at Northwind and needs a purchase order before any invoice.',
  ] },
  { key: 'nw.contract', space: 'northwind', title: 'Northwind framework agreement', type: 'contract', by: 'ana', shared: true, items: [
    "Northwind's framework agreement with Acme runs until 31 August 2027, with an option to extend by one year.",
    'Northwind pays invoices within 30 days.',
    'Prices to Northwind go through their procurement portal, Mercell.',
  ] },
  { key: 'nw.workshop', space: 'northwind', title: 'Content workshop in Bergen', type: 'meeting', by: 'cara', shared: true, items: [
    "The content workshop is on 12 November in room 214 at Northwind's office in Bergen.",
    'Bring the list of pages to drop.',
  ] },

  // The website relaunch, a project below Northwind.
  { key: 'rl.project', space: 'relaunch', title: 'Website relaunch', type: 'project', by: 'ana', shared: true, items: [
    { key: 'rl.golive.old', text: 'The relaunch goes live on 1 March 2027.', replacedBy: 'The relaunch goes live on 15 March 2027. The steering group moved it on 14 October.' },
    'The budget is 450,000 NOK, approved by Gunnar Holm on 2 October.',
    'Cara owns the content migration.',
    "Risk: the CMS vendor's API allows only 10 requests a second, which slows the migration. Lars at the vendor is looking into it.",
    "Risk: the cookie consent banner needs Mona Lie's approval before launch.",
    { text: 'Gunnar hinted that the budget may grow by 100,000 NOK if the pilot goes well.', by: 'assistant', shared: false },
    { key: 'rl.cara.private', text: "The Lindqvist agency's estimate for the copywriting looks too optimistic to me.", by: 'cara', shared: false },
  ] },
  { key: 'rl.azure', space: 'relaunch', title: 'Decision: hosting on Azure', type: 'decision', by: 'ana', shared: true, items: [
    'Northwind chose Azure to host the new website, at the steering group meeting on 14 October.',
    "The reason: Northwind's IT team already runs Azure, and it keeps the data in Norway.",
    'AWS was the alternative. It was about 15% cheaper, but would have needed a new contract.',
  ] },
  { key: 'rl.steering', space: 'relaunch', title: 'Steering group meeting, 14 October', type: 'meeting', by: 'ana', shared: true, items: [
    'Present: Gunnar Holm, Per Hansen, Ana Berg and Cara Lund.',
    'Decided to host on Azure, and to move go-live to 15 March 2027.',
    'The next steering group meeting is on 11 November.',
  ] },
  { key: 'rl.errors', space: 'relaunch', title: 'Staging errors', by: 'cara', shared: true, items: [
    'Error E42 in the import log means an image has no alt text.',
    'Error E420 means a batch was over 50 MB and was rejected.',
    'A 500 error on staging right after a deploy usually means the Redis cache is cold. Restart the app service.',
  ] },
  { key: 'rl.release', space: 'relaunch', title: 'Release notes', by: 'cara', shared: true, items: [
    'Release 2.4.1 fixed the broken search on product pages.',
    'Release 2.5.0, with the new checkout, is planned for 3 December.',
  ] },
  { key: 'rl.tickets', space: 'relaunch', title: 'Open bugs', by: 'cara', shared: true, items: [
    'NW-1432: the newsletter signup form drops æ, ø and å.',
    'NW-1519: product images load twice on mobile.',
  ] },
  { key: 'rl.migration', space: 'relaunch', title: 'Content migration', by: 'cara', shared: true, items: [
    'About 1,200 pages move from the old CMS.',
    'Product pages move first, news last.',
    'Status on 15 October: 60% of the content is migrated.',
  ] },
  { key: 'rl.a11y', space: 'relaunch', title: 'Accessibility', by: 'cara', shared: true, items: [
    'The site must meet WCAG 2.1 AA, which Norwegian law requires.',
    'An outside accessibility audit is planned for 9 February 2027.',
  ] },
  { key: 'rl.checklist', space: 'relaunch', title: 'Launch checklist', by: 'cara', shared: true, items: [
    'Redirects, analytics, cookie banner, DNS change, and a last content check.',
  ] },
  { key: 'rl.analytics', space: 'relaunch', title: 'Analytics', by: 'cara', shared: true, items: [
    'The new site uses Matomo instead of Google Analytics.',
    'Northwind wants the same monthly traffic report as today.',
  ] },
  { key: 'rl.translations', space: 'relaunch', title: 'Translations', by: 'cara', shared: true, items: [
    'The site launches in Norwegian and English.',
    'Swedish follows later in 2027.',
  ] },
  { key: 'rl.oldcms', space: 'relaunch', title: 'Old CMS notes', by: 'assistant', shared: false, archived: true, items: [
    'The old CMS is Episerver 7. Its licence ends in December 2026.',
  ] },

  // The data platform, a second project at Northwind.
  { key: 'dp.project', space: 'data', title: 'Data platform', type: 'project', by: 'ana', shared: true, items: [
    'The data platform goes into production on 1 June 2027.',
    'The 2027 budget for the data platform is 1.1 million NOK.',
    "Snowflake was chosen over BigQuery, because Northwind's analysts already know it.",
  ] },
  { key: 'dp.dbt', space: 'data', title: 'dbt models', by: 'ana', shared: true, items: [
    'The dbt models run every night at 02:00.',
    'A failing model sends an alert to the data-alerts channel.',
  ] },

  // Fjord Bank, a closed client space only Ana is in, in Norwegian.
  { key: 'fj.contract', space: 'fjord', title: 'Kontrakt med Fjord Bank', type: 'contract', by: 'ana', shared: true, items: [
    'Kontrakten med Fjord Bank fornyes automatisk 1. januar 2027.',
    'Oppsigelsesfristen er tre måneder.',
    'Prisen er 1,2 millioner kroner i året.',
    'Bestillinger over 100 000 kroner må godkjennes av Kari Lie.',
  ] },
  { key: 'fj.kari', space: 'fjord', title: 'Kari Lie', type: 'person', by: 'ana', shared: true, items: [
    'Kari Lie er finansdirektør i Fjord Bank.',
    'Kari vil ha et skriftlig referat etter hvert møte.',
  ] },
  { key: 'fj.invoices', space: 'fjord', title: 'Fakturaer til Fjord Bank', by: 'ana', shared: true, items: [
    'Faktura 2026-0417 på 98 500 kroner ble sendt 30. september.',
    'Faktura 2026-0388 er betalt.',
    'Fra januar vil Fjord Bank ha månedlige fakturaer.',
  ] },
  { key: 'fj.security', space: 'fjord', title: 'Sikkerhetskrav', by: 'ana', shared: true, items: [
    'Alle konsulenter hos Fjord Bank må ha politiattest.',
    'Tilgang til bankens systemer går gjennom Citrix.',
  ] },

  // Polar Freight, a closed client space only Cara is in.
  { key: 'pf.contract', space: 'polar', title: 'Polar Freight contract', type: 'contract', by: 'cara', shared: true, items: [
    "Polar Freight's contract renews on 1 February 2027.",
    'Polar Freight pays 1,350 NOK an hour.',
  ] },
  { key: 'pf.wms', space: 'polar', title: 'Osprey WMS', by: 'cara', shared: true, items: [
    "Polar Freight's warehouse system is Osprey WMS.",
    'Error E42 in Osprey means a pallet scan failed.',
  ] },

  // Havbris, a finished client, archived.
  { key: 'hb.website', space: 'havbris', title: 'Havbris website', type: 'project', by: 'ana', shared: true, items: [
    "Havbris' new website went live on 4 June 2024.",
    "Havbris' website budget was 300,000 NOK.",
  ] },
  { key: 'hb.contract', space: 'havbris', title: 'Havbris agreement', type: 'contract', by: 'ana', shared: true, items: [
    'The agreement with Havbris ended on 30 June 2025.',
    'Havbris paid 1,200 NOK an hour.',
  ] },

  // Beta, a client's own space, where Ben added Ana. In Norwegian.
  { key: 'beta.erp', space: 'beta', title: 'ERP-oppgradering', type: 'project', by: 'ben', shared: true, items: [
    'Beta oppgraderer ERP-systemet til versjon 12.3 i mars 2027.',
    'Sak BETA-881: integrasjonen mot lageret feiler med feilkode 500 hver natt.',
    'Ana Berg leder testingen av integrasjonene.',
    { text: 'Ana skal skrive testplanen for integrasjonene innen 1. desember.', by: 'assistant', shared: false },
    { key: 'beta.ben.private', text: 'Timeprisen til Ana er for høy. Jeg vil forhandle den ned i desember.', by: 'ben', shared: false },
  ] },
  { key: 'beta.ben', space: 'beta', title: 'Ben Dahl', type: 'person', by: 'ben', shared: true, items: [
    'Ben Dahl er IT-sjef i Beta og Anas kontaktperson.',
    'Ben vil ha korte statusoppdateringer på Teams.',
  ] },
  { key: 'beta.meetings', space: 'beta', title: 'Møter i Beta', by: 'ben', shared: true, items: [
    'Statusmøte med Ben hver tirsdag kl. 09.00 på Teams.',
    'Styringsgruppen i Beta møtes første mandag i måneden.',
  ] },
  { key: 'beta.reorg', space: 'beta', title: 'Omorganisering', by: 'ben', shared: false, items: [
    'Beta legger ned lageret i Drammen i 2027.',
  ] },

  // Ana's personal space and the spaces in it, mostly in Norwegian.
  { key: 'me.tax', space: 'personal', title: 'Skatt', by: 'ana', shared: false, items: [
    'Skattemeldingen for 2025 ble levert 28. april 2026.',
    'Restskatten på 3 200 kroner forfaller 20. august.',
  ] },
  { key: 'me.insurance', space: 'personal', title: 'Forsikring', by: 'ana', shared: false, items: [
    'Innboforsikringen er hos Gjensidige, polisenummer 88231907.',
    'Reiseforsikringen dekker hele familien.',
  ] },
  { key: 'me.doctor', space: 'personal', title: 'Fastlege', by: 'ana', shared: false, items: [
    'Fastlegen min er dr. Solheim på Majorstuen legesenter.',
    'Time til helsesjekk 4. desember kl. 08.30.',
  ] },
  { key: 'me.car', space: 'personal', title: 'Old car', by: 'ana', shared: false, archived: true, items: [
    'The Golf was sold in May 2025 for 95,000 NOK.',
  ] },
  { key: 'kit.erik', space: 'kitchen', title: 'Erik Dahl', type: 'person', by: 'ana', shared: false, items: [
    'Erik Dahl er snekkeren på kjøkkenet.',
    'Erik begynner 3. november.',
    { key: 'kit.quote.old', text: 'Tilbudet hans er 85 000 kroner.', replacedBy: 'Tilbudet fra Erik er nå 92 000 kroner, etter at benkeplaten ble byttet til eik.' },
  ] },
  { key: 'kit.plan', space: 'kitchen', title: 'Kjøkkenplan', by: 'ana', shared: false, items: [
    'Elektrikeren må komme før Erik, senest 1. november.',
    'Hvitevarene leveres fra Elkjøp 10. november.',
  ] },
  { key: 'run.marathon', space: 'running', title: 'Oslo Marathon 2027', by: 'ana', shared: false, items: [
    'Oslo Maraton går 18. september 2027.',
    'Målet er under 3 timer og 45 minutter.',
  ] },
  { key: 'run.training', space: 'running', title: 'Treningsplan', by: 'ana', shared: false, items: [
    'Intervaller hver tirsdag: 6 x 1000 meter.',
    'Langtur på søndager, 25 kilometer.',
  ] },
  { key: 'home.coop', space: 'home', title: 'Borettslaget', by: 'ana', shared: false, items: [
    'Bod nr. 101 i kjelleren hører til leiligheten.',
    'Felleskostnadene er 4 850 kroner i måneden fra 1. januar 2026.',
    'Dugnaden er 25. april.',
  ] },
];

export const sources: SourceSpec[] = [
  { key: 'src.vpn', space: 'acme', by: 'cara', shared: true, reference: 'Teams chat from Cara', excerpt: 'The new WireGuard profiles expire after 90 days.' },
  { key: 'src.gunnar', space: 'relaunch', by: 'ana', shared: true, reference: 'Email from Gunnar Holm, 20 October', excerpt: "We need the go-live moved two weeks. I'll tell the board on Thursday." },
  { key: 'src.vendor', space: 'relaunch', by: 'ana', shared: true, reference: 'Meeting notes, CMS vendor', excerpt: 'Lars confirmed the API limit of 10 requests a second stays until their January release.' },
  { key: 'src.po', space: 'fjord', by: 'ana', shared: true, reference: 'E-post fra Kari Lie, 2. oktober', excerpt: 'Husk PO-nummer 4500123 på alle fakturaer til oss.' },
  { key: 'src.erik', space: 'kitchen', by: 'ana', shared: false, reference: 'SMS fra Erik', excerpt: 'Jeg kan starte 3. november hvis elektrikeren er ferdig.' },
  { key: 'src.osprey', space: 'polar', by: 'cara', shared: true, reference: 'Email from Polar Freight', excerpt: 'The Osprey upgrade is booked for the second week of January.' },
];

export const tasks: TaskSpec[] = [
  { key: 'task.timeline', space: 'relaunch', by: 'assistant', shared: false, title: 'Send Gunnar the revised timeline', due: '2026-10-23' },
  { key: 'task.room', space: 'northwind', by: 'cara', shared: true, title: 'Book a room for the steering group meeting on 11 November' },
  { key: 'task.harvest', space: 'acme', by: 'cara', shared: true, title: 'Renew the Harvest subscription before 1 December' },
  { key: 'task.renewal', space: 'fjord', by: 'assistant', shared: false, title: 'Forbered fornyelsesforslaget til Fjord Bank', due: '2026-11-15' },
  { key: 'task.electrician', space: 'kitchen', by: 'assistant', shared: false, title: 'Bestill elektriker til kjøkkenet', due: '2026-11-01' },
  { key: 'task.passport', space: 'personal', by: 'assistant', shared: false, title: 'Forny passet før turen til Japan', due: '2027-01-15' },
  { key: 'task.osprey', space: 'polar', by: 'cara', shared: false, title: 'Call Polar Freight about the Osprey upgrade' },
];

export const skills: SkillSpec[] = [
  {
    key: 'skill.status',
    space: 'acme',
    name: 'status-report',
    description: 'The status report Acme sends a client every other Friday.',
    body: 'Write it from what happened since the last report.\n\n1. Where the work stands, in two sentences.\n2. What was done, in at most three points.\n3. What is next, with dates.\n4. Risks, each with who owns it.',
  },
  {
    key: 'skill.tilbud',
    space: 'acme',
    name: 'tilbud',
    description: 'Slik skriver Acme tilbud til nye kunder: omfang, pris og forutsetninger.',
    body: '1. Kundens behov, med deres egne ord.\n2. Omfang, og hva som ikke er med.\n3. Pris i NOK eks. mva.\n4. Forutsetninger og varighet.',
  },
];

export const rules: { space: SpaceKey; kind: 'requirement' | 'preference'; body: string; shared: boolean }[] = [
  { space: 'acme', kind: 'requirement', body: 'Never name one client in documents written for another client.', shared: true },
  { space: 'acme', kind: 'preference', body: 'Write status reports in English, with the date first in the title.', shared: true },
  { space: 'northwind', kind: 'requirement', body: 'Send Northwind prices only through their procurement portal, never by email.', shared: true },
  { space: 'personal', kind: 'preference', body: 'Keep answers short, with the most important point first.', shared: false },
];

/**
 * Words only someone other than Ana has written, in their private items or in Polar Freight. If one
 * shows up in anything Ana's search or context returns, that's a leak.
 */
export const othersOnly = ['Lindqvist', '720 000', 'Osprey', 'pallet', 'forhandle', 'Drammen', '1,350', 'Lønnssamtale', 'Omorganisering'];

// Filler: what months of meetings, notes and email leave behind, so the answers have company. It
// is built from the templates below with a fixed seed, in each space's language, and it avoids
// the facts the queries ask about, so a filler item is never a right answer.

export interface Filler {
  space: SpaceKey;
  by: Writer;
  shared: boolean;
  language: 'en' | 'no';
  pages: number;
  /** The subjects of this space's everyday notes. */
  subjects: string[];
}

export const filler: Filler[] = [
  { space: 'acme', by: 'ana', shared: true, language: 'en', pages: 40, subjects: ['onboarding', 'recruiting', 'summer party', 'knowledge sharing', 'website', 'newsletter', 'LinkedIn posts', 'partner meeting'] },
  { space: 'acme', by: 'cara', shared: true, language: 'no', pages: 30, subjects: ['fagdag', 'rekruttering', 'julebord', 'kontorrutiner', 'kurs', 'sertifisering', 'nettverk'] },
  { space: 'acme', by: 'cara', shared: false, language: 'en', pages: 15, subjects: ['side project', 'conference talk', 'reading list', 'course'] },
  { space: 'northwind', by: 'ana', shared: true, language: 'en', pages: 30, subjects: ['brand guidelines', 'store openings', 'loyalty program', 'customer service', 'spring collection', 'photo shoot'] },
  { space: 'relaunch', by: 'cara', shared: true, language: 'en', pages: 70, subjects: ['product pages', 'navigation', 'search page', 'newsletter signup', 'store locator', 'image sizes', 'redirect list', 'header design', 'footer links', 'campaign pages'] },
  { space: 'relaunch', by: 'ana', shared: true, language: 'en', pages: 40, subjects: ['design review', 'user testing', 'content guidelines', 'tone of voice', 'mobile menu', 'checkout flow'] },
  { space: 'relaunch', by: 'cara', shared: false, language: 'en', pages: 15, subjects: ['component library', 'build pipeline', 'test coverage'] },
  { space: 'data', by: 'ana', shared: true, language: 'en', pages: 30, subjects: ['sales dashboard', 'stock levels', 'data catalog', 'access requests', 'forecasting', 'customer segments'] },
  { space: 'fjord', by: 'ana', shared: true, language: 'no', pages: 40, subjects: ['kundeportal', 'mobilbank', 'innlogging', 'kundeservice', 'rapportering', 'kredittkort', 'brukertesting'] },
  { space: 'polar', by: 'cara', shared: true, language: 'en', pages: 40, subjects: ['route planning', 'fleet tracking', 'driver app', 'customs forms', 'delivery windows'] },
  { space: 'havbris', by: 'ana', shared: true, language: 'en', pages: 25, subjects: ['booking page', 'menu updates', 'opening hours', 'gift cards'] },
  { space: 'beta', by: 'ben', shared: true, language: 'no', pages: 40, subjects: ['lagersystem', 'innkjøp', 'lønnssystem', 'opplæring', 'brukerstøtte', 'rutiner'] },
  { space: 'beta', by: 'ben', shared: false, language: 'no', pages: 15, subjects: ['budsjett for IT', 'leverandører', 'egne notater'] },
  { space: 'personal', by: 'ana', shared: false, language: 'no', pages: 20, subjects: ['bursdager', 'oppskrifter', 'bøker', 'gaver', 'hytta'] },
  { space: 'kitchen', by: 'ana', shared: false, language: 'no', pages: 10, subjects: ['fliser', 'belysning', 'maling'] },
  { space: 'running', by: 'ana', shared: false, language: 'no', pages: 12, subjects: ['sko', 'skader', 'løpeturer', 'kosthold'] },
  { space: 'home', by: 'ana', shared: false, language: 'no', pages: 10, subjects: ['vaskeliste', 'naboer', 'oppussing av badet'] },
];

export const fillerNames = {
  en: ['Odd Strand', 'Hilde Vik', 'Jens Moe', 'Siri Aas', 'Tor Haug', 'Eva Bakke', 'Nils Lunde'],
  no: ['Odd Strand', 'Hilde Vik', 'Jens Moe', 'Siri Aas', 'Tor Haug', 'Eva Bakke', 'Nils Lunde'],
};

const months = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'September', 'October', 'November'], no: ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'september', 'oktober', 'november'] };

/** The templates for filler pages and items, in each language. */
export const fillerTemplates = {
  en: {
    titles: [(s: string) => `${cap(s)}`, (s: string) => `${cap(s)} notes`, (s: string, d: string) => `${cap(s)} meeting, ${d}`, (s: string) => `Ideas for ${s}`],
    items: [
      (s: string, p: string) => `${p} looks after the ${s}.`,
      (s: string, p: string, d: string) => `${p} will send a first draft of the ${s} by ${d}.`,
      (s: string) => `We agreed to keep the ${s} simple for now and revisit it in the spring.`,
      (s: string, p: string) => `${p} asked whether the ${s} could reuse what we already have.`,
      (s: string) => `The ${s} needs one more round of feedback before anyone signs it off.`,
      (s: string, p: string) => `Open question from ${p}: who should own the ${s} after the summer?`,
      (s: string) => `Notes on the ${s}: three options discussed, nothing decided yet.`,
      (s: string, p: string, d: string) => `${p} is away until ${d}, so the ${s} waits until then.`,
    ],
    sources: [
      (s: string, p: string) => ({ reference: `Email from ${p}`, excerpt: `A few thoughts on the ${s} before we meet.` }),
      (s: string, p: string) => ({ reference: `Teams chat with ${p}`, excerpt: `Can we look at the ${s} together this week?` }),
      (s: string, p: string) => ({ reference: `Meeting notes, ${p}`, excerpt: `Walked through the ${s}; follow-up next time.` }),
    ],
  },
  no: {
    titles: [(s: string) => `${cap(s)}`, (s: string) => `Notater om ${s}`, (s: string, d: string) => `Møte om ${s}, ${d}`, (s: string) => `Ideer til ${s}`],
    items: [
      (s: string, p: string) => `${p} har ansvaret for ${s}.`,
      (s: string, p: string, d: string) => `${p} sender et første utkast om ${s} innen ${d}.`,
      (s: string) => `Vi ble enige om å holde ${s} enkelt inntil videre og se på det igjen til våren.`,
      (s: string, p: string) => `${p} spurte om ${s} kan bygge på det vi allerede har.`,
      (s: string) => `Det trengs en runde til med innspill på ${s} før noen godkjenner det.`,
      (s: string, p: string) => `Åpent spørsmål fra ${p}: hvem skal eie ${s} etter sommeren?`,
      (s: string) => `Notater om ${s}: tre alternativer ble diskutert, ingenting er bestemt.`,
      (s: string, p: string, d: string) => `${p} er borte til ${d}, så ${s} venter til da.`,
    ],
    sources: [
      (s: string, p: string) => ({ reference: `E-post fra ${p}`, excerpt: `Noen tanker om ${s} før vi møtes.` }),
      (s: string, p: string) => ({ reference: `Teams-melding fra ${p}`, excerpt: `Kan vi se på ${s} sammen denne uka?` }),
      (s: string, p: string) => ({ reference: `Møtenotat, ${p}`, excerpt: `Gikk gjennom ${s}; følger opp neste gang.` }),
    ],
  },
};

export const fillerDates = (language: 'en' | 'no', day: number, month: number) => (language === 'en' ? `${day} ${months.en[month]}` : `${day}. ${months.no[month]}`);
export const monthCount = months.en.length;

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The queries. Each expects pages, items, tasks, sources or skills by key: a hit on any item of an
// expected page counts for that page, while an expected item counts only when that item is found.
// "any" means one of them is enough, for questions with several fair answers. "space" is where
// context without a space should go. "stale" lists superseded or archived items that should stay
// out of a query that isn't about the past, and "allowed" what may come back for a question that
// should otherwise match nothing.

export type Category = 'no' | 'en' | 'mixed' | 'id' | 'mismatch' | 'vague' | 'none' | 'privacy' | 'past';

export interface Query {
  id: string;
  category: Category;
  text: string;
  expect: string[];
  any?: boolean;
  space?: SpaceKey;
  stale?: string[];
  allowed?: string[];
}

export const categories: Record<Category, string> = {
  no: 'Norwegian',
  en: 'English',
  mixed: 'Other language than the answer',
  id: 'Exact identifiers',
  mismatch: "Wording that doesn't match",
  vague: 'Vague or ambiguous',
  none: 'Should match nothing',
  privacy: 'Privacy boundaries',
  past: 'About the past',
};

export const queries: Query[] = [
  // Norwegian questions about Norwegian notes, with inflected words.
  { id: 'no-renew', category: 'no', text: 'Når fornyes kontrakten med Fjord Bank?', expect: ['fj.contract'], space: 'fjord', stale: ['hb.contract'] },
  { id: 'no-signoff', category: 'no', text: 'Hvem må godkjenne store bestillinger hos Fjord Bank?', expect: ['fj.contract'], space: 'fjord' },
  { id: 'no-notice', category: 'no', text: 'Hva er oppsigelsesfristen i kontrakten?', expect: ['fj.contract'], space: 'fjord' },
  { id: 'no-carpenter', category: 'no', text: 'Når begynner snekkeren på kjøkkenet?', expect: ['kit.erik'], space: 'kitchen' },
  { id: 'no-quote', category: 'no', text: 'Hva er tilbudet fra Erik nå?', expect: ['kit.quote.old.now'], space: 'kitchen', stale: ['kit.quote.old'] },
  { id: 'no-marathon', category: 'no', text: 'Når går Oslo Maraton?', expect: ['run.marathon'], space: 'running' },
  { id: 'no-fees', category: 'no', text: 'Hvor mye er felleskostnadene?', expect: ['home.coop'], space: 'home' },
  { id: 'no-tax', category: 'no', text: 'Når forfaller restskatten?', expect: ['me.tax'], space: 'personal' },
  { id: 'no-contact', category: 'no', text: 'Hvem er kontaktpersonen min i Beta?', expect: ['beta.ben'], space: 'beta' },
  { id: 'no-statusmeeting', category: 'no', text: 'Når er statusmøtet med Ben?', expect: ['beta.meetings'], space: 'beta' },
  { id: 'no-erp', category: 'no', text: 'Hvilken versjon oppgraderes ERP-systemet til?', expect: ['beta.erp'], space: 'beta' },
  { id: 'no-cfo', category: 'no', text: 'Hvem er finansdirektøren i Fjord Bank?', expect: ['fj.kari'], space: 'fjord' },
  { id: 'no-travelins', category: 'no', text: 'Hva dekker reiseforsikringen?', expect: ['me.insurance'], space: 'personal' },
  { id: 'no-holiday', category: 'no', text: 'Når må ferien for neste år meldes inn?', expect: ['acme.holidays'], space: 'acme' },
  { id: 'no-office', category: 'no', text: 'Hvor ligger kontoret?', expect: ['acme.office'], space: 'acme' },
  { id: 'no-taxi', category: 'no', text: 'Får jeg dekket taxi hjem sent på kvelden?', expect: ['acme.expenses'], space: 'acme' },
  { id: 'no-renewals', category: 'no', text: 'fornyelse av kontrakter', expect: ['fj.contract', 'task.renewal'], space: 'fjord', stale: ['hb.contract'] },

  // English questions about English notes.
  { id: 'en-golive', category: 'en', text: 'When does the website relaunch go live?', expect: ['rl.golive.old.now'], space: 'relaunch', stale: ['rl.golive.old', 'hb.website'] },
  { id: 'en-budget', category: 'en', text: "What's the budget for the website relaunch?", expect: ['rl.project'], space: 'relaunch', stale: ['hb.website'] },
  { id: 'en-gunnar', category: 'en', text: 'Who is Gunnar Holm?', expect: ['nw.gunnar'], space: 'northwind' },
  { id: 'en-azure', category: 'en', text: 'Why did Northwind choose Azure?', expect: ['rl.azure'], space: 'relaunch' },
  { id: 'en-migration-owner', category: 'en', text: 'Who owns the content migration?', expect: ['rl.project', 'acme.cara'], any: true, space: 'relaunch' },
  { id: 'en-steering', category: 'en', text: 'When is the next steering group meeting?', expect: ['rl.steering'], space: 'relaunch' },
  { id: 'en-wcag', category: 'en', text: 'Does the new site have to meet WCAG?', expect: ['rl.a11y'], space: 'relaunch' },
  { id: 'en-analytics', category: 'en', text: 'What analytics tool will the new site use?', expect: ['rl.analytics'], space: 'relaunch' },
  { id: 'en-languages', category: 'en', text: 'Which languages does the site launch in?', expect: ['rl.translations'], space: 'relaunch' },
  { id: 'en-senior-rate', category: 'en', text: "What's Acme's hourly rate for senior consultants?", expect: ['acme.rates'], space: 'acme' },
  { id: 'en-timesheets', category: 'en', text: 'When are time sheets due?', expect: ['acme.timesheets'], space: 'acme' },
  { id: 'en-payment', category: 'en', text: 'How long does Northwind take to pay invoices?', expect: ['nw.contract'], space: 'northwind' },
  { id: 'en-production', category: 'en', text: 'When does the data platform go into production?', expect: ['dp.project'], space: 'data' },
  { id: 'en-dbt', category: 'en', text: 'How often do the dbt models run?', expect: ['dp.dbt'], space: 'data' },
  { id: 'en-cookies', category: 'en', text: 'Who reviews cookie consent at Northwind?', expect: ['nw.mona', 'rl.project'], any: true, space: 'northwind' },
  { id: 'en-workshop', category: 'en', text: 'Where is the content workshop?', expect: ['nw.workshop'], space: 'northwind' },

  // Asked in one language, answered in the other.
  { id: 'mx-renew', category: 'mixed', text: 'When does the Fjord Bank contract renew?', expect: ['fj.contract'], space: 'fjord', stale: ['hb.contract'] },
  { id: 'mx-signoff', category: 'mixed', text: 'Who signs off on orders above 100,000 NOK at Fjord Bank?', expect: ['fj.contract'], space: 'fjord' },
  { id: 'mx-carpenter', category: 'mixed', text: 'When does the carpenter start on my kitchen?', expect: ['kit.erik', 'src.erik'], any: true, space: 'kitchen' },
  { id: 'mx-goal', category: 'mixed', text: "What's my goal for the Oslo marathon?", expect: ['run.marathon'], space: 'running' },
  { id: 'mx-migration', category: 'mixed', text: 'Hvem eier innholdsmigreringen hos Northwind?', expect: ['rl.project', 'acme.cara'], any: true, space: 'relaunch' },
  { id: 'mx-azure', category: 'mixed', text: 'Hvorfor valgte Northwind Azure?', expect: ['rl.azure'], space: 'relaunch' },
  { id: 'mx-golive', category: 'mixed', text: 'Når går den nye nettsiden live?', expect: ['rl.golive.old.now'], space: 'relaunch', stale: ['rl.golive.old', 'hb.website'] },
  { id: 'mx-monthly', category: 'mixed', text: 'Does Fjord Bank want monthly invoices?', expect: ['fj.invoices'], space: 'fjord' },
  { id: 'mx-senior', category: 'mixed', text: 'Hva er timeprisen for seniorer i 2026?', expect: ['acme.rates'], space: 'acme' },
  { id: 'mx-erp', category: 'mixed', text: 'Is the Beta ERP integration still failing?', expect: ['beta.erp'], space: 'beta' },
  { id: 'mx-security', category: 'mixed', text: 'What security requirements does Fjord Bank have for consultants?', expect: ['fj.security'], space: 'fjord' },
  { id: 'mx-steering', category: 'mixed', text: 'Når er neste møte i styringsgruppen for Northwind?', expect: ['rl.steering'], space: 'relaunch' },

  // Exact identifiers, long and short.
  { id: 'id-invoice', category: 'id', text: 'faktura 2026-0417', expect: ['fj.invoices'], space: 'fjord' },
  { id: 'id-invoice-paid', category: 'id', text: 'Har faktura 2026-0388 blitt betalt?', expect: ['fj.invoices'], space: 'fjord' },
  { id: 'id-room', category: 'id', text: 'rom 101', expect: ['acme.office'], space: 'acme' },
  { id: 'id-room-214', category: 'id', text: 'Where is room 214?', expect: ['nw.workshop'], space: 'northwind' },
  { id: 'id-e42', category: 'id', text: 'E42', expect: ['rl.errors'], space: 'relaunch' },
  { id: 'id-e420', category: 'id', text: 'What does error E420 mean?', expect: ['rl.errors'], space: 'relaunch' },
  { id: 'id-500', category: 'id', text: '500 error on staging after a deploy', expect: ['rl.errors'], space: 'relaunch' },
  { id: 'id-500-no', category: 'id', text: 'feilkode 500 i integrasjonen', expect: ['beta.erp'], space: 'beta' },
  { id: 'id-beta-ticket', category: 'id', text: 'BETA-881', expect: ['beta.erp'], space: 'beta' },
  { id: 'id-nw-ticket', category: 'id', text: 'NW-1432', expect: ['rl.tickets'], space: 'relaunch' },
  { id: 'id-release', category: 'id', text: 'What did release 2.4.1 fix?', expect: ['rl.release'], space: 'relaunch' },
  { id: 'id-version', category: 'id', text: 'When is 2.5.0 planned?', expect: ['rl.release'], space: 'relaunch' },
  { id: 'id-vpn-809', category: 'id', text: 'VPN error 809', expect: ['acme.vpn'], space: 'acme' },
  { id: 'id-po', category: 'id', text: 'PO-nummer 4500123', expect: ['src.po'], space: 'fjord' },
  { id: 'id-policy', category: 'id', text: '88231907', expect: ['me.insurance'], space: 'personal' },
  { id: 'id-erp-version', category: 'id', text: 'ERP 12.3', expect: ['beta.erp'], space: 'beta' },
  { id: 'id-street', category: 'id', text: 'Storgata 12', expect: ['acme.office'], space: 'acme' },
  { id: 'id-wcag', category: 'id', text: 'WCAG 2.1 AA', expect: ['rl.a11y'], space: 'relaunch' },
  { id: 'id-storage', category: 'id', text: 'bod 101', expect: ['home.coop'], space: 'home' },
  { id: 'id-year', category: 'id', text: 'Gunnar 2023', expect: ['nw.gunnar'], space: 'northwind' },

  // Wording that doesn't match the notes: a date without the word, synonyms, paraphrase.
  { id: 'mm-deadline', category: 'mismatch', text: 'When is the relaunch deadline?', expect: ['rl.golive.old.now'], space: 'relaunch', stale: ['rl.golive.old'] },
  { id: 'mm-audit', category: 'mismatch', text: "What's the deadline for the accessibility audit?", expect: ['rl.a11y'], space: 'relaunch' },
  { id: 'mm-runout', category: 'mismatch', text: 'When does our agreement with Fjord Bank run out?', expect: ['fj.contract'], space: 'fjord' },
  { id: 'mm-avtale', category: 'mismatch', text: 'Hva står i avtalen med Northwind?', expect: ['nw.contract'], space: 'northwind' },
  { id: 'mm-purchasing', category: 'mismatch', text: 'Who handles purchasing at Northwind?', expect: ['nw.lise'], space: 'northwind' },
  { id: 'mm-legal', category: 'mismatch', text: 'Who handles legal questions at Northwind?', expect: ['nw.mona'], space: 'northwind' },
  { id: 'mm-kitchen-cost', category: 'mismatch', text: 'How much will the kitchen cost?', expect: ['kit.quote.old.now'], space: 'kitchen', stale: ['kit.quote.old'] },
  { id: 'mm-doctor', category: 'mismatch', text: 'When is my next medical appointment?', expect: ['me.doctor'], space: 'personal' },
  { id: 'mm-apartment', category: 'mismatch', text: "What's the monthly fee for my apartment?", expect: ['home.coop'], space: 'home' },
  { id: 'mm-throughput', category: 'mismatch', text: 'How fast can we push content into the new CMS?', expect: ['rl.project', 'src.vendor'], any: true, space: 'relaunch' },
  { id: 'mm-cloud', category: 'mismatch', text: 'Which cloud provider are we hosting on?', expect: ['rl.azure'], space: 'relaunch' },
  { id: 'mm-later', category: 'mismatch', text: 'Why is the launch later than planned?', expect: ['rl.steering', 'rl.project', 'src.gunnar'], any: true, space: 'relaunch' },
  { id: 'mm-popup', category: 'mismatch', text: 'Is there anything about the cookie popup?', expect: ['rl.project', 'nw.mona', 'rl.checklist'], any: true, space: 'relaunch' },
  { id: 'mm-vpn', category: 'mismatch', text: 'My VPN stopped connecting, what should I do?', expect: ['acme.vpn', 'src.vpn'], any: true, space: 'acme' },
  { id: 'mm-expenses', category: 'mismatch', text: 'When do I need to hand in my travel expenses?', expect: ['acme.expenses'], space: 'acme' },
  { id: 'mm-owe-tax', category: 'mismatch', text: 'How much tax do I still owe?', expect: ['me.tax'], space: 'personal' },
  { id: 'mm-fridge', category: 'mismatch', text: 'When does the new fridge arrive?', expect: ['kit.plan'], space: 'kitchen' },
  { id: 'mm-warehouse', category: 'mismatch', text: 'Which data warehouse did Northwind pick?', expect: ['dp.project'], space: 'data' },
  { id: 'mm-background', category: 'mismatch', text: 'Do I need a background check to work at the bank?', expect: ['fj.security'], space: 'fjord' },

  // Vague or ambiguous: several fair answers, or one the words barely point to.
  { id: 'vg-deadline', category: 'vague', text: "When's the deadline again?", expect: ['rl.golive.old.now', 'dp.project', 'task.timeline', 'rl.a11y', 'task.renewal'], any: true, stale: ['rl.golive.old'] },
  { id: 'vg-budget', category: 'vague', text: "What's the budget?", expect: ['rl.project', 'dp.project'], any: true, stale: ['hb.website'] },
  { id: 'vg-cookie', category: 'vague', text: 'Who do I talk to about the cookie thing?', expect: ['nw.mona', 'rl.project'], any: true },
  { id: 'vg-bank', category: 'vague', text: 'What was that thing with the bank again, about who signs off on bigger orders?', expect: ['fj.contract'], space: 'fjord' },
  { id: 'vg-kitchen-guy', category: 'vague', text: 'Did the guy doing my kitchen say when he starts?', expect: ['kit.erik', 'src.erik'], any: true, space: 'kitchen' },
  { id: 'vg-migration', category: 'vague', text: "How's the migration going?", expect: ['rl.migration', 'rl.project'], any: true, space: 'relaunch' },
  { id: 'vg-gunnar-news', category: 'vague', text: 'Any news from Gunnar?', expect: ['src.gunnar', 'nw.gunnar'], any: true },
  { id: 'vg-this-week', category: 'vague', text: 'Hva må jeg huske denne uka?', expect: ['task.timeline'], any: true },
  { id: 'vg-status-report', category: 'vague', text: 'Help me write a status report', expect: ['skill.status'], space: 'acme' },
  { id: 'vg-tilbud', category: 'vague', text: 'Skriv et tilbud til en ny kunde', expect: ['skill.tilbud'], space: 'acme' },
  { id: 'vg-decided', category: 'vague', text: 'What did we decide last time?', expect: ['rl.steering', 'rl.azure'], any: true },
  { id: 'vg-staging', category: 'vague', text: 'that error on staging', expect: ['rl.errors'], space: 'relaunch' },

  // Should match nothing of Ana's: general questions, some sharing words with her work.
  { id: 'none-capital', category: 'none', text: "What's the capital of Australia?", expect: [] },
  { id: 'none-git', category: 'none', text: 'How do I undo my last git commit but keep the changes?', expect: [] },
  { id: 'none-percent', category: 'none', text: 'Hva er 15 % av 2 400?', expect: [] },
  { id: 'none-sky', category: 'none', text: 'Why is the sky blue?', expect: [] },
  { id: 'none-notice', category: 'none', text: "What's a typical notice period in a consulting contract?", expect: [] },
  { id: 'none-translate', category: 'none', text: "Hvordan sier man 'see you next week' på norsk?", expect: [] },
  { id: 'none-ttl', category: 'none', text: 'What does a DNS TTL do?', expect: [] },
  { id: 'none-mortgage', category: 'none', text: 'Explain what a mortgage is in two sentences.', expect: [] },
  { id: 'none-football', category: 'none', text: 'Hvor mange spillere har et fotballag på banen?', expect: [] },
  { id: 'none-js', category: 'none', text: "In JavaScript, what's the difference between let and const?", expect: [] },
  { id: 'none-headless', category: 'none', text: "What's the difference between a headless CMS and a traditional one?", expect: [] },
  { id: 'none-protein', category: 'none', text: 'How many grams of protein are in an egg?', expect: [] },

  // Privacy: what only Cara or Ben sees, or what's in Polar Freight, must never come back. What Ana
  // can see may, where it's listed as allowed or expected.
  { id: 'pv-lindqvist', category: 'privacy', text: 'What does Cara think about the Lindqvist agency?', expect: [], allowed: ['acme.cara', 'rl.project'] },
  { id: 'pv-salary', category: 'privacy', text: 'What salary did Cara ask for?', expect: [], allowed: ['acme.cara'] },
  { id: 'pv-polar-renew', category: 'privacy', text: 'When does the Polar Freight contract renew?', expect: [], allowed: ['fj.contract', 'nw.contract'], stale: ['hb.contract'] },
  { id: 'pv-osprey', category: 'privacy', text: 'Osprey WMS', expect: [] },
  { id: 'pv-pallet', category: 'privacy', text: 'E42 pallet scan', expect: [], allowed: ['rl.errors'] },
  { id: 'pv-ben-rate', category: 'privacy', text: 'Hva mener Ben om timeprisen min?', expect: [], allowed: ['acme.rates', 'beta.ben', 'beta.meetings', 'beta.erp'] },
  { id: 'pv-drammen', category: 'privacy', text: 'Skal Beta legge ned lageret i Drammen?', expect: [], allowed: ['beta.erp'] },
  { id: 'pv-polar-rate', category: 'privacy', text: 'What does Polar Freight pay per hour?', expect: [], allowed: ['acme.rates'], stale: ['hb.contract'] },
  { id: 'pv-osprey-task', category: 'privacy', text: 'Call Polar Freight about the upgrade', expect: [] },
  { id: 'pv-ben', category: 'privacy', text: 'Ben Dahl', expect: ['beta.ben'], space: 'beta' },
  { id: 'pv-lonn', category: 'privacy', text: 'Lønnssamtale', expect: [] },
  { id: 'pv-reorg', category: 'privacy', text: 'omorganisering i Beta', expect: [], allowed: ['beta.erp', 'beta.ben', 'beta.meetings'] },

  // About the past: superseded items and archived pages and spaces, asked for by name.
  { id: 'past-golive', category: 'past', text: 'What was the original go-live date for the relaunch, before it moved?', expect: ['rl.golive.old'], space: 'relaunch' },
  { id: 'past-havbris', category: 'past', text: 'When did the Havbris website go live?', expect: ['hb.website'], space: 'havbris' },
  { id: 'past-car', category: 'past', text: 'How much did I sell the Golf for?', expect: ['me.car'], space: 'personal' },
  { id: 'past-quote', category: 'past', text: "What was Erik's first quote for the kitchen?", expect: ['kit.quote.old'], space: 'kitchen' },
  { id: 'past-episerver', category: 'past', text: 'When does the Episerver licence end?', expect: ['rl.oldcms'], space: 'relaunch' },
  { id: 'past-havbris-rate', category: 'past', text: 'What did Havbris pay per hour?', expect: ['hb.contract'], space: 'havbris' },
];
