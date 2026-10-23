/**
 * The codex's paper, wax and wood are SVG feTurbulence drawings (docs/art-direction.md §4).
 * Browsers re-run SVG filters whenever a background repaints, which costs whole frames on
 * software rendering, so each texture is drawn once into a bitmap at the screen's density and
 * swapped in through its CSS variable. Until then the stylesheet uses the SVG itself.
 */
import leaf from './art/leaf.svg?url';
import leafNight from './art/leaf-night.svg?url';
import note from './art/note.svg?url';
import noteShade from './art/note-shade.svg?url';
import table from './art/table.svg?url';
import seal from './art/seal.svg?url';
import sealGold from './art/seal-gold.svg?url';
import sealBlue from './art/seal-blue.svg?url';
import grainNight from './art/grain-night.svg?url';

const TEXTURES: Record<string, string> = {
  '--leaf': leaf,
  '--leaf-night': leafNight,
  '--note': note,
  '--note-shade': noteShade,
  '--table': table,
  '--seal': seal,
  '--seal-gold': sealGold,
  '--seal-blue': sealBlue,
  '--grain-night': grainNight,
};

function rasterize(url: string, scale: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

export function bakeTextures(): void {
  if (typeof document === 'undefined') return;
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const root = document.documentElement.style;
  for (const [name, url] of Object.entries(TEXTURES)) {
    rasterize(url, scale).then(
      (baked) => root.setProperty(name, `url("${baked}")`),
      () => undefined,
    );
  }
}
