// Combat impact, as pure functions: how far a blow shoves a soldier, and how the shove eases.
// Render-only: the result is an offset on the sprite that decays back to the sim position.

/** Knockback's fast out: this fraction of its time; the rest is the eased return. */
export const KNOCK_OUT = 0.22;

/**
 * World units a blow pushes its victim. `share` is damage over the victim's max hp, `power` the
 * attacker's heft (1 a line soldier, ~2 a Troll, a charge or a blast), `size` the victim's size
 * stat: light soldiers fly further, a Golem, Troll or Dragon barely budges.
 */
export function knockDistance(share: number, power: number, size: number): number {
  const s = Math.max(0, Math.min(1, share * 3));
  const mass = Math.pow(Math.max(5, size) / 6, 1.25);
  const d = ((2 + 10 * s) * power) / mass;
  return Number.isFinite(d) ? Math.max(0.6, Math.min(12, d)) : 0.6;
}

/** How long the shove and return take, ms. */
export function knockMs(share: number): number {
  return 150 + 100 * Math.max(0, Math.min(1, share * 3));
}

/** Envelope of the shove at t in [0, 1]: a fast ease-out to 1, then a smooth return to 0. */
export function knockCurve(t: number): number {
  if (!(t > 0) || t >= 1) return 0;
  if (t < KNOCK_OUT) {
    const q = 1 - t / KNOCK_OUT;
    return 1 - q * q;
  }
  const q = (t - KNOCK_OUT) / (1 - KNOCK_OUT);
  return 1 - q * q * (3 - 2 * q);
}

/** Hitstop for attacker and victim of a melee blow, ms: 40 to 100, scaled by the blow. */
export function hitstopMs(share: number, heavy: boolean): number {
  return 40 + 50 * Math.max(0, Math.min(1, share * 3)) + (heavy ? 10 : 0);
}
