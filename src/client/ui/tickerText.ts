import type { BattleEvent, BattleSetup } from '../../game/battle.ts';
import { FACTIONS } from '../../game/factions.ts';

const STANCE_WORDS: Record<string, string> = {
  shieldwall: 'lock shields', pikewall: 'level their spears in a pike wall', wedge: 'form a wedge', loose: 'spread into loose order',
  braced: 'brace', column: 'form column', line: 'dress their line',
};

/**
 * The battle ticker's line for an event. A doctrine moment it does not know yet (a new note from
 * the battle) still reads as one; '' only for a kind the ticker has no words for, which it skips.
 */
export function tickerLine(e: BattleEvent, armies: BattleSetup['armies']): string {
  const army = e.team === 0 ? armies[0] : armies[1];
  const f = FACTIONS[army.faction];
  const who = army.name;
  const unit = f.short[e.cls] ?? 'men';
  switch (e.kind) {
    case 'rout': return `${who}’s ${unit} break and run`;
    case 'commander': return army.faction === 'samurai' ? `${who}’s ${f.commander} has fallen! His retainers scatter` : `${who}’s ${f.commander} has fallen`;
    case 'charge': return `${who}’s ${unit} charge`;
    case 'chase': return `${who}’s ${unit} break ranks to run down the fugitives`;
    case 'contact': return `${who}’s line meets the enemy`;
    case 'waver': return `${who}’s ${unit} waver`;
    case 'rally': return `${who}’s ${unit} rally`;
    case 'reform': return `${who}’s ${unit} re-form behind the line`;
    case 'joins': return `Fugitives of ${who}’s ${f.short[e.fromCls ?? -1] ?? 'men'} fall in with the ${unit}`;
    case 'shattered': return `${who}’s ${unit} are shattered`;
    case 'break': return army.faction === 'undead' ? `${who}’s host is spent` : `${who}’s army breaks`;
    case 'crumble': return e.note === 'commander' ? `Without its ${f.commander}, ${who}’s host begins to crumble` : `The last of ${who}’s dead crumble where they stand`;
    case 'stance': return `${who}’s ${unit} ${STANCE_WORDS[e.stance ?? ''] ?? 'change formation'}`;
    case 'general-order': return `${f.commander} of ${who} ${e.note ?? 'gives orders'}`;
    case 'doctrine':
      switch (e.note) {
        case 'marshal-charge': return `The ${f.commander} of ${who} unfurls the Beauséant: the ${unit} charge as one`;
        case 'banner': return `${who}’s ${unit} fall back on the banner and re-form`;
        case 'stand-fast': return `${who}’s ${unit} will not leave the field while the banner flies`;
        case 'revenge': return `${who}’s ${unit} charge to avenge their ${f.commander}`;
        case 'first-spear': return `${who}’s ${unit} claim the first spear!`;
        case 'raise': return `The ${f.commander} of ${who} raises ${e.count ?? 'some'} of the fallen`;
        default: return `${who}’s ${unit} keep to their doctrine`;
      }
    default: return '';
  }
}
