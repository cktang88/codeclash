// A filmstrip of a melee at close range (HD): loads /battle-perf.html (a set piece by default),
// fast-forwards, frames the thick of the fight, waits for sharp sprites, then shoots the canvas
// every `sub` of a tick (scene drawn at that alpha), `count` shots, into <out>-NN.png, and
// tiles them into <out>-film.png (ImageMagick montage).
//   node scripts/qa/melee-film.cjs <out prefix> "<query>" [count=12] [sub=0.5] [port=5391] [crop=WxH]
// e.g. "piece=1&fa=templar&fb=undead&ca=0&cb=0&n=48&t=150&zoom=4&focus=1"
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const [out, query, count = '12', sub = '0.5', port = '5391', crop = '640x400'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${port}/battle-perf.html?pause=1&hud=0&scan=0&art=hd&frames=2&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__battle, null, { timeout: 120000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(400);
    // The page's own loop stops after two draws (frames=2): draw here so sheets are asked for.
    if (await page.evaluate(() => { window.__scene.draw(document.getElementById('c'), 0, 0); return window.__sharp?.().sharp ?? true; })) break;
  }
  // DEATH=k: step on until a man of team k (or any, DEATH=-1) falls, and frame him from the tick before.
  if (process.env.DEATH) {
    if (process.env.ISOLATE) await page.evaluate(() => { window.__isolate = true; });
    await page.evaluate((m) => { window.__maxT = m; }, Number(process.env.MAXT ?? 400));
    const who = await page.evaluate((team) => {
      const b = window.__battle, sc = window.__scene;
      for (let n = 0; n < Number(window.__maxT ?? 400) && !b.done(); n++) {
        window.__step(1);
        const s = b.soldiers.find((s) => s.state === 2 && s.diedAt >= b.tick - 1 && (team < 0 || s.team === team));
        if (s) {
          sc.camera.cx = s.x;
          sc.camera.cy = s.y;
          // ISOLATE=1: only he and the man nearest him of the other side are drawn, and time runs
          // on without the sim (the fall, the corpse and the striker, alone on the grass).
          if (window.__isolate) {
            let k = -1, best = 1e9;
            for (const o of b.soldiers) {
              if (o.team === s.team || o.state > 1) continue;
              const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
              if (d < best) { best = d; k = o.id; }
            }
            for (const o of b.soldiers) if (o.id !== s.id && o.id !== k) o.state = 3;
            window.__stepOld = window.__step;
            window.__step = () => { sc.snapshot(); b.tick++; };
          }
          return { id: s.id, tick: b.tick, team: s.team, cls: s.cls };
        }
      }
      return null;
    }, Number(process.env.DEATH));
    console.log('death', JSON.stringify(who));
    for (let n = 0; n < 20; n++) {
      await page.waitForTimeout(400);
      if (await page.evaluate(() => { window.__scene.draw(document.getElementById('c'), 0, 0); return window.__sharp?.().sharp ?? true; })) break;
    }
  }
  // PAIR=n: step on until men are trading blows, then keep n pairs of them nearest the first (the
  // rest leave the field) and let the sim run: blows, parries, wounds, alone on the grass.
  if (process.env.PAIR) {
    const who = await page.evaluate((n) => {
      const b = window.__battle, sc = window.__scene;
      for (let k = 0; k < 400 && !b.done(); k++) {
        window.__step(1);
        const s = b.soldiers.find((s) => s.state === 0 && s.actedAt === b.tick - 1 && s.target >= 0 && b.soldiers[s.target].state === 0 && s.s.range === 0);
        if (!s) continue;
        const keep = new Set([s.id, s.target]);
        const near = b.soldiers.filter((o) => o.state === 0 && o.target >= 0 && b.soldiers[o.target].state === 0).sort((a, c) => ((a.x - s.x) ** 2 + (a.y - s.y) ** 2) - ((c.x - s.x) ** 2 + (c.y - s.y) ** 2));
        for (const o of near) { if (keep.size >= n * 2) break; keep.add(o.id); keep.add(o.target); }
        for (const o of b.soldiers) if (!keep.has(o.id)) o.state = 3;
        sc.camera.cx = s.x;
        sc.camera.cy = s.y;
        return { id: s.id, tick: b.tick, kept: [...keep] };
      }
      return null;
    }, Number(process.env.PAIR));
    console.log('pair', JSON.stringify(who));
    for (let n = 0; n < 20; n++) {
      await page.waitForTimeout(400);
      if (await page.evaluate(() => { window.__scene.draw(document.getElementById('c'), 0, 0); return window.__sharp?.().sharp ?? true; })) break;
    }
  }
  await page.waitForTimeout(300);
  const [cw, ch] = crop.split('x').map(Number);
  const files = [];
  const s = Number(sub);
  let alpha = 0;
  for (let k = 0; k < Number(count); k++) {
    // Freeze the loop and draw at `alpha` ourselves.
    await page.evaluate((a) => {
      const sc = window.__scene;
      const c = document.getElementById('c');
      sc.draw(c, a, 0);
      window.__hold = true;
    }, alpha);
    if (process.env.TRACE) console.log(await page.evaluate((id) => { const sc = window.__scene, s = window.__battle.soldiers[id]; return JSON.stringify({ t: window.__battle.tick, dir: sc.dirs[id], face: sc.react?.face[id], anim: sc.anims.anim[id], st: s.state, x: s.x.toFixed(1), y: s.y.toFixed(1), fx: sc.react?.fallX[id]?.toFixed(2), fy: sc.react?.fallY[id]?.toFixed(2) }); }, Number(process.env.TRACE)));
    const file = `${out}-${String(k).padStart(2, '0')}.png`;
    await page.screenshot({ path: file, clip: { x: 640 - cw / 2, y: 400 - ch / 2 - Number(process.env.LIFT ?? 0), width: cw, height: ch } });
    files.push(file);
    alpha += s;
    while (alpha >= 1 - 1e-6) {
      alpha -= 1;
      await page.evaluate(() => window.__step(1));
    }
  }
  await browser.close();
  execFileSync('montage', [...files, '-tile', '4x', '-geometry', process.env.UP ? `${cw * Number(process.env.UP)}x${ch * Number(process.env.UP)}+2+2` : '+2+2', '-filter', 'point', '-background', '#222', `${out}-film.png`]);
  console.log(`${out}-film.png`);
})();
