import {
  Doctrine,
  KIND_COUNT,
  PURPOSES,
  Kind,
  NEUTRAL,
  BlastKind,
  PlatoonState,
  ShotKind,
  Terrain,
  TICKS_PER_MINUTE,
  TICKS_PER_SECOND,
  type MapDef,
  type Platoon,
  type PlayerState,
  type Shot,
  type SimInput,
  type Structure,
  type TickEvents,
  type Unit,
  type Purpose,
  type WarParams,
  type World,
} from './api.ts';
import { attackerMultiplier, computeAuras, enemiesNear, findTarget, structureDamage, unitDamage, mitigated } from './combat.ts';
import { capitalOwner, runCouncil, sitePresence } from './council.ts';
import { derived } from './derived.ts';
import { cellAt } from './flowfield.ts';
import { dcos, dsin } from './dmath.ts';
import { Form, columnFormation, extent, lineFormation, type Slot } from './formation.ts';
import { hexCenterX, hexCenterY, hexRoute } from './hexroute.ts';
import { Role, cohesion, guardRadius, overCap, pickTarget, roleOf, type Pick } from './tactics.ts';
import { applyDelta, armyFor, armyQuality, cleanLines, emptyLedger, int, purposeOf, slotsOf, type LedgerDelta } from './muster.ts';
import { nextRandom, seedRng } from './rng.ts';
import { AURA_HEAL, enemyWithin, indexWorld, scratchFor, type Scratch } from './scratch.ts';
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
  HOME_TURF,
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
  SACK_FORTIFY,
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
import { clearPath, flowDirection, flyMove, passableAt, resolveMove, separation, towards, type Vec } from './steering.ts';

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
const SLOT_GAIN = 0.35;
/** Mean distance of the ground soldiers from their places past which the banner waits for them. */
const STRAGGLE = 16;
/** Siege engines may trail: their distance counts for this much of a soldier's. */
const SIEGE_TRAIL = 0.3;
const STRUCTURE_REACH = 0.75;
const OUTNUMBER_CHECK = 5;

const speedOf = (kind: number) => STATS[kind]!.speed;

export function emptyEvents(): TickEvents {
  return {
    desertions: [], swings: [], shots: [], breaths: [], blasts: [], heals: [], hits: [], deaths: [], musters: [], marches: [], routs: [], disbands: [],
    captures: [], sacks: [], rebuilt: [], regroups: [], monolith: null, cries: [], doctrines: [], rallies: [], joins: [],
    leader: null, departures: [], forms: [],
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
    sites: map.sites.map((s) => ({ id: s.id, owner: NEUTRAL, capturer: NEUTRAL, progress: 0, heldSince: -1 })),
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
  reformPlatoons(world, s);
  updateUnits(world, s, ev);
  settleForms(world, s, ev);
  updateStructures(world, s, ev);
  updateShots(world, s, ev);
  resolveDamage(world, s, ev);
  rebuildSpatialHash(s.hash, world.units);
  updateMorale(world, s, ev);
  regroup(world, s, ev);
  updateCaptures(world, ev);
  if (world.tick > 0 && world.tick % TICKS_PER_MINUTE === 0) awardHoldings(world);
  if (world.tick % TICKS_PER_SECOND === 0) trackFeats(world);
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
      musterPush(world, player, input.repo, typeof input.msg === 'string' ? input.msg : '', {
        lines: cleanLines(input.lines),
        files: int(input.files),
        branches: int(input.branches),
        churn: int(input.churn, 0),
        filler: int(input.filler, 0),
      }, ev);
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
    renown: 0, pushes: 0, ledger: emptyLedger(), quality: 1, veterancy: 0,
    raised: new Array<number>(KIND_COUNT).fill(0),
    slain: new Array<number>(KIND_COUNT).fill(0),
    kills: 0, losses: 0, structureDamage: 0, monolithDamage: 0, captures: 0, sacks: 0, routs: 0,
    purposes: new Array<number>(PURPOSES.length).fill(0), best: null,
    feats: { holdBest: 0, routsCaused: 0, cryKills: 0, returns: 0, heartCaptures: 0, leaderTakes: 0, homeKills: 0, ledTicks: 0 },
    queue: [], battalions: [],
  };
}

/**
 * Adds a push to the player's ledger and musters the difference between the
 * army the ledger is now worth and what it has already raised. Because the
 * ledger only sums deltas, splitting or squashing the same work raises the same
 * army; when work is undone, the difference is negative and soldiers desert.
 */
function musterPush(world: World, player: PlayerState, repo: number, msg: string, delta: Omit<LedgerDelta, 'purpose'>, ev: TickEvents): void {
  const purpose = purposeOf(msg);
  player.pushes++;
  player.purposes[PURPOSES.indexOf(purpose)]!++;
  applyDelta(player.ledger, { ...delta, purpose });
  const quality = armyQuality(player.ledger);
  player.quality = quality.quality;
  player.veterancy = quality.veterancy;
  const target = armyFor(player.ledger, player.pushes);
  const counts = new Array<number>(KIND_COUNT).fill(0);
  // The army's size in slots always equals what the ledger is worth. Its make-up
  // follows the target as closely as it can without anyone deserting while the
  // ledger is growing: soldiers only leave when work is undone.
  let room = slotsOf(target) - slotsOf(player.raised);
  if (room < 0) {
    let deserted = 0;
    for (const k of desertionOrder(target, player.raised)) {
      while (room < 0 && player.raised[k]! > 0) {
        // A soldier already fallen cannot desert, but still leaves the army's books.
        deserted += desert(world, player, k, 1);
        player.raised[k]!--;
        room += STATS[k]!.slots;
      }
      if (room >= 0) break;
    }
    if (deserted > 0) ev.desertions.push({ p: player.p, count: deserted });
  }
  for (const k of MUSTER_ORDER) {
    const per = STATS[k]!.slots;
    const n = Math.min(target[k]! - player.raised[k]!, Math.floor(room / per));
    if (n <= 0) continue;
    counts[k] = n;
    player.raised[k]! += n;
    room -= n * per;
  }
  // A large muster marches as several full platoons rather than one oversized one.
  for (const chunk of platoonsOf(counts)) queuePlatoon(world, player, repo, purpose, chunk, ev);
}

/** Heroes first, then specialists, so Footmen fill whatever room is left. */
const MUSTER_ORDER: readonly Kind[] = [
  Kind.Dragon, Kind.Champion, Kind.Troll, Kind.Trebuchet, Kind.GriffinRider, Kind.BoneGolem, Kind.Paladin, Kind.Ranger, Kind.Wizard,
  Kind.Knight, Kind.Cleric, Kind.Outrider, Kind.Mercenary, Kind.Skeleton, Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper, Kind.Berserker, Kind.Footman,
];

/** Kinds to let go first when work is undone: those most above their target, Footmen last among equals. */
function desertionOrder(target: readonly number[], raised: readonly number[]): Kind[] {
  const kinds = Array.from({ length: KIND_COUNT }, (_, k) => k as Kind);
  return kinds.sort((a, b) => raised[b]! - target[b]! - (raised[a]! - target[a]!) || MUSTER_ORDER.indexOf(b) - MUSTER_ORDER.indexOf(a));
}

/** Splits soldiers into platoons of at most PLATOON_MAX slots, heroes first. */
function platoonsOf(counts: readonly number[]): number[][] {
  const out: number[][] = [];
  const left = counts.slice();
  const order = [Kind.Dragon, Kind.Champion, ...Array.from({ length: KIND_COUNT }, (_, k) => k as Kind).filter((k) => k !== Kind.Dragon && k !== Kind.Champion)];
  while (left.some((n) => n > 0)) {
    const chunk = new Array<number>(KIND_COUNT).fill(0);
    let slots = 0;
    for (const k of order) {
      const per = STATS[k]!.slots;
      const n = Math.min(left[k]!, Math.floor((PLATOON_MAX - slots) / per));
      if (n <= 0) continue;
      chunk[k] = n;
      left[k]! -= n;
      slots += n * per;
    }
    if (slots === 0) break;
    out.push(chunk);
  }
  return out;
}

/** Removes up to `n` soldiers of `kind`: waiting ones first, then the newest in the field. Returns how many left. */
function desert(world: World, player: PlayerState, kind: Kind, n: number): number {
  let left = n;
  for (let q = player.queue.length - 1; q >= 0 && left > 0; q--) {
    const pl = world.platoons.find((x) => x.id === player.queue[q]);
    if (!pl) continue;
    const take = Math.min(left, pl.mustered[kind]!);
    pl.mustered[kind]! -= take;
    pl.size -= take;
    left -= take;
  }
  for (let i = world.units.length - 1; i >= 0 && left > 0; i--) {
    const u = world.units[i]!;
    if (u.p !== player.p || u.kind !== kind) continue;
    world.units.splice(i, 1);
    left--;
  }
  return n - left;
}

function queuePlatoon(world: World, player: PlayerState, repo: number, purpose: Purpose, counts: number[], ev: TickEvents): void {
  if (player.queue.length >= QUEUE_LIMIT) {
    // The muster queue is full: fold this push's soldiers into the waiting platoons,
    // newest first. Whoever still has no place is not raised yet; a later push musters them.
    for (let q = player.queue.length - 1; q >= 0; q--) {
      const waiting = world.platoons.find((pl) => pl.id === player.queue[q]);
      if (!waiting) continue;
      let slots = slotsOf(waiting.mustered);
      for (let k = 0; k < KIND_COUNT; k++) {
        const add = Math.max(0, Math.min(counts[k]!, Math.floor((PLATOON_MAX - slots) / STATS[k]!.slots)));
        waiting.mustered[k]! += add;
        waiting.size += add;
        counts[k]! -= add;
        slots += add * STATS[k]!.slots;
      }
      waiting.champion = waiting.mustered[Kind.Champion]! + waiting.mustered[Kind.Dragon]! > 0;
    }
    for (let k = 0; k < KIND_COUNT; k++) player.raised[k]! -= counts[k]!;
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
    purpose,
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
    form: Form.Column,
    formAt: world.tick,
    threat: 0,
    threatAt: -1,
    formed: -1,
    frontage: 0,
    width: 0,
    length: 0,
    offset: 0,
    lag: 0,
    route: [],
    routeSite: -1,
    stuck: 0,
    trail: [],
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
  // One Dragon per army: a second legendary push sends a Champion instead, even
  // when one squashed push raised both Dragons into this very platoon.
  if (platoon.mustered[Kind.Dragon]! > 0) {
    const allowed = world.units.some((u) => u.p === player.p && u.kind === Kind.Dragon) ? 0 : 1;
    const extra = Math.max(0, platoon.mustered[Kind.Dragon]! - allowed);
    platoon.mustered[Kind.Dragon]! -= extra;
    platoon.mustered[Kind.Champion]! += extra;
  }
  platoon.form = Form.Column;
  platoon.formAt = world.tick;
  platoon.route = [];
  platoon.routeSite = -1;
  platoon.trail = [];
  const column = columnFormation(platoon.mustered);
  const size = extent(column);
  platoon.width = size.width;
  platoon.length = size.depth;
  for (const slot of column) {
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
  platoon.formed = platoon.alive;
}

// --------------------------------------------------------------- platoons

const dir: Vec = { x: 0, y: 0 };
const push: Vec = { x: 0, y: 0 };
const moved: Vec = { x: 0, y: 0 };
const point: Vec = { x: 0, y: 0 };

/** Platoons look for threats this often, staggered by id. */
const THREAT_PERIOD = 5;
/** An enemy banner this close sends a column into line: about 1.3 times the longest missile reach (a Trebuchet's 170). */
export const DEPLOY_RADIUS = 220;
/** The line stands down only once no threat is within this radius... */
export const STANDDOWN_RADIUS = DEPLOY_RADIUS * 1.25;
/** ...for this long. */
export const STANDDOWN_TICKS = 5 * TICKS_PER_SECOND;
/** Hostile walls count as a threat this far beyond their radius (their towers reach 140 to 160). */
const WALL_THREAT = 200;
const DEPLOY_MIN = 2 * TICKS_PER_SECOND;
const DEPLOY_MAX = 8 * TICKS_PER_SECOND;
/** Mean distance from their places under which the ranks count as dressed. */
const DEPLOY_SETTLED = 8;
/** A line advances at this share of its column's pace, keeping its ranks dressed. */
const LINE_PACE = 0.6;
const WALL_PACE = 0.85;
/** Under the Hold doctrine a deployed line stands this long before it advances. */
const LINE_HOLD = 15 * TICKS_PER_SECOND;
/** A line closing with an enemy stops its banner this far from theirs: the front ranks meet. */
const CLASH = 45;
/** Fastest a formation wheels, in radians per tick. */
const MAX_TURN = 0.1;
const COS_TURN = dcos(MAX_TURN);
const SIN_TURN = dsin(MAX_TURN);
/** Spacing of the road the column follows behind its banner, and how much of it is kept. */
export const TRAIL_STEP = 10;
const TRAIL_POINTS = 40;
const WAYPOINT_REACH = 20;
const STUCK_REPLAN = 8;
const STUCK_FLOW = 20;
const REFORM_PERIOD = 10;
const REFIT_PERIOD = 10;
const PROBE_STEP = 6;
const LINE_MARGIN = 8;
const MIN_FRONTAGE = 36;
const BLOCK_SPACE = 10;

function holdDistance(world: World, platoon: Platoon): number {
  const def = world.map.sites[platoon.site]!;
  if (def.kind === 'capital' && def.slot !== world.players[platoon.p]!.slot) return def.radius + 34;
  if (def.kind === 'heart' && !world.monolithFallen) return def.radius + 34;
  return Math.max(16, def.radius * 0.35);
}

function setForm(world: World, pl: Platoon, form: Form, ev: TickEvents): void {
  if (pl.form === form) return;
  // Column and line are drawn up differently; a line coming out of a fight closes its gaps.
  if ((pl.form === Form.Column) !== (form === Form.Column) || (pl.form === Form.Engaged && form === Form.Line)) pl.formed = -1;
  if (form === Form.Column) pl.trail.length = 0;
  pl.form = form;
  pl.formAt = world.tick;
  ev.forms.push({ platoon: pl.id, form });
}

/** Wheels the formation toward (dx, dy) by at most MAX_TURN; easing in over the last step. */
function turnToward(pl: Platoon, dx: number, dy: number): void {
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m < 1e-9) return;
  dx /= m;
  dy /= m;
  let hx: number;
  let hy: number;
  if (pl.hx * dx + pl.hy * dy >= COS_TURN) {
    hx = pl.hx + (dx - pl.hx) * 0.3;
    hy = pl.hy + (dy - pl.hy) * 0.3;
  } else {
    const sn = pl.hx * dy - pl.hy * dx >= 0 ? SIN_TURN : -SIN_TURN;
    hx = pl.hx * COS_TURN - pl.hy * sn;
    hy = pl.hx * sn + pl.hy * COS_TURN;
  }
  const n = Math.sqrt(hx * hx + hy * hy);
  if (n > 1e-9) {
    pl.hx = hx / n;
    pl.hy = hy / n;
  }
}

function fieldedEnemy(o: Platoon, p: number): boolean {
  return o.p !== p && o.state !== PlatoonState.Queued && o.state !== PlatoonState.Rout;
}

/** Where the platoon's threat stands, into `point`. False, and the threat forgotten, if it is gone. */
function threatPoint(world: World, s: Scratch, pl: Platoon): boolean {
  if (pl.threat > 0) {
    const j = s.platoonIndex.get(pl.threat);
    const o = j === undefined ? undefined : world.platoons[j]!;
    if (!o || !fieldedEnemy(o, pl.p) || s.members[j!] === 0) {
      pl.threat = 0;
      return false;
    }
    point.x = o.x;
    point.y = o.y;
    return true;
  }
  if (pl.threat < 0) {
    const k = -pl.threat - 1;
    if (k >= world.structures.length || !attackable(world, k, pl.p)) {
      pl.threat = 0;
      return false;
    }
    const def = world.map.sites[world.structures[k]!.site]!;
    point.x = def.x;
    point.y = def.y;
    return true;
  }
  return false;
}

/**
 * The nearest enemy banner, or hostile walls in tower range, decides whether to
 * deploy. Distances are measured from the platoon's centre of mass (x, y), which
 * does not jump when a column's leading banner falls back to the middle of its line.
 */
function scanThreat(world: World, s: Scratch, pl: Platoon, x: number, y: number, ev: TickEvents): void {
  let bestD2 = Infinity;
  let who = 0;
  for (let j = 0; j < world.platoons.length; j++) {
    const o = world.platoons[j]!;
    if (!fieldedEnemy(o, pl.p) || s.members[j] === 0) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      who = o.id;
    }
  }
  let best = Math.sqrt(bestD2);
  // An enemy army close by matters more than walls: face it first.
  for (let k = 0; k < world.structures.length && best > DEPLOY_RADIUS; k++) {
    if (!attackable(world, k, pl.p)) continue;
    const def = world.map.sites[world.structures[k]!.site]!;
    const dx = def.x - x;
    const dy = def.y - y;
    const d = ((Math.sqrt(dx * dx + dy * dy) - def.radius) * DEPLOY_RADIUS) / WALL_THREAT;
    if (d < best) {
      best = d;
      who = -(k + 1);
    }
  }
  if (best > STANDDOWN_RADIUS) {
    pl.threat = 0;
    return;
  }
  pl.threat = who;
  pl.threatAt = world.tick;
  if (best <= DEPLOY_RADIUS && pl.form === Form.Column) setForm(world, pl, Form.Deploying, ev);
}

function updatePlatoons(world: World, s: Scratch, ev: TickEvents): void {
  const { map, tick } = world;
  for (let i = 0; i < world.platoons.length; i++) {
    const pl = world.platoons[i]!;
    s.ox[i] = pl.x;
    s.oy[i] = pl.y;
    s.ohx[i] = pl.hx;
    s.ohy[i] = pl.hy;
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
        pl.formed = -1;
        pl.routeSite = -1;
        pl.trail.length = 0;
        player.feats.returns++;
        s.rallied.push(pl.id);
      }
      continue;
    }

    const wasColumn = pl.form === Form.Column;
    if ((tick + pl.id) % THREAT_PERIOD === 0) scanThreat(world, s, pl, cx, cy, ev);
    if (pl.calm === 0 && pl.state !== PlatoonState.Engage) pl.state = PlatoonState.Engage;
    if (pl.state === PlatoonState.Engage) setForm(world, pl, Form.Engaged, ev);
    if (wasColumn && pl.form !== Form.Column && passableAt(map, cx, cy)) {
      // A column's banner leads it; the line it deploys into forms on the column's middle.
      pl.x = s.ox[i] = cx;
      pl.y = s.oy[i] = cy;
    }
    if (pl.state === PlatoonState.Engage) {
      pl.threatAt = tick;
      engagedMove(world, s, i, pl, player, cx, cy);
      if (pl.calm >= ENGAGE_CALM_TICKS) {
        pl.state = PlatoonState.March;
        setForm(world, pl, Form.Line, ev);
      }
      continue;
    }
    if (pl.site < 0) pl.site = player.slot;
    const def = map.sites[pl.site]!;
    const dx = def.x - pl.x;
    const dy = def.y - pl.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hold = holdDistance(world, pl);
    pl.state = dist <= hold ? PlatoonState.Hold : PlatoonState.March;
    if (pl.form === Form.Column) {
      // A column that reaches its objective draws up in line to hold it.
      if (pl.state === PlatoonState.Hold) setForm(world, pl, Form.Line, ev);
      else marchStep(world, s, i, pl, player, dist, hold, 1, true, true);
    } else if (pl.form === Form.Deploying) {
      // Halt and wheel to face the threat while the blocks find their places in the line.
      if (threatPoint(world, s, pl)) turnToward(pl, point.x - pl.x, point.y - pl.y);
      if ((tick + pl.id) % REFIT_PERIOD === 0) refitLine(world, pl);
      dressLines(world, s, pl);
    } else {
      if ((tick + pl.id) % REFIT_PERIOD === 0) refitLine(world, pl);
      dressLines(world, s, pl);
      const facing = threatPoint(world, s, pl);
      if (facing) turnToward(pl, point.x - pl.x, point.y - pl.y);
      if (pl.state === PlatoonState.March) {
        if (tick - pl.threatAt >= STANDDOWN_TICKS) {
          // Nothing near for a while: back into column to march on.
          setForm(world, pl, Form.Column, ev);
        } else if (!(player.doctrine === Doctrine.Hold && tick - pl.formAt < LINE_HOLD)) {
          if (facing && pl.threat > 0) advanceLine(world, s, i, pl, player, point.x, point.y);
          // Facing walls rather than an army, the line presses on toward its objective at near a column's pace.
          else marchStep(world, s, i, pl, player, dist, hold, facing ? WALL_PACE : LINE_PACE, !facing, false);
        }
      }
    }
    const capital = map.sites[player.slot]!;
    const ox = pl.x - capital.x;
    const oy = pl.y - capital.y;
    const depth = Math.sqrt(ox * ox + oy * oy);
    if (depth > pl.depth) pl.depth = depth;
    const mx = pl.x - s.ox[i]!;
    const my = pl.y - s.oy[i]!;
    s.moved[i] = Math.sqrt(mx * mx + my * my);
  }
}

function marchSpeed(world: World, s: Scratch, i: number, pl: Platoon, player: PlayerState): number {
  let speed = s.slowest[i]! * 0.9 * doctrineSpeed(player.doctrine);
  if (player.cryUntil > world.tick) speed *= CRY_SPEED;
  // Wait for stragglers so the block stays a block.
  if (pl.lag > STRAGGLE) speed *= 0.4;
  return speed;
}

function forestPace(map: MapDef, x: number, y: number): number {
  const cell = cellAt(map, x, y);
  return cell >= 0 && map.terrain[cell] === Terrain.Forest ? FOREST_SPEED : 1;
}

function planRoute(world: World, pl: Platoon): void {
  const def = world.map.sites[pl.site]!;
  pl.route = hexRoute(world.map, pl.x, pl.y, def.x, def.y);
  pl.routeSite = pl.site;
}

/** Marches the banner along its hex route toward its objective, the flow field taking over when stuck. */
function marchStep(world: World, s: Scratch, i: number, pl: Platoon, player: PlayerState, dist: number, hold: number, pace: number, turn: boolean, column: boolean): void {
  const { map } = world;
  if (pl.routeSite !== pl.site) planRoute(world, pl);
  const route = pl.route;
  while (route.length > 0) {
    const wx = hexCenterX(map, route[0]!);
    const wy = hexCenterY(map, route[0]!);
    const dx = wx - pl.x;
    const dy = wy - pl.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < WAYPOINT_REACH * WAYPOINT_REACH) {
      route.shift();
      continue;
    }
    if (route.length > 1) {
      // Past this waypoint already: nearer the next one than the waypoint itself is.
      const nx = hexCenterX(map, route[1]!);
      const ny = hexCenterY(map, route[1]!);
      const ax = nx - pl.x;
      const ay = ny - pl.y;
      const bx = nx - wx;
      const by = ny - wy;
      if (ax * ax + ay * ay < bx * bx + by * by) {
        route.shift();
        continue;
      }
    }
    break;
  }
  const def = map.sites[pl.site]!;
  if (route.length > 0 && pl.stuck < STUCK_FLOW) towards(dir, pl.x, pl.y, hexCenterX(map, route[0]!), hexCenterY(map, route[0]!));
  else flowDirection(dir, map, derived(map).flow[pl.site]!, pl.x, pl.y, def.x, def.y);
  let speed = marchSpeed(world, s, i, pl, player) * pace;
  // Keep a column's length from the friendly column ahead on the same road.
  if (column && closeBehindFriend(world, s, pl)) speed *= 0.3;
  // A column wheeling round a sharp bend slows to let its tail follow.
  if (turn && pl.hx * dir.x + pl.hy * dir.y < 0.5) speed *= 0.5;
  speed = Math.min(speed, dist - hold + 0.5);
  stepBanner(world, pl, dir.x, dir.y, speed);
  if (turn) turnToward(pl, dir.x, dir.y);
  if (column) extendTrail(pl, s.ox[i]!, s.oy[i]!);
}

/** Space kept between the tail of one friendly column and the head of the next. */
const ROAD_GAP = 24;

/** Friendly lines drawn up on the same ground side-step apart, so an army stands as one long line, not a pile. */
function dressLines(world: World, s: Scratch, pl: Platoon): void {
  const px = -pl.hy;
  const py = pl.hx;
  let shift = 0;
  for (let k = s.pstart[pl.p]!; k < s.pstart[pl.p + 1]!; k++) {
    const o = world.platoons[s.porder[k]!]!;
    if (o === pl || o.form === Form.Column || o.state === PlatoonState.Queued || o.state === PlatoonState.Rout) continue;
    const dx = o.x - pl.x;
    const dy = o.y - pl.y;
    const along = dx * pl.hx + dy * pl.hy;
    if (along > 50 || along < -50) continue;
    const lateral = dx * px + dy * py;
    const need = (pl.width + o.width) / 2 + BLOCK_SPACE;
    const gap = lateral < 0 ? -lateral : lateral;
    if (gap >= need) continue;
    const away = lateral > 0 || (lateral === 0 && o.id > pl.id) ? -1 : 1;
    shift += away * Math.min(1, (need - gap) * 0.1);
  }
  if (shift === 0) return;
  const nx = pl.x + px * shift;
  const ny = pl.y + py * shift;
  if (passableAt(world.map, nx, ny)) {
    pl.x = nx;
    pl.y = ny;
  }
}

function closeBehindFriend(world: World, s: Scratch, pl: Platoon): boolean {
  for (let k = s.pstart[pl.p]!; k < s.pstart[pl.p + 1]!; k++) {
    const o = world.platoons[s.porder[k]!]!;
    if (o === pl || o.form !== Form.Column || o.state === PlatoonState.Queued || o.state === PlatoonState.Rout) continue;
    const dx = o.x - pl.x;
    const dy = o.y - pl.y;
    const gap = o.length + ROAD_GAP;
    if (dx * dx + dy * dy > gap * gap) continue;
    const ahead = dx * pl.hx + dy * pl.hy;
    if (ahead > 0 || (ahead > -10 && o.id < pl.id)) return true;
  }
  return false;
}

/** Moves the banner; counts the ticks it makes no headway, replanning and then falling back on the flow field. */
function stepBanner(world: World, pl: Platoon, dx: number, dy: number, speed: number): void {
  const pace = forestPace(world.map, pl.x, pl.y);
  const want = speed * pace;
  // No deadband: a slow block waiting for stragglers in a forest must still creep on.
  resolveMove(moved, world.map, pl.x, pl.y, dx * want, dy * want, Math.max(0, speed), 0);
  const mx = moved.x - pl.x;
  const my = moved.y - pl.y;
  pl.x = moved.x;
  pl.y = moved.y;
  if (want > 0.2 && mx * mx + my * my < want * want * 0.09) {
    pl.stuck++;
    if (pl.stuck === STUCK_REPLAN) pl.routeSite = -1;
    if (pl.stuck === STUCK_FLOW) {
      // Follow the flow field for a while before trying the route again.
      pl.stuck = STUCK_FLOW + 25;
      pl.routeSite = -1;
    }
  } else if (pl.stuck > 0) pl.stuck--;
}

/** A deployed line advancing on an enemy banner, until the front ranks meet. */
function advanceLine(world: World, s: Scratch, i: number, pl: Platoon, player: PlayerState, tx: number, ty: number): void {
  const d = towards(dir, pl.x, pl.y, tx, ty);
  if (d <= CLASH) return;
  const speed = Math.min(marchSpeed(world, s, i, pl, player) * LINE_PACE, d - CLASH);
  stepBanner(world, pl, dir.x, dir.y, speed);
}

function engagedMove(world: World, s: Scratch, i: number, pl: Platoon, player: PlayerState, cx: number, cy: number): void {
  const facing = threatPoint(world, s, pl);
  if (facing) turnToward(pl, point.x - pl.x, point.y - pl.y);
  const holding = player.doctrine === Doctrine.Hold && world.tick - pl.formAt < LINE_HOLD;
  if (facing && pl.threat > 0 && !holding && pl.state !== PlatoonState.Hold) {
    const dx = point.x - pl.x;
    const dy = point.y - pl.y;
    if (dx * dx + dy * dy > CLASH * CLASH) {
      // Press the line forward until it meets theirs.
      advanceLine(world, s, i, pl, player, point.x, point.y);
      return;
    }
  }
  // Follow the melee: the banner drifts toward where its soldiers are fighting,
  // but never onto rock or water, where it could not march on from.
  const nx = pl.x + (cx - pl.x) * 0.08;
  const ny = pl.y + (cy - pl.y) * 0.08;
  if (passableAt(world.map, nx, ny)) {
    pl.x = nx;
    pl.y = ny;
  }
}

/** Lays road behind the banner at TRAIL_STEP spacing for the column to follow. */
function extendTrail(pl: Platoon, ox: number, oy: number): void {
  const t = pl.trail;
  if (t.length === 0) {
    if (pl.x !== ox || pl.y !== oy) t.push(ox, oy);
    return;
  }
  let lx = t[0]!;
  let ly = t[1]!;
  let dx = pl.x - lx;
  let dy = pl.y - ly;
  let d = Math.sqrt(dx * dx + dy * dy);
  while (d >= TRAIL_STEP) {
    lx += (dx * TRAIL_STEP) / d;
    ly += (dy * TRAIL_STEP) / d;
    t.unshift(lx, ly);
    dx = pl.x - lx;
    dy = pl.y - ly;
    d = Math.sqrt(dx * dx + dy * dy);
  }
  if (t.length > TRAIL_POINTS * 2) t.length = TRAIL_POINTS * 2;
}

const along = { x: 0, y: 0, dx: 0, dy: 0 };

/** The point `d` behind the banner along the road it marched, and the way the road runs there. */
function trailAt(pl: Platoon, d: number): void {
  const t = pl.trail;
  const n = t.length / 2;
  let fx = pl.x;
  let fy = pl.y;
  let rem = d;
  // dx, dy: direction of travel along the current segment.
  let dx = pl.hx;
  let dy = pl.hy;
  for (let k = 0; k < n; k++) {
    const bx = t[2 * k]!;
    const by = t[2 * k + 1]!;
    const sx = fx - bx;
    const sy = fy - by;
    const len = k === 0 ? Math.sqrt(sx * sx + sy * sy) : TRAIL_STEP;
    if (len > 1e-9) {
      dx = sx / len;
      dy = sy / len;
    }
    if (rem <= len) {
      along.x = fx - dx * rem;
      along.y = fy - dy * rem;
      along.dx = dx;
      along.dy = dy;
      return;
    }
    rem -= len;
    fx = bx;
    fy = by;
    // Past the first segment every step is TRAIL_STEP long: jump straight to the right one.
    if (k === 0 && n > 1) {
      const skip = Math.min(n - 2, Math.floor(rem / TRAIL_STEP));
      if (skip > 0) {
        fx = t[2 * skip]!;
        fy = t[2 * skip + 1]!;
        rem -= skip * TRAIL_STEP;
        k = skip;
      }
    }
  }
  // Beyond the road laid so far: straight on behind it.
  along.x = fx - dx * rem;
  along.y = fy - dy * rem;
  along.dx = dx;
  along.dy = dy;
}

const slot = { x: 0, y: 0, vx: 0, vy: 0 };

/** A soldier's place this tick, and how fast that place is moving. */
function slotOf(s: Scratch, pi: number, pl: Platoon, u: Unit): void {
  const f = u.fx;
  const l = u.fy;
  if (pl.form === Form.Column && f < 0) {
    trailAt(pl, -f);
    slot.x = along.x - along.dy * l;
    slot.y = along.y + along.dx * l;
    const sp = s.moved[pi]!;
    slot.vx = along.dx * sp;
    slot.vy = along.dy * sp;
    return;
  }
  slot.x = pl.x + pl.hx * f - pl.hy * l;
  slot.y = pl.y + pl.hy * f + pl.hx * l;
  slot.vx = slot.x - (s.ox[pi]! + s.ohx[pi]! * f - s.ohy[pi]! * l);
  slot.vy = slot.y - (s.oy[pi]! + s.ohy[pi]! * f + s.ohx[pi]! * l);
}

/** Exported for tests and the renderer: soldier `u`'s place in its platoon's formation now. */
export function placeOf(world: World, u: Unit): Vec | null {
  const pl = world.platoons.find((p) => p.id === u.platoon);
  if (!pl || pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout) return null;
  if (pl.form === Form.Column && u.fx < 0) {
    trailAt(pl, -u.fx);
    return { x: along.x - along.dy * u.fy, y: along.y + along.dx * u.fy };
  }
  return { x: pl.x + pl.hx * u.fx - pl.hy * u.fy, y: pl.y + pl.hy * u.fx + pl.hx * u.fy };
}

/** The platoon's remaining march route as world points, for drawing its line of march. */
export function routePoints(world: World, pl: Platoon): Vec[] {
  return pl.route.map((h) => ({ x: hexCenterX(world.map, h), y: hexCenterY(world.map, h) }));
}

/**
 * Draws platoons up afresh: when they change between column and line, take in
 * a remnant, lose soldiers (closing the gaps every REFORM_PERIOD ticks, not in
 * the thick of a fight), or rally. Each kind's soldiers keep their order, front
 * to back and left to right, so survivors step up into the gaps.
 */
function reformPlatoons(world: World, s: Scratch): void {
  const { platoons, units, tick } = world;
  let lists: Map<number, number[]> | null = null;
  for (let i = 0; i < platoons.length; i++) {
    const pl = platoons[i]!;
    if (pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout) continue;
    const n = s.members[i]!;
    if (n === 0) continue;
    if (pl.formed >= 0 && (n === pl.formed || (n < pl.formed && (pl.form === Form.Engaged || (tick + pl.id) % REFORM_PERIOD !== 0)))) continue;
    (lists ??= new Map()).set(i, []);
  }
  if (!lists) return;
  for (let k = 0; k < units.length; k++) lists.get(s.unitPlatoon[k]!)?.push(k);
  for (let i = 0; i < platoons.length; i++) {
    const list = lists.get(i);
    if (list) drawUp(world, platoons[i]!, units, list);
  }
}

const side = { left: 0, right: 0 };

/** Open ground to either side of the banner across the facing, sampled over the depth of a line. */
function probeWidth(map: MapDef, pl: Platoon, reach: number): void {
  side.left = reach;
  side.right = reach;
  const px = -pl.hy;
  const py = pl.hx;
  for (let f = 16; f >= -32; f -= 16) {
    const x0 = pl.x + pl.hx * f;
    const y0 = pl.y + pl.hy * f;
    for (let dirn = 1; dirn >= -1; dirn -= 2) {
      const limit = dirn > 0 ? side.right : side.left;
      let free = 0;
      for (let d = PROBE_STEP; d <= limit; d += PROBE_STEP) {
        if (!passableAt(map, x0 + px * d * dirn, y0 + py * d * dirn)) break;
        free = d;
      }
      if (free < limit) {
        if (dirn > 0) side.right = free;
        else side.left = free;
      }
    }
  }
}

/** Lays out a line as wide as the ground at the banner allows, shifted to sit between the obstacles. */
function lineFor(world: World, pl: Platoon, counts: readonly number[]): Slot[] {
  const natural = lineFormation(counts);
  const width = extent(natural).width;
  probeWidth(world.map, pl, width + PROBE_STEP);
  const room = side.left + side.right - LINE_MARGIN;
  let slots = natural;
  pl.frontage = 0;
  if (room < width) {
    pl.frontage = Math.max(MIN_FRONTAGE, room);
    slots = lineFormation(counts, pl.frontage);
  }
  const size = extent(slots);
  pl.width = size.width;
  pl.length = size.depth;
  const half = pl.width / 2 + LINE_MARGIN / 2;
  pl.offset = side.left >= half && side.right >= half ? 0 : (side.right - side.left) / 2;
  for (const p of slots) p.l += pl.offset;
  return slots;
}

/** Every so often a deployed line checks the ground: narrower than its line, or room to open out again. */
function refitLine(world: World, pl: Platoon): void {
  probeWidth(world.map, pl, Math.max(pl.width, pl.frontage) + PROBE_STEP);
  const room = side.left + side.right - LINE_MARGIN;
  const half = pl.width / 2 + LINE_MARGIN / 2;
  const offset = side.left >= half && side.right >= half ? 0 : (side.right - side.left) / 2;
  const cramped = room < pl.width - PROBE_STEP;
  const opens = pl.frontage > 0 && room >= pl.frontage + 4 * PROBE_STEP;
  if (cramped || opens || Math.abs(offset - pl.offset) > 2 * PROBE_STEP) pl.formed = -1;
}

function drawUp(world: World, pl: Platoon, units: readonly Unit[], list: number[]): void {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const k of list) counts[units[k]!.kind]!++;
  const places: Slot[][] = Array.from({ length: KIND_COUNT }, () => []);
  let layout: Slot[];
  if (pl.form === Form.Column) {
    layout = columnFormation(counts);
    pl.frontage = 0;
    pl.offset = 0;
    const size = extent(layout);
    pl.width = size.width;
    pl.length = size.depth;
  } else layout = lineFor(world, pl, counts);
  for (const p of layout) places[p.kind]!.push(p);
  const soldiers: Unit[][] = Array.from({ length: KIND_COUNT }, () => []);
  for (const k of list) soldiers[units[k]!.kind]!.push(units[k]!);
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    const ps = places[kind]!;
    if (ps.length === 0) continue;
    ps.sort((a, b) => b.f - a.f || a.l - b.l);
    const us = soldiers[kind]!;
    us.sort((a, b) => b.fx - a.fx || a.fy - b.fy || a.id - b.id);
    for (let n = 0; n < us.length; n++) {
      us[n]!.fx = ps[n]!.f;
      us[n]!.fy = ps[n]!.l;
    }
  }
  pl.formed = list.length;
}

/** After the soldiers move: how well each platoon holds its ranks, and whether a deploying one is done. */
function settleForms(world: World, s: Scratch, ev: TickEvents): void {
  const { platoons, tick } = world;
  for (let i = 0; i < platoons.length; i++) {
    const pl = platoons[i]!;
    if (pl.state === PlatoonState.Queued) continue;
    pl.lag = s.errN[i]! > 0 ? s.errSum[i]! / s.errN[i]! : 0;
    if (pl.form !== Form.Deploying || pl.state === PlatoonState.Rout) continue;
    const since = tick - pl.formAt;
    let aligned = true;
    if (threatPoint(world, s, pl)) {
      const dx = point.x - pl.x;
      const dy = point.y - pl.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      aligned = d < 1e-6 || (pl.hx * dx + pl.hy * dy) / d >= 0.97;
    }
    if ((since >= DEPLOY_MIN && aligned && pl.lag < DEPLOY_SETTLED) || since >= DEPLOY_MAX) setForm(world, pl, Form.Line, ev);
  }
}

// ------------------------------------------------------------------ units

function structureAt(world: World, site: number): number {
  for (let k = 0; k < world.structures.length; k++) if (world.structures[k]!.site === site) return k;
  return -1;
}

/** Whether a site's walls lie within `leash` of a banner at (x, y). */
function withinLeash(map: MapDef, site: number, x: number, y: number, leash: number): boolean {
  const def = map.sites[site]!;
  const dx = def.x - x;
  const dy = def.y - y;
  const reach = leash + def.radius;
  return dx * dx + dy * dy <= reach * reach;
}

function attackable(world: World, k: number, p: number): boolean {
  const st = world.structures[k]!;
  return st.p !== p && st.hp > 0 && st.ruinedUntil < 0;
}

/** A soldier this badly hurt steps back a rank when a fresh one of its kind can take its place. */
const WOUNDED = 0.2;
const FRESH = 0.6;
/** Cavalry facing an enemy line rides this far out to its flank before turning in. */
const FLANK = 36;
/** How far toward its place a soldier checks for rock or water in the way. */
const CUT_LOOK = 40;

const pick: Pick = { radius: 0, ax: 0, ay: 0, leash: 0, sx: 0, sy: 0, reach: Infinity, hx: 0, hy: 0 };

/** A badly wounded soldier trades places with the nearest fresh one of its kind behind it. */
function fallBack(world: World, s: Scratch, i: number): boolean {
  const { units } = world;
  const hash = s.hash;
  const u = units[i]!;
  const bx = bucketX(hash, u.x);
  const by = bucketY(hash, u.y);
  let best = -1;
  let bestD = 40 * 40;
  for (let y = Math.max(0, by - 2); y <= Math.min(hash.rows - 1, by + 2); y++) {
    for (let x = Math.max(0, bx - 2); x <= Math.min(hash.cols - 1, bx + 2); x++) {
      for (let j = hash.head[y * hash.cols + x]!; j >= 0; j = hash.next[j]!) {
        const v = units[j]!;
        if (j === i || v.platoon !== u.platoon || v.kind !== u.kind || v.hp < v.maxHp * FRESH || v.fx > u.fx - 1) continue;
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD || (d2 === bestD && j < best)) {
          bestD = d2;
          best = j;
        }
      }
    }
  }
  if (best < 0) return false;
  const v = units[best]!;
  const fx = u.fx;
  const fy = u.fy;
  u.fx = v.fx;
  u.fy = v.fy;
  v.fx = fx;
  v.fy = fy;
  return true;
}

function updateUnits(world: World, s: Scratch, ev: TickEvents): void {
  const { units, map, tick } = world;
  s.damage.fill(0, 0, units.length);
  s.heal.fill(0, 0, units.length);
  s.lastHit.fill(-1, 0, units.length);
  s.lastKind.fill(-1, 0, units.length);
  for (let i = 0; i < world.platoons.length; i++) world.platoons[i]!.calm++;
  // Melee attackers on each soldier, so the next to choose can pick another foe.
  s.attackers.fill(0, 0, units.length);
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.target <= 0 || STATS[u.kind]!.ranged) continue;
    const t = s.unitIndex.get(u.target);
    if (t !== undefined) s.attackers[t]!++;
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const stats = STATS[u.kind]!;
    const role = roleOf(u.kind);
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

    // This soldier's place in the formation, and whether the platoon stands deployed.
    const placed = pl !== undefined && !routing;
    if (placed) slotOf(s, pi, pl, u);
    const deployed = placed && pl.form !== Form.Column;
    const wounded = deployed && !stats.ranged && role !== Role.Healer && u.hp < u.maxHp * WOUNDED;
    let fellBack = false;
    if (wounded && (tick + u.id) % 5 === 0 && fallBack(world, s, i)) {
      fellBack = true;
      slotOf(s, pi, pl, u);
    }

    // Targeting: soldiers stay leashed to their banner so platoons fight as blocks,
    // and, once deployed, to their place in the line so the line holds its shape.
    const old = u.target;
    let t = u.target > 0 && !fellBack ? (s.unitIndex.get(u.target) ?? -1) : -1;
    const ax = pl ? pl.x : u.x;
    const ay = pl ? pl.y : u.y;
    const leash = stats.aggro * LEASH;
    const reach = deployed ? cohesion(u.kind) : Infinity;
    // Healers and the badly wounded strike only at what comes to them.
    const guard = role === Role.Healer || wounded;
    const radius = guard ? Math.min(stats.aggro, role === Role.Healer ? guardRadius(u.kind) : stats.range * 1.5 + 6) : stats.aggro;
    if (t >= 0) {
      const v = units[t]!;
      let dx = v.x - ax;
      let dy = v.y - ay;
      if (dx * dx + dy * dy > leash * leash || routing) t = -1;
      // More attackers on it than it has room for: those not at its side find another foe or hold their place.
      else if (deployed && overCap(s, u, v, t)) t = -1;
      else if (deployed) {
        dx = v.x - slot.x;
        dy = v.y - slot.y;
        if (dx * dx + dy * dy > reach * reach * 1.5625) t = -1;
        else if (guard) {
          dx = v.x - u.x;
          dy = v.y - u.y;
          if (dx * dx + dy * dy > radius * radius * 2.25) t = -1;
        }
      }
    }
    let structure = -1;
    if (u.kind === Kind.Trebuchet && !routing) {
      // Siege engines would rather batter walls than soldiers.
      structure = nearestStructure(world, u.p, u.x, u.y, stats.range);
      if (structure >= 0 && pl && !withinLeash(map, world.structures[structure]!.site, ax, ay, leash)) structure = -1;
      if (structure >= 0) t = -1;
    } else if (u.kind === Kind.Sapper && !routing && pl) {
      // Sappers go for the walls of their objective once within their leash of the banner.
      const goal = structureAt(world, pl.site);
      if (goal >= 0 && attackable(world, goal, u.p) && withinLeash(map, pl.site, ax, ay, leash)) {
        structure = goal;
        t = -1;
      }
    }
    // Look for a foe only when the coarse presence grid says one may be in reach.
    if (structure < 0 && !routing && (tick + u.id) % (t >= 0 ? 8 : 4) === 0 && enemyWithin(world, s, u.p, u.x, u.y, radius)) {
      pick.radius = radius;
      pick.ax = ax;
      pick.ay = ay;
      pick.leash = leash;
      pick.sx = placed ? slot.x : u.x;
      pick.sy = placed ? slot.y : u.y;
      pick.reach = reach;
      pick.hx = deployed ? pl.hx : 0;
      pick.hy = deployed ? pl.hy : 0;
      const found = pickTarget(world, s, i, pick);
      if (found >= 0) t = found;
    }
    if (structure < 0 && t < 0 && !routing && pl) {
      structure = u.target < 0 ? -u.target - 1 : -1;
      // Keep battering the same walls only while they stay within the leash of the banner.
      if (structure >= 0 && (!attackable(world, structure, u.p) || !withinLeash(map, world.structures[structure]!.site, ax, ay, leash))) structure = -1;
      if (structure < 0 && pl.state === PlatoonState.Hold) {
        const goal = structureAt(world, pl.site);
        if (goal >= 0 && attackable(world, goal, u.p)) structure = goal;
      }
    }
    u.target = t >= 0 ? units[t]!.id : structure >= 0 ? -(structure + 1) : 0;
    if (u.target !== old && !stats.ranged) {
      if (old > 0) {
        const o = s.unitIndex.get(old);
        if (o !== undefined && s.attackers[o]! > 0) s.attackers[o]!--;
      }
      if (t >= 0) s.attackers[t]!++;
    }
    if (t >= 0 && pl) {
      pl.calm = 0;
      s.engaged[i] = 1;
    } else s.engaged[i] = 0;

    let speed = stats.speed;
    if (player) {
      speed *= doctrineSpeed(player.doctrine);
      if (player.cryUntil > tick) speed *= CRY_SPEED;
    }
    const cell = cellAt(map, u.x, u.y);
    if (!stats.flying && cell >= 0 && map.terrain[cell] === Terrain.Forest) speed *= FOREST_SPEED;

    // Desired velocity this tick, and the most the soldier may cover.
    let wx = 0;
    let wy = 0;
    let cap = speed;
    let follow = false;
    if (routing) {
      const home = map.sites[player!.slot]!;
      if (stats.flying) towards(dir, u.x, u.y, home.x, home.y);
      else flowDirection(dir, map, derived(map).flow[player!.slot]!, u.x, u.y, home.x, home.y);
      cap = speed * ROUT_SPEED;
      wx = dir.x * cap;
      wy = dir.y * cap;
    } else if (t >= 0) {
      const v = units[t]!;
      const dist = towards(dir, u.x, u.y, v.x, v.y);
      const strikeReach = stats.range + STATS[v.kind]!.size * 0.5;
      if (dist <= strikeReach && u.cooldown === 0 && u.swingAt < 0) strike(world, u, v, i, t, dist, s, ev);
      if (stats.ranged) {
        if (dist < stats.range * KITE && !STATS[v.kind]!.ranged) {
          // Back off a step from the melee, but not out of the line.
          wx = -dir.x * speed * 0.7;
          wy = -dir.y * speed * 0.7;
        } else if (dist > stats.range * 0.95) {
          // Out of range: hold the rank and let the line carry the archers forward.
          if (deployed) follow = true;
          else {
            wx = dir.x * speed;
            wy = dir.y * speed;
          }
        }
      } else if (dist > strikeReach * 0.8) {
        if (role === Role.Cavalry && dist > 30) flankRoute(world, s, u, v, t);
        wx = dir.x * speed;
        wy = dir.y * speed;
      }
    } else if (structure >= 0) {
      const site = world.structures[structure]!.site;
      const def = map.sites[site]!;
      const dist = towards(dir, u.x, u.y, def.x, def.y) - def.radius * STRUCTURE_REACH;
      // Walk around rock and water to reach the walls; fliers go straight.
      if (dist > stats.range && !stats.flying) flowDirection(dir, map, derived(map).flow[site]!, u.x, u.y, def.x, def.y);
      if (dist <= stats.range && u.cooldown === 0 && u.swingAt < 0) {
        u.cooldown = stats.cooldown;
        if (stats.breath) breathe(world, s, i, def.x, def.y, ev);
        else if (stats.ranged) fire(world, s, i, -(structure + 1), def.x, def.y, structureDamage(world, s, i), ev);
        else {
          u.swingAt = tick + MELEE_WINDUP;
          ev.swings.push({ from: u.id, to: -(structure + 1) });
        }
      }
      if (dist > stats.range * 0.8) {
        wx = dir.x * speed;
        wy = dir.y * speed;
      }
    } else if (placed) follow = true;

    if (follow) {
      // March in step: move with the place, closing on it.
      const ex = slot.x - u.x;
      const ey = slot.y - u.y;
      const remaining = Math.sqrt(ex * ex + ey * ey);
      // A straggler cut off from its place by rock or water follows the banner's road
      // instead of pressing against the far bank forever. One already further along
      // that road than its marching banner waits for it to come by.
      // Only the next few strides are looked at: an obstacle further on is met when the soldier gets there.
      const look = remaining > CUT_LOOK ? CUT_LOOK / remaining : 1;
      if (remaining > SPACING * 2 && !stats.flying && !clearPath(map, u.x, u.y, u.x + ex * look, u.y + ey * look)) {
        const site = pl!.site >= 0 ? pl!.site : player!.slot;
        const field = derived(map).flow[site]!;
        const here = cell >= 0 ? field.cost[cell]! : -1;
        const banner = cellAt(map, pl!.x, pl!.y);
        const there = banner >= 0 ? field.cost[banner]! : -1;
        cap = speed * CATCH_UP;
        if (!(pl!.state === PlatoonState.March && here >= 0 && there >= 0 && here <= there)) {
          flowDirection(dir, map, field, u.x, u.y, map.sites[site]!.x, map.sites[site]!.y);
          wx = dir.x * cap;
          wy = dir.y * cap;
        }
      } else if (remaining > SLOT_TOLERANCE || slot.vx * slot.vx + slot.vy * slot.vy > 0.01) {
        cap = remaining > SPACING * 2 ? speed * CATCH_UP : speed;
        wx = slot.vx + ex * SLOT_GAIN;
        wy = slot.vy + ey * SLOT_GAIN;
        const m2 = wx * wx + wy * wy;
        if (m2 > cap * cap) {
          const k = cap / Math.sqrt(m2);
          wx *= k;
          wy *= k;
        }
      }
    }
    // Ranks are judged on the soldiers keeping them, not on those off fighting.
    if (placed && !stats.flying && t < 0 && structure < 0) {
      const ex = slot.x - u.x;
      const ey = slot.y - u.y;
      const e = Math.sqrt(ex * ex + ey * ey);
      s.errSum[pi]! += u.kind === Kind.Trebuchet ? e * SIEGE_TRAIL : e;
      s.errN[pi]!++;
    }

    separation(push, units, s.hash, i);
    const vx = push.x + wx;
    const vy = push.y + wy;
    if (stats.flying) flyMove(moved, map, u.x, u.y, vx, vy, Math.max(speed, cap));
    else resolveMove(moved, map, u.x, u.y, vx, vy, Math.max(speed, cap));
    if (u.kind === Kind.Knight && u.run >= 0) {
      const mx = moved.x - u.x;
      const my = moved.y - u.y;
      u.run = Math.min(KNIGHT_CHARGE_RUN, u.run + Math.sqrt(mx * mx + my * my));
    }
    s.nx[i] = moved.x;
    s.ny[i] = moved.y;
  }
}

/** Cavalry in front of an enemy line rides wide round its flank instead of into its spears. Sets `dir`. */
function flankRoute(world: World, s: Scratch, u: Unit, v: Unit, t: number): void {
  const pj = s.unitPlatoon[t]!;
  if (pj < 0) return;
  const ep = world.platoons[pj]!;
  if (ep.form === Form.Column || ep.state === PlatoonState.Rout) return;
  const rx = u.x - v.x;
  const ry = u.y - v.y;
  if (rx * ep.hx + ry * ep.hy <= 8) return;
  const side = rx * -ep.hy + ry * ep.hx >= 0 ? 1 : -1;
  const px = v.x - ep.hy * side * FLANK - ep.hx * FLANK * 0.5;
  const py = v.y + ep.hx * side * FLANK - ep.hy * FLANK * 0.5;
  towards(dir, u.x, u.y, px, py);
}

function strike(world: World, u: Unit, v: Unit, i: number, t: number, dist: number, s: Scratch, ev: TickEvents): void {
  const stats = STATS[u.kind]!;
  u.cooldown = stats.cooldown;
  if (stats.breath) breathe(world, s, i, v.x, v.y, ev);
  else if (stats.ranged) {
    // A burst is weighed against each soldier it lands on, so it carries its raw force.
    const damage = stats.splash > 0 ? stats.damage * attackerMultiplier(world, s, i, u.p >= 0 ? world.players[u.p] : undefined) : unitDamage(world, s, i, t);
    fire(world, s, i, v.id, v.x, v.y, damage, ev);
  }
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
        // Each sack today rebuilds the walls stronger, so no capital is farmed all day.
        st.maxHp = CAPITAL_HP * (1 + SACK_FORTIFY * st.sacked);
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
    // A capital sacked today mans its towers harder: each sack adds the tower's base damage again.
    const tower = st.p === NEUTRAL ? MONOLITH_TOWER : CAPITAL_TOWER;
    const def = world.map.sites[st.site]!;
    const t = nearestEnemy(world, s, st.p, def.x, def.y, tower.range + def.radius * 0.5);
    if (t < 0) continue;
    const v = units[t]!;
    const dx = v.x - def.x;
    const dy = v.y - def.y;
    const flight = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / ARROW_SPEED));
    world.shots.push({ from: -(k + 1), p: st.p, target: v.id, x: def.x, y: def.y, landAt: tick + flight, damage: tower.damage * (1 + st.sacked), kind: ShotKind.TowerBolt, splash: 0, tx: v.x, ty: v.y });
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
  const shooter = SHOOTER[shot.kind];
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = world.units[j]!;
        if (v.p === shot.p) continue;
        const dx = v.x - x;
        const dy = v.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const bonus = shooter !== undefined ? matchup(shooter, v.kind) : 1;
        const dmg = mitigated(world, s, j, shot.damage * bonus * (1 - 0.5 * (d / r)), true);
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
      pl.morale = Math.max(0, pl.morale - (s.heralds[pi]! > 0 ? loss * 0.5 : loss));
    }
    if (u.p >= 0) world.players[u.p]!.losses++;
    if (killer >= 0) {
      const k = world.players[killer]!;
      k.kills++;
      k.slain[u.kind]!++;
      if (k.cryUntil > world.tick) k.feats.cryKills++;
      const home = world.map.sites[k.slot]!;
      const hx = u.x - home.x;
      const hy = u.y - home.y;
      if (hx * hx + hy * hy <= HOME_TURF * HOME_TURF) k.feats.homeKills++;
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
      if (enemies > pl.alive * 2) pl.morale = Math.max(0, pl.morale - OUTNUMBERED_DRAIN * OUTNUMBER_CHECK * (s.heralds[i]! > 0 ? 0.5 : 1));
    } else if (pl.calm > ENGAGE_CALM_TICKS) {
      pl.morale = Math.min(MORALE_MAX, pl.morale + MORALE_RECOVER);
    }
    const hasChampion = s.champions[i]! > 0;
    pl.champion = hasChampion;
    if (hasChampion && pl.morale < CHAMPION_MORALE_FLOOR) pl.morale = CHAMPION_MORALE_FLOOR;
    if (pl.morale <= 0) {
      pl.morale = 0;
      pl.state = PlatoonState.Rout;
      // Routed soldiers flee as a rabble; they march off in column again once rallied.
      pl.form = Form.Column;
      pl.formAt = world.tick;
      pl.threat = 0;
      pl.formed = -1;
      pl.routeSite = -1;
      pl.trail.length = 0;
      world.players[pl.p]!.routs++;
      creditRout(world, pl.p, pl.x, pl.y);
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
    let moved = 0;
    for (const u of units) {
      if (u.platoon !== from.id) continue;
      u.platoon = to.id;
      moved++;
    }
    // Draw the merged platoon up afresh next tick, the remnant taking its places in the ranks.
    to.formed = -1;
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
      state.heldSince = world.tick;
      const taker = world.players[only]!;
      taker.captures++;
      if (def.kind === 'heart') taker.feats.heartCaptures++;
      if (previous >= 0 && previous === world.leader) taker.feats.leaderTakes++;
      ev.captures.push({ site: k, p: only, previous });
    }
  }
}

// Holdings pay in full only while garrisoned, so a leader must spread thin to keep them.
/** Once a second: the longest hold of any site, and time spent leading. */
function trackFeats(world: World): void {
  for (const site of world.sites) {
    if (site.owner < 0 || site.heldSince < 0) continue;
    const feats = world.players[site.owner]!.feats;
    feats.holdBest = Math.max(feats.holdBest, world.tick - site.heldSince);
  }
  if (world.leader >= 0) world.players[world.leader]!.feats.ledTicks += TICKS_PER_SECOND;
}

/** A routed platoon's nearest enemy soldier earns the rout for their player. */
function creditRout(world: World, victim: number, x: number, y: number): void {
  let best = -1;
  let bestD = 150 * 150;
  for (const u of world.units) {
    if (u.p < 0 || u.p === victim) continue;
    const dx = u.x - x;
    const dy = u.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = u.p;
    }
  }
  if (best >= 0) world.players[best]!.feats.routsCaused++;
}

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
