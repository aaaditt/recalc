import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

// 32px high, 6px radius, 14px horizontal padding (docs/DESIGN.md). On a touch
// screen --control-height grows to the 44px minimum tap target on its own.
//
// Slice 26 gave it the three states every control in this app now shares:
// hover changes the surface, press moves it 1px down, focus draws a ring. The
// press is a real displacement rather than a fade, because a button that moves
// under the finger reads as a button — and on a phone, where there is no hover
// at all, it is the only feedback there is between the tap and the response.

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Record<Variant, string> = {
  // Dark fill, no colour. The accent is reserved for "something needs you".
  primary: 'bg-ink text-bg hover:opacity-90',
  secondary: 'bg-surface text-ink border border-border hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ variant = 'secondary', className, type, ...props }: ButtonProps) {
  return (
    <button
      // Unspecified <button> inside a <form> submits it, which is never what
      // the caller of a generic button meant.
      type={type ?? 'button'}
      className={cx(
        'inline-flex h-(--control-height) items-center justify-center gap-2 rounded-card px-(--control-padding-x)',
        'text-14 font-medium whitespace-nowrap',
        'transition-[background-color,color,opacity,translate] duration-(--duration-tap)',
        'active:translate-y-(--press-shift)',
        'focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-offset-(--focus-ring-offset) focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        className
      )}
      {...props}
    />
  );
}
