import type { Generate } from '@/modules/agents';

import type { ReadSource, RecipeOutput } from '../schema';

// The third recipe. The same two rules as summarize.ts and answer.ts:
//
//   1. It never writes to the database. It takes blocks that have already been
//      read and something that can call a model, and it returns text.
//   2. It declares its inputs by handing back the very array it built the
//      prompt from, so `derivation_sources` and the prompt cannot drift.
//
// What is different is the source and the shape of the answer. A summary reads
// a note; an answer reads a question and its anchors; an extraction reads ONE
// `email` block — and what it hands back is a list of things a human might want
// to do, not prose.
//
// **There are no message bodies.** Slice 14 stores the sender, the subject, the
// snippet Gmail shows in the list, the time and the thread id, and nothing else
// (prompts/14-email-connect.md point 4, migration 010). So this recipe reads a
// subject line and about two hundred characters of preview. That is genuinely
// enough for "ME301 problem sheet 3 due Friday 5pm" and genuinely not enough for
// a deadline buried in paragraph four — which is why every proposal has to
// carry the words it was read out of, and why nothing it produces is ever
// written anywhere without a human tap.

export const EXTRACT = 'extract';

/**
 * Bump this when the wording below changes in a way that would produce
 * different proposals from the same email.
 */
export const EXTRACT_PROMPT_VERSION = 1;

/** A list of short items, not prose. */
const MAX_OUTPUT_TOKENS = 700;

const SYSTEM = [
  'You read one university email and list only the things it asks a student to DO or KNOW.',
  'Answer with JSON and nothing else. No prose, no markdown, no code fences.',
  'The shape is: {"items":[...]} where each item is one of',
  '{"kind":"deadline","title":"...","dueAt":"ISO 8601 or null","sourceText":"..."}',
  '{"kind":"class_change","change":"cancelled|room|rescheduled","on":"ISO 8601 date or null","room":"... or null","sourceText":"..."}',
  '{"kind":"material","title":"...","where":"... or null","sourceText":"..."}',
  'Rules:',
  '1. sourceText MUST be copied word for word from the subject or preview below. Never paraphrase it, never write a sentence of your own there.',
  '2. Only list something the email actually states. If it is not written down, it does not exist.',
  '3. If the email is an announcement, a newsletter, an advert or a receipt, answer {"items":[]}.',
  '4. Resolve a relative date ("Friday", "next week") against the date the email arrived. If you cannot work it out with confidence, use null.',
  '5. At most four items. One line each. Keep titles under twelve words.',
].join(' ');

/** The email as this recipe sees it. Metadata only — there is no body to read. */
export type EmailFacts = {
  sender: string;
  subject: string;
  snippet: string;
  /** ISO 8601. The reference point for "Friday". */
  receivedAt: string;
};

export type ExtractInput = {
  email: EmailFacts;
  /** The email block, and nothing else. It is what goes on the receipt. */
  sources: ReadSource[];
};

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

export type ExtractedItem =
  | { kind: 'deadline'; title: string; dueAt: string | null; sourceText: string }
  | {
      kind: 'class_change';
      change: 'cancelled' | 'room' | 'rescheduled';
      on: string | null;
      room: string | null;
      sourceText: string;
    }
  | { kind: 'material'; title: string; where: string | null; sourceText: string };

/** Everything this recipe was allowed to read, as one string to check quotes against. */
export function readableText(email: EmailFacts): string {
  return `${email.subject}\n${email.snippet}`;
}

const flatten = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * True when this text really is in the email.
 *
 * The one defence against a model inventing its evidence. A proposal whose
 * "sentence it came from" is not in the email is worse than no proposal: it
 * looks exactly as trustworthy as a real one and it cannot be checked. Items
 * that fail this are dropped, not shown with a warning.
 */
export function quotesTheEmail(sourceText: string, email: EmailFacts): boolean {
  const quote = flatten(sourceText);
  if (quote === '') return false;
  return flatten(readableText(email)).includes(quote);
}

const string = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const nullableString = (value: unknown): string | null => {
  const text = string(value);
  return text === '' ? null : text;
};

/** An ISO instant, or null. A model will happily return "Friday" here. */
function instant(value: unknown): string | null {
  const text = nullableString(value);
  if (text === null) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** One item, or null when it is not a shape this app can act on. */
function readItem(raw: unknown): ExtractedItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;

  const sourceText = string(item.sourceText);
  if (sourceText === '') return null;

  if (item.kind === 'deadline') {
    const title = string(item.title);
    return title === '' ? null : { kind: 'deadline', title, dueAt: instant(item.dueAt), sourceText };
  }

  if (item.kind === 'class_change') {
    const change = string(item.change);
    if (change !== 'cancelled' && change !== 'room' && change !== 'rescheduled') return null;
    return {
      kind: 'class_change',
      change,
      on: instant(item.on),
      room: nullableString(item.room),
      sourceText,
    };
  }

  if (item.kind === 'material') {
    const title = string(item.title);
    return title === '' ? null : { kind: 'material', title, where: nullableString(item.where), sourceText };
  }

  return null;
}

/** At most this many proposals from one email, however long the answer is. */
export const MAX_ITEMS_PER_EMAIL = 4;

/**
 * Read the model's answer.
 *
 * Deliberately forgiving about the wrapper — a fenced block, a sentence before
 * the JSON — and deliberately unforgiving about the contents: an item that is
 * not one of the three shapes, or that quotes words the email does not contain,
 * is dropped without comment. Nothing here throws: a model that answers with
 * nonsense produces no proposals, which is the correct outcome.
 */
export function parseExtraction(text: string, email: EmailFacts): ExtractedItem[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  return items
    .map(readItem)
    .filter((item): item is ExtractedItem => item !== null && quotesTheEmail(item.sourceText, email))
    .slice(0, MAX_ITEMS_PER_EMAIL);
}

/**
 * The items back out of the derived block they were written into.
 *
 * The quote check is not repeated here: it ran before these were written, and a
 * block's content is this app's own writing rather than a model's answer.
 */
export function readStoredItems(content: Record<string, unknown>): ExtractedItem[] {
  const items = content.items;
  if (!Array.isArray(items)) return [];
  return items
    .map(readItem)
    .filter((item): item is ExtractedItem => item !== null)
    .slice(0, MAX_ITEMS_PER_EMAIL);
}

/** The one line that lands in the derived block, for /review and for a human. */
export function digestOf(items: ExtractedItem[]): string {
  if (items.length === 0) return 'Nothing in this email needs anything from you.';
  return items
    .map((item) =>
      item.kind === 'deadline'
        ? `Deadline: ${item.title}`
        : item.kind === 'material'
          ? `Material: ${item.title}`
          : `Class change: ${item.change}`
    )
    .join('\n');
}

// ---------------------------------------------------------------------------

/**
 * Read one email and say what it proposes.
 *
 * `generate` is the seam: in the app it is `generateWithRole(db, userId,
 * 'deep')`. This file names no model and knows no provider (CLAUDE.md, Never
 * rule 6). The cheap gate that decides whether it is worth calling at all is
 * `modules/proposals/gate.ts`, and by the time this function runs that decision
 * has already been made.
 */
export async function extract(input: ExtractInput, generate: Generate): Promise<RecipeOutput> {
  const { email } = input;
  if (flatten(readableText(email)) === '') {
    throw new Error('This email has no subject and no preview text, so there is nothing to read.');
  }

  const prompt = [
    `From: ${email.sender}`,
    `Arrived: ${email.receivedAt}`,
    `Subject: ${email.subject}`,
    '',
    'Preview:',
    email.snippet === '' ? '(none)' : email.snippet,
    '',
    'List what this asks of me, as JSON.',
  ].join('\n');

  const { text, model } = await generate({
    system: SYSTEM,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const items = parseExtraction(text, email);

  return {
    // `text` is what gets hashed and what /review would show; `items` is what
    // modules/proposals reads back out of the block. Both are written by the
    // engine in one `updateBlock`, so the two can never disagree.
    content: { text: digestOf(items), items },
    // The same array the prompt was built from. Not a re-derivation of it.
    sources: input.sources,
    model,
  };
}
