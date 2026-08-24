// Wall-clock time in a named timezone <-> UTC instants.
//
// `sessions.starts_at` is a time of day with no date and no zone ("09:00").
// `class_meetings.starts_at` is a timestamptz — an exact instant. Turning one
// into the other needs a timezone, so every function here takes one explicitly
// rather than trusting whatever TZ the process happens to run under. The dev
// machine is not the test runner is not Vercel.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A plain calendar date, 'YYYY-MM-DD'. No time, no zone. */
export type CalendarDate = string;

function assertDate(date: string): void {
  if (!ISO_DATE.test(date)) {
    throw new Error(`expected a date as YYYY-MM-DD, got "${date}"`);
  }
}

// How far ahead of UTC `timeZone` is at the given instant, in milliseconds.
function offsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const field: Record<string, string> = {};
  for (const part of parts) field[part.type] = part.value;

  const asIfUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    // Some ICU builds report midnight as hour 24.
    Number(field.hour) % 24,
    Number(field.minute),
    Number(field.second)
  );
  return asIfUtc - at.getTime();
}

/**
 * '2026-10-14' + '09:00:00' in 'Asia/Dubai' -> the UTC instant it names.
 * Times may be 'HH:MM' or 'HH:MM:SS'.
 */
export function zonedToUtc(date: CalendarDate, time: string, timeZone: string): Date {
  assertDate(date);
  const [h, m = '0', s = '0'] = time.split(':');
  const asIfUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number(h),
    Number(m),
    Math.trunc(Number(s))
  );
  // First pass guesses the offset at roughly the right instant; the second
  // corrects it when the guess landed on the other side of a DST change.
  const first = asIfUtc - offsetMs(timeZone, new Date(asIfUtc));
  const second = asIfUtc - offsetMs(timeZone, new Date(first));
  return new Date(second);
}

/** The calendar date an instant falls on, as seen in `timeZone`. */
export function localDateKey(at: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const field: Record<string, string> = {};
  for (const part of parts) field[part.type] = part.value;
  return `${field.year}-${field.month}-${field.day}`;
}

/** The wall-clock time an instant falls on in `timeZone`, as 'HH:MM'. */
export function localTimeLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/** 0=Sun .. 6=Sat for a calendar date. The date is already local, so no zone. */
export function weekdayOf(date: CalendarDate): number {
  assertDate(date);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** `date` moved by `days` days. */
export function shiftDate(date: CalendarDate, days: number): CalendarDate {
  assertDate(date);
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Every calendar date from `from` to `to`, inclusive. Empty if to < from. */
export function eachDate(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  assertDate(from);
  assertDate(to);
  const dates: CalendarDate[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) dates.push(d);
  return dates;
}

/**
 * The half-open instant range covering a local day: [start of `date`, start of
 * the next day). Half-open so a lecture at exactly midnight belongs to one day
 * only.
 */
export function dayRangeUtc(
  date: CalendarDate,
  timeZone: string
): { startsAt: string; endsAt: string } {
  return {
    startsAt: zonedToUtc(date, '00:00:00', timeZone).toISOString(),
    endsAt: zonedToUtc(shiftDate(date, 1), '00:00:00', timeZone).toISOString(),
  };
}

/** The half-open instant range covering the local days `from`..`to` inclusive. */
export function dateRangeUtc(
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string
): { startsAt: string; endsAt: string } {
  return {
    startsAt: dayRangeUtc(from, timeZone).startsAt,
    endsAt: dayRangeUtc(to, timeZone).endsAt,
  };
}

/** The timezone this machine is set to. The default for a single-user app. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Today's calendar date in `timeZone`. */
export function todayIn(timeZone: string): CalendarDate {
  return localDateKey(new Date(), timeZone);
}
