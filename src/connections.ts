// Connections and places (spec §7, guarantee 5). A person connects an
// account where it belongs, from inside a space: Homing sends them to sign
// in on the system's own page, and the space gets a place on their private
// side, such as their mailbox, or one they choose of those the account
// reaches. The account's sign-in is sealed with the vault and kept apart,
// where only its owner's own use reaches it, never their assistant's.
// Revoking an account stops it everywhere at once; removing a place stops it
// in one space. What's particular to each system is its connector's
// (connectors.ts); this is the same for all of them.

import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import postgres from 'postgres';
import type { Access, Connector, Connectors, PlaceKind, Tokens } from './connectors.ts';
import { personOf, withPrincipal, type Session, type Sql } from './db.ts';
import { accessibleSpaces, spaceView } from './spaces.ts';
import { SealBroken, type Vault } from './vault.ts';
import type { App } from './web.ts';

/** A connection, as its owner sees it. Never with its credentials. */
export interface Connection {
  id: string;
  /** The system's connector, such as microsoft. */
  provider: string;
  /** The account's address and name, as the system gives them. */
  address: string;
  name: string | null;
  /** What the system allowed Homing, such as Mail.Read. */
  scopes: string[];
  status: 'connected' | 'needs attention';
  connectedAt: Date;
  refreshedAt: Date;
}

/** A place on the person's private side of a space, and the connection that reaches it. */
export interface PlaceInSpace {
  id: string;
  /** What kind of place it is, such as a mailbox. */
  kind: string;
  addedAt: Date;
  connection: Connection;
  /** The other spaces the person uses the same connection in, of those they can open. */
  elsewhere: { id: string; name: string; personal: boolean }[];
}

interface ConnectionRow {
  connectionId: string;
  provider: string;
  address: string;
  name: string | null;
  scopes: string[];
  status: Connection['status'];
  connectedAt: Date;
  refreshedAt: Date;
}

function connectionOf(row: ConnectionRow): Connection {
  const { connectionId, provider, address, name, scopes, status, connectedAt, refreshedAt } = row;
  return { id: connectionId, provider, address, name, scopes, status, connectedAt, refreshedAt };
}

/** What Homing may do with a connection, by what the system allowed it, as its connector words it: "read mail". */
export function abilitiesOf(connectors: Connectors, connection: Pick<Connection, 'provider' | 'scopes'>): string[] {
  const abilities = connectors.get(connection.provider)?.abilities ?? {};
  return connection.scopes.flatMap((scope) => (Object.hasOwn(abilities, scope) ? [abilities[scope]] : []));
}

/** A kind of place of the connector's, by its name, which comes from the database. */
export function kindOf(connector: Connector | undefined, kind: string): PlaceKind | undefined {
  return connector && Object.hasOwn(connector.kinds, kind) ? connector.kinds[kind] : undefined;
}

/**
 * The person's own places in a space, with their connections. Never anyone else's: Homing asks
 * only for the person's, and row-level security shows them nothing more.
 */
export async function placesIn(s: Session, spaceId: string): Promise<PlaceInSpace[]> {
  const person = personOf(s.principal);
  if (!person) return [];
  const rows = await s.tx<(ConnectionRow & { id: string; kind: string; addedAt: Date })[]>`
    select p.id, p.kind, p.added_at, c.id as connection_id, c.provider, c.address, c.name, c.scopes, c.status, c.connected_at, c.refreshed_at
    from places p join connections c on c.id = p.connection_id
    where p.space_id = ${spaceId}::uuid and p.private_to = ${person}::uuid and p.removed_at is null and c.revoked_at is null
    order by p.added_at, p.id
  `;
  if (rows.length === 0) return [];
  // Where else the person uses each connection: only their own places, in spaces they can open.
  const others = await s.tx<{ connectionId: string; id: string; name: string; personal: boolean }[]>`
    select o.connection_id, sp.id, sp.name, sp.private_to is not null and sp.parent_id is null as personal
    from places o join spaces sp on sp.id = o.space_id
    where o.connection_id in ${s.tx(rows.map((row) => row.connectionId))} and o.private_to = ${person}::uuid and o.removed_at is null
      and o.space_id <> ${spaceId}::uuid and o.space_id in (${accessibleSpaces(s)})
    order by o.added_at, o.id
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    addedAt: row.addedAt,
    connection: connectionOf(row),
    elsewhere: others.filter((other) => other.connectionId === row.connectionId).map(({ id, name, personal }) => ({ id, name, personal })),
  }));
}

/** The person's accounts, each with the spaces it's used in that they can open. */
export async function connectionsOf(s: Session): Promise<(Connection & { places: { id: string; spaceId: string }[] })[]> {
  const person = personOf(s.principal);
  if (!person) return [];
  const connections = await s.tx<ConnectionRow[]>`
    select c.id as connection_id, c.provider, c.address, c.name, c.scopes, c.status, c.connected_at, c.refreshed_at
    from connections c
    where c.person_id = ${person}::uuid and c.revoked_at is null
    order by c.connected_at, c.id
  `;
  if (connections.length === 0) return [];
  const places = await s.tx<{ id: string; connectionId: string; spaceId: string }[]>`
    select p.id, p.connection_id, p.space_id from places p
    where p.private_to = ${person}::uuid and p.removed_at is null
      and p.connection_id in ${s.tx(connections.map((row) => row.connectionId))}
    order by p.added_at, p.id
  `;
  return connections.map((row) => ({
    ...connectionOf(row),
    places: places.filter((place) => place.connectionId === row.connectionId).map(({ id, spaceId }) => ({ id, spaceId })),
  }));
}

/** Stops using a place in its space. The account stays connected. Whether there was one of the person's to remove. */
export async function removePlace(s: Session, placeId: string): Promise<boolean> {
  const [{ removed }] = await s.tx<{ removed: boolean }[]>`select remove_place(${placeId}::uuid) as removed`;
  return removed;
}

/** Revokes the person's account: its sign-in is deleted, and everything relying on it stops at once. */
export async function revokeConnection(s: Session, connectionId: string): Promise<boolean> {
  const [{ revoked }] = await s.tx<{ revoked: boolean }[]>`select revoke_connection(${connectionId}::uuid) as revoked`;
  return revoked;
}

/** Where a sealed credential is kept, which it's bound to: its connection, and which token it is. */
const sealedFor = (connectionId: string, token: 'access' | 'refresh') => `connection ${connectionId} ${token} token`;

/** Seals an account's tokens and keeps them with its connection. */
async function keepTokens(s: Session, vault: Vault, connectionId: string, tokens: Tokens): Promise<void> {
  await s.tx`
    select keep_credentials(
      ${connectionId}::uuid,
      ${vault.seal(tokens.refresh, sealedFor(connectionId, 'refresh'))},
      ${vault.seal(tokens.access, sealedFor(connectionId, 'access'))},
      ${tokens.expiresAt}
    )
  `;
}

/** A connection Homing can't use now: revoked or not the person's, or waiting for them to sign in again. */
export class ConnectionUnusable extends Error {
  override name = 'ConnectionUnusable';
  readonly reason: 'gone' | 'needs attention' | 'not set up';
  constructor(reason: ConnectionUnusable['reason']) {
    super(
      reason === 'gone'
        ? 'There’s no such connection.'
        : reason === 'needs attention'
          ? 'The account needs its owner to sign in again before Homing can use it.'
          : 'This Homing isn’t set up to connect to that system any more.',
    );
    this.reason = reason;
  }
}

/** What using a connection needs from the server. */
export interface Broker {
  sql: Sql;
  vault: Vault;
  connectors: Connectors;
}

/** One use of a connection, through one of the person's places, recorded as it's made (spec §8). */
export interface Use {
  place: string;
  space: string;
  /** What Homing did there: searched it, or read something in it. */
  operation: 'search' | 'read';
  /** The assistant it's for, such as Claude. */
  agent?: string;
}

/** The system didn't answer in time, or Homing stopped waiting for it. Trying again later may work. */
export class Unanswered extends Error {
  override name = 'Unanswered';
  constructor() {
    super('The system didn’t answer in time.');
  }
}

type Outcome = { token: string } | { unusable: ConnectionUnusable['reason'] };

/**
 * A current access token for the person's own connection, for Homing's own use on their behalf.
 * It never goes to a model. It runs as the person, never as their assistant, which the database
 * refuses. A use, such as searching their mail, is recorded before the token is handed out, so
 * none goes unrecorded.
 *
 * A stored token with two minutes left is used as it is, from one short transaction. Otherwise
 * Homing refreshes it, and never inside a transaction: the system may take a while, and nothing
 * else should wait on that. Callers in this process that need the same connection meanwhile share
 * one refresh, which finishes even after they stopped waiting, so the next use finds its tokens. The new tokens are kept only
 * while the sign-in is still the one that was refreshed, so a refresh that finished meanwhile, a
 * new sign-in or revoking wins. When the system refuses the refresh, because consent was revoked or
 * the sign-in expired, or the sealed tokens don't open, the connection needs attention, which the
 * person sees, and it isn't tried again until they sign in again. Renewing skips the stored token,
 * for one the system refused before it expired.
 */
export async function accessToken(
  broker: Broker,
  person: string,
  connectionId: string,
  use?: Use,
  { renew = false, signal }: { renew?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  const held = await withPrincipal(broker.sql, { person }, async (s): Promise<Outcome | { refresh: Uint8Array; provider: string }> => {
    // Its connector only from a connection of theirs, which credentials_of hands out nothing for otherwise.
    const [held] = await s.tx<{ status: Connection['status']; refreshToken: Uint8Array; accessToken: Uint8Array | null; accessExpiresAt: Date | null; provider: string }[]>`
      select k.*, c.provider from credentials_of(${connectionId}::uuid) k join connections c on c.id = ${connectionId}::uuid
    `;
    if (!held) return { unusable: 'gone' };
    if (held.status === 'needs attention') return { unusable: 'needs attention' };
    if (!renew && held.accessToken && held.accessExpiresAt && held.accessExpiresAt.getTime() > Date.now() + 2 * 60_000) {
      try {
        const token = broker.vault.open(held.accessToken, sealedFor(connectionId, 'access'));
        await recordUse(s, connectionId, use);
        return { token };
      } catch (error) {
        // One that doesn't open is refreshed instead, and the sign-in shows whether that opens.
        if (!(error instanceof SealBroken)) throw error;
      }
    }
    return { refresh: held.refreshToken, provider: held.provider };
  });
  if ('token' in held) return held.token;
  if ('unusable' in held) throw new ConnectionUnusable(held.unusable);

  const outcome = await sharedRefresh(connectionId, () => refreshed(broker, person, connectionId, held.provider, held.refresh), signal);
  if ('unusable' in outcome) throw new ConnectionUnusable(outcome.unusable);
  try {
    if (use) await withPrincipal(broker.sql, { person }, (s) => recordUse(s, connectionId, use));
  } catch (error) {
    // The place was removed, or the person can't open its space any more, while it refreshed.
    if (error instanceof postgres.PostgresError && error.code === '42501') throw new ConnectionUnusable('gone');
    throw error;
  }
  return outcome.token;
}

async function recordUse(s: Session, connectionId: string, use: Use | undefined) {
  if (!use) return;
  const person = personOf(s.principal) ?? null;
  await s.tx`
    insert into connection_uses (connection_id, place_id, space_id, private_to, operation, agent)
    values (${connectionId}::uuid, ${use.place}::uuid, ${use.space}::uuid, ${person}::uuid, ${use.operation}, ${use.agent ?? null})
  `;
}

/** Refreshes under way in this process, one for each connection, until they settle. */
const refreshing = new Map<string, Promise<Outcome>>();

/**
 * Waits for the connection's refresh under way, or starts one. A caller whose signal fires stops
 * waiting, and the refresh carries on within the connector's own time limit, so its new tokens are
 * kept for the next use, which joins it meanwhile.
 */
function sharedRefresh(connectionId: string, start: () => Promise<Outcome>, signal?: AbortSignal): Promise<Outcome> {
  let outcome = refreshing.get(connectionId);
  if (!outcome) {
    const started: Promise<Outcome> = start().finally(() => {
      if (refreshing.get(connectionId) === started) refreshing.delete(connectionId);
    });
    // However it ends, even after everyone stopped waiting.
    started.catch(() => {});
    refreshing.set(connectionId, started);
    outcome = started;
  }
  if (!signal) return outcome;
  const settled = outcome;
  return new Promise<Outcome>((resolve, reject) => {
    const gaveUp = () => reject(new Unanswered());
    if (signal.aborted) return gaveUp();
    signal.addEventListener('abort', gaveUp, { once: true });
    settled.then(
      (result) => {
        signal.removeEventListener('abort', gaveUp);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', gaveUp);
        reject(error);
      },
    );
  });
}

/**
 * Refreshes a connection's sign-in, outside any transaction, and keeps the new tokens only while
 * the sealed refresh token is still the one used. Refused, it marks the connection as needing
 * attention on the same condition, so it never blames a sign-in that came after.
 */
async function refreshed(broker: Broker, person: string, connectionId: string, provider: string, used: Uint8Array): Promise<Outcome> {
  const needsAttention = async (log: string): Promise<Outcome> => {
    let marked: boolean;
    try {
      [{ marked }] = await withPrincipal(broker.sql, { person }, (s) => s.tx<{ marked: boolean }[]>`
        select connection_needs_attention(${connectionId}::uuid, ${used}) as marked
      `);
    } catch (error) {
      // Revoked meanwhile: there's nothing left to mark.
      if (error instanceof postgres.PostgresError && error.code === '42501') return { unusable: 'gone' };
      throw error;
    }
    // Someone signed in again meanwhile, so the next use tries that.
    if (!marked) throw new Unanswered();
    console.error(log);
    return { unusable: 'needs attention' };
  };
  let kept: string;
  try {
    kept = broker.vault.open(used, sealedFor(connectionId, 'refresh'));
  } catch (error) {
    if (!(error instanceof SealBroken)) throw error;
    return needsAttention('connections: a sign-in didn’t open with HOMING_SECRET, so it needs attention');
  }
  const connector = broker.connectors.get(provider);
  if (!connector?.ready) return { unusable: 'not set up' };
  let fresh: Tokens;
  try {
    fresh = await connector.auth.refresh(kept);
  } catch (error) {
    const meaning = connector.refused(error);
    if (meaning === 'sign in again') {
      return needsAttention(`connections: ${connector.vendor} refused refreshing a sign-in, so it needs attention (${messageOf(error)})`);
    }
    // Homing's own settings are wrong, which no one person can fix, so their connections stay as they are.
    if (meaning === 'homing settings') console.error(configurationProblem(connector, error));
    throw error;
  }
  try {
    await withPrincipal(broker.sql, { person }, (s) => s.tx`
      select keep_refreshed(
        ${connectionId}::uuid, ${used},
        ${broker.vault.seal(fresh.refresh, sealedFor(connectionId, 'refresh'))},
        ${broker.vault.seal(fresh.access, sealedFor(connectionId, 'access'))},
        ${fresh.expiresAt}
      )
    `);
  } catch (error) {
    // Revoked meanwhile: nothing is kept, and nothing is used.
    if (error instanceof postgres.PostgresError && error.code === '42501') return { unusable: 'gone' };
    throw error;
  }
  // Kept or not, the token the system just gave works.
  return { token: fresh.access };
}

/**
 * Runs fn with access to the person's own connection: a token, taken when the connector asks for
 * it, after the use is recorded. When the system refuses a token before it expires, such as after
 * the person withdrew their consent, one new sign-in finds out whether it still works, and marks
 * the connection as needing attention if it doesn't.
 */
export async function using<T>(
  broker: Broker,
  connector: Connector,
  person: string,
  place: { connection: string; resource: string },
  use: Use | undefined,
  signal: AbortSignal,
  fn: (access: Access) => Promise<T>,
): Promise<T> {
  const access = (renew: boolean): Access => {
    let token: Promise<string> | undefined;
    return {
      resource: place.resource,
      signal,
      // The renewal is part of the same use, which is already recorded.
      token: () => (token ??= accessToken(broker, person, place.connection, renew ? undefined : use, { renew, signal })),
    };
  };
  try {
    return await fn(access(false));
  } catch (error) {
    if (connector.refused(error) !== 'renew') throw error;
    return fn(access(true));
  }
}

/** An error's message for the log. A connector's never holds a token. */
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** For whoever runs Homing, when the system refuses Homing itself, such as for a certificate it doesn't know. */
function configurationProblem(connector: Connector, error: unknown): string {
  return `connections: ${connector.vendor} refused this Homing itself (${messageOf(error)}). ${connector.settings}`;
}

/** How long listing the places an account reaches may take. */
const discoverTimeLimit = 10_000;

/**
 * The places of a kind that the person's account reaches, for them to choose from, as the system
 * lists them now. Undefined when the connection isn't theirs, or the kind's places aren't chosen.
 */
export async function placesToChoose(broker: Broker, person: string, connectionId: string, kind: string): Promise<{ resource: string; name: string }[] | undefined> {
  const [connection] = await withPrincipal(broker.sql, { person }, (s) => s.tx<{ provider: string; account: string }[]>`
    select provider, account from connections where id = ${connectionId}::uuid and person_id = ${person}::uuid and revoked_at is null
  `);
  const connector = connection && broker.connectors.get(connection.provider);
  const discover = kindOf(connector, kind)?.discover;
  if (!connector || !discover) return undefined;
  if (!connector.ready) throw new ConnectionUnusable('not set up');
  return using(broker, connector, person, { connection: connectionId, resource: connection.account }, undefined, AbortSignal.timeout(discoverTimeLimit), discover);
}

/**
 * Adds a place the person chose in a space, on their private side there: one their account
 * reaches now, as the system lists them. The place's id, or undefined when the space isn't one
 * they can open, or the place isn't one they can choose.
 */
export async function choosePlace(broker: Broker, person: string, spaceId: string, connectionId: string, kind: string, resource: string): Promise<string | undefined> {
  if (!(await withPrincipal(broker.sql, { person }, (s) => spaceView(s, spaceId)))) return undefined;
  const chosen = (await placesToChoose(broker, person, connectionId, kind))?.find((place) => place.resource === resource);
  if (!chosen) return undefined;
  return withPrincipal(broker.sql, { person, direct: true }, async (s) => {
    const [{ id }] = await s.tx<{ id: string }[]>`select add_place(${spaceId}::uuid, ${connectionId}::uuid, ${kind}, ${chosen.resource}, ${chosen.name}) as id`;
    return id;
  });
}

/** Connecting refused before the system's page, with a message to show. */
export class ConnectRefused extends Error {
  override name = 'ConnectRefused';
}

/** An attempt to connect, between sending the person to the system's page and their coming back. */
interface Attempt {
  person: string;
  /** The sign-in session it started in, which it has to come back to. */
  session: string;
  space: string;
  /** The system it's for, whose page it has to come back from. */
  connector: string;
  verifier: string;
  nonce: string;
  /** Signing in again for one of their connections, which the same account has to come back for. */
  again?: { connection: string; tenant: string; account: string };
}

const attemptKey = (state: string) => `homing-connect:${state}`;
const attemptMinutes = 10;

/**
 * Starts connecting an account in a space, such as a Microsoft 365 mailbox: the address of the
 * system's sign-in page, for this attempt only, or undefined when the person can't open the space.
 * Signing in again for a connection of theirs suggests its account.
 */
export async function startConnecting(app: App, who: { person: string; session: string }, spaceId: string, connector: Connector, again?: string): Promise<URL | undefined> {
  const found = await withPrincipal(app.sql, { person: who.person }, async (s) => {
    if (!(await spaceView(s, spaceId))) return undefined;
    if (!again) return {};
    const [connection] = await s.tx<{ id: string; tenant: string; account: string; address: string }[]>`
      select id, tenant, account, address from connections
      where id = ${again}::uuid and person_id = ${who.person}::uuid and provider = ${connector.id} and revoked_at is null
    `;
    return connection ? { again: connection } : {};
  });
  if (!found) return undefined;
  if (!connector.ready) throw new ConnectRefused(`${connector.name} isn’t set up on this Homing.`);

  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const attempt: Attempt = {
    person: who.person,
    session: who.session,
    space: spaceId,
    connector: connector.id,
    verifier,
    nonce,
    again: found.again && { connection: found.again.id, tenant: found.again.tenant, account: found.again.account },
  };
  // Attempts nobody came back from go once they've expired.
  await app.authPool.query(`delete from verification where identifier like 'homing-connect:%' and "expiresAt" < now()`);
  await app.authPool.query(`insert into verification (identifier, value, "expiresAt") values ($1, $2, now() + make_interval(mins => $3))`, [
    attemptKey(state),
    JSON.stringify(attempt),
    attemptMinutes,
  ]);
  return connector.auth.signIn({
    redirectUri: callbackAddress(app, connector),
    state,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    nonce,
    loginHint: found.again?.address,
  });
}

/** Where the system sends the person back to this Homing, as its app registration has it. */
const callbackAddress = (app: App, connector: Connector) => new URL(connector.auth.callback, app.url).toString();

/** The attempt a state names, used up in the same statement that finds it, so a callback works once. */
async function takeAttempt(app: App, state: string): Promise<Attempt | undefined> {
  if (!state || state.length > 200) return undefined;
  const { rows } = await app.authPool.query<{ value: string; current: boolean }>(
    `delete from verification where identifier = $1 returning value, "expiresAt" > now() as current`,
    [attemptKey(state)],
  );
  return rows[0]?.current ? (JSON.parse(rows[0].value) as Attempt) : undefined;
}

/**
 * Where the system sends the person back, such as Microsoft. The attempt must be one this person
 * started, in this sign-in session, for this system, in the last ten minutes, and is used up. Then
 * Homing redeems the code with the attempt's PKCE verifier, and the connector checks what it must,
 * such as the ID token, and says who the account is and which places connecting adds, such as its
 * mailbox, once it can reach them. Homing keeps the connection, those places and the sealed
 * sign-in, in one transaction. The person lands back on the space's Connections, with what
 * happened; nothing the system said goes into the address.
 */
export async function finishConnecting(app: App, connector: Connector, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const go = (to: string) => {
    res.writeHead(302, { location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end();
  };
  if (req.method !== 'GET' || !connector.ready) {
    res.writeHead(404).end();
    return;
  }
  const query = new URL(req.url ?? '/', app.url).searchParams;
  const session = await app.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  const attempt = await takeAttempt(app, query.get('state') ?? '');
  // A state that isn't this person's, from this session and for this system, says nothing about where it came from.
  if (!session || !attempt || attempt.connector !== connector.id || attempt.session !== session.session.id || attempt.person !== session.user.id) {
    return go('/account?connection=expired');
  }
  const back = (outcome: string) => go(`/spaces/${attempt.space}/connections?connection=${outcome}`);

  const error = query.get('error');
  if (error) {
    // The person said no on the system's page, or their organization hasn't allowed Homing.
    const declined = ['access_denied', 'consent_required', 'interaction_required'].includes(error);
    if (!declined) console.error(`connections: ${connector.vendor} didn’t sign in (${error.replace(/[^\w.-]/g, '').slice(0, 60)})`);
    return back(declined ? 'declined' : 'failed');
  }
  const code = query.get('code');
  if (!code) return back('failed');

  try {
    const grant = await connector.auth.redeem({ code, verifier: attempt.verifier, redirectUri: callbackAddress(app, connector), nonce: attempt.nonce });
    // Signing in again with another account fixes nothing, and connects nothing new either.
    if (attempt.again && (grant.tenant !== attempt.again.tenant || grant.account !== attempt.again.account)) return back('another-account');
    const account = await connector.auth.account(grant);
    await withPrincipal(app.sql, { person: attempt.person, direct: true }, async (s) => {
      const [{ id }] = await s.tx<{ id: string }[]>`
        select connect_account(
          ${attempt.space}::uuid, ${connector.id}, ${grant.tenant}, ${grant.account}, ${account.address}, ${account.name}, ${s.tx.array(grant.scopes)}::text[]
        ) as id
      `;
      for (const place of account.places) {
        await s.tx`select add_place(${attempt.space}::uuid, ${id}::uuid, ${place.kind}, ${place.resource}, null)`;
      }
      await keepTokens(s, app.vault, id, grant.tokens);
    });
    return back('connected');
  } catch (error) {
    const meaning = connector.refused(error);
    if (meaning === 'try later') return back('unreachable');
    if (meaning) {
      console.error(meaning === 'homing settings' ? configurationProblem(connector, error) : `connections: connecting a ${connector.vendor} account failed (${messageOf(error)})`);
      return back(connector.auth.notice?.(error) ?? 'failed');
    }
    // The space can't be opened any more.
    if (error instanceof postgres.PostgresError && error.code === '42501') return back('failed');
    throw error;
  }
}
