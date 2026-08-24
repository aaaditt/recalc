import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Calendar · Recalc' };

// A placeholder that says so. Slice 04 builds the week, day and month views.
export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" />
      <Card>
        <EmptyState
          title="Not built yet"
          description="Week, day and month views arrive in slice 04. Today already shows this morning's classes."
        />
      </Card>
    </>
  );
}
