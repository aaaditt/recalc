'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  agentProviderSchema,
  agentRoleSchema,
  removeAgentProfile,
  safeMessage,
  saveAgentProfile,
  testAgentConnection,
  type ConnectionResult,
} from '@/modules/agents';

// Routing only, the same shape as every other actions file in this project:
// check who is asking, hand the work to the module, say what moved.
//
// The identity re-derived here is the USER, not a workspace. `agent_profiles`
// is keyed by `user_id` (docs/SCHEMA.md, and migration 006 explains why), so a
// workspace would be the wrong thing to prove. It is re-derived from the
// session on every call regardless: a Server Action is a public POST endpoint,
// and the page that drew the button proves nothing about the request that
// arrives.
//
// Nothing in this file ever sees a decrypted key. The key travels one way —
// browser → `saveAgentProfile` → ciphertext — and comes back only as a mask.

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  return { supabase, userId: user.id };
}

export type SaveResult = { ok: boolean; message: string } | null;

/**
 * Save the provider, model and key filling one role.
 *
 * Returns a result rather than throwing, because everything that can go wrong
 * here is something the person typing can fix — a key that is too short, a
 * model id left blank — and an error page is the wrong way to say so.
 */
export async function saveAgentProfileAction(
  _previous: SaveResult,
  formData: FormData
): Promise<SaveResult> {
  try {
    const { supabase, userId } = await signedIn();

    const role = agentRoleSchema.parse(formData.get('role'));
    const provider = agentProviderSchema.parse(formData.get('provider'));

    // The picker and the "or type a model id" box. The typed one wins when it
    // has anything in it, so a model released this morning is one field away.
    const picked = String(formData.get('model') ?? '').trim();
    const typed = String(formData.get('customModel') ?? '').trim();

    const saved = await saveAgentProfile(supabase, {
      role,
      provider,
      userId,
      model: typed || picked,
      apiKey: String(formData.get('apiKey') ?? ''),
    });

    revalidatePath('/settings/agents');
    // /today carries the "set up a model" line, which this may have removed.
    revalidatePath('/today');

    return { ok: true, message: `Saved. ${role} is ${saved.model}.` };
  } catch (error) {
    // `safeMessage` rather than the raw error: a validation failure should not
    // be the one place a pasted key gets echoed back onto a screen.
    return { ok: false, message: safeMessage(error, String(formData.get('apiKey') ?? '')) };
  }
}

/** Empty a role out. The key is deleted; nothing is kept. */
export async function removeAgentProfileAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await signedIn();
  const role = agentRoleSchema.parse(formData.get('role'));

  await removeAgentProfile(supabase, userId, role);

  revalidatePath('/settings/agents');
  revalidatePath('/today');
}

/**
 * Make one real, cheap call and report plainly whether it worked.
 *
 * The whole round trip happens on the server: the key is decrypted inside
 * `modules/agents`, used, and dropped. What comes back to the browser is a
 * boolean and one sentence that has been through `safeMessage`.
 */
export async function testAgentConnectionAction(role: string): Promise<ConnectionResult> {
  const { supabase, userId } = await signedIn();
  return testAgentConnection(supabase, userId, agentRoleSchema.parse(role));
}
