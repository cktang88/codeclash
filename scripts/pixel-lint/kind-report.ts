// One kind's checks from a pixel-lint run, failures and warnings first:
//   pnpm tsx scripts/pixel-lint/kind-report.ts <out-dir>/pixel-lint.json <faction> <kind>
// Faction agents run this after `pnpm pixel-lint --only=sprites --factions=<faction>` to see
// what their figure still misses (see src/client/render/paper/README.md, "Lint gate").

import { readFileSync } from 'node:fs';
import { SPRITE_CHECKS, status } from './report.ts';
import type { SpriteResult } from './sprite-audit.ts';

const [file, faction, kindArg] = process.argv.slice(2);
if (!file || !faction || kindArg === undefined) {
  console.error('usage: kind-report.ts <pixel-lint.json> <faction> <kind>');
  process.exit(2);
}
const rep = JSON.parse(readFileSync(file, 'utf8')) as { sprites: SpriteResult[]; silhouettes: { art: string; faction: string; pairs: { a: string; b: string; iou: number; best: number }[] }[] };
const kind = Number(kindArg);
let fails = 0;
for (const r of rep.sprites.filter((x) => x.art === 'hd' && x.faction === faction && x.kind === kind)) {
  const rows = SPRITE_CHECKS.map((c) => ({ c, s: status(c, r), v: c.value(r) })).filter((x) => x.s === 'fail' || x.s === 'warn');
  fails += rows.filter((x) => x.s === 'fail').length;
  console.log(`L${r.level} ${r.name}${(r.blows?.length ?? 1) > 1 ? ` (${r.blows.length} blows)` : ''}: ${rows.length ? rows.map((x) => `${x.s === 'fail' ? 'FAIL' : 'warn'} ${x.c.id}=${+x.v.toFixed(3)}`).join(', ') : 'all pass'}`);
}
const sil = rep.silhouettes.find((s) => s.art === 'hd' && s.faction === faction);
const name = rep.sprites.find((x) => x.art === 'hd' && x.faction === faction && x.kind === kind)?.name;
if (sil && name) {
  const worst = sil.pairs.filter((p) => p.a === name || p.b === name).sort((p, q) => q.best - p.best)[0];
  if (worst) console.log(`level-1 silhouette: closest ${worst.a === name ? worst.b : worst.a} ${worst.best.toFixed(2)} (gate < 0.85)${worst.best >= 0.85 ? ' FAIL' : ''}`);
  if (worst && worst.best >= 0.85) fails++;
}
process.exitCode = fails ? 1 : 0;
