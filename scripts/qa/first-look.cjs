// The first look at a battle in HD (QA battle-realism #17): from the first frame, how long the
// figures show in art that isn't presentable (a kind in view missing, or drawn from the 48 px grid
// blown up 4-8x: dark blobs), when every kind in view first has presentable art, and when the
// view is sharp. Samples every animation frame in the page.
//   node scripts/qa/first-look.cjs <label>=<base url> [<label>=<url> ...] [--reps=2] [--query=...] [--cache=1]
// e.g. node scripts/qa/first-look.cjs before=http://localhost:5226 after=http://localhost:5225
// Without --cache the sheet cache is off (a cold first visit, every sheet painted).
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const sites = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split(/=(.*)/s).slice(0, 2));
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const reps = Number(opt('reps', '2'));
const query = opt('query', 'seed=1&men=1200&t=5&zoom=4&aim=0&art=hd&pause=1');
const cache = opt('cache', '0') === '1';

const probe = () => {
  const S = (window.__look = { samples: 0, first: 0, shown: 0, presentable: 0, ugly: 0, last: 0, sharp: 0 });
  const tick = (now) => {
    try {
      const sc = window.__scene;
      if (sc && sc.view && sc.view.W > 1 && window.__perf.frames > 0) {
        if (!S.first) S.first = now;
        const m = sc.view.m;
        let n = 0, ok = 0;
        for (let t = 0; t < 2; t++) {
          const a = sc.atlases[t];
          const inView = sc.seen[t] | sc.seenDead[t];
          for (const k of sc.kindsPresent[t]) {
            if (!(inView & (1 << k))) continue;
            n++;
            if (a.levels && m > 1 ? sc.hdLevel[t][k] >= a.levels[0] : !a.landed || a.landed.includes(k)) ok++;
          }
        }
        const veil = sc.veil ?? 1;
        if (n > 0 && veil > 0 && !S.shown) S.shown = now;
        if (n > 0 && ok === n && !S.presentable) S.presentable = now;
        // Time the figures are on screen in art that isn't presentable (the frame just ended).
        if (S.last && n > 0 && veil > 0 && ok < n) S.ugly += now - S.last;
        if (!S.sharp && window.__sharp && window.__sharp().sharp) S.sharp = now;
        S.samples++;
        S.last = now;
      }
    } catch {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (let r = 0; r < reps; r++)
    for (const [label, base] of r % 2 ? [...sites].reverse() : sites) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      await page.addInitScript(probe);
      await page.goto(`${base}/battle-perf.html?hud=0&scan=0&${cache ? '' : 'sheetcache=0&'}${query}`);
      await page.waitForFunction(() => window.__look && window.__look.sharp > 0, null, { timeout: 300000, polling: 1000 });
      const s = await page.evaluate(() => window.__look);
      const f = (v) => (v ? ((v - s.first) / 1000).toFixed(1) : '-');
      const row = { label, firstFrame: (s.first / 1000).toFixed(1), shown: f(s.shown), presentable: f(s.presentable), uglyS: (s.ugly / 1000).toFixed(1), sharp: f(s.sharp) };
      console.log(JSON.stringify(row));
      rows.push(row);
      await ctx.close();
    }
  await browser.close();
})();
