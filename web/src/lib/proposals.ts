import type { RuleKind } from '@/components/proposed-change';

/** A change an assistant proposed, as the decision page and the card show it. */
export interface ProposalData {
  id: string;
  /** The assistant that proposed it, such as Claude. */
  assistant: string;
  space: string;
  /** Whether the space is the person's personal space, whose rules follow them everywhere. */
  personal: boolean;
  /** The space above it, if the person can open that, so two spaces with one name are told apart. */
  within?: string | null;
  action: 'add' | 'change' | 'remove';
  kind: RuleKind;
  /** The new rule, or the rule's new wording. */
  text: string | null;
  /** The rule a change or removal is about, as it is now, and whether it still applies. */
  rule: { text: string; current: boolean } | null;
  shared: boolean;
  onlyHere: boolean;
  state: 'open' | 'approved' | 'rejected' | 'expired';
  /** The rules that already apply where a new one would go. */
  alreadyApplies: { kind: RuleKind; text: string; from: string }[];
}

/** A change waiting for you, as Home and the list of everything waiting show it. */
export interface WaitingData extends Pick<ProposalData, 'id' | 'assistant' | 'space' | 'personal' | 'within' | 'action' | 'kind'> {
  spaceId: string;
  /** The new rule or the rule's new wording, or for a removal the rule as it is now. */
  text: string | null;
  createdAt: string;
}

/** Who wants what, where: "Claude wants to add a rule to Acme". Under a heading that names the place, without it. */
export function wantsTo(proposal: Pick<ProposalData, 'assistant' | 'action' | 'kind' | 'space' | 'personal' | 'within'>, withPlace = true): string {
  const { assistant, action, kind } = proposal;
  const place = withPlace ? ` ${action === 'add' ? 'to' : action === 'change' ? 'in' : 'from'} ${placeOf(proposal)}` : '';
  return action === 'add'
    ? `${assistant} wants to add a rule${place}`
    : action === 'change'
      ? `${assistant} wants to change a ${kind}${place}`
      : `${assistant} wants to remove a ${kind}${place}`;
}

/** "Acme", "Website in Northwind", or "your personal space". */
export function placeOf(proposal: Pick<ProposalData, 'space' | 'personal' | 'within'>): string {
  return proposal.personal ? 'your personal space' : proposal.within ? `${proposal.space} in ${proposal.within}` : proposal.space;
}

/** What happens when a new rule disagrees with one that already applies. */
export function precedenceOf(proposal: Pick<ProposalData, 'kind'>): string {
  return proposal.kind === 'requirement'
    ? 'If it disagrees with another requirement, your assistant stops and tells you.'
    : 'If it disagrees with a requirement, the requirement wins.';
}

/** Whether a change or removal lost its rule before anyone decided. */
export function isGone(proposal: Pick<ProposalData, 'action' | 'rule'>): boolean {
  return proposal.action !== 'add' && !proposal.rule?.current;
}

/** The buttons for deciding it. */
export function buttonsOf(action: ProposalData['action']): { approve: string; reject: string } {
  return action === 'add'
    ? { approve: 'Add rule', reject: 'Don’t add' }
    : action === 'change'
      ? { approve: 'Change rule', reject: 'Don’t change' }
      : { approve: 'Remove rule', reject: 'Keep it' };
}

/** What happened, once it is decided, expired, or no longer possible. Undefined while it waits. */
export function outcomeOf(proposal: ProposalData): { kind: 'approved' | 'rejected' | 'expired' | 'gone'; heading: string; detail: string } | undefined {
  const { action, assistant, state } = proposal;
  const place = placeOf(proposal);
  if (state === 'approved') {
    return {
      kind: 'approved',
      heading: action === 'add' ? `Rule added to ${place}` : action === 'change' ? `Rule changed in ${place}` : `Rule removed from ${place}`,
      detail: action === 'remove' ? 'It no longer applies.' : 'It applies from now on.',
    };
  }
  if (state === 'rejected') {
    return { kind: 'rejected', heading: action === 'add' ? 'Not added' : action === 'change' ? 'Not changed' : 'Not removed', detail: 'Nothing changed.' };
  }
  if (state === 'expired') {
    return { kind: 'expired', heading: 'This request expired', detail: `Nothing changed. Ask ${assistant} again if you still want it.` };
  }
  if (isGone(proposal)) {
    return { kind: 'gone', heading: 'This rule no longer applies', detail: `It was removed after ${assistant} asked, so there’s nothing to decide.` };
  }
  return undefined;
}
