import type { WebSocket } from 'ws';
import type { PresenceEntry, ServerMessage, UserRef } from '../protocol.ts';
import type { Channel } from './war.ts';

const PRESENCE_DEBOUNCE_MS = 1000;
const MAX_PRESENCE = 40;

interface Viewer {
  user: UserRef | null;
}

/** WebSocket fan-out per room, with presence. */
export class Hub {
  private rooms = new Map<number, Map<WebSocket, Viewer>>();
  private presenceTimers = new Map<number, NodeJS.Timeout>();
  private helloFor: ((roomId: number, socket: WebSocket, user: UserRef | null) => ServerMessage | null) | null = null;

  setHello(fn: (roomId: number, socket: WebSocket, user: UserRef | null) => ServerMessage | null): void {
    this.helloFor = fn;
  }

  add(roomId: number, socket: WebSocket, user: UserRef | null): void {
    const sockets = this.rooms.get(roomId) ?? new Map<WebSocket, Viewer>();
    this.rooms.set(roomId, sockets);
    sockets.set(socket, { user });
    socket.on('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0 && this.rooms.get(roomId) === sockets) this.rooms.delete(roomId);
      this.schedulePresence(roomId);
    });
    this.sendHello(roomId, socket);
    this.schedulePresence(roomId);
  }

  sendHello(roomId: number, socket: WebSocket): void {
    const viewer = this.rooms.get(roomId)?.get(socket);
    const hello = this.helloFor?.(roomId, socket, viewer?.user ?? null);
    if (hello) send(socket, hello);
  }

  channel(roomId: number): Channel {
    return {
      send: (msg) => this.broadcast(roomId, msg),
      reset: () => {
        for (const socket of this.rooms.get(roomId)?.keys() ?? []) this.sendHello(roomId, socket);
      },
    };
  }

  broadcast(roomId: number, msg: ServerMessage): void {
    const sockets = this.rooms.get(roomId);
    if (!sockets || sockets.size === 0) return;
    const data = JSON.stringify(msg);
    for (const socket of sockets.keys()) if (socket.readyState === socket.OPEN) socket.send(data);
  }

  /** Closes every socket of a room, e.g. when it is deleted. */
  closeRoom(roomId: number, code: number, reason: string): void {
    for (const socket of this.rooms.get(roomId)?.keys() ?? []) socket.close(code, reason);
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
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}
