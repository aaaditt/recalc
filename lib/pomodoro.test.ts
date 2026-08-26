import { describe, expect, it } from 'vitest';

import {
  BREAK_MS,
  FOCUS_MS,
  MINUTE_MS,
  elapsedMs,
  formatRemaining,
  isComplete,
  isPaused,
  loggableSpan,
  pause,
  remainingMs,
  resume,
  start,
} from './pomodoro';

// prompts/07-focus.md, point 3:
//
//   "Survives a refresh and a locked phone. Store the start time, not a
//    countdown — compute remaining time from the clock. Do not rely on a
//    `setInterval` staying alive."
//
// Everything below is that sentence, tested. No timers are started here on
// purpose: `now` is passed in, so a phone asleep for twenty minutes is just a
// larger number.

const WHAT = { courseId: 'course-1', unitId: 'unit-3' };
const T0 = Date.parse('2026-08-24T09:00:00.000Z');

describe('the clock decides, not a countdown', () => {
  it('counts down from the start time', () => {
    const timer = start('focus', T0, WHAT);

    expect(remainingMs(timer, T0)).toBe(FOCUS_MS);
    expect(remainingMs(timer, T0 + 10 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    expect(isComplete(timer, T0 + 10 * MINUTE_MS)).toBe(false);
  });

  it('comes back from a locked phone already finished', () => {
    const timer = start('focus', T0, WHAT);

    // The tab was frozen the whole time and no interval ever ran.
    const wokeUp = T0 + 40 * MINUTE_MS;

    expect(isComplete(timer, wokeUp)).toBe(true);
    expect(remainingMs(timer, wokeUp)).toBe(0);
  });

  it('never reports a negative remaining time', () => {
    const timer = start('focus', T0, WHAT);
    expect(remainingMs(timer, T0 + 5 * 60 * MINUTE_MS)).toBe(0);
  });

  it('gives a break its own five minutes', () => {
    const timer = start('break', T0, { courseId: '', unitId: null });

    expect(remainingMs(timer, T0)).toBe(BREAK_MS);
    expect(isComplete(timer, T0 + 5 * MINUTE_MS)).toBe(true);
  });
});

describe('pausing', () => {
  it('freezes the countdown while paused', () => {
    let timer = start('focus', T0, WHAT);
    timer = pause(timer, T0 + 5 * MINUTE_MS);

    expect(isPaused(timer)).toBe(true);
    // Ten minutes of staring at a paused timer changes nothing.
    expect(remainingMs(timer, T0 + 15 * MINUTE_MS)).toBe(20 * MINUTE_MS);
  });

  it('subtracts the pause once the block resumes', () => {
    let timer = start('focus', T0, WHAT);
    timer = pause(timer, T0 + 5 * MINUTE_MS);
    timer = resume(timer, T0 + 15 * MINUTE_MS);

    expect(isPaused(timer)).toBe(false);
    // Five minutes were done, ten were paused: twenty are still to go.
    expect(remainingMs(timer, T0 + 15 * MINUTE_MS)).toBe(20 * MINUTE_MS);
    expect(elapsedMs(timer, T0 + 20 * MINUTE_MS)).toBe(10 * MINUTE_MS);
  });

  it('ignores a second pause and a resume that never paused', () => {
    const timer = start('focus', T0, WHAT);
    expect(resume(timer, T0 + MINUTE_MS)).toBe(timer);

    const paused = pause(timer, T0 + MINUTE_MS);
    expect(pause(paused, T0 + 3 * MINUTE_MS)).toBe(paused);
  });
});

describe('what gets logged', () => {
  it('logs exactly the focused duration, not the wall-clock span', () => {
    let timer = start('focus', T0, WHAT);
    timer = pause(timer, T0 + 10 * MINUTE_MS);
    timer = resume(timer, T0 + 40 * MINUTE_MS); // half an hour of coffee

    const finished = T0 + 55 * MINUTE_MS; // 25 focused, 30 paused
    const span = loggableSpan(timer, finished);

    expect(span).not.toBeNull();
    expect(span?.minutes).toBe(25);
    // The row's own span is the focused time, so every sum over it is honest.
    expect(new Date(span!.endedAt).getTime() - new Date(span!.startedAt).getTime()).toBe(
      FOCUS_MS
    );
  });

  it('caps at 25 minutes however long the phone was asleep', () => {
    const timer = start('focus', T0, WHAT);
    const span = loggableSpan(timer, T0 + 3 * 60 * MINUTE_MS);

    expect(span?.minutes).toBe(25);
  });

  it('logs a block stopped early for what it was worth', () => {
    const timer = start('focus', T0, WHAT);
    const span = loggableSpan(timer, T0 + 18 * MINUTE_MS);

    expect(span?.minutes).toBe(18);
  });

  it('refuses to log a mis-tap', () => {
    const timer = start('focus', T0, WHAT);
    expect(loggableSpan(timer, T0 + 20_000)).toBeNull();
  });

  it('never logs a break', () => {
    const timer = start('break', T0, { courseId: '', unitId: null });
    expect(loggableSpan(timer, T0 + BREAK_MS)).toBeNull();
  });

  it('keeps the unit that was picked before the block started', () => {
    const timer = start('focus', T0, WHAT);
    expect(timer.unitId).toBe('unit-3');
    expect(timer.courseId).toBe('course-1');
  });
});

describe('the clock face', () => {
  it('is always mm:ss', () => {
    expect(formatRemaining(FOCUS_MS)).toBe('25:00');
    expect(formatRemaining(9 * MINUTE_MS + 5_000)).toBe('09:05');
    expect(formatRemaining(0)).toBe('00:00');
    expect(formatRemaining(-1)).toBe('00:00');
  });

  it('rounds up, so a running timer never shows 00:00 early', () => {
    expect(formatRemaining(1)).toBe('00:01');
    expect(formatRemaining(1_500)).toBe('00:02');
  });
});
