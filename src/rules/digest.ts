import { CAT_COUNT, Cat, Kind, KIND_COUNT, type World } from '../sim/api.ts';
import type { ChronicleEntry } from '../sim/chronicle.ts';
import { decodeInput, type Replay } from '../sim/replay.ts';

export interface AwardDef {
  id: string;
  title: string;
  blurb: string;
}

export const AWARDS: readonly AwardDef[] = [
  { id: 'victor', title: 'Victor of the Day', blurb: 'Most renown when the war ended' },
  { id: 'warlord', title: 'Warlord', blurb: 'Most enemy soldiers slain' },
  { id: 'iron-wall', title: 'Iron Wall', blurb: 'Fewest losses for every soldier raised' },
  { id: 'test-legion', title: 'Test Legion', blurb: 'Most lines of tests pushed' },
  { id: 'scribe', title: 'Scribe', blurb: 'Most docs and comment lines pushed' },
  { id: 'demolisher', title: 'Demolisher', blurb: 'Most lines deleted' },
  { id: 'siegebreaker', title: 'Siegebreaker', blurb: 'Most damage dealt to capitals' },
  { id: 'monolith-slayer', title: 'Monolith Slayer', blurb: 'Most damage dealt to the Legacy Monolith' },
  { id: 'ghost', title: 'Ghost', blurb: 'Most renown for every push' },
  { id: 'militia-mob', title: 'Militia Mob', blurb: 'Most generated lines pushed (affectionately)' },
  { id: 'standard-bearer', title: 'Standard Bearer', blurb: 'Most balanced pushes: code, tests and docs together' },
  { id: 'conqueror', title: 'Conqueror', blurb: 'Most shrines and Hearts captured' },
  { id: 'dragonlord', title: 'Dragonlord', blurb: 'Summoned the most Dragons with legendary pushes' },
  { id: 'dragonslayer', title: 'Dragonslayer', blurb: 'Brought down the most Dragons' },
];

export interface DigestPlayer {
  p: number;
  login: string;
  id: number;
  bot: boolean;
  hue: number;
  place: number;
  renown: number;
  pushes: number;
  lines: number[];
  raised: number[];
  /** Enemy soldiers slain, by kind. */
  slain: number[];
  kills: number;
  losses: number;
  captures: number;
  sacks: number;
  routs: number;
  balanced: number;
  structureDamage: number;
  monolithDamage: number;
  best: { repo: string; ordinal: number; kills: number; message: string } | null;
  awards: string[];
}

export interface DigestAward {
  id: string;
  title: string;
  blurb: string;
  p: number;
  value: number;
}

export interface Digest {
  startsAt: number;
  endsAt: number;
  ticks: number;
  winner: number | null;
  players: DigestPlayer[];
  awards: DigestAward[];
  highlights: ChronicleEntry[];
  totals: { lines: number[]; raised: number[]; pushes: number; kills: number };
  repos: { name: string; language: string | null; pushes: number; p: number }[];
  monolith: { fallen: boolean; by: number | null; tick: number | null };
  headline: string;
}

const HIGHLIGHT_KINDS = new Set(['monolith', 'dragon', 'sack', 'clash', 'champion', 'capture', 'leader', 'cry']);
const HIGHLIGHT_WEIGHT: Record<string, number> = { monolith: 100, dragon: 90, sack: 80, clash: 60, champion: 40, cry: 30, leader: 25, capture: 10 };
const MAX_HIGHLIGHTS = 12;

/** The day's recap. Pure: the same war always yields the same digest. */
export function buildDigest(world: World, replay: Replay, chronicle: readonly ChronicleEntry[]): Digest {
  const players = world.players.map((ps): DigestPlayer => {
    const meta = replay.players[ps.p]!;
    return {
      p: ps.p,
      login: meta.login,
      id: meta.id,
      bot: meta.bot,
      hue: ps.hue,
      place: 0,
      renown: ps.renown,
      pushes: ps.pushes,
      lines: ps.lines.slice(),
      raised: ps.raised.slice(),
      slain: ps.slain.slice(),
      kills: ps.kills,
      losses: ps.losses,
      captures: ps.captures,
      sacks: ps.sacks,
      routs: ps.routs,
      balanced: ps.balanced,
      structureDamage: Math.round(ps.structureDamage),
      monolithDamage: Math.round(ps.monolithDamage),
      best: null,
      awards: [],
    };
  });

  const ranked = players.slice().sort((a, b) => b.renown - a.renown || a.p - b.p);
  ranked.forEach((pl, i) => (pl.place = i + 1));
  const winner = ranked[0] && ranked[0].renown > 0 ? ranked[0].p : null;

  // Best platoons: recover the commit message of the push that raised them.
  const pushesBy = new Map<string, string[]>();
  for (const e of replay.inputs) {
    const { input } = decodeInput(e);
    if (input.kind !== 'push') continue;
    const key = `${input.p}:${input.repo}`;
    const list = pushesBy.get(key) ?? [];
    list.push(input.msg);
    pushesBy.set(key, list);
  }
  for (const ps of world.players) {
    if (!ps.best) continue;
    const [repo, ordinal, kills] = ps.best;
    players[ps.p]!.best = { repo: replay.repos[repo]?.[0] ?? '?', ordinal, kills, message: pushesBy.get(`${ps.p}:${repo}`)?.[ordinal - 1] ?? '' };
  }

  const awards: DigestAward[] = [];
  const give = (id: string, score: (pl: DigestPlayer) => number, eligible: (pl: DigestPlayer) => boolean = () => true) => {
    let best: DigestPlayer | null = null;
    let bestScore = 0;
    for (const pl of players) {
      if (!eligible(pl)) continue;
      const s = score(pl);
      if (s > bestScore || (best && s === bestScore && pl.p < best.p)) {
        best = pl;
        bestScore = s;
      }
    }
    if (!best || bestScore <= 0) return;
    const def = AWARDS.find((a) => a.id === id)!;
    awards.push({ ...def, p: best.p, value: Math.round(bestScore * 100) / 100 });
    best.awards.push(id);
  };
  const raisedTotal = (pl: DigestPlayer) => pl.raised.reduce((a, b) => a + b, 0);
  if (winner !== null) give('victor', (pl) => (pl.p === winner ? pl.renown : 0));
  give('warlord', (pl) => pl.kills);
  give('iron-wall', (pl) => raisedTotal(pl) / (1 + pl.losses), (pl) => raisedTotal(pl) >= 20);
  give('test-legion', (pl) => pl.lines[Cat.Test]!);
  give('scribe', (pl) => pl.lines[Cat.Docs]! + pl.lines[Cat.Comment]!);
  give('demolisher', (pl) => pl.lines[Cat.Removed]!);
  give('siegebreaker', (pl) => pl.structureDamage);
  give('monolith-slayer', (pl) => pl.monolithDamage);
  give('ghost', (pl) => pl.renown / pl.pushes, (pl) => pl.pushes > 0);
  give('militia-mob', (pl) => pl.lines[Cat.Generated]!);
  give('standard-bearer', (pl) => pl.balanced);
  give('conqueror', (pl) => pl.captures);
  give('dragonlord', (pl) => pl.raised[Kind.Dragon]!);
  give('dragonslayer', (pl) => pl.slain[Kind.Dragon]!);

  const highlights = chronicle
    .filter((e) => HIGHLIGHT_KINDS.has(e.kind))
    .map((e, i) => ({ e, i, w: (HIGHLIGHT_WEIGHT[e.kind] ?? 0) + (e.kind === 'clash' ? (e.units?.[0] ?? 0) : 0) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, MAX_HIGHLIGHTS)
    .sort((a, b) => a.e.tick - b.e.tick || a.i - b.i)
    .map((x) => x.e);

  const totals = { lines: new Array<number>(CAT_COUNT).fill(0), raised: new Array<number>(KIND_COUNT).fill(0), pushes: 0, kills: 0 };
  for (const pl of players) {
    for (let c = 0; c < CAT_COUNT; c++) totals.lines[c]! += pl.lines[c]!;
    for (let k = 0; k < KIND_COUNT; k++) totals.raised[k]! += pl.raised[k]!;
    totals.pushes += pl.pushes;
    totals.kills += pl.kills;
  }

  const repoPushes = new Map<number, { p: number; pushes: number }>();
  for (const e of replay.inputs) {
    const { input } = decodeInput(e);
    if (input.kind !== 'push') continue;
    const r = repoPushes.get(input.repo) ?? { p: input.p, pushes: 0 };
    r.pushes++;
    repoPushes.set(input.repo, r);
  }
  const repos = [...repoPushes.entries()]
    .map(([i, r]) => ({ name: replay.repos[i]?.[0] ?? '?', language: replay.repos[i]?.[1] ?? null, pushes: r.pushes, p: r.p }))
    .sort((a, b) => b.pushes - a.pushes || a.name.localeCompare(b.name));

  const fall = chronicle.find((e) => e.kind === 'monolith');
  return {
    startsAt: replay.startsAt,
    endsAt: replay.endsAt,
    ticks: world.tick,
    winner,
    players,
    awards,
    highlights,
    totals,
    repos,
    monolith: { fallen: world.monolithFallen, by: fall ? fall.p : null, tick: fall ? fall.tick : null },
    headline: headline(players, winner, world, totals.pushes),
  };
}

function headline(players: readonly DigestPlayer[], winner: number | null, world: World, pushes: number): string {
  if (pushes === 0 || winner === null) return 'A quiet day. No banners were raised and the Monolith stood unchallenged.';
  const w = players[winner]!;
  const second = players.find((pl) => pl.place === 2);
  const margin = second ? w.renown - second.renown : w.renown;
  const fallen = world.monolithFallen ? ' after the Monolith fell' : ' while the Monolith still stood';
  if (second && margin <= Math.max(5, w.renown * 0.05)) return `@${w.login} edged out @${second.login} by ${margin} renown${fallen}.`;
  if (w.sacks > 0) return `@${w.login} won the day, sacking ${w.sacks === 1 ? 'a capital' : `${w.sacks} capitals`}${fallen}.`;
  return `@${w.login} won the day with ${w.renown} renown${fallen}.`;
}
