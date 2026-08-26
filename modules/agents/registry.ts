import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptSecret } from '@/lib/crypto';

import * as repo from './repo';
import {
  AgentKeyUnreadable,
  AgentNotConfigured,
  type AgentProvider,
  type AgentRole,
} from './schema';

// ---------------------------------------------------------------------------
// THE registry. CLAUDE.md's Never rule 6:
//
//   "Never name a model in app code. Ask `agents.registry` for a role: `fast`,
//    `deep`, or `embed`. The user picks which model fills each role."
//
// This file is therefore the only place in the whole codebase that imports a
// provider SDK. `modules/agents/no-provider-sdk.test.ts` reads the tree and
// fails if a second one ever appears, because a rule written only in a markdown
// file lasts until the first slice where breaking it is convenient.
//
// It is also the only place `decryptSecret` is called on an API key. The
// plaintext exists for the length of one function call, is handed straight to a
// provider factory, and is never returned, logged, or put in an error message.
//
// Why there is no `import 'server-only'` here, even though this file handles a
// decrypted secret: `server-only`'s default export throws outside a React
// Server Component, so anything importing it cannot be unit-tested — the same
// reason lib/crypto.ts leaves it out (docs/DECISIONS.md). The guarantee is kept
// by the test named above instead, which is stronger: it fails the build for a
// `'use client'` file that imports this module, rather than failing at runtime.
// ---------------------------------------------------------------------------

/** What the three provider SDKs hand back for a text model. */
export type ChatModel = ReturnType<AnthropicProvider['languageModel']>;

/** ...and for an embedding model. Anthropic has none; see `embedModelFor`. */
export type EmbedModel = ReturnType<OpenAIProvider['embeddingModel']>;

/** Everything needed to build a model, with the key already in the clear. */
export type ModelSpec = {
  provider: AgentProvider;
  model: string;
  apiKey: string;
};

/**
 * Build a text model.
 *
 * Pure routing: provider name in, configured AI SDK model out. No database, no
 * environment, no network — which is what makes `registry.test.ts` able to
 * prove the routing without a live key.
 *
 * The key is passed explicitly on every call. If it were omitted, each provider
 * SDK would silently fall back to its own environment variable
 * (`ANTHROPIC_API_KEY` and friends) — and this app is BYOK: the key comes from
 * the user's row, never from the server's environment.
 */
export function chatModelFor(spec: ModelSpec): ChatModel {
  switch (spec.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: spec.apiKey }).languageModel(spec.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: spec.apiKey }).languageModel(spec.model);
    case 'openai':
      return createOpenAI({ apiKey: spec.apiKey }).languageModel(spec.model);
  }
}

/**
 * Build an embedding model.
 *
 * Anthropic does not publish one — `@ai-sdk/anthropic` types its
 * `textEmbeddingModel` as returning `never` — so that combination is refused
 * here with a sentence rather than allowed to fail at the provider.
 */
export function embedModelFor(spec: ModelSpec): EmbedModel {
  switch (spec.provider) {
    case 'anthropic':
      throw new Error(
        'Anthropic has no embedding model. Use Google or OpenAI for the embed role.'
      );
    case 'google':
      return createGoogleGenerativeAI({ apiKey: spec.apiKey }).embeddingModel(spec.model);
    case 'openai':
      return createOpenAI({ apiKey: spec.apiKey }).embeddingModel(spec.model);
  }
}

/**
 * Read the key filling a role and put it in the clear.
 *
 * The one place `decryptSecret` touches an API key. Both failures — no row, and
 * a row that will not decrypt — become named errors a caller can degrade on
 * without matching a string.
 *
 * Exported for `service.ts`, which needs the plaintext to scrub it back out of
 * a provider's error message. It is deliberately NOT in `index.ts`: the module
 * boundary lint rule means nothing outside `modules/agents` can reach it.
 */
export async function modelSpecFor(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<ModelSpec> {
  const profile = await repo.find(db, userId, role);
  if (!profile) throw new AgentNotConfigured(role);

  try {
    return {
      provider: profile.provider,
      model: profile.model,
      apiKey: decryptSecret(profile.api_key_enc),
    };
  } catch {
    // Deliberately swallowed: a crypto failure's message is about bytes, and
    // there is exactly one thing that causes it. Re-thrown as a sentence.
    throw new AgentKeyUnreadable(role);
  }
}

/**
 * The public way the rest of the app reaches a model.
 *
 * prompts/10-agents.md asks for `getModel(role)`. It takes the Supabase client
 * and the user id first, because every repo and service in this project does
 * (docs/DECISIONS.md, "Repos and services take the Supabase client as their
 * first argument") — the same code has to run as the signed-in user in the app
 * and as the service role in tests.
 *
 * Throws `AgentNotConfigured` when the role is empty and `AgentKeyUnreadable`
 * when the stored key cannot be decrypted. Callers catch those and degrade;
 * nothing here ever crashes a page.
 */
export async function getModel(
  db: SupabaseClient,
  userId: string,
  role: 'fast' | 'deep'
): Promise<ChatModel>;
export async function getModel(
  db: SupabaseClient,
  userId: string,
  role: 'embed'
): Promise<EmbedModel>;
export async function getModel(
  db: SupabaseClient,
  userId: string,
  role: AgentRole
): Promise<ChatModel | EmbedModel> {
  const spec = await modelSpecFor(db, userId, role);
  return role === 'embed' ? embedModelFor(spec) : chatModelFor(spec);
}
