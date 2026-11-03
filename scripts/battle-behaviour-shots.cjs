// Screenshots of battle behaviour on /demo (probe mode): steps the battle to each moment (an
// infantry charge, a rout, a chase, a melee line, a cavalry charge, a volley), frames it, and
// shoots the canvas, two more frames 0.6 s apart, and a schematic of the sim's collision circles.
//   npx vite --port 5377 &   then   node scripts/battle-behaviour-shots.cjs <out dir> <round> [port] [only]
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const out = process.argv[2];
const round = process.argv[3] || 'r1';
const port = process.argv[4] || '5377';
const only = process.argv[5] || '';

const moments = {
  // A foot regiment of the line two-thirds into its run-in.
  'infantry-charge': `(b) => b.regiments.find((r) => r.role === 'line' && r.mode === 'charge' && b.tick - r.chargeAt === 6 && r.alive > 15)`,
  // A broken block 2.5 s after it broke.
  'rout-scatter': `(b) => b.regiments.find((r) => r.routed && r.role === 'line' && b.tick - r.routAt === 25 && r.alive > 15)`,
  // A regiment chasing fugitives on its own.
  'pursuit': `(b) => b.regiments.find((r) => r.chaseAt >= 0 && r.mode === 'pursue' && b.tick - r.chaseAt === 20 && r.alive > 10 && r.role === 'line')`,
  // Two lines locked in melee.
  'melee-line': `(b) => b.tick > 330 && b.regiments.find((r) => r.role === 'line' && r.engaged && r.meleeTicks > 40 && r.alive > 20)`,
  // Knights or horse just into foot.
  'cavalry-charge': `(b) => b.regiments.find((r) => r.role === 'shock-cav' && r.mode === 'charge' && b.soldiers.some((s) => s.reg === r.id && s.impetus > 0.5 && b.soldiers.some((o) => o.team !== s.team && o.state === 0 && Math.abs(o.x - s.x) < 12 && Math.abs(o.y - s.y) < 12)))`,
  // Arrows in flight over the field.
  'missiles': `(b) => b.projectiles.length > 40 && b.tick > 150 && b.regiments.find((r) => r.role === 'missile' && r.mode === 'shoot')`,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [name, find] of Object.entries(moments)) {
    if (only && name !== only) continue;
    let done = false;
    for (let attempt = 0; attempt < 6 && !done; attempt++) {
      await page.goto(`http://localhost:${port}/demo?probe`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.battleProbe && window.battleProbe.at, null, { timeout: 30000 });
      await page.click('button[title="Pause"]');
      if (process.env.HD) await page.click('button:has-text("HD")');
      await page.addStyleTag({ content: '.hud-top,.ticker,.hud-controls{display:none!important}' });
      const res = await page.evaluate(({ find, zoom }) => {
        const { battle: b, scene } = window.battleProbe.at;
        const f = eval(find);
        let r = null;
        while (!b.done() && b.tick < 2400) {
          scene.snapshot();
          b.step();
          scene.afterStep();
          r = f(b);
          if (r) break;
        }
        if (!r) return null;
        if (r === true) r = b.regiments[0];
        // Frame it: the regiment's centre (or, for melee, it and its foe).
        let cx = r.cx, cy = r.cy;
        if (r.targetReg >= 0 && r.engaged) {
          const o = b.regiments[r.targetReg];
          cx = (r.cx + o.cx) / 2;
          cy = (r.cy + o.cy) / 2;
        }
        scene.camera.zoom = zoom;
        scene.camera.cx = cx;
        scene.camera.cy = cy;
        return { tick: b.tick, reg: r.id, cls: r.cls, mode: r.mode, team: r.team, seed: b.setup.seed };
      }, { find, zoom: name === 'missiles' ? 3 : 4 });
      if (!res) continue;
      await page.waitForTimeout(600);
      const canvas = await page.$('canvas');
      const file = `${out}/${round}-${name}.png`;
      await canvas.screenshot({ path: file });
      console.log(name, JSON.stringify(res), file);
      // The same moment as the sim sees it: every man's collision circle (team colours; hollow
      // = running), his velocity, missiles in flight; 1 world unit = 5 px about the centre.
      await page.evaluate(({ reg }) => {
        const { battle: b } = window.battleProbe.at;
        const r = b.regiments[reg];
        let cx = r.cx, cy = r.cy;
        if (r.targetReg >= 0 && r.engaged) { const o = b.regiments[r.targetReg]; cx = (r.cx + o.cx) / 2; cy = (r.cy + o.cy) / 2; }
        const c = document.createElement('canvas');
        c.id = 'schematic';
        c.width = 900; c.height = 700;
        c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#f4f1e8';
        document.body.appendChild(c);
        const g = c.getContext('2d');
        const S = 5;
        const X = (x) => 450 + (x - cx) * S, Y = (y) => 350 + (y - cy) * S;
        g.strokeStyle = '#ccc';
        for (let x = -100; x <= 100; x += 10) { g.beginPath(); g.moveTo(X(cx + x), 0); g.lineTo(X(cx + x), 700); g.stroke(); }
        for (const s of b.soldiers) {
          if (s.state > 1) continue;
          const x = X(s.x), y = Y(s.y);
          if (x < -20 || x > 920 || y < -20 || y > 720) continue;
          const col = s.team === 0 ? (b.regiments[s.reg].mode === 'charge' ? '#1d4ed8' : '#3b82f6') : (b.regiments[s.reg].mode === 'charge' ? '#b91c1c' : '#ef4444');
          g.beginPath(); g.arc(x, y, s.s.radius * S, 0, Math.PI * 2);
          if (s.state === 1) { g.strokeStyle = col; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = col + (s.reg === reg ? 'ff' : '99'); g.fill(); }
          g.strokeStyle = '#111'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + s.vx * S * 0.3, y + s.vy * S * 0.3); g.stroke();
        }
        g.fillStyle = '#000';
        for (const p of b.projectiles) {
          const t = Math.min(1, Math.max(0, (b.tick - p.born) / Math.max(1, p.lands - p.born)));
          g.fillRect(X(p.x0 + (p.x1 - p.x0) * t) - 1, Y(p.y0 + (p.y1 - p.y0) * t) - 1, 3, 3);
        }
        g.font = '14px sans-serif';
        g.fillText('tick ' + b.tick + '  regiment ' + reg + ' (' + r.role + ', ' + r.mode + ')  grid = 10 units  dark = charging, hollow = running', 10, 690);
      }, { reg: res.reg });
      await (await page.$('#schematic')).screenshot({ path: `${out}/${round}-${name}-schematic.png` });
      for (const k of [1, 2]) {
        await page.evaluate(() => { document.getElementById('schematic')?.remove(); const { battle: b, scene } = window.battleProbe.at; for (let i = 0; i < 6; i++) { scene.snapshot(); b.step(); scene.afterStep(); } });
        await page.waitForTimeout(400);
        await canvas.screenshot({ path: `${out}/${round}-${name}-${k}.png` });
      }
      done = true;
    }
    if (!done) console.log(name, 'not found');
  }
  await browser.close();
})();
