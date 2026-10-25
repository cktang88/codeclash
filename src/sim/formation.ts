// Platoon formations: a narrow march column and a wide battle line, both laid
// out as one contiguous block per kind, in ranks and files. Offsets are in the
// platoon's own frame: `f` forward of the banner (negative behind it) and `l`
// to its right. Pure functions of the platoon's make-up, so every client lays
// out the same ranks.

import { Kind } from './api.ts';
import { SPACING, STATS } from './stats.ts';

export interface Slot {
  kind: Kind;
  f: number;
  l: number;
}

/** How a platoon is drawn up. Exposed on Platoon.form. */
export const Form = { Column: 0, Deploying: 1, Line: 2, Engaged: 3 } as const;
export type Form = (typeof Form)[keyof typeof Form];

/** Room each soldier of a kind takes in the ranks, a little more than the press of bodies allows. */
export function pitch(kind: Kind): number {
  return Math.max(SPACING + 1, STATS[kind]!.size * 1.9 + 2.5);
}

/** The widest a column may be: three files of Footmen. */
export const COLUMN_WIDTH = 48;
const COLUMN_FILES = 3;
const COLUMN_GAP = 4;
const LINE_GAP = 6;
const BLOCK_GAP = 6;
const DRAGON_BEHIND = 26;

/** March order, head of the column first. Fliers hover over it. */
export const COLUMN_ORDER: readonly Kind[] = [
  // Vanguard: the cavalry scouts.
  Kind.Outrider, Kind.Knight,
  // Heavy infantry.
  Kind.Berserker, Kind.Troll, Kind.BoneGolem, Kind.Paladin, Kind.Warden, Kind.Footman, Kind.Mercenary, Kind.Skeleton,
  // The banner, its heroes and support.
  Kind.Champion, Kind.Herald, Kind.Cleric, Kind.Sapper,
  // Missile troops.
  Kind.Archer, Kind.Ranger, Kind.Wizard,
  // Siege at the tail: the bolt-throwers, then the stone-throwers.
  Kind.Ballista, Kind.Trebuchet,
];

/** Battle line, front row first; each row's blocks are set side by side from the centre out. */
export const LINE_ROWS: readonly (readonly Kind[])[] = [
  // Brutes and Berserkers ahead of the line.
  [Kind.Troll, Kind.BoneGolem, Kind.Berserker],
  // The line itself, its Champion at the centre.
  [Kind.Champion, Kind.Footman, Kind.Warden, Kind.Mercenary, Kind.Skeleton],
  // Healers and engineers behind the centre.
  [Kind.Paladin, Kind.Herald, Kind.Cleric, Kind.Sapper],
  // Missile troops, the Ballistae among them.
  [Kind.Archer, Kind.Ranger, Kind.Wizard, Kind.Ballista],
  // Siege behind the missile line.
  [Kind.Trebuchet],
];
/** Cavalry on the wings, inner wing first. */
export const LINE_WINGS: readonly Kind[] = [Kind.Knight, Kind.Outrider];

interface Block {
  kind: Kind;
  n: number;
  files: number;
  g: number;
  /** Width and depth of the block. */
  w: number;
  d: number;
  /** Lateral centre and front edge, once placed. */
  l: number;
  f: number;
}

function block(kind: Kind, n: number, files: number): Block {
  const g = pitch(kind);
  const ranks = Math.ceil(n / files);
  // Even out the ranks: 10 in rows of 4 stand 4, 3, 3 rather than 4, 4, 2.
  const even = Math.ceil(n / ranks);
  return { kind, n, files: even, g, w: even * g, d: ranks * g, l: 0, f: 0 };
}

/** Each soldier's place in a placed block, front rank first, left to right. */
function emit(b: Block, out: Slot[]): void {
  for (let i = 0; i < b.n; i++) {
    const r = Math.floor(i / b.files);
    const inRank = Math.min(b.files, b.n - r * b.files);
    const c = i - r * b.files;
    out.push({ kind: b.kind, f: b.f - (r + 0.5) * b.g, l: b.l + (c - (inRank - 1) / 2) * b.g });
  }
}

/** Shifts every slot so the ground soldiers' centre of mass sits on the banner. */
function centre(out: Slot[]): Slot[] {
  let sf = 0;
  let sl = 0;
  let n = 0;
  for (const s of out) {
    if (STATS[s.kind]!.flying) continue;
    sf += s.f;
    sl += s.l;
    n++;
  }
  if (n === 0) return out;
  const df = sf / n;
  const dl = sl / n;
  for (const s of out) {
    s.f -= df;
    s.l -= dl;
  }
  return out;
}

/**
 * Narrow and deep: each kind a block a few files wide, one behind another down
 * the road. The banner marches at the head, so the whole column files along
 * the road it has taken; a line, by contrast, is drawn up around its banner.
 */
export function columnFormation(counts: readonly number[]): Slot[] {
  const out: Slot[] = [];
  let f = 0;
  let first = true;
  for (const k of COLUMN_ORDER) {
    const n = counts[k]!;
    if (n <= 0) continue;
    const b = block(k, n, Math.min(n, COLUMN_FILES, Math.max(1, Math.floor(COLUMN_WIDTH / pitch(k)))));
    if (!first) f -= COLUMN_GAP;
    first = false;
    b.f = f;
    emit(b, out);
    f -= b.d;
  }
  // Griffins fly in single file over the middle of the column; a Dragon over the banner.
  const depth = -f;
  const griffins = counts[Kind.GriffinRider]!;
  const gp = pitch(Kind.GriffinRider);
  for (let i = 0; i < griffins; i++) out.push({ kind: Kind.GriffinRider, f: -depth / 2 + ((griffins - 1) / 2 - i) * gp, l: 0 });
  for (let i = 0; i < counts[Kind.Dragon]!; i++) out.push({ kind: Kind.Dragon, f: -depth / 2 - i * pitch(Kind.Dragon), l: 0 });
  // The banner leads: every place lies behind it, on the road it has marched.
  return out;
}

/** Wide and shallow: few ranks per block, and no wider than the frontage allows. */
function lineBlock(kind: Kind, n: number, frontage: number): Block {
  const ranks = Math.max(1, Math.floor(Math.sqrt(n / 4) + 0.5));
  const cap = Math.max(1, Math.floor(frontage / pitch(kind)));
  return block(kind, n, Math.min(cap, Math.ceil(n / ranks)));
}

/** Places a row's blocks side by side from the centre out, each on the narrower side, then centres the row. */
function placeRow(blocks: Block[], front: number): { half: number; depth: number } {
  let left = 0;
  let right = 0;
  let depth = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    b.f = front;
    depth = Math.max(depth, b.d);
    if (i === 0) {
      b.l = 0;
      left = right = b.w / 2;
    } else if (right <= left) {
      b.l = right + BLOCK_GAP + b.w / 2;
      right += BLOCK_GAP + b.w;
    } else {
      b.l = -(left + BLOCK_GAP + b.w / 2);
      left += BLOCK_GAP + b.w;
    }
  }
  const shift = (left - right) / 2;
  for (const b of blocks) b.l += shift;
  return { half: (left + right) / 2, depth };
}

/** Splits a row into rows no wider than the frontage, keeping the blocks' order. */
function pack(blocks: Block[], frontage: number): Block[][] {
  const rows: Block[][] = [];
  let row: Block[] = [];
  let width = 0;
  for (const b of blocks) {
    if (row.length > 0 && width + BLOCK_GAP + b.w > frontage) {
      rows.push(row);
      row = [];
      width = 0;
    }
    width += (row.length > 0 ? BLOCK_GAP : 0) + b.w;
    row.push(b);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * The battle line: brutes and Berserkers ahead, heavy infantry in the front
 * ranks with the Champion at the centre, healers behind the centre, missile
 * troops behind them, siege at the back, cavalry on both wings. Where the
 * ground allows less than its natural `frontage`, blocks grow deeper, rows
 * that do not fit fall in behind, and the cavalry rides behind the foot.
 */
export function lineFormation(counts: readonly number[], frontage = Infinity): Slot[] {
  const out: Slot[] = [];
  let front = 0;
  let wingFront = 0;
  let wingHalf = 0;
  let any = false;
  for (let r = 0; r < LINE_ROWS.length; r++) {
    const blocks: Block[] = [];
    for (const k of LINE_ROWS[r]!) if (counts[k]! > 0) blocks.push(lineBlock(k, counts[k]!, frontage));
    for (const row of pack(blocks, frontage)) {
      if (any) front -= LINE_GAP;
      const placed = placeRow(row, front);
      // The wings ride level with the front line, outside the widest of the leading rows.
      if (r <= 1) {
        if (!any || r === 1) wingFront = front;
        wingHalf = Math.max(wingHalf, placed.half);
      }
      any = true;
      for (const b of row) emit(b, out);
      front -= placed.depth;
    }
  }
  // Cavalry splits into two wings, right wing first, each two files wide.
  const wings: Block[][] = [];
  let wingWidth = 0;
  for (const k of LINE_WINGS) {
    const n = counts[k]!;
    if (n <= 0) continue;
    const rightN = Math.ceil(n / 2);
    const pair = [block(k, rightN, Math.min(2, rightN))];
    if (n - rightN > 0) pair.push(block(k, n - rightN, Math.min(2, n - rightN)));
    wings.push(pair);
    wingWidth += BLOCK_GAP + pair[0]!.w;
  }
  if (2 * (wingHalf + wingWidth) <= frontage) {
    let reach = wingHalf;
    for (const pair of wings) {
      pair[0]!.l = reach + BLOCK_GAP + pair[0]!.w / 2;
      if (pair[1]) pair[1].l = -(reach + BLOCK_GAP + pair[1].w / 2);
      for (const b of pair) {
        b.f = wingFront;
        emit(b, out);
      }
      reach += BLOCK_GAP + pair[0]!.w;
    }
  } else {
    // No room on the wings: the cavalry falls in behind the foot.
    const blocks: Block[] = [];
    for (const k of LINE_WINGS) if (counts[k]! > 0) blocks.push(lineBlock(k, counts[k]!, frontage));
    for (const row of pack(blocks, frontage)) {
      if (any) front -= LINE_GAP;
      any = true;
      const placed = placeRow(row, front);
      for (const b of row) emit(b, out);
      front -= placed.depth;
    }
  }
  // Fliers hover over and behind the line: Griffins above the healers, a Dragon behind the centre.
  const griffins = counts[Kind.GriffinRider]!;
  if (griffins > 0) {
    const b = lineBlock(Kind.GriffinRider, griffins, Infinity);
    b.f = front / 2 + b.d / 2;
    b.l = 0;
    emit(b, out);
  }
  for (let i = 0; i < counts[Kind.Dragon]!; i++) out.push({ kind: Kind.Dragon, f: front - DRAGON_BEHIND - i * pitch(Kind.Dragon), l: 0 });
  return centre(out);
}

export function formationFor(form: Form, counts: readonly number[], frontage = Infinity): Slot[] {
  return form === Form.Column ? columnFormation(counts) : lineFormation(counts, frontage);
}

/** Width (across) and depth (along) of a layout's ground soldiers. */
export function extent(slots: readonly Slot[]): { width: number; depth: number } {
  let f0 = Infinity;
  let f1 = -Infinity;
  let l0 = Infinity;
  let l1 = -Infinity;
  for (const s of slots) {
    if (STATS[s.kind]!.flying) continue;
    const g = pitch(s.kind) / 2;
    f0 = Math.min(f0, s.f - g);
    f1 = Math.max(f1, s.f + g);
    l0 = Math.min(l0, s.l - g);
    l1 = Math.max(l1, s.l + g);
  }
  return f0 === Infinity ? { width: 0, depth: 0 } : { width: l1 - l0, depth: f1 - f0 };
}
