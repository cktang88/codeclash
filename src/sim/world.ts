import {
  KIND_COUNT,
  Kind,
  NEUTRAL,
  BlastKind,
  PlatoonState,
  ShotKind,
  Terrain,
  TICKS_PER_MINUTE,
  type MapDef,
  type Platoon,
  type PlayerState,
  type Shot,
  type SimInput,
  type Structure,
  type TickEvents,
  type Unit,
  type WarParams,
  type World,
} from './api.ts';
import { attackerMultiplier, computeAuras, enemiesNear, findTarget, structureDamage, unitDamage, mitigated } from './combat.ts';
import { capitalOwner, runCouncil, sitePresence } from './council.ts';
import { derived } from './derived.ts';
import { cellAt } from './flowfield.ts';
import { cleanLines, isBalanced, musterCounts, slotsOf } from './muster.ts';
import { nextRandom, seedRng } from './rng.ts';
import { AURA_HEAL, indexWorld, scratchFor, type Scratch } from './scratch.ts';
import { bucketX, bucketY, rebuildSpatialHash } from './spatial.ts';
import {
  ARROW_SPEED,
  CAPITAL_HP,
  CAPITAL_TOWER,
  CAPTURE_TICKS,
  CHAMPION_MORALE_FLOOR,
  COUNCIL_PERIOD,
  CRY_DURATION,
  CRY_SPEED,
  DOCTRINE_COOLDOWN,
  FOREST_SPEED,
  HEART_CAPTURE_TICKS,
  HERALD_HEAL,
  MAX_ALIVE,
  MELEE_WINDUP,
  MERCENARY_CONTRACT,
  TROLL_CONTRACT,
  MONOLITH_TOWER,
  MORALE_LOSS,
  MORALE_MAX,
  MORALE_RALLY,
  MORALE_RECOVER,
  OUTNUMBERED_DRAIN,
  PLATOON_MAX,
  PLAYER_ALIVE,
  QUEUE_LIMIT,
  RALLY_COOLDOWN,
  RALLY_DURATION,
  SACK_REBUILD,
  SACK_RENOWN,
  SACK_RUIN_TICKS,
  SPACING,
  STATS,
  UNGARRISONED_SHARE,
  matchup,
  doctrineSpeed,
  monolithHp,
} from './stats.ts';
import { flowDirection, flyMove, passableAt, resolveMove, separation, towards, type Vec } from './steering.ts';

const KNIGHT_CHARGE = 1.8;
const KNIGHT_CHARGE_RUN = 40;
const HEAL_PERIOD = 10;
const PALADIN_REACH = 40;
const CLERIC_REACH = 80;
const BREATH_COS = 0.9;
const BREATH_STRUCTURE = 0.3;
const SCORCH_TICKS = 15;

const ENGAGE_CALM_TICKS = 10;
const LEASH = 1.7;
const KITE = 0.5;
const ROUT_SPEED = 1.3;
const CATCH_UP = 1.35;
const SLOT_TOLERANCE = 2.5;
const STRAGGLE = 28;
const STRUCTURE_REACH = 0.75;
const OUTNUMBER_CHECK = 5;

const speedOf = (kind: number) => STATS[kind]!.speed;

export function emptyEvents(): TickEvents {
  return {
    swings: [], shots: [], breaths: [], blasts: [], heals: [], hits: [], deaths: [], musters: [], marches: [], routs: [], disbands: [],
    captures: [], sacks: [], rebuilt: [], regroups: [], monolith: null, cries: [], doctrines: [], rallies: [], joins: [],
    leader: null, departures: [],
  };
}

export function createWorld(params: WarParams, map: MapDef): World {
  derived(map);
  const heart = map.sites.findIndex((s) => s.kind === 'heart');
  const hp = monolithHp(params.members);
  return {
    tick: 0,
    params,
    map,
    rng: seedRng(params.seed),
    nextId: 1,
    units: [],
    platoons: [],
    structures: [{ site: heart, p: NEUTRAL, hp, maxHp: hp, cooldown: 0, ruinedUntil: -1, sacked: 0 }],
    shots: [],
    players: [],
    sites: map.sites.map((s) => ({ id: s.id, owner: NEUTRAL, capturer: NEUTRAL, progress: 0 })),
    leader: NEUTRAL,
    monolithFallen: false,
  };
}

export function step(world: World, inputs: readonly SimInput[]): TickEvents {
  const ev = emptyEvents();
  const s = scratchFor(world);
  for (const input of inputs) applyInput(world, input, ev);
  indexWorld(world, s, speedOf);
  if (releaseQueues(world, s, ev)) indexWorld(world, s, speedOf);
  computeAuras(world, s);

  const n = world.players.length;
  if (n > 0) {
    const stagger = Math.max(1, Math.floor(COUNCIL_PERIOD / n));
    let presence: Int32Array | null = null;
    for (let p = 0; p < n; p++) {
      if (world.tick % COUNCIL_PERIOD !== (p * stagger) % COUNCIL_PERIOD) continue;
      presence ??= sitePresence(world);
      runCouncil(world, s, p, presence);
    }
  }

  s.rallied.length = 0;
  updatePlatoons(world, s, ev);
  updateUnits(world, s, ev);
  updateStructures(world, s, ev);
  updateShots(world, s, ev);
  resolveDamage(world, s, ev);
  rebuildSpatialHash(s.hash, world.units);
  updateMorale(world, s, ev);
  regroup(world, s, ev);
  updateCaptures(world, ev);
  if (world.tick > 0 && world.tick % TICKS_PER_MINUTE === 0) awardHoldings(world);
  updateLeader(world, ev);
  world.tick++;
  return ev;
}

// ---------------------------------------------------------------- inputs

/** Whole numbers only: inputs come from replay files and the network, so they are untrusted. */
const whole = (n: unknown): n is number => Number.isInteger(n);

function applyInput(world: World, input: SimInput, ev: TickEvents): void {
  const { tick } = world;
  if (typeof input !== 'object' || input === null || !whole(input.p)) return;
  if (input.kind === 'join') {
    if (input.p !== world.players.length || !whole(input.slot)) return;
    if (input.slot < 0 || input.slot >= world.map.slots || capitalOwner(world, input.slot) !== NEUTRAL) return;
    world.players.push(newPlayer(input.p, input.slot, Number.isFinite(input.hue) ? input.hue : 0));
    world.structures.push({ site: input.slot, p: input.p, hp: CAPITAL_HP, maxHp: CAPITAL_HP, cooldown: 0, ruinedUntil: -1, sacked: 0 });
    ev.joins.push({ p: input.p });
    return;
  }
  const player = world.players[input.p];
  if (!player) return;
  switch (input.kind) {
    case 'push':
      if (!whole(input.repo) || input.repo < 0) return;
      musterPush(world, player, input.repo, cleanLines(input.lines), typeof input.msg === 'string' ? input.msg : '', ev);
      return;
    case 'doctrine':
      if (!whole(input.doctrine) || input.doctrine < 0 || input.doctrine > 4 || input.doctrine === player.doctrine) return;
      if (player.doctrineAt >= 0 && tick - player.doctrineAt < DOCTRINE_COOLDOWN) return;
      player.doctrine = input.doctrine;
      player.doctrineAt = tick;
      ev.doctrines.push({ p: player.p, doctrine: input.doctrine });
      return;
    case 'rally':
      if (!whole(input.site) || input.site < 0 || input.site >= world.map.sites.length) return;
      if (player.rallyAt >= 0 && tick - player.rallyAt < RALLY_COOLDOWN) return;
      player.rallySite = input.site;
      player.rallyUntil = tick + RALLY_DURATION;
      player.rallyAt = tick;
      ev.rallies.push({ p: player.p, site: input.site });
      return;
    case 'cry':
      if (player.cryUsed) return;
      player.cryUsed = true;
      player.cryUntil = tick + CRY_DURATION;
      ev.cries.push({ p: player.p });
      return;
  }
}

function newPlayer(p: number, slot: number, hue: number): PlayerState {
  return {
    p, slot, hue,
    doctrine: 0, doctrineAt: -1,
    rallySite: -1, rallyUntil: -1, rallyAt: -1,
    cryUntil: -1, cryUsed: false,
    renown: 0, pushes: 0, recentPushes: [],
    lines: new Array<number>(9).fill(0),
    raised: new Array<number>(KIND_COUNT).fill(0),
    slain: new Array<number>(KIND_COUNT).fill(0),
    kills: 0, losses: 0, structureDamage: 0, monolithDamage: 0, captures: 0, sacks: 0, routs: 0, balanced: 0, best: null,
    queue: [], battalions: [],
  };
}

function musterPush(world: World, player: PlayerState, repo: number, lines: readonly number[], msg: string, ev: TickEvents): void {
  const hourAgo = world.tick - 60 * TICKS_PER_MINUTE;
  while (player.recentPushes.length > 0 && player.recentPushes[0]! <= hourAgo) player.recentPushes.shift();
  const counts = musterCounts(lines, player.recentPushes.length, player.pushes, msg);
  player.pushes++;
  player.recentPushes.push(world.tick);
  for (let c = 0; c < player.lines.length; c++) player.lines[c]! += lines[c]!;
  if (isBalanced(lines)) player.balanced++;
  for (let k = 0; k < KIND_COUNT; k++) player.raised[k]! += counts[k]!;

  const lastQueued = player.queue.length > 0 ? world.platoons.find((pl) => pl.id === player.queue[player.queue.length - 1]) : undefined;
  if (player.queue.length >= QUEUE_LIMIT && lastQueued) {
    // The muster queue is full: fold this push's soldiers into the last waiting platoon.
    let slots = slotsOf(lastQueued.mustered);
    for (let k = 0; k < KIND_COUNT; k++) {
      const add = Math.min(counts[k]!, Math.floor((PLATOON_MAX - slots) / STATS[k]!.slots));
      lastQueued.mustered[k]! += add;
      lastQueued.size += add;
      slots += add * STATS[k]!.slots;
    }
    lastQueued.champion = lastQueued.mustered[Kind.Champion]! + lastQueued.mustered[Kind.Dragon]! > 0;
    return;
  }
  let battalion = player.battalions.find((b) => b[0] === repo);
  if (!battalion) {
    battalion = [repo, 0];
    player.battalions.push(battalion);
  }
  battalion[1]++;
  const capital = world.map.sites[player.slot]!;
  let size = 0;
  for (const c of counts) size += c;
  const platoon: Platoon = {
    id: world.nextId++,
    p: player.p,
    repo,
    ordinal: battalion[1],
    state: PlatoonState.Queued,
    x: capital.x,
    y: capital.y,
    hx: 0,
    hy: 0,
    site: -1,
    morale: MORALE_MAX,
    size,
    alive: 0,
    mustered: counts,
    arrivedTick: world.tick,
    kills: 0,
    depth: 0,
    champion: counts[Kind.Champion]! + counts[Kind.Dragon]! > 0,
    calm: ENGAGE_CALM_TICKS,
  };
  world.platoons.push(platoon);
  player.queue.push(platoon.id);
  ev.musters.push({ platoon: platoon.id, p: player.p, queued: true });
}

// ------------------------------------------------------------- mustering

/** Marches waiting platoons out while there is room. Returns whether any marched. */
function releaseQueues(world: World, s: Scratch, ev: TickEvents): boolean {
  let marched = false;
  for (const player of world.players) {
    while (player.queue.length > 0) {
      const platoon = world.platoons.find((pl) => pl.id === player.queue[0]);
      if (!platoon) {
        player.queue.shift();
        continue;
      }
      const slots = slotsOf(platoon.mustered);
      if (s.alive[player.p]! + slots > PLAYER_ALIVE || world.units.length + platoon.size > MAX_ALIVE) break;
      player.queue.shift();
      deploy(world, player, platoon);
      s.alive[player.p]! += slots;
      ev.marches.push({ platoon: platoon.id });
      marched = true;
    }
  }
  return marched;
}

// Bands from front to rear; each band fills rows centered on the banner.
const BANDS: readonly Kind[][] = [
  [Kind.Troll, Kind.BoneGolem, Kind.Paladin, Kind.Warden, Kind.Skeleton],
  [Kind.Champion, Kind.Knight, Kind.Footman, Kind.Mercenary, Kind.Berserker],
  [Kind.Sapper],
  [Kind.Wizard, Kind.Ranger, Kind.Archer, Kind.Herald, Kind.Cleric],
  [Kind.Trebuchet],
];
const FLANKS: readonly Kind[] = [Kind.GriffinRider, Kind.Outrider];

/** Formation offsets (forward, lateral) for each soldier. */
function formation(counts: readonly number[]): { kind: Kind; f: number; l: number }[] {
  let total = 0;
  for (const band of BANDS) for (const k of band) total += counts[k]!;
  const cols = Math.max(3, Math.ceil(Math.sqrt(total * 1.6)));
  const rows: { kinds: Kind[]; gap: number }[] = [];
  for (const band of BANDS) {
    const members: Kind[] = [];
    for (const k of band) for (let i = 0; i < counts[k]!; i++) members.push(k);
    if (members.length === 0) continue;
    let gap = SPACING;
    for (const k of members) gap = Math.max(gap, STATS[k]!.size * 2 + 2);
    const perRow = Math.max(1, Math.floor((cols * SPACING) / gap));
    for (let i = 0; i < members.length; i += perRow) rows.push({ kinds: members.slice(i, i + perRow), gap });
  }
  let depth = 0;
  const forward: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (r > 0) depth += (rows[r - 1]!.gap + rows[r]!.gap) / 2;
    forward.push(-depth);
  }
  const out: { kind: Kind; f: number; l: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const f = forward[r]! + depth / 2;
    for (let c = 0; c < row.kinds.length; c++) out.push({ kind: row.kinds[c]!, f, l: (c - (row.kinds.length - 1) / 2) * row.gap });
  }
  const wing = ((cols - 1) / 2 + 1.8) * SPACING;
  let n = 0;
  for (const k of FLANKS) {
    for (let i = 0; i < counts[k]!; i++, n++) {
      const side = n % 2 === 0 ? 1 : -1;
      out.push({ kind: k, f: depth / 2 - Math.floor(n / 2) * SPACING * 1.6, l: side * (wing + STATS[k]!.size) });
    }
  }
  for (let i = 0; i < counts[Kind.Dragon]!; i++) out.push({ kind: Kind.Dragon, f: -depth / 2 - 26, l: 0 });
  return out;
}

function deploy(world: World, player: PlayerState, platoon: Platoon): void {
  const capital = world.map.sites[player.slot]!;
  const d = Math.sqrt(capital.x * capital.x + capital.y * capital.y) || 1;
  platoon.hx = -capital.x / d;
  platoon.hy = -capital.y / d;
  const gate = capital.radius + 24;
  platoon.x = capital.x + platoon.hx * gate;
  platoon.y = capital.y + platoon.hy * gate;
  platoon.state = PlatoonState.March;
  platoon.arrivedTick = world.tick;
  platoon.alive = 0;
  // One Dragon per army: a second legendary push sends a Champion instead.
  if (platoon.mustered[Kind.Dragon]! > 0 && world.units.some((u) => u.p === player.p && u.kind === Kind.Dragon)) {
    platoon.mustered[Kind.Dragon]!--;
    platoon.mustered[Kind.Champion]!++;
  }
  for (const slot of formation(platoon.mustered)) {
    const jx = (nextRandom(world) - 0.5) * 3;
    const jy = (nextRandom(world) - 0.5) * 3;
    let x = platoon.x + platoon.hx * slot.f - platoon.hy * slot.l + jx;
    let y = platoon.y + platoon.hy * slot.f + platoon.hx * slot.l + jy;
    // A wide formation can reach past the cleared ground around the capital;
    // a soldier whose place is rock or water musters at the gate instead.
    if (!STATS[slot.kind]!.flying && !passableAt(world.map, x, y)) {
      x = platoon.x + jx;
      y = platoon.y + jy;
    }
    const hp = STATS[slot.kind]!.hp;
    const unit: Unit = {
      id: world.nextId++,
      p: player.p,
      platoon: platoon.id,
      kind: slot.kind,
      x,
      y,
      hp,
      maxHp: hp,
      target: 0,
      cooldown: 0,
      swingAt: -1,
      leavesAt: slot.kind === Kind.Mercenary ? world.tick + MERCENARY_CONTRACT : slot.kind === Kind.Troll ? world.tick + TROLL_CONTRACT : -1,
      fx: slot.f,
      fy: slot.l,
      run: 0,
      scorched: -1,
    };
    world.units.push(unit);
    platoon.alive++;
  }
}

// --------------------------------------------------------------- platoons

const dir: Vec = { x: 0, y: 0 };
const push: Vec = { x: 0, y: 0 };
const moved: Vec = { x: 0, y: 0 };

function holdDistance(world: World, platoon: Platoon): number {
  const def = world.map.sites[platoon.site]!;
  if (def.kind === 'capital' && def.slot !== world.players[platoon.p]!.slot) return def.radius + 34;
  if (def.kind === 'heart' && !world.monolithFallen) return def.radius + 34;
  return Math.max(16, def.radius * 0.35);
}

function updatePlatoons(world: World, s: Scratch, ev: TickEvents): void {
  const { map } = world;
  const flow = derived(map).flow;
  for (let i = 0; i < world.platoons.length; i++) {
    const pl = world.platoons[i]!;
    if (pl.state === PlatoonState.Queued) continue;
    const player = world.players[pl.p]!;
    const members = s.members[i]!;
    pl.alive = members;
    if (members === 0) continue;
    const cx = s.px[i]! / members;
    const cy = s.py[i]! / members;

    if (pl.state === PlatoonState.Rout) {
      // Routed soldiers flee home on their own; the banner goes with them, so a
      // banner left over rock or water cannot keep the platoon routed forever.
      const home = map.sites[player.slot]!;
      pl.x = cx;
      pl.y = cy;
      const dx = home.x - pl.x;
      const dy = home.y - pl.y;
      if (dx * dx + dy * dy < (home.radius + 40) * (home.radius + 40)) {
        pl.state = PlatoonState.March;
        pl.morale = MORALE_RALLY;
        pl.site = player.slot;
        s.rallied.push(pl.id);
      }
      continue;
    }

    if (pl.calm === 0 && pl.state !== PlatoonState.Engage) pl.state = PlatoonState.Engage;
    if (pl.state === PlatoonState.Engage) {
      // Follow the melee: the banner drifts toward where its soldiers are fighting,
      // but never onto rock or water, where it could not march on from.
      const nx = pl.x + (cx - pl.x) * 0.08;
      const ny = pl.y + (cy - pl.y) * 0.08;
      if (passableAt(map, nx, ny)) {
        pl.x = nx;
        pl.y = ny;
      }
      if (pl.calm >= ENGAGE_CALM_TICKS) pl.state = PlatoonState.March;
      continue;
    }
    if (pl.site < 0) pl.site = player.slot;
    const def = map.sites[pl.site]!;
    const dx = def.x - pl.x;
    const dy = def.y - pl.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hold = holdDistance(world, pl);
    if (dist <= hold) {
      pl.state = PlatoonState.Hold;
      continue;
    }
    pl.state = PlatoonState.March;
    // Wait for stragglers so the block stays a block.
    const sx = cx - pl.x;
    const sy = cy - pl.y;
    const lag = Math.sqrt(sx * sx + sy * sy);
    let speed = s.slowest[i]! * 0.9 * doctrineSpeed(player.doctrine);
    if (player.cryUntil > world.tick) speed *= CRY_SPEED;
    if (lag > STRAGGLE) speed *= 0.4;
    advanceAnchor(world, pl, flow[pl.site]!, def.x, def.y, Math.min(speed, dist - hold + 0.5));
    const capital = map.sites[player.slot]!;
    const ox = pl.x - capital.x;
    const oy = pl.y - capital.y;
    const depth = Math.sqrt(ox * ox + oy * oy);
    if (depth > pl.depth) pl.depth = depth;
  }
  void ev;
}

function advanceAnchor(world: World, pl: Platoon, field: ReturnType<typeof derived>['flow'][number], gx: number, gy: number, speed: number): void {
  flowDirection(dir, world.map, field, pl.x, pl.y, gx, gy);
  const cell = cellAt(world.map, pl.x, pl.y);
  const pace = cell >= 0 && world.map.terrain[cell] === Terrain.Forest ? FOREST_SPEED : 1;
  resolveMove(moved, world.map, pl.x, pl.y, dir.x * speed * pace, dir.y * speed * pace, speed);
  pl.x = moved.x;
  pl.y = moved.y;
  // Turn the formation gradually toward the direction of travel.
  const hx = pl.hx * 0.85 + dir.x * 0.15;
  const hy = pl.hy * 0.85 + dir.y * 0.15;
  const m = Math.sqrt(hx * hx + hy * hy);
  if (m > 1e-6) {
    pl.hx = hx / m;
    pl.hy = hy / m;
  }
}

// ------------------------------------------------------------------ units

function structureAt(world: World, site: number): number {
  for (let k = 0; k < world.structures.length; k++) if (world.structures[k]!.site === site) return k;
  return -1;
}

function attackable(world: World, k: number, p: number): boolean {
  const st = world.structures[k]!;
  return st.p !== p && st.hp > 0 && st.ruinedUntil < 0;
}

function updateUnits(world: World, s: Scratch, ev: TickEvents): void {
  const { units, map, tick } = world;
  const hash = s.hash;
  s.damage.fill(0, 0, units.length);
  s.heal.fill(0, 0, units.length);
  s.lastHit.fill(-1, 0, units.length);
  s.lastKind.fill(-1, 0, units.length);
  for (let i = 0; i < world.platoons.length; i++) world.platoons[i]!.calm++;

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const stats = STATS[u.kind]!;
    const pi = s.unitPlatoon[i]!;
    const pl = pi >= 0 ? world.platoons[pi]! : undefined;
    const player = u.p >= 0 ? world.players[u.p] : undefined;
    const routing = pl !== undefined && pl.state === PlatoonState.Rout;
    if (u.cooldown > 0) u.cooldown--;

    // A wound-up blow lands this tick if the victim is still within reach.
    if (u.swingAt === tick) {
      u.swingAt = -1;
      const charged = u.run < 0;
      u.run = 0;
      if (u.target > 0) {
        const t = s.unitIndex.get(u.target);
        if (t !== undefined) {
          const v = units[t]!;
          const reach = stats.range * 1.6 + STATS[v.kind]!.size * 0.5;
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          if (dx * dx + dy * dy <= reach * reach) {
            const dmg = unitDamage(world, s, i, t) * (charged ? KNIGHT_CHARGE : 1);
            s.damage[t]! += dmg;
            s.lastHit[t] = u.p;
            s.lastKind[t] = u.kind;
            ev.hits.push({ unit: v.id, damage: dmg, structure: -1 });
          }
        }
      } else if (u.target < 0) {
        damageStructure(world, -u.target - 1, u.p, structureDamage(world, s, i), ev);
      }
    }

    if (stats.heal > 0 && !routing && (tick + u.id) % HEAL_PERIOD === 0) castHeal(world, s, i, stats.heal, u.kind === Kind.Cleric ? CLERIC_REACH : PALADIN_REACH, ev);

    // Targeting: soldiers stay leashed to their banner so platoons fight as blocks.
    let t = u.target > 0 ? (s.unitIndex.get(u.target) ?? -1) : -1;
    const ax = pl ? pl.x : u.x;
    const ay = pl ? pl.y : u.y;
    const leash = stats.aggro * LEASH;
    if (t >= 0) {
      const v = units[t]!;
      const dx = v.x - ax;
      const dy = v.y - ay;
      if (dx * dx + dy * dy > leash * leash || routing) t = -1;
    }
    let structure = -1;
    if (u.kind === Kind.Trebuchet && !routing) {
      // Siege engines would rather batter walls than soldiers.
      structure = nearestStructure(world, u.p, u.x, u.y, stats.range);
      if (structure >= 0) t = -1;
    }
    if (structure < 0 && !routing && (tick + u.id) % (t >= 0 ? 8 : 4) === 0) {
      const found = findTarget(units, hash, i, stats.aggro);
      if (found >= 0) {
        const v = units[found]!;
        const dx = v.x - ax;
        const dy = v.y - ay;
        if (dx * dx + dy * dy <= leash * leash) t = found;
      }
    }
    if (structure < 0 && t < 0 && !routing && pl) {
      structure = u.target < 0 ? -u.target - 1 : -1;
      if (structure >= 0 && !attackable(world, structure, u.p)) structure = -1;
      if (structure < 0) {
        const goal = structureAt(world, pl.site);
        if (goal >= 0 && attackable(world, goal, u.p) && (pl.state === PlatoonState.Hold || u.kind === Kind.Sapper)) structure = goal;
      }
    }
    u.target = t >= 0 ? units[t]!.id : structure >= 0 ? -(structure + 1) : 0;
    if (t >= 0 && pl) {
      pl.calm = 0;
      s.engaged[i] = 1;
    } else s.engaged[i] = 0;

    let pace = 1;
    let moving = true;
    let speed = stats.speed;
    if (player) {
      speed *= doctrineSpeed(player.doctrine);
      if (player.cryUntil > tick) speed *= CRY_SPEED;
    }
    const cell = cellAt(map, u.x, u.y);
    if (!stats.flying && cell >= 0 && map.terrain[cell] === Terrain.Forest) speed *= FOREST_SPEED;

    if (routing) {
      const home = map.sites[player!.slot]!;
      if (stats.flying) towards(dir, u.x, u.y, home.x, home.y);
      else flowDirection(dir, map, derived(map).flow[player!.slot]!, u.x, u.y, home.x, home.y);
      speed *= ROUT_SPEED;
    } else if (t >= 0) {
      const v = units[t]!;
      const dist = towards(dir, u.x, u.y, v.x, v.y);
      const reach = stats.range + STATS[v.kind]!.size * 0.5;
      if (dist <= reach && u.cooldown === 0 && u.swingAt < 0) strike(world, u, v, i, t, dist, s, ev);
      if (stats.ranged) {
        if (dist < stats.range * KITE && !STATS[v.kind]!.ranged) {
          dir.x = -dir.x;
          dir.y = -dir.y;
          pace = 0.7;
        } else if (dist <= stats.range * 0.95) moving = false;
      } else if (dist <= reach * 0.8) moving = false;
    } else if (structure >= 0) {
      const def = map.sites[world.structures[structure]!.site]!;
      const dist = towards(dir, u.x, u.y, def.x, def.y) - def.radius * STRUCTURE_REACH;
      if (dist <= stats.range && u.cooldown === 0 && u.swingAt < 0) {
        u.cooldown = stats.cooldown;
        if (stats.breath) breathe(world, s, i, def.x, def.y, ev);
        else if (stats.ranged) fire(world, s, i, -(structure + 1), def.x, def.y, structureDamage(world, s, i), ev);
        else {
          u.swingAt = tick + MELEE_WINDUP;
          ev.swings.push({ from: u.id, to: -(structure + 1) });
        }
      }
      if (dist <= stats.range * 0.8) moving = false;
    } else if (pl) {
      // Return to this soldier's place in the formation.
      const sx = pl.x + pl.hx * u.fx - pl.hy * u.fy;
      const sy = pl.y + pl.hy * u.fx + pl.hx * u.fy;
      const remaining = towards(dir, u.x, u.y, sx, sy);
      if (remaining <= SLOT_TOLERANCE) moving = false;
      else if (remaining > SPACING * 2) pace = CATCH_UP;
      else pace = Math.min(1, remaining / (SPACING * 1.5) + 0.25);
    } else moving = false;

    separation(push, units, hash, i);
    let vx = push.x;
    let vy = push.y;
    if (moving) {
      vx += dir.x * speed * pace;
      vy += dir.y * speed * pace;
    }
    if (stats.flying) flyMove(moved, map, u.x, u.y, vx, vy, speed * Math.max(1, pace));
    else resolveMove(moved, map, u.x, u.y, vx, vy, speed * Math.max(1, pace));
    if (u.kind === Kind.Knight && u.run >= 0) {
      const mx = moved.x - u.x;
      const my = moved.y - u.y;
      u.run = Math.min(KNIGHT_CHARGE_RUN, u.run + Math.sqrt(mx * mx + my * my));
    }
    s.nx[i] = moved.x;
    s.ny[i] = moved.y;
  }
}

function strike(world: World, u: Unit, v: Unit, i: number, t: number, dist: number, s: Scratch, ev: TickEvents): void {
  const stats = STATS[u.kind]!;
  u.cooldown = stats.cooldown;
  if (stats.breath) breathe(world, s, i, v.x, v.y, ev);
  else if (stats.ranged) fire(world, s, i, v.id, v.x, v.y, unitDamage(world, s, i, t), ev);
  else {
    if (u.kind === Kind.Knight && u.run >= KNIGHT_CHARGE_RUN) u.run = -1;
    u.swingAt = world.tick + MELEE_WINDUP;
    ev.swings.push({ from: u.id, to: v.id });
  }
  void dist;
}

const SHOT_OF: Partial<Record<Kind, ShotKind>> = {
  [Kind.Ranger]: ShotKind.RangerArrow,
  [Kind.Wizard]: ShotKind.Fireball,
  [Kind.Trebuchet]: ShotKind.Boulder,
};
/** Which kind looses each projectile, for crediting kills. */
const SHOOTER: Record<number, Kind> = {
  [ShotKind.Arrow]: Kind.Archer,
  [ShotKind.RangerArrow]: Kind.Ranger,
  [ShotKind.Fireball]: Kind.Wizard,
  [ShotKind.Boulder]: Kind.Trebuchet,
};
const SHOT_SPEED: Record<number, number> = { [ShotKind.Fireball]: 30, [ShotKind.Boulder]: 26 };

/** Looses a projectile at a unit (`target` > 0) or a structure (`target` < 0). */
function fire(world: World, s: Scratch, i: number, target: number, tx: number, ty: number, damage: number, ev: TickEvents): void {
  const u = world.units[i]!;
  const kind = SHOT_OF[u.kind] ?? ShotKind.Arrow;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const flight = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / (SHOT_SPEED[kind] ?? ARROW_SPEED)));
  world.shots.push({ from: u.id, p: u.p, target, x: u.x, y: u.y, landAt: world.tick + flight, damage, kind, splash: STATS[u.kind]!.splash, tx, ty });
  ev.shots.push({ from: u.id, to: target, x: u.x, y: u.y, land: world.tick + flight, kind });
  void s;
}

/** A dragon's fire: every enemy in a cone toward (tx, ty) burns at once. */
function breathe(world: World, s: Scratch, i: number, tx: number, ty: number, ev: TickEvents): void {
  const u = world.units[i]!;
  const stats = STATS[u.kind]!;
  const range = stats.range;
  let dx = tx - u.x;
  let dy = ty - u.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= d;
  dy /= d;
  const ex = u.x + dx * range;
  const ey = u.y + dy * range;
  const hash = s.hash;
  const reach = Math.floor(range / hash.cell) + 1;
  const bx = bucketX(hash, u.x);
  const by = bucketY(hash, u.y);
  const player = u.p >= 0 ? world.players[u.p] : undefined;
  const raw = stats.damage * attackerMultiplier(world, s, i, player);
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = world.units[j]!;
        if (v.p === u.p) continue;
        const vx = v.x - u.x;
        const vy = v.y - u.y;
        const dist = Math.sqrt(vx * vx + vy * vy);
        if (dist > range + STATS[v.kind]!.size * 0.5) continue;
        if (dist > 1e-6 && (vx * dx + vy * dy) / dist < BREATH_COS) continue;
        const dmg = mitigated(world, s, j, raw * matchup(u.kind, v.kind), false);
        s.damage[j]! += dmg;
        s.lastHit[j] = u.p;
        s.lastKind[j] = u.kind;
        v.scorched = world.tick + SCORCH_TICKS;
        ev.hits.push({ unit: v.id, damage: dmg, structure: -1 });
      }
    }
  }
  for (let k = 0; k < world.structures.length; k++) {
    if (!attackable(world, k, u.p)) continue;
    const def = world.map.sites[world.structures[k]!.site]!;
    const vx = def.x - u.x;
    const vy = def.y - u.y;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist > range + def.radius) continue;
    if (dist > def.radius && (vx * dx + vy * dy) / dist < BREATH_COS) continue;
    damageStructure(world, k, u.p, raw * BREATH_STRUCTURE, ev);
  }
  ev.breaths.push({ from: u.id, x: u.x, y: u.y, tx: ex, ty: ey, range });
  ev.blasts.push({ x: u.x + dx * range * 0.6, y: u.y + dy * range * 0.6, radius: 25, kind: BlastKind.Scorch });
}

/** Heals the most wounded friend within reach. */
function castHeal(world: World, s: Scratch, i: number, amount: number, reach: number, ev: TickEvents): void {
  const u = world.units[i]!;
  const hash = s.hash;
  const cells = Math.floor(reach / hash.cell) + 1;
  const bx = bucketX(hash, u.x);
  const by = bucketY(hash, u.y);
  let best = -1;
  let bestMissing = 0;
  for (let cy = Math.max(0, by - cells); cy <= Math.min(hash.rows - 1, by + cells); cy++) {
    for (let cx = Math.max(0, bx - cells); cx <= Math.min(hash.cols - 1, bx + cells); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = world.units[j]!;
        if (v.p !== u.p) continue;
        const missing = v.maxHp - v.hp - s.heal[j]!;
        if (missing < amount * 0.25) continue;
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (missing > bestMissing || (missing === bestMissing && j < best)) {
          best = j;
          bestMissing = missing;
        }
      }
    }
  }
  if (best < 0) return;
  const healed = Math.min(amount, bestMissing);
  s.heal[best]! += healed;
  ev.heals.push({ from: u.id, to: world.units[best]!.id, amount: healed });
}

function nearestStructure(world: World, p: number, x: number, y: number, range: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < world.structures.length; k++) {
    if (!attackable(world, k, p)) continue;
    const def = world.map.sites[world.structures[k]!.site]!;
    const dx = def.x - x;
    const dy = def.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) - def.radius * STRUCTURE_REACH;
    if (d <= range && d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function damageStructure(world: World, k: number, p: number, amount: number, ev: TickEvents): void {
  if (!attackable(world, k, p)) return;
  const st = world.structures[k]!;
  const dmg = Math.min(st.hp, amount);
  st.hp -= dmg;
  ev.hits.push({ unit: -1, damage: dmg, structure: k });
  const player = world.players[p];
  if (!player) return;
  if (st.p === NEUTRAL) {
    const before = Math.floor(player.monolithDamage / 100);
    player.monolithDamage += dmg;
    player.renown += Math.floor(player.monolithDamage / 100) - before;
    if (st.hp <= 0) {
      world.monolithFallen = true;
      ev.monolith = { p };
    }
    return;
  }
  player.structureDamage += dmg;
  if (st.hp <= 0) {
    st.hp = 0;
    st.ruinedUntil = world.tick + SACK_RUIN_TICKS;
    st.sacked++;
    player.renown += Math.floor(SACK_RENOWN / st.sacked);
    player.sacks++;
    ev.sacks.push({ site: st.site, p, victim: st.p });
  }
}

// ------------------------------------------------------------- structures

function updateStructures(world: World, s: Scratch, ev: TickEvents): void {
  const { tick, units } = world;
  for (let k = 0; k < world.structures.length; k++) {
    const st = world.structures[k]!;
    if (st.ruinedUntil >= 0) {
      if (tick >= st.ruinedUntil) {
        st.ruinedUntil = -1;
        st.hp = st.maxHp * SACK_REBUILD;
        ev.rebuilt.push({ site: st.site });
      }
      continue;
    }
    if (st.hp <= 0) continue;
    if (st.cooldown > 0) {
      st.cooldown--;
      continue;
    }
    const tower = st.p === NEUTRAL ? MONOLITH_TOWER : CAPITAL_TOWER;
    const def = world.map.sites[st.site]!;
    const t = nearestEnemy(world, s, st.p, def.x, def.y, tower.range + def.radius * 0.5);
    if (t < 0) continue;
    const v = units[t]!;
    const dx = v.x - def.x;
    const dy = v.y - def.y;
    const flight = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / ARROW_SPEED));
    world.shots.push({ from: -(k + 1), p: st.p, target: v.id, x: def.x, y: def.y, landAt: tick + flight, damage: tower.damage, kind: ShotKind.TowerBolt, splash: 0, tx: v.x, ty: v.y });
    ev.shots.push({ from: -(k + 1), to: v.id, x: def.x, y: def.y, land: tick + flight, kind: ShotKind.TowerBolt });
    st.cooldown = tower.cooldown;
  }
}

function nearestEnemy(world: World, s: Scratch, p: number, x: number, y: number, radius: number): number {
  const hash = s.hash;
  const reach = Math.floor(radius / hash.cell) + 1;
  const bx = bucketX(hash, x);
  const by = bucketY(hash, y);
  let best = -1;
  let bestD = radius * radius;
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = world.units[j]!;
        if (v.p === p) continue;
        const dx = v.x - x;
        const dy = v.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD || (d2 === bestD && j < best)) {
          bestD = d2;
          best = j;
        }
      }
    }
  }
  return best;
}

function updateShots(world: World, s: Scratch, ev: TickEvents): void {
  let w = 0;
  for (let i = 0; i < world.shots.length; i++) {
    const shot = world.shots[i]!;
    if (shot.landAt > world.tick) {
      world.shots[w++] = shot;
      continue;
    }
    if (shot.target < 0) {
      const k = -shot.target - 1;
      const def = world.map.sites[world.structures[k]!.site]!;
      damageStructure(world, k, shot.p, shot.damage, ev);
      if (shot.splash > 0) ev.blasts.push({ x: def.x, y: def.y, radius: shot.splash, kind: shot.kind });
      continue;
    }
    const t = s.unitIndex.get(shot.target);
    if (shot.splash > 0) {
      const x = t !== undefined ? world.units[t]!.x : shot.tx;
      const y = t !== undefined ? world.units[t]!.y : shot.ty;
      splash(world, s, shot, x, y, ev);
      continue;
    }
    if (t === undefined) continue;
    const dmg = shot.kind === ShotKind.TowerBolt ? mitigated(world, s, t, shot.damage, true) : shot.damage;
    s.damage[t]! += dmg;
    if (shot.p >= 0) {
      s.lastHit[t] = shot.p;
      s.lastKind[t] = SHOOTER[shot.kind] ?? -1;
    } else if (s.lastHit[t]! < 0) s.lastHit[t] = -2;
    ev.hits.push({ unit: shot.target, damage: dmg, structure: -1 });
  }
  world.shots.length = w;
}

/** Area damage: full at the center, half at the edge. */
function splash(world: World, s: Scratch, shot: Shot, x: number, y: number, ev: TickEvents): void {
  const hash = s.hash;
  const r = shot.splash;
  const reach = Math.floor(r / hash.cell) + 1;
  const bx = bucketX(hash, x);
  const by = bucketY(hash, y);
  const fiery = shot.kind === ShotKind.Fireball;
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = world.units[j]!;
        if (v.p === shot.p) continue;
        const dx = v.x - x;
        const dy = v.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const dmg = mitigated(world, s, j, shot.damage * (1 - 0.5 * (d / r)), true);
        s.damage[j]! += dmg;
        if (shot.p >= 0) {
          s.lastHit[j] = shot.p;
          s.lastKind[j] = SHOOTER[shot.kind] ?? -1;
        }
        if (fiery) v.scorched = world.tick + SCORCH_TICKS;
        ev.hits.push({ unit: v.id, damage: dmg, structure: -1 });
      }
    }
  }
  ev.blasts.push({ x, y, radius: r, kind: shot.kind });
}

// ----------------------------------------------------------------- damage

function resolveDamage(world: World, s: Scratch, ev: TickEvents): void {
  const { units, tick } = world;
  let w = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    u.x = s.nx[i]!;
    u.y = s.ny[i]!;
    u.hp -= s.damage[i]!;
    if (u.hp > 0) {
      let mend = s.heal[i]!;
      if ((s.aura[i]! & AURA_HEAL) !== 0) mend += HERALD_HEAL;
      const regen = STATS[u.kind]!.regen;
      if (regen > 0) mend += u.scorched > tick ? regen * 0.25 : regen;
      if (mend > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + mend);
    }
    const pi = s.unitPlatoon[i]!;
    const pl = pi >= 0 ? world.platoons[pi] : undefined;
    if (u.hp > 0 && u.leavesAt >= 0 && tick >= u.leavesAt && (pl === undefined || pl.state !== PlatoonState.Engage)) {
      ev.departures.push({ unit: u.id });
      if (pl) pl.alive--;
      continue;
    }
    if (u.hp > 0) {
      units[w++] = u;
      continue;
    }
    const killer = s.lastHit[i]!;
    ev.deaths.push({ unit: u.id, p: u.p, kind: u.kind, x: u.x, y: u.y, killer, by: s.lastKind[i]!, platoon: u.platoon });
    if (pl) {
      pl.alive--;
      const loss = MORALE_LOSS / Math.max(1, pl.size);
      pl.morale -= s.heralds[pi]! > 0 ? loss * 0.5 : loss;
    }
    if (u.p >= 0) world.players[u.p]!.losses++;
    if (killer >= 0) {
      const k = world.players[killer]!;
      k.kills++;
      k.slain[u.kind]!++;
      const value = STATS[u.kind]!.value;
      k.renown += u.p >= 0 && u.p === world.leader && killer !== world.leader ? value * 2 : value;
      creditPlatoonKill(world, s, killer, u.x, u.y);
    }
  }
  units.length = w;
}

function creditPlatoonKill(world: World, s: Scratch, p: number, x: number, y: number): void {
  // Credit the killer's engaged platoon nearest the fallen soldier.
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < world.platoons.length; i++) {
    const pl = world.platoons[i]!;
    if (pl.p !== p || pl.state === PlatoonState.Queued || s.members[i] === 0) continue;
    const dx = pl.x - x;
    const dy = pl.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  if (best < 0) return;
  const pl = world.platoons[best]!;
  pl.kills++;
  const player = world.players[p]!;
  if (!player.best || pl.kills > player.best[2]) player.best = [pl.repo, pl.ordinal, pl.kills];
  else if (player.best[0] === pl.repo && player.best[1] === pl.ordinal) player.best[2] = pl.kills;
}

// ----------------------------------------------------------------- morale

function updateMorale(world: World, s: Scratch, ev: TickEvents): void {
  let w = 0;
  for (let i = 0; i < world.platoons.length; i++) {
    const pl = world.platoons[i]!;
    if (pl.state !== PlatoonState.Queued && pl.alive <= 0) {
      ev.disbands.push({ platoon: pl.id, p: pl.p, repo: pl.repo, ordinal: pl.ordinal, x: pl.x, y: pl.y });
      continue;
    }
    world.platoons[w++] = pl;
    if (pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout) continue;
    if (pl.state === PlatoonState.Engage && (world.tick + pl.id) % OUTNUMBER_CHECK === 0) {
      const enemies = enemiesNear(world.units, s.hash, pl.p, pl.x, pl.y, 90);
      if (enemies > pl.alive * 2) pl.morale -= OUTNUMBERED_DRAIN * OUTNUMBER_CHECK * (s.heralds[i]! > 0 ? 0.5 : 1);
    } else if (pl.calm > ENGAGE_CALM_TICKS) {
      pl.morale = Math.min(MORALE_MAX, pl.morale + MORALE_RECOVER);
    }
    const hasChampion = s.champions[i]! > 0;
    pl.champion = hasChampion;
    if (hasChampion && pl.morale < CHAMPION_MORALE_FLOOR) pl.morale = CHAMPION_MORALE_FLOOR;
    if (pl.morale <= 0) {
      pl.morale = 0;
      pl.state = PlatoonState.Rout;
      world.players[pl.p]!.routs++;
      ev.routs.push({ platoon: pl.id });
    }
  }
  world.platoons.length = w;
}

// ---------------------------------------------------------------- regroup

const REGROUP_PERIOD = 5;
const REGROUP_REACH = 140;
const REGROUP_SMALL = 4;
const REGROUP_STRENGTH = 0.3;
const REAR_COLS = 5;

function fielded(pl: Platoon): boolean {
  return pl.state !== PlatoonState.Queued && pl.state !== PlatoonState.Rout && pl.alive > 0;
}

/**
 * Remnants fold into a nearby platoon of the same army so the field shows a few
 * strong formations instead of many stragglers. A remnant that has just
 * rallied at its capital joins its army's nearest fielded platoon at any range.
 */
function regroup(world: World, s: Scratch, ev: TickEvents): void {
  if (world.tick % REGROUP_PERIOD !== 0 && s.rallied.length === 0) return;
  const { platoons, units } = world;
  for (let i = 0; i < platoons.length; i++) {
    const from = platoons[i]!;
    if (!fielded(from)) continue;
    const rallied = s.rallied.includes(from.id);
    if (!rallied && world.tick % REGROUP_PERIOD !== 0) continue;
    const small = from.alive <= REGROUP_SMALL || from.alive < from.size * REGROUP_STRENGTH;
    if (!small || (rallied && from.alive > REGROUP_SMALL)) continue;
    let best = -1;
    let bestD = rallied ? Infinity : REGROUP_REACH * REGROUP_REACH;
    for (let j = 0; j < platoons.length; j++) {
      const to = platoons[j]!;
      if (j === i || to.p !== from.p || !fielded(to) || to.alive < from.alive || (to.alive === from.alive && j > i)) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = j;
      }
    }
    if (best < 0) continue;
    const to = platoons[best]!;
    let rear = 0;
    for (const u of units) if (u.platoon === to.id && u.fx < rear) rear = u.fx;
    let moved = 0;
    for (const u of units) {
      if (u.platoon !== from.id) continue;
      u.platoon = to.id;
      u.fx = rear - SPACING * (1 + Math.floor(moved / REAR_COLS));
      u.fy = ((moved % REAR_COLS) - (REAR_COLS - 1) / 2) * SPACING;
      moved++;
    }
    to.alive += moved;
    to.size += moved;
    from.alive = 0;
    ev.regroups.push({ from: from.id, to: to.id, moved });
  }
  let w = 0;
  for (const pl of platoons) if (pl.state === PlatoonState.Queued || pl.alive > 0) platoons[w++] = pl;
  platoons.length = w;
}

// ---------------------------------------------------------------- capture

function updateCaptures(world: World, ev: TickEvents): void {
  if (world.tick % 5 !== 0) return;
  const { sites: defs } = world.map;
  for (let k = 0; k < defs.length; k++) {
    const def = defs[k]!;
    if (def.kind === 'capital') continue;
    if (def.kind === 'heart' && !world.monolithFallen) continue;
    const state = world.sites[k]!;
    let only = NEUTRAL;
    let contested = false;
    const r2 = def.radius * def.radius;
    for (const u of world.units) {
      if (u.p < 0) continue;
      const dx = u.x - def.x;
      const dy = u.y - def.y;
      if (dx * dx + dy * dy > r2) continue;
      if (only === NEUTRAL) only = u.p;
      else if (only !== u.p) {
        contested = true;
        break;
      }
    }
    const need = def.kind === 'heart' ? HEART_CAPTURE_TICKS : CAPTURE_TICKS;
    if (contested || only === NEUTRAL || only === state.owner) {
      state.progress = Math.max(0, state.progress - 5);
      if (state.progress === 0) state.capturer = NEUTRAL;
      continue;
    }
    if (state.capturer !== only) {
      state.capturer = only;
      state.progress = 0;
    }
    state.progress += 5;
    if (state.progress >= need) {
      const previous = state.owner;
      state.owner = only;
      state.capturer = NEUTRAL;
      state.progress = 0;
      world.players[only]!.captures++;
      ev.captures.push({ site: k, p: only, previous });
    }
  }
}

// Holdings pay in full only while garrisoned, so a leader must spread thin to keep them.
function awardHoldings(world: World): void {
  const presence = sitePresence(world);
  const n = world.players.length;
  for (let k = 0; k < world.sites.length; k++) {
    const owner = world.sites[k]!.owner;
    if (owner < 0) continue;
    const full = world.map.sites[k]!.renown;
    world.players[owner]!.renown += presence[k * n + owner]! > 0 ? full : Math.floor(full * UNGARRISONED_SHARE);
  }
}

function updateLeader(world: World, ev: TickEvents): void {
  let best = world.leader;
  let bestRenown = best >= 0 ? world.players[best]!.renown : 0;
  for (const p of world.players) {
    if (p.renown > bestRenown) {
      best = p.p;
      bestRenown = p.renown;
    }
  }
  if (best !== world.leader && bestRenown > 0) {
    ev.leader = { p: best, previous: world.leader };
    world.leader = best;
  }
}
