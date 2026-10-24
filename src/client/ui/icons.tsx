/**
 * One woodcut icon set for the whole codex (docs/art-direction.md §4): ink linework on a
 * transparent ground, a 2px stroke at 24px, and hatched shading on the side away from the
 * candle (light from the upper left).
 */
import type { ReactNode, SVGProps } from 'react';
import type { ChronicleKind } from '../../sim/chronicle.ts';
import { STATS } from '../../sim/stats.ts';
import { unitIconSvg } from '../render/art/svg.ts';

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
      strokeWidth={2}
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

/** Engraver's hatching: thin parallel strokes for the shaded side of a shape. */
function H({ d }: { d: string }) {
  return <path d={d} strokeWidth={1} opacity={0.85} />;
}

/** A solid ink mass (eye sockets, keyholes, gems). */
function Ink({ d }: { d: string }) {
  return <path d={d} fill="currentColor" stroke="none" />;
}

/** A unit's silhouette, the same art as its battlefield sprite. Decorative when `title` is empty. */
export function UnitIcon({ kind, size = 18, title, className }: { kind: number; size?: number; title?: string; className?: string }) {
  const name = title ?? STATS[kind]?.name ?? '';
  return (
    <span
      className={`icon unit-icon${className ? ` ${className}` : ''}`}
      style={{ fontSize: size, width: size, height: size }}
      role={name ? 'img' : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      title={name || undefined}
      // Static SVG markup from the art module; no user input reaches it.
      dangerouslySetInnerHTML={{ __html: unitIconSvg(kind) }}
    />
  );
}

const BANNER = 'M5.5 21.5V2.5M5.5 3.5h12.5l-2.8 4.2 2.8 4.3H5.5';
const SWORD = 'M4 3.5 15 14.5M3.5 3.5h3l9.8 9.8M12.7 17.3l4.6-4.6M15.6 16.1l3.6 3.6M18.3 21.2l2.9-2.9';
const SKULL = 'M12 3c-4.3 0-7.2 3-7.2 6.9 0 2.4 1 4.2 2.7 5.4V19h9v-3.7c1.7-1.2 2.7-3 2.7-5.4C19.2 6 16.3 3 12 3Z';
const CROWN = 'M4 18 2.8 7.5l5 4L12 4l4.2 7.5 5-4L20 18Z';

const EVENT_PATHS: Record<ChronicleKind | 'order', ReactNode> = {
  // A banner raised on its staff.
  join: (
    <>
      <path d={BANNER} />
      <H d="M8 9.5h7.5M8 7h8" />
      <path d="M3 21.5h5" />
    </>
  ),
  // A gate thrown open, soldiers marching out.
  muster: (
    <>
      <path d="M3 21V9.5L12 4l9 5.5V21" />
      <path d="M8 21v-6a4 4 0 0 1 8 0v6" />
      <H d="M9.5 21v-5M12 21v-6.5M14.5 21v-5" />
      <path d="M2 21h20" />
    </>
  ),
  // A broken blade: soldiers leaving because their work was undone.
  desert: (
    <>
      <path d="M4 20 9.5 14.5M3.5 15.5l5 5M11.5 12.5l1.8-1.8" />
      <path d="m15.2 9 5.3-5.3v2.6L17 9.8" />
      <H d="m13.5 10.8 1.3-1.3" />
    </>
  ),
  // A white flag carried in flight.
  rout: (
    <>
      <path d="M7 22 9 2.5" />
      <path d="M8.9 3.5c3 1.6 5.4-1 9.6.6l-1.4 7.4c-4-1.5-6.4 1-9 0" />
      <H d="M10.5 7.5c2 .6 3.8-.6 6-.2M10.3 9.5c2 .6 3.7-.6 6-.2" />
    </>
  ),
  wiped: (
    <>
      <path d={SKULL} />
      <Ink d="M8.3 10.3a1.7 1.9 0 1 0 3.4 0 1.7 1.9 0 1 0-3.4 0ZM12.3 10.3a1.7 1.9 0 1 0 3.4 0 1.7 1.9 0 1 0-3.4 0Z" />
      <path d="M10 19v2.5M14 19v2.5M12 13.5l-.8 1.8h1.6Z" strokeWidth={1.4} />
      <H d="M16.5 12.5v3M15 14v3" />
    </>
  ),
  // A champion's helm with its crest.
  champion: (
    <>
      <path d="M5.5 20.5V12a6.5 6.5 0 0 1 13 0v8.5Z" />
      <path d="M12 5.5V2.5M9 3.2c1-.9 5-.9 6 0" />
      <path d="M8 13.5h8M12 13.5V19" />
      <H d="M15.5 15v4.5M17 14v5.5" />
    </>
  ),
  // A banner planted on a captured hill.
  capture: (
    <>
      <path d={BANNER} />
      <path d="M2.5 21.5c3-3.2 7-4 10-2.2 2.3 1.3 5.4 1.4 9 .2" />
      <H d="M8 9.5h7.5" />
    </>
  ),
  // A keep stormed: the conqueror's banner planted on its battlements, the old one falling torn.
  conquest: (
    <>
      <path d="M3.5 21.5V12h2.6v2h2.3v-2h2.6v2h2.3v-2h2.6v9.5Z" />
      <path d="M8.5 21.5v-3.2a1.9 1.9 0 0 1 3.8 0v3.2" />
      <path d="M10.4 12V2.5h7.5l-1.7 2.4 1.7 2.5h-7.5" />
      <path d="M19.5 12.5c.8.9.6 2.2 1.6 3.1M18.2 14.4l2.2 3.4" strokeWidth={1.4} />
      <H d="M14.5 14.8v6.2M16 14v7.5M12 3.8h3.6" />
    </>
  ),
  // A rising: a banner climbing out of curling smoke.
  rising: (
    <>
      <path d="M11 21.5V3.5" />
      <path d="M11 4h8.5l-2.2 2.8 2.2 2.9H11" />
      <path d="M4 21c-1.6-1.4-.6-3.6 1.4-3.3-.1-2 2.6-2.6 3.4-.8M18 21c1.6-1.4.6-3.6-1.4-3.3.1-2-2.6-2.6-3.4-.8" />
      <path d="M2.5 21.5h19" />
      <H d="M13 6h4M5.5 19.5l1.5-1M16.5 19.5l1.5-1" />
    </>
  ),
  // The ring won: a crown over the ring of capitals.
  victory: (
    <>
      <path d="M6.5 9 5.8 3.6l3 2.4L12 1.8 15.2 6l3-2.4L17.5 9Z" />
      <circle cx="12" cy="15.5" r="6" />
      <path d="M12 8.6v1.4M12 21v1.4M5.1 15.5h1.4M17.5 15.5h1.4" strokeWidth={2.6} />
      <H d="M14 13.5c.8.6 1.3 1.5 1.3 2.6M9.8 7.8h4.4" />
    </>
  ),
  leader: (
    <>
      <path d={CROWN} />
      <path d="M4 18h16v3H4Z" />
      <Ink d="M11 11.5a1 1 0 1 0 2 0 1 1 0 1 0-2 0Z" />
      <H d="M16 19.5h3M15 14.5l1.5-.5" />
    </>
  ),
  dragon: (
    <>
      <path d="M2.5 15.5c2.5-5 6.5-8.5 11.5-8.5l2.2-3 1 3.4c2.4.8 3.8 2.8 4 5l-4-.8-2.1 3 3 3c-2.3 2-5.3 2.8-8.3 1.8l-1 3.6-2-3.8c-2 0-3.3-1.4-4.3-3.7Z" />
      <path d="M8.5 12.5c2-1 4-1.2 6-.6" strokeWidth={1.4} />
      <Ink d="M16.6 9.4a.8.8 0 1 0 1.6 0 .8.8 0 1 0-1.6 0Z" />
      <H d="M9 16.5l1-2M11 17l1-2.2M13 17.2l.9-2" />
    </>
  ),
  // Crossed swords.
  clash: (
    <>
      <path d="M4 4l11.5 11.5M20 4 8.5 15.5" />
      <path d="M13 18l5-5M11 18l-5-5M17 19.5l2.5 2.5M7 19.5 4.5 22" />
      <H d="M6.5 4.5l9.5 9.5" />
    </>
  ),
  // A fulfilled Order: a wax seal with ribbon tails.
  order: (
    <>
      <path d="M9 14.5 6.5 22l3-1.6 1.8 2.6 1-7M15 14.5l2.5 7.5-3-1.6-1.8 2.6-1-7" />
      <circle cx="12" cy="9.5" r="6.5" />
      <path d="M9.5 9.5l1.8 1.8 3.3-3.6" />
      <H d="M16 12l1.2.8M15 13.5l.9 1" />
    </>
  ),
};

export function EventIcon({ kind, ...props }: IconProps & { kind: ChronicleKind | 'order' }) {
  return <Svg {...props}>{EVENT_PATHS[kind] ?? <circle cx="12" cy="12" r="5" />}</Svg>;
}

export type IconName =
  | 'crown'
  | 'eye'
  | 'lock'
  | 'share'
  | 'gear'
  | 'history'
  | 'help'
  | 'chat'
  | 'close'
  | 'play'
  | 'pause'
  | 'github'
  | 'clock'
  | 'users'
  | 'download'
  | 'chevron'
  | 'copy'
  | 'sword'
  | 'target'
  | 'bolt'
  | 'skull'
  | 'flag'
  | 'horn'
  | 'horn-off'
  | 'quill'
  | 'book'
  | 'map'
  | 'shield'
  | 'compass'
  | 'plus'
  | 'follow'
  | 'scroll'
  | 'seal'
  | 'up'
  | 'down'
  | 'keep';

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  switch (name) {
    case 'keep':
      // A small keep: a capital held.
      return (
        <Svg {...props}>
          <path d="M3.5 21.5V9h3v2.5h3V9h5v2.5h3V9h3v12.5Z" />
          <path d="M9.5 21.5v-4a2.5 2.5 0 0 1 5 0v4" />
          <path d="M12 9V2.5h5l-1.4 1.7L17 6h-5" />
          <H d="M16.5 13v7M18 12.5v8" />
        </Svg>
      );
    case 'crown':
      return (
        <Svg {...props}>
          <path d={CROWN} />
          <path d="M4 18h16v3H4Z" />
          <Ink d="M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0ZM2 7.5a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0ZM20.2 7.5a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0Z" />
          <H d="M16 19.5h3M15.4 15.5l2.6-1.8M16.5 17l2.3-1.6" />
        </Svg>
      );
    case 'eye':
      return (
        <Svg {...props}>
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3.2" />
          <Ink d="M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0Z" />
          <H d="M15.5 16l1-1.3M17.5 15l.8-1.2" />
        </Svg>
      );
    case 'lock':
      return (
        <Svg {...props}>
          <path d="M4.5 11h15v10.5h-15Z" />
          <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
          <Ink d="M10.6 15a1.4 1.4 0 1 1 2 1.3l.5 2.7h-2.2l.5-2.7a1.4 1.4 0 0 1-.8-1.3Z" />
          <H d="M15.5 13v6.5M17.5 13v6.5" />
        </Svg>
      );
    case 'share':
      // A herald's scroll sent forth.
      return (
        <Svg {...props}>
          <path d="M4 12.5v8h16v-8" />
          <path d="M12 15V2.5M7.5 7 12 2.5 16.5 7" />
          <H d="M15.5 17.5h3M14 19h4.5" />
        </Svg>
      );
    case 'gear':
      return (
        <Svg {...props}>
          <path d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.5.4v3.4l-2.5.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.5h-3.4l-.5-2.5-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.5-.5v-3.4l2.5-.4.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8Z" />
          <circle cx="12" cy="12" r="3.2" />
          <H d="M14.5 15.8l1.6 1.6M16 14.4l1.6 1.4" />
        </Svg>
      );
    case 'history':
    case 'clock':
      // An hourglass: the war's day running out.
      return (
        <Svg {...props}>
          <path d="M5 2.5h14M5 21.5h14" />
          <path d="M6.5 2.5c0 5 5.5 6.5 5.5 9.5s-5.5 4.5-5.5 9.5M17.5 2.5c0 5-5.5 6.5-5.5 9.5s5.5 4.5 5.5 9.5" />
          <Ink d="M8.6 21c.6-2.6 2.2-3.6 3.4-4.4 1.2.8 2.8 1.8 3.4 4.4ZM9.6 6.8h4.8c-.7 1-1.6 1.7-2.4 2.3-.8-.6-1.7-1.3-2.4-2.3Z" />
        </Svg>
      );
    case 'help':
    case 'book':
      // The Articles of War: a bound book with a ribbon.
      return (
        <Svg {...props}>
          <path d="M4 4.5c3-1.4 5.6-1.4 8 .6 2.4-2 5-2 8-.6v15c-3-1.4-5.6-1.4-8 .6-2.4-2-5-2-8-.6Z" />
          <path d="M12 5.1v15" />
          <path d="M16 4v8l1.5-1.4L19 12V4.2" strokeWidth={1.5} />
          <H d="M6 8h4M6 10.5h4M6 13h4M14 14.5h4M14 17h4" />
        </Svg>
      );
    case 'chat':
      // A speech banderole.
      return (
        <Svg {...props}>
          <path d="M3.5 5.5h17v10H11l-5 4.5v-4.5H3.5Z" />
          <H d="M7 9h10M7 12h7" />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...props}>
          <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.2} />
        </Svg>
      );
    case 'play':
      return (
        <Svg {...props}>
          <path d="M6.5 3.5v17l14-8.5Z" />
          <H d="M9 9.5v5M11 10.5v3.2M13 11.2v1.6" />
        </Svg>
      );
    case 'pause':
      return (
        <Svg {...props}>
          <path d="M6 3.5h4v17H6ZM14 3.5h4v17h-4Z" />
          <H d="M8 6v12M16 6v12" />
        </Svg>
      );
    case 'github':
      return (
        <Svg {...props} stroke="none">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
          />
        </Svg>
      );
    case 'users':
      return (
        <Svg {...props}>
          <circle cx="9" cy="7.5" r="3.5" />
          <path d="M2.5 20.5c0-4 2.8-6.5 6.5-6.5s6.5 2.5 6.5 6.5Z" />
          <path d="M15.5 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2 .9 3.5 3 3.5 6.2" />
          <H d="M11 16.5l2 2M12.5 15.5l1.7 2" />
        </Svg>
      );
    case 'download':
      return (
        <Svg {...props}>
          <path d="M12 2.5v12.5M7.5 10.5 12 15l4.5-4.5" />
          <path d="M3.5 15v5.5h17V15" />
          <H d="M15 18h3.5" />
        </Svg>
      );
    case 'chevron':
      return (
        <Svg {...props}>
          <path d="m9 5.5 6.5 6.5L9 18.5" strokeWidth={2.2} />
        </Svg>
      );
    case 'copy':
      return (
        <Svg {...props}>
          <path d="M8.5 8.5h12v13h-12Z" />
          <path d="M15.5 8.5V3.5h-12v13h5" />
          <H d="M11 12h7M11 14.5h7M11 17h5" />
        </Svg>
      );
    case 'sword':
      return (
        <Svg {...props}>
          <path d={SWORD} />
          <H d="M6.5 5.2l7.5 7.5" />
        </Svg>
      );
    case 'target':
      return (
        <Svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
          <H d="M16.5 15.5l1 1" />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg {...props}>
          <path d="M13.5 2 4 14h7l-1.5 8L20 9.5h-7Z" />
          <H d="M12.5 15.5l2.5-3M11.8 18.3l2.6-3.2" />
        </Svg>
      );
    case 'skull':
      return (
        <Svg {...props}>
          <path d={SKULL} />
          <Ink d="M8.3 10.3a1.7 1.9 0 1 0 3.4 0 1.7 1.9 0 1 0-3.4 0ZM12.3 10.3a1.7 1.9 0 1 0 3.4 0 1.7 1.9 0 1 0-3.4 0Z" />
          <path d="M10 19v2.5M14 19v2.5" />
        </Svg>
      );
    case 'flag':
      return (
        <Svg {...props}>
          <path d={BANNER} />
          <H d="M8 9.5h7.5M8 7h8" />
        </Svg>
      );
    case 'horn':
      return (
        <Svg {...props}>
          <path d="M3 9.5c4.5 0 9-2 12.5-6v15c-3.5-4-8-6-12.5-6Z" />
          <path d="M18.5 8a5 5 0 0 1 0 6M20.5 6a8 8 0 0 1 0 10" />
          <H d="M12 6.5v8.6M13.6 5.2v11.6" />
        </Svg>
      );
    case 'horn-off':
      return (
        <Svg {...props}>
          <path d="M3 9.5c4.5 0 9-2 12.5-6v15c-3.5-4-8-6-12.5-6Z" />
          <path d="M18 9l4 4M22 9l-4 4" />
          <H d="M12 6.5v8.6" />
        </Svg>
      );
    case 'quill':
      return (
        <Svg {...props}>
          <path d="M4 20.5C7 13 12 5.5 21 3c-1 7-6.5 13-14 15" />
          <path d="M4 20.5 12 12" />
          <H d="M11 10l1.6 2.3M13.5 8l1.8 2.3M16 6l1.8 2.2" />
        </Svg>
      );
    case 'map':
      return (
        <Svg {...props}>
          <path d="M2.5 5.5 8.5 3l7 2.5 6-2.5v15.5l-6 2.5-7-2.5-6 2.5Z" />
          <path d="M8.5 3v15.5M15.5 5.5V21" />
          <H d="M17.5 8v10M19.5 7.3v10" />
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...props}>
          <path d="M12 2.5 19.5 5v6.5c0 4.6-3.2 8.2-7.5 10-4.3-1.8-7.5-5.4-7.5-10V5Z" />
          <H d="M14 7.5h3.5M14 10h4M14 12.5h3.8M14 15h3" />
        </Svg>
      );
    case 'compass':
      return (
        <Svg {...props}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 3.5 14 12l-2 8.5-2-8.5ZM3.5 12 12 10l8.5 2-8.5 2Z" />
          <Ink d="M12 3.5 14 12h-4Z" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...props}>
          <path d="M12 4v16M4 12h16" strokeWidth={2.2} />
        </Svg>
      );
    case 'follow':
      // An eye over a banner: the camera follows your colours.
      return (
        <Svg {...props}>
          <path d="M5.5 21.5V9.5M5.5 10.5h10l-2 3 2 3h-10" />
          <path d="M3 5.5S6 1.5 12 1.5s9 4 9 4-3 4-9 4-9-4-9-4Z" strokeWidth={1.6} />
          <Ink d="M10.6 5.5a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0Z" />
        </Svg>
      );
    case 'scroll':
      return (
        <Svg {...props}>
          <path d="M6 4.5h12.5a2 2 0 0 1 0 4H17v10a3 3 0 0 1-3 3H5.5a2 2 0 0 1 0-4H7v-10A3 3 0 0 0 6 4.5Zm0 0a3 3 0 0 0-3 3" />
          <H d="M10 9.5h4.5M10 12h4.5M10 14.5h3" />
        </Svg>
      );
    case 'seal':
      return (
        <Svg {...props}>
          <circle cx="12" cy="10" r="7" />
          <path d="M9 16 7 22l2.5-1.3L11 23l1-6.5M15 16l2 6-2.5-1.3L13 23" />
          <path d="M12 6.5 13 9h2.6l-2.1 1.6.8 2.6-2.3-1.6-2.3 1.6.8-2.6L8.4 9H11Z" strokeWidth={1.3} />
        </Svg>
      );
    case 'up':
      return (
        <Svg {...props} stroke="none">
          <path d="M12 5 20 18H4Z" fill="currentColor" />
        </Svg>
      );
    case 'down':
      return (
        <Svg {...props} stroke="none">
          <path d="M12 19 4 6h16Z" fill="currentColor" />
        </Svg>
      );
  }
}
