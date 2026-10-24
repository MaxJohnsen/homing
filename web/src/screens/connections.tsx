import { Fragment, useRef, useState } from 'react';
import { cn } from 'cn';
import { Lock } from 'lucide-react';
import { OnlyYou } from '@/components/only-you';
import { MicrosoftLogo } from '@/components/provider-logos';
import { dateOf, focusRing, Section, wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import type { AccountConnectionData, ConnectedAccountsData, ConnectionData, ConnectionNotice, PlaceData, SpaceConnectionsData } from '@/lib/connections';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** What a space's Connections does. Each resolves to a message to show, or nothing when it worked. */
export interface ConnectionActions {
  /** Sends you to Microsoft's page to sign in, or to sign in again for a connection of yours. */
  connect: (again?: string) => Promise<string | undefined>;
  /** Stops using something of yours in this space. The account stays connected. */
  remove: (placeId: string) => Promise<string | undefined>;
}

const deploymentGuide = 'https://github.com/MaxJohnsen/homing/blob/main/docs/deployment.md#microsoft-365';

/** Said once, after coming back from Microsoft's page. */
const notices: Record<ConnectionNotice, { text: string; problem: boolean }> = {
  connected: { text: 'Connected. Only you see it.', problem: false },
  declined: { text: 'Nothing was connected, because Microsoft didn’t let Homing in. If your organization approves apps first, ask its IT admin to approve Homing.', problem: true },
  expired: { text: 'That sign-in expired, so nothing was connected. Try again.', problem: true },
  failed: { text: 'Microsoft didn’t connect the account, so nothing changed. Try again, and if it keeps happening, tell whoever looks after Homing.', problem: true },
  unreachable: { text: 'Homing couldn’t reach Microsoft, so nothing was connected. Try again in a moment.', problem: true },
  'no-mailbox': { text: 'That account has no mailbox Homing can read, so nothing was connected. Sign in with the account you use for email.', problem: true },
};

/**
 * A space's Connections: what Homing can reach for you there, such as your work mailbox, and
 * connecting it. What you connect is only yours, even in a space others share, so nobody else
 * sees it here, or that it's there.
 */
export function Connections({ space, data, notice, actions }: { space: SpaceData; data: SpaceConnectionsData; notice?: ConnectionNotice; actions?: ConnectionActions }) {
  const shown = notice && notices[notice];
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <Section
        title="Connections"
        description={space.private
          ? `What Homing can reach for you in ${space.personal ? 'your personal space' : space.name}, such as your mailbox. Only you see it.`
          : `What Homing can reach for you in ${space.name}, such as your work mailbox. What you connect is only yours: others in ${space.name} don’t see it, or that it’s there.`}
      >
        {shown && (shown.problem ? <FieldError className="text-base">{shown.text}</FieldError> : <p role="status" className="text-base">{shown.text}</p>)}
        {data.places.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.places.map((place) => <PlaceRow key={place.id} space={space} place={place} actions={actions} />)}
          </ul>
        )}
      </Section>
      {data.microsoft ? <Connect space={space} first={data.places.length === 0} connect={actions?.connect} /> : <NotSetUp looksAfter={data.looksAfter} />}
    </div>
  );
}

function PlaceRow({ space, place, actions }: { space: SpaceData; place: PlaceData; actions?: ConnectionActions }) {
  const { connection } = place;
  const here = space.personal ? 'your personal space' : space.name;
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    const answer = await action();
    setBusy(false);
    setProblem(answer);
    return answer;
  };
  const elsewhere = place.elsewhere === 1 ? '1 other space' : `${place.elsewhere} other spaces`;
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="pt-1"><MicrosoftLogo /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{connection.address}</span>
            <OnlyYou />
          </div>
          <span className="text-sm text-pretty text-muted-foreground">{whatItIs(connection)} Connected on {dateOf(connection.connectedAt)}.</span>
        </div>
      </div>
      {connection.status === 'needs attention' && (
        <p className="text-sm text-destructive">Microsoft stopped letting Homing in, so it isn’t used until you sign in again.</p>
      )}
      {actions && !removing && (
        <div className="flex flex-wrap gap-2">
          {connection.status === 'needs attention' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => actions.connect(connection.id))}>Sign in again</Button>
          )}
          <Button ref={opener} variant="outline" size="sm" className={cn(wrapsLabel, 'min-h-8 py-1')} onClick={() => setRemoving(true)}>Remove from {here}</Button>
        </div>
      )}
      {actions && removing && (
        <div role="group" aria-label={`Remove from ${here}`} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
          <p className="text-sm">
            Homing stops using {connection.address} in {here}. The account stays connected{place.elsewhere > 0 && `, and in use in ${elsewhere},`} until you revoke it in{' '}
            <Link href="/account" className={cn('rounded-sm underline underline-offset-[3px]', focusRing)}>your account</Link>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} autoFocus onClick={() => {
              setRemoving(false);
              requestAnimationFrame(() => opener.current?.focus());
            }}>Keep it</Button>
            <Button variant="destructive" size="sm" className={cn(wrapsLabel, 'min-h-8 py-1')} disabled={busy} onClick={() => run(() => actions.remove(place.id))}>Remove from {here}</Button>
          </div>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}

/** "Microsoft 365. Homing may read its mail." */
function whatItIs(connection: ConnectionData): string {
  return `${connection.service}.${connection.can.includes('read mail') ? ' Homing may read its mail.' : ''}`;
}

/** "Acme", "Acme and Beta", "Acme, Beta and your personal space". */
function listed(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

/** Connecting a Microsoft 365 or Outlook.com mailbox here, only for you, on Microsoft's own page. */
function Connect({ space, first, connect }: { space: SpaceData; first: boolean; connect?: ConnectionActions['connect'] }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const go = async () => {
    if (!connect) return;
    setBusy(true);
    setProblem(undefined);
    const answer = await connect();
    // On its way to Microsoft, the page stays busy until it's gone.
    if (answer) {
      setProblem(answer);
      setBusy(false);
    }
  };
  return (
    <Section
      title={first ? 'Connect your mailbox' : 'Connect another mailbox'}
      tone="raised"
      description="Sign in on Microsoft’s own page, with a work or personal account. Homing may then read your mail. It can’t send, change or delete anything."
    >
      <div className="flex flex-col gap-0.5 rounded-xl bg-private/40 px-4 py-3">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Lock aria-hidden="true" className="size-4 text-private-foreground" />
          Only for me
        </span>
        <span className="pl-6 text-sm text-muted-foreground">
          {space.private ? 'Nobody else can see it.' : `Nobody else in ${space.name} can see it, what Homing reads from it, or that it’s connected.`}
        </span>
      </div>
      <div>
        <Button variant="outline" size="lg" className="h-11 w-full text-base sm:w-auto sm:px-5" disabled={busy} onClick={go}>
          <MicrosoftLogo />Connect Microsoft 365
        </Button>
      </div>
      {busy && !problem && <p role="status" className="text-sm text-muted-foreground">Opening Microsoft’s sign-in…</p>}
      {problem && <FieldError>{problem}</FieldError>}
    </Section>
  );
}

/** Without Microsoft set up, whoever looks after Homing learns how, and nobody is offered what can't work. */
function NotSetUp({ looksAfter }: { looksAfter: boolean }) {
  if (!looksAfter) {
    return <p className="text-base">Nothing can be connected on this Homing yet. Whoever looks after it can set up Microsoft 365.</p>;
  }
  return (
    <Section title="Microsoft 365 isn’t set up yet" tone="raised" description="To let people connect their Microsoft 365 or Outlook.com mailbox, register this Homing with Microsoft and add its settings. Until then, nobody can connect anything here.">
      <a href={deploymentGuide} target="_blank" rel="noreferrer" className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
        How to set it up
      </a>
    </Section>
  );
}

/** What your account's Connected accounts does. Each resolves to a message to show, or nothing when it worked. */
export interface AccountConnectionActions {
  /** Deletes Homing's sign-in for the account, and stops everything relying on it at once. */
  revoke: (id: string) => Promise<string | undefined>;
  /** Signs in again for the account, from a space it's used in. */
  signInAgain: (spaceId: string, id: string) => Promise<string | undefined>;
}

/**
 * The accounts Homing signs in to for you, such as your work Microsoft 365, and where each is
 * used. Revoking one stops it everywhere; removing it from one space is done in that space.
 */
export function ConnectedAccounts({ data, expired, actions }: { data: ConnectedAccountsData; expired?: boolean; actions?: AccountConnectionActions }) {
  return (
    <section aria-labelledby="accounts-heading" className="flex flex-col gap-4 rounded-2xl bg-card px-6 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <h2 id="accounts-heading" className="text-lg font-semibold tracking-tight">Connected accounts</h2>
        <p className="text-base text-muted-foreground">Accounts Homing signs in to for you, such as your work Microsoft 365. Only you see them.</p>
      </div>
      {expired && <FieldError className="text-base">That sign-in didn’t finish, so nothing was connected. Start again from the space’s Connections.</FieldError>}
      {data.connections.length === 0 ? (
        <p className="text-base">None yet. You connect one in a space, from its Connections, such as your work mailbox in your company’s space.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.connections.map((connection) => <AccountRow key={connection.id} connection={connection} actions={actions} />)}
        </ul>
      )}
    </section>
  );
}

function AccountRow({ connection, actions }: { connection: AccountConnectionData; actions?: AccountConnectionActions }) {
  const [revoking, setRevoking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    const answer = await action();
    setBusy(false);
    setProblem(answer);
  };
  const spaces = connection.places.map((place) => place.space);
  const named = (space: { name: string; personal: boolean }) => (space.personal ? 'your personal space' : space.name);
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-muted px-4 py-3">
      <div className="flex items-center gap-3">
        <MicrosoftLogo />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold [overflow-wrap:anywhere]">{connection.address}</span>
          <span className="text-sm text-pretty text-muted-foreground">
            {connection.service}.{' '}
            {spaces.length === 0 ? 'Not used in any space now.' : (
              <>
                Used in{' '}
                {spaces.map((space, index) => (
                  <Fragment key={space.id}>
                    {index > 0 && (index === spaces.length - 1 ? ' and ' : ', ')}
                    <Link href={`/spaces/${space.id}/connections`} className={cn('rounded-sm text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
                      {named(space)}
                    </Link>
                  </Fragment>
                ))}
                .
              </>
            )}
          </span>
        </div>
        {actions && !revoking && <Button ref={opener} variant="outline" size="sm" onClick={() => setRevoking(true)}>Revoke</Button>}
      </div>
      {connection.status === 'needs attention' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">
            Microsoft stopped letting Homing in, so it isn’t used until you sign in again{spaces.length === 0 ? ', from a space’s Connections' : ''}.
          </p>
          {actions && spaces.length > 0 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => actions.signInAgain(spaces[0].id, connection.id))}>Sign in again</Button>
          )}
        </div>
      )}
      {actions && revoking && (
        <div role="group" aria-label={`Revoke ${connection.address}`} className="flex flex-col gap-3 rounded-lg bg-card p-3">
          <p className="text-sm">
            {spaces.length === 0
              ? `Homing deletes its sign-in for ${connection.address}, so it can’t be used any more.`
              : spaces.length === 1
                ? `Homing deletes its sign-in for ${connection.address} and stops using it in ${named(spaces[0])} at once.`
                : `Homing deletes its sign-in for ${connection.address} and stops using it at once, in ${listed(spaces.map(named))}.`}{' '}
            What it already kept stays, and who sees it doesn’t change.
            {spaces.length > 0 && ' To stop using it in one space only, remove it from that space’s Connections instead.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} autoFocus onClick={() => {
              setRevoking(false);
              requestAnimationFrame(() => opener.current?.focus());
            }}>Keep it</Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(() => actions.revoke(connection.id))}>Revoke</Button>
          </div>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}
