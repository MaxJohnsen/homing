import { AccessDenied, personOf, type Session } from './db.ts';
import { addRule, editRule, removeRule, rulesFor, type Rule, type RuleKind } from './guidance.ts';
import { current, itemColumns, publicationOf, publishItem, visible, type Publication } from './knowledge.ts';
import type { FindAccount } from './people.ts';
import { conversionOf, makeCollaborative, type RulesLeaving } from './share-space.ts';
import { readTask, shareTask, type Task } from './tasks.ts';
import { accessibleSpaces, archiveSpace, changeMember, listSpaces, memberChangeFits, newSpace, peopleNames, placeSpace, SpaceRefused, spaceView, type MemberChange, type Space, type Who } from './spaces.ts';

export type Action = 'add rule' | 'change rule' | 'remove rule' | 'add space' | 'change members' | 'publish' | 'share task' | 'archive space' | 'share space';

/**
 * A change of who is in a space: about someone the user shares a space with, by their id, or about
 * whoever has the email the user gave, which Homing looks up only when the user decides.
 */
export interface MembersChange {
  person?: string;
  /** The person's name as the user knew it when it was proposed. */
  personName?: string;
  email?: string;
  member: MemberChange;
}

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
  /** The task it shares. */
  taskId: string | null;
  change: { kind?: RuleKind; text?: string; shared?: boolean; onlyHere?: boolean } & Partial<SpaceChange> & Partial<MembersChange>;
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
  /** For sharing an item: what it says, and what sharing it would do, for the person it's proposed to. */
  publication: Publication | null;
  /** For sharing an item: how many people would see it, as Members shows them, and whether people above too. */
  audience: { people: number; above: boolean } | null;
  /**
   * For archiving a space: how many spaces in it would go with it, as the reader sees them, whether
   * only the reader has it, and whether it's archived now.
   */
  archive: { spaces: number; private: boolean; archived: boolean } | null;
  /**
   * For sharing a space from the person's personal tree: what sharing it would do, while it's still
   * there, as Settings shows it. Null once it's shared, or for anyone else.
   */
  conversion: {
    rulesLeaving: { kind: RuleKind; text: string; from: string | null }[];
    skillsLeaving: { name: string; from: string | null }[];
    places: { id: string; name: string; label: string; people: number; above: boolean }[];
  } | null;
  /** For sharing a task: the task as it is now, if the reader can see it, and whether it's still theirs alone. */
  task: { title: string; description: string | null; due: string | null; done: boolean; shared: boolean; shown: string } | null;
  /** For a suggested space: where the person may put it, and the space it became, if they can open it. */
  places: Place[];
  /** The space approving it created, if the person can open it: its name now, and where it is and who has it. */
  created: { id: string; name: string; where: string } | null;
  /**
   * For a change of members: who it's about, by name when known, and for an email, whether someone
   * uses Homing with it. That's known only where the person decides, never to an assistant.
   */
  member: {
    change: MemberChange;
    name: string | null;
    email: string | null;
    found: boolean | null;
    /** Whether they're a member of the space now, and the space above it they have access through, if any. */
    inSpace: boolean;
    through: string | null;
    why: string | null;
  } | null;
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
  /** For a shared space: how many people have it, as its Members shows them, and whether people above it they can't open have it too. */
  people?: number;
  above?: boolean;
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
  // One person's suggestions are decided one at a time, so two at once can't both be the one waiting.
  await s.tx`select pg_advisory_xact_lock(hashtext('homing.suggest:' || ${personOf(s.principal)!}))`;
  const place = await placeSpace(s, input);
  const asked = input.asked === true;
  if (asked) await notTooMany(s);
  else await rare(s, place.name);
  return insertProposal(s, {
    spaceId: (place.parent ?? place.personal).id,
    action: 'add space',
    itemId: null,
    change: { name: place.name, who: input.who, in: place.parent?.id ?? null, closed: place.closed, ...(asked && { asked }) },
    request: false,
    reason: input.why?.trim() || null,
  });
}

/** A few asked-for spaces wait at a time: the assistant's word that the user asked isn't a licence for more. */
async function notTooMany(s: Session) {
  const [{ waiting }] = await s.tx<{ waiting: number }[]>`
    select count(*)::int as waiting from proposals
    where ${yours(s)} and action = 'add space' and state = 'open' and expires_at > now() and coalesce((change->>'asked')::boolean, false)
  `;
  if (waiting >= 3) throw new SpaceRefused('where', 'Three spaces are already waiting for the user to approve them. Wait until they have decided.');
}

/** Whether a suggestion is rare enough: none waiting, and not one the person already turned down. */
async function rare(s: Session, name: string) {
  const [waiting] = await s.tx<{ id: string; name: string }[]>`
    select id, change->>'name' as name from proposals
    where ${yours(s)} and action = 'add space' and state = 'open' and expires_at > now() and not coalesce((change->>'asked')::boolean, false)
    limit 1
  `;
  if (waiting) throw new NotSuggested(`A suggested space, ${waiting.name}, is already waiting for the user. Don't suggest another space until they decide it.`, waiting.id);
  const [declined] = await s.tx<{ id: string; at: Date }[]>`
    select id, coalesce(decided_at, expires_at) as at from proposals
    where ${yours(s)} and action = 'add space' and lower(change->>'name') = lower(${name}) and not coalesce((change->>'asked')::boolean, false)
      and (state = 'rejected' or (state = 'open' and expires_at <= now()))
    limit 1
  `;
  if (declined) throw new NotSuggested(`The user didn’t create a space called ${name} when it was suggested on ${declined.at.toISOString().slice(0, 10)}. Don't suggest it again.`, declined.id);
}

/**
 * Proposes a change of who is in a space, for an admin to approve (spec §1, §6): adding someone,
 * which shares the space's knowledge and guidance with them, making them an admin or a member, or
 * removing them. Someone the user shares a space with is named by id. Anyone else is named by
 * email, and the proposal is the same whether or not that email has an account.
 */
export async function proposeMemberChange(s: Session, input: { spaceId: string; person?: { id: string; name: string }; email?: string; change: MemberChange; why?: string }): Promise<Proposal> {
  const space = await spaceView(s, input.spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (input.person) await memberChangeFits(s, space, input.person.id, input.change);
  else if (space.privateTo) throw new SpaceRefused('where', 'Spaces in your personal space are only yours. To add people, share the space first, from its Settings.');
  else if (!space.admin) throw new SpaceRefused('admin', `Only ${space.name}’s admins change who’s in it.`);
  return insertProposal(s, {
    spaceId: space.id,
    action: 'change members',
    itemId: null,
    change: { ...(input.person ? { person: input.person.id, personName: input.person.name } : { email: input.email!.trim().toLowerCase() }), member: input.change },
    request: false,
    reason: input.why?.trim() || null,
  });
}

/**
 * Proposes sharing one of the person's private items with everyone in its space (spec §5), for
 * them to approve. Only their own items, never in their personal tree.
 */
export async function proposePublish(s: Session, input: { itemId: string; why?: string }): Promise<Proposal> {
  const publication = await publicationOf(s, input.itemId);
  if (!publication) throw new SpaceRefused('missing', 'There’s no item of yours with that reference to share.');
  const space = await spaceView(s, publication.item.spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (space.privateTo) throw new SpaceRefused('where', 'Your personal space has no shared side: what’s in it stays yours.');
  if (!publication.current) throw new SpaceRefused('person', 'That item was replaced since. Share the one that replaced it.');
  const [waiting] = await s.tx<{ id: string }[]>`
    select id from proposals where ${yours(s)} and action = 'publish' and item_id = ${input.itemId}::uuid and state = 'open' and expires_at > now()
  `;
  if (waiting) throw new SpaceRefused('person', `Sharing it already waits for the user (proposal:${waiting.id}). Give them that link again if they need it.`);
  const [{ type }] = await s.tx<{ type: string | null }[]>`select type from pages where id = ${publication.item.pageId}::uuid`;
  if (['guidance', 'skill', 'overview'].includes(type ?? '')) throw new SpaceRefused('where', 'Rules, skills and the overview are shared another way.');
  return insertProposal(s, { spaceId: space.id, action: 'publish', itemId: input.itemId, change: {}, request: false, reason: input.why?.trim() || null });
}

/**
 * Suggests archiving a space whose work is done (spec §1), for the person to approve as one of its
 * admins. Rare by design, as suggested spaces are: one of the assistant's own waiting at a time, and
 * never again for a space the person kept open; a few at a time when the person asked.
 */
export async function suggestArchive(s: Session, input: { spaceId: string; why?: string; asked?: boolean }): Promise<Proposal> {
  // One person's suggestions are made one at a time, so two at once can't both pass the checks.
  await s.tx`select pg_advisory_xact_lock(hashtext('homing.suggest:' || ${personOf(s.principal)!}))`;
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === input.spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (space.privateTo !== null && space.parentId === null) throw new SpaceRefused('where', 'The personal space stays open.');
  if (space.archived) throw new SpaceRefused('where', space.archivedAt ? `${space.name} is archived already.` : `${space.name} is archived already, with the space above it.`);
  if (!space.admin) throw new SpaceRefused('admin', `Only ${space.name}’s admins archive it. The user can ask one of them.`);
  const asked = input.asked === true;
  // What still waits: only suggestions whose space is open, since one archived another way has nothing left to decide.
  const waiting = await s.tx<{ id: string; asked: boolean; spaceId: string }[]>`
    select id, coalesce((change->>'asked')::boolean, false) as asked, space_id from proposals
    where ${yours(s)} and action = 'archive space' and state = 'open' and expires_at > now() and ${spaceOpen(s, 'proposals')}
  `;
  const same = waiting.find((proposal) => proposal.spaceId === space.id);
  if (same) throw new NotSuggested(`Archiving ${space.name} already waits for the user (proposal:${same.id}). Give them that link again if they need it.`, same.id);
  if (asked && waiting.filter((proposal) => proposal.asked).length >= 3) {
    throw new SpaceRefused('where', 'Three archives already wait for the user to approve them. Wait until they have decided.');
  }
  if (!asked) {
    const own = waiting.find((proposal) => !proposal.asked);
    if (own) throw new NotSuggested(`Archiving a space already waits for the user (proposal:${own.id}). Don't suggest another until they decide it.`, own.id);
    // Kept open: turned down, or archived on a suggestion and reopened since, as it's open now.
    const [kept] = await s.tx<{ id: string; at: Date }[]>`
      select id, decided_at as at from proposals
      where ${yours(s)} and action = 'archive space' and space_id = ${space.id}::uuid and state in ('rejected', 'approved')
      order by decided_at desc limit 1
    `;
    if (kept) throw new NotSuggested(`The user kept ${space.name} open after archiving it was suggested on ${kept.at.toISOString().slice(0, 10)}. Don't suggest it again unless they ask.`, kept.id);
  }
  return insertProposal(s, { spaceId: space.id, action: 'archive space', itemId: null, change: asked ? { asked } : {}, request: false, reason: input.why?.trim() || null });
}

/**
 * Proposes sharing a space from the person's personal tree (spec §1), for them to decide on the card
 * where it goes, who has it and what becomes of its rules. One waits at a time for each space.
 */
export async function proposeSpaceShare(s: Session, input: { spaceId: string; why?: string }): Promise<Proposal> {
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === input.spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (!space.privateTo) throw new SpaceRefused('where', `${space.name} is shared already: add people to it with members.change.`);
  if (!space.parentId) throw new SpaceRefused('where', 'The personal space itself stays the user’s own; share a space inside it.');
  if (space.archived) throw new SpaceRefused('where', `${space.name} is archived. Reopen it before sharing it.`);
  const [waiting] = await s.tx<{ id: string }[]>`
    select id from proposals where ${yours(s)} and action = 'share space' and space_id = ${space.id}::uuid and state = 'open' and expires_at > now()
  `;
  if (waiting) throw new SpaceRefused('person', `Sharing ${space.name} already waits for the user (proposal:${waiting.id}). Give them that link again if they need it.`);
  return insertProposal(s, { spaceId: space.id, action: 'share space', itemId: null, change: {}, request: false, reason: input.why?.trim() || null });
}

/** Whether a space is somewhere inside another, as far as the person can see. */
function isInside(space: Space, ancestorId: string, spaces: Space[]): boolean {
  const byId = new Map(spaces.map((candidate) => [candidate.id, candidate]));
  for (let at = space.parentId; at; at = byId.get(at)?.parentId ?? null) if (at === ancestorId) return true;
  return false;
}

/**
 * Proposes sharing one of the person's private tasks with everyone in its space (spec §7), for
 * them to approve. Only their own open tasks, never in their personal tree.
 */
export async function proposeTaskShare(s: Session, input: { taskId: string; why?: string }): Promise<Proposal> {
  // Held until the proposal is made, so two at once can't both pass the check for one already waiting.
  await s.tx`select id from tasks where id = ${input.taskId}::uuid for update`;
  const task = await readTask(s, input.taskId);
  if (task && task.privateTo === null) throw new SpaceRefused('person', 'That task is shared with the space already.');
  if (!task || task.privateTo !== personOf(s.principal)) throw new SpaceRefused('missing', 'There’s no task of the user’s own with that reference to share.');
  const space = await spaceView(s, task.spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (space.privateTo) throw new SpaceRefused('where', 'Their personal space has no shared side: its tasks stay theirs.');
  if (task.doneAt) throw new SpaceRefused('person', 'That task is done, so there’s nothing to share.');
  const [waiting] = await s.tx<{ id: string }[]>`
    select id from proposals where ${yours(s)} and action = 'share task' and task_id = ${input.taskId}::uuid and state = 'open' and expires_at > now()
  `;
  if (waiting) throw new SpaceRefused('person', `Sharing it already waits for the user (proposal:${waiting.id}). Give them that link again if they need it.`);
  return insertProposal(s, { spaceId: space.id, action: 'share task', itemId: null, taskId: input.taskId, change: {}, request: false, reason: input.why?.trim() || null });
}

/** A task as a decision shows it, so approving shares only what was shown. */
function taskShown(task: Task): string {
  return [task.title, task.due ?? '', task.description ?? ''].join('\n');
}

/** A proposal the person can see, with what they need to decide it. */
export async function readProposal(s: Session, proposalId: string, findAccount?: FindAccount): Promise<ProposalView | undefined> {
  const [proposal] = await s.tx<Proposal[]>`
    select ${columns(s)} from proposals where id = ${proposalId}::uuid and ${seen(s)}
  `;
  if (!proposal) return undefined;
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === proposal.spaceId);
  if (!space) return undefined;
  const above = spaces.find((candidate) => candidate.id === space.parentId);
  const rule = proposal.itemId && proposal.action !== 'publish' ? await ruleFor(s, proposal.itemId) : undefined;
  let publication = proposal.action === 'publish' && proposal.itemId ? ((await publicationOf(s, proposal.itemId)) ?? null) : null;
  if (proposal.action === 'publish' && !publication && proposal.itemId) {
    // Once shared, the item may have moved to the shared side: it still shows what was shared.
    const [item] = await s.tx<Publication['item'][]>`select ${itemColumns(s)} from content where id = ${proposal.itemId}::uuid and ${visible(s, 'content')}`;
    const [title] = item ? await s.tx<{ body: string }[]>`select body from content where page_id = ${item.pageId}::uuid and kind = 'title' and ${visible(s, 'content')} order by private_to is null limit 1` : [];
    if (item) publication = { item, pageTitle: title?.body ?? 'Untitled', sharesTitle: false, hidden: [], hiddenUnseen: 0, copy: false, sharedText: null, current: false };
  }
  const task: Task | undefined = proposal.taskId ? await readTask(s, proposal.taskId) : undefined;
  const audienceOf = proposal.action === 'publish' || proposal.action === 'share task' ? await spaceView(s, proposal.spaceId) : undefined;
  const names = await peopleNames(s, [proposal.privateTo, proposal.decidedBy, proposal.change.person ?? null]);
  const admins = proposal.request ? ((await spaceView(s, proposal.spaceId))?.members ?? []).filter((member) => member.admin).map((member) => member.name) : [];
  const created = proposal.spaceCreated ? spaces.find((candidate) => candidate.id === proposal.spaceCreated) : undefined;
  // Whether an email has an account is looked up only where the person it was proposed to decides,
  // while they're an admin of the space.
  const deciding = proposal.privateTo === personOf(s.principal) && space.admin && findAccount !== undefined;
  const account = proposal.change.email && deciding ? await findAccount!(proposal.change.email) : undefined;
  // Who it's about, if the reader can see them, and whether they're in the space now or through a space above.
  const subject = proposal.change.person && names.has(proposal.change.person) ? proposal.change.person : account?.id;
  const standing = proposal.action === 'change members' && subject ? (await spaceView(s, proposal.spaceId))?.members.find((member) => member.id === subject) : undefined;
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
    publication,
    conversion: await conversionFor(s, proposal),
    archive: proposal.action === 'archive space' ? { spaces: spaces.filter((inside) => isInside(inside, proposal.spaceId, spaces)).length, private: space.privateTo !== null, archived: space.archived } : null,
    task: task ? { title: task.title, description: task.description, due: task.due, done: task.doneAt !== null, shared: task.privateTo === null, shown: taskShown(task) } : null,
    audience: audienceOf ? { people: audienceOf.members.length, above: audienceOf.reachedFromAbove } : null,
    places: proposal.action === 'add space' && proposal.state === 'open' && proposal.privateTo === personOf(s.principal) ? await placesFor(s, spaces) : [],
    created: created ? { id: created.id, name: created.name, where: whereItIs(created, spaces) } : null,
    member:
      proposal.action === 'change members'
        ? {
            change: proposal.change.member!,
            // Someone the reader no longer shares a space with keeps the name they had, and can't be added this way.
            name: proposal.change.person ? (names.get(proposal.change.person) ?? proposal.change.personName ?? null) : (account?.name ?? null),
            email: proposal.change.email ?? null,
            found: proposal.change.person ? names.has(proposal.change.person) : deciding ? Boolean(account) : null,
            inSpace: standing?.member ?? false,
            through: standing?.through ?? null,
            why: proposal.reason,
          }
        : null,
  };
}

/** What sharing the space would do, for the person it's proposed to, while it's in their personal tree. */
async function conversionFor(s: Session, proposal: Proposal): Promise<ProposalView['conversion']> {
  if (proposal.action !== 'share space' || proposal.privateTo !== personOf(s.principal)) return null;
  const conversion = await conversionOf(s, proposal.spaceId);
  if (!conversion) return null;
  return {
    rulesLeaving: conversion.rulesLeaving.map((rule) => ({ kind: rule.kind, text: rule.body, from: rule.spaceName })),
    skillsLeaving: conversion.skillsLeaving,
    places: conversion.places,
  };
}

/** "In Acme. Everyone in Acme has it.": where a space is and who has it, for its creator. */
function whereItIs(space: Space, spaces: Space[]): string {
  const parent = spaces.find((candidate) => candidate.id === space.parentId);
  if (space.privateTo) return parent && parent.parentId ? `In ${parent.name}, in your personal space. Only you have it.` : 'In your personal space. Only you have it.';
  if (!parent) return 'A space of its own. Only you have it until you add people.';
  return space.closed ? `In ${parent.name}. Only the people added to it have it.` : `In ${parent.name}. Everyone in ${parent.name} has it.`;
}

/** Where the person can put a new space: anywhere in their personal tree, and in the shared spaces they look after. */
async function placesFor(s: Session, spaces: Space[]): Promise<Place[]> {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const personal = (space: Space) => space.privateTo !== null && space.parentId === null;
  // "Website, in Acme › Havbris": its own name first, as New space has it.
  const label = (space: Space) => {
    if (personal(space)) return 'Your personal space';
    const above: string[] = [];
    for (let at = space.parentId ? byId.get(space.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) {
      above.unshift(personal(at) ? 'your personal space' : at.name);
    }
    return above.length ? `${space.name}, in ${above.join(' › ')}` : space.name;
  };
  // Who has a shared space, as its Members shows them: the people in it and in the spaces above it
  // until one is closed, and whether people above that the person can't open have it too.
  const memberships = await s.tx<{ spaceId: string; personId: string }[]>`
    select space_id, person_id from memberships where space_id in (${accessibleSpaces(s)})
  `;
  const audience = (space: Space) => {
    const people = new Set<string>();
    let above = false;
    for (let at: Space | undefined = space; at; ) {
      for (const row of memberships) if (row.spaceId === at.id) people.add(row.personId);
      if (at.closed || !at.parentId) break;
      const next = byId.get(at.parentId);
      if (!next) above = true;
      at = next;
    }
    return { people: people.size, above };
  };
  // An archived space takes no new ones.
  const mine = spaces.filter((space) => space.privateTo && !space.archived).sort((a, b) => Number(personal(b)) - Number(personal(a)));
  const shared = spaces.filter((space) => !space.privateTo && space.admin && !space.archived);
  return [
    ...mine.map((space) => ({ id: space.id, label: label(space), name: space.name, mine: true, personal: personal(space) })),
    ...shared.map((space) => ({ id: space.id, label: label(space), name: space.name, mine: false, personal: false, ...audience(space) })),
  ];
}

/** The person's proposals waiting in a space for them to decide or send, oldest first. */
export async function openProposals(s: Session, spaceId: string): Promise<Proposal[]> {
  return s.tx<Proposal[]>`
    select ${columns(s)} from proposals
    where space_id = ${spaceId}::uuid and ${yours(s)} and state = 'open' and expires_at > now() and ${ruleStands(s, 'proposals')} and ${taskStands(s, 'proposals')} and ${spaceOpen(s, 'proposals')}
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
  /** For a change of members: what changes. The text is who it's about, by name or the email given. */
  member: MemberChange | null;
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
           coalesce(p.change->>'text', p.change->>'name', who.name, p.change->>'email', rule.body, task.title, case when p.action in ('archive space', 'share space') then s.name end) as text, p.agent,
           coalesce((p.change->>'asked')::boolean, false) as asked, p.change->>'member' as member, p.request, p.state = 'requested' as sent, p.private_to,
           coalesce(p.requested_at, p.created_at) as created_at
    from proposals p
    join spaces s on s.id = p.space_id
    left join spaces above on above.id = s.parent_id and above.id in (${accessibleSpaces(s)})
    left join content rule on rule.id = p.item_id and ${visible(s, 'rule')}
    left join tasks task on task.id = p.task_id
    left join people who on who.id = (p.change->>'person')::uuid
    where p.space_id in (${accessibleSpaces(s)}) and p.expires_at > now() and ${ruleStands(s, 'p')} and ${taskStands(s, 'p')} and ${spaceOpen(s, 'p')}
      and ((p.private_to = ${me}::uuid and p.state = 'open')
           or (p.state = 'requested' and p.private_to <> ${me}::uuid and admin_of(p.space_id)))
    order by coalesce(p.requested_at, p.created_at)
  `;
  const names = await peopleNames(s, waiting.map((item) => item.privateTo));
  return waiting.map(({ privateTo, ...item }) => ({ ...item, yours: privateTo === me, askedBy: privateTo === me ? null : (names.get(privateTo) ?? null) }));
}

/** A change or removal waits only while its rule is still there; one whose rule was removed has nothing left to decide. */
/** Sharing a task waits only while the task is still the person's own and open; once shared or done, there's nothing to decide. */
function taskStands(s: Session, table: string) {
  const p = s.tx(table);
  return s.tx`(${p}.task_id is null or exists (
    select from tasks t where t.id = ${p}.task_id and t.private_to is not null and t.done_at is null
  ))`;
}

/** Archiving a space waits only while it's open; archived another way, there's nothing to decide. */
function spaceOpen(s: Session, table: string) {
  const p = s.tx(table);
  return s.tx`(${p}.action <> 'archive space' or not exists (select from archived_since(${p}.space_id)))
    and (${p}.action <> 'share space' or exists (select from spaces x where x.id = ${p}.space_id and x.private_to is not null))`;
}

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
  decision: {
    approve: boolean;
    shown?: string;
    onlyHere?: boolean;
    decidedIn?: string;
    space?: Partial<SpaceChange>;
    /** For sharing a space: where it goes, whether it's closed there, and what becomes of its rules, as the person set them. */
    share?: { in: string | null; closed: boolean; rules: RulesLeaving };
    findAccount?: FindAccount;
  },
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
    if (proposal.action === 'publish') {
      // Approving shares exactly what was shown: if the item changed since, it's shown again.
      // Approving shares exactly the text that was shown, checked again as it's shared.
      const publication = await publicationOf(s, proposal.itemId!);
      if (!publication?.current) throw new Undecidable('changed', 'This was changed or replaced after you opened this page, so there’s nothing to share.');
      if (decision.shown === undefined || !(await publishItem(s, proposal.itemId!, decision.shown))) {
        throw new Undecidable('changed', 'This changed after you opened this page. Check it again before sharing it.');
      }
    } else if (proposal.action === 'share space') {
      if (!decision.share) throw new Undecidable('changed', 'Choose where it goes and what becomes of its rules.');
      // Checked again as it moves, as in Settings: where it may go, the name there, and the rules leaving.
      await makeCollaborative(s, proposal.spaceId, { in: decision.share.in ?? undefined, closed: decision.share.closed, rules: decision.share.rules });
    } else if (proposal.action === 'archive space') {
      // As one of its admins, now, and with the spaces in it that were shown; a space archived
      // meanwhile has nothing left to archive.
      const spaces = await listSpaces(s);
      const space = spaces.find((candidate) => candidate.id === proposal.spaceId);
      if (space?.archived) throw new Undecidable('changed', 'It was archived after you opened this page, so there’s nothing to decide.');
      if (decision.shown !== String(spaces.filter((inside) => isInside(inside, proposal.spaceId, spaces)).length)) {
        throw new Undecidable('changed', 'Spaces went in or out of it after you opened this page. Check it again before archiving it.');
      }
      await archiveSpace(s, proposal.spaceId, true);
    } else if (proposal.action === 'share task') {
      // Only while it's still the person's own and open, and exactly as it was shown.
      await s.tx`select id from tasks where id = ${proposal.taskId}::uuid for update`;
      const task = await readTask(s, proposal.taskId!);
      if (!task || task.privateTo === null || task.doneAt) throw new Undecidable('changed', 'This task was shared, done or removed after you opened this page, so there’s nothing to share.');
      if (decision.shown !== taskShown(task)) throw new Undecidable('changed', 'This task changed after you opened this page. Check it again before sharing it.');
      if (!(await shareTask(s, proposal.taskId!))) throw new Undecidable('changed', 'This task can’t be shared from here anymore.');
    } else if (proposal.action === 'change members') {
      const space = await spaceView(s, proposal.spaceId);
      if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
      // Approving runs what was shown: someone the user still shares a space with, or the email's owner.
      if (change.person && !(await peopleNames(s, [change.person])).has(change.person)) {
        throw new SpaceRefused('person', `You no longer share a space with ${change.personName ?? 'them'}, so they can’t be added this way. Ask for their email instead.`);
      }
      if (!space.admin && !(change.member === 'remove' && change.person === personOf(s.principal))) {
        throw new SpaceRefused('admin', `Only ${space.name}’s admins change who’s in it.`);
      }
      const person = change.person ?? (change.email && decision.findAccount ? (await decision.findAccount(change.email))?.id : undefined);
      if (!person) throw new SpaceRefused('person', `No one uses Homing with ${change.email} yet. Once they’re invited to Homing, they can be added.`);
      await changeMember(s, proposal.spaceId, person, change.member!);
    } else if (proposal.action === 'add space') {
      // As suggested, or as the person changed it before creating it, checked again now.
      const set = decision.space ?? {};
      created = (
        await newSpace(s, {
          name: set.name ?? change.name!,
          who: set.who ?? change.who!,
          in: (set.in === undefined ? change.in : set.in) ?? undefined,
          closed: set.closed ?? change.closed,
        })
      ).id;
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
  return readProposal(s, proposalId, decision.findAccount);
}

/** What sharing an item would do, as the decision page, the card and the page itself show it. */
export function publicationData(publication: Publication, audience: { people: number; above: boolean } | null, why: string | null = null) {
  return {
    text: publication.item.body,
    page: publication.pageTitle,
    pageId: publication.item.pageId,
    hidden: publication.hidden.map((source) => (source.space ? { space: source.space, reference: null } : { space: null, reference: source.reference ?? source.excerpt.slice(0, 80) })),
    hiddenUnseen: publication.hiddenUnseen,
    copy: publication.copy,
    sharesTitle: publication.sharesTitle,
    sharedText: publication.sharedText,
    current: publication.current,
    why,
    audience,
  };
}

/** An action as the app names it. */
export const shortAction = { 'add rule': 'add', 'change rule': 'change', 'remove rule': 'remove', 'add space': 'space', 'change members': 'members', publish: 'publish', 'share task': 'task', 'archive space': 'archive', 'share space': 'convert' } as const;

/** What the decision page and the card show: the exact change, where, and what already applies there. */
export function proposalData(proposal: ProposalView) {
  const action = shortAction[proposal.action];
  const rule = proposal.rule;
  return {
    id: proposal.id,
    assistant: proposal.agent ?? 'Your assistant',
    spaceId: proposal.spaceId,
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
    // A change of members: who, and what changes.
    member: proposal.member,
    // Sharing an item: what it says, on which page, what of it others won't see, and who will see it.
    publication: proposal.publication ? publicationData(proposal.publication, proposal.audience, proposal.reason) : null,
    // Archiving a space: how many spaces in it go with it, who has it, whether it's archived now, and why.
    archive: proposal.archive ? { ...proposal.archive, asked: proposal.change.asked ?? false, why: proposal.reason } : null,
    // Sharing a space from the personal tree: what it would do, while it's there, and why.
    conversion: proposal.conversion ? { ...proposal.conversion, why: proposal.reason } : null,
    // Sharing a task: the task as it is now, why, and who will see it.
    task: proposal.task ? { ...proposal.task, why: proposal.reason, audience: proposal.audience } : null,
    alreadyApplies: proposal.alreadyApplies.map((applying) => ({
      kind: applying.kind,
      text: applying.body,
      from: applying.personal ? 'your personal space' : (applying.spaceName ?? 'a space above'),
    })),
  };
}

async function insertProposal(
  s: Session,
  proposal: Pick<Proposal, 'spaceId' | 'action' | 'itemId' | 'change' | 'request' | 'reason'> & { taskId?: string },
): Promise<Proposal> {
  const [inserted] = await s.tx<Proposal[]>`
    insert into proposals (space_id, private_to, action, item_id, task_id, change, request, reason)
    values (${proposal.spaceId}::uuid, ${personOf(s.principal)!}::uuid, ${proposal.action},
            ${proposal.itemId}::uuid, ${proposal.taskId ?? null}::uuid, ${s.tx.json(proposal.change)}, ${proposal.request}, ${proposal.reason})
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
    id, space_id, private_to, action, item_id, task_id, change, agent, request, reason,
    case when state in ('open', 'requested') and expires_at <= now() then 'expired' else state end as state,
    created_at, expires_at, requested_at, admins_emailed, decided_by, decided_at, space_created
  `;
}
