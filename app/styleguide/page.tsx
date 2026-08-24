import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import {
  COURSE_COLOURS,
  courseDot,
  courseRail,
  courseTint,
  type CourseColour,
} from '@/lib/course-colours';

import { SheetDemo } from './sheet-demo';
import { ThemeToggle } from './theme-toggle';

// Every token and every primitive on one page. This is how the design system
// gets checked without building a screen, and how a later session sees what
// already exists instead of inventing a second version of it.
//
// Dev-only: it ships nothing to production. `npm run dev` also serves on the
// LAN, so the phone check works from the same wifi.
export const metadata = { title: 'Styleguide · Recalc' };

const NEUTRALS = [
  { token: '--bg', utility: 'bg-bg' },
  { token: '--surface', utility: 'bg-surface' },
  { token: '--sunken', utility: 'bg-sunken' },
  { token: '--border', utility: 'border-border' },
  { token: '--line', utility: 'border-line' },
  { token: '--text', utility: 'text-ink' },
  { token: '--text-muted', utility: 'text-muted' },
  { token: '--text-faint', utility: 'text-faint' },
  { token: '--accent', utility: 'text-accent' },
  { token: '--accent-bg', utility: 'bg-accent-bg' },
  { token: '--ok', utility: 'text-ok' },
  { token: '--ok-bg', utility: 'bg-ok-bg' },
] as const;

const TYPE_SCALE = [
  { utility: 'text-34', use: 'display' },
  { utility: 'text-26', use: 'page title' },
  { utility: 'text-20', use: 'section title' },
  { utility: 'text-16', use: 'body' },
  { utility: 'text-14', use: 'secondary' },
  { utility: 'text-13', use: 'UI label' },
  { utility: 'text-12', use: 'calendar grid — the floor' },
] as const;

// 4 · 8 · 12 · 16 · 24 · 32 · 48. `size-*` written out in full so Tailwind's
// scanner sees the class names.
const SPACING = [
  { step: '1', box: 'size-1' },
  { step: '2', box: 'size-2' },
  { step: '3', box: 'size-3' },
  { step: '4', box: 'size-4' },
  { step: '6', box: 'size-6' },
  { step: '8', box: 'size-8' },
  { step: '12', box: 'size-12' },
] as const;

// Eight fake courses so the colours are judged the way they will be used.
const SAMPLE_COURSES: { code: string; name: string; room: string; time: string }[] = [
  { code: 'ME301', name: 'Thermodynamics II', room: 'B2-14', time: '09:00' },
  { code: 'MA204', name: 'Linear Algebra', room: 'C1-07', time: '10:30' },
  { code: 'CS210', name: 'Data Structures', room: 'Lab 3', time: '12:00' },
  { code: 'PH150', name: 'Waves and Optics', room: 'A4-02', time: '13:30' },
  { code: 'EE220', name: 'Signals and Systems', room: 'B1-11', time: '15:00' },
  { code: 'ME240', name: 'Materials Science', room: 'Workshop', time: '16:30' },
  { code: 'HU110', name: 'Technical Writing', room: 'D2-05', time: '08:00' },
  { code: 'MA310', name: 'Probability', room: 'C3-09', time: '11:00' },
];

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-label text-faint uppercase">{children}</p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <Label>{title}</Label>
      {children}
    </section>
  );
}

/** What a class looks like in the calendar: rail, 8% tint, text in --text. */
function SampleClassBlock({
  colour,
  course,
}: {
  colour: CourseColour;
  course: (typeof SAMPLE_COURSES)[number];
}) {
  return (
    <div
      className="rounded-block p-2"
      style={{ ...courseTint(colour), ...courseRail(colour) }}
    >
      <p className="font-mono text-12 font-medium">{course.code}</p>
      <p className="text-12">{course.name}</p>
      <p className="text-12 text-muted">
        {course.room} · {course.time}
      </p>
    </div>
  );
}

/** The neutral swatches, rendered inside a forced theme so both show at once. */
function NeutralPanel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      data-theme={theme}
      className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4 text-ink"
    >
      <Label>{theme}</Label>
      <ul className="flex flex-col gap-2">
        {NEUTRALS.map(({ token, utility }) => (
          <li key={token} className="flex items-center gap-3">
            <span
              className="h-6 w-6 shrink-0 rounded-block border border-border"
              style={{ backgroundColor: `var(${token})` }}
            />
            <span className="font-mono text-12">{token}</span>
            <span className="ml-auto font-mono text-12 text-faint">{utility}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-8">
      <PageHeader
        title="Design system"
        subtitle="Slice 02. Every token and primitive the rest of the app is built from."
        actions={<ThemeToggle />}
      />

      <Section title="Type">
        <Card className="flex flex-col gap-4 p-4">
          {TYPE_SCALE.map(({ utility, use }) => (
            <div key={utility} className="flex items-baseline gap-4">
              <span className="w-20 shrink-0 font-mono text-12 text-faint">{utility}</span>
              <span className={utility}>Exam in 9 days</span>
              <span className="ml-auto hidden text-12 text-faint sm:block">{use}</span>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <Label>font-sans · Geist — chrome</Label>
            <p className="text-16">Thermodynamics II, Tuesday, room B2-14</p>
          </div>
          <CardDivider />
          <div className="flex flex-col gap-1">
            <Label>font-mono · Geist Mono — codes, times, labels</Label>
            <p className="font-mono text-14">ME301 · 09:00–10:30 · 90 min</p>
          </div>
          <CardDivider />
          <div className="flex flex-col gap-1">
            <Label>font-serif · Source Serif 4 — note content only</Label>
            <p className="prose-note text-16">
              The second law is a statement about the direction of time, not about heat.
            </p>
          </div>
          <CardDivider />
          <div className="flex flex-col gap-1">
            <Label>tabular figures — global</Label>
            <ul className="font-mono text-14">
              <li>09:00 · 1 111</li>
              <li>10:30 · 8 888</li>
              <li>16:45 · 3 070</li>
            </ul>
          </div>
        </Card>
      </Section>

      <Section title="Neutrals — both themes">
        <div className="grid gap-4 sm:grid-cols-2">
          <NeutralPanel theme="light" />
          <NeutralPanel theme="dark" />
        </div>
      </Section>

      <Section title="Course colours">
        <Card className="flex flex-col gap-3 p-4">
          {COURSE_COLOURS.map((colour) => (
            <div key={colour} className="flex items-center gap-3">
              <span className="w-16 shrink-0 font-mono text-12">{colour}</span>
              <span style={courseDot(colour)} />
              <span
                className="h-6 w-24 rounded-block"
                style={{ ...courseTint(colour), ...courseRail(colour) }}
              />
              <span className="ml-auto font-mono text-12 text-faint">
                rail · tint · dot
              </span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Class blocks — all eight">
        <div className="grid gap-2 sm:grid-cols-2">
          {COURSE_COLOURS.map((colour, index) => (
            <SampleClassBlock
              key={colour}
              colour={colour}
              course={SAMPLE_COURSES[index]}
            />
          ))}
        </div>
        <p className="text-13 text-muted">
          Six of these in a column should read as calm. If it looks like a fruit salad,
          the tint is too strong — it is 8%, and the text is never in the course colour.
        </p>
      </Section>

      <Section title="Buttons">
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </Card>
      </Section>

      <Section title="Form controls">
        <Card className="flex flex-col gap-4 p-4">
          <Field label="Title" hint="A hint sits under the control, in --text-muted.">
            <Input placeholder="Thermo problem set" />
          </Field>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Due date" className="flex-1">
              <Input type="date" defaultValue="2026-10-14" />
            </Field>
            <Field label="Due time" className="flex-1">
              <Input type="time" defaultValue="17:00" />
            </Field>
          </div>

          <Field label="Course">
            <Select defaultValue="ME301">
              <option value="ME301">ME301 · Thermodynamics II</option>
              <option value="MA204">MA204 · Linear Algebra</option>
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea placeholder="Anything you would otherwise forget by Thursday." />
          </Field>

          <Field label="Disabled">
            <Input disabled defaultValue="Not editable" />
          </Field>

          <p className="text-13 text-muted">
            Same height, radius and hairline as a Button, so a form and its submit button
            line up. On a touch screen they all grow to 44px together.
          </p>
        </Card>
      </Section>

      <Section title="Pills">
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Pill>Unit 3</Pill>
          <Pill tone="accent">Stale</Pill>
          <Pill tone="ok">Fresh</Pill>
        </Card>
      </Section>

      <Section title="Card">
        <Card className="flex flex-col">
          <div className="p-4">
            <p className="text-16 font-medium">Notes</p>
            <p className="text-14 text-muted">Surface, hairline border, 6px radius.</p>
          </div>
          <CardDivider />
          <div className="p-4 text-14 text-muted">
            Rows inside a card are split by --line, not --border.
          </div>
        </Card>
      </Section>

      <Section title="Sheet">
        <Card className="p-4">
          <SheetDemo />
        </Card>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState
            title="No classes today"
            description="Saturday. Nothing scheduled, and nothing due."
            action={<Button variant="secondary">Add something</Button>}
          />
        </Card>
      </Section>

      <Section title="Page header">
        <Card className="p-4">
          <PageHeader
            title="Thermodynamics II"
            subtitle="Tuesday 14 October · 09:00 · B2-14"
            actions={<Button variant="secondary">Edit</Button>}
          />
        </Card>
      </Section>

      <Section title="Spacing — 4px scale">
        <Card className="flex flex-wrap items-end gap-4 p-4">
          {SPACING.map(({ step, box }) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <span className={`${box} bg-sunken`} />
              <span className="font-mono text-12 text-faint">{step}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Radii and shadow">
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-block bg-sunken" />
            <span className="font-mono text-12 text-faint">rounded-block</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-card bg-sunken" />
            <span className="font-mono text-12 text-faint">rounded-card</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-sheet bg-sunken" />
            <span className="font-mono text-12 text-faint">rounded-sheet</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-full bg-sunken" />
            <span className="font-mono text-12 text-faint">rounded-full</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-card bg-surface shadow-float" />
            <span className="font-mono text-12 text-faint">shadow-float</span>
          </div>
        </Card>
      </Section>
    </main>
  );
}
