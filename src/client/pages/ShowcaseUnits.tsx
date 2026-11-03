import { useEffect, useMemo, useRef, useState } from 'react';
import { FACTIONS, type FactionId } from '../../game/factions.ts';
import { Anim, KIND_COUNT, type Atlas, type Dir, type KindSheet } from '../render/contract.ts';
import { buildAtlas as buildClassic } from '../render/sprites.ts';
import { buildAtlas as buildHd } from '../render/sprites128.ts';
import { ArtSelect, FactionSelect } from '../ui/ShowcaseControls.tsx';
import { CITY_SPEEDS, SpeedControls } from '../ui/SpeedControls.tsx';
import { useArtMode } from '../ui/useArtMode.ts';
import { isHdArt } from '../settings.ts';

// The showcase's muster roll: every kind of a faction (rows) playing every animation (columns),
// from the same atlases the battle draws with (HD: the paper-doll painter at detail level 2).

// Brace is the guard: the combat-ready stance every blow leaves from and returns to (contract.ts).
const ANIM_NAMES = ['Idle', 'Walk', 'Run', 'Attack', 'Shoot', 'Hit', 'Die', 'Dead', 'Guard'];
/** The columns' order: the guard right before the blows it starts them from. */
const ORDER: readonly Anim[] = [Anim.Idle, Anim.Walk, Anim.Run, Anim.Brace, Anim.Attack, Anim.Shoot, Anim.Hit, Anim.Die, Anim.Dead];
/** One column per animation, Attack split into one column per blow (empty where a kind has fewer). */
type Col = { anim: Anim; blow: number; name: string };
function columnsOf(at: Atlas): Col[] {
  let most = 1;
  for (let k = 0; k < KIND_COUNT; k++) most = Math.max(most, at.blows?.(k) ?? 1);
  const cols: Col[] = [];
  for (const a of ORDER) {
    if (a === Anim.Attack) for (let b = 0; b < most; b++) cols.push({ anim: a, blow: b, name: most > 1 ? `Attack ${b + 1}` : 'Attack' });
    else cols.push({ anim: a, blow: 0, name: ANIM_NAMES[a]! });
  }
  return cols;
}
const DIRS: [Dir, string][] = [
  [0, 'Toward, right'],
  [1, 'Toward, left'],
  [2, 'Away, left'],
  [3, 'Away, right'],
];
/**
 * Figures at 2×, 4× or 8×: the classic 48 px cell scaled up by whole pixels, or the HD painter's sheet at
 * that detail level drawn 1:1. The box is a little wider than a knight on his horse at that size.
 */
const SIZES = [2, 4, 8] as const;
const boxOf = (size: number) => size * 32;
const HEAD = 26;
/** Phones: a narrower name column (names wrap) and 2× figures, so more of the row shows. */
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 720;
const FIELD = '#56603a';

/** Frame at time t (ticks); Die plays once, holds a moment, then plays again. */
function frameAt(at: Atlas, kind: number, a: Anim, t: number): number {
  const n = at.frames(kind, a);
  const f = Math.floor(t / at.ticksPerFrame(a));
  if (a === Anim.Die) return Math.min(n - 1, f % (n + 8));
  return f % n;
}

const sheetCanvas = new WeakMap<KindSheet, HTMLCanvasElement>();
function canvasOf(sh: KindSheet): HTMLCanvasElement {
  let c = sheetCanvas.get(sh);
  if (!c) {
    c = document.createElement('canvas');
    c.width = sh.width;
    c.height = sh.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(sh.pixels), sh.width, sh.height), 0, 0);
    sheetCanvas.set(sh, c);
  }
  return c;
}

export function ShowcaseUnits() {
  const [faction, setFaction] = useState<FactionId>('templar');
  const [dir, setDir] = useState<Dir>(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [size, setSize] = useState<number>(() => (narrow() ? 2 : 4));
  const [art] = useArtMode();
  const ref = useRef<HTMLCanvasElement>(null);
  const ctl = useRef({ speed, paused, dir });
  ctl.current = { speed, paused, dir };
  const atlas = useMemo(() => (isHdArt(art) ? buildHd : buildClassic)(faction, 215), [faction, art]);
  const names = useMemo(() => [...FACTIONS[faction].units, FACTIONS[faction].commander], [faction]);

  useEffect(() => {
    const c = ref.current!;
    const BOX = boxOf(size);
    const LABEL = narrow() ? 92 : 172;
    const cols = columnsOf(atlas);
    c.width = LABEL + BOX * cols.length;
    c.height = HEAD + BOX * KIND_COUNT;
    const g = c.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const k = ctl.current;
      if (!k.paused) t += real * k.speed * 10;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#120f0c';
      g.fillRect(0, 0, c.width, c.height);
      g.font = `${LABEL < 120 ? 13 : 15}px Georgia, serif`;
      g.textBaseline = 'middle';
      g.fillStyle = '#c9a24a';
      cols.forEach((col, a) => g.fillText(col.name, LABEL + a * BOX + 8, HEAD / 2));
      for (let kind = 0; kind < KIND_COUNT; kind++) {
        const y = HEAD + kind * BOX;
        g.fillStyle = '#d9cfbd';
        // The name, wrapped onto as many lines as the column needs.
        const lines: string[] = [];
        for (const w of (names[kind] ?? '').split(' ')) {
          const l = lines.length ? `${lines[lines.length - 1]} ${w}` : w;
          if (lines.length && g.measureText(l).width <= LABEL - 12) lines[lines.length - 1] = l;
          else lines.push(w);
        }
        lines.forEach((l, j) => g.fillText(l, 6, y + BOX / 2 + (j - (lines.length - 1) / 2) * 17, LABEL - 10));
        for (let a = 0; a < cols.length; a++) {
          const x = LABEL + a * BOX;
          const { anim, blow } = cols[a]!;
          g.save();
          g.beginPath();
          g.rect(x + 1, y + 1, BOX - 2, BOX - 2);
          g.clip();
          g.fillStyle = FIELD;
          g.fillRect(x + 1, y + 1, BOX - 2, BOX - 2);
          if (blow >= (atlas.blows?.(kind) ?? 1)) {
            // This kind has fewer blows: a dimmed, empty cell.
            g.fillStyle = '#1d1a15';
            g.fillRect(x + 1, y + 1, BOX - 2, BOX - 2);
            g.restore();
            continue;
          }
          // Blow b of the attack is frames b*n .. b*n+n-1 (contract.ts `blows`).
          const f = frameAt(atlas, kind, anim, t + kind * 3) + blow * atlas.frames(kind, anim);
          const sh = atlas.sheet && atlas.slot && atlas.levels?.includes(size) ? atlas.sheet(kind, size) : null;
          if (sh) {
            const r = sh.rects.subarray(atlas.slot!(kind, anim, f, k.dir) * 6);
            g.drawImage(canvasOf(sh), r[0]!, r[1]!, r[2]!, r[3]!, x + BOX / 2 - r[4]!, y + Math.round(BOX * 0.82) - r[5]!, r[2]!, r[3]!);
          } else {
            // Classic, or HD before its sheet is painted: the 48 px cell scaled up, foot on the same line.
            const [sx, sy] = atlas.at(kind, anim, f, k.dir);
            g.drawImage(atlas.image, sx, sy, atlas.cellW, atlas.cellH, x + BOX / 2 - atlas.footX * size, y + Math.round(BOX * 0.82) - atlas.footY * size, atlas.cellW * size, atlas.cellH * size);
          }
          g.restore();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [atlas, names, size]);

  return (
    <>
      <div className="showcase-bar">
        <FactionSelect label="Faction" value={faction} random={false} onChange={(f) => f && setFaction(f)} />
        <ArtSelect />
        <label className="inline">
          <span>Facing</span>
          <select value={dir} onChange={(e) => setDir(Number(e.target.value) as Dir)}>
            {DIRS.map(([d, label]) => (
              <option key={d} value={d}>{label}</option>
            ))}
          </select>
        </label>
        <label className="inline">
          <span>Size</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <SpeedControls speeds={CITY_SPEEDS} speed={speed} paused={paused} onSpeed={setSpeed} onPause={setPaused} />
      </div>
      <div className="showcase-scroll">
        <div className="showcase-units">
          <div className="city-who">
            <h2>{FACTIONS[faction].name}</h2>
            <span className="muted small">Every figure of the army, each animation side by side.</span>
          </div>
          <div className="units-frame">
            <canvas ref={ref} className="units-canvas" aria-label={`Every ${FACTIONS[faction].name} figure playing each animation`} />
          </div>
        </div>
      </div>
    </>
  );
}
