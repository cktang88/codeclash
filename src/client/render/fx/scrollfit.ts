// Pure layout helpers for the herald's scrolls, kept free of Pixi so they can be tested.

/** Shortens `msg` to at most `max` characters, ending in an ellipsis when it had to cut. */
export function clipScroll(msg: string, max: number): string {
  const one = msg.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * The shift, in screen pixels, that brings a box spanning [lo, hi] inside [min, max]; when the box
 * is larger than the room it is centred.
 */
export function clampShift(lo: number, hi: number, min: number, max: number): number {
  if (hi - lo >= max - min) return (min + max) / 2 - (lo + hi) / 2;
  if (lo < min) return min - lo;
  if (hi > max) return max - hi;
  return 0;
}
