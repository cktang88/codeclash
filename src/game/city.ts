// The commandery: a player's city for one week.
//
// A city is never stored. It is a pure function of the week's work (each push's credited effort,
// in the order the server received it) and of the player's daily battles. Work raises buildings;
// buildings train soldiers at a steady hourly rate; fresh work also calls up a levy at once.
// At each daily battle the soldiers trained since the last one march out as that day's army.
// At the end of the week every soldier trained that week, less the dead the Hospital could not
// save, fights the Grand Battle, and then the city is razed and the next week begins.

import { addToTally, creditOf, emptyTally, emptyWork, workQuality, type DayTally, type TallyDelta, type Work } from '../measure/credit.ts';
import { emptyCounts, total, U, UNIT_COUNT, type Counts, type UnitClass } from './units.ts';

export const HOUR = 3_600_000;
export const DAYS_PER_WEEK = 7;

export type BuildingKey = 'barracks' | 'range' | 'stables' | 'workshop' | 'chapter' | 'granary' | 'hospital' | 'walls';

export interface BuildingDef {
  key: BuildingKey;
  /** What feeds it, for the UI. */
  fedBy: string;
  /** What it does, for the UI. */
  effect: string;
  /** Soldiers it trains: class and soldiers per hour per level. */
  trains: readonly [UnitClass, number][];
  /** Experience a slice of credited work earns it. */
  xp: (w: Work) => number;
}

export const BUILDINGS: readonly BuildingDef[] = [
  {
    key: 'barracks', fedBy: 'Code you write (and the difficulty bonus, at half)', effect: 'Trains heavy infantry and spearmen',
    trains: [[U.HeavyInfantry, 0.6], [U.Spearmen, 0.6]], xp: (w) => w.code + 0.5 * w.bonus,
  },
  {
    key: 'range', fedBy: 'Logic: branches, functions and links (complexity)', effect: 'Trains archers, crossbowmen and skirmishers',
    trains: [[U.Archers, 0.5], [U.Crossbowmen, 0.3], [U.Skirmishers, 0.4]], xp: (w) => 3 * w.complexity,
  },
  {
    key: 'stables', fedBy: 'Refactoring: removed lines, and files touched', effect: 'Trains light cavalry and horse archers',
    trains: [[U.LightCavalry, 0.25], [U.HorseArchers, 0.2]], xp: (w) => w.removed + 10 * w.files,
  },
  {
    key: 'workshop', fedBy: 'Hard work: the difficulty bonus and new functions', effect: 'Builds mangonels and arms the iron brethren',
    trains: [[U.Shock, 0.1], [U.Artillery, 0.02]], xp: (w) => w.bonus + 4 * w.functions,
  },
  {
    key: 'chapter', fedBy: 'Docs and comments', effect: 'Knights the brothers; leaders steady the whole army’s morale',
    trains: [[U.Knights, 0.15]], xp: (w) => w.docs + w.comments,
  },
  {
    key: 'granary', fedBy: 'Showing up: its level is your streak of days at work', effect: 'Feeds the city: every building trains faster for each day in a row you push',
    trains: [], xp: () => 0,
  },
  {
    key: 'hospital', fedBy: 'Tests', effect: 'Nurses the fallen of daily battles back for the Grand Battle',
    trains: [], xp: (w) => w.tests,
  },
  {
    key: 'walls', fedBy: 'Tests and config', effect: 'Pavises against missiles; stakes against the charge',
    trains: [], xp: (w) => 0.6 * w.tests + 0.3 * w.config,
  },
];
export const BUILDING_INDEX: Record<BuildingKey, number> = Object.fromEntries(BUILDINGS.map((b, i) => [b.key, i])) as Record<BuildingKey, number>;

export const MAX_LEVEL = 20;
/** Experience for level L is 100·L²: twice the level takes four times the work. */
export const XP_PER_LEVEL_SQ = 100;
export function levelOf(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / XP_PER_LEVEL_SQ)));
}
export function xpForLevel(level: number): number {
  return XP_PER_LEVEL_SQ * level * level;
}

/** Credited code (or removed) lines that make a day count as active. */
export const ACTIVE_DAY_LINES = 50;
/** Production for each day of the streak after the first (the Fields' level is the streak). */
export const STREAK_STEP = 0.07;
/** Missed days a week forgiven before the streak suffers; each further miss halves it. */
export const STREAK_GRACE = 1;
/** A day whose lord did not push musters only this share of the men trained that day. */
export const IDLE_MUSTER = 0.4;
/** Production boon for each daily battle won this week, for at most WIN_BOON_CAP wins. */
export const WIN_BOON = 0.05;
export const WIN_BOON_CAP = 4;
/**
 * Daily fatigue: credited code past DAY_KNEE lines in a day earns buildings and levy only DAY_OVER
 * of its worth, so a firehose day or a weekly cram cannot outrun steady work.
 */
export const DAY_KNEE = 1000;
export const DAY_OVER = 0.3;
const knee = (x: number) => Math.min(x, DAY_KNEE) + DAY_OVER * Math.max(0, x - DAY_KNEE);
/** Share of the daily dead nursed back for the Grand Battle, before and per Hospital level, and at most. */
export const RECOVERY = { base: 0.4, perLevel: 0.025, max: 0.9 } as const;
/** Missile damage turned by pavises per Walls level, at most; stakes from this level. */
export const PAVISE = { perLevel: 0.02, max: 0.4, stakesFrom: 3 } as const;
/** Morale per Chapter House level. */
export const MORALE_PER_CHAPTER = 1.5;
/** Morale for each daily victory this week (counted up to WIN_BOON_CAP): men who have won expect to win. */
export const MORALE_PER_WIN = 2;
/** Morale for each day of the streak (counted up to 7): a lord who shows up every day is trusted. */
export const MORALE_PER_STREAK_DAY = 1;
/** Morale per Hospital level: men fight harder knowing the wounded are cared for. */
export const MORALE_PER_HOSPITAL = 0.5;

/**
 * Levy: soldiers called up at once by fresh work, per unit of credited work. A strong day's work
 * puts men in today's battle even before the buildings catch up.
 */
export const LEVY = { code: 0.12, bonus: 0.05, complexity: 0.04, removed: 0.05, support: 0.03 } as const;

export function levyOf(w: Work): number {
  return LEVY.code * w.code + LEVY.bonus * w.bonus + LEVY.complexity * w.complexity + LEVY.removed * w.removed + LEVY.support * (w.tests + w.docs + w.comments + w.config);
}

/** One push as the game sees it: its signed tally change, and when the server received it. */
export interface WorkEvent {
  at: number;
  delta: TallyDelta;
  /** For the city's log. */
  repo?: string;
  message?: string;
}

/** A daily battle the player fought, as the city needs it. */
export interface DailyOutcome {
  /** Day index 0..6 of the week. */
  day: number;
  won: boolean;
  /** Soldiers lost for good in it, per class (before the Hospital). */
  dead: Counts;
  /** Survivors per class (veterans, when it was won). */
  survivors: Counts;
}

export interface CityInput {
  weekStart: number;
  dayMs: number;
  now: number;
  events: readonly WorkEvent[];
  outcomes: readonly DailyOutcome[];
}

export interface BuildingState {
  key: BuildingKey;
  xp: number;
  level: number;
  /** 0..1 toward the next level. */
  progress: number;
}

export interface CityLogEntry {
  at: number;
  kind: 'levelup' | 'levy' | 'idle' | 'battle';
  text: string;
  building?: BuildingKey;
  level?: number;
  men?: number;
}

export interface CityState {
  at: number;
  /** Day index 0..6 (7 once the week is over). */
  day: number;
  buildings: BuildingState[];
  /** Soldiers trained per hour right now, per class, everything applied. */
  ratePerHour: Counts;
  /** Production multiplier right now: streak and win boons. */
  pace: number;
  granaryBonus: number;
  boonBonus: number;
  /** No push yet today: tonight only part of today's garrison would muster. */
  idle: boolean;
  /** Days in a row with work, counting today once it has work (the Fields' level). */
  streak: number;
  /** Men trained today who will stay home unless the lord pushes before the battle. */
  waiting: number;
  wins: number;
  /** Armies of the daily battles fought so far, and today's army so far. */
  cohorts: Counts[];
  today: Counts;
  /** Soldiers levied today so far (part of `today`). */
  todayLevy: number;
  /** Everything trained this week, the fallen, and who the Hospital saved. */
  produced: Counts;
  dead: Counts;
  recovered: Counts;
  veterans: Counts;
  recovery: number;
  pavise: number;
  stakes: boolean;
  moraleBonus: number;
  todayWork: Work;
  weekWork: Work;
  activeDays: number;
  log: CityLogEntry[];
}

function addWork(a: Work, b: Work): void {
  for (const k of Object.keys(a) as (keyof Work)[]) if (k !== 'filler') a[k] += b[k];
}

function diffWork(after: Work, before: Work): Work {
  const out = emptyWork();
  for (const k of Object.keys(out) as (keyof Work)[]) out[k] = after[k] - before[k];
  return out;
}

/**
 * The city at `input.now` (clamped to the week). Deterministic: the same events and outcomes give
 * the same city on the server and in every browser.
 */
export function cityAt(input: CityInput): CityState {
  const { weekStart, dayMs } = input;
  const weekEnd = weekStart + DAYS_PER_WEEK * dayMs;
  const now = Math.max(weekStart, Math.min(weekEnd, input.now));
  const hourScale = dayMs / (24 * HOUR); // DAY_MINUTES test cycles compress the day; production follows.
  const events = input.events.filter((e) => e.at >= weekStart && e.at < now).slice().sort((a, b) => a.at - b.at);
  const outcomes = new Map(input.outcomes.map((o) => [o.day, o]));

  const xp = new Array<number>(BUILDINGS.length).fill(0);
  const levels = new Array<number>(BUILDINGS.length).fill(0);
  let dayXpFloor = xp.slice();
  const acc = new Array<number>(UNIT_COUNT).fill(0); // fractional soldiers trained this day
  const levyAcc = new Array<number>(UNIT_COUNT).fill(0);
  let levyMen = 0;
  const cohorts: Counts[] = [];
  const produced = emptyCounts();
  const dead = emptyCounts();
  const recovered = emptyCounts();
  const veterans = emptyCounts();
  const log: CityLogEntry[] = [];
  let wins = 0;
  let activeDays = 0;
  let streak = 0;
  let misses = 0;
  // Men trained so far this day: mustered in full at the battle only if the lord pushed that day.
  const dayAcc = new Array<number>(UNIT_COUNT).fill(0);
  let tally: DayTally = emptyTally();
  let dayCredit = emptyWork();
  let todayWork = emptyWork();
  const weekWork = emptyWork();
  let dayActive = false;
  let day = 0;

  const pace = () => {
    const run = Math.max(0, streak + (dayActive ? 1 : 0) - 1);
    const granary = STREAK_STEP * run;
    const boon = WIN_BOON * Math.min(wins, WIN_BOON_CAP);
    return { granary, boon, idle: !dayActive, value: (1 + boon) * (1 + granary) };
  };
  const rates = (): Counts => {
    const out = emptyCounts();
    const p = pace().value;
    BUILDINGS.forEach((b, i) => {
      for (const [k, r] of b.trains) out[k]! += r * levels[i]! * p;
    });
    return out;
  };
  /** Trains soldiers from t0 to t1 at constant rates. */
  const train = (t0: number, t1: number) => {
    if (t1 <= t0) return;
    const r = rates();
    const hours = (t1 - t0) / (HOUR * hourScale);
    for (let k = 0; k < UNIT_COUNT; k++) dayAcc[k]! += r[k]! * hours;
  };
  const setLevels = (t: number, cause: string) => {
    BUILDINGS.forEach((b, i) => {
      const L = levelOf(xp[i]!);
      if (L > levels[i]!) log.push({ at: t, kind: 'levelup', building: b.key, level: L, text: `${cause} raised it to level ${L}` });
      levels[i] = L;
    });
  };
  /** Weights for spreading a levy across classes: what the city trains, never nothing. */
  const levyWeights = (): Counts => {
    const w = emptyCounts();
    BUILDINGS.forEach((b, i) => {
      for (const [k, r] of b.trains) w[k]! += r * (levels[i]! + 0.5);
    });
    return w;
  };
  const closeDay = (k: number) => {
    if (!dayActive && total(dayAcc) > 0) log.push({ at: weekStart + (k + 1) * dayMs, kind: 'idle', text: `No push today: only ${Math.round(IDLE_MUSTER * 100)}% of the garrison mustered` });
    for (let c = 0; c < UNIT_COUNT; c++) {
      acc[c]! += dayAcc[c]! * (dayActive ? 1 : IDLE_MUSTER);
      dayAcc[c] = 0;
    }
    if (dayActive) streak++;
    else if (++misses > STREAK_GRACE) streak = Math.floor(streak / 2);
    const cohort = emptyCounts();
    for (let c = 0; c < UNIT_COUNT; c++) {
      const whole = Math.floor(acc[c]! + levyAcc[c]!);
      cohort[c] = Math.max(0, whole);
      // Carry the fractions so nothing is lost to rounding across days.
      const frac = acc[c]! + levyAcc[c]! - whole;
      acc[c] = Math.max(0, frac);
      levyAcc[c] = 0;
      produced[c]! += cohort[c]!;
    }
    cohorts.push(cohort);
    levyMen = 0;
    const o = outcomes.get(k);
    if (o) {
      if (o.won) wins++;
      for (let c = 0; c < UNIT_COUNT; c++) {
        dead[c]! += Math.min(cohort[c]!, Math.max(0, Math.floor(o.dead[c] ?? 0)));
        if (o.won) veterans[c]! += Math.min(cohort[c]!, Math.max(0, Math.floor(o.survivors[c] ?? 0)));
      }
      log.push({ at: weekStart + (k + 1) * dayMs, kind: 'battle', text: o.won ? 'Victory: survivors are veterans, and the city’s output rises' : 'Defeat' });
    }
    tally = emptyTally();
    dayCredit = emptyWork();
    todayWork = emptyWork();
    dayXpFloor = xp.slice();
    dayActive = false;
  };

  let t = weekStart;
  let i = 0;
  while (day < DAYS_PER_WEEK) {
    const dayEnd = weekStart + (day + 1) * dayMs;
    const next = i < events.length ? events[i]!.at : Infinity;
    const stop = Math.min(next, dayEnd, now);
    train(t, stop);
    t = stop;
    // The day's battle has been fought once its end is reached: its army is cut there.
    if (t === dayEnd && dayEnd <= now) {
      closeDay(day);
      day++;
      continue;
    }
    if (t >= now) break;
    {
      const e = events[i++]!;
      const before = dayCredit;
      addToTally(tally, e.delta);
      const q0 = workQuality(tally).quality;
      const after = creditOf(tally);
      dayCredit = after;
      const d = diffWork(after, before);
      // Daily fatigue on code past the knee.
      const m = d.code > 0 ? (knee(after.code) - knee(before.code)) / d.code : before.code >= DAY_KNEE ? DAY_OVER : 1;
      const q = q0 * m;
      addWork(todayWork, d);
      addWork(weekWork, d);
      BUILDINGS.forEach((b, bi) => {
        const gain = b.xp(d);
        // Undone work takes back XP at the rate today's work earned it (earned / raw so far), so
        // pushing and undoing the same lines over and over cannot farm the quality bonus.
        const raw0 = b.xp(before);
        const got = gain > 0 ? gain * q : raw0 > 0 ? (gain * (xp[bi]! - dayXpFloor[bi]!)) / raw0 : 0;
        xp[bi] = Math.max(dayXpFloor[bi]!, xp[bi]! + got);
      });
      if (!dayActive && after.code + after.removed >= ACTIVE_DAY_LINES) {
        dayActive = true;
        activeDays++;
      }
      setLevels(e.at, e.message ? `“${e.message}”` : 'A push');
      // The levy: fresh work calls men up at once (undone work sends them home again, today only).
      // Like XP, undone work sends men home at the rate today's work called them up.
      const lv = levyOf(d);
      const lv0 = levyOf(before);
      const men = lv > 0 ? lv * q : lv0 > 0 ? (lv * levyMen) / lv0 : 0;
      if (men !== 0) {
        const w = levyWeights();
        const sum = w.reduce((a, b) => a + b, 0);
        const take = Math.max(-levyMen, men);
        // Men sent home leave every class in proportion to who answered today (the levels, and so the
        // weights, may have changed since), so none are stranded by the clamp at zero.
        const keep = take < 0 && levyMen > 0 ? (levyMen + take) / levyMen : 1;
        for (let c = 0; c < UNIT_COUNT; c++) levyAcc[c] = take < 0 ? levyAcc[c]! * keep : levyAcc[c]! + (take * w[c]!) / sum;
        levyMen += take;
        if (take >= 1) log.push({ at: e.at, kind: 'levy', men: Math.floor(take), text: `${Math.floor(take)} men answered the call` });
      }
    }
  }

  const recovery = Math.min(RECOVERY.max, RECOVERY.base + RECOVERY.perLevel * levels[BUILDING_INDEX.hospital]!);
  for (let c = 0; c < UNIT_COUNT; c++) recovered[c] = Math.floor(dead[c]! * recovery);
  const today = emptyCounts();
  let waiting = 0;
  for (let c = 0; c < UNIT_COUNT; c++) {
    today[c] = Math.floor(acc[c]! + levyAcc[c]! + dayAcc[c]! * (dayActive ? 1 : IDLE_MUSTER));
    if (!dayActive) waiting += dayAcc[c]! * (1 - IDLE_MUSTER);
  }
  const p = pace();
  const walls = levels[BUILDING_INDEX.walls]!;
  return {
    at: now,
    day,
    buildings: BUILDINGS.map((b, bi) => {
      if (b.key === 'granary') return { key: b.key, xp: 0, level: Math.min(MAX_LEVEL, streak + (dayActive ? 1 : 0)), progress: 0 };
      const L = levels[bi]!;
      const lo = xpForLevel(L);
      const hi = xpForLevel(L + 1);
      return { key: b.key, xp: Math.floor(xp[bi]!), level: L, progress: L >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (xp[bi]! - lo) / (hi - lo))) };
    }),
    ratePerHour: rates(),
    pace: p.value,
    granaryBonus: p.granary,
    boonBonus: p.boon,
    idle: p.idle,
    streak: streak + (dayActive ? 1 : 0),
    waiting: Math.floor(waiting),
    wins,
    cohorts,
    today: day < DAYS_PER_WEEK ? today : emptyCounts(),
    todayLevy: Math.floor(levyMen),
    produced,
    dead,
    recovered,
    veterans,
    recovery,
    pavise: Math.min(PAVISE.max, PAVISE.perLevel * walls),
    stakes: walls >= PAVISE.stakesFrom,
    moraleBonus:
      MORALE_PER_CHAPTER * levels[BUILDING_INDEX.chapter]! +
      MORALE_PER_HOSPITAL * levels[BUILDING_INDEX.hospital]! +
      MORALE_PER_WIN * Math.min(wins, WIN_BOON_CAP) +
      MORALE_PER_STREAK_DAY * Math.min(7, streak + (dayActive ? 1 : 0)),
    todayWork,
    weekWork,
    activeDays,
    log,
  };
}

/** The army for the Grand Battle: everything trained this week, less the dead not saved. */
export function grandArmy(city: CityState): { counts: Counts; veterans: Counts } {
  const counts = emptyCounts();
  const vets = emptyCounts();
  for (let c = 0; c < UNIT_COUNT; c++) {
    counts[c] = Math.max(0, city.produced[c]! - city.dead[c]! + city.recovered[c]!);
    vets[c] = Math.min(counts[c]!, city.veterans[c]!);
  }
  return { counts, veterans: vets };
}
