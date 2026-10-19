import { AccessDenied, personOf, type Session } from './db.ts';
import { addRule, editRule, removeRule, rulesFor, type Rule, type RuleKind } from './guidance.ts';
import { current, visible } from './knowledge.ts';
import { accessibleSpaces, listSpaces, peopleNames, spaceView } from './spaces.ts';

export type Action = 'add rule' | 'change rule' | 'remove rule';

/**
 * A change waiting for a person to decide it (spec §6). Expired means nobody decided it in time.
 * A request is a change to shared rules that a member asks the space's admins for: the member
 * sends it, which leaves it requested, and then any admin of the space decides it.
 */
export interface Proposal {
  id: string;
  spaceId: string;
  /** The person it was proposed to: who decides it, or for a request, who sends it. */
  privateTo: string;
  action: Action;
  /** The rule it changes or removes. */
  itemId: string | null;
  change: { kind?: RuleKind; text?: string; shared?: boolean; onlyHere?: boolean };
  /** The assistant that proposed it. */
  agent: string | null;
  /** Whether it asks the space's admins. */
  request: boolean;
  /** Why the person wants it, in their words. */
  reason: string | null;
  state: 'open' | 'requested' | 'approved' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
}

/** A proposal with what someone needs to decide it. */
export interface ProposalView extends Proposal {
  /** Its space, and the space above it if the person can open that, so two spaces with one name are told apart. */
  space: { name: string; personal: boolean; within: string | null };
  /** The rule a change or removal is about, as it is now, or null if it can't be seen. */
  rule: { kind: RuleKind; text: string; shared: boolean; onlyHere: boolean; current: boolean } | null;
  /** For a new rule, the rules that already apply in its space. */
  alreadyApplies: Rule[];
  /** Whether the person reading it is the one it was proposed to. */
  yours: boolean;
  /** Who it was proposed to, and who decided it unless that was the reader, by name. */
  names: { proposedTo: string | null; decidedBy: string | null };
  /** For a request, the space's admins as far as the reader can see them. */
  admins: string[];
}

/** Why a proposal can't be decided as asked. Nothing changed. */
export class Undecidable extends Error {
  readonly reason: 'decided' | 'expired' | 'changed';

  constructor(reason: Undecidable['reason'], message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Proposes adding, changing or removing a rule, for the person to approve.
 * Nothing changes until they do. Their own private rules they decide
 * themselves, and so do admins their space's shared ones. For a member, a
 * change to shared rules becomes a request to the space's admins, which the
 * member sends first.
 */
export async function proposeRule(
  s: Session,
  input: (
    | { action: 'add rule'; spaceId: string; kind: RuleKind; text: string; shared?: boolean; onlyHere?: boolean }
    | { action: 'change rule'; spaceId: string; ruleId: string; text: string }
    | { action: 'remove rule'; spaceId: string; ruleId: string }
  ) & { why?: string },
): Promise<Proposal> {
  const person = personOf(s.principal);
  if (!person) throw new AccessDenied('Only a person can approve changes to rules.');
  const space = (await listSpaces(s)).find((candidate) => candidate.id === input.spaceId);
  if (!space) throw new AccessDenied('There is no space with that reference that you can see.');
  const reason = input.why?.trim() || null;

  if (input.action === 'add rule') {
    const shared = input.shared ?? false;
    if (shared && space.privateTo) throw new AccessDenied('Spaces in a personal tree have no shared side.');
    return insertProposal(s, {
      spaceId: space.id,
      action: input.action,
      itemId: null,
      change: { kind: input.kind, text: input.text, shared, onlyHere: input.onlyHere ?? false },
      request: shared && !space.admin,
      reason,
    });
  }

  // Only rules in the space itself, not ones reaching it from above, which are changed where they are.
  const rule = await ruleFor(s, input.ruleId);
  if (!rule?.current || rule.spaceId !== space.id) {
    throw new AccessDenied('There is no rule with that reference in this space that you can see.');
  }
  return insertProposal(s, {
    spaceId: space.id,
    action: input.action,
    itemId: input.ruleId,
    change: input.action === 'change rule' ? { text: input.text } : {},
    request: rule.shared && !space.admin,
    reason,
  });
}

/** A proposal the person can see, with what they need to decide it. */
export async function readProposal(s: Session, proposalId: string): Promise<ProposalView | undefined> {
  const [proposal] = await s.tx<Proposal[]>`
    select ${columns(s)} from proposals where id = ${proposalId}::uuid and ${seen(s)}
  `;
  if (!proposal) return undefined;
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === proposal.spaceId);
  if (!space) return undefined;
  const above = spaces.find((candidate) => candidate.id === space.parentId);
  const rule = proposal.itemId ? await ruleFor(s, proposal.itemId) : undefined;
  const names = await peopleNames(s, [proposal.privateTo, proposal.decidedBy]);
  const admins = proposal.request ? ((await spaceView(s, proposal.spaceId))?.members ?? []).filter((member) => member.admin).map((member) => member.name) : [];
  return {
    ...proposal,
    space: {
      name: space.name,
      personal: space.privateTo !== null && space.parentId === null,
      within: above ? (above.privateTo !== null && above.parentId === null ? 'your personal space' : above.name) : null,
    },
    rule: rule ? { kind: rule.kind, text: rule.text, shared: rule.shared, onlyHere: rule.onlyHere, current: rule.current } : null,
    alreadyApplies: proposal.action === 'add rule' ? await rulesFor(s, proposal.spaceId) : [],
    yours: proposal.privateTo === personOf(s.principal),
    names: {
      proposedTo: names.get(proposal.privateTo) ?? null,
      decidedBy: proposal.decidedBy && proposal.decidedBy !== personOf(s.principal) ? (names.get(proposal.decidedBy) ?? null) : null,
    },
    admins,
  };
}

/** The person's proposals waiting in a space for them to decide or send, oldest first. */
export async function openProposals(s: Session, spaceId: string): Promise<Proposal[]> {
  return s.tx<Proposal[]>`
    select ${columns(s)} from proposals
    where space_id = ${spaceId}::uuid and ${yours(s)} and state = 'open' and expires_at > now()
    order by created_at
  `;
}

/**
 * Requests in a space the person can see: the ones they sent, still waiting or decided in the last
 * week, and as an admin, the ones waiting for them. Oldest first.
 */
export async function requestsIn(s: Session, spaceId: string): Promise<(Proposal & { yours: boolean })[]> {
  return s.tx<(Proposal & { yours: boolean })[]>`
    select ${columns(s)}, private_to = ${personOf(s.principal) ?? null}::uuid as yours from proposals
    where space_id = ${spaceId}::uuid and ${seen(s)} and requested_at is not null
      and (state = 'requested' or decided_at > now() - interval '7 days' or expires_at > now() - interval '7 days')
    order by requested_at
  `;
}

/** A proposal waiting for the person, as a list shows it. */
export interface Waiting {
  id: string;
  spaceId: string;
  space: string;
  /** Whether the space is the person's personal space. */
  personal: boolean;
  /** The space above it, if the person can open that. */
  within: string | null;
  action: Action;
  kind: RuleKind;
  /** The new rule or the rule's new wording, or for a removal the rule as it is now. */
  text: string | null;
  agent: string | null;
  /** For a request: whether it's sent, and who asked, when it's someone else. */
  request: boolean;
  sent: boolean;
  askedBy: string | null;
  createdAt: Date;
}

/**
 * Everything waiting for the person to decide, in every space they can open, oldest first: their
 * own proposals and requests they haven't sent, and as an admin, requests members sent.
 */
export async function waitingFor(s: Session): Promise<Waiting[]> {
  const me = personOf(s.principal) ?? null;
  const waiting = await s.tx<(Omit<Waiting, 'askedBy'> & { privateTo: string })[]>`
    select p.id, p.space_id, s.name as space, s.private_to is not null and s.parent_id is null as personal,
           case when above.private_to is not null and above.parent_id is null then 'your personal space' else above.name end as within,
           p.action, coalesce(p.change->>'kind', rule.kind, 'preference') as kind,
           coalesce(p.change->>'text', rule.body) as text, p.agent, p.request, p.state = 'requested' as sent, p.private_to,
           coalesce(p.requested_at, p.created_at) as created_at
    from proposals p
    join spaces s on s.id = p.space_id
    left join spaces above on above.id = s.parent_id and above.id in (${accessibleSpaces(s)})
    left join content rule on rule.id = p.item_id and ${visible(s, 'rule')}
    where p.space_id in (${accessibleSpaces(s)}) and p.expires_at > now()
      and ((p.private_to = ${me}::uuid and p.state = 'open')
           or (p.state = 'requested' and p.private_to <> ${me}::uuid and admin_of(p.space_id)))
    order by coalesce(p.requested_at, p.created_at)
  `;
  const names = await peopleNames(s, waiting.map((item) => item.privateTo));
  return waiting.map(({ privateTo, ...item }) => ({ ...item, askedBy: privateTo === me ? null : (names.get(privateTo) ?? null) }));
}

/**
 * Approves or rejects a proposal, once. Approving makes exactly the change
 * that was shown, as the person deciding, so it needs their rights at that
 * moment. A change or removal names the rule's text as it was shown, and if
 * the rule has changed since, nothing happens and it must be shown again.
 * A new rule can be kept to its space while approving it. A decision made
 * on a card in an assistant names it.
 *
 * For a request, the member who asked approves sending it, which changes
 * nothing yet, and then any admin of the space decides it the same way.
 * Returns undefined when there is no such proposal for this person.
 */
export async function decide(
  s: Session,
  proposalId: string,
  decision: { approve: boolean; shown?: string; onlyHere?: boolean; decidedIn?: string },
): Promise<ProposalView | undefined> {
  const [proposal] = await s.tx<Proposal[]>`
    select ${columns(s)} from proposals where id = ${proposalId}::uuid and ${seen(s)} for update
  `;
  if (!proposal) return undefined;
  if (proposal.state === 'expired') throw new Undecidable('expired', 'This request has expired, so nothing changed.');
  const sending = proposal.request && proposal.state === 'open';
  if (proposal.state !== 'open' && proposal.state !== 'requested') throw new Undecidable('decided', 'This request was already decided.');
  if (proposal.state === 'requested' && proposal.privateTo === personOf(s.principal)) {
    throw new Undecidable('decided', 'You sent this request, so one of the space’s admins decides it.');
  }

  if (decision.approve && !sending) {
    const { change } = proposal;
    if (proposal.action === 'add rule') {
      await addRule(s, {
        spaceId: proposal.spaceId,
        kind: change.kind!,
        body: change.text!,
        shared: change.shared,
        onlyHere: decision.onlyHere ?? change.onlyHere,
      });
    } else {
      const rule = await ruleFor(s, proposal.itemId!);
      if (!rule?.current || rule.text !== decision.shown) {
        throw new Undecidable('changed', 'This rule changed after you opened this page. Check the change again.');
      }
      if (proposal.action === 'change rule') await editRule(s, rule.id, change.text!);
      else await removeRule(s, rule.id);
    }
  }
  const state = decision.approve ? (sending ? 'requested' : 'approved') : 'rejected';
  await s.tx`
    update proposals set state = ${state}, decided_in = ${decision.decidedIn ?? null}
    where id = ${proposalId}::uuid and ${seen(s)}
  `;
  return readProposal(s, proposalId);
}

/** What the decision page and the card show: the exact change, where, and what already applies there. */
export function proposalData(proposal: ProposalView) {
  const action = ({ 'add rule': 'add', 'change rule': 'change', 'remove rule': 'remove' } as const)[proposal.action];
  const rule = proposal.rule;
  return {
    id: proposal.id,
    assistant: proposal.agent ?? 'Your assistant',
    space: proposal.space.name,
    personal: proposal.space.personal,
    within: proposal.space.within,
    action,
    kind: proposal.change.kind ?? rule?.kind ?? 'preference',
    // The new rule, or the rule's new wording.
    text: proposal.change.text ?? null,
    // The rule a change or removal is about, as it is now, and whether it still applies.
    rule: rule ? { text: rule.text, current: rule.current } : null,
    shared: proposal.change.shared ?? rule?.shared ?? false,
    onlyHere: proposal.change.onlyHere ?? rule?.onlyHere ?? false,
    state: proposal.state,
    expiresAt: proposal.expiresAt,
    // For a request: who asked, unless it's the reader, why, whether it's sent, and who can decide it.
    request: proposal.request
      ? {
          by: proposal.yours ? null : proposal.names.proposedTo,
          why: proposal.reason,
          sent: proposal.requestedAt !== null,
          admins: proposal.admins,
        }
      : null,
    // Who decided it, when that was someone other than the reader.
    decidedBy: proposal.names.decidedBy,
    alreadyApplies: proposal.alreadyApplies.map((applying) => ({
      kind: applying.kind,
      text: applying.body,
      from: applying.personal ? 'your personal space' : (applying.spaceName ?? 'a space above'),
    })),
  };
}

async function insertProposal(
  s: Session,
  proposal: Pick<Proposal, 'spaceId' | 'action' | 'itemId' | 'change' | 'request' | 'reason'>,
): Promise<Proposal> {
  const [inserted] = await s.tx<Proposal[]>`
    insert into proposals (space_id, private_to, action, item_id, change, request, reason)
    values (${proposal.spaceId}::uuid, ${personOf(s.principal)!}::uuid, ${proposal.action},
            ${proposal.itemId}::uuid, ${s.tx.json(proposal.change)}, ${proposal.request}, ${proposal.reason})
    returning ${columns(s)}
  `;
  return inserted;
}

/** A rule in a space the person can open, whether or not it still applies. */
async function ruleFor(s: Session, ruleId: string) {
  const [rule] = await s.tx<
    { id: string; spaceId: string; kind: RuleKind; text: string; shared: boolean; onlyHere: boolean; current: boolean }[]
  >`
    select id, space_id, kind, body as text, private_to is null as shared, not reaches_down as only_here,
           ${current(s, 'content')} as current
    from content
    where id = ${ruleId}::uuid and kind in ('requirement', 'preference') and ${visible(s, 'content')}
  `;
  return rule;
}

/** The person's own proposals, in spaces they can still open. */
function yours(s: Session) {
  return s.tx`private_to = ${personOf(s.principal) ?? null}::uuid and space_id in (${accessibleSpaces(s)})`;
}

/** What the person may see: their own, and requests sent to a space they're an admin of. Row-level security applies the same rule. */
function seen(s: Session) {
  return s.tx`((${yours(s)}) or (requested_at is not null and admin_of(space_id)))`;
}

function columns(s: Session) {
  return s.tx`
    id, space_id, private_to, action, item_id, change, agent, request, reason,
    case when state in ('open', 'requested') and expires_at <= now() then 'expired' else state end as state,
    created_at, expires_at, requested_at, decided_by, decided_at
  `;
}
