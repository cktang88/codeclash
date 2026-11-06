// Battle v17, QA review 2 (#1): foot shooters and horse. Archers and crossbowmen who see horse
// coming fall back behind their own foot and shoot from there; with no friend near (or behind
// their stakes) they stand and shoot, and do not step out to meet it. Small set pieces.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import type { FactionId } from './factions.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: [number, number][]) => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of pairs) k[c] = n;
  return k;
};
const alive = (rs: Regiment[]) => rs.reduce((n, r) => n + r.alive, 0);
const ammo = (b: Battle, rs: Regiment[]) => rs.reduce((n, r) => n + r.members.reduce((m, id) => m + b.soldiers[id]!.ammo, 0), 0);

/**
 * Knights (team 0) `gap` before a block of shooters (team 1), which stands 150 before a line of
 * spearmen (`spears` men; none: the shooters alone in the open).
 */
function piece(seed: number, opts: { shooters?: number; spears?: number; knights?: number; gap?: number; faction?: FactionId; stakes?: boolean } = {}) {
  const { shooters = U.Archers, spears = 120, knights = 24, gap = 400, faction = 'templar', stakes = false } = opts;
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[U.Knights, knights]])), { ...plainArmy(counts([[shooters, 24], [U.Spearmen, spears]]), 200, faction), stakes }] });
  b.generals[0].fixedPlan = 'advance';
  b.generals[0].rashKnights = true;
  b.generals[1].fixedPlan = 'hold';
  const ks = b.regiments.filter((r) => r.team === 0 && r.role !== 'command');
  const sh = b.regiments.filter((r) => r.team === 1 && r.role === 'missile');
  const sp = b.regiments.filter((r) => r.team === 1 && r.role === 'line');
  const X = 1500;
  const Y = 1200;
  sp.forEach((r, i) => placeRegiment(b, r, X + 150, Y + (i - (sp.length - 1) / 2) * (r.width + 16), -1, 0));
  sh.forEach((r, i) => placeRegiment(b, r, X, Y + (i - (sh.length - 1) / 2) * (r.width + 20), -1, 0));
  ks.forEach((r, i) => placeRegiment(b, r, X - gap, Y + (i - (ks.length - 1) / 2) * (r.width + 10), 1, 0));
  if (stakes) {
    // (Stakes are planted at deployment: before the shooters where they now stand.)
    const st = (b as unknown as { stakes: { team: number; x: number; y0: number; y1: number }[] }).stakes;
    st.length = 0;
    for (const r of sh) st.push({ team: 1, x: r.ax - 8, y0: r.ay - r.width / 2 - 4, y1: r.ay + r.width / 2 + 4 });
  }
  return { b, ks, sh, sp };
}

describe('battle: foot shooters take cover from horse (v17, QA review 2 #1)', () => {
  it('archers before a line of spears fall back behind it from charging knights and shoot them from there', () => {
    // (Until v17 they stood in the open and shot, and the knights rode them down: 88% of the
    // archers dead over these six days, now about a tenth.)
    let lost = 0;
    let men = 0;
    let knightsLost = 0;
    let knights = 0;
    let behind = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { b, ks, sh, sp } = piece(seed);
      const a0 = alive(sh);
      const k0 = alive(ks);
      while (!b.done() && b.tick < 900) b.step();
      lost += a0 - alive(sh);
      men += a0;
      knightsLost += k0 - alive(ks);
      knights += k0;
      // Where they ended up: behind the spears' front (the side away from the horse's start).
      for (const r of sh) if (r.alive > 0 && r.ax > Math.min(...sp.map((s) => s.ax))) behind++;
    }
    expect(lost / men).toBeLessThan(0.15);
    expect(behind).toBeGreaterThanOrEqual(5);
    // The horse is not free: the knights are shot at and break on the spears.
    expect(knightsLost / knights).toBeGreaterThan(0.5);
  });

  it('they shoot while the horse is still far off, and run only when it comes on', () => {
    const { b, sh, ks } = piece(2, { gap: 900 });
    const a = sh[0]!;
    const full = ammo(b, sh);
    let firstMove = -1;
    let shotsBefore = 0;
    let gapThen = 0;
    while (!b.done() && b.tick < 600 && firstMove < 0) {
      b.step();
      if (a.coverReg >= 0) {
        firstMove = b.tick;
        shotsBefore = full - ammo(b, sh);
        const k = ks[0]!;
        gapThen = Math.hypot(k.cx - a.cx, k.cy - a.cy);
      }
    }
    expect(firstMove).toBeGreaterThan(0);
    // A volley or more at the horse first, from the edge of bowshot.
    expect(shotsBefore).toBeGreaterThanOrEqual(20);
    expect(gapThen).toBeLessThan(500);
  });

  it('with no friend near they stand and shoot, and do not step out to meet the horse', () => {
    for (const seed of [1, 2]) {
      const { b, sh } = piece(seed, { spears: 0, gap: 700 });
      const full = ammo(b, sh);
      // (Where they stand when they see the horse coming: before that they walk up to bowshot.)
      let x0: number[] | null = null;
      let contact = -1;
      let shots = 0;
      while (!b.done() && b.tick < 600 && contact < 0) {
        b.step();
        if (!x0 && sh.every((r) => r.horseFrom >= 0)) x0 = sh.map((r) => r.ax);
        if (sh.some((r) => r.engaged)) {
          contact = b.tick;
          shots = full - ammo(b, sh);
        }
      }
      expect(contact).toBeGreaterThan(0);
      // Two volleys and their shots at will.
      expect(shots).toBeGreaterThanOrEqual(40);
      expect(x0).not.toBeNull();
      sh.forEach((r, i) => expect(Math.abs(r.ax - x0![i]!)).toBeLessThan(6));
      expect(sh.every((r) => r.coverReg < 0)).toBe(true);
    }
  });

  it('behind their own stakes they stand', () => {
    const { b, sh } = piece(3, { stakes: true });
    const x0 = sh.map((r) => r.ax);
    let ran = false;
    while (!b.done() && b.tick < 300) {
      b.step();
      if (sh.some((r) => r.coverReg >= 0)) ran = true;
    }
    expect(ran).toBe(false);
    sh.forEach((r, i) => {
      if (r.alive > 0 && !r.routed && b.soldiers[r.members[0]!]!.state === State.Fighting) expect(Math.abs(r.ax - x0[i]!)).toBeLessThan(12);
    });
  });

  it('crossbows too', () => {
    let lost = 0;
    let men = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const { b, sh } = piece(seed, { shooters: U.Crossbowmen });
      const a0 = alive(sh);
      while (!b.done() && b.tick < 900) b.step();
      lost += a0 - alive(sh);
      men += a0;
    }
    expect(lost / men).toBeLessThan(0.15);
  });
});
