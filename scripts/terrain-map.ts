// ASCII map of a battle's ground (debug): npx tsx scripts/terrain-map.ts [seed] [step=48]
// . open  , soft  = ford  T wood  ~ water; digits are height / 10 on open ground above 15.
import { Terrain } from '../src/game/terrain.ts';
import { FIELD_H, FIELD_W } from '../src/game/battle.ts';

const seed = Number(process.argv[2] ?? 1);
const step = Number(process.argv[3] ?? 48);
const t0 = performance.now();
const t = new Terrain('field', FIELD_W, FIELD_H, seed);
const ms = performance.now() - t0;
let maxH = 0;
let maxG = 0;
for (let i = 0; i < t.height.length; i++) {
  maxH = Math.max(maxH, t.height[i]!);
  maxG = Math.max(maxG, Math.hypot(t.slopeX[i]!, t.slopeY[i]!));
}
console.log(`seed ${seed}: ${t.hills.length} hills, ${t.woods.length} woods, ${t.soft.length} soft, stream ${t.stream ? `${t.stream.fords.length} fords` : 'none'}; max height ${maxH.toFixed(0)}, max grade ${maxG.toFixed(2)}; built in ${ms.toFixed(1)} ms`);
for (let y = step / 2; y < FIELD_H; y += step) {
  let line = '';
  for (let x = step / 4; x < FIELD_W; x += step / 2) {
    const g = t.groundAt(x, y);
    const h = t.heightAt(x, y);
    line += g === 4 ? '~' : g === 3 ? 'T' : g === 2 ? '=' : g === 1 ? ',' : h > 15 ? String(Math.min(9, Math.floor(h / 10))) : '.';
  }
  console.log(line);
}
