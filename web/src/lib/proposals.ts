import type { ConversionData } from '@/components/share-space-fields';
import type { RuleKind } from '@/components/proposed-change';
import type { Place, Who } from '@/components/space-fields';

/** A change an assistant proposed, as the decision page and the card show it. */
export interface ProposalData {
  id: string;
  /** The assistant that proposed it, such as Claude. */
  assistant: string;
  spaceId?: string;
  space: string;
  /** Whether the space is the person's personal space, whose rules follow them everywhere. */
  personal: boolean;
  /** The space above it, if the person can open that, so two spaces with one name are told apart. */
  within?: string | null;
  /**
   * A rule to add, change or remove, a space an assistant suggests, a change of who is in a space,
   * sharing an item or a task, archiving or reopening a page, or including another space's rules or
   * a skill, or no longer.
   */
  action: 'add' | 'change' | 'remove' | 'space' | 'members' | 'publish' | 'task' | 'archive' | 'convert' | 'archive page' | 'reopen page' | 'include' | 'exclude' | 'plan';
  kind: RuleKind;
  /** The new rule, or the rule's new wording. */
  text: string | null;
  /** The rule a change or removal is about, as it is now, and whether it still applies. */
  rule: { text: string; current: boolean } | null;
  shared: boolean;
  onlyHere: boolean;
  /** Requested means a member sent it to the space's admins, and it waits for one of them. */
  state: 'open' | 'requested' | 'approved' | 'rejected' | 'withdrawn' | 'expired';
  /**
   * For a request to the space's admins: who asked, or null when it's yours, why, whether it's
   * sent, and the admins who can decide it.
   */
  request?: { by: string | null; yours: boolean; why: string | null; sent: boolean; emailed?: boolean | null; admins: string[] } | null;
  /** For a rule or an include that isn't a request, why the assistant proposed it. */
  why?: string | null;
  /** Who decided it, when that was someone else. */
  decidedBy?: string | null;
  /** The assistant that withdrew it, when you didn't yourself. */
  withdrawnBy?: string | null;
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
    created: { id: string; name: string; where: string } | null;
  } | null;
  /**
   * A change of who is in the space: who, by name when known, or the email given, and for an email,
   * whether someone uses Homing with it.
   */
  publication?: PublicationData | null;
  task?: TaskShareData | null;
  /** Sharing a space from your personal tree: what it would do, while it's still there, and why. */
  conversion?: (ConversionData & { why: string | null }) | null;
  /** Archiving the space: how many spaces in it go with it, whether only you have it, whether it's archived now, and why. */
  archive?: { spaces: number; private: boolean; archived: boolean; asked?: boolean; why: string | null; /** Nothing archived or reopened it since it was proposed. */ stands?: boolean } | null;
  /**
   * Archiving or reopening a page in a space others can open: the page as you see it now, untitled
   * when you can't see it anymore, whether it's archived now, whether everyone in the space sees it,
   * whether it still stands (nobody archived or reopened it since), what approving checks it
   * against, why, and whether you asked.
   */
  page?: { id: string; title: string | null; archived: boolean; shared: boolean; stands: boolean; shown: string; asked: boolean; why: string | null } | null;
  /** Including another space's rules or a skill, or no longer: what it brings in for you, as it is now. */
  include?: IncludeData | null;
  /** For an include: whether it's another space's rules or a skill. */
  included?: Included;
  member?: {
    change: MemberChange;
    name: string | null;
    email: string | null;
    found: boolean | null;
    /** Whether they're in the space now, and the space above it they have access through, if any. */
    inSpace?: boolean;
    through?: string | null;
    /** Why, in the user's words, as the assistant gave it. */
    why?: string | null;
  } | null;
  /** Several related changes decided at once: each as it is now, and what they add up to. */
  plan?: PlanData | null;
}

/**
 * A plan, as the decision page and the card show it: the space it creates, if it does, each change
 * in order, who will see what it shares, and what someone it adds will see there.
 */
export interface PlanData {
  /** The space it creates: its name, the space it goes in, and how many people have that one. While it waits, why it can't be created, if it can't. */
  create: { name: string; in: string | null; people: number; above: boolean; problem: string | null } | null;
  /** The space its changes are in, by name, and its id once it exists. */
  space: string;
  spaceId: string | null;
  steps: PlanStepData[];
  /** Who has the space now, whether people above it too, and who the plan adds. */
  audience: { people: number; above: boolean; adding: string[] };
  /** While it waits and adds someone: what they'll see there once it's approved. */
  /**
   * While it waits and adds someone: what they'll see there once it's approved. Rules included from
   * elsewhere are counted by where they're set, as far as you can open them, and elsewhere says it
   * also includes rules you can't open, which they see if they can open them.
   */
  sees: { pages: number; archived: number; tasks: number; rules: number; included?: { from: string; rules: number }[]; elsewhere?: boolean; spaces: number } | null;
  why: string | null;
  /** What approving sends back, so it makes only what was shown. */
  shown: string;
}

/** One change in a plan. While it waits, why it can't be made now, if it can't. */
export interface PlanStepData {
  action: 'publish' | 'task' | 'members' | 'add' | 'change' | 'remove';
  /** Sharing an item, while it can be shared: what sharing it alone would show. */
  publication: PublicationData | null;
  /** Sharing an item: what it says and its page, shared or not. */
  item: { text: string; page: string; pageId: string } | null;
  task: { title: string; description: string | null; due: string | null } | null;
  member: { change: MemberChange; name: string | null; email: string | null; found: boolean | null; inSpace: boolean; through: string | null } | null;
  /** A rule: the new one or its new wording, and for a change or removal the rule as it is now. */
  rule: { kind: RuleKind; text: string | null; now: string | null; shared: boolean; onlyHere: boolean } | null;
  problem: string | null;
}

/** How many changes a plan makes, creating its space among them. */
export function changesIn(plan: Pick<PlanData, 'create' | 'steps'>): number {
  return plan.steps.length + (plan.create ? 1 : 0);
}

/** Whether a change in a plan can't be made now, so it can only be declined. */
export function planBlocked(plan: Pick<PlanData, 'create' | 'steps'>): boolean {
  return Boolean(plan.create?.problem) || plan.steps.some((step) => step.problem);
}

export type MemberChange = 'add' | 'make admin' | 'make member' | 'remove';

/** What an include points to: another space's rules, or one skill. */
export type Included = 'rules' | 'skill' | null;

/**
 * What an include brings in, as the decision page and the card show it: the rules set in the space
 * it points to that would reach you, or the skill. Someone who can't open what it points to sees
 * none of it, not even its name, and can only decline.
 */
export interface IncludeData {
  open: boolean;
  space: { id: string; name: string } | null;
  rules: { kind: RuleKind; text: string; yours: boolean }[];
  skill: { pageId: string; name: string; description: string; from: string | null } | null;
  /** For no longer including it: whether it's still included. */
  current: boolean;
  /** What approving sends back, so it runs only what was shown. */
  shown: string;
}

/** Sharing one of your private items with everyone in its space, as the decision page and the card show it. */
export interface PublicationData {
  text: string;
  /** The page it's on, by its title. */
  page: string;
  pageId: string;
  /** What it rests on that the space can't see: another space, by name, or one of your own sources. */
  hidden: { space: string | null; reference: string | null }[];
  /** Sources it cites that you can no longer open. */
  hiddenUnseen: number;
  /** Sources it rested on that didn't come with the export it was imported from. */
  hiddenElsewhere?: number;
  /** Shared as a copy, citing only what everyone there sees, rather than moving. */
  copy: boolean;
  /** The page has no shared title yet, so yours is shared with it. */
  sharesTitle: boolean;
  /** What everyone sees now from your earlier share, which this updates, if you shared it before. */
  sharedText: string | null;
  /** Still your current item, so it can be shared. */
  current: boolean;
  why: string | null;
  /** Who would see it: how many people, and whether people above it you can't open too. */
  audience: { people: number; above: boolean } | null;
}

/** Sharing one of your private tasks with everyone in its space, as the decision page and the card show it. */
export interface TaskShareData {
  title: string;
  description: string | null;
  /** The day it's due, as YYYY-MM-DD. */
  due: string | null;
  done: boolean;
  /** Already on the space's shared side. */
  shared: boolean;
  /** The task as it's shown, which approving sends back, so only what was shown is shared. */
  shown: string;
  why: string | null;
  audience: { people: number; above: boolean } | null;
}

/** A request you sent to a space's admins, as Home shows it under your requests. */
export interface RequestData extends Pick<ProposalData, 'id' | 'space' | 'within' | 'action' | 'kind' | 'included'> {
  text: string | null;
  state: 'requested' | 'approved' | 'rejected' | 'withdrawn' | 'expired';
  requestedAt: string;
  /** Whether Homing could email the admins. */
  emailed: boolean | null;
  admins: string[];
  decidedBy: string | null;
  /** The assistant that withdrew it, when you didn't yourself. */
  withdrawnBy?: string | null;
}

/** A change waiting for you, as Home and the list of everything waiting show it. */
export interface WaitingData extends Pick<ProposalData, 'id' | 'assistant' | 'space' | 'personal' | 'within' | 'action' | 'kind' | 'included'> {
  spaceId: string;
  /** For a plan: how many changes it makes in its space. The text is the space it creates, if it creates one. */
  changes?: number | null;
  /** For a space: whether you asked for it. */
  asked?: boolean;
  /** For a change of members: what changes. The text is who, by name or email. */
  member?: MemberChange | null;
  /** For a request: whether it's yours, who asked when it's someone you know, and whether it's sent. */
  request?: { by: string | null; yours: boolean; sent: boolean } | null;
  /** The new rule or the rule's new wording, or for a removal the rule as it is now. For an include, its name, if you can open it. */
  text: string | null;
  createdAt: string;
}

/**
 * Who wants what, where: "Claude wants to add a rule to Acme", "Claude wants to ask the admins of Acme
 * to add a rule", or "Cara Lund asks to add a rule to Acme". Under a heading that names the place, without it.
 */
export function wantsTo(
  proposal: Pick<ProposalData, 'assistant' | 'action' | 'kind' | 'space' | 'personal' | 'within' | 'included'> & {
    request?: { by: string | null; yours: boolean } | null;
    asked?: boolean;
    suggestion?: { asked: boolean } | null;
    archive?: { asked?: boolean } | null;
    page?: { asked: boolean } | null;
    member?: MemberChange | { change: MemberChange; name: string | null; email: string | null } | null;
    text?: string | null;
    plan?: Pick<PlanData, 'create' | 'steps'> | null;
    changes?: number | null;
  },
  withPlace = true,
): string {
  const { assistant, action, kind, request } = proposal;
  if (action === 'plan') {
    // The changes in the space it creates, which isn't one of them, or all of them.
    const changes = proposal.plan?.steps.length ?? proposal.changes ?? 0;
    const create = proposal.plan ? proposal.plan.create?.name : proposal.text;
    if (create) return `${assistant} wants to create ${create}${withPlace ? ` in ${placeOf(proposal)}` : ''} and make ${count(changes, 'change')} in it`;
    return `${assistant} wants to make ${count(changes, 'change')}${withPlace ? ` in ${placeOf(proposal)}` : ''}`;
  }
  if (action === 'publish') return withPlace ? `${assistant} wants to share this with ${placeOf(proposal)}` : `${assistant} wants to share this`;
  if (action === 'convert') return `${assistant} wants to share ${proposal.space} with others`;
  if (action === 'task') return withPlace ? `${assistant} wants to share a task with ${placeOf(proposal)}` : `${assistant} wants to share a task`;
  // Whether the user asked is only the assistant's word, so it's said as the assistant's wish.
  if (action === 'archive') {
    const asked = proposal.asked || proposal.archive?.asked;
    return asked ? `${assistant} wants to archive ${withPlace ? placeOf(proposal) : 'it'}` : `${assistant} suggests archiving ${withPlace ? placeOf(proposal) : 'it'}`;
  }
  if (action === 'archive page' || action === 'reopen page') {
    const where = withPlace ? ` in ${placeOf(proposal)}` : '';
    if (action === 'reopen page') return `${assistant} wants to reopen a page${where}`;
    return proposal.asked || proposal.page?.asked ? `${assistant} wants to archive a page${where}` : `${assistant} suggests archiving a page${where}`;
  }
  if (action === 'members') {
    const change = typeof proposal.member === 'string' ? proposal.member : proposal.member?.change;
    const who = typeof proposal.member === 'object' && proposal.member ? (proposal.member.name ?? proposal.member.email) : proposal.text;
    // Under a heading that names the place, it isn't named again.
    const place = withPlace ? placeOf(proposal) : undefined;
    const person = who ?? 'someone';
    return change === 'remove'
      ? `${assistant} wants to remove ${person}${place ? ` from ${place}` : ''}`
      : change === 'make admin'
        ? `${assistant} wants to make ${person} an admin${place ? ` of ${place}` : ''}`
        : change === 'make member'
          ? `${assistant} wants ${person} to be a member${place ? ` of ${place}` : ''}, not an admin`
          : `${assistant} wants to add ${person}${place ? ` to ${place}` : ''}`;
  }
  // Whether the user asked is only the assistant's word, so an asked-for space says where it goes instead.
  if (action === 'space') return proposal.asked || proposal.suggestion?.asked ? `${assistant} wants to create a space in ${placeOf(proposal)}` : `${assistant} suggests a new space`;
  const thing = proposal.included === 'skill' ? 'a skill' : 'rules from another space';
  const what =
    action === 'include' ? `include ${thing}`
    : action === 'exclude' ? `stop including ${thing}`
    : action === 'add' ? 'add a rule' : action === 'change' ? `change a ${kind}` : `remove a ${kind}`;
  const place = withPlace ? ` ${action === 'add' ? 'to' : action === 'remove' ? 'from' : 'in'} ${placeOf(proposal)}` : '';
  if (request && !request.yours) return `${request.by ?? 'A member'} asks to ${what}${place}`;
  if (request) return withPlace ? `${assistant} wants to ask the admins of ${placeOf(proposal)} to ${what}` : `${assistant} wants to ask the admins to ${what}`;
  return `${assistant} wants to ${what}${place}`;
}

/** What a request asks for, after "to": "add a rule", "change a preference", or "include rules from another space". */
export function requestedChange(request: Pick<RequestData, 'action' | 'kind' | 'included'>): string {
  const thing = request.included === 'skill' ? 'a skill' : 'rules from another space';
  if (request.action === 'include') return `include ${thing}`;
  if (request.action === 'exclude') return `stop including ${thing}`;
  return request.action === 'add' ? 'add a rule' : `${request.action} a ${request.kind}`;
}

/** "1 change", "3 changes". */
function count(n: number, thing: string): string {
  return `${n} ${thing}${n === 1 ? '' : 's'}`;
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
export function isGone(proposal: Pick<ProposalData, 'action' | 'rule' | 'publication' | 'task' | 'archive' | 'conversion' | 'page' | 'state' | 'include'>): boolean {
  if (proposal.action === 'include') return false;
  if (proposal.action === 'exclude') return proposal.state === 'open' && Boolean(proposal.include?.open) && !proposal.include?.current;
  if (proposal.action === 'convert') return proposal.state === 'open' && !proposal.conversion;
  // A page you can't see anymore, or one archived or reopened another way, has nothing left to decide.
  if (proposal.action === 'archive page' || proposal.action === 'reopen page') {
    return proposal.state === 'open' && (!proposal.page?.title || proposal.page.archived === (proposal.action === 'archive page') || !proposal.page.stands);
  }
  if (proposal.action === 'archive') return proposal.state === 'open' && Boolean(proposal.archive?.archived || proposal.archive?.stands === false);
  if (proposal.action === 'publish') return proposal.state === 'open' && !proposal.publication?.current;
  if (proposal.action === 'task') return proposal.state === 'open' && (!proposal.task || proposal.task.shared || proposal.task.done);
  return (proposal.action === 'change' || proposal.action === 'remove') && !proposal.rule?.current;
}

/** Whether the reader can only decline it: an email nobody uses Homing with, or including what they can't open. */
export function declineOnly(proposal: Pick<ProposalData, 'action' | 'member' | 'include' | 'plan'>): boolean {
  if (proposal.member?.found === false) return true;
  if (proposal.plan) return planBlocked(proposal.plan);
  return proposal.include?.open === false && !(proposal.action === 'exclude' && proposal.include.current);
}

/** The buttons for deciding it, or for a request you haven't sent, for sending it. A plan's names how many it makes. */
export function buttonsOf(action: ProposalData['action'], sending = false, member?: MemberChange, place?: string, changes = 0): { approve: string; reject: string } {
  if (sending) return { approve: 'Send request', reject: 'Don’t send' };
  if (action === 'plan') return { approve: changes === 2 ? 'Approve both' : `Approve all ${changes}`, reject: 'Decline' };
  // The button names who will see it.
  if (action === 'publish' || action === 'task') return { approve: place ? `Share with ${place}` : 'Share', reject: 'Don’t share' };
  if (action === 'members') {
    return member === 'remove'
      ? { approve: 'Remove', reject: 'Keep them' }
      : member === 'make admin'
        ? { approve: 'Make admin', reject: 'Keep as member' }
        : member === 'make member'
          ? { approve: 'Make member', reject: 'Keep as admin' }
          : { approve: 'Add', reject: 'Don’t add' };
  }
  if (action === 'space') return { approve: 'Create space', reject: 'Don’t create' };
  if (action === 'archive' || action === 'archive page') return { approve: 'Archive', reject: 'Keep it open' };
  if (action === 'reopen page') return { approve: 'Reopen', reject: 'Keep it archived' };
  if (action === 'convert') return { approve: 'Share', reject: 'Keep it only mine' };
  if (action === 'include') return { approve: 'Include', reject: 'Don’t include' };
  if (action === 'exclude') return { approve: 'Stop including', reject: 'Keep it' };
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
  const { action, assistant, state, request, decidedBy, suggestion, member } = proposal;
  const place = placeOf(proposal);
  const yours = Boolean(request?.yours);
  // Withdrawn by you or your assistant: it ended without being decided.
  if (state === 'withdrawn') return { kind: 'gone', heading: 'Withdrawn', detail: `${proposal.withdrawnBy ? `${proposal.withdrawnBy} withdrew it` : 'You withdrew it'} before anyone decided it, so nothing changed.` };
  if (action === 'plan' && proposal.plan) {
    const { plan } = proposal;
    if (state === 'approved') {
      return plan.create
        ? { kind: 'approved', heading: `${plan.space} created`, detail: `It’s in ${place}, and ${count(plan.steps.length, 'change')} ${plan.steps.length === 1 ? 'was' : 'were'} made in it at the same time.` }
        : { kind: 'approved', heading: `Changes made in ${place}`, detail: `All ${changesIn(plan)} were made at the same time.` };
    }
    if (state === 'rejected') return { kind: 'rejected', heading: 'Declined', detail: `Nothing changed. Ask ${assistant} for what you still want of it.` };
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: `Nothing changed. Ask ${assistant} again if you still want it.` };
    return undefined;
  }
  if (action === 'publish') {
    if (state === 'approved') {
      return { kind: 'approved', heading: `Shared with ${place}`, detail: `Everyone in ${place} sees it now, and that you shared it.${proposal.publication?.copy ? ' Where it came from stays only yours.' : ''}` };
    }
    if (state === 'rejected') return { kind: 'rejected', heading: 'Not shared', detail: 'It stays only yours.' };
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: `Nothing was shared. Ask ${assistant} again if you still want it shared.` };
    if (isGone(proposal)) return { kind: 'gone', heading: `This changed after ${assistant} asked`, detail: 'It was changed or replaced since, so there’s nothing to share. Ask again to share it as it is now.' };
    return undefined;
  }
  if (action === 'convert') {
    if (state === 'approved') return { kind: 'approved', heading: `Shared ${proposal.space}`, detail: 'It’s out of your personal space. Add people to it, and share what’s in it when you want others to see it.' };
    if (state === 'rejected') return { kind: 'rejected', heading: 'Kept only yours', detail: 'It stays in your personal space.' };
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: `Nothing was shared. Ask ${assistant} again if you still want to share it.` };
    if (isGone(proposal)) return { kind: 'gone', heading: 'Nothing to decide', detail: 'It was shared or archived since.' };
    return undefined;
  }
  if (action === 'archive') {
    if (state === 'approved') {
      return proposal.archive && !proposal.archive.archived
        ? { kind: 'approved', heading: `Archived ${place}`, detail: 'It was reopened since.' }
        : { kind: 'approved', heading: `Archived ${place}`, detail: 'It’s out of everyday context, and still searchable. You can reopen it in its Settings.' };
    }
    if (state === 'rejected') return { kind: 'rejected', heading: 'Kept open', detail: `Nothing was archived, and ${assistant} won’t suggest archiving it again.` };
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: 'Nothing was archived.' };
    if (isGone(proposal)) {
      return proposal.archive?.archived
        ? { kind: 'gone', heading: 'Already archived', detail: 'It was archived since, so there’s nothing to decide.' }
        : { kind: 'gone', heading: 'Nothing to decide', detail: 'It was archived and reopened since, so there’s nothing to decide.' };
    }
    return undefined;
  }
  if (action === 'archive page' || action === 'reopen page') {
    const archive = action === 'archive page';
    const page = proposal.page;
    if (state === 'approved') {
      return archive
        ? { kind: 'approved', heading: 'Page archived', detail: page?.title && !page.archived ? 'It was reopened since.' : `It’s out of everyday context and the list of pages in ${place}, and still searchable. You can reopen it on the page.` }
        : { kind: 'approved', heading: 'Page reopened', detail: page?.archived ? 'It was archived again since.' : `It’s back in everyday context and the list of pages in ${place}.` };
    }
    if (state === 'rejected') {
      return archive
        ? { kind: 'rejected', heading: 'Kept open', detail: `Nothing was archived, and ${assistant} won’t suggest archiving it again.` }
        : { kind: 'rejected', heading: 'Kept archived', detail: 'Nothing changed.' };
    }
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: archive ? 'Nothing was archived.' : 'Nothing was reopened.' };
    if (isGone(proposal)) {
      if (!page?.title) return { kind: 'gone', heading: 'Nothing to decide', detail: 'You can’t see this page anymore.' };
      if (page.archived !== archive) return { kind: 'gone', heading: 'Nothing to decide', detail: `It was ${archive ? 'archived and reopened' : 'reopened and archived again'} since, so there’s nothing to decide.` };
      return archive
        ? { kind: 'gone', heading: 'Already archived', detail: 'It was archived since, so there’s nothing to decide.' }
        : { kind: 'gone', heading: 'Already open', detail: 'It was reopened since, so there’s nothing to decide.' };
    }
    return undefined;
  }
  if (action === 'task') {
    if (state === 'approved') return { kind: 'approved', heading: `Shared with ${place}`, detail: `Everyone in ${place} sees the task now, and can tick it off.` };
    if (state === 'rejected') return { kind: 'rejected', heading: 'Not shared', detail: `You decided not to share it, so ${assistant} won’t ask again.` };
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: `Nothing was shared. Ask ${assistant} again if you still want it shared.` };
    if (isGone(proposal)) {
      return proposal.task?.shared
        ? { kind: 'gone', heading: 'Already shared', detail: `Everyone in ${place} sees the task already, so there’s nothing to decide.` }
        : { kind: 'gone', heading: 'Nothing to share', detail: 'The task was done or removed since, so there’s nothing to decide.' };
    }
    return undefined;
  }
  if (action === 'members' && member) {
    const who = member.name ?? member.email ?? 'They';
    if (state === 'approved') {
      return member.change === 'remove'
        ? { kind: 'approved', heading: `Removed from ${place}`, detail: `${who} no longer has access.` }
        : member.change === 'make admin'
          ? { kind: 'approved', heading: `Now an admin of ${place}`, detail: `${who} changes its shared rules and who’s in it, with its other admins.` }
          : member.change === 'make member'
            ? { kind: 'approved', heading: `Now a member of ${place}`, detail: `${who} is no longer an admin.` }
            : { kind: 'approved', heading: `Added to ${place}`, detail: `${who} sees its shared knowledge and rules from now on.` };
    }
    if (state === 'rejected') {
      return member.change === 'remove'
        ? { kind: 'rejected', heading: 'Not removed', detail: `${who} is still in ${place}.` }
        : member.change === 'make admin'
          ? { kind: 'rejected', heading: 'Not made an admin', detail: `${who} is still a member of ${place}, not an admin.` }
          : member.change === 'make member'
            ? { kind: 'rejected', heading: 'Still an admin', detail: `${who} is still an admin of ${place}.` }
            : { kind: 'rejected', heading: 'Not added', detail: `${who} wasn’t added to ${place}.` };
    }
    if (state === 'expired') return { kind: 'expired', heading: 'This expired', detail: `Nothing changed. Ask ${assistant} again if you still want it.` };
    return undefined;
  }
  if (action === 'space' && suggestion) {
    if (state === 'approved') return { kind: 'approved', heading: 'Space created', detail: suggestion.created?.where ?? 'It’s with your spaces now.' };
    if (state === 'rejected') return { kind: 'rejected', heading: 'Not created', detail: suggestion.asked ? 'Nothing was created.' : `Nothing was created, and ${assistant} won’t suggest a space called ${suggestion.name} again.` };
    if (state === 'expired') {
      return suggestion.asked
        ? { kind: 'expired', heading: 'This expired', detail: `Nothing was created. Ask ${assistant} again if you still want it.` }
        : { kind: 'expired', heading: 'This suggestion expired', detail: `Nothing was created, and it won’t be suggested again. Ask ${assistant} for it if you want it after all.` };
    }
    return undefined;
  }
  if ((action === 'include' || action === 'exclude') && !(request && yours && !request.sent)) {
    const skill = proposal.included === 'skill';
    const approved = decidedBy ? `${decidedBy} approved ${yours ? 'your request' : 'it'}. ` : '';
    if (state === 'approved') {
      return action === 'include'
        ? { kind: 'approved', heading: `Included in ${place}`, detail: `${approved}${skill ? 'The skill applies here from now on, as it’s set where it comes from.' : 'Its rules apply here from now on, as they’re set where they come from.'}` }
        : { kind: 'approved', heading: `No longer included in ${place}`, detail: `${approved}${skill ? 'The skill no longer applies here.' : 'Its rules no longer apply here.'}` };
    }
    if (state === 'rejected') {
      return {
        kind: 'rejected',
        heading: action === 'include' ? 'Not included' : 'Still included',
        detail: [decidedBy && `${decidedBy} didn’t approve ${yours ? 'your request' : 'it'}.`, 'Nothing changed.'].filter(Boolean).join(' '),
      };
    }
    if (isGone(proposal)) return { kind: 'gone', heading: 'No longer included', detail: 'It was removed since, so there’s nothing to decide.' };
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
