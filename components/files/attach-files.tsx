'use client';

// Attaching things to a lecture: pick from Drive, drop a file, take a photo.
//
// 'use client' because all three are interactions. It holds no credential of
// its own — the short-lived Drive token arrives from `prepare()`, a server
// action, at the moment of the click, and is used and dropped (CLAUDE.md's
// Never rule 4).
//
// Where a file goes is decided by `storeFor` in lib/files.ts, which has its own
// test: a small image goes to Supabase Storage, everything else goes to Drive.
// That is what makes pasting a whiteboard photo work with no Drive account
// connected at all.

import Link from 'next/link';
import { useRef, useState } from 'react';

import { pickDriveFiles, uploadToDrive } from '@/components/files/drive-client';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import { storeFor } from '@/lib/files';

export type DriveUploadTarget = {
  accessToken: string;
  appId: string;
  folderId: string;
  folderPath: string;
};

type AttachFilesProps = {
  /** A Google account is connected and Drive access is still good. */
  connected: boolean;
  /** Connected once, but Google is refusing the token now. */
  needsReconnect: boolean;
  /** NEXT_PUBLIC_GOOGLE_PICKER_API_KEY, or null when it is not configured. */
  developerKey: string | null;
  /** Where uploads land: `Recalc/ME301/`. Shown so it is never a surprise. */
  folderPath: string;
  /** Mints a token and makes sure the folder exists. Ownership-checked server-side. */
  prepare: () => Promise<DriveUploadTarget>;
  /** Records picked or uploaded Drive files against this lecture. */
  attach: (fileIds: string[]) => Promise<void>;
  /** A small image, straight to Supabase Storage. */
  saveImage: (formData: FormData) => Promise<void>;
};

export function AttachFiles({
  connected,
  needsReconnect,
  developerKey,
  folderPath,
  prepare,
  attach,
  saveImage,
}: AttachFilesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const driveReady = connected && !needsReconnect;

  /** The one check worth making before every network round trip on a phone. */
  function offline(): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setProblem('You are offline. Files will attach once you are back on a network.');
      return true;
    }
    return false;
  }

  async function handleFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    setProblem(null);
    if (offline()) return;

    const images = chosen.filter(
      (file) => storeFor({ mimeType: file.type || null, sizeBytes: file.size }) === 'supabase'
    );
    const forDrive = chosen.filter((file) => !images.includes(file));

    if (forDrive.length > 0 && !driveReady) {
      setProblem(
        needsReconnect
          ? 'Google Drive needs reconnecting before big files can be attached.'
          : 'Connect Google Drive to attach slides, PDFs and recordings.'
      );
      if (images.length === 0) return;
    }

    try {
      for (const image of images) {
        setBusy(`Saving ${image.name}…`);
        const form = new FormData();
        form.set('image', image);
        await saveImage(form);
      }

      if (forDrive.length > 0 && driveReady) {
        setBusy('Getting your Drive ready…');
        const target = await prepare();

        const uploaded: string[] = [];
        for (const file of forDrive) {
          setBusy(`Uploading ${file.name} to ${target.folderPath}…`);
          uploaded.push(
            await uploadToDrive({
              accessToken: target.accessToken,
              folderId: target.folderId,
              file,
            })
          );
        }

        setBusy('Attaching…');
        await attach(uploaded);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  async function openPicker() {
    setProblem(null);
    if (offline()) return;

    if (!developerKey) {
      setProblem(
        'The Google Picker needs NEXT_PUBLIC_GOOGLE_PICKER_API_KEY in .env.local — see docs/GOOGLE_SETUP.md.'
      );
      return;
    }

    try {
      setBusy('Opening your Drive…');
      const target = await prepare();

      const ids = await pickDriveFiles({
        accessToken: target.accessToken,
        developerKey,
        appId: target.appId,
      });
      // Cancelled. Not an error, and nothing to say about it.
      if (ids.length === 0) return;

      setBusy('Attaching…');
      await attach(ids);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not open your Drive.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFiles([...event.dataTransfer.files]);
      }}
      className={cx(
        'flex flex-col gap-3 rounded-card border border-dashed px-4 py-4 transition-colors duration-100',
        dragging ? 'border-ink bg-sunken' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void openPicker()}>
          Attach from Drive
        </Button>

        <Button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </Button>

        {/* A phone opens the camera straight from this one. */}
        <Button
          type="button"
          className="sm:hidden"
          disabled={busy !== null}
          onClick={() => cameraInput.current?.click()}
        >
          Take a photo
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void handleFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void handleFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />

      <p className="text-12 text-muted">
        Drop a file here, or use the buttons. Slides, PDFs and recordings go to{' '}
        <span className="font-mono">{folderPath}</span> in your Drive; a small photo or
        screenshot is stored by Recalc itself.
      </p>

      {!driveReady ? (
        <p className="text-12 text-muted">
          {needsReconnect
            ? 'Google Drive needs reconnecting.'
            : 'No Drive account connected — photos still work.'}{' '}
          <Link
            href="/settings/drive"
            className="underline underline-offset-4 hover:text-ink"
          >
            {needsReconnect ? 'Reconnect Drive' : 'Connect Drive'}
          </Link>
        </p>
      ) : null}

      {busy ? (
        <p aria-live="polite" className="text-12 text-muted">
          {busy}
        </p>
      ) : null}

      {problem ? (
        <p aria-live="polite" className="text-12 text-accent">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
