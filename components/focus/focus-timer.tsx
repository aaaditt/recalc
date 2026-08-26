'use client';

// The whole of /focus below the page header.
//
// 'use client' for one reason: a running clock. Everything the clock is used
// for — how long is left, has the block finished, how many minutes to log — is
// computed in lib/pomodoro from two instants, so the interval below only
// repaints digits. Kill it, freeze the tab, lock the phone: the answer when it
// comes back is still right.
//
// The timer itself lives in localStorage rather than in React state, so a
// refresh, an accidental back button or a second tab all find the same block
// still running.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  noClockOnTheServer,
  noTimerOnTheServer,
  readClock,
  readTimer,
  subscribeToClock,
  subscribeToTimer,
  writeTimer,
} from '@/components/focus/timer-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { courseRail, courseTint, type CourseColour } from '@/lib/course-colours';
import {
  FOCUS_MINUTES,
  formatRemaining,
  isComplete,
  isPaused,
  loggableSpan,
  pause,
  remainingMs,
  resume,
  start,
  type Timer,
} from '@/lib/pomodoro';
import { formatMinutes } from '@/lib/study';

export type FocusCourse = {
  id: string;
  code: string;
  name: string;
  colour: CourseColour;
};

export type FocusUnit = { id: string; courseId: string; title: string };

/** What the rating question offers. 1 · 2 · 3, per prompts/07-focus.md. */
const RATINGS = [
  { value: 1, label: 'Scattered' },
  { value: 2, label: 'OK' },
  { value: 3, label: 'Deep' },
] as const;

type LoggedSession = {
  id: string;
  minutes: number;
  courseId: string;
  unitId: string | null;
};

type FocusTimerProps = {
  courses: FocusCourse[];
  units: FocusUnit[];
  /** Writes the row. Returns the id so the rating can be attached to it. */
  log: (input: {
    courseId: string;
    unitId: string | null;
    startedAt: string;
    endedAt: string;
  }) => Promise<{ id: string; minutes: number }>;
  rate: (id: string, rating: number) => Promise<void>;
};

/** The uppercase mono label above a block of the card. */
function Label({ children }: { children: ReactNode }) {
  return <p className="font-mono text-label text-faint uppercase">{children}</p>;
}

export function FocusTimer({ courses, units, log, rate }: FocusTimerProps) {
  const timer = useSyncExternalStore(subscribeToTimer, readTimer, noTimerOnTheServer);
  const now = useSyncExternalStore(subscribeToClock, readClock, noClockOnTheServer);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [unitId, setUnitId] = useState('');
  const [logged, setLogged] = useState<LoggedSession | null>(null);
  const [rated, setRated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses]
  );
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const unitsForPicker = useMemo(
    () => units.filter((unit) => unit.courseId === courseId),
    [units, courseId]
  );

  // Before hydration `now` is null, so nothing that depends on the clock is
  // drawn and the server and the browser agree on the first frame.
  const running = timer !== null && now !== null;
  const finished = running && isComplete(timer, now);

  const save = useCallback(
    async (block: Timer, at: number) => {
      const span = loggableSpan(block, at);
      if (span === null) {
        // Less than a minute of a 25-minute block. Nothing worth a row.
        writeTimer(null);
        return;
      }

      try {
        const written = await log({
          courseId: block.courseId,
          unitId: block.unitId,
          startedAt: span.startedAt,
          endedAt: span.endedAt,
        });
        setLogged({
          id: written.id,
          minutes: written.minutes,
          courseId: block.courseId,
          unitId: block.unitId,
        });
        setRated(null);
        setError(null);
        writeTimer(null);
      } catch {
        setError('That did not save. The block is still here — try again.');
      }
    },
    [log]
  );

  // A finished focus block writes its row by itself, so a session survives
  // being finished on a phone that was locked and is now being looked at.
  // `save` is what clears the timer, so this cannot run twice for one block.
  useEffect(() => {
    if (!finished) return;

    const block = readTimer();
    if (block === null || block.phase !== 'focus') return;

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await save(block, Date.now());
    })();

    return () => {
      cancelled = true;
    };
  }, [finished, save]);

  function startFocus(what: { courseId: string; unitId: string | null }) {
    setLogged(null);
    setRated(null);
    setError(null);
    writeTimer(start('focus', Date.now(), what));
  }

  function startBreak() {
    setLogged(null);
    setRated(null);
    setError(null);
    writeTimer(start('break', Date.now(), { courseId: '', unitId: null }));
  }

  async function stop() {
    const block = readTimer();
    if (block === null) return;

    if (block.phase !== 'focus') {
      writeTimer(null);
      return;
    }

    setBusy(true);
    try {
      await save(block, Date.now());
    } finally {
      setBusy(false);
    }
  }

  async function answer(rating: number) {
    if (logged === null) return;
    setBusy(true);
    try {
      await rate(logged.id, rating);
      setRated(rating);
      setError(null);
    } catch {
      setError('That rating did not save. The minutes are still logged.');
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // A block is running (or paused, or finished and being written)
  // -------------------------------------------------------------------------

  if (running && timer.phase === 'focus') {
    const course = courseById.get(timer.courseId);
    const unit = timer.unitId ? unitById.get(timer.unitId) : undefined;
    const paused = isPaused(timer);

    return (
      <Card
        className="flex flex-col gap-4 p-4"
        style={
          course
            ? { ...courseRail(course.colour), ...courseTint(course.colour) }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-13 font-medium">{course?.code ?? '—'}</p>
            <p className="truncate text-14 text-muted">
              {unit ? unit.title : (course?.name ?? 'Unknown course')}
            </p>
          </div>
          {paused ? <Pill>Paused</Pill> : null}
        </div>

        <p aria-label="Time remaining" className="font-mono text-34 tabular-nums">
          {formatRemaining(remainingMs(timer, now))}
        </p>

        {finished ? (
          <p className="text-14 text-muted">
            {error ?? `Finished. Logging ${FOCUS_MINUTES} minutes…`}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() =>
                writeTimer(paused ? resume(timer, Date.now()) : pause(timer, Date.now()))
              }
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button onClick={stop} disabled={busy}>
              {busy ? 'Saving…' : 'Stop'}
            </Button>
          </div>
        )}

        {finished && error ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={stop} disabled={busy}>
              Try again
            </Button>
            <Button onClick={() => writeTimer(null)}>Discard</Button>
          </div>
        ) : null}
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // A break is running
  // -------------------------------------------------------------------------

  if (running && timer.phase === 'break') {
    return (
      <Card className="flex flex-col gap-4 p-4">
        <Label>Break</Label>

        {finished ? (
          <>
            <p className="text-16">Break over.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() =>
                  startFocus({ courseId, unitId: unitId === '' ? null : unitId })
                }
                disabled={courseId === ''}
              >
                Start another {FOCUS_MINUTES}
              </Button>
              <Button onClick={() => writeTimer(null)}>Done for now</Button>
            </div>
          </>
        ) : (
          <>
            <p aria-label="Time remaining" className="font-mono text-34 tabular-nums">
              {formatRemaining(remainingMs(timer, now))}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => writeTimer(null)}>Skip break</Button>
            </div>
          </>
        )}
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // A block was just logged: the one optional question
  // -------------------------------------------------------------------------

  if (logged !== null) {
    const course = courseById.get(logged.courseId);
    const unit = logged.unitId ? unitById.get(logged.unitId) : undefined;

    return (
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="ok">Logged</Pill>
          <p className="text-16">
            {formatMinutes(logged.minutes)} on{' '}
            <span className="font-mono text-14">{course?.code ?? '—'}</span>
            {unit ? ` · ${unit.title}` : ''}
          </p>
        </div>

        {rated === null ? (
          <div className="flex flex-col gap-2">
            <Label>How focused was that?</Label>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((rating) => (
                <Button
                  key={rating.value}
                  onClick={() => answer(rating.value)}
                  disabled={busy}
                >
                  {rating.value} · {rating.label}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setLogged(null)}>
                Skip
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-14 text-muted">
            Noted: {RATINGS.find((rating) => rating.value === rated)?.label}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={startBreak}>
            Take a 5-minute break
          </Button>
          <Button
            onClick={() =>
              startFocus({ courseId: logged.courseId, unitId: logged.unitId })
            }
          >
            Start another {FOCUS_MINUTES}
          </Button>
        </div>

        {error ? <p className="text-13 text-accent">{error}</p> : null}
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Nothing running: what are you working on?
  // -------------------------------------------------------------------------

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="What are you working on?" className="sm:flex-1">
          <Select
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              // The unit belonged to the course that was just replaced.
              setUnitId('');
            }}
          >
            <option value="">Pick a course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {course.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Syllabus unit"
          hint={
            unitsForPicker.length === 0 && courseId !== ''
              ? 'This course has no units yet.'
              : undefined
          }
          className="sm:flex-1"
        >
          <Select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            disabled={unitsForPicker.length === 0}
          >
            <option value="">No unit</option>
            {unitsForPicker.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={courseId === ''}
          onClick={() => startFocus({ courseId, unitId: unitId === '' ? null : unitId })}
        >
          Start {FOCUS_MINUTES} minutes
        </Button>
        <p className="text-12 text-muted">
          The timer runs on the clock, so it keeps going if you lock your phone.
        </p>
      </div>

      {error ? <p className="text-13 text-accent">{error}</p> : null}
    </Card>
  );
}
