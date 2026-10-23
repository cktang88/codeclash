// Red-team tests on the army a day's ledger is worth: the same contribution,
// dressed up in different ways, should not field a meaningfully stronger army.
// See docs/fair-play.md.

import { describe, expect, it } from 'vitest';
import { Cat, Kind, KIND_COUNT, type Ledger } from './api.ts';
import { applyDelta, armyFor, armyQuality, CODE_CAP, emptyLedger, purposeOf } from './muster.ts';
import { STATS } from './stats.ts';

type Part = { lines: Partial<Record<keyof typeof Cat, number>>; files?: number; branches?: number; msg?: string; filler?: number };

function ledgerOf(parts: readonly Part[]): Ledger {
  const l = emptyLedger();
  for (const d of parts) {
    const lines = new Array<number>(9).fill(0);
    for (const [k, v] of Object.entries(d.lines)) lines[Cat[k as keyof typeof Cat]] = v!;
    applyDelta(l, { lines, files: d.files ?? 0, branches: d.branches ?? 0, churn: 0, filler: d.filler ?? 0, purpose: purposeOf(d.msg ?? '') });
  }
  return l;
}

/** Fighting strength: quality times Σ count·√(hp·damage). */
function strength(ledger: Ledger): number {
  const counts = armyFor(ledger, 1);
  let s = 0;
  for (let k = 0; k < KIND_COUNT; k++) s += counts[k]! * Math.sqrt(STATS[k]!.hp * STATS[k]!.damage);
  return s * armyQuality(ledger).power;
}

/** A realistic day: features, two fixes and a refactor, with tests and comments. */
const HONEST: Part[] = [
  { lines: { Code: 520, Test: 150, Comment: 20 }, files: 4, branches: 75, msg: 'feat(billing): add invoice exports' },
  { lines: { Code: 40, Test: 40, Removed: 10 }, files: 1, branches: 6, msg: 'fix: rounding of zero-amount invoices' },
  { lines: { Code: 80, Test: 40, Comment: 10 }, files: 1, branches: 12, msg: 'fix(api): crash when the session token expires' },
  { lines: { Code: 260, Removed: 300 }, files: 3, branches: 35, msg: 'refactor: extract pricing rules' },
  { lines: { Code: 400, Test: 150, Comment: 40, Docs: 2 }, files: 3, branches: 60, msg: 'feat: payment retries' },
];

describe('gaming the army a ledger is worth', () => {
  it('commit-message keyword stuffing changes the make-up, not the strength', () => {
    const honest = strength(ledgerOf(HONEST));
    for (const msg of ['feat: everything', 'fix: everything', 'perf: everything', 'refactor: everything', 'Revert "everything"', 'chore: everything', 'wip']) {
      const stuffed = strength(ledgerOf(HONEST.map((p) => ({ ...p, msg }))));
      expect(stuffed, msg).toBeLessThanOrEqual(1.1 * honest);
    }
  });

  it('test, comment, docs and config spam on top of honest work adds little', () => {
    const honest = strength(ledgerOf(HONEST));
    const spam = (lines: Part['lines']) => strength(ledgerOf([...HONEST, { lines, msg: 'test: more coverage' }]));
    expect(spam({ Test: 20_000 })).toBeLessThanOrEqual(1.1 * honest);
    expect(spam({ Comment: 20_000 })).toBeLessThanOrEqual(1.1 * honest);
    expect(spam({ Docs: 20_000 })).toBeLessThanOrEqual(1.1 * honest);
    expect(spam({ Config: 20_000 })).toBeLessThanOrEqual(1.1 * honest);
    expect(spam({ Test: 20_000, Comment: 20_000, Docs: 20_000, Config: 20_000 })).toBeLessThanOrEqual(1.1 * honest);
  });

  it('support alone, with a sliver of code, stays far below a real day', () => {
    const sliver = strength(ledgerOf([{ lines: { Code: 60, Test: 20_000, Comment: 20_000, Docs: 20_000, Config: 20_000 }, files: 1, msg: 'feat: x' }]));
    expect(sliver).toBeLessThan(0.5 * strength(ledgerOf(HONEST)));
  });

  it('leaving out tests and comments does not make a stronger army', () => {
    const honest = strength(ledgerOf(HONEST));
    const bare = strength(ledgerOf(HONEST.map((p) => ({ ...p, lines: { Code: p.lines.Code, Removed: p.lines.Removed } }))));
    expect(bare).toBeLessThanOrEqual(honest);
    const small = (lines: Part['lines']) => strength(ledgerOf([{ lines, files: 3, branches: 20, msg: 'feat: x' }]));
    expect(small({ Code: 150 })).toBeLessThanOrEqual(small({ Code: 150, Test: 40, Comment: 8 }));
  });

  it('many tiny files are worth no more than the code they hold', () => {
    const few = strength(ledgerOf([{ lines: { Code: 200, Test: 50 }, files: 5, branches: 30, msg: 'feat: x' }]));
    const many = strength(ledgerOf([{ lines: { Code: 200, Test: 50 }, files: 200, branches: 30, msg: 'feat: x' }]));
    expect(many).toBeLessThanOrEqual(1.1 * few);
    const vet = armyQuality(ledgerOf([{ lines: { Code: 260, Test: 50 }, files: 260 }])).veterancy;
    expect(vet).toBeLessThanOrEqual(1);
  });

  it('inflated branch points are worth no more than dense real logic', () => {
    const real = strength(ledgerOf([{ lines: { Code: 1000, Test: 200 }, files: 8, branches: 1000 / 3, msg: 'feat: x' }]));
    const fake = strength(ledgerOf([{ lines: { Code: 1000, Test: 200 }, files: 8, branches: 10_000, msg: 'feat: x' }]));
    expect(fake).toBeLessThanOrEqual(1.1 * real);
  });

  it('two days of pasting landing in one war count as one day', () => {
    const one = strength(ledgerOf([{ lines: { Code: CODE_CAP, Test: 500 }, files: 40, branches: 600, msg: 'feat: x' }]));
    const two = strength(ledgerOf([
      { lines: { Code: CODE_CAP, Test: 500 }, files: 40, branches: 600, msg: 'feat: x' },
      { lines: { Code: CODE_CAP, Test: 500 }, files: 40, branches: 600, msg: 'feat: x' },
    ]));
    expect(two).toBeLessThanOrEqual(1.1 * one);
  });

  it('mass deletion is capped like code', () => {
    const wipe = (removed: number) => strength(ledgerOf([{ lines: { Removed: removed }, files: 300, msg: 'refactor: remove dead code' }]));
    expect(wipe(1_000_000)).toBeLessThanOrEqual(1.1 * wipe(CODE_CAP));
    expect(wipe(1_000_000)).toBeLessThan(strength(ledgerOf([{ lines: { Code: 1000, Test: 200 }, files: 8, branches: 150, msg: 'feat: x' }])));
  });

  it('an honest day is not ragged, and a large one earns veteran rank', () => {
    const q = armyQuality(ledgerOf(HONEST));
    expect(q.notes.filter((n) => n.effect < 0)).toEqual([]);
    expect(q.quality).toBeGreaterThanOrEqual(1);
    expect(q.veterancy).toBeGreaterThanOrEqual(1);
    const counts = armyFor(ledgerOf(HONEST), 5);
    expect(counts[Kind.Footman]).toBeGreaterThan(0);
  });
});
