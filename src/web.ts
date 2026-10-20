import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import postgres from 'postgres';
import { connectedAssistants, disconnectAssistant } from './assistants.ts';
import { joinWithPassword, mcpResource, saveTicket, signedInRecently, type Auth } from './auth.ts';
import { AccessDenied, withPrincipal, type Sql } from './db.ts';
import { emails, type Mailer } from './email.ts';
import { createInvite, findInvite, newTicket } from './invites.ts';
import { handleAppApi } from './app-api.ts';
import { afterDecision } from './notify.ts';
import { decide, proposalData, readProposal, Undecidable } from './proposals.ts';

/** What the web app's requests need from the server. */
export interface App {
  sql: Sql;
  auth: Auth;
  /** Sign-in's own connection, as homing_auth. */
  authPool: Pool;
  url: URL;
  /** Sends email, if Homing has a way to. */
  mailer?: Mailer;
}

// One plain address, nothing a mail program could read as a name and another address.
const emailPattern = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

/** Homing's own endpoints for its pages. Sign-in itself is Better Auth's, under /api/auth. */
export async function handleApi(app: App, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const headers = fromNodeHeaders(req.headers);

  if (req.method === 'POST' && headers.get('origin') !== app.url.origin) {
    return json(res, 403, { message: 'Requests must come from Homing itself.' });
  }

  if (req.method === 'POST' && path === '/api/invite') {
    const { token } = await readJson(req);
    const invite = typeof token === 'string' ? await findInvite(app.sql, token) : undefined;
    if (!invite) return json(res, 410, { message: 'This invite has expired or was already used.' });
    return json(res, 200, invite);
  }

  if (req.method === 'POST' && path === '/api/join') {
    const body = await readJson(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const token = typeof body.token === 'string' ? body.token : '';
    if (await app.auth.api.getSession({ headers })) {
      return json(res, 409, { code: 'SIGNED_IN', message: 'Sign out first to create a new account with this invite.' });
    }
    const invite = await findInvite(app.sql, token);
    if (!invite) return json(res, 410, { message: 'This invite has expired or was already used.' });
    if (!name || name.length > 200) return json(res, 400, { field: 'name', message: 'Enter your name.' });
    if (!emailPattern.test(email)) return json(res, 400, { field: 'email', message: 'Enter an email address, like ana@example.com.' });
    const context = await app.auth.$context;
    if (await context.internalAdapter.findUserByEmail(email)) {
      return json(res, 409, { field: 'email', message: 'There is already an account with this email. Sign in instead.' });
    }
    return json(res, 200, { ticket: await saveTicket(app.auth, newTicket(invite, { token, name, email })) });
  }

  if (req.method === 'POST' && path === '/api/join/password' && passwords(app)) {
    const { ticket, password } = await readJson(req);
    if (typeof ticket !== 'string' || typeof password !== 'string') return json(res, 400, { message: 'Enter a password.' });
    try {
      const joined = await joinWithPassword(app.auth, app.authPool, app.sql, ticket, password);
      const signedIn = await app.auth.api.signInEmail({ body: { email: joined.email, password }, headers, asResponse: true });
      res.setHeader('set-cookie', signedIn.headers.getSetCookie());
      return json(res, signedIn.status, {});
    } catch (error) {
      return refused(res, error, 'password');
    }
  }

  if (req.method === 'GET' && path === '/api/sign-in-options') {
    // Without email, whoever runs Homing gives people a sign-in link when they need one.
    return json(res, 200, { passwords: passwords(app), recovery: app.mailer ? 'email' : 'operator' });
  }

  if (req.method === 'GET' && path === '/api/me') {
    const session = await app.auth.api.getSession({ headers });
    if (!session) return json(res, 401, { message: 'Sign in first.' });
    const [person] = await withPrincipal(app.sql, { person: session.user.id }, ({ tx }) => tx<{ name: string; instanceAdmin: boolean }[]>`
      select name, instance_admin from people where id = ${session.user.id}::uuid
    `);
    const passkeys = await app.auth.api.listPasskeys({ headers });
    const accounts = await app.auth.api.listUserAccounts({ headers });
    return json(res, 200, {
      name: person?.name ?? session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      canEmail: Boolean(app.mailer),
      instanceAdmin: person?.instanceAdmin ?? false,
      passwords: passwords(app),
      password: accounts.some((account) => account.providerId === 'credential'),
      passkeys: passkeys.map(({ id, name, createdAt }) => ({ id, name: name ?? null, createdAt })),
      assistants: await connectedAssistants(app.authPool, session.user.id),
      mcpUrl: mcpResource(app.url),
    });
  }

  if (req.method === 'POST' && path === '/api/account/password' && passwords(app)) {
    const session = await app.auth.api.getSession({ headers });
    if (!session) return json(res, 401, { message: 'Sign in first.' });
    const [person] = await withPrincipal(app.sql, { person: session.user.id }, ({ tx }) => tx<{ instanceAdmin: boolean }[]>`
      select instance_admin from people where id = ${session.user.id}::uuid
    `);
    if (person?.instanceAdmin) {
      return json(res, 403, { message: 'The account that looks after Homing signs in only with passkeys.' });
    }
    if (!signedInRecently(session.session)) return json(res, 403, { code: 'SIGN_IN_AGAIN', message: 'Sign in again first.' });
    const { password } = await readJson(req);
    if (typeof password !== 'string') return json(res, 400, { field: 'password', message: 'Enter a password.' });
    try {
      await app.auth.api.setPassword({ body: { newPassword: password }, headers });
      return json(res, 200, {});
    } catch (error) {
      return refused(res, error, 'password');
    }
  }

  if (req.method === 'POST' && path === '/api/invites') {
    const session = await app.auth.api.getSession({ headers });
    if (!session) return json(res, 401, { message: 'Sign in first.' });
    const { email } = await readJson(req);
    const address = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
    if (address && !emailPattern.test(address)) return json(res, 400, { field: 'email', message: 'Enter an email address, like ana@example.com.' });
    if (address && !app.mailer) return json(res, 400, { field: 'email', message: 'Homing can’t send email. Copy the link instead.' });
    try {
      const invite = await withPrincipal(app.sql, { person: session.user.id, direct: true }, (s) => createInvite(s, app.url, address));
      if (!address) return json(res, 200, { ...invite, emailed: false });
      // An emailed invite verifies the address it is accepted with, so its link
      // goes only to that address, not to whoever sent it.
      await app.mailer!(emails.invite(address, invite.link, session.user.name));
      return json(res, 200, { expiresAt: invite.expiresAt, emailed: true, to: address });
    } catch (error) {
      if ((error as { code?: string }).code === '42501') {
        return json(res, 403, { message: 'Only the person who looks after Homing invites people.' });
      }
      throw error;
    }
  }

  if (req.method === 'POST' && path === '/api/assistants/disconnect') {
    const session = await app.auth.api.getSession({ headers });
    if (!session) return json(res, 401, { message: 'Sign in first.' });
    const { clientId } = await readJson(req);
    if (typeof clientId !== 'string' || !(await disconnectAssistant(app.authPool, session.user.id, clientId))) {
      return json(res, 404, { message: 'That assistant isn’t connected.' });
    }
    return json(res, 200, {});
  }

  if (await handleAppApi(app, req, res, path, headers)) return;

  const proposal = /^\/api\/proposals\/([0-9a-f-]{36})(\/decide)?$/i.exec(path);
  if (proposal && (req.method === 'GET' ? !proposal[2] : req.method === 'POST' && proposal[2])) {
    const session = await app.auth.api.getSession({ headers });
    if (!session) return json(res, 401, { message: 'Sign in first.' });
    const person = session.user.id;
    const id = proposal[1].toLowerCase();
    const missing = { message: 'There’s nothing for you to decide here.' };

    if (req.method === 'GET') {
      const found = await withPrincipal(app.sql, { person }, (s) => readProposal(s, id));
      return found ? json(res, 200, { person: session.user.name, proposal: proposalData(found) }) : json(res, 404, missing);
    }

    const body = await readJson(req);
    if (typeof body.approve !== 'boolean') return json(res, 400, { message: 'Approve or reject it.' });
    try {
      // Deciding is a person acting directly, never their assistant.
      const decided = await withPrincipal(app.sql, { person, direct: true }, (s) =>
        decide(s, id, {
          approve: body.approve as boolean,
          shown: typeof body.shown === 'string' ? body.shown : undefined,
          onlyHere: typeof body.onlyHere === 'boolean' ? body.onlyHere : undefined,
        }),
      );
      if (!decided) return json(res, 404, missing);
      // Emailing the admins about a sent request, or the member about the outcome, comes after the decision holds.
      await afterDecision(app, person, decided);
      const now = await withPrincipal(app.sql, { person }, (s) => readProposal(s, id));
      return json(res, 200, { person: session.user.name, proposal: proposalData(now ?? decided) });
    } catch (error) {
      if (error instanceof Undecidable) return json(res, error.reason === 'expired' ? 410 : 409, { code: error.reason.toUpperCase(), message: error.message });
      if (error instanceof AccessDenied || (error instanceof postgres.PostgresError && error.code === '42501')) {
        return json(res, 403, { message: 'You can’t make this change any more, so nothing changed.' });
      }
      throw error;
    }
  }

  return json(res, 404, { message: 'Not found.' });
}

const dist = new URL('../web/dist/app/', import.meta.url);

/** The pages outside the app, and the app's own screens. Each one loads the same single-page app. */
const pages = new Set(['/sign-in', '/setup', '/join', '/connect', '/recover', '/', '/waiting', '/account', '/admin']);
const screens = /^\/(spaces\/[0-9a-f-]{36}(\/(pages|sources|rules|skills|members))?|(pages|sources|proposals|skills)\/[0-9a-f-]{36})$/i;

const types: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Serves the built web app, and sends someone who isn't signed in from Home to sign-in. */
export async function serveApp(app: App, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  if (path === '/') {
    const session = await app.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.writeHead(302, { location: '/sign-in' }).end();
      return;
    }
  }

  // Built files have a hash in their name, so they never change.
  const asset = /^\/assets\/[\w.-]+$/.test(path) || path === '/favicon.svg';
  const file = asset ? path.slice(1) : 'index.html';
  let body: Buffer;
  try {
    body = await readFile(new URL(file, dist));
  } catch {
    if (asset) {
      res.writeHead(404).end();
    } else {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('The web app is not built. Run `npm run build:web`.\n');
    }
    return;
  }

  if (asset) {
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': path === '/favicon.svg' ? 'public, max-age=86400' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
  } else {
    res.writeHead(pages.has(path) || screens.test(path) ? 200 : 404, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'content-security-policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
  }
  res.end(req.method === 'HEAD' ? undefined : body);
}

function passwords(app: App): boolean {
  return app.auth.options.emailAndPassword?.enabled ?? false;
}

/** Answers with sign-in's own refusal, such as a password that's too short. */
function refused(res: ServerResponse, error: unknown, field?: string): void {
  if (!isAPIError(error)) throw error;
  const body = error.body as { code?: string; message?: string } | undefined;
  json(res, error.statusCode, {
    code: body?.code,
    message: body?.message ?? 'That didn’t work. Try again.',
    field: body?.code?.startsWith('PASSWORD') ? field : undefined,
  });
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}
