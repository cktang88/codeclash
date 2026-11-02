// Samurai key art: one hand-placed static image per kind (idle, facing SE), drawn with the paper
// painter's primitives. NOT registered with the painter: the live game keeps paper/samurai.ts until
// these are approved and split into rig parts. Owned by the samurai faction agent.
//
// The bulk brief (user targets: CraftPix "Fantasy Knight", Diablo II: Resurrected class renders;
// Met gusoku, Kuniyoshi): limbs are shaped volumes, not rods; shoulders ~0.36 H (with sode ~0.47 H),
// waist ~0.24 H, upper arm ~0.09 H, thigh ~0.11 H; boxy lacquered dō, big sode, flared kusazuri,
// haidate, a broad kabuto; massive horses. H ≈ 14.5 units (≈ 116 px at level 8).

import { addP, code, DEG, figurePalette, Paper, type Mat, type P2 } from './core.ts';
import {
  ell, face, gunbai, headgear, javelin, katana, lames, lerpP, lit, mul, naginata, part, plates, SM, teppo, yari, yumi,
  type Kit, type ManRig,
} from './samurai-parts.ts';

const frac = (v: number) => v - Math.floor(v);
const norm = (p: P2): P2 => {
  const l = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / l, p[1] / l];
};
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];

// ------------------------------------------------------------------ volumes

/**
 * A shaped limb volume from a to b: widths w0 (at a), w1 (the swell, at 45%), w2 (at b), with
 * rounded ends; planar shading across it (a lit plane on the top-left, the body, a shadow plane
 * and a broken dark edge), `detail(un, v)` first (un: -1 lit edge .. 1 shadow edge).
 */
function vol(c: Paper, a: P2, b: P2, w0: number, w1: number, w2: number, mat: Mat, tone = 2, opt: { detail?: (un: number, v: number, x: number, y: number) => number; shine?: boolean; caps?: [number, number] } = {}): void {
  const L = c.L;
  const d = norm(sub(b, a));
  const n: P2 = [-d[1], d[0]];
  const [k0, k1] = opt.caps ?? [0.35, 0.35];
  const at = (t: number, w: number, s: number): P2 => addP(lerpP(a, b, t), mul(n, (w / 2) * s));
  const side = (s: number): P2[] => [at(0, w0, s), at(0.2, (w0 + w1) / 2, s), at(0.45, w1, s), at(0.75, (w1 + w2) / 2, s), at(1, w2, s)];
  const pts: P2[] = [addP(a, mul(d, -w0 * k0)), ...side(1), addP(b, mul(d, w2 * k1)), ...side(-1).reverse()];
  // Rounded caps: two extra points each end.
  const cpts = pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2);
  const A: P2 = [c.sx(a[0]), c.sy(a[1])], B: P2 = [c.sx(b[0]), c.sy(b[1])];
  const band = () => c.band;
  c.poly(cpts, (x, y, u, v) => {
    const vv = Math.max(0, Math.min(1, v));
    const hw = ((vv < 0.45 ? w0 + (w1 - w0) * (vv / 0.45) : w1 + (w2 - w1) * ((vv - 0.45) / 0.55)) / 2) * L;
    const un = u / Math.max(0.5, hw);
    if (opt.detail) {
      const r = opt.detail(un, vv, x, y);
      if (r >= 0) return r;
    }
    const bd = band();
    if (opt.shine && un > -0.78 && un < -0.5 && vv > 0.15 && vv < 0.55) return code(mat, tone + 2);
    if (un < -0.5 + bd) return code(mat, tone + 1);
    if (un > 0.86 && vv > 0.06 && vv < 0.94 && frac(vv * 2.3 + bd) < 0.7) return code(mat, tone - 2);
    if (un > 0.4 + bd) return code(mat, tone - 1);
    return code(mat, tone);
  }, { a: A, b: B, w: 2 });
}

/** A polygon in units shaded by `shade(fx, fy)` in units relative to `o` (no rotation). */
function slab(c: Paper, o: P2, pts: P2[], shade: (fx: number, fy: number) => number): void {
  part(c, o, 0, pts, shade);
}

// ------------------------------------------------------------------ the bulky man

interface Body {
  head: P2;
  ha: number;
  neck: P2;
  pel: P2;
  shN: P2; elN: P2; hnN: P2;
  shF: P2; elF: P2; hnF: P2;
  hipN: P2; knN: P2; anN: P2;
  hipF: P2; knF: P2; anF: P2;
}

/** The standing skeleton (feet apart, weight settled), shifted by `o`. */
function stand(o: P2 = [0, 0], over: Partial<Body> = {}): Body {
  const t = (p: P2): P2 => addP(p, o);
  const b: Body = {
    head: t([0.3, -13.05]), ha: 0, neck: t([0.15, -11.8]), pel: t([0, -6.6]),
    shN: t([-2.05, -10.75]), elN: t([-2.45, -8.35]), hnN: t([-2.25, -6.2]),
    shF: t([1.9, -10.65]), elF: t([2.25, -8.3]), hnF: t([2.1, -6.2]),
    hipN: t([-0.9, -6.5]), knN: t([-1.25, -3.35]), anN: t([-1.3, -0.45]),
    hipF: t([0.9, -6.55]), knF: t([1.3, -3.4]), anF: t([1.45, -0.5]),
  };
  for (const [k, v] of Object.entries(over)) (b as unknown as Record<string, unknown>)[k] = typeof v === 'number' ? v : t(v as P2);
  return b;
}

interface Dress {
  kit: Kit;
  /** Armour: 'gusoku' full laced armour (sode, haidate, suneate), 'okegawa' ashigaru plate, 'happi' jacket, 'robe' monk. */
  body: 'gusoku' | 'okegawa' | 'happi' | 'robe';
  sode: 'big' | 'small' | 'none';
  /** Draw the legs (false when riding: the rider's legs are drawn by the horse scene). */
  legs?: boolean;
  jinbaori?: boolean;
}

/** A fake ManRig for the shared head parts (only head, ha and back are read). */
const headRig = (b: Body): ManRig => ({ back: false, tilt: 0, ta: 0, ha: b.ha, pel: b.pel, neck: b.neck, head: b.head, shN: b.shN, shF: b.shF, hipN: b.hipN, hipF: b.hipF, B: (x, h) => addP(b.pel, [x, -h]), sx: (x) => x });

/** Arm volume: sleeve (or armoured kote), forearm, a fist. */
function arm(c: Paper, sh: P2, el: P2, hn: P2, dress: Dress, far: boolean): void {
  const t = far ? 1 : 2;
  const armoured = dress.body === 'gusoku';
  const robe = dress.body === 'robe';
  const sleeve = dress.kit.sleeve;
  // Upper arm: a full sleeve, broad at the shoulder.
  vol(c, sh, el, robe ? 1.9 : 1.45, robe ? 1.95 : 1.5, robe ? 1.6 : 1.15, sleeve, t, {
    detail: (un, v) => (un > -0.2 && un < 0.2 && frac(v * 2.2 + 0.3) < 0.18 ? code(sleeve, t - 1) : -1), // a crease
  });
  // Forearm: the kote's iron splints over cloth, or a bare cloth sleeve.
  vol(c, el, hn, robe ? 1.5 : 1.2, robe ? 1.4 : 1.2, 0.9, armoured ? SM.iron : sleeve, t, {
    shine: armoured,
    detail: armoured ? (un, v) => (v > 0.1 && v < 0.85 && Math.abs(un + 0.1) < 0.22 && frac(v * 3) > 0.25 ? code(SM.iron, t + 1) : frac(v * 3) < 0.08 ? code(SM.iron, t - 1) : -1) : undefined,
    caps: [0.25, 0.2],
  });
  // The fist (a gauntlet's back for armour).
  part(c, hn, 0, ell(0.5, 0.45, 0.05, 0.1, 12), (fx, fy) => code(armoured ? SM.lacquer : SM.flesh, lit(c, far ? 1 : 2, fx * 0.9 + fy * 0.7, 0.3, 0.4)));
}

/** Leg volume: hakama'd thigh (with haidate for armour), the shin (suneate or kyahan), the sandal. */
function leg(c: Paper, hip: P2, kn: P2, an: P2, dress: Dress, far: boolean): void {
  const t = far ? 1 : 2;
  const legs = dress.kit.legs;
  const robe = dress.body === 'robe';
  vol(c, hip, kn, robe ? 2.0 : 1.85, robe ? 2.0 : 1.9, 1.45, legs, t, {
    // Hakama folds: diagonal creases toward the knee.
    detail: (un, v) => (un > 0.1 && frac(v * 2.4 + un * 0.6) < 0.16 ? code(legs, t - 1) : un < -0.1 && frac(v * 2.4 + un * 0.6 + 0.5) < 0.1 ? code(legs, t + 1) : -1),
  });
  const shin = dress.kit.shin === 'suneate' ? SM.iron : SM.black;
  vol(c, kn, an, 1.4, 1.35, 0.95, shin, t, {
    shine: shin === SM.iron,
    detail: (un, v) =>
      shin === SM.iron
        ? Math.abs(un) < 0.14 && v > 0.1 && v < 0.9 ? code(SM.lacquer, t) : frac(v * 3.2) < 0.08 ? code(SM.iron, t - 1) : -1 // splints, a ridge
        : frac(v * 3) < 0.09 ? code(SM.cotton, 1) : -1, // kyahan ties
    caps: [0.3, 0.15],
  });
  // Knee: the kneecap plate (armour) or the hakama's bulge.
  part(c, kn, 0, ell(0.72, 0.55, 0, -0.05, 12), (fx, fy) => code(shin === SM.iron ? SM.iron : legs, lit(c, t, fx * 0.8 + fy * 0.8, 0.3, 0.4)));
  // Waraji over tabi.
  const toe = addP(an, [1.2, 0.35]);
  vol(c, addP(an, [-0.25, 0.05]), toe, 0.85, 0.8, 0.6, SM.cotton, t - 1, { caps: [0.2, 0.3] });
  vol(c, addP(an, [-0.35, 0.38]), addP(toe, [0.15, 0.08]), 0.32, 0.3, 0.28, SM.straw, 1);
}

/** Torso: the dō (or jacket, or robe), the obi, the jinbaori. */
function torso(c: Paper, b: Body, dress: Dress): void {
  const L = c.L;
  const o = b.pel;
  // Boxy: shoulders broad, the chest a flat front plane with a lit left side, waist narrower.
  const pts: P2[] = [[-2.2, -4.75], [-0.6, -5.05], [1.0, -5.0], [2.15, -4.65], [2.25, -2.9], [1.8, -0.1], [-1.75, -0.1], [-2.3, -2.9]];
  const s = (fx: number, fy: number) => fx * 0.42 + (fy + 2.4) * 0.22;
  if (dress.body === 'gusoku' || dress.body === 'okegawa') {
    slab(c, o, pts, (fx, fy) => {
      let t = lit(c, 2, s(fx, fy), 0.5, 0.45);
      // The front plane turns at x ≈ 1.1: the side of the dō falls into shadow.
      if (fx > 1.15 + fy * -0.05) t = Math.min(t, 1);
      if (fy < -4.15) return code(SM.lacquer, fx < 0.3 ? 3 : t); // munaita
      if (dress.body === 'okegawa') {
        if (L >= 2 && Math.hypot(fx - 0.15, (fy + 3.1) * 1.05) < 0.62) return Math.hypot(fx - 0.15, fy + 3.1) < 0.24 ? code(SM.lacquer, 2) : code(SM.gold, fx < 0.1 ? 3 : 2);
        return plates(c, fx, fy, -4.15, t, SM.lacquer, 0.78);
      }
      return lames(c, fx, fy, -4.15, t, { seed: 11, per: 0.6, laceDk: true });
    });
  } else if (dress.body === 'happi') {
    slab(c, o, pts.map((p) => [p[0] * 0.95, p[1]] as P2), (fx, fy) => {
      const t = lit(c, 2, s(fx, fy), 0.5, 0.45);
      if (Math.abs(fx - 0.2 + (fy + 4.9) * 0.32) < 0.3 && fy < -2.4) return code(SM.cotton, t); // collar
      if (fy > -0.85) return code(SM.teamDk, t);
      if (frac((fx + 3) / 1.25 + fy * 0.08) < 0.07) return code(SM.team, t - 1); // folds
      return code(SM.team, t);
    });
  } else {
    slab(c, o, pts.map((p) => [p[0] * 1.08, p[1]] as P2), (fx, fy) => {
      const t = lit(c, 2, s(fx, fy), 0.5, 0.45);
      if (Math.abs(fy + 2.6 - fx * 0.85) < 0.75) return code(SM.ochre, frac((fx + 4) / 0.9) < 0.1 ? t - 1 : t); // kesa
      if (frac((fx + 3) / 1.1 - fy * 0.1) < 0.08) return code(SM.black, t - 1);
      return code(SM.black, t);
    });
  }
  if (dress.jinbaori) {
    // A sleeveless black surcoat over the dō, its team lining showing at the open front and hem.
    slab(c, o, [[-2.4, -4.9], [-0.7, -5.1], [-0.9, 0.6], [-2.6, 0.7]], (fx, fy) => (fx > -1.05 || fy > 0.35 ? code(SM.team, 1) : code(SM.black, lit(c, 2, fx * 0.5 + fy * 0.2, 0.4, 0.5))));
    slab(c, o, [[1.0, -5.0], [2.35, -4.75], [2.55, 0.6], [1.15, 0.5]], (fx) => (fx < 1.3 ? code(SM.team, 1) : code(SM.black, 1)));
  }
  // The obi: a broad sash, knotted at the front.
  slab(c, o, [[-1.85, -0.45], [1.85, -0.5], [1.85, 0.15], [-1.85, 0.2]], (fx, fy) => {
    const m = dress.body === 'robe' ? SM.ochre : dress.body === 'happi' ? SM.indigo : SM.cotton;
    if (frac((fx + 3) / 0.9 + fy * 0.4) < 0.1) return code(m, 1);
    return code(m, fx < -1.0 ? 2 : fx > 1.1 ? 0 : 1);
  });
}

/** The kusazuri: five laced panels flaring out over the thighs (three or four seen from the front). */
function kusazuri(c: Paper, b: Body, dress: Dress, layer: 'back' | 'front'): void {
  if (dress.body === 'happi') return;
  const o = addP(b.pel, [0, 0.25]);
  const robe = dress.body === 'robe';
  const long = dress.body === 'gusoku' ? 2.9 : robe ? 5.6 : 2.4;
  // [top x, flare out, tone]
  const panels: [number, number, number][] = layer === 'back' ? [[1.5, 0.75, 1], [-1.9, -0.75, 1]] : [[-1.25, -0.55, 3], [0.1, 0.05, 2], [1.3, 0.55, 1]];
  for (const [x, flare, tone] of panels) {
    const w0 = robe ? 1.25 : 0.82, w1 = robe ? 1.55 : 1.05;
    const pts: P2[] = robe
      ? [[x - w0, 0], [x + w0, 0], [x + w1 + flare, long - 0.2], [x + flare, long + 0.15], [x - w1 + flare, long - 0.3]]
      : [[x - w0, 0], [x + w0, 0], [x + w1 + flare, long], [x - w1 + flare, long]];
    slab(c, o, pts, (fx, fy) => {
      const rel = fx - x - flare * (fy / long);
      const t = lit(c, tone === 3 ? 2 : tone === 2 ? 2 : 1, rel * 0.7 + fy * 0.18 + (tone === 1 ? 0.3 : -0.1), 0.45, 0.5);
      if (robe) {
        const pleat = frac((rel + 3) / 0.7);
        if (fy > long - 0.35) return code(SM.black, Math.max(0, t - 1));
        if (pleat < 0.12) return code(SM.black, Math.max(0, t - 1));
        if (pleat > 0.15 && pleat < 0.27 && rel < 0.3) return code(SM.black, t + 1);
        return code(SM.black, t);
      }
      // The bottom lame bound in the army's lacing (hishinui), the rest laced rows.
      if (fy > long - 0.32) return code(SM.team, t);
      return lames(c, rel, fy, 0.05, t, { per: dress.body === 'gusoku' ? 0.55 : 0.62, seed: 50 + Math.round(x * 10), laceDk: true });
    });
  }
}

/** Haidate: a laced apron over the thighs below the kusazuri (gusoku only). */
function haidate(c: Paper, b: Body): void {
  for (const [hip, kn, t] of [[b.hipF, b.knF, 1], [b.hipN, b.knN, 2]] as [P2, P2, number][]) {
    const top = lerpP(hip, kn, 0.3), bot = lerpP(hip, kn, 0.95);
    vol(c, top, bot, 2.0, 2.1, 1.75, SM.lacquer, t, {
      caps: [0.05, 0.15],
      // Small iron scales in rows (kawara haidate): a staggered checker of lit plates in the lit plane only.
      detail: (un, v, x, y) => {
        const row = Math.floor(v * 5);
        if (frac(v * 5) < 0.18) return code(SM.teamDk, t);
        if (un < 0.3 && frac((x - c.ox) / (c.L * 0.55) + row * 0.5) < 0.45) return code(SM.iron, t + (un < -0.4 ? 1 : 0));
        void y;
        return -1;
      },
    });
  }
}

/** Sode: a big laced shoulder board hanging from the shoulder, flaring out. */
function sode(c: Paper, sh: P2, far: boolean, big: boolean, ang = 0): void {
  const w = big ? (far ? 1.05 : 1.3) : far ? 0.7 : 0.85;
  const h = big ? 2.8 : 1.7;
  const dx = far ? 0.45 : -0.45;
  part(c, addP(sh, [dx, -0.1]), ang, [[-w, -0.1], [w, -0.25], [w + 0.18, h], [-w - 0.12, h + 0.1]], (fx, fy) => {
    const t = far ? 1 : lit(c, 2, fx * 0.75 + fy * 0.12, 0.35, 0.5);
    if (fy < 0.2) return code(SM.lacquer, far ? 2 : 3); // the kanmuri-ita
    if (fy > h - 0.3) return code(SM.team, t); // the bound bottom row
    return lames(c, fx, fy, 0.2, t, { per: 0.5, seed: far ? 23 : 21, laceDk: true });
  });
}

/** Big kabuto over the head: a ridged bowl, a broad flared shikoro, large fukigaeshi, the crest. */
/** The shikoro: the kabuto's flared neck guard, behind the head (drawn before the face). */
function shikoro(c: Paper, b: Body): void {
  const h = b.head;
  // Flaring lames of laced plate, wide and low, round the back of the head and past the far cheek.
  slab(c, h, [[-0.9, -0.45], [0.2, -0.5], [1.15, -0.3], [1.55, 0.55], [1.0, 0.95], [-0.2, 1.05], [-1.6, 1.3], [-2.5, 0.95], [-1.8, -0.15]], (fx, fy) => {
    const t = lit(c, 2, fx * 0.45 + fy * 0.4, 0.45, 0.45);
    if (fy > 0.95 - (fx + 2.4) * 0.12) return code(SM.team, t); // bound edge
    return lames(c, fx, fy - 0.08 * fx, -0.35, t, { per: 0.42, seed: 31, laceDk: true, stitch: false });
  });
}

/** Big kabuto over the head: a ridged bowl, large fukigaeshi, the crest (the shikoro is drawn first). */
function kabuto(c: Paper, b: Body, crest: 'kuwagata' | 'crescent' | 'none'): void {
  const L = c.L;
  const h = b.head;
  // Bowl.
  slab(c, h, ell(1.12, 0.92, 0.0, -0.42, 18, 180, 360).concat([[1.12, -0.3], [-1.12, -0.3]]), (fx, fy) => {
    const s = fx * 0.75 + (fy + 0.7) * 0.6;
    const t = lit(c, 2, s * 1.2, 0.45, 0.45);
    const ang = Math.atan2(fy + 0.3, fx) / DEG;
    if (frac((ang + 400) / 12) < 0.2) return code(SM.iron, Math.max(1, t - 1)); // suji ridges
    if (L >= 8 && s < -0.6 && frac((ang + 400) / 12) < 0.45) return code(SM.iron, 4);
    return code(SM.iron, t);
  });
  if (L >= 4) part(c, addP(h, [0.0, -1.32]), 0, ell(0.2, 0.11, 0, 0, 10), () => code(SM.gold, 3)); // tehen
  // Mabizashi: the peak, a lit lacquer lip over the brow.
  slab(c, h, [[-0.4, -0.38], [1.25, -0.42], [1.4, -0.2], [-0.2, -0.18]], (fx) => code(SM.lacquer, fx < 0.5 ? 3 : 2));
  // Fukigaeshi: big turned-back wings, gilt-edged, the near one large.
  slab(c, h, [[-0.95, -0.42], [-1.95, -1.0], [-2.25, -0.2], [-1.85, 0.35], [-1.05, 0.0]], (fx, fy) => (fy < -0.75 || fx < -2.1 ? code(SM.gold, 2) : code(SM.lacquer, lit(c, 3, fx * 0.5 + fy * 0.4, 0.4, 0.4))));
  slab(c, h, [[0.95, -0.35], [1.6, -0.75], [1.7, -0.1], [1.15, 0.1]], (fx) => (fx > 1.55 ? code(SM.gold, 2) : code(SM.lacquer, 1)));
  const base: P2 = addP(h, [0.45, -0.62]);
  if (crest === 'kuwagata') {
    for (const [dx, tone] of [[-1.25, 2], [1.4, 3]] as [number, number][]) {
      const mid = addP(base, [dx * 0.55, -1.05]);
      const tip = addP(base, [dx, -2.35]);
      vol(c, base, mid, 0.42, 0.45, 0.38, SM.gold, tone, { caps: [0.2, 0.1] });
      vol(c, mid, tip, 0.38, 0.32, 0.16, SM.gold, tone, { caps: [0.05, 0.3], shine: tone === 3 });
    }
    part(c, base, 0, ell(0.34, 0.3, 0, 0, 12), (fx, fy) => code(SM.gold, fx + fy < -0.1 ? 4 : 2));
  } else if (crest === 'crescent') {
    const outer = ell(2.7, 1.6, 0.45, -2.45, 16, 10, 170);
    const inner = ell(2.25, 1.0, 0.45, -2.6, 16, 170, 10);
    slab(c, h, outer.concat(inner), (fx, fy) => code(SM.gold, fx < -0.6 ? 4 : fx > 1.8 ? 1 : fy > -1.25 ? 2 : 3));
    part(c, base, 0, ell(0.32, 0.3, 0, 0, 12), () => code(SM.gold, 2));
  }
}

/** Menpō (face mask) over the lower face: iron, a pale moustache, the throat guard (yodare-kake). */
function menpo(c: Paper, b: Body): void {
  slab(c, b.head, [[-0.35, 0.3], [0.95, 0.25], [0.85, 0.65], [0.3, 0.95], [-0.4, 0.8]], (fx, fy) => {
    if (fy > 0.3 && fy < 0.44 && fx > 0.05) return code(SM.cotton, 3);
    return code(SM.iron, lit(c, 2, fx * 0.6 + fy * 0.5, 0.4, 0.45));
  });
  slab(c, b.head, [[-0.7, 0.75], [0.9, 0.7], [1.0, 1.2], [-0.8, 1.3]], (fx, fy) => lames(c, fx, fy, 0.75, lit(c, 2, fx * 0.5, 0.4, 0.4), { per: 0.3, seed: 41 }));
}

/** The sashimono: a lacquered pole from the back, a crossbar, the tall team flag with a pale mon. */
function sashimono(c: Paper, base: P2, height = 9.3, w = 2.0, h = 4.4): void {
  const top = addP(base, [-0.15, -height]);
  vol(c, base, top, 0.3, 0.3, 0.26, SM.lacquer, 2, { caps: [0, 0.1] });
  slab(c, top, [[0, 0.25], [-w, 0.25], [-w + 0.1, h], [0.05, h + 0.05]], (fx, fy) => {
    if (Math.hypot(fx + w / 2, fy - h * 0.36) < w * 0.27) return code(SM.cotton, 3);
    if (frac((fx + 5 + fy * 0.12) / (w / 2.4)) < 0.08) return code(SM.team, 1);
    const sd = fx / w + (fy / h) * 0.5;
    return code(SM.team, sd > -0.05 ? 1 : sd < -0.62 ? 3 : 2);
  });
  vol(c, addP(top, [-w - 0.15, 0.2]), addP(top, [0.2, 0.2]), 0.24, 0.24, 0.24, SM.lacquer, 2, { caps: [0.1, 0.1] });
}

/** The horo: a puffed cloth balloon on a cane frame, pinned at the shoulders, billowing behind. */
function horo(c: Paper, at: P2, big = 1): void {
  const pts: P2[] = [[0.3, -2.6], [-0.8, -3.6], [-2.4, -3.6], [-3.6, -2.5], [-4.1, -0.6], [-3.8, 1.4], [-2.8, 2.8], [-1.3, 3.2], [0.1, 2.5]].map((p) => [p[0]! * big, p[1]! * big] as P2);
  slab(c, at, pts, (fx, fy) => {
    const ang = Math.atan2(fx + 0.2, fy + 3.9 * big) / DEG;
    const gore = frac((ang + 90) / 13);
    const s = (fx / big) * 0.08 + (fy / big) * 0.32 - (fx / big + 2) * 0.12;
    const t = s < -0.45 + c.band ? 3 : s > 0.42 + c.band ? 1 : 2;
    if (gore < 0.09) return code(SM.teamDk, Math.max(1, t));
    if (gore > 0.1 && gore < 0.22 && t >= 2) return code(SM.team, Math.min(4, t + 1));
    if (Math.hypot(fx + 2.2 * big, fy + 0.1) < 0.6 * big) return code(SM.cotton, 3); // the mon
    return code(SM.team, t);
  });
  // The cane frame's top hoop showing over the shoulder.
  vol(c, addP(at, [0.2, -2.55 * big]), addP(at, [-1.6 * big, -3.65 * big]), 0.22, 0.22, 0.2, SM.wood, 2);
}

/** A whole man on foot (or a rider's upper body when legs is false), back to front, facing SE. */
function man(c: Paper, b: Body, dress: Dress, layers: { back?: () => void; behind?: () => void; held?: () => void; hipGear?: () => void }): void {
  const legs = dress.legs !== false;
  layers.back?.();
  // Far side: leg, arm, sode.
  if (legs) leg(c, b.hipF, b.knF, b.anF, dress, true);
  arm(c, b.shF, b.elF, b.hnF, dress, true);
  if (dress.sode !== 'none') sode(c, b.shF, true, dress.sode === 'big');
  layers.behind?.();
  kusazuri(c, b, dress, 'back');
  if (legs) leg(c, b.hipN, b.knN, b.anN, dress, false);
  if (legs && dress.body === 'gusoku') haidate(c, b);
  torso(c, b, dress);
  kusazuri(c, b, dress, 'front');
  layers.hipGear?.();
  // Head.
  const r = headRig(b);
  if (dress.kit.head === 'kabuto') {
    shikoro(c, b);
    face(c, r, false, 'none');
    if (dress.kit.mask) menpo(c, b);
    kabuto(c, b, dress.kit.crest ?? 'none');
  } else headgear(c, r, dress.kit, 0);
  // Near arm and its sode, then what he holds.
  arm(c, b.shN, b.elN, b.hnN, dress, false);
  if (dress.sode !== 'none') sode(c, b.shN, false, dress.sode === 'big', 4);
  layers.held?.();
}

/** A sheathed katana and wakizashi through the obi. */
function swords(c: Paper, b: Body): void {
  const o = b.pel;
  vol(c, addP(o, [1.6, -0.3]), addP(o, [-3.3, 1.9]), 0.4, 0.4, 0.34, SM.lacquer, 2, { caps: [0.3, 0.3] });
  vol(c, addP(o, [1.6, -0.3]), addP(o, [2.6, -0.85]), 0.36, 0.36, 0.36, SM.black, 2, { detail: (_u, v) => (frac(v * 4) < 0.3 ? code(SM.cotton, 2) : -1) });
  vol(c, addP(o, [1.4, 0.05]), addP(o, [-2.0, 1.6]), 0.34, 0.34, 0.3, SM.lacquer, 1);
}

// ------------------------------------------------------------------ kits

const SAM_KIT: Kit = { head: 'kabuto', crest: 'kuwagata', mask: true, body: 'gusoku', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' };
const ASHI_KIT: Kit = { head: 'jingasa', body: 'okegawa', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const ARCH_KIT: Kit = { head: 'hachimaki', body: 'okegawa', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const SKIR_KIT: Kit = { head: 'hachimaki', body: 'happi', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const MONK_KIT: Kit = { head: 'kato', body: 'robe', sleeve: SM.black, legs: SM.black, shin: 'robe' };
const LORD_KIT: Kit = { head: 'kabuto', crest: 'crescent', mask: true, body: 'gusoku', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' };

// ------------------------------------------------------------------ the figures

/** 0: Katana Samurai, chūdan-no-kamae: the sword levelled up at the enemy's throat, both hands on the hilt. */
function katanaSamurai(c: Paper): void {
  const b = stand([0, 0], { hnN: [0.75, -8.4], elN: [-1.75, -8.55], hnF: [1.3, -7.95], elF: [2.4, -8.3] });
  const dress: Dress = { kit: SAM_KIT, body: 'gusoku', sode: 'big' };
  man(c, b, dress, {
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4])),
    hipGear: () => swords(c, b),
    held: () => {
      katana(c, b.hnN, 135, 5.0);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.lacquer, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 1: Yari Ashigaru: the nagae-yari stood upright, held close; jingasa, okegawa-dō, sashimono. */
function yariAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnN: [-1.45, -8.3], elN: [-2.75, -8.6], hnF: [-1.45, -6.6], elF: [0.5, -7.6] });
  const dress: Dress = { kit: ASHI_KIT, body: 'okegawa', sode: 'small' };
  man(c, b, dress, {
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4]), 8.6, 1.8, 4.0),
    held: () => {
      yari(c, b.hnN, 180, 8.0, 15.0);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 2: Nage-yari Skirmishers: a javelin cocked over the shoulder, the bundle on the back, a team jacket. */
function skirmisher(c: Paper): void {
  const b = stand([0, 0], { hnN: [-2.3, -13.2], elN: [-3.4, -11.3], hnF: [2.9, -8.9], elF: [2.8, -9.8], ha: 0 });
  const dress: Dress = { kit: SKIR_KIT, body: 'happi', sode: 'none' };
  man(c, b, dress, {
    back: () => {
      // A quiver-bag of javelins slung across the back, their heads fanned above the shoulder.
      const base = addP(b.pel, [-1.2, -1.2]);
      for (const [dx, t] of [[-2.0, 1], [-1.2, 2], [-0.4, 2], [0.3, 1]] as [number, number][]) {
        const tip = addP(base, [dx, -7.6]);
        vol(c, base, tip, 0.26, 0.26, 0.22, SM.wood, t, { caps: [0, 0] });
        vol(c, tip, addP(tip, [dx * 0.08, -1.2]), 0.4, 0.3, 0.06, SM.steel, t + 1, { caps: [0, 0.2] });
      }
      vol(c, addP(base, [-0.3, 0.2]), addP(base, [-0.9, -3.4]), 1.3, 1.4, 1.2, SM.straw, 2);
    },
    held: () => javelin(c, b.hnN, 110),
  });
}

/** 3: Yumi Ashigaru: the tall yumi upright in the left hand, an arrow nocked, quiver at the hip. */
function yumiAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnF: [2.55, -7.4], elF: [2.6, -9.0], hnN: [-1.6, -6.4], elN: [-2.6, -8.3] });
  const dress: Dress = { kit: ARCH_KIT, body: 'okegawa', sode: 'small' };
  man(c, b, dress, {
    back: () => {
      // The ebira (quiver) on the back hip, arrows fletched white.
      // Slung behind the near hip, slanting out so its box and the fan of fletchings show.
      vol(c, addP(b.pel, [-2.0, 1.6]), addP(b.pel, [-3.4, -2.6]), 1.3, 1.35, 1.2, SM.lacquer, 2, { detail: (_un, v) => (Math.abs(v - 0.3) < 0.04 ? code(SM.gold, 2) : -1) });
      for (const dx of [-0.45, 0.0, 0.45]) vol(c, addP(b.pel, [-3.4 + dx, -2.5]), addP(b.pel, [-4.0 + dx * 1.7, -4.4]), 0.34, 0.36, 0.28, SM.cotton, dx > 0 ? 2 : 3);
    },
    held: () => {
      // At rest: the bow upright and braced in the left hand, an arrow held along it in the right.
      yumi(c, b.hnF, 180, 0, null, false);
      vol(c, addP(b.hnN, [0.4, 1.0]), addP(b.hnN, [1.6, -4.2]), 0.18, 0.18, 0.16, SM.wood, 3, { caps: [0, 0] });
      vol(c, addP(b.hnN, [1.6, -4.2]), addP(b.hnN, [1.8, -5.0]), 0.3, 0.2, 0.05, SM.steel, 3, { caps: [0, 0.2] });
      vol(c, addP(b.hnN, [0.45, 0.7]), addP(b.hnN, [0.6, 0.0]), 0.36, 0.4, 0.3, SM.cotton, 3);
      part(c, b.hnF, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 1, fx + fy, 0.3, 0.4)));
      part(c, b.hnN, 0, ell(0.48, 0.42, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 4: Teppō Ashigaru at port arms behind a planted tate (the Nagashino line), the match smouldering. */
function teppoAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnN: [-1.35, -7.6], elN: [-2.7, -8.2], hnF: [0.95, -9.25], elF: [2.15, -8.0] });
  const dress: Dress = { kit: ASHI_KIT, body: 'okegawa', sode: 'small' };
  man(c, b, dress, {
    hipGear: () => {
      // The dōran (cartridge box) at the right hip and the coiled slow-match.
      slab(c, b.pel, [[-2.3, -0.5], [-0.9, -0.55], [-0.9, 0.9], [-2.3, 0.95]], (fx, fy) => (fy < -0.25 ? code(SM.lacquer, 3) : code(SM.lacquer, lit(c, 2, fx * 0.6, 0.4, 0.4))));
      part(c, addP(b.pel, [1.6, 0.6]), 0, ell(0.75, 0.55, 0, 0, 14), (fx, fy) => (Math.hypot(fx, fy * 1.3) < 0.38 ? -1 : code(SM.straw, fx + fy < 0 ? 2 : 1)));
    },
    held: () => {
      teppo(c, b.hnN, 140, true);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
      part(c, b.hnF, 0, ell(0.48, 0.42, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 1, fx + fy, 0.3, 0.4)));
    },
  });
  // The tate: a tall plank mantlet planted in front, braced by a prop, the clan mon painted on it.
  slab(c, [3.0, 0], [[0, -7.6], [2.6, -7.2], [2.75, 0.25], [0.05, 0.1]], (fx, fy) => {
    const plank = frac((fx + 3) / 0.85);
    if (Math.hypot(fx - 1.35, (fy + 4.6) * 0.95) < 0.75) return Math.hypot(fx - 1.35, fy + 4.6) < 0.35 ? code(SM.wood, 2) : code(SM.gold, 2);
    if (plank < 0.1) return code(SM.wood, 0);
    if (Math.abs(fy + 6.4) < 0.25 || Math.abs(fy + 1.4) < 0.25) return code(SM.wood, 1); // battens
    return code(SM.wood, fx < 0.9 ? 3 : 2);
  });
}

/** 8: Sōhei: the naginata held upright in front, a white katō, the black koromo and ochre kesa. */
function sohei(c: Paper): void {
  const b = stand([0, 0], { hnN: [-0.9, -8.6], elN: [-2.8, -8.7], hnF: [-0.85, -6.9], elF: [1.2, -7.5], anN: [-1.0, -0.45], anF: [1.15, -0.5], knN: [-1.1, -3.4], knF: [1.15, -3.4] });
  const dress: Dress = { kit: MONK_KIT, body: 'robe', sode: 'none' };
  man(c, b, dress, {
    held: () => {
      naginata(c, b.hnN, 172.5, 5.2, 7.2);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 10: Daimyō: the crescent kabuto, the horo, the jinbaori, the war fan raised to command. */
function daimyo(c: Paper): void {
  const b = stand([0, 0], { hnN: [1.4, -9.3], elN: [-1.3, -9.7], hnF: [2.2, -6.9], elF: [2.55, -8.5] });
  const dress: Dress = { kit: LORD_KIT, body: 'gusoku', sode: 'big', jinbaori: true };
  man(c, b, dress, {
    back: () => horo(c, addP(b.pel, [-1.2, -3.6]), 1.05),
    hipGear: () => swords(c, b),
    held: () => {
      gunbai(c, b.hnN, 105);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.lacquer, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

// ------------------------------------------------------------------ the horse

interface Horse {
  hide: Mat;
  mane: Mat;
  socks?: boolean;
  tassels?: boolean;
  cloth?: Mat;
}

/** A massive Sengoku warhorse at rest, 3/4 facing SE. Returns the saddle seat. */
function horse(c: Paper, hz: Horse, layer: 'far' | 'body'): P2 {
  const L = c.L;
  const H = hz.hide;
  const legV = (top: P2, knee: P2, fet: P2, hoof: P2, t: number, hind: boolean) => {
    vol(c, top, knee, hind ? 2.1 : 1.75, hind ? 1.7 : 1.4, 1.0, H, t, { caps: [0.1, 0.2] });
    vol(c, knee, fet, 0.95, 0.8, 0.85, hz.socks && !hind ? SM.cotton : H, t, { caps: [0.2, 0.2] });
    part(c, fet, 0, ell(0.55, 0.45, 0, 0, 12), (fx, fy) => code(hz.socks && !hind ? SM.cotton : H, lit(c, t, fx + fy, 0.3, 0.4))); // fetlock
    vol(c, fet, hoof, 0.7, 0.75, 0.95, SM.black, t, { caps: [0.1, 0.05] }); // pastern and hoof
  };
  if (layer === 'far') {
    legV([2.9, -6.0], [3.4, -3.3], [3.5, -1.05], [3.75, 0.0], 1, false);
    legV([-3.2, -6.4], [-4.0, -3.3], [-3.6, -1.05], [-3.5, 0.0], 1, true);
    return [0, 0];
  }
  // Tail behind the haunch.
  vol(c, [-5.3, -8.5], [-6.0, -5.6], 1.0, 1.25, 1.1, hz.mane, 1, { caps: [0.2, 0.1] });
  vol(c, [-6.0, -5.6], [-5.6, -2.9], 1.1, 0.95, 0.45, hz.mane, 1, { caps: [0.05, 0.4], detail: (un, v) => (frac(un * 1.6 + v) < 0.15 ? code(hz.mane, 0) : -1) });
  // Barrel, chest and haunch as one deep mass.
  const body: P2[] = [[5.4, -9.4], [4.6, -10.5], [2.7, -10.7], [0.5, -10.2], [-1.6, -10.3], [-3.7, -10.8], [-5.3, -9.9], [-5.9, -8.0], [-5.2, -5.9], [-3.4, -5.4], [-1.0, -4.9], [1.8, -4.9], [3.8, -5.4], [5.3, -6.6], [5.7, -8.0]];
  slab(c, [0, 0], body, (fx, fy) => {
    const s = (fy + 8) * 0.38 + fx * 0.06;
    // Satin highlights: the rump and the top of the back; the belly and the chest's far side in shadow.
    if (Math.hypot((fx + 3.6) / 1.5, (fy + 9.3) / 0.9) < 1 || (fy < -10.0 && fx < 2.5 && fx > -3.5)) return code(H, 3);
    if (Math.hypot((fx - 3.6) / 1.2, (fy + 8.7) / 0.9) < 1) return code(H, 3);
    if (fy > -5.9 + Math.abs(fx) * 0.08) return code(H, 1);
    if (L >= 4 && Math.abs(fx - 2.3 + (fy + 8) * 0.35) < 0.09 && fy > -9.6 && fy < -6.2) return code(H, 1); // shoulder line
    if (L >= 4 && Math.abs(Math.hypot((fx + 3.4) / 1.9, (fy + 8.1) / 1.6) - 1) < 0.05 && fy > -8.4) return code(H, 1); // stifle
    return code(H, s < -0.6 ? 3 : s > 0.55 ? 1 : 2);
  });
  // Saddle-cloth, saddle (high pommel and cantle), stirrup leathers.
  if (hz.cloth !== undefined) slab(c, [0, 0], [[-2.0, -10.4], [1.7, -10.6], [1.6, -7.0], [-2.1, -6.8]], (fx, fy) => (fy > -7.35 ? code(SM.gold, 2) : code(hz.cloth!, lit(c, 2, fx * 0.4 + (fy + 8.7) * 0.4, 0.5, 0.45))));
  slab(c, [0, 0], [[-1.9, -10.9], [1.4, -11.0], [1.55, -10.2], [-2.0, -10.1]], (fx) => code(SM.lacquer, fx < -0.5 ? 3 : 2));
  vol(c, [1.2, -10.4], [1.6, -11.8], 0.6, 0.55, 0.45, SM.lacquer, 3);
  vol(c, [-1.8, -10.3], [-2.3, -11.6], 0.6, 0.55, 0.45, SM.lacquer, 2);
  if (hz.tassels) {
    // Shirikake: crupper cords over the rump, big team tassels on the haunch and at the breast.
    vol(c, [-2.0, -10.2], [-5.2, -8.6], 0.3, 0.3, 0.3, SM.team, 2);
    vol(c, [-2.2, -9.6], [-4.8, -6.6], 0.3, 0.3, 0.3, SM.team, 1);
    vol(c, [-4.2, -8.0], [-4.3, -5.4], 0.6, 0.9, 1.1, SM.team, 3, { detail: (un, v) => (v > 0.6 && frac(un * 2) < 0.2 ? code(SM.team, 1) : -1) });
    vol(c, [4.9, -8.6], [5.0, -6.6], 0.5, 0.8, 0.9, SM.team, 3);
  }
  // Near legs.
  legV([2.6, -6.3], [3.0, -3.3], [3.1, -1.05], [3.3, 0.0], 2, false);
  legV([-3.5, -6.6], [-4.4, -3.3], [-4.0, -1.05], [-3.9, 0.0], 2, true);
  // Neck: a thick crest from the withers to the poll, the mane hanging on its far side.
  vol(c, [3.6, -8.4], [6.3, -12.6], 3.2, 2.6, 1.7, H, 2, { caps: [0.05, 0.2], detail: (un, v) => (un < -0.65 && v > 0.1 ? code(hz.mane, un < -0.85 ? 1 : 2) : -1) });
  // Head: a long wedge, the cheek, an eye, the ears, a bridle.
  vol(c, [6.3, -12.6], [8.4, -10.0], 1.85, 1.45, 1.0, H, 2, { caps: [0.25, 0.35], detail: (un, v) => (v > 0.12 && v < 0.24 && un < -0.15 && un > -0.55 ? code(SM.ink, 1) : v > 0.55 && Math.abs(un) < 0.12 ? code(SM.lacquer, 1) : -1) });
  part(c, [6.7, -11.9], 0, ell(0.85, 0.7, 0, 0, 14), (fx, fy) => code(H, lit(c, 2, fx * 0.8 + fy * 0.6, 0.35, 0.4)));
  vol(c, [6.1, -13.1], [5.9, -14.0], 0.45, 0.4, 0.15, H, 2, { caps: [0, 0.3] });
  vol(c, [6.0, -12.9], [5.5, -13.4], 1.0, 0.8, 0.5, hz.mane, 2); // forelock
  vol(c, [5.6, -11.4], [7.6, -11.0], 0.22, 0.22, 0.22, SM.lacquer, 1);
  return [-0.2, -10.85];
}

/** A rider's body on a horse: hips at the seat, thighs over the barrel, shins hanging to the stirrups. */
function riderBody(seat: P2, over: Partial<Body>): Body {
  const off = sub(seat, [0, -6.6]);
  const b = stand(off, over);
  b.hipN = addP(seat, [-0.6, 0.1]);
  b.hipF = addP(seat, [0.6, 0.0]);
  b.knN = addP(seat, [1.5, 2.2]);
  b.knF = addP(seat, [1.9, 1.9]);
  b.anN = addP(seat, [0.8, 4.5]);
  b.anF = addP(seat, [1.3, 4.2]);
  return b;
}

/** Rider legs: far one before the horse body, near one after. */
function riderLeg(c: Paper, b: Body, dress: Dress, far: boolean): void {
  if (far) leg(c, b.hipF, b.knF, b.anF, dress, true);
  else {
    leg(c, b.hipN, b.knN, b.anN, dress, false);
    // The abumi (a lacquered slipper stirrup) under the near foot.
    slab(c, b.anN, [[-0.4, 0.05], [1.5, 0.15], [1.4, 0.75], [-0.5, 0.65]], (fx) => code(SM.lacquer, fx < 0.4 ? 3 : 2));
  }
}

function mounted(c: Paper, hz: Horse, dress: Dress, over: Partial<Body>, layers: Parameters<typeof man>[3]): void {
  horse(c, hz, 'far');
  const seat = [-0.2, -10.85] as P2;
  const b = riderBody(seat, over);
  riderLeg(c, b, dress, true);
  horse(c, hz, 'body');
  man(c, b, { ...dress, legs: false }, layers);
  riderLeg(c, b, dress, false);
}

/** 5: Yari Cavalry: a bay; the rider in okegawa-dō and a plain kabuto, the yari carried upright. */
function yariCavalry(c: Paper): void {
  const dress: Dress = { kit: { ...SAM_KIT, crest: 'none', mask: false }, body: 'okegawa', sode: 'big' };
  const over: Partial<Body> = { hnN: [-1.4, -8.6], elN: [-2.6, -8.6], hnF: [2.6, -7.0], elF: [2.4, -8.4] };
  let bb: Body | null = null;
  const seat: P2 = [-0.2, -10.85];
  bb = riderBody(seat, over);
  const b = bb;
  mounted(c, { hide: SM.bay, mane: SM.black }, dress, over, {
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4]), 8.2, 1.8, 3.8),
    held: () => {
      yari(c, b.hnN, 180, 6.0, 13.0);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 6: Yabusame Archers: a chestnut; the rider under the flat ayaigasa, the yumi upright, an arrow nocked. */
function yabusame(c: Paper): void {
  const dress: Dress = { kit: { head: 'kasa', body: 'okegawa', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' }, body: 'okegawa', sode: 'none' };
  const over: Partial<Body> = { hnF: [2.7, -7.6], elF: [2.7, -9.1], hnN: [-0.4, -8.0], elN: [-2.4, -8.5] };
  const b = riderBody([-0.2, -10.85], over);
  mounted(c, { hide: SM.chestnut, mane: SM.straw, socks: true }, dress, over, {
    back: () => {
      // The yebira on the back with its fan of white fletchings.
      vol(c, addP(b.pel, [-2.1, -1.0]), addP(b.pel, [-2.4, -4.4]), 1.1, 1.15, 1.0, SM.lacquer, 2);
      for (const dx of [-0.5, -0.1, 0.3]) vol(c, addP(b.pel, [-2.4 + dx, -4.3]), addP(b.pel, [-2.9 + dx * 1.6, -5.9]), 0.3, 0.32, 0.25, SM.cotton, dx > 0 ? 2 : 3);
      // Mukabaki: the deerskin leg-covers hanging over the horse's flank.
      slab(c, b.pel, [[-1.3, 0.2], [1.4, 0.2], [2.4, 3.6], [-0.4, 3.9]], (fx, fy) => code(SM.straw, frac(fx * 0.9 + fy * 0.4) < 0.1 ? 1 : lit(c, 2, fx * 0.4 + fy * 0.15, 0.4, 0.5)));
    },
    held: () => {
      yumi(c, b.hnF, 176, 0.05, b.hnN, true);
      part(c, b.hnF, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 1, fx + fy, 0.3, 0.4)));
      part(c, b.hnN, 0, ell(0.48, 0.42, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

/** 7: Hatamoto Horse: a black horse with team tassels; the retainer in gusoku, kuwagata, the horo, katana raised. */
function hatamoto(c: Paper): void {
  const dress: Dress = { kit: SAM_KIT, body: 'gusoku', sode: 'big' };
  const over: Partial<Body> = { hnN: [-1.3, -15.0], elN: [-3.2, -13.4], hnF: [2.6, -7.2], elF: [2.4, -8.6] };
  const b = riderBody([-0.2, -10.85], over);
  mounted(c, { hide: SM.black, mane: SM.hair, tassels: true, cloth: SM.teamDk }, dress, over, {
    back: () => horo(c, addP(b.pel, [-1.2, -3.6]), 1.1),
    held: () => {
      katana(c, b.hnN, 150, 4.1);
      part(c, b.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.lacquer, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
}

// ------------------------------------------------------------------ 9: the ōzutsu

function ozutsuScene(c: Paper): void {
  const L = c.L;
  const crewDress: Dress = { kit: ASHI_KIT, body: 'okegawa', sode: 'small' };
  // The gunner beyond the breech with the linstock; the loader beyond the muzzle with the rammer.
  const g = stand([-4.6, -1.7], { hnN: [-1.0, -8.6], elN: [-2.6, -8.4], hnF: [2.4, -7.4], elF: [2.4, -8.8] });
  man(c, g, crewDress, {
    held: () => {
      vol(c, addP(g.hnN, [0.6, 2.2]), addP(g.hnN, [-0.9, -3.2]), 0.3, 0.3, 0.26, SM.wood, 2);
      part(c, addP(g.hnN, [-0.95, -3.35]), 0, ell(0.3, 0.3, 0, 0, 10), () => code(SM.fire, 3));
      part(c, g.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
  const l = stand([4.2, -1.9], { hnN: [-1.5, -8.3], elN: [-2.7, -8.6], hnF: [-1.5, -6.7], elF: [0.6, -7.6] });
  man(c, l, crewDress, {
    held: () => {
      vol(c, addP(l.hnN, [0, 2.6]), addP(l.hnN, [0, -4.2]), 0.3, 0.3, 0.3, SM.wood, 2);
      part(c, addP(l.hnN, [0, -4.5]), 0, ell(0.5, 0.42, 0, 0, 12), (fx, fy) => code(SM.cotton, lit(c, 2, fx + fy, 0.3, 0.4)));
      part(c, l.hnN, 0, ell(0.5, 0.45, 0, 0.05, 12), (fx, fy) => code(SM.flesh, lit(c, 2, fx + fy, 0.3, 0.4)));
    },
  });
  // The bed: heavy timbers on blocks, a wedge.
  for (const x of [-3.0, 2.6]) slab(c, [x, 0], [[-0.8, -1.2], [0.8, -1.2], [0.85, 0.15], [-0.85, 0.15]], (fx) => code(SM.wood, fx < -0.3 ? 2 : 1));
  slab(c, [0, 0], [[-4.6, -2.9], [4.4, -2.9], [4.6, -1.0], [-4.7, -1.0]], (fx, fy) => {
    if (fy < -2.6) return code(SM.wood, 3);
    if (frac((fx + 6) / 1.7 + fy * 0.1) < 0.05) return code(SM.wood, 0);
    return code(SM.wood, fy > -1.4 ? 1 : 2);
  });
  slab(c, [0, 0], [[-3.4, -3.1], [1.0, -3.6], [1.0, -2.8], [-3.4, -2.8]], (fx) => code(SM.wood, fx < -1 ? 3 : 2));
  // The barrel: a thick bronze tube, slightly raised, reinforcing rings, a flared muzzle, rope lashings.
  const br: P2 = [-3.4, -4.3], mz: P2 = [5.2, -5.6];
  vol(c, br, mz, 2.7, 2.4, 2.15, SM.bronze, 2, {
    shine: true,
    caps: [0.45, 0.1],
    detail: (un, v) => {
      if ([0.18, 0.42, 0.7].some((k) => Math.abs(v - k) < 0.03)) return code(SM.bronze, un < -0.3 ? 3 : 1);
      if ([0.3, 0.56].some((k) => Math.abs(v - k) < 0.035)) return code(SM.straw, un < 0 ? 2 : 1);
      return -1;
    },
  });
  part(c, mz, 0, ell(1.0, 1.35, 0.05, 0, 16), (fx, fy) => (Math.hypot((fx - 0.25) / 0.55, fy / 0.8) < 1 ? code(SM.ink, 0) : code(SM.bronze, lit(c, 2, fx * 0.5 + fy * 0.6, 0.35, 0.45))));
  part(c, br, 0, ell(1.15, 1.25, 0, 0, 16), (fx, fy) => code(SM.bronze, Math.hypot(fx + 0.3, fy + 0.3) < 0.35 ? 3 : lit(c, 1, fx * 0.6 + fy * 0.6, 0.4, 0.4)));
  // A cask and a pile of shot.
  void L;
  slab(c, [-6.3, 0], [[-0.9, -2.2], [0.9, -2.2], [1.0, 0.1], [-1.0, 0.1]], (fx, fy) => (Math.abs(fy + 1.6) < 0.15 || Math.abs(fy + 0.4) < 0.15 ? code(SM.iron, 1) : code(SM.wood, fx < -0.2 ? 3 : 2)));
  for (const [x, y] of [[6.5, -0.4], [7.3, -0.4], [6.9, -1.05]] as P2[]) part(c, [x, y], 0, ell(0.42, 0.4, 0, 0, 12), (fx, fy) => code(SM.iron, fx + fy < -0.3 ? 3 : 1));
}

// ------------------------------------------------------------------ entry point

const FIGURES: Record<number, (c: Paper) => void> = {
  0: katanaSamurai,
  1: yariAshigaru,
  2: skirmisher,
  3: yumiAshigaru,
  4: teppoAshigaru,
  5: yariCavalry,
  6: yabusame,
  7: hatamoto,
  8: sohei,
  9: ozutsuScene,
  10: daimyo,
};

export interface StaticFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  ax: number;
  ay: number;
}

/**
 * Paints one kind's key art (idle, SE) at a level in an army hue, with its own colour budget for the
 * level: contact lines, cluster merge, palette and coloured outline as in the live painter.
 */
export function paintSamuraiStatic(kind: number, level: number, hue: number, c: Paper = new Paper()): StaticFrame {
  c.begin(level, { w: 64, h: 64, footY: 0.86 });
  FIGURES[kind]?.(c);
  c.contact();
  c.clusters(level >= 8 ? 4 : 3);
  const fp = figurePalette(hue, level, c.codes());
  const out = c.colours(fp);
  return { width: c.CW, height: c.CH, pixels: new Uint8ClampedArray(out.buffer), ax: c.FX, ay: c.FY };
}

export const SAMURAI_STATIC_KINDS = Object.keys(FIGURES).map(Number);
