// Factions: names, look and small stat nudges over the shared unit classes. Every faction is
// meant to be about as strong as every other; one is a little better at archery, another at
// the charge. Only the Templars ship today; the type is ready for more.

import { STATS, U, UNIT_COUNT, type UnitStats } from './units.ts';

export type FactionId = 'templar';
export const FACTION_IDS: readonly FactionId[] = ['templar'];

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
};

/** The stats a faction's soldiers fight with. */
export function factionStats(id: FactionId): UnitStats[] {
  const f = FACTIONS[id];
  const out: UnitStats[] = [];
  for (let k = 0; k < UNIT_COUNT; k++) {
    const s: UnitStats = { ...STATS[k]! };
    const t = f.tweaks[k];
    if (t) for (const [key, m] of Object.entries(t)) (s as unknown as Record<string, number>)[key] = (s as unknown as Record<string, number>)[key]! * (m as number);
    out.push(s);
  }
  return out;
}

export function isFaction(x: unknown): x is FactionId {
  return typeof x === 'string' && (FACTION_IDS as readonly string[]).includes(x);
}
