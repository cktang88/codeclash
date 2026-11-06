// The reserve, the household, the march and the deployment after the second battle-realism
// review (docs/qa/battle-realism-review-2.md, findings 5 and 7): a reserve keeps the friend it
// backs and stands still behind him, the household sits its horse, the line deploys from column
// before it comes into bowshot, and every block faces the enemy at deployment.
import { describe, expect, it } from 'vitest';
import { Battle, type Regiment } from './battle.ts';
import { demoSetup } from '../client/demo.ts';

type Inside = { stats: { range: number }[][] };
const reserve = (r: Regiment) => r.role === 'line' && r.line === 2 && !r.committed && r.order === 'reserve' && r.alive > 0 && !r.routed;

describe('battle: the reserve waits for the word (QA review 2 #5)', () => {
  it('keeps the friend it stands behind, and does not wheel about on its spot', () => {
    let minutes = 0;
    let switches = 0;
    let swing = 0;
    let standing = 0;
    for (const [seed, fa, fb] of [[2, 'templar', 'templar'], [1, 'samurai', 'undead'], [3, 'undead', 'templar']] as const) {
      const b = new Battle(demoSetup(seed, 450, [fa, fb]));
      const friend = new Map<number, number>();
      const face = new Map<number, [number, number, number, number]>();
      while (!b.done() && b.tick < 2000) {
        b.step();
        if (b.tick % 5) continue;
        for (const r of b.regiments) {
          if (!reserve(r)) {
            friend.delete(r.id);
            face.delete(r.id);
            continue;
          }
          minutes += 0.5 / 60;
          const f = friend.get(r.id);
          if (f !== undefined && f !== r.ord.friend) switches++;
          friend.set(r.id, r.ord.friend);
          const p = face.get(r.id);
          if (p && Math.hypot(r.ax - p[2], r.ay - p[3]) * 2 < 4) {
            standing += 0.5;
            swing += (Math.acos(Math.max(-1, Math.min(1, r.fx * p[0] + r.fy * p[1]))) * 180) / Math.PI;
          }
          face.set(r.id, [r.fx, r.fy, r.ax, r.ay]);
        }
      }
    }
    expect(minutes).toBeGreaterThan(10);
    // (Before the fix, over these three battles: 1.0 changes of friend a minute and 2.9° a second
    // of wheeling on the spot; after it 0.4 and 1.1°.)
    expect(switches / minutes).toBeLessThan(0.5);
    expect(swing / standing).toBeLessThan(1.8);
  }, 120_000);
});

describe('battle: the line deploys out of bowshot (QA review 2 #7)', () => {
  it('no block of line foot marches in column inside the reach of the enemy archers', () => {
    let inBow = 0;
    let column = 0;
    for (const [seed, fa, fb] of [[1, 'samurai', 'templar'], [2, 'templar', 'undead']] as const) {
      const b = new Battle(demoSetup(seed, 450, [fa, fb]));
      const stats = (b as unknown as Inside).stats;
      while (!b.done() && b.tick < 900) {
        b.step();
        if (b.tick % 10) continue;
        for (const r of b.regiments) {
          if (r.role !== 'line' || r.alive === 0 || r.routed || r.engaged) continue;
          let bow = false;
          for (const e of b.regiments) {
            if (e.team === r.team || e.role !== 'missile' || e.alive === 0 || e.routed || e.ammoLeft === 0) continue;
            if (Math.hypot(e.cx - r.cx, e.cy - r.cy) - e.radius - r.radius < stats[e.team]![e.cls]!.range) bow = true;
          }
          if (!bow) continue;
          inBow++;
          if (r.stance === 'column') column++;
        }
      }
    }
    expect(inBow).toBeGreaterThan(200);
    // (Before the fix 14% of these samples were in column; after it none.)
    expect(column / inBow).toBeLessThan(0.01);
  }, 60_000);

  it('every block of the line faces the enemy at deployment, the ends of the line too', () => {
    for (const seed of [1, 3, 4, 5]) {
      const b = new Battle(demoSetup(seed, 450, ['samurai', 'templar']));
      while (b.tick < 25) {
        b.step();
        if (b.tick < 5) continue;
        for (const r of b.regiments) {
          if (r.role !== 'line') continue;
          // (Before the fix the yari blocks at the ends of the samurai line, told off for the
          // enemy's flanks, faced along their own line, (0.02, ±1), until they moved.)
          expect(r.fx * (r.team === 0 ? 1 : -1), `seed ${seed} t${b.tick} block ${r.id}`).toBeGreaterThan(0.7);
        }
      }
    }
  });
});
