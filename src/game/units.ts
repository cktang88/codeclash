// Unit classes. Every faction fields the same ten classes; a faction only renames them and
// nudges a few stats (factions.ts), the way factions differ in a Total War game.

export const U = {
  HeavyInfantry: 0,
  Spearmen: 1,
  Skirmishers: 2,
  Archers: 3,
  Crossbowmen: 4,
  LightCavalry: 5,
  HorseArchers: 6,
  Knights: 7,
  Shock: 8,
  Artillery: 9,
} as const;
export type UnitClass = (typeof U)[keyof typeof U];
export const UNIT_COUNT = 10;
export const UNIT_KEYS = ['heavyInfantry', 'spearmen', 'skirmishers', 'archers', 'crossbowmen', 'lightCavalry', 'horseArchers', 'knights', 'shock', 'artillery'] as const;
export type UnitKey = (typeof UNIT_KEYS)[number];

export type Role = 'line' | 'missile' | 'skirmish' | 'flank' | 'shock-cav' | 'horse-archer' | 'siege';

export interface UnitStats {
  role: Role;
  mounted: boolean;
  hp: number;
  /** Melee attack and defence, roughly 0..80. */
  attack: number;
  defence: number;
  /** Damage per landed blow, before armour. */
  damage: number;
  /** Armour 0..100: damage taken is scaled by 50 / (50 + armour). */
  armour: number;
  /** Shield: chance to stop a missile from the front. */
  shield: number;
  /** Added to attack and damage for a moment after contact at speed. */
  charge: number;
  /** Damage multiplier against mounted targets. */
  antiCav: number;
  /** World units per second. */
  speed: number;
  /** Collision radius and push weight. */
  radius: number;
  mass: number;
  /** Ticks between blows. */
  meleeCooldown: number;
  /** Missiles: range in world units, damage, ticks between shots, shots carried, projectile speed. */
  range: number;
  missileDamage: number;
  reload: number;
  ammo: number;
  projectileSpeed: number;
  /** Armour ignored by its missiles, 0..1. */
  pierce: number;
  /** Morale it starts with, 0..100. */
  morale: number;
  /** How much a soldier of this class is worth when weighing strength. */
  value: number;
}

const base = {
  mounted: false, shield: 0, charge: 0, antiCav: 1, range: 0, missileDamage: 0, reload: 0, ammo: 0, projectileSpeed: 0, pierce: 0,
} as const;

export const STATS: readonly UnitStats[] = [
  // HeavyInfantry: sword and kite shield, mail and plate. The anvil of the line.
  { ...base, role: 'line', hp: 60, attack: 34, defence: 42, damage: 11, armour: 55, shield: 0.55, speed: 22, radius: 2.4, mass: 1.2, meleeCooldown: 9, morale: 70, value: 1.4 },
  // Spearmen: long spears, light armour; they break charges.
  { ...base, role: 'line', hp: 45, attack: 28, defence: 36, damage: 9, armour: 30, shield: 0.35, antiCav: 2.4, speed: 24, radius: 2.3, mass: 1, meleeCooldown: 9, morale: 60, value: 1 },
  // Skirmishers: javelins, then run.
  { ...base, role: 'skirmish', hp: 32, attack: 18, defence: 14, damage: 7, armour: 10, speed: 34, radius: 2.1, mass: 0.8, meleeCooldown: 10, range: 70, missileDamage: 14, reload: 26, ammo: 5, projectileSpeed: 110, pierce: 0.3, morale: 45, value: 0.8 },
  // Archers: light bows, long range, volume of fire.
  { ...base, role: 'missile', hp: 34, attack: 16, defence: 14, damage: 6, armour: 12, speed: 26, radius: 2.1, mass: 0.8, meleeCooldown: 10, range: 175, missileDamage: 8, reload: 22, ammo: 24, projectileSpeed: 160, pierce: 0.1, morale: 50, value: 0.9 },
  // Crossbowmen: slower, shorter, punches through plate; pavise on the back.
  { ...base, role: 'missile', hp: 42, attack: 20, defence: 20, damage: 7, armour: 32, shield: 0.25, speed: 22, radius: 2.2, mass: 0.9, meleeCooldown: 10, range: 145, missileDamage: 15, reload: 44, ammo: 18, projectileSpeed: 190, pierce: 0.55, morale: 55, value: 1.2 },
  // LightCavalry: fast lances; hunt archers and engines, run down the routed.
  { ...base, role: 'flank', mounted: true, hp: 70, attack: 30, defence: 22, damage: 11, armour: 25, shield: 0.3, charge: 18, speed: 62, radius: 3.4, mass: 3, meleeCooldown: 9, morale: 60, value: 2.2 },
  // HorseArchers: shoot and ride away.
  { ...base, role: 'horse-archer', mounted: true, hp: 62, attack: 18, defence: 18, damage: 7, armour: 18, speed: 66, radius: 3.4, mass: 2.6, meleeCooldown: 10, range: 130, missileDamage: 8, reload: 26, ammo: 22, projectileSpeed: 150, pierce: 0.15, morale: 55, value: 2.2 },
  // Knights: the hammer. Barded destriers, couched lances.
  { ...base, role: 'shock-cav', mounted: true, hp: 110, attack: 44, defence: 38, damage: 16, armour: 70, shield: 0.5, charge: 45, speed: 52, radius: 3.8, mass: 4.5, meleeCooldown: 9, morale: 85, value: 4.5 },
  // Shock: the heaviest foot, poleaxes and full plate. Slow, terrifying.
  { ...base, role: 'line', hp: 120, attack: 48, defence: 40, damage: 20, armour: 80, shield: 0, charge: 10, speed: 18, radius: 2.9, mass: 2.4, meleeCooldown: 12, morale: 90, value: 4 },
  // Artillery: an engine and its crew, hurling stones from the rear.
  { ...base, role: 'siege', hp: 90, attack: 6, defence: 6, damage: 4, armour: 20, speed: 8, radius: 4.5, mass: 8, meleeCooldown: 14, range: 330, missileDamage: 46, reload: 140, ammo: 30, projectileSpeed: 95, pierce: 0.5, morale: 50, value: 9 },
];

/** Counts per unit class. */
export type Counts = number[];
export const emptyCounts = (): Counts => new Array<number>(UNIT_COUNT).fill(0);
export const total = (c: readonly number[]): number => c.reduce((a, b) => a + b, 0);
export const addCounts = (a: readonly number[], b: readonly number[]): Counts => a.map((n, i) => n + (b[i] ?? 0));
