import { describe, expect, it } from 'vitest';

import {
  MODEL_CHOICES,
  agentProviderSchema,
  agentRoleSchema,
  chatModelFor,
  embedModelFor,
  keyHint,
  maskKey,
  modelsForRole,
  providersForRole,
  safeMessage,
} from '@/modules/agents';

// The invariant this file protects:
//
//   a role resolves to the provider and model the user chose, and nothing in
//   the app ever has to name a model to get one.
//
// CLAUDE.md's Never rule 6. Everything below is pure routing over strings — no
// database, no network, no real API key — which is deliberate: the routing is
// the part that can be silently wrong, and it must be provable without Aadit's
// own Anthropic, Google or OpenAI key.
//
// What this file CANNOT prove is that a key actually works. That needs a live
// call to a paid provider. `testAgentConnection` is the code path for it, and
// docs/DECISIONS.md records under "Noticed, not fixed" that it has never been
// run against a real key.

/** Long enough to pass every length check. Not a real key, and not key-shaped. */
const FAKE_KEY = 'not-a-real-key-0000000000000000';

describe('a role resolves to the provider the user picked', () => {
  it('builds an Anthropic model', () => {
    const model = chatModelFor({
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('claude-opus-5');
    expect(model.provider).toContain('anthropic');
  });

  it('builds a Google model', () => {
    const model = chatModelFor({
      provider: 'google',
      model: 'gemini-2.5-flash',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('gemini-2.5-flash');
    expect(model.provider).toContain('google');
  });

  it('builds an OpenAI model', () => {
    const model = chatModelFor({
      provider: 'openai',
      model: 'gpt-5-mini',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('gpt-5-mini');
    expect(model.provider).toContain('openai');
  });

  it('passes through a model id it has never heard of', () => {
    // The suggestion list is a menu, not a whitelist: a provider ships a model
    // more often than this app ships a slice, and typing the new id must work
    // with no code change (prompts/10-agents.md's definition of done: "switch
    // the provider to Gemini and have it still work without any code change").
    const model = chatModelFor({
      provider: 'anthropic',
      model: 'claude-something-not-released-yet',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('claude-something-not-released-yet');
  });

  it('switching provider is a settings change, not a refactor', () => {
    // The same role, filled two different ways. Nothing but the row differs.
    const before = chatModelFor({
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: FAKE_KEY,
    });
    const after = chatModelFor({
      provider: 'google',
      model: 'gemini-2.5-pro',
      apiKey: FAKE_KEY,
    });

    expect(before.provider).not.toBe(after.provider);
    expect(typeof before.doGenerate).toBe('function');
    expect(typeof after.doGenerate).toBe('function');
  });
});

describe('the embed role is a different kind of model', () => {
  it('builds a Google embedding model', () => {
    const model = embedModelFor({
      provider: 'google',
      model: 'gemini-embedding-001',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('gemini-embedding-001');
    expect(model.provider).toContain('google');
  });

  it('builds an OpenAI embedding model', () => {
    const model = embedModelFor({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: FAKE_KEY,
    });

    expect(model.modelId).toBe('text-embedding-3-small');
    expect(model.provider).toContain('openai');
  });

  it('refuses Anthropic, which publishes no embedding model', () => {
    expect(() =>
      embedModelFor({ provider: 'anthropic', model: 'claude-opus-5', apiKey: FAKE_KEY })
    ).toThrow(/no embedding model/i);
  });

  it('does not offer Anthropic for the embed role in the first place', () => {
    expect(providersForRole('embed')).toEqual(['google', 'openai']);
    expect(providersForRole('fast')).toEqual(['anthropic', 'google', 'openai']);
    expect(providersForRole('deep')).toEqual(['anthropic', 'google', 'openai']);
  });
});

describe('the model menu', () => {
  it('offers chat models for fast and deep, embedding models for embed', () => {
    for (const provider of providersForRole('fast')) {
      expect(modelsForRole(provider, 'fast')).toEqual(MODEL_CHOICES[provider].chat);
      expect(modelsForRole(provider, 'deep')).toEqual(MODEL_CHOICES[provider].chat);
    }
    for (const provider of providersForRole('embed')) {
      expect(modelsForRole(provider, 'embed')).toEqual(MODEL_CHOICES[provider].embed);
    }
  });

  it('has exactly three roles and three providers, and no others', () => {
    expect(agentRoleSchema.options).toEqual(['fast', 'deep', 'embed']);
    expect(agentProviderSchema.options).toEqual(['anthropic', 'google', 'openai']);
  });
});

describe('a key is never shown, logged, or echoed back', () => {
  const KEY = 'sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZZZ4f2a';

  it('keeps only the last four characters as a hint', () => {
    expect(keyHint(KEY)).toBe('4f2a');
    expect(keyHint(`  ${KEY}  `)).toBe('4f2a');
  });

  it('masks everything else', () => {
    const masked = maskKey(keyHint(KEY));
    expect(masked).toBe('••••••••4f2a');
    expect(masked).not.toContain('sk-ant');
    expect(KEY).not.toBe(masked);
  });

  it('scrubs the key out of a provider error message by value', () => {
    const error = new Error(`401 Incorrect API key provided: ${KEY}. You can find...`);
    const message = safeMessage(error, KEY);

    expect(message).not.toContain(KEY);
    expect(message).toContain('[redacted]');
  });

  it('scrubs a credential it was not told about, by shape', () => {
    const other = 'sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA';
    expect(safeMessage(new Error(`bad key ${other}`))).not.toContain(other);

    const googleKey = 'AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(safeMessage(new Error(`url?key=${googleKey}`))).not.toContain(googleKey);
  });

  it('collapses to one short line, and always says something', () => {
    const long = new Error(`x\n\n${'y'.repeat(500)}`);
    expect(safeMessage(long).length).toBeLessThanOrEqual(241);
    expect(safeMessage(long)).not.toContain('\n');

    expect(safeMessage(new Error(''))).toMatch(/did not say why/);
    expect(safeMessage('plain string failure')).toBe('plain string failure');
  });
});
