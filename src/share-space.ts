// Making a space in your personal tree collaborative (spec §1): a deliberate conversion. It leaves
// the personal tree as a space of its own, or goes in a shared space you're an admin of, and
// exposes nothing by itself: everything in it stays yours until you share it. The guidance it had
// from the spaces above it in your personal tree stops applying, and you choose what becomes of
// its rules; its skills are named, to add again where you need them.

import { personOf, type Session } from './db.ts';
import { addRule, rulesFor, type Rule } from './guidance.ts';
import { skillsFor } from './skills.ts';
import { accessibleSpaces, listSpaces, SpaceRefused, type Space } from './spaces.ts';

/** What sharing the space would do, for its owner to decide. */
export interface Conversion {
  space: Space;
  /** The rules from the spaces above it in your personal tree, which stop applying once it leaves. */
  rulesLeaving: Rule[];
  /** The skills from those spaces, which stop applying too. */
  skillsLeaving: { name: string; from: string | null }[];
  /** The shared spaces it can go in: those you're an admin of, with who has them now. */
  places: { id: string; name: string; label: string; people: number; above: boolean }[];
}

/** What becomes of the rules that stop applying: kept for you there, added there for everyone, or let go. */
export type RulesLeaving = 'keep' | 'share' | 'drop';

/** What sharing a space in your personal tree would do, or undefined when it isn't one. */
export async function conversionOf(s: Session, spaceId: string): Promise<Conversion | undefined> {
  const spaces = await listSpaces(s);
  const space = spaces.find((candidate) => candidate.id === spaceId);
  if (!space?.privateTo || space.parentId === null) return undefined;
  const byId = new Map(spaces.map((candidate) => [candidate.id, candidate]));
  // The spaces above it in the personal tree, below the personal space, whose guidance stays there.
  const above = new Set<string>();
  for (let at = byId.get(space.parentId); at?.parentId; at = byId.get(at.parentId)) above.add(at.id);
  const rulesLeaving = (await rulesFor(s, spaceId)).filter((rule) => above.has(rule.spaceId));
  const skillsLeaving = (await skillsFor(s, spaceId)).filter((skill) => above.has(skill.spaceId)).map((skill) => ({ name: skill.name, from: skill.spaceName }));

  // Who has each shared space, as its Members shows them: its members and those of the spaces
  // above it until one is closed, and whether people above that you can't open have it too.
  const memberships = await s.tx<{ spaceId: string; personId: string }[]>`
    select space_id, person_id from memberships where space_id in (${accessibleSpaces(s)})
  `;
  const audience = (place: Space) => {
    const people = new Set<string>();
    let hidden = false;
    for (let at: Space | undefined = place; at; ) {
      for (const row of memberships) if (row.spaceId === at.id) people.add(row.personId);
      if (at.closed || !at.parentId) break;
      const next = byId.get(at.parentId);
      if (!next) hidden = true;
      at = next;
    }
    return { people: people.size, above: hidden };
  };
  const label = (place: Space) => {
    const names: string[] = [];
    for (let at = place.parentId ? byId.get(place.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) names.unshift(at.name);
    return names.length ? `${place.name}, in ${names.join(' › ')}` : place.name;
  };
  const places = spaces
    .filter((candidate) => !candidate.privateTo && candidate.admin)
    .map((place) => ({ id: place.id, name: place.name, label: label(place), ...audience(place) }));
  return { space, rulesLeaving, skillsLeaving, places };
}

const sameName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'accent' }) === 0;

/**
 * Shares a space from your personal tree: it becomes a space of its own, or goes in a shared space
 * you're an admin of, open to everyone there or closed. Everything in it, and in the spaces under
 * it, stays only yours. The rules that stop applying are kept for you there, added there for
 * everyone, or let go. A space with the same name where it would go is refused, as when creating.
 */
export async function makeCollaborative(
  s: Session,
  spaceId: string,
  input: { in?: string; closed?: boolean; rules: RulesLeaving },
): Promise<Space> {
  // Held to the end, so what's checked here still holds when it moves.
  await s.tx`select pg_advisory_xact_lock(hashtext('homing.space_access'))`;
  const conversion = await conversionOf(s, spaceId);
  if (!conversion) throw new SpaceRefused('missing', 'There’s no space in your personal space to share there.');
  const parent = input.in ? conversion.places.find((place) => place.id === input.in) : undefined;
  if (input.in && !parent) throw new SpaceRefused('where', 'It can go only in a shared space you’re an admin of.');
  const spaces = await listSpaces(s);
  const there = spaces.find((other) => other.id !== spaceId && !other.privateTo && other.parentId === (parent?.id ?? null) && sameName(other.name, conversion.space.name));
  if (there) {
    throw new SpaceRefused('name', `There’s already a space called ${there.name} ${parent ? `in ${parent.name}` : 'on its own'}. Rename this one first, or put it somewhere else.`, there);
  }
  await s.tx`select make_collaborative(${spaceId}::uuid, ${parent?.id ?? null}::uuid, ${input.closed === true})`;
  if (input.rules !== 'drop') {
    for (const rule of conversion.rulesLeaving) {
      await addRule(s, { spaceId, kind: rule.kind, body: rule.body, shared: input.rules === 'share', onlyHere: rule.onlyHere });
    }
  }
  const [space] = (await listSpaces(s)).filter((candidate) => candidate.id === spaceId);
  return space;
}

/** Where a shared space came from in your personal tree, which only you can see. */
export async function movedFrom(s: Session, spaceId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await s.tx<{ movedFrom: string | null }[]>`
    select moved_from from space_moves where space_id = ${spaceId}::uuid order by moved_at desc limit 1
  `;
  if (!row?.movedFrom) return null;
  const from = (await listSpaces(s)).find((space) => space.id === row.movedFrom && space.privateTo === personOf(s.principal));
  return from ? { id: from.id, name: from.parentId ? from.name : 'your personal space' } : null;
}
