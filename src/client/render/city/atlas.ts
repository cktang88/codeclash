// The soldiers' sprite atlas as the city sees it: contract.ts's Atlas. While sprites.ts is being
// rebuilt into four-facing animated sprites, this adapts whatever it exports: a contract atlas
// is used as it is; the older two-facing, five-frame atlas is wrapped to answer the contract.

import { Anim, type Atlas, type Dir } from '../contract.ts';
import type { FactionId } from '../../../game/factions.ts';
import * as sprites from '../sprites.ts';

const S = sprites as unknown as Record<string, unknown>;

function isContract(a: unknown): a is Atlas {
  return !!a && typeof a === 'object' && 'image' in a && typeof (a as Atlas).frames === 'function';
}

interface Legacy {
  canvas: HTMLCanvasElement;
  at(kind: number, frame: number, left: boolean): [number, number];
}

export function cityAtlas(faction: FactionId, hue: number): Atlas {
  const build = S.buildAtlas as ((f: FactionId, h: number) => unknown) | undefined;
  const made = build?.(faction, hue);
  if (isContract(made)) return made;
  const old = made as Legacy | undefined;
  const cellW = (S.CELL_W as number | undefined) ?? 24;
  const cellH = (S.CELL_H as number | undefined) ?? 20;
  // Legacy frames: Idle 0, Walk 1, Attack 2, Dead 3, Rout 4.
  const walkFrames = (anim: Anim) => (anim === Anim.Walk || anim === Anim.Run ? 2 : anim === Anim.Attack || anim === Anim.Shoot ? 2 : 1);
  const legacyFrame = (anim: Anim, frame: number): number => {
    switch (anim) {
      case Anim.Walk:
      case Anim.Run:
        return frame % 2 ? 1 : 0;
      case Anim.Attack:
      case Anim.Shoot:
        return frame % 2 ? 2 : 0;
      case Anim.Die:
      case Anim.Dead:
        return 3;
      case Anim.Hit:
        return 4;
      default:
        return 0;
    }
  };
  const blank = document.createElement('canvas');
  return {
    image: old?.canvas ?? blank,
    cellW,
    cellH,
    footX: (S.FOOT_X as number | undefined) ?? 12,
    footY: (S.FOOT_Y as number | undefined) ?? 19,
    frames: (_kind, anim) => walkFrames(anim),
    ticksPerFrame: (anim) => (anim === Anim.Walk ? 3 : anim === Anim.Run ? 2 : 4),
    at: (kind: number, anim: Anim, frame: number, dir: Dir) => (old ? old.at(kind, legacyFrame(anim, frame), dir === 1 || dir === 2) : [0, 0]),
  };
}
