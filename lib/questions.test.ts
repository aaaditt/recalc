import { describe, expect, it } from 'vitest';

import {
  isUnresolvedStatus,
  nearestExamTask,
  questionsByUnit,
  revisionSentence,
  unfiledCount,
} from './questions';

// The payoff sentence, tested without a database.
//
// docs/PRODUCT.md: "That sentence is the product." The two ways it can be wrong
// are counting the wrong things and sounding confident about things that are
// not in the database, so both have a describe block below named for them.

const UNITS = [
  { id: 'u1', title: 'Unit 1', position: 1 },
  { id: 'u2', title: 'Unit 2', position: 2 },
  { id: 'u3', title: 'Unit 3', position: 3 },
];

const question = (unitId: string | null, status: string, courseId = 'c1') => ({
  unitId,
  courseId,
  status,
});

describe('what counts as unresolved', () => {
  it('counts open and answered, never resolved', () => {
    expect(isUnresolvedStatus('open')).toBe(true);
    // The whole point of the third status: an answered question I have not
    // marked resolved is still an open loop.
    expect(isUnresolvedStatus('answered')).toBe(true);
    expect(isUnresolvedStatus('resolved')).toBe(false);
  });
});

describe('questionsByUnit', () => {
  it('counts unresolved questions per unit and keeps the empty units', () => {
    const rolled = questionsByUnit(
      UNITS,
      [
        question('u3', 'open'),
        question('u3', 'answered'),
        question('u3', 'resolved'),
        question('u1', 'resolved'),
        question(null, 'open'),
      ],
      [{ unitId: 'u1', minutes: 180 }]
    );

    expect(rolled.map((unit) => unit.unitId)).toEqual(['u1', 'u2', 'u3']);
    expect(rolled[0]).toMatchObject({ unresolved: 0, unanswered: 0, minutes: 180 });
    expect(rolled[1]).toMatchObject({ unresolved: 0, minutes: 0 });
    expect(rolled[2]).toMatchObject({ unresolved: 2, unanswered: 1, minutes: 0 });
  });

  it('returns units in syllabus order, not in the order given', () => {
    const rolled = questionsByUnit([UNITS[2], UNITS[0], UNITS[1]], [], []);
    expect(rolled.map((unit) => unit.title)).toEqual(['Unit 1', 'Unit 2', 'Unit 3']);
  });
});

describe('unfiledCount', () => {
  it('counts only this course’s unresolved questions with no unit', () => {
    const questions = [
      question(null, 'open'),
      question(null, 'answered'),
      question(null, 'resolved'),
      question(null, 'open', 'other-course'),
      question('u1', 'open'),
    ];
    expect(unfiledCount(questions, 'c1')).toBe(2);
  });
});

describe('the sentence', () => {
  it('is the one docs/PRODUCT.md asks for', () => {
    const rolled = questionsByUnit(
      UNITS.slice(0, 3),
      [
        ...Array.from({ length: 6 }, () => question('u3', 'open')),
        question('u1', 'resolved'),
      ],
      [
        { unitId: 'u1', minutes: 180 },
        { unitId: 'u3', minutes: 20 },
      ]
    );

    expect(revisionSentence(rolled)).toBe(
      '6 unresolved questions on Unit 3, none on Unit 1. ' +
        'You have spent 3h on Unit 1 and 20m on Unit 3.'
    );
  });

  it('says "no time at all" rather than 0m', () => {
    const rolled = questionsByUnit(
      UNITS.slice(0, 2),
      [question('u2', 'answered')],
      [{ unitId: 'u1', minutes: 45 }]
    );

    expect(revisionSentence(rolled)).toBe(
      '1 unresolved question on Unit 2, none on Unit 1. ' +
        'You have spent 45m on Unit 1 and no time at all on Unit 2.'
    );
  });

  it('breaks a tie towards the unit with fewer minutes on it', () => {
    const rolled = questionsByUnit(
      UNITS.slice(0, 2),
      [question('u1', 'open'), question('u2', 'open')],
      [
        { unitId: 'u1', minutes: 200 },
        { unitId: 'u2', minutes: 10 },
      ]
    );

    expect(revisionSentence(rolled)).toMatch(/^1 unresolved question on Unit 2, 1 on Unit 1\./);
  });

  it('has no contrast to draw on a one-unit course', () => {
    const rolled = questionsByUnit(
      [UNITS[0]],
      [question('u1', 'open')],
      [{ unitId: 'u1', minutes: 30 }]
    );

    expect(revisionSentence(rolled)).toBe(
      '1 unresolved question on Unit 1. You have spent 30m on it.'
    );
  });

  it('mentions questions that are not filed under a unit rather than losing them', () => {
    const rolled = questionsByUnit(UNITS.slice(0, 2), [question('u2', 'open')], []);

    expect(revisionSentence(rolled, { unfiled: 3 })).toMatch(
      /3 more are not filed under a unit\.$/
    );
  });

  it('names no unit when every unresolved question is unfiled', () => {
    const rolled = questionsByUnit(UNITS.slice(0, 2), [], [{ unitId: 'u1', minutes: 60 }]);

    expect(revisionSentence(rolled, { unfiled: 2 })).toBe(
      '2 unresolved questions, none of them filed under a unit. ' +
        'You have logged 1h against this course’s units.'
    );
  });

  it('says so plainly when there is nothing unresolved', () => {
    const rolled = questionsByUnit(UNITS.slice(0, 2), [question('u1', 'resolved')], [
      { unitId: 'u1', minutes: 125 },
    ]);

    expect(revisionSentence(rolled)).toBe(
      'Nothing unresolved on this course. You have logged 2h 5m against its units.'
    );
  });
});

describe('what it refuses to invent', () => {
  it('says nothing at all about a course with no units', () => {
    expect(revisionSentence([])).toBeNull();
  });

  it('says nothing about a course with units but no questions and no minutes', () => {
    expect(revisionSentence(questionsByUnit(UNITS, [], []))).toBeNull();
  });

  it('never mentions an exam unless one of my own tasks is one', () => {
    const rolled = questionsByUnit(UNITS.slice(0, 2), [question('u2', 'open')], []);
    const sentence = revisionSentence(rolled, { exam: null });
    expect(sentence).not.toMatch(/exam/i);
    expect(sentence).not.toMatch(/days/);
  });
});

describe('the exam clause', () => {
  const options = { courseId: 'c1', today: '2026-08-27', timeZone: 'UTC' };

  const task = (title: string, due: string | null, extra: Partial<{ status: string; course_id: string }> = {}) => ({
    title,
    due_at: due,
    status: extra.status ?? 'open',
    course_id: extra.course_id ?? 'c1',
  });

  it('finds the soonest exam-shaped task on this course', () => {
    const found = nearestExamTask(
      [
        task('Final exam', '2026-09-05T09:00:00.000Z'),
        task('Midterm', '2026-11-01T09:00:00.000Z'),
        task('Read chapter 5', '2026-08-28T09:00:00.000Z'),
      ],
      options
    );

    expect(found).toEqual({ title: 'Final exam', days: 9 });
  });

  it('ignores exams on other courses, done ones, and ones already past', () => {
    expect(
      nearestExamTask(
        [
          task('Final exam', '2026-09-05T09:00:00.000Z', { course_id: 'c2' }),
          task('Quiz 1', '2026-09-01T09:00:00.000Z', { status: 'done' }),
          task('Midterm', '2026-08-01T09:00:00.000Z'),
          task('Exam', null),
        ],
        options
      )
    ).toBeNull();
  });

  it('is null when nothing on the course looks like an exam', () => {
    expect(
      nearestExamTask([task('Write up the lab report', '2026-09-05T09:00:00.000Z')], options)
    ).toBeNull();
  });

  it('reads today and tomorrow as words, not as a number of days', () => {
    const today = nearestExamTask([task('Exam', '2026-08-27T20:00:00.000Z')], options);
    expect(today).toEqual({ title: 'Exam', days: 0 });

    const rolled = questionsByUnit(UNITS.slice(0, 1), [question('u1', 'open')], []);
    expect(revisionSentence(rolled, { exam: today })).toMatch(
      /Your task “Exam” is due today\.$/
    );
    expect(
      revisionSentence(rolled, { exam: { title: 'Exam', days: 1 } })
    ).toMatch(/is due tomorrow\.$/);
    expect(
      revisionSentence(rolled, { exam: { title: 'Final exam', days: 9 } })
    ).toMatch(/Your task “Final exam” is due in 9 days\.$/);
  });
});
