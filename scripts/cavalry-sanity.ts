// Cavalry sanity: counts the moments a real rider would never be in.
//   npx tsx scripts/cavalry-sanity.ts [--seeds 3,7,11,23] [--men 450,1200] [--quick]
//
// Over the set-piece frontal charges (`frontalCharge`, run on for 40 s) and the /demo battles
// (`demoSetup`), sampled every tick, for every rider of the horse (light horse, knights, shock
// horse, horse archers; not the general's household):
//   idle      rider-seconds standing still (under 15% of his speed) for more than 2 s with no
//             foe in reach while the enemy is within 40 units: "why isn't he doing anything?"
//   idle men  riders who were ever so (share of all riders).
//   stacked   rider-ticks where a rider stands inside another (centres closer than 0.6 of the
//             two radii), per 1000 rider-ticks.
//   pike-front  riders who rode at speed into the front of braced spears or a pike wall
//             while that block had an open flank (no friend of its within 20 of either end),
//             per charge launched.
//   behind    rider-seconds of a block riding out (withdraw, or re-forming after it) more than
//             2 s into it, with the rider still within 10 units of an enemy and under half his
//             speed (left behind, stuck in the fight), per withdrawal.
//   ha-close  per mille of the ticks of horse archers with arrows left, outside a chase, with
//             an enemy within 12 units while not in a chase (they should keep their distance).
import { Battle, State, type Regiment, type Soldier } from '../src/game/battle.ts';
import { frontalCharge } from '../src/game/testing.ts';
import { demoSetup } from '../src/client/demo.ts';
import { U } from '../src/game/units.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const quick = process.argv.includes('--quick');
const seeds = arg('seeds', quick ? '3,7' : '3,7,11,23').split(',').map(Number);
const sizes = arg('men', quick ? '450' : '450,1200').split(',').map(Number);

interface Tally {
  riders: number;
  riderTicks: number;
  idle: number;
  idleMen: number;
  stacked: number;
  pikeFront: number;
  charges: number;
  behind: number;
  withdrawals: number;
  haClose: number;
  haTicks: number;
  ticks: number;
  kills: number;
  lost: number;
  battles: number;
}
const zero = (): Tally => ({ riders: 0, riderTicks: 0, idle: 0, idleMen: 0, stacked: 0, pikeFront: 0, charges: 0, behind: 0, withdrawals: 0, haClose: 0, haTicks: 0, ticks: 0, kills: 0, lost: 0, battles: 0 });

const WHY = process.argv.includes('--why');
const why = new Map<string, number>();
const HORSE = (r: Regiment) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer';

/** Watches `b` to the end (or `maxTicks`), adding to `t`. */
function watch(b: Battle, t: Tally, maxTicks = 3600): void {
  const n = b.soldiers.length;
  const still = new Int32Array(n);
  const wasIdle = new Uint8Array(n);
  const hitPike = new Uint8Array(n);
  const counted = new Uint8Array(n);
  const prevMode = new Map<number, string>();
  const outAt = new Map<number, number>();
  const regs = b.regiments;
  let charges0 = 0;
  while (!b.done() && b.tick < maxTicks) {
    b.step();
    t.ticks++;
    for (const r of regs) {
      if (!HORSE(r)) continue;
      const pm = prevMode.get(r.id);
      if (r.mode === 'withdraw' && pm !== 'withdraw') {
        t.withdrawals++;
        outAt.set(r.id, b.tick);
      }
      if (r.mode !== 'withdraw' && !(r.mode === 'hold' && b.tick < r.reformUntil)) outAt.delete(r.id);
      prevMode.set(r.id, r.mode);
    }
    for (const s of b.soldiers) {
      if (s.state !== State.Fighting) continue;
      const r = regs[s.reg]!;
      if (!HORSE(r) || r.routed) continue;
      const i = s.id;
      if (!counted[i]) {
        counted[i] = 1;
        t.riders++;
      }
      t.riderTicks++;
      const sp = Math.hypot(s.vx, s.vy);
      const rad = s.s.radius;
      // Enemy within 40, foe in reach, stacked friend.
      let enemyNear = false;
      let inReach = false;
      let stacked = false;
      let haClose = false;
      let closeFoe = false;
      b.near(s.x, s.y, 40, (o: Soldier, d2: number) => {
        if (o.id === i || o.state !== State.Fighting) return;
        if (o.team !== s.team) {
          enemyNear = true;
          const reach = rad + o.s.radius + 3;
          if (d2 < reach * reach) inReach = true;
          if (d2 < 12 * 12) haClose = true;
          if (d2 < 10 * 10) closeFoe = true;
        } else if (o.s.mounted) {
          const m = 0.6 * (rad + o.s.radius);
          if (d2 < m * m) stacked = true;
        }
      });
      if (s.target >= 0) {
        // Fighting his man (a fugitive included): not idle.
        const f = b.soldiers[s.target]!;
        const reach = rad + f.s.radius + 3;
        if ((f.x - s.x) ** 2 + (f.y - s.y) ** 2 < reach * reach) inReach = true;
      }
      if (stacked) t.stacked++;
      if (sp < s.s.speed * 0.15 && !inReach) still[i] = still[i]! + 1;
      else still[i] = 0;
      if (still[i]! > 20 && enemyNear) {
        t.idle += 0.1;
        if (WHY) why.set(`${r.role}:${r.mode}${r.engaged ? ':eng' : ''}${r.ord.kind !== r.mode ? ':o=' + r.ord.kind : ''}`, (why.get(`${r.role}:${r.mode}${r.engaged ? ':eng' : ''}${r.ord.kind !== r.mode ? ':o=' + r.ord.kind : ''}`) ?? 0) + 0.1);
        if (!wasIdle[i]) {
          wasIdle[i] = 1;
          t.idleMen++;
        }
      }
      if (r.role === 'horse-archer' && r.mode !== 'pursue' && s.ammo > 0) {
        t.haTicks++;
        if (haClose) t.haClose += 0.1;
      }
      const oa = outAt.get(r.id);
      if (oa !== undefined && b.tick - oa > 20 && closeFoe && sp < s.s.speed * 0.5) t.behind += 0.1;
      // Riding into the front of braced spears with an open flank (once per rider per charge).
      if (r.mode !== 'charge') hitPike[i] = 0;
      else if (!hitPike[i] && sp > s.s.speed * 0.5 && s.target >= 0) {
        const f = b.soldiers[s.target]!;
        const fr = regs[f.reg]!;
        if ((fr.stance === 'pikewall' || fr.stance === 'braced') && !fr.engaged) {
          const ex = s.x - fr.ax;
          const ey = s.y - fr.ay;
          const ahead = ex * fr.fx + ey * fr.fy;
          const lat = -ex * fr.fy + ey * fr.fx;
          if (ahead > -2 && Math.abs(lat) < fr.width / 2) {
            hitPike[i] = 1;
            if (openFlank(b, fr)) t.pikeFront++;
          }
        }
      }
    }
  }
  for (const e of b.events) if (e.kind === 'charge') charges0++;
  t.battles++;
  for (const s of b.soldiers) {
    if (s.commander || !(s.s.role === 'flank' || s.s.role === 'shock-cav' || s.s.role === 'horse-archer')) continue;
    t.kills += s.kills;
    if (s.state === State.Dead) t.lost++;
  }
  t.charges += charges0;
}

function openFlank(b: Battle, fr: Regiment): boolean {
  for (const sg of [-1, 1]) {
    const px = fr.ax - fr.fy * sg * (fr.width / 2 + 20) - fr.fx * fr.depth * 0.5;
    const py = fr.ay + fr.fx * sg * (fr.width / 2 + 20) - fr.fy * fr.depth * 0.5;
    let friend = false;
    b.near(px, py, 15, (o) => {
      if (o.team === fr.team && o.reg !== fr.id) {
        friend = true;
        return true;
      }
    });
    if (!friend) return true;
  }
  return false;
}

function add(a: Tally, b: Tally): void {
  for (const k of Object.keys(a) as (keyof Tally)[]) a[k] += b[k];
}

function row(name: string, t: Tally): string {
  const f = (v: number, d = 1) => v.toFixed(d);
  return [
    name.padEnd(26),
    String(t.riders).padStart(6),
    f(t.idle).padStart(8),
    `${f((100 * t.idleMen) / Math.max(1, t.riders))}%`.padStart(7),
    f((1000 * t.stacked) / Math.max(1, t.riderTicks), 2).padStart(8),
    `${t.pikeFront}/${t.charges}`.padStart(9),
    `${f(t.behind)}/${t.withdrawals}`.padStart(11),
    f((1000 * t.haClose * 10) / Math.max(1, t.haTicks), 1).padStart(8),
    `${t.kills}/${t.lost}`.padStart(10),
    f((t.ticks / Math.max(1, t.battles)) * 0.1, 0).padStart(5),
  ].join(' ');
}

console.log(['case'.padEnd(26), 'riders', 'idle s', 'idle%', 'stack‰', 'pikeFr', 'behind s/wd', 'haClose‰', 'kill/lost', 'len s'].join(' '));
const sets: [string, () => Battle][] = [];
for (const [h, f, st] of [
  [U.Knights, U.Spearmen, 'pikewall'],
  [U.Knights, U.HeavyInfantry, 'line'],
  [U.LightCavalry, U.Archers, 'line'],
  [U.LightCavalry, U.Spearmen, 'braced'],
] as const) {
  for (const seed of seeds) sets.push([`charge ${h}>${f} ${st}`, () => frontalCharge(h, f, st, 40, 16, seed).battle]);
}
const total = zero();
const byCase = new Map<string, Tally>();
const t0 = performance.now();
for (const [name, mk] of sets) {
  const t = zero();
  // frontalCharge stops 3 s after contact: run the fight on for 40 s more.
  const b = mk();
  watch(b, t, b.tick + 400);
  const c = byCase.get(name) ?? zero();
  add(c, t);
  byCase.set(name, c);
}
for (const [name, t] of byCase) console.log(row(name, t));
for (const men of sizes) {
  const sum = zero();
  for (const seed of seeds) {
    const t = zero();
    const b = new Battle(demoSetup(seed, men));
    watch(b, t);
    console.log(row(`demo ${men} seed ${seed}`, t));
    add(sum, t);
  }
  console.log(row(`demo ${men} all`, sum));
  add(total, sum);
}
console.log(row('demo total', total));
if (WHY) for (const [k, v] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${k.padEnd(40)} ${v.toFixed(1)}`);
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
