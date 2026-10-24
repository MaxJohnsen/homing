// What moving to connectors (#128) does to what was there before it, such as a mailbox connected
// on a live Homing: the connection and its place stay as they were and keep working, the uses
// recorded say what Homing did the way every system's do now, and sources keep their mail:…
// references, which still lead to the mailbox. Nothing stored is rewritten.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { connectorsFor } from '../src/connectors.ts';
import { connect, withPrincipal, type Principal, type Session } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { redeem, signInAddress } from '../src/microsoft.ts';
import { parseReference, placesFor, readFor } from '../src/places.ts';
import { developmentSecret } from '../src/server.ts';
import { createPerson, createSpace } from '../src/spaces.ts';
import { vault } from '../src/vault.ts';
import { MicrosoftStandIn, type Account } from './microsoft.ts';
import { freshDatabase } from './reset.ts';

let urls: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof connect>, admin: ReturnType<typeof connect>;
let microsoft: MicrosoftStandIn;
let ana: string, acme: string;
let connection: string, place: string, email: string;
const keys = vault(developmentSecret);
const account: Account = { tenant: '7d2b1c9e-0000-4000-8000-0000000ac3e0', oid: crypto.randomUUID(), address: 'ana@acme.test', name: 'Ana Berg' };

const as = <T>(principal: Principal, fn: (s: Session) => Promise<T>) => withPrincipal(app, principal, fn);

before(async () => {
  const next = (await readdir('migrations')).find((file) => file.endsWith('_connectors.sql'))!;
  urls = await freshDatabase('connectors', { before: next });
  app = connect(urls.app);
  admin = connect(urls.admin);
  microsoft = await new MicrosoftStandIn().start();
  ana = (await createPerson(admin, 'Ana')).id;
  acme = await as({ person: ana, direct: true }, (s) => createSpace(s, { name: 'Acme' }));

  // As connecting left a mailbox before: one step for the connection and its place, with the
  // sign-in Microsoft gave, sealed.
  const verifier = randomBytes(32).toString('base64url');
  const redirectUri = 'https://homing.test/connections/microsoft/callback';
  const asked = signInAddress(microsoft.settings(), { redirectUri, state: 'state', challenge: createHash('sha256').update(verifier).digest('base64url'), nonce: 'nonce' });
  const code = new URL(microsoft.signIn(asked.toString(), account)).searchParams.get('code')!;
  const grant = await redeem(microsoft.settings(), { code, verifier, redirectUri, nonce: 'nonce' });
  [{ connectionId: connection, placeId: place }] = await as({ person: ana, direct: true }, async (s) => {
    const made = await s.tx<{ connectionId: string; placeId: string }[]>`
      select * from connect_mailbox(${acme}::uuid, 'microsoft', ${grant.tenant}, ${grant.account}, ${account.address}, ${account.name}, ${s.tx.array(grant.scopes)}::text[])
    `;
    const id = made[0].connectionId;
    await s.tx`
      select keep_credentials(${id}::uuid, ${keys.seal(grant.tokens.refresh, `connection ${id} refresh token`)}, ${keys.seal(grant.tokens.access, `connection ${id} access token`)}, ${grant.tokens.expiresAt})
    `;
    return made;
  });

  // Her assistant searched the mailbox and read an email in it, and kept it as a source, as Homing recorded them.
  email = microsoft.deliver(account, { from: { name: 'Gunnar Lie', address: 'gunnar@northwind.test' }, to: [{ name: 'Ana Berg', address: account.address }], subject: 'Budget', html: '<p>NOK 2 million for 2027.</p>', at: new Date() });
  await as({ person: ana, agent: 'Claude' }, async (s) => {
    for (const operation of ['search mail', 'read mail']) {
      await s.tx`
        insert into connection_uses (connection_id, place_id, space_id, private_to, operation, agent)
        values (${connection}, ${place}, ${acme}, ${ana}, ${operation}, 'Claude')
      `;
    }
    await s.tx`
      insert into sources (space_id, private_to, reference, excerpt, read_through)
      values (${acme}, ${ana}, ${`mail:${place}:${email}`}, 'From: Gunnar Lie <gunnar@northwind.test>', ${connection})
    `;
  });
  await migrate(urls.admin, urls.app, urls.auth);
});

after(async () => {
  await microsoft.close();
  await app.end();
  await admin.end();
});

test('the connection and its place stay as they were', async () => {
  const [stored] = await admin`
    select c.provider, c.address, c.status, c.revoked_at, p.kind, p.resource, p.name, p.removed_at
    from connections c join places p on p.connection_id = c.id where p.id = ${place}
  `;
  assert.deepEqual(stored, { provider: 'microsoft', address: account.address, status: 'connected', revokedAt: null, kind: 'mailbox', resource: account.oid, name: null, removedAt: null });
  assert.deepEqual(
    (await as({ person: ana, agent: 'Claude' }, (s) => placesFor(s, acme))).map(({ place, connector, kind, name, address, status }) => ({ place, connector, kind, name, address, status })),
    [{ place, connector: 'microsoft', kind: 'mailbox', name: null, address: account.address, status: 'connected' }],
  );
});

test('the uses recorded say what Homing did, the way every system’s do now', async () => {
  const uses = await admin`select operation, place_id, agent from connection_uses where connection_id = ${connection} order by used_at`;
  assert.deepEqual([...uses], [
    { operation: 'search', placeId: place, agent: 'Claude' },
    { operation: 'read', placeId: place, agent: 'Claude' },
  ]);
});

test('a source kept with mail:… is as it was, and its reference still reads the email, recording the use', async () => {
  const [source] = await admin`select reference, read_through, audience from sources where read_through = ${connection}`;
  assert.deepEqual(source, { reference: `mail:${place}:${email}`, readThrough: connection, audience: null });
  const broker = { sql: app, vault: keys, connectors: connectorsFor({ microsoft: microsoft.settings() }) };
  const read = await readFor(broker, { person: ana, agent: 'Claude', clientId: 'claude' }, parseReference(broker.connectors, source.reference)!);
  assert.ok(read && 'item' in read, JSON.stringify(read));
  assert.equal(read.item.envelope.title, 'Budget');
  assert.equal(read.place.place, place);
  assert.deepEqual((await admin`select operation from connection_uses where connection_id = ${connection} order by used_at`).map((use) => use.operation), ['search', 'read', 'read']);
});

test('connecting in one step is gone: an account, then its place', async () => {
  await assert.rejects(admin`select * from connect_mailbox(${acme}::uuid, 'microsoft', 't', 'a', 'x@acme.test', null, '{Mail.Read}')`, /does not exist/);
});
