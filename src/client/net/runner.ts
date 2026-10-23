import type { ServerMessage, WarMeta } from '../../protocol.ts';
import type { SimInput, TimedInput, World } from '../../sim/api.ts';
import { checksum, restore, step } from '../../sim/index.ts';
import type { GameStore } from '../store.ts';
import { transition, type ConnEvent, type ResyncReason } from './connection.ts';
import type { Connect, Transport } from './transport.ts';

const MAX_STEPS_PER_FRAME = 30;
const MAX_BEHIND_TICKS = 300;
const SYNC_SLICE_MS = 30;
const CHECKSUM_HISTORY = 128;
const FX_TAIL_STEPS = 3;

/** The last tick of a war: the server runs every war to exactly this tick. */
export function finalTick(war: Pick<WarMeta, 'startsAt' | 'endsAt'>, tickMs: number): number {
  return Math.floor((war.endsAt - war.startsAt) / tickMs);
}

/** Drives a world forward for the renderer. */
export interface Runner {
  /** 0..1 progress between the previous tick and the current one. */
  alpha: number;
  frame(): void;
  previousPosition(unitId: number, out: { x: number; y: number }): boolean;
  stop(): void;
}

/** Keeps positions from before the last step so the renderer can interpolate. */
export class PrevPositions {
  private index = new Map<number, number>();
  private xy = new Float64Array(0);

  capture(world: World): void {
    const n = world.units.length;
    if (this.xy.length < n * 2) this.xy = new Float64Array(n * 2 + 512);
    this.index.clear();
    for (let i = 0; i < n; i++) {
      const u = world.units[i]!;
      this.index.set(u.id, i);
      this.xy[i * 2] = u.x;
      this.xy[i * 2 + 1] = u.y;
    }
  }

  get(unitId: number, out: { x: number; y: number }): boolean {
    const i = this.index.get(unitId);
    if (i === undefined) return false;
    out.x = this.xy[i * 2]!;
    out.y = this.xy[i * 2 + 1]!;
    return true;
  }

  clear(): void {
    this.index.clear();
  }
}

/**
 * Lockstep spectator: one snapshot from the server, then only inputs, each
 * stamped with the tick it applies at. The client simulates locally and checks
 * itself against the server's checksums.
 */
export class LockstepRunner implements Runner {
  private transport: Transport | null = null;
  private queue = new Map<number, TimedInput[]>();
  private seenSeq = new Set<number>();
  private localChecksums = new Map<number, number>();
  private pendingChecks = new Map<number, number>();
  private offset = 0;
  private startMs = 0;
  private tickMs = 200;
  private endTick = Infinity;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Bumped on every hello so a catch-up loop for an older snapshot stops. */
  private syncGen = 0;
  private prev = new PrevPositions();
  alpha = 1;

  constructor(
    private connect: Connect,
    private store: GameStore,
  ) {
    store.serverNow = () => Date.now() + this.offset;
  }

  start(): void {
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.transport?.close();
    this.transport = null;
  }

  send(msg: Parameters<Transport['send']>[0]): void {
    this.transport?.send(msg);
  }

  previousPosition(unitId: number, out: { x: number; y: number }): boolean {
    return this.prev.get(unitId, out);
  }

  frame(): void {
    const world = this.store.world;
    if (!world || this.store.conn.phase !== 'live') return;
    const exact = (Date.now() + this.offset - this.startMs) / this.tickMs;
    const target = Math.min(Math.floor(exact), this.endTick);
    const behind = target - world.tick;
    if (behind > MAX_BEHIND_TICKS) {
      this.requestResync('behind');
      return;
    }
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.max(0, behind));
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1) this.prev.capture(world);
      if (this.store.conn.phase !== 'live') return;
      this.advance(world, steps - i <= FX_TAIL_STEPS);
    }
    this.alpha = world.tick >= target && target < this.endTick ? Math.min(1, Math.max(0, exact - target)) : 1;
  }

  private syncSlice = (gen: number): void => {
    const world = this.store.world;
    if (this.stopped || gen !== this.syncGen || !world || this.store.conn.phase !== 'syncing') return;
    const target = Math.min(Math.floor((Date.now() + this.offset - this.startMs) / this.tickMs), this.endTick);
    const started = performance.now();
    while (world.tick < target && performance.now() - started < SYNC_SLICE_MS) {
      this.advance(world, false);
      if (this.store.conn.phase !== 'syncing') return;
    }
    if (world.tick >= target) {
      this.prev.capture(world);
      this.dispatch({ type: 'caught-up' });
    } else {
      setTimeout(this.syncSlice, 0, gen);
    }
  };

  private advance(world: World, emit: boolean): void {
    const due = this.queue.get(world.tick);
    let inputs: SimInput[] = [];
    if (due) {
      this.queue.delete(world.tick);
      due.sort((a, b) => a.seq - b.seq);
      inputs = due.map((t) => t.input);
      for (const t of due) this.seenSeq.delete(t.seq);
    }
    const events = step(world, inputs);
    const sum = checksum(world);
    this.localChecksums.set(world.tick, sum);
    this.localChecksums.delete(world.tick - CHECKSUM_HISTORY);
    const expected = this.pendingChecks.get(world.tick);
    if (expected !== undefined) {
      this.pendingChecks.delete(world.tick);
      if (expected !== sum) {
        this.requestResync('desync');
        return;
      }
    }
    this.store.ticked(world);
    if (emit) this.store.stepped(events, world);
  }

  private open(): void {
    this.transport?.close();
    this.transport = this.connect({
      onMessage: (msg) => {
        if (!this.stopped) this.handle(msg);
      },
      onClose: (refusal) => {
        if (!this.stopped) this.handleClose(refusal);
      },
    });
  }

  private handleClose(refusal: string | null): void {
    this.transport = null;
    if (refusal !== null) {
      this.dispatch({ type: 'refused', reason: refusal });
      return;
    }
    this.dispatch({ type: 'closed', now: Date.now() });
    const conn = this.store.conn;
    if (conn.phase !== 'offline') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.dispatch({ type: 'retry' });
      this.open();
    }, conn.retryAt - Date.now());
  }

  private requestResync(reason: ResyncReason): void {
    const phase = this.store.conn.phase;
    if (phase !== 'live' && phase !== 'syncing') return;
    this.dispatch({ type: 'resync', reason });
    this.transport?.send({ type: 'resync' });
  }

  private dispatch(event: ConnEvent): void {
    const next = transition(this.store.conn, event);
    if (next === this.store.conn) return;
    this.store.conn = next;
    this.store.publish();
  }

  private enqueue(inputs: readonly TimedInput[], currentTick: number): boolean {
    for (const t of inputs) {
      if (this.seenSeq.has(t.seq)) continue;
      if (t.tick < currentTick) return false;
      this.seenSeq.add(t.seq);
      const list = this.queue.get(t.tick);
      if (list) list.push(t);
      else this.queue.set(t.tick, [t]);
    }
    return true;
  }

  private handle(msg: ServerMessage): void {
    const store = this.store;
    switch (msg.type) {
      case 'hello': {
        const world = restore(msg.snapshot);
        this.queue.clear();
        this.seenSeq.clear();
        this.localChecksums.clear();
        this.pendingChecks.clear();
        this.prev.clear();
        this.offset = msg.serverNow - Date.now();
        this.startMs = msg.war.startsAt;
        this.tickMs = msg.tickMs;
        this.endTick = msg.war.status === 'ended' ? world.tick : finalTick(msg.war, msg.tickMs);
        this.enqueue(msg.inputs, world.tick);
        if (store.war?.id !== msg.war.id) store.selection = null;
        store.room = msg.room;
        store.war = msg.war;
        store.warStartMs = msg.war.startsAt;
        store.roster = msg.roster;
        store.repos = msg.repos;
        store.viewerP = msg.viewerP;
        store.presence = msg.presence;
        store.chronicle = [];
        store.chat = [];
        store.digestReady = msg.war.status === 'ended';
        store.resetWorld(world);
        store.addChronicle(msg.chronicle, false);
        for (const c of msg.chat) store.addChat(c);
        store.monuments = msg.monuments ?? [];
        this.dispatch({ type: 'hello' });
        store.publish();
        setTimeout(this.syncSlice, 0, ++this.syncGen);
        return;
      }
      case 'inputs': {
        // Copy on write: HUD snapshots hold these arrays, so they must change identity to update.
        if (msg.roster) {
          store.roster = store.roster.slice();
          for (const r of msg.roster) store.roster[r.p] = r;
        }
        if (msg.repos) {
          store.repos = store.repos.slice();
          for (const r of msg.repos) store.repos[r.index] = r.ref;
        }
        const world = store.world;
        if (!world) return;
        if (!this.enqueue(msg.inputs, world.tick)) this.requestResync('late-input');
        return;
      }
      case 'check': {
        const world = store.world;
        if (!world) return;
        if (msg.tick > world.tick) {
          this.pendingChecks.set(msg.tick, msg.checksum);
          return;
        }
        const local = this.localChecksums.get(msg.tick);
        if (local !== undefined && local !== msg.checksum) this.requestResync('desync');
        return;
      }
      case 'chronicle':
        store.addChronicle(msg.entries);
        return;
      case 'presence':
        store.presence = msg.presence;
        store.publish();
        return;
      case 'emote':
        store.addEmote(msg.login, msg.p, msg.emote);
        return;
      case 'chat':
        store.addChat(msg.message);
        return;
      case 'war':
        if (store.war && msg.war.id !== store.war.id) return;
        store.war = msg.war;
        store.digestReady = msg.digestReady;
        // The server ran the war to its last tick before announcing the end. Stopping at our own
        // tick would freeze a lagging client a few ticks short, missing the final checks and score.
        if (msg.war.status === 'ended') this.endTick = finalTick(msg.war, this.tickMs);
        // The next war's hello follows at once; remember this one so the HUD can link its digest.
        if (msg.war.status === 'ended' && msg.digestReady) store.endedWar = msg.war;
        store.publish();
        return;
      case 'room':
        store.room = msg.room;
        store.publish();
        return;
      case 'order':
        store.addToast('order', msg.p, `${msg.order.title} — +${msg.glory} Glory`);
        return;
    }
  }
}
