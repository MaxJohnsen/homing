import { CircleCheck, CircleSlash, Clock, Send } from 'lucide-react';
import { cn } from 'cn';
import { AlreadyApplies } from '@/components/already-applies';
import { ProposedChange } from '@/components/proposed-change';
import { RuleReach } from '@/components/rule-reach';
import { parentOf, SpaceFields, type SpaceDraft } from '@/components/space-fields';
import { Avatar } from '@/components/screen';
import { placeOf, precedenceOf, type ProposalData } from '@/lib/proposals';

/**
 * The exact change an assistant proposed, as the decision page and the card show it: a new rule
 * with where it applies and the rules already there, a change with the rule now above its new
 * wording, or a removal with where it stops applying.
 */
export function ProposalDetails({ proposal, onlyHere, onOnlyHereChange, draft, onDraftChange, problem, disabled, idPrefix }: {
  proposal: ProposalData;
  onlyHere: boolean;
  /** Left out where the reach is as asked, such as a request on its way to the admins. */
  onOnlyHereChange?: (value: boolean) => void;
  /** A suggested space as the person is setting it. */
  draft?: SpaceDraft;
  onDraftChange?: (draft: SpaceDraft) => void;
  problem?: { field?: string; message: string };
  disabled?: boolean;
  idPrefix: string;
}) {
  const { action, kind, rule, shared, personal, space } = proposal;
  if (action === 'members') return proposal.member ? <MemberChangeDetails proposal={proposal} member={proposal.member} /> : null;
  if (action === 'space') {
    if (!draft || !onDraftChange || !proposal.suggestion) return null;
    // Who has the shared space it would go in, from Homing, since the card can't ask for it.
    const parent = parentOf(draft, proposal.suggestion.places);
    const audience = parent?.people !== undefined ? { people: parent.people, above: parent.above ?? false } : undefined;
    return <SpaceFields draft={draft} onChange={onDraftChange} places={proposal.suggestion.places} audience={audience} problem={problem} disabled={disabled} />;
  }
  if (action === 'add') {
    return (
      <>
        <ProposedChange kind={kind} text={proposal.text!} onlyYou={!shared} />
        <RuleReach
          id={`${idPrefix}-only-here`}
          space={space}
          shared={shared}
          personal={personal}
          onlyHere={onlyHere}
          onOnlyHereChange={onOnlyHereChange}
          disabled={disabled}
        />
        <AlreadyApplies rules={proposal.alreadyApplies} precedence={precedenceOf(proposal)} />
      </>
    );
  }
  return (
    <>
      {action === 'change' ? (
        <div className="flex flex-col gap-3">
          <ProposedChange kind={kind} text={rule!.text} label="Now" settled />
          <ProposedChange kind={kind} text={proposal.text!} label="Changed to" onlyYou={!shared} />
        </div>
      ) : (
        <ProposedChange kind={kind} text={rule!.text} onlyYou={!shared} />
      )}
      <RuleReach id={`${idPrefix}-only-here`} space={space} shared={shared} personal={personal} onlyHere={proposal.onlyHere} removing={action === 'remove'} />
    </>
  );
}

/** What was decided, greyed: the new rule or wording, or the rule as it was when it went. */
export function SettledChange({ proposal }: { proposal: ProposalData }) {
  const { action, kind, state, rule, suggestion, member } = proposal;
  if (action === 'members') return member && <Who member={member} settled />;
  if (action === 'space') {
    return suggestion && <p className="rounded-xl bg-muted px-4 py-3 text-base text-muted-foreground">{suggestion.created?.name ?? suggestion.name}</p>;
  }
  const shown = action === 'remove' || (state === 'open' && action !== 'add') ? rule?.text : proposal.text;
  if (!shown) return null;
  return <ProposedChange kind={kind} text={shown} label={action === 'change' && state === 'approved' ? 'Changed to' : undefined} settled />;
}

/**
 * A change of who is in a space: who it's about, and what it shares or stops sharing with them. For
 * an email nobody uses Homing with, it says they need an invitation first.
 */
function MemberChangeDetails({ proposal, member }: { proposal: ProposalData; member: NonNullable<ProposalData['member']> }) {
  const place = placeOf(proposal);
  const sees = `They’ll see ${place}’s shared knowledge and rules, including what was shared before they joined, and the spaces in it that aren’t closed.`;
  return (
    <>
      <Who member={member} />
      {member.found === false ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          No one uses Homing with {member.email} yet. Whoever looks after Homing can invite them, and then you can add them.
        </p>
      ) : (
        <p className="text-base">
          {member.change === 'add'
            ? sees
            : member.change === 'make admin'
              ? `${sees} As an admin, they also change its shared rules and who’s in it.`
              : member.change === 'make member'
                ? 'They keep their access, but no longer change its shared rules or who’s in it.'
                : `They lose access to ${place} and the spaces in it at once, unless they’re in a space above it.`}
        </p>
      )}
    </>
  );
}

/** Who a change of members is about: their name and the email given, or just the email. */
function Who({ member, settled = false }: { member: NonNullable<ProposalData['member']>; settled?: boolean }) {
  const name = member.name ?? member.email ?? 'Someone';
  return (
    <div className={cn('flex items-center gap-3 rounded-xl bg-muted px-4 py-3', settled && 'text-muted-foreground')}>
      <Avatar name={name} className="size-10 text-sm" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold">{name}</span>
        {member.name && member.email && <span className="truncate text-sm text-muted-foreground">{member.email}</span>}
      </div>
    </div>
  );
}

/** The mark beside an outcome. */
export function OutcomeIcon({ kind, className }: { kind: 'approved' | 'rejected' | 'expired' | 'gone' | 'sent'; className?: string }) {
  const Icon = kind === 'approved' ? CircleCheck : kind === 'expired' ? Clock : kind === 'sent' ? Send : CircleSlash;
  return <Icon aria-hidden="true" className={cn('shrink-0', kind === 'approved' || kind === 'sent' ? 'text-primary' : 'text-muted-foreground', className)} />;
}
