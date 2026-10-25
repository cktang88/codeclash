import { describe, expect, it } from 'vitest';
import { KIND_COUNT, Kind, PlatoonState, TICKS_PER_MINUTE, type Platoon, type SimInput, type Unit, type World } from './api.ts';
import { COLUMN_ORDER, COLUMN_WIDTH, Form, columnFormation, extent, lineFormation, pitch, type Slot } from './formation.ts';
import { HEX_STEP, hexCenterX, hexCenterY, hexGrid, hexPassable, hexRoute } from './hexroute.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { indexWorld, scratchFor } from './scratch.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { STATS } from './stats.ts';
import { clearPath } from './steering.ts';
import { attackerCap, pickTarget } from './tactics.ts';
import { DEPLOY_RADIUS, STANDDOWN_RADIUS, STANDDOWN_TICKS, createWorld, placeOf, step } from './world.ts';

function newWorld(players: number, seed: number): World {
  const params = { seed, slots: slotsFor(players), members: players };
  return createWorld(params, generateMap(params));
}

const joins = (n: number): SimInput[] => Array.from({ length: n }, (_, p) => ({ kind: 'join', p, slot: p, hue: p * 40 }));
const L = (code: number, test = 0, comment = 0, docs = 0, config = 0, removed = 0) => [code, test, comment, docs, config, removed, 0, 0, 0];
const push = (p: number, lines: number[], msg = 'wip', files = 4, branches = 0): SimInput => ({ kind: 'push', p, repo: p, commits: 1, msg, lines, files, branches, churn: 0, filler: 0 });

/** One of every kind but the Dragon, in plausible numbers. */
const MIXED: number[] = (() => {
  const c = new Array<number>(KIND_COUNT).fill(0);
  c[Kind.Footman] = 12; c[Kind.Knight] = 4; c[Kind.Warden] = 3; c[Kind.Paladin] = 2; c[Kind.Archer] = 5; c[Kind.Ranger] = 2;
  c[Kind.Herald] = 1; c[Kind.Wizard] = 2; c[Kind.Sapper] = 2; c[Kind.Trebuchet] = 2; c[Kind.Outrider] = 4; c[Kind.GriffinRider] = 2;
  c[Kind.Skeleton] = 3; c[Kind.BoneGolem] = 1; c[Kind.Mercenary] = 2; c[Kind.Troll] = 1; c[Kind.Berserker] = 3; c[Kind.Cleric] = 2;
  c[Kind.Champion] = 1; c[Kind.Dragon] = 1;
  return c;
})();

const of = (slots: Slot[], k: Kind) => slots.filter((s) => s.kind === k);
const maxF = (s: Slot[]) => Math.max(...s.map((x) => x.f));
const minF = (s: Slot[]) => Math.min(...s.map((x) => x.f));

/** No slot of another ground kind lies inside the bounding box of a block. */
function contiguous(slots: Slot[], block: Slot[]): boolean {
  const f0 = minF(block) - 0.01;
  const f1 = maxF(block) + 0.01;
  const l0 = Math.min(...block.map((s) => s.l)) - 0.01;
  const l1 = Math.max(...block.map((s) => s.l)) + 0.01;
  return !slots.some((s) => s.kind !== block[0]!.kind && !STATS[s.kind]!.flying && s.f > f0 && s.f < f1 && s.l > l0 && s.l < l1);
}

describe('formations', () => {
  it('marches as a narrow, deep column, kind after kind in march order', () => {
    const col = columnFormation(MIXED);
    expect(col).toHaveLength(MIXED.reduce((a, b) => a + b, 0));
    const { width, depth } = extent(col);
    expect(width).toBeLessThanOrEqual(Math.max(COLUMN_WIDTH, pitch(Kind.Troll)) + 1);
    expect(depth).toBeGreaterThan(width * 4);
    // Each kind's block lies wholly behind the one before it in the march order.
    const present = COLUMN_ORDER.filter((k) => MIXED[k]! > 0);
    for (let i = 1; i < present.length; i++) expect(maxF(of(col, present[i]!)), STATS[present[i]!]!.name).toBeLessThan(minF(of(col, present[i - 1]!)));
    expect(maxF(of(col, Kind.Outrider))).toBe(maxF(col.filter((s) => !STATS[s.kind]!.flying)));
    expect(minF(of(col, Kind.Trebuchet))).toBe(minF(col.filter((s) => !STATS[s.kind]!.flying)));
    for (const k of present) expect(contiguous(col, of(col, k)), STATS[k]!.name).toBe(true);
  });

  it('fights as a wide, shallow line: brutes ahead, foot in front, missiles, healers and siege behind, cavalry on the wings', () => {
    const line = lineFormation(MIXED);
    const { width, depth } = extent(line);
    expect(width).toBeGreaterThan(depth * 1.5);
    const foot = of(line, Kind.Footman);
    expect(minF(of(line, Kind.Troll))).toBeGreaterThan(maxF(foot));
    expect(minF(of(line, Kind.Berserker))).toBeGreaterThan(maxF(foot));
    // The Champion stands in the front rank with the foot: their blocks' front edges are level.
    expect(maxF(of(line, Kind.Champion)) + pitch(Kind.Champion) / 2).toBeCloseTo(maxF(foot) + pitch(Kind.Footman) / 2, 6);
    expect(Math.abs(of(line, Kind.Champion)[0]!.l)).toBeLessThan(20);
    for (const k of [Kind.Cleric, Kind.Herald, Kind.Paladin]) expect(maxF(of(line, k))).toBeLessThan(minF(foot));
    for (const k of [Kind.Archer, Kind.Ranger, Kind.Wizard]) {
      expect(maxF(of(line, k))).toBeLessThan(minF(foot));
      expect(minF(foot) - maxF(of(line, k))).toBeLessThan(70);
    }
    expect(maxF(of(line, Kind.Trebuchet))).toBeLessThan(minF(of(line, Kind.Archer)));
    const footReach = Math.max(...foot.map((s) => Math.abs(s.l)));
    for (const k of [Kind.Knight, Kind.Outrider]) {
      const riders = of(line, k);
      expect(Math.min(...riders.map((s) => Math.abs(s.l)))).toBeGreaterThan(footReach);
      expect(riders.some((s) => s.l > 0) && riders.some((s) => s.l < 0)).toBe(true);
      // Each wing is a block of its own.
      expect(contiguous(line, riders.filter((s) => s.l > 0))).toBe(true);
      expect(contiguous(line, riders.filter((s) => s.l < 0))).toBe(true);
    }
    for (let k = 0; k < KIND_COUNT; k++) {
      if (MIXED[k]! === 0 || k === Kind.Knight || k === Kind.Outrider || STATS[k]!.flying) continue;
      expect(contiguous(line, of(line, k as Kind)), STATS[k]!.name).toBe(true);
    }
  });

  it('narrows a line to the ground it has, deepening blocks and sending the cavalry behind', () => {
    const open = lineFormation(MIXED);
    const narrow = lineFormation(MIXED, 120);
    expect(narrow).toHaveLength(open.length);
    expect(extent(narrow).width).toBeLessThanOrEqual(120 + pitch(Kind.Troll));
    expect(extent(narrow).depth).toBeGreaterThan(extent(open).depth);
    expect(maxF(of(narrow, Kind.Knight))).toBeLessThan(minF(of(narrow, Kind.Footman)));
  });
});

describe('the hex road map', () => {
  it('finds the same route every time, over open ground only, around the ring and never across its centre', () => {
    for (const [players, seed] of [[4, 2], [8, 42], [14, 7]] as const) {
      const w = newWorld(players, seed);
      const grid = hexGrid(w.map);
      for (let slot = 0; slot < w.map.slots; slot++) {
        const from = w.map.sites[slot]!;
        // The capital across the ring: the road to it runs the long way round the centre.
        const far = w.map.sites[(slot + Math.floor(w.map.slots / 2)) % w.map.slots]!;
        const route = hexRoute(w.map, from.x, from.y, far.x, far.y);
        expect(route.length).toBeGreaterThan(3);
        grid.routes.clear();
        expect(hexRoute(w.map, from.x, from.y, far.x, far.y)).toEqual(route);
        let length = 0;
        for (let k = 0; k < route.length; k++) {
          const x = hexCenterX(w.map, route[k]!);
          const y = hexCenterY(w.map, route[k]!);
          expect(hexPassable(w.map, route[k]!)).toBe(true);
          expect(Math.hypot(x, y)).toBeGreaterThan(w.map.centre);
          if (k > 0) {
            const px = hexCenterX(w.map, route[k - 1]!);
            const py = hexCenterY(w.map, route[k - 1]!);
            expect(clearPath(w.map, px, py, x, y)).toBe(true);
            length += Math.hypot(x - px, y - py);
          }
        }
        // Around, not across: at least as long as the shorter arc's chord-free path along the ring.
        expect(length).toBeGreaterThan(Math.hypot(far.x - from.x, far.y - from.y) * 1.2);
        const last = route[route.length - 1]!;
        expect(Math.hypot(hexCenterX(w.map, last) - far.x, hexCenterY(w.map, last) - far.y)).toBeLessThan(HEX_STEP);
      }
    }
  });
});

/** Distance from (x, y) to the polyline through `pts`. */
function toPolyline(x: number, y: number, pts: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}

describe('the march', () => {
  it('follows its hex route, the column filing along behind the banner', () => {
    const w = newWorld(2, 42);
    step(w, joins(2));
    step(w, [push(0, L(500, 40))]);
    const pl = w.platoons.find((p) => p.p === 0)!;
    // The war council hands out an objective on the front within a few seconds (a border fort), and the platoon plans its road there.
    for (let t = 0; t < 20 && (pl.site === pl.home || pl.routeSite !== pl.site); t++) step(w, []);
    expect(w.map.sites[pl.site]!.kind).toBe('fort');
    expect(pl.routeSite).toBe(pl.site);
    const road = [{ x: pl.x, y: pl.y }, ...pl.route.map((h) => ({ x: hexCenterX(w.map, h), y: hexCenterY(w.map, h) }))];
    let worst = 0;
    let worstLag = 0;
    for (let t = 0; t < 2 * TICKS_PER_MINUTE && pl.state === PlatoonState.March && pl.form === Form.Column; t++) {
      step(w, []);
      worst = Math.max(worst, toPolyline(pl.x, pl.y, road));
      // Once the column has filed out of the gate, its soldiers keep their places as it winds along the road.
      if (t > 60 && pl.form === Form.Column) worstLag = Math.max(worstLag, pl.lag);
    }
    expect(worst).toBeLessThan(HEX_STEP * 0.6);
    expect(pl.route.length).toBeLessThan(road.length - 5);
    expect(worstLag).toBeGreaterThan(0);
    expect(worstLag).toBeLessThan(6);
  });
});

interface Standoff {
  w: World;
  a: Platoon;
  b: Platoon;
  /** Holds platoon B's banner and soldiers at `d` from A's centre of mass, ahead of it or (`side`) square to its right. */
  pin: (d: number, side?: number) => void;
}

/** Two armies; B is held in place wherever a test puts it. */
function standoff(aLines = L(300, 30), aMsg = 'wip', seed = 42, objective?: number): Standoff {
  const w = newWorld(2, seed);
  step(w, joins(2));
  step(w, [push(0, aLines, aMsg), push(1, L(80, 10))]);
  // `objective` (a site, or -1 for the last) holds A's platoons on one objective whatever their war council says.
  const site = objective === undefined ? -1 : objective < 0 ? w.map.sites.length + objective : objective;
  const hold = () => {
    if (site >= 0) for (const pl of w.platoons) if (pl.p === 0) pl.site = site;
  };
  for (let t = 0; t < 20; t++) {
    hold();
    step(w, []);
  }
  const a = w.platoons.find((p) => p.p === 0 && p.state !== PlatoonState.Queued)!;
  const b = w.platoons.find((p) => p.p === 1 && p.state !== PlatoonState.Queued)!;
  let fx = a.hx;
  let fy = a.hy;
  const pin = (d: number, side = 0) => {
    hold();
    // Ahead of A along its facing when first pinned, or square to its right with `side`.
    if (side === 0) {
      fx = a.hx;
      fy = a.hy;
    }
    const mineA = w.units.filter((u) => u.platoon === a.id);
    const cx = mineA.reduce((t, u) => t + u.x, 0) / mineA.length;
    const cy = mineA.reduce((t, u) => t + u.y, 0) / mineA.length;
    const x = cx + (side === 0 ? fx : -fy) * d;
    const y = cy + (side === 0 ? fy : fx) * d;
    b.x = x;
    b.y = y;
    const mine = w.units.filter((u) => u.platoon === b.id);
    mine.forEach((u, k) => {
      u.x = x + ((k % 3) - 1) * 8;
      u.y = y + (Math.floor(k / 3) - 1) * 8;
      u.target = 0;
    });
  };
  return { w, a, b, pin };
}

function forms(w: World, id: number, ticks: number, each?: () => void): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    each?.();
    for (const f of step(w, []).forms) if (f.platoon === id) out.push(f.form);
  }
  return out;
}

describe('deployment', () => {
  it('deploys into line as an enemy closes, holds it in the hysteresis band, and only then marches on in column', () => {
    const { w, a, pin } = standoff();
    expect(a.form).toBe(Form.Column);
    // Well beyond the deploy radius: the column marches on.
    expect(forms(w, a.id, 30, () => pin(DEPLOY_RADIUS + 60))).toEqual([]);
    expect(a.form).toBe(Form.Column);
    // Inside it: halt, wheel and deploy.
    const deploying = forms(w, a.id, 60, () => pin(DEPLOY_RADIUS - 20));
    expect(deploying).toEqual([Form.Deploying, Form.Line]);
    // Between the deploy and stand-down radii the line stands, without flip-flopping.
    expect(forms(w, a.id, 120, () => pin((DEPLOY_RADIUS + STANDDOWN_RADIUS) / 2))).toEqual([]);
    expect(a.form).toBe(Form.Line);
    // Once the enemy is gone, it waits STANDDOWN_TICKS before forming column again.
    let since = 0;
    for (; since < 3 * STANDDOWN_TICKS && a.form === Form.Line; since++) {
      pin(STANDDOWN_RADIUS * 4);
      step(w, []);
    }
    expect(a.form).toBe(Form.Column);
    expect(since).toBeGreaterThanOrEqual(STANDDOWN_TICKS - 5);
    expect(since).toBeLessThanOrEqual(STANDDOWN_TICKS + 10);
  });

  it('wheels the line to face the threat, not the march heading', () => {
    const { w, a, pin } = standoff();
    const h0 = { x: a.hx, y: a.hy };
    pin(DEPLOY_RADIUS + 200);
    // The enemy appears off to the right of the line of march.
    for (let t = 0; t < 70; t++) {
      pin(DEPLOY_RADIUS - 30, 1);
      step(w, []);
    }
    expect(a.form).toBe(Form.Line);
    const b = w.platoons.find((p) => p.p === 1)!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    expect((a.hx * (b.x - a.x) + a.hy * (b.y - a.y)) / d).toBeGreaterThan(0.97);
    expect(Math.abs(a.hx * h0.x + a.hy * h0.y)).toBeLessThan(0.5);
  });

  it('gets every soldier to its place in the line and back into column, nobody stuck', () => {
    const { w, a, pin } = standoff(L(1000, 60, 40), 'fix: crash');
    const places = () => w.units.filter((u) => u.platoon === a.id).map((u) => {
      const p = placeOf(w, u)!;
      return Math.hypot(p.x - u.x, p.y - u.y);
    });
    for (let t = 0; t < 100; t++) {
      pin(DEPLOY_RADIUS - 40);
      step(w, []);
    }
    expect(a.form).toBe(Form.Line);
    expect(Math.max(...places())).toBeLessThan(20);
    for (let t = 0; t < STANDDOWN_TICKS + 120; t++) {
      pin(STANDDOWN_RADIUS * 4);
      step(w, []);
    }
    expect(a.form).toBe(Form.Column);
    expect(Math.max(...places())).toBeLessThan(30);
    expect(a.lag).toBeLessThan(8);
  });
});

describe('after combat', () => {
  it('re-forms its ranks over the survivors, closing the gaps', () => {
    // A marches on the border fort past the empty seat throughout, as if its war council never wavered: here
    // B pinned beside A's own walls would otherwise call it home, and this is about the ranks, not the council.
    const { w, a, pin } = standoff(L(250, 60), 'wip', 42, -1);
    for (let t = 0; t < 80; t++) {
      pin(DEPLOY_RADIUS - 40);
      step(w, []);
    }
    expect(a.form).toBe(Form.Line);
    // The front rank takes losses.
    const mine = w.units.filter((u) => u.platoon === a.id && u.kind === Kind.Footman).sort((x, y) => y.fx - x.fx);
    const lost = new Set(mine.slice(0, 4).map((u) => u.id));
    w.units = w.units.filter((u) => !lost.has(u.id));
    for (let t = 0; t < 70; t++) {
      pin(DEPLOY_RADIUS - 40);
      step(w, []);
    }
    const left = w.units.filter((u) => u.platoon === a.id);
    const counts = new Array<number>(KIND_COUNT).fill(0);
    for (const u of left) counts[u.kind]!++;
    const layout = lineFormation(counts, a.frontage > 0 ? a.frontage : Infinity);
    const key = (k: number, f: number, l: number) => `${k}:${f.toFixed(3)}:${l.toFixed(3)}`;
    expect(left.map((u) => key(u.kind, u.fx, u.fy)).sort()).toEqual(layout.map((p) => key(p.kind, p.f, p.l + a.offset)).sort());
    expect(a.lag).toBeLessThan(8);
  });
});

/** A world with hand-placed soldiers for target-picking tests. */
function skirmish(units: [p: number, kind: Kind, x: number, y: number, hp?: number][]): { w: World; idx: (id: number) => number } {
  const w = newWorld(2, 3);
  step(w, joins(2));
  const site = w.map.sites[w.map.slots]!;
  w.nextId = 100;
  w.units = units.map(([p, kind, x, y, hp], k) => ({
    id: k + 1, p, platoon: 0, kind, x: site.x + x, y: site.y + y, hp: hp ?? STATS[kind]!.hp, maxHp: STATS[kind]!.hp,
    target: 0, cooldown: 0, swingAt: -1, leavesAt: -1, fx: 0, fy: 0, run: 0, scorched: -1,
  } satisfies Unit));
  const s = scratchFor(w);
  indexWorld(w, s, (k) => STATS[k]!.speed);
  return { w, idx: (id) => s.unitIndex.get(id)! };
}

const open = (x: number, y: number) => ({ radius: 150, ax: x, ay: y, leash: 1e6, sx: x, sy: y, reach: Infinity, hx: 0, hy: 0 });

describe('soldiers in the fight', () => {
  it('spread melee attackers across the enemy rather than dogpiling one', () => {
    const { w, idx } = skirmish([[0, Kind.Footman, 0, 0], [1, Kind.Footman, 20, 0], [1, Kind.Footman, 26, 8]]);
    const s = scratchFor(w);
    const u = w.units[idx(1)]!;
    expect(pickTarget(w, s, idx(1), open(u.x, u.y))).toBe(idx(2));
    s.attackers[idx(2)] = attackerCap(Kind.Footman);
    expect(pickTarget(w, s, idx(1), open(u.x, u.y))).toBe(idx(3));
  });

  it('focus missile fire on the wounded within range', () => {
    const { w, idx } = skirmish([[0, Kind.Archer, 0, 0], [1, Kind.Footman, 40, 0], [1, Kind.Footman, 80, 0, 20], [1, Kind.Footman, 300, 0, 5]]);
    const s = scratchFor(w);
    const u = w.units[idx(1)]!;
    expect(pickTarget(w, s, idx(1), open(u.x, u.y))).toBe(idx(3));
  });

  it('send Champions after the enemy’s best and cavalry after its archers', () => {
    const { w, idx } = skirmish([[0, Kind.Champion, 0, 0], [0, Kind.Knight, 0, 30], [1, Kind.Footman, 25, 0], [1, Kind.Paladin, 70, 0], [1, Kind.Archer, 90, 30]]);
    const s = scratchFor(w);
    const c = w.units[idx(1)]!;
    expect(pickTarget(w, s, idx(1), open(c.x, c.y))).toBe(idx(4));
    const k = w.units[idx(2)]!;
    expect(pickTarget(w, s, idx(2), open(k.x, k.y))).toBe(idx(5));
  });

  it('fight line against line: attackers spread, healers stay behind the front, cavalry rides round the flank', () => {
    const w = newWorld(2, 42);
    step(w, joins(2));
    // The border fort on the road between the two capitals: the natural battleground.
    const fort = w.map.slots;
    step(w, [
      // The fix is the size of one platoon with its Footmen, as 1100 lines once raised (armies are twice what they were).
      push(0, L(450, 80, 40), 'fix: crash on resume', 8, 15),
      push(1, L(1300, 80, 40, 0, 0, 1200), 'refactor: drop legacy auth', 8, 90),
    ]);
    let melee = 0;
    let piled = 0;
    let clericAhead = 0;
    let clericSamples = 0;
    let flankBlows = 0;
    let cavalryBlows = 0;
    let engagedTicks = 0;
    for (let t = 0; t < 4 * TICKS_PER_MINUTE; t++) {
      const ev = step(w, []);
      const byId = new Map(w.units.map((u) => [u.id, u]));
      const piles = new Map<number, number>();
      for (const u of w.units) if (u.target > 0 && !STATS[u.kind]!.ranged) piles.set(u.target, (piles.get(u.target) ?? 0) + 1);
      for (const [id, n] of piles) {
        const v = byId.get(id);
        melee += n;
        if (v && n > attackerCap(v.kind)) piled += n - attackerCap(v.kind);
      }
      for (const pl of w.platoons) {
        if (pl.form !== Form.Engaged && pl.form !== Form.Line) continue;
        if (pl.form === Form.Engaged) engagedTicks++;
        const mine = w.units.filter((u) => u.platoon === pl.id);
        const fwd = (u: Unit) => (u.x - pl.x) * pl.hx + (u.y - pl.y) * pl.hy;
        const foot = mine.filter((u) => u.kind === Kind.Footman);
        const healers = mine.filter((u) => u.kind === Kind.Cleric);
        if (foot.length < 3 || healers.length === 0) continue;
        const front = Math.max(...foot.map(fwd));
        for (const h of healers) {
          clericSamples++;
          if (fwd(h) > front) clericAhead++;
        }
      }
      for (const sw of ev.swings) {
        const u = byId.get(sw.from);
        const v = sw.to > 0 ? byId.get(sw.to) : undefined;
        if (!u || !v || (u.kind !== Kind.Knight && u.kind !== Kind.Outrider)) continue;
        const ep = w.platoons.find((p) => p.id === v.platoon);
        if (!ep || ep.form === Form.Column) continue;
        cavalryBlows++;
        const d = Math.hypot(u.x - v.x, u.y - v.y) || 1;
        if (((u.x - v.x) * ep.hx + (u.y - v.y) * ep.hy) / d < 0.5) flankBlows++;
      }
    }
    expect(engagedTicks).toBeGreaterThan(50);
    // Brutes and Champions may still crowd a foe, and a foe at arm's reach is struck regardless; few attackers pile on beyond the cap.
    expect(melee).toBeGreaterThan(500);
    expect(piled / melee).toBeLessThan(0.03);
    expect(clericSamples).toBeGreaterThan(50);
    expect(clericAhead / clericSamples).toBeLessThan(0.1);
    expect(cavalryBlows).toBeGreaterThan(5);
    // Riding straight in, about one blow in five lands from beside or behind; swinging round the flank, about one in three.
    expect(flankBlows / cavalryBlows).toBeGreaterThan(0.25);
  }, 60_000);
});

describe('a whole war of formations', () => {
  it('leaves nobody stranded from the ranks while their platoon marches or stands', () => {
    const w = newWorld(6, 9);
    step(w, joins(6));
    let r = 11;
    const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
    let samples = 0;
    let stranded = 0;
    for (let t = 0; t < 10 * TICKS_PER_MINUTE; t++) {
      const inputs: SimInput[] = [];
      for (let p = 0; p < 6; p++) if (rand() < 1 / 200) inputs.push(push(p, L(150 + Math.floor(rand() * 400), 40, 20, 0, 40, 60), ['fix: a', 'feat: b', 'refactor: c', 'perf: d'][p % 4]!, 9, 60));
      step(w, inputs);
      if (t % 25 !== 0) continue;
      for (const pl of w.platoons) {
        // Soldiers of a calm platoon that has had time to settle into its current form.
        if (pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout || pl.form === Form.Engaged || pl.form === Form.Deploying) continue;
        if (pl.calm < 50 || w.tick - pl.formAt < 100) continue;
        for (const u of w.units) {
          // Siege engines may trail the march; fliers keep no ranks.
          if (u.platoon !== pl.id || u.target !== 0 || STATS[u.kind]!.flying || u.kind === Kind.Trebuchet) continue;
          const p = placeOf(w, u)!;
          samples++;
          if (Math.hypot(p.x - u.x, p.y - u.y) > 60) stranded++;
        }
      }
    }
    expect(samples).toBeGreaterThan(2000);
    expect(stranded / samples).toBeLessThan(0.02);
  }, 60_000);
});

describe('formation determinism', () => {
  it('replays bit for bit, deployments and routes included, through a snapshot taken mid-deployment', () => {
    const run = (cut: number | null): number[] => {
      let w = newWorld(4, 21);
      const sums: number[] = [];
      let r = 5;
      const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
      let deploys = 0;
      for (let t = 0; t < 6 * TICKS_PER_MINUTE; t++) {
        const inputs: SimInput[] = t === 0 ? joins(4) : [];
        for (let p = 0; p < 4; p++) if (rand() < 1 / 150) inputs.push(push(p, L(200 + Math.floor(rand() * 300), 30, 20), rand() < 0.5 ? 'fix: x' : 'feat: y', 5, 40));
        if (t === cut) w = restore(JSON.parse(JSON.stringify(snapshot(w))));
        deploys += step(w, inputs).forms.filter((f) => f.form === Form.Deploying).length;
        if (t % 30 === 0) sums.push(checksum(w));
      }
      expect(deploys).toBeGreaterThan(3);
      return sums;
    };
    const a = run(null);
    expect(run(null)).toEqual(a);
    expect(run(3 * TICKS_PER_MINUTE + 7)).toEqual(a);
  }, 60_000);
});

describe('snapshots from before formations', () => {
  it('restore with every platoon in column, drawn up afresh, and play on', () => {
    const w = newWorld(2, 4);
    step(w, joins(2));
    step(w, [push(0, L(300, 30)), push(1, L(300, 30))]);
    for (let t = 0; t < 30; t++) step(w, []);
    const snap = JSON.parse(JSON.stringify(snapshot(w))) as { version: 3; world: { platoons: Record<string, unknown>[] } };
    for (const pl of snap.world.platoons) for (const k of ['form', 'formAt', 'threat', 'threatAt', 'formed', 'frontage', 'width', 'length', 'offset', 'lag', 'route', 'routeSite', 'stuck', 'trail']) delete pl[k];
    const old = restore(snap);
    for (let t = 0; t < 60; t++) step(old, []);
    for (const pl of old.platoons) {
      expect(Array.isArray(pl.route) && Array.isArray(pl.trail)).toBe(true);
      expect(pl.formed).toBe(old.units.filter((u) => u.platoon === pl.id).length);
    }
    expect(Number.isFinite(checksum(old))).toBe(true);
  });
});

describe('formation cost', () => {
  it('keeps a full room of large armies within the tick budget', () => {
    const w = newWorld(16, 42);
    step(w, joins(16));
    let r = 3;
    const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
    let spent = 0;
    let ticks = 0;
    let peak = 0;
    for (let t = 1; t < 6 * TICKS_PER_MINUTE; t++) {
      const inputs: SimInput[] = [];
      for (let p = 0; p < 16; p++) if (t % 300 === (p * 7) % 300 || t === 1 + p) inputs.push(push(p, L(900 + Math.floor(rand() * 900), 200, 90, 40, 60, 100), rand() < 0.5 ? 'feat: x' : 'fix: y', 12, 200));
      const t0 = performance.now();
      step(w, inputs);
      const dt = performance.now() - t0;
      peak = Math.max(peak, w.units.length);
      if (w.units.length >= 700) {
        spent += dt;
        ticks++;
      }
    }
    expect(peak).toBeGreaterThan(900);
    expect(ticks).toBeGreaterThan(100);
    // About 2 ms on a laptop; the bound leaves room for slow CI machines.
    expect(spent / ticks).toBeLessThan(10);
  }, 120_000);
});

