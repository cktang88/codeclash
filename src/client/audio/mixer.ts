// Pure audio bookkeeping: who may sound now, and how loud and where. No WebAudio
// here, so it can be tested directly.

export interface Listener {
  x: number;
  y: number;
  zoom: number;
}

/** Screen pixels at which a sound has fallen to half its gain. */
export const HALF_GAIN_PX = 520;
/** Below this gain a positional sound is not worth a voice. */
export const CULL_GAIN = 0.04;
/** How far left or right the pan can swing. */
const MAX_PAN = 0.85;
/** Screen width (px) over which pan sweeps from centre to MAX_PAN. */
const PAN_SPAN_PX = 760;

/**
 * Gain and stereo pan of a sound at world (x, y) heard from the camera.
 * Distance is measured on screen, so zooming in brings the fight closer; when
 * the whole map is in view, individual blows are softened to a wash.
 */
export function spatial(listener: Listener, x: number, y: number): { gain: number; pan: number } {
  const zoom = Math.max(0.05, listener.zoom);
  const dx = (x - listener.x) * zoom;
  const dy = (y - listener.y) * zoom;
  const d2 = dx * dx + dy * dy;
  const falloff = 1 / (1 + d2 / (HALF_GAIN_PX * HALF_GAIN_PX));
  const distance = Math.min(1, Math.max(0.3, zoom / 0.7));
  return {
    gain: falloff * distance,
    pan: Math.max(-MAX_PAN, Math.min(MAX_PAN, (dx / PAN_SPAN_PX) * MAX_PAN)),
  };
}

export interface CueLimits {
  /** Minimum milliseconds between two starts of this cue. */
  cooldownMs: number;
  /** Most voices of this cue sounding at once. */
  maxVoices: number;
  /** Set pieces and UI always get a voice, stealing from combat if needed. */
  priority: 'ui' | 'set' | 'combat';
}

interface Voice {
  cue: string;
  endsAt: number;
  priority: CueLimits['priority'];
}

/**
 * Decides which cues may start. Combat noise from thousands of soldiers is
 * thinned by per-cue cooldowns and voice caps, so a great clash reads as a
 * roar of steel rather than a wall of clipping.
 */
export class VoiceLimiter {
  private voices: Voice[] = [];
  private lastStart = new Map<string, number>();

  constructor(readonly maxVoices = 28) {}

  /** Whether `cue` may start at `now` (ms), lasting `durationMs`. Records the voice if so. */
  admit(cue: string, limits: CueLimits, now: number, durationMs: number): boolean {
    this.voices = this.voices.filter((v) => v.endsAt > now);
    const last = this.lastStart.get(cue);
    if (limits.priority === 'combat' && last !== undefined && now - last < limits.cooldownMs) return false;
    if (limits.priority !== 'combat' && last !== undefined && now - last < Math.min(limits.cooldownMs, 60)) return false;
    let same = 0;
    for (const v of this.voices) if (v.cue === cue) same++;
    if (same >= limits.maxVoices) return false;
    if (this.voices.length >= this.maxVoices) {
      if (limits.priority === 'combat') return false;
      // Steal the combat voice that will end soonest.
      let steal = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i]!;
        if (v.priority === 'combat' && (steal < 0 || v.endsAt < this.voices[steal]!.endsAt)) steal = i;
      }
      if (steal < 0) return false;
      this.voices.splice(steal, 1);
    }
    this.voices.push({ cue, endsAt: now + durationMs, priority: limits.priority });
    this.lastStart.set(cue, now);
    return true;
  }

  active(now: number): number {
    return this.voices.filter((v) => v.endsAt > now).length;
  }
}

/** Smooths a control value toward a target, e.g. battle intensity from noisy samples. */
export function approach(current: number, target: number, dtMs: number, halfLifeMs: number): number {
  const k = 1 - Math.pow(0.5, dtMs / halfLifeMs);
  return current + (target - current) * k;
}

/** A small seeded generator, so music phrases vary without Math.random in tests. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
