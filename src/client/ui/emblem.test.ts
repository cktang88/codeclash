import { describe, expect, it } from 'vitest';
import { BOTS } from '../../rules/bots.ts';
import { EMBLEMS } from '../../rules/heraldry.ts';
import { botEmblem } from './emblem.ts';

describe('bot emblems', () => {
  it('gives every shipped bot its own emblem', () => {
    const emblems = BOTS.map((b) => botEmblem(b.login));
    expect(new Set(emblems).size).toBe(BOTS.length);
  });

  it('is deterministic and always a real emblem', () => {
    for (const login of ['someone-bot', 'x', '', 'constructor', 'ADA-BOT']) {
      expect(botEmblem(login)).toBe(botEmblem(login));
      expect(EMBLEMS).toContain(botEmblem(login));
    }
    expect(botEmblem('ADA-BOT')).toBe(botEmblem('ada-bot'));
  });
});
