import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DigestResponse } from '../../protocol.ts';
import { FORT_NAMES } from '../../sim/chronicle.ts';
import { TICK_MS } from '../../sim/api.ts';
import { clock } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';
import { hueVar, pigment } from '../ui/codex.tsx';

const LOOP_MS = 15_000;
const HOLD_MS = 1200;
/** Earlier frames drawn behind each platoon as a fading trail of its march. */
const TRAIL = 4;

const INK = '#22180f';
const VELLUM = '#efe4c8';
const SHADE = '#8e8269';

type MapData = DigestResponse['map'];

/** Deterministic noise in 0..1 from two integers, for hand-placed wobble. */
function jitter(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A wobbly closed coastline around the disc of land. */
function coast(r: number, amp: number, seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const k = r + amp * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2) * 0.3 + Math.sin(a * 13 + seed * 0.5) * 0.2);
    pts.push(`${(Math.cos(a) * k).toFixed(1)} ${(Math.sin(a) * k).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

type Cell = { x: number; y: number; j: number };

/** The coarse terrain grid as lists of cell centres, thinned so huge maps stay light. */
function terrainCells(map: MapData): { forest: Cell[]; water: Cell[]; rock: Cell[]; size: number } {
  const t = map.terrain;
  const out = { forest: [] as Cell[], water: [] as Cell[], rock: [] as Cell[], size: 0 };
  if (!t || t.cols <= 0) return out;
  const rows = Math.floor(t.cells.length / t.cols);
  const thin = Math.max(1, Math.ceil(t.cols / 64));
  out.size = t.cell * thin;
  for (let r = 0; r < rows; r += thin) {
    for (let c = 0; c < t.cols; c += thin) {
      const ch = t.cells[r * t.cols + c];
      if (ch !== '1' && ch !== '2' && ch !== '3') continue;
      const j = jitter(r, c);
      const cell = { x: t.originX + (c + 0.5) * t.cell, y: t.originY + (r + 0.5) * t.cell, j };
      (ch === '1' ? out.forest : ch === '2' ? out.water : out.rock).push(cell);
    }
  }
  return out;
}

/**
 * The painted land under the war: sea and inked coast, lakes, forests and rock. It never
 * changes during playback, so it is drawn once.
 */
const Land = memo(function Land({ map, ids }: { map: MapData; ids: { land: string; hatch: string; waves: string; clip: string } }) {
  const r = map.radius;
  const t = useMemo(() => terrainCells(map), [map]);
  const s = t.size || r * 0.04;
  const shore = coast(r, r * 0.025, 1.3);
  return (
    <g>
      <rect x={-r * 1.3} y={-r * 1.3} width={r * 2.6} height={r * 2.6} fill="rgba(44,74,154,.1)" />
      <rect x={-r * 1.3} y={-r * 1.3} width={r * 2.6} height={r * 2.6} fill={`url(#${ids.waves})`} />
      <path d={coast(r * 1.06, r * 0.025, 1.3)} fill="none" stroke="rgba(44,74,154,.42)" strokeWidth={r * 0.004} strokeDasharray={`${r * 0.006} ${r * 0.018}`} />
      <path d={coast(r * 1.11, r * 0.028, 1.3)} fill="none" stroke="rgba(44,74,154,.25)" strokeWidth={r * 0.004} strokeDasharray={`${r * 0.003} ${r * 0.024}`} />
      <path d={shore} fill={`url(#${ids.land})`} />
      <g clipPath={`url(#${ids.clip})`}>
        {/* Shadow side of the land, hatched in ink: light falls from the upper left. */}
        <circle cx={r * 0.45} cy={r * 0.5} r={r} fill={`url(#${ids.hatch})`} opacity={0.75} />
        {/* Lakes and rivers: an ink shore drawn under an ultramarine wash. */}
        <g fill="none" stroke={INK} strokeWidth={s * 0.28}>
          {t.water.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={s * 0.8} />
          ))}
        </g>
        <g fill="#4d69a6">
          {t.water.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={s * 0.8} />
          ))}
        </g>
        <g fill="none" stroke="rgba(239,228,200,.55)" strokeWidth={s * 0.08} strokeLinecap="round">
          {t.water.filter((c) => c.j > 0.72).map((c, i) => (
            <path key={i} d={`M${c.x - s * 0.3} ${c.y} q${s * 0.15} ${-s * 0.14} ${s * 0.3} 0`} />
          ))}
        </g>
        {/* Rock: angular facets, lit top-left. */}
        {t.rock.map((c, i) => {
          const k = s * (0.55 + c.j * 0.35);
          return (
            <g key={i} transform={`translate(${c.x} ${c.y})`}>
              <path d={`M${-k} ${k * 0.55} L${-k * 0.15} ${-k * 0.8} L${k} ${k * 0.55}Z`} fill="#a29178" stroke={INK} strokeWidth={s * 0.1} strokeLinejoin="round" />
              <path d={`M${-k * 0.15} ${-k * 0.8} L${k * 0.2} ${k * 0.55} L${k} ${k * 0.55}Z`} fill="#6e604c" />
            </g>
          );
        })}
        {/* Forests: canopy blobs with an ink edge and a highlight on the upper left. */}
        <g stroke={INK} strokeWidth={s * 0.14}>
          {t.forest.map((c, i) => (
            <circle key={i} cx={c.x + (c.j - 0.5) * s * 0.4} cy={c.y + (c.j - 0.5) * s * 0.3} r={s * (0.66 + c.j * 0.22)} fill={c.j > 0.5 ? '#5f7a3a' : '#536c33'} />
          ))}
        </g>
        <g fill="#89a052">
          {t.forest.map((c, i) => (
            <circle key={i} cx={c.x + (c.j - 0.5) * s * 0.4 - s * 0.2} cy={c.y + (c.j - 0.5) * s * 0.3 - s * 0.24} r={s * 0.26} />
          ))}
        </g>
      </g>
      <path d={shore} fill="none" stroke={INK} strokeWidth={r * 0.009} strokeLinejoin="round" />
    </g>
  );
});

/** A capital: an inked keep in its army's pigment, with a banner on its tower. */
function Castle({ x, y, k, hue }: { x: number; y: number; k: number; hue: number | null }) {
  const wall = hue === null ? '#cdbd95' : pigment(hue);
  const flag = hue === null ? SHADE : pigment(hue, 'light');
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} opacity={hue === null ? 0.7 : 1}>
      <ellipse cx="1.5" cy="10.5" rx="14" ry="3.6" fill="rgba(18,22,31,.32)" />
      <path d="M-11 10V-4h4v-4h3v4h8v-4h3v4h4v14Z" fill={wall} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 -4V9M7 -4V9" stroke="rgba(18,22,31,.38)" strokeWidth="1" />
      <path d="M-3 10V3a3 3 0 0 1 6 0v7" fill={INK} />
      <path d="M0 -8v-10" stroke={INK} strokeWidth="1.2" />
      <path d="M0 -18h9l-2.4 2.6L9 -13H0" fill={flag} stroke={INK} strokeWidth="1" />
    </g>
  );
}

/** A shrine: a standing stone cut with code runes, glowing in its holder's pigment. */
function Shrine({ x, y, k, hue, name }: { x: number; y: number; k: number; hue: number | null; name: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {hue !== null && <circle r={k * 15} fill={pigment(hue, 'light')} opacity={0.55} />}
      <g transform={`scale(${k})`}>
        <ellipse cx="1.5" cy="9" rx="8" ry="2.4" fill="rgba(18,22,31,.32)" />
        <path d="M-5 9-6-5Q-5-11 0-11T6-5L5 9Z" fill="#8c8576" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M2-10Q6-9 6-5L5 9H2Z" fill="#5f594d" />
        <text y="2" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="6.5" fontWeight="700" fill={hue === null ? '#3b352c' : pigment(hue, 'light')} stroke={hue === null ? 'none' : INK} strokeWidth="0.5">
          {'{}'}
        </text>
      </g>
      <text className="timelapse-site-name" y={k * 22} textAnchor="middle" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize={k * 9} fill={INK} stroke={VELLUM} strokeWidth={k * 2.6} paintOrder="stroke">
        {name}
      </text>
    </g>
  );
}

/** The Legacy Monolith in obsidian. Its molten cracks widen as it is worn down; fallen, it lies in shards over the glowing Heart. */
function Monolith({ x, y, k, hp }: { x: number; y: number; k: number; hp: number }) {
  const wear = 1 - Math.max(0, Math.min(1, hp));
  if (hp <= 0) {
    return (
      <g transform={`translate(${x} ${y}) scale(${k})`}>
        <circle r="16" fill="#ff9a3c" opacity="0.35" />
        <circle r="7" fill="#ff9a3c" opacity="0.7" />
        <path d="M-14 6-9-2-5 7Z M6 8 11-3 15 6Z M-4-8 1-15 4-6Z" fill="#1a1d26" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <circle r={10 + wear * 10} fill="#ff9a3c" opacity={0.18 + wear * 0.3} />
      <ellipse cx="2" cy="13" rx="12" ry="3" fill="rgba(18,22,31,.4)" />
      <path d="M-7 12-5-16 0-24 5-16 7 12Z" fill="#1a1d26" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M0-24 5-16 7 12H2Z" fill="#2a2f3d" />
      <path d="M-1-14 2-6-2 1 1 9" fill="none" stroke="#ff9a3c" strokeWidth={0.8 + wear * 2.4} strokeLinecap="round" />
      {wear > 0.35 && <path d="M3-12 0-4 4 4" fill="none" stroke="#ff9a3c" strokeWidth={0.6 + wear * 1.6} strokeLinecap="round" />}
      {wear > 0.65 && <path d="M-4 5-1 10M-3-8-5-2" fill="none" stroke="#f6dc8c" strokeWidth={0.6 + wear} strokeLinecap="round" />}
    </g>
  );
}

/** A platoon at far zoom: a small heraldic shield in its army's pigment, sized by its soldiers. */
function Token({ x, y, k, hue }: { x: number; y: number; k: number; hue: number | null }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M-5-6h10v4.5C5 2 2.5 4.6 0 6-2.5 4.6-5 2-5-1.5Z" fill={hue === null ? SHADE : pigment(hue)} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M-3.4-4.6h6.8" stroke={hue === null ? VELLUM : pigment(hue, 'light')} strokeWidth="1.1" />
    </g>
  );
}

/** The whole day as a miniature of the painted map in fifteen seconds: holdings, platoons and the Monolith. */
export function Timelapse({ data }: { data: DigestResponse }) {
  const frames = data.timelapse;
  const [index, setIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(() => typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const started = useRef<number | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = useMemo(() => ({ land: `tl-land-${uid}`, hatch: `tl-hatch-${uid}`, waves: `tl-waves-${uid}`, clip: `tl-clip-${uid}` }), [uid]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    const from = indexRef.current;
    started.current = performance.now() - (from >= frames.length - 1 ? 0 : (from / (frames.length - 1)) * LOOP_MS);
    const tick = (now: number) => {
      const elapsed = (now - started.current!) % (LOOP_MS + HOLD_MS);
      const next = Math.min(frames.length - 1, Math.floor((elapsed / LOOP_MS) * (frames.length - 1)));
      if (next !== indexRef.current) setIndex(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames.length]);

  if (frames.length === 0) return null;
  // index starts at -1 when the first data had no frames yet; clamp both ends.
  const at = Math.max(0, Math.min(index, frames.length - 1));
  const f = frames[at]!;
  const r = data.map.radius;
  const pad = r * 0.16;
  const hueOf = (p: number) => data.players.find((pl) => pl.p === p)?.hue ?? null;
  const maxSoldiers = Math.max(1, ...frames.flatMap((fr) => fr.a.map((a) => a[3])));
  const startsAt = data.digest.startsAt;
  const capitals = data.map.sites.filter((s) => s.kind === 'capital').length;
  const unit = r / 210; // one miniature-unit, so site art keeps its size on every map
  const tokenScale = (n: number) => unit * (0.8 + 1.1 * Math.sqrt(n / maxSoldiers));

  return (
    <figure className="timelapse map-plate">
      <svg viewBox={`${-r - pad} ${-r - pad} ${2 * (r + pad)} ${2 * (r + pad)}`} className="timelapse-map" role="img" aria-label={`The battlefield at ${clock(startsAt + f.t * TICK_MS)}`}>
        <defs>
          <radialGradient id={ids.land} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#d9cf9a" />
            <stop offset="0.6" stopColor="#bfb27a" />
            <stop offset="1" stopColor="#9c9160" />
          </radialGradient>
          <pattern id={ids.hatch} width={r * 0.026} height={r * 0.026} patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
            <path d={`M0 0v${r * 0.026}`} stroke="rgba(34,24,15,.26)" strokeWidth={r * 0.004} />
          </pattern>
          <pattern id={ids.waves} width={r * 0.12} height={r * 0.065} patternUnits="userSpaceOnUse">
            <path d={`M${r * 0.01} ${r * 0.04}c${r * 0.015} ${-r * 0.016} ${r * 0.03} ${-r * 0.016} ${r * 0.045} 0`} fill="none" stroke="rgba(44,74,154,.34)" strokeWidth={r * 0.004} />
          </pattern>
          <clipPath id={ids.clip}>
            <path d={coast(r, r * 0.025, 1.3)} />
          </clipPath>
        </defs>

        <Land map={data.map} ids={ids} />

        {data.map.sites.map((s, k) => {
          const owner = f.o[k] ?? -1;
          const hue = owner >= 0 ? hueOf(owner) : null;
          if (s.kind === 'capital') return <Castle key={k} x={s.x} y={s.y} k={unit * 1.35} hue={hue} />;
          // TODO client: draw border forts as forts, and the centre's lake or massif.
          return <Shrine key={k} x={s.x} y={s.y} k={unit * 1.1} hue={hue} name={FORT_NAMES[(k - capitals) % FORT_NAMES.length] ?? ''} />;
        })}

        {/* Trails: where each army's platoons stood in the frames just before. */}
        {Array.from({ length: TRAIL }, (_, back) => {
          const prev = frames[at - TRAIL + back];
          if (!prev) return null;
          const alpha = 0.1 + (back / TRAIL) * 0.22;
          return (
            <g key={`trail${back}`} opacity={alpha}>
              {prev.a.map(([p, x, y, n], i) => {
                const hue = hueOf(p);
                return <circle key={i} cx={x} cy={y} r={tokenScale(n) * 2.6} fill={hue === null ? SHADE : pigment(hue, 'shade')} />;
              })}
            </g>
          );
        })}
        {f.a.map(([p, x, y, n], i) => (
          <Token key={i} x={x} y={y} k={tokenScale(n)} hue={hueOf(p)} />
        ))}

        {/* Marginalia: the compass rose. */}
        <g transform={`translate(${r * 0.98} ${-r * 0.98}) scale(${unit * 1.1})`} stroke={INK} strokeWidth="1.1">
          <circle r="13" fill="none" />
          <path d="M0-19 3 0 0 19-3 0Z" fill={VELLUM} />
          <path d="M0-19 3 0H-3Z" fill="#b8321f" />
          <path d="M-19 0 0 3 19 0 0-3Z" fill={VELLUM} />
        </g>
      </svg>
      <figcaption className="timelapse-controls">
        <button className="icon-btn" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause the timelapse' : 'Play the timelapse'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={at}
          aria-label="Time of day"
          aria-valuetext={clock(startsAt + f.t * TICK_MS)}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
        <span className="num timelapse-time">{clock(startsAt + f.t * TICK_MS)}</span>
      </figcaption>
      <ul className="timelapse-legend">
        {data.players.map((pl) => (
          <li key={pl.p}>
            <svg className="timelapse-shield" viewBox="-6 -7 12 14" width="14" height="16" aria-hidden>
              <path d="M-5-6h10v4.5C5 2 2.5 4.6 0 6-2.5 4.6-5 2-5-1.5Z" fill={pigment(pl.hue)} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="who" style={hueVar(pl.hue)}>
              @{pl.login}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
