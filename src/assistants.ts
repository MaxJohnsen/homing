import { createDpopReplayStore, enforceDpopBinding, parseAccessTokenAuthorization } from 'better-auth/oauth2';
import { createLocalJWKSet, errors, jwtVerify } from 'jose';
import type { Pool } from 'pg';
import { mcpResource, type Auth } from './auth.ts';

/** A person, and the assistant acting for them, such as "Claude", with the assistant's client id. */
export interface AgentPrincipal {
  person: string;
  agent: string;
  clientId: string;
}

/** An assistant someone has connected, and can disconnect. */
export interface ConnectedAssistant {
  clientId: string;
  name: string;
  connectedAt: Date;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What /mcp is called with: the Authorization header, any DPoP proof, and the method. */
export interface AssistantRequest {
  authorization?: string;
  dpop?: string;
  method: string;
}

/**
 * Who a request to /mcp acts for: the access token's person, and the
 * assistant it was issued to. The token must be Homing's own access token,
 * for /mcp and current, checked against Homing's signing keys without going
 * over the network. A token bound to a key (DPoP) works only with a fresh
 * proof from that key. And the person must not have disconnected the
 * assistant since the token was issued, so disconnecting takes effect at once.
 */
export function tokenVerifier(auth: Auth, pool: Pool, url: URL) {
  const resource = mcpResource(url);
  // An access token (RFC 9068), not an ID token or anything else Homing signs.
  const options = { issuer: new URL('/api/auth', url).toString(), audience: resource, typ: 'at+jwt' };
  const replayStore = auth.$context.then((context) => createDpopReplayStore(context.internalAdapter));

  // The keys are loaded again every ten minutes, and for a key not seen yet, but at
  // most twice a minute, so made-up tokens can't make every request hit the database.
  let keys: { set: ReturnType<typeof createLocalJWKSet>; loadedAt: number } | undefined;
  const loadKeys = async (missing = false) => {
    const age = keys ? Date.now() - keys.loadedAt : Infinity;
    if (!keys || age > 10 * 60 * 1000 || (missing && age > 30 * 1000)) {
      keys = { set: createLocalJWKSet(await auth.api.getJwks()), loadedAt: Date.now() };
    }
    return keys.set;
  };
  const verify = async (token: string) => {
    try {
      return (await jwtVerify(token, await loadKeys(), options)).payload;
    } catch (error) {
      if (error instanceof errors.JWKSNoMatchingKey) return (await jwtVerify(token, await loadKeys(true), options)).payload;
      throw error;
    }
  };

  return async (request: AssistantRequest): Promise<(AgentPrincipal & { token: string }) | undefined> => {
    const authorization = parseAccessTokenAuthorization(request.authorization);
    if (!authorization || authorization.scheme === 'Unknown') return undefined;
    const claims = await verify(authorization.token).catch(() => undefined);
    if (!claims) return undefined;
    try {
      await enforceDpopBinding({
        payload: claims,
        authorization,
        proofJwt: request.dpop,
        method: request.method,
        url: resource,
        replayStore: await replayStore,
      });
    } catch {
      return undefined;
    }

    const person = claims.sub;
    const clientId = claims.azp ?? claims.client_id;
    if (!person || !uuid.test(person) || typeof clientId !== 'string' || typeof claims.iat !== 'number') return undefined;
    const { rows } = await pool.query<{ name: string | null }>(
      `select client.name from "oauthConsent" consent
       join "oauthClient" client on client."clientId" = consent."clientId"
       where consent."userId" = $1 and consent."clientId" = $2
         and not coalesce(client.disabled, false)
         and $3 >= floor(extract(epoch from consent."createdAt"))
       limit 1`,
      [person, clientId, claims.iat],
    );
    if (!rows[0]) return undefined;
    return { person, agent: rows[0].name || hostOf(clientId), clientId, token: authorization.token };
  };
}

/** The assistants a person has connected, most recent first. */
export async function connectedAssistants(pool: Pool, person: string): Promise<ConnectedAssistant[]> {
  // Allowing an assistant twice at once can leave two consents for it; it's one assistant.
  const { rows } = await pool.query<{ clientId: string; name: string | null; connectedAt: Date }>(
    `select * from (
       select distinct on (consent."clientId") consent."clientId", client.name, consent."createdAt" as "connectedAt"
       from "oauthConsent" consent
       join "oauthClient" client on client."clientId" = consent."clientId"
       where consent."userId" = $1
       order by consent."clientId", consent."createdAt" desc
     ) assistants
     order by "connectedAt" desc`,
    [person],
  );
  return rows.map((row) => ({ ...row, name: row.name || hostOf(row.clientId) }));
}

/**
 * Disconnects an assistant at once. Its access tokens stop working with its
 * consent. Its refresh tokens and any authorization codes it hasn't used yet
 * are deleted, so it can't get new tokens, now or after the person connects
 * it again.
 */
export async function disconnectAssistant(pool: Pool, person: string, clientId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rowCount } = await client.query('delete from "oauthConsent" where "userId" = $1 and "clientId" = $2', [person, clientId]);
    // Deleted rather than marked revoked: Better Auth treats a revoked refresh token
    // coming back as theft, and would then end a later connection too.
    for (const table of ['oauthAccessToken', 'oauthRefreshToken']) {
      await client.query(`delete from "${table}" where "userId" = $1 and "clientId" = $2`, [person, clientId]);
    }
    await client.query(
      `delete from verification
       where value like '{"type":"authorization_code"%'
         and case when pg_input_is_valid(value, 'jsonb') then value::jsonb end
             @> jsonb_build_object('userId', $1::text, 'query', jsonb_build_object('client_id', $2::text))`,
      [person, clientId],
    );
    await client.query('commit');
    return Boolean(rowCount);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function hostOf(clientId: string): string {
  try {
    return new URL(clientId).hostname;
  } catch {
    return clientId;
  }
}
