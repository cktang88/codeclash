# Missile drill: how bows, crossbows and guns were shot in battle

Research for BATTLE_VERSION 9 and later (volley fire, stopping to shoot, fire at will, standing back). This page covers behaviour, not art. No images were used or committed.

## Sources

| Source | What it gives us |
| --- | --- |
| [Tastes of History, "Dispelling some myths: archers shooting twelve arrows a minute"](https://www.tastesofhistory.co.uk/post/dispelling-some-myths-archers-shooting-twelve-arrows-a-minute) | A war bow can loose 10–12 arrows a minute in a short burst, but only for about a minute. A sustained rate of 5–6 a minute is realistic for up to ten minutes. A modern archer drawing a 140 lb bow manages 10 in a minute but not 20 in two. |
| [Archery Historian, "English longbow"](https://archeryhistorian.com/english-longbow/) and [History Hit, "10 facts about the longbow"](https://www.historyhit.com/facts-about-the-longbow/) | The commonly cited expectation is about 10 aimed shots a minute, and about 60–72 arrows carried, which is a few minutes of shooting. |
| [History Hit, "Crossbow and longbow in medieval warfare"](https://www.historyhit.com/what-was-the-difference-between-the-crossbow-and-longbow-in-medieval-warfare/) and [Warfare History Network, "Battle of Crécy"](https://warhistory.org/2015/12/26/battle-of-crecy-august-26-1346/) | A crossbow manages about 2 (1 to 4) bolts a minute, against a bow's 6 to 12. At Crécy the Genoese left their pavises with the baggage, and they were shot down while spanning. A crossbowman needs cover while he reloads. |
| [Bret Devereaux, ACOUP, "Collections: Why archers didn't volley fire" (2025)](https://acoup.blog/2025/05/02/collections-why-archers-didnt-volley-fire/) | **Bowmen did not usually volley on command.** They shot "in their own best time", producing a continuous "rain" of arrows, often starting slowly at long range. Holding a drawn bow while waiting for the word tires the archer. Volleys answer a slow reload, so they belong to crossbows (the Chinese counter-march) and to guns (volley and charge). Arrows wounded and wore down more than they killed outright (each arrow disabled about 0.5–1% of the time). |
| [Wikipedia, "Volley fire"](https://en.wikipedia.org/wiki/Volley_fire) | Li Quan's *Taibai Yinjing* (759) shows Tang crossbowmen in rotating ranks: shoot, step back, load. The Song *Wujing Zongyao* and Cheng Chongdou (c. 1621) describe the same three-group rotation. William Louis of Nassau's countermarch (1594) has each rank fire together and file to the rear. Qi Jiguang (1560) forbids early fire: musketeers wait for the signal and the enemy within 100 paces. A trained musketeer fires about 3 times a minute. In the 18th century fire is by rank, by platoon or "at will". |
| [Book and Sword, "Aelian and fire by countermarch"](https://www.bookandsword.com/2018/07/14/5102/) | The countermarch was taken from ancient drill manuals, a drill for *keeping up* fire with slow weapons. |
| [Samurai History and Culture, "Battle of Nagashino"](https://samuraihistoryculture.substack.com/p/battle-of-nagashino) and [Wikipedia, "Volley fire": Japan](https://en.wikipedia.org/wiki/Volley_fire#Japan) | The legend of Nobunaga's 3,000 teppō shooting in three rotating ranks behind a palisade is disputed. The *Chronicle of Lord Nobunaga* (Brill 2011, p. 42) calls it a myth; a recent reading has the gunners working in threes, one shooting while two load. Korean and Chinese sources record Japanese volleys in the Imjin War. A matchlock takes 20–30 s to reload, up to 45 s in some estimates. |
| [Warfare History Network, "Firepower: the battle of Nagashino"](https://warhistory.org/@msw/article/firepower-the-battle-of-nagashino) | Teppō stood behind a palisade (and tate shields), and the volleys broke charging horse at short range. |

## What we took

1. **Shooters stand to shoot.** Bows are drawn standing, crossbows are spanned with a foot in the stirrup or a windlass, and matchlocks are loaded with a rammer. None of this works on the march. Foot shooters in the sim (bows, crossbows, guns, javelins, engines) never loose while their block walks or wheels, nor for 0.3 s after it halts. Horse archers did shoot on the move (yabusame, the steppe), so they still do.
2. **Volleys, with a caveat.** For crossbows and guns, volleys on the word are well attested, for Tang and Song crossbows, Ming and Japanese guns, and the Dutch countermarch. For bows the evidence says otherwise (ACOUP): archers shot at will, as a continuous rain. We still give bows volleys (the user asked for them, and they read well on screen), with the same short "make ready, present" beat, and they show as a ripple over half a second, not as one instant. If we want to be strict about history later, a per-faction "bow drill" could switch bows back to a loose rain.
3. **Relative rates.** Bow 6–12 a minute, crossbow 2–6, matchlock 1–3, engines from a few a minute (traction) to a few an hour (counterweight, bombards). Until v17, on a clock compressed for battles of two to four minutes, a bow volley came every 2.1 s, a crossbow's every 4.4 s, a teppō's every 5.7 s and an engine's every 14 s. Since the field grew to real scale (battle-scale.md) the rates are close to history's: see "Rates of fire (v17)" below.
4. **Fire at will when threatened.** Qi Jiguang's "fire together until out of ammunition" once the enemy is close, and the 18th-century "fire at will". When a foe is within about 50 units, or is charging from twice that, nobody waits for the word. Bows shoot flat at point-blank range.
5. **Then sidearms.** At contact the shooters fight hand to hand. A man with a foe at hand drops his bow and draws in 0.6 s, however far through his reload he was.
6. **Stand back.** Archers and crossbowmen stood behind or on the flanks of the line, often behind stakes and pavises. They opened at long range and shot over their own men at the enemy beyond. In the sim they keep about 24 units behind their line's rear rank and wait 4 s for a new target before moving. Bows lob over a melee into the rear half of a deep enemy block. Crossbows and guns need a clear line and do not.
7. **Slow volleys are a reason for rotation (optional, not built).** The teppō "groups of three" and the countermarch keep fire continuous with slow guns. Our gun blocks already hold the rear ranks' fire when the front rank is in the way (`Ballistics`). Alternating volleys by rank would be the next step.

## Rates of fire (v17)

With ranges about three times longer (bows 590, crossbows 470), the compressed reloads of v9–v16 put five times history's arrows into the air over a beaten zone that now takes 25 s to cross on foot. From v17 the reloads are close to history's, compressed a little and keeping the order bows ≫ crossbows > matchlocks.

### Sources (added for v17)

| Source | What it gives us |
| --- | --- |
| [History Skills, "Crossbows"](https://historyskills.com/classroom/year-8/crossbows) | The longbow at "up to 10 to 12 arrows per minute" against "the much slower crossbow"; the goat's foot lever, then the windlass and cranequin, for ever stronger bows. It gives no figure for the crossbow. |
| [Will's Commonplace Book, "Shooting speed of longbow and crossbow" (2015)](https://willscommonplacebook.blogspot.com/2015/01/shooting-speed-of-longbow-and-crossbow.html) | Reenactors' trials: a belt-and-claw crossbow (up to about 350 lb) about 6 shots a minute, a belt-and-pulley about 3 and a goat's foot about 5; a windlass much slower. |
| [History Rise, "The crossbow"](https://www.historyrise.com/crossbow-the-powerful-projectile-weapon-reshaping-medieval-battles/) | A skilled crossbowman about 2–4 bolts a minute, by draw weight and spanning device (a popular source). |
| [Dr Stuart Ellis-Gorman, AskHistorians AMA on the medieval crossbow](https://lr.eu.psf.lt/r/AskHistorians/comments/th23ut/im_dr_stuart_ellisgorman_author_of_the_medieval) | The windlass bow at about one bolt a minute and the cranequin slower still; lighter field crossbows (the Genoese pavisiers') spanned by belt hook or goat's foot at about 4 a minute (as summarised in the brief for this work; not re-read). |
| [Wikipedia, "Arquebus"](https://en.wikipedia.org/wiki/Arquebus) | Reloading "took anywhere from 20 seconds to a minute under the most ideal conditions"; elsewhere "30–60 seconds to reload properly"; a 1607 drill manual counts 28 steps. |
| [Samurai Archives, "Teppō"](https://samurai-archives.com/wiki/Teppo) (as summarised for us; the site was down when checked) | A trained ashigaru took about 30–40 s to load and fire, the best men up to about 4 a minute. |
| [Wikipedia, "Firearms of Japan"](https://en.wikipedia.com/wiki/Firearms_of_Japan) | About 2 shots a minute typical. |
| [History of War, Nagashino (2019)](https://www.pressreader.com/uk/history-of-war/20191003/281625307029745) | Nobunaga's arquebusiers about 30 s a shot; rotating volleys covered the gap. |
| [Military History Visualized, "Trebuchet – traction and counterweight"](https://militaryhistoryvisualized.com/?p=414) and [Ancient War History, "The traction trebuchet"](https://ancientwarhistory.com/?p=13051) | Traction trebuchets need no winching, so a trained pulling crew throws 3–4 stones a minute (at Lisbon in 1147 two engines threw a stone every 15 s); the counterweight engine is far slower, a few shots an hour for the great ones. |

The Tastes of History, ACOUP and Wikipedia "Volley fire" entries above give the bow's 10–12 a minute for a short burst and 5–6 sustained, and the matchlock's 20–45 s.

### What we took

| Weapon | History | Game, volley to volley (ticks of 0.1 s) | Was |
| --- | --- | --- | --- |
| War bow | 10–12 a minute in a burst (5–6 s), 5–6 sustained | 5 s (44 + the 0.6 s beat), 12 a minute; at will 0.6 of the reload (about 3 s) | 2.1 s |
| Crossbow | 2–6 a minute (10–30 s) by spanning device; belt hook and goat's foot for field troops | 12 s (114 + 6), 5 a minute | 4.4 s |
| Matchlock (teppō) | 20–60 s; about 30 s for drilled men, up to 4 a minute for the best | 17.7 s (171 + 6), rank by rank (S3) so a rank fires every 6 s | 5.7 s |
| Horse archer | slower than foot on the move: 5–6 s | 5.5 s | 2.6 s |
| Javelins | quick, but two to four carried | 3 s, 4 carried (was 5) | 2.6 s |
| Engines | traction 15–20 s, counterweight minutes, bombards slower | 30 s | 14 s |

- **Ammunition.** Bows 36 arrows a man (was 24: history's 24 a sheaf plus a second from the carts, three minutes of volleys), crossbows 18 (three and a half minutes), horse archers 30 (22), engines 30.
- **Damage.** Bows are volume (light arrows, pierce 0.1), crossbows slow and armour-piercing (pierce 0.55, unchanged). An arrow hits 9 (was 8): at the slower rate, and with charging horse hard to hit, a battle's arrows were fewer and battles ran longer (a Templar mirror of 500 a side past six minutes). The teppō's ball hits 1.45x a crossbow's bolt (was 1.3x), so a gun block's minute of fire is still a little under a crossbow block's, in fewer, heavier volleys that pierce as well.
- **Fire at will.** A bowman shooting at will at a foe close at hand nocks and looses at the burst rate, 0.6 of his volley reload (`BOW_BURST`). With volleys 5 s apart, whether a block gets its at-will arrows off before the foe is among it turns on where its last volley fell in the foe's run-in; against horse at the gallop it often does not, as in life.
- **Rotation.** The teppō already fire rank by rank after their first volley (S3, `rippling`): with three ranks a rank looses every 6 s, keeping the fire up. Nothing new was needed.
- **Moving targets.** A shot is aimed where the target will be (0.8 of its travel in flight), but a target faster than a running man (35 units a second, foot at the charge: horse at the canter or gallop) is only guessed at: the scatter grows by 0.3 of the way its speed beyond that carries it in the shot's flight (`LEAD_ERR`). A rider at the gallop 500 away goes some 120 units while an arrow is in the air, so most arrows at charging horse miss; marching and running foot are led true. (Counting all the target's speed cost the undead 8 points against the Templars, and counting it beyond 20 a second still about 5; 35 lets foot at the charge, about 35, be led true.)
- **`fireEvery`** stays reload + VOLLEY_BEAT for formed missile foot, so the Generals' reckoning of firepower and the volley drill agree (missiles.test.ts reads its cycles from it).
