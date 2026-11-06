---
name: fast-sim
description: Iterate on battle behaviour fast with headless, small-scale sims (one regiment against one regiment, seconds per run) instead of full demo battles or the whole test suite. Use whenever changing or investigating anything in src/game (movement, targeting, melee, missiles, morale, generals, balance) or anything that needs a battle to check.
---

# Fast, small, headless sims

The sim (`src/game/battle.ts`) is pure TypeScript with no DOM, so a battle runs in Node with no renderer. Scale is what makes it slow: a 2,800-a-side battle takes seconds per run, a 100-battle fairness run takes many minutes, and the full suite about 6–10 minutes. **Iterate at the smallest scale that shows the behaviour, and go big once, at the end.**

## Hard limit: no run over a few minutes

**No single sim or test command may take more than about 3 minutes.** Wrap every run in a time limit (`timeout 180 npx tsx ...`). If it hits the limit, the run is too big: shrink it (fewer men, seeds or ticks), or split it across parallel processes (`for s in 1 2 3 4; do timeout 180 npx tsx script.ts --seeds=$s & done; wait`). Never sit waiting on a long run. A duel is under a second, a set-piece test file a few seconds, `pnpm test:fast` about a minute.

## The loop

1. **Reproduce in a duel** (well under a second a run). Use `scripts/duel.ts`:
   ```
   npx tsx scripts/duel.ts spearmen:templar:48 spearmen:samurai:48            # spear walls meet
   npx tsx scripts/duel.ts heavyInfantry:templar:60 spearmen:undead:60 --every=50
   npx tsx scripts/duel.ts knights:templar:20 spearmen:samurai:60 --stanceB=pikewall --seeds=1-5 --quiet
   npx tsx scripts/duel.ts archers:templar:60 heavyInfantry:undead:60 --gap=500 --hold=a
   ```
   A side is `class[:faction[:men]]`, with several classes joined by `+`. The options are `--gap`, `--ticks`, `--every`, `--seeds`, `--stanceA/B` and `--hold=a|b|both`; the header comment of `scripts/duel.ts` explains them.
2. **Need something the duel can't stage?** Write a throwaway script on the helpers in `src/game/testing.ts`: `only`, `plainArmy`, `placeRegiment` (put any block anywhere, facing anywhere) and `frontalCharge`. Keep to a few blocks, 30–120 men a side, and only the ticks that matter (`while (b.tick < 400) b.step()`). Print the numbers you care about every N ticks. Examples to copy from: `scripts/reach-sanity.ts`, `src/game/reach.test.ts`, `src/game/danger.test.ts`, `src/game/crossing.test.ts`.
3. **Lock it in with a set-piece test** in `src/game/*.test.ts` (seconds each), and run only that file: `npx vitest run src/game/reach.test.ts`.
4. **Quick regression check while iterating:** `pnpm test:fast` runs about 590 of the 770 tests in about a minute. It skips the files that each take over 15 s.
5. **Only at the end, once:**
   - `pnpm typecheck`, the full `pnpm test` (`npx vitest run --testTimeout=1800000` on a busy machine) and `pnpm build`.
   - A modest demo audit, e.g. `scripts/battle-sanity.ts` or `scripts/qa/realism-audit.ts` at 4 seeds × 450 men plus one seed at 1,200.
   - A fairness run only if balance could have moved, at 60–120 battles a pair, split across parallel `npx tsx` processes so each finishes within the 3-minute limit.

## Never

- Don't iterate on 2,800-a-side battles, `demoSetup` grand battles, or 100+-battle fairness runs. Those are final checks.
- Don't run the full suite after every edit.
- Don't open a browser or render to check sim behaviour; print numbers. Screenshots are for checking what is drawn (see the art-reference skill and CLAUDE.md).
- Don't leave a long run going while you wait. If something takes minutes, shrink it: fewer men, fewer seeds, fewer ticks.

## Determinism

`src/game` must stay deterministic: no `Math.random`, `Date` or trig; use `src/game/rng.ts`. Two runs with the same seed give the same result, so a duel is an exact before/after comparison of your change.
