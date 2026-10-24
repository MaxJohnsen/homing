// Reading a person's connected mailbox for them (spec §7, §10, guarantees 3
// and 5). Their assistant asks Homing, and Homing searches or reads the mail
// live, as the person, through their own connection: the tokens are taken
// in a transaction of the person's own, never their assistant's, used by the
// server and never handed on. Each use records which connection it used.
// Only the owner's own places lead to a mailbox, so for anyone else there is
// nothing to find, not even that it's there.

import type { AgentPrincipal } from './assistants.ts';
import { accessToken, ConnectionUnusable, type Broker, type Use } from './connections.ts';
import { personOf, withPrincipal, type Session } from './db.ts';
import { MicrosoftRefused, MicrosoftUnreachable, readMail, searchMail, type MailAddress, type MailSummary, type MailWithThread } from './microsoft.ts';
import { accessibleSpaces } from './spaces.ts';

/** One of the person's mailboxes: a place of theirs, and the connection that reaches it. */
export interface Mailbox {
  place: string;
  space: string;
  connection: string;
  address: string;
  status: 'connected' | 'needs attention';
}

/** How long a search waits for a mailbox, so a slow one never holds up the rest of the answer. */
export const searchTimeLimit = 2_500;
/** How long reading one email may take. */
const readTimeLimit = 10_000;
/** How many emails a search shows from each mailbox. */
const mailShown = 5;
/** The most of an email's own words a source keeps. */
const excerptLength = 1_000;
/** What a source keeps of an email when no words are given: its opening. */
const openingLength = 500;

/**
 * The person's own mailboxes that a request in a space reaches: those added in it, in a space above
 * it, whose context it's in, or in a space below it, which search looks in too. Without a space, all
 * of them. One for each account, at the place in the space itself if there is one, or else the
 * first added. Never anyone else's: Homing asks only for the person's, and row-level security shows
 * them nothing more.
 */
export async function mailboxesFor(s: Session, spaceId?: string): Promise<Mailbox[]> {
  const person = personOf(s.principal);
  if (!person) return [];
  const mailboxes = await s.tx<Mailbox[]>`
    select * from (
      select distinct on (c.id) p.id as place, p.space_id as space, c.id as connection, c.address, c.status
      from places p join connections c on c.id = p.connection_id
      where p.private_to = ${person}::uuid and p.kind = 'mailbox' and p.removed_at is null and c.revoked_at is null
        and p.space_id in (${accessibleSpaces(s)})
        ${spaceId
          ? s.tx`and (p.space_id in (select space_subtree(${spaceId}::uuid)) or p.space_id in (select id from spaces_above(${spaceId}::uuid)))`
          : s.tx``}
      order by c.id, p.space_id = ${spaceId ?? null}::uuid desc nulls last, p.added_at, p.id
    ) mailboxes
    order by address, connection
  `;
  return [...mailboxes];
}

/** An email's reference: the place its mailbox is in, and its immutable id there. */
export const mailRef = (place: string, id: string) => `mail:${place}:${id}`;

/** Whether a value is meant as an email's reference. */
export const isMailRef = (value: string | undefined) => /^\s*mail:/i.test(value ?? '');

/** The place and the email an email's reference names, or undefined when it isn't one. */
export function parseMailRef(value: string): { place: string; id: string } | undefined {
  const match = /^mail:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([A-Za-z0-9+/=_-]{1,1024})$/i.exec(value.trim());
  return match ? { place: match[1].toLowerCase(), id: match[2] } : undefined;
}

/** Why Homing couldn't search or read a mailbox, for its owner only. */
export type MailProblem = 'needs attention' | 'not set up' | 'slow' | 'unreachable' | 'refused' | 'failed';

/** What searching one mailbox found, or why it couldn't. */
export type MailFound = { mailbox: Mailbox; found: MailSummary[] } | { mailbox: Mailbox; problem: MailProblem };

/**
 * Searches the person's mailboxes live, each under the time limit, all at once. A mailbox that's
 * slow, unreachable or waiting for its owner to sign in again gives its reason instead, and one
 * revoked meanwhile gives nothing. Never throws, so it never breaks the rest of an answer.
 */
export async function searchMailboxes(broker: Broker, principal: AgentPrincipal, mailboxes: Mailbox[], query: string): Promise<MailFound[]> {
  const found = await Promise.all(
    mailboxes.map(async (mailbox): Promise<MailFound | undefined> => {
      if (mailbox.status === 'needs attention') return { mailbox, problem: 'needs attention' };
      const settings = broker.microsoft;
      if (!settings) return { mailbox, problem: 'not set up' };
      const deadline = AbortSignal.timeout(searchTimeLimit);
      const work = asOwner(broker, principal, mailbox, 'search mail', (token) => searchMail(settings, token, query, { top: mailShown, signal: deadline }));
      const late = new Promise<'late'>((resolve) => deadline.addEventListener('abort', () => resolve('late'), { once: true }));
      try {
        const result = await Promise.race([work, late]);
        if (result === 'late') {
          // What was under way finishes on its own, such as a refresh, whose new sign-in is kept.
          work.catch(() => {});
          return { mailbox, problem: 'slow' };
        }
        return { mailbox, found: result };
      } catch (error) {
        const problem = problemOf(error);
        return problem === 'gone' ? undefined : { mailbox, problem };
      }
    }),
  );
  return found.filter((one) => one !== undefined);
}

/** What reading an email by its reference gives the person: the email, or why it can't be read. */
export type MailRead = { mailbox: Mailbox; mail: MailWithThread } | { mailbox: Mailbox; problem: MailProblem | 'removed' | 'not there' };

/**
 * Reads an email by its reference, for the person whose mailbox it's in. Undefined when the
 * reference names no place of theirs, whether it's someone else's or doesn't exist, so the answer
 * is the same either way, and comes before anything is asked of Microsoft.
 */
export async function readMailFor(broker: Broker, principal: AgentPrincipal, ref: { place: string; id: string }, { thread = true } = {}): Promise<MailRead | undefined> {
  const mailbox = await withPrincipal(broker.sql, principal, (s) => placeOf(s, ref.place));
  if (!mailbox) return undefined;
  if (mailbox.removed) return { mailbox, problem: 'removed' };
  if (mailbox.status === 'needs attention') return { mailbox, problem: 'needs attention' };
  const settings = broker.microsoft;
  if (!settings) return { mailbox, problem: 'not set up' };
  try {
    const deadline = AbortSignal.timeout(readTimeLimit);
    const mail = await asOwner(broker, principal, mailbox, 'read mail', (token) => readMail(settings, token, ref.id, { signal: deadline, thread }));
    return mail ? { mailbox, mail } : { mailbox, problem: 'not there' };
  } catch (error) {
    const problem = problemOf(error);
    return { mailbox, problem: problem === 'gone' ? 'removed' : problem };
  }
}

/** One of the person's own places, as a mailbox, whether or not it's still in use. */
async function placeOf(s: Session, placeId: string): Promise<(Mailbox & { removed: boolean }) | undefined> {
  const person = personOf(s.principal);
  if (!person) return undefined;
  const [mailbox] = await s.tx<(Mailbox & { removed: boolean })[]>`
    select p.id as place, p.space_id as space, c.id as connection, c.address, c.status, p.removed_at is not null or c.revoked_at is not null as removed
    from places p join connections c on c.id = p.connection_id
    where p.id = ${placeId}::uuid and p.private_to = ${person}::uuid and p.kind = 'mailbox' and c.person_id = ${person}::uuid
  `;
  return mailbox;
}

/**
 * Uses the mailbox as its owner, recording the use. When Graph refuses a token before it expires,
 * such as after the person withdrew their consent, one new sign-in finds out whether it still
 * works, and marks the connection as needing attention if it doesn't.
 */
async function asOwner<T>(broker: Broker, principal: AgentPrincipal, mailbox: Mailbox, operation: Use['operation'], fn: (token: string) => Promise<T>): Promise<T> {
  const use: Use = { place: mailbox.place, space: mailbox.space, operation, agent: principal.agent };
  try {
    return await fn(await accessToken(broker, principal.person, mailbox.connection, use));
  } catch (error) {
    if (!(error instanceof MicrosoftRefused && error.detail === 'InvalidAuthenticationToken')) throw error;
    return fn(await accessToken(broker, principal.person, mailbox.connection, undefined, { renew: true }));
  }
}

function problemOf(error: unknown): MailProblem | 'gone' {
  if (error instanceof ConnectionUnusable) return error.reason;
  if (error instanceof MicrosoftUnreachable) return 'unreachable';
  if (error instanceof MicrosoftRefused) {
    console.error(`mail: Microsoft refused reading a mailbox (${error.message})`);
    return 'refused';
  }
  console.error(error);
  return 'failed';
}

/** A source Homing made from an email it read itself, to keep on the person's private side where its mailbox is. */
export interface MailSource {
  spaceId: string;
  reference: string;
  excerpt: string;
  /** The connection Homing read it through. */
  connection: string;
}

/** Why Homing can't keep an email as a source, for the assistant to tell the person. */
export class MailSourceRefused extends Error {
  override name = 'MailSourceRefused';
}

/**
 * Reads an email for the person and makes the source that keeps it: its reference, sender, date,
 * subject and the words given, once Homing finds them in it, or else its opening, so what's kept
 * is what Homing read, never what an assistant said it says.
 */
export async function mailSource(broker: Broker, principal: AgentPrincipal, reference: string, words?: string): Promise<MailSource> {
  const ref = parseMailRef(reference);
  if (!ref) throw new MailSourceRefused(`"${reference.trim()}" isn't an email's reference. They look like mail:…:…, as \`search\` and \`read\` give them.`);
  const read = await readMailFor(broker, principal, ref, { thread: false });
  if (!read) throw new MailSourceRefused(noEmail);
  if ('problem' in read) throw new MailSourceRefused(`Nothing was saved: ${mailProblem(read.mailbox, read.problem, 'reading')}`);
  const { mail } = read.mail;
  let kept: string;
  if (words?.trim()) {
    kept = plain(words);
    if (kept.length > excerptLength) throw new MailSourceRefused(`Nothing was saved: quote at most ${excerptLength.toLocaleString('en-US')} characters of the email as its excerpt.`);
    if (!plain(`${mail.subject ?? ''}\n${mail.body}`).includes(kept)) {
      throw new MailSourceRefused('Nothing was saved: those words aren’t in that email as Homing reads it. Quote them exactly as `read` shows them, or leave out the excerpt to keep its opening.');
    }
  } else {
    const opening = plain(mail.body || mail.preview);
    kept = opening.length > openingLength ? `${opening.slice(0, opening.lastIndexOf(' ', openingLength) > 0 ? opening.lastIndexOf(' ', openingLength) : openingLength)}…` : opening;
  }
  const excerpt = [`From: ${addressLine(mail.from)}`, `Date: ${mail.at ? when(mail.at) : 'unknown'}`, `Subject: ${oneLine(mail.subject ?? '')}`, '', kept || '(no text)'].join('\n');
  return { spaceId: read.mailbox.space, reference: mailRef(ref.place, mail.id || ref.id), excerpt, connection: read.mailbox.connection };
}

/** The answer for a reference that names no email the person can read, whoever's it is. */
export const noEmail = 'There is no email with that reference that you can see.';

/**
 * Why a mailbox couldn't be searched or read, in a sentence for its owner's assistant, with where
 * they sign in again when that's what it needs. Only ever said about the person's own mailbox.
 */
export function mailProblem(mailbox: Mailbox, problem: MailProblem | 'removed' | 'not there', doing: 'searching' | 'reading', signIn?: string): string {
  const box = `the user's mailbox ${mailbox.address}`;
  const left = doing === 'searching' ? ', so this leaves it out' : '';
  switch (problem) {
    case 'needs attention':
      return `${box} needs them to sign in to Microsoft again in Homing${signIn ? `, at ${signIn},` : ''} before Homing can ${doing === 'searching' ? 'search' : 'read'} it.`;
    case 'removed':
      return `that email is in ${box}, which isn't connected there any more. The user can connect it again in Homing.`;
    case 'not there':
      return `that email isn't in ${box} any more, or it moved to an archive. Search for it again.`;
    case 'not set up':
      return `this Homing isn't set up to reach Microsoft 365 any more${left}. Tell the user.`;
    case 'slow':
      return `${box} didn't answer within ${searchTimeLimit / 1000} seconds${left}. Try again in a moment.`;
    case 'unreachable':
      return `Microsoft didn't answer for ${box}${left}. Try again later.`;
    case 'refused':
      return `Microsoft refused ${doing} ${box}${left}. Tell the user if it keeps happening.`;
    case 'failed':
      return `something went wrong ${doing} ${box}${left}. Try again later.`;
  }
}

/** Text from an email on one line, without characters that hide or turn text around. */
export function oneLine(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** "Gunnar Lie <gunnar@minus1.no>", or whichever of the two the email gives. */
function addressLine(address: MailAddress | null): string {
  if (!address) return 'unknown';
  const name = address.name && oneLine(address.name);
  const at = address.address && oneLine(address.address);
  return name && at && name !== at ? `${name} <${at}>` : (name || at || 'unknown');
}

/** A time as the mailbox shows it, in UTC to the minute. */
export const when = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** Text as compared and kept: in one form of Unicode, with single spaces. */
const plain = (value: string) => value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
