import { createServer, type IncomingMessage, type Server } from 'node:http';
import { BlockList, isIP, type AddressInfo } from 'node:net';
import { hostHeaderValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, localhostAllowedHostnames, type AuthInfo } from '@modelcontextprotocol/server';
import { toNodeHandler as authHandler } from 'better-auth/node';
import { Pool } from 'pg';
import { tokenVerifier, type AgentPrincipal } from './assistants.ts';
import { authEndpoints, clientAddressHeader, createAuth, type Auth, type AuthSettings } from './auth.ts';
import { finishConnecting } from './connections.ts';
import { connectorsFor, type Connector } from './connectors.ts';
import { authDatabaseUrl, connect, type Sql } from './db.ts';
import { smtpMailer, type Mailer } from './email.ts';
import { keepTidy } from './import.ts';
import { setupLink } from './invites.ts';
import { mcpServer } from './mcp.ts';
import { microsoftFromEnvironment, type MicrosoftSettings } from './microsoft.ts';
import { modelFromEnvironment, modelOf, type ModelSettings } from './model.ts';
import { vault } from './vault.ts';
import { handleApi, serveApp, type App } from './web.ts';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Where Homing is reached. By default HOMING_URL, or localhost at the port it listens on. */
  url?: URL;
  /** Signs sessions. By default HOMING_SECRET, which only a server reachable from this machine alone may leave out. */
  secret?: string;
  /** Sign-in's own database connection, as homing_auth. */
  authDatabase?: string;
  /** Proxies whose X-Forwarded-For Homing believes, as addresses or ranges. By default HOMING_TRUSTED_PROXIES. */
  trustedProxies?: string;
  /** Whether sign-in limits how often each client tries. By default on, except for a local install. */
  rateLimit?: boolean;
  /** Fetches assistants' client metadata documents. Tests replace it. */
  fetchClientMetadata?: AuthSettings['fetchClientMetadata'];
  /** The sites whose assistants may connect. By default HOMING_ASSISTANT_SITES, or Claude's and ChatGPT's. */
  assistantSites?: string[];
  /** The assistants, by client id, that get the approval card. By default those checked to keep the model from pressing it. */
  cardClients?: string[];
  /** Sends email. By default from SMTP_URL, if it's set. */
  mailer?: Mailer;
  /** Whether people may sign in with a password. On unless HOMING_PASSWORDS is off. */
  passwords?: boolean;
  /** Whether to log what assistants ask for. On by default. */
  logRequests?: boolean;
  /** How people connect Microsoft 365. By default from MICROSOFT_CLIENT_ID and the settings beside it; null for none. */
  microsoft?: MicrosoftSettings | null;
  /** Systems to connect to beside Homing's own connectors. Tests add stand-ins. */
  connectors?: Connector[];
  /** Homing's own model, for learning. By default from the model settings in the environment; null for none. */
  model?: ModelSettings | null;
}

export interface Homing {
  url: URL;
  auth: Auth;
  server: Server;
  close(): Promise<void>;
}

/** Serves the web app, sign-in, and MCP at /mcp for signed-in assistants. */
export async function startServer(sql: Sql, options: ServerOptions): Promise<Homing> {
  const configured = options.url ?? configuredUrl;
  const secret = options.secret ?? secretFor(configured, options.host);
  const proxies = trustedProxies(options.trustedProxies ?? process.env.HOMING_TRUSTED_PROXIES);
  const microsoft = options.microsoft === undefined ? microsoftFromEnvironment() : (options.microsoft ?? undefined);
  const connectors = connectorsFor({ microsoft }, options.connectors);
  // Where each system sends people back after they sign in there, as its app registration has it.
  const callbacks = new Map([...connectors.values()].map((connector) => [connector.auth.callback, connector]));
  const modelSettings = options.model === undefined ? modelFromEnvironment() : (options.model ?? undefined);
  let app: App | undefined;
  let mcp: ReturnType<typeof toNodeHandler>;
  let auth: ReturnType<typeof authHandler>;
  let verifyToken: ReturnType<typeof tokenVerifier>;
  let validateHost: ReturnType<typeof hostHeaderValidation>;

  const server = createServer(async (req, res) => {
    try {
      if (!app) {
        res.writeHead(503).end();
        return;
      }
      if (!validateHost(req, res)) return;
      // Sign-in's rate limits go by this address, never by one the client claims.
      req.headers[clientAddressHeader] = clientAddress(req, proxies);
      const path = new URL(req.url ?? '/', app.url).pathname;
      if (path === '/mcp') {
        const dpop = req.headers.dpop;
        const principal = await verifyToken({ authorization: req.headers.authorization, dpop: typeof dpop === 'string' ? dpop : undefined, method: req.method ?? 'GET' });
        if (!principal) {
          // Tells the assistant where to sign the person in (RFC 9728).
          const metadata = new URL('/.well-known/oauth-protected-resource/mcp', app.url);
          const challenge = `Bearer resource_metadata="${metadata}"${req.headers.authorization ? ', error="invalid_token"' : ''}`;
          res.writeHead(401, { 'www-authenticate': challenge, 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Sign in to Homing to connect.' }, id: null }));
          return;
        }
        const info: AuthInfo = { token: principal.token, clientId: principal.agent, scopes: [], extra: { principal } };
        await mcp(Object.assign(req, { auth: info }) as IncomingMessage & { auth: AuthInfo }, res);
      } else if (path.startsWith('/api/auth/') || path.startsWith('/.well-known/')) {
        if (authEndpoints.has(`${req.method} ${path}`)) await auth(req, res);
        else res.writeHead(404).end();
      } else if (callbacks.has(path)) {
        await finishConnecting(app, callbacks.get(path)!, req, res);
      } else if (path.startsWith('/api/')) {
        await handleApi(app, req, res, path);
      } else {
        await serveApp(app, req, res, path);
      }
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  const url = configured ?? new URL(`http://localhost:${(server.address() as AddressInfo).port}`);
  if (url.protocol !== 'https:' && !isLocal(url)) {
    server.close();
    throw new Error('HOMING_URL must use https, unless it is localhost: passkeys and assistants need it.');
  }
  const mailer = 'mailer' in options ? options.mailer : smtpMailer();
  const pool = new Pool({ connectionString: options.authDatabase ?? authDatabaseUrl, options: '-c search_path=auth' });
  const rateLimit = options.rateLimit ?? !isLocal(url);
  const homingAuth = createAuth(sql, pool, {
    url,
    secret,
    passwords: options.passwords ?? process.env.HOMING_PASSWORDS !== 'off',
    rateLimit,
    fetchClientMetadata: options.fetchClientMetadata,
    assistantSites: options.assistantSites ?? assistantSites,
    mailer,
  });
  verifyToken = tokenVerifier(homingAuth, pool, url);

  const cards = new Set(options.cardClients ?? cardClients);
  // What reading a person's places for them, such as their mailbox, needs: their sealed sign-in, opened only in the server.
  const broker = { sql, vault: vault(secret), connectors };
  const handler = createMcpHandler(({ authInfo }) => {
    const principal = authInfo?.extra?.principal as AgentPrincipal;
    return mcpServer(sql, principal, url, { card: cards.has(principal.clientId), notifier: { sql, authPool: pool, url, mailer }, broker });
  });
  mcp = toNodeHandler({
    fetch: async (request, context) => {
      if (options.logRequests ?? true) logRequest(await request.clone().text(), (context?.authInfo?.extra?.principal as AgentPrincipal).agent);
      return handler.fetch(request, context);
    },
  });
  auth = authHandler(homingAuth);
  // Refuses requests addressed to other host names, which protects a local install from DNS rebinding.
  validateHost = hostHeaderValidation(isLocal(url) ? localhostAllowedHostnames() : [url.hostname]);
  const model = modelSettings && modelOf(modelSettings);
  app = { sql, auth: homingAuth, authPool: pool, url, mailer, limit: rateLimit ? limiter(20, 10 * 60_000) : () => true, vault: broker.vault, connectors, model };
  // What imports left on the way, when Homing stopped during one, goes, and keeps going.
  const stopTidying = keepTidy(sql);

  return {
    url,
    auth: homingAuth,
    server,
    close: async () => {
      stopTidying();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

/** The sites whose assistants may connect: Claude (claude.ai and Claude Code) and ChatGPT, unless set. */
const assistantSites = (process.env.HOMING_ASSISTANT_SITES || 'claude.ai,chatgpt.com').split(',').map((site) => site.trim()).filter(Boolean);

/**
 * The assistants that show the approval card, and that were checked to keep
 * the model from seeing the card's tools, so only the person can press its
 * buttons. Every other assistant gives the person a link instead.
 */
const cardClients = ['https://claude.ai/oauth/mcp-oauth-client-metadata'];

/**
 * Logs what an assistant asked for, such as `Claude tools/call act`: the
 * method and the tool or resource, never the arguments or anything else a
 * person wrote.
 */
function logRequest(body: string, assistant: string) {
  let message: { method?: unknown; params?: { name?: unknown; uri?: unknown } } | undefined;
  try {
    message = JSON.parse(body);
  } catch {
    return;
  }
  if (typeof message?.method !== 'string' || message.method.startsWith('notifications/')) return;
  const what = [message.params?.name, message.params?.uri].find((value) => typeof value === 'string');
  console.log(`mcp: ${assistant} ${message.method}${what ? ` ${what}` : ''}`);
}

/** Where Homing is reached, which decides the host names it answers to. */
export const configuredUrl = process.env.HOMING_URL ? new URL(process.env.HOMING_URL) : undefined;

function isLocal(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

// Anyone could sign sessions with this one, so only a server that is reached
// at localhost and listens there alone may use it, as when developing Homing.
export const developmentSecret = 'homing-development-secret-for-localhost-only';

function secretFor(url: URL | undefined, host: string | undefined): string {
  const secret = process.env.HOMING_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (!secret && (!url || isLocal(url)) && ['127.0.0.1', 'localhost', '::1'].includes(host ?? '')) return developmentSecret;
  throw new Error(
    'Homing needs a secret of its own to sign people in. Set HOMING_SECRET to at least 32 random characters, ' +
      'such as the output of `openssl rand -base64 32`, and keep it. See docs/deployment.md.',
  );
}

/** The proxies whose X-Forwarded-For Homing believes, from addresses and ranges like `10.0.0.0/8`. */
function trustedProxies(list = ''): BlockList {
  const trusted = new BlockList();
  for (const entry of list.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [address, prefix] = entry.split('/');
    const version = isIP(address);
    if (!version) throw new Error(`HOMING_TRUSTED_PROXIES has ${entry}, which isn't an IP address or range.`);
    if (prefix) trusted.addSubnet(address, Number(prefix), version === 6 ? 'ipv6' : 'ipv4');
    else trusted.addAddress(address, version === 6 ? 'ipv6' : 'ipv4');
  }
  return trusted;
}

/**
 * Who a request comes from: the address of the connection, or, when that is
 * a proxy Homing trusts, the address the proxy says it forwarded for.
 */
function clientAddress(req: IncomingMessage, trusted: BlockList): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const plain = (address?: string) => address?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  const isTrusted = (address: string) => isIP(address) > 0 && trusted.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
  let address = plain(req.socket.remoteAddress);
  while (address && isTrusted(address) && forwarded.length) address = plain(forwarded.pop());
  return address && isIP(address) ? address : '';
}

// Migrations run as a separate step before this, so the server never holds the admin role.
if (import.meta.main) {
  const sql = connect();
  const port = Number(process.env.PORT ?? 4100);
  const homing = await startServer(sql, { port, host: process.env.HOST ?? '127.0.0.1' });
  console.log(`Homing is running at ${homing.url}, with MCP at ${new URL('/mcp', homing.url)}`);
  const link = await setupLink(sql, homing.url);
  if (link) {
    console.log(`\nCreate the first account with this link. It also looks after this Homing, and works for an hour:\n\n  ${link}\n\nRestart Homing for a new link.\n`);
  }
}

/**
 * At most this many tries from one address in a window, such as joining with an invite, so an
 * invite link can't be used to check many email addresses for accounts.
 */
function limiter(tries: number, windowMs: number): (address: string) => boolean {
  const seen = new Map<string, number[]>();
  return (address) => {
    const now = Date.now();
    const recent = (seen.get(address) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= tries) return false;
    recent.push(now);
    seen.set(address, recent);
    if (seen.size > 10_000) seen.delete(seen.keys().next().value!);
    return true;
  };
}
