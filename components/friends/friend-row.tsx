import Link from 'next/link';

import { CardDivider } from '@/components/ui/card';
import { cx } from '@/lib/cx';
import { SHARE_LEVELS, type Friendship } from '@/modules/friends';

// One person, and the one decision you make about them.
//
// Presentational: a friendship and three bound actions in, no data fetching, no
// knowledge of which side of the row this account is on — `my_friendships()`
// already answered that, and the fields are named from the reader's point of
// view (`i_share`, `they_share`) precisely so that a component cannot read the
// wrong side.
//
// docs/DESIGN.md's neutrals throughout. No accent: a friend request is not an
// alarm, and neither is somebody choosing to show you less.
//
// The sharing control is three submit buttons in one form rather than a select
// with a save button. It is one press instead of two, it needs no JavaScript,
// and — the reason that matters here — the thing you are choosing is always
// visible rather than folded into a closed dropdown. What you are showing
// another person should not take a click to read.

/** What one person is called, with their username under it. */
function Name({ friendship }: { friendship: Friendship }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-14 font-medium">
        {friendship.other_display_name ?? `@${friendship.other_username}`}
      </p>
      {friendship.other_display_name ? (
        <p className="truncate font-mono text-12 text-muted">
          @{friendship.other_username}
        </p>
      ) : null}
    </div>
  );
}

/** A quiet, destructive-ish action. Used for decline, cancel and unfriend. */
function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="shrink-0 text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * An accepted friend: their name, what you show them, and what they show you.
 *
 * Both directions are on screen at once and they are visibly separate things.
 * The second is stated rather than offered, because it is not yours to change —
 * and the app should say what somebody else decided rather than leave you to
 * infer it from an empty timetable later.
 */
export function FriendRow({
  friendship,
  setShare,
  remove,
}: {
  friendship: Friendship;
  /** Bound to this friendship's id. Writes only your own column. */
  setShare: (formData: FormData) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const theirs = SHARE_LEVELS.find((level) => level.value === friendship.they_share);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <Name friendship={friendship} />

        {/* Slice 23. Only when there is something to see: at `none` this would
            go to a screen that exists to say "nothing to compare", and offering
            it would read as the app not knowing what it just told you. */}
        {friendship.they_share === 'none' ? null : (
          <Link
            href={`/friends/${friendship.other_username}`}
            className="shrink-0 text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
          >
            Compare
          </Link>
        )}

        <form action={remove}>
          <Quiet>Remove</Quiet>
        </form>
      </div>

      <form action={setShare} className="pt-3">
        <p className="pb-2 font-mono text-label text-faint uppercase">You show them</p>
        <div className="flex flex-wrap gap-2">
          {SHARE_LEVELS.map((level) => {
            const chosen = level.value === friendship.i_share;
            return (
              <button
                key={level.value}
                type="submit"
                name="level"
                value={level.value}
                aria-pressed={chosen}
                title={level.detail}
                className={cx(
                  'h-(--control-height) rounded-card border px-(--control-padding-x) text-13 transition-colors duration-100',
                  chosen
                    ? 'border-ink bg-ink text-bg'
                    : 'border-border bg-surface text-muted hover:bg-sunken hover:text-ink'
                )}
              >
                {level.label}
              </button>
            );
          })}
        </div>
        <p className="pt-2 text-12 text-muted">
          {SHARE_LEVELS.find((level) => level.value === friendship.i_share)?.detail}
        </p>
      </form>

      <p className="pt-3 text-12 text-muted">
        {/* Theirs, stated. Not a control — this is their decision, and the two
            are independent on purpose. */}
        They show you:{' '}
        <span className="text-ink">{theirs?.label.toLowerCase() ?? 'nothing'}</span>.
      </p>
    </div>
  );
}

/** Somebody who has asked you. The only row on this screen with a real choice. */
export function IncomingRow({
  friendship,
  accept,
  decline,
}: {
  friendship: Friendship;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Name friendship={friendship} />

      <div className="flex shrink-0 items-center gap-3">
        <form action={accept}>
          <button
            type="submit"
            className="h-(--control-height) rounded-card bg-ink px-(--control-padding-x) text-14 font-medium text-bg transition-opacity duration-100 hover:opacity-90"
          >
            Accept
          </button>
        </form>
        <form action={decline}>
          <Quiet>Decline</Quiet>
        </form>
      </div>
    </div>
  );
}

/** Somebody you have asked. Nothing to do but wait, or think better of it. */
export function OutgoingRow({
  friendship,
  cancel,
}: {
  friendship: Friendship;
  cancel: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Name friendship={friendship} />
      <span className="shrink-0 font-mono text-label text-faint uppercase">Asked</span>
      <form action={cancel}>
        <Quiet>Cancel</Quiet>
      </form>
    </div>
  );
}

/** The 1px rule between rows, so a page can lay these out without knowing sizes. */
export { CardDivider };
