import { describe, expect, it } from 'vitest';

import {
  formatMinutes,
  minutesByCourse,
  minutesByUnit,
  sessionMinutes,
  totalMinutes,
  type StudySpan,
} from './study';

// The arithmetic behind docs/PRODUCT.md's payoff sentence:
//
//   "You've spent 3 hours on Unit 1 and 20 minutes on Unit 3."
//
// Nothing here touches a database. modules/study reads the rows; this adds
// them up, and this is the half that can be silently wrong.

const TZ = 'Asia/Dubai';

function span(
  courseId: string,
  unitId: string | null,
  startedAt: string,
  minutes: number
): StudySpan {
  return {
    courseId,
    unitId,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
  };
}

describe('one session', () => {
  it('is measured from its two instants', () => {
    expect(sessionMinutes(span('c1', 'u1', '2026-08-24T09:00:00.000Z', 25))).toBe(25);
  });

  it('rounds to the nearest minute', () => {
    expect(
      sessionMinutes({
        courseId: 'c1',
        unitId: null,
        startedAt: '2026-08-24T09:00:00.000Z',
        endedAt: '2026-08-24T09:24:40.000Z',
      })
    ).toBe(25);
  });
});

describe('minutes per course', () => {
  it('adds up every session, unit or no unit, most studied first', () => {
    const spans = [
      span('me301', 'u1', '2026-08-24T09:00:00.000Z', 25),
      span('me301', null, '2026-08-24T10:00:00.000Z', 25),
      span('cs210', 'u9', '2026-08-24T11:00:00.000Z', 25),
    ];

    expect(minutesByCourse(spans)).toEqual([
      { courseId: 'me301', minutes: 50 },
      { courseId: 'cs210', minutes: 25 },
    ]);
    expect(totalMinutes(spans)).toBe(75);
  });

  it('is empty when nothing has been studied', () => {
    expect(minutesByCourse([])).toEqual([]);
    expect(totalMinutes([])).toBe(0);
  });
});

describe('minutes per syllabus unit', () => {
  it('answers the sentence the product exists for', () => {
    const spans = [
      span('me301', 'unit-1', '2026-08-18T06:00:00.000Z', 60),
      span('me301', 'unit-1', '2026-08-19T06:00:00.000Z', 120),
      span('me301', 'unit-3', '2026-08-23T18:00:00.000Z', 20),
    ];

    const [first, second] = minutesByUnit(spans, TZ);

    expect(first.unitId).toBe('unit-1');
    expect(first.minutes).toBe(180);
    expect(second.unitId).toBe('unit-3');
    expect(second.minutes).toBe(20);
  });

  it('remembers the most recent session, not the last one in the list', () => {
    const spans = [
      span('me301', 'unit-1', '2026-08-22T06:00:00.000Z', 25),
      span('me301', 'unit-1', '2026-08-19T06:00:00.000Z', 25),
    ];

    const [unit] = minutesByUnit(spans, TZ);
    expect(unit.lastStudiedAt).toBe('2026-08-22T06:00:00.000Z');
    expect(unit.lastStudiedOn).toBe('2026-08-22');
  });

  it('reads the last-studied day in the given timezone, not UTC', () => {
    // 22:30 UTC is already the next morning in Dubai (+04:00).
    const spans = [span('me301', 'unit-1', '2026-08-22T22:30:00.000Z', 25)];

    expect(minutesByUnit(spans, TZ)[0].lastStudiedOn).toBe('2026-08-23');
    expect(minutesByUnit(spans, 'UTC')[0].lastStudiedOn).toBe('2026-08-22');
  });

  it('leaves out sessions that named no unit', () => {
    const spans = [
      span('me301', null, '2026-08-24T09:00:00.000Z', 25),
      span('me301', 'unit-1', '2026-08-24T10:00:00.000Z', 25),
    ];

    const byUnit = minutesByUnit(spans, TZ);
    expect(byUnit).toHaveLength(1);
    expect(byUnit[0].unitId).toBe('unit-1');
    // ...but the course total still counts both.
    expect(minutesByCourse(spans)[0].minutes).toBe(50);
  });
});

describe('durations in words', () => {
  it('reads the way a person says it', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(85)).toBe('1h 25m');
    expect(formatMinutes(200)).toBe('3h 20m');
  });
});
