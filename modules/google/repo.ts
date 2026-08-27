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

/**
 * Every connected Google account for this user, oldest first.
 *
 * `find` above answers "the" account and predates slice 14. Gmail is the first
 * feature with two of them — prompts/14-email-connect.md opens with "Both my
 * Gmail accounts" — so it reads the list instead.
 */
export async function list(
  db: SupabaseClient,
  userId: string
): Promise<GoogleAccount[]> {
  const { data, error } = await db
    .from('google_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`google.list: ${error.message}`);
  return (data ?? []).map((row) => googleAccountSchema.parse(row));
}

/**
 * Every user with an account that granted this scope.
 *
 * Only the cron job needs this — it runs with no session, so it cannot ask
 * "which accounts are mine?". It is a service-role read across users, which is
 * why it lives behind a service function rather than being reachable from a
 * screen.
 */
export async function userIdsWithScope(
  db: SupabaseClient,
  scope: string
): Promise<string[]> {
  const { data, error } = await db
    .from('google_accounts')
    .select('user_id')
    .contains('granted_scopes', [scope]);
  if (error) throw new Error(`google.userIdsWithScope: ${error.message}`);
  return [...new Set((data ?? []).map((row) => row.user_id as string))];
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

/**
 * Move the Gmail sync cursor forward, and record when.
 *
 * `last_history_id` is the whole of slice 14's claim to be incremental: it is
 * what the next sync hands to Gmail's `history.list` instead of asking for the
 * mailbox again. Writing it is the last thing a successful sync does.
 */
export async function setSyncCursor(
  db: SupabaseClient,
  id: string,
  cursor: { lastHistoryId: string; syncedAt: string }
): Promise<void> {
  const { error } = await db
    .from('google_accounts')
    .update({
      last_history_id: cursor.lastHistoryId,
      synced_at: cursor.syncedAt,
      status: 'ok',
    })
    .eq('id', id);
  if (error) throw new Error(`google.setSyncCursor: ${error.message}`);
}

/** Update the stored scopes on a row that already exists. */
export async function setGrantedScopes(
  db: SupabaseClient,
  id: string,
  scopes: string[]
): Promise<void> {
  const { error } = await db
    .from('google_accounts')
    .update({ granted_scopes: scopes })
    .eq('id', id);
  if (error) throw new Error(`google.setGrantedScopes: ${error.message}`);
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
