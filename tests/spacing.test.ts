import { describe, expect, it } from 'vitest';
import { axisPositions, calculateSpacing, layoutAxis } from '../src/lib/spacing';
import { toSI } from '../src/lib/units';

const ft = (n: number) => toSI(n, 'ft');
const inch = (n: number) => toSI(n, 'in');
const base = { length: ft(8), width: ft(4), inRow: inch(12), betweenRows: inch(18), clearance: inch(6), direction: 'along-length' as const, centre: false };

describe('worked example on the spacing page', () => {
  it('8 ft x 4 ft, 12 in / 18 in, 6 in clearance, rows along length: 3 rows of 8 = 24', () => {
    const r = calculateSpacing(base);
    // length: 96 - 12 = 84 in usable, 84/12 = 7 steps -> 8 plants
    // width: 48 - 12 = 36 in usable, 36/18 = 2 steps -> 3 rows
    expect([r.rows, r.perRow, r.total]).toEqual([3, 8, 24]);
    expect(axisPositions(r.rowAxis).map((m) => Math.round(m / 0.0254))).toEqual([6, 24, 42]);
    expect(r.plantAxis.first).toBeCloseTo(inch(6), 12);
    expect(r.plantAxis.last).toBeCloseTo(inch(90), 12);
    expect(r.plantAxis.leftover).toBeCloseTo(0, 9);
  });
  it('rows across the width: 5 rows of 4 = 20', () => {
    const r = calculateSpacing({ ...base, direction: 'along-width' });
    // width: 36 in usable / 12 = 3 steps -> 4 plants; length: 84 / 18 = 4.67 -> 4 steps -> 5 rows
    expect([r.rows, r.perRow, r.total]).toEqual([5, 4, 20]);
    expect(r.rowAxis.leftover).toBeCloseTo(inch(12), 9);
  });
});

describe('centre-to-centre counting', () => {
  it('counts positions along each side, not area / spacing', () => {
    // 100 cm x 100 cm at 30 cm both ways, no clearance: 0,30,60,90 -> 4 x 4 = 16 (area division would give 11.1)
    const r = calculateSpacing({ length: 1, width: 1, inRow: 0.3, betweenRows: 0.3, clearance: 0, direction: 'along-length', centre: false });
    expect(r.total).toBe(16);
  });
  it('exact fit includes the last position (float-safe)', () => {
    expect(layoutAxis(0.9, 0.3, 0, false).count).toBe(4); // 0.9/0.3 = 3.0000000000000004 or 2.9999999999999996
    expect(layoutAxis(0.3, 0.1, 0, false).count).toBe(4);
    expect(layoutAxis(ft(4), inch(12), 0, false).count).toBe(5);
    expect(layoutAxis(ft(4), inch(6), inch(6), false).count).toBe(7);
  });
  it('just short of a fit drops the last position', () => {
    expect(layoutAxis(0.899, 0.3, 0, false).count).toBe(3);
    expect(layoutAxis(inch(47.9), inch(12), 0, false).count).toBe(4);
  });
  it('spacing larger than the bed still gives one position', () => {
    const a = layoutAxis(0.5, 2, 0.1, false);
    expect(a.count).toBe(1);
    expect(a.first).toBeCloseTo(0.1, 12);
  });
});

describe('edge clearance', () => {
  it('clearance of exactly half the bed leaves a single centre line', () => {
    const a = layoutAxis(inch(12), inch(6), inch(6), false);
    expect(a.count).toBe(1);
    expect(a.first).toBeCloseTo(inch(6), 12);
    expect(layoutAxis(0.3, 0.1, 0.15, false).count).toBe(1);
  });
  it('clearance larger than half the bed fits nothing, and the total is 0', () => {
    expect(layoutAxis(inch(12), inch(6), inch(7), false).count).toBe(0);
    const r = calculateSpacing({ ...base, width: inch(10) });
    expect([r.rows, r.perRow, r.total]).toEqual([0, 0, 0]);
  });
  it('every position respects the clearance at both ends', () => {
    const a = layoutAxis(1.0, 0.3, 0.12, false);
    // usable 0.76 -> 2 steps -> 3 positions at 0.12, 0.42, 0.72
    expect(a.count).toBe(3);
    expect(a.last).toBeCloseTo(0.72, 12);
    expect(a.total - a.last).toBeGreaterThanOrEqual(0.12);
  });
  it('centring shares the leftover equally and keeps the count', () => {
    const plain = layoutAxis(1.0, 0.3, 0.12, false);
    const mid = layoutAxis(1.0, 0.3, 0.12, true);
    expect(mid.count).toBe(plain.count);
    expect(mid.first).toBeCloseTo(0.2, 12);
    expect(mid.total - mid.last).toBeCloseTo(mid.first, 12);
  });
});

import { equilateralRowSpacing } from '../src/lib/spacing';

describe('staggered rows', () => {
  it('8 ft x 4 ft, 12 in / 18 in, 6 in clearance: rows of 8, 7, 8 = 23', () => {
    const r = calculateSpacing({ ...base, stagger: true });
    // Offset row starts at 6 + 6 = 12 in; last allowed centre is 96 - 6 = 90 in; 12,24,...,84 -> 7 plants
    expect([r.rows, r.fullRows, r.offsetRows]).toEqual([3, 2, 1]);
    expect(r.offsetAxis!.count).toBe(7);
    expect(r.offsetAxis!.first).toBeCloseTo(inch(12), 12);
    expect(r.offsetAxis!.last).toBeCloseTo(inch(84), 12);
    expect(r.total).toBe(23);
  });
  it('offset row keeps its count when leftover space allows the half step', () => {
    // 100 cm run, 30 cm spacing, no clearance: full rows at 0,30,60,90 (4); offset at 15,45,75 (3). 105 cm run: offset 15..105 (4)
    const a = calculateSpacing({ length: 1.0, width: 0.6, inRow: 0.3, betweenRows: 0.3, clearance: 0, direction: 'along-length', centre: false, stagger: true });
    expect([a.perRow, a.offsetAxis!.count, a.rows, a.total]).toEqual([4, 3, 3, 11]);
    const b = calculateSpacing({ length: 1.05, width: 0.6, inRow: 0.3, betweenRows: 0.3, clearance: 0, direction: 'along-length', centre: false, stagger: true });
    expect([b.perRow, b.offsetAxis!.count, b.total]).toEqual([4, 4, 12]);
  });
  it('offset rows can be empty when only one plant fits per row', () => {
    const r = calculateSpacing({ length: 0.3, width: 1, inRow: 0.5, betweenRows: 0.25, clearance: 0.1, direction: 'along-length', centre: false, stagger: true });
    // full: usable 0.1 -> 1 plant at 0.1; offset would be at 0.35 > 0.2 limit -> 0
    expect([r.perRow, r.offsetAxis!.count]).toEqual([1, 0]);
    expect(r.total).toBe(r.fullRows);
  });
  it('equilateral row spacing is 0.866 x plant spacing', () => {
    expect(equilateralRowSpacing(12)).toBeCloseTo(10.3923, 4);
  });
  it('stagger off is unchanged', () => {
    expect(calculateSpacing({ ...base, stagger: false }).total).toBe(24);
  });
});
