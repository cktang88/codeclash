import { it } from 'vitest';
import { Battle, BATTLE_VERSION } from './battle.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U } from './units.ts';

it('dbg', () => {
  const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [{ ...plainArmy(only(U.Archers, 20)), moraleBonus: 40 }, plainArmy(only(U.Spearmen, 30), 200)] });
  b.generals[0].fixedPlan = 'hold';
  const bows = b.regiments.find((r) => r.team === 0)!;
  const spears = b.regiments.find((r) => r.team === 1)!;
  placeRegiment(b, bows, 700, 600, 1, 0);
  placeRegiment(b, spears, 860, 600, -1, 0);
  let seen = 0;
  const lines: string[] = [];
  while (b.tick < 400 && !b.done()) {
    b.step();
    const ps = b.projectiles.filter((p) => p.team === 0 && p.born === b.tick - 1);
    const minx = Math.min(...spears.members.map((id) => b.soldiers[id]!.x));
    if (b.tick % 5 === 0 || ps.length) lines.push(`t${b.tick} spears ${spears.mode} ax ${spears.ax.toFixed(0)} minx ${minx.toFixed(0)} bows ${bows.mode} atWill ${bows.atWill} eng ${bows.engaged} shots ${ps.map((p) => Math.hypot(p.x1 - p.x0, p.y1 - p.y0).toFixed(0) + (p.arc < Math.hypot(p.x1 - p.x0, p.y1 - p.y0) * 0.1 ? 'F' : '')).join(',')}`);
    seen++;
  }
  console.log(lines.join('\n'));
});
