// What the server and the browser say to each other.

import type { ArmySpec, BattleResult, BattleSetup } from './game/battle.ts';
import type { CityState } from './game/city.ts';
import type { FactionId } from './game/factions.ts';
import type { Counts } from './game/units.ts';
import type { Work } from './measure/credit.ts';

export type Visibility = 'public' | 'private';

export interface UserRef {
  /** Bots have negative ids. */
  id: number;
  login: string;
  avatarUrl: string;
  bot: boolean;
}

export interface GithubLink {
  status: 'none' | 'ok' | 'invalid';
  storedAt: number | null;
}

export interface PlayerLook {
  faction: FactionId;
  /** Heraldic hue, 0..359. */
  hue: number;
}

export interface MeResponse {
  user: (UserRef & PlayerLook & { hookUrl: string | null; github: GithubLink }) | null;
  leagues: LeagueCard[];
  oauth: boolean;
  devAuth: boolean;
}

export interface LeagueCard {
  slug: string;
  name: string;
  visibility: Visibility;
  resetHour: number;
  /** Human players. */
  players: number;
  bots: number;
  owner: UserRef;
  /** Last week's champion, if any. */
  champion: UserRef | null;
}

export interface CreateLeagueRequest {
  name: string;
  visibility: Visibility;
  resetHour: number;
  bots: number;
}

export interface WeekClockView {
  weekStart: number;
  weekEnd: number;
  dayMs: number;
  /** 0..6 */
  day: number;
  now: number;
  /** When the next daily battle is fought. */
  nextBattleAt: number;
  /** Whether the next battle is the last of the week, followed by the Grand Battle. */
  grandNext: boolean;
}

export interface MemberSummary extends PlayerLook {
  user: UserRef;
  role: 'owner' | 'member' | 'bot';
  points: number;
  wins: number;
  losses: number;
  /** Soldiers trained this week. */
  produced: number;
  /** Today's army so far. */
  today: number;
  /** Soldiers trained per hour now. */
  rate: number;
  idle: boolean;
  /** Building levels, in BUILDINGS order. */
  levels: number[];
  grand: 'won' | 'lost' | null;
}

export interface BattleCard {
  id: number;
  weekStart: number;
  /** 0..6 daily, 7 the Grand Battle. */
  day: number;
  kind: 'daily' | 'grand';
  foughtAt: number;
  a: UserRef;
  /** null: brigands. */
  b: UserRef | null;
  winner: 0 | 1;
  /** Men each side brought and lost. */
  men: [number, number];
  dead: [number, number];
  walkover: boolean;
  ticks: number;
}

export interface LeagueDetail extends LeagueCard {
  clock: WeekClockView;
  viewer: { signedIn: boolean; member: boolean; owner: boolean; userId: number | null };
  /** Members of private leagues and the owner only. */
  invite: string | null;
  members: MemberSummary[];
  battles: BattleCard[];
  weeks: WeekSummary[];
}

export interface WeekSummary {
  weekStart: number;
  champion: UserRef | null;
  standings: { user: UserRef; points: number; produced: number; grand: 'won' | 'lost' | null }[];
}

export interface WorkEntry {
  at: number;
  repo: string | null;
  message: string | null;
  /** Credited work this push added (negative: undone). */
  code: number;
  tests: number;
  docs: number;
  removed: number;
}

export interface CityView {
  user: UserRef;
  look: PlayerLook;
  clock: WeekClockView;
  city: CityState;
  /** The army the Grand Battle would field if it were fought now. */
  grand: { counts: Counts; veterans: Counts };
  work: WorkEntry[];
  weekWork: Work;
}

export interface BattleView {
  card: BattleCard;
  league: { slug: string; name: string };
  setup: BattleSetup;
  result: BattleResult;
}

export type { ArmySpec };
