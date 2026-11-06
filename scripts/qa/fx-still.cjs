// A still of /battle-perf.html with the battle running into it, so particles, missiles in the
// air and swaying standards are caught live (scripts/qa/still.cjs shows a paused field, where
// the fast-forward's particles have long gone):
//   node scripts/qa/fx-still.cjs <out.png> "<query>" [ticks=30] [port=5302] [w=1280] [h=800]
// e.g. "seed=3&men=3000&t=300&zoom=3&focus=1&art=hd&fa=samurai&fb=templar"
// Loads paused, waits for the sharp sheets, then steps `ticks` battle ticks, ~6 frames each.
// `follow=cls:N[:team]` in the query keeps the camera on the men of class N (of that side) who
// are shooting, fighting or moving, `follow=fight` on the thick of the fighting, every tick.
const { chromium } = require('playwright');
const [out, query, ticks = '30', port = '5302', w = '1280', h = '800'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  await page.goto(`http://localhost:${port}/battle-perf.html?pause=1&hud=0&scan=0&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__battle, null, { timeout: 120000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => window.__sharp?.().sharp ?? true)) break;
  }
  for (let i = 0; i < Number(ticks); i++) {
    await page.evaluate((follow) => {
      window.__step(1);
      if (!follow) return;
      const b = window.__battle;
      const [, c, t] = follow.split(':');
      const cls = follow === 'fight' ? -1 : Number(c);
      const side = t === undefined ? -1 : Number(t);
      let sx = 0, sy = 0, n = 0;
      for (const s of b.soldiers)
        if (s.state === 0 && (cls < 0 ? b.tick - s.actedAt < 20 && s.target >= 0 : s.cls === cls && (side < 0 || s.team === side) && (b.tick - s.actedAt < 30 || s.vx * s.vx + s.vy * s.vy > 100))) {
          sx += s.x; sy += s.y; n++;
        }
      if (n === 0) return;
      const cam = window.__scene.camera;
      const k = window.__followed ? 0.25 : 1;
      window.__followed = true;
      cam.cx += (sx / n - cam.cx) * k;
      cam.cy += (sy / n - cam.cy) * k;
    }, new URLSearchParams(query).get('follow'));
    // About six frames a tick, as the game draws at 1x.
    await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 6 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  }
  await page.screenshot({ path: out });
  console.log(out, 'tick', await page.evaluate(() => window.__battle.tick));
  await browser.close();
})();
