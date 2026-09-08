import Link from 'next/link';
import { Fragment } from 'react';

import {
  acceptRequestAction,
  addFriendAction,
  removeFriendAction,
  setShareAction,
} from './actions';
import { FriendRow, IncomingRow, OutgoingRow } from '@/components/friends/friend-row';
import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/server';
import { getFriends } from '@/modules/friends';

// Friends — slice 22.
//
// Three groups, because they are three different things to a person: people you
// are friends with, people waiting on you, and people you are waiting on. Only
// the middle one has a decision in it.
//
// **You add somebody by typing their exact username, and there is no search.**
// That is not a missing feature. A lookup permissive enough to find `@aadit`
// from `aad` is permissive enough to list every account on this app, and it
// cannot be taken back once other people have signed up. `find_profile_by_username`
// is exact-match, one row, never yourself — see migration 013.
//
// Everything on this screen comes from `my_friendships()`, one round trip, which
// names exactly the three fields of another person you are allowed to see.
// `profiles_select` was deliberately NOT widened to friends: a policy is
// row-level, so that would have handed a friend every column on the row.

export const metadata = { title: 'Friends · Recalc' };

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; username?: string; asked?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const { friends, incoming, outgoing } = await getFriends(supabase);

  return (
    <>
      <PageHeader
        title="Friends"
        subtitle={
          friends.length === 0
            ? 'Add somebody by their username to compare timetables.'
            : `${friends.length} friend${friends.length === 1 ? '' : 's'}.`
        }
        actions={
          <Link
            href="/timetable"
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Timetable
          </Link>
        }
      />

      {params.error ? (
        <div className="mb-4 rounded-card bg-accent-bg px-4 py-3 text-14 text-accent">
          {params.error}
        </div>
      ) : null}

      {params.asked ? (
        <div className="mb-4 rounded-card border border-border bg-surface px-4 py-3 text-14">
          Asked <span className="font-mono">@{params.asked}</span>. They will see it next
          time they open Recalc.
        </div>
      ) : null}

      <Card className="mb-6">
        <form
          action={addFriendAction}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end"
        >
          <Field label="Their username" className="flex-1">
            <Input
              name="username"
              placeholder="aadit"
              autoComplete="off"
              spellCheck={false}
              defaultValue={params.username ?? ''}
            />
          </Field>
          <Button type="submit" variant="primary">
            Send request
          </Button>
        </form>
        <p className="border-t border-line px-4 py-3 text-12 text-muted">
          Exactly as they typed it, and there is no search — a box that found people
          from the first few letters would make every account here findable by anyone.
        </p>
      </Card>

      {incoming.length > 0 ? (
        <section className="pb-6">
          <p className="pb-3 font-mono text-label text-faint uppercase">
            Waiting on you
          </p>
          <Card>
            {incoming.map((friendship, index) => (
              <Fragment key={friendship.id}>
                {index > 0 ? <CardDivider /> : null}
                <IncomingRow
                  friendship={friendship}
                  accept={acceptRequestAction.bind(null, friendship.id)}
                  decline={removeFriendAction.bind(null, friendship.id)}
                />
              </Fragment>
            ))}
          </Card>
        </section>
      ) : null}

      <section className="pb-6">
        <p className="pb-3 font-mono text-label text-faint uppercase">Friends</p>

        {friends.length === 0 ? (
          <Card>
            <EmptyState
              title="Nobody yet"
              description="Add someone by their username above. You each choose what the other can see, separately — showing somebody your week is not a request to see theirs."
            />
          </Card>
        ) : (
          <Card>
            {friends.map((friendship, index) => (
              <Fragment key={friendship.id}>
                {index > 0 ? <CardDivider /> : null}
                <FriendRow
                  friendship={friendship}
                  setShare={setShareAction.bind(null, friendship.id)}
                  remove={removeFriendAction.bind(null, friendship.id)}
                />
              </Fragment>
            ))}
          </Card>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="pb-6">
          <p className="pb-3 font-mono text-label text-faint uppercase">Asked</p>
          <Card>
            {outgoing.map((friendship, index) => (
              <Fragment key={friendship.id}>
                {index > 0 ? <CardDivider /> : null}
                <OutgoingRow
                  friendship={friendship}
                  cancel={removeFriendAction.bind(null, friendship.id)}
                />
              </Fragment>
            ))}
          </Card>
        </section>
      ) : null}

      <p className="text-12 text-muted">
        Removing somebody deletes the friendship for both of you and keeps no record of
        it, so either of you can ask again later. Declining a request is the same thing:
        it simply stops appearing.
      </p>
    </>
  );
}
