import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Generate } from '@/modules/agents';
import { createBlock, getBlock } from '@/modules/blocks';
import { saveNoteDocument } from '@/modules/notes';
import {
  answerQuestion,
  askQuestion,
  getQuestionsForNote,
  getUnresolvedQuestions,
  resolveQuestion,
} from '@/modules/questions';
import {
  getReviewQueue,
  getStaleCount,
  resolveSources,
  runDerivation,
  type EngineContext,
} from '@/modules/recalc';
import { ensureWorkspace } from '@/modules/workspaces';

// THE slice-12 invariant: editing a block a question is anchored to marks that
// question's ANSWER stale.
//
// `staleness.test.ts` proves the trigger with raw SQL and
// `recalc-engine.test.ts` proves it through a summary. This proves it through
// the second recipe, and it proves it *by the mechanism* rather than by the
// symptom. A test that only edited the anchored paragraph and asserted
// `status === 'stale'` would pass just as happily if the app flagged every
// derivation whose note anybody touched. So the note here has two paragraphs,
// the question is anchored to exactly one of them, and the other one is the
// control: same note, same save, same editor — and it stales nothing, because
// it is not on the receipt.
//
// Same setup as the other two: the real Supabase project with the service-role
// key, because the cascade is a Postgres trigger and mocking it would test
// nothing. A throwaway auth user is created and deleted, which cascades to the
// workspace, its blocks, its questions, its anchors, its derivations and their
// receipts.
//
// The ONE thing faked is the provider's network — the AI SDK's own mock model,
// exactly as in recalc-engine.test.ts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'answer-staleness.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied (npm run db:push). See SETUP.md.'
  );
}

// ---------------------------------------------------------------------------
// A model that does not exist
// ---------------------------------------------------------------------------

const NO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const STOPPED = { unified: 'stop' as const, raw: 'stop' };

/** The AI SDK call, for real, over a model that answers from memory. */
function fakeDeepRole(said: () => string): Generate {
  return async ({ system, prompt }) => {
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
  };
}

// ---------------------------------------------------------------------------

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (blockId: string, value: string) => ({
  type: 'paragraph',
  attrs: { blockId },
  content: [text(value)],
});

const ANCHORED = 'Mitochondria are the powerhouse of the cell.';
const UNANCHORED = 'Chloroplasts are found in plants.';
const QUESTION = 'Why is the mitochondrion called a powerhouse?';

describe('an answer goes stale when its anchored note changes', () => {
  let db: SupabaseClient;
  let userId: string;
  let ctx: EngineContext;

  let docId: string;
  /** The paragraph the question is anchored to. */
  let anchored: string;
  /** A paragraph in the same note that the question is NOT anchored to. */
  let unanchored: string;

  let questionBlockId: string;
  let derivationId: string;

  let answerText = 'Because it makes most of the cell’s ATP, according to your notes.';
  const deepRole = fakeDeepRole(() => answerText);

  async function statusOf(id: string): Promise<string> {
    const { data, error } = await db
      .from('derivations')
      .select('status')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return data.status;
  }

  /** The receipt — `derivation_sources` — keyed by the block it names. */
  async function receipt(id: string) {
    const rows = await resolveSources(db, id);
    return new Map(rows.map(({ row }) => [row.source_block_id, row]));
  }

  /** The lifecycle row, read straight out of the table. */
  async function questionStatus(): Promise<string> {
    const { data, error } = await db
      .from('questions')
      .select('status')
      .eq('block_id', questionBlockId)
      .single();
    if (error) throw new Error(error.message);
    return data.status;
  }

  async function save(first: string, second: string) {
    await saveNoteDocument(db, ctx.workspaceId, docId, {
      nodes: [paragraph(anchored, first), paragraph(unanchored, second)],
    });
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const mine = await db.auth.admin.createUser({
      email: `answer-staleness-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (mine.error) throw new Error(`could not create test user: ${mine.error.message}`);
    userId = mine.data.user.id;

    const workspace = await ensureWorkspace(db, userId);
    ctx = { workspaceId: workspace.id, userId };

    const doc = await createBlock(db, {
      workspaceId: workspace.id,
      type: 'note',
      content: { text: 'Cell biology, lecture 4' },
    });
    docId = doc.id;

    anchored = randomUUID();
    unanchored = randomUUID();
    await save(ANCHORED, UNANCHORED);
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace and everything under it.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  // -------------------------------------------------------------------------

  describe('asking and answering', () => {
    it('anchors the question to exactly the blocks that were selected', async () => {
      const asked = await askQuestion(db, {
        workspaceId: ctx.workspaceId,
        text: QUESTION,
        anchorBlockIds: [anchored],
      });

      questionBlockId = asked.blockId;
      expect(asked.status).toBe('open');
      expect(asked.anchorBlockIds).toEqual([anchored]);

      const { data } = await db
        .from('question_anchors')
        .select('anchored_block_id')
        .eq('question_block_id', questionBlockId);
      expect(data?.map((row) => row.anchored_block_id)).toEqual([anchored]);
    });

    it('answers it through the slice 11 engine and writes a receipt', async () => {
      const result = await answerQuestion(db, ctx, questionBlockId, { generate: deepRole });

      expect(result.ok, result.ok ? '' : result.error).toBe(true);
      if (!result.ok) return;

      derivationId = result.derivationId;
      expect(result.text).toBe(answerText);
      expect(await statusOf(derivationId)).toBe('fresh');

      // The derivation is the engine's, with the second recipe on it — not a
      // second engine (prompts/12-questions.md, Constraints).
      const { data } = await db
        .from('derivations')
        .select('recipe, model')
        .eq('id', derivationId)
        .single();
      expect(data?.recipe).toBe('answer');
      expect(data?.model).toBe('mock/mock-deep');

      // THE receipt. It names the question and the one anchored paragraph, at
      // the version that was read and with the words that were read — and it
      // does NOT name the other paragraph in the same note. That membership is
      // the whole mechanism: it is the set the Postgres trigger walks.
      const rows = await receipt(derivationId);
      expect([...rows.keys()].sort()).toEqual([questionBlockId, anchored].sort());
      expect(rows.has(unanchored)).toBe(false);
      expect(rows.get(anchored)?.source_version).toBe(1);
      expect(rows.get(anchored)?.source_text).toBe(ANCHORED);
    });

    it('moves the question from open to answered, and no further', async () => {
      expect(await questionStatus()).toBe('answered');

      // Answered is not resolved: it is still an open loop and still counts.
      const unresolved = await getUnresolvedQuestions(db, ctx.workspaceId);
      expect(unresolved.map((question) => question.blockId)).toContain(questionBlockId);
    });
  });

  // -------------------------------------------------------------------------
  // The invariant, and the control that gives it meaning.
  // -------------------------------------------------------------------------

  describe('the cascade', () => {
    it('editing a paragraph that is NOT on the receipt stales nothing', async () => {
      await save(ANCHORED, 'Chloroplasts are found in plants and in some algae.');

      // The edit really happened — the block moved on.
      expect((await getBlock(db, unanchored))?.version).toBe(2);
      // ...and the answer is untouched, because that block is not on its
      // receipt. Same note, same save: only receipt membership decides.
      expect(await statusOf(derivationId)).toBe('fresh');
      expect(await getStaleCount(db, ctx.workspaceId)).toBe(0);
    });

    it('a whitespace-only edit to the anchored paragraph stales nothing either', async () => {
      await save(
        '  Mitochondria   are the powerhouse of the cell. ',
        'Chloroplasts are found in plants and in some algae.'
      );

      expect((await getBlock(db, anchored))?.version).toBe(1);
      expect(await statusOf(derivationId)).toBe('fresh');
    });

    it('a real edit to the anchored paragraph marks the ANSWER stale', async () => {
      await save(
        'Mitochondria are NOT the powerhouse of the cell.',
        'Chloroplasts are found in plants and in some algae.'
      );

      const block = await getBlock(db, anchored);
      expect(block?.version).toBe(2);

      // The receipt still names version 1 — that is what the trigger compared
      // against, and it is why this row is now stale.
      const rows = await receipt(derivationId);
      expect(rows.get(anchored)?.source_version).toBe(1);
      expect(block!.version).toBeGreaterThan(rows.get(anchored)!.source_version);

      expect(await statusOf(derivationId)).toBe('stale');
      expect(await getStaleCount(db, ctx.workspaceId)).toBe(1);
    });

    it('the note page shows the answer as out of date', async () => {
      const questions = await getQuestionsForNote(db, ctx.workspaceId, docId);
      const mine = questions.find((question) => question.blockId === questionBlockId);

      expect(mine?.answer?.status).toBe('stale');
      // The constraint from the prompt: the answer cites the blocks it drew
      // from, and they are the receipt's, never `question_anchors`.
      expect(mine?.answer?.citations.map((citation) => citation.blockId)).toEqual([anchored]);
      expect(mine?.answer?.citations[0].href).toBe(`/notes/${docId}`);
    });

    it('/review lists it as an answer to the question, with the words on both sides', async () => {
      const queue = await getReviewQueue(db, ctx.workspaceId);
      expect(queue).toHaveLength(1);

      const item = queue[0];
      expect(item.recipe).toBe('answer');
      expect(item.question).toBe(QUESTION);
      expect(item.currentText).toBe(answerText);
      expect(item.note?.blockId).toBe(docId);

      // The question block is the item's subject, not one of the sources that
      // changed underneath it.
      expect(item.sources.map((source) => source.blockId)).toEqual([anchored]);
      expect(item.sources[0].changed).toBe(true);
      expect(item.sources[0].readVersion).toBe(1);
      expect(item.sources[0].currentVersion).toBe(2);
      expect(item.sources[0].before).toBe(ANCHORED);
      expect(item.sources[0].after).toBe('Mitochondria are NOT the powerhouse of the cell.');
    });

    it('regenerating moves the receipt forward, and the loop closes', async () => {
      answerText = 'Your notes now say it is not, so they no longer support the name.';
      const result = await runDerivation(db, ctx, derivationId, { generate: deepRole });

      expect(result.ok, result.ok ? '' : result.error).toBe(true);
      expect(await statusOf(derivationId)).toBe('fresh');
      expect((await receipt(derivationId)).get(anchored)?.source_version).toBe(2);
      expect(await getStaleCount(db, ctx.workspaceId)).toBe(0);

      // ...and the next real edit to the same paragraph stales it again.
      await save(
        'Mitochondria are not the powerhouse; they make ATP.',
        'Chloroplasts are found in plants and in some algae.'
      );
      expect(await statusOf(derivationId)).toBe('stale');
    });
  });

  // -------------------------------------------------------------------------

  describe('the lifecycle', () => {
    it('resolved is a button I press, and takes the question off the list', async () => {
      const resolved = await resolveQuestion(db, ctx.workspaceId, questionBlockId);
      expect(resolved.status).toBe('resolved');

      const unresolved = await getUnresolvedQuestions(db, ctx.workspaceId);
      expect(unresolved.map((question) => question.blockId)).not.toContain(questionBlockId);
    });

    it('answering a resolved question again does not drag it back to answered', async () => {
      answerText = 'The same answer, generated once more.';
      const result = await answerQuestion(db, ctx, questionBlockId, { generate: deepRole });

      expect(result.ok, result.ok ? '' : result.error).toBe(true);
      expect(await questionStatus()).toBe('resolved');
    });

    it('refuses a question that is not in this workspace', async () => {
      await expect(
        askQuestion(db, {
          workspaceId: ctx.workspaceId,
          text: 'About a block that is not mine?',
          anchorBlockIds: [randomUUID()],
        })
      ).rejects.toThrow(/not in this workspace/);

      await expect(
        answerQuestion(db, ctx, randomUUID(), { generate: deepRole })
      ).rejects.toThrow(/no question/);
    });
  });
});
