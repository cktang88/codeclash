import type { SimInput, WorldSnapshot } from '../../sim/api.ts';
import { Chronicler, type ChronicleEntry } from '../../sim/chronicle.ts';
import { generateMap } from '../../sim/mapgen.ts';
import { decodeInput, replayParams } from '../../sim/replay.ts';
import { restore, snapshot } from '../../sim/snapshot.ts';
import { createWorld, step } from '../../sim/world.ts';
import type { SeekJob } from './seek.ts';

/**
 * A replay run forward to `job.to`: the inputs due at each tick, exactly as LocalRunner (startReplay)
 * feeds them, narrated by a chronicler with the page's names. Pure, for the worker and for tests.
 */
export function runSeek(job: SeekJob, onProgress?: (tick: number) => void): { snapshot: WorldSnapshot; chronicle: ChronicleEntry[] } {
  const params = replayParams(job.replay);
  const world = job.from ? restore(job.from) : createWorld(params, generateMap(params));
  const chronicler = new Chronicler({
    player: (p) => (job.players[p] ? `@${job.players[p]}` : `Player ${p + 1}`),
    repo: (i) => job.repos[i] ?? 'a repository',
  });
  const decoded = job.replay.inputs.map(decodeInput);
  let next = 0;
  while (next < decoded.length && decoded[next]!.tick < world.tick) next++;
  const chronicle: ChronicleEntry[] = [];
  while (world.tick < job.to) {
    const due: SimInput[] = [];
    while (next < decoded.length && decoded[next]!.tick === world.tick) due.push(decoded[next++]!.input);
    const ev = step(world, due);
    for (const entry of chronicler.narrate(world, due, ev)) chronicle.push(entry);
    if (chronicle.length > job.keep * 2) chronicle.splice(0, chronicle.length - job.keep);
    onProgress?.(world.tick);
  }
  return { snapshot: snapshot(world), chronicle: chronicle.slice(-job.keep) };
}
