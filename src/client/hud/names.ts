import { armyColor } from '../../rules/heraldry.ts';
import type { RosterEntry } from '../../protocol.ts';

/** Display name and colors for player `p` from the roster. */
export function playerInfo(roster: readonly RosterEntry[], p: number): { login: string; hue: number | null; color: string; bot: boolean; avatarUrl: string } {
  const r = p >= 0 ? roster[p] : undefined;
  if (!r) return { login: p >= 0 ? `player ${p + 1}` : 'nobody', hue: null, color: 'var(--muted)', bot: false, avatarUrl: '' };
  return { login: r.login, hue: r.hue, color: armyColor(r.hue, 66), bot: r.bot, avatarUrl: r.avatarUrl };
}
