import { it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { measurePush, MemoryLedger } from './ledger.ts';
import { measurePush as oldMeasure, MemoryLedger as OldLedger } from './zz_old_ledger.ts';
import { Cat } from '../sim/api.ts';
function walk(d: string, out: string[]) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p, out); } else if (/\.(ts|tsx|js|py|go|rs)$/.test(f) && !f.startsWith('zz_')) out.push(p); } return out; }
it('cmp', () => {
  const roots = process.env.ROOTS!.split(',');
  const res: string[] = [];
  let a = 0, b = 0, ab = 0, bb = 0;
  for (const root of roots) for (const f of walk(root, [])) {
    const text = readFileSync(f, 'utf8');
    const ch = [{ filename: f.replace(/^.*?src\//, 'src/'), status: 'added', additions: 0, deletions: 0, patch: '@@ -0,0 +1 @@\n' + text.split('\n').map((l) => '+' + l).join('\n') }];
    const n = measurePush(ch, new MemoryLedger());
    const o = oldMeasure(ch, new OldLedger());
    a += o.lines[Cat.Code]!; b += n.lines[Cat.Code]!; ab += o.branches; bb += n.branches;
    if (n.lines[Cat.Code]! < 0.85 * o.lines[Cat.Code]! && o.lines[Cat.Code]! > 30) res.push(`${f} old=${o.lines[Cat.Code]} new=${n.lines[Cat.Code]}`);
  }
  throw new Error(JSON.stringify({ oldCode: a, newCode: b, ratio: b / a, oldBranches: ab, newBranches: bb, worst: res }, null, 1));
});
