import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { encryptSecret } from '@/lib/crypto';
import type { Generate } from '@/modules/agents';
import { createBlock } from '@/modules/blocks';
import { GMAIL_READONLY_SCOPE } from '@/modules/google';
import {
  acceptProposal,
  extractFromEmail,
  getInbox,
  getProposalsForEmail,
  rejectProposal,
  scanMailbox,
  type ProposalsContext,
} from '@/modules/proposals';
import { ensureWorkspace } from '@/modules/workspaces';

// THE slice-15 invariant, in two halves:
//
//   1. **Nothing reaches the task list without a human tap.** Extraction may
//      write rows in `email_proposals` and nowhere else. The control case is
//      the `tasks` table: after a scan that produces three proposals it is
//      still empty, and it only ever gains a row when `acceptProposal` is
//      called.
//   2. **Nothing is ever proposed twice.** Rejecting keeps the row, and the
//      unique index on (email_id, fingerprint) in migration 011 is what makes
//      re-running extraction over the same email propose nothing again. The
//      test forces the re-run rather than relying on the "already scanned"
//      skip, because the skip is an optimisation and the index is the promise.
//
// And the thing that keeps sync cheap: the gate. A society newsletter must
// never reach the model, so the fake model counts its own invocations and the
// newsletter case asserts that count does not move. A test that only checked
// "no proposals came from the newsletter" would pass just as happily against a
// version that called a `deep` model on every message in the mailbox and threw
// the answers away — and the bill would be the difference.
//
// Same setup as slices 11 through 14: the real Supabase project with the
// service-role key, because the unique index, the RLS-shaped ownership chain
// and the `tasks` and `class_meetings` writes are exactly what is being proved.
// A throwaway auth user is created and deleted, which cascades to the
// google_accounts row, its email_messages, their proposals, the workspace, its
// courses, meetings, tasks, blocks and derivations.
//
// The ONE thing faked is the provider's network — the AI SDK's own mock model,
// exactly as in recalc-engine.test.ts and answer-staleness.test.ts. There is no
// provider key and no connected mailbox on this machine, and neither is needed.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || !process.env.ENCRYPTION_KEY) {
  throw new Error(
    'email-proposals.test.ts needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ' +
      'and ENCRYPTION_KEY in .env.local, and migrations applied (npm run db:push). See SETUP.md.'
  );
}

// ---------------------------------------------------------------------------
// A model that does not exist, and counts how often it is asked
// ---------------------------------------------------------------------------

const NO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const STOPPED = { unified: 'stop' as const, raw: 'stop' };

function countingDeepRole(said: () => string): Generate & { calls: () => number } {
  let calls = 0;

  const generate = (async ({ system, prompt }) => {
    calls += 1;
    const { text } = await generateText({
      model: new MockLanguageModelV4({
        provider: 'mock',
        modelId: 'mock-deep',
        doGenerate: async () => ({
          content: [{ type: 'text' as const, text: said() }],
          finishReason: STOPPED,
          usage: NO_USAGE,
          warnings: [],
        }),
      }),
      ...(system ? { system } : {}),
      prompt,
    });
    return { text, model: 'mock/mock-deep' };
  }) as Generate & { calls: () => number };

  generate.calls = () => calls;
  return generate;
}

// ---------------------------------------------------------------------------
// The mail
// ---------------------------------------------------------------------------

const LECTURER = 'Dr Ada Byron <ada.byron@eng.uni.ac.uk>';
const COURSE_SUBJECT = 'ME301: problem sheet 3 due Friday';
const COURSE_SNIPPET =
  'Problem sheet 3 is due at 17:00 on Friday 6 March. ' +
  'The lecture on Tuesday is cancelled. ' +
  'Slides for week 4 are on the portal.';

const DEADLINE_QUOTE = 'Problem sheet 3 is due at 17:00 on Friday 6 March.';
const CANCELLED_QUOTE = 'The lecture on Tuesday is cancelled.';
const MATERIAL_QUOTE = 'Slides for week 4 are on the portal.';

const NEWSLETTER_SENDER = 'RoboSoc <news@robosoc.example.org>';
const NEWSLETTER_SUBJECT = 'RoboSoc newsletter — pizza night and free stickers';
const NEWSLETTER_SNIPPET =
  'Join us on Thursday for pizza and a soldering workshop. Unsubscribe at any time.';

const DUE_AT = '2026-03-06T17:00:00.000Z';

describe('an email becomes a proposal, and only a tap makes it a task', () => {
  let db: SupabaseClient;
  let userId: string;
  let ctx: ProposalsContext;

  let courseId: string;
  let meetingId: string;
  let meetingStartsAt: string;

  let courseEmailId: string;
  let newsletterEmailId: string;

  /** What the fake model answers for the course email. */
  let answer = '{"items":[]}';
  const deepRole = countingDeepRole(() => answer);

  async function tasks() {
    const { data, error } = await db
      .from('tasks')
      .select('*')
      .eq('workspace_id', ctx.workspaceId);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function meetingStatus(): Promise<string> {
    const { data, error } = await db
      .from('class_meetings')
      .select('status')
      .eq('id', meetingId)
      .single();
    if (error) throw new Error(error.message);
    return data.status as string;
  }

  /** One stored message and the `email` block slice 14 gives it. */
  async function storeMail(
    accountId: string,
    mail: { sender: string; subject: string; snippet: string }
  ): Promise<string> {
    const receivedAt = new Date().toISOString();

    const block = await createBlock(db, {
      workspaceId: ctx.workspaceId,
      type: 'email',
      content: {
        text: mail.subject,
        sender: mail.sender,
        snippet: mail.snippet,
        thread_id: randomUUID(),
        received_at: receivedAt,
      },
    });

    const { data, error } = await db
      .from('email_messages')
      .insert({
        google_account_id: accountId,
        provider_msg_id: randomUUID(),
        thread_id: randomUUID(),
        sender: mail.sender,
        subject: mail.subject,
        snippet: mail.snippet,
        received_at: receivedAt,
        block_id: block.id,
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not store test mail: ${error.message}`);
    return data.id as string;
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const created = await db.auth.admin.createUser({
      email: `email-proposals-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (created.error) throw new Error(`could not create test user: ${created.error.message}`);
    userId = created.data.user.id;

    const workspace = await ensureWorkspace(db, userId);
    ctx = { workspaceId: workspace.id, userId };

    const course = await db
      .from('courses')
      .insert({
        workspace_id: workspace.id,
        code: 'ME301',
        name: 'Thermodynamics',
        term: '2026 Spring',
        colour: 'indigo',
        instructor: 'Dr Ada Byron',
      })
      .select('id')
      .single();
    if (course.error) throw new Error(`could not create test course: ${course.error.message}`);
    courseId = course.data.id as string;

    // One dated lecture, so the class-change half has something to change.
    meetingStartsAt = new Date('2026-03-03T12:00:00.000Z').toISOString();
    const meeting = await db
      .from('class_meetings')
      .insert({
        workspace_id: workspace.id,
        course_id: courseId,
        starts_at: meetingStartsAt,
        ends_at: new Date('2026-03-03T13:30:00.000Z').toISOString(),
        room: 'B204',
        status: 'scheduled',
      })
      .select('id')
      .single();
    if (meeting.error) throw new Error(`could not create test meeting: ${meeting.error.message}`);
    meetingId = meeting.data.id as string;

    const account = await db
      .from('google_accounts')
      .insert({
        user_id: userId,
        address: `proposals-${randomUUID()}@example.com`,
        refresh_token_enc: encryptSecret(`refresh-${randomUUID()}`),
        granted_scopes: [GMAIL_READONLY_SCOPE],
        status: 'ok',
      })
      .select('id')
      .single();
    if (account.error) throw new Error(`could not create test account: ${account.error.message}`);

    courseEmailId = await storeMail(account.data.id as string, {
      sender: LECTURER,
      subject: COURSE_SUBJECT,
      snippet: COURSE_SNIPPET,
    });
    newsletterEmailId = await storeMail(account.data.id as string, {
      sender: NEWSLETTER_SENDER,
      subject: NEWSLETTER_SUBJECT,
      snippet: NEWSLETTER_SNIPPET,
    });

    // Every quote below is copied out of the snippet above, because the recipe
    // drops any item whose `sourceText` is not literally in the email. The
    // cancelled lecture is dated at the meeting's own instant so the proposal
    // resolves to exactly one lecture whatever timezone this runs in.
    answer = JSON.stringify({
      items: [
        {
          kind: 'deadline',
          title: 'Problem sheet 3',
          dueAt: DUE_AT,
          sourceText: DEADLINE_QUOTE,
        },
        {
          kind: 'class_change',
          change: 'cancelled',
          on: meetingStartsAt,
          room: null,
          sourceText: CANCELLED_QUOTE,
        },
        {
          kind: 'material',
          title: 'Week 4 slides',
          where: 'the portal',
          sourceText: MATERIAL_QUOTE,
        },
      ],
    });
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, its courses, meetings,
    // tasks, blocks and derivations, and to the google account, its mail and
    // every proposal made from it.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  // -------------------------------------------------------------------------
  // (a) and (d): extraction proposes, and the gate keeps the newsletter free.
  // -------------------------------------------------------------------------

  describe('scanning the mailbox', () => {
    it('reads the course email, skips the newsletter, and spends one call', async () => {
      const before = deepRole.calls();
      const summary = await scanMailbox(db, ctx, { generate: deepRole });

      // Two messages waiting; one of them never reaches the model.
      expect(summary.looked).toBe(2);
      expect(summary.gatedOut).toBe(1);
      expect(summary.called).toBe(1);
      expect(summary.proposed).toBe(3);

      // THE cheap-gate assertion. One call for one course email, and not two.
      expect(deepRole.calls()).toBe(before + 1);
    });

    it('writes three proposals, every one of them still only proposed', async () => {
      const proposals = await getProposalsForEmail(db, ctx, courseEmailId);

      expect(proposals).toHaveLength(3);
      expect(proposals.every((proposal) => proposal.status === 'proposed')).toBe(true);
      expect([...proposals.map((proposal) => proposal.kind)].sort()).toEqual([
        'class_change',
        'deadline',
        'material',
      ]);

      // It knew which course this was, from the code in the subject line.
      expect(proposals.every((proposal) => proposal.course_id === courseId)).toBe(true);
    });

    it('proposes NOTHING from the newsletter, and never asked the model about it', async () => {
      const before = deepRole.calls();
      const result = await extractFromEmail(db, ctx, newsletterEmailId, {
        generate: deepRole,
      });

      expect(result.gated).toBe(true);
      expect(result.called).toBe(false);
      expect(result.proposed).toBe(0);
      expect(deepRole.calls()).toBe(before);
      expect(await getProposalsForEmail(db, ctx, newsletterEmailId)).toEqual([]);
    });

    // THE control case. Three proposals exist and the task list has not moved.
    it('has created NO task and changed NO lecture', async () => {
      expect(await tasks()).toHaveLength(0);
      expect(await meetingStatus()).toBe('scheduled');
    });

    it('carries the exact sentence each proposal was read out of', async () => {
      const proposals = await getProposalsForEmail(db, ctx, courseEmailId);
      const quotes = proposals.map((proposal) => proposal.payload.sourceText).sort();

      expect(quotes).toEqual([CANCELLED_QUOTE, DEADLINE_QUOTE, MATERIAL_QUOTE].sort());
      // ...and every one of them is genuinely in the email, word for word.
      for (const quote of quotes) {
        expect(`${COURSE_SUBJECT}\n${COURSE_SNIPPET}`).toContain(quote);
      }
    });

    it('shows all three on /inbox with the course it matched', async () => {
      const inbox = await getInbox(db, ctx);

      expect(inbox.waiting).toHaveLength(3);
      expect(inbox.accepted).toBe(0);
      expect(inbox.rejected).toBe(0);
      expect(inbox.waiting.every((item) => item.course?.code === 'ME301')).toBe(true);
      // The class change found its lecture, so Accept has something to act on.
      const change = inbox.waiting.find((item) => item.kind === 'class_change');
      expect(change?.meeting?.id ?? null).toBe(meetingId);
      expect(change?.actionable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // (b): the tap.
  // -------------------------------------------------------------------------

  describe('accepting', () => {
    it('creates exactly one task, and flips the proposal to accepted', async () => {
      const deadline = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.kind === 'deadline'
      );
      expect(deadline).toBeDefined();
      if (!deadline) return;

      const result = await acceptProposal(db, ctx, deadline.id);
      expect(result.ok, result.ok ? '' : result.error).toBe(true);

      const rows = await tasks();
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Problem sheet 3');
      expect(rows[0].course_id).toBe(courseId);
      expect(new Date(rows[0].due_at as string).toISOString()).toBe(DUE_AT);
      // Provenance: the task points back at the `email` block it came from.
      expect(rows[0].source_block_id).not.toBeNull();

      const after = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.id === deadline.id
      );
      expect(after?.status).toBe('accepted');
      expect(after?.task_id).toBe(rows[0].id);
      expect(after?.decided_at).not.toBeNull();
    });

    it('refuses to accept the same proposal twice', async () => {
      const deadline = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.kind === 'deadline'
      );
      if (!deadline) throw new Error('the deadline proposal disappeared');

      const again = await acceptProposal(db, ctx, deadline.id);
      expect(again.ok).toBe(false);
      // ...and the task list is still one row, not two.
      expect(await tasks()).toHaveLength(1);
    });

    it('updates the lecture rather than making a task, for a class change', async () => {
      const change = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.kind === 'class_change'
      );
      if (!change) throw new Error('the class change proposal disappeared');

      const result = await acceptProposal(db, ctx, change.id);
      expect(result.ok, result.ok ? '' : result.error).toBe(true);

      expect(await meetingStatus()).toBe('cancelled');
      // Still one task: a class change never becomes one.
      expect(await tasks()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // (c): the row that stays.
  // -------------------------------------------------------------------------

  describe('rejecting', () => {
    it('keeps the row as rejected', async () => {
      const material = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.kind === 'material'
      );
      if (!material) throw new Error('the material proposal disappeared');

      const result = await rejectProposal(db, ctx, material.id);
      expect(result.ok).toBe(true);

      const after = (await getProposalsForEmail(db, ctx, courseEmailId)).find(
        (proposal) => proposal.id === material.id
      );
      expect(after?.status).toBe('rejected');
      expect(after?.task_id).toBeNull();
    });

    it('does NOT propose it again when the same email is read a second time', async () => {
      const before = await getProposalsForEmail(db, ctx, courseEmailId);
      expect(before).toHaveLength(3);

      // Forced, not skipped: the model really is called again and really does
      // return the same three items. The unique index on (email_id,
      // fingerprint) is what makes the answer "nothing new" — including for the
      // one that was rejected, which is the whole point of keeping the row.
      const rerun = await extractFromEmail(db, ctx, courseEmailId, { generate: deepRole });
      expect(rerun.called).toBe(true);
      expect(rerun.proposed).toBe(0);

      const after = await getProposalsForEmail(db, ctx, courseEmailId);
      expect(after).toHaveLength(3);
      expect(after.filter((proposal) => proposal.status === 'rejected')).toHaveLength(1);
      expect(after.filter((proposal) => proposal.status === 'proposed')).toHaveLength(0);

      // And nothing new landed in the task list on the way through.
      expect(await tasks()).toHaveLength(1);
    });

    it('leaves /inbox empty, with the decisions counted', async () => {
      const inbox = await getInbox(db, ctx);

      expect(inbox.waiting).toEqual([]);
      expect(inbox.accepted).toBe(2);
      expect(inbox.rejected).toBe(1);
    });
  });
});
