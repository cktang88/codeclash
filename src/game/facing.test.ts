// Battle v17: foot facing against wheeling (formations.md, "Facings and wheels"; battle.ts
// `turnFoot`). A big turn is made by every man facing where he stands and the block re-forming
// to the new front, when that is quicker than pivoting the whole block; a narrow block still
// wheels a moderate turn; a block locked to its front turns only its rear ranks about.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U } from './units.ts';

interface Inside {
  d: { x: Float64Array; y: Float64Array; sx: Float64Array; sy: Float64Array; state: Uint8Array; row: Int32Array; target: Int32Array; reg: Int32Array };
  turnFoot(r: Regiment, wx: number, wy: number): void;
  survey(r: Regiment): void;
}
const inside = (b: Battle) => b as unknown as Inside;
/** Recounts every block where it now stands (after `placeRegiment`). */
const settle = (b: Battle) => b.regiments.forEach((r) => inside(b).survey(r));

/** The share of a block's men within `within` of their places. */
function formed(b: Battle, r: Regiment, within: number): number {
  const d = inside(b).d;
  let n = 0;
  let ok = 0;
  for (const id of r.members) {
    if (d.state[id] !== State.Fighting) continue;
    n++;
    const gx = r.ax + r.fx * d.sy[id]! - r.fy * d.sx[id]!;
    const gy = r.ay + r.fy * d.sy[id]! + r.fx * d.sx[id]!;
    if (Math.hypot(d.x[id]! - gx, d.y[id]! - gy) <= within) ok++;
  }
  return ok / Math.max(1, n);
}

/** Ticks a pure wheel of `angle` radians takes for block `r` (FOOT_WHEEL 9 a second about its middle, as `turnRate`). */
const wheelTicks = (r: Regiment, angle: number) => angle / Math.max((5 * Math.PI) / 1800, Math.min((20 * Math.PI) / 1800, 0.9 / (r.width * 0.5 + 8)));

function oneBlock(men: number, foe: number, seed = 1): { b: Battle; r: Regiment; e: Regiment } {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, men)), plainArmy(only(U.HeavyInfantry, foe), 200)] });
  const r = b.regiments.filter((x) => x.team === 0).sort((p, q) => q.alive - p.alive)[0]!;
  const e = b.regiments.find((x) => x.team === 1)!;
  return { b, r, e };
}

describe('foot: facings and wheels', () => {
  it('an enemy close at its back: every man faces about at once and fights from where he stands; the old rear rank is the new front', () => {
    const { b, r, e } = oneBlock(30, 24);
    b.generals[0].fixedPlan = 'hold';
    placeRegiment(b, r, 800, 600, 1, 0);
    placeRegiment(b, e, 760 - r.depth, 600, 1, 0);
    settle(b);
    const d = inside(b).d;
    const cols = r.cols;
    const behind = new Set(r.members.filter((id) => d.row[id]! > 0));
    let turned = -1;
    while (b.tick < 40 && turned < 0) {
      b.step();
      if (r.fx < -0.95) turned = b.tick;
    }
    const front = r.members.filter((id) => d.state[id] === State.Fighting && d.row[id] === 0);
    // Round within a second or so: the wheel would take many seconds.
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(Math.min(20, wheelTicks(r, Math.PI) / 3));
    // Frontage kept, and under the enemy's nose each man took the place nearest him: the old rear
    // ranks front the enemy (no time to file the front-rankers through).
    expect(r.cols).toBe(cols);
    expect(front.filter((id) => behind.has(id)).length).toBeGreaterThan(front.length * 0.8);
  });

  it('with time to spare it countermarches: the front-rankers file through to the new front, and the block re-forms', () => {
    const { b, r, e } = oneBlock(30, 10);
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    // Its enemy far off behind it: it turns about to face him, with nobody near.
    placeRegiment(b, r, 900, 600, 1, 0);
    placeRegiment(b, e, 300, 600, 1, 0);
    expect(b.regiments.filter((x) => x.team === 0).length).toBe(1);
    settle(b);
    const d = inside(b).d;
    const frontRank = new Set(r.members.filter((id) => d.row[id] === 0));
    let turned = -1;
    while (b.tick < 40 && turned < 0) {
      b.step();
      if (r.fx < -0.95) turned = b.tick;
    }
    expect(turned).toBeGreaterThan(0);
    const front = r.members.filter((id) => d.state[id] === State.Fighting && d.row[id] === 0);
    expect(front.filter((id) => frontRank.has(id)).length).toBe(front.length);
    // Ragged while the men walk through, re-formed a few seconds later.
    expect(formed(b, r, 3)).toBeLessThan(0.6);
    while (b.tick < turned + 80) b.step();
    expect(formed(b, r, 4)).toBeGreaterThan(0.85);
  });

  it('a wide block faces a turn of 60-90 degrees and has its front round long before a wheel would; a narrow one still wheels 60', () => {
    // A big army's blocks are big: the widest one of 2,800 heavy foot (120 men, some 110 across).
    const big = oneBlock(2800, 10);
    const w = big.r;
    expect(w.width).toBeGreaterThan(100);
    placeRegiment(big.b, w, 800, 600, 1, 0);
    settle(big.b);
    const cols = w.cols;
    inside(big.b).turnFoot(w, 0, 1);
    expect(w.fy).toBeGreaterThan(0.99);
    expect(w.cols).toBe(cols);
    // Re-formed (most men at their new places) well before the wheel would even have its front round.
    big.b.generals[0].fixedPlan = 'hold';
    const wheel = wheelTicks(w, Math.PI / 2);
    let at = -1;
    for (let t = 0; t < wheel && at < 0; t++) {
      // (Hold it to the new front: no orders from the General meanwhile.)
      w.dfx = w.fx;
      w.dfy = w.fy;
      w.tx = w.ax;
      w.ty = w.ay;
      big.b.step();
      if (formed(big.b, w, 4) > 0.8) at = t;
    }
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(wheel * 0.75);
    // 60 degrees: still quicker to face, for a block this wide...
    const b60 = oneBlock(2800, 10);
    placeRegiment(b60.b, b60.r, 800, 600, 1, 0);
    inside(b60.b).turnFoot(b60.r, 0.5, Math.sqrt(3) / 2);
    expect(b60.r.fx).toBeCloseTo(0.5, 3);
    // A narrow block of 20 wheels 60 degrees (and 30 too): its facing does not change at once.
    const small = oneBlock(20, 10);
    expect(small.r.width).toBeLessThan(60);
    placeRegiment(small.b, small.r, 800, 600, 1, 0);
    for (const deg of [30, 60]) {
      const a = (deg * Math.PI) / 180;
      inside(small.b).turnFoot(small.r, Math.cos(a), Math.sin(a));
      expect(small.r.fx).toBe(1);
    }
    // ...and so does the wide block for a small turn.
    const b30 = oneBlock(2800, 10);
    placeRegiment(b30.b, b30.r, 800, 600, 1, 0);
    inside(b30.b).turnFoot(b30.r, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
    expect(b30.r.fx).toBe(1);
  }, 30_000);

  it('a block locked to its front does not face about for an enemy at its back: its rear ranks turn on him', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 40)), plainArmy(only(U.HeavyInfantry, 70), 200)] });
    const r = b.regiments.find((x) => x.team === 0)!;
    const foes = b.regiments.filter((x) => x.team === 1);
    expect(foes.length).toBeGreaterThan(1);
    const [f, g] = foes as [Regiment, Regiment];
    b.generals[1].fixedPlan = 'hold';
    placeRegiment(b, r, 800, 600, 1, 0);
    placeRegiment(b, f, 812, 600, -1, 0);
    let locked = -1;
    while (b.tick < 120 && locked < 0) {
      b.step();
      if (r.engaged) locked = b.tick;
    }
    expect(locked).toBeGreaterThan(0);
    // The second block comes up behind it.
    placeRegiment(b, g, r.ax - r.depth - 14, 600, 1, 0);
    const d = inside(b).d;
    let rearOnG = 0;
    let frontOnF = 0;
    const fx0 = r.fx;
    for (let t = 0; t < 60 && !r.routed; t++) {
      b.step();
      expect(r.fx).toBeCloseTo(fx0, 6);
      if (t % 5) continue;
      for (const id of r.members) {
        if (d.state[id] !== State.Fighting || d.target[id]! < 0) continue;
        const on = d.reg[d.target[id]!];
        if (d.row[id]! >= Math.max(1, r.rows >> 1) && on === g.id) rearOnG++;
        if (d.row[id] === 0 && on === f.id) frontOnF++;
      }
    }
    expect(r.facedAt).toBeLessThan(0);
    expect(rearOnG).toBeGreaterThan(0);
    expect(frontOnF).toBeGreaterThan(rearOnG * 0.5);
  });
});
