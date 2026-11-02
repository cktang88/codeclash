// The paper-doll painter's core: the canvas (an explicit object, so workers and tests can each
// hold their own), the drawing primitives, the material table and its ramps, and the finishing
// passes. Figures (paper/<faction>.ts) draw with these; see README.md.
//
// Every part is an outline polygon or a stroke authored in sprite space, rasterised pixel-perfectly
// (a pixel is in when its centre is), and shaded by hand-placed rules: a lit band on the edge
// facing the top-left light, a shadow band on the far edge, small highlight clusters on hard
// materials, and painted details. Nothing is computed from 3D normals.

export type RGB = [number, number, number];
export type P2 = [number, number];

// ------------------------------------------------------------------ small maths

export const DEG = Math.PI / 180;
export const rot = (p: P2, a: number): P2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
export const addP = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];

/** A small deterministic hash in [0, 1). */
export function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ colour

export function hslRgb(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/**
 * The first paper ramp (HSL): five steps, darkest first; shadows slide toward `dark` hue and gain
 * saturation, lights toward `light` and lose it. Kept because the Grave Legionary's materials are
 * frozen on it; new materials use `oklchRamp`.
 */
export function hslRamp(h: number, s: number, l: number, dark: number, light: number, spread = 1): RGB[] {
  const toward = (a: number, b: number, k: number) => a + ((((b - a + 540) % 360) - 180) * k);
  const steps = [-2, -1, 0, 1, 2];
  return steps.map((k) => {
    const t = k / 2;
    const hh = t < 0 ? toward(h, dark, -t * 0.55) : toward(h, light, t * 0.45);
    const ss = Math.min(0.9, Math.max(0.04, s * (t < 0 ? 1 - t * 0.35 : 1 - t * 0.3)));
    const ll = Math.min(0.9, Math.max(0.06, l + t * 0.2 * spread * (t < 0 ? 1.15 : 0.9)));
    return hslRgb(hh, ss, ll);
  });
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0..255) to OKLab [L, a, b] (Ottosson). */
export function rgbOklab([r8, g8, b8]: RGB): [number, number, number] {
  const r = lin(r8 / 255), g = lin(g8 / 255), b = lin(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** OKLab to sRGB, pulling chroma in (hue and lightness kept) until the colour fits the gamut. */
export function oklabRgb(L: number, a: number, b: number): RGB {
  const inside = (k: number) => oklabLinear(L, a * k, b * k).every((c) => c >= -1e-4 && c <= 1 + 1e-4);
  let k = 1;
  if (!inside(1)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  const [r, g, bl] = oklabLinear(L, a * k, b * k);
  const to8 = (c: number) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, c))))) * 255);
  return [to8(r), to8(g), to8(bl)];
}

export const oklchRgb = (L: number, C: number, hDeg: number): RGB => oklabRgb(L, C * Math.cos(hDeg * DEG), C * Math.sin(hDeg * DEG));

/** The OKLCH hue of an HSL hue (the army's heraldic hue is given in HSL degrees). */
export function okHue(hslHue: number): number {
  const [, a, b] = rgbOklab(hslRgb(hslHue, 0.6, 0.45));
  return ((Math.atan2(b, a) / DEG) % 360 + 360) % 360;
}

/**
 * The light the ramps are built under (techniques guide §1.2): shadow steps mix toward the
 * ambient colour, light steps toward the key colour, in OKLab a/b.
 */
export interface LightRig {
  keyHue: number;
  keyChroma: number;
  ambientHue: number;
  ambientChroma: number;
}
/** Overcast day over a battlefield: a warm key, a cool violet ambient. */
export const DAY_RIG: LightRig = { keyHue: 85, keyChroma: 0.06, ambientHue: 290, ambientChroma: 0.045 };

export interface RampSpec {
  /** Base (middle step) OKLab lightness, 0..1; battle materials sit around 0.3-0.6. */
  l: number;
  /** Base chroma (≤ 0.07 for bone, steel, cloth and hide; ≥ 0.14 for the one accent). */
  c: number;
  /** OKLCH hue, degrees. */
  h: number;
  /** Lightness per step (default 0.085). Bigger for hard, shiny materials. */
  spread?: number;
  rig?: LightRig;
  /** Chroma multipliers for the five steps, darkest first (default peaks at the shade step). */
  chroma?: readonly [number, number, number, number, number];
}

/**
 * A five-step hue-shifted ramp built in OKLCH (techniques guide §1.1-1.3), darkest first:
 * lightness steps are unequal (the darks fall faster), chroma peaks at the shade step next to
 * the terminator and drains toward the light, shadows mix toward the rig's ambient hue and
 * lights toward its key. Never pure black or white.
 */
export function oklchRamp(spec: RampSpec): RGB[] {
  const rig = spec.rig ?? DAY_RIG;
  const spread = spec.spread ?? 0.085;
  const cm = spec.chroma ?? [0.8, 1.15, 1.0, 0.8, 0.6];
  const ha = Math.cos(spec.h * DEG), hb = Math.sin(spec.h * DEG);
  const amb: P2 = [rig.ambientChroma * Math.cos(rig.ambientHue * DEG), rig.ambientChroma * Math.sin(rig.ambientHue * DEG)];
  const key: P2 = [rig.keyChroma * Math.cos(rig.keyHue * DEG), rig.keyChroma * Math.sin(rig.keyHue * DEG)];
  return [-2, -1, 0, 1, 2].map((t, i) => {
    const L = Math.min(0.93, Math.max(0.13, spec.l + t * spread * (t < 0 ? 1.15 : 0.9)));
    let a = spec.c * cm[i]! * ha, b = spec.c * cm[i]! * hb;
    const [tx, ty, k] = t < 0 ? [amb[0], amb[1], -t * 0.17] : [key[0], key[1], t * 0.08];
    a += (tx - a) * k;
    b += (ty - b) * k;
    return oklabRgb(L, a, b);
  });
}

// ------------------------------------------------------------------ materials

/** A material: a ramp of five tones (0 darkest .. 4 lightest), possibly following the army's hue. */
export interface Material {
  name: string;
  ramp: (hue: number) => RGB[];
  /** Exempt from the small-cluster merge (inks, glows, single-pixel sparks). */
  keep?: boolean;
}
/** A material id (index into the table). Pixel codes are `mat * 8 + tone`. */
export type Mat = number;

const MATS: Material[] = [];
const BY_NAME = new Map<string, Mat>();

/**
 * Adds a material to the shared table (or returns the id it already has under that name). Name
 * faction materials `<faction>.<name>`. Registration order must be the same in every thread, so
 * call this at module top level only.
 */
export function defineMaterial(name: string, ramp: RGB[] | ((hue: number) => RGB[]), opts: { keep?: boolean } = {}): Mat {
  const had = BY_NAME.get(name);
  if (had !== undefined) return had;
  const fixed = Array.isArray(ramp) ? ramp : null;
  if (fixed && fixed.length !== 5) throw new Error(`material ${name}: a ramp has 5 tones`);
  const id = MATS.length;
  MATS.push({ name, ramp: fixed ? () => fixed : (ramp as (hue: number) => RGB[]), keep: opts.keep });
  BY_NAME.set(name, id);
  return id;
}
export const materialId = (name: string): Mat | undefined => BY_NAME.get(name);
export const materialCount = (): number => MATS.length;
export const isKept = (m: Mat): boolean => MATS[m]?.keep === true;

const PALS = new Map<number, { n: number; pal: RGB[][] }>();
/** Every material's ramp for an army's hue (cached). */
export function palette(hue: number): RGB[][] {
  const got = PALS.get(hue);
  if (got && got.n === MATS.length) return got.pal;
  const pal = MATS.map((m) => m.ramp(hue));
  PALS.set(hue, { n: MATS.length, pal });
  return pal;
}

/**
 * The shared base materials, in OKLCH, low-key (Diablo II / Darkest Dungeon values). Factions use
 * these or define their own beside them (`defineMaterial('templar.surcoat', ...)`).
 */
export const M = {
  bone: defineMaterial('bone', oklchRamp({ l: 0.6, c: 0.045, h: 80 })),
  rust: defineMaterial('rust', oklchRamp({ l: 0.42, c: 0.075, h: 45 })),
  mail: defineMaterial('mail', oklchRamp({ l: 0.47, c: 0.012, h: 70, spread: 0.09 })),
  iron: defineMaterial('iron', oklchRamp({ l: 0.38, c: 0.012, h: 250, spread: 0.09 })),
  steel: defineMaterial('steel', oklchRamp({ l: 0.6, c: 0.015, h: 240, spread: 0.11 })),
  gold: defineMaterial('gold', oklchRamp({ l: 0.62, c: 0.1, h: 85, spread: 0.1 })),
  team: defineMaterial('team', (hue) => oklchRamp({ l: 0.44, c: 0.14, h: okHue(hue), spread: 0.09 })),
  teamDk: defineMaterial('teamDk', (hue) => oklchRamp({ l: 0.33, c: 0.1, h: okHue(hue), spread: 0.07 })),
  linen: defineMaterial('linen', oklchRamp({ l: 0.72, c: 0.025, h: 85 })),
  rag: defineMaterial('rag', oklchRamp({ l: 0.32, c: 0.03, h: 50, spread: 0.07 })),
  wood: defineMaterial('wood', oklchRamp({ l: 0.4, c: 0.06, h: 55 })),
  leather: defineMaterial('leather', oklchRamp({ l: 0.34, c: 0.06, h: 45 })),
  flesh: defineMaterial('flesh', oklchRamp({ l: 0.62, c: 0.06, h: 55 })),
  ink: defineMaterial('ink', [[14, 10, 12], [20, 15, 16], [28, 21, 22], [36, 28, 28], [46, 36, 34]], { keep: true }),
  glow: defineMaterial('glow', [[40, 90, 60], [70, 140, 80], [110, 200, 110], [160, 235, 150], [215, 255, 200]], { keep: true }),
} as const;

/** A pixel code: material and tone (clamped to 0..4). */
export const code = (m: Mat, t: number): number => m * 8 + Math.max(0, Math.min(4, t));

// ------------------------------------------------------------------ the canvas

/** Canvas size in figure units (one unit ≈ one map pixel at level 1), and where the feet stand. */
export interface CanvasSize {
  /** Width in units: even, so mirroring keeps the foot point. */
  w: number;
  h: number;
  /** The foot line as a fraction of the height. */
  footY: number;
}

/** Shade callback of `poly`: return a code, or a negative number to leave the pixel. */
export type Shade = (x: number, y: number, u: number, v: number) => number;

/**
 * One painting surface: the pixel codes, the draw order of the part that painted each pixel
 * (for contact lines), and the previous frame (for anti-flicker). Not shared between threads.
 */
export class Paper {
  /** Canvas pixels per figure unit (the detail level: 1, 2, 4 or 8). */
  L = 8;
  CW = 0;
  CH = 0;
  /** The foot point in canvas pixels. */
  FX = 0;
  FY = 0;
  /** Per pixel: material*8 + tone, or -1. */
  pix = new Int16Array(0);
  ord = new Int16Array(0);
  prev = new Int16Array(0);
  order = 0;
  /** What the previous frame on this surface was (anti-flicker only follows on from it). */
  last = '';

  /** Clears the canvas for a level and size. */
  begin(level: number, size: CanvasSize = { w: 46, h: 50, footY: 0.86 }): void {
    this.L = level;
    const cw = size.w * level, ch = size.h * level;
    this.FX = Math.round(cw / 2);
    this.FY = Math.round(ch * size.footY);
    if (cw !== this.CW || ch !== this.CH) {
      this.pix = new Int16Array(cw * ch);
      this.ord = new Int16Array(cw * ch);
      this.prev = new Int16Array(cw * ch).fill(-1);
    }
    this.CW = cw;
    this.CH = ch;
    this.pix.fill(-1);
    this.ord.fill(-1);
    this.order = 0;
  }

  plot(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.CW || y >= this.CH || c < 0) return;
    const i = y * this.CW + x;
    this.pix[i] = c;
    this.ord[i] = this.order;
  }

  /** Figure units to canvas px. */
  sx(x: number): number {
    return this.FX + x * this.L;
  }
  sy(y: number): number {
    return this.FY + y * this.L;
  }

  /**
   * Fills a polygon (canvas px): a pixel is in when its centre is. `shade(x, y, u, v)` gets the
   * pixel and its position across (u: -1 lit edge .. 1 shadow edge) and along (v: 0..1) the part's
   * axis, when one is given, and returns a code.
   */
  poly(pts: P2[], shade: Shade, axis?: { a: P2; b: P2; w: number }): void {
    this.order++;
    const CW = this.CW, CH = this.CH;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(CH - 1, Math.ceil(y1));
    let ux = 0, uy = 0, vx = 0, vy = 0, len = 1;
    if (axis) {
      vx = axis.b[0] - axis.a[0];
      vy = axis.b[1] - axis.a[1];
      len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      // Across-axis unit pointing away from the light (top-left): +u is the shadow side.
      ux = -vy;
      uy = vx;
      if (ux * -1 + uy * -1 > 0) {
        ux = -ux;
        uy = -uy;
      }
    }
    const xs: number[] = [];
    for (let y = iy0; y <= iy1; y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]! - 0.5)), xb = Math.min(CW - 1, Math.floor(xs[k + 1]! - 0.5));
        for (let x = xa; x <= xb; x++) {
          let u = 0, v = 0;
          if (axis) {
            const dx = x + 0.5 - axis.a[0], dy = cy - axis.a[1];
            u = (dx * ux + dy * uy) / (axis.w / 2);
            v = (dx * vx + dy * vy) / len;
          }
          this.plot(x, y, shade(x, y, u, v));
        }
      }
    }
  }

  /** A polygon given in figure units. */
  shape(pts: P2[], shade: Shade): void {
    this.poly(pts.map((p) => [this.sx(p[0]), this.sy(p[1])] as P2), shade);
  }

  /**
   * A tapered stroke from a to b (figure units), widths wa..wb (figure units, at least one pixel),
   * shaded as a rounded rod: a lit edge, a mid body, a shadow third and a dark edge.
   */
  rod(a: P2, b: P2, wa: number, wb: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: Shade } = {}): void {
    const L = this.L;
    const A: P2 = [this.sx(a[0]), this.sy(a[1])], B: P2 = [this.sx(b[0]), this.sy(b[1])];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const ln = Math.hypot(dx, dy) || 1;
    const nx = -dy / ln, ny = dx / ln;
    const ha = Math.max(0.5, (wa * L) / 2), hb = Math.max(0.5, (wb * L) / 2);
    const pts: P2[] = [
      [A[0] + nx * ha, A[1] + ny * ha],
      [B[0] + nx * hb, B[1] + ny * hb],
      [B[0] - nx * hb, B[1] - ny * hb],
      [A[0] - nx * ha, A[1] - ny * ha],
    ];
    const base = opts.tone ?? 2;
    this.poly(pts, (x, y, u, v) => {
      if (opts.detail) {
        const d = opts.detail(x, y, u, v);
        if (d >= 0) return d;
      }
      const w = Math.max(ha, hb);
      // Bands in pixels, not fractions, so thin rods stay readable: 1 px lit edge, 1 px dark edge.
      const px = u * w;
      if (w >= 1.5 && px < -w + 1.2) return code(m, base + (opts.shine ? 2 : 1));
      if (w >= 1.5 && px > w - 1.2) return code(m, base - 2);
      if (u > 0.25) return code(m, base - 1);
      if (opts.shine && Math.abs(u + 0.45) < 0.12 && v > 0.15 && v < 0.6) return code(m, base + 2);
      return code(m, base);
    }, { a: A, b: B, w: 2 * Math.max(ha, hb) });
  }

  /**
   * A disc or ellipse (figure units) shaded the pixel-art way: a light cluster offset toward the
   * top-left, a mid body, a shadow crescent on the bottom-right, a dark rim on that side only.
   * `detail(x, y, nx, ny)` gets the pixel's position in the ellipse (-1..1).
   */
  blob(c: P2, rx: number, ry: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: Shade } = {}): void {
    const L = this.L;
    const cx = this.sx(c[0]), cy = this.sy(c[1]);
    const RX = Math.max(0.6, rx * L), RY = Math.max(0.6, ry * L);
    const pts: P2[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * RX, cy + Math.sin(a) * RY]);
    }
    const base = opts.tone ?? 2;
    this.poly(pts, (x, y) => {
      const nx = (x + 0.5 - cx) / RX, ny = (y + 0.5 - cy) / RY;
      if (opts.detail) {
        const d = opts.detail(x, y, nx, ny);
        if (d >= 0) return d;
      }
      const lit = Math.hypot(nx + 0.38, ny + 0.38);
      const dk = nx * 0.7 + ny * 0.7;
      if (opts.shine && lit < 0.28) return code(m, base + 2);
      if (lit < 0.62) return code(m, base + 1);
      if (dk > 0.72) return code(m, base - 2);
      if (dk > 0.32) return code(m, base - 1);
      return code(m, base);
    });
  }

  /** A one-pixel line between two points in figure units (strings, cracks, seams). */
  line(a: P2, b: P2, c: number): void {
    const x0 = this.sx(a[0]), y0 = this.sy(a[1]), x1 = this.sx(b[0]), y1 = this.sy(b[1]);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.plot(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n), c);
  }

  /**
   * A solid smear (no blending): the sweep of a blade from angle `from` to `to` (degrees, the
   * rig's convention, stepping 7.5°) about `pivot`, between radii r0 and r1, as one pale shape.
   */
  smear(pivot: P2, from: number, to: number, r0: number, r1: number, m: Mat, opts: { w0?: number; w1?: number; tone?: number } = {}): void {
    const step = from > to ? -7.5 : 7.5;
    const at = (deg: number, r: number): P2 => {
      const s = Math.round((deg * DEG) / (7.5 * DEG)) * 7.5 * DEG;
      return [pivot[0] + Math.sin(s) * r, pivot[1] + Math.cos(s) * r];
    };
    for (let a = from; step < 0 ? a > to : a < to; a += step) this.rod(at(a, r0), at(a, r1), opts.w0 ?? 0.55, opts.w1 ?? 0.35, m, { tone: opts.tone ?? 3 });
  }

  // ---------------------------------------------------------------- passes

  /** Flips what has been drawn left-right about the foot point (south-west from south-east). */
  mirror(): void {
    const { CW, CH, pix, ord } = this;
    for (let y = 0; y < CH; y++) {
      const r = y * CW;
      pix.subarray(r, r + CW).reverse();
      ord.subarray(r, r + CW).reverse();
    }
  }

  /** Contact lines: where a part lies in front of another, the pixel behind takes a tone two steps down. */
  contact(): void {
    const { CW, CH, pix: PIX, ord: ORD } = this;
    const mark: number[] = [];
    for (let y = 1; y < CH - 1; y++)
      for (let x = 1; x < CW - 1; x++) {
        const i = y * CW + x;
        const v = PIX[i]!;
        if (v < 0) continue;
        for (const j of [i - 1, i + 1, i - CW, i + CW]) {
          const u = PIX[j]!;
          if (u >= 0 && ORD[j]! > ORD[i]! + 0 && u >> 3 !== v >> 3) {
            mark.push(i);
            break;
          }
        }
      }
    for (const i of mark) PIX[i] = (PIX[i]! & ~7) | Math.max(0, (PIX[i]! & 7) - 2);
  }

  /** Clusters of one colour smaller than `min` pixels take their most common same-material neighbour. */
  clusters(min: number): void {
    const { CW, CH, pix: PIX } = this;
    const seen = new Uint8Array(CW * CH);
    const stack: number[] = [], members: number[] = [];
    for (let i0 = 0; i0 < CW * CH; i0++) {
      const v = PIX[i0]!;
      if (v < 0 || seen[i0]) continue;
      stack.length = members.length = 0;
      stack.push(i0);
      seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        members.push(i);
        for (const j of [i - 1, i + 1, i - CW, i + CW]) {
          if (j < 0 || j >= CW * CH || seen[j] || PIX[j] !== v) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (members.length >= min || isKept(v >> 3)) continue;
      const count = new Map<number, number>();
      for (const i of members)
        for (const j of [i - 1, i + 1, i - CW, i + CW]) {
          const u = PIX[j];
          if (u !== undefined && u >= 0 && u !== v && u >> 3 === v >> 3) count.set(u, (count.get(u) ?? 0) + 1);
        }
      let best = -1, bn = 0;
      for (const [u, n] of count) if (n > bn) [best, bn] = [u, n];
      if (best >= 0) for (const i of members) PIX[i] = best;
    }
  }

  /** Anti-flicker: a lone tone flip since the last frame keeps last frame's tone. */
  steady(): void {
    const { CW, CH, pix: PIX, prev: PREV } = this;
    for (let y = 1; y < CH - 1; y++)
      for (let x = 1; x < CW - 1; x++) {
        const i = y * CW + x;
        const v = PIX[i]!, q = PREV[i]!;
        if (v < 0 || q < 0 || v === q || v >> 3 !== q >> 3) continue;
        let agree = 0;
        for (const j of [i - 1, i + 1, i - CW, i + CW]) if (PIX[j] === q) agree++;
        if (agree >= 3) PIX[i] = q;
      }
  }

  /** Remembers this frame for the next one's anti-flicker. */
  keep(): void {
    this.prev.set(this.pix);
  }

  /**
   * Colours (RGBA, little-endian packed): a ground shadow ellipse (radii in units, or null), the
   * figure, and the coloured outline: the material's darkest tone on the lit (left/top) side, a
   * darker version of it on the shadow side.
   */
  colours(pal: RGB[][], shadow: { rx: number; ry: number } | null): Uint32Array {
    const { CW, CH, FX, FY, L, pix: PIX } = this;
    const out = new Uint32Array(CW * CH);
    const pack = ([r, g, b]: RGB, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    if (shadow) {
      const sh = pack([12, 14, 8], 92);
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++) {
          const dx = (x + 0.5 - FX) / (shadow.rx * L), dy = (y + 0.5 - FY) / (shadow.ry * L);
          if (dx * dx + dy * dy < 1) out[y * CW + x] = sh;
        }
    }
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        const v = PIX[i]!;
        if (v >= 0) {
          out[i] = pack(pal[v >> 3]![v & 7]!);
          continue;
        }
        let nb = -1, lit = false;
        if (x < CW - 1 && PIX[i + 1]! >= 0) [nb, lit] = [PIX[i + 1]!, true];
        else if (y < CH - 1 && PIX[i + CW]! >= 0) [nb, lit] = [PIX[i + CW]!, true];
        else if (x > 0 && PIX[i - 1]! >= 0) nb = PIX[i - 1]!;
        else if (y > 0 && PIX[i - CW]! >= 0) nb = PIX[i - CW]!;
        if (nb < 0) continue;
        const d = pal[nb >> 3]![0]!;
        out[i] = lit ? pack(pal[nb >> 3]![0]!) : pack([Math.round(d[0] * 0.5 + 4), Math.round(d[1] * 0.5 + 3), Math.round(d[2] * 0.5 + 4)]);
      }
    return out;
  }
}
