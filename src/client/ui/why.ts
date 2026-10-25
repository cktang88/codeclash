// Words and figures for the army preview's "Why this army" card, from the server's structured
// `PreviewWhy`. Pure: no DOM, so the card's every label is tested without a browser.

import type { PreviewNearMiss, PreviewPowerPart, PreviewRank, PreviewSource, PreviewSourceKey, PreviewUncounted, PreviewWhy } from '../../protocol.ts';
import { STATS } from '../../sim/stats.ts';

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** Points, which may end in a half. */
export const pts = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const pct = (effect: number) => `${Math.round(Math.abs(effect) * 100)}%`;
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const mult = (m: number) => `×${m.toFixed(1)}`;

/** What "soldiers" means, said wherever the size is. */
export const SIZE_GLOSS = 'Army size is room in the ranks; bigger units take more room: a Knight 2, a Ballista 2, a Dragon 6.';
/** What a veteran rank is. */
export const VETERAN_GLOSS = 'Rank comes from the day’s whole work: code and source files touched. Each rank: soldiers +10% damage and toughness.';

export const SOURCE_NAME: Record<PreviewSourceKey, string> = {
  code: 'Code',
  files: 'Files',
  complexity: 'Complexity',
  removed: 'Cleanup',
  others: 'Others’ code',
  effort: 'Effort credit',
  pending: 'Pending upstream',
};

/** "well tested +5%", "Veteran II +20%", "ragged −8% (comment padding)". */
export function powerLabel(p: PreviewPowerPart): string {
  if (p.kind === 'veteran') return `Veteran ${ROMAN[Math.round(p.effect * 10)] ?? ''} +${pct(p.effect)}`;
  if (p.effect > 0) return `well tested +${pct(p.effect)}`;
  const why = { tests: 'test padding', comments: 'comment padding', filler: 'filler' }[p.kind];
  return `ragged −${pct(p.effect)} (${why})`;
}

export function powerTone(p: PreviewPowerPart): 'good' | 'bad' | 'gilt' {
  return p.kind === 'veteran' ? 'gilt' : p.effect > 0 ? 'good' : 'bad';
}

/** "×1.26". */
export const powerText = (why: PreviewWhy) => `×${why.power.toFixed(2)}`;

/** A source's amount, short: "1,063 lines", "12 lines in css.ts ×3.2 · +27 lines", "3 hard files fixed · +359 lines". */
export function amountText(s: PreviewSource): string {
  switch (s.key) {
    case 'code':
      return plural(s.amount, 'line');
    case 'files':
      return plural(s.amount, 'file');
    case 'complexity':
      return `${pts(s.amount)} ${s.amount === 1 ? 'point' : 'points'}`;
    case 'removed':
      return `${plural(s.amount, 'line')} removed`;
    case 'others': {
      const files = s.files ?? [];
      if (s.amount === 0 || files.length === 0) return 'none';
      const credit = ` · +${plural(s.credit ?? 0, 'line')}`;
      if (files.length === 1) return `${plural(s.amount, 'line')} in ${fileName(files[0]!.path)} ${mult(files[0]!.multiplier)}${credit}`;
      return `${plural(s.amount, 'line')} in ${files.length} files, ${multRange(files)}${credit}`;
    }
    case 'effort':
      return s.amount === 0 ? 'none' : `${plural(s.amount, 'hard file')} fixed · +${plural(s.credit ?? 0, 'line')}`;
    case 'pending':
      return `+${plural(s.amount, 'line')} once merged upstream`;
  }
}

/** "×3.2", or "×2.6–3.2" across several files. */
export function multRange(files: readonly { multiplier: number }[]): string {
  const ms = files.map((f) => f.multiplier);
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  return lo.toFixed(1) === hi.toFixed(1) ? mult(hi) : `×${lo.toFixed(1)}–${hi.toFixed(1)}`;
}

/** The hover detail of a source: its parts or its files, then the server's prose. */
export function sourceGloss(s: PreviewSource): string[] {
  const out: string[] = [];
  if (s.key === 'complexity' && s.parts) {
    const p = s.parts;
    const parts = [`${plural(p.branches, 'branch point')}`];
    if (p.functions > 0) parts.push(`${fmt(p.functions)} function points (${plural(Math.max(1, Math.round(p.functions / 3)), 'new function')})`);
    if (p.links > 0) parts.push(`${pts(p.links / 2)} from ${plural(p.links, 'imported name')} used${p.modules > 0 ? ` (${plural(p.modules, 'local module')})` : ''}`);
    out.push(parts.join(' + '));
  }
  if ((s.key === 'others' || s.key === 'effort' || s.key === 'pending') && (s.files?.length ?? 0) > 1) {
    for (const f of s.files!) out.push(`${fileName(f.path)}: ${plural(f.modified, 'line')} ${mult(f.multiplier)} → +${f.credit}`);
  }
  return [...out, ...s.detail];
}

/** The counted sources (pending is not in the total). */
export const counted = (why: PreviewWhy) => why.sources.filter((s) => !s.pending);

/** A segment of the stacked bar: its share of the size, and its label when it is wide enough to carry one. */
export interface Segment {
  key: PreviewSourceKey;
  size: number;
  share: number;
  label: string;
}

/** The stacked bar's segments: counted sources with a size, labelled when wide enough; then the pending ghost. */
export function segments(why: PreviewWhy): { parts: Segment[]; ghost: Segment | null; total: number } {
  const live = counted(why).filter((s) => s.size > 0);
  const pending = why.sources.find((s) => s.pending && s.size > 0) ?? null;
  const total = live.reduce((n, s) => n + s.size, 0) + (pending?.size ?? 0);
  const seg = (s: PreviewSource): Segment => {
    const share = total > 0 ? s.size / total : 0;
    return { key: s.key, size: s.size, share, label: share >= 0.24 ? `${SOURCE_NAME[s.key]} +${fmt(s.size)}` : share >= 0.07 ? `+${fmt(s.size)}` : '' };
  };
  return { parts: live.map(seg), ghost: pending ? seg(pending) : null, total };
}

/** The bar's summary for a screen reader: "Army size 78: code 68, files 5, complexity 4, cleanup 1; 24 more once merged upstream". */
export function barLabel(why: PreviewWhy): string {
  const live = counted(why).filter((s) => s.size > 0);
  const pending = why.sources.find((s) => s.pending && s.size > 0);
  const parts = live.map((s) => `${SOURCE_NAME[s.key].toLowerCase()} ${fmt(s.size)}`).join(', ');
  return `Army size ${fmt(why.size)}${parts ? `: ${parts}` : ''}${pending ? `; ${fmt(pending.size)} more once merged upstream` : ''}`;
}

/** "Herald at 120 docs lines — 25 so far", or "Clerics: 40 fix lines, but the specialists’ share was spent". */
export function nearMissText(m: PreviewNearMiss): string {
  const s = STATS[m.kind]!;
  if (m.crowded) return `${s.plural}: earned, but the specialists’ share (65%) was spent first`;
  return `${s.name} at ${fmt(m.need)} ${m.unit} — ${fmt(m.have)} so far`;
}

/** The rank's name: "Veteran II", "Veteran III (max)", or "No rank yet". */
export function rankName(r: PreviewRank): string {
  if (r.rank === 0) return 'No rank yet';
  return `Veteran ${ROMAN[r.rank]}${r.rank >= r.max ? ' (max)' : ''}`;
}

/** The two bars toward the next rank (at the top rank, the top rank's own thresholds). */
export function rankBars(r: PreviewRank): { what: 'Code' | 'Files'; have: number; need: number; met: boolean; fill: number }[] {
  const bar = (what: 'Code' | 'Files', have: number, need: number) => ({ what, have, need, met: have >= need, fill: need > 0 ? Math.min(1, have / need) : 1 });
  return [bar('Code', r.code, r.target.code), bar('Files', r.files, r.target.files)];
}

const KIND_WORD: Record<PreviewUncounted['kind'], string> = {
  structure: 'structure',
  fragment: 'fragments',
  data: 'data',
  prose: 'prose',
  repeat: 'repeats',
  shape: 'near-duplicates',
  cap: 'past the daily cap',
  generated: 'generated',
  vendor: 'vendored',
};

/** "360 lines didn't count — structure, repeats, data, generated (no penalty)"; when filler is penalised, says so. */
export function uncountedLine(why: PreviewWhy): { text: string; penalised: boolean } | null {
  const u = why.uncounted;
  if (u.lines <= 0 && u.filler <= 0) return null;
  const kinds = u.kinds.map((k) => KIND_WORD[k.kind]).slice(0, 4).join(', ');
  if (u.penalty < 0) return { text: `${plural(u.filler, 'line')} of filler — ${kinds}: quality −${pct(u.penalty)}`, penalised: true };
  return { text: `${plural(u.lines, 'line')} didn’t count — ${kinds} (no penalty)`, penalised: false };
}

/** What marches when no code counted. */
export function messengerText(why: PreviewWhy): string | null {
  switch (why.messenger) {
    case 'nothing-read':
      return 'Nothing to count (binary or unread files): a lone messenger marches';
    case 'too-few':
      return why.support > 0 && why.size === 0 ? 'Too little code for a soldier: only support marches' : 'Too little code for a soldier: a lone messenger marches';
    case 'no-code':
      return why.size === 0 ? 'No code: only support marches' : 'No code: a lone messenger marches';
    default:
      return null;
  }
}

/** The header's size: "78 soldiers + 14 support". */
export function sizeText(why: PreviewWhy): string {
  return `${fmt(why.size)} ${why.size === 1 ? 'soldier' : 'soldiers'}${why.support > 0 ? ` + ${fmt(why.support)} support` : ''}`;
}
