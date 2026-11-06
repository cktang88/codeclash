// QA3 #4, passage of lines: a block of formed foot (or horse) sent forward through a gap between two
// friendly blocks of loose shooters too narrow for it. Prints, per seed, how long it took to get
// past them, the seconds it stood stalled (moved under 12 u in 5 s), its heading reversals, the
// worst share of its men standing in a shooter block (blockCrossings), and how far the shooters moved.
//   npx tsx scripts/qa/passage.ts [--seeds 1-4] [--gap 29] [--cls heavy|spear|knights] [--v]
import { Battle, BATTLE_VERSION, type Regiment } from '../../src/game/battle.ts';
import { U, UNIT_COUNT } from '../../src/game/units.ts';
import { placeRegiment, plainArmy } from '../../src/game/testing.ts';
import { blockCrossings } from '../../src/game/overlap.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const [sa, sb] = arg('seeds', '1-4').split('-').map(Number);
const GAP = Number(arg('gap', '29'));
const CLS = { heavy: U.HeavyInfantry, spear: U.Spearmen, knights: U.Knights }[arg('cls', 'heavy')]!;
const V = process.argv.includes('--v');

export function passage(seed: number, gap = GAP, cls = CLS, men = cls === U.Knights ? 16 : 30) {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  k[U.Archers] = 80;
  k[cls] = men;
  const e = new Array<number>(UNIT_COUNT).fill(0);
  e[U.HeavyInfantry] = 40;
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(k), plainArmy(e, 200)] });
  const bows = b.regiments.filter((r) => r.team === 0 && r.cls === U.Archers);
  const foot = b.regiments.find((r) => r.team === 0 && r.cls === cls)!;
  const foe = b.regiments.find((r) => r.team === 1)!;
  b.generals[1]!.fixedPlan = 'hold';
  placeRegiment(b, foe, 2200, 1200, -1, 0);
  // Two shooter blocks side by side, `gap` apart, facing east at x 1000; the foot 120 u behind the gap.
  const [p, q] = bows as [Regiment, Regiment];
  placeRegiment(b, p, 1000, 1200 - gap / 2 - p.width / 2, 1, 0);
  placeRegiment(b, q, 1000, 1200 + gap / 2 + q.width / 2, 1, 0);
  placeRegiment(b, foot, 880, 1200, 1, 0);
  const inside = b as unknown as { think(r: Regiment): void; survey(r: Regiment): void };
  const think = inside.think.bind(b);
  inside.think = (r: Regiment) => {
    if (r.team === 1) return think(r);
    inside.survey(r);
    if (r === foot) {
      r.mode = 'advance';
      r.tx = 1150; r.ty = 1200; r.dfx = 1; r.dfy = 0;
    } else {
      r.mode = 'hold';
      r.tx = r.homeX; r.ty = r.homeY; r.dfx = 1; r.dfy = 0;
    }
  };
  const p0 = [p.ax, p.ay, q.ax, q.ay];
  const hist: [number, number][] = [];
  // Men walking through each other: a passer and a shooter closer than 0.6 of their two radii (man-seconds),
  // and shooters standing in the passer's own footprint (the most at once).
  let through = 0, shotIn = 0;
  const pm = new Set([...p.members, ...q.members]);
  let stalled = 0, past = -1, worstShare = 0, rev = 0, hx = 0, hy = 0, worstFormed = 0;
  while (b.tick < 600) {
    b.step();
    for (const c of blockCrossings(b, 2)) {
      const a = b.regiments[c.a]!, o = b.regiments[c.b]!;
      if ((a === foot || o === foot)) worstShare = Math.max(worstShare, c.share);
      else worstFormed = Math.max(worstFormed, c.share);
    }
    if (past < 0 && foot.ax - foot.depth > 1000 + 5) past = b.tick;
    if (b.tick % 2 === 0) {
      let n = 0;
      for (const id of foot.members) {
        const a = b.soldiers[id]!;
        if (a.state !== 0) continue;
        b.near(a.x, a.y, 8, (o, d2) => { if (pm.has(o.id) && d2 < (0.6 * (a.s.radius + o.s.radius)) ** 2) through += 0.2; });
      }
      for (const id of pm) {
        const s = b.soldiers[id]!;
        if (s.state !== 0) continue;
        const dx = s.x - foot.ax, dy = s.y - foot.ay;
        const lat = -dx * foot.fy + dy * foot.fx, fwd = dx * foot.fx + dy * foot.fy;
        if (Math.abs(lat) < foot.width / 2 - 2 && fwd < -2 && fwd > -foot.depth + 2) n++;
      }
      shotIn = Math.max(shotIn, n);
    }
    if (b.tick % 10) continue;
    hist.push([foot.ax, foot.ay]);
    if (hist.length > 6) hist.shift();
    if (hist.length === 6 && past < 0 && Math.hypot(hist[5]![0] - hist[0]![0], hist[5]![1] - hist[0]![1]) < 12) stalled++;
    const vx = hist.length > 1 ? hist[hist.length - 1]![0] - hist[hist.length - 2]![0] : 0;
    const vy = hist.length > 1 ? hist[hist.length - 1]![1] - hist[hist.length - 2]![1] : 0;
    if (Math.hypot(vx, vy) > 0.5 && Math.hypot(hx, hy) > 0.5 && vx * hx + vy * hy < -0.5 * Math.hypot(vx, vy) * Math.hypot(hx, hy)) rev++;
    hx = vx; hy = vy;
    if (V) console.log(`t${b.tick} foot ${foot.ax.toFixed(0)},${foot.ay.toFixed(0)} f ${foot.fx.toFixed(2)},${foot.fy.toFixed(2)} ${foot.stance} | bows ${p.ax.toFixed(0)},${p.ay.toFixed(0)} ${q.ax.toFixed(0)},${q.ay.toFixed(0)} pass ${(p as any).passFor ?? ''}/${(q as any).passFor ?? ''}`);
  }
  const moved = Math.max(Math.hypot(p.ax - p0[0]!, p.ay - p0[1]!), Math.hypot(q.ax - p0[2]!, q.ay - p0[3]!));
  return { through, shotIn, past: past < 0 ? -1 : past / 10, stalled, rev, worstShare, worstFormed, moved, at: [foot.ax, foot.ay] as const };
}

if (process.argv[1]?.endsWith('passage.ts')) {
  for (let s = sa!; s <= (sb ?? sa!); s++) {
    const r = passage(s);
    console.log(`seed ${s} gap ${GAP}: past the shooters at ${r.past} s; stalled ${r.stalled} s; reversals ${r.rev}; its men in a shooter block ${(100 * r.worstShare).toFixed(0)}%; others ${(100 * r.worstFormed).toFixed(0)}%; shooters moved ${r.moved.toFixed(0)} u; ended at ${r.at[0].toFixed(0)},${r.at[1].toFixed(0)}; men through each other ${r.through.toFixed(1)} man-s; shooters in its footprint at most ${r.shotIn}`);
  }
}
