import { describe, it, expect } from 'vitest';

import {
  bandAt,
  bandLine,
  bandRangeLabel,
  bandsOn,
  bandSpan,
  bandSummary,
  clockAt,
  clockMinutes,
  DAY_MINUTES,
  durationLabel,
  fillOfBand,
  FULL_DAY,
  hoursOfBand,
  insideBand,
  minuteAt,
  slotsOn,
  snapMinute,
  tickMarks,
  weekdaysLabel,
  type BandView,
} from '@/lib/bands';

// The arithmetic of the 24-hour view, with no database and no browser.
//
// 2026-09-08 is a Tuesday (weekday 2). Its neighbours are used throughout:
// 2026-09-07 is Monday, 2026-09-12 is Saturday.

const TUESDAY = '2026-09-08';
const MONDAY = '2026-09-07';
const SATURDAY = '2026-09-12';

function band(over: Partial<BandView> = {}): BandView {
  return {
    id: 'university',
    name: 'University',
    kind: 'university',
    startsAt: '07:30:00',
    endsAt: '15:40:00',
    weekdays: [1, 2, 3, 4, 5],
    slots: [],
    ...over,
  };
}

describe('the full day is never cropped', () => {
  it('runs midnight to midnight', () => {
    expect(FULL_DAY).toEqual({ startHour: 0, endHour: 24 });
    expect(DAY_MINUTES).toBe(1440);
  });
});

describe('clock arithmetic', () => {
  it('reads HH:MM and HH:MM:SS the same way', () => {
    expect(clockMinutes('07:30')).toBe(450);
    expect(clockMinutes('07:30:00')).toBe(450);
    expect(clockMinutes('00:00')).toBe(0);
    expect(clockMinutes('23:59')).toBe(1439);
  });

  it('writes minutes back as a zero-padded clock', () => {
    expect(clockAt(450)).toBe('07:30');
    expect(clockAt(0)).toBe('00:00');
    expect(clockAt(605)).toBe('10:05');
  });

  it('round-trips', () => {
    for (const time of ['00:00', '07:30', '12:05', '15:40', '23:55']) {
      expect(clockAt(clockMinutes(time))).toBe(time);
    }
  });

  it('clamps rather than wrapping past midnight', () => {
    expect(clockAt(-30)).toBe('00:00');
    expect(clockAt(2000)).toBe('00:00'); // 24:00 is the end of the day, not 08:00 tomorrow
  });
});

describe('drag-to-create', () => {
  it('snaps to five minutes', () => {
    expect(snapMinute(452)).toBe(450);
    expect(snapMinute(453)).toBe(455);
    expect(snapMinute(0)).toBe(0);
  });

  it('never snaps outside the day', () => {
    expect(snapMinute(-10)).toBe(0);
    expect(snapMinute(1_000_000)).toBe(DAY_MINUTES);
  });

  it('turns a pointer offset into a minute', () => {
    expect(minuteAt(0, 864)).toBe(0);
    expect(minuteAt(432, 864)).toBe(720); // halfway down is noon
    expect(minuteAt(864, 864)).toBe(DAY_MINUTES);
  });

  it('clamps a pointer that left the grid, and survives a zero-height one', () => {
    expect(minuteAt(-50, 864)).toBe(0);
    expect(minuteAt(9999, 864)).toBe(DAY_MINUTES);
    expect(minuteAt(10, 0)).toBe(0);
  });
});

describe('which bands run today', () => {
  const evening = band({
    id: 'evening',
    name: 'Evening',
    kind: 'custom',
    startsAt: '16:00:00',
    endsAt: '23:00:00',
    weekdays: [1, 3, 5],
  });

  it('keeps the bands that run on that weekday', () => {
    expect(bandsOn([band(), evening], TUESDAY).map((one) => one.id)).toEqual(['university']);
    expect(bandsOn([band(), evening], MONDAY).map((one) => one.id)).toEqual([
      'university',
      'evening',
    ]);
  });

  it('drops everything on a day nothing runs', () => {
    expect(bandsOn([band(), evening], SATURDAY)).toEqual([]);
  });

  it('measures a band in minutes after midnight', () => {
    expect(bandSpan(band())).toEqual({ startMinute: 450, endMinute: 940 });
  });
});

describe('which band am I in', () => {
  const bands = [
    band(),
    band({
      id: 'evening',
      name: 'Evening',
      kind: 'custom',
      startsAt: '16:00:00',
      endsAt: '23:00:00',
      weekdays: [1, 2, 3, 4, 5],
    }),
  ];

  it('finds the band covering a minute', () => {
    expect(bandAt(bands, TUESDAY, clockMinutes('10:15'))?.id).toBe('university');
    expect(bandAt(bands, TUESDAY, clockMinutes('18:00'))?.id).toBe('evening');
  });

  it('includes the first minute and excludes the last', () => {
    expect(bandAt(bands, TUESDAY, clockMinutes('07:30'))?.id).toBe('university');
    expect(bandAt(bands, TUESDAY, clockMinutes('15:40'))).toBeNull();
  });

  it('answers null in the gap, at night, and on a day nothing runs', () => {
    expect(bandAt(bands, TUESDAY, clockMinutes('15:50'))).toBeNull();
    expect(bandAt(bands, TUESDAY, clockMinutes('03:00'))).toBeNull();
    expect(bandAt(bands, SATURDAY, clockMinutes('10:15'))).toBeNull();
  });
});

describe("a band's own slots", () => {
  const evening = band({
    id: 'evening',
    kind: 'custom',
    startsAt: '16:00:00',
    endsAt: '23:00:00',
    weekdays: [1, 2],
    slots: [
      { id: 'b', label: 'Study', weekday: 2, startsAt: '20:00:00', endsAt: '21:30:00', courseId: 'c1', code: 'ME301', colour: 'indigo' },
      { id: 'a', label: 'Gym', weekday: 2, startsAt: '18:00:00', endsAt: '19:00:00', courseId: null, code: null, colour: null },
      { id: 'c', label: 'Gym', weekday: 1, startsAt: '18:00:00', endsAt: '19:00:00', courseId: null, code: null, colour: null },
    ],
  });

  it('returns only that weekday, earliest first', () => {
    expect(slotsOn(evening, TUESDAY).map((slot) => slot.id)).toEqual(['a', 'b']);
    expect(slotsOn(evening, MONDAY).map((slot) => slot.id)).toEqual(['c']);
  });

  it('is empty on a day the band does not run', () => {
    expect(slotsOn(evening, SATURDAY)).toEqual([]);
  });
});

describe('what is inside a band', () => {
  const university = band();

  it('clips an occupant to the band edges', () => {
    expect(
      insideBand(university, [{ startMinute: clockMinutes('07:00'), endMinute: clockMinutes('08:00') }])
    ).toEqual([{ startMinute: 450, endMinute: 480 }]);
  });

  it('drops what only touches the edge', () => {
    expect(
      insideBand(university, [
        { startMinute: clockMinutes('06:00'), endMinute: clockMinutes('07:30') },
        { startMinute: clockMinutes('15:40'), endMinute: clockMinutes('16:30') },
      ])
    ).toEqual([]);
  });

  it('counts free time, and merges overlaps before it does', () => {
    // Two 50-minute classes at the same hour is one busy hour, not two.
    const fill = fillOfBand(university, [
      { startMinute: clockMinutes('09:20'), endMinute: clockMinutes('10:10') },
      { startMinute: clockMinutes('09:20'), endMinute: clockMinutes('10:10') },
    ]);
    expect(fill.count).toBe(2);
    expect(fill.freeMinutes).toBe(490 - 50);
  });

  it('adds up separate runs', () => {
    const fill = fillOfBand(university, [
      { startMinute: clockMinutes('07:30'), endMinute: clockMinutes('08:20') },
      { startMinute: clockMinutes('13:00'), endMinute: clockMinutes('13:50') },
    ]);
    expect(fill.count).toBe(2);
    expect(fill.freeMinutes).toBe(490 - 100);
    expect(fill.lastEndsAt).toBe('13:50');
  });

  it('says an empty band is entirely free', () => {
    expect(fillOfBand(university, [])).toEqual({
      count: 0,
      freeMinutes: 490,
      lastEndsAt: null,
    });
  });
});

describe('what a band says', () => {
  it('names an empty band plainly rather than as an error', () => {
    expect(bandSummary(band(), fillOfBand(band(), []))).toBe('Nothing planned');
  });

  it('counts classes for university and slots for everything else', () => {
    const one = [{ startMinute: clockMinutes('09:20'), endMinute: clockMinutes('10:10') }];
    expect(bandSummary(band(), fillOfBand(band(), one))).toBe('1 class · 7h 20m free');

    const evening = band({ kind: 'custom', startsAt: '18:00:00', endsAt: '19:00:00' });
    const full = [{ startMinute: clockMinutes('18:00'), endMinute: clockMinutes('19:00') }];
    expect(bandSummary(evening, fillOfBand(evening, full))).toBe('1 slot');
  });

  it('pluralises', () => {
    const two = [
      { startMinute: clockMinutes('07:30'), endMinute: clockMinutes('08:20') },
      { startMinute: clockMinutes('13:00'), endMinute: clockMinutes('13:50') },
    ];
    expect(bandSummary(band(), fillOfBand(band(), two))).toBe('2 classes · 6h 30m free');
  });

  it('writes durations as durations', () => {
    expect(durationLabel(45)).toBe('45m');
    expect(durationLabel(60)).toBe('1h');
    expect(durationLabel(80)).toBe('1h 20m');
  });
});

describe('the tick rail', () => {
  it('places a mark as a percentage of the band', () => {
    const [tick] = tickMarks(band(), [
      { key: 'a', startMinute: clockMinutes('07:30'), endMinute: clockMinutes('08:20') },
    ]);
    expect(tick.leftPercent).toBe(0);
    expect(tick.widthPercent).toBeCloseTo((50 / 490) * 100, 5);
  });

  it('never draws a mark too thin to see', () => {
    const [tick] = tickMarks(band(), [
      { key: 'a', startMinute: clockMinutes('09:00'), endMinute: clockMinutes('09:01') },
    ]);
    expect(tick.widthPercent).toBe(1);
  });

  it('ignores what falls outside the band', () => {
    expect(
      tickMarks(band(), [
        { key: 'a', startMinute: clockMinutes('18:00'), endMinute: clockMinutes('19:00') },
      ])
    ).toEqual([]);
  });
});

describe('the zoomed view', () => {
  it('rounds a band out to whole hours so the labels sit on the lines', () => {
    expect(hoursOfBand(band())).toEqual({ startHour: 7, endHour: 16 });
  });

  it('never collapses to nothing', () => {
    const sliver = band({ startsAt: '09:10:00', endsAt: '09:20:00' });
    expect(hoursOfBand(sliver)).toEqual({ startHour: 9, endHour: 10 });
  });

  it('labels the range without seconds', () => {
    expect(bandRangeLabel(band())).toBe('07:30–15:40');
  });
});

describe('naming the days a band runs', () => {
  it('collapses a Monday-first run into a range', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(weekdaysLabel([2, 3, 4])).toBe('Tue–Thu');
  });

  it('lists days that are not consecutive', () => {
    expect(weekdaysLabel([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(weekdaysLabel([2])).toBe('Tue');
  });

  it('does not collapse a run that wraps through Sunday', () => {
    expect(weekdaysLabel([0, 1, 2])).toBe('Sun, Mon, Tue');
  });

  it('names the whole week', () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('every day');
  });
});

describe('the line on /today', () => {
  const university = band();
  const evening = band({
    id: 'evening',
    name: 'Evening',
    kind: 'custom',
    startsAt: '18:00:00',
    endsAt: '23:00:00',
    weekdays: [1, 2, 3, 4, 5],
  });
  const bands = [university, evening];

  const classes = [
    { label: 'ME301', startMinute: clockMinutes('09:20'), endMinute: clockMinutes('10:10') },
    { label: 'MP&I', startMinute: clockMinutes('13:00'), endMinute: clockMinutes('13:50') },
  ];

  it('says which band you are in, until when, and what is next inside it', () => {
    const line = bandLine(bands, TUESDAY, clockMinutes('08:00'), classes);
    expect(line).toEqual({
      name: 'University',
      untilAt: '15:40',
      nextInside: { label: 'ME301', at: '09:20' },
      nextBand: { name: 'Evening', at: '18:00' },
    });
  });

  it('stops naming a class once it has started', () => {
    const line = bandLine(bands, TUESDAY, clockMinutes('09:30'), classes);
    expect(line?.nextInside).toEqual({ label: 'MP&I', at: '13:00' });
  });

  it('has nothing left to name at the end of the band', () => {
    const line = bandLine(bands, TUESDAY, clockMinutes('14:00'), classes);
    expect(line?.nextInside).toBeNull();
    expect(line?.nextBand).toEqual({ name: 'Evening', at: '18:00' });
  });

  it('has no band after the last one', () => {
    const line = bandLine(bands, TUESDAY, clockMinutes('20:00'), classes);
    expect(line?.name).toBe('Evening');
    expect(line?.nextBand).toBeNull();
  });

  // The design, not a missing case: an evening nobody has planned should not be
  // announced as one.
  it('says nothing at all in the gap between bands', () => {
    expect(bandLine(bands, TUESDAY, clockMinutes('16:30'), classes)).toBeNull();
  });

  it('says nothing on a day no band runs', () => {
    expect(bandLine(bands, SATURDAY, clockMinutes('10:00'), classes)).toBeNull();
  });
});
