import Link from 'next/link';

import { disconnectEmailAction, syncEmailAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { createClient } from '@/lib/supabase/server';
import { SYNC_WINDOW_DAYS, getEmailAccounts } from '@/modules/gmail';
import { GMAIL_READONLY_SCOPE, requestedGmailScopes } from '@/modules/google';
import { ensureWorkspace } from '@/modules/workspaces';

// Where Gmail is connected, synced and disconnected.
//
// It renders in every state without a Google account existing: nothing
// connected, Drive connected but not Gmail, Gmail connected and synced, and
// Gmail connected but the token revoked. The last of those is the whole reason
// `google_accounts.status` exists, and it gets the quiet banner at the top
// rather than an error page — prompts/14-email-connect.md point 5.
//
// Nothing here interprets a message. It lists what arrived, and that is the
// entire slice: "Ingestion only — no interpretation at all."

export const metadata = { title: 'Email · Recalc' };

/** "3 minutes ago". Calm, and free of any timezone to get wrong. */
function ago(iso: string | null, now: Date): string {
  if (!iso) return 'never';
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** "Dr Ada Byron" out of "Dr Ada Byron <ada@uni.example>". */
function senderName(sender: string): string {
  const match = sender.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match?.[1] ?? sender).trim();
}

export default async function EmailSettingsPage({
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

  await ensureWorkspace(supabase, user.id);

  const accounts = await getEmailAccounts(supabase, user.id, { recent: 8 });
  const now = new Date();
  // Only Gmail accounts get the banner: a Drive-only row with a dead token is
  // /settings/drive's sentence to say, not this screen's.
  const needsReconnect = accounts.filter(
    ({ account }) =>
      account.granted_scopes.includes(GMAIL_READONLY_SCOPE) && account.status !== 'ok'
  );

  return (
    <>
      <PageHeader
        title="Email"
        subtitle="Read-only. Recalc lists what arrived; it never sends, replies, labels or deletes."
        actions={
          <>
            <Link
              href="/settings/drive"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Drive
            </Link>
            <Link
              href="/settings/agents"
              className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Agents
            </Link>
          </>
        }
      />

      {/* The quiet banner. One sentence, the accent colour, and a way out. */}
      {needsReconnect.length > 0 ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {needsReconnect.length === 1
            ? `Google has stopped accepting the connection for ${needsReconnect[0].account.address}. Reconnect it below — nothing already synced is lost.`
            : `${needsReconnect.length} accounts need reconnecting. Nothing already synced is lost.`}
        </div>
      ) : null}

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {params.connected ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          <p className="font-medium">Connected.</p>
          <p className="mt-1 text-muted">
            <span className="font-mono">{params.connected}</span> — press Sync now to pull
            the last {SYNC_WINDOW_DAYS} days.
          </p>
        </div>
      ) : null}

      {params.synced ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          {params.synced}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              title="No Google account connected"
              description="Connect one to list what has arrived. Recalc asks only to read."
              action={
                <Link href="/api/auth/google/start?feature=gmail" prefetch={false}>
                  <Button variant="primary" type="button">
                    Connect Gmail
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : null}

        {accounts.map(({ account, stored, recent }) => {
          const gmailGranted = account.granted_scopes.includes(GMAIL_READONLY_SCOPE);
          const broken = account.status !== 'ok';

          return (
            <Card key={account.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-16 font-medium break-all">
                    {account.address}
                  </p>
                  <p className="mt-1 text-13 text-muted">
                    {!gmailGranted
                      ? 'Connected for Drive. Gmail has not been granted on this account.'
                      : broken
                        ? 'Google is no longer accepting this connection.'
                        : `Last synced ${ago(account.synced_at, now)} · ${stored} ${
                            stored === 1 ? 'message' : 'messages'
                          } stored`}
                  </p>
                </div>

                {broken ? <Pill tone="accent">Needs reconnecting</Pill> : null}
                {gmailGranted && !broken ? <Pill tone="ok">Gmail</Pill> : null}
                {!gmailGranted && !broken ? <Pill>Drive only</Pill> : null}
              </div>

              <CardDivider />

              <div className="flex flex-wrap items-center gap-2 px-4 py-4">
                {gmailGranted && !broken ? (
                  <form action={syncEmailAction}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <Button type="submit" variant="primary">
                      Sync now
                    </Button>
                  </form>
                ) : null}

                {/* A plain link, not a form: this leaves the app for Google. */}
                <Link href="/api/auth/google/start?feature=gmail" prefetch={false}>
                  <Button variant="secondary" type="button">
                    {gmailGranted ? 'Reconnect Gmail' : 'Connect Gmail'}
                  </Button>
                </Link>

                <form action={disconnectEmailAction}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <Button type="submit" variant="secondary">
                    Disconnect
                  </Button>
                </form>
              </div>

              {recent.length > 0 ? (
                <>
                  <CardDivider />
                  <div className="px-4 py-4">
                    <p className="pb-2 font-mono text-label text-faint uppercase">
                      Recently arrived
                    </p>
                    <ul className="flex flex-col gap-3">
                      {recent.map((message) => (
                        <li key={message.id} className="min-w-0">
                          <p className="truncate text-14">
                            {message.subject ?? '(no subject)'}
                          </p>
                          <p className="mt-0.5 truncate text-13 text-muted">
                            {senderName(message.sender)}
                            <span className="font-mono text-12 text-faint tabular-nums">
                              {' · '}
                              {ago(message.received_at, now)}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </Card>
          );
        })}
      </div>

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">What this can see</p>
        <Card>
          <div className="flex flex-col gap-3 px-4 py-4 text-14 text-muted">
            <p>
              Recalc asks for one Gmail scope and no more:{' '}
              {requestedGmailScopes().map((scope) => (
                <span key={scope} className="font-mono text-12 break-all text-ink">
                  {scope}
                </span>
              ))}
              . That is read-only. There is no code in this app that could send, reply to,
              archive, label or delete a message, and no scope that would let it.
            </p>
            <p>
              What is stored is the sender, the subject, the snippet Gmail shows in the
              list, the time it arrived and its thread — <em>never</em> the body of a
              message.
            </p>
            <p>
              The first sync pulls the last {SYNC_WINDOW_DAYS} days. Every sync after that
              asks Gmail only what has changed since the last one, so it stays fast however
              much mail there is.
            </p>
            <p>
              Google shows an &ldquo;unverified app&rdquo; warning for mail access. That is
              expected — this app is only ever used by you. Setting up the Google side is a
              one-off:{' '}
              <span className="font-mono text-12">docs/GOOGLE_SETUP.md</span> has the steps.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}
