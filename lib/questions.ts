// The sentence docs/PRODUCT.md is built around, and the counting behind it.
//
//   "6 questions on Unit 3 you never resolved, zero on Unit 1. You've spent
//    3 hours on Unit 1 and 20 minutes on Unit 3. Exam in 9 days."
//
// Kept out of the course page for the reason every other lib file here is:
// this is the part that can be silently, confidently wrong, and a Server
// Component that reads Supabase cannot be unit-tested. Same shape as
// lib/today.ts, lib/calendar.ts, lib/tasks.ts, lib/study.ts and lib/syllabus.ts.
//
// Two rules govern every line below, both from prompts/12-questions.md:
//
//   * only counts and minutes that are genuinely in the database. No
//     confidence score, no "readiness", no percentage of anything.
//   * never sound confident about data that does not exist. A unit with no
//     minutes logged says "no time at all", not "0h", and never "you are
//     behind".

import { formatMinutes } from './study';
import { localDateKey, type CalendarDate } from './time';

// ---------------------------------------------------------------------------
// Counting questions per unit
// ---------------------------------------------------------------------------

/** A question, narrowed to the two things the counting needs. */
export type QuestionLike = {
  unitId: string | null;
  courseId: string | null;
  status: string;
};

/** Open, or answered and not yet resolved. Both are still open loops. */
export function isUnresolvedStatus(status: string): boolean {
  return status === 'open' || status === 'answered';
}

export type UnitQuestions = {
  unitId: string;
  title: string;
  /** open + answered-but-not-resolved. */
  unresolved: number;
  /** Of those, the ones that have never had an answer generated. */
  unanswered: number;
  minutes: number;
};

/**
 * Unresolved questions and minutes, per syllabus unit, in syllabus order.
 *
 * Units with nothing on them are kept: "zero on Unit 1" is half of the
 * sentence, and a unit that disappears from the list cannot be the contrast.
 */
export function questionsByUnit(
  units: readonly { id: string; title: string; position: number }[],
  questions: readonly QuestionLike[],
  study: readonly { unitId: string; minutes: number }[]
): UnitQuestions[] {
  const minutes = new Map(study.map((entry) => [entry.unitId, entry.minutes]));
  const counts = new Map<string, { unresolved: number; unanswered: number }>();

  for (const question of questions) {
    if (question.unitId === null) continue;
    if (!isUnresolvedStatus(question.status)) continue;

    const found = counts.get(question.unitId) ?? { unresolved: 0, unanswered: 0 };
    found.unresolved += 1;
    if (question.status === 'open') found.unanswered += 1;
    counts.set(question.unitId, found);
  }

  return [...units]
    .sort((a, b) => a.position - b.position)
    .map((unit) => {
      const found = counts.get(unit.id) ?? { unresolved: 0, unanswered: 0 };
      return {
        unitId: unit.id,
        title: unit.title,
        unresolved: found.unresolved,
        unanswered: found.unanswered,
        minutes: minutes.get(unit.id) ?? 0,
      };
    });
}

/**
 * Unresolved questions on this course that are not filed under any unit.
 *
 * They exist — a question asked in a note with no topic picked has nowhere to
 * go — and leaving them out silently would make the counts add up to less than
 * the list on screen.
 */
export function unfiledCount(
  questions: readonly QuestionLike[],
  courseId: string
): number {
  return questions.filter(
    (question) =>
      question.courseId === courseId &&
      question.unitId === null &&
      isUnresolvedStatus(question.status)
  ).length;
}

// ---------------------------------------------------------------------------
// The exam clause
//
// There is no `exam_date` column anywhere in this schema, and inventing one is
// out of scope for a sentence. What there IS, is my own task list: if I typed
// "Final exam" with a due date against this course, that date is real and I put
// it there. Nothing else is ever treated as an exam.
// ---------------------------------------------------------------------------

/** Words that make a task an exam. Deliberately short, and deliberately mine. */
const EXAM_WORDS = /\b(exams?|finals?|midterms?|mid-terms?|tests?|quiz(?:zes)?|vivas?)\b/i;

export type ExamTaskLike = {
  title: string;
  due_at: string | null;
  status: string;
  course_id: string | null;
};

export type ExamClause = { title: string; days: number };

/** Whole days from one local calendar day to another. Never negative. */
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * The soonest exam-shaped task on this course that is still open and still
 * ahead, or null.
 *
 * Null is the common case and it is fine: the sentence simply does not mention
 * an exam. Guessing one would be exactly the kind of confident wrongness this
 * whole product exists to refuse.
 */
export function nearestExamTask(
  tasks: readonly ExamTaskLike[],
  options: { courseId: string; today: CalendarDate; timeZone: string }
): ExamClause | null {
  const { courseId, today, timeZone } = options;

  const upcoming = tasks
    .filter(
      (task) =>
        task.course_id === courseId &&
        (task.status === 'open' || task.status === 'doing') &&
        task.due_at !== null &&
        EXAM_WORDS.test(task.title)
    )
    .map((task) => ({
      title: task.title.trim(),
      date: localDateKey(new Date(task.due_at as string), timeZone),
    }))
    .filter((task) => task.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const soonest = upcoming[0];
  return soonest ? { title: soonest.title, days: daysBetween(today, soonest.date) } : null;
}

// ---------------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------------

/** '3h', '20m', or the honest absence of any. */
function spent(minutes: number): string {
  return minutes > 0 ? formatMinutes(minutes) : 'no time at all';
}

function questionCount(n: number): string {
  if (n === 0) return 'none';
  return n === 1 ? '1 unresolved question' : `${n} unresolved questions`;
}

/** The second half of the comparison, where the noun has already been said. */
function alsoCount(n: number): string {
  return n === 0 ? 'none' : String(n);
}

/**
 * Named as the task it is, in my own words, so it can never read as a date the
 * app knows and I do not.
 */
function examSentence(exam: ExamClause): string {
  const when =
    exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${exam.days} days`;
  return `Your task “${exam.title}” is due ${when}.`;
}

/**
 * The weakest unit against the one you have actually spent time on, in words.
 *
 * Returns null when there is genuinely nothing to say — no units, or no
 * questions and no minutes anywhere. A sentence that appears on a course with
 * no data would only be decoration.
 */
export function revisionSentence(
  units: readonly UnitQuestions[],
  options: { unfiled?: number; exam?: ExamClause | null } = {}
): string | null {
  const unfiled = options.unfiled ?? 0;
  const exam = options.exam ?? null;

  const totalUnresolved = units.reduce((sum, unit) => sum + unit.unresolved, 0) + unfiled;
  const totalMinutes = units.reduce((sum, unit) => sum + unit.minutes, 0);

  if (units.length === 0) return null;
  if (totalUnresolved === 0 && totalMinutes === 0) return null;

  const sentences: string[] = [];

  if (totalUnresolved === 0) {
    sentences.push('Nothing unresolved on this course.');
    sentences.push(`You have logged ${formatMinutes(totalMinutes)} against its units.`);
    if (exam) sentences.push(examSentence(exam));
    return sentences.join(' ');
  }

  // The unit that is asking the most of me. Ties go to the one I have spent
  // least time on, then to whichever comes first in the syllabus.
  const worst = [...units].sort(
    (a, b) => b.unresolved - a.unresolved || a.minutes - b.minutes
  )[0];

  // ...and the one to hold it against: fewest unresolved questions, most
  // minutes. "Zero on Unit 1, and you have spent three hours there" is the half
  // of the sentence that makes the other half mean something.
  const contrast = [...units]
    .filter((unit) => unit.unitId !== worst.unitId)
    .sort((a, b) => a.unresolved - b.unresolved || b.minutes - a.minutes)[0];

  if (worst.unresolved === 0) {
    // Every unresolved question on this course is unfiled: there is no worst
    // unit to name, and pretending otherwise would name the wrong one.
    sentences.push(
      unfiled === 1
        ? '1 unresolved question, not filed under any unit.'
        : `${unfiled} unresolved questions, none of them filed under a unit.`
    );
    if (totalMinutes > 0) {
      sentences.push(`You have logged ${formatMinutes(totalMinutes)} against this course’s units.`);
    }
    if (exam) sentences.push(examSentence(exam));
    return sentences.join(' ');
  }

  if (contrast) {
    sentences.push(
      `${questionCount(worst.unresolved)} on ${worst.title}, ${alsoCount(contrast.unresolved)} on ${contrast.title}.`
    );
    sentences.push(
      `You have spent ${spent(contrast.minutes)} on ${contrast.title} and ${spent(worst.minutes)} on ${worst.title}.`
    );
  } else {
    sentences.push(`${questionCount(worst.unresolved)} on ${worst.title}.`);
    sentences.push(`You have spent ${spent(worst.minutes)} on it.`);
  }

  if (unfiled > 0) {
    sentences.push(
      unfiled === 1
        ? '1 more is not filed under a unit.'
        : `${unfiled} more are not filed under a unit.`
    );
  }

  if (exam) sentences.push(examSentence(exam));

  return sentences.join(' ');
}
