// Runs every metric over the battle sprites: per art × faction × kind × level.

import * as M from './metrics.ts';
import type { Frame, Img } from './metrics.ts';
import type { Art, Faction, Painters, Palette } from './painters.ts';

export const ANIM = { Idle: 0, Walk: 1, Run: 2, Attack: 3, Shoot: 4, Hit: 5, Die: 6, Dead: 7, Brace: 8 } as const;
/** The preview's field green: the ground every sprite is judged against. */
export const FIELD = 0x56603a;
/** Toward the key light in image space: the painters' LC (upper left, a little toward the eye) projected. */
export const KEY_LIGHT: [number, number] = (() => {
  const x = -0.75, y = 0.5 * 0.12 - (Math.sqrt(3) / 2) * 0.7;
  const n = Math.hypot(x, y);
  return [x / n, y / n];
})();
/** Ramps that are exempt from cluster/orphan rules (eyes, glows, strings, fire), as the painters do. */
const EXEMPT = new Set(['ink', 'glow', 'fire', 'string']);
/** Ramps whose checker is deliberate texture (craft §2: mail as an offset checker in the lit plane). */
const TEXTURED = new Set(['mail', 'rmail']);
const SHADOW_ALPHA = 92;

export interface RampInfo {
  name: string;
  /** OKLCH of the four tones. */
  lch: [number, number, number][];
  /** Hue travel deep → light (degrees, shortest way). */
  hueDrift: number;
  /** Smallest hue change between adjacent tones. */
  minStep: number;
  /** Chroma of the deep tone over chroma of the base tone. */
  darkChroma: number;
  neutral: boolean;
  /** A shadow tone that is grey (C < 0.02) while the lit tone is coloured (C > 0.06). */
  greyShadow: boolean;
  /** Where the chroma peaks (0 deep .. 3 light); the techniques guide wants 1 (the shade step). */
  chromaPeak: number;
}

export function rampInfo(p: Palette): RampInfo[] {
  return p.ramps.map((rp, r) => {
    const lch = rp.map(([a, b, c]) => M.oklch(a, b, c));
    const neutral = Math.max(...lch.map((x) => x[1])) < 0.03;
    const steps = [0, 1, 2].map((t) => M.hueDiff(lch[t]![2], lch[t + 1]![2]));
    return {
      name: p.names[r] ?? `r${r}`,
      lch,
      hueDrift: M.hueDiff(lch[0]![2], lch[3]![2]),
      minStep: Math.min(...steps),
      darkChroma: lch[2]![1] > 0 ? lch[0]![1] / lch[2]![1] : 1,
      neutral,
      greyShadow: (lch[0]![1] < 0.02 || lch[1]![1] < 0.02) && Math.max(lch[2]![1], lch[3]![1]) > 0.06,
      chromaPeak: lch.map((x) => x[1]).indexOf(Math.max(...lch.map((x) => x[1]))),
    };
  });
}

export interface SpriteResult {
  art: Art;
  faction: Faction;
  kind: number;
  name: string;
  level: number;
  size: [number, number];
  opaque: number;
  colours: M.ColourStats;
  clusters: Omit<M.ClusterStats, 'orphans'>;
  lines: Omit<M.LineStats, 'doubleIdx'>;
  shade: M.ShadeStats;
  shadeRegions: M.ShadeStats;
  bands: Omit<M.BandStats, 'hugIdx'>;
  checkers: number;
  outline: M.OutlineStats;
  value: M.ValueStats;
  parts: { lowFrac: number; meanDL: number };
  ramps: { used: number; meanTones: number; straightPx: number; greyShadowPx: number; bandShare: number[]; accent: string };
  idle: M.TemporalStats;
  walk: M.TemporalStats;
  /** Pixels a painter wrote that are in no ramp or outline table (blends, smears). */
  offPalette: number;
}

/** Per-pixel: ramp id for fill pixels, -2 for outline colours, -3 for the shadow, -1 otherwise. */
export function labels(m: Img, p: Palette): { ramp: Int32Array; tone: Int8Array; off: number } {
  const ramp = new Int32Array(m.w * m.h).fill(-1);
  const tone = new Int8Array(m.w * m.h).fill(-1);
  let off = 0;
  for (let i = 0; i < m.w * m.h; i++) {
    const a = m.d[i * 4 + 3]!;
    if (a === 0) continue;
    if (a === SHADOW_ALPHA) {
      ramp[i] = -3;
      continue;
    }
    const k = M.key(m, i);
    const f = p.fill.get(k);
    if (f !== undefined) {
      ramp[i] = f >> 2;
      tone[i] = f & 3;
    } else if (p.edge.has(k)) ramp[i] = -2;
    else off++;
  }
  return { ramp, tone, off };
}

/** Connected regions (4-connected) of one ramp: the "material regions" for pillow and part contrast. */
export function regions(ramp: Int32Array, w: number, h: number): Int32Array {
  const out = new Int32Array(w * h).fill(-1);
  let id = 0;
  const st: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (ramp[i0]! < 0 || out[i0]! >= 0) continue;
    out[i0] = id;
    st.push(i0);
    while (st.length) {
      const i = st.pop()!;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || out[j]! >= 0 || ramp[j] !== ramp[i0]) continue;
        out[j] = id;
        st.push(j);
      }
    }
    id++;
  }
  return out;
}

export function analyseStatic(m: Img, p: Palette, info: RampInfo[]) {
  const mask = M.opaque(m);
  const { ramp, tone, off } = labels(m, p);
  const rg = M.ring(mask, m.w, m.h);
  const skip = new Uint8Array(m.w * m.h);
  const noTex = new Uint8Array(m.w * m.h);
  for (let i = 0; i < m.w * m.h; i++) {
    const r = ramp[i]!;
    if (rg[i] || r === -2 || (r >= 0 && EXEMPT.has(p.names[r]!))) skip[i] = 1;
    noTex[i] = mask[i] && !(r >= 0 && TEXTURED.has(p.names[r]!)) ? 1 : 0;
  }
  const reg = regions(ramp, m.w, m.h);
  const cl = M.clusterStats(m, mask, skip);
  const ln = M.lineStats(mask, m.w, m.h);
  const used = new Map<number, Set<number>>();
  let straightPx = 0, greyPx = 0, fillN = 0;
  const share = [0, 0, 0, 0];
  for (let i = 0; i < m.w * m.h; i++) {
    const r = ramp[i]!;
    if (r < 0) continue;
    fillN++;
    share[tone[i]!]!++;
    if (!used.has(r)) used.set(r, new Set());
    used.get(r)!.add(tone[i]!);
    const ri = info[r]!;
    if (!ri.neutral && ri.hueDrift < 5) straightPx++;
    if (ri.greyShadow && tone[i]! <= 1 && ri.lch[tone[i]!]![1] < 0.02) greyPx++;
  }
  let accent = '';
  let best = -1;
  for (const r of used.keys()) {
    const c = info[r]!.lch[2]![1];
    if (c > best) {
      best = c;
      accent = info[r]!.name;
    }
  }
  const tonesUsed = [...used.values()].map((s) => s.size);
  return {
    mask,
    reg,
    cl,
    ln,
    off,
    res: {
      opaque: M.count(mask),
      colours: M.colourStats(m, mask),
      clusters: { orphanFrac: cl.orphanFrac, smallFrac: cl.smallFrac, meanCluster: cl.meanCluster, edgeDensity: cl.edgeDensity },
      lines: { jaggiesPer32: ln.jaggiesPer32, jaggies: ln.jaggies, edgePx: ln.edgePx, doublesFrac: ln.doublesFrac, doubles: ln.doubles },
      shade: M.shadeStats(m, mask, KEY_LIGHT),
      shadeRegions: M.shadeStats(m, mask, KEY_LIGHT, reg),
      bands: (({ hugIdx: _h, ...b }) => b)(M.bandStats(m, mask, rg)),
      checkers: M.checkers(m, noTex).per1000,
      outline: M.outlineStats(m, mask, KEY_LIGHT, FIELD, SHADOW_ALPHA),
      value: M.valueStats(m, mask, FIELD),
      parts: M.partContrast(m, mask, reg),
      ramps: {
        used: used.size,
        meanTones: tonesUsed.length ? tonesUsed.reduce((a, b) => a + b, 0) / tonesUsed.length : 0,
        straightPx: fillN ? straightPx / fillN : 0,
        greyShadowPx: fillN ? greyPx / fillN : 0,
        bandShare: share.map((s) => (fillN ? s / fillN : 0)),
        accent,
      },
      offPalette: off,
    },
  };
}

export function framesOf(P: Painters, art: Art, faction: Faction, kind: number, level: number, anim: number, dir = 0): Frame[] {
  const n = P.frameCount(art, anim);
  return Array.from({ length: n }, (_, f) => P.frame(art, faction, kind, level, anim, f, dir));
}

export function auditSprite(P: Painters, art: Art, faction: Faction, kind: number, level: number, name: string, p: Palette, info: RampInfo[]): { res: SpriteResult; idle0: Frame } {
  const idle = framesOf(P, art, faction, kind, level, ANIM.Idle);
  const walk = framesOf(P, art, faction, kind, level, ANIM.Walk);
  const f0 = idle[0]!;
  const s = analyseStatic(f0.m, p, info);
  return {
    res: {
      art,
      faction,
      kind,
      name,
      level,
      size: [f0.m.w, f0.m.h],
      ...s.res,
      idle: M.temporalStats(idle, true),
      walk: M.temporalStats(walk, true),
    },
    idle0: f0,
  };
}

/** Pairwise silhouette IoU of the eleven kinds' level-1 idle frames (one faction, one art). */
export function silhouettes(frames: Frame[], names: string[]): { a: string; b: string; iou: number; best: number }[] {
  const masks = frames.map((f) => M.opaque(f.m));
  const out: { a: string; b: string; iou: number; best: number }[] = [];
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const A = frames[i]!, B = frames[j]!;
      const r = M.iou(masks[i]!, A.m.w, A.m.h, A.ax, A.ay, masks[j]!, B.m.w, B.m.h, B.ax, B.ay);
      out.push({ a: names[i]!, b: names[j]!, iou: r.iou, best: r.best });
    }
  return out.sort((x, y) => y.best - x.best);
}
