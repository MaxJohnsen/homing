// Email in general, for any connector with a mailbox (spec §7, §10): how
// Homing words a mailbox, what it reads of an email as an item, who could
// see it, and what a source keeps of one. What's Microsoft's own, such as
// Graph, stays in microsoft.ts, and what's the same for every system, such
// as finding places and framing, is in places.ts and mcp.ts.

import type { Audience, Envelope, Found, Item, Party, Words } from './connectors.ts';
import { noItem, oneLine, SourceRefused, when } from './places.ts';

/** How Homing words a mailbox and the emails in it. */
export const mailbox: Words = {
  place: 'mailbox',
  places: 'mailboxes',
  item: 'email',
  items: 'emails',
  anItem: 'an email',
  title: 'subject',
  author: 'sender',
  related: 'thread',
  keeps: 'the sender, date, subject and the sentences with the words you quote from what its sender wrote',
};

/** The answer for a reference that names no email the person can read, whoever's it is. */
export const noEmail = noItem(mailbox);

/** An email, as its mailbox gives it: who it's from and to, its text, and its attachments by name. */
export interface Email {
  id: string;
  subject: string | null;
  from: Party | null;
  to: Party[];
  cc: Party[];
  /** When the mailbox received it, or sent it. */
  at: Date | null;
  /** Its text, never its HTML. */
  body: string;
  /** The part of its text that's its own, without what it quotes from earlier emails, where the mailbox tells them apart. */
  unique: string | null;
  /** Its first words, as the mailbox gives them. */
  preview: string;
  attachments: string[];
}

/** An email as a list of them shows it, such as a search or its thread. */
export type EmailSummary = Pick<Email, 'id' | 'subject' | 'from' | 'at' | 'preview'>;

/** How many of an email's recipients its audience keeps. */
const audienceKept = 100;

/** An email a search found. Who it went to isn't known until it's read. */
export function emailFound(email: EmailSummary): Found {
  return { ...envelopeOf(email), preview: email.preview };
}

function envelopeOf(email: EmailSummary, audience: Audience = 'unknown'): Envelope {
  return { id: email.id, title: email.subject, at: email.at, author: email.from, audience };
}

/**
 * An email as Homing reads it: its sender, recipients, date, subject and attachments' names, its
 * text, and its thread. Who could see it are its To and Cc, unless it names nobody there, as an
 * email sent only as Bcc doesn't.
 */
export function emailItem(email: Email, thread: EmailSummary[], moreInThread: boolean): Item {
  const recipients = [...email.to, ...email.cc];
  const audience: Audience = recipients.length ? { people: recipients.slice(0, audienceKept), more: Math.max(0, recipients.length - audienceKept) } : 'unknown';
  const fields: Item['fields'] = [['From', { party: email.from }]];
  if (email.to.length) fields.push(['To', { parties: email.to }]);
  if (email.cc.length) fields.push(['Cc', { parties: email.cc }]);
  fields.push(['Date', { at: email.at }], ['Subject', { text: email.subject ?? '' }]);
  if (email.attachments.length) fields.push(['Attachments, by name only', { texts: email.attachments }]);
  return {
    envelope: envelopeOf(email, audience),
    fields,
    text: email.body,
    related: thread.map((summary) => envelopeOf(summary)),
    moreRelated: moreInThread,
    excerpt: (words) => emailExcerpt(email, words),
  };
}

/** The fewest and most characters an assistant may quote from an email for a source. */
const quoteLength = { least: 12, most: 600 };
/** How much of the paragraph around the quoted words a source keeps, on each side. */
const contextLength = 200;
/** What a source keeps of an email when no words are given: its opening. */
const openingLength = 500;

/**
 * What a source keeps of an email Homing read: its sender, date, subject and the words given with
 * what's around them in their paragraph, so a "not" before them comes along, or else the sender's
 * opening. The words are looked for in what its sender wrote, never in its subject. Words it only
 * quotes from an earlier email are kept marked as quoted: Homing read this email, not the earlier
 * one. So what's kept is what Homing read, never what an assistant said it says.
 */
export function emailExcerpt(email: Email, words?: string): string {
  // What its sender wrote: the mailbox's own part unique to this email, or, where it doesn't give
  // one, the text up to what it quotes, as Outlook and Gmail mark that in English and Norwegian.
  const own = splitQuoted(email.unique ?? email.body).own;
  let kept: string;
  let quoted = false;
  if (words?.trim()) {
    const wanted = flat(words);
    if (wanted.length < quoteLength.least || wanted.length > quoteLength.most) {
      throw new SourceRefused(`Nothing was saved: quote ${quoteLength.least} to ${quoteLength.most} characters of the email as its excerpt, the words the knowledge rests on.`);
    }
    const found = around(own, wanted) ?? around(quotedPart(email.body, own), wanted);
    if (!found) {
      throw new SourceRefused('Nothing was saved: those words aren’t in the email’s text as Homing reads it. Quote them exactly as `read` shows them, or leave out the excerpt to keep its opening.');
    }
    quoted = !around(own, wanted);
    kept = found;
  } else {
    // Only the sender's own words. The mailbox's preview is used only for an email without any text.
    const opening = own.join(' ');
    const cut = opening.lastIndexOf(' ', openingLength);
    kept = opening.length > openingLength ? `${opening.slice(0, cut > 0 ? cut : openingLength)}…` : opening || (flat(email.body) ? '' : flat(email.preview));
  }
  return [
    `From: ${addressLine(email.from)}`,
    `Date: ${email.at ? when(email.at) : 'unknown'}`,
    `Subject: ${oneLine(email.subject ?? '')}`,
    ...(quoted ? [quotedLine] : []),
    '',
    kept || '(no text)',
  ].join('\n');
}

/** What a source says above the words when the email only quotes them from an earlier one. */
const quotedLine = 'Quoted: as this email quotes an earlier one, which Homing didn’t read';

/**
 * Whether a source Homing made from an email keeps words it only quotes from an earlier one. Its
 * first lines, before the blank line, are Homing's own, each on one line.
 */
export const quotesEarlier = (excerpt: string) => excerpt.split('\n\n', 1)[0].split('\n').includes(quotedLine);

/**
 * An email's text as paragraphs, one line each: a single line break is only where a line was
 * wrapped, and a blank line ends a paragraph. Markers of quoting, ">", are left out.
 */
function paragraphs(text: string): string[] {
  const found: string[] = [];
  let current: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n').map((line) => flat(line.replace(/^\s*(>\s?)+/, '')))) {
    if (line) current.push(line);
    else if (current.length) found.push(current.join(' ')), (current = []);
  }
  if (current.length) found.push(current.join(' '));
  return found;
}

/**
 * What an email's text holds besides what its sender wrote, which comes first: the rest of its
 * paragraphs, from where the sender's own words end. All of them when the sender's words don't come
 * first, as in an answer written between quoted lines.
 */
function quotedPart(body: string, own: string[]): string[] {
  const all = paragraphs(body);
  let left = own.join(' ');
  for (const [at, paragraph] of all.entries()) {
    if (!left) return all.slice(at);
    if (paragraph.startsWith(left)) return [paragraph.slice(left.length).trim(), ...all.slice(at + 1)].filter(Boolean);
    if (!left.startsWith(paragraph)) return all;
    left = left.slice(paragraph.length).trim();
  }
  return [];
}

/**
 * An email's text split into what its sender wrote and what it quotes from earlier emails: lines
 * starting with ">", and everything from a line that starts a quoted email, as Outlook and Gmail
 * write it in English and Norwegian. Both as paragraphs.
 */
export function splitQuoted(body: string): { own: string[]; earlier: string[] } {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const plainLines = lines.map(flat);
  const header = (at: number) =>
    /^(From|Fra|Von|Från):\s/i.test(plainLines[at]) && plainLines.slice(at + 1, at + 5).some((line) => /^(Sent|Sendt|Date|Dato|Gesendet|Skickat):\s/i.test(line));
  const starts = (at: number) =>
    /^-{2,}\s*(Original Message|Opprinnelig melding)\s*-{2,}$/i.test(plainLines[at]) ||
    /^_{8,}$/.test(plainLines[at]) ||
    /^On\s.*\bwrote:$/i.test(plainLines[at]) ||
    (/^On\s/i.test(plainLines[at]) && /\bwrote:$/i.test(plainLines[at + 1] ?? '')) ||
    /\d.*\bskrev\b.*:$/i.test(plainLines[at]) ||
    header(at);
  const first = plainLines.findIndex((_, at) => starts(at));
  const before = first < 0 ? lines : lines.slice(0, first);
  const quotes = (line: string) => /^\s*>/.test(line);
  return {
    // A quoted line among the sender's own ends a paragraph, as a blank line would.
    own: paragraphs(before.map((line) => (quotes(line) ? '' : line)).join('\n')),
    earlier: paragraphs([...before.map((line) => (quotes(line) ? line : '')), '', ...(first < 0 ? [] : lines.slice(first))].join('\n')),
  };
}

/**
 * The words, found in one paragraph, or across them, with up to a little of what's around them
 * there on each side, cut at a word. Undefined when they aren't there.
 */
function around(text: string[], words: string): string | undefined {
  const within = text.find((paragraph) => paragraph.includes(words)) ?? (text.join(' ').includes(words) ? text.join(' ') : undefined);
  if (within === undefined) return undefined;
  const at = within.indexOf(words);
  const end = at + words.length;
  let start = 0;
  let stop = within.length;
  if (at > contextLength) {
    const space = within.indexOf(' ', at - contextLength);
    start = space >= 0 && space < at ? space + 1 : at - contextLength;
  }
  if (within.length - end > contextLength) {
    const space = within.lastIndexOf(' ', end + contextLength);
    stop = space > end ? space : end + contextLength;
  }
  return `${start > 0 ? '…' : ''}${within.slice(start, stop).trim()}${stop < within.length ? '…' : ''}`;
}

/** "Gunnar Lie <gunnar@minus1.no>", or whichever of the two the email gives. */
function addressLine(address: Party | null): string {
  if (!address) return 'unknown';
  const name = address.name && oneLine(address.name);
  const at = address.address && oneLine(address.address);
  return name && at && name !== at ? `${name} <${at}>` : (name || at || 'unknown');
}

/** Text as compared and kept: in one form of Unicode, without characters that hide or turn text around, with single spaces. */
const flat = (value: string) => oneLine(value.normalize('NFC'));
