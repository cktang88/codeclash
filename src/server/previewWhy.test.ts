// The army preview's structured "why": where the size came from (whole parts that add up to it,
// a fork's pending credit kept out), the reasons for every zero or capped source, the spending,
// and the veteran rank's progress.

import { beforeAll, describe, expect, it } from 'vitest';
import type { PreviewCommit, PreviewResponse, PreviewSource, PreviewWhy } from '../protocol.ts';
import { loadAllGrammars } from '../rules/complexity.ts';
import { FILE_CAP, FILE_CREDIT, type DifficultyNote } from '../rules/difficulty.ts';
import { Cat, Kind } from '../sim/api.ts';
import { armyFor, armyQuality, budgetOf, effectiveLedger, emptyLedger, slotsOf, VETERAN_CODE, VETERAN_FILES } from '../sim/muster.ts';
import { DifficultyContext } from './difficulty.ts';
import { Preview, musterCommit, whyOf } from './preview.ts';
import { cssContext, CSS_PATH, FIXTURE_NOW, FORK_REPO, FRESH_REPO, GATED_REPO, installVite, MAINTAINER, repeatDay, VITE_BASE, VITE_DAY_HEAD, VITE_HEAD, VITE_REPO } from './testing/difficultyFixtures.ts';
import { commitMeta, FakeGithub } from './testing/fakeGithub.ts';
import { FIXTURE_REPO, PADDED_REPO, previewFixture } from './testing/previewFixtures.ts';

beforeAll(() => loadAllGrammars());

const clock = () => FIXTURE_NOW;

async function previewOf(repo: string, github = previewFixture(FIXTURE_NOW)): Promise<PreviewResponse> {
  const preview = new Preview({ github, clock, context: new DifficultyContext({ github, clock }) });
  const [owner, name] = repo.split('/') as [string, string];
  return { ...(await preview.preview(owner, name, null)).body, viewerHue: null };
}

const source = (why: PreviewWhy, key: PreviewSource['key']) => why.sources.find((s) => s.key === key);
const countedSum = (why: PreviewWhy) => why.sources.filter((s) => !s.pending).reduce((n, s) => n + s.size, 0);

describe('where the size came from', () => {
  it('adds up to the army size for every fixture commit and the combined army; pending credit is not in it', async () => {
    for (const repo of [FIXTURE_REPO, VITE_REPO, FORK_REPO, FRESH_REPO, GATED_REPO, PADDED_REPO]) {
      const body = await previewOf(repo);
      const all: { name: string; why: PreviewWhy; budget: number; code: number; bonus: number }[] = [
        ...body.commits.map((c: PreviewCommit) => ({ name: `${repo} ${c.message}`, why: c.why, budget: c.army.budget, code: c.lines.code, bonus: c.bonus ?? 0 })),
        { name: `${repo} combined`, why: body.combined!.why, budget: body.combined!.army.budget, code: body.combined!.lines.code, bonus: body.combined!.bonus ?? 0 },
      ];
      for (const x of all) {
        expect(countedSum(x.why), x.name).toBe(x.budget);
        if (x.budget > 0) expect(x.why.size, x.name).toBe(x.budget);
        if (x.code > 0) expect(source(x.why, 'code')!.amount, x.name).toBe(x.code);
        // The two parts of the bonus are the bonus the ledger credited.
        expect((source(x.why, 'others')?.credit ?? 0) + (source(x.why, 'effort')?.credit ?? 0), x.name).toBe(x.bonus);
        // Every size is a whole number, and only a counted source has one in the bar.
        for (const s of x.why.sources) expect(Number.isInteger(s.size), `${x.name} ${s.key}`).toBe(true);
      }
    }
  });

  it('splits a maintainer’s hard fix into its code, others’ code and effort credit', async () => {
    const body = await previewOf(VITE_REPO);
    const c = body.commits.find((x) => x.sha === VITE_DAY_HEAD)!;
    const others = source(c.why, 'others')!;
    const effort = source(c.why, 'effort')!;
    expect(others.amount).toBe(10);
    // Most credit first: css.ts's 4 lines, then build.ts and asset.ts's 3.
    expect(others.files!.map((f) => f.path.split('/').pop())).toEqual(['css.ts', 'build.ts', 'asset.ts']);
    expect(others.files!.every((f) => f.multiplier > 3)).toBe(true);
    expect(effort.amount).toBe(3);
    expect(effort.credit).toBeGreaterThanOrEqual(3 * FILE_CREDIT - 3);
    // The effort credit is most of this army: ten lines of code raise one place, the credit 23.
    expect(effort.size).toBeGreaterThan(others.size + source(c.why, 'code')!.size);
    expect(c.why.sources.some((s) => s.pending)).toBe(false);
  });

  it('keeps a fork’s credit pending: shown with what it would add once merged, outside the total', async () => {
    const body = await previewOf(FORK_REPO);
    const c = body.commits[0]!;
    const pending = source(c.why, 'pending')!;
    expect(pending.pending).toBe(true);
    expect(pending.amount).toBeGreaterThan(3 * FILE_CREDIT);
    expect(pending.files).toHaveLength(3);
    expect(c.bonus ?? 0).toBe(0);
    // Its whole bonus is in that row: no zero rows for others' code or effort beside it.
    expect(source(c.why, 'others')).toBeUndefined();
    expect(source(c.why, 'effort')).toBeUndefined();
    expect(countedSum(c.why)).toBe(c.army.budget);
    // What it would add once merged: about what the same commit raises in vite itself.
    const vite = (await previewOf(VITE_REPO)).commits.find((x) => x.sha === VITE_DAY_HEAD)!;
    expect(Math.abs(c.army.budget + pending.size - vite.army.budget)).toBeLessThanOrEqual(1);
    // Ten lines raise no soldier on their own: the code says why.
    expect(source(c.why, 'code')!.chips).toEqual(['too few: about 16 lines a soldier']);
    expect(c.why.messenger).toBe('too-few');
  });
});

describe('reasons for every zero or capped source', () => {
  it('a greenfield commit: others’ code is none, for its lines are all new', async () => {
    const c = (await previewOf(FRESH_REPO)).commits[0]!;
    const others = source(c.why, 'others')!;
    expect(others.amount).toBe(0);
    expect(others.size).toBe(0);
    expect(others.chips).toEqual(['only new lines: never multiplied']);
    expect(source(c.why, 'effort')).toBeUndefined();
  });

  it('a fix of under 3 lines a file: no effort credit, and says how many lines it needs', async () => {
    const c = (await previewOf(VITE_REPO)).commits.find((x) => x.sha === VITE_HEAD)!;
    const effort = source(c.why, 'effort')!;
    expect(effort.amount).toBe(0);
    expect(effort.chips).toContain('only 2 lines changed (needs 3)');
  });

  it('a small repository: the gate holds the multiplier to ×1.5, and says why', async () => {
    const c = (await previewOf(GATED_REPO)).commits[0]!;
    const others = source(c.why, 'others')!;
    expect(others.files!.every((f) => f.multiplier === 1.5)).toBe(true);
    expect(others.chips).toContain('repo gate ×1.5: fewer than 5 stars and 2 forks');
  });

  it('the pusher’s own lines: your own code', async () => {
    const github = new FakeGithub();
    const { files } = installVite(github, { pusherOwnsChangedLines: true });
    github.addRepo(VITE_REPO, [commitMeta(VITE_HEAD, 'fix: respect build.sourcemap', { authorLogin: MAINTAINER.login, authorId: MAINTAINER.id, parent: VITE_BASE })]);
    github.setCommit(VITE_REPO, VITE_HEAD, { commits: [], files, base: VITE_BASE });
    const c = (await previewOf(VITE_REPO, github)).commits[0]!;
    expect(c.bonus ?? 0).toBe(0);
    expect(source(c.why, 'others')!.chips).toEqual(['your own code']);
  });

  it('a file credited recently: a token edit earns its line bonus but no effort credit', () => {
    const day = repeatDay();
    const { ledger, army, purpose, delta } = musterCommit(day.files, day.message, day.store, day.context);
    expect(delta.difficulty![0]).toMatchObject({ path: CSS_PATH, repeat: true });
    const why = whyOf(ledger, army, purpose, { filesChanged: 1, estimated: 0, truncated: false, notes: delta.difficulty, uncounted: delta.uncounted });
    const effort = source(why, 'effort')!;
    expect(effort.amount).toBe(0);
    expect(effort.chips).toEqual(['credited recently — needs 10+ lines']);
    expect(source(why, 'others')!.credit).toBe(Math.floor(4 * 2.2));
    expect(countedSum(why)).toBe(army.budget);
  });

  it('the day’s caps and the knee', () => {
    // A huge day: past the knee, past the daily code cap, and more hard files than the effort cap pays.
    const ledger = emptyLedger();
    ledger.lines[Cat.Code] = 8000;
    ledger.files = 400;
    ledger.branches = 2000;
    const notes: DifficultyNote[] = Array.from({ length: FILE_CAP + 2 }, (_, i) => ({ path: `src/hard${i}.ts`, modified: 5, mMilli: 3200, extraMilli: 11_000, creditMilli: FILE_CREDIT * 1000, context: cssContext([]) }));
    ledger.bonus = Math.floor((notes.length * 11_000) / 1000) + FILE_CAP * FILE_CREDIT;
    ledger.purposeCode[1] = 8000;
    const counts = armyFor(ledger, 1);
    const q = armyQuality(ledger);
    const real = { counts, slots: slotsOf(counts), budget: budgetOf(ledger), quality: q.quality, veterancy: q.veterancy, power: q.power, ragged: q.quality < 0.95, notes: q.notes };
    const why = whyOf(ledger, real, 'feature', { filesChanged: 300, estimated: 0, truncated: false, notes, uncounted: [{ kind: 'cap', lines: 1200, files: [] }] });
    const code = source(why, 'code')!;
    expect(code.chips).toEqual(['past the 4,000-line knee: half value', 'daily cap reached']);
    expect(source(why, 'effort')!.chips).toContain('daily cap reached');
    expect(source(why, 'effort')!.credit).toBe(FILE_CAP * FILE_CREDIT);
    // The bonus shares the knee with the code: it is held, and says so.
    expect(source(why, 'others')!.chips).toContain('past the 4,000-line knee: half value');
    expect(countedSum(why)).toBe(real.budget);
    expect(effectiveLedger(ledger).files).toBe(301);
    expect(source(why, 'files')!.chips).toEqual(['held to 301: one per 20 code lines']);
  });

  it('a ragged commit: filler is penalised, the power says ragged, and what did not count says by how much', async () => {
    const c = (await previewOf(PADDED_REPO)).commits[0]!;
    expect(c.army.ragged).toBe(true);
    expect(c.why.uncounted.penalty).toBeLessThan(0);
    expect(c.why.uncounted.filler).toBe(c.filler);
    expect(c.why.uncounted.kinds[0]!.kind).toBe('shape');
    expect(c.why.parts.find((p) => p.kind === 'filler')!.effect).toBeLessThan(0);
    // Honest code leaves only free structure: no penalty.
    const fresh = (await previewOf(FIXTURE_REPO)).commits.find((x) => x.message.startsWith('feat: add the siege planner'))!;
    expect(fresh.why.uncounted.penalty).toBe(0);
  });
});

describe('how it was spent, the power and the rank', () => {
  it('names each kind with a reason, support apart, near misses aside', async () => {
    const body = await previewOf(FIXTURE_REPO);
    const planner = body.commits.find((c) => c.message.startsWith('feat: add the siege planner'))!;
    const units = Object.fromEntries(planner.why.units.map((u) => [u.kind, u]));
    expect(units[Kind.Dragon]).toMatchObject({ count: 1, reason: 'legendary feature' });
    expect(units[Kind.Footman]!.reason).toBe('the rest');
    expect(units[Kind.Knight]!.reason).toBe('complex logic');
    expect(planner.why.supportUnits.map((u) => [u.kind, u.reason])).toEqual([
      [Kind.Warden, '180 test lines'],
      [Kind.Archer, '50 comments'],
    ]);
    // 40 lines of docs: not yet a Herald (120).
    expect(planner.why.nearMisses).toContainEqual({ kind: Kind.Herald, have: 40, need: 120, unit: 'docs lines' });
    // Units and support account for every soldier.
    const all = [...planner.why.units, ...planner.why.supportUnits].reduce((n, u) => n + u.count, 0);
    expect(all).toBe(planner.army.counts.reduce((a, b) => a + b, 0));
    // Power is the army's; its parts are the quality notes.
    expect(planner.why.power).toBe(planner.army.power);
    expect(planner.why.parts.map((p) => p.kind)).toEqual(planner.army.notes.map((n) => n.kind));
  });

  it('gives the veteran rank and the way to the next: code with the bonus, and real files', async () => {
    const body = await previewOf(FIXTURE_REPO);
    const planner = body.commits.find((c) => c.message.startsWith('feat: add the siege planner'))!;
    expect(planner.why.rank).toEqual({ rank: 2, max: 3, code: 1420, files: 14, target: { rank: 3, code: VETERAN_CODE[2], files: VETERAN_FILES[2] } });
    // At the top rank, the top rank's own thresholds.
    expect(body.combined!.why.rank.rank).toBe(3);
    expect(body.combined!.why.rank.target).toEqual({ rank: 3, code: VETERAN_CODE[2], files: VETERAN_FILES[2] });
    // The bonus counts as code toward a rank; the files must be real.
    const vite = (await previewOf(VITE_REPO)).commits.find((x) => x.sha === VITE_DAY_HEAD)!;
    expect(vite.why.rank).toMatchObject({ rank: 0, files: 1, target: { rank: 1, code: VETERAN_CODE[0], files: VETERAN_FILES[0] } });
    expect(vite.why.rank.code).toBe(10 + (vite.bonus ?? 0));
    expect(vite.why.rank.code).toBeGreaterThan(VETERAN_CODE[0]!);
    const fresh = (await previewOf(FRESH_REPO)).commits[0]!;
    expect(fresh.why.rank).toEqual({ rank: 1, max: 3, code: 500, files: 6, target: { rank: 2, code: VETERAN_CODE[1], files: VETERAN_FILES[1] } });
  });

  it('a binary-only commit: a lone messenger, nothing read', async () => {
    const art = (await previewOf(FIXTURE_REPO)).commits.find((c) => c.message === 'Add banner art')!;
    expect(art.why.size).toBe(1);
    expect(art.why.messenger).toBe('nothing-read');
    expect(art.why.sources).toEqual([]);
    expect(art.why.units).toEqual([{ kind: Kind.Footman, count: 1, reason: 'lone messenger', detail: 'Every first push of the day sends at least a messenger' }]);
  });
});
