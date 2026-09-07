import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/server';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, getProfile } from '@/modules/profiles';

import { claimUsernameAction } from './actions';

// Slice 18's one blocking screen.
//
// It sits outside the (app) route group, like /login, because it wants no
// navigation: there is nowhere else to go from here yet. Two fields, one of
// them optional, and no explanation of what Recalc is — whoever is reading
// this has already signed in, so the sales pitch is over.
//
// The proxy is what actually enforces the block; this page only refuses to
// draw twice. Both halves are needed: the proxy stops someone typing /today,
// and the redirect below stops a second tab showing an empty form to a person
// who already has a name.

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; username?: string }>;
}) {
  const { error, username } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Already been through here. Nothing to ask.
  if (await getProfile(supabase, user.id)) redirect('/today');

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-20 font-semibold">Pick a username</h1>
        <p className="text-14 text-muted">
          It is how a friend adds you. Everything else about setting up your semester
          can wait.
        </p>
      </div>

      <form action={claimUsernameAction} className="flex flex-col gap-4">
        <Field
          label="Username"
          hint={`${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters. Letters, numbers and underscores.`}
        >
          <Input
            name="username"
            defaultValue={username ?? ''}
            required
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            maxLength={USERNAME_MAX_LENGTH}
            placeholder="aadit"
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Field label="Display name" hint="Optional. Shown instead of your username.">
          <Input
            name="displayName"
            autoComplete="name"
            maxLength={60}
            placeholder="Aadit"
          />
        </Field>

        {/* One sentence, under the thing it is about. The accent means "something
            needs you", and a rejected username is exactly that. */}
        {error ? (
          <p role="alert" className="text-13 text-accent">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary">
          Continue
        </Button>
      </form>
    </main>
  );
}
