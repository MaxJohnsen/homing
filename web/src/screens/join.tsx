import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { FormCard, SplitLayout } from '@/components/split-layout';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import welcome from '@/assets/illustrations/welcome.png';

/** The setup link creates the first account; an invite, everyone else's. */
export type InviteKind = 'setup' | 'invite';

export type JoinState =
  | { step: 'checking' }
  | {
      step: 'form';
      kind: InviteKind;
      /** Who sent the invite. */
      invitedBy?: string | null;
      /** The address it was sent to, which the form starts with. */
      email?: string | null;
      /** Whether an account may use a password instead of a passkey. */
      passwords?: boolean;
    }
  | { step: 'expired'; kind?: InviteKind }
  | { step: 'signed-in'; email: string };

/** A problem with what was entered, shown next to its field, or above the button. */
export interface JoinProblem {
  field?: 'name' | 'email' | 'password';
  message: string;
}

export interface JoinActions {
  /** Creates the account with a passkey and signs in. Resolves to a problem, or nothing once done. */
  join(name: string, email: string): Promise<JoinProblem | undefined>;
  /** Creates the account with a password instead, and signs in. */
  joinWithPassword(name: string, email: string, password: string): Promise<JoinProblem | undefined>;
  signOut(): Promise<void>;
}

/** Creating an account from a link: the first one, from the setup link, or anyone's from an invite. */
export function Join({ state, actions, problem: initialProblem }: { state: JoinState; actions?: JoinActions; problem?: JoinProblem }) {
  return (
    <SplitLayout illustration={welcome}>
      <FormCard>{state.step === 'checking' ? <p className="text-base text-muted-foreground" role="status">Checking your link…</p> : <Content state={state} actions={actions} initialProblem={initialProblem} />}</FormCard>
    </SplitLayout>
  );
}

function Content({ state, actions, initialProblem }: { state: Exclude<JoinState, { step: 'checking' }>; actions?: JoinActions; initialProblem?: JoinProblem }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(state.step === 'form' ? (state.email ?? '') : '');
  const [password, setPassword] = useState('');
  const [withPassword, setWithPassword] = useState(false);
  const [problem, setProblem] = useState(initialProblem);
  const [busy, setBusy] = useState(false);

  if (state.step === 'expired') {
    return (
      <>
        <Heading title="This link no longer works">
          {state.kind === 'setup'
            ? 'A setup link works once, for an hour. Restart Homing for a new one; it shows the link when it starts.'
            : 'An invite link works once, for a week. Ask the person who invited you for a new one.'}
        </Heading>
        <a href="/sign-in" className="text-base text-primary underline-offset-4 hover:underline">I already have an account</a>
      </>
    );
  }

  if (state.step === 'signed-in') {
    return (
      <>
        <Heading title="You’re already signed in">
          You’re signed in as {state.email}. Sign out to create a new account with this link.
        </Heading>
        <div className="flex flex-col gap-2.5">
          <Button size="lg" className="h-11 w-full text-base" onClick={() => actions?.signOut()}>Sign out</Button>
          <a href="/" className="text-center text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Go to Homing</a>
        </div>
      </>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setProblem({ field: 'name', message: 'Enter your name.' });
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setProblem({ field: 'email', message: 'Enter an email address, like ana@example.com.' });
    if (withPassword && password.length < 10) return setProblem({ field: 'password', message: 'Use a password of at least 10 characters.' });
    if (!actions) return;
    setBusy(true);
    setProblem(undefined);
    setProblem(withPassword ? await actions.joinWithPassword(name.trim(), email.trim(), password) : await actions.join(name.trim(), email.trim()));
    setBusy(false);
  };

  const fieldProblem = (field: JoinProblem['field']) => (problem && problem.field === field ? problem.message : undefined);

  return (
    <>
      {state.kind === 'setup' ? (
        <Heading title="Create the first account">It looks after this Homing and invites the people who use it.</Heading>
      ) : (
        <Heading title="Join Homing">
          {state.invitedBy ? `${state.invitedBy} invited you. ` : ''}Create your account to use Homing with your assistants.
        </Heading>
      )}
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field data-invalid={Boolean(fieldProblem('name')) || undefined}>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <Input id="name" autoComplete="name" className="h-11" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldProblem('name')) || undefined} />
          {fieldProblem('name') && <FieldError>{fieldProblem('name')}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(fieldProblem('email')) || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" autoComplete="email" className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fieldProblem('email')) || undefined} />
          {fieldProblem('email') && <FieldError>{fieldProblem('email')}</FieldError>}
        </Field>
        {withPassword && (
          <Field data-invalid={Boolean(fieldProblem('password')) || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" className="h-11" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fieldProblem('password')) || undefined} autoFocus />
            {fieldProblem('password') ? <FieldError>{fieldProblem('password')}</FieldError> : <p className="text-sm text-muted-foreground">At least 10 characters.</p>}
          </Field>
        )}
        {problem && !problem.field && <FieldError>{problem.message}</FieldError>}
        {withPassword ? (
          <Button type="submit" size="lg" className="mt-1 h-11 w-full text-base" disabled={busy}>Create account</Button>
        ) : (
          <>
            <Button type="submit" size="lg" className="mt-1 h-11 w-full text-base" disabled={busy}>
              <KeyRound data-icon="inline-start" />Create account with a passkey
            </Button>
            <p className="text-sm text-muted-foreground">
              Your device keeps the passkey, and you sign in with your face, fingerprint or screen lock. There’s no password to remember.
            </p>
          </>
        )}
        {state.kind === 'invite' && state.passwords && (
          <Button type="button" variant="ghost" size="lg" className="h-11 w-full text-base text-muted-foreground" onClick={() => { setProblem(undefined); setWithPassword(!withPassword); }}>
            {withPassword ? 'Use a passkey instead' : 'Use a password instead'}
          </Button>
        )}
      </form>
    </>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-base text-muted-foreground">{children}</p>
    </div>
  );
}
