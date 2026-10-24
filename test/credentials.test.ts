// Sealing a connection's credentials, and reading the certificate Homing proves itself to
// Microsoft with (spec §7, guarantee 5). Pure logic, with the cases a self-hoster can get wrong.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { certificateCredential, microsoftFromEnvironment } from '../src/microsoft.ts';
import { SealBroken, vault } from '../src/vault.ts';
import { makeCertificate } from './microsoft.ts';

const secret = 'a-test-secret-that-is-long-enough-for-homing';

test('sealed credentials open only for where they were sealed, with the same secret, unchanged', () => {
  const keys = vault(secret);
  const sealed = keys.seal('refresh-token-of-ana', 'connection 1 refresh token');
  assert.ok(!sealed.includes('refresh-token-of-ana'));
  assert.equal(keys.open(sealed, 'connection 1 refresh token'), 'refresh-token-of-ana');
  // The same text seals differently each time.
  assert.notDeepEqual(keys.seal('refresh-token-of-ana', 'connection 1 refresh token'), sealed);

  assert.throws(() => keys.open(sealed, 'connection 2 refresh token'), SealBroken);
  assert.throws(() => keys.open(sealed, 'connection 1 access token'), SealBroken);
  assert.throws(() => vault('another-secret-that-is-long-enough-for-homing').open(sealed, 'connection 1 refresh token'), SealBroken);
  for (const at of [0, 1, 20, sealed.length - 1]) {
    const changed = Buffer.from(sealed);
    changed[at] ^= 1;
    assert.throws(() => keys.open(changed, 'connection 1 refresh token'), SealBroken, `byte ${at}`);
  }
  assert.throws(() => keys.open(sealed.subarray(0, 20), 'connection 1 refresh token'), SealBroken);
});

test('Microsoft is set up from the environment, with a certificate as a file or as a PEM, or a secret', () => {
  assert.equal(microsoftFromEnvironment({}), undefined);
  const pem = makeCertificate();
  const folder = mkdtempSync(join(tmpdir(), 'homing-pem-'));
  try {
    writeFileSync(join(folder, 'microsoft.pem'), pem);
    const fromFile = microsoftFromEnvironment({ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CERTIFICATE: join(folder, 'microsoft.pem') });
    const fromText = microsoftFromEnvironment({ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CERTIFICATE: pem.replaceAll('\n', '\\n'), MICROSOFT_TENANT: 'organizations' });
    assert.equal(fromFile?.tenant, 'common');
    assert.equal(fromText?.tenant, 'organizations');
    assert.ok(fromFile && 'thumbprint' in fromFile.credential && fromText && 'thumbprint' in fromText.credential);
    assert.equal(fromFile.credential.thumbprint, fromText.credential.thumbprint);
    assert.match(fromFile.credential.thumbprint, /^[\w-]{43}$/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  assert.deepEqual(microsoftFromEnvironment({ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CLIENT_SECRET: 'shh' })?.credential, { secret: 'shh' });
});

test('a Microsoft setting Homing can’t use stops it from starting, saying which, without showing the key', () => {
  const pem = makeCertificate();
  const key = /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/.exec(pem)![0];
  const certificate = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)![0];
  const otherKey = /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/.exec(makeCertificate())![0];
  for (const [settings, message] of [
    [{ MICROSOFT_CLIENT_ID: 'app' }, /MICROSOFT_CERTIFICATE, or MICROSOFT_CLIENT_SECRET/],
    [{ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CLIENT_SECRET: 'shh', MICROSOFT_TENANT: 'common/../x' }, /MICROSOFT_TENANT/],
    [{ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CERTIFICATE: '/nowhere/microsoft.pem' }, /neither a PEM nor a file/],
    [{ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CERTIFICATE: certificate }, /both the private key/],
    [{ MICROSOFT_CLIENT_ID: 'app', MICROSOFT_CERTIFICATE: otherKey + certificate }, /the certificate’s/],
  ] as const) {
    assert.throws(() => microsoftFromEnvironment(settings), (error: Error) => message.test(error.message) && !error.message.includes(key.slice(40, 80)));
  }
  assert.ok(certificateCredential(certificate + key).thumbprint, 'the order in the PEM doesn’t matter');
});
