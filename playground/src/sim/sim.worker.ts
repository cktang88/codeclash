// Runs the simulation off the main thread at a fixed 20 Hz (times the speed), and posts a snapshot
// after each batch of ticks. Inputs are stamped with the tick they apply on and echoed back, which
// is the log a lockstep client or a server would replay.
import { checksum, createWorld, snapshot, step, TICK_S, type SimInput, type UnitType, type World } from './sim.ts';

export type ToWorker =
  | { kind: 'init'; types: UnitType[]; seed: number }
  | { kind: 'input'; input: SimInput }
  | { kind: 'speed'; speed: number }
  | { kind: 'bench'; ticks: number };

let world: World | null = null;
let pending: SimInput[] = [];
let speed = 1;
let carry = 0;
let last = performance.now();
let simMs = 0;

function tick(): void {
  const now = performance.now();
  if (world) {
    carry += ((now - last) / 1000) * speed;
    let n = 0;
    const t0 = performance.now();
    // At most a second of catch-up per wake, so a stalled tab doesn't spiral.
    while (carry >= TICK_S && n < 20) {
      const due = pending.filter((i) => i.tick <= world!.tick);
      pending = pending.filter((i) => i.tick > world!.tick);
      step(world, due);
      carry -= TICK_S;
      n++;
    }
    if (n) {
      simMs = simMs * 0.9 + ((performance.now() - t0) / n) * 0.1;
      const s = snapshot(world);
      postMessage({ kind: 'snap', snap: s, simMs, sum: checksum(world) }, { transfer: [s.units.buffer, s.shots.buffer] });
    }
  }
  last = now;
  setTimeout(tick, 1000 / 60);
}
tick();

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.kind === 'init') {
    world = createWorld(m.types, m.seed);
    pending = [];
  } else if (m.kind === 'input' && world) {
    const input = { ...m.input, tick: world.tick + 1 } as SimInput;
    pending.push(input);
    postMessage({ kind: 'logged', input });
  } else if (m.kind === 'speed') speed = m.speed;
  else if (m.kind === 'bench' && world) {
    const t0 = performance.now();
    for (let i = 0; i < m.ticks; i++) step(world, []);
    postMessage({ kind: 'bench', ms: (performance.now() - t0) / m.ticks, ticks: m.ticks });
  }
};
