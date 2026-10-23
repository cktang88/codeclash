// Heraldry: how armies, battalions and platoons look. Pure and shared by server and client.

/** Hues spaced for contrast; assigned in this order so early players are far apart. */
const HUE_ORDER = [212, 8, 140, 45, 280, 180, 330, 95, 245, 25, 160, 300, 60, 195, 350, 120];

export function nextHue(taken: readonly number[]): number {
  for (const h of HUE_ORDER) if (!taken.includes(h)) return h;
  return (taken.length * 137) % 360;
}

export const PATTERNS = ['plain', 'chevron', 'saltire', 'pale', 'fess', 'quarterly', 'bend', 'chief'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const EMBLEMS = ['star', 'tower', 'key', 'crown', 'bolt', 'leaf', 'sun', 'moon', 'anchor', 'eye', 'wing', 'flame'] as const;
export type Emblem = (typeof EMBLEMS)[number];

export interface Flag {
  /** Army hue in degrees. */
  hue: number;
  /** Field color, a battalion-specific shade of the army hue. */
  field: string;
  /** Darker shade for the pattern. */
  charge: string;
  /** Repository language color, used for the accent stripe. */
  accent: string;
  pattern: Pattern;
  emblem: Emblem;
  initials: string;
}

export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

/** The army's own color, used for capitals, the scoreboard and unit tabards. */
export function armyColor(hue: number, lightness = 52): string {
  return hsl(hue, 72, lightness);
}

const SHADES: readonly [number, number][] = [
  [72, 50], [60, 40], [80, 62], [55, 32], [70, 70], [90, 45], [45, 55], [65, 28],
];

export function initialsOf(repo: string): string {
  const name = repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo;
  const words = name.split(/[-_.\s]+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const camel = name.match(/[A-Z]/g);
  if (camel && camel.length >= 2) return (camel[0]! + camel[1]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '??';
}

/** A battalion's flag: the army hue, varied per repository. */
export function battalionFlag(hue: number, repo: string, language: string | null): Flag {
  const h = hash32(repo.toLowerCase());
  const [sat, light] = SHADES[h % SHADES.length]!;
  const hueShift = ((h >>> 3) % 21) - 10;
  return {
    hue,
    field: hsl(hue + hueShift, sat, light),
    charge: hsl(hue + hueShift, Math.min(95, sat + 10), Math.max(14, light - 24)),
    accent: languageColor(language) ?? hsl((h >>> 8) % 360, 70, 60),
    pattern: PATTERNS[(h >>> 11) % PATTERNS.length]!,
    emblem: EMBLEMS[(h >>> 16) % EMBLEMS.length]!,
    initials: initialsOf(repo),
  };
}

// Colors from github-linguist for the most common languages.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
  Java: '#b07219', Kotlin: '#A97BFF', Swift: '#F05138', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Dart: '#00B4AB', Scala: '#c22d40', Elixir: '#6e4a7e', Haskell: '#5e5086',
  Lua: '#000080', Shell: '#89e051', HTML: '#e34c26', CSS: '#663399', Vue: '#41b883', Svelte: '#ff3e00',
  Zig: '#ec915c', OCaml: '#ef7a08', Clojure: '#db5855', Julia: '#a270ba', R: '#198CE7', 'Objective-C': '#438eff',
  Nix: '#7e7eff', Erlang: '#B83998', SQL: '#e38c00', Markdown: '#083fa1',
};

export function languageColor(language: string | null): string | null {
  return language ? (LANGUAGE_COLORS[language] ?? null) : null;
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
  return EXTENSION_LANGUAGES[path.slice(dot + 1).toLowerCase()] ?? null;
}
