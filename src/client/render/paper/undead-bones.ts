// Which Hollow Host kinds are drawn on bones, and how each one moves (its blow, its brace, how it
// dies and what falls away). Registered by undead.ts after its own pose-rig figures, so these win.
// See docs/art-references/undead-animation.md.

import { U } from '../../../game/units.ts';
import { COMMANDER_KIND } from '../contract.ts';
import { registerFoot, type FootSpec } from './undead-foot.ts';
import { restPose, type DrawCtx } from './skeleton.ts';
import { UM } from './undead-parts.ts';
import { registerBeasts } from './undead-beast.ts';
import { jawOf, registerMount, type MountSpec } from './undead-horse.ts';
import { ARBALEST, BLACK_RIDER, DEATH_KNIGHT, GHOUL, HORSE_ARCHER, LEGIONARY, LICH, lichHeap, soulWisp, THROWER, WARDEN, wardenHeap, type FootArt, type PieceOpts } from './undead-static.ts';

/**
 * A bow drawn on the frame: its draw from how far the nock (where the string hand is) has slid
 * back along the arrow from rest (the key art's half draw), the arrow gone after the loose, the
 * green fire flickering while it is on the string.
 */
const bowLiveOf = (restDraw: number, size: number) => (ctx: DrawCtx): PieceOpts => {
  const p = ctx.posed, rest = restPose(p.skel, p.level, p.facing);
  const d = (q: typeof p) => Math.hypot(q.byName.nock!.x - q.byName.itemF!.x, q.byName.nock!.y - q.byName.itemF!.y);
  const draw = Math.max(0, Math.min(3.4, restDraw + (d(p) - d(rest)) / (size * 0.2)));
  const release = ctx.events.some((e) => e.name === 'release');
  return { draw: Math.round(draw * 4) / 4, arrow: !ctx.events.some((e) => e.name === 'empty'), phase: draw > 2 ? 0.75 : 0.25, snap: release };
};
const bowLive = bowLiveOf(1.5, 9.5);
const withLive = (art: FootArt, slot: string, live: (ctx: DrawCtx) => PieceOpts): FootArt => ({ ...art, pieces: art.pieces.map((p) => (p.slot === slot ? { ...p, live } : p)) });

/** The Grave Legionary: a heavy cut with sword and shield, the shield wall, a fall back that comes apart. */
// Specs are built when registering (not at module load): undead-static.ts and undead.ts import
// each other, and the key art's constants must be initialised first.
const LEGIONARY_SPEC = (): FootSpec => ({
  art: LEGIONARY,
  nearDeg: -40,
  skull: { at: [0.85, -12.95], r: 1.1, ang: -4 },
  smear: [2.4, 7.2],
  attack: 'cut',
  shoot: null,
  brace: 'shield',
  die: 'back',
  farHeld: true,
  shield: true,
  hunch: 8,
  tilt: -16,
  stiff: 1,
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -8.2, y: -0.2, rot: -50, f: 6 } },
    { slot: 'front', holder: 'forearmF', at: 5, land: { x: 6.6, y: -1.5, rot: 84, f: 8 } },
    // Then, as he lands, it comes apart: the helm and the skull roll free, the jaw drops away and
    // the arm bones scatter, a shin lies apart.
    { slot: 'helm', holder: 'head', at: 8, land: { x: -10.2, y: -0.7, rot: -100, f: 10 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -6.8, y: -0.9, rot: 120, f: 10 } },
    { slot: 'jaw', holder: 'jaw', at: 8, land: { x: -4.6, y: -0.5, rot: 70, f: 10 } },
    { slot: 'forearmN', holder: 'forearmN', at: 8, land: { x: -2.6, y: -0.5, rot: 100, f: 10 } },
    { slot: 'upperArmN', holder: 'upperArmN', at: 8, land: { x: 1.6, y: -0.5, rot: -95, f: 11 } },
    { slot: 'forearmF', holder: 'forearmF', at: 9, land: { x: 8.6, y: -0.5, rot: 90, f: 11 } },
    { slot: 'shinN', holder: 'shinN', at: 9, land: { x: 4.2, y: -0.5, rot: -85, f: 11 } },
  ],
});

/** The Ghoul Spears: a hunched two-handed lunge, the spear set against horse, a fall on its face that comes apart. */
const GHOUL_SPEC = (): FootSpec => ({
  art: GHOUL,
  nearDeg: 174,
  skull: { at: [2.6, -10.7], r: 1, ang: -10 },
  jaw: { hinge: [2.65, -10.27], chin: [3.55, -9.75] },
  attack: 'lunge',
  shoot: null,
  brace: 'spear',
  die: 'forward',
  farHeld: true,
  twoHand: 1,
  hunch: 6,
  tilt: 8,
  stiff: 0.8,
  neFirst: [],
  neHide: ['upperArmF', 'forearmF'],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: 1.4, y: -0.4, rot: -82, f: 6 } },
    { slot: 'skull', holder: 'head', at: 9, land: { x: 8.4, y: -0.9, rot: 60, f: 11 } },
    { slot: 'jaw', holder: 'jaw', at: 9, land: { x: 6.6, y: -0.4, rot: 40, f: 11 } },
    { slot: 'forearmN', holder: 'forearmN', at: 9, land: { x: -3.6, y: -0.5, rot: 80, f: 11 } },
    { slot: 'forearmF', holder: 'forearmF', at: 8, land: { x: 4.2, y: -0.5, rot: -95, f: 10 } },
    { slot: 'shinN', holder: 'shinN', at: 9, land: { x: -6.2, y: -0.5, rot: 85, f: 11 } },
  ],
});

/** The Bone-Throwers: an overarm hurl of bone javelins (and the same stab held), a fall back that comes apart. */
const THROWER_SPEC = (): FootSpec => ({
  art: THROWER,
  nearDeg: 100,
  skull: { at: [0.8, -13.2], r: 1, ang: -4 },
  attack: 'hurl',
  shoot: 'javelin',
  brace: 'ready',
  die: 'back',
  farHeld: false,
  hunch: 7,
  tilt: 10,
  stiff: 0.9,
  cloak: true,
  neFirst: [],
  neLast: ['cape', 'quiver'],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -7.0, y: -0.3, rot: -10, f: 6 } },
    { slot: 'quiver', holder: 'chest', at: 7, land: { x: -5.2, y: -0.8, rot: -60, f: 9 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -9.2, y: -1.2, rot: 100, f: 10 } },
    { slot: 'forearmN', holder: 'forearmN', at: 8, land: { x: -2.4, y: -0.5, rot: 70, f: 10 } },
    { slot: 'upperArmF', holder: 'upperArmF', at: 9, land: { x: 2.0, y: -0.5, rot: -95, f: 11 } },
    { slot: 'shinF', holder: 'shinF', at: 9, land: { x: 5.8, y: -0.5, rot: 88, f: 11 } },
  ],
});

/**
 * The Wraith-Wardens (the Wraith Bows, recast): they glide, the cloak hiding the steps; a slow,
 * deliberate draw of the bone longbow with a green-fire arrow; the hood and mask fall away.
 */
const WARDEN_SPEC = (): FootSpec => ({
  art: withLive(WARDEN, 'farItem', bowLive),
  nearDeg: 100,
  farDeg: 93,
  skull: { at: [0.9, -13.45], r: 1, ang: 0 },
  attack: 'loose',
  shoot: 'bow',
  brace: 'ready',
  die: 'dissolve',
  farHeld: true,
  nocked: true,
  extras: [
    { slot: 'heap', bone: 'root', draw: (c, _J, back) => wardenHeap(c, back) },
    { slot: 'wisp', bone: 'root', top: true, live: (ctx) => ({ t: ctx.events.find((e) => e.name === 'wisp')?.int ?? 0 }), draw: (c, _J, _b, o) => void (o.t && soulWisp(c, o.t)) },
  ],
  lie: 2.6,
  glide: true,
  hunch: 4,
  tilt: -8,
  stiff: 1,
  cloak: true,
  neFirst: ['farItem'],
  neLast: ['cloak'],
  drops: [
    // The bow falls from the hand; the mask in its hood drops onto the empty robe.
    { slot: 'farItem', holder: 'itemF', at: 3, land: { x: 1.6, y: -0.35, rot: -86, f: 6 } },
    { slot: 'skull', holder: 'head', at: 6, land: { x: 1.4, y: -0.9, rot: -20, f: 9 } },
  ],
});

/** The crossbow drawn on the frame: unspanned from the loose until it is wound back; the cranequin's handle turning. */
function crossbowLive(ctx: DrawCtx): PieceOpts {
  const crank = ctx.events.find((e) => e.name === 'crank');
  return { draw: ctx.events.some((e) => e.name === 'empty') ? 0 : 1, t: crank ? (crank.int ?? 0) + 1 : 0 };
}

/** The Revenant Arbalests: the shot and a crank-spanning reload, a butt-stroke, aiming from a crouch; the pavise falls off the back as it comes apart. */
const ARBALEST_SPEC = (): FootSpec => ({
  art: withLive(ARBALEST, 'weapon', crossbowLive),
  nearDeg: 88,
  skull: { at: [0.9, -12.95], r: 1.08, ang: -4 },
  smear: [1.0, 3.2],
  smearMat: UM.wood,
  attack: 'butt',
  shoot: 'crossbow',
  brace: 'aim',
  die: 'back',
  farHeld: true,
  twoHand: 2.6,
  hunch: 6,
  tilt: -14,
  stiff: 0.8,
  neFirst: [],
  neLast: ['pavise'],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: 4.6, y: -0.4, rot: 0, f: 6 } },
    { slot: 'pavise', holder: 'chest', at: 5, land: { x: -7.2, y: -1.0, rot: -84, f: 8 } },
    { slot: 'helm', holder: 'head', at: 8, land: { x: -9.6, y: -0.6, rot: -100, f: 10 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -5.4, y: -0.9, rot: 110, f: 10 } },
    { slot: 'jaw', holder: 'jaw', at: 9, land: { x: -3.6, y: -0.4, rot: 60, f: 11 } },
    { slot: 'forearmN', holder: 'forearmN', at: 9, land: { x: 1.4, y: -0.5, rot: 90, f: 11 } },
    { slot: 'shinF', holder: 'shinF', at: 9, land: { x: 6.8, y: -0.5, rot: -88, f: 11 } },
  ],
});

/** The witchfire in the Lich's hand and on its staff, swelling through the cast (events `flare`) and streaming from the palm (`bolt`). */
const flareOf = (ctx: DrawCtx): number => ctx.events.find((e) => e.name === 'flare')?.int ?? 0;
const handFire = (ctx: DrawCtx): PieceOpts => ({ draw: flareOf(ctx) * 0.5, phase: flareOf(ctx) ? 0.25 + flareOf(ctx) * 0.15 : 0.25, snap: ctx.events.some((e) => e.name === 'bolt') });
const staffFire = (ctx: DrawCtx): PieceOpts => ({ t: flareOf(ctx) * 0.3, phase: 0.25 });

/** The Lich-Marshal: floats, glides, casts with the witch-hand; its end is the wraith's, an empty robe and the crown. */
const LICH_SPEC = (): FootSpec => ({
  art: withLive(withLive(LICH, 'forearmF', handFire), 'weapon', staffFire),
  nearDeg: 178,
  skull: { at: [0.9, -13.4], r: 1, ang: -6 },
  attack: 'cast',
  shoot: null,
  brace: 'staff',
  die: 'dissolve',
  farHeld: false,
  float: true,
  glide: true,
  hunch: 3,
  tilt: -6,
  stiff: 1,
  cloak: true,
  neFirst: [],
  neLast: ['cloak', 'mantleN', 'mantleF'],
  extras: [
    { slot: 'heap', bone: 'root', draw: (c, _J, back) => lichHeap(c, back) },
    { slot: 'wisp', bone: 'root', top: true, live: (ctx) => ({ t: ctx.events.find((e) => e.name === 'wisp')?.int ?? 0 }), draw: (c, _J, _b, o) => void (o.t && soulWisp(c, o.t)) },
  ],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -0.6, y: -0.3, rot: -88, f: 6 } },
    { slot: 'skull', holder: 'head', at: 6, land: { x: 1.8, y: -1.2, rot: 30, f: 9 } },
  ],
});

/** The Black Riders: the shroud streaming, the spear driven down from the saddle at the charge. */
const BLACK_RIDER_SPEC = (): MountSpec => ({
  art: BLACK_RIDER,
  nearDeg: 116,
  jaw: jawOf([1.0, -6.9], 0.82, -6),
  ride: 'thrust',
  tilt: -8,
  hunch: 6,
  neLast: ['torso'],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -8.0, y: -0.4, rot: -26, f: 6 } },
    { slot: 'hood', holder: 'head', at: 8, land: { x: -9.6, y: -0.6, rot: -80, f: 10 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -7.4, y: -0.9, rot: 120, f: 10 } },
    { slot: 'jaw', holder: 'jaw', at: 9, land: { x: -5.8, y: -0.4, rot: 60, f: 11 } },
    { slot: 'forearmN', holder: 'forearmN', at: 9, land: { x: 8.6, y: -0.5, rot: 90, f: 11 } },
  ],
});
/** The Barrow Horse Archers: the bow drawn from the saddle; Attack is the same shot at closer range. */
const HORSE_ARCHER_SPEC = (): MountSpec => ({
  art: { ...HORSE_ARCHER, pieces: HORSE_ARCHER.pieces.map((p) => (p.slot === 'farItem' ? { ...p, live: bowLiveOf(1.2, 7) } : p)) },
  nearDeg: 96,
  farDeg: 96,
  ride: 'bow',
  nocked: true,
  tilt: 8,
  hunch: 6,
  neFirst: ['farItem'],
  neLast: ['quiver', 'pennon'],
  drops: [
    { slot: 'farItem', holder: 'itemF', at: 3, land: { x: 7.4, y: -0.4, rot: -90, f: 6 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -7.8, y: -0.9, rot: 110, f: 10 } },
    { slot: 'quiver', holder: 'pelvis', at: 7, land: { x: -5.6, y: -0.6, rot: 60, f: 9 } },
    { slot: 'upperArmN', holder: 'upperArmN', at: 9, land: { x: 6.0, y: -0.5, rot: -90, f: 11 } },
    { slot: 'shinN', holder: 'shinN', at: 9, land: { x: -3.6, y: -0.5, rot: 90, f: 11 } },
  ],
});
/** The Death Knights: the heavy charge with the couched lance, the rider driven back at the impact. */
const DEATH_KNIGHT_SPEC = (): MountSpec => ({
  art: DEATH_KNIGHT,
  nearDeg: 174,
  jaw: jawOf([0.85, -6.75], 1.1, -4),
  ride: 'couch',
  tilt: -10,
  hunch: 4,
  neFirst: ['front'],
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -9.0, y: -0.4, rot: -84, f: 6 } },
    { slot: 'front', holder: 'upperArmF', at: 5, land: { x: 7.6, y: -1.4, rot: 84, f: 8 } },
    { slot: 'helm', holder: 'head', at: 8, land: { x: -10.4, y: -0.6, rot: -100, f: 10 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -7.6, y: -0.9, rot: 110, f: 10 } },
    { slot: 'jaw', holder: 'jaw', at: 9, land: { x: -5.8, y: -0.4, rot: 60, f: 11 } },
  ],
});

export function registerUndeadRigs(): void {
  registerBeasts(U.Shock, U.Artillery);
  registerMount(U.LightCavalry, BLACK_RIDER_SPEC, false);
  registerMount(U.HorseArchers, HORSE_ARCHER_SPEC, true);
  registerMount(U.Knights, DEATH_KNIGHT_SPEC, false);
  registerFoot(COMMANDER_KIND, LICH_SPEC, false);
  registerFoot(U.Crossbowmen, ARBALEST_SPEC, true);
  registerFoot(U.Archers, WARDEN_SPEC, true);
  registerFoot(U.Skirmishers, THROWER_SPEC, true);
  registerFoot(U.Spearmen, GHOUL_SPEC, false);
  registerFoot(U.HeavyInfantry, LEGIONARY_SPEC, false);
}
