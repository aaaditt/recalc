import { z } from 'zod';

// The BYOK layer. docs/SCHEMA.md, "Agents (bring your own key)":
//
//   agent_profiles (id, user_id, role, provider, model, api_key_enc, created_at)
//                  -- role: fast | deep | embed   (unique per user+role)
//
// CLAUDE.md's Never rule 6 is the whole reason this module exists: "Never name a
// model in app code. Ask `agents.registry` for a role: `fast`, `deep`, or
// `embed`. The user picks which model fills each role."
//
// So a model name appears in exactly two places in this project: the `model`
// column of a row the user typed, and the suggestion list below — which is a
// menu, not a choice the app makes.

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The three things the rest of the app is allowed to ask for.
 *
 * `fast`  — cheap and quick: a title, a tidy-up, a "did this change the meaning"
 *           gate. Called often.
 * `deep`  — the summary, the flashcards, the answer to a question. Called rarely
 *           and worth paying for.
 * `embed` — vectors for search (slice 13). A different kind of model entirely,
 *           which is why it is a separate role rather than a flag.
 */
export const agentRoleSchema = z.enum(['fast', 'deep', 'embed']);

/** Ordered the way the settings screen lists them. */
export const AGENT_ROLES = ['fast', 'deep', 'embed'] as const;

/** One line of plain English per role, shown above each card. */
export const ROLE_BLURB: Record<AgentRole, string> = {
  fast: 'Quick, cheap jobs. Called often, so it should be the cheap model.',
  deep: 'Summaries, flashcards, answers. Called rarely — use the good one.',
  embed: 'Turns text into vectors so search works. Not a chat model.',
};

// ---------------------------------------------------------------------------
// Providers and the models they offer
// ---------------------------------------------------------------------------

export const agentProviderSchema = z.enum(['anthropic', 'google', 'openai']);

export const PROVIDER_LABEL: Record<AgentProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI',
};

/** Where to go and get a key, shown under the paste box. */
export const PROVIDER_KEY_PAGE: Record<AgentProvider, string> = {
  anthropic: 'console.anthropic.com/settings/keys',
  google: 'aistudio.google.com/apikey',
  openai: 'platform.openai.com/api-keys',
};

/**
 * A menu of model ids, not a decision.
 *
 * These are suggestions the settings screen offers; the user may also type any
 * model id their key can reach, because a provider ships a new model more often
 * than this app ships a slice. Nothing in `/app`, `/components` or any other
 * module reads this list — it exists so the picker has something in it.
 *
 * `chat` fills the `fast` and `deep` roles; `embed` fills the `embed` role.
 * Anthropic has no embedding model at all, so its `embed` list is empty and the
 * registry refuses that combination outright.
 */
export const MODEL_CHOICES: Record<
  AgentProvider,
  { chat: readonly string[]; embed: readonly string[] }
> = {
  anthropic: {
    chat: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    embed: [],
  },
  google: {
    chat: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    embed: ['gemini-embedding-001'],
  },
  openai: {
    chat: ['gpt-5', 'gpt-5-mini', 'gpt-4.1-mini'],
    embed: ['text-embedding-3-small', 'text-embedding-3-large'],
  },
};

/** The providers that can fill a role at all. `embed` rules Anthropic out. */
export function providersForRole(role: AgentRole): AgentProvider[] {
  return agentProviderSchema.options.filter((provider) =>
    role === 'embed'
      ? MODEL_CHOICES[provider].embed.length > 0
      : MODEL_CHOICES[provider].chat.length > 0
  );
}

/** The suggested model ids for one provider in one role. */
export function modelsForRole(
  provider: AgentProvider,
  role: AgentRole
): readonly string[] {
  return role === 'embed' ? MODEL_CHOICES[provider].embed : MODEL_CHOICES[provider].chat;
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export const agentProfileSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  role: agentRoleSchema,
  provider: agentProviderSchema,
  model: z.string(),
  // AES-256-GCM ciphertext from lib/crypto.ts. It never leaves this module,
  // and the plaintext never leaves the process it is decrypted in.
  api_key_enc: z.string(),
  // The last four characters of the key, stored in the clear on purpose — see
  // `maskedKey` below.
  key_hint: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * What a page is allowed to know about a configured role.
 *
 * CLAUDE.md's Never rule 4: no API key in anything a component can see. The
 * screen needs the provider, the model, when it was saved, and enough of the
 * key to recognise which one was pasted. `api_key_enc` is not in this shape, so
 * not even the ciphertext can reach the browser by accident.
 */
export const publicAgentProfileSchema = agentProfileSchema
  .omit({ api_key_enc: true, user_id: true, key_hint: true })
  .extend({ maskedKey: z.string() });

export type AgentRole = z.infer<typeof agentRoleSchema>;
export type AgentProvider = z.infer<typeof agentProviderSchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type PublicAgentProfile = z.infer<typeof publicAgentProfileSchema>;

/** What the settings form posts. The key is the only secret in it. */
export const saveAgentProfileInputSchema = z.object({
  userId: z.uuid(),
  role: agentRoleSchema,
  provider: agentProviderSchema,
  // A model id the user picked or typed. Trimmed, and never empty — an empty
  // model id would be sent to the provider verbatim and fail confusingly.
  model: z.string().trim().min(1, 'Pick a model, or type a model id.'),
  /**
   * Blank means "keep the key already saved for this role".
   *
   * Changing `claude-opus-5` to `claude-sonnet-5` should not mean fetching the
   * key out of the password manager again. It is only allowed when the provider
   * is unchanged — a Claude key is not a Gemini key — and the service enforces
   * both that and the minimum length below.
   */
  apiKey: z.string().trim().default(''),
});

/**
 * Shortest thing accepted as an API key.
 *
 * Every provider's keys are comfortably longer. Twenty is short enough not to
 * reject a format nobody has invented yet, and long enough to catch a paste
 * that went wrong.
 */
export const MIN_API_KEY_LENGTH = 20;

export type SaveAgentProfileInput = z.infer<typeof saveAgentProfileInputSchema>;

// ---------------------------------------------------------------------------
// Masking, and keeping the key out of everything it should not be in
// ---------------------------------------------------------------------------

/** How many trailing characters of a key are kept in the clear. */
export const KEY_HINT_LENGTH = 4;

/**
 * The last few characters of a key, which is all `key_hint` ever holds.
 *
 * Four characters cannot be used to call anything. Storing them means the
 * settings page can say *which* key is saved without decrypting one — and a
 * page render that never touches the plaintext cannot leak it.
 */
export function keyHint(apiKey: string): string {
  return apiKey.trim().slice(-KEY_HINT_LENGTH);
}

/** What the screen shows in place of the key: `••••••••4f2a`. */
export function maskKey(hint: string): string {
  return hint ? `${'•'.repeat(8)}${hint}` : `${'•'.repeat(8)}`;
}

/**
 * An error message safe to put on a screen.
 *
 * prompts/10-agents.md: "never log it, never put it in an error message". A
 * provider's error body sometimes echoes the key back (OpenAI's 401 does), so
 * the key is scrubbed out of the text by value, and anything else that looks
 * like a credential is scrubbed by shape as a second net. The result is one
 * short line, because that is all a Test connection button needs to say.
 */
export function safeMessage(error: unknown, apiKey?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  let text = raw.replace(/\s+/g, ' ').trim();

  // By value first: the exact key, and the tail we stored as a hint.
  if (apiKey && apiKey.length >= 8) text = text.split(apiKey).join('[redacted]');

  // Then by shape, for a key this call did not know about.
  text = text.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]');
  text = text.replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[redacted]');

  if (text.length > 240) text = `${text.slice(0, 240)}…`;
  return text || 'The provider refused, and did not say why.';
}

/**
 * Nobody has filled this role in yet.
 *
 * prompts/10-agents.md: "If a key is missing or invalid, features degrade with
 * a clear message — they do not crash." This is the type a caller catches to
 * do that, rather than matching on a string.
 */
export class AgentNotConfigured extends Error {
  readonly role: AgentRole;

  constructor(role: AgentRole) {
    super(
      `No ${role} model is set up yet. Add a provider and an API key in Settings → Agents.`
    );
    this.name = 'AgentNotConfigured';
    this.role = role;
  }
}

/**
 * The role is configured, but the key cannot be read or used.
 *
 * A wrong `ENCRYPTION_KEY` (restored from a backup, rotated, never set) makes
 * every stored key undecryptable. That is a configuration problem, not a bug,
 * and it should say so rather than throwing a crypto error at a screen.
 */
export class AgentKeyUnreadable extends Error {
  readonly role: AgentRole;

  constructor(role: AgentRole) {
    super(
      `The saved ${role} key could not be read. ENCRYPTION_KEY has probably changed — ` +
        'paste the key in again in Settings → Agents.'
    );
    this.name = 'AgentKeyUnreadable';
    this.role = role;
  }
}
