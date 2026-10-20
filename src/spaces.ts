import { personOf, type Session, type Sql } from './db.ts';

export type Role = 'admin' | 'member';

export interface Person {
  id: string;
  personalSpaceId: string;
}

export interface Space {
  id: string;
  name: string;
  parentId: string | null;
  closed: boolean;
  /** Set when the space is in someone's personal tree. */
  privateTo: string | null;
  /** Whether the person can manage the space. */
  admin: boolean;
  /** Archived itself or with a space above it, so out of everyday context. */
  archived: boolean;
  /** When it was archived itself, if it was. */
  archivedAt: Date | null;
  /** The space that was archived, itself or the nearest one above it, if it's archived. */
  archivedIn: string | null;
}

/** Creates a person with their personal space. Homing does it only for an invite, and tests as the admin role. */
export async function createPerson(sql: Sql, name: string): Promise<Person> {
  const [person] = await sql<Person[]>`
    select person_id as id, personal_space_id from create_person(${name})
  `;
  return person;
}

/** Creates a space, as a new root or under a parent. The creator becomes an admin. */
export async function createSpace(
  s: Session,
  input: { name: string; parentId?: string; closed?: boolean },
): Promise<string> {
  const [{ id }] = await s.tx`
    select create_space(${input.name}, ${input.parentId ?? null}::uuid, ${input.closed ?? false}) as id
  `;
  return id;
}

/** Who a new space is for, which decides where it can go (spec §1). */
export type Who = 'just me' | 'with others';

export const spaceNameLength = 100;

/** A space Homing won't create or rename as asked, with the reason in words for the person. */
export class SpaceRefused extends Error {
  /** What's wrong: the name, where the space would go, who it's about, rights the person lacks, or a space they can't open. */
  reason: 'name' | 'where' | 'person' | 'admin' | 'missing';
  /** A space the person can open that already has the name, where the new one would go. */
  existing?: Space;

  constructor(reason: SpaceRefused['reason'], message: string, existing?: Space) {
    super(message);
    this.reason = reason;
    this.existing = existing;
  }

  /** The answer's status in the app. */
  get status(): 400 | 403 | 404 {
    return this.reason === 'admin' ? 403 : this.reason === 'missing' ? 404 : 400;
  }

  /** The form field it's about, if any. */
  get field(): string | undefined {
    return { name: 'name', where: 'in', person: 'person', admin: undefined, missing: undefined }[this.reason];
  }
}

/**
 * Creates a space for the person (spec §1). Just for them, it goes in their personal tree: in their
 * personal space, or in a space inside it. With others, it's a space of its own, or goes in a shared
 * space they're an admin of, where everyone in that space has access unless it's closed. A space
 * with the same name in the same place is refused, so a subject keeps one space.
 */
export async function newSpace(s: Session, input: { name: string; who: Who; in?: string; closed?: boolean }): Promise<Space> {
  // Held to the end of the transaction, so two requests can't both create the same name.
  await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
  const { name, parent, closed } = await placeSpace(s, input);
  const id = await createSpace(s, { name, parentId: parent?.id, closed });
  return { id, name, parentId: parent?.id ?? null, closed, privateTo: parent?.privateTo ?? null, admin: true, archived: false, archivedAt: null, archivedIn: null };
}

/** Where a new space would go, checked the way newSpace checks it, without creating it. */
export async function placeSpace(
  s: Session,
  input: { name: string; who: Who; in?: string; closed?: boolean },
): Promise<{ name: string; parent: Space | undefined; personal: Space; closed: boolean }> {
  const name = cleanName(input.name);
  const spaces = await listSpaces(s);
  const personal = spaces.find((space) => space.privateTo !== null && space.parentId === null);
  if (!personal) throw new SpaceRefused('missing', 'Only a person creates spaces.');
  let parent = input.in ? spaces.find((space) => space.id === input.in) : undefined;
  if (input.in && !parent) throw new SpaceRefused('missing', 'There’s no space there that you can open.');

  if (input.who === 'just me') {
    parent ??= personal;
    if (!parent.privateTo) {
      throw new SpaceRefused('where', `A space just for you goes in your personal space. A space in ${parent.name} is for the people in it.`);
    }
  } else if (parent?.privateTo) {
    throw new SpaceRefused('where', 'Spaces in your personal space are only yours. To share one with others, create it on its own or in a shared space, or share it later from its Settings.');
  } else if (parent && !parent.admin) {
    throw new SpaceRefused('admin', `Only ${parent.name}’s admins create spaces in it.`);
  }
  if (parent?.archived) throw new SpaceRefused('where', `${parent.name} is archived. Reopen it to make spaces in it.`);

  const there = spaces.find((space) => space !== personal && space.parentId === (parent?.id ?? null) && sameName(space.name, name));
  if (there) throw new SpaceRefused('name', `There’s already a space called ${there.name} ${placeName(parent, personal)}.`, there);
  return { name, parent, personal, closed: input.who === 'with others' && parent !== undefined && input.closed === true };
}

/** Renames a space the person is an admin of. A personal space keeps its name. */
export async function renameSpace(s: Session, spaceId: string, name: string): Promise<Space> {
  await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
  const clean = cleanName(name);
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  const personal = spaces.find((candidate) => candidate.privateTo !== null && candidate.parentId === null);
  if (space === personal) throw new SpaceRefused('admin', 'Your personal space keeps its name.');
  if (!space.admin) throw new SpaceRefused('admin', `Only ${space.name}’s admins rename it.`);
  const there = spaces.find((other) => other !== space && other !== personal && other.parentId === space.parentId && sameName(other.name, clean));
  if (there) throw new SpaceRefused('name', `There’s already a space called ${there.name} ${placeName(spaces.find((above) => above.id === space.parentId), personal)}.`, there);
  await s.tx`select rename_space(${spaceId}::uuid, ${clean})`;
  return { ...space, name: clean };
}

/**
 * Archives a space the person looks after, or reopens it (spec §1). It and the spaces in it leave
 * everyday context, and stay searchable. A space archived with one above it reopens with that one.
 * Says whether it changed it, since someone else may have got there first while this waited.
 */
export async function archiveSpace(s: Session, spaceId: string, archived: boolean): Promise<Space & { changed: boolean }> {
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === spaceId);
  if (!space) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  if (space.privateTo !== null && space.parentId === null) throw new SpaceRefused('admin', 'Your personal space stays open.');
  if (!space.admin) throw new SpaceRefused('admin', `Only ${space.name}’s admins ${archived ? 'archive' : 'reopen'} it.`);
  if (archived && space.archived) throw new SpaceRefused('where', space.archivedAt ? `${space.name} is archived already.` : `${space.name} is archived already, with the space above it.`);
  if (!archived && !space.archived) throw new SpaceRefused('where', `${space.name} is open already.`);
  if (!archived && space.archived && !space.archivedAt) {
    const above = spaces.find((candidate) => candidate.id === space.archivedIn);
    throw new SpaceRefused('where', `It’s archived with ${above ? above.name : 'the space above it'}, so it reopens with that one.`);
  }
  const [{ changed }] = await s.tx<{ changed: boolean }[]>`select archive_space(${spaceId}::uuid, ${archived}) as changed`;
  return { ...(await listSpaces(s)).find((candidate) => candidate.id === spaceId)!, changed };
}

/** "in Acme", "in your personal space" or "on its own": where a space sits. */
function placeName(parent: Space | undefined, personal: Space | undefined): string {
  return parent ? `in ${parent === personal ? 'your personal space' : parent.name}` : 'on its own';
}

/**
 * A name as Homing keeps it: one line, single spaces, composed the usual way, and without
 * characters nobody can see, which could hide or reverse what the name says to others.
 */
export function cleanName(name: string): string {
  const clean = name.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (/[\p{Cc}\p{Cf}]/u.test(clean.replaceAll('\u200d', ''))) throw new SpaceRefused('name', 'Leave out invisible characters.');
  if (!clean) throw new SpaceRefused('name', 'Give the space a name.');
  if (clean.length > spaceNameLength) throw new SpaceRefused('name', `Keep the name to ${spaceNameLength} characters or fewer.`);
  return clean;
}

/** Whether two names are the same name: case doesn't count, accents do, so Ås and As are two names. */
export const sameName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'accent' }) === 0;

/** A change to who is in a space. Making someone an admin adds them if they aren't in it yet. */
export type MemberChange = 'add' | 'make admin' | 'make member' | 'remove';

/**
 * Changes who is in a space (spec §1): adds someone, makes them an admin or a member, or removes
 * them. Only its admins do, directly, and never in a personal tree. A space keeps an admin.
 */
export async function changeMember(s: Session, spaceId: string, personId: string, change: MemberChange): Promise<void> {
  const view = await spaceView(s, spaceId);
  if (!view) throw new SpaceRefused('missing', 'There’s no space there that you can open.');
  await memberChangeFits(s, view, personId, change);
  try {
    if (change === 'remove') await removeMember(s, spaceId, personId);
    else await addMember(s, spaceId, personId, change === 'make admin' ? 'admin' : 'member');
  } catch (error) {
    if (error instanceof Error && error.message === 'a space keeps at least one admin') {
      throw new SpaceRefused('person', `${view.name} needs an admin, so make someone else an admin first.`);
    }
    throw error;
  }
}

/**
 * Whether a change of members fits the space as it is: only its admins change who's in it, except
 * that anyone may leave; never in a personal tree; and a role changes only where it was given.
 */
export async function memberChangeFits(s: Session, view: SpaceView, personId: string, change: MemberChange): Promise<void> {
  const leaving = change === 'remove' && personId === personOf(s.principal);
  if (view.privateTo) throw new SpaceRefused('where', 'Spaces in your personal space are only yours. To add people, share the space first, from its Settings.');
  if (!view.admin && !leaving) throw new SpaceRefused('admin', `Only ${view.name}’s admins change who’s in it.`);
  const member = view.members.find((candidate) => candidate.id === personId && candidate.member);
  if (change === 'add' && member) throw new SpaceRefused('person', `${member.name} is already in ${view.name}.`);
  if ((change === 'make member' || change === 'remove') && !member) throw new SpaceRefused('person', `They aren’t a member of ${view.name}.`);
  if (change === 'make member') {
    const [row] = await s.tx<{ role: Role }[]>`select role from memberships where space_id = ${view.id}::uuid and person_id = ${personId}::uuid`;
    if (row?.role !== 'admin') {
      throw new SpaceRefused('person', member!.admin ? `${member!.name} is an admin through a space above ${view.name}, so that’s changed there.` : `${member!.name} isn’t an admin of ${view.name}.`);
    }
  }
}

/** Adds a person to a space, or changes their role. Needs admin rights. */
export async function addMember(s: Session, spaceId: string, personId: string, role: Role = 'member') {
  await s.tx`select add_member(${spaceId}::uuid, ${personId}::uuid, ${role})`;
}

/** Removes a person from a space. Takes effect immediately. */
export async function removeMember(s: Session, spaceId: string, personId: string) {
  await s.tx`select remove_member(${spaceId}::uuid, ${personId}::uuid)`;
}

export async function listSpaces(s: Session): Promise<Space[]> {
  const person = personOf(s.principal) ?? null;
  const rows = await s.tx<Omit<Space, 'archived' | 'archivedIn'>[]>`
    select s.id, s.name, s.parent_id, s.closed, s.private_to, coalesce(a.admin, false) as admin, s.archived_at
    from spaces s
    left join space_access a on a.space_id = s.id and a.person_id = ${person}::uuid
    where s.id in (${accessibleSpaces(s)})
    order by s.created_at
  `;
  // Archived with the nearest archived space at or above it, among those the person can open, so
  // a space above they can't open never shows through.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    let archivedIn: string | null = null;
    for (let at: typeof row | undefined = row, depth = 0; at && depth < 100; at = at.parentId ? byId.get(at.parentId) : undefined, depth++) {
      if (at.archivedAt) {
        archivedIn = at.id;
        break;
      }
    }
    return { ...row, archived: archivedIn !== null, archivedIn };
  });
}

/**
 * The names of the people with these ids, as far as the session can see
 * them: itself, and the members of spaces it can access.
 */
export async function peopleNames(s: Session, ids: (string | null)[]): Promise<Map<string, string>> {
  const known = [...new Set(ids.filter((id) => id !== null))];
  if (known.length === 0) return new Map();
  const people = await s.tx<{ id: string; name: string }[]>`
    select id, name from people
    where id in ${s.tx(known)}
      and (id = ${personOf(s.principal) ?? null}::uuid
           or id in (select person_id from memberships where space_id in (${accessibleSpaces(s)})))
  `;
  return new Map(people.map((person) => [person.id, person.name]));
}

/**
 * The spaces the principal can access: a person's through the access table,
 * a space only itself. Homing filters with this explicitly, and row-level
 * security applies the same rule underneath.
 */
export function accessibleSpaces(s: Session) {
  return 'person' in s.principal
    ? s.tx`select space_id from space_access where person_id = ${s.principal.person}::uuid`
    : s.tx`select ${s.principal.space}::uuid`;
}

/** Someone with access to a space, directly or through a space above it. */
export interface Member {
  id: string;
  name: string;
  admin: boolean;
  /** Whether they're a member of this space itself. */
  member: boolean;
  /** The nearest space above whose members have access, if they're one of them. */
  through: string | null;
}

/** A space as its own page shows it: where it sits and who can open it. */
export interface SpaceView extends Space {
  /** The spaces above it that the person can open, from the top down. */
  path: { id: string; name: string }[];
  /** Whether people in a space above it that the person can't open have access too. */
  reachedFromAbove: boolean;
  /** Everyone with access, except in a personal tree, which only its owner has. */
  members: Member[];
}

/**
 * A space the person can open, with the spaces above it they can also open
 * and who has access. Access comes from a membership in the space, or in a
 * space above it as long as nothing on the way down is closed, and admin
 * rights follow the same way. A space above that the person can't open is
 * never named. Returns undefined when they can't open the space.
 */
export async function spaceView(s: Session, spaceId: string): Promise<SpaceView | undefined> {
  const spaces = new Map((await listSpaces(s)).map((space) => [space.id, space]));
  const space = spaces.get(spaceId);
  if (!space) return undefined;

  const path: SpaceView['path'] = [];
  for (let above = space.parentId && spaces.get(space.parentId); above; above = above.parentId && spaces.get(above.parentId)) {
    path.unshift({ id: above.id, name: above.name });
  }

  // The spaces whose members have access: this one, and those above it until one is closed.
  const reaching = [space];
  let reachedFromAbove = false;
  for (let below = space; !below.closed && below.parentId; ) {
    const above = spaces.get(below.parentId);
    if (!above) {
      reachedFromAbove = true;
      break;
    }
    reaching.push(above);
    below = above;
  }

  const members = new Map<string, Member>();
  if (!space.privateTo) {
    const rows = await s.tx<{ spaceId: string; personId: string; name: string; role: Role }[]>`
      select m.space_id, m.person_id, p.name, m.role
      from memberships m join people p on p.id = m.person_id
      where m.space_id in ${s.tx(reaching.map((reach) => reach.id))}
    `;
    // Nearest first, so "through" names the nearest space above.
    for (const reach of reaching) {
      for (const row of rows.filter((candidate) => candidate.spaceId === reach.id)) {
        const here = reach.id === space.id;
        const known = members.get(row.personId) ?? { id: row.personId, name: row.name, admin: false, member: false, through: null };
        known.admin ||= row.role === 'admin';
        if (here) known.member = true;
        else known.through ??= reach.name;
        members.set(row.personId, known);
      }
    }
  }

  return {
    ...space,
    parentId: space.parentId && spaces.has(space.parentId) ? space.parentId : null,
    path,
    reachedFromAbove,
    members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
