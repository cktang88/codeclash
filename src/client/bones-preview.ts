// Bone demo for the paper painter (sprites-preview.html?mode=bones): a test figure built from
// simple parts on the standard skeleton of a kind's body type, every animation, the drawn facings
// (SE, NE), with the skeleton drawn over it: bones as lines, joints as dots, IK targets as squares.
//   ?mode=bones&faction=undead&kind=0  level=4 (1, 2, 4, 8)  z=2 (zoom)  hue=215  anims=0,1,3
//   bones=0 (no overlay)  body=foot|horse|beast|engine (override)

import { Anim, ANIM_COUNT } from './render/contract.ts';
import { FRAMES } from './render/frames.ts';
import { M } from './render/paper/core.ts';
import { paperKindFor } from './render/paper/index.ts';
import type { BodyType } from './render/paper/rig.ts';
import { animationsFor, bakeClip, clipOf, paintSkeleton, skeletonFor, stickParts, type Posed, type SkeletonRig } from './render/paper/skeleton.ts';
import { Paper } from './render/paper/core.ts';
import type { Facing } from './render/paper/facing.ts';

const q = new URLSearchParams(location.search);
const faction = q.get('faction') ?? 'undead';
const kind = Number(q.get('kind') ?? 0);
const level = Number(q.get('level') ?? 4);
const zoom = Number(q.get('z') ?? 2);
const hue = Number(q.get('hue') ?? 215);
const overlay = q.get('bones') !== '0';
const anims = (q.get('anims') ?? [...Array(ANIM_COUNT).keys()].join(',')).split(',').map(Number) as Anim[];
const fallback: BodyType = kind >= 5 && kind <= 7 ? 'horse' : kind === 8 ? 'beast' : kind === 9 ? 'engine' : 'foot';
const body = (q.get('body') as BodyType | null) ?? paperKindFor(faction, kind)?.body ?? fallback;

const skel = skeletonFor(body);
const rig: SkeletonRig = { skel, clips: animationsFor(body), atts: stickParts(skel, { body: M.bone, cloth: M.rag, metal: M.steel, team: M.team, hide: M.leather, wood: M.wood }) };
const ANIM = ['Idle', 'Walk', 'Run', 'Attack', 'Shoot', 'Hit', 'Die', 'Dead', 'Brace'];
const FIELD = '#56603a';

document.getElementById('info')!.innerHTML =
  `bones · ${faction} kind ${kind} · body <b>${body}</b> · skeleton ${skel.bones.length} bones, ${skel.slots.length} slots · level ${level} · ` +
  `<a href="?mode=grid&faction=${faction}">back to sprites</a> · ` +
  ['foot', 'horse', 'beast', 'engine'].map((b) => `<a href="?mode=bones&faction=${faction}&kind=${kind}&body=${b}&level=${level}&z=${zoom}">${b}</a>`).join(' ') +
  ' · lines = bones (yellow), dots = joints, squares = IK targets (cyan), red = a smear event';
const out = document.getElementById('out')!;

interface Shot {
  img: ImageData;
  posed: Posed;
  ax: number;
  ay: number;
}

/** Draws the skeleton over a frame: bones as lines, joints as dots, IK targets as squares. */
function drawBones(g: CanvasRenderingContext2D, s: Shot, dx: number, dy: number, z: number): void {
  const L = s.posed.level;
  const X = (x: number) => dx + (s.ax + x * L + 0.5) * z, Y = (y: number) => dy + (s.ay + y * L + 0.5) * z;
  const targets = new Set((s.posed.skel.ik ?? []).filter((k) => k.mix > 0).map((k) => k.target));
  g.lineWidth = Math.max(1, z * 0.75);
  for (const b of s.posed.bones) {
    if (b.len <= 0) continue;
    g.strokeStyle = s.posed.events.some((e) => e.name === 'smear' && e.bone === b.name) ? '#ff5040' : 'rgba(255, 220, 60, 0.9)';
    g.beginPath();
    g.moveTo(X(b.x), Y(b.y));
    g.lineTo(X(b.tx), Y(b.ty));
    g.stroke();
  }
  for (const b of s.posed.bones) {
    const r = Math.max(1.5, z * 1.1);
    if (targets.has(b.name)) {
      g.strokeStyle = '#40e0ff';
      g.strokeRect(X(b.x) - r * 1.6, Y(b.y) - r * 1.6, r * 3.2, r * 3.2);
      continue;
    }
    g.fillStyle = b.name === 'root' ? '#ffffff' : '#ff8030';
    g.beginPath();
    g.arc(X(b.x), Y(b.y), r, 0, Math.PI * 2);
    g.fill();
  }
  // The ground line.
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.moveTo(dx, Y(0));
  g.lineTo(dx + 4000, Y(0));
  g.stroke();
}

for (const a of anims) {
  const h2 = document.createElement('h2');
  const { clip } = clipOf(rig, a, 0);
  const n = FRAMES[a] ?? 8;
  const events = bakeClip(skel, clip, level, 'se', n, a === Anim.Idle || a === Anim.Walk || a === Anim.Run || a === Anim.Brace)
    .map((p, i) => (p.events.length ? `${i}:${p.events.map((e) => e.name).join('+')}` : ''))
    .filter(Boolean);
  h2.textContent = `${ANIM[a]} · ${n} frames${events.length ? ` · events ${events.join(' ')}` : ''}`;
  out.appendChild(h2);
  for (const facing of ['se', 'ne'] as Facing[]) {
    const paper = new Paper();
    const shots: Shot[] = [];
    for (let f = 0; f < n; f++) {
      const fr = paintSkeleton(rig, a, f, { level, facing, hue, paper });
      shots.push({ img: new ImageData(new Uint8ClampedArray(fr.pixels), fr.width, fr.height), posed: fr.posed, ax: fr.ax, ay: fr.ay });
    }
    // Crop every frame of the row to the union of what was drawn, with a margin.
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const s of shots)
      for (let y = 0; y < s.img.height; y++)
        for (let x = 0; x < s.img.width; x++)
          if (s.img.data[(y * s.img.width + x) * 4 + 3]) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
    const pad = 2 * level;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(shots[0]!.img.width - 1, x1 + pad);
    y1 = Math.min(shots[0]!.img.height - 1, Math.max(y1, shots[0]!.ay) + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const c = document.createElement('canvas');
    c.width = cw * zoom * n;
    c.height = ch * zoom;
    c.style.margin = '2px 12px';
    c.title = facing.toUpperCase();
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = FIELD;
    g.fillRect(0, 0, c.width, c.height);
    const tmp = document.createElement('canvas');
    tmp.width = shots[0]!.img.width;
    tmp.height = shots[0]!.img.height;
    const tg = tmp.getContext('2d')!;
    shots.forEach((s, i) => {
      tg.clearRect(0, 0, tmp.width, tmp.height);
      tg.putImageData(s.img, 0, 0);
      g.drawImage(tmp, x0, y0, cw, ch, i * cw * zoom, 0, cw * zoom, ch * zoom);
      if (overlay) drawBones(g, s, i * cw * zoom - x0 * zoom, -y0 * zoom, zoom);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(i * cw * zoom, 0, 1, c.height);
      g.fillStyle = '#d9d2bf';
      g.font = '11px monospace';
      g.fillText(`${facing.toUpperCase()} ${i}`, i * cw * zoom + 3, 12);
    });
    out.appendChild(c);
  }
}
(window as unknown as { bonesReady: boolean }).bonesReady = true;
