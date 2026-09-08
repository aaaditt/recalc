import type { SupabaseClient } from '@supabase/supabase-js';

import * as repo from './repo';
import {
  addSlotInputSchema,
  BandRuleError,
  createBandInputSchema,
  updateBandInputSchema,
  updateSlotInputSchema,
  type AddSlotInput,
  type Band,
  type BandSlot,
  type BandWithSlots,
  type CreateBandInput,
  type UpdateBandInput,
  type UpdateSlotInput,
} from './schema';
import { getSessionsInWorkspace } from '@/modules/courses';
import { getPeriods } from '@/modules/timetable';

// The rules a band obeys, and the one rule it exists to obey.
//
// THE RULE: a band frames time, it never owns it. The university band draws
// from `sessions` and `class_meetings` and holds no copy of either, so deleting
// it deletes a frame and not one lecture, one note or one file. Everything else
// in this file is bookkeeping around that sentence, and
// modules/bands/bands.test.ts is what stops a later session undoing it.
//
// Three rules live here rather than in SQL because none of them is a cheap
// constraint. Two bands overlapping would need a range type per weekday
// checked against an array column; a slot sitting inside its band needs the
// band's row to say. This is where the codebase already puts rules of that
// shape — see modules/timetable/service.ts.

/** Postgres hands back 'HH:MM:SS'; a form hands in 'HH:MM'. Compare like with like. */
function toTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

/** Zero-padded times compare correctly as strings, so this is the whole of it. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function sharesADay(a: readonly number[], b: readonly number[]): number | null {
  return a.find((day) => b.includes(day)) ?? null;
}

const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Every band, with its slots.
 *
 * Two round trips whatever the number of bands, rather than one per band: this
 * is read on every paint of the 24-hour view and the database is ~600ms away.
 */
export async function getBands(
  db: SupabaseClient,
  workspaceId: string
): Promise<BandWithSlots[]> {
  const [bands, slots] = await Promise.all([
    repo.listBands(db, workspaceId),
    repo.listSlots(db, workspaceId),
  ]);

  const byBand = new Map<string, BandSlot[]>();
  for (const slot of slots) {
    const found = byBand.get(slot.band_id);
    if (found) found.push(slot);
    else byBand.set(slot.band_id, [slot]);
  }

  return bands.map((band) => ({ ...band, slots: byBand.get(band.id) ?? [] }));
}

export async function getBand(
  db: SupabaseClient,
  workspaceId: string,
  bandId: string
): Promise<BandWithSlots | null> {
  const band = await repo.findBand(db, workspaceId, bandId);
  if (!band) return null;
  const slots = await repo.listSlotsForBand(db, workspaceId, bandId);
  return { ...band, slots };
}

// ---------------------------------------------------------------------------
// The university band
// ---------------------------------------------------------------------------

/**
 * Make the university band from the printed timetable, if it is not there yet.
 *
 * Migration 019 seeds it for every workspace that already had periods. This is
 * the same derivation for a workspace created after that migration, which on a
 * fresh account is the path that actually runs — the same arrangement
 * `ensurePeriods` has, and idempotent for the same reason.
 *
 * Its span is the grid's own span: the first period's start to the last
 * period's end. Its days are the days that actually have a class, because a
 * band that claims Friday when nothing is ever on a Friday is a lie the whole
 * screen is built on. No periods at all means no band, and /bands says so
 * rather than inventing 07:30.
 */
export async function ensureUniversityBand(
  db: SupabaseClient,
  workspaceId: string
): Promise<Band | null> {
  const existing = await repo.findUniversityBand(db, workspaceId);
  if (existing) return existing;

  const periods = await getPeriods(db, workspaceId);
  if (periods.length === 0) return null;

  const startsAt = periods.reduce(
    (earliest, period) => (period.starts_at < earliest ? period.starts_at : earliest),
    periods[0].starts_at
  );
  const endsAt = periods.reduce(
    (latest, period) => (period.ends_at > latest ? period.ends_at : latest),
    periods[0].ends_at
  );

  const sessions = await getSessionsInWorkspace(db, workspaceId);
  const days = [...new Set(sessions.map((session) => session.weekday))].sort((a, b) => a - b);

  try {
    return await repo.insertBand(db, {
      workspace_id: workspaceId,
      name: 'University',
      kind: 'university',
      starts_at: startsAt,
      ends_at: endsAt,
      weekdays: days.length > 0 ? days : [1, 2, 3, 4, 5],
      position: 1,
    });
  } catch {
    // Two first page loads at once. The partial unique index refused the
    // second, which is exactly what it is for — read back the winner.
    return repo.findUniversityBand(db, workspaceId);
  }
}

// ---------------------------------------------------------------------------
// Writing a band
// ---------------------------------------------------------------------------

/**
 * No two bands may cover the same minute of the same weekday.
 *
 * You are in one part of your day at a time. Allowing two would mean every
 * screen that asks "which band am I in" has to answer with a list, and the
 * `/today` line — the place this feature earns its keep — has nothing sensible
 * to say. `ignoreId` is the band being edited, which cannot clash with itself.
 */
async function assertNoOverlap(
  db: SupabaseClient,
  workspaceId: string,
  span: { startsAt: string; endsAt: string; weekdays: number[] },
  ignoreId?: string
): Promise<void> {
  const startsAt = toTime(span.startsAt);
  const endsAt = toTime(span.endsAt);

  for (const other of await repo.listBands(db, workspaceId)) {
    if (other.id === ignoreId) continue;
    if (!overlaps(startsAt, endsAt, other.starts_at, other.ends_at)) continue;

    const day = sharesADay(span.weekdays, other.weekdays);
    if (day === null) continue;

    throw new BandRuleError(
      `That overlaps ${other.name} on ${DAY_NAME[day]} ` +
        `(${other.starts_at.slice(0, 5)}–${other.ends_at.slice(0, 5)}). ` +
        'Two bands cannot cover the same minute of the same day.'
    );
  }
}

export async function createBand(
  db: SupabaseClient,
  input: CreateBandInput
): Promise<Band> {
  const values = createBandInputSchema.parse(input);

  if (toTime(values.endsAt) <= toTime(values.startsAt)) {
    throw new BandRuleError('A band has to end after it starts.');
  }

  await assertNoOverlap(db, values.workspaceId, values);

  const position = await repo.lastPosition(db, values.workspaceId);

  return repo.insertBand(db, {
    workspace_id: values.workspaceId,
    name: values.name,
    // Nothing here can make a second university band. There is one printed
    // timetable, and `ensureUniversityBand` is the only thing that names it.
    kind: 'custom',
    starts_at: toTime(values.startsAt),
    ends_at: toTime(values.endsAt),
    weekdays: values.weekdays,
    position: position + 1,
  });
}

/**
 * Edit a band's frame.
 *
 * `kind` is not a field: a custom band cannot become the timetable and the
 * timetable cannot stop being one. Narrowing the university band moves no
 * lecture — it only changes what the frame says, and a class that falls outside
 * every band still draws on the calendar exactly as it always did.
 */
export async function updateBand(
  db: SupabaseClient,
  input: UpdateBandInput
): Promise<Band> {
  const values = updateBandInputSchema.parse(input);

  const band = await repo.findBand(db, values.workspaceId, values.bandId);
  if (!band) throw new BandRuleError('That band is not here any more.');

  const startsAt = toTime(values.startsAt ?? band.starts_at);
  const endsAt = toTime(values.endsAt ?? band.ends_at);
  const weekdays = values.weekdays ?? band.weekdays;

  if (endsAt <= startsAt) {
    throw new BandRuleError('A band has to end after it starts.');
  }

  await assertNoOverlap(db, values.workspaceId, { startsAt, endsAt, weekdays }, band.id);

  // A band cannot be narrowed out from under its own slots. Moving the frame
  // and silently orphaning what is inside it is the one way this table could
  // start disagreeing with itself.
  const slots = await repo.listSlotsForBand(db, values.workspaceId, band.id);
  const orphan = slots.find(
    (slot) =>
      !weekdays.includes(slot.weekday) ||
      slot.starts_at < startsAt ||
      slot.ends_at > endsAt
  );
  if (orphan) {
    throw new BandRuleError(
      `${orphan.label} (${DAY_NAME[orphan.weekday]} ` +
        `${orphan.starts_at.slice(0, 5)}–${orphan.ends_at.slice(0, 5)}) ` +
        'would fall outside the band. Move or remove it first.'
    );
  }

  return repo.updateBandRow(db, band.id, {
    ...(values.name === undefined ? {} : { name: values.name }),
    starts_at: startsAt,
    ends_at: endsAt,
    weekdays,
  });
}

/**
 * Remove a band.
 *
 * Its own slots go with it, because `band_slots.band_id` cascades and a slot
 * has no meaning outside the band it was written in. Nothing else moves. This
 * is true of the university band too: deleting it deletes the frame, and every
 * session, lecture, note, file and task carries on exactly as before —
 * `/timetable` and `/calendar` do not read this table at all.
 */
export async function removeBand(
  db: SupabaseClient,
  workspaceId: string,
  bandId: string
): Promise<void> {
  const band = await repo.findBand(db, workspaceId, bandId);
  if (!band) return;
  await repo.deleteBand(db, band.id);
}

// ---------------------------------------------------------------------------
// Writing a slot
// ---------------------------------------------------------------------------

/**
 * A slot has to sit inside its band, on a day the band runs, and clear of the
 * other slots on that day.
 *
 * The university band takes no slots at all. Its contents are `sessions` — one
 * place a class lives, not two. Everything in docs/PRODUCT.md is downstream of
 * there being exactly one copy of a thing.
 */
async function assertFits(
  db: SupabaseClient,
  band: Band,
  slot: { weekday: number; startsAt: string; endsAt: string },
  ignoreId?: string
): Promise<void> {
  if (band.kind === 'university') {
    throw new BandRuleError(
      'The university band is drawn from your timetable, so it has no slots of ' +
        'its own. Add the class on /timetable instead.'
    );
  }

  const startsAt = toTime(slot.startsAt);
  const endsAt = toTime(slot.endsAt);

  if (endsAt <= startsAt) {
    throw new BandRuleError('A slot has to end after it starts.');
  }
  if (!band.weekdays.includes(slot.weekday)) {
    throw new BandRuleError(`${band.name} does not run on ${DAY_NAME[slot.weekday]}.`);
  }
  if (startsAt < band.starts_at || endsAt > band.ends_at) {
    throw new BandRuleError(
      `${band.name} runs ${band.starts_at.slice(0, 5)}–${band.ends_at.slice(0, 5)}. ` +
        'A slot has to sit inside it.'
    );
  }

  const siblings = await repo.listSlotsForBand(db, band.workspace_id, band.id);
  const clash = siblings.find(
    (other) =>
      other.id !== ignoreId &&
      other.weekday === slot.weekday &&
      overlaps(startsAt, endsAt, other.starts_at, other.ends_at)
  );
  if (clash) {
    throw new BandRuleError(
      `That overlaps ${clash.label} ` +
        `(${clash.starts_at.slice(0, 5)}–${clash.ends_at.slice(0, 5)}).`
    );
  }
}

export async function addSlot(
  db: SupabaseClient,
  input: AddSlotInput
): Promise<BandSlot> {
  const values = addSlotInputSchema.parse(input);

  const band = await repo.findBand(db, values.workspaceId, values.bandId);
  if (!band) throw new BandRuleError('That band is not here any more.');

  await assertFits(db, band, values);

  return repo.insertSlot(db, {
    band_id: band.id,
    workspace_id: values.workspaceId,
    label: values.label,
    course_id: values.courseId ?? null,
    weekday: values.weekday,
    starts_at: toTime(values.startsAt),
    ends_at: toTime(values.endsAt),
  });
}

export async function updateSlot(
  db: SupabaseClient,
  input: UpdateSlotInput
): Promise<BandSlot> {
  const values = updateSlotInputSchema.parse(input);

  const slot = await repo.findSlot(db, values.workspaceId, values.slotId);
  if (!slot) throw new BandRuleError('That slot is not here any more.');

  const band = await repo.findBand(db, values.workspaceId, slot.band_id);
  if (!band) throw new BandRuleError('That band is not here any more.');

  const next = {
    weekday: values.weekday ?? slot.weekday,
    startsAt: toTime(values.startsAt ?? slot.starts_at),
    endsAt: toTime(values.endsAt ?? slot.ends_at),
  };

  await assertFits(db, band, next, slot.id);

  return repo.updateSlotRow(db, slot.id, {
    ...(values.label === undefined ? {} : { label: values.label }),
    ...(values.courseId === undefined ? {} : { course_id: values.courseId }),
    weekday: next.weekday,
    starts_at: next.startsAt,
    ends_at: next.endsAt,
  });
}

export async function removeSlot(
  db: SupabaseClient,
  workspaceId: string,
  slotId: string
): Promise<void> {
  const slot = await repo.findSlot(db, workspaceId, slotId);
  if (!slot) return;
  await repo.deleteSlot(db, slot.id);
}
