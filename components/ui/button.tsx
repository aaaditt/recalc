import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

// 32px high, 6px radius, 14px horizontal padding (docs/DESIGN.md). On a touch
// screen --control-height grows to the 44px minimum tap target on its own.

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
        'text-14 font-medium whitespace-nowrap transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        className
      )}
      {...props}
    />
  );
}
