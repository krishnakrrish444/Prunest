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
  return { rows, perRow, total: rows * perRow, plantAxis, rowAxis };
}

export function otherDirection(d: RowDirection): RowDirection {
  return d === 'along-length' ? 'along-width' : 'along-length';
}

/** Offsets of each centre from the near edge. */
export function axisPositions(axis: AxisLayout): number[] {
  return Array.from({ length: axis.count }, (_, i) => axis.first + i * axis.spacing);
}
