import { describe, expect, it } from 'vitest';
import { calculateSoil, bedVolume } from '../src/lib/soil';
import { ceilCount, convert, fromSI, toSI } from '../src/lib/units';

const ft = (n: number) => toSI(n, 'ft');
const inch = (n: number) => toSI(n, 'in');

describe('bed volume', () => {
  it('rectangular: 8 ft x 4 ft x 10 in = 26.667 cu ft (hand: 32 sq ft x 10/12 ft)', () => {
    const v = bedVolume({ shape: 'rect', length: ft(8), width: ft(4), depth: inch(10) });
    expect(fromSI(v, 'cuft')).toBeCloseTo(80 / 3, 9);
    expect(fromSI(v, 'cuyd')).toBeCloseTo(80 / 81, 9);
    expect(fromSI(v, 'l')).toBeCloseTo(755.1159, 3);
  });
  it('circular: 4 ft diameter x 12 in = 4*pi cu ft', () => {
    const v = bedVolume({ shape: 'circle', diameter: ft(4), depth: inch(12) });
    expect(fromSI(v, 'cuft')).toBeCloseTo(12.566370614, 8);
  });
  it('metric: 2 m x 1 m x 30 cm = 600 L = 0.6 m3', () => {
    const v = bedVolume({ shape: 'rect', length: 2, width: 1, depth: toSI(30, 'cm') });
    expect(fromSI(v, 'l')).toBeCloseTo(600, 9);
    expect(v).toBeCloseTo(0.6, 12);
  });
  it('mixed units: 240 cm x 4 ft x 10 in', () => {
    const v = bedVolume({ shape: 'rect', length: toSI(240, 'cm'), width: ft(4), depth: inch(10) });
    // 2.4 m x 1.2192 m x 0.254 m
    expect(v).toBeCloseTo(0.743224, 5);
  });
  it('top-up: only the added depth counts', () => {
    const v = bedVolume({ shape: 'rect', length: ft(8), width: ft(4), depth: inch(2) });
    expect(fromSI(v, 'cuft')).toBeCloseTo(32 / 6, 9);
  });
});

describe('worked example on the soil page', () => {
  const r = calculateSoil({
    beds: [
      { shape: 'rect', length: ft(8), width: ft(4), depth: inch(10) },
      { shape: 'circle', diameter: ft(4), depth: inch(12) },
    ],
    allowancePct: 10,
    bagVolume: toSI(1.5, 'cuft'),
    bagPrice: 8,
    bulkPricePerM3: 45 / toSI(1, 'cuyd'),
  });
  const cuft = (si: number) => fromSI(si, 'cuft');
  it('keeps base volume separate from allowance', () => {
    expect(cuft(r.baseVolume)).toBeCloseTo(39.2330373, 6);
    expect(cuft(r.allowanceVolume)).toBeCloseTo(3.92330373, 6);
    expect(cuft(r.totalVolume)).toBeCloseTo(43.156341, 5);
    expect(fromSI(r.totalVolume, 'cuyd')).toBeCloseTo(1.598383, 5);
    expect(fromSI(r.totalVolume, 'l')).toBeCloseTo(1222.05, 1);
  });
  it('pooled bags round once; per-bed bags round each bed', () => {
    expect(r.bagsPooled).toBe(29);
    expect(r.beds.map((b) => b.bags)).toEqual([20, 10]);
    expect(r.bagsPerBed).toBe(30);
    expect(r.bagCostPooled).toBe(232);
    expect(r.bagCostPerBed).toBe(240);
  });
  it('bulk cost prices the exact volume', () => {
    expect(r.bulkCost).toBeCloseTo(71.927, 2);
  });
});

describe('rounding and units', () => {
  it('exact fit does not round up to an extra bag', () => {
    // 27 cu ft with 1 cu ft bags, and 3 cu ft with 1.5 cu ft bags
    const r = calculateSoil({ beds: [{ shape: 'rect', length: ft(3), width: ft(3), depth: ft(3) }], allowancePct: 0, bagVolume: toSI(1, 'cuft') });
    expect(r.bagsPooled).toBe(27);
    expect(ceilCount(toSI(3, 'cuft') / toSI(1.5, 'cuft'))).toBe(2);
    expect(ceilCount(0.1 * 3 / 0.1)).toBe(3);
  });
  it('a hair over rounds up', () => {
    expect(ceilCount(27.0001)).toBe(28);
    expect(ceilCount(0.01)).toBe(1);
    expect(ceilCount(0)).toBe(0);
  });
  it('litre bags: 600 L with 50 L bags = 12, with 40 L bags = 15, 70 L = 9', () => {
    const beds = [{ shape: 'rect' as const, length: 2, width: 1, depth: 0.3 }];
    expect(calculateSoil({ beds, allowancePct: 0, bagVolume: toSI(50, 'l') }).bagsPooled).toBe(12);
    expect(calculateSoil({ beds, allowancePct: 0, bagVolume: toSI(40, 'l') }).bagsPooled).toBe(15);
    expect(calculateSoil({ beds, allowancePct: 0, bagVolume: toSI(70, 'l') }).bagsPooled).toBe(9);
  });
  it('no bag or price means no bag or cost output', () => {
    const r = calculateSoil({ beds: [{ shape: 'rect', length: 1, width: 1, depth: 1 }], allowancePct: 0 });
    expect(r.bagsPooled).toBeUndefined();
    expect(r.bulkCost).toBeUndefined();
  });
  it('unit round trips return the starting value', () => {
    for (const v of [4, 0.1, 7.25, 123.456]) {
      expect(convert(convert(v, 'ft', 'm'), 'm', 'ft')).toBeCloseTo(v, 12);
      expect(convert(convert(v, 'in', 'cm'), 'cm', 'in')).toBeCloseTo(v, 12);
      expect(convert(convert(v, 'cuft', 'l'), 'l', 'cuft')).toBeCloseTo(v, 12);
      expect(convert(convert(v, 'cuyd', 'cum'), 'cum', 'cuyd')).toBeCloseTo(v, 12);
    }
    expect(convert(1, 'cuyd', 'cuft')).toBeCloseTo(27, 12);
    expect(convert(1, 'cum', 'l')).toBe(1000);
    expect(convert(12, 'in', 'ft')).toBeCloseTo(1, 12);
    expect(convert(1, 'cuft', 'l')).toBeCloseTo(28.316846592, 9);
  });
});

import { KG_PER_LB, LB_PER_CUFT, splitMix, weightKg } from '../src/lib/soil';

describe('soil mix and weight (optional extras)', () => {
  it('splits 30 cu ft at 2:1:1 into 15, 7.5 and 7.5 cu ft', () => {
    const m = splitMix(toSI(30, 'cuft'), [{ name: 'Topsoil', parts: 2 }, { name: 'Compost', parts: 1 }, { name: 'Sand', parts: 1 }], toSI(1.5, 'cuft'));
    expect(m.map((x) => fromSI(x.volume, 'cuft'))).toEqual([expect.closeTo(15, 9), expect.closeTo(7.5, 9), expect.closeTo(7.5, 9)]);
    expect(m.map((x) => x.bags)).toEqual([10, 5, 5]);
    expect(m.reduce((s, x) => s + x.fraction, 0)).toBeCloseTo(1, 12);
  });
  it('percentages work as parts: 40/40/20 of 1000 L = 400, 400, 200 L; 50 L bags = 8, 8, 4', () => {
    const m = splitMix(1, [{ name: 'a', parts: 40 }, { name: 'b', parts: 40 }, { name: 'c', parts: 20 }], toSI(50, 'l'));
    expect(m.map((x) => Math.round(fromSI(x.volume, 'l')))).toEqual([400, 400, 200]);
    expect(m.map((x) => x.bags)).toEqual([8, 8, 4]);
  });
  it('weight uses only the supplied density: 27 cu ft at 75 lb/cu ft = 2025 lb', () => {
    const kg = weightKg(toSI(27, 'cuft'), 75 * LB_PER_CUFT);
    expect(kg / KG_PER_LB).toBeCloseTo(2025, 6);
    expect(weightKg(0.5, 1200)).toBeCloseTo(600, 9);
    expect(LB_PER_CUFT).toBeCloseTo(16.018463, 5);
  });
});
