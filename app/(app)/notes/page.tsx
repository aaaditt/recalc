import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Notes · Recalc' };

// A placeholder that says so. Slice 05 builds the editor and lecture pages.
export default function NotesPage() {
  return (
    <>
      <PageHeader title="Notes" />
      <Card>
        <EmptyState
          title="Not built yet"
          description="Notes hang off a lecture, so they arrive with the lecture pages in slice 05."
        />
      </Card>
    </>
  );
}
