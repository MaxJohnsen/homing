import { failed, LoadFailed, ScreenHeader } from '@/components/screen';
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
  if (failed(error) && !data) return <LoadFailed paths={[path]} />;
  if (!data) return null;

  const { proposal } = data;
  return (
    <Confirm
      key={proposal.id}
      proposal={proposal}
      withdraw={async () => {
        try {
          await api<Loaded>(`${path}/withdraw`, {});
        } catch (error) {
          return error instanceof Error ? error.message : 'Something went wrong. Try again.';
        } finally {
          await Promise.all([reload(path), reload('/api/waiting'), reload('/api/requests')]);
        }
      }}
      decide={async (approve, onlyHere, space, share) => {
        try {
          await api<Loaded>(`${path}/decide`, { approve, onlyHere, shown: proposal.rule?.text ?? proposal.publication?.text ?? proposal.task?.shown ?? proposal.include?.shown ?? (proposal.archive ? String(proposal.archive.spaces) : proposal.conversion?.shown) ?? proposal.page?.shown ?? proposal.plan?.shown, space, share });
          // A created space joins the sidebar.
          await Promise.all([reload(path), reload('/api/waiting'), reload('/api/requests'), (space || share || proposal.plan?.create) && reload('/api/spaces')]);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status === 403) return error instanceof Error ? error.message : undefined;
          // A space that can't be created as set, such as a name that's taken there: say so by the field.
          if (error.status === 400) return { field: error.field, message: error.message };
          // It changed, expired or was decided elsewhere: show it as it is now, which says what happened.
          await Promise.all([reload(path), reload('/api/waiting'), reload('/api/requests')]);
          if (error.code === 'CHANGED') return error.message;
          return [409, 410].includes(error.status) ? undefined : error.message;
        }
      }}
    />
  );
}
