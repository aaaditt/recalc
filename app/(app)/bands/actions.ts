'use server';

import { revalidatePath } from 'next/cache';

import { requireWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { SaveResult } from '@/lib/timetable';
import {
  addSlot,
  createBand,
  removeBand,
  removeSlot,
  updateBand,
  updateSlot,
} from '@/modules/bands';

// Routing only, as CLAUDE.md's layout rule asks: check who is asking, hand the
// work to the module, tell the router the data moved. Every rule about what a
// band may be — that two of them never cover the same minute, that a slot sits
// inside its band, that the university band has no slots of its own — lives in
// modules/bands/service.ts, so there is one place to read it and one to fix it.
//
// The session is re-checked on every call. A server action is a public POST
// endpoint; the fact that the page that rendered the button was behind auth
// proves nothing about the request that arrives.
//
// These return a result rather than throwing, like the class actions in
// app/(app)/timetable/actions.ts and for the same reason: the sheet has to be
// told when to keep itself open and print why.

async function signedIn() {
  const { workspace } = await requireWorkspace();
  return { supabase: await createClient(), workspaceId: workspace.id };
}

/**
 * Turn whatever went wrong into one sentence the sheet can print.
 *
 * A `BandRuleError` already is that sentence — "That overlaps Evening on
 * Monday" — so it is passed through as written. Anything else is a bug and
 * says so plainly rather than reassuringly, with the real error in the log.
 */
function failed(error: unknown, doing: string): SaveResult {
  console.error(`bands: ${doing} failed`, error);
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, message: detail };
}

/**
 * A band changes the shape of the day, so it shows up on the calendar and on
 * today's page as well as on its own screens.
 */
function refreshed() {
  revalidatePath('/bands');
  revalidatePath('/calendar');
  revalidatePath('/today');
}

export async function createBandAction(values: {
  name: string;
  startsAt: string;
  endsAt: string;
  weekdays: number[];
}): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await createBand(supabase, { workspaceId, ...values });
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'creating a band');
  }
}

export async function updateBandAction(
  bandId: string,
  values: { name: string; startsAt: string; endsAt: string; weekdays: number[] }
): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await updateBand(supabase, { workspaceId, bandId, ...values });
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'saving a band');
  }
}

/**
 * Delete a band.
 *
 * Worth being clear about, because it looks alarming and is not: this removes a
 * frame. The university band owns no class, so deleting it deletes no lecture,
 * no note, no file and no task — `/timetable` and `/calendar` do not read this
 * table at all. modules/bands/bands.test.ts proves it against the real database.
 */
export async function removeBandAction(bandId: string): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await removeBand(supabase, workspaceId, bandId);
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'removing a band');
  }
}

export async function addSlotAction(
  bandId: string,
  values: {
    label: string;
    courseId: string | null;
    weekday: number;
    startsAt: string;
    endsAt: string;
  }
): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await addSlot(supabase, { workspaceId, bandId, ...values });
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'adding a slot');
  }
}

export async function updateSlotAction(
  slotId: string,
  values: {
    label: string;
    courseId: string | null;
    weekday: number;
    startsAt: string;
    endsAt: string;
  }
): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await updateSlot(supabase, { workspaceId, slotId, ...values });
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'saving a slot');
  }
}

export async function removeSlotAction(slotId: string): Promise<SaveResult> {
  try {
    const { supabase, workspaceId } = await signedIn();
    await removeSlot(supabase, workspaceId, slotId);
    refreshed();
    return { ok: true };
  } catch (error) {
    return failed(error, 'removing a slot');
  }
}
