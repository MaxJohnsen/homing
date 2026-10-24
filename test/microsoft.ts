// A stand-in for Microsoft's sign-in and Microsoft Graph, which are outside
// Homing. It keeps Microsoft's side of the rules Homing relies on: a code works
// once, for a few minutes, only with the PKCE verifier it was issued for and
// only for the app and address it was issued to, and the app proves who it is
// with an assertion signed by its certificate. It counts what it's asked.

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

export class MicrosoftStandIn {
  readonly clientId: string = randomUUID();
  readonly pem = makeCertificate();
  readonly certificate = new X509Certificate(/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.exec(this.pem)![0]);
  /** What it was asked: codes redeemed, refreshes, calls to Graph, and assertions it accepted. */
  readonly asked = { codes: 0, refreshes: 0, graph: 0, assertions: 0 };
  /** Every token it handed out, so tests can look for them where they mustn't be. */
  readonly issued: string[] = [];
  private readonly signing = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<string, { account: Account; redirectUri: string; challenge: string; nonce: string; audience: string; scope: string; expiresAt: number; used: boolean }>();
  private readonly refreshTokens = new Map<string, Account>();
  private readonly accessTokens = new Map<string, { account: Account; expiresAt: number }>();
  /** Accounts whose consent was revoked, or whose sign-in expired: Microsoft refuses their refresh tokens. */
  readonly refused = new Set<string>();
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
  signIn(address: string, account: Account, { expired = false, idToken = {} }: { expired?: boolean; idToken?: { nonce?: string; audience?: string } } = {}): string {
    const asked = new URL(address).searchParams;
    if (asked.get('response_type') !== 'code' || asked.get('code_challenge_method') !== 'S256' || asked.get('client_id') !== this.clientId) {
      throw new Error(`Microsoft wouldn't sign in for ${address}`);
    }
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, {
      account,
      redirectUri: asked.get('redirect_uri')!,
      challenge: asked.get('code_challenge')!,
      nonce: idToken.nonce ?? asked.get('nonce')!,
      audience: idToken.audience ?? this.clientId,
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
    }
    return { status: 404, body: {} };
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
      return { status: 200, body: await this.tokensFor(code.account, code.scope, code.nonce, code.audience) };
    }
    if (form.get('grant_type') === 'refresh_token') {
      this.asked.refreshes++;
      const account = this.refreshTokens.get(form.get('refresh_token') ?? '');
      if (!account || this.refused.has(account.oid)) return refuse('invalid_grant', 50173);
      return { status: 200, body: await this.tokensFor(account, form.get('scope') ?? '') };
    }
    return refuse('unsupported_grant_type', 70003);
  }

  private async tokensFor(account: Account, scope: string, nonce?: string, audience = this.clientId) {
    const access = `access-${randomBytes(24).toString('base64url')}`;
    const refresh = `refresh-${randomBytes(24).toString('base64url')}`;
    this.accessTokens.set(access, { account, expiresAt: Date.now() + 3600_000 });
    this.refreshTokens.set(refresh, account);
    this.issued.push(access, refresh);
    const idToken = await new SignJWT({ tid: account.tenant, oid: account.oid, preferred_username: account.address, name: account.name, ...(nonce && { nonce }) })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(`${this.url}/${account.tenant}/v2.0`)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.signing.privateKey);
    // Microsoft names Graph's permissions without Graph's address, and leaves offline_access out.
    const granted = scope.split(' ').filter((name) => name !== 'offline_access').join(' ');
    return { token_type: 'Bearer', scope: granted, expires_in: 3599, access_token: access, refresh_token: refresh, id_token: idToken };
  }
}
