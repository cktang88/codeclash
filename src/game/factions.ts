// Factions: names, look and small stat nudges over the shared unit classes. Every faction is
// meant to be about as strong as every other; one is a little better at archery, another at
// the charge. Full design and art briefs: docs/factions.md.

import { STATS, U, UNIT_COUNT, type UnitStats } from './units.ts';

export type FactionId = 'templar' | 'samurai' | 'undead';
export const FACTION_IDS: readonly FactionId[] = ['templar', 'samurai', 'undead'];

export interface FactionDef {
  id: FactionId;
  name: string;
  /** One line under the name. */
  motto: string;
  /** Names of the ten unit classes, in UnitClass order. */
  units: readonly string[];
  /** Short plural nouns for the chronicle ("the sergeants broke"). */
  short: readonly string[];
  /** Commander's title. */
  commander: string;
  /** Building names, keyed like BUILDINGS in city.ts. */
  buildings: Record<string, string>;
  /** Multipliers on base stats per class: only the fields named change. */
  tweaks: Partial<Record<number, Partial<Record<keyof UnitStats, number>>>>;
  /** Main palette for sprites: cloth, trim, metal, leather, skin. */
  palette: { cloth: string; clothShade: string; trim: string; metal: string; metalShade: string; leather: string; skin: string };
  /**
   * A proposed faction rule, in words, for the battle sim to implement later (docs/factions.md).
   * Not simulated yet: the tweaks alone keep the faction balanced today.
   */
  rule?: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  templar: {
    id: 'templar',
    name: 'Knights Templar',
    motto: 'Non nobis, Domine, non nobis, sed nomini tuo da gloriam',
    units: [
      'Sergeant-Brothers', 'Spear Levy', 'Javelin Men', 'Pilgrim Archers', 'Genoese Crossbows',
      'Turcopoles', 'Turcopole Archers', 'Knight-Brothers', 'Iron Brethren', 'Mangonel',
    ],
    short: ['sergeants', 'spearmen', 'javelin men', 'archers', 'crossbows', 'turcopoles', 'horse archers', 'knights', 'iron brethren', 'mangonels'],
    commander: 'Marshal of the Temple',
    buildings: {
      barracks: 'Sergeants’ Hall',
      range: 'Archery Butts',
      stables: 'Stables',
      workshop: 'Siege Workshop',
      granary: 'Granary & Fields',
      chapter: 'Chapter House',
      hospital: 'Hospital',
      walls: 'Walls & Pavises',
    },
    // The Order's knights are its pride: a harder charge; its foot archers are pilgrims, a touch weaker.
    tweaks: {
      [U.Knights]: { charge: 1.1, morale: 1.05 },
      [U.Archers]: { missileDamage: 0.95 },
    },
    palette: { cloth: '#d9d2bf', clothShade: '#9d9480', trim: '#9c1c1c', metal: '#9aa0a6', metalShade: '#5b6066', leather: '#5a3b24', skin: '#c8a07a' },
  },
  samurai: {
    id: 'samurai',
    name: 'The Samurai Clans',
    motto: 'Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain',
    units: [
      'Katana Samurai', 'Yari Ashigaru', 'Nage-yari Skirmishers', 'Yumi Ashigaru', 'Teppō Ashigaru',
      'Yari Cavalry', 'Yabusame Archers', 'Hatamoto Horse', 'Sōhei Warrior Monks', 'Ōzutsu Bombard',
    ],
    short: ['samurai', 'ashigaru spears', 'skirmishers', 'bowmen', 'teppō', 'yari riders', 'yabusame', 'hatamoto', 'warrior monks', 'bombards'],
    commander: 'Daimyō',
    buildings: {
      barracks: 'Dōjō',
      range: 'Kyūdōjō',
      stables: 'Umaya',
      workshop: 'Kaji Forge',
      granary: 'Rice Paddies',
      chapter: 'Clan Shrine',
      hospital: 'Physician’s House',
      walls: 'Palisade & Tate',
    },
    // Mounted archery is the clan's art; its samurai hold under pressure. The price: ashigaru
    // spears are peasant levies in a light okegawa cuirass. A matchlock loads slower than a
    // crossbow spans (20-30 s against 15-30 s: docs/art-references/missile-drill.md) and hits
    // harder: about as much shot in a minute, in fewer, heavier volleys.
    tweaks: {
      [U.HorseArchers]: { missileDamage: 1.1 },
      [U.Crossbowmen]: { reload: 1.34, missileDamage: 1.3 },
      [U.HeavyInfantry]: { morale: 1.05 },
      [U.Spearmen]: { armour: 0.95 },
    },
    palette: { cloth: '#2c3550', clothShade: '#1a2034', trim: '#b5372b', metal: '#7d7a73', metalShade: '#45423d', leather: '#4b2c1d', skin: '#d6b089' },
    rule: 'Teppō volley: the first volley of each Teppō regiment costs its target an extra 8 morale.',
  },
  undead: {
    id: 'undead',
    name: 'The Hollow Host',
    motto: 'What falls, rises. What rises, marches.',
    units: [
      'Grave Legionaries', 'Ghoul Spears', 'Bone-Throwers', 'Wraith Bows', 'Revenant Arbalests',
      'Black Riders', 'Barrow Horse Archers', 'Death Knights', 'Bone Colossus', 'Corpse Trebuchet',
    ],
    short: ['legionaries', 'ghoul spears', 'bone-throwers', 'wraith bows', 'revenants', 'black riders', 'barrow archers', 'death knights', 'colossi', 'corpse trebuchets'],
    commander: 'Lich-Marshal',
    buildings: {
      barracks: 'Ossuary',
      range: 'Bone Butts',
      stables: 'Carrion Stables',
      workshop: 'Bonewright’s Yard',
      granary: 'Grave Fields',
      chapter: 'Black Chapel',
      hospital: 'Charnel Pit',
      walls: 'Barrow Walls',
    },
    // The dead do not fear and the Colossus is a hill of bone; but sinew bowstrings are rotten,
    // so their archery is the weakest of the three.
    tweaks: {
      [U.HeavyInfantry]: { morale: 1.05 },
      [U.Shock]: { hp: 1.05 },
      [U.Archers]: { missileDamage: 0.9 },
    },
    palette: { cloth: '#2e2b2a', clothShade: '#1a1817', trim: '#5f8f4e', metal: '#6c6f68', metalShade: '#3a3c38', leather: '#3d3128', skin: '#d8d0b4' },
    rule: 'The dead do not rout: below 15 morale a regiment crumbles instead (1% hp/s); if the Lich-Marshal falls, the whole host crumbles at 2% hp/s.',
  },
};

/** The stats a faction's soldiers fight with. */
export function factionStats(id: FactionId): UnitStats[] {
  const f = FACTIONS[id];
  const out: UnitStats[] = [];
  for (let k = 0; k < UNIT_COUNT; k++) {
    const s: UnitStats = { ...STATS[k]! };
    const t = f.tweaks[k];
    if (t) {
      for (const [key, m] of Object.entries(t)) (s as unknown as Record<string, number>)[key] = (s as unknown as Record<string, number>)[key]! * (m as number);
      // Reloads count whole ticks.
      s.reload = Math.round(s.reload);
    }
    out.push(s);
  }
  return out;
}

export function isFaction(x: unknown): x is FactionId {
  return typeof x === 'string' && (FACTION_IDS as readonly string[]).includes(x);
}
