import type { SupabaseClient } from '@supabase/supabase-js';

import { dayTitle } from '@/lib/calendar';
import { localDateKey, localTimeLabel, localTimeZone } from '@/lib/time';
import { hasAgentRole, type Generate } from '@/modules/agents';
import { getCourse, getCourses, getMeeting, getMeetingsOnDate } from '@/modules/courses';
import { setMeetingStatus } from '@/modules/courses';
import { getMessage, getRecentMessages } from '@/modules/gmail';
import {
  emailBlocksAlreadyExtracted,
  extractFromEmailBlock,
  type ExtractedItem,
} from '@/modules/recalc';
import { createTask } from '@/modules/tasks';

import { gateEmail, type CourseHint, type GateInput } from './gate';
import * as repo from './repo';
import {
  fingerprintOf,
  payloadOf,
  taskTitleOf,
  type EmailProposal,
  type ProposalKind,
  type ProposalPayload,
} from './schema';

// Proposals, and the one rule that governs all of them:
//
//   **Nothing here writes a task or touches a lecture except `acceptProposal`,
//   and `acceptProposal` is only ever reached from a button.**
//
// docs/PRODUCT.md: "Extractions are *proposals* the user accepts — never
// written straight into the task list." prompts/15-email-extraction.md puts it
// more bluntly: "An AI that silently invents forty fake deadlines gets deleted
// on day two." So `scanMailbox` and `extractFromEmail` can write rows in
// `email_proposals` and nowhere else, and `modules/proposals/email-proposals.
// test.ts` asserts the `tasks` table is untouched after a scan.
//
// The order of operations in `extractFromEmail` is the other load-bearing part:
// the cheap gate runs BEFORE anything that costs money, so a mailbox full of
// society newsletters costs zero model calls and zero seconds.

export type ProposalsContext = {
  workspaceId: string;
  userId: string;
};

export type ScanOptions = {
  /** The model call, substituted. Tests pass a stand-in; app code never does. */
  generate?: Generate;
  /** How much recent mail to consider. */
  mailboxLimit?: number;
  /** The ceiling on `deep` calls in one press of the button. */
  maxCalls?: number;
  timeZone?: string;
};

/** At most this many `deep` calls per scan, however much mail is waiting. */
export const MAX_CALLS_PER_SCAN = 15;

/** How much recent mail a scan or an inbox read looks at. */
export const MAILBOX_WINDOW = 300;

// ---------------------------------------------------------------------------
// One email
// ---------------------------------------------------------------------------

export type EmailScanResult = {
  emailId: string;
  /** The cheap gate said no. No model was called, and none will be. */
  gated: boolean;
  /** A `deep` call was actually made. */
  called: boolean;
  /** Rows written. Zero when everything in it had already been proposed. */
  proposed: number;
  error: string | null;
};

const hintsOf = (courses: Awaited<ReturnType<typeof getCourses>>): CourseHint[] =>
  courses.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    instructor: course.instructor,
  }));

const factsOf = (message: {
  sender: string;
  subject: string | null;
  snippet: string | null;
}): GateInput => ({
  sender: message.sender,
  subject: message.subject ?? '',
  snippet: message.snippet ?? '',
});

/**
 * Read one email, if it is worth reading, and write what it proposes.
 *
 * The gate is first and it is free. Only if it says yes does this reach
 * `extractFromEmailBlock`, which is the slice 11 engine with a third recipe on
 * it — there is no second pipeline for email anywhere in this app.
 *
 * `emailMessageId` arrives from a browser; `getMessage` returns null for a
 * message that is not this user's, so a forged id stops here.
 */
export async function extractFromEmail(
  db: SupabaseClient,
  ctx: ProposalsContext,
  emailMessageId: string,
  options: ScanOptions = {}
): Promise<EmailScanResult> {
  const message = await getMessage(db, ctx.userId, emailMessageId);
  if (!message) {
    throw new Error(`extractFromEmail: no email ${emailMessageId} for this user`);
  }

  const base = { emailId: message.id, gated: false, called: false, proposed: 0, error: null };

  if (!message.block_id) {
    return { ...base, error: 'This message has no block, so there is nothing to read.' };
  }

  const courses = await getCourses(db, ctx.workspaceId);
  const verdict = gateEmail(factsOf(message), hintsOf(courses));
  if (!verdict.plausible) return { ...base, gated: true };

  const run = await extractFromEmailBlock(db, ctx, message.block_id, {
    ...(options.generate ? { generate: options.generate } : {}),
  });
  if (!run.ok) return { ...base, called: true, error: run.error };

  const rows = [];
  for (const item of run.items) {
    rows.push({
      email_id: message.id,
      kind: item.kind,
      payload: payloadOf(item),
      confidence: verdict.confidence,
      fingerprint: fingerprintOf(item),
      course_id: verdict.courseId,
      // A class change is about one lecture. If exactly one matches the course
      // and the date, name it now so the screen can say which lecture will
      // change; otherwise leave it null and let accepting ask.
      meeting_id:
        item.kind === 'class_change'
          ? await findTargetMeeting(db, ctx, verdict.courseId, item.on, options.timeZone)
          : null,
    });
  }

  // `insertNew` is `on conflict do nothing` against the unique index on
  // (email_id, fingerprint). A thing this email already proposed — accepted,
  // rejected or still waiting — is silently not proposed again.
  const written = await repo.insertNew(db, rows);
  return { ...base, called: true, proposed: written.length };
}

/** The one lecture a class change is about, or null when it is not obvious. */
async function findTargetMeeting(
  db: SupabaseClient,
  ctx: ProposalsContext,
  courseId: string | null,
  on: string | null,
  timeZone = localTimeZone()
): Promise<string | null> {
  if (!courseId || !on) return null;

  const day = new Date(on);
  if (Number.isNaN(day.getTime())) return null;

  const meetings = await getMeetingsOnDate(
    db,
    ctx.workspaceId,
    localDateKey(day, timeZone),
    timeZone
  );
  const mine = meetings.filter((meeting) => meeting.course_id === courseId);
  // Two lectures of the same course on one day is a genuine ambiguity, and
  // guessing which one an email meant is exactly what this slice may not do.
  return mine.length === 1 ? mine[0].id : null;
}

// ---------------------------------------------------------------------------
// The whole mailbox
// ---------------------------------------------------------------------------

export type ScanSummary = {
  /** Messages considered — everything recent that has never been read. */
  looked: number;
  /** ...of which the cheap gate rejected this many for nothing. */
  gatedOut: number;
  /** ...and this many cost a `deep` call. */
  called: number;
  proposed: number;
  /** A sentence for the screen, or null when there is nothing to say. */
  message: string | null;
};

/**
 * "Read the mail that has arrived."
 *
 * Every message is gated before anything is spent, so the cost of a mailbox of
 * newsletters is zero. An email that has already been read by the engine is
 * skipped outright; an email the gate rejected is re-gated on the next scan,
 * which costs nothing and means the day a course is added, its mail starts
 * being noticed.
 */
export async function scanMailbox(
  db: SupabaseClient,
  ctx: ProposalsContext,
  options: ScanOptions = {}
): Promise<ScanSummary> {
  const messages = await getRecentMessages(
    db,
    ctx.userId,
    options.mailboxLimit ?? MAILBOX_WINDOW
  );
  const withBlocks = messages.filter((message) => message.block_id !== null);

  const already = await emailBlocksAlreadyExtracted(
    db,
    ctx.workspaceId,
    withBlocks.map((message) => message.block_id as string)
  );
  const pending = withBlocks.filter(
    (message) => !already.has(message.block_id as string)
  );

  const summary: ScanSummary = {
    looked: pending.length,
    gatedOut: 0,
    called: 0,
    proposed: 0,
    message: null,
  };
  if (pending.length === 0) {
    summary.message = 'No new mail to read.';
    return summary;
  }

  // The gate, for everything, before anything is spent. This loop makes no
  // network call of any kind.
  const courses = hintsOf(await getCourses(db, ctx.workspaceId));
  const worthIt = pending.filter((message) => {
    const plausible = gateEmail(factsOf(message), courses).plausible;
    if (!plausible) summary.gatedOut += 1;
    return plausible;
  });

  if (worthIt.length === 0) {
    summary.message = 'Nothing that arrived looks like it is about a course.';
    return summary;
  }

  // Only now does a model matter. Asking before this point would make a
  // mailbox of newsletters complain about a missing API key.
  if (!options.generate && !(await hasAgentRole(db, ctx.userId, 'deep'))) {
    summary.message =
      'Some mail looks course-related, but no deep model is set up yet. Add one in Settings → Agents.';
    return summary;
  }

  const budget = options.maxCalls ?? MAX_CALLS_PER_SCAN;
  for (const message of worthIt.slice(0, budget)) {
    const result = await extractFromEmail(db, ctx, message.id, options);
    if (result.called) summary.called += 1;
    summary.proposed += result.proposed;
  }

  if (worthIt.length > budget) {
    summary.message = `Read ${budget} of ${worthIt.length} course emails. Press Scan again for the rest.`;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// /inbox
// ---------------------------------------------------------------------------

export type InboxItem = {
  id: string;
  kind: ProposalKind;
  payload: ProposalPayload;
  /** The heuristic gate's score. Never rendered as a percentage. */
  confidence: number;
  /** What was found, in a few words. */
  headline: string;
  /** Exactly what pressing Accept will do. */
  effect: string;
  /** False when Accept cannot act yet — a class change with no lecture found. */
  actionable: boolean;
  email: {
    id: string;
    subject: string;
    sender: string;
    snippet: string;
    receivedLabel: string;
  };
  course: { id: string; code: string; name: string; colour: string | null } | null;
  meeting: { id: string; label: string; room: string | null } | null;
};

export type Inbox = {
  waiting: InboxItem[];
  accepted: number;
  rejected: number;
  /** Messages that have arrived and never been read by the engine. */
  unscanned: number;
};

/** '14:00 · Tuesday 14 October'. */
function whenLabel(iso: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${localTimeLabel(at, timeZone)} · ${dayTitle(localDateKey(at, timeZone))}`;
}

/** 'Tuesday 14 October', for a date with no time worth showing. */
function dayLabel(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : dayTitle(localDateKey(at, timeZone));
}

/**
 * Everything waiting, with the evidence beside it.
 *
 * The counts of accepted and rejected are here on purpose: a rejected proposal
 * is kept for ever, and the screen saying so is what makes "it will not ask me
 * again" believable.
 */
export async function getInbox(
  db: SupabaseClient,
  ctx: ProposalsContext,
  options: { timeZone?: string; mailboxLimit?: number } = {}
): Promise<Inbox> {
  const timeZone = options.timeZone ?? localTimeZone();

  const messages = await getRecentMessages(
    db,
    ctx.userId,
    options.mailboxLimit ?? MAILBOX_WINDOW
  );
  const byId = new Map(messages.map((message) => [message.id, message]));

  const proposals = await repo.listForEmails(db, [...byId.keys()]);
  const waiting = proposals.filter((proposal) => proposal.status === 'proposed');

  const courses = await getCourses(db, ctx.workspaceId);
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const withBlocks = messages.filter((message) => message.block_id !== null);
  const already = await emailBlocksAlreadyExtracted(
    db,
    ctx.workspaceId,
    withBlocks.map((message) => message.block_id as string)
  );

  const items: InboxItem[] = [];
  for (const proposal of waiting) {
    const message = byId.get(proposal.email_id);
    if (!message) continue;

    const course = proposal.course_id ? (courseById.get(proposal.course_id) ?? null) : null;
    const meeting = proposal.meeting_id
      ? await getMeeting(db, ctx.workspaceId, proposal.meeting_id)
      : null;

    const due = dayLabel(proposal.payload.dueAt, timeZone);
    const on = dayLabel(proposal.payload.on, timeZone);
    const where = course ? ` in ${course.code}` : '';

    const headline =
      proposal.kind === 'deadline'
        ? `${proposal.payload.title ?? 'Something is due'}${due ? ` — due ${due}` : ''}`
        : proposal.kind === 'material'
          ? (proposal.payload.title ?? 'Something to read')
          : proposal.payload.change === 'cancelled'
            ? `A class is cancelled${on ? ` on ${on}` : ''}`
            : proposal.payload.change === 'room'
              ? `A class has moved room${proposal.payload.room ? ` to ${proposal.payload.room}` : ''}`
              : `A class has been rescheduled${on ? ` from ${on}` : ''}`;

    const actionable = proposal.kind !== 'class_change' || meeting !== null;

    const effect =
      proposal.kind === 'class_change'
        ? meeting
          ? proposal.payload.change === 'cancelled'
            ? `Marks that lecture cancelled on the calendar.`
            : `Marks that lecture as moved. The new time or room is in the email — set it on the lecture page.`
          : 'No single lecture matched this date, so there is nothing to change. Reject it and edit the calendar yourself.'
        : `Creates one task${where}${due ? `, due ${due}` : ', with no due date'}.`;

    items.push({
      id: proposal.id,
      kind: proposal.kind,
      payload: proposal.payload,
      confidence: proposal.confidence,
      headline,
      effect,
      actionable,
      email: {
        id: message.id,
        subject: message.subject ?? '(no subject)',
        sender: message.sender,
        snippet: message.snippet ?? '',
        receivedLabel: dayLabel(message.received_at, timeZone) ?? '',
      },
      course: course
        ? { id: course.id, code: course.code, name: course.name, colour: course.colour }
        : null,
      meeting: meeting
        ? {
            id: meeting.id,
            label: whenLabel(meeting.starts_at, timeZone),
            room: meeting.room,
          }
        : null,
    });
  }

  return {
    waiting: items,
    accepted: proposals.filter((proposal) => proposal.status === 'accepted').length,
    rejected: proposals.filter((proposal) => proposal.status === 'rejected').length,
    unscanned: withBlocks.filter((message) => !already.has(message.block_id as string)).length,
  };
}

// ---------------------------------------------------------------------------
// The tap
// ---------------------------------------------------------------------------

export type Decision =
  | { ok: true; status: 'accepted' | 'rejected'; taskId: string | null; meetingId: string | null }
  | { ok: false; error: string };

/** The proposal and the email it came from, proved to be this user's. */
async function mine(
  db: SupabaseClient,
  ctx: ProposalsContext,
  proposalId: string
): Promise<{ proposal: EmailProposal; blockId: string | null; subject: string } | null> {
  const proposal = await repo.find(db, proposalId);
  if (!proposal) return null;

  const message = await getMessage(db, ctx.userId, proposal.email_id);
  if (!message) return null;

  return { proposal, blockId: message.block_id, subject: message.subject ?? '(no subject)' };
}

/**
 * "Yes." The only path in this app from an email to a task.
 *
 * `courseId` may be supplied by the screen, because the screen is where the
 * question "which course is this?" gets asked when the gate was not sure. It is
 * proved against this workspace before anything is written.
 */
export async function acceptProposal(
  db: SupabaseClient,
  ctx: ProposalsContext,
  proposalId: string,
  input: { courseId?: string | null } = {}
): Promise<Decision> {
  const found = await mine(db, ctx, proposalId);
  if (!found) throw new Error(`acceptProposal: no proposal ${proposalId} for this user`);

  const { proposal } = found;
  if (proposal.status !== 'proposed') {
    return { ok: false, error: 'That has already been decided.' };
  }

  const courseId = input.courseId !== undefined ? input.courseId : proposal.course_id;
  if (courseId) {
    const course = await getCourse(db, ctx.workspaceId, courseId);
    if (!course) return { ok: false, error: 'That course is not in this workspace.' };
  }

  if (proposal.kind === 'class_change') {
    const meetingId =
      proposal.meeting_id ??
      (await findTargetMeeting(db, ctx, courseId, proposal.payload.on ?? null));
    if (!meetingId) {
      return {
        ok: false,
        error:
          'I could not find a single lecture on that date for that course, so there is nothing to change.',
      };
    }

    const meeting = await getMeeting(db, ctx.workspaceId, meetingId);
    if (!meeting) return { ok: false, error: 'That lecture is no longer in the calendar.' };

    // Cancelled is cancelled. Everything else — a new room, a new time — is
    // `moved`: docs/SCHEMA.md has the status, `modules/courses` has no public
    // way to write a room, and inventing a time from a subject line would be
    // exactly the guess this slice is not allowed to make.
    await setMeetingStatus(
      db,
      ctx.workspaceId,
      meetingId,
      proposal.payload.change === 'cancelled' ? 'cancelled' : 'moved'
    );

    const decided = await repo.markAccepted(db, proposal.id, { meetingId, courseId });
    return { ok: true, status: 'accepted', taskId: null, meetingId: decided.meeting_id };
  }

  const task = await createTask(db, {
    workspaceId: ctx.workspaceId,
    title: taskTitleOf(proposal.kind, proposal.payload),
    courseId: courseId ?? null,
    dueAt: proposal.payload.dueAt ?? null,
    // Where it came from, in the task itself — so a task made from an email is
    // never a sentence with no history.
    notes: `“${proposal.payload.sourceText}” — from the email “${found.subject}”`,
    // Provenance the database can follow: the `email` block slice 14 made.
    sourceBlockId: found.blockId,
  });

  const decided = await repo.markAccepted(db, proposal.id, { taskId: task.id, courseId });
  return { ok: true, status: 'accepted', taskId: decided.task_id, meetingId: null };
}

/**
 * "No." The row stays, for ever, so this email can never propose it again.
 */
export async function rejectProposal(
  db: SupabaseClient,
  ctx: ProposalsContext,
  proposalId: string
): Promise<Decision> {
  const found = await mine(db, ctx, proposalId);
  if (!found) throw new Error(`rejectProposal: no proposal ${proposalId} for this user`);

  if (found.proposal.status !== 'proposed') {
    return { ok: false, error: 'That has already been decided.' };
  }

  await repo.markRejected(db, found.proposal.id);
  return { ok: true, status: 'rejected', taskId: null, meetingId: null };
}

/** Every proposal ever made from these emails. For a test, and for a screen. */
export async function getProposalsForEmail(
  db: SupabaseClient,
  ctx: ProposalsContext,
  emailMessageId: string
): Promise<EmailProposal[]> {
  const message = await getMessage(db, ctx.userId, emailMessageId);
  if (!message) return [];
  return repo.listForEmails(db, [message.id]);
}

export type { ExtractedItem };
