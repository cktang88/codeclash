// The ground a battle is fought on (battle v17): gentle hills, a few woods, perhaps a stream
// with fords, and soft ground, generated from the battle's seed. Pure and deterministic like the
// rest of src/game (rng.ts: no Math.random, Date or trig). See docs/battle-terrain.md for the
// period fields and Total War maps it is modelled on, and for what each kind of ground does.
//
// FAIRNESS. The field is point-symmetric about its centre: every feature generated on team 0's
// half has a twin at (FIELD_W - x, FIELD_H - y) on team 1's, so each army sees the same ground
// before it, on the same hand. Woods and soft ground keep out of both deployment zones (x within
// DEPLOY_X of either edge), so both armies form up in the open; hills may run into them.
//
// DATA SHAPE (for the renderer and tools; read it from `battle.terrain`, rebuilt by every
// browser from the setup, nothing to send):
// - `kind`: 'flat' (no features at all; every array zero), 'field' (generated) or 'custom' (laid
//   out by hand: `TerrainSpec`). `flat` is true for 'flat'.
// - A grid of `cols` x `rows` cells of `cell` (16) world units, row-major, index
//   `row * cols + col`, cell (c, r) spanning x in [c*cell, (c+1)*cell), y in [r*cell, (r+1)*cell).
//   - `height: Float32Array`: ground height at the cell's centre, world units (a man is about 5
//     across, 0.19 m a unit; hills rise 25-70 units, 5-13 m). `heightAt(x, y)` interpolates it.
//   - `slopeX`, `slopeY: Float32Array`: the height's gradient (rise per unit run) at the centre.
//   - `ground: Uint8Array`: a `Ground` per cell: 0 open, 1 soft (marsh, plough, a stream's
//     banks), 2 ford, 3 wood, 4 water.
//   - `woodDepth: Float32Array`: in a wood, how far in from its edge (world units; 0 outside).
// - Features as drawn shapes (the grid is made from these; draw from them for smooth edges):
//   - `hills: Hill[]`: elliptical bumps (where two meet, the higher counts); height h * (1 - s)^2 for s < 1, where
//     s = (along / (r * k))^2 + (across / r)^2, along = (p - centre) . (ax, ay), across the other way.
//   - `woods: Wood[]`: each a union of discs (`blobs`, x y r), with its bounding disc (x, y, r).
//   - `soft: Patch[]`: ellipses of soft ground (x, y, rx, ry, axis ax ay).
//   - `stream: Stream | null`: a polyline `pts` (x0, y0, x1, y1, ...) from the top edge to the
//     bottom, `width` of water, and `fords` (discs x y r where it is shallow and stony). Its banks
//     (soft) reach `bank` beyond the water on either side.
import { mixSeed, Rng } from './rng.ts';

export type TerrainKind = 'flat' | 'field';

/**
 * A field laid out by hand (set pieces, tests, scripted scenarios): the features as `Terrain`
 * holds them; a wood's bounding disc is worked out from its blobs, and a stream's `pts` need only
 * run from top to bottom (it is resampled).
 */
export interface TerrainSpec {
  hills?: Hill[];
  woods?: { blobs: Disc[] }[];
  soft?: Patch[];
  stream?: Stream;
}

export const enum Ground {
  Open = 0,
  Soft = 1,
  Ford = 2,
  Wood = 3,
  Water = 4,
}

export interface Hill { x: number; y: number; r: number; k: number; h: number; ax: number; ay: number }
export interface Disc { x: number; y: number; r: number }
export interface Wood extends Disc { blobs: Disc[] }
export interface Patch { x: number; y: number; rx: number; ry: number; ax: number; ay: number }
export interface Stream { pts: number[]; width: number; bank: number; fords: Disc[] }

/**
 * What each kind of ground and slope does (docs/battle-terrain.md). Paces are shares of a man's
 * pace on open level ground, by Ground.
 */
export const TERRAIN = {
  cell: 16,
  /** Foot and horse pace by Ground (open, soft, ford, wood, water). */
  footPace: [1, 0.78, 0.72, 0.62, 0.35],
  horsePace: [1, 0.62, 0.62, 0.35, 0.28],
  /** Going up a grade g (rise per run) a man keeps 1 - upK g of his pace (no less than upMin). */
  upK: 2,
  upMin: 0.5,
  /** Going down he gains downK |g| (at most downMax). */
  downK: 0.6,
  downMax: 1.12,
  /** In a wood each man goes at his own pace: his eagerness (-1..1) times this, a ragged line. */
  woodRagged: 0.22,
  /** Impetus a man can carry in a wood (a charge does not go through trees) and in water. */
  woodImpetus: 0.15,
  waterImpetus: 0,
  /** Extra fatigue a think (0.5 s) per unit of grade climbed: marching, and running. */
  climbTire: 0.008,
  climbRunTire: 0.025,
  /** A charge's force: x (1 - chargeK g) along the grade it runs down (g < 0), within [chargeMin, chargeMax]. */
  chargeK: 1.5,
  chargeMin: 0.85,
  chargeMax: 1.25,
  /** Melee: attack + heightAttack x the grade down to his foe (within ±heightGrade). */
  heightAttack: 20,
  heightGrade: 0.25,
  /** Attack and defence lost by a man standing in water (no footing, no ranks). */
  waterAttack: 8,
  waterDefence: 10,
  /** A stance's defence (shield wall, pike wall) counts this share in a wood: the trees break the ranks. */
  woodStance: 0.4,
  /** Missile reach gained per unit of height above the target (lost below it), within ±reachShare of the range. */
  reachPerHeight: 1.2,
  reachShare: 0.2,
  /** Missiles stopped by trees: at a man deep in a wood (lobbed, direct), and at its edge (within `edge`). */
  coverLob: 0.5,
  coverDirect: 0.35,
  coverEdge: 0.5,
  edge: 14,
  /** Line of sight: a block deeper than `hideDepth` in a wood is seen only within `hideNear`; a line through more than `sightWood` of trees is blind. */
  hideDepth: 24,
  hideNear: 90,
  sightWood: 48,
  /** Choosing ground: a holding block looks this far ahead for a crest worth this much height. */
  holdLook: 260,
  holdGain: 8,
  /** Shooters holding look this far about for a wood's edge, standing this deep in it. */
  edgeLook: 170,
  edgeIn: [8, 30],
  /** Horse keeps this far out of woods. */
  horseRoom: 24,
  /** Foot and horse go round by a ford if it adds no more than this (or `detourFire` under fire). */
  detour: 300,
  detourShare: 0.6,
  detourFire: 650,
} as const;

/** Distance from either side edge of the field within which woods and soft ground never lie. */
export const DEPLOY_X = 720;

export class Terrain {
  readonly cell = TERRAIN.cell;
  readonly cols: number;
  readonly rows: number;
  readonly height: Float32Array;
  readonly slopeX: Float32Array;
  readonly slopeY: Float32Array;
  readonly ground: Uint8Array;
  readonly woodDepth: Float32Array;
  readonly hills: Hill[] = [];
  readonly woods: Wood[] = [];
  readonly soft: Patch[] = [];
  stream: Stream | null = null;
  readonly flat: boolean;
  /** Stream: its x at each 1/STREAM_STEP of y (for crossing tests), and the y step. */
  private streamX: Float64Array | null = null;

  readonly kind: TerrainKind | 'custom';

  constructor(given: TerrainKind | TerrainSpec, readonly width: number, readonly heightOfField: number, seed: number) {
    this.kind = typeof given === 'string' ? given : 'custom';
    this.flat = given === 'flat';
    this.cols = Math.ceil(width / this.cell);
    this.rows = Math.ceil(heightOfField / this.cell);
    const n = this.cols * this.rows;
    this.height = new Float32Array(n);
    this.slopeX = new Float32Array(n);
    this.slopeY = new Float32Array(n);
    this.ground = new Uint8Array(n);
    this.woodDepth = new Float32Array(n);
    if (typeof given === 'object') {
      this.lay(given);
      this.bake();
    } else if (!this.flat) {
      generate(this, new Rng(mixSeed(seed, 0x7e4a)));
      this.bake();
    }
  }

  /** The cell holding (x, y), clamped to the field. */
  index(x: number, y: number): number {
    let c = Math.floor(x / this.cell);
    let r = Math.floor(y / this.cell);
    if (c < 0) c = 0;
    else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0;
    else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  }

  groundAt(x: number, y: number): Ground {
    return this.ground[this.index(x, y)]! as Ground;
  }

  /** Height at (x, y), bilinear between cell centres. */
  heightAt(x: number, y: number): number {
    if (this.flat) return 0;
    const fx = Math.max(0, Math.min(this.cols - 1.001, x / this.cell - 0.5));
    const fy = Math.max(0, Math.min(this.rows - 1.001, y / this.cell - 0.5));
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    const u = fx - c;
    const v = fy - r;
    const i = r * this.cols + c;
    const h = this.height;
    return (h[i]! * (1 - u) + h[i + 1]! * u) * (1 - v) + (h[i + this.cols]! * (1 - u) + h[i + this.cols + 1]! * u) * v;
  }

  /** A man's pace here going (vx, vy), as a share of his pace on open level ground. */
  pace(i: number, vx: number, vy: number, mounted: boolean): number {
    const g = this.ground[i]!;
    let k = mounted ? TERRAIN.horsePace[g]! : TERRAIN.footPace[g]!;
    const v = Math.sqrt(vx * vx + vy * vy);
    if (v > 0.5) {
      const grade = (this.slopeX[i]! * vx + this.slopeY[i]! * vy) / v;
      k *= grade > 0 ? Math.max(TERRAIN.upMin, 1 - TERRAIN.upK * grade) : Math.min(TERRAIN.downMax, 1 - TERRAIN.downK * grade);
    }
    return k;
  }

  /** The grade (rise per unit run) at cell i going along the unit vector (ux, uy). */
  grade(i: number, ux: number, uy: number): number {
    return this.slopeX[i]! * ux + this.slopeY[i]! * uy;
  }

  /** How many units of trees deeper than `min` a straight line crosses, leaving out `skip0` at its start and `skip1` at its end. */
  woodOnLine(x0: number, y0: number, x1: number, y1: number, skip0: number, skip1: number, min = 0): number {
    if (this.woods.length === 0) return 0;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L <= skip0 + skip1) return 0;
    const step = this.cell;
    let w = 0;
    for (let t = skip0; t < L - skip1; t += step) {
      const i = this.index(x0 + (dx * t) / L, y0 + (dy * t) / L);
      if (this.ground[i] === Ground.Wood && this.woodDepth[i]! > min) w += step;
    }
    return w;
  }

  /** The stream's x at height y (NaN without a stream). */
  streamAt(y: number): number {
    const s = this.streamX;
    if (!s) return NaN;
    const f = Math.max(0, Math.min(s.length - 1.001, y / STREAM_STEP));
    const k = Math.floor(f);
    return s[k]! + (s[k + 1]! - s[k]!) * (f - k);
  }

  /**
   * Where a straight walk from (x0, y0) to (x1, y1) crosses the stream outside a ford: the
   * crossing's share of the way (0..1), or -1 if it does not (or crosses at a ford).
   */
  wetCrossing(x0: number, y0: number, x1: number, y1: number): number {
    if (!this.stream) return -1;
    const s0 = x0 - this.streamAt(y0);
    const s1 = x1 - this.streamAt(y1);
    if ((s0 < 0) === (s1 < 0)) return -1;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 12; k++) {
      const m = (lo + hi) / 2;
      const sm = x0 + (x1 - x0) * m - this.streamAt(y0 + (y1 - y0) * m);
      if ((sm < 0) === (s0 < 0)) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (const f of this.stream.fords) {
      const ex = cx - f.x;
      const ey = cy - f.y;
      if (ex * ex + ey * ey < f.r * f.r * 0.8) return -1;
    }
    return t;
  }

  /** Sets down the features of a field laid out by hand. */
  private lay(spec: TerrainSpec): void {
    for (const h of spec.hills ?? []) this.hills.push({ ...h });
    for (const p of spec.soft ?? []) this.soft.push({ ...p });
    for (const w of spec.woods ?? []) {
      let x = 0;
      let y = 0;
      for (const b of w.blobs) {
        x += b.x / w.blobs.length;
        y += b.y / w.blobs.length;
      }
      let r = 0;
      for (const b of w.blobs) r = Math.max(r, Math.sqrt((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y)) + b.r);
      this.woods.push({ x, y, r, blobs: w.blobs.map((b) => ({ ...b })) });
    }
    const S = spec.stream;
    if (S) {
      // Resampled at every STREAM_STEP of y from the top edge to the bottom (see `bake`).
      const src = S.pts;
      const xAt = (y: number): number => {
        for (let k = 0; k + 3 < src.length; k += 2) {
          const y0 = src[k + 1]!;
          const y1 = src[k + 3]!;
          if (y >= y0 && y <= y1) return src[k]! + ((src[k + 2]! - src[k]!) * (y - y0)) / (y1 - y0 || 1);
        }
        return y < src[1]! ? src[0]! : src[src.length - 2]!;
      };
      const pts: number[] = [];
      for (let k = 0; k * STREAM_STEP <= this.heightOfField + STREAM_STEP; k++) pts.push(xAt(k * STREAM_STEP), k * STREAM_STEP);
      this.stream = { pts, width: S.width, bank: S.bank, fords: S.fords.map((f) => ({ ...f })) };
    }
  }

  /** Fills the grid from the features. */
  private bake(): void {
    const { cols, rows, cell } = this;
    const h = this.height;
    const g = this.ground;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * cell;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cell;
        const i = r * cols + c;
        let z = 0;
        for (const H of this.hills) {
          const dx = x - H.x;
          const dy = y - H.y;
          const a = (dx * H.ax + dy * H.ay) / (H.r * H.k);
          const b = (-dx * H.ay + dy * H.ax) / H.r;
          const s = a * a + b * b;
          if (s < 1) z = Math.max(z, H.h * (1 - s) * (1 - s));
        }
        h[i] = z;
        let gr: Ground = Ground.Open;
        for (const p of this.soft) {
          const dx = x - p.x;
          const dy = y - p.y;
          const a = (dx * p.ax + dy * p.ay) / p.rx;
          const b = (-dx * p.ay + dy * p.ax) / p.ry;
          if (a * a + b * b < 1) gr = Ground.Soft;
        }
        for (const w of this.woods) {
          if ((x - w.x) * (x - w.x) + (y - w.y) * (y - w.y) > w.r * w.r) continue;
          for (const b of w.blobs) if ((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) < b.r * b.r) gr = Ground.Wood;
        }
        g[i] = gr;
      }
    }
    if (this.stream) {
      const S = this.stream;
      const n = Math.ceil(this.heightOfField / STREAM_STEP) + 2;
      const sx = (this.streamX = new Float64Array(n));
      // The polyline is sampled at every STREAM_STEP of y already (see `generate`).
      for (let k = 0; k < n; k++) sx[k] = S.pts[Math.min(k, S.pts.length / 2 - 1) * 2]!;
      const half = S.width / 2;
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * cell;
        const x0 = this.streamAt(y);
        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) * cell;
          if (Math.abs(x - x0) > half + S.bank + 60) continue;
          const i = r * cols + c;
          const dist = this.distToStream(x, y);
          if (dist > half + S.bank) continue;
          let ford = false;
          for (const f of S.fords) if ((x - f.x) * (x - f.x) + (y - f.y) * (y - f.y) < f.r * f.r) ford = true;
          if (dist <= half) g[i] = ford ? Ground.Ford : Ground.Water;
          else if (!ford && g[i] === Ground.Open) g[i] = Ground.Soft;
          // (The stream runs in a shallow bed.)
          if (dist <= half) h[i] = h[i]! - 4;
        }
      }
    }
    // Gradients by central differences.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? i - 1 : i;
        const rr = c < cols - 1 ? i + 1 : i;
        const u = r > 0 ? i - cols : i;
        const dn = r < rows - 1 ? i + cols : i;
        this.slopeX[i] = (h[rr]! - h[l]!) / (cell * (rr - l));
        this.slopeY[i] = (h[dn]! - h[u]!) / (cell * ((dn - u) / cols));
      }
    }
    // Depth into the woods: a two-pass chamfer distance to the nearest cell that is not wood.
    const D = this.woodDepth;
    const big = 1e6;
    for (let i = 0; i < D.length; i++) D[i] = g[i] === Ground.Wood ? big : 0;
    const diag = cell * Math.SQRT2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (D[i] === 0) continue;
        let m = D[i]!;
        if (c > 0) m = Math.min(m, D[i - 1]! + cell);
        if (r > 0) {
          m = Math.min(m, D[i - cols]! + cell);
          if (c > 0) m = Math.min(m, D[i - cols - 1]! + diag);
          if (c < cols - 1) m = Math.min(m, D[i - cols + 1]! + diag);
        }
        if (c === 0 || r === 0 || c === cols - 1) m = Math.min(m, cell);
        D[i] = m;
      }
    }
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c;
        if (D[i] === 0) continue;
        let m = D[i]!;
        if (c < cols - 1) m = Math.min(m, D[i + 1]! + cell);
        if (r < rows - 1) {
          m = Math.min(m, D[i + cols]! + cell);
          if (c < cols - 1) m = Math.min(m, D[i + cols + 1]! + diag);
          if (c > 0) m = Math.min(m, D[i + cols - 1]! + diag);
        }
        if (r === rows - 1) m = Math.min(m, cell);
        D[i] = m;
      }
    }
    // (Measured from the cell's centre to the edge: half a cell less than to the next cell's centre.)
    for (let i = 0; i < D.length; i++) if (D[i]! > 0) D[i] = D[i]! - cell / 2;
  }

  private distToStream(x: number, y: number): number {
    const p = this.stream!.pts;
    let best = Infinity;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k]!;
      const ay = p[k + 1]!;
      const bx = p[k + 2]!;
      const by = p[k + 3]!;
      if (y < Math.min(ay, by) - 80 || y > Math.max(ay, by) + 80) continue;
      const ex = bx - ax;
      const ey = by - ay;
      const L2 = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2));
      const qx = ax + ex * t - x;
      const qy = ay + ey * t - y;
      best = Math.min(best, qx * qx + qy * qy);
    }
    return Math.sqrt(best);
  }
}

const STREAM_STEP = 40;

/** A smooth odd wave of period 1 (a parabolic stand-in for a sine: no trig in src/game). */
function wave(t: number): number {
  const x = t - Math.floor(t + 0.5);
  return 8 * x * (1 - 2 * Math.abs(x));
}

/** A unit vector drawn from the rng (no trig). */
function heading(rng: Rng): [number, number] {
  for (;;) {
    const x = rng.range(-1, 1);
    const y = rng.range(-1, 1);
    const q = x * x + y * y;
    if (q > 0.05 && q <= 1) {
      const m = Math.sqrt(q);
      return [x / m, y / m];
    }
  }
}

/**
 * The features of a field. Each is drawn for team 0's half (x < W / 2) and set down twice, there
 * and turned about the centre on team 1's; a stream runs through the middle, itself
 * point-symmetric.
 */
function generate(t: Terrain, rng: Rng): void {
  const W = t.width;
  const H = t.heightOfField;
  const twin = (x: number, y: number): [number, number] => [W - x, H - y];
  // Hills: one or two pairs (each army gets the same rise before it, on the same hand), and now
  // and then a low rise in the middle that whoever gets there first holds.
  const pairs = 1 + rng.int(2);
  for (let k = 0; k < pairs; k++) {
    const r = rng.range(230, 420);
    const kk = rng.range(1, 2.2);
    const h = Math.min(rng.range(28, 70), r * 0.13);
    const x = rng.range(250, 1100);
    const y = rng.range(250, H - 250);
    const [ax, ay] = heading(rng);
    t.hills.push({ x, y, r, k: kk, h, ax, ay });
    const [x2, y2] = twin(x, y);
    t.hills.push({ x: x2, y: y2, r, k: kk, h, ax, ay });
  }
  if (rng.chance(0.3)) {
    const r = rng.range(260, 400);
    const [ax, ay] = heading(rng);
    t.hills.push({ x: W / 2, y: H / 2, r, k: rng.range(1, 2), h: Math.min(rng.range(20, 40), r * 0.1), ax, ay });
  }
  // A stream between the armies, half the time, with two to five fords (one in the middle maybe).
  if (rng.chance(0.5)) {
    const slant = rng.range(-0.22, 0.22);
    const a1 = rng.range(50, 150);
    const L1 = rng.range(900, 1600);
    const a2 = rng.range(15, 50);
    const L2 = rng.range(280, 480);
    const pts: number[] = [];
    for (let k = 0; k * STREAM_STEP <= H + STREAM_STEP; k++) {
      const y = k * STREAM_STEP;
      const u = y - H / 2;
      pts.push(W / 2 + slant * u + a1 * wave(u / L1) + a2 * wave(u / L2), y);
    }
    const width = rng.range(22, 32);
    const at = (y: number): [number, number] => {
      const k = Math.round(y / STREAM_STEP);
      return [pts[k * 2]!, pts[k * 2 + 1]!];
    };
    const fords: Disc[] = [];
    if (rng.chance(0.5)) fords.push({ x: at(H / 2)[0], y: H / 2, r: rng.range(50, 70) });
    const fp = 1 + rng.int(2);
    for (let k = 0; k < fp; k++) {
      const u = rng.range(300, 900);
      const r = rng.range(50, 70);
      const [x, y] = at(H / 2 - u);
      fords.push({ x, y, r });
      const [x2, y2] = at(H / 2 + u);
      fords.push({ x: x2, y: y2, r });
    }
    t.stream = { pts, width, bank: 10, fords };
  }
  // Woods: one or two pairs, out of the deployment zones; each a clump of discs.
  const woodPairs = 1 + rng.int(2);
  for (let k = 0; k < woodPairs; k++) {
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.range(DEPLOY_X + 60, W / 2 - 40);
      const y = rng.range(150, H - 150);
      const blobs: Disc[] = [];
      const nb = 3 + rng.int(4);
      for (let b = 0; b < nb; b++) {
        const br = rng.range(45, 100);
        blobs.push({ x: x + rng.range(-110, 110), y: y + rng.range(-110, 110), r: br });
      }
      if (blobs.some((b) => b.x - b.r < DEPLOY_X + 20 || b.x + b.r > W - DEPLOY_X - 20)) continue;
      let R = 0;
      for (const b of blobs) R = Math.max(R, Math.sqrt((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y)) + b.r);
      t.woods.push({ x, y, r: R, blobs });
      const [x2, y2] = twin(x, y);
      t.woods.push({ x: x2, y: y2, r: R, blobs: blobs.map((b) => ({ x: W - b.x, y: H - b.y, r: b.r })) });
      break;
    }
  }
  // Soft ground (a marshy hollow, a ploughed field): a pair, half the time.
  if (rng.chance(0.5)) {
    const rx = rng.range(90, 200);
    const ry = rng.range(60, 120);
    const x = rng.range(DEPLOY_X + rx, W / 2 - 20);
    const y = rng.range(200, H - 200);
    const [ax, ay] = heading(rng);
    t.soft.push({ x, y, rx, ry, ax, ay });
    const [x2, y2] = twin(x, y);
    t.soft.push({ x: x2, y: y2, rx, ry, ax, ay });
  }
}
