'use client';

// One question, its answer, and the two buttons that move it along.
//
// 'use client' for the same reason components/notes/note-summary.tsx is: a
// model call takes seconds, and a plain form post would leave the page sitting
// there saying nothing. `useTransition` lets Answer say "Answering…" while it
// waits, which is the difference between slow and broken.
//
// It knows nothing about models, keys or the database. Everything it draws
// arrives as props, already formatted by the page, and both actions re-derive
// the session on the server.

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';

export type QuestionCitationView = {
  blockId: string;
  /** 'your notes from 14 Oct' — built by the page, which has the timezone. */
  label: string;
  href: string | null;
  /** What that paragraph says now, so the citation is checkable in place. */
  excerpt: string;
};

export type QuestionAnswerCardView = {
  text: string;
  status: 'fresh' | 'stale' | 'computing' | 'error';
  error: string | null;
  model: string;
  computedLabel: string | null;
  citations: QuestionCitationView[];
};

export type QuestionCardProps = {
  blockId: string;
  text: string;
  status: 'open' | 'answered' | 'resolved';
  /** 'asked 14 Oct', or null when there is no date worth showing. */
  askedLabel: string | null;
  answer: QuestionAnswerCardView | null;
  /** Runs the answer derivation through slice 11's engine. */
  answerIt: () => Promise<{ ok: boolean; error?: string }>;
  /** Resolved is a button I press, never something the app decides. */
  setResolved: (resolved: boolean) => Promise<void>;
};

export function QuestionCard({
  text,
  status,
  askedLabel,
  answer,
  answerIt,
  setResolved,
}: QuestionCardProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const resolved = status === 'resolved';
  const stale = answer?.status === 'stale';

  function run(work: () => Promise<void>) {
    setProblem(null);
    start(() => {
      void work();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        {resolved ? (
          <Pill tone="ok">Resolved</Pill>
        ) : status === 'answered' ? (
          <Pill>Answered · still open</Pill>
        ) : (
          <Pill>Open</Pill>
        )}
        {stale ? <Pill tone="accent">Answer out of date</Pill> : null}
        {askedLabel ? <span className="text-12 text-faint">{askedLabel}</span> : null}
      </div>

      <p className="px-4 py-3 text-16 leading-relaxed font-medium">{text}</p>

      {answer ? (
        <>
          <CardDivider />
          <div className="px-4 py-4">
            {answer.text.trim() === '' ? (
              <p className="text-14 text-muted">
                {answer.error ?? 'Nothing was generated. Try again.'}
              </p>
            ) : (
              <p className="text-14 leading-relaxed whitespace-pre-wrap">{answer.text}</p>
            )}

            {answer.citations.length > 0 ? (
              <div className="pt-3">
                <p className="pb-2 font-mono text-label text-faint uppercase">
                  Based on
                </p>
                <ul className="flex flex-col gap-2">
                  {answer.citations.map((citation) => (
                    <li key={citation.blockId} className="text-13">
                      {citation.href ? (
                        <a
                          href={citation.href}
                          className="text-muted underline underline-offset-4 hover:text-ink"
                        >
                          {citation.label}
                        </a>
                      ) : (
                        <span className="text-muted">{citation.label}</span>
                      )}
                      {citation.excerpt.trim() !== '' ? (
                        <span className="block truncate text-faint">
                          “{citation.excerpt}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="pt-3 font-mono text-12 text-faint">
              {answer.model}
              {answer.computedLabel ? ` · ${answer.computedLabel}` : ''}
            </p>

            {stale ? (
              <p className="pt-3 text-13 text-muted">
                A note this answer was built from has changed since.{' '}
                <a href="/review" className="underline underline-offset-4 hover:text-ink">
                  See what changed in Review
                </a>{' '}
                — nothing is regenerated until you say so.
              </p>
            ) : null}

            {answer.status === 'error' && answer.error ? (
              <p className="pt-3 text-13 text-accent">{answer.error}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <CardDivider />

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await answerIt();
              if (!result.ok) setProblem(result.error ?? 'That did not work.');
            })
          }
        >
          {busy ? 'Answering…' : answer ? 'Answer again' : 'Answer'}
        </Button>

        <Button
          variant={resolved ? 'ghost' : 'primary'}
          disabled={busy}
          onClick={() => run(() => setResolved(!resolved))}
        >
          {resolved ? 'Not resolved after all' : 'I understand this'}
        </Button>

        {problem ? (
          <span aria-live="polite" className="text-13 text-accent">
            {problem}
          </span>
        ) : null}
      </div>

      {!resolved ? (
        <p className="px-4 pb-4 text-12 text-muted">
          An answered question stays on the list until you say you understand it. That is
          what makes the list worth opening.
        </p>
      ) : null}
    </Card>
  );
}
