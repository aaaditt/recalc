import type { Metadata } from 'next';
import Link from 'next/link';

import { createBandAction, removeBandAction, updateBandAction } from './actions';
import { BandList } from '@/components/bands/band-list';
import { PageHeader } from '@/components/ui/page-header';
import { toBandViews } from '@/lib/bands';
import { colourForCourse, type CourseColour } from '@/lib/course-colours';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { ensureUniversityBand, getBands } from '@/modules/bands';
import { getCourses } from '@/modules/courses';

// The parts of the day, listed and administered.
//
// The 24-hour view on /calendar is where a band is looked at; this is where the
// frames are set. Two screens because they answer different questions — "what
// does today look like" and "what are the parts of my week" — and mixing them
// would make the calendar a settings page.

export const metadata: Metadata = { title: 'Bands · Recalc' };

export default async function BandsPage() {
  const found = await currentWorkspace();
  if (!found) return null;
  const { workspace } = found;

  const supabase = await createClient();

  // Idempotent, and the reason this screen is correct the first time it opens
  // on a workspace made after migration 019. See modules/bands/service.ts.
  await ensureUniversityBand(supabase, workspace.id);

  const [bandRows, courses] = await Promise.all([
    getBands(supabase, workspace.id),
    getCourses(supabase, workspace.id),
  ]);

  // Courses come back ordered by code, so one without a colour of its own gets
  // a stable one from the palette — the same rule the calendar uses.
  const look = new Map<string, { code: string; colour: CourseColour }>(
    courses.map((course, index) => [
      course.id,
      { code: course.code, colour: colourForCourse(course.colour, index) },
    ])
  );

  return (
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <PageHeader
        title="Bands"
        subtitle="The parts of your day, and what each one is for"
        actions={
          <>
            <Link
              href="/calendar?v=full"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              24-hour view
            </Link>
            <Link
              href="/timetable"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Timetable
            </Link>
          </>
        }
      />

      <BandList
        bands={toBandViews(bandRows, look)}
        createBand={createBandAction}
        updateBand={updateBandAction}
        removeBand={removeBandAction}
      />
    </div>
  );
}
