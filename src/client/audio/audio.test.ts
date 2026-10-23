import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUES, SAMPLES } from './catalog.ts';
import { SoundEngine } from './engine.ts';
import { CULL_GAIN, HALF_GAIN_PX, VoiceLimiter, seeded, spatial } from './mixer.ts';
import { Music } from './music.ts';

// ------------------------------------------------------------ a fake WebAudio

class Param {
  value = 0;
  peak = 0;
  private set(v: number) {
    this.value = v;
    this.peak = Math.max(this.peak, v);
    return this;
  }
  setValueAtTime(v: number) {
    return this.set(v);
  }
  linearRampToValueAtTime(v: number) {
    return this.set(v);
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new Error('exponential ramp to a non-positive value');
    return this.set(v);
  }
  setTargetAtTime(v: number) {
    return this.set(v);
  }
  cancelScheduledValues() {
    return this;
  }
}

class Node {
  connections = 0;
  /** Set when this node drives a parameter (an LFO depth), so its gain is not an audio level. */
  modulates = false;
  constructor(readonly fake: FakeContext) {}
  connect<T>(n: T): T {
    this.connections++;
    if (n instanceof Param) this.modulates = true;
    return n;
  }
  disconnect() {}
}

class Source extends Node {
  onended: (() => void) | null = null;
  started = false;
  start() {
    this.started = true;
    this.fake.started++;
  }
  stop() {}
}

class FakeContext {
  started = 0;
  gains: { gain: Param; node: Node }[] = [];
  currentTime = 1;
  sampleRate = 8000;
  state: AudioContextState = 'running';
  destination = new Node(this);
  resume = vi.fn(async () => undefined);
  createGain() {
    const n = Object.assign(new Node(this), { gain: new Param() });
    n.gain.value = 1;
    this.gains.push({ gain: n.gain, node: n });
    return n;
  }
  createOscillator() {
    return Object.assign(new Source(this), { type: 'sine', frequency: new Param(), detune: new Param() });
  }
  createBufferSource() {
    return Object.assign(new Source(this), { buffer: null, loop: false, playbackRate: new Param() });
  }
  createBiquadFilter() {
    return Object.assign(new Node(this), { type: 'lowpass', frequency: new Param(), Q: new Param() });
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(this), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() });
  }
  createWaveShaper() {
    return Object.assign(new Node(this), { curve: null });
  }
  createStereoPanner() {
    return Object.assign(new Node(this), { pan: new Param() });
  }
  createBuffer(_channels: number, length: number) {
    return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  async decodeAudioData() {
    return { duration: 0.4 };
  }
}

function engine(opts: { samples?: boolean; stored?: string | null; clock?: { t: number } } = {}) {
  const fake = new FakeContext();
  const store = new Map<string, string>();
  if (opts.stored) store.set('pf:sound', opts.stored);
  const clock = opts.clock ?? { t: 0 };
  const e = new SoundEngine({
    createContext: () => fake as unknown as AudioContext,
    fetchSample: opts.samples === false ? async () => Promise.reject(new Error('offline')) : async () => new ArrayBuffer(8),
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now: () => clock.t,
    rand: seeded(7),
  });
  return { e, fake, store, clock };
}

// ------------------------------------------------------------------ mixer

describe('spatial sound', () => {
  it('is full and centred at the camera, half at HALF_GAIN_PX, and panned by side', () => {
    const at = { x: 100, y: 100, zoom: 1 };
    expect(spatial(at, 100, 100)).toEqual({ gain: 1, pan: 0 });
    expect(spatial(at, 100 + HALF_GAIN_PX, 100).gain).toBeCloseTo(0.5, 5);
    expect(spatial(at, 500, 100).pan).toBeGreaterThan(0);
    expect(spatial(at, -300, 100).pan).toBeLessThan(0);
    expect(Math.abs(spatial(at, 1e6, 100).pan)).toBeLessThanOrEqual(0.85);
  });

  it('brings a fight closer when zooming in, and softens blows when the whole map is in view', () => {
    const near = spatial({ x: 0, y: 0, zoom: 2 }, 300, 0).gain;
    const far = spatial({ x: 0, y: 0, zoom: 0.5 }, 300, 0).gain;
    expect(far).toBeGreaterThan(spatial({ x: 0, y: 0, zoom: 1 }, 300, 0).gain * 0.5);
    expect(spatial({ x: 0, y: 0, zoom: 0.2 }, 0, 0).gain).toBeCloseTo(0.3, 5);
    expect(near).toBeLessThan(1);
  });
});

describe('voice limiting', () => {
  const combat = { cooldownMs: 50, maxVoices: 3, priority: 'combat' as const };
  const setPiece = { cooldownMs: 500, maxVoices: 2, priority: 'set' as const };

  it('holds a cue to its cooldown and voice cap', () => {
    const l = new VoiceLimiter(10);
    expect(l.admit('clash', combat, 0, 400)).toBe(true);
    expect(l.admit('clash', combat, 20, 400)).toBe(false);
    expect(l.admit('clash', combat, 60, 400)).toBe(true);
    expect(l.admit('clash', combat, 120, 400)).toBe(true);
    expect(l.admit('clash', combat, 180, 400)).toBe(false);
    expect(l.admit('clash', combat, 450, 400)).toBe(true);
  });

  it('never lets combat exceed the global cap, but set pieces steal a combat voice', () => {
    const l = new VoiceLimiter(4);
    for (let i = 0; i < 4; i++) expect(l.admit(`hit${i}`, combat, 0, 1000)).toBe(true);
    expect(l.admit('hit9', combat, 10, 1000)).toBe(false);
    expect(l.admit('dragon-roar', setPiece, 10, 2000)).toBe(true);
    expect(l.active(10)).toBe(4);
    expect(l.active(1500)).toBe(1);
  });
});

// ------------------------------------------------------------------ engine

describe('sound engine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays silent and builds nothing until the player opts in', () => {
    const { e, fake } = engine();
    expect(e.enabled()).toBe(false);
    expect(e.play('hit-steel', { x: 0, y: 0 })).toBe(false);
    expect(fake.started).toBe(0);
  });

  it('starts every page silent but remembers the player had sound on', () => {
    const { e, store } = engine({ stored: JSON.stringify({ enabled: true, volume: 0.4, music: false }) });
    expect(e.enabled()).toBe(false);
    expect(e.remembered).toBe(true);
    expect(e.volume()).toBe(0.4);
    expect(e.musicEnabled()).toBe(false);
    e.setVolume(2);
    expect(e.volume()).toBe(1);
    expect(JSON.parse(store.get('pf:sound')!)).toMatchObject({ volume: 1 });
  });

  it('plays every cue without error, with samples and with only synthesis', async () => {
    for (const samples of [true, false]) {
      const { e, fake, clock } = engine({ samples });
      e.setEnabled(true);
      await vi.runAllTimersAsync().catch(() => undefined);
      expect(e.loaded).toBe(samples ? SAMPLES.length : 0);
      for (const name of Object.keys(CUES)) {
        clock.t += 10_000;
        const before = fake.started;
        expect(e.play(name, { x: 0, y: 0 }), name).toBe(true);
        expect(fake.started, name).toBeGreaterThan(before);
      }
      e.setEnabled(false);
    }
  });

  it('keeps every cue to sane levels: no single envelope or sample gain above 1', () => {
    const { e, fake, clock } = engine({ samples: false });
    e.setEnabled(true);
    for (const name of Object.keys(CUES)) {
      clock.t += 10_000;
      const from = fake.gains.length;
      e.play(name, { x: 0, y: 0 });
      // The first gain made by play() is the cue's own level (≤ 1.5 by design); envelopes follow.
      for (const g of fake.gains.slice(from + 1)) if (!g.node.modulates) expect(g.gain.peak, name).toBeLessThanOrEqual(1);
    }
  });

  it('thins a great clash: hundreds of blows in a second voice only a handful', () => {
    const { e, clock } = engine();
    e.setEnabled(true);
    let voiced = 0;
    for (let i = 0; i < 500; i++) {
      clock.t = i * 2;
      if (e.play('hit-steel', { x: (i % 20) * 10, y: 0 })) voiced++;
    }
    expect(voiced).toBeGreaterThan(3);
    expect(voiced).toBeLessThanOrEqual(25);
  });

  it('culls positional sounds far off screen, and ignores unknown cues', () => {
    const { e } = engine();
    e.setEnabled(true);
    e.setListener(0, 0, 1);
    expect(e.play('hit-steel', { x: 100_000, y: 0 })).toBe(false);
    expect(spatial({ x: 0, y: 0, zoom: 1 }, 100_000, 0).gain).toBeLessThan(CULL_GAIN);
    expect(e.play('no-such-cue')).toBe(false);
  });

  it('notifies subscribers and survives a missing Web Audio', () => {
    const e = new SoundEngine({ createContext: () => { throw new Error('no audio'); }, storage: null });
    const seen = vi.fn();
    e.subscribe(seen);
    e.setEnabled(true);
    expect(seen).toHaveBeenCalled();
    expect(e.play('ui.click')).toBe(false);
  });
});

// ------------------------------------------------------------------- music

describe('music', () => {
  it('brings drums and choir in with the fighting and thins the lute at night', () => {
    const fake = new FakeContext();
    const m = new Music(fake as unknown as AudioContext, fake.createGain() as unknown as AudioNode, seeded(3));
    const calm = m.targets();
    expect(calm.drum).toBe(0);
    expect(calm.choir).toBeLessThan(0.05);
    (m as unknown as { intensity: number }).intensity = 1;
    const fierce = m.targets();
    expect(fierce.drum).toBeGreaterThan(0.5);
    expect(fierce.choir).toBeGreaterThan(0.3);
    (m as unknown as { intensity: number }).intensity = 0;
    m.setTimeOfDay(0.375);
    const noon = m.targets().lute;
    expect(m.mode).toEqual([0, 2, 3, 5, 7, 9, 10]);
    m.setTimeOfDay(0.95);
    expect(m.targets().lute).toBeLessThan(noon);
    expect(m.mode).toEqual([0, 1, 3, 5, 7, 8, 10]);
  });

  it('schedules notes ahead and stops cleanly', () => {
    vi.useFakeTimers();
    const fake = new FakeContext();
    const m = new Music(fake as unknown as AudioContext, fake.createGain() as unknown as AudioNode, seeded(5));
    m.setIntensity(1);
    m.start();
    for (let i = 0; i < 60; i++) {
      fake.currentTime += 0.12;
      vi.advanceTimersByTime(120);
    }
    expect(fake.started).toBeGreaterThan(20);
    m.stop();
    expect(m.running).toBe(false);
    vi.useRealTimers();
  });
});
