import { z } from 'zod';

import type { ExtractedItem } from '@/modules/recalc';

// modules/proposals owns `email_proposals` and nothing else.
//
// docs/PRODUCT.md, "Scope boundaries": "Email is read-only. The app never sends
// mail. Extractions are *proposals* the user accepts — never written straight
// into the task list." Every shape in this file exists to keep that sentence
// true, and the one that carries the most weight is `fingerprintOf`: it is what
// the database's unique index is built on, and therefore what makes a rejected
// proposal block its own re-proposal for ever.

export const proposalKindSchema = z.enum(['deadline', 'class_change', 'material']);
export const proposalStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);

export type ProposalKind = z.infer<typeof proposalKindSchema>;
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

/**
 * What was found, and — always — the words it was found in.
 *
 * `sourceText` is the whole reason a proposal can be judged in one glance
 * (prompts/15-email-extraction.md, Constraints). The recipe refuses to keep an
 * item whose `sourceText` is not literally in the email, so this is a quote,
 * not a paraphrase.
 */
export const proposalPayloadSchema = z.object({
  sourceText: z.string(),
  title: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  change: z.enum(['cancelled', 'room', 'rescheduled']).optional(),
  on: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  where: z.string().nullable().optional(),
});

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

export const emailProposalSchema = z.object({
  id: z.uuid(),
  email_id: z.uuid(),
  kind: proposalKindSchema,
  payload: proposalPayloadSchema,
  confidence: z.number(),
  status: proposalStatusSchema,
  fingerprint: z.string(),
  course_id: z.uuid().nullable(),
  meeting_id: z.uuid().nullable(),
  task_id: z.uuid().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});

export type EmailProposal = z.infer<typeof emailProposalSchema>;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** NFKC, whitespace collapsed, lowercased — the same normalisation blocks use. */
export function flatten(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The date half of an instant, or '' — "due Friday" twice is one deadline. */
function dayOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 10);
}

/**
 * The identity of the thing being proposed.
 *
 * `email_proposals` has a unique index on (email_id, fingerprint), so this
 * string is what "never propose the same thing twice from the same email"
 * actually means. It has to be stable across runs of the model — hence the
 * normalisation and the day rather than the instant — and it has to be
 * different for two genuinely different things in one email.
 */
export function fingerprintOf(item: ExtractedItem): string {
  if (item.kind === 'deadline') {
    return `deadline|${flatten(item.title)}|${dayOf(item.dueAt)}`;
  }
  if (item.kind === 'class_change') {
    return `class_change|${item.change}|${dayOf(item.on)}`;
  }
  return `material|${flatten(item.title)}`;
}

/** The item as it is stored. Everything the screen shows comes from here. */
export function payloadOf(item: ExtractedItem): ProposalPayload {
  if (item.kind === 'deadline') {
    return { sourceText: item.sourceText, title: item.title, dueAt: item.dueAt };
  }
  if (item.kind === 'class_change') {
    return {
      sourceText: item.sourceText,
      change: item.change,
      on: item.on,
      room: item.room,
    };
  }
  return { sourceText: item.sourceText, title: item.title, where: item.where };
}

/** The title a task made from this proposal would carry. */
export function taskTitleOf(kind: ProposalKind, payload: ProposalPayload): string {
  const title = (payload.title ?? '').trim();
  if (kind === 'material') return title === '' ? 'Look at the material from this email' : title;
  return title === '' ? 'Something from an email' : title;
}
