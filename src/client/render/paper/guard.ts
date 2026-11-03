// Blows from the guard. A man in a fight stands in his guard (Anim.Brace: shield up, blade cocked,
// spear levelled, katana in chūdan), not at rest, so every melee blow leaves the guard and comes
// back to it: frame 0 and the last frame of an Attack are the Brace clip's frame 0 exactly, and the
// blow's own anticipation (its chamber) grows out of the guard over the first frames. Blows then
// chain without a pop, and the renderer can hold the guard between them (scene.ts; contract.ts
// Anim.Brace). See docs/art-references/guards.md and README "Blows start from the guard".
//
// The blend works on the sampled channels (local rotations, translations, IK mixes), per drawn
// facing, so it serves every faction's foot, mounted and beast kinds alike: the blow is authored
// from rest as before, and this moves its ends onto the guard by a weight per frame.

import type { Facing } from './facing.ts';
import { animationFromPoses, clipBase, sampleClip, shortest, type AnimationData, type BoneLocal, type Clip, type Locals, type PoseKey, type SkeletonData } from './skeleton.ts';

/**
 * How much of the guard each of a 12-frame blow's frames keeps: all of it at 0 and 11, fading over
 * the anticipation (the chamber is the blow's own by frame 3) and back over the recovery.
 */
export const FROM_GUARD: readonly number[] = [1, 0.62, 0.24, 0, 0, 0, 0, 0, 0, 0.28, 0.66, 1];

const ease = (w: number): number => w * w * (3 - 2 * w);

/**
 * One pose between the blow's `a` and the guard's `g`, `w` of the way to the guard. Rotations are
 * blended as *world* angles (each bone the short way round in the figure's frame, then turned back
 * into locals), so an arm going from a couched lance to an overhand grip does not whirl the long
 * way because its upper arm and forearm each took their own short way.
 */
function blend(skel: SkeletonData, facing: Facing, a: Locals, g: Locals, w: number, only?: (bone: string) => boolean): PoseKey['bones'] & object {
  const out: Record<string, BoneLocal> = {};
  const wa = new Map<string, number>(), wg = new Map<string, number>(), wb = new Map<string, number>();
  for (const bone of skel.bones) {
    const n = bone.name;
    const rest = bone.facing?.[facing]?.rot ?? bone.rot;
    const inherit = bone.parent !== undefined && bone.inherit !== 'translation';
    const pa = inherit ? wa.get(bone.parent!)! : 0, pg = inherit ? wg.get(bone.parent!)! : 0, pb = inherit ? wb.get(bone.parent!)! : 0;
    const x = a.bones[n] ?? {}, y = only && !only(n) ? undefined : (g.bones[n] ?? {});
    const ra = pa + rest + (x.rot ?? 0), rg = pg + rest + ((y ?? x).rot ?? 0);
    wa.set(n, ra);
    wg.set(n, rg);
    // A bone left to the blow keeps its own local turn; the rest go the short way in world terms.
    const rb = y ? ra + shortest(rg - ra) * w : pb + rest + (x.rot ?? 0);
    wb.set(n, rb);
    const yy = y ?? x;
    const b: BoneLocal = {};
    if (x.rot !== undefined || yy.rot !== undefined || Math.abs(rb - pb - rest) > 1e-6) b.rot = Math.round((rb - pb - rest) * 100) / 100;
    if (x.x !== undefined || yy.x !== undefined || x.y !== undefined || yy.y !== undefined) {
      b.x = Math.round(((x.x ?? 0) + ((yy.x ?? 0) - (x.x ?? 0)) * w) * 1000) / 1000;
      b.y = Math.round(((x.y ?? 0) + ((yy.y ?? 0) - (x.y ?? 0)) * w) * 1000) / 1000;
    }
    if (x.sy !== undefined || yy.sy !== undefined) b.sy = (x.sy ?? 1) + ((yy.sy ?? 1) - (x.sy ?? 1)) * w;
    if (Object.keys(b).length) out[n] = b;
  }
  return out;
}

/**
 * The blow `attack` (n frames, not looping) re-laid to start and end in the guard: frame f is the
 * blow's own pose moved toward the guard's frame 0 by `env[f]` (eased). Slots, draw order, IK
 * bends and events stay the blow's. `guardN` is the guard clip's frame count (Brace: 8). `only`
 * limits the blend to some bones (a rider's, so a lancer's gallop under him is left alone).
 */
export function fromGuard(skel: SkeletonData, attack: Clip, guard: Clip, o: { n?: number; env?: readonly number[]; guardN?: number; facings?: readonly Facing[]; only?: (bone: string) => boolean } = {}): Clip {
  const { n = 12, env = FROM_GUARD, guardN = 8, facings = ['se', 'ne'], only } = o;
  const one = (f: Facing): AnimationData => {
    const base = clipBase(attack, f);
    const g = sampleClip(guard, 0, guardN, f);
    const poses: PoseKey[] = [];
    for (let fr = 0; fr < n; fr++) {
      const a = sampleClip(attack, fr, n, f);
      const w = ease(Math.max(0, Math.min(1, env[fr] ?? 0)));
      const ik: Record<string, number> = {};
      for (const k of new Set([...Object.keys(a.ik), ...Object.keys(g.ik)])) {
        const m0 = a.ik[k]?.mix, m1 = only && !only(k) ? m0 : g.ik[k]?.mix;
        if (m0 === undefined && m1 === undefined) continue;
        ik[k] = (m0 ?? 1) + ((m1 ?? 1) - (m0 ?? 1)) * w;
      }
      poses.push({ f: fr, bones: blend(skel, f, a, g, w, only), ...(Object.keys(ik).length ? { ik } : {}) });
    }
    const out = animationFromPoses(base.name, n, false, poses, base.events ? [...base.events] : []);
    if (base.slots) out.slots = base.slots;
    if (base.drawOrder) out.drawOrder = base.drawOrder;
    for (const [k, v] of Object.entries(base.ik ?? {})) if (v.bend) (out.ik ??= {})[k] = { ...(out.ik?.[k] ?? {}), bend: v.bend };
    return out;
  };
  return { byFacing: Object.fromEntries(facings.map((f) => [f, one(f)])) };
}

/** Bones of a horse (and its harness): a rider's guard leaves them to the blow. */
export const HORSE_BONE = /^(root|horse|tail|saddle|capar|mane|fore[FN]|hind[FN]|bridle|rein)/;
export const riderOnly = (bone: string): boolean => !HORSE_BONE.test(bone);
