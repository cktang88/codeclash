import { describe, expect, it } from 'vitest';
import { dirFor, projX, projY, screenDir, unproject } from './iso.ts';

describe('iso projection', () => {
  it('unproject inverts projX/projY', () => {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [123.5, -40], [900, 600], [-17, 333]] as const) {
      const [ux, uy] = unproject(projX(x, y), projY(x, y));
      expect(ux).toBeCloseTo(x, 9);
      expect(uy).toBeCloseTo(y, 9);
    }
  });

  it('screenDir matches the projection of a vector', () => {
    const [sx, sy] = screenDir(3, -2);
    expect(sx * 1.15).toBeCloseTo(projX(3, -2), 9);
    expect(sy * 1.15).toBeCloseTo(projY(3, -2), 9);
  });

  it('army 0 advancing (+x) faces SE, army 1 (-x) faces NW', () => {
    expect(dirFor(1, 0, 0)).toBe(0);
    expect(dirFor(-1, 0, 0)).toBe(2);
  });

  it('keeps the old facing near a quadrant edge, and a zero vector keeps it too', () => {
    // A vector straight along the screen horizontal (sy = 0) to the right: SE or NE are both fair.
    const [ex, ey] = unproject(1, 0);
    expect(dirFor(ex, ey + 1e-3, 3)).toBe(3);
    expect(dirFor(ex, ey - 1e-3, 0)).toBe(0);
    expect(dirFor(0, 0, 1)).toBe(1);
  });
});
