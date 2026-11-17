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
import type { Change, Changes, Connector, Grant, Listed, Party, Scope, SetAside, Tokens } from './connectors.ts';
import { automatedEmail, carriesEarlier, emailFound, emailItem, mailbox } from './mail.ts';
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
        search: async (access, words, limit) => (await searchMail(set(), await access.token(), words, { top: limit, signal: access.signal })).map(emailFound),
        read: async (access, id, { related }) => {
          const read = await readMail(set(), await access.token(), id, { signal: access.signal, thread: related });
          return read && emailItem(read.mail, read.thread, read.moreInThread);
        },
        follow: {
          changes: async (access, from, scope, options) => followMail(set(), await access.token(), from, scope, options, access.signal),
          items: async (access, ids) => mailItems(set(), await access.token(), ids, access.signal),
          count: async (access, scope) => countMail(set(), await access.token(), scope, access.signal),
          summary: async (access, from, scope) => listMail(set(), await access.token(), from, scope, access.signal),
          earlier: async (access, change, ids, options) => earlierMail(set(), await access.token(), change, ids, options, access.signal),
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
    retryAfter: (error) => (error instanceof MicrosoftUnreachable ? error.retryAfter : undefined),
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

/** The mailbox's folders as following keeps them for a while: each with its name and the folder it's in, those it leaves out and why, and those that hold what the owner sent. */
interface Tree {
  at: string;
  folders: [id: string, name: string, parent: string | null][];
  aside: Record<string, SetAside>;
  own: string[];
  /** The mailbox has more folders than Homing read, so those beyond aren't followed. */
  more?: true;
}

/**
 * Where following a mailbox stands, as its checkpoint keeps it: through its history by the date
 * each email arrived, from the time the next page starts at, with the emails at that very time
 * already given, and how many of them to pass over once a page holds nothing new; then, once that
 * caught up, onward by Graph's delta for each folder, with the time the filters start at, and for
 * each folder its next link, the latest email it gave in the rounds it finished, and in the one
 * under way, how many emails its delta gave since the first round from where its filter starts
 * now, and which folder a look stopped at. Either way, the folders as they were when last read.
 */
type Walk =
  | { v: 2; by: 'date'; after: string | null; seen: string[]; skip?: number; tree: Tree }
  | { v: 2; by: 'delta'; from: string; links: Record<string, string>; reached?: Record<string, string>; seen?: Record<string, string>; given?: Record<string, number>; at?: string; tree: Tree };

/** What following reads of each email: what reading one does, with its folder and headers, and without its attachments. */
const followFields = `${summaryFields},parentFolderId,toRecipients,ccRecipients,body,uniqueBody,internetMessageHeaders,isDraft`;
/** What it asks delta for, and a list it reads an item at a time: enough to know which email, when, and where. */
const lightFields = 'id,conversationId,receivedDateTime,parentFolderId,isDraft';
/** How many emails a page of history holds at most, and how many changes a page of delta, each of which is read by its id. */
const pageSize = 50;
const deltaSize = 20;
/** How many emails of a thread following lists, by sender, date, subject and folder: one page, in whatever order Graph gives it. */
const threadLength = 100;
/** The folders following leaves out, with everything in them, by their well-known names, and why. */
const asideFolders: Record<string, SetAside> = { junkemail: 'junk', deleteditems: 'deleted', drafts: 'draft', outbox: 'draft' };
/** The most folders Homing follows in a mailbox, and how long it keeps what it read of them. */
const mostFolders = 500;
const treeKept = 10 * 60_000;
/** How many empty pages of history in a row Homing follows to the next before it takes Graph to be failing. */
const emptyPages = 5;
/** How many folders one look asks for their changes, and for how long, before the next look carries on from there. */
const foldersAtOnce = 50;
const lookTime = 30_000;
/**
 * How many emails a folder's delta gives before Homing starts it again from a later time. Graph's
 * documentation says a delta with a filter returns only up to 5,000 messages, and not what happens
 * after that, so Homing stays well below it. This is from the documentation: no real mailbox has
 * shown it yet.
 */
const startAgainAfter = 2_000;
/** How Graph says, beside answering 410, that it no longer knows where a folder's changes stood. */
const forgotten = ['SyncStateNotFound', 'syncStateNotFound', 'SyncStateInvalid', 'syncStateInvalid', 'resyncRequired', 'ResyncRequired'];
const day = 24 * 60 * 60_000;

/** An email as Graph gave it, read whole, or one Graph couldn't give, with what's known of it. */
interface Fetched {
  message: Record<string, unknown>;
  unreadable?: true;
  /** Read by its id, where Graph gives an email's headers if it has any. */
  byId?: true;
}

/**
 * One page of the mailbox's changes (connectors.ts). Its history comes by the date each email
 * arrived, across all its folders, oldest first, from the start of the scope, up to its end if it
 * has one, and is done only when Graph says there is no more, since a page may hold fewer than
 * asked for, or none. Without an end, it then follows each folder with Graph's delta from a day
 * before the last email given, some folders each look, for so long, carrying on where the last one
 * stopped. Delta says only which emails arrived or changed, in no promised order, and not always
 * with more than their id, so each is read by its id, unless delta itself says it arrived before
 * the scope, and one that did is dropped. Each email comes with its thread, unless it's set aside:
 * by its folder, as a draft, or by its own headers. Asked for one at a time, it reads each email by
 * its id, and gives one Graph can't give as set aside. A look may take a time of its own, which
 * tests set shorter.
 */
export async function followMail(
  settings: MicrosoftSettings,
  access: string,
  from: string | null,
  scope: Scope,
  options: { size?: number; related?: boolean; lookMs?: number } = {},
  signal?: AbortSignal,
): Promise<Changes> {
  const kept: Walk = from ? walkOf(from) : { v: 2, by: 'date', after: null, seen: [], tree: await treeOf(settings, access, signal) };
  const tree = Date.now() - Date.parse(kept.tree.at) > treeKept ? await treeOf(settings, access, signal) : kept.tree;
  const size = Math.max(1, Math.min(Math.floor(options.size ?? pageSize), pageSize));
  const careful = size === 1;
  const given = { related: options.related ?? true, signal };
  // More folders than Homing follows: what arrives in the rest isn't given, which the run says.
  const partly = tree.more ? { partly: true as const } : {};
  if (kept.by === 'date') {
    const { fresh, there, more, after } = await arrived(settings, access, { ...kept, tree }, scope, size, careful ? lightFields : followFields, signal);
    const fetched: Fetched[] = careful ? await readEach(settings, access, fresh, true, signal) : fresh.map((message) => ({ message }));
    const changes = await changesOf(settings, access, fetched, tree, given);
    if (more) return { changes, next: JSON.stringify(there), caughtUp: false, ...partly };
    // History caught up. With an end, that's all; without one, Graph's delta carries on from a day
    // before the last email, since one that arrived around then may show in the mailbox only later.
    // What that gives again, Homing skips.
    const margin = after ? new Date(Math.max(Date.parse(after) - day, scope.since.getTime())).toISOString() : scope.since.toISOString();
    const next: Walk = scope.until ? there : { v: 2, by: 'delta', from: margin, links: {}, reached: {}, tree };
    return { changes, next: JSON.stringify(next), caughtUp: true, ...partly };
  }

  // Each folder in turn, but those left out, from where the last look stopped, until one has
  // something new, or the look has asked its share of folders, or taken its time.
  const walk = kept;
  const followed = tree.folders.map(([id]) => id).filter((id) => !tree.aside[id]).sort();
  const inTree = new Set(tree.folders.map(([id]) => id));
  const still = <T>(by: Record<string, T> | undefined) => Object.fromEntries(Object.entries(by ?? {}).filter(([id]) => inTree.has(id)));
  const [links, reached, seen, counted] = [still(walk.links), still(walk.reached), still(walk.seen), still(walk.given)];
  const there = (at?: string): string =>
    JSON.stringify({ v: 2, by: 'delta', from: walk.from, links, reached, ...(Object.keys(seen).length > 0 && { seen }), ...(Object.keys(counted).length > 0 && { given: counted }), ...(at && { at }), tree } satisfies Walk);
  const resumed = walk.at === undefined ? 0 : followed.findIndex((id) => id >= walk.at!);
  const start = resumed < 0 ? followed.length : resumed;
  const until = Date.now() + (options.lookMs ?? lookTime);
  for (let index = start; index < followed.length; index++) {
    const id = followed[index];
    // A mailbox with hundreds of folders takes several looks: the next carries on from this folder.
    if (index - start >= foldersAtOnce || Date.now() > until) return { changes: [], next: there(id), caughtUp: false, ...partly };
    const first = (from: string) => `${settings.graph}/v1.0/me/mailFolders/${encodeURIComponent(id)}/messages/delta?$select=${lightFields}&$filter=${encodeURIComponent(`receivedDateTime ge ${from}`)}`;
    // Where this folder starts again: a day before the latest email this very folder gave in a round
    // it finished, since another folder's says nothing of what this one missed, and never before
    // where following began. What comes again, Homing skips.
    const again = () => {
      const back = reached[id] ? new Date(Date.parse(reached[id]) - day).toISOString() : walk.from;
      return first(back > walk.from ? back : walk.from);
    };
    let link = links[id] ?? first(walk.from);
    let begun = Boolean(links[id]);
    for (let pages = 0; pages < 100; pages++) {
      let body: Record<string, unknown>;
      try {
        body = await graph(settings, access, link, { prefer: [immutableIds, `odata.maxpagesize=${Math.min(size, deltaSize)}`], signal });
      } catch (error) {
        if (!(error instanceof MicrosoftRefused) || !begun) throw error;
        // The folder is gone: there's nothing left in it to follow.
        if (error.status === 404) {
          delete links[id];
          break;
        }
        // Graph forgot where this folder stood: it's followed again, from a day before its own
        // latest email, so what it has to give again stays far below the most a filtered delta gives.
        if (error.status !== 410 && !forgotten.includes(error.detail ?? '')) throw error;
        delete links[id];
        delete seen[id];
        delete counted[id];
        link = again();
        begun = false;
        continue;
      }
      // Removed from the folder, or moved out of it: what Homing learned from it stays.
      const entries = listOf(body).filter((message) => !('@removed' in message) && typeof message.id === 'string');
      const nextLink = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined;
      const deltaLink = typeof body['@odata.deltaLink'] === 'string' ? body['@odata.deltaLink'] : undefined;
      if (!nextLink && !deltaLink) throw new MicrosoftRefused('graph_refused', 'no_delta_link');
      links[id] = (nextLink ?? deltaLink)!;
      // Counted from the folder's second round on: the first gives what was there already.
      if (counted[id] !== undefined) counted[id] += entries.length;
      // Delta may give no more of an email than its id and what changed, and may give one that
      // doesn't fit the filter when it's only marked read. One it gives with the time it arrived,
      // before the scope, is none of the run's, and needs no reading: hundreds of old emails marked
      // read at once come that way. Each of the others is read as it is now, by its id, and dropped
      // if it arrived before the scope.
      const within = entries.filter((entry) => !(typeof entry.receivedDateTime === 'string' && Date.parse(entry.receivedDateTime) < scope.since.getTime()));
      const read = (await readEach(settings, access, within, careful, signal)).filter((one) => {
        const at = summaryOf(one.message).at;
        return at === null || at.getTime() >= scope.since.getTime();
      });
      // The latest email this round gave counts for the folder only once the round is done: until
      // then, older ones may still be to come.
      for (const one of read) {
        const at = summaryOf(one.message).at?.toISOString();
        if (at && (!seen[id] || at > seen[id])) seen[id] = at;
      }
      if (!nextLink) {
        if (seen[id] && (!reached[id] || seen[id] > reached[id])) reached[id] = seen[id];
        delete seen[id];
        // After so many emails, the folder's delta starts again from a day before its latest, as
        // when Graph forgot it, so no filtered delta comes near the most Graph says one returns.
        if ((counted[id] ?? 0) >= startAgainAfter) {
          links[id] = again();
          delete counted[id];
        } else counted[id] ??= 0;
      }
      if (read.length) {
        const changes = await changesOf(settings, access, read, tree, given);
        // In no order Graph promises, so oldest first here.
        changes.sort((a, b) => (a.item.envelope.at?.getTime() ?? 0) - (b.item.envelope.at?.getTime() ?? 0));
        return { changes, next: there(id), caughtUp: false, ...partly };
      }
      if (!nextLink) break;
      // Pages that gave nothing the run wants, such as old emails marked read, each read by its id:
      // once the look has taken its time, the next carries on from this folder's link.
      if (Date.now() > until) return { changes: [], next: there(id), caughtUp: false, ...partly };
      link = nextLink;
      begun = true;
    }
  }
  return { changes: [], next: there(), caughtUp: true, ...partly };
}

/**
 * One page of the mailbox's emails by the date each arrived, across all its folders, oldest first,
 * from where a walk stands, with these fields: those not given before, where the walk stands after
 * it, and whether Graph says there's more.
 */
async function arrived(settings: MicrosoftSettings, access: string, walk: Extract<Walk, { by: 'date' }>, scope: Scope, size: number, fields: string, signal?: AbortSignal) {
  const start = walk.after ?? scope.since.toISOString();
  const skip = walk.skip ?? 0;
  const filter = `receivedDateTime ge ${start}${scope.until ? ` and receivedDateTime lt ${scope.until.toISOString()}` : ''}`;
  let body = await graph(
    settings,
    access,
    `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime%20asc&$top=${size}${skip ? `&$skip=${skip}` : ''}&$select=${fields}`,
    { prefer: [immutableIds, textBodies], signal },
  );
  // A page may hold nothing and still not be the last. Only its link leads on, since asking the
  // same again gives the same. One empty page after another is Graph failing, which is waited out.
  for (let empty = 0; listOf(body).length === 0 && typeof body['@odata.nextLink'] === 'string'; empty++) {
    if (empty === emptyPages) throw new MicrosoftUnreachable('Graph');
    body = await graph(settings, access, body['@odata.nextLink'], { prefer: [immutableIds, textBodies], signal });
  }
  const page = listOf(body);
  // Graph says whether there's more: a page may hold fewer than asked for, and still not be the last.
  const more = typeof body['@odata.nextLink'] === 'string';
  const fresh = page.filter((message) => !walk.seen.includes(String(message.id ?? '')));
  const received = (message: Record<string, unknown>) => summaryOf(message).at?.toISOString() ?? null;
  const last = fresh.length ? received(fresh.at(-1)!) : null;
  const same = last !== null && last === walk.after;
  const after = last ?? walk.after;
  const seen = last ? [...(same ? walk.seen : []), ...fresh.filter((message) => received(message) === last).map((message) => String(message.id ?? ''))] : walk.seen;
  // A page that held only what was given before, with more to come: the next passes over it, and
  // so do those after it, until the walk is past that moment.
  const pass = fresh.length === 0 && more ? skip + page.length : same && skip ? skip + page.length : 0;
  const there: Walk = { v: 2, by: 'date', after, seen, ...(pass && { skip: pass }), tree: walk.tree };
  return { fresh, there, more, after };
}

/** What a summary lists of each email, and how many a page of it holds: no text, so many more than a page that's read. */
const listedFields = 'id,conversationId,subject,from,receivedDateTime,parentFolderId,isDraft';
const listedSize = 500;

/**
 * One page of the mailbox's emails for a summary (connectors.ts): who sent each, when, its subject
 * and its conversation, by the date it arrived, as history is walked, and never its text. Drafts
 * and what's in junk, deleted items and the outbox are left out, as following leaves them out.
 */
export async function listMail(settings: MicrosoftSettings, access: string, from: string | null, scope: Scope, signal?: AbortSignal): Promise<{ listed: Listed[]; next: string | null }> {
  const walk: Walk = from ? walkOf(from) : { v: 2, by: 'date', after: null, seen: [], tree: await treeOf(settings, access, signal) };
  if (walk.by !== 'date') throw new MicrosoftRefused('bad_checkpoint');
  const { fresh, there, more } = await arrived(settings, access, walk, scope, listedSize, listedFields, signal);
  const listed = fresh
    .filter((message) => message.isDraft !== true && !walk.tree.aside[String(message.parentFolderId ?? '')])
    .map((message) => {
      const mail = summaryOf(message);
      return { title: mail.subject, at: mail.at, author: mail.from, thread: mail.conversationId };
    });
  return { listed, next: more ? JSON.stringify(there) : null };
}

/** These emails as they are now, by their ids, each with its thread. One that's gone is left out, and one Graph can't give comes set aside. */
export async function mailItems(settings: MicrosoftSettings, access: string, ids: string[], signal?: AbortSignal): Promise<Change[]> {
  const tree = await treeOf(settings, access, signal);
  return changesOf(settings, access, await readEach(settings, access, ids.map((id) => ({ id })), true, signal), tree, { related: true, signal });
}

/**
 * Emails of a change's thread from before it, by their ids, oldest first, each as following gives
 * it: read by its id, with the folders of the checkpoint the change's page gave, and with the thread
 * the change was listed with, so nothing is listed again. Asked for one at a time, one Graph can't
 * give comes set aside.
 */
export async function earlierMail(settings: MicrosoftSettings, access: string, change: Change, ids: string[], options: { from: string; size?: number }, signal?: AbortSignal): Promise<Change[]> {
  const fetched = await readEach(settings, access, ids.map((id) => ({ id, conversationId: change.thread })), options.size === 1, signal);
  const changes = await changesOf(settings, access, fetched, walkOf(options.from).tree, { related: false, signal });
  const { related, moreRelated } = change.item;
  return changes.map((earlier) => ({ ...earlier, item: { ...earlier.item, related, moreRelated } })).sort((a, b) => (a.item.envelope.at?.getTime() ?? 0) - (b.item.envelope.at?.getTime() ?? 0));
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
  if (walk?.v !== 2 || !['date', 'delta'].includes(walk.by) || typeof walk.tree !== 'object' || !Array.isArray(walk.tree?.folders)) throw new MicrosoftRefused('bad_checkpoint');
  return walk;
}

/**
 * Each of these emails read whole, by its id, as it is now. One that's gone is left out. One Graph
 * can't give stops the page, or, when reading carefully, comes as unreadable, with what was known of it.
 */
async function readEach(settings: MicrosoftSettings, access: string, entries: Record<string, unknown>[], careful: boolean, signal?: AbortSignal): Promise<Fetched[]> {
  const read: Fetched[] = [];
  const whole = (entry: Record<string, unknown>) =>
    graph(settings, access, `/v1.0/me/messages/${encodeURIComponent(String(entry.id))}?$select=${followFields}`, { prefer: [immutableIds, textBodies], signal });
  for (const entry of entries) {
    try {
      read.push({ message: await whole(entry), byId: true });
    } catch (error) {
      if (error instanceof MicrosoftRefused && ['ErrorItemNotFound', 'ErrorInvalidIdMalformed', 'http_404'].includes(error.detail ?? '')) continue;
      // Not what an account or Homing's settings need fixed for, and not Homing stopping: this one email.
      const thisOne = !signal?.aborted && (error instanceof MicrosoftUnreachable || (error instanceof MicrosoftRefused && error.code === 'graph_refused' && ![401, 403, 429].includes(error.status ?? 0)));
      if (!careful || !thisOne || (error instanceof MicrosoftUnreachable && error.retryAfter !== undefined)) throw error;
      // Once more, in case it was a passing fault, before it's given up as one Graph can't give.
      try {
        read.push({ message: await whole(entry), byId: true });
      } catch (second) {
        if (signal?.aborted || !(second instanceof MicrosoftUnreachable || second instanceof MicrosoftRefused)) throw second;
        read.push({ message: entry, unreadable: true });
      }
    }
  }
  return read;
}

/**
 * The emails as changes, each with its thread, listed once for each conversation, and with what
 * that list shows from before it, unless it's set aside or quotes an earlier email itself. An email that came without its headers, in a list, is asked for them by its id before it's
 * taken for a person's mail; what its owner sent has none.
 */
async function changesOf(
  settings: MicrosoftSettings,
  access: string,
  fetched: Fetched[],
  tree: Tree,
  { related, signal }: { related: boolean; signal?: AbortSignal },
): Promise<Change[]> {
  const names = new Map(tree.folders.map(([id, name]) => [id, name]));
  let headerless = 0;
  const found: { mail: Mail; folder: string | null; setAside?: SetAside }[] = [];
  for (const { message, unreadable, byId } of fetched) {
    const summary = summaryOf(message);
    const folder = typeof message.parentFolderId === 'string' ? message.parentFolderId : null;
    const mail: Mail = { ...summary, to: addressesOf(message.toRecipients), cc: addressesOf(message.ccRecipients), body: textIn(message.body) ?? '', unique: textIn(message.uniqueBody), attachments: [] };
    let setAside: SetAside | undefined = unreadable ? 'unreadable' : message.isDraft === true ? 'draft' : ((folder && tree.aside[folder]) || undefined);
    if (!setAside && !(folder && tree.own.includes(folder))) {
      let headers = headersOf(message.internetMessageHeaders);
      if (headers.size === 0 && !byId) {
        const again = await graph(settings, access, `/v1.0/me/messages/${encodeURIComponent(summary.id)}?$select=internetMessageHeaders`, { prefer: [immutableIds], signal });
        headers = headersOf(again.internetMessageHeaders);
      }
      if (headers.size === 0) headerless++;
      setAside = automatedEmail(headers, summary.from);
    }
    found.push({ mail, folder, setAside });
  }
  // Never silently: without its headers an email can't be told from a newsletter, so it's read as a person's.
  if (headerless) console.warn(`microsoft: ${headerless} ${headerless === 1 ? 'email' : 'emails'} came without headers, even by id, so Homing couldn’t check them for newsletters`);
  const conversations = related ? [...new Set(found.filter((one) => !one.setAside && one.mail.conversationId).map((one) => one.mail.conversationId!))] : [];
  const threads = new Map<string, { thread: (MailSummary & { folder: string | null })[]; more: boolean }>();
  for (const conversation of conversations) {
    const body = await graph(settings, access, `/v1.0/me/messages?$filter=${encodeURIComponent(`conversationId eq '${conversation.replace(/'/g, "''")}'`)}&$top=${threadLength}&$select=${summaryFields},parentFolderId`, { prefer: [immutableIds], signal });
    const listed = listOf(body).map((message) => ({ ...summaryOf(message), folder: typeof message.parentFolderId === 'string' ? message.parentFolderId : null }));
    threads.set(conversation, { thread: listed.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)), more: typeof body['@odata.nextLink'] === 'string' });
  }
  const named = (folder: string | null) => (folder ? (names.get(folder) ?? null) : null);
  return found.map(({ mail, folder, setAside }) => {
    const thread = (!setAside && mail.conversationId && threads.get(mail.conversationId)) || { thread: [], more: false };
    const item = emailItem(mail, thread.thread, thread.more);
    // What the thread's list shows from before this email, newest first, outside the folders left out with everything in them, unless it quotes an earlier one and so carries its thread itself.
    const earlier = (carriesEarlier(mail.body) ? [] : thread.thread)
      .filter((other) => other.at !== null && mail.at !== null && other.at < mail.at && !(other.folder && tree.aside[other.folder]))
      .reverse()
      .map((other) => ({ id: other.id, folder: named(other.folder) }));
    return { item, version: setAside === 'unreadable' ? 'unreadable' : contentVersion(item), thread: mail.conversationId, folder: named(folder), ...(earlier.length > 0 && { earlier }), ...(setAside && { setAside }) };
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

/**
 * The mailbox's folders: the top ones and those in them, as far as Homing follows, each with its
 * name and the folder it's in, and whether there are more than that. Junk, deleted mail, drafts
 * and the outbox are left out with every folder in them, and sent mail's folders hold what the
 * owner wrote.
 */
async function treeOf(settings: MicrosoftSettings, access: string, signal?: AbortSignal): Promise<Tree> {
  const folders: Tree['folders'] = [];
  const waiting: [path: string, parent: string | null][] = [['/v1.0/me/mailFolders?$top=250&$select=id,displayName,childFolderCount', null]];
  while (waiting.length && folders.length < mostFolders) {
    const [path, parent] = waiting.shift()!;
    const body = await graph(settings, access, path, { signal });
    for (const folder of listOf(body)) {
      if (typeof folder.id !== 'string' || folders.some(([id]) => id === folder.id)) continue;
      folders.push([folder.id, typeof folder.displayName === 'string' ? folder.displayName : '', parent]);
      if (typeof folder.childFolderCount === 'number' && folder.childFolderCount > 0) {
        waiting.push([`/v1.0/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?$top=250&$select=id,displayName,childFolderCount`, folder.id]);
      }
    }
    if (typeof body['@odata.nextLink'] === 'string') waiting.push([body['@odata.nextLink'], parent]);
  }
  const known = async (name: string): Promise<string | undefined> => {
    try {
      const folder = await graph(settings, access, `/v1.0/me/mailFolders/${name}?$select=id`, { signal });
      return typeof folder.id === 'string' ? folder.id : undefined;
    } catch (error) {
      // A mailbox without one, such as without an outbox, has nothing there to leave out.
      if (!(error instanceof MicrosoftRefused && error.code === 'no_mailbox')) throw error;
      return undefined;
    }
  };
  /** A folder and every folder in it. */
  const under = (top: string): string[] => [top, ...folders.filter(([, , parent]) => parent === top).flatMap(([id]) => under(id))];
  const aside: Record<string, SetAside> = {};
  for (const [name, why] of Object.entries(asideFolders)) {
    const id = await known(name);
    if (id) for (const folder of under(id)) aside[folder] = why;
  }
  const sent = await known('sentitems');
  return { at: new Date().toISOString(), folders, aside, own: sent ? under(sent) : [], ...(waiting.length > 0 && { more: true as const }) };
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
  if (response.status >= 500 || response.status === 429) throw new MicrosoftUnreachable('Graph', waitOf(response.headers.get('retry-after')));
  const code = typeof body.error?.code === 'string' ? body.error.code : `http_${response.status}`;
  // An account without an Exchange Online mailbox, such as one only for signing in.
  if (path.includes('/mailFolders/') && (response.status === 404 || code === 'MailboxNotEnabledForRESTAPI')) throw new MicrosoftRefused('no_mailbox', code, response.status);
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
