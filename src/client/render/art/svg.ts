// Small monochrome glyphs (24×24, currentColor) with the same silhouettes as the
// battlefield sprites, for the HUD: legends, platoon composition, chronicle chips.

const ICONS: readonly string[] = [
  // Footman: round shield and spear
  '<path d="M4 21 19 3l1.5 1.2L6 22z"/><path d="M18.5 2 22 1.5l-.8 3.6z"/><circle cx="9" cy="14" r="5.5"/><circle cx="9" cy="14" r="1.8" fill-opacity=".35"/>',
  // Knight: horse and lance
  '<path d="M3 17c0-3 2.5-5 6-5h6l3-4 3 1-2 3v4l-1 6h-2l.5-4H10l-1 4H7l.5-4C5 18 3 18.5 3 17z"/><path d="M8 11 23 4v1.4L9 12.6z"/><circle cx="11" cy="7" r="2.4"/>',
  // Warden: tower shield
  '<rect x="10" y="2" width="11" height="20" rx="2"/><circle cx="7" cy="6" r="3"/><path d="M4 10h6v9H4z"/><path d="M14.5 4h2v16h-2zM11.5 10.5h8v2h-8z" fill-opacity=".35"/>',
  // Paladin: hammer and halo
  '<ellipse cx="9" cy="3" rx="4" ry="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="7" r="3"/><path d="M5 11h8v8H5z"/><path d="M13 13 19 6l1.2 1-6 7z"/><rect x="16" y="1.5" width="7" height="5" rx="1" transform="rotate(30 19.5 4)"/>',
  // Archer: longbow
  '<path d="M14 2c5 4 5 16 0 20l-1-1c4-4 4-14 0-18z"/><path d="M14 3v18" stroke="currentColor" stroke-width=".8"/><circle cx="8" cy="6" r="3"/><path d="M5 10h6v8H5zM11 12h8v1.4h-8z"/>',
  // Ranger: tall bow and cloak
  '<path d="M15 1c6 5 6 17 0 22l-1-1c5-5 5-15 0-20z"/><path d="M15 2v20" stroke="currentColor" stroke-width=".8"/><path d="M4 9l4-5 4 5-1 13H3z"/><path d="M11 11h9v1.4h-9z"/>',
  // Herald: banner on a pole
  '<path d="M12 1h1.6v22H12z"/><path d="M13.6 2H23l-3 4 3 4h-9.4z"/><circle cx="7" cy="8" r="3"/><path d="M4 12h6v10H4z"/>',
  // Wizard: pointed hat and staff
  '<path d="M3 11 9 1l4 10z"/><circle cx="8" cy="13" r="2.6"/><path d="M4 16h8l2 7H2z"/><path d="M16 8h1.6v15H16z"/><circle cx="16.8" cy="5.5" r="2.6"/>',
  // Sapper: pickaxe and keg
  '<path d="M6 21 18 6l1.3 1L7.4 22z"/><path d="M12 5c3-3 8-3 11 0-3-1-8-1-11 2z"/><rect x="2" y="14" width="7" height="8" rx="2"/><circle cx="12" cy="10" r="2.6" fill-opacity="0"/>',
  // Trebuchet: frame and arm
  '<path d="M3 21h18v1.6H3z"/><path d="M8 21 12 9l4 12h-2l-2-7-2 7z"/><path d="M12 9 21 2l1 1.2-9 7z"/><rect x="5" y="7" width="5" height="5" rx="1"/><circle cx="5" cy="21.5" r="2"/><circle cx="19" cy="21.5" r="2"/>',
  // Outrider: light horse and sabre
  '<path d="M2 18c0-3 2-5 5-5h7l3-4 3 1-2 3v3l-1 6h-2l.5-4H9l-1 4H6l.5-4C4 19 2 19.5 2 18z"/><circle cx="10" cy="7" r="2.4"/><path d="M12 9c3-1 6-3 8-7l.8.6c-1.6 4-5 7-8.6 7.6z"/>',
  // Griffin rider: spread wings
  '<path d="M12 12 1 4c2 6 5 9 9 10zM12 12l11-8c-2 6-5 9-9 10z"/><path d="M8 13h9c1.5 0 2.5 1 2.5 2.5L17 20H9l-2-3z"/><circle cx="19" cy="11" r="2.4"/><path d="M21 10.5h2.5L21 12z"/>',
  // Skeleton: skull and ribs
  '<circle cx="12" cy="6" r="4.5"/><circle cx="10.4" cy="5.6" r="1.1" fill-opacity=".1"/><circle cx="13.6" cy="5.6" r="1.1" fill-opacity=".1"/><path d="M11.2 10.5h1.6V20h-1.6zM7 12.5h10v1.2H7zM7.5 15h9v1.2h-9zM8 17.5h8v1.2H8zM9 20h2v3H9zM13 20h2v3h-2z"/>',
  // Bone golem: hulking body with glowing eyes
  '<path d="M3 23V12c0-6 4-9 9-9s9 3 9 9v11h-4l-1-6h-8l-1 6z"/><circle cx="9.5" cy="9" r="1.4" fill-opacity=".15"/><circle cx="14.5" cy="9" r="1.4" fill-opacity=".15"/>',
  // Mercenary: plumed helm and twin blades
  '<circle cx="12" cy="8" r="3.4"/><path d="M12 4.6C11 1 7 1 6 3c3-.5 4.5 1 5 2z"/><path d="M8 12h8v9H8z"/><path d="M3 4 9 13l-1 .8L2 5zM21 4l-6 9 1 .8 6-8.8z"/>',
  // Troll: huge hunched brute with club
  '<path d="M2 23v-9c0-6 4-9 9-9 3 0 5 1 6 3l-2 2c2 2 2 5 2 8v5h-4l-1-5H8l-1 5z"/><path d="M16 12 21 2l2 .8-4 10.5z"/><path d="M15.2 9.5l1.2-2.4.6 2.8z" fill-opacity=".2"/>',
  // Berserker: horned helm and two axes
  '<circle cx="12" cy="9" r="3.4"/><path d="M8.8 7.5C7 6 6.5 3.5 7 2c.8 2 2 3 3 3.5zM15.2 7.5C17 6 17.5 3.5 17 2c-.8 2-2 3-3 3.5z"/><path d="M8.5 13h7v8h-7z"/><path d="M3 21 8 12l1 .6-5 9z"/><path d="M1 13c1-2 4-3 6-1l-2 3c-1-1-3-1-4-2zM21 21l-5-9-1 .6 5 9z"/><path d="M23 13c-1-2-4-3-6-1l2 3c1-1 3-1 4-2z"/>',
  // Cleric: robe and censer of light
  '<circle cx="9" cy="5.5" r="3"/><path d="M5.5 10h7l2 13h-11z"/><path d="M14 10.5l2.5 5" stroke="currentColor" stroke-width="1"/><circle cx="17" cy="17.5" r="2.6"/><path d="M17 12v-1.5M20.5 17.5H22M17 23v-.5M13.5 17.5H12" stroke="currentColor" stroke-width="1"/>',
  // Champion: crown, cape and greatsword
  '<path d="M6 4V1l2 1.6L10 0l2 2.6L14 1v3z"/><circle cx="10" cy="7" r="2.8"/><path d="M6 10h8v9H6zM6 10l-4 12h5z"/><path d="M14 13 22 1l1 .8-7.6 12.4z"/><path d="M12.6 12.5l3.6 2.2-.7 1-3.6-2.2z"/>',
  // Dragon: wings, long neck, horned head
  '<path d="M10 13 1 3c1 6 3 9 7 11zM13 12 15 1c2 5 2 9-.5 12z"/><path d="M5 18c0-3 3-5 7-5 2 0 4-1 5-3l2-4 4 1-1 2h-2l-1 3c-1 3-3 5-6 6H9l-2 4-3-1 1-3z"/><path d="M17.5 4.5 16 2l2.3 1.6z"/><path d="M1 21c2-1 3-2 4-3l1 1c-1 2-3 3-5 3z"/>',
];

/** Inline SVG markup for a unit kind, sized by CSS (defaults to 1em). */
export function unitIconSvg(kind: number, title?: string): string {
  const body = ICONS[kind] ?? ICONS[0]!;
  const label = title ? `<title>${title.replace(/[<&"]/g, '')}</title>` : '';
  return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="${title ? 'false' : 'true'}" role="img">${label}${body}</svg>`;
}
