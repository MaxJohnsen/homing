import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { cn } from 'cn';
import { focusRing } from '@/components/screen';
import { draftOf, spaceOf, type SpaceSet } from '@/components/space-fields';
import { buttonsOf, isSending, outcomeOf, placeOf, wantsTo, type ProposalData } from '@/lib/proposals';
import { Link } from '@/lib/router';

/**
 * Approves or rejects, keeping a new rule to its space if asked, or creating a suggested space as
 * the person set it. Resolves to what to show, if anything, and which field it's about.
 */
export type Decide = (approve: boolean, onlyHere: boolean, space?: SpaceSet) => Promise<string | { field?: string; message: string } | undefined>;

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
  const [draft, setDraft] = useState(() => (proposal.suggestion ? draftOf(proposal.suggestion.places, proposal.suggestion) : undefined));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field?: string; message: string } | undefined>(initialMessage ? { message: initialMessage } : undefined);
  const { assistant, action, request, suggestion } = proposal;
  const space = draft && suggestion ? spaceOf(draft, suggestion.places) : undefined;
  const sending = isSending(proposal);
  const outcome = outcomeOf(proposal);
  const buttons = buttonsOf(action, sending);
  const place = placeOf(proposal);

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    const answer = await decide(approve, onlyHere, approve ? space : undefined);
    setProblem(typeof answer === 'string' ? { message: answer } : answer);
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 sm:p-8">
        {!outcome ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{wantsTo(proposal)}</h1>
              {(request?.why ?? suggestion?.why) && <p className="text-base text-muted-foreground">“{request?.why ?? suggestion?.why}”</p>}
            </div>
            <ProposalDetails
              proposal={proposal}
              onlyHere={onlyHere}
              onOnlyHereChange={sending ? undefined : setOnlyHere}
              draft={draft}
              onDraftChange={(next) => {
                setDraft(next);
                setProblem(undefined);
              }}
              problem={problem}
              disabled={busy}
              idPrefix="page"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(false)}>
                {buttons.reject}
              </Button>
              <Button size="lg" className="h-11 text-base sm:px-5" disabled={busy || (action === 'space' && !space?.name)} onClick={() => choose(true)}>
                {buttons.approve}
              </Button>
            </div>
            {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
            <p className="text-sm text-muted-foreground">
              {action === 'space'
                ? suggestion?.asked
                  ? `Everyone in ${place} would see its name, so it waits for you. ${assistant} can’t create it without you.`
                  : `Only you can create it. If you don’t, ${assistant} won’t suggest a space called ${suggestion?.name} again.`
                : sending
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
            {suggestion?.created && (
              <Link href={`/spaces/${suggestion.created.id}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Open {suggestion.created.name}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
