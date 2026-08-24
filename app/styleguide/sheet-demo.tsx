'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

// Sheet is controlled, so showing it needs a little state. This is the only
// reason this file exists.
export function SheetDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Sheet">
        <div className="flex flex-col gap-3">
          <p className="text-14 text-muted">
            A bottom sheet under 640px, a side panel above it. Escape closes it, so does
            the backdrop.
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Sheet>
    </>
  );
}
