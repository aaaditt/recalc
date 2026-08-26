import type { SupabaseClient } from '@supabase/supabase-js';

import { agentProfileSchema, type AgentProfile, type AgentRole } from './schema';

// The only file that touches the agent_profiles table.
//
// Every read is scoped by user_id, so RLS is a backstop rather than the only
// guard — the same shape every other repo in this project uses.
//
// `agent_profiles` is keyed by user, not by workspace (docs/SCHEMA.md says so,
// and migration 006 explains why): an API key is a fact about the person.

export type NewAgentProfileRow = {
  user_id: string;
  role: AgentRole;
  provider: string;
  model: string;
  api_key_enc: string;
  key_hint: string;
};

/**
 * Insert, or replace the row already filling this role for this user.
 *
 * docs/SCHEMA.md: "unique per user+role". Switching the `fast` role from Claude
 * to Gemini must replace the row, not leave a second one beside it with a key
 * that is never used again — `agent_profiles_user_role_key` is the unique index
 * this relies on.
 */
export async function upsert(
  db: SupabaseClient,
  row: NewAgentProfileRow
): Promise<AgentProfile> {
  const { data, error } = await db
    .from('agent_profiles')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id,role' })
    .select('*')
    .single();
  if (error) throw new Error(`agents.upsert: ${error.message}`);
  return agentProfileSchema.parse(data);
}

/** The profile filling one role, or null. */
export async function find(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<AgentProfile | null> {
  const { data, error } = await db
    .from('agent_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('role', role)
    .maybeSingle();
  if (error) throw new Error(`agents.find: ${error.message}`);
  return data ? agentProfileSchema.parse(data) : null;
}

/** Every configured role for this user. At most three rows. */
export async function list(
  db: SupabaseClient,
  userId: string
): Promise<AgentProfile[]> {
  const { data, error } = await db
    .from('agent_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('role', { ascending: true });
  if (error) throw new Error(`agents.list: ${error.message}`);
  return (data ?? []).map((row) => agentProfileSchema.parse(row));
}

/** Forget the key filling a role. The role then has nothing in it. */
export async function remove(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<void> {
  const { error } = await db
    .from('agent_profiles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role);
  if (error) throw new Error(`agents.remove: ${error.message}`);
}
