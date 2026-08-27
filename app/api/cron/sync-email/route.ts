import { NextResponse, type NextRequest } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllAccounts } from '@/modules/gmail';
import { listUserIdsWithGmail } from '@/modules/google';

// The scheduled sync. `vercel.json` points a cron at this every hour.
//
// Routing only: check who is calling, hand it to the module, report counts.
//
// It runs with no session — nobody is signed in at 6am — so it uses the
// service-role client and asks modules/google which users have a Gmail
// connection. That is the reason for the shared secret below: a route that
// acts across users with no cookie must not be callable by anyone who finds
// the URL.
//
// **Nothing about a message is in the response or in a log line.** The body is
// counts and outcomes; `SyncResult.message` is written by modules/gmail and is
// never allowed to contain a sender, a subject or a snippet.

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every invocation. */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    // Not an error the user caused, and not something to fail silently either:
    // an unconfigured job that returns 200 looks exactly like a working one.
    return NextResponse.json(
      { error: 'CRON_SECRET is not set, so the scheduled sync is disabled.' },
      { status: 503 }
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: 'not authorised' }, { status: 401 });
  }

  const db = createAdminClient();
  const userIds = await listUserIdsWithGmail(db);

  const accounts: { outcome: string; mode: string; stored: number }[] = [];
  for (const userId of userIds) {
    for (const result of await syncAllAccounts(db, userId)) {
      // The address is deliberately left out: it is the user's mail address and
      // this response ends up in a deploy log.
      accounts.push({
        outcome: result.outcome,
        mode: result.mode,
        stored: result.stored,
      });
    }
  }

  return NextResponse.json({
    users: userIds.length,
    accounts: accounts.length,
    stored: accounts.reduce((total, account) => total + account.stored, 0),
    outcomes: accounts,
  });
}
