// The ground under the commandery: grass and trodden earth, the roads, the fields (with crops
// that sway, as four pre-painted frames), the herb garden, the paddock, building shadows, and
// trees outside the walls. Repainted only when the levels change.

import type { BuildingKey } from '../../../game/city.ts';
import { GATE_V, LOT, tierOf, WALL, type Art } from './buildings.ts';
import { box, groundAt, hash, hex, mix, post, Px, sx, sy, tone, v3, WORLD_H, WORLD_W, type Col } from './pixels.ts';
import { roadDistance } from './roads.ts';
import type { CityStyle } from './style.ts';

/** Fields outside the walls: [u0, v0, u1, v1]. The first ones are sown first. */
export const FIELDS: [number, number, number, number][] = [
  [10, -70, 92, -14],
  [-74, 24, -14, 110],
  [140, -66, 222, -16],
  [-74, 120, -14, 206],
  [24, 248, 110, 300],
  [130, 248, 214, 296],
];
export const PADDOCK: [number, number, number, number] = [52, 176, 90, 212];
export const GARDEN: [number, number, number, number] = [146, 190, 172, 214];

export interface Ground {
  base: HTMLCanvasElement;
  /** Crop frames (swaying), drawn over the base. */
  crops: HTMLCanvasElement[];
  /** Upright things on the ground, sorted with the people: trees, fences. */
  arts: Art[];
  /** Ears of wheat per field, for the reapers: how many fields are sown. */
  sown: number;
}

const inRect = (u: number, v: number, r: [number, number, number, number], m = 0) => u >= r[0] - m && u < r[2] + m && v >= r[1] - m && v < r[3] + m;

export function paintGround(st: CityStyle, levels: Record<BuildingKey, number>, maxLevel: number): Ground {
  const px = new Px(WORLD_W, WORLD_H);
  const grass = [hex('#59613a'), hex('#4f5833'), hex('#646b40'), hex('#454d2e'), hex('#6f7446')];
  const earth = [hex('#6b5b42'), hex('#62533c'), hex('#736248'), hex('#584a35')];
  const road = [hex('#7b6a4e'), hex('#857356'), hex('#6e5e45')];
  const flags = [hex('#8f8676'), hex('#857c6c'), hex('#999080')];
  const soil = hex('#4e3d2a');
  const sown = Math.min(FIELDS.length, 1 + Math.floor(levels.granary / 3));
  const wallsT = tierOf(levels.walls);
  const shadows: [number, number, number, number, number][] = [];
  for (const k of Object.keys(LOT) as (BuildingKey | 'keep')[]) {
    if (k === 'walls') continue;
    const lvl = k === 'keep' ? Math.max(maxLevel, 1) : levels[k];
    if (lvl <= 0) continue;
    const [u0, v0, u1, v1] = LOT[k];
    const h = k === 'keep' ? 30 + tierOf(lvl) * 8 : 10 + tierOf(lvl) * 3;
    shadows.push([u0 + 2, v0 + 2, u1, v1, h * 0.6]);
  }
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < WORLD_W; x++) {
      const [u, v] = groundAt(x + 0.5, y + 0.5);
      // Clumped noise (pairs of pixels, a few tones) reads as texture rather than static.
      const n = hash(x >> 1, y, 5) * 0.7 + hash(x, y, 4) * 0.3;
      const n2 = hash(x >> 3, y >> 2, 6);
      const inside = u > 2 && v > 2 && u < WALL - 2 && v < WALL - 2;
      let c: Col;
      if (inside) {
        // Trodden earth, greener toward the walls.
        const edge = Math.min(u, v, WALL - u, WALL - v);
        c = earth[n < 0.5 ? 0 : n < 0.75 ? 1 : n < 0.9 ? 2 : 3]!;
        if (edge < 14 && n2 < 0.6 - edge / 30) c = grass[Math.floor(n * 3)]!;
        if (n2 > 0.85) c = tone(c, 0.06);
      } else {
        c = grass[n < 0.45 ? 0 : n < 0.7 ? 1 : n < 0.85 ? 2 : n < 0.95 ? 3 : 4]!;
        if (n2 < 0.25) c = tone(c, 0.08);
        if (n2 > 0.9) c = tone(c, -0.06);
        if (n > 0.985) c = hash(x, y, 9) < 0.5 ? hex('#c9b458') : hex('#b9b2a2');
      }
      // Flagstones before the keep and the chapel.
      if ((u > 56 && u < 80 && v > 22 && v < 60) || (u > 76 && u < 142 && v > 46 && v < 60)) {
        const fu = Math.floor(u / 5);
        const fv = Math.floor(v / 4);
        c = flags[Math.floor(hash(fu, fv) * flags.length)]!;
        if (u % 5 < 0.8 || v % 4 < 0.7) c = tone(c, 0.3);
      }
      // Roads, with wheel ruts.
      const rd = roadDistance(u, v);
      if (rd < 5.5) {
        c = road[Math.floor(n * road.length)]!;
        if (Math.abs(rd - 2.6) < 0.5) c = tone(c, 0.18);
        if (rd > 4.5) c = mix(c, earth[0]!, 0.5);
      }
      // Fields.
      for (let i = 0; i < FIELDS.length; i++) {
        const f = FIELDS[i]!;
        if (!inRect(u, v, f)) continue;
        if (i < sown) {
          c = Math.floor(v) % 3 === 0 ? tone(soil, 0.1) : mix(hex('#8c7a3a'), soil, 0.35 + n * 0.2);
        } else {
          // Fallow: ploughed furrows.
          c = Math.floor(v) % 3 === 0 ? tone(soil, 0.2) : mix(soil, grass[0]!, n * 0.3);
        }
        if (u < f[0] + 1 || v < f[1] + 1 || u > f[2] - 1 || v > f[3] - 1) c = tone(grass[1]!, 0.1);
      }
      // Herb garden beds.
      const ht = tierOf(levels.hospital);
      if (ht >= 1 && inRect(u, v, GARDEN)) {
        const rows = Math.min(6, 2 + ht);
        const bed = Math.floor((u - GARDEN[0]) / 4.5);
        const inBed = (u - GARDEN[0]) % 4.5 > 1.2 && bed < rows;
        if (inBed) {
          const herbs = [hex('#7a6aa0'), hex('#5f7a4a'), hex('#c9883a'), hex('#4f6a5a'), hex('#a8b070'), hex('#9a5a7a')];
          const hc = herbs[bed % herbs.length]!;
          c = n < 0.55 ? hc : n < 0.8 ? tone(hc, 0.3) : soil;
        } else c = road[1]!;
      }
      // Paddock: churned earth.
      if (levels.stables > 0 && inRect(u, v, PADDOCK)) c = n < 0.5 ? earth[3]! : tone(earth[1]!, 0.08);
      // A trodden lot for every building yet to rise.
      // The yard: well-beaten earth where the recruits drill.
      if (u > 84 && u < 150 && v > 70 && v < 150 && rd > 5) c = mix(c, road[2]!, 0.35);
      // Shadows of the buildings, toward the lower right.
      for (const [u0, v0, u1, v1, len] of shadows) if (u > u0 && u < u1 + len && v > v0 && v < v1 && u > u1 - 2) c = tone(c, 0.3);
      // Shadow of the walls inside.
      if (wallsT > 0 && inside && (u < 5 + wallsT * 3) && v > 0) c = tone(c, 0.18);
      // A ditch outside the walls once they are stone.
      if (wallsT >= 2) {
        const d = Math.min(Math.abs(u - (WALL + 16)), Math.abs(v - (WALL + 16)));
        if (d < 3 && u > WALL + 8 && v > -6 && v < WALL + 22 && Math.abs(v - GATE_V) > 8 || (d < 3 && v > WALL + 8 && u > -6 && u < WALL + 22)) c = d < 1.5 ? hex('#3a3f3a') : tone(c, 0.3);
      }
      px.set(x, y, c);
    }
  // The well.
  box(px, 76, 64, 0, 6, 6, 3, (f) => (f === 'top' ? hex('#1c1a18') : f === 'left' ? hex('#8f8676') : hex('#6a6256')));
  const base = px.toCanvas();

  // Crop frames: ears of wheat that lean with the wind.
  const crops: HTMLCanvasElement[] = [];
  for (let k = 0; k < 4; k++) {
    const cp = new Px(WORLD_W, WORLD_H);
    for (let i = 0; i < sown; i++) {
      const f = FIELDS[i]!;
      for (let u = f[0] + 2; u < f[2] - 1; u += 1)
        for (let v = f[1] + 2; v < f[3] - 1; v += 3) {
          const x = Math.floor(sx(u, v));
          const y = Math.floor(sy(u, v));
          const ph = Math.sin((k / 4) * Math.PI * 2 + (u + v) * 0.12);
          const lean = ph > 0.5 ? 1 : ph < -0.5 ? -1 : 0;
          const n = hash(u, v, 11);
          const ear = n < 0.3 ? hex('#d6b860') : n < 0.7 ? hex('#c4a24c') : hex('#a88a3a');
          cp.set(x, y - 1, hex('#8a7a38'));
          cp.set(x + lean, y - 2, ear);
          if (n > 0.6) cp.set(x + lean, y - 3, tone(ear, -0.2));
        }
    }
    crops.push(cp.toCanvas());
  }

  // Trees and fences.
  const arts: Art[] = [];
  const tp = new Px(WORLD_W, WORLD_H);
  const tree = (u: number, v: number, r: number, seed: number) => {
    tp.clear();
    post(tp, u, v, 0, Math.round(r * 0.9), hex('#4a3320'), hex('#33241a'));
    const cx = sx(u, v);
    const cy = sy(u, v, r * 1.6);
    const leaf = [hex('#6f7c3e'), hex('#56652f'), hex('#3f4c26'), hex('#2c3820')];
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx;
        const dy = (y + 0.5 - cy) * 1.15;
        const d = Math.hypot(dx, dy);
        const wob = hash(x, y, seed) * 1.6;
        if (d > r - wob * 0.6) continue;
        // Lit from the top-left: darker toward the lower right, clumps of leaves.
        const lit = (dx + dy) / r + (hash(Math.floor(x / 2), Math.floor(y / 2), seed) - 0.5) * 0.9;
        tp.set(x, y, leaf[lit < -0.6 ? 0 : lit < 0.1 ? 1 : lit < 0.7 ? 2 : 3]!);
      }
    tp.outline(st.outline);
    const b = tp.bounds();
    if (b) arts.push({ canvas: tp.toCanvas(...b), lights: null, x: b[0], y: b[1], d: u + v });
  };
  const trees: [number, number, number][] = [
    [262, 40, 7], [280, 70, 6], [300, 160, 8], [290, 200, 6], [258, 228, 7], [284, 250, 6], [236, 272, 7],
    [-30, -20, 7], [-40, 230, 8], [-20, 262, 6], [10, 300, 7], [-50, 12, 6], [70, -84, 6], [236, -40, 7], [258, 4, 6],
    [120, 316, 6], [-24, 120, 5], [252, 100, 5],
  ];
  trees.forEach(([u, v, r], i) => tree(u, v, r, i));
  if (levels.stables > 0) {
    // The paddock fence: back rails, then front rails, so horses stand between them.
    const [u0, v0, u1, v1] = PADDOCK;
    const rail = (pts: [number, number][], depth: number) => {
      const fp = tp;
      fp.clear();
      for (let i = 0; i < pts.length - 1; i++) {
        const [au, av] = pts[i]!;
        const [bu, bv] = pts[i + 1]!;
        const n = Math.ceil(Math.hypot(bu - au, bv - av) / 6);
        for (let k = 0; k <= n; k++) post(fp, au + ((bu - au) * k) / n, av + ((bv - av) * k) / n, 0, 5, st.timber[2]);
        for (const z of [2, 4]) {
          const steps = Math.ceil(Math.hypot(bu - au, bv - av) * 1.2);
          for (let s = 0; s <= steps; s++) {
            const u = au + ((bu - au) * s) / steps;
            const v = av + ((bv - av) * s) / steps;
            fp.plot(Math.floor(sx(u, v)), Math.floor(sy(u, v, z)), u + v + z, z === 4 ? st.timber[0] : st.timber[1]);
          }
        }
      }
      const b = fp.bounds();
      if (b) arts.push({ canvas: fp.toCanvas(...b), lights: null, x: b[0], y: b[1], d: depth });
    };
    rail([[u0, v1], [u0, v0], [u1 - 10, v0]], u0 + v0);
    rail([[u0, v1], [u1, v1], [u1, v0]], u1 + v1);
  }
  void v3;
  return { base, crops, arts, sown };
}
