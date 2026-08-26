import { describe, it, expect } from 'vitest';

import {
  courseProgress,
  isCovered,
  nextUnitStatus,
  progressLabel,
  rollUpUnits,
  unitStatusLabel,
  UNIT_STATUSES,
  type UnitFacts,
} from '@/lib/syllabus';

// The arithmetic on the course page, without a database. What can be silently
// wrong here is what progress *claims*: a number that counts the wrong things
// is worse than no number, because it is believed.

const units: UnitFacts[] = [
  { id: 'u3', title: 'Cycles', position: 3, status: 'not_started' },
  { id: 'u1', title: 'Entropy', position: 1, status: 'mastered' },
  { id: 'u2', title: 'Enthalpy', position: 2, status: 'shaky' },
];

const empty = { study: [], notes: [], tasks: [] };

describe('status', () => {
  it('cycles through all four and comes back round', () => {
    expect(nextUnitStatus('not_started')).toBe('shaky');
    expect(nextUnitStatus('shaky')).toBe('comfortable');
    expect(nextUnitStatus('comfortable')).toBe('mastered');
    expect(nextUnitStatus('mastered')).toBe('not_started');
  });

  it('every status is reachable from every other by tapping', () => {
    // Four taps from anywhere returns you to where you started, which is what
    // makes a cycle a usable one-tap control rather than a trap.
    for (const { value } of UNIT_STATUSES) {
      let at = value;
      const visited = new Set<string>();
      for (let i = 0; i < UNIT_STATUSES.length; i += 1) {
        visited.add(at);
        at = nextUnitStatus(at);
      }
      expect(visited.size).toBe(UNIT_STATUSES.length);
      expect(at).toBe(value);
    }
  });

  it('counts comfortable and mastered as covered, and nothing else', () => {
    expect(isCovered('not_started')).toBe(false);
    expect(isCovered('shaky')).toBe(false);
    expect(isCovered('comfortable')).toBe(true);
    expect(isCovered('mastered')).toBe(true);
  });

  it('has a label for every status', () => {
    for (const { value, label } of UNIT_STATUSES) {
      expect(unitStatusLabel(value)).toBe(label);
    }
  });
});

describe('rollUpUnits', () => {
  it('puts the units in syllabus order whatever order they arrive in', () => {
    expect(rollUpUnits(units, empty).map((unit) => unit.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('a unit with nothing on it is untouched', () => {
    const rolled = rollUpUnits(units, empty);
    // u1 is mastered, so it has been opened even with no minutes on it.
    expect(rolled[0].untouched).toBe(false);
    expect(rolled[1].untouched).toBe(false);
    expect(rolled[2].untouched).toBe(true);
  });

  it('carries minutes, the last-studied day, notes and open tasks', () => {
    const rolled = rollUpUnits(units, {
      study: [{ unitId: 'u3', minutes: 50, lastStudiedOn: '2026-08-24' }],
      notes: [{ unitId: 'u3' }, { unitId: 'u3' }, { unitId: null }],
      tasks: [
        { unitId: 'u3', status: 'open' },
        { unitId: 'u3', status: 'doing' },
        { unitId: 'u3', status: 'done' },
        { unitId: null, status: 'open' },
      ],
    });

    const cycles = rolled[2];
    expect(cycles.id).toBe('u3');
    expect(cycles.minutes).toBe(50);
    expect(cycles.lastStudiedOn).toBe('2026-08-24');
    expect(cycles.notes).toBe(2);
    expect(cycles.tasks).toBe(3);
    expect(cycles.openTasks).toBe(2);
    // Fifty minutes and three tasks is not "never opened", whatever the status.
    expect(cycles.untouched).toBe(false);
  });

  it('never counts a note or task that names no unit against a unit', () => {
    const rolled = rollUpUnits(units, {
      study: [],
      notes: [{ unitId: null }, { unitId: null }],
      tasks: [{ unitId: null, status: 'open' }],
    });
    expect(rolled.every((unit) => unit.notes === 0 && unit.tasks === 0)).toBe(true);
  });

  it('ignores activity for a unit that is not on this course', () => {
    const rolled = rollUpUnits(units, {
      study: [{ unitId: 'somewhere-else', minutes: 999, lastStudiedOn: '2026-08-24' }],
      notes: [{ unitId: 'somewhere-else' }],
      tasks: [{ unitId: 'somewhere-else', status: 'open' }],
    });
    expect(rolled.reduce((sum, unit) => sum + unit.minutes, 0)).toBe(0);
  });
});

describe('courseProgress', () => {
  it('counts only what I marked myself', () => {
    const progress = courseProgress(
      rollUpUnits(units, {
        // Three hours on a unit still marked not_started counts for nothing:
        // minutes are not comprehension.
        study: [{ unitId: 'u3', minutes: 180, lastStudiedOn: '2026-08-24' }],
        notes: [],
        tasks: [],
      })
    );

    expect(progress.total).toBe(3);
    expect(progress.covered).toBe(1);
    expect(progress.untouched).toBe(0);
    expect(progress.minutes).toBe(180);
  });

  it('says what it measures, and never a percentage', () => {
    const rolled = rollUpUnits(units, empty);
    expect(progressLabel(courseProgress(rolled))).toBe(
      '1 of 3 comfortable or better · 1 never opened'
    );
    expect(progressLabel(courseProgress(rolled))).not.toMatch(/%/);
  });

  it('drops the never-opened half once everything has been opened', () => {
    const rolled = rollUpUnits(units, {
      study: [{ unitId: 'u3', minutes: 10, lastStudiedOn: '2026-08-24' }],
      notes: [],
      tasks: [],
    });
    expect(progressLabel(courseProgress(rolled))).toBe('1 of 3 comfortable or better');
  });

  it('a course with no syllabus yet says so', () => {
    expect(progressLabel(courseProgress([]))).toBe('No units yet');
  });
});
