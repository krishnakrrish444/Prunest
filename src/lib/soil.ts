// Raised-bed soil volume. Pure functions, SI units (m, m³). No UI code.
import { footprintArea, type Footprint } from './geometry';
import { ceilCount } from './units';

export interface BedInput extends Footprint {
  /** Depth of soil to add (not the bed's wall height). */
  depth: number;
}

export interface SoilInput {
  beds: BedInput[];
  /** Extra material for settling, as a percentage of base volume. 0 for none. */
  allowancePct: number;
  /** Volume of one bag in m³, if buying bags. */
  bagVolume?: number;
  bagPrice?: number;
  /** Bulk price per m³. */
  bulkPricePerM3?: number;
}

export interface BedResult {
  area: number;
  baseVolume: number;
  allowanceVolume: number;
  totalVolume: number;
  /** Bags if this bed is bought for on its own. */
  bags?: number;
}

export interface SoilResult {
  beds: BedResult[];
  baseVolume: number;
  allowanceVolume: number;
  totalVolume: number;
  /** One shared purchase: round up once, on the combined volume. */
  bagsPooled?: number;
  /** Each bed rounded up separately, then added. Always >= bagsPooled. */
  bagsPerBed?: number;
  bagCostPooled?: number;
  bagCostPerBed?: number;
  /** Price of exactly the required volume at the bulk rate. */
  bulkCost?: number;
}

export function bedVolume(bed: BedInput): number {
  return footprintArea(bed) * bed.depth;
}

export function calculateSoil(input: SoilInput): SoilResult {
  const factor = input.allowancePct / 100;
  const beds: BedResult[] = input.beds.map((bed) => {
    const baseVolume = bedVolume(bed);
    const allowanceVolume = baseVolume * factor;
    const totalVolume = baseVolume + allowanceVolume;
    return {
      area: footprintArea(bed),
      baseVolume,
      allowanceVolume,
      totalVolume,
      bags: input.bagVolume ? ceilCount(totalVolume / input.bagVolume) : undefined,
    };
  });
  const baseVolume = beds.reduce((s, b) => s + b.baseVolume, 0);
  const allowanceVolume = baseVolume * factor;
  const totalVolume = baseVolume + allowanceVolume;
  const result: SoilResult = { beds, baseVolume, allowanceVolume, totalVolume };
  if (input.bagVolume) {
    result.bagsPooled = ceilCount(totalVolume / input.bagVolume);
    result.bagsPerBed = beds.reduce((s, b) => s + (b.bags ?? 0), 0);
    if (input.bagPrice !== undefined) {
      result.bagCostPooled = result.bagsPooled * input.bagPrice;
      result.bagCostPerBed = result.bagsPerBed * input.bagPrice;
    }
  }
  if (input.bulkPricePerM3 !== undefined) {
    result.bulkCost = totalVolume * input.bulkPricePerM3;
  }
  return result;
}
