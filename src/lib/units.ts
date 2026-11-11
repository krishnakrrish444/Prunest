// Unit definitions. Internally everything is SI: metres, square metres, cubic metres.
// Factors are exact by definition (international foot = 0.3048 m).

export type LengthUnit = 'ft' | 'in' | 'yd' | 'm' | 'cm' | 'mm';
export type AreaUnit = 'sqft' | 'sqyd' | 'sqm';
export type VolumeUnit = 'cuft' | 'cuyd' | 'l' | 'cum';
/** Mass units; their SI base is the kilogram. US ton = 2,000 lb. */
export type MassUnit = 'lb' | 'kg' | 'ton' | 'tonne';
export type Unit = LengthUnit | AreaUnit | VolumeUnit | MassUnit;
export type UnitSystem = 'imperial' | 'metric';

const FT = 0.3048;
const YD = 0.9144;
const LB = 0.45359237;

export const TO_SI: Record<Unit, number> = {
  ft: FT,
  in: 0.0254,
  yd: YD,
  m: 1,
  cm: 0.01,
  mm: 0.001,
  sqft: FT * FT,
  sqyd: YD * YD,
  sqm: 1,
  cuft: FT * FT * FT,
  cuyd: YD * YD * YD,
  l: 0.001,
  cum: 1,
  lb: LB,
  kg: 1,
  ton: 2000 * LB,
  tonne: 1000,
};

export const UNIT_LABEL: Record<Unit, string> = {
  ft: 'ft',
  in: 'in',
  yd: 'yd',
  m: 'm',
  cm: 'cm',
  mm: 'mm',
  sqft: 'sq ft',
  sqyd: 'sq yd',
  sqm: 'm²',
  cuft: 'cu ft',
  cuyd: 'cu yd',
  l: 'L',
  cum: 'm³',
  lb: 'lb',
  kg: 'kg',
  ton: 'ton',
  tonne: 'tonne',
};

export const UNIT_NAME: Record<Unit, string> = {
  ft: 'feet',
  in: 'inches',
  yd: 'yards',
  m: 'metres',
  cm: 'centimetres',
  mm: 'millimetres',
  sqft: 'square feet',
  sqyd: 'square yards',
  sqm: 'square metres',
  cuft: 'cubic feet',
  cuyd: 'cubic yards',
  l: 'litres',
  cum: 'cubic metres',
  lb: 'pounds',
  kg: 'kilograms',
  ton: 'US tons (2,000 lb)',
  tonne: 'tonnes (1,000 kg)',
};

export const SYSTEM_OF: Record<Unit, UnitSystem> = {
  ft: 'imperial', in: 'imperial', yd: 'imperial', m: 'metric', cm: 'metric', mm: 'metric',
  sqft: 'imperial', sqyd: 'imperial', sqm: 'metric',
  cuft: 'imperial', cuyd: 'imperial', l: 'metric', cum: 'metric',
  lb: 'imperial', ton: 'imperial', kg: 'metric', tonne: 'metric',
};

export function toSI(value: number, unit: Unit): number {
  return value * TO_SI[unit];
}

export function fromSI(si: number, unit: Unit): number {
  return si / TO_SI[unit];
}

export function convert(value: number, from: Unit, to: Unit): number {
  return from === to ? value : fromSI(toSI(value, from), to);
}

/**
 * Round a ratio up to a whole count, forgiving floating-point noise so an
 * exact fit (e.g. 27 cu ft into 1 cu ft bags) is not bumped to the next unit.
 */
export function ceilCount(ratio: number): number {
  if (!(ratio > 0)) return 0;
  const nearest = Math.round(ratio);
  if (Math.abs(ratio - nearest) <= 1e-9 * Math.max(1, Math.abs(ratio))) return nearest;
  return Math.ceil(ratio);
}

/** Whole steps that fit, forgiving floating-point noise at exact-fit boundaries. */
export function floorCount(ratio: number): number {
  if (!(ratio >= 0)) return 0;
  const nearest = Math.round(ratio);
  if (Math.abs(ratio - nearest) <= 1e-9 * Math.max(1, Math.abs(ratio))) return nearest;
  return Math.floor(ratio);
}
