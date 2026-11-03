// Hashes every HD sheet the painter makes (and times the paint), so a change to the painter's
// plumbing can be checked to leave every pixel as it was.
//   pnpm tsx scripts/sheet-hashes.ts [out.json] [levels, e.g. 1,2,4,8] [hues, e.g. 215,30] [factions]
// Level 8 also hashes its HD 64 halving (the level-4 `half` sheet), from the same paint.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sheetFor } from '../src/client/render/sprites128.ts';
import { halveSheet } from '../src/client/render/downscale.ts';
import type { KindSheet } from '../src/client/render/contract.ts';

const out = process.argv[2] ?? 'sheet-hashes.json';
const levels = (process.argv[3] ?? '1,2,4,8').split(',').map(Number);
const hues = (process.argv[4] ?? '215').split(',').map(Number);
const factions = (process.argv[5] ?? 'templar,samurai,undead').split(',');
const hashOf = (s: KindSheet): string =>
  createHash('sha256')
    .update(`${s.level} ${s.width}x${s.height}|`)
    .update(new Uint8Array(s.pixels.buffer, s.pixels.byteOffset, s.pixels.byteLength))
    .update(new Uint8Array(s.rects.buffer, s.rects.byteOffset, s.rects.byteLength))
    .digest('hex')
    .slice(0, 24);
const res: Record<string, { hash: string; ms: number; bytes: number }> = {};
for (const hue of hues)
  for (const f of factions)
    for (const lv of levels)
      for (let k = 0; k <= 10; k++) {
        const t0 = performance.now();
        const s = sheetFor(f, hue, k, lv);
        const ms = Math.round(performance.now() - t0);
        res[`${f}:${hue}:${k}:${lv}`] = { hash: hashOf(s), ms, bytes: s.pixels.byteLength };
        if (lv === 8) {
          const t1 = performance.now();
          const h = halveSheet(s);
          res[`${f}:${hue}:${k}:4h`] = { hash: hashOf(h), ms: Math.round(performance.now() - t1), bytes: h.pixels.byteLength };
        }
        console.log(f, hue, k, lv, ms, 'ms', (s.pixels.byteLength / 1048576).toFixed(1), 'MB');
      }
writeFileSync(out, JSON.stringify(res, null, 1));
