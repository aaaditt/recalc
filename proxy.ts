import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import { hasProfile } from '@/modules/profiles';

// Next 16's proxy (formerly middleware). Three jobs: refresh the session cookie
// on every request, keep unauthenticated visitors on /login, and keep a signed-in
// visitor who has not picked a username on /welcome.
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT against Supabase — never trust the cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // /styleguide is the design system's showroom: no data, no user, and it
  // 404s outside development. Public so the phone check does not need a
  // magic link first.
  //
  // The web app manifest is fetched by the browser without credentials, so it
  // has to be reachable signed out or the app is not installable. It names
  // four URLs and an icon; there is nothing in it to protect.
  // The scheduled sync is called by Vercel Cron at 02:00 UTC, when nobody is
  // signed in. It carries `Authorization: Bearer $CRON_SECRET` and no cookie,
  // so the gate below would redirect it to /login and the job would never run.
  // It is public to this proxy only — the route itself refuses anything without
  // the shared secret with a 401, and 503s if the secret is unset.
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/styleguide') ||
    path.startsWith('/api/cron') ||
    path === '/manifest.json';

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && path.startsWith('/login')) {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  // The username gate — slice 18, and the only thing this app blocks on.
  //
  // Everything else in setup is a step on a card that ticks itself off and can
  // be skipped for ever. A username cannot be: it is what one person types to
  // add another, and there is no friends list without one. There is also no
  // username this app could invent that anybody would want to keep, so a new
  // account has no profile at all until a person types one in.
  //
  // Slice 19 took the round trip out of it. This used to be a primary-key
  // lookup on `profiles` on every signed-in request, sequentially after the
  // `getUser()` above — about 1.2s of latency ahead of every navigation against
  // a database in ap-southeast-2. The answer is a boolean that changes once in
  // an account's life, so migration 014 mirrors it into `app_metadata` with a
  // trigger on `profiles`, and `getUser()` brings it back for free.
  //
  // `app_metadata`, not `user_metadata`: a signed-in client can write its own
  // `user_metadata` through the API, so a gate reading that could be walked
  // straight past. `app_metadata` is writable only by the service role and by
  // SQL.
  //
  // The fallback is a real query and is meant to stay. It costs the old 600ms,
  // but only for an account whose token predates the flag — and the honest
  // failure mode of a missing claim is "ask the database", never "assume yes".
  if (user && !isPublic) {
    const named =
      user.app_metadata?.has_profile === true || (await hasProfile(supabase, user.id));

    if (!named && path !== '/welcome') {
      return NextResponse.redirect(new URL('/welcome', request.url));
    }
    if (named && path === '/welcome') {
      return NextResponse.redirect(new URL('/today', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
