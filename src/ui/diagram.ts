// SVG diagrams. Shapes are labelled with the visitor's own measurements; the
// labels are authoritative, the drawing is only a guide.
import { axisPositions, type SpacingLayout } from '../lib/spacing';
import { esc } from './kit';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface FootprintDiagram {
  shape: 'rect' | 'circle';
  /** length / width, used only to give the rectangle a believable outline. */
  ratio: number;
  lengthLabel?: string;
  widthLabel?: string;
  diameterLabel?: string;
  depthLabel: string;
  /** e.g. "Soil to add" or "Mulch depth". */
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
  if (d.shape === 'circle') {
    const r = 52;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    shape = `<circle class="dg-shape" cx="${cx}" cy="${cy}" r="${r}"/>
      <line class="dg-dim" x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}"/>
      <text class="dg-text" x="${cx}" y="${cy - 8}" text-anchor="middle">⌀ ${esc(d.diameterLabel ?? '')}</text>`;
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
    shape = `<rect class="dg-shape" x="${x}" y="${y}" width="${w}" height="${hgt}" rx="2"/>
      <line class="dg-dim" x1="${x}" y1="${y + hgt + 12}" x2="${x + w}" y2="${y + hgt + 12}"/>
      <text class="dg-text" x="${x + w / 2}" y="${y + hgt + 28}" text-anchor="middle">${esc(d.lengthLabel ?? '')}</text>
      <line class="dg-dim" x1="${x - 12}" y1="${y}" x2="${x - 12}" y2="${y + hgt}"/>
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
       <line class="dg-dim" x1="${sx - 10}" y1="${top}" x2="${sx - 10}" y2="${bottom}"/>
       <text class="dg-text dg-small" transform="translate(${sx - 16} ${top + full / 2}) rotate(-90)" text-anchor="middle">wall ${esc(d.heightLabel)}</text>`
    : '';
  const section = `${wall}
    <rect class="dg-fill" x="${sx}" y="${fy}" width="${sw}" height="${fill}"/>
    <line class="dg-ground" x1="${sx - 6}" y1="${bottom}" x2="${sx + sw + 6}" y2="${bottom}"/>
    <line class="dg-dim" x1="${sx + sw + 10}" y1="${fy}" x2="${sx + sw + 10}" y2="${bottom}"/>
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
  // Keep very long, thin beds visible.
  const w = d.length * scale;
  const hgt = Math.max(d.width * scale, 24);
  const sy = hgt / d.width;
  const x0 = pad.l;
  const y0 = pad.t;
  const along = axisPositions(d.layout.plantAxis);
  const across = axisPositions(d.layout.rowAxis);
  const xs = (d.rowsAlongLength ? along : across).map((v) => x0 + v * scale);
  const ys = (d.rowsAlongLength ? across : along).map((v) => y0 + v * sy);
  const stepPx = Math.min(d.layout.plantAxis.spacing, d.layout.rowAxis.spacing) * Math.min(scale, sy);
  const r = clamp(stepPx * 0.22, 1.2, 7);
  let marks = '';
  if (d.rowsAlongLength) {
    marks += ys.map((y) => `<line class="dg-row" x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}"/>`).join('');
  } else {
    marks += xs.map((x) => `<line class="dg-row" x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + hgt}"/>`).join('');
  }
  if (d.layout.total <= MAX_DRAWN_PLANTS) {
    for (const y of ys) for (const x of xs) marks += `<circle class="dg-plant" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
  }
  const inset =
    d.clearance > 0
      ? `<rect class="dg-clear" x="${x0 + d.clearance * scale}" y="${y0 + d.clearance * sy}" width="${Math.max(0, w - 2 * d.clearance * scale)}" height="${Math.max(0, hgt - 2 * d.clearance * sy)}"/>`
      : '';
  const W = pad.l + w + pad.r;
  const H = pad.t + hgt + pad.b;
  return `<svg class="diagram diagram-plan" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" style="max-width:${Math.max(W, 280).toFixed(0)}px" role="img" aria-label="${esc(d.alt)}" preserveAspectRatio="xMidYMid meet">
    <rect class="dg-bed" x="${x0}" y="${y0}" width="${w}" height="${hgt}"/>
    ${inset}${marks}
    <line class="dg-dim" x1="${x0}" y1="${y0 + hgt + 12}" x2="${x0 + w}" y2="${y0 + hgt + 12}"/>
    <text class="dg-text" x="${x0 + w / 2}" y="${y0 + hgt + 30}" text-anchor="middle">${esc(d.lengthLabel)}</text>
    <line class="dg-dim" x1="${x0 - 12}" y1="${y0}" x2="${x0 - 12}" y2="${y0 + hgt}"/>
    <text class="dg-text" transform="translate(${x0 - 20} ${y0 + hgt / 2}) rotate(-90)" text-anchor="middle">${esc(d.widthLabel)}</text>
  </svg>`;
}
