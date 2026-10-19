import { CircleCheck, CircleSlash, Clock, Send } from 'lucide-react';
import { cn } from 'cn';
import { AlreadyApplies } from '@/components/already-applies';
import { ProposedChange } from '@/components/proposed-change';
import { RuleReach } from '@/components/rule-reach';
import { precedenceOf, type ProposalData } from '@/lib/proposals';

/**
 * The exact change an assistant proposed, as the decision page and the card show it: a new rule
 * with where it applies and the rules already there, a change with the rule now above its new
 * wording, or a removal with where it stops applying.
 */
export function ProposalDetails({ proposal, onlyHere, onOnlyHereChange, disabled, idPrefix }: {
  proposal: ProposalData;
  onlyHere: boolean;
  /** Left out where the reach is as asked, such as a request on its way to the admins. */
  onOnlyHereChange?: (value: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { action, kind, rule, shared, personal, space } = proposal;
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
  const { action, kind, state, rule } = proposal;
  const shown = action === 'remove' || (state === 'open' && action !== 'add') ? rule?.text : proposal.text;
  if (!shown) return null;
  return <ProposedChange kind={kind} text={shown} label={action === 'change' && state === 'approved' ? 'Changed to' : undefined} settled />;
}

/** The mark beside an outcome. */
export function OutcomeIcon({ kind, className }: { kind: 'approved' | 'rejected' | 'expired' | 'gone' | 'sent'; className?: string }) {
  const Icon = kind === 'approved' ? CircleCheck : kind === 'expired' ? Clock : kind === 'sent' ? Send : CircleSlash;
  return <Icon aria-hidden="true" className={cn('shrink-0', kind === 'approved' || kind === 'sent' ? 'text-primary' : 'text-muted-foreground', className)} />;
}
