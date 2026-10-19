import { useState, type ReactNode } from 'react';
import { Wordmark } from '@/components/wordmark';
import type { ProposalData } from '@/lib/proposals';
import { changeProposal, longProposal, personalProposal, proposal, removeProposal, sampleAccount } from '@/sample';
import { Account } from '@/screens/account';
import { CardPreview } from '@/screens/card-preview';
import { Confirm } from '@/screens/confirm';
import { Connect } from '@/screens/connect';
import { Join } from '@/screens/join';
import { Landing } from '@/screens/landing';
import { Recover } from '@/screens/recover';
import { SignIn } from '@/screens/sign-in';

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
  '/account': { label: 'Your account', render: () => <Account account={sampleAccount} /> },
  '/account/welcome': { label: 'Your account, just created', render: () => <Account account={{ ...sampleAccount, passkeys: sampleAccount.passkeys.slice(0, 1), assistants: [], emailVerified: false }} notice="welcome" /> },
  '/account/admin': { label: 'Your account, looking after Homing', render: () => <Account account={{ ...sampleAccount, instanceAdmin: true }} /> },
  '/account/password': { label: 'Your account, with a password', render: () => <Account account={{ ...sampleAccount, password: true, passkeys: [] }} /> },
  '/account/recovered': { label: 'Signed in with a sign-in link', render: () => <Account account={sampleAccount} notice="recovered" /> },
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
    <Confirm
      proposal={shown}
      person="Ana Berg"
      message={message}
      decide={async (approve, onlyHere) => {
        setShown({ ...shown, onlyHere, state: approve ? 'approved' : 'rejected', rule: shown.rule && { ...shown.rule, current: shown.action !== 'remove' } });
        return undefined;
      }}
    />
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
