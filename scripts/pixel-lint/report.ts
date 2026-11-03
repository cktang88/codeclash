// Thresholds (guide first guesses, then calibrated on the PixelJoint pairs and the xave "128"
// sprite; see the calibration table the lint prints), pass/warn/fail per check, and the markdown.

import type { SpriteResult, RampInfo } from './sprite-audit.ts';
import type { CityResult } from './city-audit.ts';
import type { Calibration } from './calibrate.ts';

export type Status = 'pass' | 'warn' | 'fail' | 'info';

export interface Check<R> {
  id: string;
  /** Guide checklist row (mistakes #n, techniques §n). */
  row: string;
  label: string;
  value: (r: R) => number;
  /** Thresholds by detail level (sprites) or a constant. NaN = info only. */
  warn: (r: R) => number;
  fail: (r: R) => number;
  higherIsWorse: boolean;
  /** Where the numbers come from. */
  basis: string;
  fmt?: 'pct' | 'num' | 'int';
}

const byLevel = (l1: number, l2: number, l4: number, l8: number) => (r: SpriteResult) => (r.level >= 8 ? l8 : r.level >= 4 ? l4 : r.level >= 2 ? l2 : l1);
const k = (v: number) => () => v;

export const SPRITE_CHECKS: Check<SpriteResult>[] = [
  { id: 'colours', row: 'M7', label: 'colours', value: (r) => r.colours.colours, warn: byLevel(16, 21, 26, 40), fail: byLevel(20, 26, 32, 48), higherIsWorse: true, basis: 'guide (24@48 px, 48@128 px) scaled to figure height: L1 ≈ 13 px, L2 ≈ 26, L4 ≈ 51, L8 ≈ 100', fmt: 'int' },
  { id: 'nearDup', row: 'M7', label: 'near-dup pairs', value: (r) => r.colours.nearDup, warn: k(NaN), fail: k(NaN), higherIsWorse: true, basis: 'info only: the hand-approved xave sprite has 278 pairs (guide says 0)', fmt: 'int' },
  { id: 'orphans', row: 'M5', label: 'orphans', value: (r) => r.clusters.orphanFrac, warn: byLevel(0.3, 0.2, 0.12, 0.08), fail: byLevel(0.4, 0.3, 0.2, 0.14), higherIsWorse: true, basis: 'calibrated: xave 128 has 7.6% (outline excluded); guide 1-2% is stricter than any hand-made sprite measured', fmt: 'pct' },
  { id: 'meanCluster', row: 'M14', label: 'mean cluster', value: (r) => r.clusters.meanCluster, warn: byLevel(2, 3, 4, 5), fail: byLevel(1.5, 2.2, 3, 4), higherIsWorse: false, basis: 'calibrated: xave 128 = 5.3 px (outline excluded); guide 4-8 @48 / 8-20 @128', fmt: 'num' },
  { id: 'edgeDensity', row: 'M14', label: 'edge density', value: (r) => r.clusters.edgeDensity, warn: byLevel(0.8, 0.7, 0.6, 0.5), fail: byLevel(0.9, 0.8, 0.7, 0.6), higherIsWorse: true, basis: 'calibrated: xave 128 = 0.47; guide fails > 0.45 @48', fmt: 'num' },
  { id: 'jaggies', row: 'M3', label: 'jaggies /32 px', value: (r) => r.lines.jaggiesPer32, warn: k(1), fail: k(1.5), higherIsWorse: true, basis: 'calibrated: PixelJoint jaggy lines 1.9, fixed 0.0, croc 0.3, xave 0.9', fmt: 'num' },
  { id: 'doubles', row: 'M4', label: 'L-corner doubles', value: (r) => r.lines.doublesFrac, warn: k(0.02), fail: k(0.05), higherIsWorse: true, basis: 'xave 1.1%; guide 0', fmt: 'pct' },
  { id: 'pureBlack', row: 'M9', label: '#000 px', value: (r) => r.colours.pureBlack + r.colours.pureWhite, warn: k(0), fail: k(0), higherIsWorse: true, basis: 'guide: no pure black or white', fmt: 'int' },
  { id: 'blackRing', row: 'M9', label: 'near-black outline', value: (r) => r.outline.black, warn: k(0.1), fail: k(0.3), higherIsWorse: true, basis: 'xave 0%; guide: hue-matched dark outline, never flat black', fmt: 'pct' },
  { id: 'outlineCont', row: 'M9', label: 'outline closed', value: (r) => r.outline.continuity, warn: k(0.6), fail: k(0.4), higherIsWorse: false, basis: 'croc solid 0.97, broken sel-out 0.96, xave 0.71', fmt: 'pct' },
  { id: 'selective', row: 'M9/T', label: 'lit-dark outline ΔL', value: (r) => r.outline.litMinusDark, warn: (r) => (r.level >= 2 ? 0.05 : NaN), fail: k(NaN), higherIsWorse: false, basis: 'croc light-shaded outline 0.32 vs sel-out ignoring light 0.18', fmt: 'num' },
  { id: 'pillow', row: 'M1', label: 'pillow (edge corr)', value: (r) => (r.shadeRegions.corrLight < 0.35 ? r.shadeRegions.corrEdge : 0), warn: k(0.4), fail: k(0.5), higherIsWorse: true, basis: 'calibrated: skulls pillow 0.72/0.72 vs fixed 0.20/0.26 (guide 0.5 with corr_light < 0.3); per material region', fmt: 'num' },
  { id: 'lightDir', row: 'M11', label: 'light angle err°', value: (r) => r.shadeRegions.lightAngleErr, warn: k(45), fail: k(90), higherIsWorse: true, basis: 'guide ±45°; per material region (albedo-free)', fmt: 'int' },
  { id: 'hug', row: 'M2', label: 'hugging bands', value: (r) => r.bands.hug, warn: k(0.6), fail: k(0.8), higherIsWorse: true, basis: 'calibrated: hugging rim 0.86 vs fixed 0.24; xave 0.53 (outline excluded)', fmt: 'num' },
  { id: 'stack', row: 'M2/M15', label: '1-px stacked steps', value: (r) => r.bands.stack, warn: k(0.3), fail: k(0.45), higherIsWorse: true, basis: 'calibrated: too-much AA 0.53, blur 0.59 vs good AA 0.21, xave 0.11', fmt: 'num' },
  { id: 'aligned', row: 'M2', label: 'aligned band ends', value: (r) => r.bands.aligned, warn: k(0.2), fail: k(0.3), higherIsWorse: true, basis: 'column banding 0.066 vs fixed 0.033, but xave 0.12: weak, set above xave', fmt: 'num' },
  { id: 'checkers', row: 'M6', label: '2×2 checkers /1000', value: (r) => r.checkers, warn: k(10), fail: k(40), higherIsWorse: true, basis: 'calibrated: dither field 198 vs buffer dither 42, xave 9 (mail texture exempt, craft §2)', fmt: 'num' },
  { id: 'partialAlpha', row: 'M15', label: 'partial alpha px', value: (r) => r.outline.partialAlpha, warn: k(0), fail: k(0), higherIsWorse: true, basis: 'guide: hard alpha only (ground shadow excluded)', fmt: 'int' },
  { id: 'edgeVsGround', row: 'M12', label: 'outline vs ground ΔL', value: (r) => r.value.edgeVsGround, warn: k(0.15), fail: k(0.1), higherIsWorse: false, basis: 'guide ΔL ≥ 0.15 vs ground (preview field #56603a)', fmt: 'num' },
  { id: 'meanVsGround', row: 'T3.1', label: 'figure vs ground ΔL', value: (r) => r.value.meanVsGround, warn: k(0.12), fail: k(0.06), higherIsWorse: false, basis: 'techniques §3.1: mean L ≥ 0.12 from terrain', fmt: 'num' },
  { id: 'valueBands', row: 'M12', label: 'value bands', value: (r) => r.value.bands, warn: k(3), fail: k(2), higherIsWorse: false, basis: 'guide: ≥ 3 bands over 5%', fmt: 'int' },
  { id: 'thumb3', row: 'T3.1', label: '3-value thumb', value: (r) => r.value.thumb3, warn: k(NaN), fail: k(NaN), higherIsWorse: false, basis: 'info: did not separate the PixelJoint pug pair (0.867 vs 0.866)', fmt: 'num' },
  { id: 'partContrast', row: 'M12', label: 'parts ΔL<0.06', value: (r) => r.parts.lowFrac, warn: k(0.4), fail: k(NaN), higherIsWorse: true, basis: 'share of part-to-part boundary with < 0.06 L difference', fmt: 'pct' },
  { id: 'straightRamp', row: 'M8', label: 'straight-ramp px', value: (r) => r.ramps.straightPx, warn: k(0.1), fail: k(0.3), higherIsWorse: true, basis: 'guide: hue drift < 5° across a ramp; PixelJoint straight ramp drifts 0.4°', fmt: 'pct' },
  { id: 'greyShadow', row: 'M9', label: 'grey-shadow px', value: (r) => r.ramps.greyShadowPx, warn: k(0.01), fail: k(0.05), higherIsWorse: true, basis: 'guide: shadow C < 0.02 on a coloured material', fmt: 'pct' },
  { id: 'midWidest', row: 'T1.1', label: 'base band share', value: (r) => r.ramps.bandShare[2] ?? 0, warn: k(0.35), fail: k(NaN), higherIsWorse: false, basis: 'techniques §1.1: the base band should be the widest (≈ 50%)', fmt: 'pct' },
  { id: 'idleHead', row: 'M16', label: 'idle head boil', value: (r) => r.idle.headChurn, warn: k(0.03), fail: k(0.08), higherIsWorse: true, basis: 'guide: > 3% churn on a static part is boil (after the best ±2 px shift)', fmt: 'pct' },
  { id: 'walkHead', row: 'M16', label: 'walk head boil', value: (r) => r.walk.headChurn, warn: k(0.08), fail: k(0.15), higherIsWorse: true, basis: 'head moves rigidly in a walk; residual after the best shift', fmt: 'pct' },
  { id: 'flicker', row: 'M6/M16', label: 'A-B-A flicker', value: (r) => Math.max(r.idle.flicker, r.walk.flicker), warn: k(0.005), fail: k(0.015), higherIsWorse: true, basis: 'guide: any A-B-A flip; we allow 0.5%', fmt: 'pct' },
  { id: 'blowFlicker', row: 'M6/M16', label: 'blow A-B-A flicker', value: (r) => Math.max(0, ...(r.blows ?? []).map((b) => b.attack.flicker)), warn: k(0.005), fail: k(NaN), higherIsWorse: true, basis: 'flicker in every melee blow (Attack, each blow of a kind with several); warn only', fmt: 'pct' },
  { id: 'blowOffPalette', row: 'M10', label: 'blow off-palette px', value: (r) => (r.blows ?? []).reduce((s, b) => s + b.offPalette, 0), warn: k(0), fail: k(NaN), higherIsWorse: true, basis: 'pixels in no ramp or outline table, over every frame of every blow', fmt: 'int' },
  { id: 'idleShape', row: 'M16', label: 'idle silhouette change', value: (r) => r.idle.shapeChange, warn: k(0.05), fail: k(0.1), higherIsWorse: true, basis: 'Saint11: idle silhouette barely changes (≤ 1 px)', fmt: 'pct' },
  { id: 'offPalette', row: 'M10', label: 'off-palette px', value: (r) => r.offPalette, warn: k(0), fail: k(NaN), higherIsWorse: true, basis: 'pixels in no ramp or outline table', fmt: 'int' },
];

export const CITY_CHECKS: Check<CityResult>[] = [
  { id: 'iso2to1', row: 'M17', label: 'iso runs = 2', value: (r) => r.iso.frac2, warn: k(0.9), fail: k(0.8), higherIsWorse: false, basis: 'calibrated: Slynyrd tiles 1.00, synthetic 2:1 1.00, true 30° 0.73', fmt: 'pct' },
  { id: 'partOrphans', row: 'M5', label: 'building orphans', value: (r) => r.parts.orphanFrac, warn: k(0.12), fail: k(0.2), higherIsWorse: true, basis: 'as sprites (xave 7.6%)', fmt: 'pct' },
  { id: 'partCheckers', row: 'M6', label: 'building checkers /1000', value: (r) => r.parts.checkers, warn: k(10), fail: k(40), higherIsWorse: true, basis: 'dither field 198 vs buffer 42', fmt: 'num' },
  { id: 'groundCheckers', row: 'M6', label: 'ground checkers /1000', value: (r) => r.ground?.checkers ?? 0, warn: k(10), fail: k(40), higherIsWorse: true, basis: 'terrain: Bayer only between adjacent steps', fmt: 'num' },
  { id: 'groundOrphans', row: 'M5', label: 'ground orphans', value: (r) => r.ground?.orphanFrac ?? 0, warn: k(0.15), fail: k(0.3), higherIsWorse: true, basis: 'noise on the ground texture', fmt: 'pct' },
  { id: 'lightOff', row: 'M11', label: 'parts lit from the right', value: (r) => r.parts.lightOff, warn: k(0.25), fail: k(0.5), higherIsWorse: true, basis: 'share of building parts whose right-hand walls are lighter than the left (craft §6: light from the upper left)', fmt: 'pct' },
  { id: 'dL', row: 'M12', label: 'building vs ground ΔL', value: (r) => r.contrast.dL, warn: k(0.12), fail: k(NaN), higherIsWorse: false, basis: 'techniques §3.1 (0.12); mean vs mean of mixed materials, so warn only', fmt: 'num' },
  { id: 'edgeDL', row: 'M12', label: 'silhouette edge ΔL', value: (r) => r.contrast.edgeDL, warn: k(0.15), fail: k(0.1), higherIsWorse: false, basis: 'guide: edge ΔL ≥ 0.15', fmt: 'num' },
  { id: 'mixels', row: 'M10', label: 'mixed px sizes', value: (r) => Math.min(r.mix.at1, r.mix.at2), warn: k(0.1), fail: k(0.25), higherIsWorse: true, basis: 'share of detailed tiles at the minority art-pixel size (1 vs 2 buffer px)', fmt: 'pct' },
];

export function status<R>(c: Check<R>, r: R): Status {
  const v = c.value(r), w = c.warn(r), f = c.fail(r);
  if (Number.isNaN(w) && Number.isNaN(f)) return 'info';
  const bad = (t: number) => !Number.isNaN(t) && (c.higherIsWorse ? v > t : v < t);
  if (bad(f)) return 'fail';
  if (bad(w)) return 'warn';
  return 'pass';
}

const fmt = (v: number, f: Check<unknown>['fmt']) => (f === 'pct' ? `${(v * 100).toFixed(1)}%` : f === 'int' ? String(Math.round(v)) : v.toFixed(2));
const mark = (s: Status) => (s === 'fail' ? ' **F**' : s === 'warn' ? ' w' : '');

export interface Violation {
  check: string;
  label: string;
  row: string;
  art: string;
  fails: number;
  warns: number;
  total: number;
  /** Worst offenders: id and value. */
  worst: { id: string; value: number }[];
  /** Mean of the value over the failing items. */
  score: number;
}

/** Ranks checks by how many items fail them (then warn), per art. */
export function rank<R>(checks: Check<R>[], rs: R[], id: (r: R) => string, art: (r: R) => string): Violation[] {
  const out: Violation[] = [];
  const arts = [...new Set(rs.map(art))];
  for (const a of arts)
    for (const c of checks) {
      const mine = rs.filter((r) => art(r) === a);
      const st = mine.map((r) => status(c, r));
      const fails = st.filter((s) => s === 'fail').length, warns = st.filter((s) => s === 'warn').length;
      if (!fails && !warns) continue;
      const bad = mine.filter((_, i) => st[i] === 'fail' || st[i] === 'warn').sort((p, q) => (c.higherIsWorse ? c.value(q) - c.value(p) : c.value(p) - c.value(q)));
      out.push({
        check: c.id,
        label: c.label,
        row: c.row,
        art: a,
        fails,
        warns,
        total: mine.length,
        worst: bad.slice(0, 4).map((r) => ({ id: id(r), value: c.value(r) })),
        score: (fails * 2 + warns) / mine.length,
      });
    }
  return out.sort((p, q) => q.score - p.score);
}

export interface ScreenResult {
  page: 'city' | 'battle';
  art: string;
  width: number;
  zoom: number;
  scale: number;
  integer: boolean;
  grid: number;
  impure: number;
  deviation: number;
  mix: { tiles: number; at1: number; at2: number };
}

export interface LintReport {
  generated: string;
  sprites: SpriteResult[];
  silhouettes: { art: string; faction: string; pairs: { a: string; b: string; iou: number; best: number }[] }[];
  ramps: { art: string; faction: string; ramps: RampInfo[] }[];
  city: CityResult[];
  screens: ScreenResult[];
  calibration: Calibration | null;
}

export function markdown(rep: LintReport): string {
  const L: string[] = [];
  const sid = (r: SpriteResult) => `${r.art} ${r.faction} k${r.kind} L${r.level}`;
  L.push('# Pixel lint report', '', `Generated by \`pnpm pixel-lint\` (scripts/pixel-lint.ts). F = fail, w = warn against the thresholds below. Hue ${215}, idle frame 0 facing SE, on the preview field green.`, '');
  // Summary of failures.
  L.push('## Worst violations (ranked by share of items failing)', '', '| # | check | guide row | art | fail | warn | of | worst items |', '|---|---|---|---|---|---|---|---|');
  const v = [
    ...rank(SPRITE_CHECKS, rep.sprites, sid, (r) => `sprites ${r.art}`),
    ...rank(CITY_CHECKS, rep.city, (r) => `${r.art} ${r.faction} t${r.tier} ${r.time}`, (r) => `city ${r.art}`),
  ].sort((p, q) => q.score - p.score);
  v.slice(0, 40).forEach((x, i) => L.push(`| ${i + 1} | ${x.label} | ${x.row} | ${x.art} | ${x.fails} | ${x.warns} | ${x.total} | ${x.worst.map((w) => `${w.id} (${w.value.toFixed(3)})`).join(', ')} |`));
  L.push('');
  // Thresholds.
  L.push('## Checks and thresholds', '', '| check | row | warn | fail | basis |', '|---|---|---|---|---|');
  const sample = (lv: number) => ({ level: lv }) as SpriteResult;
  for (const c of SPRITE_CHECKS) {
    const t = (f: (r: SpriteResult) => number) => {
      const vs = [1, 2, 4, 8].map((lv) => f(sample(lv)));
      if (vs.every((x) => Number.isNaN(x))) return '-';
      return new Set(vs.map(String)).size === 1 ? fmt(vs[0]!, c.fmt) : vs.map((x, i) => `L${[1, 2, 4, 8][i]} ${Number.isNaN(x) ? '-' : fmt(x, c.fmt)}`).join(', ');
    };
    L.push(`| ${c.label} | ${c.row} | ${c.higherIsWorse ? '>' : '<'} ${t(c.warn)} | ${t(c.fail)} | ${c.basis} |`);
  }
  for (const c of CITY_CHECKS) L.push(`| city: ${c.label} | ${c.row} | ${c.higherIsWorse ? '>' : '<'} ${fmt(c.warn({} as CityResult), c.fmt)} | ${fmt(c.fail({} as CityResult), c.fmt)} | ${c.basis} |`);
  L.push('', 'Silhouette IoU (M13): warn > 0.75, fail > 0.85 (guide), best of ±2 px shifts, level-1 idle frames anchored at the foot.', '');
  // Calibration.
  const cal = rep.calibration;
  if (cal) {
    L.push('## Calibration on the guide\'s good/bad pairs', '', cal.dir ? `References: \`${cal.dir}\` (study only, not committed).` : 'References not found: calibration skipped.', '');
    if (cal.rows.length) {
      L.push('| pair | row | metric | bad | good | separates? |', '|---|---|---|---|---|---|');
      for (const r of cal.rows) L.push(`| ${r.note} | ${r.row} | ${r.metric} | ${r.bad.toFixed(3)} | ${r.good.toFixed(3)} | ${r.separates ? 'yes' : '**no**'} |`);
      L.push('');
    }
    const x = cal.approved['xave 128 girl'];
    if (x) L.push(`Hand-approved xave "128" girl: ${Object.entries(x).map(([k2, v2]) => `${k2} ${typeof v2 === 'number' ? v2.toFixed(3) : v2}`).join(', ')}.`, '');
    if (cal.ramp) L.push(`Ramp strip ${cal.ramp.file}: hue drift ${cal.ramp.hueDrift.toFixed(1)}° (a straight ramp: the < 5° check flags it).`, '');
    if (cal.iso) L.push(`Iso: Slynyrd cubes ${(cal.iso.good.frac2 * 100).toFixed(0)}% runs of 2 (${cal.iso.good.runs} runs); synthetic 2:1 ${(cal.iso.synthetic2to1.frac2 * 100).toFixed(0)}%; synthetic 30° ${(cal.iso.synthetic30.frac2 * 100).toFixed(0)}%.`, '');
  }
  // Silhouettes.
  L.push('## Silhouettes at level 1 (IoU between kinds)', '');
  for (const s of rep.silhouettes) {
    const bad = s.pairs.filter((p) => p.best > 0.75);
    L.push(`- **${s.art} ${s.faction}**: ${bad.length ? bad.map((p) => `${p.a} / ${p.b} ${p.best.toFixed(2)}${p.best > 0.85 ? ' **F**' : ' w'}`).join('; ') : 'no pair above 0.75'} (max ${s.pairs[0]?.best.toFixed(2)})`);
  }
  L.push('');
  // Ramps.
  L.push('## Ramps (OKLCH)', '', '| art | faction | straight (< 5° drift, coloured) | grey shadows | chroma peak not at shade step | pure black/white steps |', '|---|---|---|---|---|---|');
  for (const r of rep.ramps) {
    const col = r.ramps.filter((x) => !x.neutral);
    const pure = r.ramps.filter((x) => x.lch.some((c) => c[0] < 0.08 || c[0] > 0.98)).map((x) => x.name);
    L.push(`| ${r.art} | ${r.faction} | ${col.filter((x) => x.hueDrift < 5).map((x) => `${x.name} ${x.hueDrift.toFixed(1)}°`).join(', ') || '-'} | ${r.ramps.filter((x) => x.greyShadow).map((x) => x.name).join(', ') || '-'} | ${col.filter((x) => x.chromaPeak !== 1).length}/${col.length} | ${pure.join(', ') || '-'} |`);
  }
  L.push('');
  // Sprite tables.
  const cols = SPRITE_CHECKS.filter((c) => ['colours', 'orphans', 'meanCluster', 'jaggies', 'blackRing', 'pillow', 'hug', 'stack', 'checkers', 'edgeVsGround', 'meanVsGround', 'straightRamp', 'midWidest', 'idleHead', 'walkHead', 'flicker'].includes(c.id));
  for (const art of ['classic', 'hd']) {
    const rs = rep.sprites.filter((r) => r.art === art);
    if (!rs.length) continue;
    L.push(`## Sprites: ${art}`, '', `| faction | kind | L | ${cols.map((c) => c.label).join(' | ')} | F/W |`, `|---|---|---|${cols.map(() => '---|').join('')}---|`);
    for (const r of rs) {
      const all = SPRITE_CHECKS.map((c) => status(c, r));
      L.push(`| ${r.faction} | ${r.kind} ${r.name} | ${r.level} | ${cols.map((c) => fmt(c.value(r), c.fmt) + mark(status(c, r))).join(' | ')} | ${all.filter((s) => s === 'fail').length}/${all.filter((s) => s === 'warn').length} |`);
    }
    L.push('');
  }
  // City.
  if (rep.city.length) {
    L.push('## City', '', `| art | faction | tier (level) | time | art px | ${CITY_CHECKS.map((c) => c.label).join(' | ')} |`, `|---|---|---|---|---|${CITY_CHECKS.map(() => '---|').join('')}`);
    for (const r of rep.city) L.push(`| ${r.art} | ${r.faction} | ${r.tier} (${r.level}) | ${r.time} ${r.hour}h | ${r.artPx} | ${CITY_CHECKS.map((c) => fmt(c.value(r), c.fmt) + mark(status(c, r))).join(' | ')} |`);
    L.push('');
  }
  if (rep.screens.length) {
    L.push('## Screens (mixels, non-integer scale, grain)', '', '| page | art | css width | zoom | scale | integer? | detected grid | impure blocks | grain dev (0-255) | 1-px / 2-px tiles |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const s of rep.screens) L.push(`| ${s.page} | ${s.art} | ${s.width} | ${s.zoom} | ${s.scale.toFixed(3)} | ${s.integer ? 'yes' : '**no**'} | ${s.grid} | ${(s.impure * 100).toFixed(0)}% | ${s.deviation.toFixed(1)} | ${(s.mix.at1 * 100).toFixed(0)}% / ${(s.mix.at2 * 100).toFixed(0)}% |`);
    L.push('');
  }
  return L.join('\n');
}
