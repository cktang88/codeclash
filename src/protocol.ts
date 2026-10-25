import type { Digest } from './rules/digest.ts';
import type { ArmoryItem, Heraldry, LegendKind, RankInfo } from './rules/meta.ts';
import type { Kind, SiteKind, TimedInput, WorldSnapshot } from './sim/api.ts';
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

/** A statue on the map: a legend beside its player's capital, or the Season Victor at the centre of the ring. */
export interface Monument {
  kind: 'legend' | 'season';
  /** Player index of the capital it stands beside, or -1 for the centre of the ring (on the lake shore or the massif). */
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
      /** The server's simulation version (src/version.ts): a client built from another reloads. */
      simVersion?: string;
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
  /** Owner player per site (capitals and border forts), -1 for none. */
  o: number[];
  /** [player, x, y, soldiers] per platoon in the field. */
  a: [number, number, number, number][];
  /** Walls per seat (by slot): the capital's HP fraction, 0..1, or -1 for an unclaimed seat. */
  w: number[];
}

export interface DigestResponse {
  room: { slug: string; name: string };
  war: WarSummary;
  digest: Digest;
  /** Map geometry for drawing the timelapse: capital and site positions. */
  map: {
    radius: number;
    /** The ring road's radius, the impassable centre's radius and kind (2 lake, 3 massif); absent in digests from before the ring. */
    ring?: number;
    centre?: number;
    centreKind?: number;
    /** The war's seed, for naming the centre as the battlefield names it. */
    seed?: number;
    sites: { kind: SiteKind; x: number; y: number; slot: number }[];
    /**
     * The land at a coarse scale, for painting the timelapse as a miniature of the map: one
     * character per cell, row by row ('0' plain, '1' forest, '2' water, '3' rock, '.' off the map).
     */
    terrain?: { cols: number; cell: number; originX: number; originY: number; cells: string };
  };
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
  /** The hue the player's army flew in their latest war, or null before their first war. */
  hue: number | null;
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
  /** The previous season's victor, whose monument stands at the centre of the ring. */
  champion: { season: string; user: UserRef } | null;
}

export interface OrdersResponse {
  orders: { p: number; login: string; done: string[]; ids: string[] }[];
}

export interface HookResponse {
  hookUrl: string;
  secret: string;
}

/** GET /api/version: the version handshake and the service worker's kill switch. */
export interface VersionResponse {
  sim: string;
  sw: boolean;
}

// ------------------------------------------------------------------ army preview

/** Lines of one diff by category, as the ledger counts them (DESIGN.md §1). */
export interface PreviewLines {
  code: number;
  test: number;
  comment: number;
  docs: number;
  config: number;
  removed: number;
  generated: number;
  vendor: number;
  blank: number;
}

export interface PreviewArmy {
  /** Soldiers by kind, indexed by `Kind`. */
  counts: number[];
  /** Platoon slots the soldiers fill (support included). */
  slots: number;
  /** The budget in slots before specialists are chosen (`budgetOf`). */
  budget: number;
  quality: number;
  veterancy: number;
  power: number;
  /** Quality below 0.95: the army marches in faded, torn cloth. */
  ragged: boolean;
  notes: { kind: 'veteran' | 'tests' | 'comments' | 'filler'; effect: number; text: string }[];
}

export interface PreviewCommit {
  sha: string;
  shortSha: string;
  /** The message's first line. */
  message: string;
  author: { login: string | null; name: string | null; avatarUrl: string | null };
  /** ISO date the commit was authored. */
  date: string | null;
  htmlUrl: string;
  purpose: 'fix' | 'feature' | 'refactor' | 'perf' | 'revert' | 'chore' | 'work';
  lines: PreviewLines;
  /** Files in the diff (at most 300 are read). */
  filesChanged: number;
  /** Source files carrying counted code. */
  files: number;
  /** Decision points in counted code. */
  branches: number;
  /** Function points: 3 for each new function, method or class with a real body. */
  functions: number;
  /** Names used from newly imported local modules (half a point each). */
  links: number;
  /** Complexity as the army counts it: branches + function points + links ÷ 2, after its caps. */
  complexity: number;
  /** Filler: uncounted lines beyond what the commit's code carries, plus lines past the daily cap. */
  filler: number;
  /** Difficulty bonus lines: extra code credit for editing others' established code (0 without context). */
  bonus?: number;
  /** Per file, the context behind the bonus. */
  difficulty?: PreviewDifficulty[];
  army: PreviewArmy;
  /** Why it raised what it raised, one short line each. */
  reasons: string[];
  /** GitHub would not give this commit's diff: nothing was measured. */
  unread?: boolean;
  /** The diff had more files than ingestion reads (300). */
  truncated?: boolean;
  /** Files whose patch GitHub omitted, counted from their additions alone. */
  estimated?: number;
}

/** One file's difficulty context in a preview: "Edited 5 lines of others' code in css.ts (3,688 lines, 127 authors, lines from 2021) ×3.2 → +11 lines". */
export interface PreviewDifficulty {
  path: string;
  /** Lines of others' code modified (removed and replaced). */
  modified: number;
  /** The file's multiplier, after the repository gate. */
  multiplier: number;
  /** Extra lines of credit the file adds. */
  extra: number;
  /** The file's lines before the change, and its other authors. */
  lines: number;
  authors: number;
  commits: number;
  /** Year of the oldest changed line of someone else's. */
  fromYear: number | null;
  /** Why the multiplier is held to ×1.5, when it is. */
  gate: string | null;
  source: 'graphql' | 'mirror';
}

export interface PreviewCombined {
  commits: number;
  lines: PreviewLines;
  files: number;
  branches: number;
  functions: number;
  links: number;
  complexity: number;
  filler: number;
  army: PreviewArmy;
  /** Slots of the commits' armies mustered one by one, each on a fresh day, summed. */
  separateSlots: number;
  /** Difficulty bonus lines of the day. */
  bonus?: number;
  reasons: string[];
}

export interface PreviewResponse {
  /** `owner/name` as GitHub spells it. */
  repo: string;
  htmlUrl: string;
  /** The branch, tag or sha the history was read from. */
  branch: string;
  defaultBranch: string;
  /** Some of the repository's branches, the default first. */
  branches: string[];
  /** Newest non-merge commits first, at most 10. */
  commits: PreviewCommit[];
  /** Merge commits passed over among the ones read (merges never count). */
  skippedMerges: number;
  /** All the commits pushed together on one day, oldest first; null when there are none. */
  combined: PreviewCombined | null;
  /** When this history was read from GitHub (it is cached for 5 minutes). */
  fetchedAt: number;
  /** The signed-in viewer's latest army hue, or null. */
  viewerHue: number | null;
}
