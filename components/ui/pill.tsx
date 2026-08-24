import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

// Fully round, 12px text. Three tones and no more:
//   neutral — a label (a room, a term, a count)
//   accent  — something needs attention. Stale. Nothing else.
//   ok      — fresh, up to date with its sources.

type Tone = 'neutral' | 'accent' | 'ok';

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-bg text-accent',
  ok: 'bg-ok-bg text-ok',
};

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Pill({ tone = 'neutral', className, ...props }: PillProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-12 leading-none font-medium whitespace-nowrap',
        TONE[tone],
        className
      )}
      {...props}
    />
  );
}
