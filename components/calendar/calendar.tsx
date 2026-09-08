'use client';

// The calendar's one interactive shell.
//
// Everything below it — the week grid, the day view, the month view, the
// blocks and the chips — is presentational and takes props. This file owns the
// three pieces of state that make the screen a calendar rather than a picture:
// where the cursor is, which view is showing, and what has just been edited.
//
// Why one client component rather than a server component per view:
// docs/DESIGN.md says "changing week or day must never show a loading state".
// The page hands down a wide window of meetings — ten weeks either side of the
// cursor — so moving through the term is instant, with no round trip and
// nothing to prefetch. Stepping outside that window is the only thing that
// asks the server for more, and it keeps the current screen on until the
// answer arrives.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { AddClassSheet, type CourseOption } from '@/components/calendar/add-class-sheet';
import { BandZoom } from '@/components/calendar/band-zoom';
import { CalendarToolbar } from '@/components/calendar/calendar-toolbar';
import { DayView } from '@/components/calendar/day-view';
import { FullDayView, type BandDraft } from '@/components/calendar/full-day-view';
import {
  BandSheet,
  type BandFormValues,
  type OpenBand,
} from '@/components/bands/band-sheet';
import { MeetingSheet } from '@/components/calendar/meeting-sheet';
import { MonthView } from '@/components/calendar/month-view';
import { WeekGrid } from '@/components/calendar/week-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  croppedHours,
  dayTitle,
  groupByDate,
  monthTitle,
  visibleDates,
  weekDates,
  weekTitle,
  type CalendarDeadline,
  type CalendarMeeting,
  type CalendarView,
  type CalendarViewChoice,
} from '@/lib/calendar';
import type { BandView } from '@/lib/bands';
import type { SaveResult } from '@/lib/timetable';
import { shiftDate, weekdayOf, type CalendarDate } from '@/lib/time';

/** The now-line has to be right to the minute; this checks twice as often. */
const NOW_TICK_MS = 30_000;

// The clock, as an external store rather than a piece of React state.
//
// A clock genuinely is an outside system, and subscribing to one is what
// useSyncExternalStore is for. It also solves the hydration problem for free:
// the server snapshot is null — no now-line in the HTML — and React swaps in
// the real time after hydrating, with no mismatch and nothing to warn about.
let clockMs = Date.now();

function subscribeToClock(onChange: () => void): () => void {
  clockMs = Date.now();
  onChange();

  const timer = setInterval(() => {
    clockMs = Date.now();
    onChange();
  }, NOW_TICK_MS);

  return () => clearInterval(timer);
}

const readClock = () => clockMs;
const noClockOnTheServer = () => null;

/** How far a finger has to travel sideways to count as a swipe. */
const SWIPE_PX = 48;

type OneOffInput = {
  courseId: string;
  date: CalendarDate;
  startsAt: string;
  endsAt: string;
  room: string;
};

type CalendarProps = {
  today: CalendarDate;
  timeZone: string;
  initialDate: CalendarDate;
  initialView: CalendarViewChoice;
  /** The days the server actually fetched. Outside it, we have to ask again. */
  windowFrom: CalendarDate;
  windowTo: CalendarDate;
  meetings: CalendarMeeting[];
  deadlines: CalendarDeadline[];
  courses: CourseOption[];
  /** The parts of the day. Slice 25 — see lib/bands.ts. */
  bands: BandView[];
  /** '?band=' — which band is open, so a zoomed view survives a refresh. */
  initialBandId: string | null;
  reschedule: (id: string, startsAt: string, endsAt: string) => Promise<void>;
  setCancelled: (id: string, cancelled: boolean) => Promise<void>;
  addOneOff: (input: OneOffInput) => Promise<void>;
  createBand: (values: BandFormValues) => Promise<SaveResult>;
  updateBand: (bandId: string, values: BandFormValues) => Promise<SaveResult>;
  removeBand: (bandId: string) => Promise<SaveResult>;
};

export function Calendar(props: CalendarProps) {
  const { today, timeZone, windowFrom, windowTo } = props;
  const router = useRouter();

  const [cursor, setCursor] = useState<CalendarDate>(props.initialDate);
  const [view, setView] = useState<CalendarViewChoice>(props.initialView);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Which band is zoomed, and which one is being edited in the sheet. Two
  // separate things: you can open the Evening band's day and, from /bands,
  // still be editing its frame.
  const [bandId, setBandId] = useState<string | null>(props.initialBandId);
  const [bandForm, setBandForm] = useState<OpenBand | null>(null);
  const [pending, startTransition] = useTransition();

  // Null while the server renders, so the HTML carries no now-line.
  const clock = useSyncExternalStore(subscribeToClock, readClock, noClockOnTheServer);
  const now = clock === null ? null : new Date(clock);

  // What has been dragged or cancelled but not yet come back from the server.
  // Dropped the moment the action settles — by then the fresh row is already
  // in props — so this is never a second copy of the truth for longer than one
  // round trip.
  const [edits, setEdits] = useState<Record<string, Partial<CalendarMeeting>>>({});

  const meetings = useMemo(
    () =>
      props.meetings.map((meeting) =>
        edits[meeting.id] ? { ...meeting, ...edits[meeting.id] } : meeting
      ),
    [props.meetings, edits]
  );

  const meetingsByDate = useMemo(
    () => groupByDate(meetings, (meeting) => meeting.startsAt, timeZone),
    [meetings, timeZone]
  );
  const deadlinesByDate = useMemo(
    () => groupByDate(props.deadlines, (deadline) => deadline.dueAt, timeZone),
    [props.deadlines, timeZone]
  );

  const week = weekDates(cursor);
  const weekColumns = visibleDates(week, meetingsByDate);

  // Only the days on screen can stretch the range, so the cropping is fed
  // those days' meetings rather than the whole twenty-week window.
  const weekHours = croppedHours(
    weekColumns.flatMap((date) => meetingsByDate.get(date) ?? []),
    weekColumns,
    timeZone
  );
  const dayHours = croppedHours(meetingsByDate.get(cursor) ?? [], [cursor], timeZone);

  const openMeeting = meetings.find((meeting) => meeting.id === openId) ?? null;

  // Which view is actually on screen. In 'auto' that is a CSS question, so it
  // is answered by asking the CSS: the week wrapper is `hidden md:block`, and
  // a hidden element has no offsetParent. Only ever called from an event
  // handler, never during render, so there is nothing here to hydrate wrong.
  const weekRef = useRef<HTMLDivElement>(null);

  function shownView(): CalendarView {
    if (view !== 'auto') return view;
    return weekRef.current?.offsetParent ? 'week' : 'day';
  }

  function step(direction: -1 | 1) {
    const stepping = shownView();

    // The 24-hour view is a day at a time, so it steps like one.
    if (stepping === 'day' || stepping === 'full') {
      setCursor(shiftDate(cursor, direction));
    } else if (stepping === 'week') {
      setCursor(shiftDate(cursor, direction * 7));
    } else {
      const [year, month] = cursor.split('-').map(Number);
      const moved = new Date(Date.UTC(year, month - 1 + direction, 1));
      setCursor(moved.toISOString().slice(0, 10));
    }
  }

  // ---- keyboard -----------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = event.key.toLowerCase();

      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else if (key === 't') setCursor(today);
      else if (key === 'w') setView('week');
      else if (key === 'd') setView('day');
      else if (key === 'm') setView('month');
      else if (key === 'f') setView('full');
      else return;

      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // No dependency array on purpose: the handler closes over the cursor and
    // the view, and re-binding one listener per render is cheaper to reason
    // about than a stale arrow key.
  });

  // ---- the URL ------------------------------------------------------------
  //
  // Inside the loaded window a plain replaceState is enough: it keeps a
  // refresh on the same day without asking the server for anything. Outside
  // it, the server has to fetch a new window, and the current screen stays up
  // while it does.

  useEffect(() => {
    // The zoomed band is in the URL so it is linkable and so Back leaves it.
    const url =
      `/calendar?d=${cursor}&v=${view}` + (bandId ? `&band=${bandId}` : '');
    if (cursor < windowFrom || cursor > windowTo) router.replace(url);
    else window.history.replaceState(null, '', url);
  }, [cursor, view, bandId, windowFrom, windowTo, router]);

  // ---- swipe --------------------------------------------------------------

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function onSwipeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }

  function onSwipeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const from = swipeStart.current;
    swipeStart.current = null;
    if (!from) return;

    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return;
    step(dx > 0 ? -1 : 1);
  }

  // ---- edits --------------------------------------------------------------

  function applyEdit(id: string, patch: Partial<CalendarMeeting>, run: () => Promise<void>) {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

    startTransition(async () => {
      try {
        await run();
      } catch {
        // The server said no. Nothing to do but stop pretending — the drop
        // below puts the real row back on screen.
      } finally {
        // The action revalidated /calendar, so by the time it resolves the
        // fresh row is already in props. Whether it agreed or not, the
        // optimistic copy has done its job and has to go.
        setEdits((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    });
  }

  function onReschedule(id: string, startsAt: string, endsAt: string) {
    applyEdit(id, { startsAt, endsAt }, () => props.reschedule(id, startsAt, endsAt));
  }

  function onSetCancelled(id: string, cancelled: boolean) {
    applyEdit(id, { cancelled }, () => props.setCancelled(id, cancelled));
  }

  // ---- bands --------------------------------------------------------------

  // A band that does not run on the day now on screen is not zoomed into an
  // empty grid — the day view comes back. `bandId` is kept, so stepping back to
  // a day it does run reopens it, which is what stepping through a week while
  // reading one band should feel like.
  const open = bandId ? (props.bands.find((band) => band.id === bandId) ?? null) : null;
  const zoomed = open && open.weekdays.includes(weekdayOf(cursor)) ? open : null;

  /** A finished drag, or the "New band" button. Both open the same empty form. */
  function openNewBand(draft?: BandDraft) {
    setBandForm({
      id: null,
      kind: 'custom',
      values: {
        name: '',
        startsAt: draft?.startsAt ?? '18:00',
        endsAt: draft?.endsAt ?? '21:00',
        // A band drawn on a Tuesday is a Tuesday band until more days are
        // ticked. Guessing Mon-Fri from one gesture has to be undone.
        weekdays: draft ? [draft.weekday] : [],
      },
    });
  }

  function saveBand(values: BandFormValues): Promise<SaveResult> {
    const editing = bandForm?.id ?? null;
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(editing ? await props.updateBand(editing, values) : await props.createBand(values));
      });
    });
  }

  function deleteBand(): Promise<SaveResult> {
    const editing = bandForm?.id;
    if (!editing) return Promise.resolve({ ok: true });
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await props.removeBand(editing);
        // A deleted band cannot stay zoomed. Nothing inside it moved — the
        // frame is all that went.
        if (result.ok && bandId === editing) setBandId(null);
        resolve(result);
      });
    });
  }

  function onCreate(input: OneOffInput) {
    startTransition(async () => {
      await props.addOneOff(input);
      setAdding(false);
    });
  }

  // ---- markup -------------------------------------------------------------

  // In 'auto' the subtitle is a question about the viewport, exactly like the
  // highlighted tab, so it is answered the same way: both are rendered and CSS
  // shows the one that matches what is actually on screen.
  const subtitle =
    view === 'auto' ? (
      <>
        <span className="md:hidden">{dayTitle(cursor)}</span>
        <span className="hidden md:inline">{weekTitle(week)}</span>
      </>
    ) : view === 'day' || view === 'full' ? (
      dayTitle(cursor)
    ) : view === 'month' ? (
      monthTitle(cursor)
    ) : (
      weekTitle(week)
    );

  // Twenty weeks either side of the cursor and not one lecture: the term has
  // not been expanded yet. A merely empty week still gets the grid.
  const nothingYet = meetings.length === 0;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={subtitle}
        actions={
          <>
            {/* The bottom nav is full at five columns (docs/DECISIONS.md), so
                /courses is reached from here, exactly as /settings/semester is. */}
            <Link
              href="/timetable"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Timetable
            </Link>
            <Link
              href="/bands"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Bands
            </Link>
            <Link
              href="/courses"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Courses
            </Link>
            <Link
              href="/settings/semester"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Semester
            </Link>
            <Link
              href="/settings/drive"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Drive
            </Link>
          </>
        }
      />

      <CalendarToolbar
        view={view}
        onView={(next) => {
          // Leaving the 24-hour view closes whatever was zoomed inside it.
          if (next !== 'full') setBandId(null);
          setView(next);
        }}
        onStep={step}
        onToday={() => setCursor(today)}
        onAdd={() => (view === 'full' ? openNewBand() : setAdding(true))}
        addLabel={view === 'full' ? 'New band' : 'Add class'}
      />

      {/* The 24-hour view has something to say with no lectures at all: the
          empty hours are its content, and bands live there whether or not the
          term has been expanded. Every other view gets the empty state. */}
      {nothingYet && view !== 'full' ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            title="No lectures yet"
            description={
              props.courses.length === 0
                ? 'Draw your week on the timetable first — click a cell, name the course, done.'
                : 'Your timetable is here but the term has not been expanded into lectures yet.'
            }
            action={
              props.courses.length === 0 ? (
                <Link
                  href="/timetable"
                  className="text-13 text-muted underline underline-offset-4 hover:text-ink"
                >
                  Fill in your timetable
                </Link>
              ) : (
                <Link
                  href="/settings/semester"
                  className="text-13 text-muted underline underline-offset-4 hover:text-ink"
                >
                  Generate this term&rsquo;s lectures
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div onPointerDown={onSwipeStart} onPointerUp={onSwipeEnd}>
          {/* Before a view has been chosen, both are rendered and CSS picks:
              week on a laptop, day on a phone. After it, only one exists. */}
          {view === 'week' || view === 'auto' ? (
            <div ref={weekRef} className={view === 'auto' ? 'hidden md:block' : undefined}>
              <WeekGrid
                dates={weekColumns}
                today={today}
                timeZone={timeZone}
                hours={weekHours}
                meetingsByDate={meetingsByDate}
                deadlinesByDate={deadlinesByDate}
                now={now}
                onOpen={(meeting) => setOpenId(meeting.id)}
                onReschedule={onReschedule}
              />
            </div>
          ) : null}

          {view === 'day' || view === 'auto' ? (
            <div className={view === 'auto' ? 'md:hidden' : undefined}>
              <DayView
                date={cursor}
                weekDates={week}
                today={today}
                timeZone={timeZone}
                hours={dayHours}
                meetingsByDate={meetingsByDate}
                deadlinesByDate={deadlinesByDate}
                now={now}
                onSelect={setCursor}
                onOpen={(meeting) => setOpenId(meeting.id)}
              />
            </div>
          ) : null}

          {view === 'full' ? (
            zoomed ? (
              <BandZoom
                band={zoomed}
                date={cursor}
                today={today}
                timeZone={timeZone}
                meetings={meetingsByDate.get(cursor) ?? []}
                now={now}
                onClose={() => setBandId(null)}
                onOpenMeeting={(meeting) => setOpenId(meeting.id)}
                editHref={zoomed.kind === 'university' ? '/timetable' : `/bands/${zoomed.id}`}
              />
            ) : (
              <FullDayView
                date={cursor}
                weekDates={week}
                today={today}
                timeZone={timeZone}
                bands={props.bands}
                meetingsByDate={meetingsByDate}
                deadlinesByDate={deadlinesByDate}
                now={now}
                onSelect={setCursor}
                onOpenBand={setBandId}
                onOpenMeeting={(meeting) => setOpenId(meeting.id)}
                onDraft={openNewBand}
              />
            )
          ) : null}

          {view === 'month' ? (
            <MonthView
              anchor={cursor}
              today={today}
              meetingsByDate={meetingsByDate}
              deadlinesByDate={deadlinesByDate}
              onSelect={(date) => {
                setCursor(date);
                setView('day');
              }}
            />
          ) : null}
        </div>
      )}

      <MeetingSheet
        meeting={openMeeting}
        timeZone={timeZone}
        busy={pending}
        onClose={() => setOpenId(null)}
        onSetCancelled={onSetCancelled}
      />

      <BandSheet
        // A fresh form per band, exactly as the timetable's class sheet does:
        // carrying the last band's times into the next one is a bug.
        key={bandForm ? (bandForm.id ?? 'new') : 'closed'}
        open={bandForm}
        busy={pending}
        onClose={() => setBandForm(null)}
        onSave={saveBand}
        onDelete={bandForm?.id ? deleteBand : undefined}
      />

      <AddClassSheet
        open={adding}
        date={cursor}
        courses={props.courses}
        busy={pending}
        onClose={() => setAdding(false)}
        onCreate={onCreate}
      />
    </>
  );
}
