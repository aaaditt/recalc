import type { SupabaseClient } from '@supabase/supabase-js';

import {
  emailProposalSchema,
  type EmailProposal,
  type ProposalKind,
  type ProposalPayload,
  type ProposalStatus,
} from './schema';

// The only file that touches the `email_proposals` table.
//
// Two rules hold everywhere in here:
//
//   1. Every read is scoped by the email ids the caller has already proved are
//      this user's, so RLS is a backstop rather than the only guard — the
//      service-role client used by tests and the cron job bypasses RLS.
//   2. Nothing in this file writes to `tasks` or `class_meetings`, and nothing
//      in it can. Acceptance is service.ts's job, and it only ever happens
//      because a person pressed a button.

export type NewProposalRow = {
  email_id: string;
  kind: ProposalKind;
  payload: ProposalPayload;
  confidence: number;
  fingerprint: string;
  course_id: string | null;
  meeting_id: string | null;
};

/**
 * Write the proposals found in one email, skipping any already proposed.
 *
 * `ignoreDuplicates` makes this `on conflict do nothing` against
 * `email_proposals_email_fingerprint_key`, which is where "never propose the
 * same thing twice from the same email" is actually enforced — including, and
 * especially, when the row that is already there was REJECTED. Nothing is
 * checked in TypeScript first, on purpose: a check a caller can forget is not a
 * constraint.
 *
 * What comes back is exactly the rows that were new.
 */
export async function insertNew(
  db: SupabaseClient,
  rows: NewProposalRow[]
): Promise<EmailProposal[]> {
  if (rows.length === 0) return [];

  const { data, error } = await db
    .from('email_proposals')
    .upsert(rows, { onConflict: 'email_id,fingerprint', ignoreDuplicates: true })
    .select('*');
  if (error) throw new Error(`proposals.insertNew: ${error.message}`);
  return (data ?? []).map((row) => emailProposalSchema.parse(row));
}

/** One proposal, whoever it belongs to. The caller proves ownership. */
export async function find(db: SupabaseClient, id: string): Promise<EmailProposal | null> {
  const { data, error } = await db
    .from('email_proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`proposals.find: ${error.message}`);
  return data ? emailProposalSchema.parse(data) : null;
}

/** Every proposal made from these emails, newest first. */
export async function listForEmails(
  db: SupabaseClient,
  emailIds: string[],
  statuses?: ProposalStatus[]
): Promise<EmailProposal[]> {
  if (emailIds.length === 0) return [];

  let query = db.from('email_proposals').select('*').in('email_id', emailIds);
  if (statuses && statuses.length > 0) query = query.in('status', statuses);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(`proposals.listForEmails: ${error.message}`);
  return (data ?? []).map((row) => emailProposalSchema.parse(row));
}

/** What accepting did, written in the same statement as the status. */
export async function markAccepted(
  db: SupabaseClient,
  id: string,
  result: { taskId?: string | null; meetingId?: string | null; courseId?: string | null }
): Promise<EmailProposal> {
  const { data, error } = await db
    .from('email_proposals')
    .update({
      status: 'accepted',
      decided_at: new Date().toISOString(),
      ...(result.taskId !== undefined ? { task_id: result.taskId } : {}),
      ...(result.meetingId !== undefined ? { meeting_id: result.meetingId } : {}),
      ...(result.courseId !== undefined ? { course_id: result.courseId } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`proposals.markAccepted: ${error.message}`);
  return emailProposalSchema.parse(data);
}

/**
 * "No."
 *
 * The row is kept, and that is the entire point: its fingerprint goes on
 * blocking a re-proposal from the same email for ever. Deleting it would mean
 * the next scan proposes the same thing again, which is the fastest way to make
 * a queue like this unusable.
 */
export async function markRejected(db: SupabaseClient, id: string): Promise<EmailProposal> {
  const { data, error } = await db
    .from('email_proposals')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`proposals.markRejected: ${error.message}`);
  return emailProposalSchema.parse(data);
}
