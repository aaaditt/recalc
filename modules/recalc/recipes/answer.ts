import type { Generate } from '@/modules/agents';

import type { ReadSource, RecipeOutput } from '../schema';

// The second recipe. Same two rules as summarize.ts:
//
//   1. It never writes to the database. It takes blocks that have already been
//      read and something that can call a model, and it returns text.
//   2. It declares its inputs by handing back the very array it built the
//      prompt from, so `derivation_sources` and the prompt cannot drift.
//
// The difference from summarize is what the sources are. A summary reads a note
// document and its paragraphs; an answer reads the question block first, then
// every block the question was anchored to. All of them go on the receipt,
// which is what makes editing an anchored paragraph flag the answer through
// exactly the same Postgres trigger that flags a summary.

export const ANSWER = 'answer';

/**
 * Bump this when the wording below changes in a way that would produce a
 * different answer from identical notes. Recorded on every derivation, so a
 * later slice can tell "the notes changed" from "the prompt changed".
 */
export const ANSWER_PROMPT_VERSION = 1;

/** An answer is a paragraph, not an essay. */
const MAX_OUTPUT_TOKENS = 600;

const SYSTEM = [
  "You answer a university student's question using only their own lecture notes.",
  'Write 2 to 5 short sentences of plain prose.',
  'Use ONLY what is in the notes below. Never add facts, formulas, examples or context of your own.',
  'If the notes do not contain the answer, say exactly what is missing and stop.',
  'Do not hedge with phrases like "it seems" — either the notes say it or they do not.',
  'Plain text. No headings, no markdown emphasis, no preamble such as "Here is the answer".',
].join(' ');

export type AnswerInput = {
  /** The question, as it was typed. */
  question: string;
  /**
   * The question block first, then every anchored block. All of them are
   * recorded on the receipt, including the ones that are empty today — an
   * under-recorded source is a staleness bug that stays invisible until the day
   * somebody edits that exact block and nothing goes stale.
   */
  sources: ReadSource[];
};

/** What the anchored blocks contribute. The question itself is not source material. */
function body(sources: ReadSource[]): string {
  return sources
    .slice(1)
    .map((source) => source.text.trim())
    .filter((text) => text !== '')
    .join('\n\n');
}

/** True when the anchored blocks say nothing — checked before spending a call. */
export function hasNothingToAnswerFrom(input: AnswerInput): boolean {
  return body(input.sources) === '';
}

/**
 * Given the question and the blocks it is anchored to, produce the answer.
 *
 * `generate` is the seam: in the app it is `generateWithRole(db, userId,
 * 'deep')`, which resolves the model out of the user's own `agent_profiles`
 * row. This file names no model and knows no provider (CLAUDE.md, Never rule 6).
 */
export async function answer(
  input: AnswerInput,
  generate: Generate
): Promise<RecipeOutput> {
  const notes = body(input.sources);
  if (notes === '') {
    throw new Error('The notes this question is about are empty, so there is nothing to answer from.');
  }

  const question = input.question.trim();
  if (question === '') {
    throw new Error('There is no question here to answer.');
  }

  const prompt = [
    'My notes:',
    '',
    notes,
    '',
    `My question: ${question}`,
    '',
    'Answer it from those notes alone.',
  ].join('\n');

  const { text, model } = await generate({
    system: SYSTEM,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const written = text.trim();
  if (written === '') {
    throw new Error('The model returned an empty answer.');
  }

  return {
    content: { text: written },
    // The same array the prompt was built from. Not a re-derivation of it.
    sources: input.sources,
    model,
  };
}
