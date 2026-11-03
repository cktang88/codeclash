// The persistent sheet cache (sheet-cache.ts) is keyed on a hash of ART_SOURCES (vite.config.ts):
// every file the sprite worker can load must be in it, or editing that file would leave stale
// sheets cached under an unchanged version. The import graph is derived here from the source.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_SOURCES } from '../../../vite.config.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const ENTRY = resolve(ROOT, 'src/client/render/sprite-worker.ts');

/** Static imports and re-exports, dynamic imports, and `new URL(..., import.meta.url)` (workers). */
const SPEC = /(?:^|[\s;])(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*(['"`])([^'"`]+)\4\s*\)|new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

/** Every file reachable from the worker entry (type-only imports left out), and any bare or computed imports. */
function graph(entry: string): { files: Set<string>; bare: string[]; computed: string[] } {
  const files = new Set<string>(), bare: string[] = [], computed: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (!/\.[cm]?[jt]sx?$/.test(f)) continue;
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(SPEC)) {
      if (m[2]) continue;
      const spec = m[3] ?? m[5] ?? m[6]!;
      if (m[4] === '`' && spec.includes('${')) {
        computed.push(`${relative(ROOT, f)}: ${spec}`);
        continue;
      }
      if (!spec.startsWith('.')) {
        if (!spec.startsWith('node:')) bare.push(`${relative(ROOT, f)}: ${spec}`);
        continue;
      }
      const p = resolve(dirname(f), spec);
      expect(existsSync(p), `${relative(ROOT, f)} imports ${spec}`).toBe(true);
      stack.push(p);
    }
  }
  return { files, bare, computed };
}

const covered = (file: string): boolean =>
  ART_SOURCES.some((s) => {
    const abs = resolve(ROOT, s);
    return file === abs || file.startsWith(abs + sep);
  });

describe('art version sources', () => {
  it('cover every file the sprite worker can load', () => {
    const { files, bare, computed } = graph(ENTRY);
    // The painter, its figures and their mocap clips, the game's unit tables.
    expect(files.size).toBeGreaterThan(30);
    expect([...files].some((f) => f.endsWith('.json'))).toBe(true);
    const missing = [...files].filter((f) => !covered(f)).map((f) => relative(ROOT, f));
    expect(missing, 'add these to ART_SOURCES in vite.config.ts').toEqual([]);
    // A package or a computed path would decide pixels outside the hashed sources.
    expect(bare).toEqual([]);
    expect(computed).toEqual([]);
  });

  it('name only paths that exist', () => {
    for (const s of ART_SOURCES) expect(existsSync(resolve(ROOT, s)), s).toBe(true);
  });
});
