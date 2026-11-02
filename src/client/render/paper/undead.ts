// The Hollow Host (undead) on paper. Owned by the undead faction agent; see README.md.
//
// First and template unit: the Grave Legionary (HeavyInfantry). A thin, grim skeleton in a rotted
// mail cape and a torn team tabard on a belt, a dented kettle hat, a notched rusty arming sword
// and a kite shield painted with a skull. References: Diablo II skeletons, Darkest Dungeon's Bone
// Soldier, Total War's Grave Guard (front); the Encyclopédie / Wellcome posterior skeleton plate,
// a posterior skeleton render and the LPC skeleton sheets (back). See
// docs/art-references/hd-sprites.md.

import { U } from '../../../game/units.ts';
import { Anim } from '../contract.ts';
import { addP, code, DEG, defineMaterial, hash, hslRamp, M, rot, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { along, FOOT0, limb, poser, settle, swing, type FootPose, type KeySet } from './rig.ts';

// ------------------------------------------------------------------ materials

/**
 * The Legionary's ramps: frozen on the first (HSL) ramp generator, so this figure stays as
 * approved. Low-key: yellowed brown-stained bone, rust, dull mail and iron.
 */
export const UM = {
  bone: defineMaterial('undead.bone', hslRamp(42, 0.28, 0.5, 18, 55)),
  rust: defineMaterial('undead.rust', hslRamp(20, 0.45, 0.3, 355, 35)),
  mail: defineMaterial('undead.mail', hslRamp(30, 0.1, 0.36, 15, 200, 0.9)),
  iron: defineMaterial('undead.iron', hslRamp(210, 0.08, 0.26, 25, 200, 0.9)),
  steel: defineMaterial('undead.steel', hslRamp(205, 0.08, 0.5, 30, 195)),
  team: defineMaterial('undead.team', (hue) => hslRamp(hue, 0.5, 0.34, (hue + 330) % 360, (hue + 30) % 360, 0.85)),
  teamDk: defineMaterial('undead.teamDk', (hue) => hslRamp(hue, 0.45, 0.22, (hue + 330) % 360, hue, 0.7)),
  rag: defineMaterial('undead.rag', hslRamp(25, 0.16, 0.2, 345, 40, 0.7)),
  wood: defineMaterial('undead.wood', hslRamp(28, 0.35, 0.28, 355, 40)),
  leather: defineMaterial('undead.leather', hslRamp(22, 0.35, 0.22, 355, 35)),
  ink: M.ink,
  glow: M.glow,
} as const;

// ------------------------------------------------------------------ poses

const pose = poser(FOOT0);

/** Key poses per animation, authored by hand (a pixel animator's keys), then eased between. */
export const LEGIONARY_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose({}), pose({ py: 0.12, torso: 10, nu: 20, fu: 14, head: -2, bl: 148 })],
    [Anim.Walk]: [
      pose({ nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1, nu: 6, fu: 22 }),
      pose({ nt: 4, ns: -30, ft: 2, fs: -4, py: -0.3, nu: 14, fu: 14 }),
      pose({ nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1, nu: 26, fu: 4 }),
      pose({ nt: 2, ns: -4, ft: 4, fs: -30, py: -0.3, nu: 14, fu: 14 }),
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

// ------------------------------------------------------------------ parts

/** A thin bone with knobbed ends: shaft, two condyles, a lit edge. */
function bone(c: Paper, a: P2, b: P2, w: number, knob: number, tone = 2): void {
  c.rod(a, b, w, w * 0.85, UM.bone, { tone, detail: (x, y, u, v) => (u > -0.3 && hash(x >> 1, y >> 1, 91) < 0.12 + v * 0.1 ? code(UM.bone, tone - 1) : -1) });
  // The joint: a knob with a dark seam where the bones meet.
  c.blob(b, knob, knob * 0.9, UM.bone, { tone: tone - 1, detail: (_x, _y, nx, ny) => (Math.abs(ny - nx * 0.3) < 0.14 ? code(UM.bone, 0) : -1) });
}

/** The rusted, dented kettle hat: a low iron crown with rust creeping up, a wide chewed brim. */
function helm(c: Paper, at: P2, ang: number): void {
  const crown = addP(at, rot([0.05, -0.7], ang * DEG));
  c.blob(crown, 0.95, 0.62, UM.iron, {
    detail: (x, y, nx, ny) => {
      if (ny > 0.15) return -2;
      if (Math.hypot(nx - 0.35, ny + 0.2) < 0.18) return code(UM.iron, 0);
      if (ny > -0.1 || hash(x >> 1, y >> 1, 7) < 0.25 + ny * 0.3) return code(UM.rust, ny > 0 ? 1 : 2);
      return -1;
    },
  });
  // Brim: a wide, thin, tilted ring, lit on its upper edge, chewed by rust.
  const brim = addP(at, rot([0.05, -0.62], ang * DEG));
  c.blob(brim, 1.55, 0.3, UM.rust, {
    detail: (x, _y, nx, ny) => {
      if (Math.abs(nx) < 0.62 && ny > -0.2) return -2;
      if (ny < -0.35) return code(UM.rust, 3);
      if (hash(x >> 1, 3, 9) < 0.18) return code(UM.iron, 1);
      return -1;
    },
  });
}

/** The skull: small, brow ridge, deep sockets with a cold point of light, cheekbones, teeth. */
function skull(c: Paper, at: P2, ang: number, hat: boolean): void {
  const r = 1.0;
  c.blob(at, r, r * 1.05, UM.bone, {
    detail: (_x, _y, nx, ny) => {
      // Rotated face frame: the skull looks forward-right in this facing.
      const [fx, fy] = rot([nx, ny], -ang * DEG);
      const ex = fx - 0.18;
      // Eye sockets: dark, a pale point of witchfire in the near one.
      for (const ox of [-0.32, 0.36]) {
        const d = Math.hypot(ex - ox, (fy - 0.02) * 1.25);
        if (d < 0.27) return d < 0.13 && ox > 0 ? code(UM.glow, 4) : code(UM.ink, 0);
      }
      // Nasal cavity.
      if (Math.abs(ex) < 0.09 && fy > 0.22 && fy < 0.44) return code(UM.ink, 1);
      // Brow ridge and cheekbone highlights, a stain under the eye.
      if (fy > -0.32 && fy < -0.2 && Math.abs(ex) < 0.6) return code(UM.bone, 3);
      if (fy > 0.24 && fy < 0.34 && ex > 0.3 && ex < 0.62) return code(UM.bone, 3);
      if (fy > 0.25 && fy < 0.45 && ex < -0.3 && ex > -0.6) return code(UM.bone, 1);
      return -1;
    },
  });
  // Jaw and teeth, slightly open.
  const jaw = addP(at, rot([0.15, 0.85], ang * DEG));
  c.blob(jaw, 0.55, 0.32, UM.bone, {
    tone: 1,
    detail: (x, _y, _nx, ny) => (ny < -0.1 ? ((x & 1) === 0 ? code(UM.bone, 3) : code(UM.ink, 1)) : -1),
  });
  if (hat) helm(c, at, ang);
}

/**
 * The skull from behind (back three-quarter): the round cranium with the lambdoid suture and a
 * crack, the occipital knob above the neck, and the near corner of the jaw just showing.
 */
function skullBack(c: Paper, at: P2, ang: number, hat: boolean): void {
  // The jaw's near corner, peeking out on the forward side below the cranium.
  c.blob(addP(at, rot([0.55, 0.7], ang * DEG)), 0.32, 0.28, UM.bone, { tone: 1 });
  c.blob(at, 1.0, 1.05, UM.bone, {
    detail: (x, y, nx, ny) => {
      const [fx, fy] = rot([nx, ny], -ang * DEG);
      // Lambdoid suture: a jagged dark seam across the back of the head.
      const seam = -0.05 + Math.abs(fx + 0.1) * 0.55 + (hash(x >> 1, 5, 13) - 0.5) * 0.12;
      if (Math.abs(fy - seam) < 0.07 && Math.abs(fx) < 0.75) return code(UM.bone, 0);
      // A crack running down from the crown on the near side.
      if (Math.abs(fx - 0.25 - fy * 0.2) < 0.05 && fy > -0.7 && fy < -0.15) return code(UM.ink, 1);
      // The occipital knob, lit on top, and its shadow over the neck.
      if (fy > 0.5 && Math.abs(fx + 0.05) < 0.4) return code(UM.bone, fy > 0.75 ? 0 : 1);
      // A brown stain on the far side.
      if (fx < -0.35 && fy > 0.0 && fy < 0.45 && hash(x >> 1, y >> 1, 17) < 0.6) return code(UM.bone, 1);
      return -1;
    },
  });
  if (hat) helm(c, at, ang);
}

/** Ribcage and spine, front three-quarter: rib bands curving round, with see-through gaps; a sternum. */
function ribcage(c: Paper, neck: P2, pelvis: P2, lean: number): void {
  const spineLen = Math.hypot(neck[0] - pelvis[0], neck[1] - pelvis[1]);
  // The spine: a column of vertebrae behind, each a small knob with a dark seam under it.
  for (let i = 0; i <= 7; i++) {
    const p: P2 = [pelvis[0] + ((neck[0] - pelvis[0]) * i) / 7 + 0.15, pelvis[1] + ((neck[1] - pelvis[1]) * i) / 7];
    c.blob(p, 0.3, 0.2, UM.bone, { tone: i % 2 ? 2 : 1 });
  }
  // The sternum, seen three-quarter: a little in front of the spine, toward the viewer.
  const st0: P2 = [neck[0] + 0.55, neck[1] + 0.75];
  const st1: P2 = [neck[0] + 0.7 + lean * 0.01, neck[1] + 2.5];
  // Ribs: four on each side, thin, curving from the spine round to the sternum, longest in the
  // middle; the gaps between them stay empty (the spine and what lies behind show through).
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    const y = neck[1] + 0.85 + k * spineLen * 0.5;
    const sp: P2 = [neck[0] + (pelvis[0] - neck[0]) * (0.15 + k * 0.5) + 0.15, y - 0.25];
    const stp: P2 = [st0[0] + (st1[0] - st0[0]) * k, st0[1] + (st1[1] - st0[1]) * k + 0.25];
    const reach = 1.25 + Math.sin(k * Math.PI * 0.9) * 0.45;
    for (const side of [-1, 1]) {
      // Near side (+1, toward the viewer) is lit and fully seen; the far side is shorter and darker.
      const outer: P2 = [sp[0] + side * reach * (side > 0 ? 1.0 : 0.75), sp[1] + 0.45];
      const tone = side > 0 ? 3 : 1;
      c.rod(sp, outer, 0.2, 0.18, UM.bone, { tone });
      c.rod(outer, [outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], 0.18, 0.16, UM.bone, { tone: tone - 1 });
      if (side > 0) c.rod([outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], stp, 0.16, 0.14, UM.bone, { tone: 2 });
    }
  }
  c.rod(st0, st1, 0.3, 0.22, UM.bone, { tone: 3 });
}

/**
 * The back, three-quarter: ribs arching out and down from the spine behind, the spine on top
 * with its spinous processes, and the two shoulder blades as pale plates with a ridge (the
 * scapular spine) and a dark lower edge.
 */
function backbone(c: Paper, neck: P2, pelvis: P2, shN: P2, shF: P2): void {
  const spineLen = Math.hypot(neck[0] - pelvis[0], neck[1] - pelvis[1]);
  const at = (k: number): P2 => [neck[0] + (pelvis[0] - neck[0]) * k + 0.1, neck[1] + (pelvis[1] - neck[1]) * k];
  // Ribs, behind the spine: five pairs, the near side (screen right) longer and lit.
  for (let i = 0; i < 5; i++) {
    const k = 0.12 + i * 0.12;
    const sp = at(k);
    const reach = 1.2 + Math.sin((i / 4) * Math.PI * 0.85) * 0.5;
    for (const side of [1, -1]) {
      const far = side < 0;
      const mid: P2 = [sp[0] + side * reach * (far ? 0.7 : 1.0), sp[1] + 0.3];
      const end: P2 = [mid[0] + side * 0.25, mid[1] + 0.75 + spineLen * 0.02];
      c.rod(sp, mid, 0.2, 0.18, UM.bone, { tone: far ? 1 : 2 });
      c.rod(mid, end, 0.18, 0.15, UM.bone, { tone: far ? 0 : 1 });
    }
  }
  // The spine: a knobbed column, each vertebra with a dark seam below and a lit process.
  for (let i = 0; i <= 8; i++) {
    const p = at(i / 8);
    c.blob(p, 0.32, 0.22, UM.bone, { tone: i % 2 ? 3 : 2, detail: (_x, _y, _nx, ny) => (ny > 0.55 ? code(UM.bone, 0) : -1) });
  }
  // Shoulder blades: a triangle hanging from each shoulder toward the spine.
  for (const [sh, far] of [[shF, true], [shN, false]] as [P2, boolean][]) {
    const inner = far ? 0.55 : -0.55;
    const tri: P2[] = [addP(sh, [inner * 0.4, 0.05]), addP(sh, [inner * 1.9, 0.25]), addP(sh, [inner * 1.15, 2.0])];
    const tone = far ? 1 : 3;
    c.shape(tri, (x, y) => {
      const top = c.sy(sh[1] + 0.55);
      if (Math.abs(y - top) < Math.max(1, c.L * 0.18)) return code(UM.bone, tone + 1); // the scapular spine
      if (y > c.sy(sh[1] + 1.6)) return code(UM.bone, tone - 1);
      return code(UM.bone, hash(x >> 1, y >> 1, 23) < 0.12 ? tone - 1 : tone);
    });
  }
}

/** Rotted mail hanging off the shoulders: ring pattern in the lit plane, holes, a torn hem. */
function mailShirt(c: Paper, neck: P2, back: boolean): void {
  // From behind the cape hangs lower and wider across the shoulder blades.
  const shape: P2[] = back
    ? [[-1.7, 0.1], [1.8, 0.2], [1.6, 1.6], [0.9, 2.3], [0.1, 1.9], [-0.9, 2.4], [-1.9, 1.5]]
    : [[-1.6, 0.2], [1.7, 0.1], [2.1, 1.5], [1.3, 2.4], [0.2, 2.0], [-0.8, 2.5], [-1.4, 1.6]];
  const pts: P2[] = shape.map(([x, y]) => [c.sx(neck[0] + x), c.sy(neck[1] + y)]);
  const hem = c.sy(neck[1] + 2.4);
  const L = c.L;
  c.poly(pts, (x, y) => {
    // Rotted through: irregular holes (ribs show beneath) and a ragged lower edge.
    const hy = hem - y;
    if (hash(x >> 2, y >> 2, back ? 37 : 31) < 0.2) return -1;
    if (hy < L * 1.4 && hash(x >> 1, 0, 33) < 0.5 - hy / (L * 3)) return -1;
    // Rings: a dark line every third row, an offset checker of light toward the lit (left) side.
    const lit = x < c.sx(neck[0]);
    if (y % 3 === 0) return code(UM.mail, 0);
    if ((x + ((y / 3) | 0)) % 2 === 0) return code(UM.mail, lit ? 3 : 2);
    return code(UM.mail, lit ? 2 : 1);
  });
}

/**
 * The tabard: a strip of team cloth from chest to thighs, torn into tongues at the hem. `x0..x1`
 * place the panel across the waist: the front panel toward the forward side in the front view,
 * the back panel toward the viewer in the back view.
 */
function tabard(c: Paper, waist: P2, sway: number, back: boolean): void {
  const [a0, a1] = back ? [-0.75, 0.35] : [0.4, 1.4];
  const x0 = waist[0] + (back ? -0.7 : 0.45), x1 = waist[0] + (back ? 0.3 : 1.35);
  const top = waist[1] - 0.3, bot = waist[1] + 3.4;
  const L = c.L;
  const pts: P2[] = [
    [c.sx(waist[0] + a0), c.sy(top)],
    [c.sx(waist[0] + a1), c.sy(top)],
    [c.sx(x1 + sway), c.sy(bot)],
    [c.sx(x0 + sway), c.sy(bot)],
  ];
  c.poly(pts, (x, y) => {
    const fromBot = c.sy(bot) - y;
    const col = Math.floor((x - c.sx(x0)) / Math.max(2, L * 0.45));
    if (fromBot < L * 1.6 && hash(col, 1, back ? 57 : 51) * L * 1.6 > fromBot) return -1;
    // Two folds: darker channels with a lit ridge beside each; the underside shows at the hem.
    const rel = (x - c.sx(waist[0] + a0)) / Math.max(1, c.sx(waist[0] + a1) - c.sx(waist[0] + a0));
    const fold = rel + (fromBot / Math.max(1, c.sy(bot) - c.sy(top))) * 0.12;
    if (Math.abs(fold - 0.35) < 0.07 || Math.abs(fold - 0.7) < 0.06) return code(UM.team, 1);
    if (Math.abs(fold - 0.25) < 0.05 || Math.abs(fold - 0.6) < 0.05) return code(UM.team, 3);
    if (fromBot < L * 0.6) return code(UM.teamDk, 1);
    if (rel > 0.82) return code(UM.teamDk, 2);
    // Stains toward the hem.
    if (fromBot < L * 3 && hash(x >> 1, y >> 1, 53) < 0.18) return code(UM.teamDk, 1);
    return code(UM.team, 2);
  });
}

/** A rusted, notched arming sword: blade with a lit edge, chips out of it, a cross-guard, a pommel. */
function sword(c: Paper, grip: P2, deg: number): void {
  const tip = along(grip, deg + 180, 5.6);
  const g0 = along(grip, deg + 180, 0.5);
  c.rod(g0, tip, 0.42, 0.18, UM.steel, {
    shine: true,
    detail: (x, y, u, v) => {
      if (v > 0.25 && v < 0.9 && hash(Math.round(v * 14), 0, 61) < 0.25 && u > 0.35) return -1; // chips
      if (hash(x >> 1, y >> 1, 63) < 0.16 && v > 0.1) return code(UM.rust, 2); // pitting
      return -1;
    },
  });
  const side: P2 = [limb(deg + 90)[0] * 0.75, limb(deg + 90)[1] * 0.75];
  c.rod(addP(g0, side), addP(g0, [-side[0], -side[1]]), 0.26, 0.26, UM.iron, { tone: 2 });
  c.rod(grip, along(grip, deg, 0.8), 0.26, 0.24, UM.leather, { tone: 2 });
  c.blob(along(grip, deg, 1.0), 0.26, 0.26, UM.iron, { shine: true });
}

const KITE: P2[] = [[-1.55, -2.3], [1.55, -2.3], [1.45, -0.3], [0, 2.9], [-1.45, -0.3]];

/** The kite shield, seen three-quarter: team field, a painted skull, a rusted rim, rivets, scars. */
function shield(c: Paper, at: P2, tilt: number): void {
  const pts: P2[] = KITE.map((p) => addP(at, rot([p[0] * 0.82, p[1]], tilt * DEG)));
  const L = c.L;
  const cx = c.sx(at[0]), cy = c.sy(at[1]);
  c.poly(pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y) => {
    const [lx, ly] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -tilt * DEG);
    const lx2 = lx / 0.82;
    const half = ly < -0.3 ? 1.55 : 1.45 * (1 - (ly + 0.3) / 3.2);
    const edge = half - Math.abs(lx2);
    // Rusted iron rim.
    if (edge < 0.32 || ly < -2.0) return code(UM.rust, edge < 0.14 || ly < -2.15 ? 1 : 2);
    // Rivets along the rim.
    if (edge < 0.52 && Math.abs(((ly + 3) * 1.6) % 1 - 0.5) < 0.14 && edge > 0.38) return code(UM.steel, 3);
    // The painted skull.
    const sd = Math.hypot(lx2 * 1.1, (ly + 0.55) * 1.0);
    if (sd < 0.62) {
      if (Math.hypot(Math.abs(lx2) - 0.24, ly + 0.6) < 0.15) return code(UM.ink, 1);
      if (ly > -0.2 && Math.abs(lx2) < 0.3 && ((x & 1) === 0)) return code(UM.ink, 2);
      return code(UM.bone, lx2 < 0 ? 3 : 2);
    }
    // Scars and chipped paint.
    if (hash(x >> 1, y >> 2, 71) < 0.07) return code(UM.wood, 1);
    // Field: the lit left half a step brighter (the shield faces the light obliquely).
    return lx2 < -0.4 ? code(UM.team, 3) : lx2 > 0.6 ? code(UM.team, 1) : code(UM.team, 2);
  });
}

/** The kite shield from behind: dark wood boards, the rusted rim, the leather arm straps (enarmes). */
function shieldBack(c: Paper, at: P2, tilt: number): void {
  const pts: P2[] = KITE.map((p) => addP(at, rot([p[0] * 0.7, p[1]], tilt * DEG)));
  const L = c.L;
  const cx = c.sx(at[0]), cy = c.sy(at[1]);
  c.poly(pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y) => {
    const [lx, ly] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -tilt * DEG);
    const lx2 = lx / 0.7;
    const half = ly < -0.3 ? 1.55 : 1.45 * (1 - (ly + 0.3) / 3.2);
    const edge = half - Math.abs(lx2);
    if (edge < 0.26 || ly < -2.05) return code(UM.rust, edge < 0.12 ? 0 : 1);
    // Two leather straps across the boards, with an iron buckle.
    if (Math.abs(ly + 1.1) < 0.2 || Math.abs(ly - 0.3) < 0.2) return Math.abs(lx2 - 0.2) < 0.18 ? code(UM.iron, 2) : code(UM.leather, Math.abs(ly + 1.1) < 0.08 || Math.abs(ly - 0.3) < 0.08 ? 2 : 1);
    // Boards: vertical planks with dark joins, in shadow (the face is turned away from the light).
    const plank = (lx2 + 3) * 1.3;
    if (Math.abs((plank % 1) - 0.5) > 0.42) return code(UM.wood, 0);
    return code(UM.wood, hash(Math.floor(plank), y >> 2, 75) < 0.2 ? 0 : 1);
  });
}

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
  const pel: P2 = T([p.px, -6.5 + p.py]);
  const tor = p.torso + tilt;
  const neck = addP(pel, [limb(tor + 180)[0] * 4.9, limb(tor + 180)[1] * 4.9]);
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
    c.rod(addP(pel, [-0.9, -0.35]), addP(pel, [1.5, -0.45]), 0.42, 0.42, UM.leather, { tone: 2, detail: (x, _y, _u, v) => (Math.abs(v - 0.7) < 0.08 ? code(UM.iron, 3) : (x & 3) === 0 && v < 0.6 ? code(UM.leather, 1) : -1) });
  const pauldron = () => {
    // A dented rust-iron plate over the near shoulder, two rivets, a lit rim.
    for (const [dy, r] of [[0.15, 0.75], [0.55, 0.62]] as [number, number][]) {
      c.blob(addP(shN, [0.05, dy]), r, 0.42, UM.iron, {
        detail: (x, y, nx, ny) => {
          // Rust spreads from the lower edge up; a pale lit rim along the top; two rivets.
          if (ny < -0.6) return code(UM.steel, 3);
          if (Math.abs(ny) < 0.25 && (Math.abs(nx + 0.5) < 0.12 || Math.abs(nx - 0.45) < 0.12)) return code(UM.steel, 4);
          if (ny > 0.55) return code(UM.rust, 0);
          if (hash(x >> 1, y >> 1, 81) < 0.15 + (ny + 1) * 0.3) return code(UM.rust, ny > 0.2 ? 1 : 2);
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
    tabard(c, pel, Math.sin(tor * DEG) * 0.3 + p.sway, true);
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
  tabard(c, pel, Math.sin(tor * DEG) * 0.3 + p.sway, false);
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
