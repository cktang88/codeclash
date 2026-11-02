// Sparring bots' work: synthetic pushes on a person's hours, derived from a seed so nothing is
// stored and every reader sees the same bot city.

import { BOTS, botDay, botPush, botRateAt, mulberry } from '../measure/bots.ts';
import type { WorkEvent } from './city.ts';
import { DAYS_PER_WEEK } from './city.ts';
import { mixSeed } from './rng.ts';

const SLOT_MS = 10 * 60_000;

/** Bot `bot`'s pushes in the week starting `weekStart`, up to `until`. */
export function botWork(leagueSeed: number, bot: number, weekStart: number, dayMs: number, until: number): WorkEvent[] {
  const persona = BOTS[bot % BOTS.length]!;
  const out: WorkEvent[] = [];
  const hourMs = dayMs / 24;
  const slot = Math.max(1000, Math.floor((SLOT_MS * dayMs) / 86_400_000));
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const dayStart = weekStart + d * dayMs;
    if (dayStart >= until) break;
    const seed = mixSeed(leagueSeed, Math.floor(weekStart / 60_000), d, bot);
    const rand = mulberry(seed);
    // One day in six a bot takes off.
    if (rand() < 1 / 6) continue;
    const day = botDay(seed, bot);
    for (let t = dayStart; t < dayStart + dayMs && t < until; t += slot) {
      const hour = (t - dayStart) / hourMs;
      const p = (botRateAt(day, hour) * slot) / hourMs;
      if (rand() >= p) continue;
      const at = t + Math.floor(rand() * slot);
      if (at >= until) continue;
      const push = botPush(persona, rand);
      out.push({ at, delta: push, repo: push.repo[0], message: push.message });
    }
  }
  return out;
}

export function botLogin(bot: number): string {
  return BOTS[bot % BOTS.length]!.login;
}

export const BOT_COUNT = BOTS.length;
