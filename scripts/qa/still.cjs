// One still of /battle-perf.html, waiting until the HD sprites in view are sharp (or a timeout):
//   node scripts/qa/still.cjs <out.png> "<query>" [maxWaitMs] [port]
// e.g. "seed=1&men=1200&t=300&zoom=4&cx=500&cy=560&art=hd"
const { chromium } = require('playwright');
const [out, query, wait = '30000', port = '5220'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${port}/battle-perf.html?pause=1&hud=0&scan=0&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__battle, null, { timeout: 120000 });
  const t0 = Date.now();
  let sharp = false;
  while (Date.now() - t0 < Number(wait)) {
    await page.waitForTimeout(500);
    sharp = await page.evaluate(() => window.__sharp?.().sharp ?? true);
    if (sharp) break;
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: out });
  console.log(out, 'sharp', sharp, 'after', Date.now() - t0, 'ms');
  await browser.close();
})();
