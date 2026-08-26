import type { SupabaseClient } from '@supabase/supabase-js';

import { googleAccountSchema, type GoogleAccount } from './schema';

// The only file that touches the google_accounts table.
//
// Every read is scoped by user_id, so RLS is a backstop rather than the only
// guard — the same shape every other repo in this project uses.

export type NewGoogleAccountRow = {
  user_id: string;
  address: string;
  refresh_token_enc: string;
  granted_scopes: string[];
  status: string;
};

/**
 * Insert, or update the row that is already there for this (user, address).
 *
 * Reconnecting is the common case — a revoked token, an added scope — and it
 * must replace the stale refresh token rather than leave a second row beside
 * it. `google_accounts_user_address_key` is the unique index this relies on.
 */
export async function upsert(
  db: SupabaseClient,
  row: NewGoogleAccountRow
): Promise<GoogleAccount> {
  const existing = await findByAddress(db, row.user_id, row.address);

  if (existing) {
    const { data, error } = await db
      .from('google_accounts')
      .update({
        refresh_token_enc: row.refresh_token_enc,
        granted_scopes: row.granted_scopes,
        status: row.status,
        // Reconnecting keeps the address casing Google most recently reported.
        address: row.address,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(`google.upsert: ${error.message}`);
    return googleAccountSchema.parse(data);
  }

  const { data, error } = await db
    .from('google_accounts')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`google.upsert: ${error.message}`);
  return googleAccountSchema.parse(data);
}

/** The connected account for this user, or null. Single user, so at most one. */
export async function find(
  db: SupabaseClient,
  userId: string
): Promise<GoogleAccount | null> {
  const { data, error } = await db
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`google.find: ${error.message}`);
  return data ? googleAccountSchema.parse(data) : null;
}

export async function findByAddress(
  db: SupabaseClient,
  userId: string,
  address: string
): Promise<GoogleAccount | null> {
  const { data, error } = await db
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .ilike('address', address)
    .maybeSingle();
  if (error) throw new Error(`google.findByAddress: ${error.message}`);
  return data ? googleAccountSchema.parse(data) : null;
}

/** One account by id, or null when it is not this user's. */
export async function findById(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<GoogleAccount | null> {
  const { data, error } = await db
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`google.findById: ${error.message}`);
  return data ? googleAccountSchema.parse(data) : null;
}

export async function setStatus(
  db: SupabaseClient,
  id: string,
  status: string
): Promise<void> {
  const { error } = await db.from('google_accounts').update({ status }).eq('id', id);
  if (error) throw new Error(`google.setStatus: ${error.message}`);
}

/** Forget the connection. The files already attached are left alone. */
export async function remove(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await db
    .from('google_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(`google.remove: ${error.message}`);
}
