import type { ChatMessage, Emote, Monument, PresenceEntry, RoomDetail, RosterEntry, WarMeta } from '../protocol.ts';
import { NEUTRAL, PlatoonState, TICK_MS, type TickEvents, type World } from '../sim/api.ts';
import { computeRing, type Front } from '../sim/ring.ts';
import { fortBetween } from '../sim/mapgen.ts';
import { founderOf, gatesUnbarAt, siegesOpenAt } from './ringinfo.ts';
import type { ChronicleEntry, Names } from '../sim/chronicle.ts';
import type { RepoRef } from '../sim/replay.ts';
import { INITIAL_CONN, type ConnState } from './net/connection.ts';

export interface Standing {
  p: number;
  login: string;
  avatarUrl: string;
  hue: number;
  bot: boolean;
  renown: number;
  alive: number;
  platoons: number;
  queued: number;
  doctrine: number;
  leader: boolean;
  /** Renown gained in the last minute, for the trend arrow. */
  trend: number;
  /** Capitals held now: the first measure of the war. */
  capitals: number;
  /** Holds no capital and fights on as a rising, to retake its home. */
  rising: boolean;
  /** Capitals stormed today. */
  conquests: number;
}

/** One seat of the ring, as the HUD's ring diagram draws it. */
export interface RingSeat {
  slot: number;
  /** Site id of its capital. */
  site: number;
  /** Who holds it now, or NEUTRAL for an open seat. */
  holder: number;
  /** Whose home it is, or NEUTRAL. */
  founder: number;
  hp: number;
  maxHp: number;
  besieged: boolean;
  /** Tick its gates unbar, or -1 when they are not barred. */
  barredUntil: number;
}

/** The ring of capitals for the HUD: seats in slot order, the forts between them, the fronts and the victory. */
export interface RingSummary {
  slots: number;
  seats: RingSeat[];
  /** The fort between seat s and seat s + 1: its holder, or NEUTRAL. */
  forts: { site: number; owner: number; capturer: number }[];
  /** The viewer's fronts (none for a spectator). */
  fronts: Front[];
  /** Tick the sieges open. */
  siegesOpen: number;
  victor: number;
  victoryTick: number;
  /** Lake (2) or massif (3) at the centre. */
  centreKind: number;
  seed: number;
}

export type Selection =
  | { kind: 'platoon'; id: number }
  | { kind: 'site'; id: number }
  | { kind: 'player'; p: number }
  | null;

export interface Toast {
  id: number;
  at: number;
  /** A chronicle kind, or 'order' for a fulfilled Order (pushed by meta via addToast). */
  kind: ChronicleEntry['kind'] | 'order';
  p: number;
  title: string;
  x: number;
  y: number;
}

export interface FloatingEmote {
  id: number;
  at: number;
  p: number | null;
  login: string;
  emote: Emote;
}

export interface HudSnapshot {
  conn: ConnState;
  room: RoomDetail | null;
  war: WarMeta | null;
  roster: readonly RosterEntry[];
  repos: readonly RepoRef[];
  standings: readonly Standing[];
  chronicle: readonly ChronicleEntry[];
  chat: readonly ChatMessage[];
  presence: readonly PresenceEntry[];
  toasts: readonly Toast[];
  emotes: readonly FloatingEmote[];
  tick: number;
  serverNow: number;
  viewerP: number | null;
  selection: Selection;
  following: boolean;
  ring: RingSummary | null;
  replay: boolean;
  digestReady: boolean;
  /** The war that just ended, kept after the server rolls the room into the next one. */
  endedWar: WarMeta | null;
}

export type StepListener = (events: TickEvents, world: World) => void;

const HUD_INTERVAL_MS = 250;
const CHRONICLE_KEEP = 400;
const CHAT_KEEP = 120;
const TOAST_MS = 5000;
const EMOTE_MS = 3500;
const RENOWN_SAMPLE_TICKS = 5;
/** Samples spanning one minute of war, for the trend arrows. */
const RENOWN_SAMPLES = 60;
const TOAST_KINDS = new Set<ChronicleEntry['kind']>(['conquest', 'rising', 'victory', 'dragon', 'champion', 'cry', 'leader', 'clash', 'join']);

/** Everything the client knows about the room it is watching. */
export class GameStore {
  world: World | null = null;
  conn: ConnState = INITIAL_CONN;
  room: RoomDetail | null = null;
  war: WarMeta | null = null;
  roster: RosterEntry[] = [];
  repos: RepoRef[] = [];
  chronicle: ChronicleEntry[] = [];
  chat: ChatMessage[] = [];
  presence: PresenceEntry[] = [];
  viewerP: number | null = null;
  selection: Selection = null;
  following = true;
  /** The camera rides with the viewer's own freshest platoon (key F). */
  followMine = false;
  replay = false;
  digestReady = false;
  endedWar: WarMeta | null = null;
  /**
   * Wall-clock ms until which the field is still playing the victory's set piece; the HUD's victory
   * overlay waits for it.
   */
  ceremonyUntil = 0;
  /** Statues for this war's map: yesterday's legends at their owners' capitals, the Season Victor on the centre's shore. */
  monuments: Monument[] = [];
  serverNow = () => Date.now();
  /** Wall-clock ms of tick 0, for converting ticks to times. */
  warStartMs = 0;

  private toasts: Toast[] = [];
  private emotes: FloatingEmote[] = [];
  private nextId = 1;
  private renownHistory: number[][] = [];
  private listeners = new Set<() => void>();
  private stepListeners = new Set<StepListener>();
  private chronicleListeners = new Set<(entries: readonly ChronicleEntry[]) => void>();
  private emoteListeners = new Set<(e: FloatingEmote) => void>();
  private snap: HudSnapshot = this.build();
  private lastBuild = 0;
  private dirty = false;

  readonly names: Names = {
    player: (p) => (this.roster[p] ? `@${this.roster[p]!.login}` : `Player ${p + 1}`),
    repo: (i) => this.repos[i]?.[0] ?? 'a repository',
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): HudSnapshot => this.snap;

  /** Rebuilds the HUD snapshot now and notifies React. */
  publish(): void {
    this.snap = this.build();
    this.lastBuild = performance.now();
    this.dirty = false;
    for (const fn of this.listeners) fn();
  }

  /** Called every animation frame; rebuilds the HUD at most 4 times a second. */
  pump(): void {
    const now = Date.now();
    const before = this.toasts.length + this.emotes.length;
    this.toasts = this.toasts.filter((t) => now - t.at < TOAST_MS);
    this.emotes = this.emotes.filter((e) => now - e.at < EMOTE_MS);
    if (this.toasts.length + this.emotes.length !== before) this.dirty = true;
    if (this.dirty && performance.now() - this.lastBuild >= HUD_INTERVAL_MS) this.publish();
  }

  onStep(fn: StepListener): () => void {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  onChronicle(fn: (entries: readonly ChronicleEntry[]) => void): () => void {
    this.chronicleListeners.add(fn);
    return () => this.chronicleListeners.delete(fn);
  }

  onEmote(fn: (e: FloatingEmote) => void): () => void {
    this.emoteListeners.add(fn);
    return () => this.emoteListeners.delete(fn);
  }

  /** The runner reports every simulated tick, rendered or not, so trends hold through catch-up and fast play. */
  ticked(world: World): void {
    if (world.tick % RENOWN_SAMPLE_TICKS === 0) this.recordRenown(world);
  }

  /** The runner reports every simulated tick it wants rendered. */
  stepped(events: TickEvents, world: World): void {
    for (const fn of this.stepListeners) fn(events, world);
    this.dirty = true;
  }

  resetWorld(world: World): void {
    this.world = world;
    this.renownHistory = [];
    this.toasts = [];
    this.dirty = true;
  }

  addChronicle(entries: readonly ChronicleEntry[], announce = true): void {
    if (entries.length === 0) return;
    this.chronicle.push(...entries);
    if (this.chronicle.length > CHRONICLE_KEEP) this.chronicle.splice(0, this.chronicle.length - CHRONICLE_KEEP);
    if (announce) {
      const now = Date.now();
      for (const e of entries) {
        if (!TOAST_KINDS.has(e.kind)) continue;
        if (e.kind === 'join' && this.roster[e.p]?.bot) continue;
        this.toasts.push({ id: this.nextId++, at: now, kind: e.kind, p: e.p, title: e.text, x: e.x, y: e.y });
      }
      if (this.toasts.length > 4) this.toasts.splice(0, this.toasts.length - 4);
    }
    for (const fn of this.chronicleListeners) fn(entries);
    this.dirty = true;
  }

  /** A toast that is not a chronicle line, e.g. a fulfilled Order. x/y NaN means no map location. */
  addToast(kind: Toast['kind'], p: number, title: string, x = NaN, y = NaN): void {
    this.toasts.push({ id: this.nextId++, at: Date.now(), kind, p, title, x, y });
    if (this.toasts.length > 4) this.toasts.splice(0, this.toasts.length - 4);
    this.dirty = true;
  }

  addChat(msg: ChatMessage): void {
    this.chat.push(msg);
    if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
    this.dirty = true;
  }

  addEmote(login: string, p: number | null, emote: Emote): void {
    const e: FloatingEmote = { id: this.nextId++, at: Date.now(), p, login, emote };
    this.emotes.push(e);
    if (this.emotes.length > 30) this.emotes.shift();
    for (const fn of this.emoteListeners) fn(e);
    this.dirty = true;
  }

  setFollowMine(on: boolean): void {
    if (this.followMine === on) return;
    this.followMine = on;
    if (on) this.following = false;
    this.publish();
  }

  select(selection: Selection): void {
    this.selection = selection;
    this.publish();
  }

  setFollowing(on: boolean): void {
    if (this.following === on) return;
    this.following = on;
    this.publish();
  }

  /** Wall-clock time at which `tick` happens. */
  timeOfTick(tick: number): number {
    return this.warStartMs + tick * TICK_MS;
  }

  private ringOf(world: World): RingSummary {
    const { map } = world;
    const r = computeRing(world);
    const seats: RingSeat[] = [];
    for (let slot = 0; slot < map.slots; slot++) {
      const site = map.sites.findIndex((d) => d.kind === 'capital' && d.slot === slot);
      const st = world.structures.find((x) => x.site === site);
      seats.push({
        slot,
        site,
        holder: st ? st.p : NEUTRAL,
        founder: founderOf(world, slot),
        hp: st?.hp ?? 0,
        maxHp: st?.maxHp ?? 0,
        besieged: !!st && st.siegeSince >= 0 && world.victor < 0,
        barredUntil: st ? gatesUnbarAt(world, st) : -1,
      });
    }
    const forts = [];
    for (let s = 0; s < map.slots; s++) {
      const site = fortBetween(map.slots, s);
      const state = world.sites[site];
      forts.push({ site, owner: state?.owner ?? NEUTRAL, capturer: state && state.progress > 0 ? state.capturer : NEUTRAL });
    }
    const viewer = this.viewerP;
    return {
      slots: map.slots,
      seats,
      forts,
      fronts: viewer !== null && viewer >= 0 ? (r.fronts[viewer] ?? []) : [],
      siegesOpen: siegesOpenAt(world),
      victor: world.victor,
      victoryTick: world.victoryTick,
      centreKind: map.centreKind,
      seed: world.params.seed,
    };
  }

  private recordRenown(world: World): void {
    this.renownHistory.push(world.players.map((p) => p.renown));
    if (this.renownHistory.length > RENOWN_SAMPLES) this.renownHistory.shift();
  }

  private build(): HudSnapshot {
    const world = this.world;
    const standings: Standing[] = [];
    let ring: RingSummary | null = null;
    if (world) {
      ring = this.ringOf(world);
      const alive = new Int32Array(world.players.length);
      for (const u of world.units) if (u.p >= 0) alive[u.p]!++;
      const platoons = new Int32Array(world.players.length);
      for (const pl of world.platoons) if (pl.state !== PlatoonState.Queued) platoons[pl.p]!++;
      const past = this.renownHistory[0];
      for (const ps of world.players) {
        const r = this.roster[ps.p];
        standings.push({
          p: ps.p,
          login: r?.login ?? `player${ps.p}`,
          avatarUrl: r?.avatarUrl ?? '',
          hue: ps.hue,
          bot: r?.bot ?? false,
          renown: ps.renown,
          alive: alive[ps.p]!,
          platoons: platoons[ps.p]!,
          queued: ps.queue.length,
          doctrine: ps.doctrine,
          leader: world.leader === ps.p,
          trend: past ? ps.renown - (past[ps.p] ?? 0) : 0,
          capitals: ps.capitals,
          rising: ps.rising,
          conquests: ps.conquests,
        });
      }
      // The ring's conqueror first, then the most capitals held, then renown, then who joined first.
      standings.sort((a, b) => (b.p === world.victor ? 1 : 0) - (a.p === world.victor ? 1 : 0) || b.capitals - a.capitals || b.renown - a.renown || a.p - b.p);
    }
    return {
      conn: this.conn,
      room: this.room,
      war: this.war,
      roster: this.roster,
      repos: this.repos,
      standings,
      chronicle: this.chronicle.slice(),
      chat: this.chat.slice(),
      presence: this.presence,
      toasts: this.toasts.slice(),
      emotes: this.emotes.slice(),
      tick: world?.tick ?? 0,
      serverNow: this.serverNow(),
      viewerP: this.viewerP,
      selection: this.selection,
      following: this.following,
      ring,
      replay: this.replay,
      digestReady: this.digestReady,
      endedWar: this.endedWar,
    };
  }
}
