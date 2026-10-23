// Heraldic charges for sparring bots, so each bot's avatar is told apart at a glance. Pure.
import { EMBLEMS, type Emblem } from '../../rules/heraldry.ts';

/** The shipped personas (rules/bots.ts) each get their own charge, chosen for the namesake. */
const PERSONA: Readonly<Record<string, Emblem>> = {
  'ada-bot': 'key',
  'grace-bot': 'anchor',
  'linus-bot': 'tower',
  'katherine-bot': 'moon',
  'margaret-bot': 'sun',
  'dennis-bot': 'bolt',
  'barbara-bot': 'wing',
};

/** A bot's emblem: fixed for the known personas, otherwise a stable hash of the login. */
export function botEmblem(login: string): Emblem {
  const key = login.toLowerCase();
  if (Object.hasOwn(PERSONA, key)) return PERSONA[key]!;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return EMBLEMS[(h >>> 0) % EMBLEMS.length]!;
}
