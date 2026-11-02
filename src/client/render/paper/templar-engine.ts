// The Templar Mangonel (kind 9) on bones, rebuilt from the approved key art (templar-static.ts):
// a traction trebuchet (Maciejowski fol. 23v) worked by a team hauling on ropes from the short arm,
// and a loader at the sling. The throw follows the machine's mechanics: the pullers drop their
// weight on the ropes together, the beam whips over (the long arm swinging up and over the axle),
// the sling trails it and whips through, the stone leaves at the top; the beam swings back and is
// caught, the crew straighten and the loader lays the next stone in the pouch.

import { Anim } from '../contract.ts';
import { code, type P2, type Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { BREATH, bonesFromJoints, EASE, skeletonKind, type AnimEvent, type AttachmentSet, type Clip, type JointDef, type PartXf, type SkeletonData, type SkeletonRig, type SlotData } from './skeleton.ts';
import { T, type Author } from './templar-clips.ts';
import { paintAs, TM } from './templar-parts.ts';
import { facingClip, lastFrame, mapFacings, overlayKeys, partMap, restWorld, type ClipSet, type KP } from './templar-rig.ts';
import { CREW_KIT, ENGINE, enginePiece, MAN_PIECES, manPiece, manRest, withMap, type ManPiece, type ManRest, type PartMap, type SGear } from './templar-static.ts';

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
type Crew = 'L' | 'P';
const CREW: Record<Crew, { x: number; g: SGear }> = { L: { x: ENGINE.loaderX, g: ENGINE.loader }, P: { x: ENGINE.pullerX, g: ENGINE.puller } };
const ARM: Partial<Record<ManPiece, string>> = { upperArmN: 'ArmN', forearmN: 'ForeN', handN: 'ForeN', weapon: 'ForeN', upperArmF: 'ArmF', forearmF: 'ForeF', handF: 'ForeF', farItem: 'ForeF' };

function engineSkel(): SkeletonData {
  const { piv, longEnd, shortEnd, pouch } = ENGINE;
  const defs: JointDef[] = [
    { name: 'root', from: [0, 0], to: [0, 0] },
    { name: 'beam', parent: 'root', from: piv, to: shortEnd },
    { name: 'sling', parent: 'beam', from: longEnd, to: pouch },
  ];
  for (const k of ['L', 'P'] as Crew[]) {
    const { x, g } = CREW[k];
    const R = manRest(CREW_KIT, g);
    const o = (p: P2): P2 => add(p, [x, 0]);
    defs.push(
      { name: `crew${k}`, parent: 'root', from: [x, 0], to: [x, -14] },
      { name: `crew${k}ArmN`, parent: `crew${k}`, from: o(R.shN), to: o(R.elN) },
      { name: `crew${k}ForeN`, parent: `crew${k}ArmN`, from: o(R.elN), to: o(R.wrN) },
      { name: `crew${k}ArmF`, parent: `crew${k}`, from: o(R.shF), to: o(R.elF) },
      { name: `crew${k}ForeF`, parent: `crew${k}ArmF`, from: o(R.elF), to: o(R.wrF) },
    );
  }
  const crewSlots = (k: Crew) => MAN_PIECES.map((p) => `${k}_${p}`);
  const order = [...crewSlots('L'), 'farTimbers', 'beam', 'sling', 'stone', 'ropes', 'nearTimbers', ...crewSlots('P'), 'flash'];
  const slots: SlotData[] = order.map((name) => {
    if (name.includes('_')) {
      const [k, p] = name.split('_') as [Crew, ManPiece];
      const arm = ARM[p];
      return { name, bone: arm ? `crew${k}${arm}` : `crew${k}`, attachment: { all: name } };
    }
    const bone = name === 'beam' ? 'beam' : name === 'sling' || name === 'stone' ? 'sling' : 'root';
    return { name, bone, attachment: { all: name } };
  });
  return { name: 'templar-engine-9', body: 'engine', bones: bonesFromJoints(defs), slots, drawOrder: { se: order, ne: order } };
}

const shift = (m: PartMap, x: number): PartMap => ({ f: (p) => m.f(add(p, [x, 0])), inv: (p) => sub(m.inv(p), [x, 0]), deg: m.deg });

function engineParts(): AttachmentSet {
  const atts: AttachmentSet = {};
  const dark = true;
  for (const k of ['L', 'P'] as Crew[]) {
    const { x, g } = CREW[k];
    const R: ManRest = manRest(CREW_KIT, g);
    for (const p of MAN_PIECES) atts[`${k}_${p}`] = (c: Paper, xf: PartXf, ctx) => paintAs(c, dark, () => withMap(shift(partMap(xf), x), () => manPiece(c, CREW_KIT, g, p, R, { back: ctx.posed.facing === 'ne' })));
  }
  for (const p of ['farTimbers', 'beam', 'nearTimbers'] as const) atts[p] = (c: Paper, xf: PartXf) => paintAs(c, dark, () => withMap(partMap(xf), () => enginePiece(c, p)));
  // The stone rides in the pouch until the release.
  atts.stone = (c: Paper, xf: PartXf) => paintAs(c, dark, () => withMap(partMap(xf), () => enginePiece(c, 'stone')));
  // The sling: two cords from the long arm's end to the pouch (they follow the beam and the sling bone).
  atts.sling = {
    cache: false,
    draw: (c, _x, ctx) => {
      const b = ctx.posed.byName;
      const s = b.sling!;
      paintAs(c, dark, () => {
        c.line([s.x, s.y], [s.tx, s.ty], code(TM.leather, 2));
        c.line([s.x + 0.2, s.y + 0.1], [s.tx + 0.4, s.ty], code(TM.leather, 1));
      });
    },
  };
  // The ropes: from the short arm's end (wherever the beam is) to the pullers' fists.
  atts.ropes = {
    cache: false,
    draw: (c, _x, ctx) => {
      const b = ctx.posed.byName;
      const beam = b.beam!;
      const hands: P2[] = [[b.crewPForeN!.tx, b.crewPForeN!.ty], [b.crewPForeF!.tx, b.crewPForeF!.ty]];
      paintAs(c, dark, () => {
        ENGINE.ropes.forEach(([k], i) => {
          const h = hands[i < 2 ? 0 : 1]!;
          c.line([beam.tx + k, beam.ty], [h[0] + (i % 2) * 0.3, h[1] + 0.2], code(TM.white, 1));
        });
      });
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

/** Keys at every frame for a clip, from authored tracks (the engine has no capture). */
function keysFrom(n: number, a: Author, skel: SkeletonData, f: Facing): KP[] {
  const keys: KP[] = [];
  for (let i = 0; i <= n; i++) keys.push({ f: i });
  return overlayKeys(keys, a(restWorld(skel, f), f));
}

/** The throw: haul (0-3), the beam whips over (3-6), the sling releases at the top (6), the beam swings back and is caught (7-9), the crew straighten and the loader lays the next stone (8-11). */
const THROW: Author = () => ({
  dw: {
    // The beam's short arm goes down and forward: the long arm swings up and over the axle.
    beam: T([0, 0], [2, -8], [3, -34], [4, -84], [5, -134], [6, -168], [7, -176], [8, -150], [10, -40], [11, 0]),
    // The sling trails the long arm, then whips through past it.
    sling: T([0, 0], [3, -10], [4, -40], [5, -100], [6, -170], [7, -205], [8, -190], [10, -60], [11, 0]),
    // The pullers face the machine (screen left): they drop their weight back (to the right, away
    // from it) on the ropes and haul down hand over hand.
    crewP: T([0, 0], [2, -8], [3, -16], [5, -22], [7, -14], [9, -6], [11, 0]),
    crewPArmN: T([0, 0], [2, 18], [3, 50], [5, 95], [7, 80], [9, 30], [11, 0]),
    crewPForeN: T([0, 0], [3, 40], [5, 70], [7, 50], [11, 0]),
    crewPArmF: T([0, 0], [2, 16], [3, 46], [5, 90], [7, 76], [9, 28], [11, 0]),
    crewPForeF: T([0, 0], [3, 36], [5, 66], [7, 48], [11, 0]),
    // The loader stands clear, then turns and stoops to the pouch behind him.
    crewL: T([0, 0], [3, -4], [6, -3], [8, 12], [10, 20], [11, 6]),
    crewLArmN: T([0, 0], [8, -20], [10, -45], [11, -10]),
  },
  tAdd: { crewP: [T([0, 0], [3, 0.3], [6, 0.5], [11, 0]), T([0, 0], [3, 0.5], [5, 0.8], [8, 0.3], [11, 0])], crewL: [T([0, 0], [8, -0.6], [10, -0.9], [11, -0.3]), T([0, 0], [10, 0.5], [11, 0])] },
});
const IDLE: Author = () => ({ dw: {} });
/** Moving the machine: the crew rock and shift at the ropes and the frame (no capture of this, so it is kept small). */
const SHIFT: Author = () => ({ dw: {}, tAdd: { crewP: [T([0, 0], [3, 0.25], [6, 0], [9, 0.25], [12, 0]), T([0, 0], [3, 0.12], [6, 0], [9, 0.12], [12, 0])], crewL: [T([0, 0], [6, -0.25], [12, 0]), T([0, 0], [6, 0.12], [12, 0])] } });
const HITA: Author = () => ({ dw: { beam: T([0, 6], [1, 9], [2, 3], [4, 0]), crewP: T([0, 12], [1, 16], [3, 4], [4, 0]), crewL: T([0, 10], [1, 14], [3, 4], [4, 0]) }, tAdd: { root: [T([0, -0.3], [1, -0.4], [3, 0], [4, 0]), T([0, 0])] } });
/** Wrecked: the trestle gives and the machine topples back, the long arm driven into the ground; the crew are thrown. */
const WRECK: Author = () => ({
  dw: { root: T([0, 0], [3, 6], [6, 16], [8, 22], [9, 20], [11, 22]), beam: T([0, 0], [3, 8], [6, 22], [8, 30], [9, 27], [11, 30]), sling: T([0, 0], [6, 40], [9, 70], [11, 75]), crewP: T([0, 0], [2, -20], [5, -70], [8, -86], [9, -82], [11, -86]), crewL: T([0, 0], [3, 20], [6, 70], [8, 88], [9, 84], [11, 88]) },
  tAdd: { crewP: [T([0, 0], [5, 1.2], [8, 2.0], [11, 2.0]), T([0, 0], [5, 0], [8, 0], [11, 0])], crewL: [T([0, 0], [6, -1.0], [8, -1.6], [11, -1.6]), T([0, 0])], // The machine pivots on its rear foot (4.8 units behind the axle): it is lifted as it turns so that foot stays on the ground.
    root: [T([0, 0], [3, 0.03], [6, 0.18], [8, 0.35], [9, 0.29], [11, 0.35]), T([0, 0], [3, -0.5], [6, -1.32], [8, -1.8], [9, -1.64], [11, -1.8])] },
});
const BRACE: Author = () => ({ dw: { crewP: T([0, -10]), crewPArmN: T([0, 10]), crewPArmF: T([0, 10]), crewL: T([0, 6]) }, tAdd: { crewP: [T([0, 0]), T([0, 0.5])], crewL: [T([0, 0]), T([0, 0.4])] } });

function engineClips(skel: SkeletonData): ClipSet {
  const fc = (name: string, n: number, loop: boolean, a: Author, ev: AnimEvent[] = []): Clip => facingClip(skel, name, n, loop, (f) => keysFrom(n, a, skel, f), ev);
  const breath = (c: Clip): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', never> };
    const br = { anim: { ...BREATH, bones: { crewP: BREATH.bones!.chest!, crewL: BREATH.bones!.chest! } } };
    return { byFacing: { se: [{ anim: b.byFacing.se }, br], ne: [{ anim: b.byFacing.ne }, br] } };
  };
  const throwIt = fc('throw', 12, false, THROW, [{ f: 6, name: 'release' }]);
  // The stone leaves the pouch at the release and is back when the loader has laid the next.
  const withStone = (c: Clip) => mapFacings(c, (a) => ({ ...a, slots: { stone: [{ f: 0, v: 'stone' }, { f: 6, v: null }, { f: 11, v: 'stone' }] } }));
  const shot = withStone(throwIt);
  const die = fc('die', 12, false, WRECK, [{ f: 8, name: 'land' }]);
  return {
    [Anim.Idle]: breath(fc('idle', 8, true, IDLE)),
    [Anim.Walk]: fc('walk', 12, true, SHIFT),
    [Anim.Run]: fc('run', 12, true, SHIFT),
    [Anim.Attack]: shot,
    [Anim.Shoot]: shot,
    [Anim.Hit]: fc('hit', 5, false, HITA, [{ f: 0, name: 'flash' }]),
    [Anim.Die]: die,
    [Anim.Dead]: mapFacings(die, (a) => lastFrame(a, 'dead')),
    [Anim.Brace]: breath(fc('brace', 8, true, BRACE)),
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
  registerPaperKind('templar', kind, skeletonKind(engineRig()));
}
void EASE;
