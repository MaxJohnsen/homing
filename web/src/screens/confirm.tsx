import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { buttonsOf, outcomeOf, wantsTo, type ProposalData } from '@/lib/proposals';

/** Approves or rejects, keeping a new rule to its space if asked. Resolves to a message to show, if any. */
export type Decide = (approve: boolean, onlyHere: boolean) => Promise<string | undefined>;

/** The decision an assistant links to, where the person decides a change it proposed. It opens inside the app. */
export function Confirm({ proposal, decide, message: initialMessage }: {
  proposal: ProposalData;
  decide?: Decide;
  /** Something to tell the person before they decide. */
  message?: string;
}) {
  const [onlyHere, setOnlyHere] = useState(proposal.onlyHere);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const { assistant, action } = proposal;
  const outcome = outcomeOf(proposal);
  const buttons = buttonsOf(action);

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
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{wantsTo(proposal)}</h1>
            <ProposalDetails proposal={proposal} onlyHere={onlyHere} onOnlyHereChange={setOnlyHere} disabled={busy} idPrefix="page" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(false)}>
                {buttons.reject}
              </Button>
              <Button size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(true)}>
                {buttons.approve}
              </Button>
            </div>
            {message && <FieldError>{message}</FieldError>}
            <p className="text-sm text-muted-foreground">Only you can approve this. {assistant} can’t do it for you.</p>
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
