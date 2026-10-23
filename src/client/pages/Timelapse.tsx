import { useEffect, useRef, useState } from 'react';
import type { DigestResponse } from '../../protocol.ts';
import { armyColor } from '../../rules/heraldry.ts';
import { TICK_MS } from '../../sim/api.ts';
import { clock } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';

const LOOP_MS = 15_000;
const HOLD_MS = 1200;

/** The whole day on a minimap in fifteen seconds: territory, platoons and the Monolith. */
export function Timelapse({ data }: { data: DigestResponse }) {
  const frames = data.timelapse;
  const [index, setIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(() => typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const started = useRef<number | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    const from = indexRef.current;
    started.current = performance.now() - (from >= frames.length - 1 ? 0 : (from / (frames.length - 1)) * LOOP_MS);
    const tick = (now: number) => {
      const elapsed = (now - started.current!) % (LOOP_MS + HOLD_MS);
      setIndex(Math.min(frames.length - 1, Math.floor((elapsed / LOOP_MS) * (frames.length - 1))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames.length]);

  if (frames.length === 0) return null;
  const f = frames[Math.min(index, frames.length - 1)]!;
  const r = data.map.radius;
  const pad = r * 0.06;
  const hueOf = (p: number) => data.players.find((pl) => pl.p === p)?.hue ?? null;
  const capitalOwner = (slot: number) => data.players.find((pl) => pl.slot === slot)?.p ?? -1;
  const maxSoldiers = Math.max(1, ...frames.flatMap((fr) => fr.a.map((a) => a[3])));
  const startsAt = data.digest.startsAt;

  return (
    <figure className="timelapse panel">
      <svg viewBox={`${-r - pad} ${-r - pad} ${2 * (r + pad)} ${2 * (r + pad)}`} className="timelapse-map" role="img" aria-label={`The battlefield at ${clock(startsAt + f.t * TICK_MS)}`}>
        <defs>
          <radialGradient id="tl-ground">
            <stop offset="0%" stopColor="#2a3326" />
            <stop offset="100%" stopColor="#151b16" />
          </radialGradient>
        </defs>
        <circle r={r} fill="url(#tl-ground)" stroke="rgba(226,189,104,0.45)" strokeWidth={r * 0.008} />
        {data.map.sites.map((s, k) => {
          const owner = s.kind === 'capital' ? capitalOwner(s.slot) : (f.o[k] ?? -1);
          const hue = owner >= 0 ? hueOf(owner) : null;
          const fill = hue === null ? '#4a4f55' : armyColor(hue, s.kind === 'capital' ? 45 : 55);
          if (s.kind === 'capital') {
            const size = r * 0.07;
            return <rect key={k} x={s.x - size / 2} y={s.y - size / 2} width={size} height={size} rx={size * 0.2} fill={fill} stroke="#0a0d10" strokeWidth={r * 0.008} opacity={owner < 0 ? 0.35 : 1} />;
          }
          const size = s.kind === 'heart' ? r * 0.07 : r * 0.045;
          return (
            <g key={k}>
              <path d={`M${s.x} ${s.y - size} L${s.x + size} ${s.y} L${s.x} ${s.y + size} L${s.x - size} ${s.y}Z`} fill={fill} stroke="#f1e7cf" strokeOpacity={0.6} strokeWidth={r * 0.006} />
              {s.kind === 'heart' && f.m > 0 && (
                <circle r={size * 1.6} cx={s.x} cy={s.y} fill="none" stroke="#f07a63" strokeWidth={r * 0.012} strokeDasharray={`${f.m * 2 * Math.PI * size * 1.6} 9999`} transform={`rotate(-90 ${s.x} ${s.y})`} />
              )}
            </g>
          );
        })}
        {f.a.map(([p, x, y, n], i) => {
          const hue = hueOf(p);
          return <circle key={i} cx={x} cy={y} r={r * (0.012 + 0.03 * Math.sqrt(n / maxSoldiers))} fill={hue === null ? '#aaa' : armyColor(hue, 62)} stroke="#0a0d10" strokeWidth={r * 0.004} opacity={0.92} />;
        })}
      </svg>
      <figcaption className="timelapse-controls">
        <button className="icon-btn" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause the timelapse' : 'Play the timelapse'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
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
            <span className="swatch" style={{ background: armyColor(pl.hue) }} aria-hidden />@{pl.login}
          </li>
        ))}
      </ul>
    </figure>
  );
}
