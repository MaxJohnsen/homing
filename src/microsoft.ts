// Microsoft 365, the first system Homing connects to (spec §7), as a
// connector (connectors.ts). A person signs in on Microsoft's own page and
// allows Homing to read their mail; Homing then reads it as them, with
// delegated permissions only. This is the sign-in itself, over plain HTTPS:
// OAuth 2.0's authorization code flow with PKCE and OpenID Connect, Homing
// proving it is its app registration with a certificate, or a client secret
// where a self-hoster has no certificate. Then two calls to Microsoft Graph
// confirm what was connected. Later, Graph searches and reads the person's
// mail, when they ask for it, and follows it, when they learn from it. What's
// about email in general is in mail.ts.

import { createHash, createPrivateKey, randomUUID, X509Certificate, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeJwt, SignJWT } from 'jose';
import type { Change, Changes, Connector, Grant, Party, Scope, SetAside, Tokens } from './connectors.ts';
import { automatedEmail, emailFound, emailItem, mailbox } from './mail.ts';
import { contentVersion } from './places.ts';

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

/**
 * Microsoft 365 as a connector: the account's own mailbox, which connecting adds, and, once this
 * Homing is set up for it, the sign-in and Graph. Its account is the directory (tenant) and the
 * object id there.
 */
export function microsoftConnector(settings?: MicrosoftSettings): Connector {
  const set = (): MicrosoftSettings => {
    if (!settings) throw new Error('Microsoft 365 isn’t set up on this Homing.');
    return settings;
  };
  return {
    id: 'microsoft',
    name: 'Microsoft 365',
    vendor: 'Microsoft',
    ready: settings !== undefined,
    settings: 'Check MICROSOFT_CLIENT_ID, MICROSOFT_TENANT, and MICROSOFT_CERTIFICATE or MICROSOFT_CLIENT_SECRET, and the app registration. See docs/deployment.md.',
    // Graph's ids, immutable ones included, are URL-safe base64.
    ids: /^[A-Za-z0-9_=-]{1,1024}$/,
    abilities: { 'Mail.Read': 'read mail' },
    auth: {
      callback: callbackPath,
      signIn: (attempt) => signInAddress(set(), attempt),
      redeem: (answer) => redeem(set(), answer),
      account: async (grant) => {
        const account = await whoIs(set(), grant.tokens.access);
        const address = account.address ?? grant.username;
        if (!address) throw new MicrosoftRefused('no_address');
        return { address, name: account.name, places: [{ kind: 'mailbox', resource: grant.account }] };
      },
      refresh: (kept) => refresh(set(), kept),
      notice: (error) => {
        if (!(error instanceof MicrosoftRefused)) return undefined;
        // A code used before, or one that expired, as when the page is opened again.
        if (error.code === 'invalid_grant') return 'expired';
        if (error.code === 'no_mailbox') return 'no-mailbox';
        return undefined;
      },
    },
    kinds: {
      mailbox: {
        // An immutable id lasts while an email moves between folders, though not to an archive mailbox.
        words: { ...mailbox, lost: 'or it moved to an archive' },
        search: async (access, words, limit) => (await searchMail(set(), await access.token(), words, { top: limit, signal: access.signal })).map(emailFound),
        read: async (access, id, { related }) => {
          const read = await readMail(set(), await access.token(), id, { signal: access.signal, thread: related });
          return read && emailItem(read.mail, read.thread, read.moreInThread);
        },
        follow: {
          changes: async (access, from, scope) => followMail(set(), await access.token(), from, scope, access.signal),
          count: async (access, scope) => countMail(set(), await access.token(), scope, access.signal),
        },
      },
    },
    refused: (error) => {
      if (error instanceof MicrosoftUnreachable) return 'try later';
      if (!(error instanceof MicrosoftRefused)) return undefined;
      if (error.signInAgain) return 'sign in again';
      if (error.homingItself) return 'homing settings';
      // Graph refused a token before it expired, such as after the person withdrew their consent.
      if (error.detail === 'InvalidAuthenticationToken') return 'renew';
      return 'refused';
    },
  };
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

/** An email in a mailbox, as a list of them shows it. Its id is its immutable id, which stays while it's in the mailbox. */
export interface MailSummary {
  id: string;
  conversationId: string | null;
  subject: string | null;
  from: Party | null;
  /** When the mailbox received it, or sent it. */
  at: Date | null;
  /** Its first words, as Microsoft gives them. */
  preview: string;
}

/** An email to read: who it's from and to, its text, and the names of its attachments. */
export interface Mail extends MailSummary {
  to: Party[];
  cc: Party[];
  /** Its text, never its HTML. */
  body: string;
  /** The part of its text that's its own, without what it quotes from earlier emails, as Exchange tells them apart. Null when it doesn't say. */
  unique: string | null;
  attachments: string[];
}

/** An email with its thread, oldest first, as far as Homing reads it. */
export interface MailWithThread {
  mail: Mail;
  thread: MailSummary[];
  /** Whether the thread holds more than Homing read of it. */
  moreInThread: boolean;
}

/** Ids that stay the same when an email moves to another folder, so a reference to it keeps working. */
const immutableIds = 'IdType="ImmutableId"';
/** Bodies as text, so Microsoft turns the HTML into text and nothing in it is fetched or run. */
const textBodies = 'outlook.body-content-type="text"';
const summaryFields = 'id,conversationId,subject,from,receivedDateTime,sentDateTime,bodyPreview';
/** How many emails of a thread, and attachments of an email, Homing reads. */
const listLength = 25;

/**
 * Searches the account's mailbox as Outlook does, in the sender, subject and text of its emails,
 * newest first, for at most a few. The words are Outlook's search syntax, quoted as one search.
 */
export async function searchMail(settings: MicrosoftSettings, access: string, words: string, { top, signal }: { top: number; signal?: AbortSignal }): Promise<MailSummary[]> {
  // Whole characters, so an emoji is never cut in half, which no address can carry.
  const search = Array.from(words.toWellFormed().replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, 255).join('');
  if (!search) return [];
  const quoted = `"${search.replace(/[\\"]/g, '\\$&')}"`;
  const body = await graph(settings, access, `/v1.0/me/messages?$search=${encodeURIComponent(quoted)}&$top=${top}&$select=${summaryFields}`, { prefer: [immutableIds], signal });
  return listOf(body).map(summaryOf);
}

/**
 * Reads one email in the account's mailbox by its immutable id, with its text and, unless left
 * out, the names of its attachments and its thread. Undefined when it isn't in the mailbox any more.
 */
export async function readMail(
  settings: MicrosoftSettings,
  access: string,
  id: string,
  { signal, thread: withThread = true }: { signal?: AbortSignal; thread?: boolean } = {},
): Promise<MailWithThread | undefined> {
  let message: Record<string, unknown>;
  try {
    message = await graph(
      settings,
      access,
      `/v1.0/me/messages/${encodeURIComponent(id)}?$select=${summaryFields},toRecipients,ccRecipients,body,uniqueBody,hasAttachments`,
      { prefer: [immutableIds, textBodies], signal },
    );
  } catch (error) {
    if (error instanceof MicrosoftRefused && ['ErrorItemNotFound', 'ErrorInvalidIdMalformed', 'http_404'].includes(error.detail ?? '')) return undefined;
    throw error;
  }
  const summary = summaryOf(message);
  const conversation = withThread ? summary.conversationId : null;
  const [thread, attachments] = await Promise.all([
    conversation
      ? graph(settings, access, `/v1.0/me/messages?$filter=${encodeURIComponent(`conversationId eq '${conversation.replace(/'/g, "''")}'`)}&$top=${listLength}&$select=${summaryFields}`, { prefer: [immutableIds], signal })
      : undefined,
    withThread && message.hasAttachments === true ? graph(settings, access, `/v1.0/me/messages/${encodeURIComponent(id)}/attachments?$select=name,isInline&$top=${listLength}`, { prefer: [immutableIds], signal }) : undefined,
  ]);
  return {
    mail: {
      ...summary,
      to: addressesOf(message.toRecipients),
      cc: addressesOf(message.ccRecipients),
      body: textIn(message.body) ?? '',
      unique: textIn(message.uniqueBody),
      attachments: listOf(attachments)
        .filter((attachment) => attachment.isInline !== true)
        .flatMap((attachment) => (typeof attachment.name === 'string' && attachment.name.trim() ? [attachment.name.trim()] : [])),
    },
    thread: listOf(thread).map(summaryOf).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
    moreInThread: typeof thread?.['@odata.nextLink'] === 'string',
  };
}

/** An email's body as text, as Microsoft was asked for it, or else turned into text here. */
function textIn(body: unknown): string | null {
  const { contentType, content } = (body ?? {}) as { contentType?: unknown; content?: unknown };
  if (typeof content !== 'string') return null;
  return contentType === 'html' ? textOf(content) : content;
}

/**
 * Where following a mailbox stands, as its checkpoint keeps it: through its history by the date
 * each email arrived, from the time the next page starts at, with the emails at that very time
 * already given, and how many of them to pass over once they fill a page; then, once that caught
 * up, onward by Graph's delta for each folder, with each folder's next link. Either way, the
 * folders it leaves out.
 */
type Walk =
  | { v: 1; by: 'date'; after: string | null; seen: string[]; skip?: number; aside: Record<string, SetAside> }
  | { v: 1; by: 'delta'; from: string; links: Record<string, string>; aside: Record<string, SetAside> };

/** What following reads of each email: what reading one does, with its folder and headers, and without its attachments. */
const followFields = `${summaryFields},parentFolderId,toRecipients,ccRecipients,body,uniqueBody,internetMessageHeaders,isDraft`;
/** How many emails a page holds. */
const pageSize = 50;
/** The folders following leaves out, by their well-known names, and why. */
const asideFolders: Record<string, SetAside> = { junkemail: 'junk', deleteditems: 'deleted', drafts: 'draft', outbox: 'draft' };
/** The most folders Homing follows in a mailbox. */
const mostFolders = 500;
/** How Graph says it no longer knows where a folder's changes stood, so they're asked for again from the start. */
const forgotten = ['SyncStateNotFound', 'syncStateNotFound', 'SyncStateInvalid', 'resyncRequired', 'http_410'];

/**
 * One page of the mailbox's changes, oldest first (connectors.ts). Its history comes by the date
 * each email arrived, across all its folders, from the start of the scope, up to its end if it has
 * one. Without an end, once that catches up, it follows each folder with Graph's delta from the
 * last email given, so what arrives, or changes, comes next, and what came by date before comes
 * again only where it's still new to the delta, for Homing to skip. Each email comes with its
 * thread, unless it's set aside: by its folder, as a draft, or by its own headers.
 */
export async function followMail(settings: MicrosoftSettings, access: string, from: string | null, scope: Scope, signal?: AbortSignal): Promise<Changes> {
  const walk: Walk = from ? walkOf(from) : { v: 1, by: 'date', after: null, seen: [], aside: await asideFoldersOf(settings, access, signal) };
  const folders = await foldersOf(settings, access, signal);
  if (walk.by === 'date') {
    const start = walk.after ?? scope.since.toISOString();
    const skip = walk.skip ?? 0;
    const filter = `receivedDateTime ge ${start}${scope.until ? ` and receivedDateTime lt ${scope.until.toISOString()}` : ''}`;
    const page = listOf(
      await graph(settings, access, `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime%20asc&$top=${pageSize}${skip ? `&$skip=${skip}` : ''}&$select=${followFields}`, {
        prefer: [immutableIds, textBodies],
        signal,
      }),
    );
    const fresh = page.filter((message) => !walk.seen.includes(String(message.id ?? '')));
    const changes = await changesOf(settings, access, fresh, folders, walk.aside, signal);
    const last = changes.at(-1)?.item.envelope.at?.toISOString() ?? null;
    const same = last !== null && last === walk.after;
    const after = last ?? walk.after;
    const seen = last ? [...(same ? walk.seen : []), ...changes.filter((change) => change.item.envelope.at?.toISOString() === last).map((change) => change.item.envelope.id)] : walk.seen;
    // So many arrived at one moment that a page held only what was given before: the next page
    // passes over them, and so do those after it, until the walk is past that moment.
    const pass = page.length === pageSize && fresh.length === 0 ? skip + pageSize : same && skip ? skip + page.length : 0;
    const there: Walk = { v: 1, by: 'date', after, seen, ...(pass && { skip: pass }), aside: walk.aside };
    if (page.length < pageSize) {
      // History caught up. With an end, that's all; without one, Graph's delta carries on from the last email.
      const next: Walk = scope.until ? there : { v: 1, by: 'delta', from: after ?? scope.since.toISOString(), links: {}, aside: walk.aside };
      return { changes, next: JSON.stringify(next), caughtUp: true };
    }
    return { changes, next: JSON.stringify(there), caughtUp: false };
  }

  // Each folder in turn, but those left out, until one has something new.
  const links: Record<string, string> = {};
  for (const [id] of folders) if (walk.links[id]) links[id] = walk.links[id];
  for (const [id] of [...folders].sort(([a], [b]) => a.localeCompare(b))) {
    if (walk.aside[id]) continue;
    const first = `${settings.graph}/v1.0/me/mailFolders/${encodeURIComponent(id)}/messages/delta?$select=${followFields}&$filter=${encodeURIComponent(`receivedDateTime ge ${walk.from}`)}`;
    let link = links[id] ?? first;
    for (let pages = 0; pages < 100; pages++) {
      let body: Record<string, unknown>;
      try {
        body = await graph(settings, access, link, { prefer: [immutableIds, textBodies, `odata.maxpagesize=${pageSize}`], signal });
      } catch (error) {
        // Graph forgot where this folder stood: it's followed again from where history ended, and what comes again, Homing skips.
        if (!(error instanceof MicrosoftRefused && link !== first && forgotten.includes(error.detail ?? ''))) throw error;
        delete links[id];
        link = first;
        continue;
      }
      // Removed from the folder, or moved out of it: what Homing learned from it stays.
      const messages = listOf(body).filter((message) => !('@removed' in message));
      const nextLink = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined;
      const deltaLink = typeof body['@odata.deltaLink'] === 'string' ? body['@odata.deltaLink'] : undefined;
      if (!nextLink && !deltaLink) throw new MicrosoftRefused('graph_refused', 'no_delta_link');
      links[id] = (nextLink ?? deltaLink)!;
      if (messages.length) {
        const changes = await changesOf(settings, access, messages, folders, walk.aside, signal);
        return { changes, next: JSON.stringify({ ...walk, links }), caughtUp: false };
      }
      if (!nextLink) break;
      link = nextLink;
    }
  }
  return { changes: [], next: JSON.stringify({ ...walk, links }), caughtUp: true };
}

/** How many emails arrived in the mailbox within the scope, as Graph counts them. */
export async function countMail(settings: MicrosoftSettings, access: string, scope: Scope, signal?: AbortSignal): Promise<number> {
  const filter = `receivedDateTime ge ${scope.since.toISOString()}${scope.until ? ` and receivedDateTime lt ${scope.until.toISOString()}` : ''}`;
  const body = await graph(settings, access, `/v1.0/me/messages?$count=true&$top=1&$select=id&$filter=${encodeURIComponent(filter)}`, { prefer: [immutableIds], signal });
  const count = body['@odata.count'];
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

/** A checkpoint as following left it. One Homing didn't make is no checkpoint. */
function walkOf(checkpoint: string): Walk {
  let walk: Walk;
  try {
    walk = JSON.parse(checkpoint) as Walk;
  } catch {
    throw new MicrosoftRefused('bad_checkpoint');
  }
  if (walk?.v !== 1 || !['date', 'delta'].includes(walk.by) || typeof walk.aside !== 'object') throw new MicrosoftRefused('bad_checkpoint');
  return walk;
}

/** The emails as changes, each with its thread, read once for each conversation, unless it's set aside. */
async function changesOf(
  settings: MicrosoftSettings,
  access: string,
  messages: Record<string, unknown>[],
  folders: Map<string, string>,
  aside: Record<string, SetAside>,
  signal?: AbortSignal,
): Promise<Change[]> {
  const found = messages.map((message) => {
    const summary = summaryOf(message);
    const folder = typeof message.parentFolderId === 'string' ? message.parentFolderId : null;
    const setAside = message.isDraft === true ? 'draft' : ((folder && aside[folder]) || automatedEmail(headersOf(message.internetMessageHeaders), summary.from));
    const mail: Mail = { ...summary, to: addressesOf(message.toRecipients), cc: addressesOf(message.ccRecipients), body: textIn(message.body) ?? '', unique: textIn(message.uniqueBody), attachments: [] };
    return { mail, folder, setAside: setAside || undefined };
  });
  const conversations = [...new Set(found.filter((one) => !one.setAside && one.mail.conversationId).map((one) => one.mail.conversationId!))];
  const threads = new Map<string, { thread: MailSummary[]; more: boolean }>();
  for (const conversation of conversations) {
    const body = await graph(settings, access, `/v1.0/me/messages?$filter=${encodeURIComponent(`conversationId eq '${conversation.replace(/'/g, "''")}'`)}&$top=${listLength}&$select=${summaryFields}`, { prefer: [immutableIds], signal });
    threads.set(conversation, { thread: listOf(body).map(summaryOf).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)), more: typeof body['@odata.nextLink'] === 'string' });
  }
  return found.map(({ mail, folder, setAside }) => {
    const thread = (!setAside && mail.conversationId && threads.get(mail.conversationId)) || { thread: [], more: false };
    const item = emailItem(mail, thread.thread, thread.more);
    return { item, version: contentVersion(item), thread: mail.conversationId, folder: folder ? (folders.get(folder) ?? null) : null, ...(setAside && { setAside }) };
  });
}

/** An email's headers, by lower-case name, as Graph lists them. */
function headersOf(headers: unknown): Map<string, string> {
  const found = new Map<string, string>();
  if (!Array.isArray(headers)) return found;
  for (const header of headers) {
    const { name, value } = (header ?? {}) as { name?: unknown; value?: unknown };
    if (typeof name === 'string' && typeof value === 'string') found.set(name.trim().toLowerCase(), value);
  }
  return found;
}

/** The mailbox's folders, by id, with their names: the top ones and those in them, as far as Homing follows. */
async function foldersOf(settings: MicrosoftSettings, access: string, signal?: AbortSignal): Promise<Map<string, string>> {
  const folders = new Map<string, string>();
  const waiting = ['/v1.0/me/mailFolders'];
  while (waiting.length && folders.size < mostFolders) {
    const body = await graph(settings, access, `${waiting.shift()}?$top=250&$select=id,displayName,childFolderCount`, { signal });
    for (const folder of listOf(body)) {
      if (typeof folder.id !== 'string' || folders.has(folder.id)) continue;
      folders.set(folder.id, typeof folder.displayName === 'string' ? folder.displayName : '');
      if (typeof folder.childFolderCount === 'number' && folder.childFolderCount > 0) waiting.push(`/v1.0/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders`);
    }
  }
  return folders;
}

/** The folders following leaves out, by id: junk, deleted mail, drafts and the outbox, as far as the mailbox has them. */
async function asideFoldersOf(settings: MicrosoftSettings, access: string, signal?: AbortSignal): Promise<Record<string, SetAside>> {
  const aside: Record<string, SetAside> = {};
  for (const [name, why] of Object.entries(asideFolders)) {
    try {
      const folder = await graph(settings, access, `/v1.0/me/mailFolders/${name}?$select=id`, { signal });
      if (typeof folder.id === 'string') aside[folder.id] = why;
    } catch (error) {
      // A mailbox without one, such as without an outbox, has nothing there to leave out.
      if (!(error instanceof MicrosoftRefused && error.code === 'no_mailbox')) throw error;
    }
  }
  return aside;
}

function listOf(body: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return Array.isArray(body?.value) ? body.value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null) : [];
}

function summaryOf(message: Record<string, unknown>): MailSummary {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const at = text(message.receivedDateTime) ?? text(message.sentDateTime);
  return {
    id: String(message.id ?? ''),
    conversationId: text(message.conversationId),
    subject: text(message.subject),
    from: addressesOf([message.from])[0] ?? null,
    at: at && !Number.isNaN(Date.parse(at)) ? new Date(at) : null,
    preview: text(message.bodyPreview) ?? '',
  };
}

function addressesOf(recipients: unknown): Party[] {
  if (!Array.isArray(recipients)) return [];
  return recipients.flatMap((recipient) => {
    const email = (recipient as { emailAddress?: { name?: unknown; address?: unknown } } | null)?.emailAddress;
    if (!email) return [];
    const name = typeof email.name === 'string' && email.name.trim() ? email.name.trim() : null;
    const address = typeof email.address === 'string' && email.address.trim() ? email.address.trim() : null;
    return name || address ? [{ name, address }] : [];
  });
}

/**
 * HTML as plain text, for an email Microsoft gives as HTML all the same: its words and line breaks,
 * without tags, scripts, styles or anything to fetch.
 */
export function textOf(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] !== '#') return entities[name.toLowerCase()] ?? whole;
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Calls Microsoft Graph with the account's token, at a path, or at a link Graph gave, such as a
 * delta link, only when it's Graph's own, so the token never goes anywhere else.
 */
async function graph(
  settings: MicrosoftSettings,
  access: string,
  path: string,
  { prefer = [], signal }: { prefer?: string[]; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  if (!path.startsWith('/') && !path.startsWith(`${settings.graph}/`)) throw new MicrosoftRefused('graph_refused', 'foreign_link');
  let response: Response;
  try {
    const headers = new Headers({ authorization: `Bearer ${access}`, accept: 'application/json' });
    for (const preference of prefer) headers.append('prefer', preference);
    response = await fetch(path.startsWith('/') ? `${settings.graph}${path}` : path, {
      headers,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MicrosoftUnreachable('Graph');
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { code?: unknown } } & Record<string, unknown>;
  // A body that didn't finish arriving in time is no answer.
  if (signal?.aborted) throw new MicrosoftUnreachable('Graph');
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
