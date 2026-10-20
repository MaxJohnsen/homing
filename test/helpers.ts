import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after } from 'node:test';
import { adminUrl, authDatabaseUrl, connect, databaseUrl, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { createPerson } from '../src/spaces.ts';
import { Browser } from './browser.ts';
import { inTestDatabase } from './reset.ts';

/** Homing's connection, as the restricted role. */
export const db = connect(inTestDatabase(databaseUrl));

/** The admin role, which row-level security doesn't apply to. */
export const admin = connect(inTestDatabase(adminUrl));

/** Sign-in's own role, which Better Auth uses. */
export const authDb = connect(inTestDatabase(authDatabaseUrl));

after(() => Promise.all([db.end(), admin.end(), authDb.end()]));

/** Runs fn as a person or a space, the way Homing does. */
export function as<T>(principal: Principal, fn: (s: Session) => Promise<T>, sql = db): Promise<T> {
  return withPrincipal(sql, principal, fn);
}

/**
 * Creates a person, who can also act as a principal. Every test creates its
 * own people, so tests never see each other's data.
 */
export async function person(name: string) {
  const { id, personalSpaceId } = await createPerson(admin, name);
  return { name, id, personalSpaceId, person: id };
}

export type Person = Awaited<ReturnType<typeof person>>;

/** How PostgreSQL refuses an operation: insufficient privilege. */
export const refused = { code: '42501' };

/** A new invite, made the way the instance admin will. */
export async function invite(options: { expired?: boolean; email?: string } = {}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest();
  await admin`
    insert into invites (hash, expires_at, email)
    values (${hash}, now() + ${options.expired ? '-1 minute' : '1 hour'}::interval, ${options.email ?? null})
  `;
  return token;
}

/**
 * Someone who joined Homing through an invite with a passkey, and is signed
 * in to their own browser. They can also act as a principal. The invite went
 * to their email, which verifies it, unless they joined with another one.
 */
export async function member(url: URL, name: string, { verified = true }: { verified?: boolean } = {}) {
  const browser = new Browser(url);
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.test`;
  const joined = await browser.join(await invite({ email: verified ? email : undefined }), { name, email });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const id = joined.body.user.id as string;
  const [{ personalSpaceId }] = await admin`select id as personal_space_id from spaces where private_to = ${id} and parent_id is null`;
  return { name, id, email, person: id, personalSpaceId: personalSpaceId as string, browser };
}

export type Member = Awaited<ReturnType<typeof member>>;

/** Waits until the condition holds, such as another request waiting on a lock. */
export async function until(condition: () => Promise<boolean>) {
  for (let tries = 0; !(await condition()); tries++) {
    if (tries > 100) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
