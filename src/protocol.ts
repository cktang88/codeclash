import type { Digest } from './rules/digest.ts';
import type { ArmoryItem, Heraldry, LegendKind, RankInfo } from './rules/meta.ts';
import type { Kind, TimedInput, WorldSnapshot } from './sim/api.ts';
import type { ChronicleEntry } from './sim/chronicle.ts';
import type { RepoRef, ReplayPlayer } from './sim/replay.ts';

export type Visibility = 'public' | 'private';
export type WarStatus = 'active' | 'ended';

export interface UserRef {
  id: number;
  login: string;
  avatarUrl: string;
}

export interface RoomCard {
  slug: string;
  name: string;
  visibility: Visibility;
  resetHour: number;
  members: number;
  bots: number;
  viewers: number;
  owner: UserRef;
  /** Current war, if one is running. */
  war: { id: number; endsAt: number; leader: string | null; units: number } | null;
}

export interface RoomMember extends UserRef {
  role: 'owner' | 'member';
  joinedAt: number;
  resting: boolean;
}

export interface RoomDetail {
  slug: string;
  name: string;
  visibility: Visibility;
  resetHour: number;
  bots: number;
  owner: UserRef;
  members: RoomMember[];
  viewer: { member: boolean; owner: boolean; signedIn: boolean };
  /** Only for members of a private room and for the owner. */
  invite: string | null;
  /** Only for the owner. */
  webhookUrl: string | null;
}

export interface WarMeta {
  id: number;
  day: string;
  status: WarStatus;
  startsAt: number;
  endsAt: number;
  seed: number;
  slots: number;
  members: number;
}

/** A war's roster entry: the replay header's player plus display data. */
export interface RosterEntry extends ReplayPlayer {
  p: number;
  avatarUrl: string;
  /** The player's chosen heraldry for this war; absent for bots and defaults. */
  heraldry?: Heraldry;
}

/** A statue on the map: a legend beside its player's capital, or the Season Victor at the Heart. */
export interface Monument {
  kind: 'legend' | 'season';
  /** Player index of the capital it stands beside, or -1 for the Heart. */
  p: number;
  name: string;
  epithet: string;
  unit: Kind | null;
}

export interface PresenceEntry {
  id: number | null;
  login: string | null;
  avatarUrl: string | null;
  count: number;
}

export interface ChatMessage {
  id: number;
  at: number;
  user: UserRef;
  text: string;
}

export const EMOTES = ['⚔️', '🛡️', '🔥', '🎉', '😱', '👑', '💀', '🏹'] as const;
export type Emote = (typeof EMOTES)[number];

export type ServerMessage =
  | {
      type: 'hello';
      room: RoomDetail;
      war: WarMeta;
      roster: RosterEntry[];
      repos: RepoRef[];
      snapshot: WorldSnapshot;
      inputs: TimedInput[];
      chronicle: ChronicleEntry[];
      chat: ChatMessage[];
      presence: PresenceEntry[];
      serverNow: number;
      tickMs: number;
      /** The viewer's player index in this war, if any. */
      viewerP: number | null;
      monuments?: Monument[];
    }
  | { type: 'order'; p: number; login: string; order: { id: string; title: string }; glory: number }
  | { type: 'inputs'; inputs: TimedInput[]; roster?: RosterEntry[]; repos?: { index: number; ref: RepoRef }[] }
  | { type: 'check'; tick: number; checksum: number }
  | { type: 'chronicle'; entries: ChronicleEntry[] }
  | { type: 'presence'; presence: PresenceEntry[] }
  | { type: 'emote'; login: string; p: number | null; emote: Emote }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'war'; war: WarMeta; digestReady: boolean }
  | { type: 'room'; room: RoomDetail };

export type ClientMessage =
  | { type: 'resync' }
  | { type: 'emote'; emote: Emote }
  | { type: 'chat'; text: string };

// The client treats close codes 4000-4999 as final and does not reconnect.
export const WS_CLOSE_NOT_FOUND = 4404;
export const WS_CLOSE_FORBIDDEN = 4403;

export const CHAT_MAX = 240;

// ------------------------------------------------------------------ REST

export interface MeResponse {
  user: (UserRef & { resting: boolean; hookUrl: string | null; streak: number }) | null;
  rooms: RoomCard[];
  oauth: boolean;
  devAuth: boolean;
}

export interface LobbyResponse {
  rooms: RoomCard[];
}

export interface CreateRoomRequest {
  name: string;
  visibility: Visibility;
  resetHour: number;
  bots: number;
}

export interface UpdateRoomRequest {
  name?: string;
  visibility?: Visibility;
  resetHour?: number;
  bots?: number;
  webhookUrl?: string | null;
}

export type CommandRequest =
  | { kind: 'doctrine'; doctrine: number }
  | { kind: 'rally'; site: number }
  | { kind: 'cry' };

export type ApiError = { error: string; message: string };

export interface WarSummary {
  id: number;
  day: string;
  status: WarStatus;
  startsAt: number;
  endsAt: number;
  winner: { login: string; hue: number; renown: number } | null;
  players: number;
  pushes: number;
}

/** One frame of a war's timelapse: site owners and every fielded platoon's banner. */
export interface TimelapseFrame {
  t: number;
  /** Owner player per site, -1 for none. */
  o: number[];
  /** [player, x, y, soldiers] per platoon in the field. */
  a: [number, number, number, number][];
  /** Monolith HP fraction, 0..1. */
  m: number;
}

export interface DigestResponse {
  room: { slug: string; name: string };
  war: WarSummary;
  digest: Digest;
  /** Map geometry for drawing the timelapse: capital and site positions. */
  map: { radius: number; sites: { kind: 'capital' | 'shrine' | 'heart'; x: number; y: number; slot: number }[] };
  players: { p: number; login: string; hue: number; slot: number }[];
  timelapse: TimelapseFrame[];
}

export interface KeyframeResponse {
  tick: number;
  snapshot: WorldSnapshot;
}

export interface LifetimeRecord {
  room: { slug: string; name: string };
  days: number;
  wins: number;
  streak: number;
  bestStreak: number;
  kills: number;
  renown: number;
  awards: Record<string, number>;
}

export interface ProfileResponse {
  user: UserRef;
  records: LifetimeRecord[];
  titles: string[];
  rank?: RankInfo;
  deeds?: DeedEarned[];
  rivalries?: Rivalry[];
  heraldry?: Heraldry;
}

export interface DeedEarned {
  id: string;
  name: string;
  text: string;
  at: number;
  room: string | null;
}

export interface Rivalry {
  rival: UserRef;
  wins: number;
  losses: number;
}

export interface ArmoryResponse {
  rank: RankInfo;
  heraldry: Heraldry;
  catalog: ArmoryItem[];
  titles: string[];
}

export interface LegendEntry {
  name: string;
  epithet: string;
  kind: LegendKind;
  unit: Kind | null;
  deeds: string[];
  owner: UserRef;
  day: string;
  warId: number;
}

export interface LegendsResponse {
  legends: LegendEntry[];
}

export interface SeasonStanding {
  user: UserRef;
  points: number;
  days: number;
  wins: number;
}

export interface SeasonResponse {
  season: string;
  standings: SeasonStanding[];
  /** The previous season's victor, whose monument stands at the Heart. */
  champion: { season: string; user: UserRef } | null;
}

export interface OrdersResponse {
  orders: { p: number; login: string; done: string[]; ids: string[] }[];
}

export interface HookResponse {
  hookUrl: string;
  secret: string;
}
