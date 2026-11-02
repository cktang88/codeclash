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
  };
}

/** The building style for a faction (Templar until a faction brings its own). */
export function styleFor(faction: FactionId | string, hue: number): CityStyle {
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
