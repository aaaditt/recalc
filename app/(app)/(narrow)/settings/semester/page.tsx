import Link from 'next/link';

import { generateMeetingsAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { courseDot, colourForCourse } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { getCourses } from '@/modules/courses';
import { ensureWorkspace } from '@/modules/workspaces';

// Where the term is turned into lectures. One button, run once at the start of
// term — and safe to run again, which is the whole point of the idempotence
// test in slice 01.

export const metadata = { title: 'Semester · Recalc' };

export default async function SemesterPage({
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
  const courses = await getCourses(supabase, workspace.id);

  const terms = [...new Set(courses.map((course) => course.term))];
  const ran = params.created !== undefined;

  return (
    <>
      <PageHeader
        title="Semester"
        subtitle="Expand your weekly timetable into this term's lectures."
        actions={
          <>
            {/* The way in to slice 10's screen. The bottom nav is full at five
                columns (docs/DECISIONS.md), so settings screens link to each
                other rather than growing a sixth destination. */}
            <Link
              href="/settings/agents"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Agents
            </Link>
            <Link
              href="/calendar"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Calendar
            </Link>
          </>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {ran ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          <p className="font-medium">Done.</p>
          <p className="mt-1 text-muted">
            {params.created} created · {params.updated} brought back into line ·{' '}
            {params.unchanged} left alone.
          </p>
          <p className="mt-2 text-13 text-muted">
            Lectures that already had a note, a topic, a unit or a cancellation were not
            touched. Running this again is safe.
          </p>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <p className="bg-sunken px-4 py-2 text-13 font-medium text-muted">Your courses</p>

        {courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="Add your courses and their weekly sessions first — docs/SEEDING.md has the steps."
          />
        ) : (
          <ul className="divide-y divide-line">
            {courses.map((course, index) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-sunken"
                >
                  <span style={courseDot(colourForCourse(course.colour, index))} />
                  <span className="font-mono text-12 font-medium">{course.code}</span>
                  <span className="min-w-0 flex-1 truncate text-14">{course.name}</span>
                  <Pill>{course.term}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <CardDivider />

        <form action={generateMeetingsAction} className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Term starts" className="flex-1">
              <Input type="date" name="termStart" required defaultValue={params.termStart} />
            </Field>
            <Field label="Term ends" className="flex-1">
              <Input type="date" name="termEnd" required defaultValue={params.termEnd} />
            </Field>
          </div>

          {terms.length > 1 ? (
            <Field label="Term">
              <Select name="term" defaultValue="">
                <option value="">Every course</option>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Button type="submit" variant="primary" disabled={courses.length === 0}>
            Generate lectures
          </Button>

          <p className="text-12 text-muted">
            One row per weekly session per day of the term. Run it again after fixing a
            room or a time and the untouched lectures follow; anything you have already
            written on stays exactly as it is.
          </p>
        </form>
      </Card>
    </>
  );
}
