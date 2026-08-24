/**
 * seed-check — print what the database thinks today and the next seven days
 * look like. This is how the semester data gets verified before any UI exists.
 *
 *   npx tsx scripts/seed-check.ts
 *
 * Optional flags:
 *   --tz=Asia/Dubai         which timezone to read the timetable in
 *   --date=2026-10-06       pretend today is this date
 *   --generate=2026-09-01..2026-12-19
 *                           expand the weekly pattern into dated lectures for
 *                           that term first (idempotent — safe to re-run)
 *   --term="Fall 2026"      limit --generate to one term's courses
 *
 * It talks to the real project with the service-role key, so it builds its own
 * client rather than importing lib/supabase/admin.ts, which is server-only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  generateMeetings,
  getCourses,
  getMeetingsBetween,
  getMeetingsOnDate,
  type ClassMeeting,
  type Course,
} from '@/modules/courses';
import { getTasksDueBetween, type Task } from '@/modules/tasks';
import { ensureWorkspace } from '@/modules/workspaces';
import { localDateKey, localTimeLabel, localTimeZone, shiftDate, todayIn } from '@/lib/time';

function flag(name: string): string | undefined {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

function loadEnvLocal(): void {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Already in the environment, or genuinely missing — reported below.
  }
}

async function resolveWorkspaceId(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 2 });
  if (error) throw new Error(`could not list users: ${error.message}`);
  const users = data.users;
  if (users.length === 0) {
    throw new Error('No user exists yet. Sign in to the app once, then re-run.');
  }
  if (users.length > 1) {
    console.log(`(${users.length} users found — using the first, ${users[0].email})`);
  }
  return (await ensureWorkspace(db, users[0].id)).id;
}

function courseLabel(courses: Course[], courseId: string): string {
  const course = courses.find((c) => c.id === courseId);
  return course ? `${course.code} ${course.name}` : '(unknown course)';
}

function meetingLine(m: ClassMeeting, courses: Course[], tz: string): string {
  const time = `${localTimeLabel(new Date(m.starts_at), tz)}-${localTimeLabel(new Date(m.ends_at), tz)}`;
  const room = m.room ? ` · ${m.room}` : '';
  const topic = m.topic ? ` · ${m.topic}` : '';
  const status = m.status === 'scheduled' ? '' : ` [${m.status}]`;
  const note = m.note_block_id ? ' · has notes' : '';
  return `  ${time}  ${courseLabel(courses, m.course_id)}${room}${topic}${status}${note}`;
}

function taskLine(t: Task, courses: Course[], tz: string): string {
  const due = t.due_at
    ? `${localDateKey(new Date(t.due_at), tz)} ${localTimeLabel(new Date(t.due_at), tz)}`
    : 'no due date';
  const course = t.course_id ? ` · ${courseLabel(courses, t.course_id).split(' ')[0]}` : '';
  return `  ${due}  [${t.status}] ${t.title}${course}`;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Put them in .env.local — see SETUP.md.'
    );
  }

  const tz = flag('tz') ?? localTimeZone();
  const today = flag('date') ?? todayIn(tz);
  const weekEnd = shiftDate(today, 7);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const workspaceId = await resolveWorkspaceId(db);

  console.log(`\nWorkspace ${workspaceId}`);
  console.log(`Timezone  ${tz}`);
  console.log(`Today     ${today}\n`);

  const generate = flag('generate');
  if (generate) {
    const [termStart, termEnd] = generate.split('..');
    if (!termStart || !termEnd) {
      throw new Error('--generate expects YYYY-MM-DD..YYYY-MM-DD');
    }
    const result = await generateMeetings(db, {
      workspaceId,
      termStart,
      termEnd,
      timeZone: tz,
      term: flag('term'),
    });
    console.log(
      `Generated meetings for ${termStart}..${termEnd}: ` +
        `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.\n`
    );
  }

  const courses = await getCourses(db, workspaceId);
  console.log(`COURSES (${courses.length})`);
  if (courses.length === 0) {
    console.log('  none yet — follow docs/SEEDING.md');
  }
  for (const c of courses) {
    const bits = [c.term, c.instructor, c.credits === null ? null : `${c.credits} credits`]
      .filter(Boolean)
      .join(' · ');
    console.log(`  ${c.code.padEnd(8)} ${c.name}${bits ? `  (${bits})` : ''}`);
  }

  const todaysClasses = await getMeetingsOnDate(db, workspaceId, today, tz);
  console.log(`\nCLASSES TODAY (${today}) — ${todaysClasses.length}`);
  if (todaysClasses.length === 0) console.log('  nothing scheduled');
  for (const m of todaysClasses) console.log(meetingLine(m, courses, tz));

  const upcoming = await getMeetingsBetween(db, workspaceId, today, weekEnd, tz);
  console.log(`\nNEXT SEVEN DAYS — CLASSES (${upcoming.length})`);
  if (upcoming.length === 0) console.log('  nothing scheduled');
  let currentDay = '';
  for (const m of upcoming) {
    const day = localDateKey(new Date(m.starts_at), tz);
    if (day !== currentDay) {
      currentDay = day;
      console.log(`\n ${day}`);
    }
    console.log(meetingLine(m, courses, tz));
  }

  const tasks = await getTasksDueBetween(db, workspaceId, today, weekEnd, tz);
  console.log(`\n\nNEXT SEVEN DAYS — TASKS DUE (${tasks.length})`);
  if (tasks.length === 0) console.log('  nothing due');
  for (const t of tasks) console.log(taskLine(t, courses, tz));

  console.log('');
}

main().catch((err: unknown) => {
  console.error(`\nseed-check failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
