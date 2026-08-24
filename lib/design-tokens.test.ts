import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  COURSE_COLOURS,
  courseDot,
  courseRail,
  courseTint,
  isCourseColour,
} from './course-colours';

// The invariant of slice 02, and of CLAUDE.md's Never rule 7:
//
//   every colour in the app comes from one file.
//
// app/globals.css is that file. If a hex code appears anywhere else, the
// design system has already started to fork and these tests fail.
//
// The expected values below are copied from the tables in docs/DESIGN.md, not
// from globals.css. They are the specification — if the two disagree, the CSS
// is wrong.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOKEN_FILE = join(ROOT, 'app', 'globals.css');
const css = readFileSync(TOKEN_FILE, 'utf8');

const LIGHT_NEUTRALS: Record<string, string> = {
  '--bg': '#F5F6F8',
  '--surface': '#FFFFFF',
  '--sunken': '#EDEFF3',
  '--border': '#DFE2E9',
  '--line': '#E9EBF0',
  '--text': '#171B24',
  '--text-muted': '#5C6675',
  '--text-faint': '#8A93A3',
  '--accent': '#C2600C',
  '--accent-bg': '#FBF0E4',
  '--ok': '#216356',
  '--ok-bg': '#E4EFEB',
};

const DARK_NEUTRALS: Record<string, string> = {
  '--bg': '#0E1116',
  '--surface': '#161A21',
  '--sunken': '#1B2029',
  '--border': '#262C37',
  '--line': '#1F242D',
  '--text': '#E6E9EF',
  '--text-muted': '#939DAD',
  '--text-faint': '#6E7889',
  '--accent': '#E0913F',
  '--accent-bg': '#2B2113',
  '--ok': '#5AB79F',
  '--ok-bg': '#13251F',
};

const COURSE_HEXES: Record<string, string> = {
  indigo: '#5B6EE1',
  rose: '#C25C6E',
  olive: '#8A9440',
  teal: '#2E9E8F',
  violet: '#7D62C4',
  clay: '#B5654F',
  amber: '#C6803A',
  sky: '#3D8FCB',
};

/** Everything between the two `dark-tokens` markers, once per occurrence. */
function darkBlocks(): string[] {
  const blocks = css.match(/dark-tokens:start\s*\*\/([\s\S]*?)\/\*\s*dark-tokens:end/g) ?? [];
  return blocks.map((block) => block.replace(/\s+/g, ' ').trim());
}

function declarationsIn(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found[name] = value.trim();
  }
  return found;
}

// ---------------------------------------------------------------------------

describe('the token file', () => {
  it('defines every light neutral exactly as docs/DESIGN.md specifies', () => {
    const lightBlock = css.slice(
      css.indexOf("[data-theme='light'] {"),
      css.indexOf('@media (prefers-color-scheme: dark)')
    );
    const declared = declarationsIn(lightBlock);

    for (const [token, hex] of Object.entries(LIGHT_NEUTRALS)) {
      expect(declared[token], `${token} in the light block`).toBe(hex);
    }
  });

  it('defines every dark neutral exactly as docs/DESIGN.md specifies', () => {
    const declared = declarationsIn(darkBlocks()[0] ?? '');

    for (const [token, hex] of Object.entries(DARK_NEUTRALS)) {
      expect(declared[token], `${token} in the dark block`).toBe(hex);
    }
  });

  it('keeps its two copies of the dark block identical', () => {
    // One serves prefers-color-scheme, the other data-theme="dark". They are
    // the only duplication in the file and they must not drift.
    const blocks = darkBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe(blocks[1]);
  });

  it('defines all eight course colours', () => {
    for (const [name, hex] of Object.entries(COURSE_HEXES)) {
      expect(css).toContain(`--course-${name}: ${hex};`);
    }
  });
});

describe('course colours', () => {
  it('has exactly the eight from docs/DESIGN.md', () => {
    expect([...COURSE_COLOURS]).toEqual(Object.keys(COURSE_HEXES));
  });

  it('recognises its own names and nothing else', () => {
    expect(isCourseColour('teal')).toBe(true);
    expect(isCourseColour('turquoise')).toBe(false);
    expect(isCourseColour(null)).toBe(false);
  });

  it('applies a colour only through the CSS variable, never a hex', () => {
    for (const colour of COURSE_COLOURS) {
      const applied = [courseRail(colour), courseTint(colour), courseDot(colour)]
        .map((style) => Object.values(style).join(' '))
        .join(' ');

      expect(applied).toContain(`var(--course-${colour})`);
      expect(applied).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it('tints at 8% rather than filling with the saturated colour', () => {
    expect(courseTint('indigo').backgroundColor).toContain('var(--course-tint-alpha)');
    expect(css).toContain('--course-tint-alpha: 8%;');
    expect(css).toContain('--course-rail-width: 3px;');
  });
});

// ---------------------------------------------------------------------------

const SOURCE_DIRS = ['app', 'components', 'lib', 'modules'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css'];
const HEX = /#[0-9a-fA-F]{3,8}\b/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    // Test files carry the expected values on purpose — this one included.
    if (path.endsWith('.test.ts')) continue;
    if (SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) found.push(path);
  }

  return found;
}

describe('rule 7 — no colour outside the token file', () => {
  it('finds no hex code in app, components, lib or modules', () => {
    const offenders: string[] = [];

    for (const dir of SOURCE_DIRS) {
      for (const path of sourceFiles(join(ROOT, dir))) {
        if (path === TOKEN_FILE) continue;

        const lines = readFileSync(path, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (HEX.test(line)) {
            offenders.push(
              `${relative(ROOT, path).split(sep).join('/')}:${index + 1}  ${line.trim()}`
            );
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
