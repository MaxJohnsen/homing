import { useState, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { Wordmark } from '@/components/wordmark';
import type { ProposalData } from '@/lib/proposals';
import type { RuleActions } from '@/lib/guidance';
import type { Route } from '@/lib/router';
import { changeProposal, longProposal, manyWaiting, personalProposal, proposal, removeProposal, sampleAccount, sampleRules, sampleSkill, sampleSkills, sampleSpace, sampleSpaces, sampleWaiting } from '@/sample';
import { Account } from '@/screens/account';
import { CardPreview } from '@/screens/card-preview';
import { Confirm } from '@/screens/confirm';
import { Connect } from '@/screens/connect';
import { Home } from '@/screens/home';
import { Join } from '@/screens/join';
import { Landing } from '@/screens/landing';
import { Recover } from '@/screens/recover';
import { SignIn } from '@/screens/sign-in';
import { Rules, Skills } from '@/screens/guidance';
import { Skill } from '@/screens/skill';
import { Members, Space } from '@/screens/space';
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
  '/home': { label: 'Home, with changes waiting', render: () => <InApp waiting={2}><Home data={{ name: 'Ana Berg', waiting: sampleWaiting, assistants: 2, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/home/many': { label: 'Home, with more waiting than it shows', render: () => <InApp waiting={5}><Home data={{ name: 'Ana Berg', waiting: manyWaiting, assistants: 2, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/home/quiet': { label: 'Home, with nothing waiting', render: () => <InApp waiting={0}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 2, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/home/new': { label: 'Home, just joined', render: () => <InApp waiting={0} spaces={sampleSpaces.filter((space) => space.personal)}><Home data={{ name: 'Ana Berg', waiting: [], assistants: 0, mcpUrl: sampleAccount.mcpUrl }} /></InApp> },
  '/waiting': { label: 'Everything waiting, by space', render: () => <InApp waiting={5} route={{ name: 'waiting' }}><Waiting waiting={manyWaiting} /></InApp> },
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
  '/spaces/from-above': { label: 'Members of a space whose parent you can’t open', render: () => <InApp spaceId="website"><Space space={sampleSpace.fromAbove} view="members"><Members space={sampleSpace.fromAbove} /></Space></InApp> },
  '/account': { label: 'Your account', render: () => <InApp route={{ name: 'account' }}><Account account={sampleAccount} /></InApp> },
  '/account/admin': { label: 'Your account, looking after Homing', render: () => <InApp route={{ name: 'account' }}><Account account={{ ...sampleAccount, instanceAdmin: true }} /></InApp> },
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
  '/confirm/removed': { label: 'Rule removed', render: () => <SampleConfirm proposal={{ ...removeProposal, state: 'approved', rule: { ...removeProposal.rule!, current: false } }} /> },
  '/confirm/expired': { label: 'Request expired', render: () => <SampleConfirm proposal={{ ...proposal, state: 'expired' }} /> },
  '/confirm/gone': { label: 'Rule removed before deciding', render: () => <SampleConfirm proposal={{ ...changeProposal, rule: { ...changeProposal.rule!, current: false } }} /> },
  '/card-preview': { label: 'Approval card in Claude and ChatGPT', render: () => <CardPreview /> },
  '/card-preview/long': { label: 'Approval card with a longer rule', render: () => <CardPreview sample="long" /> },
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
          setShown({ ...shown, onlyHere, state: approve ? 'approved' : 'rejected', rule: shown.rule && { ...shown.rule, current: shown.action !== 'remove' } });
          return undefined;
        }}
      />
    </InApp>
  );
}

/** Changing rules on the sample does nothing, so the forms can be tried. */
const sampleRuleActions: RuleActions = { add: async () => undefined, edit: async () => undefined, remove: async () => undefined };

/** A screen inside the app, with Ana's spaces on the shelf. */
function InApp({ children, route = { name: 'home' }, spaceId, waiting = 2, spaces = sampleSpaces }: {
  children: ReactNode;
  route?: Route;
  spaceId?: string;
  waiting?: number;
  spaces?: typeof sampleSpaces;
}) {
  return (
    <Shell person={{ name: 'Ana Berg' }} spaces={spaces} waiting={waiting} route={spaceId ? { name: 'space', id: spaceId } : route} spaceId={spaceId} onSignOut={() => undefined}>
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
