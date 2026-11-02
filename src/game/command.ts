// The chain of command and the morale rules for battle.ts. A General per side reads the field
// every second or so, picks a battle plan and gives every regiment an Order; each regiment's
// Captain carries its order out with what it sees (battle.ts). Morale works much like Total
// War's: every modifier is one entry of MORALE below.
//
// Pure data and small pure helpers; deterministic like the rest of src/game.

/** What a General can tell a regiment to do. */
export type OrderKind = 'hold' | 'advance' | 'attack' | 'flank' | 'charge' | 'skirmish' | 'support' | 'reserve' | 'withdraw' | 'pursue';

export interface Order {
  kind: OrderKind;
  /** Enemy regiment to attack, flank or charge, or -1. */
  target: number;
  /** For attack and flank: 0 the target's front, 1 and 2 its flanks, 3 its rear. */
  side: number;
  /** For support and reserve: the friendly regiment to stand behind or help, or -1. */
  friend: number;
  /** For hold, advance, reserve and withdraw: where to go (NaN: stay where it is). */
  x: number;
  y: number;
  /** Tick it was given. */
  at: number;
}

export const newOrder = (kind: OrderKind = 'hold', at = 0): Order => ({ kind, target: -1, side: 0, friend: -1, x: NaN, y: NaN, at });

/**
 * steady: fights as it should. wavering: fights worse and may refuse orders to attack.
 * broken: routing for its own edge; it may rally. rallying: just rallied, re-forming (fights
 * like a wavering regiment for a few seconds). shattered: broke for good and leaves the field.
 * Must match the renderer's MoraleState in src/client/render/scene.ts.
 */
export type MoraleState = 'steady' | 'wavering' | 'broken' | 'rallying' | 'shattered';

/** Battle plans a General chooses from. */
export type Plan =
  /** Stand and let our missiles work; counter-attack when they come. */
  | 'hold'
  /** The whole line goes forward together. */
  | 'advance'
  /** Hold back the weaker wing and overload the other with the reserve and the horse. */
  | 'refuse'
  /** Cavalry on both wings rides round to take the enemy in flank and rear. */
  | 'envelop'
  /** The infantry pins the enemy line (the anvil) and the knights hit its rear (the hammer). */
  | 'hammer';
export const PLANS: readonly Plan[] = ['hold', 'advance', 'refuse', 'envelop', 'hammer'];

export type Personality = 'aggressive' | 'cautious' | 'cunning';
export const PERSONALITIES: readonly Personality[] = ['aggressive', 'cautious', 'cunning'];

/**
 * A hook for the player's Commander trait (city side, not wired yet). Each nudges the General:
 * iron-discipline: +8 morale for every regiment and wavering men never refuse orders;
 * hawk-eyed: reads the field without misjudging it (no noise in its estimates);
 * reckless-valour: always aggressive, commits the reserve early, the general fights in person;
 * old-fox: always cunning and never blunders into a bad plan.
 */
export type CommanderTrait = 'iron-discipline' | 'hawk-eyed' | 'reckless-valour' | 'old-fox';

/**
 * Morale, per regiment, every half second. Morale settles toward a target (base minus the
 * situation) at `recover` per think; shocks (charges, the general's death, routs nearby) knock
 * it at once. All the numbers are morale points out of 100.
 */
export const MORALE = {
  /** Start: the class's morale plus the army's moraleBonus, and: */
  veteran: 6,
  /** Classes whose base morale is at least 80 (knights, shock foot): elite. */
  elite: 5,
  /** Classes whose base morale is under 55 (javelins, archers): levies, and green. */
  levy: -4,
  /** Per share of the regiment lost so far (0..1). */
  casualtiesTotal: 38,
  /** Per share of the regiment lost in the last few seconds (decaying): the rate matters more. */
  casualtyRate: 240,
  /** Per enemy man in contact beyond 1.2 for each of ours, capped at 16. */
  outnumbered: 9,
  outnumberedCap: 16,
  /** Each blow from the flank or rear adds to a decaying shock, capped. */
  flankBlow: 0.35,
  rearBlow: 0.8,
  flankCap: 40,
  /** Charge impact received, per man hit: rear, flank, front (times the charge's force). */
  chargeRear: 1.1,
  chargeFlank: 0.7,
  chargeFront: 0.35,
  /** The army's spirits on the day: up to this much either way, for every regiment. */
  mood: 12,
  /** The general alive within `auraRange` (scaled 0.8..1.1 by his skill). */
  aura: 10,
  auraRange: 240,
  /** The general dead: a shock to every regiment, and a lasting malus. */
  generalDeadShock: 20,
  generalDead: 14,
  /** A friendly regiment breaking within 150: shock. */
  friendRout: 7,
  /** An enemy regiment breaking within 250: a lift. */
  enemyRout: 5,
  /** Per share of the army's value lost beyond `armyLossFrom` (half as much lift for the enemy). */
  armyLoss: 45,
  armyLossFrom: 0.25,
  /** The enemy army has broken. */
  enemyBroken: 30,
  /** Killing faster than dying in the last few seconds, at most. */
  winning: 10,
  /** Per missile falling on it lately (decaying), and how much worse for green troops. */
  missileFear: 1.2,
  greenFear: 1.6,
  /** At full fatigue. */
  fatigue: 16,
  /** Share of the gap to the target closed per think. */
  recover: 0.12,
  /** Below this a regiment wavers (back to steady 8 above it), below `breakAt` it breaks. */
  waverAt: 30,
  breakAt: 12,
  /** Wavering: to attack and defence. */
  waverAttack: -6,
  waverDefence: -4,
  /** Chance per think that a wavering regiment refuses an order to go forward. */
  refuse: 0.35,
  /** Rally: chance per think once out of contact, and the lift from the general nearby. */
  rallyChance: 0.12,
  rallyNearGeneral: 0.15,
  /** Per point of moraleBonus. */
  rallyPerBonus: 0.01,
  /** Morale a rallied regiment comes back with, plus half the moraleBonus. */
  rallyMorale: 35,
  /** Breaking with less than this share left, or once too often: shattered. */
  shatterBelow: 0.25,
} as const;

/** Mode of a regiment counts as running for fatigue. */
export const FATIGUE = {
  run: 0.011,
  fight: 0.005,
  rest: -0.012,
  /** At full fatigue: attack and defence lost, and pace lost (share). */
  combat: 8,
  pace: 0.25,
} as const;
