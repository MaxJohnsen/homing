// Microsoft 365, the first system Homing connects to (spec §7). A person signs
// in on Microsoft's own page and allows Homing to read their mail; Homing
// then reads it as them, with delegated permissions only. This is the
// sign-in itself, over plain HTTPS: OAuth 2.0's authorization code flow with
// PKCE and OpenID Connect, Homing proving it is its app registration with a
// certificate, or a client secret where a self-hoster has no certificate.
// Then two calls to Microsoft Graph confirm what was connected.

import { createHash, createPrivateKey, randomUUID, X509Certificate, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeJwt, SignJWT } from 'jose';

/** How this Homing signs people in with Microsoft: its app registration in Microsoft Entra ID. */
export interface MicrosoftSettings {
  /** The app's (client) id. */
  clientId: string;
  /** Which accounts may connect: common, organizations, consumers, or one directory's id or domain. */
  tenant: string;
  /** How Homing proves it is the app: a certificate's private key and thumbprint, or a client secret. */
  credential: { key: KeyObject; thumbprint: string } | { secret: string };
  /** Where Microsoft signs people in, and Microsoft Graph. Tests point them at a stand-in. */
  login: string;
  graph: string;
}

/**
 * What Homing asks for: signing in, staying signed in, the person's basic profile, and reading
 * their mail. Nothing more until a feature needs it.
 */
export const scopes = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read'];

/** Where Microsoft sends the person back to, the same on every Homing. */
export const callbackPath = '/connections/microsoft/callback';

/**
 * This Homing's Microsoft settings, from MICROSOFT_CLIENT_ID, MICROSOFT_TENANT, and
 * MICROSOFT_CERTIFICATE or MICROSOFT_CLIENT_SECRET. Undefined when Microsoft isn't set up;
 * a setting that can't be used stops Homing from starting, saying which.
 */
export function microsoftFromEnvironment(env: Record<string, string | undefined> = process.env): MicrosoftSettings | undefined {
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  const tenant = env.MICROSOFT_TENANT?.trim() || 'common';
  if (!/^[\w.-]+$/.test(tenant)) {
    throw new Error('MICROSOFT_TENANT must be common, organizations, consumers, or a directory’s id or domain. See docs/deployment.md.');
  }
  const certificate = env.MICROSOFT_CERTIFICATE?.trim();
  const secret = env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!certificate && !secret) {
    throw new Error('MICROSOFT_CLIENT_ID is set, so Homing needs MICROSOFT_CERTIFICATE, or MICROSOFT_CLIENT_SECRET, to sign in to Microsoft. See docs/deployment.md.');
  }
  return {
    clientId,
    tenant,
    credential: certificate ? certificateCredential(certificate) : { secret: secret! },
    login: 'https://login.microsoftonline.com',
    graph: 'https://graph.microsoft.com',
  };
}

/**
 * A certificate's private key and SHA-256 thumbprint, from one PEM with both, given as the PEM
 * itself or as the path to its file. The key is RSA, as Microsoft asks.
 */
export function certificateCredential(value: string): { key: KeyObject; thumbprint: string } {
  let pem = value;
  if (!value.includes('-----BEGIN')) {
    try {
      pem = readFileSync(value, 'utf8');
    } catch {
      throw new Error('MICROSOFT_CERTIFICATE is neither a PEM nor a file Homing can read. See docs/deployment.md.');
    }
  }
  // A PEM in one line of .env, with \n for its line breaks.
  pem = pem.replaceAll('\\n', '\n');
  const keyBlock = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/.exec(pem)?.[0];
  const certificateBlock = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)?.[0];
  if (!keyBlock || !certificateBlock) {
    throw new Error('MICROSOFT_CERTIFICATE needs both the private key, unencrypted, and the certificate, in one PEM. See docs/deployment.md.');
  }
  let key: KeyObject;
  let certificate: X509Certificate;
  try {
    key = createPrivateKey(keyBlock);
    certificate = new X509Certificate(certificateBlock);
  } catch {
    throw new Error('MICROSOFT_CERTIFICATE has a private key or certificate Homing can’t read. See docs/deployment.md.');
  }
  if (key.asymmetricKeyType !== 'rsa' || !certificate.checkPrivateKey(key)) {
    throw new Error('MICROSOFT_CERTIFICATE’s private key must be RSA, and the certificate’s. See docs/deployment.md.');
  }
  if (new Date(certificate.validTo).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000) {
    console.warn(`Microsoft: the certificate in MICROSOFT_CERTIFICATE expires on ${certificate.validTo}. Upload a new one to the app registration, and set it here.`);
  }
  return { key, thumbprint: createHash('sha256').update(certificate.raw).digest('base64url') };
}

/** Microsoft refused, with its error code, such as invalid_grant. Never with a token in it. */
export class MicrosoftRefused extends Error {
  override name = 'MicrosoftRefused';
  readonly code: string;
  /** Microsoft's own number for the reason, such as AADSTS70008, when it gave one. */
  readonly detail?: string;
  constructor(code: string, detail?: string) {
    // Only what Microsoft's codes are made of, so nothing it sent can shape a log line.
    const plain = (text: string) => text.replace(/[^\w.-]/g, '').slice(0, 60);
    super(`Microsoft refused: ${plain(code)}${detail ? ` (${plain(detail)})` : ''}`);
    this.code = plain(code);
    this.detail = detail && plain(detail);
  }

  /**
   * Whether it concerns this account, so it needs its owner to sign in again: their consent was
   * withdrawn or the sign-in expired, or their organization doesn't let Homing in any more,
   * having deleted Homing (AADSTS700016) or turned it off (AADSTS7000112).
   */
  get signInAgain(): boolean {
    if (['invalid_grant', 'interaction_required', 'consent_required', 'login_required', 'unauthorized_client'].includes(this.code)) return true;
    return this.code === 'invalid_client' && (this.detail === 'AADSTS700016' || this.detail === 'AADSTS7000112');
  }

  /** Whether Homing's own settings are wrong, such as a certificate or secret Microsoft doesn't know, which no one person can fix. */
  get homingItself(): boolean {
    return this.code === 'invalid_client' && !this.signInAgain;
  }
}

/** Microsoft didn't answer, or not in time. Trying again later may work. */
export class MicrosoftUnreachable extends Error {
  override name = 'MicrosoftUnreachable';
  constructor(what: string) {
    super(`Microsoft didn’t answer ${what}.`);
  }
}

/** What an account's sign-in holds for Homing: tokens to use, and one to get new ones with. */
export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: Date;
}

/** An account someone signed in with, by the ids Microsoft keeps for good. */
export interface Grant {
  /** The account's directory (tenant) and its object id there. */
  tenant: string;
  account: string;
  /** Its address, as the person signed in with it. */
  username: string | null;
  /** What Microsoft allowed Homing, such as Mail.Read. */
  scopes: string[];
  tokens: Tokens;
}

/** Where Microsoft sends the person back to this Homing. */
export function redirectUri(homing: URL): string {
  return new URL(callbackPath, homing).toString();
}

/**
 * Microsoft's sign-in page, asking the person to allow Homing what it needs. The state ties the
 * answer to this attempt, the PKCE challenge to the code it brings back, and the nonce to the
 * ID token.
 */
export function signInAddress(settings: MicrosoftSettings, input: { redirectUri: string; state: string; challenge: string; nonce: string; loginHint?: string }): URL {
  const url = new URL(`${settings.login}/${encodeURIComponent(settings.tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    response_mode: 'query',
    scope: scopes.join(' '),
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    // Someone with a work and a personal account picks which one to connect.
    prompt: 'select_account',
    ...(input.loginHint && { login_hint: input.loginHint }),
  }).toString();
  return url;
}

/**
 * The account behind a code Microsoft sent back, and its tokens. The ID token comes straight from
 * Microsoft's token endpoint over HTTPS, which vouches for who issued it (OpenID Connect Core
 * 3.1.3.7), and is checked for this app, this attempt's nonce, and its issuer. Microsoft refuses a
 * code used before, one that expired, or one without this attempt's PKCE verifier.
 */
export async function redeem(settings: MicrosoftSettings, input: { code: string; verifier: string; redirectUri: string; nonce: string }): Promise<Grant> {
  const answer = await token(settings, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    scope: scopes.join(' '),
  });
  const tokens = tokensOf(answer);
  const claims = idTokenClaims(settings, answer.id_token, input.nonce);
  const granted = grantedScopes(answer.scope);
  // Homing asked for both; without them it would connect something it can't use.
  if (!granted.includes('User.Read') || !granted.includes('Mail.Read')) throw new MicrosoftRefused('scopes_not_granted');
  return { tenant: claims.tid, account: claims.oid, username: claims.username, scopes: granted, tokens };
}

/** New tokens for an account, with the one Homing kept. Microsoft gives a new refresh token each time. */
export async function refresh(settings: MicrosoftSettings, refreshToken: string): Promise<Tokens> {
  const answer = await token(settings, { grant_type: 'refresh_token', refresh_token: refreshToken, scope: scopes.join(' ') });
  return tokensOf(answer, refreshToken);
}

/**
 * Who the account is, as Microsoft Graph says, after checking that Homing can reach its mailbox.
 * It reads the mailbox's id, never anything in it.
 */
export async function whoIs(settings: MicrosoftSettings, access: string): Promise<{ address: string | null; name: string | null }> {
  const me = await graph(settings, access, '/v1.0/me?$select=id,displayName,mail,userPrincipalName');
  await graph(settings, access, '/v1.0/me/mailFolders/inbox?$select=id');
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return { address: text(me.mail) ?? text(me.userPrincipalName), name: text(me.displayName) };
}

async function graph(settings: MicrosoftSettings, access: string, path: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${settings.graph}${path}`, {
      headers: { authorization: `Bearer ${access}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MicrosoftUnreachable('Graph');
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { code?: unknown } } & Record<string, unknown>;
  if (response.ok) return body;
  if (response.status >= 500 || response.status === 429) throw new MicrosoftUnreachable('Graph');
  const code = typeof body.error?.code === 'string' ? body.error.code : `http_${response.status}`;
  // An account without an Exchange Online mailbox, such as one only for signing in.
  if (path.includes('/mailFolders/') && (response.status === 404 || code === 'MailboxNotEnabledForRESTAPI')) throw new MicrosoftRefused('no_mailbox', code);
  throw new MicrosoftRefused('graph_refused', code);
}

interface TokenAnswer {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  scope?: unknown;
}

/** Calls Microsoft's token endpoint as this app. Its answer is never logged, and nor is the request. */
async function token(settings: MicrosoftSettings, body: Record<string, string>): Promise<TokenAnswer> {
  const url = `${settings.login}/${encodeURIComponent(settings.tenant)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({ client_id: settings.clientId, ...body, ...(await clientCredential(settings, url)) });
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MicrosoftUnreachable('signing in');
  }
  const answer = (await response.json().catch(() => ({}))) as TokenAnswer & { error?: unknown; error_codes?: unknown };
  if (response.ok) return answer;
  if (response.status >= 500 || response.status === 429) throw new MicrosoftUnreachable('signing in');
  // Microsoft's own number for the reason, such as AADSTS70008 for an expired code, helps whoever runs Homing.
  const number = Array.isArray(answer.error_codes) && typeof answer.error_codes[0] === 'number' ? `AADSTS${answer.error_codes[0]}` : undefined;
  throw new MicrosoftRefused(typeof answer.error === 'string' ? answer.error : `http_${response.status}`, number);
}

/**
 * How Homing proves it is the app. With a certificate: a short-lived assertion signed with its
 * private key, naming the certificate by its SHA-256 thumbprint, for this token endpoint only.
 */
async function clientCredential(settings: MicrosoftSettings, tokenUrl: string): Promise<Record<string, string>> {
  if ('secret' in settings.credential) return { client_secret: settings.credential.secret };
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'PS256', typ: 'JWT', 'x5t#S256': settings.credential.thumbprint })
    .setIssuer(settings.clientId)
    .setSubject(settings.clientId)
    .setAudience(tokenUrl)
    .setJti(randomUUID())
    .setNotBefore(now)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(settings.credential.key);
  return { client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion };
}

function tokensOf(answer: TokenAnswer, previousRefresh?: string): Tokens {
  const refresh = typeof answer.refresh_token === 'string' && answer.refresh_token ? answer.refresh_token : previousRefresh;
  if (typeof answer.access_token !== 'string' || !answer.access_token || !refresh) throw new MicrosoftRefused('no_tokens');
  const seconds = typeof answer.expires_in === 'number' ? answer.expires_in : Number(answer.expires_in);
  return { access: answer.access_token, refresh, expiresAt: new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000) };
}

const directoryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ID token's claims, once they're shown to be for this app, this attempt, and from Microsoft. */
function idTokenClaims(settings: MicrosoftSettings, idToken: unknown, nonce: string): { tid: string; oid: string; username: string | null } {
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwt(String(idToken));
  } catch {
    throw new MicrosoftRefused('invalid_id_token');
  }
  const { aud, iss, tid, oid, exp } = claims;
  const fits =
    aud === settings.clientId &&
    claims.nonce === nonce &&
    typeof tid === 'string' && directoryId.test(tid) &&
    typeof oid === 'string' && oid.length > 0 &&
    iss === `${settings.login}/${tid}/v2.0` &&
    typeof exp === 'number' && exp * 1000 > Date.now() - 5 * 60_000 &&
    // A Homing set up for one directory takes accounts from that one only.
    (!directoryId.test(settings.tenant) || tid.toLowerCase() === settings.tenant.toLowerCase());
  if (!fits) throw new MicrosoftRefused('invalid_id_token');
  const username = [claims.preferred_username, claims.email].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  return { tid: tid.toLowerCase(), oid, username: username?.trim() ?? null };
}

/** The permissions Microsoft granted, as Homing names them: Mail.Read rather than its Graph address. */
function grantedScopes(scope: unknown): string[] {
  const named = new Map(scopes.map((name) => [name.toLowerCase(), name]));
  return String(scope ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => value.replace(/^https:\/\/graph\.microsoft\.com\//i, ''))
    .map((value) => named.get(value.toLowerCase()) ?? value);
}
