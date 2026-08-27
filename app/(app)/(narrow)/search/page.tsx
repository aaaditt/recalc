import { indexAction } from './actions';
import { IndexButton } from '@/components/search/index-button';
import { SearchHit, type SearchHitView } from '@/components/search/search-hit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { colourForCourse, courseDot, type CourseColour } from '@/lib/course-colours';
import { createClient } from '@/lib/supabase/server';
import { localTimeZone } from '@/lib/time';
import { formatShortDate } from '@/lib/today';
import { getCourses } from '@/modules/courses';
import { countPendingEmbeddings, searchWorkspace } from '@/modules/search';
import { ensureWorkspace } from '@/modules/workspaces';

// One input.
//
// prompts/13-search.md is explicit: no filters, no facets, no settings page.
// A box, and results grouped by course so six hits across three subjects read
// as three short lists rather than one long one.
//
// The search itself is a GET with `?q=`, which means a Server Component renders
// the whole screen, a result is a link you can send yourself, and nothing here
// ships JavaScript except the one button that calls a model provider.
//
// What makes this screen different from every other search box is invisible
// from here and lives in migration 009: a result can never be computed from an
// embedding whose version is behind its block's. Editing a sentence makes the
// old wording unfindable in the same statement that saves the new one.

export const metadata = { title: 'Search · Recalc' };

type CourseLook = { code: string; name: string; colour: CourseColour };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspace = await ensureWorkspace(supabase, user.id);
  const zone = localTimeZone();
  const query = ((await searchParams).q ?? '').trim();

  const [courses, results, pending] = await Promise.all([
    getCourses(supabase, workspace.id),
    searchWorkspace(
      supabase,
      { workspaceId: workspace.id, userId: user.id },
      query,
      { timeZone: zone }
    ),
    countPendingEmbeddings(supabase, workspace.id),
  ]);

  // Courses come back ordered by code, so a course with no colour of its own
  // gets a stable one from the palette — the same answer /notes gives.
  const look = new Map<string, CourseLook>();
  courses.forEach((course, index) => {
    look.set(course.id, {
      code: course.code,
      name: course.name,
      colour: colourForCourse(course.colour, index),
    });
  });

  return (
    <>
      <PageHeader
        title="Search"
        subtitle={
          query === ''
            ? 'Everything you have written, by word and by meaning.'
            : results.total === 0
              ? `Nothing matches “${results.query}”.`
              : `${results.total} result${results.total === 1 ? '' : 's'} for “${results.query}”.`
        }
      />

      {/* A plain GET form: no JavaScript, and every search is a real URL. */}
      <form action="/search" className="flex items-center gap-2 pb-6">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          autoFocus
          autoComplete="off"
          aria-label="Search your notes"
          placeholder="A word, a phrase, or roughly what it was about"
        />
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>

      {query === '' ? (
        <Card>
          <EmptyState
            title="Type something"
            description="This searches the words you wrote and, once an embedding model is set up, what they meant. A passage you edited a minute ago is already findable in its new form — and unfindable in its old one."
          />
        </Card>
      ) : results.total === 0 ? (
        <Card>
          <EmptyState
            title="No results"
            description="Nothing in your notes matches that. Try fewer words, or a phrase you are surer you wrote."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {results.groups.map((group) => {
            const course = group.courseId ? look.get(group.courseId) : undefined;
            const hits: SearchHitView[] = group.hits.map((hit) => ({
              blockId: hit.blockId,
              text: hit.text,
              where: hit.date
                ? `${formatShortDate(hit.date)} · lecture note`
                : hit.note?.title || 'Untitled note',
              href: hit.note?.href ?? '/notes',
              strong: hit.matchedText && hit.matchedMeaning,
            }));

            return (
              <section key={group.courseId ?? 'none'}>
                <div className="flex items-center gap-2 pb-3">
                  {course ? <span style={courseDot(course.colour)} /> : null}
                  <span className="font-mono text-12 font-medium">{course?.code ?? '—'}</span>
                  <span className="min-w-0 truncate text-13 text-muted">
                    {course?.name ?? 'No course'}
                  </span>
                </div>

                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {hits.map((hit) => (
                      <SearchHit key={hit.blockId} hit={hit} />
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">Meaning</p>

        <Card>
          {results.semanticNote ? (
            <p className="px-4 pt-4 text-13 text-muted">{results.semanticNote}</p>
          ) : null}
          <IndexButton pending={pending} run={indexAction} />
        </Card>
      </section>
    </>
  );
}
