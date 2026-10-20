import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { buttonsOf, isSending, outcomeOf, placeOf, wantsTo, type ProposalData } from '@/lib/proposals';

/** Approves or rejects, keeping a new rule to its space if asked. Resolves to a message to show, if any. */
export type Decide = (approve: boolean, onlyHere: boolean) => Promise<string | undefined>;

/**
 * The decision an assistant links to, where the person decides a change it proposed. It opens inside
 * the app. A request to a space's admins comes here twice: first for the member to send it, then for
 * any admin to decide it, and in between it tells the member who it waits for.
 */
export function Confirm({ proposal, decide, message: initialMessage }: {
  proposal: ProposalData;
  decide?: Decide;
  /** Something to tell the person before they decide. */
  message?: string;
}) {
  const [onlyHere, setOnlyHere] = useState(proposal.onlyHere);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const { assistant, action, request } = proposal;
  const sending = isSending(proposal);
  const outcome = outcomeOf(proposal);
  const buttons = buttonsOf(action, sending);
  const place = placeOf(proposal);

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    setMessage(await decide(approve, onlyHere));
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 sm:p-8">
        {!outcome ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{wantsTo(proposal)}</h1>
              {request?.why && <p className="text-base text-muted-foreground">“{request.why}”</p>}
            </div>
            <ProposalDetails proposal={proposal} onlyHere={onlyHere} onOnlyHereChange={sending ? undefined : setOnlyHere} disabled={busy} idPrefix="page" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(false)}>
                {buttons.reject}
              </Button>
              <Button size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(true)}>
                {buttons.approve}
              </Button>
            </div>
            {message && <FieldError>{message}</FieldError>}
            <p className="text-sm text-muted-foreground">
              {sending
                ? `Only the admins of ${place} change its shared rules, so this asks them. Nothing changes until one of them approves it.`
                : request && !request.yours
                  ? `Any admin of ${place} can decide this. ${request.by ? request.by.split(' ')[0] : 'The member who asked'} can’t approve it.`
                  : `Only you can approve this. ${assistant} can’t do it for you.`}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-5" role="status">
            <div className="flex items-start gap-3">
              <OutcomeIcon kind={outcome.kind} className="mt-0.5 size-6" />
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{outcome.heading}</h1>
                <p className="text-sm text-muted-foreground">{outcome.detail}</p>
              </div>
            </div>
            <SettledChange proposal={proposal} />
          </div>
        )}
      </div>
    </div>
  );
}
