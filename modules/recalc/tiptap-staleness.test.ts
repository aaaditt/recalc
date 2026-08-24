import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBlock, getBlock } from '@/modules/blocks';
import { saveNoteDocument } from '@/modules/notes';
import { ensureWorkspace } from '@/modules/workspaces';

// staleness.test.ts proves the cascade over a plain `{ text }` block. This
// proves the same thing over the shape slice 05 actually writes: a paragraph
// of a TipTap document, edited through the editor's save path.
//
// It is the same invariant — "editing a source block marks every derivation
// that read an older version of it as stale" — asked of rich text, because
// that is what the app now stores. If hashing had been left to stringify the
// node JSON, the two middle cases here would fail: reordering the document and
// applying bold would both stale a derivation that is perfectly up to date.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'tiptap-staleness.test.ts needs NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY in .env.local, and migrations applied. See SETUP.md.'
  );
}

const text = (value: string, marks?: string[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((mark) => ({ type: mark })) } : {}),
});

function paragraph(blockId: string, ...content: unknown[]) {
  return { type: 'paragraph', attrs: { blockId }, content };
}

describe('the staleness cascade over TipTap content', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let docId: string;
  let derivationId: string;

  // The paragraph a summary was built from, and the one beside it.
  const source = randomUUID();
  const other = randomUUID();

  const SOURCE_TEXT = 'Mitochondria are the powerhouse of the cell.';
  const OTHER_TEXT = 'They have their own DNA.';

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `tiptap-staleness-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    workspaceId = (await ensureWorkspace(db, userId)).id;

    const doc = await createBlock(db, {
      workspaceId,
      type: 'note',
      content: { text: 'Cell biology, lecture 4' },
    });
    docId = doc.id;

    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [paragraph(source, text(SOURCE_TEXT)), paragraph(other, text(OTHER_TEXT))],
    });

    const sourceBlock = await getBlock(db, source);
    expect(sourceBlock?.version).toBe(1);

    const derived = await createBlock(db, {
      workspaceId,
      type: 'summary',
      content: { text: 'Cells get energy from mitochondria.' },
    });

    // Derivation rows are written directly: the derivations module is slice
    // 11, but the schema and the trigger exist now and must go on being true.
    const { data: derivation, error: dErr } = await db
      .from('derivations')
      .insert({
        workspace_id: workspaceId,
        derived_block_id: derived.id,
        recipe: 'summarize',
        model: 'test-model',
        status: 'fresh',
      })
      .select('id')
      .single();
    if (dErr) throw new Error(`could not create derivation: ${dErr.message}`);
    derivationId = derivation.id;

    const { error: sErr } = await db.from('derivation_sources').insert({
      derivation_id: derivationId,
      source_block_id: source,
      source_version: sourceBlock?.version ?? 1,
    });
    if (sErr) throw new Error(`could not create derivation_sources: ${sErr.message}`);
  });

  afterAll(async () => {
    if (db && userId) await db.auth.admin.deleteUser(userId);
  });

  async function derivationStatus(): Promise<string> {
    const { data, error } = await db
      .from('derivations')
      .select('status')
      .eq('id', derivationId)
      .single();
    if (error) throw new Error(error.message);
    return data.status;
  }

  it('reordering the document stales nothing', async () => {
    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [paragraph(other, text(OTHER_TEXT)), paragraph(source, text(SOURCE_TEXT))],
    });

    expect((await getBlock(db, source))?.version).toBe(1);
    expect(await derivationStatus()).toBe('fresh');
  });

  it('bolding a word stales nothing', async () => {
    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(other, text(OTHER_TEXT)),
        paragraph(
          source,
          text('Mitochondria are the '),
          text('powerhouse', ['bold']),
          text(' of the cell.')
        ),
      ],
    });

    expect((await getBlock(db, source))?.version).toBe(1);
    expect(await derivationStatus()).toBe('fresh');
  });

  it('changing a word bumps the version and marks the derivation stale', async () => {
    await saveNoteDocument(db, workspaceId, docId, {
      nodes: [
        paragraph(other, text(OTHER_TEXT)),
        paragraph(source, text('Mitochondria are NOT the powerhouse of the cell.')),
      ],
    });

    expect((await getBlock(db, source))?.version).toBe(2);
    expect(await derivationStatus()).toBe('stale');
  });
});
