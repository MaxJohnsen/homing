import { AccessDenied, personOf, type Session } from './db.ts';
import { addRule, editRule, removeRule, rulesFor, type Rule, type RuleKind } from './guidance.ts';
import { current, visible } from './knowledge.ts';
import { accessibleSpaces, listSpaces, newSpace, peopleNames, placeSpace, spaceView, type Space, type Who } from './spaces.ts';

export type Action = 'add rule' | 'change rule' | 'remove rule' | 'add space';

/** A space an assistant suggests: its name, who it's for, where it goes, and whether it's closed. */
export interface SpaceChange {
  name: string;
  who: Who;
  in: string | null;
  closed: boolean;
  /** The person asked for it, and approves it because others would see it. Otherwise it's the assistant's own suggestion. */
  asked?: boolean;
}

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
  change: { kind?: RuleKind; text?: string; shared?: boolean; onlyHere?: boolean } & Partial<SpaceChange>;
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
  /** For a sent request, whether Homing could email the space's admins. */
  adminsEmailed: boolean | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  /** For a suggested space, the space approving it created. */
  spaceCreated: string | null;
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
  /** For a suggested space: where the person may put it, and the space it became, if they can open it. */
  places: Place[];
  created: { id: string; name: string } | null;
}

/** A space a new one can go in. */
export interface Place {
  id: string;
  /** Where it sits, from the top: "Your personal space › Reading", or "Acme › Website". */
  label: string;
  name: string;
  /** In the person's personal tree, so for a space just for them. Otherwise a shared space they're an admin of. */
  mine: boolean;
  /** Their personal space itself. */
  personal: boolean;
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

/** Why Homing won't make a suggestion: one is already waiting, or the person declined this one. */
export class NotSuggested extends Error {
  readonly proposalId: string;

  constructor(message: string, proposalId: string) {
    super(message);
    this.proposalId = proposalId;
  }
}

/**
 * Suggests a space for the person to create (spec §1), checked the way creating it is, so it can be
 * created as suggested. Suggestions are rare: while one waits, there's no other, and a space the
 * person declined, or let expire, isn't suggested again by name. A space the person asked for that
 * others would see waits for their approval the same way, since its name is shared, but it's theirs
 * to ask for as often as they like.
 */
export async function suggestSpace(s: Session, input: { name: string; who: Who; in?: string; closed?: boolean; why?: string; asked?: boolean }): Promise<Proposal> {
  const place = await placeSpace(s, input);
  const asked = input.asked === true;
  if (!asked) await rare(s, place.name);
  return insertProposal(s, {
    spaceId: (place.parent ?? place.personal).id,
    action: 'add space',
    itemId: null,
    change: { name: place.name, who: input.who, in: place.parent?.id ?? null, closed: place.closed, ...(asked && { asked }) },
    request: false,
    reason: input.why?.trim() || null,
  });
}

/** Whether a suggestion is rare enough: none waiting, and not one the person already turned down. */
async function rare(s: Session, name: string) {
  const [waiting] = await s.tx<{ id: string; name: string }[]>`
    select id, change->>'name' as name from proposals
    where ${yours(s)} and action = 'add space' and state = 'open' and expires_at > now() and not coalesce((change->>'asked')::boolean, false)
    limit 1
  `;
  if (waiting) throw new NotSuggested(`A suggested space, ${waiting.name}, is already waiting for the user.`, waiting.id);
  const [declined] = await s.tx<{ id: string; at: Date }[]>`
    select id, coalesce(decided_at, expires_at) as at from proposals
    where ${yours(s)} and action = 'add space' and lower(change->>'name') = lower(${name})
      and (state = 'rejected' or (state = 'open' and expires_at <= now()))
    limit 1
  `;
  if (declined) throw new NotSuggested(`The user didn’t create a space called ${name} when it was suggested on ${declined.at.toISOString().slice(0, 10)}.`, declined.id);
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
  const created = proposal.spaceCreated ? spaces.find((candidate) => candidate.id === proposal.spaceCreated) : undefined;
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
    places: proposal.action === 'add space' && proposal.state === 'open' && proposal.privateTo === personOf(s.principal) ? placesFor(spaces) : [],
    created: created ? { id: created.id, name: created.name } : null,
  };
}

/** Where the person can put a new space: anywhere in their personal tree, and in the shared spaces they look after. */
function placesFor(spaces: Space[]): Place[] {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const label = (space: Space) => {
    const names: string[] = [];
    for (let at: Space | undefined = space; at; at = at.parentId ? byId.get(at.parentId) : undefined) {
      names.unshift(at.privateTo && !at.parentId ? 'Your personal space' : at.name);
    }
    return names.join(' › ');
  };
  const mine = spaces.filter((space) => space.privateTo).sort((a, b) => Number(b.parentId === null) - Number(a.parentId === null));
  const shared = spaces.filter((space) => !space.privateTo && space.admin);
  return [
    ...mine.map((space) => ({ id: space.id, label: label(space), name: space.name, mine: true, personal: space.parentId === null })),
    ...shared.map((space) => ({ id: space.id, label: label(space), name: space.name, mine: false, personal: false })),
  ];
}

/** The person's proposals waiting in a space for them to decide or send, oldest first. */
export async function openProposals(s: Session, spaceId: string): Promise<Proposal[]> {
  return s.tx<Proposal[]>`
    select ${columns(s)} from proposals
    where space_id = ${spaceId}::uuid and ${yours(s)} and state = 'open' and expires_at > now() and ${ruleStands(s, 'proposals')}
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

/** A request the person sent to a space's admins, with where it stands. */
export interface SentRequest extends Proposal {
  space: string;
  within: string | null;
  kind: RuleKind;
  /** The new rule or the rule's new wording, or for a removal the rule as it is now. */
  text: string | null;
  admins: string[];
  decider: string | null;
}

/** The requests the person sent: those still waiting, and those settled in the last two weeks, newest first. */
export async function requestsSent(s: Session): Promise<SentRequest[]> {
  const me = personOf(s.principal) ?? null;
  const sent = await s.tx<(Proposal & Pick<SentRequest, 'space' | 'within' | 'kind' | 'text'>)[]>`
    with sent as (
      select ${columns(s)} from proposals
      where private_to = ${me}::uuid and space_id in (${accessibleSpaces(s)}) and requested_at is not null
        and (state = 'requested' or coalesce(decided_at, expires_at) > now() - interval '14 days')
    )
    select sent.*, s.name as space,
           case when above.private_to is not null and above.parent_id is null then 'your personal space' else above.name end as within,
           coalesce(sent.change->>'kind', rule.kind, 'preference') as kind, coalesce(sent.change->>'text', rule.body) as text
    from sent
    join spaces s on s.id = sent.space_id
    left join spaces above on above.id = s.parent_id and above.id in (${accessibleSpaces(s)})
    left join content rule on rule.id = sent.item_id and ${visible(s, 'rule')}
    order by sent.requested_at desc
  `;
  const admins = new Map<string, string[]>();
  for (const spaceId of new Set(sent.map((request) => request.spaceId))) {
    admins.set(spaceId, ((await spaceView(s, spaceId))?.members ?? []).filter((member) => member.admin && member.id !== me).map((member) => member.name));
  }
  const names = await peopleNames(s, sent.map((request) => request.decidedBy));
  return sent.map((request) => ({ ...request, admins: admins.get(request.spaceId) ?? [], decider: request.decidedBy ? (names.get(request.decidedBy) ?? null) : null }));
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
  /** For a space: whether the person asked for it, rather than the assistant suggesting it. */
  asked: boolean;
  /** For a request: whether it's sent, whether the person asked themselves, and who asked when it's someone else they know. */
  request: boolean;
  sent: boolean;
  yours: boolean;
  askedBy: string | null;
  createdAt: Date;
}

/**
 * Everything waiting for the person to decide, in every space they can open, oldest first: their
 * own proposals and requests they haven't sent, and as an admin, requests members sent.
 */
export async function waitingFor(s: Session): Promise<Waiting[]> {
  const me = personOf(s.principal) ?? null;
  const waiting = await s.tx<(Omit<Waiting, 'askedBy' | 'yours'> & { privateTo: string })[]>`
    select p.id, p.space_id, s.name as space, s.private_to is not null and s.parent_id is null as personal,
           case when above.private_to is not null and above.parent_id is null then 'your personal space' else above.name end as within,
           p.action, coalesce(p.change->>'kind', rule.kind, 'preference') as kind,
           coalesce(p.change->>'text', p.change->>'name', rule.body) as text, p.agent,
           coalesce((p.change->>'asked')::boolean, false) as asked, p.request, p.state = 'requested' as sent, p.private_to,
           coalesce(p.requested_at, p.created_at) as created_at
    from proposals p
    join spaces s on s.id = p.space_id
    left join spaces above on above.id = s.parent_id and above.id in (${accessibleSpaces(s)})
    left join content rule on rule.id = p.item_id and ${visible(s, 'rule')}
    where p.space_id in (${accessibleSpaces(s)}) and p.expires_at > now() and ${ruleStands(s, 'p')}
      and ((p.private_to = ${me}::uuid and p.state = 'open')
           or (p.state = 'requested' and p.private_to <> ${me}::uuid and admin_of(p.space_id)))
    order by coalesce(p.requested_at, p.created_at)
  `;
  const names = await peopleNames(s, waiting.map((item) => item.privateTo));
  return waiting.map(({ privateTo, ...item }) => ({ ...item, yours: privateTo === me, askedBy: privateTo === me ? null : (names.get(privateTo) ?? null) }));
}

/** A change or removal waits only while its rule is still there; one whose rule was removed has nothing left to decide. */
function ruleStands(s: Session, table: string) {
  const p = s.tx(table);
  return s.tx`(${p}.item_id is null or exists (
    select from content rule where rule.id = ${p}.item_id and ${visible(s, 'rule')} and ${current(s, 'rule')}
  ))`;
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
  decision: { approve: boolean; shown?: string; onlyHere?: boolean; decidedIn?: string; space?: Partial<SpaceChange> },
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

  let created: string | null = null;
  if (decision.approve && !sending) {
    const { change } = proposal;
    if (proposal.action === 'add space') {
      // As suggested, or as the person changed it before creating it, checked again now.
      const space = { name: change.name!, who: change.who!, in: change.in ?? undefined, closed: change.closed, ...decision.space };
      created = (await newSpace(s, { ...space, in: space.in ?? undefined })).id;
    } else if (proposal.action === 'add rule') {
      await addRule(s, {
        spaceId: proposal.spaceId,
        kind: change.kind!,
        body: change.text!,
        shared: change.shared,
        onlyHere: decision.onlyHere ?? change.onlyHere,
      });
    } else {
      // Held until this decision is done, so nobody changes the rule between the check and the change.
      await s.tx`select id from content where id = ${proposal.itemId}::uuid and ${visible(s, 'content')} for update`;
      const rule = await ruleFor(s, proposal.itemId!);
      // Only a rule in the request's own space, whatever the proposal row says.
      if (rule && rule.spaceId !== proposal.spaceId) throw new AccessDenied('That rule isn’t in this space.');
      if (!rule?.current || rule.text !== decision.shown) {
        throw new Undecidable('changed', 'This rule changed after you opened this page. Check the change again.');
      }
      if (proposal.action === 'change rule') await editRule(s, rule.id, change.text!);
      else await removeRule(s, rule.id);
    }
  }
  const state = decision.approve ? (sending ? 'requested' : 'approved') : 'rejected';
  await s.tx`
    update proposals set state = ${state}, decided_in = ${decision.decidedIn ?? null}, space_created = ${created}::uuid
    where id = ${proposalId}::uuid and ${seen(s)}
  `;
  return readProposal(s, proposalId);
}

/** An action as the app names it. */
export const shortAction = { 'add rule': 'add', 'change rule': 'change', 'remove rule': 'remove', 'add space': 'space' } as const;

/** What the decision page and the card show: the exact change, where, and what already applies there. */
export function proposalData(proposal: ProposalView) {
  const action = shortAction[proposal.action];
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
          yours: proposal.yours,
          // Unnamed when it's the reader's, or someone the reader doesn't share a space with.
          by: proposal.yours ? null : proposal.names.proposedTo,
          why: proposal.reason,
          sent: proposal.requestedAt !== null,
          emailed: proposal.adminsEmailed,
          admins: proposal.admins,
        }
      : null,
    // Who decided it, when that was someone other than the reader.
    decidedBy: proposal.names.decidedBy,
    // A suggested space: as suggested, why, where it may go instead, and what it became.
    suggestion:
      proposal.action === 'add space'
        ? {
            name: proposal.change.name!,
            who: proposal.change.who!,
            in: proposal.change.in ?? null,
            closed: proposal.change.closed ?? false,
            asked: proposal.change.asked ?? false,
            why: proposal.reason,
            places: proposal.places,
            created: proposal.created,
          }
        : null,
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
    created_at, expires_at, requested_at, admins_emailed, decided_by, decided_at, space_created
  `;
}
