// Contact sheets of any animations, per kind: one row per animation and drawn facing (SE, NE),
// every frame of it, so a reader sees a whole fall, flinch or block at a glance.
//
//   pnpm tsx scripts/anim-sheets.ts --factions=templar --kinds=0,1 --anims=5,6,7 --level=4 --scale=2 --out=docs/screenshots/anim2 --tag=r1

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Painters, FACTION_IDS, type Faction } from './pixel-lint/painters.ts';
import { encodePng } from './pixel-lint/png.ts';
import type { Frame, Img } from './pixel-lint/metrics.ts';
import { FRAMES } from '../src/client/render/frames.ts';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const factions = arg('factions', FACTION_IDS.join(',')).split(',') as Faction[];
const kinds = arg('kinds', '0,1,2,3,4,5,6,7,8,10').split(',').map(Number);
const anims = arg('anims', '5,6,7').split(',').map(Number);
const dirs = arg('dirs', '0,3').split(',').map(Number);
const level = Number(arg('level', '4'));
const scale = Number(arg('scale', '2'));
const out = arg('out', 'docs/screenshots/anim2');
const tag = arg('tag', '');
const BG: [number, number, number] = [92, 104, 78];

const p = await Painters.load(process.cwd());
mkdirSync(out, { recursive: true });
for (const faction of factions)
  for (const kind of kinds) {
    const rows: Frame[][] = [];
    try {
      for (const a of anims)
        for (const dir of dirs) rows.push(Array.from({ length: FRAMES[a as 0]! }, (_, f) => p.frame('hd', faction, kind, level, a, f, dir)));
    } catch {
      continue;
    }
    let l = 0, rt = 0, up = 0, dn = 0;
    for (const r of rows)
      for (const c of r) {
        l = Math.max(l, c.ax);
        rt = Math.max(rt, c.m.w - c.ax);
        up = Math.max(up, c.ay);
        dn = Math.max(dn, c.m.h - c.ay);
      }
    const cw = l + rt + 2, ch = up + dn + 2;
    const cols = Math.max(...rows.map((r) => r.length));
    const W = cols * cw, H = rows.length * ch;
    const img: Img = { w: W * scale, h: H * scale, d: new Uint8ClampedArray(W * scale * H * scale * 4) };
    const put = (x: number, y: number, c: readonly number[]) => {
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * img.w + x * scale + dx) * 4;
          img.d[i] = c[0]!;
          img.d[i + 1] = c[1]!;
          img.d[i + 2] = c[2]!;
          img.d[i + 3] = 255;
        }
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, (Math.floor(x / cw) + Math.floor(y / ch)) % 2 ? BG : [86, 98, 72]);
    rows.forEach((r, ri) =>
      r.forEach((c, ci) => {
        for (let y = 0; y < c.m.h; y++)
          for (let x = 0; x < c.m.w; x++) {
            const i = (y * c.m.w + x) * 4;
            if (c.m.d[i + 3]! < 128) continue;
            put(ci * cw + 1 + l - c.ax + x, ri * ch + 1 + up - c.ay + y, [c.m.d[i]!, c.m.d[i + 1]!, c.m.d[i + 2]!]);
          }
        // The foot point.
        put(ci * cw + 1 + l, ri * ch + 1 + up, [255, 0, 255]);
      }),
    );
    const file = join(out, `${faction[0]}-k${kind}-a${anims.join('')}${tag ? `-${tag}` : ''}.png`);
    writeFileSync(file, encodePng(img));
    console.log(file);
  }
await p.close();
