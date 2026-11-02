// Times the HD sprite painter: kinds of a faction at each detail level, as the workers paint them.
//   pnpm tsx scripts/sprite-bench.ts [faction] [levels, e.g. 1,2,4,8] [kinds, e.g. 0,7]
import { paintSheet } from '../src/client/render/sprites128.ts';

const faction = process.argv[2] ?? 'templar';
const levels = (process.argv[3] ?? '2,4,8').split(',').map(Number);
const kinds = (process.argv[4] ?? '0,1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
for (const lv of levels) {
  let total = 0;
  let bytes = 0;
  const per: string[] = [];
  for (const k of kinds) {
    const t0 = performance.now();
    const s = paintSheet(faction, 215, k, lv);
    const ms = performance.now() - t0;
    total += ms;
    bytes += s.width * s.height * 4;
    per.push(`${k}:${Math.round(ms)}ms ${s.width}x${s.height}`);
  }
  console.log(`${faction} level ${lv}: ${Math.round(total)} ms for ${kinds.length} kinds, ${(bytes / 1048576).toFixed(1)} MB of pages\n  ${per.join('  ')}`);
}
