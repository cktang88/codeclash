import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(n: number, over: Partial<ArmySpec> = {}): ArmySpec {
  return { name: 'a', faction: 'templar', hue: 0, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true, ...over };
}

/** A push of `code` lines with the usual seasoning. */
function push(at: number, code: number): WorkEvent {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  lines[0] = code;
  lines[1] = Math.round(code * 0.3);
  lines[2] = Math.round(code * 0.08);
  lines[3] = Math.round(code * 0.04);
  lines[4] = Math.round(code * 0.03);
  lines[5] = Math.round(code * 0.25);
  return { at, delta: { lines, files: Math.ceil(code / 40), branches: Math.round(code * 0.2), functions: Math.round(code * 0.08), links: Math.round(code * 0.02), churn: 0, filler: 0 } };
}

const WEEK = weekOf(Date.UTC(2026, 10, 3, 12), 0);

function weekOfWork(perDay: number[]): ReturnType<typeof cityAt> {
  const events: WorkEvent[] = [];
  perDay.forEach((code, d) => {
    if (code <= 0) return;
    // Three pushes in office hours.
    for (let k = 0; k < 3; k++) events.push(push(WEEK.weekStart + d * DAY_MS + (10 + 3 * k) * 3_600_000, Math.round(code / 3)));
  });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [] });
}

describe('the week', () => {
  it('starts on Monday at the reset hour', () => {
    const w = weekOf(Date.UTC(2026, 10, 4, 3), 6);
    expect(new Date(w.weekStart).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(w.day).toBe(1);
  });
});

describe('the city', () => {
  it('levels take four times the work for twice the level', () => {
    expect(levelOf(100)).toBe(1);
    expect(levelOf(400)).toBe(2);
    expect(levelOf(399)).toBe(1);
    expect(levelOf(1e9)).toBe(20);
  });

  it('an empty week trains nobody', () => {
    const c = weekOfWork([0, 0, 0, 0, 0, 0, 0]);
    expect(total(c.produced)).toBe(0);
    expect(c.cohorts).toHaveLength(7);
  });

  it('more work raises a bigger army, with diminishing returns', () => {
    const small = total(weekOfWork([300, 300, 300, 300, 300, 300, 300]).produced);
    const big = total(weekOfWork([1200, 1200, 1200, 1200, 1200, 1200, 1200]).produced);
    expect(big).toBeGreaterThan(small * 2);
    expect(big).toBeLessThan(small * 4);
  });

  it('steady work beats the same work crammed into one day', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    const lateCram = total(weekOfWork([0, 0, 0, 0, 0, 0, 3500]).produced);
    const earlyCram = total(weekOfWork([3500, 0, 0, 0, 0, 0, 0]).produced);
    expect(steady).toBeGreaterThan(lateCram);
    expect(steady).toBeGreaterThan(earlyCram);
  });

  it('each day’s army is only what was trained since the last battle', () => {
    const c = weekOfWork([600, 600, 600, 600, 600, 600, 600]);
    expect(c.cohorts.map(total).reduce((a, b) => a + b, 0)).toBe(total(c.produced));
  });

  it('a day without a push musters only part of its garrison, and the streak speeds training', () => {
    const c = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + 1.5 * DAY_MS, events: [push(WEEK.weekStart + 3_600_000, 800)], outcomes: [] });
    expect(c.idle).toBe(true);
    expect(c.waiting).toBeGreaterThan(0);
    const steady = weekOfWork([500, 500, 500, 500, 500, 500, 500]);
    expect(steady.streak).toBe(7);
    expect(steady.granaryBonus).toBeCloseTo(0.42);
  });

  it('days before the first push do not spend the grace day, and misses never wipe out a streak', () => {
    // Joins Wednesday, then works every day but Saturday: the grace covers Saturday.
    expect(weekOfWork([0, 0, 500, 500, 500, 0, 500]).streak).toBe(4);
    // Four days on, then three misses: grace, then two halvings (4 → 2 → 1), never 0.
    expect(weekOfWork([500, 500, 500, 500, 0, 0, 0]).streak).toBe(1);
  });

  it('volume wins, with a knee: twice the work is worth well over, four times well under, twice and three times the army', () => {
    const base = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    const x2 = total(weekOfWork([1000, 1000, 1000, 1000, 1000, 1000, 1000]).produced);
    const x4 = total(weekOfWork([2000, 2000, 2000, 2000, 2000, 2000, 2000]).produced);
    expect(x2 / base).toBeGreaterThan(1.4);
    expect(x4 / base).toBeLessThan(2.3);
    expect(x4).toBeGreaterThan(x2);
  });

  it('cramming the week into one day is worth well under half of steady work', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    expect(total(weekOfWork([3500, 0, 0, 0, 0, 0, 0]).produced) / steady).toBeLessThan(0.5);
    expect(total(weekOfWork([1000, 0, 1000, 0, 1000, 0, 500]).produced) / steady).toBeLessThan(0.85);
  });


  it('the Hospital brings back part of the dead for the Grand Battle', () => {
    const events = [push(WEEK.weekStart + 3_600_000, 900)];
    const none = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [] });
    const dead = none.cohorts[0]!.map((n) => Math.floor(n / 2));
    const hurt = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [{ day: 0, won: false, dead, survivors: emptyCounts() }] });
    const g = total(grandArmy(hurt).counts);
    expect(g).toBeLessThan(total(none.produced));
    expect(g).toBeGreaterThan(total(none.produced) - total(dead));
  });

  it('a daily win lifts production for the rest of the week and makes veterans', () => {
    const events = [push(WEEK.weekStart + 3_600_000, 900), push(WEEK.weekStart + DAY_MS + 3_600_000, 900)];
    const c0 = cohortsAfter(events, false);
    const c1 = cohortsAfter(events, true);
    expect(total(c1.produced)).toBeGreaterThan(total(c0.produced));
    expect(total(c1.veterans)).toBeGreaterThan(0);
  });

  it('pushing and undoing the same work over and over earns nothing extra', () => {
    const undo = (e: WorkEvent): WorkEvent => ({
      at: e.at + 60_000,
      delta: { ...e.delta, lines: e.delta.lines.map((n) => -n), files: -e.delta.files, branches: -e.delta.branches, functions: -(e.delta.functions ?? 0), links: -(e.delta.links ?? 0) },
    });
    const t0 = WEEK.weekStart + 3_600_000;
    const now = t0 + 2 * 3_600_000;
    const once = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now, events: [push(t0, 900)], outcomes: [] });
    const events: WorkEvent[] = [];
    for (let k = 0; k < 20; k++) events.push(push(t0, 900), undo(push(t0, 900)));
    events.push(push(t0, 900));
    // All in the same minute-long window: same levels, so any difference is farmed.
    events.forEach((e, k) => (e.at = t0 + k));
    const farmed = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now, events, outcomes: [] });
    expect(farmed.buildings.map((b) => b.xp)).toEqual(once.buildings.map((b) => b.xp));
    expect(total(farmed.today)).toBeLessThanOrEqual(total(once.today) + 1);
    expect(farmed.todayLevy).toBe(once.todayLevy);
  });

  it('bots work a person’s week, deterministically', () => {
    const a = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    const b = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('every sparring bot is a fair match for a steady human (0.3x to 2.5x the army)', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    for (let bot = 0; bot < 7; bot++) {
      const c = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events: botWork(42, bot, WEEK.weekStart, DAY_MS, WEEK.weekEnd), outcomes: [] });
      const r = total(c.produced) / steady;
      expect(r, `bot ${bot}`).toBeGreaterThan(0.3);
      expect(r, `bot ${bot}`).toBeLessThan(2.5);
    }
  });
});

function cohortsAfter(events: WorkEvent[], won: boolean) {
  const first = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + DAY_MS, events, outcomes: [] });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [{ day: 0, won, dead: emptyCounts(), survivors: first.cohorts[0]! }] });
}

const setupOf = (seed: number, a: ArmySpec, b: ArmySpec): BattleSetup => ({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [a, { ...b, hue: 200 }] });
/** An army of about `value` worth, split between classes by weight. */
function valued(value: number, weights: Partial<Record<number, number>>, over: Partial<ArmySpec> = {}): ArmySpec {
  const counts = emptyCounts();
  let w = 0;
  for (const [k, v] of Object.entries(weights)) w += v! * STATS[Number(k)]!.value;
  for (const [k, v] of Object.entries(weights)) counts[Number(k)] = Math.round((value * v!) / w);
  return army(0, { counts, ...over });
}
function only(cls: number, n: number, over: Partial<ArmySpec> = {}): ArmySpec {
  const counts = emptyCounts();
  counts[cls] = n;
  return army(0, { counts, commander: false, ...over });
}
const deadOf = (b: Battle, team: number) => b.soldiers.filter((s) => s.team === team && s.state === State.Dead).length;
const winsOf = (seeds: number, f: (seed: number) => 0 | 1): number => {
  let w = 0;
  for (let s = 1; s <= seeds; s++) if (f(s) === 0) w++;
  return w;
};

describe('battle', () => {
  it('is deterministic, step by step', () => {
    const setup = setupOf(9, army(300), army(320));
    const a = fight(setup);
    const b = fight(setup);
    expect(a).toEqual(b);
    const x = new Battle(setup);
    const y = new Battle(setup);
    for (let i = 0; i < 400; i++) {
      x.step();
      y.step();
    }
    expect(x.soldiers.map((s) => [s.x, s.y, s.hp, s.state, s.target, s.hitAt])).toEqual(y.soldiers.map((s) => [s.x, s.y, s.hp, s.state, s.target, s.hitAt]));
    expect(x.regiments.map((r) => [r.ax, r.ay, r.fx, r.mode, r.stance, r.order, r.morale, r.moraleState])).toEqual(y.regiments.map((r) => [r.ax, r.ay, r.fx, r.mode, r.stance, r.order, r.morale, r.moraleState]));
    expect(x.events).toEqual(y.events);
    expect(x.run()).toEqual(a);
  }, 30_000);

  it('ends, and accounts for every man', () => {
    const r = fight(setupOf(3, army(400), army(400)));
    expect(r.ticks).toBeGreaterThan(100);
    for (const s of r.sides) for (let c = 0; c < UNIT_COUNT; c++) expect(s.dead[c]! + s.fled[c]! + s.alive[c]!).toBe(s.start[c]);
  });

  it('lasts a minute and a half to four minutes, with an approach, a clash and a rout', () => {
    // Over a dozen days, not one seed that happens to land in range: the typical battle (the
    // median) runs 80 s to 5 min, and none is over in under 50 s or runs to the time limit.
    const ticks: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const b = new Battle(setupOf(seed, army(500), army(500)));
      const r = b.run();
      ticks.push(r.ticks);
      expect(r.reason).toBe('rout');
      expect(r.ticks).toBeGreaterThan(50 * TICKS_PER_SECOND);
      // (Since v13 Templar blocks re-form on the banner twice and the brothers die where they stand
      // (T2, T3): a Templar mirror's long grind can run past five minutes, short of the limit.)
      // (Since the v17 reloads, a bow volley every 5 s rather than 2.1, battles run a fifth longer,
      // median about 205 s against 175; a battle whose lines fall apart after the first clash and
      // come on again across the field ran 438 s. The time limit is 600 s.)
      expect(r.ticks).toBeLessThan(450 * TICKS_PER_SECOND);
      const contact = b.events.find((e) => e.kind === 'contact')!.tick;
      expect(contact).toBeGreaterThan(15 * TICKS_PER_SECOND);
      expect(b.events.some((e) => e.kind === 'general-order')).toBe(true);
      expect(b.events.some((e) => e.kind === 'stance')).toBe(true);
      expect(b.events.some((e) => e.kind === 'charge')).toBe(true);
      expect(b.events.filter((e) => e.kind === 'rout' || e.kind === 'shattered').length).toBeGreaterThan(3);
    }
    ticks.sort((a, b) => a - b);
    const median = (ticks[5]! + ticks[6]!) / 2;
    expect(median).toBeGreaterThan(80 * TICKS_PER_SECOND);
    expect(median).toBeLessThan(300 * TICKS_PER_SECOND);
  }, 60_000);

  it('a much bigger army wins', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, army(200), army(400))).winner)).toBeLessThanOrEqual(1);
  }, 60_000);

  it('equal armies are a fair fight from either side', () => {
    // Mirror matches at two sizes (the side favoured by a timing bias used to depend on the
    // armies' size). Until v5 the left side won 33 of these 40 at 250 a side; over 800 seeds v5
    // gives it 48% at 250 and 120 a side. 13-27 of 40 is a fair coin at p ~ 0.04.
    for (const n of [250, 120]) {
      const left = winsOf(40, (seed) => fight(setupOf(seed, army(n), army(n))).winner);
      expect(left).toBeGreaterThanOrEqual(13);
      expect(left).toBeLessThanOrEqual(27);
    }
    // (240 s: since the scale rework a battle runs about 1.6 times as long.)
  }, 240_000);

  it('a tenth more men usually wins, but not always', () => {
    const wins = winsOf(20, (seed) => fight(setupOf(seed, army(330), army(300))).winner);
    expect(wins).toBeGreaterThanOrEqual(11);
    expect(wins).toBeLessThanOrEqual(19);
  }, 60_000);

  it('a side with no soldiers loses without a fight', () => {
    expect(walkover(emptyCounts(), army(10).counts)).toBe(1);
    expect(walkover(army(10).counts, army(10).counts)).toBe(null);
  });
});

describe('battle: the matchups', () => {
  const V = 450;
  const horse = { [U.LightCavalry]: 0.5, [U.Knights]: 0.3, [U.HeavyInfantry]: 0.2 };
  const bows = { [U.Archers]: 0.5, [U.Crossbowmen]: 0.2, [U.HeavyInfantry]: 0.3 };
  const spears = { [U.Spearmen]: 0.8, [U.HeavyInfantry]: 0.2 };
  it('horse beats bows at equal value', () => {
    // (Since v14 the horse's edge is narrower, 7-10 of the first 12 days by version against 11 in
    // v13: it breaks off from the foot among the bows to charge again. Since v17 narrower still,
    // 56% of 120 days against 62% in v16: the heavy foot beside the bows turns on horse among
    // them, and faces round to meet it when it rides off; 12 days swung 3-8 on that alone.)
    expect(winsOf(30, (seed) => fight(setupOf(seed, valued(V, horse), valued(V, bows))).winner)).toBeGreaterThanOrEqual(16);
  }, 60_000);
  it('spears hold against horse at equal value', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, valued(V, spears), valued(V, horse))).winner)).toBeGreaterThanOrEqual(5);
  }, 30_000);
  it('bows beat spears at equal value', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, valued(V, bows), valued(V, spears))).winner)).toBeGreaterThanOrEqual(4);
  }, 30_000);
});

describe('battle: stances', () => {
  /** Knights charge a block of foot that is pinned to a stance; returns [foot dead, knights dead] after `ticks`. */
  function charge(seed: number, foot: number, footStance: Stance, knightStance: Stance | null, ticks = 450): [number, number] {
    const b = new Battle(setupOf(seed, only(foot, 120), only(U.Knights, 40)));
    b.generals[1].rashKnights = true;
    b.pinStance(0, foot, footStance);
    if (knightStance) b.pinStance(1, U.Knights, knightStance);
    for (let i = 0; i < ticks && !b.done(); i++) b.step();
    return [deadOf(b, 0), deadOf(b, 1)];
  }

  it('a pike wall breaks a frontal charge of horse', () => {
    let pikeKnights = 0;
    let lineKnights = 0;
    let pikeSpears = 0;
    let lineSpears = 0;
    for (const seed of [1, 2, 3]) {
      const p = charge(seed, U.Spearmen, 'pikewall', null);
      const l = charge(seed, U.Spearmen, 'line', null);
      pikeSpears += p[0];
      pikeKnights += p[1];
      lineSpears += l[0];
      lineKnights += l[1];
    }
    expect(pikeKnights).toBeGreaterThan(lineKnights * 1.5);
    expect(pikeSpears).toBeLessThan(lineSpears);
  }, 30_000);

  it('a wedge hits foot harder than a line of horse', () => {
    let wedge = 0;
    let line = 0;
    for (const seed of [1, 2, 3]) {
      wedge += charge(seed, U.HeavyInfantry, 'line', 'wedge', 330)[0];
      line += charge(seed, U.HeavyInfantry, 'line', 'line', 330)[0];
    }
    expect(wedge).toBeGreaterThan(line);
  }, 30_000);

  /**
   * Archers shoot at a block of heavy foot that waits for them, pinned to a stance; returns the
   * foot's dead. (90 s: since v6 the archers march into bow range at the drill's pace and loose
   * their first shafts at about 48 s, not 32 s. Since the scale rework 180 s and 300 archers, not
   * 150: the armies deploy twice as far apart, and from three times as far the shafts scatter
   * wide; 150 emptied their quivers at the waiting foot from 560 for 3 dead a battle. Since v17
   * 270 s: each block of archers takes its own spot on the ring of its range, beside the others
   * or behind an interval, where the ten blocks used to stand five deep on two spots and loose
   * from there; spread out, they take longer to come into action, and at 180 s the line had lost
   * 3 men in three days, at 270 s 199.)
   */
  function shot(seed: number, stance: Stance, ticks = 2700): number {
    const b = new Battle(setupOf(seed, only(U.Archers, 300), only(U.HeavyInfantry, 100)));
    b.generals[1].fixedPlan = 'hold';
    b.pinStance(1, U.HeavyInfantry, stance);
    for (let i = 0; i < ticks && !b.done(); i++) b.step();
    return deadOf(b, 1);
  }

  it('loose order and the shield wall lose fewer men to arrows', () => {
    let line = 0;
    let loose = 0;
    let wall = 0;
    for (const seed of [1, 2, 3]) {
      line += shot(seed, 'line');
      loose += shot(seed, 'loose');
      wall += shot(seed, 'shieldwall');
    }
    expect(line).toBeGreaterThan(10);
    expect(loose).toBeLessThan(line * 0.8);
    expect(wall).toBeLessThan(line * 0.8);
  }, 90_000);

  it('picks stances by itself and says so', () => {
    const b = new Battle(setupOf(4, army(500), army(500)));
    const seen = new Set<string>();
    while (!b.done()) {
      b.step();
      for (const r of b.regiments) seen.add(`${r.cls}:${r.stance}`);
    }
    expect(seen.has(`${U.Archers}:loose`)).toBe(true);
    expect(seen.has(`${U.Knights}:wedge`)).toBe(true);
    expect(seen.has(`${U.HeavyInfantry}:line`)).toBe(true);
    expect([...seen].some((k) => k === `${U.HeavyInfantry}:shieldwall` || k === `${U.Spearmen}:pikewall`)).toBe(true);
    expect(b.events.filter((e) => e.kind === 'stance').every((e) => e.stance !== undefined && e.reg !== undefined)).toBe(true);
  }, 30_000);
});

describe('battle: command and morale', () => {
  it('a general who sends his horse round the flanks beats one who keeps it at home', () => {
    let good = 0;
    for (let seed = 1; seed <= 50; seed++) {
      for (const side of [0, 1] as const) {
        const b = new Battle(setupOf(seed, army(300), army(300)));
        b.generals[1 - side]!.useCavalry = false;
        if (b.run().winner === side) good++;
      }
    }
    // Clearly more often than not, from either side: 60 of 100 battles (about 70 today). A run
    // of 20 battles swings by several wins on the seeds alone, too much to tell 55% from 70%.
    expect(good).toBeGreaterThanOrEqual(60);
  }, 180_000);

  it('a committed reserve changes the battle', () => {
    let changed = 0;
    let committed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const a = new Battle(setupOf(seed, army(400), army(400)));
      const b = new Battle(setupOf(seed, army(400), army(400)));
      b.generals[0].useReserve = false;
      const ra = a.run();
      const rb = b.run();
      // (Since v17 a reserve also goes in on its own for an open flank close by: the General's
      // leave to use the reserve covers that too, and it is as much a committed reserve.)
      const reserveIn = (x: Battle) => x.events.some((e) => e.kind === 'general-order' && e.team === 0 && (e.order === 'support' || (e.order === 'flank' && (e.note ?? '').includes('on its own'))));
      if (reserveIn(a)) committed++;
      expect(reserveIn(b)).toBe(false);
      if (ra.winner !== rb.winner || ra.ticks !== rb.ticks || ra.sides[1].dead.join() !== rb.sides[1].dead.join()) changed++;
    }
    expect(committed).toBeGreaterThanOrEqual(2);
    expect(changed).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('the general’s death matters', () => {
    const b = new Battle(setupOf(2, army(300), army(300)));
    for (let i = 0; i < 300; i++) b.step();
    const before = b.regiments.filter((r) => r.team === 1 && r.alive > 0).map((r) => r.morale);
    b.kill(b.commander[1]);
    const after = b.regiments.filter((r) => r.team === 1 && r.alive > 0).map((r) => r.morale);
    expect(b.commanderFell[1]).toBe(true);
    expect(b.events.some((e) => e.kind === 'commander' && e.team === 1)).toBe(true);
    for (let i = 0; i < before.length; i++) expect(after[i]!).toBeLessThanOrEqual(before[i]! - 15);
    // Over several battles, the side that lost its general early loses most of them (about 82%
    // of 60 seeds in v7 and v8; 6 seeds were too few to ask 5 of: v8 drew 3 of its first 6).
    const lost = winsOf(20, (seed) => {
      const x = new Battle(setupOf(seed, army(300), army(300)));
      for (let i = 0; i < 300; i++) x.step();
      x.kill(x.commander[1]);
      return x.run().winner;
    });
    expect(lost).toBeGreaterThanOrEqual(14);
  }, 60_000);

  it('regiments waver, break, rally and shatter; the city’s morale bonus helps', () => {
    // Over a few battles: since v10 a regiment rallies only out of contact and with something to
    // rally on, and in some battles none does (in v13, seeds 1 and 5; in v14, seed 2; with the
    // riders who think for themselves, seeds 2-6 and 8, though over 24 battles as many blocks
    // rally as before).
    const states = new Set<string>();
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const b = new Battle(setupOf(seed, army(600), army(600)));
      while (!b.done()) {
        b.step();
        for (const r of b.regiments) states.add(r.moraleState);
      }
      expect(b.events.some((e) => e.kind === 'rout')).toBe(true);
      for (const e of b.events) kinds.add(e.kind);
    }
    for (const k of ['waver', 'rout', 'shattered'] as const) expect(kinds.has(k), k).toBe(true);
    expect([...states].sort()).toEqual(['broken', 'rallying', 'shattered', 'steady', 'wavering']);
    // The Chapter House's morale bonus, on either side.
    // More often than not: 55 of 100 battles. (60 until the light horse went out by the plan
    // (QA review #10): 62 then, 56 now, with fewer clashes of horse at the opening, where the
    // bonus told most.)
    let bonus = 0;
    for (let seed = 1; seed <= 50; seed++) {
      if (fight(setupOf(seed, army(300, { moraleBonus: 15 }), army(300))).winner === 0) bonus++;
      if (fight(setupOf(seed, army(300), army(300, { moraleBonus: 15 }))).winner === 1) bonus++;
    }
    expect(bonus).toBeGreaterThanOrEqual(55);
  }, 180_000);
});

describe('battle: scale', () => {
  it('fights a grand battle of thousands quickly enough', () => {
    const b = new Battle({ ...setupOf(1, army(2800), army(2800)), kind: 'grand' });
    expect(b.soldiers.length).toBeGreaterThan(4800);
    expect(b.scale).toBe(1);
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) b.step();
    const perStep = (performance.now() - t0) / 300;
    // Loose for CI: the target on a dev machine is under 4 ms.
    expect(perStep).toBeLessThan(25);
    const big = new Battle({ ...setupOf(1, army(20000), army(18000)), kind: 'grand' });
    expect(big.scale).toBeGreaterThan(1);
    expect(big.soldiers.length).toBeLessThanOrEqual(2 * MAX_FIGURES + 20);
    for (const s of b.soldiers) {
      expect(s.x).toBeGreaterThanOrEqual(-10);
      expect(s.x).toBeLessThanOrEqual(FIELD_W + 10);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(FIELD_H);
    }
  }, 60_000);
});

describe('pairings', () => {
  it('pairs like records and avoids rematches, with brigands for the odd one out', () => {
    const pairs = pairDaily([
      { id: 1, points: 2, produced: 10, met: [2] },
      { id: 2, points: 2, produced: 9, met: [1] },
      { id: 3, points: 1, produced: 8, met: [] },
      { id: 4, points: 0, produced: 7, met: [] },
      { id: 5, points: 0, produced: 6, met: [] },
    ], 1);
    expect(pairs).toHaveLength(3);
    const flat = pairs.flat();
    expect(flat.filter((x) => x === null)).toHaveLength(1);
    expect(pairs.some(([a, b]) => (a === 1 && b === 2) || (a === 2 && b === 1))).toBe(false);
    expect(pairGrand([5, 3, 1])).toEqual([[5, 3], [1, null]]);
  });

  it('avoids a rematch that greedy pairing from the top would force', () => {
    // Greedy pairs 1-2 and is left with 3-4, who have met; 1-3 and 2-4 are both fresh.
    const players = [
      { id: 1, points: 6, produced: 10, met: [] },
      { id: 2, points: 6, produced: 9, met: [] },
      { id: 3, points: 0, produced: 8, met: [4] },
      { id: 4, points: 0, produced: 7, met: [3] },
    ];
    const pairs = pairDaily(players, 1);
    expect(pairs).toHaveLength(2);
    expect(pairs.some(([a, b]) => (a === 3 && b === 4) || (a === 4 && b === 3))).toBe(false);
    // Odd count: the lowest who can be left out meets the brigands, and nobody meets twice.
    const odd = pairDaily([...players, { id: 5, points: 0, produced: 1, met: [] }], 2);
    expect(odd.filter(([, b]) => b === null)).toHaveLength(1);
    expect(odd.some(([a, b]) => (a === 3 && b === 4) || (a === 4 && b === 3))).toBe(false);
    expect(new Set(odd.flat().filter((x) => x !== null)).size).toBe(5);
  });

  it('a loser who lost no one but killed some of the enemy fought honourably', () => {
    const side = (dead: number) => ({ start: emptyCounts(), dead: [dead, 0, 0, 0, 0, 0, 0, 0, 0, 0], fled: emptyCounts(), alive: emptyCounts(), kills: 0, commanderFell: false });
    const r = (own: number, theirs: number) => ({ winner: 1 as const, reason: 'rout' as const, ticks: 100, scale: 1, sides: [side(own), side(theirs)] as [ReturnType<typeof side>, ReturnType<typeof side>] });
    expect(honourable(r(0, 30), 0)).toBe(true);
    expect(honourable(r(0, 0), 0)).toBe(false);
    expect(honourable(r(50, 30), 0)).toBe(true);
    expect(honourable(r(50, 29), 0)).toBe(false);
  });
});

describe('replay versions', () => {
  it('refuses a setup recorded under another version of the rules', async () => {
    const { BattleVersionError } = await import('./battle.ts');
    expect(() => new Battle({ version: BATTLE_VERSION - 1, seed: 1, kind: 'daily', armies: [army(50), army(50)] })).toThrow(BattleVersionError);
  });
});
