// Connections and places (spec §7, guarantee 5). A person connects an
// account where it belongs, from inside a space: Homing sends them to sign
// in on the system's own page, and the space gets a place on their private
// side, such as their mailbox. The account's sign-in is sealed with the vault
// and kept apart, where only its owner's own use reaches it, never their
// assistant's. Revoking an account stops it everywhere at once; removing a
// place stops it in one space.

import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import postgres from 'postgres';
import { personOf, withPrincipal, type Session, type Sql } from './db.ts';
import { MicrosoftRefused, MicrosoftUnreachable, redeem, redirectUri, refresh, signInAddress, whoIs, type MicrosoftSettings, type Tokens } from './microsoft.ts';
import { accessibleSpaces, spaceView } from './spaces.ts';
import { SealBroken, type Vault } from './vault.ts';
import type { App } from './web.ts';

/** What Homing may do through an account, by the permission it was granted. */
const abilities: Record<string, string> = { 'Mail.Read': 'read mail' };

/** A connection, as its owner sees it. Never with its credentials. */
export interface Connection {
  id: string;
  /** The system, such as Microsoft 365. */
  service: string;
  /** The account's address and name, as the system gives them. */
  address: string;
  name: string | null;
  /** What Homing may do with it, such as "read mail". */
  can: string[];
  status: 'connected' | 'needs attention';
  connectedAt: Date;
  refreshedAt: Date;
}

/** A place on the person's private side of a space, and the connection that reaches it. */
export interface Place {
  id: string;
  kind: 'mailbox';
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
  return {
    id: row.connectionId,
    service: row.provider === 'microsoft' ? 'Microsoft 365' : row.provider,
    address: row.address,
    name: row.name,
    can: row.scopes.flatMap((scope) => (abilities[scope] ? [abilities[scope]] : [])),
    status: row.status,
    connectedAt: row.connectedAt,
    refreshedAt: row.refreshedAt,
  };
}

/**
 * The person's own places in a space, with their connections. Never anyone else's: Homing asks
 * only for the person's, and row-level security shows them nothing more.
 */
export async function placesIn(s: Session, spaceId: string): Promise<Place[]> {
  const person = personOf(s.principal);
  if (!person) return [];
  const rows = await s.tx<(ConnectionRow & { id: string; kind: 'mailbox'; addedAt: Date })[]>`
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

/** What reading through a connection needs from the server. */
export interface Broker {
  sql: Sql;
  vault: Vault;
  microsoft?: MicrosoftSettings;
}

/** One use of a connection, through one of the person's places, recorded as it's made (spec §8). */
export interface Use {
  place: string;
  space: string;
  operation: 'search mail' | 'read mail';
  /** The assistant it's for, such as Claude. */
  agent?: string;
}

/**
 * A current access token for the person's own connection, for Homing's own use on their behalf.
 * It never goes to a model. A token close to expiring is refreshed first, one refresh at a time
 * for each connection. When Microsoft refuses the refresh, because consent was revoked or the
 * sign-in expired, or the sealed tokens don't open, the connection needs attention, which the
 * person sees, and it isn't tried again until they sign in again. It runs as the person, never
 * as their assistant, which the database refuses. A use, such as searching their mail, is
 * recorded with the token, in the same transaction, so none goes unrecorded. Renewing skips the
 * stored token, for one the system refused before it expired.
 */
export async function accessToken(broker: Broker, person: string, connectionId: string, use?: Use, { renew = false }: { renew?: boolean } = {}): Promise<string> {
  type Outcome = { token: string } | { unusable: ConnectionUnusable['reason'] };
  const outcome = await withPrincipal(broker.sql, { person }, async (s): Promise<Outcome> => {
    const [held] = await s.tx<{ status: Connection['status']; refreshToken: Uint8Array; accessToken: Uint8Array | null; accessExpiresAt: Date | null }[]>`
      select * from credentials_of(${connectionId}::uuid)
    `;
    if (!held) return { unusable: 'gone' };
    if (held.status === 'needs attention') return { unusable: 'needs attention' };
    const used = async (token: string): Promise<Outcome> => {
      if (use) {
        await s.tx`
          insert into connection_uses (connection_id, place_id, space_id, private_to, operation, agent)
          values (${connectionId}::uuid, ${use.place}::uuid, ${use.space}::uuid, ${person}::uuid, ${use.operation}, ${use.agent ?? null})
        `;
      }
      return { token };
    };
    try {
      if (!renew && held.accessToken && held.accessExpiresAt && held.accessExpiresAt.getTime() > Date.now() + 2 * 60_000) {
        return await used(broker.vault.open(held.accessToken, sealedFor(connectionId, 'access')));
      }
      const kept = broker.vault.open(held.refreshToken, sealedFor(connectionId, 'refresh'));
      if (!broker.microsoft) return { unusable: 'not set up' };
      const fresh = await refresh(broker.microsoft, kept);
      await keepTokens(s, broker.vault, connectionId, fresh);
      return await used(fresh.access);
    } catch (error) {
      if (error instanceof SealBroken || (error instanceof MicrosoftRefused && error.signInAgain)) {
        if (error instanceof MicrosoftRefused) console.error(`connections: Microsoft refused refreshing a sign-in, so it needs attention (${error.message})`);
        else console.error('connections: a sign-in didn’t open with HOMING_SECRET, so it needs attention');
        await s.tx`select connection_needs_attention(${connectionId}::uuid)`;
        return { unusable: 'needs attention' };
      }
      // Homing's own settings are wrong, which no one person can fix, so their connections stay as they are.
      if (error instanceof MicrosoftRefused && error.homingItself) console.error(configurationProblem(error));
      throw error;
    }
  });
  if ('token' in outcome) return outcome.token;
  throw new ConnectionUnusable(outcome.unusable);
}

/** For whoever runs Homing, when Microsoft refuses Homing itself, such as for a certificate it doesn't know. */
function configurationProblem(error: MicrosoftRefused): string {
  return `connections: Microsoft refused this Homing itself (${error.message}). Check MICROSOFT_CLIENT_ID, MICROSOFT_TENANT, and MICROSOFT_CERTIFICATE or MICROSOFT_CLIENT_SECRET, and the app registration. See docs/deployment.md.`;
}

/** Connecting refused before Microsoft's page, with a message to show. */
export class ConnectRefused extends Error {
  override name = 'ConnectRefused';
}

/** An attempt to connect, between sending the person to Microsoft and their coming back. */
interface Attempt {
  person: string;
  /** The sign-in session it started in, which it has to come back to. */
  session: string;
  space: string;
  verifier: string;
  nonce: string;
  /** Signing in again for one of their connections, which the same account has to come back for. */
  again?: { connection: string; tenant: string; account: string };
}

const attemptKey = (state: string) => `homing-connect:${state}`;
const attemptMinutes = 10;

/**
 * Starts connecting a Microsoft 365 mailbox in a space: the address of Microsoft's sign-in page,
 * for this attempt only, or undefined when the person can't open the space. Signing in again for
 * a connection of theirs suggests its account.
 */
export async function startConnecting(app: App, who: { person: string; session: string }, spaceId: string, again?: string): Promise<URL | undefined> {
  const found = await withPrincipal(app.sql, { person: who.person }, async (s) => {
    if (!(await spaceView(s, spaceId))) return undefined;
    if (!again) return {};
    const [connection] = await s.tx<{ id: string; tenant: string; account: string; address: string }[]>`
      select id, tenant, account, address from connections where id = ${again}::uuid and person_id = ${who.person}::uuid and revoked_at is null
    `;
    return connection ? { again: connection } : {};
  });
  if (!found) return undefined;
  if (!app.microsoft) throw new ConnectRefused('Microsoft 365 isn’t set up on this Homing.');

  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const attempt: Attempt = {
    person: who.person,
    session: who.session,
    space: spaceId,
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
  return signInAddress(app.microsoft, {
    redirectUri: redirectUri(app.url),
    state,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    nonce,
    loginHint: found.again?.address,
  });
}

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
 * Where Microsoft sends the person back. The attempt must be one this person started, in this
 * sign-in session, in the last ten minutes, and is used up. Then Homing redeems the code with the
 * attempt's PKCE verifier, checks the ID token, asks Microsoft Graph who the account is and that
 * its mailbox can be reached, and keeps the connection and its place. The person lands back on
 * the space's Connections, with what happened; nothing Microsoft said goes into the address.
 */
export async function finishConnecting(app: App, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const go = (to: string) => {
    res.writeHead(302, { location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end();
  };
  if (req.method !== 'GET' || !app.microsoft) {
    res.writeHead(404).end();
    return;
  }
  const query = new URL(req.url ?? '/', app.url).searchParams;
  const session = await app.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  const attempt = await takeAttempt(app, query.get('state') ?? '');
  // A state that isn't this person's, from this session, says nothing about where it came from.
  if (!session || !attempt || attempt.session !== session.session.id || attempt.person !== session.user.id) {
    return go('/account?connection=expired');
  }
  const back = (outcome: string) => go(`/spaces/${attempt.space}/connections?connection=${outcome}`);

  const error = query.get('error');
  if (error) {
    // The person said no on Microsoft's page, or their organization hasn't allowed Homing.
    const declined = ['access_denied', 'consent_required', 'interaction_required'].includes(error);
    if (!declined) console.error(`connections: Microsoft didn’t sign in (${error.replace(/[^\w.-]/g, '').slice(0, 60)})`);
    return back(declined ? 'declined' : 'failed');
  }
  const code = query.get('code');
  if (!code) return back('failed');

  try {
    const grant = await redeem(app.microsoft, { code, verifier: attempt.verifier, redirectUri: redirectUri(app.url), nonce: attempt.nonce });
    // Signing in again with another account fixes nothing, and connects nothing new either.
    if (attempt.again && (grant.tenant !== attempt.again.tenant || grant.account !== attempt.again.account)) return back('another-account');
    const account = await whoIs(app.microsoft, grant.tokens.access);
    const address = account.address ?? grant.username;
    if (!address) throw new MicrosoftRefused('no_address');
    await withPrincipal(app.sql, { person: attempt.person, direct: true }, async (s) => {
      const [{ connectionId }] = await s.tx<{ connectionId: string; placeId: string }[]>`
        select * from connect_mailbox(
          ${attempt.space}::uuid, 'microsoft', ${grant.tenant}, ${grant.account}, ${address}, ${account.name}, ${s.tx.array(grant.scopes)}::text[]
        )
      `;
      await keepTokens(s, app.vault, connectionId, grant.tokens);
    });
    return back('connected');
  } catch (error) {
    if (error instanceof MicrosoftRefused) {
      console.error(error.homingItself ? configurationProblem(error) : `connections: connecting a Microsoft account failed (${error.message})`);
      // A code used before, or one that expired, as when the page is opened again.
      if (error.code === 'invalid_grant') return back('expired');
      if (error.code === 'no_mailbox') return back('no-mailbox');
      return back('failed');
    }
    if (error instanceof MicrosoftUnreachable) return back('unreachable');
    // The space can't be opened any more.
    if (error instanceof postgres.PostgresError && error.code === '42501') return back('failed');
    throw error;
  }
}
