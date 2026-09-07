import Link from 'next/link';

import { dismissOnboardingAction } from './actions';
import { GuidedStep, StepList } from '@/components/onboarding/guided-step';
import { PageHeader } from '@/components/ui/page-header';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { ACT_TWO_PREAMBLE, getProgress, stepIdSchema } from '@/modules/onboarding';

// The guided path — slice 20.
//
// One step at a time, and every step is a real action on a real screen. There is
// no tour, no spotlight and no screen in this flow that exists only to be
// onboarded through: you are sent to `/timetable` to fill in your timetable, and
// what you type there is your own timetable rather than a sample. Three separate
// "not a modal, not a wizard" decisions in this codebase point the same way.
//
// **Nothing here blocks the app.** No route redirects into `/start`, it keeps
// the nav so you can leave from it mid-way, and every step can be skipped for
// ever. The one screen in Recalc that blocks is `/welcome`, and it stays the
// only one.
//
// Which step is shown comes from `?step=`, and what is *ticked* comes from the
// database — the two are separate on purpose. Progress is derived on every
// render from courses, sessions, notes, agent roles and derivations, so it can
// disagree with reality only by the database being wrong. Deleting your only
// course un-ticks step 2, correctly, and there is no repair job to write.

export const metadata = { title: 'Set up · Recalc' };

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const params = await searchParams;

  // Free: app/(app)/layout.tsx asked the same question to draw the /review
  // badge, and `currentWorkspace` is memoised for the length of the request.
  const found = await currentWorkspace();
  if (!found) return null;

  const supabase = await createClient();
  const progress = await getProgress(supabase, found.user.id, found.workspace.id);

  // `?step=` is client-supplied, so it is parsed rather than trusted — an
  // unknown value falls back to wherever the user actually is, which is also
  // what an absent one does.
  const asked = stepIdSchema.safeParse(params.step);
  const viewing =
    (asked.success ? progress.steps.find((step) => step.id === asked.data) : undefined) ??
    progress.current;

  const index = viewing
    ? progress.steps.findIndex((step) => step.id === viewing.id)
    : -1;
  const next = index >= 0 ? (progress.steps[index + 1] ?? null) : null;

  return (
    <>
      <PageHeader
        title="Set up Recalc"
        subtitle={
          progress.complete
            ? 'Everything here is done.'
            : 'Seven things, in order. Each one is the real screen, not a demo.'
        }
        actions={
          <Link
            href="/today"
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Today
          </Link>
        }
      />

      <GuidedStep
        steps={progress.steps}
        current={viewing}
        next={next}
        // Null on the last step: there is nothing after it to skip to.
        skipHref={next ? `/start?step=${next.id}` : null}
        showActTwoPreamble={
          viewing?.act === 2 && progress.steps[index - 1]?.act === 1
        }
        actTwoPreamble={ACT_TWO_PREAMBLE}
        dismiss={dismissOnboardingAction}
      />

      {/* The rest of the path, quietly. One step at a time is a rule about
          attention, not about hiding what you are in the middle of. */}
      <div className="pt-6">
        <p className="pb-2 font-mono text-label text-faint uppercase">All steps</p>
        <StepList steps={progress.steps} currentId={viewing?.id ?? null} />
      </div>

      <p className="pt-6 text-12 text-muted">
        Nothing here is required. Recalc renders every screen with an empty
        semester, and this page is a place you can leave at any point and come back
        to from{' '}
        <Link href="/settings/semester" className="underline underline-offset-4">
          settings
        </Link>
        .
      </p>
    </>
  );
}
