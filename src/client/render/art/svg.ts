// Woodcut unit icons (24×24, currentColor) for the HUD: legends, platoon composition,
// chronicle chips. Same silhouettes as the battlefield sprites, drawn the way the
// codex draws every icon (docs/art-direction.md §4): a 2px ink line, engraver's
// hatching on the shaded (lower-right) side, and small solid ink masses.

export interface Glyph {
  /** Outline strokes, 2px. */
  s: string;
  /** Hatching, 1px. */
  h?: string;
  /** Solid ink masses. */
  i?: string;
}

const ICONS: readonly Glyph[] = [
  // Footman: kettle helm, heater shield, spear
  {
    s: 'M16 22 21.5 3M8 6.5a3.5 3.5 0 0 1 7 0M6 6.5h11M9.5 9.5h4M10 11h6v6h-6M11 17l-1 5M15 17l1 5M3 10h7v4.5c0 3-1.6 5-3.5 6.5C4.6 19.5 3 17.5 3 14.5z',
    h: 'M7.5 12.5 9 11M7 15l2-2M7.2 17.5 9 15.6M13 13l2-2M13.5 15.5l2-2',
    i: 'M21.5 2 23 5.4l-2.8-.8z',
  },
  // Knight: barded horse, lance with pennon, great helm
  {
    s: 'M3 15c0-2.5 2-4 5-4h8l2.5-3.5 3 1.2-1.5 3V15l-1.5 7M5 15l-1 7M9 17l-.5 5M14 17l.5 5M3 15c1.5 2 9 2.5 13 1M9 4h4v4.5H9zM10 9.5h3v2M11 5.5 23 2M17 4l3.5-1-1 2.6z',
    h: 'M6 14l2-2M9 14.5l2.5-2.5M12.5 14.5l2.5-2.5M11.5 6.5l1.2-1',
    i: 'M10 6h3v1h-3z',
  },
  // Warden: great helm behind a tower shield
  {
    s: 'M4 5h5v6H4zM4 11v7M6 18v4M3.5 22h4M10 2.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5L15 22l-6.5-2.5V4A1.5 1.5 0 0 1 10 2.5zM15 3v18M10 11h11',
    h: 'M17 6l3-3M17 9l3.5-3.5M17 14l3.5-3.5M17 17l3.5-3.5M17 20l3.5-3.5',
    i: 'M5.5 7.3h3.5v1.4H5.5zM15 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  },
  // Paladin: halo, great helm, warhammer, kite shield
  {
    s: 'M4.5 3c0-1 2-1.6 4.5-1.6S13.5 2 13.5 3 11.5 4.6 9 4.6 4.5 4 4.5 3zM6.5 6h5v5.5h-5zM6 13h7v5H6M8 18l-.5 4M11.5 18l.5 4M13 15 19 4.5M16.5 2.5l5 2.6-1.6 3-5-2.6zM2.5 12h5v4c0 2-1.2 3.2-2.5 4-1.3-.8-2.5-2-2.5-4z',
    h: 'M9.5 9l1.5-1.5M10 15.5l2.5-2.5M18.5 6.5l1.5-1M4.8 15.5l2-2M5 18l1.6-1.6',
    i: 'M8.5 8h3v1.2h-3z',
  },
  // Archer: hood, quiver, drawn bow
  {
    s: 'M6 8.5C6 5 8 3 10.5 3S14 5 13.5 7.5L11 7v4M7 11h6v6H7M8 17l-1 5M12 17l1 5M15.5 3c4 3 4 15 0 18M15.5 3 12 12l3.5 9M9 13h11M3 9l3 8M3.2 9l-.8-3M5 8.5l.2-3',
    h: 'M10.5 14.5l2-2M10.5 16.8 12.8 14.5M11 5.5l1.5-1.5',
    i: 'M20 11.6 23 13l-3 1.4z',
  },
  // Ranger: cowl, long cloak, tall bow
  {
    s: 'M6 7.5C6 4 8 2.5 10 2.5s3.5 2 3 4.5H10.5v3M5.5 10h7l.5 7-1 5H9l-.5-4-1 4H5M5.5 10 2 21h3M16 1c5 4.5 5 17.5 0 22M16 1l-3 11 3 11M10 12h11',
    h: 'M3.5 18l2-2M4 20.5 6 18.5M11 14l2-2M11 16.5l2-2',
    i: 'M21 10.8 23.5 12 21 13.2z',
  },
  // Herald: swallowtailed banner on a pole
  {
    s: 'M12.5 1.5v21M12.5 3H22l-2.5 4.5L22 12h-9.5M5 8a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0zM4.5 12h6v6h-6M5.5 18l-.5 4M9.5 18l.5 4M10.5 13.5l2-.5M3 14c-1 1.5-.5 3 1 3.5',
    h: 'M16 9.5l3-3M14 10.5l4-4M18.5 11l2-2M7.5 15.5l2.5-2.5',
    i: 'M15.5 5.5h2v3.5h-2z',
  },
  // Wizard: pointed hat, beard, robe, staff with an ember orb
  {
    s: 'M2.5 9.5h11M4.5 9.5 8.5 1.5l3.5 8M6.5 10.5c0 2.5 1 5 2.5 6M4.5 13 2 22.5h11l-1.8-9M16.5 9v14',
    h: 'M8.5 18.5l3-3M8 21.5l4-4M10.5 7.5l1-1.5',
    i: 'M16.5 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  },
  // Sapper: kettle helm, pick, powder keg with a lit fuse
  {
    s: 'M9 7.5a3.5 3.5 0 0 1 7 0M7.5 7.5h10M10 10.5h6V17h-6M11 17l-1 5M15 17l1 5M8 21 19 6M13.5 5c3-2.6 7-2.6 9.5.5-3-1.4-6.4-1.2-8.6 1M2 13.5h6v8.5H2zM2 16.5h6M2 19.5h6M5 13.5V11',
    h: 'M6 15l1.5-1.5M6 18l1.5-1.5M6 21l1.5-1.5M13 13l2.5-2.5',
    i: 'M5 8.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
  },
  // Trebuchet: wheeled frame, throwing arm, counterweight, pennant
  {
    s: 'M2 19h20M7.5 19l4.5-11 4.5 11M9.5 15h5M12 8 21.5 2.5M12 8 6 11.5M2 19V9.5l4 1.5-4 1.5M21.5 2.5l.5 4',
    h: 'M10 18l1.5-1.5M13 18l2-2M4.2 13l1.4-1',
    i: 'M3.5 11h5v5h-5zM6 19a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 19a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM22 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  },
  // Outrider: light horse, hooded rider, sabre
  {
    s: 'M2 16c0-2.5 2-4 5-4h8l2.5-3.5 3 1.2-1.5 3V16l-1.5 6M4 16l-1 6M8 18l-.5 4M13 18l.5 4M2 16c-1 0-1.5 2-.5 4M8 4.5C8 3 9 2 10.5 2s2.5 1 2.2 3H11v4.5M8.5 10h4M12 8c4 0 7.5-2.5 9-6',
    h: 'M5 15l2-2M8.5 15.5l2.5-2.5M12 15.5l2.5-2.5',
  },
  // Griffin rider: eagle head and beak, raised wings, lion tail
  {
    s: 'M11 12 2 3.5c.5 4 2.5 7 6 8.5M13 11l3-9.5c2 3.5 2.5 7 .5 10M6 15c0-2 1.5-3 4-3h7.5l1.5-3 3 .5.5 2-2.5.5-.5 3.5-2 4H9.5L7 22M6 15c-2 0-3.5 1-4 3M9.5 16v-4.5M8.5 7h3v3',
    h: 'M4.5 6l1.5 1.5M6.5 8.2 8 9.7M15.5 5l1.4 1M15 8l1.5 1M12 17.5l2.5-2.5',
    i: 'M21.8 10.6 24 11.4l-2 .9z',
  },
  // Skeleton: skull, ribs, falchion
  {
    s: 'M7 7a4 4 0 0 1 8 0c0 1.5-.6 2.4-1.5 3v1.5h-5V10C7.6 9.4 7 8.5 7 7zM11 11.5V18M7.5 13.5h7M8 15.5h6M8.5 17.5h5M9 18l-1 4.5M13 18l1 4.5M14.5 14 21 4.5M19.5 3.5l2.5 1',
    i: 'M8.8 6h2v2h-2zM12.2 6h2v2h-2z',
  },
  // Bone golem: hulking ribcage, skull head, club arm
  {
    s: 'M4 14c0-5 3.5-8.5 8-8.5S20 9 20 14v4H4zM14 5.5c0-2 1.5-3.5 3.5-3.5S21 3.5 21 5.5 19.5 9 17.5 9M7 18l-1 4.5h3l1-4.5M15 18l1 4.5h3l-1-4.5M7.5 11h9M7 14h10',
    h: 'M15 16l2.5-2.5M17 17l2-2M12.5 16.8 14.8 14.5',
    i: 'M16 4.5h1.6v1.6H16zM18.6 4.5h1.6v1.6h-1.6z',
  },
  // Mercenary: plumed beret, slashed doublet, two swords
  {
    s: 'M8.5 5h7.5c0 1.6-1.6 2-3.7 2S8.5 6.6 8.5 5zM10 5c-2-2.5-5-3-7-1.5 3 0 5 1 6 2.5M10 8v2.5M9 10.5h6.5v6.5H9M10 17l-1 5M14.5 17l1 5M15.5 12.5 22 4M8.5 12.5 2 4',
    h: 'M11 12v3.5M13 12v3.5',
    i: 'M15 11l2 1.6-1 .9-1.8-1.6zM9 11l-2 1.6 1 .9 1.8-1.6z',
  },
  // Troll: hunched brute, tusks, spiked club
  {
    s: 'M2 22v-7c0-5.5 3.5-9 8.5-9 2.5 0 4 1 5 2.5L17 10c.6 1.8.6 4 0 6v6h-4l-1-4H7l-1 4zM15.5 13 19.5 2.5M18 2l4.5 1.6-2.4 9',
    h: 'M4.5 13l2.5-2.5M5 16l3-3M13 19l2.5-2.5M19.5 8l1.5-1M19 11l1.5-1',
    i: 'M15.3 12.5l.8-2 1.2 2.4zM13.5 8.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  },
  // Berserker: horned helm, bare chest, twin axes
  {
    s: 'M9 7.5a3 3 0 0 1 6 0M9 7.5C7 6.5 6.5 4 7 2.5M15 7.5c2-1 2.5-3.5 2-5M9.5 8.5h5V11M9 11.5h6.5V17H9M10 17l-1 5M14.5 17l1 5M4 21l5-10.5M2 12c1.5-2 4.5-2.5 6-1l-2 3c-1-.8-2.6-1.2-4-2zM20 21l-5-10.5M22 12c-1.5-2-4.5-2.5-6-1l2 3c1-.8 2.6-1.2 4-2z',
    h: 'M10.5 13l2-2M12 15.5l2.5-2.5',
  },
  // Cleric: coif, robe with a stole, swinging censer
  {
    s: 'M5.5 7a3.5 3.5 0 0 1 7 0v3M5.5 7v3M5.5 10.5h7L14.5 22h-11zM9 10.5v11.5M12.5 12l3.5 5',
    h: 'M10.5 14.5l2.5-2.5M11 18l3-3M11 21l3.5-3.5',
    i: 'M16.5 16.5a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM8.3 13h1.4v4H8.3zM7.2 14.3h3.6v1.2H7.2z',
  },
  // Champion: crown, greatsword, flowing cape
  {
    s: 'M6.5 5.5 6 2l2 1.5L9.5 1 11 3.5 13 2l-.5 3.5zM7 6.5h5.5v3M6 10h7v7H6M7 17l-1 5M12 17l1 5M6 10 2 21.5h5M13 13 22 2M11.5 11.5l3.5 3',
    h: 'M3.5 19l2-2M4.5 16l1.5-1.5M10 14.5l2.5-2.5M10.5 16.8 12.5 14.8',
    i: 'M9 3.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z',
  },
  // Dragon: bat wings, long neck, horned head, spade tail
  {
    s: 'M9 12 1.5 2c.5 5 2.5 8.5 5.5 10.5M11 11.5 14 1.5c1.8 4 1.8 8-.5 10.5M4 17c0-2.5 3-4.5 7-4.5 2.5 0 4.5-1.2 5.5-3.5L18 5.5l4 1-1 2.5-2.3.2-1.2 3.3c-1.2 3-3.5 4.5-6.5 4.5H9.5L8 21.5M4 17l-2 4h3M12.5 17l1.5 4.5M18 5.5l-1.5-3',
    h: 'M3.5 4.5l2.5 2M5 7.5l2.5 2M7.5 15.5l2.5-2.5M10.5 15.8l2.5-2.5',
    i: 'M19.8 7a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z',
  },
];

/** The woodcut glyph of a unit kind in a 24x24 box: outline strokes (2px), hatching (1px), solid ink. */
export function unitGlyph(kind: number): Readonly<Glyph> {
  return ICONS[kind] ?? ICONS[0]!;
}

/** Inline SVG markup for a unit kind, sized by CSS (defaults to 1em). */
export function unitIconSvg(kind: number, title?: string): string {
  const g = ICONS[kind] ?? ICONS[0]!;
  const label = title ? `<title>${title.replace(/[<&"]/g, '')}</title>` : '';
  const hatch = g.h ? `<path d="${g.h}" stroke-width="1" opacity=".85"/>` : '';
  const ink = g.i ? `<path d="${g.i}" fill="currentColor" stroke="none"/>` : '';
  return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${title ? 'false' : 'true'}" role="img">${label}<path d="${g.s}"/>${hatch}${ink}</svg>`;
}
