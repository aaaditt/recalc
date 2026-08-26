import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decryptSecret } from '@/lib/crypto';
import {
  AgentKeyUnreadable,
  AgentNotConfigured,
  getAgentProfile,
  getAgentProfiles,
  getModel,
  hasAgentRole,
  removeAgentProfile,
  saveAgentProfile,
  testAgentConnection,
} from '@/modules/agents';

// The invariant of slice 10's storage half:
//
//   the key goes into the database encrypted and comes back out only inside
//   modules/agents — never in a return value, never in a page's props.
//
// docs/SCHEMA.md: "`api_key_enc` ... AES-256-GCM ciphertext. The key comes from
// `process.env.ENCRYPTION_KEY`... Never pgcrypto — do not put the key in the
// database."
//
// Real database, throwaway users, deleted afterwards — the same harness every
// module test in this project uses. The service-role client bypasses RLS, so
// the last describe block signs in with the anon key to prove the backstop
// separately.
//
// Nothing here makes a live provider call. There is no real Anthropic, Google
// or OpenAI key on this machine, so `testAgentConnection` is exercised only
// down the paths that fail before the network — see the last two tests, and
// docs/DECISIONS.md under "Noticed, not fixed".

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error(
    'agent-profiles.test.ts needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ' +
      'and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

/**
 * A string of the right shape and length to be an API key, that is not one.
 *
 * Deliberately not `sk-`-prefixed and deliberately not real: a placeholder that
 * looks like a credential has a way of ending up in a log, a screenshot or a
 * bug report, and CLAUDE.md's Never rule 4 exists so that never matters.
 */
const PRETEND_KEY = 'recalc-test-key-do-not-use-000000000000-abcd';

type Fixture = { userId: string; email: string; password: string };

async function makeUser(db: SupabaseClient, label: string): Promise<Fixture> {
  const email = `${label}-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create test user: ${error.message}`);

  return { userId: data.user.id, email, password };
}

/** Deleting the auth user cascades to agent_profiles. Nothing else to sweep. */
async function tearDown(db: SupabaseClient, fixture: Fixture | undefined) {
  if (!fixture) return;
  await db.auth.admin.deleteUser(fixture.userId);
}

// ---------------------------------------------------------------------------

describe('a pasted key is stored encrypted and never handed back', () => {
  let db: SupabaseClient;
  let mine: Fixture;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    mine = await makeUser(db, 'agents-mine');
  });

  afterAll(async () => {
    if (db) await tearDown(db, mine);
  });

  it('writes ciphertext, not the key', async () => {
    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'fast',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      apiKey: PRETEND_KEY,
    });

    const { data, error } = await db
      .from('agent_profiles')
      .select('api_key_enc, key_hint')
      .eq('user_id', mine.userId)
      .eq('role', 'fast')
      .single();

    expect(error).toBeNull();
    expect(data!.api_key_enc).not.toContain(PRETEND_KEY);
    expect(data!.api_key_enc.startsWith('v1.')).toBe(true);
    // ...and it is genuinely the same key, not a hash.
    expect(decryptSecret(data!.api_key_enc)).toBe(PRETEND_KEY);
    // Four characters, which cannot call anything.
    expect(data!.key_hint).toBe('abcd');
  });

  it('returns a mask to the caller, and no key at all', async () => {
    const saved = await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'deep',
      provider: 'google',
      model: 'gemini-2.5-pro',
      apiKey: PRETEND_KEY,
    });

    expect(saved.maskedKey).toBe('••••••••abcd');
    expect(JSON.stringify(saved)).not.toContain(PRETEND_KEY);
    expect(JSON.stringify(saved)).not.toContain('api_key_enc');

    const read = await getAgentProfile(db, mine.userId, 'deep');
    expect(JSON.stringify(read)).not.toContain(PRETEND_KEY);
    expect(JSON.stringify(read)).not.toContain('v1.');
  });

  it('keeps one row per role, and replaces rather than duplicating', async () => {
    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'fast',
      provider: 'openai',
      model: 'gpt-5-mini',
      apiKey: `${PRETEND_KEY}-second`,
    });

    const profiles = await getAgentProfiles(db, mine.userId);
    const fast = profiles.filter((profile) => profile.role === 'fast');

    expect(fast).toHaveLength(1);
    // The whole point of docs/DECISIONS.md's "app code asks for a role": the
    // provider swapped and nothing else in the app changed.
    expect(fast[0].provider).toBe('openai');
    expect(fast[0].model).toBe('gpt-5-mini');
    expect(fast[0].maskedKey).toBe('••••••••cond');
  });

  it('changing only the model keeps the key already saved', async () => {
    const before = await getAgentProfile(db, mine.userId, 'deep');

    const after = await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'deep',
      provider: 'google',
      model: 'gemini-2.5-flash',
      apiKey: '',
    });

    expect(after.model).toBe('gemini-2.5-flash');
    expect(after.maskedKey).toBe(before!.maskedKey);
  });

  it('insists on a key when the provider changes', async () => {
    await expect(
      saveAgentProfile(db, {
        userId: mine.userId,
        role: 'deep',
        provider: 'openai',
        model: 'gpt-5',
        apiKey: '',
      })
    ).rejects.toThrow(/Paste your openai API key/);

    // ...and the row it refused to change is untouched.
    const still = await getAgentProfile(db, mine.userId, 'deep');
    expect(still!.provider).toBe('google');
  });

  it('keeps the three roles independent', async () => {
    expect(await hasAgentRole(db, mine.userId, 'fast')).toBe(true);
    expect(await hasAgentRole(db, mine.userId, 'deep')).toBe(true);
    expect(await hasAgentRole(db, mine.userId, 'embed')).toBe(false);

    await removeAgentProfile(db, mine.userId, 'fast');

    expect(await hasAgentRole(db, mine.userId, 'fast')).toBe(false);
    expect(await hasAgentRole(db, mine.userId, 'deep')).toBe(true);
  });

  it('refuses a provider that cannot fill the role', async () => {
    await expect(
      saveAgentProfile(db, {
        userId: mine.userId,
        role: 'embed',
        provider: 'anthropic',
        model: 'claude-opus-5',
        apiKey: PRETEND_KEY,
      })
    ).rejects.toThrow(/cannot fill the embed role/);
  });

  it('refuses an empty model id and a key that is obviously not one', async () => {
    await expect(
      saveAgentProfile(db, {
        userId: mine.userId,
        role: 'fast',
        provider: 'anthropic',
        model: '   ',
        apiKey: PRETEND_KEY,
      })
    ).rejects.toThrow();

    await expect(
      saveAgentProfile(db, {
        userId: mine.userId,
        role: 'fast',
        provider: 'anthropic',
        model: 'claude-opus-5',
        apiKey: 'oops',
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('getModel is the only door, and it degrades rather than crashing', () => {
  let db: SupabaseClient;
  let mine: Fixture;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    mine = await makeUser(db, 'agents-registry');
  });

  afterAll(async () => {
    if (db) await tearDown(db, mine);
  });

  it('hands back the model the row names', async () => {
    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'deep',
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: PRETEND_KEY,
    });

    const model = await getModel(db, mine.userId, 'deep');
    expect(model.modelId).toBe('claude-opus-5');
    expect(model.provider).toContain('anthropic');
  });

  it('follows the row when the provider changes, with no code change', async () => {
    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'deep',
      provider: 'google',
      model: 'gemini-2.5-pro',
      apiKey: PRETEND_KEY,
    });

    const model = await getModel(db, mine.userId, 'deep');
    expect(model.modelId).toBe('gemini-2.5-pro');
    expect(model.provider).toContain('google');
  });

  it('builds an embedding model for the embed role', async () => {
    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'embed',
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: PRETEND_KEY,
    });

    const model = await getModel(db, mine.userId, 'embed');
    expect(model.modelId).toBe('text-embedding-3-small');
  });

  it('throws AgentNotConfigured for an empty role, not a crash', async () => {
    await expect(getModel(db, mine.userId, 'fast')).rejects.toBeInstanceOf(
      AgentNotConfigured
    );
    await expect(getModel(db, mine.userId, 'fast')).rejects.toThrow(/Settings → Agents/);
  });

  it('throws AgentKeyUnreadable when the stored ciphertext will not decrypt', async () => {
    // What a changed or restored ENCRYPTION_KEY looks like from the app's side.
    const { error } = await db
      .from('agent_profiles')
      .update({ api_key_enc: 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA==.AAAA' })
      .eq('user_id', mine.userId)
      .eq('role', 'embed');
    expect(error).toBeNull();

    await expect(getModel(db, mine.userId, 'embed')).rejects.toBeInstanceOf(
      AgentKeyUnreadable
    );
  });

  it('reports an unconfigured role plainly instead of calling anything', async () => {
    // No network: `testAgentConnection` returns before it builds a model.
    const result = await testAgentConnection(db, mine.userId, 'fast');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/No fast model is set up yet/);
  });

  it('reports an unreadable key plainly instead of calling anything', async () => {
    const result = await testAgentConnection(db, mine.userId, 'embed');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/ENCRYPTION_KEY has probably changed/);
    expect(result.detail).not.toContain('v1.');
  });
});

// ---------------------------------------------------------------------------

describe('RLS is the backstop under all of that', () => {
  let db: SupabaseClient;
  let mine: Fixture;
  let theirs: Fixture;
  /** The anon key, signed in as `mine` — exactly what the browser gets. */
  let asMe: SupabaseClient;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    mine = await makeUser(db, 'agents-rls-a');
    theirs = await makeUser(db, 'agents-rls-b');

    await saveAgentProfile(db, {
      userId: mine.userId,
      role: 'fast',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      apiKey: PRETEND_KEY,
    });
    await saveAgentProfile(db, {
      userId: theirs.userId,
      role: 'fast',
      provider: 'openai',
      model: 'gpt-5-mini',
      apiKey: `${PRETEND_KEY}-theirs`,
    });

    asMe = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await asMe.auth.signInWithPassword({
      email: mine.email,
      password: mine.password,
    });
    if (signIn.error) throw new Error(`could not sign in: ${signIn.error.message}`);
  });

  afterAll(async () => {
    if (asMe) await asMe.auth.signOut();
    if (db) await tearDown(db, mine);
    if (db) await tearDown(db, theirs);
  });

  it('lets me read my own row', async () => {
    const { data, error } = await asMe.from('agent_profiles').select('role, provider');
    expect(error).toBeNull();
    expect(data).toEqual([{ role: 'fast', provider: 'anthropic' }]);
  });

  it("hides another user's key completely", async () => {
    const { data, error } = await asMe
      .from('agent_profiles')
      .select('api_key_enc')
      .eq('user_id', theirs.userId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses to write a row belonging to someone else', async () => {
    const { error } = await asMe.from('agent_profiles').insert({
      user_id: theirs.userId,
      role: 'deep',
      provider: 'openai',
      model: 'gpt-5',
      api_key_enc: 'v1.a.b.c',
    });

    expect(error).not.toBeNull();
  });

  it("refuses to overwrite someone else's row", async () => {
    const { data, error } = await asMe
      .from('agent_profiles')
      .update({ model: 'stolen' })
      .eq('user_id', theirs.userId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
