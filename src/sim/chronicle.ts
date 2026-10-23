import { Kind, KIND_COUNT, NEUTRAL, TICKS_PER_SECOND, type SimInput, type TickEvents, type World } from './api.ts';
import { DOCTRINE_NAMES, STATS } from './stats.ts';

export type ChronicleKind =
  | 'join'
  | 'muster'
  | 'rout'
  | 'wiped'
  | 'champion'
  | 'capture'
  | 'sack'
  | 'rebuilt'
  | 'monolith'
  | 'cry'
  | 'doctrine'
  | 'rally'
  | 'leader'
  | 'clash';

/** One line of a war's history. Derived from the simulation, so replays reproduce it. */
export interface ChronicleEntry {
  tick: number;
  kind: ChronicleKind;
  /** Acting player, or -1. */
  p: number;
  /** Other player involved (victim, previous holder), or -1. */
  q: number;
  /** Site involved, or -1. */
  site: number;
  /** Platoon id involved, or -1. */
  platoon: number;
  x: number;
  y: number;
  text: string;
  /** Soldiers by kind for musters; deaths for clashes. */
  units?: number[];
  /** Repository index for musters. */
  repo?: number;
}

export interface Names {
  player(p: number): string;
  repo(index: number): string;
}

const CLASH_WINDOW = 30 * TICKS_PER_SECOND;
const CLASH_DEATHS = 24;
const CLASH_CELL = 160;
const CLASH_COOLDOWN = 120 * TICKS_PER_SECOND;

export function roman(n: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) {
    out += s;
    n -= v;
  }
  return out || '0';
}

export function battalionName(repo: string): string {
  const short = repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo;
  return `${short} Battalion`;
}

export function platoonLabel(names: Names, repo: number, ordinal: number): string {
  return `Platoon ${roman(ordinal)}, ${battalionName(names.repo(repo))}`;
}

export function siteLabel(world: World, site: number, names: Names): string {
  const def = world.map.sites[site];
  if (!def) return 'the field';
  if (def.kind === 'heart') return 'the Heart';
  if (def.kind === 'shrine') return `the ${SHRINE_NAMES[(site - world.map.slots) % SHRINE_NAMES.length]} Shrine`;
  for (const p of world.players) if (p.slot === def.slot) return `${names.player(p.p)}'s capital`;
  return 'an empty capital';
}

export const SHRINE_NAMES = ['Ember', 'Tide', 'Thorn', 'Gale', 'Ash', 'Frost', 'Dusk', 'Dawn', 'Iron', 'Moss', 'Salt', 'Storm', 'Hollow', 'Lantern', 'Raven', 'Copper'];

export function unitsPhrase(units: readonly number[]): string {
  const parts: string[] = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    const n = units[k] ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? STATS[k]!.name : STATS[k]!.plural}`);
  }
  return parts.join(', ');
}

/** Turns simulation events into history. Feed it every tick, in order. */
export class Chronicler {
  private deathCells = new Map<number, number[]>();
  private lastClash = new Map<number, number>();

  constructor(private readonly names: Names) {}

  narrate(world: World, inputs: readonly SimInput[], ev: TickEvents): ChronicleEntry[] {
    const tick = world.tick - 1;
    const out: ChronicleEntry[] = [];
    const n = this.names;
    const add = (e: Omit<ChronicleEntry, 'tick' | 'q' | 'site' | 'platoon' | 'x' | 'y'> & Partial<ChronicleEntry>) =>
      out.push({ tick, q: -1, site: -1, platoon: -1, x: 0, y: 0, ...e });

    for (const j of ev.joins) {
      const slot = world.players[j.p]!.slot;
      const c = world.map.sites[slot]!;
      add({ kind: 'join', p: j.p, site: slot, x: c.x, y: c.y, text: `${n.player(j.p)} raised a banner and joined the war.` });
    }
    const pushInputs = inputs.filter((i): i is Extract<SimInput, { kind: 'push' }> => i.kind === 'push');
    for (const m of ev.musters) {
      const pl = world.platoons.find((x) => x.id === m.platoon);
      if (!pl) continue;
      const input = pushInputs.find((i) => i.p === pl.p && i.repo === pl.repo);
      const msg = input?.msg ? ` "${input.msg}"` : '';
      const c = world.map.sites[world.players[pl.p]!.slot]!;
      add({
        kind: 'muster', p: pl.p, platoon: pl.id, x: c.x, y: c.y, units: pl.mustered.slice(), repo: pl.repo,
        text: `${n.player(pl.p)} pushed to ${n.repo(pl.repo)}${msg}. ${platoonLabel(n, pl.repo, pl.ordinal)} musters: ${unitsPhrase(pl.mustered)}.`,
      });
    }
    for (const r of ev.routs) {
      const pl = world.platoons.find((x) => x.id === r.platoon);
      if (!pl) continue;
      add({ kind: 'rout', p: pl.p, platoon: pl.id, x: pl.x, y: pl.y, text: `${n.player(pl.p)}'s ${platoonLabel(n, pl.repo, pl.ordinal)} broke and fled.` });
    }
    for (const d of ev.deaths) {
      if (d.kind === Kind.Champion && d.p >= 0) {
        const by = d.killer >= 0 ? ` by ${n.player(d.killer)}` : '';
        add({ kind: 'champion', p: d.killer, q: d.p, x: d.x, y: d.y, text: `${n.player(d.p)}'s Champion was slain${by}.` });
      }
      this.recordDeath(tick, d.x, d.y);
    }
    for (const d of ev.disbands) {
      // Only the platoon's last soldier dying counts as wiped out; queued or departed ones are quiet.
      const died = ev.deaths.some((x) => x.platoon === d.platoon);
      if (!died) continue;
      add({ kind: 'wiped', p: d.p, platoon: d.platoon, x: d.x, y: d.y, text: `${n.player(d.p)}'s ${platoonLabel(n, d.repo, d.ordinal)} fell to the last soldier.` });
    }
    for (const c of ev.captures) {
      const def = world.map.sites[c.site]!;
      const from = c.previous !== NEUTRAL ? ` from ${n.player(c.previous)}` : '';
      add({ kind: 'capture', p: c.p, q: c.previous, site: c.site, x: def.x, y: def.y, text: `${n.player(c.p)} took ${siteLabel(world, c.site, n)}${from}.` });
    }
    for (const s of ev.sacks) {
      const def = world.map.sites[s.site]!;
      add({ kind: 'sack', p: s.p, q: s.victim, site: s.site, x: def.x, y: def.y, text: `${n.player(s.p)} sacked ${n.player(s.victim)}'s capital!` });
    }
    for (const r of ev.rebuilt) {
      const def = world.map.sites[r.site]!;
      add({ kind: 'rebuilt', p: -1, site: r.site, x: def.x, y: def.y, text: `${siteLabel(world, r.site, n)} rises from its ruins.` });
    }
    if (ev.monolith) {
      add({ kind: 'monolith', p: ev.monolith.p, x: 0, y: 0, text: `The Legacy Monolith has fallen! ${n.player(ev.monolith.p)} struck the final blow. The Heart is open.` });
    }
    for (const c of ev.cries) add({ kind: 'cry', p: c.p, text: `${n.player(c.p)} sounds the War Cry!` });
    for (const d of ev.doctrines) add({ kind: 'doctrine', p: d.p, text: `${n.player(d.p)} adopts the ${DOCTRINE_NAMES[d.doctrine]} doctrine.` });
    for (const r of ev.rallies) {
      const def = world.map.sites[r.site]!;
      add({ kind: 'rally', p: r.p, site: r.site, x: def.x, y: def.y, text: `${n.player(r.p)} rallies every platoon on ${siteLabel(world, r.site, n)}.` });
    }
    if (ev.leader) {
      const prev = ev.leader.previous >= 0 ? `, overtaking ${n.player(ev.leader.previous)}` : '';
      add({ kind: 'leader', p: ev.leader.p, q: ev.leader.previous, text: `${n.player(ev.leader.p)} leads in renown${prev}. A bounty is on their soldiers.` });
    }
    this.detectClashes(tick, out);
    return out;
  }

  private recordDeath(tick: number, x: number, y: number): void {
    const key = (Math.floor(x / CLASH_CELL) + 2048) * 4096 + (Math.floor(y / CLASH_CELL) + 2048);
    let list = this.deathCells.get(key);
    if (!list) {
      list = [];
      this.deathCells.set(key, list);
    }
    list.push(tick);
  }

  private detectClashes(tick: number, out: ChronicleEntry[]): void {
    for (const [key, list] of this.deathCells) {
      while (list.length > 0 && list[0]! <= tick - CLASH_WINDOW) list.shift();
      if (list.length === 0) {
        this.deathCells.delete(key);
        continue;
      }
      if (list.length < CLASH_DEATHS) continue;
      const last = this.lastClash.get(key) ?? -Infinity;
      if (tick - last < CLASH_COOLDOWN) continue;
      this.lastClash.set(key, tick);
      const kx = Math.floor(key / 4096);
      const cx = kx - 2048;
      const cy = key - kx * 4096 - 2048;
      out.push({
        tick, kind: 'clash', p: -1, q: -1, site: -1, platoon: -1,
        x: (cx + 0.5) * CLASH_CELL, y: (cy + 0.5) * CLASH_CELL,
        units: [list.length],
        text: `A great clash: ${list.length} soldiers fell within half a minute.`,
      });
    }
  }
}
