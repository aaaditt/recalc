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
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
