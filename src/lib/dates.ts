// Calendar-date arithmetic with no time-of-day and no timezone.
// A date is just {year, month, day}; day counting uses UTC midnight purely as
// a calculator, so daylight-saving or the visitor's timezone can never shift a result.

export interface CalDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const DAY_MS = 86_400_000;

export function isValidDate(c: CalDate): boolean {
  if (!Number.isInteger(c.y) || !Number.isInteger(c.m) || !Number.isInteger(c.d)) return false;
  if (c.y < 1900 || c.y > 2200) return false;
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d));
  return t.getUTCFullYear() === c.y && t.getUTCMonth() === c.m - 1 && t.getUTCDate() === c.d;
}

/** Parses strict "YYYY-MM-DD" (what <input type="date"> produces). Null if not a real date. */
export function parseISODate(s: string): CalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return isValidDate(c) ? c : null;
}

export function toISO(c: CalDate): string {
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${p(c.y, 4)}-${p(c.m, 2)}-${p(c.d, 2)}`;
}

export function dayNumber(c: CalDate): number {
  return Math.round(Date.UTC(c.y, c.m - 1, c.d) / DAY_MS);
}

export function fromDayNumber(n: number): CalDate {
  const t = new Date(n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function addDays(c: CalDate, days: number): CalDate {
  return fromDayNumber(dayNumber(c) + days);
}

export function compareDates(a: CalDate, b: CalDate): number {
  return dayNumber(a) - dayNumber(b);
}

/** e.g. "Sat, 14 Mar 2026" in the visitor's language. */
export function formatDate(c: CalDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(c.y, c.m - 1, c.d)));
}

export type OffsetUnit = 'days' | 'weeks';
export type OffsetDirection = 'before' | 'after';

export interface Offset {
  from: number;
  /** Second end of a range such as "6-8 weeks". Omit for a single offset. */
  to?: number;
  unit: OffsetUnit;
  direction: OffsetDirection;
}

export interface DateWindow {
  /** Earliest calendar date. */
  start: CalDate;
  /** Latest calendar date (same as start for a single offset). */
  end: CalDate;
  isRange: boolean;
  /** Offsets in days, smallest first. */
  minDays: number;
  maxDays: number;
}

export function offsetProblem(o: Offset): string | null {
  for (const v of o.to === undefined ? [o.from] : [o.from, o.to]) {
    if (!Number.isFinite(v) || v < 0) return 'Offsets cannot be negative. Use the before/after choice instead.';
    if (!Number.isInteger(v)) {
      return o.unit === 'weeks' ? 'Use whole weeks, or switch the unit to days.' : 'Use whole days.';
    }
    if (v * (o.unit === 'weeks' ? 7 : 1) > 3660) return 'That offset is more than ten years. Check the number.';
  }
  return null;
}

/**
 * Apply an offset (or range) to a reference date. A reversed range such as
 * "8-6 weeks" gives the same window as "6-8 weeks"; start is always the earlier date.
 */
export function computeWindow(reference: CalDate, o: Offset): DateWindow {
  const perUnit = o.unit === 'weeks' ? 7 : 1;
  const a = o.from * perUnit;
  const b = (o.to ?? o.from) * perUnit;
  const minDays = Math.min(a, b);
  const maxDays = Math.max(a, b);
  const sign = o.direction === 'before' ? -1 : 1;
  const d1 = addDays(reference, sign * minDays);
  const d2 = addDays(reference, sign * maxDays);
  const [start, end] = compareDates(d1, d2) <= 0 ? [d1, d2] : [d2, d1];
  return { start, end, isRange: minDays !== maxDays, minDays, maxDays };
}

// ---- iCalendar export (RFC 5545, all-day events) ----

export interface CalendarEvent {
  title: string;
  description?: string;
  start: CalDate;
  /** Inclusive last day. */
  end: CalDate;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per line, never splitting a multi-byte character. */
function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const compact = (c: CalDate) => toISO(c).replace(/-/g, '');

/** `stamp` is a UTC timestamp like "20260101T120000Z"; `uidSeed` keeps UIDs unique per export. */
export function toICS(events: CalendarEvent[], stamp: string, uidSeed: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prunest//Seed Starting Calculator//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidSeed}-${i + 1}@prunest.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      // DTEND is exclusive for all-day events.
      `DTEND;VALUE=DATE:${compact(addDays(e.end, 1))}`,
      `SUMMARY:${icsEscape(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
