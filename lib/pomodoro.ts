// The timer's arithmetic. No React, no storage, no clock of its own.
//
// prompts/07-focus.md, point 3: "Store the start time, not a countdown —
// compute remaining time from the clock. Do not rely on a `setInterval` staying
// alive." That is the whole reason this file exists. Every question the screen
// asks — how long is left, is it finished, how many minutes were actually
// focused — is answered from two instants and a total of paused milliseconds.
// A phone that sleeps for twenty minutes wakes up with the right answer,
// because nothing was ever counted down.
//
// It follows the same pattern as lib/today.ts and lib/calendar.ts: the parts of
// a screen that can be silently wrong are pure functions with a test around
// them, and the component is left with markup.

/** docs — a Pomodoro is 25 minutes of work and 5 of not-work. */
export const FOCUS_MINUTES = 25;
export const BREAK_MINUTES = 5;

export const MINUTE_MS = 60_000;
export const FOCUS_MS = FOCUS_MINUTES * MINUTE_MS;
export const BREAK_MS = BREAK_MINUTES * MINUTE_MS;

/**
 * Anything shorter than this is not a study session, it is a mis-tap. Stopping
 * early below it throws the block away rather than logging a minute of nothing.
 */
export const MIN_LOGGABLE_MS = MINUTE_MS;

export type TimerPhase = 'focus' | 'break';

/**
 * A timer, as it is stored. Instants and durations only — never a remaining
 * count, which would be a second source of truth that drifts every time the
 * tab is backgrounded.
 */
export type Timer = {
  phase: TimerPhase;
  /** Which course this block is against. Empty on a break. */
  courseId: string;
  /** The syllabus unit, when one was picked. This is the point of the slice. */
  unitId: string | null;
  /** Epoch ms when the block started. */
  startedAt: number;
  /** Epoch ms when it was paused, or null while it is running. */
  pausedAt: number | null;
  /** Total ms spent paused before the current run. */
  pausedMs: number;
};

/** How long one phase runs for. */
export function totalMsFor(phase: TimerPhase): number {
  return phase === 'focus' ? FOCUS_MS : BREAK_MS;
}

/**
 * Milliseconds actually spent in the block, paused time removed.
 *
 * A paused minute is not a studied minute. It is subtracted here, once, and
 * everything else — the countdown, completion, and what gets logged — reads
 * this number.
 */
export function elapsedMs(timer: Timer, now: number): number {
  const upTo = timer.pausedAt ?? now;
  return Math.max(0, upTo - timer.startedAt - timer.pausedMs);
}

/** Milliseconds left in the block, never below zero. */
export function remainingMs(timer: Timer, now: number): number {
  return Math.max(0, totalMsFor(timer.phase) - elapsedMs(timer, now));
}

/** Whether the block has run its full length. True after a phone was locked. */
export function isComplete(timer: Timer, now: number): boolean {
  return elapsedMs(timer, now) >= totalMsFor(timer.phase);
}

/** A fresh block, started now. */
export function start(
  phase: TimerPhase,
  now: number,
  what: { courseId: string; unitId: string | null }
): Timer {
  return {
    phase,
    courseId: what.courseId,
    unitId: what.unitId,
    startedAt: now,
    pausedAt: null,
    pausedMs: 0,
  };
}

/** Pausing records when, so the gap can be subtracted on resume. */
export function pause(timer: Timer, now: number): Timer {
  if (timer.pausedAt !== null) return timer;
  return { ...timer, pausedAt: now };
}

export function resume(timer: Timer, now: number): Timer {
  if (timer.pausedAt === null) return timer;
  return {
    ...timer,
    pausedAt: null,
    pausedMs: timer.pausedMs + Math.max(0, now - timer.pausedAt),
  };
}

export function isPaused(timer: Timer): boolean {
  return timer.pausedAt !== null;
}

/**
 * The instants to log for a finished focus block: the moment it started, and
 * the moment it would have ended had it never been paused.
 *
 * `ended_at - started_at` is therefore exactly the focused duration, which is
 * what every "how many minutes" query in modules/study computes. Using the
 * real wall-clock end instead would count a ten-minute coffee break as ten
 * minutes of thermodynamics.
 *
 * Returns null when too little was done to be worth a row.
 */
export function loggableSpan(
  timer: Timer,
  now: number
): { startedAt: string; endedAt: string; minutes: number } | null {
  if (timer.phase !== 'focus') return null;

  const focused = Math.min(elapsedMs(timer, now), FOCUS_MS);
  if (focused < MIN_LOGGABLE_MS) return null;

  return {
    startedAt: new Date(timer.startedAt).toISOString(),
    endedAt: new Date(timer.startedAt + focused).toISOString(),
    minutes: Math.round(focused / MINUTE_MS),
  };
}

/** '24:59'. Mono, tabular, and the only place the clock face is formatted. */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
