// The Samurai clans on paper. Owned by the samurai faction agent; see README.md.
//
// Eleven Sengoku figures, built from the parts in samurai-parts.ts: Katana Samurai, Yari
// Ashigaru, Nage-yari Skirmishers, Yumi Ashigaru, Teppō Ashigaru, Yari Cavalry, Yabusame
// Archers, Hatamoto Horse, Sōhei Warrior Monks, the Ōzutsu Bombard and the Daimyō. Each has one
// signature silhouette for the zoomed-out read (horns and sashimono, the long yari upright, the
// javelin fan, the tall yumi, the shouldered teppō, the upright cavalry yari, the flat kasa and
// bow, the horo, the naginata and cowl, the low bronze gun, the crescent and horo).
// References: Met gusoku and kabuto, jingasa, matchlock, gunbai, jinbaori and saddle; Kuniyoshi
// and Yoshitsuna battle prints; Shogun 2, Ghost of Tsushima, Sekiro; see
// docs/art-references/hd-sprites.md ("Samurai on paper").

import { COMMANDER_KIND, Anim } from '../contract.ts';
import { U } from '../../../game/units.ts';
import { addP, DEG, rot, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { registerFootRigs } from './samurai-rig.ts';
import { along, ENGINE0, FOOT0, HORSE0, limb, poseAt, poser, settle, swing, type EnginePose, type FootPose, type HorsePose, type KeySet } from './rig.ts';
import {
  ARM_L, ARM_U, CREW, drawMan, FIRE, flash, gunbai, horse, javelin, katana, leg, manRig, mul, naginata, ozutsu, SM, smoke, teppo, yari, yumi,
  type Coat, type Held, type Kit, type ManRig,
} from './samurai-parts.ts';

// ------------------------------------------------------------------ kits

const SAMURAI: Kit = { head: 'kabuto', crest: 'kuwagata', mask: true, body: 'gusoku', sode: true, back: 'sashimono', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate', sword: true };
const YARI_ASHIGARU: Kit = { head: 'jingasa', body: 'okegawa', back: 'sashimono', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const SKIRMISHER: Kit = { head: 'hachimaki', body: 'happi', back: 'javelins', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const ARCHER: Kit = { head: 'hachimaki', body: 'okegawa', back: 'none', quiver: true, sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const GUNNER: Kit = { head: 'jingasa', body: 'okegawa', back: 'none', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };
const SOHEI: Kit = { head: 'kato', body: 'robe', back: 'none', sleeve: SM.black, legs: SM.black, shin: 'robe' };
const DAIMYO: Kit = { head: 'kabuto', crest: 'crescent', mask: true, body: 'gusoku', sode: true, back: 'horo', jinbaori: true, sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate', sword: true };
const YARI_RIDER: Kit = { head: 'kabuto', crest: 'none', mask: false, body: 'okegawa', sode: true, back: 'sashimono', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' };
const YABUSAME: Kit = { head: 'kasa', body: 'okegawa', back: 'none', quiver: true, sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' };
const HATAMOTO: Kit = { head: 'kabuto', crest: 'kuwagata', mask: true, body: 'gusoku', sode: true, back: 'horo', sleeve: SM.indigo, legs: SM.indigo, shin: 'suneate' };

// ------------------------------------------------------------------ poses shared by the foot

// Feet apart and weight settled (Shogun 2's ashigaru, Kuniyoshi's warriors), not standing to attention.
const pose = poser<FootPose>({ ...FOOT0, torso: 3, head: 0, nt: 12, ns: -10, ft: -14, fs: 2 });

/** Legs of a walk (contact, passing, contact, passing), with the body's rise and fall. */
const WALK_LEGS: Partial<FootPose>[] = [
  { nt: 24, ns: -6, ft: -20, fs: -18, py: 0.1 },
  { nt: 4, ns: -30, ft: 2, fs: -4, py: -0.25 },
  { nt: -20, ns: -18, ft: 24, fs: -6, py: 0.1 },
  { nt: 2, ns: -4, ft: 4, fs: -30, py: -0.25 },
];
/** A charge: leaning in, long strides with a flight phase. */
const RUN_LEGS: Partial<FootPose>[] = [
  { torso: 14, nt: 42, ns: -12, ft: -32, fs: -38, py: 0.25, px: 0.2 },
  { torso: 12, nt: 12, ns: -64, ft: 8, fs: -12, py: -0.55, px: 0.2 },
  { torso: 14, nt: -30, ns: -36, ft: 42, fs: -14, py: 0.25, px: 0.2 },
  { torso: 12, nt: 8, ns: -12, ft: 12, fs: -64, py: -0.55, px: 0.2 },
];
const legs = (base: Partial<FootPose>, set: Partial<FootPose>[], arms: Partial<FootPose>[] = []): FootPose[] => set.map((l, i) => pose({ ...base, ...l, ...(arms[i] ?? {}) }));

/** A fall backwards: buckle, knees, over, flat. `arms` keeps the weapon arm's pose sensible. */
const dieKeys = (arms: Partial<FootPose>): FootPose[] => [
  pose({ ...arms, torso: -12, head: -14, nt: 4, ft: -6 }),
  pose({ ...arms, torso: -6, head: 10, nt: 40, ns: -70, ft: 30, fs: -60, py: 1.6 }),
  pose({ ...arms, tilt: -50, torso: -6, head: 18, nu: 60, fu: 50, nt: 40, ns: -50, ft: 30, fs: -40, py: 1.8 }),
  pose({ ...arms, tilt: -86, torso: -4, head: 16, nu: 100, nl: 0, fu: 85, fl: 10, nt: 18, ns: -12, ft: 10, fs: -14, py: 1.9 }),
];
const hitKeys = (arms: Partial<FootPose>, jolt: Partial<FootPose>): FootPose[] => [
  pose(arms),
  pose({ ...arms, torso: -12, head: -14, px: -0.45, py: 0.15, nt: -2, ns: -16, ft: -26, fs: -2, ...jolt }),
  pose({ ...arms, torso: -2, head: -5, px: -0.2, nt: 4, ft: -16 }),
];

/** Cloth lag (sashimono, horo, hachimaki tails), and a smear on the strike's in-betweens. */
function secondaryFor(smearFrom: number | null) {
  return (out: FootPose, anim: Anim, fr: number, n: number, k0: number, raw: number) => {
    out.sway = anim === Anim.Walk ? swing(fr, n, 0.35, 1.5, 2) : anim === Anim.Run ? swing(fr, n, 0.55, 1.5, 2) - 0.4 : anim === Anim.Attack ? settle(fr, n, -0.45, 2) : anim === Anim.Hit ? settle(fr, n, 0.35, 1) : 0;
    out.smear = smearFrom !== null && anim === Anim.Attack && k0 === 1 && raw > 0.15 ? smearFrom : null;
  };
}

// ------------------------------------------------------------------ held weapons

/** Two hands on a weapon: the far hand sits `p.sw` units along it from the near hand. */
const twoHands = (p: FootPose): Held['far'] => (hand: P2, r: ManRig) => addP(hand, mul(limb(p.bl + r.tilt), p.sw));

const heldKatana = (p: FootPose): Held => ({
  far: twoHands(p),
  draw: (c, hand, _f, r) => {
    if (p.smear !== null) c.smear(hand, p.smear + r.tilt, p.bl + r.tilt, 1.0, 4.4, SM.steel);
    katana(c, hand, p.bl + r.tilt);
  },
});
const heldYari = (p: FootPose, butt = 7, fore = 13): Held => ({ far: twoHands(p), draw: (c, hand, _f, r) => yari(c, hand, p.bl + r.tilt, butt, fore) });
const heldNaginata = (p: FootPose): Held => ({
  far: twoHands(p),
  draw: (c, hand, _f, r) => {
    if (p.smear !== null) c.smear(hand, p.smear + r.tilt, p.bl + r.tilt, 3.5, 9.0, SM.steel);
    naginata(c, hand, p.bl + r.tilt, 4.2, 5.8);
  },
});
const heldJavelin = (p: FootPose): Held => ({ draw: (c, hand, _f, r) => (p.sw > 0.5 ? javelin(c, hand, p.bl + r.tilt) : undefined) });
const heldFan = (p: FootPose): Held => ({ draw: (c, hand, _f, r) => gunbai(c, hand, p.bl + r.tilt) });

// ------------------------------------------------------------------ 0: Katana Samurai

const KATANA_REST = { nu: 8, nl: 150, fu: 34, bl: 210, sw: -0.62 };
const KATANA_KEYS: KeySet<FootPose> = {
  poses: {
    // Hassō-no-kamae: the sword held upright by the right shoulder; only the breath moves.
    [Anim.Idle]: [pose(KATANA_REST), pose({ ...KATANA_REST, py: 0.12 })],
    [Anim.Walk]: legs(KATANA_REST, WALK_LEGS),
    [Anim.Run]: legs({ nu: 40, nl: 70, bl: 120, sw: -0.62 }, RUN_LEGS),
    [Anim.Attack]: [
      pose({ torso: -6, nu: 160, nl: 30, bl: 215, sw: -0.62, nt: -4, ft: -14, head: -6 }),
      pose({ torso: 18, nu: 75, nl: 8, bl: 92, sw: -0.62, nt: 32, ns: -24, ft: -20, fs: -10, px: 0.6, py: 0.35 }),
      pose({ torso: 22, nu: 30, nl: -4, bl: 40, sw: -0.62, nt: 32, ns: -24, ft: -20, fs: -10, px: 0.7, py: 0.4 }),
      pose({ ...KATANA_REST, torso: 8, px: 0.2 }),
    ],
    [Anim.Hit]: hitKeys(KATANA_REST, { nu: 40, bl: 195 }),
    [Anim.Die]: dieKeys({ nu: 50, nl: 60, bl: 200, sw: -0.62 }),
    // Chūdan: the blade levelled at the enemy's throat, knees bent.
    [Anim.Brace]: [
      pose({ torso: 8, nu: 40, nl: 52, bl: 112, sw: -0.62, nt: 26, ns: -30, ft: -22, fs: -4, py: 0.5 }),
      pose({ torso: 9, nu: 40, nl: 52, bl: 112, sw: -0.62, nt: 26, ns: -32, ft: -22, fs: -6, py: 0.62 }),
    ],
  },
  secondary: secondaryFor(215),
};

// ------------------------------------------------------------------ 1: Yari Ashigaru

const YARI_REST = { nu: 12, nl: 60, fu: 22, bl: 178, sw: -1.7 };
const YARI_KEYS: KeySet<FootPose> = {
  poses: {
    // The nagae-yari stood upright, butt by the foot, far taller than the man.
    [Anim.Idle]: [pose(YARI_REST), pose({ ...YARI_REST, py: 0.12 })],
    [Anim.Walk]: legs({ ...YARI_REST, bl: 172 }, WALK_LEGS),
    [Anim.Run]: legs({ nu: 30, nl: 50, bl: 100, sw: 2.0 }, RUN_LEGS),
    // A thrust from the levelled spear: draw back, drive in, hold, recover.
    [Anim.Attack]: [
      pose({ torso: -2, nu: 0, nl: 80, bl: 96, sw: 2.2, nt: 0, ft: -18, px: -0.3 }),
      pose({ torso: 16, nu: 60, nl: 30, bl: 92, sw: 2.2, nt: 34, ns: -26, ft: -22, fs: -8, px: 0.7, py: 0.35 }),
      pose({ torso: 18, nu: 62, nl: 28, bl: 92, sw: 2.2, nt: 34, ns: -26, ft: -22, fs: -8, px: 0.8, py: 0.35 }),
      pose({ torso: 6, nu: 20, nl: 70, bl: 110, sw: 2.0, nt: 10, ft: -12 }),
    ],
    [Anim.Hit]: hitKeys(YARI_REST, { bl: 186 }),
    [Anim.Die]: dieKeys({ nu: 30, nl: 50, bl: 150, sw: -1.7 }),
    // Spear wall: crouched, the yari levelled long and low.
    [Anim.Brace]: [
      pose({ torso: 12, nu: 10, nl: 75, bl: 96, sw: 2.3, nt: 30, ns: -36, ft: -26, fs: -4, py: 0.6 }),
      pose({ torso: 13, nu: 10, nl: 75, bl: 96, sw: 2.3, nt: 30, ns: -38, ft: -26, fs: -6, py: 0.72 }),
    ],
  },
  secondary: secondaryFor(null),
};

// ------------------------------------------------------------------ 2: Nage-yari Skirmishers

const JAV_REST = { nu: -35, nl: 175, fu: 30, fl: 40, bl: 100, sw: 1 };
const JAV_KEYS: KeySet<FootPose> = {
  poses: {
    // A javelin cocked over the shoulder, the bundle fanned on the back.
    [Anim.Idle]: [pose({ ...JAV_REST, torso: 6 }), pose({ ...JAV_REST, torso: 6, py: 0.12 })],
    [Anim.Walk]: legs(JAV_REST, WALK_LEGS),
    [Anim.Run]: legs({ ...JAV_REST, nu: 120, bl: 110 }, RUN_LEGS),
    [Anim.Shoot]: [
      pose({ ...JAV_REST, torso: 4 }),
      pose({ torso: -10, nu: 200, nl: -30, fu: 70, fl: 10, bl: 115, sw: 1, nt: -6, ft: -20, px: -0.3 }),
      pose({ torso: 22, nu: 95, nl: -10, fu: 10, fl: 40, bl: 95, sw: 0, nt: 30, ns: -24, ft: -22, fs: -10, px: 0.6, py: 0.3 }),
      pose({ torso: 24, nu: 45, nl: 10, fu: 0, fl: 40, bl: 80, sw: 0, nt: 30, ns: -24, ft: -22, fs: -10, px: 0.7, py: 0.35 }),
      pose({ ...JAV_REST, torso: 6, sw: 1 }),
    ],
    [Anim.Attack]: [
      pose({ ...JAV_REST, nu: 160, bl: 100 }),
      pose({ torso: 18, nu: 85, nl: -5, bl: 88, sw: 1, nt: 30, ns: -24, ft: -22, fs: -10, px: 0.6, py: 0.3 }),
      pose({ torso: 20, nu: 80, nl: -5, bl: 86, sw: 1, nt: 30, ns: -24, ft: -22, fs: -10, px: 0.65, py: 0.3 }),
      pose({ ...JAV_REST, torso: 8 }),
    ],
    [Anim.Hit]: hitKeys(JAV_REST, { nu: 170 }),
    [Anim.Die]: dieKeys({ nu: 80, nl: 20, bl: 120, sw: 0 }),
    // Crouched low, the javelin couched to stab.
    [Anim.Brace]: [
      pose({ torso: 18, nu: 40, nl: 40, fu: 40, fl: 30, bl: 100, sw: 1, nt: 32, ns: -40, ft: -28, fs: -4, py: 0.8 }),
      pose({ torso: 19, nu: 40, nl: 40, fu: 40, fl: 30, bl: 100, sw: 1, nt: 32, ns: -42, ft: -28, fs: -6, py: 0.92 }),
    ],
  },
  secondary: secondaryFor(null),
};

// ------------------------------------------------------------------ 3: Yumi Ashigaru

/**
 * The archer: the yumi in the far (left) hand, upright and towering over him; the near hand on
 * the string. `sw` is how far it is drawn (0..1, the arrow nocked while > 0.05); a negative `sw`
 * means he fights with a short blade in the near hand instead.
 */
function heldYumi(p: FootPose, short = 1.9): Held {
  return {
    behind: (back) => back,
    draw: (c, hand, farHand, r) => {
      const bend = Math.max(0, p.sw);
      yumi(c, farHand, (p.sw > 0.05 ? 180 : 172.5) + r.tilt, bend, p.sw > 0.05 ? hand : null, p.sw > 0.05);
      if (p.sw < -0.5) katana(c, hand, p.bl + r.tilt, short);
    },
  };
}
const BOW_REST = { nu: 14, nl: 40, fu: 28, fl: 22, sw: 0, bl: 100 };
const BOW_KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose(BOW_REST), pose({ ...BOW_REST, py: 0.12 })],
    [Anim.Walk]: legs(BOW_REST, WALK_LEGS),
    [Anim.Run]: legs({ ...BOW_REST, fu: 40, fl: 20 }, RUN_LEGS),
    // Nock, raise (uchiokoshi), full draw (kai), loose (hanare), remain (zanshin).
    [Anim.Shoot]: [
      pose({ ...BOW_REST, nu: 30, nl: 60, fu: 40, fl: 30, sw: 0.1 }),
      pose({ nu: 150, nl: -10, fu: 140, fl: 0, sw: 0.15, torso: 0, head: -4, nt: 10, ft: -14 }),
      pose({ nu: 95, nl: -150, fu: 88, fl: -4, sw: 0.95, torso: 0, head: 0, nt: 10, ft: -14 }),
      pose({ nu: 95, nl: -152, fu: 88, fl: -4, sw: 1.0, torso: 0, head: 0, nt: 10, ft: -14 }),
      pose({ nu: 100, nl: -90, fu: 88, fl: -4, sw: 0, torso: 0, head: 0, nt: 10, ft: -14 }),
      pose({ ...BOW_REST, sw: 0 }),
    ],
    [Anim.Attack]: [
      pose({ ...BOW_REST, nu: 150, nl: 20, bl: 210, sw: -1 }),
      pose({ ...BOW_REST, torso: 16, nu: 70, nl: 10, bl: 90, sw: -1, nt: 30, ns: -24, ft: -20, px: 0.5, py: 0.3 }),
      pose({ ...BOW_REST, torso: 18, nu: 30, nl: 0, bl: 45, sw: -1, nt: 30, ns: -24, ft: -20, px: 0.55, py: 0.3 }),
      pose({ ...BOW_REST, torso: 6, sw: 0 }),
    ],
    [Anim.Hit]: hitKeys(BOW_REST, { fu: 50 }),
    [Anim.Die]: dieKeys({ ...BOW_REST }),
    // Kneeling to shoot over the front rank, the bow half drawn.
    [Anim.Brace]: [
      pose({ nu: 70, nl: -100, fu: 80, fl: -4, sw: 0.5, torso: 6, nt: 80, ns: -90, ft: -10, fs: -100, py: 2.1 }),
      pose({ nu: 70, nl: -102, fu: 80, fl: -4, sw: 0.55, torso: 6, nt: 80, ns: -90, ft: -10, fs: -100, py: 2.2 }),
    ],
  },
  secondary: secondaryFor(null),
};

// ------------------------------------------------------------------ 4: Teppō Ashigaru

const GUN_REST = { nu: 16, nl: 92, fu: 40, bl: 150, sw: 2.2 };
/** The teppō, with the shot's flash and smoke keyed to the frame. */
/** Where the muzzle was at the shot (Shoot frame 5): the smoke stays there. */
function firedMuzzle(c: Paper, back: boolean): P2 {
  const p = poseAt(GUN_KEYS, Anim.Shoot, 5);
  const r = manRig(c, p, back ? 'ne' : 'se', [p.px, -6.3 + p.py]);
  const hand = along(along(r.shN, p.nu, ARM_U), p.nu + p.nl, ARM_L);
  return addP(hand, mul(limb(p.bl), c.L <= 1 ? 9.6 : 7.1));
}
function heldTeppo(p: FootPose, anim: Anim, fr: number): Held {
  return {
    far: twoHands(p),
    draw: (c, hand, _f, r) => {
      const deg = p.bl + r.tilt;
      const muzzle = teppo(c, hand, deg, anim !== Anim.Die && anim !== Anim.Dead);
      if (anim === Anim.Shoot) {
        if (fr === 5 || fr === 6) flash(c, muzzle, deg, fr === 5 ? 1.2 : 0.8);
        // The smoke hangs where the shot was fired, while the gun comes down to reload.
        if (fr >= 5) smoke(c, addP(firedMuzzle(c, r.back), mul(limb(90), 0.8)), (fr - 4) / 8, 3, 1.3);
      }
    },
  };
}
const GUN_KEYS: KeySet<FootPose> = {
  poses: {
    // Port arms: the teppō held slanting across the body, muzzle high, the match smouldering.
    [Anim.Idle]: [pose(GUN_REST), pose({ ...GUN_REST, py: 0.12 })],
    [Anim.Walk]: legs(GUN_REST, WALK_LEGS),
    [Anim.Run]: legs({ ...GUN_REST, bl: 125 }, RUN_LEGS),
    // Present at the cheek, aim, fire (flash, smoke), the kick, lower to reload.
    [Anim.Shoot]: [
      pose(GUN_REST),
      pose({ nu: 50, nl: 70, bl: 92, sw: 2.6, head: 8, torso: 6, nt: 14, ft: -16 }),
      pose({ nu: 52, nl: 68, bl: 90, sw: 2.6, head: 10, torso: 7, nt: 14, ft: -16 }),
      pose({ nu: 46, nl: 70, bl: 98, sw: 2.6, head: 6, torso: 0, px: -0.3, nt: 10, ft: -18 }),
      pose({ nu: 30, nl: 80, bl: 120, sw: 2.4, torso: 4, nt: 8, ft: -10 }),
      pose(GUN_REST),
    ],
    // A butt-stroke.
    [Anim.Attack]: [
      pose({ ...GUN_REST, nu: 120, nl: 30, bl: 200, sw: 2.0, torso: -4 }),
      pose({ torso: 18, nu: 70, nl: 10, bl: 70, sw: 2.0, nt: 30, ns: -24, ft: -20, px: 0.5, py: 0.3 }),
      pose({ torso: 20, nu: 50, nl: 10, bl: 55, sw: 2.0, nt: 30, ns: -24, ft: -20, px: 0.55, py: 0.3 }),
      pose({ ...GUN_REST, torso: 6 }),
    ],
    [Anim.Hit]: hitKeys(GUN_REST, { bl: 150 }),
    [Anim.Die]: dieKeys({ nu: 40, nl: 60, bl: 120, sw: 2.0 }),
    // Kneeling, the gun levelled behind the front rank.
    [Anim.Brace]: [
      pose({ nu: 50, nl: 70, bl: 92, sw: 2.6, head: 8, torso: 6, nt: 80, ns: -90, ft: -10, fs: -100, py: 2.1 }),
      pose({ nu: 50, nl: 70, bl: 92, sw: 2.6, head: 8, torso: 7, nt: 80, ns: -90, ft: -10, fs: -100, py: 2.2 }),
    ],
  },
  secondary: secondaryFor(null),
};

// ------------------------------------------------------------------ 8: Sōhei

const MONK_REST = { nu: 20, nl: 75, fu: 30, bl: 172.5, sw: -2.2, torso: 4, nt: 6, ns: -6, ft: -8, fs: -2 };
const MONK_KEYS: KeySet<FootPose> = {
  poses: {
    // The naginata held slanting forward, blade high: a broad curved blade over a white cowl.
    [Anim.Idle]: [pose(MONK_REST), pose({ ...MONK_REST, py: 0.12 })],
    [Anim.Walk]: legs(MONK_REST, WALK_LEGS),
    [Anim.Run]: legs({ ...MONK_REST, bl: 130 }, RUN_LEGS),
    // A great sweeping cut, two-handed from high behind.
    [Anim.Attack]: [
      pose({ torso: -8, nu: 165, nl: 10, bl: 230, sw: -2.2, nt: -6, ft: -16, head: -6 }),
      pose({ torso: 20, nu: 80, nl: 0, bl: 110, sw: -2.2, nt: 34, ns: -26, ft: -22, fs: -10, px: 0.7, py: 0.4 }),
      pose({ torso: 24, nu: 45, nl: -5, bl: 60, sw: -2.2, nt: 34, ns: -26, ft: -22, fs: -10, px: 0.8, py: 0.45 }),
      pose({ ...MONK_REST, torso: 10, px: 0.3 }),
    ],
    [Anim.Hit]: hitKeys(MONK_REST, { bl: 175 }),
    [Anim.Die]: dieKeys({ nu: 40, nl: 50, bl: 190, sw: -2.2 }),
    [Anim.Brace]: [
      pose({ torso: 12, nu: 30, nl: 60, bl: 115, sw: -2.4, nt: 30, ns: -36, ft: -26, fs: -4, py: 0.6 }),
      pose({ torso: 13, nu: 30, nl: 60, bl: 115, sw: -2.4, nt: 30, ns: -38, ft: -26, fs: -6, py: 0.72 }),
    ],
  },
  secondary: secondaryFor(230),
};

// ------------------------------------------------------------------ 10: Daimyō

const LORD_REST = { nu: 100, nl: 60, fu: 26, fl: 50, bl: 165, nt: 6, ns: -6, ft: -8, fs: -2 };
const LORD_KEYS: KeySet<FootPose> = {
  poses: {
    // The war fan raised to direct the army; the horo billowing behind.
    [Anim.Idle]: [pose(LORD_REST), pose({ ...LORD_REST, py: 0.12 })],
    [Anim.Walk]: legs({ ...LORD_REST, nu: 30, nl: 70, bl: 150 }, WALK_LEGS),
    [Anim.Run]: legs({ ...LORD_REST, nu: 40, nl: 60, bl: 130 }, RUN_LEGS),
    // A command: the fan swept down toward the enemy.
    [Anim.Attack]: [
      pose({ ...LORD_REST, nu: 165, nl: 10, bl: 200, torso: -4 }),
      pose({ ...LORD_REST, nu: 90, nl: 0, bl: 95, torso: 14, nt: 26, ns: -20, ft: -16, px: 0.4, py: 0.25 }),
      pose({ ...LORD_REST, nu: 80, nl: 0, bl: 85, torso: 16, nt: 26, ns: -20, ft: -16, px: 0.45, py: 0.25 }),
      pose({ ...LORD_REST, torso: 6 }),
    ],
    [Anim.Hit]: hitKeys(LORD_REST, { nu: 120 }),
    [Anim.Die]: dieKeys({ nu: 60, nl: 40, bl: 150 }),
    [Anim.Brace]: [pose({ ...LORD_REST, nu: 80, nl: 40, bl: 110, torso: 8, nt: 20, ns: -24, ft: -18, py: 0.4 }), pose({ ...LORD_REST, nu: 80, nl: 40, bl: 110, torso: 9, nt: 20, ns: -24, ft: -18, py: 0.52 })],
  },
  secondary: secondaryFor(null),
};

// ------------------------------------------------------------------ the mounted kinds

const hpose = poser<HorsePose>({ ...HORSE0, torso: 2, head: 0, nt: 40, ns: -70, ft: 40, fs: -70, neck: 38 });

/** Horse gaits (legs, pitch, neck); a rider's arms are merged in per kind. */
const H_IDLE: Partial<HorsePose>[] = [{ fnu: 2, ffu: -2, hnu: -2, hfu: 2, tail: 18 }, { fnu: 2, ffu: -2, hnu: -2, hfu: 2, tail: 22, py: 0.12, neck: 40 }];
const H_WALK: Partial<HorsePose>[] = [
  { fnu: 18, fnl: -6, ffu: -12, ffl: 30, hnu: -14, hnl: 18, hfu: 12, hfl: -4, py: 0.1, nod: 4 },
  { fnu: 6, fnl: 40, ffu: 0, ffl: 0, hnu: -4, hnl: 0, hfu: 2, hfl: 30, py: -0.15, nod: 0 },
  { fnu: -12, fnl: 30, ffu: 18, ffl: -6, hnu: 12, hnl: -4, hfu: -14, hfl: 18, py: 0.1, nod: 4 },
  { fnu: 0, fnl: 0, ffu: 6, ffl: 40, hnu: 2, hnl: 30, hfu: -4, hfl: 0, py: -0.15, nod: 0 },
];
const H_RUN: Partial<HorsePose>[] = [
  // Gallop: gathered, push off, extended flight, landing.
  { fnu: -30, fnl: 70, ffu: -20, ffl: 60, hnu: 30, hnl: -20, hfu: 40, hfl: -30, pitch: -4, py: -0.2, neck: 30, nod: 8, tail: 30, torso: 14 },
  { fnu: 20, fnl: 50, ffu: 40, ffl: 20, hnu: 10, hnl: 30, hfu: 0, hfl: 40, pitch: 6, py: -0.6, neck: 40, nod: 0, tail: 40, torso: 12 },
  { fnu: 50, fnl: 0, ffu: 55, ffl: -5, hnu: -40, hnl: 20, hfu: -35, hfl: 15, pitch: 0, py: -0.8, neck: 34, nod: -4, tail: 50, torso: 14 },
  { fnu: 10, fnl: 0, ffu: 30, ffl: 10, hnu: -10, hnl: 40, hfu: -20, hfl: 50, pitch: -6, py: 0.1, neck: 30, nod: 6, tail: 36, torso: 14 },
];
const hkeys = (gait: Partial<HorsePose>[], rider: Partial<HorsePose>): HorsePose[] => gait.map((g) => hpose({ ...rider, ...g }));
const H_HIT: Partial<HorsePose>[] = [{}, { pitch: 8, neck: 50, nod: -12, torso: -12, head: -10, px: -0.4, fnu: 20, fnl: 40 }, { pitch: 2, neck: 42, torso: -2 }];
/** The horse goes down: knees buckle, it drops, it lies; the rider is thrown off behind (apart). */
const H_DIE: Partial<HorsePose>[] = [
  { pitch: 10, neck: 55, nod: -15, torso: -14, fnu: 30, fnl: 60 },
  { pitch: -10, py: 1.6, neck: 20, nod: 20, fnu: 60, fnl: -120, ffu: 50, ffl: -110, hnu: -20, hnl: 40, apart: 0.4, torso: -30, tilt: -20 },
  { pitch: -4, py: 3.4, neck: 0, nod: 40, fnu: 85, fnl: -150, ffu: 80, ffl: -150, hnu: 60, hnl: -120, hfu: 60, hfl: -120, apart: 0.8, tilt: -60, torso: -10 },
  { pitch: 0, py: 3.9, neck: -10, nod: 50, fnu: 88, fnl: -160, ffu: 82, ffl: -160, hnu: 75, hnl: -140, hfu: 70, hfl: -140, apart: 1, tilt: -86, torso: -4, head: 16, nu: 100, nl: 0, fu: 85, fl: 10, tail: 0 },
];

/** A horse and rider, back to front, in one facing. */
function mounted(c: Paper, p: HorsePose, facing: Facing, coat: Coat, kit: Kit, held: (p: FootPose) => Held): void {
  const back = isBack(facing);
  // Horses keep their tilt for the rider (thrown off), not for themselves.
  const hp: HorsePose = { ...p, tilt: 0 };
  const m0 = horse(c, hp, facing, coat, 'far');
  const thrown = p.apart;
  const seat: P2 = c.q(addP(m0.seat, [-5.5 * thrown, 8.6 * thrown]));
  // The rider's legs bend round the barrel; the far one is mostly hidden by the horse.
  const rp: FootPose = { ...p };
  const r = manRig(c, rp, facing, seat);
  const ridingLegs = thrown < 0.5;
  if (ridingLegs) leg(c, r.hipF, p.ft, p.fs, r.tilt, kit, true, true);
  horse(c, hp, facing, coat, 'body');
  drawMan(c, rp, facing, kit, held(rp), { pel: seat, riding: true });
  if (ridingLegs) leg(c, r.hipN, p.nt, p.ns, r.tilt, kit, false, true);
  else {
    leg(c, r.hipF, p.ft, p.fs, r.tilt, kit, true);
    leg(c, r.hipN, p.nt, p.ns, r.tilt, kit, false);
  }
  void back;
}

// 5: Yari Cavalry: the yari carried upright, levelled for the charge.
const YC_REST = { nu: 20, nl: 70, fu: 30, fl: 60, bl: 178, sw: -1.8 };
const YC_KEYS: KeySet<HorsePose> = {
  poses: {
    [Anim.Idle]: hkeys(H_IDLE, YC_REST),
    [Anim.Walk]: hkeys(H_WALK, YC_REST),
    [Anim.Run]: hkeys(H_RUN, { nu: 30, nl: 50, bl: 96, sw: 2.2 }),
    [Anim.Attack]: [
      hpose({ ...YC_REST, nu: 10, nl: 80, bl: 100, sw: 2.2, torso: -4 }),
      hpose({ nu: 70, nl: 15, bl: 92, sw: 2.2, torso: 16, pitch: -4, fnu: 20, fnl: 30, px: 0.4 }),
      hpose({ nu: 72, nl: 12, bl: 92, sw: 2.2, torso: 18, pitch: -4, fnu: 20, fnl: 30, px: 0.5 }),
      hpose({ ...YC_REST, torso: 6 }),
    ],
    [Anim.Hit]: H_HIT.map((h) => hpose({ ...YC_REST, ...h })),
    [Anim.Die]: H_DIE.map((h) => hpose({ ...YC_REST, ...h })),
    [Anim.Brace]: [hpose({ nu: 30, nl: 55, bl: 95, sw: 2.2, torso: 8, fnu: 6, hnu: -4 }), hpose({ nu: 30, nl: 55, bl: 95, sw: 2.2, torso: 9, fnu: 6, hnu: -4, py: 0.12 })],
  },
  secondary(out, anim, fr, n) {
    out.sway = anim === Anim.Run ? swing(fr, n, 0.6, 1.5, 2) - 0.5 : anim === Anim.Walk ? swing(fr, n, 0.3, 1.5, 2) : 0;
  },
};

// 6: Yabusame Archers: a wide flat kasa, the yumi drawn from the saddle.
const YB_REST = { nu: 20, nl: 50, fu: 40, fl: 20, sw: 0, bl: 100 };
const YB_KEYS: KeySet<HorsePose> = {
  poses: {
    [Anim.Idle]: hkeys(H_IDLE, YB_REST),
    [Anim.Walk]: hkeys(H_WALK, YB_REST),
    [Anim.Run]: hkeys(H_RUN, { ...YB_REST, fu: 60, fl: 10 }),
    [Anim.Shoot]: [
      hpose({ ...YB_REST, nu: 40, nl: 60, sw: 0.1 }),
      hpose({ nu: 140, nl: -10, fu: 130, fl: 0, sw: 0.15, torso: 0 }),
      hpose({ nu: 95, nl: -150, fu: 88, fl: -4, sw: 0.95, torso: 0 }),
      hpose({ nu: 95, nl: -152, fu: 88, fl: -4, sw: 1, torso: 0 }),
      hpose({ nu: 100, nl: -90, fu: 88, fl: -4, sw: 0, torso: 0 }),
      hpose({ ...YB_REST }),
    ],
    [Anim.Attack]: [
      hpose({ ...YB_REST, nu: 150, nl: 20, bl: 210, sw: -1 }),
      hpose({ ...YB_REST, torso: 14, nu: 70, nl: 10, bl: 90, sw: -1, px: 0.3 }),
      hpose({ ...YB_REST, torso: 16, nu: 30, nl: 0, bl: 45, sw: -1, px: 0.35 }),
      hpose({ ...YB_REST, torso: 4 }),
    ],
    [Anim.Hit]: H_HIT.map((h) => hpose({ ...YB_REST, ...h })),
    [Anim.Die]: H_DIE.map((h) => hpose({ ...YB_REST, ...h })),
    [Anim.Brace]: [hpose({ ...YB_REST, nu: 70, nl: -100, fu: 80, fl: -4, sw: 0.5 }), hpose({ ...YB_REST, nu: 70, nl: -102, fu: 80, fl: -4, sw: 0.55, py: 0.12 })],
  },
  secondary(out, anim, fr, n) {
    out.sway = anim === Anim.Run ? swing(fr, n, 0.5, 1.5, 2) : 0;
  },
};

// 7: Hatamoto Horse: the lord's retainers, horo billowing, katana raised; a black horse with tassels.
const HM_REST = { nu: 110, nl: 70, fu: 30, fl: 60, bl: 160, sw: 0 };
const HM_KEYS: KeySet<HorsePose> = {
  poses: {
    [Anim.Idle]: hkeys(H_IDLE, HM_REST),
    [Anim.Walk]: hkeys(H_WALK, HM_REST),
    [Anim.Run]: hkeys(H_RUN, { ...HM_REST, nu: 100, nl: 20, bl: 120 }),
    [Anim.Attack]: [
      hpose({ ...HM_REST, nu: 170, nl: 20, bl: 220, torso: -6 }),
      hpose({ ...HM_REST, nu: 80, nl: 5, bl: 95, torso: 16, px: 0.4, pitch: -4 }),
      hpose({ ...HM_REST, nu: 35, nl: 0, bl: 40, torso: 18, px: 0.5, pitch: -4 }),
      hpose({ ...HM_REST, torso: 6 }),
    ],
    [Anim.Hit]: H_HIT.map((h) => hpose({ ...HM_REST, ...h })),
    [Anim.Die]: H_DIE.map((h) => hpose({ ...HM_REST, ...h })),
    [Anim.Brace]: [hpose({ ...HM_REST, nu: 60, nl: 50, bl: 110, torso: 8 }), hpose({ ...HM_REST, nu: 60, nl: 50, bl: 110, torso: 9, py: 0.12 })],
  },
  secondary(out, anim, fr, n, k0, raw) {
    out.sway = anim === Anim.Run ? swing(fr, n, 0.4, 1.5, 2) + 0.6 : anim === Anim.Walk ? swing(fr, n, 0.25, 1.5, 2) : 0;
    out.smear = anim === Anim.Attack && k0 === 1 && raw > 0.15 ? 220 : null;
  },
};

/** One-handed katana for the hatamoto (rides with the reins in the far hand). */
const heldRiderKatana = (p: FootPose): Held => ({
  draw: (c, hand, _f, r) => {
    if (p.smear !== null) c.smear(hand, p.smear + r.tilt, p.bl + r.tilt, 1.0, 4.4, SM.steel);
    katana(c, hand, p.bl + r.tilt);
  },
});

// ------------------------------------------------------------------ 9: the Ōzutsu and its crew

const epose = poser<EnginePose>({ ...ENGINE0, arm: 12 });
const OZ_KEYS: KeySet<EnginePose> = {
  poses: {
    [Anim.Idle]: [epose({}), epose({ crew: 0.05 })],
    [Anim.Walk]: [epose({ crew: 0.0, lean: 0.3 }), epose({ crew: 0.25, lean: 0.4 }), epose({ crew: 0.5, lean: 0.3 }), epose({ crew: 0.75, lean: 0.4 })],
    [Anim.Run]: [epose({ crew: 0.0, lean: 0.6 }), epose({ crew: 0.25, lean: 0.7 }), epose({ crew: 0.5, lean: 0.6 }), epose({ crew: 0.75, lean: 0.7 })],
    // Lay, touch the match to the vent, the roar (flash, smoke), the kick, sponge and reload.
    [Anim.Shoot]: [epose({ load: 1 }), epose({ load: 1, lean: 1 }), epose({ load: 1, lean: 1 }), epose({ load: 0, recoil: 1.1, lean: 0.2 }), epose({ load: 0, recoil: 0.6 }), epose({ load: 0.5, recoil: 0, sling: 1 }), epose({ load: 1 })],
    // The crew fight with rammer and match-staff.
    [Anim.Attack]: [epose({ sling: -1 }), epose({ sling: 1, lean: 0.6 }), epose({ sling: 1, lean: 0.7 }), epose({ sling: 0 })],
    [Anim.Hit]: [epose({}), epose({ lean: -0.6, recoil: 0.2 }), epose({ lean: -0.2 })],
    [Anim.Die]: [epose({ apart: 0 }), epose({ apart: 0.35, lean: -0.5 }), epose({ apart: 0.7, recoil: 0.4 }), epose({ apart: 1, recoil: 0.4, arm: 4 })],
    [Anim.Brace]: [epose({ lean: 0.2 }), epose({ lean: 0.2, crew: 0.05 })],
  },
};

/** A crewman's foot pose from the engine pose: role 0 is the gunner (match-staff), 1 the loader (rammer). */
function crewPose(e: EnginePose, role: 0 | 1, anim: Anim): FootPose {
  const step = Math.sin(e.crew * Math.PI * 4);
  const walking = anim === Anim.Walk || anim === Anim.Run;
  const leg = walking ? { nt: 14 * step, ns: -14 - 10 * Math.abs(step), ft: -14 * step, fs: -14 - 10 * Math.abs(-step) } : { nt: 6, ns: -6, ft: -8, fs: -2 };
  const fall = e.apart;
  const base = pose({ ...leg, torso: 6 + e.lean * 18, tilt: -86 * Math.max(0, (fall - 0.3) / 0.7), py: fall * 1.8 });
  if (role === 0) return { ...base, nu: 40 + e.lean * 40 + (e.sling > 0 ? 60 * e.sling : 0), nl: 60 - e.lean * 30, fu: 20, fl: 40, bl: 160 - e.lean * 40 - (e.sling > 0 ? 70 * e.sling : 0), sw: 0 };
  return { ...base, nu: 15 + (e.sling > 0 ? 70 * e.sling : 0) + e.load * 0, nl: 70, fu: 30, bl: 175 - (e.sling > 0 ? 80 * e.sling : 0) - (e.sling < 0 ? -30 : 0), sw: -1.5 };
}

function bombard(c: Paper, e: EnginePose, facing: Facing, anim: Anim, fr: number): void {
  const back = isBack(facing);
  const gunner = crewPose(e, 0, anim), loader = crewPose(e, 1, anim);
  const gx = back ? -1 : 1;
  // The gunner stands at the breech with the match-staff; the loader at the muzzle with the rammer.
  const gPel: P2 = addP(rot([-4.6 * gx + e.lean * 0.6 * gx, -6.3 + gunner.py], gunner.tilt * DEG), [0, -1.6]);
  const lPel: P2 = addP(rot([3.4 * gx, -6.3 + loader.py], loader.tilt * DEG), [0, -1.8]);
  const gunnerHeld: Held = {
    draw: (cc, hand, _f, r) => {
      const deg = gunner.bl + r.tilt;
      const tip = addP(hand, mul(limb(deg), 3.0));
      cc.rod(addP(hand, mul(limb(deg), -1.2)), tip, 0.22, 0.2, SM.wood, { tone: 2 });
      cc.blob(tip, 0.2, 0.2, SM.fire, { tone: 3, detail: FIRE });
    },
  };
  const loaderHeld: Held = {
    far: (hand, r) => addP(hand, mul(limb(loader.bl + r.tilt), loader.sw)),
    draw: (cc, hand, _f, r) => {
      const deg = loader.bl + r.tilt;
      cc.rod(addP(hand, mul(limb(deg), -2.5)), addP(hand, mul(limb(deg), 3.5)), 0.24, 0.24, SM.wood, { tone: 2 });
      cc.blob(addP(hand, mul(limb(deg), 3.6)), 0.4, 0.32, SM.cotton, { tone: 2 });
    },
  };
  const drawGunner = () => drawMan(c, gunner, facing, CREW, gunnerHeld, { pel: gPel });
  const drawLoader = () => drawMan(c, loader, facing, CREW, loaderHeld, { pel: lPel });
  // Seen from the front the crew stand beyond the gun; from behind, the gun is beyond them.
  if (back) {
    const m = ozutsu(c, e, facing);
    shotFx(c, m, e, anim, fr);
    drawLoader();
    drawGunner();
  } else {
    drawGunner();
    drawLoader();
    const m = ozutsu(c, e, facing);
    shotFx(c, m, e, anim, fr);
  }
}

function shotFx(c: Paper, muzzle: P2, e: EnginePose, anim: Anim, fr: number): void {
  if (anim !== Anim.Shoot) return;
  const deg = 90 - e.arm;
  if (fr === 4 || fr === 5) flash(c, muzzle, deg, fr === 4 ? 2.6 : 1.8);
  if (fr >= 4) smoke(c, addP(muzzle, mul(limb(deg), 2.0)), (fr - 3) / 9, 9, 2.2);
}

// ------------------------------------------------------------------ registration

const foot = (kind: number, keys: KeySet<FootPose>, kit: Kit, held: (p: FootPose, anim: Anim, fr: number) => Held) =>
  registerPaperKind<FootPose>('samurai', kind, { body: 'foot', keys, draw: (c, p, f, anim, fr) => void drawMan(c, p, f, kit, held(p, anim, fr)) });

foot(U.HeavyInfantry, KATANA_KEYS, SAMURAI, heldKatana);
foot(U.Spearmen, YARI_KEYS, YARI_ASHIGARU, (p) => heldYari(p));
foot(U.Skirmishers, JAV_KEYS, SKIRMISHER, heldJavelin);
foot(U.Archers, BOW_KEYS, ARCHER, (p) => heldYumi(p));
foot(U.Crossbowmen, GUN_KEYS, GUNNER, heldTeppo);
foot(U.Shock, MONK_KEYS, SOHEI, heldNaginata);
foot(COMMANDER_KIND, LORD_KEYS, DAIMYO, heldFan);

const BAY: Coat = { hide: SM.bay, mane: SM.black };
const CHESTNUT: Coat = { hide: SM.chestnut, mane: SM.straw, socks: true };
const BLACK: Coat = { hide: SM.black, mane: SM.hair, tassels: true, cloth: SM.teamDk };
registerPaperKind<HorsePose>('samurai', U.LightCavalry, { body: 'horse', keys: YC_KEYS, draw: (c, p, f) => mounted(c, p, f, BAY, YARI_RIDER, (q) => heldYari(q, 6, 12)) });
registerPaperKind<HorsePose>('samurai', U.HorseArchers, { body: 'horse', keys: YB_KEYS, draw: (c, p, f) => mounted(c, p, f, CHESTNUT, YABUSAME, (q) => heldYumi(q)) });
registerPaperKind<HorsePose>('samurai', U.Knights, { body: 'horse', keys: HM_KEYS, draw: (c, p, f) => mounted(c, p, f, BLACK, HATAMOTO, heldRiderKatana) });
registerPaperKind<EnginePose>('samurai', U.Artillery, { body: 'engine', keys: OZ_KEYS, draw: (c, p, f, anim, fr) => bombard(c, p, f, anim, fr) });

// The kinds rebuilt from the key art on bones (samurai-rig.ts) replace the posed figures above.
registerFootRigs([U.HeavyInfantry, U.Spearmen, U.Skirmishers, U.Archers, U.Crossbowmen]);

// Kept for tests and the contact sheet.
export const SAMURAI_KINDS = [U.HeavyInfantry, U.Spearmen, U.Skirmishers, U.Archers, U.Crossbowmen, U.LightCavalry, U.HorseArchers, U.Knights, U.Shock, U.Artillery, COMMANDER_KIND] as const;
