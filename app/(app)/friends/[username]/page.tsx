import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompareGrid } from '@/components/timetable/compare-grid';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse } from '@/lib/course-colours';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { FriendBlock, TimetableClass } from '@/lib/timetable';
import { SHARE_LEVELS, getFriendWeek, type FriendClass } from '@/modules/friends';
import { getTimetable } from '@/modules/timetable';

// One friend's week, beside yours — slice 23.
//
// In the wide route group rather than the narrow one, for the same reason
// /timetable is: five day columns need the room.
//
// Everything on this page about the other person comes from `friend_timetable`,
// a `security definer` function that checks for an accepted friendship and reads
// the visibility column *for the correct direction* — what they share with you,
// never what you share with them. `sessions_select` was deliberately not
// widened: `sessions` reaches a workspace only through `courses`, so that policy
// is already two joins deep, and a mistake in a four-table policy does not fail
// loudly — it returns somebody else's rows. See migration 018.
//
// The question this screen answers is "when are we both free", so that is what
// it draws. Their classes are grey on purpose: they are somebody else's, and
// they should not look like yours.

export const metadata = { title: 'Compare · Recalc' };

export default async function ComparePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const found = await currentWorkspace();
  if (!found) return null;

  const supabase = await createClient();
  const week = await getFriendWeek(supabase, username);

  // Not a friend, or only asked. A 404 rather than "you are not friends with
  // this person", because the second sentence confirms that the person exists.
  if (!week) notFound();

  const { friendship, classes } = week;
  const { periods, courses, sessions } = await getTimetable(supabase, found.workspace.id);

  const look = new Map(
    courses.map((course, index) => [
      course.id,
      {
        code: course.code,
        name: course.name,
        colour: colourForCourse(course.colour, index),
      },
    ])
  );

  const mine: TimetableClass[] = sessions.map((session) => {
    const course = look.get(session.course_id);
    return {
      sessionId: session.id,
      courseId: session.course_id,
      code: course?.code ?? '—',
      name: course?.name ?? 'Unknown course',
      colour: course?.colour ?? 'indigo',
      room: session.room,
      isLab: session.is_lab,
      weekday: session.weekday,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      periodId: session.period_id,
    };
  });

  const theirs: FriendBlock[] = classes.map((item: FriendClass) => ({
    weekday: item.weekday,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    code: item.course_code,
    room: item.room,
  }));

  const name = friendship.other_display_name ?? `@${friendship.other_username}`;
  const level = SHARE_LEVELS.find((one) => one.value === friendship.they_share);

  return (
    <div className="mx-auto w-full max-w-(--page-width-wide)">
      <PageHeader
        title={name}
        subtitle={
          friendship.they_share === 'none'
            ? `${name} is not sharing their timetable with you.`
            : `Your week and ${name}'s, together.`
        }
        actions={
          <>
            <Link
              href="/friends"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Friends
            </Link>
            <Link
              href="/timetable"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Your timetable
            </Link>
          </>
        }
      />

      {friendship.they_share === 'none' ? (
        <Card>
          <EmptyState
            title="Nothing to compare"
            description={`${name} has chosen not to share their week. That is their decision and it is separate from yours — what you show them is unchanged, and they have not been told you looked.`}
            action={
              <Link
                href="/friends"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Back to friends
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <CompareGrid
            periods={periods.map((period) => ({
              id: period.id,
              label: period.label,
              startsAt: period.starts_at,
              endsAt: period.ends_at,
            }))}
            mine={mine}
            theirs={theirs}
            friendName={name}
            detailed={friendship.they_share === 'full'}
          />

          <p className="mt-3 text-12 text-muted">
            {name} shares <span className="text-ink">{level?.label.toLowerCase()}</span> with
            you — {level?.detail.replace('They see', 'you see').toLowerCase()} What{' '}
            <em>you</em> share with {name} is a separate choice, on{' '}
            <Link href="/friends" className="underline underline-offset-4">
              the friends page
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
