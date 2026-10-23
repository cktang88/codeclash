import { CAT_COUNT, Cat, Kind, KIND_COUNT, type Lines, type Purpose } from './api.ts';
import { PLATOON_MAX, STATS } from './stats.ts';

export const HOURLY_FREE_PUSHES = 3;
export const DAILY_FREE_PUSHES = 12;

const at = (lines: Lines, c: number) => {
  const n = lines[c];
  return typeof n === 'number' && n > 0 ? n : 0;
};

/** Most lines one category of one push can count; keeps arithmetic finite. */
export const MAX_LINES = 1e9;

/**
 * A push's line counts as the simulation sees them: nine whole, non-negative,
 * finite numbers. Live inputs and replayed ones pass through this, so a stray
 * fraction, NaN or Infinity can never make them disagree.
 */
export function cleanLines(lines: unknown): number[] {
  const out = new Array<number>(CAT_COUNT).fill(0);
  if (!Array.isArray(lines)) return out;
  for (let c = 0; c < CAT_COUNT; c++) {
    const n: unknown = lines[c];
    if (typeof n === 'number' && n > 0) out[c] = Math.floor(Math.min(n, MAX_LINES));
  }
  return out;
}

// Conventional-commit prefixes first, then common words. Order matters: a
// "revert" of a fix is a revert, and "fix typo in docs" is still a fix.
const PURPOSE_RULES: readonly [Purpose, RegExp][] = [
  ['revert', /^revert\b|^this reverts commit/i],
  ['fix', /^(fix|hotfix|bugfix)(\(.*?\))?!?:|\b(fix(e[sd]|ing)?|bug|crash(es|ing)?|regression|hotfix|patch(es|ed)?)\b/i],
  ['perf', /^perf(\(.*?\))?!?:|\b(perf(ormance)?|optimi[sz](e[sd]?|ation)|faster|speed ?up)\b/i],
  ['refactor', /^refactor(\(.*?\))?!?:|\b(refactor(ed|ing)?|clean ?up|simplif(y|ied)|restructur(e|ed)|extract(ed)?|remove[sd]?|delete[sd]?|dead code)\b/i],
  ['chore', /^(chore|ci|build|deps?|style)(\(.*?\))?!?:|\b(bump(s|ed)?|upgrade[sd]?|dependenc(y|ies)|lockfile|release v?\d)\b/i],
  ['feature', /^feat(ure)?(\(.*?\))?!?:|\b(add(s|ed)?|implement(s|ed)?|introduce[sd]?|support(s|ed)?|new|enable[sd]?)\b/i],
];

/** What a push is for, from the first line of its newest commit message. */
export function purposeOf(msg: string): Purpose {
  const head = (msg.split('\n')[0] ?? '').trim();
  for (const [purpose, re] of PURPOSE_RULES) if (re.test(head)) return purpose;
  return 'work';
}

export function slotsOf(counts: readonly number[]): number {
  let n = 0;
  for (let k = 0; k < KIND_COUNT; k++) n += (counts[k] ?? 0) * STATS[k]!.slots;
  return n;
}

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(Math.min(n, MAX_LINES)) : 0);

/**
 * Soldiers raised by one push, by kind. Code is what raises an army: Footmen
 * come from code lines and source files touched, and what the push is for
 * (fix, feature, refactor, perf, revert, chore) and how complex it is decide
 * the specialists. Tests, comments, docs and config add a little support;
 * generated and vendored code raise nothing. `pushesLastHour` and `pushesToday`
 * count this player's earlier pushes, excluding this one.
 */
export function musterCounts(
  lines: Lines,
  pushesLastHour: number,
  pushesToday: number,
  msg = '',
  filesTouched = 0,
  branchPoints = 0,
): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  const fatigue = pushesToday >= DAILY_FREE_PUSHES ? 1 / 3 : pushesLastHour >= HOURLY_FREE_PUSHES ? 0.5 : 1;
  const purpose = purposeOf(msg);
  const code = at(lines, Cat.Code);
  const removed = at(lines, Cat.Removed);
  const files = whole(filesTouched);
  const branches = whole(branchPoints);
  const set = (k: Kind, n: number) => (counts[k] = Math.max(0, Math.floor(n)));

  if (purpose === 'revert') {
    set(Kind.Skeleton, Math.min(8, Math.max(1, Math.floor(Math.sqrt(code + removed) / 2))));
    if (code + removed >= 500) set(Kind.BoneGolem, 1);
  } else {
    if (code > 0) set(Kind.Footman, Math.min(12, Math.max(1, Math.floor(0.5 * Math.sqrt(code)) + Math.min(6, files))));
    set(Kind.Knight, Math.min(4, Math.floor(branches / 15)));
    if (branches >= 40 && code >= 200) set(Kind.Troll, 1);
    if (removed > 0) set(Kind.Outrider, Math.min(3, Math.floor(removed / 150)));
    switch (purpose) {
      case 'fix':
        set(Kind.Cleric, Math.min(3, 1 + Math.floor(files / 3)));
        if (files >= 3 || code >= 40) set(Kind.Paladin, code + removed >= 150 && files >= 4 ? 2 : 1);
        set(Kind.Ranger, Math.min(2, Math.floor(code / 60)));
        break;
      case 'feature':
        set(Kind.Footman, Math.min(14, Math.round(counts[Kind.Footman]! * 1.25)));
        break;
      case 'refactor':
        set(Kind.Footman, counts[Kind.Footman]! / 2);
        set(Kind.Outrider, Math.min(8, Math.floor(0.5 * Math.sqrt(removed + code / 2))));
        if (removed >= 300 && files >= 6) set(Kind.GriffinRider, 1);
        break;
      case 'perf':
        set(Kind.Wizard, Math.min(3, 1 + Math.floor(branches / 20)));
        break;
      case 'chore':
        set(Kind.Footman, Math.min(2, counts[Kind.Footman]!));
        set(Kind.Mercenary, files > 3 ? 2 : 1);
        break;
    }
    if (files >= 12) set(Kind.Trebuchet, 1);
    if (purpose !== 'fix' && code >= 50 && at(lines, Cat.Test) === 0 && at(lines, Cat.Comment) === 0) {
      const berserk = Math.floor(counts[Kind.Footman]! / 2);
      counts[Kind.Footman]! -= berserk;
      set(Kind.Berserker, berserk);
    }
  }

  // Support from the rest of the push stays small: code is what wins wars.
  set(Kind.Warden, Math.min(3, Math.floor(Math.sqrt(at(lines, Cat.Test)) / 4)));
  set(Kind.Archer, Math.min(2, Math.floor(at(lines, Cat.Comment) / 40)));
  if (at(lines, Cat.Docs) >= 60 || at(lines, Cat.Docs) + at(lines, Cat.Comment) >= 80) set(Kind.Herald, 1);
  set(Kind.Sapper, Math.min(2, Math.floor(at(lines, Cat.Config) / 50)));

  if (fatigue < 1) for (let k = 0; k < KIND_COUNT; k++) counts[k] = Math.floor(counts[k]! * fatigue);
  else if (purpose !== 'chore' && purpose !== 'revert') {
    const legendary = code >= 600 && files >= 8 && branches >= 60 && (purpose === 'feature' || purpose === 'work');
    if (legendary) set(Kind.Dragon, 1);
    else if (code >= 300 && files >= 5) set(Kind.Champion, 1);
  }

  // Trim the cheapest soldiers first until the platoon fits; heroes stay.
  let slots = slotsOf(counts);
  while (slots > PLATOON_MAX) {
    let cheap = -1;
    for (let k = 0; k < KIND_COUNT; k++) {
      if (counts[k] === 0 || k === Kind.Champion || k === Kind.Dragon) continue;
      if (cheap < 0 || STATS[k]!.value < STATS[cheap]!.value || (STATS[k]!.value === STATS[cheap]!.value && counts[k]! > counts[cheap]!)) cheap = k;
    }
    if (cheap < 0) break;
    counts[cheap]!--;
    slots -= STATS[cheap]!.slots;
  }
  // Every push sends at least a messenger.
  if (slots === 0) counts[Kind.Footman] = 1;
  return counts;
}
