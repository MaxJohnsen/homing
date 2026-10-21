import { useState, type FormEvent } from 'react';
import { CircleCheck, Info } from 'lucide-react';
import { Avatar, count, ScreenHeader, Section, Tag } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CopyAddress } from '@/screens/account';

/** What looking after Homing shows: who uses it, and whether it sends email. */
export interface AdminData {
  /** Where this Homing is, such as homing.acme.no. */
  host: string;
  email: { sends: boolean; from: string | null };
  people: { name: string; email: string; joinedAt: string; you: boolean }[];
}

/** An invite just made: a link to share, or sent by email straight to the person. */
export type InviteMade = { link: string; expiresAt: string; emailed: false } | { to: string; expiresAt: string; emailed: true };

/** Makes an invite, by email if an address is given. */
export type MakeInvite = (email?: string) => Promise<InviteMade | { problem: string }>;

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** For whoever looks after Homing: inviting people first, then whether email works, and who uses it. */
export function Admin({ data, invite }: { data: AdminData; invite?: MakeInvite }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ScreenHeader title="Looking after Homing" meta={`Homing at ${data.host}. Looking after it gives you no access to anyone’s spaces.`} />

      <Invite canEmail={data.email.sends} invite={invite} />

      <Section title="Email" tone="raised">
        {data.email.sends ? (
          <p className="flex items-start gap-2 text-base">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Homing sends email{data.email.from ? ` from ${data.email.from}` : ''}: invites, and sign-in links for people who can’t sign in.</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-base">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Homing can’t send email. You share invites as links, and someone who can’t sign in gets a sign-in link from whoever runs the server.</span>
          </p>
        )}
      </Section>

      <Section title="People" tone="raised" description={`${count(data.people.length, 'person uses', 'people use')} Homing here.`}>
        <ul className="-mx-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {data.people.map((person) => (
            <li key={person.email} className="flex items-center gap-3 rounded-xl px-3 py-3">
              <Avatar name={person.name} className="size-10 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-base font-semibold">
                  <span className="truncate">{person.name}{person.you && ' (you)'}</span>
                  {person.you && <Tag>Looks after Homing</Tag>}
                </span>
                <span className="truncate text-sm text-muted-foreground">{person.email}, joined {date.format(new Date(person.joinedAt))}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Invite({ canEmail, invite }: { canEmail: boolean; invite?: MakeInvite }) {
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<InviteMade>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    setBusy(true);
    setMessage(undefined);
    const result = await invite(email.trim() || undefined);
    if ('problem' in result) setMessage(result.problem);
    else {
      setMade(result);
      setEmail('');
    }
    setBusy(false);
  };

  return (
    <Section title="Invite someone" tone="raised" description="They get a link to create their own account. It works once, for a week. Being invited gives them no access to your spaces.">
      {made &&
        (made.emailed ? (
          <p className="text-base" role="status">Sent to {made.to}. The link goes only to them.</p>
        ) : (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-base">Share this link with them:</p>
            <CopyAddress value={made.link} />
          </div>
        ))}

      <form className="flex flex-col gap-4" onSubmit={create} noValidate>
        {canEmail && (
          <Field data-invalid={Boolean(message) || undefined}>
            <FieldLabel htmlFor="invite-email">Their email (optional)</FieldLabel>
            <Input id="invite-email" type="email" className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(message) || undefined} />
          </Field>
        )}
        {message && <FieldError>{message}</FieldError>}
        <div>
          <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy}>
            {email.trim() ? 'Send invite' : made ? 'Create another link' : 'Create invite link'}
          </Button>
        </div>
      </form>
    </Section>
  );
}
