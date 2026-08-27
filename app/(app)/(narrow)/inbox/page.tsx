import Link from 'next/link';

import { acceptProposalAction, rejectProposalAction, scanMailboxAction } from './actions';
import { ProposalCard } from '@/components/inbox/proposal-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import { getCourses } from '@/modules/courses';
import { getInbox } from '@/modules/proposals';
import { ensureWorkspace } from '@/modules/workspaces';

// The proposals queue.
//
// docs/PRODUCT.md, "Scope boundaries": "Email is read-only... Extractions are
// *proposals* the user accepts — never written straight into the task list."
// This screen is that sentence, drawn. Every row is something an email might
// mean, the words it was read out of, and two buttons. Nothing on it has
// happened yet, and nothing on it will happen without a tap.
//
// Rejecting keeps the row for ever — the unique index in migration 011 is on
// (email_id, fingerprint) and a rejected row goes on holding that slot. The
// count at the bottom of this page says so out loud, because "it will not ask
// me again" is only worth anything if it is visibly true.

export const metadata = { title: 'Inbox · Recalc' };

const KIND_LABEL: Record<string, string> = {
  deadline: 'Deadline',
  class_change: 'Class change',
  material: 'Material',
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const zone = localTimeZone();

  const [inbox, courses] = await Promise.all([
    getInbox(supabase, { workspaceId: workspace.id, userId: user.id }, { timeZone: zone }),
    getCourses(supabase, workspace.id),
  ]);

  // The palette falls back by position for a course typed straight into the
  // table editor, exactly as the calendar does.
  const colourOf = new Map(
    courses.map((course, index) => [course.id, colourForCourse(course.colour, index)])
  );
  const courseChoices = courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
  }));

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={
          inbox.waiting.length === 0
            ? 'Nothing is waiting. Nothing from your mail has been added to anything.'
            : inbox.waiting.length === 1
              ? 'One thing found in your mail, waiting for you.'
              : `${inbox.waiting.length} things found in your mail, waiting for you.`
        }
        actions={
          <>
            <form action={scanMailboxAction}>
              <Button type="submit" variant="primary">
                {inbox.unscanned > 0 ? `Scan ${inbox.unscanned} new` : 'Scan mail'}
              </Button>
            </form>
            <Link
              href="/settings/email"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Email
            </Link>
          </>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {params.done || params.scanned ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          {params.done ?? params.scanned}
        </div>
      ) : null}

      {inbox.waiting.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing proposed"
            description="Recalc reads the subject and preview of mail that looks like it is about one of your courses, and proposes what it finds here. It never adds anything to your tasks or your calendar on its own."
            action={
              <Link
                href="/settings/email"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Sync your mail
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {inbox.waiting.map((item) => (
            <ProposalCard
              key={item.id}
              id={item.id}
              kindLabel={KIND_LABEL[item.kind] ?? item.kind}
              headline={item.headline}
              effect={item.effect}
              actionable={item.actionable}
              sourceText={item.payload.sourceText}
              email={{
                subject: item.email.subject,
                sender: item.email.sender,
                receivedLabel: item.email.receivedLabel,
              }}
              course={
                item.course
                  ? {
                      code: item.course.code,
                      name: item.course.name,
                      colour: colourOf.get(item.course.id) ?? 'indigo',
                    }
                  : null
              }
              meeting={item.meeting ? { label: item.meeting.label, room: item.meeting.room } : null}
              courseChoices={courseChoices}
              accept={acceptProposalAction}
              reject={rejectProposalAction}
            />
          ))}
        </div>
      )}

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">How this works</p>
        <Card>
          <div className="flex flex-col gap-3 px-4 py-4 text-14 text-muted">
            <p>
              Only mail that mentions one of your courses <em>and</em> asks for something is
              ever read by a model. Everything else is skipped by a keyword check that costs
              nothing — most mail never reaches the model at all.
            </p>
            <p>
              Your mail has no bodies stored, only the subject and the preview line Gmail
              shows in the list. Every proposal quotes the exact words it was read out of, so
              you are judging the email and not a paraphrase of it.
            </p>
            <p>
              {inbox.accepted} accepted · {inbox.rejected} rejected. A rejected proposal is
              kept for ever so the same email can never propose the same thing again.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}
