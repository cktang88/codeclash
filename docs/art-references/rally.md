# Rally, re-forming and fugitives falling in (battle v10)

How the sim lets a broken regiment come back, and lets fugitives join another regiment. The
history behind the numbers is in [rout-recovery.md](rout-recovery.md) (a fuller research note,
with its own "Game rules suggested"); this page records the brief extra reading done for the
mechanism, how the research's rules and metres became game rules and world units, and what the
rules do in play. The constants are `REGROUP` in `src/game/command.ts`; the code is
`thinkRouted`, `rallyOdds`, `regroup` and `fallIn` in `src/game/battle.ts`.

## Extra references read for the mechanism

| Source | Licence | What was taken |
| --- | --- | --- |
| Bret Devereaux, "Total Generalship, Part IIIc: Morale and Cohesion", https://acoup.blog/2022/07/01/collections-total-generalship-commanding-pre-modern-armies-part-iiic-morale-and-cohesion/ | Article, read only | Cohesion can fail while morale holds: an army that ran can reform (First Bull Run). A visible leader restores order (William at Hastings, helmet off). Where the lord falls, retinues dissolve (the fyrd melts away; Cunaxa). So: the commander is the strongest anchor, and his death a lasting blow. |
| Total War: Rome II encyclopaedia, morale page, https://r2enc.totalwar.com/en/manual/single-player/0087_enc_page_battle_play_phase_conflict_morale | Game manual, read only | The genre's model: routing units may rally once a safe distance from the enemy; the general's presence helps; shattered units never come back; the general's death shatters. Our "out of contact" test and "a second rout is final" follow it. |
| Total War: Warhammer wiki, "Break", https://totalwarwarhammer.gamepedia.com/Break | Wiki, read only | Broken vs shattered as separate states; a broken unit that gets clear of the enemy may rally and take orders again. |
| Heraldry Society, "Badges and standards", https://theheraldrysociety.com/articles/badges-and-standards ; Wikipedia, "Royal standards of England", https://en.wikipedia.org/wiki/Royal_standards_of_England | Articles, read only | The standard was where a lord's retainers gathered after a charge to re-form, and where they made their last stand. So the regiment's own standard (its men still together about it) is an anchor, and a lost standard a malus. |
| Slitherine forum on Bouvines (cavalry rallying behind the infantry), via search https://forum.slitherine.com/viewtopic.php?p=63530 | Forum, read only | Infantry as the wall behind which horse rallies: a formed reserve near is an anchor. |
| Battlefield Trust, Bannockburn report, https://www.battlefieldstrust.com/media/596.pdf | Report, read only | A reserve under Bruce; feigned or real flight under the trees. Background only. |

No images were used: this is a rules change, not art. The screenshots in
`docs/screenshots/rally/` show the result in the battle view.

## From the research to the rules

| Research (rout-recovery.md section 8) | Game rule (REGROUP) |
| --- | --- |
| Rally check every 5 to 10 s | Every 2 s (`check: 20` ticks). Our battles last 1 to 3 minutes where the real ones lasted hours, and fugitives cross the field in under a minute, so the window is compressed. At 7.5 s almost nothing rallied (1 to 2% of fugitives). |
| Base odds: elite 0.35, veterans 0.20, trained spears 0.15, levies and missile men 0.05 | `odds` by class: knights 0.35; light horse, horse archers and shock foot 0.20; heavy foot and spears 0.15; skirmishers, archers, crossbows 0.05; engines 0. A veteran regiment (or man) is at least 0.20, plus 0.05. +0.01 per point of the city's morale bonus. |
| +0.20 commander in person, +0.15 own standard alive, +0.10 reserve near, -0.20 enemy cavalry close, -0.15 commander dead, -0.15 standard lost | The same, as `commander`, `standard`, `reserve`, `enemyHorse`, `commanderDead`, `standardLost`. The standard "stands" while at least 30% of the regiment's start (and 6 men) are within 110 of its centre: there is no standard-bearer figure, so the men holding together about it stand for it. |
| Preconditions: out of contact (no enemy within about 100 m) and an anchor (standard, commander within about 150 m, reserve within about 300 m) | Out of contact: no unrouted enemy block within 90 of its edge for 4 s (unchanged from v8). Anchors: standard 110 < commander 160 < reserve 240 world units. |
| No second rally after a second rout | `rallies: 1` for everyone (v8 gave veterans and high-morale cities two). `extra: 0`: the "re-form behind the line at lower odds" path exists but is off; set `extra: 1` to allow it ('reform' event). |
| Rallied: shaken 30 to 60 s, -25% attack and morale, cannot charge a fresh unit | `shaken: 400` ticks (40 s) in the 'rallying' state, which fights as wavering (-6 attack, -4 defence), may balk at orders to go forward, comes back at morale 35. Strength is only the men who stopped: stragglers more than 160 from the centre run on. |
| Joining another unit: same class, same army, within about 150 m, half odds, never across classes | `regroup`: same class (`sameClass`), within 120 of the taking regiment's edge (`reach`), at `joinOdds` 0.5 of the man's own rally odds, spread over his looks (one every 0.5 s, so 0.5 x odds / 4 per look). The taker must be steady, not engaged, formed (hold, advance, reserve, guard, shoot, brace) and short of its starting strength. Less likely with an enemy within 40 of him (x0.25), badly hurt (x0.5) or from a shattered regiment (x0.5). Never foot with horse. |
| Templar Beauséant rule: rally to any friendly banner (+0.20 within about 200 m) | Templars get +0.20 with any friendly standard within 200 (`templarBanner`, `banner`), which is also an anchor, and their fugitives may join any regiment of their family (heavy foot with spears, archers with crossbows, knights with turcopoles). |
| Samurai: +0.20 near the lord's uma-jirushi | +0.20 on top of the commander's +0.20 (`samuraiLord`). |
| Undead: hold or crumble | Undead never rally and never join: a broken undead regiment is shattered at once. |
| Pursuers carried away, counter-stroke on them | Not added: the existing chase and recall code (`chase`, v7) already has pursuers break ranks and get called back; a rallied unit hitting pursuers is left to the General's ordinary orders. |

Metres to world units: at the formation scale (`formations.md`: files about 5.3 units for a man
about 1 m wide) 150 m would be 750 units, half the field. The research's radii are therefore
compressed to about a unit a metre for the short ones (out of contact 100 m -> 90, standard
-> 110, commander 150 m -> 160, joining 150 m -> 120) and less for the long one (reserve
300 m -> 240), keeping their order.

## What it does in play

Measured with a scratch script over mirror battles (500 a side, moraleBonus 3, one army 30%
veterans, 6 seeds each), counting every figure that ever ran, including the mass rout when an
army breaks (which can never rally):

| Faction, men a side (seeds) | Figures that ran | Back by rallying | Joined another regiment | Rallies a battle | 'joins' lines a battle |
| --- | --- | --- | --- | --- | --- |
| Templar, 500 (12) | 4,589 | 5.6% | 1.7% | 1.6 | 3.7 |
| Templar, 1000 (6) | 4,756 | 1.8% | 1.0% | 1.0 | 5.5 |
| Samurai, 500 (12) | 4,479 | 5.6% | 0.3% | 1.5 | 0.9 |
| Samurai, 1000 (6) | 4,525 | 2.7% | 0.8% | 1.2 | 3.3 |
| Undead, 500 (6) | 2,267 | 0 | 0 | 0 | 0 |

So 3 to 7% of all fugitives come back, at the low end of the research's 5 to 15% (and a good
share of "ran" is the final collapse, when nothing can rally). Templars join others far more
than samurai because the Beauséant rule lets them join any regiment of their family. v8 rallied
5 to 15 regiments a battle (`pnpm bench`); v10 rallies 0 to 5 and a few to a few dozen men fall
in with other regiments. Mirror fairness (`pnpm fairness`): 50.5% at 250 a side and 48.5% at 120
(v8: 51.0% and 42.0%). Sim speed is unchanged within noise (`pnpm bench`: 0.18 to 1.15 ms a step
from 250 to 2,800 men, as before).

## Screenshots

`docs/screenshots/rally/`, from the /demo battle in probe mode (HD art), stepped to the moment a
regiment has taken in several fugitives within 3 s:

- `skirmishers-fall-in-0.jpg`, `-1.jpg` (1.8 s later) and `-schematic.png`: a samurai skirmisher
  column that has taken in four men of a broken skirmisher company; the schematic shows the sim
  (dark blue its own men, gold the men who fell in, now in its files or walking to them, hollow
  the still running).
- `line-fall-in.jpg` and `-schematic.png`: Templar shock foot taking in fugitive sergeants (the
  Beauséant rule); two of them are still walking back through a neighbouring block.
- `ticker.jpg`: the ticker line "Fugitives of Castle Pilgrim's javelin men fall in with the archers".

## Shortcomings

- A man falls in up to 120 units from the regiment's edge and then walks to the back of its files,
  sometimes through another block; at 60 to 90 it reads better on screen but joining all but
  stops, and a small balance test (horse against bows) tips by one seed.
- There is no standard-bearer figure: "the standard stands" means enough of the regiment is still
  together about its centre.
- Pursuers carried away and the counter-stroke on them (rout-recovery.md 8.7) are not modelled
  beyond the existing chase and recall.
- 'joins' lines are throttled to one per regiment every 15 s, carrying the count since the last
  one; men taken in after the last line of a battle are not told.
