import type { SupabaseClient } from '@supabase/supabase-js';

import { bandSchema, bandSlotSchema, type Band, type BandSlot } from './schema';

// The only file that touches `bands` and `band_slots`.
//
// Note what is not in here: not one statement names `sessions`, `courses`,
// `class_meetings`, `blocks` or `notes`. That is the load-bearing fact of this
// module — a band frames time and never owns what is inside it — and it is
// easier to keep true in a file that cannot say those words.

// ---------------------------------------------------------------------------
// bands
// ---------------------------------------------------------------------------

export async function listBands(
  db: SupabaseClient,
  workspaceId: string
): Promise<Band[]> {
  const { data, error } = await db
    .from('bands')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });
  if (error) throw new Error(`bands.listBands: ${error.message}`);
  return (data ?? []).map((row) => bandSchema.parse(row));
}

/** One band, scoped by workspace so RLS is not the only guard. */
export async function findBand(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Band | null> {
  const { data, error } = await db
    .from('bands')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`bands.findBand: ${error.message}`);
  return data ? bandSchema.parse(data) : null;
}

/** The one band that is the printed timetable, if it has been made yet. */
export async function findUniversityBand(
  db: SupabaseClient,
  workspaceId: string
): Promise<Band | null> {
  const { data, error } = await db
    .from('bands')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'university')
    .maybeSingle();
  if (error) throw new Error(`bands.findUniversityBand: ${error.message}`);
  return data ? bandSchema.parse(data) : null;
}

export type NewBandRow = {
  workspace_id: string;
  name: string;
  kind: 'custom' | 'university';
  starts_at: string;
  ends_at: string;
  weekdays: number[];
  position: number;
};

export async function insertBand(db: SupabaseClient, row: NewBandRow): Promise<Band> {
  const { data, error } = await db.from('bands').insert(row).select('*').single();
  if (error) throw new Error(`bands.insertBand: ${error.message}`);
  return bandSchema.parse(data);
}

export async function updateBandRow(
  db: SupabaseClient,
  id: string,
  patch: {
    name?: string;
    starts_at?: string;
    ends_at?: string;
    weekdays?: number[];
    position?: number;
  }
): Promise<Band> {
  const { data, error } = await db
    .from('bands')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`bands.updateBandRow: ${error.message}`);
  return bandSchema.parse(data);
}

/**
 * Drop a band.
 *
 * `band_slots.band_id` cascades, so the band's own slots go with it. Nothing
 * else does: no session, no lecture, no note, no file, no task is named in this
 * statement or reachable from it by a foreign key.
 */
export async function deleteBand(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('bands').delete().eq('id', id);
  if (error) throw new Error(`bands.deleteBand: ${error.message}`);
}

/** The largest position in use, so a new band lands at the bottom of the list. */
export async function lastPosition(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  const { data, error } = await db
    .from('bands')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`bands.lastPosition: ${error.message}`);
  return data ? Number(data.position) : 0;
}

// ---------------------------------------------------------------------------
// band_slots
// ---------------------------------------------------------------------------

/** Every slot in the workspace — what the 24-hour view draws its tick rail from. */
export async function listSlots(
  db: SupabaseClient,
  workspaceId: string
): Promise<BandSlot[]> {
  const { data, error } = await db
    .from('band_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('weekday', { ascending: true })
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`bands.listSlots: ${error.message}`);
  return (data ?? []).map((row) => bandSlotSchema.parse(row));
}

export async function listSlotsForBand(
  db: SupabaseClient,
  workspaceId: string,
  bandId: string
): Promise<BandSlot[]> {
  const { data, error } = await db
    .from('band_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('band_id', bandId)
    .order('weekday', { ascending: true })
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`bands.listSlotsForBand: ${error.message}`);
  return (data ?? []).map((row) => bandSlotSchema.parse(row));
}

export async function findSlot(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<BandSlot | null> {
  const { data, error } = await db
    .from('band_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`bands.findSlot: ${error.message}`);
  return data ? bandSlotSchema.parse(data) : null;
}

export type NewSlotRow = {
  band_id: string;
  workspace_id: string;
  label: string;
  course_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
};

export async function insertSlot(
  db: SupabaseClient,
  row: NewSlotRow
): Promise<BandSlot> {
  const { data, error } = await db.from('band_slots').insert(row).select('*').single();
  if (error) throw new Error(`bands.insertSlot: ${error.message}`);
  return bandSlotSchema.parse(data);
}

export async function updateSlotRow(
  db: SupabaseClient,
  id: string,
  patch: {
    label?: string;
    course_id?: string | null;
    weekday?: number;
    starts_at?: string;
    ends_at?: string;
  }
): Promise<BandSlot> {
  const { data, error } = await db
    .from('band_slots')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`bands.updateSlotRow: ${error.message}`);
  return bandSlotSchema.parse(data);
}

export async function deleteSlot(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('band_slots').delete().eq('id', id);
  if (error) throw new Error(`bands.deleteSlot: ${error.message}`);
}
