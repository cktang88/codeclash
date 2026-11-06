// Set pieces that measure what the ground does (battle v17 terrain), for terrain.test.ts and
// scripts/terrain-sanity.ts. Small and headless: one or two blocks, a few hundred ticks.
// Not used by the sim.
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import type { TerrainSpec } from './terrain.ts';
import { groundPreset, only, placeRegiment, plainArmy } from './testing.ts';
import { U } from './units.ts';

const sq = (v: number): number => v * v;

const C = 1200;

function duelOf(a: number, na: number, b: number, nb: number, ground: TerrainSpec | 'flat', seed: number): { b: Battle; ra: Regiment; rb: Regiment } {
  const bt = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(a, na)), plainArmy(only(b, nb), 200)], terrain: ground });
  return { b: bt, ra: bt.regiments.find((r) => r.team === 0)!, rb: bt.regiments.find((r) => r.team === 1)! };
}

const hpOf = (b: Battle, team: number): number => b.soldiers.reduce((s, m) => s + (m.team === team && m.state <= State.Routing ? Math.max(0, m.hp) : 0), 0);
const deadOf = (b: Battle, team: number): number => b.soldiers.filter((m) => m.team === team && m.state === State.Dead).length;

/**
 * A block of 48 heavy foot marching 260 units east (A's general advancing on a far enemy that
 * holds): the ticks it takes, its fatigue there, and how far its men got from their places on the way. `ground`: 'flat', 'up' (a hill ahead, its top
 * where it ends), 'wood' (a wood across its way), 'stream' (a stream across it, no ford).
 */
export function march(ground: 'flat' | 'up' | 'wood' | 'stream', horse = false): { ticks: number; fatigue: number; offPlace: number } {
  const spec: TerrainSpec | 'flat' =
    ground === 'up' ? { hills: [{ x: 1180, y: C, r: 340, k: 1.6, h: 45, ax: 0, ay: 1 }] }
    : ground === 'wood' ? { woods: [{ blobs: [{ x: 1000, y: C, r: 100 }, { x: 1000, y: C - 90, r: 100 }, { x: 1000, y: C + 90, r: 100 }] }] }
    : ground === 'stream' ? { stream: { pts: [1000, 0, 1000, 2400], width: 28, bank: 10, fords: [] } }
    : 'flat';
  const cls = horse ? U.LightCavalry : U.HeavyInfantry;
  const { b, ra, rb } = duelOf(cls, horse ? 24 : 48, U.HeavyInfantry, 12, spec, 1);
  b.generals[1].fixedPlan = 'hold';
  placeRegiment(b, ra, 840, C, 1, 0);
  placeRegiment(b, rb, 2000, C, -1, 0);
  let spread = 0;
  while (b.tick < 1200 && ra.ax < 1100) {
    b.step();
    // How ragged the block goes over the obstacle (its anchor at x 960-1100): its men's mean
    // distance from their places in it (the most of any tick).
    if (ra.ax > 960) {
      let q = 0;
      let n = 0;
      for (const id of ra.members) {
        const m = b.soldiers[id]!;
        if (m.state !== State.Fighting) continue;
        const gx = ra.ax + ra.fx * m.sy - ra.fy * m.sx;
        const gy = ra.ay + ra.fy * m.sy + ra.fx * m.sx;
        q += Math.sqrt(sq(m.x - gx) + sq(m.y - gy));
        n++;
      }
      spread = Math.max(spread, q / (n || 1));
    }
  }
  return { ticks: b.tick, fatigue: ra.fatigue, offPlace: spread };
}

/** 60 heavy foot (A) attack 60 (B) holding 300 units off, B on `ground` ('flat' or 'hill': B on a hill's top). */
export function hillFight(ground: 'flat' | 'hill' | 'below', seed: number): { winner: 0 | 1 | null; deadA: number; deadB: number } {
  const spec = ground === 'hill' ? groundPreset('hillB', C, C, 300) : ground === 'below' ? groundPreset('hillA', C, C, 300) : 'flat';
  const { b, ra, rb } = duelOf(U.HeavyInfantry, 60, U.HeavyInfantry, 60, spec, seed);
  b.generals[1].fixedPlan = 'hold';
  placeRegiment(b, ra, C - 150, C, 1, 0);
  placeRegiment(b, rb, C + 150, C, -1, 0);
  while (!b.done() && b.tick < 1500) b.step();
  return { winner: b.result ? b.result.winner : null, deadA: deadOf(b, 0), deadB: deadOf(b, 1) };
}

/**
 * Knights (A, 16) charge 48 spearmen (B) standing in line 220 units off (not braced: a plain
 * line). `ground`: 'flat', 'down' (the knights start on a hill and ride down it), 'wood' (the foot
 * stand in a wood: the general sends the charge in anyway). Returns the foot's hit points lost in
 * the 2 s from the first contact, and the most impetus a rider had on contact.
 */
export function chargeAt(ground: 'flat' | 'down' | 'wood', seed = 3): { hpLost: number; impetus: number } {
  const spec: TerrainSpec | 'flat' =
    ground === 'down' ? { hills: [{ x: 960, y: C, r: 340, k: 1.6, h: 45, ax: 0, ay: 1 }] }
    : ground === 'wood' ? { woods: [{ blobs: [{ x: 1250, y: C, r: 110 }, { x: 1250, y: C - 90, r: 100 }, { x: 1250, y: C + 90, r: 100 }] }] }
    : 'flat';
  const { b, ra, rb } = duelOf(U.Knights, 16, U.HeavyInfantry, 48, spec, seed);
  b.pinStance(1, U.HeavyInfantry, 'line');
  b.generals[1].fixedPlan = 'hold';
  b.generals[0].rashKnights = true;
  placeRegiment(b, ra, 980, C, 1, 0);
  placeRegiment(b, rb, 1200, C, -1, 0);
  let contact = -1;
  let hp0 = 0;
  let impetus = 0;
  while (b.tick < 600) {
    // (Ordered in: the set piece measures the charge, not whether a captain would ride it.)
    for (const r of b.regiments) {
      if (r.team !== 0) continue;
      r.ord.kind = 'charge';
      r.ord.target = rb.id;
    }
    b.step();
    if (contact < 0) {
      for (const id of ra.members) {
        const s = b.soldiers[id]!;
        for (const jd of rb.members) {
          const t = b.soldiers[jd]!;
          if (sq(s.x - t.x) + sq(s.y - t.y) < 100) {
            contact = b.tick;
            break;
          }
        }
        if (contact >= 0) break;
      }
      if (contact >= 0) {
        hp0 = hpOf(b, 1);
        for (const id of ra.members) impetus = Math.max(impetus, b.soldiers[id]!.impetus);
      }
    } else if (b.tick - contact >= 20) break;
  }
  return { hpLost: contact < 0 ? 0 : hp0 - hpOf(b, 1), impetus };
}

/**
 * 60 archers (A) and 60 heavy foot (B), both holding, fronts `gap` apart; B on `ground`: 'flat',
 * 'edge' (just inside a wood's edge: seen, but among trees), 'deep' (deep in a wood), 'below' (A
 * on a hill above B), 'above' (B on a hill above A). Returns the tick of the first shot (-1 none)
 * and B's hit points lost in 40 s.
 */
export function volley(ground: 'flat' | 'edge' | 'deep' | 'below' | 'above', gap: number, seed = 2): { first: number; hpLost: number } {
  const bx = C + gap / 2;
  const spec: TerrainSpec | 'flat' =
    ground === 'edge' ? { woods: [{ blobs: [{ x: bx + 160, y: C, r: 175 }, { x: bx + 160, y: C - 120, r: 175 }, { x: bx + 160, y: C + 120, r: 175 }] }] }
    : ground === 'deep' ? { woods: [{ blobs: [{ x: bx, y: C, r: 170 }, { x: bx, y: C - 120, r: 170 }, { x: bx, y: C + 120, r: 170 }] }] }
    : ground === 'below' ? groundPreset('hillA', C, C, gap)
    : ground === 'above' ? groundPreset('hillB', C, C, gap)
    : 'flat';
  const { b, ra, rb } = duelOf(U.Archers, 60, U.HeavyInfantry, 60, spec, seed);
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  placeRegiment(b, ra, C - gap / 2, C, 1, 0);
  placeRegiment(b, rb, bx, C, -1, 0);
  const hp0 = hpOf(b, 1);
  let first = -1;
  while (b.tick < 400) {
    b.step();
    if (first < 0 && b.projectiles.length > 0) first = b.tick;
  }
  return { first, hpLost: hp0 - hpOf(b, 1) };
}

/**
 * A block of 24 heavy foot (A) ordered to a point 400 east across a stream with no ford, or one
 * ford 250 to the side; `fire`: enemy archers (36) stand 350 beyond the stream, shooting.
 * Returns how near the ford its anchor came, the ticks until it was across (its anchor 40 past
 * the water), and the most of its men in the water at once.
 */
export function crossing(withFord: boolean, fire: boolean): { fordMiss: number; ticks: number; wet: number } {
  const fx = 1200;
  const spec: TerrainSpec = { stream: { pts: [fx, 0, fx, 2400], width: 28, bank: 10, fords: withFord ? [{ x: fx, y: C + 250, r: 70 }] : [] } };
  const { b, ra, rb } = duelOf(U.HeavyInfantry, 24, fire ? U.Archers : U.HeavyInfantry, fire ? 36 : 12, spec, 1);
  b.generals[1].fixedPlan = 'hold';
  // (A's general stands aside: its block has its march order from the set piece alone.)
  const think = (b as unknown as { generalThink(t: number): void }).generalThink.bind(b);
  (b as unknown as { generalThink(t: number): void }).generalThink = (t: number) => {
    if (t === 1) think(t);
  };
  placeRegiment(b, ra, 1000, C, 1, 0);
  placeRegiment(b, rb, fire ? 1550 : 2300, fire ? C - 100 : 200, -1, 0);
  let miss = Infinity;
  let wet = 0;
  let ticks = -1;
  while (b.tick < 1500) {
    // (A march order to the point, given afresh each think as a General would.)
    ra.ord.kind = 'withdraw';
    ra.ord.x = 1400;
    ra.ord.y = C;
    b.step();
    miss = Math.min(miss, Math.sqrt(sq(ra.ax - fx) + sq(ra.ay - (C + 250))));
    let w = 0;
    for (const id of ra.members) if (b.terrain.groundAt(b.soldiers[id]!.x, b.soldiers[id]!.y) === 4) w++;
    wet = Math.max(wet, w);
    if (ra.ax > fx + 40) {
      ticks = b.tick;
      break;
    }
  }
  return { fordMiss: miss, ticks, wet };
}

/** A block of 48 heavy foot of a holding army, a hill's crest 160 before it: where it stands after 30 s (how far forward, and the height). */
export function holdCrest(): { forward: number; height: number } {
  const { b, ra } = duelOf(U.HeavyInfantry, 48, U.HeavyInfantry, 48, { hills: [{ x: 1000, y: C, r: 300, k: 2, h: 35, ax: 0, ay: 1 }] }, 1);
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  placeRegiment(b, ra, 840, C, 1, 0);
  placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 1900, C, -1, 0);
  while (b.tick < 300) b.step();
  return { forward: ra.ax - 840, height: b.terrain.heightAt(ra.ax, ra.ay) };
}

/**
 * A block of 48 archers of a holding army behind its line (48 heavy foot), a wood beside it:
 * where it stands after 30 s (its middle's depth in the wood, and how far it moved).
 */
export function archersEdge(): { depth: number; moved: number } {
  const counts = only(U.Archers, 48);
  counts[U.HeavyInfantry] = 48;
  const b = new Battle({ version: BATTLE_VERSION, seed: 1, kind: 'daily', armies: [plainArmy(counts), plainArmy(only(U.HeavyInfantry, 48), 200)], terrain: { woods: [{ blobs: [{ x: 700, y: C + 100, r: 110 }, { x: 700, y: C + 200, r: 110 }, { x: 700, y: C + 300, r: 110 }] }] } });
  const ra = b.regiments.find((r) => r.team === 0 && r.cls === U.Archers)!;
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  for (const r of b.regiments) if (r.team === 0 && r !== ra) placeRegiment(b, r, 900, C + (r.id % 2 ? 80 : -80), 1, 0);
  placeRegiment(b, ra, 760, C, 1, 0);
  for (const r of b.regiments) if (r.team === 1) placeRegiment(b, r, 2100, C + (r.id % 2 ? 80 : -80), -1, 0);
  while (b.tick < 300) b.step();
  const T = b.terrain;
  return { depth: T.woodDepth[T.index(ra.cx, ra.cy)]!, moved: Math.sqrt(sq(ra.ax - 760) + sq(ra.ay - C)) };
}

/** Light horse (A, ordered at foot standing in a wood 300 off) : the deepest any rider got into the wood in 40 s. */
export function horseAtWood(): number {
  const { b, ra, rb } = duelOf(U.LightCavalry, 24, U.HeavyInfantry, 48, groundPreset('woodB', C, C, 300), 1);
  b.generals[1].fixedPlan = 'hold';
  placeRegiment(b, ra, C - 150, C, 1, 0);
  placeRegiment(b, rb, C + 150, C, -1, 0);
  let deepest = 0;
  const T = b.terrain;
  while (b.tick < 400) {
    b.step();
    for (const id of ra.members) {
      const s = b.soldiers[id]!;
      if (s.state === State.Fighting) deepest = Math.max(deepest, T.woodDepth[T.index(s.x, s.y)]!);
    }
  }
  return deepest;
}
