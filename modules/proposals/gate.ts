import { flatten } from './schema';

// The cheap gate.
//
// prompts/15-email-extraction.md, point 3: "Before spending a `deep` call, use
// the `fast` model (or plain heuristics — sender domain, keywords) to decide
// whether this email is even plausibly course-related. Most mail is not.
// Skipping this makes every sync expensive and slow."
//
// This is the heuristics half of that choice, and it is deliberate. A `fast`
// model call is still a network round trip, still a key the user may not have
// pasted yet, and still something no test can exercise without one. Everything
// below is a pure function of a sender, a subject, a snippet and the user's own
// list of courses — so it costs nothing, runs offline, and is tested directly.
//
// It is allowed to be wrong in one direction only. A false negative is one
// email that never becomes a proposal; a false positive is a wasted `deep`
// call. Neither can put anything in the task list, because nothing but a human
// tap ever does.

/** A course, as the gate needs to recognise it. */
export type CourseHint = {
  id: string;
  code: string;
  name: string;
  instructor: string | null;
};

export type GateInput = {
  sender: string;
  subject: string;
  snippet: string;
};

export type GateVerdict = {
  /** Is it worth a `deep` call? */
  plausible: boolean;
  /**
   * The score, squashed to 0..1. It is a heuristic and it is stored on the
   * proposal because docs/SCHEMA.md has a column for it — no screen renders it
   * as a percentage, because a number that looks precise and is not is worse
   * than no number.
   */
  confidence: number;
  /** Why, in words. Shown on /inbox so the gate is never a black box. */
  reasons: string[];
  /** The course this looks like, or null for "not sure" — which means ASK. */
  courseId: string | null;
  matchedOn: 'code' | 'name' | 'instructor' | null;
};

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

/** Something is due. The single strongest signal that mail matters. */
const DEADLINE_WORDS = [
  'deadline',
  'due',
  'submit',
  'submission',
  'hand in',
  'assignment',
  'coursework',
  'homework',
  'problem set',
  'problem sheet',
  'lab report',
  'quiz',
  'exam',
  'viva',
  'presentation',
];

/** A class is not where the timetable says it is. */
const CHANGE_WORDS = [
  'cancelled',
  'canceled',
  'rescheduled',
  'postponed',
  'room change',
  'venue',
  'moved to',
  'will not take place',
  'no class',
  'no lecture',
  'relocated',
];

/** Something to read or download. */
const MATERIAL_WORDS = [
  'slides',
  'lecture notes',
  'handout',
  'reading',
  'chapter',
  'uploaded',
  'attached',
  'past paper',
  'tutorial sheet',
  'recording',
];

/** Bulk mail says so about itself, and it says so in these words. */
const BULK_WORDS = [
  'unsubscribe',
  'view this email in your browser',
  'newsletter',
  'you are receiving this',
  'manage your preferences',
  'sponsored',
  'webinar',
  'limited time',
  'discount',
  'book your place now',
];

/** A machine sent it. Weak on its own — a university LMS is a machine too. */
const MACHINE_SENDERS = ['noreply', 'no-reply', 'donotreply', 'mailer@', 'marketing@', 'news@'];

const ACADEMIC_DOMAINS = ['.edu', '.ac.', '.edu.', 'university', 'uni.'];

function hits(haystack: string, words: string[]): string | null {
  for (const word of words) {
    if (haystack.includes(word)) return word;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Course matching
// ---------------------------------------------------------------------------

/**
 * "ME301", "ME 301", "me-301" — one subject code, written the four ways a
 * lecturer actually writes it.
 */
function codePatterns(code: string): string[] {
  const flat = flatten(code);
  const split = flat.match(/^([a-z]+)\s*-?\s*(\d+)$/);
  if (!split) return [flat];
  return [flat, `${split[1]} ${split[2]}`, `${split[1]}-${split[2]}`];
}

/**
 * Which course this email is about, by code, then by name, then by who sent it.
 *
 * Returns null rather than a guess. prompts/15-email-extraction.md, point 6:
 * "When unsure, ask rather than guessing" — and /inbox asks.
 */
export function matchCourse(
  input: GateInput,
  courses: CourseHint[]
): { courseId: string; matchedOn: 'code' | 'name' | 'instructor' } | null {
  const haystack = flatten(`${input.subject} ${input.snippet} ${input.sender}`);

  for (const course of courses) {
    if (codePatterns(course.code).some((pattern) => haystack.includes(pattern))) {
      return { courseId: course.id, matchedOn: 'code' };
    }
  }

  for (const course of courses) {
    const name = flatten(course.name);
    // Two characters of course name would match half the mailbox.
    if (name.length >= 6 && haystack.includes(name)) {
      return { courseId: course.id, matchedOn: 'name' };
    }
  }

  for (const course of courses) {
    const instructor = flatten(course.instructor ?? '');
    if (instructor.length >= 5 && flatten(input.sender).includes(instructor)) {
      return { courseId: course.id, matchedOn: 'instructor' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/** Below this, no `deep` call is made. */
export const PLAUSIBLE_AT = 3;

/** The score a perfect match would reach, for squashing to 0..1. */
const FULL_MARKS = 6;

/**
 * Is this email plausibly about a course, and does it plausibly ask for
 * something?
 *
 * Both halves are required. "ME301: welcome to the module" matches a course and
 * asks for nothing, and spending a `deep` call on it is exactly the waste this
 * function exists to prevent.
 */
export function gateEmail(input: GateInput, courses: CourseHint[]): GateVerdict {
  const haystack = flatten(`${input.subject} ${input.snippet}`);
  const sender = flatten(input.sender);
  const reasons: string[] = [];

  let score = 0;

  const course = matchCourse(input, courses);
  if (course) {
    score += 3;
    reasons.push(
      course.matchedOn === 'code'
        ? 'the subject names one of your courses'
        : course.matchedOn === 'name'
          ? 'it names one of your courses'
          : 'it is from one of your lecturers'
    );
  }

  const deadline = hits(haystack, DEADLINE_WORDS);
  const change = hits(haystack, CHANGE_WORDS);
  const material = hits(haystack, MATERIAL_WORDS);

  if (deadline) {
    score += 2;
    reasons.push(`it says “${deadline}”`);
  }
  if (change) {
    score += 2;
    reasons.push(`it says “${change}”`);
  }
  if (material && !deadline && !change) {
    score += 1;
    reasons.push(`it says “${material}”`);
  }

  if (ACADEMIC_DOMAINS.some((domain) => sender.includes(domain))) {
    score += 1;
    reasons.push('it came from a university address');
  }

  const bulk = hits(`${haystack} ${sender}`, BULK_WORDS);
  if (bulk) {
    score -= 3;
    reasons.push(`it reads like bulk mail (“${bulk}”)`);
  }
  if (MACHINE_SENDERS.some((marker) => sender.includes(marker))) {
    score -= 1;
    reasons.push('it was sent by a machine');
  }

  // Both halves. A course with no ask, or an ask with no course, is not worth a
  // call — and neither is a course-shaped newsletter.
  const asksSomething = deadline !== null || change !== null || material !== null;
  const plausible = score >= PLAUSIBLE_AT && asksSomething;

  return {
    plausible,
    confidence: Math.min(1, Math.max(0, score / FULL_MARKS)),
    reasons,
    courseId: course?.courseId ?? null,
    matchedOn: course?.matchedOn ?? null,
  };
}
