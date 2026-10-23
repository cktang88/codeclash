import type { ReactNode, SVGProps } from 'react';
import type { ChronicleKind } from '../../sim/chronicle.ts';
import { STATS } from '../../sim/stats.ts';

type IconProps = { size?: number; title?: string; className?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Svg({ size = 18, title, children, className, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`icon${className ? ` ${className}` : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// One silhouette per unit kind, indexed by Kind. Shapes echo the battlefield sprites.
const UNIT_PATHS: ReactNode[] = [
  // Legionary: spear and round shield
  <>
    <path d="M18 2.5 6 20.5" />
    <path d="m18 2.5-.6 3.4-2.6-1.8z" fill="currentColor" />
    <circle cx="9.5" cy="13" r="5" fill="currentColor" fillOpacity={0.25} />
  </>,
  // Warden: tower shield
  <>
    <path d="M12 2.5 19.5 5v7c0 4.6-3.2 8-7.5 9.5C7.7 20 4.5 16.6 4.5 12V5z" fill="currentColor" fillOpacity={0.25} />
    <path d="M12 6v12M8 10.5h8" />
  </>,
  // Archer: bow and arrow
  <>
    <path d="M7 3c6 3 6 15 0 18" />
    <path d="M7 3v18" strokeWidth={1} />
    <path d="M4 12h16m0 0-3-2.5m3 2.5-3 2.5" />
  </>,
  // Herald: banner on a staff
  <>
    <path d="M6 21V3" />
    <path d="M6 4h12l-3 4 3 4H6" fill="currentColor" fillOpacity={0.3} />
  </>,
  // Sapper: hammer
  <>
    <path d="m14 10-9.5 9.5a1.6 1.6 0 0 0 2.3 2.3L16.3 12" />
    <path d="m12.5 4.5 7 7 2-2-4-4.2c-1.4-1.4-3.4-1.8-5-.8z" fill="currentColor" fillOpacity={0.3} />
  </>,
  // Outrider: horse head
  <>
    <path d="M7 21v-5c-1.8-1.6-2.5-4-1.6-6.3L8 4l2 2.5 3-.5c3.4.5 5.6 3.1 6 6.6l.5 3.4-2.7.8-2.3-3-1.5 1.4V21" fill="currentColor" fillOpacity={0.25} />
    <circle cx="13" cy="9" r="0.8" fill="currentColor" />
  </>,
  // Golem: stacked stone block
  <>
    <rect x="6" y="3" width="12" height="7" rx="1" fill="currentColor" fillOpacity={0.25} />
    <rect x="4" y="10" width="16" height="8" rx="1" fill="currentColor" fillOpacity={0.25} />
    <path d="M7 18v3M17 18v3M9.5 6.5h.01M14.5 6.5h.01" />
  </>,
  // Mercenary: crossed swords
  <>
    <path d="m4 4 11 11M20 4 9 15" />
    <path d="m13 17 4-4M11 17l-4-4M15.5 19.5l4-4M8.5 19.5l-4-4" />
  </>,
  // Champion: crowned helm
  <>
    <path d="m5 9 2.5-5 2.5 3L12 3l2 4 2.5-3L19 9z" fill="currentColor" fillOpacity={0.35} />
    <path d="M5 9h14v4c0 4-3 7.5-7 8.5-4-1-7-4.5-7-8.5z" />
    <path d="M9 13h6" />
  </>,
];

export function UnitIcon({ kind, ...props }: IconProps & { kind: number }) {
  return (
    <Svg title={props.title ?? STATS[kind]?.name} {...props}>
      {UNIT_PATHS[kind] ?? <circle cx="12" cy="12" r="6" />}
    </Svg>
  );
}

const EVENT_PATHS: Record<ChronicleKind, ReactNode> = {
  join: <path d="M6 21V3m0 1h11l-2.5 4L17 12H6" />,
  muster: (
    <>
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  rout: <path d="M13 4a1.5 1.5 0 1 0 0 .01M9 21l2.5-6.5L14 17v4M7 12l3-4 4 1 2.5 3.5M11.5 14.5 10 8" />,
  wiped: (
    <>
      <path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3z" />
      <path d="M9.5 11h.01M14.5 11h.01M10 19v2M14 19v2" />
    </>
  ),
  champion: <path d="m5 10 2.5-5 2.5 3L12 4l2 4 2.5-3L19 10zM5 10h14v3l-3 3-4-3-3 4-4-4z" />,
  capture: (
    <>
      <path d="M6 21V3m0 1h11l-2.5 4L17 12H6" />
      <path d="m3 21h6" />
    </>
  ),
  sack: <path d="M12 21c4 0 7-2.6 7-6.5C19 10 15 8.5 14.5 3 12 5 9.5 7 9.5 10.5 8 9.5 7.5 8 7.5 7 5.8 8.6 5 11 5 14.5 5 18.4 8 21 12 21z" />,
  rebuilt: <path d="M3 21h18M5 21V10l4-3 3 2 3-2 4 3v11M9 21v-5h6v5" />,
  monolith: (
    <>
      <path d="M9 21 10 4l2-1.5L14 4l1 17z" />
      <path d="m10.5 9 3 2m-3.2 3.5 3.4 1.5" />
      <path d="M5 21h14" />
    </>
  ),
  cry: <path d="M4 10v4l9 5V5zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  doctrine: <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 0-2zM9 8h6M9 12h6" />,
  rally: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </>
  ),
  leader: <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" />,
  clash: <path d="m4 4 11 11M20 4 9 15M13 17l4-4M11 17l-4-4" />,
};

export function EventIcon({ kind, ...props }: IconProps & { kind: ChronicleKind }) {
  return <Svg {...props}>{EVENT_PATHS[kind]}</Svg>;
}

const DOCTRINE_PATHS: ReactNode[] = [
  // Balanced: scales
  <path d="M12 3v18M6 21h12M5 7h14M5 7l-2.5 6a2.8 2.8 0 0 0 5 0zM19 7l-2.5 6a2.8 2.8 0 0 0 5 0z" />,
  // Assault: arrowhead charge
  <path d="M4 12h12M11 6l6 6-6 6M19 5v14" />,
  // Hold: shield
  <path d="M12 3 19 6v6c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z" />,
  // Siege: tower
  <path d="M6 21V8h12v13M6 8V4h2v2h3V4h2v2h3V4h2v4M10 21v-4a2 2 0 0 1 4 0v4" />,
  // Skirmish: wind
  <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8" />,
];

export function DoctrineIcon({ doctrine, ...props }: IconProps & { doctrine: number }) {
  return <Svg {...props}>{DOCTRINE_PATHS[doctrine] ?? DOCTRINE_PATHS[0]}</Svg>;
}

export function Icon({ name, ...props }: IconProps & { name: 'crown' | 'eye' | 'lock' | 'share' | 'gear' | 'history' | 'help' | 'chat' | 'close' | 'play' | 'pause' | 'github' | 'clock' | 'users' | 'download' | 'chevron' | 'copy' | 'sword' | 'target' | 'bolt' | 'skull' | 'flag' }) {
  switch (name) {
    case 'crown':
      return <Svg {...props}><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" fillOpacity={0.3} /></Svg>;
    case 'eye':
      return <Svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
    case 'lock':
      return <Svg {...props}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
    case 'share':
      return <Svg {...props}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" /></Svg>;
    case 'gear':
      return <Svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
    case 'history':
      return <Svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" /></Svg>;
    case 'help':
      return <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></Svg>;
    case 'chat':
      return <Svg {...props}><path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>;
    case 'close':
      return <Svg {...props}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
    case 'play':
      return <Svg {...props}><path d="M7 4v16l13-8z" fill="currentColor" /></Svg>;
    case 'pause':
      return <Svg {...props}><path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" /></Svg>;
    case 'github':
      return (
        <Svg {...props} stroke="none">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
          />
        </Svg>
      );
    case 'clock':
      return <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
    case 'users':
      return <Svg {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Svg>;
    case 'download':
      return <Svg {...props}><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" /></Svg>;
    case 'chevron':
      return <Svg {...props}><path d="m9 6 6 6-6 6" /></Svg>;
    case 'copy':
      return <Svg {...props}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></Svg>;
    case 'sword':
      return <Svg {...props}><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /></Svg>;
    case 'target':
      return <Svg {...props}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></Svg>;
    case 'bolt':
      return <Svg {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" fillOpacity={0.3} /></Svg>;
    case 'skull':
      return <Svg {...props}><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3zM9.5 11h.01M14.5 11h.01" /></Svg>;
    case 'flag':
      return <Svg {...props}><path d="M6 21V3m0 1h11l-2.5 4L17 12H6" /></Svg>;
  }
}
