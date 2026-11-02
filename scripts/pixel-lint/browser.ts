// The browser side of the lint: a Vite dev server plus headless Chromium (Playwright), for what
// only a real canvas can give: the city renderer, battle screenshots through the post shader, and
// decoding the reference PNG/GIF files.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer, type ViteDevServer } from 'vite';
import type { Img } from './metrics.ts';

interface PwPage {
  goto(url: string, o?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<unknown>;
  evaluate<T, A>(fn: (a: A) => T | Promise<T>, arg: A): Promise<T>;
  waitForFunction(fn: string, arg?: unknown, o?: { timeout?: number; polling?: number }): Promise<unknown>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  screenshot(o?: { type?: 'png'; fullPage?: boolean }): Promise<Buffer>;
  on(ev: 'pageerror' | 'console', fn: (e: { message?: string; text?: () => string; type?: () => string }) => void): void;
  close(): Promise<void>;
  addInitScript(s: { content: string }): Promise<void>;
}
interface PwBrowser {
  newPage(o?: { viewport?: { width: number; height: number }; deviceScaleFactor?: number }): Promise<PwPage>;
  close(): Promise<void>;
}
interface Pw {
  chromium: { launch(o?: { args?: string[] }): Promise<PwBrowser> };
}

/** Playwright from the project, NODE_PATH or the global install (CLAUDE.md: `require('playwright')`). */
function playwright(): Pw {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright') as Pw;
  } catch {
    return req('/opt/node22/lib/node_modules/playwright') as Pw;
  }
}

/** base64 RGBA → Img. */
const fromB64 = (w: number, h: number, b64: string): Img => ({ w, h, d: new Uint8ClampedArray(Buffer.from(b64, 'base64')) });

export class Browser {
  private constructor(
    private readonly server: ViteDevServer,
    private readonly browser: PwBrowser,
    readonly base: string,
  ) {}

  static async start(root: string): Promise<Browser> {
    const server = await createServer({ configFile: `${root}/vite.config.ts`, logLevel: 'error', server: { port: 5287, strictPort: false, hmr: false } });
    await server.listen();
    const base = (server.resolvedUrls?.local[0] ?? 'http://localhost:5287/').replace(/\/$/, '');
    const browser = await playwright().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    return new Browser(server, browser, base);
  }

  async close(): Promise<void> {
    await this.browser.close();
    await this.server.close();
  }

  async page(width = 1280, height = 900, dpr = 1): Promise<PwPage> {
    const p = await this.browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
    // tsx (esbuild keepNames) wraps named functions in __name(); evaluated code needs it defined.
    await p.addInitScript({ content: 'globalThis.__name = (f) => f;' });
    return p;
  }

  /** Decodes an image file (PNG, GIF frame n) to RGBA in the browser. */
  async decode(path: string, frame = 0): Promise<Img> {
    const p = await this.page(400, 300);
    await p.goto(`${this.base}/sprites-preview.html?mode=sheet&kinds=7&anims=7`, { waitUntil: 'load' });
    const b64 = readFileSync(path).toString('base64');
    const mime = path.endsWith('.gif') ? 'image/gif' : 'image/png';
    const r = await p.evaluate(
      async ({ b64, mime, frame }) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        let w: number, h: number, data: Uint8ClampedArray;
        const ID = (globalThis as unknown as { ImageDecoder?: new (o: { data: Uint8Array; type: string }) => { decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }> } }).ImageDecoder;
        const c = document.createElement('canvas');
        const g = c.getContext('2d', { willReadFrequently: true })!;
        if (ID && frame > 0) {
          const dec = new ID({ data: bin, type: mime });
          const { image } = await dec.decode({ frameIndex: frame });
          w = image.displayWidth;
          h = image.displayHeight;
          c.width = w;
          c.height = h;
          g.drawImage(image, 0, 0);
          image.close();
        } else {
          const im = new Image();
          im.src = `data:${mime};base64,${b64}`;
          await im.decode();
          w = im.width;
          h = im.height;
          c.width = w;
          c.height = h;
          g.drawImage(im, 0, 0);
        }
        data = g.getImageData(0, 0, w, h).data;
        let s = '';
        for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return { w, h, b64: btoa(s) };
      },
      { b64, mime, frame },
    );
    await p.close();
    return fromB64(r.w, r.h, r.b64);
  }

  /**
   * One city scene: every building at `level`, at `hour`. Returns the finished world buffer
   * (graded, at art resolution), a mask of the building art over it, the building parts as
   * drawn (before the grade), the bare ground, and the art-pixel size of the buffer.
   */
  async city(art: 'classic' | 'hd', faction: string, level: number, hour: number): Promise<CityShot> {
    const p = await this.page(1312, 820);
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message ?? String(e)));
    await p.goto(`${this.base}/city-preview.html?art=${art}&faction=${faction}&level=${level}&only=0&hour=${hour}&paused=1&t=2`, { waitUntil: 'load' });
    await p.waitForFunction('window.city && window.city.live && window.city.live.length > 0', undefined, { timeout: 60000 });
    const r = await p.evaluate(() => {
      type C = HTMLCanvasElement;
      const enc = (c: C | OffscreenCanvas, x = 0, y = 0, w = c.width, h = c.height) => {
        const g = (c as C).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        const d = g.getImageData(x, y, w, h).data;
        let s = '';
        for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
        return { w, h, b64: btoa(s) };
      };
      const w = window as unknown as { city: { live: { scene: Record<string, unknown> & { buffer: C; frame: { k: number }; scale(): number } }[] } };
      const sc = w.city.live[0]!.scene;
      const arts = (sc['arts'] as { canvas: C | null; x: number; y: number }[]) ?? [];
      const ground = sc['ground'] as { arts: { canvas: C | null }[]; base: C } | null;
      const groundArts = new Set((ground?.arts ?? []).map((a) => a.canvas));
      const B = sc.buffer;
      const mask = document.createElement('canvas');
      mask.width = B.width;
      mask.height = B.height;
      const mg = mask.getContext('2d', { willReadFrequently: true })!;
      const parts: { x: number; y: number; img: { w: number; h: number; b64: string } }[] = [];
      for (const a of arts) {
        if (!a.canvas || groundArts.has(a.canvas)) continue;
        mg.drawImage(a.canvas, Math.round(a.x), Math.round(a.y));
        if (a.canvas.width * a.canvas.height >= 400) parts.push({ x: a.x, y: a.y, img: enc(a.canvas) });
      }
      return { buffer: enc(B), mask: enc(mask), ground: ground ? enc(ground.base) : null, parts, k: sc.frame.k, scale: sc.scale() };
    }, undefined);
    await p.close();
    const dec = (x: { w: number; h: number; b64: string }) => fromB64(x.w, x.h, x.b64);
    return {
      buffer: dec(r.buffer),
      mask: dec(r.mask),
      ground: r.ground ? dec(r.ground) : null,
      parts: r.parts.map((q) => ({ x: q.x, y: q.y, img: dec(q.img) })),
      k: r.k,
      scale: r.scale,
      errors,
    };
  }

  /** The city as the preview shows it on a page `width` css px wide: the output canvas and its scale. */
  async cityScreen(art: 'classic' | 'hd', faction: string, width: number, dpr = 1): Promise<{ img: Img; scale: number }> {
    const p = await this.page(width, Math.round(width * 0.75), dpr);
    await p.goto(`${this.base}/city-preview.html?art=${art}&faction=${faction}&level=12&only=0&hour=11&paused=1`, { waitUntil: 'load' });
    await p.waitForFunction('window.city && window.city.live && window.city.live.length > 0', undefined, { timeout: 60000 });
    const r = await p.evaluate(() => {
      const w = window as unknown as { city: { live: { canvas: HTMLCanvasElement; scene: { scale(): number } }[] } };
      const l = w.city.live[0]!;
      const c = l.canvas;
      const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return { w: c.width, h: c.height, b64: btoa(s), scale: l.scene.scale() };
    }, undefined);
    await p.close();
    return { img: fromB64(r.w, r.h, r.b64), scale: r.scale };
  }

  /** A battle frame through the post shader, as the page shows it. */
  async battleScreen(art: 'classic' | 'hd', width: number, zoom: number, dpr = 1): Promise<{ img: Img; px: number; error: string }> {
    const height = Math.round(width * 0.5625);
    const p = await this.page(width, height, dpr);
    await p.goto(`${this.base}/battle-perf.html?men=1500&seed=3&t=60&pause=1&hud=0&scan=1&art=${art}&zoom=${zoom}`, { waitUntil: 'load' });
    await p.waitForFunction('window.__perf && window.__perf.frames > 20', undefined, { timeout: 90000 });
    const info = await p.evaluate(() => {
      const w = window as unknown as { __scene: { pixelScale(w: number, h: number): number; error?: string } };
      const c = document.getElementById('c') as HTMLCanvasElement;
      return { px: w.__scene.pixelScale(c.width, c.height), error: w.__scene.error ?? '' };
    }, undefined);
    const png = await p.screenshot({ type: 'png' });
    await p.close();
    // Decode the screenshot through a fresh page.
    const dp = await this.page(400, 300);
    await dp.goto(`${this.base}/sprites-preview.html?mode=sheet&kinds=7&anims=7`, { waitUntil: 'load' });
    const r = await dp.evaluate(async (b64: string) => {
      const im = new Image();
      im.src = `data:image/png;base64,${b64}`;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.width;
      c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return { w: c.width, h: c.height, b64: btoa(s) };
    }, png.toString('base64'));
    await dp.close();
    return { img: fromB64(r.w, r.h, r.b64), px: info.px, error: info.error };
  }
}

export interface CityShot {
  buffer: Img;
  mask: Img;
  ground: Img | null;
  parts: { x: number; y: number; img: Img }[];
  /** Buffer pixels per world pixel (HD 2). */
  k: number;
  scale: number;
  errors: string[];
}
