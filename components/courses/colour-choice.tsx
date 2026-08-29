import { COURSE_COLOURS, courseDot, type CourseColour } from '@/lib/course-colours';

// The eight course colours, as eight radio buttons.
//
// Native radios, so the whole course form stays a plain <form> in a Server
// Component and works with no JavaScript at all — the same choice the syllabus
// rows made in slice 08. The input itself is hidden and the label is the
// target, which is what lets a 32px dot still be a 44px tap area on a phone.
//
// Presentational: it takes a name and a current value and knows nothing else.
// The hex values live in app/globals.css; `courseDot` hands back the CSS
// variable, never a colour (rule 7).

export function ColourChoice({
  name,
  value,
}: {
  name: string;
  /** The course's colour, when it has one of its own. */
  value: CourseColour;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {COURSE_COLOURS.map((colour) => (
        <label key={colour} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={colour}
            defaultChecked={colour === value}
            aria-label={colour}
            className="peer sr-only"
          />
          <span className="flex h-(--control-height) w-(--control-height) items-center justify-center rounded-full border border-border transition-colors duration-100 hover:bg-sunken peer-checked:border-ink peer-focus-visible:border-ink">
            <span
              style={{
                ...courseDot(colour),
                width: 'var(--check-size)',
                height: 'var(--check-size)',
              }}
            />
          </span>
        </label>
      ))}
    </div>
  );
}
