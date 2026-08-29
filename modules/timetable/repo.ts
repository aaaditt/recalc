import type { SupabaseClient } from '@supabase/supabase-js';
import { periodSchema, type Period } from './schema';

// The only file that touches the `periods` table.

export async function listPeriods(
  db: SupabaseClient,
  workspaceId: string
): Promise<Period[]> {
  const { data, error } = await db
    .from('periods')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });
  if (error) throw new Error(`timetable.listPeriods: ${error.message}`);
  return (data ?? []).map((row) => periodSchema.parse(row));
}

/** One period, scoped by workspace so RLS is not the only guard. */
export async function findPeriod(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Period | null> {
  const { data, error } = await db
    .from('periods')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`timetable.findPeriod: ${error.message}`);
  return data ? periodSchema.parse(data) : null;
}

export type NewPeriodRow = {
  workspace_id: string;
  position: number;
  label: string;
  starts_at: string;
  ends_at: string;
};

/**
 * Seed periods, skipping any position that already exists.
 *
 * `ignoreDuplicates` leans on the unique index from migration 012, so two
 * simultaneous first page loads cannot produce two sets of nine.
 */
export async function insertPeriods(
  db: SupabaseClient,
  rows: NewPeriodRow[]
): Promise<Period[]> {
  if (rows.length === 0) return [];
  const { error } = await db
    .from('periods')
    .upsert(rows, { onConflict: 'workspace_id,position', ignoreDuplicates: true });
  if (error) throw new Error(`timetable.insertPeriods: ${error.message}`);
  return listPeriods(db, rows[0].workspace_id);
}
