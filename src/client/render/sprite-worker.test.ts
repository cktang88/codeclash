// The sprite worker answers every job: a sheet, or an error the main thread can act on (a worker
// that threw and said nothing left its pool slot busy, and the sheet unpainted, for good).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let fail: string | null = null;
vi.mock('./sprites128.ts', () => ({
  sheetFor: (_f: string, _h: number, kind: number, level: number) => {
    if (fail) throw new Error(fail);
    return { level, width: 1, height: 1, pixels: new Uint8ClampedArray(4), rects: new Int32Array(6 * (kind + 1)), ms: 0 };
  },
}));

type Self = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => Promise<void> | void) | null };
const g = globalThis as unknown as { self?: Self };
const had = 'self' in globalThis;
const prev = g.self;

describe('sprite worker', () => {
  let self: Self;
  beforeAll(async () => {
    self = { postMessage: vi.fn(), onmessage: null };
    g.self = self;
    await import('./sprite-worker.ts');
  });
  afterAll(() => {
    if (had) g.self = prev;
    else delete g.self;
  });

  it('posts the painted sheet back', async () => {
    fail = null;
    self.postMessage.mockClear();
    await self.onmessage!({ data: { faction: 'templar', hue: 215, kind: 2, level: 2, key: 'templar:215:2:2' } });
    expect(self.postMessage).toHaveBeenCalledTimes(1);
    expect(self.postMessage.mock.calls[0]![0]).toMatchObject({ level: 2, width: 1 });
  });

  it('answers a paint that throws with an error naming the sheet, instead of nothing', async () => {
    fail = 'boom';
    self.postMessage.mockClear();
    await expect(Promise.resolve(self.onmessage!({ data: { faction: 'templar', hue: 215, kind: 0, level: 4, key: 'templar:215:0:4' } }))).resolves.toBeUndefined();
    expect(self.postMessage).toHaveBeenCalledTimes(1);
    expect(self.postMessage.mock.calls[0]![0]).toEqual({ error: expect.stringContaining('boom'), key: 'templar:215:0:4' });
    // And it carries on painting afterwards.
    fail = null;
    await self.onmessage!({ data: { faction: 'templar', hue: 215, kind: 1, level: 2, key: 'templar:215:1:2' } });
    expect(self.postMessage.mock.calls[1]![0]).toMatchObject({ level: 2 });
  });
});
