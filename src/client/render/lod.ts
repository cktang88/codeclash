/** Below this zoom soldiers are drawn as dots and platoons as banner tokens. */
export const FAR_ZOOM = 0.55;

/**
 * Levels of detail by zoom, with hysteresis so a camera resting near a threshold does not
 * flicker between them, and a short cross-fade between far and near.
 *
 * - far (below FAR_IN, until back above FAR_OUT): no soldiers; each platoon's kind-blocks.
 * - mid (below MID_ZOOM): soldiers drawn, but lighter: no walk cycle away from the centre of
 *   the view, and minor particles, decals and effects thinned.
 * - close: everything.
 */
export const FAR_IN = 0.5;
export const FAR_OUT = 0.6;
export const MID_ZOOM = 0.95;
/** Time to cross-fade between soldiers and blocks. */
export const FADE_MS = 260;

export interface LodState {
  far: boolean;
  /** 0 = soldiers, 1 = blocks; eases toward `far` over FADE_MS. */
  farMix: number;
  /** Below MID_ZOOM (and not far). */
  mid: boolean;
}

export function initialLod(zoom: number): LodState {
  const far = zoom < FAR_ZOOM;
  return { far, farMix: far ? 1 : 0, mid: !far && zoom < MID_ZOOM };
}

/** Advances the level for this frame's zoom. Reduced motion skips the fade. */
export function stepLod(s: LodState, zoom: number, dtMs: number, reduced = false): LodState {
  if (s.far && zoom > FAR_OUT) s.far = false;
  else if (!s.far && zoom < FAR_IN) s.far = true;
  const target = s.far ? 1 : 0;
  const step = reduced ? 1 : dtMs / FADE_MS;
  s.farMix = s.farMix < target ? Math.min(target, s.farMix + step) : Math.max(target, s.farMix - step);
  s.mid = !s.far && zoom < MID_ZOOM;
  return s;
}
