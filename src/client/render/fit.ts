// The battle camera's default view: the armies framed in the part of the canvas the HUD leaves
// clear (pure: no DOM, testable in Node).

/** Device px of the canvas covered by the HUD along each edge. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** A box in map px. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The smallest scale (device px per map px) a zoomed-out view goes to: below half, nearest
 * sampling drops more pixels than it keeps (one-pixel outlines vanish), but since the field
 * doubled (docs/art-references/battle-scale.md) a 1280 x 720 window needs 3/8 to show both armies
 * deployed: the blocks then read as Total War's do from high up, dark masses under their standards.
 */
export const MIN_SCALE = 0.375;
/** Scene-buffer px a side at most (every WebGL2 device renders to 4096). */
export const MAX_BUFFER = 4096;

/**
 * The scale for a zoom level below 1 on a canvas of W × H whose zoom 1 draws `fit` device px per
 * map px: whole device px per map px while that is at least 1 (crisp, as every level above), else
 * a fraction in sixteenths, at least MIN_SCALE and small enough a buffer (W / s) to render.
 */
export function zoomOutScale(zoom: number, fit: number, W: number, H: number): number {
  // (zoom is s / fit as frameBox chose it: the float division can land a hair under s)
  const s = fit * zoom + 1e-9;
  if (s >= 1) return Math.floor(s);
  const floor = Math.max(MIN_SCALE, W / MAX_BUFFER, H / MAX_BUFFER);
  return Math.min(1, Math.max(floor, Math.floor(s * 16) / 16));
}

/**
 * The default view of `box` (null: nothing on the field) on a W × H canvas, `insets` of it under
 * the HUD: the zoom (1, or below 1 when the box doesn't fit at zoom 1's scale `fit`) and the map
 * point at the canvas's centre, which puts the box's centre at the centre of the clear part.
 */
export function frameBox(box: Box | null, W: number, H: number, insets: Insets, fit: number): { zoom: number; mx: number; my: number } | null {
  if (!box || !(box.x1 > box.x0) || !(box.y1 > box.y0) || !(W > 0) || !(H > 0) || !(fit > 0)) return null;
  const l = Math.max(0, insets.left);
  const t = Math.max(0, insets.top);
  // Never let the HUD take more than most of the canvas (a phone in landscape).
  const cw = Math.max(W * 0.4, W - l - Math.max(0, insets.right));
  const ch = Math.max(H * 0.4, H - t - Math.max(0, insets.bottom));
  const need = Math.min(cw / (box.x1 - box.x0), ch / (box.y1 - box.y0));
  let zoom = 1;
  if (need < fit) {
    // The largest scale that fits, as zoomOutScale will draw it.
    zoom = need / fit;
    let s = zoomOutScale(zoom, fit, W, H);
    if (s > need) s = need >= 1 ? Math.floor(need) : s;
    zoom = Math.min(1, s / fit);
  }
  const s = zoom < 1 ? zoomOutScale(zoom, fit, W, H) : fit;
  // The clear part's centre, in device px from the canvas's centre, back to map px.
  const dx = Math.min(cw, W - l) / 2 + l - W / 2;
  const dy = Math.min(ch, H - t) / 2 + t - H / 2;
  return { zoom, mx: (box.x0 + box.x1) / 2 - dx / s, my: (box.y0 + box.y1) / 2 - dy / s };
}

/** The zoom-out floor and the canvas size (device px) it was set for. */
export interface ZoomFloor {
  zoom: number;
  W: number;
  H: number;
}

/**
 * The zoom-out floor after framing at `zoom` on a W × H canvas. Reframing on the same canvas (⤢
 * mid-battle, fewer men standing) never raises it: the viewer can still zoom out as far as the
 * opening view. A new canvas size starts afresh, as zoom levels below 1 are fractions of its scale.
 */
export function nextZoomFloor(prev: ZoomFloor | null, zoom: number, W: number, H: number): ZoomFloor {
  if (prev && prev.W === W && prev.H === H) return { zoom: Math.min(prev.zoom, zoom), W, H };
  return { zoom, W, H };
}
