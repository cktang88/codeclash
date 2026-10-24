import { useEffect, useState } from 'react';
import { pigment as dye, prefersReducedMotion } from './codex.tsx';

/** Five sample armies on the ring, in slot order: pigment hues, not live data. */
const ARMIES = [8, 212, 128, 42, 280];

const R = 150;
/** The ring road the capitals stand on, and the lake at its centre. */
const RING = 104;
const LAKE = 62;
/** Army pigments in the bible's three values; a lightness above 50 reads as the light wash. */
const pigment = (h: number, l = 46) => dye(h, l >= 54 ? 'light' : l <= 40 ? 'shade' : 'base');

function angleOf(slot: number): number {
  return -Math.PI / 2 + (slot * Math.PI * 2) / ARMIES.length;
}

function capitalAt(slot: number, r = RING): [number, number] {
  const a = angleOf(slot);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** A wobbly closed coastline, deterministic. */
function coast(r: number, amp: number, seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const k = r + amp * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2) * 0.3 + Math.sin(a * 13 + seed * 0.5) * 0.2);
    pts.push(`${(Math.cos(a) * k).toFixed(1)} ${(Math.sin(a) * k).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

/** The road along the ring from one capital toward its neighbour, `dir` +1 clockwise, stopping at `share` of the way. */
function road(slot: number, dir: number, share = 0.5): string {
  const a0 = angleOf(slot) + (dir * 0.16);
  const a1 = angleOf(slot) + (dir * Math.PI * 2 * share) / ARMIES.length;
  const sweep = dir > 0 ? 1 : 0;
  return `M${(Math.cos(a0) * RING).toFixed(1)} ${(Math.sin(a0) * RING).toFixed(1)} A${RING} ${RING} 0 0 ${sweep} ${(Math.cos(a1) * RING).toFixed(1)} ${(Math.sin(a1) * RING).toFixed(1)}`;
}

/** A capital. With a `conqueror`, its banner is torn down and the conqueror's run up, over and over. */
function Keep({ x, y, hue, conqueror, still }: { x: number; y: number; hue: number; conqueror?: number; still?: boolean }) {
  if (conqueror !== undefined && !still) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx="0" cy="11" rx="15" ry="4" fill="rgba(34,24,15,.25)" />
        <path d="M-11 10V-4h4v-4h3v4h8v-4h3v4h4v14Z" fill={pigment(hue, 46)} stroke="#22180f" strokeWidth="1.4" strokeLinejoin="round">
          <animate attributeName="fill" dur="9s" repeatCount="indefinite" values={`${pigment(hue, 46)};${pigment(hue, 46)};${pigment(conqueror, 46)};${pigment(conqueror, 46)}`} keyTimes="0;0.45;0.55;1" />
        </path>
        <path d="M-3 10V3a3 3 0 0 1 6 0v7" fill="#22180f" />
        <path d="M-8 9c1-3 2-4 1.5-7 1.5 1.5 2.4 3 2.2 5.5M5 9c0-2.6 1.6-4 1-6.5 1.6 1.6 2.4 4 1.8 6.5" fill="rgba(22,16,12,.5)" opacity="0">
          <animate attributeName="opacity" dur="9s" repeatCount="indefinite" values="0;0;1;1" keyTimes="0;0.5;0.55;1" />
        </path>
        <path d="M0 -8v-10" stroke="#22180f" strokeWidth="1.2" />
        <path d="M0 -18h9l-2.4 2.6L9 -13H0" fill={pigment(hue, 52)} stroke="#22180f" strokeWidth="1">
          <animate attributeName="fill" dur="9s" repeatCount="indefinite" values={`${pigment(hue, 52)};${pigment(hue, 52)};${pigment(conqueror, 52)};${pigment(conqueror, 52)}`} keyTimes="0;0.5;0.56;1" />
          <animateTransform attributeName="transform" type="translate" dur="9s" repeatCount="indefinite" values="0 0;0 0;0 9;0 0;0 0" keyTimes="0;0.44;0.5;0.58;1" />
        </path>
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="11" rx="15" ry="4" fill="rgba(34,24,15,.25)" />
      <path d="M-11 10V-4h4v-4h3v4h8v-4h3v4h4v14Z" fill={pigment(hue, 46)} stroke="#22180f" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M-3 10V3a3 3 0 0 1 6 0v7" fill="#22180f" />
      <path d="M4 -4V8M7 -4V9" stroke="rgba(34,24,15,.45)" strokeWidth="1" />
      <path d="M0 -8v-10" stroke="#22180f" strokeWidth="1.2" />
      <path d="M0 -18h9l-2.4 2.6L9 -13H0" fill={pigment(hue, 52)} stroke="#22180f" strokeWidth="1">
        <animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="M0 -18h9l-2.4 2.6L9 -13H0;M0 -18h8.4l-1.6 2.8L9.2 -13H0;M0 -18h9l-2.4 2.6L9 -13H0" />
      </path>
    </g>
  );
}

/** A platoon marching along the ring road toward a front, a little banner over a knot of soldiers. */
function Platoon({ hue, path, dur, begin }: { hue: number; path: string; dur: number; begin: number }) {
  return (
    <g>
      <g>
        <circle r="5.2" fill={pigment(hue, 44)} stroke="#22180f" strokeWidth="1.3" />
        <path d="M0 -5v-9h7l-2 2.2 2 2.2H0" fill={pigment(hue, 56)} stroke="#22180f" strokeWidth="1" />
        <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;0.86;1" calcMode="linear" />
        <animate attributeName="opacity" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.06;0.84;1" />
      </g>
    </g>
  );
}

/** A clash at a border fort: a woodcut starburst that flares and fades. */
function Clash({ x, y, begin }: { x: number; y: number; begin: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity="0">
      <path d="M0 -9 2 -2 9 0 2 2 0 9 -2 2 -9 0 -2 -2Z" fill="#ff9a3c" stroke="#22180f" strokeWidth="1" />
      <animate attributeName="opacity" dur="2.6s" begin={`${begin}s`} repeatCount="indefinite" values="0;1;0;0" keyTimes="0;0.08;0.35;1" />
      <animateTransform attributeName="transform" type="scale" additive="sum" dur="2.6s" begin={`${begin}s`} repeatCount="indefinite" values="0.4;1.2;0.8;0.8" keyTimes="0;0.08;0.35;1" />
    </g>
  );
}

/**
 * The home page's centrepiece: a miniature of the painted battlefield on its vellum sheet: five
 * capitals on a ring round a lake, border forts between them, and every army marching out along
 * the ring road against its two neighbours. One capital changes hands as you watch.
 */
export function MiniMap({ className }: { className?: string }) {
  const [still, setStill] = useState(true);
  useEffect(() => setStill(prefersReducedMotion()), []);
  return (
    <svg className={className} viewBox="-200 -200 400 400" role="img" aria-label="A miniature of the battlefield: five capitals stand on a ring round a lake, and each army marches along the ring road to fight its two neighbours at the border forts between them.">
      <defs>
        <pattern id="mm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
          <path d="M0 0v5" stroke="rgba(34,24,15,.28)" strokeWidth="1" />
        </pattern>
        <pattern id="mm-waves" width="22" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 7c3-3 6-3 9 0" fill="none" stroke="rgba(44,74,154,.35)" strokeWidth="1" />
        </pattern>
        <radialGradient id="mm-land" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#d9cf9a" />
          <stop offset="0.6" stopColor="#bfb27a" />
          <stop offset="1" stopColor="#9c9160" />
        </radialGradient>
        <radialGradient id="mm-lake">
          <stop offset="0" stopColor="#1e3670" />
          <stop offset="0.75" stopColor="#2c4a9a" />
          <stop offset="1" stopColor="#5a7cb0" />
        </radialGradient>
        <clipPath id="mm-land-clip">
          <path d={coast(R, 9, 1.3)} />
        </clipPath>
      </defs>

      {/* The sea, with inked swells. */}
      <rect x="-200" y="-200" width="400" height="400" fill="rgba(44,74,154,.1)" />
      <rect x="-200" y="-200" width="400" height="400" fill="url(#mm-waves)" />
      <path d={coast(R + 14, 9, 1.3)} fill="none" stroke="rgba(44,74,154,.4)" strokeWidth="1" strokeDasharray="2 4" />
      <path d={coast(R + 24, 10, 1.3)} fill="none" stroke="rgba(44,74,154,.25)" strokeWidth="1" strokeDasharray="1 6" />

      {/* The land: painted, hatched on its shadow side, inked at the shore. */}
      <path d={coast(R, 9, 1.3)} fill="url(#mm-land)" />
      <g clipPath="url(#mm-land-clip)">
        <circle cx="70" cy="80" r="150" fill="url(#mm-hatch)" opacity="0.8" />
        {[
          [-128, -30],
          [-112, 52],
          [118, 40],
          [128, -24],
          [-40, 132],
          [48, 130],
          [-70, -118],
          [74, -116],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="8" fill="#5f7a3a" stroke="#22180f" strokeWidth="1.2" />
            <circle cx="-3" cy="-3" r="3.5" fill="#89a052" />
            <circle cx="9" cy="4" r="6" fill="#536c33" stroke="#22180f" strokeWidth="1.2" />
          </g>
        ))}
        {/* The lake at the centre, impassable: the war goes round it. */}
        <path d={coast(LAKE, 4, 2.1)} fill="url(#mm-lake)" stroke="#22180f" strokeWidth="1.6" />
        <path d={coast(LAKE - 10, 3, 2.1)} fill="none" stroke="rgba(239,228,200,.35)" strokeWidth="1" strokeDasharray="6 4" />
        <path d="M-24 -8q5-3 10 0t10 0M2 8q5-3 10 0t10 0" fill="none" stroke="rgba(239,228,200,.4)" strokeWidth="1" />
        {/* The ring road. */}
        <circle r={RING} fill="none" stroke="rgba(34,24,15,.45)" strokeWidth="6" />
        <circle r={RING} fill="none" stroke="#c9a868" strokeWidth="3.6" />
        <circle r={RING} fill="none" stroke="rgba(120,92,56,.5)" strokeWidth="0.8" strokeDasharray="2 4" />
      </g>
      <path d={coast(R, 9, 1.3)} fill="none" stroke="#22180f" strokeWidth="2" />

      {/* Border forts between neighbours, each flying its holder's pennant. */}
      {ARMIES.map((_, slot) => {
        const [x, y] = capitalAt(slot + 0.5);
        const holder = ARMIES[(slot + (slot % 2)) % ARMIES.length]!;
        return (
          <g key={`fort${slot}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <path d="M-5 6V-4h2v-2h2v2h2v-2h2v2h2V6Z" fill="#b5a78a" stroke="#22180f" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M0 -6v-8h7l-2 2 2 2H0" fill={pigment(holder, 52)} stroke="#22180f" strokeWidth="1" />
            <title>{`A border fort between seats ${slot + 1} and ${((slot + 1) % ARMIES.length) + 1}`}</title>
          </g>
        );
      })}

      {ARMIES.map((hue, slot) => {
        const [x, y] = capitalAt(slot);
        return <Keep key={hue} x={x} y={y} hue={hue} conqueror={slot === 2 ? ARMIES[1] : undefined} still={still} />;
      })}
      {!still &&
        ARMIES.flatMap((hue, slot) => [
          <Platoon key={`${hue}cw`} hue={hue} path={road(slot, 1, 0.46)} dur={7 + slot * 0.6} begin={-slot * 1.3} />,
          <Platoon key={`${hue}ccw`} hue={hue} path={road(slot, -1, 0.46)} dur={7.5 + slot * 0.5} begin={-slot * 1.7 - 3} />,
        ])}
      {!still &&
        ARMIES.map((_, slot) => {
          const [x, y] = capitalAt(slot + 0.5, RING + 3);
          return <Clash key={`clash${slot}`} x={x} y={y} begin={slot * 0.7} />;
        })}

      {/* Marginalia: compass rose, a sea serpent, the scribe's notes. */}
      <g transform="translate(158 -158)" stroke="#22180f" strokeWidth="1.2">
        <circle r="17" fill="none" />
        <path d="M0-24 4 0 0 24-4 0Z" fill="#efe4c8" />
        <path d="M0-24 4 0H-4Z" fill="#b8321f" />
        <path d="M-24 0 0 4 24 0 0-4Z" fill="#efe4c8" />
        <text y="-28" textAnchor="middle" fontFamily="'IM Fell English SC', serif" fontSize="12" fill="#22180f" stroke="none">
          N
        </text>
      </g>
      <g transform="translate(-160 150)" fill="none" stroke="#22180f" strokeWidth="1.6" strokeLinecap="round">
        <path d="M-14 4c4-10 10-10 12 0s8 10 12 0 8-10 12 0">
          {!still && <animateTransform attributeName="transform" type="translate" dur="5s" repeatCount="indefinite" values="0 0;4 -2;0 0" />}
        </path>
        <path d="M22 4c2-6 7-8 10-5l-3 3" />
        <circle cx="29" cy="-1" r="0.8" fill="#22180f" />
      </g>
      <g transform="translate(142 148) rotate(-4)">
        <path d="M-16 0h32l-6 8h-20Z" fill="#8a6418" stroke="#22180f" strokeWidth="1.3" />
        <path d="M0 0V-24M0-22 12-6H0" fill="#efe4c8" stroke="#22180f" strokeWidth="1.2" />
        {!still && <animateTransform attributeName="transform" type="rotate" additive="sum" dur="4s" repeatCount="indefinite" values="-3;3;-3" />}
      </g>
      <text x="0" y="4" textAnchor="middle" fontFamily="'IM Fell English SC', serif" fontSize="11" letterSpacing="1.5" fill="#efe4c8" stroke="#22180f" strokeWidth="2.4" paintOrder="stroke">
        THE INKWELL
      </text>
      <text x="-176" y="-170" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="12" fill="#4a3a28">
        Mare Mergeum
      </text>
    </svg>
  );
}
