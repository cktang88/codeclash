// Compares the HD 64 reductions in src/client/render/downscale.ts on every kind of every faction:
// contact sheets (the 128 source, the native level-4 paint, then each candidate shown at 2× so
// all columns are the same size) and lint numbers per candidate.
//
//   pnpm exec tsx scripts/hd64-compare.ts [--factions=templar] [--out=docs/screenshots/hd64] [--candidates=mode,feature]
//
// Writes <out>/compare-<faction>-<pose>.png and prints a markdown table of the numbers.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as M from './pixel-lint/metrics.ts';
import type { Img, Frame } from './pixel-lint/metrics.ts';
import { savePng } from './pixel-lint/png.ts';
import { Painters, FACTION_IDS, type Faction } from './pixel-lint/painters.ts';
import { ANIM, FIELD, analyseStatic, framesOf, rampInfo } from './pixel-lint/sprite-audit.ts';

const root = resolve(import.meta.dirname, '..');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const factions = (arg('factions')?.split(',') ?? [...FACTION_IDS]) as Faction[];
const kinds = arg('kinds')?.split(',').map(Number) ?? Array.from({ length: 11 }, (_, i) => i);
const outDir = resolve(root, arg('out') ?? 'docs/screenshots/hd64');
const log = (s: string) => process.stderr.write(s + '\n');
const BG: [number, number, number] = [(FIELD >> 16) & 255, (FIELD >> 8) & 255, FIELD & 255];

/** 8-connected components of a mask. */
function components(m: Img): number {
  const { w, h } = m;
  const seen = new Uint8Array(w * h);
  let n = 0;
  const st: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || m.d[i * 4 + 3]! !== 255) continue;
    n++;
    seen[i] = 1;
    st.push(i);
    while (st.length) {
      const p = st.pop()!;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (!seen[q] && m.d[q * 4 + 3]! === 255) {
            seen[q] = 1;
            st.push(q);
          }
        }
    }
  }
  return n;
}

/** Frames placed in equal cells, foot points aligned, on the field colour. */
function row(frames: { f: Frame; k: number }[], gap = 6): Img {
  const fx = Math.max(...frames.map(({ f, k }) => f.ax * k)), fy = Math.max(...frames.map(({ f, k }) => f.ay * k));
  const cw = fx + Math.max(...frames.map(({ f, k }) => (f.m.w - f.ax) * k)), ch = fy + Math.max(...frames.map(({ f, k }) => (f.m.h - f.ay) * k));
  const W = frames.length * (cw + gap) + gap, H = ch + 2 * gap;
  const out = M.img(W, H);
  for (let i = 0; i < W * H; i++) out.d.set([27, 23, 18, 255], i * 4);
  frames.forEach(({ f, k }, c) => {
    const ox = gap + c * (cw + gap), oy = gap;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out.d.set([...BG, 255], ((oy + y) * W + ox + x) * 4);
    for (let y = 0; y < f.m.h * k; y++)
      for (let x = 0; x < f.m.w * k; x++) {
        const tx = ox + fx - f.ax * k + x, ty = oy + fy - f.ay * k + y;
        if (tx < ox || ty < oy || tx >= ox + cw || ty >= oy + ch) continue;
        const i = (((y / k) | 0) * f.m.w + ((x / k) | 0)) * 4;
        const a = f.m.d[i + 3]!;
        if (!a) continue;
        const o = (ty * W + tx) * 4;
        for (let c2 = 0; c2 < 3; c2++) out.d[o + c2] = Math.round((f.m.d[i + c2]! * a + out.d[o + c2]! * (255 - a)) / 255);
      }
  });
  return out;
}
const stack = (rows: Img[]): Img => {
  const w = Math.max(...rows.map((r) => r.w));
  const h = rows.reduce((s, r) => s + r.h, 0);
  const out = M.img(w, h);
  for (let i = 0; i < w * h; i++) out.d.set([27, 23, 18, 255], i * 4);
  let y0 = 0;
  for (const r of rows) {
    for (let y = 0; y < r.h; y++) out.d.set(r.d.subarray(y * r.w * 4, (y + 1) * r.w * 4), (y0 + y) * w * 4);
    y0 += r.h;
  }
  return out;
};

interface Acc {
  n: number;
  orphan: number;
  edge: number;
  cluster: number;
  colours: number;
  outline: number;
  off: number;
  extraParts: number;
  flicker: number;
  idleChurn: number;
  ms: number;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const P = await Painters.load(root);
  const cands = arg('candidates')?.split(',') ?? P.halvers;
  const acc = new Map<string, Acc>();
  for (const c of ['native L4', ...cands]) acc.set(c, { n: 0, orphan: 0, edge: 0, cluster: 0, colours: 0, outline: 0, off: 0, extraParts: 0, flicker: 0, idleChurn: 0, ms: 0 });
  try {
    if (process.argv.includes('--blows')) {
      // Every melee blow of every kind, the chosen reduction: per blow, wind-up, strike and
      // follow-through frames, the 128 source (1×) beside its HD 64 frame (2×).
      P.halver = 'feature';
      const n = P.frameCount('hd', ANIM.Attack);
      for (const f of factions) {
        const rs: Img[] = [];
        for (const kind of kinds) {
          const blows = P.blows('hd', f, kind);
          const cells: { f: Frame; k: number }[] = [];
          for (let b = 0; b < blows; b++)
            for (const fr of [3, 5, 7]) {
              cells.push({ f: P.frame('hd', f, kind, 8, ANIM.Attack, b * n + fr, 0), k: 1 });
              cells.push({ f: P.frame('hd64', f, kind, 4, ANIM.Attack, b * n + fr, 0), k: 2 });
            }
          rs.push(row(cells));
          log(`blows ${f} k${kind}: ${blows}`);
        }
        savePng(join(outDir, `blows-${f}.png`), stack(rs));
      }
      return;
    }
    for (const f of factions) {
      const pal8 = P.palette('hd', f, 8), pal4 = P.palette('hd', f, 4);
      const info8 = rampInfo(pal8), info4 = rampInfo(pal4);
      const poses: [string, number, number, number][] = [
        ['idle-se', ANIM.Idle, 0, 0],
        ['idle-ne', ANIM.Idle, 0, 3],
        ['attack-se', ANIM.Attack, 5, 0],
      ];
      const rows = new Map<string, Img[]>(poses.map(([p]) => [p, []]));
      for (const kind of kinds) {
        const t0 = performance.now();
        // Source and native level 4 first (each paints its sheet once).
        const src = poses.map(([, a, fr, d]) => P.frame('hd', f, kind, 8, a, fr, d));
        const srcParts = src.map((x) => components(x.m));
        const nat = poses.map(([, a, fr, d]) => P.frame('hd', f, kind, 4, a, fr, d));
        const natIdle = framesOf(P, 'hd', f, kind, 4, ANIM.Idle);
        const natWalk = framesOf(P, 'hd', f, kind, 4, ANIM.Walk);
        const add = (name: string, frs: Frame[], idle: Frame[], walk: Frame[], pal: typeof pal8, info: typeof info8, ms: number) => {
          const a = acc.get(name)!;
          frs.forEach((x, i) => {
            const s = analyseStatic(x.m, pal, info).res;
            a.n++;
            a.orphan += s.clusters.orphanFrac;
            a.edge += s.clusters.edgeDensity;
            a.cluster += s.clusters.meanCluster;
            a.colours += s.colours.colours;
            a.outline += s.outline.continuity;
            a.off += s.offPalette;
            a.extraParts += Math.max(0, components(x.m) - srcParts[i]!);
          });
          const ti = M.temporalStats(idle, true), tw = M.temporalStats(walk, true);
          a.flicker += Math.max(ti.flicker, tw.flicker) * frs.length;
          a.idleChurn += ti.headChurn * frs.length;
          a.ms += ms;
        };
        add('native L4', nat, natIdle, natWalk, pal4, info4, 0);
        const outs: Frame[][] = [];
        for (const c of cands) {
          P.halver = c;
          const t1 = performance.now();
          const fr = poses.map(([, a, fr2, d]) => P.frame('hd64', f, kind, 4, a, fr2, d));
          const ms = performance.now() - t1;
          outs.push(fr);
          add(c, fr, framesOf(P, 'hd64', f, kind, 4, ANIM.Idle), framesOf(P, 'hd64', f, kind, 4, ANIM.Walk), pal8, info8, ms);
        }
        poses.forEach(([p], i) => {
          const s = src[i]!;
          const r = row([{ f: s, k: 1 }, { f: nat[i]!, k: 2 }, ...outs.map((o) => ({ f: o[i]!, k: 2 }))]);
          rows.get(p)!.push(r);
          if (process.argv.includes('--rows')) savePng(join(outDir, `row-${f}-${p}-k${kind}.png`), M.upscale(r, 2));
        });
        log(`${f} k${kind} ${Math.round(performance.now() - t0)} ms`);
      }
      for (const [p, rs] of rows) savePng(join(outDir, `compare-${f}-${p}.png`), stack(rs));
    }
  } finally {
    await P.close();
  }
  const L = ['| reduction | orphans | edge density | mean cluster | colours | outline closed | off-palette px | extra parts | idle/walk flicker | idle head boil | ms per kind (3 frames + halving) |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [c, a] of acc) {
    const n = a.n || 1;
    L.push(`| ${c} | ${((a.orphan / n) * 100).toFixed(1)}% | ${(a.edge / n).toFixed(3)} | ${(a.cluster / n).toFixed(2)} | ${(a.colours / n).toFixed(1)} | ${((a.outline / n) * 100).toFixed(0)}% | ${a.off} | ${(a.extraParts / n).toFixed(2)} | ${((a.flicker / n) * 100).toFixed(2)}% | ${((a.idleChurn / n) * 100).toFixed(2)}% | ${c === 'native L4' ? '-' : Math.round(a.ms / (n / 3))} |`);
  }
  process.stdout.write(`Columns in the contact sheets: 128 source (1×), native level-4 paint, ${cands.join(', ')} (each 2×).\n\n${L.join('\n')}\n`);
}

await main();
