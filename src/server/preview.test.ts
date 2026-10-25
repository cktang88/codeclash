import { describe, expect, it } from 'vitest';
import type { PreviewResponse } from '../protocol.ts';
import { measurePush, MemoryLedger } from '../rules/ledger.ts';
import { Cat, CAT_NAMES, Kind } from '../sim/api.ts';
import { applyDelta, armyFor, armyQuality, budgetOf, cleanLines, emptyLedger, purposeOf, slotsOf } from '../sim/muster.ts';
import type { ChangedFile } from '../rules/classify.ts';
import { createServer } from './app.ts';
import { loadConfig } from './config.ts';
import type { CommitMeta } from './github.ts';
import { silentLogger } from './log.ts';
import { PREVIEW_PER_MINUTE } from './http.ts';
import { explain, HEAD_TTL_MS, musterCommit, PREVIEW_COMMITS } from './preview.ts';
import { commitMeta, FakeGithub } from './testing/fakeGithub.ts';
import { diff, FIXTURE_REPO, fixtureCommits, fixtureSha, previewFixture, Scribe } from './testing/previewFixtures.ts';

async function boot(github: FakeGithub, now = { t: Date.UTC(2026, 9, 24, 12) }) {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', COMMONS: '0', PUBLIC_URL: 'http://pf.test' });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, previewGithub: github });
  await server.app.ready();
  let ip = 0;
  /** Each call from its own address unless one is given, so the per-address limit stays out of the way. */
  const get = (url: string, remoteAddress = `10.0.0.${++ip % 250}`) => server.app.inject({ url, remoteAddress });
  return { server, now, get };
}

/** What ingestion would raise from one commit pushed alone: `measurePush` on a fresh ledger, then `armyFor`. */
function standalone(files: readonly ChangedFile[], message: string) {
  const delta = measurePush(files, new MemoryLedger());
  const ledger = emptyLedger();
  applyDelta(ledger, { lines: cleanLines(delta.lines), files: delta.files, branches: delta.branches, churn: delta.churn, filler: delta.filler, purpose: purposeOf(message) });
  return { delta, ledger, army: armyFor(ledger, 1), quality: armyQuality(ledger) };
}

describe('GET /api/preview/:owner/:repo', () => {
  it('previews the latest non-merge commits, each measured and mustered exactly as ingestion would', async () => {
    const { get } = await boot(previewFixture());
    const res = await get(`/api/preview/${FIXTURE_REPO}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<PreviewResponse>();
    expect(body.repo).toBe(FIXTURE_REPO);
    expect(body.branch).toBe('main');
    expect(body.branches).toEqual(['main', 'release/1.x']);
    expect(body.viewerHue).toBeNull();

    const fixtures = fixtureCommits();
    const nonMerge = fixtures.map((c, i) => ({ ...c, sha: fixtureSha(i) })).filter((c) => !c.merge);
    expect(body.commits).toHaveLength(PREVIEW_COMMITS);
    // The merge is passed over, never previewed.
    expect(body.skippedMerges).toBe(1);
    expect(body.commits.map((c) => c.sha)).toEqual(nonMerge.slice(0, PREVIEW_COMMITS).map((c) => c.sha));
    expect(body.commits.some((c) => c.message.startsWith('Merge pull request'))).toBe(false);

    body.commits.forEach((c, i) => {
      const f = nonMerge[i]!;
      const want = standalone(f.files, f.message);
      expect(c.htmlUrl).toBe(`https://github.com/${FIXTURE_REPO}/commit/${f.sha}`);
      expect(c.shortSha).toBe(f.sha.slice(0, 7));
      expect(c.purpose).toBe(purposeOf(f.message));
      CAT_NAMES.forEach((name, cat) => expect(c.lines[name], `${f.message}: ${name}`).toBe(want.ledger.lines[cat]));
      expect(c.files).toBe(want.ledger.files);
      expect(c.branches).toBe(want.ledger.branches);
      expect(c.army.counts).toEqual(want.army);
      expect(c.army.slots).toBe(slotsOf(want.army));
      expect(c.army.budget).toBe(budgetOf(want.ledger));
      expect(c.army.quality).toBe(want.quality.quality);
      expect(c.army.veterancy).toBe(want.quality.veterancy);
      expect(c.army.notes).toEqual(want.quality.notes);
      expect(c.reasons.length).toBeGreaterThan(0);
    });

    const byMessage = (m: string) => body.commits.find((c) => c.message.startsWith(m))!;
    expect(byMessage('feat: add the siege planner').army.counts[Kind.Dragon]).toBe(1);
    expect(byMessage('feat: add the siege planner').reasons.some((r) => r.includes('a Dragon'))).toBe(true);
    expect(byMessage('fix:').reasons.some((r) => r.startsWith('Specialists:') && r.includes('bug fix →') && r.includes('Cleric'))).toBe(true);
    expect(byMessage('feat: implement courier').army.counts[Kind.Berserker]).toBeGreaterThan(0);
    expect(byMessage('feat: implement courier').reasons.some((r) => /Berserkers? \(no tests or comments: each Berserker fights in place of two Footmen\)/.test(r))).toBe(true);
    expect(byMessage('Explain the wagon queue').army.ragged).toBe(true);
    const lockfile = byMessage('chore(deps): bump lockfile');
    expect(lockfile.lines.generated).toBeGreaterThan(1000);
    expect(lockfile.army.budget).toBe(0);
    expect(lockfile.reasons).toContain('1,240 generated lines raise nothing');
    // Binary-only: nothing to read, one messenger.
    const art = byMessage('Add banner art');
    expect(art.army.slots).toBe(1);
    expect(art.army.counts[Kind.Footman]).toBe(1);
    expect(art.reasons.some((r) => r.includes('lone messenger'))).toBe(true);
  });

  it('gives the combined army of all ten pushed on one day, which a squashed push equals', async () => {
    const { get } = await boot(previewFixture());
    const body = (await get(`/api/preview/${FIXTURE_REPO}`)).json<PreviewResponse>();
    const combined = body.combined!;
    expect(combined.commits).toBe(PREVIEW_COMMITS);
    expect(combined.separateSlots).toBe(body.commits.reduce((n, c) => n + c.army.slots, 0));

    // The fixture's commits touch distinct files, so squashing them is one push of all their files.
    const chosen = fixtureCommits().filter((c) => !c.merge).slice(0, PREVIEW_COMMITS);
    const squash = measurePush(chosen.flatMap((c) => c.files), new MemoryLedger());
    // Ten pushes credit each commit's code to its own purpose; the squash's lines are the same.
    const ledger = emptyLedger();
    const store = new MemoryLedger();
    for (const c of [...chosen].reverse()) {
      const d = measurePush(c.files, store);
      applyDelta(ledger, { lines: cleanLines(d.lines), files: d.files, branches: d.branches, churn: d.churn, filler: d.filler, purpose: purposeOf(c.message) });
    }
    CAT_NAMES.forEach((name, cat) => expect(combined.lines[name], name).toBe(Math.max(0, squash.lines[cat]!)));
    expect(combined.files).toBe(squash.files);
    expect(combined.branches).toBe(squash.branches);
    expect(combined.army.counts).toEqual(armyFor(ledger, PREVIEW_COMMITS));
    const squashed = emptyLedger();
    applyDelta(squashed, { lines: cleanLines(squash.lines), files: squash.files, branches: squash.branches, churn: squash.churn, filler: squash.filler, purpose: 'feature' });
    // Size and strength are the squash's whatever the messages; only the specialists follow them.
    expect(combined.army.budget).toBe(budgetOf(squashed));
    expect(combined.army.quality).toBe(armyQuality(squashed).quality);
    expect(combined.army.veterancy).toBe(armyQuality(squashed).veterancy);
  });

  it('gives exactly the squashed army when every commit has the same purpose', async () => {
    const github = new FakeGithub();
    const s = new Scribe(3);
    const commits = Array.from({ length: 12 }, (_, i) => ({ meta: commitMeta(`${(i + 1).toString(16).padStart(2, '0')}`.repeat(20), `feat: part ${i}`), files: [diff(`src/part${i}.ts`, s.code(60 + i * 7)), diff(`src/part${i}.test.ts`, s.tests(5))] }));
    github.addRepo('ana/parts', commits.map((c) => c.meta));
    for (const c of commits) github.setCommit('ana/parts', c.meta.sha, { commits: [], files: c.files });
    const { get } = await boot(github);
    const body = (await get('/api/preview/ana/parts')).json<PreviewResponse>();
    const files = commits.slice(0, PREVIEW_COMMITS).flatMap((c) => c.files);
    const squash = standalone(files, 'feat: everything');
    expect(body.combined!.army.counts).toEqual(squash.army);
    expect(body.combined!.army.quality).toBe(squash.quality.quality);
  });

  it('caches by repository head for five minutes and by commit sha for good', async () => {
    const github = previewFixture();
    const { get, now } = await boot(github);
    const first = await get(`/api/preview/${FIXTURE_REPO}`);
    expect(first.headers['x-preview-cache']).toBe('miss');
    expect(github.calls.commit).toBe(PREVIEW_COMMITS);
    const calls = { ...github.calls };

    const again = await get(`/api/preview/${FIXTURE_REPO.toUpperCase()}`);
    expect(again.headers['x-preview-cache']).toBe('hit');
    expect(github.calls).toEqual(calls);

    // A new commit lands; past the five minutes the head is read again, and only the new commit's diff is fetched.
    const history = github.histories.get(`${FIXTURE_REPO}#main`)!;
    const sha = 'f'.repeat(40);
    history.unshift({ ...history[0]!, sha, message: 'fix: guard the gate' });
    github.setCommit(FIXTURE_REPO, sha, { commits: [], files: [diff('src/gate.ts', new Scribe(11).code(40))] });
    now.t += HEAD_TTL_MS - 1000;
    expect((await get(`/api/preview/${FIXTURE_REPO}`)).json<PreviewResponse>().commits[0]!.sha).not.toBe(sha);
    now.t += 2000;
    const fresh = (await get(`/api/preview/${FIXTURE_REPO}`)).json<PreviewResponse>();
    expect(fresh.commits[0]!.sha).toBe(sha);
    expect(github.calls.commit).toBe(PREVIEW_COMMITS + 1);
  });

  it('allows ten previews a minute from one address', async () => {
    const { get, now } = await boot(previewFixture());
    for (let i = 0; i < PREVIEW_PER_MINUTE; i++) expect((await get(`/api/preview/${FIXTURE_REPO}`, '10.9.9.9')).statusCode).toBe(200);
    const limited = await get(`/api/preview/${FIXTURE_REPO}`, '10.9.9.9');
    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ error: string }>().error).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBe('60');
    expect((await get(`/api/preview/${FIXTURE_REPO}`, '10.9.9.10')).statusCode).toBe(200);
    now.t += 60_000;
    expect((await get(`/api/preview/${FIXTURE_REPO}`, '10.9.9.9')).statusCode).toBe(200);
  });

  it('answers a missing repository and a private one alike, telling nothing of the private one', async () => {
    const github = previewFixture();
    const { get } = await boot(github);
    const missing = await get('/api/preview/ironquill/nowhere');
    const secret = await get('/api/preview/ironquill/war-chest');
    expect(missing.statusCode).toBe(404);
    expect(secret.statusCode).toBe(404);
    expect(secret.json()).toEqual(missing.json());
    // Refused before anything of it is read.
    expect(github.calls.commits).toBe(0);
    expect(github.calls.commit).toBe(0);
  });

  it('answers a missing branch, an empty repository and bad names', async () => {
    const { get } = await boot(previewFixture());
    const branch = await get(`/api/preview/${FIXTURE_REPO}?branch=nope`);
    expect(branch.statusCode).toBe(404);
    expect(branch.json<{ error: string }>().error).toBe('no_branch');
    const release = (await get(`/api/preview/${FIXTURE_REPO}?branch=release/1.x`)).json<PreviewResponse>();
    expect(release.branch).toBe('release/1.x');
    expect(release.commits).toHaveLength(4);
    // A /tree/ URL's path after a branch is cut back until a branch answers.
    expect((await get(`/api/preview/${FIXTURE_REPO}?branch=release/1.x/src/planner`)).json<PreviewResponse>().branch).toBe('release/1.x');

    const empty = (await get('/api/preview/ironquill/blank-slate')).json<PreviewResponse>();
    expect(empty.commits).toEqual([]);
    expect(empty.combined).toBeNull();

    expect((await get('/api/preview/-bad/repo')).statusCode).toBe(400);
    expect((await get(`/api/preview/${FIXTURE_REPO}?branch=a..b`)).statusCode).toBe(400);
  });

  it('refuses when GitHub’s rate limit is spent, and does not cache the refusal', async () => {
    const github = previewFixture();
    const { get } = await boot(github);
    github.rateLimited = true;
    const res = await get(`/api/preview/${FIXTURE_REPO}`);
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: string }>().error).toBe('github_limited');
    github.rateLimited = false;
    github.remaining = 5;
    expect((await get(`/api/preview/${FIXTURE_REPO}`)).statusCode).toBe(503);
    github.remaining = 5000;
    expect((await get(`/api/preview/${FIXTURE_REPO}`)).statusCode).toBe(200);
  });

  it('reads huge commits as ingestion does: 300 files at most, missing patches estimated', async () => {
    const github = new FakeGithub();
    const s = new Scribe(5);
    const huge: ChangedFile[] = Array.from({ length: 300 }, (_, i) => diff(`src/gen${i}/mod.ts`, s.code(3)));
    const omitted: ChangedFile = { filename: 'src/big.ts', status: 'modified', additions: 900, deletions: 10, patch: null };
    const metas: CommitMeta[] = [commitMeta('1'.repeat(40), 'feat: everything at once'), commitMeta('2'.repeat(40), 'feat: a file too large to diff')];
    github.addRepo('ana/huge', metas);
    github.setCommit('ana/huge', metas[0]!.sha, { commits: [], files: huge });
    github.setCommit('ana/huge', metas[1]!.sha, { commits: [], files: [omitted] });
    const { get } = await boot(github);
    const body = (await get('/api/preview/ana/huge')).json<PreviewResponse>();
    expect(body.commits[0]!.truncated).toBe(true);
    expect(body.commits[0]!.reasons.some((r) => r.includes('first 300 files'))).toBe(true);
    expect(body.commits[1]!.estimated).toBe(1);
    expect(body.commits[1]!.lines.code).toBe(900);
    expect(body.commits[1]!.army.counts).toEqual(standalone([omitted], 'feat: a file too large to diff').army);
    expect(body.commits[1]!.lines[CAT_NAMES[Cat.Removed]]).toBe(10);
    // An estimated file is plain code, never filler, and the reasons say it was estimated.
    expect(body.commits[1]!.filler).toBe(0);
    expect(body.commits[1]!.reasons).toContain('GitHub omitted the diff of 1 file; their additions count as code, estimated');
  });
});

describe('preview reasons', () => {
  const reasons = (files: ChangedFile[], message = 'feat: work') => {
    const { ledger, army, purpose, delta } = musterCommit(files, message);
    return { army, delta, reasons: explain(ledger, army, purpose, { filesChanged: files.length, estimated: 0, truncated: false, uncounted: delta.uncounted }) };
  };
  const patch = (filename: string, lines: readonly string[]): ChangedFile => ({ filename, status: 'added', additions: lines.length, deletions: 0, patch: ['@@ -0,0 +1,' + lines.length + ' @@', ...lines.map((l) => `+${l}`)].join('\n') });

  it('leads with the army size, split into whole parts that add up, each beside what earned it', () => {
    const c = fixtureCommits().find((x) => x.message.startsWith('feat: add the siege planner'))!;
    const { army, reasons: r } = reasons(c.files, c.message);
    const size = r[0]!;
    expect(size).toMatch(/^Army size: 51 — mostly from 1,420 lines of code \(\+45\), plus 14 files \(\+1\) and 473 branch points of logic \(\+5\)$/);
    const parts = [...size.matchAll(/\(\+(\d+)/g)].map((m) => Number(m[1]));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(army.budget);
    // Then how the size was spent.
    expect(r[1]).toMatch(/^Specialists: 33 of 51 \(.*a Dragon.*\); the rest are 18 Footmen$/);
    expect(r.join('\n')).not.toMatch(/[Bb]udget|slot/);
  });

  it('says no filler for honest structure, and names the kind and file of real filler', () => {
    const fn = (n: string) => [`export function draw${n}(ctx: Context, ${n}: Part) {`, `  ctx.moveTo(${n}.left, ${n}.top);`, `  ctx.lineTo(${n}.right, ${n}.bottom);`, `  ctx.fillText(${n}.label, ${n}.left, ${n}.top);`, '}'];
    const honest = reasons([patch('src/render/parts.ts', ['keep', 'wall', 'gate', 'tower', 'moat', 'bridge', 'yard', 'hall'].flatMap(fn))]);
    expect(honest.delta.filler).toBe(0);
    expect(honest.reasons).toContain('Not counted, as in any code (no penalty): 8 lines of brackets, closing tags and bare keywords in render/parts.ts');
    // One rule copied for 312 icons: past the shape cap, the copies are near-duplicates, and filler.
    const icons = Array.from({ length: 312 }, (_, i) => `.icon-${i.toString(36)}x { background: var(--sprite); }`);
    const padded = reasons([patch('src/client/styles/hud.css', icons)]);
    expect(padded.delta.filler).toBeGreaterThan(250);
    const line = padded.reasons.find((x) => x.includes('of filler'))!;
    expect(line).toBe(`${padded.delta.filler} lines of filler, more than the code carries: 304 near-duplicate lines (the same line with other names or numbers, counted 8 times a day) in styles/hud.css`);
    expect(padded.reasons.some((x) => /^\d+% of lines were filler: quality −/.test(x))).toBe(true);
  });
});
