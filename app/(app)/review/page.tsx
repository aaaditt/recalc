import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Review · Recalc' };

// A placeholder that says so. Slice 11 builds the queue of stale derivations —
// the reason the app exists.
export default function ReviewPage() {
  return (
    <>
      <PageHeader title="Review" />
      <Card>
        <EmptyState
          title="Not built yet"
          description="This is where anything that went stale waits for you to accept or reject it. It needs derivations first — slice 11."
        />
      </Card>
    </>
  );
}
