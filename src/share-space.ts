// Making a space in your personal tree collaborative (spec §1): a deliberate conversion. It leaves
// the personal tree as a space of its own, or goes in a shared space you're an admin of, and
// exposes nothing by itself: everything in it stays yours until you share it. The guidance it had
// from the spaces above it in your personal tree stops applying, and you choose what becomes of it.

import { personOf, type Session } from './db.ts';
import { addRule, rulesFor, type Rule } from './guidance.ts';
import { listSpaces, SpaceRefused, spaceView, type Space } from './spaces.ts';

/** What sharing the space would do, for its owner to decide. */
export interface Conversion {
  space: Space;
  /** The rules from the spaces above it in your personal tree, which stop applying once it leaves. */
  rulesLeaving: Rule[];
  /** The shared spaces it can go in: those you're an admin of. */
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

  const label = (place: Space) => {
    const names: string[] = [];
    for (let at = place.parentId ? byId.get(place.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) names.unshift(at.name);
    return names.length ? `${place.name}, in ${names.join(' › ')}` : place.name;
  };
  const places = [];
  for (const place of spaces.filter((candidate) => !candidate.privateTo && candidate.admin)) {
    const view = await spaceView(s, place.id);
    places.push({ id: place.id, name: place.name, label: label(place), people: view?.members.length ?? 0, above: view?.reachedFromAbove ?? false });
  }
  return { space, rulesLeaving, places };
}

/**
 * Shares a space from your personal tree: it becomes a space of its own, or goes in a shared space
 * you're an admin of, open to everyone there or closed. Everything in it, and in the spaces under
 * it, stays only yours. The rules that stop applying are kept for you there, added there for
 * everyone, or let go.
 */
export async function makeCollaborative(
  s: Session,
  spaceId: string,
  input: { in?: string; closed?: boolean; rules: RulesLeaving },
): Promise<Space> {
  const conversion = await conversionOf(s, spaceId);
  if (!conversion) throw new SpaceRefused('missing', 'There’s no space in your personal space to share there.');
  if (input.in && !conversion.places.some((place) => place.id === input.in)) {
    throw new SpaceRefused('where', 'It can go only in a shared space you’re an admin of.');
  }
  await s.tx`select make_collaborative(${spaceId}::uuid, ${input.in ?? null}::uuid, ${input.closed === true})`;
  if (input.rules !== 'drop') {
    for (const rule of conversion.rulesLeaving) {
      await addRule(s, { spaceId, kind: rule.kind, body: rule.body, shared: input.rules === 'share', onlyHere: rule.onlyHere });
    }
  }
  const [space] = (await listSpaces(s)).filter((candidate) => candidate.id === spaceId);
  return space;
}

/** Where a shared space came from in your personal tree, which only you can open. */
export async function movedFrom(s: Session, spaceId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await s.tx<{ movedFrom: string | null }[]>`select moved_from from spaces where id = ${spaceId}::uuid`;
  if (!row?.movedFrom) return null;
  const from = (await listSpaces(s)).find((space) => space.id === row.movedFrom && space.privateTo === personOf(s.principal));
  return from ? { id: from.id, name: from.parentId ? from.name : 'your personal space' } : null;
}
