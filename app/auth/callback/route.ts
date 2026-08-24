import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspace } from '@/modules/workspaces';

// Lands here from the magic-link email. Exchanges the link for a session,
// makes sure the user has a workspace, and sends them to /today.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();

  // PKCE links carry ?code=; links from a customised email template carry
  // ?token_hash=&type=. Handle both so a template change never breaks login.
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error('Missing auth code in callback URL.') };

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent(error.message), url.origin)
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await ensureWorkspace(supabase, user.id);

  return NextResponse.redirect(new URL('/today', url.origin));
}
