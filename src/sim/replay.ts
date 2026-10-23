import { CAT_COUNT, TICK_MS, type SimInput, type TimedInput, type WarParams, type World } from './api.ts';
import { generateMap } from './mapgen.ts';
import { createWorld, step } from './world.ts';

export interface ReplayPlayer {
  login: string;
  /** GitHub numeric id, or a negative id for sparring bots. */
  id: number;
  hue: number;
  slot: number;
  bot: boolean;
}

export type RepoRef = [name: string, language: string | null];

/** A war, reduced to exactly what rebuilds it. */
export interface Replay {
  v: 1;
  seed: number;
  slots: number;
  members: number;
  tickMs: number;
  startsAt: number;
  endsAt: number;
  players: ReplayPlayer[];
  /** [owner/name, language] per repository; push inputs refer to these by index. */
  repos: RepoRef[];
  inputs: EncodedInput[];
}

/**
 * [tick, 'join', p, slot, hue]
 * [tick, 'push', p, repo, lines[9], commits, message]
 * [tick, 'doc', p, doctrine] · [tick, 'rally', p, site] · [tick, 'cry', p]
 */
export type EncodedInput =
  | [number, 'join', number, number, number]
  | [number, 'push', number, number, number[], number, string]
  | [number, 'doc', number, number]
  | [number, 'rally', number, number]
  | [number, 'cry', number];

export function encodeInput(tick: number, input: SimInput): EncodedInput {
  switch (input.kind) {
    case 'join':
      return [tick, 'join', input.p, input.slot, input.hue];
    case 'push':
      return [tick, 'push', input.p, input.repo, input.lines.map((n) => Math.max(0, Math.floor(n))), input.commits, input.msg];
    case 'doctrine':
      return [tick, 'doc', input.p, input.doctrine];
    case 'rally':
      return [tick, 'rally', input.p, input.site];
    case 'cry':
      return [tick, 'cry', input.p];
  }
}

export function decodeInput(e: EncodedInput): { tick: number; input: SimInput } {
  const tick = e[0];
  switch (e[1]) {
    case 'join':
      return { tick, input: { kind: 'join', p: e[2], slot: e[3], hue: e[4] } };
    case 'push': {
      const lines = Array.from({ length: CAT_COUNT }, (_, i) => e[4][i] ?? 0);
      return { tick, input: { kind: 'push', p: e[2], repo: e[3], lines, commits: e[5], msg: e[6] } };
    }
    case 'doc':
      return { tick, input: { kind: 'doctrine', p: e[2], doctrine: e[3] as 0 } };
    case 'rally':
      return { tick, input: { kind: 'rally', p: e[2], site: e[3] } };
    case 'cry':
      return { tick, input: { kind: 'cry', p: e[2] } };
  }
}

export function replayParams(r: Pick<Replay, 'seed' | 'slots' | 'members'>): WarParams {
  return { seed: r.seed, slots: r.slots, members: r.members };
}

export function timedInputs(r: Replay): TimedInput[] {
  return r.inputs.map((e, seq) => ({ ...decodeInput(e), seq: seq + 1 }));
}

/** Rebuilds the world of a replay at `tick` from scratch. */
export function runReplay(r: Replay, tick: number, onStep?: (world: World) => void): World {
  if (r.tickMs !== TICK_MS) throw new Error(`replay tick ${r.tickMs}ms does not match simulation ${TICK_MS}ms`);
  const params = replayParams(r);
  const world = createWorld(params, generateMap(params));
  const inputs = timedInputs(r);
  let next = 0;
  while (world.tick < tick) {
    const due: SimInput[] = [];
    while (next < inputs.length && inputs[next]!.tick <= world.tick) due.push(inputs[next++]!.input);
    step(world, due);
    onStep?.(world);
  }
  return world;
}
