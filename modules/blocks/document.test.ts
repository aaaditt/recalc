import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBlock, getBlock, getChildBlocks } from '@/modules/blocks';
import { saveNoteDocument } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// THE invariant of slice 05:
//
//   a note is a document on screen and a pile of versioned blocks underneath,
//   and only a real change to the words moves a version.
//
// Typing produces a save every second or so. If any of those saves bumped a
// version it should not have — because a paragraph moved, because bold was
// applied, because a stray space was deleted — then every derivation built
// from that note goes stale for nothing, and by week two the /review queue is
// noise and the product is dead.
//
// Real database: `version`, `content_hash` and the cascade are all in Postgres.
// Throwaway user + workspace, deleted afterwards.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'document.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migrations applied. See SETUP.md.'
  );
}

/** A paragraph node exactly as the editor sends one. */
function paragraph(blockId: string, ...content: unknown[]) {
  return { type: 'paragraph', attrs: { blockId }, content };
}

const text = (value: string, marks?: string[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((mark) => ({ type: mark })) } : {}),
});

describe('a note document over blocks', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let docId: string;

  // The three paragraphs the tests move around.
  const first = randomUUID();
  const second = randomUUID();
  const third = randomUUID();

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `document-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;

    const doc = await createBlock(db, {
      workspaceId,
      type: 'note',
      content: { text: 'Lecture 4' },
    });
    docId = doc.id;

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(first, text('Mitochondria are the powerhouse of the cell.')),
        paragraph(second, text('They have their own DNA.')),
        paragraph(third, text('Ask about the electron transport chain.')),
      ],
    });
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  it('writes one block per top-level node, in document order', async () => {
    const children = await getChildBlocks(db, docId);

    expect(children.map((block) => block.id)).toEqual([first, second, third]);
    expect(children.every((block) => block.version === 1)).toBe(true);
    expect(children.every((block) => block.type === 'text')).toBe(true);
  });

  it('reordering paragraphs changes position and nothing else', async () => {
    const before = await getChildBlocks(db, docId);

    // The third paragraph dragged to the top.
    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(third, text('Ask about the electron transport chain.')),
        paragraph(first, text('Mitochondria are the powerhouse of the cell.')),
        paragraph(second, text('They have their own DNA.')),
      ],
    });

    const after = await getChildBlocks(db, docId);
    expect(after.map((block) => block.id)).toEqual([third, first, second]);

    for (const block of before) {
      const now = after.find((row) => row.id === block.id);
      expect(now?.version, `version of ${block.id}`).toBe(block.version);
      expect(now?.content_hash).toBe(block.content_hash);
    }
  });

  it('a formatting-only change does not bump a version', async () => {
    const before = await getBlock(db, first);

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(third, text('Ask about the electron transport chain.')),
        // Same sentence: "powerhouse" bolded, and an extra space that a
        // careless keystroke left behind.
        paragraph(
          first,
          text('Mitochondria are the  '),
          text('powerhouse', ['bold']),
          text(' of the cell.')
        ),
        paragraph(second, text('They have their own DNA.')),
      ],
    });

    const after = await getBlock(db, first);
    expect(after?.version).toBe(before?.version);
    expect(after?.content_hash).toBe(before?.content_hash);
    // The formatting itself is saved, even though the version did not move.
    expect(JSON.stringify(after?.content)).toContain('bold');
  });

  it('a real word change bumps exactly that block', async () => {
    const before = await getChildBlocks(db, docId);

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(third, text('Ask about the electron transport chain.')),
        paragraph(
          first,
          text('Mitochondria are the  '),
          text('powerhouse', ['bold']),
          text(' of the cell.')
        ),
        paragraph(second, text('They have their own circular DNA.')),
      ],
    });

    const after = await getChildBlocks(db, docId);
    const edited = after.find((block) => block.id === second);
    expect(edited?.version).toBe(2);

    for (const block of before.filter((row) => row.id !== second)) {
      expect(after.find((row) => row.id === block.id)?.version).toBe(block.version);
    }
  });

  it('deleting a node soft-deletes the block instead of destroying it', async () => {
    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(third, text('Ask about the electron transport chain.')),
        paragraph(second, text('They have their own circular DNA.')),
      ],
    });

    const children = await getChildBlocks(db, docId);
    expect(children.map((block) => block.id)).toEqual([third, second]);

    // Still there, with its version and its words intact — a derivation may
    // name this block, and provenance outlives the paragraph.
    const gone = await getBlock(db, first);
    expect(gone).not.toBeNull();
    expect(gone?.deleted_at).not.toBeNull();
    expect(JSON.stringify(gone?.content)).toContain('powerhouse');
  });

  it('a new paragraph keeps the id the editor gave it', async () => {
    const fourth = randomUUID();

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(third, text('Ask about the electron transport chain.')),
        paragraph(second, text('They have their own circular DNA.')),
        paragraph(fourth, text('Read chapter 7 before Thursday.')),
      ],
    });

    const children = await getChildBlocks(db, docId);
    expect(children.map((block) => block.id)).toEqual([third, second, fourth]);
    expect(children[2].version).toBe(1);
  });
});
