import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  addSlot,
  createBand,
  ensureUniversityBand,
  getBand,
  getBands,
  removeBand,
  updateBand,
} from '@/modules/bands';
import { createBlock, getBlock } from '@/modules/blocks';
import {
  getMeetingsForSession,
  getSession,
  setMeetingNote,
  type ClassMeeting,
} from '@/modules/courses';
import { addClass, getPeriods } from '@/modules/timetable';
import { ensureWorkspace, setTerm } from '@/modules/workspaces';

// THE test for slice 25.
//
//   A BAND FRAMES TIME. IT NEVER OWNS IT.
//
// The university band is a lens over `sessions` and `class_meetings`. It holds
// no copy of a class, which is what makes it impossible for /calendar,
// /timetable and the 24-hour view to disagree about when a lecture is. The
// moment a band starts storing its own classes there are two places a class
// lives and one of them is wrong — and there is no undo for notes and files
// filed against the wrong lecture.
//
// So the load-bearing assertion here is a deletion: destroy the university
// band, the most alarming thing this feature can do, and prove that every
// session, every dated lecture, every instant, every id and the note block
// attached to one of them is exactly where it was. If a later session ever
// gives a band a foreign key that cascades into the semester, this file fails.
//
// The other four are the rules that keep the screen coherent: no two bands over
// the same minute of the same day, no slot outside its band, no slots at all on
// the university band, and editing a frame moves nothing inside it.
//
// Real database, because the cascade from `bands` to `band_slots`, the partial
// unique index on the university band and the RLS policies are all part of what
// is being proved. Throwaway user + workspace, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'bands.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

// 2030-10-07 is a Monday, so the window holds three Tuesdays (8, 15, 22).
const TERM_START = '2030-10-07';
const TERM_END = '2030-10-27';
const TIME_ZONE = 'Asia/Dubai'; // UTC+4, no DST.
const TUESDAY = 2;
const SATURDAY = 6;

describe('a band frames time, it never owns it', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let sessionId: string;
  let notedMeetingId: string;
  let noteBlockId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `bands-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;
    await setTerm(db, workspaceId, { termStart: TERM_START, termEnd: TERM_END });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, and from there to bands,
    // band_slots, periods, courses, sessions, class_meetings and blocks.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  async function meetings(): Promise<ClassMeeting[]> {
    return getMeetingsForSession(db, workspaceId, sessionId);
  }

  it('sets up a real semester: a class, its lectures, and a note on one of them', async () => {
    const periods = await getPeriods(db, workspaceId);
    expect(periods).toHaveLength(9);

    const added = await addClass(db, {
      workspaceId,
      periodId: periods[2].id, // 3rd, 09:20–10:10
      weekday: TUESDAY,
      room: '257',
      newCourse: { code: 'CS301', name: 'Operating Systems', colour: 'teal', term: 'Fall 2030' },
      timeZone: TIME_ZONE,
    });
    sessionId = added.session.id;

    const all = await meetings();
    expect(all.length).toBeGreaterThanOrEqual(3);

    const note = await createBlock(db, {
      workspaceId,
      type: 'text',
      content: { text: 'Notes from the 15 October lecture.' },
    });
    noteBlockId = note.id;
    notedMeetingId = all[1].id;
    await setMeetingNote(db, workspaceId, notedMeetingId, noteBlockId);
  });

  it('makes the university band out of the printed timetable, and only ever one', async () => {
    const band = await ensureUniversityBand(db, workspaceId);
    expect(band).not.toBeNull();
    expect(band?.kind).toBe('university');

    // The grid's own span: the first period's start to the last one's end.
    expect(band?.starts_at.slice(0, 5)).toBe('07:30');
    expect(band?.ends_at.slice(0, 5)).toBe('15:40');
    // The days that actually have a class, not a guess.
    expect(band?.weekdays).toEqual([TUESDAY]);

    // Idempotent: the second call is the same row, not a second band. The
    // partial unique index is what makes that true rather than merely intended.
    const again = await ensureUniversityBand(db, workspaceId);
    expect(again?.id).toBe(band?.id);

    const all = await getBands(db, workspaceId);
    expect(all.filter((one) => one.kind === 'university')).toHaveLength(1);
  });

  it('holds no class data of its own — its slots are, and stay, empty', async () => {
    const band = await ensureUniversityBand(db, workspaceId);
    const read = await getBand(db, workspaceId, band!.id);
    expect(read?.slots).toEqual([]);
  });

  it('refuses to let a slot be written into the university band', async () => {
    const band = await ensureUniversityBand(db, workspaceId);

    await expect(
      addSlot(db, {
        workspaceId,
        bandId: band!.id,
        label: 'Operating Systems',
        weekday: TUESDAY,
        startsAt: '09:20',
        endsAt: '10:10',
      })
    ).rejects.toThrow(/timetable/i);

    const read = await getBand(db, workspaceId, band!.id);
    expect(read?.slots).toEqual([]);
  });

  // THE ONE THAT MATTERS.
  it('deleting the university band destroys the frame and nothing else', async () => {
    const band = await ensureUniversityBand(db, workspaceId);

    const before = await meetings();
    const beforeIds = before.map((meeting) => meeting.id);
    const beforeInstants = before.map((meeting) => new Date(meeting.starts_at).toISOString());
    const sessionBefore = await getSession(db, workspaceId, sessionId);

    await removeBand(db, workspaceId, band!.id);
    expect(await getBand(db, workspaceId, band!.id)).toBeNull();

    // Same lectures, same ids, same instants. Not "the right number of them" —
    // the same ones, because a note is attached to one by id.
    const after = await meetings();
    expect(after.map((meeting) => meeting.id)).toEqual(beforeIds);
    expect(after.map((meeting) => new Date(meeting.starts_at).toISOString())).toEqual(
      beforeInstants
    );

    // The weekly pattern is untouched.
    const sessionAfter = await getSession(db, workspaceId, sessionId);
    expect(sessionAfter?.starts_at).toBe(sessionBefore?.starts_at);
    expect(sessionAfter?.weekday).toBe(sessionBefore?.weekday);

    // And the note is still attached to the lecture it was written in.
    const noted = after.find((meeting) => meeting.id === notedMeetingId);
    expect(noted?.note_block_id).toBe(noteBlockId);
    expect(await getBlock(db, noteBlockId)).not.toBeNull();

    // Put it back for the tests below.
    await ensureUniversityBand(db, workspaceId);
  });
});

describe('the rules that keep a day coherent', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let eveningId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `bands-rules-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;
    workspaceId = (await ensureWorkspace(db, userId)).id;
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('creates a band on the days it was asked for, and no others', async () => {
    const evening = await createBand(db, {
      workspaceId,
      name: 'Evening',
      startsAt: '18:00',
      endsAt: '23:00',
      weekdays: [3, 1, 1], // out of order and duplicated, on purpose
    });
    eveningId = evening.id;

    // Sorted and de-duplicated on the way in, so "does this run on Monday" does
    // not depend on the order it was typed.
    expect(evening.weekdays).toEqual([1, 3]);
    expect(evening.starts_at.slice(0, 5)).toBe('18:00');
  });

  it('refuses a second band over the same minute of the same day', async () => {
    await expect(
      createBand(db, {
        workspaceId,
        name: 'Gym',
        startsAt: '20:00',
        endsAt: '21:00',
        weekdays: [3],
      })
    ).rejects.toThrow(/overlaps Evening on Wednesday/i);
  });

  it('allows the very same hours on a day the other band does not run', async () => {
    const gym = await createBand(db, {
      workspaceId,
      name: 'Gym',
      startsAt: '20:00',
      endsAt: '21:00',
      weekdays: [SATURDAY],
    });
    expect(gym.weekdays).toEqual([SATURDAY]);
  });

  it('refuses a band that ends before it starts', async () => {
    await expect(
      createBand(db, {
        workspaceId,
        name: 'Backwards',
        startsAt: '22:00',
        endsAt: '02:00',
        weekdays: [5],
      })
    ).rejects.toThrow(/end after it starts/i);
  });

  it('takes a slot that fits inside its band', async () => {
    const slot = await addSlot(db, {
      workspaceId,
      bandId: eveningId,
      label: 'Gym',
      weekday: 1,
      startsAt: '18:00',
      endsAt: '19:00',
    });
    expect(slot.starts_at.slice(0, 5)).toBe('18:00');
  });

  it('refuses a slot that falls outside the band', async () => {
    await expect(
      addSlot(db, {
        workspaceId,
        bandId: eveningId,
        label: 'Too late',
        weekday: 1,
        startsAt: '23:30',
        endsAt: '23:45',
      })
    ).rejects.toThrow(/18:00–23:00/);
  });

  it('refuses a slot on a day the band does not run', async () => {
    await expect(
      addSlot(db, {
        workspaceId,
        bandId: eveningId,
        label: 'Gym',
        weekday: 2, // Evening runs Monday and Wednesday
        startsAt: '18:00',
        endsAt: '19:00',
      })
    ).rejects.toThrow(/does not run on Tuesday/i);
  });

  it('refuses a slot that overlaps another slot on the same day', async () => {
    await expect(
      addSlot(db, {
        workspaceId,
        bandId: eveningId,
        label: 'Dinner',
        weekday: 1,
        startsAt: '18:30',
        endsAt: '19:30',
      })
    ).rejects.toThrow(/overlaps Gym/i);
  });

  it('refuses to narrow a band out from under its own slots', async () => {
    await expect(
      updateBand(db, { workspaceId, bandId: eveningId, startsAt: '19:00' })
    ).rejects.toThrow(/would fall outside the band/i);

    // And the band is unchanged, not half-saved.
    const band = await getBand(db, workspaceId, eveningId);
    expect(band?.starts_at.slice(0, 5)).toBe('18:00');
  });

  it('moves a frame without moving what is inside it', async () => {
    const before = await getBand(db, workspaceId, eveningId);

    const after = await updateBand(db, { workspaceId, bandId: eveningId, endsAt: '22:00' });
    expect(after.ends_at.slice(0, 5)).toBe('22:00');

    const read = await getBand(db, workspaceId, eveningId);
    expect(read?.slots.map((slot) => slot.id)).toEqual(
      before?.slots.map((slot) => slot.id)
    );
    expect(read?.slots[0].starts_at).toBe(before?.slots[0].starts_at);
  });

  it('takes its slots with it when it goes, and nothing else', async () => {
    const before = await getBand(db, workspaceId, eveningId);
    expect(before?.slots.length).toBeGreaterThan(0);

    await removeBand(db, workspaceId, eveningId);

    expect(await getBand(db, workspaceId, eveningId)).toBeNull();
    // The other band is still there. A delete is one band, not a tidy-up.
    const left = await getBands(db, workspaceId);
    expect(left.map((band) => band.name)).toContain('Gym');
  });
});
