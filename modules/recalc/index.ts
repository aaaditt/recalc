// Public API of the recalc module. Import only from here.
//
// This is the engine docs/PRODUCT.md exists for: every AI-generated block
// carries a receipt naming the source blocks it was built from and the versions
// it read, and when a source moves on, the derivation is flagged stale.
//
// The flagging itself is NOT in here. It is `mark_derivations_stale()`, a
// Postgres trigger from migration 001, and it stays there so that any path that
// bumps a version — this app, a script, the Supabase table editor — fires the
// same cascade. Nothing in this module writes `status = 'stale'` except
// worker.ts closing the one window the trigger cannot see, which is documented
// where it happens.
export {
  discardDerivation,
  emailBlocksAlreadyExtracted,
  extractFromEmailBlock,
  generateAnswer,
  getAnswer,
  getAnswers,
  getNoteSummary,
  getReviewQueue,
  keepOldVersion,
  summariseNote,
  type Answer,
  type ExtractionRun,
  type NoteSummary,
} from './service';
export {
  acceptPreview,
  previewDerivation,
  runDerivation,
  type EngineContext,
  type RunOptions,
} from './worker';
export {
  getFailedDerivations,
  getStaleCount,
  getStaleDerivations,
} from './staleness';
export {
  derivationsDownstreamOf,
  derivationsForBlocks,
  derivationsForNote,
  readAnswerSources,
  readEmailSources,
  readInputs,
  readNoteSources,
  resolveSources,
  subjectNoteOf,
  type DerivationInputs,
  type ResolvedSource,
} from './graph';
export {
  SUMMARIZE,
  SUMMARIZE_PROMPT_VERSION,
  hasNothingToSummarise,
  summarize,
  type SummarizeInput,
} from './recipes/summarize';
export {
  ANSWER,
  ANSWER_PROMPT_VERSION,
  answer,
  hasNothingToAnswerFrom,
  type AnswerInput,
} from './recipes/answer';
export {
  EXTRACT,
  EXTRACT_PROMPT_VERSION,
  MAX_ITEMS_PER_EMAIL,
  digestOf,
  extract,
  parseExtraction,
  quotesTheEmail,
  readStoredItems,
  readableText,
  type EmailFacts,
  type ExtractInput,
  type ExtractedItem,
} from './recipes/extract';
export {
  derivationSchema,
  derivationSourceSchema,
  derivationStatusSchema,
  recipeSchema,
  type Derivation,
  type DerivationSourceRow,
  type DerivationStatus,
  type Preview,
  type ReadSource,
  type RecipeName,
  type RecipeOutput,
  type ReviewItem,
  type ReviewSource,
  type RunResult,
} from './schema';
