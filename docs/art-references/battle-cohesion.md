# Battle cohesion: looser lines, wrapping flanks, pulsing melee, cycling horse, and room between blocks

Research and analysis only: no game code was changed. The user's complaint, verbatim:

> "Battles look too cohesive rn lol, like everybody stays in their strict rectangle formation. Aren't
> there supposed to be some spread in speed, or gaps, or stragglers, or more blending once people
> clash, or cav cycle charging or what not? [...] esp flanking: like a block of units, isn't most
> people gonna move toward their closest enemy and kind of flank and wrap around or something."

There were two follow-ups. The first: "every unit is way too cramped too, are you sure they're that
close together irl?" The second clarified that this means **the distance between adjacent blocks
(regiments)**, not the men inside a block. Both are answered in section 3.

Read alongside: `formations.md` (spacing and scale, v6), `total-war-battles.md` (camera and
readability), `rally.md` and `rout-recovery.md` (morale and re-forming), and `docs/faction-doctrines.md`.
The doctrines are being built in `battle.ts` in parallel, so section 5 plans these changes to layer on
top of them.

Source quality markers: **[P]** primary text, **[S]** scholarly or encyclopaedic secondary,
**[pop]** popular history, **[game]** game convention, **[M]** measured here from the sim,
**[E]** my estimate.

---

## 0. Bottom line

1. **The sim's lines are rigid in measurable ways.**
   - **Approach:** a marching man's median distance from his slot is 1.1 world units (0.2 m). Only 6–9% of men are more than 6 units out.
   - **Contact:** the front rank arrives within ±4–6 units of a straight line.
   - **Melee:** a man pushes a median 2–4 units past the contact line, and 47–62% of an engaged block has no foe in reach.
   - **Angle of blows:** 74–79% land on the enemy block's front and only 15–21% of fighters stand beyond its frontage, so blocks meet head-on and do not wrap.
   - **Rhythm:** blows land at a steady rate, with only 3% of seconds in a lull.
   - **Cavalry:** 80 of 93 shock and light-horse regiments in nine 1,200-a-side battles **never** pulled out to charge again.

   Numbers are in section 2.
2. **Why it is rigid, in the code:**
   - **The formation spring** in `move()` pulls each man to his exact slot (k 2.5) at exactly the anchor's speed. Per-man pace exists only in a charge and a chase (`hs`).
   - **The `seek` leash** of 9 units for foot holds a man to his slot even when the enemy is close.
   - **`slotPos` and `assignLines`** pair blocks centre to centre and charge 90 extra for a flank place.
   - **`closeRanks`** refills the front every half second.
   - **A fighting man never steps back.**
   - **The cycle charge** fires only against formed foot, but 80% of cavalry melee time is spent against other cavalry.
3. **The real thing**, from manuscripts, the Japanese screens, reconstructions, Thucydides, du Picq, Sabin and ACOUP:
   - Lines ripple and bow as they come on.
   - The bravest arrive first.
   - Each army drifts to its right and overlaps the enemy's left.
   - The contact face "accordions" in micro-pulses of a yard or two, with pockets where groups surge.
   - The wounded and the weary drift to the rear.
   - Horse charges, breaks off, rallies on its banner and comes again (Arsuf: three charges with re-forms between).
4. **Top proposals by visible impact per effort** (section 4):
   - **P1:** per-man eagerness and a file ripple on the approach.
   - **P2 + P6:** loosen the leash near contact and curl the overlapping files round the enemy's flank.
   - **P4:** cavalry that breaks off and rallies after every clash, including horse against horse.
   - **P3:** micro-pulse breathers at the contact face.
   - **P7:** the drift to the right.
   - **P5:** walking wounded and uneven files.

   A scratch prototype of P1, P2 and P3, plus a P4 fix, doubled slot spread on the approach and in melee. Front raggedness at contact rose 50% and penetration past the contact line doubled. Flank wrapping moved only 15% → 23%, which shows that **wrapping needs the explicit curl rule (P6), not just a longer leash**.
5. **"Too cramped" between blocks: yes on screen; no in historical terms.**
   - **Gaps:** blocks stand 18 units apart, 0.2–0.5 of a block's width. On screen the figures are drawn **2–3× true scale** (a foot figure is about 10 map px wide where a man's shoulders would be about 3 px), so they spill about 5 px past each block's edge. An 18-unit gap leaves only about 4 px of visible ground.
   - **History:** companies within a medieval "battle" really did stand nearly shoulder to shoulder. The visible gaps were *between* battles and contingents (tens to hundreds of metres), between the lines ("a bowshot", Agincourt), and out to the cavalry wings.
   - **Recommendation:** widen the gaps between blocks to about 28 units, and to 60–70 out to the wings, and add a little between rows. Do not spread the men inside the blocks.

   A mock-up with 34 / 40 / 80 reads much better (shots 07–09). It costs one zoom step at 1080p for big armies (0.94 → 0.875 at 1,200 a side, 0.875 → 0.75 at 4,000), so section 3.5 recommends a cheaper middle setting.

---

## 1. References

Study copies are in the git-ignored `references/battle-cohesion/`. None are committed.

### 1.1 Images

| # | Image (page / direct) | Licence | What I took from it |
|---|---|---|---|
| 1 | Nagashino battle screen (6-panel, Edo period), [Battle of Nagashino](https://en.wikipedia.org/wiki/Battle_of_Nagashino) / `upload.wikimedia.org/.../7/79/Battle-of-Nagashino-Map-Folding-Screen-1575.png` | Public domain (age) | **Clusters, not blocks.** The Oda line stands behind a zig-zag palisade with **gaps** in it. The Takeda come on as separate groups of 5–20 riders and foot, each pressing a different stretch of the fence. Men are spread through depth: some at the fence, some running up, some fallen back by a stream. A whole army never moves as one rectangle. |
| 2 | Sekigahara Kassen Byōbu-zu (Gifu History Museum), [Battle of Sekigahara](https://en.wikipedia.org/wiki/Battle_of_Sekigahara) | PD | **Bands of contingents with ground between them.** Each sonae is marked by its own sashimono, a cloud of one colour. Where two meet, the colours **interleave** in a ragged, deep band, not along a line. Some contingents stand off on hills while others grind, and broken ones stream back up the screen. |
| 3 | Ukiyo-e triptych of Kawanakajima (Edo period), [Battles of Kawanakajima](https://en.wikipedia.org/wiki/Battles_of_Kawanakajima) / `.../2/28/BattleKawanakajima.jpg` | PD | A popular (later) image, used here only for melee spacing. Men fight **in pairs and threes, a body length apart**, and riders cut through the gaps. The fight is dense around the banner and sparse at the edges. |
| 4 | Sengoku battle screen detail (Uesugi / Takeda), `.../a/a6/Sengoku_period_battle.jpg` | PD | **Melee as a scatter of duels at different depths.** Spearmen lunge from two body lengths, swordsmen close in, and the fallen lie behind the fighters. Banner poles keep each side's mass legible even though the "line" is gone. |
| 5 | Morgan (Maciejowski) Bible, leaf with the battle of Absalom's army, [Morgan Bible](https://en.wikipedia.org/wiki/Morgan_Bible) / `.../0/05/Leaf_from_the_Morgan_Picture_Bible_-_Google_Art_Project.jpg` | PD | **Two masses of horse interpenetrate.** Horses overlap and lances cross, and the dead lie under the hooves. In the lower register a column of riders comes on in a loose, staggered file, with the leaders a length ahead of the rest. |
| 6 | Froissart, Crécy (BnF Fr. 2643), [Battle of Crécy](https://en.wikipedia.org/wiki/Battle_of_Cr%C3%A9cy) / `.../2/24/Battle_of_crecy_froissart.jpg` | PD | **Missile men in an open crowd in front of a dense block of men-at-arms.** The crossbowmen are already giving way and turning back between the files; one is down and others are spanning or walking off. The archers step forward unevenly, and the formed block behind is a wall of helmets. |
| 7 | Froissart, Poitiers 1356, `.../2/21/Battle-poitiers%281356%29.jpg` | PD | **The two hosts are blocks, but the space between them is full of individuals:** archers who have stepped out, riders wheeling in the middle distance, wounded horses turning away. The contact face is a zone, not a line. |
| 8 | Holkham Bible Picture Book f.40 (BL Add MS 47682), [Battle of Bannockburn](https://en.wikipedia.org/wiki/Battle_of_Bannockburn) | PD | **Men on foot fight in a ragged row of individual duels**, each pair at its own distance. Men stoop and duck, the fallen lie between them, and the row has gaps. |
| 9 | Rupert Heller, *The Battle of Pavia* (1525, Nationalmuseum Stockholm), [Battle of Pavia](https://en.wikipedia.org/wiki/Battle_of_Pavia) | PD | A painted bird's-eye of a real battle. **Pike blocks keep their shape, but at the contact faces they blur into a churning mass**, and **horse wraps round a block's flank**. Stragglers are everywhere between the blocks, and a broken block **tails off into a stream of fugitives**. This is the best single image of "formed, but alive". |
| 10 | Tewkesbury reenactment photo, [Battle of Tewkesbury](https://en.wikipedia.org/wiki/Battle_of_Tewkesbury) / `.../7/7a/Battle_of_Tewkesbury_reenactment_-_fighting_while_arrows_fly.jpg` | CC BY-SA (see file page) | Real people in a mass fight. The two fronts **stand a polearm's length apart** and the line **bows and kinks**. Some men are a step forward, some a step back, and a few are turned sideways. The rear ranks bunch irregularly behind them. Nobody is in a straight row. |
| 11 | *Medieval II: Total War* screenshot 846, [Steam](https://store.steampowered.com/app/4700/) | © SEGA, study only | The Total War look **after** a few seconds of melee: the two units are **fully intermixed**, men fight one-on-one at varying distances, and the flags still mark each unit. This is the far end of the spectrum. Our sim sits at the other end. |
| 12 | *Medieval II* screenshot 844 (street fight) | © SEGA, study only | A dense blob in a street, 30+ ranks with no gaps. This is what to avoid: the "blob" makes units unreadable. |
| 13 | *Mount & Blade II: Bannerlord* screenshot 1 ([Steam](https://store.steampowered.com/app/261550/)) | © TaleWorlds, study only | **A cavalry charge with no two horses abreast:** leaders a length or two ahead, and riders peeling off at the edges. The mass reads as a block from afar but every rider has his own line. |
| 14 | *Ultimate General: Civil War* screenshot 1 ([Steam](https://store.steampowered.com/app/502520/)) | © Game-Labs, study only | Brigades read as **soft-edged lozenges whose fronts bow toward the enemy**. There is wide ground between brigades, so each one reads on its own from far away. |

### 1.2 Texts

| Source | What it says that matters here |
|---|---|
| Thucydides 5.71–72 (Mantinea, 418 BC) [P], [Perseus/Perseids](https://cts.perseids.org/read/greekLit/tlg0003/tlg001/1st1K-eng1/5.71.1-5.71.3), [Livius](https://livius.org/sources/content/thucydides-historian/the-battle-of-mantinea-418-bce) | "All armies are alike in this: on going into action they get forced out rather on their right wing, and one and the other overlap with this wing the left of the enemy", because each man crowds toward the shield of his right-hand neighbour to cover his unprotected side. **Lines drift right and overlap.** Agis tried to shift troops to cover the overlap, the move failed, and **the gap it left was broken through**. |
| Polybius on Cannae, as quoted by Ardant du Picq, *Battle Studies* ch. 3 [P via S], [Gutenberg](https://www.gutenberg.org/files/7294/7294-h/7294-h.htm) | The Gallic and Iberian centre advanced as a **convex crescent**. The Romans "crowded towards the center, to the place where the enemy gave way", and the African wings then swung in on their flanks. **The centre bulges, the attackers funnel toward the give, and the flanks fold in.** |
| Ardant du Picq, *Battle Studies* [P], same link | "Indeed the physical impulse is nothing. The moral impulse [...] is everything." In cavalry against cavalry, "forty-nine times out of fifty, one [...] will hesitate, bolt [...] before" contact. Ancient melee was "a series of individual conflicts, juxtaposed, with the front rank man alone fighting. If he fell, if he was wounded or worn out, he was replaced by the man of the second rank". "Openings in the phalanx might be occasioned by marching, by the terrain [...] by the individual assault of brave men, by the wounded". |
| Sabin, "The Face of Roman Battle", *JRS* 90 (2000) [S], [PDF](https://www.gwern.net/doc/history/2000-sabin.pdf) | Battle as "a natural stand-off punctuated by periodic and localized charges into contact": **lulls and surges** rather than continuous grinding. |
| Devereaux, "Intermission: Battle Pulses", ACOUP (Dec 2025) [S], [acoup.blog](https://acoup.blog/2025/12/18/intermission-battle-pulses/) | Accepts **micro-pulses**, "a quick shuffle of a yard or two" in and out of measure, as constant through a melee lasting "minutes or even an hour or more". Is sceptical of full macro-lulls (back to 10–20 yd). The lines "accordion", and local groups surge and push the enemy back a few metres without a break. The wounded drop back through the ranks. |
| ACOUP, "Shield walls and spacing" (Dec 2023) [S], [acoup.blog](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/) | File widths: about 0.9 m close order, about 1.35 m Roman, about 1.8 m open order. Already used in `formations.md`. A fighting line needs room to swing, so it **opens up at the contact face**. |
| Keegan, *The Face of Battle* (1976), Agincourt chapter [S] (from memory, paraphrased) | As the French men-at-arms advanced under arrow fire they **bunched toward the centre** and away from the archers on the wings. The front was pushed back "a spear's length" by the English, then jammed. Men went down in **heaps where the press was worst**, and the rear ranks pushed the front onto the enemy. The press is uneven along the line. |
| Wikipedia, *Battle of Arsuf* [S], [link](https://en.wikipedia.org/wiki/Battle_of_Arsuf) | Ayyubid horse archers "attack and wheel off" over and over. The crusader charge was started by the Hospitaller marshal, then generalised. Richard **halted after about 1.5 km and re-formed**, made a **second charge** against Taqi al-Din's counter-attack, and after **another regrouping a third**. **Charge, rally, charge again.** |
| *The Knight in Battle*, warhistory.org [pop], [link](https://warhistory.org/fr/article/the-knight-in-battle) | Knights rode "almost knee to knee". Men were ordered "not to move more than 10 feet [...] from the standards". At Crécy the French made "repeated attacks", and charges came "in three places where the banners were". **Banners are the rally points.** |
| Nicolle, *Knight Hospitaller* (via `faction-doctrines.md` §1.1) [S] | Charges were "probably made at a trot, with the horses kept very close together", then spurred to a canter. The orders charged in squadrons, each under its own banner. |
| Wikipedia, *Battle of Agincourt* [S], [link](https://en.wikipedia.org/wiki/Battle_of_Agincourt) | English front about 690 m, men-at-arms "shoulder to shoulder four deep", and archers on the flanks behind stakes. French vanguard and main battle each about 16 ranks deep and "a bowshot length" apart. 800–1,200 mounted men-at-arms on the vanguard's flanks, "slightly forward". |
| Intervals between maniples [S], [Karwansaray summary](https://www.karwansaraypublishers.com/blogs/gary-brueggemans-the-roman-army-ancient-warfare/gaps-in-the-formation), Taylor, "Roman infantry tactics in the mid-Republic" | Estimates run from Delbrück's small gaps (about 3 m) to gaps the width of a maniple (Livy and Polybius read literally). Taylor's legion fronts were 320–570 m, with modest gaps kept even in contact. |
| Sengoku sonae [S/pop], [Ashigaru](https://en.wikipedia.org/wiki/Ashigaru), [Balagan on sonae](https://balagan.info/musing-on-yoshimotos-very-bad-day) | Armies were deployed **in depth as mutually supporting sonae**: ashigaru (guns, bows, yari) in front, samurai behind, often split among the sonae. Ashigaru fought looser than European pike. No reliable numbers for the gaps between sonae were found (the same gap as `formations.md` §4.2). |
| Total War community [game], [Rome 2 thread](https://steamcommunity.com/app/214950/discussions/0/620713633859279488), [Medieval II DE thread](https://steamcommunity.com/app/4700/discussions/0/3415433928552976930), [GameStar guide](https://www.gamestar.de/artikel/total-war-rome-2-guide-tipps-zu-den-schlachten-neuerungen,3027565.html) | Players praise Rome 1 and Medieval 2 for units that keep formation **until contact, then interleave**, and Shogun 2 for doing it best. Rome 2 is criticised for "**blobbing**" (units clump into one mass) and for flanking that "no longer matters". The sweet spot: **formed in approach, fluid at contact, still legible by banner.** |

### 1.3 What games do to read as alive [game]

- **Total War (Shogun 2, Medieval 2):**
  - Men keep slots on the march but each has a small random offset and pace, so ranks shimmer.
  - At contact, each man picks a foe and leaves his slot. Matched-combat animations pull pairs together, so the two units interleave a few ranks deep.
  - The unit re-forms when the fight ends.
  - Too much freedom (Rome 2) becomes the blob.
- **Ultimate General:** a brigade is a deformable ribbon. Its front bends to the terrain and to the enemy, and its ends curl in when it overlaps. Wide ground between brigades keeps each readable.
- **Bannerlord:** every soldier is an agent with its own pace, so charges are ragged by default. Formations are a target shape, not a cage. Cavalry charges through, rides out and turns (a "charge, then pass" loop).
- **UEBS:** pure agents with no formations. It reads as a swarm, and is a warning of what the far end looks like.
- **Battle Brothers:** the turn-based grid shows the moment of contact as a line of duels, with gaps where men fall. The front is never solid.

---

## 2. The current state, measured

### 2.1 Method

- **Scripts:** `measure.ts` (slot spread, stragglers, front raggedness, penetration, wrapping, cavalry cycles), `sway.ts` (contact-line drift, blow rhythm, cavalry timelines), `cavdiag.ts` (what cavalry fights) and `spritesize.cjs` (figure size on screen).
  - They are in `/tmp/claude-0/-home-user/7d709e29-6506-584e-9fe8-0e06b0442ce1/scratchpad/cohesion/`.
  - They run against the unmodified `src/game/battle.ts`, battle v12.
- **Battles:** `demoSetup(seed, men, [fa, fb])`, seeds 3, 7, 11, 19, all six ordered faction pairings, and sizes 150, 450, 1,200 and 4,000 men a side. That is 24 battles a size, sampled every 0.5 s.
- **Units:** world units, where 1 unit ≈ 0.19 m (`formations.md` §7.1). A line man's file is 5.3 units.

### 2.2 Numbers

| Measure | 150 | 450 | 1,200 | 4,000 |
|---|---|---|---|---|
| Deploy: gap between first-line blocks / block width | 0.49 | 0.34 | 0.23 | 0.20 |
| First foot contact (tick) | 291 | 266 | 257 | 317 |
| Slot distance while **advancing**, p50 / p90 (units) | 1.1 / 2.3 | 1.1 / 3.8 | 1.1 / 4.9 | 1.2 / 5.4 |
| Stragglers advancing: share of men > 6 units out (> 12) | 5% (2%) | 7% (2%) | 8% (3%) | 9% (3%) |
| Front rank at first contact: range of depth, mean (p90) | 5.2 (10.9) | 8.3 (16.1) | 10.8 (21.4) | 12.7 (25.4) |
| Slot distance in **melee**, p50 / p90 | 3.0 / 8.8 | 3.0 / 9.6 | 3.2 / 11.1 | 3.2 / 11.5 |
| Melee: share of a block past the contact line | 15% | 14% | 12% | 13% |
| Melee: furthest man past the contact line, p50 (p90) | 1.6 (8.8) | 2.2 (11.8) | 3.3 (14.7) | 4.0 (17.4) |
| Melee: front-rank bow (middle ahead of ends), p10 / p50 / p90 | −4.8 / −0.4 / 4.7 | −3.9 / 0.5 / 5.0 | −4.9 / 0.4 / 5.7 | −5.0 / 0.5 / 5.9 |
| Melee: share of an **engaged** block with no foe in reach | 35% | 47% | 59% | 62% |
| Blows on the target block's front / flank / rear | 74 / 22 / 4% | 77 / 19 / 4% | 78 / 19 / 3% | 79 / 18 / 3% |
| Fighters standing beyond the target's frontage ("wrapping") | 21% | 17% | 15% | 15% |
| Width ratio of facing pairs, p10 / p50 / p90 | 0.38 / 1.00 / 2.49 | 0.48 / 0.97 / 1.81 | 0.54 / 1.00 / 1.85 | 0.51 / 1.00 / 1.92 |
| Cavalry: melee → withdraw cycles / regiments | 19 / 108 | 20 / 168 | 52 / 246 | 69 / 306 |

At 1,200 a side over nine battles (`sway.ts`, `cavdiag.ts`):

- **Blow rhythm.**
  - The blows per file per second of an engaged block vary with a coefficient of variation of 0.37.
  - Only **3%** of seconds fall below a quarter of the block's mean rate. **There are no lulls**: once in, a front grinds at a constant rate until one side breaks.
  - The contact line does move, with a standard deviation of 34 units over a melee, but that is the net push of the winner. It is not a sway back and forth.
- **What cavalry fights.**
  - Shock and light horse spend **39% of their melee time against shock cavalry, 21% against light horse and 20% against horse archers**: 80% against horse.
  - The rest is 10% against fugitives, 5% against foot of the line and 4% against missile foot.
  - **80 of 93** shock and light-horse regiments never withdrew. 6 cycled once and 7 twice or more.
  - 66% of uninterrupted melee spells are shorter than 4.5 s, because `engaged` flickers between charge and melee and resets `meleeTicks`.
- **A cavalry withdrawal, when one happens:**
  - The block keeps its formation, 6–7 units from its slots on average.
  - It rides 120 units straight back in 6–6.5 s and stands for 1.5 s.
  - Then it charges again.

### 2.3 Screenshots (current state, battle v12, classic art, 1280×800 unless noted)

All of these are in `docs/screenshots/cohesion-before/`. Shots 07–11 are mock-ups made in a scratch copy and are not in `src/`.

| File | What it shows |
|---|---|
| `01-approach-templar-samurai-1200.jpg` | The approach, 17 s in. Every block is a perfect parallelogram. Samurai ashigaru lines are two ranks deep and ruler-straight, and the Templar column marches in lock-step. |
| `02-contact-templar-samurai-450.jpg` | First contact. The horse melee has broken up, but the foot blocks behind are still perfect rectangles a few seconds from contact. |
| `03-melee-templar-samurai-1200.jpg` | Mid-melee. Lines **cross like an X** (two rigid lines wheeling through each other). Foot fights face to face along straight seams, and blocks behind stand in perfect order. |
| `04-melee-samurai-undead-1200.jpg` | A Samurai line, two ranks deep and dead straight, along which only the end men are fighting. The rest stand in their slots. |
| `05-late-templar-samurai-450.jpg` | Late in the battle: fugitives scatter well, but formed blocks are still rectangles. |
| `06-deploy-undead-templar-4000.jpg` | A 4,000-a-side deployment. Blocks nearly touch and the first and second lines interleave into one mat. |
| `07-gaps-before-1200-1080p.jpg` | The deployment at 1920×1080, zoom 1, with today's gaps. |
| `08-gaps-mockup-after-1200-1080p.jpg` | The same seed with REG_GAP 34, ROW_GAP 40, wing gap 80 and missile gap 28 (scratch hack). |
| `09-gaps-mockup-after-1200-t200.jpg` | The mock-up 20 s in. |
| `10-proto-approach-ripple-1200.jpg` | Prototype P1 + P2 + P3 (strong setting): files bow and ripple, and men lead or lag. |
| `11-proto-melee-1200.jpg` | The prototype in melee. The contact faces are ragged, and men step out and back. |

What the screenshots show beyond the numbers:

- **The "X" crossing.** Two long two-rank lines wheel into each other and overlap like scissors without either curling round. This is the most artificial image in the set.
- **Wheels look rigid.** A wheeling block is a rotating ruler, because every man sits exactly on his slot.
- **Deep blocks are dead inside.** In big battles the third rank and beyond never moves relative to its slot.

### 2.4 Why it stays rigid: the code

| Lever (battle.ts) | Today | Effect |
|---|---|---|
| `move()` formation branch | `v = anchor velocity + (slot − pos) × 2.5`, the same for everyone. `hs` (per-man pace) is used only in `charge` (0.88–1.12) and `pursue` (0.8–1.2). | On the march the error decays to 0: no lead, no lag, no ripple. |
| `seek()` | Foot looks at most `R` 10 from himself and `leash` 9 from **his slot**. A foe behind his facing costs ×1.7. | Only men within about 9 of the enemy front fight. The block's ends cannot reach round an enemy flank, which is why 47–62% stand idle. |
| `move()` with a target | Walk to contact (`rad + rad + 0.9`), then `v = 0`. | A fighting man never steps back, so there are no micro-pulses. |
| `act()` | Strikes whenever the cooldown allows. | A constant blow rate, with no lulls. |
| `survey()` | Anchor leashed 1.5 units to the men when engaged. `thinkLine` engaged sets the goal to `ax + fx × 3` ("press"). | The whole block presses as one, with no local surge. |
| `slotPos(o, 0)` + `assignLines` | An attacker's anchor goes to the target's front centre. A flank place costs +90 (+20 if committed), a rear place +170. | Blocks meet centre to centre. Overlap comes only from width mismatch, and there is no drift. |
| `startCharge`, `RUN_IN` 26 | Charge launched at 45–75 units, with pace spread ±12%. `ragged` after 2.6 s (spring k 0.9). | A small spread at contact: the front's depth range has p90 11–25 units, under five ranks. |
| `closeRanks` (every think, 0.5 s) | The rear man of each file steps into the fallen man's rank. Below `cols × 2.2` men the block re-forms narrower. | Gaps last less than 0.5 s, and the block stays a rectangle to the end. |
| `separate()` | Hard circles, with the pusher's push remembered. | The two fronts cannot interleave: penetration has p50 2–4 units. |
| `thinkCav` cycle | Only if the prey is foot of the line or command, after `meleeTicks` > 45 (15 against braced). Withdraw 120 straight back as a formed block, then `hold` 15 ticks. `meleeTicks` resets whenever mode ≠ melee. | Cavalry against cavalry, 80% of cavalry melee, never cycles, and the flicker resets the clock. |

---

## 3. "Too cramped": real spacing, real intervals, and the game's scale

### 3.1 Men inside a block are spaced right (check of `formations.md`)

- **Close-order foot:** about 0.9 m a file (shield width; Polybius' 3 ft; Zurich 1443 at 0.91 m), with ranks 1.0–1.2 m [S/E]. The sim has line foot at 5.3 units = **1.0 m** a file and 5.8 units a rank. That is right; it is not cramped.
- **Shield wall:** 0.45–0.9 m. The sim's shieldwall gap ×0.2 gives about 4.9 units (0.93 m), which is if anything loose.
- **Pike:** about 0.9–1 m a file in the block [S]. The "3 × 7 paces" figure is area per man, including the rank gap. The sim's pikewall is about 4.9 × 5.4 units, which is right.
- **Archers:** loose in the field, with 1.5–2 m between men so they can draw, and staked [S/E]. The sim's missile foot is loose at 8.9 units = 1.7 m, which is right.
- **Skirmishers:** 2–4 m, often in pairs [E]. The sim's 11.2 units = 2.1 m is at the tight end and could go to 13–15.
- **Cavalry:**
  - Knee to knee is about 1.0–1.2 m centre to centre, for a horse about 0.6–0.7 m across the barrel (0.9–1 m with the rider's knees). A horse is about 2.4 m long.
  - The sim has shock horse at 9.0 units = **1.7 m** a file and ranks at 13 units = 2.5 m.
  - **That is already looser than knee-to-knee**, and that is deliberate (`formations.md` §7.2).
  - Light horse in loose order, 2–2.5 m [W/E], is about right in the sim.
- **Ashigaru:**
  - Looser than European pike: the yari were used to slash as well as thrust, and the long nagae yari were swung down on the enemy (`weapon-attacks.md` S2).
  - Teppō stood in loose ranks to fire.
  - Neither was sourced in numbers. The sim's samurai blocks use the same spacing as the others, which is acceptable.
- **In practice:** fronts open up at contact (ACOUP: a man needs room to swing) and close up under fear (Keegan's Agincourt crush). Loosening in melee is P3's job, not the deployment spacing's.

### 3.2 The figures are drawn 2–3× life size

- **Map scale:** at zoom 1 a figure is drawn in a 48×48-map-px cell, and the ground is 1.15 map px per world unit (`iso.ts` `PX`).
- **Measured figure sizes** (opaque bounding box of the idle frame, at map px = device px at zoom 1; `spritesize.cjs`):

| Figure | Classic w × h (map px) | HD w × h (level-1 grid) | Width in world units (w / 1.15) | Life size at the same scale |
|---|---|---|---|---|
| Foot (heavy, spear, archers, crossbows, skirmish) | 8–11 × 15–23 | 9–13 × 17–29 | 7–10 units (1.3–1.9 m) | shoulders about 0.5 m = 2.6 units = 3 px; height 1.75 m = 9.2 units = 10.6 px |
| Horse (light, horse archers, knights) | 17 × 22–32 | 21–25 × 26–31 | 15–22 units (2.8–4.1 m) | horse about 2.4 m long, seen at 45°: about 1.7 m = 10 px; height with rider about 2.5 m = 15 px |
| Engine | 21–26 × 20–22 | 25 × 21 | 18–23 units | — |

Figures are therefore drawn about **3× wide and 1.5–2.2× tall** for foot, and about **1.5–2× for horse**. This is a normal RTS readability choice ([game]: Total War and Ultimate General oversize their men too), but it has consequences:

- **Neighbours overlap.** A line man's neighbour in the file is (−3.0, +2.6) map px away (spacing 5.3 × PX × (−sin30, cos30/2)) and the man in the next rank is (+5.8, +1.7) px away. A 10 × 18 px figure therefore overlaps about four neighbours: a block reads as one textured mat. That is correct for close order, and it is what Total War looks like from above.
- **The gap between blocks is eaten.** The gap between blocks in a line is 18 units along world y, about 13.7 map px across the screen. Each block's edge figures spill about 5 px past their slot centres, so **about 4 px of ground shows between blocks** at zoom 1 (less at zoom 0.75–0.875, the default at 1080p for big armies).
- **The gap between rows is eaten too.** It is 16 units, about 16 px across the screen (rank axis about 1 px/unit), minus a 10 px figure and the banners, leaving about 6 px.

**Why it looks cramped:** the sim's blocks are not too close in metres. They are too close **for figures drawn at 2–3× scale**.

### 3.3 Real intervals between units

| Battle / army | Intervals (what the sources give) |
|---|---|
| Medieval "battles" (divisions) | Usually **three battles**. Either in line (Crécy's two forward battles with the third behind as reserve; Agincourt's English three battles in one line about 690 m wide) or in depth ("a bowshot", about 200+ m, between the French vanguard and main battle at Agincourt) [S]. **Within** a battle the companies under each banner stood **contiguous**, shoulder to shoulder; no gap is recorded [S, Agincourt]. Archers stood on the flanks of a battle (Agincourt) or in "herces" between and beside them (Crécy, debated), behind stakes. |
| Cavalry wings | Agincourt: 800–1,200 mounted men-at-arms on the vanguard's flanks, "slightly forward" [S]. Medieval wings stood **beside** the foot, with room to start a charge [E: tens of metres]. Arsuf: the army marched in a column of 12 regiments of about 100 knights, with the foot as a screen, and charged out through its own foot. |
| Bannockburn 1314 | The English army was **crammed** between the Bannock Burn and the Pelstream with no room to deploy. Its archers could not shoot past their own men, and the cramped deployment helped defeat it [S]. The Scots came on in three or four **separate schiltrons** with ground between them. |
| Roman manipular legion | A checkerboard (*quincunx*). The interval was about one maniple's frontage on a literal reading of Livy and Polybius, about 3 m for Delbrück, or a modest gap kept even in contact (Taylor) [S]. **The purpose of the gaps** was passage of lines: velites retire through them and the *principes* relieve the *hastati*. |
| Sengoku armies | Deployed **in depth as separate sonae**: ashigaru guns, bows and yari in front, samurai and the commander's banner behind, each sonae under its own colours [S/pop]. Nagashino: the Oda–Tokugawa line stood behind a palisade about 2 km long **with gaps for sallies**, and the Takeda attacked in **successive waves of separate contingents** [S; screen #1]. Sekigahara: contingents of thousands deployed **on separate hills across a valley about 4 km wide**, with large empty ground between them [S; screen #2]. |
| Mantinea 418 BC | A gap opened when Agis tried to shift troops to cover the overlap on his left, and **the enemy broke in through it** [P]. Gaps carry a risk. |

The role of gaps:

- **For:**
  - Passage: skirmishers retire, spent troops are relieved, and cavalry sallies out (Nagashino).
  - Room to wheel and to dress ranks.
  - Unit identity: each banner keeps its own men.
- **Against:**
  - An enemy can break through into a flank (Mantinea), and wide intervals invite horse to ride in.
  - So medieval companies within a battle closed up. The real gaps came **between battles and contingents**, and between the lines.

### 3.4 What the game uses (deployment)

Measured with `extent.mts` (Templar against Samurai, seeds 3, 7 and 11):

| Size | First-line blocks | Block width | Gap (units) | Gap / width | Wing gap | Y extent of the army |
|---|---|---|---|---|---|---|
| 150 | 3 | 36–44 | 18 | 0.41–0.50 | 68–82 | about 420 |
| 450 | 3–4 | 52–54 | 18 | 0.33–0.35 | 51–53 | 650–760 |
| 1,200 | 5 | 75–77 | 18 | 0.23–0.24 | 49–60 | 920–1,050 |
| 4,000 | 5–6 | 86–94 | 18 | 0.19–0.21 | 48–60 | 1,090–1,130 (the field is 1,200) |

- **Other gaps:** second line `ROW_GAP` 16 behind the first, the missile row 14 between its blocks, and skirmishers 22.
- **Default zoom at 1920×1080** (`/demo`, `scene.minZoom` after `frame()`): about **1.0 at 450, 0.94 at 1,200 and 0.875 at 4,000** with today's gaps. With the mock-up's gaps (REG_GAP 34, ROW_GAP 40, wing 80, missile 28) it is **1.0, 0.875 and 0.75**. The seeds differ between the two runs because `/demo` picks its own, so read these as about one step.

### 3.5 Recommendation for gaps

Widen the intervals **between blocks**, not the spacing inside them. Size the gap to the drawn figure, not the metre:

| Gap | Now | Recommended | Why |
|---|---|---|---|
| Foot blocks side by side in a line (`REG_GAP`) | 18 | **28** (clamp 22–34 by available frontage, below) | A visible gap of at least 10–12 map px at zoom 1 and 8 px at 0.75: two figure widths. This matches the visual role of the gap between "battles" or sonae, which the blocks stand in for at this scale. |
| Every 2–3 blocks, a "battle" gap (optional) | — | **+16** (so 44) between centre and wing groups | Medieval three battles, Sengoku sonae clusters. It reads as divisions without spreading everything. |
| Foot line to wing cavalry | 36 | **60–70** | Room for the horse to start, to wheel and for the lines to read. Agincourt-style "slightly forward" wings: set the wing x 10–20 units forward of the line. |
| Missile row, between blocks | 14 | **24** | Loose archers need lanes for the foot to pass through. |
| Rows (second line behind the first, `ROW_GAP`) | 16 | **26–30** | A real second line stood 50–200 m back, but every unit of `ROW_GAP` adds to the army's x extent, which drives the iso fit. 28 makes the lines read as two without a zoom step at 450. |
| Skirmishers in front | 36 + depth ahead, gap 22 | keep; widen their spacing in the block to 13–15 | They are already loose. |

- **Screen-fit guard.**
  - Compute `REG_GAP` per army as `clamp((maxFront − Σ widths) / (k − 1), 22, 34)`. A small army gets wide gaps, and a 4,000-a-side army falls back toward 22 where the field is full.
  - Alternatively, cut the first line's block count `k` by one when the gaps would push `rowWidth` past `maxFront`. `deploy()` already does this with its `while (rowWidth(...) > maxFront) k--` loop, so wider gaps put one more block into the second line by themselves.
  - Expected cost: no zoom change at 150–450, and at most one step at 1,200 and 4,000 (the mock-up's bigger values cost exactly one step).
- **Don't** spread the men inside a block: that would make lines 30–50% longer for the same men and cost the screen fit twice over.
- **Don't** shrink the figures: they are already only 10 px wide at zoom 1, and the art pipeline is tuned to that (`formations.md` §7.10, `hd-sprites.md`).
- **Mock-up.** See shots 07 (before), 08 and 09 (after). With the gaps each block, its banner and the second line read on their own: the Templar first line and its supports form a visible checkerboard, and the wings stand off clearly. The cost is more empty ground at the field's edges.

---

## 4. Proposed sim changes

Every proposal stays deterministic:

- per-man variation comes from an integer hash of the man's id (`(id × 2654435761) >>> 0`) or from `this.rng` at set points (as `hs` is drawn today);
- periodic motion uses integer triangle waves, never trig, which `src/game` forbids;
- nothing reads Date or Math.random.

Numbers are first guesses and are tuned in balance runs.

### Prototype (scratch only) to size the levers

A scratch copy of `src/` (at `.../scratchpad/cohesion/hack/`, with a `PROTO` knob table) tried P1 + P2 + P3 and a P4 flicker fix. The deployment gaps were also widened in that copy, which pushes first contact later. Results at 1,200 a side, 24 battles:

| Measure | Today | Prototype A (light) | Prototype B (strong) |
|---|---|---|---|
| Knobs | — | lead ±2.5, +3.5 near contact; ripple 1.2; leash 14 / edge 22; reach 14; breathe 12 of 97 ticks, 4 back | lead ±4, +6; ripple 2; leash 18 / 30; reach 18; breathe 18 of 97, 5 back |
| Advancing slot distance p50 / p90 | 1.1 / 4.9 | 2.1 / 6.1 | **3.0 / 8.7** |
| Stragglers > 6 units | 8% | 11% | **24%** |
| Front depth range at contact, mean (p90) | 10.8 (21.4) | 13.3 (24.9) | **15.8 (28.0)** |
| Melee slot distance p50 / p90 | 3.2 / 11.1 | 5.1 / 15.7 | **6.7 / 19.0** |
| Share past the contact line; furthest p50 (p90) | 12%; 3.3 (14.7) | 14%; 4.8 (17.0) | **19%; 6.3 (24.2)** |
| Fighters beyond the target's frontage | 15% | 22% | 23% |
| Blows on the flank | 19% | 20% | 21% |
| Cavalry cycles / re-charges | 52 / 34 | 57 / 51 | 67 / 82 |

**Reading:**

- P1 and P3 move the numbers strongly.
- **P2's longer leash alone barely changes the wrapping** (15% → 23%). The ends of a block need an explicit *curl* target (P6).
- The cavalry flicker fix helps a little. The real gap is horse against horse (P4).

### P1. Eager and laggard: the approach ripples ★★★

- **Player sees:**
  - On the march, a block's front rank is no longer a ruler. A few eager men stride half a pace to a pace ahead and some lag a pace behind.
  - A slow wave runs along the files, so the front bows and straightens.
  - In the last 60 units the spread grows: the bravest pull ahead and the line arrives ragged (Nagashino screen, Pavia, Bannerlord).
  - The block is still obviously a block.
- **Rule:**
  - **Per-man eagerness.** Each man has `e ∈ [−1, 1]` from a hash of his id, or `rng` at deploy if a stored array is preferred. Veterans get a narrower band (× 0.6), and green or levy troops a wider one (× 1.3).
  - **Slot lead.** In `move()`'s formation branch, for foot in `advance`, `reserve`, `hold` while `contact`, and `charge`: shift the slot target along the facing by `lead = e × (LEAD 3 + (contact ? LEAD_NEAR 4 : 0))` units.
  - **File ripple.** Add `RIPPLE` 1.5 × tri(tick × 0.015 + col × 0.11), a triangle wave in −1..1 over about 7 s, travelling down the files.
  - **Charge.** Widen today's `hs` (0.88–1.12) to 0.82–1.18, and keep the per-man `e` correlated (fast men are eager) so the same men lead every time.
  - **Cap.** Keep the forward lead within 1.2 rank steps, so a man never passes the man ahead of him in his file.
- **Levers:** `move()` (formation branch: offset `gx, gy` before the spring), `startCharge` (`hs` range), a new `EAGER_MAN` constant block, and `Store` (an optional `ea` Float64Array, or the hash inline).
- **Risks:**
  - **Collision.** Leads over 1 rank make files overlap, and `separate` then pushes the men back. Keep lead ≤ 1.2 rank steps and prototype B's p99 holds.
  - **Volleys.** Missile foot must stand still to loose (`mayLoose`), so exclude `shoot`.
  - **Balance.** Neutral: both sides get it. Contact comes a tick or two earlier for eager men, and only cosmetically.
  - **Speed.** One hash and three multiplies a man a tick.
  - **Determinism.** Fine.
- **Doctrines:**
  - Templar (T1, "the Rule"): × 0.5 band, a tight front.
  - Samurai (S2, "first spear"): × 1.4, with eager men running ahead.
  - Undead (U1, "tide"): ripple only and no lead, an even shamble.

  One `DOCTRINE[faction].ripple` factor covers all three.

### P2 + P6. Contact pulls men out of their slots, and overlaps curl round the flank ★★★

- **Player sees:**
  - As two blocks meet, men in the front rank step toward whoever is nearest. The front bends to fit the enemy's, and the corners bulge forward.
  - Where one block is wider than its foe, **its end files swing forward and inward round the enemy's flank** (Cannae's wings, Pavia's horse round the pike).
  - Rear ranks push up into the gaps of the front.
  - A block whose neighbour's foe has broken **turns its near end into the exposed flank** of the next enemy block.
  - The fight's edges wrap instead of meeting square.
- **Rule:**
  - **The leash scales with contact.** `seek` leash = 9 out of contact. With `r.contact` it is `LEASH_NEAR` 15 for inner files and `LEASH_EDGE` 26 for the outer 1.5 files (`|sx| > width/2 − 1.5 × spacing`). Search radius `R` is 10 → 15 near contact.
  - **Edge bias.** Edge men prefer foes on their outer side (score × 0.6), which already makes them step outward.
  - **Curl (P6).** For an engaged block's men in files beyond the target block's half-width + 1 spacing (computed in `survey`), replace the slot target with a point on an arc. Rotate the slot about the end of the target's front, at the man's lateral distance, by up to `CURL` 60° toward the enemy. Each spare file beyond curls further, up to 75°. Men walk there and pick foes on the enemy's flank.
    - Blows from there already count as flank blows (`facing()` uses the target block's facing), so the flank bonus and `flankShock` follow naturally.
  - **Rear ranks.** In an engaged block, rows ≥ 1 aim at `slot + fx × min(2, gap ahead)`, filling a front gap a beat before `closeRanks` does.
  - **The neighbour's flank (P6b).** In `assignLines`, if a regiment's target is routed or gone and an enemy block engaged with a friend lies within 120 laterally, the side place (`k` 1 or 2) nearest to us costs `+20 − 60` instead of `+90`. It wheels its near end in rather than walking to the front.
- **Levers:** `seek()` (`R`, `leash`, edge bias), `survey()` (record the target's lateral extent for the curl), `move()` (curl target for overlapping files, rear-rank lean), `assignLines()` (flank cost when a neighbour's foe is broken), and `slotPos` (unchanged).
- **Risks:**
  - **Balance.** Wider blocks gain flank blows: deep blocks lose relative to wide ones, and flank shock grows. Measure win% by stance (pikewall and shieldwall are narrow) and `flankShock` per battle.
  - **Overlap.** Curled files press into the enemy's flank files, and `separate` handles it (prototype B had no stuck pairs).
  - **Speed.** `seek` scans a wider radius (15 against 10: about 2.2× the cells) but only near contact, and only every 3–6 ticks.
  - **Determinism.** Fine.
- **Doctrines:** Templar knights in wedge keep the short leash (the Rule: no man leaves his place). Undead foot gets the long leash and no curl, so it **swarms** forward rather than curling. Samurai get the strongest curl.

### P3. Melee breathes: micro-pulses, pockets and sway ★★

- **Player sees:**
  - At the contact face, men step in to strike and step back a yard to breathe.
  - Here and there a pocket of three to six files surges a step or two and pushes the enemy back, then settles.
  - Every 10–20 s a whole stretch eases back a body length for a second or two, a lull, then closes again.
  - The two fronts interleave a little where one side gives (Tewkesbury reenactment, Sekigahara screen).
- **Rule:**
  - **Breather.** A man with a foe in reach is "out of measure" `BREATHE` 15 of every `PULSE` 97 ticks. The phase is offset by `(id × 37) % 97`, so neighbours alternate. While out, he backs to `contact + BACK` 4 units at half pace and does not strike.
    - This costs about 15% of blows on both sides, so raise `MELEE_K` by about 15% to keep battle length.
    - Rest lowers fatigue a little (`FATIGUE` × 0.9 while out).
  - **Pocket surge.** Every think (0.5 s), an engaged block with `recentKills > recent` (winning locally) and morale > 55 has a `SURGE` 0.25 chance to pick a run of 3–6 adjacent front files, from the hash of the tick. Their slot target moves forward `SURGE_D` 4 units for 20–30 ticks, and the enemy's men in front are pushed back by `separate`.
  - **Lull.** When both engaged blocks' fatigue is over 0.5, at most once per 150 ticks, both fronts step back 5 units for 15–25 ticks with no blows (Sabin's macro-lull, rare and short, as ACOUP argues). Undead never lull.
  - **Interpenetration.** Allow a man whose target is down to walk into the dead man's place (the corpse cell), rather than back to his slot, for up to 1 rank. Fronts then interleave where losses fall.
- **Levers:**
  - `act()`: skip `strike` while out.
  - `move()`: the target branch backs off while out, and the formation branch applies the surge offset.
  - `thinkLine()`: the engaged branch chooses surges and lulls.
  - `fatigue()`, `MELEE_K`.
  - A new `PULSE` constant block.
- **Risks:**
  - **Balance.** Breathers are symmetric. Surges favour the winning side, which speeds up decisions slightly, and lulls make battles longer. Retune `MELEE_K` and check the length of an equal-lines clash (target about 1 minute; see the `MELEE_K` comment).
  - **Animation.** A step back while in the Brace pose. The renderer picks Brace for a man with a foe in reach. When he is out of reach, show Idle facing the foe, which needs no contract change.
  - **Determinism.** Fine.
  - **Speed.** Negligible.
- **Doctrines:**
  - Samurai: the yari-bumari beat (S4) maps onto the surge.
  - Templar: shorter breathers (the brothers hold the line).
  - Undead: no breathers, no lulls (U2): they grind without pause, and that contrast is visible.

### P4. Cavalry: clash, break off, rally on the banner, come again ★★★

- **Player sees:**
  - Horse charges home, fights for 2–5 s, then **turns and gallops out as a loose crowd**, not a formed block backing away.
  - It slows 120–200 units back near its banner or the commander, **closes up knee to knee over 2–3 s**, wheels and charges again (Arsuf: three charges, a re-form between each).
  - Against other horse, the side that loses the shock breaks off first ("forty-nine times out of fifty" one side gives way, du Picq). The winner may pursue a short way, then rallies too.
  - A melee between two horse blocks lasts a few seconds, not a minute.
- **Rule:**
  - **Fix the clock.** Reset `meleeTicks` only after 30 ticks out of melee (track `r.lastMeleeAt`), so the charge↔melee flicker stops resetting it.
  - **Horse against horse.**
    - After `CAV_CLASH` 25–40 ticks of melee, compare the sides by local morale, `recent` and size.
    - The weaker withdraws with probability 0.6 per think, and the stronger with 0.3 (winning horse also rallies rather than chasing deep).
    - Use the same withdraw machinery, but aim `wx, wy` toward the regiment's home, or toward the Marshal or commander when within 400 (doctrine T1's banner).
  - **Foot.** Keep the 45 / 15-tick rule, but let it apply to `missile` and `skirmish` targets too.
  - **The ride-out.**
    - In `withdraw`, men use pursuit-style loose movement (`hs` 0.85–1.15, slot spread × 1.6, as in `move()`'s `pursue` branch) instead of the tight spring.
    - Distance is `WITHDRAW` 140–180, a "distance to re-form" rather than 120.
    - When it arrives: `rally` for 20–30 ticks with a gentle spring (k 0.7, like `rallying`), so the block visibly closes up, then `hold` facing the enemy, then charge.
  - **Limit.** `charges ≤ 4` before the horse is "blown" (`fatigue` > 0.7: no more cycling).
- **Levers:** `thinkCav()` (the engaged branch, the `withdraw` branch, horse-against-horse resolution), `move()` (the `withdraw` loose branch, the rally spring), `Regiment` (`lastMeleeAt`), and `fatigue()`.
- **Risks:**
  - **Balance.** Horse that disengages takes fewer casualties and inflicts fewer. Horse against horse becomes a series of shocks, and `impact()` bonuses fire more often. Measure cavalry kills and losses per battle and win% for cavalry-heavy armies, and tune the charge bonus down if needed.
  - **Doctrines.** T1 (the Marshal's charge) also edits the withdrawal point: implement P4's withdraw target as a function the doctrine overrides (`rallyPoint(r)`).
  - **Speed.** Nil.
  - **Determinism.** Uses `rng.chance` only on think ticks, which is fine.

### P5. Stragglers, walking wounded and uneven files ★★

- **Player sees:**
  - During a long fight, wounded men limp back through their own ranks and stand or sit behind the block.
  - The front gets visible holes that take a moment to close.
  - Files thin unevenly: the files that took the brunt are shorter, so the block's back edge is ragged.
  - On the march under arrows, a man here and there drops back a pace or two (du Picq's "openings [...] occasioned by marching [...] by the wounded").
- **Rule:**
  - **Wounded.** In `hurt()`, when a man drops below 35% hp (non-fatal), give him a `WOUNDED_BACK` 0.35 chance (hash) to swap places with the rearmost man in his file: set `row` = last, and the rearmost takes his rank. He then walks back through the files. Set his `stun` 10 so he walks rather than fights.
  - **Gaps linger.** `closeRanks` runs at most every `REFLOW` 15–25 ticks (from the hash of the regiment), not every think, and a man steps into the fallen man's rank at 0.5 × pace, so holes show for 1.5–3 s.
  - **Uneven files.** Re-forming narrower (`assignSlots(reg, true)`) only below `cols × 1.6`, down from 2.2, so a worn block keeps its frontage with ragged depth longer.
  - **Fear on the march.** A regiment under arrows (`r.arrows` high) gives its rearmost men in the outer files a lag of 0.5–1 rank.
- **Levers:** `hurt()`, `closeRanks()` (timing, and the threshold that triggers it in `think`), `move()` (lag under fire), and `MORALE`/`arrows`.
- **Risks:**
  - **Balance.** Wounded men swapping out preserves the front's fighting strength slightly, which favours deep blocks, and that offsets P2's favour to wide ones.
  - **Slower re-filling.** Gaps let enemy men step in (good with P3's interpenetration).
  - **Determinism.** Fine.

### P7. The drift to the right ★★ (cheap)

- **Player sees:** both armies' lines creep to their own right as they advance. Each right wing overlaps the enemy's left (Thucydides 5.71), so each army's left is threatened and the fight wheels a little. This creates the overlaps that P6 then exploits, without any change to the General.
- **Rule:**
  - In `moveAnchor`, for foot regiments in `advance` or `charge`, add a lateral component along the regiment's right of `DRIFT` 0.04 × pace. That is about 2 units of right drift per 50 units marched, so about 20 units over a full approach.
  - The drift is stronger for shielded heavy foot (× 1.2) and nil for missile foot.
  - Undead do not drift: no fear for the unshielded side.
- **Levers:** `moveAnchor()` (offset the step), `thinkLine()` (keep the goal unchanged; it re-aims every think).
- **Risks:**
  - **Edges.** It can push a wing into the edge of the field; `clampY` handles it. Turn the drift off within 60 of the edge.
  - **Balance.** Symmetric in mirrors.
  - **Matching.** `slotPos` re-aims every think and partly undoes the drift. That is fine: it shows as a slant, not a march off course.

### P8. Other matters (renderer and polish), noted

These are not sim work; they are noted for the renderer agent.

- **Dust and noise.** A dust haze over a moving or fighting block (Bannerlord shot #13 reads its charge through dust). Missile smoke for teppō exists. Sound is out of scope.
- **Wheel shimmer.** P1's ripple fixes the rigid "ruler" wheel. No renderer change is needed.
- **Banner sway at the contact face.** Banners that sway and dip where their block is fighting would carry P3's pulse to the far zoom. This is renderer work in `standards-hd.ts` / `scene.ts`.
- **Corpses as the contact line's trace.** Already in place; with P3 and P5 the dead fall in a band, not a line.
- **The "X" crossing** (shot 03). This comes from `slotPos` aiming two long thin blocks at each other's fronts at an angle. P6's curl, plus making the attacker's anchor face the target's front squarely rather than pass through it (`dfx` from `tmp[2]`), removes most of it. Worth a dedicated check when P2/P6 lands.

---

## 5. Ranking and implementation plan

### 5.1 Ranked by visible impact per unit of effort

| Rank | Proposal | Visible impact | Effort | Notes |
|---|---|---|---|---|
| 1 | **Gaps between blocks** (§3.5) | High (every deployment, every frame) | Tiny (3 constants + clamp) | Check the screen fit at 1080p and the `layout`/`fit` tests. |
| 2 | **P1** eager / laggard ripple | High (every approach) | Small (one branch of `move()`) | Prototype in hand. |
| 3 | **P4** cavalry break-off and rally | High (the user named it) | Medium (`thinkCav` + `move` withdraw) | Coordinate with doctrine T1's banner rally. |
| 4 | **P2 + P6** leash + curl round the flank | High (the user's main ask) | Medium (`seek`, `survey`, `move` curl; `assignLines` cost) | The leash alone is not enough: the curl is the point. |
| 5 | **P3** micro-pulses, surges, lulls | Medium-high in close-up | Medium (`act`, `move`, `thinkLine`; retune `MELEE_K`) | |
| 6 | **P7** drift to the right | Medium (over the whole approach) | Tiny | Creates overlaps for P6. |
| 7 | **P5** wounded, lingering gaps, ragged files | Medium in close-up | Small-medium | |

### 5.2 Order of work

These changes layer on top of the faction doctrines being built in parallel.

1. **After the doctrine scaffolding lands** (doctrines plan step 1: the `DOCTRINE` table keyed by faction): add a `COHESION` table with global defaults, and per-faction multipliers in `DOCTRINE` (`ripple`, `leash`, `curl`, `breathe`, `drift`). Bump `BATTLE_VERSION` once for the whole cohesion set, or once per step if they ship separately. Replays pin the version (`docs/replays.md`).
2. **Gaps** (`deploy()` only; no behaviour change after contact). Then run `pnpm test` (deployment, fit and screen tests) and take 1080p and 1440p screenshots at 150, 450, 1,200 and 4,000.
3. **P1 + P7** (approach only). Check the volley tests (shooters exempt) and run fairness.
4. **P4**. Write `rallyPoint(r)` so that T1 can override it. Run fairness, and measure cycles per cavalry regiment. The target is that at least 60% of shock and light-horse regiments cycle at least once in a battle that lasts past 60 s.
5. **P2 + P6**, then rerun `measure.ts`. Targets: wrapping ≥ 35% where width ratio > 1.3; flank blows 25–35%; idle share in engaged blocks ≤ 45% at 1,200.
6. **P3**. Retune `MELEE_K` so an equal-line clash still lasts about 1 minute, then run `sway.ts`. Targets: lulls (seconds under 25% of the mean blow rate) 8–15%, and blow CV ≥ 0.5.
7. **P5**.

**Checks at each step:**

- `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm fairness` (mirror win rates about 50%).
- `scripts/battle-overlap.ts`: the collision overlap must not grow.
- `scripts/battle-bench.ts`: the sim's ms per tick within 5%.

**Art check:**

- Per CLAUDE.md: Playwright screenshots of approach, contact, mid-melee, a cavalry cycle and late battle for each faction pair, at 450 and 1,200.
- At least three rounds, each compared side by side with references #1, #2, #9 and #10 (Nagashino, Sekigahara, Pavia, Tewkesbury).

**Targets for "alive but legible":**

- On the approach, slot spread p50 2.5–3.5 units and p90 7–9.
- Front depth range at contact about 3 ranks (about 16–20 units).
- Melee penetration p50 5–7 units, so the fronts interleave about one rank.
- Blocks still read by banner and colour at zoom 1: the Medieval II blob (#12) is the failure case.

### 5.3 Measurement scripts to keep

The scratch scripts should become `scripts/battle-cohesion.ts`, running the §2.2 table, the §2.2 sway and cavalry lines, and `cavdiag`, so each step's targets can be checked in CI-like runs. They read private fields through `as any`. A small read-only `cohesionProbe()` in `battle.ts` would be cleaner, but it is not needed.

---

## 6. As built (battle v14)

All of section 5's order of work is in `src/game/battle.ts` (v14 note) with its numbers in `COHESION` and each
faction's `DOCTRINE.loose` (`src/game/command.ts`); tests in `src/game/cohesion.test.ts`. Departures from the plan:

- **Gaps.** Side by side 28 where the line has room (22 for a big army that fills the field; 34 for a line of two or
  three blocks), rows 26, archers 24, wings 60 and 16 *before* the line (the Agincourt touch also shortens the iso
  box). Default framing at 1920×1080 (`/demo`, three seeds): unchanged at 150 and 450; 1,200 0.875–0.94 → 0.875;
  4,000 unchanged (0.81). At 1440×900: 150 unchanged; 450 0.94 → 0.875–0.94; 1,200 0.69 → 0.63–0.69; 4,000 0.56–0.63
  → 0.56–0.63. One zoom step at most. The optional "battle gap" was not built.
- **P1.** As designed, plus: half of a man's eagerness is his file's (files surge together), and shooters keep
  their ranks (stepping men threw their volleys off). At will, bowmen shoot the nearest of the men they look at.
- **P4.** As designed (`rallyPoint()`, which T1 overrides), but: not against the dead and not by the dead (a recharge
  buys nothing from the fearless, and the cycling handed them 25 points of win rate); the stronger side in a clash of
  horse breaks off on 0.1 a think (not 0.3); T1's ride to the Marshal follows a charge into foot only; horse
  re-forming is not tempted by fugitives for 20 s. Shooters caught in the open are ridden down, not cycled.
- **P2 + P6.** As designed (leash 15/30, reach 15, curl as tangents of half the angle, 62–80°), plus `wrapSide`: a man
  out past the end of the enemy's front closes on his foe from the flank side (the curl alone moved only idle men).
  P6b's flank cost is −20. **Not where the dead fight**: with the long leash the undead won 77% of battles of
  2,800 a side (they lose no heart while the living rout from losses), so in fights with the undead neither side
  loosens in contact; the dead come on as one mass, which is also the doctrine.
- **P3.** Breathers only while a man's weapon is not ready (a breather costs him few blows, so the undead, who never
  breathe, gain little); `MELEE_K` unchanged, since battle length came out about the same.
- **P7** (the drift to the right) was built, measured and removed: wrapping 25% → 25%, and every cross-faction cell
  favoured team 0 by 8–20 points.
- **P5.** As designed for the line (shooters keep the old re-forming, which their volley order depends on), with the
  wounded walking back for 2.5 s instead of a stun.
- **Per faction** (`loose`): Templar lead ×0.5, ripple ×0.7, breathers ×0.6, surges ×0.7, curl ×1; Samurai lead ×1.4,
  ripple ×1.1, surges ×1.3, curl ×1.15; Undead lead ×0.7, ripple ×1.3, no curl, no breathers, no lulls, never a step back.

### 6.1 Measured (24 battles at 1,200 a side unless noted; same scripts as section 2)

| Measure | v13 | v14 all pairings | v14 living only (Templar–Samurai, 12) | Target |
|---|---|---|---|---|
| Gap between first-line blocks (units) | 18 | 28 (22–34) | 22–28 | 28 |
| Slot distance on the march, p50 / p90 | 1.1 / 4.6 | 2.7 / 7.4 | 2.8 / 8.2 | 2.5–3.5 / 7–9 |
| Stragglers (> 6 units out) | 8% | 17% | 20% | — |
| Front depth at contact, mean (p90) | 10.7 (21.7) | 15.2 (26.4) | 18.1 (27.5) | ~16–20 |
| Melee: furthest man past the contact line, p50 | 3.6 | 6.9 | 14.1 | 5–7 |
| Melee: idle share of an engaged block | 57% | 53% | 54% | ≤ 45% |
| Blows on flank + rear | 23% | 27% | 34% | 25–35% |
| Fighters beyond the target's frontage (width ratio > 1.3) | 17% (24%) | 18% (27%) | 24% (33%) | ≥ 35% |
| Blow CV / lull seconds | 0.38 / 3% | 0.44 / 6% | 0.50 / 11% | ≥ 0.5 / 8–15% |
| Shock and light horse that broke off and came again | 14% (63 withdrawals) | 31% | 89% (191 withdrawals, 92 re-charges) | ≥ 60% |
| Battle length, mean | 168 s | 139 s | 119 s (v13 155 s) | well under 360 s |

The undead pairings pull the "all" column toward v13 by design (no loosening, no cycling, no breathers there).
Shots: `docs/screenshots/cohesion-after/` (before/after pairs, the same seed and moment where the battle allows).

### 6.2 Screenshot rounds (compared with #6 Pavia, #10 Tewkesbury, #1 Nagashino, #11 Medieval II)

1. **P1 + P2/P6, before balance.** The approach reads as soft-edged blocks with a few men out front (Nagashino's
   groups, faintly); at contact the Templar–Samurai centre churned into a band several ranks deep with banners still
   marking each block (Pavia's contact faces), but the middle came close to the Medieval II blob.
2. **After the cavalry cycle and P3.** Horse visibly rides out as a crowd, closes up and comes again (Bannerlord's
   charge-and-pass); melee faces bow and kink (Tewkesbury). The wider gaps make each block and its banner read alone
   at 1080p.
3. **Final.** Against the undead the contact faces are v13-like again (the balance rule), so the looseness there is
   in the approach and the cavalry only; Templar–Samurai fights keep the wrapped, interleaved faces. Remaining gap
   with the references: reserve lines (Samurai two-rank spear lines standing in reserve) are still ruler-straight.

---

## 7. Riders who think for themselves (cavalry, the sweep after v16)

The user's second complaint, verbatim: "Especially units at the back of a charge post charge, and also
units don't flow around to flank each other — everything is too rigid and stupid, each soldier gotta
think for itself! [...] there shouldn't be a single person on the battlefield where you wonder why
aren't they doing X, or why they're so stupid." This section is the cavalry half (foot is done
separately). Everything is in `src/game/battle.ts` under `RIDER`; the measure is
`scripts/cavalry-sanity.ts`.

### 7.1 What a real rider does, and what ours did [M]

Measured with `npx tsx scripts/cavalry-sanity.ts` (four set-piece charges from `frontalCharge`, run on
for 40 s, and the `/demo` battles, seeds 3, 7, 11, 23, at 450 and 1,200 men), it counts the riders a
watcher would ask "why isn't he doing anything?" about:

- **Idle:** standing still for over 2 s, no foe in reach, the enemy within 40 units. In v16 a third of
  all riders spent time like this, 1,880 rider-seconds over the eight battles. Nearly all (1,380 s)
  were the back ranks of a block of horse in a melee: the front had stopped against the enemy, and
  the men behind sat in their slots behind it, because a rider looked for a foe only 15 units from
  himself and 34 from his slot.
- **Stacked:** riders standing inside one another.
- **Into the pikes:** riders galloping into the front of braced spears or a pike wall that had an open
  flank (no friend of its within 20 of an end).
- **Left behind:** riders still within 10 of an enemy and under half their speed 2 s after their block
  rode out to re-form.
- **Horse archers caught:** horse archers with arrows left with an enemy within 12.

### 7.2 Changes

1. **His own man (`hunt`).** A rider of a block in the fight with nobody within reach looks 40 units
   about himself, with no leash to his slot. He takes the nearest man. He never takes a man of braced
   spears while he is in front of their line. He likes a man behind him less (×1.5). He leaves alone
   fugitives (the pursuit's work: hunting them stopped broken blocks spreading as they ran) and horse
   that is riding out to re-form.
2. **Round, not into (`swerve`).** A rider closing on a slower friend who is in his way (within 12
   ahead) swerves to the emptier side, by 60° if the friend is close and 30° if further off. A rider
   still galloping in with his impetus rides on.
3. **Round to the flank (`flankPoint`).** A rider with no foe within 40, whose block is fighting foot,
   rides round the end of that block on his own side and comes in at its flank, where `hunt` finds
   him a man. Before its front he rides along it 20 units off, not across its spears. Against horse he
   finds his own man or keeps his place: a block of horse moves too fast to ride round alone, and
   trying it made clashes of horse one-sided (the cycle-charge test fell from 25 cycles to 9).
4. **Out by his own path.** Breaking off, each rider rides at his own pace for his own spot about the
   rally point. That spot is his place in the block, 1.4× looser, facing back toward the fight. Each
   turns within his own turning circle. The whole block no longer wheels about its middle. The ride
   out ends when the middle of the riders is within 25 of the rally point. The block then takes up
   the frame they are already standing in, facing the fight. They close up from there and come again.
5. **Meet, don't wait.** Horse re-forming that sees enemy horse within 90 riding at it breaks off the
   re-form and counter-charges.
6. **No horseman rides at the points (`thinkCav`).** Horse about to charge the front of braced spears
   or a pike wall first looks for easier prey within 250: foot locked in a fight, or shooters. It does
   this only when its order leaves it free to (not held back, and not the Templar knights, who ride at
   the Marshal's target). Failing that, it rides out round the end of the spears and charges from the
   side. A rash general's knights still charge headlong (Courtrai, Mansourah).
7. **Out of the spears.** A rider with his charge spent who is hit in a fight with spearmen while
   under half his hit points pulls his horse out for 2 s, then may come at them again.
8. **Horse archers keep off.** A horse archer with an enemy within 15 rides off from him himself,
   back toward his place. The block now rides off from foot 50 away (it was 35).
9. **Two bugs found by the measure.**
   - Horse sent at the rear of a deep block in a melee could stand for good at the "swing out to its
     side" point: its middle was still level with the block's side. It now goes on round to the rear.
   - The Rule held: Templar knights held back by a living Marshal no longer charge foot that comes
     near. They ride back to their place.

### 7.3 Measured (same seeds; v16 → after)

| | v16 | after |
|---|---|---|
| Idle rider-seconds, all battles (riders ever idle) | 1,884 (29%) | 53 (4%) |
| ... of which at 1,200 a side | 1,584 (33%) | 26 (3%) |
| Stacked riders, per 1,000 rider-ticks | 1.33 | 1.50 |
| Into the front of braced spears with an open flank, per charge, demo battles | 5 / 323 | 3 / 274 |
| Left behind after a ride out (rider-seconds / ride-outs), demo battles | 186 / 83 | 54 / 70 |
| Horse archers with an enemy within 12 (‰ of their ticks) | 31 | 61 |
| Riders' kills / riders lost, demo battles | 1,506 / 1,359 | 1,950 / 1,516 |
| Battle length, mean of the eight demo battles (of `pnpm bench`'s ten) | 125 s (122 s) | 142 s (115 s) |
| Clash of light horse, 30 a side, 8 seeds: blocks that broke off, re-formed and charged again (`cohesion.test.ts` set-up) | 25 | 24 |

Notes on the table:

- **Idle that is left.** Most of the remaining idle time is horse archers standing to shoot with foot
  within 40.
- **Horse archers.** Their number rose with hunting (it moves between 40 and 65 from one build to
  the next, with the battles' course). Enemy light horse now chases them down where it used to sit
  behind its own front. They ride off from it, but are sometimes caught.
- **Into the pikes, set pieces.** The frontal-charge set pieces still put rash knights straight into
  the pike wall (19 of 32), by design.
- **Kills.** The riders' kills rose by about 30%: men who used to sit idle now fight.
- **Balance.** Mirror fairness at 250 and 120 a side: 51.5% and 47.5% (z 0.4 and -0.7). Faction
  pairs (60 seeds each way, 250 and 1,000 a side) moved within the noise. Templar–Samurai: 52/50%
  (v16 51/52%). Samurai–Undead: 58/61% (v16 62/50%). Undead–Templar: 42/48% (v16 43/39%).
- **Speed.** `pnpm bench` is unchanged.

### 7.4 Test changes

`frontalCharge` (`src/game/testing.ts`) measures how far a charge got into foot *through its front*:

- **Riders who ride round.** A rider who rides round the end of the block and comes in at its side or
  rear is no longer counted as having broken in.
- **When it stops.** It stops when the horse stops charging and fighting, so the last stragglers to
  turn away in a ride-out do not count either.

The assertions in `collision.test.ts` are unchanged. Two other tests needed changes:

- **`game.test.ts` (waver, break, rally).** The test now runs seeds 1–4. In the changed battles no
  block rallied in seeds 2–4. Over 24 battles as many blocks rally as before (25 against 19).
- **Shooters' anchor (`survey`).** A shooter's block pulled after its men now counts as having moved,
  so its shooters hold for a moment. The changed battles exposed a block of archers that loosed
  0.1 s after it was pulled, which broke the "never loose while moving" test.

### 7.5 Left

- **The charge itself is still a formed block.** It closes on its slots at spring 2.5, so a re-charge
  from a loose rally looks tidy again within a second or two. A softer spring for horse at the
  charge would keep the line ragged.
- **Horse archers.** They still stand to shoot with foot a little over 40 away. A Cantabrian circle
  (riders loosing on the move in a loop) would replace the standing volley.
- **Pursuit of horse that rides out.** Horse that wins a clash still charges after a beaten block that
  is riding out. It often catches it re-forming, which is realistic but makes some cycles one-shot.


### 7.6 Horse against shooters at the new ranges (after the scale rework)

At three times the bowshot the light horse rode at the archers alone from the first second, and
the Templar knights waited for the Marshal's signal, which needs the lines to meet; against an
army that holds and shoots they never do, so the knights stood at home (in one traced battle
until 200 s) while the light horse and then the foot were shot and ground down. Horse beat bows
at equal value in 2 battles of 12. A commander outshot (`horseStrike`: the enemy's bows and
crossbows worth twice his own, before the lines meet) forms all his horse up 60 beyond their
reach, level with its places, at a trot; when every block is there (or after 30 s, or as soon
as any is shot at) it all goes in at once, the knights with it (T1: the Marshal gives the signal
with the order, at the shooters, and again at the next as soon as the last are gone; shooters in
the open are ridden down from the front, not taken in the rear). It crosses the 600 of the
beaten zone in about 12 s, under arrows that mostly miss riders at the gallop (missile-drill.md,
"Rates of fire (v17)"). Horse now beats bows in 12 of 12 (28 of 30 after the foot work of
section 8, which had it at 5 of 30). Templar knights held for the signal whose enemy horse is
gone wait for the word rather than ride on at the shooters behind it.

---

## 8. Each man his own captain: foot (battle v17)

The user's next complaint was that the battle was still too rigid and stupid:

> "Each soldier gotta think for itself! [...] formation is something individual units aspire to do, but
> they only know about the people next to them [...] there shouldn't be a single person on the
> battlefield where you wonder why aren't they doing X."

### 8.1 The audit: `scripts/battle-sanity.ts`

The script fights demo battles (`demoSetup`, seeds 3, 7, 11 and 23 at 450 and 1,200 men) and checks every man every 0.2 s. It counts the states a real soldier would not be in.

- **"Idle"** means a man with no foe, moving under 2 units a second.
- **"In reach"** is the reach `survey` uses: both men's radii plus 3.
- Run it with `--why` to break each fault down by what the men were doing.

The faults it counts:

| Measure | A man (or block) who... | Out of |
|---|---|---|
| idle-free-foe | is idle over 3 s with an enemy on foot within 30 whom nobody of ours is fighting, with no enemy between them | foot within 30 of an enemy |
| idle-near-fight | is idle over 3 s within 30 of an enemy while his block is locked in melee (partly right: rear ranks backing the front) | the same men, in engaged blocks |
| idle-gap | is idle over 2 s in an engaged block, an enemy within 20, with the ground a step toward that enemy free of friends | the same, enemy within 20 |
| walks-away | walks away from an enemy in reach at over 3 units a second, without routing. Excused: an order to fall back, a skirmisher falling back, the wounded going to the rear, a breather, or closing on his own foe | foot with an enemy in reach |
| foe-ignored | has an enemy in reach and no foe for over 1 s | the same |
| stacked | stands in a friend (centres under half the two radii apart) | all men |
| jumps | moves over 2.2 times his speed in a tick, outside a charge or a chase | formed foot |
| block-idle | is a block of the line, not fighting, within 60 of an enemy block locked with ours, for over 10 s | blocks of the line |
| missile-idle (report only) | is a loaded shooter with an enemy block in range who has not loosed for twice his reload plus 3 s | the same |

Context measures, which are not faults:

- **engaged-idle:** the share of an engaged block with no foe in reach.
- **wrapping:** the share of fighters standing beyond the end of their foe's front.
- **march-wave:** the spread of the front rank along the facing while advancing, in units.

### 8.2 Before and after (v16 field, before the merge)

The faults are in % of the samples they apply to.

**All eight demo battles** (2 Undead–Templar, 4 Templar–Templar, 2 Samurai–Samurai):

| Measure | v16 | v17 |
|---|---|---|
| idle-free-foe | 0.39 | **0.11** |
| idle-near-fight | 2.99 | **1.72** |
| idle-gap | 0.42 | **0.24** |
| walks-away | 1.18 | **0.66** |
| foe-ignored | 2.83 | **0.33** |
| stacked | 0.36 | 0.22 |
| jumps | 0.000 | 0.000 |
| block-idle | 2.66 | **0.70** |
| missile-idle (report) | 42.3 | 45.4 |
| engaged-idle (context) | 58.5 | 54.1 |
| wrapping (context) | 26.6 | 30.7 |
| march-wave (context, units) | 3.18 | 2.82 |

**The same seeds, Templar against Samurai:**

| Measure | v16 | v17 |
|---|---|---|
| idle-free-foe | 0.17 | **0.05** |
| idle-near-fight | 1.64 | **0.69** |
| idle-gap | 0.37 | **0.12** |
| walks-away | 0.90 | **0.71** |
| foe-ignored | 1.40 | **0.14** |
| stacked | 0.18 | 0.22 |
| block-idle | 1.73 | **0.77** |
| missile-idle (report) | 42.6 | 49.8 |
| engaged-idle (context) | 56.3 | 53.3 |
| wrapping (context) | 28.7 | 32.2 |
| march-wave (context, units) | 3.88 | 3.22 |

What `--why` showed in v16:

- **foe-ignored** was mostly men swinging round a flank (P6). Their leash ran from their old place in the block, so they walked past the very enemy they had been sent round for.
- **walks-away** was mostly men turning from an enemy at hand to go for the one they had picked earlier.
- **block-idle** was second-line blocks standing in reserve beside an enemy block whose flank was open. The other cases were spears braced against horse that was fighting someone else.
- **Shock foot (mass 2.4) were taken for horse** wherever the code tested `mass > 2`. That covered choosing a foe, the horse's turning limit, the breathers, the wounded and the rider's bow wave. Mounted is now by class (`Store.mt`).

### 8.3 What changed (battle.ts unless noted; numbers in `COHESION`, command.ts)

- **Station keeping (`station`, `dresses`, `Regiment.nb`).**
  - A man of a foot block makes 35% for his place in the block (`dressSlot`), with his P1 lead. The other 65% is where the men beside him and the man ahead in his file put him: a file's width from each, a rank behind.
  - So a line on the move bends and dresses itself, as each man sees only his neighbours. A wheel bends rather than turning as a ruler.
  - When the man ahead falls, in contact, he steps up into the hole and dresses on the men beside it. He does not wait for the files to close (P5's 1.5-2.5 s).
    - Not if an enemy has stepped into the hole: then he fights him from where he stands.
  - Men fighting a foe do not count as neighbours. They stand where their foes put them, and dressing on them drew the men beside them into the enemy: enemy overlap p99 rose from 0.90 to 1.06 radii (`collision.test.ts`, limit 1). It is 0.92 now.
  - Only foot of the line keeps station this way. Shooters keep their ranks, because their volleys depend on it. Skirmishers fight as a loose crowd: a line of archers that closed up behind every fallen man stopped knights charging through it.
- **Choosing a foe (`seek`).**
  - A foe at hand comes before any other, and is fought wherever the man stands: no leash.
  - A foe others are fighting counts as 1 + 0.5 a man further (`crowd`), so men spread along the enemy front.
  - A curling man's leash runs from where he is.
- **Initiative (`seek`, `open`, `Store.idl`).**
  - A man in contact with no foe for longer than his patience (2 s, the eager sooner) looks 5.5 files about him, every 1.2 s. He looks for an enemy on foot whom at most one of ours fights (he makes it two on one rather than stand by, `roamJoin`) and whom he can get at: the outer file to a man beside the block, its front rank to a man before it, its rear rank to a man behind.
  - Then he goes for him: round the end of the fight, through a gap, or onto the flank.
  - Foot does not go hunting horsemen.
  - This applies against the undead too (`roamDead`). Fairness is in 7.4.
- **The captain's initiative (`initiative`).**
  - An uncommitted reserve block, steady and not spent, goes in on its own when it sees the open flank of an enemy block locked with ours. The flank must lie within its own width plus depth plus 20, with nobody of ours already going there.
  - The ticker says the general "sees a reserve [...] go for an open flank on its own".
- **Spears** brace against horse that is fighting someone else only when it is within 40.
- **Facings against wheels** (`turnFoot`, `faceAbout`). A foot block that must turn a long way faces round man by man and re-forms when that is quicker than the wheel. It does not face with enemy horse about. A block locked to its front turns only its rear ranks on an enemy behind it. Details and sources are in `formations.md` section 2.5.1.

### 8.4 After the merge with the scale and cavalry work (field 2400 x 2400)

The same audit on the merged branch: v17 base (scale and cavalry, no foot work) against v17 with the foot work.

| Measure | All 8, base | All 8, foot | Templar-Samurai, base | Templar-Samurai, foot |
|---|---|---|---|---|
| idle-free-foe | 0.35 | **0.12** | 0.16 | **0.04** |
| idle-near-fight | 2.42 | **1.63** | 0.99 | 0.94 |
| idle-gap | 0.46 | **0.23** | 0.23 | **0.16** |
| walks-away | 0.86 | **0.67** | 0.93 | **0.71** |
| foe-ignored | 1.13 | **0.39** | 1.09 | **0.27** |
| stacked | 0.098 | 0.071 | 0.099 | 0.076 |
| jumps | 0 | 0 | 0 | 0 |
| block-idle | 0.19 | **0.11** | 0.18 | 0.10 |
| missile-idle (report) | 21.5 | 25.3 | 29.0 | 31.6 |
| engaged-idle (context) | 57.2 | 55.9 | 62.3 | 58.6 |
| wrapping (context) | 25.4 | 28.5 | 29.9 | 30.8 |
| march-wave (context, units) | 2.55 | 2.35 | 3.56 | 2.92 |

The march-wave is lower because the line now bends smoothly (each man dresses on his neighbours), where before it was the scatter of each man's own lead. The approach is still ragged; the slot-distance test in `cohesion.test.ts` (P1) passes unchanged.

### 8.5 Balance and speed

**Before the merge** (v16 field):

- Mirror: 53.0% at 250 a side (200 seeds), 50% at 1,000.
- Factions, 120 battles each, against v16:
  - Templar–Samurai: 50.0% (v16 50.8%) and 43.3% (51.7%).
  - Undead–Templar: 41.7% (42.5%) and 53.3% (39.2%).
  - Undead–Samurai: 41.7% (38.3%) and 55.8% (50.0%).
- Horse against bows: 56% of 120 days (v16 62%).

**After the merge**, 80 battles each:

| Match | v17 base | v17 with foot |
|---|---|---|
| Templar–Samurai, 250 / 1,000 | 38.8% / 36.3% | 35.0% / 45.0% |
| Undead–Templar, 250 / 1,000 | 37.5% / 43.8% | 46.3% / 40.0% |
| Undead–Samurai, 250 / 1,000 | 30.0% / 36.3% | 27.5% / 43.8% |
| Mirror, 250 (200 seeds) | 50.5% | 55.0% (z 1.4) |

- The base was already uneven after the scale change: the Samurai are strong. That is not this work.
- Battle length is unchanged.

**Speed** (the first 2,000 ticks, 2,800 a side, best of 2): base 1.37-1.45 ms a tick, foot 1.62-1.79. The foot battles are further into the melee by then (they end in about 1,700 ticks), so part of the gap is more fighting to compute. Station keeping and the wider look are most of the rest, about 10% on an equal workload before the merge.

### 8.5a Facing horse in place (follow-up)

Foot now faces horse in place: see `formations.md` §2.5.1. Measured on the merged base, which already has the foot work, against the same with in-place facing:

| Measure | Before | After |
|---|---|---|
| idle-free-foe | 0.12 | 0.05 |
| idle-near-fight | 1.63 | 1.53 |
| idle-gap | 0.23 | 0.15 |
| walks-away | 0.67 | 0.67 |
| foe-ignored | 0.39 | 0.42 |
| stacked | 0.071 | 0.092 |
| block-idle | 0.11 | 0.25 |
| missile-idle | 25.3 | 24.0 |
| wrapping | 28.5 | 25.4 |

- Mirror: 50.5% at 250 a side (200 seeds).
- Speed: unchanged, 1.43-1.62 ms a tick against 1.49-1.68 for the first 2,000 ticks at 2,800 a side.

### 8.5b Friendly blocks keep out of each other (follow-up)

The user saw "two friendly regiments intersecting at an angle like an X shape [...] regiments basically should never run into each other".

**The measure.** `scripts/battle-crossing.ts` uses `blockCrossings` in `overlap.ts`. It counts, for each pair of friendly formed blocks, the men of one standing inside the other's footprint, over 18 grand battles (`demoSetup`, seeds 1-6 at 1,500, 2,800 and 4,000 men). Some cases are drill or loose order and are left out: skirmishers, shooters passing back through their line, chases, and two bodies both in open order.

| | v17 base | With giving way |
|---|---|---|
| Crossing block-pairs, per sampled second | 3.23 | 0.32 |
| ...through a quarter of a block or more | 1.94 | 0.15 |

**The causes, by `--why`:**
- Two reserves sent behind the same first-line block (the largest share).
- Reserves and second lines marching through the archers.
- Blocks wheeling or facing into a neighbour.
- Two blocks of the line fighting the same enemy, one at its front and one at its flank.

**The fix** (`giveWay`, `crowded`, `rightOfWay`, `clearGoal` in battle.ts):
- **Nobody marches into a friend.** A block about to step into one drops the part of its step that goes in, and goes round toward its goal or halts.
- **Held up behind a friend, it makes for the ground beside him** and keeps that way round for 6 s (`dodgeFor`).
- **A block standing in a friend with the right of way backs out.** The right of way goes to the block locked in a fight, then one standing, then one charging, then one marching. Between equals, the first in the order of battle has it.
- **A goal in a friend's place is moved out sideways** along his front.
- **Wheels, facings and re-forming stop short** when they would sweep into a friend.
- **No two reserves stand behind the same block.**
- **Exempt:** skirmishers, shooters falling back, chases, horse at the charge or riding out, and two bodies both in open order. Archers among archers stack as before: with them giving way, the back row of a large body of archers stood out of range, which halved the arrows that landed.

**What is left.** Most of what remains is horse against horse at the charge or riding out (cavalry's paths), and the general's household among the archers.

**Effect on the battle:**
- Sanity measures change little. block-idle rose from 0.11 to 0.35 and wrapping fell from 29% to 25%: blocks no longer pile into a fight through their friends.
- Mirror fairness at 250 a side: 47.5% (200 seeds).
- Speed: 1.32-1.64 ms a tick against the base's 1.23-1.45, for the first 2,000 ticks at 2,800 a side.

**Tests:** `src/game/crossing.test.ts`.
- Grand battles: blocks of foot a quarter deep in a friend under 0.1 per sampled second (base 2.06).
- A set piece of two friendly blocks ordered across each other's roads: at most 5% of either stands in the other (base 20%), and both reach their goals.

### 8.5c Each block of archers on its own spot (follow-up)

Shooters with no target in range made for the spot straight before the nearest enemy, at 0.8-0.85 of their range. Every block sent at the same enemy went to the same spot, so ten blocks stood five deep on two spots.

**Where a block now goes** (`firingSpot`, `spotTaken`):
- The spot on the ring of its range straight before the enemy, if that is free.
- If not, one block's width and an interval to either side in turn, staying on the ring so it is still in range.
- If the front of the ring is full, a spot behind an interval.

A spot counts as taken when another block of shooters stands there or is making for it.

**Two other changes:**
- A block that stopped on top of another, because both came into range at once, steps off to its own spot if the other is earlier in the order of battle.
- Shooters now give way to shooters like any other blocks. Only horse in open order still passes through horse.

**Measured.** `blockCrossings` now counts shooters on shooters. Shooter-on-shooter crossings a quarter of a block deep or more, per sampled second over 18 grand battles:

| | Base | With own spots |
|---|---|---|
| Both standing to shoot | 1,002 | 20 |
| Both advancing | 491 | 0 |
| All pairs, any kind | 0.53 | 0.20 |

**Test** (`crossing.test.ts`):
- Ten archer blocks against heavy foot waiting for them. At most a quarter of one block may stand in another (the base reaches 0.9), and most of the blocks must be shooting.
- The "shield wall" test in `game.test.ts` now lets the archers shoot for 270 s instead of 180. Spread out, they come into action later: at 180 s the line had lost 3 men over three days, so the old result came from stacked fire. At 270 s the losses were line 199, loose 71, shield wall 19.

### 8.5d Horse and the household ride round their friends (follow-up)

8.5b left two things: horse galloping through friendly horse or foot at the charge or riding out, and the general's household among its own archers. Real riders steer round friends. They open their intervals, pass through gaps in the line, or check their pace.

**The measure.** `blockCrossings` now counts the household from three riders (it is seven), and `scripts/battle-crossing.ts` sums the pairs with horse in them. Same 18 grand battles, merged branch before and after:

| | Before | After |
|---|---|---|
| Pairs with horse in them, per sampled second | 0.240 | 0.048 |
| ...through a quarter of a block or more | 0.157 | 0.024 |
| All crossing pairs, per sampled second | 0.419 | 0.229 |
| ...through a quarter of a block or more | 0.184 | 0.055 |

**The causes, by `--why`, before:**
- Light horse charging through light horse that was charging or in melee: 310 of the samples. Two or three blocks sent at the same enemy horse converged on it.
- The household guarding through its archers: 83. It was deployed in the middle of their row.
- Knights in melee among foot fighting the same block: 126. Most of this is still there (below).

**The fix** (`rideRound` in battle.ts, at each word for every mounted block not locked in a fight):
- **The goal comes out of any friend it lies in.** It moves to the side of that friend the block stands on, across or along him, whichever is shorter, so the block need not ride round him to get there.
- **The ride goes round the first friend in the way.** A straight ride to the goal that would cross a friend's footprint, plus half the block's width and a horse's length (`RIDER.room`), makes for the end of that friend nearer the line of the ride and goes on from there. Up to three friends deep.
- **Who goes round.** Foot is always ridden round. Another block of horse that is charging, riding out or riding round is passed only by the block without the right of way (`rightOfWay`), so two lines of horse never both swerve.
- **Riding out.** Riders make for their spots about that point, not about the rally point, so the loose crowd goes round as well. Its room is the crowd's width, 1.4 times the block's.
- **The household deploys behind the archers and the second line,** a horse's length clear of them, before the engines.

**The charge keeps its punch.** In a set piece of three blocks of light horse in column charging three abreast, the blocks behind galloped through the one before (40-70% of a block's men inside it). Now none do, and the first blows land at the same tick as before (75-76).

**Effect on the battle:**
- Battle length: 233 s against 224 s over 40 mirror battles of 500 Templars, the same within the noise for 1,000 samurai or undead.
- Pre-merge faction pairs (120 battles each): lengths 216-264 s against 222-260 s.
- Mirror fairness: 55.0% at 250 a side (z 1.4), 47.5% at 120.
- `pnpm bench`: speed unchanged.

**What is left:**
- **Horse in a melee mingling with friends about the same enemy block** (knights in melee with our foot in melee, the largest remaining pair). Both are locked in the fight, so `rideRound` does not touch them, and riders fighting at a block's edge stand among its places.
- **The household passing through its archers once the archers march past it** (14 samples).

**Tests:** `src/game/crossing.test.ts`.
- Grand battles: pairs with horse through a quarter of a block, neither locked in a fight, under 0.04 per sampled second (before: 0.19). Household pairs under 0.05.
- The column-of-horse set piece above.

### 8.5e Knights keep out of our own foot's ranks; the household gives way (follow-up)

8.5d left two things: knights fighting among our own foot when both are locked in melee with the same enemy block, and the household caught in its archers as they march past it. Real knights do not wade into their own foot's ranks. They hit another stretch of the enemy front, a flank or the rear, or pull out and charge again.

**The fix:**
- **`covered`.** A rider behind the front of our foot, within its frontage, does not take a man our foot is fighting at its front (within 8 of it). That goes for his first pick (`seek`) and for his own search (`hunt`). He takes another stretch, the flank or the rear (`flankPoint`). A rider at that foot's flank, or past its front, still takes the man.
- **`amongFoot`.** A rider who finds himself in our foot's ranks rides out to their nearer flank, or back out of their rear, at 0.6 of his speed. This holds at the gallop too, and he then picks another man.
- **`inOurRanks`.** A block of horse locked in a fight with three in ten of its riders in our foot's ranks breaks off and charges again, as a cycle charge does (not blown, not more than four times). Its next ride goes round the foot (`rideRound`).
- **The household gives way.** While it keeps its place (guard or hold), it gives way to friendly blocks like any other block (`yields` → `giveWay`, by `rightOfWay`). It does not give way when drawing back from a block too big for it, or when riding to fight.

**The measure.**
- **`blockCrossings` change.** It no longer counts the places of horse locked in a fight: its riders fight where they stand, and foot men standing in its places are not in it. Its riders standing in another block's places still count.
- **Riders in our ranks.** `scripts/battle-crossing.ts` also counts riders pressed into our foot's ranks (two foot friends within touch).
- **Results.** Same 18 grand battles, with the new rule applied to both runs:

| | Before | After |
|---|---|---|
| Pairs with horse in them, per sampled second | 0.032 | 0.018 |
| ...through a quarter of a block or more | 0.010 | 0.009 |
| Knights in melee among our foot in melee (samples, top pairs) | 56 | 0 |
| Household pairs (samples) | 11 | 2 |
| Riders pressed into our foot's ranks, per sampled second | 0.05 | 0.05 |

**Not timid.**
- **Horse kills.** Over 30 demo battles at 700 a side, horse killed 5,166 (before: 5,337) and lost 2,989 (before: 3,003). Battles ran 229 s (before: 232 s).
- **Fairness.** Mirror fairness was 50.5% at both 250 and 120 a side.
- **Speed.** `pnpm bench` is unchanged.

**What is left:**
- **Foot marching into the places of horse that is riding round or holding.** Spears bracing, or a block advancing, into knights in reserve. This is the largest remaining pair, about 12 samples. Foot's `crowded` sees horse as a rectangle, and horse at the charge or riding out is exempt from giving way.
- **Two blocks of light horse charging the same enemy horse.** This still happens at the edges (about 6 samples).

**Tests:** `src/game/crossing.test.ts`, a set piece. `covered` is true for a rider behind our foot's front and false for one past its end, and `amongFoot` likewise. Riders standing in our foot's ranks ride out within 6 s.

### 8.6 Not done

- **Idle men face their regiment's front.** The renderer turns a man to his foe only when he has one, so an idle rear-ranker of a block that has turned its rear ranks about still shows his back to the enemy. That fix is in `scene.ts`, which belongs to the renderer.
- **missile-idle stays high.** Most of it is shooters with a target block whose men are out of their reach, or whose shots are held for friends in the line of fire. Ranges belong to the scale agent.
- **Wide lines do not turn in sections.**
- **`game.test` "horse beats bows at equal value" failed on the merged branch** (5 of 30 days). Fixed by the horse work in section 7.6: 28 of 30.
---

## Sources

- Thucydides 5.71–72: https://cts.perseids.org/read/greekLit/tlg0003/tlg001/1st1K-eng1/5.71.1-5.71.3 ; https://livius.org/sources/content/thucydides-historian/the-battle-of-mantinea-418-bce
- Ardant du Picq, *Battle Studies* (Gutenberg): https://www.gutenberg.org/files/7294/7294-h/7294-h.htm
- Sabin, "The Face of Roman Battle", JRS 90 (2000): https://www.gwern.net/doc/history/2000-sabin.pdf
- ACOUP, "Intermission: Battle Pulses": https://acoup.blog/2025/12/18/intermission-battle-pulses/
- ACOUP, "Shield walls and spacing": https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/
- Keegan, *The Face of Battle* (1976), ch. 2 "Agincourt" (paraphrased from memory)
- Battle of Arsuf: https://en.wikipedia.org/wiki/Battle_of_Arsuf
- Battle of Agincourt: https://en.wikipedia.org/wiki/Battle_of_Agincourt
- Battle of Bannockburn: https://en.wikipedia.org/wiki/Battle_of_Bannockburn
- Battle of Nagashino: https://en.wikipedia.org/wiki/Battle_of_Nagashino ; Battle of Sekigahara: https://en.wikipedia.org/wiki/Battle_of_Sekigahara ; Battles of Kawanakajima: https://en.wikipedia.org/wiki/Battles_of_Kawanakajima
- *The Knight in Battle*: https://warhistory.org/fr/article/the-knight-in-battle
- Maniple intervals: https://www.karwansaraypublishers.com/blogs/gary-brueggemans-the-roman-army-ancient-warfare/gaps-in-the-formation ; https://researchconnect.suny.edu/en/publications/roman-infantry-tactics-in-the-mid-republic-a-reassessment/
- Ashigaru: https://en.wikipedia.org/wiki/Ashigaru ; sonae: https://balagan.info/musing-on-yoshimotos-very-bad-day
- Total War community discussions: https://steamcommunity.com/app/214950/discussions/0/620713633859279488 ; https://steamcommunity.com/app/4700/discussions/0/3415433928552976930 ; https://www.gamestar.de/artikel/total-war-rome-2-guide-tipps-zu-den-schlachten-neuerungen,3027565.html
- Game screenshots (study only): Steam store pages for apps 4700 (Medieval II), 261550 (Bannerlord), 502520 (Ultimate General: Civil War), 1468720 (UEBS 2).
- Manuscripts and paintings via Wikimedia Commons (public domain): Morgan Bible leaf, Froissart Crécy and Poitiers, Holkham Bible f.40, Heller's *Pavia*, Nagashino and Sekigahara screens, Sengoku battle screen detail; Tewkesbury reenactment photo (CC BY-SA).
