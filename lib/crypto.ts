import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM for opaque strings the app must store but must not store in the
 * clear: a Google refresh token today, an AI provider API key in slice 10.
 *
 * docs/SCHEMA.md: "`api_key_enc` and `refresh_token_enc` are AES-256-GCM
 * ciphertext. The key comes from `process.env.ENCRYPTION_KEY`... Never
 * pgcrypto — do not put the key in the database."
 *
 * Why this is in /lib and not in `modules/agents/crypto.ts`, which is where
 * docs/SCHEMA.md and prompts/09-drive.md both point:
 *
 *   - It owns no table, so it is not a module (CLAUDE.md's layout: a module is
 *     schema + repo + service over its own tables). It is exactly what /lib is
 *     for — "db clients, env validation, shared utils".
 *   - Two slices need it. Slice 09 needs it first, for the refresh token; slice
 *     10 needs it for `agent_profiles.api_key_enc`. Building it inside
 *     modules/agents would have meant slice 09 reaching across a module
 *     boundary into a module that does not exist yet.
 *
 * Slice 10 should import this, not write a second one.
 *
 * It reads `process.env.ENCRYPTION_KEY` directly rather than through
 * `lib/env.server.ts`, which imports `server-only` — whose default export
 * throws outside a React Server Component, so anything importing it cannot be
 * unit-tested (docs/DECISIONS.md, "`scripts/seed-check.ts` builds its own
 * Supabase client"). `lib/env.server.ts` still validates the variable, so a
 * missing key fails at boot rather than at the moment a token is written.
 */

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64. */
const VERSION = 'v1';
/** 96 bits — the size GCM is defined for and the only one to use. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Turn the configured key into 32 raw bytes.
 *
 * Base64 is what SETUP.md tells the user to generate
 * (`randomBytes(32).toString('base64')`); hex is accepted too, because it is
 * the other thing a person plausibly pastes in.
 */
export function keyFrom(key: string): Buffer {
  const trimmed = key.trim();

  const base64 = Buffer.from(trimmed, 'base64');
  if (base64.length === KEY_BYTES) return base64;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');

  throw new Error(
    'ENCRYPTION_KEY must be 32 bytes: 44 base64 characters, or 64 hex characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

/** The key the app is configured with. Read at call time, never cached. */
function configuredKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Nothing that needs encrypting can be stored without it — ' +
        'see docs/GOOGLE_SETUP.md.'
    );
  }
  return keyFrom(key);
}

/** Encrypt with an explicit key. `encryptSecret` is the one app code wants. */
export function encrypt(plaintext: string, key: string | Buffer): string {
  const raw = typeof key === 'string' ? keyFrom(key) : key;
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv('aes-256-gcm', raw, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Decrypt with an explicit key.
 *
 * Throws if the payload was tampered with, truncated, re-ordered, or encrypted
 * under a different key — GCM authenticates as well as encrypts, which is the
 * reason it is the mode named in docs/SCHEMA.md.
 */
export function decrypt(payload: string, key: string | Buffer): string {
  const raw = typeof key === 'string' ? keyFrom(key) : key;

  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('decrypt: not a v1 ciphertext');
  }

  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  if (iv.length !== IV_BYTES) throw new Error('decrypt: wrong iv length');
  if (tag.length !== TAG_BYTES) throw new Error('decrypt: wrong auth tag length');

  const decipher = createDecipheriv('aes-256-gcm', raw, iv);
  decipher.setAuthTag(tag);

  // `final()` is what throws when the tag does not match the ciphertext.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Encrypt with the key in the environment. */
export function encryptSecret(plaintext: string): string {
  return encrypt(plaintext, configuredKey());
}

/** Decrypt with the key in the environment. */
export function decryptSecret(payload: string): string {
  return decrypt(payload, configuredKey());
}

/**
 * Constant-time string comparison, for the OAuth `state` parameter.
 *
 * Not encryption, but it is the same "a secret is being compared" problem and
 * it belongs beside the rest of it rather than inlined in a route handler.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
