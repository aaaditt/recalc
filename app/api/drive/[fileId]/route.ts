import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { DriveFileGone, GoogleReconnectRequired, openDriveFile, openDriveThumbnail } from '@/modules/google';

// A Drive file's bytes, fetched with this user's token and handed straight to
// the browser.
//
// It exists because a component may not hold a credential (CLAUDE.md's Never
// rule 4), and Drive will not serve a private file to an <img> tag without one.
// Nothing is written down on the way through — the bytes are streamed and
// forgotten, which is docs/SCHEMA.md's "store the reference, never the bytes"
// applied to the read path too.
//
// `?thumb=1` asks for the small preview instead of the whole file.

/** Plain text, never an error page. A broken tile must not take the page down. */
function plain(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

// Drive's own content-type header is not trusted. A file the user picked
// could be (or, since Drive files are mutable, could later become) an SVG or
// HTML document with an embedded script; serving that inline with its real
// type on this app's own origin would let it run as this app, with this
// user's session. Only the shapes the file grid actually needs to render
// inline are allowed through as-is — everything else is coerced to a type no
// browser executes and offered as a download instead of shown in place.
const SAFE_INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function inlineHeaders(upstreamType: string | null): { type: string; safe: boolean } {
  const bare = (upstreamType ?? '').split(';')[0].trim().toLowerCase();
  const safe = SAFE_INLINE_TYPES.has(bare);
  return { type: safe ? bare : 'application/octet-stream', safe };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return plain('Not signed in.', 401);

  const wantsThumbnail = request.nextUrl.searchParams.get('thumb') === '1';

  try {
    const upstream = wantsThumbnail
      ? await openDriveThumbnail(supabase, user.id, fileId)
      : await openDriveFile(supabase, user.id, fileId);

    // Drive has no thumbnail for this kind of file. Not an error — the tile
    // draws itself with the file's extension on it instead.
    if (!upstream) return plain('No preview.', 404);

    const { type, safe } = inlineHeaders(upstream.headers.get('content-type'));

    const headers = new Headers();
    headers.set('content-type', type);
    const length = upstream.headers.get('content-length');
    if (length) headers.set('content-length', length);
    // Private to this user and short-lived, because the underlying grant can be
    // revoked at any moment and a cached copy would outlive it.
    headers.set('cache-control', 'private, max-age=300');
    // Shown in place only for the small set of types this origin will not
    // execute; anything else downloads rather than renders.
    headers.set('content-disposition', safe ? 'inline' : 'attachment');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof DriveFileGone) {
      return plain('This file is no longer in your Drive.', 404);
    }
    if (error instanceof GoogleReconnectRequired) {
      return plain(error.message, 409);
    }
    return plain('Could not reach Google Drive.', 502);
  }
}
