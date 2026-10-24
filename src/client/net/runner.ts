import type { ServerMessage, WarMeta } from '../../protocol.ts';
import type { SimInput, TimedInput, World } from '../../sim/api.ts';
import { checksum, restore, step } from '../../sim/index.ts';
import type { GameStore } from '../store.ts';
import { INITIAL_CONN, transition, type ConnEvent, type ResyncReason } from './connection.ts';
import type { Connect, Transport } from './transport.ts';
import { noteServerVersion } from '../sw/register.ts';

const MAX_STEPS_PER_FRAME = 30;
/**
 * Most simulation time one frame may take while catching up: steps are sized from the measured
 * cost of a step, so a busy war catches up over a few smooth frames instead of one long stall.
 */
export const FRAME_SIM_BUDGET_MS = 8;
const MAX_BEHIND_TICKS = 300;
const SYNC_SLICE_MS = 30;
const CHECKSUM_HISTORY = 128;
const FX_TAIL_STEPS = 3;
/**
 * The server sends a checksum every 10 seconds. A socket silent for this long is dead (a laptop
 * that slept, a NAT that forgot the flow) even if the browser has not noticed: reconnect.
 */
export const SILENCE_MS = 45_000;
/** A resync not answered by a hello within this long is retried on a fresh connection. */
export const RESYNC_TIMEOUT_MS = 10_000;
/** A connect attempt that neither opens nor fails within this long is abandoned and retried. */
export const CONNECT_TIMEOUT_MS = 20_000;
/**
 * A tab hidden this long lets its socket go and stops simulating altogether: nobody is watching,
 * and replaying the hours it missed would only stall its return. Shown again, it reconnects and
 * starts from a fresh snapshot.
 */
export const HIDDEN_PARK_MS = 30_000;
/**
 * Shown again (or resumed from sleep) this many ticks behind, the client asks for a fresh
 * snapshot rather than replaying them: restoring one costs about what a few ticks of a busy war do.
 */
export const RESUME_RESYNC_TICKS = 25;
/** Frames this far apart mean the page was asleep or throttled, not merely slow. */
const RESUME_GAP_MS = 5_000;

/** The page's visibility, injectable for tests. */
export interface PageSignals {
  hidden(): boolean;
  onChange(fn: () => void): () => void;
}

export function browserPage(): PageSignals | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return {
    hidden: () => document.visibilityState === 'hidden',
    onChange: (fn) => {
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
  };
}

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
  /** Wall-clock ms of the last message, connect or resync request, for the watchdogs. */
  private lastHeard = 0;
  private resyncAt = 0;
  private onOnline = (): void => this.retryNow();
  private prev = new PrevPositions();
  /** Hidden long enough that the socket was let go (HIDDEN_PARK_MS); nothing runs until shown. */
  private parked = false;
  private parkTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set when the page is shown again: the next frame decides between catching up and a fresh snapshot. */
  private resumed = false;
  private detachPage: (() => void) | null = null;
  alpha = 1;

  constructor(
    private connect: Connect,
    private store: GameStore,
    private page: PageSignals | null = browserPage(),
  ) {
    store.serverNow = () => Date.now() + this.offset;
  }

  /** Whether the runner let its socket go while the page was hidden. */
  get isParked(): boolean {
    return this.parked;
  }

  private onVisibility = (): void => {
    if (this.stopped || !this.page) return;
    if (this.page.hidden()) {
      if (!this.parkTimer && !this.parked) this.parkTimer = setTimeout(() => this.park(), HIDDEN_PARK_MS);
      return;
    }
    if (this.parkTimer) clearTimeout(this.parkTimer);
    this.parkTimer = null;
    if (this.parked) {
      this.parked = false;
      this.store.conn = INITIAL_CONN;
      this.store.publish();
      this.open();
      return;
    }
    this.resumed = true;
    this.retryNow();
  };

  /** Lets the socket go while hidden: no inputs pile up, no catch-up runs, nothing is simulated. */
  private park(): void {
    this.parkTimer = null;
    if (this.stopped || !this.page?.hidden() || this.parked) return;
    this.parked = true;
    this.syncGen++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const t = this.transport;
    this.transport = null;
    t?.close();
    this.queue.clear();
    this.seenSeq.clear();
    this.pendingChecks.clear();
    // Not 'offline': this is no failure, and nothing should retry until the page is shown.
    this.store.conn = INITIAL_CONN;
    this.store.publish();
  }

  start(): void {
    // The store may outlive an earlier runner (e.g. restarted after joining the room); a refusal
    // or offline state left by that runner would otherwise stick, since 'refused' is final.
    this.store.conn = INITIAL_CONN;
    this.store.publish();
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    this.detachPage = this.page?.onChange(this.onVisibility) ?? null;
    this.open();
    // Opened in a background tab: start the park clock now.
    if (this.page?.hidden()) this.onVisibility();
  }

  stop(): void {
    this.stopped = true;
    this.syncGen++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.parkTimer) clearTimeout(this.parkTimer);
    this.parkTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.detachPage?.();
    this.detachPage = null;
    this.transport?.close();
    this.transport = null;
  }

  /** The network came back or the tab was shown: do not sit out the rest of a long backoff. */
  private retryNow(): void {
    if (this.stopped || this.parked || this.store.conn.phase !== 'offline') return;
    if (this.page?.hidden()) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.dispatch({ type: 'retry' });
    this.open();
  }

  /** Detects a connection that died without a close event (sleep, network change) or a lost resync. */
  private watchdog(now: number): void {
    const phase = this.store.conn.phase;
    if (!this.transport) return;
    const stuck =
      (phase === 'connecting' && now - this.lastHeard > CONNECT_TIMEOUT_MS) ||
      ((phase === 'live' || phase === 'syncing' || phase === 'resyncing') && now - this.lastHeard > SILENCE_MS) ||
      (phase === 'resyncing' && now - this.resyncAt > RESYNC_TIMEOUT_MS);
    if (!stuck) return;
    this.transport.close();
    this.handleClose(null);
  }

  send(msg: Parameters<Transport['send']>[0]): void {
    this.transport?.send(msg);
  }

  previousPosition(unitId: number, out: { x: number; y: number }): boolean {
    return this.prev.get(unitId, out);
  }

  /** Smoothed cost of one simulation step on this machine, for sizing catch-up per frame. */
  private stepMs = 0;
  /** Wall-clock ms of the last frame: a long gap (sleep, a throttled window) counts as a resume. */
  private lastFrameAt = 0;

  frame(): void {
    const wall = Date.now();
    if (this.lastFrameAt > 0 && wall - this.lastFrameAt > RESUME_GAP_MS) this.resumed = true;
    this.lastFrameAt = wall;
    this.watchdog(wall);
    const world = this.store.world;
    if (!world || this.store.conn.phase !== 'live') return;
    const exact = (Date.now() + this.offset - this.startMs) / this.tickMs;
    const target = Math.min(Math.floor(exact), this.endTick);
    const behind = target - world.tick;
    // Back from a hidden tab or a sleeping laptop with a gap to fill: a fresh snapshot is cheaper
    // than replaying it, and the frames meanwhile are not stalled by catch-up steps.
    const resumed = this.resumed;
    this.resumed = false;
    if (behind > MAX_BEHIND_TICKS || (resumed && behind > RESUME_RESYNC_TICKS)) {
      this.requestResync('behind');
      return;
    }
    const affordable = this.stepMs > 0 ? Math.max(1, Math.floor(FRAME_SIM_BUDGET_MS / this.stepMs)) : MAX_STEPS_PER_FRAME;
    const steps = Math.min(MAX_STEPS_PER_FRAME, affordable, Math.max(0, behind));
    const t0 = steps > 0 ? performance.now() : 0;
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1) this.prev.capture(world);
      if (this.store.conn.phase !== 'live') return;
      this.advance(world, steps - i <= FX_TAIL_STEPS);
    }
    if (steps > 0) this.stepMs = this.stepMs * 0.8 + ((performance.now() - t0) / steps) * 0.2;
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
    this.lastHeard = Date.now();
    const transport = this.connect({
      onMessage: (msg) => {
        // A message from a socket already replaced (e.g. by the watchdog) belongs to an old session.
        if (this.stopped || this.transport !== transport) return;
        this.lastHeard = Date.now();
        this.handle(msg);
      },
      onClose: (refusal) => {
        if (!this.stopped && this.transport === transport) this.handleClose(refusal);
      },
    });
    this.transport = transport;
  }

  private handleClose(refusal: string | null): void {
    this.transport = null;
    if (refusal !== null) {
      this.dispatch({ type: 'refused', reason: refusal });
      return;
    }
    this.syncGen++;
    this.dispatch({ type: 'closed', now: Date.now(), jitter: Math.random() });
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
    this.resyncAt = Date.now();
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
        // A server running another simulation: this build can never stay in step with it.
        noteServerVersion(msg.simVersion);
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
