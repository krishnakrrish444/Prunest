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

/**
 * Lay out centres along one axis. `endClearance` defaults to `clearance`; it
 * differs only where a section of a mixed bed meets the next section.
 */
export function layoutAxis(total: number, spacing: number, clearance: number, centre: boolean, endClearance = clearance): AxisLayout {
  const usable = total - clearance - endClearance;
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

export function calculateSpacing(input: SpacingInput, ends?: { start: number; end: number }): SpacingLayout {
  const alongLength = input.direction === 'along-length';
  // `ends` replaces the edge clearance at the two ends of the bed length (sections of a mixed bed).
  const ls = ends?.start ?? input.clearance;
  const le = ends?.end ?? input.clearance;
  const plantAxis = alongLength
    ? layoutAxis(input.length, input.inRow, ls, input.centre, le)
    : layoutAxis(input.width, input.inRow, input.clearance, input.centre);
  const rowAxis = alongLength
    ? layoutAxis(input.width, input.betweenRows, input.clearance, input.centre)
    : layoutAxis(input.length, input.betweenRows, ls, input.centre, le);
  const rows = plantAxis.count === 0 ? 0 : rowAxis.count;
  const perRow = rowAxis.count === 0 ? 0 : plantAxis.count;
  if (!input.stagger || rows === 0) {
    return { rows, perRow, total: rows * perRow, plantAxis, rowAxis, fullRows: rows, offsetRows: 0 };
  }
  const offsetAxis = offsetLayout(plantAxis, alongLength ? le : input.clearance);
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

// ---- Mixed beds: sections along the bed length, one crop each ----

export interface CropSection {
  inRow: number;
  betweenRows: number;
  /** Length of bed given to this crop. Undefined means "the rest of the bed". */
  length?: number;
}

export interface SectionsInput extends Omit<SpacingInput, 'inRow' | 'betweenRows'> {
  sections: CropSection[];
}

export interface SectionLayout {
  /** Distance from the start of the bed to the start of this section. */
  start: number;
  length: number;
  /** Clearance kept at each end of this section, along the bed length. */
  startClear: number;
  endClear: number;
  layout: SpacingLayout;
}

export type SectionsResult =
  | { ok: true; sections: SectionLayout[]; total: number; unassigned: number }
  | { ok: false; problem: 'too-long' | 'two-rest'; over?: number };

/**
 * Divide the bed length between crops and lay out each section.
 * At the outer ends of the bed the edge clearance applies. Where two crops
 * meet, each keeps half of its own spacing along the bed length from the
 * boundary, so neighbouring plants are as far apart as both crops ask for.
 */
export function calculateSections(input: SectionsInput): SectionsResult {
  const rest = input.sections.filter((s) => s.length === undefined).length;
  if (rest > 1) return { ok: false, problem: 'two-rest' };
  const fixed = input.sections.reduce((sum, s) => sum + (s.length ?? 0), 0);
  const tol = 1e-9 * Math.max(1, input.length);
  if (fixed > input.length + tol) return { ok: false, problem: 'too-long', over: fixed - input.length };
  const remainder = Math.max(0, input.length - fixed);
  const unassigned = rest === 1 ? 0 : remainder;
  const alongLength = input.direction === 'along-length';
  let start = 0;
  const sections = input.sections.map((s, i) => {
    const length = s.length ?? remainder;
    const half = (alongLength ? s.inRow : s.betweenRows) / 2;
    const isLast = i === input.sections.length - 1;
    const startClear = i === 0 ? input.clearance : half;
    const endClear = isLast && unassigned <= tol ? input.clearance : half;
    const layout =
      length > tol
        ? calculateSpacing({ ...input, length, inRow: s.inRow, betweenRows: s.betweenRows }, { start: startClear, end: endClear })
        : calculateSpacing({ ...input, length: 0, inRow: s.inRow, betweenRows: s.betweenRows, clearance: 1 });
    const out = { start, length, startClear, endClear, layout };
    start += length;
    return out;
  });
  return { ok: true, sections, total: sections.reduce((n, s) => n + s.layout.total, 0), unassigned };
}

// ---- Square-foot grid ----

export interface SquareFit {
  /** Plants along each side of one square (spacing at or below the square size). */
  perSide: number;
  perSquare: number;
  /** For spacing wider than a square: one plant uses a block this many squares wide. */
  blockSide: number;
}

/** How a spacing fits into grid squares: n × n plants per square, or one plant per k × k block. */
export function squareFit(square: number, spacing: number): SquareFit {
  const ratio = square / spacing;
  if (ratio >= 1 - 1e-9) {
    const perSide = floorCount(ratio);
    return { perSide, perSquare: perSide * perSide, blockSide: 1 };
  }
  const blockSide = Math.ceil(spacing / square - 1e-9);
  return { perSide: 1, perSquare: 0, blockSide };
}

export interface SquareCrop {
  spacing: number;
  /** Squares to give this crop. Undefined means every square left. */
  squares?: number;
}

export interface SquarePlacement {
  fit: SquareFit;
  /** Squares asked for (or the rest). */
  asked: number;
  /** Squares actually given (whole blocks only for wide spacings). */
  used: number;
  plants: number;
  /** Top-left cell of each square or block given, as [column, row]. */
  cells: [number, number][];
}

export interface SquarePlan {
  cols: number;
  rows: number;
  squares: number;
  /** Bed length and width beyond the last whole square. */
  spareLength: number;
  spareWidth: number;
  crops: SquarePlacement[];
  free: number;
  plants: number;
  problem?: 'too-many' | 'two-rest';
  over?: number;
}

/** Plan a square-foot style grid: whole squares from the corner, crops filled in order. */
export function planSquares(length: number, width: number, square: number, crops: SquareCrop[]): SquarePlan {
  const cols = floorCount(length / square);
  const rows = floorCount(width / square);
  const squares = cols * rows;
  const base = { cols, rows, squares, spareLength: Math.max(0, length - cols * square), spareWidth: Math.max(0, width - rows * square) };
  if (crops.filter((c) => c.squares === undefined).length > 1) return { ...base, crops: [], free: squares, plants: 0, problem: 'two-rest' };
  const asked = crops.reduce((n, c) => n + (c.squares ?? 0), 0);
  if (asked > squares) return { ...base, crops: [], free: squares, plants: 0, problem: 'too-many', over: asked - squares };
  const taken: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const free = () => taken.reduce((n, r) => n + r.filter((t) => !t).length, 0);
  // Wide-spaced crops need whole blocks, so place them first; output keeps the entered order.
  const order = crops.map((c, i) => ({ c, i, k: squareFit(square, c.spacing).blockSide })).sort((a, b) => b.k - a.k || a.i - b.i);
  const result: SquarePlacement[] = new Array(crops.length);
  const restIndex = crops.findIndex((c) => c.squares === undefined);
  const restAsk = squares - asked;
  for (const { c, i, k } of order) {
    const fit = squareFit(square, c.spacing);
    const want = c.squares ?? restAsk;
    const cells: [number, number][] = [];
    let used = 0;
    if (i === restIndex) {
      result[i] = { fit, asked: want, used: 0, plants: 0, cells };
      continue;
    }
    place(k, want, cells, (n) => (used += n));
    result[i] = { fit, asked: want, used, plants: k === 1 ? used * fit.perSquare : used / (k * k), cells };
  }
  if (restIndex >= 0) {
    const c = crops[restIndex]!;
    const fit = squareFit(square, c.spacing);
    const k = fit.blockSide;
    const cells: [number, number][] = [];
    let used = 0;
    place(k, free(), cells, (n) => (used += n));
    result[restIndex] = { fit, asked: restAsk, used, plants: k === 1 ? used * fit.perSquare : used / (k * k), cells };
  }
  const plants = result.reduce((n, r) => n + r.plants, 0);
  return { ...base, crops: result, free: free(), plants };

  function place(k: number, want: number, cells: [number, number][], add: (n: number) => void) {
    let left = want;
    for (let r = 0; r + k <= rows && left >= k * k; r++) {
      for (let col = 0; col + k <= cols && left >= k * k; col++) {
        let clear = true;
        for (let dr = 0; dr < k && clear; dr++) for (let dc = 0; dc < k && clear; dc++) if (taken[r + dr]![col + dc]) clear = false;
        if (!clear) continue;
        for (let dr = 0; dr < k; dr++) for (let dc = 0; dc < k; dc++) taken[r + dr]![col + dc] = true;
        cells.push([col, r]);
        add(k * k);
        left -= k * k;
      }
    }
  }
}
