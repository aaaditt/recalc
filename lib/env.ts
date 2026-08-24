import { z } from 'zod';

// Public env vars only. These are inlined into the client bundle by Next.js,
// so nothing secret may ever be added here — server secrets live in env.server.ts.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

// NEXT_PUBLIC_* vars are replaced at build time, so they must be referenced
// literally — z.parse(process.env) would see an empty object in the browser.
const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(
    `Missing or invalid environment variables: ${missing}. ` +
      'Copy the template in SETUP.md into .env.local and fill it in.'
  );
}

export const publicEnv = parsed.data;
