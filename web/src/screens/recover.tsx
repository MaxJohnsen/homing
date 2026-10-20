import { useState, type FormEvent } from 'react';
import { FormCard, SplitLayout } from '@/components/split-layout';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import scene from '@/assets/illustrations/signin.png';

/** How someone who can't sign in gets back in: a link by email, or from whoever runs Homing. */
export type Recovery = 'email' | 'operator';

export function Recover({
  recovery,
  initial = 'form',
  send,
}: {
  recovery: Recovery;
  initial?: 'form' | 'sent';
  /** Asks for a sign-in link. Resolves to a message to show, or nothing once asked. */
  send?: (email: string) => Promise<string | undefined>;
}) {
  const [step, setStep] = useState(initial);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+$/.test(email.trim())) return setMessage('Enter your email address.');
    if (!send) return setStep('sent');
    setBusy(true);
    const problem = await send(email.trim());
    setMessage(problem);
    if (!problem) setStep('sent');
    setBusy(false);
  };

  return (
    <SplitLayout illustration={scene}>
      <FormCard>
        {step === 'sent' ? (
          <Heading title="Check your email">
            If {email || 'that address'} belongs to an account with a verified email, a sign-in link is on its way. It works once, for 15 minutes.
          </Heading>
        ) : recovery === 'operator' ? (
          <Heading title="Can’t sign in?">
            Ask whoever runs this Homing for a sign-in link. It signs you in once, so you can add a new passkey.
          </Heading>
        ) : (
          <>
            <Heading title="Can’t sign in?">
              Homing can email you a link that signs you in once, so you can add a new passkey or password.
            </Heading>
            <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
              <Field data-invalid={Boolean(message) || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" autoComplete="username" className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(message) || undefined} />
                {message && <FieldError>{message}</FieldError>}
              </Field>
              <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy}>Send me a sign-in link</Button>
            </form>
            <p className="text-sm text-muted-foreground">Only a verified email gets one. Otherwise, ask whoever runs this Homing.</p>
          </>
        )}
        <a href="/sign-in" className="text-base text-primary underline-offset-4 hover:underline">Back to sign in</a>
      </FormCard>
    </SplitLayout>
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
