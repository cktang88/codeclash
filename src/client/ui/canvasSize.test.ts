import { describe, expect, it } from 'vitest';
import { canvasSize } from './canvasSize.ts';

describe('canvasSize', () => {
  it('takes every device pixel up to 2x screens', () => {
    expect(canvasSize(1800, 929, 1.25)).toMatchObject({ w: 1800, h: 929, k: 1 });
    expect(canvasSize(2880, 1487, 2)).toMatchObject({ w: 2880, h: 1487, k: 1 });
    expect(canvasSize(1800, 929, 1.25).cssW).toBeCloseTo(1440, 9);
  });

  it('shows each canvas pixel as a whole number of device pixels on a 3x phone', () => {
    const s = canvasSize(1170, 1949, 3);
    expect(s.k).toBe(2);
    expect(s).toMatchObject({ w: 585, h: 974 });
    // The CSS size covers exactly w·k by h·k device px.
    expect(s.cssW * 3).toBeCloseTo(1170, 9);
    expect(s.cssH * 3).toBeCloseTo(1948, 9);
  });

  it('never collapses to zero, and survives a bad ratio', () => {
    expect(canvasSize(0, 0, 1)).toMatchObject({ w: 1, h: 1 });
    expect(canvasSize(100, 50, NaN)).toMatchObject({ w: 100, h: 50, k: 1 });
  });
});
