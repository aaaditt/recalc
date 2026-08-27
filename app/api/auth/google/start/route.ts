import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  googleRedirectUri,
  scopesFor,
  startGoogleConnect,
  type GoogleFeature,
} from '@/modules/google';

// Step one of the Google connect flow: send the browser to Google.
//
// Routing only. The module decides what the URL is and which scopes are on it;
// this file's whole job is "who is asking", "remember the state", "redirect".
//
// `?feature=gmail` (slice 14) asks for gmail.readonly instead of drive.file.
// One route, because it is one OAuth client, one redirect URI and one
// `google_accounts` row per Google account — the scope asked for is the only
// thing that differs, and Google's `include_granted_scopes=true` adds it to
// what that account already granted rather than replacing it.

/** The one-time value Google must hand back, kept where JavaScript cannot read it. */
const STATE_COOKIE = 'google_oauth_state';
/** Which half of the connection this trip is for, so the callback knows. */
const FEATURE_COOKIE = 'google_oauth_feature';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const feature: GoogleFeature =
    request.nextUrl.searchParams.get('feature') === 'gmail' ? 'gmail' : 'drive';

  const origin = new URL(request.url).origin;
  const { url, state } = startGoogleConnect(
    googleRedirectUri(origin),
    scopesFor(feature)
  );

  const response = NextResponse.redirect(url);
  const cookie = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    // Long enough to read a consent screen — and Gmail's has an "unverified
    // app" warning to click through as well — short enough that an abandoned
    // attempt does not sit around being replayable.
    maxAge: 10 * 60,
  };
  response.cookies.set(STATE_COOKIE, state, cookie);
  response.cookies.set(FEATURE_COOKIE, feature, cookie);

  return response;
}
