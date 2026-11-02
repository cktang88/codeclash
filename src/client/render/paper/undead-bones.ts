// Which Hollow Host kinds are drawn on bones, and how each one moves (its blow, its brace, how it
// dies and what falls away). Registered by undead.ts after its own pose-rig figures, so these win.
// See docs/art-references/undead-animation.md.

import { U } from '../../../game/units.ts';
import { registerFoot, type FootSpec } from './undead-foot.ts';
import { LEGIONARY } from './undead-static.ts';

/** The Grave Legionary: a heavy cut with sword and shield, the shield wall, a fall back that comes apart. */
const LEGIONARY_SPEC: FootSpec = {
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
  tilt: -12,
  stiff: 0.7,
  drops: [
    { slot: 'weapon', holder: 'weapon', at: 3, land: { x: -6.6, y: -0.3, rot: -50, f: 6 } },
    { slot: 'front', holder: 'forearmF', at: 5, land: { x: 4.8, y: -1.5, rot: 84, f: 8 } },
    // Then it comes apart on the ground: the helm and the skull roll off, the jaw drops away, the
    // sword arm falls loose.
    { slot: 'helm', holder: 'head', at: 8, land: { x: -8.6, y: -0.6, rot: -100, f: 10 } },
    { slot: 'skull', holder: 'head', at: 8, land: { x: -6.8, y: -1.0, rot: 40, f: 10 } },
    { slot: 'jaw', holder: 'jaw', at: 9, land: { x: -4.9, y: -0.9, rot: 70, f: 11 } },
    { slot: 'forearmN', holder: 'forearmN', at: 8, land: { x: -3.2, y: -0.5, rot: 95, f: 10 } },
    { slot: 'upperArmN', holder: 'upperArmN', at: 9, land: { x: 1.6, y: -0.6, rot: -80, f: 11 } },
  ],
};

export function registerUndeadRigs(): void {
  registerFoot(U.HeavyInfantry, LEGIONARY_SPEC);
}
