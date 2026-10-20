// Inviting people and getting back in, issue #5. The instance admin invites
// people, who join with a passkey or a password. Someone who can't sign in
// gets a one-time link: by email only to a verified address, or from whoever
// runs the server. Nobody gets into someone else's account this way.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { authDatabaseUrl } from '../src/db.ts';
import type { Email } from '../src/email.ts';
import { createInvite } from '../src/invites.ts';
import { operatorSignInLink } from '../src/recovery.ts';
import { startServer, type Homing } from '../src/server.ts';
import { Browser } from './browser.ts';
import { admin, as, authDb, db, member, refused, type Member } from './helpers.ts';
import { inTestDatabase } from './reset.ts';

let homing: Homing;
const outbox: Email[] = [];
/** While set, sending email waits for it. */
let stalled: Promise<void> | undefined;

before(async () => {
  homing = await startServer(db, {
    port: 0,
    host: '127.0.0.1',
    authDatabase: inTestDatabase(authDatabaseUrl),
    mailer: async (email) => {
      await stalled;
      outbox.push(email);
    },
  });
});

after(() => homing.close());

/** Someone who looks after this Homing. */
async function instanceAdmin(): Promise<Member> {
  const ida = await member(homing.url, 'Ida');
  await admin`update people set instance_admin = true where id = ${ida.id}`;
  return ida;
}

const tag = () => randomBytes(4).toString('hex');
const tokenOf = (link: string) => new URL(link).hash.slice(1);
/** The last email sent to an address. */
const mailTo = (address: string) => outbox.findLast((email) => email.to === address);
const linkIn = (email: Email | undefined) => /https?:\/\/\S+/.exec(email?.text ?? '')?.[0];

describe('inviting people', () => {
  test('the instance admin invites someone, who joins with a password', async () => {
    const ida = await instanceAdmin();
    const invited = await ida.browser.json('/api/invites', {});
    assert.equal(invited.status, 200);
    assert.equal(invited.body.emailed, false);

    const ben = new Browser(homing.url);
    const token = tokenOf(invited.body.link);
    assert.deepEqual((await ben.json('/api/invite', { token })).body, { instanceAdmin: false, email: null, invitedBy: 'Ida' });
    const email = `ben-${tag()}@beta.test`;
    const { body } = await ben.json('/api/join', { token, name: 'Ben', email });
    assert.equal((await ben.json('/api/join/password', { ticket: body.ticket, password: 'short' })).status, 400);
    assert.equal((await ben.json('/api/join/password', { ticket: body.ticket, password: 'correct horse battery' })).status, 200);
    const me = await ben.json('/api/me');
    assert.equal(me.body.name, 'Ben');
    assert.equal(me.body.password, true);
    assert.deepEqual(me.body.passkeys, []);

    await ben.signOut();
    const wrong = await ben.json('/api/auth/sign-in/email', { email, password: 'not the password' });
    assert.equal(wrong.status, 401);
    // A wrong password reads the same as an account that doesn't exist.
    assert.deepEqual(await ben.json('/api/auth/sign-in/email', { email: `nobody-${tag()}@beta.test`, password: 'not the password' }), wrong);
    assert.equal((await ben.json('/api/auth/sign-in/email', { email, password: 'correct horse battery' })).status, 200);
    // The invite is used up.
    assert.equal((await new Browser(homing.url).json('/api/invite', { token })).status, 410);
  });

  test('only the instance admin invites people, and only in person', async () => {
    const ida = await instanceAdmin();
    const cara = await member(homing.url, 'Cara');
    assert.equal((await cara.browser.json('/api/invites', {})).status, 403);
    // Not through an assistant acting for the instance admin, nor without editing directly.
    for (const principal of [{ person: ida.id, agent: 'Claude' }, { person: ida.id }]) {
      await assert.rejects(as(principal, (s) => createInvite(s, homing.url)), refused);
    }
    await as({ person: ida.id, direct: true }, (s) => createInvite(s, homing.url));
  });

  test('people come only from invites', async () => {
    await assert.rejects(db`select create_person('Mallory')`, refused);
  });

  test('an invite sent by email verifies the address it is accepted with', async () => {
    const ida = await instanceAdmin();
    const cara = `cara-${tag()}@acme.test`;
    const sent = await ida.browser.json('/api/invites', { email: cara });
    // The link goes only to that address, so the sender can't use it to claim it.
    assert.deepEqual([sent.body.emailed, sent.body.link], [true, undefined]);
    const token = tokenOf(linkIn(mailTo(cara))!);
    assert.equal((await new Browser(homing.url).json('/api/invite', { token })).body.email, cara);
    const joined = await new Browser(homing.url).join(token, { name: 'Cara', email: cara });
    assert.equal(joined.body.user.emailVerified, true);

    // Joining with another address doesn't verify it.
    const dan = `dan-${tag()}@acme.test`;
    await ida.browser.json('/api/invites', { email: dan });
    const elsewhere = await new Browser(homing.url).join(tokenOf(linkIn(mailTo(dan))!), { name: 'Dan', email: `dan-${tag()}@elsewhere.test` });
    assert.equal(elsewhere.body.user.emailVerified, false);
  });

  test('the instance admin signs in only with passkeys', async () => {
    const ida = await instanceAdmin();
    const refusal = await ida.browser.json('/api/account/password', { password: 'correct horse battery' });
    assert.equal(refusal.status, 403);
    assert.equal((await authDb`select count(*)::int as n from auth.account where "userId" = ${ida.id}`)[0].n, 0);
  });

  test('adding a password needs a recent sign-in', async () => {
    const cara = await member(homing.url, 'Cara');
    await authDb`update auth.session set "createdAt" = now() - interval '25 hours' where "userId" = ${cara.id}`;
    const stale = await cara.browser.json('/api/account/password', { password: 'correct horse battery' });
    assert.equal(stale.body.code, 'SIGN_IN_AGAIN');
  });
});

describe('getting back in', () => {
  test('a sign-in link goes only to a verified email, and works once', async () => {
    const ida = await instanceAdmin();
    const address = `cara-${tag()}@acme.test`;
    await ida.browser.json('/api/invites', { email: address });
    await new Browser(homing.url).join(tokenOf(linkIn(mailTo(address))!), { name: 'Cara', email: address });

    const dan = await member(homing.url, 'Dan', { verified: false });
    const ask = (email: string) => new Browser(homing.url).json('/api/auth/sign-in/magic-link', { email, callbackURL: '/account?recovered' });
    const answers = [await ask(address), await ask(dan.email), await ask(`nobody-${tag()}@acme.test`)];
    // The same answer whatever the address, so the page never says whether an account exists.
    assert.deepEqual(new Set(answers.map((answer) => JSON.stringify(answer))).size, 1);
    assert.equal(mailTo(dan.email), undefined);

    const link = new URL(linkIn(mailTo(address))!);
    const lost = new Browser(homing.url);
    const used = await lost.fetch(link.pathname + link.search);
    const landing = new URL(used.headers.get('location')!, homing.url);
    assert.equal(landing.origin + landing.pathname + landing.search, new URL('/account?recovered', homing.url).toString());
    assert.equal((await lost.json('/api/me')).body.name, 'Cara');
    // A fresh sign-in, so a new passkey can be added straight away.
    assert.equal((await lost.addPasskey()).status, 200);

    const again = new Browser(homing.url);
    await again.fetch(link.pathname + link.search);
    assert.equal((await again.json('/api/me')).status, 401);
  });

  test('whoever runs the server can give someone a sign-in link, which changes nothing else', async () => {
    const ida = await instanceAdmin();
    const ben = new Browser(homing.url);
    const email = `ben-${tag()}@beta.test`;
    const { body } = await ben.json('/api/join', { token: tokenOf((await ida.browser.json('/api/invites', {})).body.link), name: 'Ben', email });
    await ben.json('/api/join/password', { ticket: body.ticket, password: 'correct horse battery' });

    const link = new URL((await operatorSignInLink(homing.auth, homing.url, email.toUpperCase()))!);
    const lost = new Browser(homing.url);
    const used = await lost.fetch(link.pathname + link.search);
    assert.equal(new URL(used.headers.get('location')!, homing.url).pathname, '/account');
    const me = (await lost.json('/api/me')).body;
    assert.equal(me.name, 'Ben');
    // It says nothing about who owns the address, so the address stays unverified,
    // the password stays, and Ben's other sessions go on.
    assert.equal(me.emailVerified, false);
    assert.equal(me.password, true);
    assert.equal((await ben.json('/api/me')).status, 200);

    // It works once.
    const again = new Browser(homing.url);
    await again.fetch(link.pathname + link.search);
    assert.equal((await again.json('/api/me')).status, 401);
    assert.equal(await operatorSignInLink(homing.auth, homing.url, `nobody-${tag()}@acme.test`), undefined);
  });

  test('asking for a sign-in link takes no longer for a verified address', { timeout: 5000 }, async () => {
    const ida = await instanceAdmin();
    const address = `cara-${tag()}@acme.test`;
    await ida.browser.json('/api/invites', { email: address });
    await new Browser(homing.url).join(tokenOf(linkIn(mailTo(address))!), { name: 'Cara', email: address });
    // Sending stalls; the answer comes anyway, without waiting for it.
    let release = () => {};
    stalled = new Promise<void>((resolve) => (release = resolve));
    try {
      const answer = await new Browser(homing.url).json('/api/auth/sign-in/magic-link', { email: address, callbackURL: '/account?recovered' });
      assert.equal(answer.status, 200);
    } finally {
      release();
      stalled = undefined;
    }
  });

  test('you verify your own email, and nobody else’s', async () => {
    const dan = await member(homing.url, 'Dan', { verified: false });
    const cara = await member(homing.url, 'Cara', { verified: false });
    assert.equal((await new Browser(homing.url).json('/api/auth/send-verification-email', { email: cara.email })).status, 401);
    assert.equal((await dan.browser.json('/api/auth/send-verification-email', { email: cara.email })).status, 401);
    assert.equal(mailTo(cara.email), undefined);

    assert.equal((await dan.browser.json('/api/auth/send-verification-email', { email: dan.email, callbackURL: '/account?verified' })).status, 200);
    const link = new URL(linkIn(mailTo(dan.email))!);
    await dan.browser.fetch(link.pathname + link.search);
    assert.equal((await dan.browser.json('/api/me')).body.emailVerified, true);
  });
});

test('with passwords off, nobody joins with one', async () => {
  const strict = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), mailer: undefined, passwords: false });
  try {
    const ida = await member(strict.url, 'Ida', { verified: false });
    await admin`update people set instance_admin = true where id = ${ida.id}`;
    const browser = new Browser(strict.url);
    const { body } = await browser.json('/api/join', { token: tokenOf((await ida.browser.json('/api/invites', {})).body.link), name: 'Ben', email: `ben-${tag()}@beta.test` });
    assert.equal((await browser.json('/api/join/password', { ticket: body.ticket, password: 'correct horse battery' })).status, 404);
  } finally {
    await strict.close();
  }
});
