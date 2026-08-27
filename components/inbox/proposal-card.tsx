import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { courseRail, courseTint, type CourseColour } from '@/lib/course-colours';
import { cx } from '@/lib/cx';

// One thing an email might mean, and the two answers to it.
//
// Not a client component. Both buttons are plain form submits against server
// actions, which means the whole card works before any JavaScript arrives —
// and there is no state to hold, because there is nothing to preview. The
// decision is the whole interaction.
//
// The layout answers prompts/15-email-extraction.md's third constraint: "Show
// me what it extracted *and* the sentence it extracted it from, so I can judge
// in one glance." What it found is the heading; the quote is directly under it,
// in the reading face, marked as a quotation; the email it came from is under
// that. Nothing else competes.
//
// There is no confidence number anywhere on this card. The gate produces one
// and it is stored, but rendering "87% confident" from a keyword score would be
// a precision this app has not earned.

export type ProposalCardProps = {
  id: string;
  /** 'Deadline' · 'Class change' · 'Material' — spelled for a person. */
  kindLabel: string;
  /** What was found. */
  headline: string;
  /** Exactly what pressing Accept will do. */
  effect: string;
  /** False when Accept has nothing it can act on. */
  actionable: boolean;
  /** The words this was read out of — verbatim, from the email. */
  sourceText: string;
  email: { subject: string; sender: string; receivedLabel: string };
  course: { code: string; name: string; colour: CourseColour } | null;
  meeting: { label: string; room: string | null } | null;
  /** Every course, for the "which one is this?" question. */
  courseChoices: { id: string; code: string; name: string }[];
  accept: (formData: FormData) => Promise<void>;
  reject: (formData: FormData) => Promise<void>;
};

/** 'Dr Ada Byron' out of 'Dr Ada Byron <ada@uni.example>'. */
function senderName(sender: string): string {
  const match = sender.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match?.[1] ?? sender).trim();
}

export function ProposalCard({
  id,
  kindLabel,
  headline,
  effect,
  actionable,
  sourceText,
  email,
  course,
  meeting,
  courseChoices,
  accept,
  reject,
}: ProposalCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-label text-faint uppercase">{kindLabel}</span>
          {course ? (
            <span
              className="inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-2 text-12 leading-none font-medium"
              style={{ ...courseRail(course.colour), ...courseTint(course.colour) }}
            >
              <span className="font-mono">{course.code}</span>
              <span className="text-muted">{course.name}</span>
            </span>
          ) : (
            <Pill tone="accent">Not sure which course</Pill>
          )}
        </div>

        <p className="mt-2 text-16 font-medium">{headline}</p>

        {/* The evidence. Serif, because these are somebody's actual words, and
            quoted rather than paraphrased — the recipe drops any item whose
            quote is not literally in the email. */}
        <blockquote className="mt-3 border-l-2 border-border pl-3 font-serif text-14 leading-relaxed">
          “{sourceText}”
        </blockquote>

        <p className="mt-3 text-13 text-muted">
          From <span className="text-ink">{senderName(email.sender)}</span> ·{' '}
          <span className="italic">{email.subject}</span>
          {email.receivedLabel ? ` · ${email.receivedLabel}` : ''}
        </p>

        {meeting ? (
          <p className="mt-1 text-13 text-muted">
            The lecture: <span className="font-mono tabular-nums">{meeting.label}</span>
            {meeting.room ? ` · ${meeting.room}` : ''}
          </p>
        ) : null}
      </div>

      <CardDivider />

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <form action={accept} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="proposalId" value={id} />

          {/* When the gate was not sure, ASK — never guess (point 6). When it
              was sure, the answer is carried along without a control to argue
              with. */}
          {course ? null : (
            <label className="flex items-center gap-2 text-13 text-muted">
              <span className="sr-only">Which course is this?</span>
              <select
                name="courseId"
                defaultValue=""
                className={cx(
                  'h-(--control-height) rounded-card border border-border bg-surface px-2',
                  'text-14 text-ink'
                )}
              >
                <option value="">Leave it unfiled</option>
                {courseChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.code} — {choice.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <Button type="submit" variant="primary" disabled={!actionable}>
            Accept
          </Button>
        </form>

        <form action={reject}>
          <input type="hidden" name="proposalId" value={id} />
          <Button type="submit" variant="ghost">
            Reject
          </Button>
        </form>
      </div>

      <p className="px-4 pb-4 text-12 text-muted">{effect}</p>
    </Card>
  );
}
