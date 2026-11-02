// The Templar Order on paper: all eleven kinds. Owned by the templar faction agent; see README.md.
// Parts (the man, helms, shields, weapons, horse, engine) are in templar-parts.ts.
//
// The kinds, 1150-1300 (docs/art-references/hd-sprites.md, "Templar paper figures"):
//   0 Sergeant-Brothers  mail, black surcoat with the red cross, kettle hat, kite shield, sword
//   1 Spear Levy         gambeson, nasal helm, round shield, a spear half again his height
//   2 Javelin Men        wool tunic, arming cap, a fan of javelins in the shield hand
//   3 Pilgrim Archers    gambeson, pilgrim hat with the scallop, a longbow over the head
//   4 Genoese Crossbows  gambeson, kettle hat, a pavise slung high on the back
//   5 Turcopoles         turban over a spiked cap, round shield, a light lance with a pennon
//   6 Turcopole Archers  turban, bow and quiver, a bay horse with an army-coloured saddle cloth
//   7 Knight-Brothers    great helm, white surcoat, kite shield, couched lance, caparisoned grey
//   8 Iron Brethren      dismounted brothers: great helm, white surcoat, ailettes, Dane axe
//   9 Mangonel           a traction trebuchet with its pulling crew and a loader
//   10 Marshal           gilded great helm, the Beauséant, a caparisoned grey

import { COMMANDER_KIND } from '../contract.ts';
import { U } from '../../../game/units.ts';
import { Anim } from '../contract.ts';
import { addP, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { registerPaperKind, setFactionPaletteOptions, type PaperKindDef } from './registry.ts';
import { registerFootRigs } from './templar-foot.ts';
import { registerHorseRigs } from './templar-horse.ts';
import { registerEngineRig } from './templar-engine.ts';
import { ENGINE0, FOOT0, HORSE0, poser, settle, swing, type BasePose, type EnginePose, type FootPose, type HorsePose, type KeySet } from './rig.ts';
import {
  arrow, at, beauseant, bow, crossbow, daneAxe, horse, kite, man, paintAs, pavise, quiver, round, spear, sword, TM, trebuchet,
  type Gear, type HorseKit, type Kit, type Rig,
} from './templar-parts.ts';

const pose = poser(FOOT0);

// Each kind gets its own master palette (the full per-figure budget, from its own codes), so the
// dyes survive at levels 1-2 (the levy's ochre, the pilgrims' slate) and a kind's colours no longer
// shift when another kind changes; near-duplicate colours merge (most at level 2, where they broke
// flat masses into stripes). See docs/art-references/templar-animation.md, "Palette".
setFactionPaletteOptions('templar', { perKind: true, minDist: [0.1, 0.18, 0.1, 0.06], keepChroma: 0.12, weightOutlines: true });

/** Registers a Templar kind with the paper painter (every kind is drawn on paper). */
function register<P extends BasePose>(faction: 'templar', kind: number, def: PaperKindDef<P>): void {
  registerPaperKind<P>(faction, kind, def);
}

// ------------------------------------------------------------------ kits

// Each kit commits to a value against the field: dark (the sergeants in black over oiled mail,
// the javelin men and crossbowmen in dark wool) or light (the levy and archers in pale quilted
// linen, the brothers in white).
const SERGEANT: Kit = { helm: 'kettle', body: TM.mailDk, coat: TM.black, cross: true, hem: 3.0, sleeve: TM.mailDk, hand: TM.mailDk, legs: TM.mailDk, boots: TM.leather };
const LEVY: Kit = { helm: 'nasal', body: TM.russet, coat: null, cross: false, hem: 2.4, sleeve: TM.russet, hand: TM.flesh, legs: TM.wool, boots: TM.leather };
const JAVELIN: Kit = { helm: 'cap', body: TM.wool, coat: null, cross: false, hem: 2.1, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather, belt: TM.team };
const ARCHER: Kit = { helm: 'pilgrim', body: TM.wool, coat: null, cross: false, hem: 2.5, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather };
const XBOW: Kit = { helm: 'kettle', body: TM.wool, coat: null, cross: false, hem: 2.6, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather, belt: TM.team, coif: TM.mailDk };
const BRETHREN: Kit = { helm: 'great', body: TM.mail, coat: TM.white, cross: true, hem: 3.3, sleeve: TM.mail, hand: TM.mail, legs: TM.mail, boots: TM.mail, ailettes: true, scale: 1.08 };
const TURCOPOLE: Kit = { helm: 'turban', body: TM.gambeson, coat: null, cross: false, hem: 2.4, sleeve: TM.gambeson, hand: TM.flesh, legs: TM.gambeson, boots: TM.leather };
const HORSE_ARCHER: Kit = { ...TURCOPOLE, body: TM.wool, sleeve: TM.wool, legs: TM.wool, belt: TM.team };
const KNIGHT: Kit = { helm: 'great', body: TM.mail, coat: TM.white, cross: true, hem: 2.6, sleeve: TM.mail, hand: TM.mail, legs: TM.mail, boots: TM.mail };
const MARSHAL: Kit = { ...KNIGHT, helm: 'gilded', belt: TM.gold };
const CREW: Kit = { helm: 'cap', body: TM.wool, coat: null, cross: false, hem: 2.2, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather };

// ------------------------------------------------------------------ shared foot keys

/** Walk legs: contact, passing, contact, passing (the arms are set per kind). */
const WALK_LEGS: Partial<FootPose>[] = [
  { nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1 },
  { nt: 4, ns: -30, ft: 2, fs: -4, py: -0.3 },
  { nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1 },
  { nt: 2, ns: -4, ft: 4, fs: -30, py: -0.3 },
];
/** Run legs: long strides with a flight phase, leaning in. */
const RUN_LEGS: Partial<FootPose>[] = [
  { torso: 16, nt: 42, ns: -12, ft: -32, fs: -38, py: 0.25, px: 0.2 },
  { torso: 14, nt: 12, ns: -64, ft: 8, fs: -12, py: -0.55, px: 0.2 },
  { torso: 16, nt: -30, ns: -36, ft: 42, fs: -14, py: 0.25, px: 0.2 },
  { torso: 14, nt: 8, ns: -12, ft: 12, fs: -64, py: -0.55, px: 0.2 },
];
const legs = (base: Partial<FootPose>, set: Partial<FootPose>[]): FootPose[] => set.map((l) => pose({ ...base, ...l, torso: (base.torso ?? 0) + (l.torso ?? FOOT0.torso) }));

/** A blow lands: thrown back, then steadies (arms from `base`). */
const hitKeys = (base: Partial<FootPose>): FootPose[] => [
  pose(base),
  pose({ ...base, torso: -12, head: -14, px: -0.45, py: 0.15, nt: -2, ns: -16, ft: -26, fs: -2, nu: (base.nu ?? 18) + 18, fu: (base.fu ?? 12) + 20 }),
  pose({ ...base, torso: 0, head: -8, px: -0.2, nt: 4, ft: -20 }),
];
/** Struck down: staggers, the knees go, falls on his back, lies still. */
const dieKeys = (base: Partial<FootPose>): FootPose[] => [
  pose({ ...base, torso: -16, head: -18, nt: 4, ft: -6, px: -0.2 }),
  pose({ ...base, torso: -6, head: 14, nu: 30, nl: 40, fu: 30, fl: 50, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.8 }),
  pose({ ...base, tilt: -52, torso: -8, head: 22, nu: 70, nl: 10, fu: 60, fl: 20, nt: 46, ns: -56, ft: 36, fs: -44, py: 2.0 }),
  pose({ ...base, tilt: -88, torso: -4, head: 30, nu: 110, nl: 0, fu: 90, fl: 10, nt: 24, ns: -18, ft: 16, fs: -20, py: 2.3 }),
];
const deadKey = (die: FootPose[]): FootPose[] => [die.at(-1)!];

/** Cloth lag behind the stride and the strike. */
function footSecondary(out: FootPose, anim: Anim, fr: number, n: number): void {
  out.sway = anim === Anim.Walk ? swing(fr, n, 0.3, 1.5, 2) : anim === Anim.Run ? swing(fr, n, 0.45, 1.5, 2) : anim === Anim.Attack ? settle(fr, n, -0.35, 2) : anim === Anim.Hit ? settle(fr, n, 0.3, 1) : 0;
}

// ------------------------------------------------------------------ 0 Sergeant-Brothers

const SG = { nu: 20, nl: 62, fu: 26, fl: 52, bl: 150 };
const SERGEANT_DIE = dieKeys({ ...SG, bl: 200 });
const SERGEANT_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(SG), pose({ ...SG, py: 0.12, torso: 9 })],
    [Anim.Walk]: legs(SG, WALK_LEGS),
    [Anim.Run]: legs({ ...SG, nu: 30, nl: 50, bl: 118, fu: 40, fl: 40 }, RUN_LEGS),
    [Anim.Attack]: [
      pose({ ...SG, torso: -4, nu: 165, nl: 30, ft: -14, head: -6, bl: 225 }),
      pose({ ...SG, torso: 20, nu: 75, nl: 10, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.5, py: 0.35, bl: 95 }),
      pose({ ...SG, torso: 24, nu: 28, nl: -6, nt: 30, ns: -24, ft: -18, fs: -10, px: 0.6, py: 0.4, bl: 45 }),
      pose({ ...SG, torso: 12, nu: 26, nl: 56, nt: 10, ft: -10, px: 0.2, bl: 135 }),
    ],
    [Anim.Hit]: hitKeys(SG),
    [Anim.Die]: SERGEANT_DIE,
    [Anim.Dead]: deadKey(SERGEANT_DIE),
    // Shield wall: crouched behind the kite held square, the blade levelled over the rim.
    [Anim.Brace]: [
      pose({ torso: 14, head: -2, py: 0.55, px: 0.15, nt: 28, ns: -34, ft: -26, fs: -4, fu: 66, fl: 22, nu: 56, nl: 40, bl: 100 }),
      pose({ torso: 15, head: 0, py: 0.68, px: 0.15, nt: 28, ns: -36, ft: -26, fs: -6, fu: 64, fl: 24, nu: 58, nl: 38, bl: 98 }),
    ],
  },
  secondary(out, anim, fr, n, k0, raw) {
    footSecondary(out, anim, fr, n);
    out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.35 ? 225 : anim === Anim.Attack && k0 === 1 && raw < 0.5 ? 120 : null;
  },
};
const sergeantGear: Gear = {
  far: (c, r) => kite(c, addP(r.handF, [0.85, 0.3]), -6 + r.tilt * 0.5, r.back),
  near: (c, r) => {
    if (r.p.smear !== null) c.smear(r.handN, r.p.smear + r.tilt, r.p.bl + r.tilt, 1.3, 5.6, TM.steel);
    sword(c, r.handN, r.p.bl + r.tilt);
  },
};

// ------------------------------------------------------------------ 1 Spear Levy

const SP = { nu: 14, nl: 72, fu: 28, fl: 50, bl: 180 };
const SPEAR_DIE = dieKeys({ ...SP, bl: 230 });
const SPEAR_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(SP), pose({ ...SP, py: 0.12 })],
    [Anim.Walk]: legs(SP, WALK_LEGS),
    // Charging with the spear levelled at the hip.
    [Anim.Run]: legs({ nu: -10, nl: 92, fu: 40, fl: 40, bl: 96 }, RUN_LEGS),
    [Anim.Attack]: [
      pose({ ...SP, torso: -4, nu: -28, nl: 112, ft: -16, bl: 92 }),
      pose({ ...SP, torso: 18, nu: 58, nl: 26, nt: 30, ns: -26, ft: -18, fs: -8, px: 0.6, py: 0.3, bl: 88 }),
      pose({ ...SP, torso: 20, nu: 70, nl: 16, nt: 30, ns: -26, ft: -18, fs: -8, px: 0.7, py: 0.35, bl: 86 }),
      pose({ ...SP, torso: 10, nu: 10, nl: 80, nt: 10, ft: -10, px: 0.2, bl: 100 }),
    ],
    [Anim.Hit]: hitKeys(SP),
    [Anim.Die]: SPEAR_DIE,
    [Anim.Dead]: deadKey(SPEAR_DIE),
    // Spear wall: crouched, the shield forward, the spear levelled low over its rim.
    [Anim.Brace]: [
      pose({ torso: 18, py: 0.6, px: 0.2, nt: 30, ns: -36, ft: -28, fs: -4, nu: 0, nl: 88, fu: 62, fl: 24, bl: 84 }),
      pose({ torso: 19, py: 0.72, px: 0.2, nt: 30, ns: -38, ft: -28, fs: -6, nu: 0, nl: 88, fu: 60, fl: 26, bl: 84 }),
    ],
  },
  secondary: footSecondary,
};
const spearGear: Gear = {
  far: (c, r) => round(c, addP(r.handF, [0.75, 0.15]), 1.7, r.back),
  near: (c, r) => {
    const deg = r.p.bl + r.tilt;
    spear(c, r.handN, deg, deg > 150 ? 12.5 : 10.5, deg > 150 ? (c.L <= 1 ? 4.4 : 6.2) : 4.0, { head: 1.6 });
  },
};

// ------------------------------------------------------------------ 2 Javelin Men

const JV = { nu: 12, nl: 60, fu: 22, fl: 60, bl: 160, sw: 1 };
const JAV_DIE = dieKeys({ ...JV, sw: 0 });
const JAVELIN_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(JV), pose({ ...JV, py: 0.12 })],
    [Anim.Walk]: legs(JV, WALK_LEGS),
    [Anim.Run]: legs({ ...JV, nu: 30, fu: 36, bl: 120 }, RUN_LEGS),
    // A stab with the javelin.
    [Anim.Attack]: [
      pose({ ...JV, torso: -2, nu: -20, nl: 105, bl: 95 }),
      pose({ ...JV, torso: 18, nu: 62, nl: 22, nt: 26, ns: -22, ft: -16, px: 0.5, bl: 88 }),
      pose({ ...JV, torso: 20, nu: 70, nl: 14, nt: 26, ns: -22, ft: -16, px: 0.55, bl: 86 }),
      pose({ ...JV, torso: 8, nu: 14, nl: 64, bl: 140 }),
    ],
    // The throw: the arm cocked behind the head, a step, the cast, follow-through, a new javelin.
    [Anim.Shoot]: [
      pose({ ...JV }),
      pose({ ...JV, torso: -8, head: -4, nu: 205, nl: -55, bl: 100, nt: -6, ft: -22, px: -0.2 }),
      pose({ ...JV, torso: -10, nu: 215, nl: -60, bl: 98, nt: 20, ns: -10, ft: -24, px: -0.1 }),
      pose({ ...JV, torso: 22, nu: 120, nl: 0, bl: 110, sw: 0, nt: 26, ns: -20, ft: -20, fs: -10, px: 0.6, py: 0.3 }),
      pose({ ...JV, torso: 24, nu: 70, nl: 10, sw: 0, nt: 26, ns: -20, ft: -20, px: 0.6, py: 0.3 }),
      pose({ ...JV, torso: 10, sw: 1 }),
    ],
    [Anim.Hit]: hitKeys(JV),
    [Anim.Die]: JAV_DIE,
    [Anim.Dead]: deadKey(JAV_DIE),
    [Anim.Brace]: [
      pose({ ...JV, torso: 14, py: 0.5, nt: 26, ns: -30, ft: -24, fs: -4, nu: 205, nl: -55, bl: 100 }),
      pose({ ...JV, torso: 15, py: 0.62, nt: 26, ns: -32, ft: -24, fs: -6, nu: 205, nl: -55, bl: 100 }),
    ],
  },
  secondary: footSecondary,
};
const javelinGear: Gear = {
  // The spare javelins: a fan held upright in the shield hand, behind a small buckler.
  far: (c, r) => {
    for (const d of [-14, 0, 14]) spear(c, r.handF, 180 + d * 0.5 + r.tilt, 6.4, 1.6, { head: 0.9, w: 0.22 });
    round(c, addP(r.handF, [0.55, 0.2]), 1.05, r.back);
  },
  near: (c, r) => {
    if (r.p.sw > 0.5 || r.p.tilt !== 0) spear(c, r.handN, r.p.bl + r.tilt, 4.6, 2.2, { head: 1.0, w: 0.24 });
  },
};

// ------------------------------------------------------------------ 3 Pilgrim Archers

const AR = { nu: 14, nl: 40, fu: 8, fl: 22, bl: 180, sw: 0 };
const ARCHER_DIE = dieKeys(AR);
const ARCHER_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(AR), pose({ ...AR, py: 0.12 })],
    [Anim.Walk]: legs(AR, WALK_LEGS),
    [Anim.Run]: legs({ ...AR, fu: 30, fl: 30 }, RUN_LEGS),
    // A cut with the long knife.
    [Anim.Attack]: [
      pose({ ...AR, torso: -2, nu: 150, nl: 40, bl: 220 }),
      pose({ ...AR, torso: 18, nu: 72, nl: 12, nt: 26, ns: -22, ft: -16, px: 0.45, bl: 100 }),
      pose({ ...AR, torso: 20, nu: 34, nl: 0, nt: 26, ns: -22, ft: -16, px: 0.5, bl: 50 }),
      pose({ ...AR, torso: 8, nu: 20, nl: 50, bl: 150 }),
    ],
    // Nock, raise and draw to the cheek, hold, loose, recover. `sw` is the draw.
    [Anim.Shoot]: [
      pose({ ...AR }),
      pose({ ...AR, torso: 4, fu: 70, fl: 10, nu: 60, nl: 60, sw: 0.2 }),
      pose({ ...AR, torso: 2, fu: 86, fl: 0, nu: 100, nl: 170, sw: 1, head: 4 }),
      pose({ ...AR, torso: 2, fu: 86, fl: 0, nu: 100, nl: 172, sw: 1, head: 4 }),
      pose({ ...AR, torso: 0, fu: 86, fl: 0, nu: 98, nl: 200, sw: 0, head: 2 }),
      pose({ ...AR, torso: 6, fu: 40, fl: 20, nu: 30, nl: 60, sw: 0 }),
    ],
    [Anim.Hit]: hitKeys(AR),
    [Anim.Die]: ARCHER_DIE,
    [Anim.Dead]: deadKey(ARCHER_DIE),
    // Stakes set, an arrow on the string, the bow half raised.
    [Anim.Brace]: [
      pose({ ...AR, torso: 10, py: 0.3, nt: 20, ns: -20, ft: -20, fu: 62, fl: 10, nu: 60, nl: 80, sw: 0.25 }),
      pose({ ...AR, torso: 11, py: 0.4, nt: 20, ns: -22, ft: -20, fu: 62, fl: 10, nu: 60, nl: 80, sw: 0.25 }),
    ],
  },
  secondary: footSecondary,
};
const archerGear: Gear = {
  back: (c, r) => {
    // (At 13 px the quiver is a stray dark pixel on the lit side: it starts at level 2.)
    if (c.L >= 2) quiver(c, at(r.T, r.back ? 0.3 : -0.9, 0.6), r.back ? 200 : 160);
  },
  far: (c, r) => {
    const draw = r.p.sw;
    const nock: P2 | null = draw > 0.15 ? r.handN : null;
    // At rest the stave leans forward in the hand (a diagonal, not a second vertical
    // beside the body); drawn, it stands upright.
    bow(c, r.handF, 180 - 18 * (1 - draw) + r.tilt, 12.6, draw, nock);
    if (draw > 0.15) arrow(c, r.handN, 90 + r.tilt, 5.0);
  },
  near: (c, r) => {
    if (r.p.sw <= 0.15 && r.p.tilt === 0 && r.p.bl !== 180) sword(c, r.handN, r.p.bl + r.tilt, 3.4);
  },
};

// ------------------------------------------------------------------ 4 Genoese Crossbows

const XB = { nu: 20, nl: 58, fu: 30, fl: 52, bl: 128, sw: 1 };
const XBOW_DIE = dieKeys({ ...XB, sw: 0 });
const XBOW_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(XB), pose({ ...XB, py: 0.12 })],
    [Anim.Walk]: legs(XB, WALK_LEGS),
    [Anim.Run]: legs({ ...XB, bl: 118 }, RUN_LEGS),
    // A blow with the crossbow's stock.
    [Anim.Attack]: [
      pose({ ...XB, torso: -4, nu: 150, nl: 40, fu: 140, fl: 40, bl: 200 }),
      pose({ ...XB, torso: 18, nu: 70, nl: 10, fu: 70, fl: 20, px: 0.5, nt: 26, ns: -22, ft: -16, bl: 110 }),
      pose({ ...XB, torso: 20, nu: 50, nl: 10, fu: 50, fl: 20, px: 0.55, nt: 26, ns: -22, ft: -16, bl: 70 }),
      pose({ ...XB, torso: 8 }),
    ],
    // Raise and aim, loose, lower, foot in the stirrup to span, up again.
    [Anim.Shoot]: [
      pose({ ...XB }),
      pose({ ...XB, torso: 2, nu: 70, nl: 20, fu: 64, fl: 32, bl: 92, head: 4 }),
      pose({ ...XB, torso: -3, nu: 66, nl: 22, fu: 60, fl: 34, bl: 96, sw: 0, px: -0.15 }),
      pose({ ...XB, torso: 28, nu: 30, nl: -10, fu: 30, fl: -10, bl: 10, sw: 0, py: 0.4, nt: 30, ns: -40 }),
      pose({ ...XB, torso: 24, nu: 40, nl: 0, fu: 40, fl: 0, bl: 10, sw: 1, py: 0.35, nt: 30, ns: -40 }),
      pose({ ...XB }),
    ],
    [Anim.Hit]: hitKeys(XB),
    [Anim.Die]: XBOW_DIE,
    [Anim.Dead]: deadKey(XBOW_DIE),
    // Behind the planted pavise, kneeling, the crossbow levelled over it.
    [Anim.Brace]: [
      pose({ torso: 10, py: 1.6, nt: 80, ns: -100, ft: -10, fs: -80, nu: 66, nl: 20, fu: 60, fl: 30, bl: 92, sw: 1 }),
      pose({ torso: 11, py: 1.7, nt: 80, ns: -100, ft: -10, fs: -80, nu: 66, nl: 20, fu: 60, fl: 30, bl: 92, sw: 1 }),
    ],
  },
  secondary: footSecondary,
};
/** The pavise slung high on the back (its painted top stands over the hat), or planted in Brace. */
function xbowGear(anim: Anim): Gear {
  const planted = anim === Anim.Brace;
  return {
    back: planted ? undefined : (c, r) => pavise(c, at(r.T, r.back ? 0.1 : -0.7, 1.0), r.tor + (r.back ? 6 : -6), !r.back, 1),
    first: planted ? (c, r) => { if (r.back) pavise(c, [3.2, -3.0], 0, true, 0.95); } : undefined,
    near: (c, r) => {
      crossbow(c, r.handN, r.p.bl + r.tilt, r.p.sw);
      if (planted && !r.back) pavise(c, [3.2, -3.0], 0, false, 0.95);
    },
  };
}

// ------------------------------------------------------------------ 8 Iron Brethren

const IB = { nu: 16, nl: 66, fu: 30, fl: 64, bl: 158 };
const BRETH_DIE = dieKeys({ ...IB, bl: 250 });
const BRETHREN_KEYS: KeySet<FootPose> = {
  poses: {
    // The axe held at the port, haft across the body, the great head high and forward.
    [Anim.Idle]: [pose(IB), pose({ ...IB, py: 0.12 })],
    [Anim.Walk]: legs(IB, WALK_LEGS),
    [Anim.Run]: legs({ ...IB, nu: 40, nl: 70, fu: 50, fl: 60, bl: 150 }, RUN_LEGS),
    // A two-handed overhead cut: wound up behind, down through the target, overshoot, recover.
    [Anim.Attack]: [
      pose({ ...IB, torso: -8, head: -6, nu: 175, nl: 20, fu: 170, fl: 20, ft: -16, bl: 240 }),
      pose({ ...IB, torso: 22, nu: 92, nl: 0, fu: 88, fl: 6, nt: 30, ns: -26, ft: -20, fs: -10, px: 0.55, py: 0.4, bl: 82 }),
      pose({ ...IB, torso: 30, nu: 50, nl: -4, fu: 48, fl: 0, nt: 30, ns: -26, ft: -20, fs: -10, px: 0.65, py: 0.5, bl: 30 }),
      pose({ ...IB, torso: 12, nu: 40, nl: 70, fu: 46, fl: 60, nt: 10, ft: -10, px: 0.2, bl: 160 }),
    ],
    [Anim.Hit]: hitKeys(IB),
    [Anim.Die]: BRETH_DIE,
    [Anim.Dead]: deadKey(BRETH_DIE),
    // Ready: feet set wide, the axe held across the body, the head forward and high.
    [Anim.Brace]: [
      pose({ torso: 12, py: 0.45, nt: 26, ns: -28, ft: -24, fs: -4, nu: 40, nl: 70, fu: 56, fl: 60, bl: 140 }),
      pose({ torso: 13, py: 0.56, nt: 26, ns: -30, ft: -24, fs: -6, nu: 40, nl: 70, fu: 56, fl: 60, bl: 140 }),
    ],
  },
  secondary(out, anim, fr, n, k0, raw) {
    footSecondary(out, anim, fr, n);
    out.smear = anim === Anim.Attack && k0 === 0 && raw > 0.4 ? 240 : anim === Anim.Attack && k0 === 1 && raw < 0.5 ? 140 : null;
  },
};
const brethrenGear: Gear = {
  near: (c, r) => daneAxe(c, r.handN, r.p.bl + r.tilt, r.p.smear === null ? null : r.p.smear + r.tilt),
};

// ------------------------------------------------------------------ foot registration

function foot(kind: number, kit: Kit, keys: KeySet<FootPose>, gear: (anim: Anim) => Gear): void {
  register<FootPose>('templar', kind, {
    body: 'foot',
    keys,
    draw: (c: Paper, p: FootPose, facing: Facing, anim: Anim) => {
      paintAs(c, kit.coat !== TM.white, () => man(c, p, facing, kit, gear(anim)));
    },
  });
}
foot(U.HeavyInfantry, SERGEANT, SERGEANT_KEYS, () => sergeantGear);
foot(U.Spearmen, LEVY, SPEAR_KEYS, () => spearGear);
foot(U.Skirmishers, JAVELIN, JAVELIN_KEYS, () => javelinGear);
foot(U.Archers, ARCHER, ARCHER_KEYS, () => archerGear);
foot(U.Crossbowmen, XBOW, XBOW_KEYS, xbowGear);
foot(U.Shock, BRETHREN, BRETHREN_KEYS, () => brethrenGear);

// ------------------------------------------------------------------ horsemen

const hp = poser(HORSE0);

/** The horse's gaits, shared: stand, four-beat walk, gallop, the trot for Brace. */
const H_STAND: Partial<HorsePose> = { ffu: 3, hfu: -4, neck: 35, tail: 20 };
const H_WALK: Partial<HorsePose>[] = [
  { fnu: 18, fnl: 0, ffu: -12, ffl: 30, hnu: -15, hnl: 0, hfu: 14, hfl: -10, py: 0 },
  { fnu: 2, fnl: 0, ffu: 10, ffl: 10, hnu: -5, hnl: 0, hfu: 0, hfl: 0, py: -0.15 },
  { fnu: -12, fnl: 30, ffu: 18, ffl: 0, hnu: 14, hnl: -10, hfu: -15, hfl: 0, py: 0 },
  { fnu: 10, fnl: 10, ffu: 2, ffl: 0, hnu: 0, hnl: 0, hfu: -5, hfl: 0, py: -0.15 },
];
const H_GALLOP: Partial<HorsePose>[] = [
  { fnu: 45, fnl: -10, ffu: 35, ffl: 0, hnu: -40, hnl: 10, hfu: -30, hfl: 5, pitch: 0, py: -0.6, neck: 52, tail: 40 },
  { fnu: 10, fnl: 0, ffu: -10, ffl: 40, hnu: -20, hnl: 0, hfu: 0, hfl: 0, pitch: -3, py: 0, neck: 45, tail: 30 },
  { fnu: -25, fnl: 80, ffu: -20, ffl: 70, hnu: 30, hnl: -10, hfu: 35, hfl: -15, pitch: 0, py: -0.8, neck: 40, tail: 35 },
  { fnu: 20, fnl: 40, ffu: 10, ffl: 50, hnu: 20, hnl: 0, hfu: 10, hfl: 0, pitch: 4, py: -0.3, neck: 45, tail: 30 },
];
const H_TROT: Partial<HorsePose>[] = [
  { fnu: 22, fnl: 30, ffu: -6, ffl: 0, hnu: -8, hnl: 0, hfu: 18, hfl: -14, py: -0.3, neck: 40 },
  { fnu: -6, fnl: 0, ffu: 22, ffl: 30, hnu: 18, hnl: -14, hfu: -8, hfl: 0, py: -0.3, neck: 40 },
];
const H_RIDER_RUN: Partial<HorsePose> = { torso: 18, head: -6 };

interface RiderSet {
  rest: Partial<HorsePose>;
  run?: Partial<HorsePose>;
  attack: Partial<HorsePose>[];
  shoot?: Partial<HorsePose>[];
  brace?: Partial<HorsePose>;
}

function horseKeys(r: RiderSet): KeySet<HorsePose> {
  const g = (gait: Partial<HorsePose>[], rider: Partial<HorsePose>) => gait.map((k) => hp({ ...H_STAND, ...rider, ...k }));
  const die = [
    hp({ ...H_STAND, ...r.rest, pitch: 10, neck: 58, torso: -16, head: -14 }),
    hp({ ...r.rest, fnu: -30, fnl: 110, ffu: -25, ffl: 100, hnu: 10, hnl: -20, hfu: 10, hfl: -20, py: 2.0, pitch: -6, neck: 60, nod: 10, torso: -20, tilt: -30 }),
    hp({ ...r.rest, fnu: 70, fnl: 10, ffu: 60, ffl: 20, hnu: 60, hnl: 10, hfu: 55, hfl: 20, py: 4.3, pitch: -3, neck: 92, nod: 30, tail: 70, apart: 1 }),
    hp({ ...r.rest, fnu: 82, fnl: 6, ffu: 70, ffl: 16, hnu: 72, hnl: 6, hfu: 64, hfl: 16, py: 4.6, pitch: -2, neck: 100, nod: 38, tail: 80, apart: 1 }),
  ];
  return {
    poses: {
      [Anim.Idle]: [hp({ ...H_STAND, ...r.rest }), hp({ ...H_STAND, ...r.rest, py: 0.1, tail: 26 })],
      [Anim.Walk]: g(H_WALK, r.rest),
      [Anim.Run]: g(H_GALLOP, { ...r.rest, ...H_RIDER_RUN, ...(r.run ?? {}) }),
      [Anim.Attack]: r.attack.map((k) => hp({ ...H_STAND, ...r.rest, ...k })),
      ...(r.shoot ? { [Anim.Shoot]: r.shoot.map((k) => hp({ ...H_STAND, ...r.rest, ...k })) } : {}),
      [Anim.Hit]: [hp({ ...H_STAND, ...r.rest }), hp({ ...H_STAND, ...r.rest, pitch: 8, neck: 52, torso: -12, head: -14, ffu: 20, fnu: 25 }), hp({ ...H_STAND, ...r.rest, pitch: 2, neck: 40 })],
      [Anim.Die]: die,
      [Anim.Dead]: [die.at(-1)!],
      [Anim.Brace]: g(H_TROT, { ...r.rest, ...(r.brace ?? {}) }),
    },
    secondary(out, anim, fr, n) {
      out.sway = anim === Anim.Run ? swing(fr, n, 0.5, 1.5, 4) : anim === Anim.Walk ? swing(fr, n, 0.25, 1.5, 2) : 0;
    },
  };
}

/** A rider on his horse; when thrown (apart), he lies on the ground in front of the fallen horse. */
function mounted(c: Paper, p: HorsePose, facing: Facing, kit: Kit, hk: HorseKit, gear: Gear): void {
  const back = isBack(facing);
  horse(c, p, facing, hk, 'far');
  if (p.apart >= 0.5) {
    horse(c, p, facing, hk, 'body');
    const lying: FootPose = { ...FOOT0, tilt: -84, torso: -4, head: 30, nu: 110, nl: 0, fu: 80, fl: 10, nt: 20, ns: -14, ft: 12, fs: -16, py: 0, px: 0, sway: 0, smear: null, apart: 0, bl: 250, sw: 0 };
    man(c, lying, facing, kit, { far: gear.far, near: gear.near }, { pelvis: [back ? -3 : 6.5, -6.5], pivot: [back ? -3 : 6.5, 0.6] });
    return;
  }
  const h = horse(c, p, facing, hk, 'body');
  const rider: FootPose = { ...p, px: 0, py: 0 };
  man(c, rider, facing, kit, gear, { pelvis: h.seat, pivot: h.seat, seated: true });
}

// 5 Turcopoles: a light lance with a pennon and a round shield; a dun horse.
const TC_REST: Partial<HorsePose> = { nu: 16, nl: 74, fu: 30, fl: 40, bl: 176 };
const TURCOPOLE_KEYS = horseKeys({
  rest: TC_REST,
  run: { nu: -6, nl: 96, bl: 92 },
  attack: [
    { ...TC_REST, torso: -6, nu: -30, nl: 120, bl: 94 },
    { ...TC_REST, torso: 18, nu: 66, nl: 20, bl: 86, pitch: -3, fnu: 20 },
    { ...TC_REST, torso: 22, nu: 76, nl: 12, bl: 84, pitch: -3, fnu: 20 },
    { ...TC_REST, torso: 8, nu: 10, nl: 82, bl: 100 },
  ],
  brace: { nu: -6, nl: 96, bl: 90, torso: 12 },
});
const turcopoleGear: Gear = {
  far: (c, r) => round(c, addP(r.handF, [0.7, 0.2]), 1.55, r.back),
  near: (c, r) => {
    const deg = r.p.bl + r.tilt;
    spear(c, r.handN, deg, deg > 150 ? 12.0 : 10.5, deg > 150 ? 3.5 : 3.5, { head: 1.3, pennon: deg > 150 ? r.p.sway : 0.5, w: 0.28 });
  },
};

// 6 Turcopole Archers: the bow held low in the shield hand, a quiver at the hip; a bay horse.
const HA_REST: Partial<HorsePose> = { nu: 20, nl: 50, fu: 22, fl: 30, sw: 0, bl: 180 };
const HORSE_ARCHER_KEYS = horseKeys({
  rest: HA_REST,
  attack: [
    { ...HA_REST, torso: -2, nu: 150, nl: 40, bl: 220 },
    { ...HA_REST, torso: 16, nu: 74, nl: 10, bl: 100, pitch: -2 },
    { ...HA_REST, torso: 18, nu: 34, nl: 0, bl: 50, pitch: -2 },
    { ...HA_REST, torso: 6, bl: 150 },
  ],
  shoot: [
    { ...HA_REST },
    { ...HA_REST, fu: 70, fl: 10, nu: 60, nl: 60, sw: 0.2 },
    { ...HA_REST, fu: 86, fl: 0, nu: 100, nl: 170, sw: 1, head: 4, torso: 4 },
    { ...HA_REST, fu: 86, fl: 0, nu: 100, nl: 172, sw: 1, head: 4, torso: 4 },
    { ...HA_REST, fu: 86, fl: 0, nu: 98, nl: 200, sw: 0 },
    { ...HA_REST, fu: 40, fl: 20, nu: 30, nl: 60, sw: 0 },
  ],
  brace: { fu: 62, fl: 10, nu: 60, nl: 80, sw: 0.25 },
});
const horseArcherGear: Gear = {
  back: (c, r) => quiver(c, at(r.T, r.back ? 0.6 : -1.0, 3.4), r.back ? 230 : 130),
  far: (c, r) => {
    const draw = r.p.sw;
    bow(c, r.handF, 180 - 8 * draw + r.tilt, 8.4, draw, draw > 0.15 ? r.handN : null);
    if (draw > 0.15) arrow(c, r.handN, 90 + r.tilt, 4.2);
  },
  near: (c, r) => {
    if (r.p.sw <= 0.15 && r.p.bl !== 180) sword(c, r.handN, r.p.bl + r.tilt, 3.8);
  },
};

// 7 Knight-Brothers: the lance held high at rest, couched at the charge; kite shield; the trapper.
const KN_REST: Partial<HorsePose> = { nu: 24, nl: 56, fu: 34, fl: 46, bl: 135 };
const KNIGHT_KEYS = horseKeys({
  rest: KN_REST,
  run: { nu: -14, nl: 104, bl: 90, torso: 16 },
  attack: [
    { ...KN_REST, torso: 6, nu: -14, nl: 104, bl: 92 },
    { ...KN_REST, torso: 22, nu: 30, nl: 64, bl: 88, pitch: -4, fnu: 25, px: 0.4 },
    { ...KN_REST, torso: 26, nu: 40, nl: 54, bl: 86, pitch: -4, fnu: 25, px: 0.5 },
    { ...KN_REST, torso: 10, nu: 0, nl: 90, bl: 110 },
  ],
  brace: { nu: -14, nl: 104, bl: 90, torso: 10 },
});
const knightGear: Gear = {
  far: (c, r) => kite(c, addP(r.handF, [0.8, 0.3]), -8, r.back, 0.92, 0.82, true),
  near: (c, r) => {
    const deg = r.p.bl + r.tilt;
    spear(c, r.handN, deg, deg > 120 ? 11.0 : 11.5, deg > 120 ? 3.2 : 4.5, { head: 1.1, w: 0.36 });
  },
};

// 10 The Marshal: the Beauséant in the shield hand, the sword in the other.
const MS_REST: Partial<HorsePose> = { nu: 20, nl: 62, fu: 30, fl: 120, bl: 135 };
const MARSHAL_KEYS = horseKeys({
  rest: MS_REST,
  run: { fu: 40, fl: 110, bl: 120 },
  attack: [
    { ...MS_REST, torso: -4, nu: 165, nl: 30, bl: 225 },
    { ...MS_REST, torso: 20, nu: 75, nl: 10, bl: 95, pitch: -3 },
    { ...MS_REST, torso: 24, nu: 28, nl: -6, bl: 45, pitch: -3 },
    { ...MS_REST, torso: 10, nu: 26, nl: 56, bl: 135 },
  ],
});
function marshalGear(fr: number, anim: Anim): Gear {
  const flap = anim === Anim.Run ? 1 : 0.35;
  return {
    far: (c, r) => beauseant(c, r.handF, 180 + r.tilt, flap, anim === Anim.Run ? fr : 0),
    near: (c, r) => sword(c, r.handN, r.p.bl + r.tilt),
  };
}

function horseman(kind: number, kit: Kit, hk: HorseKit, keys: KeySet<HorsePose>, gear: (anim: Anim, fr: number) => Gear): void {
  register<HorsePose>('templar', kind, {
    body: 'horse',
    keys,
    draw: (c: Paper, p: HorsePose, facing: Facing, anim: Anim, fr: number) => paintAs(c, kit.coat !== TM.white, () => mounted(c, p, facing, kit, hk, gear(anim, fr))),
  });
}
horseman(U.LightCavalry, TURCOPOLE, { coat: TM.bay }, TURCOPOLE_KEYS, () => turcopoleGear);
horseman(U.HorseArchers, HORSE_ARCHER, { coat: TM.mane, cloth: true }, HORSE_ARCHER_KEYS, () => horseArcherGear);
horseman(U.Knights, KNIGHT, { coat: TM.grey, capar: TM.white, scale: 1.06 }, KNIGHT_KEYS, () => knightGear);
horseman(COMMANDER_KIND, MARSHAL, { coat: TM.grey, capar: TM.white, scale: 1.06 }, MARSHAL_KEYS, (a, fr) => marshalGear(fr, a));

// ------------------------------------------------------------------ 9 the Mangonel

const ep = poser(ENGINE0);
const E_REST: Partial<EnginePose> = { arm: 315, sling: -45, load: 1, crew: 0 };
const ENGINE_DIE = [
  ep({ ...E_REST, recoil: 0.5, tilt: 0 }),
  ep({ ...E_REST, arm: 300, recoil: 1, tilt: -6, crew: 0.6, apart: 0.5 }),
  ep({ ...E_REST, arm: 285, sling: 0, tilt: -14, crew: 1, apart: 1, load: 0 }),
];
const ENGINE_KEYS: KeySet<EnginePose> = {
  poses: {
    [Anim.Idle]: [ep(E_REST), ep({ ...E_REST, lean: 0.1 })],
    [Anim.Walk]: [ep({ ...E_REST, crew: 0 }), ep({ ...E_REST, crew: 0.25 }), ep({ ...E_REST, crew: 0.5 }), ep({ ...E_REST, crew: 0.75 })],
    [Anim.Run]: [ep({ ...E_REST, crew: 0 }), ep({ ...E_REST, crew: 0.25 }), ep({ ...E_REST, crew: 0.5 }), ep({ ...E_REST, crew: 0.75 })],
    // The crew stand to the engine with their weapons.
    [Anim.Attack]: [ep({ ...E_REST, lean: 0 }), ep({ ...E_REST, lean: 1 }), ep({ ...E_REST, lean: 0.4 })],
    // The throw: the crew haul down, the long arm swings up and over, the sling whips and lets go.
    [Anim.Shoot]: [
      ep({ ...E_REST }),
      ep({ ...E_REST, arm: 270, sling: -50, crew: 0.5, lean: 0.4 }),
      ep({ ...E_REST, arm: 210, sling: -30, crew: 1, lean: 0.8 }),
      ep({ ...E_REST, arm: 165, sling: 70, load: 0, crew: 1, lean: 1, recoil: 0.6 }),
      ep({ ...E_REST, arm: 172, sling: 140, load: 0, crew: 0.8, lean: 0.6, recoil: 0.3 }),
      ep({ ...E_REST, arm: 280, sling: -20, load: 0, crew: 0.2 }),
      ep({ ...E_REST }),
    ],
    [Anim.Hit]: [ep(E_REST), ep({ ...E_REST, recoil: 1.2, lean: -0.6 }), ep({ ...E_REST, recoil: 0.4 })],
    [Anim.Die]: ENGINE_DIE,
    [Anim.Dead]: [ENGINE_DIE.at(-1)!],
    [Anim.Brace]: [ep(E_REST), ep({ ...E_REST, lean: 0.1 })],
  },
};

/** A crewman's pose from the engine's state. */
function crewPose(e: EnginePose, anim: Anim, role: 'pull' | 'load', i: number): FootPose {
  if (anim === Anim.Die || anim === Anim.Dead) {
    const k = e.apart;
    return pose({ tilt: -88 * k * (i % 2 ? 1 : -1) * -1, torso: -6, head: 20 * k, nu: 30 + 60 * k, nl: 30, fu: 30 + 50 * k, fl: 40, nt: 20, ns: -30 * k, ft: 10, fs: -20, py: 2.2 * k });
  }
  if (anim === Anim.Walk || anim === Anim.Run) {
    const ph = (e.crew + i * 0.5) % 1;
    const w = WALK_LEGS[Math.floor(ph * 4) % 4]!;
    return pose({ ...w, nu: 20, nl: 40, fu: 20, fl: 40 });
  }
  if (role === 'pull') {
    // Arms up on the rope, then hauling down and leaning back.
    const k = e.crew;
    return pose({ torso: -4 - 16 * k, head: -6 * k, nu: 165 - 110 * k, nl: 15 + 20 * k, fu: 160 - 100 * k, fl: 15 + 20 * k, nt: 18 + 10 * k, ns: -24 - 20 * k, ft: -20, fs: -6, py: 0.6 * k, px: -0.4 * k });
  }
  const l = e.lean;
  return pose({ torso: 18 + 10 * l, nu: 60 + 30 * l, nl: 40, fu: 50 + 30 * l, fl: 40, nt: 20, ns: -24, ft: -18, py: 0.3 });
}

function engine(c: Paper, e: EnginePose, facing: Facing, anim: Anim): void {
  const back = isBack(facing);
  const crewAt = (x: number, role: 'pull' | 'load', i: number) => {
    const p = crewPose(e, anim, role, i);
    p.px += x;
    const gear: Gear = anim === Anim.Attack && role === 'load' ? { near: (cc, r) => sword(cc, r.handN, 120 + e.lean * 40) } : {};
    man(c, p, facing, CREW, gear, { pivot: [x, 0] });
  };
  // Behind the engine (from the front): the loader at the sling end.
  if (!back) crewAt(-6.8, 'load', 1);
  else crewAt(5.6, 'pull', 0);
  trebuchet(c, e, back);
  // In front of it: the pullers under the short arm (from the front), the loader (from behind).
  if (!back) {
    crewAt(5.6, 'pull', 0);
    crewAt(7.6, 'pull', 2);
  } else {
    crewAt(7.6, 'pull', 2);
    crewAt(-6.8, 'load', 1);
  }
}
register<EnginePose>('templar', U.Artillery, {
  body: 'engine',
  keys: ENGINE_KEYS,
  draw: (c: Paper, p: EnginePose, facing: Facing, anim: Anim) => paintAs(c, true, () => engine(c, p, facing, anim)),
});

export type { Rig };

// The kinds rebuilt on bones from the approved key art (templar-foot.ts) replace their pose-rig
// figures above.
registerFootRigs([0, 1, 2, 3, 4, 8]);
registerHorseRigs([5, 6, 7, 10]);
registerEngineRig(9);
