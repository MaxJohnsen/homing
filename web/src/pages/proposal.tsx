import { ScreenHeader } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { reload, useLoad } from '@/lib/load';
import type { ProposalData } from '@/lib/proposals';
import { Confirm } from '@/screens/confirm';

type Loaded = { person: string; proposal: ProposalData };

/** A decision, inside the app, where an assistant's link leads. */
export function ProposalPage({ id }: { id: string }) {
  const path = `/api/proposals/${id}`;
  const { data, error } = useLoad<Loaded>(path);

  if (error?.status === 404) {
    return <ScreenHeader title="Nothing to decide here" meta="This link is for someone else, or it doesn’t lead anywhere." />;
  }
  if (!data) return null;

  const { proposal } = data;
  return (
    <Confirm
      key={proposal.id}
      proposal={proposal}
      decide={async (approve, onlyHere) => {
        try {
          await api<Loaded>(`${path}/decide`, { approve, onlyHere, shown: proposal.rule?.text });
          await Promise.all([reload(path), reload('/api/waiting')]);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status === 403) return error instanceof Error ? error.message : undefined;
          // It changed, expired or was decided elsewhere: show it as it is now.
          await Promise.all([reload(path), reload('/api/waiting')]);
          return error.code === 'CHANGED' ? error.message : undefined;
        }
      }}
    />
  );
}
