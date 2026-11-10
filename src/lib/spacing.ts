// Plant positions in regular rows. Pure functions, lengths in metres. No UI code.
//
// Model: spacing is centre-to-centre. Along each axis the usable run is the bed
// dimension minus the edge clearance at both ends. The first plant centre sits
// at the start of the usable run, then one more position fits every full
// spacing step. Positions are counted along each axis, never by dividing area.
import { floorCount } from './units';

export type RowDirection = 'along-length' | 'along-width';

export interface SpacingInput {
  length: number;
  width: number;
  /** Centre-to-centre distance between plants in the same row. */
  inRow: number;
  /** Centre-to-centre distance between neighbouring rows. */
  betweenRows: number;
  /** Minimum distance from any bed edge to the nearest plant centre. 0 for none. */
  clearance: number;
  direction: RowDirection;
  /** Share leftover space equally between both ends instead of leaving it at the far end. */
  centre: boolean;
  /** Offset every second row by half the in-row spacing (a staggered, triangular pattern). */
  stagger?: boolean;
}

export interface AxisLayout {
  /** Bed dimension along this axis. */
  total: number;
  spacing: number;
  usable: number;
  count: number;
  /** Distance from the near edge to the first centre. */
  first: number;
  /** Distance from the near edge to the last centre. */
  last: number;
  /** Usable run not taken up by spacing steps. */
  leftover: number;
}

export interface SpacingLayout {
  rows: number;
  perRow: number;
  total: number;
  /** Positions of plants along a row (measured along the row direction). */
  plantAxis: AxisLayout;
  /** Positions of rows (measured across the rows). */
  rowAxis: AxisLayout;
  /** Staggered layouts only: plant positions in the 2nd, 4th, ... rows. */
  offsetAxis?: AxisLayout;
  /** Rows using the full pattern (1st, 3rd, ...) and the offset pattern. */
  fullRows: number;
  offsetRows: number;
}

export function layoutAxis(total: number, spacing: number, clearance: number, centre: boolean): AxisLayout {
  const usable = total - 2 * clearance;
  // Tolerate float noise so a clearance of exactly half the bed still fits one centre line.
  const fits = usable >= -1e-9 * Math.max(1, total);
  if (!fits) {
    return { total, spacing, usable, count: 0, first: NaN, last: NaN, leftover: 0 };
  }
  const run = Math.max(0, usable);
  const steps = floorCount(run / spacing);
  const span = steps * spacing;
  const leftover = Math.max(0, run - span);
  const first = clearance + (centre ? leftover / 2 : 0);
  return { total, spacing, usable: run, count: steps + 1, first, last: first + span, leftover };
}

export function calculateSpacing(input: SpacingInput): SpacingLayout {
  const alongLength = input.direction === 'along-length';
  const plantAxis = layoutAxis(alongLength ? input.length : input.width, input.inRow, input.clearance, input.centre);
  const rowAxis = layoutAxis(alongLength ? input.width : input.length, input.betweenRows, input.clearance, input.centre);
  const rows = plantAxis.count === 0 ? 0 : rowAxis.count;
  const perRow = rowAxis.count === 0 ? 0 : plantAxis.count;
  if (!input.stagger || rows === 0) {
    return { rows, perRow, total: rows * perRow, plantAxis, rowAxis, fullRows: rows, offsetRows: 0 };
  }
  const offsetAxis = offsetLayout(plantAxis, input.clearance);
  const fullRows = Math.ceil(rows / 2);
  const offsetRows = Math.floor(rows / 2);
  return { rows, perRow, total: fullRows * perRow + offsetRows * offsetAxis.count, plantAxis, rowAxis, offsetAxis, fullRows, offsetRows };
}

/**
 * Positions for an offset row: every centre sits half a spacing further along
 * than in the full rows, and must still keep the edge clearance at the far end.
 */
export function offsetLayout(full: AxisLayout, clearance: number): AxisLayout {
  const first = full.first + full.spacing / 2;
  const limit = full.total - clearance;
  const room = limit - first;
  if (room < -1e-9 * Math.max(1, full.total)) {
    return { ...full, count: 0, first: NaN, last: NaN, leftover: 0 };
  }
  const steps = floorCount(Math.max(0, room) / full.spacing);
  const last = first + steps * full.spacing;
  return { ...full, count: steps + 1, first, last, leftover: Math.max(0, limit - last) };
}

/** Row spacing that makes a staggered layout equilateral: every neighbour the same distance apart. */
export function equilateralRowSpacing(inRow: number): number {
  return (inRow * Math.sqrt(3)) / 2;
}

export function otherDirection(d: RowDirection): RowDirection {
  return d === 'along-length' ? 'along-width' : 'along-length';
}

/** Offsets of each centre from the near edge. */
export function axisPositions(axis: AxisLayout): number[] {
  return Array.from({ length: axis.count }, (_, i) => axis.first + i * axis.spacing);
}
