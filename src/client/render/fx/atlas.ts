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
}

const SIZE = 1024;

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

export function makeFxTextures(): FxTextures {
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
  const flame = [0, 1, 2, 3].map((v) =>
    make(64, 96, (c) => {
      const r = rng(101 + v * 7);
      // A tongue of fire: white-hot core, orange body, red licks; drawn pointing up.
      const tongue = (cx: number, base: number, w: number, h: number, color: string) => {
        c.beginPath();
        c.moveTo(cx - w, base);
        c.bezierCurveTo(cx - w * 1.1, base - h * 0.45, cx - w * 0.2 + (r() - 0.5) * w, base - h * 0.7, cx + (r() - 0.5) * w * 0.8, base - h);
        c.bezierCurveTo(cx + w * 0.4, base - h * 0.65, cx + w * 1.15, base - h * 0.4, cx + w, base);
        c.closePath();
        c.fillStyle = color;
        c.fill();
      };
      c.filter = 'blur(2px)';
      tongue(32, 92, 26, 88, 'rgba(200,40,10,0.55)');
      tongue(32, 90, 20, 74, 'rgba(255,110,20,0.85)');
      tongue(32, 88, 13, 56, 'rgba(255,170,50,0.95)');
      tongue(32, 86, 7, 34, 'rgba(255,224,130,1)');
      c.filter = 'none';
      // Fade the base so the tongue never shows a hard edge.
      c.globalCompositeOperation = 'destination-in';
      const fade = c.createLinearGradient(0, 96, 0, 60);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = fade;
      c.fillRect(0, 0, 64, 96);
      c.globalCompositeOperation = 'source-over';
    }),
  );
  const fireball = make(48, 48, (c) => {
    radial(c, 24, 24, 24, [[0, 'rgba(255,236,170,1)'], [0.25, 'rgba(255,200,90,1)'], [0.55, 'rgba(255,120,30,0.8)'], [1, 'rgba(200,40,10,0)']]);
  });
  const ring = make(128, 128, (c) => {
    c.strokeStyle = 'rgba(255,255,255,1)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(64, 64, 58, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.stroke();
  });
  const shockwave = make(160, 160, (c) => {
    const g = c.createRadialGradient(80, 80, 40, 80, 80, 80);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 160, 160);
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
  };
}
