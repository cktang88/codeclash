// The battle: two armies on an open field, fought to a rout.
//
// Deterministic (see rng.ts): the server fights it once to decide the day, and every browser
// fights it again from the same setup to show it, tick for tick. Soldiers are individual
// figures; when an army is too large to draw, each figure stands for several men (`scale`).
//
// Each side deploys the way a Total War army does: a skirmish screen, a first line of heavy
// foot with spears on its ends, the archers behind it, a second line in support, cavalry on
// the wings, engines and the general at the rear. Regiments are rigid blocks: an anchor (the
// middle of the front rank) walks and wheels, and every man keeps his slot in the files. When
// two blocks meet, the front ranks fight the men opposite them and the files close up as they
// fall; the rear ranks wait. Every regiment of the line is given a place against the enemy
// line (a front to fight, or an open flank to wrap), archers loose volleys at blocks that are
// not locked with friends, cavalry rides round the wings to charge archers and the rear and
// then pulls out to charge again, spears brace, and broken regiments run, rallying once if
// nobody chases them. Morale settles toward what a regiment's situation is worth (losses,
// the rate of loss, being taken in flank or rear, the general nearby) and charges shock it.
//
// Hot per-soldier data lives in typed arrays (struct of arrays); the `Soldier` objects are
// views onto them, so a renderer can keep reading `s.x`, `s.hp` and the rest.

import { factionStats, type FactionId } from './factions.ts';
import { mixSeed, Rng } from './rng.ts';
import { emptyCounts, U, UNIT_COUNT, type Counts, type Role, type UnitStats } from './units.ts';
import { FATIGUE, MORALE, newOrder, PERSONALITIES, PLANS, type CommanderTrait, type MoraleState, type Order, type OrderKind, type Personality, type Plan } from './command.ts';

export type { CommanderTrait, MoraleState, Order, OrderKind, Personality, Plan } from './command.ts';
export { MORALE } from './command.ts';

export const BATTLE_VERSION = 4;
/**
 * Mixed into every battle's seed. It was BATTLE_VERSION until v3, which kept v2's salt: a
 * version bump refuses old setups (BattleVersionError) but does not re-seed battles by itself.
 */
const SEED_SALT = 2;

/** Thrown for a setup fought under another BATTLE_VERSION (see docs/replays.md). */
export class BattleVersionError extends Error {
  constructor(readonly version: number) {
    super(`battle recorded under rules v${version}; this build fights v${BATTLE_VERSION}`);
  }
}
/** The field, in world units (a man is about five across). Armies face each other along x. */
export const FIELD_W = 1600;
export const FIELD_H = 1200;
export const TICK_S = 0.1;
export const TICKS_PER_SECOND = 10;
/** Battles end here at the latest, decided on the strength left (six minutes). */
export const MAX_TICKS = 3600;
/** Figures per side at most; bigger armies are drawn with each figure standing for several men. */
export const MAX_FIGURES = 2800;

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

/** Per-soldier hot data, struct of arrays. Index = soldier id. */
class Store {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly hp: Float64Array;
  /** Charge impetus 0..1. */
  readonly imp: Float64Array;
  /** Last tick's separation push (units per second): `move` does not walk back into it. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  /** Slot offset in the regiment: across the front (sx) and along the facing (sy, 0 = front rank). */
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  /** File (column, may be fractional for a centred short rank) and rank. */
  readonly col: Float64Array;
  readonly row: Int32Array;
  readonly rad: Float64Array;
  readonly mass: Float64Array;
  readonly spd: Float64Array;
  readonly state: Uint8Array;
  readonly team: Uint8Array;
  readonly reg: Int32Array;
  readonly target: Int32Array;
  readonly cd: Int32Array;
  readonly ammo: Int32Array;
  readonly acted: Int32Array;
  readonly hit: Int32Array;
  readonly died: Int32Array;
  readonly kills: Int32Array;
  readonly stun: Int32Array;
  constructor(n: number) {
    const f = () => new Float64Array(n);
    const i = () => new Int32Array(n);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.hp = f(); this.imp = f();
    this.px = f(); this.py = f(); this.sx = f(); this.sy = f(); this.col = f(); this.row = i();
    this.rad = f(); this.mass = f(); this.spd = f();
    this.state = new Uint8Array(n); this.team = new Uint8Array(n);
    this.reg = i(); this.target = i(); this.cd = i(); this.ammo = i();
    this.acted = i(); this.hit = i(); this.died = i(); this.kills = i(); this.stun = i();
  }
}

/**
 * One figure: a view onto the battle's arrays. The setters exist for tools (perf harnesses that
 * clone figures); the simulation owns these values, so a renderer should only read them.
 */
export class Soldier {
  constructor(
    private readonly d: Store,
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    readonly reg: number,
    readonly s: UnitStats,
    readonly vet: boolean,
    readonly commander: boolean,
  ) {}
  get x(): number { return this.d.x[this.id]!; }
  set x(v: number) { this.d.x[this.id] = v; }
  get y(): number { return this.d.y[this.id]!; }
  set y(v: number) { this.d.y[this.id] = v; }
  get vx(): number { return this.d.vx[this.id]!; }
  set vx(v: number) { this.d.vx[this.id] = v; }
  get vy(): number { return this.d.vy[this.id]!; }
  set vy(v: number) { this.d.vy[this.id] = v; }
  get hp(): number { return this.d.hp[this.id]!; }
  set hp(v: number) { this.d.hp[this.id] = v; }
  get state(): State { return this.d.state[this.id]! as State; }
  set state(v: State) { this.d.state[this.id] = v; }
  /** Soldier id it is fighting, or -1. */
  get target(): number { return this.d.target[this.id]!; }
  set target(v: number) { this.d.target[this.id] = v; }
  get cooldown(): number { return this.d.cd[this.id]!; }
  get ammo(): number { return this.d.ammo[this.id]!; }
  /** Charge impetus 0..1 (a galloping horseman about to hit). */
  get impetus(): number { return this.d.imp[this.id]!; }
  /** Tick of the last blow or shot, for animation. */
  get actedAt(): number { return this.d.acted[this.id]!; }
  set actedAt(v: number) { this.d.acted[this.id] = v; }
  /** Tick it was last hurt (blow, missile, stakes, impact), -100 before. */
  get hitAt(): number { return this.d.hit[this.id]!; }
  set hitAt(v: number) { this.d.hit[this.id] = v; }
  /** Tick it fell, or -1. */
  get diedAt(): number { return this.d.died[this.id]!; }
  set diedAt(v: number) { this.d.died[this.id] = v; }
  /** Knocked down or reeling from a charge: ticks left. */
  get stunned(): number { return this.d.stun[this.id]!; }
  get kills(): number { return this.d.kills[this.id]!; }
  /** Slot offset within the regiment: across the front and in depth (0 = front rank, negative behind). */
  get sx(): number { return this.d.sx[this.id]!; }
  get sy(): number { return this.d.sy[this.id]!; }
}

/**
 * What a regiment is doing. 'skirmish' is skirmishers falling back through their own line;
 * 'brace' is spears set against horse; 'withdraw' is cavalry pulling out to charge again;
 * 'rally' is a regiment that ran and has come back.
 */
export type Mode =
  | 'hold' | 'advance' | 'charge' | 'melee' | 'shoot' | 'skirmish' | 'flank' | 'kite' | 'rout' | 'reserve' | 'guard'
  | 'brace' | 'withdraw' | 'pursue' | 'rally';

/**
 * How a block stands and moves. Must match `Stance` in src/client/render/contract.ts (redeclared
 * here so the game never imports from the client).
 *
 * - line: the default block, files and ranks.
 * - column: narrow and deep, for long marches: 10% faster, turns quickly, but -8 defence.
 * - loose: wide gaps (archers, skirmishers, horse archers, light horse harassing): arrows and
 *   stones find fewer men (missile damage x0.65, stones x0.5, and the gaps let shots fall
 *   harmlessly), -6 melee defence, charges knock fewer men about.
 * - shieldwall: heavy foot locks shields: tight files, front shields stop +35% more missiles
 *   and missile damage x0.7, +12 melee defence, -4 attack, half pace, slow to turn.
 * - pikewall: spears levelled, deep and tight: a horseman charging its front is impaled (and
 *   stopped dead), +40% damage against horse, +6 defence from the front but -10 from flank and
 *   rear, a third of the pace and very slow to turn.
 * - wedge: knights in a triangle, point forward: the charge hits 25% harder, knocks men half
 *   as far again and carries deeper (impetus lasts nearly twice as long through the ranks).
 * - braced: shock troops planted to receive: +10 defence, a charge into its front loses most of
 *   its force and knocks nobody back; it barely moves.
 */
export type Stance = 'line' | 'column' | 'loose' | 'shieldwall' | 'pikewall' | 'wedge' | 'braced';

interface StanceDef {
  /** Multiplies the role's gap between men; `add` widens it further. */
  gap: number;
  add: number;
  /** Files per rank: a fixed ratio, or the role's ratio times `ratioMul`. */
  ratio: number;
  ratioMul: number;
  pace: number;
  turn: number;
  /** Melee defence and attack bonuses (the pikewall's defence is -10 from flank and rear). */
  defence: number;
  attack: number;
  /** Missile and stone damage taken. */
  missile: number;
  stones: number;
}

export const STANCES: Record<Stance, StanceDef> = {
  line: { gap: 1, add: 0, ratio: 0, ratioMul: 1, pace: 1, turn: 1, defence: 0, attack: 0, missile: 1, stones: 1 },
  column: { gap: 1, add: 0, ratio: 0.45, ratioMul: 1, pace: 1.1, turn: 1.3, defence: -8, attack: 0, missile: 1.15, stones: 1.2 },
  loose: { gap: 1, add: 3.5, ratio: 0, ratioMul: 1.15, pace: 1, turn: 1, defence: -6, attack: 0, missile: 0.65, stones: 0.5 },
  shieldwall: { gap: 0.2, add: 0, ratio: 0, ratioMul: 1.1, pace: 0.5, turn: 0.7, defence: 12, attack: -4, missile: 0.7, stones: 0.9 },
  pikewall: { gap: 0.3, add: 0, ratio: 1.3, ratioMul: 1, pace: 0.35, turn: 0.35, defence: 6, attack: 0, missile: 1, stones: 1.1 },
  wedge: { gap: 1, add: 0, ratio: 0, ratioMul: 1, pace: 1.05, turn: 1, defence: -3, attack: 2, missile: 1, stones: 1 },
  braced: { gap: 0.6, add: 0, ratio: 0, ratioMul: 1, pace: 0.3, turn: 0.6, defence: 10, attack: 0, missile: 1, stones: 1 },
};
/** Stances worth a line in the ticker. */
const NOTABLE: Partial<Record<Stance, boolean>> = { shieldwall: true, pikewall: true, wedge: true, braced: true };

export class Regiment {
  members: number[] = [];
  stance: Stance = 'line';
  stanceAt = -1000;
  /** Pinned by a test or tool: the regiment keeps this stance. */
  pinned: Stance | null = null;
  /** Missiles falling on it lately (decaying). */
  arrows = 0;
  /** Its men's collision radius. */
  rad = 2.4;
  private told: Partial<Record<Stance, number>> = {};
  /** Whether a stance change is news (once per stance in a while). */
  tell(s: Stance, tick: number): boolean {
    if (!NOTABLE[s]) return false;
    const t = this.told[s];
    if (t !== undefined && tick - t < 300) return false;
    this.told[s] = tick;
    return true;
  }
  /** Centre of its living men. */
  cx = 0;
  cy = 0;
  /** Formation anchor (middle of the front rank) and facing (unit vector). */
  ax = 0;
  ay = 0;
  fx = 1;
  fy = 0;
  /** Facing it is wheeling toward. */
  dfx = 1;
  dfy = 0;
  /** Where the anchor is walking. */
  tx = 0;
  ty = 0;
  /** Anchor movement this tick, world units. */
  vax = 0;
  vay = 0;
  mode: Mode = 'hold';
  modeAt = 0;
  morale = 50;
  baseMorale = 50;
  alive = 0;
  start = 0;
  targetReg = -1;
  /** Place against the target: 0 its front, 1 and 2 its flanks, 3 its rear. */
  slot = 0;
  /** Men locked in melee: at least a few in reach of a foe. */
  engaged = false;
  /** An enemy block is close: its men look for foes. */
  contact = false;
  routed = false;
  routAt = -1;
  quietSince = 0;
  spacing = 5;
  speed = 20;
  cols = 1;
  rows = 1;
  /** Formation frontage and depth, world units. */
  width = 0;
  depth = 0;
  /** Spread of its men about the centre. */
  radius = 0;
  /** 1: first line, 2: second line, 0: elsewhere. */
  line = 0;
  /** Recent losses and kills (shares of its start, decaying) and shock from flank and rear blows. */
  recent = 0;
  recentKills = 0;
  flankShock = 0;
  meleeTicks = 0;
  charges = 0;
  ammoLeft = 0;
  homeY = 0;
  /** Withdrawal point for cycle charges. */
  wx = 0;
  wy = 0;
  reflow = false;
  everEngaged = false;
  /** Morale state for the renderer and the ticker (see MORALE in command.ts). */
  moraleState: MoraleState = 'steady';
  rallies = 0;
  rallyAt = -1000;
  /** 0..1: running and fighting tire men; rest restores them. */
  fatigue = 0;
  /** The General's current order (kind, for overlays) and its details. */
  order: OrderKind = 'hold';
  ord: Order = newOrder();
  /** Second line thrown in by the General. */
  committed = false;
  /** Pulled out of the line once already. */
  withdrew = false;
  /** Skirmishers that have fallen back behind the line. */
  retired = false;
  refuseUntil = -100;
  waverTold = -1000;
  /** Enemy in contact, in men of this regiment's worth, for being outnumbered. */
  enemyNear = 0;
  veteran = false;
  /** Green troops fear missiles more. */
  green = false;
  homeX = 0;
  /** Shots tried since the last think: out of range, and loosed. */
  short = 0;
  loosed = 0;
  constructor(
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    readonly role: Role | 'command',
  ) {}
  get firing(): boolean {
    return (this.mode === 'shoot' || this.mode === 'kite') && this.targetReg >= 0;
  }
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
  /**
   * 'contact': a side's line first meets the enemy; 'break': a whole army gives way;
   * 'waver', 'rout', 'rally', 'shattered': a regiment's morale; 'stance': a regiment takes a
   * notable stance; 'general-order': the General's plan or a big order (see `note`).
   */
  kind: 'rout' | 'commander' | 'charge' | 'contact' | 'rally' | 'break' | 'stance' | 'waver' | 'shattered' | 'general-order';
  cls: number;
  /** The regiment concerned (-1 for the whole army). */
  reg?: number;
  stance?: Stance;
  order?: OrderKind;
  plan?: Plan;
  /** Wing, as that side sees it. */
  side?: 'left' | 'centre' | 'right';
  /** A short phrase for the ticker, after the General's title ("commits the reserve to the left"). */
  note?: string;
}

interface Forces {
  value: number;
  foot: number;
  cav: number;
  knights: number;
  missile: number;
  routing: number;
  all: number;
  wingLow: number;
  wingHigh: number;
}

/**
 * A side's General: a plan for the day, read from the field and from its own temperament, and
 * orders for every regiment. It can misjudge the field and choose a poor plan (less often the
 * more skilled it is), which is what lets a smaller army win now and then.
 */
export class General {
  plan: Plan = 'advance';
  planAt = -1;
  readonly personality: Personality;
  /** 0.55..0.95: how well it reads the field and how rarely it blunders. */
  readonly skill: number;
  /** Hook for the player's Commander trait (not set by the game yet). */
  trait: CommanderTrait | null = null;
  /** Switches for tests and tools: forbid the horse to leave the wings, or the reserve to be committed. */
  useCavalry = true;
  useReserve = true;
  /** Forces a plan. */
  fixedPlan: Plan | null = null;
  /** The wing it masses on (-1 low y, 1 high y). */
  strong: -1 | 1 = 1;
  holdUntil = 0;
  haltUntil = 0;
  dueled = false;
  committed = 0;
  /** The army's spirits on the day (from the general's rng): added to every regiment's morale. */
  readonly mood: number;
  /** A blunder: the knights go in before the lines meet. */
  rashKnights: boolean;
  readonly rng: Rng;
  constructor(readonly team: number, seed: number) {
    this.rng = new Rng(mixSeed(seed, SEED_SALT, 7001 + team));
    this.personality = PERSONALITIES[this.rng.int(PERSONALITIES.length)]!;
    this.skill = 0.55 + this.rng.next() * 0.4;
    this.rashKnights = this.rng.next() < (1 - this.skill) * 0.4;
    this.mood = (this.rng.next() - 0.5) * 2 * MORALE.mood;
  }
}

interface TeamState {
  contactAt: number;
  /** Share of the army's value dead, fled or running. */
  loss: number;
  /** Mean anchor x of the fighting line, its depth and lateral span. */
  frontX: number;
  lineDepth: number;
  minY: number;
  maxY: number;
  midY: number;
  hasLine: boolean;
  engaged: boolean;
  contacted: boolean;
  missile: number;
}

const sqrt = Math.sqrt;
const CELL = 8;
const GW = FIELD_W / CELL;
const GH = FIELD_H / CELL;
/** Front-to-front distance between the armies at deployment. */
const GAP = 600;
/** Global lethality: tuned so a clash of equal lines lasts about a minute. */
const MELEE_K = 2.0;
const MISSILE_K = 1.5;
const FRIENDLY_FIRE = 0.25;
const RATIO: Record<string, number> = { line: 3.6, missile: 5, skirmish: 6, flank: 2.4, 'shock-cav': 2.2, 'horse-archer': 2.6, siege: 99, command: 2 };
const GAP_IN_RANK: Record<string, number> = { line: 0.5, missile: 1.2, skirmish: 3.5, flank: 1.6, 'shock-cav': 1.4, 'horse-archer': 2.4, siege: 10, command: 2 };
const PACE: Record<Mode, number> = {
  hold: 0, advance: 0.6, charge: 1, melee: 0.1, shoot: 0, skirmish: 0.95, flank: 0.95, kite: 1, rout: 0, reserve: 0.6, guard: 0.6,
  brace: 0, withdraw: 1, pursue: 1, rally: 0,
};
/** Modes in which a far goal turns the block toward its line of march. */
const MARCH: Record<Mode, boolean> = {
  hold: false, advance: true, charge: true, melee: false, shoot: false, skirmish: true, flank: true, kite: true, rout: false, reserve: true, guard: true,
  brace: false, withdraw: true, pursue: true, rally: false,
};

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

const isCav = (r: Regiment) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer';
const isFoot = (r: Regiment) => r.role === 'line' || r.role === 'missile' || r.role === 'skirmish';
const clampX = (x: number) => Math.max(4, Math.min(FIELD_W - 4, x));
const clampY = (y: number) => Math.max(4, Math.min(FIELD_H - 4, y));

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
  /** A side whose army has broken, and when (the pursuit runs on a little before the end). */
  broken: [boolean, boolean] = [false, false];
  brokenAt = -1;
  /** Each side's General. */
  readonly generals: [General, General];
  private readonly d: Store;
  private readonly n: number;
  private readonly teamRegs: [Regiment[], Regiment[]] = [[], []];
  private readonly ts: [TeamState, TeamState];
  private readonly startTotal: [number, number] = [0, 0];
  private readonly startValue: [number, number] = [0, 0];
  private readonly figureScale: number;
  private readonly grid = new Int32Array(GW * GH + 1);
  private readonly fill = new Int32Array(GW * GH);
  private readonly items: Int32Array;
  /** Per grid slot (sorted by cell): position, radius, mass, team, loose (routing or skirmisher), and push. */
  private readonly kx: Float64Array;
  private readonly ky: Float64Array;
  private readonly kr: Float64Array;
  private readonly km: Float64Array;
  private readonly kt: Uint8Array;
  private readonly kl: Uint8Array;
  private readonly kpx: Float64Array;
  private readonly kpy: Float64Array;
  /** Bow wave: how far ahead a galloping rider shoves enemy foot aside (0 for everyone else). */
  private readonly kw: Float64Array;
  /** Cells holding anyone, in index order. */
  private readonly busy: Int32Array;
  private busyN = 0;
  private readonly cellOf: Int32Array;
  private readonly tmp = new Float64Array(4);

  /** The setup as fought: counts made whole men (see `sanitize`). */
  readonly setup: BattleSetup;

  constructor(given: BattleSetup) {
    // A setup recorded under another version of the rules would replay as a different battle.
    if (given.version !== BATTLE_VERSION) throw new BattleVersionError(given.version);
    const setup = (this.setup = sanitize(given));
    this.rng = new Rng(mixSeed(setup.seed, SEED_SALT));
    this.generals = [new General(0, setup.seed), new General(1, setup.seed)];
    this.scale = scaleFor(setup.armies[0].counts, setup.armies[1].counts);
    this.stats = [factionStats(setup.armies[0].faction), factionStats(setup.armies[1].faction)];
    let n = 0;
    let most = 0;
    for (let t = 0; t < 2; t++) {
      const army = setup.armies[t]!;
      let m = 0;
      for (let c = 0; c < UNIT_COUNT; c++) m += figures(army.counts[c] ?? 0, this.scale);
      most = Math.max(most, m);
      n += m + (army.commander ? 7 : 0);
    }
    this.n = n;
    this.figureScale = most;
    this.d = new Store(n);
    this.items = new Int32Array(n);
    this.kx = new Float64Array(n);
    this.ky = new Float64Array(n);
    this.kr = new Float64Array(n);
    this.km = new Float64Array(n);
    this.kt = new Uint8Array(n);
    this.kl = new Uint8Array(n);
    this.kpx = new Float64Array(n);
    this.kpy = new Float64Array(n);
    this.kw = new Float64Array(n);
    this.busy = new Int32Array(Math.min(n, GW * GH) + 1);
    this.cellOf = new Int32Array(n);
    const team = (): TeamState => ({ contactAt: -1, loss: 0, frontX: 0, lineDepth: 0, minY: 0, maxY: 0, midY: FIELD_H / 2, hasLine: false, engaged: false, contacted: false, missile: 0 });
    this.ts = [team(), team()];
    this.deploy(0);
    this.deploy(1);
    for (let t = 0; t < 2; t++) {
      let p = 0;
      for (let i = 0; i < n; i++) {
        const s = this.soldiers[i]!;
        if (s.team === t && s.s.range > 0 && s.s.role !== 'siege') p += s.s.missileDamage / s.s.reload;
        if (s.team === t) this.startTotal[t]!++;
      }
      this.ts[t]!.missile = p;
    }
    const m0 = this.ts[0].missile;
    const m1 = this.ts[1].missile;
    this.stance = [m0 > m1 * 1.25 ? 'hold' : 'press', m1 > m0 * 1.25 ? 'hold' : 'press'];
    for (const r of this.regiments) this.survey(r);
    this.updateFront(0);
    this.updateFront(1);
  }

  // ------------------------------------------------------------------ deployment

  private addSoldier(team: number, cls: number, reg: Regiment, st: UnitStats, vet: boolean, commander: boolean, hp: number): void {
    const id = this.soldiers.length;
    const d = this.d;
    d.hp[id] = hp;
    d.ammo[id] = st.ammo;
    d.rad[id] = st.radius;
    d.mass[id] = st.mass;
    d.spd[id] = st.speed;
    d.team[id] = team;
    d.reg[id] = reg.id;
    d.target[id] = -1;
    d.acted[id] = -100;
    d.hit[id] = -100;
    d.died[id] = -1;
    this.soldiers.push(new Soldier(d, id, team, cls, reg.id, st, vet, commander));
    reg.members.push(id);
  }

  private deploy(team: number): void {
    const army = this.setup.armies[team]!;
    const stats = this.stats[team]!;
    const dir = team === 0 ? 1 : -1;
    const frontX = FIELD_W / 2 - (dir * GAP) / 2;
    const X = (depth: number) => frontX - dir * depth;
    const midY = FIELD_H / 2;
    const regs: Regiment[] = [];
    const vetLeft = army.veterans.slice();
    // Regiment size grows with the armies, so a big battle has big blocks, not a swarm of small ones.
    const base = Math.max(30, Math.min(120, Math.round(2.2 * sqrt(this.figureScale))));
    // Engines go four to a battery, but never more than 32 batteries a side: an army of engines
    // would otherwise be hundreds of tiny regiments (slow to fight, deployed far off the field).
    const sizeOf = (role: Role, n: number): number =>
      role === 'line' ? base
        : role === 'missile' ? Math.round(base * 0.8)
          : role === 'skirmish' ? Math.max(16, Math.round(base * 0.55))
            : role === 'siege' ? Math.max(4, Math.ceil(n / 32))
              : role === 'horse-archer' ? Math.max(10, Math.round(base * 0.36))
                : Math.max(10, Math.round(base * 0.4));
    for (let cls = 0; cls < UNIT_COUNT; cls++) {
      const n = figures(army.counts[cls] ?? 0, this.scale);
      this.startFigures[team]![cls] = n;
      if (n <= 0) continue;
      const st = stats[cls]!;
      const count = Math.ceil(n / sizeOf(st.role, n));
      for (let r = 0; r < count; r++) {
        const m = Math.round(((r + 1) * n) / count) - Math.round((r * n) / count);
        if (m <= 0) continue;
        const reg = new Regiment(this.regiments.length, team, cls, st.role);
        reg.rad = st.radius;
        reg.stance = defaultStance(reg);
        reg.spacing = spacingFor(reg, reg.stance);
        reg.speed = st.speed;
        reg.fx = reg.dfx = dir;
        this.regiments.push(reg);
        this.teamRegs[team]!.push(reg);
        regs.push(reg);
        let vets = 0;
        for (let i = 0; i < m; i++) {
          const vet = (vetLeft[cls] ?? 0) > 0;
          if (vet) {
            vetLeft[cls]! -= this.scale;
            vets++;
          }
          this.addSoldier(team, cls, reg, st, vet, false, st.hp * (vet ? 1.1 : 1));
        }
        reg.start = reg.alive = m;
        reg.veteran = vets > m / 2;
        reg.green = !reg.veteran && st.morale < 60;
        reg.baseMorale = reg.morale =
          st.morale + army.moraleBonus + (reg.veteran ? MORALE.veteran : vets > 0 ? MORALE.veteran / 2 : 0) + (st.morale >= 80 ? MORALE.elite : st.morale < 55 ? MORALE.levy : 0);
        shape(reg, m);
      }
    }

    const byRole = (role: Role) => regs.filter((r) => r.role === role);
    // The line: shock troops and heavy foot in the middle of the first line, spears on its ends,
    // the rest in a second line behind.
    const line = byRole('line');
    const heavy = line.filter((r) => r.cls !== U.Spearmen).sort((a, b) => lineOrder(a.cls) - lineOrder(b.cls) || a.id - b.id);
    const spears = line.filter((r) => r.cls === U.Spearmen);
    const maxFront = FIELD_H * 0.52;
    let k = line.length <= 3 ? line.length : Math.ceil(line.length * 0.6);
    while (k > 1 && rowWidth(line.slice(0, k)) > maxFront) k--;
    const ends = Math.min(2, spears.length, k >= 3 ? 2 : 0);
    const centre = heavy.slice(0, k - ends);
    const spearUsed = spears.slice(0, ends + Math.max(0, k - ends - centre.length));
    const centreAll = [...centre, ...spearUsed.slice(ends)];
    const first = centreOut(centreAll);
    if (ends >= 1) first.unshift(spearUsed[0]!);
    if (ends >= 2) first.push(spearUsed[1]!);
    const second = centreOut([...heavy.slice(centre.length), ...spears.slice(spearUsed.length)]);
    for (const r of first) r.line = 1;
    for (const r of second) r.line = 2;

    // Keeps a regiment's back rank on the field: a deep overflow row (an army of horse, archers
    // or engines) stands against the back edge instead of beyond it.
    const onField = (reg: Regiment, x: number): number => (dir > 0 ? Math.max(8 + reg.depth, x) : Math.min(FIELD_W - 8 - reg.depth, x));
    const place = (list: Regiment[], depth: number, y0: number, y1: number, gap = 12): number => {
      // Lay regiments across the band between y0 and y1; overflow goes to further rows behind.
      let rank = 0;
      let i = 0;
      while (i < list.length) {
        const row: Regiment[] = [];
        let width = 0;
        while (i < list.length) {
          const w = list[i]!.width;
          if (row.length > 0 && width + w + gap > y1 - y0) break;
          row.push(list[i]!);
          width += w + gap;
          i++;
        }
        let y = (y0 + y1) / 2 - (width - gap) / 2;
        let deepest = 0;
        for (const reg of row) {
          const half = reg.width / 2 + 4;
          const ry = half * 2 >= FIELD_H ? FIELD_H / 2 : Math.max(half, Math.min(FIELD_H - half, y + reg.width / 2));
          this.formUp(reg, onField(reg, X(depth + rank)), ry);
          reg.homeY = reg.ay;
          reg.homeX = reg.ax;
          deepest = Math.max(deepest, reg.depth);
          y += reg.width + gap;
        }
        rank += deepest + 12;
      }
      return rank;
    };
    const half = Math.max(rowWidth(first), 160) / 2;
    const firstDepth = first.length ? place(first, 0, midY - half - 20, midY + half + 20) : 0;
    const missile = byRole('missile');
    const missileDepth = place(missile, Math.max(14, firstDepth), midY - half - 60, midY + half + 60, 10);
    const behind = Math.max(14, firstDepth) + missileDepth;
    const secondDepth = place(second, behind, midY - half - 20, midY + half + 20);
    const skirm = byRole('skirmish');
    if (skirm.length) {
      const sd = Math.max(...skirm.map((r) => r.depth));
      place(skirm, -36 - sd, midY - half - 40, midY + half + 40, 16);
    }
    place(byRole('siege'), behind + secondDepth + 30, midY - half, midY + half, 30);

    // Wings: cavalry split above and below the line; knights at the back of each wing.
    const wings = [...byRole('flank'), ...byRole('horse-archer'), ...byRole('shock-cav')];
    const top: Regiment[] = [];
    const bottom: Regiment[] = [];
    wings.forEach((r, i) => (i % 2 === 0 ? top : bottom).push(r));
    const wingW = (list: Regiment[]) => Math.min(260, list.reduce((w, r) => Math.max(w, r.width), 0) * 2 + 14);
    const tw = wingW(top);
    const bw = wingW(bottom);
    place(top, 0, Math.max(20, midY - half - 30 - tw), midY - half - 30, 14);
    place(bottom, 0, midY + half + 30, Math.min(FIELD_H - 20, midY + half + 30 + bw), 14);

    // The commander and a bodyguard of knights behind the centre.
    if (army.commander) {
      const reg = new Regiment(this.regiments.length, team, U.Knights, 'command');
      const st = stats[U.Knights]!;
      reg.rad = st.radius;
      reg.spacing = spacingFor(reg, reg.stance);
      reg.speed = st.speed;
      reg.fx = reg.dfx = dir;
      this.regiments.push(reg);
      this.teamRegs[team]!.push(reg);
      for (let i = 0; i <= 6; i++) {
        if (i === 0) this.commander[team] = this.soldiers.length;
        this.addSoldier(team, U.Knights, reg, st, true, i === 0, i === 0 ? 360 : st.hp * 1.2);
      }
      reg.start = reg.alive = reg.members.length;
      reg.baseMorale = reg.morale = 95 + army.moraleBonus;
      shape(reg, reg.members.length);
      this.formUp(reg, onField(reg, X(Math.max(14, firstDepth) + missileDepth * 0.5 + 4)), midY);
      reg.homeY = midY;
      reg.homeX = reg.ax;
      reg.veteran = true;
    }

    // Stakes before the archers.
    if (army.stakes) {
      for (const r of missile) {
        this.stakes.push({ team, x: r.ax + dir * 8, y0: r.ay - r.width / 2 - 4, y1: r.ay + r.width / 2 + 4 });
      }
    }
  }

  /** Stands a regiment up with its front rank's middle at (x, y). */
  private formUp(reg: Regiment, x: number, y: number): void {
    reg.ax = reg.tx = x;
    reg.ay = reg.ty = y;
    this.assignSlots(reg, false);
    const d = this.d;
    for (const id of reg.members) {
      d.x[id] = reg.ax + reg.fx * d.sy[id]! - reg.fy * d.sx[id]!;
      d.y[id] = reg.ay + reg.fy * d.sy[id]! + reg.fx * d.sx[id]!;
    }
    reg.cx = reg.ax - reg.fx * reg.depth * 0.5;
    reg.cy = reg.ay - reg.fy * reg.depth * 0.5;
  }

  /**
   * Gives each living man a file and rank, row by row; a short last rank is centred. With
   * `keepOrder` the men are taken front rank first (so the order they stood in is kept).
   */
  private assignSlots(reg: Regiment, keepOrder: boolean): void {
    const d = this.d;
    const ids: number[] = [];
    for (const id of reg.members) if (d.state[id] === State.Fighting) ids.push(id);
    if (keepOrder) ids.sort((a, b) => d.row[a]! - d.row[b]! || d.col[a]! - d.col[b]! || a - b);
    shape(reg, ids.length);
    const cols = reg.cols;
    if (reg.stance === 'wedge') {
      // A triangle, point forward: rank r holds r + 1 men, each rank offset by half a file.
      let i = 0;
      for (let row = 0; i < ids.length; row++) {
        for (let j = 0; j <= row && i < ids.length; j++, i++) {
          const id = ids[i]!;
          d.row[id] = row;
          d.col[id] = (cols - 1) / 2 + j - row / 2;
        }
      }
    } else if (keepOrder && ids.length > cols) {
      // Re-forming: each man takes the nearest file to where he stands (the left of the old
      // front makes the left files of the new one), and within a file the man furthest forward
      // takes the front rank, so men do not have to walk through each other to their new places.
      const n = ids.length;
      const fr = new Float64Array(n);
      const lr = new Float64Array(n);
      const slotC = new Float64Array(n);
      const slotR = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        slotR[i] = row;
        slotC[i] = (i % cols) + (cols - inRow) / 2;
      }
      const slots = Array.from({ length: n }, (_, i) => i).sort((a, b) => slotC[a]! - slotC[b]! || slotR[a]! - slotR[b]!);
      const at = new Map<number, number>();
      for (let i = 0; i < n; i++) {
        const id = ids[i]!;
        const dx = d.x[id]! - reg.ax;
        const dy = d.y[id]! - reg.ay;
        lr[i] = -dx * reg.fy + dy * reg.fx;
        fr[i] = dx * reg.fx + dy * reg.fy;
        at.set(id, i);
      }
      const men = ids.slice().sort((a, b) => lr[at.get(a)!]! - lr[at.get(b)!]! || a - b);
      let k = 0;
      while (k < n) {
        // One file: the slots sharing a file position.
        let e = k + 1;
        while (e < n && slotC[slots[e]!] === slotC[slots[k]!]) e++;
        const file = men.slice(k, e).sort((a, b) => fr[at.get(b)!]! - fr[at.get(a)!]! || a - b);
        for (let j = 0; j < file.length; j++) {
          const sl = slots[k + j]!;
          d.row[file[j]!] = slotR[sl]!;
          d.col[file[j]!] = slotC[sl]!;
        }
        k = e;
      }
    } else {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, ids.length - row * cols);
        d.row[id] = row;
        d.col[id] = (i % cols) + (cols - inRow) / 2;
      }
    }
    this.slotOffsets(reg);
  }

  private slotOffsets(reg: Regiment): void {
    const d = this.d;
    const mid = (reg.cols - 1) / 2;
    let rows = 0;
    for (const id of reg.members) {
      if (d.state[id] !== State.Fighting) continue;
      d.sx[id] = (d.col[id]! - mid) * reg.spacing;
      d.sy[id] = -d.row[id]! * reg.spacing * (reg.stance === 'wedge' ? 0.87 : 1);
      if (d.row[id]! + 1 > rows) rows = d.row[id]! + 1;
    }
    reg.rows = Math.max(1, rows);
    reg.depth = (reg.rows - 1) * reg.spacing * (reg.stance === 'wedge' ? 0.87 : 1) + 4;
  }

  /** Files close up: in each file the men step forward into the ranks of the fallen. */
  private closeRanks(reg: Regiment): void {
    reg.reflow = false;
    const d = this.d;
    let alive = 0;
    for (const id of reg.members) if (d.state[id] === State.Fighting) alive++;
    if (alive === 0) return;
    // Too few left for the frontage: re-form narrower.
    if (reg.stance === 'wedge' || (reg.role !== 'siege' && reg.cols > 3 && alive < reg.cols * 2.2 && reg.stance !== 'column')) {
      this.assignSlots(reg, true);
      return;
    }
    const keys = 2 * reg.cols + 2;
    const files: number[][] = [];
    for (let k = 0; k < keys; k++) files.push([]);
    for (const id of reg.members) {
      if (d.state[id] !== State.Fighting) continue;
      const k = Math.max(0, Math.min(keys - 1, Math.round(d.col[id]! * 2)));
      files[k]!.push(id);
    }
    for (const f of files) {
      if (f.length === 0) continue;
      f.sort((a, b) => d.row[a]! - d.row[b]! || a - b);
      for (let r = 0; r < f.length; r++) d.row[f[r]!] = r;
    }
    this.slotOffsets(reg);
  }

  // ------------------------------------------------------------------ the tick

  done(): boolean {
    return this.result !== null;
  }

  step(): void {
    if (this.result) return;
    this.rebuildGrid();
    if (this.tick % 5 === 0) {
      this.updateFront(0);
      this.updateFront(1);
    }
    // Each General thinks every 1.5 s, the two a little apart.
    if (this.tick % 15 === 0) this.generalThink(0);
    if (this.tick % 15 === 7) this.generalThink(1);
    const regs = this.regiments;
    for (let i = 0; i < regs.length; i++) {
      const r = regs[i]!;
      if ((this.tick + r.id) % 5 === 0) this.think(r);
    }
    for (let i = 0; i < regs.length; i++) this.moveAnchor(regs[i]!);
    const d = this.d;
    const n = this.n;
    // Blows land in turn: alternate which side's men act first, so neither strikes first every tick.
    if (this.tick % 2 === 0) {
      for (let i = 0; i < n; i++) if (d.state[i]! <= State.Routing) this.act(i);
    } else {
      for (let i = n - 1; i >= 0; i--) if (d.state[i]! <= State.Routing) this.act(i);
    }
    if (this.tick % 2 === 0) {
      for (let i = 0; i < n; i++) if (d.state[i]! <= State.Routing) this.move(i);
    } else {
      for (let i = n - 1; i >= 0; i--) if (d.state[i]! <= State.Routing) this.move(i);
    }
    this.separate();
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

  /** Strikes a soldier down at once (for tests and tools: the general falls to a stray bolt). */
  kill(id: number): void {
    const d = this.d;
    if (d.state[id]! >= State.Dead) return;
    this.hurt(id, d.hp[id]! + 1, -1);
  }

  private rebuildGrid(): void {
    const g = this.grid;
    g.fill(0);
    const d = this.d;
    const n = this.n;
    const cellOf = this.cellOf;
    for (let i = 0; i < n; i++) {
      if (d.state[i]! > State.Routing) {
        cellOf[i] = -1;
        continue;
      }
      const c = cellIndex(d.x[i]!, d.y[i]!);
      cellOf[i] = c;
      g[c + 1]!++;
    }
    const cells = GW * GH;
    const busy = this.busy;
    let nb = 0;
    for (let c = 0; c < cells; c++) {
      if (g[c + 1]! > 0) busy[nb++] = c;
      g[c + 1]! += g[c]!;
    }
    this.busyN = nb;
    const fill = this.fill;
    fill.set(g.subarray(0, cells));
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const regs = this.regiments;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i]!;
      if (c < 0) continue;
      const k = fill[c]!++;
      items[k] = i;
      kx[k] = d.x[i]!;
      ky[k] = d.y[i]!;
      this.kr[k] = d.rad[i]!;
      this.km[k] = d.mass[i]!;
      this.kt[k] = d.team[i]!;
      const r = regs[d.reg[i]!]!;
      // Bit 0: a skirmisher (slips through his own lines). Bit 1: planted foot (braced or a pike
      // wall) that a charge does not shove aside.
      const fighting = d.state[i] === State.Fighting;
      this.kl[k] = (r.role === 'skirmish' && fighting ? 1 : 0) | (fighting && (r.stance === 'braced' || r.stance === 'pikewall') ? 2 : 0);
      // Light horse shoulders men aside far less than barded destriers.
      this.kw[k] = fighting && d.imp[i]! > 0.3 && d.mass[i]! > 2 ? d.imp[i]! * d.spd[i]! * TICK_S * (d.mass[i]! >= 4 ? 1 : 0.35) : 0;
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
          const i = this.items[k]!;
          if (this.d.state[i]! > State.Routing) continue;
          const dx = this.d.x[i]! - x;
          const dy = this.d.y[i]! - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && f(this.soldiers[i]!, d2) === true) return;
        }
      }
    }
  }

  // ------------------------------------------------------------------ the generals

  /** Where each side's fighting line stands: its front, depth and lateral span. */
  private updateFront(t: number): void {
    const ts = this.ts[t]!;
    const regs = this.teamRegs[t]!;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let depth = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let engaged = false;
    for (let pass = 1; pass <= 2 && n === 0; pass++) {
      for (const r of regs) {
        if (r.role !== 'line' || r.alive === 0 || r.routed) continue;
        if (pass === 1 && r.line !== 1 && !r.committed) continue;
        n += r.alive;
        sx += r.ax * r.alive;
        sy += r.ay * r.alive;
        depth = Math.max(depth, r.depth);
        minY = Math.min(minY, r.ay - r.width / 2);
        maxY = Math.max(maxY, r.ay + r.width / 2);
      }
    }
    for (const r of regs) if (r.role === 'line' && r.engaged && !r.routed) engaged = true;
    ts.hasLine = n > 0;
    if (n > 0) {
      ts.frontX = sx / n;
      ts.midY = sy / n;
      ts.lineDepth = depth;
      ts.minY = minY;
      ts.maxY = maxY;
    } else {
      // No line left: the army's centre stands in for it.
      let k = 0;
      let x = 0;
      let y = 0;
      for (const r of regs) {
        if (r.alive === 0 || r.routed) continue;
        k += r.alive;
        x += r.cx * r.alive;
        y += r.cy * r.alive;
      }
      if (k > 0) {
        ts.frontX = x / k;
        ts.midY = y / k;
      }
      ts.minY = ts.midY;
      ts.maxY = ts.midY;
      ts.lineDepth = 0;
    }
    ts.engaged = engaged;
    if (engaged && !ts.contacted) {
      ts.contacted = true;
      ts.contactAt = this.tick;
      this.events.push({ tick: this.tick, team: t, kind: 'contact', cls: U.HeavyInfantry });
    }
  }

  /** What a side still has in the field. */
  private forces(t: number): Forces {
    const f: Forces = { value: 0, foot: 0, cav: 0, knights: 0, missile: 0, routing: 0, all: 0, wingLow: 0, wingHigh: 0 };
    const mid = this.ts[t]!.midY;
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0) continue;
      const st = this.stats[t]![r.cls]!;
      const v = r.alive * st.value;
      f.all += v;
      if (r.routed) {
        f.routing += v;
        continue;
      }
      f.value += v;
      if (isCav(r)) f.cav += v;
      else if (r.role !== 'siege' && r.role !== 'command') f.foot += v;
      if (r.role === 'shock-cav') f.knights += v;
      if ((r.role === 'missile' || r.role === 'horse-archer' || r.role === 'skirmish') && r.ammoLeft > 0) f.missile += (r.alive * st.missileDamage) / st.reload;
      if (r.cy < mid) f.wingLow += v;
      else f.wingHigh += v;
    }
    return f;
  }

  /** Which wing a point is on, as the side's men see it. */
  private sideName(t: number, y: number): 'left' | 'centre' | 'right' {
    const dir = t === 0 ? 1 : -1;
    const off = (y - this.ts[t]!.midY) * dir;
    return off < -70 ? 'left' : off > 70 ? 'right' : 'centre';
  }

  private announce(t: number, r: Regiment | null, order: OrderKind, note: string): void {
    this.events.push({ tick: this.tick, team: t, kind: 'general-order', cls: r ? r.cls : U.Knights, reg: r ? r.id : -1, order, side: r ? this.sideName(t, r.cy) : undefined, note });
  }

  private give(r: Regiment, kind: OrderKind, target = -1, side = 0, friend = -1, x = NaN, y = NaN): void {
    const o = r.ord;
    if (o.kind !== kind || o.target !== target || o.side !== side) o.at = this.tick;
    o.kind = kind;
    o.target = target;
    o.side = side;
    o.friend = friend;
    o.x = x;
    o.y = y;
    r.order = kind;
  }

  /** The General reads the field, keeps (or changes) its plan, and gives every regiment its order. */
  private generalThink(t: number): void {
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    const dir = t === 0 ? 1 : -1;
    const ours = this.forces(t);
    const theirs = this.forces(1 - t);
    if (this.startValue[t] === 0) this.startValue[t] = ours.value;
    ts.loss = 1 - ours.value / Math.max(1, this.startValue[t]!);
    if (ours.value === 0) return;
    if (!ts.contacted && this.tick >= 10 && (g.planAt < 0 || this.tick - g.planAt >= 150)) this.choosePlan(t, ours, theirs);
    const plan = g.plan;
    const gap = (es.frontX - ts.frontX) * dir;
    const won = this.broken[1 - t] || theirs.routing > theirs.all * 0.55;
    const regs = this.teamRegs[t]!;

    // When to go forward.
    let waiting = this.tick < 30;
    if (plan === 'hold' && !ts.engaged && ts.hasLine) {
      if (g.holdUntil === 0) g.holdUntil = g.personality === 'cautious' ? 1100 : g.personality === 'aggressive' ? 650 : 900;
      if (this.tick < g.holdUntil && gap > 140) waiting = true;
    } else if (!g.dueled && ours.missile > 0 && ours.missile >= theirs.missile * 0.5 && gap < 125 && gap > 60 && g.personality !== 'aggressive') {
      // Halt in bow range and trade volleys for a while.
      g.dueled = true;
      g.haltUntil = this.tick + (g.personality === 'cautious' ? 170 : 120);
    }
    if (ts.engaged) g.haltUntil = 0;
    if (this.tick < g.haltUntil) waiting = true;
    this.stance[t] = plan === 'hold' ? 'hold' : 'press';

    // Reserves: the second line stands behind the first until the General commits it.
    const pool: Regiment[] = [];
    // Late in the day, or with the first line gone, everyone left goes in.
    let firstLine = 0;
    for (const r of regs) if (r.role === 'line' && r.alive > 0 && !r.routed && (r.line !== 2 || r.committed)) firstLine++;
    const allIn = firstLine === 0 || this.tick > 2400;
    for (const r of regs) {
      if (r.alive === 0 || r.routed) continue;
      const lineLike = r.role === 'line' || (r.role === 'missile' && r.ammoLeft === 0);
      if (!lineLike) continue;
      if (won && !r.engaged) {
        this.give(r, 'pursue');
        continue;
      }
      // Pull a wavering regiment out of the line once, if it can still get away and has men to save.
      if (!allIn && !r.withdrew && r.moraleState === 'wavering' && !r.engaged && !r.contact && ts.contacted && r.alive > r.start * 0.4) {
        r.withdrew = true;
        this.announce(t, r, 'withdraw', 'pulls a wavering regiment back to re-form');
        this.give(r, 'withdraw', -1, 0, -1, r.cx - dir * 90, r.cy);
        continue;
      }
      if (r.order === 'withdraw' && r.moraleState !== 'steady' && this.tick - r.ord.at < 200 && !allIn) continue;
      if (r.order === 'support' && r.ord.target >= 0) {
        const e = this.regiments[r.ord.target]!;
        if (e.alive > 0 && !e.routed) continue;
      }
      if (allIn && r.line === 2 && g.useReserve) r.committed = true;
      if (r.line === 2 && !r.committed && r.role === 'line') {
        this.reserveOrder(t, r);
        continue;
      }
      pool.push(r);
    }
    if (g.useReserve) this.commitReserves(t, ours);
    this.assignLines(t, pool);
    for (const r of pool) {
      if (r.targetReg < 0) {
        this.give(r, 'reserve');
        continue;
      }
      let hold = waiting && !r.engaged;
      if (plan === 'refuse' && !r.engaged && !r.committed && (r.homeY - FIELD_H / 2) * g.strong < -20 && this.tick < 1200) {
        // The refused wing stays back until the enemy comes to it.
        const near = this.nearestFoe(r, 0, 130);
        if (!near) hold = true;
      }
      if (hold) this.give(r, 'hold', r.targetReg, r.slot);
      else this.give(r, r.slot === 0 ? 'attack' : 'flank', r.targetReg, r.slot);
    }

    // Missiles, skirmishers, engines, the bodyguard.
    for (const r of regs) {
      if (r.alive === 0 || r.routed) continue;
      if (r.role === 'missile' && r.ammoLeft > 0) this.give(r, plan === 'hold' && waiting ? 'hold' : 'advance');
      else if (r.role === 'skirmish') this.give(r, won ? 'pursue' : 'skirmish');
      else if (r.role === 'horse-archer' && r.ammoLeft > 0) this.give(r, won ? 'pursue' : 'skirmish');
      else if (r.role === 'siege') this.give(r, 'hold');
      else if (r.role === 'command') this.give(r, 'support');
    }
    this.cavalryOrders(t, ours, theirs, won);
  }

  private choosePlan(t: number, ours: Forces, theirs: Forces): void {
    const g = this.generals[t]!;
    const keen = g.trait === 'hawk-eyed' ? 0 : 0.6 * (1.1 - g.skill);
    const noise = () => 1 + (g.rng.next() - 0.5) * keen;
    const S = (ours.value / Math.max(1, theirs.value)) * noise();
    const M = ((ours.missile + 0.5) / (theirs.missile + 0.5)) * noise();
    const C = ((ours.cav + 1) / (theirs.cav + 1)) * noise();
    const p = g.personality;
    const score: Record<Plan, number> = {
      hold: (M > 1.25 ? 1 : 0.15) + (S < 0.9 ? 0.3 : 0) + (p === 'cautious' ? 0.3 : p === 'aggressive' ? -0.3 : 0),
      advance: 0.55 + (S > 1.1 ? 0.25 : 0) + (p === 'aggressive' ? 0.25 : 0) + (M < 0.8 ? 0.2 : 0),
      envelop: ours.cav > ours.value * 0.12 ? (C > 1.3 ? 0.9 : 0.35) + (p === 'cunning' ? 0.15 : 0) : 0,
      hammer: ours.knights > 0 && ours.foot > theirs.foot * 0.7 ? 0.7 + (p === 'aggressive' ? 0.1 : 0) : 0,
      refuse: 0.3 + (p === 'cunning' ? 0.45 : 0) + (S < 1 ? 0.15 : 0),
    };
    if (g.planAt >= 0) score[g.plan] += 0.3;
    let best: Plan = 'advance';
    for (const k of PLANS) if (score[k] > score[best]) best = k;
    // A general can misread the day and pick a poor plan.
    if (g.trait !== 'old-fox' && g.rng.next() < (1 - g.skill) * 0.5) {
      const ok = PLANS.filter((k) => score[k] > 0);
      best = ok[g.rng.int(ok.length)]!;
    }
    if (g.fixedPlan) best = g.fixedPlan;
    // Overload the wing where the enemy is weaker.
    const low = theirs.wingLow * noise();
    const high = theirs.wingHigh * noise();
    g.strong = low < high ? -1 : 1;
    const changed = best !== g.plan || g.planAt < 0;
    g.plan = best;
    g.planAt = this.tick;
    if (changed) {
      const what: Record<Plan, string> = {
        hold: 'holds his ground and lets the archers work',
        advance: 'orders the whole line forward',
        refuse: `refuses his ${g.strong * (t === 0 ? 1 : -1) < 0 ? 'right' : 'left'} and masses on the other wing`,
        envelop: 'sends the horse round both wings',
        hammer: 'will pin them with the foot and hammer them with the knights',
      };
      this.events.push({ tick: this.tick, team: t, kind: 'general-order', cls: U.Knights, reg: -1, plan: best, note: what[best] });
    }
  }

  /** A second-line regiment waits behind the first, on the strong wing when the plan says so. */
  private reserveOrder(t: number, r: Regiment): void {
    const g = this.generals[t]!;
    let best: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[t]!) {
      if (o === r || o.role !== 'line' || o.alive === 0 || o.routed || (o.line === 2 && !o.committed)) continue;
      let q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
      if (g.plan === 'refuse') q -= (o.homeY - FIELD_H / 2) * g.strong * 400;
      if (q < bd) {
        bd = q;
        best = o;
      }
    }
    this.give(r, 'reserve', -1, 0, best ? best.id : -1);
  }

  /**
   * Throws the reserve in: round the open flank of an enemy block that is locked with our line
   * and wavering (to break it), or into the gap where one of ours has just broken (to plug it).
   * It does not feed fresh men into a frontal grind: that only spends them.
   */
  private commitReserves(t: number, ours: Forces): void {
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    void ours;
    if (!ts.contacted) return;
    const tmp = this.tmp;
    let foe: Regiment | null = null;
    let friend: Regiment | null = null;
    let side = 0;
    let why = '';
    // Plug: a block of ours has just broken and the enemy that broke it is coming on.
    for (const o of this.teamRegs[t]!) {
      if (o.role !== 'line' || o.alive === 0 || !o.routed || this.tick - o.routAt > 80) continue;
      const e = this.nearestFoe(o, 0, 80);
      if (!e || e.engaged || isCav(e)) continue;
      foe = e;
      friend = o;
      side = 0;
      why = `plugs the gap on the ${this.sideName(t, o.cy)} with the reserve`;
      break;
    }
    // Exploit: an enemy block locked with ours, shaken, its flank open.
    const wait = g.personality === 'aggressive' || g.trait === 'reckless-valour' ? 20 : g.personality === 'cautious' ? 140 : 60;
    if (!foe && g.personality !== 'cautious' && this.tick - ts.contactAt > wait) {
      let worst = Infinity;
      for (const e of this.teamRegs[1 - t]!) {
        if (e.alive === 0 || e.routed || !e.engaged || isCav(e) || e.role === 'command') continue;
        const shaky = e.morale + (g.personality === 'aggressive' ? -10 : 0) + (g.plan === 'refuse' && (e.cy - FIELD_H / 2) * g.strong > 0 ? -15 : 0);
        if (shaky > 55 || shaky >= worst) continue;
        for (const k of [1, 2]) {
          slotPos(e, k, 30, tmp);
          if (tmp[0]! < 10 || tmp[0]! > FIELD_W - 10 || tmp[1]! < 10 || tmp[1]! > FIELD_H - 10 || this.blocked(tmp[0]!, tmp[1]!, e, 30)) continue;
          let taken = false;
          for (const r of this.teamRegs[t]!) if (r.alive > 0 && !r.routed && r.targetReg === e.id && r.slot === k && r.role === 'line') taken = true;
          if (taken) continue;
          worst = shaky;
          foe = e;
          side = k;
        }
      }
      if (foe) why = `sends the reserve round the ${this.sideName(t, foe.cy)} flank`;
    }
    if (!foe) return;
    let reserve: Regiment | null = null;
    let bd = Infinity;
    for (const r of this.teamRegs[t]!) {
      if (r.role !== 'line' || r.line !== 2 || r.committed || r.alive === 0 || r.routed) continue;
      const q = (r.cx - foe.cx) * (r.cx - foe.cx) + (r.cy - foe.cy) * (r.cy - foe.cy);
      if (q < bd) {
        bd = q;
        reserve = r;
      }
    }
    if (!reserve) return;
    reserve.committed = true;
    g.committed++;
    reserve.targetReg = foe.id;
    reserve.slot = side;
    this.give(reserve, 'support', foe.id, side, friend ? friend.id : -1);
    this.announce(t, reserve, 'support', why);
  }

  private cavalryOrders(t: number, ours: Forces, theirs: Forces, won: boolean): void {
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    void ours;
    void theirs;
    const plan = g.plan;
    const early = g.personality === 'aggressive' || g.trait === 'reckless-valour';
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0 || r.routed) continue;
      if (!(r.role === 'flank' || r.role === 'shock-cav' || (r.role === 'horse-archer' && r.ammoLeft === 0))) continue;
      const before = r.order;
      if (!g.useCavalry) {
        this.give(r, 'hold', -1, 0, -1, r.homeX, r.homeY);
        continue;
      }
      if (won) {
        this.give(r, 'pursue');
        if (before !== 'pursue') this.announce(t, r, 'pursue', 'lets the horse loose on the fugitives');
        continue;
      }
      // Our wing: enemy horse on it comes first.
      const wing = r.homeY < FIELD_H / 2 ? -1 : 1;
      const refused = plan === 'refuse' && wing !== g.strong;
      let enemyCav: Regiment | null = null;
      let bd = Infinity;
      for (const o of this.teamRegs[1 - t]!) {
        if (o.alive === 0 || o.routed || !isCav(o)) continue;
        if ((o.cy - FIELD_H / 2) * wing < -80) continue;
        const q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
        if (q < bd) {
          bd = q;
          enemyCav = o;
        }
      }
      const shooters = this.nearestFoe(r, 1, Infinity);
      const locked = this.nearestFoe(r, 3, Infinity);
      // An enemy with no line has no clash of lines to wait for (the knights would wait all day).
      const linesMet = ts.engaged || es.engaged || !es.hasLine;
      if (r.role === 'shock-cav') {
        const go = linesMet || (plan === 'envelop' && this.tick > 200) || (early && this.tick > 320) || g.rashKnights;
        if (enemyCav && sqrt(bd) < 220) this.give(r, 'attack', enemyCav.id);
        else if (!go || (refused && !linesMet)) this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
        else if (locked) this.give(r, 'flank', locked.id, 3);
        else if (shooters) this.give(r, 'flank', shooters.id, 0);
        else {
          const any = this.nearestFoe(r, 0, Infinity);
          this.give(r, any ? 'charge' : 'reserve', any ? any.id : -1);
        }
      } else {
        if (refused && !(enemyCav && sqrt(bd) < 200)) this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
        else if (enemyCav) this.give(r, 'attack', enemyCav.id);
        else if (shooters) this.give(r, 'flank', shooters.id, 0);
        else if (locked) this.give(r, 'flank', locked.id, 3);
        else {
          const any = this.nearestFoe(r, 0, Infinity);
          this.give(r, any ? 'charge' : 'reserve', any ? any.id : -1);
        }
      }
      if (r.order === 'flank' && before !== 'flank') {
        const tg = this.regiments[r.ord.target]!;
        this.announce(t, r, 'flank', r.ord.side === 3 ? `sends the ${r.role === 'shock-cav' ? 'knights' : 'horse'} into the enemy's rear on the ${this.sideName(t, tg.cy)}` : `sends the horse after the enemy's ${tg.role === 'siege' ? 'engines' : 'archers'}`);
      }
    }
  }

  /** Every regiment of the line in the pool gets a place against the enemy line: a front, a flank or a rear. */
  private assignLines(t: number, ours: Regiment[]): void {
    if (ours.length === 0) return;
    const foes: Regiment[] = [];
    for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed && o.role === 'line') foes.push(o);
    if (foes.length === 0) for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed && !isCav(o)) foes.push(o);
    // Only horse left: go at them all the same (standing in reserve would never end the day).
    if (foes.length === 0) for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed) foes.push(o);
    if (foes.length === 0) {
      for (const r of ours) r.targetReg = -1;
      return;
    }
    const E = foes.length;
    const taken = new Uint8Array(E * 4);
    const done = new Uint8Array(ours.length);
    // Locked in melee: keep the enemy in hand.
    for (let i = 0; i < ours.length; i++) {
      const r = ours[i]!;
      if (!r.engaged || r.targetReg < 0) continue;
      const e = foes.indexOf(this.regiments[r.targetReg]!);
      if (e < 0) continue;
      taken[e * 4 + r.slot] = 1;
      done[i] = 1;
    }
    // Places already taken by regiments supporting a friend.
    for (const o of this.teamRegs[t]!) {
      if (o.order !== 'support' || o.ord.target < 0) continue;
      const e = foes.indexOf(this.regiments[o.ord.target]!);
      if (e >= 0) taken[e * 4 + o.ord.side] = 1;
    }
    const cost = new Float64Array(ours.length * E * 4);
    const tmp = this.tmp;
    for (let i = 0; i < ours.length; i++) {
      const r = ours[i]!;
      for (let e = 0; e < E; e++) {
        const o = foes[e]!;
        for (let k = 0; k < 4; k++) {
          let c = Infinity;
          if (!(k === 3 && foes.length > 1 && ours.length <= E * 2)) {
            slotPos(o, k, r.depth, tmp);
            const px = tmp[0]!;
            const py = tmp[1]!;
            // A front can always be reached (the goal is clamped to the field); a flank or rear
            // against the edge of the field cannot.
            if (k === 0 || (px > 10 && px < FIELD_W - 10 && py > 10 && py < FIELD_H - 10 && !this.blocked(px, py, o, r.depth))) {
              const dx = px - r.ax;
              const dy = py - r.ay;
              c = sqrt(dx * dx + dy * dy) + (k === 0 ? 0 : k === 3 ? 170 : r.committed ? 20 : 90);
              if (r.targetReg === o.id && r.slot === k) c -= 60;
            }
          }
          cost[(i * E + e) * 4 + k] = c;
        }
      }
    }
    for (;;) {
      let best = Infinity;
      let bi = -1;
      let bj = -1;
      for (let i = 0; i < ours.length; i++) {
        if (done[i]) continue;
        const row = i * E * 4;
        for (let j = 0; j < E * 4; j++) {
          if (taken[j]) continue;
          const c = cost[row + j]!;
          if (c < best) {
            best = c;
            bi = i;
            bj = j;
          }
        }
      }
      if (bi < 0) break;
      const r = ours[bi]!;
      done[bi] = 1;
      taken[bj] = 1;
      r.targetReg = foes[(bj / 4) | 0]!.id;
      r.slot = bj % 4;
    }
    for (let i = 0; i < ours.length; i++) if (!done[i]) ours[i]!.targetReg = -1;
  }

  /** Whether a flank or rear place is filled by another enemy block. */
  private blocked(px: number, py: number, owner: Regiment, depth: number): boolean {
    for (const o of this.teamRegs[owner.team]!) {
      if (o === owner || o.alive === 0 || o.routed) continue;
      const dx = px - o.cx;
      const dy = py - o.cy;
      const rr = o.radius * 0.85 + depth * 0.5 + 4;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ the captains

  /** Recounts a regiment: its living men, centre, spread, ammunition and whether it is in contact. */
  private survey(r: Regiment): void {
    const d = this.d;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let ammo = 0;
    let fighting = 0;
    let msx = 0;
    let msy = 0;
    for (const id of r.members) {
      const st = d.state[id]!;
      if (st > State.Routing) continue;
      n++;
      sx += d.x[id]!;
      sy += d.y[id]!;
      ammo += d.ammo[id]!;
      if (st === State.Fighting) {
        fighting++;
        msx += d.sx[id]!;
        msy += d.sy[id]!;
      }
    }
    r.alive = n;
    r.ammoLeft = ammo;
    if (n === 0) {
      r.engaged = false;
      r.contact = false;
      return;
    }
    r.cx = sx / n;
    r.cy = sy / n;
    let far = 0;
    let engaged = 0;
    for (const id of r.members) {
      if (d.state[id]! > State.Routing) continue;
      const dx = d.x[id]! - r.cx;
      const dy = d.y[id]! - r.cy;
      const q = dx * dx + dy * dy;
      if (q > far) far = q;
      const t = d.target[id]!;
      if (t >= 0) {
        const ex = d.x[t]! - d.x[id]!;
        const ey = d.y[t]! - d.y[id]!;
        const reach = d.rad[id]! + d.rad[t]! + 3;
        if (ex * ex + ey * ey <= reach * reach) engaged++;
      }
    }
    r.radius = sqrt(far) + 3;
    r.engaged = engaged >= Math.max(2, n * 0.06) || (n < 8 && engaged > 0);
    if (r.engaged) r.everEngaged = true;
    // Keep the anchor with the men: a block held by the enemy does not walk on without them.
    if (fighting > 0 && !r.routed) {
      msx /= fighting;
      msy /= fighting;
      const ix = r.cx - (r.fx * msy - r.fy * msx);
      const iy = r.cy - (r.fy * msy + r.fx * msx);
      const dx = r.ax - ix;
      const dy = r.ay - iy;
      const q = sqrt(dx * dx + dy * dy);
      // Locked in melee the anchor stays with the men: run ahead of them, it would have the rear
      // ranks shove the front through the enemy.
      const leash = r.engaged ? 1.5 : Math.max(8, r.speed * PACE[r.mode] * 0.6);
      if (q > leash) {
        r.ax = ix + (dx * leash) / q;
        r.ay = iy + (dy * leash) / q;
      }
    }
    // In contact: an enemy block close enough that its men should look for foes. Count the
    // enemy close by, for being outnumbered.
    let contact = false;
    let near = 0;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + 24;
      if (dx * dx + dy * dy < rr * rr) {
        contact = true;
        if (!o.routed && o.engaged) near += o.alive * this.stats[o.team]![o.cls]!.value;
      }
    }
    r.contact = contact;
    r.enemyNear = near / this.stats[r.team]![r.cls]!.value;
  }

  private setMode(r: Regiment, m: Mode): void {
    if (r.mode === m) return;
    if (m === 'shoot') {
      // A fresh volley: everyone looses within half a second.
      const d = this.d;
      for (const id of r.members) if (d.cd[id]! > 5) d.cd[id] = this.rng.int(6);
    }
    r.mode = m;
    r.modeAt = this.tick;
  }

  /** Points the regiment's wheel at (x, y). */
  private faceToward(r: Regiment, x: number, y: number): void {
    const dx = x - r.ax;
    const dy = y - r.ay;
    const q = sqrt(dx * dx + dy * dy);
    if (q > 1) {
      r.dfx = dx / q;
      r.dfy = dy / q;
    }
  }

  private goal(r: Regiment, x: number, y: number): void {
    r.tx = clampX(x);
    r.ty = clampY(y);
  }

  /** The regiment's captain: carries out its order with what it sees, picks its stance. */
  private think(r: Regiment): void {
    this.survey(r);
    if (r.alive === 0) return;
    if (r.reflow && !r.routed) this.closeRanks(r);
    this.fatigue(r);
    if (r.routed) {
      this.thinkRouted(r);
      return;
    }
    this.morale(r);
    if (r.routed) return;
    switch (r.role) {
      case 'line':
        this.thinkLine(r);
        break;
      case 'missile':
        if (r.ammoLeft === 0) this.thinkLine(r);
        else this.thinkMissile(r);
        break;
      case 'skirmish':
        this.thinkSkirmish(r);
        break;
      case 'flank':
        this.thinkCav(r, false);
        break;
      case 'shock-cav':
        this.thinkCav(r, true);
        break;
      case 'horse-archer':
        if (r.ammoLeft === 0) this.thinkCav(r, false);
        else this.thinkHorseArcher(r);
        break;
      case 'siege':
        this.thinkSiege(r);
        break;
      case 'command':
        this.thinkCommand(r);
        break;
    }
    this.chooseStance(r);
  }

  private fatigue(r: Regiment): void {
    const m = r.mode;
    const run = m === 'charge' || m === 'withdraw' || m === 'pursue' || m === 'flank' || m === 'kite' || m === 'skirmish' || m === 'rout';
    const k = run ? FATIGUE.run * (isCav(r) ? 0.6 : 1) : r.engaged ? FATIGUE.fight : m === 'advance' || m === 'reserve' ? 0.001 : FATIGUE.rest;
    r.fatigue = Math.max(0, Math.min(1, r.fatigue + k));
  }

  /** Morale settles toward what the regiment's plight is worth (see MORALE); shocks knock it down at once. */
  private morale(r: Regiment): void {
    const M = MORALE;
    r.recent *= 0.9;
    r.recentKills *= 0.9;
    r.arrows *= 0.8;
    r.flankShock = Math.min(M.flankCap, r.flankShock * 0.9);
    const team = r.team;
    let target = r.baseMorale - M.casualtiesTotal * (1 - r.alive / r.start) - M.casualtyRate * r.recent - r.flankShock;
    target += Math.min(M.winning, Math.max(-6, (r.recentKills - r.recent) * 120));
    target -= Math.min(M.outnumberedCap, Math.max(0, r.enemyNear / Math.max(1, r.alive) - 1.2) * M.outnumbered);
    target -= Math.min(20, r.arrows * M.missileFear * (r.green ? M.greenFear : 1));
    target -= r.fatigue * M.fatigue;
    const cmd = this.commander[team]!;
    if (cmd >= 0 && this.d.state[cmd] === State.Fighting) {
      const dx = this.d.x[cmd]! - r.cx;
      const dy = this.d.y[cmd]! - r.cy;
      if (dx * dx + dy * dy < M.auraRange * M.auraRange) target += M.aura * (0.5 + this.generals[team]!.skill * 0.6);
    }
    if (this.commanderFell[team]) target -= M.generalDead;
    // The whole army's fortunes: a losing army loses heart, a winning one takes it.
    target -= Math.max(0, this.ts[team]!.loss - M.armyLossFrom) * M.armyLoss;
    target += Math.max(0, this.ts[1 - team]!.loss - M.armyLossFrom) * M.armyLoss * 0.5;
    if (this.broken[1 - team]) target += M.enemyBroken;
    if (this.generals[team]!.trait === 'iron-discipline') target += 8;
    target += this.generals[team]!.mood;
    r.morale += (target - r.morale) * M.recover;
    if (r.morale > 100) r.morale = 100;
    if (r.morale < M.breakAt) {
      this.rout(r);
      return;
    }
    if (r.moraleState === 'steady' && r.morale < M.waverAt) {
      r.moraleState = 'wavering';
      if (this.tick - r.waverTold > 200) {
        r.waverTold = this.tick;
        this.events.push({ tick: this.tick, team, kind: 'waver', cls: r.cls, reg: r.id });
      }
    } else if (r.moraleState === 'wavering' && r.morale > M.waverAt + 8) r.moraleState = 'steady';
    else if (r.moraleState === 'rallying' && this.tick - r.rallyAt >= 40) r.moraleState = r.morale > M.waverAt + 8 ? 'steady' : 'wavering';
  }

  private thinkRouted(r: Regiment): void {
    r.mode = 'rout';
    if (this.broken[r.team] || r.moraleState === 'shattered') return;
    // Pursued? Anyone of the enemy close behind keeps them running.
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + 90;
      if (dx * dx + dy * dy < rr * rr) {
        r.quietSince = this.tick;
        return;
      }
    }
    if (this.tick - r.routAt < 60 || this.tick - r.quietSince < 40) return;
    if (r.alive < Math.max(6, r.start * MORALE.shatterBelow)) return;
    // Rally: likelier near the general, for veterans, and with the city's morale bonus.
    const army = this.setup.armies[r.team]!;
    let p = MORALE.rallyChance + army.moraleBonus * MORALE.rallyPerBonus + (r.veteran ? 0.08 : 0);
    const cmd = this.commander[r.team]!;
    if (cmd >= 0 && this.d.state[cmd] === State.Fighting) {
      const dx = this.d.x[cmd]! - r.cx;
      const dy = this.d.y[cmd]! - r.cy;
      if (dx * dx + dy * dy < 320 * 320) p += MORALE.rallyNearGeneral;
    } else p *= 0.4;
    if (!this.rng.chance(p)) return;
    // They stop, turn and form up where they stand.
    r.routed = false;
    r.rallies++;
    r.rallyAt = this.tick;
    r.moraleState = 'rallying';
    r.morale = MORALE.rallyMorale + army.moraleBonus * 0.5;
    r.recent = 0;
    r.flankShock = 0;
    const d = this.d;
    for (const id of r.members) {
      if (d.state[id] === State.Routing) d.state[id] = State.Fighting;
      d.target[id] = -1;
    }
    const e = this.ts[1 - r.team]!;
    const fx = e.frontX - r.cx >= 0 ? 1 : -1;
    r.fx = r.dfx = fx;
    r.fy = r.dfy = 0;
    r.stance = defaultStance(r);
    r.spacing = spacingFor(r, r.stance);
    this.assignSlots(r, false);
    r.ax = r.tx = r.cx + fx * r.depth * 0.5;
    r.ay = r.ty = r.cy;
    r.targetReg = -1;
    this.give(r, 'hold');
    this.setMode(r, 'rally');
    this.events.push({ tick: this.tick, team: r.team, kind: 'rally', cls: r.cls, reg: r.id });
  }

  /** A wavering captain may balk at an order to go forward. */
  private balks(r: Regiment): boolean {
    if ((r.moraleState !== 'wavering' && r.moraleState !== 'rallying') || this.generals[r.team]!.trait === 'iron-discipline') return false;
    const k = r.ord.kind;
    if (k !== 'attack' && k !== 'flank' && k !== 'charge' && k !== 'support' && k !== 'advance') return false;
    if (this.tick < r.refuseUntil) return true;
    if (this.tick - r.refuseUntil > 30 && this.rng.chance(MORALE.refuse)) {
      r.refuseUntil = this.tick + 40;
      return true;
    }
    return false;
  }

  private thinkLine(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    const o = r.ord;
    if (r.engaged) {
      if (r.mode !== 'melee') r.meleeTicks = 0;
      r.meleeTicks += 5;
      this.setMode(r, 'melee');
      // Press: lean into the fight, never turn while locked.
      r.dfx = r.fx;
      r.dfy = r.fy;
      this.goal(r, r.ax + r.fx * 3, r.ay + r.fy * 3);
      return;
    }
    if (r.mode === 'rally' && this.tick - r.modeAt < 30) return;
    // Spears set against horse.
    if (st.antiCav > 1.5) {
      const cav = this.nearestFoe(r, 2, 150);
      if (cav && (cav.mode === 'charge' || cav.mode === 'flank' || cav.mode === 'melee')) {
        this.setMode(r, 'brace');
        this.goal(r, r.ax, r.ay);
        this.faceToward(r, cav.cx, cav.cy);
        return;
      }
    }
    // A threat on the flank or rear: wheel to meet it.
    const threat = this.nearestFoe(r, 0, 45);
    if (threat && threat.id !== o.target && o.kind !== 'withdraw') {
      const dx = threat.cx - r.cx;
      const dy = threat.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      if ((dx * r.fx + dy * r.fy) / q < 0.2 && (threat.mode === 'charge' || threat.mode === 'melee' || threat.mode === 'flank' || threat.mode === 'advance')) {
        this.setMode(r, 'hold');
        this.goal(r, r.ax, r.ay);
        this.faceToward(r, threat.cx, threat.cy);
        return;
      }
    }
    if (this.balks(r)) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    switch (o.kind) {
      case 'withdraw': {
        const x = Number.isNaN(o.x) ? r.ax : o.x;
        const y = Number.isNaN(o.y) ? r.ay : o.y;
        const dx = x - r.ax;
        const dy = y - r.ay;
        if (dx * dx + dy * dy < 15 * 15) {
          this.setMode(r, 'hold');
          r.dfx = r.team === 0 ? 1 : -1;
          r.dfy = 0;
        } else this.setMode(r, 'reserve');
        this.goal(r, x, y);
        return;
      }
      case 'pursue': {
        const prey = this.nearestFoe(r, 4, 300) ?? this.nearestFoe(r, 0, 300);
        if (prey) {
          this.setMode(r, 'pursue');
          this.goal(r, prey.cx, prey.cy);
          this.faceToward(r, prey.cx, prey.cy);
        } else this.setMode(r, 'hold');
        return;
      }
      case 'hold':
      case 'attack':
      case 'flank':
      case 'support':
      case 'charge': {
        const tgt = o.target >= 0 ? this.regiments[o.target]! : null;
        if (!tgt || tgt.alive === 0 || tgt.routed) break;
        const tmp = this.tmp;
        slotPos(tgt, o.side, r.depth, tmp);
        const px = tmp[0]!;
        const py = tmp[1]!;
        const dx = px - r.ax;
        const dy = py - r.ay;
        const q = sqrt(dx * dx + dy * dy);
        r.dfx = tmp[2]!;
        r.dfy = tmp[3]!;
        if (o.kind === 'hold' && q > 50) {
          this.setMode(r, 'hold');
          this.goal(r, r.ax, r.ay);
          if (o.side === 0) this.faceToward(r, tgt.cx, tgt.cy);
          // Counter-charge whatever comes close.
          const close = this.nearestFoe(r, 0, 35);
          if (close && !isCav(close)) {
            this.setMode(r, 'charge');
            this.goal(r, close.cx, close.cy);
            this.faceToward(r, close.cx, close.cy);
          }
        } else if (q < 42) {
          this.setMode(r, 'charge');
          this.goal(r, px + tmp[2]! * 12, py + tmp[3]! * 12);
        } else {
          this.setMode(r, 'advance');
          this.goal(r, px, py);
        }
        return;
      }
      default:
        break;
    }
    // In reserve: follow behind a block of the first line.
    const f = o.friend >= 0 ? this.regiments[o.friend]! : null;
    let best: Regiment | null = f && f.alive > 0 && !f.routed ? f : null;
    if (!best) {
      let bd = Infinity;
      for (const x of this.teamRegs[r.team]!) {
        if (x === r || x.role !== 'line' || x.alive === 0 || x.routed || (x.line === 2 && !x.committed)) continue;
        const q = (x.cx - r.cx) * (x.cx - r.cx) + (x.cy - r.cy) * (x.cy - r.cy);
        if (q < bd) {
          bd = q;
          best = x;
        }
      }
    }
    if (best) {
      this.setMode(r, 'reserve');
      this.goal(r, best.ax - best.fx * (best.depth + 30), best.ay - best.fy * (best.depth + 30));
      r.dfx = best.fx;
      r.dfy = best.fy;
      return;
    }
    // Nobody to stand behind: a reserve holds its ground (and fights what comes to it); anyone
    // else goes for the nearest enemy.
    const any = this.nearestFoe(r, 0, o.kind === 'reserve' ? 60 : Infinity);
    if (any) {
      this.setMode(r, 'advance');
      this.goal(r, any.cx, any.cy);
      this.faceToward(r, any.cx, any.cy);
    } else {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
    }
  }

  private thinkMissile(r: Regiment): void {
    const ts = this.ts[r.team]!;
    const st = this.stats[r.team]![r.cls]!;
    const dir = r.team === 0 ? 1 : -1;
    if (r.engaged || this.nearestFoe(r, 1, 6) || this.nearestFoe(r, 0, 4)) {
      this.setMode(r, 'melee');
      this.goal(r, r.ax, r.ay);
      return;
    }
    // Targets of opportunity, the General's pick first.
    const best = this.shootable(r, st.range * 0.95);
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      this.closeToShoot(r, best);
      this.faceToward(r, best.cx, best.cy);
      return;
    }
    r.targetReg = -1;
    if (r.ord.kind === 'hold' || this.tick < 30) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    // Follow the line, a little behind it.
    if (ts.hasLine) {
      const x = ts.frontX - dir * (ts.lineDepth + 14);
      const behind = (x - r.ax) * dir;
      this.setMode(r, Math.abs(behind) > 6 ? 'advance' : 'hold');
      this.goal(r, Math.abs(behind) > 6 ? x : r.ax, r.homeY + (ts.midY - FIELD_H / 2));
      r.dfx = dir;
      r.dfy = 0;
      return;
    }
    const near = this.nearestFoe(r, 0, Infinity);
    if (near) {
      const dx = near.cx - r.cx;
      const dy = near.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      this.setMode(r, 'advance');
      this.goal(r, near.cx - (dx / q) * st.range * 0.8, near.cy - (dy / q) * st.range * 0.8);
      this.faceToward(r, near.cx, near.cy);
    }
  }

  /**
   * Stands to shoot at `tgt`. With no line of its own to bring it on, if most of the men found
   * it out of their reach since the last think, it steps toward it. (A regiment's centre can be
   * in range while its men are not: two armies of archers would otherwise stand just out of
   * reach of each other all day.)
   */
  private closeToShoot(r: Regiment, tgt: Regiment, always = false): void {
    if (r.short > r.loosed && (always || !this.ts[r.team]!.hasLine)) {
      const dx = tgt.cx - r.cx;
      const dy = tgt.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      this.goal(r, r.ax + (dx / q) * 10, r.ay + (dy / q) * 10);
    } else this.goal(r, r.ax, r.ay);
    r.short = 0;
    r.loosed = 0;
  }

  /**
   * Distance from the middle of `r`'s front to the nearest living man of `o`; that man's
   * position goes to tmp[0], tmp[1]. (Wide blocks are poorly described by their bounding
   * circles: two lines facing each other can be far apart with their circles overlapping.)
   */
  private gapTo(r: Regiment, o: Regiment): number {
    const d = this.d;
    let bd = Infinity;
    for (const id of o.members) {
      if (d.state[id]! > State.Routing) continue;
      const dx = d.x[id]! - r.ax;
      const dy = d.y[id]! - r.ay;
      const q = dx * dx + dy * dy;
      if (q < bd) {
        bd = q;
        this.tmp[0] = d.x[id]!;
        this.tmp[1] = d.y[id]!;
      }
    }
    return sqrt(bd);
  }

  /** The nearest enemy (not running; horse only with `cav`) whose men are within `range` of `r`'s front. */
  private nearGap(r: Regiment, range: number, cav: boolean): Regiment | null {
    let best: Regiment | null = null;
    let bd = range;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || (cav && !isCav(o))) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + range;
      if (dx * dx + dy * dy > rr * rr) continue;
      const g = this.gapTo(r, o);
      if (g < bd) {
        bd = g;
        best = o;
      }
    }
    return best;
  }

  /** Walks `r` to stand with its front `dist` from the nearest man of `o`. */
  private standOff(r: Regiment, o: Regiment, dist: number): void {
    const g = this.gapTo(r, o);
    const px = this.tmp[0]!;
    const py = this.tmp[1]!;
    const ux = g > 0.01 ? (px - r.ax) / g : r.fx;
    const uy = g > 0.01 ? (py - r.ay) / g : r.fy;
    this.goal(r, px - ux * dist, py - uy * dist);
    this.faceToward(r, o.cx, o.cy);
  }

  /**
   * The best block to shoot at within `range` of the regiment: not locked with our own men.
   * `reach`: measured from the regiment's front to the target's nearest man (skirmishers and
   * horse archers, who shoot at close range and must not stand inside their own retreat
   * distance); otherwise from centre to centre, less half the target's spread.
   */
  private shootable(r: Regiment, range: number, reach = false): Regiment | null {
    let best: Regiment | null = null;
    let bs = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.engaged) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const c = sqrt(dx * dx + dy * dy);
      if (reach && c - o.radius - r.radius > range) continue;
      const q = reach ? this.gapTo(r, o) : c - o.radius * 0.5;
      if (q > range) continue;
      // Big blocks and horse first; keep the same target when it's still good.
      let s = q - (isCav(o) ? 20 : 0) - (o.id === r.targetReg ? 30 : 0) - (o.id === r.ord.target ? 40 : 0) - Math.min(40, o.alive * 0.3);
      if (o.role === 'skirmish') s += 25;
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    return best;
  }

  private thinkSkirmish(r: Regiment): void {
    const ts = this.ts[r.team]!;
    const st = this.stats[r.team]![r.cls]!;
    const dir = r.team === 0 ? 1 : -1;
    const e = this.ts[1 - r.team]!;
    const gap = (e.frontX - ts.frontX) * dir;
    const threat = this.nearGap(r, 25, false) ?? this.nearGap(r, 70, true);
    // With no line of our own there is nothing to fall back behind (and `frontX` is then the
    // army's centre, which runs away from them as they walk toward it): they fight it out.
    const noLine = !ts.hasLine;
    let retired = !noLine && (r.mode === 'skirmish' || r.mode === 'reserve' || r.retired);
    if (retired && r.mode === 'reserve' && r.ammoLeft > 0 && !threat && gap > 160 && e.hasLine && this.tick - r.modeAt > 50) {
      // Safe behind the line with javelins left and the lines still apart: go out again.
      retired = false;
      r.retired = false;
      this.setMode(r, 'advance');
    }
    const home = ts.frontX - dir * (ts.lineDepth + 70);
    if (r.ord.kind === 'pursue') {
      const prey = this.nearestFoe(r, 4, 300);
      if (prey && !this.nearestFoe(r, 0, 120)) {
        this.setMode(r, 'pursue');
        this.goal(r, prey.cx, prey.cy);
        return;
      }
    }
    if (noLine && r.ammoLeft === 0) {
      this.thinkLine(r);
      return;
    }
    if (!retired && !noLine && (r.ammoLeft === 0 || threat || (gap < 95 && ts.hasLine && e.hasLine))) {
      // Fall back through our own line.
      this.setMode(r, 'skirmish');
      r.retired = true;
    }
    if (r.mode === 'skirmish' && !noLine) {
      this.goal(r, home, r.ay);
      if ((r.ax - home) * dir < 8) this.setMode(r, 'reserve');
      return;
    }
    if (retired) {
      this.goal(r, home, r.ay);
      r.dfx = dir;
      r.dfy = 0;
      const t = r.ammoLeft > 0 ? this.shootable(r, st.range * 0.9) : null;
      if (t) {
        // Loose at whatever comes in range from behind the line.
        r.targetReg = t.id;
        this.setMode(r, 'shoot');
      } else this.setMode(r, 'reserve');
      return;
    }
    if (this.tick < 30) return;
    const best = this.shootable(r, st.range * 0.9, true);
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      this.closeToShoot(r, best, true);
      this.faceToward(r, best.cx, best.cy);
      return;
    }
    const near = this.nearestFoe(r, 0, Infinity);
    if (!near) return;
    this.setMode(r, 'advance');
    r.targetReg = near.id;
    // Within javelin range of its nearest men, outside the distance at which they fall back.
    this.standOff(r, near, st.range * 0.6);
  }

  private thinkCav(r: Regiment, shock: boolean): void {
    const team = r.team;
    const e = this.ts[1 - team]!;
    const dir = team === 0 ? 1 : -1;
    const o = r.ord;
    if (this.tick < (shock ? 60 : 40)) {
      this.setMode(r, 'hold');
      return;
    }
    let prey0 = r.targetReg >= 0 ? this.regiments[r.targetReg]! : null;
    if (r.engaged && r.mode !== 'withdraw' && (!prey0 || prey0.alive === 0)) {
      // The block it rode into is gone: take on whoever it is fighting now.
      prey0 = this.nearestFoe(r, 0, 30);
      r.targetReg = prey0 ? prey0.id : -1;
    }
    if (r.engaged && r.mode !== 'withdraw') {
      if (r.mode !== 'melee') r.meleeTicks = 0;
      r.meleeTicks += 5;
      this.setMode(r, 'melee');
      const footPrey = prey0 && !prey0.routed && (prey0.role === 'line' || prey0.role === 'command');
      const braced = prey0 && (prey0.stance === 'pikewall' || prey0.stance === 'braced');
      if (prey0 && footPrey && r.meleeTicks > (braced ? 15 : 45)) {
        // Cycle charge: pull out, re-form, and come again.
        const dx = r.cx - prey0.cx;
        const dy = r.cy - prey0.cy;
        const q = sqrt(dx * dx + dy * dy) || 1;
        r.wx = clampX(r.cx + (dx / q) * 120);
        r.wy = clampY(r.cy + (dy / q) * 120);
        this.setMode(r, 'withdraw');
        this.goal(r, r.wx, r.wy);
        return;
      }
      if (prey0) this.goal(r, prey0.cx, prey0.cy);
      return;
    }
    if (r.mode === 'withdraw') {
      const dx = r.wx - r.ax;
      const dy = r.wy - r.ay;
      if (dx * dx + dy * dy > 18 * 18 && this.tick - r.modeAt < 70) return;
      this.setMode(r, 'hold');
      return;
    }
    if (r.mode === 'hold' && r.charges > 0 && this.tick - r.modeAt < 15) return;

    // The order's target, or one of opportunity.
    let prey: Regiment | null = null;
    const given = o.target >= 0 ? this.regiments[o.target]! : null;
    if (o.kind === 'hold' || o.kind === 'reserve') {
      // On the wing: counter-charge horse that comes close, fight foot that walks into us.
      prey = this.nearestFoe(r, 2, 90) ?? this.nearestFoe(r, 0, 25);
      if (!prey) {
        this.setMode(r, 'hold');
        this.goal(r, Number.isNaN(o.x) ? r.ax : o.x, Number.isNaN(o.y) ? r.ay : o.y);
        r.dfx = dir;
        r.dfy = 0;
        return;
      }
    } else if (o.kind === 'pursue') prey = this.nearestFoe(r, 4, Infinity) ?? this.nearestFoe(r, 0, Infinity);
    else if (given && given.alive > 0 && !given.routed) prey = given;
    else prey = this.nearestFoe(r, 2, 300) ?? this.nearestFoe(r, 1, Infinity) ?? this.nearestFoe(r, 4, 260) ?? this.nearestFoe(r, 3, Infinity) ?? this.nearestFoe(r, 0, Infinity);
    if (!prey) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    r.targetReg = prey.id;
    if (prey.routed) {
      this.setMode(r, 'pursue');
      this.goal(r, prey.cx + prey.fx * 10, prey.cy + prey.fy * 10);
      return;
    }
    // Ride round the enemy line rather than through it.
    // Prey behind the enemy line: out past the end of the line, then round behind it.
    const behindFront = (prey.cx - e.frontX) * dir > 15;
    const along = (r.cx - e.frontX) * dir;
    if (e.hasLine && behindFront && along < e.lineDepth + 25 && r.mode !== 'charge') {
      const up = r.cy - e.minY < e.maxY - r.cy;
      const wy = up ? e.minY - 70 : e.maxY + 70;
      const inSpan = r.cy > e.minY - 45 && r.cy < e.maxY + 45;
      this.setMode(r, 'flank');
      if (inSpan) this.goal(r, Math.min(Math.max(r.cx, e.frontX - dir * 120), e.frontX + 120) - dir * 0, wy);
      else this.goal(r, e.frontX + dir * (e.lineDepth + 60), wy);
      return;
    }
    // Against foot locked in melee (or when told to): come at its rear.
    const rear = isFoot(prey) && (prey.engaged || (o.kind === 'flank' && o.side === 3));
    const dpx = prey.cx - r.cx;
    const dpy = prey.cy - r.cy;
    const dp = sqrt(dpx * dpx + dpy * dpy) || 1;
    if (rear) {
      const rx = prey.ax - prey.fx * (prey.depth + 45);
      const ry = prey.ay - prey.fy * (prey.depth + 45);
      // Already behind it (on the far side of its facing)?
      const side = (r.cx - prey.cx) * prey.fx + (r.cy - prey.cy) * prey.fy;
      const ex = rx - r.ax;
      const ey = ry - r.ay;
      if (side > -prey.depth * 0.5 - 10 && ex * ex + ey * ey > 30 * 30 && r.mode !== 'charge') {
        this.setMode(r, 'flank');
        // Swing out to its side first if we're in front of it.
        if (side > 0) {
          const lx = -prey.fy;
          const ly = prey.fx;
          const s = (r.cx - prey.cx) * lx + (r.cy - prey.cy) * ly >= 0 ? 1 : -1;
          this.goal(r, prey.cx + lx * s * (prey.width * 0.5 + 50) - prey.fx * 20, prey.cy + ly * s * (prey.width * 0.5 + 50) - prey.fy * 20);
        } else this.goal(r, rx, ry);
        return;
      }
    }
    if (dp < 130 || r.mode === 'charge') {
      if (r.mode !== 'charge') {
        r.charges++;
        this.events.push({ tick: this.tick, team, kind: 'charge', cls: r.cls, reg: r.id });
      }
      this.setMode(r, 'charge');
      this.goal(r, prey.cx + (dpx / dp) * 40, prey.cy + (dpy / dp) * 40);
      this.faceToward(r, prey.cx, prey.cy);
      return;
    }
    this.setMode(r, 'flank');
    this.goal(r, prey.cx - (dpx / dp) * 90, prey.cy - (dpy / dp) * 90);
  }

  private thinkHorseArcher(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    if (this.tick < 40) {
      this.setMode(r, 'hold');
      return;
    }
    if (r.ord.kind === 'pursue') {
      this.thinkCav(r, false);
      return;
    }
    const threat = this.nearGap(r, 35, false) ?? this.nearGap(r, 90, true);
    if (threat) {
      // Ride away from it, sideways along the field, loosing as they go.
      const dx = r.cx - threat.cx;
      const dy = r.cy - threat.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / q;
      const uy = dy / q;
      const s = r.cy < FIELD_H / 2 ? -1 : 1;
      this.goal(r, r.cx + ux * 80 - uy * 30 * s, r.cy + uy * 80 + ux * 30 * s);
      const t = this.shootable(r, st.range * 0.95, true);
      r.targetReg = t ? t.id : -1;
      this.setMode(r, 'kite');
      return;
    }
    const best = this.shootable(r, st.range * 0.9, true);
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      this.closeToShoot(r, best, true);
      this.faceToward(r, best.cx, best.cy);
      return;
    }
    let near: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.engaged) continue;
      const q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
      if (q < bd) {
        bd = q;
        near = o;
      }
    }
    if (!near) {
      this.setMode(r, 'hold');
      return;
    }
    this.setMode(r, 'advance');
    r.targetReg = near.id;
    // In bow range of its nearest men, well outside the distance at which they ride off.
    this.standOff(r, near, st.range * 0.6);
  }

  private thinkSiege(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    let best: Regiment | null = null;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.engaged) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy > st.range * st.range) continue;
      if (!best || o.alive > best.alive) best = o;
    }
    r.targetReg = best ? best.id : -1;
    this.setMode(r, best ? 'shoot' : 'hold');
    this.goal(r, r.ax, r.ay);
    if (best) this.faceToward(r, best.cx, best.cy);
  }

  private thinkCommand(r: Regiment): void {
    const ts = this.ts[r.team]!;
    const dir = r.team === 0 ? 1 : -1;
    const reach = this.generals[r.team]!.trait === 'reckless-valour' ? 90 : 40;
    const near = this.nearestFoe(r, 0, reach);
    if (near || r.engaged) {
      this.setMode(r, 'melee');
      r.targetReg = near ? near.id : r.targetReg;
      if (near) this.goal(r, near.cx, near.cy);
      return;
    }
    this.setMode(r, 'guard');
    // Behind the middle of our own line, in sight of the men.
    if (ts.hasLine) this.goal(r, ts.frontX - dir * (ts.lineDepth + 55), ts.midY);
    else {
      // No line left: behind the middle of what is left. (The army's centre counts the general
      // himself, so stepping back from it would walk him off the back of the field.)
      let k = 0;
      let x = 0;
      let y = 0;
      for (const o of this.teamRegs[r.team]!) {
        if (o === r || o.alive === 0 || o.routed) continue;
        k += o.alive;
        x += o.cx * o.alive;
        y += o.cy * o.alive;
      }
      if (k > 0) this.goal(r, x / k - dir * 55, y / k);
      else {
        // His army is gone: he and his household ride at the enemy (standing still would
        // leave two lone generals facing each other until the time limit).
        const foe = this.nearestFoe(r, 0, Infinity);
        if (foe) {
          this.setMode(r, 'advance');
          this.goal(r, foe.cx, foe.cy);
          this.faceToward(r, foe.cx, foe.cy);
        } else this.goal(r, r.ax, r.ay);
      }
    }
    r.dfx = dir;
    r.dfy = 0;
  }

  /** Pins every regiment of a class on one side to a stance (tests and tools). */
  pinStance(team: number, cls: number, stance: Stance | null): void {
    for (const r of this.teamRegs[team]!) {
      if (r.cls !== cls || r.role === 'command') continue;
      r.pinned = stance;
      if (stance) this.setStance(r, stance);
    }
  }

  private setStance(r: Regiment, s: Stance): void {
    if (r.stance === s) return;
    r.stance = s;
    r.stanceAt = this.tick;
    r.spacing = spacingFor(r, s);
    // Re-form in the new shape, the front rank first so the men in front stay in front.
    this.assignSlots(r, true);
    if (r.tell(s, this.tick)) this.events.push({ tick: this.tick, team: r.team, kind: 'stance', cls: r.cls, reg: r.id, stance: s });
  }

  /** Each kind of regiment picks among its two or three stances for what it faces now. */
  private chooseStance(r: Regiment): void {
    if (r.pinned) {
      this.setStance(r, r.pinned);
      return;
    }
    let s: Stance = r.stance;
    let urgent = false;
    const cavThreat = (range: number) => {
      const c = this.nearestFoe(r, 2, range);
      return !!c && (c.mode === 'charge' || c.mode === 'flank' || c.mode === 'melee' || c.mode === 'pursue');
    };
    switch (r.role) {
      case 'line': {
        const march = (r.mode === 'advance' || r.mode === 'reserve') && !r.engaged && !this.nearestFoe(r, 0, 240);
        const dx = r.tx - r.ax;
        const dy = r.ty - r.ay;
        const far = dx * dx + dy * dy > 230 * 230;
        const base: Stance = march && far ? 'column' : 'line';
        if (r.cls === U.Spearmen) {
          if (r.mode === 'brace' || cavThreat(150)) {
            s = 'pikewall';
            urgent = true;
          } else s = r.engaged ? (r.stance === 'column' ? 'line' : r.stance) : base;
        } else if (r.cls === U.Shock) {
          if (r.engaged) s = r.stance === 'column' ? 'line' : r.stance;
          else if (cavThreat(130) || r.mode === 'hold') {
            s = 'braced';
            urgent = cavThreat(130);
          } else s = base;
        } else {
          if (r.engaged) s = r.stance === 'column' ? 'line' : r.stance;
          else if (r.arrows > 2.5 || cavThreat(120)) {
            s = 'shieldwall';
            urgent = true;
          } else if (r.stance === 'shieldwall' && r.arrows > 0.6) s = 'shieldwall';
          else s = base;
        }
        if (r.engaged && r.stance === 'column') urgent = true;
        break;
      }
      case 'missile':
        s = r.engaged || r.mode === 'melee' || r.ammoLeft === 0 ? 'line' : 'loose';
        urgent = r.engaged;
        break;
      case 'skirmish':
      case 'horse-archer':
        s = 'loose';
        break;
      case 'flank':
        s = r.mode === 'melee' || r.mode === 'pursue' ? 'loose' : 'line';
        break;
      case 'shock-cav':
        s = r.mode === 'charge' || r.mode === 'flank' ? 'wedge' : 'line';
        urgent = r.mode === 'charge';
        break;
      default:
        s = 'line';
    }
    if (s === r.stance) return;
    if (!urgent && this.tick - r.stanceAt < 25) return;
    this.setStance(r, s);
  }

  /**
   * The nearest enemy regiment by edge distance within `range`, of a kind:
   * 0 any fighting, 1 missiles and engines, 2 horse, 3 foot locked in melee, 4 routed.
   */
  private nearestFoe(r: Regiment, kind: number, range: number): Regiment | null {
    let best: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0) continue;
      if (kind === 4 ? !o.routed : o.routed) continue;
      if (kind === 1 && o.role !== 'missile' && o.role !== 'siege') continue;
      if (kind === 2 && !isCav(o)) continue;
      if (kind === 3 && !(o.engaged && (isFoot(o) || o.role === 'command'))) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) - o.radius - r.radius;
      if (q < range && q < bd) {
        bd = q;
        best = o;
      }
    }
    return best;
  }

  private rout(r: Regiment): void {
    if (r.routed) return;
    r.routed = true;
    r.mode = 'rout';
    r.modeAt = this.tick;
    r.routAt = this.tick;
    r.quietSince = this.tick;
    r.targetReg = -1;
    // Broken once too often, or too few left to stand again: shattered.
    const maxRallies = 1 + (r.veteran || this.setup.armies[r.team]!.moraleBonus >= 8 ? 1 : 0);
    const shattered = r.rallies >= maxRallies || r.alive < r.start * MORALE.shatterBelow || this.broken[r.team];
    r.moraleState = shattered ? 'shattered' : 'broken';
    this.events.push({ tick: this.tick, team: r.team, kind: shattered ? 'shattered' : 'rout', cls: r.cls, reg: r.id });
    const d = this.d;
    for (const id of r.members) {
      if (d.state[id] === State.Fighting) d.state[id] = State.Routing;
      d.target[id] = -1;
      d.imp[id] = 0;
    }
    // Panic spreads to neighbours; the enemy takes heart.
    for (const o of this.teamRegs[r.team]!) {
      if (o.routed || o === r || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < 150 * 150) o.morale -= o.role === 'command' ? 2 : MORALE.friendRout;
    }
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.routed || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < 250 * 250) o.morale = Math.min(100, o.morale + MORALE.enemyRout);
    }
  }
  /** Walks each regiment's anchor toward its goal and wheels it toward its facing, once a tick. */
  private moveAnchor(r: Regiment): void {
    r.vax = 0;
    r.vay = 0;
    if (r.alive === 0 || r.routed) return;
    const dx = r.tx - r.ax;
    const dy = r.ty - r.ay;
    const q = sqrt(dx * dx + dy * dy);
    let wx = r.dfx;
    let wy = r.dfy;
    const marching = q > 30 && MARCH[r.mode];
    if (marching) {
      wx = dx / q;
      wy = dy / q;
    }
    // Wheel: the wider the block, the slower it turns.
    const sd = STANCES[r.stance];
    const w = Math.min(0.15, Math.max(0.012, (r.speed * TICK_S * 0.8) / (r.width * 0.5 + 8))) * sd.turn;
    const dot = r.fx * wx + r.fy * wy;
    if (dot > 1 - w * w * 0.5) {
      r.fx = wx;
      r.fy = wy;
    } else {
      const cr = r.fx * wy - r.fy * wx;
      const s = cr >= 0 ? w : -w;
      const c = 1 - w * w * 0.5;
      let nx = r.fx * c - r.fy * s;
      let ny = r.fx * s + r.fy * c;
      const m = sqrt(nx * nx + ny * ny);
      nx /= m;
      ny /= m;
      r.fx = nx;
      r.fy = ny;
    }
    if (q < 0.3) return;
    let pace = r.speed * PACE[r.mode];
    if (pace === 0) pace = r.speed * 0.25; // drift onto the spot
    pace *= sd.pace * (1 - FATIGUE.pace * r.fatigue);
    if (marching) {
      // March facing the way it goes; a block slows while it wheels.
      const al = (r.fx * dx + r.fy * dy) / q;
      pace *= al > 0.8 ? 1 : al > 0.3 ? 0.5 : 0.25;
    } else if (q > 3) pace *= 0.7;
    const step = Math.min(q, pace * TICK_S);
    r.vax = (dx / q) * step;
    r.vay = (dy / q) * step;
    r.ax += r.vax;
    r.ay += r.vay;
  }

  // ------------------------------------------------------------------ soldiers

  private act(i: number): void {
    const d = this.d;
    if (d.cd[i]! > 0) d.cd[i]!--;
    if (d.stun[i]! > 0) d.stun[i]!--;
    if (d.state[i] === State.Routing) return;
    const r = this.regiments[d.reg[i]!]!;
    const mode = r.mode;
    if (mode === 'withdraw' || mode === 'skirmish') {
      d.target[i] = -1;
      return;
    }
    let t = d.target[i]!;
    if (t >= 0 && d.state[t]! > State.Routing) t = -1;
    if (!r.contact) t = -1;
    // Look again every few ticks (staggered): at once only for the men already fighting.
    else if ((this.tick + i) % (t < 0 ? 3 : 6) === 0) t = this.seek(i, r);
    d.target[i] = t;
    const st = this.soldiers[i]!.s;
    if (t >= 0) {
      const dx = d.x[t]! - d.x[i]!;
      const dy = d.y[t]! - d.y[i]!;
      const reach = d.rad[i]! + d.rad[t]! + 1.6;
      const q = dx * dx + dy * dy;
      if (d.stun[i]! > 0) return;
      if (d.imp[i]! > 0.3 && q <= (reach + 1.2) * (reach + 1.2)) {
        this.impact(i, t);
        return;
      }
      if (q <= reach * reach && d.cd[i] === 0) this.strike(i, t);
      return;
    }
    if (d.ammo[i]! > 0 && d.cd[i] === 0 && r.firing) this.shoot(i, r, st);
  }

  /** The foe this soldier should fight: near, in front of the block, within a short leash of his slot. */
  private seek(i: number, r: Regiment): number {
    const d = this.d;
    const mounted = d.mass[i]! > 2;
    const pursue = r.mode === 'pursue';
    const R = pursue ? 24 : mounted ? 15 : 10;
    const leash = pursue || r.role === 'command' || r.mode === 'rally' ? 1e9 : mounted ? 34 : 9;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const gx = r.ax + r.fx * d.sy[i]! - r.fy * d.sx[i]!;
    const gy = r.ay + r.fy * d.sy[i]! + r.fx * d.sx[i]!;
    const team = d.team[i]!;
    const fx = r.fx;
    const fy = r.fy;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const R2 = R * R;
    const L2 = (leash + R) * (leash + R);
    const grid = this.grid;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    let best = -1;
    let bs = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const end = grid[c + 1]!;
        for (let k = grid[c]!; k < end; k++) {
          if (this.kt[k] === team) continue;
          const j = items[k]!;
          const sj = d.state[j]!;
          if (sj > State.Routing) continue;
          const dx = kx[k]! - x;
          const dy = ky[k]! - y;
          let s = dx * dx + dy * dy;
          if (s > R2) continue;
          const lx = kx[k]! - gx;
          const ly = ky[k]! - gy;
          if (lx * lx + ly * ly > L2) continue;
          if (!mounted && dx * fx + dy * fy < 0) s *= 1.7;
          if (sj === State.Routing) s = pursue ? s * 0.6 : s * 3 + 30;
          if (s < bs) {
            bs = s;
            best = j;
          }
        }
      }
    }
    return best;
  }

  private shoot(i: number, r: Regiment, st: UnitStats): void {
    const d = this.d;
    const tr = this.regiments[r.targetReg]!;
    if (tr.alive === 0) return;
    const v = this.pickInReach(tr, d.x[i]!, d.y[i]!, st.range);
    if (v < 0) return;
    const dx = d.x[v]! - d.x[i]!;
    const dy = d.y[v]! - d.y[i]!;
    const dist = sqrt(dx * dx + dy * dy);
    if (dist > st.range || dist < 6) {
      if (dist > st.range) r.short++;
      d.cd[i] = 4;
      return;
    }
    r.loosed++;
    const flight = Math.max(3, Math.round((dist / st.projectileSpeed) * TICKS_PER_SECOND));
    // Lead the target a little, and scatter more with distance.
    const spread = 2 + dist * (st.role === 'siege' ? 0.05 : 0.03);
    const lx = d.x[v]! + d.vx[v]! * flight * TICK_S * 0.8 + (this.rng.next() - 0.5) * 2 * spread;
    const ly = d.y[v]! + d.vy[v]! * flight * TICK_S * 0.8 + (this.rng.next() - 0.5) * 2 * spread;
    const s = this.soldiers[i]!;
    this.projectiles.push({
      team: s.team, cls: s.cls, x0: d.x[i]!, y0: d.y[i]!, x1: lx, y1: ly, born: this.tick, lands: this.tick + flight,
      damage: st.missileDamage * (s.vet ? 1.1 : 1) * MISSILE_K, pierce: st.pierce, splash: st.role === 'siege' ? 9 : 0, shooter: i,
    });
    d.ammo[i]!--;
    d.acted[i] = this.tick;
    d.cd[i] = st.reload + this.rng.int(Math.max(2, Math.floor(st.reload / 5)));
  }

  /**
   * A man of regiment `r` to shoot at from (x, y): a few picked at random, the first within
   * `range` (a bowman aims at the part of a big block he can reach), else the nearest of them.
   */
  private pickInReach(r: Regiment, x: number, y: number, range: number): number {
    const d = this.d;
    let best = -1;
    let bd = Infinity;
    for (let tries = 0; tries < 6; tries++) {
      const id = r.members[this.rng.int(r.members.length)]!;
      if (d.state[id]! > State.Routing) continue;
      const dx = d.x[id]! - x;
      const dy = d.y[id]! - y;
      const q = dx * dx + dy * dy;
      if (q <= range * range && q >= 36) return id;
      if (q < bd) {
        bd = q;
        best = id;
      }
    }
    return best >= 0 ? best : this.pickMember(r);
  }

  private pickMember(r: Regiment): number {
    const d = this.d;
    for (let tries = 0; tries < 6; tries++) {
      const id = r.members[this.rng.int(r.members.length)]!;
      if (d.state[id]! <= State.Routing) return id;
    }
    for (const id of r.members) if (d.state[id]! <= State.Routing) return id;
    return -1;
  }

  /** Where a blow comes from against where the defender's regiment faces: 1 front, -1 rear. */
  private facing(a: number, t: number, dr: Regiment): number {
    const d = this.d;
    const ux = d.x[a]! - d.x[t]!;
    const uy = d.y[a]! - d.y[t]!;
    const un = sqrt(ux * ux + uy * uy) || 1;
    return (ux * dr.fx + uy * dr.fy) / un;
  }

  private strike(a: number, t: number): void {
    const d = this.d;
    const A = this.soldiers[a]!;
    const D = this.soldiers[t]!;
    const as = A.s;
    const ds = D.s;
    const dr = this.regiments[D.reg]!;
    const ar = this.regiments[A.reg]!;
    const sa = STANCES[ar.stance];
    const sd = STANCES[dr.stance];
    let attack = as.attack * (A.vet ? 1.1 : 1) + sa.attack - ar.fatigue * FATIGUE.combat + (ar.moraleState === 'wavering' || ar.moraleState === 'rallying' ? MORALE.waverAttack : 0);
    let defence = ds.defence * (D.vet ? 1.1 : 1) - dr.fatigue * FATIGUE.combat + (dr.moraleState === 'wavering' || dr.moraleState === 'rallying' ? MORALE.waverDefence : 0);
    const routing = d.state[t] === State.Routing;
    if (routing) defence *= 0.2;
    else {
      if (d.stun[t]! > 0) defence *= 0.6;
      const dot = this.facing(a, t, dr);
      defence += dr.stance === 'pikewall' && dot < 0.3 ? -10 : sd.defence;
      if (dot < -0.4) {
        attack += 20;
        defence *= 0.55;
        dr.flankShock += MORALE.rearBlow;
      } else if (dot < 0.3) {
        attack += 9;
        dr.flankShock += MORALE.flankBlow;
      }
    }
    const chance = Math.max(0.08, Math.min(0.92, 0.36 + (attack - defence) * 0.012));
    d.acted[a] = this.tick;
    d.cd[a] = as.meleeCooldown + this.rng.int(4);
    if (this.rng.next() >= chance) return;
    let damage = as.damage;
    if (ds.mounted) damage *= as.antiCav * (ar.stance === 'pikewall' ? 1.4 : 1);
    const roll = 0.8 + this.rng.next() * 0.4;
    this.hurt(t, damage * roll * MELEE_K * (50 / (50 + ds.armour)), a);
  }

  /** A charging man hits: knock-back and shock, or a horse impaled on braced spears. */
  private impact(a: number, t: number): void {
    const d = this.d;
    const A = this.soldiers[a]!;
    const D = this.soldiers[t]!;
    const as = A.s;
    const ds = D.s;
    const dr = this.regiments[D.reg]!;
    const energy = d.imp[a]!;
    const dot = this.facing(a, t, dr);
    d.acted[a] = this.tick;
    d.cd[a] = as.meleeCooldown;
    const standing = d.state[t] === State.Fighting;
    const frontal = dot > 0.25;
    // A pike wall impales horse charging its front, and stops the charge dead.
    if (as.mounted && !ds.mounted && standing && frontal && dr.stance === 'pikewall') {
      d.acted[t] = this.tick;
      d.imp[a] = 0;
      d.stun[a] = 8;
      d.vx[a] = -d.vx[a]! * 0.3;
      d.vy[a] = -d.vy[a]! * 0.3;
      this.hurt(a, ds.damage * Math.max(1.5, ds.antiCav) * 2.2 * MELEE_K * (50 / (50 + as.armour)) * (0.6 + energy * 0.6), t);
      return;
    }
    const routing = d.state[t] === State.Routing;
    const rear = !routing && dot < -0.4;
    const side = !routing && !rear && dot < 0.3;
    const wedge = this.regiments[A.reg]!.stance === 'wedge';
    // Braced shock troops take a charge on their front without giving ground.
    const planted = standing && frontal && dr.stance === 'braced';
    const force = energy * (planted ? 0.3 : 1) * (wedge ? 1.25 : 1);
    const roll = 0.8 + this.rng.next() * 0.4;
    const dmg = (as.damage + as.charge * 0.9) * force * (rear ? 1.3 : 1) * MELEE_K * (50 / (50 + ds.armour)) * roll;
    this.hurt(t, dmg, a);
    // Knocked back along the line of the charge, and reeling.
    let nx = d.vx[a]!;
    let ny = d.vy[a]!;
    let m = sqrt(nx * nx + ny * ny);
    if (m < 1) {
      nx = d.x[t]! - d.x[a]!;
      ny = d.y[t]! - d.y[a]!;
      m = sqrt(nx * nx + ny * ny) || 1;
    }
    const kb = planted ? 0 : (2 + 5 * energy) * (as.mass / (as.mass + ds.mass)) * (as.mounted ? 1 : 0.3) * (wedge ? 1.5 : 1) * (dr.stance === 'loose' ? 0.7 : 1);
    if (d.state[t]! <= State.Routing) {
      d.x[t] = clampX(d.x[t]! + (nx / m) * kb);
      d.y[t] = clampY(d.y[t]! + (ny / m) * kb);
      d.stun[t] = planted ? 0 : as.mounted ? 8 + this.rng.int(6) : 3;
    }
    if (!routing) {
      dr.morale -= (rear ? MORALE.chargeRear : side ? MORALE.chargeFlank : MORALE.chargeFront) * force * (ds.mounted ? 0.6 : 1) * (as.mounted ? 1 : 0.4);
      dr.flankShock += rear ? 0.6 : side ? 0.3 : 0;
    }
    // Each man hit takes some of the charge out of him: knights carry through a thin line, light
    // horse soon stalls.
    d.imp[a] = Math.max(0, energy - (0.22 + 0.12 * ds.mass) * (wedge ? 0.55 : 1) * (planted ? 3 : 1) * (as.mounted && as.mass < 4 ? 1.7 : 1));
  }

  private hurt(t: number, amount: number, by: number): void {
    const d = this.d;
    if (d.state[t]! > State.Routing) return;
    d.hp[t]! -= amount;
    d.hit[t] = this.tick;
    if (d.hp[t]! > 0) return;
    d.state[t] = State.Dead;
    d.died[t] = this.tick;
    d.vx[t] = 0;
    d.vy[t] = 0;
    d.target[t] = -1;
    if (by >= 0) {
      d.kills[by]!++;
      const br = this.regiments[d.reg[by]!]!;
      br.recentKills += 1 / br.start;
    }
    const r = this.regiments[d.reg[t]!]!;
    r.alive--;
    r.recent += 1 / r.start;
    r.reflow = true;
    if (t === this.commander[d.team[t]!]) {
      const team = d.team[t]!;
      this.commanderFell[team] = true;
      this.events.push({ tick: this.tick, team, kind: 'commander', cls: U.Knights });
      for (const o of this.teamRegs[team]!) o.morale -= MORALE.generalDeadShock;
    }
  }

  /**
   * Nobody stands inside anybody: after everyone has moved, overlapping men are pushed apart
   * (heavier ones less), pair by pair in grid order so a press resolves rather than jitters.
   * Skirmishers squeeze through their own lines. A galloping rider shoves enemy foot aside a
   * stride ahead of him (unless they stand braced), so a charge opens a lane through a line
   * instead of riding through men. The correction is kept (`px`, `py`) so that next tick `move`
   * does not walk a man straight back into whoever pushed him.
   */
  private separate(): void {
    const grid = this.grid;
    const kx = this.kx;
    const ky = this.ky;
    const kr = this.kr;
    const km = this.km;
    const kt = this.kt;
    const kl = this.kl;
    const kw = this.kw;
    const kpx = this.kpx;
    const kpy = this.kpy;
    const busy = this.busy;
    const items = this.items;
    const d = this.d;
    const total = grid[GW * GH]!;
    // Where everyone stands now (the cells are from the start of the tick: nobody moves far).
    for (let k = 0; k < total; k++) {
      const i = items[k]!;
      kx[k] = d.x[i]!;
      ky[k] = d.y[i]!;
      kpx[k] = 0;
      kpy[k] = 0;
      if (d.state[i]! > State.Routing) kl[k] = kl[k]! | 4;
    }
    for (let bi = 0; bi < this.busyN; bi++) {
      const c = busy[bi]!;
      const cx = c % GW;
      const cy = (c - cx) / GW;
      const a1 = grid[c + 1]!;
      for (let ka = grid[c]!; ka < a1; ka++) {
        const li = kl[ka]!;
        if (li & 4) continue;
        let xi = kx[ka]!;
        let yi = ky[ka]!;
        const ri = kr[ka]!;
        const mi = km[ka]!;
        const ti = kt[ka]!;
        const wi0 = kw[ka]!;
        let pxi = 0;
        let pyi = 0;
        // This cell (later items) and four of its neighbours: each pair once.
        for (let nb = 0; nb < 5; nb++) {
          let kb0: number;
          let kb1: number;
          let cc = c;
          if (nb === 0) {
            kb0 = ka + 1;
            kb1 = a1;
          } else {
            const nx = cx + (nb === 1 || nb === 4 ? 1 : nb === 2 ? -1 : 0);
            const ny = cy + (nb === 1 ? 0 : 1);
            if (nx < 0 || nx >= GW || ny >= GH) continue;
            cc = ny * GW + nx;
            kb0 = grid[cc]!;
            kb1 = grid[cc + 1]!;
          }
          for (let kb = kb0; kb < kb1; kb++) {
            const dx = xi - kx[kb]!;
            const dy = yi - ky[kb]!;
            let minD = ri + kr[kb]!;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD && wi0 === 0 && kw[kb] === 0) continue;
            const lj = kl[kb]!;
            if (lj & 4) continue;
            let ma = mi;
            let mj = km[kb]!;
            let k = 1;
            // A rider's bow wave: rider and shove direction (sideways out of his path) if any.
            let rider = -1;
            if (kt[kb] !== ti) {
              const wj = kw[kb]!;
              if (wi0 > 0 && (lj & 2) === 0 && mj <= 2) {
                const a = items[ka]!;
                if (d.vx[a]! * dx + d.vy[a]! * dy < 0) {
                  minD += wi0;
                  ma *= 3;
                  rider = a;
                }
              } else if (wj > 0 && (li & 2) === 0 && mi <= 2) {
                const b = items[kb]!;
                if (d.vx[b]! * dx + d.vy[b]! * dy > 0) {
                  minD += wj;
                  mj *= 3;
                  rider = b;
                }
              }
            } else if (((li | lj) & 1) !== 0) k = 0.3;
            if (d2 >= minD * minD) continue;
            const dd = sqrt(d2);
            if (rider < 0 && kt[kb] !== ti) {
              // A horse run onto braced foot is stopped dead.
              if (wi0 > 0 && (lj & 2) !== 0) d.imp[items[ka]!] = 0;
              else if (kw[kb]! > 0 && (li & 2) !== 0) d.imp[items[kb]!] = 0;
            }
            if (rider >= 0 && dd < ri + kr[kb]!) {
              // He could not get out of the way (men packed behind him): the horse is checked.
              d.imp[rider] = d.imp[rider]! * (d.mass[rider]! >= 4 ? 0.88 : 0.6);
              ma = mi;
              mj = km[kb]!;
            }
            let ux: number;
            let uy: number;
            if (rider >= 0) {
              // Thrown aside: half along the charge, mostly out to the side he stood on.
              const vx = d.vx[rider]!;
              const vy = d.vy[rider]!;
              const vq = sqrt(vx * vx + vy * vy) || 1;
              const fx = vx / vq;
              const fy = vy / vq;
              // Man relative to the rider.
              const sgn = rider === items[ka] ? -1 : 1;
              const rx = dx * sgn;
              const ry = dy * sgn;
              const side = rx * -fy + ry * fx >= 0 ? 1 : -1;
              let mx = fx * 0.5 - fy * side;
              let my = fy * 0.5 + fx * side;
              const mq = sqrt(mx * mx + my * my);
              mx /= mq;
              my /= mq;
              // u points from kb to ka: the man moves along u if he is ka, along -u if kb.
              ux = mx * sgn;
              uy = my * sgn;
            } else if (dd < 0.01) {
              ux = (ka & 1) === 0 ? 0.6 : -0.6;
              uy = 0.8;
            } else {
              ux = dx / dd;
              uy = dy / dd;
            }
            const f = (minD - dd) * k;
            const wi = mj / (ma + mj);
            const ax = ux * f * wi;
            const ay = uy * f * wi;
            const bx = ux * f * (1 - wi);
            const by = uy * f * (1 - wi);
            xi += ax;
            yi += ay;
            pxi += ax;
            pyi += ay;
            kx[kb]! -= bx;
            ky[kb]! -= by;
            kpx[kb]! -= bx;
            kpy[kb]! -= by;
          }
        }
        kx[ka] = xi;
        ky[ka] = yi;
        kpx[ka]! += pxi;
        kpy[ka]! += pyi;
      }
    }
    // Back from grid order to soldier order: positions, and the push as a velocity.
    d.px.fill(0);
    d.py.fill(0);
    for (let k = 0; k < total; k++) {
      if (kl[k]! & 4) continue;
      const i = items[k]!;
      const qx = kpx[k]!;
      const qy = kpy[k]!;
      if (qx === 0 && qy === 0) continue;
      const routing = d.state[i] === State.Routing;
      d.x[i] = routing ? kx[k]! : clampX(kx[k]!);
      d.y[i] = clampY(ky[k]!);
      d.px[i] = qx / TICK_S;
      d.py[i] = qy / TICK_S;
      d.vx[i]! += qx / TICK_S;
      d.vy[i]! += qy / TICK_S;
    }
  }

  private move(i: number): void {
    const d = this.d;
    const r = this.regiments[d.reg[i]!]!;
    const spd = d.spd[i]!;
    const x = d.x[i]!;
    const y = d.y[i]!;
    let vx: number;
    let vy: number;
    let cap = spd * 1.15;
    const routing = d.state[i] === State.Routing;
    if (routing) {
      const gx = d.team[i] === 0 ? -40 : FIELD_W + 40;
      vx = gx > x ? spd * 1.05 : -spd * 1.05;
      vy = ((i % 7) - 3) * 1.2;
      cap = spd * 1.1;
    } else {
      const t = d.target[i]!;
      if (t >= 0) {
        const dx = d.x[t]! - x;
        const dy = d.y[t]! - y;
        const q = sqrt(dx * dx + dy * dy) || 1;
        const contact = d.rad[i]! + d.rad[t]! + 0.9;
        if (d.imp[i]! > 0.3) {
          vx = (dx / q) * spd * 1.15;
          vy = (dy / q) * spd * 1.15;
          cap = spd * 1.2;
        } else if (q > contact) {
          const v = Math.min(spd, (q - contact) * 4) / q;
          vx = dx * v;
          vy = dy * v;
        } else {
          vx = 0;
          vy = 0;
        }
      } else {
        // Keep formation: match the anchor's pace and close on the slot.
        const gx = r.ax + r.fx * d.sy[i]! - r.fy * d.sx[i]!;
        const gy = r.ay + r.fy * d.sy[i]! + r.fx * d.sx[i]!;
        // In a melee the rear ranks close up gently: they back the front, they do not shove
        // it through the enemy.
        const k = r.engaged ? 1 : 2.5;
        vx = r.vax / TICK_S + (gx - x) * k;
        vy = r.vay / TICK_S + (gy - y) * k;
        if (r.mode === 'charge' || r.mode === 'withdraw' || r.mode === 'pursue') cap = spd * 1.2;
      }
    }
    if (d.stun[i]! > 0) {
      vx *= 0.3;
      vy *= 0.3;
    }
    const mounted = d.mass[i]! > 2;
    // Stakes: the enemy's horses balk and bleed.
    if (mounted && !routing && this.stakes.length > 0) {
      for (const k of this.stakes) {
        if (k.team === d.team[i] || Math.abs(x - k.x) > 4 || y < k.y0 || y > k.y1) continue;
        vx *= 0.25;
        vy *= 0.25;
        d.imp[i] = 0;
        if (this.tick % 5 === 0) this.hurt(i, 6, -1);
      }
    }
    const vmax = cap * 1.4;
    const vm = sqrt(vx * vx + vy * vy);
    if (vm > vmax) {
      vx = (vx / vm) * vmax;
      vy = (vy / vm) * vmax;
    }
    // Galloping (or running) in at a charge builds impetus; anything else bleeds it.
    if (this.soldiers[i]!.s.charge > 0 && r.mode === 'charge' && vm > spd * 0.7) d.imp[i] = Math.min(1, d.imp[i]! + (mounted ? 0.08 : 0.15));
    else if (d.imp[i]! > 0) d.imp[i] = d.imp[i]! < 0.05 ? 0 : d.imp[i]! * (mounted && vm > spd * 0.6 ? 0.93 : 0.8);
    // Men pressed by others do not walk into them: the part of his stride that goes into the
    // press is dropped (a galloping rider ploughs on; his bow wave moves them instead), and the
    // press itself moves him.
    const px = d.px[i]!;
    const py = d.py[i]!;
    const pm = sqrt(px * px + py * py);
    if (pm > 0.05 && !(mounted && d.imp[i]! > 0.3)) {
      const into = (vx * px + vy * py) / pm;
      if (into < 0) {
        vx -= (px / pm) * into;
        vy -= (py / pm) * into;
      }
    }
    d.vx[i] = vx;
    d.vy[i] = vy;
    let nx = x + vx * TICK_S;
    const ny = clampY(y + vy * TICK_S);
    if (routing) {
      if (nx < -4 || nx > FIELD_W + 4) {
        nx = Math.max(-8, Math.min(FIELD_W + 8, nx));
        d.state[i] = State.Fled;
        d.target[i] = -1;
        r.alive--;
      }
    } else nx = clampX(nx);
    d.x[i] = nx;
    d.y[i] = ny;
  }

  private flyProjectiles(): void {
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
    const d = this.d;
    const radius = p.splash > 0 ? p.splash : 2.4;
    const R = radius + 4;
    const x0 = Math.max(0, Math.floor((p.x1 - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((p.x1 + R) / CELL));
    const y0 = Math.max(0, Math.floor((p.y1 - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((p.y1 + R) / CELL));
    let hit = -1;
    let bd = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.grid[c + 1]!; k++) {
          const j = this.items[k]!;
          if (d.state[j]! > State.Routing) continue;
          const dx = d.x[j]! - p.x1;
          const dy = d.y[j]! - p.y1;
          const d2 = dx * dx + dy * dy;
          const rr = radius + d.rad[j]! * 0.6;
          if (d2 > rr * rr) continue;
          if (p.splash > 0) {
            // A stone kills whoever it lands among, friend or foe.
            if (d.team[j] === p.team && this.rng.next() > 0.5) continue;
            this.missileHit(j, p);
            this.regiments[d.reg[j]!]!.morale -= 0.6;
          } else if (d2 < bd) {
            bd = d2;
            hit = j;
          }
        }
      }
    }
    if (hit < 0) return;
    if (d.team[hit] === p.team && this.rng.next() > FRIENDLY_FIRE) return;
    this.missileHit(hit, p);
  }

  private missileHit(o: number, p: Projectile): void {
    const d = this.d;
    const army = this.setup.armies[d.team[o]!]!;
    const S = this.soldiers[o]!;
    // Shields stop missiles from the front.
    const r = this.regiments[d.reg[o]!]!;
    const ux = p.x0 - d.x[o]!;
    const uy = p.y0 - d.y[o]!;
    const un = sqrt(ux * ux + uy * uy) || 1;
    const front = (ux * r.fx + uy * r.fy) / un > 0.2;
    r.arrows += 1;
    const sd = STANCES[r.stance];
    const shield = S.s.shield + (r.stance === 'shieldwall' ? 0.35 : 0);
    if (p.splash === 0 && front && d.state[o] === State.Fighting && this.rng.next() < shield * (1 - p.pierce * 0.6)) return;
    const armour = S.s.armour * (1 - p.pierce);
    let dmg = p.damage * (50 / (50 + armour)) * (0.75 + this.rng.next() * 0.5) * (p.splash > 0 ? sd.stones : sd.missile);
    if (front) dmg *= 1 - army.pavise;
    r.morale -= 0.04;
    const shooter = p.shooter >= 0 && d.team[p.shooter] !== d.team[o] ? p.shooter : -1;
    this.hurt(o, dmg, shooter);
  }

  // ------------------------------------------------------------------ the end

  private checkEnd(): void {
    const d = this.d;
    const fighting = [0, 0];
    for (let i = 0; i < this.n; i++) if (d.state[i] === State.Fighting) fighting[d.team[i]!]!++;
    const before = [this.broken[0], this.broken[1]];
    for (let t = 0; t < 2; t++) {
      if (this.broken[t]) continue;
      const f = fighting[t]!;
      const o = fighting[1 - t]!;
      // The army breaks when nobody stands, or a last remnant faces a host.
      if (f === 0 || f < this.startTotal[t]! * 0.08 || (f < this.startTotal[t]! * 0.2 && o > f * 1.6)) {
        this.broken[t] = true;
        if (this.brokenAt < 0) this.brokenAt = this.tick;
        this.events.push({ tick: this.tick, team: t, kind: 'break', cls: 0 });
        for (const r of this.teamRegs[t]!) {
          if (r.alive > 0 && !r.routed) this.rout(r);
          else if (r.routed) r.moraleState = 'shattered';
        }
      }
    }
    if (this.broken[0] && this.broken[1]) {
      // The side that broke first lost, even if the winner's remnant gives way in the pursuit.
      // Both at once: whoever still has more men on the field (everyone is running by now, so
      // `strength`, which counts only men standing, would make it a coin toss).
      if (before[0] !== before[1]) this.result = this.decide('rout', before[0] ? 1 : 0);
      else {
        const a = this.onField(0);
        const b = this.onField(1);
        this.result = this.decide('rout', a === b ? null : a > b ? 0 : 1);
      }
      return;
    }
    if (this.brokenAt >= 0) {
      const loser = this.broken[0] ? 0 : 1;
      let left = 0;
      for (let i = 0; i < this.n; i++) if (d.team[i] === loser && d.state[i]! <= State.Routing) left++;
      // Let the pursuit run a little, then call it (at the time limit at the latest: `fight()`
      // stops there, and a replay must not run on past it to another ending).
      if (left === 0 || this.tick - this.brokenAt >= 120 || this.tick >= MAX_TICKS) this.result = this.decide('rout', loser === 0 ? 1 : 0);
      return;
    }
    if (this.tick >= MAX_TICKS) this.result = this.decide('time');
  }

  private kills(team: number): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.d.team[i] === team) k += this.d.kills[i]!;
    return k;
  }

  /** Value of what a side still has on the field, standing or running. */
  private onField(team: number): number {
    const d = this.d;
    let v = 0;
    for (let i = 0; i < this.n; i++) {
      if (d.team[i] !== team || d.state[i]! > State.Routing) continue;
      const s = this.soldiers[i]!.s;
      v += s.value * (d.hp[i]! / s.hp);
    }
    return v;
  }

  /** Value of what a side still has fighting, against what it brought. */
  strength(team: number): number {
    const d = this.d;
    let v = 0;
    for (let i = 0; i < this.n; i++) {
      if (d.team[i] !== team || d.state[i] !== State.Fighting) continue;
      const s = this.soldiers[i]!.s;
      v += s.value * (d.hp[i]! / s.hp);
    }
    return v;
  }

  private decide(reason: 'rout' | 'time', winner: 0 | 1 | null = null): BattleResult {
    if (winner === null) {
      // On the strength still standing; failing that, on the men still on the field, then on
      // the kills. Only a perfectly even day is left to chance.
      const keys = [this.strength(0) - this.strength(1), this.onField(0) - this.onField(1), this.kills(0) - this.kills(1)];
      const k = keys.find((x) => x !== 0);
      winner = k === undefined ? (this.rng.next() < 0.5 ? 0 : 1) : k > 0 ? 0 : 1;
    }
    const d = this.d;
    const side = (team: number): SideResult => {
      const deadF = emptyCounts();
      const fledF = emptyCounts();
      const aliveF = emptyCounts();
      let kills = 0;
      for (let i = 0; i < this.n; i++) {
        if (d.team[i] !== team) continue;
        kills += d.kills[i]!;
        const s = this.soldiers[i]!;
        if (s.commander || this.regiments[s.reg]!.role === 'command') continue;
        const st = d.state[i]!;
        if (st === State.Dead) deadF[s.cls]!++;
        else if (st === State.Fled || st === State.Routing) fledF[s.cls]!++;
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

/**
 * A place against regiment `o` for a block `depth` deep: k = 0 its front, 1 and 2 its flanks,
 * 3 its rear. Writes the anchor point and the facing to `out`.
 */
function slotPos(o: Regiment, k: number, depth: number, out: Float64Array): void {
  const fx = o.fx;
  const fy = o.fy;
  const lx = -fy;
  const ly = fx;
  void depth;
  if (k === 0) {
    out[0] = o.ax + fx * 3;
    out[1] = o.ay + fy * 3;
    out[2] = -fx;
    out[3] = -fy;
  } else if (k === 3) {
    out[0] = o.ax - fx * (o.depth + 4);
    out[1] = o.ay - fy * (o.depth + 4);
    out[2] = fx;
    out[3] = fy;
  } else {
    const s = k === 1 ? 1 : -1;
    const h = o.width * 0.5 + 4;
    out[0] = o.ax + lx * s * h - fx * o.depth * 0.5;
    out[1] = o.ay + ly * s * h - fy * o.depth * 0.5;
    out[2] = -lx * s;
    out[3] = -ly * s;
  }
}

function lineOrder(cls: number): number {
  // Centre-out order for the line: the heaviest in the middle.
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

/** Sets a regiment's files and ranks for `n` men. */
function shape(reg: Regiment, n: number): void {
  const sd = STANCES[reg.stance];
  const ratio = sd.ratio > 0 ? sd.ratio : RATIO[reg.role]! * sd.ratioMul;
  // Engines stand in one row of four; a bigger battery (a huge army of engines) in a block.
  let cols = reg.role === 'siege' ? Math.max(1, Math.min(n, Math.max(4, Math.ceil(sqrt(n * 2))))) : Math.max(1, Math.min(n, Math.ceil(sqrt(n * ratio))));
  if (reg.stance === 'wedge') {
    let rows = 1;
    while ((rows * (rows + 1)) / 2 < n) rows++;
    cols = rows;
  }
  reg.cols = cols;
  reg.rows = Math.max(1, Math.ceil(n / cols));
  reg.width = (cols - 1) * reg.spacing + 4;
  reg.depth = (reg.rows - 1) * reg.spacing + 4;
  reg.radius = sqrt(reg.width * reg.width + reg.depth * reg.depth) * 0.5 + 3;
}

function spacingFor(reg: Regiment, s: Stance): number {
  const sd = STANCES[s];
  return reg.rad * 2 + GAP_IN_RANK[reg.role]! * sd.gap + sd.add;
}

function defaultStance(reg: Regiment): Stance {
  return reg.role === 'missile' || reg.role === 'skirmish' || reg.role === 'horse-archer' ? 'loose' : 'line';
}

function rowWidth(list: Regiment[]): number {
  return list.reduce((w, r) => w + r.width + 12, 0) - 12;
}

function cellIndex(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return cy * GW + cx;
}

/** Most men of one class an army can bring (far beyond any city; keeps the arithmetic sane). */
const MAX_MEN = 10_000_000;
const wholeMen = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.min(MAX_MEN, Math.floor(n)) : 0);
const within = (n: number, lo: number, hi: number, otherwise: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : otherwise);

/**
 * A setup with whole, finite numbers: counts and veterans floored to men (NaN, negative or
 * infinite counts are none), veterans no more than the men, morale bonus and pavise bounded.
 * A valid setup comes back equal to the one given.
 */
function sanitize(setup: BattleSetup): BattleSetup {
  const army = (a: ArmySpec): ArmySpec => {
    const counts = emptyCounts();
    const veterans = emptyCounts();
    for (let c = 0; c < UNIT_COUNT; c++) {
      counts[c] = wholeMen(a.counts[c] ?? 0);
      veterans[c] = Math.min(counts[c]!, wholeMen(a.veterans[c] ?? 0));
    }
    return { ...a, counts, veterans, moraleBonus: within(a.moraleBonus, -50, 50, 0), pavise: within(a.pavise, 0, 0.4, 0) };
  };
  return { ...setup, armies: [army(setup.armies[0]), army(setup.armies[1])] };
}

/** Fights a battle to its end. */
export function fight(setup: BattleSetup): BattleResult {
  return new Battle(setup).run();
}
