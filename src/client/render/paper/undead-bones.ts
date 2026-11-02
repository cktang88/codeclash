// Which Hollow Host kinds are drawn on bones, and how each one moves (its blow, its brace, how it
// dies and what falls away). Registered by undead.ts after its own pose-rig figures, so these win.
// See docs/art-references/undead-animation.md.

import { U } from '../../../game/units.ts';
import { registerFoot, type FootSpec } from './undead-foot.ts';
import { GHOUL, LEGIONARY } from './undead-static.ts';

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

export function registerUndeadRigs(): void {
  registerFoot(U.Spearmen, GHOUL_SPEC, false);
  registerFoot(U.HeavyInfantry, LEGIONARY_SPEC, false);
}
