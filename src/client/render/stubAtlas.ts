// TEMPORARY: a contract Atlas made from the old side-view sprites, so the isometric renderer can
// be built and tested before the real isometric sprites land. Delete at merge and import
// `buildAtlas` from sprites.ts in scene.ts instead.

import type { FactionId } from '../../game/factions.ts';
import { Anim, type Atlas, type Dir } from './contract.ts';
import { buildAtlas as buildOld, CELL_H, CELL_W, FOOT_X, FOOT_Y, Frame } from './sprites.ts';

/** Old frames played for each contract animation. */
const FRAMES: number[][] = [];
FRAMES[Anim.Idle] = [Frame.Idle];
FRAMES[Anim.Walk] = [Frame.Walk, Frame.Idle];
FRAMES[Anim.Run] = [Frame.Rout, Frame.Walk];
FRAMES[Anim.Attack] = [Frame.Idle, Frame.Attack, Frame.Attack];
FRAMES[Anim.Shoot] = [Frame.Idle, Frame.Attack, Frame.Attack];
FRAMES[Anim.Hit] = [Frame.Idle, Frame.Rout];
FRAMES[Anim.Die] = [Frame.Rout, Frame.Dead];
FRAMES[Anim.Dead] = [Frame.Dead];
FRAMES[Anim.Brace] = [Frame.Attack];

const TPF = [4, 2, 1, 1, 2, 1, 2, 1, 4];

export function buildStubAtlas(faction: FactionId, hue: number): Atlas {
  const old = buildOld(faction, hue);
  return {
    image: old.canvas,
    cellW: CELL_W,
    cellH: CELL_H,
    footX: FOOT_X,
    footY: FOOT_Y,
    frames: (_kind, anim) => FRAMES[anim]!.length,
    ticksPerFrame: (anim) => TPF[anim]!,
    at: (kind, anim, frame, dir: Dir) => {
      const f = FRAMES[anim]!;
      return old.at(kind, f[Math.min(f.length - 1, frame)]!, dir === 1 || dir === 2);
    },
  };
}
