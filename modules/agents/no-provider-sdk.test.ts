import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The invariant of slice 10's constraints, and of CLAUDE.md's Never rules 4 and 6:
//
//   modules/agents/registry.ts is the ONLY file that reaches a model provider,
//   and no file that ships to the browser reaches it at all.
//
// prompts/10-agents.md: "No app code outside `modules/agents` may import a
// provider SDK directly", and "The decrypted key must never leave the server.
// Never send it to a client component."
//
// Both are rules that hold until the first slice where breaking them is
// convenient — unless something fails. This is that something. It reads the
// tree the same way lib/design-tokens.test.ts enforces rule 7.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE_DIRS = ['app', 'components', 'lib', 'modules', 'scripts'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs'];

/** The registry, and nothing else, may import one of these. */
const PROVIDER_SDKS = [
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/openai',
  '@ai-sdk/provider',
  '@anthropic-ai/sdk',
  'openai',
  '@google/generative-ai',
];

/** The registry and the agents service. Paths are POSIX-style, from the root. */
const MAY_REACH_A_PROVIDER = ['modules/agents/registry.ts', 'modules/agents/service.ts'];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (path.endsWith('.test.ts')) continue;
    if (SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) found.push(path);
  }

  return found;
}

/** Every non-test source file in the app, keyed by its path from the root. */
function everySourceFile(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];

  for (const dir of SOURCE_DIRS) {
    for (const absolute of sourceFiles(join(ROOT, dir))) {
      files.push({
        path: relative(ROOT, absolute).split(sep).join('/'),
        source: readFileSync(absolute, 'utf8'),
      });
    }
  }

  return files;
}

/** What a file imports, by module specifier. Covers `import` and `require`. */
function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const [, specifier] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    found.push(specifier);
  }
  for (const [, specifier] of source.matchAll(/(?:import|require)\(\s*['"]([^'"]+)['"]/g)) {
    found.push(specifier);
  }
  return found;
}

const FILES = everySourceFile();

describe('rule 6 — only the registry names a model provider', () => {
  it('finds no provider SDK imported outside modules/agents', () => {
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      if (MAY_REACH_A_PROVIDER.includes(path)) continue;

      for (const specifier of importsOf(source)) {
        if (PROVIDER_SDKS.some((sdk) => specifier === sdk || specifier.startsWith(`${sdk}/`))) {
          offenders.push(`${path} imports ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds the Vercel AI SDK itself only inside modules/agents', () => {
    // `ai` is the SDK that actually makes the call. It is not a provider, but
    // reaching it outside this module would mean a model was chosen elsewhere.
    const offenders = FILES.filter(
      ({ path, source }) =>
        !path.startsWith('modules/agents/') &&
        importsOf(source).some((specifier) => specifier === 'ai' || specifier.startsWith('ai/'))
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('makes sure the registry really is where the providers are', () => {
    // The opposite failure: this test passing because nobody imports anything.
    const registry = FILES.find(({ path }) => path === 'modules/agents/registry.ts');
    expect(registry).toBeDefined();

    const imports = importsOf(registry!.source);
    expect(imports).toContain('@ai-sdk/anthropic');
    expect(imports).toContain('@ai-sdk/google');
    expect(imports).toContain('@ai-sdk/openai');
  });
});

describe('rule 4 — nothing that ships to the browser can reach a key', () => {
  it("finds no 'use client' file importing modules/agents", () => {
    const offenders = FILES.filter(({ source }) => {
      const isClient = /^\s*['"]use client['"]/m.test(source);
      return isClient && importsOf(source).some((s) => s.startsWith('@/modules/agents'));
    }).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("finds no 'use client' file importing lib/crypto", () => {
    const offenders = FILES.filter(({ source }) => {
      const isClient = /^\s*['"]use client['"]/m.test(source);
      return isClient && importsOf(source).some((s) => s.startsWith('@/lib/crypto'));
    }).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('finds nothing under /components importing either one', () => {
    // CLAUDE.md's Never rule 4 names /components explicitly, whether or not the
    // file says 'use client'.
    const offenders = FILES.filter(
      ({ path, source }) =>
        path.startsWith('components/') &&
        importsOf(source).some(
          (s) => s.startsWith('@/modules/agents') || s.startsWith('@/lib/crypto')
        )
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('never selects the ciphertext into anything a page can render', () => {
    // `publicAgentProfileSchema` omits api_key_enc. This checks the other half:
    // that the column name appears only in the module that owns the table.
    const offenders = FILES.filter(
      ({ path, source }) =>
        !path.startsWith('modules/agents/') &&
        !path.startsWith('supabase/') &&
        path !== 'lib/database.types.ts' &&
        // Names it in a comment explaining what it encrypts, not in a query.
        path !== 'lib/crypto.ts' &&
        source.includes('api_key_enc')
    ).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
