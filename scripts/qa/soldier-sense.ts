// QA round 3: per-soldier sense in small set pieces. Each set piece is a few blocks placed by hand
// (src/game/testing.ts); every other tick each man still fighting is checked for things a real man
// would not do:
//   idle-hand   no foe of his own while an enemy (not running) stands within striking distance
//               of him (body to body + his reach + 2), and no friend between them;
//   idle-near   no foe, standing (under 3 u/s) for 2 s+ with an enemy within 25 u and no friend
//               between them: a man at the edge of a fight with nothing to do;
//   lone-in     no friend within 20 u, 3+ enemies within 30 u, walking toward them;
//   through     centre within 0.6 of the two radii of a friend of another block (walking through him);
//   osc         reversals of his heading (a turn of 135 degrees+, both legs over 5 u/s) per man-minute;
//   lost        no foe, 50 u+ from his place in the block (not swinging round a flank), no enemy
//               within 40 u, not walking back to it.
// Men in skirmish or withdraw mode, wounded men going to the rear (wd), and fugitives are not
// counted. Prints per-set-piece totals (man-seconds), and with --worst the worst men.
//   npx tsx scripts/qa/soldier-sense.ts [--pieces clash,edge,...] [--seeds 1-3] [--worst] [--ticks 600]
import { Battle, BATTLE_VERSION, State, type Regiment } from '../../src/game/battle.ts';
import { U, UNIT_COUNT } from '../../src/game/units.ts';
import { placeRegiment, plainArmy } from '../../src/game/testing.ts';
import type { FactionId } from '../../src/game/factions.ts';

const arg = (n: string, dflt: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : dflt; };
const WORST = process.argv.includes('--worst');
const [sa, sb] = arg('seeds', '1-3').split('-').map(Number);
const TICKS = Number(arg('ticks', '0'));
const TRACE = Number(arg('trace', '-1'));

interface Group { place(b: Battle, x: number, y: number, fx: number, fy: number): void; regs: Regiment[]; members(): number[] }
type Side = [cls: number, men: number][];
interface Piece {
  name: string;
  a: Side; b: Side;
  fa?: FactionId; fb?: FactionId;
  ticks: number;
  /** Places the blocks: regs of team 0 then team 1, in the order given. */
  place(b: Battle, A: Group[], B: Group[]): void;
  holdA?: boolean; holdB?: boolean;
  /** Called once at `at` (e.g. kill men to leave survivors). */
  at?: number; event?(b: Battle, A: Group[], B: Group[]): void;
}
const C = 1200;
const PIECES: Piece[] = [
  { name: 'clash', a: [[U.HeavyInfantry, 48]], b: [[U.HeavyInfantry, 48]], ticks: 700,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  { name: 'spears', a: [[U.Spearmen, 60]], b: [[U.HeavyInfantry, 48]], fb: 'samurai', ticks: 700,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  { name: 'spearwall', a: [[U.Spearmen, 48]], b: [[U.Spearmen, 48]], fb: 'samurai', ticks: 900,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  // A wide block against a narrow one: its outer files have nobody before them.
  { name: 'edge', a: [[U.HeavyInfantry, 90]], b: [[U.HeavyInfantry, 36]], fb: 'samurai', ticks: 600,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  // Two blocks in a fight; a third comes on the rear of one.
  { name: 'rear', a: [[U.HeavyInfantry, 48]], b: [[U.HeavyInfantry, 48], [U.Spearmen, 36]], ticks: 600, holdB: false,
    place: (b, A, B) => { A[0]!.place(b, C - 30, C, 1, 0); B[0]!.place(b, C + 30, C, -1, 0); B[1]!.place(b, C - 200, C, 1, 0); } },
  // A second line behind the first.
  { name: 'reserve', a: [[U.HeavyInfantry, 40], [U.Spearmen, 40]], b: [[U.HeavyInfantry, 60]], fb: 'samurai', ticks: 700,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); A[1]!.place(b, C - 120, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  // Skirmishers caught by heavy foot coming on.
  { name: 'skirm', a: [[U.Skirmishers, 30]], b: [[U.HeavyInfantry, 48]], ticks: 500,
    place: (b, A, B) => { A[0]!.place(b, C - 60, C, 1, 0); B[0]!.place(b, C + 60, C, -1, 0); } },
  // Archers against foot (shooters caught hand to hand).
  { name: 'archers', a: [[U.Archers, 40]], b: [[U.HeavyInfantry, 40]], fb: 'samurai', ticks: 600,
    place: (b, A, B) => { A[0]!.place(b, C - 120, C, 1, 0); B[0]!.place(b, C + 120, C, -1, 0); } },
  // Rout and pursuit: a small block against a big one.
  { name: 'rout', a: [[U.HeavyInfantry, 80]], b: [[U.Spearmen, 24]], fb: 'samurai', ticks: 600,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); } },
  // Survivors: two thirds of a block cut down at once, a few men left scattered.
  { name: 'survivors', a: [[U.HeavyInfantry, 48], [U.Spearmen, 30]], b: [[U.HeavyInfantry, 60]], fb: 'samurai', ticks: 600, at: 150,
    place: (b, A, B) => { A[0]!.place(b, C - 40, C - 40, 1, 0); A[1]!.place(b, C - 40, C + 60, 1, 0); B[0]!.place(b, C + 40, C, -1, 0); },
    event: (b, A) => { const ms = A[0]!.members().filter((i) => b.soldiers[i]!.state === State.Fighting); ms.forEach((i, k) => { if (k % 4 !== 0) b.kill(i); }); } },
];

const piecesWanted = arg('pieces', PIECES.map((p) => p.name).join(',')).split(',');
interface Tally { fireIdle: number; besideIdle: number; handLong: number; handLongS: number; struckIdle: number; idleHand: number; idleNear: number; loneIn: number; through: number; rev: number; lost: number; manS: number; streaks: number }
const blank = (): Tally => ({ fireIdle: 0, besideIdle: 0, handLong: 0, handLongS: 0, struckIdle: 0, idleHand: 0, idleNear: 0, loneIn: 0, through: 0, rev: 0, lost: 0, manS: 0, streaks: 0 });

function counts(side: Side): number[] {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of side) k[c]! += n;
  return k;
}


interface Worst { seed: number; i: number; what: string; t0: number; t1: number; note: string }
/** Runs `b` to `T` ticks (calling `hook` before each step) and adds what its men did to `tot`. */
function measure(b: Battle, seed: number, T: number, tot: Tally, byMode: Record<string, number>, worst: Worst[], hook?: (b: Battle) => void): void {
  const d = (b as any).d;
  const n = b.soldiers.length;
  const streak = new Int32Array(n);
  const streakFrom = new Int32Array(n).fill(-1);
  const handRun = new Int32Array(n);
  const hx = new Float64Array(n);
  const hy = new Float64Array(n);
  const CS = 20, GWc = 120;
  const cells = new Map<number, number[]>();
  const add = (k: string, v: number) => { byMode[k] = (byMode[k] ?? 0) + v; };
  while (!b.done() && b.tick < T) {
    hook?.(b);
    b.step();
    if (TRACE >= 0 && b.tick % 10 === 0 && seed === sa) {
      const i = TRACE, r = b.regiments[d.reg[i]]!, t = d.target[i];
      const regs = b.regiments.filter((q) => q.alive > 0).map((q) => `${q.id}:${q.mode}${q.engaged ? '*' : ''}/${q.alive}@${q.ax.toFixed(0)},${q.ay.toFixed(0)}`).join(' ');
      console.log(`t${b.tick} man ${i} st ${d.state[i]} reg ${r.id} ${r.mode}/${r.order} p ${d.x[i].toFixed(0)},${d.y[i].toFixed(0)} v ${d.vx[i].toFixed(0)},${d.vy[i].toFixed(0)} tgt ${t}${t >= 0 ? `@${d.x[t].toFixed(0)},${d.y[t].toFixed(0)}` : ''} cu ${d.cu[i]} row ${d.row[i]} sx ${d.sx[i].toFixed(0)} hp ${d.hp[i].toFixed(0)} | ${regs}`);
    }
    if (b.tick % 2) continue;
    cells.clear();
    for (let j = 0; j < n; j++) {
      if (d.state[j] !== State.Fighting) continue;
      const k = Math.floor(d.y[j] / CS) * GWc + Math.floor(d.x[j] / CS);
      let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(j);
    }
    const S = b.soldiers;
    const nb: number[] = [];
    if (b.tick % 10 === 0) {
      for (const r of b.regiments) {
        if (r.alive === 0 || r.routed || r.role === 'command' || r.role === 'siege') continue;
        const foot = r.role === 'line' || r.role === 'missile' || r.role === 'skirmish';
        // Standing under arrows doing nothing: not in a fight, not shooting, not moving.
        if (r.arrows > 1 && !r.engaged && !(r.role === 'missile' && r.mode === 'shoot') && r.vax === 0 && r.vay === 0) {
          tot.fireIdle += r.alive; add(`fire ${r.role}/${r.mode}/${r.order}`, r.alive);
          if (WORST && b.tick % 50 === 0) worst.push({ seed, i: r.id, what: 'under-fire', t0: b.tick, t1: b.tick, note: `reg ${r.id} ${r.role}/${r.mode}/${r.order} line ${r.line} arrows ${r.arrows.toFixed(1)} alive ${r.alive} at ${r.cx.toFixed(0)},${r.cy.toFixed(0)}` });
        }
        // Idle beside a fight: a foot block of the line out of it, a friend fighting within 40 u
        // of its edge, an enemy block in that fight within 80 u of its edge.
        if (foot && r.role === 'line' && !r.engaged && !r.contact && r.vax === 0 && r.vay === 0) {
          const edge = (o: Regiment) => Math.hypot(o.cx - r.cx, o.cy - r.cy) - o.radius - r.radius;
          const friend = b.regiments.some((f) => f.team === r.team && f !== r && f.alive > 0 && !f.routed && f.engaged && edge(f) < 40);
          const foe = friend && b.regiments.some((e) => e.team !== r.team && e.alive > 0 && !e.routed && e.engaged && edge(e) < 80);
          if (foe) {
            tot.besideIdle += r.alive; add(`beside ${r.mode}/${r.order}${r.line === 2 && !r.committed ? '/2nd' : ''}`, r.alive);
            if (WORST && b.tick % 50 === 0) worst.push({ seed, i: r.id, what: 'beside-fight', t0: b.tick, t1: b.tick, note: `reg ${r.id} ${r.mode}/${r.order} line ${r.line} committed ${r.committed} alive ${r.alive} at ${r.cx.toFixed(0)},${r.cy.toFixed(0)} target ${r.targetReg}` });
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (d.state[i] !== State.Fighting) { streak[i] = 0; continue; }
      const r = b.regiments[d.reg[i]]!;
      if (r.mode === 'skirmish' || r.mode === 'withdraw' || r.routed || r.role === 'command') { streak[i] = 0; continue; }
      if (b.tick < d.wd[i]) { streak[i] = 0; continue; }
      tot.manS += 0.2;
      byMode['manS ' + S[i]!.s.role] = (byMode['manS ' + S[i]!.s.role] ?? 0) + 0.2;
      const x = d.x[i], y = d.y[i];
      const sp = Math.hypot(d.vx[i], d.vy[i]);
      nb.length = 0;
      const cx0 = Math.floor(x / CS), cy0 = Math.floor(y / CS);
      for (let cy = cy0 - 2; cy <= cy0 + 2; cy++) for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) { const c = cells.get(cy * GWc + cx); if (c) for (const j of c) if (j !== i) nb.push(j); }
      let fe = -1, fq = 1600, foes30 = 0, friend20 = false;
      for (const j of nb) {
        const q = (d.x[j] - x) ** 2 + (d.y[j] - y) ** 2;
        if (d.team[j] !== d.team[i]) {
          if (q < fq) { fq = q; fe = j; }
          if (q < 900) foes30++;
        } else {
          if (q < 400) friend20 = true;
          if (d.reg[j] !== d.reg[i] && q < (0.6 * (d.rad[i] + d.rad[j])) ** 2) tot.through += 0.1;
        }
      }
      const fd = fe >= 0 ? Math.sqrt(fq) : Infinity;
      const hasT = d.target[i] >= 0;
      const blocked = () => {
        if (fe < 0) return false;
        // Behind his own front rank (or file), as the sim's open() reads it: covered.
        if (d.row[fe] > 0 && !(b as any).open(x, y, fe)) return true;
        const ux = (d.x[fe] - x) / fd, uy = (d.y[fe] - y) / fd;
        for (const j of nb) {
          if (d.team[j] !== d.team[i]) continue;
          const ex = d.x[j] - x, ey = d.y[j] - y;
          const along = ex * ux + ey * uy;
          if (along <= 0 || along >= fd) continue;
          if (Math.abs(ex * -uy + ey * ux) < (d.rad[i] + d.rad[j]) * 0.75) return true;
        }
        return false;
      };
      const hand = d.rad[i] + (fe >= 0 ? d.rad[fe] : 0) + d.rc[i] + 2;
      const mk = `${S[i]!.s.role}/${r.mode}`;
      if (!hasT && fd <= hand && !blocked()) {
        tot.idleHand += 0.2; add('hand ' + mk, 0.2);
        handRun[i]!++;
        if (handRun[i] === 5) { tot.handLong++; if (WORST) worst.push({ seed, i, what: 'idle-hand 1s', t0: b.tick - 10, t1: b.tick, note: `cls ${S[i]!.cls}/${S[fe]!.cls} rc ${d.rc[i].toFixed(1)} ${mk} reg ${r.id} order ${r.order} row ${d.row[i]} sx ${d.sx[i].toFixed(0)} foe ${fe} (reg ${d.reg[fe]} ${b.regiments[d.reg[fe]]!.mode} st ${d.state[fe]} mt ${d.mt[fe]}) ${fd.toFixed(1)}u att ${d.att[fe]} contact ${r.contact} idl ${d.idl[i]} ps ${d.ps[i]} rose ${d.rose[i]} p ${x.toFixed(0)},${y.toFixed(0)}` }); }
        if (handRun[i]! >= 5) tot.handLongS += 0.2;
      } else handRun[i] = 0;
      if (!hasT && fd < 25 && sp < 3 && !blocked()) {
        streak[i]!++;
        if (streak[i]! === 10) { tot.streaks++; tot.idleNear += 2; add('near ' + mk, 2); streakFrom[i] = b.tick - 20; }
        else if (streak[i]! > 10) { tot.idleNear += 0.2; add('near ' + mk, 0.2); }
        if (streak[i]! >= 10 && WORST && streak[i]! % 25 === 0) worst.push({ seed, i, what: 'idle-near', t0: streakFrom[i]!, t1: b.tick, note: `${mk} reg ${r.id} order ${r.order} row ${d.row[i]} sx ${d.sx[i].toFixed(0)} foe ${fe} reg ${d.reg[fe]} ${fd.toFixed(0)}u att ${d.att[fe]} foeMode ${b.regiments[d.reg[fe]]!.mode} contact ${r.contact} engaged ${r.engaged} idl ${d.idl[i]}` });
      } else streak[i] = 0;
      if (!hasT && d.att[i] > 0) {
        let at = false;
        let by = -1;
        for (const j of nb) if (d.target[j] === i && Math.hypot(d.x[j] - x, d.y[j] - y) <= d.rad[i] + d.rad[j] + d.rc[j] + 2) { at = true; by = j; break; }
        if (at) {
          add(`struckBy byrow${Math.min(2, d.row[by])} open${(b as any).open(d.x[by], d.y[by], i) ? 1 : 0} row${Math.min(2, d.row[i])} me-rc${d.rc[i] >= 9 ? 'spear' : 'short'} by-rc${d.rc[by] >= 9 ? 'spear' : 'short'} ${b.regiments[d.reg[by]]!.cls === U.Knights || d.mt[by] ? 'horse' : ''}${d.mt[i] ? 'ME-HORSE' : ''} dist${Math.round(Math.hypot(d.x[by] - x, d.y[by] - y) / 5) * 5}`, 0.2);
          tot.struckIdle += 0.2; add('struck ' + mk, 0.2);
          if (WORST && b.tick % 10 === 0) worst.push({ seed, i, what: 'struck-idle', t0: b.tick, t1: b.tick, note: `${mk} reg ${r.id} row ${d.row[i]} sx ${d.sx[i].toFixed(0)} idl ${d.idl[i]} cu ${d.cu[i]} contact ${r.contact} stun ${d.stun[i]}` });
        }
      }
      if (!friend20 && foes30 >= 3 && sp > 5 && ((d.x[fe] - x) * d.vx[i] + (d.y[fe] - y) * d.vy[i]) > 0.5 * sp * fd && !S[i]!.s.mounted) {
        tot.loneIn += 0.2; add('lone ' + mk, 0.2);
        if (WORST && b.tick % 20 === 0) worst.push({ seed, i, what: 'lone-in', t0: b.tick, t1: b.tick, note: `${mk} reg ${r.id} foes30 ${foes30} hp ${d.hp[i].toFixed(0)} t ${d.target[i]} p ${x.toFixed(0)},${y.toFixed(0)}` });
      }
      if (b.tick % 10 === 0) {
        if (sp > 5) {
          const ph = Math.hypot(hx[i]!, hy[i]!);
          if (ph > 5 && (hx[i]! * d.vx[i] + hy[i]! * d.vy[i]) < -0.7 * ph * sp) { tot.rev++; add('rev ' + mk, 1); add('revR ' + S[i]!.s.role, 1); }
          hx[i] = d.vx[i]; hy[i] = d.vy[i];
        }
        // His place in the block.
        const gx = r.ax + r.fx * d.sy[i] - r.fy * d.sx[i], gy = r.ay + r.fy * d.sy[i] + r.fx * d.sx[i];
        const ad = Math.hypot(x - gx, y - gy);
        if (!hasT && !d.cu[i] && ad > 50 && fd > 40 && ((gx - x) * d.vx[i] + (gy - y) * d.vy[i]) < 0.5 * sp * ad) {
          tot.lost += 1; add('lost ' + mk, 1);
          if (WORST && b.tick % 50 === 0) worst.push({ seed, i, what: 'lost', t0: b.tick, t1: b.tick, note: `${mk} reg ${r.id} alive ${r.alive} at (${x.toFixed(0)},${y.toFixed(0)}) slot (${gx.toFixed(0)},${gy.toFixed(0)}) ${ad.toFixed(0)}u v ${d.vx[i].toFixed(0)},${d.vy[i].toFixed(0)} cu ${d.cu[i]} jn ${d.jn[i]} row ${d.row[i]}` });
        }
      }
    }
  }
}

function report(name: string, tot: Tally, byMode: Record<string, number>, worst: Worst[]): void {
  const per = (v: number) => `${v.toFixed(1)} (${((100 * v) / Math.max(1, tot.manS)).toFixed(2)}%)`;
  console.log(`${name.padEnd(10)} man-s ${tot.manS.toFixed(0)} | struck-idle ${per(tot.struckIdle)} | idle-hand ${per(tot.idleHand)}, 1 s+: ${tot.handLong} runs ${per(tot.handLongS)} | idle-near ${per(tot.idleNear)} in ${tot.streaks} streaks | lone-in ${per(tot.loneIn)} | through ${per(tot.through)} | heading reversals/man-min ${((tot.rev * 60) / Math.max(1, tot.manS)).toFixed(2)} | lost ${per(tot.lost)} | under fire idle ${per(tot.fireIdle)} | idle beside a fight ${per(tot.besideIdle)}`);
  const roles = Object.keys(byMode).filter((k) => k.startsWith('manS ')).map((k) => k.slice(5));
  console.log('           reversals/man-min by role: ' + roles.map((ro) => `${ro} ${(((byMode['revR ' + ro] ?? 0) * 60) / byMode['manS ' + ro]!).toFixed(2)}`).join(', '));
  console.log('           ' + Object.entries(byMode).filter(([k]) => !k.startsWith('manS ') && !k.startsWith('revR ') && !k.startsWith('struckBy') && !k.startsWith('fire ') && !k.startsWith('beside ')).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
  console.log('           ' + Object.entries(byMode).filter(([k]) => k.startsWith('struckBy')).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
  console.log('           ' + Object.entries(byMode).filter(([k]) => k.startsWith('fire ') || k.startsWith('beside ')).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
  if (WORST) for (const w of worst.sort((a, c) => (c.t1 - c.t0) - (a.t1 - a.t0)).slice(0, 12)) console.log(`   s${w.seed} man ${w.i} ${w.what} t${w.t0}-${w.t1} ${w.note}`);
}

const DEMO = arg('demo', '');
if (DEMO) {
  // Whole demo battles (a survey, not for iterating): --demo 450 with --seeds.
  const { demoSetup } = await import('../../src/client/demo.ts');
  for (let seed = sa!; seed <= (sb ?? sa!); seed++) {
    const tot = blank(); const byMode: Record<string, number> = {}; const worst: Worst[] = [];
    const b = new Battle(demoSetup(seed, Number(DEMO)));
    measure(b, seed, TICKS || 3600, tot, byMode, worst);
    report(`demo s${seed}`, tot, byMode, worst);
  }
  process.exit(0);
}

for (const p of PIECES.filter((q) => piecesWanted.includes(q.name))) {
  const tot = blank();
  const byMode: Record<string, number> = {};
  const worst: Worst[] = [];
  for (let seed = sa!; seed <= (sb ?? sa!); seed++) {
    const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts(p.a), 0, p.fa ?? 'templar'), plainArmy(counts(p.b), 200, p.fb ?? 'templar')] });
    const A = b.regiments.filter((r) => r.team === 0);
    const B = b.regiments.filter((r) => r.team === 1);
    // Every block of a class is one entry: placing it puts all of that class's blocks side by side.
    const group = (rs: Regiment[], side: Side): Group[] => side.map(([c]) => {
      const g = rs.filter((r) => r.cls === c);
      return { place: (bb: Battle, x: number, y: number, fx: number, fy: number) => {
        let off = -g.reduce((s2, r) => s2 + r.width + 8, -8) / 2;
        for (const r of g) { const o = off + r.width / 2; placeRegiment(bb, r, x - fy * o, y + fx * o, fx, fy); off += r.width + 8; }
      }, regs: g, members: () => g.flatMap((r) => r.members) };
    });
    const AA = group(A, p.a);
    const BB = group(B, p.b);
    if (p.holdA) b.generals[0]!.fixedPlan = 'hold';
    if (p.holdB) b.generals[1]!.fixedPlan = 'hold';
    p.place(b, AA, BB);
    measure(b, seed, TICKS || p.ticks, tot, byMode, worst, (bb) => { if (p.at !== undefined && bb.tick === p.at) p.event!(bb, AA, BB); });
  }
  report(p.name, tot, byMode, worst);
}
