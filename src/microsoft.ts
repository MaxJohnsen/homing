// Microsoft 365, the first system Homing connects to (spec §7), as a
// connector (connectors.ts). A person signs in on Microsoft's own page and
// allows Homing to read their mail; Homing then reads it as them, with
// delegated permissions only. This is the sign-in itself, over plain HTTPS:
// OAuth 2.0's authorization code flow with PKCE and OpenID Connect, Homing
// proving it is its app registration with a certificate, or a client secret
// where a self-hoster has no certificate. Then two calls to Microsoft Graph
// confirm what was connected. Later, Graph searches and reads the person's
// mail, when they ask for it. What's about email in general is in mail.ts.

import { createHash, createPrivateKey, randomUUID, X509Certificate, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeJwt, SignJWT } from 'jose';
import type { Access, Connector, Grant, Listed, NeverRead, Party, Tokens } from './connectors.ts';
import { emailFound, emailItem, mailbox, withheld } from './mail.ts';

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
  /** The HTTP status Graph answered with, when it was Graph. */
  readonly status?: number;
  constructor(code: string, detail?: string, status?: number) {
    // Only what Microsoft's codes are made of, so nothing it sent can shape a log line.
    const plain = (text: string) => text.replace(/[^\w.-]/g, '').slice(0, 60);
    super(`Microsoft refused: ${plain(code)}${detail ? ` (${plain(detail)})` : ''}`);
    this.code = plain(code);
    this.detail = detail && plain(detail);
    this.status = status;
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
  /** How many seconds Microsoft asked Homing to wait, when it was asked too often or was busy and said so. */
  readonly retryAfter?: number;
  constructor(what: string, retryAfter?: number) {
    super(`Microsoft didn’t answer ${what}.`);
    this.retryAfter = retryAfter;
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
        search: async (access, words, limit) => (await searchMail(await mailboxOf(set(), access), words, limit)).map(emailFound),
        read: async (access, id, { related }) => {
          const read = await readMail(await mailboxOf(set(), access), id, { thread: related });
          return read === 'withheld' ? read : read && emailItem(read.mail, read.thread, read.moreInThread);
        },
        inOrder: {
          // Outlook's English names for the folders it makes, which match them in any language.
          neverRead: { senders: [], folders: Object.values(setAside) },
          list: async (access, window) => listMail(await mailboxOf(set(), access), window),
        },
      },
    },
    retryAfter: (error) => (error instanceof MicrosoftUnreachable ? error.retryAfter : undefined),
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
  conversation: string | null;
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
const summaryFields = 'id,conversationId,subject,from,receivedDateTime,sentDateTime,bodyPreview';
/** What the never-read list goes by: where an email is, and who it's from and to. */
const placingFields = 'parentFolderId,isDraft,from,toRecipients,ccRecipients,bccRecipients';
/** What a line of the mailbox in order shows, and what a thread lists: no text. */
const lineFields = `id,conversationId,subject,receivedDateTime,sentDateTime,${placingFields}`;
/** How many emails of a thread, and attachments of an email, Homing reads. */
const listLength = 25;

/**
 * The folders the never-read list starts with, by their well-known names, and Outlook's English
 * name for each, which matches it whatever it's called in the mailbox.
 */
const setAside: Record<string, string> = { junkemail: 'Junk Email', deleteditems: 'Deleted Items', drafts: 'Drafts', outbox: 'Outbox' };

/**
 * How many requests one use of a mailbox makes to Graph at most, such as one stretch of it in
 * order, a search or reading an email, so each stays well under a minute; and how many emails a
 * page of the mailbox in order holds, and how many pages one stretch takes at most.
 */
export const mostRequests = 40;
const pageSize = 250;
const mostPages = 4;

/** One use of a mailbox has asked Graph as much as it may. */
class AskedEnough extends Error {}

/** One use of the account's mailbox: Graph as its owner, within Homing's time limit, at most so many requests, and what's never read there. */
interface Mailbox {
  get(path: string, prefer?: string[]): Promise<Record<string, unknown>>;
  never: NeverRead;
  /** Where its emails are, as this use finds out. */
  folders: Folders;
}

async function mailboxOf(settings: MicrosoftSettings, access: Access): Promise<Mailbox> {
  const token = await access.token();
  let asked = 0;
  const get = (path: string, prefer: string[] = []) => {
    if (++asked > mostRequests) throw new AskedEnough();
    return graph(settings, token, path, { prefer, signal: access.signal });
  };
  return { get, never: access.neverRead ?? { senders: [], folders: [] }, folders: foldersOf(get) };
}

/** Where a mailbox's emails are: for a folder's id, its name, and every name it and the folders it's in go by. */
type Folders = (id: string | null, draft: boolean) => Promise<{ name: string | null; names: string[] } | undefined>;

/**
 * A mailbox's folders, as one use finds them out: each folder by its id, read once, with its name
 * and the folder it's in, up to the top. A draft counts as in Drafts wherever it is. Undefined for
 * a folder Graph doesn't have, or one this use has no requests left to find.
 */
function foldersOf(get: Mailbox['get']): Folders {
  let known: Promise<{ top: string | null; ids: Map<string, string> }> | undefined;
  const read = new Map<string, Promise<{ name: string; parent: string | null } | undefined>>();
  const gone = (error: unknown) => {
    if (error instanceof MicrosoftRefused && error.status === 404) return undefined;
    throw error;
  };
  const folder = (id: string) => {
    let found = read.get(id);
    if (!found) {
      found = get(`/v1.0/me/mailFolders/${encodeURIComponent(id)}?$select=id,displayName,parentFolderId`).then(
        (body) => ({ name: typeof body.displayName === 'string' ? body.displayName : '', parent: typeof body.parentFolderId === 'string' ? body.parentFolderId : null }),
        gone,
      );
      read.set(id, found);
    }
    return found;
  };
  // The four by their well-known names, and the top of the mailbox, which they're in.
  const knownFolders = async () => {
    const ids = new Map<string, string>();
    let top: string | null = null;
    for (const [name, english] of Object.entries(setAside)) {
      const body = await get(`/v1.0/me/mailFolders/${name}?$select=id,parentFolderId`).catch(gone);
      if (typeof body?.id !== 'string') continue;
      ids.set(body.id, english);
      if (typeof body.parentFolderId === 'string') top = body.parentFolderId;
    }
    return { top, ids };
  };
  return async (id, draft) => {
    if (!id) return undefined;
    known ??= knownFolders();
    const { top, ids } = await known;
    const names = draft ? [setAside.drafts] : [];
    let name: string | null = null;
    for (let at: string | null = id, depth = 0; at && at !== top && depth < 20; depth++) {
      const found = await folder(at);
      if (!found) return depth === 0 ? undefined : { name, names };
      if (depth === 0) name = found.name;
      names.push(found.name, ...(ids.has(at) ? [ids.get(at)!] : []));
      at = found.parent;
    }
    return { name, names };
  };
}

/** An email as Graph gave it, where it is, and who it's from and to, once Homing knows it isn't never read. */
interface Kept {
  message: Record<string, unknown>;
  folder: string | null;
}

/**
 * The one place Homing reads mail for anyone: every email Graph gives goes through it before
 * anything else sees it, and what's never read is left out here, as the never-read list says,
 * by where it is and who it's from and to. Emails whose folder this use has no requests left to
 * find, a list in order stops before; anything else leaves them out.
 */
async function keptOf(box: Mailbox, messages: Record<string, unknown>[], { names = false, stop = false } = {}): Promise<{ kept: Kept[]; stoppedAt?: Record<string, unknown> }> {
  const kept: Kept[] = [];
  for (const message of messages) {
    const parties = [...addressesOf([message.from]), ...addressesOf(message.toRecipients), ...addressesOf(message.ccRecipients), ...addressesOf(message.bccRecipients)];
    let where: Awaited<ReturnType<Folders>> | null = null;
    // Where it is matters only for the list's names, and for a never-read list that names folders.
    if (names || box.never.folders.length > 0) {
      try {
        where = (await box.folders(typeof message.parentFolderId === 'string' ? message.parentFolderId : null, message.isDraft === true)) ?? null;
      } catch (error) {
        if (!(error instanceof AskedEnough)) throw error;
        if (stop) return { kept, stoppedAt: message };
      }
    }
    if (withheld({ parties, folders: where?.names ?? (box.never.folders.length > 0 ? null : []) }, box.never)) continue;
    kept.push({ message, folder: where?.name ?? null });
  }
  return { kept };
}

/**
 * Searches the account's mailbox as Outlook does, in the sender, subject and text of its emails,
 * newest first, for at most a few, without what's never read. The words are Outlook's search
 * syntax, quoted as one search.
 */
export async function searchMail(box: Mailbox, words: string, top: number): Promise<MailSummary[]> {
  // Whole characters, so an emoji is never cut in half, which no address can carry.
  const search = Array.from(words.toWellFormed().replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, 255).join('');
  if (!search) return [];
  const quoted = `"${search.replace(/[\\"]/g, '\\$&')}"`;
  // A few more than shown, since what's never read is left out.
  const body = await box.get(`/v1.0/me/messages?$search=${encodeURIComponent(quoted)}&$top=${Math.min(top * 3, listLength)}&$select=${summaryFields},${placingFields}`, [immutableIds]);
  return (await keptOf(box, listOf(body))).kept.slice(0, top).map(({ message }) => summaryOf(message));
}

/**
 * Reads one email in the account's mailbox by its immutable id, with its text and, unless left
 * out, the names of its attachments and its thread, without what's never read. Undefined when it
 * isn't in the mailbox any more, and withheld when it's never read, whose text Homing doesn't ask for.
 */
export async function readMail(box: Mailbox, id: string, { thread: withThread = true }: { thread?: boolean } = {}): Promise<MailWithThread | 'withheld' | undefined> {
  const path = `/v1.0/me/messages/${encodeURIComponent(id)}`;
  let message: Record<string, unknown>;
  try {
    const placing = await box.get(`${path}?$select=id,${placingFields}`, [immutableIds]);
    if ((await keptOf(box, [placing])).kept.length === 0) return 'withheld';
    // Microsoft turns the HTML into text, so nothing in it is fetched or run.
    message = await box.get(`${path}?$select=${summaryFields},toRecipients,ccRecipients,body,uniqueBody,hasAttachments`, [immutableIds, 'outlook.body-content-type="text"']);
  } catch (error) {
    if (error instanceof MicrosoftRefused && ['ErrorItemNotFound', 'ErrorInvalidIdMalformed', 'http_404'].includes(error.detail ?? '')) return undefined;
    throw error;
  }
  const summary = summaryOf(message);
  const conversation = withThread ? summary.conversation : null;
  const [thread, attachments] = await Promise.all([
    conversation
      ? box.get(`/v1.0/me/messages?$filter=${encodeURIComponent(`conversationId eq '${conversation.replace(/'/g, "''")}'`)}&$top=${listLength}&$select=${lineFields}`, [immutableIds])
      : undefined,
    withThread && message.hasAttachments === true ? box.get(`${path}/attachments?$select=name,isInline&$top=${listLength}`, [immutableIds]) : undefined,
  ]);
  // As text, as Microsoft was asked, or else turned into text here.
  const textIn = (body: unknown) => {
    const { contentType, content } = (body ?? {}) as { contentType?: unknown; content?: unknown };
    if (typeof content !== 'string') return null;
    return contentType === 'html' ? textOf(content) : content;
  };
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
    thread: (await keptOf(box, listOf(thread))).kept.map(({ message }) => summaryOf(message)).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
    moreInThread: typeof thread?.['@odata.nextLink'] === 'string',
  };
}

/** A moment to the whole second before it, as Graph keeps when an email arrived. */
const second = (at: Date) => new Date(Math.floor(at.getTime() / 1000) * 1000);
/** A moment as Graph's filters take it. */
const graphTime = (at: Date) => at.toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * The mailbox in order (connectors.ts): every email in every folder, what its owner sent too, by
 * when it arrived, oldest first, from one moment until another, without what's never read. One
 * line each, with who it's from and to, its subject, when it arrived, its conversation and its
 * folder by name, and never its text. Graph's own next link leads on, as its documentation asks,
 * since a page may hold fewer than asked for. It stops once it has more than most, past the first
 * second, or at the most pages or requests one use makes, and then says it got through to the
 * second of the last email it looked at, since more may have arrived in that same second.
 */
export async function listMail(box: Mailbox, { from, until, most }: { from: Date; until: Date; most: number }): Promise<{ listed: Listed[]; through: Date }> {
  const filter = `receivedDateTime ge ${graphTime(from)} and receivedDateTime lt ${graphTime(until)}`;
  let link: string | undefined = `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('receivedDateTime asc')}&$top=${pageSize}&$select=${lineFields}`;
  const listed: Listed[] = [];
  let last: Date | undefined;
  const upTo = (at: Date) => ({ listed: listed.filter((line) => line.at !== null && line.at < at), through: at });
  for (let pages = 0; link; pages++) {
    if (pages === mostPages) return upTo(second(last ?? from));
    let body: Record<string, unknown>;
    try {
      body = await box.get(link, [immutableIds]);
    } catch (error) {
      if (error instanceof AskedEnough) return upTo(second(last ?? from));
      throw error;
    }
    const page = listOf(body);
    const { kept, stoppedAt } = await keptOf(box, page, { names: true, stop: true });
    for (const { message, folder } of kept) {
      const summary = summaryOf(message);
      last = summary.at ?? last;
      listed.push({ ...emailFound(summary), audience: { people: [...addressesOf(message.toRecipients), ...addressesOf(message.ccRecipients)], more: 0 }, where: folder });
    }
    if (stoppedAt) return upTo(second(summaryOf(stoppedAt).at ?? from));
    // What's left out still counts for where the list got to.
    last = summaryOf(page.at(-1) ?? {}).at ?? last;
    if (listed.length > most && last && second(last) > from) return upTo(second(last));
    link = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined;
  }
  return { listed, through: until };
}

function listOf(body: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return Array.isArray(body?.value) ? body.value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null) : [];
}

function summaryOf(message: Record<string, unknown>): MailSummary {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const at = text(message.receivedDateTime) ?? text(message.sentDateTime);
  return {
    id: String(message.id ?? ''),
    conversation: text(message.conversationId),
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
 * Calls Microsoft Graph with the account's token, at a path, or at a link Graph gave, such as the
 * next page of a list, only when it's Graph's own, so the token never goes anywhere else.
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
  if (response.status >= 500 || response.status === 429) throw new MicrosoftUnreachable('Graph', waitOf(response.headers.get('retry-after')));
  const code = typeof body.error?.code === 'string' ? body.error.code : `http_${response.status}`;
  // An account without an Exchange Online mailbox, such as one only for signing in.
  if (path === '/v1.0/me/mailFolders/inbox?$select=id' && (response.status === 404 || code === 'MailboxNotEnabledForRESTAPI')) throw new MicrosoftRefused('no_mailbox', code, response.status);
  throw new MicrosoftRefused('graph_refused', code, response.status);
}

/** How long Microsoft asked Homing to wait, from its Retry-After, in seconds or as a time: at most an hour. */
function waitOf(retryAfter: string | null): number | undefined {
  if (!retryAfter?.trim()) return undefined;
  const seconds = /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : (Date.parse(retryAfter) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.min(Math.max(Math.ceil(seconds), 1), 3600) : undefined;
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
