// QA screenshot sequences of whole battles on /battle-perf.html (paused, stepped from the page):
// deployment, the advance under fire, first contact, cavalry charges, melee, routs, the general,
// the engines, the end. For each moment: the shot when it is found, and two more 0.5 s and 1 s on.
//   npx vite --port 5220 --strictPort &
//   node scripts/qa/battle-shots.cjs <out dir> <seed> <men> [art=hd|classic] [port] [only]
// Prints one JSON line per shot (moment, tick, regiment, mode, file).
const { chromium } = require('playwright');
const [out, seed = '1', men = '1200', art = 'hd', port = '5220', only = ''] = process.argv.slice(2);

// Each: predicate (b, ctx) -> regiment or {x, y} or null; zoom.
const moments = {
  deploy: { find: `(b) => b.tick >= 5 ? { x: 800, y: 600 } : null`, zoom: 1 },
  'deploy-close': { find: `(b) => b.tick >= 5 ? b.regiments.find((r) => r.team === 0 && r.role === 'line' && r.line === 1) : null`, zoom: 3 },
  'advance-under-fire': { find: `(b) => b.tick > 120 && b.regiments.find((r) => r.role === 'line' && r.mode === 'advance' && r.arrows > 1 && r.alive > 20)`, zoom: 2.5 },
  'cav-clash': { find: `(b) => b.regiments.find((r) => r.role === 'flank' && r.engaged && r.alive > 6)`, zoom: 3.5 },
  'first-foot-contact': { find: `(b) => b.regiments.find((r) => r.role === 'line' && r.engaged && r.meleeTicks > 5 && r.meleeTicks < 15)`, zoom: 3.5 },
  'knight-charge': { find: `(b) => b.regiments.find((r) => r.role === 'shock-cav' && r.mode === 'charge' && b.soldiers.some((s) => s.reg === r.id && s.impetus > 0.5 && b.soldiers.some((o) => o.team !== s.team && o.state === 0 && Math.abs(o.x - s.x) < 14 && Math.abs(o.y - s.y) < 14)))`, zoom: 4 },
  'melee-line': { find: `(b) => b.tick > 330 && b.regiments.find((r) => r.role === 'line' && r.engaged && r.meleeTicks > 80 && r.alive > 20)`, zoom: 3 },
  'melee-wide': { find: `(b) => b.tick > 450 && b.regiments.filter((r) => r.engaged).length > 4 ? b.regiments.find((r) => r.role === 'line' && r.engaged) : null`, zoom: 1.6 },
  'archers-shooting': { find: `(b) => b.tick > 200 && b.regiments.find((r) => r.role === 'missile' && r.mode === 'shoot' && r.loosed > 3)`, zoom: 3.5 },
  'horse-archers': { find: `(b) => b.tick > 150 && b.regiments.find((r) => r.role === 'horse-archer' && (r.mode === 'kite' || r.mode === 'shoot') && r.alive > 4)`, zoom: 3.5 },
  general: { find: `(b) => b.tick > 400 && b.regiments.find((r) => r.role === 'command' && r.alive > 0 && r.engaged)`, zoom: 4 },
  engines: { find: `(b) => b.tick > 300 && b.regiments.find((r) => r.role === 'siege' && r.alive > 0)`, zoom: 4 },
  rout: { find: `(b) => b.regiments.find((r) => r.routed && r.role === 'line' && b.tick - r.routAt === 25 && r.alive > 10)`, zoom: 3 },
  pursuit: { find: `(b) => b.regiments.find((r) => r.mode === 'pursue' && r.alive > 8 && r.role === 'line')`, zoom: 2.5 },
  end: { find: `(b) => (b.done() || b.brokenAt >= 0 && b.tick - b.brokenAt > 100) ? { x: 800, y: 600 } : null`, zoom: 1 },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // One pass through the battle: step until some moment not yet shot is found, shoot it, go on.
  await page.goto(`http://localhost:${port}/battle-perf.html?seed=${seed}&men=${men}&pause=1&art=${art}&hud=0&scan=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__battle && window.__scene, null, { timeout: 60000 });
  const todo = Object.fromEntries(Object.entries(moments).filter(([n]) => !only || only.split(',').includes(n)).map(([n, m]) => [n, m]));
  await page.evaluate((todo) => {
    window.__qa = Object.fromEntries(Object.entries(todo).map(([n, m]) => [n, { f: eval(m.find), zoom: m.zoom }]));
  }, todo);
  for (;;) {
    const res = await page.evaluate(() => {
      const b = window.__battle;
      for (;;) {
        for (const [name, m] of Object.entries(window.__qa)) {
          const r = m.f(b);
          if (!r) continue;
          delete window.__qa[name];
          const sc = window.__scene;
          sc.camera.zoom = m.zoom;
          let cx = r.cx ?? r.x;
          let cy = r.cy ?? r.y;
          if (r.members && r.engaged) {
            // Frame the men of it who are at grips.
            let n = 0, sx = 0, sy = 0;
            for (const id of r.members) {
              const s = b.soldiers[id];
              if (s.state === 0 && s.target >= 0) { sx += s.x; sy += s.y; n++; }
            }
            if (n > 0) { cx = sx / n; cy = sy / n; }
          }
          sc.camera.cx = cx;
          sc.camera.cy = cy;
          return { moment: name, tick: b.tick, reg: r.id ?? -1, role: r.role, mode: r.mode, team: r.team, target: r.targetReg, cx: Math.round(cx), cy: Math.round(cy) };
        }
        if (b.done() && b.tick > 0 && Object.keys(window.__qa).length) {
          if (window.__qa.end) continue;
          return { left: Object.keys(window.__qa) };
        }
        if (b.tick > 3700 || Object.keys(window.__qa).length === 0) return { left: Object.keys(window.__qa) };
        window.__step(1);
      }
    });
    if (res.left) {
      console.log(JSON.stringify({ notFound: res.left }));
      break;
    }
    await page.waitForTimeout(art === 'hd' ? 4000 : 700);
    for (const k of [0, 1, 2]) {
      if (k > 0) {
        await page.evaluate(() => window.__step(5));
        await page.waitForTimeout(art === 'hd' ? 1500 : 400);
      }
      const file = `${out}/s${seed}-${men}-${res.moment}${k ? '-' + k : ''}.png`;
      await page.screenshot({ path: file });
      console.log(JSON.stringify({ ...res, k, file }));
    }
  }
  await browser.close();
})();
