import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

import { sendMagicLink, signInWithGoogle, signInWithPassword } from './actions';

// Three ways in.
//
// A password came last, in slice 24, and went first on the page. The other two
// both depend on something outside this app — the magic link needs you to go and
// read your email, Google needs a working OAuth client — and a password needs
// neither. That is the whole argument: it is the one that works at 7:45am on a
// phone with one hand.
//
// The email box is shared between the password form and the magic link, using
// two submit buttons with different `formAction`s. One box, no JavaScript, and
// no chance of typing your address into the wrong one of two identical fields.
// The password input is deliberately not `required`, so "email me a link
// instead" submits with it empty; the action checks for itself.
//
// This page never creates an account. A password is set from
// `/settings/account` while signed in, so there is no path here that makes a
// new user — which means a typo in an email address is "that did not work"
// rather than a second, empty account with your data missing from it.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; email?: string }>;
}) {
  const { sent, error, email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-20 font-semibold">Recalc</h1>

      {sent ? (
        <p className="text-14 text-muted">Check your email for a sign-in link.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <form className="flex flex-col gap-3">
            <Field label="Email">
              <Input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@university.edu"
                defaultValue={email ?? ''}
              />
            </Field>

            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Leave blank to get a link instead"
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

            {/* Same email box, different action. `formNoValidate` is not needed
                because the password field is not required — the only required
                field is the email, which this one wants too. */}
            <Button type="submit" formAction={sendMagicLink} variant="ghost" className="w-full">
              Email me a link instead
            </Button>
          </form>

          {/* A rule with a word in it, rather than a heading. */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-line" />
            <span className="font-mono text-label text-faint uppercase">or</span>
            <hr className="flex-1 border-0 border-t border-line" />
          </div>

          <form action={signInWithGoogle}>
            <Button type="submit" variant="secondary" className="w-full">
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

      {/* Said here because it is the one thing about signing in that surprises
          people: the button above proves who you are and nothing more. */}
      <p className="text-12 text-muted">
        Signing in with Google does not give Recalc access to your Drive or your
        mail. Those are separate, and you are asked for them in Settings.
      </p>

      <p className="text-12 text-muted">
        No password yet? Sign in with a link, then set one on Settings → Account. It
        is the same account either way.
      </p>
    </main>
  );
}
