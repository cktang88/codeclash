import { useId, type ReactNode } from 'react';
import { battalionFlag, type Emblem, type Flag as FlagSpec, type Pattern } from '../../rules/heraldry.ts';
import { roman } from '../../sim/chronicle.ts';

function patternShape(p: Pattern, fill: string): ReactNode {
  switch (p) {
    case 'plain':
      return null;
    case 'chevron':
      return <path d="M0 26 20 12 40 26v8L20 20 0 34z" fill={fill} />;
    case 'saltire':
      return <path d="M0 0l40 28M40 0 0 28" stroke={fill} strokeWidth={6} />;
    case 'pale':
      return <rect x="15" y="0" width="10" height="28" fill={fill} />;
    case 'fess':
      return <rect x="0" y="10" width="40" height="8" fill={fill} />;
    case 'quarterly':
      return (
        <>
          <rect x="20" y="0" width="20" height="14" fill={fill} />
          <rect x="0" y="14" width="20" height="14" fill={fill} />
        </>
      );
    case 'bend':
      return <path d="M0 0h8l32 22v6h-8L0 6z" fill={fill} />;
    case 'chief':
      return <rect x="0" y="0" width="40" height="8" fill={fill} />;
  }
}

export const EMBLEM_PATHS: Record<Emblem, string> = {
  star: 'M0-5 1.5-1.5 5-1.5 2.2.8 3.2 4.5 0 2.3-3.2 4.5-2.2.8-5-1.5-1.5-1.5z',
  tower: 'M-3.5 4.5v-7h1.4v1.3h1.4v-1.3h1.4v1.3h1.4v-1.3h1.4v7z',
  key: 'M-1-4.5a2 2 0 1 1 2 0V4.5h2v-1.2h-1.2v-1.2H3V.9H1V-4.5z',
  crown: 'M-4.5 3.5-5-2.5l2.5 2L0-3.5l2.5 3 2.5-2-.5 6z',
  bolt: 'M1-5-3.5 1h3L-1.5 5 3.5-1h-3z',
  leaf: 'M-4 4C-4-1 0-5 4.5-4.5 5 0 1 4-4 4zM-4 4 1-1',
  sun: 'M0-2.6a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 1 0 0-5.2zM0-5v1.2M0 3.8V5M-5 0h1.2M3.8 0H5',
  moon: 'M1.5-4.5a4.5 4.5 0 1 0 3 7.8A3.6 3.6 0 0 1 1.5-4.5z',
  anchor: 'M0-4.5a1.2 1.2 0 1 0 0 .01M0-3.3V4.5M-2.5-1.5h5M-4 1.5c0 2 2 3 4 3s4-1 4-3',
  eye: 'M-5 0s2-3.5 5-3.5S5 0 5 0 3 3.5 0 3.5-5 0-5 0zM0-1.3a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6z',
  wing: 'M-4.5 3.5C-4.5-2 0-4.5 4.5-4.5 3-2.5 4-1.5 2.5 0c1 .8.5 2-1 2.2C1 3.5-1.5 4-4.5 3.5z',
  flame: 'M0 5c2.5 0 4-1.6 4-3.8C4-1.5 1.5-2.5 1.2-5 0-3.7-1.4-2.4-1.4-.4c-.8-.6-1.1-1.4-1.1-2C-3.6-1.4-4-.1-4 1.2-4 3.4-2.5 5 0 5z',
};

/** Cloth is dyed, never neon: every army colour is mixed toward a warm earth (docs/art-direction.md §2). */
const dyed = (color: string) => ({ fill: `color-mix(in srgb, ${color} 74%, #9a7a4e)` });

/** A battalion banner as SVG: field, pattern, accent stripe, emblem and initials. */
export function FlagSvg({ flag, size = 40, ordinal }: { flag: FlagSpec; size?: number; ordinal?: number }) {
  const clip = `flag${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const w = size;
  const h = Math.round(size * 0.75);
  return (
    <svg className="flag" viewBox="0 0 48 36" width={w} height={h} aria-hidden>
      <path d="M2 2v32" stroke="#d9c79c" strokeWidth={2.4} strokeLinecap="round" />
      <g transform="translate(4 3)">
        <clipPath id={clip}>
          <rect width="40" height="28" />
        </clipPath>
        <path d="M0 0h40v28H0z" fill={flag.field} style={dyed(flag.field)} />
        <g clipPath={`url(#${clip})`}>{patternShape(flag.pattern, flag.charge)}</g>
        <rect x="0" y="25" width="40" height="3" fill={flag.accent} />
        <rect x="0" y="0" width="40" height="28" fill="none" stroke="#22180f" strokeWidth={1.4} />
        <path d={EMBLEM_PATHS[flag.emblem]} transform="translate(8 7.5) scale(0.9)" fill="#efe4c8" fillOpacity={0.9} stroke="#22180f" strokeWidth={0.6} />
        <text x="26" y="17.5" textAnchor="middle" fontFamily="'Alegreya SC', Georgia, serif" fontWeight={800} fontSize={11} fill="#efe4c8" stroke="#22180f" strokeWidth={2.4} paintOrder="stroke">
          {flag.initials}
        </text>
        {ordinal !== undefined && (
          <text x="36" y="7" textAnchor="end" fontFamily="'IM Fell English SC', Georgia, serif" fontWeight={400} fontSize={6.5} fill="#efe4c8" stroke="#22180f" strokeWidth={1.6} paintOrder="stroke">
            {roman(ordinal)}
          </text>
        )}
      </g>
    </svg>
  );
}

export function BattalionFlag({ hue, repo, language, size, ordinal }: { hue: number; repo: string; language: string | null; size?: number; ordinal?: number }) {
  return <FlagSvg flag={battalionFlag(hue, repo, language)} size={size} ordinal={ordinal} />;
}
