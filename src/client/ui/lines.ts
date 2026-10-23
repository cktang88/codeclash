// How pushed lines are presented: code is the army, tests/comments/docs/config are a little support, and
// generated, vendored and blank lines raise nothing (DESIGN.md, "Code is the army"). Pure.
import { Cat } from '../../sim/api.ts';

export type LineGroup = 'army' | 'support' | 'inert';

/** Each line category's group, in Cat order. Deleted lines count as code change (they raise Outriders). */
export const CAT_GROUP: readonly LineGroup[] = (() => {
  const g: LineGroup[] = [];
  g[Cat.Code] = 'army';
  g[Cat.Removed] = 'army';
  g[Cat.Test] = 'support';
  g[Cat.Comment] = 'support';
  g[Cat.Docs] = 'support';
  g[Cat.Config] = 'support';
  g[Cat.Generated] = 'inert';
  g[Cat.Vendor] = 'inert';
  g[Cat.Blank] = 'inert';
  return g;
})();

export const GROUP_LABEL: Record<LineGroup, string> = { army: 'The army', support: 'Support', inert: 'Raised nothing' };

/** Legend order: code first, then deletions; then support; then what raised nothing. */
const ORDER = [Cat.Code, Cat.Removed, Cat.Test, Cat.Comment, Cat.Docs, Cat.Config, Cat.Generated, Cat.Vendor, Cat.Blank] as const;

export interface LineGroupSummary {
  group: LineGroup;
  total: number;
  cats: { cat: number; n: number }[];
}

/** Non-empty groups in army → support → inert order, each with its non-empty categories. */
export function groupLines(lines: readonly number[]): LineGroupSummary[] {
  const out: LineGroupSummary[] = [];
  for (const group of ['army', 'support', 'inert'] as const) {
    const cats = ORDER.filter((c) => CAT_GROUP[c] === group)
      .map((cat) => ({ cat, n: Math.max(0, lines[cat] ?? 0) }))
      .filter((x) => x.n > 0);
    if (cats.length > 0) out.push({ group, total: cats.reduce((a, b) => a + b.n, 0), cats });
  }
  return out;
}
