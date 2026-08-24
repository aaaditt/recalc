# Slice 10 — Agents (bring your own key)

Read `CLAUDE.md` and the "Agents" section of `docs/SCHEMA.md` first. This slice
handles secrets — be careful and be explicit about what runs where.

## Goal

I paste in my own API key, choose which model fills each role, and the app can make
a call. Nothing in the app ever names a model.

## Build

1. **Migration** — `agent_profiles` per SCHEMA.md, unique on (user_id, role).

2. **`modules/agents/crypto.ts`** — `import 'server-only'` at the top. AES-256-GCM
   encrypt/decrypt using `ENCRYPTION_KEY` from env. Store iv + authTag + ciphertext.
   Include a test with a known plaintext round-trip.

3. **`modules/agents/registry.ts`** — the only way the rest of the app reaches a
   model. Public API:
   ```ts
   getModel(role: 'fast' | 'deep' | 'embed')  // returns a configured AI SDK model
   ```
   Backed by the Vercel AI SDK with Anthropic, Google and OpenAI providers.

4. **`/settings/agents`** — for each of the three roles: pick provider, pick model,
   paste key. A **Test connection** button that makes one real cheap call and reports
   plainly whether it worked. Keys are shown masked after saving and are never
   returned to the client in full.

5. **Onboarding** — if no `fast` role is configured, `/today` shows a single quiet
   prompt to set it up. Not a modal, not a wizard.

## Constraints

- The decrypted key must never leave the server. Never send it to a client component,
  never log it, never put it in an error message.
- No app code outside `modules/agents` may import a provider SDK directly.
- If a key is missing or invalid, features degrade with a clear message — they do not
  crash.

## Definition of done

I will: paste my Claude key, set it as `fast`, hit Test connection, and see it
succeed. Then switch the provider to Gemini and have it still work without any code
change.

## Then

Update `docs/SLICES.md`. Print the summary. Stop.
