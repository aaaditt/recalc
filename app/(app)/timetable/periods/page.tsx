import Link from 'next/link';

import {
  addPeriodAction,
  applyPeriodAction,
  removePeriodAction,
  updatePeriodAction,
} from '../actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { createClient } from '@/lib/supabase/server';
import { clockLabel } from '@/lib/timetable';
import { getPeriods, getPeriodUsage } from '@/modules/timetable';
import { ensureWorkspace } from '@/modules/workspaces';

// The rows of the printed grid, as a list you can type into.
//
// This is where the disagreement inside last_sem.jpeg gets settled: the
// handwritten grid says fifty minutes a period (7:30–8:20), the printed table
// underneath it says forty (7:30–8:10). Only Aadit knows which one this term
// actually runs on, so the app does not guess — it gives him the nine rows and
// a box per time.
//
// The important thing on this screen is the sentence under the heading, and it
// is true: saving a row moves no lecture. A period is the row a class is drawn
// on, never the source of a lecture's time — that is `sessions.starts_at`, and
// it was copied in when the class was added. Moving the classes on a row is a
// second, separate press, and even then only future untouched lectures move.

export const metadata = { title: 'Periods · Recalc' };

/** Postgres `time` comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'. */
function timeValue(time: string): string {
  return clockLabel(time);
}

export default async function PeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string; moved?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const [periods, usage] = await Promise.all([
    getPeriods(supabase, workspace.id),
    getPeriodUsage(supabase, workspace.id),
  ]);

  const usageOf = new Map(usage.map((row) => [row.periodId, row]));
  const last = periods[periods.length - 1];

  // The next row down, pre-filled the way the paper reads: five minutes after
  // the last one ends, and the same length. Adding the spare "+1" is then one
  // press rather than two more numbers to work out at 11pm.
  const nextStart = last ? shift(last.ends_at, 5) : '07:30';
  const nextEnd = last ? shift(nextStart, minutesBetween(last.starts_at, last.ends_at)) : '08:20';

  return (
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <PageHeader
        title="Periods"
        subtitle="The rows of your timetable, and the times they run."
        actions={
          <Link
            href="/timetable"
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Timetable
          </Link>
        }
      />

      {params.applied !== undefined ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          <p className="font-medium">Applied.</p>
          <p className="mt-1 text-muted">
            {params.applied} {Number(params.applied) === 1 ? 'class' : 'classes'} moved onto
            the row&rsquo;s times · {params.moved} upcoming{' '}
            {Number(params.moved) === 1 ? 'lecture' : 'lectures'} followed. Anything you had
            written a note on stayed where it was.
          </p>
        </div>
      ) : null}

      <p className="mb-4 max-w-prose text-14 text-muted">
        Saving a row changes the heading on the grid and the times any class you add
        afterwards is given. It moves no lecture you already have — the ones on your
        calendar keep the times they were made with, and so do the notes attached to
        them. To move the classes already on a row, press{' '}
        <span className="text-ink">Apply</span> beside it.
      </p>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {periods.map((period) => {
            const used = usageOf.get(period.id);
            return (
              <li key={period.id} className="px-4 py-3">
                <form
                  action={updatePeriodAction}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="periodId" value={period.id} />

                  <span className="w-6 shrink-0 pb-2 text-right font-mono text-12 text-faint">
                    {period.position}
                  </span>

                  <Field label="Row" className="w-20 shrink-0">
                    <Input
                      name="label"
                      required
                      maxLength={12}
                      defaultValue={period.label}
                      autoComplete="off"
                      className="font-mono"
                    />
                  </Field>

                  <Field label="Starts" className="w-32 shrink-0">
                    <Input
                      type="time"
                      name="startsAt"
                      required
                      defaultValue={timeValue(period.starts_at)}
                      className="font-mono"
                    />
                  </Field>

                  <Field label="Ends" className="w-32 shrink-0">
                    <Input
                      type="time"
                      name="endsAt"
                      required
                      defaultValue={timeValue(period.ends_at)}
                      className="font-mono"
                    />
                  </Field>

                  <Button type="submit">Save</Button>
                </form>

                <div className="flex flex-wrap items-center gap-3 pt-2 pl-9">
                  <span className="text-12 text-muted">
                    {used && used.classes > 0
                      ? `${used.classes} ${used.classes === 1 ? 'class' : 'classes'} on this row`
                      : 'No classes on this row'}
                  </span>

                  {used && used.outOfStep > 0 ? (
                    <>
                      <Pill tone="accent">
                        {used.outOfStep} still on the old time
                      </Pill>
                      <form action={applyPeriodAction}>
                        <input type="hidden" name="periodId" value={period.id} />
                        <button
                          type="submit"
                          className="text-12 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
                        >
                          Apply to {used.outOfStep === 1 ? 'it' : 'them'}
                        </button>
                      </form>
                    </>
                  ) : null}

                  <form action={removePeriodAction} className="ml-auto">
                    <input type="hidden" name="periodId" value={period.id} />
                    <button
                      type="submit"
                      className="text-12 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
                    >
                      Remove row
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>

        <CardDivider />

        {/* The spare "+1" at the foot of the printed timetable. It has no times
            on the paper, so the form guesses the obvious ones and lets him
            change them. */}
        <form action={addPeriodAction} className="flex flex-wrap items-end gap-3 px-4 py-3">
          <Field label="Row" className="w-20 shrink-0">
            <Input
              name="label"
              required
              maxLength={12}
              defaultValue="+1"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Field label="Starts" className="w-32 shrink-0">
            <Input
              type="time"
              name="startsAt"
              required
              defaultValue={nextStart}
              className="font-mono"
            />
          </Field>
          <Field label="Ends" className="w-32 shrink-0">
            <Input
              type="time"
              name="endsAt"
              required
              defaultValue={nextEnd}
              className="font-mono"
            />
          </Field>
          <Button type="submit" variant="primary">
            Add row
          </Button>
        </form>
      </Card>

      <p className="mt-3 max-w-prose text-12 text-muted">
        Removing a row does not remove the classes on it. They keep their own times and
        stay on the calendar; the grid simply draws them by time instead, or lists them
        underneath it.
      </p>
    </div>
  );
}

// Two lines of clock arithmetic, kept here because they exist only to pre-fill
// one form. Nothing depends on them being right.

function minutesBetween(startsAt: string, endsAt: string): number {
  return toMinutes(endsAt) - toMinutes(startsAt);
}

function shift(time: string, minutes: number): string {
  const total = (toMinutes(time) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function toMinutes(time: string): number {
  const [hours, minutes] = clockLabel(time).split(':');
  return Number(hours) * 60 + Number(minutes);
}
