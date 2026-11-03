/**
 * The size of a pixel-art canvas over `devW × devH` device pixels at `dpr` device px per CSS px:
 * every canvas pixel a whole number k × k of device pixels (k = 1 up to 2x screens, 2 on a 3x
 * phone: there 1.5 × 1.5 would make rows and columns of uneven width), and the CSS size that
 * covers exactly w·k × h·k device pixels.
 */
export function canvasSize(devW: number, devH: number, dpr: number): { w: number; h: number; k: number; cssW: number; cssH: number } {
  const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const k = Math.max(1, Math.ceil(d / 2 - 1e-6));
  const w = Math.max(1, Math.floor(devW / k));
  const h = Math.max(1, Math.floor(devH / k));
  return { w, h, k, cssW: (w * k) / d, cssH: (h * k) / d };
}
