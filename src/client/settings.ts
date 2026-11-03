// Player display settings, kept in this browser.

/**
 * The pixel art: classic 48 px cells, HD (paper-doll figures up to 128), or HD 64 (battles only:
 * the 128 figures halved to 64 with a pixel-art reduction; the city draws its HD art).
 */
export type ArtMode = 'classic' | 'hd' | 'hd64';

export const ART_MODES: readonly ArtMode[] = ['classic', 'hd', 'hd64'];

const KEY = 'codeclash.art';

/** A stored or passed value as an art mode (anything unknown is classic). */
export function parseArt(v: string | null | undefined): ArtMode {
  return v === 'hd' || v === 'hd64' ? v : 'classic';
}

export function artMode(): ArtMode {
  try {
    return parseArt(localStorage.getItem(KEY));
  } catch {
    return 'classic';
  }
}

/** Whether a mode draws the HD painter's figures (HD and HD 64). */
export const isHdArt = (mode: ArtMode): boolean => mode !== 'classic';

/** The art the city draws for a mode: HD 64 changes battles only, so its city is the HD city. */
export const cityArt = (mode: ArtMode): 'classic' | 'hd' => (isHdArt(mode) ? 'hd' : 'classic');

/** The next mode in the cycle classic → HD → HD 64 → classic (the battle's art button). */
export const nextArt = (mode: ArtMode): ArtMode => ART_MODES[(ART_MODES.indexOf(mode) + 1) % ART_MODES.length]!;

export function setArtMode(mode: ArtMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage unavailable: the choice lasts this page only.
  }
  window.dispatchEvent(new CustomEvent('codeclash:art', { detail: mode }));
}
