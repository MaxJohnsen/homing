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

import postgres from 'postgres';
import type { AgentPrincipal } from './assistants.ts';
import { kindOf, type Broker } from './connections.ts';
import type { Connectors, Listed } from './connectors.ts';
import { withPrincipal, type Session } from './db.ts';
import { current, visible, visibleContent } from './knowledge.ts';
import { listPlace, neverReadIn, oneLine, placesFor, type Place, type Problem } from './places.ts';

/** How many lines a stretch has unless the assistant asks for fewer or more, and the most it may ask for. */
export const linesUsually = 100;
export const linesAtMost = 150;
/**
 * The most characters a stretch's conversations take, beside Homing's own words above them, so the
 * whole of it fits in one answer, as assistants' clients cut what a tool gives at about 25,000 tokens.
 */
export const charactersAtMost = 36_000;
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

/** How a stretch's conversations read, as the assistant gets them, which is what its size is measured by. */
export type Framing = (place: Place, conversations: Conversation[]) => string;

/** How a stretch came about: reading began or began again, the stretch before was confirmed, the next was asked for, or it's the same one again. */
type How = 'began' | 'began again' | 'confirmed' | 'next' | 'again';

/**
 * Emails of one second that a stretch doesn't list, since more arrived in it than a stretch holds:
 * which second, and how many, or null when Homing didn't get through that second at once.
 */
export type Unlisted = { at: Date; count: number | null };

/**
 * What asking for the list gave: a stretch, with its conversations as framed, whether it reaches
 * the newest mail Homing hands out, whether it ends sooner so it can be read in one answer, and
 * what it doesn't list of a second that holds more; nothing to read up to now; a refusal; or why
 * the system couldn't be read.
 */
export type Listing =
  | { outcome: 'stretch'; place: Place; began: Date; from: Date; until: Date; token: string; lapses: Date; how: How; today: boolean; short: boolean; unlisted?: Unlisted; emails: number; conversations: number; text: string }
  | { outcome: 'nothing'; place: Place; began: Date; reached: Date; how: Exclude<How, 'again'>; today: boolean; unlisted?: Unlisted }
  | { outcome: 'refused'; text: string }
  | { outcome: 'problem'; place: Place; problem: Problem; retryAfter?: number; reached: Date | null };

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
function cutOf(listed: Listed[], through: Date, most: number): Date {
  const cut = listed.length > most ? second(listed[most].at!) : through;
  return listed.length && cut <= listed[0].at! ? new Date(second(listed[0].at!).getTime() + 1000) : cut;
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
 * before it changes anything, so a fault at the system loses no place. A stretch ends at an earlier
 * second when it would be too long to read in one answer, though never before its first, and of a
 * second that alone holds more than a stretch, it lists the first, saying how many more there are.
 */
export async function listStretch(
  broker: Broker,
  principal: AgentPrincipal,
  input: { mailbox?: string; from?: string; token?: string; lines?: number },
  frame: Framing,
): Promise<Listing> {
  if (input.from !== undefined && input.token !== undefined) return { outcome: 'refused', text: 'Give either a token or a day to begin from, not both. Nothing changed.' };
  const place = await withPrincipal(broker.sql, principal, (s) => placeNamed(s, broker, input.mailbox));
  if (typeof place === 'string') return { outcome: 'refused', text: place };
  const { began, reached, token: handed, stretchEnds, lapsesAt } = place;
  const at = (moment: Date) => `${moment.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const until = second(new Date(Date.now() - settling));

  let from: Date;
  let how: How;
  if (input.from !== undefined) {
    const day = dayOf(input.from);
    if (!day) return { outcome: 'refused', text: `"${oneLine(input.from)}" isn't a day. Give the day to begin from as YYYY-MM-DD, such as 2025-01-01. Nothing changed.` };
    if (day >= until) return { outcome: 'refused', text: 'That day hasn’t come yet, so there’s nothing to read from it. Nothing changed.' };
    from = day;
    how = began ? 'began again' : 'began';
  } else if (!began || !reached) {
    return {
      outcome: 'refused',
      text: `Reading the user's mailbox ${oneLine(place.address)} in order hasn't begun. Ask the user how far back to read, then ask again with from, the day to begin from, as YYYY-MM-DD.`,
    };
  } else if (input.token !== undefined) {
    if (!handed || handed !== input.token.trim().toLowerCase()) {
      return {
        outcome: 'refused',
        text:
          `That token isn't the current one, so nothing changed: reading the user's mailbox ${oneLine(place.address)} has reached ${at(reached)}. ` +
          'The stretch it was for was confirmed already, or handed out again once it lapsed, or reading began again since. Ask again without a token for the stretch handed out now.',
      };
    }
    from = stretchEnds!;
    how = 'confirmed';
  } else {
    from = reached;
    how = handed && lapsesAt! > new Date() ? 'again' : 'next';
  }

  const end = how === 'again' ? stretchEnds! : until;
  const most = how === 'again' ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.min(Math.floor(input.lines ?? linesUsually), linesAtMost));
  const listedIn = from < end ? await listPlace(broker, principal, place, { from, until: end, most }) : { listed: [], through: end };
  if ('problem' in listedIn) return { outcome: 'problem', place, problem: listedIn.problem, retryAfter: listedIn.retryAfter, reached };
  const { listed, through, partly = false } = listedIn;

  // What the token confirms is what was shown under it, so it comes again whole, or not at all.
  if (how === 'again' && through < end) {
    return {
      outcome: 'refused',
      text: `The stretch handed out now, from ${at(from)} to ${at(end)}, couldn't be listed again in full at once. Ask again without a token after it lapses at ${at(lapsesAt!)}, when it's handed out afresh.`,
    };
  }
  let cut = how === 'again' ? end : from >= end ? from : cutOf(listed, through, most);
  let lines = listed.filter((line) => line.at! < cut);
  const held = await withPrincipal(broker.sql, principal, (s) => heldFrom(s, place.connection, lines.flatMap((line) => line.conversation ?? [])));
  const framed = (some: Listed[]) => frame(place, grouped(some, held));
  let text = framed(lines);
  let short = false;
  // Too long to read in one answer: it ends a second sooner, until it fits or holds only one second.
  while (how !== 'again' && text.length > charactersAtMost) {
    const sooner = second(lines.at(-1)!.at!);
    const fewer = lines.filter((line) => line.at! < sooner);
    if (fewer.length === 0) break;
    [cut, lines, text, short] = [sooner, fewer, framed(fewer), true];
  }
  // A second that alone holds more than a stretch may: as many of its first emails as fit.
  let shown = lines;
  if (lines.length > 1 && second(lines[0].at!).getTime() === second(lines.at(-1)!.at!).getTime()) {
    shown = lines.slice(0, linesAtMost);
    text = framed(shown);
    while (text.length > charactersAtMost && shown.length > 1) text = framed((shown = shown.slice(0, -1)));
  }
  const more = lines.length - shown.length;
  const unlisted = partly ? { at: new Date(cut.getTime() - 1000), count: null } : more ? { at: second(shown[0].at!), count: more } : undefined;
  const beginning = how === 'began' || how === 'began again';

  // Nothing to read in it, as when all of it is never read: the place reached moves past it at once.
  const empty = shown.length === 0 && how !== 'again';
  const token = empty || how === 'again' ? handed : crypto.randomUUID();
  let lapses = lapsesAt;
  if (how !== 'again') {
    const moved = await withPrincipal(broker.sql, principal, (s) => s.tx<{ lapsesAt: Date | null }[]>`
      select * from move_reading(${place.place}::uuid, ${beginning}, ${from}, ${empty ? cut : from}, ${empty ? null : token}::uuid, ${empty ? null : cut}, ${how === 'confirmed' ? handed : null}::uuid)
    `);
    if (moved.length === 0) {
      return {
        outcome: 'refused',
        text: 'Another session moved reading on at the same moment, so nothing changed here. Ask again without a token for the stretch handed out now.',
      };
    }
    lapses = moved[0].lapsesAt;
  }
  const today = how !== 'again' && cut.getTime() === until.getTime();
  const startedAt = beginning ? from : began!;
  if (empty) return { outcome: 'nothing', place, began: startedAt, reached: cut, how: how as Exclude<How, 'again'>, today, unlisted };
  const conversations = new Set(shown.map((line) => line.conversation ?? line.id)).size;
  return { outcome: 'stretch', place, began: startedAt, from, until: cut, token: token!, lapses: lapses!, how, today, short, unlisted, emails: shown.length, conversations, text };
}

/** The lines grouped by conversation, in the order each first appears, with what Homing holds from each. */
function grouped(lines: Listed[], held: Map<string, Conversation['held']>): Conversation[] {
  const groups = new Map<string, Listed[]>();
  for (const line of lines) {
    const key = line.conversation ?? `email ${line.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(line);
  }
  return [...groups.values()].map((group) => ({ lines: group, held: held.get(group[0].conversation ?? '') ?? { items: [], more: 0 } }));
}

/**
 * What the person can see that rests on emails of these conversations, which Homing read through
 * a connection to the same account, this one or one before it: for each, the newest few current
 * items that cite one, and how many more.
 */
async function heldFrom(s: Session, connection: string, conversations: string[]): Promise<Map<string, Conversation['held']>> {
  const held = new Map<string, Conversation['held']>();
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
        where src.read_through in (
            select c.id from connections c join connections this on (c.person_id, c.provider, c.tenant, c.account) = (this.person_id, this.provider, this.tenant, this.account)
            where this.id = ${connection}::uuid
          )
          and src.conversation in ${s.tx([...new Set(conversations)])} and ${visible(s, 'src')}
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

/** An entry of the never-read list, without who added it and when. */
export type Entry = { sender: string } | { folder: string } | { standard: string };

/**
 * An entry for the never-read list as it's kept, or why it can't be one: a sender in lower case, as
 * the database checks it, or a folder on one line, without wildcards. A folder by Homing's name for
 * one the kind starts the list with is that one.
 */
function entryOf(entry: { sender?: string; folder?: string }, standard: Record<string, string>): Entry | { refused: string } {
  if ((entry.sender === undefined) === (entry.folder === undefined)) return { refused: 'Give a sender or a folder, one at a time.' };
  if (entry.sender !== undefined) return { sender: entry.sender.trim().toLowerCase() };
  const folder = entry.folder!.trim();
  if (!folder || Array.from(folder).length > 200 || /[\p{Cc}\p{Cf}*?]/u.test(folder)) {
    return { refused: 'A folder is its name as the user sees it in their mailbox, such as Newsletters, on one line, without wildcards.' };
  }
  const made = Object.keys(standard).find((name) => standard[name].toLowerCase() === folder.toLowerCase());
  return made ? { standard: made } : { folder };
}

/**
 * Adds a sender or a folder to the never-read list of one of the person's places, or takes one off,
 * as whoever asks: the database lets only the person themselves, in Homing, take something off, and
 * records who added an entry and when. What changed, or why nothing did.
 */
export async function changeNeverRead(
  s: Session,
  connectors: Connectors,
  place: Place,
  adding: boolean,
  input: { sender?: string; folder?: string },
): Promise<{ refused: string } | { entry: Entry; changed: boolean }> {
  const entry = entryOf(input, kindOf(connectors.get(place.connector), place.kind)?.inOrder?.standard ?? {});
  if ('refused' in entry) return entry;
  try {
    // In a savepoint, so what the database refuses comes back as a refusal.
    const [{ changed }] = await s.tx.savepoint((sp) => sp<{ changed: boolean }[]>`
      select change_never_read(${place.place}::uuid, ${adding}, ${sp.json(entry)}, ${sp.json(neverReadIn(connectors, { ...place, neverRead: null }) as never)}) as changed
    `);
    return { entry, changed };
  } catch (error) {
    if (!(error instanceof postgres.PostgresError) || error.code !== '23514') throw error;
    return {
      refused:
        'sender' in entry
          ? 'A sender is an address, such as news@example.com, or a domain, such as example.com, which covers its subdomains: in plain letters, without wildcards or spaces.'
          : 'The never-read list holds 500 entries at most.',
    };
  }
}

/**
 * Adds a sender or a folder to the never-read list of the user's mailbox, for their assistant: it's
 * withheld from then on wherever Homing reads the mailbox. Only the person takes something off, in
 * Homing itself.
 */
export async function neverReadFor(
  broker: Broker,
  principal: AgentPrincipal,
  input: { mailbox?: string; sender?: string; folder?: string },
): Promise<{ refused: string } | { place: Place; entry: Entry; changed: boolean }> {
  return withPrincipal(broker.sql, principal, async (s) => {
    const place = await placeNamed(s, broker, input.mailbox);
    if (typeof place === 'string') return { refused: place };
    const done = await changeNeverRead(s, broker.connectors, place, true, input);
    return 'refused' in done ? { refused: `${done.refused} Nothing changed.` } : { place, ...done };
  });
}
