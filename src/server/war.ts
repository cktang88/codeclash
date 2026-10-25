import type { RoomDetail, RosterEntry, ServerMessage, TimelapseFrame, WarMeta } from '../protocol.ts';
import { buildDigest, type Digest } from '../rules/digest.ts';
import { nextHue } from '../rules/heraldry.ts';
import type { Heraldry } from '../rules/meta.ts';
import { CAT_COUNT, PlatoonState, TICK_MS, type SimInput, type TimedInput, type World, type WorldSnapshot } from '../sim/api.ts';
import { Chronicler, type ChronicleEntry, type Names } from '../sim/chronicle.ts';
import { checksum, generateMap, restore, snapshot, step, createWorld } from '../sim/index.ts';
import { seatOrder } from '../sim/mapgen.ts';
import { decodeInput, encodeInput, warTicks, type RepoRef, type Replay } from '../sim/replay.ts';
import { SIM_VERSION } from '../version.ts';
import type { Store, WarHeader, WarRow } from './db.ts';
import type { Logger } from './log.ts';

export const INPUT_LEAD_TICKS = 5;
export const CHECK_EVERY_TICKS = 50;
export const SNAPSHOT_EVERY_TICKS = 3000;
export const KEYFRAME_EVERY_TICKS = 18000;
export const CHRONICLE_IN_HELLO = 200;
/** Largest magnitude a single push may move any ledger field. */
export const MAX_DELTA = 1_000_000;

export interface Channel {
  send(msg: ServerMessage): void;
  /** Re-sends hello to every viewer, e.g. when a new war starts. */
  reset(): void;
  /**
   * Whether anyone is watching. With no one, the war skips work only viewers use (the periodic
   * checksum); it still simulates every tick exactly, so no outcome depends on spectators.
   */
  watched?(): boolean;
}

export function timelapseFrame(w: World): TimelapseFrame {
  const walls = new Array<number>(w.map.slots).fill(-1);
  for (const st of w.structures) {
    const def = w.map.sites[st.site];
    if (def && def.kind === 'capital') walls[def.slot] = Math.round((st.hp / st.maxHp) * 1000) / 1000;
  }
  return {
    t: w.tick,
    o: w.sites.map((s) => s.owner),
    a: w.platoons.filter((pl) => pl.state !== PlatoonState.Queued && pl.alive > 0).map((pl) => [pl.p, Math.round(pl.x), Math.round(pl.y), pl.alive]),
    w: walls,
  };
}

export interface WarDeps {
  store: Store;
  log: Logger;
  channel: Channel;
}

export interface Enlistee {
  userId: number;
  login: string;
  avatarUrl: string;
  bot: boolean;
  heraldry?: Heraldry;
}

/** One room's war for one day: the world, its input log, its chronicle. */
export class War {
  private readonly pending: TimedInput[] = [];
  private readonly chronicler: Chronicler;
  private chronicleSeq: number;
  private narratedThrough: number;

  private constructor(
    private readonly deps: WarDeps,
    private row: WarRow,
    readonly world: World,
    pending: TimedInput[],
    private seq: number,
  ) {
    this.pending.push(...pending);
    this.chronicler = new Chronicler(this.names());
    this.chronicleSeq = deps.store.chronicleCount(row.id);
    const tail = deps.store.chronicleTail(row.id, 1)[0];
    this.narratedThrough = tail ? tail.tick : -1;
  }

  static open(deps: WarDeps, w: { roomId: number; day: string; seed: number; startsAt: number; endsAt: number; slots: number; enlist: Enlistee[] }): War {
    const { store } = deps;
    const header: WarHeader = { players: [], repos: [] };
    const inputs: TimedInput[] = [];
    // Seats around the ring are a seeded shuffle, so who neighbours whom changes every day.
    const seats = seatOrder(w.seed, w.slots);
    for (const e of w.enlist.slice(0, w.slots)) {
      const p = header.players.length;
      const slot = seats[p]!;
      const hue = nextHue(header.players.map((x) => x.hue));
      header.players.push({ login: e.login, id: e.userId, userId: e.userId, avatarUrl: e.avatarUrl, hue, slot, bot: e.bot, ...(e.heraldry ? { heraldry: e.heraldry } : {}) });
      inputs.push({ tick: 0, seq: inputs.length + 1, input: { kind: 'join', p, slot, hue } });
    }
    const members = header.players.length;
    // The war's length paces its sieges, so it is part of the world's params (a replay derives it from startsAt and endsAt).
    const params = { seed: w.seed, slots: w.slots, members, ticks: warTicks(w.startsAt, w.endsAt) };
    const id = store.transaction(() => {
      const id = store.insertWar({ roomId: w.roomId, day: w.day, status: 'active', seed: w.seed, slots: w.slots, members, startsAt: w.startsAt, endsAt: w.endsAt, header });
      store.appendInputs(id, inputs.map((t) => ({ seq: t.seq, tick: t.tick, data: encodeInput(t.tick, t.input) })));
      return id;
    });
    const war = new War(deps, store.war(id)!, createWorld(params, generateMap(params)), inputs, inputs.length);
    war.persistSnapshot();
    return war;
  }

  static load(deps: WarDeps, row: WarRow, now: number): War {
    const { store, log } = deps;
    const started = performance.now();
    const snap = store.latestSnapshot(row.id);
    const params = { seed: row.seed, slots: row.slots, members: row.members, ticks: warTicks(row.startsAt, row.endsAt) };
    let world: World | null = null;
    try {
      if (snap) world = restore(JSON.parse(snap.json) as WorldSnapshot);
    } catch (err) {
      // A snapshot from an older simulation: rebuild the war from its inputs instead.
      log.warn('snapshot unusable, replaying from the start', { war: row.id, error: err instanceof Error ? err.message : String(err) });
    }
    // A snapshot from before wars knew their length: it ran as long as its row says.
    if (world && world.params.ticks === undefined) world.params = { ...world.params, ticks: params.ticks };
    world ??= createWorld(params, generateMap(params));
    // Retired manual commands stored by an older server decode to nothing and are dropped.
    const pending = store.inputs(row.id, world.tick).flatMap((r) => {
      const d = decodeInput(r.data);
      return d ? [{ seq: r.seq, ...d }] : [];
    });
    const war = new War(deps, row, world, pending, store.maxSeq(row.id));
    if (row.status === 'active') {
      const from = world.tick;
      war.catchUp(now);
      log.info('war recovered', { war: row.id, fromTick: from, toTick: world.tick, ms: Math.round(performance.now() - started) });
    }
    return war;
  }

  get id(): number {
    return this.row.id;
  }

  get meta(): WarMeta {
    const r = this.row;
    return { id: r.id, day: r.day, status: r.status, startsAt: r.startsAt, endsAt: r.endsAt, seed: r.seed, slots: r.slots, members: r.members };
  }

  get header(): WarHeader {
    return this.row.header;
  }

  get endsAt(): number {
    return this.row.endsAt;
  }

  get active(): boolean {
    return this.row.status === 'active';
  }

  /** One player holds the whole ring: the war is over early, waiting to be concluded. */
  get won(): boolean {
    return this.active && this.world.victor >= 0;
  }

  /** Whether the war takes pushes, joins and commands: active, and not yet won. */
  private get open(): boolean {
    return this.active && this.world.victor < 0;
  }

  playerOf(userId: number): number | null {
    const p = this.row.header.players.findIndex((x) => x.userId === userId);
    return p >= 0 ? p : null;
  }

  roster(): RosterEntry[] {
    return this.row.header.players.map((pl, p) => ({ p, login: pl.login, id: pl.id, hue: pl.hue, slot: pl.slot, bot: pl.bot, avatarUrl: pl.avatarUrl, ...(pl.heraldry ? { heraldry: pl.heraldry } : {}) }));
  }

  behind(now: number): boolean {
    return this.open && this.world.tick < this.targetTick(now);
  }

  over(now: number): boolean {
    return this.active && now >= this.row.endsAt;
  }

  catchUp(now: number): void {
    while (this.behind(now)) this.step();
  }

  step(): void {
    const { channel } = this.deps;
    const w = this.world;
    const due: SimInput[] = [];
    while (this.pending.length > 0 && this.pending[0]!.tick <= w.tick) due.push(this.pending.shift()!.input);
    const events = step(w, due);
    const entries = this.chronicler.narrate(w, due, events);
    if (entries.length > 0 && entries[0]!.tick > this.narratedThrough) {
      this.deps.store.appendChronicle(this.row.id, this.chronicleSeq, (t) => this.timeOfTick(t), entries);
      this.chronicleSeq += entries.length;
      this.narratedThrough = entries[0]!.tick;
      channel.send({ type: 'chronicle', entries });
    }
    if (w.tick % CHECK_EVERY_TICKS === 0 && channel.watched?.() !== false) channel.send({ type: 'check', tick: w.tick, checksum: checksum(w) });
    if (w.tick % SNAPSHOT_EVERY_TICKS === 0) this.persistSnapshot();
    if (w.tick % this.frameEvery === 0) this.deps.store.saveFrame(this.row.id, timelapseFrame(w));
  }

  /** About 144 timelapse frames per war, whatever its length. */
  private get frameEvery(): number {
    return Math.max(50, Math.floor((this.row.endsAt - this.row.startsAt) / TICK_MS / 144));
  }

  /** Adds a member to today's war if a capital is free. Returns their player index. */
  enlist(now: number, e: Enlistee): number | null {
    const existing = this.playerOf(e.userId);
    if (existing !== null || !this.open) return existing;
    const header = this.row.header;
    const taken = new Set(header.players.map((x) => x.slot));
    let slot = -1;
    for (const s of seatOrder(this.row.seed, this.row.slots)) {
      if (!taken.has(s)) {
        slot = s;
        break;
      }
    }
    if (slot < 0) return null;
    const p = header.players.length;
    const hue = nextHue(header.players.map((x) => x.hue));
    header.players.push({ login: e.login, id: e.userId, userId: e.userId, avatarUrl: e.avatarUrl, hue, slot, bot: e.bot, ...(e.heraldry ? { heraldry: e.heraldry } : {}) });
    this.submit(now, [{ kind: 'join', p, slot, hue }], { roster: [this.roster()[p]!] });
    return p;
  }

  /** Raises a platoon for `userId`'s push, if they fight in this war. */
  push(
    now: number,
    userId: number,
    push: { repo: string; language: string | null; lines: number[]; files?: number; branches?: number; functions?: number; links?: number; bonus?: number; churn?: number; filler?: number; commits: number; message: string },
  ): boolean {
    const p = this.playerOf(userId);
    if (p === null || !this.open) return false;
    const header = this.row.header;
    let repo = header.repos.findIndex((r) => r[0].toLowerCase() === push.repo.toLowerCase());
    const added: { index: number; ref: RepoRef }[] = [];
    if (repo < 0) {
      repo = header.repos.length;
      const ref: RepoRef = [push.repo, push.language];
      header.repos.push(ref);
      added.push({ index: repo, ref });
    }
    const msg = push.message.split('\n')[0]!.slice(0, 72);
    // Ledger deltas are signed: work undone today arrives negative.
    const signed = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? Math.max(-MAX_DELTA, Math.min(MAX_DELTA, Math.trunc(n))) : 0);
    const count = (n: number | undefined) => Math.max(0, signed(n));
    const lines = Array.from({ length: CAT_COUNT }, (_, c) => signed(push.lines[c]));
    this.submit(
      now,
      [{ kind: 'push', p, repo, lines, commits: count(push.commits), msg, files: signed(push.files), branches: signed(push.branches), functions: signed(push.functions), links: signed(push.links), ...(push.bonus ? { bonus: signed(push.bonus) } : {}), churn: count(push.churn), filler: count(push.filler) }],
      { repos: added },
    );
    return true;
  }

  /**
   * Credits a fork's deferred difficulty bonus to `userId`'s ledger in this war, if they fight in it: a
   * one-off of bonus lines for commits found upstream after their day closed (server/upstream.ts).
   */
  upstream(now: number, userId: number, reward: { repo: string; bonus: number; day: number }): boolean {
    const p = this.playerOf(userId);
    const bonus = Math.max(0, Math.min(MAX_DELTA, Math.trunc(reward.bonus)));
    if (p === null || !this.open || !(bonus > 0)) return false;
    const header = this.row.header;
    let repo = header.repos.findIndex((r) => r[0].toLowerCase() === reward.repo.toLowerCase());
    const added: { index: number; ref: RepoRef }[] = [];
    if (repo < 0) {
      repo = header.repos.length;
      const ref: RepoRef = [reward.repo, null];
      header.repos.push(ref);
      added.push({ index: repo, ref });
    }
    this.submit(now, [{ kind: 'upstream', p, repo, bonus, day: Math.trunc(reward.day) }], { repos: added });
    return true;
  }

  private submit(now: number, inputs: readonly SimInput[], extra: { roster?: RosterEntry[]; repos?: { index: number; ref: RepoRef }[] } = {}): void {
    const { store, channel } = this.deps;
    const tick = this.inputTick(now);
    const timed = inputs.map((input) => ({ tick, seq: ++this.seq, input }));
    const pushes = this.row.pushes + inputs.filter((i) => i.kind === 'push').length;
    store.transaction(() => {
      store.appendInputs(this.row.id, timed.map((t) => ({ seq: t.seq, tick: t.tick, data: encodeInput(t.tick, t.input) })));
      if (extra.roster || (extra.repos && extra.repos.length > 0) || pushes !== this.row.pushes) store.updateWarHeader(this.row.id, this.row.header, pushes);
    });
    this.row = { ...this.row, pushes };
    this.pending.push(...timed);
    this.pending.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
    channel.send({ type: 'inputs', inputs: timed, ...(extra.roster ? { roster: extra.roster } : {}), ...(extra.repos && extra.repos.length > 0 ? { repos: extra.repos } : {}) });
  }

  /**
   * Runs the war to its last tick (or, once the ring has fallen to one player, stops where it was
   * won), writes the digest, and marks it ended.
   */
  conclude(now: number): Digest {
    if (!this.won) this.catchUp(Math.max(now, this.row.endsAt));
    this.deps.store.saveFrame(this.row.id, timelapseFrame(this.world));
    const digest = buildDigest(this.world, this.replay(), this.deps.store.chronicleAll(this.row.id));
    const winner = digest.winner !== null ? digest.players[digest.winner]! : null;
    this.persistSnapshot();
    this.deps.store.endWar(this.row.id, {
      digest,
      winnerLogin: winner?.login ?? null,
      winnerHue: winner?.hue ?? null,
      winnerRenown: winner?.renown ?? null,
    });
    this.row = { ...this.row, status: 'ended', digest };
    this.deps.log.info('war ended', { war: this.row.id, winner: winner?.login ?? null, tick: this.world.tick, pushes: digest.totals.pushes, conquered: digest.victory !== null });
    return digest;
  }

  replay(): Replay {
    const r = this.row;
    return {
      v: 1,
      seed: r.seed,
      slots: r.slots,
      members: r.members,
      tickMs: TICK_MS,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      players: r.header.players.map(({ login, id, hue, slot, bot }) => ({ login, id, hue, slot, bot })),
      repos: r.header.repos,
      inputs: this.deps.store.inputs(r.id).map((i) => i.data),
    };
  }

  persistSnapshot(): void {
    const w = this.world;
    const { store } = this.deps;
    store.transaction(() => {
      store.saveSnapshot(this.row.id, w.tick, JSON.stringify(snapshot(w)), checksum(w));
      store.pruneSnapshots(this.row.id, w.tick - SNAPSHOT_EVERY_TICKS * 2, KEYFRAME_EVERY_TICKS);
    });
  }

  hello(room: RoomDetail, viewerUserId: number | null, extra: Pick<Extract<ServerMessage, { type: 'hello' }>, 'chat' | 'presence' | 'monuments'>, now: number): ServerMessage {
    return {
      type: 'hello',
      room,
      war: this.meta,
      roster: this.roster(),
      repos: this.row.header.repos,
      snapshot: snapshot(this.world),
      inputs: this.pending.filter((i) => i.tick >= this.world.tick),
      chronicle: this.deps.store.chronicleTail(this.row.id, CHRONICLE_IN_HELLO),
      chat: extra.chat,
      presence: extra.presence,
      serverNow: now,
      tickMs: TICK_MS,
      viewerP: viewerUserId === null ? null : this.playerOf(viewerUserId),
      simVersion: SIM_VERSION,
    };
  }

  chronicleSince(since: number, limit: number): ChronicleEntry[] {
    return this.deps.store.chronicleSince(this.row.id, since, limit);
  }

  timeOfTick(tick: number): number {
    return this.row.startsAt + tick * TICK_MS;
  }

  private names(): Names {
    return {
      player: (p) => (this.row.header.players[p] ? `@${this.row.header.players[p]!.login}` : `Player ${p + 1}`),
      repo: (i) => this.row.header.repos[i]?.[0] ?? 'a repository',
    };
  }

  private targetTick(now: number): number {
    return Math.min(this.wallTick(now), this.lastTick);
  }

  /** The war's final tick: the world is run to exactly this tick and no further. */
  private get lastTick(): number {
    return warTicks(this.row.startsAt, this.row.endsAt);
  }

  /** The tick an input submitted now is stamped with. */
  private inputTick(now: number): number {
    return Math.max(this.world.tick, this.wallTick(now)) + INPUT_LEAD_TICKS;
  }

  private wallTick(now: number): number {
    return Math.max(0, Math.floor((now - this.row.startsAt) / TICK_MS));
  }
}
