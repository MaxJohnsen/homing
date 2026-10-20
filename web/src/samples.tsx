import { useState, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { LoadFailed } from '@/components/screen';
import { Wordmark } from '@/components/wordmark';
import type { ProposalData } from '@/lib/proposals';
import type { RuleActions } from '@/lib/guidance';
import type { Route } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';
import { sampleChanges, sampleOverview, sampleGathered, sampleSearch, samplePage, samplePages, sampleSource, sampleSources, changeProposal, longProposal, requestProposal, sampleRequests, manySpaces, sampleAdmin, manyWaiting, personalProposal, proposal, removeProposal, sampleAccount, sampleRules, sampleSkill, sampleSkills, sampleSpace, sampleSpaces, sampleWaiting, suggestedSpace } from '@/sample';
import { Account } from '@/screens/account';
import { Admin, type MakeInvite } from '@/screens/admin';
import { CardPreview } from '@/screens/card-preview';
import { Confirm } from '@/screens/confirm';
import { Connect } from '@/screens/connect';
import { Home } from '@/screens/home';
import { Join } from '@/screens/join';
import { Landing } from '@/screens/landing';
import { Recover } from '@/screens/recover';
import { SignIn } from '@/screens/sign-in';
import { Rules, Skills } from '@/screens/guidance';
import { Page } from '@/screens/page';
import { Pages, type PageFilters } from '@/screens/pages';
import { Changes } from '@/screens/changes';
import { Overview } from '@/screens/overview';
import { Search } from '@/screens/search';
import { Source, Sources } from '@/screens/sources';
import { Skill } from '@/screens/skill';
import { NewSpace, type CreateSpace } from '@/screens/new-space';
import { Members, Space, SpaceSettings } from '@/screens/space';
import { Waiting } from '@/screens/waiting';

// Every screen with sample data, for `npm run dev:web`. Each state has its own address for review.
const screens: Record<string, { label: string; render: () => ReactNode }> = {
  '/landing': { label: 'Landing page', render: () => <Landing /> },
  '/sign-in': { label: 'Sign in', render: () => <SignIn /> },
  '/sign-in/providers': { label: 'Sign in, with Google and Microsoft set up', render: () => <SignIn providers={['google', 'microsoft']} /> },
  '/sign-in/connect': { label: 'Sign in to connect Claude', render: () => <SignIn connecting="Claude" /> },
  '/sign-in/passkey': { label: 'Sign in: passkey', render: () => <SignIn initial="passkey" email="ana@acme.no" /> },
  '/sign-in/password': { label: 'Sign in: password', render: () => <SignIn initial="password" email="ana@acme.no" /> },
  '/sign-in/wrong': { label: 'Sign in: wrong password', render: () => <SignIn initial="wrong" email="ana@acme.no" /> },
  '/setup': { label: 'Create the first account', render: () => <Join state={{ step: 'form', kind: 'setup' }} /> },
  '/setup/expired': { label: 'Setup link expired', render: () => <Join state={{ step: 'expired', kind: 'setup' }} /> },
  '/join': { label: 'Join with an invite', render: () => <Join state={{ step: 'form', kind: 'invite', invitedBy: 'Max Aasbø', email: 'ana@acme.no', passwords: true }} /> },
  '/join/taken': { label: 'Join: email already has an account', render: () => <Join state={{ step: 'form', kind: 'invite' }} problem={{ field: 'email', message: 'There is already an account with this email. Sign in instead.' }} /> },
  '/join/expired': { label: 'Invite expired', render: () => <Join state={{ step: 'expired', kind: 'invite' }} /> },
  '/join/signed-in': { label: 'Invite opened while signed in', render: () => <Join state={{ step: 'signed-in', email: 'ana@acme.no' }} /> },
  '/home': { label: 'Home, with changes waiting and your requests', render: () => <InApp waiting={3}><Home data={{ name: 'Ana Berg', waiting: sampleWaiting, assistants: 2, mcpUrl: sampleAccount.mcpUrl, requests: sampleRequests, changes: sampleChanges.slice(0, 3), moreChanges: true }} /></InApp> },
  '/home/many': { label: 'Home, with more waiting than it shows', render: () => <InApp waiting={5}><Home data={{ name: 'Ana Berg', waiting: manyWaiting, assistants: 2, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/home/quiet': { label: 'Home on a quiet day: what changed', render: () => <InApp waiting={0}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 2, mcpUrl: sampleAccount.mcpUrl, changes: sampleChanges, moreChanges: true }} /></InApp> },
  '/home/nothing': { label: 'Home, with nothing waiting and nothing changed', render: () => <InApp waiting={0}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 2, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/changes': { label: 'Everything that changed', render: () => <InApp route={{ name: 'changes' }}><Changes changes={sampleChanges} more from={0} onFrom={() => {}} /></InApp> },
  '/home/not-emailed': { label: 'Home, with a request the admins weren’t emailed about', render: () => <InApp waiting={0}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 2, mcpUrl: sampleAccount.mcpUrl, requests: [{ ...sampleRequests[0], emailed: false }] }} /></InApp> },
  '/home/new': { label: 'Home, just joined', render: () => <InApp waiting={0} spaces={sampleSpaces.filter((space) => space.personal)}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 0, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/home/many-spaces': { label: 'Years in, with a hundred spaces', render: () => <InApp waiting={30} spaces={manySpaces} recent={recentMany}><Home data={{ name: 'Ana Berg', waiting: manyWaiting, assistants: 2, mcpUrl: sampleAccount.mcpUrl }} recent={recentMany.map((id) => manySpaces.find((space) => space.id === id)!)} /></InApp> },
  '/spaces/many': { label: 'A space deep among a hundred', render: () => <InApp waiting={30} spaces={manySpaces} recent={recentMany} spaceId="client-14-Data platform"><Space space={{ ...sampleSpace.root, id: 'client-14-Data platform', name: 'Data platform', parentId: 'client-14', path: [{ id: 'acme', name: 'Acme' }, { id: 'client-14', name: 'Oslo Opera' }] }} view="members"><Members space={sampleSpace.root} /></Space></InApp> },
  '/waiting': { label: 'Everything waiting, by space', render: () => <InApp waiting={5} route={{ name: 'waiting' }}><Waiting waiting={manyWaiting} /></InApp> },
  '/spaces/overview': { label: 'A space’s overview, with your own over the shared one', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="overview"><Overview space={sampleSpace.closed} data={sampleOverview} write={notSaved} /></Space></InApp> },
  '/spaces/overview/none': { label: 'A space nobody has written an overview for', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="overview"><Overview space={sampleSpace.root} data={{ ...sampleOverview, overview: [], waiting: [], spaces: [] }} write={notSaved} /></Space></InApp> },
  '/spaces/overview/empty': { label: 'A new, empty space', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="overview"><Overview space={sampleSpace.root} data={{ overview: [], active: [], pages: 0, collections: [], decisions: [], waiting: [], spaces: [] }} write={notSaved} /></Space></InApp> },
  '/spaces/pages': { label: 'A space’s pages, years in', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="pages"><SamplePages /></Space></InApp> },
  '/spaces/pages/few': { label: 'A space with three pages', render: () => <InApp spaceId="website"><Space space={sampleSpace.open} view="pages"><SamplePages space={sampleSpace.open} data={{ ...samplePages, pages: samplePages.pages.slice(0, 3), total: 3, all: 3, types: [{ type: 'project', count: 1 }, { type: 'person', count: 1 }] }} /></Space></InApp> },
  '/spaces/pages/search': { label: 'Searching a space’s pages, with nothing found', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="pages"><SamplePages data={{ ...samplePages, pages: [], total: 0 }} filters={{ q: 'sauna', type: '', from: 0 }} /></Space></InApp> },
  '/spaces/pages/empty': { label: 'A space with no pages yet', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="pages"><SamplePages space={sampleSpace.root} data={{ pages: [], total: 0, all: 0, types: [] }} /></Space></InApp> },
  '/search': { label: 'Search, everything that matches', render: () => <InApp route={{ name: 'search' }}><SampleSearch /></InApp> },
  '/search/none': { label: 'Search, with nothing found', render: () => <InApp route={{ name: 'search' }}><Search data={{ spaces: [], pages: [], rules: [], skills: [], sources: [] }} query="sauna" kind="all" from={0} onKind={() => {}} onFrom={() => {}} /></InApp> },
  '/load-failed': { label: 'Something that didn’t load', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="pages"><LoadFailed paths={[]} /></Space></InApp> },
  '/spaces/sources': { label: 'A space’s sources', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="sources"><SampleSources /></Space></InApp> },
  '/spaces/sources/empty': { label: 'A space with no sources yet', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="sources"><Sources space={sampleSpace.root} data={{ sources: [], total: 0, all: 0 }} filters={{ q: '', type: '', from: 0 }} onFilters={() => {}} /></Space></InApp> },
  '/source': { label: 'A source, and the pages using it', render: () => <InApp spaceId="northwind"><Source source={sampleSource} /></InApp> },
  '/source/unused': { label: 'A source not on a page yet', render: () => <InApp spaceId="northwind"><Source source={{ ...sampleSource, reference: 'https://northwind.example/notes/steering-october-9', shared: false, by: { name: 'Ana Berg', you: true }, agent: null, pages: [] }} /></InApp> },
  '/page': { label: 'A collection, with an update only you see', render: () => <InApp spaceId="northwind"><Page page={samplePage} actions={samplePageActions} gathered={sampleGathered} /></InApp> },
  '/page/plain': { label: 'A page in no collection', render: () => <InApp spaceId="northwind"><Page page={{ ...samplePage, gathers: 0, collections: [], mentionedOn: [] }} actions={samplePageActions} /></InApp> },
  '/spaces/collections': { label: 'A space’s collections', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="collections"><Pages space={sampleSpace.closed} data={{ ...samplePages, total: 1, all: 1, types: [], pages: samplePages.pages.filter((page) => page.gathers > 0) }} filters={{ q: '', type: '', from: 0 }} onFilters={() => {}} collections /></Space></InApp> },
  '/spaces/collections/empty': { label: 'A space with no collections yet', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="collections"><Pages space={sampleSpace.closed} data={{ pages: [], total: 0, all: 0, types: [] }} filters={{ q: '', type: '', from: 0 }} onFilters={() => {}} collections /></Space></InApp> },
  '/page/long': { label: 'A long page, searchable within', render: () => <InApp spaceId="northwind"><Page page={{ ...samplePage, title: 'Meeting notes, all of 2026', type: 'meeting', items: Array.from({ length: 16 }, (_, index) => ({ ...samplePage.items[index % 5], id: `item-${index}` })) }} /></InApp> },
  '/page/personal': { label: 'A page in your personal space', render: () => <InApp spaceId="kitchen"><Page page={{ ...samplePage, title: 'Kitchen quotes', type: null, shared: false, space: { id: 'kitchen', name: 'Kitchen renovation', personal: false, private: true, people: 1, above: false }, items: samplePage.items.filter((item) => !item.shared).map((item) => ({ ...item, replaced: null })) }} /></InApp> },
  '/page/empty': { label: 'A page with nothing on it yet', render: () => <InApp spaceId="northwind"><Page page={{ ...samplePage, title: 'Marte Lunde', type: 'person', items: [] }} actions={samplePageActions} /></InApp> },
  '/spaces/rules': { label: 'A space’s rules, as an admin', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="rules"><Rules space={sampleSpace.closed} rules={sampleRules} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/rules/member': { label: 'A space’s rules, as a member', render: () => <InApp spaceId="website"><Space space={sampleSpace.open} view="rules"><Rules space={sampleSpace.open} rules={sampleRules.filter((rule) => rule.spaceId !== 'northwind').map((rule) => ({ ...rule, spaceId: rule.spaceId === 'acme' && !rule.shared ? 'website' : rule.spaceId }))} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/rules/from-above': { label: 'Rules from a space you can’t open', render: () => <InApp spaceId="website"><Space space={sampleSpace.fromAbove} view="rules"><Rules space={sampleSpace.fromAbove} rules={sampleRules.filter((rule) => rule.spaceId === 'acme' && rule.shared).map((rule) => ({ ...rule, spaceName: null }))} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/rules/personal': { label: 'Your personal rules', render: () => <InApp spaceId="personal"><Space space={sampleSpace.personal} view="rules"><Rules space={sampleSpace.personal} rules={sampleRules.filter((rule) => rule.personal)} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/rules/new': { label: 'Rules in a new space', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="rules"><Rules space={sampleSpace.root} rules={[]} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/skills': { label: 'A space’s skills', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="skills"><Skills space={sampleSpace.closed} skills={sampleSkills} /></Space></InApp> },
  '/skill': { label: 'A skill', render: () => <InApp spaceId="northwind"><Skill skill={sampleSkill} /></InApp> },
  '/spaces/closed': { label: 'A closed space’s members', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="members"><Members space={sampleSpace.closed} /></Space></InApp> },
  '/spaces/open': { label: 'Members of a space open to everyone above it', render: () => <InApp spaceId="website"><Space space={sampleSpace.open} view="members"><Members space={sampleSpace.open} /></Space></InApp> },
  '/spaces/root': { label: 'Members of a space at the top', render: () => <InApp spaceId="acme"><Space space={sampleSpace.root} view="members"><Members space={sampleSpace.root} /></Space></InApp> },
  '/spaces/kitchen': { label: 'A space in your personal space', render: () => <InApp spaceId="kitchen"><Space space={sampleSpace.kitchen} view="rules"><Rules space={sampleSpace.kitchen} rules={sampleRules.filter((rule) => rule.personal)} actions={sampleRuleActions} /></Space></InApp> },
  '/spaces/new': { label: 'Starting a space', render: () => <InApp route={{ name: 'new space' }}><NewSpace spaces={sampleSpaces} create={notCreated} onCreated={() => {}} onCancel={() => {}} /></InApp> },
  '/spaces/new/in': { label: 'Starting a space in Acme', render: () => <InApp route={{ name: 'new space' }}><NewSpace spaces={sampleSpaces} start="acme" create={notCreated} onCreated={() => {}} onCancel={() => {}} /></InApp> },
  '/spaces/settings': { label: 'A space’s settings, for its admins', render: () => <InApp spaceId="northwind"><Space space={sampleSpace.closed} view="settings"><SpaceSettings space={sampleSpace.closed} rename={async () => 'Samples don’t save anything.'} /></Space></InApp> },
  '/spaces/from-above': { label: 'Members of a space whose parent you can’t open', render: () => <InApp spaceId="website"><Space space={sampleSpace.fromAbove} view="members"><Members space={sampleSpace.fromAbove} /></Space></InApp> },
  '/account': { label: 'Your account', render: () => <InApp route={{ name: 'account' }}><Account account={sampleAccount} /></InApp> },
  '/account/admin': { label: 'Your account, looking after Homing', render: () => <InApp route={{ name: 'account' }} looksAfterHoming><Account account={{ ...sampleAccount, instanceAdmin: true }} /></InApp> },
  '/admin': { label: 'Looking after Homing', render: () => <InApp route={{ name: 'admin' }} looksAfterHoming><Admin data={sampleAdmin} invite={sampleInvite} /></InApp> },
  '/admin/no-email': { label: 'Looking after Homing, without email', render: () => <InApp route={{ name: 'admin' }} looksAfterHoming><Admin data={{ ...sampleAdmin, email: { sends: false, from: null } }} invite={sampleInvite} /></InApp> },
  '/account/password': { label: 'Your account, with a password', render: () => <InApp route={{ name: 'account' }}><Account account={{ ...sampleAccount, password: true, passkeys: [] }} /></InApp> },
  '/account/recovered': { label: 'Signed in with a sign-in link', render: () => <InApp route={{ name: 'account' }}><Account account={sampleAccount} notice="recovered" /></InApp> },
  '/recover': { label: 'Can’t sign in', render: () => <Recover recovery="email" /> },
  '/recover/sent': { label: 'Can’t sign in: link sent', render: () => <Recover recovery="email" initial="sent" /> },
  '/recover/operator': { label: 'Can’t sign in, without email', render: () => <Recover recovery="operator" /> },
  '/connect': { label: 'Claude wants to use Homing as you', render: () => <Connect assistant={{ name: 'Claude', site: 'claude.ai' }} person="Ana Berg" /> },
  '/confirm': { label: 'Confirm a rule', render: () => <SampleConfirm proposal={proposal} /> },
  '/confirm/long': { label: 'Confirm a longer rule', render: () => <SampleConfirm proposal={longProposal} /> },
  '/confirm/private': { label: 'Confirm a rule only for you', render: () => <SampleConfirm proposal={{ ...proposal, shared: false }} /> },
  '/confirm/personal': { label: 'Confirm a rule in your personal space', render: () => <SampleConfirm proposal={personalProposal} /> },
  '/confirm/change': { label: 'Confirm changing a rule', render: () => <SampleConfirm proposal={changeProposal} /> },
  '/confirm/remove': { label: 'Confirm removing a rule', render: () => <SampleConfirm proposal={removeProposal} /> },
  '/confirm/changed': { label: 'Confirm: the rule changed meanwhile', render: () => <SampleConfirm proposal={changeProposal} message="This rule changed after you opened this page. Check the change again." /> },
  '/confirm/added': { label: 'Rule added', render: () => <SampleConfirm proposal={{ ...proposal, state: 'approved' }} /> },
  '/confirm/declined': { label: 'Rule not added', render: () => <SampleConfirm proposal={{ ...proposal, state: 'rejected' }} /> },
  '/confirm/space': { label: 'Confirm a space Claude suggests', render: () => <SampleConfirm proposal={suggestedSpace} /> },
  '/confirm/space/asked': { label: 'Confirm a space you asked for that others would see', render: () => <SampleConfirm proposal={{ ...suggestedSpace, suggestion: { ...suggestedSpace.suggestion!, name: 'Intranet', who: 'with others', in: 'acme', asked: true, why: null } }} /> },
  '/confirm/space/created': { label: 'Suggested space created', render: () => <SampleConfirm proposal={{ ...suggestedSpace, state: 'approved', suggestion: { ...suggestedSpace.suggestion!, created: { id: 'kitchen', name: 'Home renovation', where: 'In your personal space. Only you have it.' } } }} /> },
  '/confirm/space/declined': { label: 'Suggested space declined', render: () => <SampleConfirm proposal={{ ...suggestedSpace, state: 'rejected' }} /> },
  '/confirm/removed': { label: 'Rule removed', render: () => <SampleConfirm proposal={{ ...removeProposal, state: 'approved', rule: { ...removeProposal.rule!, current: false } }} /> },
  '/confirm/expired': { label: 'Request expired', render: () => <SampleConfirm proposal={{ ...proposal, state: 'expired' }} /> },
  '/confirm/gone': { label: 'Rule removed before deciding', render: () => <SampleConfirm proposal={{ ...changeProposal, rule: { ...changeProposal.rule!, current: false } }} /> },
  '/card-preview': { label: 'Approval card in Claude and ChatGPT', render: () => <CardPreview /> },
  '/confirm/request': { label: 'Send a request to a space’s admins', render: () => <SampleConfirm proposal={requestProposal} /> },
  '/confirm/request/sent': { label: 'A request you sent, waiting for the admins', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'requested', request: { ...requestProposal.request!, sent: true } }} /> },
  '/confirm/request/not-emailed': { label: 'A request you sent, that the admins weren’t emailed about', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'requested', request: { ...requestProposal.request!, sent: true, emailed: false } }} /> },
  '/confirm/request/admin': { label: 'A member’s request, for an admin to decide', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'requested', request: { ...requestProposal.request!, by: 'Cara Lund', yours: false, sent: true } }} /> },
  '/confirm/request/unnamed': { label: 'A request from a member you share no space with', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'requested', request: { ...requestProposal.request!, by: null, yours: false, sent: true } }} /> },
  '/confirm/request/approved': { label: 'Your request, approved by an admin', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'approved', decidedBy: 'Jon Dahl', request: { ...requestProposal.request!, sent: true } }} /> },
  '/confirm/request/not-sent': { label: 'A request you didn’t send', render: () => <SampleConfirm proposal={{ ...requestProposal, state: 'rejected' }} /> },
  '/card-preview/request': { label: 'Approval card for a request', render: () => <CardPreview sample="request" /> },
  '/card-preview/long': { label: 'Approval card with a longer rule', render: () => <CardPreview sample="long" /> },
  '/card-preview/space': { label: 'The card for a space Claude suggests', render: () => <CardPreview sample="space" /> },
  '/card-preview/done': { label: 'The card after a change that needed no approval', render: () => <CardPreview sample="done" /> },
  '/card-preview/refused': { label: 'The card when Homing refused a change', render: () => <CardPreview sample="refused" /> },
};

/** The decision page, deciding on the sample instead of the server. */
function SampleConfirm({ proposal, message }: { proposal: ProposalData; message?: string }) {
  const [shown, setShown] = useState(proposal);
  return (
    <InApp route={{ name: 'proposal', id: 'sample' }}>
      <Confirm
        proposal={shown}
        message={message}
        decide={async (approve, onlyHere) => {
          if (approve && shown.request && !shown.request.sent) setShown({ ...shown, state: 'requested', request: { ...shown.request, sent: true } });
          else setShown({ ...shown, onlyHere, state: approve ? 'approved' : 'rejected', rule: shown.rule && { ...shown.rule, current: shown.action !== 'remove' } });
          return undefined;
        }}
      />
    </InApp>
  );
}

/** Inviting on the sample makes a link that leads nowhere, or says it was sent. */
const sampleInvite: MakeInvite = async (email) =>
  email ? { to: email, expiresAt: '2026-10-26T10:00:00Z', emailed: true } : { link: 'https://homing.acme.no/join#sample', expiresAt: '2026-10-26T10:00:00Z', emailed: false };

/** The spaces Ana opened lately, among a hundred. */
const recentMany = ['client-0', 'client-14-Data platform', 'client-5', 'family'];

/** Changing rules on the sample does nothing, so the forms can be tried. */
const sampleRuleActions: RuleActions = { add: async () => undefined, edit: async () => undefined, remove: async () => undefined };

/** A screen inside the app, with Ana's spaces on the shelf. */
/** Samples show the form, and say so when asked to create something. */
const notCreated: CreateSpace = async () => ({ problem: 'Samples don’t create spaces.' });

function InApp({ children, route = { name: 'home' }, spaceId, waiting = 2, spaces = sampleSpaces, recent = [], looksAfterHoming = false }: {
  children: ReactNode;
  looksAfterHoming?: boolean;
  route?: Route;
  spaceId?: string;
  waiting?: number;
  spaces?: typeof sampleSpaces;
  recent?: string[];
}) {
  return (
    <Shell person={{ name: 'Ana Berg', instanceAdmin: looksAfterHoming }} spaces={spaces} waiting={waiting} recent={recent} route={spaceId ? { name: 'space', id: spaceId } : route} spaceId={spaceId} onSignOut={() => undefined}>
      {children}
    </Shell>
  );
}

export function Samples() {
  const screen = screens[location.pathname.replace(/\/$/, '')];
  if (screen) return screen.render();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <Wordmark className="text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Screens</h1>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {Object.entries(screens).map(([path, item]) => (
          <li key={path}>
            <a href={path} className="flex items-center justify-between gap-3 px-4 py-3 text-base hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
              {item.label}
              <span className="text-xs text-muted-foreground">{path}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function SamplePages({ space = sampleSpace.closed, data = samplePages, filters: initial = { q: '', type: '', from: 0 } }: { space?: SpaceData; data?: typeof samplePages; filters?: PageFilters }) {
  const [filters, setFilters] = useState(initial);
  return <Pages space={space} data={data} filters={filters} onFilters={setFilters} create={async () => ({ problem: 'Sample screens don’t save anything.' })} />;
}

// Writing on the sample screens only says it isn't saved.
const notSaved = async () => 'Sample screens don’t save anything.';
const samplePageActions = {
  add: notSaved,
  correct: notSaved,
  gather: notSaved,
  ungather: notSaved,
  join: notSaved,
  leave: notSaved,
  find: async (query: string, collections?: boolean) => (collections ? samplePages.pages.filter((page) => page.gathers > 0) : samplePages.pages).filter((page) => page.title.toLowerCase().includes(query.toLowerCase())),
};

function SampleSources() {
  const [filters, setFilters] = useState<PageFilters>({ q: '', type: '', from: 0 });
  return <Sources space={sampleSpace.closed} data={sampleSources} filters={filters} onFilters={setFilters} />;
}

function SampleSearch() {
  const [kind, setKind] = useState<'all' | 'pages' | 'sources' | 'rules' | 'skills' | 'spaces'>('all');
  return <Search data={sampleSearch} query="launch" kind={kind} from={0} onKind={setKind} onFrom={() => {}} />;
}
