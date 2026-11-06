// The enemy at a man's elbow (pure: no DOM, testable in Node). The renderer asks, for each man it
// draws in a fight, which enemy stands within arm's reach and a step of him, so a man with a foe at
// his back turns to him (pose.ts facing) instead of showing him his back while he looks at the
// target the sim gave him, or walks to his slot. A bucket grid of the living, rebuilt once a tick.

/** What the grid reads of a man. */
export interface FoeMan {
  x: number;
  y: number;
  team: number;
  /** battle.ts State: 0 fighting, 1 routing, 2 dead, 3 fled. */
  state: number;
}

/** Reach (battle.ts, 14 units) and a step: an enemy this close is one a man would turn to. */
export const ELBOW = 14 + 4;

export class FoeGrid {
  private built = -1;
  private cols = 0;
  private rows = 0;
  private start = new Int32Array(0);
  private items = new Int32Array(0);
  /** Where each man stood when the grid was built (the cells hold indices). */
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private teams = new Uint8Array(0);
  private cellOf = new Int32Array(0);

  private readonly cell: number;

  /** A field `w` x `h` units, in cells of `cell` (at least the widest radius asked for). */
  constructor(w: number, h: number, cell = ELBOW) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell) + 1;
    this.rows = Math.ceil(h / cell) + 1;
    this.start = new Int32Array(this.cols * this.rows + 1);
  }

  /** Buckets the living (not dead, not fled) by cell, unless already built for `stamp` (the tick). */
  build(men: readonly FoeMan[], stamp: number): void {
    if (stamp === this.built && this.xs.length === men.length) return;
    this.built = stamp;
    const n = men.length;
    if (this.xs.length !== n) {
      this.xs = new Float32Array(n);
      this.ys = new Float32Array(n);
      this.teams = new Uint8Array(n);
      this.items = new Int32Array(n);
      this.cellOf = new Int32Array(n);
    }
    const { cols, rows, cell, start } = this;
    start.fill(0);
    const cellOf = this.cellOf;
    for (let i = 0; i < n; i++) {
      const s = men[i]!;
      this.xs[i] = s.x;
      this.ys[i] = s.y;
      this.teams[i] = s.team;
      if (s.state >= 2) {
        cellOf[i] = -1;
        continue;
      }
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(s.x / cell)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(s.y / cell)));
      const c = cy * cols + cx;
      cellOf[i] = c;
      start[c + 1]!++;
    }
    for (let c = 0; c < cols * rows; c++) start[c + 1]! += start[c]!;
    const fill = start.slice(0, cols * rows);
    for (let i = 0; i < n; i++) {
      const c = cellOf[i]!;
      if (c >= 0) this.items[fill[c]!++] = i;
    }
  }

  /**
   * The nearest enemy of `team` within `r` (at most the cell size) of (x, y), as the index of the
   * man, or -1. Positions are those of the build.
   */
  nearest(x: number, y: number, team: number, r = ELBOW): number {
    const { cols, rows, cell, start, items, xs, ys, teams } = this;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let best = -1;
    let bd = r * r;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++)
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
        const c = gy * cols + gx;
        for (let k = start[c]!; k < start[c + 1]!; k++) {
          const j = items[k]!;
          if (teams[j] === team) continue;
          const dx = xs[j]! - x, dy = ys[j]! - y;
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
      }
    return best;
  }
}
