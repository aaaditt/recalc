import type { SupabaseClient } from '@supabase/supabase-js';
import { embed, generateText } from 'ai';

import { encryptSecret } from '@/lib/crypto';

import { chatModelFor, embedModelFor, modelSpecFor } from './registry';
import * as repo from './repo';
import {
  AgentKeyUnreadable,
  AgentNotConfigured,
  MIN_API_KEY_LENGTH,
  keyHint,
  maskKey,
  modelsForRole,
  providersForRole,
  publicAgentProfileSchema,
  safeMessage,
  saveAgentProfileInputSchema,
  type AgentProfile,
  type AgentRole,
  type PublicAgentProfile,
  type SaveAgentProfileInput,
} from './schema';

// Business logic for bring-your-own-key.
//
// The one rule that shapes every function here: the decrypted key exists only
// inside this module, only for the length of one call, and never comes back out
// — not in a return value, not in a log line, not in an error message
// (prompts/10-agents.md, Constraints).
//
// `userId` is never forgeable: every caller re-derives it from the session. It
// is also the only id these writes take — `agent_profiles` references nothing
// but `auth.users`, so there is no second entity to prove ownership of, and
// the `checkLinks` pattern slices 04–09 all needed has nothing to check here.

// ---------------------------------------------------------------------------
// Reads — none of these ever decrypt anything
// ---------------------------------------------------------------------------

/**
 * Turn a row into the shape a screen may see.
 *
 * `api_key_enc` is dropped, and the mask is built from `key_hint` — four
 * characters stored in the clear — so rendering the settings page never touches
 * the plaintext at all.
 */
function publicView(profile: AgentProfile): PublicAgentProfile {
  return publicAgentProfileSchema.parse({
    id: profile.id,
    role: profile.role,
    provider: profile.provider,
    model: profile.model,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    maskedKey: maskKey(profile.key_hint),
  });
}

/** Every configured role, safe to hand to a Server Component. */
export async function getAgentProfiles(
  db: SupabaseClient,
  userId: string
): Promise<PublicAgentProfile[]> {
  return (await repo.list(db, userId)).map(publicView);
}

/** One configured role, safe to hand to a Server Component. */
export async function getAgentProfile(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<PublicAgentProfile | null> {
  const profile = await repo.find(db, userId, role);
  return profile ? publicView(profile) : null;
}

/**
 * Is this role filled in?
 *
 * /today asks this about `fast` to decide whether to show the one quiet
 * onboarding line (prompts/10-agents.md point 5).
 */
export async function hasAgentRole(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<boolean> {
  return (await repo.find(db, userId, role)) !== null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Save the key filling a role.
 *
 * The key is encrypted before it goes anywhere near the database, with
 * `lib/crypto`'s AES-256-GCM and a key that lives in the environment rather
 * than beside the ciphertext (docs/DECISIONS.md, "Encryption key in env, not in
 * the database"). What comes back is the public shape: the caller gets a mask,
 * never the key it just handed in.
 */
export async function saveAgentProfile(
  db: SupabaseClient,
  input: SaveAgentProfileInput
): Promise<PublicAgentProfile> {
  const parsed = saveAgentProfileInputSchema.parse(input);

  if (!providersForRole(parsed.role).includes(parsed.provider)) {
    throw new Error(
      `${parsed.provider} cannot fill the ${parsed.role} role — it has no model for it.`
    );
  }

  const existing = await repo.find(db, parsed.userId, parsed.role);

  // A blank key means "keep the one already saved", which is only meaningful
  // while the provider stays the same — a Claude key cannot call Gemini.
  const keepExisting =
    parsed.apiKey === '' && existing !== null && existing.provider === parsed.provider;

  if (parsed.apiKey === '' && !keepExisting) {
    throw new Error(`Paste your ${parsed.provider} API key.`);
  }
  if (parsed.apiKey !== '' && parsed.apiKey.length < MIN_API_KEY_LENGTH) {
    throw new Error('That does not look like an API key.');
  }

  const row = await repo.upsert(db, {
    user_id: parsed.userId,
    role: parsed.role,
    provider: parsed.provider,
    model: parsed.model,
    api_key_enc: keepExisting ? existing.api_key_enc : encryptSecret(parsed.apiKey),
    key_hint: keepExisting ? existing.key_hint : keyHint(parsed.apiKey),
  });

  return publicView(row);
}

/** Empty a role out. The next `getModel` for it throws `AgentNotConfigured`. */
export async function removeAgentProfile(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<void> {
  await repo.remove(db, userId, role);
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export type ConnectionResult = { ok: boolean; detail: string };

/** The cheapest possible thing to say to a chat model. */
const PING = 'Reply with the single word: ok';

/**
 * Make one real, cheap call and say plainly whether it worked.
 *
 * prompts/10-agents.md point 4. A chat role sends four words and caps the
 * answer at 64 tokens; the embed role embeds three words. Either way it is a
 * fraction of a cent, and it is the only way to find out whether a pasted key
 * is actually a key.
 *
 * Every failure comes back as `{ ok: false }` with one sentence — a wrong key,
 * a model id the provider has never heard of, a network that is down, and an
 * ENCRYPTION_KEY that has changed all land here rather than throwing at a
 * screen. `safeMessage` scrubs the key out of the provider's own words before
 * they are shown, because some providers echo it back in a 401.
 */
export async function testAgentConnection(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<ConnectionResult> {
  let spec;
  try {
    spec = await modelSpecFor(db, userId, role);
  } catch (error) {
    if (error instanceof AgentNotConfigured || error instanceof AgentKeyUnreadable) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: safeMessage(error) };
  }

  try {
    if (role === 'embed') {
      const { embedding } = await embed({
        model: embedModelFor(spec),
        value: 'recalc connection test',
        maxRetries: 0,
      });
      return {
        ok: true,
        detail: `${spec.model} answered with a ${embedding.length}-dimension vector.`,
      };
    }

    const { text } = await generateText({
      model: chatModelFor(spec),
      prompt: PING,
      maxOutputTokens: 64,
      maxRetries: 0,
    });

    const said = text.trim().replace(/\s+/g, ' ').slice(0, 40);
    return {
      ok: true,
      detail: said ? `${spec.model} answered: ${said}` : `${spec.model} answered.`,
    };
  } catch (error) {
    return { ok: false, detail: safeMessage(error, spec.apiKey) };
  }
}

/** The provider/model menu the settings screen draws. No secrets in it. */
export function modelChoices(role: AgentRole) {
  return providersForRole(role).map((provider) => ({
    provider,
    models: modelsForRole(provider, role),
  }));
}
