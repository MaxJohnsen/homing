import { personOf, type Session } from './db.ts';
import {
  checkSpace,
  current,
  insertItem,
  itemColumns,
  sideOf,
  visible,
  visibleContent,
  type Item,
} from './knowledge.ts';
import { accessibleSpaces, listSpaces, type Space } from './spaces.ts';

/** A requirement always applies. A preference can be overridden by a more specific one. */
export type RuleKind = 'requirement' | 'preference';

export interface Rule {
  id: string;
  spaceId: string;
  /** The name of the rule's space, or null when the viewer can't open it. */
  spaceName: string | null;
  /** Whether the rule is in the viewer's personal space, whose guidance follows them everywhere. */
  personal: boolean;
  kind: RuleKind;
  body: string;
  privateTo: string | null;
  onlyHere: boolean;
  /** For a rule another space's guidance includes, the include that brings it. Null for one set where it applies. */
  includedIn: Inclusion | null;
}

/** The include that brings a rule or a skill to where it applies. */
export interface Inclusion {
  id: string;
  /** The space whose guidance includes it. */
  spaceId: string;
  /** Its name, or null when the viewer can't open it, such as a closed space's parent. */
  spaceName: string | null;
  /** Whether it's the viewer's personal space, whose guidance follows them everywhere. */
  personal: boolean;
  /** Included for everyone in that space, or only for the viewer. */
  shared: boolean;
}

/**
 * Adds a rule to a space's guidance. Only a person editing directly can, and
 * a shared rule needs an admin. It reaches the spaces below unless it is
 * marked only here.
 */
export async function addRule(
  s: Session,
  input: { spaceId: string; kind: RuleKind; body: string; shared?: boolean; onlyHere?: boolean },
): Promise<Item> {
  const privateTo = sideOf(s, input.shared);
  await checkSpace(s, input.spaceId, input.shared);
  const [{ pageId }] = await s.tx`select guidance_page(${input.spaceId}::uuid) as page_id`;
  return insertItem(s, {
    pageId,
    spaceId: input.spaceId,
    privateTo,
    kind: input.kind,
    body: input.body,
    reachesDown: !input.onlyHere,
  });
}

/** Rewrites a rule. What it said before stays in its history. */
export async function editRule(s: Session, ruleId: string, body: string): Promise<Item | undefined> {
  if (!(await ownRule(s, ruleId))) return undefined;
  const [rule] = await s.tx<Item[]>`
    update content set body = ${body} where id = ${ruleId}::uuid returning ${itemColumns(s)}
  `;
  return rule;
}

/** Removes a rule for everyone it reaches. It stays in the history. */
export async function removeRule(s: Session, ruleId: string): Promise<boolean> {
  const rule = await ownRule(s, ruleId);
  if (!rule) return false;
  await insertItem(s, { ...rule, kind: 'removed', body: '', supersedes: rule.id, path: null });
  return true;
}

/**
 * The rules that apply in a space, from least to most specific: the
 * viewer's personal guidance first, then each space from the top of the
 * tree down. In each space the rules its guidance includes come first, then
 * its own, with private rules after shared ones. A rule that reaches the
 * space more than one way counts once, where it is most specific.
 * Homing doesn't judge whether two rules contradict each other. The agent
 * does, by this order.
 */
export async function rulesFor(s: Session, spaceId: string): Promise<Rule[]> {
  const rows = await s.tx<(Omit<Rule, 'includedIn'> & Joined)[]>`
    ${applying(s, spaceId)}
    select r.id, r.space_id, sp.name as space_name,
           coalesce(sp.private_to is not null and sp.parent_id is null, false) as personal,
           r.kind, r.body, r.private_to, not r.reaches_down as only_here, ${inclusionColumns(s)}
    from (
      select c.id, c.space_id, c.kind, c.body, c.private_to, c.reaches_down, c.created_at, a.distance,
             null::uuid as include_id, null::uuid as include_space, null::uuid as include_private, null::timestamptz as include_at
      from applies a
      join content c on c.space_id = a.space_id
      join pages p on p.id = c.page_id and p.type = 'guidance'
      where c.kind in ('requirement', 'preference')
        and (a.distance = 0 or c.reaches_down)
        and ${visibleContent(s, 'c')} and ${current(s, 'c')}
      union all
      -- What an include brings is read as the viewer, from a space they can open.
      select c.id, c.space_id, c.kind, c.body, c.private_to, c.reaches_down, c.created_at, i.distance,
             i.include_id, i.include_space, i.include_private, i.include_at
      from included i
      join content c on c.space_id = i.space_id
      join pages p on p.id = c.page_id and p.type = 'guidance'
      where c.kind in ('requirement', 'preference') and c.reaches_down
        and ${visible(s, 'c')} and ${current(s, 'c')}
    ) r
    left join spaces sp on sp.id = r.space_id and sp.id in (${accessibleSpaces(s)})
    ${inclusionJoin(s, 'r')}
    order by r.distance desc, r.include_id is null, r.include_private is not null, r.include_at, r.private_to is not null, r.created_at
  `;
  return mostSpecific(rows.map(withInclusion)).reverse();
}

/**
 * The spaces whose guidance applies in a space, as a query named applies:
 * the space itself at distance 0, each space above it, and the viewer's
 * personal space, which is always the farthest. And what their guidance
 * includes that the viewer can open, as a query named included, each at the
 * distance of the space that includes it.
 */
export function applying(s: Session, spaceId: string) {
  return s.tx`
    with chain (space_id, distance) as (
      select ${spaceId}::uuid, 0
      union all
      select id, distance from spaces_above(${spaceId}::uuid)
    ),
    applies (space_id, distance) as (
      select space_id, distance from chain
      union all
      select id, (select count(*)::integer from chain) from spaces
      where private_to = ${personOf(s.principal) ?? null}::uuid and parent_id is null
        and id not in (select space_id from chain)
    ),
    included (space_id, skill_id, distance, include_id, include_space, include_private, include_at) as (
      select i.space_included, i.skill_included, a.distance, i.id, i.space_id, i.private_to, i.added_at
      from applies a
      join includes i on i.space_id = a.space_id
      where i.removed_at is null and ${includeSeen(s, 'i')} and ${notShadowed(s, 'i')}
    )
  `;
}

/**
 * Not an include only for someone of what the same space also includes for everyone: the one for
 * everyone brings them the same, so theirs waits, and applies again if that one goes.
 */
function notShadowed(s: Session, table: string) {
  const i = s.tx(table);
  return s.tx`not (${i}.private_to is not null and exists (
    select from includes o
    where o.space_id = ${i}.space_id and o.private_to is null and o.removed_at is null
      and coalesce(o.space_included, o.skill_included) = coalesce(${i}.space_included, ${i}.skill_included)
  ))`;
}

/** The columns a rule or skill brought by an include has, from inclusionJoin. */
interface Joined {
  includeId: string | null;
  includeSpace: string | null;
  includeSpaceName: string | null;
  includePersonal: boolean;
  includeShared: boolean;
}

/** The include columns of a query over rows named r, with the include's space joined as isp by inclusionJoin. */
export function inclusionColumns(s: Session) {
  return s.tx`
    r.include_id, r.include_space, isp.name as include_space_name,
    coalesce(isp.private_to is not null and isp.parent_id is null, false) as include_personal,
    r.include_private is null as include_shared
  `;
}

/** The space that includes it, named only if the viewer can open it. */
export function inclusionJoin(s: Session, table: string) {
  return s.tx`left join spaces isp on isp.id = ${s.tx(table)}.include_space and isp.id in (${accessibleSpaces(s)})`;
}

/** A row with its include columns folded into includedIn. */
export function withInclusion<T extends Joined>({ includeId, includeSpace, includeSpaceName, includePersonal, includeShared, ...rest }: T) {
  const includedIn: Inclusion | null = includeId
    ? { id: includeId, spaceId: includeSpace!, spaceName: includeSpaceName, personal: includePersonal, shared: includeShared }
    : null;
  return { ...rest, includedIn };
}

/** Each rule once, where it is most specific: in an order from least to most, the last time it comes. */
function mostSpecific<T extends { id: string }>(rows: T[]): T[] {
  const kept = new Set<string>();
  return rows.toReversed().filter((row) => !kept.has(row.id) && kept.add(row.id));
}

/**
 * An include the viewer may see: one set in a space they can open, shared or
 * their own, or a shared one in a space above that reaches them, and only
 * while they can open what it points to.
 */
export function includeSeen(s: Session, table: string) {
  const i = s.tx(table);
  return s.tx`(
    include_open(${i}.space_included, ${i}.skill_included)
    and (
      (${i}.space_id in (${accessibleSpaces(s)}) and (${i}.private_to is null or ${i}.private_to = ${personOf(s.principal) ?? null}::uuid))
      or (${i}.private_to is null and ${i}.space_id in (select guidance_reach()))
    )
  )`;
}

/** What an include points to: another space, whose rules it brings in, or one skill, by its page. */
export type Included = { space: string; skill?: undefined } | { skill: string; space?: undefined };

/** An include set in a space, as someone who can open what it points to sees it. */
export interface Include {
  id: string;
  spaceId: string;
  privateTo: string | null;
  /** The space whose rules it brings in, or for a skill, the space the skill is set in. */
  from: { id: string; name: string; personal: boolean };
  /** The skill it brings in, by its page and name, or null for a space's rules. */
  skill: { pageId: string; name: string } | null;
  addedAt: Date;
}

/** Why Homing won't include something as asked, in words for the person. */
export class IncludeRefused extends Error {
  /** What's wrong: something the person can't open, guidance that already applies there, one already there, or rights they lack. */
  readonly reason: 'missing' | 'applies' | 'twice' | 'admin';

  constructor(reason: IncludeRefused['reason'], message: string) {
    super(message);
    this.reason = reason;
  }

  get status(): 400 | 403 | 404 {
    return this.reason === 'missing' ? 404 : this.reason === 'admin' ? 403 : 400;
  }
}

/**
 * Checks that a space can include something, for the person or for everyone
 * in it, the way adding it checks: something they can open, whose guidance
 * doesn't already apply there, and that isn't included there already. A
 * shared include brings in only what's shared where it's set. Whether the
 * person may change the shared guidance is left to the caller.
 */
export async function checkInclude(
  s: Session,
  input: { spaceId: string; included: Included; shared?: boolean },
): Promise<{ space: Space; from: Space; skill: { pageId: string; name: string } | null }> {
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === input.spaceId);
  if (!space) throw new IncludeRefused('missing', 'There is no space with that reference that you can see.');
  if (input.shared && space.privateTo) throw new IncludeRefused('applies', 'Spaces in a personal tree have no shared side.');
  const byId = new Map(spaces.map((candidate) => [candidate.id, candidate]));
  const applies = applyingAlready(spaces, space);

  let from: Space | undefined;
  let skill: { pageId: string; name: string } | null = null;
  let mine = false;
  if (input.included.space !== undefined) {
    from = byId.get(input.included.space);
    if (!from) throw new IncludeRefused('missing', 'There is no space with that reference that you can see.');
    if (applies.has(from.id)) {
      throw new IncludeRefused('applies', from.privateTo && !from.parentId ? 'The rules from your personal space already apply everywhere.' : `The rules from ${from.name} already apply in ${space.name}.`);
    }
    mine = from.privateTo !== null;
  } else {
    const [title] = await s.tx<{ pageId: string; name: string; spaceId: string; privateTo: string | null }[]>`
      select t.page_id, t.body as name, t.space_id, t.private_to from content t
      join pages p on p.id = t.page_id and p.type = 'skill'
      where t.page_id = ${input.included.skill}::uuid and t.kind = 'title' and ${visible(s, 't')} and ${current(s, 't')}
      order by t.private_to is null
      limit 1
    `;
    from = title && byId.get(title.spaceId);
    if (!title || !from) throw new IncludeRefused('missing', 'There is no skill with that reference that you can see.');
    if (applies.has(from.id)) throw new IncludeRefused('applies', `The skill ${title.name} already applies in ${space.name}.`);
    skill = { pageId: title.pageId, name: title.name };
    mine = title.privateTo !== null;
  }
  if (input.shared && mine) {
    throw new IncludeRefused('applies', `${skill ? `The skill ${skill.name}` : from.name} is only yours, so it can be included only for you.`);
  }
  // Once for everyone, which covers each person too, or once for the person.
  const [there] = await s.tx<{ shared: boolean }[]>`
    select private_to is null as shared from includes
    where space_id = ${space.id}::uuid and (private_to is null or private_to = ${input.shared ? null : (personOf(s.principal) ?? null)}::uuid)
      and coalesce(space_included, skill_included) = ${skill?.pageId ?? from.id}::uuid and removed_at is null
    order by private_to is null desc
    limit 1
  `;
  if (there) {
    throw new IncludeRefused('twice', `${space.name} already includes ${skill ? `the skill ${skill.name}` : `the rules from ${from.name}`}${there.shared ? ' for everyone' : ' for you'}.`);
  }
  return { space, from, skill };
}

/** The spaces whose guidance applies in a space already: its own, the spaces above it, and the personal space. */
export function applyingAlready(spaces: Space[], space: Space): Set<string> {
  const byId = new Map(spaces.map((candidate) => [candidate.id, candidate]));
  const applies = new Set([space.id, ...spaces.filter((candidate) => candidate.privateTo && !candidate.parentId).map((candidate) => candidate.id)]);
  for (let at = space.parentId ? byId.get(space.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) applies.add(at.id);
  return applies;
}

/**
 * Includes another space's rules, or a skill, in a space's guidance, by
 * link: what it brings in stays where it's set. Only a person editing
 * directly can, and a shared include needs an admin. Like a skill, it
 * applies in the spaces below too.
 */
export async function addInclude(s: Session, input: { spaceId: string; included: Included; shared?: boolean }): Promise<Include> {
  const privateTo = sideOf(s, input.shared);
  const { space, from, skill } = await checkInclude(s, input);
  if (input.shared && !space.admin) throw new IncludeRefused('admin', `Only ${space.name}’s admins change its shared rules.`);
  const [{ id, addedAt }] = await s.tx<{ id: string; addedAt: Date }[]>`
    insert into includes (space_id, private_to, space_included, skill_included)
    values (${space.id}::uuid, ${privateTo}::uuid, ${input.included.space ?? null}::uuid, ${input.included.skill ?? null}::uuid)
    returning id, added_at
  `;
  // Included for everyone, it takes the place of the person's own include of it.
  if (input.shared) {
    await s.tx`
      update includes set removed_at = now()
      where space_id = ${space.id}::uuid and private_to = ${personOf(s.principal) ?? null}::uuid and removed_at is null
        and coalesce(space_included, skill_included) = ${skill?.pageId ?? from.id}::uuid
    `;
  }
  return { id, spaceId: space.id, privateTo, from: { id: from.id, name: from.name, personal: from.privateTo !== null && !from.parentId }, skill, addedAt };
}

/**
 * Stops including something, for everyone it reached. Who removed it, and when, stay in the
 * history. A space's admins also stop one for everyone that they can't open, without learning
 * what it pointed to.
 */
export async function removeInclude(s: Session, includeId: string): Promise<boolean> {
  const [removed] = await s.tx`
    update includes set removed_at = now()
    where id = ${includeId}::uuid and removed_at is null
      and space_id in (${accessibleSpaces(s)}) and (private_to is null or private_to = ${personOf(s.principal) ?? null}::uuid)
      and include_open(space_included, skill_included)
    returning id
  `;
  if (removed) return true;
  const [{ stopped }] = await s.tx<{ stopped: boolean }[]>`select stop_including(${includeId}::uuid) as stopped`;
  return stopped;
}

/** An include for everyone in a space that its admin can't open: only that it's there, and who added it when. */
export interface IncludeNotOpen {
  id: string;
  kind: 'rules' | 'skill';
  addedBy: string;
  addedAt: Date;
}

/** For a space's admins, what it includes for everyone that they can't open. Nobody else gets any. */
export async function includesNotOpen(s: Session, spaceId: string): Promise<IncludeNotOpen[]> {
  return s.tx<IncludeNotOpen[]>`select id, kind, added_by, added_at from includes_not_open(${spaceId}::uuid)`;
}

/** The includes set in a space that the viewer can see, as they see its guidance, shared ones first, oldest first. */
export async function includesIn(s: Session, spaceId: string): Promise<Include[]> {
  const rows = await s.tx<{ id: string; spaceId: string; privateTo: string | null; fromId: string; fromName: string; fromPersonal: boolean; skillId: string | null; skillName: string | null; addedAt: Date }[]>`
    select i.id, i.space_id, i.private_to, x.id as from_id, x.name as from_name,
           x.private_to is not null and x.parent_id is null as from_personal,
           i.skill_included as skill_id, t.body as skill_name, i.added_at
    from includes i
    left join lateral (
      select t.body, t.space_id from content t
      where t.page_id = i.skill_included and t.kind = 'title' and ${visible(s, 't')} and ${current(s, 't')}
      order by t.private_to is null
      limit 1
    ) t on true
    join spaces x on x.id = coalesce(i.space_included, t.space_id) and x.id in (${accessibleSpaces(s)})
    where i.space_id = ${spaceId}::uuid and i.removed_at is null and ${includeSeen(s, 'i')} and ${notShadowed(s, 'i')}
    order by i.private_to is not null, i.added_at
  `;
  return rows.map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    privateTo: row.privateTo,
    from: { id: row.fromId, name: row.fromName, personal: row.fromPersonal },
    skill: row.skillId ? { pageId: row.skillId, name: row.skillName! } : null,
    addedAt: row.addedAt,
  }));
}

/** An include in a space the person can open, which is where includes are changed. */
export async function includeOf(s: Session, includeId: string): Promise<Include | undefined> {
  const [row] = await s.tx<{ spaceId: string }[]>`
    select space_id from includes where id = ${includeId}::uuid and space_id in (${accessibleSpaces(s)})
  `;
  return row && (await includesIn(s, row.spaceId)).find((include) => include.id === includeId);
}

/**
 * The rules including a space would bring in for the viewer, as they are
 * now: those set there that reach beyond it, shared and their own, never
 * those marked only here. In the order they'd apply.
 */
export async function rulesIncludedFrom(s: Session, spaceId: string) {
  return s.tx<{ id: string; kind: RuleKind; body: string; privateTo: string | null }[]>`
    select c.id, c.kind, c.body, c.private_to from content c
    join pages p on p.id = c.page_id and p.type = 'guidance'
    where c.space_id = ${spaceId}::uuid and c.kind in ('requirement', 'preference') and c.reaches_down
      and ${visible(s, 'c')} and ${current(s, 'c')}
    order by c.private_to is not null, c.created_at
  `;
}

/** A current rule in a space the person can open, which is where rules are changed. */
async function ownRule(s: Session, ruleId: string): Promise<Item | undefined> {
  const [rule] = await s.tx<Item[]>`
    select ${itemColumns(s)} from content
    where id = ${ruleId}::uuid and kind in ('requirement', 'preference')
      and ${visible(s, 'content')} and ${current(s, 'content')}
  `;
  return rule;
}
