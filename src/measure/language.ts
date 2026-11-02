// Languages of files and their GitHub colours.

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
  Java: '#b07219', Kotlin: '#A97BFF', Swift: '#F05138', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Dart: '#00B4AB', Scala: '#c22d40', Elixir: '#6e4a7e', Haskell: '#5e5086',
  Lua: '#000080', Shell: '#89e051', HTML: '#e34c26', CSS: '#663399', Vue: '#41b883', Svelte: '#ff3e00',
  Zig: '#ec915c', OCaml: '#ef7a08', Clojure: '#db5855', Julia: '#a270ba', R: '#198CE7', 'Objective-C': '#438eff',
  Nix: '#7e7eff', Erlang: '#B83998', SQL: '#e38c00', Markdown: '#083fa1',
};

export function languageColor(language: string | null): string | null {
  return language && Object.hasOwn(LANGUAGE_COLORS, language) ? LANGUAGE_COLORS[language]! : null;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', swift: 'Swift', cc: 'C++', cpp: 'C++', cxx: 'C++',
  hpp: 'C++', hh: 'C++', c: 'C', h: 'C', cs: 'C#', rb: 'Ruby', php: 'PHP', dart: 'Dart', scala: 'Scala', ex: 'Elixir', exs: 'Elixir',
  hs: 'Haskell', lua: 'Lua', sh: 'Shell', bash: 'Shell', zsh: 'Shell', html: 'HTML', css: 'CSS', scss: 'CSS', vue: 'Vue', svelte: 'Svelte',
  zig: 'Zig', ml: 'OCaml', clj: 'Clojure', jl: 'Julia', r: 'R', m: 'Objective-C', nix: 'Nix', erl: 'Erlang', sql: 'SQL',
};

export function languageOfPath(path: string): string | null {
  const dot = path.lastIndexOf('.');
  if (dot < 0 || dot < path.lastIndexOf('/')) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  return Object.hasOwn(EXTENSION_LANGUAGES, ext) ? EXTENSION_LANGUAGES[ext]! : null;
}
