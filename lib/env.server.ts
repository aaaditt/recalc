import 'server-only';
import { z } from 'zod';

// Server-only secrets. The 'server-only' import above makes any attempt to pull
// this file into a client bundle a build error, not a leak.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Required from slice 09 on. Each of these was optional until the slice that
  // first read it (docs/DECISIONS.md, "Server env vars for future slices are
  // optional in lib/env.server.ts"); slice 09 is that slice for all three.
  //
  // ENCRYPTION_KEY protects google_accounts.refresh_token_enc — 32 bytes,
  // base64. The Google credentials are the OAuth client the Drive connect flow
  // redirects to. Booting without them would mean the connect button leads
  // somewhere broken instead of failing loudly here. docs/GOOGLE_SETUP.md has
  // the steps for all three.
  ENCRYPTION_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(
    `Missing or invalid server environment variables: ${missing}. ` +
      'Copy the template in SETUP.md into .env.local and fill it in. ' +
      'For the Google and encryption values, see docs/GOOGLE_SETUP.md.'
  );
}

export const serverEnv = parsed.data;
