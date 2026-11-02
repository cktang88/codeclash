// Calibration: runs each metric on the PixelJoint / Slynyrd good-vs-bad example pairs that
// pixel-art-mistakes.md studied (references/pixel-mistakes/, git-ignored, never committed) and on
// the xave "128" sprite (references/comparisons/), and reports whether the metric separates good
// from bad and where a threshold between them would sit.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as M from './metrics.ts';
import type { Img } from './metrics.ts';
import type { Browser } from './browser.ts';
import { savePng } from './png.ts';

type Rect = [number, number, number, number];
interface Case {
  id: string;
  /** Guide checklist row. */
  row: string;
  file: string;
  frame?: number;
  bad?: Rect;
  good?: Rect;
  /** A second file for the other side of the pair. */
  goodFile?: string;
  goodFrame?: number;
  /** Which number to compare, and whether higher is worse. */
  metric: string;
  higherIsWorse: boolean;
  /** Mask: subject = not the border colour; 'all' = every pixel; 'dark' = the line pixels. */
  mask?: 'subject' | 'all' | 'dark';
  /** Known art-pixel size of the picture (skips detection). */
  grid?: number;
  badGrid?: number;
  note: string;
}

const UPPER_LEFT: [number, number] = [-Math.SQRT1_2, -Math.SQRT1_2];

const CASES: Case[] = [
  { id: 'pillow-skull', row: '1', file: 'pj_SMDVCsx.png', bad: [0, 0, 309, 250], good: [309, 0, 309, 250], metric: 'corrEdge', higherIsWorse: true, note: 'pillow vs upper-left lit skull' },
  { id: 'pillow-skull/light', row: '1', file: 'pj_SMDVCsx.png', bad: [0, 0, 309, 250], good: [309, 0, 309, 250], metric: 'corrLight', higherIsWorse: false, note: 'same pair, light-axis correlation' },
  { id: 'pillow-skull2', row: '1', file: 'pj_PbL6ZBg.png', bad: [0, 0, 301, 240], good: [301, 0, 301, 240], metric: 'corrEdge', higherIsWorse: true, note: 'pillow vs frontal-lit skull (light axis not upper-left)' },
  { id: 'banding-hug', row: '2', file: 'pj_W2ULcuu.png', bad: [0, 38, 234, 252], good: [234, 38, 235, 252], metric: 'hug', higherIsWorse: true, note: 'dark rim hugging the edge vs broken rim' },
  { id: 'banding-column', row: '2', file: 'pj_WeEL1Kg.png', bad: [0, 50, 257, 140], good: [257, 50, 257, 140], metric: 'aligned', higherIsWorse: true, mask: 'all', note: 'purple columns end flush vs shifted' },
  { id: 'banding-aa', row: '2/15', file: 'pj_NLQGKlc.png', bad: [0, 0, 386, 303], badGrid: 24, goodFile: 'pj_SQu3W0U.png', good: [0, 20, 294, 210], metric: 'stack', higherIsWorse: true, mask: 'all', note: 'stacked AA column (bad) vs good AA (SQu3W0U left)' },
  { id: 'jaggies', row: '3', file: 'pj_S2dbRxm.gif', bad: [0, 68, 136, 330], good: [140, 68, 132, 330], metric: 'jaggiesPer32', higherIsWorse: true, mask: 'dark', grid: 10, note: 'jaggy curve/diagonal/V vs even runs' },
  { id: 'aa-too-much', row: '15', file: 'pj_SQu3W0U.png', good: [0, 20, 294, 210], bad: [294, 20, 294, 210], metric: 'colours', higherIsWorse: true, mask: 'all', note: 'good AA vs too much AA (colour count)' },
  { id: 'aa-too-much/stack', row: '15', file: 'pj_SQu3W0U.png', good: [0, 20, 294, 210], bad: [294, 20, 294, 210], metric: 'stack', higherIsWorse: true, mask: 'all', note: 'same pair, 1-px gradient stacks' },
  { id: 'dither', row: '6', file: 'pj_lf2GOkz.png', good: [0, 30, 237, 164], bad: [237, 30, 237, 164], metric: 'checkers', higherIsWorse: true, mask: 'all', note: 'buffer dither vs dither field' },
  { id: 'noise', row: '5', file: 'pj_5Nb6rRz.png', bad: [0, 30, 296, 170], goodFile: 'pj_lf2GOkz.png', good: [0, 30, 237, 164], metric: 'orphanFrac', higherIsWorse: true, mask: 'all', note: 'random dither (bad) vs buffer dither (lf2GOkz left)' },
  { id: 'outline-solid', row: '9', file: 'pj_Wy2dNeD.png', good: [0, 70, 361, 320], bad: [361, 70, 362, 320], metric: 'continuity', higherIsWorse: false, note: 'solid outline vs broken sel-out' },
  { id: 'outline-solid/jag', row: '3/9', file: 'pj_Wy2dNeD.png', good: [0, 70, 361, 320], bad: [361, 70, 362, 320], metric: 'jaggiesPer32', higherIsWorse: true, note: 'same pair: the guide says broken sel-out adds jaggies' },
  { id: 'outline-lit', row: '9', file: 'pj_6MaPN1I.png', good: [0, 70, 369, 320], bad: [369, 70, 369, 320], metric: 'litMinusDark', higherIsWorse: false, note: 'outline shaded by the light vs sel-out ignoring it' },
  { id: 'value', row: '12', file: 'pj_OBewEc2.gif', goodFile: 'pj_EnwVHM2.gif', metric: 'stdL', higherIsWorse: false, note: 'low-contrast pug vs improved (standard deviation of OKLab L)' },
  { id: 'value/range', row: '12', file: 'pj_OBewEc2.gif', goodFile: 'pj_EnwVHM2.gif', metric: 'lRange', higherIsWorse: false, note: 'same pair, L 5th-95th percentile range' },
  { id: 'value/spread', row: '12', file: 'pj_OBewEc2.gif', goodFile: 'pj_EnwVHM2.gif', metric: 'spread', higherIsWorse: false, note: 'same pair, k-means band spread (the guide\'s test)' },
  { id: 'value/thumb3', row: '12', file: 'pj_OBewEc2.gif', goodFile: 'pj_EnwVHM2.gif', metric: 'thumb3', higherIsWorse: false, note: 'same pair, 3-value thumbnail score' },
  { id: 'jpg', row: '10', file: 'pj_V3vLiKV.gif', frame: 0, goodFile: 'pj_V3vLiKV.gif', goodFrame: 1, metric: 'colours', higherIsWorse: true, mask: 'all', grid: 1, note: 'JPG-damaged frame (0) vs clean frame (1): colours off the 21-colour palette' },
  { id: 'jpg/impure', row: '10', file: 'pj_V3vLiKV.gif', frame: 0, goodFile: 'pj_V3vLiKV.gif', goodFrame: 1, metric: 'impure', higherIsWorse: true, mask: 'all', grid: 4, note: 'same pair: 4×4 art-pixel blocks that are not one flat colour' },
  { id: 'blur', row: '10', file: 'pj_aNNXk7S.png', goodFile: 'pj_SQu3W0U.png', good: [0, 20, 294, 210], metric: 'stack', higherIsWorse: true, mask: 'all', note: 'automatic blur tool vs clean AA' },
];

const pick = (r: Record<string, number>, k: string): number => r[k] ?? NaN;

/** Every metric on one picture, after taking it back to native pixels. */
function measure(raw: Img, mode: Case['mask'], grid?: number): { values: Record<string, number>; grid: number; native: Img } {
  const g = M.gridStats(raw, 16, 0, grid ?? 0);
  const m = M.downsample(raw, g.grid, g.ox, g.oy);
  const bg = M.borderColour(m);
  let mask: M.Mask;
  if (mode === 'all') mask = new Uint8Array(m.w * m.h).fill(1);
  else if (mode === 'dark') {
    const L = M.lightness(m);
    mask = new Uint8Array(m.w * m.h);
    for (let i = 0; i < mask.length; i++) mask[i] = L[i]! < 0.3 ? 1 : 0;
  } else mask = M.notBackground(m, bg, 12);
  const cs = M.colourStats(m, mask);
  const cl = M.clusterStats(m, mask);
  const clIn = M.clusterStats(m, mask, M.ring(mask, m.w, m.h));
  const ln = M.lineStats(mask, m.w, m.h);
  const sh = M.shadeStats(m, mask, UPPER_LEFT);
  const bd = M.bandStats(m, mask);
  const ol = M.outlineStats(m, mask, UPPER_LEFT, bg);
  const vs = M.valueStats(m, mask, bg);
  const ck = M.checkers(m, mask);
  const Ls = [...M.lightness(m)].filter((_, i) => mask[i]).sort((a, b) => a - b);
  const meanL = Ls.reduce((a, b) => a + b, 0) / (Ls.length || 1);
  const stdL = Math.sqrt(Ls.reduce((a, b) => a + (b - meanL) ** 2, 0) / (Ls.length || 1));
  const bdIn = M.bandStats(m, mask, M.ring(mask, m.w, m.h));
  const lRange = Ls.length ? Ls[Math.floor(Ls.length * 0.95)]! - Ls[Math.floor(Ls.length * 0.05)]! : 0;
  return {
    grid: g.grid,
    native: m,
    values: {
      corrEdge: sh.corrEdge,
      corrLight: sh.corrLight,
      lightAngleErr: sh.lightAngleErr,
      hug: bd.hug,
      stack: bd.stack,
      aligned: bd.aligned,
      jaggiesPer32: ln.jaggiesPer32,
      doublesFrac: ln.doublesFrac,
      colours: cs.colours,
      rareColours: cs.rare,
      nearDup: cs.nearDup,
      orphanFrac: cl.orphanFrac,
      orphanInner: clIn.orphanFrac,
      meanClusterInner: clIn.meanCluster,
      meanCluster: cl.meanCluster,
      edgeDensity: cl.edgeDensity,
      checkers: ck.per1000,
      continuity: ol.continuity,
      outlineBlack: ol.black,
      outlineColours: ol.colours,
      outlineChroma: ol.chroma,
      litMinusDark: ol.litMinusDark,
      spread: vs.spread,
      bands: vs.bands,
      thumb3: vs.thumb3,
      lRange,
      stdL,
      hugInner: bdIn.hug,
      impure: g.impure,
      deviation: g.deviation,
    },
  };
}

export interface CalibrationRow {
  id: string;
  row: string;
  metric: string;
  note: string;
  bad: number;
  good: number;
  separates: boolean;
  /** A threshold halfway between the two (in the metric's own units). */
  midpoint: number;
  grid: [number, number];
}

export interface Calibration {
  dir: string | null;
  rows: CalibrationRow[];
  /** Every metric on hand-approved sprites (the xave 128 girl; the clean halves above). */
  approved: Record<string, Record<string, number>>;
  ramp: { file: string; hueDrift: number; steps: number[]; darkChroma: number } | null;
  iso: { good: M.IsoStats; synthetic30: M.IsoStats; synthetic2to1: M.IsoStats } | null;
}

/** Finds references/<sub> in the repo or any parent (worktrees live inside the main checkout). */
export function findRefs(root: string, sub: string): string | null {
  let d = root;
  for (let i = 0; i < 6; i++) {
    const p = join(d, 'references', sub);
    if (existsSync(p)) return p;
    const up = join(d, '..');
    if (up === d) break;
    d = up;
  }
  return null;
}

export async function calibrate(B: Browser, root: string, debugDir?: string): Promise<Calibration> {
  const dir = findRefs(root, 'pixel-mistakes');
  const out: Calibration = { dir, rows: [], approved: {}, ramp: null, iso: null };
  if (!dir) return out;
  const cache = new Map<string, Img>();
  const load = async (f: string, fr = 0) => {
    const k = `${f}#${fr}`;
    let m = cache.get(k);
    if (!m) cache.set(k, (m = await B.decode(join(dir, f), fr)));
    return m;
  };
  for (const c of CASES) {
    if (!existsSync(join(dir, c.file))) continue;
    const badRaw = await load(c.file, c.frame ?? 0);
    const goodRaw = await load(c.goodFile ?? c.file, c.goodFrame ?? c.frame ?? 0);
    const b = measure(c.bad ? M.crop(badRaw, ...c.bad) : badRaw, c.mask, c.badGrid ?? c.grid);
    const g = measure(c.good ? M.crop(goodRaw, ...c.good) : goodRaw, c.mask, c.grid);
    if (debugDir) {
      savePng(join(debugDir, `cal-${c.id.replace(/\//g, '_')}-bad.png`), M.upscale(b.native, 6));
      savePng(join(debugDir, `cal-${c.id.replace(/\//g, '_')}-good.png`), M.upscale(g.native, 6));
    }
    const bv = pick(b.values, c.metric), gv = pick(g.values, c.metric);
    out.rows.push({
      id: c.id,
      row: c.row,
      metric: c.metric,
      note: c.note,
      bad: bv,
      good: gv,
      separates: c.higherIsWorse ? bv > gv : bv < gv,
      midpoint: (bv + gv) / 2,
      grid: [b.grid, g.grid],
    });
    out.approved[`${c.id} (good half)`] = g.values;
  }
  // Hand-approved sprite: xave's "128" girl from the comparison sheet.
  const comp = findRefs(root, 'comparisons');
  const xf = comp ? join(comp, 'r3-templar-vs-xave-medieval2.png') : '';
  if (xf && existsSync(xf)) {
    const raw = await load(join('..', 'comparisons', 'r3-templar-vs-xave-medieval2.png'));
    const x = measure(M.crop(raw, 0, 196, 160, 278), 'subject');
    out.approved['xave 128 girl'] = { ...x.values, grid: x.grid };
    if (debugDir) savePng(join(debugDir, 'cal-xave.png'), M.upscale(x.native, 4));
  }
  // Ramp strip: nine swatches.
  if (existsSync(join(dir, 'pj_9iGrBo9.png'))) {
    const s = await load('pj_9iGrBo9.png');
    const lch: [number, number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const x = Math.round(((k + 0.5) * s.w) / 9), i = (Math.round(s.h / 2) * s.w + x) * 4;
      lch.push(M.oklch(s.d[i]!, s.d[i + 1]!, s.d[i + 2]!));
    }
    // The coloured steps (skip the near-black and near-white ends).
    const col = lch.filter((c) => c[1] > 0.03);
    const steps = col.slice(1).map((c, k) => M.hueDiff(c[2], col[k]![2]));
    out.ramp = { file: 'pj_9iGrBo9.png', hueDrift: M.hueDiff(col[0]![2], col[col.length - 1]![2]), steps, darkChroma: col[0]![1] / col[Math.floor(col.length / 2)]![1] };
  }
  // Iso lines: Slynyrd's tile sheet (good) against synthetic 30° and 2:1 lines.
  if (existsSync(join(dir, 'sly_iso_tiles.png'))) {
    const s = await load('sly_iso_tiles.png');
    const g = M.gridStats(s);
    // The six ground cubes (top-left of the sheet, in native pixels), on the sheet's flat background.
    const m = M.crop(M.downsample(s, g.grid, g.ox, g.oy), 27, 42, 104, 74);
    const mask = M.notBackground(m, M.borderColour(m), 12);
    if (debugDir) savePng(join(debugDir, `cal-iso-${g.grid}.png`), M.upscale(m, 2));
    const synth = (slope: number) => {
      const w = 120, h = 80;
      const k = new Uint8Array(w * h);
      for (let x = 0; x < w; x++) for (let y = Math.floor(10 + x * slope); y < h; y++) k[y * w + x] = 1;
      return M.isoStats(k, w, h);
    };
    out.iso = { good: M.isoStats(mask, m.w, m.h), synthetic30: synth(Math.tan(Math.PI / 6)), synthetic2to1: synth(0.5) };
  }
  return out;
}
