// Contact sheets of the combat-ready guard and every melee blow, per kind: for each blow an SE row
// and an NE row, each `Guard 0 | Guard 4 | Attack 0..11 | Guard 0` (a grey bar between the
// guard and the blow), so a reader sees the blow leave the guard and come back to it. Idle 0 is
// the first cell of the top row for comparison.
//
//   pnpm tsx scripts/guard-sheets.ts --factions=templar --kinds=0,1 --level=4 --scale=2 --out=docs/screenshots/anim-weapons/guard

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Painters, FACTION_IDS, type Faction } from './pixel-lint/painters.ts';
import { encodePng } from './pixel-lint/png.ts';
import type { Frame, Img } from './pixel-lint/metrics.ts';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const factions = arg('factions', FACTION_IDS.join(',')).split(',') as Faction[];
const kinds = arg('kinds', '0,1,2,3,4,5,6,7,8,10').split(',').map(Number);
const level = Number(arg('level', '4'));
const scale = Number(arg('scale', '2'));
const out = arg('out', 'docs/screenshots/anim-weapons/guard');
const tag = arg('tag', '');

const A = { Idle: 0, Attack: 3, Brace: 8 };
const BG: [number, number, number] = [92, 104, 78];
const BAR: [number, number, number] = [150, 150, 150];

const p = await Painters.load(process.cwd());
mkdirSync(out, { recursive: true });
for (const faction of factions)
  for (const kind of kinds) {
    let blows: number;
    try {
      blows = p.blows('hd', faction, kind);
    } catch {
      continue;
    }
    const cell = (anim: number, fr: number, dir: number): Frame => p.frame('hd', faction, kind, level, anim, fr, dir);
    const rows: (Frame | null)[][] = [];
    for (let b = 0; b < blows; b++)
      for (const dir of [0, 3]) {
        const r: (Frame | null)[] = [b === 0 && dir === 0 ? cell(A.Idle, 0, dir) : null, cell(A.Brace, 0, dir), cell(A.Brace, 4, dir), null];
        for (let f = 0; f < 12; f++) r.push(cell(A.Attack, b * 12 + f, dir));
        r.push(null, cell(A.Brace, 0, dir));
        rows.push(r);
      }
    // A common cell: the widest extents round the foot point.
    let l = 0, rt = 0, up = 0, dn = 0;
    for (const r of rows)
      for (const c of r)
        if (c) {
          l = Math.max(l, c.ax);
          rt = Math.max(rt, c.m.w - c.ax);
          up = Math.max(up, c.ay);
          dn = Math.max(dn, c.m.h - c.ay);
        }
    const cw = l + rt, ch = up + dn, bar = 3;
    const cols = rows[0]!.length;
    const colW = (i: number) => (rows[0]![i] === null && i === 3 ? bar : rows.some((r) => r[i]) ? cw : bar);
    const W = Array.from({ length: cols }, (_, i) => colW(i)).reduce((a, b) => a + b, 0);
    const H = rows.length * ch;
    const img: Img = { w: W * scale, h: H * scale, d: new Uint8ClampedArray(W * scale * H * scale * 4) };
    const put = (x: number, y: number, c: [number, number, number, number]) => {
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * img.w + x * scale + dx) * 4;
          img.d[i] = c[0];
          img.d[i + 1] = c[1];
          img.d[i + 2] = c[2];
          img.d[i + 3] = c[3];
        }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [...BG, 255]);
    rows.forEach((r, ri) => {
      let x0 = 0;
      r.forEach((c, ci) => {
        const w = colW(ci);
        if (w === bar) for (let y = 0; y < ch; y++) for (let x = 0; x < w; x++) put(x0 + x, ri * ch + y, [...BAR, 255]);
        if (c)
          for (let y = 0; y < c.m.h; y++)
            for (let x = 0; x < c.m.w; x++) {
              const i = (y * c.m.w + x) * 4;
              if (c.m.d[i + 3]! < 128) continue;
              put(x0 + l - c.ax + x, ri * ch + up - c.ay + y, [c.m.d[i]!, c.m.d[i + 1]!, c.m.d[i + 2]!, 255]);
            }
        x0 += w;
      });
      // A dark line under each SE/NE pair.
      if (ri % 2 === 1) for (let x = 0; x < W; x++) put(x, ri * ch + ch - 1, [40, 40, 40, 255]);
    });
    const file = join(out, `${faction[0]}-k${kind}-guard-blows${tag ? `-${tag}` : ''}.png`);
    writeFileSync(file, encodePng(img));
    console.log(file, `${blows} blow(s)`);
  }
await p.close();
