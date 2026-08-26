import Link from 'next/link';

import { disconnectDriveAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAccount, requestedScopes } from '@/modules/google';
import { ensureWorkspace } from '@/modules/workspaces';

// Where Drive is connected and disconnected.
//
// It renders in three states and none of them is a broken page: never
// connected, connected, and connected-but-the-token-was-revoked. The last one
// is the whole reason `google_accounts.status` exists.

export const metadata = { title: 'Drive · Recalc' };

export default async function DriveSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Not needed to read the account, but every other signed-in page does it and
  // it is what makes a brand-new user land on a page that works.
  await ensureWorkspace(supabase, user.id);

  const account = await getGoogleAccount(supabase, user.id);
  const needsReconnect = account !== null && account.status !== 'ok';

  return (
    <>
      <PageHeader
        title="Google Drive"
        subtitle="Where lecture slides, whiteboard photos and problem sheets live."
        actions={
          <>
            {/* Slice 10 added /settings/agents. Settings screens link to each
                other because the bottom nav is full at five columns
                (docs/DECISIONS.md) — the same reason /courses and
                /settings/semester are reached from the calendar header. */}
            <Link
              href="/settings/agents"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Agents
            </Link>
            <Link
              href="/settings/semester"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Semester
            </Link>
          </>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {params.connected ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          <p className="font-medium">Connected.</p>
          <p className="mt-1 text-muted">
            <span className="font-mono">{params.connected}</span> — you can attach files to
            a lecture now.
          </p>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-16 font-medium">
              {account ? account.address : 'Not connected'}
            </p>
            <p className="mt-1 text-13 text-muted">
              {account
                ? needsReconnect
                  ? 'Google is no longer accepting this connection.'
                  : 'Recalc can see only the files you pick or upload through it.'
                : 'Connect a Google account to attach files to your lectures.'}
            </p>
          </div>

          {needsReconnect ? <Pill tone="accent">Needs reconnecting</Pill> : null}
          {account && !needsReconnect ? <Pill tone="ok">Connected</Pill> : null}
        </div>

        <CardDivider />

        <div className="flex flex-wrap items-center gap-2 px-4 py-4">
          {/* A plain link, not a form: this leaves the app for Google. */}
          <Link href="/api/auth/google/start" prefetch={false}>
            <Button variant="primary" type="button">
              {account ? 'Reconnect Drive' : 'Connect Drive'}
            </Button>
          </Link>

          {account ? (
            <form action={disconnectDriveAction}>
              <Button type="submit" variant="secondary">
                Disconnect
              </Button>
            </form>
          ) : null}
        </div>

        {account ? (
          <>
            <CardDivider />
            <div className="px-4 py-4">
              <p className="font-mono text-label text-faint uppercase">Granted access</p>
              <ul className="mt-2 flex flex-col gap-1">
                {account.granted_scopes.map((scope) => (
                  <li key={scope} className="font-mono text-12 break-all text-muted">
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Card>

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">What this can see</p>
        <Card>
          <div className="flex flex-col gap-3 px-4 py-4 text-14 text-muted">
            <p>
              Recalc asks for one scope and no more:{' '}
              {requestedScopes().map((scope) => (
                <span key={scope} className="font-mono text-12 break-all text-ink">
                  {scope}
                </span>
              ))}
              . That is Google&rsquo;s <em>per-file</em> scope. It grants access only to
              files you hand over through the picker, and to files Recalc itself created.
              The rest of your Drive stays invisible to it.
            </p>
            <p>
              Disconnecting removes the token and tells Google to forget the grant. Files
              already attached stay listed and stay in your Drive — Recalc never deletes a
              Drive file.
            </p>
            <p>
              Setting up the Google side is a one-off:{' '}
              <span className="font-mono text-12">docs/GOOGLE_SETUP.md</span> has the exact
              steps.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}
