// Pixel-art upscaling for the effects sheet in the HD art: EPX / Scale2x (Eric Johnston, Andrea
// Mazzoleni), applied once or twice. It doubles the resolution and rounds stair-steps into clean
// diagonals without inventing colours or blurring, so standards, missiles and puffs sit next to
// the hi-res figures without looking eight times blockier than them.

/** Scale2x of an RGBA image (as 32-bit pixels). */
export function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * 2 * h * 2);
  const W2 = w * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x]!;
      const a = y > 0 ? src[(y - 1) * w + x]! : p;
      const b = x < w - 1 ? src[y * w + x + 1]! : p;
      const c = x > 0 ? src[y * w + x - 1]! : p;
      const d = y < h - 1 ? src[(y + 1) * w + x]! : p;
      let e0 = p, e1 = p, e2 = p, e3 = p;
      if (a !== d && c !== b) {
        if (c === a) e0 = a;
        if (a === b) e1 = b;
        if (d === c) e2 = c;
        if (b === d) e3 = d;
      }
      const o = y * 2 * W2 + x * 2;
      out[o] = e0;
      out[o + 1] = e1;
      out[o + W2] = e2;
      out[o + W2 + 1] = e3;
    }
  return out;
}

/** A canvas scaled up by 2^times with Scale2x, as RGBA bytes. */
export function upscaleCanvas(c: HTMLCanvasElement, times: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  let w = c.width, h = c.height;
  const data = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  let px: Uint32Array = new Uint32Array(data.buffer.slice(0));
  for (let i = 0; i < times; i++) {
    px = scale2x(px, w, h);
    w *= 2;
    h *= 2;
  }
  return { pixels: new Uint8ClampedArray(px.buffer), width: w, height: h };
}
