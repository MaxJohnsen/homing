// Issue #122, connecting a Microsoft 365 mailbox inside a space, only for you (spec §7, §8,
// guarantee 5). Ana connects her work mailbox in Acme, which Cara shares with her. She signs in on
// Microsoft's own page, and Homing keeps the account's sign-in sealed, where only her own use of it
// reaches it: never Cara, never her assistant, never a log, an error, an answer or an export. Cara
// can't tell it's there. Revoking the account stops it everywhere at once; removing it from one
// space leaves the account. Microsoft is a stand-in that keeps Microsoft's side of the rules.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { accessToken, ConnectionUnusable } from '../src/connections.ts';
import { authDatabaseUrl } from '../src/db.ts';
import { createPage, readItem, writeItem } from '../src/knowledge.ts';
import { developmentSecret, startServer, type Homing } from '../src/server.ts';
import { addMember, createSpace } from '../src/spaces.ts';
import { vault } from '../src/vault.ts';
import { Assistant, assistants, testAssistants } from './assistant.ts';
import { Browser } from './browser.ts';
import { admin, as, db, member, refused, until, type Member } from './helpers.ts';
import { MicrosoftStandIn, type Account } from './microsoft.ts';
import { inTestDatabase } from './reset.ts';

// The secret a local Homing uses, as every test server does: its sign-in keys are shared through the test database.
const keys = vault(developmentSecret);
let microsoft: MicrosoftStandIn;
let homing: Homing;
let ana: Member, cara: Member;
let acme: string;
let n = 0;

/** A work account in Acme's directory, a new one each time so tests don't share connections. */
const work = (who: string): Account => ({
  tenant: '7d2b1c9e-0000-4000-8000-0000000ac3e0',
  oid: crypto.randomUUID(),
  address: `${who.toLowerCase()}.${++n}@acme.test`,
  name: `${who} Berg`,
});

/** What someone's browser is told, and where it's sent. */
async function start(who: Member, space: string, body: Record<string, unknown> = {}) {
  const started = await who.browser.json(`/api/spaces/${space}/connections/microsoft`, body);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return started.body.url as string;
}

/** Microsoft sends the browser back; Homing answers with where to go next. */
async function back(who: Member | { browser: Member['browser'] }, callback: string) {
  const url = new URL(callback);
  const answer = await who.browser.fetch(url.pathname + url.search);
  assert.equal(answer.status, 302);
  return answer.headers.get('location')!;
}

/** Ana connects an account in a space, all the way. */
async function connect(who: Member, space: string, account: Account) {
  const to = await back(who, microsoft.signIn(await start(who, space), account));
  assert.equal(to, `/spaces/${space}/connections?connection=connected`, logged.join('\n'));
  const listed = await who.browser.json(`/api/spaces/${space}/connections`);
  return listed.body.places.find((place: { connection: { address: string } }) => place.connection.address === account.address) as {
    id: string;
    connection: { id: string; address: string; status: string; can: string[] };
    elsewhere: { id: string; name: string; personal: boolean }[];
  };
}

const connectionsIn = async (who: Member, space: string) => (await who.browser.json(`/api/spaces/${space}/connections`)).body.places as { id: string; connection: { id: string; status: string } }[];
const accounts = async (who: Member) => (await who.browser.json('/api/connections')).body.connections as { id: string; address: string; status: string; places: { id: string; space: { id: string; name: string; personal: boolean } }[] }[];
const broker = () => ({ sql: db, vault: keys, microsoft: microsoft.settings() });

// What Homing writes to its log while each test runs, so a test can show no token is in it.
let logged: string[] = [];
const original = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  logged = [];
});

before(async () => {
  microsoft = await new MicrosoftStandIn().start();
  for (const level of ['log', 'error', 'warn'] as const) {
    console[level] = (...values: unknown[]) => void logged.push(values.map((value) => (value instanceof Error ? `${value.message} ${value.stack} ${String((value as { cause?: unknown }).cause)}` : String(value))).join(' '));
  }
  homing = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), microsoft: microsoft.settings(), ...testAssistants });
  [ana, cara] = [await member(homing.url, 'Ana'), await member(homing.url, 'Cara')];
  acme = await as(ana, async (s) => {
    const acme = await createSpace(s, { name: 'Acme' });
    await addMember(s, acme, cara.id);
    return acme;
  });
});

after(async () => {
  Object.assign(console, original);
  await homing.close();
  await microsoft.close();
});

test('Ana connects her work mailbox in Acme, only for her, signing in on Microsoft’s page', async () => {
  const address = new URL(await start(ana, acme));
  const asked = address.searchParams;
  assert.equal(address.origin + address.pathname, `${microsoft.url}/common/oauth2/v2.0/authorize`);
  assert.equal(asked.get('client_id'), microsoft.clientId);
  assert.equal(asked.get('redirect_uri'), new URL('/connections/microsoft/callback', homing.url).toString());
  assert.equal(asked.get('scope'), 'openid profile email offline_access User.Read Mail.Read');
  assert.deepEqual([asked.get('response_type'), asked.get('response_mode'), asked.get('code_challenge_method')], ['code', 'query', 'S256']);
  for (const name of ['state', 'nonce', 'code_challenge']) assert.ok((asked.get(name) ?? '').length >= 32, name);

  const account = work('Ana');
  const to = await back(ana, microsoft.signIn(address.toString(), account));
  assert.equal(to, `/spaces/${acme}/connections?connection=connected`);
  // Homing proved it's the app with its certificate, and checked the account's mailbox with Graph.
  assert.ok(microsoft.asked.assertions >= 1);
  assert.ok(microsoft.asked.graph >= 2);

  const listed = await ana.browser.json(`/api/spaces/${acme}/connections`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.microsoft, true);
  const [place] = listed.body.places;
  assert.deepEqual(
    { kind: place.kind, service: place.connection.service, address: place.connection.address, name: place.connection.name, can: place.connection.can, status: place.connection.status },
    { kind: 'mailbox', service: 'Microsoft 365', address: account.address, name: 'Ana Berg', can: ['read mail'], status: 'connected' },
  );
  const [connection] = (await accounts(ana)).filter((candidate) => candidate.address === account.address);
  assert.deepEqual(connection.places.map((used) => used.space), [{ id: acme, name: 'Acme', personal: false }]);

  // At rest the tokens are sealed, bound to the connection, and open only with the server's secret.
  const [stored] = await admin`select refresh_token, access_token from credentials where connection_id = ${connection.id}`;
  const [refreshToken, accessTokenText] = microsoft.issued.slice(-2).reverse();
  for (const [sealed, token] of [[stored.refreshToken, refreshToken], [stored.accessToken, accessTokenText]] as const) {
    assert.ok(!Buffer.from(sealed).includes(token));
    assert.ok(!Buffer.from(sealed).toString('base64').includes(Buffer.from(token).toString('base64').slice(4, 20)));
  }
  assert.equal(keys.open(stored.refreshToken, `connection ${connection.id} refresh token`), refreshToken);
  assert.throws(() => keys.open(stored.refreshToken, `connection ${connection.id} access token`), /don’t open/);
  assert.throws(() => vault('another-secret-that-is-long-enough-too').open(stored.refreshToken, `connection ${connection.id} refresh token`), /don’t open/);

  // Nothing Homing answered or logged holds a token.
  const answers = JSON.stringify([listed.body, await accounts(ana), (await ana.browser.json('/api/me')).body]);
  for (const token of microsoft.issued) {
    assert.ok(!answers.includes(token));
    assert.ok(!logged.join('\n').includes(token));
  }
});

test('connecting again with the same account, in another space, uses the same connection', async () => {
  const account = work('Ana');
  const inAcme = await connect(ana, acme, account);
  const inPersonal = await connect(ana, ana.personalSpaceId, account);
  assert.equal(inPersonal.connection.id, inAcme.connection.id);
  assert.deepEqual(inPersonal.elsewhere, [{ id: acme, name: 'Acme', personal: false }]);
  const again = await connect(ana, acme, account);
  assert.equal(again.id, inAcme.id, 'still one place in Acme');
  const [listed] = (await accounts(ana)).filter((candidate) => candidate.address === account.address);
  assert.deepEqual(listed.places.map((used) => used.space.personal).sort(), [false, true]);
});

const connectionsOfAna = async () => (await admin`select count(*)::int as count from connections where person_id = ${ana.id}`)[0].count as number;

describe('a sign-in that isn’t this person’s attempt, now, connects nothing', () => {
  test('a made-up state, or no session', async () => {
    const before = await connectionsOfAna();
    const callback = new URL(microsoft.signIn(await start(ana, acme), work('Ana')));
    callback.searchParams.set('state', 'made-up-state-that-homing-never-gave-anyone');
    assert.equal(await back(ana, callback.toString()), '/account?connection=expired');
    // Without being signed in, the browser that comes back gets nothing either.
    const stranger = { browser: new Browser(homing.url) };
    assert.equal(await back(stranger, microsoft.signIn(await start(ana, acme), work('Ana'))), '/account?connection=expired');
    assert.equal(await connectionsOfAna(), before);
  });

  test('someone else’s browser coming back with Ana’s code and state, or Ana’s in another session', async () => {
    const before = await connectionsOfAna();
    // Ana signed in on another device: an attempt started here doesn't finish there.
    const elsewhere = new Browser(homing.url);
    assert.equal((await elsewhere.signIn(ana.browser.passkeys)).status, 200);
    assert.equal(await back({ browser: elsewhere }, microsoft.signIn(await start(ana, acme), work('Ana'))), '/account?connection=expired');

    const callback = microsoft.signIn(await start(ana, acme), work('Ana'));
    assert.equal(await back(cara, callback), '/account?connection=expired');
    // And the attempt is used up, so it doesn't work for Ana afterwards either.
    assert.equal(await back(ana, callback), '/account?connection=expired');
    assert.equal(await connectionsOfAna(), before);
    assert.equal((await admin`select count(*)::int as count from connections where person_id = ${cara.id}`)[0].count, 0);
  });

  test('the same answer twice, a code used before, one for another attempt, or one that expired', async () => {
    const before = await connectionsOfAna();
    const account = work('Ana');
    const first = microsoft.signIn(await start(ana, acme), account);
    assert.equal(await back(ana, first), `/spaces/${acme}/connections?connection=connected`);
    const redeemed = microsoft.asked.codes;
    // Opening the same address again: the attempt is used up, so Homing doesn't even try the code.
    assert.equal(await back(ana, first), '/account?connection=expired');
    assert.equal(microsoft.asked.codes, redeemed);

    // The same answer twice at once: the attempt is used up by whichever comes first.
    const twice = microsoft.signIn(await start(ana, acme), account);
    const asked = microsoft.asked.codes;
    const answers = await Promise.all([back(ana, twice), back(ana, twice), back(ana, twice)]);
    assert.deepEqual(answers.filter((to) => to.endsWith('connection=connected')).length, 1, answers.join());
    assert.equal(microsoft.asked.codes, asked + 1);

    // The used code, brought back with a fresh attempt's state: Microsoft refuses it.
    const used = new URL(first).searchParams.get('code')!;
    const fresh = new URL(microsoft.signIn(await start(ana, acme), account));
    fresh.searchParams.set('code', used);
    assert.equal(await back(ana, fresh.toString()), `/spaces/${acme}/connections?connection=expired`);

    // A code never used, but issued for another attempt's PKCE challenge.
    const other = new URL(microsoft.signIn(await start(ana, acme), account)).searchParams.get('code')!;
    const mine = new URL(microsoft.signIn(await start(ana, acme), account));
    mine.searchParams.set('code', other);
    assert.equal(await back(ana, mine.toString()), `/spaces/${acme}/connections?connection=expired`);

    // A code that expired before it came back.
    assert.equal(await back(ana, microsoft.signIn(await start(ana, acme), account, { expired: true })), `/spaces/${acme}/connections?connection=expired`);
    assert.equal(await connectionsOfAna(), before + 1);
  });

  test('an ID token from another sign-in, for another app, or from another issuer', async () => {
    const before = await connectionsOfAna();
    const account = work('Ana');
    for (const idToken of [{ nonce: 'a-nonce-from-another-sign-in' }, { audience: crypto.randomUUID() }, { issuer: `https://login.example.test/${account.tenant}/v2.0` }]) {
      assert.equal(await back(ana, microsoft.signIn(await start(ana, acme), account, { idToken })), `/spaces/${acme}/connections?connection=failed`, JSON.stringify(idToken));
    }
    assert.match(logged.join('\n'), /invalid_id_token/);
    assert.equal(await connectionsOfAna(), before);
  });

  test('saying no on Microsoft’s page, or an account without a mailbox', async () => {
    const before = await connectionsOfAna();
    assert.equal(await back(ana, microsoft.decline(await start(ana, acme))), `/spaces/${acme}/connections?connection=declined`);
    assert.equal(await back(ana, microsoft.signIn(await start(ana, acme), { ...work('Ana'), noMailbox: true })), `/spaces/${acme}/connections?connection=no-mailbox`);
    assert.equal(await connectionsOfAna(), before);
  });

  test('a space Ana can’t open, or no longer can', async () => {
    const together = await as(cara, async (s) => {
      const space = await createSpace(s, { name: 'Beta projects' });
      await addMember(s, space, ana.id);
      return space;
    });
    const place = await connect(ana, together, work('Ana'));
    await as(cara, (s) => s.tx`select remove_member(${together}::uuid, ${ana.id}::uuid)`);
    // Her place there is out of sight with the space, even straight against the database.
    await as(ana, async (s) => assert.equal((await s.tx`select id from places where space_id = ${together}::uuid or id = ${place.id}::uuid`).length, 0));
    assert.equal((await ana.browser.json(`/api/spaces/${together}/connections`)).status, 404);
    assert.ok((await accounts(ana)).every((connection) => connection.places.every((used) => used.space.id !== together)));
    const startedThere = await ana.browser.json(`/api/spaces/${together}/connections/microsoft`, {});
    assert.equal(startedThere.status, 404);
  });

  test('a space Ana never could open', async () => {
    const theirs = await as(cara, (s) => createSpace(s, { name: 'Cara’s own' }));
    const refusedHere = await ana.browser.json(`/api/spaces/${theirs}/connections/microsoft`, {});
    const nowhere = await ana.browser.json(`/api/spaces/${crypto.randomUUID()}/connections/microsoft`, {});
    assert.deepEqual([refusedHere.status, refusedHere.body], [nowhere.status, nowhere.body]);
    assert.equal(refusedHere.status, 404);
    assert.equal((await ana.browser.json(`/api/spaces/${theirs}/connections`)).status, 404);
  });
});

test('Cara, in Acme with Ana, can’t discover or use Ana’s connection, through the app or the database', async () => {
  const account = work('Ana');
  const place = await connect(ana, acme, account);
  const seen: unknown[] = [];

  const hers = await cara.browser.json(`/api/spaces/${acme}/connections`);
  assert.deepEqual([hers.status, hers.body.places], [200, []]);
  const own = await cara.browser.json('/api/connections');
  assert.deepEqual(own.body.connections, []);
  seen.push(hers.body, own.body);
  // Removing or revoking what's Ana's answers as for something that doesn't exist, and changes nothing.
  for (const [path, nothing] of [
    [`/api/places/${place.id}/remove`, `/api/places/${crypto.randomUUID()}/remove`],
    [`/api/connections/${place.connection.id}/revoke`, `/api/connections/${crypto.randomUUID()}/revoke`],
  ]) {
    const tried = await cara.browser.json(path, {});
    const missing = await cara.browser.json(nothing, {});
    assert.deepEqual([tried.status, tried.body], [missing.status, missing.body]);
    assert.equal(tried.status, 404);
    seen.push(tried.body);
  }
  // Nor does she find it searching, or in what changed.
  for (const query of [account.address, 'Microsoft', 'mailbox']) seen.push((await cara.browser.json(`/api/search?q=${encodeURIComponent(query)}`)).body);
  seen.push((await cara.browser.json('/api/changes')).body);
  assert.doesNotMatch(JSON.stringify(seen), new RegExp(`${account.address}|${place.id}|${place.connection.id}|Ana Berg`));

  // Straight against the database, as Cara: no rows, no counts, no credentials, no changes.
  await as(cara, async (s) => {
    assert.equal((await s.tx`select count(*)::int as count from connections`)[0].count, 0);
    assert.equal((await s.tx`select count(*)::int as count from places`)[0].count, 0);
    assert.equal((await s.tx`select * from credentials_of(${place.connection.id}::uuid)`).length, 0);
  });
  await assert.rejects(as(cara, (s) => s.tx`select * from credentials`), refused);
  await assert.rejects(as(cara, (s) => s.tx`select keep_credentials(${place.connection.id}::uuid, '\\x00', null, null)`), refused);
  await assert.rejects(as(cara, (s) => s.tx`select connection_needs_attention(${place.connection.id}::uuid, '\\x00')`), refused);
  const caraInApp = { person: cara.id, direct: true as const };
  await as(caraInApp, async (s) => {
    assert.equal((await s.tx`select remove_place(${place.id}::uuid) as done`)[0].done, false);
    assert.equal((await s.tx`select revoke_connection(${place.connection.id}::uuid) as done`)[0].done, false);
  });
  await assert.rejects(as(caraInApp, (s) => s.tx`insert into places (connection_id, space_id, private_to, kind, resource) values (${place.connection.id}, ${acme}, ${cara.id}, 'mailbox', 'x')`), refused);
  await assert.rejects(as(caraInApp, (s) => s.tx`update connections set person_id = ${cara.id} where id = ${place.connection.id}`), refused);
  const [still] = await admin`select c.status, c.revoked_at, p.removed_at from connections c join places p on p.connection_id = c.id where p.id = ${place.id}`;
  assert.deepEqual(still, { status: 'connected', revokedAt: null, removedAt: null });
  // The credentials are still Ana's to use.
  assert.ok(await accessToken(broker(), ana.id, place.connection.id));
});

test('Ana’s assistant can’t read or use her credentials, or connect anything', async () => {
  const account = work('Ana');
  const place = await connect(ana, acme, account);
  const claude = { person: ana.id, agent: 'Claude' };
  await assert.rejects(as(claude, (s) => s.tx`select * from credentials_of(${place.connection.id}::uuid)`), refused);
  await assert.rejects(as(claude, (s) => s.tx`select * from credentials`), refused);
  await assert.rejects(as(claude, (s) => s.tx`select keep_credentials(${place.connection.id}::uuid, '\\x00', null, null)`), refused);
  await assert.rejects(as(claude, (s) => s.tx`select * from connect_mailbox(${acme}::uuid, 'microsoft', 't', 'a', 'x@acme.test', null, '{Mail.Read}')`), refused);
  await assert.rejects(as(claude, (s) => s.tx`select remove_place(${place.id}::uuid)`), refused);
  await assert.rejects(as(claude, (s) => s.tx`select revoke_connection(${place.connection.id}::uuid)`), refused);
  // Not even marked direct, which only Homing's own app does.
  await assert.rejects(as({ ...claude, direct: true }, (s) => s.tx`select * from credentials_of(${place.connection.id}::uuid)`), refused);

  // Over MCP, nothing an assistant can ask for brings up a token or the connection. The mailbox it
  // reaches is named by its address, so the assistant knows Homing can search it (#125).
  const assistant = new Assistant(homing.url, assistants.claude);
  await assistant.connect(ana.browser);
  const mcp = await assistant.open();
  const said: string[] = [];
  for (const query of [account.address, 'Microsoft 365', 'mailbox', 'token']) said.push((await mcp.call('search', { query })).text);
  said.push((await mcp.call('context', { request: 'What is in my Microsoft 365 mailbox?' })).text);
  // Reading the connection by its id gets nothing back but the reference it was given.
  for (const ref of [`connection:${place.connection.id}`, `place:${place.id}`]) {
    const read = await mcp.call('read', { ref });
    assert.equal(read.text, `"${ref}" isn't a reference. References look like page:… or item:….`);
  }
  await mcp.close();
  const all = said.join('\n');
  for (const token of microsoft.issued) assert.ok(!all.includes(token));
  assert.doesNotMatch(all, new RegExp(`${place.connection.id}|Microsoft 365, |refresh|access token`, 'i'));
  assert.match(all, new RegExp(`The user's mailboxes? .*${account.address}.* connected to Homing`));
});

test('Homing refreshes an expired sign-in, and one Microsoft refuses needs attention until Ana signs in again', async () => {
  const account = work('Ana');
  const place = await connect(ana, acme, account);
  const id = place.connection.id;

  // A current token is used as it is.
  const refreshes = microsoft.asked.refreshes;
  const first = await accessToken(broker(), ana.id, id);
  assert.equal(microsoft.asked.refreshes, refreshes);

  // Once it has expired, Homing refreshes it, keeps the new refresh token Microsoft gives, and uses the new one.
  await admin`update credentials set access_expires_at = now() - interval '1 minute' where connection_id = ${id}`;
  const [{ refreshedAt: before }] = await admin`select refreshed_at from connections where id = ${id}`;
  const second = await accessToken(broker(), ana.id, id);
  assert.notEqual(second, first);
  assert.equal(microsoft.asked.refreshes, refreshes + 1);
  const [stored] = await admin`select c.refresh_token, k.refreshed_at from credentials c join connections k on k.id = c.connection_id where c.connection_id = ${id}`;
  assert.equal(keys.open(stored.refreshToken, `connection ${id} refresh token`), microsoft.issued.at(-1));
  assert.ok(stored.refreshedAt > before);

  // Ana revokes Homing's access at Microsoft. The next refresh is refused, and the connection needs her.
  microsoft.refuse(account);
  await admin`update credentials set access_expires_at = now() - interval '1 minute' where connection_id = ${id}`;
  await assert.rejects(accessToken(broker(), ana.id, id), (error) => error instanceof ConnectionUnusable && error.reason === 'needs attention');
  assert.match(logged.join('\n'), /needs attention \(Microsoft refused: invalid_grant \(AADSTS50173\)\)/);
  const [shown] = (await connectionsIn(ana, acme)).filter((candidate) => candidate.id === place.id);
  assert.equal(shown.connection.status, 'needs attention');
  assert.equal((await accounts(ana)).find((candidate) => candidate.id === id)?.status, 'needs attention');
  // It isn't tried again behind her back.
  const tried = microsoft.asked.refreshes;
  await assert.rejects(accessToken(broker(), ana.id, id), (error) => error instanceof ConnectionUnusable && error.reason === 'needs attention');
  assert.equal(microsoft.asked.refreshes, tried);

  // Signing in again, for the same connection, brings it back.
  microsoft.allow(account);
  const again = await start(ana, acme, { again: id });
  assert.equal(new URL(again).searchParams.get('login_hint'), account.address);
  assert.equal(await back(ana, microsoft.signIn(again, account)), `/spaces/${acme}/connections?connection=connected`);
  assert.equal((await accounts(ana)).find((candidate) => candidate.id === id)?.status, 'connected');
  assert.ok(await accessToken(broker(), ana.id, id));

  // Sealed tokens that don't open, as after changing HOMING_SECRET, need attention too, and say so.
  await assert.rejects(accessToken({ ...broker(), vault: vault('a-different-secret-that-is-long-enough') }, ana.id, id), (error) => error instanceof ConnectionUnusable && error.reason === 'needs attention');
  for (const token of microsoft.issued) assert.ok(!logged.join('\n').includes(token));
});

test('signing in again with another account fixes nothing, and says so', async () => {
  const account = work('Ana');
  const place = await connect(ana, acme, account);
  microsoft.refuse(account);
  await admin`update credentials set access_expires_at = now() - interval '1 minute' where connection_id = ${place.connection.id}`;
  await assert.rejects(accessToken(broker(), ana.id, place.connection.id), ConnectionUnusable);

  const other = work('Ana');
  const before = await connectionsOfAna();
  assert.equal(await back(ana, microsoft.signIn(await start(ana, acme, { again: place.connection.id }), other)), `/spaces/${acme}/connections?connection=another-account`);
  assert.equal((await accounts(ana)).find((candidate) => candidate.id === place.connection.id)?.status, 'needs attention');
  assert.equal(await connectionsOfAna(), before, 'nor does the other account get connected');
  microsoft.allow(account);
});

describe('when Microsoft refuses a refresh', () => {
  const refreshRefused = async (error: string, number: number) => {
    const account = work('Ana');
    const place = await connect(ana, acme, account);
    microsoft.refuse(account, error, number);
    await admin`update credentials set access_expires_at = now() - interval '1 minute' where connection_id = ${place.connection.id}`;
    const outcome = await accessToken(broker(), ana.id, place.connection.id).then(() => 'used', (refusal: Error) => refusal);
    const [{ status }] = await admin`select status from connections where id = ${place.connection.id}`;
    return { outcome, status };
  };

  test('because Ana’s organization deleted Homing, turned it off, or doesn’t let her use it, her connection needs attention', async () => {
    for (const [error, number] of [['invalid_client', 700016], ['invalid_client', 7000112], ['unauthorized_client', 700016]] as const) {
      const { outcome, status } = await refreshRefused(error, number);
      assert.ok(outcome instanceof ConnectionUnusable && outcome.reason === 'needs attention', `${error} ${number}`);
      assert.equal(status, 'needs attention', `${error} ${number}`);
    }
  });

  test('because Homing’s own certificate or secret is wrong, nobody’s connection is blamed, and the log says what to check', async () => {
    for (const number of [700027, 7000215]) {
      const { outcome, status } = await refreshRefused('invalid_client', number);
      assert.ok(!(outcome instanceof ConnectionUnusable), String(number));
      assert.equal(status, 'connected');
    }
    assert.match(logged.join('\n'), /Microsoft refused this Homing itself \(Microsoft refused: invalid_client \(AADSTS7000215\)\)\. Check MICROSOFT_CLIENT_ID/);
  });
});

test('two sign-ins with the same account at once make one connection and one place', async () => {
  const account = work('Ana');
  const keep = (s: Parameters<Parameters<typeof as>[1]>[0]) => s.tx<{ connectionId: string; placeId: string }[]>`
    select * from connect_mailbox(${acme}::uuid, 'microsoft', ${account.tenant}, ${account.oid}, ${account.address}, null, ${s.tx.array(['User.Read', 'Mail.Read'])}::text[])
  `;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let kept = false;
  const first = as({ person: ana.id, direct: true }, async (s) => {
    const [row] = await keep(s);
    kept = true;
    await held;
    return row;
  });
  await until(async () => kept);
  const second = as({ person: ana.id, direct: true }, async (s) => (await keep(s))[0]);
  // The second waits for the first to commit.
  await until(async () => (await admin`select count(*)::int as count from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`)[0].count > 0);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(b, a);
  assert.equal((await admin`select count(*)::int as count from connections where account = ${account.oid}`)[0].count, 1);
});

test('a personal Microsoft account connects too', async () => {
  const personal: Account = { tenant: '9188040d-6c67-4c5b-b112-36a304b66dad', oid: `00000000-0000-0000-${crypto.randomUUID().slice(19)}`, address: `ana.${++n}@outlook.test`, name: 'Ana Berg' };
  const place = await connect(ana, ana.personalSpaceId, personal);
  assert.deepEqual([place.connection.address, place.connection.status], [personal.address, 'connected']);
  const [stored] = await admin`select tenant, account from connections where id = ${place.connection.id}`;
  assert.deepEqual(stored, { tenant: personal.tenant, account: personal.oid });
});

describe('a Homing set up for one organization’s directory', () => {
  const acmeDirectory = '7d2b1c9e-0000-4000-8000-0000000ac3e0';
  let pinned: Homing;
  let eve: Member;
  before(async () => {
    pinned = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), microsoft: { ...microsoft.settings(), tenant: acmeDirectory }, logRequests: false });
    eve = await member(pinned.url, 'Eve');
  });
  after(() => pinned.close());

  test('connects accounts from that directory, and no other', async () => {
    const elsewhere: Account = { ...work('Eve'), tenant: '0b6e3f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b' };
    const startedOther = new URL(await start(eve, eve.personalSpaceId));
    assert.equal(startedOther.pathname, `/${acmeDirectory}/oauth2/v2.0/authorize`);
    assert.equal(await back(eve, microsoft.signIn(startedOther.toString(), elsewhere)), `/spaces/${eve.personalSpaceId}/connections?connection=failed`);
    assert.equal(await back(eve, microsoft.signIn(await start(eve, eve.personalSpaceId), work('Eve'))), `/spaces/${eve.personalSpaceId}/connections?connection=connected`);
    assert.deepEqual((await admin`select tenant from connections where person_id = ${eve.id}`).map((row) => row.tenant), [acmeDirectory]);
  });
});

test('revoking an account stops everything relying on it, in every space, at once', async () => {
  const account = work('Ana');
  const inAcme = await connect(ana, acme, account);
  await connect(ana, ana.personalSpaceId, account);
  // What Ana kept in Acme meanwhile stays, and stays only hers.
  const kept = await as(ana, async (s) => {
    const page = await createPage(s, { spaceId: acme, title: 'Supplier talks' });
    return (await writeItem(s, { pageId: page, body: 'The supplier wants a two-year deal' })).id;
  });
  const id = inAcme.connection.id;
  const asked = microsoft.asked.refreshes + microsoft.asked.graph;

  const revoked = await ana.browser.json(`/api/connections/${id}/revoke`, {});
  assert.equal(revoked.status, 200);
  assert.ok(!(await accounts(ana)).some((candidate) => candidate.id === id));
  for (const space of [acme, ana.personalSpaceId]) assert.ok(!(await connectionsIn(ana, space)).some((place) => place.connection.id === id));
  await assert.rejects(accessToken(broker(), ana.id, id), (error) => error instanceof ConnectionUnusable && error.reason === 'gone');
  assert.equal(microsoft.asked.refreshes + microsoft.asked.graph, asked, 'Microsoft wasn’t asked anything');
  assert.equal((await admin`select count(*)::int as count from credentials where connection_id = ${id}`)[0].count, 0);
  // Revoking again finds nothing.
  assert.equal((await ana.browser.json(`/api/connections/${id}/revoke`, {})).status, 404);
  assert.equal((await as(ana, (s) => readItem(s, kept)))?.privateTo, ana.id);
  assert.equal(await as(cara, (s) => readItem(s, kept)), undefined);
});

test('removing the mailbox from one space leaves the account, and its use elsewhere', async () => {
  const account = work('Ana');
  const inAcme = await connect(ana, acme, account);
  await connect(ana, ana.personalSpaceId, account);

  const removed = await ana.browser.json(`/api/places/${inAcme.id}/remove`, {});
  assert.equal(removed.status, 200);
  assert.ok(!(await connectionsIn(ana, acme)).some((place) => place.id === inAcme.id));
  const [listed] = (await accounts(ana)).filter((candidate) => candidate.id === inAcme.connection.id);
  assert.deepEqual(listed.places.map((used) => used.space.personal), [true]);
  assert.equal(listed.status, 'connected');
  assert.ok(await accessToken(broker(), ana.id, inAcme.connection.id));
  assert.equal((await ana.browser.json(`/api/places/${inAcme.id}/remove`, {})).status, 404);
});

test('an export holds nothing of a connection', async () => {
  const account = work('Ana');
  const place = await connect(ana, acme, account);
  const exported = await ana.browser.fetch(`/api/spaces/${acme}/export`);
  assert.equal(exported.status, 200);
  const files = Object.entries(unzipSync(new Uint8Array(await exported.arrayBuffer()))).map(([path, bytes]) => `${path}\n${strFromU8(bytes)}`).join('\n');
  assert.doesNotMatch(files, new RegExp(`${account.address}|${place.id}|${place.connection.id}|${account.oid}`));
  for (const token of microsoft.issued) assert.ok(!files.includes(token));
});

test('without Microsoft set up, whoever looks after Homing is told, and nobody is offered what can’t work', async () => {
  const plain = await startServer(db, { port: 0, host: '127.0.0.1', authDatabase: inTestDatabase(authDatabaseUrl), microsoft: null, logRequests: false });
  try {
    const dan = await member(plain.url, 'Dan');
    const eve = await member(plain.url, 'Eve');
    await admin`update people set instance_admin = true where id = ${dan.id}`;
    const forDan = await dan.browser.json(`/api/spaces/${dan.personalSpaceId}/connections`);
    const forEve = await eve.browser.json(`/api/spaces/${eve.personalSpaceId}/connections`);
    assert.deepEqual(forDan.body, { microsoft: false, looksAfter: true, places: [] });
    assert.deepEqual(forEve.body, { microsoft: false, looksAfter: false, places: [] });
    const started = await eve.browser.json(`/api/spaces/${eve.personalSpaceId}/connections/microsoft`, {});
    assert.equal(started.status, 409);
    assert.equal((await eve.browser.fetch('/connections/microsoft/callback?code=x&state=y')).status, 404);
  } finally {
    await plain.close();
  }
});
