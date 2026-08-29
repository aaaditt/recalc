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

export async function insertPeriod(
  db: SupabaseClient,
  row: NewPeriodRow
): Promise<Period> {
  const { data, error } = await db.from('periods').insert(row).select('*').single();
  if (error) throw new Error(`timetable.insertPeriod: ${error.message}`);
  return periodSchema.parse(data);
}

/**
 * Change one row of the printed grid.
 *
 * `.eq('id', ...)` and nothing else. No session and no dated lecture is in this
 * statement, which is exactly what makes "editing a period never moves a
 * lecture" true rather than merely intended.
 */
export async function updatePeriodRow(
  db: SupabaseClient,
  id: string,
  patch: { label?: string; starts_at?: string; ends_at?: string; position?: number }
): Promise<Period> {
  const { data, error } = await db
    .from('periods')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`timetable.updatePeriodRow: ${error.message}`);
  return periodSchema.parse(data);
}

/**
 * Drop one row of the grid.
 *
 * `sessions.period_id` is `on delete set null` (migration 012), so every class
 * filed under it survives with its own times intact — it simply stops having a
 * row to be drawn on. Nothing dated is touched at all.
 */
export async function deletePeriod(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('periods').delete().eq('id', id);
  if (error) throw new Error(`timetable.deletePeriod: ${error.message}`);
}

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
