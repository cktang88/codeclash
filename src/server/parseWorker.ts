// A worker thread that reads, classifies and parses pushes (`preparePush`), so tree-sitter never
// blocks the event loop. The result is plain data the main thread applies to the ledger.

import { parentPort } from 'node:worker_threads';
import type { ChangedFile } from '../rules/classify.ts';
import { loadGrammars } from '../rules/complexity.ts';
import { preparePush } from '../rules/ledger.ts';

interface Job {
  id: number;
  diffs: ChangedFile[][];
}

parentPort?.on('message', (job: Job) => {
  void (async () => {
    try {
      await loadGrammars(job.diffs.flat());
      parentPort!.postMessage({ id: job.id, prepared: job.diffs.map((files) => preparePush(files)) });
    } catch (err) {
      parentPort!.postMessage({ id: job.id, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
