import { approach } from './mixer.ts';
import { choir, drum, type Voice } from './synth.ts';

// Modes as semitone steps from the root.
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const ROOT_HZ = 146.83; // D3
/** Chord roots the drone wanders between, in semitones above D: i, IV, bVII, v. */
const PROGRESSION = [0, 0, 5, 0, -2, 0, 7, 0];

const LOOKAHEAD_S = 0.7;
const TICK_MS = 120;
const SLOTS_PER_BAR = 8;
const BARS_PER_CHORD = 4;

const hz = (semitones: number) => ROOT_HZ * Math.pow(2, semitones / 12);
const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Layer {
  gain: GainNode;
  level: number;
}

/**
 * Generative modal music. A drone always breathes under the battlefield; a
 * lute wanders in short motifs that repeat with variation; frame drums and a
 * low choir join as the fighting grows. Dawn is Dorian and hopeful, night and
 * fierce battle turn Phrygian and sparse or driving.
 */
export class Music {
  private layers: Record<'drone' | 'lute' | 'drum' | 'choir', Layer>;
  private droneOscs: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private slot = 0;
  private bar = 0;
  private intensity = 0;
  private targetIntensity = 0;
  private time = 0.1;
  private motif: number[] = [];
  private motifUses = 0;
  private degree = 2;
  private lastTick = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly rand: () => number,
  ) {
    const layer = (): Layer => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      return { gain, level: 0 };
    };
    this.layers = { drone: layer(), lute: layer(), drum: layer(), choir: layer() };
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 320;
    this.droneFilter.Q.value = 0.8;
    this.droneFilter.connect(this.layers.drone.gain);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    const t = this.ctx.currentTime + 0.1;
    for (const [ratio, type, level] of [[1, 'sawtooth', 0.22], [1.5, 'sawtooth', 0.14], [0.5, 'sine', 0.5]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = ROOT_HZ * ratio;
      o.detune.value = (this.rand() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.droneFilter);
      o.start(t);
      this.droneOscs.push(o);
    }
    this.next = t;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.cancelScheduledValues(t);
      layer.gain.gain.setTargetAtTime(0, t, 0.4);
      layer.level = 0;
    }
    for (const o of this.droneOscs) o.stop(t + 2);
    this.droneOscs = [];
  }

  setIntensity(x: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, x));
  }

  /** 0 at the war's dawn, 1 at the next reset. */
  setTimeOfDay(t: number): void {
    this.time = Math.max(0, Math.min(1, t));
  }

  /** How bright the day is: 0 at night, 1 at noon. The war's day maps dawn → noon → dusk → night. */
  get daylight(): number {
    return Math.max(0, Math.sin(Math.min(1, this.time / 0.75) * Math.PI));
  }

  get mode(): readonly number[] {
    return this.daylight < 0.2 || this.intensity > 0.75 ? PHRYGIAN : DORIAN;
  }

  /** Target levels of each layer for the current mood. Exposed for tests. */
  targets(): Record<keyof Music['layers'], number> {
    const day = this.daylight;
    const i = this.intensity;
    return {
      drone: 0.32 + 0.1 * i,
      lute: (0.18 + 0.2 * day) * (1 - 0.4 * smooth(i, 0.6, 1)),
      drum: 0.55 * smooth(i, 0.18, 0.6),
      choir: 0.4 * smooth(i, 0.5, 0.9) + 0.12 * (1 - day) * smooth(this.time, 0.6, 0.8),
    };
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(1000, now - this.lastTick);
    this.lastTick = now;
    this.intensity = approach(this.intensity, this.targetIntensity, dt, 4000);
    const t = this.ctx.currentTime;
    const targets = this.targets();
    for (const [name, layer] of Object.entries(this.layers) as [keyof Music['layers'], Layer][]) {
      layer.level = approach(layer.level, targets[name], dt, 2500);
      layer.gain.gain.setTargetAtTime(layer.level, t, 0.3);
    }
    this.droneFilter.frequency.setTargetAtTime(240 + 380 * this.intensity + 160 * this.daylight, t, 0.8);
    // A suspended tab may wake us late: skip ahead rather than play a backlog.
    if (this.next < t) this.next = t + 0.05;
    const slotDur = 60 / (66 + 24 * this.intensity) / 2;
    while (this.next < t + LOOKAHEAD_S) {
      this.playSlot(this.next, slotDur);
      this.next += slotDur;
      this.slot++;
      if (this.slot % SLOTS_PER_BAR === 0) {
        this.bar++;
        if (this.bar % BARS_PER_CHORD === 0) this.changeChord(this.next, slotDur * SLOTS_PER_BAR * BARS_PER_CHORD);
      }
    }
  }

  private get root(): number {
    return PROGRESSION[Math.floor(this.bar / BARS_PER_CHORD) % PROGRESSION.length]!;
  }

  private changeChord(at: number, length: number): void {
    const root = this.root;
    for (let k = 0; k < this.droneOscs.length; k++) {
      const ratio = [1, 1.5, 0.5][k]!;
      this.droneOscs[k]!.frequency.setTargetAtTime(hz(root) * ratio, at, 0.6);
    }
    if (this.layers.choir.level > 0.02) {
      const m = this.mode;
      const voice = this.voice(this.layers.choir.gain, at);
      choir(voice, [hz(root - 12), hz(root - 12 + m[2]!), hz(root - 12 + m[4]!)], length + 1.5, 0.05);
    }
  }

  private playSlot(at: number, slotDur: number): void {
    const i = this.intensity;
    const inBar = this.slot % SLOTS_PER_BAR;
    // Frame drum: doum on the downbeat, tek between, busier as the battle grows.
    if (this.layers.drum.level > 0.02) {
      const v = this.voice(this.layers.drum.gain, at);
      if (inBar === 0) drum(v, 78, 0.5);
      else if (inBar === 4 && i > 0.35) drum(v, 78, 0.35);
      else if ((inBar === 3 || inBar === 6) && i > 0.5) drum(v, 150, 0.18);
      else if (inBar % 2 === 1 && i > 0.8 && this.rand() < 0.5) drum(v, 170, 0.1);
    }
    // Lute: a motif of eight slots, repeated with variation, then a new one.
    if (this.layers.lute.level > 0.02) {
      if (inBar === 0 && (this.motif.length === 0 || this.motifUses >= 2 + Math.floor(this.rand() * 2))) this.newMotif();
      if (inBar === 0) this.motifUses++;
      const step = this.motif[inBar] ?? -99;
      const density = 0.35 + 0.4 * this.daylight;
      if (step > -99 && (this.rand() < density || inBar === 0)) {
        const varied = this.rand() < 0.2 ? step + (this.rand() < 0.5 ? -1 : 1) : step;
        this.pluck(this.voice(this.layers.lute.gain, at), this.scaleHz(varied, this.root + 12), slotDur * (2 + this.rand() * 2));
      }
    }
  }

  private newMotif(): void {
    this.motif = [];
    this.motifUses = 0;
    for (let s = 0; s < SLOTS_PER_BAR; s++) {
      if (s > 0 && this.rand() < 0.35) {
        this.motif.push(-99);
        continue;
      }
      this.degree = Math.max(0, Math.min(9, this.degree + Math.round((this.rand() - 0.5) * 3.2)));
      this.motif.push(this.degree);
    }
  }

  private scaleHz(degree: number, rootSemis: number): number {
    const m = this.mode;
    const octave = Math.floor(degree / m.length);
    return hz(rootSemis + octave * 12 + m[((degree % m.length) + m.length) % m.length]!);
  }

  /** A plucked lute string: bright attack, darkening fast. */
  private pluck(v: Voice, freq: number, dur: number): void {
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, v.t);
    g.gain.exponentialRampToValueAtTime(0.09, v.t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, v.t + dur);
    g.connect(v.out);
    const f = v.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, v.t);
    f.frequency.exponentialRampToValueAtTime(500, v.t + dur * 0.6);
    f.connect(g);
    for (const [type, ratio, level] of [['triangle', 1, 1], ['sawtooth', 1.002, 0.35], ['triangle', 2, 0.25]] as const) {
      const o = v.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * ratio;
      const lg = v.ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(f);
      o.start(v.t);
      o.stop(v.t + dur + 0.05);
      o.onended = () => o.disconnect();
    }
  }

  private voice(out: AudioNode, t: number): Voice {
    return { ctx: this.ctx, out, t, rand: this.rand };
  }
}
