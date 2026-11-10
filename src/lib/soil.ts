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

// ---- Optional extras ----

export interface MixPart {
  name: string;
  /** Relative share, e.g. 2 parts topsoil to 1 part compost. Any positive numbers. */
  parts: number;
}

export interface MixShare {
  name: string;
  fraction: number;
  volume: number;
  /** Whole bags if this ingredient is bought on its own in bags of `bagVolume`. */
  bags?: number;
}

/** Split a total volume between ingredients in proportion to the parts entered. */
export function splitMix(totalVolume: number, mix: MixPart[], bagVolume?: number): MixShare[] {
  const sum = mix.reduce((s, m) => s + m.parts, 0);
  return mix.map((m) => {
    const fraction = m.parts / sum;
    const volume = totalVolume * fraction;
    return { name: m.name, fraction, volume, bags: bagVolume ? ceilCount(volume / bagVolume) : undefined };
  });
}

/** 1 lb per cubic foot in kg per cubic metre (exact from 0.45359237 kg and 0.3048 m). */
export const LB_PER_CUFT = 0.45359237 / (0.3048 * 0.3048 * 0.3048);
export const KG_PER_LB = 0.45359237;

/** Weight in kg from a volume and a density the visitor supplied (kg per cubic metre). */
export function weightKg(volumeM3: number, densityKgPerM3: number): number {
  return volumeM3 * densityKgPerM3;
}
