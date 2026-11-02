// Props and clutter for the HD towns: the barrels, crates, sacks, carts, wood piles, benches,
// flower pots, market stalls, lanterns, wells, troughs, haystacks, hurdles and washing lines that
// make a lived-in town (docs/art-references/city-detail.md), and a deterministic pass that scatters
// them along walls, by doors and road edges, in yards and the market square.
//
// ---------------------------------------------------------------------------------------- API
//
// Everything is in world units (pixels.ts: u down-right, v down-left, z up) and painted at the
// frame's density into a Px, lit from the upper left like the buildings: 3-5 tone ramps from the
// style, a lit left (+v) face, a shaded right (+u) face, a coloured outline, no per-pixel noise.
//
//   registerProp(kind, def)      add a prop to the library. `def.lu × def.lv` is its footprint
//                                from (u, v), its min corner; `def.h` its height (for the cast
//                                shadow); `def.draw(a)` paints it at a.u, a.v into a.px. Faction
//                                kinds are namespaced: 'samurai:toro', 'undead:bonepile'.
//   registerTheme(faction, t)    what a faction scatters: weighted groups of props per site kind
//                                ('wall' along building faces, 'door' by road ends, 'road' along
//                                road edges, 'yard' in open ground, 'market' at the market spots),
//                                optional per-building groups (`near`), market spots and fixed
//                                props (a well). A faction without a theme gets the Templar one
//                                with its own colours.
//   placeProps(o)                the placement pass: pure and deterministic from the seed, the
//                                building levels and the footprints the buildings recorded
//                                (pixels.ts recordFootprints), so props never stand inside a wall,
//                                on a road (roads.ts roadDistance), in the drill yard, the butts,
//                                the fields or the paddock. Density follows each building's tier:
//                                an empty lot is bare, the grand tier busy.
//   paintProps(placed, st, frame) the placed props as depth-sorted Arts (one per group, with a
//                                night canvas and lit glass for lanterns) plus the lamps' points.
//   propShadows(placed)          the ground footprints and heights, for ground-hd's cast shadows.
//
// The drawing helpers (cyl, heap, bush, ivy, windowBox, wallSign, lantern) are exported for the
// building kits: ivy curtains and window boxes go on walls, signs and lanterns on brackets.
//
// Example (a faction kit):
//   registerProp('undead:bones', { lu: 3, lv: 3, h: 2, draw: (a) => heap(a.px, a.u + 1.5, a.v + 1.5, 0, 1.5, 1.5, 2, bone) });
//   registerTheme('undead', { groups: { wall: [{ w: 2, items: [['undead:bones', 0, 0], ['barrel', 3, 0]] }] } });

import type { BuildingKey } from '../../../game/city.ts';
import { tierOf, WALL, type Art } from './buildings.ts';
import { FIELDS, GARDEN, PADDOCK } from './ground.ts';
import { css, hash, hex, mix, nightCanvas, NIGHT_RIG, Px, tone, type Col, type Footprint, type Frame, type NightRig, type V3 } from './pixels.ts';
import { bales, barrel, bench, bucket, cart, crate, flowerPot, FLAME, FLAME2, FLOWERS, haystack, hurdle, LEAF, lampPost, marketStall, pottedTree, sack, signPost, trough, washingLine, well, woodPile, bush } from './prop-art.ts';
import { EDGES, NODES, roadDistance } from './roads.ts';
import type { CityStyle } from './style.ts';

export * from './prop-art.ts';

// ------------------------------------------------------------------------------- the props

export interface PropAt {
  px: Px;
  st: CityStyle;
  /** Min corner of the footprint. */
  u: number;
  v: number;
  /** A per-prop hash 0..1 for variants. */
  n: number;
  /** Lamps: world points whose glass glows at night (and a little by day). */
  lights: V3[];
}
export interface PropDef {
  lu: number;
  lv: number;
  h: number;
  draw: (a: PropAt) => void;
  /**
   * Emissive colours this prop paints (a faction's lantern glass, witchfire): pixels of exactly
   * these colours go into the group's lights canvas and are spared the cast shadow, like the
   * warm lantern glass (FLAME) every prop already has.
   */
  glass?: Col[];
  /**
   * A little life drawn every frame over the static art (an awning's hem fluttering, washing
   * swaying, a flame flickering): called in buffer pixels (the flat transform) with the time,
   * the buffer point of the prop's min corner on the ground (x, y), the prop's hash 0..1, the
   * density k (buffer pixels per world unit; isoOff converts world offsets) and the style. Drawn
   * just in front of the prop's own art in the depth sort, only when the camera is in at zoom 2+
   * and the prop is in view. Draw whole buffer pixels.
   */
  anim?: PropAnim;
  /** Lamp flames [du, dv, z] from the min corner: each flickers (a drawn flame) and lights a pool at night. */
  flicker?: [number, number, number][];
}

export type PropAnim = (g: CanvasRenderingContext2D, t: number, x: number, y: number, seed: number, k: number, st: CityStyle) => void;
/** Buffer-pixel offset of a world offset (du, dv, dz) at density k. */
export const isoOff = (k: number, du: number, dv: number, dz: number): [number, number] => [Math.round((du - dv) * k), Math.round(((du + dv) / 2 - dz) * k)];
/** A placed prop's animation, ready for the depth sort. */
export interface PropAnimAt {
  d: number;
  x: number;
  y: number;
  seed: number;
  fn: PropAnim;
  /** Buffer-pixel box it may draw in, for the on-screen test. */
  box: [number, number, number, number];
}

/** A flickering flame: two art pixels that trade hot and warm, hashed per lamp so lamps flicker apart. */
export const flameAnim = (du: number, dv: number, z: number): PropAnim => (g, t, x, y, seed, k) => {
  const [ox, oy] = isoOff(k, du, dv, z);
  const ph = Math.sin(t * 13 + seed * 40) + Math.sin(t * 7.3 + seed * 17);
  g.fillStyle = ph > 0.6 ? '#fff4c8' : ph > -0.4 ? '#ffd27a' : '#ff9a3a';
  g.fillRect(x + ox, y + oy, 1, 1);
  g.fillStyle = ph > 0 ? '#ffb24a' : '#e8782a';
  g.fillRect(x + ox, y + oy + 1, 1, 1);
};

const LIB = new Map<string, PropDef>();
export function registerProp(kind: string, def: PropDef): void {
  LIB.set(kind, def);
}
export const propDef = (kind: string): PropDef | undefined => LIB.get(kind);
// The library: footprints (from the min corner) and heights, for placement and shadows.
registerProp('barrel', { lu: 3.4, lv: 3.4, h: 4.4, draw: (a) => barrel(a.px, a.st, a.u + 1.7, a.v + 1.7, 0, a.n) });
registerProp('barrels', {
  lu: 6.6, lv: 6.4, h: 4.4,
  draw: (a) => {
    barrel(a.px, a.st, a.u + 1.7, a.v + 1.7, 0, a.n);
    barrel(a.px, a.st, a.u + 4.9, a.v + 1.9, 0, hash(a.n * 100, 1));
    barrel(a.px, a.st, a.u + 2.3, a.v + 4.7, 0, hash(a.n * 100, 2));
  },
});
registerProp('crates', {
  lu: 7.2, lv: 3.6, h: 6.4,
  draw: (a) => {
    crate(a.px, a.st, a.u, a.v, 0);
    crate(a.px, a.st, a.u + 3.6, a.v + 0.2, 0, 3.2, 3);
    if (a.n > 0.3) crate(a.px, a.st, a.u + 0.3, a.v + 0.1, 3.2, 3, 2.8);
  },
});
registerProp('crate', { lu: 3.4, lv: 3.4, h: 3.2, draw: (a) => crate(a.px, a.st, a.u, a.v, 0) });
registerProp('sacks', {
  lu: 6.4, lv: 3.4, h: 4,
  draw: (a) => {
    sack(a.px, a.st, a.u + 1.5, a.v + 1.5, 0, a.n);
    sack(a.px, a.st, a.u + 4.4, a.v + 1.8, 0, hash(a.n * 10, 3));
    if (a.n > 0.4) sack(a.px, a.st, a.u + 2.9, a.v + 1.6, 2.4, hash(a.n * 10, 4));
  },
});
registerProp('hayCart', { lu: 15, lv: 5, h: 8, draw: (a) => cart(a.px, a.st, a.u, a.v, 'hay', a.n) });
registerProp('cart', { lu: 15, lv: 5, h: 6, draw: (a) => cart(a.px, a.st, a.u, a.v, a.n > 0.5 ? 'barrels' : 'sacks', a.n) });
registerProp('handcart', { lu: 10, lv: 4, h: 4.5, draw: (a) => cart(a.px, a.st, a.u, a.v, a.n > 0.6 ? 'sacks' : a.n > 0.3 ? 'barrels' : 'none', a.n, true) });
registerProp('woodPile', { lu: 12, lv: 5, h: 4, draw: (a) => woodPile(a.px, a.st, a.u, a.v, a.n) });
registerProp('bench', { lu: 6, lv: 1.6, h: 2.6, draw: (a) => bench(a.px, a.st, a.u, a.v) });
registerProp('benchV', { lu: 1.6, lv: 6, h: 2.6, draw: (a) => bench(a.px, a.st, a.u, a.v, false) });
registerProp('pots', {
  lu: 5, lv: 3, h: 4,
  draw: (a) => {
    flowerPot(a.px, a.u + 1.2, a.v + 1.2, 0, Math.floor(a.n * 1000), true);
    flowerPot(a.px, a.u + 3.6, a.v + 1.8, 0, Math.floor(a.n * 1000) + 1);
  },
});
registerProp('pot', { lu: 2.4, lv: 2.4, h: 3.5, draw: (a) => flowerPot(a.px, a.u + 1.2, a.v + 1.2, 0, Math.floor(a.n * 1000), true) });
registerProp('pottedTree', { lu: 3.4, lv: 3.4, h: 9, draw: (a) => pottedTree(a.px, a.st, a.u + 1.7, a.v + 1.7, Math.floor(a.n * 1000)) });
registerProp('lampPost', { lu: 1.4, lv: 1.4, h: 9, draw: (a) => lampPost(a.px, a.st, [], a.u + 0.7, a.v + 0.7), flicker: [[2.9, 0.9, 7.2]] });
registerProp('signPost', { lu: 1.4, lv: 3.4, h: 7, draw: (a) => signPost(a.px, a.st, a.u + 0.7, a.v + 0.5, a.n) });
registerProp('stall', {
  lu: 9.6, lv: 6, h: 9,
  draw: (a) => marketStall(a.px, a.st, a.u, a.v, a.n),
  // The hem flutters: each scallop's tongue drops a pixel in turn, as a wave runs along it.
  anim: (g, t, x, y, n, k, st) => {
    const a = n > 0.5 ? st.bannerField : mix(st.daub[0], 0xffffffff, 0.2);
    const b = n > 0.5 ? st.bannerCharge : n > 0.25 ? st.team : hex('#3e6a8a');
    for (let i = 0; i < 9.2 * k; i += 3) {
      if (Math.sin(t * 5 - i * 0.7 + n * 9) < 0.35) continue;
      const s = i / k;
      const [ox, oy] = isoOff(k, -0.6 + s + 0.7 / k, 3.6 + 2.2, 7.2 - 0.3);
      g.fillStyle = css(tone(Math.floor(i / 3) % 2 === 0 ? a : b, 0.12));
      g.fillRect(x + ox, y + oy + 1, 1, 1);
    }
  },
});
registerProp('well', { lu: 6.6, lv: 6.6, h: 8, draw: (a) => well(a.px, a.st, a.u + 3.3, a.v + 3.3) });
registerProp('trough', { lu: 7, lv: 2.6, h: 2.2, draw: (a) => trough(a.px, a.st, a.u, a.v) });
registerProp('haystack', { lu: 8, lv: 7.4, h: 7, draw: (a) => haystack(a.px, a.st, a.u + 4, a.v + 3.7, a.n) });
registerProp('bales', { lu: 8.4, lv: 2.6, h: 4, draw: (a) => bales(a.px, a.st, a.u, a.v) });
registerProp('hurdle', { lu: 9, lv: 1, h: 4, draw: (a) => hurdle(a.px, a.st, a.u, a.v + 0.5, a.u + 9, a.v + 0.5) });
registerProp('hurdleV', { lu: 1, lv: 9, h: 4, draw: (a) => hurdle(a.px, a.st, a.u + 0.5, a.v, a.u + 0.5, a.v + 9) });
registerProp('washing', {
  lu: 10, lv: 1, h: 8,
  draw: (a) => washingLine(a.px, a.st, a.u, a.v + 0.5, a.n),
  // The linen sways: each cloth's free corner swings a pixel either way.
  anim: (g, t, x, y, n, k, st) => {
    const cloth = [st.daub[0], hex('#e8e2d4'), hex('#6a7aa4'), st.bannerField, hex('#a8503c')];
    let s = 0.8;
    for (let i = 0; s < 9; i++) {
      const w = 1.4 + hash(i, n * 50) * 1.4;
      const c = cloth[Math.floor(hash(i, n * 51) * cloth.length)]!;
      const h = 2 + hash(i, n * 52) * 1.6;
      const sw = Math.round(Math.sin(t * 2.2 + i * 1.3 + n * 7));
      if (sw) {
        const [ox, oy] = isoOff(k, s + (sw > 0 ? w : 0), 0.5, 7.4 - (s / 10) * 0.4 - h);
        g.fillStyle = css(tone(c, 0.1));
        g.fillRect(x + ox + (sw > 0 ? 0 : -1), y + oy, 1, 2);
      }
      s += w + 0.6;
    }
  },
});
registerProp('bucket', { lu: 1.6, lv: 1.6, h: 1.4, draw: (a) => bucket(a.px, a.st, a.u + 0.8, a.v + 0.8, 0) });
registerProp('roseBush', { lu: 4.4, lv: 4.4, h: 4.5, draw: (a) => bush(a.px, a.u + 2.2, a.v + 2.2, 2.2, 3, 2.5, Math.floor(a.n * 1000), LEAF, a.n > 0.5 ? [FLOWERS[0]!, FLOWERS[5]!] : [FLOWERS[1]!, FLOWERS[5]!], 0.26) });
registerProp('bush', { lu: 4, lv: 4, h: 4, draw: (a) => bush(a.px, a.u + 2, a.v + 2, 2, 2.6, 2.2, Math.floor(a.n * 1000), LEAF, a.n > 0.5 ? [FLOWERS[0]!, FLOWERS[5]!] : [FLOWERS[1]!], 0.2) });

// ------------------------------------------------------------------------------ the themes

/** Where a group goes: along a building face, by a road end (a door), along a road, in the open, at the market. */
export type SiteKind = 'wall' | 'door' | 'road' | 'yard' | 'market';
/**
 * A group of props placed together. Items are [kind, a, b]: `a` along the wall (or road), `b`
 * away from it, in world units from the site. `w` weights the pick; `tier` is the lowest tier at
 * which the group appears.
 */
export interface Group {
  w: number;
  items: [string, number, number][];
  tier?: number;
}
export interface Theme {
  groups: Partial<Record<SiteKind, Group[]>>;
  /** Groups for the walls of particular buildings (the granary's sacks, the stables' hay). */
  near?: Partial<Record<BuildingKey | 'keep', Group[]>>;
  /** Market stall spots [u, v] (the min corner of a stall), filled as the town grows. */
  market?: [number, number][];
  /** Props always placed once the given tier is reached: [kind, u, v, tier]. */
  fixed?: [string, number, number, number][];
}
const THEMES = new Map<string, Theme>();
export function registerTheme(faction: string, t: Theme): void {
  THEMES.set(faction, t);
}

const G = (w: number, items: [string, number, number][], tier = 1): Group => ({ w, items, tier });
registerTheme('templar', {
  groups: {
    wall: [
      G(3, [['barrels', 0, 0]]),
      G(3, [['crates', 0, 0], ['barrel', 7.6, 0.2]]),
      G(2, [['sacks', 0, 0]]),
      G(2, [['woodPile', 0, 0]]),
      G(2, [['bench', 0, 0], ['pot', 6.4, 0]], 2),
      G(2, [['pots', 0, 0]], 2),
      G(1, [['pottedTree', 0, 0], ['pot', 3.8, 0.4]], 3),
      G(1, [['handcart', 0, 0.4]]),
      G(1, [['crate', 0, 0], ['bucket', 3.8, 0.6], ['sacks', 5.6, 0]]),
      G(2, [['roseBush', 0, 0]]),
      G(1, [['bush', 0, 0], ['pot', 4.4, 0.6]]),
    ],
    door: [G(3, [['lampPost', 0, 0]], 2), G(2, [['pots', 0, 0]], 2), G(1, [['barrel', 0, 0], ['crate', 3.8, 0]]), G(1, [['signPost', 0, 0]], 3)],
    road: [G(3, [['lampPost', 0, 0]], 3), G(1, [['bench', 0, 0]], 2), G(1, [['pot', 0, 0]], 2), G(1, [['hurdle', 0, 0]]), G(1, [['crates', 0, 0]])],
    yard: [G(1, [['crates', 0, 0]]), G(1, [['bucket', 0, 0], ['barrel', 2, 0]]), G(1, [['sacks', 0, 0]])],
    market: [
      G(3, [['stall', 0, 0]]),
      G(1, [['stall', 0, 0], ['sacks', 10.4, 0.6]], 3),
      G(1, [['cart', 0, 0]]),
      G(1, [['crates', 0, 0], ['barrels', 8, 0]], 2),
    ],
  },
  near: {
    granary: [G(3, [['sacks', 0, 0], ['sacks', 6.8, 0.4]]), G(2, [['hayCart', 0, 0.5]]), G(2, [['barrels', 0, 0], ['sacks', 7, 0]]), G(1, [['crates', 0, 0]])],
    stables: [G(3, [['bales', 0, 0]]), G(2, [['haystack', 0, 0.5]]), G(2, [['trough', 0, 0], ['bucket', 7.6, 0.4]]), G(1, [['hayCart', 0, 0.5]], 2), G(1, [['woodPile', 0, 0]])],
    workshop: [G(3, [['woodPile', 0, 0]]), G(2, [['crates', 0, 0]]), G(2, [['handcart', 0, 0.4]]), G(1, [['barrels', 0, 0]])],
    hospital: [G(3, [['pots', 0, 0]]), G(2, [['bench', 0, 0], ['pottedTree', 6.6, -0.6]]), G(2, [['washing', 0, 1.2]]), G(1, [['bush', 0, 0]])],
    chapter: [G(3, [['pots', 0, 0]], 2), G(2, [['pottedTree', 0, 0]], 2), G(2, [['bench', 0, 0], ['pot', 6.4, 0]]), G(1, [['bush', 0, 0]])],
    barracks: [G(3, [['barrels', 0, 0]]), G(2, [['crates', 0, 0], ['barrel', 7.6, 0]]), G(2, [['woodPile', 0, 0]]), G(1, [['washing', 0, 1.2]], 2), G(1, [['bench', 0, 0]])],
    keep: [G(3, [['barrels', 0, 0]]), G(2, [['crates', 0, 0]]), G(1, [['sacks', 0, 0], ['crate', 6.8, 0]]), G(1, [['pots', 0, 0]], 3)],
    range: [G(3, [['bales', 0, 0]]), G(2, [['crates', 0, 0]]), G(1, [['barrel', 0, 0]])],
    walls: [G(3, [['woodPile', 0, 0]]), G(2, [['barrels', 0, 0]]), G(2, [['crates', 0, 0], ['sacks', 7.6, 0]]), G(1, [['bales', 0, 0]]), G(1, [['handcart', 0, 0.5]])],
  },
  // A fair outside the gate, either side of the road in, and a corner stall by the cross.
  market: [[262, 103], [276, 104], [290, 103], [262, 128], [278, 129], [294, 128], [304, 104], [308, 130], [200, 124]],
  fixed: [['well', 75.7, 63.7, 1]],
});

// ------------------------------------------------------------------------------- placement

export interface Placed {
  kind: string;
  u: number;
  v: number;
  n: number;
  /** The group it belongs to (painted and sorted together). */
  group: number;
}

export interface PlaceOptions {
  faction: string;
  seed: number;
  levels: Record<BuildingKey, number>;
  /** What each building recorded standing on the ground (pixels.ts recordFootprints). */
  footprints: Partial<Record<BuildingKey | 'keep', Footprint[]>>;
  /** Extra ground to keep clear (trees: [u, v, radius]). */
  clear?: [number, number, number][];
}

/** How many groups each tier puts along a building: an empty lot is bare, the grand tier busy. */
const DENSITY = [0, 4, 8, 13, 20];

/** Ground the town's life needs: the drill yard, the butts, the engine's trial ground. */
const KEEP_CLEAR: [number, number, number, number][] = [
  [86, 58, 148, 144],
  [138, 32, 220, 72],
  [146, 154, 172, 178],
  PADDOCK,
  GARDEN,
  ...FIELDS,
];

type Rect = [number, number, number, number];
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** The placement pass (pure, deterministic). */
export function placeProps(o: PlaceOptions): Placed[] {
  const theme = THEMES.get(o.faction) ?? THEMES.get('templar')!;
  const out: Placed[] = [];
  const taken: Rect[] = [];
  const solid: Rect[] = [];
  for (const fs of Object.values(o.footprints)) for (const f of fs ?? []) solid.push([f[0] - 0.4, f[1] - 0.4, f[2] + 0.4, f[3] + 0.4]);
  const clear = o.clear ?? [];
  let group = 0;
  let salt = 0;
  const rnd = () => hash(o.seed, salt++, 4242);
  const fits = (kind: string, u: number, v: number): Rect | null => {
    const d = LIB.get(kind);
    if (!d) return null;
    const r: Rect = [u, v, u + d.lu, v + d.lv];
    // Off the roads (their painted width is 5.5 and people walk ±4 of the line), with a margin.
    const cu = u + d.lu / 2;
    const cv = v + d.lv / 2;
    for (const [pu, pv] of [[u, v], [r[2], v], [u, r[3]], [r[2], r[3]], [cu, cv]] as const) if (roadDistance(pu, pv, 9) < 6.2) return null;
    if (u < -110 || v < -110 || r[2] > 345 || r[3] > 345) return null;
    // Not in the walls' ditch and stakes, inside or out.
    const W = WALL;
    if ((r[2] > W - 1 && u < W + 22 && r[3] > -6 && v < W + 22) || (r[3] > W - 1 && v < W + 22 && r[2] > -6 && u < W + 22)) return null;
    if (u < 5 || v < 5) if (r[2] > -22 && r[3] > -22 && u < W + 4 && v < W + 4) return null;
    for (const k of KEEP_CLEAR) if (overlaps(r, k)) return null;
    for (const s of solid) if (overlaps(r, s)) return null;
    for (const t of taken) if (overlaps(r, t)) return null;
    for (const [tu, tv, tr] of clear) if (Math.max(Math.abs(cu - tu) - d.lu / 2, Math.abs(cv - tv) - d.lv / 2) < tr) return null;
    return r;
  };
  /** Try a group at a site: a = along (u or v), b = away; `axis` 'u' means along u (a left face). */
  const tryGroup = (g: Group, su: number, sv: number, axis: 'u' | 'v', away: number): boolean => {
    const rects: [string, number, number, Rect][] = [];
    for (const [kind, a, b] of g.items) {
      const d = LIB.get(kind);
      if (!d) return false;
      const u = axis === 'u' ? su + a : away > 0 ? su + b : su - b - d.lu;
      const v = axis === 'u' ? (away > 0 ? sv + b : sv - b - d.lv) : sv + a;
      const r = fits(kind, u, v);
      if (!r || rects.some((x) => overlaps(x[3], r))) return false;
      rects.push([kind, u, v, r]);
    }
    for (const [kind, u, v, r] of rects) {
      taken.push([r[0] - 0.6, r[1] - 0.6, r[2] + 0.6, r[3] + 0.6]);
      out.push({ kind, u, v, n: rnd(), group });
    }
    group++;
    return true;
  };
  const pick = (gs: Group[] | undefined, tier: number): Group | null => {
    const ok = (gs ?? []).filter((g) => (g.tier ?? 1) <= tier);
    const sum = ok.reduce((s, g) => s + g.w, 0);
    if (!sum) return null;
    let x = rnd() * sum;
    for (const g of ok) if ((x -= g.w) <= 0) return g;
    return ok[ok.length - 1]!;
  };
  const levelOf = (k: BuildingKey | 'keep') => (k === 'keep' ? Math.max(1, ...Object.values(o.levels)) : o.levels[k] ?? 0);

  // Fixed props first (the well).
  for (const [kind, u, v, t] of theme.fixed ?? []) {
    const d = LIB.get(kind);
    if (!d || tierOf(Math.max(0, ...Object.values(o.levels))) < t) continue;
    taken.push([u - 0.5, v - 0.5, u + d.lu + 0.5, v + d.lv + 0.5]);
    out.push({ kind, u, v, n: rnd(), group: group++ });
  }

  // Along the buildings' lit (+v) and right (+u) faces, the ones the viewer sees.
  const keys = ['keep', 'chapter', 'barracks', 'range', 'granary', 'stables', 'workshop', 'hospital', 'walls'] as (BuildingKey | 'keep')[];
  for (const key of keys) {
    const tier = tierOf(levelOf(key));
    const want = DENSITY[tier] ?? 0;
    if (!want) continue;
    const fps = (o.footprints[key] ?? []).filter((f) => (f[2] - f[0]) * (f[3] - f[1]) >= 30 && f[4] >= 5);
    const sites: [number, number, 'u' | 'v', number][] = [];
    for (const f of fps) {
      for (let a = f[0] + 0.5; a < f[2] - 3; a += 3.5) sites.push([a, f[3] + 0.8, 'u', 1]);
      for (let a = f[1] + 0.5; a < f[3] - 3; a += 3.5) sites.push([f[2] + 0.8, a, 'v', 1]);
      // The back faces too, where a low building leaves them in view.
      if (f[4] < 14) {
        for (let a = f[0] + 0.5; a < f[2] - 3; a += 7) sites.push([a, f[1] - 0.8, 'u', -1]);
        for (let a = f[1] + 0.5; a < f[3] - 3; a += 7) sites.push([f[0] - 0.8, a, 'v', -1]);
      }
    }
    // Shuffle the sites by hash.
    const order = sites.map((s, i) => [hash(i, o.seed, key.length * 31 + key.charCodeAt(0)), s] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    let placed = 0;
    for (const [su, sv, axis, away] of order) {
      if (placed >= want) break;
      const g = pick(theme.near?.[key] ?? theme.groups.wall, tier) ?? pick(theme.groups.wall, tier);
      if (g && tryGroup(g, su, sv, axis, away)) placed++;
    }
  }

  // By the road ends that lead to doors (lanterns, pots, a sign), from the stone tier.
  const deg = new Map<string, number>();
  for (const [a, b] of EDGES) {
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
  }
  const top = tierOf(Math.max(0, ...Object.values(o.levels)));
  for (const [name, [nu, nv]] of Object.entries(NODES)) {
    if (top < 1) break;
    const t = (name in o.levels ? tierOf(o.levels[name as BuildingKey]) : top) || 0;
    if (!t) continue;
    for (const [du, dv] of [[7.2, -1], [-1, 7.2], [-8.6, -1], [-1, -8.6]] as const) {
      const g = pick(theme.groups.door, t);
      if (g && rnd() < 0.25 + t * 0.12) tryGroup(g, nu + du, nv + dv, 'u', 1);
    }
  }

  // Along the road edges, every so often, more as the town grows.
  for (const [a, b] of EDGES) {
    if (top < 1) break;
    const [au, av] = NODES[a];
    const [bu, bv] = NODES[b];
    const L = Math.hypot(bu - au, bv - av);
    const nu = -(bv - av) / L;
    const nv = (bu - au) / L;
    for (let s = 8; s < L - 8; s += 13) {
      if (rnd() > 0.12 + top * 0.12) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      const pu = au + ((bu - au) * s) / L + nu * side * 7.5;
      const pv = av + ((bv - av) * s) / L + nv * side * 7.5;
      const g = pick(theme.groups.road, top);
      if (g) tryGroup(g, pu, pv, 'u', 1);
    }
  }

  // The market: stalls fill their spots as the town grows; the corner stall by the cross last.
  const stalls = [0, 2, 4, 6, 9][top] ?? 0;
  (theme.market ?? []).slice(0, stalls).forEach(([mu, mv]) => {
    const g = pick(theme.groups.market, top);
    if (!g || !tryGroup(g, mu, mv, 'u', 1)) {
      const s = LIB.get('stall');
      if (s) tryGroup(G(1, [['stall', 0, 0]]), mu, mv, 'u', 1);
    }
  });

  // A little clutter in the open ground inside the walls.
  for (let i = 0; i < top * 6; i++) {
    const u = 8 + rnd() * 216;
    const v = 8 + rnd() * 216;
    const g = pick(theme.groups.yard, top);
    if (g) tryGroup(g, u, v, 'u', 1);
  }
  return out;
}

/** Ground footprints and heights of placed props, for the cast shadows (ground-hd.ts). */
export function propShadows(placed: Placed[]): Footprint[] {
  const out: Footprint[] = [];
  for (const p of placed) {
    const d = LIB.get(p.kind);
    if (!d) continue;
    out.push([p.u + d.lu * 0.15, p.v + d.lv * 0.15, p.u + d.lu * 0.85, p.v + d.lv * 0.85, d.h]);
  }
  return out;
}

// -------------------------------------------------------------------------------- painting

export interface PaintedProps {
  arts: Art[];
  /** Lamp glass in world pixels (classic 512×288 coordinates), for the light pools. */
  lamps: [number, number][];
  /** Per-frame animations of the placed props (PropDef.anim and flicker). */
  anims: PropAnimAt[];
}

let shared: Px | null = null;

/**
 * Paint placed props: one Art per group (sorted by its centre), outlined, with its night canvas
 * and a lights canvas for its lantern glass. `inShade(u, v)` darkens a group that stands in a
 * building's cast shadow, so the shadow falls over the props too.
 */
export function paintProps(placed: Placed[], st: CityStyle, frame: Frame, inShade?: (u: number, v: number) => number, rig: NightRig = NIGHT_RIG): PaintedProps {
  if (!shared || shared.w !== frame.w || shared.h !== frame.h || shared.k !== frame.k) shared = new Px(frame.w, frame.h, frame);
  const px = shared;
  const arts: Art[] = [];
  const lamps: [number, number][] = [];
  const anims: PropAnimAt[] = [];
  const byGroup = new Map<number, Placed[]>();
  for (const p of placed) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  const shadeCol = hex('#2c2c4c');
  for (const ps of byGroup.values()) {
    px.clear();
    const lights: V3[] = [];
    let du = 0;
    let dv = 0;
    for (const p of ps) {
      const d = LIB.get(p.kind)!;
      d.draw({ px, st, u: p.u, v: p.v, n: p.n, lights });
      du += p.u + d.lu / 2;
      dv += p.v + d.lv / 2;
    }
    du /= ps.length;
    dv /= ps.length;
    // The glass of this group: the warm lantern flame, and any faction emissives its props declare.
    const glass = new Set<Col>([FLAME, FLAME2]);
    for (const p of ps) for (const g of LIB.get(p.kind)!.glass ?? []) glass.add(g);
    const sh = inShade?.(du, dv) ?? 0;
    const b0 = px.bounds();
    if (!b0) continue;
    if (sh > 0) {
      // In a building's shadow: the cool shade over everything but the glass.
      for (let y = b0[1]; y < b0[3]; y++)
        for (let x = b0[0]; x < b0[2]; x++) {
          const i = y * px.w + x;
          const c = px.data[i]!;
          if (c && !glass.has(c)) px.data[i] = mix(c, shadeCol, 0.38 * sh);
        }
    }
    px.outline(st.outline);
    const b = px.bounds()!;
    const canvas = px.toCanvas(...b);
    let lightsC: HTMLCanvasElement | null = null;
    const lp = new Px(b[2] - b[0], b[3] - b[1]);
    let lit = 0;
    for (let y = b[1]; y < b[3]; y++)
      for (let x = b[0]; x < b[2]; x++) {
        const c = px.data[y * px.w + x]!;
        if (!glass.has(c)) continue;
        lp.set(x - b[0], y - b[1], c === FLAME ? hex('#ffe6a0') : c === FLAME2 ? FLAME : c);
        lit++;
      }
    if (lit) lightsC = lp.toCanvas();
    for (const l of lights) lamps.push([px.X(l.u, l.v) / px.k - px.mx, px.Y(l.u, l.v, l.z) / px.k - px.my]);
    arts.push({ canvas, lights: lightsC, night: nightCanvas(px, ...b, rig), x: b[0], y: b[1], d: du + dv });
    for (const p of ps) {
      const d = LIB.get(p.kind)!;
      const x = Math.floor(px.X(p.u, p.v));
      const y = Math.floor(px.Y(p.u, p.v, 0));
      const at = { d: du + dv + 0.05, x, y, seed: p.n, box: [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4] as [number, number, number, number] };
      if (d.anim) anims.push({ ...at, fn: d.anim });
      for (const [fu, fv, fz] of d.flicker ?? []) {
        anims.push({ ...at, fn: flameAnim(fu, fv, fz) });
        lamps.push([px.X(p.u + fu, p.v + fv) / px.k - px.mx, px.Y(p.u + fu, p.v + fv, fz) / px.k - px.my]);
      }
    }
  }
  return { arts, lamps, anims };
}

// ------------------------------------------------------------------------------- shadows

/**
 * The sun's cast, per unit of height, on the ground: toward +u and a little toward -v, so a
 * shadow falls to the right of what casts it and a touch up the screen, away from the lit left
 * faces (the key light of pixels.ts, upper left).
 */
export const SUN: [number, number] = [0.62, -0.2];

/** A town's sun: the cast per unit of height, and the cast shadow's colour and depth (umbra mix). */
export interface Sun {
  dir: [number, number];
  shade: Col;
  /** How far the umbra moves a ground colour toward `shade` (the softer tip takes about 0.6 of it). */
  depth: number;
}
/**
 * The sun per faction: the commandery's low golden-hour sun throws long shadows (about 1.7× the
 * old cast) in a deep blue-violet; the castle town's is lower still and cooler; the necropolis's
 * a pale low sun over violet-black. Others keep the old noon cast.
 */
export function sunFor(id: string): Sun {
  switch (id) {
    case 'templar':
      return { dir: [1.04, -0.34], shade: hex('#24245c'), depth: 0.52 };
    case 'samurai':
      return { dir: [1.1, -0.36], shade: hex('#262a64'), depth: 0.5 };
    case 'undead':
      return { dir: [0.95, -0.31], shade: hex('#1c1830'), depth: 0.44 };
    default:
      return { dir: SUN, shade: hex('#2a2c50'), depth: 0.42 };
  }
}

/** 0..1: how deep in the cast shadow of any footprint (u, v) lies (1 in the umbra, less at the tip). */
export function shadowAt(u: number, v: number, casts: Footprint[], sun: [number, number] = SUN): number {
  let best = 0;
  for (const f of casts) {
    const lu = sun[0] * f[4];
    const lv = sun[1] * f[4];
    // Quick reject on the swept box.
    if (u < f[0] || u > f[2] + lu || v > f[3] || v < f[1] + lv) continue;
    // t range where (u, v) - t·L lies inside the footprint.
    let t0 = 0;
    let t1 = 1;
    const span = (p: number, a: number, b: number, l: number) => {
      if (Math.abs(l) < 1e-6) {
        if (p < a || p > b) t1 = -1;
        return;
      }
      const x = (p - b) / l;
      const y = (p - a) / l;
      t0 = Math.max(t0, Math.min(x, y));
      t1 = Math.min(t1, Math.max(x, y));
    };
    span(u, f[0], f[2], lu);
    span(v, f[1], f[3], lv);
    if (t1 < t0) continue;
    // The tip of the shadow (cast by the top) softens one step.
    const s = t0 > 0.82 ? 0.6 : 1;
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}
