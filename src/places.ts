// Finding and reading what a person's places hold, for them, the same for
// every system (spec §7, §10, guarantees 3 and 5). Their assistant asks
// Homing, and Homing searches or reads live, as the person, through their own
// connection: the token is taken in a transaction of the person's own, never
// their assistant's, used by the connector in the server and never handed
// on. Each use records which connection and place it used. Only the owner's
// own places lead anywhere, so for anyone else there is nothing to find, not
// even that it's there.

import type { AgentPrincipal } from './assistants.ts';
import { ConnectionUnusable, kindOf, messageOf, Unanswered, using, type Broker, type Use } from './connections.ts';
import type { Access, Audience, Connector, Connectors, Found, Item, Value, Words } from './connectors.ts';
import { personOf, withPrincipal, type Session } from './db.ts';
import { accessibleSpaces } from './spaces.ts';

/** One of the person's places, and the connection that reaches it. */
export interface Place {
  place: string;
  space: string;
  connection: string;
  /** Its system's connector, and the kind of place it is there, such as microsoft and mailbox. */
  connector: string;
  kind: string;
  /** What it is there, such as the account's id for its mailbox. */
  resource: string;
  /** How it's shown: its own name, or the account's address for the account's own, such as its mailbox. */
  name: string;
  status: 'connected' | 'needs attention';
}

/** How long a search waits for a place, so a slow one never holds up the rest of the answer. */
export const searchTimeLimit = 2_500;
/** How long reading one item may take. */
const readTimeLimit = 10_000;
/** How many items a search shows from each place. */
const shown = 5;

/**
 * The person's own places that a request in a space reaches: those added in it, in a space above
 * it, whose context it's in, or in a space below it, which search looks in too. Without a space, all
 * of them. One for each thing a connection reaches, at the place in the space itself if there is
 * one, or else the first added. Never anyone else's: Homing asks only for the person's, and
 * row-level security shows them nothing more.
 */
export async function placesFor(s: Session, spaceId?: string): Promise<Place[]> {
  const person = personOf(s.principal);
  if (!person) return [];
  const places = await s.tx<Place[]>`
    select * from (
      select distinct on (c.id, p.kind, p.resource)
        p.id as place, p.space_id as space, c.id as connection, c.provider as connector, p.kind, p.resource, coalesce(p.name, c.address) as name, c.status
      from places p join connections c on c.id = p.connection_id
      where p.private_to = ${person}::uuid and p.removed_at is null and c.revoked_at is null
        and p.space_id in (${accessibleSpaces(s)})
        ${spaceId
          ? s.tx`and (p.space_id in (select space_subtree(${spaceId}::uuid)) or p.space_id in (select id from spaces_above(${spaceId}::uuid)))`
          : s.tx``}
      order by c.id, p.kind, p.resource, p.space_id = ${spaceId ?? null}::uuid desc nulls last, p.added_at, p.id
    ) places
    order by name, connection, kind, resource
  `;
  return [...places];
}

/** An item's reference: its connector, the place it's in, and its id there, such as microsoft:…:…. */
export const referenceTo = (place: Pick<Place, 'connector' | 'place'>, id: string) => `${place.connector}:${place.place}:${id}`;

/**
 * The connector whose reference a value is meant as, by how it starts, such as microsoft:…. Email's
 * references started mail: before connectors had their own, and only Microsoft mailboxes had them,
 * so those still lead there.
 */
export function connectorOf(connectors: Connectors, value: string | undefined): Connector | undefined {
  const start = /^\s*([a-z][a-z0-9]*):/i.exec(value ?? '')?.[1].toLowerCase();
  return start ? connectors.get(start === 'mail' ? 'microsoft' : start) : undefined;
}

/** What a reference names: the connector, the place, and the item's id there. */
export interface Reference {
  connector: string;
  place: string;
  id: string;
}

/** The connector, place and item a reference names, or undefined when it isn't one. */
export function parseReference(connectors: Connectors, value: string): Reference | undefined {
  const connector = connectorOf(connectors, value);
  const match = /^[a-z][a-z0-9]*:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(.+)$/is.exec(value.trim());
  // Only an id made of nothing but what the system's ids are made of.
  return connector && match && connector.ids.exec(match[2])?.[0] === match[2] ? { connector: connector.id, place: match[1].toLowerCase(), id: match[2] } : undefined;
}

/** How a connector's items are worded where its kind of place isn't known: by its only kind, or plainly. */
export function wordsOf(connector: Connector | undefined, kind?: string): Words {
  const kinds = connector ? Object.values(connector.kinds) : [];
  return (kind === undefined ? undefined : kindOf(connector, kind)?.words) ?? (kinds.length === 1 ? kinds[0].words : plainWords);
}

const plainWords: Words = { place: 'place', places: 'places', item: 'item', items: 'items', anItem: 'an item', title: 'title', keeps: 'its fields' };

/** Why Homing couldn't search or read a place, for its owner only. */
export type Problem = 'needs attention' | 'not set up' | 'slow' | 'unreachable' | 'refused' | 'failed';

/** What searching one place found, or why it couldn't. */
export type FoundIn = { place: Place; found: Found[] } | { place: Place; problem: Problem };

/**
 * Searches the person's places live, those whose kind searches, each under the time limit, all at
 * once. A place that's slow, unreachable or waiting for its owner to sign in again gives its reason
 * instead, and one revoked meanwhile gives nothing. Never throws, so it never breaks the rest of an
 * answer.
 */
export async function searchPlaces(broker: Broker, principal: AgentPrincipal, places: Place[], query: string): Promise<FoundIn[]> {
  const found = await Promise.all(
    places.map(async (place): Promise<FoundIn | undefined> => {
      const connector = broker.connectors.get(place.connector);
      const search = kindOf(connector, place.kind)?.search;
      if (!connector || !search) return undefined;
      if (place.status === 'needs attention') return { place, problem: 'needs attention' };
      if (!connector.ready) return { place, problem: 'not set up' };
      const deadline = AbortSignal.timeout(searchTimeLimit);
      const work = asOwner(broker, connector, principal, place, 'search', deadline, (access) => search(access, query, shown));
      const late = new Promise<'late'>((resolve) => deadline.addEventListener('abort', () => resolve('late'), { once: true }));
      try {
        const result = await Promise.race([work, late]);
        if (result === 'late') {
          // What was under way finishes on its own, such as a refresh, whose new sign-in is kept.
          work.catch(() => {});
          return { place, problem: 'slow' };
        }
        return { place, found: result };
      } catch (error) {
        const problem = problemOf(connector, place, error);
        return problem === 'gone' ? undefined : { place, problem };
      }
    }),
  );
  return found.filter((one) => one !== undefined);
}

/** What reading an item by its reference gives the person: the item, or why it can't be read. */
export type Read = { place: Place; item: Item } | { place: Place; problem: Problem | 'removed' | 'not there' };

/**
 * Reads an item by its reference, for the person whose place it's in. Undefined when the reference
 * names no place of theirs, whether it's someone else's or doesn't exist, so the answer is the same
 * either way, and comes before anything is asked of the system.
 */
export async function readFor(broker: Broker, principal: AgentPrincipal, ref: Reference, { related = true } = {}): Promise<Read | undefined> {
  const place = await withPrincipal(broker.sql, principal, (s) => placeOf(s, ref));
  if (!place) return undefined;
  if (place.removed) return { place, problem: 'removed' };
  if (place.status === 'needs attention') return { place, problem: 'needs attention' };
  const connector = broker.connectors.get(place.connector);
  const kind = kindOf(connector, place.kind);
  if (!connector?.ready || !kind) return { place, problem: 'not set up' };
  try {
    const deadline = AbortSignal.timeout(readTimeLimit);
    const item = await asOwner(broker, connector, principal, place, 'read', deadline, (access) => kind.read(access, ref.id, { related }));
    return item ? { place, item } : { place, problem: 'not there' };
  } catch (error) {
    const problem = problemOf(connector, place, error);
    return { place, problem: problem === 'gone' ? 'removed' : problem };
  }
}

/**
 * One of the person's own places, in a space they can open, through a connection of the
 * reference's connector, whether or not it's still in use. Once it's gone, their place for the
 * same account, kind and resource in the same space stands for it, if they connected it there
 * again, since the item's id is the same there.
 */
async function placeOf(s: Session, ref: Reference): Promise<(Place & { removed: boolean }) | undefined> {
  const person = personOf(s.principal);
  if (!person) return undefined;
  const [named] = await s.tx<(Place & { removed: boolean; tenant: string; account: string })[]>`
    select p.id as place, p.space_id as space, c.id as connection, c.provider as connector, p.kind, p.resource, coalesce(p.name, c.address) as name, c.status,
           c.tenant, c.account, p.removed_at is not null or c.revoked_at is not null as removed
    from places p join connections c on c.id = p.connection_id
    where p.id = ${ref.place}::uuid and p.private_to = ${person}::uuid and c.person_id = ${person}::uuid and c.provider = ${ref.connector}
      and p.space_id in (${accessibleSpaces(s)})
  `;
  if (!named) return undefined;
  const { tenant, account, ...place } = named;
  if (!place.removed) return place;
  const [again] = await s.tx<Place[]>`
    select p.id as place, p.space_id as space, c.id as connection, c.provider as connector, p.kind, p.resource, coalesce(p.name, c.address) as name, c.status
    from places p join connections c on c.id = p.connection_id
    where p.space_id = ${place.space}::uuid and p.private_to = ${person}::uuid and p.kind = ${place.kind} and p.resource = ${place.resource} and p.removed_at is null
      and c.person_id = ${person}::uuid and c.revoked_at is null and c.provider = ${place.connector} and c.tenant = ${tenant} and c.account = ${account}
    order by p.added_at desc
    limit 1
  `;
  return again ? { ...again, removed: false } : place;
}

/** Uses the place as its owner, recording the use, for the assistant it's for. */
function asOwner<T>(broker: Broker, connector: Connector, principal: AgentPrincipal, place: Place, operation: Use['operation'], signal: AbortSignal, fn: (access: Access) => Promise<T>): Promise<T> {
  return using(broker, connector, principal.person, place, { place: place.place, space: place.space, operation, agent: principal.agent }, signal, fn);
}

function problemOf(connector: Connector, place: Place, error: unknown): Problem | 'gone' {
  if (error instanceof ConnectionUnusable) return error.reason;
  if (error instanceof Unanswered) return 'unreachable';
  const meaning = connector.refused(error);
  if (meaning === 'try later') return 'unreachable';
  if (meaning) {
    console.error(`places: ${connector.vendor} refused reading a ${wordsOf(connector, place.kind).place} (${messageOf(error)})`);
    return 'refused';
  }
  console.error(error);
  return 'failed';
}

/** The answer for a reference that names nothing the person can read, whoever's it is. */
export function noItem(words: Words): string {
  return `There is no ${words.item} with that reference that you can see.`;
}

/**
 * Why a place couldn't be searched or read, in a sentence for its owner's assistant, with where
 * they sign in again when that's what it needs. Only ever said about the person's own place.
 */
export function problemText(connectors: Connectors, place: Place, problem: Problem | 'removed' | 'not there', doing: 'searching' | 'reading', signIn?: string): string {
  const connector = connectors.get(place.connector);
  const kind = kindOf(connector, place.kind);
  const words = wordsOf(connector, place.kind);
  const vendor = connector?.vendor ?? place.connector;
  const box = `the user's ${words.place} ${place.name}`;
  const left = doing === 'searching' ? ', so this leaves it out' : '';
  switch (problem) {
    case 'needs attention':
      return `${box} needs them to sign in to ${vendor} again in Homing${signIn ? `, at ${signIn},` : ''} before Homing can ${doing === 'searching' ? 'search' : 'read'} it.`;
    case 'removed':
      return `that ${words.item} is in ${box}, which isn't connected there any more. The user can connect it again in Homing.`;
    case 'not there':
      return `that ${words.item} isn't in ${box} any more${words.lost ? `, ${words.lost}` : ''}.${kind?.search ? ' Search for it again.' : ''}`;
    case 'not set up':
      return `this Homing isn't set up to reach ${connector?.name ?? place.connector} any more${left}. Tell the user.`;
    case 'slow':
      return `${box} didn't answer within ${searchTimeLimit / 1000} seconds${left}. Try again in a moment.`;
    case 'unreachable':
      return `${vendor} didn't answer for ${box}${left}. Try again later.`;
    case 'refused':
      return `${vendor} refused ${doing} ${box}${left}. Tell the user if it keeps happening.`;
    case 'failed':
      return `something went wrong ${doing} ${box}${left}. Try again later.`;
  }
}

/** A source Homing made from an item it read itself, to keep on the person's private side where its place is. */
export interface KeptSource {
  spaceId: string;
  reference: string;
  excerpt: string;
  /** The connection Homing read it through. */
  connection: string;
  /** Who could see it there, as Homing read it, or null when that's unknown. */
  audience: Exclude<Audience, 'unknown'> | null;
  words: Words;
}

/** Why Homing can't keep an item as a source, for the assistant to tell the person. */
export class SourceRefused extends Error {
  override name = 'SourceRefused';
}

/**
 * Reads an item for the person and makes the source that keeps it: its reference, what its kind
 * keeps of it with the words given, and who could see it there. So what's kept is what Homing read,
 * never what an assistant said it says.
 */
export async function keepSource(broker: Broker, principal: AgentPrincipal, reference: string, words?: string): Promise<KeptSource> {
  const connector = connectorOf(broker.connectors, reference);
  const named = wordsOf(connector);
  if (!connector) throw new SourceRefused(noItem(named));
  const ref = parseReference(broker.connectors, reference);
  if (!ref) throw new SourceRefused(`"${reference.trim()}" isn't ${named.anItem}'s reference. They look like ${connector.id}:…:…, as \`search\` and \`read\` give them.`);
  const read = await readFor(broker, principal, ref, { related: false });
  if (!read) throw new SourceRefused(noItem(named));
  if ('problem' in read) throw new SourceRefused(`Nothing was saved: ${problemText(broker.connectors, read.place, read.problem, 'reading')}`);
  const { item, place } = read;
  return {
    spaceId: place.space,
    reference: referenceTo(place, item.envelope.id || ref.id),
    excerpt: item.excerpt ? item.excerpt(words) : fieldsExcerpt(item, wordsOf(connector, place.kind), words),
    connection: place.connection,
    audience: item.envelope.audience === 'unknown' ? null : item.envelope.audience,
    words: wordsOf(connector, place.kind),
  };
}

/** What a source keeps of an item of fields, all of them, one on each line, once the words given are found among them. */
function fieldsExcerpt(item: Item, words: Words, quoted?: string): string {
  const kept = item.fields.map(([label, value]) => `${oneLine(label)}: ${plainValue(value)}`).join('\n');
  if (quoted?.trim() && !oneLine(kept.normalize('NFC')).includes(oneLine(quoted.normalize('NFC')))) {
    throw new SourceRefused(`Nothing was saved: those words aren’t in the ${words.item} as Homing reads it. Quote them exactly as \`read\` shows them, or leave out the excerpt to keep all of it.`);
  }
  return kept;
}

/** A field's value as a source keeps it, on one line. */
function plainValue(value: Value): string {
  if ('text' in value) return value.text === null ? 'unknown' : oneLine(value.text);
  if ('texts' in value) return value.texts.map(oneLine).join(', ');
  if ('at' in value) return value.at ? when(value.at) : 'unknown';
  const party = ({ name, address }: { name: string | null; address: string | null }) => [name && oneLine(name), address && `<${oneLine(address)}>`].filter(Boolean).join(' ') || 'unknown';
  if ('party' in value) return value.party ? party(value.party) : 'unknown';
  return value.parties.map(party).join(', ');
}

/**
 * Characters that hide text or turn it around: format characters, such as bidirectional controls,
 * zero-width spaces and tags, except the joiners some scripts and emoji need; variation selectors
 * beyond the sixteen emoji use; and the Hangul fillers that show as nothing.
 */
const hiding = /(?![‌‍])\p{Cf}|[\u{e0100}-\u{e01ef}ᅟᅠㅤﾠ]/gu;

/** Outside text without characters that hide or turn text around, keeping its lines. */
export function withoutHidden(text: string): string {
  return text.replace(hiding, '').replace(/[^\P{Cc}\n\t]/gu, '');
}

/** Outside text on one line, without characters that hide or turn text around. */
export function oneLine(value: string): string {
  return value.replace(hiding, '').replace(/[\p{Cc}\s]+/gu, ' ').trim();
}

/** A time as Homing shows what it read, in UTC to the minute. */
export const when = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
