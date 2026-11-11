// SVG diagrams. Shapes are labelled with the visitor's own measurements; the
// labels are authoritative, the drawing is only a guide.
import { compareDates, dayNumber, type CalDate } from '../lib/dates';
import { axisPositions, type SpacingLayout } from '../lib/spacing';
import { esc } from './kit';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A dimension line with end ticks, as on a measured drawing. */
function dim(x1: number, y1: number, x2: number, y2: number): string {
  const t = 4;
  const vertical = Math.abs(x1 - x2) < 0.01;
  const tick = (x: number, y: number) =>
    vertical ? `<line class="dg-dim" x1="${x - t}" y1="${y}" x2="${x + t}" y2="${y}"/>` : `<line class="dg-dim" x1="${x}" y1="${y - t}" x2="${x}" y2="${y + t}"/>`;
  return `<line class="dg-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${tick(x1, y1)}${tick(x2, y2)}`;
}

export interface FootprintDiagram {
  shape: 'rect' | 'circle' | 'triangle' | 'ring';
  /** length / width, used only to give the outline believable proportions. */
  ratio: number;
  /** inner / outer diameter for a ring. */
  innerRatio?: number;
  lengthLabel?: string;
  widthLabel?: string;
  diameterLabel?: string;
  innerLabel?: string;
  depthLabel: string;
  /** e.g. "soil to add" or "mulch depth". */
  depthCaption: string;
  /** Optional bed wall height, drawn above the fill. */
  heightLabel?: string;
  /** depth / height when a height is given. */
  fillRatio?: number;
  alt: string;
}

export function footprintDiagram(d: FootprintDiagram): string {
  const box = { x: 44, y: 34, w: 170, h: 104 };
  let shape = '';
  if (d.shape === 'circle' || d.shape === 'ring') {
    const r = 52;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (d.shape === 'ring') {
      const ri = r * clamp(d.innerRatio ?? 0.4, 0.15, 0.85);
      shape = `<circle class="dg-shape" cx="${cx}" cy="${cy}" r="${r}"/><circle class="dg-hole" cx="${cx}" cy="${cy}" r="${ri}"/>
        ${dim(cx - r, cy + r + 10, cx + r, cy + r + 10)}
        <text class="dg-text" x="${cx}" y="${cy + r + 26}" text-anchor="middle">⌀ ${esc(d.diameterLabel ?? '')}</text>
        ${dim(cx - ri, cy, cx + ri, cy)}
        <text class="dg-text dg-small" x="${cx}" y="${cy - 7}" text-anchor="middle">⌀ ${esc(d.innerLabel ?? '')}</text>`;
    } else {
      shape = `<circle class="dg-shape" cx="${cx}" cy="${cy}" r="${r}"/>
        ${dim(cx - r, cy, cx + r, cy)}
        <text class="dg-text" x="${cx}" y="${cy - 8}" text-anchor="middle">⌀ ${esc(d.diameterLabel ?? '')}</text>`;
    }
  } else {
    const ratio = clamp(d.ratio || 1, 0.5, 3);
    let w = box.w;
    let hgt = w / ratio;
    if (hgt > box.h) {
      hgt = box.h;
      w = hgt * ratio;
    }
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - hgt) / 2;
    const outline =
      d.shape === 'triangle'
        ? `<polygon class="dg-shape" points="${x},${y + hgt} ${x + w},${y + hgt} ${x + w * 0.35},${y}"/><line class="dg-clear" x1="${x + w * 0.35}" y1="${y}" x2="${x + w * 0.35}" y2="${y + hgt}"/>`
        : `<rect class="dg-shape" x="${x}" y="${y}" width="${w}" height="${hgt}" rx="2"/>`;
    shape = `${outline}
      ${dim(x, y + hgt + 12, x + w, y + hgt + 12)}
      <text class="dg-text" x="${x + w / 2}" y="${y + hgt + 28}" text-anchor="middle">${esc(d.lengthLabel ?? '')}</text>
      ${dim(x - 12, y, x - 12, y + hgt)}
      <text class="dg-text" transform="translate(${x - 20} ${y + hgt / 2}) rotate(-90)" text-anchor="middle">${esc(d.widthLabel ?? '')}</text>`;
  }
  // Side section
  const sx = 262;
  const sw = 64;
  const top = 44;
  const bottom = 132;
  const full = bottom - top;
  const fill = d.heightLabel ? full * clamp(d.fillRatio ?? 1, 0.15, 1) : full * 0.55;
  const fy = bottom - fill;
  const wall = d.heightLabel
    ? `<rect class="dg-wall" x="${sx}" y="${top}" width="${sw}" height="${full}"/>
       ${dim(sx - 10, top, sx - 10, bottom)}
       <text class="dg-text dg-small" transform="translate(${sx - 17} ${top + full / 2}) rotate(-90)" text-anchor="middle">wall ${esc(d.heightLabel)}</text>`
    : '';
  const section = `${wall}
    <rect class="dg-fill" x="${sx}" y="${fy}" width="${sw}" height="${fill}"/>
    <line class="dg-ground" x1="${sx - 6}" y1="${bottom}" x2="${sx + sw + 6}" y2="${bottom}"/>
    ${dim(sx + sw + 10, fy, sx + sw + 10, bottom)}
    <text class="dg-text" x="${sx + sw / 2}" y="${bottom + 18}" text-anchor="middle">${esc(d.depthLabel)}</text>
    <text class="dg-text dg-small" x="${sx + sw / 2}" y="${bottom + 33}" text-anchor="middle">${esc(d.depthCaption)}</text>`;
  return `<svg class="diagram" viewBox="0 0 360 176" role="img" aria-label="${esc(d.alt)}" preserveAspectRatio="xMidYMid meet">
    <text class="dg-text dg-small" x="${box.x + box.w / 2}" y="16" text-anchor="middle">Top view</text>
    <text class="dg-text dg-small" x="${sx + sw / 2}" y="16" text-anchor="middle">Side view</text>
    ${shape}${section}</svg>`;
}

export interface SpacingDiagram {
  /** Bed length (drawn left to right) and width (top to bottom), any consistent unit. */
  length: number;
  width: number;
  clearance: number;
  rowsAlongLength: boolean;
  layout: SpacingLayout;
  lengthLabel: string;
  widthLabel: string;
  alt: string;
}

export const MAX_DRAWN_PLANTS = 2500;

/** Scaled top-down plan. Proportions match the entered measurements. */
export function spacingDiagram(d: SpacingDiagram): string {
  const maxW = 600;
  const maxH = 380;
  const pad = { l: 46, r: 14, t: 14, b: 40 };
  const scale = Math.min(maxW / d.length, maxH / d.width);
  const w = d.length * scale;
  // Keep very long, thin beds visible.
  const hgt = Math.max(d.width * scale, 24);
  const sy = hgt / d.width;
  const x0 = pad.l;
  const y0 = pad.t;
  const across = axisPositions(d.layout.rowAxis);
  const full = axisPositions(d.layout.plantAxis);
  const offset = d.layout.offsetAxis ? axisPositions(d.layout.offsetAxis) : full;
  const stepPx = Math.min(d.layout.plantAxis.spacing, d.layout.rowAxis.spacing) * Math.min(scale, sy);
  const r = clamp(stepPx * 0.22, 1.2, 7);
  const draw = d.layout.total <= MAX_DRAWN_PLANTS;
  let marks = '';
  across.forEach((rowPos, i) => {
    const along = i % 2 === 1 ? offset : full;
    if (d.rowsAlongLength) {
      const y = y0 + rowPos * sy;
      marks += `<line class="dg-row" x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}"/>`;
      if (draw) for (const a of along) marks += `<circle class="dg-plant" cx="${(x0 + a * scale).toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
    } else {
      const x = x0 + rowPos * scale;
      marks += `<line class="dg-row" x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + hgt}"/>`;
      if (draw) for (const a of along) marks += `<circle class="dg-plant" cx="${x.toFixed(2)}" cy="${(y0 + a * sy).toFixed(2)}" r="${r.toFixed(2)}"/>`;
    }
  });
  const inset =
    d.clearance > 0
      ? `<rect class="dg-clear" x="${x0 + d.clearance * scale}" y="${y0 + d.clearance * sy}" width="${Math.max(0, w - 2 * d.clearance * scale)}" height="${Math.max(0, hgt - 2 * d.clearance * sy)}"/>`
      : '';
  const W = pad.l + w + pad.r;
  const H = pad.t + hgt + pad.b;
  return `<svg class="diagram diagram-plan" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" style="max-width:${Math.max(W, 280).toFixed(0)}px" role="img" aria-label="${esc(d.alt)}" preserveAspectRatio="xMidYMid meet">
    <rect class="dg-bed" x="${x0}" y="${y0}" width="${w}" height="${hgt}"/>
    ${inset}${marks}
    ${dim(x0, y0 + hgt + 12, x0 + w, y0 + hgt + 12)}
    <text class="dg-text" x="${x0 + w / 2}" y="${y0 + hgt + 30}" text-anchor="middle">${esc(d.lengthLabel)}</text>
    ${dim(x0 - 12, y0, x0 - 12, y0 + hgt)}
    <text class="dg-text" transform="translate(${x0 - 20} ${y0 + hgt / 2}) rotate(-90)" text-anchor="middle">${esc(d.widthLabel)}</text>
  </svg>`;
}

/** Two bars comparing parts of a whole, e.g. base volume and allowance. */
export function shareBar(parts: { label: string; value: number; cls: string }[], alt: string): string {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!(total > 0)) return '';
  let x = 0;
  const W = 400;
  const rects = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const w = (p.value / total) * W;
      const out = `<rect class="${p.cls}" x="${x.toFixed(2)}" y="0" width="${Math.max(w - 1.5, 0.5).toFixed(2)}" height="16" rx="2"/>`;
      x += w;
      return out;
    })
    .join('');
  const legend = parts
    .filter((p) => p.value > 0)
    .map((p) => `<li><svg width="12" height="12" aria-hidden="true"><rect class="${p.cls}" width="12" height="12" rx="2"/></svg>${esc(p.label)}</li>`)
    .join('');
  return `<div class="bar-wrap"><svg class="bar" viewBox="0 0 ${W} 16" preserveAspectRatio="none" role="img" aria-label="${esc(alt)}">${rects}</svg><ul class="bar-legend">${legend}</ul></div>`;
}

export interface TimelineRow {
  label: string;
  start: CalDate;
  end: CalDate;
  /** Tasks before the reference date are drawn differently from those after. */
  kind: 'indoors' | 'transplant' | 'direct' | 'other';
}

/** Calendar strip: one bar or marker per task, with month divisions and the reference date. */
export function timelineDiagram(rows: TimelineRow[], refs: { date: CalDate; label: string }[], monthName: (c: CalDate) => string, alt: string): string {
  const all = [...refs.map((r) => r.date), ...rows.flatMap((r) => [r.start, r.end])];
  const lo = all.reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
  const hi = all.reduce((a, b) => (compareDates(a, b) >= 0 ? a : b));
  const first = dayNumber({ y: lo.y, m: lo.m, d: 1 });
  const endMonth = hi.m === 12 ? { y: hi.y + 1, m: 1, d: 1 } : { y: hi.y, m: hi.m + 1, d: 1 };
  const last = dayNumber(endMonth);
  const labelW = 200;
  const W = 640;
  const plotW = W - labelW - 10;
  const rowH = 26;
  const top = 28;
  const plotBottom = top + rows.length * rowH + 4;
  const H = plotBottom + 8 + refs.length * 16;
  const x = (c: CalDate | number) => labelW + ((typeof c === 'number' ? c : dayNumber(c)) - first) / (last - first) * plotW;
  let grid = '';
  let cur = { y: lo.y, m: lo.m, d: 1 };
  const months = Math.round((last - first) / 30.4);
  let i = 0;
  while (dayNumber(cur) < last) {
    const next = cur.m === 12 ? { y: cur.y + 1, m: 1, d: 1 } : { y: cur.y, m: cur.m + 1, d: 1 };
    const cx = x(cur);
    grid += `<line class="tl-grid" x1="${cx.toFixed(1)}" y1="${top - 6}" x2="${cx.toFixed(1)}" y2="${plotBottom}"/>`;
    if (months <= 12 || i % Math.ceil(months / 12) === 0) grid += `<text class="dg-text dg-small" x="${(cx + 3).toFixed(1)}" y="${top - 12}">${esc(monthName(cur))}</text>`;
    cur = next;
    i++;
  }
  const bars = rows
    .map((r, n) => {
      const y = top + n * rowH;
      const a = x(r.start);
      const b = x(dayNumber(r.end) + 1);
      const label = r.label.length > 30 ? `${r.label.slice(0, 29)}…` : r.label;
      return `<text class="dg-text dg-small tl-label" x="${labelW - 8}" y="${y + 15}" text-anchor="end">${esc(label)}</text>
        <rect class="tl-bar tl-${r.kind}" x="${a.toFixed(1)}" y="${y + 4}" width="${Math.max(b - a, 5).toFixed(1)}" height="14" rx="3"/>`;
    })
    .join('');
  const marks = refs
    .map((r, k) => {
      const rx = x(r.date);
      const ly = plotBottom + 14 + k * 16;
      const anchor = rx > labelW + plotW * 0.6 ? 'end' : 'start';
      const tx = anchor === 'end' ? rx - 4 : rx + 4;
      return `<line class="tl-ref" x1="${rx.toFixed(1)}" y1="${top - 6}" x2="${rx.toFixed(1)}" y2="${ly - 10}"/>
        <text class="dg-text dg-small" x="${tx.toFixed(1)}" y="${ly}" text-anchor="${anchor}">${esc(r.label)}</text>`;
    })
    .join('');
  return `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" preserveAspectRatio="xMidYMid meet">
    ${grid}${bars}${marks}
  </svg>`;
}
