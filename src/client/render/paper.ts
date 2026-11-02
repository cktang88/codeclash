// The 2D "paper doll" painter: HD figures drawn as a pixel artist would, not ray-cast.
//
// Every part (skull, helm, ribs, limb bones, blade, shield, cloth) is an outline polygon or a
// stroke authored in sprite space, rasterised pixel-perfectly (a pixel is in when its centre
// is), and shaded by hand-placed rules: a lit band on the edge facing the top-left light, a
// shadow band on the far edge, small highlight clusters on hard materials, and painted details
// (rivets, rust patches, notches, eye sockets, rib gaps, mail rings). Nothing is computed from
// 3D normals. A 2D bone rig poses the parts; a rotated part is redrawn from its outline at the
// new angle (angles snap to 7.5°), never rotated as an image. After compositing, the round-3
// passes run: inner contact lines, small-cluster merge, a coloured outline lit on the
// top-left, and anti-flicker against the previous frame.
//
// First unit: the Hollow Host's Grave Legionary, facing south-east (toward the viewer and right).

import { Anim } from './contract.ts';

type RGB = [number, number, number];

// ------------------------------------------------------------------ colour

function hslRgb(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/**
 * A hue-shifted ramp of five steps, darkest first: shadows slide toward `dark` hue and gain
 * saturation, lights toward `light` hue and lose it. Never pure black or white.
 */
function ramp(h: number, s: number, l: number, dark: number, light: number, spread = 1): RGB[] {
  const toward = (a: number, b: number, k: number) => a + ((((b - a + 540) % 360) - 180) * k);
  const steps = [-2, -1, 0, 1, 2];
  return steps.map((k) => {
    const t = k / 2;
    const hh = t < 0 ? toward(h, dark, -t * 0.55) : toward(h, light, t * 0.45);
    const ss = Math.min(0.9, Math.max(0.04, s * (t < 0 ? 1 - t * 0.35 : 1 - t * 0.3)));
    const ll = Math.min(0.9, Math.max(0.06, l + t * 0.2 * spread * (t < 0 ? 1.15 : 0.9)));
    return hslRgb(hh, ss, ll);
  });
}

/** Materials, each a ramp of 5 tones (0 darkest .. 4 lightest). */
const M = { bone: 0, rust: 1, mail: 2, iron: 3, team: 4, teamDk: 5, rag: 6, wood: 7, ink: 8, glow: 9, leather: 10, steel: 11 } as const;
type Mat = (typeof M)[keyof typeof M];
const MAT_COUNT = 12;

function palette(hue: number): RGB[][] {
  const r: RGB[][] = [];
  // Old bone: yellowed, brown-stained, low-key (Diablo II, Darkest Dungeon).
  r[M.bone] = ramp(42, 0.28, 0.5, 18, 55);
  r[M.rust] = ramp(20, 0.45, 0.3, 355, 35);
  r[M.mail] = ramp(30, 0.1, 0.36, 15, 200, 0.9);
  r[M.iron] = ramp(210, 0.08, 0.26, 25, 200, 0.9);
  r[M.steel] = ramp(205, 0.08, 0.5, 30, 195);
  r[M.team] = ramp(hue, 0.5, 0.34, (hue + 330) % 360, (hue + 30) % 360, 0.85);
  r[M.teamDk] = ramp(hue, 0.45, 0.22, (hue + 330) % 360, hue, 0.7);
  r[M.rag] = ramp(25, 0.16, 0.2, 345, 40, 0.7);
  r[M.wood] = ramp(28, 0.35, 0.28, 355, 40);
  r[M.leather] = ramp(22, 0.35, 0.22, 355, 35);
  r[M.ink] = [[14, 10, 12], [20, 15, 16], [28, 21, 22], [36, 28, 28], [46, 36, 34]];
  r[M.glow] = [[40, 90, 60], [70, 140, 80], [110, 200, 110], [160, 235, 150], [215, 255, 200]];
  return r;
}

// ------------------------------------------------------------------ the canvas

/** Canvas in pixels; the figure's foot point is (FX, FY). */
let L = 8;
let CW = 0, CH = 0, FX = 0, FY = 0;
/** Per pixel: material*8 + tone, or -1. */
let PIX = new Int16Array(0);
/** Per pixel: the draw order of the part that painted it (for contact lines). */
let ORD = new Int16Array(0);
let PREV = new Int16Array(0);
let order = 0;

function canvas(level: number): void {
  L = level;
  CW = 46 * level;
  CH = 50 * level;
  FX = Math.round(CW / 2);
  FY = Math.round(CH * 0.86);
  if (PIX.length !== CW * CH) {
    PIX = new Int16Array(CW * CH);
    ORD = new Int16Array(CW * CH);
    PREV = new Int16Array(CW * CH).fill(-1);
  }
  PIX.fill(-1);
  ORD.fill(-1);
  order = 0;
}

const code = (m: Mat, t: number): number => m * 8 + Math.max(0, Math.min(4, t));
function plot(x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= CW || y >= CH || c < 0) return;
  const i = y * CW + x;
  PIX[i] = c;
  ORD[i] = order;
}

/** Figure units (≈ map px) to canvas px, snapped. */
const sx = (x: number): number => FX + x * L;
const sy = (y: number): number => FY + y * L;

type P2 = [number, number];
const rot = (p: P2, a: number): P2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const addP = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const DEG = Math.PI / 180;
/** Angles snap to 7.5°, so a part keeps one of a small set of drawings. */
const snap = (a: number): number => Math.round(a / (7.5 * DEG)) * 7.5 * DEG;

/**
 * Fills a polygon (canvas px): a pixel is in when its centre is. `shade(x, y, u, v)` gets the
 * pixel and its position across (u: -1 lit edge .. 1 shadow edge) and along (v: 0..1) the part's
 * axis, when one is given, and returns a code.
 */
function poly(pts: P2[], shade: (x: number, y: number, u: number, v: number) => number, axis?: { a: P2; b: P2; w: number }): void {
  order++;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(CH - 1, Math.ceil(y1));
  let ux = 0, uy = 0, vx = 0, vy = 0, len = 1;
  if (axis) {
    vx = axis.b[0] - axis.a[0];
    vy = axis.b[1] - axis.a[1];
    len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;
    // Across-axis unit pointing away from the light (top-left): +u is the shadow side.
    ux = -vy;
    uy = vx;
    if (ux * -1 + uy * -1 > 0) {
      ux = -ux;
      uy = -uy;
    }
  }
  const xs: number[] = [];
  for (let y = iy0; y <= iy1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]! - 0.5)), xb = Math.min(CW - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = xa; x <= xb; x++) {
        let u = 0, v = 0;
        if (axis) {
          const dx = x + 0.5 - axis.a[0], dy = cy - axis.a[1];
          u = (dx * ux + dy * uy) / (axis.w / 2);
          v = (dx * vx + dy * vy) / len;
        }
        plot(x, y, shade(x, y, u, v));
      }
    }
  }
}

/**
 * A tapered stroke from a to b (figure units), widths wa..wb (figure units, at least one pixel),
 * shaded as a rounded rod: a lit edge, a mid body, a shadow third and a dark edge.
 */
function rod(a: P2, b: P2, wa: number, wb: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: (x: number, y: number, u: number, v: number) => number } = {}): void {
  const A: P2 = [sx(a[0]), sy(a[1])], B: P2 = [sx(b[0]), sy(b[1])];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const ln = Math.hypot(dx, dy) || 1;
  const nx = -dy / ln, ny = dx / ln;
  const ha = Math.max(0.5, (wa * L) / 2), hb = Math.max(0.5, (wb * L) / 2);
  const pts: P2[] = [
    [A[0] + nx * ha, A[1] + ny * ha],
    [B[0] + nx * hb, B[1] + ny * hb],
    [B[0] - nx * hb, B[1] - ny * hb],
    [A[0] - nx * ha, A[1] - ny * ha],
  ];
  const base = opts.tone ?? 2;
  poly(pts, (x, y, u, v) => {
    if (opts.detail) {
      const d = opts.detail(x, y, u, v);
      if (d >= 0) return d;
    }
    const w = Math.max(ha, hb);
    // Bands in pixels, not fractions, so thin rods stay readable: 1 px lit edge, 1 px dark edge.
    const px = u * w;
    if (w >= 1.5 && px < -w + 1.2) return code(m, base + (opts.shine ? 2 : 1));
    if (w >= 1.5 && px > w - 1.2) return code(m, base - 2);
    if (u > 0.25) return code(m, base - 1);
    if (opts.shine && Math.abs(u + 0.45) < 0.12 && v > 0.15 && v < 0.6) return code(m, base + 2);
    return code(m, base);
  }, { a: A, b: B, w: 2 * Math.max(ha, hb) });
}

/**
 * A disc or ellipse (figure units) shaded the pixel-art way: a light cluster offset toward the
 * top-left, a mid body, a shadow crescent on the bottom-right, a dark rim on that side only.
 */
function blob(c: P2, rx: number, ry: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: (x: number, y: number, nx: number, ny: number) => number } = {}): void {
  const cx = sx(c[0]), cy = sy(c[1]);
  const RX = Math.max(0.6, rx * L), RY = Math.max(0.6, ry * L);
  const pts: P2[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * RX, cy + Math.sin(a) * RY]);
  }
  const base = opts.tone ?? 2;
  poly(pts, (x, y) => {
    const nx = (x + 0.5 - cx) / RX, ny = (y + 0.5 - cy) / RY;
    if (opts.detail) {
      const d = opts.detail(x, y, nx, ny);
      if (d >= 0) return d;
    }
    const lit = Math.hypot(nx + 0.38, ny + 0.38);
    const dk = nx * 0.7 + ny * 0.7;
    if (opts.shine && lit < 0.28) return code(m, base + 2);
    if (lit < 0.62) return code(m, base + 1);
    if (dk > 0.72) return code(m, base - 2);
    if (dk > 0.32) return code(m, base - 1);
    return code(m, base);
  });
}

/** A one-pixel line in canvas px (strings, cracks, seams). */
function line(a: P2, b: P2, c: number): void {
  const x0 = sx(a[0]), y0 = sy(a[1]), x1 = sx(b[0]), y1 = sy(b[1]);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) plot(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n), c);
}

/** A small deterministic hash. */
function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ the rig

/** A pose: angles in degrees, 0 = hanging straight down, positive = swung forward (screen right). */
interface Pose {
  /** Pelvis offset (figure units) and the whole body's tilt about the feet (falls). */
  px: number;
  py: number;
  tilt: number;
  torso: number;
  head: number;
  /** Near (sword) arm and far (shield) arm: upper and lower. */
  nu: number;
  nl: number;
  fu: number;
  fl: number;
  /** Sword angle relative to the forearm (unused by the blade, kept for the wrist). */
  sw: number;
  /** Where the blade points (absolute, 180 = straight up, 90 = forward, 270 = back). */
  bl: number;
  /** Near and far legs: thigh and shin. */
  nt: number;
  ns: number;
  ft: number;
  fs: number;
  /** 0..1: the body comes apart (last frames of Die). */
  apart: number;
  /** A smear behind the blade, from this sword angle (absolute degrees), or null. */
  smear: number | null;
  /** Cloth swing (figure units), lagging the body. */
  sway: number;
}

const P0: Pose = { px: 0, py: 0, tilt: 0, torso: 8, head: -4, nu: 18, nl: 70, fu: 12, fl: 75, sw: 20, bl: 165, nt: 8, ns: -10, ft: -16, fs: -4, apart: 0, smear: null, sway: 0 };
const pose = (o: Partial<Pose>): Pose => ({ ...P0, ...o });

/** Key poses per animation, authored by hand (a pixel animator's keys), then eased between. */
const KEYS: Partial<Record<Anim, Pose[]>> = {
  [Anim.Idle]: [pose({}), pose({ py: 0.12, torso: 10, nu: 20, fu: 14, head: -2, bl: 148 })],
  [Anim.Walk]: [
    pose({ nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1, nu: 6, fu: 22 }),
    pose({ nt: 4, ns: -30, ft: 2, fs: -4, py: -0.3, nu: 14, fu: 14 }),
    pose({ nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1, nu: 26, fu: 4 }),
    pose({ nt: 2, ns: -4, ft: 4, fs: -30, py: -0.3, nu: 14, fu: 14 }),
  ],
  [Anim.Attack]: [
    // Anticipation: blade drawn up and back, weight on the back foot.
    pose({ torso: -4, nu: 150, nl: 40, sw: 40, nt: -4, ft: -14, head: -8, bl: 225 }),
    // The strike: lunge, blade sweeps down (smear).
    pose({ torso: 22, nu: 70, nl: 10, sw: 10, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.5, py: 0.35, bl: 95 }),
    // Follow-through past the target (overshoot).
    pose({ torso: 26, nu: 18, nl: -6, sw: 0, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.6, py: 0.4, bl: 45 }),
    // Recover.
    pose({ torso: 12, nu: 22, nl: 60, sw: 20, nt: 10, ft: -10, px: 0.2, bl: 135 }),
  ],
  [Anim.Die]: [
    pose({ torso: -18, head: -20, nu: 60, nl: 30, fu: 40, fl: 30, nt: 4, ft: -6, bl: 200 }),
    pose({ torso: -10, head: 20, nu: 30, nl: 40, fu: 30, fl: 50, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.8, bl: 120 }),
    pose({ tilt: -55, torso: -10, head: 30, nu: 70, nl: 10, fu: 60, fl: 20, nt: 50, ns: -60, ft: 40, fs: -50, py: 2.0, bl: 70 }),
    pose({ tilt: -88, torso: -5, head: 40, nu: 100, nl: 0, fu: 90, fl: 10, nt: 30, ns: -20, ft: 20, fs: -20, py: 2.2, apart: 1 }),
  ],
};
const LOOP = new Set<number>([Anim.Idle, Anim.Walk]);
export const PAPER_FRAMES: Partial<Record<Anim, number>> = { [Anim.Idle]: 8, [Anim.Walk]: 12, [Anim.Attack]: 12, [Anim.Die]: 12 };

const ease = (k: number): number => k * k * (3 - 2 * k);
function poseAt(anim: Anim, fr: number): Pose {
  const keys = KEYS[anim] ?? KEYS[Anim.Idle]!;
  const n = PAPER_FRAMES[anim] ?? 8;
  const loop = LOOP.has(anim);
  const t = loop ? (fr * keys.length) / n : (fr * (keys.length - 1)) / Math.max(1, n - 1);
  const k0 = Math.floor(t + 1e-6) % keys.length;
  const k1 = loop ? (k0 + 1) % keys.length : Math.min(keys.length - 1, k0 + 1);
  // Attacks: the strike is fast (little easing), wind-up and recovery slow (eased).
  const raw = t - Math.floor(t + 1e-6);
  const f = anim === Anim.Attack && k0 === 0 ? raw * raw : ease(raw);
  const a = keys[k0]!, b = keys[k1]!;
  const out = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) {
    const va = a[key], vb = b[key];
    (out as unknown as Record<string, unknown>)[key] = typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * f : f < 0.5 ? va : vb;
  }
  // Secondary motion: the tabard swings a frame and a half behind the stride (and the strike).
  out.sway = anim === Anim.Walk ? 0.35 * Math.sin(((fr - 1.5) / n) * Math.PI * 4) : anim === Anim.Attack ? -0.4 * Math.sin(Math.max(0, fr - 2) / n * Math.PI) : 0;
  // The smear shows on the in-betweens of the strike only.
  out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.3 ? 225 : anim === Anim.Attack && k0 === 1 && raw < 0.5 ? 120 : null;
  return out;
}

// ------------------------------------------------------------------ the parts (Grave Legionary)

/** Limb direction for an angle (0 = down, + = forward/right). */
const dir = (deg: number): P2 => [Math.sin(snap(deg * DEG)), Math.cos(snap(deg * DEG))];
const along = (p: P2, deg: number, len: number): P2 => addP(p, [dir(deg)[0] * len, dir(deg)[1] * len]);

/** A thin bone with knobbed ends: shaft, two condyles, a lit edge. */
function bone(a: P2, b: P2, w: number, knob: number, tone = 2): void {
  rod(a, b, w, w * 0.85, M.bone, { tone, detail: (x, y, u, v) => (u > -0.3 && hash(x >> 1, y >> 1, 91) < 0.12 + v * 0.1 ? code(M.bone, tone - 1) : -1) });
  // The joint: a knob with a dark seam where the bones meet.
  blob(b, knob, knob * 0.9, M.bone, { tone: tone - 1, detail: (_x, _y, nx, ny) => (Math.abs(ny - nx * 0.3) < 0.14 ? code(M.bone, 0) : -1) });
}

/** The skull: small, brow ridge, deep sockets with a cold point of light, cheekbones, teeth. */
function skull(c: P2, ang: number, helm: boolean): void {
  const r = 1.0;
  blob(c, r, r * 1.05, M.bone, {
    detail: (_x, _y, nx, ny) => {
      // Rotated face frame: the skull looks forward-right in this facing.
      const [fx, fy] = rot([nx, ny], -ang * DEG);
      const ex = fx - 0.18;
      // Eye sockets: dark, a pale point of witchfire in the near one.
      for (const ox of [-0.32, 0.36]) {
        const d = Math.hypot(ex - ox, (fy - 0.02) * 1.25);
        if (d < 0.27) return d < 0.13 && ox > 0 ? code(M.glow, 4) : code(M.ink, 0);
      }
      // Nasal cavity.
      if (Math.abs(ex) < 0.09 && fy > 0.22 && fy < 0.44) return code(M.ink, 1);
      // Brow ridge and cheekbone highlights, a stain under the eye.
      if (fy > -0.32 && fy < -0.2 && Math.abs(ex) < 0.6) return code(M.bone, 3);
      if (fy > 0.24 && fy < 0.34 && ex > 0.3 && ex < 0.62) return code(M.bone, 3);
      if (fy > 0.25 && fy < 0.45 && ex < -0.3 && ex > -0.6) return code(M.bone, 1);
      return -1;
    },
  });
  // Jaw and teeth, slightly open.
  const jaw = addP(c, rot([0.15, 0.85], ang * DEG));
  blob(jaw, 0.55, 0.32, M.bone, {
    tone: 1,
    detail: (x, _y, _nx, ny) => (ny < -0.1 ? ((x & 1) === 0 ? code(M.bone, 3) : code(M.ink, 1)) : -1),
  });
  if (helm) {
    // A rusted nasal helm: an iron cap with a brim band, rust patches and rivets, a nasal bar.
    // Crown: a low iron bowl over the top of the skull, rust creeping up from the brim, a dent.
    const crown = addP(c, rot([0.05, -0.7], ang * DEG));
    blob(crown, 0.95, 0.62, M.iron, {
      detail: (x, y, nx, ny) => {
        if (ny > 0.15) return -2;
        if (Math.hypot(nx - 0.35, ny + 0.2) < 0.18) return code(M.iron, 0);
        if (ny > -0.1 || hash(x >> 1, y >> 1, 7) < 0.25 + ny * 0.3) return code(M.rust, ny > 0 ? 1 : 2);
        return -1;
      },
    });
    // Brim: a wide, thin, tilted ring, lit on its upper edge, chewed by rust.
    const brim = addP(c, rot([0.05, -0.62], ang * DEG));
    blob(brim, 1.55, 0.3, M.rust, {
      detail: (x, _y, nx, ny) => {
        if (Math.abs(nx) < 0.62 && ny > -0.2) return -2;
        if (ny < -0.35) return code(M.rust, 3);
        if (hash(x >> 1, 3, 9) < 0.18) return code(M.iron, 1);
        return -1;
      },
    });
  }
}

/** Ribcage and spine: rib bands curving round, with see-through gaps; a sternum. */
function ribcage(neck: P2, pelvis: P2, lean: number): void {
  const spineLen = Math.hypot(neck[0] - pelvis[0], neck[1] - pelvis[1]);
  // The spine: a column of vertebrae behind, each a small knob with a dark seam under it.
  for (let i = 0; i <= 7; i++) {
    const p: P2 = [pelvis[0] + ((neck[0] - pelvis[0]) * i) / 7 + 0.15, pelvis[1] + ((neck[1] - pelvis[1]) * i) / 7];
    blob(p, 0.3, 0.2, M.bone, { tone: i % 2 ? 2 : 1 });
  }
  // The sternum, seen three-quarter: a little in front of the spine, toward the viewer.
  const st0: P2 = [neck[0] + 0.55, neck[1] + 0.75];
  const st1: P2 = [neck[0] + 0.7 + lean * 0.01, neck[1] + 2.5];
  // Ribs: four on each side, thin, curving from the spine round to the sternum, longest in the
  // middle; the gaps between them stay empty (the spine and what lies behind show through).
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    const y = neck[1] + 0.85 + k * spineLen * 0.5;
    const sp: P2 = [neck[0] + (pelvis[0] - neck[0]) * (0.15 + k * 0.5) + 0.15, y - 0.25];
    const stp: P2 = [st0[0] + (st1[0] - st0[0]) * k, st0[1] + (st1[1] - st0[1]) * k + 0.25];
    const reach = 1.25 + Math.sin(k * Math.PI * 0.9) * 0.45;
    for (const side of [-1, 1]) {
      // Near side (+1, toward the viewer) is lit and fully seen; the far side is shorter and darker.
      const outer: P2 = [sp[0] + side * reach * (side > 0 ? 1.0 : 0.75), sp[1] + 0.45];
      const tone = side > 0 ? 3 : 1;
      rod(sp, outer, 0.2, 0.18, M.bone, { tone });
      rod(outer, [outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], 0.18, 0.16, M.bone, { tone: tone - 1 });
      if (side > 0) rod([outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], stp, 0.16, 0.14, M.bone, { tone: 2 });
    }
  }
  rod(st0, st1, 0.3, 0.22, M.bone, { tone: 3 });
}

/** Rotted mail hanging off the shoulders: ring pattern in the lit plane, holes, a torn hem. */
function mailShirt(neck: P2, waist: P2): void {
  const pts: P2[] = [
    [sx(neck[0] - 1.6), sy(neck[1] + 0.2)],
    [sx(neck[0] + 1.7), sy(neck[1] + 0.1)],
    [sx(neck[0] + 2.1), sy(neck[1] + 1.5)],
    [sx(neck[0] + 1.3), sy(neck[1] + 2.4)],
    [sx(neck[0] + 0.2), sy(neck[1] + 2.0)],
    [sx(neck[0] - 0.8), sy(neck[1] + 2.5)],
    [sx(neck[0] - 1.4), sy(neck[1] + 1.6)],
  ];
  poly(pts, (x, y) => {
    // Rotted through: irregular holes (ribs show beneath) and a ragged lower edge.
    const hy = sy(neck[1] + 2.4) - y;
    if (hash(x >> 2, y >> 2, 31) < 0.2) return -1;
    if (hy < L * 1.4 && hash(x >> 1, 0, 33) < 0.5 - hy / (L * 3)) return -1;
    // Rings: a dark line every third row, an offset checker of light toward the lit (left) side.
    const lit = x < sx(neck[0]);
    if (y % 3 === 0) return code(M.mail, 0);
    if ((x + ((y / 3) | 0)) % 2 === 0) return code(M.mail, lit ? 3 : 2);
    return code(M.mail, lit ? 2 : 1);
  });
}

/** The tabard: a strip of team cloth from chest to thighs, torn into tongues at the hem. */
function tabard(neck: P2, waist: P2, sway: number): void {
  const x0 = waist[0] + 0.45, x1 = waist[0] + 1.35;
  const top = waist[1] - 0.3, bot = waist[1] + 3.4;
  void neck;
  const pts: P2[] = [
    [sx(waist[0] + 0.4), sy(top)],
    [sx(waist[0] + 1.4), sy(top)],
    [sx(x1 + sway), sy(bot)],
    [sx(x0 + sway), sy(bot)],
  ];
  poly(pts, (x, y) => {
    const fromBot = sy(bot) - y;
    const col = Math.floor((x - sx(x0)) / Math.max(2, L * 0.45));
    if (fromBot < L * 1.6 && hash(col, 1, 51) * L * 1.6 > fromBot) return -1;
    // Two folds: darker channels with a lit ridge beside each; the underside shows at the hem.
    const rel = (x - sx(waist[0] + 0.4)) / Math.max(1, sx(waist[0] + 1.4) - sx(waist[0] + 0.4));
    const fold = rel + (fromBot / Math.max(1, sy(bot) - sy(top))) * 0.12;
    if (Math.abs(fold - 0.35) < 0.07 || Math.abs(fold - 0.7) < 0.06) return code(M.team, 1);
    if (Math.abs(fold - 0.25) < 0.05 || Math.abs(fold - 0.6) < 0.05) return code(M.team, 3);
    if (fromBot < L * 0.6) return code(M.teamDk, 1);
    if (rel > 0.82) return code(M.teamDk, 2);
    // Stains toward the hem.
    if (fromBot < L * 3 && hash(x >> 1, y >> 1, 53) < 0.18) return code(M.teamDk, 1);
    return code(M.team, 2);
  });
}

/** A rusted, notched arming sword: blade with a lit edge, chips out of it, a cross-guard, a pommel. */
function sword(grip: P2, deg: number): void {
  const tip = along(grip, deg + 180, 5.6);
  const g0 = along(grip, deg + 180, 0.5);
  rod(g0, tip, 0.42, 0.18, M.steel, {
    shine: true,
    detail: (x, y, u, v) => {
      if (v > 0.25 && v < 0.9 && hash(Math.round(v * 14), 0, 61) < 0.25 && u > 0.35) return -1; // chips
      if (hash(x >> 1, y >> 1, 63) < 0.16 && v > 0.1) return code(M.rust, 2); // pitting
      return -1;
    },
  });
  const side: P2 = [dir(deg + 90)[0] * 0.75, dir(deg + 90)[1] * 0.75];
  rod(addP(g0, side), addP(g0, [-side[0], -side[1]]), 0.26, 0.26, M.iron, { tone: 2 });
  rod(grip, along(grip, deg, 0.8), 0.26, 0.24, M.leather, { tone: 2 });
  blob(along(grip, deg, 1.0), 0.26, 0.26, M.iron, { shine: true });
}

/** The kite shield, seen three-quarter: team field, a painted skull, a rusted rim, rivets, scars. */
function shield(c: P2, tilt: number): void {
  const outline: P2[] = [[-1.55, -2.3], [1.55, -2.3], [1.45, -0.3], [0, 2.9], [-1.45, -0.3]];
  const pts: P2[] = outline.map((p) => addP(c, rot([p[0] * 0.82, p[1]], tilt * DEG)));
  const cx = sx(c[0]), cy = sy(c[1]);
  poly(pts.map((p) => [sx(p[0]), sy(p[1])] as P2), (x, y) => {
    const [lx, ly] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -tilt * DEG);
    const lx2 = lx / 0.82;
    const half = ly < -0.3 ? 1.55 : 1.45 * (1 - (ly + 0.3) / 3.2);
    const edge = half - Math.abs(lx2);
    // Rusted iron rim.
    if (edge < 0.32 || ly < -2.0) return code(M.rust, edge < 0.14 || ly < -2.15 ? 1 : 2);
    // Rivets along the rim.
    if (edge < 0.52 && Math.abs(((ly + 3) * 1.6) % 1 - 0.5) < 0.14 && edge > 0.38) return code(M.steel, 3);
    // The painted skull.
    const sd = Math.hypot(lx2 * 1.1, (ly + 0.55) * 1.0);
    if (sd < 0.62) {
      if (Math.hypot(Math.abs(lx2) - 0.24, ly + 0.6) < 0.15) return code(M.ink, 1);
      if (ly > -0.2 && Math.abs(lx2) < 0.3 && ((x & 1) === 0)) return code(M.ink, 2);
      return code(M.bone, lx2 < 0 ? 3 : 2);
    }
    // Scars and chipped paint.
    if (hash(x >> 1, y >> 2, 71) < 0.07) return code(M.wood, 1);
    // Field: the lit left half a step brighter (the shield faces the light obliquely).
    return lx2 < -0.4 ? code(M.team, 3) : lx2 > 0.6 ? code(M.team, 1) : code(M.team, 2);
  });
}

/** The figure, posed. Draw order is back to front. */
function legionary(p: Pose): void {
  const tilt = p.tilt;
  // Everything is posed relative to the feet, then tilted about them (falls).
  const T = (q: P2): P2 => rot(q, tilt * DEG);
  const pel: P2 = T([p.px, -6.5 + p.py]);
  const tor = p.torso + tilt;
  const neck = addP(pel, [dir(tor + 180)[0] * 4.9, dir(tor + 180)[1] * 4.9]);
  const shN = addP(neck, T([-0.35, 0.6]));
  const shF = addP(neck, T([1.65, 0.35]));
  const hipN = addP(pel, T([-0.25, 0.2]));
  const hipF = addP(pel, T([0.95, 0.05]));
  const legs = (hip: P2, th: number, sh: number, far: boolean) => {
    const knee = along(hip, th + tilt, 3.25);
    const ank = along(knee, th + sh + tilt, 3.1);
    const tone = far ? 1 : 2;
    bone(hip, knee, 0.42, 0.36, tone);
    // Tibia and fibula: two thin bones side by side.
    rod(knee, ank, 0.34, 0.28, M.bone, { tone });
    rod(addP(knee, [0.3, 0.1]), addP(ank, [0.25, -0.1]), 0.16, 0.14, M.bone, { tone: tone - 1 });
    // Foot: a splay of small bones.
    rod(ank, addP(ank, rot([0.95, 0.2], tilt * DEG)), 0.34, 0.2, M.bone, { tone });
  };
  const arm = (sh: P2, ua: number, la: number, far: boolean): P2 => {
    const elbow = along(sh, ua + tilt, 2.45);
    const hand = along(elbow, ua + la + tilt, 2.3);
    const tone = far ? 1 : 2;
    bone(sh, elbow, 0.36, 0.3, tone);
    rod(elbow, hand, 0.28, 0.24, M.bone, { tone });
    rod(addP(elbow, [0.12, 0.12]), addP(hand, [0.1, 0.05]), 0.14, 0.12, M.bone, { tone: tone - 1 });
    blob(hand, 0.34, 0.3, M.bone, { tone });
    return hand;
  };

  if (p.apart >= 1) {
    // Fallen apart: bones in a heap, the skull on top, the shield and blade beside.
    shield([-2.6, -0.6], 80);
    sword([2.4, -0.4], 100);
    for (let i = 0; i < 7; i++) {
      const a = i * 1.9, r = 0.6 + (i % 3) * 0.8;
      const c: P2 = [Math.cos(a) * r * 1.6, -0.5 + Math.sin(a) * r * 0.5];
      bone(addP(c, [-1.0, 0.1 * i]), addP(c, [1.0, -0.1 * i]), 0.36, 0.3, 1 + (i % 2));
    }
    ribcage([0.4, -1.8], [-1.2, -0.6], 0);
    skull([0.6, -1.6], 30, true);
    return;
  }
  // Back to front: far leg, far arm and the shield behind, the body, the near leg and arm.
  legs(hipF, p.ft, p.fs, true);
  const handF = arm(shF, p.fu, p.fl, true);
  shield(addP(handF, [1.2, 0.1]), -8 + tilt * 0.5);
  // Pelvis: a bowl with hip wings.
  blob(addP(pel, [0.15, 0.1]), 1.15, 0.6, M.bone, { tone: 2 });
  ribcage(neck, pel, tor);
  mailShirt(neck, pel);
  tabard(neck, pel, Math.sin(tor * DEG) * 0.3 + p.sway);
  rod(addP(pel, [-0.9, -0.35]), addP(pel, [1.5, -0.45]), 0.42, 0.42, M.leather, { tone: 2, detail: (x, _y, _u, v) => (Math.abs(v - 0.7) < 0.08 ? code(M.iron, 3) : (x & 3) === 0 && v < 0.6 ? code(M.leather, 1) : -1) });
  legs(hipN, p.nt, p.ns, false);
  // Neck vertebrae and the skull.
  rod(neck, addP(neck, T([0.15, -0.55])), 0.36, 0.3, M.bone, { tone: 1 });
  skull(addP(neck, T([0.3, -1.05])), p.head + tilt, true);
  const handN = arm(shN, p.nu, p.nl, false);
  // The pauldron: a dented rust-iron plate over the near shoulder, two rivets, a lit rim.
  for (const [dy, r] of [[0.15, 0.75], [0.55, 0.62]] as [number, number][]) {
    blob(addP(shN, [0.05, dy]), r, 0.42, M.iron, {
      detail: (x, y, nx, ny) => {
        // Rust spreads from the lower edge up; a pale lit rim along the top; two rivets.
        if (ny < -0.6) return code(M.steel, 3);
        if (Math.abs(ny) < 0.25 && (Math.abs(nx + 0.5) < 0.12 || Math.abs(nx - 0.45) < 0.12)) return code(M.steel, 4);
        if (ny > 0.55) return code(M.rust, 0);
        if (hash(x >> 1, y >> 1, 81) < 0.15 + (ny + 1) * 0.3) return code(M.rust, ny > 0.2 ? 1 : 2);
        return -1;
      },
    });
  }
  const tipDeg = p.bl + tilt;
  if (p.smear !== null) {
    // A solid smear: the blade's sweep as one pale shape (no blending), from where it was.
    for (let a = p.smear + tilt; a > tipDeg; a -= 7.5) rod(along(handN, a, 1.2), along(handN, a, 5.6), 0.55, 0.35, M.steel, { tone: 3 });
  }
  sword(handN, tipDeg - 180);
}

// ------------------------------------------------------------------ finishing passes

/** Contact lines: where a part lies in front of another, the pixel behind takes its darkest tone. */
function contact(): void {
  const mark: number[] = [];
  for (let y = 1; y < CH - 1; y++)
    for (let x = 1; x < CW - 1; x++) {
      const i = y * CW + x;
      const v = PIX[i]!;
      if (v < 0) continue;
      for (const j of [i - 1, i + 1, i - CW, i + CW]) {
        const u = PIX[j]!;
        if (u >= 0 && ORD[j]! > ORD[i]! + 0 && u >> 3 !== v >> 3) {
          mark.push(i);
          break;
        }
      }
    }
  for (const i of mark) PIX[i] = (PIX[i]! & ~7) | Math.max(0, (PIX[i]! & 7) - 2);
}

/** Clusters of one colour smaller than `min` pixels take their most common neighbour. */
function clusters(min: number): void {
  const seen = new Uint8Array(CW * CH);
  const stack: number[] = [], members: number[] = [];
  for (let i0 = 0; i0 < CW * CH; i0++) {
    const v = PIX[i0]!;
    if (v < 0 || seen[i0]) continue;
    stack.length = members.length = 0;
    stack.push(i0);
    seen[i0] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      for (const j of [i - 1, i + 1, i - CW, i + CW]) {
        if (j < 0 || j >= CW * CH || seen[j] || PIX[j] !== v) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (members.length >= min || v >> 3 === M.ink || v >> 3 === M.glow) continue;
    const count = new Map<number, number>();
    for (const i of members)
      for (const j of [i - 1, i + 1, i - CW, i + CW]) {
        const u = PIX[j];
        if (u !== undefined && u >= 0 && u !== v && u >> 3 === v >> 3) count.set(u, (count.get(u) ?? 0) + 1);
      }
    let best = -1, bn = 0;
    for (const [u, n] of count) if (n > bn) [best, bn] = [u, n];
    if (best >= 0) for (const i of members) PIX[i] = best;
  }
}

/** Anti-flicker: a lone tone flip since the last frame keeps last frame's tone. */
function steady(): void {
  for (let y = 1; y < CH - 1; y++)
    for (let x = 1; x < CW - 1; x++) {
      const i = y * CW + x;
      const v = PIX[i]!, q = PREV[i]!;
      if (v < 0 || q < 0 || v === q || v >> 3 !== q >> 3) continue;
      let agree = 0;
      for (const j of [i - 1, i + 1, i - CW, i + CW]) if (PIX[j] === q) agree++;
      if (agree >= 3) PIX[i] = q;
    }
}

export interface PaperFrame {
  width: number;
  height: number;
  /** RGBA. */
  pixels: Uint8ClampedArray;
  /** The foot point. */
  ax: number;
  ay: number;
}

/**
 * Paints one frame of the Grave Legionary at a detail level (4 ≈ 64 px tall, 8 ≈ 128 px cell),
 * facing south-east. `prev`: whether the previous call was the previous frame of this animation.
 */
export function paintPaper(level: number, anim: Anim, frame: number, hue = 215, prev = frame > 0): PaperFrame {
  canvas(level);
  const pal = palette(hue);
  legionary(poseAt(anim, frame));
  contact();
  clusters(level >= 8 ? 4 : 3);
  if (prev) steady();
  PREV.set(PIX);
  // Colours, the coloured outline (lit side lighter), and a contact shadow under the feet.
  const out = new Uint32Array(CW * CH);
  const pack = ([r, g, b]: RGB, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const dx = (x + 0.5 - FX) / (2.6 * level), dy = (y + 0.5 - FY) / (1.0 * level);
      if (anim !== Anim.Die && dx * dx + dy * dy < 1) out[y * CW + x] = pack([12, 14, 8], 92);
    }
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      const v = PIX[i]!;
      if (v >= 0) {
        out[i] = pack(pal[v >> 3]![v & 7]!);
        continue;
      }
      let nb = -1, lit = false;
      if (x < CW - 1 && PIX[i + 1]! >= 0) [nb, lit] = [PIX[i + 1]!, true];
      else if (y < CH - 1 && PIX[i + CW]! >= 0) [nb, lit] = [PIX[i + CW]!, true];
      else if (x > 0 && PIX[i - 1]! >= 0) nb = PIX[i - 1]!;
      else if (y > 0 && PIX[i - CW]! >= 0) nb = PIX[i - CW]!;
      if (nb < 0) continue;
      const d = pal[nb >> 3]![0]!;
      out[i] = lit ? pack(pal[nb >> 3]![0]!) : pack([Math.round(d[0] * 0.5 + 4), Math.round(d[1] * 0.5 + 3), Math.round(d[2] * 0.5 + 4)]);
    }
  return { width: CW, height: CH, pixels: new Uint8ClampedArray(out.buffer), ax: FX, ay: FY };
}

void MAT_COUNT;
