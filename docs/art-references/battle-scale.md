# Battle scale: field, intervals and missile ranges

Research for the scale rework (after BATTLE_VERSION 16). The user's complaint: "Unit blocks
should be more spaced out. Distances are way too close and ranged units' range way too short,
which is why everything looks comicky rather than realistic like Total War." This page covers
distances in the sim, not art. No images were used or committed.

## The anchor

The ground is measured as before (formations.md, section 1): **1 world unit = 0.19 m**, from the
man's own breadth (a line infantryman's radius 2.4 units is about 0.45 m, so a close-order file of
5.3 units is about 1 m, the 0.9 to 1.06 m of the Zurich and Magersfontein frontages). The figures
are *drawn* two to three times life size (a man stands about 14 units, 2.6 m at the ground's
scale), so on screen every gap sized in metres looks smaller still. That is the root of the
"comicky" look: blocks 5 m apart and bows that reach 33 m, under men drawn as tall as a door.

## Sources

| Source | What it gives us |
| --- | --- |
| [Total War wiki, "Crossbowmen (M2TW unit)"](https://wiki.totalwar.com/w/Crossbowmen_(M2TW_unit)) | Medieval II crossbowmen: range 120, 30 bolts, 48 men a unit (at the default size). |
| [Total War wiki, "Peasant Archers (M2TW unit)"](https://wiki.totalwar.com/w/Peasant_Archers_(M2TW_unit).html) and [Archer Militia](https://wiki.totalwar.com/w/Archer_Militia_(M2TW_unit).html) | Self bows of the levy: range 120. |
| [Total War Center forum archive, missile ranges list (t-110450)](https://forums.totalwar.org/vb/archive/index.php/t-110450.html), fan list from the unit files | Medieval II: longbow and composite bow 160 m, elite crossbows 160, standard crossbow 120, handgun 95, javelins 55, ballista 180, catapult 200. A fan post, consistent with the wiki pages above. |
| [Wikipedia, "Battle of Agincourt"](https://en.wikipedia.org/wiki/Battle_of_Agincourt) (formations.md 5.3) | Longbow extreme range about 270 m (300 yd); armour still threatened "even at 220 yards" (Rogers). The French battles stood "a bowshot length" apart. |
| [Wikipedia, "English longbow"](https://en.wikipedia.org/wiki/English_longbow) | Barnabe Rich: of a thousand archers after a week's campaigning only a hundred could shoot "farther than two hundred paces" (153 m); heavy war arrows wound armoured men "even at 240 yards" (220 m, Strickland and Hardy); Henry VIII's shortest practice mark 220 yd (200 m). Stretton's yew self bow sends a 102 g war arrow at 47 m/s. |
| [Wikipedia, "Crossbow"](https://en.wikipedia.org/wiki/Crossbow) | No battle range given; Song crossbows "could pierce a tree at 140 paces" (1068), and a European crossbow shot about two bolts a minute against a bow's twelve. [E] an effective range somewhat under the war bow's, about 150 m, and a faster, flatter bolt (50 to 70 m/s). |
| [Wikipedia, "Javelin"](https://en.wikipedia.org/wiki/Javelin) and ["Pilum"](https://en.wikipedia.org/wiki/Pilum) | War javelins were thrown at 15 to 30 m (the pilum at about 15 to 20 m, lighter darts further). |
| [Wikipedia, "Mounted archery"](https://en.wikipedia.org/wiki/Mounted_archery) (formations.md 5.3) | Horse archers shot at short range from the saddle (a 90 m Korean track); [E] 60 to 100 m in battle. |
| [Wikipedia, "Trebuchet"](https://en.wikipedia.org/wiki/Trebuchet) and ["Mangonel"](https://en.wikipedia.org/wiki/Mangonel) | Traction and counterweight engines threw 100 to 300 m; a counterweight trebuchet's stone flies at about 40 to 50 m/s. |
| formations.md, sections 3 and 5 (Lehnart via Field of Glory, Agincourt) | Between regiments in a line [E] 3 to 5 m (too tight to read on screen at our figure size); a second line 10 to 15 m behind; cavalry 2.5 m a horse in frontage. |
| total-war-battles.md (Medieval II and Rome screenshots) | Deployed blocks stand in neat ranks with clear ground between units; the lines are long and thin, and the field between the armies is wide and empty before the clash. |

## What we took

### Ranges: about 0.7 of Total War's, which are close to history's effective ranges

Medieval II's ranges (bows 120 to 160 m, crossbows 120 to 160, javelins 55, engines 180 to 200)
sit close to the historical *effective* ranges (war bow 150 to 250 m, crossbow about 150,
javelin 15 to 30). Our field is smaller than a Total War map and battles are shorter, so we keep
the order and the ratios and compress by about 0.7 at the 0.19 m anchor:

| Class | Was (units, m) | Now (units) | Now (m at 0.19) | Factor | Against |
| --- | --- | --- | --- | --- | --- |
| Archers | 175 (33 m) | 590 | 112 | 3.4 | M2TW 120 to 160; war bow 150 to 250 effective |
| Crossbows (matchlocks for the samurai) | 145 (28 m) | 470 | 89 | 3.2 | M2TW 120 (elite 160); [E] crossbow ~150 |
| Horse archers | 130 (25 m) | 420 | 80 | 3.2 | [E] 60 to 100 m from the saddle |
| Skirmishers (javelins) | 70 (13 m) | 140 | 27 | 2.0 | javelin 15 to 30 m; M2TW 55 |
| Engines | 330 (63 m) | 1100 | 209 | 3.3 | M2TW 180 to 200; trebuchet 100 to 300 |

The order is kept: engines > bows > crossbows > horse archers > javelins. Javelins grow least,
since 13 m was already within the historical throw and a javelin's reach is the reach of an arm.

Projectile speeds rise with the ranges so a long shot does not hang in the air (the flight time
at full range, then and now): arrows 160 to 260 units/s (1.1 s, now 2.3 s; a war arrow's lobbed
flight to 150 m takes 3 to 4 s), bolts 190 to 300 (0.8 s, now 1.6 s; a bolt leaves at 50 to 70 m/s,
260 to 370 units/s), horse archers' arrows 150 to 240 (1.75 s), javelins 110 to 150 (0.9 s), engine
stones 95 to 190 (5.8 s). The arc of a shot is a share of its length (`shoot`), so long shots arc
higher: about 190 units over a full bowshot, a third of the way up, as a lobbed arrow flies.

The scatter of a shot grows with its length as before (`shoot`), so at full range a volley falls
over three times the ground it did: long shots wound and harass rather than kill outright, as
arrows did (missile-drill.md, ACOUP).

### The field and the intervals

| Item | Was | Now | Why |
| --- | --- | --- | --- |
| FIELD_W x FIELD_H | 1600 x 1200 (304 x 228 m) | 2400 x 2400 (456 m square) | Two armies a bowshot and a half apart need about 2 x (army depth 400) + gap 1300 = 2100 of length. The length stops there on purpose: a broken block runs for its own edge and rallies on the way (REGROUP), and with 3200 of length (tried first) it had twice as far to run, the living rallied far more often (Templar blocks against the dead: 1.5 rallies a battle, 0.6 before the rework) and the dead, who never rally, won 31% against the Templars instead of 38% at 2400. The width (doubled) gives the horse a flank to ride round and the wider line its room. |
| GAP (front to front at deployment) | 600 (114 m) | 1300 (247 m) | Beyond either side's bowshot: the archers stand a row behind their line, so they reach the enemy front only after the armies close by about 800 units (the opening advance into bowshot of every Total War battle). It is 2.2 bow ranges, Total War's usual opening distance of 2 to 3. |
| REG_GAP (between blocks in a line) | 28 (22..34) | 64 (44..80) | Three quarters of a block's front (12 m at the anchor, three to four drawn men): blocks read as separate units, a block can wheel without fouling its neighbour, and a broken block has a lane to run through. History's 3 to 5 m does not read at our figure size (see the anchor). |
| ROW_GAP (one row of blocks to the next) | 26 | 80 | 15 m, the upper end of formations.md's 10 to 15 m for a second line, with the archers' row between the lines. |
| MISSILE_GAP | 24 | 56 | the archers' row spaced like the line. |
| WING_GAP, WING_FORWARD | 60, 16 | 150, 30 | The horse 28 m out from the end of the line, so the wings read as wings. |
| Skirmishers before the line, engines behind it | 36, 30 | 80, 80 | room for the javelins to fall back through the wider intervals; the engines clear of the second line. |
| MISSILE_BEHIND, the reserve's distance behind its block | 24, 30 | 70, 170 | The archers keep about where they deploy, a ROW_GAP behind the line, and the second line keeps clear of them. |
| Man spacing (GAP_IN_RANK): missile foot, light horse, knights, horse archers | 1.2, 2.6, 1.4, 2.4 | 1.4, 3.0, 1.8, 2.8 | A little looser: horse knee to knee with play, nearer the 2.5 m a horse of Lehnart's frontage. Close-order foot stays at 5.3 units (1 m) a file, inside the sourced 0.9 to 1.06 m (0.8, 5.6 units, was tried: it read no differently at the default zoom and cost the dense hosts of the dead some 6 points of their wins). |

A bug the wider gaps exposed: `place` counted a gap after the last block of a row, so with gaps
over the band's 40 units of slack the last block of the first line went to a row of its own
behind. It counts the gaps between blocks only now.

### The things measured from them

- **General's bowshot halt** (`generalThink`): the halt to trade volleys came when the fronts were
  60 to 125 apart (bows 175); now 0.34 to 0.72 of the archers' range (200 to 425).
- **Morale ranges between regiments** (command.ts `MORALE`, `REGROUP.reach`, the doctrines'
  banner, withdraw and recall): about 1.4 times, the growth of the centre-to-centre distance
  between neighbouring blocks (111 to 158 units), so each block has about the same neighbours
  within reach as before. The Lich-Marshal's tide and raising (240) reach a share of his whole
  host, now spread wider with him further behind it: 500.
- **Point blank** (bows shoot flat when fired at will): 60 to 100, so every shot at will at a foe
  inside AT_WILL_GAP or charging from twice that is flat.
- **Matchlocks** (the samurai's crossbow class) reach 0.75 of a crossbow (350 units, 67 m): a
  matchlock was aimed at 50 to 100 m. At the crossbow's full 470 the teppō out before their line
  fired for so long that the samurai won 69% against the Templars.
- Distances set by men and horses rather than by the field are unchanged: AT_WILL_GAP (under a
  second for charging horse), CONTACT_GAP, the charge launch distances, cohesion's `nearFrom`,
  the leashes and reaches in contact, the horse's turning and reining. Speeds are unchanged.
- **Time.** Contact now comes at 45 to 90 s (was 24 to 29), and battles end at about 160 to 320 s
  (was 100 to 150). MAX_TICKS goes from 3600 to 6000 (ten minutes; Total War battles run 10 to
  20) so the time limit stays a backstop, and the clocks tied to the approach move with it: LATE
  (everyone in) 2400 to 4000, the refused wing's hold 1200 to 2000, the holding General's wait
  650..1100 to 1150..1900.
- Tried and dropped: a missile's damage falling to 0.45 at full range. It did not move the
  balance between the factions (the shooters' share of the kills is limited by their arrows, not
  by when they loose them), so the plain rule stays: scatter grows with the length of the shot.

### What it does to the balance

With the long approach under fire, the factions that shoot gain and the dead, who march slowly
into it, never halt to shoot and never rally, lose ground (`pnpm fairness --factions a,b --sizes
500 --seeds 60`, 120 battles each, noise about 4.5 points):

| Match | Before | After |
| --- | --- | --- |
| undead vs templar | 47.5% | about 38% |
| undead vs samurai | 46.7% | about 31 to 36% |
| samurai vs templar | 50.0% | about 58% |

Left for the balance pass that follows the behaviour work in flight (BATTLE_VERSION bump).

Then, in v17 still: reloads near history's (a bow volley every 7.5 s, crossbows 12 s, teppō 30 s,
engines 30 s: missile-drill.md, "Rates of fire (v17)"), galloping horse hard to hit at long range,
and horse that forms up out of bowshot and goes in together when outshot (`horseStrike`;
battle-cohesion.md section 7). Measured after them: see the v17 changelog in battle.ts.

## Renderer

The field projects to about 4200 x 2100 map px with its margin (was 2750 x 1300), so the default
view (`frame`) opens zoomed out to show both armies deployed: 50% on a 1600 x 900 window, 38% on
1280 x 720. The zoom-out floor (`fit.ts` MIN_SCALE) drops from 1/2 to 3/8 for that: from that
high the blocks read as Total War's do, dark masses under their standards (total-war-battles.md,
reference 1); zoom in for the men. The ground canvas and the HD marks field grow with the field
(about 9 Mpx, 36 MB each, against 3.6 Mpx), and building the scene at the start of a battle took
about 2.4 times as long in the measurements (classic art, a loaded machine: 2.3 s against 5.5 s
for the larger, longer field tried first). The battle-perf harness takes `frame=1` for the game's
opening view.

## Measured after (pnpm bench, an unloaded machine)

Contact at 48 to 71 s (24 to 29 before), battles over at 155 to 212 s (98 to 152), none near
the 600 s limit; 0.3 to 1.4 ms a step (0.4 to 1.8 before: the larger grid is emptier). The
mirror match stays fair (`pnpm fairness`: 48.0% at 250 a side, 43.5% at 120, z -0.57 and -1.84).
