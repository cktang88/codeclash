import { describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { BOTS, botPush, mulberry } from './bots.ts';

describe('sparring bots', () => {
  it('push in their style with conventional messages and plausible shape', () => {
    const rand = mulberry(3);
    for (const bot of BOTS) {
      for (let i = 0; i < 300; i++) {
        const p = botPush(bot, rand);
        expect(p.message).toMatch(/^(feat|fix|hotfix|refactor|perf|revert|Revert|chore|build|docs|test)\b/);
        expect(p.lines).toHaveLength(9);
        expect(p.files).toBeGreaterThanOrEqual(0);
        expect(p.files).toBeLessThanOrEqual(16);
        // A revert undoes earlier work, so its code and branch deltas are negative.
        if (p.lines[Cat.Code]! >= 0) expect(p.branches).toBeGreaterThanOrEqual(0);
        else expect(p.churn).toBe(-2 * p.lines[Cat.Code]!);
        if (p.lines[Cat.Code] === 0) expect(p.branches).toBe(0);
      }
    }
  });

  it('now and then land a feature big enough for a Dragon', () => {
    const rand = mulberry(11);
    for (const login of ['ada-bot', 'dennis-bot']) {
      const bot = BOTS.find((b) => b.login === login)!;
      let legendary = 0;
      for (let i = 0; i < 2000; i++) {
        const p = botPush(bot, rand);
        if (/^feat/.test(p.message) && p.lines[Cat.Code]! >= 600 && p.files >= 8 && p.branches >= 60) legendary++;
      }
      expect(legendary).toBeGreaterThan(5);
      expect(legendary).toBeLessThan(100);
    }
  });
});
