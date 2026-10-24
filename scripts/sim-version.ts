// Prints (and exports) the simulation's version: a hash of everything a spectator's client must
// share with the server to stay in lockstep (src/sim and the wire protocol). Builds bake it into
// both the client and the server; a client whose version differs from the server's reloads.
// `pnpm tsx scripts/sim-version.ts`
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

export function simVersion(root = ROOT): string {
  const h = createHash('sha256');
  const list = [...files(join(root, 'src/sim')), join(root, 'src/protocol.ts')].sort();
  for (const f of list) {
    h.update(relative(root, f).replace(/\\/g, '/'));
    h.update('\0');
    // Line endings must not change the version between checkouts.
    h.update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(simVersion());
