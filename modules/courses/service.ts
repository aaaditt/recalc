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
  createCourseInputSchema,
  updateCourseInputSchema,
  createOneOffMeetingInputSchema,
  createSessionInputSchema,
  createSyllabusUnitInputSchema,
  generateMeetingsInputSchema,
  updateSessionInputSchema,
  meetingStatusSchema,
  rescheduleMeetingInputSchema,
  syllabusUnitStatusSchema,
  syllabusUnitTitleSchema,
  unitMoveSchema,
  type ClassMeeting,
  type Course,
  type CreateCourseInput,
  type CreateOneOffMeetingInput,
  type CreateSessionInput,
  type CreateSyllabusUnitInput,
  type UpdateCourseInput,
  type UpdateSessionInput,
  type GenerateMeetingsInput,
  type GenerateMeetingsResult,
  type MeetingStatus,
  type RescheduleMeetingInput,
  type Session,
  type SyllabusUnit,
  type SyllabusUnitStatus,
  type UnitMove,
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

/** One course by id, or null when it is not this workspace's. */
export async function getCourse(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Course | null> {
  return repo.findCourse(db, workspaceId, id);
}

export async function getSyllabusUnits(
  db: SupabaseClient,
  courseId: string
): Promise<SyllabusUnit[]> {
  return repo.listSyllabusUnits(db, courseId);
}

/** Every weekly pattern row for this workspace's courses. What /timetable draws. */
export async function getSessions(
  db: SupabaseClient,
  workspaceId: string,
  term?: string
): Promise<Session[]> {
  const courses = await repo.listCourses(db, workspaceId, term);
  return repo.listSessions(
    db,
    courses.map((course) => course.id)
  );
}

/** One weekly pattern row, proved to belong to this workspace. Null otherwise. */
export async function getSession(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<Session | null> {
  const session = await repo.findSession(db, id);
  if (!session) return null;
  const course = await repo.findCourse(db, workspaceId, session.course_id);
  return course ? session : null;
}

/** Every lecture this weekly pattern has ever produced, earliest first. */
export async function getMeetingsForSession(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string
): Promise<ClassMeeting[]> {
  const session = await getSession(db, workspaceId, sessionId);
  if (!session) throw new Error(`getMeetingsForSession: no session ${sessionId} here`);
  return repo.listMeetingsForSession(db, sessionId);
}

// ---------------------------------------------------------------------------
// Courses and weekly patterns — slice 16
//
// Until this slice both were typed into the Supabase table editor
// (docs/SEEDING.md). Everything below is the same two inserts, with the
// ownership checks the table editor never made.
// ---------------------------------------------------------------------------

/** A new subject. `code` is unique per workspace and term — the DB enforces it. */
export async function createCourse(
  db: SupabaseClient,
  input: CreateCourseInput
): Promise<Course> {
  const parsed = createCourseInputSchema.parse(input);
  return repo.insertCourse(db, {
    workspace_id: parsed.workspaceId,
    code: parsed.code,
    name: parsed.name,
    term: parsed.term,
    colour: parsed.colour ?? null,
  });
}

/**
 * Everything about a course that can be corrected afterwards — slice 17.
 *
 * Slice 16 could only create a course inline from a grid cell, with a code, a
 * name and a colour. The instructor, the credits and the term had nowhere to be
 * typed except the Supabase table editor. This is that screen's write.
 *
 * The course is read first and proved to be this workspace's, so a forged id
 * cannot recolour someone else's course — the same shape every write in this
 * module has used since slice 06.
 */
export async function updateCourse(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  input: UpdateCourseInput
): Promise<Course> {
  const parsed = updateCourseInputSchema.parse(input);
  await ownedCourse(db, workspaceId, id);

  return repo.updateCourseRow(db, id, {
    ...(parsed.code === undefined ? {} : { code: parsed.code }),
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.term === undefined ? {} : { term: parsed.term }),
    ...(parsed.colour === undefined ? {} : { colour: parsed.colour }),
    ...(parsed.instructor === undefined
      ? {}
      : { instructor: parsed.instructor?.trim() ? parsed.instructor.trim() : null }),
    ...(parsed.credits === undefined ? {} : { credits: parsed.credits }),
  });
}

/**
 * Delete one course, having already been told it is safe.
 *
 * Postgres cascades this to the course's sessions, syllabus units and dated
 * lectures. Deciding whether any of those carry work — a note, a file, a task —
 * needs modules/files and modules/notes, both of which import *this* module, so
 * the judgement is made in modules/timetable and this is deliberately not
 * "delete the course and work out what that costs". Same shape as
 * `removeMeetings` above, for the same reason.
 */
export async function deleteCourse(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<void> {
  await ownedCourse(db, workspaceId, id);
  await repo.deleteCourseRow(db, id);
}

/** Every dated lecture this course has ever had, earliest first. */
export async function getMeetingsForCourse(
  db: SupabaseClient,
  workspaceId: string,
  courseId: string
): Promise<ClassMeeting[]> {
  await ownedCourse(db, workspaceId, courseId);
  return repo.listMeetingsForCourse(db, workspaceId, courseId);
}

/** Every weekly slot filed under one period row of the printed grid. */
export async function getSessionsForPeriod(
  db: SupabaseClient,
  workspaceId: string,
  periodId: string
): Promise<Session[]> {
  const sessions = await getSessions(db, workspaceId);
  return sessions.filter((session) => session.period_id === periodId);
}

/**
 * One weekly slot. This writes the *pattern* and nothing else — no dated
 * lecture is created here, because turning a pattern into lectures needs term
 * dates and is `generateMeetings`' job.
 */
export async function createSession(
  db: SupabaseClient,
  input: CreateSessionInput
): Promise<Session> {
  const parsed = createSessionInputSchema.parse(input);
  await ownedCourse(db, parsed.workspaceId, parsed.courseId);

  if (parsed.endsAt <= parsed.startsAt) {
    throw new Error('createSession: a class cannot end before it starts');
  }

  return repo.insertSession(db, {
    course_id: parsed.courseId,
    weekday: parsed.weekday,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
    room: parsed.room?.trim() ? parsed.room.trim() : null,
    is_lab: parsed.isLab ?? false,
    period_id: parsed.periodId ?? null,
  });
}

/**
 * Change one weekly slot: a different course in that cell, a different room, a
 * lab rather than a lecture.
 *
 * This touches the pattern only. Bringing already-generated lectures back into
 * line is `generateMeetings`, which does it additively and refuses to touch a
 * lecture anyone has written on.
 */
export async function updateSession(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  input: UpdateSessionInput
): Promise<Session> {
  const parsed = updateSessionInputSchema.parse(input);

  const session = await getSession(db, workspaceId, id);
  if (!session) throw new Error(`updateSession: no session ${id} in this workspace`);

  // Moving a slot to another course is moving it to another course this
  // workspace owns, and nowhere else.
  if (parsed.courseId && parsed.courseId !== session.course_id) {
    await ownedCourse(db, workspaceId, parsed.courseId);
  }

  const startsAt = parsed.startsAt ?? session.starts_at;
  const endsAt = parsed.endsAt ?? session.ends_at;
  if (endsAt <= startsAt) {
    throw new Error('updateSession: a class cannot end before it starts');
  }

  return repo.updateSessionRow(db, id, {
    ...(parsed.courseId ? { course_id: parsed.courseId } : {}),
    ...(parsed.weekday === undefined ? {} : { weekday: parsed.weekday }),
    ...(parsed.startsAt ? { starts_at: parsed.startsAt } : {}),
    ...(parsed.endsAt ? { ends_at: parsed.endsAt } : {}),
    ...(parsed.room === undefined
      ? {}
      : { room: parsed.room?.trim() ? parsed.room.trim() : null }),
    ...(parsed.isLab === undefined ? {} : { is_lab: parsed.isLab }),
    ...(parsed.periodId === undefined ? {} : { period_id: parsed.periodId }),
  });
}

/**
 * Drop one weekly pattern row, and only that row.
 *
 * Every lecture it produced survives — `class_meetings.session_id` is
 * `on delete set null`. Which of those lectures should actually be removed is a
 * judgement about notes, files and tasks, and it is made by modules/timetable
 * *before* this is called. Nothing here deletes a meeting.
 */
export async function removeSession(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<void> {
  const session = await getSession(db, workspaceId, id);
  if (!session) throw new Error(`removeSession: no session ${id} in this workspace`);
  await repo.deleteSession(db, id);
}

/**
 * Delete these exact lectures. The caller names every id, having already
 * checked each one carries nothing — this is deliberately not "delete the
 * meetings for session X", because that shape is how a term's notes get lost.
 */
export async function removeMeetings(
  db: SupabaseClient,
  workspaceId: string,
  ids: string[]
): Promise<number> {
  const safe: string[] = [];
  for (const id of ids) {
    const meeting = await repo.findMeeting(db, workspaceId, id);
    if (!meeting) throw new Error(`removeMeetings: no meeting ${id} in this workspace`);
    // Last line of defence. A caller that has miscounted still cannot destroy a
    // lecture that has been written on.
    if (isHandEdited(meeting)) {
      throw new Error(`removeMeetings: meeting ${id} has been edited by hand`);
    }
    safe.push(id);
  }
  return repo.deleteMeetings(db, safe);
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

/** Every lecture that has a note document, most recent lecture first. */
export async function getMeetingsWithNotes(
  db: SupabaseClient,
  workspaceId: string
): Promise<ClassMeeting[]> {
  return repo.listMeetingsWithNotes(db, workspaceId);
}

// ---------------------------------------------------------------------------
// Syllabus units — the ordered spine of a course
//
// `syllabus_units` carries no `workspace_id`: ownership flows through
// `course_id`, exactly as the RLS policies in migration 002 do. So every write
// below proves the course first and works from the row it read, never from an
// id the browser sent.
//
// This is the fifth slice in a row where a write takes a foreign id from the
// browser, and slices 04, 05 and 06 each shipped the bug before it was found
// (docs/DECISIONS.md). The answer here is the same shape as `checkLinks` in
// modules/tasks and modules/study: two small helpers that every write runs, so
// no caller can forget the check because no caller performs it.
// ---------------------------------------------------------------------------

/** The course, proved to be this workspace's. Throws otherwise. */
async function ownedCourse(
  db: SupabaseClient,
  workspaceId: string,
  courseId: string
): Promise<Course> {
  const course = await repo.findCourse(db, workspaceId, courseId);
  if (!course) throw new Error(`syllabus: no course ${courseId} in this workspace`);
  return course;
}

/**
 * The unit, proved to belong to a course this workspace owns.
 *
 * The unit is read first and its own `course_id` is what gets checked, so a
 * caller supplying only a unit id cannot smuggle in someone else's row.
 */
async function ownedUnit(
  db: SupabaseClient,
  workspaceId: string,
  unitId: string
): Promise<SyllabusUnit> {
  const unit = await repo.findSyllabusUnit(db, unitId);
  if (!unit) throw new Error(`syllabus: no unit ${unitId}`);
  await ownedCourse(db, workspaceId, unit.course_id);
  return unit;
}

/**
 * Add a unit to the end of a course's syllabus.
 *
 * Appending — rather than asking for a position — is what makes typing a
 * syllabus in from a PDF a matter of type, enter, type, enter.
 */
export async function createSyllabusUnit(
  db: SupabaseClient,
  input: CreateSyllabusUnitInput
): Promise<SyllabusUnit> {
  const parsed = createSyllabusUnitInputSchema.parse(input);
  await ownedCourse(db, parsed.workspaceId, parsed.courseId);

  const units = await repo.listSyllabusUnits(db, parsed.courseId);
  return repo.insertSyllabusUnit(db, {
    course_id: parsed.courseId,
    position: units.length + 1,
    title: parsed.title,
  });
}

/** Fix a typo in a unit's title. The unit itself is unchanged. */
export async function renameSyllabusUnit(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  title: string
): Promise<SyllabusUnit> {
  await ownedUnit(db, workspaceId, id);
  return repo.updateSyllabusUnit(db, id, { title: syllabusUnitTitleSchema.parse(title) });
}

/**
 * How well I know this unit. Manual, always — docs/PRODUCT.md's payoff needs an
 * honest answer here, and no amount of minutes logged proves comprehension.
 */
export async function setSyllabusUnitStatus(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  status: SyllabusUnitStatus
): Promise<SyllabusUnit> {
  await ownedUnit(db, workspaceId, id);
  return repo.updateSyllabusUnit(db, id, {
    status: syllabusUnitStatusSchema.parse(status),
  });
}

/**
 * Put a course's units in exactly this order.
 *
 * `orderedIds` must be a permutation of the units this course already has —
 * every one of them, once each, and nothing else. A short list would silently
 * lose a unit; a foreign id would silently adopt someone else's. Both are
 * refused before anything is written.
 *
 * Positions are then rewritten as 1..n. That is a deliberate departure from the
 * fractional-index convention `blocks` uses: a syllabus is a short hand-typed
 * list that is read as "unit 1, unit 2, unit 3", and renumbering makes
 * "positions are 1..n, distinct" a property that holds after every single move
 * rather than a hope. Only the rows whose position actually changes are
 * written.
 */
export async function reorderSyllabusUnits(
  db: SupabaseClient,
  workspaceId: string,
  courseId: string,
  orderedIds: string[]
): Promise<SyllabusUnit[]> {
  await ownedCourse(db, workspaceId, courseId);

  const units = await repo.listSyllabusUnits(db, courseId);
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!byId.has(id)) {
      throw new Error(`reorderSyllabusUnits: unit ${id} is not on this course`);
    }
    if (seen.has(id)) {
      throw new Error(`reorderSyllabusUnits: unit ${id} is listed twice`);
    }
    seen.add(id);
  }
  if (seen.size !== units.length) {
    throw new Error(
      `reorderSyllabusUnits: expected all ${units.length} units, got ${seen.size}`
    );
  }

  for (const [index, id] of orderedIds.entries()) {
    const position = index + 1;
    if (byId.get(id)?.position !== position) {
      await repo.updateSyllabusUnit(db, id, { position });
    }
  }

  return repo.listSyllabusUnits(db, courseId);
}

/**
 * Move one unit one place up or down — the two arrows on the course page.
 *
 * The course is taken from the unit's own row rather than from the caller, so
 * the only client-supplied id is the unit's. At either end it is a no-op.
 */
export async function moveSyllabusUnit(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  move: UnitMove
): Promise<SyllabusUnit[]> {
  const unit = await ownedUnit(db, workspaceId, id);
  const direction = unitMoveSchema.parse(move);

  const units = await repo.listSyllabusUnits(db, unit.course_id);
  const order = units.map((row) => row.id);
  const from = order.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;

  if (from === -1 || to < 0 || to >= order.length) {
    // Already at the end it was asked to move towards. Still renumber, so a
    // list that arrived with duplicate positions is straightened out.
    return reorderSyllabusUnits(db, workspaceId, unit.course_id, order);
  }

  [order[from], order[to]] = [order[to], order[from]];
  return reorderSyllabusUnits(db, workspaceId, unit.course_id, order);
}

/**
 * Take a unit off the syllabus — slice 17.
 *
 * This is the one destructive thing on the course page, and it is safe to be
 * destructive about: `class_meetings.unit_id`, `tasks.unit_id` and
 * `syllabus_units.block_id` are all `on delete set null`, so a lecture that
 * covered the unit keeps its note and a task set on it keeps its title. What is
 * lost is the filing, not the writing.
 *
 * The remaining units are renumbered 1..n straight away, so "positions are
 * 1..n, distinct, in list order" survives a deletion exactly as it survives a
 * move.
 */
export async function removeSyllabusUnit(
  db: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<SyllabusUnit[]> {
  const unit = await ownedUnit(db, workspaceId, id);
  await repo.deleteSyllabusUnit(db, id);

  const left = await repo.listSyllabusUnits(db, unit.course_id);
  return reorderSyllabusUnits(
    db,
    workspaceId,
    unit.course_id,
    left.map((row) => row.id)
  );
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
 * Attach a note document to a lecture. Written once — the first time anything
 * is typed into that lecture's note — and never changed after, because a
 * lecture has exactly one note and it is the one already on screen.
 *
 * Setting it also makes the meeting hand-edited (see `isHandEdited`), so
 * regenerating the term can never move or duplicate a lecture that has notes.
 */
export async function setMeetingNote(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  noteBlockId: string
): Promise<ClassMeeting> {
  const meeting = await repo.findMeeting(db, workspaceId, id);
  if (!meeting) throw new Error(`setMeetingNote: no meeting ${id} in this workspace`);
  if (meeting.note_block_id) return meeting;
  return repo.updateMeetingNoteBlock(db, id, noteBlockId);
}

/**
 * One tap on the lecture page: which syllabus unit this lecture covered.
 *
 * This is the link the study analytics are built on — minutes and questions
 * per unit only mean anything once lectures name their unit — so it is worth
 * the extra read that keeps a unit from another course out.
 */
export async function setMeetingUnit(
  db: SupabaseClient,
  workspaceId: string,
  id: string,
  unitId: string | null
): Promise<ClassMeeting> {
  const meeting = await repo.findMeeting(db, workspaceId, id);
  if (!meeting) throw new Error(`setMeetingUnit: no meeting ${id} in this workspace`);

  if (unitId !== null) {
    const unit = await repo.findSyllabusUnit(db, unitId);
    if (!unit || unit.course_id !== meeting.course_id) {
      throw new Error('setMeetingUnit: that unit belongs to a different course');
    }
  }

  return repo.updateMeetingUnit(db, id, unitId);
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

  // courseId is client-supplied. workspaceId is not (every caller derives it
  // from the session), but without this check a forged courseId could attach
  // a meeting to a course this workspace does not own — RLS on class_meetings
  // only validates workspace_id, not the course_id it references.
  const course = await repo.findCourse(db, parsed.workspaceId, parsed.courseId);
  if (!course) {
    throw new Error(`createOneOffMeeting: no course ${parsed.courseId} in this workspace`);
  }

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

/**
 * The same question, asked from outside the module.
 *
 * modules/timetable has to answer "may this lecture be deleted?" and there must
 * be exactly one definition of "this lecture has been written on" in the
 * project. This is it.
 */
export function meetingWasHandEdited(meeting: ClassMeeting): boolean {
  return isHandEdited(meeting);
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
