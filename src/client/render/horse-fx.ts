// A horse that has lost its rider (game Soldier.dismounted): bolting off riderless in a gallop
// (four frames after Muybridge's "The Horse in Motion"), or down on its side where it fell
// (Uccello's San Romano, the Bayeux Tapestry). Painted from shapes in map px at any level L
// (texels per map px), for the HD effects sheet (fx-hd.ts) and, at L = 1, the classic one
// (fx.ts). See docs/art-references/battle-fx-2.md.

/** Coats: grey (the Templars' white horses), bay, black. */
export const HORSE_COATS = 3;
/** Gallop frames. */
export const HORSE_FRAMES = 4;

interface Coat {
  lit: string;
  base: string;
  shade: string;
  dark: string; // mane, tail, lower legs
}
const COATS: Coat[] = [
  { lit: '#e2ddd2', base: '#bdb6a8', shade: '#8f887b', dark: '#5d574e' },
  { lit: '#9a6238', base: '#764424', shade: '#522c17', dark: '#1e1612' },
  { lit: '#4c433c', base: '#332b26', shade: '#221c18', dark: '#120e0c' },
];
const OUT = '#140e0a';
/** Scale of the shapes below (map px) to the figures' horses. */
const SIZE = 1.35;
const SADDLE = '#5a3a22';
const SADDLE_LIT = '#7c5434';
const CLOTH = '#5e1a16';

type P = [number, number];
/** A leg: hip or shoulder, knee, hoof (map px, facing right, ground at y 0). */
type Leg = [P, P, P];
interface Pose {
  lift: number;
  near: [Leg, Leg]; // front, hind
  far: [Leg, Leg];
}
const SH: P = [2.7, -4.6];
const HP: P = [-2.8, -4.8];
// After Muybridge: extended, gathered in the air, hind landing, front landing.
const GALLOP: Pose[] = [
  { lift: 0, near: [[SH, [4.4, -3.2], [5.8, -1.2]], [HP, [-4.2, -3.0], [-5.8, -0.8]]], far: [[SH, [3.9, -2.8], [4.6, -0.3]], [HP, [-3.6, -2.6], [-4.6, 0]]] },
  { lift: 0.6, near: [[SH, [3.7, -3.0], [2.7, -2.0]], [HP, [-2.0, -3.0], [-0.7, -1.7]]], far: [[SH, [3.3, -3.0], [2.1, -2.5]], [HP, [-2.4, -2.8], [-1.2, -1.1]]] },
  { lift: 0.2, near: [[SH, [4.4, -3.8], [5.6, -2.6]], [HP, [-2.6, -2.6], [-2.2, 0]]], far: [[SH, [4.0, -3.4], [4.8, -2.0]], [HP, [-3.2, -2.6], [-3.6, 0]]] },
  { lift: 0, near: [[SH, [3.4, -2.4], [3.6, 0]], [HP, [-3.8, -2.6], [-5.0, -0.6]]], far: [[SH, [2.8, -2.4], [2.4, 0]], [HP, [-3.4, -2.4], [-4.2, 0]]] },
];

/** Distance from p to the segment a-b. */
function seg(px: number, py: number, a: P, b: P): number {
  return segT(px, py, a, b)[0];
}
/** Distance from p to the segment a-b, and how far along it (0 at a, 1 at b) the nearest point is. */
function segT(px: number, py: number, a: P, b: P): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return [Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t), t];
}

export interface HorseImg {
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** Hex colours, row-major; null is clear. */
  px: (string | null)[];
}

/** Paints with `shade(x, y)` (map px, facing right) over a box, mirrored for a horse facing left. */
function paint(L: number, left: boolean, x0: number, x1: number, y0: number, y1: number, shade: (x: number, y: number) => string | null): HorseImg {
  // The shapes are drawn a size down; the horse stands as tall as the mounted figures' own.
  x0 *= SIZE;
  x1 *= SIZE;
  y0 *= SIZE;
  y1 *= SIZE;
  const w = Math.ceil((x1 - x0) * L) + 2;
  const h = Math.ceil((y1 - y0) * L) + 2;
  const px = new Array<string | null>(w * h).fill(null);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const mx = x0 + (tx - 0.5) / L;
      const my = y0 + (ty - 0.5) / L;
      const c = shade((left ? -mx : mx) / SIZE, my / SIZE);
      if (c) px[ty * w + tx] = c;
    }
  // A dark rim round the shape from level 2 up (as the figures have).
  if (L >= 2) {
    const add: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (px[y * w + x]) continue;
        if ((x > 0 && px[y * w + x - 1]) || (x < w - 1 && px[y * w + x + 1]) || (y > 0 && px[(y - 1) * w + x]) || (y < h - 1 && px[(y + 1) * w + x])) add.push(y * w + x);
      }
    for (const i of add) px[i] = OUT;
  }
  return { w, h, ax: Math.round((0 - x0) * L) + 1, ay: Math.round((0 - y0) * L) + 1, px };
}

/** Lit from the upper left: lit, base or shade by how far up and left the texel sits in its part. */
function tone(c: Coat, up: number): string {
  return up > 0.45 ? c.lit : up < -0.35 ? c.shade : c.base;
}

/** A riderless horse at the gallop, frame `f`, saddle still on. */
export function horseRun(coat: number, f: number, left: boolean, L: number): HorseImg {
  const c = COATS[coat % HORSE_COATS]!;
  const p = GALLOP[f % HORSE_FRAMES]!;
  const leg = (x: number, y: number, l: Leg, far: boolean): string | null => {
    // Forearm and gaskin thick, tapering to the cannon; dark below the knee.
    const [du, tu] = segT(x, y, l[0], l[1]);
    const dl = seg(x, y, l[1], l[2]);
    if (du < 0.62 - tu * 0.24) return far ? c.shade : tone(c, 0);
    if (dl < 0.3) return Math.hypot(x - l[2][0], y - l[2][1]) < 0.75 ? c.dark : far ? c.shade : c.base;
    return null;
  };
  return paint(L, left, -7.2, 7.6, -9.6, 0.8, (x, y) => {
    const ly = y + p.lift;
    // Near side over far: near legs, saddle, head and neck, body, tail, far legs.
    for (const l of p.near) {
      const k = leg(x, ly, l, false);
      if (k) return k;
    }
    // Saddle on a small cloth, a stirrup swinging free.
    if (x > -0.9 && x < 1.1 && ly > -7.3 && ly < -6.6) return ly < -7.0 ? SADDLE_LIT : SADDLE;
    if (x > -1.1 && x < 1.3 && ly > -6.7 && ly < -5.6) return CLOTH;
    if (seg(x, ly, [0.2, -5.6], [0.6, -4.4]) < 0.16) return OUT;
    // Head, long and tapering to the muzzle; neck thick at the chest; the mane along the crest.
    const [hd, ht] = segT(x, ly, [4.5, -8.0], [6.7, -6.6]);
    if (hd < 0.62 - ht * 0.2) return ht > 0.8 ? c.dark : tone(c, ly < -7.6 ? 1 : 0);
    if (Math.hypot(x - 4.6, ly + 8.6) < 0.32) return c.dark; // ears
    const [nd, nt] = segT(x, ly, [2.2, -5.6], [4.6, -7.9]);
    const nw = 1.35 - nt * 0.6;
    if (nd < nw) {
      // The crest side (up and back of the line) carries the mane.
      const crest = (x - 2.2) * 0.69 + (ly + 5.6) * 0.72 < 0 && nd > nw - 0.45;
      return crest ? c.dark : tone(c, nd < nw * 0.4 ? 0 : -0.5 + nt);
    }
    // Barrel, with the chest and the haunch rounding it out; lit along the back.
    const bx = x / 3.6;
    const by = (ly + 5.3) / 2.0;
    const body = bx * bx + by * by <= 1 || Math.hypot(x + 2.7, (ly + 5.5) * 1.1) < 1.75 || Math.hypot(x - 2.6, (ly + 5.1) * 1.1) < 1.6;
    if (body) return tone(c, -(ly + 5.3) / 1.7 - x * 0.05);
    // Tail streaming back and falling.
    if (seg(x, ly, [-3.9, -6.2], [-5.4, -6.0]) < 0.45 || seg(x, ly, [-5.4, -6.0], [-6.3, -4.6]) < 0.55) return c.dark;
    for (const l of p.far) {
      const k = leg(x, ly, l, true);
      if (k) return k;
    }
    return null;
  });
}

/** A horse down on its side where it fell, legs out, saddle askew. */
export function horseDead(coat: number, left: boolean, L: number): HorseImg {
  const c = COATS[coat % HORSE_COATS]!;
  const legs: [P, P][] = [
    [[2.0, -1.2], [4.9, -0.1]],
    [[2.6, -1.6], [5.2, -1.2]],
    [[-2.4, -1.1], [-4.0, 0.7]],
    [[-2.0, -1.3], [-3.0, 0.9]],
  ];
  return paint(L, left, -6.4, 7.4, -4.4, 1.6, (x, y) => {
    for (let k = 0; k < legs.length; k++) {
      const [a, b] = legs[k]!;
      if (seg(x, y, a, b) < 0.4) return Math.hypot(x - b[0], y - b[1]) < 0.7 ? c.dark : k & 1 ? c.shade : c.base;
    }
    // Head and neck lying along the ground.
    if (seg(x, y, [5.3, -2.3], [6.8, -1.3]) < 0.55) return x > 6.3 ? c.dark : c.base;
    const nd = seg(x, y, [3.0, -2.1], [5.3, -2.3]);
    if (nd < 0.85) return y < -2.7 ? c.dark : tone(c, -(y + 2.2));
    // The saddle slid round on the back.
    if (x > -1.3 && x < 1.0 && y > -3.9 && y < -3.0) return y < -3.6 ? SADDLE_LIT : SADDLE;
    const bx = x / 4.0;
    const by = (y + 1.9) / 1.9;
    if (bx * bx + by * by <= 1) return tone(c, -by - bx * 0.15 - 0.2);
    if (seg(x, y, [-3.9, -1.9], [-5.8, -0.5]) < 0.42) return c.dark;
    return null;
  });
}
