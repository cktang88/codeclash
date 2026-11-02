// How a faction builds: stone, timber, roofs and banners. Picked by faction id, falling back to
// the Templar commandery, so a new faction only needs a palette here to get a city that is its
// own (and a whole new set of building shapes can be switched on `style.id` later).

import { FACTIONS, type FactionId } from '../../../game/factions.ts';
import { hex, hslCol, mix, tone, type Col } from './pixels.ts';

/** A ramp from light to dark: [highlight, lit, shade, deep]. */
export type Ramp = [Col, Col, Col, Col];

export interface CityStyle {
  id: string;
  stone: Ramp;
  fine: Ramp;
  mortar: Col;
  timber: Ramp;
  daub: Ramp;
  thatch: Ramp;
  shingle: Ramp;
  tile: Ramp;
  slate: Ramp;
  gold: Col;
  glass: Col;
  lit: Col;
  /** Banners: the field, the charge (the cross) and the army's own hue for the trim. */
  bannerField: Col;
  bannerCharge: Col;
  team: Col;
  teamShade: Col;
  /** Clothing for the commandery's people. */
  habit: Col;
  habitShade: Col;
  mantle: Col;
  outline: Col;
  skin: Col;
  /** The one saturated accent of the city (gilt, shrine vermilion, grave-light green). */
  accent: Col;
  /** Night windows and lanterns: warm, or the necropolis's green. Torches stay fire. */
  glow: string;
}

const ramp = (a: string, b: string, c: string, d: string): Ramp => [hex(a), hex(b), hex(c), hex(d)];

function templar(hue: number): CityStyle {
  const f = FACTIONS.templar.palette;
  return {
    id: 'templar',
    // Warm limestone, as at Tomar and Montsaunès, shading to cool grey.
    stone: ramp('#c9bea2', '#a89c80', '#7a7062', '#4e4741'),
    fine: ramp('#e3d8bb', '#c8bb98', '#968a72', '#5f574b'),
    mortar: hex('#5d554a'),
    timber: ramp('#8a6440', '#6b4a2c', '#4b3320', '#2c1e13'),
    daub: ramp('#d8c9a3', '#bba984', '#8f8064', '#5e5442'),
    thatch: ramp('#c4a35e', '#a3854a', '#7a6234', '#4f3f22'),
    shingle: ramp('#8c6a48', '#6f5238', '#523b28', '#33251a'),
    tile: ramp('#b5583a', '#934330', '#6c3024', '#431d17'),
    slate: ramp('#6f7884', '#565e6a', '#3f4550', '#272b33'),
    gold: hex('#d6a83c'),
    glass: hex('#17120e'),
    lit: hex('#ffc864'),
    bannerField: hex(f.cloth),
    bannerCharge: hex(f.trim),
    team: hslCol(hue, 55, 40),
    teamShade: hslCol(hue, 55, 26),
    habit: hex('#2a2420'),
    habitShade: hex('#1a1613'),
    mantle: hex(f.cloth),
    outline: hex('#140f0b'),
    skin: hex(f.skin),
    accent: hex('#d6a83c'),
    glow: 'rgba(255,170,70,0.55)',
  };
}

/**
 * HD: the Samurai castle town. Granite ishigaki, white shikkui plaster over black-stained boards,
 * grey kawara tiles, cypress-bark shrine roofs, ochre machiya plaster, and shrine vermilion as
 * the accent (Himeji, Matsumoto, Gion machiya, kura storehouses: docs/art-references/samurai-city.md).
 */
function samuraiHd(hue: number): CityStyle {
  const f = FACTIONS.samurai.palette;
  return {
    id: 'samurai',
    stone: ramp('#bdb4a0', '#968e7e', '#6c6865', '#46444b'),
    fine: ramp('#f3ecd9', '#ddd5c0', '#aaa6a6', '#706d79'),
    mortar: hex('#57524c'),
    timber: ramp('#6e4c34', '#4b3327', '#31221d', '#1e1517'),
    daub: ramp('#dcbc80', '#c09b62', '#8b6b49', '#5b4535'),
    thatch: ramp('#bea05e', '#977b4b', '#6b5639', '#433425'),
    shingle: ramp('#8f5d3e', '#6e4531', '#4f3125', '#33201b'),
    tile: ramp('#8e97a3', '#6c7482', '#4d5262', '#30333f'),
    slate: ramp('#7f8794', '#5d6371', '#424651', '#282a34'),
    gold: hex('#d9b24c'),
    glass: hex('#1b1519'),
    lit: hex('#ffd08a'),
    bannerField: hex('#e9e2cf'),
    bannerCharge: hex(f.cloth),
    team: hslCol(hue, 55, 40),
    teamShade: hslCol(hue, 55, 26),
    habit: hex('#3b3a46'),
    habitShade: hex('#25242e'),
    mantle: hex(f.cloth),
    outline: hex('#1b1418'),
    skin: hex(f.skin),
    accent: hex('#c8432b'),
    glow: 'rgba(255,176,90,0.55)',
  };
}

/**
 * HD: the necropolis. Black basalt, bone, rotten timber, verdigris lead and moss slate, under a
 * grave-light green that is its only saturated colour (Sedlec, Évora, Paris catacombs, Whitby,
 * West Kennet: docs/art-references/undead-city.md).
 */
function undeadHd(hue: number): CityStyle {
  const f = FACTIONS.undead.palette;
  return {
    id: 'undead',
    stone: ramp('#6a6570', '#4c4855', '#34313c', '#211e27'),
    fine: ramp('#e4d9bc', '#c4b490', '#8c7e66', '#574c42'),
    mortar: hex('#29252e'),
    timber: ramp('#62534a', '#463a33', '#2f2624', '#1b1518'),
    daub: ramp('#8d8370', '#6e6657', '#4f4940', '#332f2b'),
    thatch: ramp('#8c805c', '#6d6346', '#4d4532', '#312a20'),
    shingle: ramp('#5c665a', '#454e45', '#313730', '#1f231f'),
    tile: ramp('#6f7c6c', '#546151', '#3c473b', '#262d26'),
    slate: ramp('#5f5b6c', '#464354', '#312f3d', '#1e1d27'),
    gold: hex('#a89656'),
    glass: hex('#120f15'),
    lit: hex('#a4f58c'),
    bannerField: hex(f.cloth),
    bannerCharge: hex('#7fc46a'),
    team: hslCol(hue, 45, 36),
    teamShade: hslCol(hue, 45, 22),
    habit: hex('#2a2629'),
    habitShade: hex('#19161a'),
    mantle: hex(f.cloth),
    outline: hex('#140f14'),
    skin: hex('#b9b49a'),
    accent: hex('#86f070'),
    glow: 'rgba(120,255,110,0.5)',
  };
}

/** The building style for a faction (Templar until a faction brings its own). */
export function styleFor(faction: FactionId | string, hue: number, hd = false): CityStyle {
  if (hd && faction === 'samurai') return samuraiHd(hue);
  if (hd && faction === 'undead') return undeadHd(hue);
  const base = templar(hue);
  switch (faction) {
    case 'templar':
      return base;
    default: {
      // A faction without its own city yet: Templar shapes in the faction's colours.
      const pal = (FACTIONS as Record<string, (typeof FACTIONS)['templar'] | undefined>)[faction]?.palette;
      if (!pal) return base;
      const cloth = hex(pal.cloth);
      return {
        ...base,
        id: String(faction),
        bannerField: cloth,
        bannerCharge: hex(pal.trim),
        mantle: cloth,
        habit: tone(hex(pal.clothShade), 0.5),
        habitShade: tone(hex(pal.clothShade), 0.7),
        tile: [mix(base.tile[0], hex(pal.trim), 0.5), mix(base.tile[1], hex(pal.trim), 0.5), mix(base.tile[2], hex(pal.trim), 0.5), base.tile[3]],
        skin: hex(pal.skin),
      };
    }
  }
}
