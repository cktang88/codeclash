# Weapon reach: spears fence at their points

Research for battle v17's weapon reach (`REACH` in `src/game/battle.ts`, `UnitStats.reach` in
`src/game/units.ts`, the factions' `reach` in `src/game/factions.ts`). The user's complaint:

> When you have spear infantry or yari ashigaru facing off against each other, they should
> obviously stop at the points of each other's spears, right? [...] A lot of people just run
> through the spears directly into the person, which is very hard to do. You have rows of braced
> spears.

Until now every man struck from the same distance, body to body (`rad + rad + 1.6`), whatever
he held, so two spear blocks walked through each other's points into contact, and swordsmen
walked onto levelled spears as if they were not there. This page covers the sim, not art. No
images were used or committed. `[E]` marks our own estimate where the sources give no figure.

## Sources

| Source | What it gives us |
| --- | --- |
| [Wikipedia, "Push of pike"](https://en.wikipedia.org/wiki/Push_of_pike) | Two pike blocks came on with levelled pikes "jabbing until they made contact", then pushed until one gave way; rear ranks added their weight; sometimes the blocks locked so tight that men fought in close melee, and both sides now and then agreed to a short rest before going on. The push "would continue until one of the opposing formations routed or fled", which is when the heavy losses came. The side with the longer pikes had the advantage (men who cut their pikes down for comfort regretted it). Rodeleros and Doppelsöldner were used to break a push. Battles: Arbedo 1422, Ravenna 1512, Novara 1513, Pavia 1525, Ceresole 1544, and in the British civil wars Stratton 1643, Inverlochy 1645, Torrington 1646, Benburb 1646, Dunbar 1650. |
| Machiavelli, *The Art of War* (1521), Book II ([marxists.org text](https://www.marxists.org/reference/archive/machiavelli/works/art-war/ch02.htm)) | Barletta (1503): the Spanish sword-and-buckler men, "aided by their spurs and the agility of their bodies, intermingled themselves with the Germans [...] so that they (the Germans) could not get near them with their swords; whence resulted the death of almost all of them." Ravenna (1512): "the Spanish infantry got as close as the reach of their swords to the German infantry", and would have destroyed it "if the German infantry had not been succored by the French Cavalry". Why: "the German cannot use the pike against the enemy who is next to him because of the length of the staff, so he must use the sword, which is useless to him, as he has no armor." |
| [Wikipedia, "Battle of Ravenna (1512)"](https://en.wikipedia.org/wiki/Battle_of_Ravenna_(1512)) (Oman, Taylor) | The landsknechts crossed the ditch of the Spanish camp and met Navarro's infantry hand to hand; at such close quarters they "were unable to defend themselves with long pikes", fell back across the trenches with over a thousand casualties, came again "with even greater casualties" (nine of their twelve captains killed or wounded, Oman), and the Spanish foot held until the French horse took it from all sides. The swordsmen got in where the pike block was already disordered, crossing a ditch and a bank, not against a formed wall on open ground; and it cost them their army once the horse came. |
| [Wikipedia, "Battle of Ceresole"](https://en.wikipedia.org/wiki/Battle_of_Ceresole) (Montluc) | When the two pike blocks met with shot hidden in their second ranks, "neither side fired till we were touching", then "the whole front rank on each side went down." The losses of a push fall on the front rank; it is the mixed arms (shot, halberds, swords) that make it deadly. Ours have none: two plain spear walls fence. |
| [Wikipedia, "Pike square"](https://en.wikipedia.org/wiki/Pike_square) | A formed pike block was "impossible to penetrate on horseback and dangerous to approach on foot" (Charles the Bold's experience of the Swiss); surrounded, its pikes pointed every way. |
| [Gunbai, "Sengoku Period Warfare, Part 3: Infantry tactics" (2018)](https://gunbai-militaryhistory.blogspot.com/2018/07/sengoku-period-warfare-part-3-infantry.html) | Ashigaru pike squadrons fought each other (*yarigarami*), each trying to break the other's line with the pike before the samurai charged in to destroy the broken unit: high risk, high reward. The ashigaru thrust and also beat the enemy's pikes with downward strikes (attested in the *Zōhyō monogatari*). Nagae-yari up to 8.2 m in the late period. Against horse, the *yaribusuma* wall of kneeling and standing ranks. |
| [The *Zōhyō monogatari*, summary (Samurai History and Culture)](https://samuraihistoryculture.substack.com/p/zohyo-monogatari) and [Turnbull, *Ashigaru 1467-1649* (Osprey Warrior 29)](https://www.ospreypublishing.com/us/ashigaru-14671649-9781472866288/) | The 17th-century foot soldier's primer (compiled 1657-83) taught the spear units (*yaritai*) to face the enemy on the front line "handling spears and guns as a platoon": the spears fight together, as a line. Turnbull's book covers the spear units' place in battle; its text was not read here (the publisher's page only), so nothing below rests on it alone. |
| [Wikipedia, "Yari"](https://en.wikipedia.org/wiki/Yari) and [Armstrong, "The Sliding Yari of the Owari Kan Ryu" (koryu.com)](https://koryu.com/library/harmstrong1) | Nagae-yari of 4.5 to 6.5 m were pikes, used by ashigaru in dense formations; the shaft slides through the front hand in the thrust (our yari's thrust, `samurai-blows-weapons.md`). |

## What we take

1. **Two spear walls fence at their points and push; casualties stay low until one side's
   cohesion fails.** Each man stands his foe off at `REACH.stand` (0.75) of his reach, so the two
   front ranks of Templar spears stand about 16 apart, the points in among the other front rank,
   and yari about 19. Spear on spear, front to front, a thrust lands 0.55 times as often
   (`REACH.fence`: the points are parried and beaten down, the yari's *tataki*). The killing
   comes when one side gives way (the chase), as before.
2. **The longer spear has the advantage**, and the yari's second rank strikes past the front
   (`REACH.support`: reach 17 and more; rows 1-2 strike a foe their point reaches from their
   place). The Templar spear (2.85 m) and the ghoul spear (2.6 m) do not: their second rank reaches
   only a foe come round to it or into a hole before it (0.45 of the reach).
3. **Shorter arms are held at the points.** A man whose reach is under 0.6 of a spear's, coming
   at the front of a formed spear block, comes no closer than its point (`held`, `pointLine`)
   and takes its thrusts while he cannot reply. A charge on foot runs onto the points and stops
   there (its impetus is spent before it lands, `impact`).
4. **He gets in only where the wall is broken**: a gap beside his spearman (a man of that rank
   down or out of his place: `gapBeside`, 0.2 a look), the block disordered (re-forming after a
   turn, `formedAt`; in column; running; the spearman reeling from a charge or hurt), the flank or
   rear (the points face the front), or rarely by luck (`REACH.luck` 0.03 a look, times one and
   his shield: the sword-and-buckler men of Barletta; the heaviest foot, Dane axes and naginata,
   three times as often, `REACH.breaker`, as the Doppelsöldner and halberdiers broke a push).
   Held, he does nothing but keep the points off: a thrust at him lands 0.4 as often
   (`REACH.heldHit`), so a push of pike on a shielded line is slow, not a slaughter. Once through he stays through while he is
   inside the point (`ps`, `REACH.through`).
5. **Once inside, the spearman is at a disadvantage** (Machiavelli): within 0.45 of his reach he
   strikes at -15 and defends at -8 (`REACH.insideAttack`, `insideDefence`), shortening his grip or
   drawing his sidearm. A spearman whose foe is too close and not through steps back to bring the
   point to bear; a held man who finds himself on the points steps back off them.
6. **Horse.** A charge still meets the brace and pike-wall rules (`impact`). Horse whose charge
   is spent is held at the points like any short arm (and pulls out hurt, RIDER), so it never
   walks through the spears. Lances are for the charge: in the mêlée a rider fights with the
   sword or a shortened spear (1.6 for all horse: a longer mêlée reach for the light horse, 5, had
   its riders strike from outside the press and spoiled the horse-against-horse rally and the
   collision rules).

## The reach table

Reach is world units beyond the two men's bodies (`rad + rad + reach`), from the drawn weapons
(a man is 14 units tall; `templar-blows-weapons.md`, `samurai-blows-weapons.md`,
`undead-blows-weapons.md`): the length of the weapon ahead of the fist, and about 2 for the fist
ahead of the body, less the man's own radius (2.3). Short arms keep the old body-to-body 1.6:
the figures are drawn 2-3 times life size and overlap at that distance already.

| Class | Templar | Samurai | Undead | From |
| --- | --- | --- | --- | --- |
| Spearmen | 16 | 19.5 | 13 | spear 14.2 + 2.0 ahead of the fist (22.8 in all, 2.85 m); nagae-yari 31 (3.6 m), held toward the butt in the push [E 19 ahead]; ghoul spear 13.5 ahead (21, 2.6 m) |
| Shock foot | 4 | 9 | 4 | Dane axe 11.4 two-handed; naginata 19.2 (2.3 m), swung from the middle; femur club 10.5 |
| Everyone else | 1.6 | 1.6 | 1.6 | swords (7, katana 6, gladius 5.5), all horse after the charge (lances 23-29 are for the charge: `impact`), archers' sidearms |

A spear is "long" from 9 (`REACH.long`); a man is held by a point if his reach is under 0.6 of
it (`REACH.short`): swords, axes, the colossus's club and horse by every spear; the naginata
only by the yari.

## Measured (scripts/reach-sanity.ts)

`npx tsx scripts/reach-sanity.ts --demo 6` against the sim before the change
(`--root` a checkout of it), seeds 3, 7, 11; 48 men a block; the 60 s after the first blow.
*gap*: median distance, centre to centre, from a front-rank man fighting to his foe. *inside*:
share of the men fighting a spearman who stand inside his point (closer than the two bodies and
half his reach). *lost*: share of each side dead 10 / 30 / 60 s after the first blow.

| Set piece | gap before | gap after | inside before | inside after | lost before (a; b) | lost after (a; b) |
|---|---|---|---|---|---|---|
| Templar spear vs spear | 4.8 | 16.0 | 93% | 8% | 15/29/50; 15/25/40 | 1/6/26; 1/7/27 |
| yari vs yari | 5.3 | 19.0 | 94% | 26% | 15/19/42; 12/21/39 | 9/31/41; 10/23/49 |
| yari vs Templar spear | 5.0 / 4.8 | 19.4 / 16.2 | 95% | 12% / 28% | 11/23/42; 15/21/38 | 3/10/28; 5/25/44 |
| sergeants vs spears standing | 4.8 | 11.9 | 95% | 57% | 6/6/22; 24/26/52 | 0/1/5; 3/21/40 |
| katana vs yari standing | 10.2 | 14.0 | 69% | 59% | 1/4/5; 26/34/48 | 8/11/29; 4/28/39 |
| sergeants vs spears re-forming | 5.4 | 10.5 | 84% | 65% | 3/3/17; 22/23/58 | 0/0/4; 19/22/56 |
| sergeants on front and flank | 9.7 | 11.6 | 69% | 58% | 0/0/0; 33/48/54 | 0/0/3; 9/26/42 |

Demo battles (450 a side, seeds 1-6): front gap long weapon on long 4.6 -> 12.9, long on short
4.9 -> 10.0, short on long 5.0 -> 9.6, short on short 5.6 -> 5.6 (unchanged); inside a spear's
point: long on long 97% -> 36%, short on long 94% -> 59% (the rest held at the points, or not yet
through). Losses in the first minute of the demo battles are as before (5/11/23% and 3/8/16%
against 5/11/24% and 3/8/20%): the reach moves who kills whom, not how fast the day goes.
The sergeants "inside" the spears' points in the set piece are mostly men who got in during the
minute (by gaps as the spearmen fall, by luck) and the ends of the line wrapping the spears' flank.
