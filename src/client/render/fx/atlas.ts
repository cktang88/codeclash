import { CanvasSource, Rectangle, Texture } from 'pixi.js';

/** Every effect frame lives in one canvas so particle containers can batch them in a single draw. */
export interface FxTextures {
  soft: Texture;
  spark: Texture;
  streak: Texture;
  ember: Texture;
  smoke: Texture[];
  flame: Texture[];
  fireball: Texture;
  ring: Texture;
  shockwave: Texture;
  scorch: Texture;
  crater: Texture;
  boulder: Texture;
  rock: Texture[];
  bone: Texture[];
  arrow: Texture;
  rangerArrow: Texture;
  bolt: Texture;
  mote: Texture;
  pillar: Texture;
  wisp: Texture;
  cloth: Texture;
  shadow: Texture;
  dust: Texture;
  /** A painterly explosion cloud in four frames, played over a blast's life. */
  blast: Texture[];
  /** Ink splatter left where a blow lands; drawn in ink, not tinted. */
  inkSplat: Texture[];
  /** A single flung ink droplet. */
  droplet: Texture;
  /** Flakes of gold leaf: rank, renown and holy light. */
  goldLeaf: Texture[];
  /** Smoke puffs hatched like an engraving. White, so they take any tint. */
  inkSmoke: Texture[];
  /** A jagged, inked starburst for the instant of impact. */
  burst: Texture;
  footprint: Texture;
  /** A white flag of surrender on its pole. */
  whiteFlag: Texture;
  chevron: Texture;
  /** A dragon's silhouette, soft-edged, for its vast shadow sweeping over the land. */
  wingShadow: Texture;
  /** The same painted tongues without their ink rim, for dense jets where outlines would pile up. */
  flameWash: Texture[];
  /** Ragged painted fireballs with no direction, for the body of a dragon's jet. */
  firePuff: Texture[];
  /** A blot of ink with a feathered edge, for washes across the map. */
  inkWash: Texture;
  /** Branching cracks: an ink rim around a white core, tinted ember for molten stone or ink for walls. */
  crack: Texture[];
  /** A gilded lance, pointing right, for tower bolts. */
  lance: Texture;
}

/** The bible's ink: outlines are a warm near-black, never pure black. */
const INK = '#22180f';

const SIZE = 1024;

/** A preloaded sprite sheet of hand-made particle art (Kenney, CC0) with named frames. */
export interface FxArt {
  image: CanvasImageSource;
  frames: Record<string, [x: number, y: number, w: number, h: number]>;
}

let loaded: FxArt | null = null;

/**
 * Loads the bundled particle art once. Effects fall back to procedural textures
 * when it is missing, e.g. in tests or if the request fails.
 */
export async function loadFxArt(base = '/art/kenney-fx/'): Promise<FxArt | null> {
  if (loaded) return loaded;
  try {
    const [frames, image] = await Promise.all([
      fetch(`${base}fx.json`).then((r) => (r.ok ? (r.json() as Promise<FxArt['frames']>) : Promise.reject(new Error(String(r.status))))),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `${base}fx.png`;
      }),
    ]);
    loaded = { image, frames };
  } catch {
    loaded = null;
  }
  return loaded;
}

interface Packer {
  x: number;
  y: number;
  row: number;
}

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, stops: [number, string][]): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

export function makeFxTextures(art: FxArt | null = loaded): FxTextures {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const pack: Packer = { x: 0, y: 0, row: 0 };
  const frames: Rectangle[] = [];

  // Reserve a cell, paint it with the origin at its top-left, and keep padding against bleeding.
  const make = (w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): number => {
    if (pack.x + w + 2 > SIZE) {
      pack.x = 0;
      pack.y += pack.row + 2;
      pack.row = 0;
    }
    const x = pack.x + 1;
    const y = pack.y + 1;
    if (y + h > SIZE) console.warn(`fx atlas overflow at ${frames.length} (${w}x${h})`);
    pack.x += w + 2;
    pack.row = Math.max(pack.row, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    paint(ctx, w, h);
    ctx.restore();
    frames.push(new Rectangle(x, y, w, h));
    return frames.length - 1;
  };

  // Paints a named frame of the particle art scaled into the cell, or falls back to the procedural painter.
  const drawn =
    (name: string, fallback: (c: CanvasRenderingContext2D, w: number, h: number) => void) =>
    (c: CanvasRenderingContext2D, w: number, h: number) => {
      const f = art?.frames[name];
      if (!art || !f) return fallback(c, w, h);
      c.drawImage(art.image, f[0], f[1], f[2], f[3], 0, 0, w, h);
    };
  const soft = make(64, 64, (c) => radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
  const spark = make(32, 32, (c) => {
    radial(c, 16, 16, 16, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(1, 15, 30, 2);
    c.fillRect(15, 1, 2, 30);
  });
  const streak = make(64, 12, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(32, 6, 32, 4, 0, 0, Math.PI * 2);
    c.fill();
  });
  const ember = make(24, 24, (c) => radial(c, 12, 12, 12, [[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,220,150,0.95)'], [0.7, 'rgba(255,130,40,0.4)'], [1, 'rgba(255,90,20,0)']]));
  const smoke = [0, 1, 2].map((v) =>
    make(80, 80, (c) => {
      const r = rng(17 + v * 31);
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * 16;
        const rad = 16 + r() * 14;
        radial(c, 40 + Math.cos(a) * d, 40 + Math.sin(a) * d, rad, [[0, 'rgba(255,255,255,0.38)'], [0.6, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
      }
    }),
  );
  const flamePainter = (v: number, inked: boolean) =>
    make(64, 96, (c) => {
      const r = rng(101 + v * 7);
      // A painted tongue of fire in flat pigment bands, with a wobbly ink edge on its outer shape:
      // vermilion body, ember, then a pale gold heart. Drawn pointing up.
      const lean = (r() - 0.5) * 10;
      const tongue = (base: number, w: number, h: number) => {
        c.beginPath();
        c.moveTo(32 - w, base);
        c.bezierCurveTo(32 - w * 1.15, base - h * 0.4, 32 - w * 0.5 + lean * 0.3, base - h * 0.62, 32 - w * 0.25 + lean * 0.5, base - h * 0.72);
        c.quadraticCurveTo(32 - w * 0.1 + lean * 0.6, base - h * 0.8, 32 + lean + (r() - 0.5) * 4, base - h);
        c.bezierCurveTo(32 + w * 0.45 + lean * 0.4, base - h * 0.7, 32 + w * 1.2, base - h * 0.42, 32 + w, base);
        c.quadraticCurveTo(32, base + w * 0.35, 32 - w, base);
        c.closePath();
      };
      c.lineJoin = 'round';
      if (!inked) c.filter = 'blur(1.5px)';
      tongue(88, 24, 84);
      c.fillStyle = '#b8321f';
      c.fill();
      if (inked) {
        c.strokeStyle = 'rgba(34,24,15,0.9)';
        c.lineWidth = 2.2;
        c.stroke();
      }
      tongue(86, 17, 66);
      c.fillStyle = '#ff9a3c';
      c.fill();
      tongue(84, 10, 44);
      c.fillStyle = '#f6dc8c';
      c.fill();
      tongue(82, 4.5, 22);
      c.fillStyle = '#fff6dc';
      c.fill();
      // A few painted licks inside the body, like brush strokes.
      c.strokeStyle = 'rgba(120,20,10,0.55)';
      c.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const x = 20 + r() * 24;
        c.beginPath();
        c.moveTo(x, 80);
        c.quadraticCurveTo(x + (r() - 0.5) * 10, 60, x + lean * 0.4 + (r() - 0.5) * 6, 40 + r() * 10);
        c.stroke();
      }
      c.filter = 'none';
    });
  const flame = [0, 1, 2, 3].map((v) => flamePainter(v, true));
  const firePuff = [0, 1, 2].map((v) =>
    make(64, 64, (c) => {
      const r = rng(907 + v * 13);
      // A ragged ball of painted fire: vermilion rim, ember body, gold heart; no outline, no direction.
      const blob = (rad: number, wob: number, color: string) => {
        c.beginPath();
        const n = 16;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const d = rad * (1 - wob + r() * wob * 2);
          const x = 32 + Math.cos(a) * d;
          const y = 32 + Math.sin(a) * d;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fillStyle = color;
        c.fill();
      };
      c.filter = 'blur(1.2px)';
      blob(28, 0.18, 'rgba(184,50,31,0.85)');
      blob(21, 0.2, 'rgba(255,154,60,0.95)');
      blob(13, 0.22, 'rgba(246,220,140,1)');
      blob(6, 0.3, 'rgba(255,248,224,1)');
      c.filter = 'none';
    }),
  );
  const flameWash = [0, 1, 2, 3].map((v) => flamePainter(v, false));
  const fireball = make(48, 48, (c) => {
    radial(c, 24, 24, 24, [[0, 'rgba(255,236,170,1)'], [0.25, 'rgba(255,200,90,1)'], [0.55, 'rgba(255,120,30,0.8)'], [1, 'rgba(200,40,10,0)']]);
  });
  const ring = make(128, 128, (c) => {
    // A hand-inked ring: two overlapping strokes of uneven weight that never quite close.
    const r = rng(211);
    c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.strokeStyle = k === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,1)';
      c.lineWidth = k === 0 ? 9 : 3.5;
      const start = r() * Math.PI * 2;
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = start + (i / 40) * Math.PI * 1.94;
        const d = 56 - k * 1.5 + Math.sin(a * 3 + k) * 1.4;
        const x = 64 + Math.cos(a) * d;
        const y = 64 + Math.sin(a) * d;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  const shockwave = make(160, 160, (c) => {
    // A ring of blown dust with an inked leading edge broken like a dry brush.
    const g = c.createRadialGradient(80, 80, 44, 80, 80, 76);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.8)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(80, 80, 76, 0, Math.PI * 2);
    c.arc(80, 80, 44, 0, Math.PI * 2, true);
    c.fill();
    const r = rng(229);
    c.strokeStyle = 'rgba(34,24,15,0.7)';
    c.lineCap = 'round';
    let a = 0;
    while (a < Math.PI * 2) {
      const len = 0.3 + r() * 0.7;
      c.lineWidth = 1.2 + r() * 1.6;
      c.beginPath();
      c.arc(80, 80, 76 - r() * 1.5, a, Math.min(Math.PI * 2, a + len));
      c.stroke();
      a += len + 0.04 + r() * 0.12;
    }
  });
  const scorch = make(128, 96, (c) => {
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = 64 + (r() - 0.5) * 80;
      const y = 48 + (r() - 0.5) * 50;
      radial(c, x, y, 14 + r() * 18, [[0, 'rgba(20,12,8,0.5)'], [1, 'rgba(20,12,8,0)']]);
    }
    for (let i = 0; i < 18; i++) {
      radial(c, 64 + (r() - 0.5) * 70, 48 + (r() - 0.5) * 40, 2 + r() * 3, [[0, 'rgba(255,150,60,0.9)'], [1, 'rgba(255,80,20,0)']]);
    }
  });
  const crater = make(96, 64, (c) => {
    c.fillStyle = 'rgba(30,24,18,0.55)';
    c.beginPath();
    c.ellipse(48, 32, 40, 24, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(12,9,7,0.6)';
    c.beginPath();
    c.ellipse(48, 34, 24, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(150,130,100,0.45)';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(48, 30, 36, 20, 0, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
  });
  const boulder = make(36, 36, (c) => {
    c.fillStyle = '#6f675c';
    c.strokeStyle = '#1e1a16';
    c.lineWidth = 3;
    c.beginPath();
    const r = rng(9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const d = 13 + r() * 4;
      if (i === 0) c.moveTo(18 + Math.cos(a) * d, 18 + Math.sin(a) * d);
      else c.lineTo(18 + Math.cos(a) * d, 18 + Math.sin(a) * d);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.ellipse(14, 13, 6, 4, -0.5, 0, Math.PI * 2);
    c.fill();
  });
  const rock = [0, 1, 2].map((v) =>
    make(16, 16, (c) => {
      const r = rng(40 + v);
      c.fillStyle = ['#8a8070', '#6e665a', '#9a8f7c'][v]!;
      c.strokeStyle = '#1e1a16';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const d = 4 + r() * 3;
        if (i === 0) c.moveTo(8 + Math.cos(a) * d, 8 + Math.sin(a) * d);
        else c.lineTo(8 + Math.cos(a) * d, 8 + Math.sin(a) * d);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }),
  );
  const bone = [0, 1, 2].map((v) =>
    make(20, 12, (c) => {
      c.strokeStyle = '#2a2520';
      c.fillStyle = '#e9e1cc';
      c.lineWidth = 1.5;
      const len = [14, 10, 7][v]!;
      const x0 = 10 - len / 2;
      c.beginPath();
      c.roundRect(x0, 4.5, len, 3, 1.5);
      c.fill();
      c.stroke();
      for (const x of [x0, x0 + len]) {
        c.beginPath();
        c.arc(x, 4.5, 2, 0, Math.PI * 2);
        c.arc(x, 7.5, 2, 0, Math.PI * 2);
        c.fill();
      }
    }),
  );
  const arrowPainter = (fletch: string) => (c: CanvasRenderingContext2D) => {
    c.strokeStyle = '#2a2016';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(3, 5);
    c.lineTo(30, 5);
    c.stroke();
    c.strokeStyle = '#d8c39a';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(3, 5);
    c.lineTo(30, 5);
    c.stroke();
    c.fillStyle = '#e8eef2';
    c.beginPath();
    c.moveTo(36, 5);
    c.lineTo(29, 1.5);
    c.lineTo(29, 8.5);
    c.closePath();
    c.fill();
    c.fillStyle = fletch;
    c.beginPath();
    c.moveTo(1, 1);
    c.lineTo(8, 5);
    c.lineTo(1, 9);
    c.closePath();
    c.fill();
  };
  const arrow = make(38, 10, arrowPainter('#f2f2f2'));
  const rangerArrow = make(38, 10, arrowPainter('#6fe08a'));
  const bolt = make(72, 14, (c) => {
    const g = c.createLinearGradient(0, 0, 72, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(36, 7, 36, 4, 0, 0, Math.PI * 2);
    c.fill();
    radial(c, 64, 7, 7, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  });
  const mote = make(16, 16, (c) => {
    radial(c, 8, 8, 8, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fillRect(7, 2, 2, 12);
    c.fillRect(2, 7, 12, 2);
  });
  const pillar = make(40, 160, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.fillStyle = g;
    c.fillRect(4, 0, 32, 160);
    c.globalCompositeOperation = 'destination-in';
    const mask = c.createLinearGradient(0, 0, 40, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(0.5, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mask;
    c.fillRect(0, 0, 40, 160);
    c.globalCompositeOperation = 'source-over';
  });
  const wisp = make(32, 48, (c) => {
    radial(c, 16, 30, 14, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.moveTo(10, 30);
    c.quadraticCurveTo(14, 8, 18, 2);
    c.quadraticCurveTo(20, 16, 22, 30);
    c.closePath();
    c.fill();
  });
  const cloth = make(28, 22, (c) => {
    c.fillStyle = '#f4f1ea';
    c.strokeStyle = '#3a342c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(3, 3);
    c.quadraticCurveTo(14, 0, 25, 5);
    c.quadraticCurveTo(22, 12, 25, 19);
    c.quadraticCurveTo(14, 15, 3, 19);
    c.closePath();
    c.fill();
    c.stroke();
  });
  const shadow = make(48, 24, (c) => {
    const g = c.createRadialGradient(24, 12, 0, 24, 12, 24);
    g.addColorStop(0, 'rgba(0,0,0,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.scale(1, 0.5);
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
    c.restore();
  });
  const dust = make(64, 64, (c) => {
    const r = rng(77);
    for (let i = 0; i < 7; i++) {
      radial(c, 32 + (r() - 0.5) * 22, 32 + (r() - 0.5) * 22, 12 + r() * 10, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    }
  });

  const blast = [0, 1, 2, 3].map((v) =>
    make(96, 96, drawn(`blast${v}`, (c) => {
      const r = rng(211 + v * 13);
      for (let i = 0; i < 10; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * (14 + v * 4);
        radial(c, 48 + Math.cos(a) * d, 48 + Math.sin(a) * d, 18 + r() * 12, [[0, 'rgba(255,214,120,0.9)'], [0.5, 'rgba(232,110,40,0.55)'], [1, 'rgba(120,40,20,0)']]);
      }
    })),
  );
  const inkSplat = [0, 1, 2].map((v) =>
    make(48, 48, (c) => {
      const r = rng(301 + v * 17);
      c.fillStyle = INK;
      // A heavy central blot with a wobbly rim, then droplets thrown outward.
      c.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d = 9 + r() * 6 + (i % 3 === 0 ? r() * 6 : 0);
        const x = 24 + Math.cos(a) * d;
        const y = 24 + Math.sin(a) * d;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = 14 + r() * 8;
        c.beginPath();
        c.arc(24 + Math.cos(a) * d, 24 + Math.sin(a) * d, 0.8 + r() * 2.2, 0, Math.PI * 2);
        c.fill();
      }
      // A faint warm sheen so the ink reads as wet pigment, not a hole.
      c.fillStyle = 'rgba(120,80,50,0.35)';
      c.beginPath();
      c.ellipse(21, 20, 4, 2.5, -0.6, 0, Math.PI * 2);
      c.fill();
    }),
  );
  const droplet = make(10, 14, (c) => {
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(5, 1);
    c.quadraticCurveTo(9, 8, 5, 13);
    c.quadraticCurveTo(1, 8, 5, 1);
    c.fill();
  });
  const goldLeaf = [0, 1, 2].map((v) =>
    make(14, 14, (c) => {
      const r = rng(401 + v * 5);
      const g = c.createLinearGradient(0, 0, 14, 14);
      g.addColorStop(0, '#f6dc8c');
      g.addColorStop(0.55, '#d4a93e');
      g.addColorStop(1, '#8a6418');
      c.fillStyle = g;
      c.strokeStyle = 'rgba(34,24,15,0.75)';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r() * 0.5;
        const d = 3.5 + r() * 3;
        if (i === 0) c.moveTo(7 + Math.cos(a) * d, 7 + Math.sin(a) * d);
        else c.lineTo(7 + Math.cos(a) * d, 7 + Math.sin(a) * d);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,248,220,0.8)';
      c.fillRect(5, 4, 2, 1);
    }),
  );
  const inkSmoke = [0, 1, 2].map((v) =>
    make(80, 80, (c) => {
      const r = rng(503 + v * 19);
      const blobs: [number, number, number][] = [];
      for (let i = 0; i < 6; i++) blobs.push([40 + (r() - 0.5) * 30, 44 + (r() - 0.5) * 24, 12 + r() * 10]);
      const path = () => {
        c.beginPath();
        for (const [x, y, rad] of blobs) {
          c.moveTo(x + rad, y);
          c.arc(x, y, rad, 0, Math.PI * 2);
        }
      };
      // An ink rim on the outline of the whole cloud only: stroke every lobe, then cut away the inside.
      path();
      c.strokeStyle = 'rgba(60,52,44,0.5)';
      c.lineWidth = 2.6;
      c.stroke();
      c.globalCompositeOperation = 'destination-out';
      path();
      c.fill();
      c.globalCompositeOperation = 'source-over';
      // Wash, then engraved hatching on the shadowed lower right.
      path();
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      c.save();
      path();
      c.clip();
      c.strokeStyle = 'rgba(70,64,58,0.4)';
      c.lineWidth = 1;
      for (let k = -80; k < 80; k += 5) {
        c.beginPath();
        c.moveTo(40 + k, 80);
        c.lineTo(80 + k, 40);
        c.stroke();
      }
      c.globalCompositeOperation = 'destination-out';
      radial(c, 32, 34, 30, [[0, 'rgba(0,0,0,1)'], [0.7, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
      c.restore();
    }),
  );
  const burst = make(64, 64, (c) => {
    const r = rng(611);
    c.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = i % 2 === 0 ? 28 + r() * 3 : 11 + r() * 4;
      if (i === 0) c.moveTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d);
      else c.lineTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d);
    }
    c.closePath();
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0.55)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(34,24,15,0.85)';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.stroke();
  });
  const footprint = make(12, 10, (c) => {
    c.fillStyle = 'rgba(34,24,15,0.8)';
    c.beginPath();
    c.ellipse(3.5, 4, 2, 3.2, -0.3, 0, Math.PI * 2);
    c.ellipse(8.5, 6, 2, 3.2, -0.3, 0, Math.PI * 2);
    c.fill();
  });
  const whiteFlag = make(26, 32, (c) => {
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(4, 31);
    c.lineTo(4, 2);
    c.stroke();
    c.fillStyle = '#f4efe2';
    c.beginPath();
    c.moveTo(5, 3);
    c.quadraticCurveTo(14, 0, 24, 5);
    c.quadraticCurveTo(20, 10, 24, 15);
    c.quadraticCurveTo(14, 12, 5, 16);
    c.closePath();
    c.fill();
    c.lineWidth = 1.5;
    c.stroke();
  });
  const chevron = make(22, 14, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 14);
    g.addColorStop(0, '#f6dc8c');
    g.addColorStop(1, '#8a6418');
    c.fillStyle = g;
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(2, 3);
    c.lineTo(11, 9);
    c.lineTo(20, 3);
    c.lineTo(20, 7);
    c.lineTo(11, 13);
    c.lineTo(2, 7);
    c.closePath();
    c.fill();
    c.stroke();
  });
  const wingShadow = make(256, 128, (c) => {
    // A soft dragon silhouette seen from below: wide bat wings, long neck and tail.
    c.filter = 'blur(5px)';
    c.fillStyle = 'rgba(0,0,0,1)';
    c.beginPath();
    c.moveTo(128, 30);
    c.quadraticCurveTo(150, 46, 150, 64);
    // Right wing with finger scallops.
    c.quadraticCurveTo(190, 30, 246, 22);
    c.quadraticCurveTo(232, 48, 240, 60);
    c.quadraticCurveTo(220, 58, 222, 76);
    c.quadraticCurveTo(200, 70, 196, 86);
    c.quadraticCurveTo(170, 76, 150, 84);
    // Tail.
    c.quadraticCurveTo(140, 106, 128, 124);
    c.quadraticCurveTo(116, 106, 106, 84);
    // Left wing.
    c.quadraticCurveTo(86, 76, 60, 86);
    c.quadraticCurveTo(56, 70, 34, 76);
    c.quadraticCurveTo(36, 58, 16, 60);
    c.quadraticCurveTo(24, 48, 10, 22);
    c.quadraticCurveTo(66, 30, 106, 64);
    c.quadraticCurveTo(106, 46, 128, 30);
    c.closePath();
    c.fill();
    // Neck and head.
    c.beginPath();
    c.ellipse(128, 20, 7, 16, 0, 0, Math.PI * 2);
    c.fill();
    c.filter = 'none';
  });
  const inkWash = make(256, 256, (c) => {
    const r = rng(733);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const rad = 50 + r() * 50;
      const d = r() * (124 - rad);
      radial(c, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rad, [[0, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
    }
  });

  const crack = [0, 1].map((v) =>
    make(96, 96, (c) => {
      const r = rng(811 + v * 23);
      const segs: [number, number, number, number][] = [];
      const branch = (x: number, y: number, a: number, len: number, depth: number) => {
        let px = x;
        let py = y;
        const steps = 3 + ((r() * 3) | 0);
        for (let i = 0; i < steps; i++) {
          a += (r() - 0.5) * 0.9;
          const nx = px + Math.cos(a) * (len / steps);
          const ny = py + Math.sin(a) * (len / steps);
          segs.push([px, py, nx, ny]);
          if (depth > 0 && r() < 0.35) branch(nx, ny, a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5), len * 0.45, depth - 1);
          px = nx;
          py = ny;
        }
      };
      for (let k = 0; k < 4; k++) branch(48, 48, (k / 4) * Math.PI * 2 + r(), 30 + r() * 14, 2);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (const [w, style] of [[3.4, INK], [1.3, '#ffffff']] as const) {
        c.strokeStyle = style;
        c.lineWidth = w;
        c.beginPath();
        for (const [a, b, x, y] of segs) {
          c.moveTo(a, b);
          c.lineTo(x, y);
        }
        c.stroke();
      }
    }),
  );
  const lance = make(72, 14, (c) => {
    // Trailing gilt streamer, then a gold shaft and a broad leaf-shaped head with an ink edge.
    const trail = c.createLinearGradient(0, 0, 40, 0);
    trail.addColorStop(0, 'rgba(246,220,140,0)');
    trail.addColorStop(1, 'rgba(246,220,140,0.75)');
    c.fillStyle = trail;
    c.beginPath();
    c.moveTo(0, 7);
    c.quadraticCurveTo(20, 2, 40, 5);
    c.lineTo(40, 9);
    c.quadraticCurveTo(20, 12, 0, 7);
    c.fill();
    const g = c.createLinearGradient(0, 3, 0, 11);
    g.addColorStop(0, '#f6dc8c');
    g.addColorStop(0.5, '#d4a93e');
    g.addColorStop(1, '#8a6418');
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.lineJoin = 'round';
    c.fillStyle = g;
    c.fillRect(28, 5.5, 26, 3);
    c.strokeRect(28, 5.5, 26, 3);
    c.beginPath();
    c.moveTo(52, 7);
    c.lineTo(58, 2);
    c.lineTo(71, 7);
    c.lineTo(58, 12);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,250,225,0.9)';
    c.fillRect(57, 5, 8, 1);
  });

  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const textures = frames.map((frame) => new Texture({ source, frame }));
  const t = (i: number) => textures[i]!;
  return {
    soft: t(soft),
    spark: t(spark),
    streak: t(streak),
    ember: t(ember),
    smoke: smoke.map(t),
    flame: flame.map(t),
    fireball: t(fireball),
    ring: t(ring),
    shockwave: t(shockwave),
    scorch: t(scorch),
    crater: t(crater),
    boulder: t(boulder),
    rock: rock.map(t),
    bone: bone.map(t),
    arrow: t(arrow),
    rangerArrow: t(rangerArrow),
    bolt: t(bolt),
    mote: t(mote),
    pillar: t(pillar),
    wisp: t(wisp),
    cloth: t(cloth),
    shadow: t(shadow),
    dust: t(dust),
    blast: blast.map(t),
    inkSplat: inkSplat.map(t),
    droplet: t(droplet),
    goldLeaf: goldLeaf.map(t),
    inkSmoke: inkSmoke.map(t),
    burst: t(burst),
    footprint: t(footprint),
    whiteFlag: t(whiteFlag),
    chevron: t(chevron),
    wingShadow: t(wingShadow),
    inkWash: t(inkWash),
    crack: crack.map(t),
    flameWash: flameWash.map(t),
    firePuff: firePuff.map(t),
    lance: t(lance),
  };
}
