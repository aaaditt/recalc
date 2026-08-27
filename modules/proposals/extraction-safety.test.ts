import { describe, expect, it } from 'vitest';

import { parseExtraction, type EmailFacts } from '@/modules/recalc';

import { gateEmail, matchCourse, type CourseHint } from './gate';
import { fingerprintOf } from './schema';

// The three things that keep email extraction cheap and honest, none of which
// needs a database, a provider key or a mailbox:
//
//   1. the gate — most mail never reaches a model at all
//   2. the quote check — a proposal cannot cite words the email does not contain
//   3. the fingerprint — the same thing found twice is the same string twice,
//      which is what the unique index in migration 011 acts on
//
// `email-proposals.test.ts` proves all three against the real database. This
// file proves them in milliseconds, which is what makes them safe to change.

const COURSES: CourseHint[] = [
  { id: 'course-me301', code: 'ME301', name: 'Thermodynamics', instructor: 'Dr Ada Byron' },
  { id: 'course-cs210', code: 'CS210', name: 'Algorithms', instructor: null },
];

describe('the cheap gate', () => {
  it('lets through a lecturer announcing a deadline', () => {
    const verdict = gateEmail(
      {
        sender: 'Dr Ada Byron <ada.byron@eng.uni.ac.uk>',
        subject: 'ME301: problem sheet 3 due Friday',
        snippet: 'Please submit problem sheet 3 by 17:00 on Friday.',
      },
      COURSES
    );

    expect(verdict.plausible).toBe(true);
    expect(verdict.courseId).toBe('course-me301');
    expect(verdict.matchedOn).toBe('code');
  });

  it('recognises a subject code however it is spaced', () => {
    for (const subject of ['ME 301 lecture cancelled', 'me-301: no lecture tomorrow']) {
      const verdict = gateEmail(
        { sender: 'admin@eng.uni.ac.uk', subject, snippet: '' },
        COURSES
      );
      expect(verdict.courseId).toBe('course-me301');
      expect(verdict.plausible).toBe(true);
    }
  });

  it('stops a society newsletter dead, before any model is involved', () => {
    const verdict = gateEmail(
      {
        sender: 'RoboSoc <news@robosoc.example.org>',
        subject: 'RoboSoc newsletter — pizza night and free stickers',
        snippet: 'Join us on Thursday for pizza. Unsubscribe at any time.',
      },
      COURSES
    );

    expect(verdict.plausible).toBe(false);
    expect(verdict.courseId).toBeNull();
  });

  it('stops a course-shaped newsletter too', () => {
    // It names a course and it says "slides". It is still bulk mail, and the
    // bulk markers are weighted to win that argument.
    const verdict = gateEmail(
      {
        sender: 'Engineering Society <newsletter@robosoc.example.org>',
        subject: 'This week: ME301 revision social, slides from our talks',
        snippet: 'Sponsored by Acme. Unsubscribe at any time.',
      },
      COURSES
    );

    expect(verdict.plausible).toBe(false);
  });

  it('spends nothing on a course email that asks for nothing', () => {
    const verdict = gateEmail(
      {
        sender: 'Dr Ada Byron <ada.byron@eng.uni.ac.uk>',
        subject: 'ME301: welcome to the module',
        snippet: 'Looking forward to meeting you all in October.',
      },
      COURSES
    );

    expect(verdict.courseId).toBe('course-me301');
    // Matched a course, asks for nothing: not worth a call.
    expect(verdict.plausible).toBe(false);
  });

  it('says "not sure" rather than guessing a course', () => {
    expect(
      matchCourse(
        {
          sender: 'exams@uni.ac.uk',
          subject: 'Your timetable is available',
          snippet: 'The exam timetable is published.',
        },
        COURSES
      )
    ).toBeNull();
  });
});

describe('the quote check', () => {
  const email: EmailFacts = {
    sender: 'Dr Ada Byron <ada.byron@eng.uni.ac.uk>',
    subject: 'ME301: problem sheet 3 due Friday',
    snippet: 'Problem sheet 3 is due at 17:00 on Friday 6 March.',
    receivedAt: '2026-03-02T09:00:00.000Z',
  };

  it('keeps an item that quotes the email word for word', () => {
    const items = parseExtraction(
      JSON.stringify({
        items: [
          {
            kind: 'deadline',
            title: 'Problem sheet 3',
            dueAt: '2026-03-06T17:00:00.000Z',
            sourceText: 'Problem sheet 3 is due at 17:00 on Friday 6 March.',
          },
        ],
      }),
      email
    );

    expect(items).toHaveLength(1);
    expect(items[0].sourceText).toBe('Problem sheet 3 is due at 17:00 on Friday 6 March.');
  });

  it('drops an item whose evidence the email does not contain', () => {
    // The deadline may even be real. The quote is invented, and a proposal
    // whose evidence cannot be checked is worse than no proposal at all.
    const items = parseExtraction(
      JSON.stringify({
        items: [
          {
            kind: 'deadline',
            title: 'The final exam',
            dueAt: null,
            sourceText: 'The final exam is on the 20th of May in the sports hall.',
          },
        ],
      }),
      email
    );

    expect(items).toEqual([]);
  });

  it('reads an answer that arrived wrapped in a code fence, and refuses nonsense', () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        items: [
          { kind: 'material', title: 'Sheet 3', where: null, sourceText: 'problem sheet 3' },
        ],
      }) +
      '\n```';

    expect(parseExtraction(fenced, email)).toHaveLength(1);
    expect(parseExtraction('I am sorry, I cannot help with that.', email)).toEqual([]);
    expect(parseExtraction('{"items":"lots"}', email)).toEqual([]);
  });
});

describe('the fingerprint', () => {
  it('is the same for the same deadline written twice', () => {
    expect(
      fingerprintOf({
        kind: 'deadline',
        title: 'Problem  sheet 3',
        dueAt: '2026-03-06T17:00:00.000Z',
        sourceText: 'a',
      })
    ).toBe(
      fingerprintOf({
        kind: 'deadline',
        title: 'problem sheet 3',
        // The same day, a different minute — one deadline, not two.
        dueAt: '2026-03-06T23:59:00.000Z',
        sourceText: 'b',
      })
    );
  });

  it('is different for two genuinely different things', () => {
    const sheet = fingerprintOf({
      kind: 'deadline',
      title: 'Problem sheet 3',
      dueAt: null,
      sourceText: 'a',
    });
    const essay = fingerprintOf({
      kind: 'deadline',
      title: 'Essay 1',
      dueAt: null,
      sourceText: 'a',
    });
    const material = fingerprintOf({
      kind: 'material',
      title: 'Problem sheet 3',
      where: null,
      sourceText: 'a',
    });

    expect(new Set([sheet, essay, material]).size).toBe(3);
  });
});
