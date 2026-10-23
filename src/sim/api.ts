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

/**
 * Twenty unit kinds. Each line category raises a base unit and, in larger
 * pushes, an elite one; Berserkers, Clerics, Champions and Dragons come from
 * the shape of the push itself. See STATS in stats.ts and DESIGN.md.
 */
export const Kind = {
  Footman: 0,
  Knight: 1,
  Warden: 2,
  Paladin: 3,
  Archer: 4,
  Ranger: 5,
  Herald: 6,
  Wizard: 7,
  Sapper: 8,
  Trebuchet: 9,
  Outrider: 10,
  GriffinRider: 11,
  Skeleton: 12,
  BoneGolem: 13,
  Mercenary: 14,
  Troll: 15,
  Berserker: 16,
  Cleric: 17,
  Champion: 18,
  Dragon: 19,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export const KIND_COUNT = 20;

/**
 * A player's contribution today, summed over pushes. Every push only adds its
 * change to this ledger, and the army is a function of the ledger, so splitting
 * or squashing the same work raises the same army.
 */
export interface Ledger {
  /** Net counted lines by category; never below zero. */
  lines: number[];
  files: number;
  branches: number;
  churn: number;
  filler: number;
  /** Code lines by purpose, indexed like PURPOSES. */
  purposeCode: number[];
  /** Removed lines by purpose, for refactors and reverts. */
  purposeRemoved: number[];
}

/** What a push is for, read from its commit message. */
export const PURPOSES = ['fix', 'feature', 'refactor', 'perf', 'revert', 'chore', 'work'] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABEL: Record<Purpose, string> = {
  fix: 'Bug fix',
  feature: 'Feature',
  refactor: 'Refactor',
  perf: 'Performance',
  revert: 'Revert',
  chore: 'Chore',
  work: 'Work',
};

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
      /**
       * Change to the player's ledger, by line category. Signed: work that undoes
       * earlier work today (churn) arrives as a negative code delta.
       */
      lines: Lines;
      commits: number;
      msg: string;
      /** Change in how many source files carry counted work today. Signed. */
      files: number;
      /** Change in branch points (if, for, while, case, catch, &&, ||, ?) in counted code: a complexity measure. Signed. */
      branches: number;
      /** Lines that cancelled earlier work today (added then deleted, or rewritten back). */
      churn: number;
      /** Lines left out as filler: duplicates, punctuation-only, and literal tables. */
      filler: number;
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
  /** Distance moved since the last blow; a Knight's charge, or -1 while a charged blow is wound up. */
  run: number;
  /** Tick until which fire slows this unit's regeneration, or -1. */
  scorched: number;
}

export const PlatoonState = { Queued: 0, March: 1, Engage: 2, Hold: 3, Rout: 4 } as const;
export type PlatoonState = (typeof PlatoonState)[keyof typeof PlatoonState];

export interface Platoon {
  id: number;
  p: number;
  repo: number;
  /** 1-based ordinal within the battalion (player + repo) today. */
  ordinal: number;
  /** What the push that raised this platoon was for. */
  purpose: Purpose;
  state: PlatoonState;
  /** The banner: the head of a column, the centre of a line. */
  x: number;
  y: number;
  /** Facing, a unit vector: the march heading in column, toward the threat once deployed. */
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
  /** How it is drawn up: Form.Column, Deploying, Line or Engaged (formation.ts). */
  form: number;
  /** Tick it last changed form. */
  formAt: number;
  /** What the line faces: an enemy platoon id (> 0), -(structure index + 1), or 0 for nothing. */
  threat: number;
  /** Last tick a threat stood within the stand-down radius. */
  threatAt: number;
  /** Soldiers its current layout was drawn up for; -1 when it must be drawn up afresh. */
  formed: number;
  /** Width the ground allowed its line when last drawn up, or 0 for its full width. */
  frontage: number;
  /** Width (across its facing) and length (along it) of its current layout. */
  width: number;
  length: number;
  /** Lateral shift of its line from the banner, to fit the ground. */
  offset: number;
  /** Mean distance of its ground soldiers from their places, last tick. */
  lag: number;
  /** Hex ids still to march through toward `routeSite` (hexroute.ts), nearest first. */
  route: number[];
  /** The site `route` leads to, or -1 when it must be planned afresh. */
  routeSite: number;
  /** Ticks the banner has failed to make headway; past a limit it replans, then follows the flow field. */
  stuck: number;
  /** The road behind the banner as x, y pairs TRAIL_STEP apart, newest first: the column follows it. */
  trail: number[];
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
  /** Times sacked today; each sack is worth less renown than the last. */
  sacked: number;
}

export interface Shot {
  from: number;
  p: number;
  target: number;
  x: number;
  y: number;
  landAt: number;
  damage: number;
  /** ShotKind. */
  kind: number;
  /** Area-damage radius at impact, or 0. */
  splash: number;
  /** Aim point: where splash lands if the target is gone. */
  tx: number;
  ty: number;
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
  /** Today's contribution; the army is a function of it. */
  ledger: Ledger;
  /** Army quality now, from the ledger: scales the HP and damage of all this player's soldiers. */
  quality: number;
  /** Veteran rank now, 0 to 3, from the size of today's contribution. */
  veterancy: number;
  /** Soldiers raised today and not deserted, by kind: what the ledger has paid for so far. */
  raised: number[];
  /** Enemy soldiers slain, by kind. */
  slain: number[];
  kills: number;
  losses: number;
  structureDamage: number;
  monolithDamage: number;
  captures: number;
  sacks: number;
  routs: number;
  /** Pushes by purpose, indexed like PURPOSES. */
  purposes: number[];
  /** Feats for the day's Orders. */
  feats: Feats;
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
  /** Tick its current owner took it, or -1. */
  heldSince: number;
}

/** Battlefield feats tracked for the day's Orders. Deterministic like everything else in the world. */
export interface Feats {
  /** Longest unbroken hold of any one shrine or the Heart, in ticks. */
  holdBest: number;
  /** Enemy platoons that broke with this player's soldiers nearest. */
  routsCaused: number;
  /** Kills while this player's War Cry sounded. */
  cryKills: number;
  /** Routed platoons that made it home and rallied. */
  returns: number;
  heartCaptures: number;
  /** Sites taken from the player then leading in renown. */
  leaderTakes: number;
  /** Kills within reach of this player's own capital. */
  homeKills: number;
  /** Ticks spent leading in renown. */
  ledTicks: number;
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
  /** Soldiers who left because the work that raised them was undone. */
  desertions: { p: number; count: number }[];
  swings: { from: number; to: number }[];
  /** Projectiles. kind: ShotKind. `to` is a unit id, or -(structure + 1). */
  shots: { from: number; to: number; x: number; y: number; land: number; kind: number }[];
  /** A dragon's fire: from the breather toward (tx, ty), reaching `range`. */
  breaths: { from: number; x: number; y: number; tx: number; ty: number; range: number }[];
  /** Area damage landing: fireball bursts, boulder impacts, breath scorch. */
  blasts: { x: number; y: number; radius: number; kind: number }[];
  heals: { from: number; to: number; amount: number }[];
  hits: { unit: number; damage: number; structure: number }[];
  /** `killer` is the slaying player (-1 none, -2 a neutral tower); `by` the slaying kind, or -1. */
  deaths: { unit: number; p: number; kind: Kind; x: number; y: number; killer: number; by: number; platoon: number }[];
  musters: { platoon: number; p: number; queued: boolean }[];
  marches: { platoon: number }[];
  routs: { platoon: number }[];
  disbands: { platoon: number; p: number; repo: number; ordinal: number; x: number; y: number }[];
  captures: { site: number; p: number; previous: number }[];
  sacks: { site: number; p: number; victim: number }[];
  rebuilt: { site: number }[];
  /** A remnant platoon folded into another of the same army; `from` no longer exists. */
  regroups: { from: number; to: number; moved: number }[];
  monolith: { p: number } | null;
  cries: { p: number }[];
  doctrines: { p: number; doctrine: Doctrine }[];
  rallies: { p: number; site: number }[];
  joins: { p: number }[];
  leader: { p: number; previous: number } | null;
  departures: { unit: number }[];
  /** A platoon changed form (Form in formation.ts): a drum or horn cue, a banner raised or dipped. */
  forms: { platoon: number; form: number }[];
}

export const ShotKind = { Arrow: 0, TowerBolt: 1, Fireball: 2, Boulder: 3, RangerArrow: 4 } as const;
export type ShotKind = (typeof ShotKind)[keyof typeof ShotKind];

export const BlastKind = { Fireball: 2, Boulder: 3, Scorch: 5 } as const;
export type BlastKind = (typeof BlastKind)[keyof typeof BlastKind];

export interface WorldSnapshot {
  version: 2;
  world: unknown;
}
