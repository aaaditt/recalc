'use client';

// The parts of your day, listed.
//
// Small screen, one job: see the shape of a week at a glance, open one to fill
// it in, and edit the frame of any of them. The 24-hour view is where a band is
// looked at; this is where it is administered.

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { BandSheet, type BandFormValues, type OpenBand } from '@/components/bands/band-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { bandRangeLabel, weekdaysLabel, type BandView } from '@/lib/bands';
import type { SaveResult } from '@/lib/timetable';

type BandListProps = {
  bands: BandView[];
  createBand: (values: BandFormValues) => Promise<SaveResult>;
  updateBand: (bandId: string, values: BandFormValues) => Promise<SaveResult>;
  removeBand: (bandId: string) => Promise<SaveResult>;
};

export function BandList({ bands, createBand, updateBand, removeBand }: BandListProps) {
  const [open, setOpen] = useState<OpenBand | null>(null);
  const [pending, startTransition] = useTransition();

  function edit(band: BandView) {
    setOpen({
      id: band.id,
      kind: band.kind,
      values: {
        name: band.name,
        startsAt: band.startsAt,
        endsAt: band.endsAt,
        weekdays: band.weekdays,
      },
    });
  }

  function save(values: BandFormValues): Promise<SaveResult> {
    const editing = open?.id ?? null;
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(editing ? await updateBand(editing, values) : await createBand(values));
      });
    });
  }

  function remove(): Promise<SaveResult> {
    const editing = open?.id;
    if (!editing) return Promise.resolve({ ok: true });
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(await removeBand(editing));
      });
    });
  }

  return (
    <>
      <div className="flex justify-end pb-4">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            setOpen({
              id: null,
              kind: 'custom',
              values: { name: '', startsAt: '18:00', endsAt: '21:00', weekdays: [] },
            })
          }
        >
          New band
        </Button>
      </div>

      {bands.length === 0 ? (
        <Card>
          <EmptyState
            title="Your day has no parts yet"
            description="A band is a stretch of the day that runs by its own rules — university, an evening, a weekend. Draw one on the 24-hour calendar, or make one here."
            action={
              <Link
                href="/calendar?v=full"
                className="text-13 text-muted underline underline-offset-4 hover:text-ink"
              >
                Open the 24-hour view
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {bands.map((band) => (
            <div key={band.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/bands/${band.id}`} className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-14 font-medium">{band.name}</span>
                  {band.kind === 'university' ? <Pill>Timetable</Pill> : null}
                </p>
                <p className="font-mono text-12 text-muted tabular-nums">
                  {bandRangeLabel(band)} · {weekdaysLabel(band.weekdays)}
                  {band.kind === 'university'
                    ? ' · your classes'
                    : ` · ${band.slots.length} ${band.slots.length === 1 ? 'slot' : 'slots'}`}
                </p>
              </Link>

              <Button disabled={pending} onClick={() => edit(band)}>
                Edit
              </Button>
            </div>
          ))}
        </Card>
      )}

      <BandSheet
        key={open ? (open.id ?? 'new') : 'closed'}
        open={open}
        busy={pending}
        onClose={() => setOpen(null)}
        onSave={save}
        onDelete={open?.id ? remove : undefined}
      />
    </>
  );
}
