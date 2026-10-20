import { cn } from 'cn';
import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { GoogleLogo, MicrosoftLogo } from '@/components/provider-logos';
import { focusRing } from '@/components/screen';
import { FormCard, SplitLayout } from '@/components/split-layout';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import bird from '@/assets/illustrations/bird-flying.png';
import scene from '@/assets/illustrations/signin.png';

export type SignInStep = 'email' | 'passkey' | 'password' | 'wrong';
export type Provider = 'google' | 'microsoft';

/** What signing in does. Each resolves to a message to show, or nothing once signed in. */
export interface SignInActions {
  passkey(): Promise<string | undefined>;
  password(email: string, password: string): Promise<string | undefined>;
}

/**
 * Email first, then the person's passkey or password, the way most large sign-ins work. The email
 * field also offers saved passkeys directly. Every email gets the same next step, so the page never
 * says whether an account exists.
 */
export function SignIn({
  connecting,
  initial = 'email',
  email: initialEmail = '',
  passwords = true,
  providers = [],
  notice,
  actions,
}: {
  connecting?: string;
  initial?: SignInStep;
  email?: string;
  passwords?: boolean;
  providers?: Provider[];
  /** A problem with a passkey picked in the email field. */
  notice?: string;
  actions?: SignInActions;
}) {
  const [step, setStep] = useState<SignInStep>(initial);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    setMessage(undefined);
    setMessage(await action());
    setBusy(false);
  };

  const toPasskey = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+$/.test(email.trim())) return setMessage('Enter your email address.');
    setMessage(undefined);
    setStep('passkey');
  };

  const signInWithPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!actions) return setStep('wrong');
    run(async () => {
      const problem = await actions.password(email, password);
      if (problem) setStep('wrong');
      return problem;
    });
  };

  return (
    <SplitLayout illustration={scene}>
      <FormCard>
        {/* The bird brings a note, knowledge, to the person signing in. */}
        <img src={bird} alt="" width={579} height={464} className="pointer-events-none absolute -top-[84px] -right-2 w-32 sm:-top-[112px] sm:-right-10 sm:w-44" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {connecting ? `Sign in to connect ${connecting}` : 'Sign in to Homing'}
          </h1>
          {connecting && step === 'email' && (
            <p className="text-base text-muted-foreground">Then you choose whether to connect {connecting}.</p>
          )}
        </div>

        {step === 'email' ? (
          <>
            <form className="flex flex-col gap-4" onSubmit={toPasskey} noValidate>
              <Field data-invalid={Boolean(message ?? notice) || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" autoComplete="username webauthn" className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(message ?? notice) || undefined} />
                {(message ?? notice) && <FieldError>{message ?? notice}</FieldError>}
              </Field>
              <Button type="submit" size="lg" className="h-11 w-full text-base">Continue</Button>
            </form>
            {providers.length > 0 && (
              <>
                <p className="text-center text-sm text-muted-foreground" aria-hidden="true">or</p>
                <div className="flex flex-col gap-2.5">
                  {providers.includes('google') && <Button variant="outline" size="lg" className="h-11 w-full text-base"><GoogleLogo />Continue with Google</Button>}
                  {providers.includes('microsoft') && <Button variant="outline" size="lg" className="h-11 w-full text-base"><MicrosoftLogo />Continue with Microsoft</Button>}
                </div>
              </>
            )}
            <p className="text-sm text-muted-foreground">New here? You join through an invite from someone who uses Homing.</p>
          </>
        ) : (
          <>
            <p className="flex items-center justify-between gap-3 rounded-full bg-muted px-4 py-3 text-base">
              <span className="min-w-0 truncate">{email}</span>
              <button type="button" className={cn('shrink-0 rounded-sm px-1 py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline', focusRing)} onClick={() => { setMessage(undefined); setStep('email'); }}>
                Change
              </button>
            </p>

            {step === 'passkey' ? (
              <div className="flex flex-col gap-3">
                <Button size="lg" className="h-11 w-full text-base" disabled={busy} onClick={() => actions && run(actions.passkey)} autoFocus>
                  <KeyRound data-icon="inline-start" />Use your passkey
                </Button>
                {message && <FieldError>{message}</FieldError>}
                {passwords && (
                  <Button variant="ghost" size="lg" className="h-11 w-full text-base text-muted-foreground" onClick={() => { setMessage(undefined); setStep('password'); }}>
                    Use your password instead
                  </Button>
                )}
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={signInWithPassword} noValidate>
                <Field data-invalid={step === 'wrong' || undefined}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input id="password" type="password" autoComplete="current-password" aria-invalid={step === 'wrong' || undefined} className="h-11" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
                  {step === 'wrong' && <FieldError>{message ?? wrongPassword}</FieldError>}
                </Field>
                <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy}>Sign in</Button>
              </form>
            )}
            <a href="/recover" className={cn('w-fit rounded-sm py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline', focusRing)}>Can’t sign in?</a>
          </>
        )}
      </FormCard>
    </SplitLayout>
  );
}

export const wrongPassword = "That password doesn’t match. Try again, or use your passkey.";
