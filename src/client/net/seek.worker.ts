// Runs a replay forward to a tick (seek.ts) off the main thread.
import type { SeekJob, SeekMessage } from './seek.ts';
import { runSeek } from './seekcore.ts';

const scope = self as unknown as { onmessage: ((e: MessageEvent<SeekJob>) => void) | null; postMessage(msg: SeekMessage): void };

scope.onmessage = (e) => {
  try {
    let reported = performance.now();
    const done = runSeek(e.data, (tick) => {
      const now = performance.now();
      if (now - reported < 100) return;
      reported = now;
      scope.postMessage({ type: 'progress', tick });
    });
    scope.postMessage({ type: 'done', ...done });
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
