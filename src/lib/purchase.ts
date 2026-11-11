// Comparing ways to buy a volume. Pure functions, SI units (m³). No UI code.
import { ceilCount } from './units';

export interface BagOption {
  /** Volume of one bag, m³. */
  volume: number;
  price?: number;
}

export interface BagPlan {
  count: number;
  purchasedVolume: number;
  surplusVolume: number;
  cost?: number;
  /** Price per m³ of what is bought, when a price was entered. */
  costPerM3?: number;
}

export function planBags(required: number, option: BagOption): BagPlan {
  const count = ceilCount(required / option.volume);
  const purchasedVolume = count * option.volume;
  const cost = option.price !== undefined ? count * option.price : undefined;
  return {
    count,
    purchasedVolume,
    surplusVolume: Math.max(0, purchasedVolume - required),
    cost,
    costPerM3: option.price !== undefined ? option.price / option.volume : undefined,
  };
}

/**
 * Indexes of the cheapest priced options (ties share the lowest cost).
 * Options without a price are ignored. Empty when fewer than two are priced.
 */
export function cheapest(costs: (number | undefined)[]): number[] {
  const priced = costs.map((c, i) => [c, i] as const).filter((x): x is readonly [number, number] => x[0] !== undefined);
  if (priced.length < 2) return [];
  const min = Math.min(...priced.map(([c]) => c));
  return priced.filter(([c]) => Math.abs(c - min) < 0.005).map(([, i]) => i);
}

export interface WeightPlan {
  /** Weight of the required volume, kg. */
  requiredWeight: number;
  /** Whole steps of `step` kg bought. */
  count: number;
  purchasedWeight: number;
  surplusWeight: number;
  /** Purchased weight turned back into volume with the same density, m³. */
  purchasedVolume: number;
  surplusVolume: number;
  cost?: number;
}

/**
 * Buying a volume of material that is sold by weight (gravel, stone, some soils).
 * Uses only the density supplied for the product, in kg per m³.
 */
export function planByWeight(volume: number, density: number, step: number, pricePerKg?: number): WeightPlan {
  const requiredWeight = volume * density;
  const count = ceilCount(requiredWeight / step);
  const purchasedWeight = count * step;
  return {
    requiredWeight,
    count,
    purchasedWeight,
    surplusWeight: Math.max(0, purchasedWeight - requiredWeight),
    purchasedVolume: purchasedWeight / density,
    surplusVolume: Math.max(0, purchasedWeight / density - volume),
    cost: pricePerKg !== undefined ? purchasedWeight * pricePerKg : undefined,
  };
}
