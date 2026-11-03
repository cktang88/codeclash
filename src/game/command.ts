// The chain of command and the morale rules for battle.ts. A General per side reads the field
// every second or so, picks a battle plan and gives every regiment an Order; each regiment's
// Captain carries its order out with what it sees (battle.ts). Morale works much like Total
// War's: every modifier is one entry of MORALE below.
//
// Pure data and small pure helpers; deterministic like the rest of src/game.

import type { FactionId } from './factions.ts';

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
  /**
   * Shocks that come a man or a missile at a time (blows from the flank or rear, charge impact,
   * missiles falling, stones, fugitives taken in) are reckoned as shares of the regiment: each
   * counts for a block of this many men, and for a bigger block in proportion less (until v13 they
   * counted per head, so the bigger blocks of a big battle took several times the shock from the
   * same share of their men hit, and living armies broke ever earlier as battles grew: against the
   * fearless dead, who take no shock, that decided big battles).
   */
  blockMen: 35,
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
  /** Morale a rallied regiment comes back with, plus half the moraleBonus. */
  rallyMorale: 35,
  /** Breaking with less than this share left, or once too often: shattered. */
  shatterBelow: 0.25,
} as const;

/**
 * The undead (battle.ts `fearless`): they never waver, rout or rally, and morale rules pass them
 * by. What holds them together is the Lich-Marshal's will: when he falls, or when the host is
 * spent, it crumbles. Their low hit points (factions.ts) are the price of fearlessness.
 */
export const UNDEAD = {
  /** A crumbling host: every man loses this share of his hit points a second... */
  crumble: 0.02,
  /** ...and fights worse (to attack and defence). */
  crumbleAttack: -4,
  crumbleDefence: -3,
  /**
   * The host is spent (the army breaks, and crumbles) when fewer than this share of its men
   * stand, or fewer than `remnant` against `remnantOdds` times as many: no fear, but not
   * enough of it left to hold the field.
   */
  spent: 0.08,
  remnant: 0.2,
  remnantOdds: 2,
} as const;

/**
 * Rallying and re-forming (battle.ts `thinkRouted`, `rallyOdds`) and fugitives falling in with
 * another regiment of their own kind (`regroup`). The rules and odds follow the "Game rules
 * suggested" of docs/art-references/rout-recovery.md; see docs/art-references/rally.md for how
 * its metres became world units and how often each thing happens in a battle.
 *
 * Distances: the research gives metres (out of contact 100 m, standard < commander 150 m <
 * reserve 300 m, joining 150 m). At the formation scale (about 5 units a metre) those would
 * span the field, so they are compressed, keeping their order: roughly a unit a metre for the
 * near ones, the reserve's 300 m to 240.
 */
export const REGROUP = {
  /**
   * Odds per check (every `check` ticks, 7.5 s) that a broken regiment out of contact rallies, by
   * class (U order: heavy foot, spears, skirmishers, archers, crossbows, light horse, horse
   * archers, knights, shock foot, engines): elite knights 0.35, horse and shock troops (veteran
   * professionals) 0.20, trained foot 0.15, levies and missile men 0.05. A veteran regiment is at
   * least `veteranFloor`, plus `veteranAdd`. Undead never rally (they hold or crumble).
   */
  odds: [0.15, 0.15, 0.05, 0.05, 0.05, 0.2, 0.2, 0.35, 0.2, 0] as readonly number[],
  veteranFloor: 0.2,
  veteranAdd: 0.05,
  /** Ticks between rally checks. */
  check: 20,
  /** Lifts and blows to the odds (see rout-recovery.md 8.4). */
  commander: 0.2,
  standard: 0.15,
  standardLost: -0.15,
  reserve: 0.1,
  enemyHorse: -0.2,
  commanderDead: -0.15,
  /** Per point of the army's moraleBonus. */
  perBonus: 0.01,
  /** Faction flavour: the samurai's lord's uma-jirushi (on top of `commander`), the Templars' Beauséant (any friendly banner within `banner`). */
  samuraiLord: 0.2,
  templarBanner: 0.2,
  banner: 200,
  /**
   * Anchors, world units: the standard stands while at least `share` of the regiment's start
   * (and `minMen`) are within `standardRange` of its centre; the commander within
   * `commanderRange`; a formed (steady, unengaged) friendly regiment within `reserveRange`. A
   * broken regiment rallies only with one of them, and only out of contact: no enemy block
   * within 90 of its edge for 4 s. Enemy horse within `enemyHorseRange` weighs against it.
   */
  standardRange: 110,
  commanderRange: 160,
  reserveRange: 240,
  enemyHorseRange: 200,
  share: 0.3,
  minMen: 6,
  /** Men within this of the centre stop and form; stragglers further off run on. */
  gather: 160,
  /**
   * Rallies a regiment gets: one (a second rout is final). Beyond them it may re-form `extra`
   * more times, at `extraOdds` of the odds and only with its standard standing behind its own line.
   */
  rallies: 1,
  extra: 0,
  extraOdds: 0.5,
  /** Shaken after rallying, ticks: it fights as if wavering and may balk at going forward. */
  shaken: 400,

  /** Fugitives joining another regiment. Ticks between looks: each running man is looked at once in this many ticks. */
  every: 5,
  /** A man must have run this long (ticks) before he can stop: the first panic carries him. */
  minRun: 20,
  /** How near the taking regiment's edge he must be, world units (150 m compressed). */
  reach: 120,
  /** At this share of his class's rally odds (with the lifts above), per check. */
  joinOdds: 0.5,
  /** Same class only; Templars join any regiment of their family (foot line, missile foot, horse). */
  sameClass: true,
  /** Within this share of the taking regiment's radius of its centre: at its standard (`standard` lift). */
  standardNear: 0.6,
  /** Enemies this near him make him run on: the chance times `enemyNearMul`. */
  enemyNear: 40,
  enemyNearMul: 0.25,
  /** Badly hurt (under this share of his hit points): the chance times `hurtMul`. */
  hurt: 0.4,
  hurtMul: 0.5,
  /** A man of a shattered regiment: the chance times this. */
  shatteredMul: 0.5,
  /** Morale the taking regiment loses per man taken in (fugitives bring their fear with them). */
  moraleCost: 0.6,
  /** A regiment takes men in only up to its starting strength times this. */
  room: 1,
  /** Ticks between ticker lines for one regiment taking men in. */
  tellEvery: 150,
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

/**
 * Battle doctrines (docs/faction-doctrines.md): how each faction fights, in numbers. Every army
 * reads its own row; SHARED's values leave the common rules as they are. battle.ts names each
 * doctrine where it applies it (T1..T3 Templar, S1..S3 Samurai, U1..U3 Undead).
 */
export interface Doctrine {
  // T1 The Marshal's charge: the knights wait for one signal, charge one target together, harder,
  // and ride back to the Marshal's banner rather than chase.
  /** The knights wait for the Marshal's signal (and his General never sends them in rashly). */
  signal: boolean;
  /** He gives it when an enemy block locked with our line falls under this morale... */
  signalMorale: number;
  /** ...or at the general charge, or after this tick whatever happens; then again at most every `signalEvery` ticks. */
  signalLate: number;
  signalEvery: number;
  /** A signalled charge hits this much harder (force), and shakes its target this much more. */
  heldCharge: number;
  heldShock: number;
  /** The cycle charge pulls back to this far in front of the Marshal when he is within `recallRange`. */
  recallTo: number;
  recallRange: number;
  /** Knights' chase: at most this far (units) and this long (ticks). */
  knightFar: number;
  knightTired: number;

  // T2 Re-form on the banner: wavering blocks are pulled back to a banner, more than once, and
  // broken ones may re-form at any friendly banner.
  /** Times the General may pull a wavering regiment out of the line. */
  withdrawals: number;
  /** It falls back this far behind the nearest banner within `withdrawBanner` (the Marshal, or a steady regiment of its family); 0: 90 straight back. */
  withdrawBehind: number;
  withdrawBanner: number;
  /** Re-formings beyond the one rally (REGROUP.extra), and whether any friendly banner within REGROUP.banner will do for them (not only its own standard). */
  reforms: number;
  reformAtBanner: boolean;
  /** Ticks a rallied regiment stays shaken (REGROUP.shaken). */
  shaken: number;

  // T3 Not while the Beauséant flies: the professed brothers (Knight-Brothers, Iron Brethren)
  // do not break while the Marshal lives, and take his death harder.
  standFast: boolean;
  /** The general's death: the shock to the brothers, times MORALE.generalDeadShock. */
  brothersGrief: number;

  // S1 The lord's uma-jirushi: a stronger aura reaching further, a heavier blow when he falls,
  // and his hatamoto charge to avenge him.
  /** MORALE.aura, auraRange, generalDeadShock and generalDead, times these. */
  aura: number;
  auraRange: number;
  generalDeadShock: number;
  generalDead: number;
  /** The general's horse (the Knights class) charges the nearest enemy when he falls. */
  revenge: boolean;

  // S2 First spear, long chase.
  /** Chases run this much further and longer, and a block called back may go again this soon (ticks). */
  chaseFar: number;
  chaseTired: number;
  recall: number;
  /** The first block of the line to reach the enemy: morale for it, and for every block of ours within `firstSpearNear`. */
  firstSpear: number;
  firstSpearNear: number;
  firstSpearLift: number;
  /** Heavy foot charges any steady target within this (0: only a wavering one, archers in the open, or at the general charge). */
  keenCharge: number;

  // S3 Drilled teppō fire: the first volley of a block of guns all together (it shakes its
  // target), then rank by rank.
  /** Ranks that fire in turn after the first volley (1: whole volleys). */
  ripple: number;
  /** Morale the first volley of a block of guns costs its target. */
  firstVolley: number;

  // U1 The tide.
  /** Foot marches at FOOT_MARCH times this, unless within `tideNear` of a living Lich-Marshal. */
  tide: number;
  tideNear: number;
  /** The General never holds, refuses a wing, or halts to trade volleys. */
  unhalting: boolean;
  /** Foot's charge, times its speed (FOOT_RUN). */
  footRun: number;

  // U2 Unflinching: charges into them knock men back this much less, stun nobody, and lose
  // their impetus this much faster.
  knockback: number;
  stun: boolean;
  drain: number;

  // U3 What falls, rises.
  /** Ticks between the Lich-Marshal's raisings (0: never). */
  raiseEvery: number;
  /** At most this share of the host's start a raising (at least 1), and never more than `raiseCap`. */
  raiseShare: number;
  raiseCap: number;
  /** Foot of his host fallen within this of him, dead at least `raiseAfter` ticks, rise with this share of their hit points. */
  raiseRange: number;
  raiseAfter: number;
  raiseHp: number;
}

const SHARED: Doctrine = {
  signal: false, signalMorale: 0, signalLate: 0, signalEvery: 0, heldCharge: 1, heldShock: 1, recallTo: 0, recallRange: 0, knightFar: Infinity, knightTired: Infinity,
  withdrawals: 1, withdrawBehind: 0, withdrawBanner: 0, reforms: 0, reformAtBanner: false, shaken: 400,
  standFast: false, brothersGrief: 1,
  aura: 1, auraRange: 1, generalDeadShock: 1, generalDead: 1, revenge: false,
  chaseFar: 1, chaseTired: 1, recall: 120, firstSpear: 0, firstSpearNear: 0, firstSpearLift: 0, keenCharge: 0,
  ripple: 1, firstVolley: 0,
  tide: 1, tideNear: 0, unhalting: false, footRun: 1.45,
  knockback: 1, stun: true, drain: 1,
  raiseEvery: 0, raiseShare: 0, raiseCap: 0, raiseRange: 0, raiseAfter: 0, raiseHp: 0,
};

export const DOCTRINE: Record<FactionId, Doctrine> = {
  templar: { ...SHARED },
  samurai: { ...SHARED },
  undead: {
    ...SHARED,
    // U1 The tide: slow and even, faster only near the Lich-Marshal; never halting, a lurch for a charge.
    tide: 0.8, tideNear: 240, unhalting: true, footRun: 1.15,
    // U2 Unflinching: a charge into them barely knocks them back, stuns nobody, and stalls sooner.
    knockback: 0.3, stun: false, drain: 1.3,
  },
};
