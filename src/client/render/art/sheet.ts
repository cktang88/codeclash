// Contact sheet for the unit art: every kind, pose and frame in two army colors,
// then a strip at battlefield sizes. Open /render/art/sheet.html in the dev server.
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { KIND_COUNT, type Kind } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import { makeUnitArt, type PoseName } from './index.ts';

const POSES: PoseName[] = ['idle', 'walk', 'attack', 'die'];
const TEAMS = [0x3b82f6, 0xe2483d];
const ROW = 104;
const params = new URLSearchParams(location.search);
const zoom = Number(params.get('zoom') ?? 1);

const app = new Application();
await app.init({ background: 0x2b3324, width: Number(params.get('w') ?? 2000), height: Number(params.get('h') ?? 2600), antialias: true, preserveDrawingBuffer: true });
document.body.appendChild(app.canvas);
const art = makeUnitArt();
const sheet = new Container();
sheet.scale.set(zoom);
app.stage.addChild(sheet);

const ground = new Graphics();
for (let i = 0; i < 400; i++) ground.circle((i * 997) % 2400, (i * 613) % 3400, 2 + (i % 5)).fill({ color: 0x3a4630, alpha: 0.6 });
sheet.addChild(ground);

function unit(kind: Kind, frame: { body: Sprite['texture']; mask: Sprite['texture'] }, x: number, y: number, h: number, tint: number, facing = 1): void {
  const cell = art.cell(kind);
  const s = h / cell.h;
  const shadow = new Graphics().ellipse(x, y, (STATS[kind]!.size * h) / 32, (STATS[kind]!.size * h) / 90).fill({ color: 0, alpha: 0.35 });
  sheet.addChild(shadow);
  const lift = art.flight(kind) ? (art.flight(kind)!.height / art.scale(kind)) * h : 0;
  for (const [tex, tinted] of [[frame.body, false], [frame.mask, true]] as const) {
    const sp = new Sprite(tex);
    sp.anchor.set(0.5, cell.feetY / cell.h);
    sp.scale.set(s * facing, s);
    sp.position.set(x, y - lift);
    if (tinted) sp.tint = tint;
    sheet.addChild(sp);
  }
}

const only = params.get('kinds')?.split(',').map(Number) ?? null;
const mag = Number(params.get('mag') ?? 1.6);
let y = 20;
for (let k = 0; k < KIND_COUNT; k++) {
  if (only && !only.includes(k)) continue;
  const kind = k as Kind;
  sheet.addChild(Object.assign(new Text({ text: STATS[kind]!.name, style: { fill: 0xf3ead2, fontSize: 15, fontFamily: 'sans-serif', fontWeight: '700' } }), { x: 8, y }));
  let x = 150;
  const h = art.scale(kind) * mag;
  const row = Math.max(ROW, h * 1.15 + 20);
  for (const pose of POSES) {
    for (const f of art.frames(kind, pose)) {
      unit(kind, f, x, y + row - 14, h, TEAMS[k % 2]!);
      x += Math.max(70, h * 0.8);
    }
    x += 24;
  }
  y += row;
}

// Battlefield sizes: a mixed army at mid and near zoom, both teams facing each other.
const strip = (yy: number, worldScale: number) => {
  for (let k = 0; k < KIND_COUNT; k++) {
    const kind = k as Kind;
    const frames = art.frames(kind, k % 3 === 0 ? 'attack' : 'walk');
    const h = art.scale(kind) * worldScale;
    unit(kind, frames[1 % frames.length]!, 60 + k * 40 * worldScale * 1.6, yy, h, TEAMS[0]!, 1);
    unit(kind, frames[2 % frames.length]!, 60 + k * 40 * worldScale * 1.6, yy + 60 * worldScale + 20, h, TEAMS[1]!, -1);
  }
};
if (!only) {
  strip(y + 60, 0.9);
  strip(y + 220, 2);
}
(window as unknown as { sheetReady: boolean }).sheetReady = true;
