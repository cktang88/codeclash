import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../sim/api.ts';
import { MAX_ZOOM, MIN_ZOOM, zoomFloor } from './camera.ts';
import { dayPhase, daylightAt } from './daylight.ts';
import { declutter, overlapping, type DeclutterBox } from './declutter.ts';
import { clampShift, clipScroll } from './fx/scrollfit.ts';
import { pruneLru, touch } from './lru.ts';
import { KNOCK_OUT, hitstopMs, knockCurve, knockDistance, knockMs } from './impact.ts';

const box = (x: number, y: number): DeclutterBox => ({ x, y, w: 54, h: 34, cx: 6, cy: -6, ox: 0, oy: 0 });

describe('declutter (far-zoom tokens)', () => {
  it('leaves lone tokens exactly where their platoons are', () => {
    const boxes = [box(0, 0), box(200, 0), box(0, 200)];
    declutter(boxes);
    for (const b of boxes) expect([b.ox, b.oy]).toEqual([0, 0]);
  });

  it('pulls apart a pile of tokens on one spot within a few frames', () => {
    const boxes = Array.from({ length: 12 }, (_, i) => box(100 + (i % 3), 100));
    for (let frame = 0; frame < 30; frame++) declutter(boxes);
    expect(overlapping(boxes, 1.5)).toBe(false);
    // Stacked as a column: the crowd keeps roughly its x.
    for (const b of boxes) expect(Math.abs(b.ox)).toBeLessThan(60);
  });

  it('settles a dense front line without overlaps and stays put frame to frame', () => {
    const boxes = Array.from({ length: 40 }, (_, i) => box((i * 37) % 300, ((i * 53) % 120) * 0.5));
    for (let frame = 0; frame < 60; frame++) declutter(boxes);
    expect(overlapping(boxes, 1.5)).toBe(false);
    const before = boxes.map((b) => [b.ox, b.oy]);
    declutter(boxes);
    boxes.forEach((b, i) => {
      expect(Math.abs(b.ox - before[i]![0]!)).toBeLessThan(8);
      expect(Math.abs(b.oy - before[i]![1]!)).toBeLessThan(8);
    });
  });

  it('drifts a token home once its neighbour has gone', () => {
    const a = box(0, 0);
    const b = box(0, 0);
    for (let f = 0; f < 10; f++) declutter([a, b]);
    expect(Math.hypot(a.ox, a.oy)).toBeGreaterThan(5);
    for (let f = 0; f < 80; f++) declutter([a]);
    expect(Math.hypot(a.ox, a.oy)).toBeLessThan(0.1);
  });

  it('survives NaN offsets', () => {
    const a = { ...box(0, 0), ox: NaN, oy: NaN };
    declutter([a, box(0, 0)]);
    expect(Number.isFinite(a.ox) && Number.isFinite(a.oy)).toBe(true);
  });
});

describe('flag cache LRU', () => {
  it('frees the least recently used first and never one in use', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 10; i++) m.set(`f${i}`, i);
    touch(m, 'f0', 0); // f0 was just drawn again
    const freed: number[] = [];
    const n = pruneLru(m, 6, (v) => v === 1, (v) => freed.push(v));
    expect(n).toBe(4);
    expect(freed).toEqual([2, 3, 4, 5]);
    expect([...m.keys()]).toEqual(['f1', 'f6', 'f7', 'f8', 'f9', 'f0']);
  });

  it('keeps everything when all of it is on screen', () => {
    const m = new Map([['a', 1], ['b', 2]]);
    expect(pruneLru(m, 0, () => true, () => undefined)).toBe(0);
    expect(m.size).toBe(2);
  });
});

describe('the hour', () => {
  const live = { replay: false, war: { id: 7, startsAt: 1_000_000, endsAt: 1_000_000 + 24 * 3600_000 } } as unknown as Parameters<typeof dayPhase>[0];

  it('follows the war clock (the sim tick), not the wall clock', () => {
    const ticks = (h: number) => (h * 3600_000) / TICK_MS;
    expect(dayPhase(live, 0)).toBe(0);
    expect(dayPhase(live, ticks(12))).toBeCloseTo(0.5, 6);
    expect(dayPhase(live, ticks(30))).toBeLessThan(1);
  });

  it('never returns NaN, and a NaN phase still grades the world', () => {
    expect(Number.isFinite(dayPhase(live, NaN))).toBe(true);
    const l = daylightAt(NaN);
    expect(Number.isFinite(l.mult) && Number.isFinite(l.screen) && Number.isFinite(l.lights)).toBe(true);
  });

  it('paints dusk crimson: red leads, and blue does not trail green (no sepia)', () => {
    const { mult } = daylightAt(0.78);
    const r = (mult >> 16) & 255;
    const g = (mult >> 8) & 255;
    const b = mult & 255;
    expect(r).toBeGreaterThan(g + 20);
    expect(b).toBeGreaterThanOrEqual(g - 4);
    // Greens survive: the wash never drags the green channel into mud.
    expect(g).toBeGreaterThan(0xc8);
  });
});

describe('camera zoom floor', () => {
  it('scales with the map and the screen, inside the hard limits', () => {
    const z = zoomFloor(1000, 1280, 800);
    expect(z).toBeGreaterThan(MIN_ZOOM);
    expect(z).toBeLessThan(800 / 2250);
    expect(zoomFloor(1, 4000, 4000)).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('falls back to the hard floor before a map or screen is known', () => {
    expect(zoomFloor(0, 1280, 800)).toBe(MIN_ZOOM);
    expect(zoomFloor(1000, 0, 0)).toBe(MIN_ZOOM);
    expect(zoomFloor(NaN, 1280, 800)).toBe(MIN_ZOOM);
  });
});

describe("herald's scroll fitting", () => {
  it('cuts long commit messages with an ellipsis and leaves short ones be', () => {
    expect(clipScroll('fix: typo', 64)).toBe('fix: typo');
    const long = clipScroll('x'.repeat(200), 64);
    expect(long.length).toBe(64);
    expect(long.endsWith('…')).toBe(true);
    expect(clipScroll('a\n\n  b', 64)).toBe('a b');
  });

  it('nudges a box back inside the open screen, or centres one too big for it', () => {
    expect(clampShift(10, 100, 8, 382)).toBe(0);
    expect(clampShift(300, 420, 8, 382)).toBe(-38);
    expect(clampShift(-50, 60, 8, 382)).toBe(58);
    expect(clampShift(0, 500, 8, 382)).toBe(-55);
  });
});

describe('combat impact (render-only knockback)', () => {
  it('shoves light soldiers further than heavy ones, and heavy blows further than light ones', () => {
    expect(knockDistance(0.2, 1, 6)).toBeGreaterThan(knockDistance(0.2, 1, 13));
    expect(knockDistance(0.2, 2.2, 6)).toBeGreaterThan(knockDistance(0.2, 1, 6));
    expect(knockDistance(0.05, 1, 22)).toBeLessThan(1);
  });

  it('stays within a few world units, and never NaN', () => {
    for (const share of [0, 0.01, 0.3, 1, 5, Number.NaN]) {
      for (const size of [5, 6, 13, 22]) {
        const d = knockDistance(share, 2.2, size);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0.6);
        expect(d).toBeLessThanOrEqual(12);
      }
    }
  });

  it('pushes out fast, peaks, and eases home to exactly the sim position', () => {
    expect(knockCurve(0)).toBe(0);
    expect(knockCurve(KNOCK_OUT)).toBeCloseTo(1, 5);
    expect(knockCurve(KNOCK_OUT * 0.5)).toBeGreaterThan(0.7);
    expect(knockCurve(0.6)).toBeLessThan(1);
    expect(knockCurve(0.999)).toBeLessThan(0.001);
    expect(knockCurve(1)).toBe(0);
    expect(knockCurve(Number.NaN)).toBe(0);
  });

  it('holds melee hitstop to 40-100 ms and the shove to 150-250 ms', () => {
    expect(hitstopMs(0, false)).toBe(40);
    expect(hitstopMs(10, true)).toBe(100);
    expect(knockMs(0)).toBe(150);
    expect(knockMs(1)).toBe(250);
  });
});

describe('levels of detail', () => {
  it('switches to far below FAR_IN and back only above FAR_OUT, fading over FADE_MS', async () => {
    const { initialLod, stepLod, FAR_IN, FAR_OUT, FADE_MS } = await import('./lod.ts');
    const s = initialLod(1);
    expect(s.far).toBe(false);
    stepLod(s, (FAR_IN + FAR_OUT) / 2, 16);
    expect(s.far).toBe(false);
    stepLod(s, FAR_IN - 0.01, FADE_MS / 2);
    expect(s.far).toBe(true);
    expect(s.farMix).toBeCloseTo(0.5);
    // Inside the band the level holds: no flicker for a camera resting near the threshold.
    stepLod(s, (FAR_IN + FAR_OUT) / 2, FADE_MS);
    expect(s.far).toBe(true);
    expect(s.farMix).toBe(1);
    stepLod(s, FAR_OUT + 0.01, 1);
    expect(s.far).toBe(false);
    expect(stepLod(s, FAR_OUT + 0.01, 0, true).farMix).toBe(0);
  });

  it('lays a block over its soldiers, along its line, sized by their spread and capped by headcount', async () => {
    const { blockShape, resetAcc, addToAcc } = await import('./blocks.ts');
    const { Form, pitch } = await import('../../sim/formation.ts');
    const a = {} as import('./blocks.ts').BlockAcc;
    const g = pitch(0);
    resetAcc(a, 1, 0, 0, 100, 100);
    // Two ranks of four Footmen a pitch apart, facing +x.
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) addToAcc(a, 100 - r * g, 100 + c * g);
    const out = { x: 0, y: 0, ax: 0, ay: 0, length: 0, width: 0 };
    blockShape(a, { form: Form.Line, hx: 1, hy: 0 }, out);
    expect(out.ax).toBe(1);
    expect(out.x).toBeCloseTo(100 - g / 2);
    expect(out.y).toBeCloseTo(100 + 1.5 * g);
    // Two pitches deep and four wide.
    expect(out.length).toBeCloseTo(2 * g);
    expect(out.width).toBeCloseTo(4 * g);
    // In column the block follows its soldiers' own road, whatever the banner's heading.
    resetAcc(a, 1, 0, 0, 0, 0);
    for (let i = 0; i < 6; i++) addToAcc(a, 0, -i * g);
    blockShape(a, { form: Form.Column, hx: 1, hy: 0 }, out);
    expect(Math.abs(out.ay)).toBeCloseTo(1);
    // Scattered far and wide, three soldiers still make a small block.
    resetAcc(a, 1, 0, 0, 0, 0);
    for (const [x, y] of [[0, 0], [300, 0], [0, 300]]) addToAcc(a, x!, y!);
    blockShape(a, { form: Form.Engaged, hx: 1, hy: 0 }, out);
    expect(out.length * out.width).toBeLessThanOrEqual(2.2 * 3 * g * g + 1e-6);
  });
});
