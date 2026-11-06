// Face-away as the renderer draws it (QA battle-realism #8): runs battles and, every tick, picks
// each man's animation and facing with the renderer's own pure functions (animstate.ts pickAnim,
// pose.ts ownFront / facing / settleTurn, foes.ts FoeGrid), then counts the men standing (not
// routing) with an enemy within 14 units who are drawn facing directly away from him. Two facings
// are kept side by side: `old` without the enemy at the elbow (the renderer before the fix) and
// `new` with it, so one run measures both.
//   npx tsx scripts/qa/face-away-render.ts [--seeds 1,2,3,4] [--sizes 450,1200] [--ticks 1500] [--where]
// --where lists the ticks and places where most men turned to the enemy at their elbow (for screenshots).

import { Battle, facesRear, FIELD_H, FIELD_W, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { dirFor } from '../../src/client/render/iso.ts';
import { Anim, type Dir } from '../../src/client/render/contract.ts';
import { FRAMES, TICKS } from '../../src/client/render/frames.ts';
import { blankFacts, isGait, pickAnim } from '../../src/client/render/animstate.ts';
import { facing, ownFront, settleTurn, type Vec } from '../../src/client/render/pose.ts';
import { ELBOW, FoeGrid } from '../../src/client/render/foes.ts';
import { U } from '../../src/game/units.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const SIZES = arg('sizes', '450,1200').split(',').map(Number);
const TICKS_MAX = Number(arg('ticks', '1500'));
const WHERE = process.argv.includes('--where');
const spots = new Map<string, number>();
const BRACING = new Set(['shieldwall', 'pikewall', 'braced']);
const ANIM_NAME = ['Idle', 'Walk', 'Run', 'Attack', 'Shoot', 'Hit', 'Die', 'Dead', 'Brace', 'Advance'];
const len = (a: Anim) => Math.round(FRAMES[a]! * TICKS[a]!);

interface Tally { of: number; old: number; new: number; turnOld: number; turnNew: number; why: Record<string, [number, number]> }
const total: Tally = { of: 0, old: 0, new: 0, turnOld: 0, turnNew: 0, why: {} };

for (const seed of SEEDS)
  for (const men of SIZES) {
    const b = new Battle(demoSetup(seed, men, [null, null]));
    const n = b.soldiers.length;
    const prevAnim = new Uint8Array(n);
    const dirOld = new Uint8Array(n), dirNew = new Uint8Array(n);
    const turnOld = new Float64Array(n), turnNew = new Float64Array(n);
    const moveX = new Float32Array(n), moveY = new Float32Array(n);
    const grid = new FoeGrid(FIELD_W, FIELD_H);
    const fa = blankFacts();
    const front: Vec = { x: 0, y: 0 };
    const t: Tally = { of: 0, old: 0, new: 0, turnOld: 0, turnNew: 0, why: {} };
    for (let T = 0; T < TICKS_MAX && !b.result; T++) {
      b.step();
      const ss = b.soldiers;
      grid.build(ss, b.tick);
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i]!;
        if (s.state === State.Dead || s.state === State.Fled) continue;
        const reg = b.regiments[s.reg]!;
        const tgt = s.target >= 0 ? ss[s.target] : undefined;
        const tdx = tgt ? tgt.x - s.x : NaN, tdy = tgt ? tgt.y - s.y : NaN;
        const reach = tgt !== undefined && tdx * tdx + tdy * tdy < 196;
        const melee = s.s.range === 0 || reach;
        const speed = Math.hypot(s.vx, s.vy);
        const near = tgt !== undefined && tdx * tdx + tdy * tdy < 1600;
        const stance = (reg as unknown as { stance?: string }).stance ?? 'line';
        const inFight = s.state === State.Fighting && s.s.range === 0 && (reg.engaged || reg.contact || reg.closeIn > 0.4 || near);
        const actAnim = melee ? Anim.Attack : Anim.Shoot;
        fa.act = b.tick - s.actedAt;
        fa.actAnim = actAnim;
        fa.actLen = len(actAnim);
        fa.hit = b.tick - s.hitAt;
        fa.hitLen = len(Anim.Hit);
        fa.routing = s.state === State.Routing;
        fa.speed = speed;
        fa.top = s.s.speed;
        fa.charging = reg.mode === 'charge' || reg.mode === 'pursue';
        fa.fighting = s.state === State.Fighting;
        fa.reach = reach;
        fa.inFight = inFight;
        fa.wedge = s.cls === U.Knights && stance === 'wedge';
        fa.guard = BRACING.has(stance) || (tgt !== undefined && melee) || inFight;
        const anim = pickAnim(fa, prevAnim[i] as Anim);
        prevAnim[i] = anim;
        if (speed > 3) {
          moveX[i] = s.vx;
          moveY[i] = s.vy;
        }
        const gait = isGait(anim) && speed <= 3;
        const vx = gait ? moveX[i]! : s.vx, vy = gait ? moveY[i]! : s.vy;
        const curling = s.curling === true && !tgt && reg.targetReg >= 0;
        const foeReg = curling ? b.regiments[reg.targetReg] : undefined;
        const rear = facesRear(reg, s.row, s.mounted === true, b.tick);
        const fr = ownFront(reg.fx, reg.fy, rear, curling, foeReg ? foeReg.ax - s.x : NaN, foeReg ? foeReg.ay - s.y : NaN, front);
        const elbow = s.state === State.Fighting && !s.s.mounted ? grid.nearest(s.x, s.y, s.team, ELBOW) : -1;
        const nb = elbow >= 0 ? ss[elbow]! : undefined;
        const step = (dirs: Uint8Array, turns: Float64Array, ndx: number, ndy: number): Dir => {
          const d = dirs[i] as Dir;
          const next = settleTurn(facing(anim, vx, vy, tdx, tdy, melee, NaN, NaN, fr.x, fr.y, d, rear && !curling, ndx, ndy), d, anim, b.tick - turns[i]!);
          if (next !== d) {
            dirs[i] = next;
            turns[i] = b.tick;
          }
          return next;
        };
        const was0 = dirOld[i], was1 = dirNew[i];
        const dOld = step(dirOld, turnOld, NaN, NaN);
        const dNew = step(dirNew, turnNew, nb ? nb.x - s.x : NaN, nb ? nb.y - s.y : NaN);
        if (s.state !== State.Fighting) continue;
        // Turns of men in a fight (a foe within 40): the new rule must not make them flicker.
        if (grid.nearest(s.x, s.y, s.team, 18) >= 0) {
          if (dOld !== was0) t.turnOld++;
          if (dNew !== was1) t.turnNew++;
        }
        // The audit's sample: a man with an enemy within 14 units.
        const ne = grid.nearest(s.x, s.y, s.team, 14);
        if (ne < 0) continue;
        const e = ss[ne]!;
        const want = dirFor(e.x - s.x, e.y - s.y, dOld);
        const wantN = dirFor(e.x - s.x, e.y - s.y, dNew);
        t.of++;
        const away0 = want === ((dOld + 2) & 3), away1 = wantN === ((dNew + 2) & 3);
        if (away0) t.old++;
        if (away1) t.new++;
        if (WHERE && away0 && !away1) {
          const k = `${b.tick} ${Math.round(s.x / 60) * 60} ${Math.round(s.y / 60) * 60}`;
          spots.set(k, (spots.get(k) ?? 0) + 1);
        }
        if (away0 || away1) {
          const k = `${s.mounted ? 'horse' : 'foot'} ${ANIM_NAME[anim]}${tgt ? (ne === s.target ? ' tgt' : reach ? ' tgt-in-reach-not-nearest' : ' tgt-far') : ' no-tgt'}${nb ? '' : ' (no elbow)'}${speed > 3 ? ' moving' : ''}`;
          const w = (t.why[k] ??= [0, 0]);
          if (away0) w[0]++;
          if (away1) w[1]++;
        }
      }
    }
    console.log(`seed ${seed} men ${men}: ${t.of} samples  face-away old ${((100 * t.old) / t.of).toFixed(2)}%  new ${((100 * t.new) / t.of).toFixed(2)}%`);
    total.of += t.of;
    total.old += t.old;
    total.new += t.new;
    total.turnOld += t.turnOld;
    total.turnNew += t.turnNew;
    for (const [k, [a, c]] of Object.entries(t.why)) {
      const w = (total.why[k] ??= [0, 0]);
      w[0] += a;
      w[1] += c;
    }
  }
console.log(`\nALL: ${total.of} samples  face-away old ${((100 * total.old) / total.of).toFixed(2)}%  new ${((100 * total.new) / total.of).toFixed(2)}%  turns (men within 18 u of a foe) old ${total.turnOld} new ${total.turnNew}`);
for (const [k, [a, c]] of Object.entries(total.why).sort((x, y) => y[1][0] - x[1][0]).slice(0, 14))
  console.log(`  ${k.padEnd(40)} old ${((100 * a) / total.of).toFixed(2)}%  new ${((100 * c) / total.of).toFixed(2)}%`);

if (WHERE) for (const [k, v] of [...spots].sort((a, c) => c[1] - a[1]).slice(0, 8)) console.log(`  turned at tick x y: ${k}  (${v} men)`);
