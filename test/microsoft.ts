// A stand-in for Microsoft's sign-in and Microsoft Graph, which are outside
// Homing. It keeps Microsoft's side of the rules Homing relies on: a code works
// once, for a few minutes, only with the PKCE verifier it was issued for and
// only for the app and address it was issued to, and the app proves who it is
// with an assertion signed by its certificate. It counts what it's asked.
// Graph also keeps a mailbox for each account, which it searches and reads
// as Outlook does, with ids that change when an email moves, and immutable
// ones that don't, for whoever asks for those.

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
}

/** An email in a mailbox: its immutable id, and the folder it's in, which its ordinary id depends on. */
interface Kept extends Email {
  id: string;
  folder: string;
  conversation: string;
}

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
  /** What it was asked: codes redeemed, refreshes, calls to Graph, and assertions it accepted, and of Graph, searches and emails read. */
  readonly asked = { codes: 0, refreshes: 0, graph: 0, assertions: 0, searches: 0, reads: 0 };
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
  private readonly mailboxes = new Map<string, Kept[]>();
  /** Accounts whose mailbox answers slowly, by how many milliseconds. */
  private readonly slowness = new Map<string, number>();
  /** How many milliseconds refreshing a sign-in takes. */
  private refreshDelay = 0;
  private server?: Server;
  url!: string;

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void this.handle(req.method ?? 'GET', new URL(req.url ?? '/', this.url), req).then(
        ({ status, body }) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)),
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

  /** Someone sends the account an email. Returns its immutable id. */
  deliver(account: Account, email: Email): string {
    const id = `AAkALg${randomBytes(24).toString('base64url')}=`;
    const mailbox = this.mailboxes.get(account.oid) ?? [];
    mailbox.push({ ...email, id, folder: 'inbox', conversation: email.conversation ?? `AAQk${randomBytes(12).toString('base64url')}=` });
    this.mailboxes.set(account.oid, mailbox);
    return id;
  }

  /** The account's owner moves an email to another folder, which changes its ordinary id but not its immutable one. */
  move(account: Account, id: string, folder: string) {
    const email = this.mailboxes.get(account.oid)?.find((kept) => kept.id === id);
    if (email) email.folder = folder;
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

  private async handle(method: string, url: URL, req: import('node:http').IncomingMessage): Promise<{ status: number; body: unknown }> {
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
      if (url.pathname === '/v1.0/me/mailFolders/inbox') {
        if (held.account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
        return { status: 200, body: { id: 'AAMkAGI2THVSAAA=' } };
      }
      if (url.pathname.startsWith('/v1.0/me/messages')) {
        const delay = this.slowness.get(held.account.oid) ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return this.mail(held.account, url, String(req.headers.prefer ?? ''));
      }
    }
    return { status: 404, body: {} };
  }

  /** Graph's messages, as far as Homing uses them: search, one email, its thread and its attachments' names. */
  private mail(account: Account, url: URL, prefer: string): { status: number; body: unknown } {
    if (account.noMailbox) return { status: 404, body: { error: { code: 'MailboxNotEnabledForRESTAPI' } } };
    const mailbox = this.mailboxes.get(account.oid) ?? [];
    const immutable = /IdType="ImmutableId"/.test(prefer);
    const idOf = (email: Kept) => (immutable ? email.id : `AAMk${email.folder}-${email.id.slice(6)}`);
    const select = (url.searchParams.get('$select') ?? '').split(',').filter(Boolean);
    const content = (html: string) => (/outlook\.body-content-type="text"/.test(prefer) ? { contentType: 'text', content: textOf(html) } : { contentType: 'html', content: html });
    const fields = (email: Kept): Record<string, unknown> => {
      const all: Record<string, unknown> = {
        id: idOf(email),
        conversationId: email.conversation,
        subject: email.subject,
        from: { emailAddress: email.from },
        toRecipients: (email.to ?? []).map((emailAddress) => ({ emailAddress })),
        ccRecipients: (email.cc ?? []).map((emailAddress) => ({ emailAddress })),
        receivedDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
        sentDateTime: email.at.toISOString().replace(/\.\d+Z$/, 'Z'),
        bodyPreview: textOf(email.html).replace(/\s+/g, ' ').slice(0, 255),
        hasAttachments: (email.attachments ?? []).some((attachment) => !attachment.inline),
        // Microsoft gives the text when asked to, and the HTML otherwise.
        body: content(email.html),
        ...(email.unique !== null && { uniqueBody: content(email.unique ?? email.html) }),
      };
      return Object.fromEntries(Object.entries(all).filter(([name]) => select.length === 0 || select.includes(name)));
    };
    const found = (id: string) => mailbox.find((email) => email.id === id || idOf(email) === id || `AAMk${email.folder}-${email.id.slice(6)}` === id);
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
      return email ? { status: 200, body: fields(email) } : notFound;
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
      const matches = mailbox
        .filter((email) => {
          const text = `${email.from.name} ${email.from.address} ${email.subject} ${textOf(email.html)}`.toLowerCase();
          return terms.every((term) => text.includes(term));
        })
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      return { status: 200, body: { value: matches.slice(0, top).map(fields), ...(matches.length > top && { '@odata.nextLink': `${this.url}/next` }) } };
    }
    const conversation = filter && /^conversationId eq '(.*)'$/.exec(filter)?.[1]?.replace(/''/g, "'");
    if (conversation) {
      const thread = mailbox.filter((email) => email.conversation === conversation);
      return { status: 200, body: { value: thread.slice(0, top).map(fields), ...(thread.length > top && { '@odata.nextLink': `${this.url}/next` }) } };
    }
    return { status: 400, body: { error: { code: 'BadRequest' } } };
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
