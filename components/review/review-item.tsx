'use client';

// One thing that went out of date, and the three answers to it.
//
// 'use client' for one reason: the regenerated version has to appear beside the
// current one *without* the page having generated it on load. Nothing
// regenerates automatically (docs/PRODUCT.md rule 2), so pressing Regenerate is
// what spends the model call, and the result has to live somewhere until it is
// accepted or abandoned. That somewhere is this component's state.
//
// It knows nothing about the database, holds no secret and chooses no model —
// the four actions are passed in from the page, already bound to ids the server
// re-proves against the session on every call.

import { useState, useTransition, type ReactNode } from 'react';

import { DiffText } from '@/components/review/diff-text';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import type { DiffPart } from '@/lib/diff';

export type ReviewSourceView = {
  blockId: string;
  readVersion: number;
  currentVersion: number;
  changed: boolean;
  /** Worked out on the server by lib/diff.ts. Null when nothing was recorded. */
  parts: DiffPart[] | null;
  /** What it says now, for a source with no snapshot to diff against. */
  after: string | null;
};

export type PreviewView = {
  text: string;
  model: string;
  sources: { blockId: string; version: number }[];
};

type ReviewItemProps = {
  derivationId: string;
  /** 'summarize' — spelled for a person by the page. */
  recipeLabel: string;
  /**
   * For an answer, the question it answers. It is what makes this row readable:
   * without it an out-of-date answer is a paragraph of prose with no subject.
   * Null for every other recipe (prompts/12-questions.md, item 2).
   */
  question: string | null;
  note: { title: string; href: string } | null;
  currentText: string;
  sources: ReviewSourceView[];
  /** Already formatted by the page: a client component gets no timezone. */
  computedLabel: string | null;
  regenerate: () => Promise<{ ok: true; preview: PreviewView } | { ok: false; error: string }>;
  accept: (preview: PreviewView) => Promise<{ ok: boolean; error?: string }>;
  keepOld: () => Promise<void>;
  discard: () => Promise<void>;
};

function Label({ children }: { children: ReactNode }) {
  return <p className="pb-2 font-mono text-label text-faint uppercase">{children}</p>;
}

export function ReviewItem({
  recipeLabel,
  question,
  note,
  currentText,
  sources,
  computedLabel,
  regenerate,
  accept,
  keepOld,
  discard,
}: ReviewItemProps) {
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const changed = sources.filter((source) => source.changed);
  // An answer and a summary get the same three buttons and the same diff; what
  // they are called is the whole difference on screen.
  const noun = question ? 'answer' : 'summary';

  function run(work: () => Promise<void>) {
    setProblem(null);
    startBusy(() => {
      void work();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-label text-faint uppercase">{recipeLabel}</span>
            <Pill tone="accent">Out of date</Pill>
          </div>
          <p className="mt-1 truncate text-16 font-medium">
            {note ? (
              <a href={note.href} className="underline-offset-4 hover:underline">
                {note.title || 'Untitled note'}
              </a>
            ) : (
              'A note that no longer exists'
            )}
          </p>
          {question ? (
            <p className="mt-1 text-14 leading-relaxed">“{question}”</p>
          ) : null}
          <p className="mt-1 text-13 text-muted">
            {changed.length === 1
              ? 'One paragraph changed since this was written'
              : `${changed.length} paragraphs changed since this was written`}
            {computedLabel ? ` · written ${computedLabel}` : ''}
          </p>
        </div>
      </div>

      <CardDivider />

      <section className="px-4 py-4">
        <Label>What changed in the note</Label>
        <ul className="flex flex-col gap-4">
          {changed.map((source) => (
            <li key={source.blockId}>
              <p className="pb-1 font-mono text-12 text-faint">
                v{source.readVersion} → v{source.currentVersion}
              </p>
              {source.parts ? (
                <DiffText parts={source.parts} />
              ) : (
                <p className="text-14 leading-relaxed whitespace-pre-wrap">
                  {source.after ?? 'This paragraph has been deleted.'}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <CardDivider />

      <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
        <section>
          <Label>The {noun} you have</Label>
          <p className="text-14 leading-relaxed whitespace-pre-wrap">{currentText}</p>
        </section>

        <section>
          <Label>
            {preview ? `The ${noun} now` : `The ${noun} now — not generated yet`}
          </Label>
          {preview ? (
            <>
              <p className="text-14 leading-relaxed whitespace-pre-wrap">{preview.text}</p>
              <p className="pt-2 font-mono text-12 text-faint">{preview.model}</p>
            </>
          ) : (
            <p className="text-14 leading-relaxed text-muted">
              Nothing is regenerated until you ask for it. Press Regenerate to spend one
              model call and see the new version here.
            </p>
          )}
        </section>
      </div>

      {problem ? (
        <p aria-live="polite" className="px-4 pb-3 text-13 text-accent">
          {problem}
        </p>
      ) : null}

      <CardDivider />

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await regenerate();
              if (result.ok) setPreview(result.preview);
              else setProblem(result.error);
            })
          }
        >
          {busy && !preview ? 'Regenerating…' : preview ? 'Regenerate again' : 'Regenerate'}
        </Button>

        <Button
          variant="primary"
          disabled={busy || preview === null}
          title={preview === null ? 'Regenerate first, so there is something to accept' : undefined}
          onClick={() =>
            run(async () => {
              if (!preview) return;
              const result = await accept(preview);
              if (result.ok) setPreview(null);
              else setProblem(result.error ?? 'That could not be accepted.');
            })
          }
        >
          Accept
        </Button>

        <Button variant="ghost" disabled={busy} onClick={() => run(keepOld)}>
          Keep old
        </Button>

        <Button
          variant="ghost"
          disabled={busy}
          className="ml-auto"
          onClick={() => run(discard)}
        >
          Delete
        </Button>
      </div>

      <p className="px-4 pb-4 text-12 text-muted">
        <strong className="font-medium">Keep old</strong> means the {noun} still stands:
        it stops asking, against the note as it is now, until the next change.
      </p>
    </Card>
  );
}
