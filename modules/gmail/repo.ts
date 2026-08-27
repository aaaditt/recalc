import type { SupabaseClient } from '@supabase/supabase-js';

import { emailMessageSchema, type EmailMessage } from './schema';

// The only file that touches the email_messages table.

export type NewEmailMessageRow = {
  google_account_id: string;
  provider_msg_id: string;
  thread_id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  block_id: string | null;
};

/**
 * Which of these Gmail ids are already stored for this account.
 *
 * This is what makes a re-sync cheap as well as idempotent: a message already
 * here is never fetched from Gmail a second time, so `messages.get` is only
 * ever called for mail this app has genuinely not seen.
 */
export async function existingProviderIds(
  db: SupabaseClient,
  accountId: string,
  providerIds: string[]
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();

  const { data, error } = await db
    .from('email_messages')
    .select('provider_msg_id')
    .eq('google_account_id', accountId)
    .in('provider_msg_id', providerIds);
  if (error) throw new Error(`gmail.existingProviderIds: ${error.message}`);

  return new Set((data ?? []).map((row) => row.provider_msg_id as string));
}

/**
 * Insert one message, or return null because it was already there.
 *
 * `ignoreDuplicates` makes this `on conflict do nothing` against
 * `email_messages_account_msg_key`, so nothing comes back for a message this
 * account has already stored — which is the backstop for two syncs racing past
 * `existingProviderIds`. The caller only creates a block when a row comes back,
 * so a duplicate cannot leave an orphaned `email` block behind either.
 */
export async function insertOne(
  db: SupabaseClient,
  row: NewEmailMessageRow
): Promise<EmailMessage | null> {
  const { data, error } = await db
    .from('email_messages')
    .upsert(row, {
      onConflict: 'google_account_id,provider_msg_id',
      ignoreDuplicates: true,
    })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`gmail.insertOne: ${error.message}`);
  return data ? emailMessageSchema.parse(data) : null;
}

/** Point a stored message at the `email` block created for it. */
export async function setBlockId(
  db: SupabaseClient,
  id: string,
  blockId: string
): Promise<void> {
  const { error } = await db
    .from('email_messages')
    .update({ block_id: blockId })
    .eq('id', id);
  if (error) throw new Error(`gmail.setBlockId: ${error.message}`);
}

/** The newest mail for one account. */
export async function recentForAccount(
  db: SupabaseClient,
  accountId: string,
  limit: number
): Promise<EmailMessage[]> {
  const { data, error } = await db
    .from('email_messages')
    .select('*')
    .eq('google_account_id', accountId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`gmail.recentForAccount: ${error.message}`);
  return (data ?? []).map((row) => emailMessageSchema.parse(row));
}

/** How much mail is stored for one account. */
export async function countForAccount(
  db: SupabaseClient,
  accountId: string
): Promise<number> {
  const { count, error } = await db
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('google_account_id', accountId);
  if (error) throw new Error(`gmail.countForAccount: ${error.message}`);
  return count ?? 0;
}
