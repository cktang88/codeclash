// Regression tests for battle.ts bugs found in the sweep of degenerate armies: armies of one
// kind only, a general alone, armies too deep for the field, and the end at the time limit.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_TICKS, MORALE, State, type ArmySpec, type BattleSetup, type Regiment } from './battle.ts';
import { U, UNIT_COUNT } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const spec = (counts: number[], opts: Partial<ArmySpec> = {}): ArmySpec => ({
  name: 'x', faction: 'templar', hue: 0, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true, ...opts,
});
const army = (n: number, opts: Partial<ArmySpec> = {}) => spec(MIX.map((f) => Math.round(n * f)), opts);
const only = (cls: number, n: number, opts: Partial<ArmySpec> = {}) => {
  const c = new Array(UNIT_COUNT).fill(0);
  c[cls] = n;
  return spec(c, opts);
};
const of = (pairs: Record<number, number>, opts: Partial<ArmySpec> = {}) => {
  const c = new Array(UNIT_COUNT).fill(0);
  for (const [k, v] of Object.entries(pairs)) c[Number(k)] = v;
  return spec(c, opts);
};
const setupOf = (seed: number, a: ArmySpec, b: ArmySpec): BattleSetup => ({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [a, { ...b, hue: 200 }] });
const offField = (b: Battle) => b.soldiers.filter((s) => s.x < 0 || s.x > FIELD_W || s.y < 0 || s.y > FIELD_H).length;

describe('battle: deployment', () => {
  it('deploys every man on the field, however lopsided the army', () => {
    for (const a of [only(U.LightCavalry, 2800), only(U.Artillery, 2800), only(U.Archers, 2800), of({ [U.Artillery]: 260, [U.Skirmishers]: 260, [U.Spearmen]: 175 })]) {
      const b = new Battle(setupOf(1, a, army(2800)));
      expect(offField(b)).toBe(0);
    }
  }, 60_000);

  it('an army of engines is a few batteries, not hundreds (and fights quickly)', () => {
    const b = new Battle(setupOf(1, only(U.Artillery, 2800), army(2800)));
    expect(b.regiments.filter((r) => r.team === 0).length).toBeLessThanOrEqual(33);
    // A handful of engines still go four to a battery.
    const s = new Battle(setupOf(1, army(2800), army(2800)));
    expect(s.regiments.filter((r) => r.role === 'siege' && r.team === 0).every((r) => r.start <= 4)).toBe(true);
  }, 60_000);
});

describe('battle: armies with no line', () => {
  it('archers against archers close to bow range and fight it out', () => {
    const r = fight(setupOf(1, only(U.Archers, 300), only(U.Archers, 300)));
    expect(r.reason).toBe('rout');
    expect(r.sides[0].dead[U.Archers]! + r.sides[1].dead[U.Archers]!).toBeGreaterThan(30);
  }, 60_000);

  it('skirmishers with no line to fall behind do not run to the edge of the field', () => {
    const b = new Battle(setupOf(1, only(U.Skirmishers, 300), only(U.Skirmishers, 300)));
    const r = b.run();
    expect(r.reason).toBe('rout');
    expect(r.ticks).toBeLessThan(MAX_TICKS);
  }, 60_000);

  it('two generals left alone ride at each other instead of walking off the field or waiting', () => {
    const b = new Battle(setupOf(1, army(0), army(0)));
    while (!b.done()) {
      b.step();
      for (const s of b.soldiers) if (s.state === State.Fighting) expect(s.x > 100 && s.x < FIELD_W - 100).toBe(true);
    }
    expect(b.result!.reason).toBe('rout');
    expect(b.result!.ticks).toBeLessThan(MAX_TICKS);
  }, 60_000);

  it('small mixed armies with no line still finish by a rout', () => {
    // Both of these stood until the time limit: a general at the field's edge nobody could reach.
    const a = fight(setupOf(558530609, of({ 2: 4, 3: 1, 4: 4, 7: 3, 8: 2 }), of({ 1: 6, 2: 9, 3: 11, 5: 14, 6: 9, 7: 4, 9: 19 })));
    const b = fight(setupOf(274941236, of({ 2: 119, 4: 234, 8: 22 }), of({ 1: 3, 3: 3, 4: 4, 5: 6, 7: 1, 9: 4 })));
    expect(a.reason).toBe('rout');
    expect(b.reason).toBe('rout');
  }, 60_000);
});

describe('battle: an enemy with only horse, or no line', () => {
  // Each of these stood until the time limit: knights waiting for lines that would never meet,
  // and foot kept in reserve because the enemy had nothing but horse left.
  const cases: [number, Partial<ArmySpec>, number[], Partial<ArmySpec>, number[]][] = [
    [889453478, { moraleBonus: 0, pavise: 0.3, stakes: false, commander: false }, [1, 0, 2, 4, 5, 3, 0, 5, 0, 0], { moraleBonus: 11, pavise: 0.12, stakes: false }, [1, 1, 0, 2, 0, 2, 4, 0, 1, 0]],
    [171967740, { moraleBonus: 9, commander: false }, [0, 106, 12, 0, 0, 0, 87, 0, 0, 0], { moraleBonus: 5, pavise: 0.38, commander: false }, [261, 186, 0, 103, 310, 0, 0, 0, 157, 0]],
  ];
  it('is fought to a rout', () => {
    for (const [seed, oa, ca, ob, cb] of cases) {
      const vets = (c: number[]) => c.map(() => 0);
      expect(fight(setupOf(seed, spec(ca, { ...oa, veterans: vets(ca) }), spec(cb, { ...ob, veterans: vets(cb) }))).reason).toBe('rout');
    }
  }, 60_000);
});

describe('battle: horse archers and skirmishers', () => {
  const used = (b: Battle, cls: number) => {
    let carried = 0;
    let left = 0;
    for (const s of b.soldiers) if (s.cls === cls && !s.commander) {
      carried += s.s.ammo;
      left += s.ammo;
    }
    return 1 - left / carried;
  };

  it('horse archers loose most of their arrows at big blocks of foot, then the battle ends', () => {
    // They used to ride up, find themselves inside their own retreat distance, ride off, and
    // never shoot: six minutes without a casualty.
    for (const seed of [1, 2]) {
      const b = new Battle(setupOf(seed, only(U.HorseArchers, 300), only(U.HeavyInfantry, 300)));
      const r = b.run();
      expect(r.reason).toBe('rout');
      expect(used(b, U.HorseArchers)).toBeGreaterThan(0.5);
    }
  }, 60_000);

  it('skirmishers throw most of their javelins before the lines meet', () => {
    let share = 0;
    for (const seed of [1, 2]) {
      const b = new Battle(setupOf(seed, army(1000), army(1000)));
      b.run();
      share += used(b, U.Skirmishers) / 2;
    }
    expect(share).toBeGreaterThan(0.4);
  }, 60_000);
});

describe('battle: cavalry in melee', () => {
  it('takes on another enemy when the block it rode into is gone', () => {
    // Knights locked in a melee with two blocks of foot; the one they charged is wiped out.
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = new Battle(setupOf(seed, only(U.Knights, 60, { commander: false }), only(U.HeavyInfantry, 160, { commander: false })));
      b.generals[0].rashKnights = true;
      while (!b.done() && b.tick < 1500) {
        b.step();
        const k = b.regiments.find((r) => r.team === 0 && r.engaged && r.mode === 'melee' && r.targetReg >= 0);
        if (!k) continue;
        const gone = k.targetReg;
        for (const id of b.regiments[gone]!.members) b.kill(id);
        for (let i = 0; i < 6; i++) b.step();
        // (Since v4 the knights no longer stand inside the block they wiped out: they may have
        // to ride a few strides to the next one, so they are charging it rather than locked yet.)
        if ((k.engaged || k.mode === 'charge') && !k.routed) {
          expect(k.targetReg).not.toBe(gone);
          checked++;
        }
        break;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);
});

describe('battle: setups', () => {
  it('fights bad counts as whole men: NaN, infinite and negative as none, fractions floored', () => {
    const a = spec([NaN, Infinity, -5, 40.7, 0, 12.2, 0, 3.9, 0, 0], { veterans: [5, NaN, 0, 99, 0, 0, 0, 0, 0, 0], pavise: NaN, moraleBonus: Infinity });
    const b = new Battle(setupOf(1, a, army(80)));
    expect(b.setup.armies[0].counts).toEqual([0, 0, 0, 40, 0, 12, 0, 3, 0, 0]);
    expect(b.setup.armies[0].veterans).toEqual([0, 0, 0, 40, 0, 0, 0, 0, 0, 0]);
    expect(b.soldiers.filter((s) => s.team === 0 && !s.commander && b.regiments[s.reg]!.role !== 'command').length).toBe(55);
    const r = b.run();
    for (const side of r.sides) for (let c = 0; c < UNIT_COUNT; c++) expect(side.dead[c]! + side.fled[c]! + side.alive[c]!).toBe(side.start[c]);
    for (const s of b.soldiers) expect(Number.isFinite(s.x) && Number.isFinite(s.y) && !Number.isNaN(s.hp)).toBe(true);
    // A valid setup is fought as given.
    const ok = setupOf(1, army(80), army(80));
    expect(new Battle(ok).setup).toEqual(ok);
  }, 60_000);
});

describe('battle: the end', () => {
  it('a break in the last seconds ends at the time limit, the same for fight() and a replay', () => {
    // Engines on both sides never meet; late in the day one side loses most of its men and breaks.
    const setup = setupOf(3, only(U.Artillery, 40, { commander: false }), only(U.Artillery, 40, { commander: false }));
    const bleed = (b: Battle) => {
      while (b.tick < MAX_TICKS - 40) b.step();
      for (const s of b.soldiers) if (s.team === 0 && s.id % 10 !== 0) b.kill(s.id);
    };
    // As the server does it: run to the limit.
    const server = new Battle(setup);
    bleed(server);
    const r = server.run(MAX_TICKS - server.tick);
    expect(server.result).toEqual(r);
    expect(r.ticks).toBe(MAX_TICKS);
    // As the browser does it: step until done.
    const replay = new Battle(setup);
    bleed(replay);
    while (!replay.done()) replay.step();
    expect(replay.result).toEqual(r);
    expect(r.winner).toBe(1);
  }, 60_000);

  it('the side that broke first loses, even if the winner’s remnant breaks in the pursuit', () => {
    const setup = setupOf(4, only(U.Artillery, 60, { commander: false }), only(U.Artillery, 60, { commander: false }));
    const cull = (b: Battle, team: number, keep: number) => {
      for (const s of b.soldiers) if (s.team === team && s.id % keep !== 0) b.kill(s.id);
    };
    for (const first of [0, 1]) {
      for (let seed = 1; seed <= 3; seed++) {
        const b = new Battle({ ...setup, seed });
        while (b.tick < 600) b.step();
        cull(b, first, 20);
        while (!b.broken[first]) b.step();
        cull(b, 1 - first, 20);
        while (!b.done()) b.step();
        expect(b.broken).toEqual([true, true]);
        expect(b.result!.winner).toBe(1 - first);
      }
    }
    // Both at once: the side with more men left wins.
    for (let seed = 1; seed <= 3; seed++) {
      const b = new Battle({ ...setup, seed });
      while (b.tick < 600) b.step();
      cull(b, 0, 30);
      cull(b, 1, 14);
      while (!b.done()) b.step();
      expect(b.broken).toEqual([true, true]);
      expect(b.result!.winner).toBe(1);
    }
  }, 60_000);

  it('degenerate battles are deterministic', () => {
    const setup = setupOf(9, of({ [U.Artillery]: 300, [U.HorseArchers]: 60 }), of({ [U.Skirmishers]: 200, [U.Archers]: 50 }));
    const a = new Battle(setup);
    const b = new Battle(setup);
    a.run();
    b.run();
    expect(a.result).toEqual(b.result);
    expect(a.events).toEqual(b.events);
    expect(a.soldiers.map((s) => [s.x, s.y, s.hp, s.state])).toEqual(b.soldiers.map((s) => [s.x, s.y, s.hp, s.state]));
  }, 60_000);
});

describe('battle: determinism rules (rng.ts)', () => {
  it('the game code uses no engine-approximated maths, clock or Math.random', () => {
    // `**` is Math.pow, which, like the trigonometry and logarithms, the spec lets each engine
    // approximate: a browser could fight a different battle from the server.
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const banned = /Math\.(random|pow|exp|expm1|log\w*|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|hypot|cbrt)\b|\*\*|Date\.now|new Date|performance\.now/;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const code = readFileSync(dir + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|`[^`\n]*`/g, "''");
      const lines = code.split('\n').filter((l) => banned.test(l));
      expect(lines, f).toEqual([]);
    }
  });
});

describe('battle: the general’s household', () => {
  it('fights the enemy that comes within reach of its men, not one whose block’s bounding circle does', () => {
    const b = new Battle(setupOf(1, army(300), only(U.Spearmen, 60, { commander: false })));
    const inside = b as unknown as { thinkCommand(r: Regiment): void; formUp(r: Regiment, x: number, y: number): void };
    const hh = b.regiments.find((r) => r.role === 'command')!;
    const foe = b.regiments.find((r) => r.team === 1)!;
    const stand = (r: Regiment, x: number, y: number, fx: number, fy: number) => {
      r.fx = r.dfx = fx;
      r.fy = r.dfy = fy;
      inside.formUp(r, x, y);
    };
    stand(hh, 400, 600, 1, 0);
    // A big block side-on to it: its end file 50 off, its bounding circle's edge much nearer.
    stand(foe, 400 + foe.depth / 2, 600 + 50 + foe.width / 2, -1, 0);
    expect(Math.hypot(foe.cx - hh.cx, foe.cy - hh.cy) - foe.radius - hh.radius).toBeLessThan(40);
    inside.thinkCommand(hh);
    expect(hh.mode).toBe('guard');
    // Within reach of its men: it takes them on, riding for the nearest of them, not the block's middle.
    stand(foe, 400 + foe.depth / 2, 600 + 25 + foe.width / 2, -1, 0);
    inside.thinkCommand(hh);
    expect(hh.mode).toBe('melee');
    expect(hh.ty).toBeLessThan(600 + 40);
  });

  it('draws back from a block that outweighs it more than twice over, while its army has a line', () => {
    const b = new Battle(setupOf(1, army(300), only(U.HeavyInfantry, 2800, { commander: false })));
    const inside = b as unknown as { thinkCommand(r: Regiment): void; formUp(r: Regiment, x: number, y: number): void; updateFront(t: number): void };
    inside.updateFront(0);
    const hh = b.regiments.find((r) => r.role === 'command')!;
    const foe = b.regiments.find((r) => r.team === 1)!;
    expect(foe.alive * 1.4).toBeGreaterThan(2 * hh.alive * 4.5);
    hh.fx = hh.dfx = 1;
    hh.fy = hh.dfy = 0;
    inside.formUp(hh, 400, 600);
    foe.fx = foe.dfx = -1;
    foe.fy = foe.dfy = 0;
    // Its nearest man 25 off the household's men, straight ahead of it.
    inside.formUp(foe, 400 + 30, 600);
    inside.thinkCommand(hh);
    expect(hh.mode).toBe('withdraw');
    expect(hh.tx).toBeLessThan(400);
  });
});

describe('battle: the fallen who may rise (U3)', () => {
  it('a corpse whose regiment is gone will never rise, and says so', () => {
    const b = new Battle(setupOf(2, army(300, { faction: 'undead' }), army(300)));
    let seen = 0;
    while (!b.done()) {
      b.step();
      if (b.tick % 10 !== 0) continue;
      for (const s of b.soldiers) {
        if (s.team !== 0 || s.state !== State.Dead || !b.mayRise(s.id)) continue;
        seen++;
        expect(b.regiments[s.reg]!.alive, `regiment ${s.reg}`).toBeGreaterThan(0);
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});

// v16: what grew with the size of a battle (the field stays the same: a big battle is a crowded one).
describe('battle: morale that does not grow with the battle (v16)', () => {
  type Inside = { rout(r: Regiment): void; survey(r: Regiment): void; drawn(r: Regiment): boolean; ts: { hasLine: boolean }[] };
  it('a rout shakes the friends about it by its share of the men there, not 7 each however many they are', () => {
    for (const men of [250, 2800]) {
      const b = new Battle(setupOf(1, army(men), army(men)));
      const inside = b as unknown as Inside;
      const r = b.regiments.find((x) => x.team === 0 && x.role === 'line')!;
      const near = b.regiments.filter((o) => o.team === 0 && o !== r && Math.hypot(o.cx - r.cx, o.cy - r.cy) < MORALE.friendRoutRange);
      expect(near.length).toBeGreaterThan(0);
      const about = r.alive + near.reduce((a, o) => a + o.alive, 0);
      const panic = Math.min(MORALE.friendRoutCap, (MORALE.friendRout * r.alive) / about);
      const before = near.map((o) => o.morale);
      inside.rout(r);
      near.forEach((o, i) => expect(before[i]! - o.morale).toBeCloseTo(o.role === 'command' ? 2 : panic, 6));
    }
  });

  it('outnumbered weighs the enemy close by against ours close by, not against the block alone', () => {
    const b = new Battle(setupOf(1, army(500), army(500)));
    const inside = b as unknown as Inside;
    const [r, friend] = b.regiments.filter((x) => x.team === 0 && x.role === 'line');
    const foe = b.regiments.find((x) => x.team === 1 && x.role === 'line' && x.cls === r!.cls)!;
    // The foe and the friend both right by it, and both fighting.
    foe.cx = r!.cx + 10;
    foe.cy = r!.cy;
    friend!.cx = r!.cx;
    friend!.cy = r!.cy + 10;
    foe.engaged = true;
    friend!.engaged = true;
    inside.survey(r!);
    expect(r!.enemyNear).toBeGreaterThan(0);
    expect(r!.friendNear * b.stats[0][r!.cls]!.value).toBeCloseTo(friend!.alive * b.stats[0][friend!.cls]!.value, 6);
  });

  it('late in the day, shooters with no line of their own left before them go in like foot of the line', () => {
    const b = new Battle(setupOf(1, army(500), army(500)));
    const inside = b as unknown as Inside;
    const bows = b.regiments.find((x) => x.team === 0 && x.role === 'missile')!;
    inside.ts[0]!.hasLine = false;
    expect(inside.drawn(bows)).toBe(false);
    b.tick = 2401;
    expect(inside.drawn(bows)).toBe(true);
    inside.ts[0]!.hasLine = true;
    expect(inside.drawn(bows)).toBe(false);
  });
});
