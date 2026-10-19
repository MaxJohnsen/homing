import { useEffect, useRef, useState } from 'react';
import { WebAuthnError } from '@simplewebauthn/browser';
import { api, ApiError } from '@/lib/api';
import { cancelled, createPasskey } from '@/lib/passkeys';
import { Join, type JoinProblem, type JoinState } from '@/screens/join';

interface Invite {
  instanceAdmin: boolean;
  email: string | null;
  invitedBy: string | null;
}

export function JoinPage() {
  // The setup link and invites keep their token in the fragment, which never leaves the browser.
  const token = location.hash.slice(1);
  const kind = location.pathname === '/setup' ? 'setup' : 'invite';
  const [state, setState] = useState<JoinState>({ step: 'checking' });
  // Trying again with the same name and email uses the same ticket, so a sign-up that
  // failed halfway can still finish.
  const ticket = useRef<{ for: string; id: string }>(undefined);

  useEffect(() => {
    (async () => {
      if (!token) return setState({ step: 'expired', kind });
      const me = await api<{ email: string }>('/api/me').catch(() => undefined);
      if (me) return setState({ step: 'signed-in', email: me.email });
      const invite = await api<Invite>('/api/invite', { token }).catch(() => undefined);
      if (!invite) return setState({ step: 'expired', kind });
      const { passwords } = await api<{ passwords: boolean }>('/api/sign-in-options').catch(() => ({ passwords: false }));
      setState({ step: 'form', kind: invite.instanceAdmin ? 'setup' : 'invite', email: invite.email, invitedBy: invite.invitedBy, passwords });
    })();
  }, [token, kind]);

  const ticketFor = async (name: string, email: string) => {
    const entered = `${name}\n${email}`;
    if (ticket.current?.for !== entered) {
      const { ticket: id } = await api<{ ticket: string }>('/api/join', { token, name, email });
      ticket.current = { for: entered, id };
    }
    return ticket.current.id;
  };

  const problem = (error: unknown): JoinProblem => {
    if (error instanceof ApiError && error.code === 'INVITE_EXPIRED') ticket.current = undefined;
    if (cancelled(error)) return { message: "No passkey was made, so there's no account yet. Try again when you're ready." };
    if (error instanceof WebAuthnError) return { message: "This device couldn't make a passkey. Try another browser or device." };
    if (error instanceof ApiError && error.status === 410) setState({ step: 'expired', kind });
    if (error instanceof ApiError) return { field: error.field as JoinProblem['field'], message: error.message };
    return { message: 'Something went wrong. Try again.' };
  };

  return (
    <Join
      state={state}
      actions={{
        async join(name, email) {
          try {
            await createPasskey(await ticketFor(name, email));
            location.assign('/');
          } catch (error) {
            return problem(error);
          }
        },
        async joinWithPassword(name, email, password) {
          try {
            await api('/api/join/password', { ticket: await ticketFor(name, email), password });
            location.assign('/');
          } catch (error) {
            return problem(error);
          }
        },
        async signOut() {
          await api('/api/auth/sign-out', {});
          location.reload();
        },
      }}
    />
  );
}
