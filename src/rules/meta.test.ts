import { describe, expect, it } from 'vitest';
import { Kind, KIND_COUNT, TICKS_PER_MINUTE, type PlayerState } from '../sim/api.ts';
import { generateMap } from '../sim/mapgen.ts';
import { createWorld, step } from '../sim/world.ts';
import type { Digest, DigestPlayer } from './digest.ts';
import {
  DEEDS,
  DEFAULT_HERALDRY,
  ORDERS,
  armoryCatalog,
  chooseHeraldry,
  chooseLegends,
  dayGlory,
  drawOrders,
  legendName,
  newDeeds,
  orderProgress,
  rankOf,
  seasonOf,
  seasonPoints,
  titlesFor,
} from './meta.ts';

function player(): PlayerState {
  const w = createWorld({ seed: 1, slots: 4, members: 2 }, generateMap({ seed: 1, slots: 4, members: 2 }));
  step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
  return w.players[0]!;
}

function digestPlayer(over: Partial<DigestPlayer> = {}): DigestPlayer {
  return {
    p: 0, login: 'ana', id: 1, bot: false, hue: 0, place: 1, renown: 100, pushes: 3,
    lines: new Array(9).fill(0), raised: new Array(KIND_COUNT).fill(0), slain: new Array(KIND_COUNT).fill(0),
    kills: 10, losses: 5, captures: 0, conquests: 0, capitals: 1, fallen: 0, rising: false, retakes: 0, standBest: 0, routs: 1, structureDamage: 0, best: null, awards: [],
    purposes: { fix: 0, feature: 0, refactor: 0, perf: 0, revert: 0, chore: 0, work: 0 }, fixes: 0, files: 0, branches: 0,
    quality: 1, veterancy: 0, churn: 0, filler: 0,
    ...over,
  } as DigestPlayer;
}

function digest(players: DigestPlayer[], conqueror: number | null = null, winner: number | null = conqueror): Digest {
  return { players, winner, victory: conqueror === null ? null : { p: conqueror, tick: 100 }, ring: [0, 0, 0, -1] } as unknown as Digest;
}

describe('orders', () => {
  it('draws three distinct, deterministic orders, never two of a family', () => {
    const a = drawOrders(42, 7);
    expect(a).toHaveLength(3);
    expect(drawOrders(42, 7).map((o) => o.id)).toEqual(a.map((o) => o.id));
    expect(new Set(a.map((o) => o.id.split('-')[0])).size).toBe(3);
    const varied = new Set(Array.from({ length: 50 }, (_, u) => drawOrders(42, u).map((o) => o.id).join()));
    expect(varied.size).toBeGreaterThan(20);
  });

  it('measures progress from battlefield feats only', () => {
    const p = player();
    const slay = ORDERS.find((o) => o.id === 'slay-40')!;
    expect(orderProgress(slay, p)).toMatchObject({ value: 0, done: false });
    p.kills = 55;
    expect(orderProgress(slay, p)).toMatchObject({ value: 40, goal: 40, done: true });
    const hold = ORDERS.find((o) => o.id === 'hold-10')!;
    p.feats.holdBest = 10 * TICKS_PER_MINUTE;
    expect(orderProgress(hold, p).done).toBe(true);
    const giant = ORDERS.find((o) => o.id === 'giant')!;
    p.slain[Kind.Dragon] = 1;
    expect(orderProgress(giant, p).done).toBe(true);
  });

  it('tracks feats deterministically in the sim', () => {
    const p = player();
    expect(p.feats).toEqual({ holdBest: 0, routsCaused: 0, returns: 0, standBest: 0, retakes: 0, homeKills: 0, ledTicks: 0 });
  });
});

describe('glory and rank', () => {
  it('climbs the ranks by thresholds', () => {
    expect(rankOf(0)).toMatchObject({ rank: 0, title: 'Squire', next: 200 });
    expect(rankOf(600)).toMatchObject({ rank: 2, title: 'Knight' });
    expect(rankOf(1e9)).toMatchObject({ rank: 7, title: 'Legend', next: null });
  });

  it('pays for placing, awards and streaks, and nothing for a day not fought', () => {
    const first = dayGlory(digestPlayer({ awards: ['warlord'] }), 3);
    expect(first.map((g) => g.amount)).toEqual([100, 30, 30]);
    expect(dayGlory(digestPlayer({ place: 5 }), 0).map((g) => g.source)).toEqual(['fought']);
    expect(dayGlory(digestPlayer({ pushes: 0, kills: 0 }), 9)).toEqual([]);
  });
});

describe('the armory', () => {
  it('unlocks cosmetics by rank and refuses locked choices', () => {
    const squire = armoryCatalog(0);
    expect(squire.find((i) => i.slot === 'keep' && i.value === 'citadel')!.unlocked).toBe(false);
    expect(armoryCatalog(5).find((i) => i.slot === 'keep' && i.value === 'citadel')!.unlocked).toBe(true);
    const { heraldry, refused } = chooseHeraldry(DEFAULT_HERALDRY, { keep: 'citadel', pattern: 'chevron', emblem: 'nonsense' as never }, 0, []);
    expect(heraldry.pattern).toBe('chevron');
    expect(heraldry.keep).toBe('stone');
    expect(refused).toEqual(['emblem', 'keep']);
  });

  it('only allows titles the player has earned', () => {
    const titles = titlesFor(2, ['dragonslayer']);
    expect(titles).toEqual(['Man-at-Arms', 'Knight', 'Dragonslayer']);
    expect(chooseHeraldry(DEFAULT_HERALDRY, { title: 'Legend' }, 2, titles).refused).toEqual(['title']);
    expect(chooseHeraldry(DEFAULT_HERALDRY, { title: 'Dragonslayer' }, 2, titles).heraldry.title).toBe('Dragonslayer');
  });
});

describe('legends', () => {
  it('names survivors, great captains and the ring’s conqueror deterministically', () => {
    const d = digest([digestPlayer({ best: { repo: 'ana/parser', ordinal: 2, kills: 25, message: 'x' } }), digestPlayer({ p: 1, login: 'bo', place: 2, bot: true })], 0);
    const legends = chooseLegends(9, [{ p: 0, unitId: 77, kind: Kind.Dragon, platoonKills: 12, repo: 'ana/parser' }], d);
    expect(legends.map((l) => l.kind)).toEqual(['survivor', 'captain', 'conqueror']);
    expect(legends[2]!.deeds[0]).toContain('all 3 capitals');
    expect(legends[0]!.name).toBe(legendName(9 ^ 77, true).name);
    expect(chooseLegends(9, [{ p: 0, unitId: 77, kind: Kind.Dragon, platoonKills: 12, repo: 'ana/parser' }], d)).toEqual(legends);
  });

  it('caps each player at three legends a day', () => {
    const survivors = Array.from({ length: 6 }, (_, i) => ({ p: 0, unitId: i, kind: Kind.Champion, platoonKills: 0, repo: 'a/b' }));
    expect(chooseLegends(1, survivors, digest([digestPlayer()]))).toHaveLength(3);
  });
});

describe('seasons', () => {
  it('groups days into ISO weeks', () => {
    expect(seasonOf('2026-10-23')).toBe('2026-W43');
    expect(seasonOf('2026-10-26')).toBe('2026-W44');
    expect(seasonOf('2027-01-01')).toBe('2026-W53');
  });

  it('scores places, and nothing for a day not fought', () => {
    expect(seasonPoints(digestPlayer({ place: 1 }))).toBe(10);
    expect(seasonPoints(digestPlayer({ place: 9 }))).toBe(1);
    expect(seasonPoints(digestPlayer({ pushes: 0, kills: 0 }))).toBe(0);
  });
});

describe('deeds', () => {
  it('has about thirty unique deeds', () => {
    expect(DEEDS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(DEEDS.map((d) => d.id)).size).toBe(DEEDS.length);
  });

  it('awards new deeds once', () => {
    const slain = new Array(KIND_COUNT).fill(0);
    slain[Kind.Dragon] = 1;
    const ctx = { pl: digestPlayer({ kills: 120, slain, routs: 0, conquests: 2, retakes: 1 }), digest: digest([], 0), ordersDone: 3, streak: 7, wins: 1, days: 10, legendsNamed: 0 };
    const ids = newDeeds(ctx, new Set()).map((d) => d.id);
    for (const id of ['first-blood', 'centurion', 'victor', 'ringholder', 'siegebreaker', 'phoenix', 'dragonslayer', 'unbroken', 'orders-3', 'streak-7', 'days-10']) expect(ids).toContain(id);
    expect(newDeeds(ctx, new Set(ids))).toEqual([]);
  });
});
