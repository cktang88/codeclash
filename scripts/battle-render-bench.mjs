// Battle renderer bench (docs/perf/battle-render.md): compares two builds of the renderer, each
// served by its own Vite dev server (say a `git archive` of the base commit, and this tree: run
// `node node_modules/vite/bin/vite.js --port 5301` in one and `--port 5302` in the other), on
// battle-perf.html, in headless Chromium with software GL.
//
//   node scripts/battle-render-bench.mjs perf [key=value...]
//     per-frame CPU (draw, the instance build, afterStep per tick), GL calls and bytes sent per
//     frame, draw calls, then 30 paused frames; alloc=1 adds KB allocated per frame (sampling heap
//     profiler: it slows the run, so time without it), cpu=1 a CPU profile by function, buffers=1
//     bytes per GL buffer, sync=1 waits for the GPU after each frame.
//   node scripts/battle-render-bench.mjs shot out=<prefix> [key=value...]
//     a deterministic still on both builds (fake clock; `frames` frames at 60 fps with a tick every
//     6, then a paused frame), saved as <prefix>-base.rgba / -cur.rgba (rows bottom-up) and compared
//     byte for byte; in HD it also checks the incremental ground compose against a full one.
//
//   base=<url> cur=<url> which=base|cur|both runs=N (alternating) frames=N w= h=
//   men= seed= t= art=classic|hd|hd64 zoom= focus= fa= fb= cx= cy= per=
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
/** Playwright from the project, NODE_PATH or the global install (CLAUDE.md: `require('playwright')`). */
function playwright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node22/lib/node_modules/playwright');
  }
}
const { chromium } = playwright();

const [mode = 'perf', ...rest] = process.argv.slice(2);
const o = Object.fromEntries(rest.map((a) => a.split('=')));
const W = Number(o.w ?? 1600);
const H = Number(o.h ?? 900);
const servers = { base: o.base ?? 'http://localhost:5301', cur: o.cur ?? 'http://localhost:5302' };
const which = (o.which ?? 'both') === 'both' ? ['base', 'cur'] : [o.which];
const runs = Number(o.runs ?? 1);
const frames = Number(o.frames ?? 120);
const query = new URLSearchParams({ men: o.men ?? '4000', seed: o.seed ?? '3', t: o.t ?? '600', pause: '1', hud: '0', frames: '1', art: o.art ?? 'hd', zoom: o.zoom ?? '1', scan: '1' });
for (const k of ['fa', 'fb', 'focus', 'cx', 'cy', 'per']) if (o[k]) query.set(k, o[k]);

const GLWRAP = `
(() => {
  const P = WebGL2RenderingContext.prototype;
  const c = (window.__gl = { on: false, n: {}, bytes: {} });
  const wrap = (name, bytes) => {
    const f = P[name];
    P[name] = function (...a) {
      if (c.on) {
        c.n[name] = (c.n[name] || 0) + 1;
        if (bytes) c.bytes[name] = (c.bytes[name] || 0) + bytes(a);
      }
      return f.apply(this, a);
    };
  };
  for (const n of ['drawArrays','drawArraysInstanced','bindTexture','useProgram','bindFramebuffer','bindVertexArray','bindBuffer','enable','disable','blendFunc','blendFuncSeparate','depthMask','depthFunc','stencilFunc','stencilOp','viewport','clear','clearColor','clearDepth','clearStencil','blitFramebuffer','activeTexture','texParameteri','pixelStorei','uniform1f','uniform2f','uniform3f','uniform4f','uniform1i','uniform1ui','uniform4ui','createTexture','deleteTexture','createBuffer','createFramebuffer']) wrap(n);
  {
    const ids = new WeakMap();
    let nid = 0;
    let cur = null;
    const bb = P.bindBuffer;
    P.bindBuffer = function (t, b) { cur = b; return bb.call(this, t, b); };
    const bs = P.bufferSubData;
    c.per = {};
    P.bufferSubData = function (...a) {
      if (c.on && cur) {
        if (!ids.has(cur)) ids.set(cur, nid++);
        const k = ids.get(cur);
        const by = a[4] !== undefined ? a[4] * 4 : a[2].byteLength;
        const e = (c.per[k] ||= { calls: 0, bytes: 0 });
        e.calls++;
        e.bytes += by;
      }
      return bs.apply(this, a);
    };
    const ti = P.texImage2D;
    c.tex = [];
    P.texImage2D = function (...a) {
      if (c.on) c.tex.push(a.length >= 9 ? a[3] + 'x' + a[4] + (a[8] ? ' data' : ' null') : (a[5] && a[5].width) + 'x' + (a[5] && a[5].height) + ' src');
      return ti.apply(this, a);
    };
  }
  wrap('bufferData', (a) => (typeof a[1] === 'number' ? a[1] : a[1].byteLength));
  wrap('bufferSubData', (a) => (a[4] !== undefined ? a[4] * a[2].BYTES_PER_ELEMENT : a[2].byteLength - (a[3] || 0) * (a[2].BYTES_PER_ELEMENT || 1)));
  wrap('texSubImage2D', (a) => (a.length >= 9 ? a[4] * a[5] * 4 : 0));
  wrap('texImage2D', (a) => (a.length >= 9 ? a[3] * a[4] * 4 : (a[5] && a[5].width ? a[5].width * a[5].height * 4 : 0)));
})();`;

const FAKECLOCK = `
(() => {
  let t = 0;
  window.__tick = (ms) => (t += ms);
  performance.now = () => t;
})();`;

async function one(browser, name, url) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.addInitScript({ content: 'globalThis.__name = (f) => f;' });
  await page.addInitScript({ content: GLWRAP });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${url}/battle-perf.html?${query}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction('window.__done === true', null, { timeout: 300000, polling: 200 });
  const cdp = await page.context().newCDPSession(page);
  // Warm: draw still frames until the HD sheets stop arriving.
  await page.evaluate(async () => {
    const s = window.__scene;
    const cv = document.getElementById('c');
    let lastB = -1;
    let stableAt = performance.now();
    const t0 = performance.now();
    while (performance.now() - t0 < 600000) {
      s.draw(cv, 1, 0);
      await new Promise((r) => setTimeout(r, 50));
      // Not settled until every grid has landed and each kind in view has its finest level.
      const sharp = window.__sharp ? window.__sharp().sharp : true;
      const b = sharp ? window.__scene.spriteGpuBytes : -2 - Math.random();
      if (b !== lastB) {
        lastB = b;
        stableAt = performance.now();
      } else if (performance.now() - stableAt > 4000) break;
    }
  });
  if (mode === 'shot') {
    // Deterministic: a fake clock from here on, `frames` frames at 60 fps, a tick every 6.
    await page.evaluate(FAKECLOCK);
    const { b64, selfFull } = await page.evaluate(async (frames) => {
      const s = window.__scene;
      const cv = document.getElementById('c');
      for (let i = 0; i < frames; i++) {
        if (i % 6 === 0) window.__step(1);
        window.__tick(1000 / 60);
        s.draw(cv, (i % 6) / 6, 1 / 60);
        await new Promise((r) => setTimeout(r, 0));
      }
      // A paused still on top (alpha 1, dt 0), then read the canvas back in the same task.
      window.__tick(1000 / 60);
      // Catch the ground up with what changed since its last (throttled) composition.
      if (s.invalidateGround) s.invalidateGround(false);
      s.draw(cv, 1, 0);
      const gl = cv.getContext('webgl2');
      const px = new Uint8Array(cv.width * cv.height * 4);
      gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let selfFull = null;
      if (s.invalidateGround && s.art !== 'classic') {
        // The same still with the ground composed from scratch: must match the incremental one.
        s.invalidateGround(true);
        s.draw(cv, 1, 0);
        const px2 = new Uint8Array(cv.width * cv.height * 4);
        gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px2);
        selfFull = 0;
        for (let i = 0; i < px.length; i++) if (px[i] !== px2[i]) selfFull++;
      }
      let str = '';
      for (let i = 0; i < px.length; i += 0x8000) str += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return { b64: btoa(str), selfFull };
    }, frames);
    await page.close();
    if (selfFull !== null) console.log(name, 'incremental vs full compose: differing bytes', selfFull);
    return { name, errs, px: Buffer.from(b64, 'base64') };
  }
  const prof = o.alloc === '1';
  const cpu = o.cpu === '1';
  if (cpu) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }
  if (prof) await cdp.send('HeapProfiler.enable');
  if (prof) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
  const r = await page.evaluate(
    async ({ frames, sync }) => {
      const s = window.__scene;
      const cv = document.getElementById('c');
      const gl = cv.getContext('webgl2');
      const px1 = new Uint8Array(4);
      let stepMs = 0;
      const orig = s.afterStep.bind(s);
      s.afterStep = () => {
        const t = performance.now();
        orig();
        stepMs += performance.now() - t;
      };
      const out = { draw: [], build: [], wall: [], after: 0, steps: 0, gl: {}, bytes: {}, perFrameDraws: [] };
      const G = window.__gl;
      for (let i = 0; i < frames; i++) {
        if (i % 6 === 0) {
          window.__step(1);
          out.steps++;
        }
        G.n = {};
        G.bytes = {};
        G.on = true;
        const t0 = performance.now();
        s.draw(cv, (i % 6) / 6, 1 / 60);
        if (sync) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
        const t1 = performance.now();
        G.on = false;
        out.draw.push(s.lastDrawMs);
        out.build.push(s.lastBuildMs);
        out.wall.push(t1 - t0);
        out.perFrameDraws.push((G.n.drawArrays || 0) + (G.n.drawArraysInstanced || 0));
        for (const k in G.n) out.gl[k] = (out.gl[k] || 0) + G.n[k];
        for (const k in G.bytes) out.bytes[k] = (out.bytes[k] || 0) + G.bytes[k];
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Paused: 30 frames with no time passing (the first may still draw).
      G.n = {};
      G.on = true;
      const sk0 = s.skipped ?? 0;
      let tp = 0;
      for (let i = 0; i < 30; i++) {
        const q0 = performance.now();
        s.draw(cv, 1, 0);
        tp += performance.now() - q0;
        await new Promise((r) => requestAnimationFrame(r));
      }
      G.on = false;
      out.paused = { ms: +(tp / 30).toFixed(3), skipped: (s.skipped ?? 0) - sk0, glCalls: Object.values(G.n).reduce((a, b) => a + b, 0) };
      out.after = stepMs;
      out.per = G.per;
      out.tex = G.tex;
      s.afterStep = orig;
      return out;
    },
    { frames, sync: o.sync === '1' },
  );
  if (cpu) {
    const { profile: cp } = await cdp.send('Profiler.stop');
    const nodes = new Map(cp.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of cp.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const self = new Map();
    const dt = new Map();
    cp.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (cp.timeDeltas[i + 1] ?? 0)));
    const by = {};
    const tot = {};
    for (const [id, t] of self) {
      // context: nearest draw/afterStep ancestor
      let ctx = null;
      let p = id;
      const chain = [];
      while (p !== undefined) {
        const fn = nodes.get(p).callFrame.functionName;
        chain.push(fn);
        if (!ctx && (fn === 'draw' || fn === 'afterStep' || fn === 'step')) ctx = fn;
        p = parent.get(p);
      }
      if (!ctx) continue;
      const n = nodes.get(id).callFrame;
      const k = `${ctx}:${n.functionName || '(anon)'}:${n.lineNumber + 1}`;
      by[k] = (by[k] || 0) + t;
      tot[ctx] = (tot[ctx] || 0) + t;
    }
    console.log('CPU (ms total over run)', JSON.stringify(Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, +(v / 1000).toFixed(1)]))));
    for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, Number(o.top ?? 25))) console.log('  ', (v / 1000).toFixed(1).padStart(7), k);
  }
  const { profile } = prof ? await cdp.send('HeapProfiler.stopSampling') : { profile: { head: { callFrame: {}, selfSize: 0, children: [] } } };
  // Bytes allocated under draw() and afterStep(), by function.
  const by = {};
  let inDraw = 0;
  let inAfter = 0;
  const walk = (n, ctx) => {
    const fn = n.callFrame.functionName || '(anon)';
    let c = ctx;
    if (!c && (fn === 'draw' || fn === 'afterStep' || fn === 'afterStepHd')) c = fn === 'draw' ? 'draw' : 'afterStep';
    if (c) {
      const key = `${c}:${fn}@${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
      by[key] = (by[key] || 0) + n.selfSize;
      if (c === 'draw') inDraw += n.selfSize;
      else inAfter += n.selfSize;
    }
    for (const ch of n.children) walk(ch, c);
  };
  walk(profile.head, null);
  await page.close();
  return { name, errs, r, alloc: { inDraw, inAfter, by } };
}

const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { mean: +mean.toFixed(3), med: +s[Math.floor(s.length / 2)].toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), max: +s[s.length - 1].toFixed(3) };
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = {};
for (let k = 0; k < runs; k++)
  for (const w of k % 2 === 0 ? which : [...which].reverse()) {
    const res = await one(browser, w, servers[w]);
    if (res.errs.length) console.error(w, 'errors', res.errs.slice(0, 3));
    if (mode === 'shot') {
      writeFileSync(`${o.out ?? 'battle-shot'}-${w}.rgba`, res.px);
      results[w] = res.px;
      continue;
    }
    const r = res.r;
    const F = r.draw.length;
    const line = {
      run: k,
      who: w,
      draw: stat(r.draw),
      build: stat(r.build),
      ...(o.sync === '1' ? { wall: stat(r.wall) } : {}),
      afterStepMs: +(r.after / r.steps).toFixed(3),
      glPerFrame: Object.fromEntries(Object.entries(r.gl).map(([k, v]) => [k, +(v / F).toFixed(2)]).sort()),
      bytesPerFrame: Object.fromEntries(Object.entries(r.bytes).map(([k, v]) => [k, Math.round(v / F)])),
      drawCallsRange: [Math.min(...r.perFrameDraws), Math.max(...r.perFrameDraws)],
      paused30: r.paused,
      allocKBperFrame: +(res.alloc.inDraw / F / 1024).toFixed(1),
      allocKBperStep: +(res.alloc.inAfter / r.steps / 1024).toFixed(1),
      topAlloc: Object.entries(res.alloc.by).sort((a, b) => b[1] - a[1]).slice(0, Number(o.top ?? 8)).map(([k, v]) => `${k} ${(v / F / 1024).toFixed(1)}KB/f`),
    };
    console.log(JSON.stringify(line, null, o.pretty ? 1 : 0));
    if (o.buffers === '1') {
      console.log('per buffer KB/frame', Object.values(r.per).map((e) => `${(e.bytes / F / 1024).toFixed(0)}KB/${(e.calls / F).toFixed(2)}`).join(' '));
      console.log('texImage2D', r.tex.join(', '));
    }
  }
if (mode === 'shot' && results.base && results.cur) {
  const a = results.base;
  const b = results.cur;
  let diff = 0;
  let maxd = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) {
      diff++;
      if (d > maxd) maxd = d;
    }
  }
  console.log(JSON.stringify({ shot: query.toString(), bytes: a.length, sameLength: a.length === b.length, differingBytes: diff, maxDelta: maxd }));
}
await browser.close();
