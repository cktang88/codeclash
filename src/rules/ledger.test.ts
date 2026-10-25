import { describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import type { ChangedFile } from './classify.ts';
import { DAILY_CODE_CAP, fillerKind, FREE_PER_CODE, isFillerText, measurePush, MemoryLedger, normalize, type PushDelta } from './ledger.ts';

type Tree = Record<string, string[]>;

/** A unified-style patch from an LCS line diff, as GitHub would show it. */
function diff(before: readonly string[], after: readonly string[]): string {
  const n = before.length;
  const m = after.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = before[i] === after[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out = ['@@ -1 +1 @@'];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      out.push(` ${before[i]}`);
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push(`+${after[j++]}`);
    else out.push(`-${before[i++]}`);
  }
  return out.join('\n');
}

function changes(from: Tree, to: Tree): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const path of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[path] ?? [];
    const b = to[path] ?? [];
    if (a.join('\n') === b.join('\n')) continue;
    const patch = diff(a, b);
    const lines = patch.split('\n');
    files.push({
      filename: path,
      status: !from[path] ? 'added' : !to[path] ? 'removed' : 'modified',
      additions: lines.filter((l) => l.startsWith('+')).length,
      deletions: lines.filter((l) => l.startsWith('-')).length,
      patch,
    });
  }
  return files;
}

function sum(deltas: readonly PushDelta[]) {
  const lines = new Array<number>(9).fill(0);
  let files = 0;
  let branches = 0;
  for (const d of deltas) {
    d.lines.forEach((n, c) => (lines[c]! += n));
    files += d.files;
    branches += d.branches;
  }
  return { code: lines[Cat.Code], removed: lines[Cat.Removed], test: lines[Cat.Test], comment: lines[Cat.Comment], docs: lines[Cat.Docs], config: lines[Cat.Config], files, branches };
}

/** Runs a history push by push, and as one squashed push, and returns both totals. */
function both(history: readonly Tree[]) {
  const split = new MemoryLedger();
  const deltas: PushDelta[] = [];
  for (let k = 1; k < history.length; k++) deltas.push(measurePush(changes(history[k - 1]!, history[k]!), split));
  const squashed = measurePush(changes(history[0]!, history[history.length - 1]!), new MemoryLedger());
  return { split: sum(deltas), squash: sum([squashed]), deltas, squashed };
}

const OLD = ['export function parse(input: string) {', '  if (input.length === 0) return null;', '  return input.split(",");', '}'];

describe('squash equivalence', () => {
  it('a long, messy history sums to the same contribution as its squash', () => {
    const start: Tree = { 'src/parse.ts': OLD.slice(), 'README.md': ['# Parser'], 'src/old.ts': ['export const legacyValue = computeLegacy(config);', 'export const otherValue = computeOther(config);'] };
    const h: Tree[] = [start];
    const next = (f: (t: Tree) => void) => {
      const t = structuredClone(h[h.length - 1]!);
      f(t);
      h.push(t);
    };
    // Add a feature with a comment and a test.
    next((t) => {
      t['src/feature.ts'] = ['// Sums the totals for each order.', 'export function totals(orders: Order[]) {', '  let sum = 0;', '  for (const o of orders) if (o.paid && !o.void) sum += o.amount;', '  return sum;', '}'];
      t['src/feature.test.ts'] = ["it('sums paid orders', () => expect(totals(orders)).toBe(10));"];
    });
    // Reindent everything in the feature (a formatter run).
    next((t) => {
      t['src/feature.ts'] = t['src/feature.ts']!.map((l) => `  ${l}`);
    });
    // Add a debugging line, then delete it again.
    next((t) => t['src/parse.ts']!.splice(1, 0, '  console.log("parsing", input, typeof input);'));
    next((t) => t['src/parse.ts']!.splice(1, 1));
    // Delete an old line, then restore it.
    next((t) => t['src/parse.ts']!.splice(2, 1));
    next((t) => t['src/parse.ts']!.splice(2, 0, '  return input.split(",");'));
    // Move a function to a new file (rename-like).
    next((t) => {
      t['src/helpers.ts'] = t['src/feature.ts']!;
      delete t['src/feature.ts'];
    });
    // Modify a line twice (A → B → C).
    next((t) => (t['src/parse.ts']![1] = '  if (!input) return null;'));
    next((t) => (t['src/parse.ts']![1] = '  if (!input || input.trim() === "") return null;'));
    // Delete a legacy file outright, plus docs, config and filler.
    next((t) => {
      delete t['src/old.ts'];
      t['README.md']!.push('Parses comma separated values into arrays.');
      t['tsconfig.json'] = ['{ "compilerOptions": { "strict": true } }'];
      t['src/table.ts'] = ['export const TABLE = [', '  0x1f, 0x2a, 0x3b,', '  0x1f, 0x2a, 0x3b,', '];'];
    });
    // Add three identical lines in two pushes, then remove one.
    next((t) => t['src/parse.ts']!.push('registerParser(parse, defaultOptions);', 'registerParser(parse, defaultOptions);'));
    next((t) => t['src/parse.ts']!.push('registerParser(parse, defaultOptions);'));
    next((t) => t['src/parse.ts']!.pop());
    // Add then revert a whole commit.
    next((t) => (t['src/tmp.ts'] = ['export function experiment(value: number) {', '  return value > 3 ? fastPath(value) : slowPath(value);', '}']));
    next((t) => delete t['src/tmp.ts']);

    const { split, squash } = both(h);
    expect(split).toEqual(squash);
    expect(squash.code).toBeGreaterThan(5);
    expect(squash.removed).toBe(3);
    expect(squash.test).toBe(1);
    expect(squash.files).toBe(4);
  });

  it('holds for random edit histories', () => {
    let r = 9;
    const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const pool = ['const total = items.reduce((sum, item) => sum + item.price, 0);', 'if (user && user.isAdmin) grantAccess(user, resource);', 'return cache.get(key) ?? loadFromDisk(key);', 'for (const row of rows) emitRow(row, writer);', 'throw new Error("unexpected state " + state);', 'logger.info("started worker", workerId);', '}', '// handles the retry path', 'export default createServer(config);'];
    const paths = ['src/a.ts', 'src/b.ts', 'src/c.py', 'test/a.test.ts', 'docs/guide.md'];
    for (let trial = 0; trial < 40; trial++) {
      const h: Tree[] = [{ 'src/a.ts': [pick(pool), pick(pool)], 'src/b.ts': [pick(pool)] }];
      for (let k = 0; k < 12; k++) {
        const t = structuredClone(h[h.length - 1]!);
        const path = pick(paths);
        const lines = (t[path] ??= []);
        const op = rand();
        if (op < 0.4 || lines.length === 0) lines.splice(Math.floor(rand() * (lines.length + 1)), 0, pick(pool));
        else if (op < 0.6) lines.splice(Math.floor(rand() * lines.length), 1);
        else if (op < 0.75) lines[Math.floor(rand() * lines.length)] = `    ${lines[Math.floor(rand() * lines.length)]!.trim()}`;
        else if (op < 0.9) {
          const other = pick(paths);
          const moved = lines.splice(Math.floor(rand() * lines.length), 1);
          (t[other] ??= []).push(...moved);
        } else lines[Math.floor(rand() * lines.length)] = pick(pool);
        for (const p of Object.keys(t)) if (t[p]!.length === 0) delete t[p];
        h.push(t);
      }
      const { split, squash } = both(h);
      expect(split, `trial ${trial}`).toEqual(squash);
    }
  });
});

describe('squash equivalence with wrapped statements', () => {
  // Every line is its own key, so histories that edit, split, join and move the pieces of wrapped
  // statements still add up to the squash, line for line. (Keying a wrapped statement whole would
  // close the re-wrap residual, but a patch's three lines of context cannot always show a whole
  // statement, and the squash would no longer be exact; see docs/fair-play.md, vector 5.)
  const pool = [
    'const total = sumAmounts(',
    '  orders.map((order) => order.amount),',
    '  currencyOf(orders),',
    ');',
    'const label =',
    '  user.first + " " + user.last;',
    'if (ready &&',
    '    user.isAdmin) grantAccess(user, resource);',
    'emitRow(row, writer);',
    'logger.info("started worker", workerId);',
    'items.forEach((item) => {',
    '  // handles the retry path',
    '}',
    'return cache.get(key) ??',
    '  loadFromDisk(key, options.timeout);',
  ];
  it('holds for random edit histories', () => {
    let r = 17;
    const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const paths = ['src/a.ts', 'src/b.ts', 'src/c.py'];
    for (let trial = 0; trial < 60; trial++) {
      const h: Tree[] = [{ 'src/a.ts': pool.slice(0, 4), 'src/b.ts': pool.slice(4, 8) }];
      for (let k = 0; k < 14; k++) {
        const t = structuredClone(h[h.length - 1]!);
        const path = pick(paths);
        const lines = (t[path] ??= []);
        const op = rand();
        if (op < 0.35 || lines.length === 0) lines.splice(Math.floor(rand() * (lines.length + 1)), 0, pick(pool));
        else if (op < 0.55) lines.splice(Math.floor(rand() * lines.length), 1);
        else if (op < 0.7) {
          // Join two neighbouring lines, or split one at a space.
          const i = Math.floor(rand() * lines.length);
          if (i + 1 < lines.length && rand() < 0.5) lines.splice(i, 2, `${lines[i]!} ${lines[i + 1]!.trim()}`);
          else {
            const at = lines[i]!.indexOf(' ', 4);
            if (at > 0) lines.splice(i, 1, lines[i]!.slice(0, at), `    ${lines[i]!.slice(at + 1)}`);
          }
        } else if (op < 0.85) {
          const other = pick(paths);
          const at = Math.floor(rand() * lines.length);
          const moved = lines.splice(at, Math.min(lines.length - at, 1 + Math.floor(rand() * 3)));
          (t[other] ??= []).push(...moved);
        } else lines[Math.floor(rand() * lines.length)] = pick(pool);
        for (const p of Object.keys(t)) if (t[p]!.length === 0) delete t[p];
        h.push(t);
      }
      const { split, squash } = both(h);
      expect(split, `trial ${trial}`).toEqual(squash);
    }
  });

  it('a wrapped call written, edited in the middle and deleted leaves nothing', () => {
    const call = ['const total = sumAmounts(', '  orders.map((order) => order.amount),', '  currencyOf(orders),', '  options.rounding,', ');'];
    const edited = call.map((l, i) => (i === 2 ? '  currencyOf(orders, locale),' : l));
    const { split, squash } = both([{ 'src/a.ts': ['start();'] }, { 'src/a.ts': ['start();', ...call] }, { 'src/a.ts': ['start();', ...edited] }, { 'src/a.ts': ['start();'] }]);
    expect(split).toEqual(squash);
    expect(split.code).toBe(0);
    expect(split.removed).toBe(0);
  });
});

describe('rules', () => {
  const file = (filename: string, patch: string): ChangedFile => ({ filename, status: 'modified', additions: 0, deletions: 0, patch });

  it('normalizes whitespace so reformatting changes nothing', () => {
    expect(normalize('   if (x)   {  y();  } ')).toBe('if (x) { y(); }');
    const d = measurePush([file('src/a.ts', '@@\n-  doThing(alpha, beta);\n+\tdoThing(alpha,  beta);')], new MemoryLedger());
    expect(d.lines[Cat.Code]).toBe(0);
    expect(d.lines[Cat.Removed]).toBe(0);
    expect(d.files).toBe(0);
  });

  it('cancels a line moved between files in one push', () => {
    const d = measurePush([file('src/a.ts', '@@\n-moveMe(alpha, beta);'), file('src/b.ts', '@@\n+moveMe(alpha, beta);')], new MemoryLedger());
    expect(d.lines[Cat.Code]).toBe(0);
    expect(d.lines[Cat.Removed]).toBe(0);
  });

  it('treats punctuation and literal tables as filler', () => {
    for (const t of ['}', '});', '0x1f, 0x2a,', "'a', 'b',", '1, 2, 3,', 'user,']) expect(isFillerText(normalize(t)), t).toBe(true);
    for (const t of ['return items.length;', 'if (ready) start();', 'x = 1;']) expect(isFillerText(normalize(t)), t).toBe(false);
    const d = measurePush([file('src/a.ts', '@@\n+}\n+0x1f, 0x2a,\n+return items.length;')], new MemoryLedger());
    expect(d.lines[Cat.Code]).toBe(1);
    expect(d.filler).toBe(2);
  });

  it('tells structure, fragments and literal data from code, however short its names', () => {
    const kind = (t: string, family = 'c') => fillerKind(normalize(t), family);
    // Structure: brackets, bare tags and bare keywords.
    for (const t of ['}', ');', '})}', '</div>', '<span>', '</>', '} else {', 'return (', 'break;', 'return;', 'default:']) expect(kind(t), t).toBe('structure');
    // Fragments: a lone name, as a wrapped argument or a JSX child leaves.
    for (const t of ['user,', '{rising}', 'useEffect(() => {', 'run: () => {', '{!still &&']) expect(kind(t), t).toBe('fragment');
    // Data: literals with no code.
    for (const t of ['[-70, -118],', "'No modifiers. The war council weighs every objective evenly.',", '{ id: 7, name: "x", active: true },', "tone: 'warn',", 'size={76}', '}, 4500, false, 10_000),', 'aGVsbG8gd29ybGQgaGVsbG8gd29ybGQgaGVsbG8gd29ybGQ=,']) expect(kind(t), t).toBe('data');
    // Code, with one-letter names and literals: drawing code and short statements.
    for (const t of ['label.x = x;', 'v.sampleTick = -1;', 'y += len / 6;', 'x += (rand() - 0.5) * 9;', 'whoosh(v, 0.7, 600, 2400, 0.12);', 'strokeWidth={1.3 / k}', 'x: number;', 'return 0;', "case 'rising':", '(victor >= 0', 'title: `You hold ${mine} of ${claimed} capitals`,']) expect(kind(t), t).toBeNull();
    // Style sheets have declarations, not literal rows.
    for (const t of ['margin: 0;', "content: '';", 'color: #d3c6a6;', 'z-index: -1;']) expect(kind(t, 'none'), t).toBeNull();
  });

  it('frees uncounted structure up to what the code carries, and reports the rest as filler', () => {
    const parts = ['keep', 'wall', 'gate', 'tower', 'moat', 'bridge'];
    const fn = (p: string) => [`export function draw${p}(ctx: Context, ${p}: Part) {`, `  ctx.moveTo(${p}.left, ${p}.top);`, `  ctx.lineTo(${p}.right, ${p}.bottom);`, '  ctx.stroke();', '}'];
    // Honest code: closing braces and a repeated idiom stay within the allowance.
    const honest = measurePush([file('src/draw.ts', '@@\n' + parts.map((p) => fn(p).map((l) => `+${l}`).join('\n')).join('\n'))], new MemoryLedger());
    expect(honest.lines[Cat.Code]).toBe(19);
    expect(honest.filler).toBe(0);
    expect(honest.uncounted?.map((u) => [u.kind, u.lines])).toEqual([['structure', 6], ['repeat', 5]]);
    expect(honest.uncounted?.[0]?.files).toEqual([{ path: 'src/draw.ts', lines: 6 }]);
    // Padding brings no code to carry it: all of it is filler.
    const padding = measurePush([file('src/pad.ts', '@@\n' + '+}\n+);\n'.repeat(100))], new MemoryLedger());
    expect(padding.filler).toBe(200);
    // Past the allowance, the excess is filler.
    const ledger = new MemoryLedger();
    const mixed = measurePush([file('src/mix.ts', '@@\n' + ['alpha', 'beta', 'gamma', 'delta', 'omega', 'sigma', 'kappa', 'theta', 'lambda', 'zeta'].map((n) => `+const ${n} = compute(input, ${n}Weight);`).join('\n') + '\n' + '+}\n'.repeat(30))], ledger);
    expect(mixed.lines[Cat.Code]).toBe(10);
    expect(mixed.filler).toBe(30 - Math.floor(FREE_PER_CODE * 10));
  });

  it('keys a comment by its text, so single-line doc comments are not copies of each other', () => {
    const d = measurePush([file('src/a.ts', '@@\n+/** Walls about to fall crack and shed dust. */\n+/** The player whose home seat this is. */\n+/**\n+ * Lake or massif at the centre.\n+ */\n+{/* The ring road. */}')], new MemoryLedger());
    expect(d.lines[Cat.Comment]).toBe(4);
    expect(d.lines[Cat.Blank]).toBe(2);
    expect(d.filler).toBe(0);
    expect(d.uncounted).toEqual([]);
  });

  it('credits identical lines once per user', () => {
    const d = measurePush([file('src/a.ts', '@@\n' + '+callHandler(request, response);\n'.repeat(10))], new MemoryLedger());
    expect(d.lines[Cat.Code]).toBe(1);
    expect(d.filler).toBe(9);
  });

  it('cancels work that a later push undoes, and reports churn', () => {
    const ledger = new MemoryLedger();
    const add = measurePush([file('src/a.ts', '@@\n+if (ready && armed) fireAll(targets);')], ledger);
    expect(add.lines[Cat.Code]).toBe(1);
    expect(add.branches).toBe(2);
    expect(add.files).toBe(1);
    const undo = measurePush([file('src/a.ts', '@@\n-if (ready && armed) fireAll(targets);')], ledger);
    expect(undo.lines[Cat.Code]).toBe(-1);
    expect(undo.branches).toBe(-2);
    expect(undo.lines[Cat.Removed]).toBe(0);
    expect(undo.files).toBe(-1);
    expect(undo.churn).toBe(2);
  });

  it('does not credit the same lines again after a force-push rewrite', () => {
    const ledger = new MemoryLedger();
    const patch = '@@\n+export function amended(value: number) { return value * factor; }';
    expect(measurePush([file('src/a.ts', patch)], ledger).lines[Cat.Code]).toBe(1);
    // The rewritten history shows the same line added again: it was already paid for.
    expect(measurePush([file('src/a.ts', patch)], ledger).lines[Cat.Code]).toBe(0);
    expect(measurePush([file('src/a.ts', patch)], ledger).lines[Cat.Code]).toBe(0);
  });

  it('counts deleting old code as removed, once', () => {
    const d = measurePush([file('src/a.ts', '@@\n-legacyHandler(request, response);\n-legacyHandler(request, response);\n-legacyHandler(request, response);')], new MemoryLedger());
    expect(d.lines[Cat.Removed]).toBe(1);
  });

  it('caps code per day as a running total, so splitting cannot beat it', () => {
    // Distinct lines of distinct shapes (numbered copies would be capped as one shape).
    const word = (i: number) => Array.from({ length: 4 }, (_, k) => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26 ** k) % 26]).join('');
    const big = Array.from({ length: DAILY_CODE_CAP + 500 }, (_, i) => `+const value${word(i)} = compute(input${word(i)});`).join('\n');
    expect(measurePush([file('src/a.ts', `@@\n${big}`)], new MemoryLedger()).lines[Cat.Code]).toBe(DAILY_CODE_CAP);
    const ledger = new MemoryLedger();
    const half = Math.ceil((DAILY_CODE_CAP + 500) / 2);
    const lines = big.split('\n');
    const a = measurePush([file('src/a.ts', `@@\n${lines.slice(0, half).join('\n')}`)], ledger);
    const b = measurePush([file('src/b.ts', `@@\n${lines.slice(half).join('\n')}`)], ledger);
    expect(a.lines[Cat.Code]! + b.lines[Cat.Code]!).toBe(DAILY_CODE_CAP);
  });

  it('counts a file touched on an earlier day again when it changes today', () => {
    const ledger = new MemoryLedger();
    expect(measurePush([file('src/a.ts', '@@\n+export const first = compute(input);')], ledger).files).toBe(1);
    ledger.today = 1;
    const next = measurePush([file('src/a.ts', '@@\n+export const second = compute(output);')], ledger);
    expect(next.lines[Cat.Code]).toBe(1);
    expect(next.files).toBe(1);
  });

  it('counts generated and vendored lines plainly and never as code', () => {
    const d = measurePush([file('dist/app.js', '@@\n+var a=1;'), file('vendor/lib/x.go', '@@\n+func X() { return }')], new MemoryLedger());
    expect(d.lines[Cat.Generated]).toBe(1);
    expect(d.lines[Cat.Vendor]).toBe(1);
    expect(d.lines[Cat.Code]).toBe(0);
  });
});
