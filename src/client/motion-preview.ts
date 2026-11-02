// Motion reference preview: every converted motion clip (render/paper/motion/) played on a stick
// figure in both drawn facings, beside the Muybridge photographs it is checked against, with a
// filmstrip of every painted frame. Open /motion-preview.html (pnpm dev:client).
//   ?clip=walk,run   only these clips      ?frame=5   freeze the players on a frame
//   ?scale=8         pixels per unit       ?film=0    hide the filmstrips

import { Anim } from './render/contract.ts';
import { TICKS } from './render/frames.ts';
import { MOTION, type MotionClip, type MotionFacing, type MotionKey } from './render/paper/motion/index.ts';
import { curveAt } from './render/paper/skeleton.ts';

type P = [number, number];
const q = new URLSearchParams(location.search);
const ONLY = q.get('clip')?.split(',');
const FREEZE = q.has('frame') ? Number(q.get('frame')) : null;
const S = Number(q.get('scale') ?? 6);
const FILM = q.get('film') !== '0';

/** Muybridge strips (public domain, src/client/public/motion-ref/): file, cells, cells per cycle. */
const REF: Record<string, { file: string; cells: number; cycle?: number; note: string; more?: string[] }> = {
  walk: { file: 'walk.jpg', cells: 12, note: 'Muybridge, A naked man walking (carrying a bucket)', more: ['walk-34.jpg'] },
  march: { file: 'walk.jpg', cells: 12, note: 'Muybridge, A naked man walking' },
  run: { file: 'run.jpg', cells: 8, note: 'Muybridge, A naked man running' },
  thrust: { file: 'lunge.jpg', cells: 12, note: 'Muybridge, two men thrust and parry (the lunge)' },
  'cut-overhead': { file: 'chop.jpg', cells: 8, note: 'Muybridge, a man chops wood' },
  chop: { file: 'chop.jpg', cells: 8, note: 'Muybridge, a man chops wood' },
  javelin: { file: 'javelin.jpg', cells: 12, note: 'Muybridge, a man throws a javelin' },
  'die-back': { file: 'fall-back.jpg', cells: 12, note: 'Muybridge, two men boxing, one falls' },
  'horse-gallop': { file: 'horse-gallop.jpg', cells: 16, cycle: 15, note: 'Muybridge Plate 626, galloping horse (measured)' },
  'horse-walk': { file: 'horse-walk.jpg', cells: 24, note: 'Muybridge Plate 574, horse walking' },
};

const dir = (a: number): P => [Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)];
const add = (p: P, a: number, len: number): P => {
  const d = dir(a);
  return [p[0] + d[0] * len, p[1] + d[1] * len];
};
/** A body-frame vector (forward, right) on the ground plane, seen in a facing (as scripts/mocap). */
function lateral(f: number, r: number, facing: MotionFacing): P {
  const C = Math.cos(Math.PI / 6), Sn = Math.sin(Math.PI / 6);
  const [hx, hy] = facing === 'se' ? [1, 0] : [0.5, -C];
  const mx = f * hx - r * hy, my = f * hy + r * hx;
  return [mx * C - my * Sn, (mx * Sn + my * C) * 0.5];
}

/** The pose at painted frame t: keys eased like the skeleton sampler (loops wrap). */
function sample(clip: MotionClip, facing: MotionFacing, t: number): MotionKey & { events: string[] } {
  const keys = clip.facings[facing].keys;
  const n = clip.frames;
  let a = keys[0]!, b = keys[0]!, u = 0;
  if (keys.length > 1) {
    let i = keys.length - 1;
    while (i > 0 && keys[i]!.f > t) i--;
    a = keys[i]!;
    if (i + 1 < keys.length) {
      b = keys[i + 1]!;
      u = (t - a.f) / (b.f - a.f);
    } else if (clip.loop) {
      b = keys[0]!;
      u = (t - a.f) / (n - a.f);
    } else b = a;
    u = curveAt(a.c, Math.max(0, Math.min(1, u)));
  }
  const lerp = (x: number, y: number): number => x + (y - x) * u;
  const bones: Record<string, number> = {};
  for (const k of Object.keys(a.bones)) bones[k] = lerp(a.bones[k]!, b.bones[k]!);
  const events = clip.events.filter((e) => t >= e.f && t < e.f + (e.len ?? 1)).map((e) => e.name);
  return {
    f: t,
    root: [lerp(a.root[0]!, b.root[0]!), lerp(a.root[1]!, b.root[1]!)],
    height: lerp(a.height, b.height),
    contact: a.contact,
    bones,
    twist: a.twist && b.twist ? { pelvis: lerp(a.twist.pelvis, b.twist.pelvis), chest: lerp(a.twist.chest, b.twist.chest) } : undefined,
    events,
    ...('hooves' in a ? { hooves: (a as unknown as { hooves: unknown }).hooves } : {}),
  } as MotionKey & { events: string[] };
}

function line(g: CanvasRenderingContext2D, pts: P[], color: string, w: number): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.stroke();
}
const dot = (g: CanvasRenderingContext2D, p: P, r: number, color: string): void => {
  g.fillStyle = color;
  g.beginPath();
  g.arc(p[0], p[1], r, 0, Math.PI * 2);
  g.fill();
};

const NEAR = '#f2c46d', FAR = '#8d8a9e', BODY = '#f3ead2', GROUND = 'rgba(0,0,0,0.25)';

/** A man: FK from the world angles, lengths and root, in figure units, drawn at foot point o. */
function drawMan(g: CanvasRenderingContext2D, c: MotionClip, k: MotionKey & { events: string[] }, facing: MotionFacing, o: P): void {
  const L = c.lengths;
  const u = (p: P): P => [o[0] + p[0] * S, o[1] + p[1] * S];
  const B = k.bones;
  const pelvis: P = [k.root[0]!, k.root[1]! - (c.restHip ?? 8)];
  const tw = k.twist ?? { pelvis: 0, chest: 0 };
  const side = (w: number, yaw: number): P => {
    const t = (yaw * Math.PI) / 180;
    return lateral(w * Math.sin(t), w * Math.cos(t), facing);
  };
  const hipN = ((d: P): P => [pelvis[0] + d[0], pelvis[1] + d[1]])(side(0.85, tw.pelvis));
  const hipF = ((d: P): P => [pelvis[0] - d[0], pelvis[1] - d[1]])(side(0.85, tw.pelvis));
  const p1 = add(pelvis, B.pelvis!, L.pelvis!), p2 = add(p1, B.spine!, L.spine!), p3 = add(p2, B.chest!, L.chest!);
  const p4 = add(p3, B.neck!, L.neck!), p5 = add(p4, B.head!, L.head!);
  const sh = side(1.55, tw.chest);
  const shN: P = [p3[0] + sh[0], p3[1] + sh[1] + 0.25], shF: P = [p3[0] - sh[0], p3[1] - sh[1] + 0.25];
  const arm = (s: P, x: 'N' | 'F'): P[] => {
    const e = add(s, B['upperArm' + x]!, L.upperArm!), w = add(e, B['forearm' + x]!, L.forearm!);
    return [s, e, w, add(w, B['hand' + x]!, L.hand! + 0.3)];
  };
  const leg = (h: P, x: 'N' | 'F'): P[] => {
    const kn = add(h, B['thigh' + x]!, L.thigh!), an = add(kn, B['shin' + x]!, L.shin!);
    return [h, kn, an, add(an, B['foot' + x]!, L.foot!)];
  };
  // shadow and contacts
  g.fillStyle = GROUND;
  g.beginPath();
  g.ellipse(o[0] + k.root[0]! * S, o[1], 3.2 * S, 1.1 * S, 0, 0, Math.PI * 2);
  g.fill();
  const legN = leg(hipN, 'N'), legF = leg(hipF, 'F'), armN = arm(shN, 'N'), armF = arm(shF, 'F');
  line(g, armF.map(u), FAR, 2);
  line(g, legF.map(u), FAR, 2.4);
  line(g, [hipF, hipN].map(u), BODY, 2);
  line(g, [pelvis, p1, p2, p3, p4].map(u), BODY, 3);
  line(g, [shF, shN].map(u), BODY, 2);
  const hc: P = [(p4[0] + p5[0]) / 2, (p4[1] + p5[1]) / 2];
  dot(g, u(hc), 0.62 * S, BODY);
  line(g, legN.map(u), NEAR, 2.6);
  line(g, armN.map(u), NEAR, 2.2);
  if (k.contact.N) dot(g, u(legN[2]!), 2.2, '#5fd06a');
  if (k.contact.F) dot(g, u(legF[2]!), 2.2, '#2f8f3a');
  if (k.events.includes('strike') || k.events.includes('release')) dot(g, u(armN[3]!), 4, '#ff5a3c');
  if (k.events.includes('smear')) dot(g, u(armN[3]!), 2.5, '#ffd0a0');
}

/** A horse: barrel, neck, head, tail and four two-segment legs. */
function drawHorse(g: CanvasRenderingContext2D, c: MotionClip, k: MotionKey & { events: string[] }, facing: MotionFacing, o: P): void {
  const L = c.lengths;
  const u = (p: P): P => [o[0] + p[0] * S, o[1] + p[1] * S];
  const B = k.bones;
  const mid: P = [k.root[0]!, -k.height];
  const back = add(mid, B.barrel! + 180, L.barrel! / 2), front = add(mid, B.barrel!, L.barrel! / 2);
  const off = (p: P, x: number, y: number, r: number): P => {
    const l = lateral(x, r, facing);
    return [p[0] + l[0], p[1] + y + l[1]];
  };
  const hooves = (k as unknown as { hooves?: Record<string, boolean> }).hooves ?? {};
  const legPts = (top: P, up: string, lo: string, lu: number, ll: number): P[] => {
    const j = add(top, B[up]!, lu);
    return [top, j, add(j, B[lo]!, ll)];
  };
  g.fillStyle = GROUND;
  g.beginPath();
  g.ellipse(o[0], o[1], 6 * S, 1.6 * S, 0, 0, Math.PI * 2);
  g.fill();
  const hipF = off(back, 0.4, 1.4, -0.8), hipN = off(back, 0.4, 1.4, 0.8), shF = off(front, -0.6, 2.4, -0.8), shN = off(front, -0.6, 2.4, 0.8);
  const hF = legPts(hipF, 'hindUpperF', 'hindLowerF', L.hindUpper!, L.hindLower!), fF = legPts(shF, 'foreUpperF', 'foreLowerF', L.foreUpper!, L.foreLower!);
  const hN = legPts(hipN, 'hindUpperN', 'hindLowerN', L.hindUpper!, L.hindLower!), fN = legPts(shN, 'foreUpperN', 'foreLowerN', L.foreUpper!, L.foreLower!);
  line(g, hF.map(u), FAR, 2.4);
  line(g, fF.map(u), FAR, 2.4);
  const neckEnd = add(front, B.neck!, L.neck!), muzzle = add(neckEnd, B.head!, L.head!);
  line(g, [add(back, B.tail!, 0), add(back, B.tail!, L.tail!)].map(u), BODY, 2);
  line(g, [back, front].map(u), BODY, 2.6 * S);
  line(g, [front, neckEnd].map(u), BODY, 4);
  line(g, [neckEnd, muzzle].map(u), BODY, 0.9 * S);
  line(g, [front, neckEnd].map(u), BODY, 1.1 * S);
  // a rider sitting steady over the girth
  const seat = add(mid, B.barrel! + 180, 0.6);
  const sit: P = [seat[0], seat[1] - 1.2];
  line(g, ([sit, [sit[0] + 0.5, sit[1] - 4.6]] as P[]).map(u), '#c8b88f', 2.4);
  dot(g, u([sit[0] + 0.6, sit[1] - 5.3]), 0.55 * S, '#c8b88f');
  line(g, ([sit, [sit[0] + 1.2, sit[1] + 2.4], [sit[0] + 0.6, sit[1] + 4.6]] as P[]).map(u), '#c8b88f', 2);
  line(g, hN.map(u), NEAR, 2.6);
  line(g, fN.map(u), NEAR, 2.6);
  for (const [name, pts] of [['HN', hN], ['HF', hF], ['FN', fN], ['FF', fF]] as const) if (hooves[name]) dot(g, u(pts[2]!), 2.2, name.endsWith('N') ? '#5fd06a' : '#2f8f3a');
}

const ticksOf = (c: MotionClip): number => TICKS[(Anim as unknown as Record<string, number>)[c.anim]!] ?? 0.5;

function figureCanvas(c: MotionClip, w: number, h: number): { cv: HTMLCanvasElement; draw: (fc: MotionFacing, t: number) => void } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const horse = c.body === 'horse';
  return {
    cv,
    draw(fc, t) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, h - 14, w, 1);
      const keys = c.facings[fc].keys;
      const mx = keys.reduce((a, k2) => a + k2.root[0]!, 0) / keys.length;
      const o: P = [w / 2 - mx * S, h - 14];
      const k = sample(c, fc, t);
      if (horse) drawHorse(g, c, k, fc, o);
      else drawMan(g, c, k, fc, o);
      g.fillStyle = '#d9d2bf';
      g.font = '10px monospace';
      g.fillText(`${fc.toUpperCase()} ${Math.floor(t)}`, 4, 11);
    },
  };
}

let tick = (): void => {};

function render(): void {
  const out = document.getElementById('out')!;
  const clips = Object.values(MOTION).filter((c) => !ONLY || ONLY.includes(c.name));
  document.getElementById('info')!.innerHTML =
    `<b>Motion reference</b>: ${clips.length} clips from CMU mocap and Muybridge, projected into the SE and NE facings. ` +
    `Gold = near (weapon) limbs, grey = far. Green dots: planted feet. Red: strike or release. ` +
    `<a href="?film=0">players only</a> · sources in docs/art-references/motion-reference.md`;
  const players: { c: MotionClip; se: ReturnType<typeof figureCanvas>; ne: ReturnType<typeof figureCanvas>; ref?: { g: CanvasRenderingContext2D; img: HTMLImageElement; cells: number; cycle: number; w: number; h: number } }[] = [];
  for (const c of clips) {
    const horse = c.body === 'horse';
    const W = Math.round((horse ? 26 : 20) * S), H = Math.round((horse ? 23 : 19) * S);
    const box = document.createElement('section');
    box.className = 'clip';
    const meta = c.meta as Record<string, string>;
    box.innerHTML = `<h2>${c.name} <span class="cap">(${c.anim}, ${c.frames} frames${c.loop ? ', loop' : ''}, ${c.facings.se.keys.length} keys; events ${c.events.map((e) => `${e.name}@${e.f}`).join(' ') || 'none'})</span></h2><div class="meta">${meta.source ?? ''}. ${meta.why ?? ''}</div>`;
    const row = document.createElement('div');
    row.className = 'row';
    const se = figureCanvas(c, W, H), ne = figureCanvas(c, W, H);
    row.append(se.cv, ne.cv);
    const r = REF[c.name];
    let ref: (typeof players)[number]['ref'];
    if (r) {
      const img = new Image();
      img.src = `./motion-ref/${r.file}`;
      const rc = document.createElement('canvas');
      rc.height = H;
      rc.width = Math.round(H * 0.9);
      const wrap = document.createElement('div');
      wrap.append(rc);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = r.note;
      wrap.append(cap);
      row.append(wrap);
      ref = { g: rc.getContext('2d')!, img, cells: r.cells, cycle: r.cycle ?? r.cells, w: rc.width, h: H };
      img.onload = () => FREEZE !== null && tick();
    }
    box.append(row);
    if (FILM) {
      for (const fc of ['se', 'ne'] as const) {
        const film = document.createElement('div');
        film.className = 'row film';
        for (let f = 0; f < c.frames; f++) {
          const cell = figureCanvas(c, Math.round(W * 0.62), H);
          cell.draw(fc, f);
          film.append(cell.cv);
        }
        box.append(film);
      }
      if (r) {
        for (const file of [r.file, ...(r.more ?? [])]) {
          const im = document.createElement('img');
          im.className = 'ref';
          im.src = `./motion-ref/${file}`;
          box.append(im);
        }
      }
    }
    out.append(box);
    players.push({ c, se, ne, ref });
  }
  const t0 = performance.now();
  tick = (): void => {
    const now = performance.now() - t0;
    for (const p of players) {
      const frameMs = ticksOf(p.c) * 100;
      const total = p.c.frames;
      let t = FREEZE ?? (now / frameMs) % (p.c.loop ? total : total + 4);
      if (!p.c.loop) t = Math.min(t, total - 1);
      p.se.draw('se', t);
      p.ne.draw('ne', t);
      if (p.ref && p.ref.img.complete && p.ref.img.naturalWidth) {
        const cw = p.ref.img.naturalWidth / p.ref.cells;
        const loopMs = frameMs * total;
        const i = FREEZE !== null ? Math.round((FREEZE / total) * p.ref.cycle) % p.ref.cells : Math.floor(((now % loopMs) / loopMs) * p.ref.cycle) % p.ref.cells;
        const g = p.ref.g;
        g.clearRect(0, 0, p.ref.w, p.ref.h);
        const sc = Math.min(p.ref.w / cw, p.ref.h / p.ref.img.naturalHeight);
        g.drawImage(p.ref.img, i * cw, 0, cw, p.ref.img.naturalHeight, (p.ref.w - cw * sc) / 2, p.ref.h - p.ref.img.naturalHeight * sc, cw * sc, p.ref.img.naturalHeight * sc);
      }
    }
    if (FREEZE === null) requestAnimationFrame(tick);
  };
  tick();
}

render();
