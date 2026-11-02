// Pixel lint: measures the generated art against docs/art-references/pixel-art-mistakes.md (the
// checklist) and the measurable items of pixel-art-techniques.md §8.
//
//   pnpm pixel-lint                       everything (≈ 5-10 min): sprites, city, screens, calibration
//   pnpm pixel-lint --only=sprites        battle sprites only (classic 48 + HD levels 1, 2, 4, 8)
//   pnpm pixel-lint --only=city,screens   the city renderer and on-screen scaling
//   pnpm pixel-lint --quick               HD levels 1-2 only, two city tiers, no screens
//   options: --factions=templar,undead --levels=1,4 --out=<dir> --shots=<dir> --strict (exit 1 on any fail)
//
// Writes <out>/pixel-lint.json and <out>/pixel-lint.md (default docs/art-references/pixel-lint/),
// and screenshots of the worst offenders (our own art only) to <shots> (default
// docs/screenshots/audit/). Sprites are painted in Node through Vite's SSR loader; the city,
// the battle screen and the reference images go through headless Chromium (Playwright).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as M from './pixel-lint/metrics.ts';
import type { Img, Frame } from './pixel-lint/metrics.ts';
import { savePng } from './pixel-lint/png.ts';
import { Painters, FACTION_IDS, type Art, type Faction } from './pixel-lint/painters.ts';
import { ANIM, FIELD, auditSprite, framesOf, labels, rampInfo, silhouettes, type SpriteResult } from './pixel-lint/sprite-audit.ts';
import { Browser } from './pixel-lint/browser.ts';
import { auditCity } from './pixel-lint/city-audit.ts';
import { calibrate } from './pixel-lint/calibrate.ts';
import { SPRITE_CHECKS, CITY_CHECKS, markdown, status, type LintReport } from './pixel-lint/report.ts';
import { FACTIONS } from '../src/game/factions.ts';

const root = resolve(import.meta.dirname, '..');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const flag = (k: string) => process.argv.includes(`--${k}`);
const quick = flag('quick');
const only = new Set((arg('only') ?? 'sprites,city,screens,calibrate').split(','));
const factions = (arg('factions')?.split(',') ?? [...FACTION_IDS]) as Faction[];
const hdLevels = (arg('levels') ?? (quick ? '1,2' : '1,2,4,8')).split(',').map(Number);
const outDir = resolve(root, arg('out') ?? 'docs/art-references/pixel-lint');
const shotDir = resolve(root, arg('shots') ?? 'docs/screenshots/audit');
const log = (s: string) => process.stderr.write(s + '\n');
const FIELD_RGB: [number, number, number] = [(FIELD >> 16) & 255, (FIELD >> 8) & 255, FIELD & 255];

/** Images side by side on a background, with a gap. */
function strip(imgs: Img[], gap = 4, bg: [number, number, number] = [27, 23, 18]): Img {
  const w = imgs.reduce((s, m) => s + m.w, 0) + gap * (imgs.length + 1);
  const h = Math.max(...imgs.map((m) => m.h)) + 2 * gap;
  const out = M.img(w, h);
  for (let i = 0; i < w * h; i++) out.d.set([...bg, 255], i * 4);
  let x = gap;
  for (const m of imgs) {
    for (let y = 0; y < m.h; y++)
      for (let xx = 0; xx < m.w; xx++) {
        const i = (y * m.w + xx) * 4, o = ((gap + y) * w + x + xx) * 4;
        if (m.d[i + 3]! === 0) continue;
        out.d.set(m.d.subarray(i, i + 4), o);
      }
    x += m.w + gap;
  }
  return out;
}
const stack = (rows: Img[], gap = 4): Img => {
  const w = Math.max(...rows.map((r) => r.w));
  const h = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
  const out = M.img(w, h);
  for (let i = 0; i < w * h; i++) out.d.set([27, 23, 18, 255], i * 4);
  let y0 = 0;
  for (const r of rows) {
    for (let y = 0; y < r.h; y++) out.d.set(r.d.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((y0 + y) * w) * 4);
    y0 += r.h + gap;
  }
  return out;
};
/** A copy with the given pixels painted one colour. */
function mark(m: Img, idx: number[], rgb: [number, number, number]): Img {
  const out: Img = { w: m.w, h: m.h, d: new Uint8ClampedArray(m.d) };
  for (const i of idx) out.d.set([...rgb, 255], i * 4);
  return out;
}
const onField = (m: Img) => M.over(m, FIELD_RGB);
const silhouette = (m: Img): Img => {
  const out = M.img(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) if (m.d[i * 4 + 3] === 255) out.d.set([235, 228, 210, 255], i * 4);
  return out;
};

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(shotDir, { recursive: true });
  const rep: LintReport = { generated: new Date().toISOString(), sprites: [], silhouettes: [], ramps: [], city: [], screens: [], calibration: null };
  const shots: string[] = [];
  const shot = (name: string, m: Img) => {
    savePng(join(shotDir, name), m);
    shots.push(name);
  };

  // ------------------------------------------------------------ sprites
  if (only.has('sprites')) {
    const P = await Painters.load(root);
    try {
      const idle0 = new Map<string, Frame>();
      for (const art of ['classic', 'hd'] as Art[])
        for (const f of factions) {
          const pal = P.palette(art, f);
          const info = rampInfo(pal);
          rep.ramps.push({ art, faction: f, ramps: info.filter((_, r) => pal.names[r]) });
          const names = [...FACTIONS[f].units, FACTIONS[f].commander];
          for (const lv of art === 'hd' ? hdLevels : [1])
            for (let kind = 0; kind < 11; kind++) {
              const t0 = performance.now();
              // HD: paper-doll colours differ per level (each level has its own master palette).
              const palL = art === 'hd' ? P.palette(art, f, lv) : pal;
              const { res, idle0: f0 } = auditSprite(P, art, f, kind, lv, names[kind]!, palL, art === 'hd' ? rampInfo(palL) : info);
              rep.sprites.push(res);
              idle0.set(`${art}:${f}:${kind}:${lv}`, f0);
              log(`sprites ${art} ${f} k${kind} L${lv} ${Math.round(performance.now() - t0)} ms`);
            }
          const l1 = names.map((_, kind) => idle0.get(`${art}:${f}:${kind}:1`)!);
          rep.silhouettes.push({ art, faction: f, pairs: silhouettes(l1, names) });
          // The lineup: eleven kinds at level 1 on the field, and their silhouettes.
          shot(`lineup-L1-${art}-${f}.png`, M.upscale(stack([strip(l1.map((x) => onField(M.crop(x.m, 8, 8, 32, 36)))), strip(l1.map((x) => silhouette(M.crop(x.m, 8, 8, 32, 36))))]), 4));
        }
      // Overlays for the worst offenders of the checks that can be pointed at.
      const worst = (id: string, art?: Art, lv?: number) => {
        const c = SPRITE_CHECKS.find((x) => x.id === id)!;
        return rep.sprites
          .filter((r) => (!art || r.art === art) && (!lv || r.level === lv))
          .sort((p, q) => (c.higherIsWorse ? c.value(q) - c.value(p) : c.value(p) - c.value(q)))[0];
      };
      const again = (r: SpriteResult) => P.frame(r.art, r.faction, r.kind, r.level, ANIM.Idle, 0, 0);
      const zoom = (r: SpriteResult) => (r.level >= 8 ? 3 : r.level >= 4 ? 4 : r.level >= 2 ? 6 : 8);
      for (const art of ['classic', 'hd'] as Art[]) {
        for (const [id, fn] of [
          ['orphans', (m: Img) => M.clusterStats(m, M.opaque(m), M.ring(M.opaque(m), m.w, m.h)).orphans],
          ['blackRing', (m: Img) => {
            const rg = M.ring(M.opaque(m), m.w, m.h);
            const idx: number[] = [];
            for (let i = 0; i < m.w * m.h; i++) if (rg[i] && Math.max(m.d[i * 4]!, m.d[i * 4 + 1]!, m.d[i * 4 + 2]!) <= 16) idx.push(i);
            return idx;
          }],
          ['hug', (m: Img) => { const k = M.opaque(m); return M.bandStats(m, k, M.ring(k, m.w, m.h)).hugIdx; }],
          ['checkers', (m: Img) => M.checkers(m, M.opaque(m)).idx],
        ] as [string, (m: Img) => number[]][]) {
          const lv = art === 'hd' ? Math.max(...hdLevels.filter((l) => l <= 4)) : 1;
          const r = worst(id, art, lv);
          if (!r) continue;
          const m = again(r).m;
          shot(`${id}-${art}-${r.faction}-k${r.kind}-L${r.level}.png`, M.upscale(strip([onField(m), onField(mark(m, fn(m), [255, 0, 255]))]), zoom(r)));
        }
        // Boil: the idle loop of the worst head churn, frames in a row, then what changed frame to frame.
        const b = worst('idleHead', art, art === 'hd' ? Math.max(...hdLevels) : 1);
        if (b) {
          const fr = framesOf(P, art, b.faction, b.kind, b.level, ANIM.Idle);
          const box = fr.reduce((a, f) => [Math.min(a[0]!, -f.ax), Math.min(a[1]!, -f.ay), Math.max(a[2]!, f.m.w - f.ax), Math.max(a[3]!, f.m.h - f.ay)], [0, 0, 0, 0]);
          const norm = fr.map((f) => M.crop(f.m, box[0]! + f.ax, box[1]! + f.ay, box[2]! - box[0]!, box[3]! - box[1]!));
          // Top 40% (head and shoulders), where the boil shows.
          const top = (m: Img) => M.crop(m, 0, 0, m.w, Math.ceil(m.h * 0.4));
          const diffs = norm.map((m, i) => {
            const n = norm[(i + 1) % norm.length]!;
            const idx: number[] = [];
            for (let p = 0; p < m.w * m.h; p++) if (M.key(m, p) !== M.key(n, p) || m.d[p * 4 + 3] !== n.d[p * 4 + 3]) idx.push(p);
            return top(mark(onField(m), idx, [255, 0, 255]));
          });
          shot(`boil-idle-${art}-${b.faction}-k${b.kind}-L${b.level}.png`, M.upscale(stack([strip(norm.map((m) => top(onField(m)))), strip(diffs)]), b.level >= 8 ? 3 : 6));
        }
      }
      // Ramps actually painted: one strip per faction (HD), deep → light.
      for (const art of ['classic', 'hd'] as Art[]) {
        const f = factions[0]!;
        const pal = P.palette(art, f);
        const used = new Set<number>();
        for (const r of rep.sprites.filter((x) => x.art === art && x.faction === f && x.level === 1)) {
          const fr = P.frame(art, f, r.kind, 1, ANIM.Idle, 0, 0);
          const lb = labels(fr.m, pal);
          for (const v of lb.ramp) if (v >= 0) used.add(v);
        }
        const rows = [...used].sort((a, b) => a - b).map((r) => {
          const m = M.img(4, 1);
          pal.ramps[r]!.forEach((c, t) => m.d.set([...c, 255], t * 4));
          return m;
        });
        shot(`ramps-${art}-${f}.png`, M.upscale(stack(rows, 0), 16));
      }
    } finally {
      await P.close();
    }
  }

  // ------------------------------------------------------------ browser: city, screens, calibration
  if (only.has('city') || only.has('screens') || only.has('calibrate')) {
    const B = await Browser.start(root);
    try {
      if (only.has('calibrate')) {
        log('calibrating on references/pixel-mistakes');
        rep.calibration = await calibrate(B, root);
      }
      if (only.has('city')) {
        const tiers: [number, number][] = quick ? [[1, 2], [4, 18]] : [[0, 0], [1, 2], [2, 7], [3, 12], [4, 18]];
        for (const art of ['classic', 'hd'] as const)
          for (const f of factions)
            for (const [tier, level] of tiers)
              for (const hour of [11, 23]) {
                const t0 = performance.now();
                const s = await B.city(art, f, level, hour);
                const r = auditCity(s, art, f, tier, level, hour);
                rep.city.push(r);
                log(`city ${art} ${f} tier ${tier} ${hour}h ${Math.round(performance.now() - t0)} ms`);
                // Screenshots: the top tier by night (and, below, by day with the iso check drawn
                // on it); classic for the first faction only, to keep the folder small.
                const keep = art === 'hd' || f === factions[0];
                if (keep && tier === tiers[tiers.length - 1]![0] && hour === 23) shot(`city-${art}-${f}-t${tier}-night.png`, s.buffer);
                if (keep && tier === tiers[tiers.length - 1]![0] && hour === 11) {
                  // Iso edges whose horizontal runs are not 2 art pixels long, in magenta.
                  const idx: number[] = [];
                  for (const p of s.parts) {
                    const k = new Uint8Array(p.img.w * p.img.h);
                    for (let i = 0; i < k.length; i++) k[i] = p.img.d[i * 4 + 3]! > 0 ? 1 : 0;
                    const bad: number[] = [];
                    M.isoStats(k, p.img.w, p.img.h, r.artPx, bad);
                    for (const i of bad) {
                      const x = (i % p.img.w) + Math.round(p.x), y = ((i / p.img.w) | 0) + Math.round(p.y);
                      if (x >= 0 && y >= 0 && x < s.buffer.w && y < s.buffer.h) idx.push(y * s.buffer.w + x);
                    }
                  }
                  shot(`city-${art}-${f}-iso-runs.png`, mark(s.buffer, idx, [255, 0, 255]));
                }
                if (art === 'hd' && tier === tiers[tiers.length - 1]![0] && hour === 11 && f === factions[0]) {
                  // Art-pixel size per 8×8 tile: red = 1-px detail, blue = 2×2 blocks.
                  const m: Img = { w: s.buffer.w, h: s.buffer.h, d: new Uint8ClampedArray(s.buffer.d) };
                  for (let ty = 0; ty + 8 <= m.h; ty += 8)
                    for (let tx = 0; tx + 8 <= m.w; tx += 8) {
                      const t = M.pixelSizeMix(M.crop(s.buffer, tx, ty, 8, 8));
                      if (!t.tiles) continue;
                      const tint: [number, number, number] | null = t.at2 ? [60, 120, 255] : t.at1 ? [255, 50, 50] : null;
                      if (!tint) continue;
                      for (let y = ty; y < ty + 8; y++)
                        for (let x = tx; x < tx + 8; x++) for (let c = 0; c < 3; c++) m.d[(y * m.w + x) * 4 + c] = Math.round(m.d[(y * m.w + x) * 4 + c]! * 0.55 + tint[c]! * 0.45);
                    }
                  shot(`city-hd-${f}-pixel-sizes.png`, m);
                }
              }
      }
      if (only.has('screens') && !quick) {
        for (const art of ['classic', 'hd'] as const)
          for (const width of [1024, 1366, 1920]) {
            const c = await B.cityScreen(art, factions[0]!, width);
            const g = M.gridStats(c.img, 8, 0);
            rep.screens.push({ page: 'city', art, width, zoom: 1, scale: c.scale, integer: Math.abs(c.scale - Math.round(c.scale)) < 1e-6, grid: g.grid, impure: g.impure, deviation: g.deviation, mix: M.pixelSizeMix(c.img) });
            log(`screen city ${art} ${width}: scale ${c.scale}`);
            if (width === 1024) shot(`screen-city-${art}-${width}.png`, M.upscale(M.crop(c.img, Math.round(c.img.w / 2) - 80, Math.round(c.img.h / 2) - 45, 160, 90), 4));
          }
        for (const art of ['classic', 'hd'] as const)
          for (const zoom of [1, 2]) {
            const s = await B.battleScreen(art, 1366, zoom);
            const g = M.gridStats(s.img, 8, 12, s.px);
            rep.screens.push({ page: 'battle', art, width: 1366, zoom, scale: s.px, integer: true, grid: g.grid, impure: g.impure, deviation: g.deviation, mix: M.pixelSizeMix(s.img, 8, 12) });
            log(`screen battle ${art} zoom ${zoom}: px ${s.px} ${s.error}`);
            shot(`screen-battle-${art}-z${zoom}.png`, M.upscale(M.crop(s.img, Math.round(s.img.w / 2) - 60, Math.round(s.img.h / 2) - 34, 120, 68), 5));
          }
      }
    } finally {
      await B.close();
    }
  }

  writeFileSync(join(outDir, 'pixel-lint.json'), JSON.stringify(rep, null, 1));
  writeFileSync(join(outDir, 'pixel-lint.md'), markdown(rep) + `\n## Screenshots written\n\n${shots.map((s) => `- docs/screenshots/audit/${s}`).join('\n')}\n`);
  const fails =
    rep.sprites.reduce((n, r) => n + SPRITE_CHECKS.filter((c) => status(c, r) === 'fail').length, 0) +
    rep.city.reduce((n, r) => n + CITY_CHECKS.filter((c) => status(c, r) === 'fail').length, 0);
  log(`pixel-lint: ${rep.sprites.length} sprites, ${rep.city.length} city scenes, ${rep.screens.length} screens; ${fails} failed checks. Report: ${join(outDir, 'pixel-lint.md')}`);
  if (flag('strict') && fails > 0) process.exitCode = 1;
}

await main();

