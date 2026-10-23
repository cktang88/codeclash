import type { RoomDetail, RosterEntry, ServerMessage, TimelapseFrame, WarMeta } from '../protocol.ts';
import { buildDigest, type Digest } from '../rules/digest.ts';
import { nextHue } from '../rules/heraldry.ts';
import type { Heraldry } from '../rules/meta.ts';
import { CAT_COUNT, NEUTRAL, PlatoonState, TICK_MS, type SimInput, type TimedInput, type World, type WorldSnapshot } from '../sim/api.ts';
import { Chronicler, type ChronicleEntry, type Names } from '../sim/chronicle.ts';
import { checksum, generateMap, restore, snapshot, step, createWorld } from '../sim/index.ts';
import { decodeInput, encodeInput, type RepoRef, type Replay } from '../sim/replay.ts';
import { DOCTRINE_COOLDOWN, RALLY_COOLDOWN } from '../sim/stats.ts';
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
}

export function timelapseFrame(w: World): TimelapseFrame {
  const monolith = w.structures.find((s) => s.p === NEUTRAL);
  return {
    t: w.tick,
    o: w.sites.map((s) => s.owner),
    a: w.platoons.filter((pl) => pl.state !== PlatoonState.Queued && pl.alive > 0).map((pl) => [pl.p, Math.round(pl.x), Math.round(pl.y), pl.alive]),
    m: monolith ? Math.round((monolith.hp / monolith.maxHp) * 1000) / 1000 : 0,
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

export type CommandError = 'not_in_war' | 'cooldown' | 'used' | 'invalid' | 'ended';

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
    for (const e of w.enlist.slice(0, w.slots)) {
      const p = header.players.length;
      const hue = nextHue(header.players.map((x) => x.hue));
      header.players.push({ login: e.login, id: e.userId, userId: e.userId, avatarUrl: e.avatarUrl, hue, slot: p, bot: e.bot, ...(e.heraldry ? { heraldry: e.heraldry } : {}) });
      inputs.push({ tick: 0, seq: inputs.length + 1, input: { kind: 'join', p, slot: p, hue } });
    }
    const members = header.players.length;
    const params = { seed: w.seed, slots: w.slots, members };
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
    const params = { seed: row.seed, slots: row.slots, members: row.members };
    const world = snap ? restore(JSON.parse(snap.json) as WorldSnapshot) : createWorld(params, generateMap(params));
    const pending = store.inputs(row.id, world.tick).map((r) => ({ seq: r.seq, ...decodeInput(r.data) }));
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

  playerOf(userId: number): number | null {
    const p = this.row.header.players.findIndex((x) => x.userId === userId);
    return p >= 0 ? p : null;
  }

  roster(): RosterEntry[] {
    return this.row.header.players.map((pl, p) => ({ p, login: pl.login, id: pl.id, hue: pl.hue, slot: pl.slot, bot: pl.bot, avatarUrl: pl.avatarUrl, ...(pl.heraldry ? { heraldry: pl.heraldry } : {}) }));
  }

  behind(now: number): boolean {
    return this.active && this.world.tick < this.targetTick(now);
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
    if (w.tick % CHECK_EVERY_TICKS === 0) channel.send({ type: 'check', tick: w.tick, checksum: checksum(w) });
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
    if (existing !== null || !this.active) return existing;
    const header = this.row.header;
    const taken = new Set(header.players.map((x) => x.slot));
    let slot = -1;
    for (let s = 0; s < this.row.slots; s++) {
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
    push: { repo: string; language: string | null; lines: number[]; files?: number; branches?: number; churn?: number; filler?: number; commits: number; message: string },
  ): boolean {
    const p = this.playerOf(userId);
    if (p === null || !this.active) return false;
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
      [{ kind: 'push', p, repo, lines, commits: count(push.commits), msg, files: signed(push.files), branches: signed(push.branches), churn: count(push.churn), filler: count(push.filler) }],
      { repos: added },
    );
    return true;
  }

  command(now: number, userId: number, cmd: { kind: 'doctrine'; doctrine: number } | { kind: 'rally'; site: number } | { kind: 'cry' }): CommandError | null {
    if (!this.active || now >= this.row.endsAt) return 'ended';
    const p = this.playerOf(userId);
    if (p === null) return 'not_in_war';
    const player = this.world.players[p];
    if (!player) return 'not_in_war';
    // Validate against the state the input will meet; the simulation re-checks deterministically.
    const tick = this.world.tick + INPUT_LEAD_TICKS;
    let input: SimInput;
    switch (cmd.kind) {
      case 'doctrine':
        if (!Number.isInteger(cmd.doctrine) || cmd.doctrine < 0 || cmd.doctrine > 4 || cmd.doctrine === player.doctrine) return 'invalid';
        if (player.doctrineAt >= 0 && tick - player.doctrineAt < DOCTRINE_COOLDOWN) return 'cooldown';
        input = { kind: 'doctrine', p, doctrine: cmd.doctrine as 0 };
        break;
      case 'rally':
        if (!Number.isInteger(cmd.site) || cmd.site < 0 || cmd.site >= this.world.map.sites.length) return 'invalid';
        if (player.rallyAt >= 0 && tick - player.rallyAt < RALLY_COOLDOWN) return 'cooldown';
        input = { kind: 'rally', p, site: cmd.site };
        break;
      case 'cry':
        if (player.cryUsed) return 'used';
        input = { kind: 'cry', p };
        break;
    }
    if (this.pending.some((t) => t.input.kind === input.kind && 'p' in t.input && t.input.p === p)) return input.kind === 'cry' ? 'used' : 'cooldown';
    this.submit(now, [input]);
    return null;
  }

  private submit(now: number, inputs: readonly SimInput[], extra: { roster?: RosterEntry[]; repos?: { index: number; ref: RepoRef }[] } = {}): void {
    const { store, channel } = this.deps;
    const tick = Math.max(this.world.tick, this.wallTick(now)) + INPUT_LEAD_TICKS;
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

  /** Runs the war to its last tick, writes the digest, and marks it ended. */
  conclude(now: number): Digest {
    this.catchUp(Math.max(now, this.row.endsAt));
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
    this.deps.log.info('war ended', { war: this.row.id, winner: winner?.login ?? null, tick: this.world.tick, pushes: digest.totals.pushes });
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
    return Math.min(this.wallTick(now), Math.floor((this.row.endsAt - this.row.startsAt) / TICK_MS));
  }

  private wallTick(now: number): number {
    return Math.max(0, Math.floor((now - this.row.startsAt) / TICK_MS));
  }
}
