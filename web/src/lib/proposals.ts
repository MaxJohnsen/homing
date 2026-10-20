import type { RuleKind } from '@/components/proposed-change';
import type { Place, Who } from '@/components/space-fields';

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
  /** A rule to add, change or remove, or a space an assistant suggests. */
  action: 'add' | 'change' | 'remove' | 'space';
  kind: RuleKind;
  /** The new rule, or the rule's new wording. */
  text: string | null;
  /** The rule a change or removal is about, as it is now, and whether it still applies. */
  rule: { text: string; current: boolean } | null;
  shared: boolean;
  onlyHere: boolean;
  /** Requested means a member sent it to the space's admins, and it waits for one of them. */
  state: 'open' | 'requested' | 'approved' | 'rejected' | 'expired';
  /**
   * For a request to the space's admins: who asked, or null when it's yours, why, whether it's
   * sent, and the admins who can decide it.
   */
  request?: { by: string | null; yours: boolean; why: string | null; sent: boolean; emailed?: boolean | null; admins: string[] } | null;
  /** Who decided it, when that was someone else. */
  decidedBy?: string | null;
  /** The rules that already apply where a new one would go. */
  alreadyApplies: { kind: RuleKind; text: string; from: string }[];
  /**
   * A suggested space: as the assistant suggested it and why, where you can put it instead while
   * it waits, and the space it became once created, if you can open it.
   */
  suggestion?: {
    name: string;
    who: Who;
    in: string | null;
    closed: boolean;
    /** The person asked for it, and it waits because others would see it. Otherwise it's the assistant's own idea. */
    asked: boolean;
    why: string | null;
    places: Place[];
    created: { id: string; name: string } | null;
  } | null;
}

/** A request you sent to a space's admins, as Home shows it under your requests. */
export interface RequestData extends Pick<ProposalData, 'id' | 'space' | 'within' | 'action' | 'kind'> {
  text: string | null;
  state: 'requested' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  /** Whether Homing could email the admins. */
  emailed: boolean | null;
  admins: string[];
  decidedBy: string | null;
}

/** A change waiting for you, as Home and the list of everything waiting show it. */
export interface WaitingData extends Pick<ProposalData, 'id' | 'assistant' | 'space' | 'personal' | 'within' | 'action' | 'kind'> {
  spaceId: string;
  /** For a space: whether you asked for it. */
  asked?: boolean;
  /** For a request: whether it's yours, who asked when it's someone you know, and whether it's sent. */
  request?: { by: string | null; yours: boolean; sent: boolean } | null;
  /** The new rule or the rule's new wording, or for a removal the rule as it is now. */
  text: string | null;
  createdAt: string;
}

/**
 * Who wants what, where: "Claude wants to add a rule to Acme", "Claude wants to ask the admins of Acme
 * to add a rule", or "Cara Lund asks to add a rule to Acme". Under a heading that names the place, without it.
 */
export function wantsTo(proposal: Pick<ProposalData, 'assistant' | 'action' | 'kind' | 'space' | 'personal' | 'within'> & { request?: { by: string | null; yours: boolean } | null; asked?: boolean; suggestion?: { asked: boolean } | null }, withPlace = true): string {
  const { assistant, action, kind, request } = proposal;
  if (action === 'space') return proposal.asked || proposal.suggestion?.asked ? `${assistant} wants to create a space you asked for` : `${assistant} suggests a new space`;
  const what = action === 'add' ? 'add a rule' : action === 'change' ? `change a ${kind}` : `remove a ${kind}`;
  const place = withPlace ? ` ${action === 'add' ? 'to' : action === 'change' ? 'in' : 'from'} ${placeOf(proposal)}` : '';
  if (request && !request.yours) return `${request.by ?? 'A member'} asks to ${what}${place}`;
  if (request) return withPlace ? `${assistant} wants to ask the admins of ${placeOf(proposal)} to ${what}` : `${assistant} wants to ask the admins to ${what}`;
  return `${assistant} wants to ${what}${place}`;
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
  return (proposal.action === 'change' || proposal.action === 'remove') && !proposal.rule?.current;
}

/** The buttons for deciding it, or for a request you haven't sent, for sending it. */
export function buttonsOf(action: ProposalData['action'], sending = false): { approve: string; reject: string } {
  if (sending) return { approve: 'Send request', reject: 'Don’t send' };
  if (action === 'space') return { approve: 'Create space', reject: 'Don’t create' };
  return action === 'add'
    ? { approve: 'Add rule', reject: 'Don’t add' }
    : action === 'change'
      ? { approve: 'Change rule', reject: 'Don’t change' }
      : { approve: 'Remove rule', reject: 'Keep it' };
}

/** Whether this is a request you haven't sent yet, so deciding it means sending it. */
export function isSending(proposal: Pick<ProposalData, 'request' | 'state'>): boolean {
  return Boolean(proposal.request?.yours && !proposal.request.sent && proposal.state === 'open');
}

/** "Ana Berg or Jon Dahl". */
export function eitherOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? 'its admins') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/**
 * What happened, once it is decided, sent, expired, or no longer possible. Undefined while it waits
 * for the reader. A request someone sent waits for the space's admins, so for them it's sent.
 */
export function outcomeOf(proposal: ProposalData): { kind: 'approved' | 'rejected' | 'expired' | 'gone' | 'sent'; heading: string; detail: string } | undefined {
  const { action, assistant, state, request, decidedBy, suggestion } = proposal;
  const place = placeOf(proposal);
  const yours = Boolean(request?.yours);
  if (action === 'space' && suggestion) {
    if (state === 'approved') return { kind: 'approved', heading: 'Space created', detail: 'It’s with your spaces now.' };
    if (state === 'rejected') return { kind: 'rejected', heading: 'Not created', detail: suggestion.asked ? 'Nothing was created.' : 'Nothing was created, and it won’t be suggested again.' };
    if (state === 'expired') {
      return suggestion.asked
        ? { kind: 'expired', heading: 'This expired', detail: `Nothing was created. Ask ${assistant} again if you still want it.` }
        : { kind: 'expired', heading: 'This suggestion expired', detail: `Nothing was created, and it won’t be suggested again. Ask ${assistant} for it if you want it after all.` };
    }
    return undefined;
  }
  if (state === 'requested') {
    if (!yours) return undefined;
    const admins = request!.admins;
    return {
      kind: 'sent',
      heading: `Sent to the admins of ${place}`,
      detail:
        request!.emailed === false
          ? `Waiting for ${eitherOf(admins)}. Homing couldn’t email them, so let them know. It waits on their Home in Homing too.`
          : `Waiting for ${eitherOf(admins)}. Nothing changes until ${admins.length === 1 ? 'they decide' : 'one of them decides'}.`,
    };
  }
  if (state === 'approved') {
    return {
      kind: 'approved',
      heading: action === 'add' ? `Rule added to ${place}` : action === 'change' ? `Rule changed in ${place}` : `Rule removed from ${place}`,
      detail: [decidedBy && `${decidedBy} approved ${yours ? 'your request' : 'it'}.`, action === 'remove' ? 'It no longer applies.' : 'It applies from now on.'].filter(Boolean).join(' '),
    };
  }
  if (state === 'rejected') {
    if (request && yours && !request.sent) return { kind: 'rejected', heading: 'Not sent', detail: 'Nothing changed, and the admins never saw it.' };
    return {
      kind: 'rejected',
      heading: action === 'add' ? 'Not added' : action === 'change' ? 'Not changed' : 'Not removed',
      detail: [decidedBy && `${decidedBy} didn’t approve ${yours ? 'your request' : 'it'}.`, 'Nothing changed.'].filter(Boolean).join(' '),
    };
  }
  if (state === 'expired') {
    if (request && !yours) return { kind: 'expired', heading: 'This request expired', detail: 'Nothing changed, because no admin decided it in time.' };
    return { kind: 'expired', heading: 'This request expired', detail: `Nothing changed. Ask ${assistant} again if you still want it.` };
  }
  if (isGone(proposal)) {
    const asker = request && !yours ? (request.by ?? 'the member') : assistant;
    return { kind: 'gone', heading: 'This rule no longer applies', detail: `It was removed after ${asker} asked, so there’s nothing to decide.` };
  }
  return undefined;
}
