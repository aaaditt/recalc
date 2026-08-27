import { describe, expect, it } from 'vitest';

import { diffWords, hasTextChanged, type DiffPart } from './diff';

// The diff is what turns /review from "something changed" into "*this*
// changed". These tests are about two properties above all:
//
//   1. dropping the additions rebuilds the old text exactly, and dropping the
//      removals rebuilds the new one. If that ever stops holding, the screen is
//      showing a sentence nobody wrote.
//   2. a one-word edit is a one-word diff, not a whole paragraph replaced.

const join = (parts: DiffPart[], skip: DiffPart['type']) =>
  parts
    .filter((part) => part.type !== skip)
    .map((part) => part.text)
    .join('');

const rebuildsBothSides = (before: string, after: string) => {
  const parts = diffWords(before, after);
  expect(join(parts, 'added')).toBe(before);
  expect(join(parts, 'removed')).toBe(after);
  return parts;
};

describe('diffWords', () => {
  it('says nothing changed when nothing changed', () => {
    const parts = diffWords('Mitochondria are the powerhouse.', 'Mitochondria are the powerhouse.');
    expect(parts).toEqual([{ type: 'same', text: 'Mitochondria are the powerhouse.' }]);
    expect(hasTextChanged(parts)).toBe(false);
  });

  it('finds a single changed word and leaves the rest alone', () => {
    const parts = rebuildsBothSides(
      'Mitochondria are the powerhouse of the cell.',
      'Mitochondria are NOT the powerhouse of the cell.'
    );

    expect(hasTextChanged(parts)).toBe(true);
    expect(parts.filter((part) => part.type === 'added').map((p) => p.text.trim())).toEqual([
      'NOT',
    ]);
    expect(parts.filter((part) => part.type === 'removed')).toEqual([]);
  });

  it('finds a word replaced, as one removal and one addition', () => {
    const parts = rebuildsBothSides('The reaction is fast.', 'The reaction is slow.');

    expect(parts.filter((p) => p.type === 'removed').map((p) => p.text.trim())).toEqual([
      'fast.',
    ]);
    expect(parts.filter((p) => p.type === 'added').map((p) => p.text.trim())).toEqual(['slow.']);
  });

  it('finds a deletion', () => {
    const parts = rebuildsBothSides('one two three four', 'one three four');
    expect(parts.filter((p) => p.type === 'added')).toEqual([]);
    expect(parts.filter((p) => p.type === 'removed').map((p) => p.text.trim())).toEqual(['two']);
  });

  it('handles an empty side in each direction', () => {
    expect(diffWords('', 'new text')).toEqual([{ type: 'added', text: 'new text' }]);
    expect(diffWords('old text', '')).toEqual([{ type: 'removed', text: 'old text' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('merges runs so a rewritten sentence is not word-by-word noise', () => {
    const parts = rebuildsBothSides(
      'Alpha beta gamma delta epsilon.',
      'Alpha one two three epsilon.'
    );

    // One run removed, one run added — not five of each.
    expect(parts.filter((p) => p.type === 'removed')).toHaveLength(1);
    expect(parts.filter((p) => p.type === 'added')).toHaveLength(1);
  });

  it('never puts two parts of the same kind next to each other', () => {
    const parts = diffWords(
      'the quick brown fox jumps over the lazy dog',
      'the slow brown cat jumps under the lazy dog'
    );

    for (let i = 1; i < parts.length; i += 1) {
      expect(parts[i].type).not.toBe(parts[i - 1].type);
    }
  });

  it('rebuilds both sides for a multi-paragraph edit', () => {
    rebuildsBothSides(
      'First paragraph here.\n\nSecond paragraph here.\n\nThird one.',
      'First paragraph here.\n\nSecond paragraph rewritten entirely.\n\nThird one.'
    );
  });

  it('degrades to a whole-block replace rather than building a huge table', () => {
    const before = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(' ');
    const after = `${before} and one more`;

    const parts = diffWords(before, after);
    expect(parts).toEqual([
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ]);
  });
});
