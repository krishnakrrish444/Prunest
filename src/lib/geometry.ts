// Shared footprint geometry. All lengths in metres, areas in square metres.

export type Shape = 'rect' | 'circle';

export interface Footprint {
  shape: Shape;
  /** Rectangle only. */
  length?: number;
  /** Rectangle only. */
  width?: number;
  /** Circle only. */
  diameter?: number;
}

export function footprintArea(f: Footprint): number {
  if (f.shape === 'circle') {
    const r = (f.diameter ?? NaN) / 2;
    return Math.PI * r * r;
  }
  return (f.length ?? NaN) * (f.width ?? NaN);
}
