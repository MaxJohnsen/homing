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
  return s.tx<Space[]>`
    select s.id, s.name, s.parent_id, s.closed, s.private_to, coalesce(a.admin, false) as admin
    from spaces s
    left join space_access a on a.space_id = s.id and a.person_id = ${person}::uuid
    where s.id in (${accessibleSpaces(s)})
    order by s.created_at
  `;
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
