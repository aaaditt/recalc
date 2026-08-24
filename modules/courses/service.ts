import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dateRangeUtc,
  dayRangeUtc,
  eachDate,
  localDateKey,
  localTimeZone,
  weekdayOf,
  zonedToUtc,
  type CalendarDate,
} from '@/lib/time';
import * as repo from './repo';
import {
  createOneOffMeetingInputSchema,
  generateMeetingsInputSchema,
  meetingStatusSchema,
  rescheduleMeetingInputSchema,
  type ClassMeeting,
  type Course,
  type CreateOneOffMeetingInput,
  type GenerateMeetingsInput,
  type GenerateMeetingsResult,
  type MeetingStatus,
  type RescheduleMeetingInput,
  type Session,
  type SyllabusUnit,
} from './schema';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCourses(
  db: SupabaseClient,
  workspaceId: string,
  term?: string
): Promise<Course[]> {
  return repo.listCourses(db, workspaceId, term);
}

export async function getSyllabusUnits(
  db: SupabaseClient,
  courseId: string
): Promise<SyllabusUnit[]> {
  return repo.listSyllabusUnits(db, courseId);
}

/** Every lecture on one local calendar day, earliest first. */
export async function getMeetingsOnDate(
  db: SupabaseClient,
  workspaceId: string,
  date: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<ClassMeeting[]> {
  const range = dayRangeUtc(date, timeZone);
  return repo.listMeetingsBetween(db, workspaceId, range.startsAt, range.endsAt);
}

/** Every lecture from `from` to `to` inclusive, earliest first. */
export async function getMeetingsBetween(
  db: SupabaseClient,
  workspaceId: string,
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string = localTimeZone()
): Promise<ClassMeeting[]> {
  const range = dateRangeUtc(from, to, timeZone);
  return repo.listMeetingsBetween(db, workspaceId, range.startsAt, range.endsAt);
}

/** One lecture by id, or null when it is not this workspace's. */
export async function getMeeting(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<ClassMeeting | null> {
  return repo.findMeeting(db, workspaceId, id);
}

// ---------------------------------------------------------------------------
// Editing one meeting
//
// docs/SCHEMA.md: meetings are generated once and then edited individually.
// Everything below changes exactly one row and never consults the weekly
// pattern, so moving Tuesday's lecture leaves every other Tuesday alone.
// ---------------------------------------------------------------------------

/**
 * Move or resize one dated lecture — the week grid's drag.
 *
 * The meeting keeps its `session_id`, so it is now out of step with the
 * pattern. That is deliberate: `generateMeetings` leaves it alone from here
 * because a rescheduled lecture is a hand-edit, and the pattern re-asserting
 * itself would undo the move on the next run. (See `isHandEdited`: a moved
 * meeting is marked `moved`, which is the flag that protects it.)
 */
export async function rescheduleMeeting(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  input: RescheduleMeetingInput
): Promise<ClassMeeting> {
  const parsed = rescheduleMeetingInputSchema.parse(input);

  if (new Date(parsed.endsAt).getTime() <= new Date(parsed.startsAt).getTime()) {
    throw new Error('rescheduleMeeting: a lecture cannot end before it starts');
  }

  const meeting = await repo.findMeeting(db, workspaceId, id);
  if (!meeting) throw new Error(`rescheduleMeeting: no meeting ${id} in this workspace`);

  const moved = await repo.updateMeetingTimes(db, id, {
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
  });

  // A lecture that was dragged is no longer what the timetable says. Marking
  // it `moved` is what stops the next generateMeetings run putting it back.
  // A cancelled lecture stays cancelled — dragging it does not un-cancel it.
  if (moved.status === 'scheduled' && moved.session_id !== null) {
    return repo.updateMeetingStatus(db, id, 'moved');
  }
  return moved;
}

/** One tap on the calendar: cancel this class, or put it back. */
export async function setMeetingStatus(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  status: MeetingStatus
): Promise<ClassMeeting> {
  const meeting = await repo.findMeeting(db, workspaceId, id);
  if (!meeting) throw new Error(`setMeetingStatus: no meeting ${id} in this workspace`);
  return repo.updateMeetingStatus(db, id, meetingStatusSchema.parse(status));
}

/**
 * A lecture the weekly pattern does not know about: a make-up class, a guest
 * lecture, an exam. `session_id` is null, which is exactly what keeps
 * `generateMeetings` from ever touching or duplicating it.
 */
export async function createOneOffMeeting(
  db: SupabaseClient,
  input: CreateOneOffMeetingInput
): Promise<ClassMeeting> {
  const parsed = createOneOffMeetingInputSchema.parse(input);
  const timeZone = parsed.timeZone ?? localTimeZone();

  const startsAt = zonedToUtc(parsed.date, parsed.startsAt, timeZone);
  const endsAt = zonedToUtc(parsed.date, parsed.endsAt, timeZone);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('createOneOffMeeting: a lecture cannot end before it starts');
  }

  const [created] = await repo.insertMeetings(db, [
    {
      workspace_id: parsed.workspaceId,
      course_id: parsed.courseId,
      session_id: null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      room: parsed.room ?? null,
    },
  ]);
  return created;
}

// ---------------------------------------------------------------------------
// Meeting generation
// ---------------------------------------------------------------------------

// A meeting counts as hand-edited the moment it carries anything the pattern
// could not have produced. Those are never touched again — regenerating over
// them is exactly the mistake docs/SCHEMA.md warns about, because it orphans
// the notes and files attached to that lecture.
//
// `files` (slice 09) is not checked yet: the table does not exist, and a file
// is always attached from a lecture page that also writes note_block_id. Add
// the check here when the files module lands.
function isHandEdited(meeting: ClassMeeting): boolean {
  return (
    meeting.note_block_id !== null ||
    meeting.topic !== null ||
    meeting.unit_id !== null ||
    meeting.status !== 'scheduled'
  );
}

function appliesOn(session: Session, date: CalendarDate): boolean {
  if (session.weekday !== weekdayOf(date)) return false;
  if (session.valid_from && date < session.valid_from) return false;
  if (session.valid_until && date > session.valid_until) return false;
  return true;
}

function sameSchedule(
  meeting: ClassMeeting,
  wanted: { startsAt: string; endsAt: string; room: string | null }
): boolean {
  return (
    new Date(meeting.starts_at).getTime() === new Date(wanted.startsAt).getTime() &&
    new Date(meeting.ends_at).getTime() === new Date(wanted.endsAt).getTime() &&
    meeting.room === wanted.room
  );
}

/**
 * Expand the weekly `sessions` pattern into dated `class_meetings` across the
 * term.
 *
 * Idempotent. Running it twice creates nothing the second time, and a meeting
 * that has been hand-edited — a note, a topic, a unit, a cancellation — is
 * never modified or duplicated. A meeting that is still untouched has its time
 * and room brought back into line when the timetable itself is corrected.
 *
 * One meeting per weekly pattern per local day is the identity rule, so moving
 * a class from 09:00 to 10:00 moves the existing lecture rather than adding a
 * second one.
 */
export async function generateMeetings(
  db: SupabaseClient,
  input: GenerateMeetingsInput
): Promise<GenerateMeetingsResult> {
  const parsed = generateMeetingsInputSchema.parse(input);
  const timeZone = parsed.timeZone ?? localTimeZone();

  if (parsed.termEnd < parsed.termStart) {
    throw new Error(
      `generateMeetings: termEnd ${parsed.termEnd} is before termStart ${parsed.termStart}`
    );
  }

  const courses = await repo.listCourses(db, parsed.workspaceId, parsed.term);
  const sessions = await repo.listSessions(
    db,
    courses.map((course) => course.id)
  );
  if (sessions.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const courseOf = new Map(courses.map((course) => [course.id, course]));

  // What the timetable says should exist, keyed by pattern + local day.
  type Wanted = {
    session: Session;
    startsAt: string;
    endsAt: string;
    room: string | null;
  };
  const wanted = new Map<string, Wanted>();

  for (const date of eachDate(parsed.termStart, parsed.termEnd)) {
    for (const session of sessions) {
      if (!appliesOn(session, date)) continue;
      wanted.set(`${session.id}|${date}`, {
        session,
        startsAt: zonedToUtc(date, session.starts_at, timeZone).toISOString(),
        endsAt: zonedToUtc(date, session.ends_at, timeZone).toISOString(),
        room: session.room,
      });
    }
  }
  if (wanted.size === 0) return { created: 0, updated: 0, unchanged: 0 };

  // What already exists. The window is widened by a day on each side so a
  // meeting sitting just outside the term's instant range — because its time
  // moved across midnight — is still recognised rather than duplicated.
  const window = dateRangeUtc(parsed.termStart, parsed.termEnd, timeZone);
  const existing = await repo.listMeetingsForSessions(
    db,
    sessions.map((session) => session.id),
    new Date(new Date(window.startsAt).getTime() - 86_400_000).toISOString(),
    new Date(new Date(window.endsAt).getTime() + 86_400_000).toISOString()
  );

  const existingByKey = new Map<string, ClassMeeting>();
  for (const meeting of existing) {
    const date = localDateKey(new Date(meeting.starts_at), timeZone);
    existingByKey.set(`${meeting.session_id}|${date}`, meeting);
  }

  const toInsert: repo.NewMeetingRow[] = [];
  const toUpdate: { meeting: ClassMeeting; wanted: Wanted }[] = [];
  let unchanged = 0;

  for (const [key, want] of wanted) {
    const meeting = existingByKey.get(key);

    if (!meeting) {
      const course = courseOf.get(want.session.course_id);
      if (!course) continue; // Cannot happen: sessions came from these courses.
      toInsert.push({
        workspace_id: parsed.workspaceId,
        course_id: course.id,
        session_id: want.session.id,
        starts_at: want.startsAt,
        ends_at: want.endsAt,
        room: want.room,
      });
      continue;
    }

    if (isHandEdited(meeting) || sameSchedule(meeting, want)) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ meeting, wanted: want });
  }

  await repo.insertMeetings(db, toInsert);
  for (const { meeting, wanted: want } of toUpdate) {
    await repo.updateMeetingSchedule(db, meeting.id, {
      starts_at: want.startsAt,
      ends_at: want.endsAt,
      room: want.room,
    });
  }

  return { created: toInsert.length, updated: toUpdate.length, unchanged };
}
