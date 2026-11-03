// The city's rebuild after a level change (src/client/render/city/build.ts), checked in a real
// browser (Vite + headless Chromium):
//   pnpm tsx scripts/city-rebuild-check.ts          every faction, several level sequences: the city
//       built in the worker, and by the main-thread job (no worker), must be pixel-identical to a
//       fresh synchronous build of the final levels (every art, light and night canvas, the
//       ground, the night's pools, the anchors). Classic is checked the same way (it stays sync).
//   pnpm tsx scripts/city-rebuild-check.ts --bench  frame by frame around level changes: the
//       main-thread build work in the worst frame, the worst draw, and the time until the new
//       city is shown.
// Exit code 1 when a sequence differs.

import { createRequire } from 'node:module';
import { createServer, type ViteDevServer } from 'vite';

interface Page {
  goto(url: string, o?: { waitUntil?: 'load' }): Promise<unknown>;
  evaluate<T, A>(fn: (a: A) => T | Promise<T>, arg: A): Promise<T>;
  waitForFunction(fn: string): Promise<unknown>;
  addInitScript(s: { content: string }): Promise<void>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(o?: { viewport?: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
}
interface Pw {
  chromium: { launch(): Promise<PwBrowser> };
}

/**
 * Vite and plain headless Chromium (CLAUDE.md: `require('playwright')`, `chromium.launch()`). Not
 * pixel-lint's SwiftShader launch: its GPU canvases make the many pixel readbacks here very slow.
 */
class Browser {
  private constructor(
    private readonly server: ViteDevServer,
    private readonly browser: PwBrowser,
    readonly base: string,
  ) {}
  static async start(root: string): Promise<Browser> {
    const req = createRequire(import.meta.url);
    let pw: Pw;
    try {
      pw = req('playwright') as Pw;
    } catch {
      pw = req('/opt/node22/lib/node_modules/playwright') as Pw;
    }
    const server = await createServer({ configFile: `${root}/vite.config.ts`, logLevel: 'error', server: { port: 5288, strictPort: false, hmr: false } });
    await server.listen();
    const base = (server.resolvedUrls?.local[0] ?? 'http://localhost:5288/').replace(/\/$/, '');
    return new Browser(server, await pw.chromium.launch(), base);
  }
  async page(): Promise<Page> {
    const p = await this.browser.newPage({ viewport: { width: 1280, height: 800 } });
    // tsx (esbuild keepNames) wraps named functions in __name(); evaluated code needs it defined.
    await p.addInitScript({ content: 'globalThis.__name = (f) => f;' });
    return p;
  }
  async close(): Promise<void> {
    await this.browser.close();
    await this.server.close();
  }
}

const BASE = { barracks: 8, range: 6, stables: 7, workshop: 5, chapter: 9, granary: 6, hospital: 5, walls: 10 };
const SEQS: Record<string, { ch: Partial<typeof BASE>; progress?: Record<string, number> }[]> = {
  levelUps: [{ ch: { range: 7 } }, { ch: { range: 8 } }, { ch: { hospital: 6 } }],
  tiers: [{ ch: { barracks: 9 } }, { ch: { barracks: 10 } }, { ch: { chapter: 10 } }, { ch: { chapter: 11 } }],
  walls: [{ ch: { walls: 11 } }, { ch: { walls: 15 } }],
  burst: [{ ch: { range: 7 } }, { ch: { range: 9, stables: 10 } }, { ch: { workshop: 4 } }, { ch: { granary: 0 } }, { ch: { granary: 1 } }],
  scaffold: [{ ch: {}, progress: { barracks: 0.8 } }, { ch: { barracks: 9 }, progress: {} }, { ch: {}, progress: { chapter: 0.9 } }],
  down: [{ ch: { barracks: 2, chapter: 0, range: 1 } }, { ch: { barracks: 8, chapter: 9, range: 6 } }],
};

interface Scene {
  draw(c: HTMLCanvasElement, levels: unknown, recruits: number, dt: number, mood: unknown): void;
  busy: boolean;
  remote: { failed: boolean; lastMs: number } | null;
  [k: string]: unknown;
}

async function check(b: Browser): Promise<number> {
  const page = await b.page();
  let bad = 0;
  for (const art of ['hd', 'classic'] as const)
    for (const faction of ['templar', 'samurai', 'undead']) {
      await page.goto(`${b.base}/city-preview.html?art=${art}&faction=${faction}&only=2&paused&hour=23`, { waitUntil: 'load' });
      await page.waitForFunction('window.city && window.city.live.length');
      for (const via of art === 'hd' ? ['worker', 'job'] : ['sync'])
        for (const [name, seq] of Object.entries(SEQS)) {
          const r = await page.evaluate(
            async ({ BASE, seq, via, art }) => {
              const fnv = (d: Uint8ClampedArray) => {
                let h = 2166136261;
                for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i]!, 16777619);
                return (h >>> 0).toString(16);
              };
              const hc = (c: HTMLCanvasElement | null | undefined) => {
                if (!c) return String(c);
                const x = document.createElement('canvas');
                x.width = c.width;
                x.height = c.height;
                const g = x.getContext('2d')!;
                g.drawImage(c, 0, 0);
                return `${c.width}x${c.height}:${fnv(g.getImageData(0, 0, c.width, c.height).data)}`;
              };
              type A = { x: number; y: number; d: number; pooled?: boolean; canvas: HTMLCanvasElement | null; lights: HTMLCanvasElement | null; night?: HTMLCanvasElement | null };
              const dump = (sc: Scene): Record<string, unknown> => {
                const gr = sc.ground as { base: HTMLCanvasElement; crops: HTMLCanvasElement[]; cropX?: number; cropY?: number; sown: number; lamps?: unknown };
                const props = sc.props as { painted: { anims: { d: number; x: number; y: number; seed: number; box: number[]; fn: unknown }[] } } | null;
                const life = sc.life as { anchors: unknown; wallFront: number; wallBack: number };
                return {
                  arts: (sc.arts as A[]).map((a) => [a.x, a.y, a.d, !!a.pooled, hc(a.canvas), hc(a.lights), hc(a.night)].join(' ')),
                  ground: [hc(gr.base), ...gr.crops.map(hc), gr.cropX, gr.cropY, gr.sown, JSON.stringify(gr.lamps ?? null)].join(' '),
                  pools: hc(sc.pools as HTMLCanvasElement | null),
                  anchors: JSON.stringify({ b: sc.banners, t: sc.torches, f: sc.forges, g: sc.glows, l: sc.lamps, a: life.anchors, wf: life.wallFront, wb: life.wallBack, hub: (sc.mill as { hub: unknown } | null)?.hub ?? null }),
                  anims: props ? JSON.stringify(props.painted.anims.map((a) => [a.d, a.x, a.y, a.seed, a.box, String(a.fn)])) : '-',
                };
              };
              const w = window as unknown as { city: { live: { scene: Scene & { faction: string; hue: number; seed: number } }[] } };
              const l = w.city.live[0]!;
              const S = l.scene.constructor as new (f: string, h: number, s: number, m: string) => Scene;
              const sc = new S(l.scene.faction, l.scene.hue, l.scene.seed, art);
              if (via === 'job') sc.remote = null;
              const c = document.createElement('canvas');
              c.width = 1280;
              c.height = 720;
              let levels: Record<string, number> = { ...BASE };
              let progress: Record<string, number> = {};
              const mood = () => ({ hour: 23, streak: 2, progress });
              const frame = () => new Promise((res) => requestAnimationFrame(res));
              sc.draw(c, levels, 10, 0, mood());
              for (const [i, step] of seq.entries()) {
                levels = { ...levels, ...step.ch } as Record<string, number>;
                if (step.progress) progress = step.progress;
                sc.draw(c, levels, 10, 0, mood());
                // Every other change lands before the last build is in.
                if (i % 2 === 0)
                  for (let k = 0; k < 3; k++) {
                    await frame();
                    sc.draw(c, levels, 10, 0, mood());
                  }
                else
                  for (let k = 0; k < 2000 && sc.busy; k++) {
                    await frame();
                    sc.draw(c, levels, 10, 0, mood());
                  }
              }
              for (let k = 0; k < 4000 && sc.busy; k++) {
                await frame();
                sc.draw(c, levels, 10, 0, mood());
              }
              if (sc.busy) return { diffs: ['never settled'] };
              // A late reply (the worker's warm-up build of the opening) must change nothing either.
              for (let k = 0; k < 30; k++) {
                await frame();
                sc.draw(c, levels, 10, 0, mood());
              }
              const got = dump(sc);
              const ref = new S(l.scene.faction, l.scene.hue, l.scene.seed, art);
              ref.remote = null;
              ref.draw(c, levels, 10, 0, mood());
              const want = dump(ref);
              const diffs: string[] = [];
              for (const k of Object.keys(want)) {
                const a = want[k];
                const g = got[k];
                if (JSON.stringify(a) === JSON.stringify(g)) continue;
                diffs.push(k);
                if (Array.isArray(a)) a.forEach((x, i) => x !== (g as unknown[])[i] && diffs.push(`  ${i} ${x} => ${(g as unknown[])[i]}`));
              }
              return { diffs };
            },
            { BASE, seq, via, art },
          );
          if (r.diffs.length) bad++;
          console.log(`${r.diffs.length ? 'DIFF' : 'same'} ${art} ${faction} ${via} ${name}${r.diffs.length ? '\n' + r.diffs.slice(0, 12).join('\n') : ''}`);
        }
    }
  await page.close();
  console.log(bad ? `${bad} sequences differ` : 'every sequence is pixel-identical to a fresh synchronous build');
  return bad;
}

const CHANGES: [string, Partial<typeof BASE>][] = [
  ['level-up', { range: 7 }],
  ['level-up', { hospital: 6 }],
  ['level-up', { stables: 8 }],
  ['tier', { barracks: 10 }],
  ['tier', { chapter: 11 }],
  ['walls', { walls: 11 }],
  ['tier', { walls: 15 }],
  ['multi', { barracks: 8, chapter: 9, range: 6, hospital: 5, walls: 10 }],
];

async function bench(b: Browser): Promise<void> {
  const page = await b.page();
  const rows: { faction: string; hour: number; name: string; work: number; draw: number; shown: number; first: number }[] = [];
  for (const faction of ['templar', 'samurai', 'undead'])
    for (const hour of [11, 23]) {
      await page.goto(`${b.base}/city-preview.html?art=hd&faction=${faction}&only=2&paused&hour=${hour}`, { waitUntil: 'load' });
      await page.waitForFunction('window.city && window.city.live.length');
      const r = await page.evaluate(
        async ({ BASE, CHANGES, hour }) => {
          const w = window as unknown as { city: { live: { canvas: HTMLCanvasElement; scene: Scene & { faction: string; hue: number; seed: number } }[] } };
          const l = w.city.live[0]!;
          const S = l.scene.constructor as new (f: string, h: number, s: number, m: string) => Scene;
          const sc = new S(l.scene.faction, l.scene.hue, l.scene.seed + 7, 'hd');
          const c = l.canvas;
          let levels: Record<string, number> = { ...BASE };
          const mood = { hour, streak: 2 };
          const t0 = performance.now();
          sc.draw(c, levels, 10, 1 / 60, mood);
          const first = performance.now() - t0;
          // Main-thread build work: the scene's schedule/pump (and the pools) and the worker's replies.
          let work = 0;
          const wrap = (o: Record<string, unknown>, name: string) => {
            const f = o[name] as (...a: unknown[]) => unknown;
            o[name] = function (this: unknown, ...a: unknown[]) {
              const t = performance.now();
              try {
                return f.apply(this, a);
              } finally {
                work += performance.now() - t;
              }
            };
          };
          for (const m of ['schedule', 'pump', 'lightPools']) wrap(sc, m);
          if (sc.remote) wrap(sc.remote as unknown as Record<string, unknown>, 'receive');
          const frame = () => new Promise((res) => requestAnimationFrame(res));
          const frames = async (n: number) => {
            for (let i = 0; i < n; i++) {
              await frame();
              sc.draw(c, levels, 10, 1 / 60, mood);
            }
          };
          await frames(120);
          const out: { name: string; work: number; draw: number; shown: number }[] = [];
          for (const [name, ch] of CHANGES) {
            await frames(20);
            levels = { ...levels, ...ch } as Record<string, number>;
            let worstWork = 0;
            let worstDraw = 0;
            let shown = 0;
            const s0 = performance.now();
            work = 0;
            for (let i = 0; i < 2000; i++) {
              const a = performance.now();
              sc.draw(c, levels, 10, 1 / 60, mood);
              worstDraw = Math.max(worstDraw, performance.now() - a);
              worstWork = Math.max(worstWork, work);
              work = 0;
              if (!sc.busy) {
                shown = performance.now() - s0;
                break;
              }
              await frame();
            }
            out.push({ name, work: worstWork, draw: worstDraw, shown });
          }
          return { first, out };
        },
        { BASE, CHANGES, hour },
      );
      for (const o of r.out) rows.push({ faction, hour, ...o, first: r.first });
      console.log(`${faction} hour ${hour}: first paint ${r.first.toFixed(0)} ms; ` + r.out.map((o) => `${o.name} ${o.work.toFixed(1)}/${o.draw.toFixed(1)}/${o.shown.toFixed(0)}`).join('  '));
    }
  for (const n of ['level-up', 'tier', 'walls', 'multi']) {
    const xs = rows.filter((r) => r.name === n);
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1]!;
    console.log(`${n.padEnd(9)} build work in one frame: worst ${Math.max(...xs.map((x) => x.work)).toFixed(1)} median ${med(xs.map((x) => x.work)).toFixed(1)} ms | worst draw ${Math.max(...xs.map((x) => x.draw)).toFixed(1)} ms | shown after median ${med(xs.map((x) => x.shown)).toFixed(0)} max ${Math.max(...xs.map((x) => x.shown)).toFixed(0)} ms`);
  }
  await page.close();
}

const b = await Browser.start(process.cwd());
let code = 0;
try {
  if (process.argv.includes('--bench')) await bench(b);
  else code = (await check(b)) ? 1 : 0;
} finally {
  await b.close();
}
process.exit(code);
