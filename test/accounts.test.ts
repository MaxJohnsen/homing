// Accounts and sign-in, issue #5. You install Homing, create your account
// with the setup link, and sign in with a passkey. People join only through
// an invite, and nothing about sign-in lets anyone into someone else's account.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { getMigrations } from 'better-auth/db/migration';
import { authDatabaseUrl, connect } from '../src/db.ts';
import { setupLink } from '../src/invites.ts';
import { startServer, type Homing } from '../src/server.ts';
import { createSpace, listSpaces } from '../src/spaces.ts';
import { Browser } from './browser.ts';
import { admin, as, authDb, db, invite, person, until } from './helpers.ts';
import { freshDatabase, inTestDatabase } from './reset.ts';

describe('a new Homing', () => {
  let homing: Homing;
  let sql: ReturnType<typeof connect>;
  let owner: ReturnType<typeof connect>;

  before(async () => {
    const urls = await freshDatabase('setup');
    sql = connect(urls.app);
    owner = connect(urls.admin);
    homing = await startServer(sql, { port: 0, host: '127.0.0.1', authDatabase: urls.auth });
  });

  after(async () => {
    await homing.close();
    await Promise.all([sql.end(), owner.end()]);
  });

  test('the first account, made with the setup link, looks after this Homing', async () => {
    // A first sign-up that stopped halfway left a person without an account. That doesn't count.
    await owner`select create_person('Half done', gen_random_uuid())`;
    await owner`update people set instance_admin = true`;


    const earlier = fragment(await setupLink(sql, homing.url));
    const token = fragment(await setupLink(sql, homing.url));
    const browser = new Browser(homing.url);

    // Only the newest link works, as when the server restarts.
    assert.equal((await browser.json('/api/invite', { token: earlier })).status, 410);
    assert.deepEqual((await browser.json('/api/invite', { token })).body, { instanceAdmin: true, email: null, invitedBy: null });

    // The first account signs in only with passkeys, even when asked for a password.
    const ticket = (await browser.json('/api/join', { token, name: 'Ana', email: 'ana@acme.test' })).body.ticket;
    assert.equal((await browser.json('/api/join/password', { ticket, password: 'correct horse battery' })).status, 403);

    const joined = await browser.join(token, { name: 'Ana', email: 'Ana@Acme.test' });
    assert.equal(joined.status, 200);
    const me = await browser.json('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.name, 'Ana');
    assert.equal(me.body.email, 'ana@acme.test');
    assert.equal(me.body.instanceAdmin, true);
    assert.equal(me.body.passkeys.length, 1);

    // The link is used up, and no new one is made now that someone looks after Homing.
    assert.equal((await new Browser(homing.url).json('/api/invite', { token })).status, 410);
    assert.equal(await setupLink(sql, homing.url), undefined);
  });
});

describe('signing in', () => {
  let homing: Homing;

  before(async () => {
    homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl) });
  });

  after(() => homing.close());

  test('you sign in with your passkey, without saying whose account it is', async () => {
    const browser = new Browser(homing.url);
    await join(browser, 'Cara');
    await browser.signOut();
    assert.equal((await browser.json('/api/me')).status, 401);

    const options = await browser.json('/api/auth/passkey/generate-authenticate-options');
    assert.deepEqual(options.body.allowCredentials ?? [], []);
    assert.equal((await browser.signIn()).status, 200);
    assert.equal((await browser.json('/api/me')).body.name, 'Cara');
  });

  test('a wrong password reads the same whether or not the account exists', async () => {
    const browser = new Browser(homing.url);
    const { email } = await join(browser, 'Ben');
    await browser.signOut();
    const known = await browser.json('/api/auth/sign-in/email', { email, password: 'not the password' });
    const unknown = await browser.json('/api/auth/sign-in/email', { email: `nobody-${tag()}@beta.test`, password: 'not the password' });
    assert.equal(known.status, 401);
    assert.deepEqual(unknown, known);
  });

  test('a passkey is added after a recent sign-in, and the last one stays', async () => {
    const browser = new Browser(homing.url);
    const { id } = await join(browser, 'Ana');
    assert.equal((await browser.addPasskey()).status, 200);

    const [first, second] = (await browser.json('/api/me')).body.passkeys;
    assert.equal((await browser.json('/api/auth/passkey/delete-passkey', { id: first.id })).status, 200);
    const last = await browser.json('/api/auth/passkey/delete-passkey', { id: second.id });
    assert.equal(last.status, 400);
    assert.equal(last.body.code, 'LAST_WAY_TO_SIGN_IN');
    assert.equal((await browser.json('/api/me')).body.passkeys.length, 1);

    // A day later, adding one needs signing in again.
    await authDb`update auth.session set "createdAt" = now() - interval '25 hours' where "userId" = ${id}`;
    const stale = await browser.json('/api/auth/passkey/generate-register-options');
    assert.equal(stale.status, 403);
    assert.equal(stale.body.code, 'SIGN_IN_AGAIN');
  });

  test('removing two passkeys at once still leaves one', async () => {
    const browser = new Browser(homing.url);
    const { id } = await join(browser, 'Ana');
    assert.equal((await browser.addPasskey()).status, 200);
    const [a, b] = await authDb`select id from auth.passkey where "userId" = ${id}`;

    // The first removal holds the account while the second one waits, then sees it's the last.
    const [first, second] = [await authDb.reserve(), await authDb.reserve()];
    try {
      await first`begin`;
      await first`delete from auth.passkey where id = ${a.id}`;
      const racing = second`delete from auth.passkey where id = ${b.id}`;
      await first`commit`;
      await assert.rejects(racing, { code: '23514' });
    } finally {
      first.release();
      second.release();
    }
    assert.equal((await authDb`select count(*)::int as n from auth.passkey where "userId" = ${id}`)[0].n, 1);
  });

  test('only the sign-in endpoints Homing uses can be reached', async () => {
    const browser = new Browser(homing.url);
    await join(browser, 'Ana');
    for (const path of ['/api/auth/sign-up/email', '/api/auth/update-user', '/api/auth/change-email', '/api/auth/delete-user']) {
      assert.equal((await browser.json(path, { name: 'Mallory', email: 'mallory@evil.test', password: 'mallory-password' })).status, 404, path);
    }
    assert.equal((await browser.json('/api/me')).body.name, 'Ana');
  });

  test('Home sends you to sign in, and opens the app once you are', async () => {
    const browser = new Browser(homing.url);
    assert.equal((await browser.fetch('/')).headers.get('location'), '/sign-in');
    await join(browser, 'Ana');
    const home = await browser.fetch('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type') ?? '', /text\/html/);
  });
});

describe('invites', () => {
  let homing: Homing;

  before(async () => {
    homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl) });
  });

  after(() => homing.close());

  test('an invite works once, and an expired one creates nothing', async () => {
    const token = await invite();
    const email = `cara-${tag()}@acme.test`;
    assert.equal((await new Browser(homing.url).join(token, { name: 'Cara', email })).status, 200);
    assert.equal((await new Browser(homing.url).join(token, { name: 'Mallory', email: `m-${tag()}@evil.test` })).status, 410);

    const expired = await invite({ expired: true });
    const browser = new Browser(homing.url);
    const dan = `Dan ${tag()}`;
    assert.equal((await browser.join(expired, { name: dan, email: `dan-${tag()}@acme.test` })).status, 410);
    assert.equal((await admin`select count(*)::int as n from people where name = ${dan}`)[0].n, 0);
  });

  test('an invite never leads into an account that already exists', async () => {
    const ana = new Browser(homing.url);
    const { id, email } = await join(ana, 'Ana');

    const intruder = new Browser(homing.url);
    const taken = await intruder.join(await invite(), { name: 'Ana', email: email.toUpperCase() });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.field, 'email');
    assert.equal((await intruder.json('/api/me')).status, 401);
    assert.equal((await authDb`select count(*)::int as n from auth.passkey where "userId" = ${id}`)[0].n, 1);
  });

  test('a join ticket creates one account, once, and only Homing makes them', async () => {
    const browser = new Browser(homing.url);
    const { body } = await browser.json('/api/join', { token: await invite(), name: 'Cara', email: `cara-${tag()}@acme.test` });
    assert.equal((await browser.register('a-ticket-homing-never-made')).status, 400);

    const created = await browser.register(body.ticket);
    assert.equal(created.status, 200);
    // Using it again would add a second passkey to the new account without signing in.
    assert.equal((await new Browser(homing.url).register(body.ticket)).status, 400);
    assert.equal((await authDb`select count(*)::int as n from auth.passkey where "userId" = ${created.body.user.id}`)[0].n, 1);
  });

  test('a ticket only creates an account together with signing in', async () => {
    const browser = new Browser(homing.url);
    const token = await invite();
    const { body } = await browser.json('/api/join', { token, name: 'Cara', email: `cara-${tag()}@acme.test` });
    const options = await browser.json(`/api/auth/passkey/generate-register-options?context=${encodeURIComponent(body.ticket)}`);
    const quiet = await browser.json('/api/auth/passkey/verify-registration', { response: browser.passkeys.register(options.body) });
    assert.notEqual(quiet.status, 200);
    assert.equal((await browser.json('/api/invite', { token })).status, 200);
  });

  test('a sign-up that fails halfway can be finished, and keeps its invite', async () => {
    const ana = new Browser(homing.url);
    await join(ana, 'Ana');
    const taken = Buffer.from(ana.passkeys.credentials[0].id);

    // Cara's device offers a passkey that is already Ana's, so her sign-up fails after her invite was checked.
    const cara = new Browser(homing.url);
    const token = await invite();
    const { body } = await cara.json('/api/join', { token, name: 'Cara', email: `cara-${tag()}@acme.test` });
    assert.notEqual((await cara.register(body.ticket, taken)).status, 200);
    assert.equal((await cara.json('/api/me')).status, 401);

    // Trying again with the same ticket finishes it.
    assert.equal((await cara.register(body.ticket)).status, 200);
    assert.equal((await cara.json('/api/me')).body.name, 'Cara');
    assert.equal((await ana.signIn()).status, 200);
  });

  test('two sign-ups with the same email make one account, and the other invite still works', async () => {
    const email = `ana-${tag()}@acme.test`;
    const browser = new Browser(homing.url);
    const token = await invite();
    const { body } = await browser.json('/api/join', { token, name: 'Ana', email });

    // Another sign-up with the same email is creating its account right now.
    const { personId } = (await admin`select person_id from create_person('Ana', gen_random_uuid())`)[0];
    const other = await authDb.reserve();
    try {
      await other`begin`;
      await other`insert into auth."user" (id, name, email, "emailVerified") values (${personId}, 'Ana', ${email}, false)`;
      const registering = browser.register(body.ticket);
      await until(async () => (await admin`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock'`)[0].n > 0);
      await other`commit`;
      assert.equal((await registering).status, 409);
    } finally {
      other.release();
    }
    assert.equal((await browser.json('/api/invite', { token })).status, 200);
  });

  test('a passkey belongs to one account', async () => {
    const ana = new Browser(homing.url);
    await join(ana, 'Ana');
    const ben = new Browser(homing.url);
    const { body } = await ben.json('/api/join', { token: await invite(), name: 'Ben', email: `ben-${tag()}@beta.test` });
    assert.notEqual((await ben.register(body.ticket, Buffer.from(ana.passkeys.credentials[0].id))).status, 200);
    await ana.signOut();
    assert.equal((await ana.signIn()).status, 200);
  });

  test('Homing’s own requests are refused from other sites', async () => {
    const response = await fetch(new URL('/api/join', homing.url), {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
      body: JSON.stringify({ token: await invite(), name: 'Mallory', email: `mallory-${tag()}@evil.test` }),
    });
    assert.equal(response.status, 403);
  });

  test('you can’t accept an invite while signed in', async () => {
    const browser = new Browser(homing.url);
    await join(browser, 'Ana');
    const second = await browser.json('/api/join', { token: await invite(), name: 'Ana again', email: `ana-${tag()}@acme.test` });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'SIGNED_IN');
  });
});

describe('a server others can reach', () => {
  const authDatabase = inTestDatabase(authDatabaseUrl);

  test('needs a secret of its own', async () => {
    // Listening beyond this machine, or reached at a public address, the development secret won't do.
    for (const options of [{ host: '0.0.0.0' }, { host: '127.0.0.1', url: new URL('https://homing.example.com') }]) {
      const started = await startServer(db, { port: 0, authDatabase, ...options }).catch((error: Error) => error);
      if (!(started instanceof Error)) {
        await started.close();
        assert.fail(`started without a secret: ${JSON.stringify(options)}`);
      }
      assert.match(started.message, /HOMING_SECRET/);
    }
  });

  test('limits sign-in attempts per client, whatever address the client claims', async () => {
    const attempts = async (homing: Homing) => {
      const statuses = [];
      for (let i = 1; i <= 5; i++) {
        const response = await fetch(new URL('/api/auth/sign-in/email', homing.url), {
          method: 'POST',
          headers: {
            origin: homing.url.origin,
            'content-type': 'application/json',
            'x-forwarded-for': `203.0.113.${i}`,
            'x-homing-client-address': `198.51.100.${i}`,
          },
          body: JSON.stringify({ email: `nobody-${tag()}@acme.test`, password: 'not the password' }),
        });
        statuses.push(response.status);
      }
      return statuses;
    };

    const direct = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase, rateLimit: true });
    try {
      assert.ok((await attempts(direct)).includes(429));
    } finally {
      await direct.close();
    }
    // Behind a proxy Homing trusts, the address it forwarded for counts instead.
    const proxied = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase, rateLimit: true, trustedProxies: '127.0.0.1, ::1' });
    try {
      assert.ok(!(await attempts(proxied)).includes(429));
    } finally {
      await proxied.close();
    }
  });
});

test('the instance admin sees nothing of other people’s spaces', async () => {
  const ana = await person('Ana');
  await admin`update people set instance_admin = true where id = ${ana.id}`;
  const ben = await person('Ben');
  const beta = await as(ben, (s) => createSpace(s, { name: 'Beta' }));
  const spaces = await as(ana, listSpaces);
  assert.ok(!spaces.some((space) => space.id === beta));
});

test('Better Auth finds every table and column it needs', async () => {
  const homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl) });
  try {
    const { toBeCreated, toBeAdded } = await getMigrations(homing.auth.options);
    assert.deepEqual(toBeCreated.map((table) => table.table), []);
    assert.deepEqual(toBeAdded.map((table) => table.table), []);
  } finally {
    await homing.close();
  }
});

/** Someone joins with a passkey through a new invite, and is signed in. */
async function join(browser: Browser, name: string) {
  const email = `${name.toLowerCase()}-${tag()}@example.test`;
  const joined = await browser.join(await invite(), { name, email });
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  return { id: joined.body.user.id as string, email };
}

function fragment(link: string | undefined): string {
  assert.ok(link);
  return new URL(link).hash.slice(1);
}

const tag = () => randomBytes(4).toString('hex');
