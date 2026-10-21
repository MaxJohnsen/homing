import type { AccountData } from '@/screens/account';
import type { ChangeData, OverviewData, PageData, PagesData, SourceData, SourcesData } from '@/lib/knowledge';
import type { SearchData } from '@/lib/search';
import type { AdminData } from '@/screens/admin';
import type { ProposalData, RequestData, WaitingData } from '@/lib/proposals';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import type { IncludableData, IncludeSummary, RuleData, SkillData, SkillSummary, WaitingSkill } from '@/lib/guidance';

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
  { id: 'rebrand', name: 'Rebrand 2025', parentId: 'acme', closed: false, personal: false, private: false, admin: true, archived: true },
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
  { id: 'w7', assistant: 'Claude', spaceId: 'kitchen', space: 'Kitchen renovation', personal: false, action: 'plan', kind: 'preference', text: null, changes: 5, createdAt: minutesAgo(60 * 52) },
  { id: 'w8', assistant: 'Claude', spaceId: 'acme', space: 'Acme', personal: false, action: 'plan', kind: 'preference', text: 'Intranet', changes: 2, createdAt: minutesAgo(60 * 54) },
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
// Acme includes the company's security rules for everyone, and Northwind includes Standards for
// everyone and Ana's own writing rules for her.
export const sampleRules: RuleData[] = [
  { id: 'r1', spaceId: 'personal', spaceName: 'Personal', personal: true, kind: 'preference', text: 'Keep answers short, with the most important point first.', shared: false, onlyHere: false },
  { id: 'r8', spaceId: 'security', spaceName: 'Security', personal: false, kind: 'requirement', text: 'Lock your screen when you leave your desk.', shared: true, onlyHere: false, includedIn: { id: 'i0', spaceId: 'acme', spaceName: 'Acme', shared: true } },
  { id: 'r2', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'requirement', text: 'Never name other clients in documents for a client.', shared: true, onlyHere: false },
  { id: 'r3', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'preference', text: 'Write status reports in English.', shared: true, onlyHere: false },
  { id: 'r4', spaceId: 'acme', spaceName: 'Acme', personal: false, kind: 'preference', text: 'Put the date first in file names.', shared: false, onlyHere: false },
  { id: 'r9', spaceId: 'standards', spaceName: 'Standards', personal: false, kind: 'preference', text: 'Write dates as 1 March 2027.', shared: true, onlyHere: false, includedIn: { id: 'i1', spaceId: 'northwind', spaceName: 'Northwind', shared: true } },
  { id: 'r10', spaceId: 'standards', spaceName: 'Standards', personal: false, kind: 'requirement', text: 'Send invoices only from the finance system.', shared: true, onlyHere: false, includedIn: { id: 'i1', spaceId: 'northwind', spaceName: 'Northwind', shared: true } },
  { id: 'r11', spaceId: 'writing', spaceName: 'Writing', personal: false, kind: 'preference', text: 'Use plain words, and explain any term the reader may not know.', shared: false, onlyHere: false, includedIn: { id: 'i2', spaceId: 'northwind', spaceName: 'Northwind', shared: false } },
  { id: 'r5', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'requirement', text: 'Send Northwind prices only through their procurement portal, never by email.', shared: true, onlyHere: false },
  { id: 'r6', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'preference', text: 'Write Northwind’s status reports in Norwegian.', shared: true, onlyHere: true },
  { id: 'r7', spaceId: 'northwind', spaceName: 'Northwind', personal: false, kind: 'preference', text: 'Call Gunnar before sending anything big.', shared: false, onlyHere: false },
];

// What Northwind includes, as its Rules lists them: Standards for everyone, and Ana's writing rules for her.
export const sampleIncludes: IncludeSummary[] = [
  { id: 'i1', spaceId: 'standards', spaceName: 'Standards', shared: true },
  { id: 'i2', spaceId: 'writing', spaceName: 'Writing', shared: false },
  { id: 'i4', spaceId: null, spaceName: null, shared: true, addedBy: 'Jon Dahl', addedAt: '2026-10-12T10:00:00+02:00' },
  { id: 'i6', spaceId: 'standards', spaceName: 'Standards', shared: false, waiting: true },
];

// Ana's own include of a skill Northwind also includes for everyone.
export const sampleWaitingSkills: WaitingSkill[] = [{ id: 'i7', name: 'invoice', spaceName: 'Standards' }];

// A skill Northwind includes for everyone that Ana, an admin, can't open.
export const sampleHiddenSkills: IncludeSummary[] = [{ id: 'i5', spaceId: null, spaceName: null, shared: true, addedBy: 'Jon Dahl', addedAt: '2026-10-12T10:00:00+02:00' }];

// What Ana could include in Northwind.
export const sampleIncludable: IncludableData = {
  spaces: [
    { id: 'security', name: 'Security', label: 'Security', onlyYours: false },
    { id: 'website', name: 'Website', label: 'Website, in Acme', onlyYours: false },
    { id: 'writing', name: 'Writing', label: 'Writing, in your personal space', onlyYours: true },
  ],
  skills: [
    { id: 's4', name: 'invoice', description: 'How invoices go out from the finance system.', from: 'Standards', onlyYours: false },
    { id: 's5', name: 'blog-post', description: 'Ana’s way of drafting a blog post.', from: 'Writing, in your personal space', onlyYours: true },
  ],
};

export const sampleSkills: SkillSummary[] = [
  { id: 's1', name: 'estimate', description: 'Estimates work in days, with a range and what it depends on.', spaceId: 'acme', spaceName: 'Acme', shared: true, used: true, others: [] },
  { id: 's4', name: 'invoice', description: 'How invoices go out from the finance system.', spaceId: 'standards', spaceName: 'Standards', shared: true, used: true, others: [], includedIn: { id: 'i3', spaceId: 'northwind', spaceName: 'Northwind', shared: true } },
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

// Claude proposes including the company's Standards in Acme, for everyone there.
export const includeProposal: ProposalData = {
  ...proposal,
  action: 'include',
  included: 'rules',
  text: null,
  shared: true,
  alreadyApplies: [],
  include: {
    open: true,
    space: { id: 'standards', name: 'Standards' },
    rules: [
      { kind: 'requirement', text: 'Send invoices only from the finance system.', yours: false },
      { kind: 'preference', text: 'Write dates as 1 March 2027.', yours: false },
      { kind: 'preference', text: 'Ana signs off with her first name.', yours: true },
    ],
    skill: null,
    current: true,
    shown: 'sample',
  },
};

// Claude proposes including a skill from Standards in Acme.
export const includeSkillProposal: ProposalData = {
  ...includeProposal,
  included: 'skill',
  include: { ...includeProposal.include!, space: null, rules: [], skill: { pageId: 's4', name: 'invoice', description: 'How invoices go out from the finance system.', from: 'Standards' } },
};

// Claude proposes no longer including Standards in Acme.
export const excludeProposal: ProposalData = { ...includeProposal, action: 'exclude' };

// Cara asks to stop including a space Jon, an admin, can't open: he learns nothing of it, and can approve it.
export const closedExcludeProposal: ProposalData = {
  ...includeProposal,
  action: 'exclude',
  state: 'requested',
  request: { by: 'Cara Lund', yours: false, why: 'Those rules don’t fit this client.', sent: true, admins: ['Ana Berg', 'Jon Dahl'] },
  include: { open: false, space: null, rules: [], skill: null, current: true, shown: 'include:sample' },
};

// Cara asks to include a space Jon, an admin, can't open: he learns nothing of it, and can only decline.
export const closedIncludeProposal: ProposalData = {
  ...includeProposal,
  state: 'requested',
  request: { by: 'Cara Lund', yours: false, why: 'Clients get the same rules as us.', sent: true, admins: ['Ana Berg', 'Jon Dahl'] },
  include: { open: false, space: null, rules: [], skill: null, current: true, shown: '' },
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
  space: { id: 'northwind', name: 'Northwind', personal: false, private: false, people: 4, above: false },
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

/** What a search for "launch" finds for Ana. */
export const sampleSearch: SearchData = {
  spaces: [{ id: 'website', name: 'Website', within: 'Acme' }],
  pages: [
    { id: samplePage.id, title: 'Website relaunch', type: 'project', text: 'The launch is planned for **November 20**.', onlyYou: true, superseded: false, updatesShared: true, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } },
    { id: '7d1c2a40-0000-4000-8000-000000000004', title: 'Launch moved to November 14', type: 'decision', text: null, onlyYou: false, superseded: false, updatesShared: false, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } },
  ],
  rules: [{ id: 'rule-1', text: 'Never announce a launch date before the client does.', kind: 'requirement', onlyYou: false, space: { id: 'acme', name: 'Acme', within: null } }],
  skills: [{ id: 'skill-1', name: 'launch-checklist', onlyYou: false, space: { id: 'acme', name: 'Acme', within: null } }],
  sources: [{ id: 'source-2', reference: 'Call with Gunnar, October 16', excerpt: 'New launch date November 20, but he hasn’t told his team yet.', onlyYou: true, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } }],
};

/** What changed lately in Ana's spaces. */
export const sampleChanges: ChangeData[] = [
  { itemId: 'c1', pageId: '7d1c2a40-0000-4000-8000-000000000002', title: 'Gunnar Holm', text: 'Becomes CTO on November 1. Marte takes over day-to-day content questions.', kind: 'added', newPage: false, by: { name: 'Cara Lund', you: false }, agent: 'Claude', at: daysAgo(0, 3), onlyYou: false, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } },
  { itemId: 'c2', pageId: '7d1c2a40-0000-4000-8000-000000000004', title: 'Launch moved to November 14', text: 'Decided at the steering group on October 9: the launch moves from November 1 to November 14, so the booking flow gets two more weeks of testing.', kind: 'added', newPage: true, by: { name: 'Ana Berg', you: true }, agent: 'Claude', at: daysAgo(1), onlyYou: false, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } },
  { itemId: 'c3', pageId: '7d1c2a40-0000-4000-8000-000000000001', title: 'Website relaunch', text: 'The launch is planned for **November 20**.', kind: 'updated', newPage: false, by: { name: 'Ana Berg', you: true }, agent: null, at: daysAgo(1, 4), onlyYou: true, space: { id: 'northwind', name: 'Northwind', within: 'Acme' } },
  { itemId: 'c4', pageId: '7d1c2a40-0000-4000-8000-000000000006', title: 'Fjord Bank app', text: 'Version 3.2 goes to the App Store on October 28.', kind: 'corrected', newPage: false, by: { name: 'Tore Vik', you: false }, agent: null, at: daysAgo(4), onlyYou: false, space: { id: 'fjord', name: 'Fjord Bank', within: null } },
];

/** What changed with archived spaces and pages included: a late note in a finished project, and one on an archived page. */
export const sampleChangesWithArchived: ChangeData[] = [
  sampleChanges[0],
  { itemId: 'c6', pageId: '7d1c2a40-0000-4000-8000-000000000008', title: 'Old print vendor', text: 'Trykkeriet AS closed in 2026.', kind: 'added', newPage: false, by: { name: 'Cara Lund', you: false }, agent: null, at: daysAgo(0, 5), onlyYou: false, pageArchived: true, space: { id: 'acme', name: 'Acme', within: null } },
  { itemId: 'c5', pageId: '7d1c2a40-0000-4000-8000-000000000007', title: 'Wrap-up', text: 'Final invoice paid on October 12. Nothing left open.', kind: 'added', newPage: false, by: { name: 'Tore Vik', you: false }, agent: null, at: daysAgo(0, 6), onlyYou: false, space: { id: 'summer', name: 'Summer campaign', within: 'Acme', archived: true } },
  ...sampleChanges.slice(1),
];

/** Northwind at a glance, with Ana's own overview over the shared one. */
export const sampleOverview: OverviewData = {
  overview: [
    { id: 'o1', text: 'Northwind’s website relaunch is in testing. The launch moved to **November 20**, and Gunnar wants to talk before anything about scope goes in writing.', shared: false, by: { name: 'Ana Berg', you: true }, agent: 'Claude', writtenAt: daysAgo(0, 4), replacesShared: 'Northwind’s website relaunch is in testing. The launch is planned for November 14.' },
  ],
  active: samplePages.pages.slice(0, 4),
  pages: 1240,
  collections: samplePages.pages.filter((page) => page.gathers > 0),
  decisions: samplePages.pages.filter((page) => page.type === 'decision'),
  waiting: [{ id: 'w1', action: 'add rule', kind: 'requirement', text: 'Copy the CFO on every invoice to Northwind.', assistant: 'Claude', request: { by: 'Cara Lund', yours: false, sent: true } }],
  spaces: [{ id: 'website', name: 'Website', closed: false }, { id: 'app', name: 'Booking app', closed: true }],
};

/** A space Claude suggests on its own, for the person to change and create, or decline. */
export const suggestedSpace: ProposalData = {
  ...proposal,
  id: 'suggested-space',
  space: 'Personal',
  personal: true,
  action: 'space',
  text: null,
  shared: false,
  alreadyApplies: [],
  suggestion: {
    name: 'Home renovation',
    who: 'just me',
    in: null,
    closed: false,
    asked: false,
    why: 'You’ve been planning the kitchen and bathroom across several conversations. A space keeps the quotes, dates and decisions together.',
    places: [
      { id: 'personal', label: 'Your personal space', name: 'Personal', mine: true, personal: true },
      { id: 'kitchen', label: 'Kitchen, in your personal space', name: 'Kitchen', mine: true, personal: false },
      { id: 'acme', label: 'Acme', name: 'Acme', mine: false, personal: false },
      { id: 'northwind', label: 'Northwind, in Acme', name: 'Northwind', mine: false, personal: false },
    ],
    created: null,
  },
};

/** Claude proposes adding someone to Acme, by name. */
export const memberProposal: ProposalData = {
  ...proposal,
  id: 'member',
  action: 'members',
  text: null,
  alreadyApplies: [],
  member: { change: 'add', name: 'Cara Lund', email: 'cara@acme.example', found: true },
};

/** Claude proposes sharing something Ana learned from an email with everyone in Acme. */
export const publishProposal: ProposalData = {
  ...proposal,
  id: 'publish',
  action: 'publish',
  text: null,
  alreadyApplies: [],
  publication: {
    text: 'The launch moves to 14 November, in Oslo. Gunnar confirmed the venue on Friday.',
    page: 'Website launch',
    pageId: 'launch',
    hidden: [{ space: null, reference: 'Email from Gunnar, Re: launch' }],
    hiddenUnseen: 0,
    copy: true,
    sharesTitle: false,
    sharedText: null,
    current: true,
    why: 'Cara plans the launch too.',
    audience: { people: 5, above: false },
  },
};

/** Claude proposes sharing Ana's kitchen renovation with others, at her request. */
export const convertProposal: ProposalData = {
  ...proposal,
  id: 'convert',
  action: 'convert',
  space: 'Kitchen renovation',
  personal: false,
  within: 'your personal space',
  text: null,
  alreadyApplies: [],
  conversion: {
    rulesLeaving: [
      { kind: 'requirement', text: 'Get three quotes for anything over 50,000.', from: 'Berg family', elsewhere: true },
      { kind: 'preference', text: 'Keep answers short, with the most important point first.', from: 'Home' },
    ],
    skillsLeaving: [],
    places: [{ id: 'family', name: 'Berg family', label: 'Berg family', people: 4, above: false }],
    why: 'Jonas should see the quotes and the plan too.',
  },
};

/** Claude suggests archiving Acme's finished rebrand. */
export const archiveProposal: ProposalData = {
  ...proposal,
  id: 'archive',
  action: 'archive',
  space: 'Rebrand 2025',
  within: 'Acme',
  text: null,
  alreadyApplies: [],
  archive: { spaces: 2, private: false, archived: false, why: 'The new brand launched on 1 October, and nothing has happened there since.' },
};

/** Claude suggests archiving a page others in Acme see, which waits for Ana. */
export const pageArchiveProposal: ProposalData = {
  ...proposal,
  id: 'page-archive',
  action: 'archive page',
  space: 'Acme',
  within: null,
  text: null,
  alreadyApplies: [],
  page: {
    id: '7d1c2a40-0000-4000-8000-000000000006',
    title: 'Old print vendor',
    archived: false,
    shared: true,
    stands: true,
    shown: 'Old print vendor\n',
    asked: false,
    why: 'Trykkeriet AS closed in 2026, and the brochures moved to Grafisk Hus.',
  },
};

/** Claude proposes sharing one of Ana's tasks with everyone in Acme. */
export const taskProposal: ProposalData = {
  ...proposal,
  id: 'task',
  action: 'task',
  text: null,
  alreadyApplies: [],
  task: {
    title: 'Book the venue for the launch',
    description: 'Two options: Hotel Bristol or the Opera foyer.',
    due: '2026-11-03',
    done: false,
    shared: false,
    shown: 'Book the venue for the launch\n2026-11-03\nTwo options: Hotel Bristol or the Opera foyer.',
    why: 'Cara can pick it up if I don’t get to it.',
    audience: { people: 5, above: false },
  },
};

/**
 * The kitchen story: Ana asked Claude to set up the kitchen renovation, put what they know in it
 * and add Jonas. The space is hers alone so far, so Claude created it at once and kept what it knew
 * there; the rest waits for her as one plan.
 */
export const planProposal: ProposalData = {
  ...proposal,
  id: 'plan',
  action: 'plan',
  space: 'Kitchen renovation',
  text: null,
  alreadyApplies: [{ kind: 'preference', text: 'Write in Norwegian.', from: 'your personal space' }],
  plan: {
    create: null,
    space: 'Kitchen renovation',
    spaceId: 'kitchen',
    steps: [
      {
        action: 'publish',
        publication: {
          text: 'Byggmester AS quoted NOK 180,000 for the whole kitchen, including demolition.',
          page: 'Contractor quotes',
          pageId: 'quotes',
          hidden: [{ space: null, reference: 'Email from Byggmester AS, 3 October' }],
          hiddenUnseen: 0,
          copy: true,
          sharesTitle: true,
          sharedText: null,
          current: true,
          why: null,
          audience: null,
        },
        item: { text: 'Byggmester AS quoted NOK 180,000 for the whole kitchen, including demolition.', page: 'Contractor quotes', pageId: 'quotes' },
        task: null,
        member: null,
        rule: null,
        problem: null,
      },
      {
        action: 'publish',
        publication: {
          text: 'Demolition starts 2 November, and the new kitchen is in by 20 December.',
          page: 'Timeline',
          pageId: 'timeline',
          hidden: [],
          hiddenUnseen: 0,
          copy: false,
          sharesTitle: true,
          sharedText: null,
          current: true,
          why: null,
          audience: null,
        },
        item: { text: 'Demolition starts 2 November, and the new kitchen is in by 20 December.', page: 'Timeline', pageId: 'timeline' },
        task: null,
        member: null,
        rule: null,
        problem: null,
      },
      { action: 'task', publication: null, item: null, task: { title: 'Order the tiles', description: null, due: '2026-11-10' }, member: null, rule: null, problem: null },
      { action: 'members', publication: null, item: null, task: null, member: { change: 'add', name: 'Jonas Holm', email: null, found: true, inSpace: false, through: null }, rule: null, problem: null },
      { action: 'add', publication: null, item: null, task: null, member: null, rule: { kind: 'requirement', text: 'Get every quote in writing.', now: null, shared: true, onlyHere: false }, problem: null },
    ],
    audience: { people: 1, above: false, adding: ['Jonas Holm'] },
    sees: { pages: 2, archived: 0, tasks: 1, rules: 1, included: [{ from: 'Home', rules: 1 }], elsewhere: true, spaces: 0 },
    why: 'Jonas is helping with the kitchen.',
    shown: '[]',
  },
};

/** A plan that creates a space everyone in Home would see, with a rule and Jonas in it. */
export const newSpacePlanProposal: ProposalData = {
  ...planProposal,
  id: 'plan-new',
  space: 'Home',
  alreadyApplies: [],
  plan: {
    ...planProposal.plan!,
    create: { name: 'Kitchen', in: 'Home', people: 3, above: false, problem: null },
    space: 'Kitchen',
    spaceId: null,
    steps: [planProposal.plan!.steps[4], planProposal.plan!.steps[3]],
    audience: { people: 3, above: false, adding: ['Jonas Holm'] },
    sees: { pages: 0, archived: 0, tasks: 0, rules: 2, spaces: 0 },
    why: null,
  },
};

/** The kitchen plan after Ana shared the quote herself, so it can't be approved as it is. */
export const blockedPlanProposal: ProposalData = {
  ...planProposal,
  id: 'plan-blocked',
  plan: {
    ...planProposal.plan!,
    steps: [{ ...planProposal.plan!.steps[0], publication: null, problem: 'It’s shared already.' }, ...planProposal.plan!.steps.slice(1)],
  },
};

/** A space's tasks: Ana's own and the space's, open and done lately. */
export const sampleTasks = {
  open: [
    { id: 't1', title: 'Send Gunnar the revised budget', description: null, due: '2026-10-17', shared: true, assignee: { id: 'ana', name: 'Ana Berg', you: true }, done: null, agent: null },
    { id: 't2', title: 'Book the venue for the launch', description: 'Two options: Hotel Bristol or the Opera foyer.', due: '2026-11-03', shared: true, assignee: { id: 'cara', name: 'Cara Lund', you: false }, done: null, agent: null },
    { id: 't3', title: 'Follow up with Jon about the contract', description: null, due: null, shared: false, assignee: null, done: null, agent: 'Claude' },
  ],
  done: [{ id: 't4', title: 'Draft the launch plan', description: null, due: '2026-10-10', shared: true, assignee: null, done: { at: '2026-10-12T10:00:00+02:00', by: { name: 'Cara Lund', you: false } }, agent: null }],
};
