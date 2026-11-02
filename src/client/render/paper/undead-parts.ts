// The Hollow Host (undead) on paper: materials and the parts every undead figure shares (bones,
// skulls, ribcages, rags, weapons, shields, the skeletal horse). Owned by the undead faction
// agent; see README.md. The figures themselves are in undead.ts.

import { addP, code, DEG, defineMaterial, hash, hslRamp, isKept, oklchRamp, rot, type P2, type Paper } from './core.ts';
import { along, limb, snapDeg } from './rig.ts';

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
  // New kinds (OKLCH): corpse-grey ghoul skin, a bluish dead grey (the Crypt Ghoul's pallor),
  // apart from the yellowed bone; and the grave shroud of wraiths, riders and the lich, a
  // purple-black that reads darker than the brown rag.
  flesh: defineMaterial('undead.flesh', oklchRamp({ l: 0.42, c: 0.03, h: 290, spread: 0.085 })),
  // Charred, grave-blackened bone: the skeletal horses and the colossus' limbs. Dark on the
  // field, so the pale skulls and ribs and the green fire stand out from it.
  char: defineMaterial('undead.char', oklchRamp({ l: 0.36, c: 0.03, h: 55, spread: 0.075 })),
  shroud: defineMaterial('undead.shroud', oklchRamp({ l: 0.27, c: 0.03, h: 305, spread: 0.065 })),
  // Ink and witchfire as the faction's own materials, registered last: the core merges the dark
  // outline colours down to the level's budget keeping the earliest materials, and with the
  // shared ink and glow (registered first) a level-1 figure was outlined in glow-green. Last,
  // the outlines are the bone's and the rust's warm darks. The glow's deepest tone is a dark
  // green-black (it is barely painted; it only seeds the glow's outline).
  ink: defineMaterial('undead.ink', [[24, 12, 16], [32, 17, 21], [40, 23, 26], [49, 30, 32], [60, 39, 39]], { keep: true }),
  glow: defineMaterial('undead.glow', [[22, 34, 28], [70, 140, 80], [110, 200, 110], [160, 235, 150], [215, 255, 200]], { keep: true }),
} as const;

// ------------------------------------------------------------------ parts

/**
 * The material the skeleton parts (bone, ribcage, backbone, limbs, pelvis) are drawn in: the
 * pale bone, or the charred bone with `withBone`. Skulls stay pale.
 */
const BONE = { m: UM.bone as number };
/** The skeleton material in force (see `withBone`). */
export const boneMat = (): number => BONE.m;

export function withBone(m: number, draw: () => void): void {
  const was = BONE.m;
  BONE.m = m;
  try {
    draw();
  } finally {
    BONE.m = was;
  }
}

/** A thin bone with knobbed ends: shaft, two condyles, a lit edge. */
export function bone(c: Paper, a: P2, b: P2, w: number, knob: number, tone = 2, knobTone = tone - 1): void {
  c.rod(a, b, w, w * 0.85, BONE.m, { tone, detail: (x, y, u, v) => (u > -0.3 && c.tex(x, y, 91) < 0.12 + v * 0.1 ? code(BONE.m, tone - 1) : -1) });
  // The joint: a knob with a dark seam where the bones meet.
  c.blob(b, knob, knob * 0.9, BONE.m, { tone: knobTone, detail: (_x, _y, nx, ny) => (Math.abs(ny - nx * 0.3) < 0.14 ? code(BONE.m, 0) : -1) });
}

/** The rusted, dented kettle hat: a low iron crown with rust creeping up, a wide chewed brim. */
export function helm(c: Paper, at: P2, ang: number): void {
  ang = snapDeg(ang);
  const crown = addP(at, rot([0.05, -0.7], ang * DEG));
  c.blob(crown, 0.95, 0.62, UM.iron, {
    detail: (x, y, nx, ny) => {
      if (ny > 0.15) return -2;
      if (Math.hypot(nx - 0.35, ny + 0.2) < 0.18) return code(UM.iron, 0);
      if (ny > -0.1 || c.tex(x, y, 7) < 0.25 + ny * 0.3) return code(UM.rust, ny > 0 ? 1 : 2);
      return -1;
    },
  });
  // Brim: a wide, thin, tilted ring, lit on its upper edge, chewed by rust.
  const brim = addP(at, rot([0.05, -0.62], ang * DEG));
  c.blob(brim, 1.55, 0.3, UM.rust, {
    detail: (x, _y, nx, ny) => {
      if (Math.abs(nx) < 0.62 && ny > -0.2) return -2;
      if (ny < -0.35) return code(UM.rust, 3);
      if (hash(c.lx(x) >> 1, 3, 9) < 0.18) return code(UM.iron, 1);
      return -1;
    },
  });
}

/** The skull: small, brow ridge, deep sockets with a cold point of light, cheekbones, teeth. */
export function skull(c: Paper, at: P2, ang: number, hat: boolean): void {
  ang = snapDeg(ang);
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
    // Teeth of uneven length (staggered ends, not a row of equal stripes).
    detail: (x, _y, _nx, ny) => (ny < -0.1 - hash(c.lx(x) >> 1, 2, 19) * 0.35 ? ((c.lx(x) & 1) === 0 ? code(UM.bone, 3) : code(UM.ink, 1)) : -1),
  });
  if (hat) helm(c, at, ang);
}

/**
 * The skull from behind (back three-quarter): the round cranium with the lambdoid suture and a
 * crack, the occipital knob above the neck, and the near corner of the jaw just showing.
 */
export function skullBack(c: Paper, at: P2, ang: number, hat: boolean): void {
  ang = snapDeg(ang);
  // The jaw's near corner, peeking out on the forward side below the cranium.
  c.blob(addP(at, rot([0.55, 0.7], ang * DEG)), 0.32, 0.28, UM.bone, { tone: 1 });
  c.blob(at, 1.0, 1.05, UM.bone, {
    detail: (x, y, nx, ny) => {
      const [fx, fy] = rot([nx, ny], -ang * DEG);
      // Lambdoid suture: a jagged dark seam across the back of the head.
      const seam = -0.05 + Math.abs(fx + 0.1) * 0.55 + (hash(c.lx(x) >> 1, 5, 13) - 0.5) * 0.12;
      if (Math.abs(fy - seam) < 0.07 && Math.abs(fx) < 0.75) return code(UM.bone, 0);
      // A crack running down from the crown on the near side.
      if (Math.abs(fx - 0.25 - fy * 0.2) < 0.05 && fy > -0.7 && fy < -0.15) return code(UM.ink, 1);
      // The occipital knob, lit on top, and its shadow over the neck.
      if (fy > 0.5 && Math.abs(fx + 0.05) < 0.4) return code(UM.bone, fy > 0.75 ? 0 : 1);
      // A brown stain on the far side.
      if (fx < -0.35 && fy > 0.0 && fy < 0.45 && c.tex(x, y, 17) < 0.6) return code(UM.bone, 1);
      return -1;
    },
  });
  if (hat) helm(c, at, ang);
}

/** Ribcage and spine, front three-quarter: rib bands curving round, with see-through gaps; a sternum. */
export function ribcage(c: Paper, neck: P2, pelvis: P2, lean: number): void {
  const spineLen = Math.hypot(neck[0] - pelvis[0], neck[1] - pelvis[1]);
  // The spine: a column of vertebrae behind, each a small knob with a dark seam under it.
  for (let i = 0; i <= 7; i++) {
    const p: P2 = [pelvis[0] + ((neck[0] - pelvis[0]) * i) / 7 + 0.15, pelvis[1] + ((neck[1] - pelvis[1]) * i) / 7];
    c.blob(p, 0.3, 0.2, BONE.m, { tone: i % 2 ? 2 : 1 });
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
      c.rod(sp, outer, 0.2, 0.18, BONE.m, { tone });
      c.rod(outer, [outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], 0.18, 0.16, BONE.m, { tone: tone - 1 });
      if (side > 0) c.rod([outer[0] + (stp[0] - outer[0]) * 0.55, outer[1] + 0.5], stp, 0.16, 0.14, BONE.m, { tone: 2 });
    }
  }
  c.rod(st0, st1, 0.3, 0.22, BONE.m, { tone: 3 });
}

/**
 * The back, three-quarter: ribs arching out and down from the spine behind, the spine on top
 * with its spinous processes, and the two shoulder blades as pale plates with a ridge (the
 * scapular spine) and a dark lower edge.
 */
export function backbone(c: Paper, neck: P2, pelvis: P2, shN: P2, shF: P2): void {
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
      c.rod(sp, mid, 0.2, 0.18, BONE.m, { tone: far ? 1 : 2 });
      c.rod(mid, end, 0.18, 0.15, BONE.m, { tone: far ? 0 : 1 });
    }
  }
  // The spine: a knobbed column, each vertebra with a dark seam below and a lit process.
  for (let i = 0; i <= 8; i++) {
    const p = at(i / 8);
    c.blob(p, 0.32, 0.22, BONE.m, { tone: i % 2 ? 3 : 2, detail: (_x, _y, _nx, ny) => (ny > 0.55 ? code(BONE.m, 0) : -1) });
  }
  // Shoulder blades: a triangle hanging from each shoulder toward the spine.
  for (const [sh, far] of [[shF, true], [shN, false]] as [P2, boolean][]) {
    const inner = far ? 0.55 : -0.55;
    const tri: P2[] = [addP(sh, [inner * 0.4, 0.05]), addP(sh, [inner * 1.9, 0.25]), addP(sh, [inner * 1.15, 2.0])];
    const tone = far ? 1 : 3;
    c.shape(tri, (x, y) => {
      const top = c.sy(sh[1] + 0.55);
      if (Math.abs(y - top) < Math.max(1, c.L * 0.18)) return code(BONE.m, tone + 1); // the scapular spine
      if (y > c.sy(sh[1] + 1.6)) return code(BONE.m, tone - 1);
      return code(BONE.m, c.tex(x, y, 23) < 0.12 ? tone - 1 : tone);
    });
  }
}

/** Rotted mail hanging off the shoulders: ring pattern in the lit plane, holes, a torn hem. */
export function mailShirt(c: Paper, neck: P2, back: boolean): void {
  // From behind it is a short mantle over the shoulders: the spine and the shoulder blades,
  // which carry the back view, show below it.
  const shape: P2[] = back
    ? [[-1.4, 0.15], [1.8, 0.25], [1.7, 0.95], [1.0, 1.35], [0.3, 1.05], [-0.5, 1.4], [-1.3, 0.95]]
    : [[-1.6, 0.2], [1.7, 0.1], [2.1, 1.5], [1.3, 2.4], [0.2, 2.0], [-0.8, 2.5], [-1.4, 1.6]];
  const pts: P2[] = shape.map(([x, y]) => [c.sx(neck[0] + x), c.sy(neck[1] + y)]);
  const hem = c.sy(neck[1] + (back ? 1.4 : 2.4));
  const L = c.L;
  c.poly(pts, (x, y) => {
    // Rotted through: irregular holes (ribs show beneath) and a ragged lower edge.
    const hy = hem - y;
    if (c.tex(x, y, back ? 37 : 31, 4) < 0.2) return -1;
    if (hy < L * 1.4 && hash(c.lx(x) >> 1, 0, 33) < 0.5 - hy / (L * 3)) return -1;
    // Rings: a dark line every third row, an offset checker of light toward the lit (left) side.
    const lit = x < c.sx(neck[0]);
    if (c.ly(y) % 3 === 0) return code(UM.mail, 0);
    if ((c.lx(x) + ((c.ly(y) / 3) | 0)) % 2 === 0) return code(UM.mail, lit ? 3 : 2);
    return code(UM.mail, lit ? 2 : 1);
  });
}

/**
 * The tabard: a strip of team cloth from chest to thighs, torn into tongues at the hem. `x0..x1`
 * place the panel across the waist: the front panel toward the forward side in the front view,
 * the back panel toward the viewer in the back view.
 */
export function tabard(c: Paper, waist: P2, sway: number, back: boolean): void {
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
    if (fromBot < L * 3 && c.tex(x, y, 53) < 0.18) return code(UM.teamDk, 1);
    return code(UM.team, 2);
  });
}

/** A rusted, notched arming sword: blade with a lit edge, chips out of it, a cross-guard, a pommel. */
export function sword(c: Paper, grip: P2, deg: number): void {
  const tip = along(grip, deg + 180, 5.6);
  const g0 = along(grip, deg + 180, 0.5);
  c.rod(g0, tip, 0.42, 0.18, UM.steel, {
    shine: true,
    detail: (x, y, u, v) => {
      if (v > 0.25 && v < 0.9 && hash(Math.round(v * 14), 0, 61) < 0.25 && u > 0.35) return -1; // chips
      if (c.tex(x, y, 63) < 0.16 && v > 0.1) return code(UM.rust, 2); // pitting
      return -1;
    },
  });
  const side: P2 = [limb(deg + 90)[0] * 0.75, limb(deg + 90)[1] * 0.75];
  c.rod(addP(g0, side), addP(g0, [-side[0], -side[1]]), 0.26, 0.26, UM.iron, { tone: 2 });
  c.rod(grip, along(grip, deg, 0.8), 0.26, 0.24, UM.leather, { tone: 2 });
  c.blob(along(grip, deg, 1.0), 0.26, 0.26, UM.iron, { shine: true });
}

export const KITE: P2[] = [[-1.55, -2.3], [1.55, -2.3], [1.45, -0.3], [0, 2.9], [-1.45, -0.3]];

/** The kite shield, seen three-quarter: team field, a painted skull, a rusted rim, rivets, scars. */
export function shield(c: Paper, at: P2, tilt: number): void {
  tilt = snapDeg(tilt);
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
      if (ly > -0.2 && Math.abs(lx2) < 0.3 && ((c.lx(x) & 1) === 0)) return code(UM.ink, 2);
      return code(UM.bone, lx2 < 0 ? 3 : 2);
    }
    // Scars and chipped paint.
    if (hash(c.lx(x) >> 1, c.ly(y) >> 2, 71) < 0.07) return code(UM.wood, 1);
    // Field: the lit left half a step brighter (the shield faces the light obliquely).
    return lx2 < -0.4 ? code(UM.team, 3) : lx2 > 0.6 ? code(UM.team, 1) : code(UM.team, 2);
  });
}

/** The kite shield from behind: dark wood boards, the rusted rim, the leather arm straps (enarmes). */
export function shieldBack(c: Paper, at: P2, tilt: number): void {
  tilt = snapDeg(tilt);
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
    return code(UM.wood, hash(Math.floor(plank), c.ly(y) >> 2, 75) < 0.2 ? 0 : 1);
  });
}


// ------------------------------------------------------------------ a posed skeleton (any kind on foot)

/** Scales a point. */
export const mul = (p: P2, k: number): P2 => [p[0] * k, p[1] * k];

/**
 * The anchors of a figure on two legs, as the Legionary places them: the pelvis (snapped), the
 * neck, the shoulders and the hips, the weapon side toward the viewer in both views.
 */
export interface Frame {
  back: boolean;
  tilt: number;
  T: (q: P2) => P2;
  pel: P2;
  tor: number;
  neck: P2;
  shN: P2;
  shF: P2;
  hipN: P2;
  hipF: P2;
  /** Size factor (1 = a man). */
  k: number;
}

export interface FramePose {
  px: number;
  py: number;
  tilt: number;
  torso: number;
}

export function frameOf(c: Paper, p: FramePose, back: boolean, o: { pelY?: number; spine?: number; k?: number; origin?: P2 } = {}): Frame {
  const k = o.k ?? 1;
  const tilt = p.tilt;
  const T = (q: P2): P2 => rot(q, tilt * DEG);
  const org = o.origin ?? [0, 0];
  const pel: P2 = c.q(addP(org, T([p.px, (o.pelY ?? -6.5 * k) + p.py])));
  const tor = p.torso + tilt;
  const spine = o.spine ?? 4.9 * k;
  const neck = c.q(addP(pel, mul(limb(tor + 180), spine)));
  const shN = addP(neck, T(mul(back ? [1.4, 0.6] : [-0.35, 0.6], k)));
  const shF = addP(neck, T(mul(back ? [-0.6, 0.35] : [1.65, 0.35], k)));
  const hipN = addP(pel, T(mul(back ? [0.95, 0.2] : [-0.25, 0.2], k)));
  const hipF = addP(pel, T(mul(back ? [-0.25, 0.05] : [0.95, 0.05], k)));
  return { back, tilt, T, pel, tor, neck, shN, shF, hipN, hipF, k };
}

/** A skeleton leg: femur with knobbed knee, tibia and fibula, a splay of foot bones. Returns the ankle. */
export function skelLeg(c: Paper, F: Frame, hip: P2, th: number, sh: number, far: boolean, o: { len?: number; w?: number; foot?: boolean } = {}): P2 {
  const len = (o.len ?? 1) * F.k, w = (o.w ?? 1) * F.k;
  const knee = along(hip, th + F.tilt, 3.25 * len);
  const ank = along(knee, th + sh + F.tilt, 3.1 * len);
  const tone = far ? 1 : 2;
  bone(c, hip, knee, 0.42 * w, 0.36 * w, tone, tone);
  c.rod(knee, ank, 0.34 * w, 0.28 * w, BONE.m, { tone });
  c.rod(addP(knee, [0.3 * w, 0.1]), addP(ank, [0.25 * w, -0.1]), 0.16 * w, 0.14 * w, BONE.m, { tone: tone - 1 });
  if (o.foot !== false) c.rod(ank, addP(ank, rot([0.95 * w, 0.2], F.tilt * DEG)), 0.34 * w, 0.2 * w, BONE.m, { tone });
  return ank;
}

/** A skeleton arm: humerus with knobbed elbow, radius and ulna, a bony fist. Returns the hand. */
export function skelArm(c: Paper, F: Frame, sh: P2, ua: number, la: number, far: boolean, o: { len?: number; w?: number; fist?: boolean } = {}): P2 {
  const len = (o.len ?? 1) * F.k, w = (o.w ?? 1) * F.k;
  const elbow = along(sh, ua + F.tilt, 2.45 * len);
  const hand = along(elbow, ua + la + F.tilt, 2.3 * len);
  const tone = far ? 1 : 2;
  bone(c, sh, elbow, 0.36 * w, 0.3 * w, tone);
  c.rod(elbow, hand, 0.28 * w, 0.24 * w, BONE.m, { tone });
  c.rod(addP(elbow, [0.12, 0.12]), addP(hand, [0.1, 0.05]), 0.14 * w, 0.12 * w, BONE.m, { tone: tone - 1 });
  if (o.fist !== false) c.blob(hand, 0.34 * w, 0.3 * w, BONE.m, { tone: tone - 1 });
  return hand;
}

/** Where a hand would be, without drawing the arm. */
export const handAt = (F: Frame, sh: P2, ua: number, la: number, len = 1): P2 => along(along(sh, ua + F.tilt, 2.45 * len * F.k), ua + la + F.tilt, 2.3 * len * F.k);

/** The pelvis: a bowl with hip wings (front), or the iliac wings and sacrum (back). */
export function pelvis(c: Paper, F: Frame, tone = 2): void {
  if (F.back) c.blob(addP(F.pel, [0.35 * F.k, 0.1]), 1.2 * F.k, 0.62 * F.k, BONE.m, { tone, detail: (_x, _y, nx, ny) => (Math.abs(nx + 0.05) < 0.16 && ny > -0.4 ? code(BONE.m, ny > 0.3 ? 0 : 1) : -1) });
  else c.blob(addP(F.pel, [0.15 * F.k, 0.1]), 1.15 * F.k, 0.6 * F.k, BONE.m, { tone });
}

/** The neck vertebrae and the skull (front or back), with or without the kettle hat. Returns the skull centre. */
export function head(c: Paper, F: Frame, ang: number, hat: boolean): P2 {
  c.rod(F.neck, addP(F.neck, F.T([0.15, -0.55])), 0.36, 0.3, UM.bone, { tone: F.back ? 2 : 1 });
  const at = addP(F.neck, F.T([0.3, -1.05]));
  if (F.back) skullBack(c, at, ang + F.tilt, hat);
  else skull(c, at, ang + F.tilt, hat);
  return at;
}

// ------------------------------------------------------------------ cloth

/**
 * A hanging strip of cloth from a (lit, screen-left) to b along its top edge, `len` units long,
 * swung by `sway`: two folds with a lit ridge, the far edge in shade, stains near the hem, and
 * the hem torn into tongues of uneven length.
 */
export function rag(c: Paper, a: P2, b: P2, len: number, sway: number, m: number, dk: number, seed: number, o: { tear?: number; folds?: boolean; spread?: number; tone?: number; flat?: boolean } = {}): void {
  const L = c.L;
  const tear = o.tear ?? 0.45;
  const spread = o.spread ?? 0;
  const base = o.tone ?? 2;
  const bl: P2 = [a[0] + sway - spread, a[1] + len], br: P2 = [b[0] + sway + spread, b[1] + len];
  const pts: P2[] = [a, b, br, bl].map((p) => [c.sx(p[0]), c.sy(p[1])] as P2);
  const y0 = Math.min(pts[0]![1], pts[1]![1]), y1 = Math.max(pts[2]![1], pts[3]![1]);
  const xa = Math.min(pts[0]![0], pts[3]![0]), xb = Math.max(pts[1]![0], pts[2]![0]);
  c.poly(pts, (x, y) => {
    const fromBot = y1 - y;
    // Torn into pointed tongues: each tongue's sides are shorter than its middle, so the
    // columns of a tongue end on different rows.
    const tw = Math.max(3, Math.round(L * 0.8));
    const col = Math.floor(c.lx(x) / tw);
    const off = Math.abs(((c.lx(x) % tw) + 0.5) / tw * 2 - 1);
    if (fromBot < L * len * tear + L && hash(col, 1, seed) * L * len * tear + off * L * 0.8 > fromBot) return -1;
    const rel = (x - xa) / Math.max(1, xb - xa);
    const fold = rel + ((y - y0) / Math.max(1, y1 - y0)) * 0.15 * Math.sign(sway || 1);
    if (o.folds !== false && L >= 2) {
      if (Math.abs(fold - 0.42) < 0.07) return code(m, base - 1);
      if (Math.abs(fold - 0.32) < 0.05) return code(m, base + 1);
    }
    // Planar light across the whole strip: lit toward the top-left, in shade toward the
    // bottom-right (one large plane per part, not a rim), stains in the lower shade.
    const lt = planeLight(rel * 2 - 1, ((y - y0) / Math.max(1, y1 - y0)) * 2 - 1);
    if (lt > 0 && !o.flat) return code(m, base + litStep(c));
    if (lt < 0 || (fromBot < L * 2.4 && c.tex(x, y, seed + 3) < 0.16)) return dk === m ? code(m, base - 1) : code(dk, base);
    return code(m, base);
  });
}

/**
 * Planar light on a part, from its position across (-1 left .. 1 right) and down (-1 top .. 1
 * bottom): 1 in the plane facing the key light (top-left), -1 in the plane turned away, else 0.
 * Large cloth and plate shapes take one band per plane, so each part's light reads from the
 * top-left however it is cut (the lint measures each region's luminance centroid).
 */
/** How far up a lit plane goes: one tone, two at level 1 (which merges tones 2 and 3). */
export const litStep = (c: Paper): number => (c.L <= 1 ? 2 : 1);

export function planeLight(rx: number, ry: number, k = 0.42): number {
  const s = -(rx * 0.62 + ry * 0.78);
  return s > k ? 1 : s < -k ? -1 : 0;
}

/**
 * A long robe or shroud from the shoulders to the hem: a trapezoid that widens toward the
 * ground, torn into long tongues, lit down its left side, a dark fold channel, the far side in
 * shade. `wisp` makes the hem a ragged taper (a wraith, no feet).
 */
export function robe(c: Paper, top: P2, w0: number, w1: number, len: number, sway: number, m: number, seed: number, o: { wisp?: boolean; back?: boolean } = {}): void {
  const L = c.L;
  const a: P2 = [top[0] - w0 / 2, top[1]], b: P2 = [top[0] + w0 / 2, top[1]];
  const br: P2 = [top[0] + w1 / 2 + sway, top[1] + len], bl: P2 = [top[0] - w1 / 2 + sway, top[1] + len];
  const pts: P2[] = [a, b, br, bl].map((p) => [c.sx(p[0]), c.sy(p[1])] as P2);
  const y0 = c.sy(top[1]), y1 = c.sy(top[1] + len);
  c.poly(pts, (x, y) => {
    const fromBot = y1 - y;
    const t = (y - y0) / Math.max(1, y1 - y0);
    const half = (w0 / 2 + ((w1 - w0) / 2) * t) * L;
    const cx = c.sx(top[0] + sway * t);
    const rel = (x + 0.5 - cx) / Math.max(1, half);
    const tw = Math.max(3, Math.round(L * (o.wisp ? 1.1 : 0.7)));
    const col = Math.floor(c.lx(x) / tw);
    const off = Math.abs(((c.lx(x) % tw) + 0.5) / tw * 2 - 1);
    const deep = o.wisp ? len * 0.36 : len * 0.16;
    if (fromBot < L * deep + L && hash(col, 3, seed) * L * deep * (o.wisp ? 1 - Math.abs(rel) * 0.5 : 1) + off * L * 0.8 > fromBot) return -1;
    // A fold channel running down from under the near shoulder, a lit ridge beside it.
    const fold = rel - t * 0.12;
    if (L >= 2 && Math.abs(fold + 0.05) < 0.07) return code(m, 1);
    if (L >= 2 && Math.abs(fold + 0.18) < 0.05 && t > 0.15) return code(m, 3);
    if (L >= 4 && Math.abs(fold - 0.45) < 0.05 && t > 0.3) return code(m, 1);
    const lt = planeLight(rel, t * 2 - 1, 0.38);
    if (lt > 0 || rel < -0.78) return code(m, 2 + litStep(c));
    if (lt < 0 || (fromBot < L * 1.5 && c.tex(x, y, seed) < 0.2)) return code(m, 1);
    return code(m, 2);
  });
}

/**
 * A cowl around the skull: a dark hood with a peak falling back, the face opening in deep
 * shadow with two cold points of light (front), or the back of the hood with its seam (back).
 */
export function hood(c: Paper, at: P2, ang: number, back: boolean, m: number = UM.shroud, o: { eyes?: boolean; skullFace?: boolean } = {}): void {
  ang = snapDeg(ang);
  const R = (p: P2): P2 => addP(at, rot(p, ang * DEG));
  // The outer cowl: crown, a peak trailing behind, down to the shoulders.
  const outer: P2[] = back
    ? [R([-1.5, 1.6]), R([-1.45, -0.3]), R([-0.9, -1.3]), R([0.1, -1.55]), R([1.2, -1.1]), R([1.55, 0.2]), R([1.6, 1.7])]
    : [R([-1.6, 1.7]), R([-1.55, 0.0]), R([-1.2, -1.15]), R([-0.25, -1.6]), R([0.9, -1.3]), R([1.45, -0.2]), R([1.5, 1.6])];
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.poly(outer.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y) => {
    const [fx, fy] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -ang * DEG);
    if (back) {
      if (L >= 2 && Math.abs(fx - 0.15 + fy * 0.15) < 0.12 && fy < 0.9) return code(m, 1); // the seam
      if (fx < -0.8) return code(m, 3);
      if (fx > 0.9) return code(m, 1);
      return code(m, 2);
    }
    // The face opening: an oval toward the forward side.
    const ox = fx - 0.42, oy = fy + 0.05;
    const inFace = Math.hypot(ox / 0.78, oy / 0.95) < 1;
    if (inFace) {
      if (o.skullFace && oy > -0.1 && Math.hypot(ox / 0.55, (oy - 0.25) / 0.6) < 1) {
        // A glimpse of the skull: cheekbone and teeth under the shadow.
        if (oy > 0.45) return (c.lx(x) & 1) === 0 ? code(UM.bone, 2) : code(UM.ink, 1);
        return code(UM.bone, 1);
      }
      if (o.eyes !== false) for (const ex of [-0.05, 0.38]) if (Math.hypot(ox - ex + 0.15, oy + 0.18) < (L <= 1 ? 0.5 : 0.17)) return code(UM.glow, 4);
      return code(UM.ink, 0);
    }
    // The lip of the hood round the face is lit; the crown lit top-left; the back in shade.
    if (Math.hypot(ox / 0.98, oy / 1.15) < 1 && ox < 0 && oy < 0) return code(m, 2 + litStep(c));
    if (fx < -0.2 && L >= 2 && Math.abs(fx + 0.55 - fy * 0.1) < 0.08) return code(m, 1);
    const lt = planeLight(fx / 1.5, fy / 1.6, 0.35);
    return code(m, 2 + (lt > 0 ? litStep(c) : lt));
  });
}

// ------------------------------------------------------------------ weapons

/**
 * A spear: haft from `back` units behind the hand to `fwd` in front, pointing at `deg` (absolute,
 * 180 up), a rusted leaf blade with a dark midrib and socket, and an optional team rag tied under
 * the blade, trailing.
 */
export function spear(c: Paper, hand: P2, deg: number, fwd: number, back: number, o: { blade?: number; rag?: boolean; sway?: number; mat?: number } = {}): P2 {
  const tail = along(hand, deg + 180, back);
  const tip = along(hand, deg, fwd);
  const bl = o.blade ?? 1.6;
  const sock = along(tip, deg + 180, bl);
  c.rod(tail, sock, 0.3, 0.26, o.mat ?? UM.wood, { tone: 2 });
  if (o.rag) {
    const tie = along(sock, deg + 180, 0.4);
    const s = o.sway ?? 0;
    // Two torn streamers knotted under the blade, hanging and trailing back.
    const k = along(tie, deg + 180, 0.5);
    const pts: P2[] = [tie, k, addP(k, [-0.5 + s, 2.6]), addP(k, [-0.9 + s, 2.0]), addP(k, [-1.3 + s, 2.9]), addP(tie, [-1.1 + s * 0.5, 0.9])];
    c.shape(pts, (x, y) => {
      if (c.L >= 2 && c.tex(x, y, 141, 2) < 0.1) return -1;
      return code(UM.team, c.lx(x) < c.L * 0.5 ? 3 : c.ly(y) > c.L * 1.8 ? 1 : 2);
    });
  }
  // The leaf blade: widest a third up, a dark midrib, one half lit.
  const side = limb(deg + 90);
  const w = 0.42;
  const mid = along(sock, deg, bl * 0.35);
  const pts: P2[] = [sock, addP(mid, mul(side, w)), tip, addP(mid, mul(side, -w))];
  const ax = c.sx(sock[0]), ay = c.sy(sock[1]);
  const [vx, vy] = limb(deg);
  c.shape(pts, (x, y) => {
    const dx = x + 0.5 - ax, dy = y + 0.5 - ay;
    const across = (dx * vy - dy * vx) / c.L; // signed distance from the midrib
    if (c.L >= 4 && Math.abs(across) < 0.07) return code(UM.iron, 1);
    if (c.tex(x, y, 143) < 0.15) return code(UM.rust, 2);
    return across < 0 ? code(UM.steel, 3) : code(UM.steel, 1);
  });
  c.rod(sock, along(sock, deg + 180, 0.5), 0.34, 0.3, UM.iron, { tone: 1 });
  return tip;
}

/**
 * A bow held at `grip`, the arrow pointing `deg` (absolute). Its limbs curve back toward the
 * archer, recurved at the tips; the string runs to the nock `draw` units behind the grip (0 =
 * braced, ~2.5 full draw). `size` scales it (the wraith's war bow is as tall as a man).
 */
export function bow(c: Paper, grip: P2, deg: number, draw: number, size: number, o: { arrow?: boolean; mat?: number } = {}): P2 {
  const m = o.mat ?? UM.wood;
  const up = deg - 90, dn = deg + 90; // the bow's plane is across the arrow
  const flex = 0.55 + draw * 0.12;
  const limbPts = (dir: number): P2[] => {
    const p0 = grip;
    const p1 = addP(along(p0, dir, size * 0.36), mul(limb(deg), -flex * 0.35 * size * 0.2));
    const p2 = addP(along(p1, dir, size * 0.34), mul(limb(deg), -flex * 0.9 * size * 0.2));
    const p3 = addP(along(p2, dir, size * 0.22), mul(limb(deg), -flex * 0.7 * size * 0.2));
    return [p0, p1, p2, p3];
  };
  const U = limbPts(up), D = limbPts(dn);
  const nock = along(grip, deg + 180, draw * size * 0.2 + 0.3);
  c.line(U[3]!, nock, code(UM.bone, 2));
  c.line(D[3]!, nock, code(UM.bone, 1));
  for (const P of [U, D]) for (let i = 0; i < 3; i++) c.rod(P[i]!, P[i + 1]!, 0.34 - i * 0.07, 0.3 - i * 0.07, m, { tone: i === 2 ? 1 : 2 });
  c.rod(along(grip, up, 0.5), along(grip, dn, 0.5), 0.42, 0.42, UM.leather, { tone: 2 });
  if (o.arrow) {
    c.rod(nock, along(grip, deg, 1.3), 0.16, 0.16, UM.wood, { tone: 3 });
    c.rod(along(grip, deg, 1.0), along(grip, deg, 1.5), 0.3, 0.1, UM.iron, { tone: 2 });
  }
  return nock;
}

/** A quiver of arrows (or bone javelins) slung at `at`, its mouth toward `deg`. */
export function quiver(c: Paper, at: P2, deg: number, o: { shafts?: number; len?: number; bone?: boolean } = {}): void {
  const len = o.len ?? 2.4;
  const mouth = along(at, deg, len * 0.5);
  const n = o.shafts ?? 4;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.32;
    const base = addP(mouth, mul(limb(deg + 90), off));
    // Fanned and of different lengths, so the shafts never end on one row.
    const tip = along(base, deg + (i - (n - 1) / 2) * (o.bone ? 16 : 6), o.bone ? 2.2 + ((i * 2) % 3) * 0.55 : 1.1 + (i % 2) * 0.3);
    if (o.bone) {
      // Sharpened long bones: a knob end in the quiver, a splintered point out of it.
      c.rod(base, tip, 0.3, 0.12, UM.bone, { tone: i % 2 ? 2 : 3 });
    } else {
      c.rod(base, tip, 0.14, 0.14, UM.wood, { tone: 3 });
      c.rod(tip, along(tip, deg, 0.5), 0.36, 0.1, UM.bone, { tone: 3 }); // fletching
    }
  }
  c.rod(along(at, deg + 180, len * 0.5), mouth, 0.7, 0.85, UM.leather, { tone: 2, detail: (x, _y, _u, v) => (Math.abs(v - 0.8) < 0.08 || (c.L >= 4 && (c.lx(x) & 3) === 0 && v < 0.5) ? code(UM.leather, 1) : -1) });
}

/** A crossbow held level at the stock's grip, pointing `deg`; `spanned` draws the string back. */
export function crossbow(c: Paper, grip: P2, deg: number, spanned: boolean): P2 {
  const front = along(grip, deg, 2.4);
  const butt = along(grip, deg + 180, 1.3);
  c.rod(butt, front, 0.42, 0.34, UM.wood, { tone: 2 });
  // The steel prod across the front, swept back a little.
  const side = limb(deg + 90);
  const p0 = addP(addP(front, mul(side, 1.6)), mul(limb(deg), -0.35)), p1 = addP(addP(front, mul(side, -1.6)), mul(limb(deg), -0.35));
  c.rod(p0, front, 0.26, 0.32, UM.iron, { tone: 2, shine: true });
  c.rod(front, p1, 0.32, 0.26, UM.iron, { tone: 2, shine: true });
  const nut = spanned ? along(grip, deg, 0.4) : along(front, deg + 180, 0.2);
  c.line(p0, nut, code(UM.bone, 1));
  c.line(p1, nut, code(UM.bone, 1));
  if (spanned) c.rod(nut, along(front, deg, 0.4), 0.2, 0.2, UM.iron, { tone: 3 });
  // The stirrup at the nose.
  c.rod(along(front, deg, 0.1), along(front, deg, 0.7), 0.3, 0.3, UM.rust, { tone: 2 });
  return front;
}

/**
 * The tall pavise of the Revenant Arbalests: rotted boards with a rusted rim and the painted
 * skull on the team field (front), or the planks and straps (back). `at` is its centre.
 */
export function pavise(c: Paper, at: P2, tilt: number, face: boolean, s = 1): void {
  tilt = snapDeg(tilt);
  const w = 1.7 * s, h = 2.9 * s;
  const pts: P2[] = [[-w, -h], [w * 0.9, -h - 0.25 * s], [w * 0.95, h * 0.9], [0, h], [-w, h * 0.9]].map((p) => addP(at, rot(p as P2, tilt * DEG)));
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.poly(pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y) => {
    const [lx, ly] = rot([(x + 0.5 - cx) / L / s, (y + 0.5 - cy) / L / s], -tilt * DEG);
    const edge = Math.min(1.7 - Math.abs(lx), 2.9 - Math.abs(ly));
    const lt = planeLight(lx / 1.7, ly / 2.9, 0.3);
    if (edge < 0.28) return code(UM.rust, lt > 0 ? 3 : lt < 0 ? 1 : 2);
    if (!face) {
      if (Math.abs(ly + 1.1) < 0.2 || Math.abs(ly - 0.9) < 0.2) return code(UM.leather, 1 + lt);
      const plank = (lx + 3) * 1.5;
      if (Math.abs((plank % 1) - 0.5) > 0.42) return code(UM.wood, lt > 0 ? 1 : 0);
      return code(UM.wood, (hash(Math.floor(plank), c.ly(y) >> 2, 151) < 0.2 ? 1 : 2) + Math.min(0, lt));
    }
    // The painted skull, big: it has to read at a distance.
    const sd = Math.hypot(lx * 1.05, (ly + 0.45) * 0.95);
    if (sd < 0.95 || (Math.abs(lx) < 0.55 && ly > 0.3 && ly < 0.95)) {
      if (Math.hypot(Math.abs(lx) - 0.36, ly + 0.45) < 0.24) return code(UM.ink, 1);
      if (Math.abs(lx) < 0.09 && ly > -0.15 && ly < 0.2) return code(UM.ink, 1);
      if (ly > 0.55 && (c.lx(x) & 1) === 0 && L >= 2) return code(UM.ink, 2);
      return code(UM.bone, lx < 0 ? 3 : 2);
    }
    if (hash(c.lx(x) >> 1, c.ly(y) >> 2, 153) < 0.06) return code(UM.wood, 1);
    // A dark stripe down the middle (the painted field's border) and the team field.
    if (Math.abs(lx) < 0.12 && ly > 1.1) return code(UM.teamDk, 1);
    return code(UM.team, 2 + (lt > 0 ? litStep(c) : lt));
  });
}

/**
 * A lance: a long ash haft, a vamplate at the grip, a rusted point and a team pennon behind the
 * point, cut into two tails that trail with the sway.
 */
export function lance(c: Paper, hand: P2, deg: number, fwd: number, back: number, o: { pennon?: boolean; sway?: number; vamplate?: boolean } = {}): P2 {
  const tail = along(hand, deg + 180, back);
  const tip = along(hand, deg, fwd);
  c.rod(tail, tip, 0.34, 0.2, UM.wood, { tone: 2 });
  c.rod(along(tip, deg + 180, 0.9), along(tip, deg, 0.3), 0.36, 0.1, UM.steel, { tone: 2, shine: true });
  if (o.vamplate) c.rod(along(hand, deg + 180, 0.1), along(hand, deg, 0.6), 0.5, 0.95, UM.iron, { tone: 2 });
  if (o.pennon) {
    const s = o.sway ?? 0;
    const a = along(tip, deg + 180, 1.0), b = along(tip, deg + 180, 2.4);
    const back2 = mul(limb(deg + 180), 1); // trailing direction along the haft
    const drop: P2 = [back2[0] * 0.6 - 0.2 + s * 0.3, 0.9];
    const pts: P2[] = [a, addP(a, [drop[0] * 1.2 + back2[0] * 2.4, drop[1] + back2[1] * 2.4 + s]), addP(a, [drop[0] * 0.6 + back2[0] * 1.6, drop[1] * 0.75 + back2[1] * 1.6]), addP(b, [drop[0] + back2[0] * 1.4, drop[1] * 1.4 + back2[1] * 1.4 + s * 0.5]), b];
    c.shape(pts, (x, y) => (c.ly(y) < c.L * 0.5 ? code(UM.team, 3) : c.tex(x, y, 161) < 0.12 && c.L >= 4 ? code(UM.teamDk, 2) : code(UM.team, 2)));
  }
  return tip;
}

/** A giant femur used as a club: a long shaft, the two condyles at the head, an iron band, a dark crack. */
export function femur(c: Paper, grip: P2, deg: number, len: number, w: number): P2 {
  const head = along(grip, deg, len);
  const butt = along(grip, deg + 180, len * 0.12);
  c.blob(butt, w * 0.75, w * 0.7, UM.bone, { tone: 2 });
  c.rod(butt, head, w * 0.7, w * 1.0, UM.bone, {
    tone: 2,
    detail: (x, y, u, v) => {
      if (Math.abs(v - 0.3) < 0.04 || Math.abs(v - 0.36) < 0.03) return code(UM.rust, v < 0.33 ? 2 : 1);
      if (c.L >= 2 && Math.abs(u - 0.1 - Math.sin(v * 9) * 0.15) < 0.09 && v > 0.45 && v < 0.8) return code(UM.ink, 2);
      if (c.tex(x, y, 171, 3) < 0.1 && u > -0.3) return code(UM.bone, 1);
      return -1;
    },
  });
  const side = limb(deg + 90);
  c.blob(addP(head, mul(side, w * 0.55)), w * 0.9, w * 0.8, UM.bone, { tone: 2 });
  c.blob(addP(head, mul(side, -w * 0.55)), w * 0.85, w * 0.75, UM.bone, { tone: 1 });
  return head;
}

/** A green witchfire flame at `at`, `h` units tall; `phase` (0..1) flickers its tongues. */
export function flame(c: Paper, at: P2, h: number, phase: number, o: { w?: number } = {}): void {
  const w = o.w ?? h * 0.45;
  const lean = Math.sin(phase * Math.PI * 2) * 0.12;
  const pts: P2[] = [
    [at[0] - w, at[1]],
    [at[0] - w * 0.8, at[1] - h * 0.45],
    [at[0] - w * 0.2 + lean * h, at[1] - h * 0.62],
    [at[0] - w * 0.05 + lean * h * 1.6, at[1] - h],
    [at[0] + w * 0.45 + lean * h, at[1] - h * 0.55],
    [at[0] + w * 0.6, at[1] - h * 0.8 - Math.cos(phase * Math.PI * 2) * h * 0.08],
    [at[0] + w, at[1] - h * 0.3],
    [at[0] + w * 0.8, at[1]],
  ];
  const cx = c.sx(at[0]), cy = c.sy(at[1] - h * 0.3);
  c.shape(pts, (x, y) => {
    const d = Math.hypot((x + 0.5 - cx) / (w * c.L), (y + 0.5 - cy) / (h * 0.5 * c.L));
    return code(UM.glow, d < 0.45 ? 4 : d < 0.8 ? 3 : 2);
  });
}

// ------------------------------------------------------------------ the skeletal horse

/** The horse's bones: charred black, so a pale rider and the green eyes read over them. */
const HB = UM.char;

/** The pose fields a horse uses (rig.ts HorsePose). */
export interface HorseLegs {
  px: number;
  py: number;
  tilt: number;
  pitch: number;
  neck: number;
  nod: number;
  fnu: number;
  fnl: number;
  ffu: number;
  ffl: number;
  hnu: number;
  hnl: number;
  hfu: number;
  hfl: number;
  tail: number;
  sway: number;
}

/**
 * A horse's anchors: `P(rel)` maps a point of the body (units, from the girth, x forward) to the
 * canvas through the pitch, the pose offset and the tilt. The pivot snaps to whole pixels.
 * From behind (NE), the near flank is the horse's left one and the rump is the nearest part:
 * the hindquarters grow a little and the head and neck shrink.
 */
export interface HorseFrame {
  back: boolean;
  tilt: number;
  P: (rel: P2) => P2;
  pivot: P2;
  seat: P2;
  sj: P2;
  hj: P2;
  /** Forward and hind joints on the far side (a little up and back: the far legs show beyond). */
  sjF: P2;
  hjF: P2;
  neckBase: P2;
  poll: P2;
  neckDeg: number;
  headDeg: number;
}

export function horseFrame(c: Paper, p: HorseLegs, back: boolean): HorseFrame {
  const pivot = c.q([p.px, -9 + p.py]);
  const T = (q: P2): P2 => rot(q, p.tilt * DEG);
  const P = (rel: P2): P2 => {
    let [x, y] = rel;
    if (back) {
      // The rump nearer: scale the rear up a little, the front down.
      const k = x < 0 ? 1 + Math.min(1, -x / 6) * 0.08 : 1 - Math.min(1, x / 6) * 0.08;
      x *= k;
      y = y * k + (x < 0 ? Math.min(1, -x / 6) * 0.3 : 0);
    }
    return T(addP(pivot, rot([x, y], -p.pitch * DEG)));
  };
  const neckDeg = 180 - p.neck - p.pitch + p.tilt;
  const neckBase = P([4.3, -1.0]);
  const poll = along(neckBase, neckDeg, back ? 3.9 : 4.4);
  return {
    back,
    tilt: p.tilt,
    P,
    pivot,
    seat: c.q(P([-0.5, -2.3])),
    sj: P([4.1, 1.5]),
    hj: P([-4.3, 1.1]),
    sjF: P([3.5, 1.1]),
    hjF: P([-4.9, 0.8]),
    neckBase,
    poll,
    neckDeg,
    headDeg: 55 + p.nod - p.pitch + p.tilt,
  };
}

/** A horse's leg: upper bone with a knobbed knee or hock, a slim cannon, the fetlock knob, pastern and hoof. */
function horseLeg(c: Paper, H: HorseFrame, root: P2, up: number, lo: number, hind: boolean, far: boolean, o: { bard?: boolean } = {}): void {
  const tone = far ? 1 : 2;
  const a1 = hind ? up - 12 : up, a2 = hind ? up + lo + 10 : up + lo;
  const l1 = hind ? 3.9 : 3.5, l2 = hind ? 3.5 : 3.4;
  const joint = along(root, a1 + H.tilt, l1);
  const fet = along(joint, a2 + H.tilt, l2 * 0.8);
  const hoofTop = along(joint, a2 + H.tilt, l2);
  // Upper: two bones (the radius and ulna, or the tibia), the knob at the joint.
  c.rod(root, joint, hind ? 0.62 : 0.5, 0.34, HB, { tone });
  if (c.L >= 2) c.rod(addP(root, [hind ? -0.3 : 0.25, 0.4]), addP(joint, [hind ? -0.2 : 0.18, -0.25]), 0.16, 0.12, HB, { tone: tone - 1 });
  c.blob(joint, 0.36, 0.34, HB, { tone: tone - 1 });
  c.rod(joint, fet, 0.3, 0.26, HB, { tone });
  c.blob(fet, 0.3, 0.28, HB, { tone: tone - 1 });
  c.rod(fet, hoofTop, 0.26, 0.28, HB, { tone });
  // The hoof: a dark wedge widening to its base, the toe forward.
  const toe = H.tilt;
  const hp: P2[] = [addP(hoofTop, rot([-0.3, -0.05], toe * DEG)), addP(hoofTop, rot([0.25, -0.05], toe * DEG)), addP(hoofTop, rot([0.6, 0.42], toe * DEG)), addP(hoofTop, rot([-0.4, 0.42], toe * DEG))];
  c.shape(hp, () => code(UM.rag, far ? 0 : 1));
  if (o.bard && !far) return;
}

/**
 * The horse's skull, long and wedge-shaped, pointing `deg` from the poll: the brow with a deep
 * socket and a cold point of light, the long nasal bone lit on top, the nostril cavity, the
 * teeth, and the lower jaw hung below. With `chanfron` an iron face-plate with a spike covers it.
 */
function horseSkull(c: Paper, poll: P2, deg: number, back: boolean, o: { chanfron?: boolean; jaw?: number } = {}): void {
  deg = snapDeg(deg);
  const len = back ? 2.9 : 3.3;
  const dir = limb(deg), side = limb(deg - 90); // side: toward the top of the head
  const at = (u: number, v: number): P2 => addP(poll, addP(mul(dir, u * len), mul(side, v)));
  // The lower jaw first (behind): deep at the cheek, hung a little open.
  const jo = o.jaw ?? 0;
  c.shape([at(0.05, -0.2), at(0.3, -0.95 - jo * 0.3), at(0.55, -0.75 - jo * 0.4), at(0.98, -0.35 - jo * 0.5), at(0.95, -0.12)], (x, y) => (c.tex(x, y, 181) < 0.15 ? code(HB, 0) : code(HB, 1)));
  // The skull: a broad cranium behind the socket, the long face tapering to the muzzle.
  const pts: P2[] = [at(-0.12, 0.3), at(0.08, 0.85), at(0.42, 0.72), at(1.0, 0.3), at(1.06, 0.02), at(1.0, -0.22), at(0.45, -0.32), at(0.12, -0.55), at(-0.1, -0.3)];
  const ox = c.sx(poll[0]), oy = c.sy(poll[1]);
  c.shape(pts, (x, y) => {
    const dx = (x + 0.5 - ox) / c.L, dy = (y + 0.5 - oy) / c.L;
    const u = (dx * dir[0] + dy * dir[1]) / len, v = dx * side[0] + dy * side[1];
    if (o.chanfron && u > 0.12 && u < 0.9 && v > -0.2) {
      if (Math.hypot((u - 0.24) * len, v - 0.35) < (c.L <= 1 ? 0.45 : 0.18)) return code(UM.glow, 4);
      if (Math.hypot((u - 0.24) * len, v - 0.35) < 0.36) return code(UM.ink, 0);
      if (Math.abs(u - 0.55) < 0.03 && c.L >= 4) return code(UM.rust, 1);
      return v > 0.4 ? code(UM.iron, 3) : code(UM.iron, 2);
    }
    // The deep socket under the brow, its point of light; the brow ridge lit.
    const e = Math.hypot((u - 0.24) * len, (v - 0.32) * 1.1);
    if (!back && e < 0.48) return e < (c.L <= 1 ? 0.45 : 0.18) ? code(UM.glow, 4) : code(UM.ink, 0);
    if (back && e < 0.32) return code(UM.ink, 1);
    if (!back && e < 0.62 && v > 0.32) return code(HB, 3);
    // The long nasal bone lit on top, the nostril notch, the teeth.
    if (!back && u > 0.74 && u < 0.95 && Math.abs(v - 0.02) < 0.13) return code(UM.ink, 1);
    if (u > 0.5 && v < -0.12 && c.L >= 2) return (c.lx(x) & 1) === 0 ? code(HB, 3) : code(UM.ink, 2);
    if (v > 0.3 + (u - 0.4) * -0.6 && u > 0.4) return code(HB, 3);
    // The cheek's hollow behind the socket.
    if (c.L >= 4 && Math.hypot((u - 0.1) * len, v + 0.05) < 0.28) return code(HB, 0);
    if (v < -0.15) return code(HB, 1);
    if (c.tex(x, y, 183) < 0.12) return code(HB, 1);
    return code(HB, 2);
  });
  if (o.chanfron) c.rod(at(0.18, 0.5), addP(at(0.18, 0.5), mul(side, 0.9)), 0.3, 0.08, UM.steel, { tone: 2 });
}

export interface HorseLook {
  /** Bone barding (Death Knights): rows of bone plates over a team caparison, a chanfron, a crinet. */
  bard?: boolean;
  /** A ragged shroud mane and tail. */
  mane?: boolean;
  /** Team saddle cloth (always, unless barded). */
  cloth?: boolean;
}

/** The far legs (drawn first, behind the rider's far leg and the body). */
export function horseFar(c: Paper, H: HorseFrame, p: HorseLegs, look: HorseLook): void {
  horseLeg(c, H, H.hjF, p.hfu, p.hfl, true, true);
  horseLeg(c, H, H.sjF, p.ffu, p.ffl, false, true);
  void look;
}

/** The neck vertebrae, mane, and head. */
function horseNeck(c: Paper, H: HorseFrame, look: HorseLook, sway: number, jaw: number): void {
  const n = 5;
  const len = H.back ? 3.9 : 4.4;
  if (look.mane) {
    // A ragged strip of shroud along the top of the neck, lagging.
    const pts: P2[] = [];
    for (let i = 0; i <= n; i++) pts.push(addP(along(H.neckBase, H.neckDeg, (len * i) / n), mul(limb(H.neckDeg - 90), 0.45)));
    for (let i = n; i >= 0; i--) pts.push(addP(along(H.neckBase, H.neckDeg, (len * i) / n), [-1.3 - sway * 0.6 - (i % 2) * 0.5, 0.9 + (i % 2) * 0.6]));
    c.shape(pts, (x, y) => (c.tex(x, y, 191, 2) < 0.15 ? -1 : code(UM.shroud, c.ly(y) < c.L ? 2 : 1)));
  }
  if (look.bard) {
    // The crinet: overlapping bone plates down the neck.
    const pts: P2[] = [addP(H.neckBase, [0.9, 1.2]), addP(H.neckBase, [-0.6, -0.4]), addP(H.poll, [-0.6, 0.0]), addP(H.poll, [0.6, 0.5])];
    c.shape(pts, (x, y) => (c.ly(y) % Math.max(2, Math.round(c.L * 0.8)) === 0 ? code(HB, 0) : code(HB, c.lx(x) < c.L * 0.6 ? 3 : 2)));
  } else {
    // The neck: the vertebrae as a chain of knobbed bones over the dark line of the ligament.
    c.rod(addP(H.neckBase, [0.2, 0.5]), addP(H.poll, [0.2, 0.4]), 0.36, 0.3, HB, { tone: 0 });
    for (let i = 0; i < n; i++) {
      const a = along(H.neckBase, H.neckDeg, (len * i) / n), b = along(H.neckBase, H.neckDeg, (len * (i + 0.85)) / n);
      c.rod(a, b, 0.5, 0.42, HB, { tone: 2 });
      c.blob(b, 0.36, 0.3, HB, { tone: 1 });
    }
  }
  horseSkull(c, H.poll, H.headDeg, H.back, { chanfron: look.bard, jaw });
}

/**
 * The body: spine and withers, ribs with gaps over a dark hollow, the shoulder blade, the pelvis,
 * the saddle (or the barding), the tail. `front` draws the neck and head after the body (front
 * view), else before it (back view, the head is the farthest part).
 */
export function horseBody(c: Paper, H: HorseFrame, p: HorseLegs, look: HorseLook, o: { jaw?: number } = {}): void {
  const P = H.P;
  const sway = p.sway;
  if (H.back) horseNeck(c, H, look, sway, o.jaw ?? 0);
  // The tail: vertebrae and a ragged switch of hair.
  const root = P([-5.3, -1.5]);
  const tailDeg = -35 - p.tail + p.tilt;
  const t1 = along(root, tailDeg, 1.4), t2 = along(t1, tailDeg + 15 + sway * 10, 1.4);
  if (look.mane || look.bard) c.shape([root, addP(t1, [-0.5, 0]), addP(t2, [-0.6 - sway * 0.4, 1.5]), addP(t2, [0.4 - sway * 0.4, 1.8]), addP(t1, [0.5, 0.4])], (x, y) => (c.tex(x, y, 193, 2) < 0.15 ? -1 : code(UM.shroud, 1)));
  c.rod(root, t1, 0.36, 0.28, HB, { tone: 2 });
  c.rod(t1, t2, 0.28, 0.2, HB, { tone: 1 });
  if (look.bard) {
    bard(c, H, sway);
  } else {
    // The hollow of the chest: dark, so the ribs read as bars over a void (at level 1 it keeps the mass).
    const hollow: P2[] = [P([3.6, -1.0]), P([-2.6, -1.0]), P([-3.0, 0.6]), P([-1.5, 1.7]), P([1.6, 2.4]), P([4.4, 1.6])];
    c.shape(hollow, (x, y) => (c.L >= 4 && c.tex(x, y, 195, 3) < 0.35 ? -1 : code(UM.ink, c.L <= 1 ? 2 : 1)));
    // Far ribs (darker) peeking between the near ones.
    if (c.L >= 2)
      for (let i = 0; i < 7; i++) {
        const x = 3.0 - i * 0.92 + 0.45;
        c.rod(P([x, -1.2]), P([x - 0.5, 1.6 - i * 0.12]), 0.2, 0.18, HB, { tone: 0 });
      }
    // Near ribs: bowed back, longest at the girth, with gaps.
    for (let i = 0; i < 7; i++) {
      const x = 3.2 - i * 0.92;
      const bot = 2.3 - Math.abs(i - 2) * 0.22 - (i > 4 ? (i - 4) * 0.35 : 0);
      const top = P([x, -1.3]), mid = P([x - 0.5, 0.5]), end = P([x - 0.25, bot]);
      c.rod(top, mid, 0.3, 0.26, HB, { tone: H.back ? 2 : 3 });
      c.rod(mid, end, 0.26, 0.2, HB, { tone: 2 });
    }
    // The sternum along the belly front.
    c.rod(P([4.2, 1.9]), P([1.4, 2.5]), 0.36, 0.3, HB, { tone: 1 });
  }
  // The spine: vertebrae from the withers to the croup, tall processes over the withers.
  for (let i = 0; i <= 9; i++) {
    const x = 4.3 - i * 1.0;
    const y = -1.4 - Math.sin((i / 9) * Math.PI) * 0.25 + (i < 3 ? -0.2 : 0);
    const v = P([x, y]);
    if (i < 4 && !look.bard) c.rod(v, P([x - 0.3, y - (0.9 - i * 0.22)]), 0.22, 0.16, HB, { tone: 3 });
    c.blob(v, 0.36, 0.26, HB, { tone: i % 2 ? 2 : 3 });
  }
  if (!look.bard) {
    // The pelvis: the ilium wing at the croup, down to the hip joint.
    const pv: P2[] = H.back
      ? [P([-3.0, -2.0]), P([-6.2, -2.0]), P([-6.3, 0.0]), P([-5.0, 1.4]), P([-3.8, 0.6])]
      : [P([-3.2, -1.9]), P([-5.8, -1.6]), P([-5.9, 0.4]), P([-4.5, 1.4]), P([-3.6, 0.2])];
    const pcx = P([-4.6, -0.3]);
    c.shape(pv, (x, y) => {
      const dx = (x + 0.5 - c.sx(pcx[0])) / c.L, dy = (y + 0.5 - c.sy(pcx[1])) / c.L;
      if (c.L >= 4 && Math.hypot(dx + 0.3, (dy - 0.5) * 1.2) < 0.38) return code(UM.ink, 1); // obturator
      if (H.back && Math.abs(dx + 0.1) < 0.16) return code(HB, 1); // the sacrum's ridge
      if (dy < -1.1 || dx < -1.1) return code(HB, 3);
      if (dx > 0.7 && dy > 0.2) return code(HB, 1);
      return code(HB, 2);
    });
    // The shoulder blade, near side, over the front ribs.
    const sc: P2[] = [P([3.0, -1.6]), P([4.6, -1.5]), P([4.5, 1.2]), P([3.8, 1.5])];
    c.shape(sc, (x, y) => (c.ly(y) < c.L * 0.6 || c.lx(x) < c.L * 0.4 ? code(HB, 3) : c.L >= 4 && Math.abs(c.lx(x) - c.L * 0.9) < c.L * 0.12 ? code(HB, 1) : code(HB, 2)));
    // The saddle: a team cloth with a torn hem, a dark leather seat, a girth strap.
    if (look.cloth !== false) {
      rag(c, P([1.3, -1.9]), P([-2.4, -2.0]), 2.6, -sway * 0.3, UM.team, UM.teamDk, 197, { tear: 0.35, folds: false, spread: 0.2 });
      c.rod(P([0.6, -2.4]), P([-1.9, -2.5]), 0.75, 0.75, UM.leather, { tone: 2 });
      c.rod(P([1.2, -2.7]), P([0.9, -2.0]), 0.4, 0.3, UM.leather, { tone: 1 });
      c.rod(P([-0.2, -1.6]), P([0.1, 2.3]), 0.26, 0.26, UM.leather, { tone: 1 });
    }
  }
  if (!H.back) horseNeck(c, H, look, sway, o.jaw ?? 0);
}

/** Bone barding over a team caparison: plate rows with dark seams, a scalloped, tattered hem. */
function bard(c: Paper, H: HorseFrame, sway: number): void {
  const P = H.P;
  // The team caparison hangs below the plates, torn.
  rag(c, P([5.5, 1.6]), P([-5.6, 1.4]), 2.4, -sway * 0.4, UM.team, UM.teamDk, 199, { tear: 0.55, folds: false });
  const pts: P2[] = [P([5.9, -0.6]), P([4.3, -2.2]), P([-1.0, -2.6]), P([-4.6, -2.4]), P([-6.1, -1.2]), P([-6.2, 2.0]), P([5.8, 2.1])];
  const L = c.L;
  const row = Math.max(2, Math.round(L * 0.85));
  const top = c.sy(P([0, -2.6])[1]);
  c.poly(pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y) => {
    const r = Math.floor((y - top) / row);
    const yy = (y - top) % row;
    const pw = Math.max(3, Math.round(L * 1.2));
    const xx = (c.lx(x) + (r % 2) * (pw >> 1)) % pw;
    // Scalloped lower edge of each plate: a dark seam, the plate's top lit.
    if (L >= 2 && (yy === row - 1 || (xx === 0 && yy > row / 2))) return code(HB, 0);
    // Each plate's upper rim is bare bone, the rest blackened.
    if ((L >= 4 || (L >= 2 && r === 0)) && yy === 0) return code(UM.bone, 2);
    if (c.tex(x, y, 201, 3) < 0.12) return code(HB, 1);
    // One plane of light over the whole bard: lit toward the withers, shaded to the belly and rump.
    const fx = (x - c.sx(P([-6, 0])[0])) / Math.max(1, c.sx(P([6, 0])[0]) - c.sx(P([-6, 0])[0]));
    const lt = planeLight(2 * fx - 1, (r / 5) * 2 - 1, 0.35);
    return code(HB, 2 + (lt > 0 ? litStep(c) : lt));
  });
  // A skull boss on the flank, the green point in its socket.
  const sk = P([-3.6, -0.2]);
  c.blob(sk, 0.75, 0.75, HB, { tone: 3, detail: (_x, _y, nx, ny) => (Math.hypot(Math.abs(nx) - 0.38, ny + 0.05) < 0.3 ? (nx > 0 ? code(UM.glow, 4) : code(UM.ink, 0)) : ny > 0.55 ? code(UM.ink, 1) : -1) });
  // The saddle and a high cantle.
  c.rod(P([0.6, -2.7]), P([-1.9, -2.8]), 0.7, 0.7, UM.leather, { tone: 2 });
  c.rod(P([-1.9, -2.6]), P([-2.2, -3.6]), 0.45, 0.35, UM.leather, { tone: 1 });
}

/** The near legs (drawn after the body and the rider's far side). */
export function horseNear(c: Paper, H: HorseFrame, p: HorseLegs, look: HorseLook): void {
  horseLeg(c, H, H.hj, p.hnu, p.hnl, true, false, { bard: look.bard });
  horseLeg(c, H, H.sj, p.fnu, p.fnl, false, false, { bard: look.bard });
}

/** A fallen horse: the ribcage on its side, the skull, the legs and spine strewn. */
export function horseRemains(c: Paper, back: boolean, look: HorseLook): void {
  for (let i = 0; i < 6; i++) {
    const x = 3 - i * 1.1;
    c.rod([x, -2.6], [x - 0.8, -0.4], 0.28, 0.22, HB, { tone: i % 2 ? 1 : 2 });
  }
  for (let i = 0; i <= 8; i++) c.blob([4 - i * 1.05, -2.8 + Math.sin(i * 0.6) * 0.15], 0.34, 0.26, HB, { tone: i % 2 ? 2 : 3 });
  if (look.bard) rag(c, [4.5, -1.8], [-4.8, -1.6], 1.6, 0, UM.team, UM.teamDk, 203, { tear: 0.5, folds: false });
  bone(c, [-6.5, -0.4], [-3.4, -0.7], 0.5, 0.4, 2);
  bone(c, [5.5, -0.3], [8.2, -0.6], 0.42, 0.36, 1);
  bone(c, [-2.5, -0.2], [0.8, 0.1], 0.38, 0.32, 2);
  horseSkull(c, [6.2, -2.6], 110, back, { chanfron: look.bard, jaw: 0.5 });
}

// ------------------------------------------------------------------ rider

/** A skeleton rider's anchors, from the saddle. */
export function riderFrame(c: Paper, H: HorseFrame, p: FramePose, back: boolean): Frame {
  return frameOf(c, { px: 0, py: 0, tilt: p.tilt, torso: p.torso }, back, { origin: H.seat, pelY: 0 });
}

// ------------------------------------------------------------------ light from above

/**
 * The lower part of a figure a tone darker: the light falls from above, so shins, hems, hooves
 * and the engine's sills sit in the shade near the ground (and the figure's value, and each
 * part's light, read from the top-left as the lint measures it). Inks and glows keep theirs.
 * Call it last in a figure's draw.
 */
export function shadeLower(c: Paper, frac = 0.42): void {
  if (c.bx1 < c.bx0) return;
  const h = c.by1 - c.by0;
  // The shade line slants up toward the far (right) side, away from the light, and steps
  // irregularly, so it never cuts every part on one row (that would read as a band).
  const cut = (x: number, f: number): number => c.by1 - h * f - (x - c.FX) * 0.4 + Math.floor(hash(x >> 1, 7, 331) * 3) - 1;
  for (let y = Math.max(c.by0, Math.round(c.by1 - h * frac * 1.6)); y <= c.by1; y++)
    for (let x = c.bx0; x <= c.bx1; x++) {
      const i = y * c.CW + x;
      const v = c.pix[i]!;
      if (v < 0 || (v & 7) === 0 || isKept(v >> 3)) continue;
      // One tone darker over the lower part, two near the ground.
      const d = y > cut(x, frac * 0.4) ? 2 : y > cut(x, frac) ? 1 : 0;
      if (d) c.pix[i] = (v & ~7) | Math.max(0, (v & 7) - d);
    }
  // At levels 1-2 a part is two or three pixels across and the rods' 1 px lit edge falls on a
  // tone the level merges with the base (level 1 keeps tones 0, 1, 2 and 4): the edge facing
  // the light gets the level's light tone, so the light still reads from the top-left.
  if (c.L > 2) return;
  const lit = c.L <= 1 ? 4 : 3;
  const mark: number[] = [];
  for (let y = Math.max(1, c.by0); y <= c.by1; y++)
    for (let x = Math.max(1, c.bx0); x <= c.bx1; x++) {
      const i = y * c.CW + x;
      const v = c.pix[i]!;
      if (v < 0 || isKept(v >> 3) || (v & 7) < 2) continue;
      if (c.pix[i - 1]! < 0 || c.pix[i - c.CW]! < 0) mark.push(i);
    }
  for (const i of mark) c.pix[i] = (c.pix[i]! & ~7) | Math.max(c.pix[i]! & 7, lit);
}
