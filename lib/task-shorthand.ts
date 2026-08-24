// Quick add: "Thermo problem set fri 5pm" -> a title, a course and a deadline.
//
// Pure, and deliberately small. It reads date and time words off the *end* of
// what was typed, so the title keeps its own words: "Read chapter 5 by tuesday"
// is a task called "Read chapter 5 by" — no. See `FILLER` below; short joining
// words directly in front of a date are dropped too, because that sentence is
// how a person actually types.
//
// Nothing here guesses silently. What was understood is handed back field by
// field so the input can show it before anything is saved (prompts/06-tasks.md:
// "if parsing is ambiguous, show what it understood before saving").
//
// It runs in the browser, so "now" is the user's own clock and the local date
// parts below are the user's own zone — which is exactly the answer wanted.

import type { CalendarDate } from './time';

export type ShorthandCourse = { id: string; code: string };

export type Shorthand = {
  /** What is left after the date, time and course code are taken out. */
  title: string;
  courseId: string | null;
  /** The matched course's code, for showing what was understood. */
  courseCode: string | null;
  /** The local day it is due, or null when nothing dated was recognised. */
  dueDate: CalendarDate | null;
  /** 'HH:MM' local. Only meaningful when `dueDate` is set. */
  dueTime: string;
  /** False when the time is the end-of-day default rather than something typed. */
  timeWasTyped: boolean;
};

/** When a day is named but no time is: the end of that day. */
const END_OF_DAY = '23:59';

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Joining words that mean nothing once the date behind them has been read. */
const FILLER = new Set(['by', 'on', 'at', 'due', 'for', 'before', 'this']);

// ---------------------------------------------------------------------------
// Dates and times, as plain local calendar arithmetic
// ---------------------------------------------------------------------------

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar date of an instant, using the machine's own zone. */
function localDateOf(at: Date): CalendarDate {
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

function dateFromParts(year: number, month: number, day: number): CalendarDate {
  const made = new Date(year, month, day);
  return localDateOf(made);
}

/**
 * The next `weekday` on or after today. Typing "fri" on a Friday means today —
 * the deadline is tonight, not in a week's time.
 */
function nextWeekday(now: Date, weekday: number, aWeekLater: boolean): CalendarDate {
  const ahead = (weekday - now.getDay() + 7) % 7;
  return dateFromParts(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + ahead + (aWeekLater ? 7 : 0)
  );
}

/**
 * A day and a month with no year: the coming one. Typing "3 jan" in December
 * means next January, not the January that has already been and gone.
 */
function comingDate(now: Date, month: number, day: number): CalendarDate {
  const thisYear = dateFromParts(now.getFullYear(), month, day);
  if (thisYear >= localDateOf(now)) return thisYear;
  return dateFromParts(now.getFullYear() + 1, month, day);
}

type Chunk =
  | { kind: 'date'; date: CalendarDate }
  | { kind: 'time'; time: string }
  // "tonight" says both things at once.
  | { kind: 'both'; date: CalendarDate; time: string };

function matchTime(token: string): string | null {
  if (token === 'noon' || token === 'midday') return '12:00';
  if (token === 'midnight') return '00:00';

  // 5pm · 5.30pm · 5:30 pm · 17:00 · 0930
  const clock = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/.exec(token);
  if (!clock) return null;

  let hour = Number(clock[1]);
  const minute = clock[2] === undefined ? 0 : Number(clock[2]);
  const suffix = clock[3];

  if (minute > 59) return null;

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'pm' && hour !== 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return `${two(hour)}:${two(minute)}`;
  }

  // With no am/pm a bare number is only a time when it was written like one:
  // "17:00" is a time, "5" on its own is part of "chapter 5".
  if (clock[2] === undefined) return null;
  if (hour > 23) return null;
  return `${two(hour)}:${two(minute)}`;
}

function matchDay(token: string, now: Date): CalendarDate | null {
  if (token === 'today') return localDateOf(now);
  if (token === 'tomorrow' || token === 'tmr' || token === 'tmrw') {
    return dateFromParts(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  if (token in WEEKDAYS) return nextWeekday(now, WEEKDAYS[token], false);

  // 2026-08-28
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;

  // 28/8 · 28/08 · 28/08/2026 — day first, because that is how it is written here.
  const slashed = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]) - 1;
    if (day < 1 || day > 31 || month < 0 || month > 11) return null;
    if (slashed[3] === undefined) return comingDate(now, month, day);
    const year = Number(slashed[3]);
    return dateFromParts(year < 100 ? 2000 + year : year, month, day);
  }

  return null;
}

/** One or two tokens off the end of the input, read as a date or a time. */
function matchChunk(tokens: string[], now: Date): Chunk | null {
  if (tokens.length === 1) {
    const token = tokens[0];

    if (token === 'tonight') return { kind: 'both', date: localDateOf(now), time: '20:00' };

    const time = matchTime(token);
    if (time) return { kind: 'time', time };

    const date = matchDay(token, now);
    if (date) return { kind: 'date', date };

    return null;
  }

  if (tokens.length === 2) {
    const [first, second] = tokens;

    // "next friday" — the Friday of the week after this one.
    if (first === 'next' && second in WEEKDAYS) {
      return { kind: 'date', date: nextWeekday(now, WEEKDAYS[second], true) };
    }
    if (first === 'next' && second === 'week') {
      return {
        kind: 'date',
        date: dateFromParts(now.getFullYear(), now.getMonth(), now.getDate() + 7),
      };
    }

    // "28 aug" and "aug 28".
    const day = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(first);
    if (day && second in MONTHS) {
      return { kind: 'date', date: comingDate(now, MONTHS[second], Number(day[1])) };
    }
    const day2 = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(second);
    if (first in MONTHS && day2) {
      return { kind: 'date', date: comingDate(now, MONTHS[first], Number(day2[1])) };
    }

    // "5 pm", written with the space.
    const spaced = matchTime(`${first}${second}`);
    if (spaced) return { kind: 'time', time: spaced };
  }

  return null;
}

// ---------------------------------------------------------------------------

/**
 * Read a line of shorthand.
 *
 * Nothing is required: a line with no date words is a task with no deadline,
 * which is a perfectly good task.
 */
export function parseTaskShorthand(
  input: string,
  options: { now: Date; courses?: readonly ShorthandCourse[] }
): Shorthand {
  const { now } = options;
  const courses = options.courses ?? [];

  const words = input.trim().split(/\s+/).filter((word) => word !== '');
  const lowered = words.map((word) => word.toLowerCase().replace(/[,;]+$/, ''));

  let end = words.length;
  let date: CalendarDate | null = null;
  let time: string | null = null;

  // Read from the right: at most one date and one time, in either order, so
  // both "fri 5pm" and "5pm fri" work.
  for (let round = 0; round < 2 && end > 0; round += 1) {
    let matched = false;

    for (const width of [2, 1]) {
      // Never read the whole line as a date. "friday" typed on its own is a
      // task called "friday", not a nameless task due on Friday — an empty
      // title is never the more useful reading.
      if (end - width < 1) continue;
      const chunk = matchChunk(lowered.slice(end - width, end), now);
      if (!chunk) continue;

      if (chunk.kind === 'time' && time === null) {
        time = chunk.time;
      } else if (chunk.kind === 'date' && date === null) {
        date = chunk.date;
      } else if (chunk.kind === 'both' && date === null && time === null) {
        date = chunk.date;
        time = chunk.time;
      } else {
        continue;
      }

      end -= width;
      matched = true;
      break;
    }

    if (!matched) break;
  }

  // "essay due friday" -> "essay". Only when something dated was actually read,
  // and never down to an empty title.
  while ((date !== null || time !== null) && end > 1 && FILLER.has(lowered[end - 1])) {
    end -= 1;
  }

  // A course code anywhere in what is left: "ME301 problem set", "problem set me301".
  let courseId: string | null = null;
  let courseCode: string | null = null;
  const kept: string[] = [];

  for (let index = 0; index < end; index += 1) {
    const bare = lowered[index].replace(/[^a-z0-9]/g, '');
    const course: ShorthandCourse | undefined =
      courseId === null
        ? courses.find((candidate) => candidate.code.toLowerCase() === bare)
        : undefined;

    if (course && end > 1) {
      courseId = course.id;
      courseCode = course.code;
      continue;
    }
    kept.push(words[index]);
  }

  // A date with no time is due at the end of that day. A time with no date is
  // today if it has not passed yet, and tomorrow if it has.
  if (date === null && time !== null) {
    const [hour, minute] = time.split(':').map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
    date =
      at.getTime() > now.getTime()
        ? localDateOf(now)
        : dateFromParts(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  return {
    title: kept.join(' '),
    courseId,
    courseCode,
    dueDate: date,
    dueTime: time ?? END_OF_DAY,
    timeWasTyped: time !== null,
  };
}

/**
 * The instant a parsed deadline names, as an ISO string — or null when there
 * is no deadline. Local, because the shorthand was typed by a person sitting
 * in their own timezone.
 */
export function shorthandDueAt(parsed: Shorthand): string | null {
  if (parsed.dueDate === null) return null;
  const [year, month, day] = parsed.dueDate.split('-').map(Number);
  const [hour, minute] = parsed.dueTime.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}
