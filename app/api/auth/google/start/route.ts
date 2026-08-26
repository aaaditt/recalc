import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { googleRedirectUri, startGoogleConnect } from '@/modules/google';

// Step one of the Drive connect flow: send the browser to Google.
//
// Routing only. The module decides what the URL is and which scopes are on it;
// this file's whole job is "who is asking", "remember the state", "redirect".

/** The one-time value Google must hand back, kept where JavaScript cannot read it. */
const STATE_COOKIE = 'google_oauth_state';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const origin = new URL(request.url).origin;
  const { url, state } = startGoogleConnect(googleRedirectUri(origin));

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    // Long enough to read a consent screen, short enough that an abandoned
    // attempt does not sit around being replayable.
    maxAge: 10 * 60,
  });

  return response;
}
