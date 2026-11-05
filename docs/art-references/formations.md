# Medieval formations and manoeuvres: scale research for the battle sim

Researched 2026-11-03 for the battle sim in `src/game/battle.ts`. Text and numbers only: no images were downloaded or reused. Sources are linked inline and listed in section 10.

Tags used throughout:
- **[S]** stated by the linked source (quoted or closely paraphrased).
- **[D]** derived by me from a sourced figure; the arithmetic is shown.
- **[E]** my estimate with no source. Treat as a starting value to tune in play.
- **[W]** weak source: forum post, fan wiki, Steam comment or search snippet I could not confirm on the page.

Fetch problems: the [tw-modding wiki](https://tw-modding.com/wiki/Creating_a_Shield_Wall_formation) returned HTTP 503; the Templar Rule pages on Wikipedia returned 404; the [Total War Academy](https://academy.totalwar.com/category/battle/) redirected and was not followed. Gaps are listed in section 9.

---

## 0. Bottom line

- Close-order men were about 0.9 m apart across the file; open order about 1.8 m [S, see 2.1]. Our sim already has line infantry at 5.3 units (about 1.0 m) and loose at 8.8 units (about 1.7 m), so the infantry side is right.
- Real missile reach is far larger than a 300 m field: an English longbow's extreme range was about 270 m [S Agincourt], and a musket's effective point-target range about 91 m [S Brown Bess]. Ranges must be compressed by roughly 2 to 4 times to fit one screen.
- Cavalry is the main thing to loosen for readability. Horses at knee-to-knee are about 1.0 to 1.2 m apart [E]; the sim uses 9.0 units (about 1.7 m) for shock cavalry. Keep their turning slow and wide [S Lines of Battle principle], and cap charges to a short, visible run-up.
- Anchor: 1 world unit = 0.19 m. This follows from the sim's own man radius (2.4 units for line infantry, roughly 0.45 m) giving a file interval of about 0.9 to 1.0 m. The 1600 x 1200 unit field is then about 304 m x 228 m.
- Fit: at 1.1 screen pixels per unit, the full field is 1760 x 1320 px, which fits a 2560 x 1440 window with a HUD. A man is then about 5 px wide: units read as coloured blocks, and individual figures need a 2x close zoom.

---

## 1. Sim baseline (current code, for comparison)

Values read from `src/game/battle.ts` and `src/game/units.ts`. I did not run the sim; the unit conversions use the 0.19 m/unit anchor above.

| Item | Current value | Real-world equivalent (at 0.19 m/unit) |
|---|---|---|
| FIELD_W x FIELD_H | 1600 x 1200 units | about 304 x 228 m |
| TICK_S, TICKS_PER_SECOND | 0.1 s, 10 per s | - |
| MAX_TICKS | 3600 (360 s, 6 min) | battle length cap |
| MAX_FIGURES | 2800 drawn figures | see 7.9 |
| Line infantry man radius | 2.4 (elite line 2.9, sergeant-type 2.3) | 0.46 m (0.55 m) |
| Line file interval (`spacing = 2*rad + GAP_IN_RANK*stance.gap + stance.add`) | 4.8 + 0.5 = 5.3 | 1.0 m |
| Loose line infantry | 4.8 + 0.5 + 3.5 = 8.8 | 1.7 m |
| Skirmisher (default loose) | 4.2 + 3.5 + 3.5 = 11.2 | 2.1 m |
| Missile (loose) | 4.2 + 1.2 + 3.5 = 8.9 | 1.7 m |
| Horse archer (loose) | 6.8 + 2.4 + 3.5 = 12.7 | 2.4 m |
| Shock cavalry (line stance) | 7.6 + 1.4 = 9.0 | 1.7 m |
| Regiment width | (cols - 1) * spacing + 4 | - |
| Infantry speed (line 22, heavy line 18) | 18 to 22 units/s | 3.4 to 4.2 m/s |
| Shock cavalry speed | 52 | 9.9 m/s |
| Horse archer speed | 66 | 12.5 m/s |
| Skirmisher speed | 34 | 6.5 m/s |
| Missile range (bow 175, 145; horse archer 130; skirmish 70; siege 330) | - | 33 m, 28 m, 25 m, 13 m, 63 m |
| Turn step | `w = clamp(speed*0.08/(width/2+8), 0.012, 0.15) * stance.turn` per tick | units not confirmed (see 7.5) |
| Stance pace multipliers | line 1, column 1.1, shieldwall 0.5, pikewall 0.35, braced 0.3 | - |

Notes:
- `speed` is taken as world units per second. This assumption is not confirmed in the code; check it before tuning.
- Infantry at 22 units/s (4.2 m/s) is a run, not a march. Real marching pace is about 1.2 to 1.4 m/s [E]. See 7.3.

---

## 2. Infantry

### 2.1 Frontage per man

| Formation | Frontage per man | Tag | Source |
|---|---|---|---|
| Hoplite loose (eis bathos) | 1.8 to 2.0 m | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx) |
| Hoplite dense (pycne) | 0.9 to 1.0 m (half the loose space) | D | derived from the line above |
| Locked shields (synaspismos) | 0.45 m (about 18 in) | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx); [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |
| Greek phalanx "frontage per man = width of shield" | about 3 ft (0.9 m) | S | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |
| Polybius, Macedonian file width (armour and space together) | 3 ft, c. 90 cm | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Asclepiodotus, open order / compacted / shields together | c. 180 cm / 90 cm / 45 cm | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Roman file width (reconstructed) | c. 135 cm | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Shield width (La Tene, Greek) | 45 to 55 cm | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Zurich forces, 1443: 56 men wide in 168 ft | 168 ft = 51.2 m; 51.2 / 56 = 0.91 m | D | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |
| Magersfontein, 3,500 men in 90 lines, 45 yd front | 41.1 m / 38.9 men per line = 1.06 m | D | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |
| Renaissance pike block: "a soldier of three paces frontage and seven paces depth" | area per soldier; at 0.75 m per pace, about 2.3 m x 5.3 m | D/E | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |

Reading: close order in the sources is about 0.9 m per man; open order about 1.8 m; locked shields about 0.45 m. Loose-to-close is a factor of two, which matches our 8.8 vs 5.3 unit split.

Caveat: the pike-block figure is an area per soldier, not a frontage, and the source does not say whether the depth includes rank gaps. Use as a loose upper bound only.

Caveat: our sim cannot show a 0.45 m locked-shield man with its current radius (2.4 units would need to shrink to about 1.2 units). Use the shieldwall stance as a slower, tighter block instead.

### 2.2 Depth (files, ranks) by troop type

| Type | Depth | Tag | Source |
|---|---|---|---|
| Greek hoplites, normal | 4 to 8, "8 is the most common" | S | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation); [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Greek hoplites, ranks "eight men or more" | 8+ | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx) |
| Macedonian sarissa phalanx | 16 (sometimes 32) | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx); [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Epaminondas at Leuctra and Mantinea | up to 50 | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx) |
| Locked shields | half the normal depth (about 8 ranks in the Macedonian case) | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx) |
| Loose order | twice the normal depth | S | [Phalanx](https://en.wikipedia.org/wiki/Phalanx) |
| Roman maniple | 20 wide x 6 deep | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Shallow (2 to 3 deep) | "very rare on actual battlefields" | S | [acoup](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/) |
| Zurich, 1443 | 20 deep | S | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |
| Agincourt, French lines | "about 16 ranks each" | S | [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt) |
| Agincourt, English men-at-arms | "shoulder to shoulder four deep" | S | [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt) |
| Hastings, English shield wall | not given ("small, dense") | S | [Battle of Hastings](https://en.wikipedia.org/wiki/Battle_of_Hastings) |
| Medieval shield wall, typical | not sourced | E | - |

Practical: a deep close-order block of 12 to 16 ranks is well sourced. A 2 to 3 deep block is historically unusual and should only appear as a loose or skirmish stance.

### 2.3 Intervals: rank, file, regiment, line

- File and rank spacing in the Macedonian illustrations: loose 2 m, dense 1 m, locked 0.5 m; the caption does not say whether it is files or ranks [S, [Phalanx](https://en.wikipedia.org/wiki/Phalanx)].
- Rank-to-rank for close order: not sourced. [E] 1.0 to 1.2 m (slightly more than the file interval so men can step and recover); pike blocks 1.5 m; open order 2 m.
- Unit sizes: stichos (file) 8 to 16 men; enomotia up to 32; lochos 100 to about 500; taxis or mora 500 to 1,500 [S, Phalanx].
- Between regiments in a line: not sourced in my results. The Roman maniples had manipular intervals (the quincunx), but the Maniple article was not retrieved. [E] 3 to 5 m between regiments in a line.
- Between battle lines: Agincourt's French vanguard and main battle were "a bowshot length" apart [S, [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt)]. [E] A second line 10 to 15 m (about 50 to 80 units) behind the first is a sensible reading.

### 2.4 Advance, dressing, halts

- Infantry marched in a line that had to stop to re-dress: an about-face or a turn brings the unit to a full stop [S, [Lines of Battle, Time and Movement](https://linesofbattle.wiki.gg/wiki/Time_and_Movement)] (a wargame, but the principle is sound).
- "A line needs a great deal more room to come round than a column does" [S, Lines of Battle]. Column turns quickly, line slowly. This matches the sim's column stance (turn 1.3).
- Dressing halts and the time they cost: not sourced. [E] 2 to 4 s per dressing halt for a regiment in play.

### 2.5 Wheel, countermarch, about-face, column-to-line

- Wheel: the outer file walks a longer arc. For 16 files at 0.9 m (14.4 m front) wheeling 90 degrees [D]:
  - Pivot on the flank: outer file travels 14.4 m x pi/2 = 22.6 m; at 1.3 m/s, about 17 s. Turn rate about 5 degrees/s.
  - Pivot on the centre: outer ends travel 11.3 m; about 9 s at 1.3 m/s. Turn rate about 10 degrees/s.
- Lines of Battle: "Ships cannot pivot on the spot" and "a unit that cannot turn at all has no arc" [S, Lines of Battle]. Men on foot can pivot on a man; cavalry in a block cannot.
- About-face: [S] carries a turning delay, a full stop. [E] 2 to 3 s for an about-face of a regiment, one or two ticks per file stepping.
- Countermarch: not sourced in my results.
- Column-to-line deployment: not sourced in numbers. [E] A column of 16 files deployed to a line in 6 to 10 s.

### 2.5.1 Facings against wheels (battle v17)

The drill books separate two ways for a block to change front [S, 30-33]:

- **Facings**, where every man turns where he stands, at once: Aelian's *klisis* (a quarter turn to either hand) and *metabole* (the about-turn, 180 degrees) [S, 30].
- **Wheels**, where the whole block pivots like a door: *epistrophe* (90 degrees) and *perispasmos* (180) [S, 30]. A wheel is slow and needs room, because the outer file walks the arc.

A facing is quick but has costs:

- After a quarter facing the old files are ranks: the block is deep and narrow toward its new front.
- After an about-turn the rear rank, the worst men, stands in front. That is why the **countermarch** existed: the front-rankers file through the block to the new front, so the best men face the enemy again (Aelian 27, via the Suda) [S, 31].
- In 18th- and 19th-century drill, turns (facings) were the quick move in action and wheels the slow drill-field move. Battalions changed front company by company, not as one rigid block [S, 32, 33].
- A wide line did not pivot as one: the outer man of a wheel walks an arc of (angle x width), so the time grows with the frontage. Wide formations broke the turn into parts, or faced and re-formed.

**How the sim does it** (`turnFoot` and `faceAbout` in battle.ts; numbers in `COHESION.face*` in command.ts):

- **It picks whichever is quicker.** The wheel's time is the angle stepped at the block's own wheel rate (`turnRate`: 9 units a second at the end of a pivot about the middle, so the wider the block, the slower). The facing's time is a moment for the word (`faceDelay`, 0.5 s), a moment to dress (`faceDress`, 1.5 s), and the longest walk any man needs to the nearest place in the block turned to the new front, at the drill's march pace.
- **It faces only when the facing saves at least a tenth** of the wheel (`faceMargin` 1.1).
- **With an enemy within 50 of it** (`faceThreat`), it faces for any turn of 60 degrees and more that facing makes quicker, without the margin. There is no time to countermarch, so the walk is shorter. Smaller turns under threat stay wheels: blocks that faced every few degrees toward horse riding round them never showed a flank, and horse then beat bows in only 19 to 22 of 40 matchups, against 26 to 27 before.
- **A block that has faced round has no front until it has re-formed** (`formedAt`, the estimated facing time). Blows and charges from before it count as from the flank, and its shooters do not loose until then.
- **It never faces for under about 25 degrees** (`faceMinCos`). Blocks of horse never face: horses cannot face in place (section 3.4). Wedges, columns and engines do not face either.
- **On the march, with no enemy close, it wheels as it goes.**
- **With enemy horse within 150** (`faceHorse`), unless that horse is riding off to rally, it wheels. A block that turns about and re-forms as horse rides at it, or among horse already in the fight, is caught in disorder (Patay).
  - Without this rule the heavy foot beside the archers faced round onto horse fighting there, about 7 times a battle.
  - Horse then beat bows in only 50% of 120 matchups, against 62% in v16. With the rule it wins 53%; without any facing, 62%.
- **The facing itself.** Every man turns at once (the regiment's facing changes on the spot). The block's places are laid out afresh about where its men stand, at the new facing, with the same frontage. A man with a foe at hand fights him from where he stands.
  - Under threat, each man takes the place nearest him, so after an about-turn the old rear ranks are the front.
  - With time to spare the sim countermarches: each man keeps his old rank, so the front-rankers walk through to the new front. The time estimate adds the block's depth times the share of the turn past 90 degrees.
  - While the men walk to their new places the line is ragged and dresses on neighbours (station keeping, `battle-cohesion.md` section 8).
- **A block locked in a fight to its front never faces about.** When an enemy block comes within 30 of its back, its rear half turns on it: those men prefer foes behind them, and the front fights on (`rearUntil`, `seek`).
- **Once faced, a block does not face again for 3 s** (`faceEvery`).

**The crossover.** These are the turns at which a block of line foot standing still faces rather than wheels, with no enemy near and today's spacing (5.3 a file, 5.8 a rank). The 20-man and 120-man rows are real block sizes; the others are the same rule for wider blocks, such as the scale agent's looser spacing would make.

| Block | Width x depth (units) | Wheels | Faces |
|---|---|---|---|
| 20 men (smallest block) | 46 x 16 | up to 60 degrees | 90 degrees and more |
| 60 men | 78 x 21 | up to 50 | 60 and more |
| 120 men (largest block, big battles) | 110 x 33 | up to 45 | 50 and more |
| 200 men | 142 x 45 | up to 40 | 45 and more |
| 400 men | 200 x 62 | up to 40 | 45 and more |

- With an enemy close the facing comes sooner.
- In a demo battle a regiment faces round one to two times (60-130 facings in battles of 36-57 regiments).
- Tests are in `src/game/facing.test.ts`:
  - An about-turn under threat takes under 2 s. A wheel would take about 12 s for the same block.
  - A countermarch puts the old front rank in front, and the block is ragged and then re-formed within 8 s.
  - A 110-wide block faces 90 degrees and is re-formed in under three quarters of the time a wheel would take to come round. It also faces 60 degrees, but wheels 30.
  - A 20-man block wheels 30 and 60 degrees.
  - A block locked to its front keeps its facing while its rear ranks fight an enemy behind it.

**Not done:** wide lines turning in sections (company wheels). The facing-and-re-form, with each man dressing on his neighbours, does a similar job. The renderer still shows an idle man facing his regiment's front: a rear-ranker turned about shows it only when he has a foe.

### 2.6 Skirmishers

- Loose order is the defence against missiles. [W, Three Kingdoms wiki] "Loose formation widens the gaps between soldiers, which makes them harder to hit with arrows but weakens their charge resistance." Source: [Total War Wiki, Three Kingdoms formations](https://totalwar.fandom.com/wiki/Formation_(Total_War:_Three_Kingdoms)).
- Real skirmish spacing: not sourced. [E] 2 to 4 m between skirmishers, about 10 to 20 units.

### 2.7 Archers, crossbowmen and pavises

- Agincourt: English archers were on the flanks, "driving pointed wooden stakes, or palings, into the ground at an angle to force cavalry to veer off." Men-at-arms in three groups in the centre (York, Henry, Camoys). Archers about 7,000, men-at-arms about 1,500 [S, [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt)].
- The Agincourt article does not mention wedges or herses. Those are not confirmed by my sources.
- Crossbow rate: "Usually these could shoot only two bolts per minute versus twelve or more with a skilled archer" [S, [Crossbow](https://en.wikipedia.org/wiki/Crossbow)]. This matters for ratio: a crossbow line is roughly a sixth of the volume of a bow line.
- Pavise: crossbowmen used shields (pavises) "to protect the operator from enemy fire"; the same article describes teams where one person operates a cocked crossbow while others reload [S, Crossbow].
- Longbow rate of fire: not in my results. [E] 6 to 10 aimed shots per minute.
- Crossbow and pavise line spacing: not sourced. [E] Crossbowmen in pairs, about 1.5 to 2 m per man, pavises touching.

---

## 3. Cavalry

### 3.1 Frontage per horse

- [W] Field of Glory II forum, citing Lehnart: "120 heavy or medium cavalry need 100m frontage when deployed the usual 3 horses deep." That is 40 files, so 100 m / 40 = 2.5 m per horse [D, secondary]. Source: [Field of Glory II forum](https://steamcommunity.com/app/1368870/discussions/0/3115898713383237243).
- Knee-to-knee: not sourced in numbers. [E] Horse body about 0.6 to 0.7 m plus knee and rider space gives 1.0 to 1.2 m centre-to-centre.
- Early-modern knee-behind-knee formations are reported [W, forum]. These are later than the medieval period; do not use them for medieval design.
- Charge sustainability: "horses refusing to gallop into the dense mass of enemies" [S, [Charge (warfare)](https://en.wikipedia.org/wiki/Charge_(warfare))]. The charge is about keeping formation as much as speed.

### 3.2 Depth: lances, conrois, squadrons

- Arsuf: "a core of twelve mounted regiments, each with a hundred" knights [S, [Battle of Arsuf](https://en.wikipedia.org/wiki/Battle_of_Arsuf)]. That is 1,200 knights in the column.
- Arsuf: Ayyubid heavy cavalry was in "ordered squadrons" [S, Battle of Arsuf].
- Arsuf: Richard formed "a squadron of picked knights under King Richard and Hugh of Burgundy" [S, Battle of Arsuf].
- Hattin: Crusader cavalry 1,200 knights from Jerusalem and Tripoli plus about 50 from Antioch; infobox lists 3,000 men-at-arms and 500 turcopoles [S, [Battle of Hattin](https://en.wikipedia.org/wiki/Battle_of_Hattin)].
- Templar Rule and squadron sizes: not retrieved (the Wikipedia Templar Rule pages returned 404). [E] A squadron or escadron of 20 to 40 riders, two or three ranks deep, is a reasonable placeholder.
- Depth of a charging mounted block: not sourced. [E] 3 to 4 ranks for heavy cavalry (frontage 12 to 20 horses).

### 3.3 Gaits and the charge sequence

Speeds from [Gait (horse)](https://en.wikipedia.org/wiki/Gait_(horse)) [S]:

| Gait | Speed | m/s (converted) | Note |
|---|---|---|---|
| Walk | about 7 km/h | 1.9 | average |
| Trot | about 13 km/h | 3.6 | average |
| Canter | 16 to 27 km/h | 4.4 to 7.5 | "average speed of a canter" |
| Gallop | 40 to 48 km/h | 11 to 13 | average; racehorse peaks higher |

- Gallop endurance: "Horses seldom will gallop more than 1.5 to 3 kilometres before they need to rest" [S, Gait].
- Stride length, racing colt: 7.5 m [S, Gait].
- Forum, early modern (W): charges at "a good round trot" to hold formation. Not medieval; use only as a reminder that formation beat speed.

Derived run-up times from 100 m out [D]:
- Walk: 53 s. Trot: 28 s. Canter at 6 m/s: 17 s. Gallop at 12 m/s: 8 s.

Suggested sequence [E]: approach at trot for 150 m, canter for 40 to 60 m, gallop only for the last 20 to 30 m. A 150 m trot approach at 3.6 m/s takes about 42 s, which is fine within a 6-minute battle.

Feigned retreat: "Modern historians... Normans used feigned flights" [S, [Battle of Hastings](https://en.wikipedia.org/wiki/Battle_of_Hastings)]. Medieval horse feigned flight is well attested; no numbers given.

### 3.4 Turning: horses cannot pivot

- "This is why cavalry at a gallop cannot make a tight corner" [S, Lines of Battle]. No numbers in the source.
- Derived turn rate for a block: heading change rate = speed / radius. For a 20-horse block with a 22 m front [D]:
  - Canter (6 m/s), radius 22 m (1x front): 0.27 rad/s = 15 degrees/s. A 90 degree turn takes about 6 s.
  - Trot (3.6 m/s), radius 11 m (0.5x front): 0.33 rad/s = 19 degrees/s.
  - Gallop (12 m/s), radius 66 m (3x front): 0.18 rad/s = 10 degrees/s. A 90 degree turn takes about 9 s.
- [E] These are plausible for a block at a set pace; they are not sourced.
- Rallying after a charge: not sourced. [E] 10 to 20 s for a regiment to reform, longer if it has scattered.

### 3.5 Horse archers and the Cantabrian circle

- Cantabrian circle: "A group of mounted javelineers and/or archers would form a single-file rotating circle. As each rider came around to face the enemy, he released his missiles, producing a steady volley" [S, [Cantabrian circle](https://en.wikipedia.org/wiki/Cantabrian_circle)].
- Purpose: "to harass and provoke the enemy, break up close formations, and lure some or all of the enemy into a disorganized or premature charge"; riders "did not need a perfect circle, so they could keep their distance" [S, Cantabrian circle].
- Heavy horse archers "shoot five or six volleys at the enemy" before charging [S, [Mounted archery](https://en.wikipedia.org/wiki/Mounted_archery)].
- Mounted archery ranges and rate: not given in my sources. [E] Effective 60 to 80 m, 3 to 5 shots per minute per rider.
- Cao Pi reportedly hit targets from horseback at "one hundred paces" [S, Mounted archery]; treat as anecdotal.

---

## 4. Japanese Sengoku formations

### 4.1 What the sources say

- Kawanakajima, 1561: "The Takeda used the kakuyoku ('crane's wing') pincer, with about 8,000 men under Shingen and about 8,000 under Kosaka Masanobu." [S, [Battle of Kawanakajima](https://en.wikipedia.org/wiki/Battle_of_Kawanakajima)]
- Kawanakajima, Uesugi attack: "kuruma gakari" formation, "in which every unit is replaced by another as it becomes weary or destroyed" [S, Kawanakajima]. This is the closest thing to a rotating block in my sources.
- Kawanakajima army sizes: Uesugi 13,000 left Kasugayama; Takeda 16,000 plus 4,000 en route [S, Kawanakajima].
- Nagashino, 1575: Oda-Tokugawa 38,000 (lead; infobox 38,000 to 72,000); Takeda 15,000 (infobox 15,000 to 20,000); Takeda losses 10,000 killed [S, [Battle of Nagashino](https://en.wikipedia.org/wiki/Battle_of_Nagashino)].
- Nagashino guns: traditional figure 3,000 matchlocks; Shinchō Kōki says about 1,000 guns under five commanders [S, Nagashino]. The article notes some manuscripts were later changed to 3,000.
- Nagashino volleys: the traditional "three-stage shooting" (each stage 1,000 guns, fire then fall back) "is probably a later invention and is not found in Shinchō Kōki" [S, Nagashino].
- The Sengoku period article gives "10,000 Ashigaru arquebusiers" at Nagashino [S, [Sengoku period](https://en.wikipedia.org/wiki/Sengoku_period)]. This conflicts with the Nagashino article's 1,000 to 3,000 range. Do not use the 10,000 figure without checking.
- Ashigaru: "rigorously trained so that they would hold their ranks in the face of enemy fire" [S, [Ashigaru](https://en.wikipedia.org/wiki/Ashigaru)].
- Ratio of guns to bows in the Korean invasions: 2:1 in 1592, 4:1 in 1597 [S, Ashigaru].
- Sekigahara, 1600: 160,000 fought; Ii Naomasa's vanguard "3,600 crimson-clad" troops; Hiratsuka's 360-man vanguard on the Fujikawa Plateau [S, [Battle of Sekigahara](https://en.wikipedia.org/wiki/Battle_of_Sekigahara)]. Fog at dawn; start 08:00 (traditional) or about 10:00 (recent research); about two hours of fighting [S, Sekigahara].

### 4.2 What I could not confirm

- Gyorin, hoshi, ganko, sonae: names not found in the fetched sources, so no spacing or depth numbers for them.
- Ashigaru yari block depth and spacing: not sourced. [E] Block 6 to 8 ranks, about 1.0 m per man, shieldwall-type pace (0.5) with a turn multiplier of 0.7, matching the sim's shieldwall stance.
- Teppo rotation spacing: only the disputed three-stage account. [E] Use a rotating volley: one rank fires and falls back, so one volley per 2 to 3 s from each third of a line.

### 4.3 Use for the sim

- The kakuyoku pincer (two wings either side of a centre) and the kuruma gakari rotation (replace a tired unit with a fresh one) are both simple to build from existing stances: pincer = two flank regiments in `flank` mode; rotation = reserve replacement.

---

## 5. Battlefield scale: army sizes, frontage, distances, ranges

### 5.1 Battles

| Battle | Forces | Frontage / space | Distance / timing | Source |
|---|---|---|---|---|
| Hastings, 1066 | Norman 7,000 to 12,000 (most estimates 7,000 to 8,000); English 5,000 to 13,000 (most 7,000 to 8,000). Normans about one quarter cavalry; English all infantry. | Shield wall frontage not given. | Battle from about 9 am to dusk; Harold's position about 6 mi (9.7 km) from Hastings castle. | [Battle of Hastings](https://en.wikipedia.org/wiki/Battle_of_Hastings) |
| Agincourt, 1415 | English 6,000 to 8,100 (about 1,500 men-at-arms and 7,000 longbowmen); French 14,000 to 15,000 (10,000 men-at-arms). | English line across "a 750-yard (690 m) part of the defile". | French vanguard and main battle "a bowshot length" apart. | [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt) |
| Arsuf, 1191 | Crusaders 11,200 (infobox) to 20,000; Ayyubids 25,000 cavalry (or 35,000 per lead). | Battle plain "1.5 to 3 km wide between wooded hills and the sea". | Pursuit halted after about 1.5 km. Column march 10 km to Arsuf. | [Battle of Arsuf](https://en.wikipedia.org/wiki/Battle_of_Arsuf) |
| Hattin, 1187 | Crusaders 18,000 to 20,000 (or 11,200 incl. infantry in infobox); Saladin about 40,000. | Not given. | Crusader march about 6 mi (9.7 km) to the springs. | [Battle of Hattin](https://en.wikipedia.org/wiki/Battle_of_Hattin) |
| Kawanakajima (4th), 1561 | Uesugi 13,000 (plus garrisons); Takeda 16,000 + 4,000 = 20,000. | Not given. | Battle 18 Oct 1561. Kaizu signal fires reached Kofu "130 km away". | [Battle of Kawanakajima](https://en.wikipedia.org/wiki/Battle_of_Kawanakajima) |
| Nagashino, 1575 | Oda-Tokugawa 38,000 (lead), 38,000 to 72,000 (infobox); Takeda 15,000 (infobox 15,000 to 20,000). | Not given. | Fence and palisade with earthworks; no distances given. | [Battle of Nagashino](https://en.wikipedia.org/wiki/Battle_of_Nagashino) |
| Sekigahara, 1600 | 160,000 total: Western 81,890 (at battle), Eastern 88,888 (at battle). | Not given. | Start 08:00 or about 10:00; about 2 hours. | [Battle of Sekigahara](https://en.wikipedia.org/wiki/Battle_of_Sekigahara) |
| Morat (Swiss), 1476 | 10,000 men reported. | Reported area "as little as 60 m by 60 m". | - | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) (W, one source) |

### 5.2 Density check [D]

- Agincourt: 7,000 English men across about 690 m is about 99 m of front per 1,000 men. The French (14,000 over a similar frontage in several lines) run about 50 m per 1,000 men. These figures are rough, since the lines were not all the same width.
- Our sim: 2,000 men per side across about 1,015 units (193 m) is about 97 m per 1,000 men. This sits at the loose end of the real envelope (50 to 100 m per 1,000) and is a deliberate compromise.

### 5.3 Ranges

| Weapon | Real | Source |
|---|---|---|
| Longbow, extreme range | about 300 yd (270 m) | [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt) |
| Longbow, armour penetration | "even at 220 yards (200 m)" (Rogers) | [Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt) |
| Musket (Brown Bess), effective point target | 100 yd (91 m) | [Brown Bess](https://en.wikipedia.org/wiki/Brown_Bess) |
| Musket accuracy | 80 to 100 yd (73 to 91 m) | [Brown Bess](https://en.wikipedia.org/wiki/Brown_Bess) |
| Musket, Royal Engineers test (c. 1841) | 150 yd: 3 hits in 4 on a target twice a person's size; 250 yd: none of 10 | [Brown Bess](https://en.wikipedia.org/wiki/Brown_Bess) |
| Crossbow rate | 2 bolts per minute (vs 12 for a skilled archer) | [Crossbow](https://en.wikipedia.org/wiki/Crossbow) |
| Horse archer, Korean track | 90 m track; run completed within 16 s | [Mounted archery](https://en.wikipedia.org/wiki/Mounted_archery) |
| Musket rate of fire | "six shots per minute" (flintlock) | [Close order formation](https://en.wikipedia.org/wiki/Close_order_formation) |

Our sim ranges: bow 175 and 145; horse archer 130; skirmish 70; siege 330 (units). That is 33, 28, 25, 13 and 63 m. Real longbow extreme range is about 270 m; a musket is about 91 m effective. The sim compresses bows by about 5 times and guns by about 2.5 times. See 7.4.

---

## 6. How games compromise realism and readability

Each of these is a source or a search snippet; none gives a full rule set.

- Total War: Three Kingdoms. Formations are loose, diamond, wedge, hollow square and shield wall. Loose widens gaps (harder to hit by arrows, weaker charge resistance); diamond trades speed for mass; hollow square locks movement; shield wall raises resistance but limits pace to walking [W, [Total War Wiki](https://totalwar.fandom.com/wiki/Formation_(Total_War:_Three_Kingdoms))].
- Total War: Thrones of Britannia. Reported to have increased cavalry spacing "so horses can pass through gaps in an enemy unit and turn to clash again" [W, search snippet for [Total War Academy battle category](https://academy.totalwar.com/category/battle/); the page itself was not fetched].
- Total War: Empire. A developer said wider formations deal slightly more burst damage and take slightly fewer casualties from missiles [W, [Steam Empire discussion](https://steamcommunity.com/app/10500/discussions/0/1489992080506350548)].
- Total War: Warhammer. Spacing is set per unit in a table: "Close Formation Spacing Horizontal/Vertical" plus a spacing variation column [W, search snippet for [Total War Modding wiki shield-wall tutorial](https://tw-modding.com/wiki/Creating_a_Shield_Wall_formation) (page returned 503) and [TW Warhammer forum](https://steamcommunity.com/app/364360/discussions/0/152393186489829203)]. Spacing and speed are separate settings.
- Total War: Rome II mod. A changelog says spacing changes also fixed cavalry kill animations, and that tighter spacing gave "heart attack" deaths, so the modder adjusted it. Shows that spacing has side effects on visuals and death logic [W, [Rome II Emperor Edition changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/682220674)].
- Total War: Attila. A commenter reports cavalry speeds up to 100 are common (units unclear) [W, [Attila comments](https://steamcommunity.com/sharedfiles/filedetails/comments/602335357)].
- Lines of Battle (wargame). A turn is 16 ticks. Line infantry with W=70 walks 63 per turn and runs 83. "Faster units swing wider"; slow-turning formations need more room [S, [Time and Movement](https://linesofbattle.wiki.gg/wiki/Time_and_Movement)].
- Field of Glory II Medieval. Cavalry deployed 3 horses deep, about 2.5 m per horse, as a secondary calculation [W, [forum](https://steamcommunity.com/app/1368870/discussions/0/3115898713383237243)].

Common pattern across these: they keep spacing and turning as per-unit settings, rather than a single world scale; they make formations (loose, column, shield wall) change speed and missile exposure rather than just looks; and they tune cavalry by increasing spacing so a charge reads on screen.

---

## 7. Recommended game scale for our sim

### 7.1 Anchor

- 1 world unit = 0.19 m. Keep FIELD_W 1600 x FIELD_H 1200 (about 304 x 228 m). (Superseded: the field is 2400 x 2400 since the scale rework, see battle-scale.md.)
- Man-width (line file interval) = 5.3 units = 1.0 m.
- Check: the sim's own line file interval of 5.3 units gives 1.0 m, the sourced close-order file width (0.9 m) plus a small margin.

### 7.2 Spacing (centre to centre)

| Element | Real | Sim now | Recommended (units) | Note |
|---|---|---|---|---|
| Line infantry, file | 0.9 to 1.0 m [S, D] | 5.3 | 5.0 to 5.5 | keep |
| Line infantry, rank | 1.0 to 1.2 m [E] | 5.3 | 5.5 to 6.0 | a little deeper than files so ranks read |
| Loose infantry | 1.8 m [S] | 8.8 | 9 to 9.5 | keep |
| Locked shields | 0.45 m [S] | 4.9 | 4.5 (or shrink radius) | sim cannot show 0.45 m without a smaller radius |
| Pike block | 1.2 to 1.5 m [E] | 4.95 (pikewall ratio) | 5.5 to 6.5 | sarissa-style spacing reads as a bristling block |
| Cavalry, closed (charge block) | 1.0 to 1.2 m [E] | 9.0 | 6.0 to 6.5 | tighter so a block reads as a block, not a line of ants |
| Cavalry, loose (light horse, screen) | 2.5 m [W] | 9.0 | 12 to 13 | |
| Horse archers, loose | 2 to 3 m [E] | 12.7 | 12 to 14 | keep |
| Skirmishers | 2 to 4 m [E] | 11.2 | 10 to 14 | keep |
| Gap between regiments in a line | 3 to 5 m [E] | 12 | 16 to 20 | sim gap is currently tight; widen so regiments read apart |
| Second line behind first | 10 to 15 m [E] | not measured | 50 to 80 | |
| Armies at deployment (centre to centre) | 80 to 120 m [E] | not measured | about 500 (95 m) | compression |

### 7.3 Speeds (units per second)

| Unit | Real (m/s) | Recommended (units/s) | Sim now | Note |
|---|---|---|---|---|
| Infantry, march | 1.2 to 1.4 [E] | 7 to 9 | 18 to 22 | the sim is 2 to 3x too fast for a march |
| Infantry, advance under fire / double | about 2 [E] | 11 to 12 | - | |
| Infantry, charge run | about 3 [E] | 14 to 16 | 22 | |
| Skirmisher run | 3 to 4 [E] | 16 to 21 | 34 | 34 is a sprint |
| Cavalry, walk | 1.9 [S] | 10 | - | |
| Cavalry, trot | 3.6 [S] | 19 | - | approach pace |
| Cavalry, canter | 4.4 to 7.5 [S] | 23 to 32 | - | |
| Heavy shock cavalry, charge | 9 to 11 [D] | 48 to 55 | 52 | keep |
| Horse archer, gallop | 11 to 13 [S] | 52 to 60 | 66 | a little lower for readability |

Time compression: with real infantry speeds (1.3 m/s) a 300 m crossing takes about 230 s, so it fits inside the 360 s cap. The sim's current infantry speeds (22 units = 4.2 m/s) compress battles by about 3x. Choose: real march speeds (slower, longer) or the faster sim values (shorter, more chaotic). The recommendation (7 to 9 units) keeps time realistic; the sim's current infantry speed is the one number I would change first.

Gait model: cavalry should have an approach pace (trot, 19 to 25 units) and a charge pace (canter to gallop, 32 to 55 units), not one fixed speed. The sim's single `speed` value per role forces a choice.

### 7.4 Ranges (units)

| Weapon | Real | Sim now | Recommended | Ratio to real |
|---|---|---|---|---|
| Longbow / bow (effective) | about 200 m, 1,050 units | 175 (bow); 145 | 250 | 0.24 |
| Musket / arquebus (effective) | 91 m, 480 units | - | 220 | 0.46 |
| Crossbow | about 100 m (E) | - | 200 | 0.4 |
| Horse archer | 60 to 80 m [E] | 130 | 180 | 0.4 |
| Skirmisher (javelin, sling) | 30 to 40 m [E] | 70 | 90 | 0.4 |
| Siege engine | 100 to 300 m [E] | 330 | 330 | keep |

Keep the order bow >= gun, and the ratio of archer to horse archer. The compression changes the feel of archery: a bow line can reach a cavalry block at roughly the same time as the cavalry closes, which the sim's current ranges do not allow.

### 7.5 Turning (units and degrees)

Recommended turn rates (rate of heading change, not a per-tick fraction):

| Unit | Pace | Min turn radius | Turn rate | 90 degree turn |
|---|---|---|---|---|
| Cavalry block (20 horses, 22 m front) | trot | 0.5 x front (11 m, about 58 units) | 18 to 20 degrees/s | 5 s |
| Cavalry block | canter | 1 x front (22 m, about 116 units) | 15 degrees/s | 6 s |
| Cavalry block | gallop | 3 x front (66 m, about 350 units) | 10 degrees/s | 9 s |
| Infantry regiment (16 files, 14.4 m front) | march | pivot on centre: 7 m | 10 degrees/s | 9 s |
| Infantry regiment | march | pivot on flank: 14.4 m | 5 degrees/s | 17 s |
| Column (any) | march | 0.5 x front | 1.3 x line rate | - |
| Shieldwall or pike block | slow | pivot on centre | 3 to 4 degrees/s | 25 s |

Derivation [D]: turn rate = speed / radius. Infantry: 1.3 m/s / 7.2 m = 0.18 rad/s = 10 degrees/s (pivot on centre); 1.3 / 14.4 = 0.09 rad/s = 5 degrees/s (pivot on flank). Cavalry values from section 3.4.

Notes:
- The sim's current turn is `w = clamp(speed*0.08/(width/2+8), 0.012, 0.15) * stance.turn` per tick. I have not confirmed whether `w` is radians or a lerp fraction. Convert it to degrees per second before tuning; the table above gives targets.
- Horses cannot pivot: enforce a minimum radius that scales with the block's front and the speed, and a hard turn cap of 0 degrees/s when charging at gallop (the block must go straight, with only a small arc allowed).
- Infantry can pivot on a file, so do not apply the cavalry radius to them.

### 7.6 Charge run-up and acceleration

- Charge run-up: [E] 80 to 120 m (420 to 630 units) of open ground, with trot for the first 60 percent and canter for the last 40 percent. Gallop only in the last 20 to 30 m (100 to 160 units).
- Acceleration (E): cavalry from standstill to canter in about 15 m (80 units), to gallop in about 40 m (210 units). That is about 6 units/s^2 (1.1 m/s^2) for cavalry. Braking from gallop to standstill in about 30 m (160 units), about 10 units/s^2.
- Infantry: effectively instant, about 1 s to march pace (about 20 units/s^2 if you want a smooth ramp).

### 7.7 Example regiment and battle layout (ten regiments per side)

Regiment (infantry, close order): 16 files x 12 ranks = 192 men.
- Width = (16 - 1) * 5.3 + 4 = 83.5 units (15.9 m).
- Depth = (12 - 1) * 5.3 + 4 = 62 units (11.8 m).

Battle line [D]:
- Ten regiments with 20 units gaps: 10 * 83.5 + 9 * 20 = 1015 units. Fits FIELD_H 1200 with 185 units to spare for flanks and the ends.
- Second line, 70 units behind: each side is 62 + 70 + 62 = 194 units deep (37 m).
- Armies 500 units apart: total used width about 2 * 194 + 500 = 888 of 1600, leaving 712 units (135 m) for cavalry wings, reserves and flank movement.
- Cavalry wing example: 2 regiments of 36 horses (12 wide x 3 deep) at 6.5 units closed: width = 11 * 6.5 + 4 = 75.5 units (14.3 m), depth = 2 * 6.5 + 4 = 17 units.

Force totals: 10 * 192 = 1,920 men per side; 3,840 total. This is above the 2,800 drawn-figure cap (MAX_FIGURES). See 7.8.

### 7.8 MAX_FIGURES and the scale

- MAX_FIGURES = 2800 caps drawn figures. The scale helper `Math.ceil(n / MAX_FIGURES)` (battle.ts near line 553) suggests a figure can stand for more than one man above the cap.
- At 3,840 men, one figure stands for about 1.4 men, which means some men are dropped or merged. Options:
  - Raise the cap (costs drawing time) and keep one figure per man.
  - Use one figure per 2 men throughout (1,920 figures) and keep the 1.0 m file spacing for the figure grid, so the visible spacing becomes 2 m per figure file, which is wrong. Avoid.
  - Keep a 2-men-per-figure rule only in the rear ranks (not visible at full zoom).
- Recommendation: keep one figure per man up to about 2,800 and use 10 regiments of 130 men each (13 files x 10 ranks) per side, a 2,600-man battle (2,600 figures in total). Layout then: width = 12 * 5.3 + 4 = 67.6 units; depth = 9 * 5.3 + 4 = 51.7 units.

### 7.9 Screen fit (1440p)

Assumption: 2560 x 1440 window; a HUD of about 120 px at top and bottom leaves about 2560 x 1320 px for the battlefield.

| Zoom | px per unit | Full field (1600 x 1200) | Man (line, 4.8 units) | Horse (shock, 7.6 units) | Visible area at 1320 px high |
|---|---|---|---|---|---|
| Full view | 1.1 | 1760 x 1320 px | 5.3 px | 8.4 px | whole field |
| Mid zoom | 1.6 | 2560 x 1920 px | 7.7 px | 12 px | 2560 x 1320 px = 1600 x 825 units (about 2/3 wide, 2/3 high) |
| Close zoom | 2.2 | 3520 x 2640 px | 10.6 px | 17 px | 1160 x 600 units (a third wide, half high) |

- Full view at 1.1 px/unit fits the whole field with a HUD. That is the target for "view the whole battle without panning".
- At full view, a man is about 5 px: a regiment reads as a textured block with its banner; individual men are dots. Art for this level should be block-level (colour, banner, a 5 px figure texture).
- Close zoom (2.2 px/unit) shows individual men at about 10 px. The sim can then use the detailed sprites from the art pipeline. Pan needed: about 6 screens to cover the field.

### 7.10 Sprite implications

- At full view, a figure is about 5 px. Pixel art at this size cannot carry per-man detail; do not draw helmets at full zoom. Use blocks.
- At close zoom, a man is about 10 px. A 10 px man can carry a head, a shield and a weapon: this is the detailed sprite size.
- Cavalry at full zoom: 8 px; at close zoom, 17 px.

---

### 7.11 What battle v6 implemented (November 2026)

The sim took this section as guidance and kept what played well; where it departs, it says why.

| Item | v5 | v6 | Research (above) |
|---|---|---|---|
| Line foot, file / rank | 5.3 / 5.3 | 5.3 / 5.8 | 5.0-5.5 / 5.5-6.0 |
| Knights, file / rank | 9.0 / 9.0 | 9.0 / 13.1 (a wedge keeps 0.87 x file) | 6.0-6.5 closed |
| Light horse, file / rank | 8.4 / 8.4 | 9.4 / 13.2 | 12-13 loose |
| Gap between regiments in a line | 12 | 18 | 16-20 |
| Gap between rows of regiments | 12 | 16 | 50-80 (second line) |
| Foot march (advance, reserve) | 0.6 x speed (13 for line foot) | 11 u/s for all formed foot | 7-9 |
| Foot charge run | 1.45 x speed (32) | unchanged | 14-16 |
| Horse riding round / withdrawing | 0.95 / 1.0 x speed | 0.85 / 0.75 | canter 23-32 |
| Horse charge | 1.0 x speed (52 knights) | unchanged | 48-55 |
| Foot wheel | up to 86 deg/s, about 20 for a block 80 wide | 9 / (half width + 8) rad/s, 5-20 deg/s (about 10 for 80 wide) x stance (pike wall 0.35) | 5-10 |
| Horse block turn | up to 86 deg/s | max(20, 50 - 0.6 v) deg/s: 50 standing, 38 trot, 29 canter, 20 gallop | trot 18-20, canter 15, gallop 10 |
| Horse acceleration / braking | instant | 16 / 24 u/s^2 | about 6 / 10 |
| One rider at speed | turns instantly | at most 0.2 rad a tick (115 deg/s) above 0.45 x speed | - |

Departures:
- Knights are not closed to 6.0-6.5: their collision circles are 7.6 across, so files cannot go below about 8.6 without overlap. The block is looser in depth instead, because a horse is longer than it is broad.
- The march is 11 u/s, not 7-9: at 8 the 500-a-side battles had a long tail (some over the 300 s the tests allow, with remnants walking the width of the field), and slow heavy foot charged from too slow a start. 11 u/s keeps the median battle at about 96 s (v5 88 s).
- Horse turns about twice the researched rate. At 10-15 deg/s horse that had ridden round a flank arrived beside its target and spent the charge wheeling onto it; horse then beat bows in only 28 of 48 matchups (v5: 44). At the v6 rates it wins 42 of 48, and a wheel at the gallop is still an arc some 150 units across. A block marching to a far goal rides the way it faces, slows to turn, and turns about only at a walk (`moveAnchor` in battle.ts).
- The camera is unchanged. Classic and HD art draw at a whole number of screen pixels per map pixel, and 1 is the floor: at 2560 x 1440 zoom 1 shows the whole field (a 4,000-man deployment with room to spare), at 1920 x 1080 the deployment fits with the tip of a wing under the HUD banner, and at 1440 x 900 (device pixels) neither v5 nor v6 fits. See `docs/screenshots/formations/`.

v8 (November 2026): a charge that misses closes. With these turning rules a handful of horse against horse (a knight against a knight, one to three knights against a light horseman) rode round each other about 40 units apart until the time limit: the charge aimed 40 units past its target, so the goal always lay outside a turning circle (about 25 units across at the 0.35 x speed a horse keeps while turning hard) that the target sat on. Now a charge that has run 4 s without a blow aims at its target, not past it, and a charging block whose goal lies inside its turning circle (its distance squared is under 2R times its sideways offset, R = speed / turn rate) pulls up to a walk, which turns on the spot. Both apply only in a charge: wheels on the march, the ride round a flank and the withdrawal keep the arcs above. In 10 mirror battles at each of 120, 500 and 1,500 a side they act on about 5 thinks and 15-20 anchor ticks a battle.

## 8. Trade-offs

- Real spacing vs readability. Keeping infantry at real spacing (5.3 units) costs nothing. Cavalry at real knee-to-knee (about 6 units) is tight but reads as a block; the sim's 9.0 spreads a charge into a line. Ranges are the biggest compromise: a real longbow could reach the far side of the field.
- Speed vs time. Real march speeds make a battle about 4 to 6 minutes of crossing; the sim's current speeds compress a battle to 1.5 to 2 minutes of crossing. Real speeds make a battle slower to watch; compressed speeds make it busier and less realistic.
- Turn rate vs control. Real horses cannot turn tightly at speed; a slow turn is realistic and also makes flanking manoeuvres hard to read. Use the caps in 7.5 and let the player's flank orders be slightly faster than the real rate.
- Density vs figure count. One figure per man is the right visual but caps the battle at about 2,800 men. The default 3,000-man battle (10 regiments x 130 men) is the safe choice.
- Depth vs frontage. Historical close order was 8 to 16 deep (sources). The sim's 12-deep regiments follow that, and a 2 to 3 deep line should only be a loose or skirmish stance (acoup).
- Formations as speed/exposure changes, not just looks, is how the sources and the games describe them. The sim's stances already do this (loose: missile x0.65; column: pace 1.1; shieldwall: pace 0.5).

---

## 9. Gaps and next checks

- Templar Rule: squadron size, horses per knight, charge rules. Wikipedia pages returned 404. Next: the Upton-Ward translation of the Rule, or a secondary history of the Templars.
- Japanese formations (gyorin, hoshi, ganko, sonae) and ashigaru spacing: not found. Next: Stephen Turnbull's Sengoku books (cited by a forum but not retrieved).
- Roman maniple intervals (quincunx): not retrieved. Next: the [Maniple (military unit)](https://en.wikipedia.org/wiki/Maniple) article (the disambiguation page was fetched, not the article).
- Total War spacing numbers and cavalry turn speed: the tw-modding wiki returned 503; the Academy page redirected. Next: retry both, and check the `battle_settings` or unit tables in a modding tool.
- Cavalry turn radius and charge acceleration: no source in my results. Sections 3.4 and 7.5 are estimates.
- Longbow rate of fire: not in my results.
- Hastings shield wall frontage and depth: not in the article.
- Knee-to-knee cavalry spacing: only a secondary wargame figure.

---

## 10. Sources

Retrieved 2026-11-03. Wikipedia text is CC BY-SA; forum and fan-wiki content is not licensed for reuse, so only numbers and paraphrases are recorded here.

1. [acoup.blog: Collections: Shield Walls and Spacing](https://acoup.blog/2023/12/15/collections-shield-walls-and-spacing-hollywood-mobs-and-ancient-tactics/comment-page-1/). Polybius file width, Asclepiodotus widths, Macedonian and Roman depths, maniple 20 x 6.
2. [Wikipedia: Close order formation](https://en.wikipedia.org/wiki/Close_order_formation). Greek 3 ft frontage, depth 4 to 8, Macedonian 16, Zurich 1443, Magersfontein, pike block area, Morat area.
3. [Wikipedia: Phalanx](https://en.wikipedia.org/wiki/Phalanx). Loose 1.8 to 2 m, dense 0.9 to 1 m, locked 0.45 m; depth; unit sizes; spear lengths.
4. [Wikipedia: Battle of Agincourt](https://en.wikipedia.org/wiki/Battle_of_Agincourt). Army sizes, 690 m defile frontage, longbow ranges, French 16 ranks, English four deep, stakes.
5. [Wikipedia: Battle of Nagashino](https://en.wikipedia.org/wiki/Battle_of_Nagashino). Army sizes, gun counts, the disputed three-stage volley.
6. [Wikipedia: Battle of Arsuf](https://en.wikipedia.org/wiki/Battle_of_Arsuf). Twelve regiments of 100 knights, plain 1.5 to 3 km, pursuit 1.5 km.
7. [Wikipedia: Cantabrian circle](https://en.wikipedia.org/wiki/Cantabrian_circle). Rotating horse archer volleys.
8. [Wikipedia: Charge (warfare)](https://en.wikipedia.org/wiki/Charge_(warfare)). Formation remark only; no numbers.
9. [Wikipedia: Battle of Hastings](https://en.wikipedia.org/wiki/Battle_of_Hastings). Army sizes, time of battle, feigned flights, cavalry share.
10. [Linesofbattle wiki: Time and Movement](https://linesofbattle.wiki.gg/wiki/Time_and_Movement). Turn length 16 ticks, infantry movement rates, turning principles (wargame).
11. [Wikipedia: Gait (horse)](https://en.wikipedia.org/wiki/Gait_(horse)). Walk, trot, canter and gallop speeds; gallop endurance; stride length.
12. [Wikipedia: Crossbow](https://en.wikipedia.org/wiki/Crossbow). Two bolts per minute; pavise; crossbow teams.
13. [Wikipedia: Battle of Hattin](https://en.wikipedia.org/wiki/Battle_of_Hattin). Army sizes; march distance.
14. [Wikipedia: Brown Bess](https://en.wikipedia.org/wiki/Brown_Bess). Musket effective and accuracy ranges; Royal Engineers test.
15. [Wikipedia: Mounted archery](https://en.wikipedia.org/wiki/Mounted_archery). Heavy horse archers' volleys; Korean track; Cao Pi anecdote.
16. [Wikipedia: Battle of Sekigahara](https://en.wikipedia.org/wiki/Battle_of_Sekigahara). Army sizes, start times, Ii Naomasa's vanguard.
17. [Wikipedia: Battle of Kawanakajima](https://en.wikipedia.org/wiki/Battle_of_Kawanakajima). Kakuyoku pincer, kuruma gakari, army sizes.
18. [Wikipedia: Ashigaru](https://en.wikipedia.org/wiki/Ashigaru). Training to hold ranks; gun-to-bow ratios.
19. [Wikipedia: Sengoku period](https://en.wikipedia.org/wiki/Sengoku_period). 10,000 ashigaru arquebusiers (conflicts with source 5).
20. [Wikipedia: Longbow](https://en.wikipedia.org/wiki/Longbow). Context only; no range figures retrieved.
21. [Total War Wiki: Formation (Three Kingdoms)](https://totalwar.fandom.com/wiki/Formation_(Total_War:_Three_Kingdoms)). Formation types (weak source).
22. [Steam: Total War Empire, developer comment on width vs depth](https://steamcommunity.com/app/10500/discussions/0/1489992080506350548) (weak source).
23. [Steam: Total War Warhammer, cavalry wedge and turning](https://steamcommunity.com/app/364360/discussions/0/152393186489829203) (weak source).
24. [Prima Games: Warhammer formation control guide](https://primagames.com/featured/total-war-warhammer-formation-control-guide-tips) (weak source; formation groups keep spacing).
25. [Steam: Field of Glory II Medieval, cavalry frontage](https://steamcommunity.com/app/1368870/discussions/0/3115898713383237243) (weak source; secondary calculation).
26. [TW Modding wiki: Creating a Shield Wall formation](https://tw-modding.com/wiki/Creating_a_Shield_Wall_formation) (returned 503; search snippet only).
27. [Steam: Rome II Emperor Edition changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/682220674) (weak source; spacing side effects).
28. [Steam: Attila comments](https://steamcommunity.com/sharedfiles/filedetails/comments/602335357) (weak source; cavalry speed remark).
29. [Total War Academy: battle category](https://academy.totalwar.com/category/battle/) (redirected; Thrones of Britannia spacing claim from search snippet only).
30. [Markham's 1626 glossary of Aelian's motions (Lexicons of Early Modern English)](https://leme.library.utoronto.ca/lexicons/354). Facings (klisis, metabole) against wheels (epistrophe, perispasmos).
31. [Suda On Line, epsilon 1616: the countermarches (Aelian 27)](https://www.cs.uky.edu/~raphael/sol/sol-entries/epsilon/1616). Why the front-rankers file through after an about-turn.
32. [Kabinettskriege: two methods of wheeling in eighteenth-century drill](https://kabinettskriege.blogspot.com/2017/12/two-methods-of-wheeling-on-eighteenth.html). Wheels are slow and need room; changing front by parts.
33. [Authentic Campaigner forum: drill bits, wheel versus turn](https://www.authentic-campaigner.com/forum/military-forums/camp-of-instruction/9807-drill-bits-wheel-versus-turn) (forum). Hardee-era turns as the combat move, wheels as the drill-field move; changing front company by company.

---

## Summary table

| Parameter | Real value (tag) | Sim now | Recommended | Note |
|---|---|---|---|---|
| Infantry close file interval | 0.9 to 1.0 m (S/D) | 5.3 u (1.0 m) | 5.0 to 5.5 u | keep |
| Infantry rank interval | 1.0 to 1.2 m (E) | 5.3 u | 5.5 to 6.0 u | |
| Loose infantry | 1.8 m (S) | 8.8 u | 9 to 9.5 u | keep |
| Locked shields | 0.45 m (S) | 4.9 u | 4.5 u or smaller radius | radius limits |
| Cavalry closed (charge block) | 1.0 to 1.2 m (E) | 9.0 u (1.7 m) | 6.0 to 6.5 u | |
| Cavalry loose | 2.5 m (W) | 9.0 u | 12 to 13 u | |
| Skirmishers | 2 to 4 m (E) | 11.2 u | 10 to 14 u | |
| Gap between regiments | 3 to 5 m (E) | 12 u | 16 to 20 u | |
| Second line behind | 10 to 15 m (E) | not measured | 50 to 80 u | |
| Armies at deployment | 80 to 120 m (E) | not measured | about 500 u (95 m) | compression |
| Infantry march speed | 1.2 to 1.4 m/s (E) | 18 to 22 u/s | 7 to 9 u/s | sim 2 to 3x fast |
| Infantry charge run | about 3 m/s (E) | 22 u/s | 14 to 16 u/s | |
| Cavalry walk / trot / canter | 1.9 / 3.6 / 4.4 to 7.5 m/s (S) | - | 10 / 19 / 23 to 32 u/s | |
| Cavalry gallop | 11 to 13 m/s (S) | 52 u/s | 48 to 55 u/s | keep |
| Horse archer gallop | 11 to 13 m/s (S) | 66 u/s | 52 to 60 u/s | |
| Longbow effective | about 200 to 270 m (S) | 175 u (33 m) | 250 u (48 m) | ratio about 0.24 |
| Musket effective | 91 m (S) | - | 220 u (42 m) | ratio about 0.46 |
| Horse archer range | 60 to 80 m (E) | 130 u | 180 u | |
| Cavalry turn, canter | 15 degrees/s, radius 1x front (E) | per-tick lerp | 15 degrees/s | convert sim to deg/s |
| Cavalry turn, gallop | 10 degrees/s, radius 3x front (E) | - | 10 degrees/s | |
| Infantry wheel, centre pivot | 10 degrees/s (D) | - | 10 degrees/s | |
| Infantry wheel, flank pivot | 5 degrees/s (D) | - | 5 degrees/s | |
| Cavalry acceleration | about 6 u/s^2 (E) | - | 6 u/s^2 | |
| Charge run-up | 80 to 120 m (E) | - | 420 to 630 u | |
| Battle layout, 10 regiments | 1,015 u wide on 1,200 u field | - | 16 files x 12 ranks, 1,920 men per side | see 7.7 |
| Full-view zoom | - | - | 1.1 px/u (1760 x 1320 px) | fits 1440p with HUD |
