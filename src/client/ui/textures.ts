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
import wood from './art/table.svg?url';
import seal from './art/seal.svg?url';
import sealGold from './art/seal-gold.svg?url';
import sealBlue from './art/seal-blue.svg?url';
import grainNight from './art/grain-night.svg?url';

const TEXTURES: Record<string, string> = {
  '--leaf': leaf,
  '--leaf-night': leafNight,
  '--note': note,
  '--note-shade': noteShade,
  '--wood': wood,
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

/**
 * Baked bitmaps are kept in Cache Storage, keyed by texture, density and source, so a returning
 * viewer's page never rasterizes them again: the feTurbulence drawing was seconds of main-thread
 * work on software rendering, right while the battlefield was starting.
 */
const BAKED_CACHE = 'pf-baked-v1';

function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

async function openBaked(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(BAKED_CACHE);
  } catch {
    return null;
  }
}

function rasterizeBlob(url: string, scale: number): Promise<Blob> {
  return rasterize(url, scale).then(async (objectUrl) => {
    const blob = await (await fetch(objectUrl)).blob();
    URL.revokeObjectURL(objectUrl);
    return blob;
  });
}

/** Resolves on the next idle moment (or soon, where idle callbacks do not exist). */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 50);
  });
}

export function bakeTextures(): void {
  if (typeof document === 'undefined') return;
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const root = document.documentElement.style;
  void (async () => {
    const cache = await openBaked();
    const todo: [string, string, string][] = [];
    // Cached ones first, all at once: they cost no drawing.
    for (const [name, url] of Object.entries(TEXTURES)) {
      const key = `/__baked/${name.slice(2)}-${scale}-${hashOf(url)}.png`;
      const hit = cache ? await cache.match(key).catch(() => undefined) : undefined;
      if (hit) root.setProperty(name, `url("${URL.createObjectURL(await hit.blob())}")`);
      else todo.push([name, url, key]);
    }
    // The rest one at a time in idle moments, so first paint and the battlefield's start come first.
    for (const [name, url, key] of todo) {
      await idle();
      try {
        const blob = await rasterizeBlob(url, scale);
        root.setProperty(name, `url("${URL.createObjectURL(blob)}")`);
        await cache?.put(key, new Response(blob, { headers: { 'content-type': 'image/png' } })).catch(() => undefined);
      } catch {
        // The stylesheet keeps the SVG.
      }
    }
  })();
}
