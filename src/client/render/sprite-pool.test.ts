// The HD painter's worker pool (sprites128.ts) with fake workers: a job a worker fails is reported,
// frees its worker, and is not asked again at once; a worker that dies is let go.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KindSheet } from './contract.ts';

interface Msg {
  kind: number;
  level: number;
  key: string;
  warm?: boolean;
}
class FakeWorker {
  static all: FakeWorker[] = [];
  /** How the next job is answered. */
  static answer: (m: Msg, w: FakeWorker) => void = () => {};
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  posted: Msg[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Msg): void {
    if (m.warm) return;
    this.posted.push(m);
    FakeWorker.answer(m, this);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}
const sheet = (level: number): KindSheet => ({ level, width: 1, height: 1, pixels: new Uint8ClampedArray(4), rects: new Int32Array(6), ms: 0 });
const tick = () => new Promise((r) => setTimeout(r, 0));

const G = globalThis as Record<string, unknown>;
const saved = { Worker: G.Worker, document: G.document, ImageData: G.ImageData };

describe('sprite worker pool', () => {
  let mod: typeof import('./sprites128.ts');
  beforeAll(async () => {
    G.Worker = FakeWorker;
    G.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) };
    G.ImageData = class {};
    // Two workers (cores - 1).
    vi.stubGlobal('navigator', { hardwareConcurrency: 3 });
    mod = await import('./sprites128.ts');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.assign(G, saved);
  });
  const pending: [FakeWorker, Msg][] = [];

  it('reports a failed job, frees its worker for the next, and does not ask again at once', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    FakeWorker.answer = (m, w) => void pending.push([w, m]);
    const atlas = mod.buildAtlas('templar', 215);
    // Start the pool (and let it find there is no persistent cache here).
    expect(atlas.sheet!(0, 2)).toBeNull();
    await tick();
    const workers = FakeWorker.all.length;
    expect(workers).toBeGreaterThan(0);
    expect(pending.length).toBe(1);
    // Fill every other worker, so the failing one is the only one free afterwards.
    for (let k = 1; k < workers; k++) atlas.sheet!(k, 2);
    expect(pending.length).toBe(workers);
    const [w0, m0] = pending.shift()!;
    expect(m0.key).toBe('templar:215:0:2');
    w0.reply({ error: 'Error: boom', key: m0.key });
    expect(errors).toHaveBeenCalled();
    expect(String(errors.mock.calls[0]!.join(' '))).toContain('boom');
    // Nothing stored for it; asking again right away does not paint it again.
    expect(atlas.sheet!(0, 2)).toBeNull();
    expect(pending.length).toBe(workers - 1);
    // The worker is free: the next sheet goes to it.
    atlas.sheet!(9, 2);
    expect(pending.length).toBe(workers);
    expect(pending.at(-1)![0]).toBe(w0);
    // A sheet that does land is stored as usual.
    const [w1, m1] = pending.pop()!;
    w1.reply(sheet(m1.level));
    expect(atlas.sheet!(9, 2)).not.toBeNull();
    errors.mockRestore();
  });

  it('lets a worker that dies go, and gives its job to another', async () => {
    // From the test above: every worker but one is still busy (their jobs unanswered).
    expect(FakeWorker.all.length).toBe(2);
    const atlas = mod.buildAtlas('samurai', 30);
    atlas.sheet!(0, 2);
    const [w, m] = pending.pop()!;
    expect(m.key).toBe('samurai:30:0:2');
    w.onerror?.({ message: 'crashed' });
    expect(w.terminated).toBe(true);
    // Its job waits for the other worker, which takes it as soon as it is free.
    const [other, busy] = pending.shift()!;
    expect(other).not.toBe(w);
    other.reply(sheet(busy.level));
    expect(pending.length).toBe(1);
    expect(pending[0]![0]).toBe(other);
    expect(pending[0]![1].key).toBe(m.key);
  });
});

describe('sprite worker pool: HD 64 after HD', () => {
  let mod: typeof import('./sprites128.ts');
  const pending: [FakeWorker, Msg & { from?: KindSheet }][] = [];
  beforeAll(async () => {
    vi.resetModules();
    FakeWorker.all = [];
    G.Worker = FakeWorker;
    G.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) };
    G.ImageData = class {};
    vi.stubGlobal('navigator', { hardwareConcurrency: 3 });
    mod = await import('./sprites128.ts');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.assign(G, saved);
  });

  it('halves the level-8 sheet HD is still painting instead of painting it a second time', async () => {
    FakeWorker.answer = (m, w) => void pending.push([w, m]);
    const hd = mod.buildAtlas('undead', 120);
    expect(hd.sheet!(8, 8)).toBeNull();
    await tick();
    expect(pending.map(([, m]) => m.key)).toEqual(['undead:120:8:8']);
    // Switched to HD 64 mid-paint: its level 4 is that level-8 sheet halved.
    const hd64 = mod.buildAtlas64('undead', 120);
    expect(hd64.sheet!(8, 4)).toBeNull();
    // The other worker is free, but nothing paints level 8 a second time.
    expect(pending.length).toBe(1);
    const [w] = pending.shift()!;
    const big = sheet(8);
    w.reply(big);
    // Now the halving goes out, from the painted sheet, which HD keeps too.
    expect(pending.length).toBe(1);
    expect(pending[0]![1].key).toBe('undead:120:8:4:half');
    expect(pending[0]![1].from).toBe(big);
    expect(hd.sheet!(8, 8)).toBe(big);
  });
});

describe('sprite worker pool: what the view needs first', () => {
  let mod: typeof import('./sprites128.ts');
  const pending: [FakeWorker, Msg & { progressive?: boolean }][] = [];
  beforeAll(async () => {
    vi.resetModules();
    FakeWorker.all = [];
    G.Worker = FakeWorker;
    G.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) };
    G.ImageData = class {};
    // One worker (cores - 1), so the order the queue is served in shows.
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    mod = await import('./sprites128.ts');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.assign(G, saved);
  });
  const next = (): Msg & { progressive?: boolean } => {
    const [w, m] = pending.shift()!;
    w.reply(m.level === 1 ? { ...sheet(1), width: 48, height: 192 } : sheet(m.level));
    return m;
  };

  it('paints the fallbacks of kinds in view, their grids, then what they need, then the rest', async () => {
    FakeWorker.answer = (m, w) => void pending.push([w, m]);
    const atlas = mod.buildAtlas('templar', 40);
    // The first ask takes the only worker.
    atlas.sheet!(5, 2, 'prefetch');
    await tick();
    expect(pending.map(([, m]) => m.key)).toEqual(['templar:40:5:2']);
    // Kinds 0..2 on the field (their grids asked for), kind 1 in view at 8x; the others prefetched.
    for (const k of [0, 1, 2]) atlas.at(k, 0, 0, 0);
    atlas.sheet!(0, 2, 'prefetch');
    atlas.sheet!(2, 4, 'prefetch');
    atlas.sheet!(1, 4, 'prefetch');
    atlas.sheet!(1, 8, 'need');
    atlas.sheet!(1, 2, 'fallback');
    atlas.sheet!(2, 2, 'peek');
    const order: string[] = [];
    while (pending.length) order.push(next().key);
    expect(order).toEqual(['templar:40:5:2', 'templar:40:1:2', 'templar:40:1:1', 'templar:40:1:8', 'templar:40:0:1', 'templar:40:2:1', 'templar:40:0:2', 'templar:40:1:4', 'templar:40:2:4']);
    // A peek never paints.
    expect(atlas.sheet!(2, 2, 'peek')).toBeNull();
    expect(pending.length).toBe(0);
  });

  it('shows a partial sheet while the whole one paints, then the whole one', async () => {
    FakeWorker.answer = (m, w) => void pending.push([w, m]);
    const atlas = mod.buildAtlas('samurai', 75);
    expect(atlas.sheet!(3, 8, 'need')).toBeNull();
    await tick();
    const [w, m] = pending.shift()!;
    expect(m.progressive).toBe(true);
    const part = { ...sheet(8), partial: true };
    w.reply(part);
    expect(atlas.sheet!(3, 8)).toBe(part);
    // The worker is still on it: the next job waits.
    atlas.sheet!(4, 2, 'need');
    expect(pending.length).toBe(0);
    const whole = sheet(8);
    w.reply(whole);
    expect(atlas.sheet!(3, 8)).toBe(whole);
    expect(pending.map(([, q]) => q.key)).toEqual(['samurai:75:4:2']);
    // A prefetch or a fallback is painted in one go.
    next();
    atlas.sheet!(4, 4, 'prefetch');
    expect(pending[0]![1].progressive).toBe(false);
  });
});
