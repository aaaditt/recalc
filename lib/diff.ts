// A word-level text diff.
//
// /review's job is to answer "what actually changed in my note", and "something
// changed" is not an answer. This is the smallest thing that gives a real one:
// a longest-common-subsequence over words, so a fixed typo shows as one word
// swapped rather than two paragraphs replaced.
//
// It lives in /lib beside the other pure arithmetic the screens depend on —
// lib/today.ts, lib/calendar.ts, lib/tasks.ts, lib/study.ts, lib/syllabus.ts —
// for the same reason they do: it is the part that can be silently wrong, and a
// Server Component cannot be unit-tested.

export type DiffPart = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

/**
 * Above this many words on either side, the table stops being worth building.
 * A note paragraph is tens of words; a whole lecture note is hundreds. Beyond
 * this the diff degrades to "all of this became all of that", which is honest
 * rather than slow.
 */
const MAX_WORDS = 1200;

/** Words, each carrying the whitespace that followed it, so text rebuilds exactly. */
function tokenise(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

/** Consecutive parts of the same kind are one part. */
function merge(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];

  for (const part of parts) {
    if (part.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) {
      last.text += part.text;
      continue;
    }
    merged.push({ ...part });
  }

  return merged;
}

/**
 * What changed between two pieces of text.
 *
 * Returns the parts in reading order: unchanged runs, removals and additions
 * interleaved so the result concatenates back to `before` if the additions are
 * dropped, and to `after` if the removals are.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) {
    return before === '' ? [] : [{ type: 'same', text: before }];
  }
  if (before === '') return [{ type: 'added', text: after }];
  if (after === '') return [{ type: 'removed', text: before }];

  const old = tokenise(before);
  const now = tokenise(after);

  if (old.length > MAX_WORDS || now.length > MAX_WORDS) {
    return [
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of old[i..] and now[j..]
  const width = now.length + 1;
  const lcs = new Int32Array((old.length + 1) * width);

  for (let i = old.length - 1; i >= 0; i -= 1) {
    for (let j = now.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        old[i] === now[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;

  while (i < old.length && j < now.length) {
    if (old[i] === now[j]) {
      parts.push({ type: 'same', text: old[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      parts.push({ type: 'removed', text: old[i] });
      i += 1;
    } else {
      parts.push({ type: 'added', text: now[j] });
      j += 1;
    }
  }

  while (i < old.length) {
    parts.push({ type: 'removed', text: old[i] });
    i += 1;
  }
  while (j < now.length) {
    parts.push({ type: 'added', text: now[j] });
    j += 1;
  }

  return merge(parts);
}

/** Did anything at all change? Cheaper than reading the parts to find out. */
export function hasTextChanged(parts: DiffPart[]): boolean {
  return parts.some((part) => part.type !== 'same');
}
