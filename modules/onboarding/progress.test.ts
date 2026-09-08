import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { saveAgentProfile } from '@/modules/agents';
import { createBlock, updateBlock } from '@/modules/blocks';
import { createCourse, createSession } from '@/modules/courses';
import { SETUP_NOTICE, getProgress, type StepId, type StepState } from '@/modules/onboarding';
import { setDismissed } from '@/modules/profiles';
import { keepOldVersion } from '@/modules/recalc';
import { getPeriods } from '@/modules/timetable';
import { ensureWorkspace, setTerm } from '@/modules/workspaces';

// THE test for slice 20.
//
// The guided path's last step teaches the one behaviour this entire product
// exists for: edit a note, and the summary built from it knows it is out of
// date. A step that teaches that must not un-tick itself when the user acts on
// what it taught — and every obvious predicate does exactly that.
//
//   * "something is stale" goes back to false the moment the diff is accepted or
//     the old version is kept in /review. The user is punished for succeeding.
//     The design document names this trap.
//
//   * "a source block has version > 1", which the design chose instead, is
//     already true BEFORE anything is summarised. The note editor autosaves a
//     second after the last keystroke and `updateBlock` bumps the version
//     whenever the content hash moves, so a note written in two sittings reaches
//     version 2 on its own. The step would tick alongside step 6 and the lesson
//     would never be seen. There is a test for that below, because it is the
//     reason migration 015 exists.
//
// `derivations.stale_runs` counts fresh->stale transitions, only ever increases,
// and is touched by nothing in /review. That is what the step reads.
//
// Real database, because `stale_runs` is incremented by a Postgres trigger and a
// test that faked it would prove nothing. Throwaway users, deleted after.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'progress.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

const TERM_START = '2030-10-07';
const TERM_END = '2030-10-27';

describe('the guided path never un-ticks a step the user has completed', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let noteDocId: string;
  let paragraphId: string;
  let derivationId: string;

  /** The state of one step, by id. */
  async function stateOf(id: StepId): Promise<StepState> {
    const progress = await getProgress(db, userId, workspaceId);
    const step = progress.steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error(`no step ${id}`);
    return step.state;
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `onboarding-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;
    workspaceId = (await ensureWorkspace(db, userId)).id;

    // A profile row, because dismissal lives on it. The username is this
    // account's own and never collides: it is derived from the uuid.
    const { error: pErr } = await db
      .from('profiles')
      .insert({ id: userId, username: `t${userId.replace(/-/g, '').slice(0, 18)}` });
    if (pErr) throw new Error(`could not create test profile: ${pErr.message}`);
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  // -------------------------------------------------------------------------
  // Act 1 — the four steps that need nothing but typing
  // -------------------------------------------------------------------------

  it('starts with every step to do, and the first one current', async () => {
    const progress = await getProgress(db, userId, workspaceId);

    expect(progress.doneCount).toBe(0);
    expect(progress.current?.id).toBe('term');
    expect(progress.actOneComplete).toBe(false);
    expect(progress.complete).toBe(false);
    expect(progress.dismissed).toBe(false);
  });

  it('ticks "say when term runs" when the term is set, and un-ticks when it is cleared', async () => {
    expect(await stateOf('term')).toBe('todo');

    await setTerm(db, workspaceId, { termStart: TERM_START, termEnd: TERM_END });
    expect(await stateOf('term')).toBe('done');

    // Derived, not stored: taking the data away takes the tick away.
    await setTerm(db, workspaceId, { termStart: null, termEnd: null });
    expect(await stateOf('term')).toBe('todo');

    await setTerm(db, workspaceId, { termStart: TERM_START, termEnd: TERM_END });
  });

  it('ticks "add your first course" when a course exists', async () => {
    expect(await stateOf('course')).toBe('todo');

    await createCourse(db, {
      workspaceId,
      code: 'BI101',
      name: 'Biology',
      term: 'This term',
      colour: null,
    });

    expect(await stateOf('course')).toBe('done');
    expect((await getProgress(db, userId, workspaceId)).current?.id).toBe('timetable');
  });

  it('ticks "put it on the timetable" when a weekly slot exists', async () => {
    expect(await stateOf('timetable')).toBe('todo');

    const { data: course } = await db
      .from('courses')
      .select('id')
      .eq('workspace_id', workspaceId)
      .single();
    const periods = await getPeriods(db, workspaceId);

    await createSession(db, {
      workspaceId,
      courseId: course!.id as string,
      weekday: 2,
      startsAt: periods[0].starts_at,
      endsAt: periods[0].ends_at,
      room: 'B-14',
      isLab: false,
      periodId: periods[0].id,
    });

    expect(await stateOf('timetable')).toBe('done');
  });

  it('ticks "write your first note" when a note exists', async () => {
    expect(await stateOf('note')).toBe('todo');

    const doc = await createBlock(db, {
      workspaceId,
      type: 'note',
      content: { text: 'Photosynthesis' },
    });
    noteDocId = doc.id;

    const paragraph = await createBlock(db, {
      workspaceId,
      parentId: doc.id,
      type: 'text',
      content: { text: 'Photosynthesis converts light' },
      position: 1,
    });
    paragraphId = paragraph.id;

    expect(await stateOf('note')).toBe('done');
    expect((await getProgress(db, userId, workspaceId)).actOneComplete).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Act 2 — blocked, then not
  // -------------------------------------------------------------------------

  it('reports Act 2 as blocked, not as to-do, while there is no deep role', async () => {
    const progress = await getProgress(db, userId, workspaceId);
    const byId = new Map(progress.steps.map((step) => [step.id, step.state]));

    // "Add a model" is the thing that unblocks the rest, so it is never blocked.
    expect(byId.get('model')).toBe('todo');
    // The two that genuinely cannot be done from here say so, so the screen can
    // explain rather than offer a button that goes nowhere.
    expect(byId.get('summarise')).toBe('blocked');
    expect(byId.get('stale')).toBe('blocked');
  });

  it('unblocks Act 2 when a deep role is configured', async () => {
    await saveAgentProfile(db, {
      userId,
      role: 'deep',
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: 'sk-ant-not-a-real-key-for-tests',
    });

    const progress = await getProgress(db, userId, workspaceId);
    const byId = new Map(progress.steps.map((step) => [step.id, step.state]));

    expect(byId.get('model')).toBe('done');
    expect(byId.get('summarise')).toBe('todo');
    expect(byId.get('stale')).toBe('todo');
  });

  // -------------------------------------------------------------------------
  // Step 7 — the trap, from both sides
  // -------------------------------------------------------------------------

  it('does NOT tick "watch it go stale" merely because the note was typed in two sittings', async () => {
    // This is what the editor does on its own: it autosaves a second after the
    // last keystroke, so carrying on with the same sentence writes a second
    // version. Nothing has been summarised, and nothing has gone stale.
    const edited = await updateBlock(db, paragraphId, {
      content: { text: 'Photosynthesis converts light into chemical energy.' },
    });
    expect(edited.version).toBe(2);

    // The predicate the design originally chose — "a source block has version
    // > 1" — is already true here. This one is not, and that is the point.
    expect(await stateOf('summarise')).toBe('todo');
    expect(await stateOf('stale')).toBe('todo');
  });

  it('ticks "summarise that note" when a summarize derivation exists', async () => {
    // Written directly, as modules/recalc/staleness.test.ts does: the row and the
    // trigger are what is being proved, and no model is called anywhere here.
    const summaryBlock = await createBlock(db, {
      workspaceId,
      type: 'summary',
      content: { text: 'Light becomes chemical energy.' },
    });

    const { data: derivation, error } = await db
      .from('derivations')
      .insert({
        workspace_id: workspaceId,
        derived_block_id: summaryBlock.id,
        recipe: 'summarize',
        model: 'test-model',
        status: 'fresh',
      })
      .select('id, stale_runs')
      .single();
    if (error) throw new Error(`could not insert derivation: ${error.message}`);
    derivationId = derivation.id as string;

    // The receipt: which blocks it read, and at which version.
    const { error: sErr } = await db.from('derivation_sources').insert([
      { derivation_id: derivationId, source_block_id: noteDocId, source_version: 1 },
      { derivation_id: derivationId, source_block_id: paragraphId, source_version: 2 },
    ]);
    if (sErr) throw new Error(`could not insert sources: ${sErr.message}`);

    expect(derivation.stale_runs).toBe(0);
    expect(await stateOf('summarise')).toBe('done');
    // Summarised, but not yet edited since. The lesson has not happened.
    expect(await stateOf('stale')).toBe('todo');
  });

  it('ticks "watch it go stale" when the note is edited after being summarised', async () => {
    await updateBlock(db, paragraphId, {
      content: { text: 'Photosynthesis converts light into glucose and oxygen.' },
    });

    const { data } = await db
      .from('derivations')
      .select('status, stale_runs')
      .eq('id', derivationId)
      .single();

    expect(data!.status).toBe('stale');
    expect(data!.stale_runs).toBe(1);
    expect(await stateOf('stale')).toBe('done');
  });

  // =========================================================================
  // THE INVARIANT
  // =========================================================================

  it('KEEPS step 7 ticked after the stale summary is resolved in /review', async () => {
    expect(await stateOf('stale')).toBe('done');

    // The real /review action. `keepOldVersion` calls no model, so it runs here
    // for real: it rewrites the receipt to the current versions and marks the
    // derivation computed — which is exactly what makes "something is stale" go
    // back to false.
    const result = await keepOldVersion(db, { workspaceId, userId }, derivationId);
    expect(result.ok).toBe(true);

    const { data } = await db
      .from('derivations')
      .select('status, stale_runs')
      .eq('id', derivationId)
      .single();

    // Nothing is stale any more...
    expect(data!.status).toBe('fresh');
    // ...but it has been, and the count says so for ever.
    expect(data!.stale_runs).toBe(1);

    // The whole point: the user did the right thing and the step stayed done.
    expect(await stateOf('stale')).toBe('done');
    expect((await getProgress(db, userId, workspaceId)).complete).toBe(true);
  });

  it('also keeps step 7 ticked when the diff is accepted rather than discarded', async () => {
    // Accepting calls a model, so the two things acceptPreview does to the
    // database are done here instead: the derived block is rewritten and the
    // receipt is brought up to date. Neither touches `stale_runs`, which is the
    // property being proved.
    await updateBlock(db, paragraphId, {
      content: { text: 'Photosynthesis stores light energy as glucose.' },
    });
    expect(await stateOf('stale')).toBe('done');

    const { data: current } = await db
      .from('blocks')
      .select('version')
      .eq('id', paragraphId)
      .single();

    await db
      .from('derivation_sources')
      .update({ source_version: current!.version })
      .eq('derivation_id', derivationId)
      .eq('source_block_id', paragraphId);
    await db
      .from('derivations')
      .update({ status: 'fresh', computed_at: new Date().toISOString() })
      .eq('id', derivationId);

    const { data } = await db
      .from('derivations')
      .select('status, stale_runs')
      .eq('id', derivationId)
      .single();

    expect(data!.status).toBe('fresh');
    expect(data!.stale_runs).toBe(2);
    expect(await stateOf('stale')).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Dismissal is a fact about a person, not about a browser
// ---------------------------------------------------------------------------

describe('dismissing the guided path', () => {
  let db: SupabaseClient;
  let oneId: string;
  let twoId: string;
  let oneWorkspace: string;
  let twoWorkspace: string;

  async function makeUser(): Promise<{ userId: string; workspaceId: string }> {
    const { data, error } = await db.auth.admin.createUser({
      email: `onboarding-dismiss-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    const userId = data.user.id;
    const workspaceId = (await ensureWorkspace(db, userId)).id;
    const { error: pErr } = await db
      .from('profiles')
      .insert({ id: userId, username: `t${userId.replace(/-/g, '').slice(0, 18)}` });
    if (pErr) throw new Error(`could not create test profile: ${pErr.message}`);
    return { userId, workspaceId };
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const one = await makeUser();
    const two = await makeUser();
    oneId = one.userId;
    oneWorkspace = one.workspaceId;
    twoId = two.userId;
    twoWorkspace = two.workspaceId;
  });

  afterAll(async () => {
    if (db && oneId) await db.auth.admin.deleteUser(oneId);
    if (db && twoId) await db.auth.admin.deleteUser(twoId);
  });

  it('is per account, and needs no cookie to survive', async () => {
    expect((await getProgress(db, oneId, oneWorkspace)).dismissed).toBe(false);
    expect((await getProgress(db, twoId, twoWorkspace)).dismissed).toBe(false);

    await setDismissed(db, oneId, SETUP_NOTICE, true);

    // The one who dismissed it, on any device, with no cookies anywhere.
    expect((await getProgress(db, oneId, oneWorkspace)).dismissed).toBe(true);
    // And nobody else.
    expect((await getProgress(db, twoId, twoWorkspace)).dismissed).toBe(false);
  });

  it('can be undone, because the path is a place and not an event', async () => {
    await setDismissed(db, oneId, SETUP_NOTICE, false);
    expect((await getProgress(db, oneId, oneWorkspace)).dismissed).toBe(false);
  });

  it('never hides steps that are genuinely not done', async () => {
    await setDismissed(db, oneId, SETUP_NOTICE, true);
    const progress = await getProgress(db, oneId, oneWorkspace);

    // Dismissal is about where the path is *offered*, never about whether it is
    // finished. A dismissed account with an empty semester still has seven
    // things to do, and /start still says so if they go there.
    expect(progress.dismissed).toBe(true);
    expect(progress.doneCount).toBe(0);
    expect(progress.current?.id).toBe('term');
  });
});
