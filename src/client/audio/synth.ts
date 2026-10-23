// Procedural sound recipes built from WebAudio nodes. Each one schedules its
// nodes at time `t` into `out` and lets them stop and disconnect themselves.

export interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  t: number;
  rand: () => number;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
export function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** A gain node with an attack-decay envelope that ends at t + attack + decay. */
export function envelope(v: Voice, peak: number, attack: number, decay: number, at = v.t): GainNode {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.002, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(v.out);
  return g;
}

function stopAfter(node: AudioScheduledSourceNode, at: number, end: number): void {
  node.start(at);
  node.stop(end + 0.05);
  node.onended = () => node.disconnect();
}

export function osc(v: Voice, type: OscillatorType, freq: number, dest: AudioNode, at: number, end: number, glideTo?: number): OscillatorNode {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), end);
  o.connect(dest);
  stopAfter(o, at, end);
  return o;
}

export function noiseSource(v: Voice, dest: AudioNode, at: number, end: number): AudioBufferSourceNode {
  const n = v.ctx.createBufferSource();
  n.buffer = noise(v.ctx);
  n.loop = true;
  n.playbackRate.value = 0.9 + v.rand() * 0.2;
  n.connect(dest);
  // Start at a random offset so repeated bursts don't share a waveform.
  n.start(at, v.rand() * 1.5);
  n.stop(end + 0.05);
  n.onended = () => n.disconnect();
  return n;
}

export function filter(v: Voice, type: BiquadFilterType, freq: number, q: number, dest: AudioNode, at = v.t, sweepTo?: number, sweepEnd?: number): BiquadFilterNode {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (sweepTo !== undefined && sweepEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(10, sweepTo), sweepEnd);
  f.Q.value = q;
  f.connect(dest);
  return f;
}

// ---------------------------------------------------------------- recipes

/** A short wooden tick: UI clicks. */
export function tick(v: Voice, gain = 0.5): number {
  const env = envelope(v, gain, 0.002, 0.05);
  noiseSource(v, filter(v, 'bandpass', 2600 + v.rand() * 600, 1.6, env), v.t, v.t + 0.06);
  osc(v, 'triangle', 1400, envelope(v, gain * 0.25, 0.001, 0.03), v.t, v.t + 0.04);
  return 0.08;
}

/** Struck bell: inharmonic partials. Low for the sack toll, high and soft for toasts. */
export function bell(v: Voice, freq: number, gain: number, decay: number, at = v.t): number {
  const partials: [number, number][] = [[0.5, 0.35], [1, 1], [2.0, 0.45], [2.76, 0.4], [5.4, 0.18], [8.9, 0.07]];
  for (const [ratio, level] of partials) {
    const env = envelope(v, gain * level, 0.004, decay * (ratio < 1.5 ? 1 : 0.6 / Math.sqrt(ratio)), at);
    osc(v, 'sine', freq * ratio * (1 + (v.rand() - 0.5) * 0.002), env, at, at + decay + 0.1);
  }
  return decay;
}

/** A brass call: detuned sawtooth through a filter that opens as the breath swells. */
export function horn(v: Voice, notes: [freq: number, start: number, dur: number][], gain: number): number {
  let end = 0;
  for (const [freq, start, dur] of notes) {
    const at = v.t + start;
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.09);
    g.gain.setValueAtTime(gain, at + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(v.out);
    const tone = filter(v, 'lowpass', 500, 2.2, g, at, 2200, at + 0.18);
    for (const detune of [-6, 5]) {
      const o = osc(v, 'sawtooth', freq, tone, at, at + dur);
      o.detune.value = detune;
      // A little vibrato after the attack.
      const lfo = v.ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = v.ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(7, at + dur * 0.6);
      lfo.connect(depth).connect(o.detune);
      stopAfter(lfo, at, at + dur);
    }
    end = Math.max(end, start + dur);
  }
  return end;
}

/** Air moving: wings, flying stones, a fireball's rush. */
export function whoosh(v: Voice, dur: number, from: number, to: number, gain: number, at = v.t): number {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(v.out);
  noiseSource(v, filter(v, 'bandpass', from, 1.4, g, at, to, at + dur), at, at + dur);
  return dur;
}

/** A deep impact: falling sine body plus a low rumble of noise. */
export function boom(v: Voice, f0: number, dur: number, gain: number, at = v.t): number {
  osc(v, 'sine', f0, envelope(v, gain, 0.005, dur, at), at, at + dur, f0 * 0.42);
  noiseSource(v, filter(v, 'lowpass', 380, 0.7, envelope(v, gain * 0.7, 0.01, dur * 0.8, at), at, 90, at + dur), at, at + dur);
  return dur;
}

/** Fire: lowpassed noise that flutters. */
export function fire(v: Voice, dur: number, gain: number, at = v.t): number {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.12);
  g.gain.setValueAtTime(gain, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(v.out);
  const flutter = v.ctx.createGain();
  flutter.gain.value = 0.6;
  flutter.connect(g);
  const lfo = v.ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 13 + v.rand() * 9;
  const depth = v.ctx.createGain();
  depth.gain.value = 0.35;
  lfo.connect(depth).connect(flutter.gain);
  stopAfter(lfo, at, at + dur);
  noiseSource(v, filter(v, 'lowpass', 2400, 0.8, flutter, at, 900, at + dur), at, at + dur);
  noiseSource(v, filter(v, 'bandpass', 180, 1.2, envelope(v, gain * 0.8, 0.08, dur, at), at), at, at + dur);
  return dur;
}

/** A great beast's roar: a growling sawtooth through sweeping vocal formants. */
export function roar(v: Voice, f0: number, dur: number, gain: number, at = v.t): number {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.18);
  g.gain.setValueAtTime(gain, at + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(v.out);
  const shaper = v.ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(x * 3.2);
  }
  shaper.curve = curve;
  const mix = v.ctx.createGain();
  mix.gain.value = 0.5;
  mix.connect(shaper);
  for (const [lo, hi, q] of [[620, 360, 6], [1300, 880, 7], [2500, 1900, 5]] as const) {
    const f = filter(v, 'bandpass', lo, q, g, at, hi, at + dur);
    shaper.connect(f);
  }
  for (const [ratio, detune] of [[1, 0], [1.006, 9], [0.5, -4]] as const) {
    const o = osc(v, 'sawtooth', f0 * ratio, mix, at, at + dur, f0 * ratio * 0.68);
    o.detune.value = detune;
  }
  // Breath and rasp.
  noiseSource(v, filter(v, 'bandpass', 900, 0.9, envelope(v, gain * 0.5, dur * 0.2, dur * 0.8, at), at, 500, at + dur), at, at + dur);
  return dur;
}

/** A bowstring release and the arrow leaving. */
export function bowstring(v: Voice, gain: number, at = v.t): number {
  osc(v, 'triangle', 170 + v.rand() * 40, envelope(v, gain, 0.002, 0.12, at), at, at + 0.14, 120);
  whoosh(v, 0.22, 3000, 900, gain * 0.5, at + 0.01);
  return 0.24;
}

/** A frame drum: a pitched membrane thump with a slap of skin. */
export function drum(v: Voice, f0: number, gain: number, at = v.t): number {
  osc(v, 'sine', f0 * 1.6, envelope(v, gain, 0.002, 0.32, at), at, at + 0.34, f0);
  noiseSource(v, filter(v, 'bandpass', 900, 1.1, envelope(v, gain * 0.35, 0.001, 0.05, at), at), at, at + 0.06);
  return 0.35;
}

/** Bright healing motes: a scatter of high, soft pings. */
export function sparkle(v: Voice, gain: number, count = 5, at = v.t): number {
  for (let i = 0; i < count; i++) {
    const t = at + i * 0.045 + v.rand() * 0.03;
    const f = 1500 + v.rand() * 1800;
    osc(v, 'sine', f, envelope(v, gain * (0.6 + v.rand() * 0.4), 0.003, 0.25, t), t, t + 0.3);
  }
  return count * 0.05 + 0.3;
}

/** Voices singing "ah": sawtooth through two vowel formants. Holy heals, the day's end. */
export function choir(v: Voice, freqs: number[], dur: number, gain: number, at = v.t): number {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.35);
  g.gain.setValueAtTime(gain, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(v.out);
  const f1 = filter(v, 'bandpass', 720, 5, g, at);
  const f2 = filter(v, 'bandpass', 1150, 6, g, at);
  for (const f of freqs) {
    for (const detune of [-8, 0, 7]) {
      const o = osc(v, 'sawtooth', f, f1, at, at + dur);
      o.connect(f2);
      o.detune.value = detune;
    }
  }
  return dur;
}

/** Many bones clattering. */
export function clatter(v: Voice, gain: number, at = v.t): number {
  for (let i = 0; i < 7; i++) {
    const t = at + i * 0.035 + v.rand() * 0.04;
    const env = envelope(v, gain * (0.4 + v.rand() * 0.6), 0.001, 0.05, t);
    noiseSource(v, filter(v, 'bandpass', 1800 + v.rand() * 2500, 9, env, t), t, t + 0.06);
  }
  return 0.4;
}

/** An army shouting together. */
export function shout(v: Voice, dur: number, gain: number, at = v.t): number {
  const g = envelope(v, gain, dur * 0.25, dur * 0.75, at);
  for (const [f, q] of [[480, 3], [820, 4], [1350, 5], [2300, 6]] as const) {
    noiseSource(v, filter(v, 'bandpass', f * (0.95 + v.rand() * 0.1), q, g, at), at, at + dur);
  }
  return dur;
}

/** A hollow cracking: stress lines running through stone. */
export function crack(v: Voice, gain: number, at = v.t): number {
  for (let i = 0; i < 5; i++) {
    const t = at + i * 0.06 + v.rand() * 0.05;
    const env = envelope(v, gain * (0.5 + v.rand() * 0.5), 0.001, 0.09, t);
    noiseSource(v, filter(v, 'highpass', 1400 + v.rand() * 1000, 0.7, env, t), t, t + 0.1);
  }
  osc(v, 'square', 70, envelope(v, gain * 0.4, 0.004, 0.25, at), at, at + 0.3, 40);
  return 0.5;
}
