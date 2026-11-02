// HD ground, one per faction, at twice the classic density over the 1280×720 frame: the
// commandery's grass, earth and wheat; the castle town's raked gravel, rice paddies and moat; the
// necropolis's dead turf, ash and grave fields. Clean clusters of 3-4 tones per material and a few
// deliberate tufts, never per-pixel static. Painted a band of rows at a time (a generator), so a
// level change repaints it over a few frames instead of stalling one.

import type { BuildingKey } from '../../../game/city.ts';
import { GATE_V, LOT, tierOf, WALL, type Art } from './buildings.ts';
import { FIELDS, GARDEN, PADDOCK, type Ground } from './ground.ts';
import { box, hash, hex, mix, post, Px, tone, v3, type Col, type Frame } from './pixels.ts';
import { roadDistance } from './roads.ts';
import type { CityStyle } from './style.ts';

const inRect = (u: number, v: number, r: [number, number, number, number], m = 0) => u >= r[0] - m && u < r[2] + m && v >= r[1] - m && v < r[3] + m;

/** Everything the ground depends on, so it is repainted only when one of these changes. */
export function groundKey(st: CityStyle, levels: Record<BuildingKey, number>, maxLevel: number): string {
  const tiers = (Object.keys(levels) as BuildingKey[]).sort().map((k) => tierOf(levels[k]));
  return [st.id, tiers.join(''), tierOf(Math.max(maxLevel, 1)), sownOf(levels), levels.stables > 0 ? 1 : 0].join('|');
}

export const sownOf = (levels: Record<BuildingKey, number>) => Math.min(FIELDS.length, 1 + Math.floor(levels.granary / 3));

interface Pal {
  grass: Col[];
  earth: Col[];
  road: Col[];
  flags: Col[];
  soil: Col;
  tuft: Col[];
}

function palette(id: string): Pal {
  if (id === 'samurai')
    return {
      grass: [hex('#5d6a3e'), hex('#53603a'), hex('#687546'), hex('#48542f')],
      earth: [hex('#a59576'), hex('#988869'), hex('#b2a283'), hex('#8a7a5e')],
      road: [hex('#8f8064'), hex('#9a8b6e'), hex('#827358')],
      flags: [hex('#9d978a'), hex('#8f897c'), hex('#aaa496')],
      soil: hex('#4f4232'),
      tuft: [hex('#7a8a4c'), hex('#3f4a2a')],
    };
  if (id === 'undead')
    return {
      grass: [hex('#4f4f3e'), hex('#46473a'), hex('#5a5946'), hex('#3c3d33')],
      earth: [hex('#4c4640'), hex('#433e39'), hex('#57514a'), hex('#3a3531')],
      road: [hex('#5f5a55'), hex('#68625c'), hex('#544f4b')],
      flags: [hex('#6e6a68'), hex('#625e5d'), hex('#7a7674')],
      soil: hex('#2f2924'),
      tuft: [hex('#6a6a50'), hex('#2e3028')],
    };
  return {
    grass: [hex('#59613a'), hex('#4f5833'), hex('#646b40'), hex('#454d2e')],
    earth: [hex('#6b5b42'), hex('#62533c'), hex('#736248'), hex('#584a35')],
    road: [hex('#7b6a4e'), hex('#857356'), hex('#6e5e45')],
    flags: [hex('#8f8676'), hex('#857c6c'), hex('#999080')],
    soil: hex('#4e3d2a'),
    tuft: [hex('#737a46'), hex('#3f472a')],
  };
}

/** The level-independent ground (grass, earth, flagstones, roads, the yard, tufts), per faction. */
const STATIC = new Map<string, Uint32Array>();

function* staticGround(id: string, frame: Frame): Generator<void, Uint32Array> {
  const key = `${id}:${frame.w}x${frame.h}:${frame.k}`;
  const done = STATIC.get(key);
  if (done) return done;
  const px = new Px(frame.w, frame.h, frame);
  const P = palette(id);
  const k = frame.k;
  // The per-pixel work lives in a plain function (V8 optimises it; generators it does not).
  const paintRow = (y: number): void => {
    const b = 2 * ((y + 0.5) / k - frame.my - 30);
    for (let x = 0; x < frame.w; x++) {
      const a = (x + 0.5) / k - frame.mx - 256;
      const u = (a + b) / 2;
      const v = (b - a) / 2;
      // Clusters: tone chosen per 4×2-pixel cell with a little drift, so it reads as sod, not static.
      const cell = hash(x >> 2, y >> 1, 5);
      const big = hash(x >> 4, y >> 3, 6);
      const inside = u > 2 && v > 2 && u < WALL - 2 && v < WALL - 2;
      let c: Col;
      if (inside) {
        const edge = Math.min(u, v, WALL - u, WALL - v);
        c = P.earth[cell < 0.55 ? 0 : cell < 0.8 ? 1 : cell < 0.93 ? 2 : 3]!;
        if (edge < 14 && big < 0.6 - edge / 30) c = P.grass[Math.floor(cell * 3)]!;
      } else {
        c = P.grass[cell < 0.5 ? 0 : cell < 0.75 ? 1 : cell < 0.92 ? 2 : 3]!;
        if (big < 0.22) c = tone(c, 0.05);
        if (big > 0.88) c = tone(c, -0.04);
      }
      // Flagstones before the keep and the chapel.
      if ((u > 56 && u < 80 && v > 22 && v < 60) || (u > 76 && u < 142 && v > 46 && v < 60)) {
        const fu = Math.floor(u / 5);
        const fv = Math.floor(v / 4);
        c = P.flags[Math.floor(hash(fu, fv) * P.flags.length)]!;
        if (u % 5 < 0.5 || v % 4 < 0.5) c = tone(c, 0.28);
        else if (u % 5 < 1 || v % 4 < 1) c = tone(c, -0.08);
      }
      // Roads, with wheel ruts (the necropolis's are a bone-grey cobble).
      const rd = roadDistance(u, v);
      if (rd < 5.5) {
        c = P.road[Math.floor(cell * P.road.length)]!;
        if (id === 'undead' && (Math.floor(u * 0.8) + Math.floor(v * 0.8)) % 3 === 0 && rd < 4.5) c = tone(c, 0.18);
        if (Math.abs(rd - 2.6) < 0.35) c = tone(c, 0.16);
        if (rd > 4.6) c = mix(c, P.earth[0]!, 0.5);
      }
      // The yard: well-beaten earth where the recruits drill.
      if (u > 84 && u < 150 && v > 70 && v < 150 && rd > 5) c = mix(c, P.road[2]!, 0.3);
      px.set(x, y, c);
    }
  };
  for (let y = 0; y < frame.h; y++) {
    paintRow(y);
    if (y % 24 === 23) yield;
  }
  // Tufts: small deliberate clumps of 3-5 pixels in the grass (not inside, not on roads).
  const [li, dk] = P.tuft;
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(hash(i, 1, 77) * frame.w);
    const y = Math.floor(hash(i, 2, 77) * frame.h);
    const [u, v] = px.ground(x, y);
    if (u > -2 && v > -2 && u < WALL + 2 && v < WALL + 2) continue;
    if (roadDistance(u, v) < 7) continue;
    if (FIELDS.some((f) => inRect(u, v, f, 2))) continue;
    px.set(x, y, li!);
    px.set(x + 1, y - 1, li!);
    px.set(x + 2, y, li!);
    px.set(x + 1, y, dk!);
    if (id === 'samurai' && i % 9 === 0) px.set(x + 1, y - 2, hex('#e8a8b8'));
    if (id === 'undead' && i % 11 === 0) px.set(x + 1, y - 2, hex('#cfc6aa'));
  }
  STATIC.set(key, px.data);
  return px.data;
}

/**
 * The ground for one faction, a band of rows per step: the cached static ground, then only the
 * parts that depend on the levels (fields, the herb garden, the paddock, building shadows, the
 * walls' shadow and the moat), each over its own patch of pixels.
 */
export function* groundSteps(st: CityStyle, levels: Record<BuildingKey, number>, maxLevel: number, frame: Frame): Generator<void, Ground> {
  const id = st.id;
  const stat = yield* staticGround(id, frame);
  const px = new Px(frame.w, frame.h, frame);
  px.data.set(stat);
  px.set(0, 0, stat[0]!);
  px.set(frame.w - 1, frame.h - 1, stat[stat.length - 1]!);
  const data = px.data;
  const W = frame.w;
  const P = palette(id);
  const sown = sownOf(levels);
  const wallsT = tierOf(levels.walls);
  const ht = tierOf(levels.hospital);
  const water = [hex('#6f8a8c'), hex('#5f7a7e'), hex('#86a0a0'), hex('#4f686e')];
  const moatW = id === 'undead' ? [hex('#2d3a30'), hex('#26322a'), hex('#3a4a3a'), hex('#1e2822')] : water;
  const herbs =
    id === 'undead'
      ? [hex('#5a3e6a'), hex('#3e4a3a'), hex('#6a5a7a'), hex('#46523e'), hex('#4a3a52'), hex('#56603e')]
      : [hex('#7a6aa0'), hex('#5f7a4a'), hex('#c9883a'), hex('#4f6a5a'), hex('#a8b070'), hex('#9a5a7a')];
  const wheat = hex('#8c7a3a');
  /** Visit the pixels over a ground rectangle; fn gets the pixel index, the world point and a cluster value. */
  const region = (u0: number, v0: number, u1: number, v1: number, fn: (i: number, u: number, v: number, cell: number, x: number, y: number) => void) => {
    const xs = [px.X(u0, v0), px.X(u1, v0), px.X(u0, v1), px.X(u1, v1)];
    const ys = [px.Y(u0, v0), px.Y(u1, v0), px.Y(u0, v1), px.Y(u1, v1)];
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(frame.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const [u, v] = px.ground(x, y);
        if (u < u0 || u >= u1 || v < v0 || v >= v1) continue;
        fn(y * W + x, u, v, hash(x >> 2, y >> 1, 5), x, y);
      }
    }
  };
  // Fields: wheat, rice paddies or grave plots.
  for (let fi = 0; fi < FIELDS.length; fi++) {
    const f = FIELDS[fi]!;
    const Wf = f[2] - f[0];
    const Hf = f[3] - f[1];
    region(f[0], f[1], f[2], f[3], (i, u, v, cell) => {
      const lu = u - f[0];
      const lv = v - f[1];
      let c: Col;
      if (id === 'samurai') {
        // Paddies: flooded plots split by earth bunds (aze); fallow ones are mud.
        const bu = lu % (Wf / 2);
        const bv = lv % (Hf / 2);
        const bund = bu < 1.4 || bv < 1.4 || lu > Wf - 1.4 || lv > Hf - 1.4;
        if (bund) c = bu < 0.7 || bv < 0.7 ? P.grass[2]! : P.grass[0]!;
        else if (fi < sown) {
          c = water[cell < 0.62 ? 0 : cell < 0.9 ? 1 : 2]!;
          if (hash(Math.floor(lu / 7), Math.floor(lv / 3), 21) > 0.95) c = water[2]!;
        } else c = mix(P.soil, water[1]!, cell < 0.7 ? 0.3 : 0.4);
      } else if (id === 'undead') {
        // Grave plots in rows; unworked plots are bare turned earth.
        c = cell < 0.6 ? P.soil : mix(P.soil, P.earth[1]!, 0.3);
        if (fi < sown) {
          const gu = lu % 6;
          const gv = lv % 8;
          if (gu > 1.2 && gu < 5 && gv > 1 && gv < 3.6) c = gu < 2 || gv < 1.6 ? tone(P.earth[2]!, -0.05) : P.earth[3]!;
        } else if (Math.floor(lv) % 3 === 0) c = tone(P.soil, 0.15);
        if (lu < 1 || lv < 1 || lu > Wf - 1 || lv > Hf - 1) c = tone(P.grass[1]!, 0.12);
      } else {
        if (fi < sown) c = Math.floor(v) % 3 === 0 ? tone(P.soil, 0.1) : mix(wheat, P.soil, 0.35 + cell * 0.2);
        else c = Math.floor(v) % 3 === 0 ? tone(P.soil, 0.2) : mix(P.soil, P.grass[0]!, cell * 0.3);
        if (lu < 1 || lv < 1 || lu > Wf - 1 || lv > Hf - 1) c = tone(P.grass[1]!, 0.1);
      }
      data[i] = c;
    });
    yield;
  }
  // Herb garden (the necropolis grows nightshade and wolfsbane).
  if (ht >= 1)
    region(GARDEN[0], GARDEN[1], GARDEN[2], GARDEN[3], (i, u, _v, cell) => {
      const rows = Math.min(6, 2 + ht);
      const bed = Math.floor((u - GARDEN[0]) / 4.5);
      const inBed = (u - GARDEN[0]) % 4.5 > 1.2 && bed < rows;
      if (inBed) {
        const hc = herbs[bed % herbs.length]!;
        data[i] = cell < 0.55 ? hc : cell < 0.85 ? tone(hc, 0.3) : P.soil;
      } else data[i] = P.road[1]!;
    });
  // Paddock: churned earth.
  if (levels.stables > 0) region(PADDOCK[0], PADDOCK[1], PADDOCK[2], PADDOCK[3], (i, _u, _v, cell) => (data[i] = cell < 0.5 ? P.earth[3]! : tone(P.earth[1]!, 0.08)));
  // Building shadows toward the lower right.
  for (const k of Object.keys(LOT) as (BuildingKey | 'keep')[]) {
    if (k === 'walls') continue;
    const lvl = k === 'keep' ? Math.max(maxLevel, 1) : levels[k];
    if (lvl <= 0) continue;
    const [u0, v0, u1, v1] = LOT[k];
    const len = (k === 'keep' ? 30 + tierOf(lvl) * 8 : 10 + tierOf(lvl) * 3) * 0.6;
    region(Math.max(u0 + 2, u1 - 2), v0 + 2, u1 + len, v1, (i) => (data[i] = tone(data[i]!, 0.26)));
  }
  // The walls' shadow inside.
  if (wallsT > 0) region(2, 2, 5 + wallsT * 3, WALL - 2, (i) => (data[i] = tone(data[i]!, 0.16)));
  yield;
  // Ditch (Templar), wet moat (Samurai) or a black mere (Undead) outside stone walls.
  if (wallsT >= 2) {
    const wide = id === 'samurai' ? 5.5 : 3;
    const m = WALL + 16;
    const paint = (i: number, d: number, x: number, y: number) => {
      if (id === 'templar') data[i] = d < 1.5 ? hex('#3a3f3a') : tone(data[i]!, 0.3);
      else {
        let c = d > wide - 1 ? (id === 'samurai' ? P.flags[1]! : tone(P.earth[3]!, 0.2)) : moatW[Math.floor(hash(x >> 3, y, 31) * 4)]!;
        if (id === 'samurai' && d > wide - 1.8 && d <= wide - 1) c = tone(P.flags[2]!, -0.05);
        data[i] = c;
      }
    };
    region(m - wide, -6, m + wide, m + wide, (i, u, v, _c, x, y) => {
      if (Math.abs(v - GATE_V) <= 8) return;
      paint(i, Math.abs(u - m), x, y);
    });
    region(-6, m - wide, m - wide, m + wide, (i, _u, v, _c, x, y) => paint(i, Math.abs(v - m), x, y));
  }
  // The well.
  box(px, 76, 64, 0, 6, 6, 3, (f) => (f === 'top' ? hex('#1c1a18') : f === 'left' ? P.flags[2]! : P.flags[1]!));
  const base = px.toCanvas();
  yield;

  // Crop layer: wheat, rice seedlings, or headstones (one still frame).
  const crops: HTMLCanvasElement[] = [];
  let cropX = 0;
  let cropY = 0;
  const frames = id === 'undead' ? 1 : 4;
  for (let k = 0; k < frames; k++) {
    const cp = new Px(frame.w, frame.h, frame);
    for (let i = 0; i < sown; i++) {
      const f = FIELDS[i]!;
      if (id === 'undead') {
        for (let u = f[0] + 2.5; u < f[2] - 3; u += 6)
          for (let v = f[1] + 1; v < f[3] - 3; v += 8) {
            const n = hash(Math.floor(u), Math.floor(v), 41);
            if (n < 0.12) continue;
            stone(cp, u, v, n, st);
          }
      } else {
        const stepU = id === 'samurai' ? 2.5 : 1;
        const stepV = id === 'samurai' ? 2.5 : 3;
        const W = f[2] - f[0];
        const Hh = f[3] - f[1];
        for (let u = f[0] + 2; u < f[2] - 1.5; u += stepU)
          for (let v = f[1] + 2; v < f[3] - 1.5; v += stepV) {
            if (id === 'samurai') {
              const bu = (u - f[0]) % (W / 2);
              const bv = (v - f[1]) % (Hh / 2);
              if (bu < 2 || bv < 2) continue;
            }
            const x = Math.floor(cp.X(u, v));
            const y = Math.floor(cp.Y(u, v));
            const ph = Math.sin((k / 4) * Math.PI * 2 + (u + v) * 0.12);
            const lean = ph > 0.5 ? 1 : ph < -0.5 ? -1 : 0;
            const n = hash(Math.floor(u * 2), Math.floor(v * 2), 11);
            if (id === 'samurai') {
              // A clump of seedlings: three blades, a shade and a lit one.
              const g0 = n < 0.5 ? hex('#8fbf4e') : hex('#7aac40');
              const g1 = hex('#4f7a2e');
              cp.set(x, y, g1);
              cp.set(x - 1, y - 1, g1);
              cp.set(x + 1, y - 1, g0);
              cp.set(x + lean, y - 2, g0);
              cp.set(x + lean, y - 3, tone(g0, -0.15));
              cp.set(x - 1 + lean, y - 2, g1);
            } else {
              const ear = n < 0.3 ? hex('#d6b860') : n < 0.7 ? hex('#c4a24c') : hex('#a88a3a');
              cp.set(x, y - 1, hex('#8a7a38'));
              cp.set(x, y - 2, hex('#8a7a38'));
              cp.set(x + lean, y - 3, ear);
              cp.set(x + lean, y - 4, ear);
              if (n > 0.6) cp.set(x + lean, y - 5, tone(ear, -0.2));
            }
          }
      }
    }
    const b = cp.bounds();
    if (!b) {
      crops.push(document.createElement('canvas'));
      continue;
    }
    if (k === 0) {
      cropX = b[0];
      cropY = b[1];
    }
    // Same bounds for every frame (the first frame's, padded) so they line up.
    crops.push(cp.toCanvas(cropX, cropY, Math.max(b[2], cropX + 1), Math.max(b[3], cropY + 1)));
    yield;
  }

  // Trees and fences.
  const arts: Art[] = [];
  const tp = new Px(frame.w, frame.h, frame);
  const trees: [number, number, number][] = [
    [262, 40, 7], [280, 70, 6], [300, 160, 8], [290, 200, 6], [258, 228, 7], [284, 250, 6], [236, 272, 7],
    [-30, -20, 7], [-40, 230, 8], [-20, 262, 6], [10, 300, 7], [-50, 12, 6], [70, -84, 6], [236, -40, 7], [258, 4, 6],
    [120, 316, 6], [-24, 120, 5], [252, 100, 5],
    // Beyond the classic frame, in HD's margin.
    [330, 20, 7], [340, 120, 8], [320, 280, 7], [-90, 60, 7], [-96, 180, 8], [30, -120, 6], [190, -110, 7], [60, 352, 7], [200, 340, 6],
  ];
  trees.forEach(([u, v, r], i) => {
    tp.clear();
    if (id === 'samurai') (i % 5 === 2 ? sakura : pine)(tp, u, v, r, i, st);
    else if (id === 'undead') (i % 3 === 1 ? yew : deadTree)(tp, u, v, r, i, st);
    else oak(tp, u, v, r, i, st);
    const b = tp.bounds();
    if (b) arts.push({ canvas: tp.toCanvas(...b), lights: null, x: b[0], y: b[1], d: u + v });
  });
  if (levels.stables > 0) {
    const [u0, v0, u1, v1] = PADDOCK;
    const rail = (pts: [number, number][], depth: number) => {
      tp.clear();
      for (let i = 0; i < pts.length - 1; i++) {
        const [au, av] = pts[i]!;
        const [bu, bv] = pts[i + 1]!;
        const n = Math.ceil(Math.hypot(bu - au, bv - av) / 6);
        for (let k = 0; k <= n; k++) post(tp, au + ((bu - au) * k) / n, av + ((bv - av) * k) / n, 0, 5, st.timber[2], st.timber[3]);
        for (const z of id === 'undead' ? [3] : [2, 4]) {
          const steps = Math.ceil(Math.hypot(bu - au, bv - av) * 2.4);
          for (let s = 0; s <= steps; s++) {
            const u = au + ((bu - au) * s) / steps;
            const v = av + ((bv - av) * s) / steps;
            tp.plot(Math.floor(tp.X(u, v)), Math.floor(tp.Y(u, v, z)), u + v + z, z === 4 ? st.timber[0] : st.timber[1]);
            tp.plot(Math.floor(tp.X(u, v)), Math.floor(tp.Y(u, v, z)) + 1, u + v + z, st.timber[2]);
          }
        }
      }
      const b = tp.bounds();
      if (b) arts.push({ canvas: tp.toCanvas(...b), lights: null, x: b[0], y: b[1], d: depth });
    };
    rail([[u0, v1], [u0, v0], [u1 - 10, v0]], u0 + v0);
    rail([[u0, v1], [u1, v1], [u1, v0]], u1 + v1);
  }
  void v3;
  return { base, crops, arts, sown, cropX, cropY };
}

// ------------------------------------------------------------------ trees and headstones

function blob(tp: Px, cx: number, cy: number, rx: number, ry: number, seed: number, ramp: Col[], out: Col): void {
  // A canopy clump lit from the upper left: 3 tones in big clusters, a dark rim on the shade side.
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      const wob = hash(x >> 1, y >> 1, seed) * 0.22;
      if (d > 1 - wob) continue;
      const lit = dx * 0.6 + dy * 0.8 + (hash(x >> 2, y >> 2, seed + 1) - 0.5) * 0.5;
      let c = ramp[lit < -0.45 ? 0 : lit < 0.15 ? 1 : 2]!;
      if (d > 0.86 - wob && lit > 0.2) c = out;
      tp.set(x, y, c);
    }
}

function trunk(tp: Px, u: number, v: number, h: number, a: Col, b: Col): [number, number] {
  const x = Math.floor(tp.X(u, v));
  const y = Math.floor(tp.Y(u, v));
  for (let k = 0; k < h; k++) {
    tp.set(x - 1, y - k, a);
    tp.set(x, y - k, a);
    tp.set(x + 1, y - k, b);
  }
  return [x, y - h];
}

function oak(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.9 * k), hex('#5a3e26'), hex('#36261a'));
  const leaf = [hex('#7d8a44'), hex('#5f6e33'), hex('#425028')];
  blob(tp, x, y - r * k * 0.6, r * k, r * k * 0.85, seed, leaf, hex('#2e3a1e'));
  blob(tp, x - r * k * 0.45, y - r * k * 0.2, r * k * 0.55, r * k * 0.45, seed + 3, leaf, hex('#2e3a1e'));
  void st;
}

/** Japanese black pine: a leaning trunk with flat cloud-pruned pads of needles. */
function pine(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const x0 = Math.floor(tp.X(u, v));
  const y0 = Math.floor(tp.Y(u, v));
  const h = Math.round(r * 2.1 * k);
  const lean = (hash(seed, 3) < 0.5 ? -1 : 1) * 0.35;
  const bark = hex('#5a4234');
  const barkS = hex('#3a2a24');
  const pts: [number, number][] = [];
  for (let i = 0; i < h; i++) {
    const x = Math.round(x0 + lean * i + Math.sin(i * 0.12 + seed) * 1.5);
    const y = y0 - i;
    tp.set(x - 1, y, bark);
    tp.set(x, y, bark);
    tp.set(x + 1, y, barkS);
    pts.push([x, y]);
  }
  const ramp = [hex('#5d7444'), hex('#3f5634'), hex('#2a3a28')];
  const pads = 3 + (seed % 2);
  for (let p = 0; p < pads; p++) {
    const [px, py] = pts[Math.floor(h * (0.45 + (p / pads) * 0.55)) - 1]!;
    const side = p % 2 ? 1 : -1;
    const w = (r * (1.1 - p * 0.15)) * k;
    const cx = px + side * w * 0.45;
    // Branch to the pad.
    for (let i = 0; i < Math.abs(cx - px); i++) tp.set(Math.round(px + side * i), py + 1, barkS);
    blob(tp, cx, py, w, w * 0.32, seed + p * 7, ramp, hex('#1f2a1e'));
  }
  void st;
}

/** A cherry: one pink accent among the pines. */
function sakura(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.8 * k), hex('#4a3230'), hex('#2e1e1e'));
  const pink = [hex('#f2c4cc'), hex('#dc9aaa'), hex('#b4728a')];
  blob(tp, x, y - r * k * 0.5, r * k * 1.05, r * k * 0.75, seed, pink, hex('#8a5068'));
  void st;
}

/** A dead tree: forked bare branches, bark gone grey. */
function deadTree(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const x0 = Math.floor(tp.X(u, v));
  const y0 = Math.floor(tp.Y(u, v));
  const lit = hex('#7a7268');
  const dk = hex('#3a3434');
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let cx = x;
    let cy = y;
    for (let i = 0; i < len; i++) {
      cx += Math.cos(a);
      cy += Math.sin(a);
      for (let j = 0; j < w; j++) tp.set(Math.round(cx) + j, Math.round(cy), j === w - 1 && w > 1 ? dk : lit);
      if (w === 1) tp.set(Math.round(cx) + 1, Math.round(cy), dk);
    }
    if (depth <= 0 || len < 4) return;
    const n = hash(Math.round(cx), Math.round(cy), seed);
    branch(cx, cy, a - 0.45 - n * 0.3, len * 0.62, Math.max(1, w - 1), depth - 1);
    branch(cx, cy, a + 0.4 + n * 0.35, len * 0.58, Math.max(1, w - 1), depth - 1);
  };
  branch(x0, y0, -Math.PI / 2 + (hash(seed, 9) - 0.5) * 0.3, r * 1.3 * k, 3, 3);
  void st;
}

/** A churchyard yew: a dark, dense, round-shouldered column. */
function yew(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.5 * k), hex('#4a3630'), hex('#2a1e1c'));
  const ramp = [hex('#3e4a3a'), hex('#2c372c'), hex('#1e2620')];
  blob(tp, x, y - r * k * 0.9, r * k * 0.7, r * k * 1.25, seed, ramp, hex('#141a16'));
  void st;
}

/** A headstone, a slab or a cross in a grave field. */
function stone(cp: Px, u: number, v: number, n: number, st: CityStyle): void {
  const lit = mix(st.stone[0], st.fine[1], 0.3);
  const sh = st.stone[2];
  const top = st.stone[1];
  const moss = hex('#5f6a46');
  const lean = n > 0.8 ? 0.6 : 0;
  if (n < 0.45) {
    // A rounded headstone.
    box(cp, u, v, 0, 1, 2.5, 3.2, (f, s, t) => (f === 'top' ? top : f === 'left' ? (t < 0.6 ? moss : lit) : t < 0.6 ? tone(moss, 0.3) : sh));
    cp.point(v3(u + 0.5, v + 1.25, 3.6), lit);
    cp.point(v3(u + 0.5, v + 0.75, 3.4), lit);
  } else if (n < 0.7) {
    // A wooden or stone cross.
    box(cp, u + lean, v + 1, 0, 0.8, 0.8, 4.6, (f) => (f === 'left' ? lit : f === 'top' ? top : sh));
    box(cp, u + lean, v, 2.8, 0.8, 2.8, 0.8, (f) => (f === 'left' ? lit : f === 'top' ? top : sh));
  } else {
    // A low slab over the grave.
    box(cp, u - 0.5, v - 0.5, 0, 2.2, 3.5, 1, (f) => (f === 'top' ? lit : f === 'left' ? tone(lit, 0.12) : sh));
  }
}
