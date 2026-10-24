import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after } from 'node:test';
import { adminUrl, authDatabaseUrl, connect, databaseUrl, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { publishItem } from '../src/knowledge.ts';
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

/** Imports an export as the app does: sends it to be previewed, imports that, and waits until it's in. Returns the new space. */
export async function importAgain(who: Member, zip: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const previewed = await who.browser.fetch('/api/import/preview', { method: 'POST', body: zip, headers: { 'content-type': 'application/zip' } });
  const { hash } = (await previewed.json()) as { hash: string };
  assert.equal(previewed.status, 200);
  const started = await who.browser.fetch(`/api/import?${new URLSearchParams({ name, hash })}`, { method: 'POST' });
  assert.equal(started.status, 202);
  for (;;) {
    const { body } = await who.browser.json('/api/import');
    if (body.state === 'failed') throw new Error(body.message);
    if (body.state === 'done') return body.id as string;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Shares one of the person's own items as they do in Homing: directly, exactly as it is, with its
 * page's title if the page has none for everyone yet. So what their assistant wrote is shared the
 * only way it can be, still written by the assistant. Returns what everyone sees.
 */
export async function share(who: { id: string }, itemId: string): Promise<string> {
  return as({ person: who.id, direct: true }, async (s) => {
    const [{ body }] = await s.tx<{ body: string }[]>`select body from content where id = ${itemId}::uuid`;
    const shared = await publishItem(s, itemId, body);
    assert.ok(shared, 'it was shared');
    return shared;
  });
}

/** Waits until the condition holds, such as another request waiting on a lock, checking at most so many times, 20 ms apart. */
export async function until(condition: () => Promise<boolean>, most = 100) {
  for (let tries = 0; !(await condition()); tries++) {
    if (tries > most) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Writes an import the way Homing does, straight against the store, in the session's transaction:
 * its spaces first, then everything else in one batch, then what it includes.
 */
export async function importInto(s: Session, bundle: { from: unknown; spaces: unknown[]; includes?: unknown[] } & Record<string, unknown>) {
  const { from, spaces, includes = [], ...rows } = bundle;
  const [{ id }] = await s.tx<{ id: string }[]>`select import_begin(${s.tx.json({ from, spaces } as never)}) as id`;
  await s.tx`select import_load(${id}::uuid, ${s.tx.json(rows as never)})`;
  const [{ space }] = await s.tx<{ space: string }[]>`select import_finish(${id}::uuid, ${s.tx.json({ includes } as never)}) as space`;
  return space;
}
