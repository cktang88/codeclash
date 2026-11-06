# The yari guard: levelled for the push

Why the Yari Ashigaru's guard (the samurai `yari` Brace, `samurai-rig.ts`) holds the nagae-yari
level at the hip, and why the levelled grip sits further back on the shaft (`YARI.level`,
`samurai-static.ts`). Study copies only (`references/yari-guard/`, git-ignored); nothing committed.

## The problem (measured)

`npx tsx scripts/spear-reach.ts` paints each spear kind's guard and blows (HD, SE facing) and
measures how far ahead of the feet the point reaches, and how high it is, against the sim's reach
(battle v17, `weapon-reach.md`): the foe's front at the stand-off (`rad + reach * REACH.stand`) and at
full reach (`rad + reach`). Before:

| kind | guard reach (height) | thrust reach | sim: stand-off / full |
|---|---|---|---|
| Templar spear | 12.0-13.3 (10-14) | 18.5 | 14.3 / 18.3 |
| Yari ashigaru | 15.5-16.8 (**15-22**) | 19.5 | 16.9 / 21.8 |
| Ghoul spear | 14.5-15.8 (11-14) | 19.3 | 12.1 / 15.3 |

The yari's guard was the anti-horse set: 36° up, the point over a man's head (15-22 high on a
14-unit man) and held near the middle of the shaft (17.5 of its 29 behind the near hand). Two yari
walls fencing at 19 apart had their points crossing in the air above the other front rank, and the
thrust stopped 2.3 short of a foe at full reach.

## References

| Image | Licence | What we take |
|---|---|---|
| [Hōzōin-ryū Takada-ha Sōjutsu 3](https://commons.wikimedia.org/wiki/File:H%C5%8Dz%C5%8Din-ry%C5%AB_Takada-ha_S%C5%8Djutsu_3.jpg) (embu, Sydney) | CC BY-SA (Commons) | Two yari men facing: both shafts level at the hip, the points meeting halfway between them; rear hand at the hip near the butt, front hand well forward; low wide stance. This is the picture of two spears fencing at their points. |
| [Hōzōin-ryū Takada-ha Sōjutsu 1](https://commons.wikimedia.org/wiki/File:H%C5%8Dz%C5%8Din-ry%C5%AB_Takada-ha_S%C5%8Djutsu_1.jpg) | CC BY-SA (Commons) | The yari carried forward and low, the point below the waist; the shaft runs from the hip, most of it ahead of the man. |
| [Hōzōin-ryū Takada-ha Sōjutsu 2](https://commons.wikimedia.org/wiki/File:H%C5%8Dz%C5%8Din-ry%C5%AB_Takada-ha_S%C5%8Djutsu_2.jpg) | CC BY-SA (Commons) | At rest the shaft slopes across the body; the guard is what levels it. |
| [Nami chūgen and yari-katsugi](https://commons.wikimedia.org/wiki/File:Nami_Chugen_and_Yari_Katsugi.jpg) (Edo illustration of foot servants) | public domain | The spear held level at the waist in both hands, the forearms near horizontal, the point forward at belly height. |
| [Battle of Nagashino](https://commons.wikimedia.org/wiki/File:Battle_of_Nagashino.jpg) (Edo-period screen) | public domain | The foot spearmen fight with their spears level or a little down, thrusting at the bodies of the men in front; spears upright only on the march and in the rear. |

## What changed

- The `yari` guard: both hands at the hip (`upperArmN` -2, `forearmN` 72), the hand along the shaft
  and the shaft at 100° (10° up): the point at a man's chest (6-14 units high through the guard's
  sway), and a horse's.
- `YARI.level` 17.5 -> 14: levelled, the hands hold the shaft 14 from the butt (of 29), as the
  sōjutsu pair hold it, so 17 of it and the head reach ahead.
- The blows' last frames come back to the level guard (thrust frame 10 at 104°, not raised to 140°),
  and from behind (NE, where the near hand is a step further forward) the shaft slides less through
  the hand in the thrust and harai and is gripped a little shorter in the beat, so the point stays
  inside the 46-unit canvas (at most 22.5 of its 23).

After: guard 16.0-18.0 (height 6-14), thrusts 22.3 / 20.0 / 22.0: the guard's point at the foe's
front rank at the stand-off, the thrust at a foe at full reach. The sim's reach (19.5) is kept.
