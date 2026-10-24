import { Cat, Kind, TICKS_PER_SECOND, TICKS_PER_MINUTE } from './api.ts';

export type Tier = 'base' | 'elite' | 'special' | 'hero' | 'legend';

export interface UnitStats {
  name: string;
  plural: string;
  /** One line for the legend and tooltips. */
  role: string;
  tier: Tier;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  cooldown: number;
  aggro: number;
  ranged: boolean;
  /** Renown for killing one. */
  value: number;
  /** Formation rank: lower marches in front. */
  rank: number;
  /** How a push raises this kind, for the legend. */
  source: string;
  /** Platoon slots this kind occupies. */
  slots: number;
  /** Flies over water, rock and the press of soldiers. */
  flying: boolean;
  /** Radius of area damage around the point of impact, or 0. */
  splash: number;
  /** Breathes fire in a cone instead of striking one target. */
  breath: boolean;
  /** HP regained per tick. */
  regen: number;
  /** HP restored to one wounded ally per cast, or 0. */
  heal: number;
  /** Render radius in world units. */
  size: number;
}

const base = { flying: false, splash: 0, breath: false, regen: 0, heal: 0 };

export const STATS: readonly UnitStats[] = [
  { ...base, name: 'Footman', plural: 'Footmen', role: 'Spear and shield; the backbone of every army', tier: 'base', hp: 110, damage: 11, range: 13, speed: 1.6, cooldown: 6, aggro: 110, ranged: false, value: 1, rank: 1, source: 'Any code: whatever of the budget the specialists leave (more code and more files touched)', slots: 1, size: 6 },
  { ...base, name: 'Knight', plural: 'Knights', role: 'Armored lancer; charges and tramples', tier: 'elite', hp: 240, damage: 22, range: 14, speed: 2.4, cooldown: 7, aggro: 140, ranged: false, value: 4, rank: 1, source: 'Complex code: 2·√(branch points ÷ 10)', slots: 2, size: 9 },
  { ...base, name: 'Warden', plural: 'Wardens', role: 'Tower shield; allies nearby take less damage', tier: 'base', hp: 190, damage: 6, range: 13, speed: 1.3, cooldown: 7, aggro: 100, ranged: false, value: 2, rank: 0, source: 'Tests (support): up to 4, from √(test lines)', slots: 1, size: 7 },
  { ...base, name: 'Paladin', plural: 'Paladins', role: 'Holy guardian; shields and mends the line', tier: 'elite', hp: 320, damage: 14, range: 14, speed: 1.4, cooldown: 7, aggro: 110, ranged: false, value: 5, rank: 0, source: 'Bug fixes: one per 150 lines of fix code', slots: 2, heal: 6, size: 9 },
  { ...base, name: 'Archer', plural: 'Archers', role: 'Longbow volleys from behind the line', tier: 'base', hp: 55, damage: 8, range: 95, speed: 1.6, cooldown: 8, aggro: 125, ranged: true, value: 1, rank: 3, source: 'Comments (support): up to 3, from √(comment lines)', slots: 1, size: 5 },
  { ...base, name: 'Ranger', plural: 'Rangers', role: 'Elven marksman; long range, deadly aim', tier: 'elite', hp: 90, damage: 13, range: 125, speed: 1.9, cooldown: 7, aggro: 145, ranged: true, value: 3, rank: 3, source: 'Bug fixes: one per 250 lines of fix code', slots: 2, size: 6 },
  { ...base, name: 'Herald', plural: 'Heralds', role: 'Banner bearer; heals and steadies morale', tier: 'base', hp: 80, damage: 4, range: 13, speed: 1.6, cooldown: 8, aggro: 90, ranged: false, value: 2, rank: 3, source: 'Docs (support): one per 120 lines, up to 2', slots: 1, size: 6 },
  { ...base, name: 'Wizard', plural: 'Wizards', role: 'Hurls fireballs that burst among the enemy', tier: 'elite', hp: 85, damage: 20, range: 120, speed: 1.4, cooldown: 14, aggro: 150, ranged: true, value: 5, rank: 4, source: 'Performance work: up to 4, from √(perf code)', slots: 2, splash: 28, size: 7 },
  { ...base, name: 'Sapper', plural: 'Sappers', role: 'Siege engineer; wrecks walls and towers', tier: 'base', hp: 90, damage: 10, range: 14, speed: 1.5, cooldown: 8, aggro: 100, ranged: false, value: 1, rank: 2, source: 'Config and CI (support): one per 80 lines, up to 3', slots: 1, size: 6 },
  { ...base, name: 'Trebuchet', plural: 'Trebuchets', role: 'Siege engine; flings stones across the field', tier: 'elite', hp: 260, damage: 34, range: 175, speed: 0.8, cooldown: 30, aggro: 170, ranged: true, value: 5, rank: 5, source: 'Sweeping changes: one per 15 files touched, up to 3', slots: 3, splash: 22, size: 12 },
  { ...base, name: 'Outrider', plural: 'Outriders', role: 'Light cavalry that hunts archers and casters', tier: 'base', hp: 120, damage: 15, range: 13, speed: 3.2, cooldown: 6, aggro: 160, ranged: false, value: 2, rank: 4, source: 'Refactors, especially deleted code', slots: 1, size: 8 },
  { ...base, name: 'Griffin Rider', plural: 'Griffin Riders', role: 'Swoops over any terrain onto the backline', tier: 'elite', hp: 200, damage: 20, range: 14, speed: 3.6, cooldown: 6, aggro: 150, ranged: false, value: 5, rank: 5, source: 'Big refactors: one per 400 refactor lines removed, up to 3', slots: 2, flying: true, size: 11 },
  { ...base, name: 'Skeleton', plural: 'Skeletons', role: 'Brittle undead, raised again by reverts', tier: 'base', hp: 70, damage: 6, range: 13, speed: 1.3, cooldown: 8, aggro: 90, ranged: false, value: 1, rank: 0, source: 'Reverts: √(reverted lines); the undead return', slots: 1, size: 6 },
  { ...base, name: 'Bone Golem', plural: 'Bone Golems', role: 'A lumbering heap of bones that soaks up blows', tier: 'elite', hp: 520, damage: 14, range: 16, speed: 0.9, cooldown: 10, aggro: 90, ranged: false, value: 4, rank: 0, source: 'Big reverts: one per 600 lines, up to 2', slots: 3, size: 12 },
  { ...base, name: 'Mercenary', plural: 'Mercenaries', role: 'Hired blade; leaves when the contract ends', tier: 'base', hp: 130, damage: 16, range: 13, speed: 1.8, cooldown: 6, aggro: 120, ranged: false, value: 2, rank: 1, source: 'Chores and dependency bumps: up to 3', slots: 1, size: 6 },
  { ...base, name: 'Troll', plural: 'Trolls', role: 'Hulking brute of tangled logic; regenerates its wounds', tier: 'elite', hp: 600, damage: 24, range: 16, speed: 1.2, cooldown: 9, aggro: 110, ranged: false, value: 6, rank: 0, source: 'Very complex code: one per 150 branch points once past 200 code lines, up to 3', slots: 3, regen: 1.2, size: 13 },
  { ...base, name: 'Berserker', plural: 'Berserkers', role: 'Untested, uncommented fury; hits hard, dies fast', tier: 'special', hp: 120, damage: 26, range: 13, speed: 2.1, cooldown: 5, aggro: 130, ranged: false, value: 2, rank: 1, source: 'Untested, uncommented code: a third of the Footmen, each taking two places', slots: 1, size: 6 },
  { ...base, name: 'Cleric', plural: 'Clerics', role: 'Raised by bug fixes; mends the wounded', tier: 'special', hp: 90, damage: 5, range: 13, speed: 1.5, cooldown: 10, aggro: 110, ranged: false, value: 3, rank: 3, source: 'Bug fixes: √(fix code) ÷ 2.5', slots: 1, heal: 22, size: 6 },
  { ...base, name: 'Champion', plural: 'Champions', role: 'Hero of a big push; steadies all around it', tier: 'hero', hp: 520, damage: 26, range: 16, speed: 1.5, cooldown: 7, aggro: 140, ranged: false, value: 10, rank: 2, source: 'Big features: one per 400 feature lines and 5 files, up to 3', slots: 2, size: 10 },
  { ...base, name: 'Dragon', plural: 'Dragons', role: 'Legendary; breathes fire across whole ranks', tier: 'legend', hp: 2400, damage: 24, range: 70, speed: 2.0, cooldown: 10, aggro: 150, ranged: true, value: 30, rank: 6, source: 'Legendary features: 900+ lines, 10+ files, 90+ branch points', slots: 6, flying: true, breath: true, size: 22 },
];

/** Bonus multiplier when `attacker` strikes `victim`. */
export function matchup(attacker: Kind, victim: Kind): number {
  const v = STATS[victim]!;
  switch (attacker) {
    case Kind.Footman:
    case Kind.Knight:
      return victim === Kind.Outrider || victim === Kind.Knight ? 1.6 : 1;
    case Kind.Archer:
    case Kind.Ranger:
      if (v.flying) return 1.8;
      return victim === Kind.Skeleton || victim === Kind.Mercenary || victim === Kind.Berserker ? 1.4 : victim === Kind.Warden || victim === Kind.Paladin ? 0.5 : 1;
    case Kind.Outrider:
    case Kind.GriffinRider:
      return v.ranged || victim === Kind.Herald || victim === Kind.Sapper || victim === Kind.Cleric ? 1.6 : 1;
    case Kind.Paladin:
      return victim === Kind.Skeleton || victim === Kind.BoneGolem ? 2 : 1;
    case Kind.Troll:
    case Kind.BoneGolem:
      return v.tier === 'base' ? 1.3 : 1;
    case Kind.Champion:
      return v.tier === 'legend' || v.tier === 'hero' ? 1.5 : 1;
    default:
      return 1;
  }
}

export const MELEE_WINDUP = 1;
export const ARROW_SPEED = 45;
export const FOREST_SPEED = 0.6;
export const FOREST_ARROW_FACTOR = 0.5;

export const WARDEN_AURA = 40;
export const WARDEN_REDUCTION = 0.3;
export const HERALD_AURA = 50;
export const HERALD_HEAL = 0.5;
export const CHAMPION_AURA = 60;
export const CHAMPION_BONUS = 0.2;
export const SAPPER_STRUCTURE = 6;
export const TREBUCHET_STRUCTURE = 2;
export const HOME_TURF = 220;
export const HOME_TURF_REDUCTION = 0.2;
export const MERCENARY_CONTRACT = 10 * TICKS_PER_MINUTE;
export const TROLL_CONTRACT = 20 * TICKS_PER_MINUTE;

const HOUR = 60 * TICKS_PER_MINUTE;

/** A capital's walls before its holder's work today raises them. */
export const CAPITAL_HP = 12000;
/** Wall HP added for every platoon slot of army its holder's work has raised today. */
export const WALL_PER_SLOT = 150;
/** A capital's tower: a volley every 4 s; see TOWER_PER. */
export const CAPITAL_TOWER = { damage: 20, range: 160, cooldown: 20 };
/** A capital's tower looses one more bolt each volley for every this many foes within its reach. */
export const TOWER_PER = 8;
/** A captured capital's walls stand again at this share of their new holder's full walls. */
export const CAPTURE_HP = 0.5;
/** Renown for capturing a capital: this for its first capture today, then `CAPTURE_RENOWN / n` for the n-th. */
export const CAPTURE_RENOWN = 120;
/** Each capital held beyond your own home multiplies your army's budget (and its field cap) by this much more. */
export const CONQUEST_BONUS = 0.25;
/** A war's length when its params name none: a day. */
export const DAY_TICKS = 24 * HOUR;
/**
 * The pace of the sieges, as shares of the war's length (its `ticks`), so a short war (a new room's
 * first, a test day, the demo) paces like a full day. No walls can be breached before SIEGE_OPENS of
 * the war (09:36 of a day): the morning is for the border forts. Walls then fall no faster than over
 * BREACH of the war (thirty minutes of a day) times a ramp that grows from nothing when the sieges
 * open, as the square of the time since, to full at SIEGE_FULL (16:48), so the earliest a full
 * capital can fall to an unbroken siege is about 58% of the way through the war (14:00), and a siege
 * laid later falls sooner after it is laid. A founder's home is barred besides, until BARRED_GRACE
 * after its founder's first push or BARRED_UNTIL, whichever comes first: no one is conquered in
 * their sleep. A capital that has changed hands is never barred.
 */
export const SIEGE_OPENS = 0.4;
export const SIEGE_FULL = 0.7;
export const BREACH = 1 / 48;
export const BARRED_GRACE = 0.08;
export const BARRED_UNTIL = 0.65;

/** The siege timetable of a war `ticks` long, in ticks. */
export interface Pacing {
  ticks: number;
  /** No walls fall before this tick. */
  opens: number;
  /** The ramp on breaching is full from this tick. */
  full: number;
  /** At full pace, walls fall no faster than over this many ticks. */
  breach: number;
  /** A founder's gates stay barred until this long after its first push... */
  grace: number;
  /** ...or until this tick, whichever comes first. */
  barredUntil: number;
}

const pacings = new Map<number, Pacing>();

export function pacing(ticks: number | undefined): Pacing {
  const t = ticks !== undefined && Number.isFinite(ticks) && ticks >= 1 ? Math.floor(ticks) : DAY_TICKS;
  let p = pacings.get(t);
  if (!p) {
    p = {
      ticks: t,
      opens: Math.floor(t * SIEGE_OPENS),
      full: Math.floor(t * SIEGE_FULL),
      breach: Math.max(1, Math.floor(t * BREACH)),
      grace: Math.floor(t * BARRED_GRACE),
      barredUntil: Math.floor(t * BARRED_UNTIL),
    };
    if (pacings.size > 16) pacings.clear();
    pacings.set(t, p);
  }
  return p;
}

/** The share of full pace walls may fall at, at `tick`: 0 before the sieges open, rising as a square to 1 at `full`. */
export function breachPace(pc: Pacing, tick: number): number {
  if (tick < pc.opens) return 0;
  if (tick >= pc.full || pc.full <= pc.opens) return 1;
  const r = (tick - pc.opens) / (pc.full - pc.opens);
  return r * r;
}
/** A siege ends once no foe has stood at the walls for this long. */
export const SIEGE_QUIET = 30 * TICKS_PER_SECOND;
/** HP a capital's masons restore per second once no siege is on. */
export const CAPITAL_REPAIR = 10;
/** Share of a holding's renown paid while its owner has no soldiers near it. */
export const UNGARRISONED_SHARE = 0.25;

export const MAX_ALIVE = 2000;
export const PLAYER_ALIVE = 160;
export const QUEUE_LIMIT = 24;
export const PLATOON_MAX = 32;

export const MORALE_MAX = 100;
export const MORALE_LOSS = 150;
export const MORALE_RALLY = 60;
export const MORALE_RECOVER = 0.15;
export const OUTNUMBERED_DRAIN = 0.4;
export const CHAMPION_MORALE_FLOOR = 1;

export const CAPTURE_TICKS = 10 * TICKS_PER_SECOND;
export const COUNCIL_PERIOD = 3 * TICKS_PER_SECOND;
export const SPACING = 11;
