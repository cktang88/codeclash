# Battle realism review (QA, 2026-11-06)

The question asked of every frame: *would a real man on that field do this?* ("There shouldn't be a single
person on the battlefield where you wonder why aren't they doing X.") The standard is Total War: grounded,
not comical.

**What was reviewed.** The integration head `claude/autobattler-custom-units-5swvyn` @ `cc3aad0` (battle
v17, field 2400 x 2400, `MAX_TICKS` 6000). The local `master` (`79e054c`, battle v16) is a day behind
and lacks the v17 fixes for crossing blocks, stacked archers and horse riding through friends, so this
review ran on the integration head. A first pass on v16 is noted where it differs. The
spear-reach work (`cc/weapon-reach`) is excluded, as asked.

**How.**
- Simulation: `demoSetup` seeds 1–8 at 450, 1,200 and 2,800 men (24 battles), and all 9 faction pairings
  over seeds 1–4 at 450 and 1,200 (72 battles). Every battle was watched tick by tick by
  `scripts/qa/realism-audit.ts` (21 detectors, listed in its header). The existing `scripts/battle-sanity.ts`,
  `cavalry-sanity.ts` and `battle-crossing.ts` were run on the same 24 battles. Generals were measured
  with `scripts/qa/generals.ts`. Single blocks were followed with `scripts/qa/trace-block.ts` and
  `scripts/qa/members.ts`.
- Rendering: Playwright against `npx vite --port 5220` on `/battle-perf.html`.
  - `scripts/qa/battle-shots.cjs` makes one pass per battle and shoots 15 moments: deployment, the
    advance under fire, the cavalry clash, first foot contact, the knights' charge, melee close and
    wide, archers, horse archers, the general, the engines, a rout, a pursuit and the end. Each moment
    has 3 frames, 0.5 s apart.
  - Battles shot: seeds 1/1200 (samurai v templar), 3/2800 (undead v templar) and 7/450 (templar v
    templar), in classic art.
  - `scripts/qa/still.cjs` adds HD stills.
- Raw outputs are in `docs/qa/battle-realism/data/`; the screenshots cited are in
  `docs/qa/battle-realism/shots/`.
- Total War references: the five stills in `docs/art-references/total-war-battles.md` (Medieval II
  `0000000842/3/5/6`, Rome Remastered `ss_94607ef2`). Their lessons, used here as yardsticks: banners
  mark each unit, melee dissolves into a crowd under its standards, deployed blocks are neat, and a
  unit's men stay around their standard. No new images were downloaded.

## Summary (prioritised)

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| 1 | Routing stragglers stay members of a rallied block. Its standard floats over empty ground, it "absorbs" fugitives from across the field, and the whole block marches to its rear at a run to fetch them | **High** | spread-block in 22 of 24 matrix battles and 64 of 72 pairings; s4/1200 L34 (shots, trace) |
| 2 | Artillery kills its own men: 23–31 % of all stone and ball hits land on its own side | **High** | 446 own / 1,502 foe (matrix); 1,371 / 3,040 (pairs) |
| 3 | Crossbows (14.6 %) and archers (6 %) hit their own side, over half of it into their own melee | **High** | xbow 2,934 own / 17,160 foe; archer 4,177 / 65,837 (pairs) |
| 4 | The Lich-Marshal dies in 36 % of battles (31 % before his host breaks), against 3 % for the other generals. He fights on, 100–440 u ahead of his own line, with 1–3 riders left | **High** | `data/generals.txt`, `data/lich-deaths.txt` |
| 5 | Spent skirmishers shuttle out 100–150 u in front of the line to throw one or two javelins, then run back, again and again | Medium-high | oscillate: 302 skirmisher flags; s1/450 S6 t590–710 |
| 6 | The general's household jigs back and forth behind the line, often riding backwards | Medium | oscillate: 140 general flags; backwards: 78; s1/450 G18 t650–720 |
| 7 | Artillery crews sit pinned against the back edge of the field in big battles | Medium | edge-stuck: 78, all artillery, at x = 4–10 or 2391–2396 |
| 8 | About 3 % of men standing within 14 u of an enemy are drawn with their back to him | Medium | face-away 3.14 % (matrix), 3.02 % (pairs) |
| 9 | Templar heavy foot in HD draw as oversized flat white sheets beside the samurai | Medium | `shots/hd-s1-1200-melee-t804.jpg`, `shots/crop-white.jpg` |
| 10 | The opening is the same every battle: the two light-horse wings meet at 17.6–18.3 s, in 24 of 24 battles | Medium | `data/first-contact.txt` |
| 11 | Archers stand inside their own second-line block to shoot | Medium-low | `shots/s7-450-archers-shooting.jpg`; crossing: missile x missile 48 samples |
| 12 | Block anchors and standards lurch at over twice a man's running pace when the anchor is leashed to its men | Medium-low | anchor-jump: 1,014 (matrix), 2,017 (pairs) |
| 13 | Loaded shooters with a target in range stay silent for twice their reload and more | Medium-low | battle-sanity missile-idle 15 % |
| 14 | Knights stand idle at the back of a melee they can't reach; riders are left behind when the horse breaks off | Low-medium | cavalry-sanity idle 6.8 % of riders; behind 659 rider-s over 137 withdrawals |
| 15 | Undead dead and living are hard to tell apart; a classic-art crowd at 2,800 men is hard to read | Low-medium | `shots/s3-2800-general.jpg` |
| 16 | Routers sometimes run toward the enemy's edge (1.2–1.6 %) or into an enemy (0.5 %); light horse flee off the enemy's edge | Low | rout-wrong, rout-into, fled-wrong-edge 12/17 |
| 17 | HD first load: armies are missing or drawn as dark silhouettes for several seconds; the minimum zoom can't show both armies | Low | `shots/hd-s1-1200-deploy-t5.jpg` |

**Passes, no action needed.** These were clean or are now fixed:
- Battles end: no timeouts and no 60 s standoffs in 96 battles.
- Friendly crossings fell from 14.8 to 0.28 block-pairs a second compared with v16. What remains is
  friendly blocks closing on the same foe.
- Units almost never ignore a flank attack: flank-ignored was flagged 9 times in 24 battles.
- Reserves are committed: reserve-idle 2 of 148.
- Artillery now fires: 109 of 120 engine blocks did, against 22 of 120 on v16.
- Pursuit ends at most 12 s after the break.
- Enemy men overlap rarely: 2.3‰ (horse) and 2.5‰ (foot) of samples are over 40 % inside an enemy.
- Horses no longer ride through friends.

---

## 1. Routing stragglers stay in a rallied block: the standard floats away and the block marches to its rear — High

**What happens.** A block routs, then rallies. The men within `REGROUP.gather` stop, but the runners
further off "run on" and are still members. The same happens to fugitives a block takes in.
`survey` counts members in state `Routing` in the block's centre and radius, so:
- The standard is drawn at the centre (`scene.ts`, "Standards over each regiment", uses `r.cx`, `r.cy`).
  It hangs over empty grass, 100 u or more from any of its men.
- `r.radius` grows to the far runners. s4/1200 L34's radius was 420 u at t1270, 988 at t1575 and
  1,631 at t1880; its formation is 53 u.
- `friendNear` measures `o.radius + REGROUP.reach` from the centre, so the block becomes a "taker" for
  fugitives anywhere across the field.
- `fallIn` sets each new man to `Fighting` where he stands. `survey`'s leash then pulls the anchor
  toward the mean of the fighting men.

The block, ordered to advance at the enemy (goal x ≈ 933), turns its whole mass round and runs the
other way to fetch the men it took in. It runs at 25–30 u/s, faster than the march.

**Where and when.** seed 4, 1,200 men (undead v templar), block L34 (team 1 spearmen), t1500–t1700:
- the anchor moves from (1505, 901) to (1841, 1312) while the goal is (933–955, 926–1139);
- the anchor jumps 114 u/s at t1550;
- 25 men are more than 4 spacings from their slot for over 10 s (straggler).

Across all runs, spread-block was flagged 160 times in 22 of 24 matrix battles, and 375 times in 64
of 72 pairings. Most were line foot in rally, advance or brace.

**Evidence.**
- `shots/s4-1200-L34-snowball-t1560.jpg`: a lone standard in empty field, its men 100 u away.
- `shots/s4-1200-L34-snowball-t1620.jpg`: the block marching to its own rear, standard ahead, chasing
  two lone men.
- `data/trace-s4-1200-L34.txt`.
- Run it with `npx tsx scripts/qa/members.ts 4 1200 34 1500 1640`.

**Why no real soldier would.** A rallied company forms on its colours. It doesn't send its colours
off over empty ground, and it doesn't turn its back on the enemy to march half a field toward a
couple of fugitives.

**Likely cause.** In `src/game/battle.ts`:
- `survey` (≈2725) takes `cx`, `cy` and `radius` over `state <= Routing`.
- `thinkRouted`'s rally (≈3164) leaves the far runners as members.
- `friendNear` (≈3411) uses `o.radius`.
- `fallIn` (≈3458) makes the man `Fighting` at once, far from his slot.
- The leash in `survey` follows all fighting men.

**Suggested fix.**
- Take `cx`, `cy` and `radius` (and the standard's position) from the `Fighting` members only.
- On a rally, drop the runners beyond `gather` from `members`, into the routed remnant or a fled list,
  so they can't drag the block.
- In `friendNear`, measure from the formation's half-diagonal, not `radius`.
- A man who falls in walks to his slot first (a `joining` flag) and doesn't count in the leash or the
  standard until he is within a few spacings of it.

## 2. Artillery kills its own men — High

**What happens.** Of every man a stone or a bombard ball hits:
- matrix: 23 % are friends (446 own v 1,502 foe);
- pairings: 31 % (1,371 v 3,040).

Engines fire at the biggest unengaged block within 1,100 u. That block is usually closing with, or
next to, our own line.

**Where and when.** Every battle with engines. Examples:
- s6/1200 sam-tem: 45 own-goal stones;
- s8/2800 tem-sam: 78;
- s6/2800: 52.

See `data/realism-audit-matrix.txt`, the ff-missile lines.

**Evidence.** The metric above, from `realism-audit.ts`, which wraps `missileHit`.

**Why no real crew would.** No crew drops 50 kg stones on its own front rank. Once the lines are
within a few dozen paces they stop, or lift fire to the enemy's rear.

**Likely cause.**
- `thinkSiege` (≈4632) checks only `o.engaged`, not whether our men stand near the target.
- In `shoot` (≈5963) a siege lob's spread is `2 + 0.05·dist + 0.04·(dist − range/2)`, about ±70 u at
  1,000 u, and the stone is several seconds in the air.
- In `land` (≈7075) a stone hits a friend inside its 9 u splash half the time.

**Suggested fix.**
- Danger close: skip a target when any friendly block's edge is within (spread + splash + 30) of the
  aim point.
- Prefer the enemy's second line or reserves once the first lines are within ~200 u.
- Tighten siege spread at long range, or let the crew walk its fire in: the first stone ranges, the
  next ones correct.

## 3. Crossbows and archers shoot their own men — High

**What happens.** Share of each class's hits that land on its own side (pairings):
- crossbows: 14.6 % (2,934 of 20,094);
- archers: 6 % (4,177 of 70,014);
- horse archers: 1.3 %; skirmishers: 0.2 %.

In the 2,800-men battles, 55–75 % of all own-goals land on friendly blocks locked in melee: shooting
into one's own melee. At 450 men the share is lower.

**Where and when.** Every battle. Highest:
- s7/2800 tem-tem: 214 crossbow and 223 archer own-hits;
- s1/2800 sam-tem: 305 archer own-hits, 309 of all own-goals into melee.

**Evidence.** ff-missile in `data/realism-audit-*.txt`. The first few cases of each battle are printed
with `--verbose`.

**Why no real shooter would.** A crossbowman whose line of sight is blocked by his own front rank
waits or moves aside. Archers lift fire off a melee where their own men are mixed in.

**Likely cause.**
- In `shoot` (≈6012), a flat shooter blocked by friends *lofts* the bolt at 4 times the spread.
- `shootable(..., over)` with `overMelee` lets lobbing shooters pick engaged blocks, and `pickRear`
  aims at their rear.
- But the scatter, about ±30 u at range, lands on our men pressed against that block.
- `land` gives a friend a `FRIENDLY_FIRE` (25 %) chance.

**Suggested fix.**
- A blocked crossbow holds, as guns already do, or `sidestep`s.
- Shoot over a melee only when the aim point is more than 2 spreads beyond our nearest man.
- Otherwise switch to an unengaged target or hold.

## 4. The Lich-Marshal throws himself away — High

**What happens.** Over 36 battles per faction (`scripts/qa/generals.ts`, seeds 1–3, 450 and 1,200, all
pairings):

| General | Falls | Falls before the army breaks | Time in melee |
|---|---|---|---|
| Lich | 36 % | 31 % | 7.7 % |
| Templar | 3 % | 3 % | 3.9 % |
| Samurai | 3 % | 3 % | 3.2 % |

In the cases traced:
- He dies 70–440 u *ahead* of his own line's front.
- He is in `melee` with whole line blocks and knights.
- His household is down to 1–3 riders for the last 10 s or more.

For example, s1/450 und-tem: 432 u ahead, against line19, knights32 and horse archers31. s4/450
und-sam: 320–333 u ahead, alone for 11 s.

**Evidence.** `data/generals.txt`, `data/lich-deaths.txt` and `shots/s3-2800-general.jpg` (the Lich's
black horses between two skeleton blocks).

**Why no real commander would.** A lord whose power depends on him living (the host crumbles when he
falls) keeps behind his line. Down to his last riders, he gets out.

**Likely cause.**
- `thinkCommand` (≈4648) fights whatever is within `reach`.
- The `HOUSEHOLD_ODDS` draw-back needs `ts.hasLine`. The undead "line" thins out, or rather crumbles,
  and `hasLine` goes false, or `frontX` falls back behind him.
- The household is fearless, so it never breaks off.
- `raise` (≈1745) needs him within `raiseRange` of the fallen. Nothing keeps him there from *behind*.

**Suggested fix.**
- The household draws back when it is down to a third of its men, whatever `hasLine` says, and after
  any 10 s melee.
- Give the Lich a "stand behind the thickest fighting, at 150–250 u" goal, which is inside the raise
  range.
- Never let him be the most forward undead unit.

## 5. Spent skirmishers shuttle out for a javelin or two — Medium-high

**What happens.** A skirmisher block with no javelins left goes behind the line (`reserve`). Then it
takes in a fugitive or two who still carry javelins (`fallIn`), so `ammoLeft` reads 1 or 2. It marches
out again 100–150 u in front of its own line, throws them, and runs back. Its reserve home also follows
`ts.frontX`, which jumps (see 6), so it drifts back and forth.

**Where and when.** s1/450 S6 (team 0 skirmishers):

| Tick | What happens |
|---|---|
| t455–t530 | runs back (`skirmish`), ammo 0 |
| t605 | ammo 1, back to `advance` |
| t635 | `shoot`, 2 javelins |
| t650–710 | runs back again |

Oscillation flagged skirmishers 302 times in 24 battles: 267 in `reserve`, the rest in `skirmish` and
`advance`.

**Evidence.** `data/trace-s1-450-S6-skirm.txt`.

**Why no real skirmisher would.** Nobody walks out in front of the battle line for one javelin.
Skirmishers out of missiles stay back, or guard a flank.

**Likely cause.** `thinkSkirmish` (≈4166): `retired && r.mode === 'reserve' && r.ammoLeft > 0 && ...`
sends it out again with any ammunition at all. `home = ts.frontX − dir·(lineDepth + 70)` is recomputed
every think.

**Suggested fix.**
- Go out again only with at least 1.5 javelins a man.
- Put a 30 u deadband on `home`.
- A spent block becomes a flank guard: it holds behind the end of the line.

## 6. The general's household jigs behind the line, often riding backwards — Medium

**What happens.** In `guard` the general's goal is `ts.frontX − dir·(lineDepth + 55)`. `frontX` is the
men-weighted mean x of the first-line anchors. It jumps tens of units whenever a block is committed,
charges, routs or is pulled out. The household follows every jump. Because horse "backs at a walk", it
spends long spells riding backwards at 10–22 u/s.

**Where and when.** s1/450 G18:
- from t650 to t720, `frontX` goes 1063 → 1034 → 977 → 1009;
- the goal swings from 978 to 872 and back to 903.

Across the matrix, 140 oscillate flags and 78 backwards flags were generals in `guard`.

**Evidence.** `data/trace-s1-450-G18-general.txt`.

**Why no real general would.** A general sits his horse on a rise and watches. He doesn't trot ten
paces forward and back every few seconds.

**Likely cause.** `updateFront` (≈1948) has no smoothing, and `thinkCommand` (≈4683) has no deadband.
Skirmisher homes (5) and missile blocks' "keep behind the line" goal in `thinkMissile` (≈3775) inherit
the same jitter. Also, the household's own men seek foes with an unlimited leash (`seek` ≈5629:
`r.role === 'command' … ? 1e9`). On v16 that dragged a Templar general 240 u ahead of his line to
chase fugitives (s1/450 G35 t1060–1140). On v17 general-front is still flagged 16 times in 24 battles.

**Suggested fix.**
- Smooth `frontX` (an exponential average over ~3 s) for followers.
- Move the general only when his goal is more than 30 u off, and turn the horse to ride rather than
  back.
- Give the household a leash of ~40 u around its standard, except when the army is broken.

## 7. Artillery crews pinned against the back edge of the field — Medium

**What happens.** At 2,800 men the engines deploy (`deploy`, ≈1439: `behind + secondDepth +
SIEGE_BEHIND`) at, or are clamped to, x ≈ 4–10 (team 0) or 2391–2396 (team 1). They stay there all
battle, shooting from the map's edge with no one near them.

**Where and when.** edge-stuck was flagged 78 times, every one an artillery crew. For example,
s1/2800 A73–A77 from t930 to t2250, and s2/2800 A34–A36 from t485 on. `shots/s1-1200-engines.jpg`
shows two engines alone on empty ground at x ≈ 48.

**Why it looks wrong.** Engines sat behind the line, not at the edge of the world. In Total War, the
artillery is placed just behind the infantry.

**Suggested fix.**
- Place engines between the first and second line, or at most ~150 u behind the second.
- Clamp them to at least 80 u from the edge.
- With nothing in range, they advance.

## 8. Men drawn with their back to the nearest enemy — Medium

**What happens.** 3.0–3.1 % of samples of standing men with an enemy within 14 u draw the man facing
away from that enemy. The facing was computed as the renderer computes it (`pose.ts facing`, at the
quadrant level of `iso.dirFor`). The breakdown, as a share of man-samples near a foe:

| Case | Share |
|---|---|
| Line man facing his target while a nearer enemy stands at his back (flanker, or a man who got past) | 1.35 % |
| Line men in a melee block walking over 3 u/s back to their slot or a gap; the drawn facing follows the velocity | 0.69 % |
| Line men without a target facing the block's front while an enemy stands behind | 0.37 % |
| Knights and light horse withdrawing past enemy riders | 0.12 % |

**Evidence.** `data/realism-audit-matrix.txt`: the face-away lines and the per-battle face-away %.

**Why a real soldier wouldn't.** A man with an enemy at arm's length behind him turns, or at least
steps back facing him.

**Likely cause.** `src/client/render/pose.ts` `facing`: velocity wins whenever `speed > 3` and he isn't
engaged with his own target. In the sim, `seek` (≈5608) keeps the current target and doesn't re-target
a nearer man at the back for 6 ticks, and then with the 1.7× penalty for foes behind.

**Suggested fix.**
- In the renderer, a fighting man with any enemy within reach + 4 faces that enemy while he walks
  under his run speed: walking backwards or sidestepping in guard.
- In the sim, a foe in contact behind a man is not penalised.
- Note: the `cc/render-facing` branch is working in this area.

## 9. Templar heavy foot in HD: oversized, flat white sheets — Medium (rendering)

**What happens.** In HD, at zoom 4 in melee, the Templar heavy infantry are drawn as big pale cloaked
shapes with almost no shading or detail. They are about one and a half times the height of the samurai
they fight, and read as ghosts or tents rather than armoured men.

**Where and when.** seed 1, 1,200 men, t804, zoom 4, (1234, 1021): `shots/hd-s1-1200-melee-t804.jpg`,
lower left; enlarged in `shots/crop-white.jpg`.

**Why it looks wrong.** In the period sources (and Medieval II's Templars) the white surcoat is worn
over mail. Arms, helm and shield break up the silhouette, and men of both armies are the same size.

**Suggested fix.**
- Bring the Templar heavy-foot HD figure to the samurai's height.
- Shade the surcoat: folds, belt, the cross.
- Show mail at the arms and the great helm.
- Note: the `cc/templar-art` branch is in progress here.

## 10. The same opening in every battle — Medium

**What happens.** In all 24 matrix battles, whatever the plan ("holds his ground and lets the archers
work" included), the first contact is the two light-horse wings charging each other. It comes at tick
176–183 (17.6–18.3 s). On v16 it was 11 s, every battle.

**Evidence.** `data/first-contact.txt` (`scripts/qa/first-contact.ts`) and `shots/s1-1200-cav-clash-2.jpg`.

**Why it feels wrong.** Real and Total War openings vary. Horse is held back against a strong enemy
horse, or sent round, or used to screen the archers. Twenty-four identical openings read as a script.

**Likely cause.** `cavalryOrders` (≈2390) sends light horse straight at the enemy's horse on the same
wing from tick 0, with no plan- or odds-dependent wait.

**Suggested fix.**
- Let the plan and the odds decide. With fewer or weaker horse, hold behind the wing and screen.
- With archers, wait until the foot is engaged.
- Give each general's skill or personality a random delay of 0–40 s.

## 11. Archers standing inside their own second line — Medium-low

**What happens.** A missile block in `shoot` deploys its 104 u-wide loose line over a reserve line
block.

**Where and when.** s7/450 t380: archers 25 (1720, 1033, width 104) inside line 22 (1734, 1090, width
55). Over 16 grand-battle runs the crossing detector still shows missile x missile overlap (48 samples)
and command x missile (8).

**Evidence.** `shots/s7-450-archers-shooting.jpg`: two blocks drawn into one.

**Why no real archers would.** They shoot from in front of, or beside, the second line, never from
inside its ranks.

**Likely cause.** `thinkMissile` (≈3775) "keep behind the line" goal (`frontX − lineDepth −
MISSILE_BEHIND`, `homeY`) doesn't check where the second line stands. `blocked()` is only used for
reserves.

**Suggested fix.** Test the firing spot against friendly block footprints and shift it along the line
to a free spot, as the v17 "archers' own spot" work does for missile against missile.

## 12. Anchors and standards lurch faster than men can run — Medium-low

**What happens.** A formed block's anchor moved more than twice its men's top speed within half a
second 1,014 times in 24 battles. Spearmen in `brace`, heavy foot in `advance` and `hold`, and missile
blocks in `shoot` lead the list. The men then run to catch their slots, and the standard
(which follows the block centre) slides.

**Likely cause.** The anchor leash in `survey` (≈2725) snaps the anchor to within 1.5 u (engaged) or
8 u (`hold`) of the men's implied anchor. The slot offsets of the fighting men shift when men fall and
files close up.

**Suggested fix.** Move the anchor toward the leash point at no more than the block's pace, not in one
step.

## 13. Loaded shooters silent with a target in range — Medium-low

**What happens.** battle-sanity's missile-idle measures loaded shooters whose block is neither routed
nor in melee, with an enemy block in range, that haven't loosed for twice their reload plus 3 s.
- It is 15 % of such samples over the 24 battles; from 2.7 % (s2/450) to 30 % (s6/1200).
- 19 crossbow blocks and 11 archer blocks ended the battle in `advance` with over half their bolts
  unfired.

**Likely cause.**
- `shootable` skips engaged blocks unless lobbing.
- Flat shooters with friends in the way hold (`blockedShots`).
- `thinkMissile` waits `MISSILE_SEEK` before moving to a new spot.

**Suggested fix.** After a few blocked volleys, `sidestep` or move up to a flank to find a clear line.

## 14. Knights idle at the back of a melee; riders left behind — Low-medium

**What happens.**
- 6.8 % of riders spent over 2 s standing still with an enemy within 40 u and no foe in reach (708
  rider-seconds). That is 13.5 % at s7/2800. Most were shock cavalry in `melee`, packed behind their
  own front riders.
- When horse breaks off, riders were left in contact under half speed for 659 rider-seconds over 137
  withdrawals, about 4.8 s each.

**Evidence.** `data/cavalry-sanity.txt` (run with `--why`).

**Suggested fix.**
- Riders with no foe in reach for 2 s ride round to a free flank man, or the block pulls out to
  recharge sooner.
- On a withdrawal, riders still in contact disengage first.

## 15. Undead crowds hard to read — Low-medium (rendering)

In classic art at zoom 3–4, the bone-coloured corpses and broken skeletons have the same palette and
size as standing skeletons (`shots/s3-2800-general.jpg`). A player can't tell where the undead line
holds. Total War keeps corpses darker and flatter than the living.

**Suggested fix.** Darken and desaturate the fallen undead and flatten their silhouette.

## 16. Routers' odd paths — Low

- 1.2–1.6 % of router samples are running toward the enemy's edge; 0.5–0.6 % are running toward an
  enemy within 10 u.
- 12 (matrix) and 17 (pairs) light horse fled off the *enemy's* edge, after a flank ride took them
  behind the enemy.

Cause: `fleeFrom` blends away from the nearest enemy with own edge, and `thinkRouted`'s random veer.
When the nearest enemy is between them and home, the blend points sideways or forward.

**Suggested fix.** Steer around the enemy block rather than through it: pick the side with the larger
gap.

## 17. HD first load and camera — Low (rendering)

- On first load in HD the armies are missing for 1–3 s (v16: one whole army absent in the first frame).
  Then they show as dark silhouettes until the sheets paint. See `shots/hd-s1-1200-deploy-t5.jpg`,
  5.7 s after load.
- On the 2400-wide field the minimum zoom can't frame both armies, so the opening sweep of the whole
  line, which Total War is known for, isn't possible.
- Note: `cc/hd-load` is in progress.

---

## Notes and limits

- The audit's thresholds are listed in `scripts/qa/realism-audit.ts`. Its face-away rule copies the
  renderer's rule approximately: the "acting" window is 6 ticks, not the real animation length.
- Rendering was judged mostly in classic art, because HD sheets take 30–40 s to paint headless. HD was
  spot-checked at deployment and in melee.
- `pnpm typecheck` passes with the new scripts.

## Re-running

```
npx tsx scripts/qa/realism-audit.ts [--pairs] [--seeds 1,2,…] [--sizes 450,1200,2800] [--json out.json] [--verbose]
npx tsx scripts/qa/generals.ts
npx tsx scripts/qa/first-contact.ts
npx tsx scripts/qa/lich-deaths.ts
npx tsx scripts/qa/enemy-overlap.ts
npx tsx scripts/qa/trace-block.ts <seed> <men> <reg> [from] [to]
npx tsx scripts/qa/members.ts <seed> <men> <reg> <from> <to>
npx vite --port 5220 --strictPort &
node scripts/qa/battle-shots.cjs <outdir> <seed> <men> classic|hd
node scripts/qa/still.cjs <out.png> "seed=…&men=…&t=…&zoom=…&cx=…&cy=…&art=hd"
```
