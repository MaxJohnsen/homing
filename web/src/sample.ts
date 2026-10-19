import type { AccountData } from '@/screens/account';
import type { AdminData } from '@/screens/admin';
import type { ProposalData, WaitingData } from '@/lib/proposals';
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
