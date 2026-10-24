// Scratch: how many soldiers it costs to storm an empty capital.
import { TICKS_PER_MINUTE, type SimInput } from '../src/sim/api.ts';
import { generateMap, slotsFor } from '../src/sim/mapgen.ts';
import { createWorld, step } from '../src/sim/world.ts';
const pushes = Number(process.argv[2] ?? 6);
const params = { seed: 3, slots: slotsFor(3), members: 3 };
const w = createWorld(params, generateMap(params));
step(w, [0, 1, 2].map((p) => ({ kind: 'join', p, slot: p, hue: p * 50 }) as SimInput));
// defenders push once (so walls breachable) with nothing
step(w, [{ kind: 'push', p: 1, repo: 1, commits: 1, msg: 'docs', lines: [0, 0, 0, 10, 0, 0, 0, 0, 0], files: 0, branches: 0, churn: 0, filler: 0 }, { kind: 'push', p: 2, repo: 2, commits: 1, msg: 'docs', lines: [0, 0, 0, 10, 0, 0, 0, 0, 0], files: 0, branches: 0, churn: 0, filler: 0 }]);
const inputs: SimInput[] = [];
for (let i = 0; i < pushes; i++) inputs.push({ kind: 'push', p: 0, repo: 0, commits: 1, msg: 'feat: x', lines: [200, 20, 10, 0, 0, 30, 0, 0, 0], files: 4, branches: 30, churn: 0, filler: 0 });
step(w, inputs);
const raised = w.players[0]!.raised.reduce((a, b) => a + b, 0);
let t0 = -1;
while (w.tick < 120 * TICKS_PER_MINUTE) {
  const ev = step(w, []);
  if (process.env.V && w.tick % 1500 === 0) console.log(w.tick / 300, w.platoons.filter((p) => p.p === 0).map((p) => `${p.id}:${p.state}/${p.site}@${Math.round(p.x)},${Math.round(p.y)} n${p.alive} m${Math.round(p.morale)}`).join(' '), 'deaths', ev.deaths.length, 'mine', w.units.filter((u) => u.p === 0).length);
  if (t0 < 0 && w.structures.some((s) => s.p !== s.site && s.hp < s.maxHp)) t0 = w.tick;
  if (ev.conquests.length) {
    const alive = w.units.filter((u) => u.p === 0).length;
    console.log(`conquest at ${(w.tick / 300).toFixed(1)} min (siege ${((w.tick - t0) / 300).toFixed(1)} min), raised ${raised}, alive ${alive}, cost ${raised - alive}`);
    break;
  }
}
console.log('walls', w.structures.map((s) => `${s.site}:p${s.p}:${Math.round(s.hp)}`).join(' '), 'alive', w.units.filter((u) => u.p === 0).length, 'of', raised);
