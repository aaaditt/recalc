import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

import {
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from './actions';

// One box, one password, and two buttons: sign in, or make an account.
//
// This page used to say "This page never creates an account", and that sentence
// was the bug. The only two calls that could create one — the magic link and
// Google — both hand the browser to Supabase, which sends it back to whatever
// is in the project's redirect allow-list and falls back to Site URL when
// nothing matches. Site URL was http://localhost:3000, so the first person who
// was not Aadit followed a link to a machine that was not running. The one door
// that never redirects anywhere, a password, was the one the page refused to
// open for anybody new.
//
// Slice 27 opens it. Accounts are made server-side with the service role and no
// mail is sent, so nothing about getting in depends on the allow-list any more.
//
// The first field takes an email **or** a username, which is why it is
// `type="text"` and not `type="email"` — the browser would reject "aadit"
// before the form was ever submitted. Making an account still needs an address,
// and the action says so in a sentence rather than the field refusing to type.
//
// The magic link is still here, at the bottom, in small print. It is the only
// way back for somebody who has forgotten their password, and it is the one
// thing on this page that still needs the allow-list to be right.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; identifier?: string }>;
}) {
  const { sent, error, identifier } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-20 font-semibold">Recalc</h1>

      {sent ? (
        <p className="text-14 text-muted">Check your email for a sign-in link.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <form className="flex flex-col gap-3">
            <Field label="Email or username">
              <Input
                name="identifier"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="you@university.edu"
                defaultValue={identifier ?? ''}
              />
            </Field>

            <Field label="Password">
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="At least 8 characters"
              />
            </Field>

            <Button
              type="submit"
              formAction={signInWithPassword}
              variant="primary"
              className="w-full"
            >
              Sign in
            </Button>

            {/* Same two boxes, different action. Making an account needs the
                first box to be an address; the action says so if it is not. */}
            <Button
              type="submit"
              formAction={signUpWithPassword}
              variant="secondary"
              className="w-full"
            >
              Create an account
            </Button>
          </form>

          {/* A rule with a word in it, rather than a heading. */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-line" />
            <span className="font-mono text-label text-faint uppercase">or</span>
            <hr className="flex-1 border-0 border-t border-line" />
          </div>

          <form action={signInWithGoogle}>
            <Button type="submit" variant="ghost" className="w-full">
              Continue with Google
            </Button>
          </form>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-13 text-accent">
          {error}
        </p>
      ) : null}

      {sent ? null : (
        <>
          {/* The recovery path, deliberately last and deliberately quiet: there
              is no password reset, so this is the only way back in. */}
          <form className="flex flex-col gap-2 border-t border-line pt-4">
            <label className="text-12 text-muted" htmlFor="recovery-email">
              Forgotten your password? Put your email in and we will send a link.
            </label>
            <div className="flex gap-2">
              <Input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@university.edu"
                className="flex-1"
              />
              <Button type="submit" formAction={sendMagicLink} variant="ghost">
                Send
              </Button>
            </div>
          </form>

          <p className="text-12 text-muted">
            Signing in with Google does not give Recalc access to your Drive or your
            mail. Those are separate, and you are asked for them in Settings.
          </p>
        </>
      )}
    </main>
  );
}
