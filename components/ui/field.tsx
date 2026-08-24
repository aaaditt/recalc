import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '@/lib/cx';

// Form controls. The same height, radius and hairline as a Button, because on
// a form they sit next to one and a 32px button beside a 38px input is the sort
// of thing that makes an app look assembled rather than designed.
//
// docs/DECISIONS.md booked these for slice 06 — the first slice with a real
// form. Three screens built before it were styling inputs inline with a copy of
// the same class string each; they all point here now.

const CONTROL = [
  'w-full rounded-card border border-border bg-surface px-3 text-14 text-ink',
  'placeholder:text-faint outline-none transition-colors duration-100',
  'focus:border-ink disabled:pointer-events-none disabled:opacity-50',
].join(' ');

/** One line: a title, a date, a time. 32px, or 44px on a touch screen. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, 'h-(--control-height)', className)} {...props} />;
}

/** A few lines. Grows with its content rather than scrolling in a 32px box. */
export function Textarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cx(CONTROL, 'py-2 leading-6', className)} {...props} />;
}

/** A native select, so a phone gets its own wheel and a laptop its own list. */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, 'h-(--control-height)', className)} {...props} />;
}

type FieldProps = {
  /** The uppercase mono label above the control. */
  label: ReactNode;
  /** One line under it, when the control needs explaining. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** A label and its control. The `<label>` wraps, so the whole thing is tappable. */
export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="font-mono text-label text-faint uppercase">{label}</span>
      {children}
      {hint ? <span className="text-12 text-muted">{hint}</span> : null}
    </label>
  );
}
