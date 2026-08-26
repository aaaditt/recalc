import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decrypt,
  decryptSecret,
  encrypt,
  encryptSecret,
  keyFrom,
  safeEqual,
} from './crypto';

// The invariant this file protects:
//
//   what goes in comes back out, and anything that was touched on the way does
//   not come back out at all.
//
// A Google refresh token is a long-lived credential to someone's Drive. Storing
// it means it can be read back — so the only thing standing between a leaked
// database dump and that Drive is this file plus a key that is not in the
// database (docs/DECISIONS.md, "Encryption key in env, not in the database").
//
// Pure: no Supabase, no network, no Google. It is arithmetic over bytes.

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

/** What Google actually hands back. Long, opaque, full of punctuation. */
const REFRESH_TOKEN =
  '1//0gVxWq3n-EXAMPLE_refresh_token.with.dots-and_underscores/AND+slashes=';

describe('encrypt then decrypt', () => {
  it('round-trips a refresh token', () => {
    expect(decrypt(encrypt(REFRESH_TOKEN, KEY), KEY)).toBe(REFRESH_TOKEN);
  });

  it('round-trips through the environment key too', () => {
    process.env.ENCRYPTION_KEY = KEY;
    expect(decryptSecret(encryptSecret(REFRESH_TOKEN))).toBe(REFRESH_TOKEN);
  });

  it('round-trips an empty string, unicode, and something long', () => {
    const cases = ['', 'ключ · 密钥 · مفتاح', 'x'.repeat(10_000)];
    for (const value of cases) {
      expect(decrypt(encrypt(value, KEY), KEY)).toBe(value);
    }
  });

  it('never writes the plaintext into the ciphertext', () => {
    const payload = encrypt(REFRESH_TOKEN, KEY);
    expect(payload).not.toContain(REFRESH_TOKEN);
    expect(payload).not.toContain('EXAMPLE_refresh_token');
  });

  it('produces a different ciphertext every time, from a fresh iv', () => {
    const once = encrypt(REFRESH_TOKEN, KEY);
    const twice = encrypt(REFRESH_TOKEN, KEY);

    expect(once).not.toBe(twice);
    // ...and both still decrypt.
    expect(decrypt(once, KEY)).toBe(REFRESH_TOKEN);
    expect(decrypt(twice, KEY)).toBe(REFRESH_TOKEN);
  });

  it('accepts a base64 key and the same key in hex', () => {
    const raw = randomBytes(32);
    const payload = encrypt(REFRESH_TOKEN, raw.toString('base64'));
    expect(decrypt(payload, raw.toString('hex'))).toBe(REFRESH_TOKEN);
  });
});

describe('a tampered ciphertext does not decrypt', () => {
  it('refuses a flipped byte in the ciphertext', () => {
    const parts = encrypt(REFRESH_TOKEN, KEY).split('.');
    const bytes = Buffer.from(parts[3], 'base64');
    bytes[0] ^= 0x01;
    parts[3] = bytes.toString('base64');

    expect(() => decrypt(parts.join('.'), KEY)).toThrow();
  });

  it('refuses a flipped byte in the auth tag', () => {
    const parts = encrypt(REFRESH_TOKEN, KEY).split('.');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0x01;
    parts[2] = tag.toString('base64');

    expect(() => decrypt(parts.join('.'), KEY)).toThrow();
  });

  it('refuses a swapped iv', () => {
    const mine = encrypt(REFRESH_TOKEN, KEY).split('.');
    const theirs = encrypt(REFRESH_TOKEN, KEY).split('.');
    mine[1] = theirs[1];

    expect(() => decrypt(mine.join('.'), KEY)).toThrow();
  });

  it('refuses a truncated payload', () => {
    const payload = encrypt(REFRESH_TOKEN, KEY);
    expect(() => decrypt(payload.slice(0, -8), KEY)).toThrow();
    expect(() => decrypt(payload.split('.').slice(0, 3).join('.'), KEY)).toThrow(
      /not a v1 ciphertext/
    );
  });

  it('refuses the right ciphertext under the wrong key', () => {
    expect(() => decrypt(encrypt(REFRESH_TOKEN, KEY), OTHER_KEY)).toThrow();
  });

  it('refuses something that is not a ciphertext at all', () => {
    expect(() => decrypt('', KEY)).toThrow(/not a v1 ciphertext/);
    expect(() => decrypt(REFRESH_TOKEN, KEY)).toThrow(/not a v1 ciphertext/);
    expect(() => decrypt('v2.a.b.c', KEY)).toThrow(/not a v1 ciphertext/);
  });
});

describe('the key itself', () => {
  it('refuses a key that is not 32 bytes', () => {
    expect(() => keyFrom('too-short')).toThrow(/32 bytes/);
    expect(() => keyFrom(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => keyFrom('')).toThrow(/32 bytes/);
  });

  it('accepts the key SETUP.md tells you to generate', () => {
    expect(keyFrom(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(keyFrom(randomBytes(32).toString('hex'))).toHaveLength(32);
  });
});

describe('safeEqual', () => {
  it('is true only for identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc123', 'abc1234')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
