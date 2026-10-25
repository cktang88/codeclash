import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PreviewSource, PreviewWhy } from '../../protocol.ts';
import { Kind } from '../../sim/api.ts';
import { ArmyWhy } from './ArmyWhy.tsx';
import { amountText, barLabel, multRange, nearMissText, powerLabel, rankBars, rankName, segments, sizeText, sourceGloss, uncountedLine } from './why.ts';

const src = (key: PreviewSource['key'], amount: number, size: number, more: Partial<PreviewSource> = {}): PreviewSource => ({ key, amount, size, chips: [], detail: [], ...more });

/** The user's example: 1,063 lines in 35 files, a hard fix, a fork's credit pending. */
function example(): PreviewWhy {
  return {
    size: 78,
    support: 14,
    power: 1.26,
    parts: [
      { kind: 'tests', effect: 0.05, detail: 'Well tested' },
      { kind: 'veteran', effect: 0.2, detail: 'Veteran rank 2' },
    ],
    sources: [
      src('code', 1063, 68),
      src('files', 35, 5),
      src('complexity', 329, 4, { parts: { branches: 300, functions: 42, links: 9, modules: 4 } }),
      src('removed', 83, 1),
      src('others', 12, 0, { credit: 27, files: [{ path: 'packages/vite/src/node/plugins/css.ts', modified: 12, multiplier: 3.2, credit: 26.4 }], chips: ['past the 4,000-line knee: half value'] }),
      src('effort', 0, 0, { credit: 0, chips: ['credited recently — needs 10+ lines'] }),
      src('pending', 412, 24, { credit: 412, pending: true, files: [{ path: 'a/css.ts', modified: 4, multiplier: 3.2, credit: 128.8 }] }),
    ],
    units: [
      { kind: Kind.Dragon, count: 1, reason: 'legendary feature', detail: 'Legendary features' },
      { kind: Kind.Knight, count: 12, reason: 'complex logic', detail: 'Complexity 329' },
      { kind: Kind.Footman, count: 30, reason: 'the rest', detail: 'What is left' },
    ],
    supportUnits: [
      { kind: Kind.Warden, count: 8, reason: '652 test lines', detail: 'Tests' },
      { kind: Kind.Archer, count: 6, reason: '264 comments', detail: 'Comments' },
    ],
    nearMisses: [{ kind: Kind.Herald, have: 25, need: 120, unit: 'docs lines' }],
    rank: { rank: 2, max: 3, code: 1063, files: 35, target: { rank: 3, code: 2000, files: 25 } },
    uncounted: {
      lines: 360,
      filler: 0,
      penalty: 0,
      kinds: [
        { kind: 'structure', lines: 271, text: '271 lines of brackets, closing tags and bare keywords' },
        { kind: 'repeat', lines: 50, text: '50 repeated lines (each counts once)' },
        { kind: 'data', lines: 30, text: '30 lines of literal data' },
        { kind: 'generated', lines: 9, text: '9 generated lines' },
      ],
    },
    notes: [],
  };
}

describe('why: labels', () => {
  it('says the header at a glance', () => {
    expect(sizeText(example())).toBe('78 soldiers + 14 support');
    expect(sizeText({ ...example(), size: 1, support: 0 })).toBe('1 soldier');
    expect(example().parts.map(powerLabel)).toEqual(['well tested +5%', 'Veteran II +20%']);
    expect(powerLabel({ kind: 'comments', effect: -0.08, detail: '' })).toBe('ragged −8% (comment padding)');
    expect(powerLabel({ kind: 'filler', effect: -0.15, detail: '' })).toBe('ragged −15% (filler)');
  });

  it('says each source’s amount in a few words', () => {
    const w = example();
    expect(w.sources.map(amountText)).toEqual([
      '1,063 lines',
      '35 files',
      '329 points',
      '83 lines removed',
      '12 lines in css.ts ×3.2 · +27 lines',
      'none',
      '+412 lines once merged upstream',
    ]);
    const several = src('others', 30, 9, { credit: 60, files: [3.2, 2.6, 3.0, 2.9].map((m, i) => ({ path: `src/f${i}.ts`, modified: 7, multiplier: m, credit: 15 })) });
    expect(amountText(several)).toBe('30 lines in 4 files, ×2.6–3.2 · +60 lines');
    expect(multRange([{ multiplier: 3.2 }, { multiplier: 3.184 }])).toBe('×3.2');
    expect(amountText(src('effort', 3, 23, { credit: 359 }))).toBe('3 hard files fixed · +359 lines');
    // The files of several go to the hover, with the parts of complexity.
    expect(sourceGloss(several).slice(0, 2)).toEqual(['f0.ts: 7 lines ×3.2 → +15', 'f1.ts: 7 lines ×2.6 → +15']);
    expect(sourceGloss(w.sources[2]!)[0]).toBe('300 branch points + 42 function points (14 new functions) + 4.5 from 9 imported names used (4 local modules)');
  });

  it('draws the bar from counted sources, labelled when wide enough, pending as a ghost', () => {
    const { parts, ghost, total } = segments(example());
    expect(parts.map((p) => p.key)).toEqual(['code', 'files', 'complexity', 'removed']);
    expect(total).toBe(78 + 24);
    expect(parts[0]!.label).toBe('Code +68');
    expect(parts[3]!.label).toBe('');
    expect(ghost).toMatchObject({ key: 'pending', size: 24, label: '+24' });
    expect(barLabel(example())).toBe('Army size 78: code 68, files 5, complexity 4, cleanup 1; 24 more once merged upstream');
  });

  it('says near misses, rank and what did not count', () => {
    expect(nearMissText(example().nearMisses[0]!)).toBe('Herald at 120 docs lines — 25 so far');
    expect(nearMissText({ kind: Kind.Cleric, have: 40, need: 21, unit: 'fix lines', crowded: true })).toBe('Clerics: earned, but the specialists’ share (65%) was spent first');
    const r = example().rank;
    expect(rankName(r)).toBe('Veteran II');
    expect(rankBars(r)).toEqual([
      { what: 'Code', have: 1063, need: 2000, met: false, fill: 1063 / 2000 },
      { what: 'Files', have: 35, need: 25, met: true, fill: 1 },
    ]);
    expect(rankName({ ...r, rank: 3 })).toBe('Veteran III (max)');
    expect(rankName({ ...r, rank: 0 })).toBe('No rank yet');
    expect(uncountedLine(example())).toEqual({ text: '360 lines didn’t count — structure, repeats, data, generated (no penalty)', penalised: false });
    const padded = { ...example(), uncounted: { lines: 304, filler: 260, penalty: -0.15, kinds: [{ kind: 'shape' as const, lines: 304, text: '304 near-duplicate lines' }] } };
    expect(uncountedLine(padded)).toEqual({ text: '260 lines of filler — near-duplicates: quality −15%', penalised: true });
  });
});

describe('ArmyWhy: render', () => {
  const html = renderToStaticMarkup(createElement(ArmyWhy, { why: example(), reasons: ['Army size: 78 — mostly from 1,063 lines of code (+68)'], open: true }));

  it('leads with the big figures and the power’s seals', () => {
    expect(html).toMatch(/<span class="why-big num">78<\/span>/);
    expect(html).toContain('>soldiers</button>');
    expect(html).toContain('Army size is room in the ranks; bigger units take more room: a Knight 2, a Ballista 2, a Dragon 6.');
    expect(html).toContain('×1.26');
    expect(html).toContain('well tested +5%');
    expect(html).toContain('Veteran II +20%');
  });

  it('is a real table with a summarised bar, and keyboard-reachable glosses', () => {
    expect(html).toContain('<table class="why-table">');
    expect(html).toMatch(/<th scope="col"[^>]*>Source<\/th>/);
    expect((html.match(/<tr class="src-/g) ?? []).length).toBe(7);
    expect(html).toContain('role="img" aria-label="Army size 78: code 68, files 5, complexity 4, cleanup 1; 24 more once merged upstream"');
    // Every gloss is a button described by its tooltip.
    const buttons = [...html.matchAll(/<button type="button" class="gloss-mark" aria-describedby="([^"]+)"/g)].map((m) => m[1]);
    expect(buttons.length).toBeGreaterThan(10);
    for (const id of buttons) expect(html).toContain(`role="tooltip" id="${id}"`);
    // Zero and capped sources say why; pending is apart.
    expect(html).toContain('credited recently — needs 10+ lines');
    expect(html).toContain('class="src-pending is-pending"');
    expect(html).toContain('Army size</th><td class="num">78</td>');
  });

  it('spends, ranks and folds what did not count', () => {
    expect(html).toContain('Knights <span class="num">×12</span>');
    expect(html).toContain('complex logic');
    expect(html).toContain('Support');
    expect(html).toContain('Herald at 120 docs lines — 25 so far');
    expect(html).toContain('Veteran II');
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Files toward Veteran III: 35 of 25"');
    expect(html).toContain('360 lines didn’t count');
    expect(html).not.toContain('why-uncounted is-bad');
  });
});
