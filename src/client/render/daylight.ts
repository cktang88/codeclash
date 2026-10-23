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
const KEYS: readonly [phase: number, mult: number, screen: number, lights: number, day: number][] = [
  [0.0, 0xf2c99a, 0x3c2610, 0.55, 0.4],
  [0.06, 0xfbe2bf, 0x1e1206, 0.15, 0.85],
  [0.16, 0xffffff, 0x000000, 0, 1],
  [0.5, 0xfffbf2, 0x000000, 0, 1],
  [0.64, 0xffe4bc, 0x140a00, 0, 1],
  [0.73, 0xf3a286, 0x2a0c06, 0.35, 0.6],
  [0.79, 0xb98aa8, 0x160a1e, 0.7, 0.25],
  [0.85, 0x8a98cc, 0x0c1226, 1, 0],
  [1.0, 0x8090c4, 0x0c1226, 1, 0],
];

export function daylightAt(phase: number): Daylight {
  const t = Math.max(0, Math.min(1, phase));
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

/** Where in its day the watched war is: live wars follow the real clock, the demo and replays follow simulated time. */
export function dayPhase(store: GameStore, tick: number): number {
  const war = store.war;
  if (store.replay) {
    const length = war ? war.endsAt - war.startsAt : DAY_MS;
    return ((tick * TICK_MS) / Math.max(1, length)) % 1;
  }
  if (!war || war.id === 0) return (tick % DEMO_DAY_TICKS) / DEMO_DAY_TICKS;
  const length = Math.max(1, war.endsAt - war.startsAt);
  return Math.max(0, Math.min(0.9999, (store.serverNow() - war.startsAt) / length));
}
