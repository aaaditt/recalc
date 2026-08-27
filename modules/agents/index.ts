// Public API of the agents module. Import only from here.
//
// Owns `agent_profiles` — one row per (user, role), holding which provider and
// model fill that role and an AES-256-GCM ciphertext of the user's own API key.
//
// CLAUDE.md's Never rule 6: the rest of the app asks for a role, never a model.
// `getModel` is that door, and it is the only one — `modules/agents/registry.ts`
// is the single file in the codebase allowed to import a provider SDK, and
// `no-provider-sdk.test.ts` fails the build if a second one appears.
//
// `modelSpecFor` is deliberately not re-exported: it returns a decrypted key,
// and the module boundary lint rule keeps it inside this folder.
export {
  generateWithRole,
  getAgentProfile,
  getAgentProfiles,
  hasAgentRole,
  modelChoices,
  modelLabel,
  removeAgentProfile,
  saveAgentProfile,
  testAgentConnection,
  type ConnectionResult,
  type Generate,
  type Generation,
} from './service';
export {
  chatModelFor,
  embedModelFor,
  getModel,
  type ChatModel,
  type EmbedModel,
  type ModelSpec,
} from './registry';
export {
  AGENT_ROLES,
  AgentKeyUnreadable,
  AgentNotConfigured,
  KEY_HINT_LENGTH,
  MIN_API_KEY_LENGTH,
  MODEL_CHOICES,
  PROVIDER_KEY_PAGE,
  PROVIDER_LABEL,
  ROLE_BLURB,
  agentProviderSchema,
  agentRoleSchema,
  keyHint,
  maskKey,
  modelsForRole,
  providersForRole,
  publicAgentProfileSchema,
  safeMessage,
  type AgentProfile,
  type AgentProvider,
  type AgentRole,
  type PublicAgentProfile,
  type SaveAgentProfileInput,
} from './schema';
