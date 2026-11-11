// How many seeds to buy for a number of plant positions. Pure functions.
import { ceilCount } from './units';

export interface SeedInput {
  positions: number;
  /** Seeds sown at each position. 1 means sow one and cover failures with extra seed. */
  perSpot: number;
  /** Germination rate from the packet, 0-1. Optional. */
  germination?: number;
  /** Extra for losses, as a percentage. 0 for none. */
  extraPct: number;
  /** Seeds in one packet. Optional. */
  perPacket?: number;
}

export interface SeedResult {
  /** Seeds before rounding. */
  exact: number;
  seeds: number;
  packets?: number;
  /** Sowing several per spot: chance a spot gets no seedling, from the germination rate. */
  emptyChance?: number;
  /** Expected number of spots with no seedling. */
  emptySpots?: number;
}

export function seedsNeeded(s: SeedInput): SeedResult {
  const extra = 1 + s.extraPct / 100;
  // One seed per spot: sow enough that, on average, every position gets a plant.
  // Several per spot: sow that many at every position; germination decides how many spots stay empty.
  const exact = s.perSpot === 1 && s.germination !== undefined ? (s.positions / s.germination) * extra : s.positions * s.perSpot * extra;
  const seeds = ceilCount(exact);
  const result: SeedResult = { exact, seeds };
  if (s.perPacket) result.packets = ceilCount(seeds / s.perPacket);
  if (s.germination !== undefined && s.perSpot > 1) {
    result.emptyChance = Math.pow(1 - s.germination, s.perSpot);
    result.emptySpots = s.positions * result.emptyChance;
  }
  return result;
}
