'use client';

// A bottom sheet on a phone, a side panel on a laptop. The one primitive that
// genuinely needs interactivity, so it is the one that gets 'use client'.
//
// Controlled: the caller owns `open`. It renders nothing when closed, so there
// is no exit animation — 120ms in, instant out, which is what a sheet you are
// dismissing should feel like.

import { useEffect, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Shown in the sheet's header, and used as its accessible name. */
  title: string;
  children: ReactNode;
  className?: string;
};

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex w-full max-h-(--sheet-max-block) animate-rise flex-col',
          'rounded-t-sheet border-t border-border bg-surface shadow-float',
          'sm:h-full sm:max-h-none sm:w-(--sheet-width) sm:rounded-t-none sm:rounded-l-sheet sm:border-t-0 sm:border-l',
          className
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <h2 className="truncate text-16 font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-(--control-height) w-(--control-height) items-center justify-center rounded-card text-muted transition-colors duration-100 hover:bg-sunken hover:text-ink"
          >
            &times;
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
