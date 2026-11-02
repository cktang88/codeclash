// Which Hollow Host kinds are drawn on bones, and how each one moves (its blow, its brace, how it
// dies and what falls away). Registered by undead.ts after its own pose-rig figures, so these win.
// See docs/art-references/undead-animation.md.

import { U } from '../../../game/units.ts';
import { registerFoot, type FootSpec } from './undead-foot.ts';
import { restPose, type DrawCtx } from './skeleton.ts';
import { GHOUL, LEGIONARY, soulWisp, THROWER, WARDEN, wardenHeap, type FootArt, type PieceOpts } from './undead-static.ts';

/**
 * A bow drawn on the frame: its draw from how far the nock (where the string hand is) has slid
 * back along the arrow from rest (the key art's half draw), the arrow gone after the loose, the
 * green fire flickering while it is on the string.
 */
function bowLive(ctx: DrawCtx): PieceOpts {
  const p = ctx.posed, rest = restPose(p.skel, p.level, p.facing);
  const d = (q: typeof p) => Math.hypot(q.byName.nock!.x - q.byName.itemF!.x, q.byName.nock!.y - q.byName.itemF!.y);
  const draw = Math.max(0, Math.min(3.4, 1.5 + (d(p) - d(rest)) / 1.9));
  const release = ctx.events.some((e) => e.name === 'release');
  return { draw: Math.round(draw * 4) / 4, arrow: !ctx.events.some((e) => e.name === 'empty'), phase: draw > 2 ? 0.75 : 0.25, snap: release };
}
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

export function registerUndeadRigs(): void {
  registerFoot(U.Archers, WARDEN_SPEC, true);
  registerFoot(U.Skirmishers, THROWER_SPEC, true);
  registerFoot(U.Spearmen, GHOUL_SPEC, false);
  registerFoot(U.HeavyInfantry, LEGIONARY_SPEC, false);
}
