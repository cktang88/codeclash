import type { CueLimits } from './mixer.ts';
import { bell, boom, bowstring, choir, clatter, crack, drum, fire, horn, roar, shout, sparkle, stopAfter, tick, track, whoosh, type Voice } from './synth.ts';

/** Plays a bundled sample; returns its length in seconds, or 0 if it has not loaded. */
export type SamplePlayer = (name: string, opts?: { gain?: number; rate?: number; delay?: number }) => number;

export type Recipe = (v: Voice, sample: SamplePlayer) => number;

export type Bus = 'ui' | 'sfx' | 'set';

export interface Cue extends CueLimits {
  bus: Bus;
  /** Expected length, for voice bookkeeping before the sound is built. */
  durationMs: number;
  /** Positional: panned and attenuated by distance from the camera. */
  spatial: boolean;
  recipe: Recipe;
}

/** Picks one of several numbered variants: `clash` → clash-1 … clash-n. */
const pick = (v: Voice, base: string, n: number) => `${base}-${1 + Math.floor(v.rand() * n)}`;
const vary = (v: Voice, spread: number) => 1 + (v.rand() * 2 - 1) * spread;

const ui = (recipe: Recipe, durationMs = 300): Cue => ({ bus: 'ui', priority: 'ui', cooldownMs: 40, maxVoices: 3, durationMs, spatial: false, recipe });
const combat = (recipe: Recipe, cooldownMs: number, maxVoices: number, durationMs: number): Cue => ({ bus: 'sfx', priority: 'combat', cooldownMs, maxVoices, durationMs, spatial: true, recipe });
const set = (recipe: Recipe, durationMs: number, spatial = true, cooldownMs = 250): Cue => ({ bus: 'set', priority: 'set', cooldownMs, maxVoices: 2, durationMs, spatial, recipe });

// Pitches of the Dorian mode on D, shared with the music so set pieces sit in key.
const D3 = 146.83;
const A3 = 220;
const D4 = 293.66;
const F4 = 349.23;
const A4 = 440;
const D5 = 587.33;

export const CUES: Record<string, Cue> = {
  // ------------------------------------------------------------- the codex
  'ui.click': ui((v) => tick(v, 0.9), 90),
  'ui.quill': ui((v, s) => s(pick(v, 'quill', 3), { gain: 0.55, rate: vary(v, 0.06) }) || tick(v, 0.3)),
  'ui.page': ui((v, s) => s(pick(v, 'parchment', 3), { gain: 0.7, rate: vary(v, 0.05) }) || whoosh(v, 0.25, 2500, 900, 0.2), 450),
  'ui.open': ui((v, s) => {
    s(pick(v, 'parchment', 3), { gain: 0.6, rate: 1.04 });
    return s(pick(v, 'cloth', 2), { gain: 0.3, delay: 0.04 }) || whoosh(v, 0.3, 1800, 700, 0.18);
  }, 500),
  'ui.close': ui((v, s) => s(pick(v, 'parchment', 3), { gain: 0.9, rate: 0.9 }) || whoosh(v, 0.25, 900, 2200, 0.15), 400),
  'ui.seal': ui((v, s) => {
    // Wax pressed: a soft thump with a leathery press.
    boom(v, 140, 0.18, 0.28);
    return Math.max(0.2, s(pick(v, 'seal', 2), { gain: 0.8, rate: vary(v, 0.04) }));
  }, 350),
  'ui.coin': ui((v, s) => s(pick(v, 'coin', 2), { gain: 0.6, rate: vary(v, 0.05) }) || bell(v, 2400, 0.12, 0.3), 600),
  'ui.toast': ui((v) => bell(v, 1320, 0.2, 1.1), 1100),

  // ---------------------------------------------------------------- combat
  swing: combat((v, s) => s(pick(v, 'blade', 3), { gain: 0.12, rate: vary(v, 0.12) }) || whoosh(v, 0.14, 2200, 1200, 0.12), 70, 3, 250),
  'hit-steel': combat((v, s) => s(pick(v, 'clash', 6), { gain: 1, rate: vary(v, 0.1) }) || tick(v, 0.3), 45, 5, 400),
  'hit-heavy': combat((v, s) => {
    const steel = s(pick(v, 'clash', 6), { gain: 0.75, rate: 0.75 * vary(v, 0.06) });
    const thud = s(pick(v, 'thud', 3), { gain: 0.9, rate: vary(v, 0.08) });
    return steel || thud ? Math.max(steel, thud) : boom(v, 120, 0.35, 0.35);
  }, 90, 3, 500),
  'bow-volley': combat((v) => {
    // A volley: several strings loosed almost together.
    for (let i = 0; i < 4; i++) bowstring(v, 0.16, v.t + i * 0.03 + v.rand() * 0.03);
    return 0.4;
  }, 180, 2, 450),
  'arrow-thunk': combat((v, s) => s(pick(v, 'thud', 3), { gain: 0.55, rate: 1.8 * vary(v, 0.1) }) || tick(v, 0.2), 70, 3, 200),
  'tower-bolt': combat((v, s) => {
    whoosh(v, 0.28, 3500, 1200, 0.22);
    s(pick(v, 'clash', 6), { gain: 0.25, rate: 1.3, delay: 0.22 });
    return 0.5;
  }, 160, 2, 500),
  'fireball-cast': combat((v) => {
    whoosh(v, 0.5, 400, 1600, 0.35);
    return fire(v, 0.45, 0.18);
  }, 200, 2, 600),
  'fireball-blast': combat((v, s) => {
    boom(v, 95, 0.9, 0.55);
    fire(v, 1.0, 0.3, v.t + 0.02);
    s(pick(v, 'stone', 3), { gain: 0.25, rate: 1.2, delay: 0.05 });
    return 1.1;
  }, 140, 3, 1200),
  'trebuchet-launch': combat((v, s) => {
    s('creak-1', { gain: 0.5, rate: 0.8 * vary(v, 0.06) });
    s(pick(v, 'thud', 3), { gain: 0.45, rate: 0.7, delay: 0.25 });
    whoosh(v, 0.7, 500, 220, 0.3, v.t + 0.3);
    return 1.1;
  }, 400, 2, 1200),
  'boulder-impact': combat((v, s) => {
    boom(v, 70, 0.9, 0.6);
    s(pick(v, 'stone', 3), { gain: 0.6, rate: 0.8 * vary(v, 0.08) });
    return 1;
  }, 200, 2, 1000),
  'dragon-breath': combat((v) => {
    roar(v, 70, 0.6, 0.25);
    return fire(v, 1.6, 0.5, v.t + 0.08);
  }, 500, 2, 1800),
  heal: combat((v) => sparkle(v, 0.13, 4), 160, 2, 500),
  'heal-holy': combat((v) => {
    sparkle(v, 0.06, 6);
    return choir(v, [D4, A4], 1.1, 0.04);
  }, 350, 1, 1200),
  death: combat((v, s) => s(pick(v, 'cloth', 2), { gain: 0.3, rate: vary(v, 0.1) }) || boom(v, 160, 0.2, 0.15), 60, 3, 400),
  'death-bones': combat((v) => clatter(v, 0.65), 120, 2, 450),
  'death-big': combat((v, s) => {
    boom(v, 85, 0.6, 0.5);
    return Math.max(0.6, s(pick(v, 'thud', 3), { gain: 0.6, rate: 0.6 }));
  }, 150, 2, 700),
  'troll-grunt': combat((v) => roar(v, 82 * vary(v, 0.08), 0.55, 0.22), 900, 1, 600),

  // ------------------------------------------------------------ set pieces
  'muster-horn': set((v) => horn(v, [[D4, 0, 0.55], [A4, 0.6, 1.1]], 0.16), 1800, true, 600),
  'gate-open': set((v, s) => s('door-1', { gain: 0.6, rate: 0.7 }) || s('creak-1', { gain: 0.6, rate: 0.6 }) || whoosh(v, 0.6, 300, 120, 0.2), 1200),
  'banner-unfurl': set((v, s) => {
    s(pick(v, 'cloth', 2), { gain: 0.5, rate: 0.85 });
    return whoosh(v, 0.5, 900, 2600, 0.12);
  }, 600),
  'scroll-unroll': set((v, s) => s(pick(v, 'parchment', 3), { gain: 0.6, rate: 0.8 }) || whoosh(v, 0.45, 1200, 3000, 0.12), 600),
  'rank-up': set((v) => {
    // Gold leaf: a rising arpeggio of bells.
    bell(v, D5, 0.1, 1.4);
    bell(v, D5 * 1.26, 0.09, 1.4, v.t + 0.1);
    return bell(v, D5 * 1.5, 0.1, 1.8, v.t + 0.2) + 0.2;
  }, 2000, false),
  'dragon-shadow': set((v) => {
    // Great wings passing overhead: two slow gusts.
    whoosh(v, 2.2, 160, 900, 0.7);
    return whoosh(v, 1.8, 120, 400, 0.55, v.t + 0.5) + 0.5;
  }, 2400, false),
  'dragon-roar': set((v) => roar(v, 64, 2.4, 0.42), 2500, true, 1500),
  'dragon-slain': set((v) => {
    roar(v, 58, 1.8, 0.35);
    return boom(v, 48, 2.4, 0.6, v.t + 1.2) + 1.2;
  }, 3800, true, 2000),
  'sack-bell': set((v, s) => {
    // Three tolls, the last fading long.
    const first = s('bell-1', { gain: 0.8, rate: 0.55 });
    if (!first) bell(v, 196, 0.25, 3);
    s('bell-2', { gain: 0.7, rate: 0.5, delay: 1.3 }) || bell(v, 185, 0.22, 3, v.t + 1.3);
    s('bell-1', { gain: 0.6, rate: 0.48, delay: 2.6 }) || bell(v, 175, 0.2, 4, v.t + 2.6);
    return 5;
  }, 5000, false, 4000),
  'sack-collapse': set((v, s) => {
    boom(v, 55, 2.2, 0.7);
    s('stone-1', { gain: 0.7, rate: 0.6 });
    s('stone-2', { gain: 0.6, rate: 0.5, delay: 0.3 });
    s('stone-3', { gain: 0.5, rate: 0.55, delay: 0.7 });
    fire(v, 2.5, 0.25, v.t + 0.3);
    return 2.8;
  }, 3000),
  'monolith-crack': set((v, s) => {
    s(pick(v, 'stone', 3), { gain: 0.5, rate: 1.4 });
    return crack(v, 0.4);
  }, 600, true, 400),
  'monolith-fall': set((v, s) => {
    crack(v, 0.5);
    boom(v, 42, 3.5, 0.85, v.t + 0.35);
    s('stone-1', { gain: 0.8, rate: 0.45, delay: 0.4 });
    s('stone-3', { gain: 0.7, rate: 0.4, delay: 0.9 });
    choir(v, [D3, A3, D4], 3.4, 0.05, v.t + 0.8);
    return 4.2;
  }, 4300, false, 3000),
  capture: set((v) => horn(v, [[A3, 0, 0.35], [D4, 0.3, 0.9]], 0.11), 1300),
  rebuilt: set((v, s) => {
    s(pick(v, 'thud', 3), { gain: 0.4, rate: 0.9 });
    s(pick(v, 'thud', 3), { gain: 0.35, rate: 1.05, delay: 0.25 });
    return bell(v, A4, 0.06, 1.2, v.t + 0.5) + 0.5;
  }, 1800),
  'war-cry': set((v) => {
    shout(v, 1.6, 0.35);
    return horn(v, [[D4, 0, 1.6], [F4, 0, 1.6], [A4, 0, 1.6]], 0.08);
  }, 1800, true, 1000),
  rout: set((v, s) => {
    for (let i = 0; i < 6; i++) s(pick(v, 'step', 3), { gain: 0.3, rate: 1.3 * vary(v, 0.1), delay: i * 0.09 });
    return horn(v, [[A3, 0.1, 0.25], [F4 / 2, 0.35, 0.5]], 0.06) + 0.1;
  }, 900, true, 400),
  desert: set((v, s) => {
    s(pick(v, 'cloth', 2), { gain: 0.35, rate: 0.8 });
    // A falling minor third, quietly.
    osc2(v, F4, 0.5, 0.05);
    return osc2(v, D4, 0.9, 0.05, v.t + 0.3) + 0.3;
  }, 1200, false, 800),
  regroup: set((v) => horn(v, [[D4, 0, 0.25], [D4, 0.28, 0.4]], 0.12), 700),
  'day-end': set((v) => {
    choir(v, [D3, A3, D4, F4], 5.5, 0.07);
    bell(v, D4, 0.08, 5, v.t + 3.2);
    return 6;
  }, 6000, false, 10_000),
  // Victory fanfares, chosen in the Armory and played for the day's winner.
  'fanfare-horn': set((v) => horn(v, [[D4, 0, 0.3], [F4, 0.3, 0.3], [A4, 0.6, 0.45], [D5, 1.05, 1.4]], 0.1), 2600, false, 8000),
  'fanfare-drums': set((v) => {
    for (let i = 0; i < 8; i++) drum(v, i % 4 === 3 ? 70 : 95, i === 7 ? 0.7 : 0.45, v.t + i * 0.18);
    return horn(v, [[A3, 1.45, 0.3], [D4, 1.7, 1.1]], 0.1) + 1.45;
  }, 3000, false, 8000),
  'fanfare-choir': set((v) => {
    choir(v, [D3, A3, D4, F4, A4], 3.2, 0.07);
    return bell(v, D5, 0.06, 2.4, v.t + 1.2) + 1.2;
  }, 3600, false, 8000),
  'march-drum': combat((v) => drum(v, 90, 0.5), 300, 1, 400),
};

/** A plain soft tone, for small sad or sweet notes. */
function osc2(v: Voice, freq: number, dur: number, gain: number, at = v.t): number {
  const g = track(v, v.ctx.createGain());
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(v.out);
  const o = track(v, v.ctx.createOscillator());
  o.type = 'triangle';
  o.frequency.value = freq;
  o.connect(g);
  stopAfter(v, o, at, at + dur);
  return dur;
}

/** Bundled samples (Kenney.nl, CC0), by name. */
export const SAMPLES = [
  'quill-1', 'quill-2', 'quill-3', 'parchment-1', 'parchment-2', 'parchment-3', 'seal-1', 'seal-2', 'coin-1', 'coin-2',
  'clash-1', 'clash-2', 'clash-3', 'clash-4', 'clash-5', 'clash-6', 'blade-1', 'blade-2', 'blade-3', 'thud-1', 'thud-2', 'thud-3',
  'stone-1', 'stone-2', 'stone-3', 'bell-1', 'bell-2', 'step-1', 'step-2', 'step-3', 'cloth-1', 'cloth-2', 'creak-1', 'door-1',
] as const;

/** Each sample ships as Ogg Vorbis and as AAC (.m4a), which Safari before 18.4 needs; there is no format every browser decodes. */
export const SAMPLE_FORMATS = ['ogg', 'm4a'] as const;

/** Where a sample may be fetched, in the order to try: the browser's preferred format first, the other as a fallback. */
export function sampleUrls(name: string, preferOgg = true): string[] {
  const formats = preferOgg ? SAMPLE_FORMATS : [...SAMPLE_FORMATS].reverse();
  return formats.map((ext) => `/audio/kenney/${name}.${ext}`);
}
