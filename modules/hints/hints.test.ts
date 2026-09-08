import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { HINTS, dismissHint, hintFor, restoreHint, visibleHints } from '@/modules/hints';
import { SETUP_NOTICE } from '@/modules/onboarding';
import { getDismissedNotices, setDismissed } from '@/modules/profiles';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test for slice 21.
//
// A hint has to be right about two things and it has no second chance at either:
// it must not appear before its feature is worth knowing about, and it must
// never appear again once it has been waved away. The first is annoying to get
// wrong; the second is the difference between a helpful app and one that nags.
//
// The whole decision is a pure function of facts the screen already had, which is
// what makes the first half testable here with no database and no browser — and,
// more importantly, is what stops six hints across six screens becoming six round
// trips at ~606ms each. Slice 19 spent a session removing four of those; this
// slice is the obvious place to put them back, so it deliberately cannot.
//
// The second half — dismissal — is the only part that touches the database, so
// only that part uses one.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'hints.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

const NONE = {} as const;

describe('a hint waits until its feature is worth knowing about', () => {
  it('says nothing on a brand new account, anywhere', () => {
    // The state every account starts in: no notes, nothing stale, no courses.
    // This is the case that matters most, because it is the one a hint system
    // gets wrong by being enthusiastic.
    expect(visibleHints({}, NONE)).toEqual([]);

    expect(hintFor('shell', { staleCount: 0 }, NONE)).toBeNull();
    expect(hintFor('notes', { notes: 0 }, NONE)).toBeNull();
    expect(hintFor('note', { noteHasBody: false }, NONE)).toBeNull();
    expect(hintFor('course', { syllabusUnits: 0 }, NONE)).toBeNull();
    expect(hintFor('tasks', { courses: 0 }, NONE)).toBeNull();
  });

  it('says nothing when the screen knows nothing', () => {
    // A screen that passes no facts gets no hint rather than an error. A hint is
    // the least important thing on any page it appears on, and it should behave
    // that way when something upstream has gone wrong.
    for (const hint of HINTS) {
      expect(hintFor(hint.place, {}, NONE)).toBeNull();
    }
  });

  it('explains /review the moment anything is out of date', () => {
    // The one that matters. The nav has carried a number since slice 11 and has
    // never said what it means.
    expect(hintFor('shell', { staleCount: 0 }, NONE)).toBeNull();

    const hint = hintFor('shell', { staleCount: 1 }, NONE);
    expect(hint?.id).toBe('review');
    expect(hint?.href).toBe('/review');
  });

  it('offers search once the note list is longer than it is worth scrolling', () => {
    expect(hintFor('notes', { notes: 4 }, NONE)).toBeNull();
    expect(hintFor('notes', { notes: 5 }, NONE)?.id).toBe('search');
    expect(hintFor('notes', { notes: 40 }, NONE)?.id).toBe('search');
  });

  it('offers questions on a note with something written in it', () => {
    expect(hintFor('note', { noteHasBody: false }, NONE)).toBeNull();
    expect(hintFor('note', { noteHasBody: true }, NONE)?.id).toBe('questions');
  });

  it('offers focus once a syllabus has units to log against', () => {
    // A focus timer with nothing to attach the minutes to is a stopwatch, and
    // the app does not need to recommend one of those.
    expect(hintFor('course', { syllabusUnits: 0 }, NONE)).toBeNull();
    expect(hintFor('course', { syllabusUnits: 1 }, NONE)?.id).toBe('focus');
  });

  it('offers the deadline shorthand once there is a course code to recognise', () => {
    expect(hintFor('tasks', { courses: 0 }, NONE)).toBeNull();
    expect(hintFor('tasks', { courses: 1 }, NONE)?.id).toBe('tasks');
  });

  it('never links anywhere that is not a route', () => {
    // `/questions` has an actions.ts and no page.tsx — it has never been a
    // route, and a hint is exactly the kind of thing that ships a dead link
    // because nobody clicks it in review. These are the routes that exist.
    const ROUTES = new Set(['/review', '/search', '/focus', '/tasks', '/notes', '/today']);

    for (const hint of HINTS) {
      if (hint.href === undefined) continue;
      expect(ROUTES.has(hint.href)).toBe(true);
    }
  });

  it('offers no link on a screen it is already describing', () => {
    // Two of the five have nowhere to send anybody: the questions hint sits on
    // the note where the questions are, and the shorthand hint sits above the
    // box it describes.
    const byId = new Map(HINTS.map((hint) => [hint.id, hint]));
    expect(byId.get('questions')?.href).toBeUndefined();
    expect(byId.get('tasks')?.href).toBeUndefined();
  });

  it('never puts two hints on one screen', () => {
    // Two things asking for attention is nothing asking for attention, and
    // /today already has the setup line on it.
    const places = HINTS.map((hint) => hint.place);
    expect(new Set(places).size).toBe(places.length);
  });

  it('hands the component no way to decide for itself', () => {
    // `useful` is a predicate over data the page holds; a component that could
    // call it is a component that could disagree with this module.
    const hint = hintFor('shell', { staleCount: 3 }, NONE);
    expect(hint).not.toBeNull();
    expect(hint && 'useful' in hint).toBe(false);
  });
});

describe('a dismissed hint is gone', () => {
  it('stays gone even while its feature is more useful than ever', () => {
    const dismissed = { review: '2026-09-08T12:00:00.000Z' };

    expect(hintFor('shell', { staleCount: 1 }, dismissed)).toBeNull();
    expect(hintFor('shell', { staleCount: 99 }, dismissed)).toBeNull();
  });

  it('takes no other hint with it', () => {
    const dismissed = { review: '2026-09-08T12:00:00.000Z' };
    const facts = { staleCount: 2, notes: 9, noteHasBody: true, syllabusUnits: 3, courses: 1 };

    expect(visibleHints(facts, dismissed).map((hint) => hint.id).sort()).toEqual([
      'focus',
      'questions',
      'search',
      'tasks',
    ]);
  });

  it('is unaffected by the guided path being dismissed, and vice versa', () => {
    // They share one column since migration 016, so this is the thing that
    // sharing could plausibly break.
    const facts = { staleCount: 1, notes: 5, noteHasBody: true, syllabusUnits: 1, courses: 1 };

    expect(visibleHints(facts, { [SETUP_NOTICE]: '2026-09-08T12:00:00.000Z' })).toHaveLength(5);
  });
});

describe('dismissal survives, per account, with no cookies anywhere', () => {
  let db: SupabaseClient;
  let oneId: string;
  let twoId: string;

  async function makeUser(): Promise<string> {
    const { data, error } = await db.auth.admin.createUser({
      email: `hints-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    const userId = data.user.id;
    await ensureWorkspace(db, userId);
    const { error: pErr } = await db
      .from('profiles')
      .insert({ id: userId, username: `h${userId.replace(/-/g, '').slice(0, 18)}` });
    if (pErr) throw new Error(`could not create test profile: ${pErr.message}`);
    return userId;
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    oneId = await makeUser();
    twoId = await makeUser();
  });

  afterAll(async () => {
    if (db && oneId) await db.auth.admin.deleteUser(oneId);
    if (db && twoId) await db.auth.admin.deleteUser(twoId);
  });

  it('remembers one hint without touching the others', async () => {
    expect(await getDismissedNotices(db, oneId)).toEqual({});

    await dismissHint(db, oneId, 'review');
    const notices = await getDismissedNotices(db, oneId);

    expect(Object.keys(notices)).toEqual(['review']);
    // A timestamp, not `true` — see migration 016.
    expect(new Date(notices.review).getTime()).toBeGreaterThan(0);

    await dismissHint(db, oneId, 'search');
    expect(Object.keys(await getDismissedNotices(db, oneId)).sort()).toEqual([
      'review',
      'search',
    ]);
  });

  it('is one person’s decision and nobody else’s', async () => {
    expect(await getDismissedNotices(db, twoId)).toEqual({});
  });

  it('lives in the same map as the guided path, without colliding with it', async () => {
    await setDismissed(db, oneId, SETUP_NOTICE, true);
    const notices = await getDismissedNotices(db, oneId);

    expect(Object.keys(notices).sort()).toEqual(['review', 'search', 'setup']);
    // And the hints still read as dismissed with the setup id sitting beside them.
    expect(hintFor('shell', { staleCount: 4 }, notices)).toBeNull();
  });

  it('can be undone', async () => {
    await restoreHint(db, oneId, 'review');
    const notices = await getDismissedNotices(db, oneId);

    expect(Object.keys(notices).sort()).toEqual(['search', 'setup']);
    expect(hintFor('shell', { staleCount: 4 }, notices)?.id).toBe('review');
  });
});
