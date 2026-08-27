'use client';

// "Update the index" — the one interactive thing on the search screen.
//
// 'use client' for the same reason components/questions/question-card.tsx is:
// embedding a batch of paragraphs is a network call to a model provider and
// takes seconds, and a plain form post would leave the page sitting there
// saying nothing. It is a leaf: it knows nothing about models, keys, vectors or
// the database, and everything it draws arrives as props.
//
// The button is deliberately quiet. Search works without ever pressing it —
// the full-text half needs no index of the app's own making — so this is an
// improvement, not a prerequisite, and it should not look like a chore.

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

export type IndexOutcome = {
  embedded: number;
  remaining: number;
  error: string | null;
};

export type IndexButtonProps = {
  /** How many passages have no vector at their current version, right now. */
  pending: number;
  run: () => Promise<IndexOutcome>;
};

function sentence(outcome: IndexOutcome): string {
  if (outcome.error) return outcome.error;
  if (outcome.embedded === 0) return 'Everything is already indexed.';

  const done = `Indexed ${outcome.embedded} passage${outcome.embedded === 1 ? '' : 's'}.`;
  return outcome.remaining === 0 ? done : `${done} ${outcome.remaining} to go — press again.`;
}

export function IndexButton({ pending, run }: IndexButtonProps) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-4">
      <Button
        type="button"
        disabled={busy || pending === 0}
        onClick={() =>
          start(async () => {
            setSaid(sentence(await run()));
          })
        }
      >
        {busy ? 'Indexing…' : 'Update the index'}
      </Button>

      <p aria-live="polite" className="min-w-0 flex-1 text-13 text-muted">
        {said ??
          (pending === 0
            ? 'Every passage has a current vector.'
            : `${pending} passage${pending === 1 ? '' : 's'} ${
                pending === 1 ? 'has' : 'have'
              } changed since they were last indexed.`)}
      </p>
    </div>
  );
}
