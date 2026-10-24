// Sealing the credentials of connections (spec §7, guarantee 5). Homing seals
// each one with AES-256-GCM before it reaches the database, under a key
// derived from HOMING_SECRET that only the server holds, and binds it to its
// connection and what it is, so a sealed token can't be passed off as another.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Seals and opens credentials. The key stays inside it. */
export interface Vault {
  /** The text sealed, for the place it's kept, such as a connection's refresh token. */
  seal(text: string, place: string): Buffer;
  /** The text sealed for this place, or SealBroken if it wasn't, or not with this key. */
  open(sealed: Uint8Array, place: string): string;
}

/** Sealed text that doesn't open: changed, sealed for somewhere else, or under another secret. */
export class SealBroken extends Error {
  override name = 'SealBroken';
  constructor() {
    super('The credentials don’t open with this secret.');
  }
}

// The format's version, then a 12-byte nonce, the ciphertext and a 16-byte tag. Another
// version, such as one under a new key, can sit beside it later.
const version = 1;

/** A vault whose key is derived from Homing's secret, for credentials and nothing else. */
export function vault(secret: string): Vault {
  const key = Buffer.from(hkdfSync('sha256', secret, 'homing', 'homing credentials, version 1', 32));
  return {
    seal(text, place) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from(place));
      const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from([version]), nonce, sealed, cipher.getAuthTag()]);
    },
    open(sealed, place) {
      const bytes = Buffer.from(sealed);
      if (bytes.length < 29 || bytes[0] !== version) throw new SealBroken();
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13));
        decipher.setAAD(Buffer.from(place));
        decipher.setAuthTag(bytes.subarray(bytes.length - 16));
        return Buffer.concat([decipher.update(bytes.subarray(13, bytes.length - 16)), decipher.final()]).toString('utf8');
      } catch {
        throw new SealBroken();
      }
    },
  };
}
