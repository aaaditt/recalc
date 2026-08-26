import { describe, expect, it } from 'vitest';

import {
  SMALL_IMAGE_MAX_BYTES,
  fileBadge,
  formatBytes,
  isImage,
  isPdf,
  opensInPlace,
  recalcFolderPath,
  storeFor,
} from './files';

// Pure. No Supabase, no Google. The database side of slice 09 is proved in
// modules/files/file-attachments.test.ts.

describe('where a file goes', () => {
  it('sends a small pasted image to Supabase Storage', () => {
    expect(storeFor({ mimeType: 'image/png', sizeBytes: 180_000 })).toBe('supabase');
    expect(storeFor({ mimeType: 'image/jpeg', sizeBytes: SMALL_IMAGE_MAX_BYTES })).toBe(
      'supabase'
    );
  });

  it('sends a slide deck, a PDF and a recording to Drive', () => {
    const cases = [
      { mimeType: 'application/pdf', sizeBytes: 400_000 },
      {
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: 12_000_000,
      },
      { mimeType: 'audio/mpeg', sizeBytes: 30_000_000 },
      { mimeType: null, sizeBytes: 10 },
    ];

    for (const file of cases) {
      expect(storeFor(file), file.mimeType ?? 'no mime type').toBe('drive');
    }
  });

  it('sends a big image to Drive — a scan is a file you go looking for', () => {
    expect(
      storeFor({ mimeType: 'image/jpeg', sizeBytes: SMALL_IMAGE_MAX_BYTES + 1 })
    ).toBe('drive');
  });
});

describe('what can open in place', () => {
  it('knows images and PDFs', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('application/pdf')).toBe(false);
    expect(isImage(null)).toBe(false);

    expect(isPdf('application/pdf')).toBe(true);
    expect(isPdf('image/png')).toBe(false);

    expect(opensInPlace('image/heic')).toBe(true);
    expect(opensInPlace('application/pdf')).toBe(true);
    expect(opensInPlace('application/vnd.google-apps.presentation')).toBe(false);
    expect(opensInPlace(undefined)).toBe(false);
  });
});

describe('what a tile says', () => {
  it('reads the extension off the name', () => {
    expect(fileBadge('Lecture 4 — Entropy.pdf', 'application/pdf')).toBe('PDF');
    expect(fileBadge('deck.pptx', null)).toBe('PPTX');
    expect(fileBadge('whiteboard.JPG', 'image/jpeg')).toBe('JPG');
  });

  it('falls back to the mime type when there is no usable extension', () => {
    expect(fileBadge('Problem sheet', 'application/pdf')).toBe('PDF');
    expect(fileBadge('pasted-image', 'image/png')).toBe('IMG');
    expect(fileBadge('Untitled', null)).toBe('FILE');
    // A Google Doc's "extension" is really part of the title.
    expect(fileBadge('Notes.on.thermodynamics', null)).toBe('FILE');
  });

  it('formats sizes coarsely, and says nothing when there is no size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
    expect(formatBytes(40_000_000)).toBe('38 MB');
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
  });
});

describe('the Drive folder', () => {
  it('is Recalc/<course code>/', () => {
    expect(recalcFolderPath('ME301')).toBe('Recalc/ME301/');
  });

  it('is Recalc/ when the file has no course', () => {
    expect(recalcFolderPath(null)).toBe('Recalc/');
    expect(recalcFolderPath('   ')).toBe('Recalc/');
  });

  it('never lets a course code become a second folder level', () => {
    expect(recalcFolderPath('ME/301')).toBe('Recalc/ME-301/');
    expect(recalcFolderPath('ME\\301')).toBe('Recalc/ME-301/');
  });
});
