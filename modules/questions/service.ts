import type { SupabaseClient } from '@supabase/supabase-js';

import { localTimeZone } from '@/lib/time';
import { createBlock, getBlocks, plainTextOf, type Block } from '@/modules/blocks';
import { getNoteRefs, listNotes } from '@/modules/notes';
import {
  generateAnswer,
  getAnswers,
  type Answer,
  type EngineContext,
  type RunOptions,
  type RunResult,
} from '@/modules/recalc';

import * as repo from './repo';
import {
  askQuestionInputSchema,
  type AskQuestionInput,
  type QuestionAnswerView,
  type QuestionCitation,
  type QuestionRow,
  type QuestionView,
} from './schema';

// Questions — the slice that turns "what I did not understand" into a list.
//
// Two things live here and nowhere else:
//
//   1. The lifecycle. open -> answered (automatic, once a derivation actually
//      produced an answer) -> resolved (a button I press myself, never
//      automatic). Answered is not the end: an answered question I have not
//      resolved is still an open loop and still counts.
//
//   2. Where a question sits in the semester. A question's course and syllabus
//      unit come from the note its anchored blocks live in, which modules/notes
//      already resolves both ways — a lecture note through the lecture's topic,
//      a free-standing one through its own row. This module reads that answer;
//      it does not keep a second copy of it.
//
// The answering itself is slice 11's engine, untouched: `generateAnswer` in
// modules/recalc creates the derivation and hands it to the same `runDerivation`
// a summary goes through, and the staleness cascade is the same Postgres
// trigger. There is no second engine in here.
//
// Every id below arrives from a browser, and every one is proved against the
// caller's workspace before anything is written — the pattern slices 04 through
// 11 arrived at the hard way (docs/DECISIONS.md). The check is inside the
// module, so no call site can forget it because no call site performs it.

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Prove that every one of these blocks is a live block in this workspace.
 *
 * `workspaceId` is never forgeable — every caller re-derives it from the
 * session — but the block ids come straight out of the editor. The
 * `question_anchors` insert policy checks only that the *question* block is
 * ours; it was never asked to prove anything about the blocks it points at.
 */
async function ownedBlocks(
  db: SupabaseClient,
  workspaceId: string,
  blockIds: string[]
): Promise<Block[]> {
  const wanted = [...new Set(blockIds)];
  const blocks = (await getBlocks(db, wanted)).filter(
    (block) => block.workspace_id === workspaceId && block.deleted_at === null
  );

  if (blocks.length !== wanted.length) {
    throw new Error('questions: one of those blocks is not in this workspace');
  }
  return blocks;
}

/** The question's own row, proved. Throws rather than returning null: a forged
 *  id is a caller bug, not a state a screen has to render. */
async function ownedQuestion(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockId: string
): Promise<QuestionRow> {
  const question = await repo.findByBlock(db, workspaceId, questionBlockId);
  if (!question) {
    throw new Error(`questions: no question ${questionBlockId} in this workspace`);
  }
  return question;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/**
 * "Ask about this" — a sentence is selected in a note and a question is typed.
 *
 * The question block is deliberately NOT a child of the note document.
 * `saveNoteDocument` reconciles a document against the nodes the editor sent
 * and soft-deletes every child it does not recognise, so a question parked in
 * there would be destroyed by the next keystroke. It hangs off nothing, and
 * `question_anchors` is what says which paragraphs it is about — the same
 * answer slice 11 reached for summary blocks.
 */
export async function askQuestion(
  db: SupabaseClient,
  input: AskQuestionInput
): Promise<QuestionView> {
  const parsed = askQuestionInputSchema.parse(input);

  const anchors = await ownedBlocks(db, parsed.workspaceId, parsed.anchorBlockIds);

  const block = await createBlock(db, {
    workspaceId: parsed.workspaceId,
    type: 'question',
    content: { text: parsed.text },
  });

  const row = await repo.insert(db, {
    workspace_id: parsed.workspaceId,
    block_id: block.id,
  });
  await repo.insertAnchors(db, block.id, anchors.map((anchor) => anchor.id));

  return {
    id: row.id,
    blockId: block.id,
    text: parsed.text,
    status: row.status,
    createdAt: row.created_at,
    anchorBlockIds: anchors.map((anchor) => anchor.id),
    note: null,
    courseId: null,
    unitId: null,
    answer: null,
  };
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

/**
 * "Answer it."
 *
 * Slice 11's worker does all of the work. This function's whole job on top of
 * it is the one lifecycle transition that IS automatic: a question that has
 * been answered says so. It moves `open` -> `answered` only, so a question
 * already resolved is not dragged backwards by a regeneration.
 */
export async function answerQuestion(
  db: SupabaseClient,
  ctx: EngineContext,
  questionBlockId: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const question = await ownedQuestion(db, ctx.workspaceId, questionBlockId);
  const anchors = await repo.listAnchors(db, [questionBlockId]);

  if (anchors.length === 0) {
    return {
      ok: false,
      derivationId: null,
      error: 'This question is not anchored to anything, so there is nothing to answer from.',
    };
  }

  const result = await generateAnswer(
    db,
    ctx,
    {
      questionBlockId: question.block_id,
      anchorBlockIds: anchors.map((anchor) => anchor.anchored_block_id),
    },
    options
  );

  if (result.ok && question.status === 'open') {
    await repo.setStatus(db, question.id, 'answered');
  }

  return result;
}

// ---------------------------------------------------------------------------
// The lifecycle's manual half
// ---------------------------------------------------------------------------

/**
 * "I understand this now."
 *
 * The only way a question becomes `resolved`. Nothing infers it — not a
 * successful answer, not a run of the engine, not time passing. That is the
 * whole point of the third status: it means a person read the answer and was
 * satisfied by it, which is not something the app can observe.
 */
export async function resolveQuestion(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockId: string
): Promise<QuestionRow> {
  const question = await ownedQuestion(db, workspaceId, questionBlockId);
  return repo.setStatus(db, question.id, 'resolved');
}

/**
 * "Actually, I do not." Back to `answered` if there is an answer, `open` if not.
 *
 * Resolving is one tap and mis-taps happen; without this the only way back is
 * asking the question again, which would lose its answer and its history.
 */
export async function reopenQuestion(
  db: SupabaseClient,
  workspaceId: string,
  questionBlockId: string
): Promise<QuestionRow> {
  const question = await ownedQuestion(db, workspaceId, questionBlockId);
  const answers = await getAnswers(db, workspaceId, [questionBlockId]);

  return repo.setStatus(db, question.id, answers.has(questionBlockId) ? 'answered' : 'open');
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Every question in the workspace, newest first, with its answer, its citations
 * and where it sits in the semester.
 *
 * Done in one pass over a handful of batched reads rather than per question,
 * and narrowed in memory by the callers below — the same trade `/tasks`,
 * `/courses` and modules/study already make. At one student's scale this is a
 * few hundred rows; the indexes to push it into SQL are in migration 008.
 */
export async function listQuestions(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone()
): Promise<QuestionView[]> {
  const rows = await repo.listQuestions(db, workspaceId);
  if (rows.length === 0) return [];

  const questionBlockIds = rows.map((row) => row.block_id);
  const anchorRows = await repo.listAnchors(db, questionBlockIds);
  const answers = await getAnswers(db, workspaceId, questionBlockIds);

  const anchorsOf = new Map<string, string[]>();
  for (const anchor of anchorRows) {
    const found = anchorsOf.get(anchor.question_block_id) ?? [];
    found.push(anchor.anchored_block_id);
    anchorsOf.set(anchor.question_block_id, found);
  }

  // Every block any of this needs: the questions themselves, their anchors, and
  // whatever the answers actually read (which is the receipt, not the anchors).
  const cited = [...answers.values()].flatMap((answer) => answer.sourceBlockIds);
  const blocks = await getBlocks(db, [
    ...new Set([...questionBlockIds, ...anchorRows.map((a) => a.anchored_block_id), ...cited]),
  ]);
  const blockById = new Map(blocks.map((block) => [block.id, block]));

  // Where each of those blocks lives, and what the note it lives in is about.
  // modules/notes owns both halves; nothing is resolved twice here.
  const refs = await getNoteRefs(db, workspaceId, [
    ...new Set([...anchorRows.map((a) => a.anchored_block_id), ...cited]),
  ]);
  const notes = new Map(
    (await listNotes(db, workspaceId, timeZone)).map((note) => [note.blockId, note])
  );

  function citation(blockId: string): QuestionCitation {
    const block = blockById.get(blockId);
    const ref = refs.get(blockId);
    const note = ref ? notes.get(ref.docId) : undefined;

    return {
      blockId,
      text: block ? plainTextOf(block.content) : '',
      noteTitle: ref?.title ?? null,
      href: ref?.href ?? null,
      date: note?.date ?? null,
    };
  }

  function answerView(answer: Answer): QuestionAnswerView {
    return {
      derivationId: answer.derivationId,
      blockId: answer.blockId,
      text: answer.text,
      status: answer.status,
      error: answer.error,
      model: answer.model,
      computedAt: answer.computedAt,
      citations: answer.sourceBlockIds.map(citation),
    };
  }

  return rows.map((row) => {
    const anchorBlockIds = anchorsOf.get(row.block_id) ?? [];
    // A question's home is the note its anchors sit in. They all sit in the
    // same one — a selection cannot span two documents — so the first that
    // resolves is the answer.
    const ref = anchorBlockIds.map((id) => refs.get(id)).find((found) => found !== undefined);
    const note = ref ? notes.get(ref.docId) : undefined;
    const answer = answers.get(row.block_id);
    const block = blockById.get(row.block_id);

    return {
      id: row.id,
      blockId: row.block_id,
      text: block ? plainTextOf(block.content) : '',
      status: row.status,
      createdAt: row.created_at,
      anchorBlockIds,
      note: ref
        ? { blockId: ref.docId, title: ref.title, href: ref.href, date: note?.date ?? null }
        : null,
      courseId: note?.courseId ?? null,
      unitId: note?.unitId ?? null,
      answer: answer ? answerView(answer) : null,
    };
  });
}

/** The questions asked in one note document, oldest first — reading order. */
export async function getQuestionsForNote(
  db: SupabaseClient,
  workspaceId: string,
  noteBlockId: string,
  timeZone: string = localTimeZone()
): Promise<QuestionView[]> {
  const all = await listQuestions(db, workspaceId, timeZone);
  return all
    .filter((question) => question.note?.blockId === noteBlockId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * Every question still asking something of me: `open` or `answered`, never
 * `resolved`. This is the revision list docs/PRODUCT.md is built around.
 */
export async function getUnresolvedQuestions(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone()
): Promise<QuestionView[]> {
  const all = await listQuestions(db, workspaceId, timeZone);
  return all.filter((question) => question.status !== 'resolved');
}
