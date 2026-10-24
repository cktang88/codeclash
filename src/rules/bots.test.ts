import { describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { BOT_RATE, BOTS, botDay, botPush, botPushesPerDay, botRateAt, mulberry } from './bots.ts';

describe('sparring bots', () => {
  it('push in their style with conventional messages and plausible shape', () => {
    const rand = mulberry(3);
    for (const bot of BOTS) {
      for (let i = 0; i < 300; i++) {
        const p = botPush(bot, rand);
        expect(p.message).toMatch(/^(feat|fix|hotfix|refactor|perf|revert|Revert|chore|build|docs|test)\b/);
        expect(p.lines).toHaveLength(9);
        expect(p.files).toBeGreaterThanOrEqual(0);
        expect(p.files).toBeLessThanOrEqual(32);
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

  it('each carry about as much code a push as a typical developer, whatever their style', () => {
    const rand = mulberry(17);
    for (const bot of BOTS) {
      let code = 0;
      for (let i = 0; i < 5000; i++) code += botPush(bot, rand).lines[Cat.Code]!;
      expect(code / 5000, bot.login).toBeGreaterThan(120);
      expect(code / 5000, bot.login).toBeLessThan(190);
    }
  });

  it('keep office hours drawn from the war’s seed: the same every time, different by bot and by day', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let b = 0; b < BOTS.length; b++) {
        const day = botDay(seed, b);
        expect(botDay(seed, b)).toEqual(day);
        const [from, until] = day.windows[0]!;
        expect(from).toBeGreaterThanOrEqual(8);
        expect(from).toBeLessThan(10);
        expect(until - from).toBeGreaterThanOrEqual(7);
        expect(until - from).toBeLessThan(10);
        expect(day.rate).toBeGreaterThanOrEqual(BOT_RATE[0]);
        expect(day.rate).toBeLessThan(BOT_RATE[1]);
        for (const [f, u] of day.windows.slice(1)) {
          expect(f).toBeGreaterThanOrEqual(19);
          expect(u).toBeLessThanOrEqual(23);
        }
        // Asleep before dawn, at work mid-morning.
        expect(botRateAt(day, 3)).toBe(0);
        expect(botRateAt(day, 11)).toBe(day.rate);
        expect(botRateAt(day, 11 + 24)).toBe(day.rate);
      }
    }
    expect(botDay(1, 0)).not.toEqual(botDay(2, 0));
    expect(botDay(1, 0)).not.toEqual(botDay(1, 1));
  });

  it('push about as often as people do over a day, some evenings too', () => {
    let pushes = 0;
    let evenings = 0;
    const n = 2000;
    for (let seed = 1; seed <= n; seed++) {
      const day = botDay(seed, seed % BOTS.length);
      pushes += botPushesPerDay(day);
      if (day.windows.length > 1) evenings++;
    }
    // Log-uniform 0.8-6 an hour (mean about 2.6) over 7-10 hours, plus the odd evening.
    expect(pushes / n).toBeGreaterThan(18);
    expect(pushes / n).toBeLessThan(26);
    expect(evenings / n).toBeGreaterThan(0.3);
    expect(evenings / n).toBeLessThan(0.5);
  });
});
