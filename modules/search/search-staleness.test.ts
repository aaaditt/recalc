import { createHash, randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedMany } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Embed } from '@/modules/agents';
import { createBlock, getBlock } from '@/modules/blocks';
import { saveNoteDocument } from '@/modules/notes';
import {
  EMBEDDING_DIMENSIONS,
  countPendingEmbeddings,
  getEmbeddingRows,
  indexWorkspace,
  purgeStaleEmbeddings,
  searchWorkspace,
} from '@/modules/search';
import { ensureWorkspace } from '@/modules/workspaces';

// THE slice-13 invariant:
//
//   Search NEVER returns a result computed from a stale embedding. A row whose
//   version is behind its block's current version is dead, and unreachable by
//   any query path.
//
// A test that only edited a paragraph and asserted "the old wording is not
// found" would pass just as happily against a design that DELETED the old
// embedding row on write — which is a different and much weaker guarantee,
// because it holds only for as long as that delete keeps happening. So the
// control case here is the physical row: after the edit, the version-1 vector
// is asserted to be STILL IN THE TABLE, and asserted to be unfindable anyway.
// The row is present; the predicate is what makes it dead.
//
// The semantic half is isolated deliberately. The query used against the edited
// block is its OLD wording — words that are no longer anywhere in `blocks`, so
// full text cannot match them, and a vector nearly identical to the stored
// version-1 one, so the vector half would rank it first if the version
// predicate were missing. If that block comes back, the predicate is gone.
//
// Same setup as slices 11 and 12: the real Supabase project with the
// service-role key, because the predicate is a Postgres view and mocking it
// would test nothing. A throwaway auth user is created and deleted, which
// cascades to the workspace, its blocks and their embeddings.
//
// The ONE thing faked is the provider's network — the AI SDK's own
// `MockEmbeddingModelV4`, exactly as recalc-engine.test.ts fakes the chat model.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'search-staleness.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied (npm run db:push). See SETUP.md.'
  );
}

// ---------------------------------------------------------------------------
// An embedding model that does not exist
//
// A bag of words, hashed into 1536 buckets and normalised. It is not a language
// model, but it has the one property this test needs and that random numbers do
// not: two passages sharing words are close, and two that share none are far.
// That makes "the old wording is a near-perfect match for the version-1 vector"
// a real fact about the numbers rather than something asserted about a mock.
// ---------------------------------------------------------------------------

function bagOfWords(value: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const word of value.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const digest = createHash('sha256').update(word).digest();
    vector[digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS] += 1;
  }

  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((n) => n / length);
}

/** The AI SDK call, for real, over a model that embeds from arithmetic. */
const fakeEmbedRole: Embed = async (values) => {
  const { embeddings } = await embedMany({
    model: new MockEmbeddingModelV4({
      provider: 'mock',
      modelId: 'mock-embed',
      maxEmbeddingsPerCall: 100,
      doEmbed: async ({ values: batch }) => ({
        embeddings: batch.map(bagOfWords),
        warnings: [],
      }),
    }),
    values,
  });

  return { vectors: embeddings, model: 'mock/mock-embed' };
};

// ---------------------------------------------------------------------------

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (blockId: string, value: string) => ({
  type: 'paragraph',
  attrs: { blockId },
  content: [text(value)],
});

const OLD_WORDING = 'The Carnot cycle sets the ceiling on thermal efficiency.';
const NEW_WORDING = 'Entropy always increases in an isolated system.';
const UNTOUCHED = 'A reversible process leaves no trace on the surroundings.';

describe('search never returns a result from a stale embedding', () => {
  let db: SupabaseClient;
  let userId: string;
  let ctx: { workspaceId: string; userId: string };

  let docId: string;
  /** The paragraph that gets edited. */
  let edited: string;
  /** A paragraph in the same note that is never touched. The control. */
  let untouched: string;

  const search = (query: string) =>
    searchWorkspace(db, ctx, query, { embed: fakeEmbedRole });

  /** Every block id the search screen would show for this query. */
  async function foundIds(query: string): Promise<string[]> {
    const results = await search(query);
    return results.groups.flatMap((group) => group.hits.map((hit) => hit.blockId));
  }

  /** The versions of `blockId` that physically have a vector stored. */
  async function storedVersions(blockId: string): Promise<number[]> {
    const rows = await getEmbeddingRows(db, [blockId]);
    return rows.map((row) => row.version).sort((a, b) => a - b);
  }

  /** The versions of `blockId` reachable through the view. */
  async function readableVersions(blockId: string): Promise<number[]> {
    const { data, error } = await db
      .from('current_block_embeddings')
      .select('version')
      .eq('block_id', blockId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => row.version as number).sort((a, b) => a - b);
  }

  async function save(first: string, second: string) {
    await saveNoteDocument(db, ctx.workspaceId, docId, {
      nodes: [paragraph(edited, first), paragraph(untouched, second)],
    });
  }

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const mine = await db.auth.admin.createUser({
      email: `search-staleness-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (mine.error) throw new Error(`could not create test user: ${mine.error.message}`);
    userId = mine.data.user.id;

    const workspace = await ensureWorkspace(db, userId);
    ctx = { workspaceId: workspace.id, userId };

    const doc = await createBlock(db, {
      workspaceId: workspace.id,
      type: 'note',
      content: { text: 'Thermodynamics, lecture 6' },
    });
    docId = doc.id;

    edited = randomUUID();
    untouched = randomUUID();
    await save(OLD_WORDING, UNTOUCHED);
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, its blocks and their vectors.
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  // -------------------------------------------------------------------------

  describe('indexing', () => {
    it('queues every block that has no vector at its current version', async () => {
      // Three: the note document (its title) and its two paragraphs.
      expect(await countPendingEmbeddings(db, ctx.workspaceId)).toBe(3);

      const result = await indexWorkspace(db, ctx, { embed: fakeEmbedRole });
      expect(result.error).toBeNull();
      expect(result.embedded).toBe(3);
      expect(result.remaining).toBe(0);
      expect(result.model).toBe('mock/mock-embed');

      expect(await storedVersions(edited)).toEqual([1]);
    });

    it('embeds nothing on a second pass, because nothing changed', async () => {
      const again = await indexWorkspace(db, ctx, { embed: fakeEmbedRole });
      expect(again.embedded).toBe(0);
      expect(again.remaining).toBe(0);
    });

    it('finds the passage by its words and by its meaning', async () => {
      const results = await search(OLD_WORDING);
      const hit = results.groups
        .flatMap((group) => group.hits)
        .find((found) => found.blockId === edited);

      expect(hit).toBeDefined();
      expect(hit?.text).toBe(OLD_WORDING);
      expect(hit?.version).toBe(1);
      // Both halves of the hybrid ran and both found it.
      expect(hit?.matchedText).toBe(true);
      expect(hit?.matchedMeaning).toBe(true);
      expect(results.semantic).toBe(true);
      expect(results.semanticNote).toBeNull();

      // It links into the note it was written in.
      expect(hit?.note?.blockId).toBe(docId);
      expect(hit?.note?.href).toBe(`/notes/${docId}`);
    });
  });

  // -------------------------------------------------------------------------
  // The invariant, and the control that gives it meaning.
  // -------------------------------------------------------------------------

  describe('the edit', () => {
    it('bumps the version and leaves the old vector behind, still in the table', async () => {
      await save(NEW_WORDING, UNTOUCHED);

      const block = await getBlock(db, edited);
      expect(block?.version).toBe(2);

      // THE CONTROL. The version-1 row is still physically stored — this design
      // does not delete on write, and if it did, everything below would pass
      // for the wrong reason.
      expect(await storedVersions(edited)).toEqual([1]);
      // ...and it is already unreadable, before anything has been cleaned up
      // and before anything has been re-embedded.
      expect(await readableVersions(edited)).toEqual([]);
    });

    it('does not surface the block under its old wording', async () => {
      // The strongest form of the claim. This query is:
      //   * unmatchable by full text — those words are no longer in `blocks`
      //   * a near-exact match for the version-1 vector, which is still stored
      // So if the version predicate were missing from the semantic half, this
      // block would come back first. It must not come back at all.
      expect(await foundIds(OLD_WORDING)).not.toContain(edited);
    });

    it('is findable by its new wording straight away', async () => {
      // prompts/13-search.md: "a passage I edited five minutes ago is already
      // findable in its new form". The full-text half reads live blocks, so
      // this is true in the same statement that saved the edit — before any
      // re-embedding has happened at all.
      const results = await search(NEW_WORDING);
      const hit = results.groups
        .flatMap((group) => group.hits)
        .find((found) => found.blockId === edited);

      expect(hit).toBeDefined();
      expect(hit?.text).toBe(NEW_WORDING);
      expect(hit?.version).toBe(2);
      expect(hit?.matchedText).toBe(true);
      // ...and NOT by meaning: the only vector this block has is the old one,
      // and it is dead.
      expect(hit?.matchedMeaning).toBe(false);
    });

    it('leaves the untouched paragraph alone — only changed blocks are re-embedded', async () => {
      // The control on the queue. Same note, same save, same editor: one
      // paragraph is waiting and the other is not, because only one version
      // moved.
      expect(await countPendingEmbeddings(db, ctx.workspaceId)).toBe(1);
      expect(await storedVersions(untouched)).toEqual([1]);
      expect(await readableVersions(untouched)).toEqual([1]);
      expect(await foundIds(UNTOUCHED)).toContain(untouched);
    });
  });

  // -------------------------------------------------------------------------

  describe('re-embedding', () => {
    it('adds a vector at the new version without disturbing the old row', async () => {
      const result = await indexWorkspace(db, ctx, { embed: fakeEmbedRole });
      expect(result.error).toBeNull();
      expect(result.embedded).toBe(1);
      expect(result.remaining).toBe(0);

      // Both rows exist. Exactly one is reachable.
      expect(await storedVersions(edited)).toEqual([1, 2]);
      expect(await readableVersions(edited)).toEqual([2]);
    });

    it('now finds the new wording by meaning too', async () => {
      const results = await search(NEW_WORDING);
      const hit = results.groups
        .flatMap((group) => group.hits)
        .find((found) => found.blockId === edited);

      expect(hit?.matchedMeaning).toBe(true);
      expect(hit?.version).toBe(2);
    });

    it('reaches the block only through the new vector, with the old one still stored', async () => {
      // Both rows are in the table; exactly one is readable. From here on the
      // block IS legitimately reachable — by its version-2 vector — so the
      // claim worth asserting is no longer "it cannot be found" but "the only
      // row it can be found through is the current one", which is what the
      // view says.
      expect(await storedVersions(edited)).toEqual([1, 2]);
      expect(await readableVersions(edited)).toEqual([2]);

      // ...and whatever a search shows for it, it shows the words the block has
      // now, at the version it is now. A stale row can never put old text on
      // the screen, because the text comes from `blocks`, not from the vector.
      const hit = (await search(OLD_WORDING)).groups
        .flatMap((group) => group.hits)
        .find((found) => found.blockId === edited);

      if (hit) {
        expect(hit.text).toBe(NEW_WORDING);
        expect(hit.version).toBe(2);
        expect(hit.matchedText).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('deletes the rows that were already unreadable, and nothing else', async () => {
      const removed = await purgeStaleEmbeddings(db, ctx.workspaceId);
      expect(removed).toBe(1);

      expect(await storedVersions(edited)).toEqual([2]);
      expect(await readableVersions(edited)).toEqual([2]);
      // The untouched paragraph's vector is current, so cleanup left it alone.
      expect(await storedVersions(untouched)).toEqual([1]);

      // Running it again finds nothing to do.
      expect(await purgeStaleEmbeddings(db, ctx.workspaceId)).toBe(0);
    });

    it('changes no answer search gives — the view was already the guard', async () => {
      expect(await foundIds(NEW_WORDING)).toContain(edited);
      expect(await foundIds(UNTOUCHED)).toContain(untouched);

      // The words on screen are still the current ones, and still at the
      // current version. Deleting the dead row moved nothing, which is the
      // point: cleanup reclaims space, it does not enforce the invariant.
      const hit = (await search(NEW_WORDING)).groups
        .flatMap((group) => group.hits)
        .find((found) => found.blockId === edited);
      expect(hit?.text).toBe(NEW_WORDING);
      expect(hit?.version).toBe(2);
    });
  });

  // -------------------------------------------------------------------------

  describe('with no embed role at all', () => {
    it('still searches, by words, and says why', async () => {
      // What this machine actually is: no provider key, `agent_profiles`
      // empty. The real `embedWithRole` is used — no stand-in — so the registry
      // genuinely throws AgentNotConfigured and the module genuinely degrades.
      const results = await searchWorkspace(db, ctx, NEW_WORDING);

      expect(results.semantic).toBe(false);
      expect(results.semanticNote).toMatch(/Settings/);
      expect(results.groups.flatMap((group) => group.hits).map((hit) => hit.blockId)).toContain(
        edited
      );
    });

    it('reports the same when asked to index', async () => {
      // Nothing is pending, so nothing is attempted and nothing fails.
      expect(await countPendingEmbeddings(db, ctx.workspaceId)).toBe(0);

      await save(NEW_WORDING, 'A reversible process leaves the surroundings unchanged.');
      expect(await countPendingEmbeddings(db, ctx.workspaceId)).toBe(1);

      const result = await indexWorkspace(db, ctx);
      expect(result.embedded).toBe(0);
      expect(result.remaining).toBe(1);
      expect(result.error).toMatch(/Settings/);
    });
  });
});
