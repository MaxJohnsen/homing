import { useEffect, useState } from 'react';
import { api, oauthQuery } from '@/lib/api';
import { Connect, type ConnectingAssistant } from '@/screens/connect';

export function ConnectPage() {
  const [assistant, setAssistant] = useState<ConnectingAssistant>();
  const [person, setPerson] = useState('');

  useEffect(() => {
    const clientId = new URLSearchParams(location.search).get('client_id') ?? '';
    api<{ name: string }>('/api/me').then((me) => setPerson(me.name), () => location.assign(`/sign-in${location.search}`));
    api<{ client_name?: string }>(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`).then(
      (client) => setAssistant({ name: client.client_name || siteOf(clientId), site: siteOf(clientId) }),
      () => setAssistant({ name: siteOf(clientId), site: siteOf(clientId) }),
    );
  }, []);

  if (!assistant || !person) return null;

  return (
    <Connect
      assistant={assistant}
      person={person}
      decide={async (allow) => {
        try {
          const next = await api<{ url?: string; redirect_uri?: string }>('/api/auth/oauth2/consent', { accept: allow, ...oauthQuery() });
          location.assign(next.url ?? next.redirect_uri ?? '/');
        } catch {
          return 'This request has expired. Go back to your assistant and connect again.';
        }
      }}
    />
  );
}

function siteOf(clientId: string): string {
  try {
    return new URL(clientId).hostname;
  } catch {
    return clientId;
  }
}
