// Screenshots of formations and manoeuvres (battle v6): the whole deployment at the default zoom
// in the real battle page (/demo, with its HUD) at two window sizes, and a cavalry block wheeling
// (on /battle-perf.html, which fixes the seed): three frames a second apart, close up, and a
// top-down schematic of the block's track with its facing every half second.
//   npx vite --port 5377 &   then   node scripts/battle-formation-shots.cjs <out dir> [round] [port] [seed]
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const out = process.argv[2];
const round = process.argv[3] || 'r1';
const port = process.argv[4] || '5377';
const seed = process.argv[5] || '3';

async function deployment(browser, w, h, men) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://localhost:${port}/demo?probe`, { waitUntil: 'networkidle' });
  await page.selectOption('.showcase-bar label:has-text("Size") select', String(men));
  await page.waitForFunction((n) => {
    const b = window.battleProbe && window.battleProbe.at && window.battleProbe.at.battle;
    return b && b.setup.armies[0].counts.reduce((x, y) => x + y, 0) > n * 0.5;
  }, men, { timeout: 120000 });
  await page.click('button[title="Pause"]');
  await page.waitForTimeout(800);
  const file = `${out}/${round}-deploy-${men}-${w}x${h}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}

async function wheel(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${port}/battle-perf.html?men=1200&seed=${seed}&pause=1&hud=0&zoom=1&scan=0`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__battle && window.__scene, null, { timeout: 60000 });
  // Step until a block of horse at speed, in the clear, has turned through 40 degrees or more in the last 2 s
  // (TURN_TICKS and TURN_COS in the environment change that),
  // keeping every horse regiment's track.
  const found = await page.evaluate(({ TURN_TICKS, TURN_COS }) => {
    const b = window.__battle;
    const horse = (r) => r.role === 'flank' || r.role === 'shock-cav';
    const track = {};
    while (!b.done() && b.tick < 2000) {
      window.__step(1);
      for (const r of b.regiments) {
        if (!horse(r) || r.alive < 6 || r.routed) continue;
        (track[r.id] ??= []).push([b.tick, r.ax, r.ay, r.fx, r.fy, r.aspd, r.mode]);
        const t = track[r.id];
        if (t.length < TURN_TICKS || r.engaged || r.aspd < 18) continue;
        const [, , , fx0, fy0] = t[t.length - TURN_TICKS];
        // In the clear: no other regiment's middle within 90, so the wheel is not a scrum.
        const clear = b.regiments.every((o) => o === r || o.alive === 0 || (o.cx - r.cx) ** 2 + (o.cy - r.cy) ** 2 > 90 * 90);
        if (clear && fx0 * r.fx + fy0 * r.fy < TURN_COS) {
          window.__track = { reg: r.id, before: t.slice(-60) };
          return { tick: b.tick, reg: r.id, role: r.role, mode: r.mode, team: r.team, aspd: r.aspd };
        }
      }
    }
    return null;
  }, { TURN_TICKS: Number(process.env.TURN_TICKS || 20), TURN_COS: Number(process.env.TURN_COS || 0.75) });
  if (!found) {
    console.log('no wheel found');
    await page.close();
    return;
  }
  console.log('wheel', JSON.stringify(found));
  // Back up: show the wheel from its start? The sim can't rewind, so the frames run on from here.
  const canvas = await page.$('canvas');
  for (let k = 0; k < 3; k++) {
    await page.evaluate(({ k, reg }) => {
      const b = window.__battle;
      if (k > 0) {
        for (let i = 0; i < 10; i++) {
          window.__step(1);
          const r = b.regiments[reg];
          window.__track.before.push([b.tick, r.ax, r.ay, r.fx, r.fy, r.aspd, r.mode]);
        }
      }
      const r = b.regiments[reg];
      const s = window.__scene;
      s.camera.zoom = 2;
      s.camera.cx = r.cx;
      s.camera.cy = r.cy;
    }, { k, reg: found.reg });
    await page.waitForTimeout(500);
    const file = `${out}/${round}-wheel-${k}.png`;
    await canvas.screenshot({ path: file });
    console.log(file);
  }
  // Top-down schematic: the anchor's track (dots every tick, darker = faster), the facing every
  // half second (arrows), and the riders now; grid 20 units.
  await page.evaluate(({ reg }) => {
    const b = window.__battle;
    const r = b.regiments[reg];
    const pts = window.__track.before;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[1]); x1 = Math.max(x1, p[1]); y0 = Math.min(y0, p[2]); y1 = Math.max(y1, p[2]); }
    for (const id of r.members) { const s = b.soldiers[id]; if (s.state > 1) continue; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    const W = 900, H = 700, pad = 40;
    const S = Math.min((W - 2 * pad) / Math.max(40, x1 - x0), (H - 2 * pad - 30) / Math.max(40, y1 - y0));
    const X = (x) => pad + (x - x0) * S, Y = (y) => pad + (y - y0) * S;
    const c = document.createElement('canvas');
    c.id = 'schematic';
    c.width = W; c.height = H;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#f4f1e8';
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.strokeStyle = '#ddd';
    for (let x = Math.floor(x0 / 20) * 20; x <= x1 + 20; x += 20) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let y = Math.floor(y0 / 20) * 20; y <= y1 + 20; y += 20) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
    for (const s of b.soldiers) {
      if (s.state > 1) continue;
      const x = X(s.x), y = Y(s.y);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      g.fillStyle = s.reg === reg ? '#2563ebcc' : s.team === r.team ? '#93c5fd88' : '#ef444488';
      g.beginPath(); g.arc(x, y, s.s.radius * S, 0, Math.PI * 2); g.fill();
    }
    pts.forEach((p, i) => {
      const v = Math.min(1, p[5] / 55);
      g.fillStyle = `rgba(20,20,20,${0.25 + 0.75 * v})`;
      g.fillRect(X(p[1]) - 2, Y(p[2]) - 2, 4, 4);
      if (i % 5 === 0) {
        const ax = X(p[1]), ay = Y(p[2]);
        g.strokeStyle = '#b45309'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + p[3] * 22, ay + p[4] * 22); g.stroke();
        g.lineWidth = 1;
      }
    });
    g.fillStyle = '#000';
    g.font = '14px sans-serif';
    const first = pts[0], last = pts[pts.length - 1];
    g.fillText(`regiment ${reg} (${r.role}), ticks ${first[0]}-${last[0]}: anchor every tick (darker = faster, ${first[5].toFixed(0)}->${last[5].toFixed(0)} u/s), facing every 0.5 s (orange), grid 20 units`, 10, H - 12);
  }, { reg: found.reg });
  await (await page.$('#schematic')).screenshot({ path: `${out}/${round}-wheel-schematic.png` });
  console.log(`${out}/${round}-wheel-schematic.png`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const only = process.env.ONLY || '';
  if (!only || only === 'deploy') {
    for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1440]]) await deployment(browser, w, h, 1200);
    await deployment(browser, 2560, 1440, 4000);
  }
  if (!only || only === 'wheel') await wheel(browser);
  await browser.close();
})();
