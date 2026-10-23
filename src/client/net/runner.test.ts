import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDetail, ServerMessage, WarMeta } from '../../protocol.ts';
import { TICK_MS } from '../../sim/api.ts';
import { createWorld, generateMap, snapshot, step } from '../../sim/index.ts';
import { GameStore } from '../store.ts';
import { finalTick, LockstepRunner } from './runner.ts';
import type { TransportHandlers } from './transport.ts';

const room = { slug: 'test-room', name: 'Test', visibility: 'public', resetHour: 0, bots: 0, members: [], viewer: { member: false, owner: false, signedIn: false }, invite: null, webhookUrl: null } as unknown as RoomDetail;

function hello(war: WarMeta, ticks: number, now: number): Extract<ServerMessage, { type: 'hello' }> {
  const params = { seed: war.seed, slots: war.slots, members: war.members };
  const world = createWorld(params, generateMap(params));
  for (let i = 0; i < ticks; i++) step(world, []);
  return { type: 'hello', room, war, roster: [], repos: [], snapshot: snapshot(world), inputs: [], chronicle: [], chat: [], presence: [], serverNow: now, tickMs: TICK_MS, viewerP: null };
}

function setup() {
  let handlers: TransportHandlers | null = null;
  const store = new GameStore();
  const runner = new LockstepRunner((h) => {
    handlers = h;
    return { send: () => undefined, close: () => undefined };
  }, store);
  runner.start();
  return { store, runner, deliver: (msg: ServerMessage) => handlers!.onMessage(msg) };
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
});
