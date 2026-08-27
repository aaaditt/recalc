import Link from 'next/link';

import {
  acceptAction,
  deleteDerivationAction,
  keepOldAction,
  regenerateAction,
} from './actions';
import { ReviewItem, type ReviewSourceView } from '@/components/review/review-item';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { dayTitle } from '@/lib/calendar';
import { diffWords } from '@/lib/diff';
import { createClient } from '@/lib/supabase/server';
import { localDateKey, localTimeZone } from '@/lib/time';
import { getFailedDerivations, getReviewQueue } from '@/modules/recalc';
import { ensureWorkspace } from '@/modules/workspaces';

// The stale queue — the screen this whole app is built around.
//
// docs/PRODUCT.md rule 2: "Nothing regenerates silently. Stale items go to
// /review, where the user sees a before/after diff and accepts. The valuable
// signal is not the new summary — it is *your understanding of this topic just
// shifted*." So the diff of the *note* is here on load, computed from the
// receipt with no model involved at all, and the new summary is only generated
// when a button is pressed.

export const metadata = { title: 'Review · Recalc' };

const RECIPE_LABEL: Record<string, string> = {
  summarize: 'Summary',
  flashcards: 'Flashcards',
  answer: 'Answer',
  extract: 'Extract',
  plan: 'Plan',
};

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const zone = localTimeZone();

  const [queue, failed] = await Promise.all([
    getReviewQueue(supabase, workspace.id),
    getFailedDerivations(supabase, workspace.id),
  ]);

  return (
    <>
      <PageHeader
        title="Review"
        subtitle={
          queue.length === 0
            ? 'Everything is up to date with the notes it was built from.'
            : queue.length === 1
              ? 'One thing is out of date.'
              : `${queue.length} things are out of date.`
        }
      />

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to review"
            description="When you edit a note, anything written from it shows up here with the change highlighted. Nothing is ever regenerated behind your back."
            action={
              <Link
                href="/notes"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Go to notes
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {queue.map((item) => {
            // The diff is computed here, on the server, out of the receipt's
            // snapshot and the block as it stands. lib/diff.ts is a pure
            // function with its own test; the component only draws the result.
            const sources: ReviewSourceView[] = item.sources.map((source) => ({
              blockId: source.blockId,
              readVersion: source.readVersion,
              currentVersion: source.currentVersion,
              changed: source.changed,
              parts:
                source.before !== null && source.after !== null
                  ? diffWords(source.before, source.after)
                  : null,
              after: source.after,
            }));

            return (
              <ReviewItem
                key={item.derivationId}
                derivationId={item.derivationId}
                recipeLabel={RECIPE_LABEL[item.recipe] ?? item.recipe}
                note={item.note ? { title: item.note.title, href: item.note.href } : null}
                currentText={item.currentText}
                sources={sources}
                computedLabel={
                  item.computedAt
                    ? dayTitle(localDateKey(new Date(item.computedAt), zone))
                    : null
                }
                regenerate={regenerateAction.bind(null, item.derivationId)}
                accept={acceptAction.bind(null, item.derivationId)}
                keepOld={keepOldAction.bind(null, item.derivationId)}
                discard={deleteDerivationAction.bind(null, item.derivationId)}
              />
            );
          })}
        </div>
      )}

      {failed.length > 0 ? (
        <section className="pt-8">
          <p className="pb-3 font-mono text-label text-faint uppercase">Did not finish</p>
          <Card className="px-4 py-4">
            <p className="text-14">
              {failed.length === 1
                ? 'One thing failed to generate and is waiting on its note.'
                : `${failed.length} things failed to generate.`}
            </p>
            <p className="pt-1 text-13 text-muted">
              {failed[0].error ?? 'No reason was recorded.'} Open the note it belongs to and
              press Summarise again.
            </p>
          </Card>
        </section>
      ) : null}
    </>
  );
}
