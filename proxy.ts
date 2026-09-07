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
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/styleguide') ||
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
  // The cost is one primary-key lookup on every signed-in request, and it is
  // larger than it looks. `getUser()` above is itself a network call — it
  // validates the JWT rather than trusting the cookie — so this makes the proxy
  // two *sequential* round trips before any page begins to render. Against this
  // project's database that is measured at ~600ms each: about 1.2s of latency
  // ahead of every navigation.
  //
  // It is kept because the alternative is screens that must each handle a
  // signed-in user with no name, and slice 19 assumes every row in `profiles`
  // has one. But the honest fix is known and is not "remove the gate": put the
  // flag in the JWT's `app_metadata` when the username is claimed, and
  // `getUser()` returns it for free. See docs/DECISIONS.md — and note that the
  // 600ms is a fact about the database being in ap-southeast-2, which is the
  // bigger and more useful thing to fix.
  if (user && !isPublic) {
    const named = await hasProfile(supabase, user.id);
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
