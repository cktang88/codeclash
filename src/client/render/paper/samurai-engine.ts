// The Samurai Ōzutsu (kind 9) on bones, rebuilt from the approved key art (samurai-static.ts): a
// bronze ōzutsu on its plank bed, worked by a gunner with the linstock at the breech and a loader
// with the rammer at the muzzle (the Edo gunnery manuals; the Templar engine's crew method,
// templar-engine.ts). The shot follows the piece's drill: the loader rams the charge home and
// steps clear, the gunner lowers the match to the touch-hole, the priming flashes, the gun fires
// and recoils back off its cradle, the crew flinch from the blast, the smoke rolls out and lingers;
// the gun is run back and the loader swabs the bore for the next charge.

import { Anim } from '../contract.ts';
import type { P2, Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { flash as muzzleFlash, smoke } from './samurai-parts.ts';
import { neBody, samuraiKind, type SSpec } from './samurai-rig.ts';
import { manOrder, manPiece, OZ, OZ_CREW, OZ_PIECES, ozCrewBody, ozPiece, withMap, type Body, type ManPiece, type OzPiece } from './samurai-static.ts';
import { bonesFromJoints, evaluate, sampleClip, type AnimEvent, type AttachmentSet, type Clip, type JointDef, type SkeletonData, type SkeletonRig, type SlotData } from './skeleton.ts';
import { T, type Author } from './templar-clips.ts';
import { facingClip, lastFrame, mapFacings, overlayKeys, partMap, restWorld, type ClipSet, type KP } from './templar-rig.ts';

type Crew = 'G' | 'L';
const CREWS: readonly Crew[] = ['G', 'L'];
const ARM: Partial<Record<ManPiece, string>> = { upperArmN: 'ArmN', forearmN: 'ForeN', handN: 'ForeN', weapon: 'ForeN', gripN: 'ForeN', upperArmF: 'ArmF', forearmF: 'ForeF', handF: 'ForeF', farItem: 'ForeF', gripF: 'ForeF', sodeN: 'ArmN', sodeF: 'ArmF' };
/** The crew keep their key-art stance from behind (drawn as back views), as the Templar crew. */
const crewRest = (k: Crew, f: Facing): Body => (void f, ozCrewBody(k));
void neBody;
void (null as unknown as SSpec);
const crewPieces = (k: Crew): ManPiece[] => [...manOrder(OZ_CREW[k].gear)];

function engineSkel(): SkeletonData {
  const defs: JointDef[] = [
    { name: 'root', from: [0, 0], to: [0, 0] },
    { name: 'gun', parent: 'root', from: OZ.br, to: OZ.mz },
  ];
  for (const k of CREWS) {
    const se = ozCrewBody(k), ne = crewRest(k, 'ne');
    const foot: P2 = [OZ_CREW[k].o[0], OZ_CREW[k].o[1]];
    const pair = (name: string, parent: string, a: (b: Body) => P2, b: (b: Body) => P2): JointDef => {
      const d: JointDef = { name, parent, from: a(se), to: b(se) };
      const nf = a(ne), nt = b(ne);
      if (nf[0] !== d.from[0] || nf[1] !== d.from[1] || nt[0] !== d.to[0] || nt[1] !== d.to[1]) d.facing = { ne: { from: nf, to: nt } };
      return d;
    };
    defs.push(
      { name: `crew${k}`, parent: 'root', from: foot, to: [foot[0], foot[1] - 14] },
      pair(`crew${k}ArmN`, `crew${k}`, (b) => b.shN, (b) => b.elN),
      pair(`crew${k}ForeN`, `crew${k}ArmN`, (b) => b.elN, (b) => b.hnN),
      pair(`crew${k}ArmF`, `crew${k}`, (b) => b.shF, (b) => b.elF),
      pair(`crew${k}ForeF`, `crew${k}ArmF`, (b) => b.elF, (b) => b.hnF),
    );
  }
  const crewSlots = (k: Crew) => crewPieces(k).map((p) => `${k}_${p}`);
  const gun = OZ_PIECES.map((p) => `o_${p}`);
  // From the front the crew stand beyond the gun; from behind they are this side of it.
  const se = [...crewSlots('G'), ...crewSlots('L'), ...gun, 'fx', 'flash'];
  const ne = [...gun, ...crewSlots('G'), ...crewSlots('L'), 'fx', 'flash'];
  const slots: SlotData[] = se.map((name) => {
    if (name.startsWith('o_')) return { name, bone: name === 'o_barrel' ? 'gun' : 'root', attachment: { all: name } };
    if (name === 'fx' || name === 'flash') return { name, bone: 'root', attachment: { all: name } };
    const [k, p] = name.split('_') as [Crew, ManPiece];
    const arm = ARM[p];
    return { name, bone: arm ? `crew${k}${arm}` : `crew${k}`, attachment: { all: name } };
  });
  return { name: 'samurai-engine-9', body: 'engine', bones: bonesFromJoints(defs), slots, drawOrder: { se, ne } };
}

function engineParts(): AttachmentSet {
  const atts: AttachmentSet = {};
  for (const k of CREWS) {
    const cr = OZ_CREW[k];
    for (const p of crewPieces(k)) atts[`${k}_${p}`] = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, crewRest(k, ctx.posed.facing), cr.d, cr.gear, p, ctx.posed.facing === 'ne'));
  }
  for (const p of OZ_PIECES) atts[`o_${p}`] = (c, x) => withMap(partMap(x), () => ozPiece(c, p as OzPiece));
  // The shot: the priming flashes at the touch-hole a beat before the muzzle; the muzzle flash; the
  // smoke where the muzzle was, swelling and rolling forward and up. Each event carries its point.
  atts.fx = {
    cache: false,
    draw: (c, _x, ctx) => {
      for (const e of ctx.events) {
        if (!e.str) continue;
        const [x, y, deg] = e.str.split(',').map(Number) as [number, number, number];
        if (e.name === 'touch') muzzleFlash(c, [x, y], 180, 0.7);
        if (e.name === 'muzzle') muzzleFlash(c, [x, y], deg, e.int ? 2.2 : 3.6);
        if (e.name === 'smoke') smoke(c, [x + 1.8, y - 0.4], (e.int! + 1) / 7, 13, 3.2);
      }
    },
  };
  atts.flash = {
    cache: false,
    draw: (c, _x, ctx) => {
      if (!ctx.events.some((e) => e.name === 'flash')) return;
      for (let y = c.by0; y <= c.by1; y++)
        for (let xx = c.bx0; xx <= c.bx1; xx++) {
          const i = y * c.CW + xx, v = c.pix[i]!;
          if (v >= 0) c.pix[i] = v - (v & 7) + Math.min(4, (v & 7) + 2);
        }
    },
  };
  return atts;
}

/** Keys at every frame for a clip, from authored tracks (the gun has no capture). */
function keysFrom(n: number, a: Author, skel: SkeletonData, f: Facing): KP[] {
  const keys: KP[] = [];
  for (let i = 0; i <= n; i++) keys.push({ f: i });
  return overlayKeys(keys, a(restWorld(skel, f), f));
}

/**
 * Load and fire: 0-1 the loader rams the charge home, leaning in over the muzzle, and draws the
 * rammer out (2); 3 he steps clear and turns his face away; 3-5 the gunner leans in and lowers the
 * match to the touch-hole; 6 the priming flashes and the gun fires; 7 the recoil throws the barrel
 * back off its cradle, the muzzle kicking up; the crew flinch from the blast; 8-9 the gun settles
 * and is run back; 10-11 the loader swabs the bore for the next charge.
 */
const SHOT: Author = () => ({
  dw: {
    crewL: T([0, 0], [0.5, 14], [1, 16], [2, 4], [3, -10], [6, -12], [7, -18], [8, -10], [9, 0], [10, 12], [11, 0]),
    crewLArmN: T([0, 0], [1, 40], [2, 10], [3, 0], [10, 36], [11, 0]),
    crewLForeN: T([0, 0], [1, 28], [2, 8], [3, 0], [10, 24], [11, 0]),
    crewG: T([0, 0], [3, -6], [4, -16], [5, -20], [6, -16], [7, 8], [8, 4], [9, 0], [11, 0]),
    crewGArmN: T([0, 0], [3, 40], [4, 80], [5, 96], [6, 90], [7, 40], [9, 10], [11, 0]),
    crewGForeN: T([0, 0], [3, 40], [4, 90], [5, 112], [6, 104], [7, 60], [9, 10], [11, 0]),
    gun: T([0, 0], [5.5, 0], [6, 4], [7, 10], [8, 6], [9, 2], [10, 0]),
  },
  tAdd: {
    gun: [T([0, 0], [5.5, 0], [6, -0.7], [7, -1.4], [8, -1.1], [9, -0.4], [10, 0]), T([0, 0], [6, -0.2], [7, -0.3], [8, -0.1], [10, 0])],
    crewL: [T([0, 0], [1, -0.4], [2, -0.1], [3, 0.8], [8, 0.8], [9, 0.3], [10, -0.4], [11, 0]), T([0, 0])],
    crewG: [T([0, 0], [4, 0.3], [5, 0.5], [6, 0.4], [7, -0.3], [9, 0], [11, 0]), T([0, 0])],
  },
});
/** Waiting at the gun: the gunner's match smoulders and he shifts the linstock, the loader leans on his rammer (arms only: the two men's bodies stand on different sub-pixel origins, so moving them by a fraction would boil their hats). */
const IDLE: Author = () => ({ dw: { crewGForeN: T([0, 0], [4, 6], [8, 0]), crewLForeF: T([0, 0], [4, -6], [8, 0]) } });
/** Moving the gun: the crew heave at the bed with their arms, the gun shuffles along its chocks. */
const SHIFT: Author = () => ({
  dw: { crewGArmF: T([0, 0], [3, 24], [6, 0], [9, 24], [12, 0]), crewLArmF: T([0, 0], [3, -24], [6, 0], [9, -24], [12, 0]), crewGArmN: T([0, 0], [3, 14], [6, 0], [9, 14], [12, 0]), crewLArmN: T([0, 0], [3, -14], [6, 0], [9, -14], [12, 0]) },
  tAdd: { gun: [T([0, 0], [3, 0.15], [6, 0], [9, 0.15], [12, 0]), T([0, 0], [3, -0.12], [6, 0], [9, -0.12], [12, 0])] },
});
/** Struck: the gun jolts on its bed, the crew reel. */
const HITA: Author = () => ({ dw: { gun: T([0, -5], [1, -7], [2, -2], [4, 0]), crewG: T([0, 12], [1, 16], [3, 4], [4, 0]), crewL: T([0, -12], [1, -16], [3, -4], [4, 0]) }, tAdd: { gun: [T([0, -0.3], [1, -0.4], [3, 0], [4, 0]), T([0, 0])] } });
/** Wrecked: the barrel is thrown off its cradle, nose into the ground; the crew are flung down. */
const WRECK: Author = () => ({
  dw: { gun: T([0, 0], [3, 14], [5, -12], [7, -26], [8, -22], [11, -24]), crewG: T([0, 0], [2, 20], [5, 70], [7, 88], [8, 84], [11, 88]), crewL: T([0, 0], [2, -20], [5, -70], [7, -86], [8, -82], [11, -86]) },
  tAdd: {
    gun: [T([0, 0], [3, -0.6], [5, -0.9], [7, -1.0], [11, -1.0]), T([0, 0], [3, -0.8], [5, 0.2], [7, 0.9], [8, 0.7], [11, 0.9])],
    // (They stand on the far side of the bed, 1.7-1.9 units up the screen: they land on the ground there, below their feet.)
    crewG: [T([0, 0], [5, -1.4], [7, -2.0], [11, -2.0]), T([0, 0], [5, 0.6], [7, 1.1], [8, 0.9], [11, 1.1])],
    crewL: [T([0, 0], [5, 1.4], [7, 2.0], [11, 2.0]), T([0, 0], [5, 0.6], [7, 1.1], [8, 0.9], [11, 1.1])],
  },
});
/** Braced: the gunner crouched with the match poised over the touch-hole, the loader stood clear. */
const BRACE: Author = () => ({ dw: { crewG: T([0, -12]), crewGArmN: T([0, 50]), crewGForeN: T([0, 50]), crewL: T([0, -8]) }, tAdd: { crewG: [T([0, 0.3]), T([0, 0])], crewL: [T([0, 0.6]), T([0, 0])] } });

function engineClips(skel: SkeletonData): ClipSet {
  const fc = (name: string, n: number, loop: boolean, a: Author, ev: AnimEvent[] = []): Clip => facingClip(skel, name, n, loop, (f) => keysFrom(n, a, skel, f), ev);
  // The muzzle and the touch-hole where the gun fired (per facing), for the flash and the smoke.
  const shotFx = (c: Clip): Clip =>
    mapFacings(c, (a, f) => {
      const p = evaluate(skel, sampleClip(a, 6, 12, f), { level: 16, facing: f });
      const g = p.byName.gun!;
      const deg = g.step * 7.5;
      const len = Math.hypot(OZ.mz[0] - OZ.br[0], OZ.mz[1] - OZ.br[1]);
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const mz: P2 = [r2(g.x + Math.sin((deg * Math.PI) / 180) * (len + 0.6)), r2(g.y + Math.cos((deg * Math.PI) / 180) * (len + 0.6))];
      const th: P2 = [r2(g.x + 0.4), r2(g.y - 1.3)];
      const ev: AnimEvent[] = [
        { f: 5, name: 'touch', str: `${th[0]},${th[1]},0` },
        { f: 6, name: 'muzzle', int: 0, str: `${mz[0]},${mz[1]},${deg}` },
        { f: 7, name: 'muzzle', int: 1, str: `${mz[0]},${mz[1]},${deg}` },
        ...[6, 7, 8, 9, 10, 11].map((fr) => ({ f: fr, name: 'smoke', int: fr - 6, str: `${mz[0]},${mz[1]},${deg}` })),
      ];
      return { ...a, events: [...(a.events ?? []), ...ev] };
    });
  const shot = shotFx(fc('shot', 12, false, SHOT, [{ f: 6, name: 'release' }]));
  const die = fc('die', 12, false, WRECK, [{ f: 7, name: 'land' }]);
  return {
    [Anim.Idle]: fc('idle', 8, true, IDLE),
    [Anim.Walk]: fc('walk', 12, true, SHIFT),
    [Anim.Run]: fc('run', 12, true, SHIFT),
    [Anim.Attack]: shot,
    [Anim.Shoot]: shot,
    [Anim.Hit]: fc('hit', 5, false, HITA, []),
    [Anim.Die]: die,
    [Anim.Dead]: mapFacings(die, (a) => lastFrame(a, 'dead')),
    [Anim.Brace]: fc('brace', 8, true, BRACE),
  };
}

let RIG: SkeletonRig | undefined;
export function engineRig(): SkeletonRig {
  if (RIG) return RIG;
  const skel = engineSkel();
  RIG = { skel, atts: engineParts(), clips: engineClips(skel) };
  return RIG;
}
export function registerEngineRig(kind: number): void {
  registerPaperKind('samurai', kind, samuraiKind(engineRig()));
}
void (null as unknown as Paper);
