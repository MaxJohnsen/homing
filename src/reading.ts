// Reading a place in order (spec §8): a person's assistant reads their
// mailbox from its oldest mail to its newest, a stretch at a time, and
// decides for itself what each conversation is about and what is worth
// keeping. Homing gives only what an assistant can't do for itself: the next
// stretch, one line for each email, with what it already holds from each
// conversation; the place reached, which any session carries on from; and
// what is never read there, which Homing withholds wherever it reads the
// place. One token is the whole of confirming a stretch: whoever asks with
// it moves the place reached, and a stretch nobody confirms comes again.
// Nothing here looks at what an email says.

import type { AgentPrincipal } from './assistants.ts';
import { kindOf, type Broker } from './connections.ts';
import type { Listed, NeverRead } from './connectors.ts';
import { withPrincipal, type Session } from './db.ts';
import { current, visible, visibleContent } from './knowledge.ts';
import { listPlace, neverReadIn, oneLine, placesFor, type Place, type Problem } from './places.ts';

/** How many lines a stretch has unless the assistant asks for fewer or more, and the most it may ask for. */
export const linesUsually = 100;
export const linesAtMost = 300;
/** How long before now a stretch ends at the latest, since mail that just arrived can still be settling. */
export const settling = 5 * 60_000;
/** How many items held from one conversation a stretch shows. */
const heldShown = 5;

/** A conversation in a stretch: its emails, oldest first, and what Homing already holds from it. */
export interface Conversation {
  lines: Listed[];
  held: { items: HeldItem[]; more: number };
}

/** An item the person can see that cites an email of a conversation: where it is, and its first words. */
export interface HeldItem {
  id: string;
  space: string;
  page: string | null;
  text: string;
}

/** What asking for the list gave: a stretch, nothing to read up to now, a refusal, or why the system couldn't be read. */
export type Listing =
  | {
      outcome: 'stretch';
      place: Place;
      began: Date;
      from: Date;
      until: Date;
      token: string;
      lapses: Date;
      /** How it came about: reading began or began again, the stretch before was confirmed, or it's the same one again. */
      how: 'began' | 'began again' | 'confirmed' | 'next' | 'again';
      /** Whether it reaches the newest mail Homing hands out. */
      today: boolean;
      conversations: Conversation[];
    }
  | { outcome: 'nothing'; place: Place; began: Date; reached: Date; how: 'began' | 'began again' | 'confirmed' | 'next'; today: boolean }
  | { outcome: 'refused'; text: string }
  | { outcome: 'problem'; place: Place; problem: Problem; retryAfter?: number; reached: Date | null };

/** Where reading a place stands, beside what places.ts reads with the place itself. */
interface Standing {
  token: string | null;
  stretchEnds: Date | null;
  lapsesAt: Date | null;
  lapsed: boolean;
}

/** A moment to the whole second before it. */
const second = (at: Date) => new Date(Math.floor(at.getTime() / 1000) * 1000);

/**
 * The user's place that the assistant names, of a kind read in order, such as their mailbox by its
 * address, or their only one. Only their own, as everywhere places are found.
 */
async function placeNamed(s: Session, broker: Broker, named: string | undefined): Promise<Place | string> {
  const places = (await placesFor(s)).filter((place) => kindOf(broker.connectors.get(place.connector), place.kind)?.inOrder);
  if (named !== undefined) {
    const wanted = named.trim().toLowerCase();
    return places.find((place) => place.address.toLowerCase() === wanted) ?? 'There is no mailbox with that address that you can see. Name it by its address, as `context` gives it.';
  }
  if (places.length === 1) return places[0];
  if (places.length === 0) return 'The user has no mailbox connected to Homing that can be read in order. They connect one in a space’s Connections, in Homing.';
  return `The user has ${places.length} mailboxes connected: ${places.map((place) => oneLine(place.address)).join(', ')}. Name one by its address.`;
}

/**
 * The cut between two stretches: before the first second that takes the lines past most, so no
 * second is split, and when the first email's second alone holds more, after that second.
 */
function cutOf(listed: Listed[], through: Date, from: Date, most: number): Date | undefined {
  let cut = listed.length > most ? second(listed[most].at!) : through;
  const first = listed.length ? second(listed[0].at!) : from;
  if (cut <= first) cut = new Date(Math.min(through.getTime(), first.getTime() + 1000));
  return cut > from ? cut : undefined;
}

/** A day the assistant gives to begin from, as YYYY-MM-DD, as the start of that day in UTC. */
function dayOf(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const at = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value ? undefined : at;
}

/**
 * The next stretch of the user's mailbox, oldest first, for their assistant. With a day, reading
 * begins there, or begins again. With the current token, the stretch it was given is done, and
 * the place reached moves to its end. Without either, the stretch handed out now comes again, or,
 * once it lapsed or when there's none, the stretch from the place reached. Homing lists the mailbox
 * before it changes anything, so a fault at the system loses no place.
 */
export async function listStretch(broker: Broker, principal: AgentPrincipal, input: { mailbox?: string; from?: string; token?: string; lines?: number }): Promise<Listing> {
  if (input.from !== undefined && input.token !== undefined) return { outcome: 'refused', text: 'Give either a token or a day to begin from, not both. Nothing changed.' };
  const found = await withPrincipal(broker.sql, principal, async (s) => {
    const place = await placeNamed(s, broker, input.mailbox);
    if (typeof place === 'string') return place;
    const [standing] = await s.tx<Standing[]>`
      select r.token, r.stretch_ends, r.lapses_at, r.lapses_at <= now() as lapsed
      from readings r join places p on (p.connection_id, p.kind, p.resource) = (r.connection_id, r.kind, r.resource)
      where p.id = ${place.place}::uuid
    `;
    return { place, standing: standing as Standing | undefined };
  });
  if (typeof found === 'string') return { outcome: 'refused', text: found };
  const { place, standing } = found;
  const reached = place.reading?.reached ?? null;
  const at = (moment: Date) => `${moment.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const until = second(new Date(Date.now() - settling));

  let from: Date;
  let how: 'began' | 'began again' | 'confirmed' | 'next' | 'again';
  if (input.from !== undefined) {
    const day = dayOf(input.from);
    if (!day) return { outcome: 'refused', text: `"${oneLine(input.from)}" isn't a day. Give the day to begin from as YYYY-MM-DD, such as 2025-01-01. Nothing changed.` };
    if (day >= until) return { outcome: 'refused', text: 'That day hasn’t come yet, so there’s nothing to read from it. Nothing changed.' };
    from = day;
    how = place.reading ? 'began again' : 'began';
  } else if (!place.reading || reached === null) {
    return {
      outcome: 'refused',
      text: `Reading the user's mailbox ${oneLine(place.address)} in order hasn't begun. Ask the user how far back to read, then ask again with from, the day to begin from, as YYYY-MM-DD.`,
    };
  } else if (input.token !== undefined) {
    if (!standing?.token || standing.token !== input.token.trim().toLowerCase()) {
      return {
        outcome: 'refused',
        text:
          `That token isn't the current one, so nothing changed: reading the user's mailbox ${oneLine(place.address)} has reached ${at(reached)}. ` +
          'The stretch it was for was confirmed already, or handed out again once it lapsed, or reading began again since. Ask again without a token for the stretch handed out now.',
      };
    }
    from = standing.stretchEnds!;
    how = 'confirmed';
  } else if (standing?.token && !standing.lapsed) {
    from = reached;
    how = 'again';
  } else {
    from = reached;
    how = 'next';
  }

  const end = how === 'again' ? standing!.stretchEnds! : until;
  const most = how === 'again' ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.min(Math.floor(input.lines ?? linesUsually), linesAtMost));
  const listedIn = from < end ? await listPlace(broker, principal, place, { from, until: end, most }) : { listed: [], through: end };
  if ('problem' in listedIn) return { outcome: 'problem', place, problem: listedIn.problem, retryAfter: listedIn.retryAfter, reached };
  const { listed, through } = listedIn;

  let cut: Date;
  if (how === 'again') {
    // What the token confirms is what was shown under it, so it comes again whole, or not at all.
    if (through < end) {
      return {
        outcome: 'refused',
        text: `The stretch handed out now, from ${at(from)} to ${at(end)}, couldn't be listed again in full at once. Ask again without a token after it lapses at ${at(standing!.lapsesAt!)}, when it's handed out afresh.`,
      };
    }
    cut = end;
  } else if (from >= end) {
    cut = from;
  } else {
    const cutAt = cutOf(listed, through, from, most);
    if (!cutAt) return { outcome: 'refused', text: `More emails arrived within one second, at ${at(from)}, than Homing lists at once. Tell the user. Nothing changed.` };
    cut = cutAt;
  }
  const lines = listed.filter((line) => line.at !== null && line.at < cut);
  const began = how === 'began' || how === 'began again' ? from : place.reading!.began;

  // Nothing to read in it, as when all of it is never read: the place reached moves past it at once.
  const empty = lines.length === 0 && how !== 'again';
  const token = empty || how === 'again' ? null : crypto.randomUUID();
  let lapses: Date | null = null;
  if (how === 'again') {
    lapses = standing!.lapsesAt;
  } else {
    const moved = await withPrincipal(broker.sql, principal, (s) =>
      how === 'began' || how === 'began again'
        ? s.tx<{ lapsesAt: Date | null }[]>`select * from begin_reading(${place.place}::uuid, ${from}, ${empty ? cut : from}, ${token}::uuid, ${empty ? null : cut})`
        : s.tx<{ lapsesAt: Date | null }[]>`
            select * from hand_out_stretch(${place.place}::uuid, ${from}, ${empty ? cut : from}, ${token}::uuid, ${empty ? null : cut}, ${how === 'confirmed' ? standing!.token : null}::uuid)
          `,
    );
    if (moved.length === 0) {
      return {
        outcome: 'refused',
        text: 'Another session moved reading on at the same moment, so nothing changed here. Ask again without a token for the stretch handed out now.',
      };
    }
    lapses = moved[0].lapsesAt;
  }
  const today = how !== 'again' && cut.getTime() === until.getTime();
  if (empty) return { outcome: 'nothing', place, began, reached: cut, how: how as Exclude<typeof how, 'again'>, today };

  // Grouped by conversation, in the order each first appears.
  const groups = new Map<string, Listed[]>();
  for (const line of lines) {
    const key = line.conversation ?? `email ${line.id}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const held = await withPrincipal(broker.sql, principal, (s) => heldFrom(s, place.connection, [...groups.values()].flatMap((group) => group[0].conversation ?? [])));
  return {
    outcome: 'stretch',
    place,
    began,
    from,
    until: cut,
    token: (token ?? standing!.token)!,
    lapses: lapses!,
    how,
    today,
    conversations: [...groups.values()].map((group) => ({ lines: group, held: held.get(group[0].conversation ?? '') ?? { items: [], more: 0 } })),
  };
}

/**
 * What the person can see that rests on emails of these conversations, which Homing read through
 * the connection: for each, the newest few current items that cite one, and how many more.
 */
async function heldFrom(s: Session, connection: string, conversations: string[]): Promise<Map<string, { items: HeldItem[]; more: number }>> {
  const held = new Map<string, { items: HeldItem[]; more: number }>();
  if (conversations.length === 0) return held;
  const rows = await s.tx<(HeldItem & { conversation: string; total: number; personal: boolean })[]>`
    select conversation, id, space, personal, page, left(body, 300) as text, total from (
      select found.*, count(*) over (partition by found.conversation) as total,
             row_number() over (partition by found.conversation order by found.created_at desc, found.id) as n
      from (
        select distinct on (src.conversation, i.id)
          src.conversation, i.id, sp.name as space, sp.private_to is not null and sp.parent_id is null as personal, i.body, i.created_at,
          (select t.body from content t where t.page_id = i.page_id and t.kind = 'title' and ${visibleContent(s, 't')} order by t.private_to is null limit 1) as page
        from sources src
        join citations ci on ci.source_id = src.id
        join content i on i.id = ci.content_id
        join spaces sp on sp.id = i.space_id
        where src.read_through = ${connection}::uuid and src.conversation in ${s.tx(conversations)} and ${visible(s, 'src')}
          and i.kind = 'text' and ${visibleContent(s, 'i')} and ${current(s, 'i')}
      ) found
    ) ranked
    where n <= ${heldShown}
    order by conversation, n
  `;
  for (const row of rows) {
    const entry = held.get(row.conversation) ?? { items: [], more: Number(row.total) - Math.min(Number(row.total), heldShown) };
    entry.items.push({ id: row.id, space: row.personal ? "the user's personal space" : row.space, page: row.page, text: row.text });
    held.set(row.conversation, entry);
  }
  return held;
}

/** What a never-read sender looks like, kept: an address or a domain, in plain lower-case ASCII, as the database checks too. */
const senderShape = /^([a-z0-9._%+'-]+@)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** An entry for the never-read list as it's kept, or why it can't be one. */
export function neverReadEntry(entry: { sender?: string; folder?: string }): { sender: string } | { folder: string } | { refused: string } {
  if ((entry.sender === undefined) === (entry.folder === undefined)) return { refused: 'Give a sender or a folder, one at a time.' };
  if (entry.sender !== undefined) {
    const sender = entry.sender.trim().toLowerCase();
    if (sender.length > 254 || !senderShape.test(sender)) {
      return { refused: 'A sender is an address, such as news@example.com, or a domain, such as example.com, which covers its subdomains: in plain letters, without wildcards or spaces.' };
    }
    return { sender };
  }
  const folder = entry.folder!.trim();
  if (!folder || Array.from(folder).length > 200 || /[\p{Cc}\p{Cf}*?]/u.test(folder)) {
    return { refused: 'A folder is its name as the user sees it in their mailbox, such as Newsletters, on one line, without wildcards.' };
  }
  return { folder };
}

/**
 * Adds a sender or a folder to the never-read list of the user's mailbox, for their assistant when
 * the user says so: it's withheld from then on wherever Homing reads the mailbox. Only the person
 * takes something off, in Homing itself.
 */
export async function neverReadFor(
  broker: Broker,
  principal: AgentPrincipal,
  input: { mailbox?: string; sender?: string; folder?: string },
): Promise<{ refused: string } | { place: Place; entry: { sender: string } | { folder: string }; changed: boolean; list: NeverRead }> {
  const entry = neverReadEntry(input);
  if ('refused' in entry) return { refused: `${entry.refused} Nothing changed.` };
  return withPrincipal(broker.sql, principal, async (s) => {
    const place = await placeNamed(s, broker, input.mailbox);
    if (typeof place === 'string') return { refused: place };
    const changed = await changeNeverRead(s, broker, place, true, entry);
    const [after] = await placeListOf(s, broker, place.place);
    return { place, entry, changed, list: after! };
  });
}

/** Changes the never-read list of one of the person's places, by its id, as whoever asks: the database lets only the person themselves, in Homing, take something off. */
export async function changeNeverRead(s: Session, broker: Pick<Broker, 'connectors'>, place: Pick<Place, 'place' | 'connector' | 'kind'>, adding: boolean, entry: { sender: string } | { folder: string }): Promise<boolean> {
  const start = kindOf(broker.connectors.get(place.connector), place.kind)?.inOrder?.neverRead.folders ?? [];
  const [{ changed }] = await s.tx<{ changed: boolean }[]>`
    select change_never_read(${place.place}::uuid, ${adding}, ${'sender' in entry ? entry.sender : null}, ${'folder' in entry ? entry.folder : null}, ${s.tx.array(start)}::text[]) as changed
  `;
  return changed;
}

/** The never-read list of one of the person's places, as it is now, with the place. */
export async function placeListOf(s: Session, broker: Broker, placeId: string): Promise<[NeverRead | undefined, Place | undefined]> {
  const place = (await placesFor(s)).find((one) => one.place === placeId);
  return [place && neverReadIn(broker.connectors, place), place];
}
