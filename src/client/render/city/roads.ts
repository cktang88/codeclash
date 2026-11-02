// The commandery's paths: a small graph of named places (doors, the well, the gate, the yard)
// joined by roads that people walk. Shortest routes by breadth-first search over a dozen nodes.

import { GATE_V, WALL } from './buildings.ts';

export const NODES = {
  out: [330, GATE_V + 4],
  bridge: [262, GATE_V + 2],
  gateOut: [WALL + 8, GATE_V],
  gateIn: [WALL - 12, GATE_V],
  cross: [190, GATE_V],
  granary: [182, 110],
  workshop: [190, 132],
  yardE: [150, 114],
  yard: [116, 112],
  yardN: [112, 62],
  chapel: [140, 56],
  keep: [66, 44],
  well: [72, 64],
  barracks: [54, 100],
  forge: [40, 140],
  stables: [54, 168],
  paddock: [72, 170],
  hospital: [148, 200],
  garden: [152, 182],
  yardS: [116, 160],
  eastLane: [216, 106],
  range: [214, 70],
} as const satisfies Record<string, readonly [number, number]>;
export type Place = keyof typeof NODES;

export const EDGES: [Place, Place][] = [
  ['out', 'bridge'], ['bridge', 'gateOut'], ['gateOut', 'gateIn'], ['gateIn', 'cross'], ['cross', 'granary'], ['cross', 'workshop'],
  ['cross', 'yardE'], ['yardE', 'yard'], ['yard', 'yardN'], ['yardN', 'chapel'], ['yardN', 'well'], ['well', 'keep'],
  ['yard', 'barracks'], ['barracks', 'forge'], ['yard', 'yardS'], ['yardS', 'stables'], ['stables', 'paddock'], ['forge', 'stables'],
  ['yardS', 'garden'], ['garden', 'hospital'], ['cross', 'eastLane'], ['eastLane', 'range'], ['yardE', 'chapel'], ['yardS', 'workshop'],
];

const adj = new Map<Place, Place[]>();
for (const [a, b] of EDGES) {
  adj.set(a, [...(adj.get(a) ?? []), b]);
  adj.set(b, [...(adj.get(b) ?? []), a]);
}

export function route(from: Place, to: Place): Place[] {
  if (from === to) return [to];
  const prev = new Map<Place, Place>();
  const q: Place[] = [from];
  const seen = new Set<Place>([from]);
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const m of adj.get(n) ?? []) {
      if (seen.has(m)) continue;
      seen.add(m);
      prev.set(m, n);
      q.push(m);
    }
  }
  const out: Place[] = [];
  for (let n: Place | undefined = to; n && n !== from; n = prev.get(n)) out.unshift(n);
  return out;
}

const SEG = EDGES.map(([a, b]) => {
  const [au, av] = NODES[a];
  const [bu, bv] = NODES[b];
  return { au, av, du: bu - au, dv: bv - av, l2: (bu - au) ** 2 + (bv - av) ** 2, u0: Math.min(au, bu), u1: Math.max(au, bu), v0: Math.min(av, bv), v1: Math.max(av, bv) };
});

/** Distance from (u, v) to the nearest road, in world units; Infinity beyond `max`. */
export function roadDistance(u: number, v: number, max = 8): number {
  let best = max * max;
  for (const e of SEG) {
    if (u < e.u0 - max || u > e.u1 + max || v < e.v0 - max || v > e.v1 + max) continue;
    const t = e.l2 ? Math.max(0, Math.min(1, ((u - e.au) * e.du + (v - e.av) * e.dv) / e.l2)) : 0;
    const x = u - e.au - t * e.du;
    const y = v - e.av - t * e.dv;
    const d = x * x + y * y;
    if (d < best) best = d;
  }
  return best >= max * max ? Infinity : Math.sqrt(best);
}
