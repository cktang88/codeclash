// The Hollow Host (undead) on paper. Owned by the undead faction agent; see README.md.
//
// First and template unit: the Grave Legionary (HeavyInfantry). A thin, grim skeleton in a rotted
// mail cape and a torn team tabard on a belt, a dented kettle hat, a notched rusty arming sword
// and a kite shield painted with a skull. References: Diablo II skeletons, Darkest Dungeon's Bone
// Soldier, Total War's Grave Guard (front); the Encyclopédie / Wellcome posterior skeleton plate,
// a posterior skeleton render and the LPC skeleton sheets (back). See
// docs/art-references/hd-sprites.md.

import { U } from '../../../game/units.ts';
import { Anim, COMMANDER_KIND } from '../contract.ts';
import { addP, code, DEG, hash, rot, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { along, BEAST0, ENGINE0, FOOT0, HORSE0, limb, poser, settle, snapDeg, swing, type BeastPose, type EnginePose, type FootPose, type HorsePose, type KeySet } from './rig.ts';
import {
  backbone, bone, bow, crossbow, flame, frameOf, handAt, head, hood, mailShirt, mul, pavise, pelvis, quiver, rag, ribcage, robe, shield, shieldBack, skelArm, skelLeg, skull, skullBack, spear, sword, tabard, UM,
  boneMat, femur, litStep, planeLight, shadeLower, withBone, horseBody, horseFar, horseFrame, horseNear, horseRemains, lance, riderFrame,
  type Frame, type HorseLook,
} from './undead-parts.ts';

export { UM } from './undead-parts.ts';

// ------------------------------------------------------------------ poses

const pose = poser(FOOT0);

/** Key poses per animation, authored by hand (a pixel animator's keys), then eased between. */
export const LEGIONARY_KEYS: KeySet<FootPose> = {
  poses: {
    // Idle: only the breath moves (a pixel of rise); every angle stays in its 7.5° step, so the
    // head, arms and blade keep their drawings and the loop does not boil.
    [Anim.Idle]: [pose({ nu: 16 }), pose({ py: 0.12, torso: 10, nu: 16, fu: 14, head: -5 })],
    // Walk: the sword arm is carried steady (the blade rides with the body, no wobble at the
    // head); the shield arm and the legs swing.
    [Anim.Walk]: [
      pose({ nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1, nu: 16, fu: 22 }),
      pose({ nt: 4, ns: -30, ft: 2, fs: -4, py: -0.3, nu: 16, fu: 14 }),
      pose({ nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1, nu: 16, fu: 4 }),
      pose({ nt: 2, ns: -4, ft: 4, fs: -30, py: -0.3, nu: 16, fu: 14 }),
    ],
    // Charging: leaning in, long strides with a flight phase, the blade carried forward.
    [Anim.Run]: [
      pose({ torso: 22, head: -10, nt: 42, ns: -12, ft: -32, fs: -38, py: 0.25, px: 0.2, nu: -6, nl: 84, fu: 34, fl: 60, bl: 118 }),
      pose({ torso: 20, head: -8, nt: 12, ns: -64, ft: 8, fs: -12, py: -0.55, px: 0.2, nu: 10, nl: 74, fu: 20, fl: 70, bl: 124 }),
      pose({ torso: 22, head: -10, nt: -30, ns: -36, ft: 42, fs: -14, py: 0.25, px: 0.2, nu: 30, nl: 64, fu: 2, fl: 80, bl: 132 }),
      pose({ torso: 20, head: -8, nt: 8, ns: -12, ft: 12, fs: -64, py: -0.55, px: 0.2, nu: 10, nl: 74, fu: 20, fl: 70, bl: 124 }),
    ],
    [Anim.Attack]: [
      // Anticipation: blade drawn up and back, weight on the back foot.
      pose({ torso: -4, nu: 150, nl: 40, sw: 40, nt: -4, ft: -14, head: -8, bl: 225 }),
      // The strike: lunge, blade sweeps down (smear).
      pose({ torso: 22, nu: 70, nl: 10, sw: 10, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.5, py: 0.35, bl: 95 }),
      // Follow-through past the target (overshoot).
      pose({ torso: 26, nu: 18, nl: -6, sw: 0, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.6, py: 0.4, bl: 45 }),
      // Recover.
      pose({ torso: 12, nu: 22, nl: 60, sw: 20, nt: 10, ft: -10, px: 0.2, bl: 135 }),
    ],
    // A blow lands: thrown back, the skull snaps back, the shield jerks up; then he steadies.
    [Anim.Hit]: [
      pose({}),
      pose({ torso: -14, head: -22, px: -0.45, py: 0.15, nu: 42, nl: 50, fu: 46, fl: 40, nt: -2, ns: -16, ft: -26, fs: -2, bl: 200 }),
      pose({ torso: 2, head: -10, px: -0.2, nu: 24, nl: 64, fu: 22, fl: 66, nt: 4, ft: -20, bl: 170 }),
    ],
    [Anim.Die]: [
      pose({ torso: -18, head: -20, nu: 60, nl: 30, fu: 40, fl: 30, nt: 4, ft: -6, bl: 200 }),
      pose({ torso: -10, head: 20, nu: 30, nl: 40, fu: 30, fl: 50, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.8, bl: 120 }),
      pose({ tilt: -55, torso: -10, head: 30, nu: 70, nl: 10, fu: 60, fl: 20, nt: 50, ns: -60, ft: 40, fs: -50, py: 2.0, bl: 70 }),
      pose({ tilt: -88, torso: -5, head: 40, nu: 100, nl: 0, fu: 90, fl: 10, nt: 30, ns: -20, ft: 20, fs: -20, py: 2.2, apart: 1 }),
    ],
    [Anim.Dead]: [pose({ tilt: -88, torso: -5, head: 40, nu: 100, nl: 0, fu: 90, fl: 10, nt: 30, ns: -20, ft: 20, fs: -20, py: 2.2, apart: 1 })],
    // Shield wall: crouched behind the shield held square in front, the blade cocked over it.
    [Anim.Brace]: [
      pose({ torso: 16, head: -2, py: 0.55, px: 0.15, nt: 28, ns: -34, ft: -26, fs: -4, fu: 62, fl: 24, nu: 52, nl: 86, bl: 108 }),
      pose({ torso: 18, head: 0, py: 0.68, px: 0.15, nt: 28, ns: -36, ft: -26, fs: -6, fu: 60, fl: 26, nu: 54, nl: 84, bl: 106 }),
    ],
  },
  secondary(out, anim, fr, n, k0, raw) {
    // The tabard swings a frame and a half behind the stride (and the strike).
    out.sway = anim === Anim.Walk ? swing(fr, n, 0.35, 1.5, 2) : anim === Anim.Run ? swing(fr, n, 0.5, 1.5, 2) : anim === Anim.Attack ? settle(fr, n, -0.4, 2) : anim === Anim.Hit ? settle(fr, n, 0.3, 1) : 0;
    // The smear shows on the in-betweens of the strike only.
    out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.3 ? 225 : anim === Anim.Attack && k0 === 1 && raw < 0.5 ? 120 : null;
  },
};

// ------------------------------------------------------------------ the figure

/**
 * The Grave Legionary, posed, facing SE (front) or NE (back); SW and NW are these mirrored.
 * Draw order is back to front.
 */
function legionary(c: Paper, p: FootPose, facing: Facing): void {
  const back = isBack(facing);
  const tilt = p.tilt;
  // Everything is posed relative to the feet, then tilted about them (falls).
  const T = (q: P2): P2 => rot(q, tilt * DEG);
  // Anchors snap to whole pixels: rigid parts then move by integer offsets (no boil).
  const pel: P2 = c.q(T([p.px, -6.5 + p.py]));
  const tor = p.torso + tilt;
  const neck = c.q(addP(pel, [limb(tor + 180)[0] * 4.9, limb(tor + 180)[1] * 4.9]));
  // The weapon (right) side is toward the viewer in both views: screen left from the front,
  // screen right from behind.
  const shN = addP(neck, T(back ? [1.4, 0.6] : [-0.35, 0.6]));
  const shF = addP(neck, T(back ? [-0.6, 0.35] : [1.65, 0.35]));
  const hipN = addP(pel, T(back ? [0.95, 0.2] : [-0.25, 0.2]));
  const hipF = addP(pel, T(back ? [-0.25, 0.05] : [0.95, 0.05]));
  const legs = (hip: P2, th: number, sh: number, far: boolean) => {
    const knee = along(hip, th + tilt, 3.25);
    const ank = along(knee, th + sh + tilt, 3.1);
    const tone = far ? 1 : 2;
    bone(c, hip, knee, 0.42, 0.36, tone);
    // Tibia and fibula: two thin bones side by side.
    c.rod(knee, ank, 0.34, 0.28, UM.bone, { tone });
    c.rod(addP(knee, [0.3, 0.1]), addP(ank, [0.25, -0.1]), 0.16, 0.14, UM.bone, { tone: tone - 1 });
    // Foot: a splay of small bones.
    c.rod(ank, addP(ank, rot([0.95, 0.2], tilt * DEG)), 0.34, 0.2, UM.bone, { tone });
  };
  const arm = (sh: P2, ua: number, la: number, far: boolean): P2 => {
    const elbow = along(sh, ua + tilt, 2.45);
    const hand = along(elbow, ua + la + tilt, 2.3);
    const tone = far ? 1 : 2;
    bone(c, sh, elbow, 0.36, 0.3, tone);
    c.rod(elbow, hand, 0.28, 0.24, UM.bone, { tone });
    c.rod(addP(elbow, [0.12, 0.12]), addP(hand, [0.1, 0.05]), 0.14, 0.12, UM.bone, { tone: tone - 1 });
    c.blob(hand, 0.34, 0.3, UM.bone, { tone });
    return hand;
  };

  if (p.apart >= 1) {
    // Fallen apart: bones in a heap, the skull on top, the shield and blade beside.
    if (back) shieldBack(c, [-2.6, -0.6], 80);
    else shield(c, [-2.6, -0.6], 80);
    sword(c, [2.4, -0.4], 100);
    for (let i = 0; i < 7; i++) {
      const a = i * 1.9, r = 0.6 + (i % 3) * 0.8;
      const cc: P2 = [Math.cos(a) * r * 1.6, -0.5 + Math.sin(a) * r * 0.5];
      bone(c, addP(cc, [-1.0, 0.1 * i]), addP(cc, [1.0, -0.1 * i]), 0.36, 0.3, 1 + (i % 2));
    }
    ribcage(c, [0.4, -1.8], [-1.2, -0.6], 0);
    if (back) skullBack(c, [0.6, -1.6], 30, true);
    else skull(c, [0.6, -1.6], 30, true);
    return;
  }
  const belt = () =>
    c.rod(addP(pel, [-0.9, -0.35]), addP(pel, [1.5, -0.45]), 0.42, 0.42, UM.leather, { tone: 2, detail: (x, _y, _u, v) => (Math.abs(v - 0.7) < 0.08 ? code(UM.iron, 3) : (c.lx(x) & 3) === 0 && v < 0.6 ? code(UM.leather, 1) : -1) });
  const pauldron = () => {
    // A dented rust-iron plate over the near shoulder, two rivets, a lit rim.
    for (const [dy, r] of [[0.15, 0.75], [0.55, 0.62]] as [number, number][]) {
      c.blob(addP(shN, [0.05, dy]), r, 0.42, UM.iron, {
        detail: (x, y, nx, ny) => {
          // Rust spreads from the lower edge up; a pale lit rim along the top; two rivets.
          if (ny < -0.6) return code(UM.steel, 3);
          if (Math.abs(ny) < 0.25 && (Math.abs(nx + 0.5) < 0.12 || Math.abs(nx - 0.45) < 0.12)) return code(UM.steel, 4);
          if (ny > 0.55) return code(UM.rust, 0);
          if (c.tex(x, y, 81) < 0.15 + (ny + 1) * 0.3) return code(UM.rust, ny > 0.2 ? 1 : 2);
          return -1;
        },
      });
    }
  };
  const blade = (handN: P2) => {
    const tipDeg = p.bl + tilt;
    // A solid smear: the blade's sweep as one pale shape (no blending), from where it was.
    if (p.smear !== null) c.smear(handN, p.smear + tilt, tipDeg, 1.2, 5.6, UM.steel);
    sword(c, handN, tipDeg - 180);
  };

  if (back) {
    // From behind: the shield is beyond the body (its back shows past the hip), then the far
    // leg and arm, the pelvis, the back (ribs, spine, shoulder blades), cape, tabard, belt, the
    // near leg, the back of the skull, the near arm with its pauldron, and the blade.
    const handF0 = along(along(shF, p.fu + tilt, 2.45), p.fu + p.fl + tilt, 2.3);
    shieldBack(c, addP(handF0, [1.2, 0.1]), -8 + tilt * 0.5);
    legs(hipF, p.ft, p.fs, true);
    arm(shF, p.fu, p.fl, true);
    // Pelvis from behind: the two iliac wings and the sacrum between them.
    c.blob(addP(pel, [0.35, 0.1]), 1.2, 0.62, UM.bone, { tone: 2, detail: (_x, _y, nx, ny) => (Math.abs(nx + 0.05) < 0.16 && ny > -0.4 ? code(UM.bone, ny > 0.3 ? 0 : 1) : -1) });
    backbone(c, neck, pel, shN, shF);
    mailShirt(c, neck, true);
    tabard(c, pel, c.qn(Math.sin(tor * DEG) * 0.3 + p.sway), true);
    belt();
    legs(hipN, p.nt, p.ns, false);
    c.rod(neck, addP(neck, T([0.15, -0.55])), 0.36, 0.3, UM.bone, { tone: 2 });
    skullBack(c, addP(neck, T([0.3, -1.05])), p.head + tilt, true);
    const handN = arm(shN, p.nu, p.nl, false);
    pauldron();
    blade(handN);
    return;
  }
  // Back to front: far leg, far arm and the shield behind, the body, the near leg and arm.
  legs(hipF, p.ft, p.fs, true);
  const handF = arm(shF, p.fu, p.fl, true);
  shield(c, addP(handF, [1.2, 0.1]), -8 + tilt * 0.5);
  // Pelvis: a bowl with hip wings.
  c.blob(addP(pel, [0.15, 0.1]), 1.15, 0.6, UM.bone, { tone: 2 });
  ribcage(c, neck, pel, tor);
  mailShirt(c, neck, false);
  tabard(c, pel, c.qn(Math.sin(tor * DEG) * 0.3 + p.sway), false);
  belt();
  legs(hipN, p.nt, p.ns, false);
  // Neck vertebrae and the skull.
  c.rod(neck, addP(neck, T([0.15, -0.55])), 0.36, 0.3, UM.bone, { tone: 1 });
  skull(c, addP(neck, T([0.3, -1.05])), p.head + tilt, true);
  const handN = arm(shN, p.nu, p.nl, false);
  pauldron();
  blade(handN);
}

registerPaperKind<FootPose>('undead', U.HeavyInfantry, {
  body: 'foot',
  keys: LEGIONARY_KEYS,
  draw: (c, p, facing) => legionary(c, p, facing),
});

// ================================================================== the other kinds
//
// Every kind below follows the Legionary: a hand-authored key set per animation (anticipation,
// strike, overshoot, recover), whole-pixel anchors, part-local texture, and a front (SE) and a
// back (NE) drawing. Each has one signature shape for the level-1 read (README, "Lint gate"):
// Ghoul Spears the tall spear over a hunch, Bone-Throwers the fan of bone javelins on the back,
// Wraith Bows the hood, the wisp-hemmed shroud and the man-high bow, Revenant Arbalests the skull
// pavise standing over the head, the Lich-Marshal the spined crown and the witchfire staff.
// Signature props are drawn a quarter larger at level 1 (`ex`).

/** Draws a figure, then puts its lower part in the shade (light from above). */
export const lit = (c: Paper, draw: () => void): void => {
  draw();
  shadeLower(c);
};

/** Signature props a quarter larger at level 1, where a figure is 13 px tall. */
const ex = (c: Paper): number => (c.L <= 1 ? 1.25 : 1);

/** Shared leg keys: a walk (contact, passing, contact, passing) and a run with a flight phase. */
const WALK_LEGS: Partial<FootPose>[] = [
  { nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1 },
  { nt: 4, ns: -30, ft: 2, fs: -4, py: -0.3 },
  { nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1 },
  { nt: 2, ns: -4, ft: 4, fs: -30, py: -0.3 },
];
const RUN_LEGS: Partial<FootPose>[] = [
  { nt: 42, ns: -12, ft: -32, fs: -38, py: 0.25, px: 0.2 },
  { nt: 12, ns: -64, ft: 8, fs: -12, py: -0.55, px: 0.2 },
  { nt: -30, ns: -36, ft: 42, fs: -14, py: 0.25, px: 0.2 },
  { nt: 8, ns: -12, ft: 12, fs: -64, py: -0.55, px: 0.2 },
];
/** Cloth sway for the usual animations: lagging the stride, thrown by a blow. */
const clothSway = (anim: Anim, fr: number, n: number, amp = 1): number =>
  amp * (anim === Anim.Walk ? swing(fr, n, 0.35, 1.5, 2) : anim === Anim.Run ? swing(fr, n, 0.5, 1.5, 2) - 0.3 : anim === Anim.Attack ? settle(fr, n, -0.4, 2) : anim === Anim.Hit ? settle(fr, n, 0.3, 1) : 0);

/**
 * Two-bone reach: the elbow for a shoulder reaching a target with upper and lower lengths, the
 * elbow bent downward (or upward with down = -1).
 */
function ik(sh: P2, target: P2, l1: number, l2: number, down = 1): P2 {
  const dx = target[0] - sh[0], dy = target[1] - sh[1];
  const d = Math.min(l1 + l2 - 0.05, Math.max(0.2, Math.hypot(dx, dy)));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx);
  const e1: P2 = [sh[0] + Math.cos(base + a) * l1, sh[1] + Math.sin(base + a) * l1];
  const e2: P2 = [sh[0] + Math.cos(base - a) * l1, sh[1] + Math.sin(base - a) * l1];
  return e1[1] > e2[1] === down > 0 ? e1 : e2;
}

/** An arm reaching a point (a second hand on a haft, a draw hand at the nock), skeletal or of flesh. */
function reach(c: Paper, F: Frame, sh: P2, target: P2, far: boolean, o: { flesh?: boolean; down?: number; sleeve?: number } = {}): P2 {
  const l1 = 2.45 * F.k, l2 = 2.3 * F.k;
  const el = ik(sh, target, l1, l2, o.down ?? 1);
  const dx = target[0] - el[0], dy = target[1] - el[1];
  const d = Math.hypot(dx, dy) || 1;
  const hand: P2 = d > l2 ? [el[0] + (dx / d) * l2, el[1] + (dy / d) * l2] : target;
  const tone = far ? 1 : 2;
  if (o.flesh) {
    c.rod(sh, el, 0.5, 0.4, UM.flesh, { tone });
    c.blob(el, 0.3, 0.3, UM.flesh, { tone: tone - 1 });
    c.rod(el, hand, 0.42, 0.3, UM.flesh, { tone });
    c.blob(hand, 0.36, 0.32, UM.flesh, { tone });
  } else {
    bone(c, sh, el, 0.36, 0.3, tone);
    c.rod(el, hand, 0.28, 0.24, boneMat(), { tone });
    c.blob(hand, 0.34, 0.3, boneMat(), { tone: tone - 1 });
  }
  if (o.sleeve) c.rod(sh, addP(sh, mul([el[0] - sh[0], el[1] - sh[1]], o.sleeve)), 0.95, 1.05, UM.shroud, { tone: far ? 1 : 2 });
  return hand;
}

// ------------------------------------------------------------------ Ghoul Spears (Spearmen)

const GHOUL = poser<FootPose>({ ...FOOT0, torso: -30, head: -26, nu: 40, nl: 70, fu: 20, fl: 60, bl: 172, nt: 30, ns: -40, ft: 6, fs: -30, py: 0.55 });
const ghoulLegs = (l: Partial<FootPose>): Partial<FootPose> => ({ ...l, nt: (l.nt ?? 0) + 14, ns: (l.ns ?? 0) - 22, ft: (l.ft ?? 0) + 10, fs: (l.fs ?? 0) - 20, py: (l.py ?? 0) + 0.55 });

export const GHOUL_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [GHOUL(), GHOUL({ py: 0.67, torso: -32 })],
    [Anim.Walk]: WALK_LEGS.map((l) => GHOUL({ ...ghoulLegs(l) })),
    [Anim.Run]: RUN_LEGS.map((l) => GHOUL({ ...ghoulLegs(l), torso: -40, head: -36, bl: 128, nu: 50, nl: 50 })),
    [Anim.Attack]: [
      // Draw the spear back, low, weight on the back foot.
      GHOUL({ torso: -18, nu: -15, nl: 95, bl: 100, px: -0.35, nt: 10, ft: -20 }),
      // The thrust: a long lunge, the spear driven level.
      GHOUL({ torso: -40, head: -34, nu: 72, nl: 14, bl: 95, px: 0.75, nt: 42, ns: -26, ft: -30, fs: -14 }),
      GHOUL({ torso: -44, head: -36, nu: 80, nl: 8, bl: 93, px: 0.9, nt: 44, ns: -26, ft: -32, fs: -14 }),
      GHOUL({ torso: -32, nu: 46, nl: 60, bl: 140, px: 0.3 }),
    ],
    [Anim.Hit]: [GHOUL(), GHOUL({ torso: -10, head: -48, px: -0.45, nu: 20, nl: 80, bl: 190 }), GHOUL({ torso: -24, head: -30, px: -0.2, bl: 178 })],
    [Anim.Die]: [
      GHOUL({ torso: -8, head: -46, bl: 200, px: -0.3 }),
      GHOUL({ torso: 0, head: -10, py: 1.8, nt: 60, ns: -100, ft: 40, fs: -90, bl: 230 }),
      GHOUL({ tilt: -60, torso: -10, head: 10, py: 2.0, nt: 50, ns: -60, ft: 40, fs: -50, bl: 250, nu: 80 }),
      GHOUL({ tilt: -88, torso: -4, head: 20, py: 2.3, nt: 30, ns: -30, ft: 20, fs: -20, bl: 268, nu: 110, nl: 10 }),
    ],
    // Pike wall: crouched low, the spear levelled at the enemy's chest.
    [Anim.Brace]: [
      GHOUL({ torso: -34, head: -38, py: 1.1, nu: 60, nl: 30, bl: 100, nt: 46, ns: -50, ft: -28, fs: -12 }),
      GHOUL({ torso: -35, head: -38, py: 1.22, nu: 60, nl: 30, bl: 100, nt: 46, ns: -52, ft: -28, fs: -14 }),
    ],
  },
  secondary(out, anim, fr, n) {
    out.sway = clothSway(anim, fr, n);
  },
};

/** A gaunt limb of grey dead flesh with a knob of a joint. */
export function fleshLimb(c: Paper, a: P2, b: P2, w0: number, w1: number, tone: number): void {
  c.rod(a, b, w0, w1, UM.flesh, { tone, detail: (x, y, u) => (c.L >= 4 && u > -0.2 && c.tex(x, y, 211, 3) < 0.1 ? code(UM.flesh, tone - 1) : -1) });
  c.blob(b, w1 * 0.75, w1 * 0.7, UM.flesh, { tone: tone - 1 });
}

/** A ghoul's leg: thin thigh and shin of grey flesh, a long clawed foot. */
function ghoulLeg(c: Paper, F: Frame, hip: P2, th: number, sh: number, far: boolean): void {
  const knee = along(hip, th + F.tilt, 3.1);
  const ank = along(knee, th + sh + F.tilt, 3.0);
  const tone = far ? 1 : 2;
  fleshLimb(c, hip, knee, 0.62, 0.42, tone);
  fleshLimb(c, knee, ank, 0.4, 0.28, tone);
  c.rod(ank, addP(ank, rot([1.15, 0.25], F.tilt * DEG)), 0.34, 0.16, UM.flesh, { tone });
}

/**
 * The ghoul's head: a long bald skull under grey skin, a heavy brow over a sunken socket with a
 * green point, a pointed ear laid back, the jaw hanging open on long teeth.
 */
export function ghoulHead(c: Paper, at: P2, ang: number, back: boolean): void {
  ang = snapDeg(ang);
  const R = (p: P2): P2 => addP(at, rot(p, ang * DEG));
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  const local = (x: number, y: number): P2 => rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -ang * DEG);
  if (back) {
    // The back of a bald, bony head: the spine's top knob, an ear laid back, the jaw's corner.
    c.shape([R([0.4, -0.2]), R([-0.25, -0.95]), R([0.05, 0.15])], () => code(UM.flesh, 1));
    c.blob(R([0.75, 0.55]), 0.4, 0.3, UM.flesh, { tone: 1 });
    c.blob(at, 0.85, 0.82, UM.flesh, { tone: 2, detail: (x, y, nx, ny) => (ny > 0.45 && Math.abs(nx) < 0.3 ? code(UM.flesh, 1) : c.tex(x, y, 213, 3) < 0.12 ? code(UM.flesh, 1) : -1) });
    return;
  }
  // The hanging lower jaw, open on long teeth.
  c.shape([R([0.1, 0.45]), R([1.05, 0.7]), R([0.95, 1.05]), R([0.05, 0.85])], () => code(UM.flesh, 1));
  // The mouth's dark and the teeth along both jaws.
  c.shape([R([0.25, 0.35]), R([1.2, 0.42]), R([1.0, 0.75]), R([0.25, 0.62])], (x, y) => {
    const [, fy] = local(x, y);
    const tooth = L <= 1 || ((c.lx(x) >> (L >= 8 ? 1 : 0)) & 1) === 0;
    if ((fy < 0.47 || fy > 0.62) && tooth) return code(UM.bone, 3);
    return code(UM.ink, 0);
  });
  // The cranium and the long muzzle as one shape.
  const head: P2[] = [R([-0.85, 0.1]), R([-0.75, -0.55]), R([-0.2, -0.88]), R([0.45, -0.75]), R([0.85, -0.35]), R([1.3, 0.15]), R([1.25, 0.42]), R([0.3, 0.45]), R([-0.3, 0.75])];
  c.shape(head, (x, y) => {
    const [fx, fy] = local(x, y);
    // The sunken socket under a heavy brow, a point of green in it.
    const e = Math.hypot(fx - 0.42, (fy + 0.18) * 1.2);
    if (e < (L <= 1 ? 0.55 : 0.18)) return code(UM.glow, 4);
    if (e < 0.33) return code(UM.ink, 0);
    if (fy < -0.36 && fy > -0.55 && fx > 0.05 && fx < 0.75) return code(UM.flesh, 3);
    // Nose slits on the muzzle.
    if (L >= 4 && fx > 1.0 && fx < 1.18 && Math.abs(fy - 0.05) < 0.08) return code(UM.ink, 1);
    // Light from the top-left, the jaw line and the back of the skull in shade.
    if (fy < -0.5 || (fx < -0.4 && fy < 0)) return code(UM.flesh, 3);
    if (fy > 0.25 || fx < -0.6) return code(UM.flesh, 1);
    if (c.tex(x, y, 217, 3) < 0.1) return code(UM.flesh, 1);
    return code(UM.flesh, 2);
  });
  // The ear, laid back.
  c.shape([R([-0.35, -0.35]), R([-1.15, -0.95]), R([-0.6, 0.0])], () => code(UM.flesh, 2));
}

/**
 * The ghoul's gaunt torso of grey skin, built along the spine: a hunched back (lit), a narrow
 * chest with the ribs standing out as dark ridges, a pinched, sunken belly in shade.
 */
function ghoulTorso(c: Paper, F: Frame): void {
  const { neck, pel, back } = F;
  const s: P2 = [neck[0] - pel[0], neck[1] - pel[1]];
  const n: P2 = [-s[1] / Math.hypot(...s), s[0] / Math.hypot(...s)]; // forward, across the spine
  const at = (t: number, w: number): P2 => addP(addP(pel, mul(s, t)), mul(n, w));
  const backW = [0.6, 0.7, 0.85, 1.0, 0.85, 0.5];
  const frontW = [0.7, 0.45, 0.55, 0.95, 1.05, 0.6];
  const ts = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const pts: P2[] = [...ts.map((t, i) => at(t, frontW[i]!)), ...ts.map((t, i) => at(t, -backW[i]!)).reverse()];
  const L = c.L;
  const len = Math.hypot(...s);
  c.shape(pts, (x, y) => {
    const dx = (x + 0.5 - c.sx(pel[0])) / L, dy = (y + 0.5 - c.sy(pel[1])) / L;
    const t = (dx * s[0] + dy * s[1]) / (len * len);
    const w = dx * n[0] + dy * n[1];
    // The spine's knobs along the back, the shoulder blade's ridge (back view).
    if (back && L >= 2 && Math.abs(w + 0.1) < 0.14 && t > 0.1) return code(UM.flesh, (Math.floor(t * len * 2.5) & 1) ? 3 : 1);
    // Ribs: ridges across the chest, a dark groove under each.
    if (!back && L >= 2 && t > 0.42 && t < 0.86 && w > -0.3) {
      const r = (t * len) % 0.62;
      if (r < 0.12) return code(UM.flesh, 1);
      if (r < 0.24) return code(UM.flesh, 3);
    }
    if (w < -0.45 + t * 0.1) return code(UM.flesh, 3);
    if (w > 0.35 && t < 0.45) return code(UM.flesh, 1);
    if (c.tex(x, y, 219, 3) < 0.1) return code(UM.flesh, 1);
    return code(UM.flesh, 2);
  });
  // The knobs of the spine along the hunch.
  if (!back) for (let i = 1; i < 5; i++) c.blob(at(i / 5 + 0.05, -backW[Math.min(5, i + 1)]! + 0.05), 0.22, 0.18, UM.flesh, { tone: 3 });
}

export function ghoul(c: Paper, p: FootPose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const back = isBack(facing);
  const F = frameOf(c, p, back, { spine: 4.4 });
  const E = ex(c);
  const handN = handAt(F, F.shN, p.nu, p.nl, 0.95);
  const bl = p.bl + F.tilt;
  const support = along(handN, bl + 180, 2.0);
  const spearIt = () => spear(c, handN, bl, 8.6 * E, 3.0, { blade: 1.8 * E, rag: true, sway: c.qn(p.sway * 0.3) });
  ghoulLeg(c, F, F.hipF, p.ft, p.fs, true);
  reach(c, F, F.shF, support, true, { flesh: true });
  if (back) spearIt();
  // A loincloth of brown rag.
  rag(c, addP(F.pel, [-0.9, -0.2]), addP(F.pel, [1.2, -0.3]), 2.2, p.sway, UM.rag, UM.rag, 215, { tone: back ? 2 : 2 });
  ghoulTorso(c, F);
  ghoulLeg(c, F, F.hipN, p.nt, p.ns, false);
  ghoulHead(c, addP(F.neck, F.T([0.5, -0.55])), p.head + F.tilt, back);
  if (!back) spearIt();
  // The near arm grips the spear (its fist over the haft).
  const el = along(F.shN, p.nu + F.tilt, 2.3);
  fleshLimb(c, F.shN, el, 0.55, 0.4, 2);
  fleshLimb(c, el, handN, 0.42, 0.3, 2);
  c.blob(handN, 0.38, 0.34, UM.flesh, { tone: 2 });
}

// ------------------------------------------------------------------ Bone-Throwers (Skirmishers)

const THROWER = poser<FootPose>({ ...FOOT0, torso: -4, nu: 28, nl: 52, fu: 4, fl: 24, bl: 176, sw: 1 });
/** `sw` < 0: the javelin has left the hand. */
export const THROWER_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [THROWER(), THROWER({ py: 0.12, torso: -8 })],
    [Anim.Walk]: WALK_LEGS.map((l, i) => THROWER({ ...l, fu: i % 2 ? 12 : i === 0 ? 30 : -6 })),
    [Anim.Run]: RUN_LEGS.map((l) => THROWER({ ...l, torso: -20, head: -10, nu: 40, nl: 60, bl: 120, fu: 30, fl: 70 })),
    [Anim.Shoot]: [
      THROWER({ torso: -2, nu: -20, nl: 40, bl: 120 }),
      // Wind-up: the javelin cocked back over the shoulder, the far arm aiming.
      THROWER({ torso: 12, head: -8, nu: -150, nl: -10, bl: 104, fu: 95, fl: 0, nt: 4, ft: -26, fs: -6 }),
      // The cast: the arm whips through, the body follows.
      THROWER({ torso: -22, head: -4, nu: 120, nl: 0, bl: 100, fu: 30, fl: 30, px: 0.5, nt: 30, ns: -20, ft: -24, fs: -12 }),
      THROWER({ torso: -26, nu: 40, nl: 10, bl: 100, sw: -1, fu: 20, fl: 40, px: 0.6, nt: 30, ns: -20, ft: -24, fs: -12 }),
      // Reach back to the quiver for the next.
      THROWER({ torso: -8, nu: -50, nl: 60, sw: -1, bl: 170 }),
      THROWER({ torso: -6, sw: 1 }),
    ],
    [Anim.Attack]: [
      THROWER({ torso: 0, nu: -20, nl: 90, bl: 95, px: -0.2 }),
      THROWER({ torso: -26, nu: 75, nl: 10, bl: 92, px: 0.6, nt: 34, ns: -24, ft: -24, fs: -10 }),
      THROWER({ torso: -28, nu: 82, nl: 6, bl: 90, px: 0.7, nt: 34, ns: -24, ft: -24, fs: -10 }),
      THROWER({ torso: -12, nu: 30, nl: 50, bl: 140, px: 0.2 }),
    ],
    [Anim.Hit]: [THROWER(), THROWER({ torso: 14, head: -22, px: -0.45, py: 0.15, nu: 40, nl: 50, fu: 46, fl: 40, bl: 200 }), THROWER({ torso: -2, head: -10, px: -0.2, bl: 185 })],
    [Anim.Die]: [
      THROWER({ torso: 18, head: -20, nu: 60, nl: 30, fu: 40, fl: 30, bl: 210 }),
      THROWER({ torso: 10, head: 20, nu: 30, nl: 40, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.8, bl: 130, sw: -1 }),
      THROWER({ tilt: -55, torso: 10, head: 30, nu: 70, nl: 10, nt: 50, ns: -60, ft: 40, fs: -50, py: 2.0, sw: -1 }),
      THROWER({ tilt: -88, torso: 5, head: 40, nu: 100, nl: 0, nt: 30, ns: -20, ft: 20, fs: -20, py: 2.2, apart: 1, sw: -1 }),
    ],
    [Anim.Brace]: [
      THROWER({ torso: -18, head: -4, py: 0.6, nu: 60, nl: 40, bl: 100, nt: 30, ns: -36, ft: -26, fs: -4, fu: 50, fl: 50 }),
      THROWER({ torso: -19, head: -4, py: 0.72, nu: 60, nl: 40, bl: 100, nt: 30, ns: -38, ft: -26, fs: -6, fu: 50, fl: 50 }),
    ],
  },
  secondary(out, anim, fr, n) {
    out.sway = clothSway(anim, fr, n);
  },
};

/** A sharpened bone javelin: a long shin bone, its knuckle the butt, splintered to a point. */
export function boneJavelin(c: Paper, hand: P2, deg: number, len: number): void {
  const butt = along(hand, deg + 180, len * 0.35);
  const tip = along(hand, deg, len * 0.65);
  c.blob(butt, 0.3, 0.28, UM.bone, { tone: 2 });
  c.rod(butt, tip, 0.34, 0.12, UM.bone, { tone: 3, detail: (_x, _y, _u, v) => (v > 0.8 ? code(UM.bone, 1) : -1) });
}

export function thrower(c: Paper, p: FootPose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const back = isBack(facing);
  if (p.apart >= 1) {
    remains(c, back, false);
    return;
  }
  const F = frameOf(c, p, back);
  const E = ex(c);
  // The javelin quiver slung across the back: shafts fanned up behind the shoulder.
  const qAt = addP(F.neck, F.T(back ? [-0.2, 1.7] : [-1.1, 1.5]));
  const qDeg = 205 + F.tor * 0.5;
  // A ragged cape of grave-cloth from the shoulders: dark on the field, it carries the figure's
  // value (a bare skeleton is as light as the grass is dark at the outline).
  const cape = () => rag(c, addP(F.neck, F.T(back ? [-1.3, 0.2] : [-1.6, 0.3])), addP(F.neck, F.T(back ? [1.7, 0.3] : [0.7, 0.15])), 7.0, p.sway * 1.2 - 0.3, UM.rag, UM.rag, back ? 225 : 227, { tear: 0.3, spread: 0.9, folds: false, flat: true });
  if (!back) cape();
  if (!back) quiver(c, qAt, qDeg, { shafts: 3, len: 1.8, bone: true });
  // Charred limbs and pelvis; the ribs and skull stay pale (the light falls on the chest).
  withBone(UM.char, () => {
    skelLeg(c, F, F.hipF, p.ft, p.fs, true);
    skelArm(c, F, F.shF, p.fu, p.fl, true);
    pelvis(c, F, 1);
  });
  if (back) backbone(c, F.neck, F.pel, F.shN, F.shF);
  else ribcage(c, F.neck, F.pel, F.tor);
  // A rotted jerkin over the ribs (they show through where it has rotted away).
  gambeson(c, F, p.sway, false);
  // A team loincloth and a sash across the chest: the army's colour on a bare skeleton.
  rag(c, addP(F.pel, back ? [-0.8, -0.3] : [-0.7, -0.35]), addP(F.pel, back ? [1.0, -0.3] : [1.3, -0.4]), 2.6, p.sway, UM.team, UM.teamDk, 221, { tear: 0.5 });
  c.rod(F.shN, addP(F.pel, F.T(back ? [-0.6, -0.6] : [1.1, -0.5])), 0.42, 0.42, UM.teamDk, { tone: 2 });
  if (back) cape();
  if (back) quiver(c, qAt, qDeg, { shafts: 3, len: 1.8, bone: true });
  withBone(UM.char, () => skelLeg(c, F, F.hipN, p.nt, p.ns, false));
  // A grave-cloth cowl over the skull, its face open: the skull grins out of the dark.
  c.rod(F.neck, addP(F.neck, F.T([0.15, -0.55])), 0.36, 0.3, UM.bone, { tone: 1 });
  hood(c, addP(F.neck, F.T([0.35, -1.15])), p.head + F.tilt, back, UM.rag, { skullFace: true, eyes: true });
  let handN: P2 = F.shN;
  withBone(UM.char, () => (handN = skelArm(c, F, F.shN, p.nu, p.nl, false)));
  if (p.sw >= 0) boneJavelin(c, handN, p.bl + F.tilt, 5.4 * E);
}

/** A fallen skeleton: bones in a heap, the skull on top, rags (and the weapon) beside. */
function remains(c: Paper, back: boolean, hat: boolean, extra?: () => void): void {
  extra?.();
  for (let i = 0; i < 7; i++) {
    const a = i * 1.9, r = 0.6 + (i % 3) * 0.8;
    const cc: P2 = [Math.cos(a) * r * 1.6, -0.5 + Math.sin(a) * r * 0.5];
    bone(c, addP(cc, [-1.0, 0.1 * i]), addP(cc, [1.0, -0.1 * i]), 0.36, 0.3, 1 + (i % 2));
  }
  ribcage(c, [0.4, -1.8], [-1.2, -0.6], 0);
  if (back) skullBack(c, [0.6, -1.6], 30, hat);
  else skull(c, [0.6, -1.6], 30, hat);
}

// ------------------------------------------------------------------ Wraith Bows (Archers)

const WRAITH = poser<FootPose>({ ...FOOT0, torso: -4, head: -2, nu: 20, nl: 50, fu: 40, fl: 20, bl: 70, sw: 0.3, py: -0.5 });
/** `bl` is the arrow's direction; `sw` the draw (0..2.6), negative when no arrow is nocked. */
export const WRAITH_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [WRAITH(), WRAITH({ py: -0.62 })],
    // It glides: the shroud swings, the body bobs a pixel.
    [Anim.Walk]: [WRAITH({ py: -0.5, torso: -8 }), WRAITH({ py: -0.75, torso: -8 }), WRAITH({ py: -0.5, torso: -8 }), WRAITH({ py: -0.75, torso: -8 })],
    [Anim.Run]: [WRAITH({ py: -0.6, torso: -24, head: -14, bl: 60, fu: 30, px: 0.3 }), WRAITH({ py: -0.95, torso: -26, head: -14, bl: 60, fu: 30, px: 0.3 })],
    [Anim.Shoot]: [
      WRAITH({ bl: 80, sw: 0.4, fu: 60 }),
      // Raise and nock.
      WRAITH({ bl: 96, sw: 0.8, fu: 88, fl: 0, torso: 0 }),
      // Full draw, held.
      WRAITH({ bl: 98, sw: 2.6, fu: 90, fl: 0, torso: 2, head: -4 }),
      WRAITH({ bl: 98, sw: 2.6, fu: 90, fl: 0, torso: 2, head: -4 }),
      // Loose: the string snaps home, the draw hand flies back.
      WRAITH({ bl: 100, sw: -1, fu: 92, fl: 0, torso: 4, head: -6, px: -0.15 }),
      WRAITH({ bl: 84, sw: -1, fu: 70, fl: 10 }),
    ],
    [Anim.Attack]: [
      WRAITH({ bl: 70, nu: -40, nl: 90, torso: 4 }),
      // A rake of bony claws, the bow held clear.
      WRAITH({ bl: 60, nu: 120, nl: 10, torso: -22, px: 0.5, sw: -1 }),
      WRAITH({ bl: 60, nu: 70, nl: 0, torso: -26, px: 0.6, sw: -1 }),
      WRAITH({ bl: 70, nu: 30, nl: 50, torso: -8, px: 0.2 }),
    ],
    [Anim.Hit]: [WRAITH(), WRAITH({ torso: 16, head: -24, px: -0.5, py: -0.9, bl: 50 }), WRAITH({ torso: 4, head: -8, px: -0.2 })],
    // It comes undone: thrown back, sinks, and the shroud falls empty over the bones.
    [Anim.Die]: [
      WRAITH({ torso: 18, head: -26, py: -0.9, bl: 40 }),
      WRAITH({ torso: 6, head: 10, py: 1.6, bl: 20, sw: -1 }),
      WRAITH({ torso: -10, head: 30, py: 3.4, bl: 0, sw: -1 }),
      WRAITH({ torso: -10, head: 30, py: 4.0, apart: 1, sw: -1 }),
    ],
    [Anim.Brace]: [WRAITH({ bl: 94, sw: 1.4, fu: 86, fl: 0, torso: -10, py: -0.3 }), WRAITH({ bl: 94, sw: 1.4, fu: 86, fl: 0, torso: -11, py: -0.4 })],
  },
  secondary(out, anim, fr, n) {
    out.sway = anim === Anim.Walk ? swing(fr, n, 0.45, 1.5, 2) : anim === Anim.Run ? -0.9 + swing(fr, n, 0.25, 1, 2) : clothSway(anim, fr, n);
  },
};

export function wraith(c: Paper, p: FootPose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const back = isBack(facing);
  const E = ex(c);
  if (p.apart >= 1) {
    // The empty shroud in a heap, the bow across it, a skull rolled clear.
    robe(c, [0, -2.2], 3.4, 5.6, 2.2, 0, UM.shroud, 231);
    bow(c, [0.6, -1.0], 10, 0, 8 * E, {});
    skull(c, [-1.8, -1.0], -40, false);
    return;
  }
  const F = frameOf(c, p, back, { k: 1.05 });
  const draw = Math.max(0, p.sw), arrow = p.sw > 0.4;
  const grip = handAt(F, F.shF, p.fu, p.fl);
  const bowDeg = p.bl + F.tilt;
  const bowSize = 9 * E;
  // The bow arm reaches forward (behind the body); the bow is drawn over the shroud.
  reach(c, F, F.shF, grip, true, { sleeve: 0.75 });
  // The shroud: no legs, a long torn hem that ends in wisps above the ground.
  const hemY = -F.pel[1] + 0.9; // from the pelvis to just above the ground
  robe(c, addP(F.neck, [0.1, 0.4]), 2.4, 3.8, F.pel[1] - F.neck[1] + hemY - 0.4, p.sway, UM.shroud, back ? 233 : 235, { wisp: true, back });
  // A ragged team stole over the shoulders.
  rag(c, addP(F.neck, F.T(back ? [-1.5, 0.3] : [-1.3, 0.35])), addP(F.neck, F.T(back ? [1.6, 0.35] : [1.6, 0.3])), back ? 3.0 : 1.7, p.sway * 0.6, UM.team, UM.teamDk, back ? 237 : 239, { tear: 0.6 });
  hood(c, addP(F.neck, F.T([0.35, -1.2])), p.head + F.tilt, back, UM.shroud, { skullFace: c.L >= 4 });
  const nock = bow(c, grip, bowDeg, draw, bowSize, { arrow, mat: UM.wood });
  // The draw hand: at the nock while drawing, else where the pose puts it.
  if (arrow || (draw > 0.1 && p.sw >= 0)) reach(c, F, F.shN, nock, false, { sleeve: 0.7, down: 1 });
  else {
    const el = along(F.shN, p.nu + F.tilt, 2.45 * F.k);
    c.rod(F.shN, addP(F.shN, mul([el[0] - F.shN[0], el[1] - F.shN[1]], 0.75)), 0.95, 1.05, UM.shroud, { tone: 2 });
    const h = along(el, p.nu + p.nl + F.tilt, 2.3);
    c.rod(el, h, 0.28, 0.24, UM.bone, { tone: 2 });
    // Claws.
    for (const d of [-25, 0, 25]) c.rod(h, along(h, p.nu + p.nl + F.tilt + d, 0.8), 0.18, 0.1, UM.bone, { tone: 3 });
  }
}

// ------------------------------------------------------------------ Revenant Arbalests (Crossbowmen)

const ARB = poser<FootPose>({ ...FOOT0, torso: -6, nu: 30, nl: 60, bl: 70, sw: 1 });
/** `bl` is the crossbow's aim; `sw` > 0 while it is spanned. */
export const ARB_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [ARB(), ARB({ py: 0.12, torso: -8 })],
    [Anim.Walk]: WALK_LEGS.map((l) => ARB({ ...l })),
    [Anim.Run]: RUN_LEGS.map((l) => ARB({ ...l, torso: -20, head: -10, bl: 60 })),
    [Anim.Shoot]: [
      ARB(),
      // Shoulder the crossbow and aim.
      ARB({ nu: 70, nl: 30, bl: 92, torso: -2, head: -6, nt: 14, ft: -22 }),
      ARB({ nu: 70, nl: 30, bl: 92, torso: -2, head: -6, nt: 14, ft: -22 }),
      // Loose: the prod snaps, the stock kicks.
      ARB({ nu: 66, nl: 36, bl: 98, torso: 4, head: -10, sw: -1, px: -0.2, nt: 14, ft: -22 }),
      // Span it again: nose to the ground, a foot in the stirrup, haul.
      ARB({ nu: 10, nl: 20, bl: 8, torso: -30, head: 10, sw: -1, nt: 40, ns: -40 }),
      ARB({ nu: 30, nl: 70, bl: 10, torso: -22, head: 6, sw: 1, nt: 40, ns: -40 }),
      ARB(),
    ],
    [Anim.Attack]: [
      // Club with the stock.
      ARB({ nu: 150, nl: 30, bl: 160, torso: 6 }),
      ARB({ nu: 60, nl: 20, bl: 70, torso: -24, px: 0.5, nt: 30, ns: -24, ft: -18 }),
      ARB({ nu: 30, nl: 20, bl: 40, torso: -28, px: 0.6, nt: 30, ns: -24, ft: -18 }),
      ARB({ torso: -12, px: 0.2 }),
    ],
    [Anim.Hit]: [ARB(), ARB({ torso: 14, head: -22, px: -0.45, py: 0.15, bl: 110 }), ARB({ torso: -2, head: -10, px: -0.2, bl: 80 })],
    [Anim.Die]: [
      ARB({ torso: 18, head: -20, nu: 60, nl: 30, bl: 140 }),
      ARB({ torso: 10, head: 20, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.8, bl: 160, sw: -1 }),
      ARB({ tilt: -55, torso: 10, head: 30, nt: 50, ns: -60, ft: 40, fs: -50, py: 2.0, sw: -1 }),
      ARB({ tilt: -88, torso: 5, head: 40, nt: 30, ns: -20, ft: 20, fs: -20, py: 2.2, apart: 1, sw: -1 }),
    ],
    // Behind the pavise, planted in front, the crossbow levelled over its top.
    [Anim.Brace]: [
      ARB({ torso: -16, head: -10, py: 1.0, nu: 70, nl: 30, bl: 92, nt: 40, ns: -60, ft: -30, fs: -40 }),
      ARB({ torso: -17, head: -10, py: 1.12, nu: 70, nl: 30, bl: 92, nt: 40, ns: -62, ft: -30, fs: -42 }),
    ],
  },
  secondary(out, anim, fr, n) {
    out.sway = clothSway(anim, fr, n);
  },
};

/** The rotted gambeson: quilted brown rag over the ribs, holes rotted through, a torn skirt. */
export function gambeson(c: Paper, F: Frame, sway: number, quilt = true): void {
  const { neck, pel, back } = F;
  const pts: P2[] = back
    ? [addP(neck, [-1.4, 0.2]), addP(neck, [1.8, 0.3]), addP(pel, [1.5, 1.6 + sway * 0.2]), addP(pel, [-1.0 + sway, 1.8]), addP(pel, [-1.2, 0.0])]
    : [addP(neck, [-1.5, 0.2]), addP(neck, [1.8, 0.1]), addP(pel, [1.7 + sway, 1.6]), addP(pel, [-0.9 + sway, 1.8]), addP(pel, [-1.0, 0.0])];
  const L = c.L;
  const bot = c.sy(pel[1] + 1.7);
  const qw = Math.max(2, Math.round(L * 0.6));
  c.shape(pts, (x, y) => {
    const fromBot = bot - y;
    const col = Math.floor(c.lx(x) / Math.max(2, L * 0.5));
    if (fromBot < L * 1.3 && hash(col, 5, 241) * L * 1.3 > fromBot) return -1;
    if (L >= 2 && c.tex(x, y, back ? 243 : 245, 4) < 0.13 && fromBot > L * 1.5) return -1; // rotted through
    if (Math.abs(y - c.sy(pel[1] - 0.3)) < Math.max(1, L * 0.3)) return code(UM.leather, 2); // belt
    const rel = (x - c.sx(neck[0] - 1.5)) / (3.3 * L);
    const lt = planeLight(rel * 2 - 1, ((y - c.sy(neck[1])) / Math.max(1, bot - c.sy(neck[1]))) * 2 - 1, 0.35);
    if (quilt && L >= 2 && c.lx(x) % qw === 0) return code(UM.rag, 1 + Math.min(0, lt)); // quilting
    return code(UM.rag, 2 + (lt > 0 ? litStep(c) : lt));
  });
}

export function arbalest(c: Paper, p: FootPose, facing: Facing, anim: Anim, _frame?: number): void {
  const back = isBack(facing);
  const E = ex(c);
  const braced = anim === Anim.Brace;
  if (p.apart >= 1) {
    remains(c, back, true, () => pavise(c, [-2.2, -1.2], -75, back, 0.8));
    crossbow(c, [2.4, -0.6], 100, false);
    return;
  }
  const F = frameOf(c, p, back);
  const s = 1.08 * E;
  // Slung on the back, standing over the head: behind the body from the front (its inner side),
  // over the back from behind (its painted face). Braced, it stands planted in front.
  const slung = addP(F.neck, F.T(back ? [-0.1, 1.0] : [-1.15, 0.85]));
  const planted: P2 = [F.pel[0] + 3.1, -2.9 * s * 0.92];
  if (braced && back) pavise(c, planted, 0, false, s);
  if (!braced && !back) pavise(c, slung, -6 + F.tor * 0.3, false, s);
  skelLeg(c, F, F.hipF, p.ft, p.fs, true);
  const grip = handAt(F, F.shN, p.nu, p.nl);
  const aim = p.bl + F.tilt;
  // At level 1 the arms are a pixel wide and sit beside the face: in shade, so the face keeps the light.
  const armBone = c.L <= 1 ? UM.char : UM.bone;
  withBone(armBone, () => reach(c, F, F.shF, along(grip, aim, 1.7), true));
  pelvis(c, F);
  if (back) backbone(c, F.neck, F.pel, F.shN, F.shF);
  else ribcage(c, F.neck, F.pel, F.tor);
  gambeson(c, F, p.sway);
  if (!braced && back) pavise(c, slung, 6 + F.tor * 0.3, true, s);
  skelLeg(c, F, F.hipN, p.nt, p.ns, false);
  // A bolt case at the hip.
  if (!back) quiver(c, addP(F.pel, [-1.0, 0.3]), 160, { shafts: 3, len: 1.6 });
  head(c, F, p.head, true);
  crossbow(c, grip, aim, p.sw > 0);
  withBone(armBone, () => skelArm(c, F, F.shN, p.nu, p.nl, false));
  if (braced && !back) pavise(c, planted, 0, true, s);
}

// ------------------------------------------------------------------ the Lich-Marshal (commander)

const LICH = poser<FootPose>({ ...FOOT0, torso: -4, head: -6, nu: 6, nl: 16, fu: 10, fl: 12, bl: 176, nt: 4, ns: -6, ft: -8, fs: -4 });
export const LICH_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [LICH(), LICH({ py: 0.12, torso: -5 })],
    [Anim.Walk]: WALK_LEGS.map((l) => LICH({ ...l, nt: (l.nt ?? 0) * 0.7, ft: (l.ft ?? 0) * 0.7, bl: 168 })),
    [Anim.Run]: RUN_LEGS.map((l) => LICH({ ...l, nt: (l.nt ?? 0) * 0.7, ft: (l.ft ?? 0) * 0.7, torso: -16, head: -12, bl: 140, nu: 40, nl: 40 })),
    [Anim.Attack]: [
      // Staff high, the far hand raised in witchfire.
      LICH({ torso: 8, head: -14, nu: 150, nl: 20, bl: 200, fu: 150, fl: 10 }),
      // The staff brought down like a mace.
      LICH({ torso: -20, nu: 80, nl: 0, bl: 105, fu: 90, fl: 0, px: 0.4, nt: 26, ns: -16, ft: -18 }),
      LICH({ torso: -24, nu: 60, nl: 0, bl: 80, fu: 80, fl: 10, px: 0.5, nt: 26, ns: -16, ft: -18 }),
      LICH({ torso: -10, nu: 30, nl: 40, bl: 150, px: 0.2 }),
    ],
    [Anim.Hit]: [LICH(), LICH({ torso: 16, head: -24, px: -0.45, py: 0.15, bl: 195, fu: 50 }), LICH({ torso: 0, head: -10, px: -0.2, bl: 185 })],
    [Anim.Die]: [
      LICH({ torso: 18, head: -26, nu: 60, bl: 205, fu: 120 }),
      LICH({ torso: -10, head: 20, py: 2.0, nt: 50, ns: -90, ft: 40, fs: -80, bl: 120 }),
      LICH({ tilt: -50, torso: -10, head: 30, py: 2.4, nt: 40, ns: -60, ft: 30, fs: -50, bl: 100 }),
      LICH({ tilt: -88, torso: -4, head: 40, py: 2.4, nt: 20, ns: -20, ft: 10, fs: -10, bl: 90, apart: 1 }),
    ],
    // Warding: the staff planted, the far hand held out with fire in it.
    [Anim.Brace]: [LICH({ torso: -10, py: 0.3, bl: 172, nu: 40, nl: 30, fu: 95, fl: 0 }), LICH({ torso: -11, py: 0.42, bl: 172, nu: 40, nl: 30, fu: 95, fl: 0 })],
  },
  secondary(out, anim, fr, n, k0, raw) {
    out.sway = clothSway(anim, fr, n);
    out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.4 ? 200 : null;
  },
};

/**
 * A crown of bone spines: a rusted circlet round the skull and a sunburst of thin, tapering
 * spines, long in the middle and short at the sides, alternating, lit on the near side.
 */
export function spineCrown(c: Paper, at: P2, ang: number, back: boolean, E: number): void {
  ang = snapDeg(ang);
  const base = addP(at, rot([0.05, -0.6], ang * DEG));
  const lens = [1.2, 2.0, 1.5, 2.7, 3.3, 2.6, 1.5, 1.9, 1.1];
  // At level 1 five spines (nine would merge into a block).
  const step = c.L <= 1 ? 2 : 1;
  for (let i = 0; i < lens.length; i += step) {
    const d = (i - 4) * 15;
    const from = addP(base, rot([d / 70, 0.05 + Math.abs(d) / 300], ang * DEG));
    const deg = snapDeg(180 - d * 1.05 + ang);
    const near = back ? d > 0 : d < 0;
    c.rod(from, along(from, deg, lens[i]! * E), 0.3, 0.06, UM.bone, { tone: near ? 3 : 2 });
  }
  c.rod(addP(base, rot([-1.05, 0.15], ang * DEG)), addP(base, rot([1.05, 0.05], ang * DEG)), 0.42, 0.42, UM.rust, { tone: 2, detail: (x) => ((c.lx(x) >> 1) % 3 === 0 ? code(UM.rust, 3) : -1) });
}

/**
 * The Lich-Marshal's high collar: a stiff fan of team cloth standing up behind the skull from
 * the shoulders, its upper edge cut into points (the vampire lord's collar, the Courtier's fur).
 */
export function collar(c: Paper, F: Frame, sway: number): void {
  const n = F.neck;
  const pts: P2[] = [addP(n, F.T([-1.9, 0.6])), addP(n, F.T([-2.1, -1.6])), addP(n, F.T([-1.4, -1.1])), addP(n, F.T([-0.9, -2.4])), addP(n, F.T([-0.3, -1.4])), addP(n, F.T([0.5, -2.3])), addP(n, F.T([0.9, -1.0])), addP(n, F.T([1.9, -1.5])), addP(n, F.T([2.1, 0.6]))];
  const cx = c.sx(n[0]), top = c.sy(n[1] - 2.4);
  void sway;
  c.shape(pts, (x, y) => {
    const rx = (x + 0.5 - cx) / (c.L * 2), ry = ((y - top) / (c.L * 3)) * 2 - 1;
    const lt = planeLight(rx, ry, 0.35);
    if (c.L >= 4 && Math.abs(rx + 0.25) < 0.05) return code(UM.teamDk, 1); // a stiffening seam
    return lt > 0 ? code(UM.team, 2 + litStep(c)) : lt < 0 ? code(UM.teamDk, 2) : code(UM.team, 1);
  });
}

/**
 * The open chest: the robe parted in a V from the collar to the girdle, the ribs across it and
 * the soul-fire burning inside them, a stole of team cloth down each lapel.
 */
export function lichChest(c: Paper, F: Frame, sway: number, phase: number): void {
  const n = F.neck, pel = F.pel;
  const v: P2[] = [addP(n, [-0.9, 0.5]), addP(n, [1.7, 0.45]), addP(pel, [1.0, -0.9]), addP(pel, [0.2, -0.9])];
  c.shape(v, () => code(UM.ink, 1));
  // The soul-fire where the heart was, flickering with the staff's flame.
  const heart = addP(n, [0.5, 1.9]);
  c.blob(heart, 0.95, 1.1, UM.glow, { tone: 2, detail: (_x, _y, nx, ny) => (Math.hypot(nx, ny) < 0.5 ? code(UM.glow, 4) : Math.hypot(nx, ny) < 0.8 ? code(UM.glow, 3) : -1) });
  if (c.L >= 2) ribcage(c, addP(n, [0.1, 0.1]), addP(pel, [0.1, -0.6]), F.tor);
  // The stoles: two strips of team cloth down the lapels, their ends torn.
  rag(c, addP(n, [-1.2, 0.3]), addP(n, [-0.6, 0.4]), 5.8, sway, UM.team, UM.teamDk, 265, { tear: 0.25, folds: false });
  rag(c, addP(n, [1.6, 0.35]), addP(n, [2.1, 0.3]), 5.4, sway, UM.team, UM.teamDk, 267, { tear: 0.25, folds: false });
}

export function lich(c: Paper, p: FootPose, facing: Facing, anim: Anim, frame: number): void {
  const back = isBack(facing);
  const E = ex(c);
  const phase = (frame % 4) / 4;
  if (p.apart >= 1) {
    robe(c, [-0.4, -1.8], 3.8, 6.2, 1.8, 0, UM.shroud, 251);
    rag(c, [-3.2, -1.2], [-0.4, -1.4], 1.2, 0, UM.team, UM.teamDk, 253);
    c.rod([-4.0, -0.4], [6.0, -0.8], 0.36, 0.3, UM.wood, { tone: 2 });
    c.blob([6.3, -1.0], 0.6, 0.6, UM.bone, { tone: 2 });
    skull(c, [-1.4, -1.6], -30, false);
    spineCrown(c, [-1.4, -1.6], -30, false, 1);
    return;
  }
  const F = frameOf(c, p, back, { k: 1.1 });
  const hand = handAt(F, F.shN, p.nu, p.nl);
  const sd = p.bl + F.tilt;
  const top = along(hand, sd, 6.4 * E), foot = along(hand, sd + 180, 5.8);
  const staff = () => {
    if (p.smear !== null) c.smear(hand, p.smear + F.tilt, sd, 3.5, 6.4 * E, UM.bone, { tone: 2 });
    // A staff of bone (a long spine of vertebrae), pale against the dark robe, bound with rusted wire.
    c.rod(foot, top, 0.4, 0.32, UM.bone, { tone: 2, detail: (_x, _y, u, v) => (Math.abs(v - 0.72) < 0.02 || Math.abs(v - 0.8) < 0.02 ? code(UM.rust, 2) : c.L >= 4 && u > -0.5 && Math.floor(v * 30) % 2 === 0 ? code(UM.bone, 1) : -1) });
    // The finial: a skull on the staff's head, in a cage of three bone prongs, witchfire burning out of its crown.
    const sk = along(top, sd, 0.4);
    if (c.L >= 2) for (const d of [-35, 0, 35]) c.rod(along(top, sd + 180, 0.4), along(along(top, sd + d * 0.6, 1.3 * E), sd + d * 1.4, 0.5), 0.2, 0.08, UM.bone, { tone: d < 0 ? 3 : 2 });
    c.blob(sk, 0.6 * E, 0.55 * E, UM.bone, { tone: 3, detail: (_x, _y, nx, ny) => (Math.hypot(Math.abs(nx) - 0.35, ny - 0.05) < 0.28 ? code(UM.glow, 3) : ny > 0.55 ? code(UM.ink, 1) : -1) });
    flame(c, along(sk, sd, 0.35 * E), 1.9 * E, phase);
  };
  const witchHand = anim === Anim.Attack || anim === Anim.Brace || anim === Anim.Die;
  // Bony feet under the hem.
  skelLeg(c, F, F.hipF, p.ft, p.fs, true, { len: 1.05 });
  if (back) {
    // The team mantle hangs down the back as a long tattered cloak.
    const fh = skelArm(c, F, F.shF, p.fu, p.fl, true);
    if (witchHand) flame(c, addP(fh, [0, -0.2]), 1.5, phase, { w: 0.6 });
    skelLeg(c, F, F.hipN, p.nt, p.ns, false, { len: 1.05 });
    robe(c, addP(F.neck, [0.2, 0.4]), 2.3, 5.0, -F.neck[1] - 0.3, p.sway, UM.shroud, 255, { back });
    rag(c, addP(F.neck, F.T([-1.6, 0.2])), addP(F.neck, F.T([1.9, 0.3])), 7.4, p.sway * 1.4, UM.team, UM.teamDk, 257, { tear: 0.35, spread: 0.6 });
    head(c, F, p.head, false);
    spineCrown(c, addP(F.neck, F.T([0.3, -1.05])), p.head + F.tilt, true, E);
    // From behind the collar stands in front of the skull's lower half.
    collar(c, F, p.sway);
    staff();
    skelArm(c, F, F.shN, p.nu, p.nl, false);
    return;
  }
  skelLeg(c, F, F.hipN, p.nt, p.ns, false, { len: 1.05 });
  // The far arm (behind) with fire in its hand when it casts.
  const fh = skelArm(c, F, F.shF, p.fu, p.fl, true);
  if (witchHand) flame(c, addP(fh, [0, -0.2]), 1.5, phase, { w: 0.6 });
  collar(c, F, p.sway);
  robe(c, addP(F.neck, [0.2, 0.4]), 2.3, 5.0, -F.neck[1] - 0.3, p.sway, UM.shroud, 259);
  lichChest(c, F, p.sway, phase);
  // A rope girdle.
  c.rod(addP(F.pel, [-1.1, -0.6]), addP(F.pel, [1.6, -0.7]), 0.3, 0.3, UM.rust, { tone: 1 });
  head(c, F, p.head, false);
  spineCrown(c, addP(F.neck, F.T([0.3, -1.05])), p.head + F.tilt, false, E);
  staff();
  // The staff hand, in a sleeve.
  const el = along(F.shN, p.nu + F.tilt, 2.45 * F.k);
  c.rod(F.shN, el, 1.0, 1.15, UM.shroud, { tone: 2 });
  c.rod(el, hand, 0.28, 0.24, UM.bone, { tone: 2 });
  c.blob(hand, 0.36, 0.32, UM.bone, { tone: 2 });
}

registerPaperKind<FootPose>('undead', U.Spearmen, { body: 'foot', keys: GHOUL_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => ghoul(c, p, facing, anim, frame)) });
registerPaperKind<FootPose>('undead', U.Skirmishers, { body: 'foot', keys: THROWER_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => thrower(c, p, facing, anim, frame)) });
registerPaperKind<FootPose>('undead', U.Archers, { body: 'foot', keys: WRAITH_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => wraith(c, p, facing, anim, frame)) });
registerPaperKind<FootPose>('undead', U.Crossbowmen, { body: 'foot', keys: ARB_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => arbalest(c, p, facing, anim, frame)) });
registerPaperKind<FootPose>('undead', COMMANDER_KIND, { body: 'foot', keys: LICH_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => lich(c, p, facing, anim, frame)) });

// ------------------------------------------------------------------ the cavalry: Black Riders, Barrow Horse Archers, Death Knights
//
// One skeletal horse (undead-parts.ts) under three riders. References: Dürer's *Four Horsemen*
// (Death's starved nag) and Total War's Hexwraiths (ribs and spine of a horse with nothing
// inside), Black Knights (barded skeletal horses), Skeleton Horsemen Archers; the Met's armour
// for man and horse (plates in rows) for the Death Knights' bone barding.

const HP = poser<HorsePose>({ ...HORSE0, fnu: 6, fnl: -4, ffu: -4, ffl: 2, hnu: -6, hnl: 4, hfu: 6, hfl: -2 });
/** Leg keys of the gaits, shared by the three riders (fore and hind, near and far). */
const H_WALK: Partial<HorsePose>[] = [
  // Contact: a diagonal pair planted wide, the body settles onto it and the head drops.
  { fnu: 26, fnl: -6, ffu: -18, ffl: 8, hnu: -22, hnl: 6, hfu: 20, hfl: -4, py: 0.2, pitch: -1.5, neck: 30, nod: 6 },
  // Passing: the other pair swings through flexed, the body rides up on the planted legs.
  { fnu: 6, fnl: -64, ffu: -4, ffl: 0, hnu: -4, hnl: 0, hfu: 8, hfl: -46, py: -0.35, pitch: 0.5, neck: 37, nod: -2 },
  { fnu: -18, fnl: 8, ffu: 26, ffl: -6, hnu: 20, hnl: -4, hfu: -22, hfl: 6, py: 0.2, pitch: -1.5, neck: 30, nod: 6 },
  { fnu: -4, fnl: 0, ffu: 6, ffl: -64, hnu: 8, hnl: -46, hfu: -4, hfl: 0, py: -0.35, pitch: 0.5, neck: 37, nod: -2 },
];
const H_GALLOP: Partial<HorsePose>[] = [
  // Extended: forelegs reaching, hind legs thrown back.
  { fnu: 48, fnl: -4, ffu: 38, ffl: -10, hnu: -38, hnl: 14, hfu: -28, hfl: 10, pitch: -2, py: 0.1, neck: 28, tail: 30 },
  // Gathered: all four under the body, in the air.
  { fnu: -12, fnl: -76, ffu: -22, ffl: -64, hnu: 30, hnl: -34, hfu: 22, hfl: -30, pitch: 2, py: -0.9, neck: 34, tail: 40 },
  // Hind legs land, the forelegs fold up to reach.
  { fnu: 56, fnl: -70, ffu: 44, ffl: -84, hnu: 14, hnl: 0, hfu: 4, hfl: 4, pitch: 5, py: -0.2, neck: 38, tail: 34 },
  // The forelegs strike the ground, the hind trail.
  { fnu: 10, fnl: 0, ffu: 24, ffl: -6, hnu: -20, hnl: 10, hfu: -6, hfl: -30, pitch: -3, py: 0.1, neck: 26, tail: 28 },
];
const H_DIE: Partial<HorsePose>[] = [
  { pitch: 8, neck: 50, nod: -20, fnu: 40, fnl: -70, hnu: -10, py: 0.2 },
  // Down on its knees: forelegs folded under, hind legs buckling.
  { pitch: -10, neck: 10, nod: 20, fnu: -60, fnl: 150, ffu: -50, ffl: 140, hnu: 30, hnl: -60, hfu: 30, hfl: -60, py: 3.0 },
  { pitch: -14, neck: -5, nod: 30, fnu: -70, fnl: 160, ffu: -60, ffl: 150, hnu: 60, hnl: -110, hfu: 60, hfl: -110, py: 4.4 },
];

/** Keys of a horse and rider: the gaits come from the shared legs; the rider's arms are the kind's own. */
function horseKeys(rider: (a: Anim, i: number) => Partial<HorsePose>, extra: { attack: Partial<HorsePose>[]; shoot?: Partial<HorsePose>[]; brace?: Partial<HorsePose> }): KeySet<HorsePose> {
  const poses: KeySet<HorsePose>['poses'] = {
    [Anim.Idle]: [HP({ ...rider(Anim.Idle, 0) }), HP({ ...rider(Anim.Idle, 1), py: 0.12, neck: 36 })],
    [Anim.Walk]: H_WALK.map((l, i) => HP({ ...l, ...rider(Anim.Walk, i) })),
    [Anim.Run]: H_GALLOP.map((l, i) => HP({ ...l, ...rider(Anim.Run, i) })),
    [Anim.Attack]: extra.attack.map((a) => HP({ ...rider(Anim.Attack, 0), ...a })),
    [Anim.Hit]: [HP(rider(Anim.Hit, 0)), HP({ ...rider(Anim.Hit, 1), pitch: 6, neck: 50, nod: -16, px: -0.3, torso: 14, head: -22 }), HP({ ...rider(Anim.Hit, 2), neck: 40, px: -0.15 })],
    [Anim.Die]: [...H_DIE.map((l, i) => HP({ ...rider(Anim.Die, i), ...l, torso: [12, -30, -50][i]!, head: [-20, 20, 30][i]! })), HP({ ...rider(Anim.Die, 2), ...H_DIE[2]!, apart: 1 })],
    [Anim.Brace]: [HP({ ...rider(Anim.Brace, 0), neck: 26, ...extra.brace }), HP({ ...rider(Anim.Brace, 1), neck: 27, py: 0.12, ...extra.brace })],
  };
  if (extra.shoot) poses[Anim.Shoot] = extra.shoot.map((s) => HP({ ...rider(Anim.Shoot, 0), ...s }));
  return {
    poses,
    secondary(out, anim, fr, n, k0, raw) {
      out.sway = anim === Anim.Walk ? swing(fr, n, 0.3, 1.5, 2) : anim === Anim.Run ? -0.8 + swing(fr, n, 0.4, 1.5, 4) : anim === Anim.Hit ? settle(fr, n, 0.4, 1) : anim === Anim.Attack ? settle(fr, n, -0.5, 2) : 0;
      // A thrust does not sweep: no smear for the riders.
      void k0, raw;
    },
  };
}

/** Draws a mount and rider, back to front: the parts the kind draws come in as hooks. */
function mounted(
  c: Paper,
  p: HorsePose,
  facing: Facing,
  look: HorseLook,
  rider: {
    /** Behind the horse's body (the far arm and what it holds). */
    farSide(F: Frame): void;
    /** The torso, head and cloak. */
    body(F: Frame): void;
    /** The near arm and its weapon, last. */
    nearSide(F: Frame): void;
    /** Remains of the rider beside the fallen horse. */
    fallen(back: boolean): void;
    /** What the rider's legs are made of (bone, or the Death Knights' black plate). */
    legMat?: number;
  },
): void {
  const back = isBack(facing);
  if (p.apart >= 1) {
    horseRemains(c, back, look);
    rider.fallen(back);
    return;
  }
  const H = horseFrame(c, p, back);
  const F = riderFrame(c, H, p, back);
  horseFar(c, H, p, look);
  const legMat = rider.legMat ?? boneMat();
  withBone(legMat, () => skelLeg(c, F, F.hipF, p.ft, p.fs, true, { len: 0.9 }));
  horseBody(c, H, p, look);
  rider.farSide(F);
  rider.body(F);
  withBone(legMat, () => skelLeg(c, F, F.hipN, p.nt, p.ns, false, { len: 0.9, w: legMat === UM.iron ? 1.5 : 1 }));
  horseNear(c, H, p, look);
  rider.nearSide(F);
}

/** A skeleton rider's bare torso: pelvis, ribs (front) or back, and a loincloth of rag. */
function bareRider(c: Paper, F: Frame, sway: number): void {
  pelvis(c, F);
  if (F.back) backbone(c, F.neck, F.pel, F.shN, F.shF);
  else ribcage(c, F.neck, F.pel, F.tor);
  rag(c, addP(F.pel, [-0.8, -0.3]), addP(F.pel, [1.1, -0.35]), 1.6, sway, UM.rag, UM.rag, 271, { tear: 0.5, folds: false });
}

// ---- Black Riders (LightCavalry): a hooded rider in a shroud whose tatters stream behind, a spear.

const BR_ARMS = { nu: 40, nl: 40, fu: 50, fl: 40, bl: 122, torso: 0 };
export const BLACK_RIDER_KEYS = horseKeys(
  (a, i) =>
    a === Anim.Run ? { ...BR_ARMS, nu: 60, nl: 30, bl: 96, torso: -16, head: -10 } : a === Anim.Walk ? { ...BR_ARMS, torso: i % 2 ? -2 : 0 } : a === Anim.Die ? { ...BR_ARMS, bl: 200 + i * 20 } : a === Anim.Brace ? { ...BR_ARMS, nu: 60, nl: 30, bl: 98, torso: -10 } : BR_ARMS,
  {
    attack: [
      // Draw the spear back and up, then drive it down-forward as the horse lunges.
      { nu: 140, nl: 20, bl: 120, torso: 10, pitch: 4, neck: 40, fnu: 30, fnl: -50 },
      { nu: 70, nl: 10, bl: 80, torso: -22, px: 0.5, pitch: -3, neck: 22, fnu: 40, fnl: -4, hnu: -24, hnl: 10 },
      { nu: 60, nl: 4, bl: 70, torso: -26, px: 0.6, pitch: -4, neck: 20, fnu: 42, fnl: -4, hnu: -26, hnl: 10 },
      { nu: 40, nl: 50, bl: 130, torso: -6, px: 0.2, neck: 32 },
    ],
  },
);

export function blackRider(c: Paper, p: HorsePose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const E = ex(c);
  mounted(c, p, facing, { mane: true }, {
    farSide(F) {
      // The far arm holds the reins, down to the neck.
      skelArm(c, F, F.shF, p.fu, p.fl, true, { len: 0.95 });
    },
    body(F) {
      // The shroud cloak: from the shoulders, over the horse's flank, its tatters streaming back.
      const sw = p.sway;
      const top = addP(F.neck, F.T([-0.4, 0.2]));
      const pts: P2[] = [addP(top, [-1.2, 0.0]), addP(top, [1.4, 0.1]), addP(F.pel, [1.3, 1.0]), addP(F.pel, [-1.5 + sw, 2.2]), addP(F.pel, [-3.6 + sw * 2, 2.6]), addP(F.pel, [-3.0 + sw * 1.6, 1.4]), addP(F.pel, [-4.4 + sw * 2.4, 1.0]), addP(top, [-2.6 + sw, 2.6])];
      const L = c.L;
      c.shape(pts, (x, y) => {
        if (L >= 2 && c.tex(x, y, F.back ? 281 : 283, 3) < 0.12) return -1;
        const rel = (x - c.sx(top[0] - 3)) / (4.6 * L);
        if (L >= 2 && Math.abs(((rel * 5) % 1) - 0.5) < 0.09 && y > c.sy(top[1] + 1)) return code(UM.shroud, 1);
        const ry = ((y - c.sy(top[1])) / (L * 4.5)) * 2 - 1;
        const lt = planeLight(rel * 2 - 1, ry, 0.4);
        return code(UM.shroud, 2 + (lt > 0 ? litStep(c) : lt));
      });
      // A team sash knotted over the shoulder, its ends flying.
      c.rod(addP(F.neck, F.T(F.back ? [1.2, 0.5] : [-0.3, 0.5])), addP(F.pel, F.T([F.back ? -0.6 : 1.0, -0.4])), 0.5, 0.5, UM.team, { tone: 2 });
      rag(c, addP(F.pel, [-0.7, -0.6]), addP(F.pel, [0.3, -0.6]), 2.2, sw - 1.2, UM.team, UM.teamDk, 285, { folds: false, tear: 0.5 });
      hood(c, addP(F.neck, F.T([0.35, -1.2])), p.head + F.tilt, F.back, UM.shroud, { skullFace: c.L >= 4 });
    },
    nearSide(F) {
      const hand = handAt(F, F.shN, p.nu, p.nl, 0.95);
      const deg = p.bl + F.tilt;
      if (p.smear !== null) c.smear(hand, p.smear + F.tilt, deg, 2.5, 7.5 * E, UM.steel, { tone: 2 });
      spear(c, hand, deg, 7.5 * E, 3.2, { blade: 1.5 * E });
      const el = along(F.shN, p.nu + F.tilt, 2.3);
      c.rod(F.shN, el, 0.95, 1.05, UM.shroud, { tone: 2 });
      c.rod(el, hand, 0.28, 0.24, UM.bone, { tone: 2 });
      c.blob(hand, 0.34, 0.3, UM.bone, { tone: 2 });
    },
    fallen(back) {
      robe(c, [-2.5, -1.6], 2.6, 4.2, 1.6, 0, UM.shroud, 287);
      spear(c, [-1.0, -0.6], 80, 6, 3);
      skull(c, [-4.4, -1.0], -30, false);
      void back;
    },
  });
}

// ---- Barrow Horse Archers (HorseArchers): a bare skeleton with a bow, a quiver at the hip.

const HA_ARMS = { nu: 30, nl: 40, fu: 40, fl: 30, bl: 70, sw: 0, torso: 0 };
export const HORSE_ARCHER_KEYS = horseKeys(
  (a, i) => (a === Anim.Run ? { ...HA_ARMS, torso: -14, head: -8, bl: 60 } : a === Anim.Walk ? { ...HA_ARMS, torso: i % 2 ? -2 : 0 } : HA_ARMS),
  {
    attack: [
      // Hack with the bow's limb, rising in the stirrups.
      { fu: 150, fl: 10, bl: 150, torso: 8 },
      { fu: 80, fl: 0, bl: 40, torso: -20, px: 0.4, pitch: -3 },
      { fu: 60, fl: 0, bl: 30, torso: -22, px: 0.5, pitch: -3 },
      { fu: 40, fl: 30, bl: 70, torso: -4 },
    ],
    shoot: [
      { fu: 70, fl: 10, bl: 90, sw: 0.5 },
      { fu: 92, fl: 0, bl: 96, sw: 0.8, torso: 6 },
      { fu: 92, fl: 0, bl: 98, sw: 2.4, torso: 8, head: -6 },
      { fu: 92, fl: 0, bl: 98, sw: 2.4, torso: 8, head: -6 },
      { fu: 94, fl: 0, bl: 100, sw: -1, torso: 10, head: -8, px: -0.1 },
      { fu: 60, fl: 20, bl: 80, sw: -1 },
    ],
    brace: { fu: 86, fl: 0, bl: 94, sw: 1.2 },
  },
);

export function horseArcher(c: Paper, p: HorsePose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const E = ex(c);
  mounted(c, p, facing, { cloth: true }, {
    farSide(F) {
      const grip = handAt(F, F.shF, p.fu, p.fl, 0.95);
      reach(c, F, F.shF, grip, true);
    },
    body(F) {
      // The quiver at the hip, arrows fanned behind.
      if (!F.back) quiver(c, addP(F.pel, [-1.0, -0.4]), 215, { shafts: 4, len: 2.2 });
      bareRider(c, F, p.sway);
      if (F.back) quiver(c, addP(F.pel, [-0.2, -0.8]), 215, { shafts: 4, len: 2.2 });
      // A long team pennon on a pole at the back: the troop's mark over the bow.
      // The pole stands clear of the skull (a pixel apart at level 1).
      const pole = addP(F.neck, F.T(F.back ? [0.2, 0.8] : [-1.6, 0.7]));
      const tip = addP(pole, [-0.9, -5.2 * E]);
      c.rod(pole, tip, 0.22, 0.2, UM.wood, { tone: 2 });
      const s = p.sway;
      c.shape([tip, addP(tip, [-3.2 + s, 0.6]), addP(tip, [-2.2 + s, 1.0]), addP(tip, [-3.0 + s, 1.5]), addP(tip, [0.0, 1.4])], (x, y) => (c.ly(y) < c.L * 0.5 ? code(UM.team, 3) : code(UM.team, 2)));
      head(c, F, p.head, false);
    },
    nearSide(F) {
      const draw = Math.max(0, p.sw), arrow = p.sw > 0.4;
      const grip = handAt(F, F.shF, p.fu, p.fl, 0.95);
      const nock = bow(c, grip, p.bl + F.tilt, draw, 6.0 * E, { arrow });
      if (arrow) reach(c, F, F.shN, nock, false);
      else skelArm(c, F, F.shN, p.nu, p.nl, false, { len: 0.95 });
    },
    fallen(back) {
      bow(c, [-2.2, -0.8], 0, 0, 5.5, {});
      remainsSmall(c, back);
    },
  });
}

/** A rider's bones beside his fallen horse. */
function remainsSmall(c: Paper, back: boolean): void {
  bone(c, [-6.5, -0.2], [-4.2, -0.6], 0.36, 0.3, 2);
  bone(c, [-3.8, 0.2], [-1.6, -0.1], 0.34, 0.3, 1);
  if (back) skullBack(c, [-5.2, -1.2], 20, false);
  else skull(c, [-5.2, -1.2], 20, false);
}

// ---- Death Knights (Knights): black plate on a bone-barded horse, a great helm with a team crest,
// the skull kite shield and a couched lance with a pennon.

const DK_ARMS = { nu: 20, nl: 40, fu: 30, fl: 60, bl: 172, torso: 0 };
export const DEATH_KNIGHT_KEYS = horseKeys(
  (a, i) =>
    a === Anim.Run ? { ...DK_ARMS, nu: 40, nl: 30, bl: 98, torso: -12, head: -6 } : a === Anim.Walk ? { ...DK_ARMS, torso: i % 2 ? -2 : 0 } : a === Anim.Die ? { ...DK_ARMS, bl: 200 + i * 20 } : DK_ARMS,
  {
    attack: [
      // Couch the lance, then the impact as the horse drives in, the shock thrown back up the arm.
      { nu: 40, nl: 30, bl: 104, torso: -6, neck: 28 },
      { nu: 70, nl: 6, bl: 92, torso: -24, px: 0.6, pitch: -4, neck: 18, fnu: 40, fnl: -6, hnu: -26, hnl: 12 },
      { nu: 66, nl: 10, bl: 96, torso: -16, px: 0.7, pitch: 2, neck: 30, fnu: 30, fnl: -40 },
      { nu: 30, nl: 40, bl: 150, torso: -4, px: 0.2 },
    ],
    // Lance couched at the trot.
    brace: { nu: 40, nl: 30, bl: 100, torso: -8 },
  },
);

/** The black cuirass: a breastplate (or backplate) over the ribs, lames at the waist, rust in the dents. */
export function cuirass(c: Paper, F: Frame): void {
  const { neck, pel, back } = F;
  const pts: P2[] = [addP(neck, [-1.4, 0.3]), addP(neck, [1.7, 0.25]), addP(pel, [1.3, -0.6]), addP(pel, [1.2, 0.5]), addP(pel, [-1.0, 0.5]), addP(pel, [-1.1, -0.6])];
  const L = c.L;
  const cx = c.sx(neck[0] + 0.15);
  const lame = c.sy(pel[1] - 0.6);
  c.shape(pts, (x, y) => {
    if (y > lame) return (y - lame) % Math.max(2, Math.round(L * 0.45)) === 0 ? code(UM.iron, 0) : code(UM.iron, 1);
    const rel = (x + 0.5 - cx) / L;
    if (L >= 4 && Math.abs(rel - (back ? 0.2 : 0.35)) < 0.09) return code(UM.iron, back ? 1 : 3); // the ridge (or spine groove)
    if (c.tex(x, y, 291, 3) < 0.1) return code(UM.rust, 1);
    const ry = ((y - c.sy(neck[1])) / Math.max(1, lame - c.sy(neck[1]))) * 2 - 1;
    const lt = planeLight(rel / 1.5, ry, 0.35);
    return code(UM.iron, 2 + (lt > 0 ? litStep(c) : lt));
  });
  // Pauldrons: two lames over each shoulder.
  for (const sh of [F.shF, F.shN]) {
    const far = sh === F.shF;
    for (const [dy, r] of [[0.0, 0.85], [0.5, 0.7]] as [number, number][])
      c.blob(addP(sh, [0, dy]), r, 0.5, UM.iron, { tone: far ? 1 : 2, detail: (x, y, _nx, ny) => (ny < -0.55 && !far ? code(UM.iron, 3) : ny > 0.5 ? code(UM.iron, 0) : c.tex(x, y, 293) < 0.12 ? code(UM.rust, 1) : -1) });
  }
}

/** A flat-topped great helm, black iron, a cross-shaped slit with two cold points of light, a team crest of rag streaming back. */
export function greatHelm(c: Paper, at: P2, ang: number, back: boolean, sway: number): void {
  ang = snapDeg(ang);
  const R = (p: P2): P2 => addP(at, rot(p, ang * DEG));
  // The crest: a strip of team rag from the crown, streaming back.
  c.shape([R([-0.2, -1.25]), R([0.5, -1.3]), R([-1.6 + sway, -0.3]), R([-2.4 + sway, 0.6]), R([-1.2 + sway, -0.6])], (x, y) => (c.ly(y) < c.L * 0.5 ? code(UM.team, 3) : code(UM.team, 2)));
  const pts: P2[] = [R([-1.05, -1.2]), R([1.05, -1.2]), R([1.15, 0.9]), R([0.2, 1.25]), R([-1.05, 0.95])];
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.shape(pts, (x, y) => {
    const [fx, fy] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -ang * DEG);
    if (!back) {
      // The sights: a slit across, a dark bar down, the light points in the slit.
      if (Math.abs(fy + 0.25) < (L <= 1 ? 0.5 : 0.11) && fx > -0.2) return Math.abs(fx - 0.55) < (L <= 1 ? 0.5 : 0.13) ? code(UM.glow, 4) : code(UM.ink, 0);
      if (L >= 2 && Math.abs(fx - 0.3) < 0.08 && fy > -0.25 && fy < 0.7) return code(UM.ink, 1);
      if (L >= 4 && fy > 0.25 && fy < 0.75 && fx > 0.55 && (c.ly(y) & 1) === 0 && (c.lx(x) % 3) === 0) return code(UM.ink, 1); // breaths
    }
    if (fy < -0.95) return code(UM.iron, 3);
    if (fx < -0.7) return code(UM.iron, 3);
    if (fx > 0.75) return code(UM.iron, 1);
    if (c.tex(x, y, 295, 3) < 0.1) return code(UM.rust, 1);
    return code(UM.iron, 2);
  });
}

export function deathKnight(c: Paper, p: HorsePose, facing: Facing, _anim?: Anim, _frame?: number): void {
  const E = ex(c);
  mounted(c, p, facing, { bard: true }, {
    legMat: UM.iron,
    farSide(F) {
      const hf = skelArm(c, F, F.shF, p.fu, p.fl, true, { len: 0.95 });
      if (F.back) shieldBack(c, addP(hf, [0.9, 0.2]), -6);
      else shield(c, addP(hf, [0.9, 0.2]), -6);
    },
    body(F) {
      tabard(c, F.pel, c.qn(p.sway * 0.6), F.back);
      cuirass(c, F);
      c.rod(F.neck, addP(F.neck, F.T([0.15, -0.55])), 0.4, 0.34, UM.iron, { tone: 1 });
      greatHelm(c, addP(F.neck, F.T([0.3, -1.15])), p.head + F.tilt, F.back, p.sway);
    },
    nearSide(F) {
      const hand = handAt(F, F.shN, p.nu, p.nl, 0.95);
      const deg = p.bl + F.tilt;
      lance(c, hand, deg, 9.5 * E, 3.0, { pennon: true, sway: p.sway, vamplate: true });
      // An armoured arm: a vambrace and a gauntlet.
      const el = along(F.shN, p.nu + F.tilt, 2.3);
      c.rod(F.shN, el, 0.75, 0.65, UM.iron, { tone: 2 });
      c.rod(el, hand, 0.65, 0.55, UM.iron, { tone: 2, shine: true });
      c.blob(hand, 0.45, 0.4, UM.iron, { tone: 1 });
    },
    fallen(back) {
      lance(c, [-6.0, -0.6], 82, 9, 2, { pennon: true });
      greatHelm(c, [-4.6, -1.1], -20, back, 0);
    },
  });
}

registerPaperKind<HorsePose>('undead', U.LightCavalry, { body: 'horse', keys: BLACK_RIDER_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => blackRider(c, p, facing, anim, frame)) });
registerPaperKind<HorsePose>('undead', U.HorseArchers, { body: 'horse', keys: HORSE_ARCHER_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => horseArcher(c, p, facing, anim, frame)) });
registerPaperKind<HorsePose>('undead', U.Knights, { body: 'horse', keys: DEATH_KNIGHT_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => deathKnight(c, p, facing, anim, frame)) });

// ------------------------------------------------------------------ the Bone Colossus (Shock)
//
// A towering hunched heap of fused skeletons: legs and arms of three bones bound side by side
// with gaps between, a mound of ribcages and skulls for a body with soul-fire showing through
// the ribs, a cluster of skulls for a head slung low in front of the hump, and a giant femur
// for a club. References: Total War's Necrofex Colossus and Varghulf (mass and hunch), Darkest
// Dungeon's Bone Captain (the weight and the club), the Diablo II skeleton sheet (thin bones).

const COL = poser<BeastPose>({ ...BEAST0, torso: -34, head: 16, nu: 45, nl: 0, fu: 10, fl: 30, bl: 135, nt: -14, ns: -10, ft: 24, fs: -30, hunch: 1, jaw: 0.2 });
const halfLegs = (l: Partial<FootPose>): Partial<BeastPose> => ({ nt: -14 + (l.nt ?? 0) * 0.6, ns: -10 + (l.ns ?? 0) * 0.6, ft: 24 + (l.ft ?? 0) * 0.6, fs: -30 + (l.fs ?? 0) * 0.6, py: (l.py ?? 0) * 0.5 });
export const COLOSSUS_KEYS: KeySet<BeastPose> = {
  poses: {
    [Anim.Idle]: [COL(), COL({ py: 0.25, jaw: 0.3 })],
    // A lumbering walk: the whole heap rolls from foot to foot.
    [Anim.Walk]: WALK_LEGS.map((l) => COL({ ...halfLegs(l) })),
    [Anim.Run]: RUN_LEGS.map((l, i) => COL({ ...halfLegs(l), torso: -44, head: 24, bl: 110, nu: 50, nl: 30, fu: i % 2 ? 40 : -10, jaw: 0.6 })),
    [Anim.Attack]: [
      // The club heaved up over the hump.
      COL({ torso: -18, head: 6, nu: 175, nl: 10, bl: 215, fu: 40, fl: 30, jaw: 0.8, ft: -20 }),
      // Brought down to the ground in front, the heap following through.
      COL({ torso: -52, head: 30, nu: 70, nl: 10, bl: 80, px: 0.8, nt: 34, ns: -30, ft: -26, fs: -12, jaw: 1 }),
      COL({ torso: -56, head: 34, nu: 50, nl: 6, bl: 62, px: 0.9, py: 0.4, nt: 36, ns: -32, ft: -26, fs: -12, jaw: 0.7 }),
      COL({ torso: -38, nu: 40, nl: 30, bl: 120, px: 0.3 }),
    ],
    [Anim.Hit]: [COL(), COL({ torso: -16, head: -6, px: -0.6, py: 0.2, bl: 170, jaw: 0.9 }), COL({ torso: -28, head: 10, px: -0.3, bl: 150 })],
    // It comes apart: sags, kneels, and the heap slides into a mound of bones.
    [Anim.Die]: [
      COL({ torso: -16, head: -4, bl: 190, jaw: 1 }),
      COL({ torso: -40, head: 30, py: 2.6, nt: 60, ns: -110, ft: 50, fs: -100, bl: 90 }),
      COL({ torso: -62, head: 40, py: 4.4, nt: 70, ns: -140, ft: 60, fs: -130, bl: 70, apart: 0.5 }),
      COL({ torso: -62, head: 40, py: 4.4, apart: 1 }),
    ],
    // Braced: crouched, the club held across the body.
    [Anim.Brace]: [COL({ torso: -40, py: 0.8, nu: 70, nl: 50, bl: 100, nt: 30, ns: -40, ft: -20, fs: -20 }), COL({ torso: -41, py: 0.98, nu: 70, nl: 50, bl: 100, nt: 30, ns: -42, ft: -20, fs: -22 })],
  },
  secondary(out, anim, fr, n, k0, raw) {
    out.sway = clothSway(anim, fr, n);
    out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.45 ? 215 : null;
  },
};

/** A limb of the heap: three bones bound side by side with gaps, rusted bands, a knob at the end. */
function heapLimb(c: Paper, a: P2, b: P2, w: number, tone: number, seed: number): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  const n: P2 = [-dy / d, dx / d];
  if (c.L <= 1) {
    // At level 1 the three bones are one stroke: a 1-px bone would be noise.
    c.rod(a, b, w * 0.95, w * 0.8, UM.char, { tone });
    return;
  }
  for (let i = -1; i <= 1; i++) {
    const off = mul(n, i * w * 0.42);
    const lag = 0.12 * hash(i + 2, seed, 301) * d;
    c.rod(addP(addP(a, off), mul([dx / d, dy / d], lag)), addP(b, off), w * 0.36, w * 0.3, UM.char, { tone: tone - (i === 1 ? 1 : 0) });
  }
  if (c.L >= 2) c.rod(addP(a, mul([dx, dy], 0.45)), addP(a, mul([dx, dy], 0.52)), w * 1.25, w * 1.25, UM.rust, { tone: tone - 1 });
  c.blob(b, w * 0.62, w * 0.55, UM.char, { tone: tone - 1, detail: (_x, _y, nx, ny) => (Math.abs(ny - nx * 0.4) < 0.12 ? code(UM.char, 0) : -1) });
}

/** A big skull for the colossus' head: the cranium, sockets with soul-fire, a jaw that drops. */
function bigSkull(c: Paper, at: P2, r: number, ang: number, jaw: number, back: boolean): void {
  ang = snapDeg(ang);
  const R = (p: P2): P2 => addP(at, rot(mul(p, r), ang * DEG));
  if (!back) {
    c.shape([R([-0.3, 0.55]), R([0.75, 0.55 + jaw * 0.25]), R([0.6, 0.95 + jaw * 0.45]), R([-0.25, 0.85 + jaw * 0.2])], (x) => (c.L >= 2 && (c.lx(x) >> (c.L >= 8 ? 1 : 0)) % 2 === 0 ? code(UM.bone, 3) : code(UM.bone, 1)));
    c.shape([R([-0.2, 0.5]), R([0.7, 0.5]), R([0.6, 0.6 + jaw * 0.35]), R([-0.2, 0.62 + jaw * 0.15])], () => code(UM.ink, 0));
  }
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.blob(at, r, r * 0.9, UM.bone, {
    detail: (x, y) => {
      const [fx, fy] = rot([(x + 0.5 - cx) / (L * r), (y + 0.5 - cy) / (L * r)], -ang * DEG);
      if (back) return Math.abs(fy + 0.1 - Math.abs(fx) * 0.4) < 0.06 ? code(UM.bone, 0) : -1;
      for (const ox of [-0.12, 0.45]) {
        const e = Math.hypot(fx - ox, (fy + 0.02) * 1.2);
        if (e < 0.28) return e < (L <= 1 ? 0.5 : 0.12) ? code(UM.glow, 4) : code(UM.ink, 0);
      }
      if (Math.abs(fx - 0.18) < 0.08 && fy > 0.22 && fy < 0.42) return code(UM.ink, 1);
      if (fy < -0.3 && fy > -0.45 && fx > -0.35) return code(UM.bone, 3);
      return -1;
    },
  });
}

export function colossus(c: Paper, p: BeastPose, facing: Facing, _anim: Anim, frame: number): void {
  const back = isBack(facing);
  const K = 1.75;
  const E = ex(c);
  if (p.apart >= 1) {
    // A mound of bones and skulls, the femur across it, the last soul-fire guttering.
    c.shape([[-6, 0], [-4.5, -2.6], [-1, -3.6], [3, -3.2], [6, -0.8], [6.5, 0]], (x, y) => (c.tex(x, y, 311, 3) < 0.3 ? code(UM.bone, 0) : code(UM.bone, 1)));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.3, r = 1 + (i % 4) * 1.1;
      const cc: P2 = [Math.cos(a) * r * 1.3, -1.6 + Math.sin(a) * r * 0.35];
      bone(c, addP(cc, [-1.2, 0.1 * i - 0.4]), addP(cc, [1.2, -0.1 * i]), 0.4, 0.34, 1 + (i % 3 === 0 ? 1 : 0));
    }
    ribcage(c, [-1.8, -3.4], [-3.6, -1.6], 0);
    femur(c, [2.5, -0.5], 80, 6.5, 0.7);
    for (const [x, y, a] of [[-3.5, -2.6, -20], [1.2, -3.2, 30], [4.2, -2.0, 10]] as [number, number, number][]) skull(c, [x, y], a, false);
    flame(c, [-0.6, -3.0], 1.2, (frame % 4) / 4, { w: 0.6 });
    return;
  }
  // Short, bowed legs under a heavy heap: the pelvis low, the spine long.
  const F = frameOf(c, p, back, { k: K, pelY: -5.3 * K, spine: 5.4 * K });
  const collapse = p.apart; // 0.5: the heap begins to slide
  // A wide stance under the weight.
  F.hipN = addP(F.pel, F.T(back ? [1.5, 0.3] : [-1.3, 0.3]));
  F.hipF = addP(F.pel, F.T(back ? [-1.2, 0.0] : [1.5, 0.0]));
  const leg = (hip: P2, th: number, sh: number, far: boolean) => {
    const knee = along(hip, th + F.tilt, 2.6 * K);
    const ank = along(knee, th + sh + F.tilt, 2.65 * K);
    heapLimb(c, hip, knee, 1.2, far ? 1 : 3, far ? 1 : 2);
    heapLimb(c, knee, ank, 1.0, far ? 1 : 3, far ? 3 : 4);
    // A broad foot of splayed toe bones.
    for (const d of [-0.4, 0, 0.4]) c.rod(ank, addP(ank, [1.5, 0.25 + d * 0.4]), 0.36, 0.22, UM.char, { tone: far ? 1 : 2 });
  };
  const arm = (sh: P2, ua: number, la: number, far: boolean): P2 => {
    const el = along(sh, ua + F.tilt, 2.6 * K);
    const hand = along(el, ua + la + F.tilt, 2.6 * K);
    heapLimb(c, sh, el, 1.05, far ? 2 : 3, far ? 5 : 6);
    heapLimb(c, el, hand, 0.9, far ? 2 : 3, far ? 7 : 8);
    // A hand of long finger bones.
    for (const d of [-30, -10, 10, 30]) c.rod(hand, along(hand, ua + la + F.tilt + d, 1.2), 0.24, 0.14, UM.char, { tone: far ? 1 : 2 });
    return hand;
  };
  arm(F.shF, p.fu, p.fl, true);
  // The heap: a hump from the hips to the shoulders, dark between the bones.
  const s: P2 = [F.neck[0] - F.pel[0], F.neck[1] - F.pel[1]];
  const sl = Math.hypot(...s);
  const nrm: P2 = [-s[1] / sl, s[0] / sl];
  const at = (t: number, w: number): P2 => addP(addP(F.pel, mul(s, t)), mul(nrm, w));
  const hump = 1 + collapse * 0.4;
  const mass: P2[] = [at(-0.12, 2.4), at(0.3, 3.2), at(0.75, 3.5), at(1.05, 2.2), at(1.15, -0.6), at(1.0, -3.2 * hump), at(0.6, -4.2 * hump), at(0.15, -3.2), at(-0.15, -1.2)];
  // The hollow of the heap, dark, lit along its hump.
  c.shape(mass, (x, y) => {
    const rx = (x - c.sx(F.pel[0])) / (c.L * 4), ry = (y - c.sy(F.neck[1])) / (c.L * 6) - 0.5;
    return planeLight(rx, ry, 0.5) > 0 ? code(UM.char, 1) : code(UM.ink, 1);
  });
  // The heap itself: long bones fused every which way over the hollow, most blackened, some
  // bare, so it reads as a pile of the dead (the Necrofex's lashed bones) and not a rock.
  if (c.L >= 4)
    for (let i = 0; i < 16; i++) {
      const t = 0.08 + (i % 4) * 0.27 + hash(i, 1, 317) * 0.12;
      const w = -2.9 * hump + Math.floor(i / 4) * 1.55 + hash(i, 2, 317) * 0.6;
      const ang = snapDeg(hash(i, 3, 317) * 180);
      const mid = at(Math.min(1.05, t), Math.min(3.0, w));
      const len = 1.3 + hash(i, 4, 317) * 1.1;
      const a = along(mid, ang, len), b2 = along(mid, ang + 180, len);
      const pale = hash(i, 5, 317) < 0.45;
      const tone = 2 + planeLight((mid[0] - F.pel[0]) / 4, (mid[1] - F.neck[1]) / 6 - 0.5, 0.3);
      c.rod(a, b2, 0.5, 0.42, pale ? UM.bone : UM.char, { tone: pale ? tone - 1 : tone + 1 });
      c.blob(a, 0.38, 0.34, pale ? UM.bone : UM.char, { tone: tone - 1 });
      c.blob(b2, 0.36, 0.32, pale ? UM.bone : UM.char, { tone: tone - 1 });
    }
  // The soul-fire inside, seen through the ribs.
  c.blob(at(0.62, 0.6), 1.6, 1.4, UM.glow, { tone: 2, detail: (_x, _y, nx, ny) => (Math.hypot(nx, ny) < 0.45 ? code(UM.glow, 4) : Math.hypot(nx, ny) < 0.75 ? code(UM.glow, 3) : -1) });
  // Ribcages fused in the heap, skulls caught among them, spines along the hump.
  ribcage(c, at(0.95, 0.6), at(0.35, 1.4), F.tor);
  ribcage(c, at(0.75, -1.3), at(0.2, -0.8), F.tor);
  if (back) backbone(c, at(1.0, -0.6), at(0.05, -0.4), at(0.95, 1.4), at(0.9, -2.6));
  for (let i = 0; i < 6; i++) {
    const t = 0.2 + i * 0.16;
    const base = at(t, -2.5 * hump - Math.sin(t * Math.PI) * 0.8);
    c.rod(base, addP(base, mul(nrm, -1.2 - (i % 2) * 0.6)), 0.4, 0.12, UM.bone, { tone: 3 });
  }
  const studs: [number, number, number][] = back ? [[0.5, -1.6, 20], [0.25, 0.2, -10], [0.85, -2.2, 40]] : [[0.4, 1.5, -10], [0.2, -1.4, 25], [0.6, -2.4, 40], [0.95, 2.0, -20]];
  for (const [t, w, a] of studs) (back ? skullBack : skull)(c, at(t, w), a, false);
  // A tattered team banner of rag tied to the tallest spine.
  const pole = at(0.7, -3.4 * hump);
  const top = addP(pole, mul(nrm, -3.2 * E));
  c.rod(pole, top, 0.3, 0.26, UM.bone, { tone: 2 });
  rag(c, top, addP(top, [-2.4, 0.3]), 3.0, c.qn(p.sway * 0.3) - 0.4, UM.team, UM.teamDk, 315, { tear: 0.55 });
  // The far leg too comes out from under the heap's skirt of bones.
  leg(F.hipF, p.ft, p.fs, true);
  leg(F.hipN, p.nt, p.ns, false);
  // The head: a cluster of skulls slung low in front of the hump.
  const hd = at(1.08, 1.4);
  if (!back) {
    skull(c, addP(hd, [-0.9, -1.2]), -20, false);
    skull(c, addP(hd, [1.1, 0.9]), 30, false);
  }
  bigSkull(c, hd, 1.55, p.head + F.tilt, p.jaw, back);
  // The near arm and the femur club.
  const hand = handAt(F, F.shN, p.nu, p.nl, 1.06);
  const deg = p.bl + F.tilt;
  if (p.smear !== null) c.smear(hand, p.smear + F.tilt, deg, 3, 8.5 * E, UM.bone, { tone: 2 });
  if (back) arm(F.shN, p.nu, p.nl, false);
  femur(c, along(hand, deg + 180, 0.6), deg, 8.5 * E, 0.85);
  if (!back) arm(F.shN, p.nu, p.nl, false);
}

registerPaperKind<BeastPose>('undead', U.Shock, { body: 'beast', keys: COLOSSUS_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => colossus(c, p, facing, anim, frame)) });

// ------------------------------------------------------------------ the Corpse Trebuchet (Artillery)
//
// A counterweight trebuchet of black timber and lashed bone: two A-frames, a long throwing arm,
// a counterweight cage crammed with corpses and skulls, a sling cradling a ball of green-burning
// remains, skulls nailed to the uprights, a team rag from the frame, and a skeleton crew at the
// winch and the arm. References: the Screaming Skull Catapult and the Mortis Engine (Total War),
// Villard de Honnecourt's and the Maciejowski Bible's counterweight engines (frame and sling).

const ENG = poser<EnginePose>({ ...ENGINE0, arm: -45, sling: 0, load: 1 });
export const TREBUCHET_KEYS: KeySet<EnginePose> = {
  poses: {
    [Anim.Idle]: [ENG(), ENG({ py: 0.0 })],
    // Hauled forward: the crew lean into it, the wheels turn.
    [Anim.Walk]: [ENG({ lean: 1, crew: 0 }), ENG({ lean: 1, crew: 0.25, py: -0.12 }), ENG({ lean: 1, crew: 0.5 }), ENG({ lean: 1, crew: 0.75, py: -0.12 })],
    [Anim.Run]: [ENG({ lean: 1.4, crew: 0 }), ENG({ lean: 1.4, crew: 0.25, py: -0.12 }), ENG({ lean: 1.4, crew: 0.5 }), ENG({ lean: 1.4, crew: 0.75, py: -0.12 })],
    [Anim.Shoot]: [
      ENG(),
      // The trigger is knocked out: the arm whips up, the sling trailing...
      ENG({ arm: 10, sling: -50, crew: 0.5 }),
      ENG({ arm: 110, sling: 60, crew: 0.6 }),
      // ...and lets the shot go at the top.
      ENG({ arm: 160, sling: 170, load: 0, recoil: 0.6, crew: 0.7 }),
      ENG({ arm: 176, sling: 200, load: 0, recoil: 0.2 }),
      ENG({ arm: 140, sling: 120, load: 0 }),
      // Wound back down by the crew, and loaded.
      ENG({ arm: 40, sling: 20, load: 0, crew: 0.25 }),
      ENG({ arm: -30, sling: 0, load: 0, crew: 0.5 }),
      ENG({ arm: -45, sling: 0, load: 1, crew: 0.75 }),
    ],
    // The crew beat off attackers with their tools.
    [Anim.Attack]: [ENG({ crew: 0.25, lean: -1 }), ENG({ crew: 0.75, lean: 2 }), ENG({ crew: 0.8, lean: 2.2 }), ENG({ crew: 0.5, lean: 0 })],
    [Anim.Hit]: [ENG(), ENG({ recoil: 1, px: -0.3, crew: 0.6 }), ENG({ recoil: 0.3 })],
    [Anim.Die]: [ENG({ recoil: 1 }), ENG({ tilt: -8, arm: -20, recoil: 1, py: 0.5 }), ENG({ tilt: -20, arm: 30, py: 1.5, apart: 0.5 }), ENG({ tilt: -20, arm: 30, py: 1.5, apart: 1 })],
    [Anim.Brace]: [ENG({ crew: 0.25 }), ENG({ crew: 0.3 })],
  },
  secondary(out, anim, fr, n) {
    out.sway = anim === Anim.Walk || anim === Anim.Run ? swing(fr, n, 0.3, 1.5, 2) : anim === Anim.Shoot ? settle(fr, n, 0.6, 2) : 0;
  },
};

/** A crewman of the dead: a small skeleton posed by the work phase, in a team rag. */
function crewman(c: Paper, at: P2, back: boolean, phase: number, lean: number, push: boolean, tool: 'bar' | 'mallet'): void {
  const w = Math.sin(phase * Math.PI * 2);
  // The body leans into the work; only the arms and legs pump (the heads hold still).
  const torso = -10 - lean * 10 - (push ? 8 : 0);
  const F = frameOf(c, { px: 0, py: 0, tilt: 0, torso }, back, { origin: at, k: 0.84 });
  const nt = 10 + w * 18, ft = -14 - w * 18;
  skelLeg(c, F, F.hipF, ft, -6, true);
  const reachDeg = push ? 80 : 40 + w * 40;
  skelArm(c, F, F.shF, reachDeg, 10, true);
  pelvis(c, F);
  if (back) backbone(c, F.neck, F.pel, F.shN, F.shF);
  else ribcage(c, F.neck, F.pel, F.tor);
  rag(c, addP(F.pel, [-0.7, -0.3]), addP(F.pel, [1.0, -0.35]), 2.0, w * 0.2, UM.team, UM.teamDk, back ? 321 : 323, { tear: 0.5, folds: false });
  skelLeg(c, F, F.hipN, nt, -12, false);
  head(c, F, -4, false);
  const hand = skelArm(c, F, F.shN, reachDeg + (push ? 0 : w * 30), push ? 0 : 20, false);
  if (tool === 'mallet') {
    const d = push ? 120 : 150 + w * 60;
    c.rod(hand, along(hand, d, 2.4), 0.24, 0.22, UM.wood, { tone: 2 });
    c.rod(along(along(hand, d, 2.4), d + 90, 0.6), along(along(hand, d, 2.4), d - 90, 0.6), 0.6, 0.6, UM.wood, { tone: 1 });
  } else c.rod(along(hand, 30, 1.2), along(hand, 210, 1.6), 0.26, 0.26, UM.wood, { tone: 1 });
}

/** A spoked wheel at `at`, radius r, turned by `turn` (0..1). */
function wheel(c: Paper, at: P2, r: number, turn: number, tone: number): void {
  c.blob(at, r, r, UM.wood, { tone, detail: (_x, _y, nx, ny) => (Math.hypot(nx, ny) > 0.72 ? code(UM.wood, tone) : -2) });
  for (let i = 0; i < 3; i++) {
    const a = snapDeg(turn * 120 + i * 60);
    c.rod(along(at, a, r * 0.75), along(at, a + 180, r * 0.75), 0.22, 0.22, UM.wood, { tone: tone - 1 });
  }
  c.blob(at, r * 0.25, r * 0.25, UM.iron, { tone: 2 });
}

export function trebuchet(c: Paper, p: EnginePose, facing: Facing, anim: Anim, frame: number): void {
  const back = isBack(facing);
  const E = ex(c);
  const phase = (frame % 4) / 4;
  // The whole engine moves by whole pixels (snapped), so its timbers never re-rasterise.
  const off = c.q([p.px - p.recoil * 0.3, p.py]);
  const T = (q: P2): P2 => rot(addP(q, off), p.tilt * DEG);
  const depth: P2 = back ? [-1.3, -1.0] : [1.3, -1.0];
  if (p.apart >= 1) {
    // The wreck: snapped timbers, the cage burst, skulls and the crew's bones in the grass.
    c.rod([-7.5, -0.4], [7, -0.6], 0.6, 0.6, UM.wood, { tone: 1 });
    c.rod([-5, -0.6], [1.5, -6.5], 0.55, 0.45, UM.wood, { tone: 2 });
    c.rod([2.5, -0.8], [9.5, -3.5], 0.5, 0.4, UM.wood, { tone: 2 });
    c.rod([4.5, -0.6], [3.2, -5.0], 0.5, 0.4, UM.wood, { tone: 1 });
    for (const [x, y, a] of [[-2.5, -1.2, -30], [0.8, -1.0, 20], [6.0, -1.3, 0]] as [number, number, number][]) skull(c, [x, y], a, false);
    bone(c, [-6.5, -0.4], [-4.0, -0.9], 0.36, 0.3, 2);
    bone(c, [7.5, -0.5], [9.5, -0.2], 0.36, 0.3, 1);
    flame(c, [-0.8, -0.6], 1.4, phase, { w: 0.7 });
    return;
  }
  const turn = (anim === Anim.Walk || anim === Anim.Run ? p.crew : 0) * (anim === Anim.Run ? 2 : 1);
  const axle = T([0.6, -13]);
  const armDeg = p.arm + p.tilt;
  const tip = along(axle, armDeg, 12.5 * (E > 1 ? 1.05 : 1));
  const cw = along(axle, armDeg + 180, 4.0);
  const frameSide = (off: P2, tone: number) => {
    const o = (q: P2): P2 => T(addP(q, off));
    c.rod(o([-7.6, -0.6]), o([7.6, -0.6]), 0.75, 0.75, UM.wood, { tone });
    // The uprights on a clean 2:1 slope (no jaggies on the long diagonals).
    c.rod(o([-6.5, -0.4]), o([0, -13.4]), 0.62, 0.5, UM.wood, { tone });
    c.rod(o([6.5, -0.4]), o([0, -13.4]), 0.62, 0.5, UM.wood, { tone });
    c.rod(o([-3.2, -5.6]), o([3.2, -5.6]), 0.42, 0.42, UM.wood, { tone: tone - 1 });
    // Lashings of sinew where the beams cross.
    c.blob(o([0, -13.1]), 0.5, 0.5, UM.rust, { tone: tone });
  };
  const farOff: P2 = depth, nearOff: P2 = [0, 0];
  // Far side: its frame, its wheels, the far crewman.
  wheel(c, T(addP([-6.2, -0.7], farOff)), 1.0, turn, 1);
  wheel(c, T(addP([6.2, -0.7], farOff)), 1.0, turn, 1);
  frameSide(farOff, 1);
  crewman(c, T(back ? [6.8, 0] : [-7.0, 0]), back, (p.crew + 0.5) % 1, p.lean, anim === Anim.Walk || anim === Anim.Run, 'bar');
  // The counterweight: a cage of rusted straps crammed with the dead, hung from the short arm.
  const cage = (cwAt: P2) => {
    const top = cwAt, w2 = 1.9, h = 3.2;
    const pts: P2[] = [addP(top, [-w2, 0.3]), addP(top, [w2, 0.3]), addP(top, [w2 * 0.85, h]), addP(top, [-w2 * 0.85, h])];
    c.shape(pts, (x, y) => {
      const lx = c.lx(x), ly = c.ly(y), L = c.L;
      if (ly % Math.max(2, Math.round(L * 1.0)) === 0 || lx % Math.max(3, Math.round(L * 1.2)) === 0) return code(UM.rust, ly < L ? 2 : 1);
      return c.tex(x, y, 331, 3) < 0.4 ? code(UM.bone, 1) : code(UM.flesh, 1);
    });
    skull(c, addP(top, [-0.7, 1.5]), -20, false);
    skull(c, addP(top, [0.8, 2.1]), 25, false);
    // A dead arm hanging out of the cage.
    c.rod(addP(top, [1.2, 2.6]), addP(top, [1.8, 4.2]), 0.4, 0.3, UM.flesh, { tone: 1 });
    c.line(top, addP(top, [-w2, 0.3]), code(UM.rust, 1));
    c.line(top, addP(top, [w2, 0.3]), code(UM.rust, 1));
  };
  cage(addP(cw, [0, 0.3]));
  // The throwing arm, the axle, and a team rag hanging from the frame's head.
  c.rod(cw, tip, 0.75, 0.42, UM.wood, { tone: 2, detail: (_x, _y, _u, v) => (Math.abs(v - 0.2) < 0.02 || Math.abs(v - 0.55) < 0.015 ? code(UM.rust, 2) : -1) });
  c.blob(axle, 0.55, 0.55, UM.iron, { tone: 2 });
  rag(c, T([-0.4, -12.6]), T([1.1, -12.7]), 4.6 * E, c.qn(p.sway * 0.4), UM.team, UM.teamDk, 333, { tear: 0.5 });
  // The sling and its burning load.
  const pouch = along(tip, (p.load > 0.5 && p.arm < -30 ? 0 : 180 + armDeg + p.sling) + 0, 3.4);
  c.line(tip, pouch, code(UM.bone, 2));
  if (p.load > 0.5) {
    c.blob(pouch, 0.95 * E, 0.85 * E, UM.bone, { tone: 1, detail: (x, y) => (c.tex(x, y, 335, 2) < 0.4 ? code(UM.glow, 2) : -1) });
    flame(c, addP(pouch, [0, -0.4]), 1.8 * E, phase, { w: 0.85 * E });
  }
  // Near side: frame, wheels, skulls nailed up, the near crewman with a mallet.
  frameSide(nearOff, 2);
  skull(c, T([-2.6, -8.4]), -20, false);
  skull(c, T([2.8, -8.2]), 20, false);
  wheel(c, T([-6.2, -0.7]), 1.05, turn, 2);
  wheel(c, T([6.2, -0.7]), 1.05, turn, 2);
  crewman(c, T(back ? [-6.8, 0.4] : [7.2, 0.4]), back, p.crew, p.lean, anim === Anim.Walk || anim === Anim.Run, 'mallet');
}

registerPaperKind<EnginePose>('undead', U.Artillery, { body: 'engine', keys: TREBUCHET_KEYS, draw: (c, p, facing, anim, frame) => lit(c, () => trebuchet(c, p, facing, anim, frame)) });
