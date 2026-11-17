// A stand-in for Microsoft's sign-in and Microsoft Graph, which are outside
// Homing. It keeps Microsoft's side of the rules Homing relies on: a code works
// once, for a few minutes, only with the PKCE verifier it was issued for and
// only for the app and address it was issued to, and the app proves who it is
// with an assertion signed by its certificate. It counts what it's asked.
// Graph also keeps a mailbox for each account, with folders, which it
// searches and reads as Outlook does, with ids that change when an email
// moves, and immutable ones that don't, for whoever asks for those. It lists
// a mailbox's emails by the date they arrived, and follows each folder's
// changes with delta links, as Graph documents them: a page may hold fewer
// than asked for and still have a next link; delta gives changes in no
// promised order, an email that changed with no more than its id and what
// changed, or with what was asked for as well, and one that was only marked
// read even when it doesn't fit the filter; a delta with a filter returns
// only up to 5,000 emails; a link it forgot answers 410; a page of history
// may come empty with a link to the next; a mailbox may hold hundreds of
// folders, listed a page at a time; and when it's asked too often it says
// how long to wait.

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
  /** Its headers beside those Graph gives as fields, such as List-Unsubscribe, by name. */
  headers?: Record<string, string>;
  /** The folder it's in: a well-known one, such as sentitems or junkemail, or one of the owner's own by name. By default the inbox. */
  folder?: string;
  /** A draft, not sent. */
  draft?: boolean;
}

/**
 * An email in a mailbox: its immutable id, the folder it's in, which its ordinary id depends on,
 * and when it last changed there, as the mailbox counts changes, which delta goes by.
 */
interface Kept extends Email {
  id: string;
  folder: string;
  conversation: string;
  changed: number;
  /** When it came into the folder it's in, as the mailbox counts changes: since then, delta gives only what changed of it. */
  arrived: number;
  /** Whether it was last changed only in how it's flagged, such as marked read. */
  flagged?: boolean;
}

/** A folder in a mailbox: its name, the folder it's in, and the well-known name of one Outlook makes. */
interface Folder {
  id: string;
  name: string;
  parent: string | null;
  wellKnown?: string;
}

/** A mailbox's folders, its emails, the changes it counted, what left each folder when, and how often it forgot its delta links. */
interface Mailbox {
  folders: Folder[];
  emails: Kept[];
  changes: number;
  left: { folder: string; id: string; at: number }[];
  forgot: number;
  /** How it refuses a delta link it forgot. */
  forgotAs: string;
  /** The most emails a page of a list holds, whatever was asked for. */
  pageCap?: number;
  /** Emails Graph fails on whenever their text is asked for. */
  poisoned: Set<string>;
  /** Whether a page of history comes empty with a link to the next: the first one asked for, or every one. */
  empty?: 'first' | 'always';
}

/** The folders Outlook makes in every mailbox, by their well-known names. */
const wellKnown: [string, string][] = [
  ['inbox', 'Inbox'], ['sentitems', 'Sent Items'], ['drafts', 'Drafts'], ['deleteditems', 'Deleted Items'],
  ['junkemail', 'Junk Email'], ['outbox', 'Outbox'], ['archive', 'Archive'],
];

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

/** An email's ordinary id, which changes when it moves to another folder. */
const ordinaryId = (email: Kept) => `AAMk${email.folder}-${email.id.slice(6)}`;

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
  /** What it was asked: codes redeemed, refreshes, calls to Graph, and assertions it accepted, and of Graph, searches, emails read, pages of history by date and of delta. */
  readonly asked = { codes: 0, refreshes: 0, graph: 0, assertions: 0, searches: 0, reads: 0, history: 0, deltas: 0 };
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
  /** How many milliseconds refreshing a sign-in takes. */
  private refreshDelay = 0;
  private server?: Server;
  url!: string;

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void this.handle(req.method ?? 'GET', new URL(req.url ?? '/', this.url), req).then(
        ({ status, body, headers }) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body)),
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

  /** Someone sends the account an email, or it's in the account's mailbox already, such as one it sent. Returns its immutable id. */
  deliver(account: Account, email: Email): string {
    const id = `AAkALg${randomBytes(24).toString('base64url')}=`;
    const mailbox = this.mailboxOf(account);
    const folder = this.folderOf(mailbox, email.folder ?? 'inbox').id;
    const at = ++mailbox.changes;
    mailbox.emails.push({ ...email, id, folder, conversation: email.conversation ?? `AAQk${randomBytes(12).toString('base64url')}=`, changed: at, arrived: at });
    return id;
  }

  /** The account's owner moves an email to another folder, which changes its ordinary id but not its immutable one. */
  move(account: Account, id: string, folder: string) {
    const mailbox = this.mailboxOf(account);
    const email = mailbox.emails.find((kept) => kept.id === id);
    if (!email) return;
    mailbox.left.push({ folder: email.folder, id, at: ++mailbox.changes });
    email.folder = this.folderOf(mailbox, folder).id;
    email.changed = email.arrived = mailbox.changes;
    email.flagged = false;
  }

  /** The email changes in the mailbox, such as its text, or only how it's flagged, when nothing is given. */
  change(account: Account, id: string, to: Partial<Email> = {}) {
    const mailbox = this.mailboxOf(account);
    const email = mailbox.emails.find((kept) => kept.id === id);
    if (!email) return;
    Object.assign(email, to);
    email.changed = ++mailbox.changes;
    email.flagged = Object.keys(to).length === 0;
  }

  /** The account's owner deletes an email for good. */
  remove(account: Account, id: string) {
    const mailbox = this.mailboxOf(account);
    const email = mailbox.emails.find((kept) => kept.id === id);
    if (!email) return;
    mailbox.emails.splice(mailbox.emails.indexOf(email), 1);
    mailbox.left.push({ folder: email.folder, id, at: ++mailbox.changes });
  }

  /** Microsoft forgets where the mailbox's delta links stood, as it does after a while, so they're refused from then on, with 410 and this code. */
  forgetDeltas(account: Account, code = 'SyncStateNotFound') {
    const mailbox = this.mailboxOf(account);
    mailbox.forgot++;
    mailbox.forgotAs = code;
  }

  /** A page of the mailbox's lists holds at most so many emails, with a link to the next when there are more, or as many as asked for again without a number. */
  shortPages(account: Account, most?: number) {
    this.mailboxOf(account).pageCap = most;
  }

  /**
   * A page of the mailbox's history comes empty, with a link to the next: only the page asked for
   * first, however often it's asked for, so that only its link leads on, or every page, links'
   * too. Or as it was again, without a mode.
   */
  emptyPages(account: Account, mode?: 'first' | 'always') {
    this.mailboxOf(account).empty = mode;
  }

  /** The account's owner makes a folder, by its path, such as Clients/Northwind. */
  folder(account: Account, path: string) {
    this.folderOf(this.mailboxOf(account), path);
  }

  /** Graph fails whenever it's asked for this email's text, in a list or by its id, as it does for one it can't convert. */
  poison(account: Account, id: string, poisoned = true) {
    const { poisoned: set } = this.mailboxOf(account);
    if (poisoned) set.add(id);
    else set.delete(id);
  }

  /** Whether lists and delta give an email's headers when asked, which Graph documents only for one email by its id. On by default. */
  headersInLists = true;

  /**
   * Whether delta gives an email that only changed with what was asked for too, as in Graph's own
   * example of one marked read, or with no more than its id and what changed, which is all Graph
   * promises. Off by default.
   */
  updatesWithFields = false;

  /** The most emails a delta with a filter returns in all, from its first request through every link after it, as Graph documents. */
  filteredDeltaMost = 5_000;

  /** What Homing asked of a mailbox's history by date, as Graph got each filter. */
  readonly history: string[] = [];

  /** The emails Homing read one at a time, by their ids, in order. */
  readonly read: string[] = [];

  /** The folders Homing asked for their changes, in order, by name. */
  readonly deltasOf: string[] = [];

  private mailboxOf(account: Account): Mailbox {
    let mailbox = this.mailboxes.get(account.oid);
    if (!mailbox) {
      mailbox = { folders: wellKnown.map(([known, name]) => ({ id: `AAMkF${randomBytes(9).toString('base64url')}`, name, parent: null, wellKnown: known })), emails: [], changes: 0, left: [], forgot: 0, forgotAs: 'SyncStateNotFound', poisoned: new Set() };
      this.mailboxes.set(account.oid, mailbox);
    }
    return mailbox;
  }

  /** A folder by its well-known name or its id, or else by its path, such as Clients/Northwind or deleteditems/2024, made when it's new. */
  private folderOf(mailbox: Mailbox, named: string): Folder {
    const found = mailbox.folders.find((folder) => folder.wellKnown === named || folder.id === named);
    if (found) return found;
    let parent: string | null = null;
    let folder: Folder | undefined;
    for (const name of named.split('/')) {
      const within: string | null = parent;
      folder = mailbox.folders.find((one) => one.parent === within && (one.name === name || (within === null && one.wellKnown === name)));
      if (!folder) {
        folder = { id: `AAMkF${randomBytes(9).toString('base64url')}`, name, parent: within };
        mailbox.folders.push(folder);
      }
      parent = folder.id;
    }
    return folder!;
  }

  /** Graph can't serve the account's mailbox for now, as in an outage, or when it's asked too often, or serves it again with 0. */
  outage(account: Account, status = 503, retryAfter?: number) {
    if (status) this.outages.set(account.oid, { status, retryAfter });
    else this.outages.delete(account.oid);
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

  private async handle(method: string, url: URL, req: import('node:http').IncomingMessage): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
    if (method === 'POST' && /^\/[\w.-]+\/oauth2\/v2\.0\/token$/.test(url.pathname)) {
      let text = '';
      for await (const chunk of req) text += chunk;
      return this.token(url, new URLSearchParams(text));
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
      if (outage && url.pathname !== '/v1.0/me') {
        return {
          status: outage.status,
          body: { error: { code: outage.status === 429 ? 'TooManyRequests' : 'ServiceUnavailable' } },
          ...(outage.retryAfter !== undefined && { headers: { 'retry-after': String(outage.retryAfter) } }),
        };
      }
      if (url.pathname.startsWith('/v1.0/me/mailFolders')) {
        if (held.account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
        return this.folders(held.account, url, String(req.headers.prefer ?? ''));
      }
      if (url.pathname.startsWith('/v1.0/me/messages')) {
        const delay = this.slowness.get(held.account.oid) ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return this.mail(held.account, url, String(req.headers.prefer ?? ''));
      }
    }
    return { status: 404, body: {} };
  }

  /** An email as Graph gives it, with the fields asked for, and its id as asked for. */
  private fieldsOf(mailbox: Mailbox, email: Kept, select: string[], prefer: string, listed = false): Record<string, unknown> {
    const immutable = /IdType="ImmutableId"/.test(prefer);
    const content = (html: string) => (/outlook\.body-content-type="text"/.test(prefer) ? { contentType: 'text', content: textOf(html) } : { contentType: 'html', content: html });
    const folder = mailbox.folders.find((one) => one.id === email.folder);
    // What the owner sent, or hasn't sent yet, has no headers of the internet's.
    const top = (one: Folder | undefined): Folder | undefined => (one?.parent ? top(mailbox.folders.find((parent) => parent.id === one.parent)) : one);
    const received = !['sentitems', 'drafts', 'outbox'].includes(top(folder)?.wellKnown ?? '') && email.draft !== true;
    const all: Record<string, unknown> = {
      id: immutable ? email.id : ordinaryId(email),
      conversationId: email.conversation,
      subject: email.subject,
      from: { emailAddress: email.from },
      toRecipients: (email.to ?? []).map((emailAddress) => ({ emailAddress })),
      ccRecipients: (email.cc ?? []).map((emailAddress) => ({ emailAddress })),
      receivedDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
      sentDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
      bodyPreview: textOf(email.html).replace(/\s+/g, ' ').slice(0, 255),
      hasAttachments: (email.attachments ?? []).some((attachment) => !attachment.inline),
      parentFolderId: email.folder,
      isDraft: email.draft === true || folder?.wellKnown === 'drafts',
      ...(received && (!listed || this.headersInLists) && {
        internetMessageHeaders: [{ name: 'Message-ID', value: `<${email.id.slice(6, 20)}@mail.test>` }, ...Object.entries(email.headers ?? {}).map(([name, value]) => ({ name, value }))],
      }),
      // Microsoft gives the text when asked to, and the HTML otherwise.
      body: content(email.html),
      ...(email.unique !== null && { uniqueBody: content(email.unique ?? email.html) }),
    };
    // Headers come only when asked for, as Graph has it.
    return Object.fromEntries(Object.entries(all).filter(([name]) => (select.length === 0 ? name !== 'internetMessageHeaders' : select.includes(name))));
  }

  /** Graph's messages, as far as Homing uses them: search, one email, its thread, its attachments' names, and the mailbox by date. */
  private mail(account: Account, url: URL, prefer: string): { status: number; body: unknown } {
    if (account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
    const mailbox = this.mailboxOf(account);
    const select = (url.searchParams.get('$select') ?? '').split(',').filter(Boolean);
    const fields = (email: Kept) => this.fieldsOf(mailbox, email, select, prefer, true);
    const found = (id: string) => mailbox.emails.find((email) => email.id === id || ordinaryId(email) === id);
    // An email Graph can't give the text of fails whatever asks for it.
    const texts = select.length === 0 || select.some((name) => ['body', 'uniqueBody'].includes(name));
    const failing = (emails: Kept[]) => texts && emails.some((email) => mailbox.poisoned.has(email.id));
    const broken = { status: 500, body: { error: { code: 'ErrorInternalServerError' } } };
    const notFound = { status: 404, body: { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } } };

    const attachments = /^\/v1\.0\/me\/messages\/([^/]+)\/attachments$/.exec(url.pathname);
    if (attachments) {
      const email = found(decodeURIComponent(attachments[1]));
      if (!email) return notFound;
      // Homing asks for names only, never the files themselves.
      if (!select.includes('name') || select.includes('contentBytes')) return { status: 400, body: { error: { code: 'BadRequest' } } };
      return { status: 200, body: { value: (email.attachments ?? []).map((attachment) => ({ name: attachment.name, isInline: attachment.inline ?? false })) } };
    }
    const one = /^\/v1\.0\/me\/messages\/([^/]+)$/.exec(url.pathname);
    if (one) {
      this.asked.reads++;
      const email = found(decodeURIComponent(one[1]));
      if (email) this.read.push(email.id);
      if (email && failing([email])) return broken;
      return email ? { status: 200, body: this.fieldsOf(mailbox, email, select, prefer) } : notFound;
    }
    if (url.pathname !== '/v1.0/me/messages') return { status: 404, body: {} };

    const search = url.searchParams.get('$search');
    const filter = url.searchParams.get('$filter');
    const top = Number(url.searchParams.get('$top') ?? 10);
    if (search !== null) {
      // As Graph: a search is one quoted string, and can't be combined with a filter or an order.
      if (filter !== null || url.searchParams.has('$orderby') || !/^".*"$/s.test(search)) return { status: 400, body: { error: { code: 'BadRequest' } } };
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
      const thread = mailbox.emails.filter((email) => email.conversation === conversation);
      return { status: 200, body: { value: thread.slice(0, top).map(fields), ...(thread.length > top && { '@odata.nextLink': `${this.url}/next` }) } };
    }
    // The whole mailbox by the date each email arrived, as Graph filters it, oldest first when asked.
    const dated = filter && /^receivedDateTime ge (\S+?)(?: and receivedDateTime lt (\S+))?$/.exec(filter);
    if (dated) {
      const [from, until] = [Date.parse(dated[1]), dated[2] ? Date.parse(dated[2]) : Infinity];
      if (Number.isNaN(from) || Number.isNaN(until)) return { status: 400, body: { error: { code: 'BadRequest' } } };
      // To the second, as Graph keeps the time an email arrived.
      const second = (email: Kept) => Math.floor(email.at.getTime() / 1000);
      const within = mailbox.emails.filter((email) => second(email) * 1000 >= from && second(email) * 1000 < until);
      if (url.searchParams.get('$count') === 'true') return { status: 200, body: { '@odata.count': within.length, value: within.slice(0, top).map(fields) } };
      const order = url.searchParams.get('$orderby');
      if (order !== null && order !== 'receivedDateTime asc') return { status: 400, body: { error: { code: 'BadRequest' } } };
      this.asked.history++;
      this.history.push(filter);
      const sorted = order ? [...within].sort((a, b) => second(a) - second(b) || a.id.localeCompare(b.id)) : within;
      const skip = Number(url.searchParams.get('$skip') ?? 0);
      const linked = (change: (params: URLSearchParams) => void) => {
        const next = new URL(url);
        change(next.searchParams);
        return next.toString();
      };
      // As Graph: a page may hold nothing and still not be the last. Asked for again, it's as empty: only its link leads on.
      if (mailbox.empty === 'always' || (mailbox.empty === 'first' && !url.searchParams.has('$skiptoken'))) {
        return { status: 200, body: { value: [], '@odata.nextLink': linked((params) => params.set('$skiptoken', String(Number(params.get('$skiptoken') ?? 0) + 1))) } };
      }
      // As Graph: a page may hold fewer than asked for, and the next link says whether there's more.
      const size = Math.min(top, mailbox.pageCap ?? top);
      const page = sorted.slice(skip, skip + size);
      if (failing(page)) return broken;
      return { status: 200, body: { value: page.map(fields), ...(sorted.length > skip + size && { '@odata.nextLink': linked((params) => params.set('$skip', String(skip + size))) }) } };
    }
    return { status: 400, body: { error: { code: 'BadRequest' } } };
  }

  /** Graph's mail folders: the top ones, those in a folder, one by its id or well-known name, and the changes in one, by delta. */
  private folders(account: Account, url: URL, prefer: string): { status: number; body: unknown } {
    const mailbox = this.mailboxOf(account);
    // A page at a time, as many as asked for, with a link to the next.
    const listed = (folders: Folder[]) => {
      const [top, skip] = [Number(url.searchParams.get('$top') ?? 10), Number(url.searchParams.get('$skip') ?? 0)];
      const next = new URL(url);
      next.searchParams.set('$skip', String(skip + top));
      return {
        status: 200,
        body: {
          value: folders.slice(skip, skip + top).map((folder) => ({ id: folder.id, displayName: folder.name, childFolderCount: mailbox.folders.filter((child) => child.parent === folder.id).length })),
          ...(folders.length > skip + top && { '@odata.nextLink': next.toString() }),
        },
      };
    };
    if (url.pathname === '/v1.0/me/mailFolders') return listed(mailbox.folders.filter((folder) => folder.parent === null));
    const path = /^\/v1\.0\/me\/mailFolders\/([^/]+)(\/childFolders|\/messages\/delta)?$/.exec(url.pathname);
    const folder = path && mailbox.folders.find((one) => one.id === decodeURIComponent(path[1]) || one.wellKnown === decodeURIComponent(path[1]));
    if (!folder) return { status: 404, body: { error: { code: 'ErrorItemNotFound' } } };
    if (!path[2]) return { status: 200, body: { id: folder.id, displayName: folder.name } };
    if (path[2] === '/childFolders') return listed(mailbox.folders.filter((child) => child.parent === folder.id));
    return this.delta(mailbox, folder, url, prefer);
  }

  /**
   * A folder's changes, as Graph's delta gives them: first what's in it, from a time on if asked,
   * then, from each delta link, what arrived in it or changed since, and what left it, newest
   * change first, since Graph promises no order. An email that came into the folder comes with what
   * was asked for; one that only changed there comes with its id and what changed, or with what
   * was asked for too, and one only marked read comes even when it arrived before the filter's
   * time. With a filter, it returns only so many emails in all, and none after that. A page at a
   * time, with a next link, and a delta link at the end. A link keeps what was asked for, and one
   * Graph forgot is refused with 410.
   */
  private delta(mailbox: Mailbox, folder: Folder, url: URL, prefer: string): { status: number; body: unknown } {
    this.asked.deltas++;
    this.deltasOf.push(folder.name);
    type Token = { since: number; from: number | null; select: string[]; offset: number; upTo: number; forgot: number; given: number };
    const token = url.searchParams.get('$skiptoken') ?? url.searchParams.get('$deltatoken');
    let state: Token;
    if (token) {
      try {
        state = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Token;
      } catch {
        return { status: 400, body: { error: { code: 'BadRequest' } } };
      }
      if (state.forgot !== mailbox.forgot) return { status: 410, body: { error: { code: mailbox.forgotAs } } };
      // Following a delta link starts a new round, up to what changed by now.
      if (url.searchParams.has('$deltatoken')) state = { ...state, offset: 0, upTo: mailbox.changes };
    } else {
      const filter = url.searchParams.get('$filter');
      const from = filter && /^receivedDateTime ge (\S+)$/.exec(filter)?.[1];
      if (filter && !from) return { status: 400, body: { error: { code: 'BadRequest' } } };
      state = { since: -1, from: from ? Date.parse(from) : null, select: (url.searchParams.get('$select') ?? '').split(',').filter(Boolean), offset: 0, upTo: mailbox.changes, forgot: mailbox.forgot, given: 0 };
    }
    const size = Number(/odata\.maxpagesize=(\d+)/.exec(prefer)?.[1] ?? 10);
    const fits = (email: Kept) => state.from === null || email.at.getTime() >= state.from;
    // Only marked read since the last round, it comes whether or not it fits the filter.
    const onlyFlagged = (email: Kept) => state.since >= 0 && email.arrived <= state.since && email.flagged === true;
    const here = mailbox.emails
      .filter((email) => email.folder === folder.id && email.changed > state.since && email.changed <= state.upTo && (fits(email) || onlyFlagged(email)))
      .sort((a, b) => b.changed - a.changed)
      // With a filter, only so many in all: what's past that never comes.
      .slice(0, state.from === null ? undefined : Math.max(0, this.filteredDeltaMost - state.given));
    const gone = state.since < 0 ? [] : mailbox.left.filter((left) => left.folder === folder.id && left.at > state.since && left.at <= state.upTo && !here.some((email) => email.id === left.id));
    const immutable = /IdType="ImmutableId"/.test(prefer);
    const entry = (email: Kept): Record<string, unknown> => {
      // New in the folder since the last round, it comes with what was asked for. Changed there, with its id and what changed.
      if (state.since < 0 || email.arrived > state.since) return this.fieldsOf(mailbox, email, state.select, prefer, true);
      return { ...(this.updatesWithFields && this.fieldsOf(mailbox, email, state.select, prefer, true)), '@odata.type': '#microsoft.graph.message', id: immutable ? email.id : ordinaryId(email), ...(email.flagged ? { isRead: true } : { subject: email.subject }) };
    };
    const page = [...here, ...gone].slice(state.offset, state.offset + size);
    if ((state.select.length === 0 || state.select.some((name) => ['body', 'uniqueBody'].includes(name))) && page.some((one) => 'conversation' in one && mailbox.poisoned.has(one.id))) {
      return { status: 500, body: { error: { code: 'ErrorInternalServerError' } } };
    }
    const link = (kind: '$skiptoken' | '$deltatoken', next: Token) =>
      `${this.url}/v1.0/me/mailFolders/${encodeURIComponent(folder.id)}/messages/delta?${kind}=${Buffer.from(JSON.stringify(next)).toString('base64url')}`;
    const more = state.offset + size < here.length + gone.length;
    return {
      status: 200,
      body: {
        value: page.map((one) => ('conversation' in one ? entry(one) : { id: one.id, '@removed': { reason: 'deleted' } })),
        ...(more
          ? { '@odata.nextLink': link('$skiptoken', { ...state, offset: state.offset + size }) }
          : { '@odata.deltaLink': link('$deltatoken', { ...state, since: state.upTo, offset: 0, given: state.given + here.length }) }),
      },
    };
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
