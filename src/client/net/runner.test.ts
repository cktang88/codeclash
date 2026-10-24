import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDetail, ServerMessage, WarMeta } from '../../protocol.ts';
import { TICK_MS } from '../../sim/api.ts';
import { createWorld, generateMap, snapshot, step } from '../../sim/index.ts';
import { GameStore } from '../store.ts';
import { finalTick, LockstepRunner, RESYNC_TIMEOUT_MS, SILENCE_MS } from './runner.ts';
import type { TransportHandlers } from './transport.ts';

const room = { slug: 'test-room', name: 'Test', visibility: 'public', resetHour: 0, bots: 0, members: [], viewer: { member: false, owner: false, signedIn: false }, invite: null, webhookUrl: null } as unknown as RoomDetail;

function hello(war: WarMeta, ticks: number, now: number): Extract<ServerMessage, { type: 'hello' }> {
  const params = { seed: war.seed, slots: war.slots, members: war.members };
  const world = createWorld(params, generateMap(params));
  for (let i = 0; i < ticks; i++) step(world, []);
  return { type: 'hello', room, war, roster: [], repos: [], snapshot: snapshot(world), inputs: [], chronicle: [], chat: [], presence: [], serverNow: now, tickMs: TICK_MS, viewerP: null };
}

function setup(store = new GameStore()) {
  let handlers: TransportHandlers | null = null;
  const sent: unknown[] = [];
  let connects = 0;
  const runner = new LockstepRunner((h) => {
    handlers = h;
    connects++;
    return { send: (m) => sent.push(m), close: () => undefined };
  }, store);
  runner.start();
  return {
    store,
    runner,
    sent,
    connects: () => connects,
    deliver: (msg: ServerMessage) => handlers!.onMessage(msg),
    close: (refusal: string | null = null) => handlers!.onClose(refusal),
  };
}

describe('LockstepRunner', () => {
  afterEach(() => vi.useRealTimers());

  it('finalTick matches the server: whole ticks between start and end', () => {
    expect(finalTick({ startsAt: 1000, endsAt: 1000 + 180_000 }, 200)).toBe(900);
    expect(finalTick({ startsAt: 0, endsAt: 1999 }, 200)).toBe(9);
  });

  it('runs a lagging client to the war’s last tick when the end is announced', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 7, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 40 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const { store, runner, deliver } = setup();
    deliver(hello(war, 0, start));
    vi.runAllTimers();
    expect(store.conn.phase).toBe('live');
    // The client has simulated 30 ticks when the server, already at tick 40, says the war is over.
    vi.setSystemTime(start + 30 * TICK_MS);
    runner.frame();
    expect(store.world!.tick).toBe(30);
    deliver({ type: 'war', war: { ...war, status: 'ended' }, digestReady: true });
    vi.setSystemTime(start + 60 * TICK_MS);
    runner.frame();
    expect(store.world!.tick).toBe(40);
    // The next war's hello follows immediately; the ended war stays reachable for its digest.
    deliver(hello({ ...war, id: 8 }, 0, start + 60 * TICK_MS));
    expect(store.war!.id).toBe(8);
    expect(store.getSnapshot().endedWar?.id).toBe(7);
    runner.stop();
  });

  it('ignores a stale end notice for another war and clears selection on rollover', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 100 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const { store, runner, deliver } = setup();
    deliver(hello(war, 0, start));
    vi.runAllTimers();
    store.selection = { kind: 'site', id: 3 };
    deliver({ type: 'war', war: { ...war, id: 0, status: 'ended' }, digestReady: true });
    expect(store.war!.status).toBe('active');
    deliver(hello({ ...war, id: 2 }, 0, start));
    expect(store.selection).toBeNull();
    runner.stop();
  });

  it('stops catching up once stopped', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start - 2000 * TICK_MS, endsAt: start + 100 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const { store, runner, deliver } = setup();
    deliver(hello(war, 0, start));
    runner.stop();
    vi.runAllTimers();
    expect(store.world!.tick).toBe(0);
  });

  it('gives roster updates a new array so HUD snapshots change', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 100 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const { store, runner, deliver } = setup();
    deliver(hello(war, 0, start));
    const before = store.roster;
    deliver({ type: 'inputs', inputs: [], roster: [{ p: 0, login: 'ana', id: 1, hue: 10, slot: 0, bot: false, avatarUrl: '' }] });
    expect(store.roster).not.toBe(before);
    expect(store.roster[0]!.login).toBe('ana');
    runner.stop();
  });

  it('starts fresh when a new runner reuses a store an earlier runner left refused', () => {
    const store = new GameStore();
    const first = setup(store);
    first.close('this room is private');
    expect(store.conn.phase).toBe('refused');
    first.runner.stop();
    // The viewer joined with an invite; the page restarts the stream on the same store.
    const second = setup(store);
    expect(store.conn.phase).toBe('connecting');
    second.deliver(hello({ id: 1, day: '2026-01-01', status: 'active', startsAt: Date.now(), endsAt: Date.now() + 100 * TICK_MS, seed: 5, slots: 4, members: 2 }, 0, Date.now()));
    expect(store.conn.phase).toBe('syncing');
    second.runner.stop();
  });

  it('reconnects a socket that went silent without a close event (a laptop waking up)', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 100_000 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const t = setup();
    t.deliver(hello(war, 0, start));
    vi.advanceTimersByTime(0);
    expect(t.store.conn.phase).toBe('live');
    vi.setSystemTime(start + SILENCE_MS + 1000);
    t.runner.frame();
    expect(t.store.conn.phase).toBe('offline');
    vi.advanceTimersByTime(5000);
    expect(t.connects()).toBe(2);
    expect(t.store.conn.phase).toBe('connecting');
    t.runner.stop();
  });

  it('does not wait forever for a resync the server never answered', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 100_000 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const t = setup();
    t.deliver(hello(war, 0, start));
    vi.advanceTimersByTime(0);
    // A tab that slept for ten minutes is far behind and asks for a snapshot.
    vi.setSystemTime(start + 600_000);
    t.deliver({ type: 'presence', presence: [] });
    t.runner.frame();
    expect(t.store.conn.phase).toBe('resyncing');
    expect(t.sent).toEqual([{ type: 'resync' }]);
    // Keep the socket chatty so only the resync timeout can fire.
    vi.setSystemTime(start + 600_000 + RESYNC_TIMEOUT_MS + 1);
    t.deliver({ type: 'presence', presence: [] });
    t.runner.frame();
    expect(t.store.conn.phase).toBe('offline');
    vi.advanceTimersByTime(5000);
    expect(t.connects()).toBe(2);
    t.runner.stop();
  });

  it('keeps backing off when the socket keeps dying before the client goes live', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const war: WarMeta = { id: 1, day: '2026-01-01', status: 'active', startsAt: start - 5000 * TICK_MS, endsAt: start + 100_000 * TICK_MS, seed: 5, slots: 4, members: 2 };
    const t = setup();
    let attempt = 0;
    for (let i = 0; i < 4; i++) {
      t.deliver(hello(war, 0, Date.now()));
      t.close();
      expect(t.store.conn.phase).toBe('offline');
      const conn = t.store.conn as Extract<typeof t.store.conn, { phase: 'offline' }>;
      expect(conn.attempt).toBeGreaterThan(attempt);
      attempt = conn.attempt;
      vi.advanceTimersByTime(conn.retryAt - Date.now());
    }
    expect(attempt).toBe(4);
    t.runner.stop();
  });
});

describe('hidden tabs', () => {
  afterEach(() => vi.useRealTimers());

  function fakePage() {
    let hidden = false;
    const fns = new Set<() => void>();
    return {
      page: { hidden: () => hidden, onChange: (fn: () => void) => (fns.add(fn), () => fns.delete(fn)) },
      set(h: boolean) {
        hidden = h;
        for (const f of fns) f();
      },
    };
  }

  function setupWithPage() {
    const store = new GameStore();
    const vis = fakePage();
    let handlers: TransportHandlers | null = null;
    const sent: unknown[] = [];
    let connects = 0;
    let closes = 0;
    const runner = new LockstepRunner((h) => {
      handlers = h;
      connects++;
      return { send: (m) => sent.push(m), close: () => void closes++ };
    }, store, vis.page);
    runner.start();
    return { store, runner, sent, vis, connects: () => connects, closes: () => closes, deliver: (m: ServerMessage) => handlers!.onMessage(m) };
  }

  const warAt = (start: number): WarMeta => ({ id: 3, day: '2026-01-01', status: 'active', startsAt: start, endsAt: start + 3600_000, seed: 2, slots: 4, members: 2 });

  it('lets the socket go after a while hidden, simulates nothing, and starts from a fresh snapshot when shown', async () => {
    const { HIDDEN_PARK_MS } = await import('./runner.ts');
    vi.useFakeTimers();
    const start = Date.now();
    const war = warAt(start);
    const t = setupWithPage();
    t.deliver(hello(war, 0, start));
    vi.runOnlyPendingTimers();
    expect(t.store.conn.phase).toBe('live');
    t.vis.set(true);
    vi.advanceTimersByTime(HIDDEN_PARK_MS + 10);
    expect(t.runner.isParked).toBe(true);
    expect(t.closes()).toBe(1);
    // Hours pass; nothing runs, nothing reconnects.
    vi.advanceTimersByTime(3 * 3600_000);
    const tick = t.store.world!.tick;
    t.runner.frame();
    expect(t.store.world!.tick).toBe(tick);
    expect(t.connects()).toBe(1);
    t.vis.set(false);
    expect(t.runner.isParked).toBe(false);
    expect(t.connects()).toBe(2);
    expect(t.store.conn.phase).toBe('connecting');
    t.deliver(hello(war, 50, Date.now()));
    expect(t.store.conn.phase).toBe('syncing');
  });

  it('asks for a fresh snapshot when shown again far enough behind, rather than replaying the gap', async () => {
    const { RESUME_RESYNC_TICKS } = await import('./runner.ts');
    vi.useFakeTimers();
    const start = Date.now();
    const t = setupWithPage();
    t.deliver(hello(warAt(start), 0, start));
    vi.runOnlyPendingTimers();
    t.runner.frame();
    t.vis.set(true);
    vi.advanceTimersByTime((RESUME_RESYNC_TICKS + 10) * TICK_MS);
    t.vis.set(false);
    const before = t.store.world!.tick;
    t.runner.frame();
    expect(t.sent).toContainEqual({ type: 'resync' });
    expect(t.store.world!.tick).toBe(before);
  });

  it('just catches up after a short glance away', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const t = setupWithPage();
    t.deliver(hello(warAt(start), 0, start));
    vi.runOnlyPendingTimers();
    t.runner.frame();
    t.vis.set(true);
    vi.advanceTimersByTime(5 * TICK_MS);
    t.vis.set(false);
    t.runner.frame();
    expect(t.sent).not.toContainEqual({ type: 'resync' });
    expect(t.store.conn.phase).toBe('live');
  });
});
