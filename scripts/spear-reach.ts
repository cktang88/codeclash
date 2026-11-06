// How far the drawn spear's point reaches ahead of the man, against the sim's reach (battle v17).
//   npx tsx scripts/spear-reach.ts [--level=4]
// For each faction's spearmen and shock foot, in the SE facing: the forward extent (rightmost
// opaque pixel past the foot point, in units: a man is 14 tall) of the guard (Brace) frames and of
// each blow's Attack frames (the furthest frame), and what the sim needs: the point among the foe
// standing off at `REACH.stand` (his front `rad + rad + reach * stand - rad`) and, at the thrust,
// his body at full reach (`rad + rad + reach - rad`).
import { Painters, type Faction } from './pixel-lint/painters.ts';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const level = Number(arg('level', '4'));
const A = { Idle: 0, Attack: 3, Brace: 8 };
const RAD = 2.3;
const REACH: Record<string, Record<number, number>> = { templar: { 1: 16, 8: 4 }, samurai: { 1: 19.5, 8: 9 }, undead: { 1: 13, 8: 4 } };

const p = await Painters.load(process.cwd());
/** Forward extent of the frame in units, and the height of that point above the feet (units). */
let tipH = 0;
const fwd = (f: { m: { w: number; h: number; d: Uint8ClampedArray }; ax: number; ay: number }) => {
  let best = -99;
  for (let y = 0; y < f.m.h; y++)
    for (let x = 0; x < f.m.w; x++)
      if (f.m.d[(y * f.m.w + x) * 4 + 3]! > 0 && x - f.ax > best) {
        best = x - f.ax;
        tipH = (f.ay - y) / level;
      }
  return best / level;
};
console.log('kind               guard (min-max) | attack max per blow     | sim: foe front at stand / body at full reach');
for (const faction of ['templar', 'samurai', 'undead'] as Faction[])
  for (const kind of [1, 8]) {
    const g: number[] = [];
    const gh: number[] = [];
    for (let fr = 0; fr < 8; fr++) {
      try {
        g.push(fwd(p.frame('hd', faction, kind, level, A.Brace, fr, 0)));
        gh.push(tipH);
      } catch {
        break;
      }
    }
    const blows = p.blows('hd', faction, kind);
    const att: string[] = [];
    for (let b = 0; b < blows; b++) {
      let m = -99, at = 0, h = 0;
      for (let f = 0; f < 12; f++) {
        const v = fwd(p.frame('hd', faction, kind, level, A.Attack, b * 12 + f, 0));
        if (v > m) (m = v), (at = f), (h = tipH);
      }
      att.push(`${m.toFixed(1)}@${at} h${h.toFixed(0)}`);
    }
    const r = REACH[faction]![kind]!;
    console.log(`${faction.padEnd(8)} ${String(kind).padEnd(9)} ${Math.min(...g).toFixed(1)}-${Math.max(...g).toFixed(1)} h${Math.min(...gh).toFixed(0)}-${Math.max(...gh).toFixed(0)} | ${att.join(' ').padEnd(36)} | ${(RAD + r * 0.75).toFixed(1)} / ${(RAD + r).toFixed(1)}`);
  }
await p.close();
