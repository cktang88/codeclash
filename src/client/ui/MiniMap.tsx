import { useEffect, useState } from 'react';
import { pigment as dye, prefersReducedMotion } from './codex.tsx';

/** Four sample armies for the preview: pigment hues, not live data. */
const ARMIES = [
  { hue: 8, angle: -2.4 },
  { hue: 212, angle: -0.75 },
  { hue: 128, angle: 0.85 },
  { hue: 42, angle: 2.45 },
];

const R = 150;
/** Army pigments in the bible's three values; a lightness above 50 reads as the light wash. */
const pigment = (h: number, l = 46) => dye(h, l >= 54 ? 'light' : l <= 40 ? 'shade' : 'base');

function capitalAt(angle: number, r = R * 0.78): [number, number] {
  return [Math.cos(angle) * r, Math.sin(angle) * r];
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

/** A road from a capital to the Heart, bending a little. */
function road(angle: number): string {
  const [x, y] = capitalAt(angle);
  const bend = angle + 0.35;
  const mx = Math.cos(bend) * R * 0.42;
  const my = Math.sin(bend) * R * 0.42;
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${(-x * 0.1).toFixed(1)} ${(-y * 0.1).toFixed(1)}`;
}

function Keep({ x, y, hue }: { x: number; y: number; hue: number }) {
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

/** A platoon marching down its road, a little banner over a knot of soldiers. */
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

/** A clash near the Heart: a woodcut starburst that flares and fades. */
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
 * The home page's centrepiece: a miniature of the painted battlefield on its vellum sheet,
 * with armies marching from their capitals to fight around the Monolith.
 */
export function MiniMap({ className }: { className?: string }) {
  const [still, setStill] = useState(true);
  useEffect(() => setStill(prefersReducedMotion()), []);
  return (
    <svg className={className} viewBox="-200 -200 400 400" role="img" aria-label="A miniature of the battlefield: four armies march from their capitals to fight around the Legacy Monolith.">
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
        <radialGradient id="mm-heart">
          <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
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
          [-62, -48],
          [-40, -70],
          [58, 30],
          [80, 6],
          [-20, 92],
          [8, 104],
          [104, -60],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="9" fill="#5f7a3a" stroke="#22180f" strokeWidth="1.2" />
            <circle cx="-3" cy="-3" r="4" fill="#89a052" />
            <circle cx="10" cy="5" r="7" fill="#536c33" stroke="#22180f" strokeWidth="1.2" />
          </g>
        ))}
        {ARMIES.map((a) => (
          <path key={a.hue} d={road(a.angle)} fill="none" stroke="#7a6640" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
        ))}
      </g>
      <path d={coast(R, 9, 1.3)} fill="none" stroke="#22180f" strokeWidth="2" />

      {/* The Heart and the Monolith. */}
      <circle r="34" fill="url(#mm-heart)">
        {!still && <animate attributeName="r" dur="3s" repeatCount="indefinite" values="30;38;30" />}
      </circle>
      <path d="M-7 12-5-16 0-24 5-16 7 12Z" fill="#1a1d26" stroke="#22180f" strokeWidth="1.5" />
      <path d="M-1-14 2-6-2 1 1 9" fill="none" stroke="#ff9a3c" strokeWidth="1.6">
        {!still && <animate attributeName="stroke-opacity" dur="1.8s" repeatCount="indefinite" values="1;.4;1" />}
      </path>
      <ellipse cy="13" rx="12" ry="3" fill="rgba(34,24,15,.35)" />

      {ARMIES.map((a) => {
        const [x, y] = capitalAt(a.angle);
        return <Keep key={a.hue} x={x} y={y} hue={a.hue} />;
      })}
      {!still &&
        ARMIES.flatMap((a, i) => [
          <Platoon key={`${a.hue}a`} hue={a.hue} path={road(a.angle)} dur={9 + i} begin={-i * 2.2} />,
          <Platoon key={`${a.hue}b`} hue={a.hue} path={road(a.angle)} dur={9 + i} begin={-i * 2.2 - 4.6} />,
        ])}
      {!still && (
        <>
          <Clash x={-18} y={-22} begin={0} />
          <Clash x={22} y={-8} begin={0.9} />
          <Clash x={-6} y={24} begin={1.7} />
        </>
      )}

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
      <text x="0" y="62" textAnchor="middle" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="13" fill="#22180f">
        the Heart
      </text>
      <text x="-176" y="-170" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="12" fill="#4a3a28">
        Mare Mergeum
      </text>
    </svg>
  );
}
