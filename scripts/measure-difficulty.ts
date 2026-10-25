// Measures the difficulty bonus on hand-built fixtures, through the same pipeline ingestion runs:
// FakeGithub (REST facts, GraphQL blame and history) → DifficultyContext → ingestPush → ledger →
// armyFor. Prints, for the vite-like hard fix and a greenfield 500-line commit: lines credited, the
// bonus, the army's size and strength, and the API cost.
//
//   pnpm tsx scripts/measure-difficulty.ts

import { loadAllGrammars } from '../src/rules/complexity.ts';
import { Cat, KIND_COUNT, type Ledger } from '../src/sim/api.ts';
import { applyDelta, armyFor, armyQuality, budgetOf, effectiveLedger, emptyLedger, purposeOf } from '../src/sim/muster.ts';
import { STATS } from '../src/sim/stats.ts';
import { openDb, Store } from '../src/server/db.ts';
import { DifficultyContext } from '../src/server/difficulty.ts';
import { ingestPush, type PushReport } from '../src/server/poller.ts';
import { difficultyText, difficultyOf } from '../src/server/preview.ts';
import { FakeGithub } from '../src/server/testing/fakeGithub.ts';
import { FIXTURE_NOW, installGreenfield, installVite, MAINTAINER } from '../src/server/testing/difficultyFixtures.ts';
import { measurePush, MemoryLedger } from '../src/rules/ledger.ts';

await loadAllGrammars();

function strength(ledger: Ledger): number {
  const counts = armyFor(ledger, 1);
  let s = 0;
  for (let k = 0; k < KIND_COUNT; k++) s += counts[k]! * Math.sqrt(STATS[k]!.hp * STATS[k]!.damage);
  return Math.round(s * armyQuality(ledger).power);
}

async function run(name: string, install: (g: FakeGithub) => { repo: string; base: string; head: string }, withContext = true) {
  const github = new FakeGithub();
  const { repo, base, head } = install(github);
  const store = new Store(openDb(':memory:'));
  store.upsertUser({ id: MAINTAINER.id, nodeId: 'U', login: MAINTAINER.login, avatarUrl: '', createdAtGithub: 0, joinedAt: 0, bot: false });
  const context = withContext ? new DifficultyContext({ github, clock: () => FIXTURE_NOW }) : null;
  let report: PushReport | null = null;
  report = await ingestPush({ store, github, clock: () => FIXTURE_NOW, onPush: () => undefined, context }, store.user(MAINTAINER.id)!, { repo, ref: 'refs/heads/main', before: base, head, at: FIXTURE_NOW });
  if (!report) throw new Error(`${name}: nothing recorded`);
  const ledger = emptyLedger();
  applyDelta(ledger, { lines: report.lines, files: report.files, branches: report.branches, functions: report.functions, links: report.links, bonus: report.bonus, churn: report.churn, filler: report.filler, purpose: purposeOf(report.message) });
  const eff = effectiveLedger(ledger);
  return {
    name,
    code: report.lines[Cat.Code],
    removed: report.lines[Cat.Removed],
    bonus: report.bonus ?? 0,
    credited: eff.code + eff.bonus,
    budget: budgetOf(ledger),
    strength: strength(ledger),
    graphqlQueries: github.calls.graphql,
    graphqlPoints: context?.stats.graphqlPoints ?? 0,
    rest: github.calls.compare + github.calls.commit + github.calls.repoFacts + github.calls.languages,
  };
}

const rows = [
  await run('vite fix, no bonus (before)', installVite, false),
  await run('vite fix, with context', installVite),
  await run('greenfield 500 lines', installGreenfield),
];
console.table(rows);

// The per-file lines the preview shows for the vite fix.
{
  const github = new FakeGithub();
  const { repo, files } = installVite(github);
  const context = new DifficultyContext({ github, clock: () => FIXTURE_NOW });
  const { pusherOf } = await import('../src/rules/difficulty.ts');
  const ctx = await context.forDiff(repo, { base: 'b'.repeat(40), files }, pusherOf(MAINTAINER.id, MAINTAINER.login));
  const delta = measurePush(files, new MemoryLedger(), ctx);
  for (const n of delta.difficulty ?? []) console.log(difficultyText(difficultyOf(n)));
  console.log(`bonus ${delta.bonus} lines on ${delta.lines[Cat.Code]} code lines`);
}
