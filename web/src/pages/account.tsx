import { useEffect, useState } from 'react';
import { WebAuthnError } from '@simplewebauthn/browser';
import { api, ApiError } from '@/lib/api';
import { reload, useLoad } from '@/lib/load';
import { cancelled, createPasskey } from '@/lib/passkeys';
import type { ConnectedAccountsData } from '@/lib/connections';
import type { ModelUseData } from '@/lib/model';
import { Account, signInAgainMessage, type AccountData, type AccountNotice } from '@/screens/account';

/** Your account, inside the app. */
export function AccountPage() {
  const account = useLoad<AccountData>('/api/me').data;
  const connections = useLoad<ConnectedAccountsData>('/api/connections').data;
  const model = useLoad<ModelUseData>('/api/model').data;
  // Shown once, after recovering or verifying an email, or a Microsoft sign-in that didn't finish, and not again after a reload.
  const [notice] = useState<AccountNotice | undefined>(() => {
    const params = new URLSearchParams(location.search);
    return (['recovered', 'verified'] as const).find((name) => params.has(name));
  });
  const [notConnected] = useState(() => new URLSearchParams(location.search).has('connection'));
  const load = () => reload('/api/me');

  useEffect(() => {
    if (notice || notConnected) history.replaceState(null, '', '/account');
  }, [notice, notConnected]);

  if (!account) return null;

  return (
    <Account
      account={account}
      notice={notice}
      connections={connections}
      model={model}
      notConnected={notConnected}
      connectionActions={{
        async revoke(id) {
          try {
            await api(`/api/connections/${id}/revoke`, {});
            await reload('/api/connections');
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) await reload('/api/connections');
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async signInAgain(spaceId, id) {
          try {
            const { url } = await api<{ url: string }>(`/api/spaces/${spaceId}/connections/microsoft`, { again: id });
            location.assign(url);
          } catch (error) {
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
      }}
      actions={{
        async disconnect(clientId) {
          try {
            await api('/api/assistants/disconnect', { clientId });
            await load();
          } catch (error) {
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async addPasskey() {
          try {
            await createPasskey();
            await load();
          } catch (error) {
            if (cancelled(error)) return undefined;
            if (error instanceof WebAuthnError && error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
              return 'This device already has a passkey for Homing.';
            }
            if (error instanceof ApiError && error.code === 'SIGN_IN_AGAIN') return signInAgainMessage;
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async removePasskey(id) {
          try {
            await api('/api/auth/passkey/delete-passkey', { id });
            await load();
          } catch (error) {
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async setPassword(password, current) {
          try {
            if (current === undefined) await api('/api/account/password', { password });
            else await api('/api/auth/change-password', { newPassword: password, currentPassword: current });
            await load();
          } catch (error) {
            if (error instanceof ApiError && ['SIGN_IN_AGAIN', 'SESSION_NOT_FRESH'].includes(error.code ?? '')) return signInAgainMessage;
            if (error instanceof ApiError && error.code === 'INVALID_PASSWORD') return "That’s not your current password.";
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async verifyEmail() {
          try {
            await api('/api/auth/send-verification-email', { email: account.email, callbackURL: '/account?verified' });
          } catch (error) {
            return error instanceof Error ? error.message : 'Something went wrong. Try again.';
          }
        },
        async signInAgain() {
          await api('/api/auth/sign-out', {});
          location.assign('/sign-in?next=/account');
        },
      }}
    />
  );
}
