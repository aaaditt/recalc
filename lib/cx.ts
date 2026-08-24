/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not `clsx` + `tailwind-merge`: two dependencies to do this, and
 * merge semantics invite primitives that quietly fight their callers. The
 * primitives in /components/ui set only classes a caller is unlikely to want to
 * override, so a plain join is enough.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
