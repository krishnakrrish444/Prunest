import { describe, expect, it } from 'vitest';
import { calculateMulch, exclusionProblem } from '../src/lib/mulch';
import { fromSI, toSI } from '../src/lib/units';

const ft = (n: number) => toSI(n, 'ft');
const sqft = (n: number) => toSI(n, 'sqft');

describe('worked example on the mulch page', () => {
  // 20 ft x 6 ft = 120 sq ft, less 12 = 108. Circle 8 ft: pi*16 = 50.2655. Net 158.2655 sq ft.
  // 3 in = 0.25 ft -> 39.5664 cu ft = 1.46542 cu yd.
  const r = calculateMulch({
    areas: [
      { shape: 'rect', length: ft(20), width: ft(6), exclusion: sqft(12) },
      { shape: 'circle', diameter: ft(8), exclusion: 0 },
    ],
    depth: toSI(3, 'in'),
    bagVolume: toSI(2, 'cuft'),
    bagPrice: 4.5,
    bulkIncrement: toSI(0.5, 'cuyd'),
    bulkPricePerM3: 40 / toSI(1, 'cuyd'),
  });
  it('net area subtracts the exclusion', () => {
    expect(fromSI(r.grossArea, 'sqft')).toBeCloseTo(170.265482, 5);
    expect(fromSI(r.exclusionArea, 'sqft')).toBeCloseTo(12, 9);
    expect(fromSI(r.netArea, 'sqft')).toBeCloseTo(158.265482, 5);
    expect(fromSI(r.areas[0]!.net, 'sqft')).toBeCloseTo(108, 9);
  });
  it('required volume uses the entered depth', () => {
    expect(fromSI(r.volume, 'cuft')).toBeCloseTo(39.566371, 5);
    expect(fromSI(r.volume, 'cuyd')).toBeCloseTo(1.465421, 5);
  });
  it('bags: 20 x 2 cu ft, surplus 0.434 cu ft, $90', () => {
    expect(r.bags!.count).toBe(20);
    expect(fromSI(r.bags!.purchasedVolume, 'cuft')).toBeCloseTo(40, 9);
    expect(fromSI(r.bags!.surplusVolume, 'cuft')).toBeCloseTo(0.433629, 5);
    expect(r.bags!.cost).toBe(90);
  });
  it('bulk: 3 half-yard steps = 1.5 cu yd, surplus 0.0346 cu yd, $60', () => {
    expect(r.bulk!.count).toBe(3);
    expect(fromSI(r.bulk!.purchasedVolume, 'cuyd')).toBeCloseTo(1.5, 9);
    expect(fromSI(r.bulk!.surplusVolume, 'cuyd')).toBeCloseTo(0.034579, 5);
    expect(r.bulk!.cost).toBeCloseTo(60, 9);
    expect(r.cheaper).toBe('bulk');
  });
});

describe('depth conversions', () => {
  const areas = [{ shape: 'rect' as const, length: 10, width: 1, exclusion: 0 }];
  it('10 m2 at 5 cm = 500 L; at 75 mm = 750 L', () => {
    expect(fromSI(calculateMulch({ areas, depth: toSI(5, 'cm') }).volume, 'l')).toBeCloseTo(500, 9);
    expect(fromSI(calculateMulch({ areas, depth: toSI(75, 'mm') }).volume, 'l')).toBeCloseTo(750, 9);
  });
  it('324 sq ft at 1 in = exactly 1 cu yd; 100 sq ft at 3 in = 25 cu ft', () => {
    const a = [{ shape: 'rect' as const, length: ft(18), width: ft(18), exclusion: 0 }];
    const r = calculateMulch({ areas: a, depth: toSI(1, 'in'), bulkIncrement: toSI(1, 'cuyd') });
    expect(fromSI(r.volume, 'cuyd')).toBeCloseTo(1, 12);
    expect(r.bulk!.count).toBe(1); // exact fit, not 2
    const b = [{ shape: 'rect' as const, length: ft(10), width: ft(10), exclusion: 0 }];
    expect(fromSI(calculateMulch({ areas: b, depth: toSI(3, 'in') }).volume, 'cuft')).toBeCloseTo(25, 9);
  });
  it('2 in and 5.08 cm are the same depth', () => {
    expect(calculateMulch({ areas, depth: toSI(2, 'in') }).volume).toBeCloseTo(calculateMulch({ areas, depth: toSI(5.08, 'cm') }).volume, 12);
  });
});

describe('purchase rounding', () => {
  const areas = [{ shape: 'rect' as const, length: 10, width: 1, exclusion: 0 }];
  it('500 L in 60 L bags = 9 bags, 540 L bought, 40 L spare', () => {
    const r = calculateMulch({ areas, depth: 0.05, bagVolume: toSI(60, 'l') });
    expect(r.bags!.count).toBe(9);
    expect(fromSI(r.bags!.surplusVolume, 'l')).toBeCloseTo(40, 9);
    expect(r.bags!.cost).toBeUndefined();
    expect(r.cheaper).toBeUndefined();
  });
  it('500 L in 50 L bags is exactly 10 with no surplus', () => {
    const r = calculateMulch({ areas, depth: 0.05, bagVolume: toSI(50, 'l') });
    expect(r.bags!.count).toBe(10);
    expect(r.bags!.surplusVolume).toBeCloseTo(0, 12);
  });
  it('bulk cost is charged on the rounded quantity', () => {
    const r = calculateMulch({ areas, depth: 0.05, bulkIncrement: 0.25, bulkPricePerM3: 80 });
    expect(r.bulk!.count).toBe(2);
    expect(r.bulk!.purchasedVolume).toBeCloseTo(0.5, 12);
    expect(r.bulk!.cost).toBeCloseTo(40, 9);
  });
});

describe('exclusion validation', () => {
  it('accepts a smaller exclusion and zero', () => {
    expect(exclusionProblem(10, 0)).toBeNull();
    expect(exclusionProblem(10, 9.99)).toBeNull();
  });
  it('rejects an exclusion equal to or larger than the section, or negative', () => {
    expect(exclusionProblem(10, 10)).toMatch(/smaller/);
    expect(exclusionProblem(10, 12)).toMatch(/smaller/);
    expect(exclusionProblem(10, -1)).toMatch(/negative/);
  });
});
