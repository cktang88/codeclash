// Regression: hand-written client code (canvas rendering, JSX, a style sheet) is not filler.
//
// The fixture is a trimmed copy of this repository's own commit b0f0ae9 ("ring conquest client
// visuals and HUD"), whose army preview once reported 907 of its lines as filler: closing braces,
// JSX closing tags, short drawing statements with one-letter names (`label.x = x;`), every
// single-line doc comment keyed as the same empty comment, and the declarations and idioms any
// style sheet or renderer repeats. On these four patches the old measure found 199 lines of filler
// in about 650 added lines.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { applyDelta, armyQuality, emptyLedger } from '../sim/muster.ts';
import type { ChangedFile } from './classify.ts';
import { fillerKind, measurePush, MemoryLedger, normalize } from './ledger.ts';

const FIXTURE: Record<string, string> = {
  'borders.ts.patch': 'src/client/render/borders.ts',
  'RingFigure.tsx.patch': 'src/client/ui/RingFigure.tsx',
  'hud.css.patch': 'src/client/styles/hud.css',
  'terrain.ts.patch': 'src/client/render/terrain.ts',
};

function fixture(): ChangedFile[] {
  return Object.entries(FIXTURE).map(([name, filename]) => {
    const patch = readFileSync(new URL(`./fixtures/ring-conquest/${name}`, import.meta.url), 'utf8').replace(/\n$/, '');
    const lines = patch.split('\n');
    return { filename, status: 'modified', additions: lines.filter((l) => l[0] === '+').length, deletions: lines.filter((l) => l[0] === '-').length, patch };
  });
}

describe('filler in honest client code', () => {
  it('finds no filler in a real renderer, JSX component and style sheet', () => {
    const files = fixture();
    const d = measurePush(files, new MemoryLedger());
    expect(d.lines[Cat.Code]).toBeGreaterThan(400);
    expect(d.filler).toBe(0);
    // What is left uncounted is the structure and the repeated idioms any code has, and it is told apart.
    const kinds = Object.fromEntries((d.uncounted ?? []).map((u) => [u.kind, u.lines]));
    expect(kinds.structure).toBeGreaterThan(50);
    expect((kinds.data ?? 0) + (kinds.prose ?? 0) + (kinds.fragment ?? 0)).toBeLessThan(15);
    // Each file alone too: none of them is padding on its own.
    for (const f of files) expect(measurePush([f], new MemoryLedger()).filler, f.filename).toBe(0);
    // And the army is not ragged.
    const ledger = emptyLedger();
    applyDelta(ledger, { ...d, purpose: 'work' });
    expect(armyQuality(ledger).notes.filter((n) => n.kind === 'filler')).toEqual([]);
  });

  it('counts the short statements of drawing code and style sheets', () => {
    // Lines from the commit that the old two-letter-word rule left out.
    for (const t of ['label.x = x;', 'v.sampleTick = -1;', 'y += len / 6;', 'ctx.lineWidth = 0.8;', 'const a = claimed[i]!;', 'whoosh(v, 0.7, 600, 2400, 0.12);']) expect(fillerKind(normalize(t)), t).toBeNull();
    for (const t of ['content: \'\';', 'margin: 0;', 'color: #d3c6a6;']) expect(fillerKind(normalize(t), 'none'), t).toBeNull();
    // Closing braces and tags are structure, not code, and are free while the code carries them.
    for (const t of ['}', ')}', '})}', '</radialGradient>', '</g>', 'return (']) expect(fillerKind(normalize(t)), t).toBe('structure');
  });

  it('still reports padding pushed alongside it', () => {
    const files = fixture();
    const padded = [...files, { filename: 'src/client/pad.ts', status: 'modified', additions: 1500, deletions: 0, patch: ['@@ -0,0 +1,1500 @@', ...Array.from({ length: 1500 }, (_, i) => `+${['}', ');', '];', '})', '{'][i % 5]}`)].join('\n') }];
    const d = measurePush(padded, new MemoryLedger());
    expect(d.filler).toBeGreaterThan(1200);
    const structure = d.uncounted?.find((u) => u.kind === 'structure');
    expect(structure?.files[0]).toEqual({ path: 'src/client/pad.ts', lines: 1500 });
  });
});
