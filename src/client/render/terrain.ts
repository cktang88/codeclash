import { Terrain, type MapDef } from '../../sim/api.ts';
import { centreName, isLake } from './centre.ts';
import { canvas2d, fbm, noise, seeded, smoothstep } from './paint.ts';

// The battlefield is a painted chart: a disc of land washed in pigment on a sheet
// of vellum, ringed by an inked sea, framed by a deckled edge on a walnut table.
// Everything here is painted once per war into one large canvas.

export interface TerrainArt {
  canvas: HTMLCanvasElement;
  thumb: HTMLCanvasElement;
  /** Alpha: where water is. Red: how deep (1 = open sea). Same extent as `canvas`. */
  water: HTMLCanvasElement;
  extent: number;
  pxPerUnit: number;
  /** Width of the inked sea ring beyond the coast, for marginalia that sail in it. */
  sea: number;
}

export interface ChartText {
  title: string;
  subtitle: string;
}

export const DISPLAY_FONT = '"IM Fell English SC", "IM Fell English", Georgia, serif';
export const SCRIPT_FONT = '"IM Fell English", Georgia, serif';

/** Margin of sheet beyond the coast, scaled with the map so marginalia always have room. */
export function seaMargin(radius: number): number {
  return Math.max(340, radius * 0.42);
}

function mask(map: MapDef, kind: number): Float32Array {
  const { navCols: w, navRows: h, terrain } = map;
  let a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = terrain[i] === kind ? 1 : 0;
  let b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += a[yy * w + xx]!;
            n++;
          }
        }
        b[y * w + x] = s / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

function sampler(map: MapDef, field: Float32Array): (x: number, y: number) => number {
  const { navCols: w, navRows: h, navCell, originX, originY } = map;
  return (x, y) => {
    const fx = (x - originX) / navCell - 0.5;
    const fy = (y - originY) / navCell - 0.5;
    if (fx < -1 || fy < -1 || fx > w || fy > h) return 0;
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const i = y0 * w + x0;
    const a = field[i]!;
    const b = field[i + 1]!;
    const c = field[i + w]!;
    const d = field[i + w + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

// Pigments laid on vellum. Land is sap green and terre verte, dry ground yellow
// ochre, water ultramarine, all a little muted as if absorbed by the skin.
const VELLUM: Rgb = [239, 228, 200];
const VELLUM_SHADE: Rgb = [217, 199, 158];
const VELLUM_DEEP: Rgb = [185, 164, 119];
const FOXING: Rgb = [196, 160, 104];
const TABLE: Rgb = [36, 25, 18];
const TABLE_GRAIN: Rgb = [58, 40, 27];
const MEADOW: Rgb = [156, 172, 90];
const GRASS: Rgb = [116, 146, 72];
const GRASS_DEEP: Rgb = [90, 116, 56];
const OCHRE: Rgb = [196, 172, 108];
const FOREST_FLOOR: Rgb = [80, 104, 52];
const ROCK: Rgb = [164, 152, 128];
const ROCK_SHADE: Rgb = [118, 106, 88];
const MUD: Rgb = [150, 132, 92];
const SHALLOW: Rgb = [122, 156, 160];
const DEEP: Rgb = [46, 80, 138];
const SEA: Rgb = [80, 118, 164];
/** The great lake's deep water, darker than any pool: the ring's centre reads as one grand feature. */
const ABYSS: Rgb = [30, 54, 112];
const MASSIF_HI: Rgb = [178, 166, 140];
const MASSIF_LO: Rgb = [104, 94, 80];
const INK = 'rgba(34,24,15,';

/**
 * The pure-number part of the chart: the pigment field, the water mask, the lake-shore grid and the
 * vellum grain tile. Most of the painting time, and no canvas needed, so it runs in a worker
 * (terrain.worker.ts) while the page starts; paintTerrain lays the ink over it.
 */
export interface TerrainPixels {
  /** The size of the canvas these were computed for (it depends on maxPx and the map). */
  size: number;
  fw: number;
  field: Uint8ClampedArray;
  wm: number;
  water: Uint8ClampedArray;
  lakes: Grid;
  grainTile: number;
  grain: Uint8ClampedArray;
}

function layout(map: MapDef, maxPx: number) {
  const R = map.radius;
  const margin = seaMargin(R);
  const extent = R + margin;
  const world = extent * 2;
  const pxPerUnit = Math.min(1.6, maxPx / world);
  const size = Math.ceil(world * pxPerUnit);
  const seaW = Math.min(margin * 0.55, 90 + R * 0.12);
  const sheet = extent * 0.975;
  return { R, margin, extent, world, pxPerUnit, size, seaW, sheet };
}

export function terrainPixels(map: MapDef, seed: number, maxPx: number): TerrainPixels {
  const { R, extent, world, size, seaW, sheet } = layout(map, maxPx);
  // The ring's centre: a great lake or a mountain massif, inside its ragged shore.
  const C = map.centre ?? 0;
  const lake = C > 0 && isLake(map.centreKind);
  const massif = C > 0 && !lake;
  const forest = sampler(map, mask(map, Terrain.Forest));
  const water = sampler(map, mask(map, Terrain.Water));
  const rock = sampler(map, mask(map, Terrain.Rock));

  // ------------------------------------------------------------ pigment field
  const fw = Math.min(1400, Math.ceil(size * 0.5));
  const data = new Uint8ClampedArray(fw * fw * 4);
  const wm = 512;
  const wdata = new Uint8ClampedArray(wm * wm * 4);
  const unitPerField = world / fw;
  for (let py = 0; py < fw; py++) {
    const y = -extent + (py + 0.5) * unitPerField;
    for (let px = 0; px < fw; px++) {
      const x = -extent + (px + 0.5) * unitPerField;
      const d = Math.sqrt(x * x + y * y);
      const grain = noise(x / 3.1, y / 3.1, seed + 101);
      const mottle = fbm(x / 240, y / 240, seed + 61, 4);
      let c: Rgb;
      // The sheet: a square of vellum with a torn, deckled edge.
      const edge = Math.max(Math.abs(x), Math.abs(y)) + (fbm(x / 26, y / 26, seed + 9, 3) - 0.5) * 34;
      if (edge > sheet) {
        const wood = noise(x / 160, y / 9, seed + 3) * 0.6 + noise(x / 40, y / 3, seed + 5) * 0.4;
        c = mix(TABLE, TABLE_GRAIN, wood);
        c = mul(c, 0.85 + 0.25 * smoothstep(sheet + 60, sheet, edge));
      } else if (d > R) {
        // Vellum, foxed and darkened toward its edges, with the inked sea laid around the coast.
        c = mix(VELLUM, VELLUM_SHADE, smoothstep(0.35, 0.75, mottle));
        c = mix(c, VELLUM_DEEP, smoothstep(sheet - 120, sheet, edge) * 0.65);
        const fox = smoothstep(0.72, 0.8, fbm(x / 70, y / 70, seed + 17, 3));
        c = mix(c, FOXING, fox * 0.35);
        // A wash of ultramarine laid along the coast, deepest inshore, with a crisp brushed outer edge.
        const off = d - R + (mottle - 0.5) * 30;
        const seaT = 1 - smoothstep(seaW * 0.9, seaW * 0.97, off);
        const swell = fbm(x / 90, y / 260, seed + 41, 3);
        const sea = mix(mix(DEEP, SEA, smoothstep(0, seaW, off)), VELLUM, smoothstep(seaW * 0.3, seaW, off) * 0.35);
        c = mix(c, mix(sea, DEEP, smoothstep(0.55, 0.8, swell) * 0.25), seaT * 0.85);
      } else {
        // Land.
        c = mix(GRASS, MEADOW, smoothstep(0.4, 0.72, mottle));
        c = mix(c, GRASS_DEEP, smoothstep(0.45, 0.2, mottle) * 0.75);
        c = mix(c, OCHRE, smoothstep(0.62, 0.82, fbm(x / 330 + 9, y / 330, seed + 3, 3)) * 0.6);
        const fm = forest(x, y) + (grain - 0.5) * 0.18;
        c = mix(c, FOREST_FLOOR, smoothstep(0.25, 0.62, fm) * 0.8);
        const rm = rock(x, y) + (mottle - 0.5) * 0.3 + (grain - 0.5) * 0.12;
        const rockT = smoothstep(0.4, 0.5, rm);
        if (rockT > 0) {
          let rc = mix(ROCK_SHADE, ROCK, smoothstep(0.3, 0.75, noise(x / 11, y / 11, seed + 5)));
          if (massif && d < C + 60) {
            // The massif's flanks: lit toward the upper left, falling into cool shade toward the
            // lower right, darkening as they climb toward the summit.
            const up = smoothstep(C + 40, C * 0.25, d);
            const facing = (x + y) / (d * 1.414 + 1e-6);
            rc = mix(mix(MASSIF_HI, MASSIF_LO, 0.35 + facing * 0.35 + up * 0.25), rc, 0.3);
          }
          c = mix(c, rc, rockT);
        }
        const w = water(x, y) + (mottle - 0.5) * 0.2 + (grain - 0.5) * 0.04;
        c = mix(c, MUD, smoothstep(0.3, 0.42, w) * 0.7);
        const wt = smoothstep(0.43, 0.47, w);
        if (wt > 0) {
          let wc = mix(SHALLOW, DEEP, smoothstep(0.5, 0.95, w));
          if (lake && d < C + 60) {
            // The great lake shelves fast from its shore into deep ultramarine, with slow swell bands.
            const deep = smoothstep(C + 10, C - 260, d);
            const swell = fbm(x / 140, y / 300, seed + 47, 3);
            wc = mix(wc, mix(DEEP, ABYSS, smoothstep(0.2, 1, deep)), deep);
            wc = mix(wc, SEA, smoothstep(0.58, 0.82, swell) * 0.22 * deep);
          }
          c = mix(c, wc, wt);
        }
        // Hill shading: the coast's south-east rim falls away, so it darkens.
        const rim = smoothstep(R - 70, R - 4, d) * Math.max(0, (x + y) / (d * 1.414 + 1e-6));
        c = mix(c, [70, 60, 40], rim * 0.45);
      }
      // Pigment granulation and the skin's own grain show through every wash.
      c = mul(c, 0.94 + grain * 0.1);
      const o = (py * fw + px) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }

  // Water mask for the glint shader: lakes and the sea ring.
  const unitPerMask = world / wm;
  for (let py = 0; py < wm; py++) {
    const y = -extent + (py + 0.5) * unitPerMask;
    for (let px = 0; px < wm; px++) {
      const x = -extent + (px + 0.5) * unitPerMask;
      const d = Math.sqrt(x * x + y * y);
      let a = 0;
      let depth = 0;
      if (d > R) {
        a = 1 - smoothstep(seaW * 0.25, seaW * 0.95, d - R);
        depth = smoothstep(0, 40, d - R);
      } else {
        const w = water(x, y);
        a = smoothstep(0.45, 0.52, w);
        depth = smoothstep(0.5, 0.9, w) * 0.7;
        // The great lake runs deep: its glints roll slow and broad like the open sea's.
        if (lake) depth = Math.max(depth, smoothstep(C, C - 220, d) * a);
      }
      const o = (py * wm + px) * 4;
      wdata[o] = Math.round(depth * 255);
      wdata[o + 1] = 0;
      wdata[o + 2] = 0;
      wdata[o + 3] = Math.round(a * 255);
    }
  }
  // Lake shores are inked as vector contours, so they stay crisp however close the camera comes.
  const lakes = sampleGrid(R, 4, (x, y) => water(x, y) + (fbm(x / 240, y / 240, seed + 61, 4) - 0.5) * 0.2);
  const grainTile = 256;
  return { size, fw, field: data, wm, water: wdata, lakes, grainTile, grain: grainPixels(grainTile, seed) };
}

export function paintTerrain(map: MapDef, seed: number, maxPx: number, text: ChartText, pixels?: TerrainPixels): TerrainArt {
  const { R, extent, pxPerUnit, size, seaW, sheet } = layout(map, maxPx);
  // Computed elsewhere (a worker) for this very canvas, or here and now.
  const px = pixels && pixels.size === size ? pixels : terrainPixels(map, seed, maxPx);
  const [canvas, ctx] = canvas2d(size, size);
  const { fw, wm } = px;
  const [field, fctx] = canvas2d(fw, fw);
  const img = fctx.createImageData(fw, fw);
  img.data.set(px.field);
  fctx.putImageData(img, 0, 0);
  const [waterCanvas, wctx] = canvas2d(wm, wm);
  const wimg = wctx.createImageData(wm, wm);
  wimg.data.set(px.water);
  wctx.putImageData(wimg, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(field, 0, 0, size, size);

  ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, extent * pxPerUnit, extent * pxPerUnit);
  const rand = seeded(seed ^ 0x5bd1e995);
  const terrainAt = (x: number, y: number) => {
    const col = Math.floor((x - map.originX) / map.navCell);
    const row = Math.floor((y - map.originY) / map.navCell);
    if (col < 0 || row < 0 || col >= map.navCols || row >= map.navRows) return Terrain.Void;
    return map.terrain[row * map.navCols + col]!;
  };

  paintCoast(ctx, R, seaW, seed);
  const lakes = px.lakes;
  paintContour(ctx, lakes, 0.45, 1.5, 0.8);
  paintContour(ctx, lakes, 0.56, 0.8, 0.32);
  paintContour(ctx, lakes, 0.68, 0.7, 0.2);

  // Trodden clearings around every site.
  for (const o of map.sites) {
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius * 1.55);
    g.addColorStop(0, 'rgba(176,150,98,0.55)');
    g.addColorStop(0.65, 'rgba(170,146,96,0.28)');
    g.addColorStop(1, 'rgba(170,146,96,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.radius * 1.55, 0, Math.PI * 2);
    ctx.fill();
  }

  if (map.centre > 0 && isLake(map.centreKind)) paintLake(ctx, map, seed);
  paintRoads(ctx, map, seed, terrainAt);
  paintGrass(ctx, R, rand, terrainAt);
  paintRocks(ctx, map, rand);
  paintForests(ctx, map, rand, pxPerUnit, size, extent);
  if (map.centre > 0 && !isLake(map.centreKind)) paintMassif(ctx, map, seed, terrainAt);
  if (map.centre > 0) paintCentreName(ctx, map, seed);

  // A double ink rule framing the sheet, with fleurons at its corners.
  paintFrame(ctx, sheet - 34, seed);
  paintCompass(ctx, sheet - 34, R, seaW);
  paintCartouche(ctx, sheet - 34, R, seaW, text);

  // Paper grain and a candle-lit vignette over the whole sheet.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintGrain(ctx, size, px.grainTile, px.grain);
  const v = ctx.createRadialGradient(size / 2, size / 2, R * pxPerUnit * 0.7, size / 2, size / 2, size * 0.74);
  v.addColorStop(0, 'rgba(40,24,10,0)');
  v.addColorStop(0.7, 'rgba(40,24,10,0.12)');
  v.addColorStop(1, 'rgba(20,12,6,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);

  const [thumb, tctx] = canvas2d(256, 256);
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(canvas, 0, 0, 256, 256);

  return { canvas, thumb, water: waterCanvas, extent, pxPerUnit, sea: seaW };
}

interface Grid {
  x0: number;
  step: number;
  n: number;
  v: Float32Array;
}

function sampleGrid(R: number, step: number, f: (x: number, y: number) => number): Grid {
  const n = Math.ceil((R * 2) / step) + 1;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const y = -R + j * step;
    for (let i = 0; i < n; i++) {
      const x = -R + i * step;
      // Only lakes inside the disc matter; skip the dry corners cheaply.
      v[j * n + i] = x * x + y * y < R * R ? f(x, y) : 0;
    }
  }
  return { x0: -R, step, n, v };
}

/** Marching squares over a sampled field, stroking the iso-line at `level` in ink. */
function paintContour(ctx: CanvasRenderingContext2D, g: Grid, level: number, width: number, alpha: number): void {
  const { x0, step, n, v } = g;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `${INK}${alpha})`;
  ctx.beginPath();
  let segments = 0;
  const cross = (a: number, b: number) => (a - level) / (a - b);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = v[j * n + i]!;
      const b = v[j * n + i + 1]!;
      const c = v[(j + 1) * n + i + 1]!;
      const d = v[(j + 1) * n + i]!;
      const ia = a > level;
      const ib = b > level;
      const ic = c > level;
      const id = d > level;
      if (ia === ib && ib === ic && ic === id) continue;
      const x = x0 + i * step;
      const y = x0 + j * step;
      let px = 0;
      let py = 0;
      let have = false;
      const point = (qx: number, qy: number) => {
        if (have) {
          ctx.moveTo(px, py);
          ctx.lineTo(qx, qy);
          segments++;
          have = false;
        } else {
          px = qx;
          py = qy;
          have = true;
        }
      };
      if (ia !== ib) point(x + cross(a, b) * step, y);
      if (ib !== ic) point(x + step, y + cross(b, c) * step);
      if (id !== ic) point(x + cross(d, c) * step, y + step);
      if (ia !== id) point(x, y + cross(a, d) * step);
      if (segments > 4000) {
        ctx.stroke();
        ctx.beginPath();
        segments = 0;
      }
    }
  }
  ctx.stroke();
}

/** The coast: a heavy ink line with the engraver's diminishing contour ripples offshore. */
function paintCoast(ctx: CanvasRenderingContext2D, R: number, seaW: number, seed: number): void {
  const wobble = (a: number, k: number) => (noise(Math.cos(a) * 9 + k, Math.sin(a) * 9, seed + 23) - 0.5) * 6;
  const ring = (r: number, width: number, alpha: number, k: number, dash = 0) => {
    ctx.beginPath();
    const steps = 720;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r + wobble(a, k);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = `${INK}${alpha})`;
    ctx.setLineDash(dash > 0 ? [dash, dash * 0.8] : []);
    ctx.stroke();
  };
  ring(R, 3.2, 0.85, 0);
  ring(R - 3, 1, 0.35, 1);
  // The sea's outer edge, inked like the coast but lighter.
  ring(R + seaW * 0.94, 1.6, 0.6, 9);
  // Engraver's sea: long wavy horizontal strokes across the ring.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R + seaW * 0.92, 0, Math.PI * 2);
  ctx.arc(0, 0, R + 4, 0, Math.PI * 2, true);
  ctx.clip();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = `${INK}0.22)`;
  const outer = R + seaW;
  for (let y = -outer; y < outer; y += 7) {
    ctx.beginPath();
    for (let x = -outer; x <= outer; x += 12) {
      const yy = y + Math.sin(x * 0.045 + y * 0.3) * 1.6;
      if (x === -outer) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  const lines = 5;
  for (let i = 1; i <= lines; i++) {
    const t = i / (lines + 1);
    ring(R + seaW * 0.18 * i * (1 + t * 0.4), 1.4 - t, 0.5 * (1 - t), i * 3, i > 2 ? 10 + i * 4 : 0);
  }
  ctx.setLineDash([]);
  // Wave hatching scattered across the open sea: little inked crests.
  const rand = seeded(seed + 991);
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r = R + seaW * (0.25 + rand() * 0.85);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const w = 6 + rand() * 7;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w / 2, y - w * 0.45, x, y);
    ctx.quadraticCurveTo(x + w / 2, y - w * 0.45, x + w, y);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `${INK}${0.18 + rand() * 0.22})`;
    ctx.stroke();
  }
}

/**
 * The front road: the ring itself, kept clear by the map, running round the centre through every
 * capital and border fort. It wanders a little, as a hand-ruled road does, but never off its band.
 */
function paintRoads(ctx: CanvasRenderingContext2D, map: MapDef, seed: number, terrainAt: (x: number, y: number) => number): void {
  const r0 = map.ring;
  if (!(r0 > 0)) return;
  const steps = Math.max(240, Math.ceil((Math.PI * 2 * r0) / 10));
  const paths: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // Wander that closes on itself: sampled on a circle in noise space.
    const wander = (noise(Math.cos(a) * 6 + 40, Math.sin(a) * 6, seed + 77) - 0.5) * 9;
    const r = r0 + wander;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const t = terrainAt(x, y);
    if (t !== Terrain.Plain && t !== Terrain.Forest) {
      if (run.length > 1) paths.push(run);
      run = [];
      continue;
    }
    run.push([x, y]);
  }
  if (run.length > 1) paths.push(run);
  // Each capital's gate road: a short spur out of the gatehouse (which faces south) onto the ring.
  for (const s of map.sites) {
    if (s.kind !== 'capital') continue;
    paths.push([
      [s.x, s.y + s.radius * 0.05],
      [s.x + (noise(s.x * 0.01, s.y * 0.01, seed + 5) - 0.5) * 6, s.y + s.radius * 0.45],
    ]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (width: number, style: string, dash: number[] = []) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.setLineDash(dash);
    for (const run of paths) {
      ctx.beginPath();
      run.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  };
  // Ink-edged tracks: a dark border, worn ochre bed, and wheel ruts.
  stroke(12, `${INK}0.3)`);
  stroke(9, 'rgba(188,158,100,0.9)');
  stroke(1, 'rgba(120,92,56,0.25)', [3, 5]);
  ctx.setLineDash([]);
  // Milestones every so often along the outer verge, tiny and quiet.
  const rand = seeded(seed + 61);
  const stones = Math.floor((Math.PI * 2 * r0) / 180);
  for (let i = 0; i < stones; i++) {
    const a = ((i + 0.5 + (rand() - 0.5) * 0.3) / stones) * Math.PI * 2;
    const x = Math.cos(a) * (r0 + 11);
    const y = Math.sin(a) * (r0 + 11);
    if (terrainAt(x, y) !== Terrain.Plain || map.sites.some((o) => Math.hypot(o.x - x, o.y - y) < o.radius + 40)) continue;
    ctx.beginPath();
    ctx.rect(x - 1.4, y - 3.6, 2.8, 3.8);
    ctx.fillStyle = 'rgba(206,196,170,0.95)';
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `${INK}0.5)`;
    ctx.stroke();
  }
}

/**
 * The great lake at the ring's centre, engraved like the open sea: long calm strokes across the
 * water, and shore ripples ringing in from the coast.
 */
function paintLake(ctx: CanvasRenderingContext2D, map: MapDef, seed: number): void {
  const C = map.centre;
  const wobble = (a: number, k: number) => (noise(Math.cos(a) * 5 + k, Math.sin(a) * 5, seed + 29) - 0.5) * 22;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, C - 40, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(214,226,236,0.13)';
  for (let y = -C; y < C; y += 9) {
    ctx.beginPath();
    for (let x = -C; x <= C; x += 14) {
      const yy = y + Math.sin(x * 0.03 + y * 0.21) * 2.2;
      if (x === -C) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  // Ripple rings following the shore inward, each fainter and broken into longer dashes.
  for (let i = 1; i <= 4; i++) {
    const r = C - 40 - i * (18 + i * 8);
    if (r < C * 0.3) break;
    ctx.beginPath();
    const steps = 360;
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const rr = r + wobble(a, 0) * (1 - i * 0.18);
      if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.lineWidth = 1.5 - i * 0.2;
    ctx.strokeStyle = `${INK}${0.34 - i * 0.06})`;
    ctx.setLineDash(i > 1 ? [14 + i * 8, 9 + i * 4] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Little inked wave crests scattered on the deep.
  const rand = seeded(seed + 707);
  const crests = Math.floor((C * C) / 5200);
  for (let i = 0; i < crests; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (C - 90);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const w = 7 + rand() * 8;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w / 2, y - w * 0.45, x, y);
    ctx.quadraticCurveTo(x + w / 2, y - w * 0.45, x + w, y);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(226,234,240,${0.12 + rand() * 0.14})`;
    ctx.stroke();
  }
}

/**
 * The mountain massif at the ring's centre: hundreds of engraved peaks in the old cartographer's
 * manner, each lit on its upper-left face and hatched in cool ink on the other, the tallest
 * capped with snow toward the summit.
 */
function paintMassif(ctx: CanvasRenderingContext2D, map: MapDef, seed: number, terrainAt: (x: number, y: number) => number): void {
  const C = map.centre;
  const rand = seeded(seed + 4111);
  const peaks: { x: number; y: number; s: number; snow: boolean; lean: number }[] = [];
  const step = Math.max(40, C / 9);
  for (let y = -C; y <= C + step; y += step * 0.55) {
    const row = Math.round(y / (step * 0.55));
    for (let x = -C; x <= C; x += step) {
      const px = x + (row % 2 ? step * 0.5 : 0) + (rand() - 0.5) * step * 0.6;
      const py = y + (rand() - 0.5) * step * 0.3;
      const d = Math.hypot(px, py);
      if (d > C + 6 || terrainAt(px, py) !== Terrain.Rock) continue;
      const up = Math.max(0, 1 - d / (C + 6));
      // Foothills at the shore, great peaks toward the summit.
      const s = step * (0.38 + up * up * 1.05 + rand() * 0.18);
      peaks.push({ x: px, y: py, s, snow: up > 0.42 + rand() * 0.18, lean: (rand() - 0.5) * 0.35 });
    }
  }
  peaks.sort((a, b) => a.y - b.y);
  for (const pk of peaks) {
    const { x, y, s, lean } = pk;
    const h = s * 1.15;
    const tipX = x + lean * s;
    const tipY = y - h;
    const left = x - s;
    const right = x + s;
    // A second, lower shoulder on the right gives each peak a ridge, not a cone.
    const shX = x + s * 0.48;
    const shY = y - h * 0.52;
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(tipX - s * 0.18, tipY + h * 0.22);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(shX - s * 0.06, shY - h * 0.04);
      ctx.lineTo(shX + s * 0.12, shY + h * 0.06);
      ctx.lineTo(right, y);
      ctx.quadraticCurveTo(x, y + s * 0.16, left, y);
      ctx.closePath();
    };
    body();
    ctx.fillStyle = 'rgb(186,166,124)';
    ctx.fill();
    // The lit face falls from the tip toward the lower left, warm as the candle light.
    const g = ctx.createLinearGradient(left, tipY, right, y);
    g.addColorStop(0, 'rgba(240,224,182,0.85)');
    g.addColorStop(0.45, 'rgba(206,182,132,0.3)');
    g.addColorStop(1, 'rgba(90,82,70,0)');
    ctx.fillStyle = g;
    ctx.fill();
    // The shadow face: from the ridge line down to the right, hatched in cool ink.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(shX - s * 0.06, shY - h * 0.04);
    ctx.lineTo(shX + s * 0.12, shY + h * 0.06);
    ctx.lineTo(right, y);
    ctx.quadraticCurveTo(x + s * 0.4, y + s * 0.12, x + s * 0.12, y + s * 0.02);
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,76,104,0.62)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(24,28,52,0.34)';
    ctx.lineWidth = 0.8;
    for (let k = -h; k < s * 2; k += 3.2) {
      ctx.beginPath();
      ctx.moveTo(x + k - s * 0.4, y + 2);
      ctx.lineTo(x + k + h * 0.35, tipY);
      ctx.stroke();
    }
    ctx.restore();
    if (pk.snow) {
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - s * 0.3, tipY + h * 0.3);
      ctx.lineTo(tipX - s * 0.12, tipY + h * 0.24);
      ctx.lineTo(tipX - s * 0.02, tipY + h * 0.36);
      ctx.lineTo(tipX + s * 0.14, tipY + h * 0.22);
      ctx.lineTo(tipX + s * 0.26, tipY + h * 0.3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(246,242,232,0.95)';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `${INK}0.45)`;
      ctx.stroke();
    }
    // The ridge in heavy ink; the foot left open, as an engraver leaves it.
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(tipX - s * 0.18, tipY + h * 0.22);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(shX - s * 0.06, shY - h * 0.04);
    ctx.lineTo(shX + s * 0.12, shY + h * 0.06);
    ctx.lineTo(right, y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = `${INK}0.78)`;
    ctx.stroke();
    // A few scree ticks at the foot.
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `${INK}0.3)`;
    for (let k = 0; k < 3; k++) {
      const tx = left + s * (0.3 + k * 0.5);
      ctx.beginPath();
      ctx.moveTo(tx, y + 1);
      ctx.lineTo(tx + 2, y - 3);
      ctx.stroke();
    }
  }
}

/** The centre's name lettered across it in spaced capitals, pale on the deep, outlined in ink. */
function paintCentreName(ctx: CanvasRenderingContext2D, map: MapDef, seed: number): void {
  const C = map.centre;
  const name = centreName(seed, map.centreKind).toUpperCase().split('').join('\u2009');
  const size = Math.max(34, Math.min(96, C * 0.1));
  ctx.save();
  ctx.font = `${Math.round(size)}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = isLake(map.centreKind) ? 0 : C * 0.05;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = `${INK}0.72)`;
  ctx.strokeText(name, 0, y, C * 1.5);
  ctx.fillStyle = 'rgba(239,228,200,0.92)';
  ctx.fillText(name, 0, y, C * 1.5);
  // A rubricated flourish under the name.
  ctx.beginPath();
  ctx.moveTo(-C * 0.32, y + size * 0.7);
  ctx.quadraticCurveTo(0, y + size * 0.95, C * 0.32, y + size * 0.7);
  ctx.lineWidth = 3;
  ctx.strokeStyle = `${INK}0.6)`;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(184,50,31,0.9)';
  ctx.stroke();
  ctx.restore();
}

function paintGrass(ctx: CanvasRenderingContext2D, R: number, rand: () => number, terrainAt: (x: number, y: number) => number): void {
  // Ink ticks of grass, sparse, like a pen idling over the meadows.
  const count = (Math.PI * R * R) / 160;
  for (let i = 0; i < count; i++) {
    const x = (rand() * 2 - 1) * R;
    const y = (rand() * 2 - 1) * R;
    if (x * x + y * y > (R - 30) * (R - 30) || terrainAt(x, y) !== Terrain.Plain) continue;
    const h = 2 + rand() * 2.5;
    ctx.strokeStyle = `${INK}${0.1 + rand() * 0.08})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 1.4, y);
    ctx.lineTo(x - 1.9, y - h * 0.8);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.2, y - h);
    ctx.moveTo(x + 1.3, y);
    ctx.lineTo(x + 2, y - h * 0.7);
    ctx.stroke();
  }
}

function paintRocks(ctx: CanvasRenderingContext2D, map: MapDef, rand: () => number): void {
  for (let row = 0; row < map.navRows; row++) {
    for (let col = 0; col < map.navCols; col++) {
      if (map.terrain[row * map.navCols + col] !== Terrain.Rock || rand() < 0.45) continue;
      const x = map.originX + (col + rand()) * map.navCell;
      const y = map.originY + (row + rand()) * map.navCell;
      // The massif is engraved as whole peaks (paintMassif), not crags.
      if (map.centre > 0 && !isLake(map.centreKind) && x * x + y * y < (map.centre + 30) ** 2) continue;
      const r = 4 + rand() * 6;
      // A crag: lit top-left facet in vellum-grey, a shadow facet hatched in ink.
      const peak = [x - r * 0.1, y - r * 0.95] as const;
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.35);
      ctx.lineTo(peak[0], peak[1]);
      ctx.lineTo(x + r, y + r * 0.35);
      ctx.closePath();
      ctx.fillStyle = 'rgba(176,164,138,0.95)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(peak[0], peak[1]);
      ctx.lineTo(x + r, y + r * 0.35);
      ctx.lineTo(x + r * 0.05, y + r * 0.35);
      ctx.closePath();
      ctx.fillStyle = 'rgba(112,100,82,0.95)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = `${INK}0.22)`;
      ctx.lineWidth = 0.7;
      for (let h = -r; h < r * 2; h += 3.4) {
        ctx.beginPath();
        ctx.moveTo(x + h - r, y + r);
        ctx.lineTo(x + h, y - r);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.35);
      ctx.lineTo(peak[0], peak[1]);
      ctx.lineTo(x + r, y + r * 0.35);
      ctx.strokeStyle = `${INK}0.6)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

function paintForests(ctx: CanvasRenderingContext2D, map: MapDef, rand: () => number, pxPerUnit: number, size: number, extent: number): void {
  const blobs: { x: number; y: number; r: number; tone: number }[] = [];
  for (let row = 0; row < map.navRows; row++) {
    for (let col = 0; col < map.navCols; col++) {
      if (map.terrain[row * map.navCols + col] !== Terrain.Forest) continue;
      const count = 1 + (rand() < 0.55 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        blobs.push({ x: map.originX + (col + rand()) * map.navCell, y: map.originY + (row + rand()) * map.navCell, r: 5 + rand() * 4.5, tone: rand() });
      }
    }
  }
  blobs.sort((a, b) => a.y - b.y);

  // Cast shadows, softened, falling to the south-east.
  const [shadowCanvas, sctx] = canvas2d(size, size);
  sctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, extent * pxPerUnit, extent * pxPerUnit);
  sctx.fillStyle = 'rgba(30,34,40,0.9)';
  for (const b of blobs) {
    sctx.beginPath();
    sctx.arc(b.x + 3.6, b.y + 4.4, b.r * 1.05, 0, Math.PI * 2);
    sctx.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${Math.max(2, 2.5 * pxPerUnit)}px)`;
  ctx.globalAlpha = 0.42;
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.restore();

  // Each tree: a lobed canopy in terre verte, lit top-left, hatched on its shadow side, outlined in ink.
  for (const b of blobs) {
    const lobes = 5;
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= lobes * 4; i++) {
        const a = (i / (lobes * 4)) * Math.PI * 2;
        const bump = 1 + Math.sin(a * lobes + b.tone * 6) * 0.08;
        const x = b.x + Math.cos(a) * b.r * bump;
        const y = b.y + Math.sin(a) * b.r * bump * 0.94;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    const base = mix([66, 98, 50], [84, 116, 56], b.tone);
    path();
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fill();
    const g = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, 0, b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 1.05);
    g.addColorStop(0, 'rgba(160,190,90,0.5)');
    g.addColorStop(0.5, 'rgba(120,156,72,0.16)');
    g.addColorStop(1, 'rgba(30,48,30,0.25)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.strokeStyle = `${INK}0.15)`;
    ctx.lineWidth = 0.7;
    for (let h = 0; h < b.r * 1.6; h += 3.2) {
      ctx.beginPath();
      ctx.moveTo(b.x + h - b.r * 0.2, b.y + b.r);
      ctx.lineTo(b.x + h + b.r * 0.5, b.y - b.r * 0.1 + h * 0.15);
      ctx.stroke();
    }
    ctx.restore();
    path();
    ctx.strokeStyle = `${INK}0.45)`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}

function paintFrame(ctx: CanvasRenderingContext2D, half: number, seed: number): void {
  const rule = (inset: number, width: number, alpha: number) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = `${INK}${alpha})`;
    ctx.strokeRect(-half + inset, -half + inset, (half - inset) * 2, (half - inset) * 2);
  };
  rule(0, 2.6, 0.8);
  rule(9, 1, 0.55);
  // Corner fleurons: a quatrefoil in gold leaf, outlined in ink.
  const rand = seeded(seed + 5);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const cx = sx * (half - 4.5);
    const cy = sy * (half - 4.5);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 9, 5.5, a, 0, Math.PI * 2);
      ctx.fillStyle = rand() < 0.5 ? 'rgba(212,169,62,0.95)' : 'rgba(196,152,52,0.95)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `${INK}0.85)`;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(184,50,31,0.95)';
    ctx.fill();
    ctx.stroke();
  }
}

/** A compass rose in ink, gold leaf and vermilion, in the sheet's north-east margin. */
function paintCompass(ctx: CanvasRenderingContext2D, half: number, R: number, seaW: number): void {
  // In the north-east margin, just off the sea, where a wide view still shows it.
  const r = Math.max(40, Math.min(140, R * 0.11));
  const d = Math.min((half - r * 1.25) * Math.SQRT2, R + seaW + r * 1.25);
  const cx = d * Math.SQRT1_2;
  const cy = -d * Math.SQRT1_2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `${INK}0.7)`;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const k = i % 8 === 0 ? 0.8 : i % 4 === 0 ? 0.86 : 0.89;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
    ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  const point = (a: number, len: number, w: number, light: string, dark: string) => {
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy;
    const py = ux;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ux * len, uy * len);
    ctx.lineTo(px * w, py * w);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ux * len, uy * len);
    ctx.lineTo(-px * w, -py * w);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px * w, py * w);
    ctx.lineTo(ux * len, uy * len);
    ctx.lineTo(-px * w, -py * w);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `${INK}0.85)`;
    ctx.stroke();
  };
  for (let i = 0; i < 4; i++) point((i * Math.PI) / 2 + Math.PI / 4, r * 0.55, r * 0.09, 'rgba(239,228,200,1)', 'rgba(140,120,84,1)');
  for (let i = 0; i < 4; i++) {
    const north = i === 3;
    point((i * Math.PI) / 2, r * 0.86, r * 0.13, north ? 'rgba(212,74,52,1)' : 'rgba(246,220,140,1)', north ? 'rgba(150,36,22,1)' : 'rgba(176,132,40,1)');
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(212,169,62,1)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${Math.round(r * 0.3)}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `${INK}0.9)`;
  ctx.fillText('N', 0, -r * 1.1);
  ctx.restore();
}

/** The chart's title in a scrolled cartouche in the south-west margin. */
function paintCartouche(ctx: CanvasRenderingContext2D, half: number, R: number, seaW: number, text: ChartText): void {
  const w = Math.max(240, Math.min(600, R * 0.48));
  const h = w * 0.27;
  // South-west margin: slide out along the diagonal until the scroll clears the sea.
  let c = (R + seaW) * Math.SQRT1_2;
  while (Math.hypot(-c + w / 2, c - h / 2) < R + seaW * 0.75 && c < half - w / 2) c += 8;
  const cx = -c;
  const cy = c;
  ctx.save();
  ctx.translate(cx, cy);
  // Scroll body with curled ends.
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.bezierCurveTo(-w * 0.2, -h * 0.62, w * 0.2, -h * 0.38, w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.bezierCurveTo(w * 0.2, h * 0.38, -w * 0.2, h * 0.62, -w / 2, h / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(244,234,208,0.97)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `${INK}0.8)`;
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse((s * w) / 2, 0, h * 0.16, h * 0.52, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217,199,158,1)';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse((s * w) / 2, 0, h * 0.07, h * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, h * 0.06);
  ctx.lineTo(w * 0.36, h * 0.06);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(184,50,31,0.8)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(184,50,31,0.95)';
  ctx.font = `${Math.round(h * 0.34)}px ${DISPLAY_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text.title, 0, -h * 0.02, w * 0.78);
  ctx.fillStyle = `${INK}0.85)`;
  ctx.font = `italic ${Math.round(h * 0.2)}px ${SCRIPT_FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text.subtitle, 0, h * 0.12, w * 0.78);
  ctx.restore();
}

/** Vellum grain's tile: fibres and pores, as RGBA. */
function grainPixels(tile: number, seed: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(tile * tile * 4);
  const rand = seeded(seed + 313);
  for (let i = 0; i < tile * tile; i++) {
    const x = i % tile;
    const y = Math.floor(i / tile);
    const fibre = noise(x / 1.5, y / 9, seed + 2) * 0.5 + noise(x / 7, y / 1.2, seed + 4) * 0.3 + rand() * 0.2;
    const v = 255 - Math.round(fibre * 34);
    data[i * 4] = v;
    data[i * 4 + 1] = v - 3;
    data[i * 4 + 2] = v - 10;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Vellum grain: fibres and pores multiplied over everything, so pigment sits in the skin. */
function paintGrain(ctx: CanvasRenderingContext2D, size: number, tile: number, pixels: Uint8ClampedArray): void {
  const [g, gctx] = canvas2d(tile, tile);
  const img = gctx.createImageData(tile, tile);
  img.data.set(pixels);
  gctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  const pattern = ctx.createPattern(g, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();
}
