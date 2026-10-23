import { Cat, CAT_COUNT } from '../sim/api.ts';
import { languageOfPath } from './heraldry.ts';

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string | null;
}

export interface PushSummary {
  lines: number[];
  language: string | null;
  /** Source files with at least one added or removed code line. */
  files: number;
  /** Branch points in added source code lines: a rough complexity measure. */
  branches: number;
}

export type FileCategory = 'vendor' | 'generated' | 'docs' | 'test' | 'config' | 'source' | 'ignored';

const VENDOR = [
  /(^|\/)(node_modules|bower_components|vendors?|[Vv]endor|third[-_]?party|3rd[-_]?party|extern(als)?|Godeps|Carthage)\//,
  /(\.|-)min\.(js|css)$/,
];

const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'composer.lock',
  'Cargo.lock', 'poetry.lock', 'uv.lock', 'pdm.lock', 'pixi.lock', 'Pipfile.lock', 'Gemfile.lock', 'Gopkg.lock',
  'glide.lock', 'go.sum', 'Package.resolved', 'deno.lock', 'flake.lock', '.terraform.lock.hcl', 'mix.lock',
  'pubspec.lock', 'Podfile.lock', 'packages.lock.json', 'gradle.lockfile',
]);

const GENERATED = [
  /(^|\/)(dist|build|out|target|\.next|\.nuxt|coverage|htmlcov|__pycache__|__snapshots__)\//,
  /\.map$/,
  /\.pb\.go$/,
  /\.pb\.(cc|h)$/,
  /_pb2(_grpc)?\.pyi?$/,
  /\.(g|freezed)\.dart$/,
  /[._]generated\.[^/]+$/,
  /\.gen\.[^/]+$/,
  /\.snap$/,
];

const DOC_NAMES = /^(README|CHANGELOG|CHANGES|HISTORY|LICENSE|LICENCE|COPYING|CONTRIBUTING|AUTHORS|CODE_OF_CONDUCT|SECURITY|INSTALL|CITATION|NOTICE)([.-][^/]*)?$/i;
const DOC_DIRS = /(^|\/)(docs?|documentation|javadoc)\//;
// LaTeX is prose with markup: a paper is docs, not code.
const DOC_EXTENSIONS = new Set(['md', 'mdx', 'markdown', 'rst', 'adoc', 'asciidoc', 'txt', 'org', 'tex', 'bib']);
const CONFIG_TEXT = /^(requirements.*\.txt|CMakeLists\.txt|constraints\.txt|robots\.txt)$/i;

const TEST_NAMES = [
  /\.(test|spec|tests|specs)\.[^/.]+$/,
  /_test\.(go|py|rb|exs|cc|cpp|c|dart|ts|js)$/,
  /^test_[^/]*\.(py|c|cc|cpp)$/,
  /^conftest\.py$/,
  /_spec\.rb$/,
  /_unittest\.(cc|cpp)$/,
  /(Tests?|IT|Spec)\.(java|kt|kts|cs|php|scala|swift|groovy)$/,
];
const TEST_DIRS = [
  /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress|testdata|fixtures|benches|testing)\//,
  /(^|\/)src\/(test|androidTest|integrationTest)\//,
  /(^|\/)[\w.-]*Tests?\//,
];

const CONFIG_NAMES = new Set([
  'Dockerfile', 'Containerfile', 'Makefile', 'makefile', 'GNUmakefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile',
  'Gemfile', 'Rakefile', 'Brewfile', 'Justfile', 'justfile', 'Tiltfile', 'BUILD', 'BUILD.bazel', 'WORKSPACE',
]);
const CONFIG_EXTENSIONS = new Set([
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'json', 'jsonc', 'json5', 'tf', 'tfvars', 'hcl', 'nix', 'xml', 'plist',
  'properties', 'env', 'gradle', 'dockerfile', 'editorconfig', 'lock', 'bzl', 'cmake', 'csproj', 'sln', 'mk',
]);
const CONFIG_DIRS = /(^|\/)\.(github|circleci|gitlab|husky|vscode|idea|devcontainer|buildkite)\//;

const SOURCE_EXTENSIONS = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'pyi', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h',
  'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'cs', 'fs', 'fsx', 'rb', 'php', 'dart', 'scala', 'sc', 'ex', 'exs', 'erl', 'hrl',
  'hs', 'elm', 'lua', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'astro', 'zig', 'ml', 'mli', 'clj', 'cljs', 'cljc', 'el', 'lisp', 'jl', 'r', 'm', 'mm', 'pl', 'pm', 'groovy', 'nim',
  'cr', 'sol', 'sql', 'graphql', 'gql', 'proto', 'v', 'sv', 'vhd', 'vhdl', 'wgsl', 'glsl', 'hlsl', 'cu', 'gd', 'rkt', 'odin',
]);

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Lowercased extension of a path's file name, or ''. */
export function extensionOf(path: string): string {
  return extension(basename(path));
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function categorizePath(path: string): FileCategory {
  const name = basename(path);
  const ext = extension(name);
  if (VENDOR.some((re) => re.test(path))) return 'vendor';
  if (LOCKFILES.has(name) || GENERATED.some((re) => re.test(path))) return 'generated';
  if (!CONFIG_TEXT.test(name) && (DOC_NAMES.test(name) || DOC_EXTENSIONS.has(ext) || DOC_DIRS.test(path))) return 'docs';
  if (TEST_NAMES.some((re) => re.test(name)) || TEST_DIRS.some((re) => re.test(path))) {
    return SOURCE_EXTENSIONS.has(ext) || CONFIG_EXTENSIONS.has(ext) || ext === '' ? 'test' : 'ignored';
  }
  if (CONFIG_DIRS.test(path) || CONFIG_NAMES.has(name) || CONFIG_TEXT.test(name) || CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (name.startsWith('Dockerfile') || (name.startsWith('.') && !SOURCE_EXTENSIONS.has(ext))) return 'config';
  if (SOURCE_EXTENSIONS.has(ext)) return 'source';
  return 'ignored';
}

// ------------------------------------------------------------ comments

interface Block {
  open: string;
  close: string;
  /** Only opens when the line starts with it (docstrings, =begin). */
  startOnly?: boolean;
  /** A multi-line string literal rather than a comment: its inner lines are data. */
  data?: boolean;
  /** A JavaScript template literal, whose `${…}` may hold nested strings. */
  template?: boolean;
  /** A tagged template (html`…`, css`…`, sql`…`): its lines are code in another language. */
  tagged?: boolean;
}

interface Syntax {
  line: string[];
  blocks: Block[];
  /** Delimiters of string literals that may span lines (template literals, triple quotes, raw strings). */
  strings?: Block[];
}

const C_BLOCK: Block = { open: '/*', close: '*/' };
const HTML_BLOCK: Block = { open: '<!--', close: '-->' };
const BACKTICK: Block = { open: '`', close: '`', data: true, template: true };
const TAGGED_BACKTICK: Block = { ...BACKTICK, tagged: true };
const RAW_BACKTICK: Block = { open: '`', close: '`', data: true };
const TRIPLE_DOUBLE: Block = { open: '"""', close: '"""', data: true };
const TRIPLE_SINGLE: Block = { open: "'''", close: "'''", data: true };
const C_LIKE: Syntax = { line: ['//'], blocks: [C_BLOCK] };
const JS_LIKE: Syntax = { line: ['//'], blocks: [C_BLOCK], strings: [BACKTICK] };
const TEXT_BLOCKS: Syntax = { line: ['//'], blocks: [C_BLOCK], strings: [TRIPLE_DOUBLE] };
const HASH: Syntax = { line: ['#'], blocks: [] };

const SYNTAX: Record<string, Syntax> = {
  py: { line: ['#'], blocks: [{ open: '"""', close: '"""', startOnly: true }, { open: "'''", close: "'''", startOnly: true }], strings: [TRIPLE_DOUBLE, TRIPLE_SINGLE] },
  pyi: { line: ['#'], blocks: [{ open: '"""', close: '"""', startOnly: true }], strings: [TRIPLE_DOUBLE, TRIPLE_SINGLE] },
  ts: JS_LIKE, tsx: JS_LIKE, mts: JS_LIKE, cts: JS_LIKE, js: JS_LIKE, jsx: JS_LIKE, mjs: JS_LIKE, cjs: JS_LIKE,
  go: { line: ['//'], blocks: [C_BLOCK], strings: [RAW_BACKTICK] },
  java: TEXT_BLOCKS, kt: TEXT_BLOCKS, kts: TEXT_BLOCKS, scala: TEXT_BLOCKS, sc: TEXT_BLOCKS, swift: TEXT_BLOCKS, groovy: TEXT_BLOCKS,
  dart: { line: ['//'], blocks: [C_BLOCK], strings: [TRIPLE_DOUBLE, TRIPLE_SINGLE] },
  vhd: { line: ['--'], blocks: [] },
  vhdl: { line: ['--'], blocks: [] },
  m: { line: ['//', '%'], blocks: [C_BLOCK] },
  rb: { line: ['#'], blocks: [{ open: '=begin', close: '=end', startOnly: true }] },
  css: { line: [], blocks: [C_BLOCK] },
  scss: C_LIKE,
  sass: C_LIKE,
  less: C_LIKE,
  php: { line: ['//', '#'], blocks: [C_BLOCK] },
  html: { line: [], blocks: [HTML_BLOCK] },
  htm: { line: [], blocks: [HTML_BLOCK] },
  vue: { line: ['//'], blocks: [C_BLOCK, HTML_BLOCK], strings: [BACKTICK] },
  svelte: { line: ['//'], blocks: [C_BLOCK, HTML_BLOCK], strings: [BACKTICK] },
  astro: { line: ['//'], blocks: [C_BLOCK, HTML_BLOCK], strings: [BACKTICK] },
  lua: { line: ['--'], blocks: [{ open: '--[[', close: ']]' }] },
  sql: { line: ['--'], blocks: [C_BLOCK] },
  hs: { line: ['--'], blocks: [{ open: '{-', close: '-}' }] },
  elm: { line: ['--'], blocks: [{ open: '{-', close: '-}' }] },
  jl: { line: ['#'], blocks: [{ open: '#=', close: '=#' }], strings: [TRIPLE_DOUBLE] },
  ml: { line: [], blocks: [{ open: '(*', close: '*)' }] },
  mli: { line: [], blocks: [{ open: '(*', close: '*)' }] },
  fs: { line: ['//'], blocks: [{ open: '(*', close: '*)' }] },
  fsx: { line: ['//'], blocks: [{ open: '(*', close: '*)' }] },
  clj: { line: [';'], blocks: [] },
  cljs: { line: [';'], blocks: [] },
  cljc: { line: [';'], blocks: [] },
  el: { line: [';'], blocks: [] },
  lisp: { line: [';'], blocks: [{ open: '#|', close: '|#' }] },
  rkt: { line: [';'], blocks: [{ open: '#|', close: '|#' }] },
  erl: { line: ['%'], blocks: [] },
  hrl: { line: ['%'], blocks: [] },
  ps1: { line: ['#'], blocks: [{ open: '<#', close: '#>' }] },
  pl: { line: ['#'], blocks: [{ open: '=pod', close: '=cut', startOnly: true }] },
  pm: { line: ['#'], blocks: [{ open: '=pod', close: '=cut', startOnly: true }] },
  nim: { line: ['#'], blocks: [{ open: '#[', close: ']#' }] },
  sh: HASH, bash: HASH, zsh: HASH, fish: HASH, r: HASH, ex: HASH, exs: HASH, cr: HASH, gd: HASH,
  graphql: HASH, gql: HASH,
};

export function syntaxFor(path: string): Syntax {
  return SYNTAX[extension(basename(path))] ?? C_LIKE;
}

/** `data` is a line inside an untagged multi-line string literal: text, not code. */
type LineKind = 'code' | 'comment' | 'blank' | 'data';

/** Index of a delimiter not escaped by a backslash, or -1. */
function unescaped(t: string, d: string, from: number): number {
  for (let i = t.indexOf(d, from); i >= 0; i = t.indexOf(d, i + 1)) {
    let slashes = 0;
    for (let j = i - 1; j >= from && t[j] === '\\'; j--) slashes++;
    if (slashes % 2 === 0) return i;
  }
  return -1;
}

/** From inside a template literal at `i`, the index just past its closing backtick, or -1. */
function templateEnd(t: string, i: number): number {
  while (i < t.length) {
    const ch = t[i];
    if (ch === '\\') i += 2;
    else if (ch === '`') return i + 1;
    else if (ch === '$' && t[i + 1] === '{') {
      i = interpolationEnd(t, i + 2);
      if (i < 0) return -1;
    } else i++;
  }
  return -1;
}

/** From inside `${`, the index just past its closing brace, or -1. */
function interpolationEnd(t: string, i: number): number {
  let depth = 0;
  while (i < t.length) {
    const ch = t[i];
    if (ch === '`') {
      i = templateEnd(t, i + 1);
      if (i < 0) return -1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const close = unescaped(t, ch, i + 1);
      if (close < 0) return -1;
      i = close + 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && depth-- === 0) return i + 1;
    i++;
  }
  return -1;
}

/** Where the string `b`, entered at `i` (just past its opening delimiter), ends: just past its close, or -1. */
function stringEnd(t: string, b: Block, i: number): number {
  if (b.template) return templateEnd(t, i);
  const close = unescaped(t, b.close, i);
  return close < 0 ? -1 : close + b.close.length;
}

/** Scans code from `from` and opens a multi-line string if one is left unclosed at the end of the line. */
function openString(t: string, from: number, syntax: Syntax, state: { block: Block | null }): void {
  const strings = syntax.strings;
  if (!strings) return;
  let i = from;
  while (i < t.length) {
    const b = strings.find((s) => t.startsWith(s.open, i));
    if (b) {
      const start = i;
      i = stringEnd(t, b, i + b.open.length);
      if (i < 0) {
        state.block = b.template && /[A-Za-z_$][\w$.]*$/.test(t.slice(0, start)) ? TAGGED_BACKTICK : b;
        return;
      }
      continue;
    }
    if (syntax.line.some((m) => t.startsWith(m, i))) return;
    const ch = t[i];
    if (ch === '"' || ch === "'") {
      const close = unescaped(t, ch, i + 1);
      if (close < 0) return;
      i = close + 1;
      continue;
    }
    // A JavaScript regex literal may hold quotes and backticks of its own.
    if (ch === '/' && strings.some((s) => s.template) && /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(return|typeof|case|of|in))\s*$/.test(t.slice(0, i))) {
      const end = regexEnd(t, i + 1);
      if (end < 0) return;
      i = end;
      continue;
    }
    i++;
  }
}

/** From just inside a regex literal, the index just past its closing slash, or -1. */
function regexEnd(t: string, i: number): number {
  let inClass = false;
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') i++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
  }
  return -1;
}

/** Classifies one source line, updating the open block comment or multi-line string (if any). */
export function classifyLine(text: string, syntax: Syntax, state: { block: Block | null }): LineKind {
  const t = text.trim();
  if (state.block?.data) {
    // A tagged template's lines are code in another language (HTML, CSS, SQL); others are text.
    const kind = state.block.tagged ? (t === '' ? 'blank' : 'code') : 'data';
    const end = stringEnd(t, state.block, 0);
    if (end < 0) return kind;
    // The string ends here; what follows may open another.
    state.block = null;
    openString(t, end, syntax, state);
    return kind;
  }
  if (t === '') return 'blank';
  if (state.block) {
    const end = t.indexOf(state.block.close);
    if (end >= 0) state.block = null;
    return 'comment';
  }
  for (const marker of syntax.line) if (t.startsWith(marker) && !opensBlockAt(t, syntax, 0)) return 'comment';
  for (const b of syntax.blocks) {
    if (!t.startsWith(b.open)) continue;
    if (t.indexOf(b.close, b.open.length) < 0) state.block = b;
    return 'comment';
  }
  // A code line may open a block comment that continues on the following lines.
  for (const b of syntax.blocks) {
    if (b.startOnly) continue;
    const open = t.lastIndexOf(b.open);
    if (open > 0 && t.indexOf(b.close, open + b.open.length) < 0) state.block = b;
  }
  if (!state.block) openString(t, 0, syntax, state);
  return 'code';
}

function opensBlockAt(t: string, syntax: Syntax, at: number): boolean {
  return syntax.blocks.some((b) => t.startsWith(b.open, at) && b.open.length > 1);
}

// ------------------------------------------------------------ summary

const MINIFIED_AVERAGE = 110;
const GENERATED_MARKER = /@generated|DO NOT EDIT|auto-generated|autogenerated|Code generated by/i;
const HEADER_LINES = 5;

export interface PatchLines {
  added: string[];
  /** Added lines with their place in the new file, interleaved with context for comment tracking. */
  newFile: { text: string; added: boolean; hunk: number }[];
  removed: string[];
  /** Removed lines with their place in the old file, interleaved with context. */
  oldFile: { text: string; removed: boolean; hunk: number }[];
}

export function splitPatch(patch: string): PatchLines {
  const out: PatchLines = { added: [], newFile: [], removed: [], oldFile: [] };
  let hunk = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      hunk++;
      continue;
    }
    if (line.startsWith('\\')) continue;
    const mark = line[0];
    const text = line.slice(1);
    if (mark === '+') {
      out.added.push(text);
      out.newFile.push({ text, added: true, hunk });
    } else if (mark === '-') {
      out.removed.push(text);
      out.oldFile.push({ text, removed: true, hunk });
    } else {
      out.newFile.push({ text, added: false, hunk });
      out.oldFile.push({ text, removed: false, hunk });
    }
  }
  return out;
}

export function isGeneratedContent(category: FileCategory, ext: string, added: readonly string[]): boolean {
  if (added.slice(0, HEADER_LINES).some((l) => GENERATED_MARKER.test(l))) return true;
  if (category !== 'source' || added.length === 0) return false;
  if (!['js', 'mjs', 'cjs', 'css', 'ts', 'jsx', 'tsx', 'html'].includes(ext)) return false;
  const chars = added.reduce((n, l) => n + l.length, 0);
  return chars / added.length > MINIFIED_AVERAGE;
}

// ------------------------------------------------------------ complexity

export const MAX_BRANCHES = 10_000;
/** Lines of added code per branch point, when the patch is missing and we can only estimate. */
const LINES_PER_BRANCH = 12;

type Family = 'c' | 'python' | 'ruby' | 'shell' | 'none';

const FAMILY: Record<string, Family> = {
  py: 'python', pyi: 'python',
  rb: 'ruby', rake: 'ruby',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  css: 'none', scss: 'none', sass: 'none', less: 'none', html: 'none', htm: 'none', sql: 'none', md: 'none',
};

const BRANCH_PATTERNS: Record<Exclude<Family, 'none'>, RegExp[]> = {
  // `else if` already counts once through its `if`.
  c: [/\b(if|for|while|case|catch)\b/g, /&&|\|\|/g, /(?<![?.])\?(?![?.:])/g],
  python: [/\b(if|elif|for|while|except|and|or)\b/g],
  ruby: [/\b(if|elsif|unless|while|until|when|rescue|and|or)\b/g, /&&|\|\|/g],
  shell: [/\b(if|elif|for|while|case)\b/g, /&&|\|\|/g],
};

/** Drops string literals and trailing line comments so their words are not counted. */
function stripStrings(text: string, family: Family): string {
  let out = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
  const comment = family === 'c' ? out.indexOf('//') : family === 'none' ? -1 : out.indexOf('#');
  if (comment >= 0) out = out.slice(0, comment);
  return out;
}

export function branchesIn(text: string, path: string): number {
  const family = FAMILY[extension(basename(path))] ?? 'c';
  if (family === 'none') return 0;
  const code = stripStrings(text, family);
  let n = 0;
  for (const re of BRANCH_PATTERNS[family]) n += code.match(re)?.length ?? 0;
  // A Rust match arm (`pattern => value`) is a branch too.
  if (path.endsWith('.rs')) n += code.match(/=>/g)?.length ?? 0;
  return n;
}

const CATEGORY_CAT: Record<Exclude<FileCategory, 'source' | 'ignored'>, Cat> = {
  vendor: Cat.Vendor,
  generated: Cat.Generated,
  docs: Cat.Docs,
  test: Cat.Test,
  config: Cat.Config,
};

export function summarizeFiles(files: readonly ChangedFile[]): PushSummary {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const codeByLanguage = new Map<string, number>();
  let touched = 0;
  let branches = 0;
  for (const file of files) {
    let category = categorizePath(file.filename);
    if (category === 'ignored') continue;
    const ext = extension(basename(file.filename));
    const patch = file.patch ? splitPatch(file.patch) : null;
    if (patch && category !== 'vendor' && category !== 'generated' && isGeneratedContent(category, ext, patch.added)) category = 'generated';

    if (category !== 'source') {
      const cat = CATEGORY_CAT[category];
      if (!patch) {
        lines[cat]! += Math.max(0, file.additions);
        continue;
      }
      for (const text of patch.added) {
        if (text.trim() !== '') lines[cat]!++;
        else if (category === 'test') lines[Cat.Blank]!++;
      }
      continue;
    }

    let code = 0;
    let removed = 0;
    if (!patch) {
      code = Math.max(0, file.additions);
      removed = Math.max(0, file.deletions);
      branches += Math.floor(code / LINES_PER_BRANCH);
    } else {
      const syntax = syntaxFor(file.filename);
      const state: { block: Block | null } = { block: null };
      let hunk = -1;
      for (const l of patch.newFile) {
        if (l.hunk !== hunk) {
          hunk = l.hunk;
          state.block = null;
        }
        const kind = classifyLine(l.text, syntax, state);
        if (!l.added) continue;
        if (kind === 'code') {
          code++;
          branches += branchesIn(l.text, file.filename);
        } else if (kind === 'comment') lines[Cat.Comment]!++;
        else if (kind === 'blank') lines[Cat.Blank]!++;
      }
      for (const text of patch.removed) if (text.trim() !== '') removed++;
    }
    lines[Cat.Code]! += code;
    lines[Cat.Removed]! += removed;
    if (code > 0 || removed > 0) touched++;
    const language = languageOfPath(file.filename);
    if (language && code > 0) codeByLanguage.set(language, (codeByLanguage.get(language) ?? 0) + code);
  }
  let language: string | null = null;
  let best = 0;
  for (const [lang, n] of codeByLanguage) {
    if (n > best || (n === best && language !== null && lang < language)) {
      language = lang;
      best = n;
    }
  }
  return { lines, language, files: touched, branches: Math.min(MAX_BRANCHES, branches) };
}
