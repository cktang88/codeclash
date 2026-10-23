import { TICK_MS, TICKS_PER_MINUTE } from '../../sim/api.ts';
import type { GameStore } from '../store.ts';
import { mixColor } from './paint.ts';

/** The light over the battlefield at one moment of the day. */
export interface Daylight {
  /** 0 at the reset (dawn) to 1 just before the next reset (deep night). */
  phase: number;
  /** Multiplied over the painted world: white at noon, crimson at dusk, ultramarine at night. */
  mult: number;
  /** Added (screen blend) over the world: warm haze at dawn, a cold lift at night so ink stays legible. */
  screen: number;
  /** 0..1 strength of emissive lights: windows, shrine glow, torches, fireflies. */
  lights: number;
  /** 0..1 how much daytime life is about: birds, butterflies, cloud shadows. */
  day: number;
}

// The war's clock is the sun: dawn gold at the reset, a neutral noon, a warm
// afternoon, crimson dusk, and an ultramarine night that runs into the next reset.
//
// The multiply wash stays light by day (every channel above ~0xd8) so pigments keep
// their saturation: the hour's colour comes mostly from the raking sun glow added in
// the renderer, never from a heavy tint that drags greens to olive or brown. Only the
// night wash is deep, and its screen lift is a cool blue, never a warm grey that would
// muddy the ink.
const KEYS: readonly [phase: number, mult: number, screen: number, lights: number, day: number][] = [
  [0.0, 0xffeccc, 0x000000, 0.4, 0.55],
  [0.06, 0xfff4e0, 0x000000, 0.1, 0.9],
  [0.16, 0xffffff, 0x000000, 0, 1],
  [0.5, 0xfffcf4, 0x000000, 0, 1],
  [0.64, 0xfff0d8, 0x000000, 0, 1],
  // Dusk is crimson, not rose or sepia: the wash takes green and blue together (so reds lean
  // crimson, not orange) but stays light, and the crimson itself comes from the low sun raking
  // in from the west. No red screen lift: red added over green reads as olive mud.
  [0.72, 0xffe2d4, 0x000000, 0.3, 0.65],
  [0.78, 0xffdad8, 0x0a0106, 0.65, 0.3],
  [0.85, 0x8a9cd6, 0x0a1430, 1, 0],
  [1.0, 0x8496d2, 0x0a1430, 1, 0],
];

export function daylightAt(phase: number): Daylight {
  // A missing clock reads as mid-morning, never as NaN tints that blank the grade.
  const t = Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) : 0.3;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= t) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  const s = k * k * (3 - 2 * k);
  return {
    phase: t,
    mult: mixColor(a[1], b[1], s),
    screen: mixColor(a[2], b[2], s),
    lights: a[3] + (b[3] - a[3]) * s,
    day: a[4] + (b[4] - a[4]) * s,
  };
}

/** The demo runs a whole day in this many simulated minutes, so a visitor sees dawn, dusk and night. */
const DEMO_DAY_TICKS = 24 * TICKS_PER_MINUTE;
const DAY_MS = 24 * 3600_000;

/**
 * Where in its day the watched war is. The sun follows the war's own clock, the simulated tick
 * (tick 0 is the war's start): a live war's ticks keep pace with the real clock, and when the
 * client is catching up, resyncing or waking from a sleeping tab the hour stays in step with the
 * soldiers on screen instead of jumping ahead of them. The demo runs a short day on repeat.
 */
export function dayPhase(store: Pick<GameStore, 'war' | 'replay'>, tick: number): number {
  const war = store.war;
  if (!Number.isFinite(tick) || tick < 0) tick = 0;
  if (store.replay) {
    const length = war ? war.endsAt - war.startsAt : DAY_MS;
    return ((tick * TICK_MS) / Math.max(1, length)) % 1;
  }
  if (!war || war.id === 0) return (tick % DEMO_DAY_TICKS) / DEMO_DAY_TICKS;
  const length = Math.max(1, war.endsAt - war.startsAt);
  return Math.max(0, Math.min(0.9999, (tick * TICK_MS) / length));
}
