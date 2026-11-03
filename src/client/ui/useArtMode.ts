import { useEffect, useState } from 'react';
import { artMode, setArtMode, type ArtMode } from '../settings.ts';

/** The pixel-art setting, kept in step across every view (and tabs) that shows it. */
export function useArtMode(): [ArtMode, (mode: ArtMode) => void] {
  const [mode, setMode] = useState<ArtMode>(artMode);
  useEffect(() => {
    const sync = () => setMode(artMode());
    window.addEventListener('codeclash:art', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('codeclash:art', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [mode, setArtMode];
}

export const ART_LABEL: Record<ArtMode, string> = { classic: 'Classic 48', hd: 'HD 128', hd64: 'HD 64' };
