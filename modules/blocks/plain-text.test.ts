import { describe, expect, it } from 'vitest';

import { hashContent, normalise, plainTextOf } from '@/modules/blocks';

// The hash is the whole staleness engine in one function: a block's version
// bumps when and only when this text changes. Slice 05 put a TipTap document
// inside `blocks.content`, so this is where that transition is proven safe.
//
// No database — this is arithmetic on JSON, and the database test that follows
// (document.test.ts) proves the same rules end to end.

/** A paragraph as TipTap writes it. */
function paragraph(...content: unknown[]) {
  return { type: 'paragraph', attrs: { blockId: 'a' }, content };
}

const text = (value: string, marks?: string[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((mark) => ({ type: mark })) } : {}),
});

describe('plainTextOf', () => {
  it('still reads the plain { text } shape every earlier slice writes', () => {
    expect(plainTextOf({ text: 'Mitochondria.' })).toBe('Mitochondria.');
  });

  it('reads the text out of a TipTap paragraph', () => {
    expect(plainTextOf(paragraph(text('Mitochondria are the powerhouse.')))).toBe(
      'Mitochondria are the powerhouse.'
    );
  });

  it('ignores marks: bolding half a sentence does not change its text', () => {
    const plain = paragraph(text('Mitochondria are the powerhouse.'));
    const bolded = paragraph(
      text('Mitochondria are the '),
      text('powerhouse', ['bold']),
      text('.')
    );

    expect(normalise(plainTextOf(plain))).toBe(normalise(plainTextOf(bolded)));
    expect(hashContent(plain)).toBe(hashContent(bolded));
  });

  it('ignores the heading level: a paragraph made a heading says the same thing', () => {
    const asParagraph = { type: 'paragraph', content: [text('Fourier series')] };
    const asHeading = {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('Fourier series')],
    };

    expect(hashContent(asParagraph)).toBe(hashContent(asHeading));
  });

  it('ignores the block id, so the same words in a new row hash the same', () => {
    const first = { type: 'paragraph', attrs: { blockId: 'one' }, content: [text('x')] };
    const second = { type: 'paragraph', attrs: { blockId: 'two' }, content: [text('x')] };

    expect(hashContent(first)).toBe(hashContent(second));
  });

  it('keeps list items apart instead of running them into one word', () => {
    const list = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('foo')] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('bar')] }] },
      ],
    };

    expect(normalise(plainTextOf(list))).toBe('foo bar');
    expect(hashContent(list)).not.toBe(
      hashContent({ type: 'paragraph', content: [text('foobar')] })
    );
  });

  it('does not care about whitespace, in either shape', () => {
    expect(hashContent({ text: '  Mitochondria   are the powerhouse. ' })).toBe(
      hashContent({ text: 'Mitochondria are the powerhouse.' })
    );
    expect(hashContent(paragraph(text('  Mitochondria   are the powerhouse. ')))).toBe(
      hashContent(paragraph(text('Mitochondria are the powerhouse.')))
    );
  });

  it('does hash a real word change differently — the point of the whole thing', () => {
    expect(hashContent(paragraph(text('Mitochondria are the powerhouse.')))).not.toBe(
      hashContent(paragraph(text('Mitochondria are NOT the powerhouse.')))
    );
  });

  it('reads a divider as nothing, and does not throw on it', () => {
    expect(plainTextOf({ type: 'horizontalRule' })).toBe('');
  });
});
