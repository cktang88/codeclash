// Battle v17 terrain: the generated field, and what each kind of ground does in small set pieces
// (src/game/terrain-pieces.ts; `npx tsx scripts/terrain-sanity.ts` prints the numbers).
import { describe, expect, it } from 'vitest';
import { demoSetup } from '../client/demo.ts';
import { Battle, FIELD_H, FIELD_W } from './battle.ts';
import { DEPLOY_X, Ground, Terrain } from './terrain.ts';
import { archersEdge, chargeAt, crossing, hillFight, holdCrest, horseAtWood, march, volley } from './terrain-pieces.ts';

const field = (seed: number) => new Terrain('field', FIELD_W, FIELD_H, seed);

describe('the generated field', () => {
  it('is the same for the same seed, and differs between seeds', () => {
    const a = field(7);
    const b = field(7);
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(Array.from(field(8).height)).not.toEqual(Array.from(a.height));
  });

  it('is fair: each cell has its twin turned about the centre, and both deployment zones are clear of woods and soft ground', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = field(seed);
      const n = t.cols * t.rows;
      for (let i = 0; i < n; i += 7) {
        const j = n - 1 - i;
        expect(Math.abs(t.height[i]! - t.height[j]!)).toBeLessThan(0.01);
        // (The stream is drawn point-symmetric too, but a cell's centre can fall either side of its bank.)
        const gi = t.ground[i]!;
        const gj = t.ground[j]!;
        if (gi === Ground.Wood || gj === Ground.Wood) expect(gi === gj || gi >= Ground.Ford || gj >= Ground.Ford).toBe(true);
      }
      for (let r = 0; r < t.rows; r++) {
        for (let c = 0; c < t.cols; c++) {
          const x = (c + 0.5) * t.cell;
          if (x > DEPLOY_X && x < FIELD_W - DEPLOY_X) continue;
          const g = t.ground[r * t.cols + c]!;
          expect(g === Ground.Wood || g === Ground.Soft).toBe(false);
        }
      }
    }
  });

  it('is modest: gentle slopes, a few woods, a stream now and then, and the flat field bare', () => {
    let streams = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = field(seed);
      let steep = 0;
      for (let i = 0; i < t.height.length; i++) steep = Math.max(steep, Math.hypot(t.slopeX[i]!, t.slopeY[i]!));
      expect(steep).toBeLessThan(0.32);
      expect(t.hills.length).toBeGreaterThan(0);
      expect(t.woods.length).toBeLessThanOrEqual(4);
      if (t.stream) {
        streams++;
        expect(t.stream.fords.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(streams).toBeGreaterThan(3);
    expect(streams).toBeLessThan(17);
    const flat = new Terrain('flat', FIELD_W, FIELD_H, 3);
    expect(flat.flat).toBe(true);
    expect(flat.height.every((h) => h === 0) && flat.ground.every((g) => g === 0)).toBe(true);
  });

  it('a flat setup fights the battle it always did', () => {
    const a = new Battle({ ...demoSetup(5, 150), terrain: undefined });
    const b = new Battle({ ...demoSetup(5, 150), terrain: 'flat' });
    while (a.tick < 300) {
      a.step();
      b.step();
    }
    expect(b.soldiers.map((s) => s.x + s.y * 3 + s.hp)).toEqual(a.soldiers.map((s) => s.x + s.y * 3 + s.hp));
  });
});

describe('what the ground does', () => {
  it('uphill slows and tires men; woods slow men (horse most) and break their ranks; a stream slows them', () => {
    const flat = march('flat');
    const up = march('up');
    const wood = march('wood');
    const stream = march('stream');
    expect(up.ticks).toBeGreaterThan(flat.ticks * 1.25);
    expect(up.fatigue).toBeGreaterThan(flat.fatigue + 0.06);
    expect(wood.ticks).toBeGreaterThan(flat.ticks * 1.3);
    expect(wood.offPlace).toBeGreaterThan(flat.offPlace * 1.8);
    expect(stream.ticks).toBeGreaterThan(flat.ticks * 1.08);
    const hf = march('flat', true);
    const hw = march('wood', true);
    expect(hw.ticks / hf.ticks).toBeGreaterThan(wood.ticks / flat.ticks);
    expect(hw.offPlace).toBeGreaterThan(hf.offPlace * 3);
  });

  it('the side holding a hill fights with the edge: fewer of its men fall than on the flat', () => {
    let flat = 0;
    let hill = 0;
    let attackerOnHill = 0;
    for (let s = 1; s <= 4; s++) {
      flat += hillFight('flat', s).deadB;
      const h = hillFight('hill', s);
      hill += h.deadB;
      expect(h.winner).not.toBe(0);
      attackerOnHill += hillFight('below', s).deadB;
    }
    expect(hill).toBeLessThan(flat * 0.8);
    expect(attackerOnHill).toBeGreaterThan(flat);
  });

  it('a charge down a slope hits harder; a charge into a wood is stopped by the trees', () => {
    let flat = 0;
    let down = 0;
    let wood = 0;
    let woodImp = 0;
    for (let s = 1; s <= 4; s++) {
      flat += chargeAt('flat', s).hpLost;
      down += chargeAt('down', s).hpLost;
      const w = chargeAt('wood', s);
      wood += w.hpLost;
      woodImp = Math.max(woodImp, w.impetus);
    }
    expect(down).toBeGreaterThan(flat * 1.15);
    expect(woodImp).toBeLessThanOrEqual(0.15);
    expect(wood).toBeLessThan(flat * 0.35);
  });

  it('missiles: a wood hides what is deep in it and covers what is at its edge; height adds range', () => {
    const mean = (g: Parameters<typeof volley>[0], gap: number) => [1, 2, 3, 4].reduce((a, s) => a + volley(g, gap, s).hpLost, 0) / 4;
    expect(volley('deep', 400).first).toBe(-1);
    expect(mean('edge', 400)).toBeLessThan(mean('flat', 400) * 0.8);
    const flat = volley('flat', 610).first;
    expect(volley('below', 610).first).toBeLessThan(flat - 30);
    expect(volley('above', 610).first).toBeGreaterThan(flat + 20);
  });

  it('a block wades a stream rather than go far round, but takes the ford under fire', () => {
    const calm = crossing(true, false);
    expect(calm.fordMiss).toBeGreaterThan(150);
    const fire = crossing(true, true);
    expect(fire.fordMiss).toBeLessThan(80);
    expect(fire.ticks).toBeGreaterThan(0);
    expect(fire.wet).toBeLessThan(crossing(false, true).wet * 0.6);
  });
});

describe('choosing ground', () => {
  it('a holding block steps up to the crest before it', () => {
    const c = holdCrest();
    expect(c.forward).toBeGreaterThan(100);
    expect(c.height).toBeGreaterThan(25);
  });

  it('holding archers take the edge of a wood beside them, inside it but not deep', () => {
    const e = archersEdge();
    expect(e.moved).toBeGreaterThan(20);
    expect(e.depth).toBeGreaterThan(4);
    expect(e.depth).toBeLessThan(45);
  });

  it('horse sent at foot in a wood keeps out of the trees', () => {
    expect(horseAtWood()).toBeLessThan(16);
  });
});
