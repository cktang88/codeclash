// RotSprite for the rare hand-pixelled bitmap part (an emblem, a crest) that has to turn with a
// bone. Everything else is re-rasterised from outlines at the snapped angle and never needs this.
//
// A TypeScript port of the algorithm in Aseprite's `src/doc/algorithm/rotsprite.cpp`
// (Aseprite Document Library, MIT licence, Copyright (c) 2019-2024 Igara Studio S.A., Copyright
// (c) 2001-2016 David Capello), after Xenowhirl's RotSprite: the image is scaled up 8x by Scale2x
// three times (which keeps 1 px lines and diagonals connected), then rotated and sampled back at
// 1x with nearest neighbour, in one pass. Angles are the skeleton's snapped steps only (7.5°), and
// the rotation uses its fixed sine table, so the output is the same in every browser. Credited in
// README.md.

import type { Paper, P2 } from './core.ts';
import { cosStep, sinStep, type Attachment } from './skeleton.ts';

/** A bitmap of pixel codes (material*8 + tone, or -1 for transparent), row-major. */
export interface CodeBitmap {
  w: number;
  h: number;
  pix: Int16Array;
}

/** Scale2x (EPX / AdvMAME2x): each pixel becomes four, corners taking an agreeing neighbour. */
export function scale2x(src: CodeBitmap): CodeBitmap {
  const { w, h, pix } = src;
  const out = new Int16Array(w * 2 * h * 2);
  const at = (x: number, y: number) => pix[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]!;
  const W = w * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const E = at(x, y), B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1);
      let e0 = E, e1 = E, e2 = E, e3 = E;
      if (B !== H && D !== F) {
        if (D === B) e0 = D;
        if (B === F) e1 = F;
        if (D === H) e2 = D;
        if (H === F) e3 = F;
      }
      const i = y * 2 * W + x * 2;
      out[i] = e0;
      out[i + 1] = e1;
      out[i + W] = e2;
      out[i + W + 1] = e3;
    }
  return { w: W, h: h * 2, pix: out };
}

/**
 * Rotates a bitmap by `step` snapped steps (step · 7.5°) in the rig's sense, as a bone turns: +
 * swings a downward line forward (toward screen right), as rotStep does. `pivot` is in pixel
 * coordinates ([3.5, 2.5] is the centre of pixel 3,2). Returns the rotated bitmap and where the
 * pivot lands in it.
 */
export function rotSprite(src: CodeBitmap, step: number, pivot: P2): { img: CodeBitmap; pivot: P2 } {
  const s = sinStep(step), c = cosStep(step);
  // Forward map of rotStep: (x, y) → (x c + y s, -x s + y c); inverse: (X c - Y s, X s + Y c).
  const fwd = (x: number, y: number): P2 => [x * c + y * s, -x * s + y * c];
  const corners = [fwd(-pivot[0], -pivot[1]), fwd(src.w - pivot[0], -pivot[1]), fwd(-pivot[0], src.h - pivot[1]), fwd(src.w - pivot[0], src.h - pivot[1])];
  // Output pixel edges keep the pivot's sub-pixel phase (a pixel-centre pivot stays on a centre;
  // step 0 is the identity).
  const x0 = Math.floor(Math.min(...corners.map((p) => p[0])) + pivot[0] + 1e-9) - pivot[0], x1 = Math.ceil(Math.max(...corners.map((p) => p[0])) + pivot[0] - 1e-9) - pivot[0];
  const y0 = Math.floor(Math.min(...corners.map((p) => p[1])) + pivot[1] + 1e-9) - pivot[1], y1 = Math.ceil(Math.max(...corners.map((p) => p[1])) + pivot[1] - 1e-9) - pivot[1];
  const W = Math.round(x1 - x0), H = Math.round(y1 - y0);
  const big = scale2x(scale2x(scale2x(src)));
  const out = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const X = x0 + x + 0.5, Y = y0 + y + 0.5;
      const sx = (X * c - Y * s + pivot[0]) * 8, sy = (X * s + Y * c + pivot[1]) * 8;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= big.w || iy >= big.h) continue;
      out[y * W + x] = big.pix[iy * big.w + ix]!;
    }
  return { img: { w: W, h: H, pix: out }, pivot: [-x0, -y0] };
}

/**
 * A bone part from hand-pixelled bitmaps, one per detail level (levels without one draw nothing):
 * drawn as it is at the bone's rest angle and turned by RotSprite as the bone turns, its pivot on
 * the bone origin plus `at` (bone-local units). Cached per angle like any part.
 */
export function bitmapPart(byLevel: Partial<Record<number, { bmp: CodeBitmap; pivot: P2 }>>, at: P2 = [0, 0]): Attachment {
  const memo = new Map<string, { img: CodeBitmap; pivot: P2 }>();
  return {
    draw: (c: Paper, x) => {
      const src = byLevel[c.L];
      if (!src) return;
      const k = `${c.L}|${x.turned}`;
      let r = memo.get(k);
      if (!r) memo.set(k, (r = x.turned === 0 ? { img: src.bmp, pivot: src.pivot } : rotSprite(src.bmp, x.turned, src.pivot)));
      const o = x.at(at);
      // The pivot (a point in image px) lands on the bone origin's pixel centre.
      const ox = Math.round(c.sx(o[0]) + 0.5 - r.pivot[0]), oy = Math.round(c.sy(o[1]) + 0.5 - r.pivot[1]);
      c.order++;
      for (let y = 0; y < r.img.h; y++) for (let xx = 0; xx < r.img.w; xx++) c.plot(ox + xx, oy + y, r.img.pix[y * r.img.w + xx]!);
    },
  };
}
