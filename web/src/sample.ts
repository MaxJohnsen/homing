import type { AccountData } from '@/screens/account';
import type { PageData, PagesData, SourceData, SourcesData } from '@/lib/knowledge';
import type { AdminData } from '@/screens/admin';
import type { ProposalData, RequestData, WaitingData } from '@/lib/proposals';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import type { RuleData, SkillData, SkillSummary } from '@/lib/guidance';

// Claude proposes a preference for Acme, where two rules already apply.
export const proposal: ProposalData = {
  id: 'sample',
  assistant: 'Claude',
  space: 'Acme',
  personal: false,
  action: 'add',
  kind: 'preference',
  text: 'Write status reports in Norwegian.',
  rule: null,
  shared: true,
  onlyHere: false,
  state: 'open',
  alreadyApplies: [
    { kind: 'preference', text: 'Write reports in English.', from: 'your personal space' },
    { kind: 'requirement', text: 'Never name other clients in documents for Acme.', from: 'Acme' },
  ],
};

// A longer rule, to check that every screen shows it in full and stays readable.
export const longProposal: ProposalData = {
  ...proposal,
  kind: 'requirement',
  text: [
    'Weekly status reports for Acme follow this structure:',
    '',
    '1. What was done this week, in at most three points.',
    '2. What happens next week, each with a date.',
    '3. Risks, each with an owner and what we are doing about it.',
    '',
    'Write them in Norwegian, keep them under one page, and send them to Gunnar before 15:00 on Fridays.',
  ].join('\n'),
};

// A rule only for Ana, in her personal space.
export const personalProposal: ProposalData = {
  ...proposal,
  space: 'Personal',
  personal: true,
  text: 'Keep answers short unless I ask for detail.',
  shared: false,
  alreadyApplies: [],
};

// Claude proposes new wording for one of Acme's rules, and removing another.
export const changeProposal: ProposalData = {
  ...proposal,
  action: 'change',
  text: 'Write status reports in Norwegian, and the summary in English.',
  rule: { text: 'Write status reports in Norwegian.', current: true },
  alreadyApplies: [],
};

export const removeProposal: ProposalData = {
  ...proposal,
  action: 'remove',
  kind: 'requirement',
  text: null,
  rule: { text: 'Never name other clients in documents for Acme.', current: true },
  alreadyApplies: [],
};

// Ana's account, with a passkey on her laptop and one on her phone, and Claude connected.
export const sampleAccount: AccountData = {
  name: 'Ana Berg',
  email: 'ana@acme.no',
  emailVerified: true,
  canEmail: true,
  instanceAdmin: false,
  passwords: true,
  password: false,
  passkeys: [
    { id: 'mac', name: 'Mac', createdAt: '2026-10-14T09:12:00Z' },
    { id: 'iphone', name: 'iPhone', createdAt: '2026-10-15T18:40:00Z' },
  ],
  assistants: [
    { clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata', name: 'Claude', connectedAt: '2026-10-14T09:20:00Z' },
    { clientId: 'https://chatgpt.com/oauth/client-metadata.json', name: 'ChatGPT', connectedAt: '2026-10-15T08:05:00Z' },
  ],
  mcpUrl: 'https://homing.acme.no/mcp',
};

// Ana's spaces: her personal one with a kitchen renovation, Acme where she works, with a closed
// client space and an open website project, and her family.
export const sampleSpaces: SpaceSummary[] = [
  { id: 'acme', name: 'Acme', parentId: null, closed: false, personal: false, private: false, admin: true },
  { id: 'personal', name: 'Personal', parentId: null, closed: false, personal: true, private: true, admin: true },
  { id: 'northwind', name: 'Northwind', parentId: 'acme', closed: true, personal: false, private: false, admin: true },
  { id: 'website', name: 'Website', parentId: 'acme', closed: false, personal: false, private: false, admin: false },
  { id: 'kitchen', name: 'Kitchen renovation', parentId: 'personal', closed: false, personal: false, private: true, admin: true },
  { id: 'family', name: 'Berg family', parentId: null, closed: false, personal: false, private: false, admin: false },
];

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const sampleWaiting: WaitingData[] = [
  { id: 'w1', assistant: 'Claude', spaceId: 'northwind', space: 'Northwind', personal: false, action: 'add', kind: 'requirement', text: 'Send Northwind prices only through their procurement portal, never by email.', createdAt: minutesAgo(130) },
  { id: 'w2', assistant: 'ChatGPT', spaceId: 'personal', space: 'Personal', personal: true, action: 'change', kind: 'preference', text: 'Keep answers short, with the most important point first.', createdAt: minutesAgo(25) },
  { id: 'w6', assistant: 'Claude', spaceId: 'northwind', space: 'Northwind', within: 'Acme', personal: false, action: 'add', kind: 'requirement', text: 'Copy the CFO on every invoice to Northwind.', request: { by: 'Cara Lund', yours: false, sent: true }, createdAt: minutesAgo(10) },
];

export const manyWaiting: WaitingData[] = [
  ...sampleWaiting,
  { id: 'w3', assistant: 'Claude', spaceId: 'acme', space: 'Acme', personal: false, action: 'remove', kind: 'preference', text: 'Write status reports in Norwegian.', createdAt: minutesAgo(60 * 20) },
  { id: 'w4', assistant: 'Claude', spaceId: 'acme', space: 'Acme', personal: false, action: 'add', kind: 'preference', text: 'Name files with the date first, like 2026-10-19 Status.', createdAt: minutesAgo(60 * 30) },
  { id: 'w5', assistant: 'Claude', spaceId: 'website', space: 'Website', personal: false, action: 'add', kind: 'requirement', text: 'Check every page with a screen reader before it goes live.', createdAt: minutesAgo(60 * 50) },
];

const ana = { id: 'ana', name: 'Ana Berg', you: true };

export const sampleSpace: Record<'closed' | 'open' | 'root' | 'personal' | 'kitchen' | 'fromAbove', SpaceData> = {
  closed: {
    ...sampleSpaces[2],
    path: [{ id: 'acme', name: 'Acme' }],
    reachedFromAbove: false,
    members: [
      { ...ana, admin: true, member: true, through: null },
      { id: 'gunnar', name: 'Gunnar Holm', admin: false, member: true, through: null, you: false },
    ],
  },
  open: {
    ...sampleSpaces[3],
    path: [{ id: 'acme', name: 'Acme' }],
    reachedFromAbove: false,
    members: [
      { ...ana, admin: true, member: false, through: 'Acme' },
      { id: 'cara', name: 'Cara Lund', admin: false, member: true, through: 'Acme', you: false },
      { id: 'eli', name: 'Eli Sand', admin: false, member: true, through: null, you: false },
      { id: 'jon', name: 'Jon Dahl', admin: false, member: false, through: 'Acme', you: false },
    ],
  },
  root: {
    ...sampleSpaces[0],
    path: [],
    reachedFromAbove: false,
    members: [
      { ...ana, admin: true, member: true, through: null },
      { id: 'cara', name: 'Cara Lund', admin: false, member: true, through: null, you: false },
      { id: 'jon', name: 'Jon Dahl', admin: true, member: true, through: null, you: false },
    ],
  },
  personal: { ...sampleSpaces[1], path: [], reachedFromAbove: false, members: [] },
  kitchen: { ...sampleSpaces[4], path: [{ id: 'personal', name: 'Personal' }], reachedFromAbove: false, members: [] },
  fromAbove: {
    ...sampleSpaces[3],
    parentId: null,
    admin: false,
    path: [],
    reachedFromAbove: true,
    members: [
      { id: 'cara', name: 'Cara Lund', admin: true, member: true, through: null, you: false },
      { id: 'eli', name: 'Eli Sand', admin: false, member: true, through: null, you: true },
    ],
  },
};

// The rules Ana's assistant gets in Northwind, from least to most specific, as the server lists them.
export const sampleRules: RuleData[] = [
  { id: 'r1', spaceId: 'personal', spaceName: 'Personal', personal: true, kind: 'preference', text: 'Keep answers short, with the most important point first.', shared: false, onlyHere: false },
  { id: 'r2', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'requirement', text: 'Never name other clients in documents for a client.', shared: true, onlyHere: false },
  { id: 'r3', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'preference', text: 'Write status reports in English.', shared: true, onlyHere: false },
  { id: 'r4', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'preference', text: 'Put the date first in file names.', shared: false, onlyHere: false },
  { id: 'r5', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'requirement', text: 'Send Northwind prices only through their procurement portal, never by email.', shared: true, onlyHere: false },
  { id: 'r6', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'preference', text: 'Write Northwind’s status reports in Norwegian.', shared: true, onlyHere: true },
  { id: 'r7', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'preference', text: 'Call Gunnar before sending anything big.', shared: false, onlyHere: false },
];

export const sampleSkills: SkillSummary[] = [
  { id: 's1', name: 'estimate', description: 'Estimates work in days, with a range and what it depends on.', spaceId: 'acme', spaceName: 'Acme', shared: true, used: true, others: [] },
  { id: 's2', name: 'status-report', description: 'The weekly status report for Northwind, in their template and in Norwegian.', spaceId: 'northwind', spaceName: 'Northwind', shared: true, used: true, others: [{ id: 's3', spaceName: 'Acme' }] },
  { id: 's3', name: 'status-report', description: 'The weekly status report Acme sends every client.', spaceId: 'acme', spaceName: 'Acme', shared: true, used: false, others: [{ id: 's2', spaceName: 'Northwind' }] },
];

export const sampleSkill: SkillData = {
  id: 's2',
  name: 'status-report',
  description: 'The weekly status report for Northwind, in their template and in Norwegian.',
  spaceId: 'northwind',
  spaceName: 'Northwind',
  shared: true,
  instructions: 'Write the report every Friday from what happened this week.\n\n1. What was done, in at most three points.\n2. What is next, with dates.\n3. Risks, each with who owns it.\n\nUse the template in template.md, and write it in Norwegian.',
  files: [{ path: 'template.md', body: '# Statusrapport uke {uke}\n\n## Gjort\n\n## Neste\n\n## Risiko\n' }],
  replaces: [{ id: 's3', spaceName: 'Acme' }],
};

// Years in: about a hundred spaces, most of them Acme's clients and their projects.
const clientNames = ['Northwind', 'Fjord Bank', 'Nordlys Energi', 'Havbris', 'Polar Freight', 'Granitt Bygg', 'Skog & Co', 'Bølge Media', 'Elv Health', 'Furu Retail', 'Isbre Insurance', 'Lynx Logistics', 'Mjøsa Foods', 'Nesna Shipping', 'Oslo Opera', 'Pine Analytics', 'Ravn Security', 'Solberg Hotels', 'Tinde Outdoor', 'Utsikt Travel', 'Vann Utilities', 'Westfjord Fisheries', 'Yr Weather', 'Zenit Telecom', 'Aurora Pharma', 'Birk Schools', 'Corvus Air', 'Dovre Rail', 'Eik Furniture', 'Fonn Water', 'Gran Paper', 'Hav Aquaculture', 'Ild Foods', 'Jotun Paints', 'Kyst Bank', 'Lomen Hydro', 'Myra Farms', 'Norne Mining', 'Odda Steel'];
export const manySpaces: SpaceSummary[] = [
  ...sampleSpaces.filter((space) => space.id !== 'northwind' && space.id !== 'website'),
  ...clientNames.flatMap((name, index): SpaceSummary[] => [
    { id: `client-${index}`, name, parentId: 'acme', closed: index % 3 === 0, personal: false, private: false, admin: true },
    ...['Website', 'Data platform', 'Brand refresh'].slice(0, index % 4).map((project) => ({
      id: `client-${index}-${project}`, name: project, parentId: `client-${index}`, closed: false, personal: false, private: false, admin: true,
    })),
  ]),
];

// Ana looks after Acme's Homing.
export const sampleAdmin: AdminData = {
  host: 'homing.acme.no',
  email: { sends: true, from: 'Homing <homing@acme.no>' },
  people: [
    { name: 'Ana Berg', email: 'ana@acme.no', joinedAt: '2026-10-14T09:00:00Z', you: true },
    { name: 'Cara Lund', email: 'cara@acme.no', joinedAt: '2026-10-15T08:30:00Z', you: false },
    { name: 'Jon Dahl', email: 'jon@acme.no', joinedAt: '2026-10-15T11:10:00Z', you: false },
    { name: 'Eli Sand', email: 'eli@sand.studio', joinedAt: '2026-10-17T14:45:00Z', you: false },
  ],
};

// Cara asks Claude for a rule in Northwind, a client space only its admins change the rules of.
export const requestProposal: ProposalData = {
  ...proposal,
  space: 'Northwind',
  within: 'Acme',
  kind: 'requirement',
  text: 'Copy the CFO on every invoice to Northwind.',
  request: { by: null, yours: true, why: 'Their CFO asked for it at Monday’s meeting.', sent: false, admins: ['Ana Berg', 'Jon Dahl'] },
  alreadyApplies: [{ kind: 'requirement', text: 'Send Northwind prices only through their procurement portal.', from: 'Northwind' }],
};

// Requests Ana sent to admins of spaces she's a member of.
export const sampleRequests: RequestData[] = [
  { id: 'r1', space: 'Website', within: 'Fonn Water', action: 'add', kind: 'requirement', text: 'Check every page with a screen reader before it goes live.', state: 'requested', requestedAt: minutesAgo(90), emailed: true, admins: ['Jon Dahl', 'Mia Bakke'], decidedBy: null },
  { id: 'r2', space: 'Berg family', within: null, action: 'change', kind: 'preference', text: 'Plan holidays a year ahead.', state: 'approved', requestedAt: minutesAgo(60 * 30), emailed: true, admins: ['Ola Berg'], decidedBy: 'Ola Berg' },
];

const daysAgo = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();

/** Northwind's pages, as Ana sees them. */
export const samplePages: PagesData = {
  total: 1240,
  all: 1240,
  types: [
    { type: 'meeting', count: 412 },
    { type: 'person', count: 268 },
    { type: 'decision', count: 151 },
    { type: 'project', count: 37 },
  ],
  pages: [
    { id: '7d1c2a40-0000-4000-8000-000000000001', type: 'project', title: 'Website relaunch', excerpt: 'Northwind’s public website is being rebuilt with a new design system and a **booking flow**, so customers can book service appointments online.', updatedAt: daysAgo(0, 5), onlyYou: false, gathers: 3 },
    { id: '7d1c2a40-0000-4000-8000-000000000002', type: 'person', title: 'Gunnar Holm', excerpt: 'Head of digital at Northwind, and our main contact for the relaunch.', updatedAt: daysAgo(0, 9), onlyYou: false, gathers: 0 },
    { id: '7d1c2a40-0000-4000-8000-000000000003', type: null, title: 'Pricing thoughts before the renewal', excerpt: 'They will push for a lower day rate. Start at 1,450 and settle at 1,350 at the lowest.', updatedAt: daysAgo(1), onlyYou: true, gathers: 0 },
    { id: '7d1c2a40-0000-4000-8000-000000000004', type: 'decision', title: 'Launch moved to November 14', excerpt: 'Decided at the steering group: the launch moves two weeks, to November 14, so the booking flow can be tested properly.', updatedAt: daysAgo(3), onlyYou: false, gathers: 0 },
    { id: '7d1c2a40-0000-4000-8000-000000000005', type: 'meeting', title: 'Steering group, October 9', excerpt: '- Design is signed off\n- Content is late\n- Next meeting October 23', updatedAt: daysAgo(11), onlyYou: false, gathers: 0 },
    { id: '7d1c2a40-0000-4000-8000-000000000006', type: 'person', title: 'Marte Lunde', excerpt: 'Marte works on the payment provider at Northwind.', updatedAt: daysAgo(40), onlyYou: false, gathers: 0 },
  ],
};

/** A page with a little of everything: an update only Ana sees, a correction, sources and Markdown. */
export const samplePage: PageData = {
  id: '7d1c2a40-0000-4000-8000-000000000001',
  title: 'Website relaunch',
  type: 'project',
  shared: true,
  updatedAt: daysAgo(0, 5),
  gathers: 3,
  collections: [{ id: '7d1c2a40-0000-4000-8000-000000000010', title: '2026 renewal', shared: true }, { id: '7d1c2a40-0000-4000-8000-000000000011', title: 'Things to raise with Gunnar', shared: false }],
  mentionedOn: [{ id: '7d1c2a40-0000-4000-8000-000000000005', title: 'Steering group, October 9' }],
  space: { id: 'northwind', name: 'Northwind', personal: false, private: false, people: 4 },
  items: [
    {
      id: 'item-1', text: 'Northwind’s public website is being rebuilt with a new design system and a **booking flow**, so customers can book service appointments online. Acme designs and builds it; Northwind’s own team writes the content.',
      shared: true, by: { name: 'Cara Lund', you: false }, agent: 'Claude', writtenAt: daysAgo(30),
      sources: [{ id: 'source-1', reference: 'Kickoff deck, September 2', excerpt: 'Goal: customers book service appointments online. Acme: design and build. Northwind: content.' }],
      replaced: null, earlier: [],
    },
    {
      id: 'item-2', text: 'The launch is planned for **November 20**.',
      shared: false, by: { name: 'Ana Berg', you: true }, agent: null, writtenAt: daysAgo(0, 5),
      sources: [{ id: 'source-2', reference: 'Call with Gunnar, October 16', excerpt: 'Gunnar wants another week for content. New launch date November 20, but he hasn’t told his team yet.' }],
      replaced: { text: 'The launch is planned for **November 14**.', shared: true, until: daysAgo(0, 5) }, earlier: [],
    },
    {
      id: 'item-3', text: 'Status: design is signed off and development is under way.',
      shared: true, by: { name: 'Gunnar Holm', you: false }, agent: null, writtenAt: daysAgo(4),
      sources: [], replaced: null,
      earlier: [{ text: 'Status: design is waiting for sign-off.', by: { name: 'Gunnar Holm', you: false }, agent: null, writtenAt: daysAgo(20), until: daysAgo(4) }],
    },
    {
      id: 'item-4', text: '## Who does what\n\n- **Gunnar Holm** leads the project at Northwind. See [Gunnar Holm](page:7d1c2a40-0000-4000-8000-000000000002).\n- Cara Lund runs design at Acme.\n- Jon Dahl builds the booking flow.',
      shared: true, by: { name: 'Cara Lund', you: false }, agent: null, writtenAt: daysAgo(12),
      sources: [], replaced: null, earlier: [],
    },
    {
      id: 'item-5', text: 'Gunnar wants a call before anything about scope goes in writing.',
      shared: false, by: { name: 'Ana Berg', you: true }, agent: 'Claude', writtenAt: daysAgo(2),
      sources: [{ id: 'source-3', reference: 'Teams chat with Gunnar', excerpt: 'Can we talk before you send anything on scope? I’d rather not have it in writing yet.' }],
      replaced: null, earlier: [],
    },
  ],
};

/** Northwind's sources, as Ana sees them. */
export const sampleSources: SourcesData = {
  total: 12_400,
  all: 12_400,
  sources: [
    { id: 'source-2', reference: 'Call with Gunnar, October 16', excerpt: 'Gunnar wants another week for content. New launch date November 20, but he hasn’t told his team yet.', createdAt: daysAgo(0, 5), onlyYou: true, pages: 1 },
    { id: 'source-4', reference: 'Steering group notes, October 9', excerpt: 'Design is signed off. Content is late, and Northwind’s team asks for help with the booking texts.', createdAt: daysAgo(11), onlyYou: false, pages: 0 },
    { id: 'source-1', reference: 'Kickoff deck, September 2', excerpt: 'Goal: customers book service appointments online. Acme: design and build. Northwind: content.', createdAt: daysAgo(48), onlyYou: false, pages: 2 },
  ],
};

/** A source a page rests on, with an item only Ana sees using it too. */
export const sampleSource: SourceData = {
  id: 'source-1',
  reference: 'Kickoff deck, September 2',
  excerpt: 'Goal: customers book service appointments online.\nAcme: design and build.\nNorthwind: content, and the booking texts.',
  shared: true,
  keptAt: daysAgo(48),
  by: { name: 'Cara Lund', you: false },
  agent: 'Claude',
  space: { id: 'northwind', name: 'Northwind', personal: false, private: false },
  pages: [
    { id: samplePage.id, title: 'Website relaunch', items: [{ id: 'item-1', text: samplePage.items[0].text, shared: true }] },
    { id: '7d1c2a40-0000-4000-8000-000000000003', title: 'Pricing thoughts before the renewal', items: [{ id: 'item-9', text: 'The booking flow is the part they care most about, so it carries the price.', shared: false }] },
  ],
};

/** The pages the sample collection gathers. */
export const sampleGathered: PagesData = {
  total: 3,
  all: 1180,
  types: [],
  pages: [
    { id: '7d1c2a40-0000-4000-8000-000000000004', type: 'decision', title: 'Launch moved to November 14', excerpt: 'Decided at the steering group: the launch moves two weeks, to November 14.', updatedAt: daysAgo(3), onlyYou: false, gathers: 0, gatheredShared: true },
    { id: '7d1c2a40-0000-4000-8000-000000000003', type: null, title: 'Pricing thoughts before the renewal', excerpt: 'They will push for a lower day rate.', updatedAt: daysAgo(1), onlyYou: true, gathers: 0, gatheredShared: false },
    { id: '7d1c2a40-0000-4000-8000-000000000005', type: 'meeting', title: 'Steering group, October 9', excerpt: '- Design is signed off\n- Content is late', updatedAt: daysAgo(11), onlyYou: false, gathers: 0, gatheredShared: true },
  ],
};
