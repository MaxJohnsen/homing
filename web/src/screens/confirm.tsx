import { firstChoice, shareButton, shareOf, type ShareChoice } from '@/components/share-space-fields';
import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { cn } from 'cn';
import { focusRing, wrapsLabel } from '@/components/screen';
import { draftOf, spaceOf, type SpaceSet } from '@/components/space-fields';
import { buttonsOf, declineOnly as onlyDecline, isSending, outcomeOf, placeOf, wantsTo, type ProposalData } from '@/lib/proposals';
import { Link } from '@/lib/router';

/**
 * Approves or rejects, keeping a new rule to its space if asked, or creating a suggested space as
 * the person set it. Resolves to what to show, if anything, and which field it's about.
 */
/** Sharing a space from your personal tree: where it goes, whether it's closed there, and what becomes of its rules. */
export type ShareSet = { in: string | null; closed: boolean; rules: 'keep' | 'share' | 'drop' };

export type Decide = (approve: boolean, onlyHere: boolean, space?: SpaceSet, share?: ShareSet) => Promise<string | { field?: string; message: string } | undefined>;

/**
 * The decision an assistant links to, where the person decides a change it proposed. It opens inside
 * the app. A request to a space's admins comes here twice: first for the member to send it, then for
 * any admin to decide it, and in between it tells the member who it waits for.
 */
export function Confirm({ proposal, decide, withdraw, message: initialMessage }: {
  proposal: ProposalData;
  decide?: Decide;
  /** Withdraws a request you sent while it waits for the admins. Answers with what went wrong, if anything. */
  withdraw?: () => Promise<string | undefined>;
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
  const [choice, setChoice] = useState<ShareChoice>(firstChoice);
  const buttons = proposal.conversion
    ? { approve: shareButton(proposal.space, choice, proposal.conversion), reject: 'Keep it only mine' }
    : buttonsOf(action, sending, proposal.member?.change, placeOf(proposal));
  // An email nobody uses Homing with can't be added until they're invited, and what you can't open can't be included.
  const declineOnly = onlyDecline(proposal);
  const blocked = (action === 'space' && !space?.name) || declineOnly;
  const place = placeOf(proposal);

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    const answer = await decide(approve, onlyHere, approve ? space : undefined, approve && proposal.conversion ? shareOf(choice, proposal.conversion) : undefined);
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
              {(request?.why ?? suggestion?.why ?? proposal.member?.why ?? proposal.publication?.why ?? proposal.task?.why ?? proposal.archive?.why ?? proposal.conversion?.why ?? proposal.page?.why) && (
                <p className="text-base text-muted-foreground">“{request?.why ?? suggestion?.why ?? proposal.member?.why ?? proposal.publication?.why ?? proposal.task?.why ?? proposal.archive?.why ?? proposal.conversion?.why ?? proposal.page?.why}”</p>
              )}
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
              share={choice}
              onShareChange={setChoice}
            />
            {/* A long button, such as one naming a space, takes a line of its own, still above the other. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:justify-end">
              <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(false)}>
                {buttons.reject}
              </Button>
              {!declineOnly && (
                <Button size="lg" className={cn(wrapsLabel, 'min-h-11 text-base sm:px-5')} disabled={busy || blocked} onClick={() => choose(true)}>
                  {buttons.approve}
                </Button>
              )}
            </div>
            {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
            <p className="text-sm text-muted-foreground">
              {action === 'members' || action === 'archive'
                ? `Only you can approve this. ${assistant} can’t do it for you.`
                : action === 'convert'
                ? `Only you can share it. ${assistant} can’t do it for you, and everything in it stays only yours until you share it.`
                : action === 'publish' || action === 'task'
                ? `Only you can share it. ${assistant} can’t do it for you, and until you do, it stays only yours.`
                : action === 'space'
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
            {/* A request you sent waits for the admins; you can still take it back, which decides nothing. */}
            {withdraw && proposal.state === 'requested' && request?.yours && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 w-fit text-base sm:px-5"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const answer = await withdraw();
                    setBusy(false);
                    if (answer) setProblem({ message: answer });
                  }}
                >
                  Withdraw request
                </Button>
                {problem && <FieldError>{problem.message}</FieldError>}
              </div>
            )}
            {proposal.action === 'publish' && proposal.state === 'approved' && proposal.publication && (
              <Link href={`/pages/${proposal.publication.pageId}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Open {proposal.publication.page}
              </Link>
            )}
            {proposal.action === 'convert' && proposal.state === 'approved' && proposal.spaceId && (
              <Link href={`/spaces/${proposal.spaceId}/members`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Add people to {proposal.space}
              </Link>
            )}
            {proposal.action === 'archive' && proposal.state === 'approved' && proposal.spaceId && (
              <Link href={`/spaces/${proposal.spaceId}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Open {proposal.space}
              </Link>
            )}
            {(proposal.action === 'archive page' || proposal.action === 'reopen page') && proposal.state === 'approved' && proposal.page?.title && (
              <Link href={`/pages/${proposal.page.id}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Open {proposal.page.title}
              </Link>
            )}
            {proposal.action === 'task' && proposal.state === 'approved' && proposal.spaceId && (
              <Link href={`/spaces/${proposal.spaceId}/tasks`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                Open {proposal.space}’s tasks
              </Link>
            )}
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
