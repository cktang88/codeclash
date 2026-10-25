import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { checkVendored } from '../../scripts/vendor-grammars.ts';
import type { ChangedFile } from '../rules/classify.ts';
import { loadAllGrammars } from '../rules/complexity.ts';
import { applyPush, measurePush, MemoryLedger } from '../rules/ledger.ts';
import { inlineParser, ParsePool } from './parsePool.ts';

/** This repository's own recent commits, as GitHub would show them: real code in several languages. */
function ownCommits(n: number): ChangedFile[][] {
  const shas = execFileSync('git', ['log', '--format=%H', `-n${n}`, '--no-merges'], { encoding: 'utf8' }).trim().split('\n');
  return shas.map((sha) => {
    const raw = execFileSync('git', ['show', '--format=', '-U3', sha], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return raw.split(/^diff --git /m).filter(Boolean).flatMap((chunk): ChangedFile[] => {
      const name = /^a\/(\S+) b\//.exec(chunk)?.[1];
      const at = chunk.indexOf('\n@@');
      if (!name || at < 0) return [];
      const patch = chunk.slice(at + 1);
      return [{ filename: name, status: 'modified', additions: (patch.match(/^\+/gm) ?? []).length, deletions: (patch.match(/^-/gm) ?? []).length, patch }];
    });
  });
}

describe('parsing off the main thread', () => {
  const pool = new ParsePool(2);
  afterAll(() => pool.close());

  it('a worker prepares pushes that measure exactly as measuring inline does', async () => {
    await loadAllGrammars();
    const diffs = ownCommits(6);
    const prepared = await pool.prepare(diffs);
    expect(pool.stats.fallbacks).toBe(0);
    const inWorker = new MemoryLedger();
    const inline = new MemoryLedger();
    for (let i = 0; i < diffs.length; i++) {
      const a = applyPush(prepared[i]!, inWorker);
      const b = measurePush(diffs[i]!, inline);
      expect(a).toEqual(b);
    }
  });

  it('falls back to parsing inline when a worker cannot answer', async () => {
    const broken = new ParsePool(1, 30_000, new URL('./does-not-exist.ts', import.meta.url));
    const diffs = ownCommits(1);
    const got = await broken.prepare(diffs);
    expect(broken.stats.fallbacks).toBe(1);
    expect(got).toEqual(await inlineParser().prepare(diffs));
    await broken.close();
  });
});

describe('vendored grammars', () => {
  it('every grammar is checked in with the sha256 its manifest records', () => {
    expect(checkVendored()).toEqual([]);
  });
});
