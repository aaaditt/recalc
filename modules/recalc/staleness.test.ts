import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBlock, updateBlock, getBlock, type Block } from '@/modules/blocks';
import { ensureWorkspace } from '@/modules/workspaces';

// THE test. Editing a source block must mark every derivation that read an
// older version of it as stale — and a whitespace-only edit must not.
//
// The cascade is a Postgres trigger, so this runs against the real database
// with the service-role key. It creates a throwaway user + workspace and
// deletes them afterwards.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'staleness.test.ts needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local, and migration 001 applied (npm run db:push). See SETUP.md.'
  );
}

describe('staleness cascade', () => {
  let db: SupabaseClient;
  let userId: string;
  let workspaceId: string;
  let source: Block;
  let derivationId: string;

  beforeAll(async () => {
    db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await db.auth.admin.createUser({
      email: `staleness-test-${randomUUID()}@example.com`,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create test user: ${error.message}`);
    userId = data.user.id;

    const workspace = await ensureWorkspace(db, userId);
    workspaceId = workspace.id;

    source = await createBlock(db, {
      workspaceId,
      type: 'text',
      content: { text: 'Mitochondria are the powerhouse of the cell.' },
    });
    expect(source.version).toBe(1);

    const derived = await createBlock(db, {
      workspaceId,
      type: 'summary',
      content: { text: 'Cells get energy from mitochondria.' },
    });

    // Derivation rows are written directly here: the derivations module itself
    // is slice 11, but the schema and trigger exist now and must be proven.
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
      source_block_id: source.id,
      source_version: source.version,
    });
    if (sErr) throw new Error(`could not create derivation_sources: ${sErr.message}`);
  });

  afterAll(async () => {
    // Deleting the user cascades to the workspace, which cascades to blocks,
    // derivations and derivation_sources.
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

  it('a whitespace-only edit bumps nothing and stales nothing', async () => {
    await updateBlock(db, source.id, {
      content: { text: '  Mitochondria   are the powerhouse of the cell. ' },
    });

    const after = await getBlock(db, source.id);
    expect(after?.version).toBe(1);
    expect(await derivationStatus()).toBe('fresh');
  });

  it('a real content edit bumps the version and marks the derivation stale', async () => {
    await updateBlock(db, source.id, {
      content: { text: 'Mitochondria are NOT the powerhouse of the cell.' },
    });

    const after = await getBlock(db, source.id);
    expect(after?.version).toBe(2);
    expect(await derivationStatus()).toBe('stale');
  });
});
