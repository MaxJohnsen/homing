import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { buttonsOf, outcomeOf, placeOf, type ProposalData } from '@/lib/proposals';

/** Approves or rejects, keeping a new rule to its space if asked. Resolves to a message to show, if any. */
export type Decide = (approve: boolean, onlyHere: boolean) => Promise<string | undefined>;

/** The page an assistant links to, where the person decides a change it proposed. */
export function Confirm({ proposal, person, decide, message: initialMessage }: {
  proposal: ProposalData;
  person: string;
  decide?: Decide;
  /** Something to tell the person before they decide. */
  message?: string;
}) {
  const [onlyHere, setOnlyHere] = useState(proposal.onlyHere);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const { assistant, action, kind } = proposal;
  const place = placeOf(proposal);
  const outcome = outcomeOf(proposal);
  const buttons = buttonsOf(action);

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    setMessage(await decide(approve, onlyHere));
    setBusy(false);
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-5">
        <Wordmark />
        <span className="text-sm text-muted-foreground">{person}</span>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pb-16">
        <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 sm:p-8">
          {!outcome ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {action === 'add'
                  ? `${assistant} wants to add a rule to ${place}`
                  : action === 'change'
                    ? `${assistant} wants to change a ${kind} in ${place}`
                    : `${assistant} wants to remove a ${kind} from ${place}`}
              </h1>
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
                  <p className="text-sm text-muted-foreground">
                    {outcome.detail}
                    {outcome.kind !== 'expired' && ' You can close this page.'}
                  </p>
                </div>
              </div>
              <SettledChange proposal={proposal} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
