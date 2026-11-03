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
   * The faction's rule and battle doctrines, in words (docs/factions.md): all simulated
   * (battle.ts; DOCTRINE and UNDEAD in command.ts). Keep it saying exactly what the code does.
   */
  rule?: string;
}

/**
 * The undead's hit points, as a share of everyone else's: the price of never routing. Tuned so
 * that they win about as often against the Templars and the Samurai as before they were
 * fearless (`pnpm fairness --factions undead,templar`; see docs/factions.md).
 */
export const DEAD_HP = 0.66;
/** The Bone Colossus keeps a little more. */
export const COLOSSUS_HP = 0.8;

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
    // The Order's knights charge harder on the Marshal's signal (the T1 doctrine, in place of the
    // old charge x1.1) and hold their morale; its foot archers are pilgrims, a touch weaker.
    tweaks: {
      [U.Archers]: { missileDamage: 0.95 },
    },
    palette: { cloth: '#d9d2bf', clothShade: '#9d9480', trim: '#9c1c1c', metal: '#9aa0a6', metalShade: '#5b6066', leather: '#5a3b24', skin: '#c8a07a' },
    rule: 'Discipline. The Marshal’s charge: while the Marshal lives the Knight-Brothers wait for his signal (an enemy block locked with the line faltering, the general charge, or 20 s after the lines meet), then all ride at that one block, hitting 1.2× as hard, ride back to his banner after each charge and hardly chase. Re-form on the banner: a wavering block falls back behind the nearest banner, up to twice a battle, and a broken one may re-form once more after its rally at any friendly banner. Not while the Beauséant flies: Knight-Brothers and Iron Brethren never rout while the Marshal lives, and take his death 1.5× as hard.',
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
    },
    palette: { cloth: '#2c3550', clothShade: '#1a2034', trim: '#b5372b', metal: '#7d7a73', metalShade: '#45423d', leather: '#4b2c1d', skin: '#d6b089' },
    rule: 'Valour and the lord. The uma-jirushi: the daimyō heartens every block within 300 (1.35× the aura); his death is a heavier blow (35 morale, then −20 for the rest of the day) and his hatamoto charge the nearest enemy to avenge him. First spear, long chase: katana samurai run in at any enemy within 140, the first block to strike claims the first spear (+8 morale, +3 to those near it), and samurai and yari riders break ranks to chase readily, 1.4× as far and as long. Drilled teppō fire: the Teppō Ashigaru go out before the line, which waits up to 15 s behind them; their first volley is the whole block at once and costs its target 8 morale (the dead feel nothing); after it they fire rank by rank, and they fall back through the line when the enemy closes.',
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
    // The dead know no fear (they never rout: battle.ts `fearless`), but dry bone and rotten
    // sinew break easily: every class of them has far fewer hit points (`DEAD_HP`). The
    // Colossus, a hill of bone, keeps a little more; the trebuchet is timber like anyone's.
    // Sinew bowstrings are rotten too, so their archery is the weakest of the three.
    tweaks: {
      [U.HeavyInfantry]: { hp: DEAD_HP },
      [U.Spearmen]: { hp: DEAD_HP },
      [U.Skirmishers]: { hp: DEAD_HP },
      [U.Archers]: { hp: DEAD_HP, missileDamage: 0.9 },
      [U.Crossbowmen]: { hp: DEAD_HP },
      [U.LightCavalry]: { hp: DEAD_HP },
      [U.HorseArchers]: { hp: DEAD_HP },
      [U.Knights]: { hp: DEAD_HP },
      [U.Shock]: { hp: COLOSSUS_HP },
    },
    palette: { cloth: '#2e2b2a', clothShade: '#1a1817', trim: '#5f8f4e', metal: '#6c6f68', metalShade: '#3a3c38', leather: '#3d3128', skin: '#d8d0b4' },
    rule: 'The dead know no fear: they never waver, rout or rally, but have 66% of the living’s hit points (the Bone Colossus 80%; the trebuchet is timber). The tide: their foot marches at 0.8 of the living’s pace except within 240 of the Lich-Marshal, never halts to shoot or holds back, and charges at a lurch. Unflinching: a charge into them barely knocks them back, stuns nobody and stalls sooner. What falls, rises: every 10 s the Lich-Marshal raises fallen foot of his host within 240 of him (up to 0.8% of the host each time, and never more than 8) with 40% of their hit points. If he falls, the raising stops and the whole host crumbles: every man loses 2% of his hit points a second and fights worse. A host down to its last 8% (or its last fifth, against twice as many) is spent: the battle is lost and it crumbles the same way.',
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
