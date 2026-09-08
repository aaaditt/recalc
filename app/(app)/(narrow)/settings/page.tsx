import Link from 'next/link';

import { Card, CardDivider } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { currentWorkspace } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/modules/profiles';

// Settings — slice 24, and it is later than it should have been.
//
// `/settings` was a 404 until this file existed. The five screens under it were
// each built by the slice that needed them and each linked to two or three of
// the others from its own header, so the set was navigable only if you already
// knew where you were going. Nothing pointed at it from the app at all.
//
// It is a list of links and nothing else on purpose. Every setting on it belongs
// to the screen that owns it, and a page that duplicated any of them here would
// be a second place for that setting to be wrong.

export const metadata = { title: 'Settings · Recalc' };

type Entry = { href: string; title: string; detail: string };

const ENTRIES: Entry[] = [
  {
    href: '/settings/account',
    title: 'Account',
    detail: 'Your name, your password, and the way out.',
  },
  {
    href: '/settings/agents',
    title: 'AI models',
    detail: 'Your own key, your own provider. Summaries and answers need one.',
  },
  {
    href: '/settings/semester',
    title: 'Semester',
    detail: 'Turn the weekly timetable into this term’s lectures.',
  },
  {
    href: '/friends',
    title: 'Friends',
    detail: 'Add somebody by username, and choose what each of them can see.',
  },
  {
    href: '/settings/drive',
    title: 'Google Drive',
    detail: 'Attach files you pick to a lecture. Optional, for ever.',
  },
  {
    href: '/settings/email',
    title: 'Email',
    detail: 'Read deadlines out of your mail into a queue you approve.',
  },
  {
    href: '/start',
    title: 'Set up',
    detail: 'The guided path, if you want to walk it again.',
  },
];

export default async function SettingsPage() {
  const found = await currentWorkspace();
  if (!found) return null;

  const profile = await getProfile(await createClient(), found.user.id);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={profile ? `Signed in as @${profile.username}` : undefined}
      />

      <Card>
        {ENTRIES.map((entry, index) => (
          <div key={entry.href}>
            {index > 0 ? <CardDivider /> : null}
            <Link
              href={entry.href}
              className={[
                'group flex items-center gap-3 px-4 py-3',
                'transition-[background-color,translate] duration-(--duration-tap)',
                'hover:bg-sunken active:translate-y-(--press-shift)',
                'focus-visible:outline-(length:--focus-ring-width) focus-visible:-outline-offset-2 focus-visible:outline-accent',
              ].join(' ')}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-14 font-medium">{entry.title}</span>
                <span className="block text-12 text-muted">{entry.detail}</span>
              </span>
              {/* A chevron, not a text arrow: this is a row affordance saying
                  "there is more through here", not a sentence with an arrow
                  stuck on the end of it. */}
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-faint transition-colors duration-(--duration-tap) group-hover:text-muted"
              >
                <path d="M8 4.5 13.5 10 8 15.5" />
              </svg>
            </Link>
          </div>
        ))}
      </Card>

      <p className="pt-4 text-12 text-muted">
        Recalc renders every screen with an empty semester and no keys at all. Nothing
        on this page is required to use it.
      </p>
    </>
  );
}
