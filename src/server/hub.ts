import type { WebSocket } from 'ws';
import type { PresenceEntry, ServerMessage, UserRef } from '../protocol.ts';
import type { Channel } from './war.ts';

const PRESENCE_DEBOUNCE_MS = 1000;
const MAX_PRESENCE = 40;
/** A viewer this far behind on its socket is dropped instead of buffering without bound; it reconnects and resyncs. */
export const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
/** One socket may ask for a fresh snapshot at most this often; later asks are coalesced into one deferred hello. */
export const RESYNC_MIN_MS = 2000;
/**
 * Hellos (each carries a full snapshot) per viewer key, a user or an address, across all of its sockets:
 * a burst, then one per refill. Without it, reconnecting in a loop bypassed the per-socket resync limit.
 */
export const HELLO_BURST = 8;
export const HELLO_REFILL_MS = 1000;
/** Sockets of one key that may wait for a deferred hello; beyond this a new socket is turned away (and reconnects later). */
export const MAX_DEFERRED_PER_KEY = 4;
/** Close code for a socket turned away by the hello limit: not final, so the client backs off and retries. */
export const WS_CLOSE_TRY_LATER = 1013;

interface Viewer {
  user: UserRef | null;
  /** The invite code the socket connected with, if any. */
  invite: string | null;
  /** Rate-limit key: the user, or the address for anonymous viewers. */
  key: string;
  lastResync: number;
  /** A hello waiting for the rate limit; at most one per socket. */
  timer: NodeJS.Timeout | null;
}

interface Bucket {
  tokens: number;
  at: number;
  deferred: number;
}

/** WebSocket fan-out per room, with presence. */
export class Hub {
  private rooms = new Map<number, Map<WebSocket, Viewer>>();
  private presenceTimers = new Map<number, NodeJS.Timeout>();
  private buckets = new Map<string, Bucket>();
  private helloFor: ((roomId: number, socket: WebSocket, user: UserRef | null) => ServerMessage | null) | null = null;

  constructor(private readonly clock: () => number = Date.now) {}

  setHello(fn: (roomId: number, socket: WebSocket, user: UserRef | null) => ServerMessage | null): void {
    this.helloFor = fn;
  }

  /** `key` identifies the viewer for rate limits; it defaults to the user, or one shared anonymous key. */
  add(roomId: number, socket: WebSocket, user: UserRef | null, invite: string | null = null, key: string | null = null): void {
    const sockets = this.rooms.get(roomId) ?? new Map<WebSocket, Viewer>();
    this.rooms.set(roomId, sockets);
    const viewer: Viewer = { user, invite, key: user ? `u${user.id}` : (key ?? 'anon'), lastResync: -Infinity, timer: null };
    sockets.set(socket, viewer);
    socket.on('close', () => {
      this.cancel(viewer);
      sockets.delete(socket);
      if (sockets.size === 0 && this.rooms.get(roomId) === sockets) this.rooms.delete(roomId);
      this.schedulePresence(roomId);
    });
    this.request(roomId, socket, viewer, -Infinity);
    this.schedulePresence(roomId);
  }

  /** A viewer asks for a fresh snapshot: sent now, or once, later, within the rate limits. */
  resync(roomId: number, socket: WebSocket): void {
    const viewer = this.rooms.get(roomId)?.get(socket);
    if (!viewer || viewer.timer) return;
    this.request(roomId, socket, viewer, viewer.lastResync + RESYNC_MIN_MS, true);
  }

  sendHello(roomId: number, socket: WebSocket): void {
    const viewer = this.rooms.get(roomId)?.get(socket);
    const hello = this.helloFor?.(roomId, socket, viewer?.user ?? null);
    if (hello) send(socket, hello);
  }

  private request(roomId: number, socket: WebSocket, viewer: Viewer, notBefore: number, resync = false): void {
    if (viewer.timer || socket.readyState !== socket.OPEN) return;
    const now = this.clock();
    const bucket = this.bucket(viewer.key, now);
    const at = Math.max(notBefore, bucket.tokens >= 1 ? now : now + (1 - bucket.tokens) * HELLO_REFILL_MS);
    if (at <= now) {
      bucket.tokens -= 1;
      if (resync) viewer.lastResync = now;
      this.sendHello(roomId, socket);
      return;
    }
    if (bucket.deferred >= MAX_DEFERRED_PER_KEY) {
      if (!resync) socket.close(WS_CLOSE_TRY_LATER, 'too many connections, try again later');
      return;
    }
    bucket.deferred++;
    viewer.timer = setTimeout(() => {
      viewer.timer = null;
      bucket.deferred--;
      // Asked again now, the per-socket wait is over; only the shared bucket may defer it further.
      this.request(roomId, socket, viewer, -Infinity, resync);
    }, Math.max(1, Math.ceil(at - now)));
    viewer.timer.unref?.();
  }

  private cancel(viewer: Viewer): void {
    if (!viewer.timer) return;
    clearTimeout(viewer.timer);
    viewer.timer = null;
    const bucket = this.buckets.get(viewer.key);
    if (bucket) bucket.deferred--;
  }

  private bucket(key: string, now: number): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size > 10_000) {
        for (const [k, v] of this.buckets) if (v.deferred === 0 && now - v.at >= HELLO_BURST * HELLO_REFILL_MS) this.buckets.delete(k);
      }
      b = { tokens: HELLO_BURST, at: now, deferred: 0 };
      this.buckets.set(key, b);
      return b;
    }
    if (now > b.at) {
      b.tokens = Math.min(HELLO_BURST, b.tokens + (now - b.at) / HELLO_REFILL_MS);
      b.at = now;
    }
    return b;
  }

  channel(roomId: number): Channel {
    return {
      send: (msg) => this.broadcast(roomId, msg),
      watched: () => (this.rooms.get(roomId)?.size ?? 0) > 0,
      // A new war: everyone gets its hello at once, whatever their limits; it replaces any deferred one.
      reset: () => {
        for (const [socket, viewer] of this.rooms.get(roomId) ?? []) {
          this.cancel(viewer);
          this.sendHello(roomId, socket);
        }
      },
    };
  }

  broadcast(roomId: number, msg: ServerMessage): void {
    const sockets = this.rooms.get(roomId);
    if (!sockets || sockets.size === 0) return;
    const data = JSON.stringify(msg);
    for (const socket of sockets.keys()) sendRaw(socket, data);
  }

  /** Closes every socket of a room, e.g. when it is deleted. */
  closeRoom(roomId: number, code: number, reason: string): void {
    for (const socket of this.rooms.get(roomId)?.keys() ?? []) socket.close(code, reason);
  }

  /**
   * Closes the sockets that may no longer watch, e.g. after a member is removed,
   * the room turns private, or its invite is rotated.
   */
  revalidate(roomId: number, allowed: (userId: number | null, invite: string | null) => boolean, code: number, reason: string): void {
    for (const [socket, v] of this.rooms.get(roomId) ?? []) {
      if (!allowed(v.user?.id ?? null, v.invite)) socket.close(code, reason);
    }
  }

  presence(roomId: number): PresenceEntry[] {
    const sockets = this.rooms.get(roomId);
    if (!sockets) return [];
    const byUser = new Map<number, PresenceEntry>();
    let anonymous = 0;
    for (const v of sockets.values()) {
      if (!v.user) {
        anonymous++;
        continue;
      }
      const e = byUser.get(v.user.id);
      if (e) e.count++;
      else byUser.set(v.user.id, { id: v.user.id, login: v.user.login, avatarUrl: v.user.avatarUrl, count: 1 });
    }
    const out = [...byUser.values()].slice(0, MAX_PRESENCE);
    if (anonymous > 0) out.push({ id: null, login: null, avatarUrl: null, count: anonymous });
    return out;
  }

  viewers(roomId: number): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  closeAll(): void {
    for (const t of this.presenceTimers.values()) clearTimeout(t);
    this.presenceTimers.clear();
    for (const sockets of this.rooms.values()) for (const v of sockets.values()) this.cancel(v);
    for (const sockets of this.rooms.values()) for (const socket of sockets.keys()) socket.close(1012, 'server restarting');
  }

  get size(): number {
    let n = 0;
    for (const sockets of this.rooms.values()) n += sockets.size;
    return n;
  }

  private schedulePresence(roomId: number): void {
    if (this.presenceTimers.has(roomId)) return;
    const timer = setTimeout(() => {
      this.presenceTimers.delete(roomId);
      this.broadcast(roomId, { type: 'presence', presence: this.presence(roomId) });
    }, PRESENCE_DEBOUNCE_MS);
    timer.unref?.();
    this.presenceTimers.set(roomId, timer);
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) sendRaw(socket, JSON.stringify(msg));
}

function sendRaw(socket: WebSocket, data: string): void {
  if (socket.readyState !== socket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    socket.terminate();
    return;
  }
  socket.send(data);
}
