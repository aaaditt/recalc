import Link from 'next/link';

import { setDisplayNameAction, setPasswordAction, signOutAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/modules/profiles';

// Who you are, and the way out — slice 24.
//
// This page exists because until slice 24 there was no way to sign out of this
// app. Twenty-three slices, and not one line anywhere called `signOut()` — the
// kind of gap that survives that long precisely because the person building it
// is always already signed in.
//
// Three sections, in the order they matter to somebody who came here on purpose:
// what a friend sees, how you get in, and how you get out.

export const metadata = { title: 'Account · Recalc' };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pb-3 font-mono text-label text-faint uppercase">{children}</p>;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;

  const found = await currentWorkspace();
  if (!found) return null;

  const profile = await getProfile(await createClient(), found.user.id);

  return (
    <>
      <PageHeader
        title="Account"
        subtitle={profile ? `@${profile.username}` : undefined}
        actions={
          <Link
            href="/settings"
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Settings
          </Link>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {params.saved ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          {params.saved === 'password' ? 'Password saved.' : 'Saved.'}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section className="pb-8">
        <SectionLabel>You</SectionLabel>
        <Card>
          <div className="px-4 py-3">
            <p className="text-12 text-muted">Signed in as</p>
            <p className="pt-1 font-mono text-14">{found.user.email ?? '—'}</p>
          </div>

          <CardDivider />

          <div className="px-4 py-3">
            <p className="text-12 text-muted">Username</p>
            <p className="pt-1 font-mono text-14">@{profile?.username ?? '—'}</p>
            {/* Stated rather than offered. A username is what somebody else
                types to add you, so changing it silently breaks their end —
                slice 18 decided this and nothing here reopens it. */}
            <p className="pt-1 text-12 text-muted">
              This cannot be changed. It is what a friend types to add you.
            </p>
          </div>

          <CardDivider />

          <form action={setDisplayNameAction} className="px-4 py-3">
            <Field label="Display name">
              <Input
                name="displayName"
                defaultValue={profile?.display_name ?? ''}
                placeholder="Optional"
                autoComplete="name"
              />
            </Field>
            <p className="pt-2 pb-3 text-12 text-muted">
              What a friend sees instead of your username. Leave it empty to just be
              @{profile?.username}.
            </p>
            <Button type="submit">Save name</Button>
          </form>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="pb-8">
        <SectionLabel>Signing in</SectionLabel>
        <Card>
          <form action={setPasswordAction} className="flex flex-col gap-3 px-4 py-3">
            <p className="text-14 text-muted">
              Set a password and you can sign in without waiting for an email or using
              Google. It is the same account either way.
            </p>

            <Field label="New password">
              <Input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>

            {/* Twice, because you cannot see what you typed and getting it wrong
                locks you out of a door you just built. */}
            <Field label="Again">
              <Input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>

            <p className="text-12 text-muted">At least 8 characters.</p>

            <div>
              <Button type="submit" variant="primary">
                Save password
              </Button>
            </div>
          </form>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="pb-8">
        <SectionLabel>Leaving</SectionLabel>
        <Card>
          <form action={signOutAction} className="px-4 py-3">
            <p className="pb-3 text-14 text-muted">
              Signs you out everywhere, not just in this browser — every device you
              have signed in on. Nothing is deleted.
            </p>
            <Button type="submit">Sign out</Button>
          </form>
        </Card>
      </section>
    </>
  );
}
