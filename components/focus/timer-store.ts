// The two outside systems the focus screen depends on: the browser's storage,
// and the clock.
//
// Both are read through `useSyncExternalStore`, which is what it is for — and
// which solves the hydration problem for free. The server snapshot of each is
// null, so the HTML contains no timer and no time, and React swaps in the real
// ones after hydrating with nothing to warn about. Slice 04's now-line uses the
// same shape.
//
// Nothing here is React. Nothing here talks to the database.

import type { Timer } from '@/lib/pomodoro';

/** Bump the suffix if the stored shape ever changes; an old record is ignored. */
const KEY = 'recalc.focus.v1';

// ---------------------------------------------------------------------------
// The stored timer
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

// A private window can throw on every localStorage access. When it does, the
// timer keeps working for this tab — it just will not survive a refresh, which
// is a better outcome than the screen breaking.
let fallbackRaw: string | null = null;
let storageBroken = false;

function readRaw(): string | null {
  if (storageBroken) return fallbackRaw;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    storageBroken = true;
    return fallbackRaw;
  }
}

function writeRaw(raw: string | null): void {
  fallbackRaw = raw;
  if (storageBroken) return;
  try {
    if (raw === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, raw);
  } catch {
    storageBroken = true;
  }
}

function parse(raw: string | null): Timer | null {
  if (raw === null) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const phase = record.phase;
    const startedAt = record.startedAt;
    const pausedAt = record.pausedAt;
    const pausedMs = record.pausedMs;
    const courseId = record.courseId;
    const unitId = record.unitId;

    if (phase !== 'focus' && phase !== 'break') return null;
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
    if (typeof pausedMs !== 'number' || !Number.isFinite(pausedMs)) return null;
    if (pausedAt !== null && typeof pausedAt !== 'number') return null;
    if (typeof courseId !== 'string') return null;
    if (unitId !== null && typeof unitId !== 'string') return null;

    return { phase, courseId, unitId, startedAt, pausedAt, pausedMs };
  } catch {
    return null;
  }
}

// getSnapshot must return the same object while nothing has changed, or React
// re-renders forever. The raw string is the thing that changes, so it is what
// the cache is keyed on.
let cachedRaw: string | null = null;
let cached: Timer | null = null;

export function readTimer(): Timer | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

/** No storage on the server, so no timer in the HTML. */
export function noTimerOnTheServer(): null {
  return null;
}

export function writeTimer(timer: Timer | null): void {
  writeRaw(timer === null ? null : JSON.stringify(timer));
  for (const listener of listeners) listener();
}

export function subscribeToTimer(onChange: () => void): () => void {
  listeners.add(onChange);

  // Another tab stopping the timer should stop it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) onChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

// ---------------------------------------------------------------------------
// The clock
//
// This ticks only to repaint the digits. It is never the source of truth for
// how much time has passed — lib/pomodoro works that out from the instants —
// so a tick that is late, or never arrives because the phone was asleep,
// cannot make the timer wrong.
// ---------------------------------------------------------------------------

const TICK_MS = 1_000;

let clockMs = Date.now();

export function readClock(): number {
  return clockMs;
}

export function noClockOnTheServer(): null {
  return null;
}

export function subscribeToClock(onChange: () => void): () => void {
  clockMs = Date.now();
  onChange();

  const tick = setInterval(() => {
    clockMs = Date.now();
    onChange();
  }, TICK_MS);

  // Coming back from a locked phone: repaint immediately rather than waiting
  // up to a second to discover the block finished twenty minutes ago.
  const onVisible = () => {
    clockMs = Date.now();
    onChange();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
