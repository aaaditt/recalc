'use client';

// The summary of a note, and the button that asks for one.
//
// 'use client' for one reason: a model call takes seconds, and a plain form
// post would leave the page sitting there saying nothing. `useTransition` lets
// the button say "Summarising…" while it waits, which is the difference between
// slow and broken.
//
// It knows nothing about models, keys or the database. The action is passed in
// by the page and re-derives the session on the server.

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';

export type NoteSummaryView = {
  text: string;
  status: 'fresh' | 'stale' | 'computing' | 'error';
  error: string | null;
  model: string;
  /** Already formatted by the page: a client component gets no timezone. */
  computedLabel: string | null;
};

type NoteSummaryProps = {
  summary: NoteSummaryView | null;
  /** Generates, or regenerates, the summary of this note. */
  summarise: () => Promise<{ ok: boolean; error?: string }>;
};

export function NoteSummary({ summary, summarise }: NoteSummaryProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const stale = summary?.status === 'stale';

  function run() {
    setProblem(null);
    start(async () => {
      const result = await summarise();
      if (!result.ok) setProblem(result.error ?? 'That did not work.');
    });
  }

  if (!summary) {
    return (
      <Card className="px-4 py-4">
        <p className="text-14 text-muted">
          A summary built from this note, which flags itself the moment the note changes
          underneath it. Nothing is generated until you ask.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Button variant="secondary" disabled={busy} onClick={run}>
            {busy ? 'Summarising…' : 'Summarise this note'}
          </Button>
          {problem ? (
            <span aria-live="polite" className="text-13 text-accent">
              {problem}
            </span>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {stale ? (
          <Pill tone="accent">Out of date</Pill>
        ) : summary.status === 'fresh' ? (
          <Pill tone="ok">Up to date</Pill>
        ) : (
          <Pill>{summary.status === 'computing' ? 'Generating' : 'Did not finish'}</Pill>
        )}

        <span className="font-mono text-12 text-faint">{summary.model}</span>
        {summary.computedLabel ? (
          <span className="text-12 text-faint">· {summary.computedLabel}</span>
        ) : null}
      </div>

      <CardDivider />

      <div className="px-4 py-4">
        {summary.text.trim() === '' ? (
          <p className="text-14 text-muted">
            {summary.error ?? 'Nothing was generated. Try again.'}
          </p>
        ) : (
          <p className="text-14 leading-relaxed whitespace-pre-wrap">{summary.text}</p>
        )}

        {stale ? (
          <p className="pt-3 text-13 text-muted">
            This note changed after the summary was written.{' '}
            <a href="/review" className="underline underline-offset-4 hover:text-ink">
              See what changed in Review
            </a>{' '}
            — nothing is regenerated until you say so.
          </p>
        ) : null}

        {summary.status === 'error' && summary.error ? (
          <p className="pt-3 text-13 text-accent">{summary.error}</p>
        ) : null}
      </div>

      <CardDivider />

      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Button variant="secondary" disabled={busy} onClick={run}>
          {busy ? 'Summarising…' : 'Regenerate'}
        </Button>
        {problem ? (
          <span aria-live="polite" className="text-13 text-accent">
            {problem}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
