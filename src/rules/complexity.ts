// Complexity from real parsing (server side only).
//
// Three things are read from syntax trees built by tree-sitter:
//
// - decision points: if, loops, case arms, catch, ternaries, && and || (strings, comments and
//   identifiers that happen to be named `case` are not syntax, so they never count; a constant
//   condition such as `if (true)` is not a decision). These are read from each code line on its
//   own (`lineBranches`), set in the smallest context that completes it (`} else if (x) {` inside
//   an `if`, `case 1:` inside a switch), so a line's count is a function of its text alone and
//   any split of a history adds up to its squash, exactly as line keys do;
// - definitions (functions, methods, classes) that lie wholly on added lines, with the statement
//   lines in their bodies;
// - imports of local modules (relative paths, `crate::`, a package of this repository) on added
//   lines, with the imported names the file's added code actually uses.
//
// The last two need more than a line: a diff shows hunks, the added lines with up to three lines
// of context, and each hunk's new side is parsed as a fragment, relying on tree-sitter's error
// recovery, counting only nodes whose lines are all added (`analyzeFile`).
//
// The ledger (ledger.ts) turns these into credit on the counted line keys that carry them, so
// nothing here is paid for unless its line is. Grammars are WebAssembly, loaded lazily on first
// use (`loadGrammars`); parsing itself is synchronous. Unsupported languages, failed loads and
// pushes past the parse budget return null, and the ledger falls back to keyword counting.

import { createRequire } from 'node:module';
import type { Language as TsLanguage, Parser as TsParser } from 'web-tree-sitter';
import type { ChangedFile } from './classify.ts';

export type Grammar = 'javascript' | 'typescript' | 'tsx' | 'python' | 'go' | 'rust' | 'java' | 'kotlin' | 'ruby';

const GRAMMAR_BY_EXT: Record<string, Grammar> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  py: 'python', pyi: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', rb: 'ruby', rake: 'ruby',
};

const WASM: Record<Grammar, string> = {
  javascript: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  go: 'tree-sitter-go/tree-sitter-go.wasm',
  rust: 'tree-sitter-rust/tree-sitter-rust.wasm',
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  kotlin: '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
  ruby: 'tree-sitter-ruby/tree-sitter-ruby.wasm',
};

export function grammarOf(path: string): Grammar | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? null : GRAMMAR_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? null;
}

// ------------------------------------------------------------ loading

let runtime: Promise<typeof import('web-tree-sitter') | null> | null = null;
const loading = new Map<Grammar, Promise<void>>();
const parsers = new Map<Grammar, TsParser>();
const failed = new Set<Grammar>();

function init(): Promise<typeof import('web-tree-sitter') | null> {
  runtime ??= (async () => {
    try {
      const mod = await import('web-tree-sitter');
      await mod.Parser.init();
      return mod;
    } catch {
      return null;
    }
  })();
  return runtime;
}

/** Loads (once) the grammars a push's files need. Never throws: a grammar that fails to load falls back to keywords. */
export async function loadGrammars(files: readonly Pick<ChangedFile, 'filename'>[]): Promise<void> {
  const wanted = new Set<Grammar>();
  for (const f of files) {
    const g = grammarOf(f.filename);
    if (g && !parsers.has(g) && !failed.has(g)) wanted.add(g);
  }
  await Promise.all([...wanted].map(loadGrammar));
}

/** Loads every supported grammar (tests and scripts). */
export async function loadAllGrammars(): Promise<void> {
  await Promise.all((Object.keys(WASM) as Grammar[]).map(loadGrammar));
}

function loadGrammar(g: Grammar): Promise<void> {
  let p = loading.get(g);
  if (!p) {
    p = (async () => {
      const mod = await init();
      if (!mod) return void failed.add(g);
      try {
        const path = createRequire(import.meta.url).resolve(WASM[g]);
        const language: TsLanguage = await mod.Language.load(path);
        const parser = new mod.Parser();
        parser.setLanguage(language);
        parsers.set(g, parser);
      } catch {
        failed.add(g);
      }
    })();
    loading.set(g, p);
  }
  return p;
}

export function grammarReady(g: Grammar): boolean {
  return parsers.has(g);
}

// ------------------------------------------------------------ budget

/**
 * Bytes of text one push may parse, hunks and lines together (charged whether or not a line's
 * count is cached, so a push measures the same in any process); the rest falls back to keywords.
 * About a second of parsing at worst; this repository's largest commit of the last 80 uses a third.
 */
export const PARSE_BYTES_PER_PUSH = 1_000_000;
/** Milliseconds one file may spend parsing before it falls back to keywords. */
export const PARSE_MS_PER_FILE = 250;

export interface ParseBudget {
  bytes: number;
}

export function parseBudget(): ParseBudget {
  return { bytes: PARSE_BYTES_PER_PUSH };
}

// ------------------------------------------------------------ results

export interface ImportFact {
  /** Index (into the file's new-side lines) of the import's first line. */
  row: number;
  /** The imported module, resolved to a repository path where it can be. */
  module: string;
  /** Distinct imported names the file's added code references (at most LINK_NAMES_PER_IMPORT). */
  used: number;
}

export interface FileFacts {
  /** Definitions wholly on added lines: the new-side line index of each one's first line, and of the statements in its body. */
  functions: { header: number; rows: number[] }[];
  imports: ImportFact[];
}

/** Imported names counted per import: half a point each, so at most 3 points. */
export const LINK_NAMES_PER_IMPORT = 6;
/** Statement lines a definition's body needs to count as a function. */
export const FUNCTION_STATEMENTS = 3;

// ------------------------------------------------------------ the tree, flattened

interface N {
  type: string;
  named: boolean;
  field: string | null;
  sr: number;
  er: number;
  si: number;
  ei: number;
  bad: boolean;
  /** Whether this node or anything inside it is an error or a missing token. */
  hasErr: boolean;
  kids: N[];
  parent: N | null;
}

/** Per language, node type and field names by id, so walking a tree passes numbers, not strings, out of WebAssembly. */
const names = new Map<TsLanguage, { types: (string | null)[]; fields: (string | null)[] }>();

function namesOf(lang: TsLanguage): { types: (string | null)[]; fields: (string | null)[] } {
  let n = names.get(lang);
  if (!n) {
    n = { types: [], fields: [] };
    for (let i = 0; i < lang.nodeTypeCount; i++) n.types.push(lang.nodeTypeForId(i));
    for (let i = 0; i <= lang.fieldCount; i++) n.fields.push(lang.fieldNameForId(i));
    names.set(lang, n);
  }
  return n;
}

/** The tree as plain objects, with each node's first and last line found from its offsets. */
function flatten(tree: import('web-tree-sitter').Tree, text: string, lang: TsLanguage): { root: N; errors: number } {
  const { types, fields } = namesOf(lang);
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const rowOf = (at: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const c = tree.rootNode.walk();
  let errors = 0;
  const make = (parent: N | null): N => {
    const id = c.nodeTypeId;
    const type = types[id] ?? c.nodeType;
    const bad = type === 'ERROR' || c.nodeIsMissing;
    if (bad) errors++;
    const si = c.startIndex;
    const ei = c.endIndex;
    const f = c.currentFieldId;
    return { type, named: c.nodeIsNamed, field: f > 0 ? fields[f] ?? null : null, sr: rowOf(si), er: rowOf(Math.max(si, ei - 1)), si, ei, bad, hasErr: bad, kids: [], parent };
  };
  const root = make(null);
  const stack: N[] = [root];
  // Depth-first over the cursor, building the tree as we go.
  if (c.gotoFirstChild()) {
    for (;;) {
      const node = make(stack[stack.length - 1]!);
      stack[stack.length - 1]!.kids.push(node);
      if (c.gotoFirstChild()) {
        stack.push(node);
        continue;
      }
      while (!c.gotoNextSibling()) {
        if (!c.gotoParent() || stack.length === 1) {
          c.delete();
          finishErrors(root);
          return { root, errors };
        }
        stack.pop();
      }
    }
  }
  c.delete();
  return { root, errors };
}

function finishErrors(n: N): boolean {
  let e = n.bad;
  for (const k of n.kids) if (finishErrors(k)) e = true;
  n.hasErr = e;
  return e;
}

// ------------------------------------------------------------ per-language syntax

interface Spec {
  /** Nodes that are a decision at their first line. */
  decisions: Set<string>;
  /** Binary operator nodes: a decision when their operator is one of `logical`. */
  binary: Set<string>;
  logical: Set<string>;
  /** Conditional expressions whose decision token is an anonymous child (`?`, `if`). */
  conditional: Record<string, string>;
  /** Function, method and class definitions. */
  definitions: Set<string>;
  /** Nodes whose named children are statements. */
  containers: Set<string>;
  /** Declarations that are not statements (fields without a value, signatures). */
  notStatements: Set<string>;
  /** Member access: object, then property. */
  members: Set<string>;
  /** Decision keywords that mean a decision wherever error recovery leaves them. */
  keywords: Set<string>;
  /** The smallest code around a lone line that completes it: [lines before, lines after]. */
  around: (line: string) => [string, string];
}

const LITERAL = /^(true|false|null|nil|none|undefined|number|integer|float|string|.*_literal|boolean|char|interpreted_string_literal|raw_string_literal)$/;

const s = (...xs: string[]) => new Set(xs);

const JS: Spec = {
  decisions: s('if_statement', 'for_statement', 'for_in_statement', 'while_statement', 'do_statement', 'switch_case', 'catch_clause'),
  binary: s('binary_expression'),
  logical: s('&&', '||'),
  conditional: { ternary_expression: '?' },
  definitions: s('function_declaration', 'generator_function_declaration', 'function_expression', 'function', 'generator_function', 'arrow_function', 'method_definition', 'class_declaration', 'class', 'abstract_class_declaration'),
  containers: s('statement_block', 'class_body', 'switch_case', 'switch_default'),
  notStatements: s('field_definition', 'public_field_definition', 'method_signature', 'abstract_method_signature', 'property_signature', 'index_signature', 'comment', 'empty_statement'),
  members: s('member_expression', 'nested_type_identifier'),
  keywords: s('if', 'for', 'while', 'case', 'catch', '&&', '||'),
  around: (t) => braces(t, { switch: 'switch (_) {', open: (x) => (/^\}\s*(catch|finally)\b/.test(x) ? 'try {' : 'if (_) {') }),
};

/**
 * The context a lone C-family line needs: a block for a line that closes one (`} else if (x) {`),
 * a closing brace for a line that opens one, a switch around a `case`.
 */
function braces(t: string, o: { switch: string; open: (t: string) => string; arm?: string; func?: boolean }): [string, string] {
  const before: string[] = o.func ? ['func _() {'] : [];
  const after: string[] = [];
  if (/^(case\b|default\b)/.test(t)) {
    before.push(o.switch);
    after.push('}');
  } else if (o.arm && /=>|->/.test(t) && !/^(fn|let|val|var|fun|if|for|while|return)\b/.test(t) && !/\{\s*[\w, ]*->/.test(t)) {
    before.push(o.arm);
    after.push('}');
  }
  if (t.startsWith('}')) before.push(o.open(t));
  if (t.endsWith('{')) after.unshift('}');
  if (o.func) after.push('}');
  return [before.join('\n'), after.join('\n')];
}

const SPECS: Record<Grammar, Spec> = {
  javascript: JS,
  typescript: JS,
  tsx: JS,
  python: {
    decisions: s('if_statement', 'elif_clause', 'for_statement', 'while_statement', 'except_clause', 'case_clause', 'for_in_clause', 'if_clause'),
    binary: s('boolean_operator'),
    logical: s('and', 'or'),
    conditional: { conditional_expression: 'if' },
    definitions: s('function_definition', 'class_definition'),
    containers: s('block'),
    notStatements: s('comment', 'pass_statement'),
    members: s('attribute'),
    keywords: s('if', 'elif', 'for', 'while', 'except', 'and', 'or'),
    around: (t) => {
      const before = /^(elif|else)\b/.test(t) ? 'if _:\n    pass' : /^(except|finally)\b/.test(t) ? 'try:\n    pass' : /^case\b/.test(t) ? 'match _:' : '';
      const body = /^case\b/.test(t) ? '        pass' : '    pass';
      return [before, t.endsWith(':') ? body : ''];
    },
  },
  go: {
    decisions: s('if_statement', 'for_statement', 'expression_case', 'type_case', 'communication_case'),
    binary: s('binary_expression'),
    logical: s('&&', '||'),
    conditional: {},
    definitions: s('function_declaration', 'method_declaration', 'func_literal'),
    containers: s('block', 'statement_list', 'expression_case', 'type_case', 'communication_case', 'default_case'),
    notStatements: s('comment', 'empty_statement', 'statement_list'),
    members: s('selector_expression', 'qualified_type'),
    keywords: s('if', 'for', 'case', '&&', '||'),
    around: (t) => braces(t, { switch: 'switch _ {', open: () => 'if _ {', func: true }),
  },
  rust: {
    decisions: s('if_expression', 'while_expression', 'for_expression', 'match_arm'),
    binary: s('binary_expression'),
    logical: s('&&', '||'),
    conditional: {},
    definitions: s('function_item', 'closure_expression', 'impl_item', 'trait_item'),
    containers: s('block', 'declaration_list'),
    notStatements: s('line_comment', 'block_comment', 'empty_statement', 'attribute_item', 'function_signature_item'),
    members: s('field_expression', 'scoped_identifier', 'scoped_type_identifier'),
    keywords: s('if', 'while', 'for', '&&', '||'),
    around: (t) => braces(t, { switch: 'match _ {', open: () => 'if _ {', arm: 'match _ {' }),
  },
  java: {
    decisions: s('if_statement', 'for_statement', 'enhanced_for_statement', 'while_statement', 'do_statement', 'switch_label', 'catch_clause'),
    binary: s('binary_expression'),
    logical: s('&&', '||'),
    conditional: { ternary_expression: '?' },
    definitions: s('method_declaration', 'constructor_declaration', 'class_declaration', 'enum_declaration', 'record_declaration', 'interface_declaration', 'lambda_expression'),
    containers: s('block', 'class_body', 'constructor_body', 'switch_block_statement_group', 'enum_body_declarations', 'interface_body'),
    notStatements: s('line_comment', 'block_comment', 'field_declaration', 'constant_declaration', 'switch_label'),
    members: s('field_access', 'method_invocation', 'scoped_type_identifier'),
    keywords: s('if', 'for', 'while', 'case', 'catch', '&&', '||'),
    around: (t) => braces(t, { switch: 'switch (_) {', open: (x) => (/^\}\s*(catch|finally)\b/.test(x) ? 'try {' : 'if (_) {') }),
  },
  kotlin: {
    decisions: s('for_statement', 'while_statement', 'do_while_statement', 'when_entry', 'catch_block', 'if_expression'),
    binary: s('binary_expression'),
    logical: s('&&', '||'),
    conditional: {},
    definitions: s('function_declaration', 'class_declaration', 'object_declaration', 'anonymous_function', 'lambda_literal', 'secondary_constructor'),
    containers: s('block', 'class_body', 'lambda_literal', 'statements', 'enum_class_body'),
    notStatements: s('line_comment', 'block_comment', 'multiline_comment', 'lambda_parameters'),
    members: s('navigation_expression'),
    keywords: s('if', 'for', 'while', 'catch', '&&', '||'),
    around: (t) => braces(t, { switch: 'when (_) {', open: (x) => (/^\}\s*(catch|finally)\b/.test(x) ? 'try {' : 'if (_) {'), arm: 'when (_) {' }),
  },
  ruby: {
    decisions: s('if', 'elsif', 'unless', 'while', 'until', 'for', 'when', 'rescue', 'if_modifier', 'unless_modifier', 'while_modifier', 'until_modifier', 'rescue_modifier'),
    binary: s('binary'),
    logical: s('&&', '||', 'and', 'or'),
    conditional: { conditional: '?' },
    definitions: s('method', 'singleton_method', 'class', 'module', 'do_block', 'block', 'lambda'),
    containers: s('body_statement', 'block_body', 'then', 'else', 'do', 'begin', 'ensure'),
    notStatements: s('comment'),
    members: s('call', 'scope_resolution'),
    keywords: s('if', 'elsif', 'unless', 'while', 'until', 'for', 'when', 'rescue', '&&', '||', 'and', 'or'),
    around: (t) => {
      const before = /^(elsif|else)\b/.test(t) ? 'if _' : /^(when|in)\b/.test(t) ? 'case _' : /^(rescue|ensure)\b/.test(t) ? 'begin' : '';
      const opens = before !== '' || /^(if|unless|while|until|case|for|begin|def|class|module)\b/.test(t) || /\bdo(\s*\|[^|]*\|)?$/.test(t);
      return [before, opens && !/\bend$/.test(t) ? 'end' : ''];
    },
  },
};

const IDENTIFIERS = s('identifier', 'type_identifier', 'property_identifier', 'shorthand_property_identifier', 'constant', 'package_identifier', 'field_identifier', 'simple_identifier');

// ------------------------------------------------------------ fragments

interface Fragment {
  text: string;
  /** Lines of wrapper code before the fragment's first line. */
  offset: number;
}

/** Ways to read a hunk: as it is, and wrapped in the declaration it most likely sits inside. */
function variants(g: Grammar, text: string): Fragment[] {
  const plain = { text, offset: 0 };
  switch (g) {
    case 'go':
      return [plain, { text: `func _() {\n${text}\n}`, offset: 1 }];
    case 'java':
      return [plain, { text: `class _ {\n${text}\n}`, offset: 1 }, { text: `class _ { void _() {\n${text}\n}}`, offset: 1 }];
    case 'kotlin':
      return [plain, { text: `class _ {\n${text}\n}`, offset: 1 }];
    case 'rust':
      return [plain, { text: `impl _ {\n${text}\n}`, offset: 1 }];
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return METHOD_HEADER.test(text) ? [plain, { text: `class _ {\n${text}\n}`, offset: 1 }] : [plain];
    default:
      return [plain];
  }
}

/** A line that opens a class member (`  async load(id: string): Promise<void> {`), which parses as a call outside a class. */
const METHOD_HEADER = /^[ \t]*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*(?!(?:if|for|while|switch|catch|function|return|with)\b)[A-Za-z_$#][\w$]*\s*(?:<[^>\n]*>)?\([^)\n]*\)\s*(?::\s*[^{=\n]+)?\{\s*$/m;

interface Parsed {
  root: N;
  text: string;
  offset: number;
  errors: number;
  definitions: number;
}

function parseBest(parser: TsParser, g: Grammar, text: string, deadline: number): Parsed | null {
  let best: Parsed | null = null;
  for (const v of variants(g, text)) {
    if (performance.now() > deadline) return null;
    let tree: ReturnType<TsParser['parse']>;
    try {
      tree = parser.parse(v.text, null, { progressCallback: (() => performance.now() > deadline) as unknown as () => void });
    } catch {
      return null;
    }
    if (!tree) return null;
    let flat: ReturnType<typeof flatten>;
    try {
      flat = flatten(tree, v.text, parser.language!);
    } finally {
      tree.delete();
    }
    const { root, errors } = flat;
    let definitions = 0;
    const count = (n: N) => {
      if (SPECS[g].definitions.has(n.type) && !n.hasErr) definitions++;
      for (const k of n.kids) count(k);
    };
    count(root);
    const p = { root, text: v.text, offset: v.offset, errors, definitions };
    if (!best || p.errors < best.errors || (p.errors === best.errors && p.definitions > best.definitions)) best = p;
    if (best.errors === 0 && g !== 'javascript' && g !== 'typescript' && g !== 'tsx') break;
  }
  return best;
}

// ------------------------------------------------------------ reading a file

export interface NewSideLine {
  text: string;
  added: boolean;
  hunk: number;
}

/**
 * Parses each hunk of a file's new side and reads its complexity, or returns null when the
 * language is unsupported, its grammar is not loaded, the push's parse budget is spent or the
 * file takes too long: the caller then counts keywords instead.
 */
export function analyzeFile(path: string, newFile: readonly NewSideLine[], budget: ParseBudget): FileFacts | null {
  try {
    return readFile(path, newFile, budget);
  } catch {
    // A tree too deep to walk (a pathological line): count keywords instead.
    return null;
  }
}

function readFile(path: string, newFile: readonly NewSideLine[], budget: ParseBudget): FileFacts | null {
  const g = grammarOf(path);
  if (!g) return null;
  const parser = parsers.get(g);
  if (!parser) return null;
  const spec = SPECS[g];
  const facts: FileFacts = { functions: [], imports: [] };
  const deadline = performance.now() + PARSE_MS_PER_FILE;
  const imports: { row: number; module: string; names: Binding[] }[] = [];
  const uses = new Set<string>();
  // A definition or an import that counts starts on an added line, so a hunk whose added lines
  // hold neither is not parsed, unless the file imports something its lines might use.
  const shapes = MAY_DEFINE[g];
  const importing = newFile.some((l) => l.added && shapes.imports.test(l.text));
  let start = 0;
  while (start < newFile.length) {
    let end = start;
    while (end < newFile.length && newFile[end]!.hunk === newFile[start]!.hunk) end++;
    const lines = newFile.slice(start, end);
    if (lines.some((l) => l.added && (importing || shapes.defines.test(l.text) || shapes.imports.test(l.text)))) {
      const text = lines.map((l) => l.text).join('\n');
      budget.bytes -= text.length;
      if (budget.bytes < 0) return null;
      const parsed = parseBest(parser, g, text, deadline);
      if (!parsed) return null;
      const added = (row: number) => {
        const i = row - parsed.offset;
        return i >= 0 && i < lines.length && lines[i]!.added;
      };
      const at = (row: number) => start + row - parsed.offset;
      readDefinitions(parsed.root, spec, added, (header, rows) => facts.functions.push({ header: at(header), rows: rows.map(at) }));
      readImports(parsed.root, g, parsed.text, path, added, (row, module, names) => imports.push({ row: at(row), module, names }));
      readUses(parsed.root, spec, parsed.text, added, uses);
    }
    start = end;
  }
  for (const imp of imports) {
    let used = 0;
    for (const b of imp.names) {
      if (b.members) {
        // A namespace (`* as api`, a Go package, `from . import store`): each member it is used for is a name.
        let m = 0;
        for (const u of uses) if (u.startsWith(`${b.local}.`)) m++;
        used += m > 0 ? m : uses.has(b.local) ? 1 : 0;
      } else if (uses.has(b.local)) used++;
    }
    facts.imports.push({ row: imp.row, module: imp.module, used: Math.min(LINK_NAMES_PER_IMPORT, used) });
  }
  return facts;
}

/** Lines that may open a definition, or hold an import, per language: a cheap test before parsing a hunk. */
const MAY_DEFINE: Record<Grammar, { defines: RegExp; imports: RegExp }> = (() => {
  const js = { defines: /\b(function|class)\b|=>|\)\s*(:[^{=]*)?\{\s*$/, imports: /\bimport\b/ };
  return {
    javascript: js,
    typescript: js,
    tsx: js,
    python: { defines: /\b(def|class)\b/, imports: /\bfrom\s+\./ },
    go: { defines: /\bfunc\b/, imports: /\bimport\b|^\s*(\w+\s+)?"[^"\s]+\/[^"\s]+"\s*$/ },
    rust: { defines: /\b(fn|impl|trait)\b|\|[^|]*\|/, imports: /\buse\b/ },
    java: { defines: /\b(class|interface|enum|record)\b|->|\)\s*(throws\s+[\w., ]+)?\{\s*$/, imports: /\bimport\b/ },
    kotlin: { defines: /\b(fun|class|object|constructor)\b|->|\{\s*$/, imports: /\bimport\b/ },
    ruby: { defines: /\b(def|class|module|do|lambda|proc)\b|\{\s*\|/, imports: /\brequire_relative\b/ },
  };
})();

// ------------------------------------------------------------ one line's decisions

const lineCache = new Map<string, number>();
/** Some token every decision of every supported language carries. */
const DECISION_TOKEN = /\b(if|for|while|case|catch|elif|except|when|rescue|unless|until|elsif|and|or)\b|&&|\|\||\?|=>|->/;
const LINE_CACHE_MAX = 200_000;
/** Lines longer than this are not parsed alone (minified code, data): keywords count instead. */
const LINE_PARSE_MAX = 1000;

/**
 * Decision points on one line of code, read from its syntax tree with the line set in the smallest
 * context that completes it; null when the grammar is not loaded or the line cannot be parsed. A
 * function of the line's text alone, so the ledger can key it like the line itself.
 */
export function lineBranches(path: string, text: string, budget?: ParseBudget): number | null {
  const g = grammarOf(path);
  if (!g) return null;
  const parser = parsers.get(g);
  if (!parser) return null;
  const t = text.trim();
  if (t.length > LINE_PARSE_MAX) return null;
  // Every decision has a token on its line; a line with none of them decides nothing.
  if (!DECISION_TOKEN.test(t)) return 0;
  if (budget) {
    budget.bytes -= t.length;
    if (budget.bytes < 0) return null;
  }
  const key = `${g}\u0000${t}`;
  const known = lineCache.get(key);
  if (known !== undefined) return known;
  const spec = SPECS[g];
  const [before, after] = spec.around(t);
  const head = before === '' ? 0 : before.split('\n').length;
  // Python's `case` sits one level inside its `match`.
  const line = g === 'python' && /^case\b/.test(t) ? `    ${t}` : t;
  const source = [before, line, after].filter((x, i) => i === 1 || x !== '').join('\n');
  let tree: ReturnType<TsParser['parse']>;
  try {
    tree = parser.parse(source);
  } catch {
    return null;
  }
  if (!tree) return null;
  let n = 0;
  try {
    const { root } = flatten(tree, source, parser.language!);
    readDecisions(root, spec, (row) => row === head, () => n++);
  } catch {
    return null;
  } finally {
    tree.delete();
  }
  if (lineCache.size >= LINE_CACHE_MAX) lineCache.clear();
  lineCache.set(key, n);
  return n;
}

/** Arms of a switch, match or when, whose `condition` is the value they match. */
const CASE_ARMS = s('when_entry', 'switch_case', 'switch_label', 'case_clause', 'expression_case', 'type_case', 'communication_case', 'match_arm', 'when');

const strip = (n: N): N => {
  while ((n.type === 'parenthesized_expression' || n.type === 'parenthesized_statements' || n.type === 'condition_clause') && n.kids.some((k) => k.named)) n = n.kids.find((k) => k.named)!;
  return n;
};
const isLiteral = (n: N | undefined): boolean => !!n && LITERAL.test(strip(n).type);

function readDecisions(n: N, spec: Spec, added: (row: number) => boolean, hit: (row: number) => void): void {
  if (n.type === 'ERROR') {
    // Error recovery still lexes keywords as keywords: count the unambiguous ones it holds.
    for (const k of n.kids) if (!k.named && spec.keywords.has(k.type) && added(k.sr)) hit(k.sr);
  } else if (!n.bad && n.named) {
    let row = -1;
    if (spec.decisions.has(n.type)) {
      const cond = n.kids.find((k) => k.field === 'condition');
      if (n.type === 'switch_label' && !n.kids.some((k) => k.named)) row = -1; // `default:`
      else if (n.type === 'when_entry' && n.kids[0]?.type === 'else') row = -1;
      else if (n.type === 'match_arm' && n.kids.find((k) => k.field === 'pattern')?.kids.every((k) => k.type === '_')) row = -1; // `_ =>`
      else if (cond && isLiteral(cond) && !CASE_ARMS.has(n.type)) row = -1; // `if (true)`, `while (1)`; a case arm's literal is its pattern
      else row = n.sr;
    } else if (spec.binary.has(n.type)) {
      const op = n.kids.find((k) => k.field === 'operator') ?? n.kids.find((k) => !k.named && spec.logical.has(k.type));
      const named = n.kids.filter((k) => k.named);
      if (op && spec.logical.has(op.type) && !named.some((k) => isLiteral(k))) row = op.sr;
    } else if (spec.conditional[n.type]) {
      const tok = n.kids.find((k) => !k.named && k.type === spec.conditional[n.type]);
      const cond = n.kids.find((k) => k.field === 'condition');
      if (tok && !(cond && isLiteral(cond))) row = tok.sr;
    }
    if (row >= 0 && added(row)) hit(row);
  }
  for (const k of n.kids) readDecisions(k, spec, added, hit);
}

/** Collects definitions wholly on added lines whose bodies hold at least FUNCTION_STATEMENTS statement lines. */
function readDefinitions(root: N, spec: Spec, added: (row: number) => boolean, emit: (header: number, rows: number[]) => void): void {
  const allAdded = (n: N) => {
    for (let r = n.sr; r <= n.er; r++) if (!added(r)) return false;
    return true;
  };
  // Statement lines not already inside a counted definition, bottom up.
  const walk = (n: N): Set<number> => {
    const rows = new Set<number>();
    for (const k of n.kids) for (const r of walk(k)) rows.add(r);
    if (spec.definitions.has(n.type) && !n.hasErr && allAdded(n)) {
      if (rows.size >= FUNCTION_STATEMENTS) {
        emit(n.sr, [...rows].sort((a, b) => a - b));
        return new Set();
      }
    }
    if (n.named && !n.bad && n.parent && spec.containers.has(n.parent.type) && !spec.notStatements.has(n.type) && !/comment/.test(n.type)) {
      // A switch case's own label is not a statement in it.
      if (!(n.field === 'value' && (n.parent.type === 'switch_case' || n.parent.type === 'expression_case'))) rows.add(n.sr);
    }
    return rows;
  };
  walk(root);
}

interface Binding {
  local: string;
  /** A namespace: what counts is the members used through it. */
  members: boolean;
}

function textOf(text: string, n: N): string {
  return text.slice(n.si, n.ei);
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Joins and normalizes a POSIX path, dropping a source extension and a trailing /index. */
function joinPath(base: string, rel: string): string {
  const out: string[] = [];
  for (const part of `${base}/${rel}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/').replace(/\.(m|c)?[jt]sx?$/, '').replace(/\/index$/, '');
}

function readImports(root: N, g: Grammar, text: string, path: string, added: (row: number) => boolean, emit: (row: number, module: string, names: Binding[]) => void): void {
  const whole = (n: N) => {
    for (let r = n.sr; r <= n.er; r++) if (!added(r)) return false;
    return !n.hasErr;
  };
  const visit = (n: N) => {
    if (isImport(g, n) && whole(n)) {
      const found = readImport(g, n, text, path);
      if (found) emit(n.sr, found.module, found.names);
      return;
    }
    for (const k of n.kids) visit(k);
  };
  visit(root);
}

function isImport(g: Grammar, n: N): boolean {
  switch (g) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return n.type === 'import_statement';
    case 'python':
      return n.type === 'import_from_statement';
    case 'go':
      return n.type === 'import_spec';
    case 'rust':
      return n.type === 'use_declaration';
    case 'java':
      return n.type === 'import_declaration';
    case 'kotlin':
      return n.type === 'import';
    case 'ruby':
      return n.type === 'call';
  }
}

function readImport(g: Grammar, n: N, text: string, path: string): { module: string; names: Binding[] } | null {
  const named = n.kids.filter((k) => k.named);
  switch (g) {
    case 'javascript':
    case 'typescript':
    case 'tsx': {
      const source = n.kids.find((k) => k.field === 'source');
      if (!source) return null;
      const spec = textOf(text, source).slice(1, -1);
      // Only relative paths are this repository's own modules; bare names are packages.
      if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
      const names: Binding[] = [];
      const clause = n.kids.find((k) => k.type === 'import_clause');
      for (const k of clause?.kids ?? []) {
        if (k.type === 'identifier') names.push({ local: textOf(text, k), members: false });
        else if (k.type === 'namespace_import') {
          const id = k.kids.find((x) => x.type === 'identifier');
          if (id) names.push({ local: textOf(text, id), members: true });
        } else if (k.type === 'named_imports') {
          for (const sp of k.kids.filter((x) => x.type === 'import_specifier')) {
            const id = sp.kids.find((x) => x.field === 'alias') ?? sp.kids.find((x) => x.field === 'name');
            if (id) names.push({ local: textOf(text, id), members: false });
          }
        }
      }
      return { module: joinPath(dirOf(path), spec), names };
    }
    case 'python': {
      const mod = n.kids.find((k) => k.field === 'module_name');
      if (!mod || mod.type !== 'relative_import') return null;
      const prefix = mod.kids.find((k) => k.type === 'import_prefix');
      const dots = prefix ? textOf(text, prefix).length : 0;
      const dotted = mod.kids.find((k) => k.type === 'dotted_name');
      let base = dirOf(path);
      for (let i = 1; i < dots; i++) base = dirOf(base);
      const module = joinPath(base, dotted ? textOf(text, dotted).replace(/\./g, '/') : '');
      const names: Binding[] = [];
      for (const k of n.kids.filter((x) => x.field === 'name')) {
        const id = k.type === 'aliased_import' ? k.kids.find((x) => x.field === 'alias') : k;
        // `from . import store` brings in a module, used through its members.
        if (id) names.push({ local: textOf(text, id), members: !dotted });
      }
      return { module, names };
    }
    case 'go': {
      const p = n.kids.find((k) => k.field === 'path');
      if (!p) return null;
      const spec = textOf(text, p).slice(1, -1);
      const parts = spec.split('/');
      // A Go module path starts with a host; standard library packages have no dot in their first segment.
      if (!parts[0]!.includes('.') || parts.length < 3) return null;
      const top = path.split('/')[0];
      const local = parts.slice(2).includes('internal') || (top !== undefined && path.includes('/') && parts.slice(3).includes(top));
      if (!local) return null;
      const alias = n.kids.find((k) => k.field === 'name');
      if (alias && (textOf(text, alias) === '_' || textOf(text, alias) === '.')) return null;
      return { module: spec, names: [{ local: alias ? textOf(text, alias) : parts[parts.length - 1]!, members: true }] };
    }
    case 'rust': {
      const arg = n.kids.find((k) => k.field === 'argument');
      if (!arg) return null;
      const full = textOf(text, arg);
      if (!/^(crate|super|self)::/.test(full)) return null;
      const names: Binding[] = [];
      let module = full;
      const leaf = (k: N) => {
        if (k.type === 'identifier' || k.type === 'type_identifier') names.push({ local: textOf(text, k), members: false });
        else if (k.type === 'use_as_clause') {
          const a = k.kids.find((x) => x.field === 'alias');
          if (a) names.push({ local: textOf(text, a), members: false });
        } else if (k.type === 'scoped_identifier') {
          const nm = k.kids.find((x) => x.field === 'name');
          if (nm) names.push({ local: textOf(text, nm), members: false });
        }
      };
      if (arg.type === 'scoped_use_list') {
        const p = arg.kids.find((k) => k.field === 'path');
        module = p ? textOf(text, p) : full;
        for (const k of arg.kids.find((x) => x.field === 'list')?.kids ?? []) leaf(k);
      } else if (arg.type === 'scoped_identifier') {
        const p = arg.kids.find((k) => k.field === 'path');
        module = p ? textOf(text, p) : full;
        leaf(arg);
      } else if (arg.type === 'use_as_clause') {
        const p = arg.kids.find((k) => k.field === 'path');
        module = p ? textOf(text, p).replace(/::[^:]+$/, '') : full;
        leaf(arg);
      } else return null;
      module = module.replace(/^super::/, `${dirOf(dirOf(path))}/`).replace(/^self::/, `${dirOf(path)}/`).replace(/::/g, '/');
      return { module, names };
    }
    case 'java':
    case 'kotlin': {
      if (n.kids.some((k) => !k.named && k.type === '*') || /\.\*\s*;?\s*$/.test(textOf(text, n))) return null;
      const q = named.find((k) => k.type === 'scoped_identifier' || k.type === 'qualified_identifier' || k.type === 'identifier');
      if (!q) return null;
      const parts = textOf(text, q).split('.');
      if (parts.length < 3) return null;
      // This repository's own package: the file sits under a directory path spelling its first two segments.
      if (!`/${path}`.includes(`/${parts[0]}/${parts[1]}/`)) return null;
      const alias = g === 'kotlin' ? named.find((k) => k !== q && k.type === 'identifier') : undefined;
      const isStatic = n.kids.some((k) => !k.named && k.type === 'static');
      const module = (isStatic ? parts.slice(0, -1) : parts).join('/');
      return { module, names: [{ local: alias ? textOf(text, alias) : parts[parts.length - 1]!, members: false }] };
    }
    case 'ruby': {
      const method = n.kids.find((k) => k.field === 'method');
      if (!method || textOf(text, method) !== 'require_relative' || n.kids.some((k) => k.field === 'receiver')) return null;
      const arg = n.kids.find((k) => k.field === 'arguments')?.kids.find((k) => k.type === 'string');
      if (!arg) return null;
      const rel = textOf(text, arg).slice(1, -1);
      // Ruby binds no names: the constant the file is named for (`user_store` → UserStore) stands in.
      const base = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.rb$/, '');
      const constant = base.split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      return { module: joinPath(dirOf(path), rel).replace(/\.rb$/, ''), names: [{ local: constant, members: false }] };
    }
  }
}

/** Names referenced on added lines outside imports (identifiers, types, JSX tags), and `object.member` pairs. */
function readUses(n: N, spec: Spec, text: string, added: (row: number) => boolean, out: Set<string>): void {
  if (n.type === 'import_statement' || n.type === 'import_from_statement' || n.type === 'import_declaration' || n.type === 'use_declaration' || n.type === 'import' || n.type === 'import_spec') return;
  if (IDENTIFIERS.has(n.type) && n.kids.length === 0 && added(n.sr)) out.add(textOf(text, n));
  if (spec.members.has(n.type) && added(n.sr)) {
    const named = n.kids.filter((k) => k.named);
    const obj = named[0];
    const prop = named[named.length - 1];
    if (obj && prop && obj !== prop && IDENTIFIERS.has(obj.type) && IDENTIFIERS.has(prop.type)) out.add(`${textOf(text, obj)}.${textOf(text, prop)}`);
  }
  for (const k of n.kids) readUses(k, spec, text, added, out);
}
