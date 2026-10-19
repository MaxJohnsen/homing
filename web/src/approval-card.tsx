import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { buttonsOf, outcomeOf, placeOf, type ProposalData } from '@/lib/proposals';
import type { Decide } from '@/screens/confirm';

const status = { approved: 'Approved', rejected: 'Rejected', expired: 'Expired', gone: 'Nothing to decide' };

/** The approval shown inside the conversation. Same parts as the page, sized for a chat. */
export function ApprovalCard({ proposal, decide, message: initialMessage }: { proposal?: ProposalData; decide?: Decide; message?: string }) {
  const [onlyHere, setOnlyHere] = useState(proposal?.onlyHere ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const outcome = proposal && outcomeOf(proposal);

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    setMessage(await decide(approve, onlyHere));
    setBusy(false);
  };

  return (
    <section aria-label="Approve a change" className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Wordmark className="text-sm text-foreground" />
        {proposal && <span>{outcome ? status[outcome.kind] : 'Waiting for you'}</span>}
      </div>

      {!proposal ? (
        message ? <FieldError>{message}</FieldError> : <p className="text-sm text-muted-foreground">Getting the change from Homing…</p>
      ) : !outcome ? (
        <>
          <p className="text-base font-medium">
            {proposal.action === 'add'
              ? `Add this rule to ${placeOf(proposal)}?`
              : proposal.action === 'change'
                ? `Change this ${proposal.kind} in ${placeOf(proposal)}?`
                : `Remove this ${proposal.kind} from ${placeOf(proposal)}?`}
          </p>
          <ProposalDetails proposal={proposal} onlyHere={onlyHere} onOnlyHereChange={setOnlyHere} disabled={busy} idPrefix="card" />
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 px-4" disabled={busy} onClick={() => choose(true)}>{buttonsOf(proposal.action).approve}</Button>
            <Button variant="outline" className="h-10 px-4" disabled={busy} onClick={() => choose(false)}>{buttonsOf(proposal.action).reject}</Button>
          </div>
          {message && <FieldError>{message}</FieldError>}
        </>
      ) : (
        <div className="flex flex-col gap-3" role="status">
          <div className="flex items-start gap-2">
            <OutcomeIcon kind={outcome.kind} className="mt-0.5 size-5" />
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-medium">{outcome.heading}</p>
              <p className="text-sm text-muted-foreground">{outcome.detail}</p>
            </div>
          </div>
          <SettledChange proposal={proposal} />
        </div>
      )}
    </section>
  );
}
