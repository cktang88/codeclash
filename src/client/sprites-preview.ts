// Sprite preview: every kind × animation × facing, animating, on a field-coloured background.
//   ?mode=grid  (default) animated, one table per kind: rows = animations, columns = facings
//   ?mode=sheet static frames: rows = animation × facing, columns = frames
//   ?mode=army  two armies at 1x and 2x, for readability at a glance
// Other params: kinds=0,1,2  anims=0,8  z=4 (zoom)  hue=215  hue2=8  faction=templar  t=<ticks> (freeze time)

import { Anim, ANIM_COUNT, KIND_COUNT, type Atlas, type Dir } from './render/contract.ts';
import { buildAtlas } from './render/sprites.ts';
import type { FactionId } from '../game/factions.ts';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'grid';
const zoom = Number(q.get('z') ?? 4);
const hueA = Number(q.get('hue') ?? 215);
const hueB = Number(q.get('hue2') ?? 8);
const faction = (q.get('faction') ?? 'templar') as FactionId;
const kinds = (q.get('kinds') ?? [...Array(KIND_COUNT).keys()].join(',')).split(',').map(Number);
const anims = (q.get('anims') ?? [...Array(ANIM_COUNT).keys()].join(',')).split(',').map(Number) as Anim[];

const KIND = ['Sergeant-Brothers', 'Spear Levy', 'Javelin Men', 'Pilgrim Archers', 'Genoese Crossbows', 'Turcopoles', 'Turcopole Archers', 'Knight-Brothers', 'Iron Brethren', 'Mangonel', 'Marshal'];
const ANIM = ['Idle', 'Walk', 'Run', 'Attack', 'Shoot', 'Hit', 'Die', 'Dead', 'Brace'];
const DIR = ['SE', 'SW', 'NW', 'NE'];
const FIELD = '#56603a';

const t0 = performance.now();
const A = buildAtlas(faction, hueA);
const t1 = performance.now();
const B = buildAtlas(faction, hueB);
const t2 = performance.now();
const info = document.getElementById('info')!;
info.innerHTML =
  `${faction} · atlas ${A.image.width}×${A.image.height} · build ${(t1 - t0).toFixed(0)} ms / ${(t2 - t1).toFixed(0)} ms · ` +
  ['grid', 'sheet', 'army'].map((m) => `<a href="?mode=${m}&faction=${faction}">${m}</a>`).join(' ');
const times = [t1 - t0, t2 - t1];
for (let i = 0; i < Number(q.get('bench') ?? 0); i++) {
  const s = performance.now();
  buildAtlas(faction, (hueA + 40 * i) % 360);
  times.push(performance.now() - s);
}
(window as unknown as { buildMs: number[] }).buildMs = times.map(Math.round);
const out = document.getElementById('out')!;

function cell(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function field(g: CanvasRenderingContext2D, w: number, h: number, s = 1): void {
  g.fillStyle = FIELD;
  g.fillRect(0, 0, w, h);
  let seed = 7;
  for (let i = 0; i < (w * h) / (60 * s * s); i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % w;
    seed = (seed * 16807) % 2147483647;
    const y = seed % h;
    g.fillStyle = i % 3 ? '#4d5734' : '#626c42';
    g.fillRect(x - (x % s), y - (y % s), s, s);
  }
}

/** Frame index at time t (ticks); Die plays once, holds, then loops after a pause. */
function frameAt(at: Atlas, kind: number, a: Anim, t: number): number {
  const n = at.frames(kind, a);
  const f = Math.floor(t / at.ticksPerFrame(a));
  if (a === Anim.Die) return Math.min(n - 1, f % (n + 8));
  return f % n;
}

const draws: ((t: number) => void)[] = [];

if (mode === 'grid') {
  for (const k of kinds) {
    const h2 = document.createElement('h2');
    h2.textContent = `${k} ${KIND[k]}`;
    out.appendChild(h2);
    const tbl = document.createElement('table');
    const at = k % 2 ? B : A;
    for (const a of anims) {
      const tr = tbl.insertRow();
      tr.insertCell().textContent = ANIM[a]!;
      for (let d = 0; d < 4; d++) {
        const [c, g] = cell(at.cellW * zoom, at.cellH * zoom);
        tr.insertCell().appendChild(c);
        draws.push((t) => {
          field(g, c.width, c.height, zoom);
          const [sx, sy] = at.at(k, a, frameAt(at, k, a, t), d as Dir);
          g.drawImage(at.image, sx, sy, at.cellW, at.cellH, 0, 0, c.width, c.height);
        });
      }
    }
    out.appendChild(tbl);
  }
} else if (mode === 'sheet') {
  for (const k of kinds) {
    const h2 = document.createElement('h2');
    h2.textContent = `${k} ${KIND[k]}`;
    out.appendChild(h2);
    const tbl = document.createElement('table');
    for (const a of anims)
      for (let d = 0; d < 4; d++) {
        const at = d % 2 ? B : A;
        const tr = tbl.insertRow();
        tr.insertCell().textContent = `${ANIM[a]} ${DIR[d]}`;
        const n = at.frames(k, a);
        const [c, g] = cell(at.cellW * zoom * n, at.cellH * zoom);
        field(g, c.width, c.height, zoom);
        for (let f = 0; f < n; f++) {
          const [sx, sy] = at.at(k, a, f, d as Dir);
          g.drawImage(at.image, sx, sy, at.cellW, at.cellH, f * at.cellW * zoom, 0, at.cellW * zoom, at.cellH * zoom);
        }
        tr.insertCell().appendChild(c);
      }
    out.appendChild(tbl);
  }
} else {
  // Two armies face each other across the field, at 1x and 2x.
  const Wd = 640, Hd = 300;
  const [buf, bg] = cell(Wd, Hd);
  for (const s of [1, 2]) {
    const h2 = document.createElement('h2');
    h2.textContent = `${s}x`;
    out.appendChild(h2);
    const [c, g] = cell(Wd * s, Hd * s);
    c.style.marginLeft = '12px';
    out.appendChild(c);
    draws.push(() => {
      g.imageSmoothingEnabled = false;
      g.drawImage(buf, 0, 0, Wd * s, Hd * s);
    });
  }
  interface Man { x: number; y: number; k: number; team: number; a: Anim; d: Dir; off: number }
  const men: Man[] = [];
  const block = (k: number, team: number, x0: number, y0: number, cols: number, rows: number, a: Anim, dx: number, dy: number) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        men.push({ x: x0 + c * dx + r * 3, y: y0 + r * dy, k, team, a, d: (team === 0 ? 3 : 1) as Dir, off: (c * 7 + r * 3) % 3 });
  };
  const order: [number, Anim][] = [[1, Anim.Brace], [0, Anim.Brace], [3, Anim.Shoot], [4, Anim.Brace], [8, Anim.Walk], [2, Anim.Shoot], [7, Anim.Run], [5, Anim.Brace], [6, Anim.Brace], [9, Anim.Shoot]];
  order.forEach(([k, a], i) => {
    const mounted = k >= 5 && k <= 7;
    const col = i % 5, row = Math.floor(i / 5);
    const n = k === 9 ? 2 : mounted ? 5 : 8;
    const rows = k === 9 ? 1 : mounted ? 3 : 4;
    const dx = k === 9 ? 18 : mounted ? 9 : 5;
    const dy = mounted ? 7 : 4;
    block(k, 0, 20 + col * 124, 200 + row * 50, n, rows, a, dx, dy);
    block(k, 1, 30 + col * 124, 50 + row * 50, n, rows, a === Anim.Shoot ? Anim.Walk : a, dx, dy);
  });
  men.push({ x: 600, y: 285, k: 10, team: 0, a: Anim.Brace, d: 3, off: 0 });
  men.push({ x: 600, y: 40, k: 10, team: 1, a: Anim.Idle, d: 1, off: 0 });
  for (let i = 0; i < 24; i++) men.push({ x: 40 + ((i * 97) % 560), y: 150 + ((i * 37) % 30), k: i % 10, team: i % 2, a: Anim.Dead, d: (i % 4) as Dir, off: 0 });
  men.sort((p, r) => p.y - r.y);
  draws.unshift((t) => {
    field(bg, Wd, Hd);
    for (const m of men) {
      const at = m.team ? B : A;
      const [sx, sy] = at.at(m.k, m.a, frameAt(at, m.k, m.a, t + m.off), m.d);
      bg.drawImage(at.image, sx, sy, at.cellW, at.cellH, Math.round(m.x) - at.footX, Math.round(m.y) - at.footY, at.cellW, at.cellH);
    }
  });
}

const start = performance.now();
const tq = q.get('t');
function loop(): void {
  const t = tq !== null ? Number(tq) : (performance.now() - start) / 100;
  for (const d of draws) d(t);
  if (tq === null) requestAnimationFrame(loop);
}
loop();
