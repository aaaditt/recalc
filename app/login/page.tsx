import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

import { sendMagicLink, signInWithGoogle } from './actions';

// Two ways in, added in slice 18. The magic link is the original; Google is the
// one that matters on a phone at 7:45am, where "go and check your email" is
// three apps away.
//
// The controls come from the design system now. The comment this file used to
// carry — "bare on purpose — the design system arrives in slice 02" — was
// fifteen slices out of date, and the page could not gain a second button
// without picking one look or the other.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-20 font-semibold">Recalc</h1>

      {sent ? (
        <p className="text-14 text-muted">Check your email for a sign-in link.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <form action={signInWithGoogle}>
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Google
            </Button>
          </form>

          {/* A rule with a word in it, rather than a heading. The two halves are
              equals — neither is the fallback. */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-line" />
            <span className="font-mono text-label text-faint uppercase">or</span>
            <hr className="flex-1 border-0 border-t border-line" />
          </div>

          <form action={sendMagicLink} className="flex flex-col gap-3">
            <Field label="Email">
              <Input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@university.edu"
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full">
              Send magic link
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
    </main>
  );
}
