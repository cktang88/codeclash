import { describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { branchesIn, categorizePath, classifyLine, summarizeFiles, syntaxFor, type ChangedFile } from './classify.ts';

describe('categorizePath', () => {
  const cases: [string, ReturnType<typeof categorizePath>][] = [
    ['node_modules/react/index.js', 'vendor'],
    ['vendor/github.com/pkg/errors/errors.go', 'vendor'],
    ['third_party/zlib/inflate.c', 'vendor'],
    ['static/jquery.min.js', 'vendor'],
    ['package-lock.json', 'generated'],
    ['pnpm-lock.yaml', 'generated'],
    ['yarn.lock', 'generated'],
    ['Cargo.lock', 'generated'],
    ['go.sum', 'generated'],
    ['dist/bundle.js', 'generated'],
    ['web/build/app.js', 'generated'],
    ['api/v1/service.pb.go', 'generated'],
    ['proto/user_pb2.py', 'generated'],
    ['lib/model.g.dart', 'generated'],
    ['src/__snapshots__/App.test.tsx.snap', 'generated'],
    ['src/schema_generated.ts', 'generated'],
    ['app.js.map', 'generated'],
    ['README.md', 'docs'],
    ['docs/guide/setup.py', 'docs'],
    ['CHANGELOG', 'docs'],
    ['LICENSE', 'docs'],
    ['notes.rst', 'docs'],
    ['requirements.txt', 'config'],
    ['CMakeLists.txt', 'config'],
    ['src/parser.test.ts', 'test'],
    ['src/parser.spec.js', 'test'],
    ['src/__tests__/parser.tsx', 'test'],
    ['pkg/lexer/lexer_test.go', 'test'],
    ['tests/test_parser.py', 'test'],
    ['app/test_models.py', 'test'],
    ['conftest.py', 'test'],
    ['src/test/java/com/acme/ParserTest.java', 'test'],
    ['Sources/AppTests/ParserTests.swift', 'test'],
    ['spec/models/user_spec.rb', 'test'],
    ['crates/core/tests/integration.rs', 'test'],
    ['MyApp.Tests/ParserTests.cs', 'test'],
    ['tests/fixtures/sample.json', 'test'],
    ['tests/assets/logo.png', 'ignored'],
    ['.github/workflows/ci.yml', 'config'],
    ['Dockerfile', 'config'],
    ['Dockerfile.prod', 'config'],
    ['Makefile', 'config'],
    ['infra/main.tf', 'config'],
    ['tsconfig.json', 'config'],
    ['.gitignore', 'config'],
    ['.editorconfig', 'config'],
    ['flake.nix', 'config'],
    ['src/parser.ts', 'source'],
    ['cmd/server/main.go', 'source'],
    ['src/lib.rs', 'source'],
    ['app/models/user.rb', 'source'],
    ['styles/site.scss', 'source'],
    ['src/App.vue', 'source'],
    ['.eslintrc.js', 'source'],
    ['assets/logo.png', 'ignored'],
    ['data/cities.csv', 'ignored'],
  ];
  it.each(cases)('%s is %s', (path, expected) => {
    expect(categorizePath(path)).toBe(expected);
  });
});

describe('classifyLine', () => {
  const run = (path: string, lines: string[]) => {
    const syntax = syntaxFor(path);
    const state = { block: null };
    return lines.map((l) => classifyLine(l, syntax, state));
  };

  it('reads C-family line and block comments', () => {
    expect(run('a.ts', ['// note', 'const x = 1;', '/**', ' * doc', ' */', '', 'y(); /* tail', 'still comment */', 'z();'])).toEqual([
      'comment', 'code', 'comment', 'comment', 'comment', 'blank', 'code', 'comment', 'code',
    ]);
  });

  it('treats one-line block comments as comments without opening a block', () => {
    expect(run('a.go', ['/* one line */', 'x := 1'])).toEqual(['comment', 'code']);
  });

  it('reads hash comments and Python docstrings', () => {
    expect(run('a.py', ['# hi', 'def f():', '    """Summary.', '', '    More."""', '    return 1', '    """one-liner"""', 'x = """not a docstring', 'y = 2'])).toEqual([
      'comment', 'code', 'comment', 'blank', 'comment', 'code', 'comment', 'code', 'code',
    ]);
  });

  it('reads Ruby =begin blocks, Lua and Haskell comments', () => {
    expect(run('a.rb', ['=begin', 'notes', '=end', 'puts 1'])).toEqual(['comment', 'comment', 'comment', 'code']);
    expect(run('a.lua', ['-- note', '--[[', 'block', ']]', 'print(1)'])).toEqual(['comment', 'comment', 'comment', 'comment', 'code']);
    expect(run('a.hs', ['-- note', '{- a', 'b -}', 'main = pure ()'])).toEqual(['comment', 'comment', 'comment', 'code']);
  });

  it('reads HTML comments in markup and CSS block comments', () => {
    expect(run('a.html', ['<!-- nav', '-->', '<nav></nav>'])).toEqual(['comment', 'comment', 'code']);
    expect(run('a.css', ['/* theme */', 'body { color: red; }'])).toEqual(['comment', 'code']);
  });
});

function file(filename: string, patch: string | null, additions = 0, deletions = 0): ChangedFile {
  return { filename, status: 'modified', additions, deletions, patch };
}

describe('summarizeFiles', () => {
  it('splits source lines into code, comment, blank and removed', () => {
    const patch = ['@@ -1,4 +1,6 @@', ' import x from "y";', '-old();', '-', '+// explain', '+next();', '+', '+/* a', '+ b */', '+done();'].join('\n');
    const s = summarizeFiles([file('src/a.ts', patch)]);
    expect(s.lines[Cat.Code]).toBe(2);
    expect(s.lines[Cat.Comment]).toBe(3);
    expect(s.lines[Cat.Blank]).toBe(1);
    expect(s.lines[Cat.Removed]).toBe(1);
    expect(s.language).toBe('TypeScript');
  });

  it('tracks block comments opened in context lines', () => {
    const patch = ['@@ -1,2 +1,3 @@', ' /*', '+ inside', ' */'].join('\n');
    expect(summarizeFiles([file('src/a.c', patch)]).lines[Cat.Comment]).toBe(1);
  });

  it('resets block state at each hunk', () => {
    const patch = ['@@ -1,1 +1,2 @@', '+/* never closed', '@@ -9,1 +10,2 @@', '+code();'].join('\n');
    const s = summarizeFiles([file('src/a.c', patch)]);
    expect(s.lines[Cat.Comment]).toBe(1);
    expect(s.lines[Cat.Code]).toBe(1);
  });

  it('counts non-blank lines for tests, docs and config, and blank lines only for tests', () => {
    const p = ['@@ -0,0 +1,3 @@', '+a', '+', '+b'].join('\n');
    const s = summarizeFiles([file('src/a.test.ts', p), file('README.md', p), file('ci.yml', p), file('Cargo.lock', p), file('vendor/x/y.go', p)]);
    expect(s.lines[Cat.Test]).toBe(2);
    expect(s.lines[Cat.Docs]).toBe(2);
    expect(s.lines[Cat.Config]).toBe(2);
    expect(s.lines[Cat.Generated]).toBe(2);
    expect(s.lines[Cat.Vendor]).toBe(2);
    expect(s.lines[Cat.Blank]).toBe(1);
    expect(s.lines[Cat.Code]).toBe(0);
  });

  it('falls back to additions and deletions when GitHub omits the patch', () => {
    const s = summarizeFiles([file('src/big.ts', null, 900, 40), file('docs/x.md', null, 50)]);
    expect(s.lines[Cat.Code]).toBe(900);
    expect(s.lines[Cat.Removed]).toBe(40);
    expect(s.lines[Cat.Docs]).toBe(50);
  });

  it('treats generated headers and minified sources as generated', () => {
    const header = ['@@ -0,0 +1,3 @@', '+// Code generated by protoc-gen-go. DO NOT EDIT.', '+package api', '+var x = 1'].join('\n');
    const minified = ['@@ -0,0 +1,1 @@', `+${'var a=1;'.repeat(30)}`].join('\n');
    const s = summarizeFiles([file('api/service.go', header), file('static/app.js', minified)]);
    expect(s.lines[Cat.Generated]).toBe(4);
    expect(s.lines[Cat.Code]).toBe(0);
  });

  it('ignores binaries and unknown files, and picks the language with most code', () => {
    const go = ['@@ -0,0 +1,3 @@', '+a()', '+b()', '+c()'].join('\n');
    const py = ['@@ -0,0 +1,1 @@', '+a()'].join('\n');
    const s = summarizeFiles([file('logo.png', null, 10), file('main.go', go), file('tool.py', py)]);
    expect(s.lines.reduce((a, b) => a + b, 0)).toBe(4);
    expect(s.language).toBe('Go');
  });
});

describe('complexity', () => {
  const patch = (lines: string[]) => ['@@ -0,0 +1 @@', ...lines.map((l) => `+${l}`)].join('\n');

  it('counts branch points per language family', () => {
    expect(branchesIn('if (a && b || c) { for (;;) {} }', 'x.ts')).toBe(4);
    expect(branchesIn('} else if (x) { while (y) {} }', 'x.java')).toBe(2);
    expect(branchesIn('const v = ok ? 1 : 2;', 'x.js')).toBe(1);
    expect(branchesIn('const v = a?.b ?? c;', 'x.ts')).toBe(0);
    expect(branchesIn('function f(x?: number) {}', 'x.ts')).toBe(0);
    expect(branchesIn('switch (k) { case 1: case 2: }', 'x.go')).toBe(2);
    expect(branchesIn('Some(x) => 1, None => 2,', 'x.rs')).toBe(2);
    expect(branchesIn('if a and not b or c:', 'x.py')).toBe(3);
    expect(branchesIn('ys = [y for y in xs if y]', 'x.py')).toBe(2);
    expect(branchesIn('return x unless y && z', 'x.rb')).toBe(2);
    expect(branchesIn('if [ -f x ] && [ -d y ]; then', 'x.sh')).toBe(2);
  });

  it('ignores words inside strings and trailing comments', () => {
    expect(branchesIn('log("if this for that && more")', 'x.ts')).toBe(0);
    expect(branchesIn('run(); // if only', 'x.ts')).toBe(0);
    expect(branchesIn("print('while') # or else", 'x.py')).toBe(0);
  });

  it('counts touched source files and branches only in added code lines', () => {
    const s = summarizeFiles([
      file('src/a.ts', patch(['// if this is a comment, skip it', 'if (x) y();', 'const z = 1;'])),
      file('src/b.go', ['@@ -1,2 +1 @@', '-if old {', '-}', '+done()'].join('\n')),
      file('src/c.ts', patch(['', '   '])),
      file('src/a.test.ts', patch(['if (t) expect(1);'])),
      file('docs/guide.md', patch(['if you read this'])),
      file('package-lock.json', patch(['"if": 1'])),
    ]);
    expect(s.files).toBe(2);
    expect(s.branches).toBe(1);
  });

  it('estimates branches when the patch is missing', () => {
    const s = summarizeFiles([file('src/huge.ts', null, 120, 10)]);
    expect(s.files).toBe(1);
    expect(s.branches).toBe(10);
  });
});
