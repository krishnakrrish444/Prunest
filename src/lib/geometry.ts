// Shared footprint geometry. All lengths in metres, areas in square metres.

export type Shape = 'rect' | 'circle' | 'triangle' | 'ring';

export interface Footprint {
  shape: Shape;
  /** Rectangle: length. Triangle: base. */
  length?: number;
  /** Rectangle: width. Triangle: height measured at a right angle to the base. */
  width?: number;
  /** Circle: diameter. Ring: outer diameter. */
  diameter?: number;
  /** Ring only: diameter of the uncovered middle. */
  inner?: number;
}

export function footprintArea(f: Footprint): number {
  switch (f.shape) {
    case 'circle': {
      const r = (f.diameter ?? NaN) / 2;
      return Math.PI * r * r;
    }
    case 'ring': {
      const R = (f.diameter ?? NaN) / 2;
      const r = (f.inner ?? NaN) / 2;
      return Math.PI * (R * R - r * r);
    }
    case 'triangle':
      return ((f.length ?? NaN) * (f.width ?? NaN)) / 2;
    default:
      return (f.length ?? NaN) * (f.width ?? NaN);
  }
}
