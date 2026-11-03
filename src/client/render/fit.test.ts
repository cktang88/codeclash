import { describe, expect, it } from 'vitest';
import { frameBox, MIN_SCALE, NO_INSETS, zoomOutScale } from './fit.ts';

// About the v7 grand deployment in map px (1,650 × 800 with the figures' heights).
const box = { x0: 100, y0: 200, x1: 1750, y1: 1000 };
const hud = { top: 140, bottom: 70, left: 0, right: 0 };

describe('frameBox', () => {
  it('keeps zoom 1 where the armies fit clear of the HUD (2560 × 1283)', () => {
    const f = frameBox(box, 2560, 1283, hud, 1)!;
    expect(f.zoom).toBe(1);
    // The box's centre sits at the centre of the clear part: (140 - 70) / 2 px below the canvas's.
    expect(f.mx).toBeCloseTo(925, 9);
    expect(f.my).toBeCloseTo(600 - 35, 9);
  });

  it('zooms out below 1 just enough, on a 1080p and a 1440 × 900 canvas', () => {
    for (const [W, H] of [[1920, 923], [1440, 743]] as const) {
      const f = frameBox(box, W, H, hud, 1)!;
      expect(f.zoom).toBeLessThan(1);
      const s = zoomOutScale(f.zoom, 1, W, H);
      // It fits the clear part...
      expect((box.x1 - box.x0) * s).toBeLessThanOrEqual(W);
      expect((box.y1 - box.y0) * s).toBeLessThanOrEqual(H - hud.top - hud.bottom);
      // ...on a sixteenth of a pixel, the largest that does.
      expect(s * 16).toBe(Math.round(s * 16));
      expect((box.y1 - box.y0) * (s + 1 / 16)).toBeGreaterThan(H - hud.top - hud.bottom);
      // Every edge of the box lands inside the canvas, clear of the HUD.
      const top = H / 2 + (box.y0 - f.my) * s;
      const bottom = H / 2 + (box.y1 - f.my) * s;
      const left = W / 2 + (box.x0 - f.mx) * s;
      const right = W / 2 + (box.x1 - f.mx) * s;
      expect(top).toBeGreaterThanOrEqual(hud.top - 1e-6);
      expect(bottom).toBeLessThanOrEqual(H - hud.bottom + 1e-6);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(W);
    }
  });

  it('prefers whole pixels: a 2x zoom 1 that is too big steps down to 1x, not 1.6x', () => {
    const f = frameBox(box, 3000, 1500, NO_INSETS, 2)!;
    expect(zoomOutScale(f.zoom, 2, 3000, 1500)).toBe(1);
  });

  it('never goes below half scale (a phone shows what it can)', () => {
    const f = frameBox(box, 585, 974, hud, 1)!;
    expect(zoomOutScale(f.zoom, 1, 585, 974)).toBe(MIN_SCALE);
  });

  it('gives no view for an empty field or a collapsed canvas (no NaN camera)', () => {
    expect(frameBox(null, 1920, 923, hud, 1)).toBeNull();
    expect(frameBox({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, 1920, 923, hud, 1)).toBeNull();
    expect(frameBox(box, 0, 0, hud, 1)).toBeNull();
    const f = frameBox({ x0: 10, y0: 10, x1: 11, y1: 11 }, 1920, 923, hud, 1)!;
    expect(Number.isFinite(f.mx) && Number.isFinite(f.my) && f.zoom === 1).toBe(true);
  });
});

describe('zoomOutScale', () => {
  it('is whole down to 1, then sixteenths, and keeps the buffer renderable', () => {
    expect(zoomOutScale(0.5, 3, 4000, 2000)).toBe(1);
    expect(zoomOutScale(2 / 3, 3, 4000, 2000)).toBe(2);
    expect(zoomOutScale(0.8125, 1, 1920, 923)).toBe(0.8125);
    expect(zoomOutScale(0.3, 1, 1920, 923)).toBe(MIN_SCALE);
    // A 3000 px wide canvas at 0.5 would need a 6000 px buffer.
    expect(zoomOutScale(0.5, 1, 3000, 900) * 4096).toBeGreaterThanOrEqual(3000);
  });
});
