import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Pull .env.local into the test process — the staleness test talks to the
    // real Supabase project, because the cascade lives in a Postgres trigger.
    env: loadEnv(mode, process.cwd(), ''),
    include: ['modules/**/*.test.ts', 'lib/**/*.test.ts'],
    // These are a fact about how far away the database is, not about how much
    // work the tests do.
    //
    // The Supabase project is in ap-southeast-2 (Sydney) and this machine is
    // not, so one round trip measures ~600ms — of which essentially none is
    // query time; a `select id limit 1` on an empty table costs the same. The
    // slowest tests are the ones that must be sequential to mean anything:
    // `syllabus-units`'s run-of-moves checks the ordering after every single
    // move, deliberately, because a duplicate position that heals on the next
    // move is still a moment where "Unit 3" meant two things. Six moves at
    // roughly eight round trips each is ~54 trips, or ~33s — which is how a
    // suite that passes one evening fails the next.
    //
    // Raised from 30s in slice 18 after measuring, not after guessing. If these
    // ever need raising again, the answer is not a bigger number: it is either
    // the N+1 in `reorderSyllabusUnits` (docs/DECISIONS.md, "Noticed, not
    // fixed") or a database in the same hemisphere.
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
}));
