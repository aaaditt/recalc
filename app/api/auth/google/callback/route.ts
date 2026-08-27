import { NextResponse, type NextRequest } from 'next/server';

import { safeEqual } from '@/lib/crypto';
import { createClient } from '@/lib/supabase/server';
import {
  completeGoogleConnect,
  googleRedirectUri,
  type GoogleFeature,
} from '@/modules/google';

// Step two: Google sends the browser back here with a one-time code.
//
// Every way this can go wrong ends at the settings page it started from with a
// plain sentence in `?error=`, never a stack trace and never a blank page.
// prompts/09-drive.md point 7: "Each degrades with a plain message."

const STATE_COOKIE = 'google_oauth_state';
const FEATURE_COOKIE = 'google_oauth_feature';

const SETTINGS: Record<GoogleFeature, string> = {
  drive: '/settings/drive',
  gmail: '/settings/email',
};

function back(request: NextRequest, feature: GoogleFeature, params: Record<string, string>) {
  const url = new URL(SETTINGS[feature], request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(FEATURE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const params = request.nextUrl.searchParams;
  // Missing cookie means the flow started before slice 14 shipped, or the
  // cookie was dropped. Drive is the safe default: it is what the single
  // connect button did for five slices.
  const feature: GoogleFeature =
    request.cookies.get(FEATURE_COOKIE)?.value === 'gmail' ? 'gmail' : 'drive';
  const label = feature === 'gmail' ? 'Gmail' : 'Drive';

  // The user pressed Cancel on Google's consent screen. Not an error.
  const denied = params.get('error');
  if (denied) {
    return back(request, feature, {
      error:
        denied === 'access_denied'
          ? `${label} was not connected — you cancelled on Google.`
          : `Google refused the connection (${denied}).`,
    });
  }

  const code = params.get('code');
  const state = params.get('state');
  const expected = request.cookies.get(STATE_COOKIE)?.value;

  // Without this check, any page on the internet could walk this user through
  // connecting somebody else's Google account.
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return back(request, feature, {
      error: `That connect link had expired. Press Connect ${label} again.`,
    });
  }

  try {
    const origin = new URL(request.url).origin;
    const account = await completeGoogleConnect(supabase, user.id, {
      code,
      redirectUri: googleRedirectUri(origin),
      feature,
    });
    return back(request, feature, { connected: account.address });
  } catch (error) {
    return back(request, feature, {
      error: error instanceof Error ? error.message : 'Could not connect to Google.',
    });
  }
}
