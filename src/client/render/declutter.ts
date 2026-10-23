/**
 * Screen-space room-making for far-zoom platoon tokens: boxes that overlap are pushed
 * apart along the axis that needs the least travel (stacking vertically on a tie), and
 * every box keeps a gentle pull back toward its true place, so a token only strays as
 * far as its neighbours force it. Pure arithmetic, no Pixi, so it can be tested.
 */
export interface DeclutterBox {
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
}

/** Fraction of last frame's offset kept before relaxing again: tokens drift home once the crowd thins. */
const RETURN = 0.9;
const GAP = 2;

/**
 * Relaxes `boxes` in place. `order` is scratch space (reused to avoid allocating per frame).
 * Runs a sweep over x so dense crowds cost about n log n per pass, not n squared.
 */
export function declutter(boxes: DeclutterBox[], passes = 6, order: number[] = []): void {
  const n = boxes.length;
  for (const b of boxes) {
    b.ox = Number.isFinite(b.ox) ? b.ox * RETURN : 0;
    b.oy = Number.isFinite(b.oy) ? b.oy * RETURN : 0;
  }
  if (n < 2) return;
  order.length = n;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) order[i] = i;
    const left = (i: number) => boxes[i]!.x + boxes[i]!.cx + boxes[i]!.ox - boxes[i]!.w / 2;
    order.sort((a, b) => left(a) - left(b) || a - b);
    let moved = false;
    for (let s = 0; s < n; s++) {
      const a = boxes[order[s]!]!;
      for (let t = s + 1; t < n; t++) {
        const b = boxes[order[t]!]!;
        const ax = a.x + a.cx + a.ox;
        const bx = b.x + b.cx + b.ox;
        // Sorted by left edge: once b starts past a's right edge, nothing later can touch a.
        if (bx - b.w / 2 >= ax + a.w / 2 + GAP) break;
        const ay = a.y + a.cy + a.oy;
        const by = b.y + b.cy + b.oy;
        const px = (a.w + b.w) / 2 + GAP - Math.abs(bx - ax);
        const py = (a.h + b.h) / 2 + GAP - Math.abs(by - ay);
        if (px <= 0 || py <= 0) continue;
        moved = true;
        // Prefer a vertical stack: it reads as a column of tokens, and keeps the front line's x.
        if (py <= px * 1.6) {
          const dir = by > ay || (by === ay && order[t]! > order[s]!) ? 1 : -1;
          a.oy -= (py / 2) * dir;
          b.oy += (py / 2) * dir;
        } else {
          const dir = bx > ax || (bx === ax && order[t]! > order[s]!) ? 1 : -1;
          a.ox -= (px / 2) * dir;
          b.ox += (px / 2) * dir;
        }
      }
    }
    if (!moved) break;
  }
}

/** Whether any two boxes still overlap (by more than `slack` pixels on both axes). For tests and diagnostics. */
export function overlapping(boxes: readonly DeclutterBox[], slack = 0.5): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const px = (a.w + b.w) / 2 - Math.abs(b.x + b.cx + b.ox - (a.x + a.cx + a.ox));
      const py = (a.h + b.h) / 2 - Math.abs(b.y + b.cy + b.oy - (a.y + a.cy + a.oy));
      if (px > slack && py > slack) return true;
    }
  }
  return false;
}
