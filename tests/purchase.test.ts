import { describe, expect, it } from 'vitest';
import { cheapest, planBags } from '../src/lib/purchase';
import { seedsNeeded } from '../src/lib/seeds';
import { fromSI, toSI } from '../src/lib/units';

describe('bag options', () => {
  const need = toSI(43.156341, 'cuft');
  it('1.5 cu ft at $8: 29 bags, $232, $5.33 per cu ft', () => {
    const p = planBags(need, { volume: toSI(1.5, 'cuft'), price: 8 });
    expect(p.count).toBe(29);
    expect(p.cost).toBe(232);
    expect(fromSI(p.purchasedVolume, 'cuft')).toBeCloseTo(43.5, 9);
    expect(fromSI(p.surplusVolume, 'cuft')).toBeCloseTo(0.343659, 5);
    expect(p.costPerM3! * toSI(1, 'cuft')).toBeCloseTo(5.3333, 4);
  });
  it('2 cu ft at $10: 22 bags, $220 (cheaper overall despite costing more per bag)', () => {
    const a = planBags(need, { volume: toSI(1.5, 'cuft'), price: 8 });
    const b = planBags(need, { volume: toSI(2, 'cuft'), price: 10 });
    const c = planBags(need, { volume: toSI(1, 'cuft') });
    expect(b.count).toBe(22);
    expect(b.cost).toBe(220);
    expect(c.cost).toBeUndefined();
    expect(cheapest([a.cost, b.cost, c.cost])).toEqual([1]);
  });
  it('ties share the lowest cost; one priced option is not a comparison', () => {
    expect(cheapest([10, 10, 12])).toEqual([0, 1]);
    expect(cheapest([10, undefined])).toEqual([]);
    expect(cheapest([])).toEqual([]);
  });
  it('litre bags: 600 L in 50 L at 6 = 12 bags 72; 70 L at 8 = 9 bags 72 -> tie', () => {
    const a = planBags(0.6, { volume: toSI(50, 'l'), price: 6 });
    const b = planBags(0.6, { volume: toSI(70, 'l'), price: 8 });
    expect([a.count, a.cost, b.count, b.cost]).toEqual([12, 72, 9, 72]);
    expect(cheapest([a.cost, b.cost])).toEqual([0, 1]);
  });
});

describe('seeds needed', () => {
  it('one seed per spot covers germination: 24 positions at 80% = 30 seeds', () => {
    expect(seedsNeeded({ positions: 24, perSpot: 1, germination: 0.8, extraPct: 0 }).seeds).toBe(30);
  });
  it('adds the extra and rounds up: 24 / 0.85 x 1.1 = 31.06 -> 32 seeds, 2 packets of 25', () => {
    const r = seedsNeeded({ positions: 24, perSpot: 1, germination: 0.85, extraPct: 10, perPacket: 25 });
    expect(r.exact).toBeCloseTo(31.0588, 4);
    expect(r.seeds).toBe(32);
    expect(r.packets).toBe(2);
  });
  it('several per spot: 24 x 3 = 72 seeds; at 70% germination 2.7% of spots stay empty (0.65 spots)', () => {
    const r = seedsNeeded({ positions: 24, perSpot: 3, germination: 0.7, extraPct: 0, perPacket: 100 });
    expect(r.seeds).toBe(72);
    expect(r.packets).toBe(1);
    expect(r.emptyChance).toBeCloseTo(0.027, 9);
    expect(r.emptySpots).toBeCloseTo(0.648, 9);
  });
  it('without a germination rate it counts seeds sown only; exact packet fit is not rounded up', () => {
    const r = seedsNeeded({ positions: 25, perSpot: 2, extraPct: 0, perPacket: 50 });
    expect([r.seeds, r.packets, r.emptyChance]).toEqual([50, 1, undefined]);
    expect(seedsNeeded({ positions: 20, perSpot: 1, germination: 1, extraPct: 0 }).seeds).toBe(20);
  });
});

import { planByWeight } from '../src/lib/purchase';
import { LB_PER_CUFT } from '../src/lib/soil';

describe('bought by weight', () => {
  it('1.5 cu yd of gravel at 100 lb/cu ft, sold in half tons at $60/ton: 4,050 lb -> 5 half tons, $150', () => {
    const p = planByWeight(toSI(1.5, 'cuyd'), 100 * LB_PER_CUFT, toSI(0.5, 'ton'), 60 / toSI(1, 'ton'));
    expect(fromSI(p.requiredWeight, 'lb')).toBeCloseTo(4050, 6);
    expect(p.count).toBe(5);
    expect(fromSI(p.purchasedWeight, 'ton')).toBeCloseTo(2.5, 9);
    expect(fromSI(p.surplusWeight, 'lb')).toBeCloseTo(950, 6);
    expect(fromSI(p.surplusVolume, 'cuft')).toBeCloseTo(9.5, 6);
    expect(p.cost).toBeCloseTo(150, 9);
  });
  it('metric: 1 m3 at 1,600 kg/m3 sold by the tonne = 2 tonnes, exact 1.6 not rounded twice', () => {
    const p = planByWeight(1, 1600, 1000, 0.045);
    expect([p.count, p.purchasedWeight]).toEqual([2, 2000]);
    expect(p.surplusVolume).toBeCloseTo(0.25, 12);
    expect(p.cost).toBeCloseTo(90, 9);
    expect(planByWeight(1, 1500, 500).count).toBe(3);
  });
});
