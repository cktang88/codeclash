import { useId, type ReactNode } from 'react';
import { pigment } from './codex.tsx';

// The ring of capitals as a small engraved figure: the centre's lake or massif, the ring road,
// each seat's keep in its holder's pigment, the border forts between them, and the fronts where
// two holders meet. Used by the HUD's ring diagram and by the digest's account of the war.

export interface RingFigureSeat {
  holder: number;
  founder: number;
  besieged?: boolean;
}

export interface RingFigureProps {
  slots: number;
  /** By slot. */
  seats: readonly RingFigureSeat[];
  /** By slot: the fort between seat s and seat s + 1. */
  forts?: readonly { owner: number; capturer?: number }[];
  hueOf(p: number): number | null;
  nameOf?(p: number): string;
  /** The viewer: its seats are ringed in gold, its fronts marked. */
  viewer?: number | null;
  /** The viewer's fronts: the road from one of its capitals (`from`, -1 for a rising) to a foe's (`to`). */
  fronts?: readonly { from: number; to: number; dir: number }[];
  /** 3 for a mountain massif; anything else is a lake. */
  centreKind?: number;
  /** The player who holds the whole ring, if anyone. */
  victor?: number;
  size?: number;
  onPick?(slot: number): void;
  label?: string;
  className?: string;
}

const RING = 66;
const CENTRE = 40;
const INK = '#22180f';
const VELLUM = '#efe4c8';
const GOLD = '#d4a93e';
const GOLD_HI = '#f6dc8c';
const VERMILION = '#b8321f';

function angleOf(slot: number, slots: number): number {
  return -Math.PI / 2 + (slot * Math.PI * 2) / slots;
}

function at(slot: number, slots: number, r = RING): [number, number] {
  const a = angleOf(slot, slots);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** An arc of the ring road from one seat to another, going `dir` (+1 clockwise). */
function arcPath(from: number, to: number, dir: number, slots: number, r: number): string {
  let span = ((to - from) * dir + slots) % slots;
  if (span === 0) span = slots;
  const a0 = angleOf(from, slots);
  const a1 = a0 + (dir * span * Math.PI * 2) / slots;
  const large = span > slots / 2 ? 1 : 0;
  const sweep = dir > 0 ? 1 : 0;
  return `M${(Math.cos(a0) * r).toFixed(1)} ${(Math.sin(a0) * r).toFixed(1)} A${r} ${r} 0 ${large} ${sweep} ${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)}`;
}

function Keep({ x, y, fill, k }: { x: number; y: number; fill: string; k: number }) {
  return (
    <path
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k})`}
      d="M-8 7V-3h3v-3h2.4v3h5.2v-3H5v3h3v10Z"
      fill={fill}
      stroke={INK}
      strokeWidth={1.3 / k}
      strokeLinejoin="round"
    />
  );
}

export function RingFigure({ slots, seats, forts, hueOf, nameOf, viewer = null, fronts, centreKind, victor = -1, size = 72, onPick, label, className }: RingFigureProps) {
  const id = useId().replace(/:/g, '');
  const lake = centreKind !== 3;
  const k = Math.max(0.7, Math.min(1.25, 7 / Math.max(3, slots)));
  const name = (p: number) => (p >= 0 ? (nameOf?.(p) ?? `Army ${p + 1}`) : 'no one');
  // Fronts: wherever two neighbouring claimed seats are held by different players, at the fort between.
  const claimed = seats.map((s, i) => (s.holder >= 0 ? i : -1)).filter((i) => i >= 0);
  const marks: ReactNode[] = [];
  if (claimed.length > 1) {
    for (let i = 0; i < claimed.length; i++) {
      const a = claimed[i]!;
      const b = claimed[(i + 1) % claimed.length]!;
      if (seats[a]!.holder === seats[b]!.holder) continue;
      const span = (b - a + slots) % slots || slots;
      const mid = a + span / 2;
      const [x, y] = at(mid, slots);
      const mine = viewer !== null && (seats[a]!.holder === viewer || seats[b]!.holder === viewer);
      marks.push(
        <g key={`f${a}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angleOf(mid, slots) * 180) / Math.PI + 90).toFixed(0)})`}>
          <path d="M-5 -5 5 5M5 -5 -5 5" stroke={INK} strokeWidth={mine ? 3.6 : 3} strokeLinecap="round" />
          <path d="M-5 -5 5 5M5 -5 -5 5" stroke={mine ? GOLD_HI : VELLUM} strokeWidth={mine ? 1.6 : 1.2} strokeLinecap="round" />
        </g>,
      );
    }
  }
  const summary =
    label ??
    (victor >= 0
      ? `The ring: ${name(victor)} holds all ${claimed.length} capitals.`
      : `The ring of ${slots} seats: ${seats.map((s, i) => `seat ${i + 1} ${s.holder >= 0 ? `held by ${name(s.holder)}` : 'open'}`).join(', ')}.`);
  return (
    <svg className={`ring-figure${className ? ` ${className}` : ''}`} viewBox="-100 -100 200 200" width={size} height={size} role="img" aria-label={summary}>
      <defs>
        <radialGradient id={`${id}-lake`}>
          <stop offset="0" stopColor="#1e3670" />
          <stop offset="0.7" stopColor="#2c4a9a" />
          <stop offset="1" stopColor="#5a7cb0" />
        </radialGradient>
        <radialGradient id={`${id}-rock`}>
          <stop offset="0" stopColor="#6e6656" />
          <stop offset="0.75" stopColor="#978a70" />
          <stop offset="1" stopColor="#b5a78a" />
        </radialGradient>
      </defs>
      {/* The land: a disc of meadow round the ring road. */}
      <circle r="95" fill="#7d9250" stroke={INK} strokeWidth="2.4" />
      <circle r={CENTRE} fill={`url(#${id}-${lake ? 'lake' : 'rock'})`} stroke={INK} strokeWidth="1.8" />
      {lake ? (
        <g fill="none" stroke="rgba(239,228,200,.35)" strokeWidth="1.2">
          <path d="M-22 -6q5-3 10 0t10 0M-4 10q5-3 10 0t10 0M-14 22q4-2.4 8 0t8 0" />
        </g>
      ) : (
        <g stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M-26 14 -14 -6 -6 6 4 -14 16 8 26 14Z" fill="#c4b48e" />
          <path d="M4 -14 0 -6 6 -8Z" fill={VELLUM} />
          <path d="M4 -14 16 8 26 14H8Z" fill="rgba(40,46,74,.4)" stroke="none" />
        </g>
      )}
      {/* The ring road. */}
      <circle r={RING} fill="none" stroke={INK} strokeWidth="7" opacity="0.55" />
      <circle r={RING} fill="none" stroke="#c9a868" strokeWidth="4.4" />
      {victor >= 0 && <circle r={RING} fill="none" stroke={GOLD} strokeWidth="2.4" strokeDasharray="5 3" />}
      {/* The viewer's fronts: the roads it fights along, inked in gold. */}
      {fronts?.map((f, i) =>
        f.from >= 0 ? <path key={`r${i}`} d={arcPath(f.from, f.to, f.dir, slots, RING)} fill="none" stroke={GOLD_HI} strokeWidth="2.6" strokeDasharray="4 3" /> : null,
      )}
      {/* Border forts. */}
      {forts?.map((f, s) => {
        const [x, y] = at(s + 0.5, slots);
        const hue = f.owner >= 0 ? hueOf(f.owner) : null;
        const contested = (f.capturer ?? -1) >= 0;
        return (
          <g key={`t${s}`}>
            {contested && <circle cx={x} cy={y} r={7.5 * k} fill="none" stroke={VERMILION} strokeWidth="1.8" />}
            <rect x={x - 3.6 * k} y={y - 3.6 * k} width={7.2 * k} height={7.2 * k} transform={`rotate(45 ${x} ${y})`} fill={hue !== null ? pigment(hue) : VELLUM} stroke={INK} strokeWidth="1.3">
              <title>{`Border fort between seats ${s + 1} and ${((s + 1) % slots) + 1}: ${f.owner >= 0 ? `held by ${name(f.owner)}` : 'unclaimed'}`}</title>
            </rect>
          </g>
        );
      })}
      {marks}
      {/* The capitals. */}
      {seats.map((s, slot) => {
        const [x, y] = at(slot, slots);
        const hue = s.holder >= 0 ? hueOf(s.holder) : null;
        const mine = viewer !== null && viewer >= 0 && s.holder === viewer;
        const home = viewer !== null && viewer >= 0 && s.founder === viewer;
        const captured = s.holder >= 0 && s.founder >= 0 && s.holder !== s.founder;
        const pick = onPick ? () => onPick(slot) : undefined;
        const what = s.holder < 0 ? 'an open seat' : `held by ${name(s.holder)}${captured ? `, taken from ${name(s.founder)}` : ''}${s.besieged ? ', besieged' : ''}`;
        return (
          <g
            key={`c${slot}`}
            className={onPick ? 'ring-seat is-pickable' : 'ring-seat'}
            onClick={pick}
            role={onPick ? 'button' : undefined}
            tabIndex={onPick ? 0 : undefined}
            aria-label={onPick ? `Seat ${slot + 1}, ${what}. Show on the map.` : undefined}
            onKeyDown={pick ? (e) => (e.key === 'Enter' || e.key === ' ') && pick() : undefined}
          >
            <title>{`Seat ${slot + 1}: ${what}`}</title>
            <circle cx={x} cy={y} r={15 * k} fill="transparent" />
            {(mine || home) && <circle cx={x} cy={y} r={13 * k} fill="none" stroke={INK} strokeWidth="4.4" />}
            {(mine || home) && <circle cx={x} cy={y} r={13 * k} fill="none" stroke={mine ? GOLD_HI : VERMILION} strokeWidth="2.4" strokeDasharray={mine ? undefined : '3 2'} />}
            {s.besieged && (
              <circle className="ring-siege" cx={x} cy={y} r={11 * k} fill="none" stroke={VERMILION} strokeWidth="2.6" />
            )}
            {s.holder < 0 ? (
              <circle cx={x} cy={y} r={5 * k} fill="none" stroke={INK} strokeWidth="1.3" strokeDasharray="2 2" />
            ) : (
              <Keep x={x} y={y} fill={hue !== null ? pigment(hue) : VELLUM} k={k} />
            )}
            {captured && <path d={`M${x - 6 * k} ${y + 9 * k}h${12 * k}`} stroke={hueOf(s.founder) !== null ? pigment(hueOf(s.founder)!) : INK} strokeWidth="2.4" strokeLinecap="round" />}
          </g>
        );
      })}
    </svg>
  );
}
