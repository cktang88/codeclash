import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../protocol.ts';
import { HELLO_BURST, HELLO_REFILL_MS, Hub, MAX_BUFFERED_BYTES, MAX_DEFERRED_PER_KEY, RESYNC_MIN_MS, WS_CLOSE_TRY_LATER } from './hub.ts';

function fakeSocket(bufferedAmount = 0) {
  const handlers: Record<string, (() => void)[]> = {};
  const s = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount,
    send: vi.fn(),
    terminate: vi.fn(),
    close: vi.fn((): void => {
      if (s.readyState !== 1) return;
      s.readyState = 3;
      for (const fn of handlers.close ?? []) fn();
    }),
    on: vi.fn((ev: string, fn: () => void) => (handlers[ev] ??= []).push(fn)),
  };
  return s;
}

const HELLO = { type: 'presence', presence: [] } as unknown as ServerMessage;

function hubWithClock() {
  const clock = { t: 1_000_000 };
  const hub = new Hub(() => clock.t);
  const hellos: unknown[] = [];
  hub.setHello((_room, socket) => {
    hellos.push(socket);
    return HELLO;
  });
  return { hub, clock, hellos };
}

describe('Hub', () => {
  afterEach(() => vi.useRealTimers());

  it('drops a viewer that stopped reading instead of buffering for it without bound', () => {
    const hub = new Hub();
    const slow = fakeSocket(MAX_BUFFERED_BYTES + 1);
    const fine = fakeSocket(0);
    hub.add(1, slow as unknown as WebSocket, null);
    hub.add(1, fine as unknown as WebSocket, null);
    hub.broadcast(1, { type: 'presence', presence: [] });
    expect(slow.send).not.toHaveBeenCalled();
    expect(slow.terminate).toHaveBeenCalled();
    expect(fine.send).toHaveBeenCalledTimes(1);
    hub.closeAll();
  });

  it('bounds the snapshots a viewer can pull by reconnecting in a loop', () => {
    vi.useFakeTimers();
    const { hub, hellos } = hubWithClock();
    const user = { id: 7, login: 'spam', avatarUrl: '' };
    const sockets = [];
    for (let i = 0; i < 50; i++) {
      const s = fakeSocket();
      sockets.push(s);
      hub.add(1, s as unknown as WebSocket, user);
      s.close();
    }
    expect(hellos.length).toBe(HELLO_BURST);
    // Turned away sockets are closed with a retryable code, without a snapshot.
    const s = fakeSocket();
    for (let i = 0; i < MAX_DEFERRED_PER_KEY + 1; i++) hub.add(1, fakeSocket() as unknown as WebSocket, user);
    hub.add(1, s as unknown as WebSocket, user);
    expect(s.close).toHaveBeenCalledWith(WS_CLOSE_TRY_LATER, expect.any(String));
    expect(hellos.length).toBe(HELLO_BURST);
    // Another viewer is not affected.
    hub.add(1, fakeSocket() as unknown as WebSocket, { id: 8, login: 'calm', avatarUrl: '' });
    expect(hellos.length).toBe(HELLO_BURST + 1);
    hub.closeAll();
  });

  it('defers a too-early resync instead of dropping it, and coalesces repeats', () => {
    vi.useFakeTimers();
    const { hub, clock, hellos } = hubWithClock();
    const s = fakeSocket();
    hub.add(1, s as unknown as WebSocket, null, null, 'ip:1');
    hub.resync(1, s as unknown as WebSocket);
    expect(hellos.length).toBe(2);
    for (let i = 0; i < 10; i++) hub.resync(1, s as unknown as WebSocket);
    expect(hellos.length).toBe(2);
    clock.t += RESYNC_MIN_MS;
    vi.advanceTimersByTime(RESYNC_MIN_MS);
    expect(hellos.length).toBe(3);
    vi.advanceTimersByTime(10 * RESYNC_MIN_MS);
    expect(hellos.length).toBe(3);
    hub.closeAll();
  });

  it('sends a new war’s hello to everyone at once, replacing deferred ones', () => {
    vi.useFakeTimers();
    const { hub, clock, hellos } = hubWithClock();
    const s = fakeSocket();
    hub.add(1, s as unknown as WebSocket, null, null, 'ip:1');
    hub.resync(1, s as unknown as WebSocket);
    hub.resync(1, s as unknown as WebSocket);
    expect(hellos.length).toBe(2);
    hub.channel(1).reset();
    expect(hellos.length).toBe(3);
    clock.t += 10 * HELLO_REFILL_MS;
    vi.advanceTimersByTime(10 * HELLO_REFILL_MS);
    expect(hellos.length).toBe(3);
    hub.closeAll();
  });
});
