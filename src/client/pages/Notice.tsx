import type { ReactNode } from 'react';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';

/** A centered full-page message: not found, private room, errors. */
export function Notice({ title, icon = 'flag', children }: { title: string; icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return (
    <main className="page-center">
      <div className="panel notice">
        <Icon name={icon} size={36} className="notice-icon" />
        <h1 className="notice-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** A map torn at its edge: the road the reader asked for runs off the parchment. */
export function LostPage({ path }: { path: string }) {
  return (
    <main className="page-center lost">
      <div className="torn-map">
        <svg className="torn-map-art" viewBox="0 0 420 300" aria-hidden>
          <defs>
            <pattern id="lost-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
              <path d="M0 0v5" stroke="rgba(34,24,15,.25)" strokeWidth="1" />
            </pattern>
          </defs>
          <path d="M18 120c30-40 80-60 130-48s70 40 112 30 60-30 74-10 6 60-30 82-90 18-130 40-110 26-140-8-46-46-16-86Z" fill="#cdbf88" stroke="#22180f" strokeWidth="2" />
          <path d="M120 170c30-20 80-30 140-6" fill="url(#lost-hatch)" />
          <path d="M60 210C110 190 170 150 230 140s110-20 160-60" fill="none" stroke="#7a6640" strokeWidth="3" strokeDasharray="1 6" strokeLinecap="round" />
          <g transform="translate(60 210)">
            <path d="M-9 8V-4h3v-3h3v3h6v-3h3v3h3V8Z" fill="#b8321f" stroke="#22180f" strokeWidth="1.3" />
          </g>
          <path d="M378 52c-12 16-4 30-18 44 14-4 22 8 30 0" fill="none" stroke="#22180f" strokeWidth="1.6" />
          <g className="lost-dragon" transform="translate(330 70)">
            <path d="M-34 6c10-18 26-26 44-24l8-10 4 12c8 4 12 10 12 18l-14-3-8 10 10 10c-8 7-20 10-30 6l-4 12-8-12c-8 0-12-6-14-19Z" fill="#2f7f6f" stroke="#22180f" strokeWidth="1.8" />
            <path d="M-12 -4c-6-14-18-20-30-18 6 6 8 12 6 18" fill="#3f8f7c" stroke="#22180f" strokeWidth="1.5" />
            <circle cx="20" cy="-4" r="1.6" fill="#22180f" />
            <path d="M34 6c10-2 18 2 26 8-8 0-14 2-20 6" fill="#ff9a3c" stroke="#b8321f" strokeWidth="1" />
          </g>
          <text x="300" y="150" textAnchor="middle" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="24" fill="#22180f">
            Here be dragons
          </text>
          <text x="96" y="248" fontFamily="'IM Fell English', serif" fontStyle="italic" fontSize="14" fill="#4a3a28">
            the known lands
          </text>
        </svg>
        <div className="torn-map-text">
          <h1 className="notice-title">Here be dragons</h1>
          <p>
            The road to <code>{path}</code> runs off the edge of the map.
          </p>
          <Link className="btn btn-primary" to={{ kind: 'home' }}>
            Back to the war table
          </Link>
        </div>
      </div>
    </main>
  );
}
