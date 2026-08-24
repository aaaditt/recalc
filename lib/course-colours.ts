// The eight course colours, and the only three ways to put one on screen.
//
// Colour means exactly one thing in Recalc: which course something belongs to
// (docs/DESIGN.md, principle 4). Nothing else gets to be colourful, or the
// signal is lost.
//
// The hex values live in app/globals.css as `--course-*`. Nothing here knows
// them, which is what keeps rule 7 true: a hex code outside the token file is
// a bug. These helpers hand back the CSS custom property instead.
//
// DESIGN.md's rule, in full:
//   - 3px left rail in the full colour        -> courseRail
//   - background at ~8% alpha of the colour   -> courseTint
//   - a small dot in the full colour          -> courseDot
//   - text in --text, NEVER in the course colour
//
// Never fill a calendar block with a saturated course colour. Six saturated
// blocks is a fruit salad and it stops being scannable.

import type { CSSProperties } from 'react';

/** Assigned on course creation, changeable by the user. Order is the palette order. */
export const COURSE_COLOURS = [
  'indigo',
  'rose',
  'olive',
  'teal',
  'violet',
  'clay',
  'amber',
  'sky',
] as const;

export type CourseColour = (typeof COURSE_COLOURS)[number];

/** `courses.colour` is a nullable text column, so it has to be checked. */
export function isCourseColour(value: string | null | undefined): value is CourseColour {
  return typeof value === 'string' && (COURSE_COLOURS as readonly string[]).includes(value);
}

/**
 * The colour to draw a course in. `courses.colour` is nullable and is only
 * filled in when the course is created through the app, so a course typed
 * straight into the table editor still has to look like something: it falls
 * back to the palette by its position in the course list.
 */
export function colourForCourse(
  colour: string | null | undefined,
  index: number
): CourseColour {
  if (isCourseColour(colour)) return colour;
  return COURSE_COLOURS[index % COURSE_COLOURS.length];
}

function colourVar(colour: CourseColour): string {
  return `var(--course-${colour})`;
}

/**
 * The left rail — the one place a course colour appears at full strength.
 * Pair it with courseTint on the same element.
 */
export function courseRail(colour: CourseColour): CSSProperties {
  return {
    borderLeft: `var(--course-rail-width) solid ${colourVar(colour)}`,
  };
}

/**
 * The background tint: 8% alpha of the course colour over whatever is behind
 * it. `color-mix(... , transparent)` is the same thing as `rgba(R,G,B,.08)`,
 * written without needing the channels.
 */
export function courseTint(colour: CourseColour): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${colourVar(colour)} var(--course-tint-alpha), transparent)`,
  };
}

/** A 6px round dot in the full colour — lists, month cells, legends. */
export function courseDot(colour: CourseColour): CSSProperties {
  return {
    backgroundColor: colourVar(colour),
    width: 'var(--course-dot-size)',
    height: 'var(--course-dot-size)',
    borderRadius: '9999px',
    flexShrink: 0,
  };
}
