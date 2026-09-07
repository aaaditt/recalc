// Public API of the onboarding module. Import only from here.
//
// The guided setup path at `/start` — slice 20. Seven steps in two acts, each
// one a real action on a real screen, and the app fills with the user's own data
// as they go. There is no tour, no spotlight, and no screen in here that exists
// only to be onboarded through.
//
// **It owns no table.** Every tick is derived from data other modules already
// hold, so nothing here can disagree with the world; the one stored fact is
// "I am done with this", which lives on `profiles` because it is a fact about a
// person, and is read and written through `modules/profiles` rather than from
// here (CLAUDE.md's Never rule 2).
//
// The step worth knowing about is the last one. It ticks when a summary in the
// workspace has gone stale *at least once* — `derivations.stale_runs`, migration
// 015 — and not when something is stale *now*, which would un-tick itself the
// moment the user accepted the diff in /review and did exactly what the step was
// teaching. `modules/onboarding/progress.test.ts` is that invariant's test.
export { dismiss, getProgress, restore, shouldOfferSetup } from './service';
export {
  ACT_TWO_PREAMBLE,
  STEPS,
  actSchema,
  stepIdSchema,
  stepStateSchema,
  type Act,
  type Progress,
  type Step,
  type StepDefinition,
  type StepId,
  type StepState,
} from './schema';
