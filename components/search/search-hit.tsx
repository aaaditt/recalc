import Link from 'next/link';

import { Pill } from '@/components/ui/pill';

// One search result: the passage, where it came from, and a way in.
//
// Presentational only — no data fetching, no secrets, no formatting decisions
// that need a timezone. The page hands it strings.
//
// The passage is set in the note face rather than the UI face, because it is
// the one thing on this screen that the user wrote (docs/DESIGN.md: "Quiet
// chrome, warm content"). Everything around it is chrome and stays neutral.

export type SearchHitView = {
  blockId: string;
  /** The block's words, as they stand right now. Never a stored snapshot. */
  text: string;
  /** 'Lecture · 14 Oct', or the note's title. Built by the page. */
  where: string;
  href: string;
  /** Both halves of the hybrid found it. */
  strong: boolean;
};

export function SearchHit({ hit }: { hit: SearchHitView }) {
  return (
    <li>
      <Link
        href={hit.href}
        className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-100 hover:bg-sunken"
      >
        <p className="prose-note line-clamp-3 text-14 leading-6">{hit.text}</p>

        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-12 text-faint">{hit.where}</span>
          {hit.strong ? <Pill tone="ok">Words and meaning</Pill> : null}
        </div>
      </Link>
    </li>
  );
}
