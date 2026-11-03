// Preview of the commandery renderer at several stages: open /city-preview.html under Vite.
// Query: ?only=<index> shows one scene large; ?hour=<h> forces the hour for all; ?t=<seconds>
// fast-forwards the animation clock (for screenshots); ?zoom=<1-4>&focus=<x>,<y> zooms in.

import './styles.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { BuildingKey } from '../game/city.ts';
import { isFaction, type FactionId } from '../game/factions.ts';
import { CityScene, type CityMood } from './render/city.ts';
import { artMode, cityArt, parseArt, setArtMode, type ArtMode } from './settings.ts';
import { CityCanvas } from './ui/CityCanvas.tsx';

type Levels = Record<BuildingKey, number>;
const L = (b: number, r: number, s: number, w: number, c: number, g: number, h: number, wl: number): Levels => ({
  barracks: b, range: r, stables: s, workshop: w, chapter: c, granary: g, hospital: h, walls: wl,
});
const army = (k: number) => [k * 4, k * 3, k, k * 2, k, k, k, k, k, 0];

const SCENES: { name: string; levels: Levels; recruits: number; mood: CityMood }[] = [
  { name: 'Fresh: all 0, day', levels: L(0, 0, 0, 0, 0, 0, 0, 0), recruits: 0, mood: { hour: 11, idle: true } },
  { name: 'Early: levels 1-4, day', levels: L(3, 2, 1, 2, 4, 1, 2, 3), recruits: 6, mood: { hour: 10, streak: 1, army: army(1), progress: { chapter: 0.8 } } },
  { name: 'Mid: levels 5-10, afternoon', levels: L(8, 6, 7, 5, 9, 6, 5, 10), recruits: 16, mood: { hour: 15, streak: 2, army: army(3) } },
  { name: 'Late: levels 12-20, streak 6 (festive)', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 13, streak: 6, wins: 3, army: army(6) } },
  { name: 'Mid, idle (no push today)', levels: L(8, 6, 7, 5, 9, 2, 5, 10), recruits: 8, mood: { hour: 14, idle: true, army: army(2) } },
  { name: 'Late, night', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 23, streak: 6, army: army(6) } },
  { name: 'Mid, dusk', levels: L(8, 6, 7, 5, 9, 6, 5, 10), recruits: 16, mood: { hour: 19.2, streak: 3, army: army(3) } },
  { name: 'Late, marching out at dawn', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 6.6, streak: 6, army: army(6), marching: true } },
];

const q = new URLSearchParams(location.search);
// ?faction=templar|samurai|undead picks the city; ?level=<0-20> adds a scene 0 with every building at one level.
const faction: FactionId = isFaction(q.get('faction')) ? (q.get('faction') as FactionId) : 'templar';
if (q.has('level')) {
  const n = Number(q.get('level'));
  SCENES.unshift({ name: `All at level ${n}`, levels: L(n, n, n, n, n, n, n, n), recruits: n * 2, mood: { hour: 11, streak: Math.min(6, n), army: army(Math.ceil(n / 3)) } });
}
// ?art=classic|hd picks the art mode (default: the saved setting); the button flips the setting.
// HD 64 changes battles only: its city is the HD city.
const art: ArtMode = cityArt(q.get('art') ? parseArt(q.get('art')) : artMode());
{
  const b = document.createElement('button');
  b.textContent = art === 'hd' ? 'Art: HD (switch to classic)' : 'Art: classic (switch to HD)';
  b.style.cssText = 'position:fixed;right:10px;top:26px;z-index:2;font:12px Georgia,serif';
  b.onclick = () => {
    const next: ArtMode = art === 'hd' ? 'classic' : 'hd';
    setArtMode(next);
    const u = new URL(location.href);
    u.searchParams.set('art', next);
    location.href = u.toString();
  };
  document.body.append(b);
}
const only = q.has('only') ? Number(q.get('only')) : null;
const hour = q.has('hour') ? Number(q.get('hour')) : null;
const skip = Number(q.get('t') ?? 0);
const zoom = Number(q.get('zoom') ?? 1);
const focus = q.get('focus')?.split(',').map(Number);
const grid = document.getElementById('grid')!;
if (only !== null) grid.style.gridTemplateColumns = '1fr';

// ?app=<index>: the real CityCanvas component (zoom buttons, drag, wheel, pinch) in a city stage.
if (q.has('app')) {
  const s = SCENES[Number(q.get('app'))] ?? SCENES[3]!;
  const stage = document.createElement('div');
  stage.className = 'city-stage';
  stage.style.maxWidth = '1000px';
  document.body.prepend(stage);
  createRoot(stage).render(createElement(CityCanvas, { faction, hue: 200, seed: 7, levels: s.levels, recruits: s.recruits, mood: s.mood }));
}

const live = SCENES.map((s, i) => ({ s, i }))
  .filter(({ i }) => only === null || i === only)
  .map(({ s, i }) => {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    const cap = document.createElement('figcaption');
    cap.textContent = `${i}. ${s.name}`;
    fig.append(canvas, cap);
    grid.append(fig);
    const scene = new CityScene(faction, (i * 47 + 10) % 360, 1234 + i, art);
    const mood = { ...s.mood, ...(hour !== null ? { hour } : {}) };
    return { s, canvas, scene, mood };
  });

function size(): void {
  for (const l of live) {
    l.canvas.width = Math.round(l.canvas.clientWidth * (window.devicePixelRatio || 1));
    l.canvas.height = Math.round(l.canvas.clientHeight * (window.devicePixelRatio || 1));
    // Resizing clears a canvas: paint it again at once (screenshots resize the page).
    l.scene.draw(l.canvas, l.s.levels, l.s.recruits, 0, l.mood);
  }
}
size();
window.addEventListener('resize', size);
for (const l of live) {
  // Fast-forward so smoke, walkers and the drill are under way.
  for (let k = 0; k < skip * 10; k++) l.scene.draw(l.canvas, l.s.levels, l.s.recruits, 0.1, l.mood);
  if (zoom > 1) {
    l.scene.zoomAt(zoom - 1);
    // focus: a point in world pixels (the classic 512×288 coordinates) in either mode.
    if (focus) l.scene.lookAt(focus[0]!, focus[1]!);
  }
}
const costs: number[] = [];
let last = performance.now();
let paused = q.has('paused');
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused)
    for (const l of live) {
      l.scene.draw(l.canvas, l.s.levels, l.s.recruits, dt, l.mood);
      costs.push(l.scene.lastCost);
    }
  if (costs.length > 240) costs.splice(0, costs.length - 240);
  const avg = costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length);
  document.getElementById('meter')!.textContent = `${avg.toFixed(2)} ms/scene`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Hooks for scripted screenshots: step the clock by hand.
const hooks = {
  live,
  cost: () => costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length),
  pause: (p: boolean) => (paused = p),
  step: (seconds: number) => {
    for (const l of live) for (let k = 0; k < Math.round(seconds * 10); k++) l.scene.draw(l.canvas, l.s.levels, l.s.recruits, 0.1, l.mood);
  },
  /** Average ms of n frames at 60 fps for every scene. */
  bench: (n: number) => {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) for (const l of live) l.scene.draw(l.canvas, l.s.levels, l.s.recruits, 1 / 60, l.mood);
    return (performance.now() - t0) / (n * live.length);
  },
};
(window as unknown as { city: typeof hooks }).city = hooks;
