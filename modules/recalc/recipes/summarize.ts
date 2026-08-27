import type { Generate } from '@/modules/agents';

import type { ReadSource, RecipeOutput } from '../schema';

// The first recipe.
//
// Two rules, both from prompts/11-recalc-engine.md:
//
//   1. "Recipes never write to the database themselves — they return content,
//      the engine persists it."  Nothing in this file takes a Supabase client.
//      It takes blocks that have already been read and something that can call
//      a model, and it returns text.
//
//   2. "Recipes declare their inputs so the engine can write
//      `derivation_sources` correctly."  It does not declare them in a second
//      function that could drift from the prompt — it hands back the very array
//      it built the prompt from. An under-recorded source is invisible until
//      the day someone edits that exact block and nothing goes stale, so the
//      two are structurally the same list or they are a bug waiting.

export const SUMMARIZE = 'summarize';

/**
 * Bump this when the wording below changes in a way that would produce a
 * different summary from identical notes. It is recorded on every derivation,
 * so a later slice can tell "the note changed" from "the prompt changed".
 */
export const SUMMARIZE_PROMPT_VERSION = 1;

/** Long enough for a page of notes, short enough that it stays a summary. */
const MAX_OUTPUT_TOKENS = 700;

const SYSTEM = [
  'You summarise a university student\'s own lecture notes so they can revise from them.',
  'Write 3 to 6 short sentences, or short bullet lines starting with "- " if the notes are a list.',
  'Only use what is in the notes. Never add facts, examples or context of your own.',
  'If the notes are unclear or unfinished, say so plainly rather than filling the gap.',
  'Plain text. No headings, no markdown emphasis, no preamble such as "Here is a summary".',
].join(' ');

export type SummarizeInput = {
  /** The note document's own text — its title. */
  title: string;
  /**
   * The document block first, then every live paragraph in order. All of them
   * are recorded on the receipt, including the empty ones.
   */
  sources: ReadSource[];
};

/** What a source contributes to the prompt. Empty paragraphs contribute nothing. */
function body(sources: ReadSource[]): string {
  return sources
    .slice(1)
    .map((source) => source.text.trim())
    .filter((text) => text !== '')
    .join('\n\n');
}

/** True when there is not enough here to summarise — checked before spending a call. */
export function hasNothingToSummarise(input: SummarizeInput): boolean {
  return body(input.sources) === '';
}

/**
 * Given the blocks, produce the summary.
 *
 * `generate` is the seam: in the app it is `generateWithRole(db, userId,
 * 'deep')`, which resolves the model out of the user's own `agent_profiles`
 * row. This file names no model and knows no provider (CLAUDE.md, Never rule 6).
 */
export async function summarize(
  input: SummarizeInput,
  generate: Generate
): Promise<RecipeOutput> {
  const notes = body(input.sources);
  if (notes === '') {
    throw new Error('There is nothing written in this note yet to summarise.');
  }

  const title = input.title.trim();
  const prompt = [
    title === '' ? 'Notes:' : `Notes titled "${title}":`,
    '',
    notes,
    '',
    'Summarise these notes.',
  ].join('\n');

  const { text, model } = await generate({
    system: SYSTEM,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const summary = text.trim();
  if (summary === '') {
    throw new Error('The model returned an empty summary.');
  }

  return {
    content: { text: summary },
    // The same array the prompt was built from. Not a re-derivation of it.
    sources: input.sources,
    model,
  };
}
