> Status: items #1, #2, #4 (production boon only), #5 (points and honourable defeat) and #7 are implemented on `city-wars`. The rest is the roadmap.

# Code Clash: design review and proposal (branch `city-wars`)

Numbers below came from throwaway simulation scripts (not kept in the repo):
`econ.ts` (current economy), `city2.ts` + `econ2.ts` (prototype of the proposed economy; a copy of `src/game/city.ts` with a parameter block `P`), `odds.ts`/`odds2.ts`/`odds3.ts` (battle win-rate probes against the real `fight()`).

---

## 0. Verdict in one paragraph

The skeleton matches the vision well: a weekly city, hourly training, daily 1v1 cohorts, a Grand Battle of everything trained, a weekly raze, Swiss pairing, and ten Rome-style classes. Two problems undermine it. **(1) The economy rewards working early in the week, not every day.** One 3,500-line Monday produces 89% of the army of seven 500-line days. **(2) Battles have no variance.** A 10% bigger army wins 8 of 8 at both 300 and 1,500 men, and every matchup I probed went 8/8 or 0/8 across seeds. So the daily result is known before it is fought, and the +6%-per-win boon plus veterans snowballs that certainty. Fix those two first. Everything else (leaders, factions, drama) is layered on top.

---

## 1. Measurements of the current build

### 1.1 Economy (synthetic pushes: 3 per day at 10:00/13:00/16:00, the `game.test.ts` mix; army = men produced in the week)

| Scenario | Daily cohorts (men) | Week | vs steady 500 |
|---|---|---|---|
| steady 500/day | 141 237 291 353 405 449 494 | 2370 | 100% |
| steady 250/day | 71 … 321 | 1496 | 63% |
| steady 1000/day (2x) | 259 … 755 | 3837 | 162% |
| steady 2000/day (4x) | 468 … 1197 | 6213 | **262%** |
| weekdays only, 700 x 5 | … 357 216 | 2392 | **101%** |
| weekend only, 1750 x 2 | 0 0 0 0 0 425 629 | 1054 | 44% |
| cram 3500 on day 0 | 772 334 201 202 200 203 201 | 2113 | **89%** |
| cram 3500 on day 6 | 0 … 772 | 772 | 33% |
| alternate 1000/0 | | 2298 | **97%** |
| join day 3, 875/day | | 1556 | 66% |
| same work pushed at night (21:00+) | 31 214 … | 2138 | 90% (time-of-day penalty) |
| steady 500 with 7 daily wins | | 2736 | +15% |

Diagnosis:
- **Consistency is barely rewarded.** Building XP never decays and buildings train 24/7, so levels bought on Monday pay all week. Idle half pace (`IDLE_PACE`) is the only penalty, and it costs little because it halves a small base. Alternating days scores 97%.
- **Volume is nearly linear at the top**: 4x the work gives 2.6x the army. With AI-assisted coding, 2,000-line days are cheap. The only brake is `CODE_KNEE = 4000` in `credit.ts`.
- **Time of day matters**: pushing at 21:00 instead of 10:00 costs ~10%, which penalises timezones and night owls.
- The levy is about 23% of a steady player's week; fine.

### 1.2 Battles (real `fight()`, standard mix)

| Probe | Result |
|---|---|
| Equal armies, 300 and 1,500 | 3/8 and 5/8 (fair) |
| **10% bigger army** | **8/8 at 300, 8/8 at 1,500** |
| 25% / 50% bigger | 8/8; battle lasts 35–57 s |
| Smaller side given +6..+83 morale, stakes and pavise | still loses 10/10 |
| All-veteran side vs 10% more men | veterans win 8/8 |
| Veterans vs 25% more men | veterans lose 0/8 |
| Cavalry-heavy vs standard, equal *men* | cav 8/8; at equal *value*, cav 0/8 (value weights are fine) |

Diagnosis: the sim follows Lanchester's square law with almost no seed variance, and morale cannot overturn attrition. Lopsided battles end in 35–55 s, which is too short to be dramatic. Equal ones run 140–213 s, which is good.

### 1.3 Bots
`botWork` personas credit **13k–27k code lines a week** (2–4k a day) and produce 5.7k–10.5k men, versus 2.4k for a steady 500-line human. In a small league a normal developer loses to every bot.

---

## 2. Top changes, in priority order

### #1 Daily fatigue knee on XP and levy (anti-cram, anti-firehose)
*Touches: `city.ts` `cityAt` event loop (where `xp[bi]` and `men` are computed).*

For each push, scale positive XP gains and the levy by the marginal factor of a per-day knee on credited code:
```
kf(x) = min(x, 1000) + 0.3 * max(0, x - 1000)          // DAY_KNEE = 1000, DAY_OVER = 0.3
m = d.code > 0 ? (kf(after.code) - kf(before.code)) / d.code
              : (before.code >= 1000 ? 0.3 : 1)
gain' = gain * q * m ;  levy' = levy * q * m
```
New constants `DAY_KNEE = 1000`, `DAY_OVER = 0.3` next to `LEVY`. Up to 2x a normal day is untouched; beyond that each line is worth 30%. This sits *under* the existing 4000/8000 knee in `credit.ts`, which stays as the anti-abuse ceiling.

### #2 Streak replaces the Granary's active-day XP; the idle rule becomes a per-day muster
*Touches: `cityAt` `pace`, `train`, `closeDay`; `BUILDINGS.granary`; `ACTIVE_DAY_XP`, `IDLE_PACE`, `GRANARY_PER_LEVEL`.*

- **Fields (Granary) level = current streak** of active days (≥ `ACTIVE_DAY_LINES`, raise to **50**), 0–7. Production is multiplied by `1 + 0.10 * max(0, streak - 1)`, so +60% on day 7. Drop the `ACTIVE_DAY_XP` and config feed, so config goes only to the Walls.
- **Grace day:** the first missed day each week does not break the streak; that day simply does not increment it. Each further miss **halves** the streak (floor), never zeroes it. This avoids the "lost my 40-day streak, quit" cliff that Duolingo had to patch with Streak Freeze and that GitHub's own streak produced (see §9).
- **Muster, not the idle timer:** remove the "24 h since last push, then half pace" rule. A day's garrison is counted in full if the lord pushed at least 50 credited lines that day (`ACTIVE_DAY_LINES`, any time before the battle); otherwise it is counted at **0.4**. The UI shows "Men waiting to muster: N, push today to call them all".
- **End-of-day rate:** a day's garrison = `24 h × rate at the moment of the battle` (levels as of the battle). This removes the time-of-day bias and is fair across timezones.

**Prototype result (changes #1 and #2, boon as in #4):**

| Scenario | Week | vs steady | (current) |
|---|---|---|---|
| steady 500 | 3028 | 100% | 100% |
| steady 250 | 1965 | 65% | 63% |
| 2x volume | 4801 | **159%** | 162% |
| 4x volume | 5616 | **185%** | 262% |
| weekdays 700 x 5 | 2633 | **87%** | 101% |
| weekend only | 933 | **31%** | 44% |
| cram day 0 | 1114 | **37%** | 89% |
| cram day 6 | 528 | 17% | 33% |
| alternate 1000/0 | 2331 | **77%** | 97% |
| join day 3 | 1865 | 62% | 66% |
| 7 daily wins | +13% | | +15% |

Volume still wins clearly (2x volume → 1.6x army). Consistency now matters (cramming → 0.37x). Weekend rest costs 13%, not 50%. A 4x firehose is capped near 1.85x. Daily cohorts grow 207 → 685 through the week, so mid-week battles favour whoever kept the streak.

### #3 Give battles a variance layer: "Fortunes of War"
*Touches: `battle.ts` (`BattleSetup` gets `fortunes`, applied in deployment and per-tick); `league.ts` `battleSetup`; `BATTLE_VERSION` → 2.*

Morale tweaks cannot move outcomes (§1.2), so variance must change effective strength. Before each battle, draw from the seed and show the results on the pre-battle card:
- **Ground** (always one): *Hill* (one side: +12% melee attack/defence and +15% missile range for its line), *Ford* (attacker's line −15% speed and defence while crossing), *Forest flank* (that wing's cavalry −30% charge), *Open plain* (none). Assign the favourable ground to the **smaller army 60% of the time** (the defender picks the field).
- **Weather** (50% chance): *Rain* (missile damage −30%, crossbows reload +25%), *Fog* (all ranges −40% for the first 45 s), *Heat* (heavy armour classes lose morale 0.03/tick while engaged).
- **Camp events** (each side, independent 35% chance): *Fever* (−6% men), *Late arrivals* (10% of the army arrives on a flank at t=45 s), *Rousing sermon* (+8 morale), *Scouts* (cavalry deploys on the enemy's weaker wing).

**Target curve**, enforced by a new `game.test.ts` case with 40 seeds: P(bigger wins) = **55–75% at 1.1x, 72–88% at 1.25x, ≥ 90% at 1.5x, ≥ 98% at 2x**. That is `P ≈ Φ(ln r / 0.25)`, which equals an effective-strength σ of ~0.18 per side. Tune the effect magnitudes until the curve holds. Over a week of 7 dailies plus the Grand, the steadier, bigger producer still wins the league most of the time, but any single night can be an upset. That uncertainty is what makes people watch.

### #4 Daily boon: smaller, capped, no stat snowball
*Touches: `WIN_BOON`, `pace` in `cityAt`; veteran multipliers in `battle.ts` (`vet ? 1.1 : 1` in ~5 places); `grandArmy`.*

- **Spoils:** +5% production per daily win, **capped at 4 wins** (+20%). Measured effect over a week: +13%.
- **Veterans:** stats +10% → **+6%** (hp, attack, defence, missile damage) and +4 regiment morale (was +6). In `grandArmy`, cap veterans at **25% of the Grand army**. Today a veteran army beats 10% more men 8/8, which is too strong a reward for a "small but decent boost".
- **Honours (cosmetic):** the winner's banner gains a battle honour for the week; this matters for the chronicle and the profile.

### #5 Keep losers engaged: Rally, Honourable Defeat, Deeds
*Touches: `league.ts` (`DAILY_POINTS`, `Standing`), `server/leagues.ts` `standings`/`fightDaily`, `cityAt` levy.*

- **Points:** win **3**, *honourable defeat* **1** (inflicted ≥ 60% of own dead, or still held the field at time-out), rout **0**; Grand win **+6** (more than one daily win, so the week can still be turned on the last night). Tiebreak: total produced.
- **Rally (TFT loss-streak analog):** after **2+ consecutive daily losses**, the next day's levy ×1.25 and that side gets one Fortune reroll. Like TFT, it starts at a streak of 2, is modest, and only applies while you keep pushing (the levy is 0 without work), so it rewards coming back rather than tanking.
- **Swiss pairing stays** (losers meet losers). Add: never pair two players whose day cohorts differ by more than **2x** while another pairing within 1.5x exists. Fall back to brigands scaled to the player's own cohort (`brigands` already does 0.8–1.05x).
- **Deeds:** three personal weekly objectives that do not depend on opponents ("Muster 5 days", "Raise the Hospital to 4", "Win an honourable defeat"). They reward lifetime **Renown**, which is cosmetic and the only thing that survives the weekly raze (banner charges, titles, a hall of past weeks).

### #6 Leaders: the Commander (consistency) and three Bannermen (your repos)
*Touches: `ArmySpec` (add `leaders`), `battle.ts` deployment and command aura (radius 110 hard-coded), `cityAt` (per-repo XP from `WorkEvent.repo`), `factions.ts` titles.*

- **Commander = you.** *Resolve* = streak: the command aura radius is `90 + 10*streak` world units (today a flat 110), and the morale lift is 0.3/tick at streak ≥ 3. On Monday, pick **one of three traits** offered (the week's single strategic choice):
  - *Iron Discipline*: line regiments +8 morale, rout threshold 15 → 10.
  - *Hawk-Eyed*: missile range +10%.
  - *Reckless Valour*: knights charge +15%, but the commander fights in front (commander death −22 morale stays).
  - *Quartermaster*: +5% production.
  - *Old Fox*: the Fortune draw shows two Ground options and takes the better one.
- **Bannermen = your top 3 repositories of the week** by credited work, each with ≥ 2 active days (which rewards sticking with a project rather than spraying repos). Each gets a generated name ("Sir Autobattler of the Red Keep") and leads a wing: left, right, or reserve. His level is `levelOf(repo XP)`, capped at 10, and gives +1% attack and defence per level to his wing. His **trait comes from the repo's dominant work kind**: features → infantry +5% damage; tests → wing hp +5%; refactors → cavalry speed +5%; docs → wing morale +6.
- Their deeds go into the chronicle ("Sir Autobattler held the left until the knights broke"). This is the personal hook: *your* projects fight on the field.

### #7 Calibrate bots to humans
*Touches: `src/measure/bots.ts` `BOTS[].volume` (and/or `botRateAt`).*

Target a median bot at **~400 credited code lines/day**, with personas spread 200–900, and keep the one-day-in-six rest. That means roughly ×0.15–0.25 of today's `volume`. Add a `game.test.ts` check: every bot's week is within 0.5–2.5x the "steady 500" city.

### #8 Grand Battle and pacing (see §5 and §6)
Raise `MAX_FIGURES` to 1,800 and `MAX_TICKS` to 6,000 for `kind: 'grand'` only (the bench shows 1,918 figures fight in 1.4 s on the server). Use three-act pacing and a narrative event track.

---

## 3. Buildings and what feeds them (final list)

| Building (Templar name) | Fed by | Trains / effect | Change |
|---|---|---|---|
| Sergeants' Hall (barracks) | code + 0.5×bonus | heavy inf 0.6, spears 0.6 /h/level | keep |
| Archery Butts (range) | 3×complexity | archers 0.5, crossbows 0.3, skirmishers 0.4 | keep |
| Stables | removed + 10×files | light cav 0.25, horse archers 0.2 | keep |
| Siege Workshop | bonus + 4×functions | Iron Brethren (shock/"elephant") 0.1, mangonels 0.02 | keep |
| Chapter House | docs + comments | knights 0.15; morale +1.5/level | keep |
| **Fields** (granary) | **streak** | production +7%/streak day beyond the first | **change (#2)** |
| Hospital | tests | 40% + 2.5%/level of the daily dead return for the Grand (max 90%) | keep |
| Walls & Pavises | 0.6×tests + 0.3×config | pavise 2%/level (max 40%), stakes at level 3 | config only feeds here now |
| **Commandery (Keep)** | none (shows the Commander and Bannermen) | leaders, the trait choice | **new, UI only** |

The city stays automated. The player's only choices: faction and heraldry (once), a Commander trait (weekly), and optionally a **battle plan** (daily, default "as yesterday"): *Hold* (stay, let missiles work), *Advance* (today's doctrine), or *Hammer* (cavalry swings wide early). Each counters one other for +8% effective strength: Hold > Advance > Hammer > Hold. It is a light rock-paper-scissors layer that gives a reason to open the app before the battle without punishing people who don't.

---

## 4. Factions (mostly equivalent; asymmetry budget ±10% on 2–3 stats)

Balance rule: a new `game.test.ts` case pits each faction's standard-mix army against the Templars at equal *value*, 40 seeds, and requires 40–60% wins.

**Knights Templar** (shipped). Strengths: Knight-Brothers charge ×1.10, morale ×1.05; Sergeant-Brothers morale +5. Weaknesses: Pilgrim Archers missile damage ×0.95; Turcopoles speed ×0.95. Commander: Marshal of the Temple.

**Samurai (Sengoku clans).** Units, in class order: Katana Samurai, Yari Ashigaru, Kunai Shinobi, Yumi Ashigaru, Teppō Ashigaru (crossbow slot: pierce ×1.25, range ×0.85, reload ×1.15), Yari Cavalry, **Yabusame** (horse archers missile damage ×1.10), Hatamoto (heavy cav), Sōhei Naginata Monks (shock), Ōzutsu bombard. Strengths: horse archery, Samurai morale ×1.05. Weakness: Ashigaru armour ×0.85. Commander: Daimyō. Buildings: Dōjō, Kyūdō Range, Umaya, Forge, Temple, Rice Fields, Physician's House, Palisade.

**The Hollow Host (undead).** Units: Grave Guard, Bone Spears, Bone-Throwers, Skeleton Bowmen, Wight Arbalests, Black Riders, Banshee Riders, Death Knights, **Bone Colossus** (shock/elephant: mass ×1.3, terrifies, nearby enemies −0.1 morale/tick), Corpse Catapult. Signature asymmetry: **does not rout**. Instead, regiments under 15 morale *crumble* (lose 1% hp/s). If the Lich-Commander falls, the whole army crumbles at 2% hp/s. Weaknesses: missile damage ×0.90, speed ×0.92, and the Hospital is a *Charnel Pit* (same mechanic, renamed). The tone stays grim, not gory (PG-13).

**Ayyubid Sultanate** (optional fourth, the historical rival). Units: Halqa Guard, Ahdath Spearmen, Bedouin Javelins, Qaws Archers, Naffatun (naphtha throwers in the crossbow slot: splash 6, range ×0.6), Bedouin Riders, **Ghulam Horse Archers** (ammo ×1.2), Mamluk Lancers, Kurdish Champions, Trebuchet. Strengths: light cav and horse archer speed ×1.05. Weakness: heavy infantry armour ×0.9.

Implementation: `FactionId` union and `FACTIONS` record in `factions.ts`; tweaks stay multiplicative. The undead rout rule needs one branch in `battle.ts` (where `r.morale < 15` → `this.rout(r)`), gated on a faction flag `noRout`.

---

## 5. Weekly format

- Day 0 is Monday at the reset hour. Dailies run on days 0–6 at the league hour, and the **Grand Battle follows the day-6 daily by one hour** (separate time slot, so it is an event).
- **Seeding:** standings by points (§2 #5). **The Crown:** 1st vs 2nd. Others pair 3v4, 5v6, and so on ("the Field"). The Grand army is everything trained, minus unsaved dead, plus up to 25% veterans.
- **Gigantic:** at the measured economy, grand armies are 2k–5k men per side. Draw them at up to 1,800 figures per side with scale, and give the grand a 10-minute cap (`MAX_TICKS` 6,000).
- **Optional for leagues of 8+: Grand Melee of Banners.** A snake draft by rank (1,4,5,8 vs 2,3,6,7) makes two coalition hosts with each lord as a wing, scored individually by kills and held ground. Ship the 1v1 Crown first; this is the social follow-up.
- **The raze:** cities are wiped and boons reset. Renown, honours and the week's chronicle persist cosmetically.

---

## 6. Making battles dramatic to watch

- **Length targets:** daily **90–150 s**, Grand **3–5 min**. Fortunes (#3) prolong lopsided fights. Also add **deployment and a skirmish phase**: lines hold for 12 s while skirmishers and artillery exchange fire (today the 1.25x battles end at 35–57 s).
- **Three acts:**
  1. **Omens** (0–15 s): the pre-battle card (ground, weather, camp events, both banners and commanders), plus a champion's duel of bannermen (cosmetic, ±4 morale to the winner's side).
  2. **The clash** (first contact, cavalry flank): camera punch-in at contact and at the first charge impact.
  3. **The break**: rout cascade, the commander's last stand with his bodyguard, pursuit.
- **Narrative events** already emitted (`BattleEvent`: rout, commander, charge, contact). Add `fortune`, `reinforcements`, `last-stand` (the last regiment holding at < 20% strength) and `wavering` (morale < 30) so the viewer can show captions in a chronicle voice: "The Pilgrim Archers waver… the line holds."
- **Momentum bar** (army strength share over time) under the field. A visible reversal is the single most watchable thing.
- **Post-battle chronicle:** three sentences generated from events, plus the MVP regiment and bannerman.

---

## 7. Anti-gaming notes for coding metrics

- The daily knee (#1) plus the existing `CODE_KNEE`, filler detection and squash-equivalence make volume farming (including AI firehoses) sublinear: 4x lines → 1.85x army.
- The streak needs 50 credited code or removed lines, and the ledger already ignores copies and vendored or generated code. A 50-line daily habit *is* the behaviour we want, so allow it.
- Bannermen need ≥ 2 active days per repo, so splitting work over many throwaway repos gains nothing.
- Keep server-receipt time as the clock (already done), so backdated commits cannot rewrite battles.
- Wellbeing: the grace day and halving instead of reset keep the streak from punishing a weekend off. Weekend-only players are viable at 31% (and in a different Swiss bracket).

---

## 8. Implementation checklist (file → function)

| # | File | Function / constant | Change |
|---|---|---|---|
| 1 | `src/game/city.ts` | `cityAt` event loop | per-push marginal `m` from `DAY_KNEE=1000`, `DAY_OVER=0.3` on XP and levy |
| 2 | `src/game/city.ts` | `pace`, `train`, `closeDay`, `BUILDINGS.granary` | streak (grace 1, halve), muster 0.4, end-of-day rate, `ACTIVE_DAY_LINES=50`, `STREAK_STEP=0.10` |
| 3 | `src/game/battle.ts`, `league.ts` | `BattleSetup.fortunes`, deployment, `BATTLE_VERSION=2` | Fortunes of War; win-curve test |
| 4 | `src/game/city.ts`, `battle.ts` | `WIN_BOON=0.05`, cap 4; vet ×1.06; `grandArmy` vet cap 25% | |
| 5 | `src/game/league.ts`, `src/server/leagues.ts` | points 3/1/0, Grand 6; Rally; pairing ratio guard | |
| 6 | `battle.ts`, `city.ts`, `factions.ts`, protocol | `ArmySpec.leaders`, Commander aura `90+10*streak`, Bannermen per repo | |
| 7 | `src/measure/bots.ts` | `BOTS[].volume` | ~400 lines/day median |
| 8 | `battle.ts` | `MAX_FIGURES`/`MAX_TICKS` per kind; skirmish-phase hold 12 s; new event kinds | |
| T | `src/game/game.test.ts` | new cases | win curve; cram ≤ 45% of steady; 2x volume 140–175%; weekdays-only ≥ 80%; faction parity 40–60%; bots within 0.5–2.5x |

Note that the existing test "steady work beats the same work crammed" passes today only narrowly against early cram (2370 vs 2113). Tighten it to the ratios above.

---

## 9. Research notes

- **Total War morale and roles:** units rout from accumulated morale penalties (casualties, flanking, general's death), not only from hp; armies are built from counters (spears vs cav, cav vs missiles, missiles vs infantry). The sim has the counters and morale, but attrition swamps both. Hence the Fortunes layer and terrain.
- **Autobattlers:** TFT pays streak gold only from a streak of 3–4 (patch 14.1 raised the threshold, which reduced streak impact) and gives loss streaks the same gold as win streaks. That is a deliberate comeback valve, the model for Rally. Super Auto Pets gives everyone identical income and lives on run variety; that argues for Fortunes rather than more economy.
- **Streaks:** Duolingo reports the biggest retention gain is from a 1- to 2-day streak, rising to day 7 and flattening after. That supports a 7-day weekly streak that resets with the city. Freezes exist to soften loss aversion. GitHub silently removed its streak counter; Moldon, Strohmaier and Wachs (ICSE 2021) found long streaks were then abandoned and weekend activity fell. Streaks drive behaviour strongly, including weekend work, which is why I propose a grace day.
- **Weekly and seasonal resets** work when there is a persistent cosmetic identity (Renown, honours) and the reset is a fresh start for late or returning players. A day-3 joiner reaches 62% of a full week.

Sources:
- [Lenny's Podcast summary: Duolingo streaks (J. Shuttleworth)](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)
- [Lazyweb: Duolingo streak goals and retention](https://lazyweb.com/research/duolingo-streak-goals-retention)
- [esports.gg: TFT patch 14.1 preview (streak changes)](https://esports.gg/news/teamfight-tactics/a-preview-of-tft-patch-14-1-deploying-january-10)
- [Metabot: TFT economy and streaks](https://metabot.gg/en/TFT/guides/tft-economy-gold-interest-streaks-explained)
- [How Gamification Affects Software Developers: Cautionary Evidence from a Natural Experiment on GitHub](https://dl.gi.de/items/96a167f0-91ec-4931-aa5b-a69697be0235/full)
- [freeCodeCamp: Don't break the chain, GitHub streaks](https://www.freecodecamp.org/news/dont-break-the-chain-why-github-s-streaks-will-be-sorely-missed-by-many-4fff90bc2a38/)
