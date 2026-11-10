// Mulch coverage. Pure functions, SI units (m, m², m³). No UI code.
import { footprintArea, type Footprint } from './geometry';
import { ceilCount } from './units';

export interface MulchArea extends Footprint {
  /** Area inside this section that is already covered or not to be mulched, m². */
  exclusion: number;
}

export interface MulchInput {
  areas: MulchArea[];
  depth: number;
  bagVolume?: number;
  bagPrice?: number;
  /** Smallest step the bulk supplier sells, m³ (e.g. half a cubic yard). */
  bulkIncrement?: number;
  bulkPricePerM3?: number;
}

export interface PurchaseOption {
  /** Bags, or bulk increments. */
  count: number;
  purchasedVolume: number;
  surplusVolume: number;
  cost?: number;
}

export interface MulchResult {
  areas: { gross: number; exclusion: number; net: number; volume: number }[];
  grossArea: number;
  exclusionArea: number;
  netArea: number;
  /** Volume actually required, before any rounding for purchase. */
  volume: number;
  bags?: PurchaseOption;
  bulk?: PurchaseOption;
  cheaper?: 'bags' | 'bulk' | 'equal';
  /** Ground one bag covers at the chosen depth, m². */
  coveragePerBag?: number;
}

/** Returns an error message if the exclusion does not fit inside the section. */
export function exclusionProblem(gross: number, exclusion: number): string | null {
  if (exclusion < 0) return 'The excluded area cannot be negative.';
  if (exclusion >= gross * (1 - 1e-12)) {
    return 'The excluded area must be smaller than this section, otherwise nothing is left to mulch.';
  }
  return null;
}

export function calculateMulch(input: MulchInput): MulchResult {
  const areas = input.areas.map((a) => {
    const gross = footprintArea(a);
    const net = gross - a.exclusion;
    return { gross, exclusion: a.exclusion, net, volume: net * input.depth };
  });
  const sum = (key: 'gross' | 'exclusion' | 'net' | 'volume') => areas.reduce((s, a) => s + a[key], 0);
  const volume = sum('volume');
  const result: MulchResult = {
    areas,
    grossArea: sum('gross'),
    exclusionArea: sum('exclusion'),
    netArea: sum('net'),
    volume,
  };
  if (input.bagVolume) {
    result.coveragePerBag = input.bagVolume / input.depth;
    const count = ceilCount(volume / input.bagVolume);
    const purchasedVolume = count * input.bagVolume;
    result.bags = {
      count,
      purchasedVolume,
      surplusVolume: Math.max(0, purchasedVolume - volume),
      cost: input.bagPrice !== undefined ? count * input.bagPrice : undefined,
    };
  }
  if (input.bulkIncrement) {
    const count = ceilCount(volume / input.bulkIncrement);
    const purchasedVolume = count * input.bulkIncrement;
    result.bulk = {
      count,
      purchasedVolume,
      surplusVolume: Math.max(0, purchasedVolume - volume),
      cost: input.bulkPricePerM3 !== undefined ? purchasedVolume * input.bulkPricePerM3 : undefined,
    };
  }
  const bc = result.bags?.cost;
  const kc = result.bulk?.cost;
  if (bc !== undefined && kc !== undefined) {
    result.cheaper = Math.abs(bc - kc) < 0.005 ? 'equal' : bc < kc ? 'bags' : 'bulk';
  }
  return result;
}
