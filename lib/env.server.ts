import 'server-only';
import { z } from 'zod';

// Server-only secrets. The 'server-only' import above makes any attempt to pull
// this file into a client bundle a build error, not a leak.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Not used until slices 09–10; optional so the app boots before they are set.
  ENCRYPTION_KEY: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(
    `Missing or invalid server environment variables: ${missing}. ` +
      'Copy the template in SETUP.md into .env.local and fill it in.'
  );
}

export const serverEnv = parsed.data;
