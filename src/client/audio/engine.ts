import { CUES, SAMPLES, sampleUrls, type Bus, type SamplePlayer } from './catalog.ts';
import { CULL_GAIN, clamp01, spatial, seeded, VoiceLimiter, type Listener } from './mixer.ts';
import { Music } from './music.ts';
import { filter, newSink, noiseSource, release, track, until, type Voice } from './synth.ts';

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
  /** The page, for visibility and gestures; null for none. Defaults to the global document. */
  page?: PageEvents | null;
  /** Whether the browser decodes Ogg Vorbis. Defaults to asking an <audio> element. */
  canPlayOgg?: () => boolean;
}

/** The part of `document` the engine listens to. */
export interface PageEvents {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: string, fn: () => void, opts?: AddEventListenerOptions): void;
}

interface Settings {
  enabled: boolean;
  volume: number;
  music: boolean;
}

const STORAGE_KEY = 'pf:sound';
const BUS_GAIN: Record<Bus | 'music' | 'ambience', number> = { ui: 0.55, sfx: 0.8, set: 1, music: 0.42, ambience: 1 };
const DEFAULTS: Settings = { enabled: false, volume: 0.7, music: true };
/** Fade before suspending, so going quiet never clicks. */
const FADE_S = 0.06;
const SUSPEND_AFTER_MS = 300;
/** After asking a context to resume from a gesture, cues may be scheduled while it wakes. */
const RESUME_GRACE_MS = 600;

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
  private hidden = false;
  private listening = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private resumingUntil = -Infinity;
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
      if (this.settings.music) this.music?.start();
    } else {
      this.music?.stop();
    }
    this.sync();
    this.notify();
  }

  volume(): number {
    return this.settings.volume;
  }

  setVolume(v: number): void {
    this.settings.volume = clamp01(v, this.settings.volume);
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

  /** Creates the audio graph and starts loading samples. Call from a gesture. Safe to call repeatedly. */
  init(): void {
    this.listen();
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
      // iOS interrupts audio for calls and Siri, and some browsers suspend a context on their
      // own; once the interruption ends, ask to run again if the player still wants sound.
      ctx.addEventListener?.('statechange', () => {
        if (ctx.state !== 'running' && ctx.state !== 'closed' && this.wanted()) this.resume();
      });
    }
    this.resume();
    this.loading ??= this.loadSamples().then(() => {
      // Nothing loaded (offline, say): try again the next time sound is turned on.
      if (this.samples.size === 0) this.loading = null;
    });
  }

  /** Plays a cue. Returns whether it was voiced. Unknown names are ignored. */
  play(name: string, opts: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    if (!this.settings.enabled || !ctx || !this.audible(ctx)) return false;
    const cue = CUES[name];
    if (!cue) return false;
    let gain = opts.gain ?? 1;
    if (!Number.isFinite(gain)) return false;
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
    const sink = newSink();
    const voice: Voice = { ctx, out, t: ctx.currentTime + 0.01, rand: this.rand, sink };
    const player: SamplePlayer = (sample, o = {}) => {
      const buf = this.samples.get(sample);
      if (!buf) return 0;
      const src = track(voice, ctx.createBufferSource());
      src.buffer = buf;
      const rate = o.rate ?? 1;
      src.playbackRate.value = rate;
      const g = track(voice, ctx.createGain());
      g.gain.value = o.gain ?? 1;
      src.connect(g).connect(out);
      const delay = o.delay ?? 0;
      src.start(voice.t + delay);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
      };
      until(voice, voice.t + delay + buf.duration / rate);
      return delay + buf.duration / rate;
    };
    let dur: number;
    try {
      dur = cue.recipe(voice, player);
    } catch {
      // Sound is garnish: a bad recipe must not break the frame that asked for it.
      sink.nodes.push(out, head);
      release(sink);
      return false;
    }
    // Release every node of the cue once its last source has stopped. A recipe's return value
    // can undershoot its real tail (a late bell), so the sources' own stop times decide.
    sink.nodes.push(out);
    if (head !== out) sink.nodes.push(head);
    until(voice, voice.t + Math.max(dur, cue.durationMs / 1000));
    this.releaseAfter(ctx, sink);
    return true;
  }

  /** Disconnects a voice's nodes when the context clock passes its end; waits out a suspended clock. */
  private releaseAfter(ctx: AudioContext, sink: ReturnType<typeof newSink>): void {
    const left = sink.end + 0.15 - ctx.currentTime;
    if (left <= 0 || ctx.state === 'closed') release(sink);
    else setTimeout(() => this.releaseAfter(ctx, sink), Math.max(250, left * 1000));
  }

  /** Where the camera is, in world units, and how far it is zoomed in. */
  setListener(x: number, y: number, zoom: number): void {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.zoom = zoom;
  }

  setBattleIntensity(x: number): void {
    const next = clamp01(x, this.intensity);
    const changed = Math.abs(next - this.intensity) > 0.002;
    this.intensity = next;
    this.music?.setIntensity(this.intensity);
    // Only while the clock runs: a frozen clock would pile automation events at one instant.
    if (changed && this.ctx && this.murmur && this.ctx.state === 'running') this.murmur.gain.setTargetAtTime(0.03 + 0.16 * this.intensity, this.ctx.currentTime, 1.2);
  }

  setTimeOfDay(t: number): void {
    this.time = clamp01(t, this.time);
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
    g.gain.value = 0.03 + 0.16 * this.intensity;
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
    const get = this.opts.fetchSample ?? defaultFetch;
    const preferOgg = (this.opts.canPlayOgg ?? canPlayOgg)();
    await Promise.all(
      SAMPLES.map(async (name) => {
        // Try the preferred format, then the other: Safari before 18.4 can't decode Vorbis.
        for (const url of sampleUrls(name, preferOgg)) {
          try {
            const buf = await decode(ctx, await get(url));
            this.samples.set(name, buf);
            return;
          } catch {
            // Next format; if none decode, the cue falls back to its synthesized sound.
          }
        }
      }),
    );
  }

  /** Whether the player wants to hear sound right now. */
  private wanted(): boolean {
    return this.settings.enabled && !this.hidden;
  }

  /** Whether a cue scheduled now would sound now, rather than all at once when a frozen clock restarts. */
  private audible(ctx: AudioContext): boolean {
    if (this.hidden) return false;
    if (ctx.state === 'running') return true;
    return ctx.state === 'suspended' && this.now() < this.resumingUntil;
  }

  private resume(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    this.resumingUntil = this.now() + RESUME_GRACE_MS;
    try {
      void ctx.resume().catch(() => undefined);
    } catch {
      // Not allowed yet; the next gesture tries again.
    }
  }

  /** Fades in and runs while sound is wanted; otherwise fades out, then suspends the clock to save the battery. */
  private sync(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (this.wanted()) {
      this.resume();
      this.applyVolume();
      return;
    }
    this.applyVolume();
    if (ctx.state !== 'running') return;
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.wanted() && ctx.state === 'running') void ctx.suspend?.().catch(() => undefined);
    }, SUSPEND_AFTER_MS);
  }

  /** Follows the page: quiet while hidden, and a gesture wakes a context the browser stopped. */
  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    const page = this.opts.page !== undefined ? this.opts.page : typeof document === 'undefined' ? null : document;
    if (!page) return;
    this.hidden = page.visibilityState === 'hidden';
    page.addEventListener('visibilitychange', () => {
      const hidden = page.visibilityState === 'hidden';
      if (hidden === this.hidden) return;
      this.hidden = hidden;
      this.sync();
    });
    const wake = () => {
      if (this.wanted() && this.ctx && this.ctx.state !== 'running') this.resume();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend']) page.addEventListener(type, wake, { capture: true, passive: true });
  }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    // Perceived loudness is roughly logarithmic: square the slider.
    const v = this.wanted() ? this.settings.volume * this.settings.volume : 0;
    const t = this.ctx.currentTime;
    // Ramp from where the gain is now, so neither a slider drag nor a mute clicks.
    const p = this.master.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(v, t, v === 0 ? FADE_S / 3 : 0.05);
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

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  // A missing file comes back as the app's index.html; don't hand that to the decoder.
  if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

function canPlayOgg(): boolean {
  try {
    return typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return true;
  }
}

/** decodeAudioData, also for old Safari's callback-only form that returns undefined. */
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const ret = ctx.decodeAudioData(data, resolve, (e) => reject(e ?? new Error('decode failed'))) as Promise<AudioBuffer> | undefined;
    ret?.then(resolve, reject);
  });
}

function defaultContext(): AudioContext {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not available');
  return new Ctor({ latencyHint: 'interactive' });
}
