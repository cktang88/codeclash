// Times the HD sprite painter: kinds of each faction at each detail level, as the workers paint them.
//   pnpm tsx scripts/sprite-bench.ts [factions, e.g. templar,undead] [levels, e.g. 2,4,8] [kinds, e.g. 0,7] [--warm] [--json=out.json]
//
// Per faction, as one worker meets it:
//   rig    the first level-1 frame of each kind: its lazy rig is built (for a faction with one
//          shared palette, the first kind builds every kind's rig while sampling the palette)
//   cold   the first paintSheet of that (kind, level): clip bakes, part images and the level's
//          palette sampling included, as a fresh worker pays them
//   warm   (--warm) the same sheet painted again with every cache hot: the per-frame cost alone
// Frames are counted from the sheet's rects, so the per-frame cost is printed too. Times are the
// process's CPU time (user + system), which a busy machine disturbs far less than the wall clock;
// --wall times by the clock instead.
// Profile with: node --import tsx --cpu-prof --cpu-prof-dir=/tmp/prof scripts/sprite-bench.ts ...
import { writeFileSync } from 'node:fs';
import { paintSheet } from '../src/client/render/sprites128.ts';
import { Paper, paintPaper } from '../src/client/render/paper/index.ts';
import { Anim } from '../src/client/render/contract.ts';
import { lazyRigsBuilt } from '../src/client/render/paper/skeleton.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const factions = (args[0] ?? 'templar,samurai,undead').split(',');
const levels = (args[1] ?? '2,4,8').split(',').map(Number);
const kinds = (args[2] ?? '0,1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const warm = flags.includes('--warm');
const jsonOut = flags.find((f) => f.startsWith('--json='))?.slice(7);
const HUE = 215;
const wall = flags.includes('--wall');
const clock = (): number => {
  if (wall) return performance.now();
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

interface Level {
  cold: number;
  warm?: number;
  frames: number;
}
interface Row {
  faction: string;
  kind: number;
  rig: number;
  rigsBuilt: number;
  lv: Record<number, Level>;
}
const rows: Row[] = [];
const r = (v: number) => Math.round(v);
const cell = (x: Level) => `${r(x.cold)}${warm ? `/${r(x.warm!)}` : ''}`;
for (const faction of factions)
  for (const k of kinds) {
    const before = lazyRigsBuilt();
    const t0 = clock();
    paintPaper(faction, k, 1, Anim.Idle, 0, 0, HUE, new Paper());
    const row: Row = { faction, kind: k, rig: clock() - t0, rigsBuilt: lazyRigsBuilt() - before, lv: {} };
    rows.push(row);
    for (const lv of levels) {
      const t1 = clock();
      const s = paintSheet(faction, HUE, k, lv);
      const x: Level = { cold: clock() - t1, frames: 0 };
      for (let i = 2; i < s.rects.length; i += 6) if (s.rects[i]! > 0) x.frames++;
      if (warm) {
        const t2 = clock();
        paintSheet(faction, HUE, k, lv);
        x.warm = clock() - t2;
      }
      row.lv[lv] = x;
    }
    const lvs = levels.map((lv) => {
      const x = row.lv[lv]!;
      return `L${lv} ${cell(x).padStart(11)}ms (${x.frames}f ${((x.warm ?? x.cold) / x.frames).toFixed(2)}ms/f)`;
    });
    console.log(`${faction.padEnd(8)}${String(k).padStart(3)}  rig ${String(r(row.rig)).padStart(5)}ms (${row.rigsBuilt} built)  ${lvs.join('  ')}`);
  }
console.log(`\ntotals, ${wall ? 'wall' : 'CPU'} ms (cold${warm ? '/warm' : ''})`);
const total = (rs: Row[], lv: number, f: (x: Level) => number) => r(rs.reduce((s, x) => s + f(x.lv[lv]!), 0));
for (const g of [...factions, 'all']) {
  const rs = g === 'all' ? rows : rows.filter((x) => x.faction === g);
  const parts = levels.map((lv) => `L${lv} ${total(rs, lv, (x) => x.cold)}${warm ? `/${total(rs, lv, (x) => x.warm!)}` : ''}`);
  const sheets = levels.reduce((s, lv) => s + total(rs, lv, (x) => x.cold), 0);
  console.log(`${g.padEnd(8)} rig ${r(rs.reduce((s, x) => s + x.rig, 0))}  ${parts.join('  ')}  sheets ${sheets}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
