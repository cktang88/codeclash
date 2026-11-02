// Player display settings, kept in this browser.

export type ArtMode = 'classic' | 'hd';

const KEY = 'codeclash.art';

export function artMode(): ArtMode {
  try {
    return localStorage.getItem(KEY) === 'hd' ? 'hd' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setArtMode(mode: ArtMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage unavailable: the choice lasts this page only.
  }
  window.dispatchEvent(new CustomEvent('codeclash:art', { detail: mode }));
}
