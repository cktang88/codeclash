import type { RosterEntry, WarMeta } from '../../protocol.ts';
import { BOTS, botPush, mulberry } from '../../rules/bots.ts';
import { nextHue } from '../../rules/heraldry.ts';
import { TICK_MS, TICKS_PER_MINUTE, type SimInput, type World } from '../../sim/api.ts';
import { Chronicler } from '../../sim/chronicle.ts';
import { generateMap, slotsFor } from '../../sim/mapgen.ts';
import { decodeInput, replayParams, type Replay } from '../../sim/replay.ts';
import { createWorld, step } from '../../sim/world.ts';
import type { GameStore } from '../store.ts';
import { PrevPositions, type Runner } from './runner.ts';

const MAX_STEPS_PER_FRAME = 40;
const FX_TAIL_STEPS = 3;

/** Supplies the inputs due at a tick. */
export type InputSource = (tick: number) => SimInput[];

/**
 * Runs a world in the browser with no server: the offline demo and replays.
 * `speed` is simulated ticks per real tick; 0 pauses.
 */
export class LocalRunner implements Runner {
  alpha = 1;
  speed = 1;
  private prev = new PrevPositions();
  private carry = 0;
  private last = performance.now();
  private chronicler: Chronicler;
  /** Highest tick the runner may reach, e.g. the end of a replay. */
  endTick = Infinity;

  constructor(
    private store: GameStore,
    private world: World,
    private inputs: InputSource,
  ) {
    this.chronicler = new Chronicler(store.names);
    store.resetWorld(world);
    store.conn = { phase: 'live' };
    store.serverNow = () => store.timeOfTick(this.world.tick);
  }

  frame(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.carry += (dt / TICK_MS) * this.speed;
    let steps = Math.floor(this.carry);
    this.carry -= steps;
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME;
      this.carry = 0;
    }
    steps = Math.min(steps, Math.max(0, this.endTick - this.world.tick));
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1) this.prev.capture(this.world);
      this.advance(steps - i <= FX_TAIL_STEPS);
    }
    this.alpha = this.speed > 0 && this.world.tick < this.endTick ? Math.min(1, this.carry) : 1;
  }

  /** Steps without rendering effects, for seeking. Chronicle entries are still recorded. */
  fastForward(toTick: number): void {
    while (this.world.tick < Math.min(toTick, this.endTick)) this.advance(false);
    this.prev.capture(this.world);
  }

  get tick(): number {
    return this.world.tick;
  }

  previousPosition(unitId: number, out: { x: number; y: number }): boolean {
    return this.prev.get(unitId, out);
  }

  stop(): void {
    this.speed = 0;
  }

  private advance(emit: boolean): void {
    const due = this.inputs(this.world.tick);
    const events = step(this.world, due);
    this.store.addChronicle(this.chronicler.narrate(this.world, due, events), emit);
    this.store.ticked(this.world);
    if (emit) this.store.stepped(events, this.world);
  }
}

/** A sparring war that runs entirely in the browser, for /demo. */
export function startDemo(store: GameStore, bots = 5, seed = Date.now() % 100000): LocalRunner {
  const rand = mulberry(seed);
  const params = { seed, slots: slotsFor(bots), members: bots };
  const world = createWorld(params, generateMap(params));
  const hues: number[] = [];
  const roster: RosterEntry[] = BOTS.slice(0, bots).map((b, p) => {
    const hue = nextHue(hues);
    hues.push(hue);
    return { p, login: b.login, id: -(p + 1), hue, slot: p, bot: true, avatarUrl: '' };
  });
  const repoIndex = new Map<string, number>();
  store.roster = roster;
  store.repos = [];
  const now = Date.now();
  const war: WarMeta = { id: 0, day: new Date(now).toISOString().slice(0, 10), status: 'active', startsAt: now, endsAt: now + 24 * 3600_000, seed, slots: params.slots, members: bots };
  store.war = war;
  store.warStartMs = now;
  store.viewerP = null;
  store.chronicle = [];
  // Demo bots push far more often than real developers so there is always something to watch.
  const perTick = 1 / (3.5 * TICKS_PER_MINUTE);
  const source: InputSource = (tick) => {
    const out: SimInput[] = [];
    if (tick === 0) for (const r of roster) out.push({ kind: 'join', p: r.p, slot: r.slot, hue: r.hue });
    for (const r of roster) {
      if (tick < 20 || rand() >= perTick * BOTS[r.p]!.rate) continue;
      const push = botPush(BOTS[r.p]!, rand);
      let repo = repoIndex.get(push.repo[0]);
      if (repo === undefined) {
        repo = store.repos.length;
        repoIndex.set(push.repo[0], repo);
        store.repos.push(push.repo);
      }
      out.push({ kind: 'push', p: r.p, repo, lines: push.lines, commits: 1 + Math.floor(rand() * 4), msg: push.message });
    }
    return out;
  };
  return new LocalRunner(store, world, source);
}

/**
 * A runner that replays a recorded war, from its start or from `from`, a world
 * restored from one of the war's keyframes. Inputs before the world's tick are skipped.
 */
export function startReplay(store: GameStore, replay: Replay, from?: World): LocalRunner {
  const params = replayParams(replay);
  const world = from ?? createWorld(params, generateMap(params));
  store.roster = replay.players.map((pl, p) => ({ ...pl, p, avatarUrl: pl.bot ? '' : `https://avatars.githubusercontent.com/u/${pl.id}?s=64` }));
  store.repos = replay.repos;
  store.warStartMs = replay.startsAt;
  store.replay = true;
  store.chronicle = [];
  const decoded = replay.inputs.map(decodeInput);
  let next = 0;
  const runner = new LocalRunner(store, world, (tick) => {
    const out: SimInput[] = [];
    while (next < decoded.length && decoded[next]!.tick < tick) next++;
    while (next < decoded.length && decoded[next]!.tick === tick) out.push(decoded[next++]!.input);
    return out;
  });
  runner.endTick = Math.floor((replay.endsAt - replay.startsAt) / replay.tickMs);
  return runner;
}
