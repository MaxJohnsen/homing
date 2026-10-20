import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScreenHeader } from '@/components/screen';
import empty from '@/assets/illustrations/empty.png';

export interface Passkey {
  id: string;
  /** Where it was made, such as "Mac". */
  name: string | null;
  createdAt: string;
}

export interface ConnectedAssistant {
  clientId: string;
  name: string;
  connectedAt: string;
}

export interface AccountData {
  name: string;
  email: string;
  emailVerified: boolean;
  /** Whether Homing can send email. */
  canEmail: boolean;
  instanceAdmin: boolean;
  /** Whether accounts may have a password, and whether this one has. */
  passwords: boolean;
  password: boolean;
  passkeys: Passkey[];
  assistants: ConnectedAssistant[];
  /** The address assistants connect to. */
  mcpUrl: string;
}

/** What the account page does. Each resolves to a message to show, or nothing when it worked. */
export interface AccountActions {
  disconnect(clientId: string): Promise<string | undefined>;
  addPasskey(): Promise<string | undefined>;
  removePasskey(id: string): Promise<string | undefined>;
  setPassword(password: string, current?: string): Promise<string | undefined>;
  verifyEmail(): Promise<string | undefined>;
  signInAgain(): Promise<void>;
}


/** Shown once, after something that brought you here. */
export type AccountNotice = 'recovered' | 'verified';

const notices: Record<AccountNotice, (account: AccountData) => { title: string; text: string }> = {
  recovered: () => ({ title: "You’re signed in", text: 'Add a passkey on this device now, so you can sign in next time.' }),
  verified: () => ({ title: 'Your email is verified', text: 'If you ever can’t sign in, Homing can send you a sign-in link.' }),
};

/** Your account: the assistants connected to Homing, and how you sign in. */
export function Account({ account, notice, actions }: { account: AccountData; notice?: AccountNotice; actions?: AccountActions }) {
  const shown = notice && notices[notice](account);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {shown ? (
        <div role="status">
          <ScreenHeader title={shown.title} meta={shown.text} />
        </div>
      ) : (
        <ScreenHeader title="Your account" />
      )}

      {notice === 'recovered' ? (
        <>
          <SignInMethods account={account} actions={actions} restoring />
          <Assistants account={account} actions={actions} />
        </>
      ) : (
        <>
          <Assistants account={account} actions={actions} />
          <SignInMethods account={account} actions={actions} />
        </>
      )}
    </div>
  );
}

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

function Assistants({ account, actions }: { account: AccountData; actions?: AccountActions }) {
  const [disconnecting, setDisconnecting] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const disconnect = async (clientId: string) => {
    if (!actions) return;
    setBusy(true);
    const problem = await actions.disconnect(clientId);
    setMessage(problem);
    if (!problem) setDisconnecting(undefined);
    setBusy(false);
  };

  return (
    <section aria-labelledby="assistants-heading" className="flex flex-col gap-4 rounded-2xl bg-card px-6 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <h2 id="assistants-heading" className="text-lg font-semibold tracking-tight">Connected assistants</h2>
        <p className="text-base text-muted-foreground">They can access what you can see in Homing.</p>
      </div>

      {account.assistants.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-muted px-4 pt-2 pb-5 text-center">
          <img src={empty} alt="" width={960} height={640} className="w-48" />
          <p className="text-base font-medium">No assistants yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {account.assistants.map((assistant) => (
            <li key={assistant.clientId} className="flex flex-col gap-3 rounded-xl bg-muted px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-medium">{assistant.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    From {siteOf(assistant.clientId)}, connected {date.format(new Date(assistant.connectedAt))}
                  </span>
                </div>
                {disconnecting !== assistant.clientId && (
                  <Button variant="outline" size="sm" onClick={() => setDisconnecting(assistant.clientId)}>Disconnect</Button>
                )}
              </div>
              {disconnecting === assistant.clientId && (
                <div className="flex flex-col gap-3 rounded-lg bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">{assistant.name} stops working with Homing right away. You can connect it again later.</p>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDisconnecting(undefined)}>Keep it</Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={() => disconnect(assistant.clientId)}>Disconnect</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <FieldError>{message}</FieldError>}

      <div className="flex flex-col gap-2">
        <p className="text-base">
          {account.assistants.length === 0 ? 'To connect Claude, ChatGPT or another assistant' : 'To connect another assistant'}, add
          Homing to it as a connector with this address, then sign in and connect it.
        </p>
        <CopyAddress value={account.mcpUrl} />
      </div>
    </section>
  );
}

/** The address assistants connect to, with a way to copy it. */
export function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-full bg-muted py-1.5 pr-1.5 pl-4">
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
        {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function siteOf(clientId: string): string {
  try {
    return new URL(clientId).hostname;
  } catch {
    return clientId;
  }
}

/** How you sign in. After a sign-in link, adding a passkey is the one thing to do, so it leads. */
function SignInMethods({ account, actions, restoring }: { account: AccountData; actions?: AccountActions; restoring?: boolean }) {
  const [message, setMessage] = useState<string>();
  const [staleSession, setStaleSession] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    setMessage(undefined);
    const problem = await action();
    setStaleSession(problem === signInAgainMessage);
    setMessage(problem);
    setBusy(false);
  };

  return (
    <section aria-labelledby="sign-in-heading" className="flex flex-col gap-4 rounded-2xl bg-card px-6 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <h2 id="sign-in-heading" className="text-lg font-semibold tracking-tight">How you sign in</h2>
        <p className="text-base text-muted-foreground">
          With your email, {account.email}, and {account.password ? (account.passkeys.length ? 'a passkey or your password' : 'your password') : 'a passkey'}.
        </p>
      </div>

      <ul className="flex flex-col gap-2 empty:hidden">
        {account.passkeys.map((passkey) => (
          <li key={passkey.id} className="flex flex-col gap-3 rounded-xl bg-muted px-4 py-3">
            <div className="flex items-center gap-3">
              <KeyRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-medium">{passkey.name ? `Passkey on ${passkey.name}` : 'Passkey'}</span>
                <span className="text-sm text-muted-foreground">Added {date.format(new Date(passkey.createdAt))}</span>
              </div>
              {(account.passkeys.length > 1 || account.password) && removing !== passkey.id && (
                <Button variant="outline" size="sm" onClick={() => setRemoving(passkey.id)}>Remove</Button>
              )}
            </div>
            {removing === passkey.id && (
              <div className="flex flex-col gap-3 rounded-lg bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">You won’t be able to sign in with this passkey any more.</p>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRemoving(undefined)}>Keep it</Button>
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => actions && run(async () => {
                    const problem = await actions.removePasskey(passkey.id);
                    if (!problem) setRemoving(undefined);
                    return problem;
                  })}>Remove passkey</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <div>
          <Button variant={restoring ? 'default' : 'outline'} size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => actions && run(actions.addPasskey)}>
            <KeyRound data-icon="inline-start" />Add a passkey
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {account.passkeys.length ? 'Add another passkey as a backup.' : 'A passkey signs you in with your face, fingerprint or screen lock.'}
        </p>
        {message && (
          <div className="flex flex-wrap items-center gap-3">
            <FieldError>{message}</FieldError>
            {staleSession && <Button variant="outline" size="sm" onClick={() => actions?.signInAgain()}>Sign in again</Button>}
          </div>
        )}
      </div>

      {account.canEmail && !account.emailVerified && <VerifyEmail actions={actions} />}
      {account.instanceAdmin ? (
        <p className="pt-2 text-sm text-muted-foreground">This account manages Homing. A passkey is required.</p>
      ) : (
        account.passwords && <Password account={account} actions={actions} />
      )}
    </section>
  );
}

function VerifyEmail({ actions }: { actions?: AccountActions }) {
  const [state, setState] = useState<'idle' | 'sent' | string>('idle');
  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-base">Verify your email, so Homing can send you a sign-in link if you ever can’t sign in.</p>
      {state === 'sent' ? (
        <p className="text-sm text-muted-foreground" role="status">Check your email for the link.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" onClick={async () => setState((await actions?.verifyEmail()) ?? 'sent')}>
            Send me a link
          </Button>
          {state !== 'idle' && <FieldError>{state}</FieldError>}
        </div>
      )}
    </div>
  );
}

function Password({ account, actions }: { account: AccountData; actions?: AccountActions }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next.length < 10) return setMessage('Use a password of at least 10 characters.');
    if (!actions) return;
    setBusy(true);
    const problem = await actions.setPassword(next, account.password ? current : undefined);
    setMessage(problem);
    setDone(!problem);
    if (!problem) setOpen(false);
    setBusy(false);
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        {!account.password && <p className="text-base">You can also add a password, for devices without passkeys.</p>}
        {done && <p className="text-sm text-muted-foreground" role="status">Saved.</p>}
        <div>
          <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" onClick={() => { setDone(false); setOpen(true); }}>
            {account.password ? 'Change password' : 'Add a password'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4 pt-2" onSubmit={save} noValidate>
      {account.password && (
        <Field>
          <FieldLabel htmlFor="current-password">Current password</FieldLabel>
          <Input id="current-password" type="password" autoComplete="current-password" className="h-11" value={current} onChange={(event) => setCurrent(event.target.value)} autoFocus />
        </Field>
      )}
      <Field data-invalid={Boolean(message) || undefined}>
        <FieldLabel htmlFor="new-password">{account.password ? 'New password' : 'Password'}</FieldLabel>
        <Input id="new-password" type="password" autoComplete="new-password" className="h-11" value={next} onChange={(event) => setNext(event.target.value)} aria-invalid={Boolean(message) || undefined} autoFocus={!account.password} />
        {message ? <FieldError>{message}</FieldError> : <p className="text-sm text-muted-foreground">At least 10 characters.</p>}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy}>Save password</Button>
      </div>
    </form>
  );
}

/** Shown when a change to how you sign in needs a fresh sign-in. */
export const signInAgainMessage = 'For your safety, sign in again first.';
