import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { addSlotAction, removeSlotAction, updateSlotAction } from '../actions';
import { BandGrid } from '@/components/bands/band-grid';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { bandRangeLabel, toBandViews, weekdaysLabel } from '@/lib/bands';
import { colourForCourse, type CourseColour } from '@/lib/course-colours';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getBand } from '@/modules/bands';
import { getCourses } from '@/modules/courses';

// One band, opened: its own days across the top, its own hours down the side.
//
// The university band does not get a grid here and that is the whole point of
// the feature. Its inside is `sessions`, which /timetable already draws and
// already edits, so this page sends you there rather than offering a second
// place to type a class into. One class, one home.

export const metadata: Metadata = { title: 'Band · Recalc' };

export default async function BandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const found = await currentWorkspace();
  if (!found) return null;
  const { workspace } = found;

  const supabase = await createClient();

  const [band, courses] = await Promise.all([
    getBand(supabase, workspace.id, id),
    getCourses(supabase, workspace.id),
  ]);

  if (!band) notFound();

  const look = new Map<string, { code: string; colour: CourseColour }>(
    courses.map((course, index) => [
      course.id,
      { code: course.code, colour: colourForCourse(course.colour, index) },
    ])
  );

  const [view] = toBandViews([band], look);

  const courseOptions = courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
  }));

  return (
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <PageHeader
        title={view.name}
        subtitle={`${bandRangeLabel(view)} · ${weekdaysLabel(view.weekdays)}`}
        actions={
          <>
            <Link
              href="/bands"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              All bands
            </Link>
            <Link
              href="/calendar?v=full"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              24-hour view
            </Link>
          </>
        }
      />

      {view.kind === 'university' ? (
        <Card>
          <EmptyState
            title="This band is your timetable"
            description="It has no slots of its own — what is inside it are your actual classes, so there is one place a class lives and one place to change it."
            action={
              <Link
                href="/timetable"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Open the timetable
              </Link>
            }
          />
        </Card>
      ) : (
        <BandGrid
          band={view}
          courses={courseOptions}
          addSlot={addSlotAction.bind(null, view.id)}
          updateSlot={updateSlotAction}
          removeSlot={removeSlotAction}
        />
      )}
    </div>
  );
}
