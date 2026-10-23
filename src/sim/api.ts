// Determinism rules for everything under src/sim (except mapgen, whose output is
// rebuilt identically from the war header): only + - * / Math.sqrt Math.floor
// Math.abs Math.min Math.max on numbers, a seeded PRNG stored in World, and
// iteration over arrays in index order. No Math.sin/cos/atan2/pow/exp/log, Date,
// Math.random, or Set/Map iteration whose order depends on insertion by hashing.

export const TICK_MS = 200;
export const TICKS_PER_SECOND = 1000 / TICK_MS;
export const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND;

export const NEUTRAL = -1;

/** Line categories, in the order they appear in a push's `lines` tuple. */
export const Cat = {
  Code: 0,
  Test: 1,
  Comment: 2,
  Docs: 3,
  Config: 4,
  Removed: 5,
  Generated: 6,
  Vendor: 7,
  Blank: 8,
} as const;
export type Cat = (typeof Cat)[keyof typeof Cat];
export const CAT_COUNT = 9;
export const CAT_NAMES = ['code', 'test', 'comment', 'docs', 'config', 'removed', 'generated', 'vendor', 'blank'] as const;
export type Lines = readonly number[];

export const Kind = {
  Legionary: 0,
  Warden: 1,
  Archer: 2,
  Herald: 3,
  Sapper: 4,
  Outrider: 5,
  Golem: 6,
  Mercenary: 7,
  Champion: 8,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export const KIND_COUNT = 9;

export const Doctrine = { Balanced: 0, Assault: 1, Hold: 2, Siege: 3, Skirmish: 4 } as const;
export type Doctrine = (typeof Doctrine)[keyof typeof Doctrine];

export const Terrain = { Plain: 0, Forest: 1, Water: 2, Rock: 3, Void: 255 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export type SiteKind = 'capital' | 'shrine' | 'heart';

export interface SiteDef {
  id: number;
  kind: SiteKind;
  x: number;
  y: number;
  radius: number;
  /** Slot of the capital, or -1. */
  slot: number;
  /** Renown per minute to the holder. */
  renown: number;
}

export interface MapDef {
  radius: number;
  slots: number;
  navCell: number;
  navCols: number;
  navRows: number;
  originX: number;
  originY: number;
  terrain: Uint8Array;
  sites: SiteDef[];
}

export interface WarParams {
  seed: number;
  slots: number;
  /** Members at the start of the war; scales the Monolith. */
  members: number;
}

export type SimInput =
  | { kind: 'join'; p: number; slot: number; hue: number }
  | {
      kind: 'push';
      p: number;
      /** Index into the war's repo table; also the battalion key. */
      repo: number;
      lines: Lines;
      commits: number;
      msg: string;
    }
  | { kind: 'doctrine'; p: number; doctrine: Doctrine }
  | { kind: 'rally'; p: number; site: number }
  | { kind: 'cry'; p: number };

export interface TimedInput {
  tick: number;
  seq: number;
  input: SimInput;
}

export interface Unit {
  id: number;
  /** Player index, or NEUTRAL for monolith guards. */
  p: number;
  platoon: number;
  kind: Kind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Target unit id, or -(structureIndex + 1) for a structure, or 0 for none. */
  target: number;
  cooldown: number;
  /** Tick at which a wound-up melee blow lands, or -1. */
  swingAt: number;
  /** Tick this unit leaves (mercenary contract), or -1. */
  leavesAt: number;
  /** Place in the platoon's formation: forward and lateral offset from the banner. */
  fx: number;
  fy: number;
}

export const PlatoonState = { Queued: 0, March: 1, Engage: 2, Hold: 3, Rout: 4 } as const;
export type PlatoonState = (typeof PlatoonState)[keyof typeof PlatoonState];

export interface Platoon {
  id: number;
  p: number;
  repo: number;
  /** 1-based ordinal within the battalion (player + repo) today. */
  ordinal: number;
  state: PlatoonState;
  x: number;
  y: number;
  hx: number;
  hy: number;
  site: number;
  morale: number;
  size: number;
  alive: number;
  /** Composition at muster, by kind. */
  mustered: number[];
  arrivedTick: number;
  kills: number;
  /** Deepest distance from own capital reached, for the Lone Charge highlight. */
  depth: number;
  champion: boolean;
  /** Ticks since a member last had an enemy in reach. */
  calm: number;
}

export interface Structure {
  site: number;
  /** Owning player, or NEUTRAL for the Monolith. */
  p: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  /** Tick until which it lies in ruins, or -1. */
  ruinedUntil: number;
}

export interface Shot {
  from: number;
  p: number;
  target: number;
  x: number;
  y: number;
  landAt: number;
  damage: number;
  /** 0 arrow, 1 tower bolt. */
  kind: number;
}

export interface PlayerState {
  p: number;
  slot: number;
  hue: number;
  doctrine: Doctrine;
  doctrineAt: number;
  rallySite: number;
  rallyUntil: number;
  rallyAt: number;
  cryUntil: number;
  cryUsed: boolean;
  renown: number;
  pushes: number;
  /** Ticks of this player's pushes in the last hour, oldest first. */
  recentPushes: number[];
  lines: number[];
  raised: number[];
  kills: number;
  losses: number;
  structureDamage: number;
  monolithDamage: number;
  captures: number;
  sacks: number;
  routs: number;
  balanced: number;
  /** This player's deadliest platoon today: [repo, ordinal, kills], or null. */
  best: [number, number, number] | null;
  /** Platoon ids waiting at the capital, in order. */
  queue: number[];
  /** [repo index, platoons raised today] per battalion, in order of first push. */
  battalions: [number, number][];
}

export interface SiteState {
  id: number;
  owner: number;
  capturer: number;
  progress: number;
}

export interface World {
  tick: number;
  params: WarParams;
  map: MapDef;
  rng: number;
  nextId: number;
  units: Unit[];
  platoons: Platoon[];
  structures: Structure[];
  shots: Shot[];
  players: PlayerState[];
  sites: SiteState[];
  /** Player with the most renown, or NEUTRAL. */
  leader: number;
  monolithFallen: boolean;
}

export interface TickEvents {
  swings: { from: number; to: number }[];
  shots: { from: number; to: number; x: number; y: number; land: number; kind: number }[];
  hits: { unit: number; damage: number; structure: number }[];
  deaths: { unit: number; p: number; kind: Kind; x: number; y: number; killer: number; platoon: number }[];
  musters: { platoon: number; p: number; queued: boolean }[];
  marches: { platoon: number }[];
  routs: { platoon: number }[];
  disbands: { platoon: number; p: number; repo: number; ordinal: number; x: number; y: number }[];
  captures: { site: number; p: number; previous: number }[];
  sacks: { site: number; p: number; victim: number }[];
  rebuilt: { site: number }[];
  monolith: { p: number } | null;
  cries: { p: number }[];
  doctrines: { p: number; doctrine: Doctrine }[];
  rallies: { p: number; site: number }[];
  joins: { p: number }[];
  leader: { p: number; previous: number } | null;
  departures: { unit: number }[];
}

export interface WorldSnapshot {
  version: 2;
  world: unknown;
}
