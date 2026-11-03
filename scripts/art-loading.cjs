// Art-loading timings (docs/perf/art-loading.md): production builds of a baseline and of a change,
// each scenario run on one then the other under the same load. Times are page time
// (performance.now(), ms since navigation) unless noted. To compare two trees:
//   REPO=<tree> OUT=<dir> npx vite build --config scripts/art-loading.vite.config.mjs   (each tree)
//   node scripts/art-loading-serve.cjs <dir> <port> &                                  (each build)
//   node scripts/art-loading.cjs <out.json> base=http://127.0.0.1:<port> new=http://127.0.0.1:<port> [--only=visit-hd,switch] [--reps=n]
// Scenarios: visit-classic|hd|hd64 (first visit, then a second once the first has drained its
// queue), switch (the battle's art button in place), units (/demo?tab=units in HD).
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const fs = require('fs');
const args = process.argv.slice(2);
const out = args[0];
const sites = args.slice(1).filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split('='));
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const reps = Number((args.find((a) => a.startsWith('--reps=')) || '--reps=1').slice(7));
const ZOOM = { classic: 1, hd: 4, hd64: 4 };
const LIMIT = 900000;

// In every page: the page time at which the scene is first sharp (every kind in view at the
// finest level the view shows, grids landed), re-armed by __rearm().
const probe = () => {
  window.__sharpAt = 0;
  window.__rearm = () => (window.__sharpAt = 0);
  const tick = () => {
    try {
      if (!window.__sharpAt && window.__perf && window.__perf.frames > 1 && window.__scene.view.W > 1 && window.__sharp().sharp) window.__sharpAt = performance.now();
    } catch {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function snap(page) {
  return page.evaluate(() => {
    const marks = performance.getEntriesByType('mark');
    const m = (n) => Math.round(marks.find((x) => x.name === n)?.startTime ?? -1);
    return {
      firstFrame: m('codeclash:first-frame'),
      sharp: Math.round(window.__sharpAt),
      heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      hud: window.__perf.buffer.replace(/^.*?art=/, 'art='),
    };
  });
}
/** Waits until no sheet has landed for `quiet` ms (the queue is drained), at most `max`. */
async function settle(page, quiet = 8000, max = 180000) {
  const t0 = Date.now();
  let n = -1, since = Date.now();
  while (Date.now() - t0 < max) {
    const k = await page.evaluate(() => performance.getEntriesByName('codeclash:sheet').length);
    if (k !== n) (n = k), (since = Date.now());
    else if (Date.now() - since > quiet) break;
    await page.waitForTimeout(500);
  }
}
const url = (base, art) => `${base}/battle-perf.html?art=${art}&zoom=${ZOOM[art]}&pause=1&t=0&aim=0`;

const SCENARIOS = {
  // A first visit (empty profile), then a second visit once the first has painted what it queued.
  ...Object.fromEntries(
    ['classic', 'hd', 'hd64'].map((art) => [
      `visit-${art}`,
      async (ctx, base) => {
        let page = await ctx.newPage();
        await page.goto(url(base, art));
        await page.waitForFunction(() => window.__sharpAt > 0, null, { timeout: LIMIT, polling: 100 });
        const first = await snap(page);
        await settle(page);
        await page.close();
        await new Promise((r) => setTimeout(r, 3000));
        page = await ctx.newPage();
        await page.goto(url(base, art));
        await page.waitForFunction(() => window.__sharpAt > 0, null, { timeout: LIMIT, polling: 100 });
        const second = await snap(page);
        return { first, second };
      },
    ]),
  ),
  // The battle's art button, in place: HD sharp, then HD 64, Classic, HD, HD 64 (time from the
  // switch to sharp again).
  switch: async (ctx, base) => {
    const page = await ctx.newPage();
    await page.goto(url(base, 'hd'));
    await page.waitForFunction(() => window.__sharpAt > 0, null, { timeout: LIMIT, polling: 100 });
    const start = await snap(page);
    const steps = [];
    for (const to of ['hd64', 'classic', 'hd', 'hd64']) {
      const t0 = await page.evaluate((to) => {
        const t = performance.now();
        window.__switch(to);
        window.__scene.camera.zoom = to === 'classic' ? 1 : 4;
        window.__rearm();
        return t;
      }, to);
      await page.waitForFunction(() => window.__sharpAt > 0, null, { timeout: LIMIT, polling: 100 });
      const s = await snap(page);
      steps.push({ to, ms: s.sharp - Math.round(t0), heapMB: s.heapMB, hud: s.hud });
    }
    return { start, steps };
  },
  // /demo?tab=units in HD: until every kind's level-4 sheet has landed (the tab's default size),
  // then the same in a second visit.
  units: async (ctx, base) => {
    await ctx.addInitScript(() => localStorage.setItem('codeclash.art', 'hd'));
    const r = {};
    for (const visit of ['first', 'second']) {
      const page = await ctx.newPage();
      await page.goto(`${base}/demo?tab=units`);
      await page.waitForFunction(() => performance.getEntriesByName('codeclash:sheet').filter((m) => /:4$/.test(m.detail)).length >= 11, null, { timeout: LIMIT, polling: 100 });
      r[visit] = await page.evaluate(() => ({
        sharp: Math.round(Math.max(...performance.getEntriesByName('codeclash:sheet').filter((m) => /:4$/.test(m.detail)).map((m) => m.startTime))),
        heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      }));
      if (visit === 'first') await settle(page, 5000, 60000);
      await page.close();
      await new Promise((r) => setTimeout(r, 3000));
    }
    return r;
  },
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  for (let rep = 0; rep < reps; rep++)
    for (const [name, f] of Object.entries(SCENARIOS)) {
      if (only.length && !only.includes(name)) continue;
      for (const [site, base] of rep % 2 ? [...sites].reverse() : sites) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await ctx.addInitScript(probe);
        let r;
        try {
          r = await f(ctx, base);
        } catch (e) {
          r = { error: String(e).slice(0, 200) };
        }
        await ctx.close();
        (res[name] ??= {})[site] ??= [];
        res[name][site].push(r);
        console.log(name, site, JSON.stringify(r));
        fs.writeFileSync(out, JSON.stringify(res, null, 1));
      }
    }
  await browser.close();
})();
