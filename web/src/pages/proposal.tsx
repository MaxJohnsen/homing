import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/wordmark';
import { api, ApiError } from '@/lib/api';
import type { ProposalData } from '@/lib/proposals';
import { Confirm } from '@/screens/confirm';

type Loaded = { person: string; proposal: ProposalData };

export function ProposalPage() {
  const id = location.pathname.split('/')[2] ?? '';
  // Undefined while loading, null when there's nothing here for this person.
  const [loaded, setLoaded] = useState<Loaded | null>();

  const load = () =>
    api<Loaded>(`/api/proposals/${id}`).then(setLoaded, (error) => {
      if (error instanceof ApiError && error.status === 401) location.assign(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
      else setLoaded(null);
    });

  useEffect(() => {
    load();
  }, []);

  if (loaded === undefined) return null;
  if (loaded === null) return <Missing />;

  const { proposal } = loaded;
  return (
    <Confirm
      proposal={proposal}
      person={loaded.person}
      decide={async (approve, onlyHere) => {
        try {
          setLoaded(await api<Loaded>(`/api/proposals/${id}/decide`, { approve, onlyHere, shown: proposal.rule?.text }));
        } catch (error) {
          if (!(error instanceof ApiError) || error.status === 403) return error instanceof Error ? error.message : undefined;
          // It changed, expired or was decided elsewhere: show it as it is now.
          await load();
          return error.code === 'CHANGED' ? error.message : undefined;
        }
      }}
    />
  );
}

function Missing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
      <Wordmark className="text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Nothing to decide here</h1>
      <p className="text-base text-muted-foreground">This link is for someone else, or it doesn’t lead anywhere.</p>
      <a href="/" className="text-base text-primary underline-offset-4 hover:underline">Go to Homing</a>
    </main>
  );
}
