import { describe, expect, it } from 'vitest';
import { addDays, computeWindow, offsetProblem, parseISODate, toICS, toISO } from '../src/lib/dates';

const d = (s: string) => parseISODate(s)!;
const win = (ref: string, o: Parameters<typeof computeWindow>[1]) => {
  const w = computeWindow(d(ref), o);
  return [toISO(w.start), toISO(w.end)];
};

describe('parsing', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(parseISODate('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 });
    expect(parseISODate('2027-02-29')).toBeNull();
    expect(parseISODate('2100-02-29')).toBeNull(); // 2100 is not a leap year
    expect(parseISODate('2000-02-29')).not.toBeNull();
    expect(parseISODate('2027-04-31')).toBeNull();
    expect(parseISODate('2027-13-01')).toBeNull();
    expect(parseISODate('')).toBeNull();
    expect(parseISODate('10/05/2027')).toBeNull();
  });
});

describe('offsets', () => {
  it('worked example: 6-8 weeks before 10 May 2027 is 15-29 March 2027', () => {
    expect(win('2027-05-10', { from: 6, to: 8, unit: 'weeks', direction: 'before' })).toEqual(['2027-03-15', '2027-03-29']);
  });
  it('single offsets before and after', () => {
    expect(win('2027-05-10', { from: 2, unit: 'weeks', direction: 'after' })).toEqual(['2027-05-24', '2027-05-24']);
    expect(win('2027-05-10', { from: 10, unit: 'days', direction: 'after' })).toEqual(['2027-05-20', '2027-05-20']);
    expect(win('2027-05-10', { from: 0, unit: 'weeks', direction: 'before' })).toEqual(['2027-05-10', '2027-05-10']);
  });
  it('reversed range gives the same window, earliest first', () => {
    const a = win('2027-05-10', { from: 8, to: 6, unit: 'weeks', direction: 'before' });
    expect(a).toEqual(['2027-03-15', '2027-03-29']);
    expect(win('2027-05-10', { from: 3, to: 1, unit: 'weeks', direction: 'after' })).toEqual(['2027-05-17', '2027-05-31']);
    expect(computeWindow(d('2027-05-10'), { from: 6, to: 6, unit: 'weeks', direction: 'before' }).isRange).toBe(false);
  });
  it('crosses a year boundary in both directions', () => {
    expect(win('2027-01-10', { from: 3, unit: 'weeks', direction: 'before' })).toEqual(['2026-12-20', '2026-12-20']);
    expect(win('2026-12-20', { from: 2, to: 4, unit: 'weeks', direction: 'after' })).toEqual(['2027-01-03', '2027-01-17']);
  });
  it('handles leap days', () => {
    expect(toISO(addDays(d('2028-03-01'), -1))).toBe('2028-02-29');
    expect(toISO(addDays(d('2027-03-01'), -1))).toBe('2027-02-28');
    expect(toISO(addDays(d('2028-02-28'), 2))).toBe('2028-03-01');
    // 8 weeks before 15 April 2028 crosses 29 Feb: 56 days back is 19 Feb
    expect(win('2028-04-15', { from: 8, unit: 'weeks', direction: 'before' })[0]).toBe('2028-02-19');
    expect(win('2027-04-15', { from: 8, unit: 'weeks', direction: 'before' })[0]).toBe('2027-02-18');
    expect(win('2028-02-29', { from: 52, unit: 'weeks', direction: 'after' })[0]).toBe('2029-02-27');
  });
  it('is not affected by daylight-saving changes (US and UK spring/autumn switches)', () => {
    expect(toISO(addDays(d('2027-03-13'), 1))).toBe('2027-03-14');
    expect(toISO(addDays(d('2027-03-14'), 1))).toBe('2027-03-15');
    expect(toISO(addDays(d('2027-10-31'), 1))).toBe('2027-11-01');
    expect(toISO(addDays(d('2027-11-07'), -7))).toBe('2027-10-31');
  });
  it('rejects fractional, negative and absurd offsets', () => {
    expect(offsetProblem({ from: 1.5, unit: 'weeks', direction: 'before' })).toMatch(/whole weeks/);
    expect(offsetProblem({ from: 2, to: 2.5, unit: 'days', direction: 'before' })).toMatch(/whole days/);
    expect(offsetProblem({ from: -1, unit: 'days', direction: 'before' })).toMatch(/negative/);
    expect(offsetProblem({ from: 9999, unit: 'weeks', direction: 'before' })).toMatch(/ten years/);
    expect(offsetProblem({ from: 6, to: 8, unit: 'weeks', direction: 'before' })).toBeNull();
  });
});

describe('calendar export', () => {
  const ics = toICS(
    [{ title: 'Sow indoors: Tomatoes, cherry; early', description: 'Line one\nLine two', start: d('2027-03-15'), end: d('2027-03-29') }],
    '20270101T120000Z',
    'test',
  );
  it('writes all-day events with an exclusive end date', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270315\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270330\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:test-1@prunest.com');
  });
  it('escapes text and keeps lines within 75 octets', () => {
    expect(ics).toContain('SUMMARY:Sow indoors: Tomatoes\\, cherry\; early');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    const long = toICS([{ title: 'é'.repeat(120), start: d('2027-12-31'), end: d('2027-12-31') }], '20270101T120000Z', 'x');
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(long).toContain('DTEND;VALUE=DATE:20280101');
  });
});

import { successions } from '../src/lib/dates';

describe('succession sowings', () => {
  it('4 sowings every 14 days from 20 Apr 2027', () => {
    const w = computeWindow(d('2027-05-10'), { from: 20, unit: 'days', direction: 'before' });
    expect(successions(w, 14, 4).map((x) => toISO(x.start))).toEqual(['2027-04-20', '2027-05-04', '2027-05-18', '2027-06-01']);
  });
  it('shifts both ends of a window and crosses the year end', () => {
    const w = computeWindow(d('2027-12-20'), { from: 0, to: 1, unit: 'weeks', direction: 'after' });
    const s = successions(w, 21, 2);
    expect([toISO(s[1]!.start), toISO(s[1]!.end)]).toEqual(['2028-01-10', '2028-01-17']);
    expect(successions(w, 7, 1)).toHaveLength(1);
  });
});
