// The battle: two armies on an open field, fought to a rout.
//
// Deterministic (see rng.ts): the server fights it once to decide the day, and every browser
// fights it again from the same setup to show it, tick for tick. Soldiers are individual
// figures; when an army is too large to draw, each figure stands for several men (`scale`).
//
// Each side's regiments deploy in a classic order: skirmishers in front, the infantry line,
// archers behind, cavalry on the wings, engines and the commander at the rear. Regiment orders
// follow simple doctrine; soldiers keep formation until the enemy is close, then fight man to
// man. Losses, flanking and a fallen commander drain morale, and a broken regiment runs.

import { factionStats, type FactionId } from './factions.ts';
import { mixSeed, Rng } from './rng.ts';
import { emptyCounts, U, UNIT_COUNT, type Counts, type Role, type UnitStats } from './units.ts';

export const BATTLE_VERSION = 1;
export const FIELD_W = 640;
export const FIELD_H = 360;
export const TICK_S = 0.1;
export const TICKS_PER_SECOND = 10;
/** Battles end here at the latest, decided on the strength left (six minutes). */
export const MAX_TICKS = 3600;
/** Figures per side at most; bigger armies are drawn with each figure standing for several men. */
export const MAX_FIGURES = 1100;

export interface ArmySpec {
  name: string;
  faction: FactionId;
  /** Heraldic hue 0..359 of shields and banners. */
  hue: number;
  counts: Counts;
  veterans: Counts;
  moraleBonus: number;
  /** Share of missile damage turned by pavises, 0..0.4. */
  pavise: number;
  stakes: boolean;
  /** NPC armies (brigands) have no commander. */
  commander: boolean;
}

export interface BattleSetup {
  version: number;
  seed: number;
  kind: 'daily' | 'grand';
  armies: [ArmySpec, ArmySpec];
}

export const enum State {
  Fighting = 0,
  Routing = 1,
  Dead = 2,
  Fled = 3,
}

export class Soldier {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hp = 0;
  state: State = State.Fighting;
  target = -1;
  cooldown = 0;
  ammo = 0;
  /** Ticks of charge impetus left. */
  impetus = 0;
  /** Tick of the last blow or shot, for animation. */
  actedAt = -100;
  /** Tick it fell. */
  diedAt = -1;
  kills = 0;
  /** Slot offset within the regiment: across the front and in depth. */
  sx = 0;
  sy = 0;
  constructor(
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    readonly reg: number,
    readonly s: UnitStats,
    readonly vet: boolean,
    readonly commander: boolean,
  ) {}
}

export type Mode = 'hold' | 'advance' | 'charge' | 'melee' | 'shoot' | 'skirmish' | 'flank' | 'kite' | 'rout' | 'reserve' | 'guard';

export class Regiment {
  members: number[] = [];
  cx = 0;
  cy = 0;
  /** Formation anchor and facing (unit vector). */
  ax = 0;
  ay = 0;
  fx = 1;
  fy = 0;
  tx = 0;
  ty = 0;
  mode: Mode = 'hold';
  morale = 50;
  alive = 0;
  start = 0;
  targetReg = -1;
  engaged = false;
  routed = false;
  spacing = 5;
  speed = 20;
  constructor(
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    readonly role: Role | 'command',
  ) {}
}

export interface Projectile {
  team: number;
  /** Class of the shooter, which sets the missile's look and effect. */
  cls: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  lands: number;
  damage: number;
  pierce: number;
  splash: number;
  shooter: number;
}

export interface Stake {
  team: number;
  x: number;
  y0: number;
  y1: number;
}

export interface SideResult {
  /** Men, not figures. */
  start: Counts;
  dead: Counts;
  fled: Counts;
  alive: Counts;
  kills: number;
  commanderFell: boolean;
}

export interface BattleResult {
  winner: 0 | 1;
  reason: 'rout' | 'time';
  ticks: number;
  scale: number;
  sides: [SideResult, SideResult];
}

/** Things worth narrating as they happen: the viewer and the summary read these. */
export interface BattleEvent {
  tick: number;
  team: number;
  kind: 'rout' | 'commander' | 'charge' | 'contact';
  cls: number;
}

const sqrt = Math.sqrt;
const CELL = 16;
const GW = Math.ceil(FIELD_W / CELL);
const GH = Math.ceil(FIELD_H / CELL);
const REG_SIZE: Record<string, number> = { line: 48, missile: 40, skirmish: 30, flank: 24, 'shock-cav': 20, 'horse-archer': 20, siege: 3 };
const SPACING: Record<string, number> = { line: 5, missile: 5.5, skirmish: 7, flank: 8.5, 'shock-cav': 9, 'horse-archer': 9, siege: 16 };

function scaleFor(a: Counts, b: Counts): number {
  const n = Math.max(
    a.reduce((x, y) => x + y, 0),
    b.reduce((x, y) => x + y, 0),
  );
  return Math.max(1, Math.ceil(n / MAX_FIGURES));
}

function figures(count: number, scale: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count / scale));
}

export class Battle {
  readonly rng: Rng;
  readonly soldiers: Soldier[] = [];
  readonly regiments: Regiment[] = [];
  readonly projectiles: Projectile[] = [];
  readonly stakes: Stake[] = [];
  readonly events: BattleEvent[] = [];
  readonly scale: number;
  readonly stats: [UnitStats[], UnitStats[]];
  /** Figures per class at the start, per team. */
  readonly startFigures: [Counts, Counts] = [emptyCounts(), emptyCounts()];
  tick = 0;
  result: BattleResult | null = null;
  commander: [number, number] = [-1, -1];
  commanderFell: [boolean, boolean] = [false, false];
  /** Whether each side waits for the enemy (it outshoots them) or presses the attack. */
  stance: ['hold' | 'press', 'hold' | 'press'] = ['press', 'press'];
  private grid = new Int32Array(GW * GH + 1);
  private cellItems = new Int32Array(0);
  private cellOf = new Int32Array(0);

  constructor(readonly setup: BattleSetup) {
    this.rng = new Rng(mixSeed(setup.seed, BATTLE_VERSION));
    this.scale = scaleFor(setup.armies[0].counts, setup.armies[1].counts);
    this.stats = [factionStats(setup.armies[0].faction), factionStats(setup.armies[1].faction)];
    this.deploy(0);
    this.deploy(1);
    const missile = (t: number) => {
      let p = 0;
      for (const s of this.soldiers) if (s.team === t && s.s.range > 0 && s.s.role !== 'siege') p += s.s.missileDamage / s.s.reload;
      return p;
    };
    const m0 = missile(0);
    const m1 = missile(1);
    this.stance = [m0 > m1 * 1.25 ? 'hold' : 'press', m1 > m0 * 1.25 ? 'hold' : 'press'];
    this.cellItems = new Int32Array(this.soldiers.length);
    this.cellOf = new Int32Array(this.soldiers.length);
  }

  // ------------------------------------------------------------------ deployment

  private deploy(team: number): void {
    const army = this.setup.armies[team]!;
    const stats = this.stats[team]!;
    const dir = team === 0 ? 1 : -1;
    const edge = team === 0 ? 0 : FIELD_W;
    const X = (d: number) => edge + dir * d;
    const regs: Regiment[] = [];
    const vetLeft = army.veterans.slice();
    const make = (cls: number, n: number, role: Role) => {
      const size = REG_SIZE[role]!;
      const count = Math.ceil(n / size);
      for (let r = 0; r < count; r++) {
        const m = Math.round(((r + 1) * n) / count) - Math.round((r * n) / count);
        if (m <= 0) continue;
        const reg = new Regiment(this.regiments.length, team, cls, role);
        reg.spacing = SPACING[role]!;
        reg.speed = stats[cls]!.speed;
        reg.fx = dir;
        reg.fy = 0;
        this.regiments.push(reg);
        regs.push(reg);
        for (let i = 0; i < m; i++) {
          const vet = (vetLeft[cls] ?? 0) > 0;
          if (vet) vetLeft[cls]! -= this.scale;
          const s = new Soldier(this.soldiers.length, team, cls, reg.id, stats[cls]!, vet, false);
          s.hp = s.s.hp * (vet ? 1.1 : 1);
          s.ammo = s.s.ammo;
          this.soldiers.push(s);
          reg.members.push(s.id);
        }
        reg.start = reg.alive = reg.members.length;
        reg.morale = stats[cls]!.morale + army.moraleBonus + (reg.members.some((i) => this.soldiers[i]!.vet) ? 6 : 0);
      }
    };
    for (let cls = 0; cls < UNIT_COUNT; cls++) {
      const n = figures(army.counts[cls] ?? 0, this.scale);
      this.startFigures[team]![cls] = n;
      if (n > 0) make(cls, n, stats[cls]!.role);
    }

    // Lines, front to back: skirmish screen, the main line, missiles, the rear.
    const byRole = (...roles: Role[]) => regs.filter((r) => (roles as string[]).includes(r.role));
    const line = byRole('line').sort((a, b) => order(a.cls) - order(b.cls));
    const place = (list: Regiment[], depth: number, y0: number, y1: number) => {
      // Lay regiments across the front between y0 and y1; overflow goes to further ranks behind.
      let rank = 0;
      let i = 0;
      while (i < list.length) {
        const row: Regiment[] = [];
        let width = 0;
        while (i < list.length) {
          const w = frontage(list[i]!);
          if (row.length > 0 && width + w + 8 > y1 - y0) break;
          row.push(list[i]!);
          width += w + 8;
          i++;
        }
        let y = (y0 + y1) / 2 - (width - 8) / 2;
        let deepest = 0;
        for (const reg of row) {
          const w = frontage(reg);
          formUp(reg, X(depth + rank), y + w / 2, this.soldiers);
          deepest = Math.max(deepest, depthOf(reg));
          y += w + 8;
        }
        rank += deepest + 10;
      }
      return rank;
    };
    const centreTop = 60;
    const centreBot = FIELD_H - 60;
    const lineDepth = line.length ? place(centreOut(line), 150, centreTop, centreBot) : 0;
    place(byRole('skirmish'), 185, centreTop, centreBot);
    place(byRole('missile'), Math.max(60, 150 - Math.max(30, lineDepth)), centreTop, centreBot);
    // Wings: cavalry split above and below the line.
    const wings = [...byRole('flank'), ...byRole('horse-archer'), ...byRole('shock-cav')];
    const top: Regiment[] = [];
    const bottom: Regiment[] = [];
    wings.forEach((r, i) => (i % 2 === 0 ? top : bottom).push(r));
    place(top, 120, 6, centreTop + 10);
    place(bottom, 120, centreBot - 10, FIELD_H - 6);
    place(byRole('siege'), 35, centreTop + 40, centreBot - 40);

    // The commander and a bodyguard of knights behind the centre.
    if (army.commander) {
      const reg = new Regiment(this.regiments.length, team, U.Knights, 'command');
      reg.spacing = 8;
      reg.speed = stats[U.Knights]!.speed;
      reg.fx = dir;
      this.regiments.push(reg);
      const guard = 6;
      for (let i = 0; i <= guard; i++) {
        const s = new Soldier(this.soldiers.length, team, U.Knights, reg.id, stats[U.Knights]!, true, i === 0);
        s.hp = i === 0 ? 360 : s.s.hp * 1.2;
        this.soldiers.push(s);
        reg.members.push(s.id);
        if (i === 0) this.commander[team] = s.id;
      }
      reg.start = reg.alive = reg.members.length;
      reg.morale = 95 + army.moraleBonus;
      formUp(reg, X(70), FIELD_H / 2, this.soldiers);
    }

    // Stakes before the archers.
    if (army.stakes) {
      const archers = regs.filter((r) => r.role === 'missile');
      for (const r of archers) {
        const w = frontage(r);
        this.stakes.push({ team, x: r.ax + dir * 14, y0: r.ay - w / 2 - 4, y1: r.ay + w / 2 + 4 });
      }
    }
  }

  // ------------------------------------------------------------------ the tick

  done(): boolean {
    return this.result !== null;
  }

  step(): void {
    if (this.result) return;
    this.rebuildGrid();
    if (this.tick % 5 === 0) for (const r of this.regiments) this.think(r);
    const ss = this.soldiers;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Dead || s.state === State.Fled) continue;
      this.act(s);
    }
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Dead || s.state === State.Fled) continue;
      this.move(s);
    }
    this.flyProjectiles();
    this.tick++;
    if (this.tick % 10 === 0) this.checkEnd();
  }

  /** Runs to the end (or `maxTicks` more) without drawing. */
  run(maxTicks = MAX_TICKS): BattleResult {
    const stop = this.tick + maxTicks;
    while (!this.result && this.tick < stop) this.step();
    return this.result ?? this.decide('time');
  }

  private rebuildGrid(): void {
    const g = this.grid;
    g.fill(0);
    const ss = this.soldiers;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Dead || s.state === State.Fled) {
        this.cellOf[i] = -1;
        continue;
      }
      const c = cellIndex(s.x, s.y);
      this.cellOf[i] = c;
      g[c + 1]!++;
    }
    for (let c = 0; c < GW * GH; c++) g[c + 1]! += g[c]!;
    const fill = g.slice(0, GW * GH);
    for (let i = 0; i < ss.length; i++) {
      const c = this.cellOf[i]!;
      if (c < 0) continue;
      this.cellItems[fill[c]!++] = i;
    }
  }

  /** Calls `f` for each living soldier within `r` of (x, y); stop by returning true. */
  near(x: number, y: number, r: number, f: (s: Soldier, d2: number) => boolean | void): void {
    const x0 = Math.max(0, Math.floor((x - r) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.grid[c + 1]!; k++) {
          const s = this.soldiers[this.cellItems[k]!]!;
          const dx = s.x - x;
          const dy = s.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && f(s, d2) === true) return;
        }
      }
    }
  }

  private nearestEnemy(s: Soldier, r: number): number {
    let best = -1;
    let bd = Infinity;
    this.near(s.x, s.y, r, (o, d2) => {
      if (o.team !== s.team && o.state === State.Fighting + 0 && d2 < bd) {
        bd = d2;
        best = o.id;
      }
    });
    if (best >= 0) return best;
    // Routing enemies are fair game too, at a lower priority.
    this.near(s.x, s.y, r, (o, d2) => {
      if (o.team !== s.team && o.state === State.Routing && d2 < bd) {
        bd = d2;
        best = o.id;
      }
    });
    return best;
  }

  // ------------------------------------------------------------------ regiment orders

  private think(r: Regiment): void {
    let n = 0;
    let sx = 0;
    let sy = 0;
    let engaged = 0;
    for (const id of r.members) {
      const s = this.soldiers[id]!;
      if (s.state !== State.Fighting && s.state !== State.Routing) continue;
      n++;
      sx += s.x;
      sy += s.y;
      if (s.target >= 0 && s.s.range === 0) engaged++;
    }
    r.alive = n;
    if (n === 0) return;
    r.cx = sx / n;
    r.cy = sy / n;
    r.engaged = engaged > n * 0.25;
    if (r.routed) return;

    // Morale: steady recovery out of contact, a lift from a living commander nearby.
    const team = r.team;
    const cmd = this.commander[team]!;
    const c = cmd >= 0 ? this.soldiers[cmd]! : null;
    if (!r.engaged) r.morale = Math.min(100, r.morale + 0.4);
    if (c && c.state === State.Fighting) {
      const dx = c.x - r.cx;
      const dy = c.y - r.cy;
      if (dx * dx + dy * dy < 110 * 110) r.morale = Math.min(100, r.morale + 0.3);
    }
    if (r.alive < r.start * 0.2 && r.role !== 'command') r.morale -= 1.5;
    if (r.morale < 15) {
      this.rout(r);
      return;
    }

    const enemy = 1 - team;
    const dir = team === 0 ? 1 : -1;
    const foes = this.regiments.filter((o) => o.team === enemy && o.alive > 0 && !o.routed);
    if (foes.length === 0) {
      r.mode = 'hold';
      return;
    }
    const dist2 = (o: Regiment) => (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
    const nearest = (pred: (o: Regiment) => boolean = () => true) => {
      let best: Regiment | null = null;
      let bd = Infinity;
      for (const o of foes) {
        if (!pred(o)) continue;
        const d = dist2(o);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best;
    };
    const near = nearest()!;
    const nd = sqrt(dist2(near));
    const st = this.stats[team]![r.cls]!;
    const holding = this.stance[team] === 'hold' && this.tick < 450 && nd > 150;
    const isFoot = (o: Regiment) => o.role === 'line' || o.role === 'missile' || o.role === 'skirmish';

    switch (r.role) {
      case 'line': {
        const tgt = nearest((o) => o.role === 'line') ?? near;
        r.targetReg = tgt.id;
        const d = sqrt(dist2(tgt));
        if (holding && !r.engaged) {
          r.mode = 'hold';
          this.order(r, r.ax, r.ay, tgt);
        } else if (d < 45 || r.engaged) {
          r.mode = 'melee';
          this.order(r, tgt.cx, tgt.cy, tgt);
        } else {
          r.mode = d < 80 ? 'charge' : 'advance';
          this.order(r, tgt.cx - dir * 6, tgt.cy, tgt);
        }
        break;
      }
      case 'missile': {
        const inRange = nearest((o) => sqrt(dist2(o)) < st.range * 0.95);
        const out = r.members.every((id) => this.soldiers[id]!.ammo <= 0 || this.soldiers[id]!.state !== State.Fighting);
        if (out) {
          // Out of arrows: draw swords and join the press.
          r.mode = nd < 50 ? 'melee' : 'advance';
          r.targetReg = near.id;
          this.order(r, near.cx, near.cy, near);
        } else if (inRange) {
          r.mode = nd < 22 ? 'melee' : 'shoot';
          r.targetReg = inRange.id;
          this.order(r, r.ax, r.ay, inRange);
        } else {
          r.mode = holding ? 'hold' : 'advance';
          r.targetReg = near.id;
          const step = Math.min(30, nd - st.range * 0.85);
          const ux = (near.cx - r.ax) / (nd || 1);
          const uy = (near.cy - r.ay) / (nd || 1);
          if (holding) this.order(r, r.ax, r.ay, near);
          else this.order(r, r.ax + ux * step, r.ay + uy * step * 0.3, near);
        }
        break;
      }
      case 'skirmish': {
        const out = r.members.every((id) => this.soldiers[id]!.ammo <= 0);
        r.targetReg = near.id;
        if (out || nd < 38) {
          // Fall back behind our own line.
          r.mode = 'skirmish';
          this.order(r, Math.max(10, Math.min(FIELD_W - 10, (team === 0 ? 0 : FIELD_W) + dir * 70)), r.ay, near);
          if (out && nd > 120) r.mode = 'reserve';
        } else if (nd < st.range * 0.9) {
          r.mode = 'shoot';
          this.order(r, r.ax, r.ay, near);
        } else {
          r.mode = 'advance';
          this.order(r, near.cx - dir * st.range * 0.75, r.ay + (near.cy - r.ay) * 0.2, near);
        }
        break;
      }
      case 'flank': {
        // Hunt archers and engines; failing that, take a line in the rear.
        const prey = nearest((o) => o.role === 'missile' || o.role === 'siege' || o.role === 'horse-archer') ?? nearest(isFoot) ?? near;
        r.targetReg = prey.id;
        const d = sqrt(dist2(prey));
        if (this.tick < 40) {
          r.mode = 'hold';
          this.order(r, r.ax, r.ay, prey);
        } else if (d < 40 || r.engaged) {
          r.mode = 'melee';
          this.order(r, prey.cx, prey.cy, prey);
        } else {
          r.mode = 'flank';
          // Swing wide: aim for the target's side away from the centre, then in.
          const wide = prey.cy < FIELD_H / 2 ? -1 : 1;
          const behind = d > 90 ? -prey.fx * 25 : 0;
          this.order(r, prey.cx + behind, prey.cy + wide * (d > 90 ? 40 : 0), prey);
        }
        break;
      }
      case 'shock-cav': {
        // Wait for the lines to lock, then hit an engaged enemy in the flank or rear.
        const locked = this.regiments.some((o) => o.team === team && o.role === 'line' && o.engaged);
        const prey = nearest((o) => o.engaged && isFoot(o)) ?? nearest((o) => o.role === 'missile' || o.role === 'siege') ?? near;
        r.targetReg = prey.id;
        const d = sqrt(dist2(prey));
        if (!locked && this.tick < 300 && nd > 60) {
          r.mode = 'hold';
          this.order(r, r.ax, r.ay, prey);
        } else if (d < 34 || r.engaged) {
          if (r.mode !== 'melee') this.events.push({ tick: this.tick, team, kind: 'charge', cls: r.cls });
          r.mode = 'melee';
          this.order(r, prey.cx, prey.cy, prey);
        } else {
          r.mode = 'charge';
          const behind = d > 70 ? -prey.fx * 30 : 0;
          this.order(r, prey.cx + behind, prey.cy, prey);
        }
        break;
      }
      case 'horse-archer': {
        r.targetReg = near.id;
        if (nd < 75) {
          r.mode = 'kite';
          // Ride away from the nearest threat, sideways along the field.
          const ux = (r.cx - near.cx) / (nd || 1);
          const uy = (r.cy - near.cy) / (nd || 1);
          this.order(r, clampX(r.cx + ux * 60 - uy * 25), clampY(r.cy + uy * 60 + ux * 25), near);
        } else if (nd < st.range * 0.95) {
          r.mode = 'shoot';
          this.order(r, r.cx, r.cy, near);
        } else {
          r.mode = 'advance';
          this.order(r, near.cx - dir * st.range * 0.8, near.cy + (near.cy < FIELD_H / 2 ? -40 : 40), near);
        }
        if (r.members.every((id) => this.soldiers[id]!.ammo <= 0)) {
          r.mode = nd < 40 ? 'melee' : 'advance';
          this.order(r, near.cx, near.cy, near);
        }
        break;
      }
      case 'siege': {
        // Aim at the biggest block in range.
        let best: Regiment | null = null;
        for (const o of foes) {
          const d = sqrt(dist2(o));
          if (d > st.range) continue;
          if (!best || o.alive > best.alive) best = o;
        }
        r.mode = best ? 'shoot' : 'hold';
        r.targetReg = best ? best.id : -1;
        this.order(r, r.ax, r.ay, best ?? near);
        break;
      }
      case 'command': {
        r.targetReg = near.id;
        if (nd < 45) {
          r.mode = 'melee';
          this.order(r, near.cx, near.cy, near);
        } else {
          r.mode = 'guard';
          // Follow behind the centre of our own fighting line.
          let lx = 0;
          let ly = 0;
          let k = 0;
          for (const o of this.regiments) {
            if (o.team !== team || o.role !== 'line' || o.alive === 0 || o.routed) continue;
            lx += o.cx * o.alive;
            ly += o.cy * o.alive;
            k += o.alive;
          }
          if (k > 0) this.order(r, lx / k - dir * 55, ly / k, near);
          else this.order(r, r.ax, r.ay, near);
        }
        break;
      }
    }
  }

  /** Sets a regiment's goal and turns it toward `face`. */
  private order(r: Regiment, x: number, y: number, face: Regiment | null): void {
    r.tx = clampX(x);
    r.ty = clampY(y);
    if (face) {
      const dx = face.cx - r.ax;
      const dy = face.cy - r.ay;
      const d = sqrt(dx * dx + dy * dy);
      if (d > 1) {
        // Turn gradually: blend the old facing toward the new one.
        let fx = r.fx * 0.8 + (dx / d) * 0.2;
        let fy = r.fy * 0.8 + (dy / d) * 0.2;
        const n = sqrt(fx * fx + fy * fy) || 1;
        fx /= n;
        fy /= n;
        r.fx = fx;
        r.fy = fy;
      }
    }
  }

  private rout(r: Regiment): void {
    if (r.routed) return;
    r.routed = true;
    r.mode = 'rout';
    this.events.push({ tick: this.tick, team: r.team, kind: 'rout', cls: r.cls });
    for (const id of r.members) {
      const s = this.soldiers[id]!;
      if (s.state === State.Fighting) s.state = State.Routing;
      s.target = -1;
    }
    // Panic spreads to neighbours.
    for (const o of this.regiments) {
      if (o.team !== r.team || o.routed || o === r || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < 70 * 70) o.morale -= o.role === 'command' ? 2 : 5;
    }
  }

  // ------------------------------------------------------------------ soldiers

  private act(s: Soldier): void {
    const r = this.regiments[s.reg]!;
    if (s.cooldown > 0) s.cooldown--;
    if (s.impetus > 0) s.impetus--;
    if (s.state === State.Routing) return;

    const st = s.s;
    // Refresh the target now and then (staggered), or when it fell.
    const t = s.target >= 0 ? this.soldiers[s.target]! : null;
    if (!t || t.state === State.Dead || t.state === State.Fled || (this.tick + s.id) % 6 === 0) {
      const engage = r.mode === 'melee' || r.mode === 'charge' ? 26 : st.range > 0 ? 10 : 18;
      s.target = this.nearestEnemy(s, engage);
    }

    // Missiles.
    const shooting = st.range > 0 && s.ammo > 0 && (r.mode === 'shoot' || r.mode === 'kite' || r.mode === 'skirmish');
    if (shooting && s.cooldown === 0 && (s.target < 0 || st.role === 'horse-archer' || st.role === 'siege')) {
      const tr = r.targetReg >= 0 ? this.regiments[r.targetReg]! : null;
      if (tr && tr.alive > 0) {
        const victim = this.pickMember(tr);
        if (victim) {
          const dx = victim.x - s.x;
          const dy = victim.y - s.y;
          const d = sqrt(dx * dx + dy * dy);
          if (d <= st.range && d > 6) {
            const flight = Math.max(3, Math.round((d / st.projectileSpeed) * TICKS_PER_SECOND));
            // Lead the target a little, and scatter more with distance.
            const spread = 2 + d * (st.role === 'siege' ? 0.05 : 0.035);
            const lx = victim.x + victim.vx * flight * TICK_S * 0.8 + (this.rng.next() - 0.5) * 2 * spread;
            const ly = victim.y + victim.vy * flight * TICK_S * 0.8 + (this.rng.next() - 0.5) * 2 * spread;
            this.projectiles.push({
              team: s.team, cls: s.cls, x0: s.x, y0: s.y, x1: lx, y1: ly, born: this.tick, lands: this.tick + flight,
              damage: st.missileDamage * (s.vet ? 1.1 : 1), pierce: st.pierce, splash: st.role === 'siege' ? 9 : 0, shooter: s.id,
            });
            s.ammo--;
            s.actedAt = this.tick;
            s.cooldown = st.reload + this.rng.int(Math.max(1, Math.floor(st.reload / 3)));
            return;
          }
        }
      }
    }

    // Melee.
    if (s.target >= 0) {
      const o = this.soldiers[s.target]!;
      const dx = o.x - s.x;
      const dy = o.y - s.y;
      const reach = st.radius + o.s.radius + 1.6;
      if (dx * dx + dy * dy <= reach * reach && s.cooldown === 0) this.strike(s, o);
    }
  }

  private pickMember(r: Regiment): Soldier | null {
    for (let tries = 0; tries < 6; tries++) {
      const s = this.soldiers[r.members[this.rng.int(r.members.length)]!]!;
      if (s.state === State.Fighting || s.state === State.Routing) return s;
    }
    for (const id of r.members) {
      const s = this.soldiers[id]!;
      if (s.state === State.Fighting || s.state === State.Routing) return s;
    }
    return null;
  }

  private strike(a: Soldier, d: Soldier): void {
    const as = a.s;
    const ds = d.s;
    const ar = this.regiments[a.reg]!;
    const dr = this.regiments[d.reg]!;
    let attack = as.attack * (a.vet ? 1.1 : 1);
    let damage = as.damage;
    // Charge impetus, blunted by braced spears.
    if (a.impetus > 0) {
      const braced = ds.antiCav > 1.5 && d.state === State.Fighting && !dr.routed && as.mounted;
      attack += as.charge * (braced ? 0.3 : 1);
      damage += as.charge * 0.35 * (braced ? 0.3 : 1);
      if (braced) this.hurt(a, ds.damage * 0.8 * (50 / (50 + as.armour)), d);
      a.impetus = 0;
    }
    // Flank and rear: where the blow comes from, against where the defender's regiment faces.
    const fx = dr.fx;
    const fy = dr.fy;
    const ux = a.x - d.x;
    const uy = a.y - d.y;
    const un = sqrt(ux * ux + uy * uy) || 1;
    const dot = (ux * fx + uy * fy) / un;
    let defence = ds.defence * (d.vet ? 1.1 : 1);
    if (d.state === State.Routing) defence *= 0.2;
    let shock = 0;
    if (d.state !== State.Routing) {
      if (dot < -0.35) {
        attack += 18;
        defence *= 0.6;
        shock = 0.12;
      } else if (dot < 0.35) {
        attack += 8;
        shock = 0.04;
      }
    }
    const chance = Math.max(0.08, Math.min(0.92, 0.4 + (attack - defence) * 0.012));
    a.actedAt = this.tick;
    a.cooldown = as.meleeCooldown + this.rng.int(4);
    void ar;
    if (this.rng.next() >= chance) return;
    dr.morale -= shock;
    if (ds.mounted) damage *= as.antiCav;
    const roll = 0.8 + this.rng.next() * 0.4;
    this.hurt(d, damage * roll * (50 / (50 + ds.armour)), a);
  }

  private hurt(d: Soldier, amount: number, by: Soldier | null): void {
    if (d.state === State.Dead || d.state === State.Fled) return;
    d.hp -= amount;
    if (d.hp > 0) return;
    d.state = State.Dead;
    d.diedAt = this.tick;
    d.vx = 0;
    d.vy = 0;
    if (by) by.kills++;
    const r = this.regiments[d.reg]!;
    r.alive--;
    // Each loss costs morale, more in a small regiment; a fallen commander shakes the whole army.
    r.morale -= 60 / Math.max(10, r.start);
    if (d.commander) {
      this.commanderFell[d.team] = true;
      this.events.push({ tick: this.tick, team: d.team, kind: 'commander', cls: d.cls });
      for (const o of this.regiments) if (o.team === d.team) o.morale -= 22;
    }
  }

  private move(s: Soldier): void {
    const r = this.regiments[s.reg]!;
    const st = s.s;
    let gx: number;
    let gy: number;
    let speed = st.speed;
    if (s.state === State.Routing) {
      gx = s.team === 0 ? -20 : FIELD_W + 20;
      gy = s.y;
      speed *= 1.05;
    } else if (s.target >= 0 && (r.mode === 'melee' || r.mode === 'charge' || st.range === 0 || s.ammo <= 0 || r.mode === 'advance')) {
      const o = this.soldiers[s.target]!;
      gx = o.x;
      gy = o.y;
      if (r.mode === 'charge' || (st.mounted && st.charge > 0)) speed *= 1.25;
    } else {
      // Keep formation: the regiment's anchor walks toward its goal at the pace of its slowest.
      gx = r.ax - r.fy * s.sx - r.fx * s.sy;
      gy = r.ay + r.fx * s.sx - r.fy * s.sy;
      if (r.mode === 'charge' || r.mode === 'flank') speed *= 1.15;
    }

    // Steer toward the goal.
    let dx = gx - s.x;
    let dy = gy - s.y;
    const d = sqrt(dx * dx + dy * dy);
    let vx = 0;
    let vy = 0;
    if (d > 0.6) {
      const v = Math.min(speed, d * 4) / d;
      vx = dx * v;
      vy = dy * v;
    }
    // Shove: overlapping soldiers push apart, heavier ones less.
    this.near(s.x, s.y, st.radius + 4, (o) => {
      if (o === s) return;
      dx = s.x - o.x;
      dy = s.y - o.y;
      const minD = st.radius + o.s.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) return;
      const dd = sqrt(d2) || 0.01;
      const push = ((minD - dd) / dd) * 14 * (o.s.mass / (o.s.mass + st.mass));
      vx += (dx || (s.id % 2 ? 0.1 : -0.1)) * push;
      vy += (dy || (s.id % 3 ? 0.1 : -0.1)) * push;
    });
    // Stakes: the enemy's horses balk and bleed.
    if (st.mounted && this.stakes.length > 0 && s.state === State.Fighting) {
      for (const k of this.stakes) {
        if (k.team === s.team || Math.abs(s.x - k.x) > 4 || s.y < k.y0 || s.y > k.y1) continue;
        vx *= 0.25;
        vy *= 0.25;
        if (this.tick % 5 === 0) this.hurt(s, 6, null);
      }
    }
    const vmax = speed * 1.6;
    const vm = sqrt(vx * vx + vy * vy);
    if (vm > vmax) {
      vx = (vx / vm) * vmax;
      vy = (vy / vm) * vmax;
    }
    // Horses build impetus at a gallop.
    if (st.mounted && st.charge > 0 && vm > st.speed * 0.8 && s.target >= 0) s.impetus = 12;
    s.vx = vx;
    s.vy = vy;
    s.x += vx * TICK_S;
    s.y += vy * TICK_S;
    if (s.state === State.Routing) {
      if (s.x < -6 || s.x > FIELD_W + 6) {
        s.state = State.Fled;
        r.alive--;
      }
      s.y = clampY(s.y);
      return;
    }
    s.x = clampX(s.x);
    s.y = clampY(s.y);
  }

  /** Moves each regiment's anchor toward its goal, once per tick, before soldiers move. */
  private flyProjectiles(): void {
    // Anchors first (cheap), then the missiles in the air.
    for (const r of this.regiments) {
      if (r.alive === 0 || r.routed) continue;
      const dx = r.tx - r.ax;
      const dy = r.ty - r.ay;
      const d = sqrt(dx * dx + dy * dy);
      let pace = r.speed * (r.mode === 'charge' || r.mode === 'flank' ? 1.1 : r.mode === 'advance' ? 0.8 : 1) * TICK_S;
      // Keep the anchor near the soldiers: a block in melee does not walk away from its men.
      if (r.mode === 'melee') pace *= 0.5;
      if (d > 0.5) {
        const k = Math.min(1, pace / d);
        r.ax += dx * k;
        r.ay += dy * k;
      }
    }
    const ps = this.projectiles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (p.lands > this.tick) {
        ps[w++] = p;
        continue;
      }
      this.land(p);
    }
    ps.length = w;
  }

  private land(p: Projectile): void {
    const radius = p.splash > 0 ? p.splash : 2.6;
    let hit: Soldier | null = null;
    let bd = Infinity;
    const victims: Soldier[] = [];
    this.near(p.x1, p.y1, radius + 3, (o, d2) => {
      if (o.team === p.team) return;
      const rr = radius + o.s.radius * 0.6;
      if (d2 > rr * rr) return;
      if (p.splash > 0) victims.push(o);
      else if (d2 < bd) {
        bd = d2;
        hit = o;
      }
    });
    const shooter = this.soldiers[p.shooter] ?? null;
    if (p.splash > 0) {
      for (const o of victims) this.missileHit(o, p, shooter, 1);
      for (const o of victims) this.regiments[o.reg]!.morale -= 0.6;
      return;
    }
    if (hit) this.missileHit(hit, p, shooter, 1);
  }

  private missileHit(o: Soldier, p: Projectile, shooter: Soldier | null, k: number): void {
    const army = this.setup.armies[o.team]!;
    // Shields stop missiles from the front.
    const r = this.regiments[o.reg]!;
    const ux = p.x0 - o.x;
    const uy = p.y0 - o.y;
    const un = sqrt(ux * ux + uy * uy) || 1;
    const front = (ux * r.fx + uy * r.fy) / un > 0.2;
    if (p.splash === 0 && front && o.state === State.Fighting && this.rng.next() < o.s.shield * (1 - p.pierce * 0.6)) return;
    const armour = o.s.armour * (1 - p.pierce);
    let dmg = p.damage * k * (50 / (50 + armour)) * (0.75 + this.rng.next() * 0.5);
    if (front) dmg *= 1 - army.pavise;
    r.morale -= 0.05;
    this.hurt(o, dmg, shooter);
  }

  // ------------------------------------------------------------------ the end

  private fighting(team: number): number {
    let n = 0;
    for (const s of this.soldiers) if (s.team === team && s.state === State.Fighting) n++;
    return n;
  }

  private checkEnd(): void {
    const a = this.fighting(0);
    const b = this.fighting(1);
    if (a === 0 || b === 0) {
      this.result = this.decide('rout', a === 0 && b === 0 ? null : a === 0 ? 1 : 0);
      return;
    }
    if (this.tick >= MAX_TICKS) this.result = this.decide('time');
  }

  /** Value of what a side still has fighting, against what it brought. */
  strength(team: number): number {
    let v = 0;
    for (const s of this.soldiers) if (s.team === team && s.state === State.Fighting) v += s.s.value * (s.hp / s.s.hp);
    return v;
  }

  private decide(reason: 'rout' | 'time', winner: 0 | 1 | null = null): BattleResult {
    if (winner === null) {
      const a = this.strength(0);
      const b = this.strength(1);
      winner = a === b ? (this.rng.next() < 0.5 ? 0 : 1) : a > b ? 0 : 1;
    }
    const side = (team: number): SideResult => {
      const deadF = emptyCounts();
      const fledF = emptyCounts();
      const aliveF = emptyCounts();
      let kills = 0;
      for (const s of this.soldiers) {
        if (s.team !== team) continue;
        kills += s.kills;
        if (s.commander || this.regiments[s.reg]!.role === 'command') continue;
        if (s.state === State.Dead) deadF[s.cls]!++;
        else if (s.state === State.Fled || s.state === State.Routing) fledF[s.cls]!++;
        else aliveF[s.cls]!++;
      }
      const start = this.setup.armies[team]!.counts.map((n) => Math.max(0, Math.floor(n)));
      const dead = emptyCounts();
      const fled = emptyCounts();
      const alive = emptyCounts();
      for (let c = 0; c < UNIT_COUNT; c++) {
        const f = this.startFigures[team]![c]!;
        if (f === 0) continue;
        // Figures back to men, in proportion.
        dead[c] = Math.min(start[c]!, Math.round((deadF[c]! / f) * start[c]!));
        fled[c] = Math.min(start[c]! - dead[c]!, Math.round((fledF[c]! / f) * start[c]!));
        alive[c] = start[c]! - dead[c]! - fled[c]!;
      }
      return { start, dead, fled, alive, kills: kills * this.scale, commanderFell: this.commanderFell[team]! };
    };
    return { winner, reason, ticks: this.tick, scale: this.scale, sides: [side(0), side(1)] };
  }
}

function order(cls: number): number {
  // Centre-out order for the line: the heaviest in the middle, spears at the ends.
  return cls === U.Shock ? 0 : cls === U.HeavyInfantry ? 1 : 2;
}

/** Interleaves a list so the first items sit in the middle of the front. */
function centreOut<T>(list: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i % 2 === 0) out.push(list[i]!);
    else out.unshift(list[i]!);
  }
  return out;
}

function colsOf(reg: Regiment): number {
  const n = reg.members.length;
  if (reg.role === 'siege') return n;
  const ratio = reg.role === 'skirmish' ? 6 : reg.role === 'missile' ? 4 : reg.role === 'line' ? 3 : 2.2;
  return Math.max(1, Math.min(n, Math.ceil(sqrt(n * ratio))));
}

function frontage(reg: Regiment): number {
  return (colsOf(reg) - 1) * reg.spacing + 4;
}

function depthOf(reg: Regiment): number {
  return (Math.ceil(reg.members.length / colsOf(reg)) - 1) * reg.spacing + 4;
}

function formUp(reg: Regiment, x: number, y: number, soldiers: Soldier[]): void {
  const cols = colsOf(reg);
  reg.ax = reg.tx = reg.cx = x;
  reg.ay = reg.ty = reg.cy = y;
  reg.members.forEach((id, i) => {
    const s = soldiers[id]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Slot: across the front (sx) and back from it (sy); stagger alternate ranks.
    s.sx = (col - (cols - 1) / 2) * reg.spacing + (row % 2 ? reg.spacing * 0.3 : 0);
    s.sy = row * reg.spacing;
    s.x = reg.ax - reg.fy * s.sx - reg.fx * s.sy;
    s.y = reg.ay + reg.fx * s.sx - reg.fy * s.sy;
  });
}

function cellIndex(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return cy * GW + cx;
}

const clampX = (x: number) => Math.max(2, Math.min(FIELD_W - 2, x));
const clampY = (y: number) => Math.max(2, Math.min(FIELD_H - 2, y));

/** Fights a battle to its end. */
export function fight(setup: BattleSetup): BattleResult {
  return new Battle(setup).run();
}
