# Battle realism review, round 2 (QA, 2026-11-06)

The standard is the same as in round 1: *would a real man on that field do this?* ("There shouldn't be a
single person on the battlefield where you wonder why aren't they doing X.") It should look like
Total War: grounded, not comical.

**What was reviewed.** `master` @ `540a2b4` (battle v17, field 2400 x 2400). Round 1 is
`docs/qa/battle-realism-review.md`. This round checks the five known leftovers and looks for what is
still wrong.

**How.** Everything ran small and headless, as the fast-sim skill says. Each command was under 3
minutes, and the big runs were split across parallel processes.
- Sim, with the existing scripts:
  - `scripts/qa/realism-audit.ts` on demo seeds 1–4 at 450 men, seed 1 at 1,200, and all 9 faction
    pairings on seeds 1–4 at 450 (36 battles);
  - `battle-sanity.ts --why` (seeds 1–4 at 450, seed 1 at 1,200);
  - `cavalry-sanity.ts`, `battle-crossing.ts` and `reach-sanity.ts` at 450, plus `cavalry-sanity` at 1,200;
  - `scripts/qa/generals.ts` (36 pairings);
  - `battle-fairness.ts` for the samurai question (120–300 battles a size).
- New probes, committed in `scripts/qa/`:
  - `missile-silence.ts`: why a loaded shooter with a foe in range does not loose;
  - `cav-idle.ts`: who among the horse stands still near the enemy, and in what mode;
  - `horse-overlap.ts`: friendly horse blocks on one enemy horse;
  - `caught-shooters.ts`: shooters ridden down by horse;
  - `pursuit.ts`: horse at a router's heels;
  - `refused-wing.ts`: a refused wing that sits out;
  - `battle-shots-2.cjs`: the round 1 shot list, re-centred on the v17 field, with four moments for
    the leftovers.
- Rendering: Playwright against `npx vite --port 5240 --strictPort` on `/battle-perf.html`:
  - demo s1/450 (samurai v templar) in classic art: 15 moments;
  - framed whole-field stills at t5, t450 and t900;
  - an HD melee still;
  - a set piece (`piece=1&ca=7&cb=3`: 48 Templar knights against 48 samurai archers).
- Raw output is in `docs/qa/battle-realism-2/data/`. The screenshots cited are in
  `docs/qa/battle-realism-2/shots/`.

## Summary (prioritised)

| # | Finding | Severity | Key evidence |
|---|---------|----------|--------------|
| 1 | Archers and crossbows stand and are ridden down by horse they saw coming 5–10 s off. 25–35 % of foot shooter blocks are caught hand to hand by horse, and 13–16 % of all shooters are killed by riders | **High** | `data/caught-a.txt`, `caught-b.txt`; s1/450 sam-tem M8 t856→t938; `shots/piece-knights-archers-t318.jpg` |
| 2 | Loaded shooters stay silent because of the volley clock. It restarts every tick the block re-faces, and after a volley most men held back from, it still waits the full cycle. 13–19 % of archers' "could shoot" time is lost this way, 9–15 % of crossbows', and up to 34 % for one block (leftover 1, re-diagnosed) | **Medium-high** | `data/silence-*.txt`; s1/450 M8 t810–870, s4/450 M26 t605–1285 |
| 3 | Horse stands still in "charge" mode behind friends who are fighting its target. 56 % of all idle horse time is in this mode (leftover 2: confirmed, not fixed by `idleRanks`) | **Medium** | `data/cav-idle-s*-450.txt`; s1/450 K32 18 s at t1100–1280; `shots/s1-450-knights-standing.jpg` |
| 4 | Knights chase kiting horse archers in 400 u circles for over a minute | **Medium** | s4/450 und-tem K14 v HA33 t815–1400; charge-long 18 in 36 battles (13 knights) |
| 5 | Second-line reserves dither: their goal jumps every 2–3 s and they swing ±70° on the spot. The general's household still jigs | **Medium** | oscillate: 53 reserve-foot and 46 general flags in 36 battles; s2/450 tem-tem L21 t1565–1755 |
| 6 | Horse in pursuit rides at the routers' heels, 9–11 u behind, and does not cut them down | Medium-low | `data/pursuit-piece.txt`: 48 knights, 22 routers, 12 s, 0 kills (seed 3) |
| 7 | Line foot march in narrow columns deep into bowshot. From above the army reads as scattered pegs, not a line. The yari blocks at the ends of the line face along it at deployment | Medium-low (look) | `shots/frame-s1-450-t450.jpg`; s1/450 L1 w 20 d 45 at t450, 500 u from the enemy |
| 8 | Two light-horse blocks on one enemy horse still merge, two standards over one crowd (leftover 5: confirmed, rare) | Low | `data/horse-overlap-*.txt`; s1/450 C27+C29 anchors 9 u apart at t475; `shots/s1-450-horse-merge-1.jpg` |
| 9 | Shooters keep walking with an unengaged foe in range and do not loose (2–6 % of their time) | Low | `data/silence-*.txt` "walking(advance) [free foe in range]"; s1/450 M8 t450–560 |
| 10 | Archers marching through their own second line: now rare (leftover 4: mostly fixed) | Low | crossing: 5 of 23 incidents at 450 × 4; s1/450 t890 M11 × L2 15 % |
| 11 | Samurai scaling: +8 points against undead from 250 to 1,000 a side, none against templar. A team-0/team-1 gap of about 11 points in samurai v undead (leftover 3: partly confirmed) | Low (balance) | `data/fairness-samurai.txt` |
| 12 | Set pieces: half of one side's line (a "refused wing") sits at its start line while its twin is routed. The perf page's header still says "160 apart" | Low | `data/refused-piece.txt` |
| 13 | Residuals: face-away 2.2–2.8 %; engines end with most of their shots unfired | Low | realism-audit totals |

**Passes, and what got better since round 1.**

| Measure | Round 1 | Now |
|---|---|---|
| Crossbow own-side hits | 14.6 % | 1.4 % (65 own v 4,490 foe, pairs) |
| Archer own-side hits | 6 % | 0.07 % |
| Artillery own-side hits | 23–31 % | 1.3 % (11 v 812) |

- Generals: none of 72 fell in 36 pairings (round 1: the Lich in 36 %). Household melee share is 0.7–2.2 %.
- Routers running the wrong way: 0.4 % (round 1: 1.2–1.6 %). Running into the enemy: 0.2–0.3 %.
- spread-block: 101 flags in 36 battles, against 375 in 72 in round 1.
- Skirmisher shuttling: oscillate flags for skirmishers fell from 302 to 24.
- Friendly crossings: 0.04 block-pairs a second, with 0.001 a second involving horse.
- Stacked men: 0.02 %. No timeouts, and no 60 s standoffs.

**Leftovers, verdicts.**

| # | Leftover | Verdict |
|---|---|---|
| 1 | Crossbows silent behind their own melee | Refuted as stated, confirmed in substance. Holding fire over their own melee ("only engaged foes in range") is only 2–5 % of crossbow time, and that hold is right. The real silence is the volley clock (#2), with a free target in range. battle-sanity missile-idle is 11.7 % at 450 and 13.1 % at 1,200, not 20 %. |
| 2 | Knights idle at the back of a melee | Confirmed, but the bigger part is not "at the back of a melee": horse halted in charge mode behind a friend (#3). Riders ever idle: 7.5–13.7 % at 450, 6.2 % at 1,200. |
| 3 | Samurai gain 8–10 points from 250 to 1,000 | Partly confirmed. Against undead +8.4 (46.3 → 54.7 %, 300 battles a size, about 2σ). Against templar −4.2 (50.0 → 45.8 %, 120 a size, not significant). |
| 4 | Archers through their own second line | Mostly fixed. Five crossing incidents of 23 in 4 battles at 450, the worst 15 % of a block; nothing above a quarter of a block except one. |
| 5 | Light horse merging on the same enemy horse | Confirmed but rare: 1.6–4.5 % of riders knee to knee with the other block, 0.7–1.8 ‰ stacked. One clear case per 4 battles. |

---

## 1. Shooters are ridden down standing — High

**What happens.** Enemy horse turns on a block of archers or crossbows. It is 200–300 u off, 5–10 s
away. The shooters stay where they are, or keep walking forward, shoot at will, and are caught hand to
hand. Their own foot is 100–200 u away and they do not move toward it.

**Where and when.**
- Over the 36 pairings at 450 men (`caught-shooters.ts --pairs`):
  - 70 of 234 foot-shooter blocks were caught hand to hand by horse (25 % on seeds 1–2, 35 % on seeds 3–4);
  - riders killed 909 shooters, 13.0 % and 16.3 % of all foot shooters.
- s1/450 sam-tem, M8 (samurai archers, 25 men). Templar light horse C29 makes for it from 284 u at
  t856. M8 moves 21 u *toward* the enemy and is caught at t938.
- In the same battle, at t810–870, its 25 loaded men waited on the volley clock with C29 at 255–263 u
  (see #2). They loosed one volley at t872, then stood reloading while C29 rode in: 242 u at t880,
  57 u at t930.
- s4/450 tem-und M9 (crossbows, 38 men): the horse made for it from 283 u, 14 s before contact; it
  moved 16 u forward.
- Set piece `piece=1&ca=7&cb=3&fa=templar&fb=samurai`, seed 3. 48 samurai archers stand in two blocks
  and shoot at 48 knights coming from 1,300 u. Not one knight falls, and both blocks are broken at the
  first shock (t330). See `shots/piece-knights-archers-t318.jpg`: one block is already a heap of dead,
  the other ridden through.

**Why it's unrealistic.** Archers and crossbowmen without stakes don't wait for knights in the open.
At Crécy and Agincourt they stood behind stakes and beside men-at-arms. Elsewhere they ran behind or
into the spearmen as the horse came on. That is what the user means by "why don't they do X, I would".
Total War models it as skirmish mode: shooters fall back from horse.

**Likely cause.** `src/game/battle.ts`, `thinkMissile` (≈4129):
```ts
const threat = this.threatTo(r);
if (threat) {
  // No time for the word: every man shoots as he can at the nearest foe ...
  // They stand: no wheeling, a man shoots where he must.
```
Any threat, horse at 300 u included, sets `shoot`, at will, with the goal at the anchor. There is no
"fall back on our foot" branch for missile foot. Only skirmishers (`screen`, `FLAT_SCREEN.horse`) and
the guns have one.

**Suggested fix.**
- In `thinkMissile`, when `threat` is horse (`isCav`) still more than about 2 s of its gallop away and a
  friendly formed foot block (spears best) stands within about 250 u, retire behind or beside it at the
  run.
- Re-form there, a step behind its rear rank (`firingSpot` already knows "behind an interval").
- Keep "stand and shoot" for when the horse is already within a short charge, or no friend is near.
- Optionally let a block halted for some time plant stakes or pavises (they are drawn, and the renderer
  leaves them on the field), and treat a staked front as braced against a frontal charge.
- Lock it with a set piece: knights at 400 u on archers 150 u in front of a spear block. Expect fewer
  than 10 % of the archers killed, and the archers ending behind the spears.

## 2. The volley clock silences loaded shooters — Medium-high (leftover 1, re-diagnosed)

**What happens.** In `missile-silence.ts`, a "could shoot" tick is one where:
- the block has a loaded man (ammo, `cd` 0);
- an enemy man (not routing) is within 0.95 of range;
- the block is not in melee.

Share of those ticks without a shot in the last reload:

| Cause | Archers (s1–4 / 450) | Crossbows (s1–4 / 450) | 1,200, archers / xbows |
|---|---|---|---|
| loosed | 62–73 % | 72–79 % | 76 / 77 % |
| **shuffling (clock restarts)**, free foe in range | 10–12 % | 2–3 % | 8 / 4 % |
| **clock waits, over 60 % loaded**, free foe in range | 3–11 % | 7–11 % | 3 / 4 % |
| beat | 5 % | 2 % | 2 / 2 % |
| walking (advance), free foe in range | 2–3 % | 6 % | 2 / 4 % |
| holding: only engaged foes in range (danger close, correct) | 4–6 % | 2–5 % | 4 / 7 % |

Worst blocks:
- s3/450 und-tem M8 (crossbows): 34 % of its time waiting on the clock with most men loaded.
- s4/450 und-tem M26 (templar archers): 34 % shuffling.

**Where and when.**
- s1/450 M8 t797. A volley in which most men held for danger close (`dangerShots` +15). At t810, 24 of
  25 men are loaded with target 27 in range at 410 u. `volleyAt` is t872, so they wait 6 s, while
  light horse C29 closes from 263 to 255 u. They loose at t872, then reload as the horse rides in (#1).
- s4/450 M26 (templar archers, 38 men), t605–1285 (`trace-block.ts 4 450 26`). It stands 400 u behind
  its line, turning slowly through 180° to follow the undead knights circling behind it (#4). Each
  re-face sets `movedAt` and pushes the volley a beat away. It loosed 6 volleys in 68 s.

**Why it's unrealistic.**
- A loaded archer with a clear target doesn't wait for the next word because his file shifted half a
  pace, or because his last volley was called off.
- An officer whose volley mostly didn't go calls the next one as soon as the target is clear.

**Likely cause.** `src/game/battle.ts`:
- `step` (≈1890): `if (r.vax !== 0 || r.vay !== 0 || r.fx !== fx || r.fy !== fy) r.movedAt = this.tick;`
  Any re-face of any size counts as moving.
- `volleyClock` (≈6293): `r.movedAt === t` sets `volleyAt = t + VOLLEY_BEAT` every tick. After a
  volley, `volleyAt += volleyEvery` whatever `volleyShots` was.

**Suggested fix.**
- Count a block as moving only when it really shifts. For example, the anchor moved more than half a
  spacing since the last volley, or it wheeled more than about 20°. Small wheels and tracking turns
  shouldn't restart the clock.
- If a volley drew fewer shots than half the loaded men (held for danger or blocked), set the next
  volley to `t + VOLLEY_BEAT` once a clear target exists, not a full `volleyEvery` later.
- Re-run `missile-silence.ts`. Target: "clock waits, most loaded" under 2 %, shuffling under 3 %.

## 3. Horse halted in "charge" mode behind friends — Medium (leftover 2)

**What happens.** A block of horse is ordered to charge an enemy block that a friendly block is
already fighting. Its goal is moved out of that friend's footprint, beside it. That is where the horse
already stands, so it halts 30–40 u from the fight, still in mode `charge`, facing it, for many
seconds. `idleRanks` (QA #14) only acts once the block is engaged, so it never fires here.

**Where and when.**
- s1/450 sam-tem, K32 (templar knights, 11 riders), t1100–1280. Goal = anchor (1462, 1400); target
  K15 (samurai knights, 3 riders), locked with templar L21. The knights stand 39–40 u away for 18 s.
  `shots/s1-450-knights-standing.jpg` and `-2.jpg` show it.
- realism-audit flags it as charge-long at t1250.
- Over seeds 1–4 at 450 (`cav-idle.ts`), 262 of 468 idle rider-ticks in windows of 1 s+ are in
  `charge` mode. Nearly all have the nearest foe "busy with ours".
- `cavalry-sanity.ts` idle riders: 16.7 % (s1), 10.7 %, 10.2 % and 5.2 % at 450; 6.2 % at 1,200.

**Why it's unrealistic.** Eleven knights don't sit 40 u from three enemy riders their friends are
fighting for 18 s. They ride round and take them in the flank, or go for something else.

**Likely cause.**
- `src/game/battle.ts`, `thinkCav` (≈4955): `if (dp < 160 || r.mode === 'charge') { ... this.goal(r, prey.cx + ..., prey.cy + ...) }`.
- Then `clearGoal` (≈5785) shifts any goal out of a friend with the right of way. Charging horse is
  not exempted, and the shift lands on the horse's own anchor.
- `idleRanks` (≈5040) needs `r.meleeTicks > RIDER.idleFor`.

**Suggested fix.**
- In `thinkCav`, when the prey is engaged with our foot or horse and our men outnumber it there (or
  `clearGoal` moved the goal more than 20 u), don't keep charging it. Use `rideRound` / `flankPoint` to
  its open side, or retarget to the nearest free enemy.
- Extend the `idleRanks` break-off to a non-engaged block in `charge` whose anchor has moved less than
  10 u in 3 s.

## 4. Knights circle after horse archers for a minute — Medium

**What happens.** Heavy horse charges horse archers that kite away. The knights follow round a circle
about 400 u across, for 60 s and more, in `charge` mode. They never catch them, and never give up.
The circle passes behind their own line, so the shooters there keep wheeling to follow it (#2).

**Where and when.**
- s4/450 und-tem, K14 (undead knights, 17 riders) charging HA33 (templar horse archers, 13 → 10).
- From t815 to at least t1400, `trace-block.ts 4 450 14` and `... 33` give the same loop. The knights
  pass (1348, 916), (1631, 756), (1724, 1034), (1528, 1118), (1384, 908) and back to (1579, 750).
- The horse archers lose 3 riders. The knights lose 2, to arrows.
- charge-long (a charge 20 s+ without contact) was flagged 18 times in 36 battles: 13 knights, 5 light
  horse.

**Why it's unrealistic.** No captain gallops his heavy horse after faster horse archers for a minute.
After one failed dash he pulls up and goes for foot, or rejoins the line. Total War's AI breaks off
too.

**Likely cause.** `thinkCav`, the charge branch above. Once in `charge`, `r.mode === 'charge'` keeps
the block charging whatever the distance. `CHARGE_MISSED` only changes where it aims, not whether it
goes on.

**Suggested fix.**
- If a charge has run `CHARGE_MISSED` + about 10 s without a blow and the prey is faster (horse
  archers, light horse) or kiting, give it up. Set `hold`, re-form (`rallyPoint`), and let the general
  give a new target, with a cooldown before charging that block again.
- A duel to lock it: `npx tsx scripts/duel.ts knights:undead:18 horseArchers:templar:14 --gap=300 --ticks=900`.
  Expect the knights to stop chasing within about 25 s.

## 5. Dithering reserves and household — Medium

**What happens.** Second-line blocks in `reserve`, not committed, change the friend they stand behind
every few seconds. Their goal jumps 100–300 u, and they wheel ±70° on the spot without getting
anywhere. The general's household still reverses back and forth (round 1 #6, reduced but not gone).

**Where and when.**
- oscillate (anchor reverses 3+ times in 30 s) over 36 pairings at 450: 416 flags. Of these:
  - knight GENERAL guard/support: 46;
  - heavy reserve/reserve: 41, plus spear reserve/reserve: 12;
  - crossbow shoot/advance: 21.
- s2/450 tem-tem, L21 (team 1 heavy foot, 34 men), t1565–1755. Its goal goes:
  (591, 1144) → (760, 1481) → (798, 1369) → hold → (753, 1352) → hold → (720, 1346) → (659, 1300).
  Its facing swings from (−0.96, −0.29) through (−0.37, 0.93) and (−0.55, −0.83) to (−0.68, 0.74). It
  stays about 90 u behind its line (front x 740) and never commits.

**Why it's unrealistic.** A reserve stands still, faces the enemy and waits for the word, or goes in.
It doesn't shuffle round its own rear.

**Likely cause.** `src/game/battle.ts`, `reserveOrder` (≈2521). Every order it picks the *nearest*
first-line block, with no hysteresis. The "+1e6 if another reserve already backs it" term makes two
reserves swap friends when they pass each other. The household's guard point (`thinkCommand`) is the
same pattern.

**Suggested fix.**
- Keep `ord.friend` unless that friend has died, routed or moved more than 150 u, or another is more
  than 40 % closer.
- Don't re-face a reserve that is within 15 u of its spot (face the enemy's edge).
- Give the household's guard point the same dead band.

## 6. Pursuing horse rides at the routers' heels — Medium-low

**What happens.** Horse in `pursue` keeps pace with the routers 9–11 u behind them, at about their
speed (23–32 u/s against a top speed of 52), and seldom strikes.

**Where and when.**
- Set piece knights v archers, seed 3. From t360 to t480, 48 knights pursue 22 routing archers: the
  nearest gap stays 9–11 u, and none are killed. See `shots/piece-knights-archers-t380.jpg`: four
  standards in one clump, at a walk behind the fugitives.
- `pursuit.ts --piece` (seeds 1–3): 184 rider-seconds at a router's heels, at 45 % of top speed, for
  27 kills. That is 8.8 kills a rider-minute, against 41–49 for foot pursuing in the demo battles.
- In the demo battles at 450 the horse seldom pursues at all (1 rider-second at heels), so this is
  mostly seen in set pieces and late in big battles.

**Why it's unrealistic.** A rout is where horse does its killing. Knights don't trot politely behind
running archers.

**Likely cause.** `src/game/battle.ts`, the pursue movement for mounted men:
- `lead` and pace for `pursue`, around `moveAnchor` (≈5654) and the per-man move (≈8094);
- `seek`'s choice of a routing foe in reach.

The riders seem to hold block order (pace = the block's) rather than each running down his man.

**Suggested fix.** In pursuit, each rider gallops at his own man (as in `charge`, with impetus) and
strikes when in reach. Let the block's anchor follow the riders, not the riders follow the anchor.

## 7. Columns into bowshot, and how the field reads — Medium-low (look)

**What happens.**
- Line foot march toward the enemy as narrow columns (w 19–24, d 43–51) with wide intervals. They
  shake out into line (w 57–60) only when they halt, about 10 s before contact.
- Seen from the default camera (`frame=1`), the army at t450 reads as scattered pegs at odd angles
  (`shots/frame-s1-450-t450.jpg`), and by t900 as clumps all over the field (`frame-s1-450-t900.jpg`).
  The Total War stills (refs 1, 2, 4 in `docs/art-references/total-war-battles.md`) show long, thin,
  continuous lines and "a thin band of flags".
- At deployment, the yari blocks at the ends of the samurai line face along the line, toward its
  centre: f = (0.02, ±1.00) at t5–t15. This happens in seeds 1, 3, 4 and 5, and lasts until the advance
  starts (2–6 s). `shots/s1-450-deploy-yari3-t10.jpg`.

**Where and when.** s1/450 sam-tem. At t450 the samurai L1 (w 20 d 45), L3 (w 19 d 49) and L4
(w 24 d 43) are 450–550 u from the templar foot, inside its archers' range (590).

**Why it's unrealistic.** Columns to approach are right, but not inside bowshot. A real line deploys
before it comes into range, so it doesn't take arrows in column. And a block at deployment faces the
enemy, not its neighbour.

**Likely cause.**
- `thinkLine` / the march formation in `moveAnchor` (`march` at ≈5416: `!this.nearestFoe(r, 0, 240)`).
  The column is kept until a foe is within 240 u.
- The initial `dfx/dfy` of the end-of-line blocks (`advance/flank` order) points at their flanking goal.

**Suggested fix.**
- Deploy from column to line at the enemy shooters' range plus a margin (about 650 u at v17 scale),
  not 240 u.
- Face every block at deployment toward the enemy's edge, and turn it only when it starts its move.
- Consider a slightly closer default frame at 450 men: the armies fill under a third of the view.

## 8. Friendly horse blocks merge on one enemy horse — Low (leftover 5)

**What happens.** Two light-horse blocks charge the same enemy horse from about the same side and end
up as one crowd under two standards.

**Where and when.**
- s1/450 sam-tem, C27 + C29 (templar light horse) on C12. From t378, anchors are 9 u apart at t475,
  and 23 % of their riders are knee to knee with the other block. `shots/s1-450-horse-merge-1.jpg`
  shows two green standards side by side over one mass.
- Overall (`horse-overlap.ts`): 4.5 % of riders knee to knee at 450 (s1–4), 1.6 % at 1,200, and
  5.1 % in samurai mirrors. Riders inside another (0.8 of the radii): 0.7–1.8 ‰.

**Why it's unrealistic.** Mild. Cavalry in a mêlée did mix. But two squadrons don't charge into each
other's ground, and the two standards on one spot read as a glitch.

**Likely cause.** `thinkCav` charge aim (`prey.cx + dpx/dp · past`). Both blocks aim at the prey's
centre. `clearGoal` doesn't separate horse in `charge` (`loose`/mounted pairs are skipped:
`if (r.stance === 'loose' && o.stance === 'loose' && (isMounted(r) || isMounted(o))) continue;`).

**Suggested fix.** When a friendly horse block already charges the same prey, aim the second at the
prey's nearer flank (`flankPoint`), or at the far end of its front. In `moveAnchor`, keep a lateral
separation of half the two widths between friendly horse anchors in `charge`.

## 9. Shooters walk past a target in range — Low

**What happens.** A missile block keeps marching in `advance` with no target while an unengaged enemy
block is within range of its nearest man.
- Crossbows: 6 % of could-shoot time.
- Archers: 2–3 %.
- s1/450 M8 (samurai archers): t450–560, 11 s, with templar skirmishers S23 at 450–560 u (range 590).
  It then shoots them from t570.

**Likely cause.** `thinkMissile` → `shootable(r, st.range * 0.95, ...)` (≈4157). It measures range
from the block, not from its nearest men, and its target filter likely discounts skirmishers.

**Suggested fix.** Measure range to the target's nearest men from the shooters' front rank. Let
skirmishers within range be a valid target while the block is not yet at its spot.

## 10. Archers through their own second line — Low (leftover 4: mostly fixed)

- `battle-crossing.ts` at 450 × 4 seeds: 23 incidents in all, 0.040 block-pairs a second; 5 involve a
  missile block on the move and a second-line block.
- The worst: s1/450 t890, M11 (crossbows) × L2 (heavy, support), 15 % of a block.
- `shots/s1-450-missile-through-line-2.jpg` (t180): archers marching past the second-line heavy block,
  their rear end brushing it. They don't pass through it.
- The remaining crossings are mostly two friendly foot blocks in the same melee (attack × flank), which
  is acceptable.

**Suggested fix.** None needed beyond keeping `battle-crossing.ts` in the final checks. If wanted, give
missile blocks on the march the same `clearGoal` right of way against a second line that is still
`reserve`.

## 11. Samurai scaling, and a side gap — Low (leftover 3: partly confirmed)

`battle-fairness.ts --factions`, both ways round on every seed:

| Pairing | 250 a side | 1,000 a side |
|---|---|---|
| samurai v templar (120 battles a size) | 50.0 % | 45.8 % |
| samurai v undead (300 battles a size) | 46.3 % (team 0 52.0 %, team 1 40.7 %) | 54.7 % (team 0 60.7 %, team 1 48.7 %) |

- So the samurai do gain about 8 points with size, but only against the undead (about 2σ). Against the
  templar they don't (−4, inside the noise).
- The team-0 advantage of about 11 points in samurai v undead, at both sizes (about 2σ each), looks
  like a side bias in that pairing. It isn't seen in samurai v templar (47.5 / 53.8).
- This is balance, not realism. Suggested: a mirror run (`pnpm fairness 500 400`), and `--factions
  samurai,undead --sizes 500 --seeds 400 --jobs 4` split across shards, before tuning anything.

## 12. Set pieces: a refused wing sits out — Low

- `/battle-perf.html?piece=1` and `plainArmy` give each side two blocks. With the general's plan
  `refuse`, one of them holds at its start line (`REFUSE_UNTIL` 2000 ticks) while its twin fights and
  breaks 650 u away.
- `refused-wing.ts --piece 1,1`, seed 3: samurai L3 holds 36 s while L2 fights. In the earlier trace
  it was still at x = 1854 at t1200, after L2 had routed.
- None of the 36 demo pairings showed it.
- The header of `src/client/battle-perf.ts` still says the set piece starts "160 apart". On the v17
  field it is 1,300 u.

**Likely cause.** `generalThink`, the `plan === 'refuse'` hold (≈2366). It only lifts when a foe comes
within 130 u, or at `REFUSE_UNTIL`.

**Suggested fix.** Lift the refusal when any friendly line block is engaged and the enemy has no
reserve left to threaten that wing, or when a friendly line block breaks. Fix the header comment.

## 13. Residuals — Low

- **face-away** (a standing man drawn with his back to the nearest enemy within 12 u): 2.2–2.8 % of
  man-samples (round 1: 3.1 %).
  - The largest part, about 1 % of all, is line foot whose target is not the nearest enemy
    ("L target tgt-not-nearest").
  - Then about 0.55 % each for line foot in melee ("front", "moving").
  - Suggested: in `pose.ts`, face the nearest enemy within body reach when the target is more than a
    body-width further off.
- **ammo-left** in 36 battles: 65 engine blocks (of 72) end with over half their shots unfired, plus 45
  crossbow and 30 archer blocks. Battles at 450 last 150–380 s, and the engines' reload is 30 s. This is
  mostly fine. The crossbow share follows from #2.
- **Idle near a fight**: battle-sanity idle-near-fight is 2.7 % and walks-away 1.8 % at 450. The
  rear-rank breakdown is as round 1. No action.
- **A crossbow block in column near the melee** (s1/450 M11, mode `skirmish`, t715,
  `shots/s1-450-shooters-silent.jpg`): two files wide, 15 deep, only its front pair could shoot.

## Rendering notes against the Total War references

- **Banners mark units (ref 2, 3): yes.** Standards stay over their men in melee and rout
  (`shots/s1-450-rout-1.jpg`, `hd-s1-450-melee-t800.jpg`). The exceptions are #8 (two over one crowd)
  and the pursuing knights in the set piece (four in one clump).
- **The melee dissolves into a crowd under its standards (ref 3): yes**, in HD especially
  (`hd-s1-450-melee-t800.jpg`). The Templar white surcoats now read at the same scale as the samurai
  (round 1 #9 looks fixed).
- **Neat deployed blocks (ref 4): yes at t5** (`frame-s1-450-t5.jpg`). But see #7 for the end-of-line
  yari, and for the army never reading as a continuous line once it moves.
- **The fallen as dark lumps: yes.** But a block cut down in place leaves its dead as a compact
  rectangle in the shape of the formation (`piece-knights-archers-t318.jpg`, bottom right). Some
  scatter would read more naturally.
- **Pavise and stake lines** stay on the field where the archers first stood
  (`frame-s1-450-t450.jpg`, top left). That's fine, but the archers never use them again (see #1).

## Reproduce

```
npx tsx scripts/qa/caught-shooters.ts --seeds 1,2 --men 450 --pairs        # #1 (and --seeds 3,4)
npx tsx scripts/qa/missile-silence.ts --seeds 1,2 --men 450 --verbose      # #2, #9
npx tsx scripts/qa/cav-idle.ts 1 450                                        # #3
npx tsx scripts/qa/trace-block.ts 4 450 14 800 1400                         # #4 (and block 33)
npx tsx scripts/qa/trace-block.ts 2 450 21 1560 1760 templar templar        # #5
npx tsx scripts/qa/pursuit.ts --seeds 1,2,3 --piece                         # #6
npx tsx scripts/qa/horse-overlap.ts --seeds 1,2,3,4 --men 450               # #8
npx tsx scripts/qa/refused-wing.ts --seeds 1,2,3 --piece 1,1                # #12
node scripts/qa/battle-shots-2.cjs <out> 1 450 classic 5240 [moments]       # shots (vite on 5240)
```
