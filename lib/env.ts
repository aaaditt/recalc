import { z } from 'zod';

// Public env vars only. These are inlined into the client bundle by Next.js,
// so nothing secret may ever be added here — server secrets live in env.server.ts.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // The Google Picker's developer key. Genuinely public — it identifies the
  // Cloud project to the Picker and grants nothing on its own; the OAuth token
  // is what grants access, and that never comes from here.
  //
  // Optional, because everything in the app has to work with no Drive account
  // connected. Without it the "Attach from Drive" button says so in a plain
  // sentence instead of the page failing to boot.
  //
  // An empty value is the same as an absent one: `.env.local` ships the key
  // commented in but blank, and `FOO=` must not be an invalid environment.
  NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value : undefined)),
});

// NEXT_PUBLIC_* vars are replaced at build time, so they must be referenced
// literally — z.parse(process.env) would see an empty object in the browser.
const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY,
});

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(
    `Missing or invalid environment variables: ${missing}. ` +
      'Copy the template in SETUP.md into .env.local and fill it in.'
  );
}

export const publicEnv = parsed.data;
