import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeFile, grammarOf, lineBranches, loadAllGrammars, parseBudget } from './complexity.ts';
import { measurePush, MemoryLedger } from './ledger.ts';

beforeAll(() => loadAllGrammars());

const added = (src: string) => src.split('\n').map((text) => ({ text, added: true, hunk: 1 }));

describe('decision points of a line, from its syntax', () => {
  const cases: [string, string, number][] = [
    ['x.ts', 'if (a && b || c) { for (;;) {} }', 4],
    ['x.ts', '} else if (x) {', 1],
    ['x.ts', 'const v = ok ? 1 : 2;', 1],
    ['x.ts', 'const v = a?.b ?? c;', 0],
    ['x.ts', 'function f(x?: number) {}', 0],
    ['x.ts', 'log("if this for that && more")', 0],
    ['x.ts', 'const s = obj.case + x.if;', 0],
    ['x.ts', 'if (true) go();', 0],
    ['x.ts', 'while (true) {', 0],
    ['x.ts', 'case 1:', 1],
    ['x.ts', 'default:', 0],
    ['x.ts', '} catch (e) {', 1],
    ['x.ts', '&& user.isAdmin) grant();', 1],
    ['x.tsx', '{open && <Panel title={t} />}', 1],
    ['x.ts', 'const x = `${a && b}`;', 1],
    ['x.java', '} else if (x) { while (y) {} }', 2],
    ['x.java', 'case 1 -> a();', 1],
    ['x.go', 'case 1:', 1],
    ['x.go', '} else if err != nil {', 1],
    ['x.rs', 'Some(x) => 1,', 1],
    ['x.rs', '_ => 2,', 0],
    ['x.rs', 'let v = x?;', 0],
    ['x.py', 'if a and not b or c:', 3],
    ['x.py', 'ys = [y for y in xs if y]', 2],
    ['x.py', 'elif x:', 1],
    ['x.py', 'except ValueError:', 1],
    ['x.py', 'if True:', 0],
    ['x.py', 'case [x, y]:', 1],
    ['x.rb', 'return x unless y && z', 2],
    ['x.rb', 'when 1 then a', 1],
    ['x.rb', 'rescue StandardError => e', 1],
    ['x.kt', 'if (x > 1 && y) a() else b()', 2],
    ['x.kt', '1 -> a()', 1],
    ['x.kt', 'else -> b()', 0],
    ['x.kt', 'val q = x ?: 3', 0],
  ];
  for (const [path, line, want] of cases) it(`${path}: ${line}`, () => expect(lineBranches(path, line)).toBe(want));

  it('has no grammar for other languages, so the ledger counts keywords there', () => {
    expect(grammarOf('x.c')).toBeNull();
    expect(lineBranches('x.c', 'if (a) b();')).toBeNull();
    expect(analyzeFile('x.c', added('int f() { return 1; }'), parseBudget())).toBeNull();
  });

  it('falls back once the push has parsed its share', () => {
    const budget = { bytes: 10 };
    expect(lineBranches('x.ts', 'if (ready && armed) fireAll(targets);', budget)).toBeNull();
    expect(analyzeFile('x.ts', added('function f() {\n  a();\n  b();\n  c();\n}'), { bytes: 5 })).toBeNull();
  });
});

describe('functions and imports in a hunk', () => {
  it('finds whole definitions with three or more statement lines, in each language', () => {
    const fns: [string, string][] = [
      ['a.ts', 'export function f(x: number) {\n  const a = x + 1;\n  log(a);\n  return a * 2;\n}'],
      ['a.py', 'def f(x):\n    a = x + 1\n    log(a)\n    return a * 2'],
      ['a.go', 'func f(x int) int {\n\ta := x + 1\n\tlog(a)\n\treturn a * 2\n}'],
      ['a.rs', 'fn f(x: u32) -> u32 {\n    let a = x + 1;\n    log(a);\n    a * 2\n}'],
      ['A.java', 'class A {\n  int f(int x) {\n    int a = x + 1;\n    log(a);\n    return a * 2;\n  }\n}'],
      ['a.kt', 'fun f(x: Int): Int {\n  val a = x + 1\n  log(a)\n  return a * 2\n}'],
      ['a.rb', 'def f(x)\n  a = x + 1\n  log(a)\n  a * 2\nend'],
    ];
    for (const [path, src] of fns) expect(analyzeFile(path, added(src), parseBudget())!.functions, path).toHaveLength(1);
  });

  it('skips stubs, one-liners and definitions cut off by the hunk or holding context lines', () => {
    expect(analyzeFile('a.ts', added('function f() {}\nconst g = (x) => x * 2;\nfunction h() {\n  throw new Error("todo");\n}'), parseBudget())!.functions).toHaveLength(0);
    const partial = 'function f() {\n  a();\n  b();\n  c();\n}'.split('\n').map((text, i) => ({ text, added: i !== 2, hunk: 1 }));
    expect(analyzeFile('a.ts', partial, parseBudget())!.functions).toHaveLength(0);
  });

  it('scores local imports by the names the added code uses', () => {
    const cases: [string, string, string, number][] = [
      ['src/a.ts', "import { load, save } from './store';\nimport { z } from 'zod';\nload(x);\nconst t: Thing = save(load(y));", 'src/store', 2],
      ['pkg/a.py', 'from .store import load, save\nimport os\nload(x)', 'pkg/store', 1],
      ['src/a.rs', 'use crate::store::{Db, open};\nuse std::fs;\nlet d = Db::new();', 'crate/store', 1],
      ['src/main/java/com/acme/app/A.java', 'import com.acme.app.store.Db;\nimport java.util.List;\nclass A { Db d = new Db(); }', 'com/acme/app/store/Db', 1],
      ['src/main/kotlin/com/acme/app/A.kt', 'import com.acme.app.store.Db\nval d = Db()', 'com/acme/app/store/Db', 1],
      ['internal/server/a.go', 'import "example.com/app/internal/store"\nfunc f() { store.Open(); store.Close() }', 'example.com/app/internal/store', 2],
      ['lib/a.rb', "require_relative 'user_store'\nUserStore.new", 'lib/user_store', 1],
    ];
    for (const [path, src, module, used] of cases) {
      const imports = analyzeFile(path, added(src), parseBudget())!.imports;
      expect(imports, path).toEqual([expect.objectContaining({ module, used })]);
    }
  });

  it('measures a push: decisions, functions and links, each on a credited line', () => {
    const src = [
      "import { loadOrder, formatTotal } from './orders';",
      'export async function settle(id: string, options: Options) {',
      '  const order = await loadOrder(id);',
      '  if (!order || order.void) throw new Error("missing");',
      '  const total = formatTotal(order.items, options.currency);',
      '  return notify(order.owner, total);',
      '}',
    ];
    const patch = ['@@ -0,0 +1,7 @@', ...src.map((l) => `+${l}`)].join('\n');
    const d = measurePush([{ filename: 'src/billing/settle.ts', status: 'added', additions: src.length, deletions: 0, patch }], new MemoryLedger());
    expect({ branches: d.branches, functions: d.functions, links: d.links, modules: d.modules }).toEqual({ branches: 2, functions: 3, links: 2, modules: 1 });
  });
});
