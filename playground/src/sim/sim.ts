// The playground's fight as a deterministic simulation: fixed 20 Hz ticks, a seeded random stream,
// and only + − × ÷ and √ (exact in IEEE 754 on every engine), so the same inputs give the same
// battle bit for bit on any machine. It knows nothing of three.js or clips, so it runs in a Web
// Worker here and could run unchanged on a server, with clients replaying its inputs (lockstep) or
// receiving its snapshots.

export const TICK_S = 0.05;
export const TICKS_PER_S = 20;

export interface UnitType {
  id: string;
  hp: number;
  damage: number;
  /** Metres from edge to edge for melee, centre to centre for missiles. */
  range: number;
  /** Metres a second. */
  speed: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** Seconds an attack takes, and the share of it at which the blow lands or the shot leaves. */
  swing: number;
  hitAt: number;
  shot?: 'arrow' | 'fire' | 'bolt';
  fly?: number;
  radius: number;
  /** Attack variants the renderer can show; the sim picks one per attack. */
  variants: number;
}

export const enum St {
  Idle = 0,
  Walk = 1,
  Attack = 2,
  Hit = 3,
  Dead = 4,
}

export type SimInput =
  /** A block of `count` soldiers `files` wide, its centre at (x, z), facing the foe. */
  | { tick: number; kind: 'muster'; side: 0 | 1; type: number; count: number; files: number; x: number; z: number }
  | { tick: number; kind: 'clear' };

interface Unit {
  id: number;
  type: number;
  side: 0 | 1;
  x: number;
  z: number;
  fx: number;
  fz: number;
  hp: number;
  st: St;
  stTick: number;
  target: number;
  cd: number;
  strikeAt: number;
  variant: number;
}

interface Shot {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  target: number;
  t0: number;
  t1: number;
  damage: number;
}

export const SHOT_KINDS = ['arrow', 'fire', 'bolt'] as const;

export interface World {
  tick: number;
  seed: number;
  rng: number;
  nextId: number;
  types: UnitType[];
  units: Unit[];
  byId: Map<number, Unit>;
  shots: Shot[];
  deaths: number;
}

/** Ticks a fallen soldier lies before it is removed (the renderer sinks it over the last 1.5 s). */
export const CORPSE_TICKS = 140;
const FLINCH_TICKS = 6;
const RETARGET_TICKS = 6;
const CELL = 3;
/** Metres beyond its reach at which a soldier notices a foe and leaves the line to fight it. */
const NOTICE = 7;

export function createWorld(types: UnitType[], seed: number): World {
  return { tick: 0, seed, rng: seed >>> 0 || 1, nextId: 1, types, units: [], byId: new Map(), shots: [], deaths: 0 };
}

/** mulberry32: a fast seeded stream in [0, 1), the same everywhere. */
function rand(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function muster(w: World, i: Extract<SimInput, { kind: 'muster' }>): void {
  const t = w.types[i.type]!;
  const gap = t.radius * 2.3;
  const files = Math.max(1, Math.min(i.files, i.count));
  const ranks = Math.ceil(i.count / files);
  const dir = i.side === 0 ? 1 : -1;
  for (let n = 0; n < i.count; n++) {
    const file = n % files;
    const rank = Math.floor(n / files);
    const u: Unit = {
      id: w.nextId++,
      type: i.type,
      side: i.side,
      // Rank 0 is the front, nearest the foe.
      x: i.x - dir * (rank - (ranks - 1) / 2) * gap + (rand(w) - 0.5) * 0.3,
      z: i.z + (file - (files - 1) / 2) * gap + (rand(w) - 0.5) * 0.3,
      fx: dir,
      fz: 0,
      hp: t.hp,
      st: St.Idle,
      stTick: w.tick,
      target: 0,
      cd: Math.floor(rand(w) * 10),
      strikeAt: -1,
      variant: 0,
    };
    w.units.push(u);
    w.byId.set(u.id, u);
  }
}

function setState(w: World, u: Unit, st: St): void {
  if (u.st === st) return;
  u.st = st;
  u.stTick = w.tick;
}

function damage(w: World, u: Unit, n: number, fromX: number, fromZ: number): void {
  if (u.st === St.Dead) return;
  const t = w.types[u.type]!;
  u.hp -= n;
  // Knock back by the blow's share of the victim's strength.
  const dx = u.x - fromX;
  const dz = u.z - fromZ;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const k = Math.min(0.35, (n / t.hp) * 1.5);
  u.x += (dx / d) * k;
  u.z += (dz / d) * k;
  if (u.hp <= 0) {
    u.hp = 0;
    u.st = St.Dead;
    u.stTick = w.tick;
    w.deaths++;
    return;
  }
  // A flinch interrupts only a soldier not mid-swing, so big hitters still land their blows.
  if (u.st !== St.Attack) {
    u.st = St.Hit;
    u.stTick = w.tick;
  }
}

type Grid = Map<number, Unit[]>;
const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

function buildGrid(w: World): Grid {
  const g: Grid = new Map();
  for (const u of w.units) {
    if (u.st === St.Dead) continue;
    const k = cellKey(Math.floor(u.x / CELL), Math.floor(u.z / CELL));
    let l = g.get(k);
    if (!l) g.set(k, (l = []));
    l.push(u);
  }
  return g;
}

/** The nearest living foe within `r`, ties to the lower id: deterministic whatever the grid's order. */
function nearestFoe(g: Grid, u: Unit, r: number): Unit | null {
  const c = Math.ceil(r / CELL);
  const cx = Math.floor(u.x / CELL);
  const cz = Math.floor(u.z / CELL);
  let best: Unit | null = null;
  let bd = r * r;
  for (let i = -c; i <= c; i++)
    for (let j = -c; j <= c; j++) {
      const l = g.get(cellKey(cx + i, cz + j));
      if (!l) continue;
      for (const f of l) {
        if (f.side === u.side) continue;
        const dx = f.x - u.x;
        const dz = f.z - u.z;
        const d = dx * dx + dz * dz;
        if (d < bd || (d === bd && best && f.id < best.id)) {
          bd = d;
          best = f;
        }
      }
    }
  return best;
}

function face(u: Unit, dx: number, dz: number): void {
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-6) {
    u.fx = dx / d;
    u.fz = dz / d;
  }
}

export function step(w: World, inputs: readonly SimInput[]): void {
  for (const i of inputs) {
    if (i.kind === 'clear') {
      w.units = [];
      w.byId.clear();
      w.shots = [];
    } else muster(w, i);
  }
  const g = buildGrid(w);
  const alive = [0, 0];
  for (const u of w.units) if (u.st !== St.Dead) alive[u.side]!++;
  for (const u of w.units) {
    if (u.st === St.Dead) continue;
    const t = w.types[u.type]!;
    const swingTicks = Math.max(1, Math.round(t.swing * TICKS_PER_S));
    u.cd--;
    if (u.st === St.Attack) {
      if (w.tick === u.strikeAt) strike(w, u, t);
      if (w.tick >= u.stTick + swingTicks) setState(w, u, St.Idle);
      continue;
    }
    if (u.st === St.Hit) {
      if (w.tick >= u.stTick + FLINCH_TICKS) setState(w, u, St.Idle);
      continue;
    }
    let foe = u.target ? w.byId.get(u.target) : undefined;
    if (!foe || foe.st === St.Dead || (w.tick + u.id) % RETARGET_TICKS === 0) {
      const reach = t.shot ? t.range : t.range + t.radius + 1;
      foe = nearestFoe(g, u, reach + NOTICE) ?? undefined;
      u.target = foe?.id ?? 0;
    }
    const step = t.speed * TICK_S;
    if (!foe) {
      // No foe near: the line advances on the enemy while there is one, in its own lane.
      if (alive[1 - u.side]! > 0) {
        const dir = u.side === 0 ? 1 : -1;
        u.x += dir * step;
        face(u, dir, 0);
        setState(w, u, St.Walk);
      } else setState(w, u, St.Idle);
      continue;
    }
    const ft = w.types[foe.type]!;
    const dx = foe.x - u.x;
    const dz = foe.z - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const reach = t.shot ? t.range : t.range + t.radius + ft.radius - 0.3;
    face(u, dx, dz);
    if (d > reach) {
      const k = Math.min(step, d - reach + 0.05) / (d || 1);
      u.x += dx * k;
      u.z += dz * k;
      setState(w, u, St.Walk);
    } else if (u.cd <= 0) {
      u.st = St.Attack;
      u.stTick = w.tick;
      u.strikeAt = w.tick + Math.max(1, Math.round(t.hitAt * swingTicks));
      u.cd = Math.max(swingTicks, Math.round(t.cooldown * TICKS_PER_S)) + Math.floor(rand(w) * 4);
      u.variant = Math.floor(rand(w) * t.variants);
    } else setState(w, u, St.Idle);
  }
  separate(w);
  w.shots = w.shots.filter((s) => {
    if (w.tick < s.t1) return true;
    const foe = w.byId.get(s.target);
    if (foe && foe.st !== St.Dead) damage(w, foe, s.damage, s.x, s.z);
    return false;
  });
  // Corpses lie a while, then go.
  if (w.tick % 10 === 0) {
    w.units = w.units.filter((u) => {
      const keep = u.st !== St.Dead || w.tick - u.stTick < CORPSE_TICKS;
      if (!keep) w.byId.delete(u.id);
      return keep;
    });
  }
  w.tick++;
}

function strike(w: World, u: Unit, t: UnitType): void {
  const foe = w.byId.get(u.target);
  if (!foe || foe.st === St.Dead) return;
  if (!t.shot) {
    const dx = foe.x - u.x;
    const dz = foe.z - u.z;
    const reach = t.range + t.radius + w.types[foe.type]!.radius + 0.4;
    if (dx * dx + dz * dz <= reach * reach) damage(w, foe, t.damage, u.x, u.z);
    return;
  }
  const dx = foe.x - u.x;
  const dz = foe.z - u.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const speed = t.shot === 'arrow' ? 18 : 10;
  w.shots.push({ id: w.nextId++, kind: SHOT_KINDS.indexOf(t.shot), x: u.x, y: (t.fly ?? 0) + 1.3, z: u.z, target: foe.id, t0: w.tick, t1: w.tick + Math.max(2, Math.ceil((d / speed) * TICKS_PER_S)), damage: t.damage });
}

/** Relaxation passes per tick: one leaves a dense crowd half-resolved; three settle it. */
const SEPARATION_PASSES = 3;

/**
 * Pushes overlapping soldiers fully apart, friend or foe, so lines press against each other
 * instead of merging. Walkers and flyers each collide only within their own layer. The grid is
 * rebuilt each pass from where soldiers now stand, and searched wide enough to reach the biggest
 * soldier's circle. Heavier soldiers (by area) give less ground.
 */
function separate(w: World): void {
  const maxR = w.types.reduce((m, t) => Math.max(m, t.radius), 0);
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    const g = buildGrid(w);
    for (const u of w.units) {
      if (u.st === St.Dead) continue;
      const t = w.types[u.type]!;
      const fly = !!t.fly;
      const span = Math.ceil((t.radius + maxR) / CELL);
      const cx = Math.floor(u.x / CELL);
      const cz = Math.floor(u.z / CELL);
      for (let i = -span; i <= span; i++)
        for (let j = -span; j <= span; j++) {
          const l = g.get(cellKey(cx + i, cz + j));
          if (!l) continue;
          for (const o of l) {
            if (o.id <= u.id) continue;
            const ot = w.types[o.type]!;
            if (!!ot.fly !== fly) continue;
            const dx = o.x - u.x;
            const dz = o.z - u.z;
            const min = t.radius + ot.radius;
            const d2 = dx * dx + dz * dz;
            if (d2 >= min * min) continue;
            let d = Math.sqrt(d2);
            let nx = dx;
            let nz = dz;
            if (d < 1e-4) {
              // Exactly stacked: part them along a direction fixed by their ids.
              nx = (o.id - u.id) % 2 === 0 ? 1 : -1;
              nz = 0.5;
              d = Math.sqrt(nx * nx + nz * nz);
            }
            const over = (min - d) / d;
            const mu = t.radius * t.radius;
            const mo = ot.radius * ot.radius;
            const ku = mo / (mu + mo);
            u.x -= nx * over * ku;
            u.z -= nz * over * ku;
            o.x += nx * over * (1 - ku);
            o.z += nz * over * (1 - ku);
          }
        }
    }
  }
}

// ---- Snapshots and checksums ----

/** Floats per unit in a snapshot. */
export const U_STRIDE = 11;
/** Floats per shot. */
export const S_STRIDE = 8;

export interface Snapshot {
  tick: number;
  units: Float32Array;
  shots: Float32Array;
  alive: [number, number];
}

export function snapshot(w: World): Snapshot {
  const units = new Float32Array(w.units.length * U_STRIDE);
  const alive: [number, number] = [0, 0];
  w.units.forEach((u, i) => {
    const t = w.types[u.type]!;
    units.set([u.id, u.type, u.side, u.x, u.z, u.fx, u.fz, u.hp / t.hp, u.st, u.stTick, u.variant], i * U_STRIDE);
    if (u.st !== St.Dead) alive[u.side]++;
  });
  const shots = new Float32Array(w.shots.length * S_STRIDE);
  w.shots.forEach((s, i) => shots.set([s.id, s.kind, s.x, s.y, s.z, s.target, s.t0, s.t1], i * S_STRIDE));
  return { tick: w.tick, units, shots, alive };
}

/** FNV-1a over every soldier's quantised position, health and state: equal checksums, equal battles. */
export function checksum(w: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
  };
  mix(w.tick);
  for (const u of w.units) {
    mix(u.id);
    mix(Math.round(u.x * 1024));
    mix(Math.round(u.z * 1024));
    mix(Math.round(u.hp * 16));
    mix(u.st);
  }
  for (const s of w.shots) mix(s.id);
  return h >>> 0;
}
