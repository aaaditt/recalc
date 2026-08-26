'use client';

// One file in the lecture's grid.
//
// 'use client' for three genuinely interactive things and nothing else: a
// thumbnail that fails to load, the in-place viewer, and the two-step remove.
// It holds no credential — every URL it is given is either a route on this app
// or an already-signed Supabase URL (CLAUDE.md's Never rule 4).

import { useState, useTransition } from 'react';

import { Sheet } from '@/components/ui/sheet';
import { cx } from '@/lib/cx';
import { fileBadge, formatBytes, isImage, isPdf } from '@/lib/files';

export type FileTileProps = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Where the bytes are. Null when this kind of file cannot be shown here. */
  viewUrl: string | null;
  thumbnailUrl: string | null;
  /** Null for an image stored by Recalc rather than sitting in Drive. */
  driveUrl: string | null;
  inDrive: boolean;
  remove: (id: string) => Promise<void>;
};

export function FileTile({
  id,
  name,
  mimeType,
  sizeBytes,
  viewUrl,
  thumbnailUrl,
  driveUrl,
  inDrive,
  remove,
}: FileTileProps) {
  // A thumbnail that will not load is not an error page — it is a tile with
  // the extension on it (prompts/09-drive.md point 7).
  const [thumbBroken, setThumbBroken] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  const size = formatBytes(sizeBytes);
  const badge = fileBadge(name, mimeType);
  const showThumb = thumbnailUrl !== null && !thumbBroken;

  function onRemove() {
    startRemoving(async () => {
      try {
        await remove(id);
      } catch {
        setProblem('Could not remove it. Check your connection and try again.');
        setConfirming(false);
      }
    });
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
      <button
        type="button"
        disabled={viewUrl === null}
        onClick={() => setViewerOpen(true)}
        title={viewUrl === null ? `${name} — opens in Drive` : `Open ${name} here`}
        className={cx(
          'flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-sunken',
          viewUrl === null ? 'cursor-default' : 'transition-opacity duration-100 hover:opacity-90'
        )}
      >
        {showThumb ? (
          // A plain <img>: the source is this app's own Drive proxy or a signed
          // Supabase URL, and next/image would want both hosts configured for
          // an optimisation nobody asked for on a 200px tile.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-mono text-label tracking-widest text-faint uppercase">
            {badge}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-col gap-1 px-3 py-2">
        <p className="truncate text-13 font-medium" title={name}>
          {name}
        </p>
        <p className="font-mono text-12 text-faint">
          {[inDrive ? 'Drive' : 'Recalc', size].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2">
        {driveUrl ? (
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-12 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Open in Drive
          </a>
        ) : null}

        {viewUrl && !driveUrl ? (
          <a
            href={viewUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-12 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Open full size
          </a>
        ) : null}

        <button
          type="button"
          disabled={removing}
          onClick={() => setConfirming(true)}
          className="ml-auto text-12 text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {problem ? (
        <p className="border-t border-line px-3 py-2 text-12 text-accent">{problem}</p>
      ) : null}

      {/* The one thing this UI must never be ambiguous about. */}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Remove from this lecture?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-14">
            <span className="font-medium">{name}</span> will stop showing on this lecture.
          </p>

          <p className="rounded-card bg-sunken px-3 py-2 text-13 text-muted">
            {inDrive
              ? 'The file itself stays in your Google Drive. Recalc never deletes a Drive file — to delete it, do that in Drive.'
              : 'This image was stored by Recalc rather than in your Drive, so removing it here deletes it for good.'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={removing}
              onClick={onRemove}
              className="inline-flex h-(--control-height) items-center rounded-card bg-ink px-(--control-padding-x) text-14 font-medium text-bg disabled:opacity-50"
            >
              {removing ? 'Removing…' : 'Remove from lecture'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex h-(--control-height) items-center rounded-card border border-border bg-surface px-(--control-padding-x) text-14 font-medium hover:bg-sunken"
            >
              Keep it
            </button>
          </div>
        </div>
      </Sheet>

      {viewUrl ? (
        <Sheet
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          title={name}
          className="sm:w-[min(52rem,92vw)]"
        >
          <Viewer name={name} mimeType={mimeType} url={viewUrl} driveUrl={driveUrl} />
        </Sheet>
      ) : null}
    </li>
  );
}

/**
 * The file, shown here rather than in Drive.
 *
 * Images and PDFs only — everything else has an "Open in Drive" link and no
 * pretence of being viewable, which is what docs/DESIGN.md's "opening in place
 * where possible" means in practice.
 */
function Viewer({
  name,
  mimeType,
  url,
  driveUrl,
}: {
  name: string;
  mimeType: string | null;
  url: string;
  driveUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-14">This file would not open.</p>
        <p className="text-13 text-muted">
          It may have been deleted in Drive, or you may be offline. The link here can be
          removed with the Remove button on the tile.
        </p>
        {driveUrl ? (
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-13 underline underline-offset-4"
          >
            Try opening it in Drive
          </a>
        ) : null}
      </div>
    );
  }

  if (isImage(mimeType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        onError={() => setFailed(true)}
        className="mx-auto max-h-[75svh] w-auto max-w-full rounded-card"
      />
    );
  }

  if (isPdf(mimeType)) {
    return (
      <object data={url} type="application/pdf" className="h-[75svh] w-full rounded-card">
        {/* Shown when the browser has no PDF viewer — a phone, usually. */}
        <p className="text-14 text-muted">
          This browser will not show a PDF inline.{' '}
          <a
            href={driveUrl ?? url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4"
          >
            Open it in a new tab
          </a>
          .
        </p>
      </object>
    );
  }

  return (
    <p className="text-14 text-muted">
      Recalc cannot show this kind of file here.{' '}
      {driveUrl ? (
        <a
          href={driveUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
        >
          Open it in Drive
        </a>
      ) : null}
    </p>
  );
}
