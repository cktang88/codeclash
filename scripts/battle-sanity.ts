// "Would a real soldier do this?" An audit of every man's state, tick by tick, in a few demo
// battles: it counts the moments where a man stands in a state that a real man on that field
// would not be in (the user's test: "there shouldn't be a single person on the battlefield where
// you wonder why aren't they doing X"). Prints each measure's rate per battle and over all.
//
//   npx tsx scripts/battle-sanity.ts                       seeds 3,7,11,23 at 450 and 1200 men
//   npx tsx scripts/battle-sanity.ts --seeds 3,7 --sizes 450 --json out.json
//   npx tsx scripts/battle-sanity.ts --factions templar,samurai   (both sides' factions)
//
// The measures (foot unless named; "idle" means he has no foe and moves under 2 units a second;
// "in reach" is his radius + the enemy's + 3, the reach `survey` counts a man engaged at):
// - idle-free-foe: idle for over 3 s while an enemy man who is fighting nobody (none of ours in
//   reach of him) stands within 30 of him. He should go and fight him. Not shooters loosing.
// - idle-near-fight: idle over 3 s, an enemy within 30, his regiment locked in melee. Some of it
//   is rear ranks backing the front, which is right; it should still be the smaller part.
// - idle-gap: in a block locked in melee, idle over 2 s, an enemy within 20, and the ground a rank
//   step toward that enemy is free of friends: a hole he could step into and does not.
// - walks-away: not routing, an enemy in reach, and his own stride (the push of the press
//   aside) takes him away from that enemy at over 3 units a second (not falling back on an
//   order, skirmishers falling back, the wounded going to the rear, nor a breather's step, nor
//   closing on his own foe close by with another at his back).
// - foe-ignored: an enemy in reach and no target for over 1 s (he would at least fight him).
// - stacked: two men's centres closer than half their radii summed (standing in each other).
// - jumps: a man of a formed block moved over 2.2 times his speed in a tick (snapped).
// - missile-idle (report): a loaded shooter, his block not routed nor fighting hand to hand, an
//   enemy block within his range, has not loosed for twice his reload and 3 s more.
//   missile-idle-clear (context) is the part of it with a target he could have shot at clear of
//   our own men (the danger-close rule, battle v17): the rest hold their shot for good reason.
//   --why splits it: all-in-melee, free-but-danger-close, clear-target.
// Context (not faults): the idle share of men in engaged blocks with no foe in reach; the share of
// fighters standing beyond the end of their foe's block's front (wrapping); the front rank's
// spread along the facing while advancing (how wavy a line on the move is, units).
import { Battle, FIELD_H, FIELD_W, fireEvery, MAX_TICKS, State, TICK_S } from '../src/game/battle.ts';
import { demoSetup } from '../src/client/demo.ts';
import { isFaction, type FactionId } from '../src/game/factions.ts';
import { writeFileSync } from 'node:fs';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}

const SEEDS = arg('seeds', '3,7,11,23').split(',').map(Number);
const SIZES = arg('sizes', '450,1200').split(',').map(Number);
const FACTIONS = arg('factions', '').split(',').filter(isFaction) as FactionId[];
const JSON_OUT = arg('json', '');
const MAX = Number(arg('ticks', String(MAX_TICKS)));
const EVERY = 2;

const FAULTS = ['idle-free-foe', 'idle-near-fight', 'idle-gap', 'walks-away', 'foe-ignored', 'stacked', 'jumps', 'block-idle', 'missile-idle'] as const;
type Fault = (typeof FAULTS)[number];
const CONTEXT = ['missile-idle-clear', 'engaged-idle', 'wrapping', 'march-wave'] as const;

interface Tally {
  hit: Record<string, number>;
  of: Record<string, number>;
}
const tally = (): Tally => ({ hit: {}, of: {} });
function add(t: Tally, k: string, hit: boolean | number, of = 1): void {
  t.hit[k] = (t.hit[k] ?? 0) + (typeof hit === 'number' ? hit : hit ? 1 : 0);
  t.of[k] = (t.of[k] ?? 0) + of;
}

const CELL = 10;
const WHY = process.argv.includes('--why');
const whys = new Map<string, number>();
/** With --why: what the men caught in a fault were doing (role, mode, contact, engaged, rank). */
function why(f: string, b: Battle, i: number): void {
  if (!WHY) return;
  const f0 = f;
  const d = (b as any).d;
  const r = b.regiments[d.reg[i]]!;
  const k = `${f} | ${r.role} ${r.mode} ${r.contact ? 'contact' : '-'} ${r.engaged ? 'engaged' : '-'} row${Math.min(3, d.row[i])} ${d.cu[i] ? 'curl' + d.cu[i] : ''} ${d.target[i] < 0 ? 'no-target' : 'target'}`;
  whys.set(k, (whys.get(k) ?? 0) + 1);
}

function audit(b: Battle, T: Tally): void {
  const d = (b as any).d;
  const n = b.soldiers.length;
  const W = Math.ceil((FIELD_W + 100) / CELL);
  const H = Math.ceil((FIELD_H + 100) / CELL);
  const head = new Int32Array(W * H).fill(-1);
  const next = new Int32Array(n);
  const cellOf = (x: number, y: number) => Math.max(0, Math.min(W - 1, Math.floor((x + 50) / CELL))) + Math.max(0, Math.min(H - 1, Math.floor((y + 50) / CELL))) * W;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const idle = new Int32Array(n);
  const noTarget = new Int32Array(n);
  const lastShot = new Int32Array(n).fill(0);
  const touching = new Uint8Array(n);
  const touchFoe = new Int32Array(n);
  const nearFoe = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = d.x[i];
    py[i] = d.y[i];
  }
  const scan = (x: number, y: number, R: number, f: (j: number, d2: number) => void) => {
    const x0 = Math.floor((x - R + 50) / CELL), x1 = Math.floor((x + R + 50) / CELL);
    const y0 = Math.floor((y - R + 50) / CELL), y1 = Math.floor((y + R + 50) / CELL);
    for (let cy = Math.max(0, y0); cy <= Math.min(H - 1, y1); cy++)
      for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++)
        for (let j = head[cx + cy * W]!; j >= 0; j = next[j]!) {
          const dx = d.x[j] - x, dy = d.y[j] - y;
          const q = dx * dx + dy * dy;
          if (q <= R * R) f(j, q);
        }
  };
  // Whether man i could walk up to enemy man j without going through another enemy.
  const clear = (i: number, j: number): boolean => {
    const x0 = d.x[i], y0 = d.y[i];
    const ex = d.x[j] - x0, ey = d.y[j] - y0;
    const L = Math.sqrt(ex * ex + ey * ey) || 1;
    const tj = d.team[j];
    for (let s = 3; s < L - 3; s += 3) {
      const qx = x0 + (ex * s) / L, qy = y0 + (ey * s) / L;
      let hit = false;
      scan(qx, qy, 4.5, (k) => {
        if (k !== j && d.team[k] === tj) hit = true;
      });
      if (hit) return false;
    }
    return true;
  };
  const blockIdle = new Int32Array(b.regiments.length);
  while (!b.done() && b.tick < MAX) {
    b.step();
    const tick = b.tick;
    for (let i = 0; i < n; i++) if (d.acted[i] === tick - 1 && b.soldiers[i]!.s.range > 0) lastShot[i] = tick;
    if (tick % EVERY !== 0) continue;
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      if (d.state[i] !== State.Fighting) continue;
      const c = cellOf(d.x[i], d.y[i]);
      next[i] = head[c]!;
      head[c] = i;
    }
    // Pass 1: who touches an enemy, who is the nearest enemy, who stands in whom.
    for (let i = 0; i < n; i++) {
      touching[i] = 0;
      touchFoe[i] = -1;
      nearFoe[i] = Infinity;
      if (d.state[i] !== State.Fighting) continue;
      const ti = d.team[i];
      const ri = d.rad[i];
      let stacked = false;
      let bt = Infinity;
      scan(d.x[i], d.y[i], 30, (j, q) => {
        if (j === i) return;
        if (d.team[j] === ti) {
          const m = 0.5 * (ri + d.rad[j]);
          if (q < m * m) stacked = true;
          return;
        }
        if (q < nearFoe[i]!) nearFoe[i] = q;
        const reach = ri + d.rad[j] + 3;
        if (q <= reach * reach && q < bt) {
          bt = q;
          touching[i] = 1;
          touchFoe[i] = j;
        }
      });
      nearFoe[i] = Math.sqrt(nearFoe[i]!);
      add(T, 'stacked', stacked);
    }
    // Pass 2: each man's state.
    for (let i = 0; i < n; i++) {
      const s = b.soldiers[i]!;
      const st = s.s;
      if (d.state[i] !== State.Fighting) {
        idle[i] = 0;
        noTarget[i] = 0;
        px[i] = d.x[i];
        py[i] = d.y[i];
        continue;
      }
      const r = b.regiments[d.reg[i]]!;
      const mx = d.x[i] - px[i]!, my = d.y[i] - py[i]!;
      const sp = Math.sqrt(mx * mx + my * my) / (EVERY * TICK_S);
      px[i] = d.x[i];
      py[i] = d.y[i];
      const mounted = st.mounted;
      const tgt = d.target[i] as number;
      const still = tgt < 0 && sp < 2;
      idle[i] = still ? idle[i]! + EVERY : 0;
      noTarget[i] = tgt < 0 ? noTarget[i]! + EVERY : 0;
      if (r.routed || r.role === 'command') continue;
      // (Getting up from the dead, U3: he fights nobody yet, by design.)
      if (d.rose[i] >= 0 && tick - d.rose[i] < 16) continue;
      const shooting = st.range > 0 && d.ammo[i] > 0 && (r.mode === 'shoot' || r.mode === 'kite' || r.mode === 'skirmish');
      if (!mounted) {
        if (sp > 2.2 * d.spd[i] * 1.4 && r.mode !== 'charge' && r.mode !== 'pursue') add(T, 'jumps', true);
        else add(T, 'jumps', false);
      }
      if (!mounted && !shooting && r.role !== 'siege') {
        // Free enemies within 30.
        let free = false;
        if (idle[i]! > 30 && nearFoe[i]! <= 30) {
          const ti = d.team[i];
          scan(d.x[i], d.y[i], 30, (j) => {
            if (free || d.team[j] === ti || touching[j] || b.soldiers[j]!.s.mounted) return;
            const o = b.regiments[d.reg[j]]!;
            if (!o.routed && clear(i, j)) free = true;
          });
        }
        if (nearFoe[i]! <= 30) {
          add(T, 'idle-free-foe', free);
          if (free) why('idle-free-foe', b, i);
        }
        if (r.engaged) {
          if (nearFoe[i]! <= 30) {
            add(T, 'idle-near-fight', idle[i]! > 30);
            if (idle[i]! > 30) why('idle-near-fight', b, i);
          }
          add(T, 'engaged-idle', !touching[i]);
          let gap = false;
          if (idle[i]! > 20 && nearFoe[i]! <= 20) {
            // The nearest enemy's direction, and whether a rank step that way is free of friends.
            let bj = -1;
            let bq = Infinity;
            scan(d.x[i], d.y[i], 20, (j, q) => {
              if (d.team[j] !== d.team[i] && q < bq) {
                bq = q;
                bj = j;
              }
            });
            if (bj >= 0) {
              const q = Math.sqrt(bq) || 1;
              const step = Math.min(q - d.rad[i] - d.rad[bj], r.spacing * 1.1);
              if (step > d.rad[i] * 1.5) {
                const gx = d.x[i] + ((d.x[bj] - d.x[i]) / q) * step;
                const gy = d.y[i] + ((d.y[bj] - d.y[i]) / q) * step;
                let occupied = false;
                scan(gx, gy, d.rad[i] * 1.6, (j) => {
                  if (j !== i && d.team[j] === d.team[i]) occupied = true;
                });
                gap = !occupied;
              }
            }
          }
          if (nearFoe[i]! <= 20) add(T, 'idle-gap', gap);
          if (gap) why('idle-gap', b, i);
        }
        if (touching[i]) {
          const ign = noTarget[i]! > 10 && notExcused(b, i);
          add(T, 'foe-ignored', ign);
          if (ign) why('foe-ignored', b, i);
          const j = touchFoe[i]!;
          const vx = d.vx[i] - d.px[i], vy = d.vy[i] - d.py[i];
          const vq = Math.sqrt(vx * vx + vy * vy);
          const ex = d.x[j] - d.x[i], ey = d.y[j] - d.y[i];
          const eq = Math.sqrt(ex * ex + ey * ey) || 1;
          // (Closing on his own foe, close by, with another enemy at his back is fighting, not walking away.)
          const t0 = d.target[i] as number;
          const onFoe = t0 >= 0 && t0 !== j && (d.x[t0] - d.x[i]) * vx + (d.y[t0] - d.y[i]) * vy > 0 && Math.hypot(d.x[t0] - d.x[i], d.y[t0] - d.y[i]) < d.rad[i] + d.rad[t0] + 8;
          const excused = onFoe || r.mode === 'withdraw' || r.mode === 'skirmish' || r.ord.kind === 'withdraw' || tick < d.wd[i] || (b as any).outOfMeasure(i, r);
          const away = !excused && vq > 3 && (vx * ex + vy * ey) / (vq * eq) < -0.5;
          add(T, 'walks-away', away);
          if (away) {
            const t2 = d.target[i] as number;
            const tq = t2 >= 0 ? ((d.x[t2] - d.x[i]) * vx + (d.y[t2] - d.y[i]) * vy) / vq : 0;
            why(`walks-away ${t2 < 0 ? '' : t2 === j ? 'at-him' : tq > 0 ? 'to-other' : 'from-other'}${(b as any).wrapSide(i, t2 < 0 ? j : t2, r) ? ' wrap' : ''}${r.surgeUntil > tick ? ' surge' : ''}${r.lullUntil > tick ? ' lull' : ''}`, b, i);
          }
        }
        if (r.engaged && tgt >= 0) {
          const o = b.regiments[d.reg[tgt]]!;
          const lat = (d.x[i] - o.ax) * -o.fy + (d.y[i] - o.ay) * o.fx;
          add(T, 'wrapping', Math.abs(lat) > o.width * 0.5 + 1);
        }
      }
      if (!mounted && st.range > 0 && r.role === 'missile' && d.ammo[i] > 0 && tgt < 0) {
        let inRange = false;
        let free = false;
        for (const o of b.regiments) {
          if (o.team === d.team[i] || o.alive === 0 || o.routed) continue;
          const dx = o.cx - d.x[i], dy = o.cy - d.y[i];
          const q = Math.sqrt(dx * dx + dy * dy) - o.radius * 0.7;
          if (q < st.range) {
            inRange = true;
            if (!o.engaged) free = true;
          }
        }
        if (inRange) {
          const idle = tick - Math.max(lastShot[i]!, 0) > 2 * fireEvery(st) + 30;
          add(T, 'missile-idle', idle);
          if (idle) {
            // Why (v17, QA #13): is there a block in range he could shoot at without his scatter
            // coming down among our own men (`clearTarget`, the danger-close rule)? If not, his
            // silence is right: he holds rather than shoot into his own men.
            const kind = (b as any).fire[r.team][r.cls];
            let clear = false;
            for (const o of b.regiments) {
              if (o.team === d.team[i] || o.alive === 0 || o.routed || o.engaged) continue;
              const q = Math.hypot(o.cx - d.x[i], o.cy - d.y[i]);
              if (q - o.radius * 0.7 < st.range && (b as any).clearTarget(r, o, Math.max(q, 1), kind, st)) clear = true;
            }
            const cause = !free ? 'all-in-melee (holds: danger close)' : !clear ? 'free-but-danger-close (holds)' : 'clear-target';
            add(T, 'missile-idle-clear', cause === 'clear-target');
            why(`missile-idle ${cause} ${r.targetReg >= 0 ? 'has-target' : 'no-target-reg'}`, b, i);
          } else add(T, 'missile-idle-clear', false);
        }
      }
    }
    // A line on the move: the front rank's spread along the facing (units), per advancing block.
    for (const r of b.regiments) {
      if (r.routed || r.alive < 8 || r.role !== 'line' || r.mode !== 'advance') continue;
      let k = 0, s = 0, s2 = 0;
      for (const id of r.members) {
        if (d.state[id] !== State.Fighting || d.row[id] !== 0) continue;
        const f = (d.x[id] - r.ax) * r.fx + (d.y[id] - r.ay) * r.fy;
        k++;
        s += f;
        s2 += f * f;
      }
      if (k >= 4) add(T, 'march-wave', Math.sqrt(Math.max(0, s2 / k - (s / k) * (s / k))), 1);
    }
    // A formed block of foot not fighting while, within 60 of its edge, an enemy block is locked
    // with a friend (a flank to take) for over 10 s: per block-sample, of foot blocks of the line.
    for (const r of b.regiments) {
      if (r.routed || r.alive < 4 || r.role !== 'line') continue;
      let by = false;
      if (!r.engaged && r.mode !== 'charge' && r.mode !== 'advance' && r.mode !== 'pursue') {
        for (const o of b.regiments) {
          if (o.team === r.team || o.alive === 0 || o.routed || !o.engaged) continue;
          const dx = o.cx - r.cx, dy = o.cy - r.cy;
          if (Math.sqrt(dx * dx + dy * dy) - o.radius - r.radius < 60) {
            by = true;
            break;
          }
        }
      }
      blockIdle[r.id] = by ? blockIdle[r.id]! + EVERY : 0;
      add(T, 'block-idle', blockIdle[r.id]! > 100);
      if (blockIdle[r.id]! > 100 && WHY) {
        const k = `block-idle | ${r.role} ${r.mode} ${r.ord.kind} line${r.line}${r.committed ? ' committed' : ''}`;
        whys.set(k, (whys.get(k) ?? 0) + 1);
      }
    }
  }
}

/** Not a shooter with a foe at hand drawing, nor the wounded going to the rear. */
function notExcused(b: Battle, i: number): boolean {
  const d = (b as any).d;
  const r = b.regiments[d.reg[i]]!;
  return !(b.tick < d.wd[i]) && r.mode !== 'withdraw' && r.mode !== 'skirmish';
}

const rows: { name: string; t: Tally; ticks: number; winner: number | null }[] = [];
const all = tally();
for (const men of SIZES) {
  for (const seed of SEEDS) {
    const setup = demoSetup(seed, men, FACTIONS.length === 2 ? [FACTIONS[0]!, FACTIONS[1]!] : undefined);
    const b = new Battle(setup);
    const T = tally();
    const t0 = performance.now();
    audit(b, T);
    const res = b.result ?? b.run(0);
    for (const k of Object.keys(T.of)) add(all, k, T.hit[k] ?? 0, T.of[k]!);
    const name = `${men}/${seed} ${setup.armies[0].faction.slice(0, 3)}-${setup.armies[1].faction.slice(0, 3)}`;
    rows.push({ name, t: T, ticks: res.ticks, winner: res.winner });
    console.error(`${name}: ${res.ticks} ticks, winner ${res.winner}, ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
}

const pct = (t: Tally, k: string) => (t.of[k] ? (100 * (t.hit[k] ?? 0)) / t.of[k]! : NaN);
const fmt = (v: number, k: string) => (Number.isNaN(v) ? '-' : k === 'march-wave' ? (v / 100).toFixed(2) : v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(2));
const keys = [...FAULTS, ...CONTEXT];
const w = 18;
console.log(['battle'.padEnd(w), ...keys.map((k) => k.padStart(16))].join(''));
for (const r of rows) console.log([r.name.padEnd(w), ...keys.map((k) => fmt(pct(r.t, k), k).padStart(16))].join(''));
console.log(['ALL'.padEnd(w), ...keys.map((k) => fmt(pct(all, k), k).padStart(16))].join(''));
console.log('(rates in % of the man-samples each measure applies to; march-wave in units)');
if (WHY) {
  for (const f of FAULTS) {
    const list = [...whys].filter(([k]) => k.split(' ')[0] === f).sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [k, v] of list) console.log(String(v).padStart(7), k);
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ all: Object.fromEntries(keys.map((k) => [k, pct(all, k)])), rows: rows.map((r) => ({ name: r.name, ticks: r.ticks, winner: r.winner, ...Object.fromEntries(keys.map((k) => [k, pct(r.t, k)])) })) }, null, 1));
