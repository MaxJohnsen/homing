import { firstChoice, shareButton, shareOf, type ShareChoice } from '@/components/share-space-fields';
import { useState } from 'react';
import { OutcomeIcon, ProposalDetails, SettledChange } from '@/components/proposal';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';
import { draftOf, spaceOf } from '@/components/space-fields';
import { buttonsOf, declineOnly, isSending, outcomeOf, placeOf, type ProposalData } from '@/lib/proposals';
import type { Decide } from '@/screens/confirm';

const status = { approved: 'Approved', rejected: 'Rejected', expired: 'Expired', gone: 'Nothing to decide', sent: 'Sent' };
const spaceStatus = { ...status, approved: 'Created', rejected: 'Not created' };
const shareStatus = { ...status, approved: 'Shared', rejected: 'Not shared' };
const archiveStatus = { ...status, approved: 'Archived', rejected: 'Kept open' };
const reopenStatus = { ...status, approved: 'Reopened', rejected: 'Kept archived' };

/** "Add Cara Lund to Acme?": a change of members as the card asks it. */
function memberQuestion(proposal: ProposalData, member: NonNullable<ProposalData['member']>): string {
  const who = member.name ?? member.email ?? 'them';
  const place = placeOf(proposal);
  return member.change === 'remove'
    ? `Remove ${who} from ${place}?`
    : member.change === 'make admin'
      ? `Make ${who} an admin of ${place}?`
      : member.change === 'make member'
        ? `Make ${who} a member of ${place}, not an admin?`
        : `Add ${who} to ${place}?`;
}

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
  const [draft, setDraft] = useState(() => (proposal?.suggestion ? draftOf(proposal.suggestion.places, proposal.suggestion) : undefined));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const space = draft && proposal?.suggestion ? spaceOf(draft, proposal.suggestion.places) : undefined;
  const [choice, setChoice] = useState<ShareChoice>(firstChoice);
  const outcome = proposal && outcomeOf(proposal);
  const sending = proposal ? isSending(proposal) : false;
  const buttons = proposal?.conversion
    ? { approve: shareButton(proposal.space, choice, proposal.conversion), reject: 'Keep it only mine' }
    : proposal && buttonsOf(proposal.action, sending, proposal.member?.change, placeOf(proposal));

  const choose = async (approve: boolean) => {
    if (!decide) return;
    setBusy(true);
    const answer = await decide(approve, onlyHere, approve ? space : undefined, approve && proposal?.conversion ? shareOf(choice, proposal.conversion) : undefined);
    setProblem(typeof answer === 'string' ? { message: answer } : answer);
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
        {proposal && <span>{outcome ? (proposal.action === 'space' ? spaceStatus[outcome.kind] : proposal.action === 'publish' || proposal.action === 'task' || proposal.action === 'convert' ? shareStatus[outcome.kind] : proposal.action === 'archive' || proposal.action === 'archive page' ? archiveStatus[outcome.kind] : proposal.action === 'reopen page' ? reopenStatus[outcome.kind] : status[outcome.kind]) : 'Waiting for you'}</span>}
      </div>

      {!proposal ? (
        // Before there's a proposal, the message comes from the card as it hears back from Homing.
        initialMessage ? <FieldError>{initialMessage}</FieldError> : <p className="text-sm text-muted-foreground">Getting the change from Homing…</p>
      ) : !outcome ? (
        <>
          <p className="text-base font-medium">
            {proposal.action === 'space'
              ? proposal.suggestion?.asked
                ? `Create this space in ${placeOf(proposal)}?`
                : `Create the space ${proposal.assistant} suggests?`
              : proposal.action === 'members' && proposal.member
              ? memberQuestion(proposal, proposal.member)
              : proposal.action === 'publish'
              ? `Share this with ${placeOf(proposal)}?`
              : proposal.action === 'task'
              ? `Share this task with ${placeOf(proposal)}?`
              : proposal.action === 'archive'
              ? `Archive ${placeOf(proposal)}?`
              : proposal.action === 'archive page'
              ? `Archive this page in ${placeOf(proposal)}?`
              : proposal.action === 'reopen page'
              ? `Reopen this page in ${placeOf(proposal)}?`
              : proposal.action === 'convert'
              ? `Share ${proposal.space} with others?`
              : (proposal.action === 'include' || proposal.action === 'exclude') && !sending
              ? `${proposal.action === 'include' ? 'Include' : 'Stop including'} ${proposal.include?.skill ? `the skill ${proposal.include.skill.name}` : proposal.include?.space ? `the rules from ${proposal.include.space.name}` : proposal.included === 'skill' ? 'a skill' : 'rules from another space'} in ${placeOf(proposal)}?`
              : sending
              ? `Ask the admins of ${placeOf(proposal)} for this change?`
              : proposal.action === 'add'
                ? `Add this rule to ${placeOf(proposal)}?`
                : proposal.action === 'change'
                  ? `Change this ${proposal.kind} in ${placeOf(proposal)}?`
                  : `Remove this ${proposal.kind} from ${placeOf(proposal)}?`}
          </p>
          {(proposal.suggestion?.why ?? proposal.member?.why ?? proposal.publication?.why ?? proposal.task?.why ?? proposal.archive?.why ?? proposal.conversion?.why ?? proposal.page?.why) && (
            <p className="text-sm text-muted-foreground">“{proposal.suggestion?.why ?? proposal.member?.why ?? proposal.publication?.why ?? proposal.task?.why ?? proposal.archive?.why ?? proposal.conversion?.why ?? proposal.page?.why}”</p>
          )}
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
            idPrefix="card"
            share={choice}
            onShareChange={setChoice}
          />
          {sending && <p className="text-sm text-muted-foreground">Only its admins change its shared rules. Nothing changes until one of them approves it.</p>}
          <div className="flex flex-wrap gap-2">
            {!declineOnly(proposal) && (
              <Button className="h-10 px-4" disabled={busy || (proposal.action === 'space' && !space?.name)} onClick={() => choose(true)}>{buttons!.approve}</Button>
            )}
            <Button variant="outline" className="h-10 px-4" disabled={busy} onClick={() => choose(false)}>{buttons!.reject}</Button>
          </div>
          {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
          {proposal.action === 'space' && !proposal.suggestion?.asked && (
            <p className="text-sm text-muted-foreground">If you don’t create it, {proposal.assistant} won’t suggest a space called {proposal.suggestion?.name} again.</p>
          )}
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
