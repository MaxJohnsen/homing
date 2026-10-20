import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { buttonsOf, isSending, outcomeOf, placeOf, type ProposalData } from '@/lib/proposals';
import type { Decide } from '@/screens/confirm';

const status = { approved: 'Approved', rejected: 'Rejected', expired: 'Expired', gone: 'Nothing to decide', sent: 'Sent' };

/** A change made without a decision, such as a new space: what was done, and where. */
export interface Done {
  heading: string;
  /** The space's name, which the assistant chose, so it's set apart from what Homing says. */
  name?: string;
  detail?: string;
  /** Where it opens in Homing. */
  link?: string;
}

/**
 * The approval shown inside the conversation. Same parts as the page, sized for a chat. A change
 * that needed no approval shows what was done instead.
 */
export function ApprovalCard({ proposal, done, decide, onOpen, message: initialMessage }: {
  proposal?: ProposalData;
  done?: Done;
  decide?: Decide;
  /** Opens a page of Homing's, outside the conversation. */
  onOpen?: (link: string) => void;
  message?: string;
}) {
  const [onlyHere, setOnlyHere] = useState(proposal?.onlyHere ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const outcome = proposal && outcomeOf(proposal);
  const sending = proposal ? isSending(proposal) : false;

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    setMessage(await decide(approve, onlyHere));
    setBusy(false);
  };

  if (done && !proposal) {
    return (
      <section aria-label="Done in Homing" className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
        <Wordmark className="text-sm text-foreground" />
        <div className="flex flex-col gap-3" role="status">
          <div className="flex items-start gap-2">
            <OutcomeIcon kind="approved" className="mt-0.5 size-5" />
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-medium">{done.heading}</p>
              {done.detail && <p className="text-sm text-muted-foreground">{done.detail}</p>}
            </div>
          </div>
          {done.name && <p className="rounded-xl bg-muted px-4 py-3 text-base break-words">{done.name}</p>}
        </div>
        {done.link && onOpen && (
          <div>
            <Button variant="outline" className="h-10 px-4" onClick={() => onOpen(done.link!)}>Open in Homing</Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label={proposal || !initialMessage ? 'Approve a change' : 'Homing'} className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Wordmark className="text-sm text-foreground" />
        {proposal && <span>{outcome ? status[outcome.kind] : 'Waiting for you'}</span>}
      </div>

      {!proposal ? (
        // Before there's a proposal, the message comes from the card as it hears back from Homing.
        initialMessage ? <FieldError>{initialMessage}</FieldError> : <p className="text-sm text-muted-foreground">Getting the change from Homing…</p>
      ) : !outcome ? (
        <>
          <p className="text-base font-medium">
            {sending
              ? `Ask the admins of ${placeOf(proposal)} for this change?`
              : proposal.action === 'add'
                ? `Add this rule to ${placeOf(proposal)}?`
                : proposal.action === 'change'
                  ? `Change this ${proposal.kind} in ${placeOf(proposal)}?`
                  : `Remove this ${proposal.kind} from ${placeOf(proposal)}?`}
          </p>
          <ProposalDetails proposal={proposal} onlyHere={onlyHere} onOnlyHereChange={sending ? undefined : setOnlyHere} disabled={busy} idPrefix="card" />
          {sending && <p className="text-sm text-muted-foreground">Only its admins change its shared rules. Nothing changes until one of them approves it.</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 px-4" disabled={busy} onClick={() => choose(true)}>{buttonsOf(proposal.action, sending).approve}</Button>
            <Button variant="outline" className="h-10 px-4" disabled={busy} onClick={() => choose(false)}>{buttonsOf(proposal.action, sending).reject}</Button>
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
