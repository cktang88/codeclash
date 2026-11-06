// Battle realism audit: watches whole demo battles and flags the moments a real soldier, officer
// or general would not be in. Regiment-level and man-level detectors; read-only (it never changes
// the battle, only watches it and wraps `hurt` to see who hit whom).
//
//   npx tsx scripts/qa/realism-audit.ts                         seeds 1-8 x 450,1200,2800 (seed's factions)
//   npx tsx scripts/qa/realism-audit.ts --pairs --seeds 1,2,3 --sizes 1200   every faction pairing
//   npx tsx scripts/qa/realism-audit.ts --json out.json --verbose
//
// Detectors (each prints a count and the worst examples with seed / men / tick / block id):
//   never-engaged    a combat block alive at the end that never fought hand to hand nor loosed
//   reserve-idle     a second-line block that never engaged while its army lost
//   oscillate        the anchor reverses its line of march 3+ times in 30 s (each leg > 6 u)
//   backwards        the anchor walks against the block's facing (> 5 u/s for 3 s+) outside a
//                    withdrawal, skirmish fall-back, kite or rout
//   face-away        a standing (not routing) man drawn facing away from the enemy man nearest
//                    him within 12 units (facing as the renderer picks it, src/client/render/pose.ts)
//   rout-wrong       a routing man running toward the enemy's edge (heading x against his own edge)
//   rout-into        a routing man within 10 of an enemy and running toward him
//   fled-wrong-edge  a man who left the field over the enemy's edge
//   ff-missile       hurt by his own side's missile; split by shooter class, and whether his block
//                    was in melee at the time (shooting into one's own melee)
//   edge-stuck       a man not routing within 10 of the field edge for 5 s+
//   flank-ignored    a block in melee taking most of its blows on flank or rear for 10 s+ whose
//                    facing has not turned toward them
//   standoff         60 s+ with no man falling while both sides still stand (before the break)
//   general-front    the general's household ahead of its own line's front (toward the enemy)
//   general-alone    the general more than 250 units from any friendly block
//   general-melee    ticks the general's household is locked in melee
//   ammo-left        a missile block alive at the end with over half its shots unfired
//   ha-melee         horse archers locked in melee with arrows left
//   charge-long      a charge running 20 s+ without contact
//   straggler        a man of a formed block (hold/advance/guard/reserve, not engaged) over 4
//                    spacings from his slot for 10 s+
//   timeout          the battle ran to the time limit
//   anchor-jump      a formed block's anchor moved faster than 2x its men's speed (dragged, not marched)
//   spread-block     a block not routed whose men are spread over 3x its formation's half-diagonal (and 150 u+)
import { Battle, FIELD_H, FIELD_W, MAX_TICKS, State, type Regiment } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { FACTION_IDS, type FactionId } from '../../src/game/factions.ts';
import { dirFor } from '../../src/client/render/iso.ts';
import { U } from '../../src/game/units.ts';
import { writeFileSync } from 'node:fs';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4,5,6,7,8').split(',').map(Number);
const SIZES = arg('sizes', '450,1200,2800').split(',').map(Number);
const PAIRS = process.argv.includes('--pairs');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = arg('json', '');
const ONLY = arg('only', '');

interface Hit {
  battle: string;
  tick: number;
  reg: number;
  note: string;
  n?: number;
}
const hits: Record<string, Hit[]> = {};
const counts: Record<string, number> = {};
const denom: Record<string, number> = {};
const flag = (k: string, h: Hit) => {
  (hits[k] ??= []).push(h);
  counts[k] = (counts[k] ?? 0) + (h.n ?? 1);
};
const tallyOf = (k: string, by = 1) => (denom[k] = (denom[k] ?? 0) + by);

const ROLE = { line: 'L', missile: 'M', skirmish: 'S', flank: 'C', 'shock-cav': 'K', 'horse-archer': 'H', siege: 'A', command: 'G' } as Record<string, string>;
const CLS = ['heavy', 'spear', 'skirm', 'archer', 'xbow', 'lightcav', 'horsearch', 'knight', 'shock', 'artillery'];
const tag = (r: Regiment) => `${ROLE[r.role]}${r.id}(t${r.team} ${CLS[r.cls] ?? r.cls}${r.role === 'command' ? ' GENERAL' : ''})`;

interface Summary {
  battle: string;
  ticks: number;
  winner: number;
  reason: string;
  firstContact: number;
  brokenAt: number;
}
const summaries: Summary[] = [];
/** Missile hits on men, by shooter class and own / foe, over all battles. */
const GLOBAL_MISSILE: Record<string, number> = {};
/** Artillery: per engine block, shots fired and the nearest any enemy block came (centres). */
const ART: { battle: string; reg: number; shots: number; nearest: number; nearestFree: number; range: number }[] = [];

function run(seed: number, men: number, fac?: [FactionId, FactionId]): void {
  const setup = demoSetup(seed, men, fac);
  const b = new Battle(setup);
  const name = `s${seed}/${men} ${setup.armies[0].faction.slice(0, 3)}-${setup.armies[1].faction.slice(0, 3)}`;
  if (ONLY && !name.includes(ONLY)) return;
  const d = (b as any).d;
  const N = b.soldiers.length;
  const regs = b.regiments;
  const R = regs.length;
  // Friendly fire: wrap `missileHit` (it passes no shooter on to `hurt` for a friend).
  const projShooters = new Set<number>();
  const mh0 = (b as any).missileHit.bind(b);
  const ffByCls: Record<string, number> = {};
  let ffMelee = 0;
  let ffTotal = 0;
  (b as any).missileHit = (o: number, p: { team: number; cls: number; shooter: number; splash: number }) => {
    if (d.state[o] <= State.Routing) {
      const k = CLS[p.cls]! + (d.team[o] === p.team ? ' own' : ' foe');
      GLOBAL_MISSILE[k] = (GLOBAL_MISSILE[k] ?? 0) + 1;
    }
    if (d.team[o] === p.team && d.state[o] <= State.Routing) {
      ffTotal++;
      ffByCls[CLS[p.cls]!] = (ffByCls[CLS[p.cls]!] ?? 0) + 1;
      const vr = regs[d.reg[o]]!;
      if (vr.engaged) ffMelee++;
      if (VERBOSE && ffTotal <= 3) console.log(`  ff ${name} t${b.tick} ${CLS[p.cls]} hit own ${tag(vr)} engaged=${vr.engaged} mode=${vr.mode}`);
    }
    return mh0(o, p);
  };
  void projShooters;

  // Per-regiment trackers.
  const engagedEver = new Uint8Array(R);
  const loosedEver = new Uint8Array(R);
  const ammo0 = new Float64Array(R);
  for (let i = 0; i < N; i++) ammo0[d.reg[i]] += d.ammo[i];
  const hist: { x: number; y: number }[][] = regs.map(() => []);
  const backT = new Int32Array(R);
  const flankT = new Int32Array(R);
  const flankF = new Float64Array(R * 2);
  const chargeT = new Int32Array(R);
  const lastOsc = new Int32Array(R).fill(-1000);
  const lastBack = new Int32Array(R).fill(-1000);
  const lastFlank = new Int32Array(R).fill(-1000);
  const lastJump = new Int32Array(R).fill(-1000);
  const lastWide = new Int32Array(R).fill(-1000);
  const prevAnchor = regs.map((r) => ({ x: r.ax, y: r.ay }));
  // Per-man trackers.
  const edgeT = new Int32Array(N);
  const stragT = new Int32Array(N);
  const edgeFlagged = new Uint8Array(N);
  const stragFlagged = new Uint8Array(N);
  const dirs = new Int8Array(N);
  let faceAway = 0;
  let faceOf = 0;
  const faceWhy: Record<string, number> = {};
  let routWrong = 0;
  let routInto = 0;
  let routOf = 0;
  let lastDeath = 0;
  let deadPrev = 0;
  let firstContact = -1;
  let standoffFlagged = -1;
  let genMelee = [0, 0];
  let genFront = [0, 0];
  let genAlone = [0, 0];
  let genOf = 0;
  const fledWrong = new Uint8Array(N);
  const ai = (b as any).ts as { frontX: number; hasLine: boolean; lineDepth: number }[];

  const arts = regs.filter((r) => r.role === 'siege');
  const artInfo = arts.map((r) => ({ battle: name, reg: r.id, shots: 0, nearest: Infinity, nearestFree: Infinity, range: b.stats[r.team]![r.cls]!.range }));
  const shoot0 = (b as any).shoot.bind(b);
  (b as any).shoot = (i: number, r: Regiment, st: unknown) => {
    const before = b.projectiles.length;
    const out = shoot0(i, r, st);
    if (r.role === 'siege' && b.projectiles.length > before) {
      const k = arts.indexOf(r);
      if (k >= 0) artInfo[k]!.shots++;
    }
    return out;
  };
  while (!b.done() && b.tick < MAX_TICKS + 5) {
    b.step();
    const T = b.tick;
    // Every tick: anchors (cheap).
    for (const r of regs) {
      if (r.alive === 0) continue;
      if (r.engaged) engagedEver[r.id] = 1;
      if (r.loosed > 0) loosedEver[r.id] = 1;
    }
    if (firstContact < 0 && regs.some((r) => r.engaged)) firstContact = T;
    if (T % 10 === 0)
      for (let k = 0; k < arts.length; k++) {
        const r = arts[k]!;
        if (r.alive === 0) continue;
        for (const o of regs) {
          if (o.team === r.team || o.alive === 0 || o.routed) continue;
          const q = Math.hypot(o.cx - r.cx, o.cy - r.cy);
          artInfo[k]!.nearest = Math.min(artInfo[k]!.nearest, q);
          if (!o.engaged) artInfo[k]!.nearestFree = Math.min(artInfo[k]!.nearestFree, q);
        }
      }
    if (T % 5 !== 0) continue;
    // Deaths and standoff.
    let dead = 0;
    const fighting = [0, 0];
    for (let i = 0; i < N; i++) {
      if (d.state[i] === State.Dead || d.state[i] === State.Fled) dead++;
      if (d.state[i] === State.Fighting) fighting[d.team[i]]!++;
      if (d.state[i] === State.Fled && !fledWrong[i]) {
        fledWrong[i] = 1;
        const own = d.team[i] === 0 ? 0 : FIELD_W;
        if (Math.abs(d.x[i] - own) > FIELD_W / 2) flag('fled-wrong-edge', { battle: name, tick: T, reg: d.reg[i], note: `${tag(regs[d.reg[i]]!)} left over the enemy edge at y ${d.y[i].toFixed(0)}` });
      }
    }
    if (dead > deadPrev) lastDeath = T;
    deadPrev = dead;
    if (firstContact >= 0 && !b.broken[0] && !b.broken[1] && T - lastDeath >= 600 && standoffFlagged < lastDeath && fighting[0]! > 20 && fighting[1]! > 20) {
      standoffFlagged = T;
      flag('standoff', { battle: name, tick: T, reg: -1, note: `no man fell for ${((T - lastDeath) / 10).toFixed(0)} s; fighting ${fighting[0]!} v ${fighting[1]!}; modes ${regs.filter((r) => r.alive > 0 && !r.routed).map((r) => ROLE[r.role]! + r.id + ':' + r.mode).join(' ')}` });
    }

    for (const r of regs) {
      if (r.alive === 0) continue;
      // Anchor history (every 0.5 s), for oscillation and walking backwards.
      const h = hist[r.id]!;
      h.push({ x: r.ax, y: r.ay });
      if (h.length > 61) h.shift();
      const pa = prevAnchor[r.id]!;
      const vx = (r.ax - pa.x) * 2;
      const vy = (r.ay - pa.y) * 2;
      prevAnchor[r.id] = { x: r.ax, y: r.ay };
      const sp = Math.hypot(vx, vy);
      // Anchor jumps: the block's place moves faster than its men can run (it is dragged).
      const top = Math.max(...r.members.slice(0, 1).map((id) => b.soldiers[id]!.s.speed), r.speed) * 2;
      if (!r.routed && r.mode !== 'rally' && sp > Math.max(top, 30) && T - lastJump[r.id]! > 100) {
        lastJump[r.id] = T;
        flag('anchor-jump', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode} anchor moved ${(sp / 2).toFixed(0)} u in 0.5 s (men run ${(top / 2).toFixed(0)} u/s); radius ${r.radius.toFixed(0)}` });
      }
      // A block whose men are spread far wider than its formation (members routing far off, or joined from afar).
      const span = Math.hypot(r.width, r.depth) / 2 + 30;
      if (!r.routed && r.role !== 'command' && r.radius > Math.max(3 * span, 150) && T - lastWide[r.id]! > 300) {
        lastWide[r.id] = T;
        let run = 0;
        for (const id of r.members) if (d.state[id] === State.Routing) run++;
        flag('spread-block', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode}: its men spread over a radius of ${r.radius.toFixed(0)} u (formation ${span.toFixed(0)}); ${run} of its members still routing` });
      }
      const okBack = r.routed || r.mode === 'withdraw' || r.mode === 'skirmish' || r.mode === 'kite' || r.mode === 'rout' || r.mode === 'rally';
      if (!okBack && sp > 5 && (vx * r.fx + vy * r.fy) < -0.5 * sp) backT[r.id] = backT[r.id]! + 5;
      else backT[r.id] = 0;
      if (backT[r.id]! >= 30 && T - lastBack[r.id]! > 200) {
        lastBack[r.id] = T;
        flag('backwards', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode} order ${r.order} stance ${r.stance} walks backward at ${sp.toFixed(1)} u/s, facing (${r.fx.toFixed(2)},${r.fy.toFixed(2)})` });
      }
      // Oscillation: legs of 2 s; count reversals over the last 30 s.
      if (h.length >= 61 && T - lastOsc[r.id]! > 300 && !r.routed && r.role !== 'horse-archer') {
        let rev = 0;
        let px = 0;
        let py = 0;
        for (let k = 4; k < h.length; k += 4) {
          const lx = h[k]!.x - h[k - 4]!.x;
          const ly = h[k]!.y - h[k - 4]!.y;
          const lm = Math.hypot(lx, ly);
          if (lm < 6) continue;
          if (px * lx + py * ly < -0.5 * Math.hypot(px, py) * lm) rev++;
          px = lx;
          py = ly;
        }
        if (rev >= 3) {
          lastOsc[r.id] = T;
          flag('oscillate', { battle: name, tick: T, reg: r.id, note: `${tag(r)} reversed ${rev}x in 30 s; mode ${r.mode} order ${r.order} target ${r.targetReg}` });
        }
      }
      // Charges that never arrive.
      if (r.mode === 'charge' && !r.engaged) chargeT[r.id] = chargeT[r.id]! + 5;
      else chargeT[r.id] = 0;
      if (chargeT[r.id] === 200) flag('charge-long', { battle: name, tick: T, reg: r.id, note: `${tag(r)} charging 20 s without contact, target ${r.targetReg}` });
    }

    // Man-level (every 0.5 s).
    const flankHits = new Float64Array(R);
    const allHits = new Float64Array(R);
    const flankX = new Float64Array(R);
    const flankY = new Float64Array(R);
    for (let i = 0; i < N; i++) {
      const st = d.state[i];
      if (st > State.Routing) continue;
      const r = regs[d.reg[i]]!;
      const x = d.x[i];
      const y = d.y[i];
      const team = d.team[i];
      // Nearest enemy within 14.
      let ne = -1;
      let nd = 14 * 14;
      b.near(x, y, 14, (s, d2) => {
        if (s.team !== team && s.state <= State.Routing && d2 < nd) {
          nd = d2;
          ne = s.id;
        }
      });
      if (st === State.Routing) {
        routOf++;
        const edge = team === 0 ? -1 : 1;
        if (d.vx[i] * edge < -0.3 * Math.hypot(d.vx[i], d.vy[i]) && Math.hypot(d.vx[i], d.vy[i]) > 3) routWrong++;
        if (ne >= 0 && nd < 100) {
          const ex = d.x[ne] - x;
          const ey = d.y[ne] - y;
          if (ex * d.vx[i] + ey * d.vy[i] > 0.5 * Math.sqrt(nd) * Math.hypot(d.vx[i], d.vy[i])) routInto++;
        }
        edgeT[i] = 0;
        continue;
      }
      // Edge.
      if (x < 10 || x > FIELD_W - 10 || y < 10 || y > FIELD_H - 10) edgeT[i] = edgeT[i]! + 5;
      else edgeT[i] = 0;
      if (edgeT[i]! >= 50 && !edgeFlagged[i]) {
        edgeFlagged[i] = 1;
        flag('edge-stuck', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode} man at (${x.toFixed(0)},${y.toFixed(0)})` });
      }
      // Stragglers from a formed block.
      if (!r.engaged && (r.mode === 'hold' || r.mode === 'advance' || r.mode === 'guard' || r.mode === 'reserve') && d.target[i] < 0 && r.role !== 'command') {
        const gx = r.ax + r.fx * d.sy[i] - r.fy * d.sx[i];
        const gy = r.ay + r.fy * d.sy[i] + r.fx * d.sx[i];
        if (Math.hypot(gx - x, gy - y) > 4 * Math.max(3, r.spacing)) stragT[i] = stragT[i]! + 5;
        else stragT[i] = 0;
      } else stragT[i] = 0;
      if (stragT[i]! >= 100 && !stragFlagged[i]) {
        stragFlagged[i] = 1;
        flag('straggler', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode} man ${i} far from slot` });
      }
      if (ne < 0) continue;
      // Renderer facing (approx. pose.facing): moving > 3 u/s and no foe in reach -> velocity; else target or foe; else front.
      const tg = d.target[i];
      const sp = Math.hypot(d.vx[i], d.vy[i]);
      const acting = T - d.acted[i] < 6;
      const reach = tg >= 0 && (d.x[tg] - x) ** 2 + (d.y[tg] - y) ** 2 < 14 * 14;
      const melee = b.soldiers[i]!.s.range === 0 || reach;
      const run = sp > b.soldiers[i]!.s.speed * 1.2 || (sp > b.soldiers[i]!.s.speed * 0.6 && (r.mode === 'charge' || r.mode === 'pursue'));
      const engaged = tg >= 0 && melee;
      let dir = dirs[i] as 0 | 1 | 2 | 3;
      let why = '';
      if (sp > 3 && !acting && (run || !engaged)) {
        dir = dirFor(d.vx[i], d.vy[i], dir);
        why = `moving(${r.mode}${run ? ',run' : ''})`;
      } else if (tg >= 0) {
        dir = dirFor(d.x[tg] - x, d.y[tg] - y, dir);
        why = 'target';
      } else {
        dir = dirFor(r.fx, r.fy, dir);
        why = `front(${r.mode})`;
      }
      dirs[i] = dir;
      const want = dirFor(d.x[ne] - x, d.y[ne] - y, dir);
      faceOf++;
      if (want === ((dir + 2) % 4)) {
        faceAway++;
        const k = `${ROLE[r.role]} ${why}${tg >= 0 && tg !== ne ? ' tgt-not-nearest' : ''}`;
        faceWhy[k] = (faceWhy[k] ?? 0) + 1;
      }
      // Flank and rear blows on the block.
      if (r.engaged && nd < 64) {
        const ex = d.x[ne] - x;
        const ey = d.y[ne] - y;
        const q = Math.sqrt(nd) || 1;
        allHits[r.id] = allHits[r.id]! + 1;
        if ((ex * r.fx + ey * r.fy) / q < -0.2) {
          flankHits[r.id] = flankHits[r.id]! + 1;
          flankX[r.id] = flankX[r.id]! + ex / q;
          flankY[r.id] = flankY[r.id]! + ey / q;
        }
      }
    }
    for (const r of regs) {
      if (r.alive === 0 || r.routed || r.role === 'command') continue;
      if (allHits[r.id]! >= 6 && flankHits[r.id]! > 0.6 * allHits[r.id]!) {
        flankT[r.id] = flankT[r.id]! + 5;
        flankF[r.id * 2] = flankF[r.id * 2]! + flankX[r.id]!;
        flankF[r.id * 2 + 1] = flankF[r.id * 2 + 1]! + flankY[r.id]!;
      } else {
        flankT[r.id] = 0;
        flankF[r.id * 2] = flankF[r.id * 2 + 1] = 0;
      }
      if (flankT[r.id]! >= 100 && T - lastFlank[r.id]! > 300) {
        lastFlank[r.id] = T;
        flag('flank-ignored', { battle: name, tick: T, reg: r.id, note: `${tag(r)} mode ${r.mode} stance ${r.stance}: ${(100 * flankHits[r.id]! / allHits[r.id]!).toFixed(0)}% of its foes in reach behind its front for ${(flankT[r.id]! / 10).toFixed(0)} s; facing (${r.fx.toFixed(2)},${r.fy.toFixed(2)})` });
      }
    }
    // Generals.
    genOf++;
    for (const t of [0, 1]) {
      const g = regs.find((r) => r.team === t && r.role === 'command');
      if (!g || g.alive === 0 || b.broken[t]) continue;
      if (g.engaged) genMelee[t]!++;
      const ts = ai[t]!;
      const dir = t === 0 ? 1 : -1;
      if (ts.hasLine && (g.cx - ts.frontX) * dir > 20) {
        genFront[t]!++;
        if (genFront[t] === 20) flag('general-front', { battle: name, tick: T, reg: g.id, note: `${tag(g)} ${((g.cx - ts.frontX) * dir).toFixed(0)} u ahead of his own line, mode ${g.mode}` });
      }
      let near = Infinity;
      for (const o of regs) if (o.team === t && o !== g && o.alive > 0 && !o.routed) near = Math.min(near, Math.hypot(o.cx - g.cx, o.cy - g.cy));
      if (near > 250 && near < Infinity) {
        genAlone[t]!++;
        if (genAlone[t] === 20) flag('general-alone', { battle: name, tick: T, reg: g.id, note: `${tag(g)} ${near.toFixed(0)} u from the nearest friendly block, mode ${g.mode}` });
      }
    }
  }
  ART.push(...artInfo);
  const res = b.result!;
  summaries.push({ battle: name, ticks: b.tick, winner: res.winner, reason: res.reason, firstContact, brokenAt: b.brokenAt });
  if (res.reason === 'time') flag('timeout', { battle: name, tick: b.tick, reg: -1, note: `ran to the time limit; winner ${res.winner}` });
  for (const t of [0, 1]) {
    if (genMelee[t]! > 0) flag('general-melee', { battle: name, tick: b.tick, reg: -1, note: `t${t} (${setup.armies[t]!.faction}) general locked in melee ${(genMelee[t]! / 2).toFixed(0)} s of ${(genOf / 2).toFixed(0)} s`, n: genMelee[t]! / 2 });
  }
  // End-of-battle block checks.
  const lost = res.winner === 0 ? 1 : 0;
  for (const r of regs) {
    if (r.role === 'command' || r.start === 0) continue;
    tallyOf('blocks');
    const fought = engagedEver[r.id] || loosedEver[r.id];
    if (!fought && r.alive > 0 && b.tick > 900) flag('never-engaged', { battle: name, tick: b.tick, reg: r.id, note: `${tag(r)} ${r.alive}/${r.start} men, ended mode ${r.mode} order ${r.order} line ${r.line} committed ${r.committed}` });
    if (r.line === 2) {
      tallyOf('reserves');
      if (!engagedEver[r.id] && r.team === lost && r.alive > 0) flag('reserve-idle', { battle: name, tick: b.tick, reg: r.id, note: `${tag(r)} second line never engaged while its army lost; committed ${r.committed}, mode ${r.mode}` });
    }
    if (r.role === 'missile' || r.role === 'horse-archer' || r.role === 'skirmish' || r.role === 'siege') {
      let left = 0;
      for (const id of r.members) if (d.state[id] <= State.Routing) left += d.ammo[id];
      const per = ammo0[r.id]! / Math.max(1, r.start);
      if (r.alive > r.start * 0.3 && left > 0.5 * per * r.alive && b.tick > 1200) flag('ammo-left', { battle: name, tick: b.tick, reg: r.id, note: `${tag(r)} ${((100 * left) / (per * r.alive)).toFixed(0)}% of its shots unfired after ${(b.tick / 10).toFixed(0)} s; mode ${r.mode}` });
    }
  }
  if (ffTotal > 0) flag('ff-missile', { battle: name, tick: b.tick, reg: -1, note: `${ffTotal} own-side missile hits (${ffMelee} on blocks in melee): ${JSON.stringify(ffByCls)}; ownGoals ${b.ownGoals.join('/')}`, n: ffTotal });
  tallyOf('face', faceOf);
  tallyOf('rout', routOf);
  counts['face-away'] = (counts['face-away'] ?? 0) + faceAway;
  counts['rout-wrong'] = (counts['rout-wrong'] ?? 0) + routWrong;
  counts['rout-into'] = (counts['rout-into'] ?? 0) + routInto;
  for (const [k, v] of Object.entries(faceWhy)) counts['face-away: ' + k] = (counts['face-away: ' + k] ?? 0) + v;
  console.log(`${name.padEnd(22)} ${(b.tick / 10).toFixed(0).padStart(4)} s  winner ${res.winner} ${res.reason}  contact ${(firstContact / 10).toFixed(0)} s  face-away ${((100 * faceAway) / Math.max(1, faceOf)).toFixed(1)}%  rout-wrong ${((100 * routWrong) / Math.max(1, routOf)).toFixed(1)}%  rout-into ${((100 * routInto) / Math.max(1, routOf)).toFixed(1)}%  ff ${ffTotal} (${ffMelee} melee)`);
}

if (PAIRS) {
  for (const a of FACTION_IDS) for (const c of FACTION_IDS) for (const m of SIZES) for (const s of SEEDS) run(s, m, [a, c]);
} else for (const m of SIZES) for (const s of SEEDS) run(s, m);

console.log('\n=== totals ===');
for (const k of Object.keys(counts).sort()) {
  const extra = k === 'face-away' || k.startsWith('face-away:') ? ` (${((100 * counts[k]!) / denom.face!).toFixed(2)}% of man-samples near a foe)` : k.startsWith('rout-') ? ` (${((100 * counts[k]!) / denom.rout!).toFixed(1)}% of router samples)` : '';
  console.log(`${k.padEnd(48)} ${String(Math.round(counts[k]!)).padStart(7)}${extra}`);
}
console.log(`blocks ${denom.blocks}, reserves ${denom.reserves}`);
for (const k of Object.keys(hits).sort()) {
  console.log(`\n--- ${k} (${hits[k]!.length}) ---`);
  for (const h of hits[k]!.slice(0, VERBOSE ? 40 : 8)) console.log(`  ${h.battle} t${h.tick} ${h.note}`);
}
console.log('\n=== missile hits on men (shooter class, own/foe) ===');
for (const k of Object.keys(GLOBAL_MISSILE).sort()) console.log(`${k.padEnd(20)} ${GLOBAL_MISSILE[k]}`);
console.log('\n=== artillery ===');
const fired = ART.filter((a) => a.shots > 0).length;
console.log(`${ART.length} engine blocks, ${fired} ever fired; median shots ${ART.map((a) => a.shots).sort((x, y) => x - y)[ART.length >> 1]}`);
for (const a of ART.slice(0, VERBOSE ? 60 : 10)) console.log(`  ${a.battle} A${a.reg} shots ${a.shots} nearest enemy ${a.nearest.toFixed(0)} nearest unengaged ${a.nearestFree.toFixed(0)} range ${a.range}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ summaries, counts, denom, hits }, null, 1));
