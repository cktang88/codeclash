/**
 * Screen-space placement for far-zoom platoon markers. Markers are placed greedily, most
 * important first: each takes the nearest free spot within a short reach of its platoon
 * (preferring where it stood last frame, so markers do not hop about), and a marker that
 * finds no room is hidden rather than pushed far from the blocks it names. Markers that must
 * show (the selected or followed platoon) always do, on the least crowded spot.
 * Pure arithmetic, no Pixi, so it can be tested.
 */
export interface MarkerBox {
  /** True anchor in screen pixels. */
  x: number;
  y: number;
  /** Box size in screen pixels, centred on (x + cx, y + cy). */
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Offset from the anchor in screen pixels: read as last frame's, written as this frame's. */
  ox: number;
  oy: number;
  /** Higher places first. */
  priority: number;
  /** Shown whatever the crowd: the selected or followed platoon. */
  must: boolean;
  /** Read as whether it showed last frame, written as whether it shows this one. */
  shown: boolean;
}

/** Room left between markers, in screen pixels. */
const GAP = 2;
/** A marker that showed last frame outranks a slightly more important newcomer, so the crowd does not flicker. */
const STICKY = 400;
const CELL = 64;

/** Steps a marker may try, in units of its own size, nearest first for a typical marker (wider than tall). */
const STEPS: readonly [number, number][] = (
  [
    [0, -0.5], [0.5, 0], [-0.5, 0], [0, 0.5],
    [0, -1], [1, 0], [-1, 0], [0, 1],
    [0.5, -1], [-0.5, -1], [0.5, 1], [-0.5, 1],
    [1, -0.5], [-1, -0.5], [1, 0.5], [-1, 0.5],
  ] as [number, number][]
).sort((a, b) => Math.hypot(a[0] * 44, a[1] * 26) - Math.hypot(b[0] * 44, b[1] * 26));

/** Offsets a marker may try, nearest first, none further than `reach` from its anchor. */
function candidates(b: MarkerBox, reach: number, out: number[]): number {
  let n = 0;
  const push = (dx: number, dy: number) => {
    if (Math.hypot(dx, dy) > reach + 0.01) return;
    out[n++] = dx;
    out[n++] = dy;
  };
  push(0, 0);
  if (b.shown && Number.isFinite(b.ox) && Number.isFinite(b.oy) && (b.ox !== 0 || b.oy !== 0)) push(b.ox, b.oy);
  const sx = b.w + GAP;
  const sy = b.h + GAP;
  for (const [ux, uy] of STEPS) push(ux * sx, uy * sy);
  return n / 2;
}

/**
 * Places `boxes` in place: sets each box's offset and whether it shows. `reach` is the farthest,
 * in screen pixels, a marker may stray from its platoon. `order` is reusable scratch space.
 */
export function placeMarkers(boxes: MarkerBox[], reach: number, order: number[] = []): void {
  const n = boxes.length;
  order.length = n;
  for (let i = 0; i < n; i++) order[i] = i;
  const rank = (b: MarkerBox) => (b.must ? 1e12 : 0) + b.priority + (b.shown ? STICKY : 0);
  order.sort((a, c) => rank(boxes[c]!) - rank(boxes[a]!) || a - c);
  const grid = new Map<number, number[]>();
  const cand: number[] = [];
  const key = (gx: number, gy: number) => (gx + 32768) * 65536 + (gy + 32768);
  /** Overlap area of box i at (dx, dy) with everything placed so far. */
  const overlap = (b: MarkerBox, dx: number, dy: number, stopAtAny: boolean): number => {
    const bx = b.x + b.cx + dx;
    const by = b.y + b.cy + dy;
    const x0 = Math.floor((bx - b.w / 2 - CELL) / CELL);
    const x1 = Math.floor((bx + b.w / 2 + CELL) / CELL);
    const y0 = Math.floor((by - b.h / 2 - CELL) / CELL);
    const y1 = Math.floor((by + b.h / 2 + CELL) / CELL);
    let area = 0;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const cell = grid.get(key(gx, gy));
        if (!cell) continue;
        for (const j of cell) {
          const o = boxes[j]!;
          const px = (b.w + o.w) / 2 + GAP - Math.abs(o.x + o.cx + o.ox - bx);
          const py = (b.h + o.h) / 2 + GAP - Math.abs(o.y + o.cy + o.oy - by);
          if (px <= 0.25 || py <= 0.25) continue;
          area += px * py;
          if (stopAtAny) return area;
        }
      }
    }
    return area;
  };
  for (const i of order) {
    const b = boxes[i]!;
    const m = candidates(b, reach, cand);
    let best = -1;
    for (let k = 0; k < m; k++) {
      if (overlap(b, cand[k * 2]!, cand[k * 2 + 1]!, true) === 0) {
        best = k;
        break;
      }
    }
    if (best < 0 && b.must) {
      let least = Infinity;
      for (let k = 0; k < m; k++) {
        const a = overlap(b, cand[k * 2]!, cand[k * 2 + 1]!, false);
        if (a < least) {
          least = a;
          best = k;
        }
      }
    }
    if (best < 0) {
      // No room near its platoon: hidden, keeping last frame's offset to fade out where it stood.
      b.shown = false;
      if (!Number.isFinite(b.ox) || !Number.isFinite(b.oy)) b.ox = b.oy = 0;
      continue;
    }
    b.ox = cand[best * 2]!;
    b.oy = cand[best * 2 + 1]!;
    b.shown = true;
    const gx = Math.floor((b.x + b.cx + b.ox) / CELL);
    const gy = Math.floor((b.y + b.cy + b.oy) / CELL);
    const k = key(gx, gy);
    const cell = grid.get(k);
    if (cell) cell.push(i);
    else grid.set(k, [i]);
  }
}

/** Whether any two shown boxes overlap (by more than `slack` pixels on both axes). For tests and diagnostics. */
export function overlapping(boxes: readonly MarkerBox[], slack = 0.5): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    if (!a.shown) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!b.shown) continue;
      const px = (a.w + b.w) / 2 - Math.abs(b.x + b.cx + b.ox - (a.x + a.cx + a.ox));
      const py = (a.h + b.h) / 2 - Math.abs(b.y + b.cy + b.oy - (a.y + a.cy + a.oy));
      if (px > slack && py > slack) return true;
    }
  }
  return false;
}
