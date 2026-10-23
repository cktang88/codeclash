import { Cat, Doctrine, Kind, TICKS_PER_SECOND, TICKS_PER_MINUTE } from './api.ts';

export interface UnitStats {
  name: string;
  plural: string;
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
  /** Line category that raises this kind, or -1 for the Champion. */
  raisedBy: number;
}

export const STATS: readonly UnitStats[] = [
  { name: 'Legionary', plural: 'Legionaries', hp: 100, damage: 11, range: 13, speed: 1.6, cooldown: 6, aggro: 110, ranged: false, value: 1, rank: 1, raisedBy: Cat.Code },
  { name: 'Warden', plural: 'Wardens', hp: 190, damage: 6, range: 13, speed: 1.3, cooldown: 7, aggro: 100, ranged: false, value: 2, rank: 0, raisedBy: Cat.Test },
  { name: 'Archer', plural: 'Archers', hp: 55, damage: 8, range: 95, speed: 1.6, cooldown: 8, aggro: 125, ranged: true, value: 1, rank: 3, raisedBy: Cat.Comment },
  { name: 'Herald', plural: 'Heralds', hp: 80, damage: 4, range: 13, speed: 1.6, cooldown: 8, aggro: 90, ranged: false, value: 2, rank: 3, raisedBy: Cat.Docs },
  { name: 'Sapper', plural: 'Sappers', hp: 90, damage: 8, range: 14, speed: 1.5, cooldown: 8, aggro: 100, ranged: false, value: 1, rank: 2, raisedBy: Cat.Config },
  { name: 'Outrider', plural: 'Outriders', hp: 95, damage: 13, range: 13, speed: 3.2, cooldown: 6, aggro: 160, ranged: false, value: 2, rank: 4, raisedBy: Cat.Removed },
  { name: 'Golem', plural: 'Golems', hp: 150, damage: 5, range: 14, speed: 1.0, cooldown: 9, aggro: 80, ranged: false, value: 1, rank: 0, raisedBy: Cat.Generated },
  { name: 'Mercenary', plural: 'Mercenaries', hp: 115, damage: 14, range: 13, speed: 1.8, cooldown: 6, aggro: 120, ranged: false, value: 2, rank: 1, raisedBy: Cat.Vendor },
  { name: 'Champion', plural: 'Champions', hp: 520, damage: 26, range: 16, speed: 1.5, cooldown: 7, aggro: 140, ranged: false, value: 10, rank: 2, raisedBy: -1 },
];

/** Bonus multiplier when `attacker` strikes `victim`. */
export function matchup(attacker: Kind, victim: Kind): number {
  switch (attacker) {
    case Kind.Legionary:
      return victim === Kind.Outrider ? 1.6 : 1;
    case Kind.Archer:
      return victim === Kind.Legionary || victim === Kind.Golem || victim === Kind.Mercenary ? 1.4 : victim === Kind.Warden ? 0.5 : 1;
    case Kind.Outrider:
      return victim === Kind.Archer || victim === Kind.Herald || victim === Kind.Sapper ? 1.6 : 1;
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
export const HOME_TURF = 220;
export const HOME_TURF_REDUCTION = 0.2;
export const MERCENARY_CONTRACT = 10 * TICKS_PER_MINUTE;

export const DOCTRINE_COOLDOWN = 60 * TICKS_PER_MINUTE;
export const RALLY_COOLDOWN = 30 * TICKS_PER_MINUTE;
export const RALLY_DURATION = 120 * TICKS_PER_MINUTE;
export const CRY_DURATION = 60 * TICKS_PER_SECOND;
export const CRY_DAMAGE = 1.3;
export const CRY_SPEED = 1.25;

export const DOCTRINE_NAMES = ['Balanced', 'Assault', 'Hold', 'Siege', 'Skirmish'] as const;

export function doctrineDamage(d: Doctrine): number {
  return d === Doctrine.Assault ? 1.15 : 1;
}
export function doctrineSpeed(d: Doctrine): number {
  return d === Doctrine.Skirmish ? 1.2 : 1;
}
export function doctrineStructure(d: Doctrine): number {
  return d === Doctrine.Siege ? 1.5 : 1;
}
export const HOLD_REDUCTION = 0.2;
export const HOLD_RADIUS = 200;

export const CAPITAL_HP = 5000;
export const CAPITAL_TOWER = { damage: 14, range: 150, cooldown: 5 };
export const MONOLITH_TOWER = { damage: 30, range: 140, cooldown: 3 };
export const SACK_RUIN_TICKS = 10 * TICKS_PER_MINUTE;
export const SACK_REBUILD = 0.6;
export const SACK_RENOWN = 200;

export function monolithHp(members: number): number {
  return 30000 + 10000 * Math.max(1, members);
}

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
export const HEART_CAPTURE_TICKS = 30 * TICKS_PER_SECOND;
export const COUNCIL_PERIOD = 3 * TICKS_PER_SECOND;
export const SPACING = 11;
