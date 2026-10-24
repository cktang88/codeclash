import fs from 'node:fs';
// Legibility measurement for the battlefield (docs/art-direction.md §5, "Targets, measured").
// usage: PW_CORE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chromium \
//          node scripts/legibility/measure.mjs outdir port [tods] [zooms] [extraQuery]
//        python3 scripts/legibility/metrics.py outdir [baseline-outdir]
// Needs a dev server (pnpm dev:client) on `port`; pass "&hdr" as extraQuery to measure with the
// filmic pass on even under a software renderer.
const { chromium } = await import(process.env.PW_CORE ?? 'playwright-core');
// For each time of day x zoom x terrain spot: places a showcase squad of soldiers (one per kind,
// several armies) on the spot, screenshots it with soldiers shown (A) and hidden (B), and writes
// meta.json with every soldier's screen position. metrics.py turns the pairs into contrast numbers.
const [out, port, todArg = '0.02,0.35,0.76,0.92', zoomArg = '0.42,0.9,1.8', extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const tods = todArg.split(',').map(Number);
const zooms = zoomArg.split(',').map(Number);
const W = 960, H = 640;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await p.goto(`http://localhost:${port}/render-lab.html?seed=7&skip=4000&bots=6${extra}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.battlefield && window.store?.world, null, { timeout: 300000, polling: 1000 });
// Wait for every kind's art.
await p.waitForFunction(() => { const u = window.battlefield.units; for (let k = 0; k < 20; k++) if (!u.artReady(k)) return false; return true; }, null, { timeout: 600000, polling: 2000 });
console.log('loaded', ((Date.now() - t0) / 1000).toFixed(0) + 's');
const setup = await p.evaluate(async () => {
  const s = window.store, f = window.battlefield, r = window.runner;
  r.speed = 0;
  s.setFollowing(false);
  const w = s.world, m = w.map;
  const T = { Plain: 0, Forest: 1, Water: 2, Rock: 3 };
  const at = (c, rr) => (c < 0 || rr < 0 || c >= m.navCols || rr >= m.navRows ? 255 : m.terrain[rr * m.navCols + c]);
  const deep = (t, k, clear = 150) => {
    let best = null, bd = 1e9;
    for (let rr = 0; rr < m.navRows; rr++) for (let c = 0; c < m.navCols; c++) {
      if (at(c, rr) !== t) continue;
      let ok = true;
      for (let dy = -k; dy <= k && ok; dy++) for (let dx = -k; dx <= k; dx++) if (at(c + dx, rr + dy) !== t) { ok = false; break; }
      if (!ok) continue;
      const x = m.originX + (c + 0.5) * m.navCell, y = m.originY + (rr + 0.5) * m.navCell;
      // Keep away from sites, near the middle ring.
      let near = 1e9; for (const o of m.sites) near = Math.min(near, Math.hypot(o.x - x, o.y - y) - o.radius);
      if (near < clear) continue;
      const d = Math.abs(Math.hypot(x, y) - m.radius * 0.5);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  };
  const { noise } = await import('/render/paint.ts');
  // A point on the ring road, recomputed exactly as paintRoads lays it, clear of every site.
  const seed = w.params.seed;
  const cellAtXY = (x, y) => at(Math.floor((x - m.originX) / m.navCell), Math.floor((y - m.originY) / m.navCell));
  let rd = null;
  for (let k = 0; k < 720 && !rd; k++) {
    const a = (k / 720) * Math.PI * 2;
    const r = m.ring + (noise(Math.cos(a) * 6 + 40, Math.sin(a) * 6, seed + 77) - 0.5) * 9;
    const q = { x: Math.cos(a) * r, y: Math.sin(a) * r, dx: -Math.sin(a), dy: Math.cos(a) };
    let ok = true;
    // The ring road is kept clear between sites only 350 apart: a shorter clear stretch will do.
    for (let t = -40; t <= 40 && ok; t += 6) if (cellAtXY(q.x + q.dx * t, q.y + q.dy * t) !== T.Plain) ok = false;
    let near = 1e9; for (const o of m.sites) near = Math.min(near, Math.hypot(o.x - q.x, o.y - q.y) - o.radius);
    if (ok && near > 80) rd = q;
  }
  const spots = { grass: deep(T.Plain, 3) ?? deep(T.Plain, 2, 100), forest: deep(T.Forest, 2) ?? deep(T.Forest, 2, 100) ?? deep(T.Forest, 1, 80), water: deep(T.Water, 2), rock: deep(T.Rock, 1) ?? deep(T.Rock, 1, 80) ?? deep(T.Rock, 0, 60), road: rd };
  // The squad: one soldier of each kind, from as many armies as possible.
  const squad = [];
  const usedP = new Map();
  for (let k = 0; k < 20; k++) {
    const cands = w.units.filter((u) => u.kind === k && u.hp > 0);
    if (!cands.length) continue;
    cands.sort((a, b2) => (usedP.get(a.p) ?? 0) - (usedP.get(b2.p) ?? 0));
    const u = cands[0]; usedP.set(u.p, (usedP.get(u.p) ?? 0) + 1); squad.push(u.id);
  }
  window.__squad = squad; window.__spots = spots;
  return { spots, squad: squad.map((id) => { const u = w.units.find((x) => x.id === id); return [id, u.kind, u.p]; }) };
});
console.log(JSON.stringify(setup));
const meta = { W, H, setup, shots: [] };
for (const tod of tods) {
  for (const zoom of zooms) {
    for (const [name, spot] of Object.entries(setup.spots)) {
      if (!spot) continue;
      const tag = `t${tod}-z${zoom}-${name}`;
      const pos = await p.evaluate(({ tod, zoom, spot, name }) => {
        const s = window.store, f = window.battlefield, w = s.world;
        f.setTimeOverride(tod);
        const ids = window.__squad;
        const n = ids.length;
        const cols = 5;
        // Far zoom draws platoons (blocks, or the dots of older builds), not soldiers: each squad
        // soldier's whole platoon moves with it, its shape kept, so what is measured is how the
        // platoon reads. Nearer, one soldier of each kind stands at its place.
        const far = zoom < 0.55;
        const sp = far ? 70 : 34; // world units between soldiers (far: between platoons)
        const placed = [];
        ids.forEach((id, i) => {
          const u = w.units.find((x) => x.id === id);
          if (!u) return;
          const c = i % cols, r = Math.floor(i / cols);
          let x = spot.x + (c - (cols - 1) / 2) * sp * (STATS_BIG(u.kind) ? 1 : 1);
          let y = spot.y + (r - (Math.ceil(n / cols) - 1) / 2) * sp * (far ? 1 : 1.4);
          if (name === 'road') { // string them along the road
            const t = (i - (n - 1) / 2) * sp * 0.6;
            x = spot.x + spot.dx * t * 1.4; y = spot.y + spot.dy * t * 1.4;
          }
          if (far) {
            const mates = w.units.filter((m) => m.platoon === u.platoon);
            const dx = x - u.x, dy = y - u.y;
            for (const m of mates) { m.x += dx; m.y += dy; m.target = 0; }
            const pl = w.platoons.find((q) => q.id === u.platoon);
            if (pl) { pl.x += dx; pl.y += dy; }
          }
          u.x = x; u.y = y; u.target = 0;
          placed.push(id);
        });
        function STATS_BIG() { return false; }
        const cam = f.camera;
        cam.glide = null; cam.shotMove = null; cam.x = spot.x; cam.y = spot.y; cam.zoom = zoom; cam.zoomTarget = zoom;
        s.setFollowing(false);
        f.debugHideActors = false;
        f.units.shadows.visible = f.units.bodies.visible = f.units.dots.visible = f.units.air.visible = true;
        if (f.units.rims) f.units.rims.visible = true;
        f.banners.root.visible = zoom < 0.55; // far: the platoon token is the soldier
        return placed;
      }, { tod, zoom, spot, name });
      await p.waitForTimeout(2500);
      const scr = await p.evaluate(() => {
        const f = window.battlefield, w = window.store.world, cam = f.camera;
        return window.__squad.map((id) => { const pose = f.units.pose(id); const u = w.units.find((x) => x.id === id); const x = pose?.x ?? u.x, y = pose?.y ?? u.y; return { id, kind: u.kind, p: u.p, sx: (x - cam.x) * cam.zoom + cam.width / 2, sy: (y - cam.y) * cam.zoom + cam.height / 2 }; });
      });
      await p.screenshot({ path: `${out}/${tag}-A.png`, timeout: 180000 });
      await p.evaluate(() => {
        const f = window.battlefield;
        f.debugHideActors = true;
        f.units.shadows.visible = f.units.bodies.visible = f.units.dots.visible = f.units.air.visible = false;
        if (f.units.rims) f.units.rims.visible = false;
        f.banners.root.visible = false;
      });
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `${out}/${tag}-B.png`, timeout: 180000 });
      meta.shots.push({ tag, tod, zoom, terrain: name, units: scr });
      fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta));
      console.log(tag, ((Date.now() - t0) / 1000).toFixed(0) + 's', errors.slice(0, 2).join(' | '));
    }
  }
}
await b.close();
