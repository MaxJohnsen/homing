// A stand-in for Microsoft's sign-in and Microsoft Graph, which are outside
// Homing. It keeps Microsoft's side of the rules Homing relies on: a code works
// once, for a few minutes, only with the PKCE verifier it was issued for and
// only for the app and address it was issued to, and the app proves who it is
// with an assertion signed by its certificate. It counts what it's asked.
// Graph also keeps a mailbox for each account, with folders, which it
// searches and reads as Outlook does, with ids that change when an email
// moves, and immutable ones that don't, for whoever asks for those. It lists
// a mailbox's emails by when they arrived, as Graph documents it: oldest
// first only with a filter on the same field first, at most 1,000 to a page,
// a page that may hold fewer than asked for, and a next link to follow, whose
// $skip counts items that aren't emails too, so only the link leads on. Its
// folders go by their well-known names in any language. When it's asked too
// often, or is down, it says how long to wait, and it can answer badly: a
// body cut short, one that isn't JSON, or one that isn't what Graph
// documents. It's never asked to change anything, and counts it if it is.

import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { certificateCredential, type MicrosoftSettings } from '../src/microsoft.ts';

/** Someone's Microsoft account: a work account in a directory, or a personal one. */
export interface Account {
  tenant: string;
  oid: string;
  address: string;
  name: string;
  /** An account without a mailbox, such as one only for signing in. */
  noMailbox?: boolean;
  /** The language of its mailbox, which Outlook names its folders in. English by default. */
  language?: 'en' | 'nb';
  /** A mailbox whose emails give their folder's id in another form than its folders do, which a folder read by that form gives back. */
  otherFolderIds?: boolean;
}

/** An email, as someone sends it to an account. */
export interface Email {
  from: { name: string; address: string };
  to?: { name: string; address: string }[];
  cc?: { name: string; address: string }[];
  subject: string;
  /** Its text as HTML, as most emails come. */
  html: string;
  at: Date;
  /** The thread it's in, by default one of its own. */
  conversation?: string;
  /**
   * The part of its HTML that's its own, as Exchange gives it: by default all of it, as for an
   * email that quotes nothing, or null when Exchange gives none.
   */
  unique?: string | null;
  attachments?: { name: string; inline?: boolean }[];
  bcc?: { name: string; address: string }[];
  /** The folder it's in: a well-known one, such as sentitems or junkemail, or one of the owner's own by its path, such as Clients/Northwind, where an empty name is a folder without one. By default the inbox. */
  folder?: string;
  /** A draft, not sent. */
  draft?: boolean;
}

/** An email in a mailbox: its immutable id, and the folder it's in, by its id, which its ordinary id depends on. */
interface Kept extends Email {
  id: string;
  folder: string;
  conversation: string;
}

/** A folder in a mailbox: its name, the folder it's in, and the well-known name of one Outlook makes. */
interface Folder {
  id: string;
  name: string;
  parent: string | null;
  wellKnown?: string;
}

/** A mailbox's folders, its emails, and the items in it that aren't emails, such as a contact, which a list goes past. */
interface Mailbox {
  folders: Folder[];
  emails: Kept[];
  others: { at: Date; folder: string; id: string }[];
  /** The most emails a page of a list holds, whatever was asked for. */
  pageCap?: number;
}

/** The folders Outlook makes in every mailbox, by their well-known names, with their names in English and Norwegian. */
const wellKnown: [string, string, string][] = [
  ['inbox', 'Inbox', 'Innboks'], ['sentitems', 'Sent Items', 'Sendte elementer'], ['drafts', 'Drafts', 'Kladd'], ['deleteditems', 'Deleted Items', 'Slettede elementer'],
  ['junkemail', 'Junk Email', 'Søppelpost'], ['outbox', 'Outbox', 'Utboks'], ['archive', 'Archive', 'Arkiv'],
];

/** How Graph answers a request badly, with a 200 all the same. */
export type Badly = 'cut short' | 'not JSON' | 'not what Graph documents';

/** An email's ordinary id, which changes when it moves to another folder. */
const ordinaryId = (email: Kept) => `AAMk${email.folder}-${email.id.slice(6)}`;

/** What the ID token says, which a test can change to see Homing refuse it. */
export interface IdTokenClaims {
  nonce?: string;
  audience: string;
  issuer: string;
  tid: string;
  oid: string;
}

/** A certificate and its private key in one PEM, made the way docs/deployment.md says, with openssl. */
export function makeCertificate(): string {
  const folder = mkdtempSync(join(tmpdir(), 'homing-certificate-'));
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '730', '-subj', '/CN=Homing test',
      '-keyout', join(folder, 'key.pem'), '-out', join(folder, 'certificate.pem'),
    ], { stdio: 'ignore' });
    return readFileSync(join(folder, 'key.pem'), 'utf8') + readFileSync(join(folder, 'certificate.pem'), 'utf8');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** An email's HTML as text, the way Microsoft gives it when asked: without tags, scripts or styles. */
function textOf(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

export class MicrosoftStandIn {
  readonly clientId: string = randomUUID();
  readonly pem = makeCertificate();
  readonly certificate = new X509Certificate(/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.exec(this.pem)![0]);
  /**
   * What it was asked: codes redeemed, refreshes, calls to Graph, and assertions it accepted, and of
   * Graph, searches, emails read, pages of a mailbox by when its emails arrived, and anything that
   * would change a mailbox, which it refuses.
   */
  readonly asked = { codes: 0, refreshes: 0, graph: 0, assertions: 0, searches: 0, reads: 0, listed: 0, changes: 0 };
  /** What Homing searched for last, as Graph got it. */
  lastSearch?: string;
  /** Every token it handed out, so tests can look for them where they mustn't be. */
  readonly issued: string[] = [];
  private readonly signing = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<string, { account: Account; redirectUri: string; challenge: string; idToken: IdTokenClaims; scope: string; expiresAt: number; used: boolean }>();
  private readonly refreshTokens = new Map<string, Account>();
  private readonly accessTokens = new Map<string, { account: Account; expiresAt: number }>();
  /**
   * Accounts whose refresh tokens Microsoft refuses, with how: consent revoked or the sign-in
   * expired (invalid_grant), or their organization deleted or disabled Homing's enterprise app.
   */
  private readonly refusals = new Map<string, { error: string; number: number }>();
  /** Each account's mailbox, by the account's object id. */
  private readonly mailboxes = new Map<string, Mailbox>();
  /** Accounts whose mailbox Graph can't serve for now, by the status it answers with, and how long it says to wait. */
  private readonly outages = new Map<string, { status: number; retryAfter?: number }>();
  /** Accounts whose mailbox answers slowly, by how many milliseconds. */
  private readonly slowness = new Map<string, number>();
  /** Accounts whose mailbox answers badly, how, and to which requests. */
  private readonly badly = new Map<string, { how: Badly; only: RegExp }>();
  /** How many milliseconds refreshing a sign-in takes. */
  private refreshDelay = 0;
  private server?: Server;
  url!: string;

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void this.handle(req.method ?? 'GET', new URL(req.url ?? '/', this.url), req).then(
        ({ status, body, headers, badly }) => {
          const text = JSON.stringify(badly === 'not what Graph documents' ? { value: {} } : body);
          if (badly === 'not JSON') return res.writeHead(status, { 'content-type': 'text/html' }).end('<html><body>Something went wrong</body></html>');
          if (badly !== 'cut short') return res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(text);
          // The whole length promised, half of it sent, and the connection dropped.
          res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) });
          res.write(text.slice(0, Math.floor(text.length / 2)));
          setTimeout(() => res.destroy(), 20);
        },
        () => res.writeHead(500).end(),
      );
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  close() {
    this.server?.closeAllConnections();
    return new Promise((resolve) => this.server?.close(resolve));
  }

  /** Homing's settings for this stand-in, with the certificate as a PEM. */
  settings(): MicrosoftSettings {
    return { clientId: this.clientId, tenant: 'common', credential: certificateCredential(this.pem), login: this.url, graph: this.url };
  }

  /**
   * The person signs in on Microsoft's page at this address with an account, and allows Homing:
   * where Microsoft sends their browser back to, with a code and the state.
   */
  signIn(address: string, account: Account, { expired = false, idToken = {} }: { expired?: boolean; idToken?: Partial<IdTokenClaims> } = {}): string {
    const asked = new URL(address).searchParams;
    if (asked.get('response_type') !== 'code' || asked.get('code_challenge_method') !== 'S256' || asked.get('client_id') !== this.clientId) {
      throw new Error(`Microsoft wouldn't sign in for ${address}`);
    }
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, {
      account,
      redirectUri: asked.get('redirect_uri')!,
      challenge: asked.get('code_challenge')!,
      idToken: { nonce: asked.get('nonce')!, audience: this.clientId, issuer: `${this.url}/${account.tenant}/v2.0`, tid: account.tenant, oid: account.oid, ...idToken },
      scope: asked.get('scope')!,
      expiresAt: Date.now() + (expired ? -1000 : 10 * 60_000),
      used: false,
    });
    const back = new URL(asked.get('redirect_uri')!);
    back.search = new URLSearchParams({ code, state: asked.get('state')! }).toString();
    return back.toString();
  }

  /** The person says no on Microsoft's page. */
  decline(address: string): string {
    const asked = new URL(address).searchParams;
    const back = new URL(asked.get('redirect_uri')!);
    back.search = new URLSearchParams({ error: 'access_denied', error_description: 'AADSTS65004: User declined to consent.', state: asked.get('state')! }).toString();
    return back.toString();
  }

  /** Microsoft refuses the account's refresh tokens from now on, by default because its consent was revoked. */
  refuse(account: Account, error = 'invalid_grant', number = 50173) {
    this.refusals.set(account.oid, { error, number });
  }

  /** Microsoft takes the account's refresh tokens again. */
  allow(account: Account) {
    this.refusals.delete(account.oid);
  }

  /** Someone sends the account an email, or it's in the account's mailbox already, such as one it sent. Returns its immutable id, as long as Graph's. */
  deliver(account: Account, email: Email): string {
    const id = `AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A${randomBytes(24).toString('base64url')}=`;
    const mailbox = this.mailboxOf(account);
    mailbox.emails.push({ ...email, id, folder: this.folderOf(mailbox, email.folder ?? 'inbox').id, conversation: email.conversation ?? `AAQk${randomBytes(12).toString('base64url')}=` });
    return id;
  }

  /** The account's owner moves an email to another folder, by its well-known name or its path, which changes its ordinary id but not its immutable one. */
  move(account: Account, id: string, folder: string) {
    const mailbox = this.mailboxOf(account);
    const email = mailbox.emails.find((kept) => kept.id === id);
    if (email) email.folder = this.folderOf(mailbox, folder).id;
  }

  /** The account's mailbox holds an item that isn't an email at this time, such as a contact or a meeting's answer, which a list of its emails goes past. */
  other(account: Account, at: Date, folder = 'inbox') {
    const mailbox = this.mailboxOf(account);
    mailbox.others.push({ at, folder: this.folderOf(mailbox, folder).id, id: `AAkOther${randomBytes(9).toString('base64url')}` });
  }

  /** A page of the mailbox's lists holds at most so many emails, with a link to the next when there are more, or as many as asked for again without a number. */
  shortPages(account: Account, most?: number) {
    this.mailboxOf(account).pageCap = most;
  }

  /** Graph can't serve the account's mailbox for now, as in an outage, or when it's asked too often, or serves it again with 0. */
  outage(account: Account, status = 503, retryAfter?: number) {
    if (status) this.outages.set(account.oid, { status, retryAfter });
    else this.outages.delete(account.oid);
  }

  /** What Homing asked of a mailbox by when its emails arrived, as Graph got each filter. */
  readonly listings: string[] = [];

  private mailboxOf(account: Account): Mailbox {
    let mailbox = this.mailboxes.get(account.oid);
    if (!mailbox) {
      const root: Folder = { id: `AAMkF${randomBytes(9).toString('base64url')}`, name: 'Top of Information Store', parent: `AAMkF${randomBytes(9).toString('base64url')}`, wellKnown: 'msgfolderroot' };
      const named = (english: string, norwegian: string) => (account.language === 'nb' ? norwegian : english);
      mailbox = {
        folders: [root, ...wellKnown.map(([known, english, norwegian]) => ({ id: `AAMkF${randomBytes(9).toString('base64url')}`, name: named(english, norwegian), parent: root.id, wellKnown: known }))],
        emails: [],
        others: [],
      };
      this.mailboxes.set(account.oid, mailbox);
    }
    return mailbox;
  }

  /** A folder by its well-known name or its id, or else by its path, such as Clients/Northwind or deleteditems/2024, made when it's new. */
  private folderOf(mailbox: Mailbox, named: string): Folder {
    const found = mailbox.folders.find((folder) => folder.wellKnown === named || folder.id === named);
    if (found) return found;
    const root = mailbox.folders.find((folder) => folder.wellKnown === 'msgfolderroot')!;
    let parent = root.id;
    let folder: Folder | undefined;
    for (const name of named.split('/')) {
      const within = parent;
      folder = mailbox.folders.find((one) => one.parent === within && (one.name === name || one.wellKnown === name));
      if (!folder) {
        folder = { id: `AAMkF${randomBytes(9).toString('base64url')}`, name, parent: within };
        mailbox.folders.push(folder);
      }
      parent = folder.id;
    }
    return folder!;
  }

  /** The account's mailbox answers its requests that match with a 200 that's no answer, or as it should again without how. */
  answerBadly(account: Account, how?: Badly, only = /./) {
    if (how) this.badly.set(account.oid, { how, only });
    else this.badly.delete(account.oid);
  }

  /** The account's mailbox answers after this many milliseconds, or at once again with 0. */
  slow(account: Account, milliseconds: number) {
    this.slowness.set(account.oid, milliseconds);
  }

  /** Refreshing a sign-in takes this many milliseconds from now on, or no time again with 0. */
  slowRefresh(milliseconds: number) {
    this.refreshDelay = milliseconds;
  }

  /** Expires an account's access tokens, so the next use needs a refresh. */
  expireAccess() {
    for (const token of this.accessTokens.values()) token.expiresAt = Date.now() - 1000;
  }

  private async handle(method: string, url: URL, req: import('node:http').IncomingMessage): Promise<{ status: number; body: unknown; headers?: Record<string, string>; badly?: Badly }> {
    if (method === 'POST' && /^\/[\w.-]+\/oauth2\/v2\.0\/token$/.test(url.pathname)) {
      let text = '';
      for await (const chunk of req) text += chunk;
      return this.token(url, new URLSearchParams(text));
    }
    // Homing only reads: anything else would change the mailbox.
    if (method !== 'GET' && url.pathname.startsWith('/v1.0/')) {
      this.asked.changes++;
      return { status: 403, body: { error: { code: 'ErrorAccessDenied' } } };
    }
    if (method === 'GET' && url.pathname.startsWith('/v1.0/')) {
      this.asked.graph++;
      const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
      const held = bearer ? this.accessTokens.get(bearer) : undefined;
      if (!held || held.expiresAt < Date.now()) return { status: 401, body: { error: { code: 'InvalidAuthenticationToken' } } };
      if (url.pathname === '/v1.0/me') {
        return { status: 200, body: { id: held.account.oid, displayName: held.account.name, mail: held.account.address, userPrincipalName: held.account.address } };
      }
      const outage = this.outages.get(held.account.oid);
      if (outage) {
        return {
          status: outage.status,
          body: { error: { code: outage.status === 429 ? 'TooManyRequests' : 'ServiceUnavailable' } },
          ...(outage.retryAfter !== undefined && { headers: { 'retry-after': String(outage.retryAfter) } }),
        };
      }
      const folders = url.pathname.startsWith('/v1.0/me/mailFolders/');
      if (folders || url.pathname.startsWith('/v1.0/me/messages')) {
        if (folders && held.account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
        const delay = this.slowness.get(held.account.oid) ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const answer = folders ? this.folder(held.account, url) : this.mail(held.account, url, String(req.headers.prefer ?? ''));
        const bad = this.badly.get(held.account.oid);
        return answer.status === 200 && bad?.only.test(decodeURIComponent(url.pathname + url.search)) ? { ...answer, badly: bad.how } : answer;
      }
    }
    return { status: 404, body: {} };
  }

  /** A folder, by its id or its well-known name: its name and the folder it's in. */
  private folder(account: Account, url: URL): { status: number; body: unknown } {
    const mailbox = this.mailboxOf(account);
    const path = /^\/v1\.0\/me\/mailFolders\/([^/]+)$/.exec(url.pathname);
    const named = path && decodeURIComponent(path[1]);
    const folder = named && mailbox.folders.find((one) => one.id === named || one.wellKnown === named || `AAkF${one.id}` === named);
    if (!folder) return { status: 404, body: { error: { code: 'ErrorItemNotFound' } } };
    // A folder without a name has none in Graph's answer.
    const all: Record<string, unknown> = { id: named.startsWith('AAkF') ? named : folder.id, displayName: folder.name || null, parentFolderId: folder.parent };
    const select = (url.searchParams.get('$select') ?? '').split(',').filter(Boolean);
    return { status: 200, body: Object.fromEntries(Object.entries(all).filter(([name]) => select.length === 0 || name === 'id' || select.includes(name))) };
  }

  /** Graph's messages, as far as Homing uses them: search, one email, its thread, its attachments' names, and the mailbox by when its emails arrived. */
  private mail(account: Account, url: URL, prefer: string): { status: number; body: unknown } {
    if (account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
    const mailbox = this.mailboxOf(account);
    const immutable = /IdType="ImmutableId"/.test(prefer);
    const idOf = (email: Kept) => (immutable ? email.id : ordinaryId(email));
    const select = (url.searchParams.get('$select') ?? '').split(',').filter(Boolean);
    const content = (html: string) => (/outlook\.body-content-type="text"/.test(prefer) ? { contentType: 'text', content: textOf(html) } : { contentType: 'html', content: html });
    const drafts = mailbox.folders.find((folder) => folder.wellKnown === 'drafts')!;
    const fields = (email: Kept): Record<string, unknown> => {
      const all: Record<string, unknown> = {
        id: idOf(email),
        conversationId: email.conversation,
        subject: email.subject,
        from: { emailAddress: email.from },
        toRecipients: (email.to ?? []).map((emailAddress) => ({ emailAddress })),
        ccRecipients: (email.cc ?? []).map((emailAddress) => ({ emailAddress })),
        bccRecipients: (email.bcc ?? []).map((emailAddress) => ({ emailAddress })),
        receivedDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
        sentDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
        bodyPreview: textOf(email.html).replace(/\s+/g, ' ').slice(0, 255),
        hasAttachments: (email.attachments ?? []).some((attachment) => !attachment.inline),
        parentFolderId: account.otherFolderIds ? `AAkF${email.folder}` : email.folder,
        isDraft: email.draft === true || email.folder === drafts.id,
        // Microsoft gives the text when asked to, and the HTML otherwise.
        body: content(email.html),
        ...(email.unique !== null && { uniqueBody: content(email.unique ?? email.html) }),
      };
      return Object.fromEntries(Object.entries(all).filter(([name]) => select.length === 0 || name === 'id' || select.includes(name)));
    };
    const found = (id: string) => mailbox.emails.find((email) => email.id === id || ordinaryId(email) === id);
    const notFound = { status: 404, body: { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } } };
    const bad = { status: 400, body: { error: { code: 'BadRequest' } } };

    const attachments = /^\/v1\.0\/me\/messages\/([^/]+)\/attachments$/.exec(url.pathname);
    if (attachments) {
      const email = found(decodeURIComponent(attachments[1]));
      if (!email) return notFound;
      // Homing asks for names only, never the files themselves.
      if (!select.includes('name') || select.includes('contentBytes')) return bad;
      return { status: 200, body: { value: (email.attachments ?? []).map((attachment) => ({ name: attachment.name, isInline: attachment.inline ?? false })) } };
    }
    const one = /^\/v1\.0\/me\/messages\/([^/]+)$/.exec(url.pathname);
    if (one) {
      this.asked.reads++;
      const email = found(decodeURIComponent(one[1]));
      return email ? { status: 200, body: fields(email) } : notFound;
    }
    if (url.pathname !== '/v1.0/me/messages') return { status: 404, body: {} };

    const search = url.searchParams.get('$search');
    const filter = url.searchParams.get('$filter');
    const order = url.searchParams.get('$orderby');
    const top = Number(url.searchParams.get('$top') ?? 10);
    // As Graph: a page holds 1 to 1,000.
    if (!Number.isInteger(top) || top < 1 || top > 1000) return bad;
    if (search !== null) {
      // As Graph: a search is one quoted string, and can't be combined with a filter or an order.
      if (filter !== null || order !== null || !/^".*"$/s.test(search)) return bad;
      this.asked.searches++;
      const words = search.slice(1, -1).replace(/\\(.)/g, '$1');
      this.lastSearch = words;
      const terms = words.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = mailbox.emails
        .filter((email) => {
          const text = `${email.from.name} ${email.from.address} ${email.subject} ${textOf(email.html)}`.toLowerCase();
          return terms.every((term) => text.includes(term));
        })
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      return { status: 200, body: { value: matches.slice(0, top).map(fields), ...(matches.length > top && { '@odata.nextLink': `${this.url}/next` }) } };
    }
    const conversation = filter && /^conversationId eq '(.*)'$/.exec(filter)?.[1]?.replace(/''/g, "'");
    if (conversation) {
      if (order !== null) return bad;
      const thread = mailbox.emails.filter((email) => email.conversation === conversation);
      return { status: 200, body: { value: thread.slice(0, top).map(fields), ...(thread.length > top && { '@odata.nextLink': `${this.url}/next` }) } };
    }
    // Every email by when it arrived, as Graph filters it, oldest first when asked.
    const dated = filter && /^receivedDateTime ge (\S+?)(?: and receivedDateTime lt (\S+))?$/.exec(filter);
    // As Graph: what a list is ordered by must come first in its filter.
    if (order !== null && (!dated || !['receivedDateTime asc', 'receivedDateTime desc'].includes(order))) {
      return { status: 400, body: { error: { code: 'InefficientFilter', message: 'The restriction or sort order is too complex for this operation.' } } };
    }
    if (!dated) return bad;
    const [from, until] = [Date.parse(dated[1]), dated[2] ? Date.parse(dated[2]) : Infinity];
    if (Number.isNaN(from) || Number.isNaN(until)) return bad;
    this.asked.listed++;
    this.listings.push(filter);
    // To the second, as Graph keeps when an email arrived, and the items that aren't emails among them, which $skip counts too.
    const second = (at: Date) => Math.floor(at.getTime() / 1000);
    const within = (at: Date) => second(at) * 1000 >= from && second(at) * 1000 < until;
    const items = [
      ...mailbox.emails.filter((email) => within(email.at)).map((email) => ({ at: email.at, id: email.id, email })),
      ...mailbox.others.filter((other) => within(other.at)).map((other) => ({ at: other.at, id: other.id, email: undefined })),
    ];
    if (order) items.sort((a, b) => (order.endsWith('desc') ? -1 : 1) * (second(a.at) - second(b.at)) || a.id.localeCompare(b.id));
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const size = Math.min(top, mailbox.pageCap ?? top);
    const page: Kept[] = [];
    let at = skip;
    for (; at < items.length && page.length < size; at++) if (items[at].email) page.push(items[at].email!);
    const next = new URL(url);
    next.searchParams.set('$skip', String(at));
    return { status: 200, body: { value: page.map(fields), ...(at < items.length && { '@odata.nextLink': next.toString() }) } };
  }

  private async token(url: URL, form: URLSearchParams): Promise<{ status: number; body: unknown }> {
    const refuse = (error: string, number: number) => ({ status: 400, body: { error, error_description: `AADSTS${number}: refused.`, error_codes: [number] } });
    // The app proves who it is with a fresh assertion signed by its certificate, for this endpoint.
    try {
      if (form.get('client_id') !== this.clientId) throw new Error('another app');
      if (form.get('client_assertion_type') !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') throw new Error('no assertion');
      const assertion = form.get('client_assertion') ?? '';
      const header = decodeProtectedHeader(assertion);
      if (header['x5t#S256'] !== createHash('sha256').update(this.certificate.raw).digest('base64url')) throw new Error('another certificate');
      await jwtVerify(assertion, this.certificate.publicKey, { algorithms: ['PS256'], issuer: this.clientId, subject: this.clientId, audience: `${this.url}${url.pathname}`, maxTokenAge: '10m' });
      this.asked.assertions++;
    } catch {
      return { status: 401, body: { error: 'invalid_client', error_codes: [700027] } };
    }

    if (form.get('grant_type') === 'authorization_code') {
      this.asked.codes++;
      const code = this.codes.get(form.get('code') ?? '');
      if (!code || code.used) return refuse('invalid_grant', 54005);
      if (code.expiresAt < Date.now()) return refuse('invalid_grant', 70008);
      if (code.redirectUri !== form.get('redirect_uri')) return refuse('invalid_grant', 50011);
      const verifier = form.get('code_verifier') ?? '';
      if (createHash('sha256').update(verifier).digest('base64url') !== code.challenge) return refuse('invalid_grant', 501481);
      code.used = true;
      return { status: 200, body: await this.tokensFor(code.account, code.scope, code.idToken) };
    }
    if (form.get('grant_type') === 'refresh_token') {
      this.asked.refreshes++;
      if (this.refreshDelay) await new Promise((resolve) => setTimeout(resolve, this.refreshDelay));
      const account = this.refreshTokens.get(form.get('refresh_token') ?? '');
      if (!account) return refuse('invalid_grant', 9002313);
      const refusal = this.refusals.get(account.oid);
      if (refusal) return { ...refuse(refusal.error, refusal.number), status: refusal.error === 'invalid_client' ? 401 : 400 };
      return { status: 200, body: await this.tokensFor(account, form.get('scope') ?? '') };
    }
    return refuse('unsupported_grant_type', 70003);
  }

  private async tokensFor(account: Account, scope: string, claims?: IdTokenClaims) {
    const access = `access-${randomBytes(24).toString('base64url')}`;
    const refresh = `refresh-${randomBytes(24).toString('base64url')}`;
    this.accessTokens.set(access, { account, expiresAt: Date.now() + 3600_000 });
    this.refreshTokens.set(refresh, account);
    this.issued.push(access, refresh);
    const { nonce, audience, issuer, tid, oid } = claims ?? { audience: this.clientId, issuer: `${this.url}/${account.tenant}/v2.0`, tid: account.tenant, oid: account.oid };
    const idToken = await new SignJWT({ tid, oid, preferred_username: account.address, name: account.name, ...(nonce && { nonce }) })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.signing.privateKey);
    // Microsoft names Graph's permissions without Graph's address, and leaves offline_access out.
    const granted = scope.split(' ').filter((name) => name !== 'offline_access').join(' ');
    return { token_type: 'Bearer', scope: granted, expires_in: 3599, access_token: access, refresh_token: refresh, id_token: idToken };
  }
}
