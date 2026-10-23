import { CUES, SAMPLES, SAMPLE_URL, type Bus } from './catalog.ts';
import { CULL_GAIN, spatial, seeded, VoiceLimiter, type Listener } from './mixer.ts';
import { Music } from './music.ts';
import { noiseSource, filter, type Voice } from './synth.ts';

export interface PlayOptions {
  /** World position, for panning and distance. */
  x?: number;
  y?: number;
  /** Relative loudness, 0..1. */
  gain?: number;
}

export interface EngineOptions {
  createContext?: () => AudioContext;
  fetchSample?: (url: string) => Promise<ArrayBuffer>;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
  rand?: () => number;
}

interface Settings {
  enabled: boolean;
  volume: number;
  music: boolean;
}

const STORAGE_KEY = 'pf:sound';
const BUS_GAIN: Record<Bus | 'music' | 'ambience', number> = { ui: 0.55, sfx: 0.8, set: 1, music: 0.42, ambience: 1 };
const DEFAULTS: Settings = { enabled: false, volume: 0.7, music: true };

/**
 * The game's sound: cues for the codex and the battlefield, an army's murmur
 * that swells with the fighting, and generative music. Silent until the
 * player opts in; every call is a cheap no-op while it is off.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus | 'music' | 'ambience', GainNode>> = {};
  private samples = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private limiter = new VoiceLimiter();
  private listener: Listener = { x: 0, y: 0, zoom: 1 };
  private music: Music | null = null;
  private murmur: GainNode | null = null;
  private intensity = 0;
  private time = 0.1;
  private settings: Settings;
  private subscribers = new Set<() => void>();
  private readonly rand: () => number;
  private readonly now: () => number;

  constructor(private readonly opts: EngineOptions = {}) {
    this.rand = opts.rand ?? seeded(Date.now() % 100000);
    this.now = opts.now ?? (() => performance.now());
    // A saved "on" still needs a gesture before a browser lets sound play, so
    // every page starts silent; `remembered` lets the UI offer to resume.
    this.settings = { ...DEFAULTS, ...this.load(), enabled: false };
  }

  enabled(): boolean {
    return this.settings.enabled;
  }

  /** Call from inside a click or key handler: browsers only start audio on a gesture. */
  setEnabled(on: boolean): void {
    if (on === this.settings.enabled) return;
    this.settings.enabled = on;
    this.save();
    if (on) {
      this.init();
      this.applyVolume();
      if (this.settings.music) this.music?.start();
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.music?.stop();
    }
    this.notify();
  }

  volume(): number {
    return this.settings.volume;
  }

  setVolume(v: number): void {
    this.settings.volume = Math.max(0, Math.min(1, v));
    this.save();
    this.applyVolume();
    this.notify();
  }

  musicEnabled(): boolean {
    return this.settings.music;
  }

  setMusicEnabled(on: boolean): void {
    this.settings.music = on;
    this.save();
    if (this.settings.enabled) {
      if (on) this.music?.start();
      else this.music?.stop();
    }
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Creates the audio graph and starts loading samples. Safe to call repeatedly. */
  init(): void {
    if (!this.ctx) {
      let ctx: AudioContext;
      try {
        ctx = (this.opts.createContext ?? defaultContext)();
      } catch {
        return;
      }
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      // Keep a little headroom after the compressor: peaks stay near −3 dBFS.
      const trim = ctx.createGain();
      trim.gain.value = 0.7;
      this.master.connect(comp).connect(trim).connect(ctx.destination);
      for (const bus of Object.keys(BUS_GAIN) as (keyof typeof BUS_GAIN)[]) {
        const g = ctx.createGain();
        g.gain.value = BUS_GAIN[bus];
        g.connect(this.master);
        this.buses[bus] = g;
      }
      this.music = new Music(ctx, this.buses.music!, this.rand);
      this.music.setIntensity(this.intensity);
      this.music.setTimeOfDay(this.time);
      this.startMurmur();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    this.loading ??= this.loadSamples();
  }

  /** Plays a cue. Returns whether it was voiced. Unknown names are ignored. */
  play(name: string, opts: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    if (!this.settings.enabled || !ctx || ctx.state === 'closed') return false;
    const cue = CUES[name];
    if (!cue) return false;
    let gain = opts.gain ?? 1;
    let pan = 0;
    if (cue.spatial && opts.x !== undefined && opts.y !== undefined) {
      const s = spatial(this.listener, opts.x, opts.y);
      gain *= s.gain;
      pan = s.pan;
    }
    if (gain < CULL_GAIN) return false;
    if (!this.limiter.admit(name, cue, this.now(), cue.durationMs)) return false;
    const out = ctx.createGain();
    out.gain.value = Math.min(1.5, gain);
    let head: AudioNode = out;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      head = panner;
    }
    head.connect(this.buses[cue.bus]!);
    const voice: Voice = { ctx, out, t: ctx.currentTime + 0.01, rand: this.rand };
    const dur = cue.recipe(voice, (sample, o = {}) => {
      const buf = this.samples.get(sample);
      if (!buf) return 0;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const rate = o.rate ?? 1;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = o.gain ?? 1;
      src.connect(g).connect(out);
      const delay = o.delay ?? 0;
      src.start(voice.t + delay);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
      };
      return delay + buf.duration / rate;
    });
    // Release the cue's own nodes once its tail has rung out.
    setTimeout(() => {
      out.disconnect();
      if (head !== out) head.disconnect();
    }, (Math.max(dur, cue.durationMs / 1000) + 0.6) * 1000);
    return true;
  }

  /** Where the camera is, in world units, and how far it is zoomed in. */
  setListener(x: number, y: number, zoom: number): void {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.zoom = zoom;
  }

  setBattleIntensity(x: number): void {
    this.intensity = Math.max(0, Math.min(1, x));
    this.music?.setIntensity(this.intensity);
    if (this.ctx && this.murmur) this.murmur.gain.setTargetAtTime(0.03 + 0.16 * this.intensity, this.ctx.currentTime, 1.2);
  }

  setTimeOfDay(t: number): void {
    this.time = Math.max(0, Math.min(1, t));
    this.music?.setTimeOfDay(this.time);
  }

  /** Samples loaded so far, for the lab page. */
  get loaded(): number {
    return this.samples.size;
  }

  private startMurmur(): void {
    const ctx = this.ctx!;
    // A distant army: low, slowly breathing noise, louder as the fighting grows.
    const g = ctx.createGain();
    g.gain.value = 0.03;
    g.connect(this.buses.ambience!);
    const voice: Voice = { ctx, out: g, t: ctx.currentTime, rand: this.rand };
    const breathe = ctx.createGain();
    breathe.gain.value = 0.7;
    breathe.connect(g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(breathe.gain);
    lfo.start();
    noiseSource(voice, filter(voice, 'bandpass', 420, 0.6, filter(voice, 'lowpass', 900, 0.5, breathe)), ctx.currentTime, ctx.currentTime + 1e6);
    this.murmur = g;
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const get = this.opts.fetchSample ?? (async (url: string) => (await fetch(url)).arrayBuffer());
    await Promise.all(
      SAMPLES.map(async (name) => {
        try {
          const data = await get(SAMPLE_URL(name));
          this.samples.set(name, await ctx.decodeAudioData(data));
        } catch {
          // A missing sample falls back to the cue's synthesized sound.
        }
      }),
    );
  }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    // Perceived loudness is roughly logarithmic: square the slider.
    const v = this.settings.enabled ? this.settings.volume * this.settings.volume : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private load(): Partial<Settings> {
    const store = this.storage();
    try {
      const raw = store?.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        enabled: parsed.enabled === true,
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
        music: parsed.music !== false,
      };
    } catch {
      return {};
    }
  }

  /** Whether the player had sound on last time; the UI may offer to turn it back on. */
  get remembered(): boolean {
    return this.load().enabled === true;
  }

  private save(): void {
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private windows may refuse storage; the setting just won't persist.
    }
  }

  private storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (this.opts.storage !== undefined) return this.opts.storage;
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private notify(): void {
    for (const fn of this.subscribers) fn();
  }
}

function defaultContext(): AudioContext {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not available');
  return new Ctor({ latencyHint: 'interactive' });
}
