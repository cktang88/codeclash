// The long loops: Orders, Glory and Rank, the Armory, legends, seasons and
// Deeds. All rewards here are cosmetic or social; none feeds back into power,
// and none depends on how code was counted beyond the day's results.

import { Kind, TICKS_PER_MINUTE, type PlayerState } from '../sim/api.ts';
import { EMBLEMS, PATTERNS, hash32, type Emblem, type Pattern } from './heraldry.ts';
import type { Digest, DigestPlayer } from './digest.ts';

// ------------------------------------------------------------------ Orders

export interface OrderDef {
  id: string;
  title: string;
  /** Progress toward the goal, from the player's day so far. */
  measure: (p: PlayerState) => number;
  goal: number;
  /** How to show progress: a count, or minutes. */
  unit: 'count' | 'minutes';
}

const minutes = (ticks: number) => Math.floor(ticks / TICKS_PER_MINUTE);

export const ORDERS: readonly OrderDef[] = [
  { id: 'slay-40', title: 'Your soldiers slay 40 foes', measure: (p) => p.kills, goal: 40, unit: 'count' },
  { id: 'slay-120', title: 'Your soldiers slay 120 foes', measure: (p) => p.kills, goal: 120, unit: 'count' },
  { id: 'hold-10', title: 'Hold a border fort for 10 minutes', measure: (p) => minutes(p.feats.holdBest), goal: 10, unit: 'minutes' },
  { id: 'hold-45', title: 'Hold a border fort for 45 minutes', measure: (p) => minutes(p.feats.holdBest), goal: 45, unit: 'minutes' },
  { id: 'stand', title: 'Hold your walls through a 20-minute siege', measure: (p) => minutes(p.feats.standBest), goal: 20, unit: 'minutes' },
  { id: 'rout-3', title: 'Rout three enemy platoons', measure: (p) => p.feats.routsCaused, goal: 3, unit: 'count' },
  { id: 'conquer', title: 'Storm a capital', measure: (p) => p.conquests, goal: 1, unit: 'count' },
  { id: 'regiment', title: 'One platoon of yours slays 20 foes', measure: (p) => p.best?.[2] ?? 0, goal: 20, unit: 'count' },
  { id: 'veteran', title: 'Field a veteran army', measure: (p) => p.veterancy, goal: 1, unit: 'count' },
  { id: 'return', title: 'Bring a broken platoon home alive', measure: (p) => p.feats.returns, goal: 1, unit: 'count' },
  { id: 'two-capitals', title: 'Hold two capitals at once', measure: (p) => p.capitals, goal: 2, unit: 'count' },
  { id: 'retake', title: 'Retake a fallen home', measure: (p) => p.feats.retakes, goal: 1, unit: 'count' },
  { id: 'defend', title: 'Slay 20 foes beneath your own walls', measure: (p) => p.feats.homeKills, goal: 20, unit: 'count' },
  { id: 'forts-3', title: 'Take three border forts', measure: (p) => p.captures, goal: 3, unit: 'count' },
  { id: 'giant', title: 'Fell a Champion or a Dragon', measure: (p) => p.slain[Kind.Champion]! + p.slain[Kind.Dragon]!, goal: 1, unit: 'count' },
  { id: 'lead', title: 'Lead in renown for 15 minutes', measure: (p) => minutes(p.feats.ledTicks), goal: 15, unit: 'minutes' },
  { id: 'siege', title: 'Deal 8,000 damage to walls', measure: (p) => Math.floor(p.structureDamage), goal: 8000, unit: 'count' },
];

export const ORDERS_PER_DAY = 3;
export const ORDER_GLORY = 50;

/** A small seeded generator; the same war and user always draw the same Orders. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's three Orders for a player, drawn without repeats. Same order kinds (two slay goals) never pair up. */
export function drawOrders(warSeed: number, userId: number): OrderDef[] {
  const next = rng(hash32(`${warSeed}:${userId}`));
  const deck = ORDERS.slice();
  const out: OrderDef[] = [];
  while (out.length < ORDERS_PER_DAY && deck.length > 0) {
    const order = deck.splice(Math.floor(next() * deck.length), 1)[0]!;
    const family = order.id.split('-')[0]!;
    if (out.some((o) => o.id.split('-')[0] === family)) continue;
    out.push(order);
  }
  return out;
}

export interface OrderProgress {
  id: string;
  title: string;
  value: number;
  goal: number;
  unit: OrderDef['unit'];
  done: boolean;
}

export function orderProgress(order: OrderDef, player: PlayerState): OrderProgress {
  const value = Math.max(0, order.measure(player));
  return { id: order.id, title: order.title, value: Math.min(value, order.goal), goal: order.goal, unit: order.unit, done: value >= order.goal };
}

// ----------------------------------------------------------- Glory and Rank

export const RANKS = [
  { title: 'Squire', glory: 0 },
  { title: 'Man-at-Arms', glory: 200 },
  { title: 'Knight', glory: 600 },
  { title: 'Banneret', glory: 1500 },
  { title: 'Baron', glory: 3000 },
  { title: 'Marshal', glory: 6000 },
  { title: 'Warlord', glory: 12000 },
  { title: 'Legend', glory: 25000 },
] as const;

export interface RankInfo {
  glory: number;
  /** 0 for Squire up to 7 for Legend. */
  rank: number;
  title: string;
  /** Glory the next rank needs, or null at the top. */
  next: number | null;
}

export function rankOf(glory: number): RankInfo {
  let rank = 0;
  while (rank + 1 < RANKS.length && glory >= RANKS[rank + 1]!.glory) rank++;
  return { glory, rank, title: RANKS[rank]!.title, next: rank + 1 < RANKS.length ? RANKS[rank + 1]!.glory : null };
}

export const PLACE_GLORY = [100, 60, 40];
export const FOUGHT_GLORY = 20;
export const AWARD_GLORY = 30;
export const STREAK_GLORY = 10;

export interface GloryGrant {
  source: 'place' | 'fought' | 'award' | 'streak';
  amount: number;
  note: string;
}

/** Glory for one player's day, from its digest. Orders are granted as they are fulfilled. */
export function dayGlory(pl: DigestPlayer, streak: number): GloryGrant[] {
  const grants: GloryGrant[] = [];
  const fought = pl.pushes > 0 || pl.kills > 0;
  if (!fought) return grants;
  const place = PLACE_GLORY[pl.place - 1];
  if (place !== undefined && pl.renown > 0) grants.push({ source: 'place', amount: place, note: `Placed ${ordinal(pl.place)}` });
  else grants.push({ source: 'fought', amount: FOUGHT_GLORY, note: 'Fought the day through' });
  for (const a of pl.awards) grants.push({ source: 'award', amount: AWARD_GLORY, note: a });
  if (streak > 1) grants.push({ source: 'streak', amount: STREAK_GLORY * Math.min(streak, 7), note: `${streak}-day streak` });
  return grants;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

// -------------------------------------------------------------- the Armory

export const KEEPS = ['stone', 'timber', 'citadel'] as const;
export const TRIMS = ['none', 'studs', 'filigree', 'ermine'] as const;
export const FANFARES = ['horn', 'drums', 'choir'] as const;
export type Keep = (typeof KEEPS)[number];
export type Trim = (typeof TRIMS)[number];
export type Fanfare = (typeof FANFARES)[number];

/** A player's chosen heraldry: how their standard, capital and soldiers look. Cosmetic only. */
export interface Heraldry {
  pattern: Pattern;
  emblem: Emblem;
  keep: Keep;
  trim: Trim;
  fanfare: Fanfare;
  tassel: boolean;
  /** A herald's title shown beside the player's name, or null. */
  title: string | null;
}

export const DEFAULT_HERALDRY: Heraldry = { pattern: 'plain', emblem: 'star', keep: 'stone', trim: 'none', fanfare: 'horn', tassel: false, title: null };

type Slot = 'pattern' | 'emblem' | 'keep' | 'trim' | 'fanfare' | 'tassel' | 'title';

/** The rank each cosmetic unlocks at. Anything not listed is available from the start. */
const UNLOCK: Partial<Record<Slot, Record<string, number>>> = {
  pattern: { plain: 0, chevron: 0, pale: 1, fess: 1, bend: 2, chief: 2, saltire: 3, quarterly: 4 },
  emblem: { star: 0, tower: 0, key: 1, leaf: 1, sun: 2, moon: 2, anchor: 3, bolt: 3, eye: 4, wing: 4, flame: 5, crown: 6 },
  keep: { stone: 0, timber: 2, citadel: 5 },
  trim: { none: 0, studs: 1, filigree: 3, ermine: 6 },
  fanfare: { horn: 0, drums: 2, choir: 4 },
  tassel: { false: 0, true: 1 },
};

/** Titles a player may show: their rank titles so far, plus one per Deed earned. */
export function titlesFor(rank: number, deeds: readonly string[]): string[] {
  const out: string[] = RANKS.slice(1, rank + 1).map((r) => r.title);
  for (const id of deeds) {
    const deed = DEEDS.find((d) => d.id === id);
    if (deed?.title) out.push(deed.title);
  }
  return out;
}

export interface ArmoryItem {
  slot: Slot;
  value: string;
  rank: number;
  unlocked: boolean;
}

export function armoryCatalog(rank: number): ArmoryItem[] {
  const items: ArmoryItem[] = [];
  const add = (slot: Slot, values: readonly string[]) => {
    for (const value of values) {
      const need = UNLOCK[slot]?.[value] ?? 0;
      items.push({ slot, value, rank: need, unlocked: rank >= need });
    }
  };
  add('pattern', PATTERNS);
  add('emblem', EMBLEMS);
  add('keep', KEEPS);
  add('trim', TRIMS);
  add('fanfare', FANFARES);
  add('tassel', ['false', 'true']);
  return items;
}

/** Applies a requested change, keeping only choices the player has unlocked. Returns the resulting heraldry and what was refused. */
export function chooseHeraldry(current: Heraldry, request: Partial<Heraldry>, rank: number, titles: readonly string[]): { heraldry: Heraldry; refused: string[] } {
  const next: Heraldry = { ...current };
  const refused: string[] = [];
  const pick = <K extends Exclude<Slot, 'title'>>(slot: K, values: readonly string[], value: unknown) => {
    if (value === undefined) return;
    const v = String(value);
    if (!values.includes(v) || (UNLOCK[slot]?.[v] ?? 0) > rank) {
      refused.push(slot);
      return;
    }
    (next as unknown as Record<string, unknown>)[slot] = slot === 'tassel' ? v === 'true' : v;
  };
  pick('pattern', PATTERNS, request.pattern);
  pick('emblem', EMBLEMS, request.emblem);
  pick('keep', KEEPS, request.keep);
  pick('trim', TRIMS, request.trim);
  pick('fanfare', FANFARES, request.fanfare);
  pick('tassel', ['false', 'true'], request.tassel === undefined ? undefined : String(request.tassel));
  if (request.title !== undefined) {
    if (request.title === null || titles.includes(request.title)) next.title = request.title;
    else refused.push('title');
  }
  return { heraldry: next, refused };
}

export function parseHeraldry(json: string | null): Heraldry {
  if (!json) return { ...DEFAULT_HERALDRY };
  try {
    return { ...DEFAULT_HERALDRY, ...(JSON.parse(json) as Partial<Heraldry>) };
  } catch {
    return { ...DEFAULT_HERALDRY };
  }
}

// ------------------------------------------------------------------ legends

const NAMES = [
  'Brannoc', 'Aldric', 'Isolde', 'Maelis', 'Corwen', 'Ysolt', 'Gareth', 'Rowena', 'Tamsin', 'Oswin', 'Edda', 'Hrothgar',
  'Sigrun', 'Aveline', 'Cador', 'Morwen', 'Talorc', 'Elowen', 'Bertrand', 'Ragna', 'Leofric', 'Ismay', 'Duncan', 'Wynn',
];
const EPITHETS = [
  'the Unbowed', 'the Steadfast', 'Ironhand', 'the Grey', 'of the Long Watch', 'Oathkeeper', 'the Unbroken', 'Stormborn',
  'the Patient', 'Bugsbane', 'the Lantern', 'Mergeheart', 'the Quiet Blade', 'Ashcloak', 'the Wall', 'Firstlight',
];
const DRAGON_NAMES = ['Vyrmithrax', 'Ossuaryn', 'Kaldrezza', 'Thraxis', 'Murrowyrm', 'Sablefane', 'Ignivar', 'Querrith'];
const DRAGON_EPITHETS = ['the Ember Tyrant', 'Who Burned the Merge', 'the Long Shadow', 'of the Ninth Hour', 'Ashwing', 'the Unpatched'];

/** A deterministic, medieval name for a legend. */
export function legendName(seed: number, dragon: boolean): { name: string; epithet: string } {
  const h = hash32(String(seed));
  const names = dragon ? DRAGON_NAMES : NAMES;
  const epithets = dragon ? DRAGON_EPITHETS : EPITHETS;
  return { name: names[h % names.length]!, epithet: epithets[(h >>> 8) % epithets.length]! };
}

export type LegendKind = 'survivor' | 'captain' | 'conqueror';

export interface LegendRecord {
  p: number;
  kind: LegendKind;
  unit: Kind | null;
  name: string;
  epithet: string;
  deeds: string[];
}

export const CAPTAIN_KILLS = 20;
const MAX_LEGENDS_PER_PLAYER = 3;

/**
 * Who the day's war remembers by name: Champions and Dragons still standing at
 * the end, captains of platoons with 20+ kills, and the general who took the whole ring.
 */
export function chooseLegends(
  warSeed: number,
  survivors: readonly { p: number; unitId: number; kind: Kind; platoonKills: number; repo: string }[],
  digest: Digest,
): LegendRecord[] {
  const out: LegendRecord[] = [];
  const count = new Map<number, number>();
  const push = (l: LegendRecord) => {
    const n = count.get(l.p) ?? 0;
    if (n >= MAX_LEGENDS_PER_PLAYER) return;
    count.set(l.p, n + 1);
    out.push(l);
  };
  for (const s of survivors) {
    const dragon = s.kind === Kind.Dragon;
    const named = legendName(warSeed ^ s.unitId, dragon);
    const deeds = [`Stood unbroken at the day's end with the ${short(s.repo)} Battalion`];
    if (s.platoonKills > 0) deeds.push(`Its platoon slew ${s.platoonKills}`);
    push({ p: s.p, kind: 'survivor', unit: s.kind, ...named, deeds });
  }
  for (const pl of digest.players) {
    if (pl.bot || !pl.best || pl.best.kills < CAPTAIN_KILLS) continue;
    const named = legendName(warSeed ^ (pl.p * 7919 + pl.best.ordinal), false);
    push({ p: pl.p, kind: 'captain', unit: null, ...named, deeds: [`Led a platoon of the ${short(pl.best.repo)} Battalion to ${pl.best.kills} kills`] });
  }
  if (digest.victory) {
    const named = legendName(warSeed ^ 0x6d0, false);
    push({ p: digest.victory.p, kind: 'conqueror', unit: null, ...named, deeds: [`Led the march that took all ${digest.ring.filter((o) => o >= 0).length} capitals of the ring`] });
  }
  return out;
}

function short(repo: string): string {
  return repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo;
}

// ------------------------------------------------------------------ seasons

/** Placing points for a day: first to fifth, then one for anyone who fought. */
export const SEASON_POINTS = [10, 6, 4, 3, 2];

/** The ISO week a war day belongs to, e.g. "2026-W43". A room's season is a week of its wars. */
export function seasonOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function seasonPoints(pl: DigestPlayer): number {
  if (pl.pushes === 0 && pl.kills === 0) return 0;
  return SEASON_POINTS[pl.place - 1] ?? 1;
}

// -------------------------------------------------------------------- Deeds

export interface DeedContext {
  pl: DigestPlayer;
  digest: Digest;
  ordersDone: number;
  streak: number;
  wins: number;
  days: number;
  legendsNamed: number;
}

export interface DeedDef {
  id: string;
  name: string;
  text: string;
  /** A title this Deed lets the player bear, if any. */
  title?: string;
  earned: (c: DeedContext) => boolean;
}

const award = (c: DeedContext, id: string) => c.pl.awards.includes(id);

export const DEEDS: readonly DeedDef[] = [
  { id: 'first-blood', name: 'First Blood', text: 'Slay your first foe', earned: (c) => c.pl.kills >= 1 },
  { id: 'centurion', name: 'Centurion', text: 'Slay 100 foes in one day', title: 'Centurion', earned: (c) => c.pl.kills >= 100 },
  { id: 'reaper', name: 'The Reaper', text: 'Slay 300 foes in one day', title: 'the Reaper', earned: (c) => c.pl.kills >= 300 },
  { id: 'victor', name: 'Victor', text: 'Win a day', earned: (c) => c.digest.winner === c.pl.p },
  { id: 'triple-crown', name: 'Triple Crown', text: 'Win three days', title: 'Thrice-Crowned', earned: (c) => c.wins >= 3 },
  { id: 'dynasty', name: 'Dynasty', text: 'Win ten days', title: 'the Dynast', earned: (c) => c.wins >= 10 },
  { id: 'dragonlord', name: 'Dragonlord', text: 'Summon a Dragon', title: 'Dragonlord', earned: (c) => c.pl.raised[Kind.Dragon]! > 0 },
  { id: 'dragonslayer', name: 'Dragonslayer', text: 'Fell a Dragon', title: 'Dragonslayer', earned: (c) => c.pl.slain[Kind.Dragon]! > 0 },
  { id: 'giantkiller', name: 'Giantkiller', text: 'Fell a Champion', earned: (c) => c.pl.slain[Kind.Champion]! > 0 },
  { id: 'dragonbane', name: 'Dragonbane', text: 'Earn the Dragonbane award: the most damage to big soldiers by Ballistae', title: 'Dragonbane', earned: (c) => award(c, 'dragonbane') },
  { id: 'siegebreaker', name: 'Siegebreaker', text: 'Storm a capital', title: 'Siegebreaker', earned: (c) => c.pl.conquests >= 1 },
  { id: 'ringholder', name: 'Ringholder', text: 'Take every capital on the ring', title: 'the Ringholder', earned: (c) => c.digest.victory?.p === c.pl.p },
  { id: 'phoenix', name: 'Phoenix', text: 'Lose your home and retake it', title: 'the Phoenix', earned: (c) => c.pl.retakes >= 1 },
  // The id predates the ring (Deeds earned are stored by id); the name now says what it is for.
  { id: 'conqueror', name: 'Warden of the Marches', text: 'Take five border forts in a day', earned: (c) => c.pl.captures >= 5 },
  { id: 'unbroken', name: 'Unbroken', text: 'Fight a day without a single rout', title: 'the Unbroken', earned: (c) => c.pl.pushes > 0 && c.pl.kills >= 20 && c.pl.routs === 0 },
  { id: 'iron-wall', name: 'Iron Wall', text: 'Earn the Iron Wall award', earned: (c) => award(c, 'iron-wall') },
  { id: 'bugslayer', name: 'Bugslayer', text: 'Earn the Bugslayer award', title: 'Bugslayer', earned: (c) => award(c, 'bugslayer') },
  { id: 'architect', name: 'Architect', text: 'Earn the Architect award', title: 'the Architect', earned: (c) => award(c, 'architect') },
  { id: 'warlord', name: 'Warlord', text: 'Earn the Warlord award', earned: (c) => award(c, 'warlord') },
  { id: 'veteran-1', name: 'Blooded', text: 'Field a veteran army', earned: (c) => c.pl.veterancy >= 1 },
  { id: 'veteran-3', name: 'Old Guard', text: 'Field a rank III veteran army', title: 'of the Old Guard', earned: (c) => c.pl.veterancy >= 3 },
  { id: 'well-tested', name: 'Proven', text: 'Field a well-tested army', earned: (c) => c.pl.quality > 1 },
  { id: 'orders-1', name: 'Dutiful', text: 'Fulfil an Order', earned: (c) => c.ordersDone >= 1 },
  { id: 'orders-3', name: 'Exemplary', text: 'Fulfil all three Orders in a day', title: 'the Exemplary', earned: (c) => c.ordersDone >= 3 },
  { id: 'streak-3', name: 'Steady Hand', text: 'Fight three days running', earned: (c) => c.streak >= 3 },
  { id: 'streak-7', name: 'Iron Streak', text: 'Fight seven days running', title: 'Ironsworn', earned: (c) => c.streak >= 7 },
  { id: 'streak-30', name: 'Unending', text: 'Fight thirty days running', title: 'the Unending', earned: (c) => c.streak >= 30 },
  { id: 'days-10', name: 'Campaigner', text: 'Fight ten days', earned: (c) => c.days >= 10 },
  { id: 'days-50', name: 'Veteran of Wars', text: 'Fight fifty days', title: 'Veteran of Wars', earned: (c) => c.days >= 50 },
  { id: 'legend-maker', name: 'Legend-Maker', text: 'Have a soldier named in the Hall of Legends', earned: (c) => c.legendsNamed >= 1 },
  { id: 'demolisher', name: 'Demolisher', text: 'Earn the Demolisher award', earned: (c) => award(c, 'demolisher') },
  { id: 'ghost', name: 'Ghost', text: 'Earn the Ghost award', title: 'the Ghost', earned: (c) => award(c, 'ghost') },
];

/** Deeds this day earns that the player does not have yet. */
export function newDeeds(c: DeedContext, have: ReadonlySet<string>): DeedDef[] {
  return DEEDS.filter((d) => !have.has(d.id) && d.earned(c));
}
